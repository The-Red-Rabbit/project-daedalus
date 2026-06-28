// Tests für das Mini-Spiel Filterauswahl (Themenfeld 2, Station Sensorik).
// generate() und validate() sind DOM-frei und damit die autoritative Logik des Servers.
// Stufe 1: Filtertyp wählen. Stufe 2: Filtertyp + Kondensator. Stufe 3: Bandpass.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import filterauswahl from "../client/minigames/filterauswahl.js";

const build = (level, seed) => filterauswahl.generate(level, mulberry32(seed));

const FC_APPROX = 0.16;
function approxFc(r, c) { return FC_APPROX / (r * c); }

// --- generate ---

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 99, 0xbeef, 4294967295]) {
    for (const level of [1, 2, 3]) {
      assert.deepEqual(build(level, seed), build(level, seed), `Seed ${seed} L${level}`);
    }
  }
});

test("generate: Stufe 1 – alle drei Frequenzbänder können vorkommen", () => {
  const bands = new Set();
  for (let seed = 0; seed < 100; seed++) bands.add(build(1, seed).band);
  assert.ok(bands.has("niedrig") && bands.has("mittel") && bands.has("hoch"),
    "Alle drei Bänder müssen über 100 Seeds vorkommen");
});

test("generate: Stufe 1 – correctFilterType passt zum Band", () => {
  const map = { niedrig: "Tiefpass", mittel: "Bandpass", hoch: "Hochpass" };
  for (let seed = 0; seed < 200; seed++) {
    const task = build(1, seed);
    assert.equal(task.correctFilterType, map[task.band], `Seed ${seed}`);
  }
});

test("generate: Stufe 2 – kein Mittelband, hat fixedR und cOptions", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(2, seed);
    assert.notEqual(task.band, "mittel", `Seed ${seed}: Stufe 2 darf nicht mittel sein`);
    assert.ok(task.fixedR > 0, `Seed ${seed}: fixedR fehlt`);
    assert.ok(Array.isArray(task.cOptions) && task.cOptions.length > 0, `Seed ${seed}: cOptions fehlt`);
    assert.equal(task.level, 2);
  }
});

test("generate: Stufe 2 – immer mindestens ein gültiges C vorhanden", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(2, seed);
    const valid = task.cOptions.filter(c => {
      const f = approxFc(task.fixedR, c);
      return task.band === "niedrig" ? f < 500 : f > 5000;
    });
    assert.ok(valid.length > 0,
      `Seed ${seed}: kein gültiges C für Band "${task.band}" bei R = ${task.fixedR}`);
  }
});

test("generate: Stufe 3 – immer Band 'mittel', Bandpass, hat fixedR und cOptions", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(3, seed);
    assert.equal(task.band, "mittel", `Seed ${seed}`);
    assert.equal(task.correctFilterType, "Bandpass", `Seed ${seed}`);
    assert.ok(task.fixedR > 0);
    assert.ok(Array.isArray(task.cOptions) && task.cOptions.length > 0);
    assert.equal(task.level, 3);
  }
});

test("generate: Stufe 3 – immer gültiges cHochpass (< 500 Hz) und cTiefpass (> 5 kHz)", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(3, seed);
    const hasHp = task.cOptions.some(c => approxFc(task.fixedR, c) < 500);
    const hasLp = task.cOptions.some(c => approxFc(task.fixedR, c) > 5000);
    assert.ok(hasHp, `Seed ${seed}: kein gültiges C für Hochpass-Teil (fc < 500 Hz)`);
    assert.ok(hasLp, `Seed ${seed}: kein gültiges C für Tiefpass-Teil (fc > 5 kHz)`);
  }
});

// --- validate Stufe 1 ---

test("validate: Stufe 1 – richtiger Filtertyp → geloest=true, teiltreffer=1", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(1, seed);
    const res = filterauswahl.validate(task, { filterType: task.correctFilterType });
    assert.equal(res.geloest, true, `Seed ${seed}`);
    assert.equal(res.teiltreffer, 1, `Seed ${seed}`);
  }
});

test("validate: Stufe 1 – falscher Filtertyp → geloest=false, teiltreffer=0, hinweis vorhanden", () => {
  for (let seed = 0; seed < 50; seed++) {
    const task = build(1, seed);
    const wrong = ["Tiefpass", "Bandpass", "Hochpass"].find(ft => ft !== task.correctFilterType);
    const res = filterauswahl.validate(task, { filterType: wrong });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.equal(res.teiltreffer, 0, `Seed ${seed}`);
    assert.ok(res.hinweis.length > 0, `Seed ${seed}: hinweis fehlt`);
  }
});

// --- validate Stufe 2 ---

test("validate: Stufe 2 – richtiger Filtertyp und richtiges C → geloest=true, teiltreffer=1", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(2, seed);
    const sol = filterauswahl.solve(task);
    const res = filterauswahl.validate(task, sol);
    assert.equal(res.geloest, true, `Seed ${seed}: ${res.hinweis}`);
    assert.equal(res.teiltreffer, 1, `Seed ${seed}`);
  }
});

test("validate: Stufe 2 – falscher Filtertyp, richtiges C → teiltreffer=0,5", () => {
  for (let seed = 0; seed < 50; seed++) {
    const task = build(2, seed);
    const sol = filterauswahl.solve(task);
    const wrongFilter = ["Tiefpass", "Bandpass", "Hochpass"].find(ft => ft !== task.correctFilterType);
    const res = filterauswahl.validate(task, { filterType: wrongFilter, c: sol.c });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.equal(res.teiltreffer, 0.5, `Seed ${seed}`);
  }
});

test("validate: Stufe 2 – richtiger Filtertyp, falsches C → teiltreffer=0,5", () => {
  for (let seed = 0; seed < 50; seed++) {
    const task = build(2, seed);
    // Suche ein C, das nicht im Zielband liegt.
    const wrongC = task.cOptions.find(c => {
      const f = approxFc(task.fixedR, c);
      return task.band === "niedrig" ? f >= 500 : f <= 5000;
    });
    if (!wrongC) continue; // kein falsches C verfügbar (sollte nicht vorkommen)
    const res = filterauswahl.validate(task, { filterType: task.correctFilterType, c: wrongC });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.equal(res.teiltreffer, 0.5, `Seed ${seed}`);
  }
});

test("validate: Stufe 2 – beide falsch → teiltreffer=0", () => {
  const task = build(2, 42);
  const wrongFilter = ["Tiefpass", "Bandpass", "Hochpass"].find(ft => ft !== task.correctFilterType);
  const wrongC = task.cOptions.find(c => {
    const f = approxFc(task.fixedR, c);
    return task.band === "niedrig" ? f >= 500 : f <= 5000;
  });
  if (!wrongC) return;
  const res = filterauswahl.validate(task, { filterType: wrongFilter, c: wrongC });
  assert.equal(res.geloest, false);
  assert.equal(res.teiltreffer, 0);
});

// --- validate Stufe 3 ---

test("validate: Stufe 3 – korrektes cHochpass und cTiefpass → geloest=true, teiltreffer=1", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(3, seed);
    const sol = filterauswahl.solve(task);
    const res = filterauswahl.validate(task, sol);
    assert.equal(res.geloest, true, `Seed ${seed}: ${res.hinweis}`);
    assert.equal(res.teiltreffer, 1, `Seed ${seed}`);
  }
});

test("validate: Stufe 3 – nur cHochpass korrekt → geloest=false, teiltreffer=0,5", () => {
  for (let seed = 0; seed < 50; seed++) {
    const task = build(3, seed);
    const sol = filterauswahl.solve(task);
    // Wähle ein C für Tiefpass-Teil, das fc ≤ 5 kHz ergibt (falsch).
    const badLp = task.cOptions.find(c => approxFc(task.fixedR, c) <= 5000);
    if (!badLp) continue;
    const res = filterauswahl.validate(task, { cHochpass: sol.cHochpass, cTiefpass: badLp });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.equal(res.teiltreffer, 0.5, `Seed ${seed}`);
  }
});

test("validate: Stufe 3 – nur cTiefpass korrekt → geloest=false, teiltreffer=0,5", () => {
  for (let seed = 0; seed < 50; seed++) {
    const task = build(3, seed);
    const sol = filterauswahl.solve(task);
    // Wähle ein C für Hochpass-Teil, das fc ≥ 500 Hz ergibt (falsch).
    const badHp = task.cOptions.find(c => approxFc(task.fixedR, c) >= 500);
    if (!badHp) continue;
    const res = filterauswahl.validate(task, { cHochpass: badHp, cTiefpass: sol.cTiefpass });
    assert.equal(res.geloest, false, `Seed ${seed}`);
    assert.equal(res.teiltreffer, 0.5, `Seed ${seed}`);
  }
});

// --- ungültige Eingaben ---

test("validate: ungültige Eingabe → geloest=false, teiltreffer=0, hinweis vorhanden", () => {
  for (const level of [1, 2, 3]) {
    const task = build(level, 5);
    for (const input of [undefined, null, {}]) {
      const res = filterauswahl.validate(task, input);
      assert.equal(res.geloest, false, `Level ${level}, input=${JSON.stringify(input)}`);
      assert.equal(res.teiltreffer, 0, `Level ${level}`);
      assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0,
        `Level ${level}: hinweis fehlt`);
    }
  }
});

// --- solve ---

test("solve: liefert für alle Stufen und Seeds eine vollständig korrekte Eingabe", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      const sol = filterauswahl.solve(task);
      const res = filterauswahl.validate(task, sol);
      assert.equal(res.geloest, true, `Seed ${seed} L${level}: ${res.hinweis}`);
      assert.equal(res.teiltreffer, 1, `Seed ${seed} L${level}`);
    }
  }
});
