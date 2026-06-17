// Controller: Station waehlen, Mini-Spiel laden, Eingaben senden.
import { connect } from "/net.js";
import { C2S, S2C, STATUS } from "/shared/protocol.js";
import { registry } from "/minigames/registry.js";
import { mulberry32 } from "/shared/rng.js";
import { createAudio } from "/audio.js";

const app = document.getElementById("app");
const audio = createAudio();
let current = null; // Handle des laufenden Mini-Spiels
let stationName = "";

const net = connect({
  open: () => net.send(C2S.JOIN, { role: "controller" }),
  message: (msg) => {
    if (msg.type === S2C.JOINED) showPicker(msg.stations);
    if (msg.type === S2C.TASK_ASSIGNED) startTask(msg);
    if (msg.type === S2C.RESULT) handleResult(msg);
    if (msg.type === S2C.STATE) updateHull(msg);
  },
});

function clear() {
  if (current && current.unmount) current.unmount();
  current = null;
  app.innerHTML = "";
}

function showPicker(stations) {
  clear();
  const wrap = document.createElement("div");
  wrap.className = "screen";
  wrap.innerHTML = `<h1 class="title">Station wählen</h1>`;
  const list = document.createElement("div");
  list.className = "station-list";
  (stations || []).forEach((s) => {
    const b = document.createElement("button");
    b.className = "station-btn";
    b.textContent = s.name;
    b.addEventListener("click", async () => {
      await audio.unlock();
      audio.play("ui.toggle");
      stationName = s.name;
      net.send(C2S.PICK_STATION, { stationId: s.id, label: "Crew" });
    });
    list.appendChild(b);
  });
  if (!stations || !stations.length) {
    list.innerHTML = `<p class="muted">Alle Stationen sind besetzt.</p>`;
  }
  wrap.appendChild(list);
  app.appendChild(wrap);
}

function startTask(msg) {
  clear();
  const mod = registry[msg.minigame];
  if (!mod) {
    app.innerHTML = `<p class="muted">Unbekanntes Mini-Spiel: ${msg.minigame}</p>`;
    return;
  }
  const rng = mulberry32(msg.seed);
  const task = mod.generate(msg.level, rng);
  const root = document.createElement("div");
  root.className = "screen";
  app.appendChild(root);
  const ctx = {
    audio,
    station: stationName,
    submit: (input) => net.send(C2S.SOLVE_ATTEMPT, { input }),
  };
  current = mod.mount(root, task, ctx) || null;
}

function handleResult(res) {
  audio.play(res.geloest ? "ui.confirm" : "ui.error");
  if (current && current.onResult) current.onResult(res);
}

const statusColor = {
  [STATUS.STABLE]: "var(--status-stable)",
  [STATUS.WARN]: "var(--status-warn)",
  [STATUS.CRITICAL]: "var(--status-critical)",
};

function hullColor(huelle) {
  if (huelle > 50) return "var(--status-stable)";
  if (huelle > 25) return "var(--status-warn)";
  return "var(--status-critical)";
}

function updateHull(state) {
  if (!state.shared) return;
  let hud = document.getElementById("hud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "hud";
    hud.className = "hud";
    hud.innerHTML =
      `<div class="hud-row"><span>Schiffshülle</span><div class="bar"><div id="hud-hull"></div></div></div>` +
      `<div class="hud-row" id="hud-station-row"><span id="hud-station">Station</span><div class="bar"><div id="hud-stability"></div></div></div>`;
    document.body.appendChild(hud);
  }
  const hull = document.getElementById("hud-hull");
  hull.style.width = `${state.shared.huelle}%`;
  hull.style.background = hullColor(state.shared.huelle);

  const row = document.getElementById("hud-station-row");
  if (state.status) {
    row.style.display = "";
    document.getElementById("hud-station").textContent = state.status;
    const fill = document.getElementById("hud-stability");
    fill.style.width = `${Math.round((state.stability || 0) * 100)}%`;
    fill.style.background = statusColor[state.status] || "var(--text-muted)";
  } else {
    row.style.display = "none";
  }
}
