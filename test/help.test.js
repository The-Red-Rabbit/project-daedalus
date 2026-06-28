// Tests fuer den Hilfe-Button (AP6): Hinweisgeneratoren, Cooldown, Helferauswahl.

import test from "node:test";
import assert from "node:assert/strict";
import { createGame, HELP_COOLDOWN_SEC } from "../server/game.js";
import { registry } from "../client/minigames/registry.js";
import { mulberry32 } from "../shared/rng.js";

const FOUR_STATIONS = [
  { id: "bordcomputer", name: "Bordcomputer", minigame: "bordcomputer" },
  { id: "sensorik",     name: "Sensorik",     minigame: "filterauswahl" },
  { id: "navigation",   name: "Navigation",   minigame: "zahlensysteme" },
  { id: "reaktor",      name: "Reaktor",      minigame: "bauteiltausch"  },
];

// ---- Hinweisgeneratoren -------------------------------------------------------

test("hint(): alle Mini-Spiele haben eine hint()-Funktion", () => {
  for (const [id, mod] of Object.entries(registry)) {
    assert.equal(typeof mod.hint, "function", `${id}: hint() fehlt`);
  }
});

test("hint(): zahlensysteme – Dezimal-Ziel nennt drei Bits", () => {
  const mod = registry.zahlensysteme;
  // Stufe 1: Dezimalziel, 4 Bit
  for (let seed = 1; seed <= 10; seed++) {
    const task = mod.generate(1, mulberry32(seed));
    assert.equal(task.displayBase, 10, "Stufe 1 sollte Dezimal sein");
    const hint = mod.hint(task);
    assert.ok(typeof hint === "string" && hint.length > 0, `Kein Hinweis fuer Seed ${seed}`);
    assert.ok(hint.includes("Bit"), `Hinweis sollte 'Bit' enthalten: ${hint}`);
  }
});

test("hint(): zahlensysteme – Hex-Ziel nennt Dezimalwert", () => {
  const mod = registry.zahlensysteme;
  // Stufe 2: Hex-Ziel
  for (let seed = 1; seed <= 10; seed++) {
    const task = mod.generate(2, mulberry32(seed));
    assert.equal(task.displayBase, 16, "Stufe 2 sollte Hex sein");
    const hint = mod.hint(task);
    assert.ok(typeof hint === "string" && hint.length > 0, `Kein Hinweis fuer Seed ${seed}`);
    assert.ok(hint.includes(String(task.target)), `Hinweis sollte Dezimalwert ${task.target} enthalten: ${hint}`);
  }
});

test("hint(): filterauswahl – nennt Faustformel und Filtertyp", () => {
  const mod = registry.filterauswahl;
  for (let level = 1; level <= 3; level++) {
    for (let seed = 1; seed <= 5; seed++) {
      const task = mod.generate(level, mulberry32(seed));
      const hint = mod.hint(task);
      assert.ok(typeof hint === "string" && hint.length > 0, `Kein Hinweis fuer L${level} Seed ${seed}`);
      assert.ok(hint.includes("0,16"), `Hinweis sollte Faustformel enthalten: ${hint}`);
    }
  }
});

test("hint(): filterauswahl – nennt Zielfrequenz ab Stufe 2", () => {
  const mod = registry.filterauswahl;
  for (let seed = 1; seed <= 5; seed++) {
    const task2 = mod.generate(2, mulberry32(seed));
    const hint2 = mod.hint(task2);
    // Zielfrequenz steht als Hz oder kHz im Hinweis
    assert.ok(hint2.match(/Hz|kHz/), `Hinweis Stufe 2 sollte Frequenz enthalten: ${hint2}`);

    const task3 = mod.generate(3, mulberry32(seed));
    const hint3 = mod.hint(task3);
    assert.ok(hint3.match(/Hz|kHz/), `Hinweis Stufe 3 sollte Frequenz enthalten: ${hint3}`);
  }
});

test("hint(): bauteiltausch – beschreibt Schaltzeichen des gesuchten Bauteils", () => {
  const mod = registry.bauteiltausch;
  for (let level = 1; level <= 3; level++) {
    for (let seed = 1; seed <= 5; seed++) {
      const task = mod.generate(level, mulberry32(seed));
      const hint = mod.hint(task);
      assert.ok(typeof hint === "string" && hint.length > 0, `Kein Hinweis fuer L${level} Seed ${seed}`);
      // Hinweis muss den Namen des gesuchten Bauteils nennen
      const comp = { widerstand: "Widerstand", kondensator: "Kondensator", spule: "Spule", diode: "Diode", transistor: "Transistor" };
      assert.ok(hint.includes(comp[task.target]), `Hinweis sollte '${comp[task.target]}' enthalten: ${hint}`);
    }
  }
});

test("hint(): bordcomputer – erklaert Gatter bei Aufgaben mit Gattern", () => {
  const mod = registry.bordcomputer;
  // Stufe 2 und 3 haben Gatter
  for (let level = 2; level <= 3; level++) {
    for (let seed = 1; seed <= 5; seed++) {
      const task = mod.generate(level, mulberry32(seed));
      if (!task.gateType) continue; // Stufe 2 kann selten kein Gatter haben
      const hint = mod.hint(task);
      assert.ok(typeof hint === "string" && hint.length > 0, `Kein Hinweis fuer L${level} Seed ${seed}`);
      assert.ok(hint.includes("Gatter"), `Hinweis sollte 'Gatter' enthalten: ${hint}`);
    }
  }
});

test("hint(): bordcomputer – zaehlt zu drehende Kacheln ohne Gatter", () => {
  const mod = registry.bordcomputer;
  // Stufe 1 hat kein Gatter
  for (let seed = 1; seed <= 5; seed++) {
    const task = mod.generate(1, mulberry32(seed));
    if (task.gateType) continue; // Stufe 1 sollte kein Gatter haben, sicher gehen
    const hint = mod.hint(task);
    assert.ok(typeof hint === "string" && hint.length > 0, `Kein Hinweis fuer Stufe 1 Seed ${seed}`);
    assert.ok(hint.includes("Kachel"), `Hinweis sollte 'Kachel' enthalten: ${hint}`);
  }
});

// ---- Spiellogik: requestHelp() ------------------------------------------------

function setupRunningGame(stations = FOUR_STATIONS) {
  const game = createGame({ stations, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");
  game.addParticipant("p3", "Cem");
  game.addParticipant("p4", "Dana");
  game.startGame();
  // Aufgaben vergeben (startGame setzt sie nicht, index.js uebernimmt das; hier manuell)
  game.assignTask("p1");
  game.assignTask("p2");
  game.assignTask("p3");
  game.assignTask("p4");
  return game;
}

test("requestHelp(): gibt Hinweis zurueck und Helfer ist nie der Anfrager", () => {
  const game = setupRunningGame();
  for (let attempt = 0; attempt < 20; attempt++) {
    // Neue Spieler ohne Cooldown: jeder Anlauf braucht ein frisches Spiel
    const g = setupRunningGame();
    const result = g.requestHelp("p1");
    assert.ok(result.ok, `Anfrage sollte erfolgreich sein: ${JSON.stringify(result)}`);
    assert.notEqual(result.helperId, "p1", "Helfer darf nie der Anfrager sein");
    assert.ok(typeof result.hint === "string" && result.hint.length > 0, "Hinweis sollte nicht leer sein");
    assert.equal(result.requesterId, "p1");
    assert.equal(result.requesterLabel, "Anna");
  }
});

test("requestHelp(): Cooldown blockiert zweiten Aufruf innerhalb der Sperrzeit", () => {
  const game = setupRunningGame();
  const first = game.requestHelp("p1");
  assert.ok(first.ok, "Erster Aufruf soll erfolgreich sein");

  const second = game.requestHelp("p1");
  assert.ok(!second.ok, "Zweiter Aufruf innerhalb des Cooldowns soll abgelehnt werden");
  assert.equal(second.reason, "cooldown");
  assert.ok(second.remaining > 0, "remaining soll positiv sein");
  assert.ok(second.remaining <= HELP_COOLDOWN_SEC, `remaining soll <= ${HELP_COOLDOWN_SEC} sein`);
});

test("requestHelp(): Cooldown laeuft ab und gibt Button wieder frei", () => {
  const game = setupRunningGame();
  game.requestHelp("p1");

  // Cooldown-Zeit verstreichen lassen
  for (let i = 0; i <= HELP_COOLDOWN_SEC; i++) game.tick(1);

  const result = game.requestHelp("p1");
  assert.ok(result.ok, "Nach Ablauf des Cooldowns soll die Anfrage wieder klappen");
});

test("requestHelp(): schlaegt fehl in der Lobby", () => {
  const game = createGame({ stations: FOUR_STATIONS, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  game.addParticipant("p2", "Ben");
  game.assignTask("p1");
  const result = game.requestHelp("p1");
  assert.ok(!result.ok);
  assert.equal(result.reason, "not_running");
});

test("requestHelp(): schlaegt fehl wenn kein anderer Teilnehmer aktiv ist", () => {
  const ONE = [{ id: "bc", name: "Bordcomputer", minigame: "bordcomputer" }];
  const game = createGame({ stations: ONE, baseLevel: 1 });
  game.addParticipant("p1", "Anna");
  game.startGame();
  game.assignTask("p1");
  const result = game.requestHelp("p1");
  assert.ok(!result.ok);
  assert.equal(result.reason, "no_helpers");
});

test("requestHelp(): reset() loescht den Cooldown", () => {
  const game = setupRunningGame();
  game.requestHelp("p1");
  assert.ok(!game.requestHelp("p1").ok, "Cooldown aktiv nach erster Anfrage");

  game.reset();
  game.startGame();
  game.assignTask("p1");

  const result = game.requestHelp("p1");
  assert.ok(result.ok, "Nach reset() soll der Cooldown weg sein");
});

test("participantState: helpCooldown ist 0 vor Anfrage, positiv danach", () => {
  const game = setupRunningGame();
  assert.equal(game.participantState("p1").helpCooldown, 0, "Vor Anfrage kein Cooldown");
  game.requestHelp("p1");
  assert.ok(game.participantState("p1").helpCooldown > 0, "Nach Anfrage Cooldown aktiv");
});
