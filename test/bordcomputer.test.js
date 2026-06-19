// Tests fuer das Mini-Spiel Bordcomputer (Schaltungsbau). generate() und
// validate() sind DOM-frei und die autoritative Logik des Servers. validate wird
// gegen eine unabhaengige Schaltungsauswertung geprueft.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import bordcomputer from "../client/minigames/bordcomputer.js";

// Unabhaengiges Orakel: dieselbe Gatterlogik, hier zur Kontrolle nachgebaut.
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
// Alle Gatterbelegungen eines Tasks ueber seine Auswahl aufzaehlen.
function allAssignments(slots, palette) {
  let res = [{}];
  for (const s of slots) {
    const next = [];
    for (const partial of res) for (const g of palette) next.push({ ...partial, [s.id]: g });
    res = next;
  }
  return res;
}

const build = (level, seed) => bordcomputer.generate(level, mulberry32(seed));

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 1000, 0xabcdef, 4294967295]) {
    assert.deepEqual(build(2, seed), build(2, seed));
  }
});

test("generate: Stufe 1 ist eine Reihe aus zwei Gattern, Stufe 2/3 eine Schaltung aus drei", () => {
  for (let seed = 0; seed < 50; seed++) {
    assert.equal(build(1, seed).slots.length, 2, `Stufe 1, Seed ${seed}`);
    assert.equal(build(2, seed).slots.length, 3, `Stufe 2, Seed ${seed}`);
    assert.equal(build(3, seed).slots.length, 3, `Stufe 3, Seed ${seed}`);
  }
});

test("generate: die Gatter-Auswahl waechst mit der Stufe", () => {
  const p1 = build(1, 5).palette;
  const p2 = build(2, 5).palette;
  const p3 = build(3, 5).palette;
  assert.ok(!p1.includes("XOR"), "Stufe 1 ohne XOR");
  assert.ok(p2.includes("XOR"), "Stufe 2 mit XOR");
  assert.ok(p3.includes("NOR") && p3.includes("XNOR"), "Stufe 3 mit NOR und XNOR");
  assert.ok(p3.length > p2.length && p2.length > p1.length);
});

test("generate: Zieltabelle deckt genau die vier Eingangskombinationen ab", () => {
  const task = build(2, 12345);
  assert.equal(task.target.length, 4);
  assert.deepEqual(task.target.map((r) => `${r.a}${r.b}`).sort(), ["00", "01", "10", "11"]);
  for (const r of task.target) assert.ok(r.out === 0 || r.out === 1);
});

test("solve: die erzeugende Belegung loest die Aufgabe vollstaendig (alle Stufen)", () => {
  for (let seed = 0; seed < 200; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      const res = bordcomputer.validate(task, bordcomputer.solve(task));
      assert.equal(res.geloest, true, `Seed ${seed}, Stufe ${level}`);
      assert.equal(res.teiltreffer, 1);
    }
  }
});

test("validate: stimmt fuer jede moegliche Belegung mit der unabhaengigen Auswertung ueberein", () => {
  for (const [level, seed] of [[1, 7], [2, 7], [3, 7], [2, 99], [3, 1234]]) {
    const task = build(level, seed);
    for (const gates of allAssignments(task.slots, task.palette)) {
      const ref = evalCircuit(task.slots, gates);
      const matches = ref.filter((r, i) => r.out === task.target[i].out).length;
      const res = bordcomputer.validate(task, { gates });
      assert.equal(res.geloest, matches === 4, `Stufe ${level} Seed ${seed} Belegung ${JSON.stringify(gates)}`);
      assert.equal(res.teiltreffer, matches / 4);
    }
  }
});

test("validate: fehlende oder unvollstaendige Eingabe ergibt 0 und einen Hinweis", () => {
  const task = build(2, 1); // drei Slots
  const partial = { gates: { g1: "UND" } }; // nicht alle Slots gesetzt
  for (const input of [undefined, {}, { gates: {} }, partial, { gates: { g1: "FOO", g2: "UND", out: "ODER" } }]) {
    const res = bordcomputer.validate(task, input);
    assert.equal(res.geloest, false);
    assert.equal(res.teiltreffer, 0);
    assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0);
  }
});

test("generate: die Zieltabelle ist fast immer nicht konstant", () => {
  let nonConstant = 0;
  const N = 200;
  for (let seed = 0; seed < N; seed++) {
    const outs = build(2, seed).target.map((r) => r.out);
    if (!outs.every((o) => o === outs[0])) nonConstant++;
  }
  assert.ok(nonConstant >= N - 5, `nur ${nonConstant}/${N} nicht konstant`);
});
