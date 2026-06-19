// Tests fuer das kooperative Mini-Spiel Reaktor: generate/validate/solve/solveFor.
// Alle vier sind DOM-frei; der Server rechnet die Reaktanz damit autoritativ nach.

import test from "node:test";
import assert from "node:assert/strict";
import reaktor from "../client/minigames/reaktor.js";
import { mulberry32 } from "../shared/rng.js";

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  const a = reaktor.generate(2, mulberry32(42));
  const b = reaktor.generate(2, mulberry32(42));
  assert.deepEqual(a, b);
});

test("generate: hoehere Stufe verengt die Toleranz", () => {
  const t1 = reaktor.generate(1, mulberry32(1)).tolerance;
  const t3 = reaktor.generate(3, mulberry32(1)).tolerance;
  assert.ok(t3 < t1);
});

test("solve: das Reglerpaar trifft das Ziel (alle Stufen)", () => {
  for (let level = 1; level <= 3; level++) {
    for (let seed = 1; seed <= 8; seed++) {
      const task = reaktor.generate(level, mulberry32(seed));
      const res = reaktor.validate(task, reaktor.solve(task));
      assert.ok(res.inBand && res.geloest, `Stufe ${level} Seed ${seed} nicht im Band`);
      assert.ok(res.teiltreffer > 0.99);
    }
  }
});

test("solveFor: trifft das Ziel, wenn die andere Seite ihren Wert haelt", () => {
  const task = reaktor.generate(2, mulberry32(7));
  // Co-Pilot haelt b = 0.6, Operator rechnet a aus solveFor("a").
  const b = 0.6;
  const a = reaktor.solveFor(task, b, "a");
  assert.ok(reaktor.validate(task, { a, b }).inBand);
  // Umgekehrt: Operator haelt a = 0.4, Co-Pilot rechnet b aus solveFor("b").
  const a2 = 0.4;
  const b2 = reaktor.solveFor(task, a2, "b");
  assert.ok(reaktor.validate(task, { a: a2, b: b2 }).inBand);
});

test("validate: weit daneben loest nicht, mit Richtungshinweis", () => {
  const task = reaktor.generate(1, mulberry32(3));
  const lowX = reaktor.validate(task, { a: 1, b: 1 }); // grosse C und f -> kleine Reaktanz
  assert.equal(lowX.inBand, false);
  assert.ok(lowX.teiltreffer >= 0 && lowX.teiltreffer <= 1);
  assert.ok(typeof lowX.hinweis === "string");
});

test("validate: fehlende oder ungueltige Eingabe ergibt 0 und einen Hinweis", () => {
  const task = reaktor.generate(1, mulberry32(3));
  const res = reaktor.validate(task, {});
  assert.equal(res.geloest, false);
  assert.equal(res.teiltreffer, 0);
  assert.ok(res.hinweis);
});
