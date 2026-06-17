// Tests fuer das Mini-Spiel Zahlensysteme. generate() und validate() sind
// DOM-frei und damit die autoritative Logik des Servers.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import zahlensysteme from "../client/minigames/zahlensysteme.js";

const build = (level, seed) => zahlensysteme.generate(level, mulberry32(seed));

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 99, 0xdead, 4294967295]) {
    assert.deepEqual(build(2, seed), build(2, seed));
  }
});

test("generate: Stufe steuert Bitbreite und Quellsystem", () => {
  assert.equal(build(1, 5).bits, 4);
  assert.equal(build(2, 5).bits, 8);
  assert.equal(build(3, 5).bits, 8);
  assert.equal(build(1, 5).displayBase, 10);
  assert.equal(build(3, 5).displayBase, 16);
});

test("generate: das Ziel passt in die Bitbreite", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      assert.ok(task.target >= 0 && task.target <= (1 << task.bits) - 1, `Seed ${seed} L${level}`);
    }
  }
});

test("validate: der exakte Wert loest die Aufgabe vollstaendig", () => {
  for (let seed = 0; seed < 300; seed++) {
    const task = build(2, seed);
    const res = zahlensysteme.validate(task, { value: task.target });
    assert.equal(res.geloest, true);
    assert.equal(res.teiltreffer, 1);
  }
});

test("validate: ein falscher Wert loest nicht, teiltreffer aus den Bits", () => {
  const task = build(1, 1); // 4 Bit
  const flipped = task.target ^ 0b0001; // genau ein Bit anders
  const res = zahlensysteme.validate(task, { value: flipped });
  assert.equal(res.geloest, false);
  assert.equal(res.teiltreffer, 3 / 4); // ein Bit falsch von vier
});

test("validate: Richtungshinweis zu hoch / zu niedrig", () => {
  const task = build(1, 2);
  if (task.target > 0) assert.match(zahlensysteme.validate(task, { value: task.target - 1 }).hinweis, /niedrig/);
  if (task.target < 15) assert.match(zahlensysteme.validate(task, { value: task.target + 1 }).hinweis, /hoch/);
});

test("validate: ungueltige Eingabe ergibt 0 und einen Hinweis", () => {
  const task = build(2, 3);
  for (const input of [undefined, {}, { value: -1 }, { value: 999 }, { value: "x" }]) {
    const res = zahlensysteme.validate(task, input);
    assert.equal(res.geloest, false);
    assert.equal(res.teiltreffer, 0);
    assert.ok(res.hinweis.length > 0);
  }
});
