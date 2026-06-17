// Tests fuer die Spielkern-Logik in server/game.js: Leerlauf-Verfall der
// Huelle und die Kopplung (Fortschritt nur bei genug stabilen Stationen).

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

test("Leerlauf: jede unbesetzte Station zieht 2 Huelle pro Sekunde ab", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.tick(1);
  assert.equal(game.hostState().shared.huelle, 98); // 100 - 1 * 2 * 1
});

test("Leerlauf: die Huelle faellt nicht unter 0", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.tick(60); // wuerde rechnerisch -20 ergeben
  assert.equal(game.hostState().shared.huelle, 0);
});

test("Eine besetzte Station stoppt den Leerlauf-Verfall", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  game.tick(1);
  assert.equal(game.hostState().shared.huelle, 100);
});

test("Kopplung: eine stabile Station genuegt bei nur einer Station fuer Fortschritt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  const res = solveCorrectly(game, "bordcomputer");
  assert.equal(res.geloest, true);
  assert.equal(game.station("bordcomputer").status, "stabil");
  game.tick(1);
  assert.ok(Math.abs(game.hostState().shared.fortschritt - 3) < 1e-9); // +3 * dt
});

test("Kopplung: Fortschritt steigt erst, wenn die Haelfte der Stationen stabil ist", () => {
  const game = createGame({ stations: FOUR, baseLevel: 1 });
  for (const s of FOUR) game.claimStation(s.id, { label: "Crew" });

  // 0 stabil (alle nur besetzt): kein Fortschritt.
  game.tick(1);
  assert.equal(game.hostState().shared.fortschritt, 0);

  // 1 von 4 stabil: noetig sind 2, also weiter kein Fortschritt.
  solveCorrectly(game, "s1");
  game.tick(1);
  assert.equal(game.hostState().shared.fortschritt, 0);

  // 2 von 4 stabil: Schwelle erreicht, Fortschritt steigt.
  solveCorrectly(game, "s2");
  game.tick(1);
  assert.ok(game.hostState().shared.fortschritt > 0);
});

test("releaseStation: gibt die Station frei und setzt sie auf kritisch zurueck", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.claimStation("bordcomputer", { label: "Crew" });
  solveCorrectly(game, "bordcomputer");
  game.releaseStation("bordcomputer");
  const s = game.station("bordcomputer");
  assert.equal(s.owner, null);
  assert.equal(s.task, null);
  assert.equal(s.status, "kritisch");
  assert.deepEqual(game.freeStations(), [{ id: "bordcomputer", name: "Bordcomputer" }]);
});
