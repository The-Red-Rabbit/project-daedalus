// Tests fuer die Spielkern-Logik in server/game.js: Rollen (Operator und
// Co-Pilot), Rotation zwischen Sektoren, adaptive Schwierigkeit, Huellen-Verfall
// durch Vernachlaessigung, Kopplung, Statusverfall, Leitstand und Spielende.

import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../server/game.js";
import { registry } from "../client/minigames/registry.js";
import { mulberry32 } from "../shared/rng.js";

const ONE = [{ id: "bc", name: "Bordcomputer", minigame: "bordcomputer" }];
const TWO = [
  { id: "a", name: "A", minigame: "bordcomputer" },
  { id: "b", name: "B", minigame: "bordcomputer" },
];

// Loest die aktuelle Aufgabe eines Teilnehmers korrekt (wie ein perfekter Spieler).
function answerFor(task) {
  const mod = registry[task.minigame];
  const built = mod.generate(task.level, mulberry32(task.seed));
  if (task.minigame === "bordcomputer") return { gate: built.gate };
  const rs = built.adjust.r ? built.rOptions : [built.rFixed];
  let best = null;
  for (const r of rs) for (const c of built.cOptions) {
    const e = Math.abs(1 / (2 * Math.PI * r * c) - built.targetFc);
    if (!best || e < best.err) best = { r, c, err: e };
  }
  return { r: best.r, c: best.c };
}
function solveCorrectly(game, pid) {
  const task = game.assignTask(pid);
  return game.solve(pid, answerFor(task));
}

test("Beitritt: die erste Person wird Operator der ersten Station", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  const a = game.addParticipant("p1", "Anna");
  assert.equal(a.role, "operator");
  assert.equal(a.stationId, "bc");
  assert.equal(game.hostState().crew, 1);
});

test("Beitritt: ueberzaehlige Personen werden Co-Piloten (kein Warten)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  const b = game.addParticipant("p2", "Ben");
  assert.equal(b.role, "supporter");
  assert.equal(b.stationId, "bc");
  assert.equal(game.assignTask("p2").minigame, "bordcomputer"); // bekommt sofort eine Aufgabe
});

test("Co-Pilot: eine Loesung hebt die Stabilitaet der unterstuetzten Station", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna"); // Operator, stabil 0
  game.addParticipant("p2", "Ben"); // Co-Pilot
  assert.equal(game.station("bc").status, "achtung");
  solveCorrectly(game, "p2");
  assert.ok(game.station("bc").stability > 0);
  assert.equal(game.station("bc").status, "stabil");
});

test("Rotation: nach einem Sektor sitzt jede Person woanders", () => {
  const game = createGame({ stations: TWO, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");
  game.addParticipant("p3", "Cem");
  const before = ["p1", "p2", "p3"].map((id) => game.assignmentOf(id).stationId + game.assignmentOf(id).role);
  game.rotate();
  const after = ["p1", "p2", "p3"].map((id) => game.assignmentOf(id).stationId + game.assignmentOf(id).role);
  for (let i = 0; i < 3; i++) assert.notEqual(before[i], after[i], `Person ${i + 1} hat die Rolle gewechselt`);
  // beide Stationen haben weiterhin genau einen Operator
  const ops = ["p1", "p2", "p3"].filter((id) => game.assignmentOf(id).role === "operator");
  assert.equal(ops.length, 2);
});

test("Operator-Ausfall: ein Co-Pilot rueckt nach", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna"); // Operator
  game.addParticipant("p2", "Ben"); // Co-Pilot
  const res = game.removeParticipant("p1");
  assert.equal(res.promoted.id, "p2");
  assert.equal(game.assignmentOf("p2").role, "operator");
});

test("Adaptiv: schnelle Loesungen erhoehen die Stufe (bis 3)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1"); // sofort geloest -> schneller als FAST
  assert.equal(game.assignTask("p1").level, 2);
  solveCorrectly(game, "p1");
  assert.equal(game.assignTask("p1").level, 3);
  solveCorrectly(game, "p1");
  assert.equal(game.assignTask("p1").level, 3); // gedeckelt
});

test("Adaptiv: langsame Loesungen senken die Stufe (bis 1)", () => {
  const game = createGame({ stations: ONE, baseLevel: 2 });
  game.addParticipant("p1", "Anna");
  const task = game.assignTask("p1"); // Stufe 2
  for (let i = 0; i < 20; i++) game.tick(1); // ueber SLOW_SOLVE_SEC vergehen lassen
  game.solve("p1", answerFor(task));
  assert.equal(game.assignTask("p1").level, 1);
});

test("Huelle: eine unbesetzte Station zieht 1,5 pro Sekunde ab", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.tick(1);
  assert.equal(game.hostState().shared.huelle, 98.5);
});

test("Huelle: besetzt-instabil kostet weniger, stabil nichts", () => {
  const warn = createGame({ stations: ONE, baseLevel: 1 });
  warn.addParticipant("p1", "Anna");
  warn.tick(1);
  assert.equal(Math.round(warn.hostState().shared.huelle * 10) / 10, 99.4); // 0.6

  const stable = createGame({ stations: ONE, baseLevel: 1 });
  stable.addParticipant("p1", "Anna");
  solveCorrectly(stable, "p1");
  stable.tick(1);
  assert.equal(stable.hostState().shared.huelle, 100);
});

test("Kopplung: ein stabiler Operator genuegt bei einer besetzten Station", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1");
  game.tick(1);
  assert.ok(game.hostState().shared.fortschritt > 0);
});

test("Statusverfall und Nachjustieren", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1");
  for (let i = 0; i < 10; i++) game.tick(1);
  assert.equal(game.station("bc").status, "achtung");
  solveCorrectly(game, "p1");
  assert.equal(game.station("bc").status, "stabil");
});

test("Leitstand: Asteroidenwelle senkt die Huelle um 22, setBaseLevel begrenzt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  assert.deepEqual(game.triggerEvent("asteroid"), { kind: "asteroid", damage: 22 });
  assert.equal(game.hostState().shared.huelle, 78);
  assert.equal(game.triggerEvent("unbekannt"), null);
  assert.equal(game.setBaseLevel(9), 3);
  assert.equal(game.assignTask("p1").level, 3);
  assert.equal(game.setBaseLevel(0), 1);
  assert.equal(game.assignTask("p1").level, 1);
});

test("Sektorfluss und Sieg", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  for (let i = 0; i < 20 && game.hostState().sector < 2; i++) {
    solveCorrectly(game, "p1");
    game.tick(1);
  }
  assert.ok(game.hostState().sector >= 2);
  for (let i = 0; i < 80 && game.hostState().phase === "running"; i++) {
    solveCorrectly(game, "p1");
    game.tick(1);
  }
  assert.equal(game.hostState().phase, "won");
  assert.equal(game.hostState().sector, 3);
});

test("Niederlage: leere Huelle beendet den Durchlauf", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 }); // unbesetzt -> Dauerverlust
  for (let i = 0; i < 100 && game.hostState().phase === "running"; i++) game.tick(1);
  assert.equal(game.hostState().phase, "lost");
  assert.equal(game.hostState().shared.huelle, 0);
});

test("reset: neuer Anlauf setzt Werte zurueck, Crew bleibt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1");
  game.triggerEvent("asteroid");
  game.reset();
  const hs = game.hostState();
  assert.equal(hs.phase, "running");
  assert.equal(hs.sector, 1);
  assert.deepEqual(hs.shared, { huelle: 100, energie: 100, fortschritt: 0 });
  assert.equal(game.assignmentOf("p1").role, "operator"); // Crew bleibt
  assert.equal(game.station("bc").status, "achtung"); // besetzt, aber nicht stabil
});
