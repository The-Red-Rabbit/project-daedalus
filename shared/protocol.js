// Gemeinsame Konstanten und Nachrichtentypen fuer Server und Client.
// Ein einziger Ort, damit beide Seiten nie auseinanderlaufen.

export const TICK_HZ = 10;

// Nachrichten Client -> Server
export const C2S = {
  JOIN: "join",            // { role: "host" | "controller", label? }
  SOLVE_ATTEMPT: "solveAttempt", // { input }
  REQUEST_TASK: "requestTask", // {}
  START_GAME: "startGame", // {} Lobby -> laufendes Spiel (nur Host/Leitstand)
  TRIGGER_EVENT: "triggerEvent", // { kind } z. B. "asteroid" (nur Host/Leitstand)
  SET_DIFFICULTY: "setDifficulty", // { level: 1 | 2 | 3 } (nur Host/Leitstand)
  RESET_GAME: "resetGame", // {} zurueck in die Lobby (nur Host)
  DEBUG_BOTS: "debugBots", // { action: "spawn" | "clear", count? } Solo-Test (nur Host, nur mit DAEDALUS_DEBUG)
  COOP_INPUT: "coopInput", // { param: "a" | "b", value: 0..1 } stufenlose Eingabe der Koop-Station
  COOP_CONFIRM: "coopConfirm", // {} Bestaetigung der Koop-Station (beide muessen bestaetigen)
};

// Nachrichten Server -> Client
export const S2C = {
  JOINED: "joined",        // { role, debug? } Bestaetigung des Beitritts (debug nur fuer den Host)
  ASSIGNMENT: "assignment", // { role: "operator"|"supporter", stationId, stationName, minigame }
  STATE: "state",          // Host: Gesamtansicht, Controller: Stationsansicht
  TASK_ASSIGNED: "taskAssigned", // { minigame, level, seed }
  RESULT: "result",        // { geloest, teiltreffer, hinweis }
  EVENT: "event",          // { kind, ... } z. B. "start", "asteroid", "rotate"
};

// Spielphasen (auch sichtbarer Zustand fuer Beamer und Leitstand).
// "lobby": Crew tritt bei, das Spiel wartet auf den Start durch die Lehrkraft.
export const PHASES = { LOBBY: "lobby", RUNNING: "running", WON: "won", LOST: "lost" };

// Stationsstatus (sichtbarer Text)
export const STATUS = { STABLE: "stabil", WARN: "achtung", CRITICAL: "kritisch" };

// Standard-Stationen des MVP. Weitere folgen, sobald ihre Mini-Spiele existieren.
// `coop: true` schaltet den kooperativen Pfad frei (geteilter Stationszustand auf
// dem Server). Die drei Einzelspiel-Stationen bleiben davon unberuehrt.
export const STATIONS = [
  { id: "bordcomputer", name: "Bordcomputer", minigame: "bordcomputer" },
  { id: "sensorik", name: "Sensorik", minigame: "tiefpassfilter" },
  { id: "navigation", name: "Navigation", minigame: "zahlensysteme" },
  { id: "reaktor", name: "Reaktor", minigame: "reaktor", coop: true },
];

export function encode(type, payload = {}) {
  return JSON.stringify({ type, ...payload });
}

export function decode(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
