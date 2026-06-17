// Einstiegspunkt: liefert den Client aus und betreibt einen WebSocket-Raum.
// Bewusst schlank gehalten. Tiefergehende Spiellogik liegt in game.js.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";
import { C2S, S2C, TICK_HZ, STATIONS, encode, decode } from "../shared/protocol.js";
import { createGame } from "./game.js";

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
  if (urlPath === "/" || urlPath === "/host") urlPath = "/host/index.html";
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
const hosts = new Set();
const controllers = new Map(); // ws -> stationId

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) ws.send(encode(type, payload));
}

// An alle Verbundenen senden (Host und Controller).
function broadcast(type, payload) {
  for (const ws of hosts) send(ws, type, payload);
  for (const ws of controllers.keys()) send(ws, type, payload);
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = decode(raw.toString());
    if (!msg) return;

    if (msg.type === C2S.JOIN) {
      if (msg.role === "host") {
        hosts.add(ws);
        send(ws, S2C.JOINED, { role: "host", stations: STATIONS });
      } else {
        send(ws, S2C.JOINED, { role: "controller", stations: game.freeStations() });
      }
      return;
    }

    if (msg.type === C2S.PICK_STATION) {
      const station = game.claimStation(msg.stationId, { label: msg.label || "Crew" });
      if (!station) {
        // Station unbekannt oder schon belegt: aktuelle Auswahl zuruecksenden,
        // damit der Controller seine Liste auffrischt statt haengen zu bleiben.
        send(ws, S2C.JOINED, { role: "controller", stations: game.freeStations() });
        return;
      }
      controllers.set(ws, station.id);
      const task = game.assignTask(station);
      send(ws, S2C.TASK_ASSIGNED, task);
      return;
    }

    if (msg.type === C2S.SOLVE_ATTEMPT) {
      const stationId = controllers.get(ws);
      if (!stationId) return;
      const result = game.solve(stationId, msg.input);
      send(ws, S2C.RESULT, result);
      if (result.geloest) {
        const task = game.assignTask(game.station(stationId)); // neue Zufallsaufgabe
        send(ws, S2C.TASK_ASSIGNED, task);
      }
      return;
    }

    if (msg.type === C2S.REQUEST_TASK) {
      const stationId = controllers.get(ws);
      if (!stationId) return;
      const task = game.assignTask(game.station(stationId));
      send(ws, S2C.TASK_ASSIGNED, task);
      return;
    }

    // Leitstand: nur vom Host akzeptieren.
    if (msg.type === C2S.TRIGGER_EVENT) {
      if (!hosts.has(ws)) return;
      const event = game.triggerEvent(msg.kind);
      if (event) broadcast(S2C.EVENT, event);
      return;
    }

    if (msg.type === C2S.SET_DIFFICULTY) {
      if (!hosts.has(ws)) return;
      game.setBaseLevel(msg.level);
    }
  });

  ws.on("close", () => {
    hosts.delete(ws);
    const stationId = controllers.get(ws);
    if (stationId) {
      game.releaseStation(stationId);
      controllers.delete(ws);
    }
  });
});

// Spieltakt: Werte aktualisieren und Zustand verteilen.
const dt = 1 / TICK_HZ;
setInterval(() => {
  game.tick(dt);
  const hostState = game.hostState();
  for (const ws of hosts) send(ws, S2C.STATE, hostState);
  for (const [ws, stationId] of controllers) send(ws, S2C.STATE, game.controllerState(stationId));
}, 1000 / TICK_HZ);

server.listen(PORT, async () => {
  const url = joinUrl();
  const qr = await QRCode.toString(url, { type: "terminal", small: true }).catch(() => "");
  console.log(`Daedalus laeuft auf http://localhost:${PORT}`);
  console.log(`Host:       http://localhost:${PORT}/host`);
  console.log(`Controller: ${url}`);
  if (qr) console.log(qr);
});
