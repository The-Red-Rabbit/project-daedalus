// Tests fuer das Mini-Spiel Bordcomputer. Wichtig: generate() und validate()
// sind DOM-frei, daher hier direkt unter Node pruefbar. Sie sind die
// autoritative Logik, die der Server zur Bewertung nutzt.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import bordcomputer from "../client/minigames/bordcomputer.js";

const GATES = ["UND", "ODER", "XOR", "NAND"];
const build = (level, seed) => bordcomputer.generate(level, mulberry32(seed));

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 1000, 0xabcdef, 4294967295]) {
    assert.deepEqual(build(1, seed), build(1, seed));
  }
});

test("generate: Stufe 1 nutzt nur UND und ODER, Stufe 2 alle vier Gatter", () => {
  for (let seed = 0; seed < 300; seed++) {
    assert.ok(["UND", "ODER"].includes(build(1, seed).gate), `Stufe 1, Seed ${seed}`);
    assert.ok(GATES.includes(build(2, seed).gate), `Stufe 2, Seed ${seed}`);
  }
});

test("generate: Zieltabelle deckt genau die vier Eingangskombinationen ab", () => {
  const task = build(2, 12345);
  assert.equal(task.target.length, 4);
  const combos = task.target.map((r) => `${r.a}${r.b}`).sort();
  assert.deepEqual(combos, ["00", "01", "10", "11"]);
  for (const r of task.target) {
    assert.ok(r.out === 0 || r.out === 1);
  }
});

test("validate: das erzeugende Gatter loest die Aufgabe vollstaendig", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const level of [1, 2]) {
      const task = build(level, seed);
      const res = bordcomputer.validate(task, { gate: task.gate });
      assert.equal(res.geloest, true, `Seed ${seed}, Stufe ${level}`);
      assert.equal(res.teiltreffer, 1);
    }
  }
});

test("validate: ein falsches Gatter loest nicht, teiltreffer bleibt in [0,1)", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(2, seed);
    const wrong = GATES.find((g) => g !== task.gate);
    const res = bordcomputer.validate(task, { gate: wrong });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.ok(res.teiltreffer >= 0 && res.teiltreffer < 1);
  }
});

test("validate: fehlende oder unbekannte Eingabe ergibt 0 und einen Hinweis", () => {
  const task = build(1, 1);
  for (const input of [undefined, {}, { gate: "FOO" }, { gate: "" }]) {
    const res = bordcomputer.validate(task, input);
    assert.equal(res.geloest, false);
    assert.equal(res.teiltreffer, 0);
    assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0);
  }
});
