// Gemeinsame Konstanten und Nachrichtentypen fuer Server und Client.
// Ein einziger Ort, damit beide Seiten nie auseinanderlaufen.

export const TICK_HZ = 10;

// Nachrichten Client -> Server
export const C2S = {
  JOIN: "join",            // { role: "host" | "controller", label? }
  SOLVE_ATTEMPT: "solveAttempt", // { input }
  REQUEST_TASK: "requestTask", // {}
  TRIGGER_EVENT: "triggerEvent", // { kind } z. B. "asteroid" (nur Host/Leitstand)
  SET_DIFFICULTY: "setDifficulty", // { level: 1 | 2 | 3 } (nur Host/Leitstand)
  RESET_GAME: "resetGame", // {} neuer Anlauf (nur Host)
};

// Nachrichten Server -> Client
export const S2C = {
  JOINED: "joined",        // { role } Bestaetigung des Beitritts
  ASSIGNMENT: "assignment", // { role: "operator"|"supporter", stationId, stationName, minigame }
  STATE: "state",          // Host: Gesamtansicht, Controller: Stationsansicht
  TASK_ASSIGNED: "taskAssigned", // { minigame, level, seed }
  RESULT: "result",        // { geloest, teiltreffer, hinweis }
  EVENT: "event",          // { kind, ... } z. B. "asteroid", "rotate"
};

// Stationsstatus (sichtbarer Text)
export const STATUS = { STABLE: "stabil", WARN: "achtung", CRITICAL: "kritisch" };

// Standard-Stationen des MVP. Weitere folgen, sobald ihre Mini-Spiele existieren.
export const STATIONS = [
  { id: "bordcomputer", name: "Bordcomputer", minigame: "bordcomputer" },
  { id: "sensorik", name: "Sensorik", minigame: "tiefpassfilter" },
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
