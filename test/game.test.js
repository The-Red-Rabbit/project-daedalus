// Tests fuer die Spielkern-Logik in server/game.js: Huellen-Verfall durch
// Leerlauf und Vernachlaessigung, die Kopplung (Fortschritt nur bei genug
// stabilen Stationen), der Statusverfall mit Nachjustieren sowie die
// Leitstand-Aktionen (Asteroidenwelle, Grundschwierigkeit).

import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../server/game.js";
import { registry } from "../client/minigames/registry.js";
import { mulberry32 } from "../shared/rng.js";

const ONE = [{ id: "bordcomputer", name: "Bordcomputer", minigame: "bordcomputer" }];
const FOUR = ["s1", "s2", "s3", "s4"].map((id) => ({ id, name: id, minigame: "bordcomputer" }));

// Stabilisiert eine Station ueber denselben Weg wie der Server: Aufgabe aus
// Seed nachbauen und das korrekte Bauteil einreichen.
function solveCorrectly(game, id) {
  const task = game.assignTask(game.station(id));
  const built = registry[task.minigame].generate(task.level, mulberry32(task.seed));
  return game.solve(id, { gate: built.gate });
}

test("Huelle: eine unbesetzte Station zieht 1,5 pro Sekunde ab", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.tick(1);
  assert.equal(game.hostState().shared.huelle, 98.5); // 100 - 1.5
});

test("Huelle: faellt nicht unter 0", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.tick(100);
  assert.equal(game.hostState().shared.huelle, 0);
});

test("Huelle: eine besetzte, aber nicht stabile Station kostet weniger", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  game.tick(1);
  assert.equal(Math.round(game.hostState().shared.huelle * 10) / 10, 99.4); // 100 - 0.6
});

test("Huelle: eine stabile Station kostet nichts", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  solveCorrectly(game, "bordcomputer");
  game.tick(1);
  assert.equal(game.hostState().shared.huelle, 100);
});

test("Kopplung: bei einer Station genuegt diese eine stabil fuer Fortschritt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  const res = solveCorrectly(game, "bordcomputer");
  assert.equal(res.geloest, true);
  assert.equal(game.station("bordcomputer").status, "stabil");
  game.tick(1);
  assert.ok(Math.abs(game.hostState().shared.fortschritt - 8) < 1e-9); // PROGRESS_PER_SEC
});

test("Kopplung: Fortschritt erst ab der Mehrheit der Stationen (3 von 4)", () => {
  const game = createGame({ stations: FOUR, baseLevel: 1 });
  for (const s of FOUR) game.claimStation(s.id, { label: "Crew" });

  solveCorrectly(game, "s1");
  solveCorrectly(game, "s2");
  game.tick(1); // 2 von 4 stabil -> noch kein Fortschritt
  assert.equal(game.hostState().shared.fortschritt, 0);

  solveCorrectly(game, "s3");
  game.tick(1); // 3 von 4 stabil -> Schwelle erreicht
  assert.ok(game.hostState().shared.fortschritt > 0);
});

test("Statusverfall: stabil faellt ohne Pflege auf achtung zurueck", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  solveCorrectly(game, "bordcomputer");
  assert.equal(game.station("bordcomputer").status, "stabil");
  for (let i = 0; i < 10; i++) game.tick(1); // ~10 s ohne neue Loesung
  assert.equal(game.station("bordcomputer").status, "achtung");
  assert.equal(game.station("bordcomputer").stability, 0);
});

test("Nachjustieren: erneutes Loesen macht die Station wieder stabil", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  solveCorrectly(game, "bordcomputer");
  for (let i = 0; i < 10; i++) game.tick(1);
  assert.equal(game.station("bordcomputer").status, "achtung");
  solveCorrectly(game, "bordcomputer");
  assert.equal(game.station("bordcomputer").status, "stabil");
});

test("releaseStation: gibt die Station frei und setzt sie auf kritisch zurueck", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  solveCorrectly(game, "bordcomputer");
  game.releaseStation("bordcomputer");
  const s = game.station("bordcomputer");
  assert.equal(s.owner, null);
  assert.equal(s.task, null);
  assert.equal(s.stability, 0);
  assert.equal(s.status, "kritisch");
  assert.deepEqual(game.freeStations(), [{ id: "bordcomputer", name: "Bordcomputer" }]);
});

test("Leitstand: eine Asteroidenwelle senkt die Huelle um 22", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  const ev = game.triggerEvent("asteroid");
  assert.deepEqual(ev, { kind: "asteroid", damage: 22 });
  assert.equal(game.hostState().shared.huelle, 78);
  assert.equal(game.triggerEvent("unbekannt"), null);
  assert.equal(game.hostState().shared.huelle, 78); // unveraendert
});

test("Leitstand: setBaseLevel begrenzt auf 1..3 und steuert neue Aufgaben", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  assert.equal(game.setBaseLevel(5), 3);
  assert.equal(game.assignTask(game.station("bordcomputer")).level, 3);
  assert.equal(game.setBaseLevel(0), 1);
  assert.equal(game.assignTask(game.station("bordcomputer")).level, 1);
});

// Haelt die Station ueber wiederholtes Loesen stabil und tickt eine Sekunde.
function holdStableTick(game, id) {
  solveCorrectly(game, id);
  game.tick(1);
}

test("Sektorfluss: volle Fortschrittsleiste fuehrt in den naechsten Sektor", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  for (let i = 0; i < 20 && game.hostState().sector < 2; i++) holdStableTick(game, "bordcomputer");
  const hs = game.hostState();
  assert.equal(hs.sector, 2);
  assert.ok(hs.shared.fortschritt < 100); // nach dem Wechsel zurueckgesetzt
});

test("Sieg: nach dem letzten Sektor endet der Durchlauf als Sieg", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  for (let i = 0; i < 80 && game.hostState().phase === "running"; i++) holdStableTick(game, "bordcomputer");
  const hs = game.hostState();
  assert.equal(hs.phase, "won");
  assert.equal(hs.sector, 3); // MAX_SECTORS
  // nach Spielende ruht die Simulation
  const before = game.hostState().shared.fortschritt;
  game.tick(1);
  assert.equal(game.hostState().shared.fortschritt, before);
});

test("Niederlage: leere Huelle beendet den Durchlauf", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 }); // unbesetzt -> Dauerverlust
  for (let i = 0; i < 100 && game.hostState().phase === "running"; i++) game.tick(1);
  const hs = game.hostState();
  assert.equal(hs.phase, "lost");
  assert.equal(hs.shared.huelle, 0);
});

test("Leitstand: nach Spielende wird kein Ereignis mehr verarbeitet", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  for (let i = 0; i < 100 && game.hostState().phase === "running"; i++) game.tick(1);
  assert.equal(game.hostState().phase, "lost");
  assert.equal(game.triggerEvent("asteroid"), null);
});

test("reset: neuer Anlauf setzt Werte zurueck, Crew bleibt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  solveCorrectly(game, "bordcomputer");
  game.triggerEvent("asteroid");
  game.reset();
  const hs = game.hostState();
  assert.equal(hs.phase, "running");
  assert.equal(hs.sector, 1);
  assert.deepEqual(hs.shared, { huelle: 100, energie: 100, fortschritt: 0 });
  const s = game.station("bordcomputer");
  assert.equal(s.owner.label, "Crew"); // Crew bleibt
  assert.equal(s.task, null); // Aufgabe wird neu vergeben
  assert.equal(s.status, "achtung"); // besetzt, aber nicht stabil
});
