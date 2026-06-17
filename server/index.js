// Einstiegspunkt: liefert den Client aus und betreibt einen WebSocket-Raum.
// Bewusst schlank gehalten. Tiefergehende Spiellogik liegt in game.js.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";
import { C2S, S2C, TICK_HZ, STATIONS, encode, decode } from "../shared/protocol.js";
import { createGame } from "./game.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
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

  const fromRoot = urlPath.startsWith("/shared/") || urlPath.startsWith("/assets/");
  const base = fromRoot ? ROOT : join(ROOT, "client");
  const filePath = normalize(join(base, urlPath));
  if (!filePath.startsWith(ROOT)) {
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

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server });

// Ein einzelner Raum genuegt fuer das MVP. Spaeter optional mehrere Raeume.
const game = createGame({ stations: STATIONS, baseLevel: 1 });
const hosts = new Set();
const controllers = new Map(); // ws -> stationId

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) ws.send(encode(type, payload));
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
      if (!station) return;
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
  const url = `http://${lanAddress()}:${PORT}/controller`;
  const qr = await QRCode.toString(url, { type: "terminal", small: true }).catch(() => "");
  console.log(`Daedalus laeuft auf http://localhost:${PORT}`);
  console.log(`Host:       http://localhost:${PORT}/host`);
  console.log(`Controller: ${url}`);
  if (qr) console.log(qr);
});
