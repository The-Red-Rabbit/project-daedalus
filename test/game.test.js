// Tests fuer die Spielkern-Logik in server/game.js: Rollen (Operator und
// Co-Pilot), Rotation zwischen Sektoren, adaptive Schwierigkeit, Huellen-Verfall
// durch Vernachlaessigung, Kopplung, Statusverfall, Leitstand und Spielende.

import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../server/game.js";
import { createBots } from "../server/bots.js";
import { registry } from "../client/minigames/registry.js";
import reaktor from "../client/minigames/reaktor.js";
import { mulberry32 } from "../shared/rng.js";

const ONE = [{ id: "bc", name: "Bordcomputer", minigame: "bordcomputer" }];
const TWO = [
  { id: "a", name: "A", minigame: "bordcomputer" },
  { id: "b", name: "B", minigame: "bordcomputer" },
];
const COOP = [{ id: "rk", name: "Reaktor", minigame: "reaktor", coop: true }];

// Stellt beide Regler der Koop-Station auf eine Loesung (wie ein perfektes Paar).
function aimCoop(game, opId, coId) {
  const info = game.coopInfo(opId);
  const task = reaktor.generate(info.level, mulberry32(info.seed));
  const sol = reaktor.solve(task);
  game.setCoopInput(opId, "a", sol.a);
  game.setCoopInput(coId || opId, "b", sol.b);
}

// Loest die aktuelle Aufgabe eines Teilnehmers korrekt (wie ein perfekter Spieler).
// Nutzt das solve() des Mini-Spiels, damit das Loesungswissen nur dort liegt.
function answerFor(task) {
  const mod = registry[task.minigame];
  const built = mod.generate(task.level, mulberry32(task.seed));
  return mod.solve(built);
}
function solveCorrectly(game, pid) {
  const task = game.assignTask(pid);
  return game.solve(pid, answerFor(task));
}
// Ueber die Schonzeit (Schonzeit nach Start/Sektorwechsel) hinweg ticken, ohne dass
// dabei Schaden entsteht (waehrend der Schonzeit verfaellt nichts).
function passGrace(game) {
  for (let i = 0; i < 50 && game.hostState().grace > 0; i++) game.tick(1);
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

test("hostState: Crewliste und Co-Pilot-Namen fuer Lobby und Leitstand", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");
  const hs = game.hostState();
  assert.equal(hs.crew, 2);
  assert.deepEqual(hs.roster.map((p) => p.label).sort(), ["Anna", "Ben"]);
  const bc = hs.stations.find((s) => s.id === "bc");
  assert.equal(bc.operator, "Anna");
  assert.deepEqual(bc.supporterNames, ["Ben"]);
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

test("Lobby: ohne Start wird nicht simuliert, erst startGame laesst die Huelle reagieren", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  assert.equal(game.hostState().phase, "lobby");
  game.tick(1); // in der Lobby passiert nichts
  assert.equal(game.hostState().shared.huelle, 100);
  assert.equal(game.startGame(), "running");
  game.tick(1); // Schonzeit nach dem Start: noch kein Verlust
  assert.equal(game.hostState().shared.huelle, 100);
  passGrace(game); // Rest der Schonzeit abwarten
  game.tick(1); // jetzt zieht die unbesetzte Station
  assert.equal(game.hostState().shared.huelle, 99); // HULL_DRAIN_CRITICAL = 1.0
});

test("Huelle: eine unbesetzte Station zieht 1,0 pro Sekunde ab (nach der Schonzeit)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  passGrace(game);
  game.tick(1);
  assert.equal(game.hostState().shared.huelle, 99);
});

test("Schonzeit: direkt nach dem Start verfaellt nichts und die Huelle haelt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  assert.ok(game.hostState().grace > 0); // Schonzeit laeuft
  for (let i = 0; i < 5; i++) game.tick(1); // innerhalb der Schonzeit
  assert.equal(game.hostState().shared.huelle, 100); // unbesetzt, aber kein Verlust
});

test("Huelle: besetzt-instabil kostet weniger, stabil nichts", () => {
  const warn = createGame({ stations: ONE, baseLevel: 1 });
  warn.startGame();
  warn.addParticipant("p1", "Anna");
  passGrace(warn);
  warn.tick(1);
  assert.equal(Math.round(warn.hostState().shared.huelle * 100) / 100, 99.65); // 0.35

  const stable = createGame({ stations: ONE, baseLevel: 1 });
  stable.startGame();
  stable.addParticipant("p1", "Anna");
  solveCorrectly(stable, "p1");
  passGrace(stable);
  stable.tick(1);
  assert.equal(stable.hostState().shared.huelle, 100);
});

test("Kopplung: ein stabiler Operator genuegt bei einer besetzten Station", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1");
  game.tick(1);
  assert.ok(game.hostState().shared.fortschritt > 0);
});

test("Statusverfall und Nachjustieren", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1");
  // Schonzeit (6 s) plus rund 16 s Haltezeit: nach gut 22 s ist sie wieder "achtung".
  for (let i = 0; i < 25; i++) game.tick(1);
  assert.equal(game.station("bc").status, "achtung");
  solveCorrectly(game, "p1");
  assert.equal(game.station("bc").status, "stabil");
});

test("Fehlversuch: ein falscher Loesungsversuch senkt die Stabilitaet (Raten kostet)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1"); // frisch stabilisiert -> Stabilitaet 1
  assert.equal(game.station("bc").stability, 1);
  game.solve("p1", { gates: {} }); // unvollstaendige Schaltung -> Fehlversuch
  assert.equal(Math.round(game.station("bc").stability * 100) / 100, 0.66); // 1 - WRONG_SOLVE_PENALTY
});

test("Leitstand: Asteroidenwelle senkt die Huelle um 22, setBaseLevel begrenzt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
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
  game.startGame();
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
  game.startGame();
  // Schonzeit (6 s) plus 100 s Verlust bei 1,0/s: nach gut 106 s ist die Huelle leer.
  for (let i = 0; i < 200 && game.hostState().phase === "running"; i++) game.tick(1);
  assert.equal(game.hostState().phase, "lost");
  assert.equal(game.hostState().shared.huelle, 0);
});

test("reset: neuer Anlauf landet in der Lobby, Crew bleibt sitzen", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1");
  game.triggerEvent("asteroid");
  game.reset();
  const hs = game.hostState();
  assert.equal(hs.phase, "lobby"); // wartet wieder auf den Start
  assert.equal(hs.sector, 1);
  assert.deepEqual(hs.shared, { huelle: 100, energie: 100, fortschritt: 0 });
  assert.equal(game.assignmentOf("p1").role, "operator"); // Crew bleibt
  assert.equal(game.station("bc").status, "achtung"); // besetzt, aber nicht stabil
  game.tick(1); // in der Lobby ruht die Simulation wieder
  assert.equal(game.hostState().shared.huelle, 100);
});

test("solve(): jedes Mini-Spiel liefert eine korrekte Eingabe (alle Stufen)", () => {
  for (const mod of Object.values(registry)) {
    assert.equal(typeof mod.solve, "function", `${mod.id} hat kein solve()`);
    for (let level = 1; level <= 3; level++) {
      for (let seed = 1; seed <= 6; seed++) {
        const task = mod.generate(level, mulberry32(seed));
        const res = mod.validate(task, mod.solve(task));
        assert.ok(res.geloest, `${mod.id} Stufe ${level} Seed ${seed} nicht geloest`);
      }
    }
  }
});

test("Reaktor: erst wenn beide bestaetigen, rastet die Kalibrierung ein", () => {
  const game = createGame({ stations: COOP, baseLevel: 1 });
  game.addParticipant("op", "Op"); // Operator des Reaktors
  game.addParticipant("co", "Co"); // Co-Pilot derselben Station
  game.startGame();
  aimCoop(game, "op", "co"); // beide Regler auf eine Loesung
  const first = game.coopConfirm("op");
  assert.equal(first.evaluated, false); // wartet auf die zweite Seite
  assert.equal(game.station("rk").status, "achtung"); // noch nicht stabil
  const second = game.coopConfirm("co");
  assert.equal(second.geloest, true);
  assert.equal(game.station("rk").status, "stabil");
});

test("Reaktor: eine Reglerbewegung loescht die eigene Bestaetigung", () => {
  const game = createGame({ stations: COOP, baseLevel: 1 });
  game.addParticipant("op", "Op");
  game.addParticipant("co", "Co");
  game.startGame();
  aimCoop(game, "op", "co");
  game.coopConfirm("op");
  game.setCoopInput("op", "a", 0.1); // Bewegung loescht die Bestaetigung des Operators
  const res = game.coopConfirm("co"); // nur der Co-Pilot ist bestaetigt -> nicht bereit
  assert.equal(res.evaluated, false);
  assert.equal(game.station("rk").status, "achtung");
});

test("Reaktor: Solo-Fallback – eine Person steuert beide Regler", () => {
  const game = createGame({ stations: COOP, baseLevel: 1 });
  game.addParticipant("op", "Op"); // allein an der Station
  game.startGame();
  const info = game.coopInfo("op");
  assert.equal(info.solo, true);
  aimCoop(game, "op", null); // Solo: Operator stellt a und b
  const res = game.coopConfirm("op"); // eine Bestaetigung genuegt
  assert.equal(res.geloest, true);
  assert.equal(game.station("rk").status, "stabil");
});

test("Reaktor: Energie faellt ohne Kalibrierung und steigt mit stabilem Reaktor", () => {
  const game = createGame({ stations: COOP, baseLevel: 1 });
  game.addParticipant("op", "Op");
  game.addParticipant("co", "Co");
  game.startGame();
  passGrace(game);
  for (let i = 0; i < 5; i++) game.tick(1); // unstabil -> Energie sinkt
  const low = game.hostState().shared.energie;
  assert.ok(low < 100, "Energie sollte ohne Kalibrierung sinken");
  aimCoop(game, "op", "co");
  game.coopConfirm("op");
  game.coopConfirm("co"); // jetzt stabil
  for (let i = 0; i < 3; i++) game.tick(1); // stabil -> Energie steigt
  assert.ok(game.hostState().shared.energie > low, "Energie sollte mit stabilem Reaktor steigen");
});

test("Reaktor ohne Koop-Station: Energie bleibt konstant (kein Reaktor)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 }); // nur Einzelspiel
  game.startGame();
  passGrace(game);
  for (let i = 0; i < 10; i++) game.tick(1);
  assert.equal(game.hostState().shared.energie, 100);
});

test("Bots: zwei simulierte Spieler kalibrieren den Reaktor (Koop)", () => {
  const game = createGame({ stations: COOP, baseLevel: 1 });
  const bots = createBots(game, { random: () => 0.5, minSec: 0.5, maxSec: 0.5, wrongChance: 0 });
  assert.equal(bots.spawn(2), 2); // Operator + Co-Pilot an der Reaktor-Station
  game.startGame();
  bots.reseat();
  let calibrated = false;
  for (let i = 0; i < 800 && !calibrated; i++) {
    game.tick(0.1);
    bots.tick(0.1, true);
    if (game.station("rk").stability >= 0.99) calibrated = true; // gerade eingerastet
  }
  assert.ok(calibrated, "die Bots sollten den Reaktor gemeinsam kalibrieren");
});

test("Bots: simulierte Spieler treten bei, sind markiert und treiben den Einsatz zum Sieg", () => {
  const game = createGame({ stations: TWO, baseLevel: 1 });
  // Deterministisch: nie daneben, fester kurzer Loesungstakt.
  const bots = createBots(game, { random: () => 0.99, minSec: 0.5, maxSec: 0.5, wrongChance: 0 });
  assert.equal(bots.spawn(3), 3);
  assert.equal(game.hostState().crew, 3);
  // klar als Bots markiert (Namenspraefix)
  assert.ok(game.hostState().roster.every((p) => p.label.startsWith("🤖")));

  game.startGame();
  bots.reseat();
  for (let i = 0; i < 4000 && game.hostState().phase === "running"; i++) {
    const { rotated } = game.tick(0.1);
    if (rotated) bots.reseat();
    bots.tick(0.1, true); // wie im Server: nach dem Tick, vor dem Versand
  }
  assert.equal(game.hostState().phase, "won");

  // wieder aufraeumen lassen
  assert.equal(bots.clear(), 0);
  assert.equal(game.hostState().crew, 0);
});
