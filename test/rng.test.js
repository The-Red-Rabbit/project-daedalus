// Tests fuer den deterministischen Zufall. Die Determinismus-Garantie ist die
// Grundlage dafuer, dass der Server eine Aufgabe aus dem Seed nachbauen kann.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32, randomInt, pick, shuffle, makeSeed } from "../shared/rng.js";

test("mulberry32: gleicher Seed ergibt dieselbe Folge", () => {
  const a = mulberry32(123456789);
  const b = mulberry32(123456789);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test("mulberry32: Werte liegen im halboffenen Intervall [0, 1)", () => {
  const rng = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `Wert ausserhalb [0,1): ${v}`);
  }
});

test("mulberry32: verschiedene Seeds ergeben verschiedene Folgen", () => {
  const a = Array.from({ length: 10 }, ((r) => () => r())(mulberry32(1)));
  const b = Array.from({ length: 10 }, ((r) => () => r())(mulberry32(2)));
  assert.notDeepEqual(a, b);
});

test("randomInt: bleibt in [min, max] und ist ganzzahlig", () => {
  const rng = mulberry32(7);
  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 5000; i++) {
    const v = randomInt(rng, 3, 8);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 3 && v <= 8, `ausserhalb: ${v}`);
    if (v === 3) sawMin = true;
    if (v === 8) sawMax = true;
  }
  assert.ok(sawMin && sawMax, "Min und Max sollten erreichbar sein");
});

test("pick: liefert ein Element des Arrays", () => {
  const rng = mulberry32(99);
  const arr = ["a", "b", "c", "d"];
  for (let i = 0; i < 200; i++) {
    assert.ok(arr.includes(pick(rng, arr)));
  }
});

test("shuffle: ist eine Permutation, laesst das Original unveraendert und ist deterministisch", () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = original.slice();
  const s1 = shuffle(mulberry32(2024), original);
  const s2 = shuffle(mulberry32(2024), original);
  assert.deepEqual(original, copy, "Original darf nicht veraendert werden");
  assert.deepEqual([...s1].sort((a, b) => a - b), original, "gleiche Elemente");
  assert.deepEqual(s1, s2, "gleicher Seed, gleiche Reihenfolge");
});

test("makeSeed: liefert eine 32-Bit-Ganzzahl ohne Vorzeichen", () => {
  for (let i = 0; i < 100; i++) {
    const s = makeSeed();
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff);
  }
});
