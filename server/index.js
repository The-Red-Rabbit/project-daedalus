// Einstiegspunkt: liefert den Client aus und betreibt einen WebSocket-Raum.
// Bewusst schlank gehalten. Tiefergehende Spiellogik liegt in game.js.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";
import { C2S, S2C, TICK_HZ, STATIONS, PHASES, encode, decode } from "../shared/protocol.js";
import { createGame, ASTEROID_INTERVAL_SEC, ASTEROID_FILTER_FACTOR } from "./game.js";
import { createBots } from "./bots.js";
import { append as appendHighscore, load as loadHighscores, top as topHighscores } from "./highscore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLIENT = join(ROOT, "client");
const SHARED = join(ROOT, "shared");
const ASSETS = join(ROOT, "assets");
const PORT = Number(process.env.PORT) || 3000;
// Debug-Werkzeug fuers Solo-Testen: nur aktiv mit DAEDALUS_DEBUG, damit weder die
// Bots noch der Mini-Spiel-Teststand (/dev) je versehentlich im Unterricht auftauchen.
const DEBUG = !!process.env.DAEDALUS_DEBUG;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// Statische Auslieferung. /shared und /assets liegen im Projektstamm,
// alles andere unter client/.
async function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  // Einstieg und drei Ansichten: Starter (Auswahl), Beamer (Bruecke), Leitstand
  // (Lehrkraft) und Controller (Smartphone).
  if (urlPath === "/" || urlPath === "/host") urlPath = "/host/index.html";
  if (urlPath === "/beamer") urlPath = "/beamer/index.html";
  if (urlPath === "/dashboard") urlPath = "/dashboard/index.html";
  if (urlPath === "/controller") urlPath = "/controller/index.html";
  if (urlPath === "/dev") urlPath = "/dev/index.html"; // Debug-Teststand (nur mit DAEDALUS_DEBUG erreichbar)

  // Zielverzeichnis: /shared und /assets liegen im Stamm, alles andere unter client/.
  let confineDir = CLIENT;
  if (urlPath.startsWith("/shared/")) confineDir = SHARED;
  else if (urlPath.startsWith("/assets/")) confineDir = ASSETS;
  const base = confineDir === CLIENT ? CLIENT : ROOT;
  const filePath = normalize(join(base, urlPath));

  // Pfadausbruch verhindern: die Datei muss im Zielverzeichnis bleiben.
  // Ein reiner Praefix-Vergleich genuegt nicht (Nachbarordner mit gleichem
  // Anfang, Backslashes unter Windows), daher der Vergleich ueber relative().
  const rel = relative(confineDir, filePath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    res.writeHead(403);
    return res.end("verboten");
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("nicht gefunden");
  }
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

// Beitritts-URL fuer die Controller, gebildet aus der LAN-Adresse.
function joinUrl() {
  return `http://${lanAddress()}:${PORT}/controller`;
}

// Liefert die Beitritts-URL als QR-Code (SVG). Die URL steht zusaetzlich im
// Header X-Join-URL, damit der Host sie ohne zweite Anfrage anzeigen kann.
async function serveQr(res) {
  try {
    const url = joinUrl();
    const svg = await QRCode.toString(url, { type: "svg", margin: 1 });
    res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "X-Join-URL": url });
    res.end(svg);
  } catch {
    res.writeHead(500);
    res.end("QR-Fehler");
  }
}

const server = http.createServer((req, res) => {
  const path = decodeURIComponent((req.url || "/").split("?")[0]);
  if (path === "/qr") return serveQr(res);
  // Mini-Spiel-Teststand: ohne DAEDALUS_DEBUG existiert die Seite nicht.
  if ((path === "/dev" || path.startsWith("/dev/")) && !DEBUG) {
    res.writeHead(404);
    return res.end("nicht gefunden");
  }
  return serveStatic(req, res);
});
const wss = new WebSocketServer({ server });

// Ein einzelner Raum genuegt fuer das MVP. Spaeter optional mehrere Raeume.
const game = createGame({ stations: STATIONS, baseLevel: 1 });
const bots = DEBUG ? createBots(game) : null;
const hosts = new Set();
const controllers = new Map(); // ws -> participantId
let nextId = 1;

// Highscore-Zustand: alle gespeicherten Eintraege und der Zeitstempel des
// aktuellen Sieges (fuer die Hervorhebung in der Tabelle auf der Bruecke).
let highscores = [];
let prevPhase = PHASES.LOBBY;
let currentWinTs = null;
loadHighscores().then(list => { highscores = list; });

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) ws.send(encode(type, payload));
}

// An alle Verbundenen senden (Host und Controller).
function broadcast(type, payload) {
  for (const ws of hosts) send(ws, type, payload);
  for (const ws of controllers.keys()) send(ws, type, payload);
}

function wsOf(participantId) {
  for (const [ws, id] of controllers) if (id === participantId) return ws;
  return null;
}

// Einem Controller seine aktuelle Rolle und eine frische Aufgabe schicken.
function seat(ws, participantId) {
  const assignment = game.assignmentOf(participantId);
  if (assignment) send(ws, S2C.ASSIGNMENT, assignment);
  const task = game.assignTask(participantId);
  if (task) send(ws, S2C.TASK_ASSIGNED, task);
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = decode(raw.toString());
    if (!msg) return;

    if (msg.type === C2S.JOIN) {
      if (msg.role === "host") {
        hosts.add(ws);
        // debug schaltet im Leitstand den Bot-Bereich frei (siehe DAEDALUS_DEBUG).
        send(ws, S2C.JOINED, { role: "host", debug: DEBUG });
        send(ws, S2C.STATE, game.hostState());
      } else {
        // Server setzt die Person selbst (Operator oder Co-Pilot) und vergibt
        // sofort eine Aufgabe, niemand wartet.
        const pid = `p${nextId++}`;
        controllers.set(ws, pid);
        game.addParticipant(pid, typeof msg.label === "string" ? msg.label.slice(0, 24) : "Crew");
        send(ws, S2C.JOINED, { role: "controller" });
        seat(ws, pid);
      }
      return;
    }

    if (msg.type === C2S.SOLVE_ATTEMPT) {
      const pid = controllers.get(ws);
      if (!pid) return;
      const mode = msg.mode === "function" ? "function" : "energy";
      const result = game.solve(pid, msg.input, mode);
      send(ws, S2C.RESULT, result);
      if (result.specialFunction) {
        broadcast(S2C.EVENT, { kind: "specialFunction", ...result.specialFunction });
      }
      if (result.geloest) {
        const task = game.assignTask(pid); // neue Zufallsaufgabe
        if (task) send(ws, S2C.TASK_ASSIGNED, task);
      }
      return;
    }

    // Hilfe-Button: zufaelligen Helfer waehlen und diesem den Hinweis schicken.
    if (msg.type === C2S.HELP_REQUEST) {
      const pid = controllers.get(ws);
      if (!pid) return;
      const result = game.requestHelp(pid);
      if (!result.ok) {
        send(ws, S2C.EVENT, { kind: "helpDenied", reason: result.reason, remaining: result.remaining ?? 0 });
        return;
      }
      const helperWs = wsOf(result.helperId);
      if (helperWs) {
        send(helperWs, S2C.HELP_HINT, { hint: result.hint, requesterLabel: result.requesterLabel });
      }
      send(ws, S2C.EVENT, { kind: "helpSent", helperLabel: result.helperLabel });
      return;
    }

    // Abstimmung starten (Weg C): Initiator verbraucht sein Recht; der State-Tick
    // verteilt den neuen vote-Zustand automatisch an alle Controller.
    if (msg.type === C2S.VOTE_START) {
      const pid = controllers.get(ws);
      if (!pid) return;
      const result = game.voteStart(pid);
      if (!result.ok) {
        send(ws, S2C.EVENT, { kind: "voteDenied", reason: result.reason });
      }
      return;
    }

    // Stimme abgeben waehrend laufender Abstimmung.
    if (msg.type === C2S.VOTE_CAST) {
      const pid = controllers.get(ws);
      if (!pid) return;
      game.voteCast(pid, msg.choice);
      // State-Tick verteilt hasCast und neue Auszaehlung automatisch.
      return;
    }

    // Controller: bereit fuer naechsten Sektor melden.
    if (msg.type === C2S.READY) {
      const pid = controllers.get(ws);
      if (!pid) return;
      game.markReady(pid);
      return;
    }

    // Leitstand: naechsten Sektor starten (Fortschritt muss bei 100 liegen).
    if (msg.type === C2S.NEXT_SECTOR) {
      if (!hosts.has(ws)) return;
      const result = game.advanceSector();
      if (!result) return; // Fortschritt noch nicht bei 100 oder falscher Zustand
      if (result.won) {
        // Sieg: Phase ist jetzt WON, der naechste Tick verteilt den neuen Zustand.
        // Kein rotate-Ereignis – Bruecke und Controller reagieren auf den Phasenwechsel.
      } else {
        // Neuer Sektor: Rollen rotiert (in advanceSector), alle neu setzen.
        broadcast(S2C.EVENT, { kind: "rotate", sector: result.sector, sectorCount: game.hostState().sectorCount });
        for (const [cws, pid] of controllers) seat(cws, pid);
        if (bots) bots.reseat();
      }
      return;
    }

    if (msg.type === C2S.REQUEST_TASK) {
      const pid = controllers.get(ws);
      if (!pid) return;
      const task = game.assignTask(pid);
      if (task) send(ws, S2C.TASK_ASSIGNED, task);
      return;
    }

    // Leitstand: nur vom Host akzeptieren.
    if (msg.type === C2S.START_GAME) {
      if (!hosts.has(ws)) return;
      const phase = game.startGame();
      if (phase === "running") {
        // Frische Aufgaben fuer alle, damit das Tempo ab dem Start fair zaehlt.
        for (const [client, pid] of controllers) seat(client, pid);
        if (bots) bots.reseat();
        broadcast(S2C.EVENT, { kind: "start", sector: game.hostState().sector });
      }
      return;
    }

    if (msg.type === C2S.TRIGGER_EVENT) {
      if (!hosts.has(ws)) return;
      const event = game.triggerEvent(msg.kind);
      if (event) broadcast(S2C.EVENT, event);
      return;
    }

    if (msg.type === C2S.SET_DIFFICULTY) {
      if (!hosts.has(ws)) return;
      game.setBaseLevel(msg.level);
      return;
    }

    if (msg.type === C2S.RESET_GAME) {
      if (!hosts.has(ws)) return;
      game.reset();
      // Zurueck in die Lobby: die Crew bleibt sitzen und wartet auf den naechsten
      // Start (die Controller schalten ueber den Phasenwechsel selbst auf Warten).
      // Frische Aufgaben verteilt erst der naechste START_GAME.
      return;
    }

    // Debug-Werkzeug: simulierte Spieler erzeugen oder entfernen. Nur vom Host
    // und nur, wenn der Server mit DAEDALUS_DEBUG gestartet wurde.
    if (msg.type === C2S.DEBUG_BOTS) {
      if (!hosts.has(ws) || !bots) return;
      if (msg.action === "spawn") bots.spawn(Math.min(20, Math.max(1, Math.floor(Number(msg.count) || 1))));
      else if (msg.action === "clear") bots.clear();
      return;
    }

    // Debug-Teststand: setzt diesen Controller direkt als Operator auf eine
    // gewaehlte Station und versetzt das Spiel in den Sandbox-Zustand, damit das
    // Mini-Spiel sofort mountet. Nur mit DAEDALUS_DEBUG, sonst stillschweigend ignoriert.
    if (msg.type === C2S.DEBUG_SEAT) {
      if (!DEBUG) return;
      let pid = controllers.get(ws);
      if (!pid) {
        pid = `p${nextId++}`;
        controllers.set(ws, pid);
      }
      const label = typeof msg.label === "string" ? msg.label.slice(0, 24) : "Dev";
      const assignment = game.debugSeat(pid, label, msg.station, msg.level);
      if (!assignment) return; // unbekannte Station
      send(ws, S2C.JOINED, { role: "controller" });
      seat(ws, pid);
      return;
    }
  });

  ws.on("close", () => {
    hosts.delete(ws);
    const pid = controllers.get(ws);
    if (pid) {
      controllers.delete(ws);
      const { promoted } = game.removeParticipant(pid);
      // Rueckt ein Co-Pilot zum Operator nach, bekommt er Rolle und Aufgabe neu.
      if (promoted) {
        const pws = wsOf(promoted.id);
        if (pws) seat(pws, promoted.id);
      }
    }
  });
});

// Spieltakt: Werte aktualisieren und Zustand verteilen.
const dt = 1 / TICK_HZ;
setInterval(() => {
  const { rotated, voteResolved } = game.tick(dt);
  if (voteResolved) {
    broadcast(S2C.EVENT, { kind: "voteResult", result: voteResolved.result, yesCount: voteResolved.yesCount, noCount: voteResolved.noCount, chargeConsumed: voteResolved.chargeConsumed });
  }
  // Automatische Asteroidenwellen: Poisson-Prozess mit mittlerem Abstand ASTEROID_INTERVAL_SEC.
  // Sensorik-Sonderfunktion (Asteroiden filtern): waehrend der Filterdauer ist der Takt ASTEROID_FILTER_FACTOR-mal langsamer.
  const asteroidInterval = game.isAsteroidFiltered() ? ASTEROID_INTERVAL_SEC * ASTEROID_FILTER_FACTOR : ASTEROID_INTERVAL_SEC;
  if (Math.random() < dt / asteroidInterval) {
    const event = game.triggerEvent("asteroid");
    if (event) broadcast(S2C.EVENT, event);
  }
  // Sektorwechsel: auch die Bots bekommen wie die Controller neue Aufgaben.
  if (rotated && bots) bots.reseat();
  // Bots loesen nach dem Tick und vor dem Versand, damit ihr Stand sofort sichtbar ist.
  if (bots) bots.tick(dt, game.hostState().phase === PHASES.RUNNING);
  const rawState = game.hostState();

  // Sieg erkennen (steigende Flanke): Eintrag speichern und Zeitstempel merken.
  if (prevPhase !== PHASES.WON && rawState.phase === PHASES.WON) {
    const entry = {
      score: rawState.shared.score,
      crew: (rawState.roster || []).map(p => p.label),
      ts: new Date().toISOString(),
    };
    currentWinTs = entry.ts;
    appendHighscore(entry).then(list => { highscores = list; });
  } else if (prevPhase === PHASES.WON && rawState.phase !== PHASES.WON) {
    currentWinTs = null; // neue Runde, kein Highlight mehr
  }
  prevPhase = rawState.phase;

  // Bruecke bekommt die Top-10-Liste und den Zeitstempel des aktuellen Sieges.
  const hostState = {
    ...rawState,
    highscores: topHighscores(highscores),
    currentWinTs: rawState.phase === PHASES.WON ? currentWinTs : null,
  };
  for (const ws of hosts) send(ws, S2C.STATE, hostState);
  for (const [ws, pid] of controllers) send(ws, S2C.STATE, game.participantState(pid));
  // Sektorwechsel: Rollen rotieren, alle bekommen neue Sitzordnung und Aufgabe.
  // Das rotate-Ereignis traegt Sektor und Sektorzahl fuer das Zwischenbild auf
  // Bruecke und Phones; die neue Station je Person folgt im anschliessenden assignment.
  if (rotated) {
    broadcast(S2C.EVENT, { kind: "rotate", sector: hostState.sector, sectorCount: hostState.sectorCount });
    for (const [ws, pid] of controllers) seat(ws, pid);
  }
}, 1000 / TICK_HZ);

server.listen(PORT, async () => {
  const url = joinUrl();
  const qr = await QRCode.toString(url, { type: "terminal", small: true }).catch(() => "");
  console.log(`Daedalus laeuft auf http://localhost:${PORT}`);
  console.log(`Host:       http://localhost:${PORT}/host`);
  console.log(`Controller: ${url}`);
  if (qr) console.log(qr);
});
