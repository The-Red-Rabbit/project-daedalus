// Gemeinsame Konstanten und Nachrichtentypen fuer Server und Client.
// Ein einziger Ort, damit beide Seiten nie auseinanderlaufen.

export const TICK_HZ = 10;

// Nachrichten Client -> Server
export const C2S = {
  JOIN: "join",            // { role: "host" | "controller", label? }
  SOLVE_ATTEMPT: "solveAttempt", // { input, mode?: "energy" | "function" } Standard "energy" (Weg A); "function" loest Sonderfunktion aus (Weg B)
  REQUEST_TASK: "requestTask", // {}
  START_GAME: "startGame", // {} Lobby -> laufendes Spiel (nur Host/Leitstand)
  TRIGGER_EVENT: "triggerEvent", // { kind } z. B. "asteroid" (nur Host/Leitstand)
  SET_DIFFICULTY: "setDifficulty", // { level: 1 | 2 | 3 } (nur Host/Leitstand)
  RESET_GAME: "resetGame", // {} zurueck in die Lobby (nur Host)
  DEBUG_BOTS: "debugBots", // { action: "spawn" | "clear", count? } Solo-Test (nur Host, nur mit DAEDALUS_DEBUG)
  DEBUG_SEAT: "debugSeat", // { station, level, label? } Teststand: direkt auf eine Station setzen (nur mit DAEDALUS_DEBUG)
  VOTE_START: "voteStart", // {} Abstimmung starten (Weg C des Stationsmenues)
  VOTE_CAST: "voteCast",  // { choice: "yes" | "no" } Stimme abgeben waehrend laufender Abstimmung
  READY: "ready",          // {} Spieler meldet sich bereit fuer den naechsten Sektor (nach Fortschritt 100)
  NEXT_SECTOR: "nextSector", // {} Lehrkraft startet den naechsten Sektor (nur Host)
  HELP_REQUEST: "helpRequest", // {} Hilfe anfordern; Server waehlt zufaelligen Helfer und sendet diesem den Hinweis
};

// Nachrichten Server -> Client
export const S2C = {
  JOINED: "joined",        // { role, debug? } Bestaetigung des Beitritts (debug nur fuer den Host)
  ASSIGNMENT: "assignment", // { role: "operator"|"supporter", stationId, stationName, minigame }
  STATE: "state",          // Host: Gesamtansicht, Controller: Stationsansicht
  TASK_ASSIGNED: "taskAssigned", // { minigame, level, seed }
  RESULT: "result",        // { geloest, teiltreffer, hinweis }
  EVENT: "event",          // { kind, ... } z. B. "start", "asteroid", "rotate"
  HELP_HINT: "helpHint",   // { hint, requesterLabel } Hinweis fuer den zufaellig ausgewaehlten Helfer
};

// Spielphasen (auch sichtbarer Zustand fuer Beamer und Leitstand).
// "lobby": Crew tritt bei, das Spiel wartet auf den Start durch die Lehrkraft.
export const PHASES = { LOBBY: "lobby", RUNNING: "running", WON: "won", LOST: "lost" };

// Stationsstatus (sichtbarer Text)
export const STATUS = { STABLE: "stabil", WARN: "achtung", CRITICAL: "kritisch" };

// Standard-Stationen des Spiels.
export const STATIONS = [
  { id: "bordcomputer", name: "Bordcomputer", minigame: "bordcomputer" },
  { id: "sensorik", name: "Sensorik", minigame: "filterauswahl" },
  { id: "navigation", name: "Navigation", minigame: "zahlensysteme" },
  { id: "reaktor", name: "Reaktor", minigame: "bauteiltausch" },
];

// Host-Zustand (hostState), der ueber STATE-Nachrichten an Beamer und Leitstand
// gesendet wird. Felder:
//
//   sector, sectorCount, phase, grace
//   crew
//   roster[]:   { id, label, role, stationName, contributions }
//   shared:     { huelle, energie, fortschritt, score, lossReason }
//               huelle      0..100 – einzige Niederlagebedingung
//               energie     0..100 – treibt den Fortschritt; sinkt ohne Aktivitaet
//               fortschritt 0..100 – Weg durch den aktuellen Sektor; klemmt bei 100
//               lossReason  null | "hull_depleted"
//   stations[]: { id, name, status, stability, operator, supporters, supporterNames }
//   endContributions?: [{ id, label, contributions }]  – nur bei phase "lost"
//
// Teilnehmer-Zustand (participantState) enthaelt: role, stationId, stationName,
// status, stability, phase, shared.

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
