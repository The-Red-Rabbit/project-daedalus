// Tests fuer das Mini-Spiel Tiefpassfilter (Kapazitaet aus zwei Kondensatoren).
// generate() und validate() sind DOM-frei (dieser Test laeuft unter Node) und
// die autoritative Logik des Servers. f_c = 1 / (2*pi*R*C), C aus C1 und C2.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import tiefpassfilter from "../client/minigames/tiefpassfilter.js";

const build = (level, seed) => tiefpassfilter.generate(level, mulberry32(seed));
const cutoff = (r, c) => 1 / (2 * Math.PI * r * c);
const combineC = (c1, c2, mode) => (mode === "parallel" ? c1 + c2 : (c1 * c2) / (c1 + c2));

// Beste erreichbare Kombination fuer eine Aufgabe (so wie ein perfekter Spieler).
function bestCombo(task) {
  const rs = task.adjust.r ? task.rOptions : [task.rFixed];
  let best = null;
  for (const r of rs) {
    for (const c1 of task.cOptions) {
      for (const c2 of task.cOptions) {
        for (const mode of task.modes) {
          const err = Math.abs(cutoff(r, combineC(c1, c2, mode)) - task.targetFc);
          if (!best || err < best.err) best = { r, c1, c2, mode, err };
        }
      }
    }
  }
  return best;
}

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 777, 0x12345, 4294967295]) {
    assert.deepEqual(build(2, seed), build(2, seed));
  }
});

test("generate: Stufe steuert Toleranz und ob R fest ist", () => {
  const l1 = build(1, 5);
  const l2 = build(2, 5);
  const l3 = build(3, 5);
  assert.equal(l1.adjust.r, false);
  assert.equal(l2.adjust.r, true);
  assert.equal(l3.adjust.r, true);
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
    const start = cutoff(task.startR, combineC(task.startC1, task.startC2, task.startMode));
    const relErr = Math.abs(start - task.targetFc) / task.targetFc;
    assert.ok(relErr > task.tolerance, `Start schon geloest bei Seed ${seed}`);
  }
});

test("solve: die beste Kombination loest die Aufgabe vollstaendig (alle Stufen)", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      const res = tiefpassfilter.validate(task, tiefpassfilter.solve(task));
      assert.equal(res.geloest, true, `Seed ${seed} L${level}`);
      assert.equal(res.teiltreffer, 1);
    }
  }
});

test("validate: nutzt die Reihen-/Parallelregel der Kapazitaeten", () => {
  const task = build(2, 7);
  const r = task.rOptions[0];
  const c1 = task.cOptions[2];
  const c2 = task.cOptions[4];
  // parallel ergibt das groessere C und damit die kleinere Grenzfrequenz.
  assert.ok(cutoff(r, combineC(c1, c2, "parallel")) < cutoff(r, combineC(c1, c2, "reihe")));
  // validate deckt sich mit der unabhaengigen Rechnung.
  for (const mode of task.modes) {
    const fc = cutoff(r, combineC(c1, c2, mode));
    const expect = Math.abs(fc - task.targetFc) / task.targetFc <= task.tolerance;
    assert.equal(tiefpassfilter.validate(task, { r, c1, c2, mode }).geloest, expect, `Modus ${mode}`);
  }
});

test("validate: eine weit entfernte Einstellung loest nicht, teiltreffer in [0,1]", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(1, seed);
    // weitester Wert vom Ziel ueber die erreichbaren Kombinationen
    let worst = null;
    for (const c1 of task.cOptions) {
      for (const c2 of task.cOptions) {
        for (const mode of task.modes) {
          const err = Math.abs(cutoff(task.rFixed, combineC(c1, c2, mode)) - task.targetFc);
          if (!worst || err > worst.err) worst = { c1, c2, mode, err };
        }
      }
    }
    const res = tiefpassfilter.validate(task, { r: task.rFixed, c1: worst.c1, c2: worst.c2, mode: worst.mode });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.ok(res.teiltreffer >= 0 && res.teiltreffer <= 1);
  }
});

test("validate: gibt eine Richtung an (zu hoch / zu niedrig / abgestimmt)", () => {
  const task = build(1, 1);
  const big = task.cOptions[task.cOptions.length - 1];
  const small = task.cOptions[0];
  const low = tiefpassfilter.validate(task, { r: task.rFixed, c1: big, c2: big, mode: "parallel" }); // grosses C -> tiefe f_c
  const high = tiefpassfilter.validate(task, { r: task.rFixed, c1: small, c2: small, mode: "reihe" }); // kleines C -> hohe f_c
  assert.ok(/niedrig|hoch|abgestimmt/.test(low.hinweis));
  assert.ok(/niedrig|hoch|abgestimmt/.test(high.hinweis));
});

test("validate: fehlende oder ungueltige Eingabe ergibt 0 und einen Hinweis", () => {
  const task = build(2, 1);
  for (const input of [
    undefined,
    {},
    { r: 0, c1: 0, c2: 0, mode: "reihe" },
    { r: 1000, c1: 1e-7, c2: 1e-7, mode: "krumm" }, // unbekannter Modus
    { r: 1000, c1: 1e-7, mode: "reihe" }, // C2 fehlt
    { r: "x", c1: "y", c2: "z", mode: "parallel" },
  ]) {
    const res = tiefpassfilter.validate(task, input);
    assert.equal(res.geloest, false);
    assert.equal(res.teiltreffer, 0);
    assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0);
  }
});
