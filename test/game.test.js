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
