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
import { createGame } from "./game.js";
import { createBots } from "./bots.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLIENT = join(ROOT, "client");
const SHARED = join(ROOT, "shared");
const ASSETS = join(ROOT, "assets");
const PORT = Number(process.env.PORT) || 3000;

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
  return serveStatic(req, res);
});
const wss = new WebSocketServer({ server });

// Ein einzelner Raum genuegt fuer das MVP. Spaeter optional mehrere Raeume.
const game = createGame({ stations: STATIONS, baseLevel: 1 });
// Debug-Werkzeug fuer das Solo-Testen: nur aktiv, wenn DAEDALUS_DEBUG gesetzt ist,
// damit es nie versehentlich im Unterricht auftaucht.
const DEBUG = !!process.env.DAEDALUS_DEBUG;
const bots = DEBUG ? createBots(game) : null;
const hosts = new Set();
const controllers = new Map(); // ws -> participantId
let nextId = 1;

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
      const result = game.solve(pid, msg.input);
      send(ws, S2C.RESULT, result);
      if (result.geloest) {
        const task = game.assignTask(pid); // neue Zufallsaufgabe
        if (task) send(ws, S2C.TASK_ASSIGNED, task);
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

    // Koop-Station (Reaktor): stufenlose Reglereingabe. Der Server prueft die
    // Berechtigung; die Wirkung wird ueber den naechsten state sichtbar.
    if (msg.type === C2S.COOP_INPUT) {
      const pid = controllers.get(ws);
      if (!pid) return;
      game.setCoopInput(pid, msg.param, msg.value);
      return;
    }

    // Koop-Station: Bestaetigung. Haben beide Seiten bestaetigt, wertet der Server
    // aus und meldet beiden das Ergebnis. Das neue Ziel kommt ueber den state.
    if (msg.type === C2S.COOP_CONFIRM) {
      const pid = controllers.get(ws);
      if (!pid) return;
      const out = game.coopConfirm(pid);
      if (out && out.evaluated) {
        for (const id of out.participants) {
          const w = wsOf(id);
          if (w) send(w, S2C.RESULT, { geloest: out.geloest, teiltreffer: out.geloest ? 1 : 0, hinweis: out.geloest ? "Reaktor kalibriert." : "Daneben – neu absprechen." });
        }
      }
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
  const { rotated } = game.tick(dt);
  // Sektorwechsel: auch die Bots bekommen wie die Controller neue Aufgaben.
  if (rotated && bots) bots.reseat();
  // Bots loesen nach dem Tick und vor dem Versand, damit ihr Stand sofort sichtbar ist.
  if (bots) bots.tick(dt, game.hostState().phase === PHASES.RUNNING);
  const hostState = game.hostState();
  for (const ws of hosts) send(ws, S2C.STATE, hostState);
  for (const [ws, pid] of controllers) send(ws, S2C.STATE, game.participantState(pid));
  // Sektorwechsel: Rollen rotieren, alle bekommen neue Sitzordnung und Aufgabe.
  if (rotated) {
    broadcast(S2C.EVENT, { kind: "rotate", sector: hostState.sector });
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
