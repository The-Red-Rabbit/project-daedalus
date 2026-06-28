// Tests fuer die Spielkern-Logik in server/game.js: Rollen (Operator und
// Co-Pilot), Rotation zwischen Sektoren, adaptive Schwierigkeit, Huellenverfall
// durch Vernachlaessigung, Energie- und Fortschrittsmodell (AP2), Leitstand
// und Spielende.

import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../server/game.js";
import { createBots } from "../server/bots.js";
import { registry } from "../client/minigames/registry.js";
import { mulberry32 } from "../shared/rng.js";

const ONE = [{ id: "bc", name: "Bordcomputer", minigame: "bordcomputer" }];
const TWO = [
  { id: "a", name: "A", minigame: "bordcomputer" },
  { id: "b", name: "B", minigame: "bordcomputer" },
];
// Stationen mit den echten IDs fuer die Sonderfunktions-Tests.
const REAKTOR_ST     = [{ id: "reaktor",      name: "Reaktor",      minigame: "bordcomputer" }];
const SENSORIK_ST    = [{ id: "sensorik",     name: "Sensorik",     minigame: "bordcomputer" }];
const NAVIGATION_ST  = [{ id: "navigation",   name: "Navigation",   minigame: "bordcomputer" }];
const BORDCOMP_ST    = [{ id: "bordcomputer", name: "Bordcomputer", minigame: "bordcomputer" }];

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

test("alle Mini-Spiele bringen eine Kurzanleitung mit (howto: Ziel und Beispiel)", () => {
  for (const [id, mod] of Object.entries(registry)) {
    assert.ok(mod.howto && typeof mod.howto.goal === "string" && mod.howto.goal.length > 0, `${id}: howto.goal fehlt`);
    assert.ok(typeof mod.howto.example === "string" && mod.howto.example.length > 0, `${id}: howto.example fehlt`);
  }
});

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
  assert.equal(game.hostState().shared.huelle, 99.5); // HULL_DRAIN_CRITICAL = 0.5
});

test("Huelle: eine unbesetzte Station zieht 0,5 pro Sekunde ab (nach der Schonzeit)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  passGrace(game);
  game.tick(1);
  assert.equal(game.hostState().shared.huelle, 99.5); // HULL_DRAIN_CRITICAL = 0.5
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
  assert.equal(Math.round(warn.hostState().shared.huelle * 100) / 100, 99.90); // 0.10

  const stable = createGame({ stations: ONE, baseLevel: 1 });
  stable.startGame();
  stable.addParticipant("p1", "Anna");
  solveCorrectly(stable, "p1");
  passGrace(stable);
  stable.tick(1);
  assert.equal(stable.hostState().shared.huelle, 100);
});

test("Leitstand: Asteroidenwelle senkt die Huelle um 22, setBaseLevel begrenzt", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  assert.deepEqual(game.triggerEvent("asteroid"), { kind: "asteroid", damage: 18 });
  assert.equal(game.hostState().shared.huelle, 82);
  assert.equal(game.triggerEvent("unbekannt"), null);
  assert.equal(game.setBaseLevel(9), 3);
  assert.equal(game.assignTask("p1").level, 3);
  assert.equal(game.setBaseLevel(0), 1);
  assert.equal(game.assignTask("p1").level, 1);
});

test("Niederlage: leere Huelle beendet den Durchlauf und setzt lossReason", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 }); // unbesetzt -> Dauerverlust
  game.startGame();
  // Schonzeit (6 s) plus 200 s Verlust bei 0,5/s: nach gut 206 s ist die Huelle leer.
  for (let i = 0; i < 300 && game.hostState().phase === "running"; i++) game.tick(1);
  assert.equal(game.hostState().phase, "lost");
  assert.equal(game.hostState().shared.huelle, 0);
  assert.equal(game.hostState().shared.lossReason, "hull_depleted");
});

test("Huelle: Asteroid-Treffer via triggerEvent setzt lossReason wenn Huelle 0 erreicht", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  // 6 x 18 = 108 Schaden: Huelle faellt auf 0 beim sechsten Treffer.
  for (let i = 0; i < 5; i++) game.triggerEvent("asteroid"); // 100-90=10, noch laufend
  assert.equal(game.hostState().shared.huelle, 10);
  assert.equal(game.hostState().phase, "running");
  game.triggerEvent("asteroid"); // 10-18 klemmt bei 0
  assert.equal(game.hostState().shared.huelle, 0);
  assert.equal(game.hostState().phase, "lost");
  assert.equal(game.hostState().shared.lossReason, "hull_depleted");
});

test("Beitragszaehler: steigt bei Energie-Loesung, unveraendert bei Fehlversuch", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  assert.equal(game.hostState().roster.find((p) => p.id === "p1").contributions, 0);

  solveCorrectly(game, "p1"); // korrekte Loesung -> Energie + contributions++
  assert.equal(game.hostState().roster.find((p) => p.id === "p1").contributions, 1);

  game.addEnergyFromSolve("p1"); // direkt laden -> auch contributions++
  assert.equal(game.hostState().roster.find((p) => p.id === "p1").contributions, 2);

  game.assignTask("p1");
  game.solve("p1", { gates: {} }); // Fehlversuch -> contributions unveraendert
  assert.equal(game.hostState().roster.find((p) => p.id === "p1").contributions, 2);
});

test("Spielende: Beitrags-Schnappschuss erscheint bei Niederlage in hostState", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  solveCorrectly(game, "p1"); // contributions: 1
  assert.equal(game.hostState().endContributions, undefined); // noch kein Spielende

  for (let i = 0; i < 6; i++) game.triggerEvent("asteroid"); // Huelle auf 0
  assert.equal(game.hostState().phase, "lost");
  const snap = game.hostState().endContributions;
  assert.ok(Array.isArray(snap), "endContributions sollte ein Array sein");
  const anna = snap.find((c) => c.id === "p1");
  assert.ok(anna, "Anna sollte im Schnappschuss stehen");
  assert.equal(anna.contributions, 1);
  assert.equal(anna.label, "Anna");
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
  assert.deepEqual(hs.shared, { huelle: 100, energie: 100, fortschritt: 0, score: 0, lossReason: null, jokerCharges: 3 });
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

// ---- Neue Schiffswerte (AP2): Energie und Fortschritt ----------------------

test("Energie verfaellt langsam ohne Aktivitaet (nach der Schonzeit)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  passGrace(game);
  const before = game.hostState().shared.energie;
  game.tick(1);
  assert.ok(game.hostState().shared.energie < before, "Energie sollte ohne Aktivitaet sinken");
});

test("addEnergyFromSolve hebt die Energie, Fehlversuch senkt sie", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  passGrace(game);
  for (let i = 0; i < 20; i++) game.tick(1); // Energie abbauen
  const low = game.hostState().shared.energie;
  assert.ok(low < 100, "Energie sollte gesunken sein");

  game.addEnergyFromSolve("p1");
  assert.ok(game.hostState().shared.energie > low, "addEnergyFromSolve sollte Energie erhoehen");

  const mid = game.hostState().shared.energie;
  game.assignTask("p1"); // aktive Aufgabe erforderlich, damit Fehlversuch registriert wird
  game.solve("p1", { gates: {} }); // Fehlversuch (unvollstaendige Bordcomputer-Schaltung)
  assert.ok(game.hostState().shared.energie < mid, "Fehlversuch sollte Energie senken");
});

test("korrekte Loesung wirkt als Energiezufuhr (solve ruft addEnergyFromSolve auf)", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  passGrace(game);
  for (let i = 0; i < 20; i++) game.tick(1); // Energie abbauen
  const low = game.hostState().shared.energie;
  solveCorrectly(game, "p1");
  assert.ok(game.hostState().shared.energie > low, "Richtige Loesung sollte Energie laden");
});

test("Fortschritt skaliert mit Energie und klemmt bei 100", () => {
  // Bei voller Energie (~100) steigt Fortschritt pro Tick sichtbar.
  const gameHigh = createGame({ stations: ONE, baseLevel: 1 });
  gameHigh.startGame();
  passGrace(gameHigh);
  gameHigh.tick(1);
  const deltaHigh = gameHigh.hostState().shared.fortschritt;
  assert.ok(deltaHigh > 0, "Bei hoher Energie soll Fortschritt steigen");

  // Energie auf 0 durch Fehlversuche (20 x 5 = 100 Punkte Abzug).
  const gameLow = createGame({ stations: ONE, baseLevel: 1 });
  gameLow.startGame();
  gameLow.addParticipant("p1", "Anna");
  passGrace(gameLow);
  gameLow.assignTask("p1"); // aktive Aufgabe erforderlich, damit Fehlversuche registriert werden
  for (let i = 0; i < 20; i++) gameLow.solve("p1", { gates: {} }); // 20 Fehlversuche -> Energie 0
  assert.equal(gameLow.hostState().shared.energie, 0, "Energie sollte durch Fehlversuche auf 0 gefallen sein");
  gameLow.tick(1);
  const deltaLow = gameLow.hostState().shared.fortschritt;
  assert.equal(deltaLow, 0, "Bei Energie 0 soll kein Fortschritt entstehen");

  assert.ok(deltaHigh > deltaLow, "Hoehe Energie treibt mehr Fortschritt pro Sekunde");

  // Klemme: Energie auffuellen und Fortschritt auf 100 treiben, dann pruefen dass er nicht drueber geht.
  gameHigh.addParticipant("p1", "Anna");
  for (let i = 0; i < 300 && gameHigh.hostState().shared.fortschritt < 100; i++) {
    gameHigh.addEnergyFromSolve("p1");
    gameHigh.tick(1);
  }
  assert.equal(gameHigh.hostState().shared.fortschritt, 100, "Fortschritt soll bei 100 klemmen");
  gameHigh.addEnergyFromSolve("p1");
  gameHigh.tick(10);
  assert.equal(gameHigh.hostState().shared.fortschritt, 100, "Fortschritt darf 100 nicht ueberschreiten");
});

// ---- Sektorfluss (AP3) -----------------------------------------------------

// Hilfsfunktion: Fortschritt auf 100 ticken.
// Haelt die Energie von Teilnehmer "p1" oben, damit PROGRESS_RATE_MAX wirkt
// (sonst laeuft Energie ohne Aktivitaet leer und Fortschritt stoppt).
// Ein Teilnehmer mit id "p1" muss bereits im Spiel sein.
function fillProgress(game) {
  for (let i = 0; i < 300 && game.hostState().shared.fortschritt < 100; i++) {
    game.addEnergyFromSolve("p1");
    game.tick(1);
  }
}

test("Fortschritt klemmt bei 100 und Schiff haelt an der Sektorgrenze", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  fillProgress(game);
  assert.equal(game.hostState().shared.fortschritt, 100);
  assert.equal(game.hostState().atBoundary, true);
  // Tick weiterlaufen lassen: Fortschritt bleibt bei 100
  game.tick(1);
  assert.equal(game.hostState().shared.fortschritt, 100);
});

test("markReady: nur akzeptiert, wenn Fortschritt 100 ist", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  assert.equal(game.markReady("p1"), false, "vor Fortschritt 100 abgelehnt");
  fillProgress(game);
  assert.equal(game.markReady("p1"), true, "bei Fortschritt 100 akzeptiert");
  assert.equal(game.hostState().readyCount, 1);
  assert.equal(game.hostState().roster.find((p) => p.id === "p1").ready, true);
});

test("advanceSector: Fortschritt zurueck, Huelle repariert, Rollen rotiert", () => {
  const game = createGame({ stations: TWO, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");
  game.triggerEvent("asteroid"); // Huelle: 78
  fillProgress(game);
  const huelleVorher = game.hostState().shared.huelle;
  const stationVorher = game.assignmentOf("p1").stationId;

  const result = game.advanceSector();
  assert.ok(result && !result.won, "Sektor 1→2 kein Sieg");
  assert.equal(game.hostState().shared.fortschritt, 0, "Fortschritt zurueckgesetzt");
  assert.ok(game.hostState().shared.huelle > huelleVorher, "Huelle repariert");
  assert.ok(game.hostState().shared.huelle <= 100, "Huelle ueber 100 gedeckelt");
  assert.notEqual(game.assignmentOf("p1").stationId, stationVorher, "Rollen rotiert");
  assert.equal(game.hostState().readyCount, 0, "Bereitschaft zurueckgesetzt");
});

test("advanceSector: letzter Sektor fuehrt zu Sieg", () => {
  const game = createGame({ stations: ONE, baseLevel: 1, maxSectors: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  fillProgress(game);
  const result = game.advanceSector();
  assert.ok(result && result.won, "Sieg zurueckgegeben");
  assert.equal(game.hostState().phase, "won");
});

test("advanceSector: kehrt null zurueck, wenn Fortschritt unter 100", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  game.tick(1); // Fortschritt noch weit unter 100
  assert.equal(game.advanceSector(), null);
});

// ---- Stationsmenue A / B (AP3) ---------------------------------------------

test("Stationsmenue A: Energie-Loesung erhoeht Energie und Beitragskonto", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  passGrace(game);
  for (let i = 0; i < 20; i++) game.tick(1); // Energie abbauen
  const energieBefore = game.hostState().shared.energie;
  const beitraegeBefore = game.hostState().roster.find((p) => p.id === "p1").contributions;

  const task = game.assignTask("p1");
  const result = game.solve("p1", answerFor(task), "energy");

  assert.ok(result.geloest, "Loesung soll korrekt sein");
  assert.ok(game.hostState().shared.energie > energieBefore, "Energie-Loesung soll Energie laden");
  assert.equal(
    game.hostState().roster.find((p) => p.id === "p1").contributions,
    beitraegeBefore + 1,
    "Beitragskonto soll um 1 steigen"
  );
});

test("Stationsmenue B: Sonderfunktion-Loesung loest Dispatcher aus, erhoehen weder Beitrag noch Energie extra", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  passGrace(game);
  for (let i = 0; i < 20; i++) game.tick(1); // Energie abbauen
  const energieBefore = game.hostState().shared.energie;
  const beitraegeBefore = game.hostState().roster.find((p) => p.id === "p1").contributions;

  const task = game.assignTask("p1");
  const result = game.solve("p1", answerFor(task), "function");

  assert.ok(result.geloest, "Loesung soll korrekt sein");
  assert.ok(result.specialFunction, "Ergebnis soll specialFunction-Feld enthalten");
  assert.equal(result.specialFunction.stationId, "bc", "stationId soll zur Station passen");
  assert.equal(
    game.hostState().roster.find((p) => p.id === "p1").contributions,
    beitraegeBefore,
    "Beitragskonto darf nicht steigen"
  );
  assert.ok(
    game.hostState().shared.energie <= energieBefore,
    "Energie darf durch Sonderfunktion nicht extra steigen"
  );
});

// ---- Joker-Abstimmung (AP4) ------------------------------------------------

test("Joker: erfolgreiche Abstimmung verbraucht eine Ladung und repariert die Huelle", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");
  game.addParticipant("p3", "Cem");
  game.triggerEvent("asteroid"); // Huelle: 78

  const chargesBefore = game.hostState().shared.jokerCharges;
  const huelleBefore = game.hostState().shared.huelle;

  game.voteStart("p1");
  game.voteCast("p1", "yes");
  game.voteCast("p2", "yes");
  game.voteCast("p3", "no"); // Mehrheit: 2 ja, 1 nein

  const { voteResolved } = game.tick(11); // Frist ablaufen lassen

  assert.ok(voteResolved, "Abstimmung soll aufgeloest sein");
  assert.equal(voteResolved.result, "yes");
  assert.ok(voteResolved.chargeConsumed, "Ladung soll verbraucht sein");
  assert.equal(game.hostState().shared.jokerCharges, chargesBefore - 1, "eine Ladung weniger");
  assert.ok(game.hostState().shared.huelle > huelleBefore, "Huelle soll repariert worden sein");
  assert.ok(game.hostState().shared.huelle <= 100, "Huelle darf 100 nicht ueberschreiten");
});

test("Joker: fehlgeschlagene Abstimmung verbraucht keine Ladung", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");
  game.addParticipant("p3", "Cem");

  const chargesBefore = game.hostState().shared.jokerCharges;

  game.voteStart("p1");
  game.voteCast("p1", "yes");
  game.voteCast("p2", "no");
  game.voteCast("p3", "no"); // Mehrheit: 1 ja, 2 nein

  const { voteResolved } = game.tick(11);

  assert.ok(voteResolved, "Abstimmung soll aufgeloest sein");
  assert.equal(voteResolved.result, "no");
  assert.ok(!voteResolved.chargeConsumed, "keine Ladung soll verbraucht werden");
  assert.equal(game.hostState().shared.jokerCharges, chargesBefore, "Ladungszahl unveraendert");
});

test("Joker: Initiator kann keine zweite Abstimmung starten", () => {
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");

  game.voteStart("p1");
  game.tick(11); // erste Abstimmung aufloesen (keine Stimmen -> Nein-Mehrheit)

  const res = game.voteStart("p1");
  assert.ok(!res.ok, "zweiter Start soll abgelehnt werden");
  assert.equal(res.reason, "already_initiated");

  // p2 hat sein Recht noch nicht verbraucht und darf starten
  const res2 = game.voteStart("p2");
  assert.ok(res2.ok, "p2 darf noch starten");
});

// ---- Sonderfunktionen je Station (AP8) -------------------------------------

test("Sonderfunktion Reaktor: Energieschub erhoeht die Energie sofort, kein Beitrag", () => {
  const game = createGame({ stations: REAKTOR_ST, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  passGrace(game);
  for (let i = 0; i < 20; i++) game.tick(1); // Energie abbauen
  const energieBefore = game.hostState().shared.energie;
  const beitraegeBefore = game.hostState().roster.find((p) => p.id === "p1").contributions;

  const task = game.assignTask("p1");
  const result = game.solve("p1", answerFor(task), "function");

  assert.ok(result.geloest, "Loesung soll korrekt sein");
  assert.ok(result.specialFunction, "specialFunction-Feld soll vorhanden sein");
  assert.ok(game.hostState().shared.energie > energieBefore, "Energie soll nach Energieschub gestiegen sein");
  assert.equal(
    game.hostState().roster.find((p) => p.id === "p1").contributions,
    beitraegeBefore,
    "Beitragskonto darf nicht steigen"
  );
});

test("Sonderfunktion Navigation: Kurskorrektur erhoeht den Fortschritt sofort, kein Beitrag", () => {
  const game = createGame({ stations: NAVIGATION_ST, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  passGrace(game);
  const fortschrittBefore = game.hostState().shared.fortschritt;
  const beitraegeBefore = game.hostState().roster.find((p) => p.id === "p1").contributions;

  const task = game.assignTask("p1");
  const result = game.solve("p1", answerFor(task), "function");

  assert.ok(result.geloest, "Loesung soll korrekt sein");
  assert.ok(result.specialFunction, "specialFunction-Feld soll vorhanden sein");
  assert.ok(game.hostState().shared.fortschritt > fortschrittBefore, "Fortschritt soll nach Kurskorrektur gestiegen sein");
  assert.equal(
    game.hostState().roster.find((p) => p.id === "p1").contributions,
    beitraegeBefore,
    "Beitragskonto darf nicht steigen"
  );
});

test("Sonderfunktion Bordcomputer: Schadenskontrolle repariert die Huelle sofort, kein Beitrag", () => {
  const game = createGame({ stations: BORDCOMP_ST, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  game.triggerEvent("asteroid"); // Huelle: 78
  const huelleBefore = game.hostState().shared.huelle;
  const beitraegeBefore = game.hostState().roster.find((p) => p.id === "p1").contributions;
  assert.ok(huelleBefore < 100, "Huelle soll nach Asteroidentreffer unter 100 liegen");

  const task = game.assignTask("p1");
  const result = game.solve("p1", answerFor(task), "function");

  assert.ok(result.geloest, "Loesung soll korrekt sein");
  assert.ok(result.specialFunction, "specialFunction-Feld soll vorhanden sein");
  assert.ok(game.hostState().shared.huelle > huelleBefore, "Huelle soll nach Schadenskontrolle gestiegen sein");
  assert.ok(game.hostState().shared.huelle <= 100, "Huelle darf 100 nicht ueberschreiten");
  assert.equal(
    game.hostState().roster.find((p) => p.id === "p1").contributions,
    beitraegeBefore,
    "Beitragskonto darf nicht steigen"
  );
});

test("Sonderfunktion Sensorik: Asteroiden filtern aktiviert und laeuft nach der Dauer ab, kein Beitrag", () => {
  const game = createGame({ stations: SENSORIK_ST, baseLevel: 1 });
  game.startGame();
  game.addParticipant("p1", "Anna");
  passGrace(game);
  const beitraegeBefore = game.hostState().roster.find((p) => p.id === "p1").contributions;

  assert.equal(game.isAsteroidFiltered(), false, "Filter soll vor der Loesung inaktiv sein");

  const task = game.assignTask("p1");
  const result = game.solve("p1", answerFor(task), "function");

  assert.ok(result.geloest, "Loesung soll korrekt sein");
  assert.ok(result.specialFunction, "specialFunction-Feld soll vorhanden sein");
  assert.equal(game.isAsteroidFiltered(), true, "Filter soll nach Sonderfunktion aktiv sein");
  assert.equal(
    game.hostState().roster.find((p) => p.id === "p1").contributions,
    beitraegeBefore,
    "Beitragskonto darf nicht steigen"
  );

  // 35 Sekunden ticken (laenger als die 30 s Filterdauer) -> Filter muss abgelaufen sein.
  for (let i = 0; i < 35; i++) game.tick(1);
  assert.equal(game.isAsteroidFiltered(), false, "Filter soll nach Ablauf der Dauer inaktiv sein");
});

test("Joker: keine Abstimmung bei null Ladungen", () => {
  // jokerCharges: 0 direkt in der Konfiguration setzen
  const game = createGame({ stations: ONE, baseLevel: 1, jokerCharges: 0 });
  game.startGame();
  game.addParticipant("p1", "Anna");

  assert.equal(game.hostState().shared.jokerCharges, 0);
  const res = game.voteStart("p1");
  assert.ok(!res.ok, "Start soll abgelehnt werden");
  assert.equal(res.reason, "no_charges");
});

// ---- Bots ------------------------------------------------------------------

test("Bots: simulierte Spieler treten bei, sind markiert und loesen Aufgaben", () => {
  const game = createGame({ stations: TWO, baseLevel: 1 });
  const bots = createBots(game, { random: () => 0.99, minSec: 0.5, maxSec: 0.5, wrongChance: 0 });
  assert.equal(bots.spawn(3), 3);
  assert.equal(game.hostState().crew, 3);
  // klar als Bots markiert (Namenspraefix)
  assert.ok(game.hostState().roster.every((p) => p.label.startsWith("🤖")));

  game.startGame();
  bots.reseat();
  for (let i = 0; i < 100; i++) {
    const { rotated } = game.tick(0.1);
    if (rotated) bots.reseat();
    bots.tick(0.1, true);
  }
  // Bots sollten mindestens eine Aufgabe geloest und den Score erhoehen haben.
  assert.ok(game.hostState().shared.score > 0, "Bots sollten Punkte erzielt haben");

  assert.equal(bots.clear(), 0);
  assert.equal(game.hostState().crew, 0);
});
