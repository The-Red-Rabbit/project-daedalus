// Simulierte Spieler (Bots) fuer das Solo-Testen. Sie treten ueber dieselbe
// addParticipant-Logik bei wie echte Controller, bekommen Rollen, rotieren mit
// und loesen ihre Aufgaben ueber den echten solve-Pfad (kein Sonderweg fuer die
// Bewertung). Nur ein Entwicklerwerkzeug, im Server hinter DAEDALUS_DEBUG verborgen
// und ausschliesslich vom Leitstand steuerbar.

import { mulberry32 } from "../shared/rng.js";
import { registry } from "../client/minigames/registry.js";

const SOLVE_MIN_SEC = 3;   // schnellster Bot-Versuch
const SOLVE_MAX_SEC = 9;   // langsamster Bot-Versuch
const RETRY_SEC = 2.5;     // nach einem Fehlversuch zeitnah erneut probieren
const WRONG_CHANCE = 0.18; // Anteil bewusst danebengegriffener Versuche
const NAME_PREFIX = "🤖 Bot "; // markiert Bots klar im Roster
const COOP_RATE = 0.35;    // Anteil der Reglerluecke je Tick (gedaempfte Annaeherung)
const COOP_EPS = 0.002;    // Solo: ab hier gilt der Regler als angekommen (klein genug fuer enge Toleranz)

export function createBots(game, opts = {}) {
  // Zufall und Zeiten injizierbar, damit die Bots deterministisch testbar sind.
  const random = opts.random || Math.random;
  const minSec = opts.minSec ?? SOLVE_MIN_SEC;
  const maxSec = opts.maxSec ?? SOLVE_MAX_SEC;
  const wrongChance = opts.wrongChance ?? WRONG_CHANCE;

  // pid -> { id, task, timer }
  const bots = new Map();
  let seq = 0;

  const delay = () => minSec + random() * (maxSec - minSec);

  // Baut die Aufgabe aus dem Seed nach und liefert eine korrekte Eingabe.
  // Nutzt das solve() des jeweiligen Mini-Spiels (kein dupliziertes Wissen).
  function answerFor(task) {
    const mod = registry[task.minigame];
    if (!mod || typeof mod.solve !== "function") return {};
    const built = mod.generate(task.level, mulberry32(task.seed));
    return mod.solve(built);
  }

  // Neue Aufgabe holen und den Loesungs-Timer neu setzen.
  function reseatOne(b) {
    b.task = game.assignTask(b.id);
    b.timer = delay();
  }

  // Fuegt count Bots hinzu, platziert sie und gibt ihnen sofort eine Aufgabe.
  function spawn(count) {
    for (let i = 0; i < count; i++) {
      const id = `bot${++seq}`;
      game.addParticipant(id, `${NAME_PREFIX}${seq}`);
      const b = { id, task: null, timer: 0 };
      reseatOne(b);
      bots.set(id, b);
    }
    return bots.size;
  }

  // Entfernt alle Bots wieder aus dem Spiel.
  function clear() {
    for (const id of [...bots.keys()]) {
      game.removeParticipant(id);
      bots.delete(id);
    }
    return 0;
  }

  // Frische Aufgaben fuer alle Bots (nach Start und nach Sektorrotation),
  // analog zum Neu-Setzen der echten Controller im Server.
  function reseat() {
    for (const b of bots.values()) reseatOne(b);
  }

  // Bedient eine Koop-Station (Reaktor): den eigenen Regler schrittweise auf die
  // Ziellinie zubewegen (gedaempft, damit es sich annaehert statt zu schwingen),
  // und im Zielband bestaetigen. Im Solo-Fall steuert der Bot beide Regler.
  function driveCoop(b, info) {
    if (info.spectator) return;
    const mod = registry[info.minigame];
    if (!mod || typeof mod.solveFor !== "function") return;
    const task = mod.generate(info.level, mulberry32(info.seed));
    if (info.solo) {
      const sol = mod.solve(task);
      let moved = false;
      if (Math.abs(info.my - sol.a) > COOP_EPS) {
        game.setCoopInput(b.id, "a", info.my + (sol.a - info.my) * COOP_RATE);
        moved = true;
      }
      if (Math.abs(info.partner - sol.b) > COOP_EPS) {
        game.setCoopInput(b.id, "b", info.partner + (sol.b - info.partner) * COOP_RATE);
        moved = true;
      }
      if (!moved && info.inBand && !info.myConfirmed) game.coopConfirm(b.id);
      return;
    }
    if (info.inBand) {
      if (!info.myConfirmed) game.coopConfirm(b.id);
    } else {
      // Solange nicht im Band: weiter auf die Ziellinie zu (kein vorzeitiger Stopp,
      // sonst friert das Paar knapp neben einem engen Band ein).
      const ideal = mod.solveFor(task, info.partner, info.param);
      game.setCoopInput(b.id, info.param, info.my + (ideal - info.my) * COOP_RATE);
    }
  }

  // Treibt die Bots: Koop-Teilnehmer kalibrieren stufenlos, alle anderen loesen
  // nach Ablauf ihres Timers ueber den echten game.solve(). Meist korrekt,
  // manchmal bewusst daneben, damit der Statusverfall sichtbar wird.
  function tick(dt, running) {
    if (!running) return;
    for (const b of bots.values()) {
      const coop = game.coopInfo(b.id);
      if (coop) {
        driveCoop(b, coop);
        continue;
      }
      if (!b.task) reseatOne(b);
      b.timer -= dt;
      if (b.timer > 0) continue;
      const wrong = random() < wrongChance;
      const input = wrong ? {} : answerFor(b.task);
      const res = game.solve(b.id, input);
      if (res.geloest) reseatOne(b); // frische Aufgabe, neuer Timer
      else b.timer = RETRY_SEC; // danebengegriffen: bald erneut probieren
    }
  }

  const count = () => bots.size;

  return { spawn, clear, reseat, tick, count };
}
