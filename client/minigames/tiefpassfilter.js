// Mini-Spiel Tiefpassfilter (Themenfeld 2, Station Sensorik).
// Ziel: die Grenzfrequenz f_c = 1 / (2*pi*R*C) auf die Zielmarke bringen. Die
// Kapazitaet C baut man dabei aus zwei Kondensatoren in Reihe oder parallel auf
// (Reihe: C1*C2/(C1+C2), parallel: C1+C2) - das verlangt die Bauteilkunde, nicht
// nur das Schieben eines Werts. Die Live-Kurve bleibt als Bediengefuehl, die
// Bewertung "im Band" erscheint erst nach dem Bestaetigen.
// generate() und validate() sind DOM-frei, damit der Server sie pruefen kann.

import { pick, randomInt } from "../../shared/rng.js";

// Diskrete Bauteilreihen, damit Zielfrequenzen exakt erreichbar bleiben.
const R_SERIES = [220, 470, 1000, 2200, 4700, 10000, 22000]; // Ohm
const C_SERIES = [10e-9, 22e-9, 47e-9, 100e-9, 220e-9, 470e-9, 1e-6]; // Farad
const MODES = ["reihe", "parallel"];
const BAND = [120, 8000]; // sinnvoller Zielbereich in Hertz

function cutoff(r, c) {
  return 1 / (2 * Math.PI * r * c);
}
// Kombinierte Kapazitaet zweier Kondensatoren.
function combineC(c1, c2, mode) {
  return mode === "parallel" ? c1 + c2 : (c1 * c2) / (c1 + c2);
}

// Alle erreichbaren Kombinationen, deren Grenzfrequenz im Zielband liegt.
// Konstant und damit auf Server und Client identisch.
const IN_BAND = [];
for (const r of R_SERIES) {
  for (const c1 of C_SERIES) {
    for (const c2 of C_SERIES) {
      for (const mode of MODES) {
        const f = cutoff(r, combineC(c1, c2, mode));
        if (f >= BAND[0] && f <= BAND[1]) IN_BAND.push({ r, c1, c2, mode, f });
      }
    }
  }
}

function formatR(r) {
  return r >= 1000 ? `${r / 1000} kΩ` : `${r} Ω`;
}
function formatC(c) {
  if (c >= 1e-6) return `${+(c * 1e6).toFixed(3)} µF`;
  return `${+(c * 1e9).toFixed(1)} nF`;
}
function formatFreq(f) {
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(0)} Hz`;
}
function modeLabel(mode) {
  return mode === "parallel" ? "parallel" : "Reihe";
}

export default {
  id: "tiefpassfilter",
  station: "Sensorik",
  // Kurzanleitung fuer die Anleitungskarte vor dem Spielen (DOM-frei, nur Text).
  howto: {
    goal: "Baue die Kapazität aus zwei Kondensatoren (Reihe oder parallel) und triff damit die Grenzfrequenz auf der Zielmarke.",
    example: "Beispiel: zwei gleiche Kondensatoren parallel ergeben die doppelte Kapazität.",
  },

  generate(level, rng) {
    const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;
    // Stufe steuert Toleranz und ob R fest ist oder mitgewaehlt wird.
    const tolerance = lvl === 1 ? 0.2 : lvl === 2 ? 0.12 : 0.06;
    const adjust = { r: lvl >= 2 };

    const target = pick(rng, IN_BAND);
    const targetFc = target.f;
    const rOptions = R_SERIES.slice();
    const cOptions = C_SERIES.slice();

    // Startwerte bewusst neben dem Ziel, damit es etwas zu bauen gibt.
    let startC1 = cOptions[randomInt(rng, 0, cOptions.length - 1)];
    let startC2 = cOptions[randomInt(rng, 0, cOptions.length - 1)];
    let startMode = MODES[randomInt(rng, 0, MODES.length - 1)];
    let startR = adjust.r ? rOptions[randomInt(rng, 0, rOptions.length - 1)] : target.r;
    // C1 deterministisch verschieben, bis die Startkombination ausserhalb der Toleranz liegt.
    for (let guard = 0; guard < cOptions.length; guard++) {
      const f = cutoff(startR, combineC(startC1, startC2, startMode));
      if (Math.abs(f - targetFc) / targetFc > tolerance) break;
      startC1 = cOptions[(cOptions.indexOf(startC1) + 1) % cOptions.length];
    }

    return {
      prompt: "Baue die Kapazität aus zwei Kondensatoren und triff die Grenzfrequenz, damit nur das tiefe Signal durchkommt.",
      level: lvl,
      tolerance,
      adjust,
      targetFc,
      rFixed: target.r, // bei Stufe 1 der feste Widerstand
      rOptions,
      cOptions,
      modes: MODES,
      startR,
      startC1,
      startC2,
      startMode,
      fMin: targetFc / 40,
      fMax: targetFc * 40,
    };
  },

  validate(task, input) {
    const r = Number(input && input.r);
    const c1 = Number(input && input.c1);
    const c2 = Number(input && input.c2);
    const mode = input && input.mode;
    if (!(r > 0) || !(c1 > 0) || !(c2 > 0) || !MODES.includes(mode)) {
      return { geloest: false, teiltreffer: 0, hinweis: "R, beide Kondensatoren und die Schaltung wählen." };
    }
    const fc = cutoff(r, combineC(c1, c2, mode));
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

  // Liefert eine korrekte Eingabe (DOM-frei): die R/C1/C2/Modus-Kombination, deren
  // Grenzfrequenz dem Ziel am naechsten kommt. Genutzt von Bots und Tests.
  solve(task) {
    const rs = task.adjust.r ? task.rOptions : [task.rFixed];
    let best = null;
    for (const r of rs) {
      for (const c1 of task.cOptions) {
        for (const c2 of task.cOptions) {
          for (const mode of task.modes) {
            const err = Math.abs(cutoff(r, combineC(c1, c2, mode)) - task.targetFc);
            if (!best || err < best.err) best = { r, c1, c2, mode, err };
          }
        }
      }
    }
    return { r: best.r, c1: best.c1, c2: best.c2, mode: best.mode };
  },

  mount(root, task, ctx) {
    let r = task.startR;
    let c1 = task.startC1;
    let c2 = task.startC2;
    let mode = task.startMode;
    let committed = false; // Toleranzband und Urteil erst nach dem Bestaetigen

    root.innerHTML =
      `<h1 class="title">Sensorik</h1>` +
      `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
      `<canvas class="tp-canvas"></canvas>` +
      `<div class="tp-readout"><span>Grenzfrequenz <b class="tp-fc">…</b></span>` +
      `<span>C gesamt <b class="tp-ctot">…</b></span>` +
      `<span>Ziel <b class="tp-target">${formatFreq(task.targetFc)}</b></span></div>` +
      `<div class="tp-controls"></div>` +
      `<div class="tp-mode"><span class="tp-row-label">C</span></div>` +
      `<div class="bc-hint tp-hint">Baue C aus C1 und C2, dann bestätigen. Ein Fehlversuch kostet Stabilität.</div>` +
      `<button class="bc-confirm">Bestätigen</button>`;

    const canvas = root.querySelector(".tp-canvas");
    const cctx = canvas.getContext("2d");
    const controls = root.querySelector(".tp-controls");
    const modeBox = root.querySelector(".tp-mode");
    const fcEl = root.querySelector(".tp-fc");
    const ctotEl = root.querySelector(".tp-ctot");
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

      const ctot = combineC(c1, c2, mode);
      const fc = cutoff(r, ctot);
      const pad = 10;
      const plotH = h - 2 * pad;

      cctx.fillStyle = cssVar("--bg-void", "#0d0e10");
      cctx.fillRect(0, 0, w, h);

      // Toleranzband erst nach dem Bestaetigen (die Bewertung kommt nach dem Commit).
      if (committed) {
        const bx0 = xOf(task.targetFc * (1 - task.tolerance), w);
        const bx1 = xOf(task.targetFc * (1 + task.tolerance), w);
        cctx.globalAlpha = 0.16;
        cctx.fillStyle = cssVar("--status-stable", "#9bbf6a");
        cctx.fillRect(bx0, 0, Math.max(2, bx1 - bx0), h);
        cctx.globalAlpha = 1;
      }

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
      ctotEl.textContent = formatC(ctot);
    }

    // Eine Bedienung verlaesst die bestaetigte Ansicht (Band wieder verborgen).
    function touched() {
      if (committed) {
        committed = false;
        confirmEl.textContent = "Bestätigen";
      }
      confirmEl.disabled = false;
      draw();
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
        touched();
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
    addSlider("C1", task.cOptions, c1, formatC, (val) => { c1 = val; });
    addSlider("C2", task.cOptions, c2, formatC, (val) => { c2 = val; });

    // Schaltung der beiden Kondensatoren: Reihe oder parallel.
    task.modes.forEach((m) => {
      const btn = document.createElement("button");
      btn.className = "tp-mode-btn";
      btn.textContent = modeLabel(m);
      btn.classList.toggle("sel", m === mode);
      btn.addEventListener("click", () => {
        mode = m;
        ctx.audio.play("ui.toggle");
        modeBox.querySelectorAll(".tp-mode-btn").forEach((x) => x.classList.toggle("sel", x === btn));
        touched();
      });
      modeBox.appendChild(btn);
    });

    confirmEl.addEventListener("click", () => {
      ctx.audio.play("ui.confirm");
      confirmEl.disabled = true; // bis die Antwort des Servers da ist
      ctx.submit({ r, c1, c2, mode });
    });

    window.addEventListener("resize", draw);
    draw();

    return {
      unmount() {
        window.removeEventListener("resize", draw);
        root.innerHTML = "";
      },
      onResult(res) {
        // Jetzt die Bewertung zeigen: Toleranzband einblenden, Urteil als Hinweis.
        committed = true;
        draw();
        if (res.hinweis) hintEl.textContent = res.geloest ? res.hinweis : `${res.hinweis} Fehlversuch kostet Stabilität.`;
        if (res.geloest) {
          confirmEl.textContent = "Abgestimmt";
          confirmEl.disabled = true;
        } else {
          confirmEl.disabled = false;
        }
      },
    };
  },
};
