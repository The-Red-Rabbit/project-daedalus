// Mini-Spiel „Filter auswählen" (Themenfeld 2, Station Sensorik).
// Ersetzt tiefpassfilter.js. Stufe 1: Filtertyp zum Frequenzband wählen.
// Stufe 2: zusätzlich den Kondensatorwert wählen (fc ≈ 0,16 / (R·C)).
// Stufe 3: Bandpass mit unterer und oberer Grenzfrequenz dimensionieren.
// generate() und validate() sind DOM-frei, damit der Server sie prüfen kann.

import { pick } from "../../shared/rng.js";

// Faustformel: fc ≈ 0,16 / (R·C) – kein 2·π nötig, damit kopfrechenbar bleibt.
const FC_APPROX = 0.16;

// Frequenzbänder des Asteroidensignals und der zugehörige Filtertyp.
const BANDS = [
  { id: "niedrig", label: "Niedrig (< 500 Hz)",      filterType: "Tiefpass" },
  { id: "mittel",  label: "Mittel (500 Hz – 5 kHz)", filterType: "Bandpass" },
  { id: "hoch",    label: "Hoch (> 5 kHz)",           filterType: "Hochpass" },
];

const FILTER_TYPES = ["Tiefpass", "Bandpass", "Hochpass"];

// Bauteilwerte in Zehnerstufen: 1 kΩ / 10 kΩ und 1 µF / 100 nF / 10 nF / 1 nF.
const R_OPTIONS = [1000, 10000];
const C_OPTIONS = [1e-6, 100e-9, 10e-9, 1e-9];

function approxFc(r, c) {
  return FC_APPROX / (r * c);
}

function inBand(bandId, f) {
  if (bandId === "niedrig") return f < 500;
  if (bandId === "hoch")    return f > 5000;
  return f >= 500 && f <= 5000;
}

function formatR(r) {
  return r >= 1000 ? `${r / 1000} kΩ` : `${r} Ω`;
}

function formatC(c) {
  if (c >= 1e-6) return `${Math.round(c * 1e6)} µF`;
  return `${Math.round(c * 1e9)} nF`;
}

function formatFreq(f) {
  return f >= 1000 ? `${(f / 1000).toFixed(0)} kHz` : `${Math.round(f)} Hz`;
}

export default {
  id: "filterauswahl",
  station: "Sensorik",

  howto: {
    goal: "Wähle den Filtertyp, der das Asteroidensignal isoliert. Ab Stufe 2 wähle auch den Kondensatorwert (Faustformel: fc ≈ 0,16 / (R·C)).",
    example: "Beispiel: R = 1 kΩ, C = 1 µF → fc ≈ 160 Hz → Tiefpass für Niedrig-Signal.",
  },

  generate(level, rng) {
    const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;

    if (lvl === 1) {
      const band = pick(rng, BANDS);
      return {
        level: lvl,
        band: band.id,
        correctFilterType: band.filterType,
        prompt: `Der Asteroid sendet im Band: ${band.label}. Wähle den passenden Filtertyp.`,
      };
    }

    if (lvl === 2) {
      // Nur niedrig/hoch – Bandpass mit zwei Grenzfrequenzen kommt erst in Stufe 3.
      const eligibleBands = BANDS.filter(b => b.id !== "mittel");
      const band = pick(rng, eligibleBands);
      const r = pick(rng, R_OPTIONS);
      return {
        level: lvl,
        band: band.id,
        correctFilterType: band.filterType,
        fixedR: r,
        cOptions: C_OPTIONS,
        prompt: `Der Asteroid sendet im Band: ${band.label}. Wähle Filtertyp und Kondensator (R = ${formatR(r)}, fest). fc ≈ 0,16 / (R·C)`,
      };
    }

    // Stufe 3: immer Bandpass (mittel).
    const r = pick(rng, R_OPTIONS);
    return {
      level: lvl,
      band: "mittel",
      correctFilterType: "Bandpass",
      fixedR: r,
      cOptions: C_OPTIONS,
      prompt: `Der Asteroid sendet im Mittelband (500 Hz – 5 kHz). Stelle den Bandpass ein: C für die untere Grenzfrequenz (Hochpass-Teil) und C für die obere Grenzfrequenz (Tiefpass-Teil). R = ${formatR(r)} gilt für beide. fc ≈ 0,16 / (R·C)`,
    };
  },

  validate(task, input) {
    if (!input) return { geloest: false, teiltreffer: 0, hinweis: "Eingabe fehlt." };

    if (task.level === 1) {
      if (!FILTER_TYPES.includes(input.filterType)) {
        return { geloest: false, teiltreffer: 0, hinweis: "Filtertyp wählen." };
      }
      const geloest = input.filterType === task.correctFilterType;
      const band = BANDS.find(b => b.id === task.band);
      return {
        geloest,
        teiltreffer: geloest ? 1 : 0,
        hinweis: geloest
          ? "Richtiger Filtertyp – Signal isoliert."
          : `Falsch. Für das ${band.label}-Band braucht man einen ${band.filterType}.`,
      };
    }

    if (task.level === 2) {
      const filterOk = FILTER_TYPES.includes(input.filterType) &&
                       input.filterType === task.correctFilterType;
      const cVal = Number(input.c);
      const cOk = task.cOptions.includes(cVal) && inBand(task.band, approxFc(task.fixedR, cVal));
      const geloest = filterOk && cOk;
      const teiltreffer = (filterOk ? 0.5 : 0) + (cOk ? 0.5 : 0);
      let hinweis;
      if (geloest) {
        hinweis = "Filter korrekt eingestellt.";
      } else if (!filterOk && !cOk) {
        hinweis = "Filtertyp und Kondensatorwert falsch.";
      } else if (!filterOk) {
        hinweis = `Filtertyp falsch – für dieses Band braucht man einen ${task.correctFilterType}.`;
      } else {
        const f = approxFc(task.fixedR, cVal);
        hinweis = task.band === "niedrig"
          ? `fc ≈ ${formatFreq(f)} liegt nicht im Niedrig-Band (muss < 500 Hz sein).`
          : `fc ≈ ${formatFreq(f)} liegt nicht im Hoch-Band (muss > 5 kHz sein).`;
      }
      return { geloest, teiltreffer, hinweis };
    }

    // Stufe 3: Bandpass mit unterer und oberer Grenzfrequenz.
    const cHp = Number(input.cHochpass);
    const cLp = Number(input.cTiefpass);
    const hpValid = task.cOptions.includes(cHp);
    const lpValid = task.cOptions.includes(cLp);
    if (!hpValid && !lpValid) {
      return { geloest: false, teiltreffer: 0, hinweis: "Beide Kondensatoren wählen." };
    }
    // Hochpass-Grenzfrequenz muss tief liegen (< 500 Hz), damit das Mittelband durchkommt.
    const fcHp = hpValid ? approxFc(task.fixedR, cHp) : Infinity;
    // Tiefpass-Grenzfrequenz muss hoch liegen (> 5 kHz), damit das Mittelband durchkommt.
    const fcLp = lpValid ? approxFc(task.fixedR, cLp) : 0;
    const hpOk = hpValid && fcHp < 500;
    const lpOk = lpValid && fcLp > 5000;
    const geloest = hpOk && lpOk;
    const teiltreffer = (hpOk ? 0.5 : 0) + (lpOk ? 0.5 : 0);
    let hinweis;
    if (geloest) {
      hinweis = "Bandpass korrekt eingestellt.";
    } else if (!hpOk && !lpOk) {
      hinweis = "Beide Grenzfrequenzen passen nicht.";
    } else if (!hpOk) {
      hinweis = `Untere Grenzfrequenz fc ≈ ${hpValid ? formatFreq(fcHp) : "?"} – muss unter 500 Hz liegen.`;
    } else {
      hinweis = `Obere Grenzfrequenz fc ≈ ${lpValid ? formatFreq(fcLp) : "?"} – muss über 5 kHz liegen.`;
    }
    return { geloest, teiltreffer, hinweis };
  },

  solve(task) {
    if (task.level === 1) {
      return { filterType: task.correctFilterType };
    }
    if (task.level === 2) {
      const c = task.cOptions.find(c => inBand(task.band, approxFc(task.fixedR, c)));
      return { filterType: task.correctFilterType, c: c ?? task.cOptions[0] };
    }
    // Stufe 3: Bandpass – suche passendes C für beide Hälften.
    const cHochpass = task.cOptions.find(c => approxFc(task.fixedR, c) < 500);
    const cTiefpass = [...task.cOptions].reverse().find(c => approxFc(task.fixedR, c) > 5000);
    return {
      cHochpass: cHochpass ?? task.cOptions[0],
      cTiefpass: cTiefpass ?? task.cOptions[task.cOptions.length - 1],
    };
  },

  // Hinweistext fuer den Hilfe-Button (DOM-frei, server-autoritaer).
  // Nennt die Faustformel und die Zielfrequenz der Aufgabe.
  hint(task) {
    const formula = "fc ≈ 0,16 / (R·C)";
    if (task.level === 1) {
      return `Faustformel: ${formula}. Gesuchter Filtertyp: ${task.correctFilterType}.`;
    }
    if (task.level === 2) {
      const sol = this.solve(task);
      const fc = approxFc(task.fixedR, sol.c);
      return `Faustformel: ${formula}. Zielfrequenz ca. ${formatFreq(fc)} → ${task.correctFilterType}.`;
    }
    const sol = this.solve(task);
    const fcHp = approxFc(task.fixedR, sol.cHochpass);
    const fcLp = approxFc(task.fixedR, sol.cTiefpass);
    return `Faustformel: ${formula}. Untere Grenzfrequenz ca. ${formatFreq(fcHp)}, obere ca. ${formatFreq(fcLp)}.`;
  },

  mount(root, task, ctx) {
    let selectedFilter = null;
    let selectedC = null;
    let selectedCHp = null;
    let selectedCLp = null;

    // Hilfsfunktion: Auswahlzustand einer Gruppe aktualisieren.
    function pickInGroup(container, btn, value, onPick) {
      container.querySelectorAll(".tp-mode-btn").forEach(b => b.classList.remove("sel"));
      btn.classList.add("sel");
      onPick(value);
      ctx.audio.play("ui.toggle");
    }

    // Hilfsfunktion: Bestätige-Schaltfläche freischalten, wenn alle Pflichtfelder gesetzt sind.
    function makeConfirmGuard(confirmEl, check) {
      return () => { confirmEl.disabled = !check(); };
    }

    if (task.level === 1) {
      root.innerHTML =
        `<h1 class="title">Sensorik</h1>` +
        `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
        `<div class="tp-mode" id="fa-filters"></div>` +
        `<div class="bc-hint fa-hint">Filtertyp wählen und bestätigen. Ein Fehlversuch kostet Stabilität.</div>` +
        `<button class="bc-confirm" disabled>Bestätigen</button>`;

      const filtersEl = root.querySelector("#fa-filters");
      const confirmEl = root.querySelector(".bc-confirm");
      const guard = makeConfirmGuard(confirmEl, () => selectedFilter !== null);

      FILTER_TYPES.forEach(ft => {
        const btn = document.createElement("button");
        btn.className = "tp-mode-btn";
        btn.textContent = ft;
        btn.addEventListener("click", () => {
          pickInGroup(filtersEl, btn, ft, v => { selectedFilter = v; });
          guard();
        });
        filtersEl.appendChild(btn);
      });

      confirmEl.addEventListener("click", () => {
        ctx.audio.play("ui.confirm");
        confirmEl.disabled = true;
        ctx.submit({ filterType: selectedFilter });
      });

    } else if (task.level === 2) {
      root.innerHTML =
        `<h1 class="title">Sensorik</h1>` +
        `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
        `<div class="bc-hintline">1 — Filtertyp wählen</div>` +
        `<div class="tp-mode" id="fa-filters"></div>` +
        `<div class="bc-hintline">2 — Kondensator wählen (R = <b>${formatR(task.fixedR)}</b>, fest)</div>` +
        `<div class="tp-mode" id="fa-c-opts"></div>` +
        `<div class="tp-readout"><span>Grenzfrequenz <b class="fa-fc">—</b></span></div>` +
        `<div class="bc-hint fa-hint">Filtertyp und Kondensator wählen, dann bestätigen.</div>` +
        `<button class="bc-confirm" disabled>Bestätigen</button>`;

      const filtersEl = root.querySelector("#fa-filters");
      const cOptsEl  = root.querySelector("#fa-c-opts");
      const fcEl     = root.querySelector(".fa-fc");
      const confirmEl = root.querySelector(".bc-confirm");
      const guard = makeConfirmGuard(confirmEl, () => selectedFilter !== null && selectedC !== null);

      FILTER_TYPES.forEach(ft => {
        const btn = document.createElement("button");
        btn.className = "tp-mode-btn";
        btn.textContent = ft;
        btn.addEventListener("click", () => {
          pickInGroup(filtersEl, btn, ft, v => { selectedFilter = v; });
          guard();
        });
        filtersEl.appendChild(btn);
      });

      task.cOptions.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "tp-mode-btn";
        btn.textContent = formatC(c);
        btn.addEventListener("click", () => {
          pickInGroup(cOptsEl, btn, c, v => { selectedC = v; });
          fcEl.textContent = formatFreq(approxFc(task.fixedR, c));
          guard();
        });
        cOptsEl.appendChild(btn);
      });

      confirmEl.addEventListener("click", () => {
        ctx.audio.play("ui.confirm");
        confirmEl.disabled = true;
        ctx.submit({ filterType: selectedFilter, c: selectedC });
      });

    } else {
      // Stufe 3: Bandpass – zwei C-Werte wählen.
      root.innerHTML =
        `<h1 class="title">Sensorik</h1>` +
        `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
        `<div class="bc-hintline">1 — C für untere Grenzfrequenz (Hochpass-Teil, fc &lt; 500 Hz)</div>` +
        `<div class="tp-mode" id="fa-c-hp"></div>` +
        `<div class="tp-readout"><span>fc Hochpass <b class="fa-fc-hp">—</b></span></div>` +
        `<div class="bc-hintline">2 — C für obere Grenzfrequenz (Tiefpass-Teil, fc &gt; 5 kHz)</div>` +
        `<div class="tp-mode" id="fa-c-lp"></div>` +
        `<div class="tp-readout"><span>fc Tiefpass <b class="fa-fc-lp">—</b></span></div>` +
        `<div class="bc-hint fa-hint">Beide Kondensatoren wählen, dann bestätigen.</div>` +
        `<button class="bc-confirm" disabled>Bestätigen</button>`;

      const cHpEl  = root.querySelector("#fa-c-hp");
      const cLpEl  = root.querySelector("#fa-c-lp");
      const fcHpEl = root.querySelector(".fa-fc-hp");
      const fcLpEl = root.querySelector(".fa-fc-lp");
      const confirmEl = root.querySelector(".bc-confirm");
      const guard = makeConfirmGuard(confirmEl, () => selectedCHp !== null && selectedCLp !== null);

      task.cOptions.forEach(c => {
        const btnHp = document.createElement("button");
        btnHp.className = "tp-mode-btn";
        btnHp.textContent = formatC(c);
        btnHp.addEventListener("click", () => {
          pickInGroup(cHpEl, btnHp, c, v => { selectedCHp = v; });
          fcHpEl.textContent = formatFreq(approxFc(task.fixedR, c));
          guard();
        });
        cHpEl.appendChild(btnHp);

        const btnLp = document.createElement("button");
        btnLp.className = "tp-mode-btn";
        btnLp.textContent = formatC(c);
        btnLp.addEventListener("click", () => {
          pickInGroup(cLpEl, btnLp, c, v => { selectedCLp = v; });
          fcLpEl.textContent = formatFreq(approxFc(task.fixedR, c));
          guard();
        });
        cLpEl.appendChild(btnLp);
      });

      confirmEl.addEventListener("click", () => {
        ctx.audio.play("ui.confirm");
        confirmEl.disabled = true;
        ctx.submit({ cHochpass: selectedCHp, cTiefpass: selectedCLp });
      });
    }

    return {
      unmount() {
        root.innerHTML = "";
      },
      onResult(res) {
        const hintEl = root.querySelector(".fa-hint");
        const confirmEl = root.querySelector(".bc-confirm");
        if (hintEl && res.hinweis) {
          hintEl.textContent = res.geloest
            ? res.hinweis
            : `${res.hinweis} Fehlversuch kostet Stabilität.`;
        }
        if (confirmEl) {
          if (res.geloest) {
            confirmEl.textContent = "Bestätigt";
            confirmEl.disabled = true;
          } else {
            confirmEl.disabled = false;
          }
        }
      },
    };
  },
};
