// Tests fuer das Mini-Spiel Tiefpassfilter. generate() und validate() sind
// DOM-frei (dieser Test laeuft unter Node), also die autoritative Logik, die
// der Server zur Bewertung nutzt. f_c = 1 / (2*pi*R*C).

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import tiefpassfilter from "../client/minigames/tiefpassfilter.js";

const build = (level, seed) => tiefpassfilter.generate(level, mulberry32(seed));
const cutoff = (r, c) => 1 / (2 * Math.PI * r * c);

// Beste erreichbare Kombination fuer eine Aufgabe (so wie ein perfekter Spieler).
function bestCombo(task) {
  const rs = task.adjust.r ? task.rOptions : [task.rFixed];
  let best = null;
  for (const r of rs) {
    for (const c of task.cOptions) {
      const err = Math.abs(cutoff(r, c) - task.targetFc);
      if (!best || err < best.err) best = { r, c, err };
    }
  }
  return best;
}

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 777, 0x12345, 4294967295]) {
    assert.deepEqual(build(2, seed), build(2, seed));
  }
});

test("generate: Stufe steuert Toleranz und verstellbare Bauteile", () => {
  const l1 = build(1, 5);
  const l2 = build(2, 5);
  const l3 = build(3, 5);
  assert.deepEqual(l1.adjust, { r: false, c: true });
  assert.deepEqual(l2.adjust, { r: true, c: true });
  assert.deepEqual(l3.adjust, { r: true, c: true });
  assert.equal(l1.tolerance, 0.2);
  assert.equal(l2.tolerance, 0.12);
  assert.equal(l3.tolerance, 0.06);
});

test("generate: Zielfrequenz liegt im sinnvollen Band und ist exakt erreichbar", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      assert.ok(task.targetFc >= 120 && task.targetFc <= 8000, `Seed ${seed} L${level}: ${task.targetFc}`);
      const best = bestCombo(task);
      assert.ok(best.err < 1e-6, `Ziel nicht exakt erreichbar bei Seed ${seed} L${level}`);
    }
  }
});

test("generate: Startwerte liegen neben der Loesung (es gibt etwas zu tun)", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(2, seed);
    const start = cutoff(task.startR, task.startC);
    const relErr = Math.abs(start - task.targetFc) / task.targetFc;
    assert.ok(relErr > task.tolerance, `Start schon geloest bei Seed ${seed}`);
  }
});

test("validate: die exakte Kombination loest die Aufgabe vollstaendig", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      const best = bestCombo(task);
      const res = tiefpassfilter.validate(task, { r: best.r, c: best.c });
      assert.equal(res.geloest, true, `Seed ${seed} L${level}`);
      assert.equal(res.teiltreffer, 1);
    }
  }
});

test("validate: eine weit entfernte Einstellung loest nicht, teiltreffer in [0,1]", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(1, seed);
    // weitester Wert vom Ziel
    let worst = null;
    for (const c of task.cOptions) {
      const err = Math.abs(cutoff(task.rFixed, c) - task.targetFc);
      if (!worst || err > worst.err) worst = { c, err };
    }
    const res = tiefpassfilter.validate(task, { r: task.rFixed, c: worst.c });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.ok(res.teiltreffer >= 0 && res.teiltreffer <= 1);
  }
});

test("validate: gibt eine Richtung an (zu hoch / zu niedrig)", () => {
  const task = build(1, 1);
  const low = tiefpassfilter.validate(task, { r: task.rFixed, c: task.cOptions[task.cOptions.length - 1] });
  const high = tiefpassfilter.validate(task, { r: task.rFixed, c: task.cOptions[0] });
  // groesseres C senkt f_c, kleineres C hebt f_c
  assert.ok(/niedrig|hoch|abgestimmt/.test(low.hinweis));
  assert.ok(/niedrig|hoch|abgestimmt/.test(high.hinweis));
});

test("validate: fehlende oder ungueltige Eingabe ergibt 0 und einen Hinweis", () => {
  const task = build(2, 1);
  for (const input of [undefined, {}, { r: 0, c: 0 }, { r: -1, c: 1e-7 }, { r: "x", c: "y" }]) {
    const res = tiefpassfilter.validate(task, input);
    assert.equal(res.geloest, false);
    assert.equal(res.teiltreffer, 0);
    assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0);
  }
});
