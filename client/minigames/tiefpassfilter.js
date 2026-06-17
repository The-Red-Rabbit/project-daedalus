// Mini-Spiel Tiefpassfilter (Themenfeld 2, Station Sensorik).
// Ziel: R und C so waehlen, dass die Grenzfrequenz f_c = 1 / (2*pi*R*C) die
// Zielmarke trifft. Sichtbar wird das ueber eine Amplituden-Frequenz-Kurve:
// die Kante (Knie) der Kurve auf die Marke schieben.
// generate() und validate() sind DOM-frei, damit der Server sie pruefen kann.

import { pick, randomInt } from "../../shared/rng.js";

// Diskrete Bauteilreihen, damit Zielfrequenzen exakt erreichbar bleiben.
const R_SERIES = [220, 470, 1000, 2200, 4700, 10000, 22000]; // Ohm
const C_SERIES = [10e-9, 22e-9, 47e-9, 100e-9, 220e-9, 470e-9, 1e-6]; // Farad
const BAND = [120, 8000]; // sinnvoller Zielbereich in Hertz

function cutoff(r, c) {
  return 1 / (2 * Math.PI * r * c);
}

// Alle Kombinationen, deren Grenzfrequenz im Zielband liegt. Konstant und
// damit auf Server und Client identisch.
const IN_BAND = [];
for (const r of R_SERIES) {
  for (const c of C_SERIES) {
    const f = cutoff(r, c);
    if (f >= BAND[0] && f <= BAND[1]) IN_BAND.push({ r, c, f });
  }
}

function formatR(r) {
  return r >= 1000 ? `${r / 1000} kΩ` : `${r} Ω`;
}
function formatC(c) {
  if (c >= 1e-6) return `${+(c * 1e6).toFixed(3)} µF`;
  return `${+(c * 1e9).toFixed(0)} nF`;
}
function formatFreq(f) {
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(0)} Hz`;
}

export default {
  id: "tiefpassfilter",
  station: "Sensorik",

  generate(level, rng) {
    const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;
    // Stufe steuert Toleranz und ob nur C oder R und C verstellbar sind.
    const tolerance = lvl === 1 ? 0.2 : lvl === 2 ? 0.12 : 0.06;
    const adjust = { r: lvl >= 2, c: true };

    const target = pick(rng, IN_BAND);
    const targetFc = target.f;
    const rOptions = R_SERIES.slice();
    const cOptions = C_SERIES.slice();

    // Startwerte bewusst neben dem Ziel, damit es etwas einzustellen gibt.
    const cAnswer = cOptions.indexOf(target.c);
    let startC = cOptions[(cAnswer + 1 + randomInt(rng, 0, cOptions.length - 2)) % cOptions.length];
    let startR = target.r;
    if (adjust.r) {
      const rAnswer = rOptions.indexOf(target.r);
      startR = rOptions[(rAnswer + 1 + randomInt(rng, 0, rOptions.length - 2)) % rOptions.length];
    }
    // Falls R und C zusammen zufaellig schon im Ziel liegen, C deterministisch
    // verschieben, bis die Startkombination ausserhalb der Toleranz liegt.
    for (let guard = 0; guard < cOptions.length; guard++) {
      if (Math.abs(cutoff(startR, startC) - targetFc) / targetFc > tolerance) break;
      startC = cOptions[(cOptions.indexOf(startC) + 1) % cOptions.length];
    }

    return {
      prompt: "Stelle den Sensorfilter so ein, dass nur das tiefe Signal durchkommt.",
      level: lvl,
      tolerance,
      adjust,
      targetFc,
      rFixed: target.r, // bei Stufe 1 der feste Widerstand
      rOptions,
      cOptions,
      startR,
      startC,
      fMin: targetFc / 40,
      fMax: targetFc * 40,
    };
  },

  validate(task, input) {
    const r = Number(input && input.r);
    const c = Number(input && input.c);
    if (!(r > 0) || !(c > 0)) {
      return { geloest: false, teiltreffer: 0, hinweis: "Werte für R und C wählen." };
    }
    const fc = cutoff(r, c);
    const relErr = Math.abs(fc - task.targetFc) / task.targetFc;
    const geloest = relErr <= task.tolerance;
    // Naehe als log-Abstand, damit die Rueckmeldung der Kurve folgt.
    const span = Math.log10(task.fMax / task.targetFc);
    const dist = Math.abs(Math.log10(fc) - Math.log10(task.targetFc));
    const teiltreffer = Math.max(0, Math.min(1, 1 - dist / span));
    let hinweis;
    if (geloest) hinweis = "Filter abgestimmt.";
    else if (fc > task.targetFc) hinweis = "Die Grenzfrequenz ist noch zu hoch.";
    else hinweis = "Die Grenzfrequenz ist noch zu niedrig.";
    return { geloest, teiltreffer, hinweis };
  },

  mount(root, task, ctx) {
    let r = task.startR;
    let c = task.startC;

    root.innerHTML =
      `<h1 class="title">Sensorik</h1>` +
      `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
      `<canvas class="tp-canvas"></canvas>` +
      `<div class="tp-readout"><span>Grenzfrequenz <b class="tp-fc">…</b></span>` +
      `<span>Ziel <b class="tp-target">${formatFreq(task.targetFc)}</b></span></div>` +
      `<div class="tp-controls"></div>` +
      `<div class="bc-hint tp-hint">Schiebe die Kante der Kurve auf die gelbe Marke.</div>` +
      `<button class="bc-confirm">Bestätigen</button>`;

    const canvas = root.querySelector(".tp-canvas");
    const cctx = canvas.getContext("2d");
    const controls = root.querySelector(".tp-controls");
    const fcEl = root.querySelector(".tp-fc");
    const hintEl = root.querySelector(".tp-hint");
    const confirmEl = root.querySelector(".bc-confirm");

    const cssVar = (name, fb) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    };
    const logF = (f) => Math.log10(f);
    const xOf = (f, w) => ((logF(f) - logF(task.fMin)) / (logF(task.fMax) - logF(task.fMin))) * w;
    const amp = (f, fc) => 1 / Math.sqrt(1 + (f / fc) * (f / fc));

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 300;
      const h = 170;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.height = `${h}px`;
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const fc = cutoff(r, c);
      const pad = 10;
      const plotH = h - 2 * pad;

      cctx.fillStyle = cssVar("--bg-void", "#0d0e10");
      cctx.fillRect(0, 0, w, h);

      // Toleranzband um die Zielfrequenz (das Ziel: Knie ins Band schieben).
      const bx0 = xOf(task.targetFc * (1 - task.tolerance), w);
      const bx1 = xOf(task.targetFc * (1 + task.tolerance), w);
      cctx.globalAlpha = 0.16;
      cctx.fillStyle = cssVar("--status-stable", "#9bbf6a");
      cctx.fillRect(bx0, 0, Math.max(2, bx1 - bx0), h);
      cctx.globalAlpha = 1;

      // Zielmarke.
      const tx = xOf(task.targetFc, w);
      cctx.strokeStyle = cssVar("--accent-yellow", "#f2c014");
      cctx.lineWidth = 1.5;
      cctx.beginPath();
      cctx.moveTo(tx, 0);
      cctx.lineTo(tx, h);
      cctx.stroke();

      // Amplitudengang des Tiefpasses.
      cctx.strokeStyle = cssVar("--accent-cyan", "#36d0e0");
      cctx.lineWidth = 2;
      cctx.beginPath();
      const a = logF(task.fMin);
      const b = logF(task.fMax);
      for (let px = 0; px <= w; px += 2) {
        const f = Math.pow(10, a + (px / w) * (b - a));
        const y = pad + (1 - amp(f, fc)) * plotH;
        if (px === 0) cctx.moveTo(px, y);
        else cctx.lineTo(px, y);
      }
      cctx.stroke();

      // Knie der Kurve bei f_c (Amplitude ca. 0,707).
      cctx.fillStyle = cssVar("--accent-cyan", "#36d0e0");
      cctx.beginPath();
      cctx.arc(xOf(fc, w), pad + (1 - 0.7071) * plotH, 4, 0, Math.PI * 2);
      cctx.fill();

      fcEl.textContent = formatFreq(fc);
    }

    function addSlider(label, options, current, fmt, onPick) {
      const idx0 = Math.max(0, options.indexOf(current));
      const row = document.createElement("label");
      row.className = "tp-row";
      row.innerHTML =
        `<span class="tp-row-label">${label}</span>` +
        `<input type="range" min="0" max="${options.length - 1}" step="1" value="${idx0}">` +
        `<b class="tp-row-val">${fmt(options[idx0])}</b>`;
      const range = row.querySelector("input");
      const valEl = row.querySelector(".tp-row-val");
      let lastIdx = idx0;
      range.addEventListener("input", () => {
        const i = Number(range.value);
        valEl.textContent = fmt(options[i]);
        if (i !== lastIdx) {
          ctx.audio.play("ui.toggle");
          lastIdx = i;
        }
        onPick(options[i]);
        draw();
      });
      controls.appendChild(row);
    }

    if (task.adjust.r) {
      addSlider("R", task.rOptions, r, formatR, (val) => { r = val; });
    } else {
      const fixed = document.createElement("div");
      fixed.className = "tp-fixed";
      fixed.innerHTML = `<span class="tp-row-label">R</span><b>${formatR(task.rFixed)}</b> <span class="muted">(fest)</span>`;
      controls.appendChild(fixed);
    }
    addSlider("C", task.cOptions, c, formatC, (val) => { c = val; });

    confirmEl.addEventListener("click", () => {
      ctx.audio.play("ui.confirm");
      ctx.submit({ r, c });
    });

    window.addEventListener("resize", draw);
    draw();

    return {
      unmount() {
        window.removeEventListener("resize", draw);
        root.innerHTML = "";
      },
      onResult(res) {
        if (res.hinweis) hintEl.textContent = res.hinweis;
        if (res.geloest) {
          confirmEl.textContent = "Abgestimmt";
          confirmEl.disabled = true;
        }
      },
    };
  },
};
