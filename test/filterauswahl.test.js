// Tests für das Mini-Spiel Filterauswahl (neu, Themenfeld 2, Station Sensorik).
// Drei Asteroiden pro Runde; Spieler wählt Tiefpass / Hochpass / Bandpass.
// generate() und validate() sind DOM-frei – autoritative Logik des Servers.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import filterauswahl from "../client/minigames/filterauswahl.js";

const build = (level, seed) => filterauswahl.generate(level, mulberry32(seed));

// ─── generate ────────────────────────────────────────────────────────────────

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 99, 0xbeef, 4294967295]) {
    for (const level of [1, 2, 3]) {
      assert.deepEqual(build(level, seed), build(level, seed), `Seed ${seed} L${level}`);
    }
  }
});

test("generate: immer genau 3 Asteroiden pro Runde", () => {
  for (const level of [1, 2, 3]) {
    for (let seed = 0; seed < 50; seed++) {
      const task = build(level, seed);
      assert.equal(task.asteroids.length, 3, `Stufe ${level} Seed ${seed}`);
    }
  }
});

test("generate: Stufe 1 – fcLow aus [500,1000,2000,5000], kein fcHigh, nur Hz", () => {
  const valid = new Set([500, 1000, 2000, 5000]);
  for (let seed = 0; seed < 100; seed++) {
    const task = build(1, seed);
    assert.ok(valid.has(task.fcLow), `Seed ${seed}: fcLow ${task.fcLow} nicht in Kandidatenliste`);
    assert.equal(task.fcHigh, undefined, `Seed ${seed}`);
    assert.equal(task.level, 1);
    for (const a of task.asteroids) {
      assert.equal(a.displayUnit, "Hz", `Seed ${seed}: Stufe 1 darf nur Hz zeigen`);
    }
  }
});

test("generate: Stufe 1 – kein Bandpass-Typ", () => {
  for (let seed = 0; seed < 100; seed++) {
    const task = build(1, seed);
    for (const a of task.asteroids) {
      assert.notEqual(a.correct, "Bandpass", `Seed ${seed}`);
    }
  }
});

test("generate: Stufe 1 – mindestens Tiefpass und Hochpass über viele Seeds", () => {
  const types = new Set();
  for (let seed = 0; seed < 100; seed++) {
    build(1, seed).asteroids.forEach(a => types.add(a.correct));
  }
  assert.ok(types.has("Tiefpass"), "Tiefpass muss vorkommen");
  assert.ok(types.has("Hochpass"), "Hochpass muss vorkommen");
});

test("generate: Stufe 2 – fcLow aus [200,500,1000,2000], kein Bandpass-Typ", () => {
  const valid = new Set([200, 500, 1000, 2000]);
  for (let seed = 0; seed < 100; seed++) {
    const task = build(2, seed);
    assert.ok(valid.has(task.fcLow), `Seed ${seed}: fcLow ${task.fcLow} nicht in Kandidatenliste`);
    assert.equal(task.fcHigh, undefined, `Seed ${seed}`);
    for (const a of task.asteroids) {
      assert.notEqual(a.correct, "Bandpass", `Seed ${seed}`);
    }
  }
});

test("generate: Stufe 3 – fcLow/fcHigh aus Kandidatenlisten, fL < fH, alle drei Typen einmal", () => {
  const validLow  = new Set([100, 200, 300, 500]);
  const validHigh = new Set([2000, 3000, 5000, 10000]);
  for (let seed = 0; seed < 100; seed++) {
    const task = build(3, seed);
    assert.ok(validLow.has(task.fcLow),   `Seed ${seed}: fcLow ${task.fcLow} nicht in Kandidatenliste`);
    assert.ok(validHigh.has(task.fcHigh), `Seed ${seed}: fcHigh ${task.fcHigh} nicht in Kandidatenliste`);
    assert.ok(task.fcLow < task.fcHigh,   `Seed ${seed}: fL ${task.fcLow} >= fH ${task.fcHigh}`);
    const types = task.asteroids.map(a => a.correct).sort().join(",");
    assert.equal(types, "Bandpass,Hochpass,Tiefpass", `Seed ${seed}: ${types}`);
  }
});

test("generate: Frequenzen liegen sicher im richtigen Band (alle Stufen)", () => {
  for (const level of [1, 2, 3]) {
    for (let seed = 0; seed < 50; seed++) {
      const task = build(level, seed);
      for (const a of task.asteroids) {
        if (a.correct === "Tiefpass") {
          assert.ok(a.hz < task.fcLow,
            `Stufe ${level} Seed ${seed}: Tiefpass-Hz ${a.hz} >= fcLow ${task.fcLow}`);
        }
        if (a.correct === "Hochpass") {
          const fcRef = task.fcHigh ?? task.fcLow;
          assert.ok(a.hz > fcRef,
            `Stufe ${level} Seed ${seed}: Hochpass-Hz ${a.hz} <= fcRef ${fcRef}`);
        }
        if (a.correct === "Bandpass") {
          assert.ok(a.hz > task.fcLow && a.hz < task.fcHigh,
            `Stufe ${level} Seed ${seed}: Bandpass-Hz ${a.hz} außerhalb [${task.fcLow}, ${task.fcHigh}]`);
        }
      }
    }
  }
});

test("generate: displayValue und displayUnit stimmen mit hz überein", () => {
  for (const level of [1, 2, 3]) {
    for (let seed = 0; seed < 30; seed++) {
      const task = build(level, seed);
      for (const a of task.asteroids) {
        const { hz, displayValue, displayUnit } = a;
        let reconstructed;
        if (displayUnit === "kHz") reconstructed = displayValue * 1000;
        else if (displayUnit === "MHz") reconstructed = displayValue * 1e6;
        else reconstructed = displayValue;
        // Toleranz wegen toPrecision-Rundung
        assert.ok(Math.abs(reconstructed - hz) / hz < 0.01,
          `Stufe ${level} Seed ${seed}: ${displayValue} ${displayUnit} ≠ ${hz} Hz`);
      }
    }
  }
});

// ─── validate ────────────────────────────────────────────────────────────────

test("validate: alle korrekte Antworten → geloest=true, teiltreffer=1", () => {
  for (const level of [1, 2, 3]) {
    for (let seed = 0; seed < 100; seed++) {
      const task = build(level, seed);
      const sol = filterauswahl.solve(task);
      const res = filterauswahl.validate(task, sol);
      assert.equal(res.geloest, true, `Stufe ${level} Seed ${seed}: ${res.hinweis}`);
      assert.equal(res.teiltreffer, 1, `Stufe ${level} Seed ${seed}`);
    }
  }
});

test("validate: alle falsch → geloest=false, teiltreffer=0", () => {
  for (const level of [1, 2, 3]) {
    const task = build(level, 7);
    const allWrong = task.asteroids.map(a =>
      a.correct === "Tiefpass" ? "Hochpass" : "Tiefpass"
    );
    const res = filterauswahl.validate(task, { answers: allWrong });
    assert.equal(res.geloest, false, `Stufe ${level}`);
    assert.equal(res.teiltreffer, 0, `Stufe ${level}`);
  }
});

test("validate: 1 von 3 korrekt → teiltreffer ≈ 0,333", () => {
  const task = build(1, 3);
  const answers = task.asteroids.map((a, i) =>
    i === 0 ? a.correct : (a.correct === "Tiefpass" ? "Hochpass" : "Tiefpass")
  );
  const res = filterauswahl.validate(task, { answers });
  assert.ok(!res.geloest);
  assert.ok(Math.abs(res.teiltreffer - 1 / 3) < 0.001);
});

test("validate: 2 von 3 korrekt → teiltreffer ≈ 0,667", () => {
  const task = build(1, 3);
  const answers = task.asteroids.map((a, i) =>
    i < 2 ? a.correct : (a.correct === "Tiefpass" ? "Hochpass" : "Tiefpass")
  );
  const res = filterauswahl.validate(task, { answers });
  assert.ok(!res.geloest);
  assert.ok(Math.abs(res.teiltreffer - 2 / 3) < 0.001);
});

test("validate: null-Antworten (abgebrochene Runde) zählen als falsch", () => {
  const task = build(1, 1);
  const res = filterauswahl.validate(task, { answers: [null, null, null] });
  assert.equal(res.geloest, false);
  assert.equal(res.teiltreffer, 0);
});

test("validate: ungültige Eingabe → geloest=false, teiltreffer=0, hinweis vorhanden", () => {
  for (const level of [1, 2, 3]) {
    const task = build(level, 5);
    for (const input of [undefined, null, {}]) {
      const res = filterauswahl.validate(task, input);
      assert.equal(res.geloest, false, `Stufe ${level}, input=${JSON.stringify(input)}`);
      assert.equal(res.teiltreffer, 0, `Stufe ${level}`);
      assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0,
        `Stufe ${level}: hinweis fehlt`);
    }
  }
});

// ─── solve ───────────────────────────────────────────────────────────────────

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

// ─── hint ─────────────────────────────────────────────────────────────────────

test("hint: enthält Tiefpass und Hochpass für alle Stufen", () => {
  for (const level of [1, 2, 3]) {
    const h = filterauswahl.hint(build(level, 0));
    assert.ok(typeof h === "string" && h.length > 0, `Stufe ${level}: kein String`);
    assert.ok(h.includes("Tiefpass"), `Stufe ${level}: kein 'Tiefpass'`);
    assert.ok(h.includes("Hochpass"), `Stufe ${level}: kein 'Hochpass'`);
  }
});

test("hint: enthält Bandpass nur in Stufe 3", () => {
  assert.ok(!filterauswahl.hint(build(1, 0)).includes("Bandpass"), "Stufe 1 darf kein Bandpass enthalten");
  assert.ok(!filterauswahl.hint(build(2, 0)).includes("Bandpass"), "Stufe 2 darf kein Bandpass enthalten");
  assert.ok( filterauswahl.hint(build(3, 0)).includes("Bandpass"), "Stufe 3 muss Bandpass enthalten");
});
