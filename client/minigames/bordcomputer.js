// Mini-Spiel Bordcomputer: logische Gatter (Themenfeld 3 Digitaltechnik).
// Ziel: das Bauteil so waehlen, dass die Ist-Spalte der Ziel-Spalte entspricht.
// generate() und validate() sind DOM-frei, damit der Server sie pruefen kann.

import { pick, shuffle } from "../../shared/rng.js";

const GATES = {
  UND: (a, b) => (a && b ? 1 : 0),
  ODER: (a, b) => (a || b ? 1 : 0),
  XOR: (a, b) => (a ^ b ? 1 : 0),
  NAND: (a, b) => (a && b ? 0 : 1),
};

const SCENARIOS = {
  UND: "Das Schott öffnet nur, wenn beide Schlüssel stecken.",
  ODER: "Die Warnleuchte geht an, sobald mindestens ein Sensor anschlägt.",
  XOR: "Die Weiche schaltet nur, wenn genau einer der beiden Hebel gezogen ist.",
  NAND: "Der Reaktor bleibt frei, solange nicht beide Ventile zugleich offen sind.",
};

const COMBOS = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

export default {
  id: "bordcomputer",
  station: "Bordcomputer",

  generate(level, rng) {
    // Stufe 1 bleibt bei UND und ODER, ab Stufe 2 kommen XOR und NAND dazu.
    const allowed = level >= 2 ? ["UND", "ODER", "XOR", "NAND"] : ["UND", "ODER"];
    const gate = pick(rng, allowed);
    const target = COMBOS.map(([a, b]) => ({ a, b, out: GATES[gate](a, b) }));
    const options = shuffle(rng, ["UND", "ODER", "XOR", "NAND"]);
    return { scenario: SCENARIOS[gate], gate, target, options, level };
  },

  validate(task, input) {
    const sel = input && input.gate;
    if (!sel || !GATES[sel]) {
      return { geloest: false, teiltreffer: 0, hinweis: "Zuerst ein Bauteil wählen." };
    }
    let ok = 0;
    for (const r of task.target) {
      if (GATES[sel](r.a, r.b) === r.out) ok++;
    }
    const geloest = ok === task.target.length;
    return {
      geloest,
      teiltreffer: ok / task.target.length,
      hinweis: geloest ? "Stabilisiert." : `${task.target.length - ok} Zeilen stimmen noch nicht.`,
    };
  },

  mount(root, task, ctx) {
    let selected = null;
    root.innerHTML =
      `<h1 class="title">Bordcomputer</h1>` +
      `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.scenario}</div>` +
      `<div class="bc-hintline">Wähle das Bauteil</div>` +
      `<div class="bc-gates"></div>` +
      `<table class="bc-table"><thead><tr><th>A</th><th>B</th><th>Ist</th><th>Ziel</th></tr></thead><tbody></tbody></table>` +
      `<div class="bc-hint"></div>` +
      `<button class="bc-confirm" disabled>Bestätigen</button>`;

    const gatesEl = root.querySelector(".bc-gates");
    const tbody = root.querySelector(".bc-table tbody");
    const hintEl = root.querySelector(".bc-hint");
    const confirmEl = root.querySelector(".bc-confirm");

    task.options.forEach((g) => {
      const b = document.createElement("button");
      b.className = "bc-gate";
      b.textContent = g;
      b.addEventListener("click", () => {
        selected = g;
        ctx.audio.play("ui.toggle");
        gatesEl.querySelectorAll(".bc-gate").forEach((x) => x.classList.toggle("sel", x.textContent === g));
        renderRows();
        confirmEl.disabled = false;
      });
      gatesEl.appendChild(b);
    });

    function renderRows() {
      tbody.innerHTML = "";
      let ok = 0;
      task.target.forEach((r) => {
        const ist = selected ? GATES[selected](r.a, r.b) : "";
        const match = selected !== null && ist === r.out;
        if (match) ok++;
        const tr = document.createElement("tr");
        tr.className = selected ? (match ? "ok" : "bad") : "";
        const istClass = selected && !match ? "miss" : "";
        // Treffer zusaetzlich als Form markieren, nicht nur ueber Farbe.
        const mark = selected ? (match ? " ✓" : " ✗") : "";
        tr.innerHTML = `<td>${r.a}</td><td>${r.b}</td><td class="${istClass}">${ist}${mark}</td><td>${r.out}</td>`;
        tbody.appendChild(tr);
      });
      if (selected) {
        const rest = task.target.length - ok;
        hintEl.textContent = rest === 0 ? "Alle Zeilen stimmen. Jetzt bestätigen." : `${rest} Zeilen stimmen noch nicht.`;
      } else {
        hintEl.textContent = "";
      }
    }
    renderRows();

    confirmEl.addEventListener("click", () => {
      if (selected) ctx.submit({ gate: selected });
    });

    return {
      unmount() {
        root.innerHTML = "";
      },
      onResult(res) {
        if (res.hinweis) hintEl.textContent = res.hinweis;
        if (res.geloest) {
          confirmEl.textContent = "Stabilisiert";
          confirmEl.disabled = true;
        }
      },
    };
  },
};
