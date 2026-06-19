// Mini-Spiel Reaktor (Themenfeld 2, kooperative Station). Zwei Personen
// kalibrieren gemeinsam eine kapazitive Reaktanz Xc = 1 / (2*pi*f*C) auf einen
// Zielwert. Der Operator stellt die Kapazitaet C, der Co-Pilot die Frequenz f.
// Niemand sieht den Wert der anderen Person, beide sehen Ziel und Naehe (Match) –
// dieser Informationsspalt zwingt zum Reden. Es gibt keine Bestaetigung mehr:
// halten beide den kombinierten Wert kurz im Zielband, rastet die Kalibrierung von
// selbst ein (Hold-to-Lock, nach dem Vorbild des SOS-Schiebers).
//
// Anders als die Einzelspiele haelt den eigentlichen Zustand der Server (beide
// Reglerwerte je Station, dazu die Haltezeit). generate/validate/solve/solveFor
// bleiben DOM-frei, damit der Server die Reaktanz autoritativ nachrechnen kann;
// nur mount nutzt das Document. Die Regler liefern eine normierte Position 0..1,
// die generate-Bereiche bilden sie auf C bzw. f ab.

import { pick } from "../../shared/rng.js";

const TWO_PI = Math.PI * 2;
const C_MIN = 1e-9,
  C_MAX = 1e-6; // 1 nF .. 1 µF
const F_MIN = 100,
  F_MAX = 100000; // 100 Hz .. 100 kHz
// Runde Zielreaktanzen, alle im erreichbaren Bereich (f ist stufenlos, daher
// fuer jedes C exakt treffbar). Themennah an die E-Reihe angelehnt.
const TARGETS = [120, 220, 470, 1000, 2200, 4700]; // Ohm

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mapLog = (p, vmin, vmax) => vmin * Math.pow(vmax / vmin, clamp01(p));
const invLog = (v, vmin, vmax) => Math.log(v / vmin) / Math.log(vmax / vmin);
const reactance = (f, c) => 1 / (TWO_PI * f * c);

function formatOhm(x) {
  if (x >= 1000) return `${(x / 1000).toFixed(2)} kΩ`;
  return `${x.toFixed(0)} Ω`;
}
function formatC(c) {
  if (c >= 1e-6) return `${+(c * 1e6).toFixed(2)} µF`;
  return `${+(c * 1e9).toFixed(1)} nF`;
}
function formatF(f) {
  if (f >= 1000) return `${(f / 1000).toFixed(2)} kHz`;
  return `${f.toFixed(0)} Hz`;
}

export default {
  id: "reaktor",
  station: "Reaktor",
  coop: true,

  generate(level, rng) {
    const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;
    // Stufe steuert die Toleranz: enger wird es schwerer. Bewusst grosszuegig, damit
    // blinde Koordination ueber Reden und Peilton ohne Kopfrechnen gelingt
    // (Stufe 1 klar weit, Stufe 3 eng, aber fair).
    const tolerance = lvl === 1 ? 0.16 : lvl === 2 ? 0.11 : 0.07;
    const targetX = pick(rng, TARGETS);
    return {
      prompt: "Kalibriert gemeinsam die Reaktanz auf den Zielwert. Sprecht euch ab – jede Person sieht nur den eigenen Regler.",
      level: lvl,
      tolerance,
      targetX,
      cMin: C_MIN,
      cMax: C_MAX,
      fMin: F_MIN,
      fMax: F_MAX,
    };
  },

  // Prueft die beiden Reglerpositionen gegen das Ziel. Liefert die Naehe (match),
  // ob im Zielband, und den Istwert. Ob die Station einrastet, entscheidet der
  // Server ueber die gehaltene Zeit im Band (Hold-to-Lock); instantan gilt
  // geloest = inBand.
  validate(task, input) {
    const a = Number(input && input.a);
    const b = Number(input && input.b);
    if (!(a >= 0 && a <= 1) || !(b >= 0 && b <= 1)) {
      return { geloest: false, inBand: false, teiltreffer: 0, actual: 0, hinweis: "Beide Regler setzen." };
    }
    const c = mapLog(a, task.cMin, task.cMax);
    const f = mapLog(b, task.fMin, task.fMax);
    const X = reactance(f, c);
    const relErr = Math.abs(X - task.targetX) / task.targetX;
    const inBand = relErr <= task.tolerance;
    // Naehe als log-Abstand: innerhalb einer Dekade entsteht ein sanfter Verlauf.
    const dist = Math.abs(Math.log10(X / task.targetX));
    const teiltreffer = Math.max(0, Math.min(1, 1 - dist));
    let hinweis;
    if (inBand) hinweis = "Reaktanz im Zielband.";
    else if (X > task.targetX) hinweis = "Reaktanz noch zu hoch.";
    else hinweis = "Reaktanz noch zu niedrig.";
    return { geloest: inBand, inBand, teiltreffer, actual: X, hinweis };
  },

  // Eine gueltige Loesung als Reglerpaar (DOM-frei). Genutzt vom Solo-Bot.
  solve(task) {
    const fMid = Math.sqrt(task.fMin * task.fMax);
    let c = 1 / (TWO_PI * fMid * task.targetX);
    let a = invLog(c, task.cMin, task.cMax);
    if (a < 0 || a > 1) {
      a = clamp01(a);
      const cc = mapLog(a, task.cMin, task.cMax);
      const f = 1 / (TWO_PI * cc * task.targetX);
      return { a, b: clamp01(invLog(f, task.fMin, task.fMax)) };
    }
    return { a, b: clamp01(invLog(fMid, task.fMin, task.fMax)) };
  },

  // Die Reglerposition fuer den eigenen Parameter, die das Ziel trifft, wenn die
  // andere Seite ihren Wert haelt (DOM-frei). Genutzt von den Bots, die sich so
  // schrittweise auf die Ziellinie zubewegen.
  solveFor(task, partner, param) {
    if (param === "a") {
      const f = mapLog(partner, task.fMin, task.fMax);
      const c = 1 / (TWO_PI * f * task.targetX);
      return clamp01(invLog(c, task.cMin, task.cMax));
    }
    const c = mapLog(partner, task.cMin, task.cMax);
    const f = 1 / (TWO_PI * c * task.targetX);
    return clamp01(invLog(f, task.fMin, task.fMax));
  },

  mount(root, task, ctx) {
    // Rolle bestimmt das eigene Bauteil; im Solo-Fall (nur eine Person an der
    // Station) sind beide Regler bedienbar. Solo erfaehrt mount erst zur Laufzeit
    // ueber onState; bis dahin zeigt es den rollenrichtigen Regler.
    let solo = false;
    let beepTimer = null;
    let stopped = false;
    let lastMatch = 0;
    let wasLocked = false;

    // Match-Wert, ab dem das Zielband beginnt (rechtes, nahes Ende der Leiste).
    // Der untere Bandrand liegt im Log-Abstand weiter weg, daher zaehlt 1-tol.
    const bandEdge = clamp01(1 + Math.log10(1 - task.tolerance));

    root.innerHTML =
      `<h1 class="title">Reaktor</h1>` +
      `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
      `<div class="rk-target">Ziel-Reaktanz <b class="rk-target-val">${formatOhm(task.targetX)}</b></div>` +
      `<div class="rk-state">Justieren …</div>` +
      `<div class="rk-match"><div class="rk-match-fill"></div><div class="rk-band"></div></div>` +
      `<div class="rk-lock"><div class="rk-lock-ring"><div class="rk-lock-core">halten</div></div></div>` +
      `<div class="rk-controls"></div>` +
      `<div class="rk-partner"></div>` +
      `<div class="bc-hint rk-hint">Sprecht euch ab und haltet die Reaktanz im Zielband, bis sie einrastet.</div>`;

    const targetEl = root.querySelector(".rk-target-val");
    const fill = root.querySelector(".rk-match-fill");
    const bandEl = root.querySelector(".rk-band");
    const stateEl = root.querySelector(".rk-state");
    const partnerEl = root.querySelector(".rk-partner");
    const controls = root.querySelector(".rk-controls");
    const ringEl = root.querySelector(".rk-lock-ring");
    const coreEl = root.querySelector(".rk-lock-core");
    const hintEl = root.querySelector(".rk-hint");

    // Zielband als heller Bereich am rechten (nahen) Ende der Match-Leiste, mit
    // gestrichelter Kante als klarer Marker, wo das Band beginnt.
    bandEl.style.left = `${(bandEdge * 100).toFixed(1)}%`;

    // Reglerzeile: grosser Schieber, Wertanzeige, Bauteilname.
    function makeSlider(param, label, fmt) {
      const row = document.createElement("label");
      row.className = "rk-row";
      row.dataset.param = param;
      row.innerHTML =
        `<span class="rk-row-label">${label}</span>` +
        `<input type="range" min="0" max="1000" step="1" value="500">` +
        `<b class="rk-row-val">${fmt(param === "a" ? mapLog(0.5, task.cMin, task.cMax) : mapLog(0.5, task.fMin, task.fMax))}</b>`;
      const range = row.querySelector("input");
      const valEl = row.querySelector(".rk-row-val");
      range.addEventListener("input", () => {
        const v = Number(range.value) / 1000;
        valEl.textContent = fmt(param === "a" ? mapLog(v, task.cMin, task.cMax) : mapLog(v, task.fMin, task.fMax));
        ctx.audio.play("ui.toggle");
        ctx.coopInput(param, v);
      });
      controls.appendChild(row);
      return { row, range, valEl };
    }

    const cSlider = makeSlider("a", "C", formatC);
    const fSlider = makeSlider("b", "f", formatF);

    // In der Paar-Ansicht nur den eigenen Regler zeigen.
    function applyVisibility() {
      cSlider.row.style.display = solo || ctx.role === "operator" ? "" : "none";
      fSlider.row.style.display = solo || ctx.role !== "operator" ? "" : "none";
    }
    applyVisibility();

    // Wiederkehrender Peilton: je naeher am Ziel, desto dichter die Folge. Der
    // Loop laeuft selbststaendig weiter und liest jeweils den aktuellen Match
    // (onState setzt nur lastMatch, taktet den Ton aber nicht zurueck).
    function beepLoop() {
      if (stopped) return;
      let delay = 400; // Ruhetakt, solange weit weg
      if (lastMatch >= 0.5) {
        ctx.audio.play("reaktor.tune");
        delay = Math.max(120, 700 - (lastMatch - 0.5) * 2 * 560); // 700 ms .. 120 ms
      }
      beepTimer = setTimeout(beepLoop, delay);
    }
    beepLoop();

    // Einrast-Ring: fuellt sich, solange im Band gehalten wird (0..1), und schlaegt
    // beim Einrasten auf das stabile Gruen um.
    function setRing(hold, locked) {
      const deg = Math.round(clamp01(hold) * 360);
      const color = locked ? "var(--status-stable)" : "var(--accent-cyan)";
      ringEl.style.background = `conic-gradient(${color} ${deg}deg, var(--bg-panel-2) ${deg}deg)`;
      ringEl.classList.toggle("locked", !!locked);
    }

    // Lebende Werte kommen aus dem Server-Zustand (Match und Haltezeit haengen am
    // verborgenen Partnerwert, deshalb rechnet der Client sie nicht selbst).
    function onState(state) {
      const co = state && state.coop;
      if (!co) return;
      if (co.solo !== solo) {
        solo = co.solo;
        applyVisibility();
      }
      targetEl.textContent = formatOhm(co.target);
      const pct = Math.round(co.match * 100);
      fill.style.width = `${pct}%`;
      fill.style.background = co.inBand ? "var(--status-stable)" : pct > 60 ? "var(--accent-yellow)" : "var(--accent-cyan)";

      const locked = !!co.locked;
      if (locked) {
        stateEl.textContent = "Kalibriert ✓";
        stateEl.style.color = "var(--status-stable)";
      } else if (co.inBand) {
        stateEl.textContent = "Im Zielband – halten!";
        stateEl.style.color = "var(--status-stable)";
      } else if (co.actual > co.target) {
        stateEl.textContent = "Reaktanz zu hoch";
        stateEl.style.color = "var(--accent-yellow)";
      } else {
        stateEl.textContent = "Reaktanz zu niedrig";
        stateEl.style.color = "var(--accent-yellow)";
      }

      const hold = locked ? 1 : co.hold || 0;
      setRing(hold, locked);
      coreEl.textContent = locked ? "rastet" : co.inBand ? "halten …" : "Band suchen";

      // Ton genau im Moment des Einrastens (schwerer Verschluss).
      if (locked && !wasLocked) ctx.audio.play("ui.confirm");
      wasLocked = locked;

      // Partner-Anwesenheit anzeigen (nicht den Wert – der Spalt bleibt).
      if (co.solo) partnerEl.textContent = "Solo-Betrieb";
      else if (!co.partnerPresent) partnerEl.textContent = "Partner fehlt …";
      else partnerEl.textContent = "Partner verbunden";
      partnerEl.style.color = !co.solo && co.partnerPresent ? "var(--status-stable)" : "var(--text-muted)";

      lastMatch = co.match;
    }

    return {
      onState,
      onResult(res) {
        hintEl.textContent = res.hinweis || hintEl.textContent;
      },
      unmount() {
        stopped = true;
        clearTimeout(beepTimer);
        root.innerHTML = "";
      },
    };
  },
};
