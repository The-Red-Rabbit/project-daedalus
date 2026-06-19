// Mini-Spiel Bordcomputer: logische Schaltungen bauen (Themenfeld 3 Digitaltechnik).
// Statt ein einzelnes Bauteil zu waehlen, baut man aus mehreren Gattern eine
// kleine Schaltung, die eine vorgegebene Wahrheitstabelle erzeugt. Rueckmeldung
// gibt es erst nach dem Bestaetigen, ein Fehlversuch kostet Stabilitaet.
//
// generate() und validate() sind DOM-frei, damit der Server sie nachrechnen kann.

import { pick } from "../../shared/rng.js";

// Zwei-Eingang-Gatter. Werte sind 0/1.
const GATES = {
  UND: (a, b) => (a && b ? 1 : 0),
  ODER: (a, b) => (a || b ? 1 : 0),
  XOR: (a, b) => (a ^ b ? 1 : 0),
  NAND: (a, b) => (a && b ? 0 : 1),
  NOR: (a, b) => (a || b ? 0 : 1),
  XNOR: (a, b) => (a ^ b ? 0 : 1),
};

const COMBOS = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

// Stufe steuert Topologie und Gatter-Auswahl: Stufe 1 eine Reihe aus zwei
// Gattern, ab Stufe 2 die kleine Schaltung aus drei Gattern, Stufe 3 mit groesserer
// Auswahl. Mehr Gatter und mehr Auswahl machen blindes Probieren teuer.
function levelConfig(level) {
  const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;
  if (lvl === 1) return { lvl, topo: "chain", palette: ["UND", "ODER", "NAND"] };
  if (lvl === 2) return { lvl, topo: "net", palette: ["UND", "ODER", "XOR", "NAND"] };
  return { lvl, topo: "net", palette: ["UND", "ODER", "XOR", "NAND", "NOR", "XNOR"] };
}

// Slots (zu fuellende Gatter) samt fester Verdrahtung. Der letzte Slot ist der
// Ausgang. "chain": G1 verknuepft A,B, der Ausgang G1 mit dem rohen B.
// "net": zwei Gatter ueber A,B, ein drittes fuehrt sie zusammen.
function slotsFor(topo) {
  if (topo === "chain") {
    return [
      { id: "g1", inputs: ["A", "B"] },
      { id: "out", inputs: ["g1", "B"] },
    ];
  }
  return [
    { id: "g1", inputs: ["A", "B"] },
    { id: "g2", inputs: ["A", "B"] },
    { id: "out", inputs: ["g1", "g2"] },
  ];
}

// Wertet die Schaltung fuer alle vier Eingangskombinationen aus und liefert die
// Ausgangstabelle. Fehlt eine Gatterwahl, zaehlt der Slot als 0.
function evalCircuit(slots, gates) {
  const outId = slots[slots.length - 1].id;
  return COMBOS.map(([a, b]) => {
    const v = { A: a, B: b };
    for (const s of slots) {
      const g = GATES[gates[s.id]];
      v[s.id] = g ? g(v[s.inputs[0]], v[s.inputs[1]]) : 0;
    }
    return { a, b, out: v[outId] };
  });
}

export default {
  id: "bordcomputer",
  station: "Bordcomputer",
  // Kurzanleitung fuer die Anleitungskarte vor dem Spielen (DOM-frei, nur Text).
  howto: {
    goal: "Wähle für jedes Gatter den Typ, sodass die Ausgangsspalte genau zur Zieltabelle passt.",
    example: "Beispiel: UND ist nur 1, wenn A und B beide 1 sind.",
  },

  generate(level, rng) {
    const cfg = levelConfig(level);
    const slots = slotsFor(cfg.topo);
    let solution = {};
    let target = [];
    // Bis zu einige Versuche fuer eine nicht-konstante Zieltabelle (sonst waere
    // sie zu beliebig loesbar und lehrt nichts ueber die Tabelle).
    for (let attempt = 0; attempt < 8; attempt++) {
      solution = {};
      for (const s of slots) solution[s.id] = pick(rng, cfg.palette);
      target = evalCircuit(slots, solution);
      const outs = target.map((r) => r.out);
      if (!outs.every((o) => o === outs[0])) break;
    }
    return {
      prompt: "Baue die Schaltung, die genau diese Ausgänge erzeugt.",
      inputs: ["A", "B"],
      slots,
      outSlot: slots[slots.length - 1].id,
      palette: cfg.palette,
      target,
      solution,
      level: cfg.lvl,
    };
  },

  validate(task, input) {
    const gates = input && input.gates;
    // Jeder Slot braucht ein gueltiges Gatter aus der Auswahl.
    const complete =
      gates && task.slots.every((s) => gates[s.id] && task.palette.includes(gates[s.id]) && GATES[gates[s.id]]);
    if (!complete) {
      return { geloest: false, teiltreffer: 0, hinweis: "Jedem Gatter ein Bauteil zuweisen." };
    }
    const out = evalCircuit(task.slots, gates);
    let ok = 0;
    for (let i = 0; i < task.target.length; i++) if (out[i].out === task.target[i].out) ok++;
    const geloest = ok === task.target.length;
    return {
      geloest,
      teiltreffer: ok / task.target.length,
      hinweis: geloest ? "Schaltung stabilisiert." : `${task.target.length - ok} Zeilen stimmen noch nicht.`,
    };
  },

  // Eine korrekte Belegung (DOM-frei). Genutzt von Bots und Tests; die beim
  // Erzeugen verwendete Loesung trifft die Zieltabelle immer.
  solve(task) {
    return { gates: { ...task.solution } };
  },

  mount(root, task, ctx) {
    const selected = {}; // slotId -> Gattername
    let committed = false; // zeigt die Ist-Spalte erst nach dem Bestaetigen

    const slotName = (id) => (id === task.outSlot ? "Ausgang" : id.toUpperCase());
    const refName = (ref) => (ref === "A" || ref === "B" ? ref : ref.toUpperCase());

    root.innerHTML =
      `<h1 class="title">Bordcomputer</h1>` +
      `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
      `<div class="bc-circuit"></div>` +
      `<table class="bc-table"><thead><tr><th>A</th><th>B</th><th>Ist</th><th>Ziel</th></tr></thead><tbody></tbody></table>` +
      `<div class="bc-hint">Erst bauen, dann bestätigen. Ein Fehlversuch kostet Stabilität.</div>` +
      `<button class="bc-confirm" disabled>Bestätigen</button>`;

    const circuitEl = root.querySelector(".bc-circuit");
    const tbody = root.querySelector(".bc-table tbody");
    const hintEl = root.querySelector(".bc-hint");
    const confirmEl = root.querySelector(".bc-confirm");

    // Je Slot eine Reihe: Name, Verdrahtung und die Gatter-Auswahl.
    task.slots.forEach((slot) => {
      const wrap = document.createElement("div");
      wrap.className = "bc-slot";
      wrap.innerHTML =
        `<div class="bc-slot-head"><b>${slotName(slot.id)}</b> <span class="bc-wire">◂ ${slot.inputs.map(refName).join(", ")}</span></div>` +
        `<div class="bc-slot-gates"></div>`;
      const gatesEl = wrap.querySelector(".bc-slot-gates");
      task.palette.forEach((g) => {
        const btn = document.createElement("button");
        btn.className = "bc-gate";
        btn.textContent = g;
        btn.addEventListener("click", () => {
          selected[slot.id] = g;
          ctx.audio.play("ui.toggle");
          gatesEl.querySelectorAll(".bc-gate").forEach((x) => x.classList.toggle("sel", x.textContent === g));
          // Eine Aenderung verlaesst die bestaetigte Ansicht (Ist-Spalte wieder leer).
          if (committed) {
            committed = false;
            renderRows();
          }
          confirmEl.disabled = !allChosen();
          confirmEl.textContent = "Bestätigen";
        });
        gatesEl.appendChild(btn);
      });
      circuitEl.appendChild(wrap);
    });

    const allChosen = () => task.slots.every((s) => selected[s.id]);

    // Ist-Spalte nur nach dem Bestaetigen (committed); davor bleibt sie leer.
    function renderRows() {
      tbody.innerHTML = "";
      const out = committed ? evalCircuit(task.slots, selected) : null;
      task.target.forEach((r, i) => {
        const ist = out ? out[i].out : "";
        const match = out ? out[i].out === r.out : false;
        const tr = document.createElement("tr");
        tr.className = out ? (match ? "ok" : "bad") : "";
        const istClass = out && !match ? "miss" : "";
        const mark = out ? (match ? " ✓" : " ✗") : "";
        tr.innerHTML = `<td>${r.a}</td><td>${r.b}</td><td class="${istClass}">${ist}${mark}</td><td>${r.out}</td>`;
        tbody.appendChild(tr);
      });
    }
    renderRows();

    confirmEl.addEventListener("click", () => {
      if (!allChosen()) return;
      ctx.audio.play("ui.confirm");
      confirmEl.disabled = true; // bis die Antwort des Servers da ist
      ctx.submit({ gates: { ...selected } });
    });

    return {
      unmount() {
        root.innerHTML = "";
      },
      onResult(res) {
        // Jetzt die Auswertung zeigen (Ist-Spalte mit Treffern/Fehlern).
        committed = true;
        renderRows();
        if (res.geloest) {
          hintEl.textContent = res.hinweis || "Schaltung stabilisiert.";
          confirmEl.textContent = "Stabilisiert";
          confirmEl.disabled = true;
        } else {
          hintEl.textContent = `${res.hinweis || "Noch nicht passend."} Fehlversuch kostet Stabilität.`;
          confirmEl.disabled = !allChosen();
        }
      },
    };
  },
};
