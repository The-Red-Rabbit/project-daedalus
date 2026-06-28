// Tests fuer das Mini-Spiel Bauteile austauschen (Station Reaktor).
// generate() und validate() sind DOM-frei und damit die autoritative Logik des Servers.
// Stufe 1: 4 Bauteile, Name in der Aufgabe. Stufe 2: 5 Bauteile. Stufe 3: Fehlerbeschreibung.

import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../shared/rng.js";
import bauteiltausch from "../client/minigames/bauteiltausch.js";

const build = (level, seed) => bauteiltausch.generate(level, mulberry32(seed));

// --- generate ---

test("generate: gleicher Seed und gleiche Stufe ergeben dieselbe Aufgabe", () => {
  for (const seed of [1, 42, 0xbeef, 4294967295]) {
    for (const level of [1, 2, 3]) {
      assert.deepEqual(build(level, seed), build(level, seed), `Seed ${seed} L${level}`);
    }
  }
});

test("generate: Stufe 1 – genau 4 Auswahlmoeglichkeiten", () => {
  for (let seed = 0; seed < 100; seed++) {
    const task = build(1, seed);
    assert.equal(task.choices.length, 4, `Seed ${seed}`);
    assert.equal(task.level, 1);
  }
});

test("generate: Stufe 2 – genau 5 Auswahlmoeglichkeiten", () => {
  for (let seed = 0; seed < 100; seed++) {
    const task = build(2, seed);
    assert.equal(task.choices.length, 5, `Seed ${seed}`);
    assert.equal(task.level, 2);
  }
});

test("generate: Stufe 3 – 5 Auswahlmoeglichkeiten und Fehlerbeschreibung als Prompt", () => {
  for (let seed = 0; seed < 100; seed++) {
    const task = build(3, seed);
    assert.equal(task.choices.length, 5, `Seed ${seed}`);
    assert.equal(task.level, 3);
    assert.ok(task.prompt.length > 10, `Seed ${seed}: Prompt zu kurz`);
    // Stufe-3-Prompt ist keine formatierte Bauteilzeile (enthaelt kein »Defektes Bauteil:«)
    assert.ok(!task.prompt.startsWith("Defektes Bauteil:"), `Seed ${seed}: Prompt ist kein Fehlerhinweis`);
  }
});

test("generate: Zielbauteil ist immer in den Choices enthalten", () => {
  for (let seed = 0; seed < 200; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      assert.ok(task.choices.includes(task.target), `Seed ${seed} L${level}: target fehlt in choices`);
    }
  }
});

test("generate: Stufe 1 – 'transistor' kommt nie in den Choices vor", () => {
  for (let seed = 0; seed < 200; seed++) {
    const task = build(1, seed);
    assert.ok(!task.choices.includes("transistor"), `Seed ${seed}: transistor darf in Stufe 1 nicht erscheinen`);
  }
});

test("generate: Stufe 2/3 – alle 5 Bauteile immer in den Choices", () => {
  const ALL_IDS = ["widerstand", "kondensator", "spule", "diode", "transistor"];
  for (let seed = 0; seed < 200; seed++) {
    for (const level of [2, 3]) {
      const task = build(level, seed);
      for (const id of ALL_IDS) {
        assert.ok(task.choices.includes(id), `Seed ${seed} L${level}: fehlt ${id}`);
      }
    }
  }
});

test("generate: alle vier Stufe-1-Bauteile koennen als Ziel erscheinen", () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) seen.add(build(1, seed).target);
  for (const id of ["widerstand", "kondensator", "spule", "diode"]) {
    assert.ok(seen.has(id), `${id} muss als Ziel erscheinen koennen`);
  }
});

// --- validate ---

test("validate: richtiges Bauteil → geloest=true, teiltreffer=1, hinweis vorhanden", () => {
  for (let seed = 0; seed < 200; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      const sol = bauteiltausch.solve(task);
      const res = bauteiltausch.validate(task, sol);
      assert.equal(res.geloest, true, `Seed ${seed} L${level}: ${res.hinweis}`);
      assert.equal(res.teiltreffer, 1, `Seed ${seed} L${level}`);
      assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0, `Seed ${seed} L${level}: hinweis fehlt`);
    }
  }
});

test("validate: falsches Bauteil → geloest=false, teiltreffer=0, hinweis vorhanden", () => {
  for (let seed = 0; seed < 100; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      const wrong = task.choices.find(id => id !== task.target);
      if (!wrong) continue;
      const res = bauteiltausch.validate(task, { id: wrong });
      assert.equal(res.geloest, false, `Seed ${seed} L${level}`);
      assert.equal(res.teiltreffer, 0, `Seed ${seed} L${level}`);
      assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0, `Seed ${seed} L${level}: hinweis fehlt`);
    }
  }
});

test("validate: ungueltiger Input → geloest=false, teiltreffer=0, hinweis vorhanden", () => {
  for (const level of [1, 2, 3]) {
    const task = build(level, 5);
    for (const input of [undefined, null, {}, { id: null }, { id: "unbekannt" }]) {
      const res = bauteiltausch.validate(task, input);
      assert.equal(res.geloest, false, `L${level}, input=${JSON.stringify(input)}`);
      assert.equal(res.teiltreffer, 0, `L${level}, input=${JSON.stringify(input)}`);
      assert.ok(typeof res.hinweis === "string" && res.hinweis.length > 0,
        `L${level}: hinweis fehlt bei ${JSON.stringify(input)}`);
    }
  }
});

// --- solve ---

test("solve: liefert fuer alle Stufen und Seeds eine vollstaendig korrekte Eingabe", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const level of [1, 2, 3]) {
      const task = build(level, seed);
      const sol = bauteiltausch.solve(task);
      const res = bauteiltausch.validate(task, sol);
      assert.equal(res.geloest, true, `Seed ${seed} L${level}: ${res.hinweis}`);
      assert.equal(res.teiltreffer, 1, `Seed ${seed} L${level}`);
    }
  }
});
