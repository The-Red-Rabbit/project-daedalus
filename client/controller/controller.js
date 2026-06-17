// Controller: Lobby, Beitritt, Rollenanzeige (Operator oder Co-Pilot),
// laedt das zugewiesene Mini-Spiel und sendet Eingaben. Der Server verteilt
// die Rollen und rotiert sie zwischen den Sektoren.
import { connect } from "/net.js";
import { C2S, S2C, STATUS } from "/shared/protocol.js";
import { registry } from "/minigames/registry.js";
import { mulberry32 } from "/shared/rng.js";
import { createAudio } from "/audio.js";

const app = document.getElementById("app");
const audio = createAudio();

let current = null; // Handle des laufenden Mini-Spiels
let joinedLabel = null; // gesetzt nach dem ersten Beitritt (fuer Wiederverbinden)
let role = null; // "operator" | "supporter"
let stationName = "";

const net = connect({
  open: () => {
    setDisconnected(false);
    // Nach einem Reconnect automatisch mit demselben Namen wieder beitreten.
    if (joinedLabel !== null) net.send(C2S.JOIN, { role: "controller", label: joinedLabel });
  },
  close: () => setDisconnected(true),
  message: (msg) => {
    if (msg.type === S2C.ASSIGNMENT) applyAssignment(msg);
    if (msg.type === S2C.TASK_ASSIGNED) startTask(msg);
    if (msg.type === S2C.RESULT) handleResult(msg);
    if (msg.type === S2C.STATE) updateHud(msg);
    if (msg.type === S2C.EVENT && msg.kind === "rotate") toast("Rollenwechsel: neuer Sektor");
  },
});

// Erst zeigen, wenn die Verbindung steht. Bis dahin Lobby.
showLobby();

function clear() {
  if (current && current.unmount) current.unmount();
  current = null;
  app.innerHTML = "";
}

function showLobby() {
  clear();
  setTopbar(false);
  const wrap = document.createElement("div");
  wrap.className = "screen lobby";
  wrap.innerHTML =
    `<h1 class="title">Daedalus</h1>` +
    `<p class="muted">Tritt der Crew bei. Der Leitstand weist dir eine Station zu.</p>` +
    `<input id="lobby-name" class="lobby-name" placeholder="Dein Name" maxlength="24" autocomplete="off">` +
    `<button id="lobby-join" class="bc-confirm">Beitreten</button>`;
  app.appendChild(wrap);
  const input = wrap.querySelector("#lobby-name");
  const btn = wrap.querySelector("#lobby-join");
  const go = async () => {
    const label = input.value.trim() || "Crew";
    joinedLabel = label;
    await audio.unlock(); // Tippen ist die Geste, die den Ton freigibt
    audio.play("ui.toggle");
    net.send(C2S.JOIN, { role: "controller", label });
    app.innerHTML = `<div class="screen"><p class="muted">Beitritt läuft …</p></div>`;
  };
  btn.addEventListener("click", go);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
}

function applyAssignment(msg) {
  role = msg.role;
  stationName = msg.stationName || "";
  setTopbar(true);
  // Die eigentliche Stations-UI baut sich beim folgenden taskAssigned auf.
}

function startTask(msg) {
  clear();
  setTopbar(true);
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
    role,
    submit: (input) => net.send(C2S.SOLVE_ATTEMPT, { input }),
  };
  current = mod.mount(root, task, ctx) || null;
}

function handleResult(res) {
  audio.play(res.geloest ? "station.stabilize" : "ui.error");
  if (current && current.onResult) current.onResult(res);
}

// --- HUD und Rahmen -------------------------------------------------------

const statusColor = {
  [STATUS.STABLE]: "var(--status-stable)",
  [STATUS.WARN]: "var(--status-warn)",
  [STATUS.CRITICAL]: "var(--status-critical)",
};
// Form je Status, damit nicht nur die Farbe informiert (Barrierearmut).
const statusShape = {
  [STATUS.STABLE]: "●",
  [STATUS.WARN]: "▲",
  [STATUS.CRITICAL]: "✕",
};

function hullColor(huelle) {
  if (huelle > 50) return "var(--status-stable)";
  if (huelle > 25) return "var(--status-warn)";
  return "var(--status-critical)";
}

function setTopbar(show) {
  let bar = document.getElementById("topbar");
  if (!show) {
    if (bar) bar.remove();
    document.body.classList.remove("has-topbar");
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "topbar";
    bar.className = "topbar";
    bar.innerHTML = `<span class="brand">Daedalus</span><span id="role-chip" class="chip"></span>`;
    document.body.appendChild(bar);
    document.body.classList.add("has-topbar");
  }
  const chip = bar.querySelector("#role-chip");
  const supporter = role === "supporter";
  chip.textContent = supporter ? `Co-Pilot · ${stationName}` : `Operator · ${stationName}`;
  chip.classList.toggle("supporter", supporter);
}

function updateHud(state) {
  if (!state.shared) return;
  let hud = document.getElementById("hud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "hud";
    hud.className = "hud";
    hud.innerHTML =
      `<div class="hud-row"><span>Schiffshülle</span><div class="bar"><div id="hud-hull"></div></div><b id="hud-hull-val"></b></div>` +
      `<div class="hud-row" id="hud-station-row"><span id="hud-station">Station</span><div class="bar"><div id="hud-stability"></div></div><b id="hud-stab-val"></b></div>`;
    document.body.appendChild(hud);
  }
  const hull = document.getElementById("hud-hull");
  hull.style.width = `${state.shared.huelle}%`;
  hull.style.background = hullColor(state.shared.huelle);
  document.getElementById("hud-hull-val").textContent = `${Math.round(state.shared.huelle)}%`;

  const row = document.getElementById("hud-station-row");
  if (state.status) {
    row.style.display = "";
    const color = statusColor[state.status] || "var(--text-muted)";
    document.getElementById("hud-station").textContent = `${statusShape[state.status] || ""} ${state.status}`;
    document.getElementById("hud-station").style.color = color;
    const fill = document.getElementById("hud-stability");
    fill.style.width = `${Math.round((state.stability || 0) * 100)}%`;
    fill.style.background = color;
    document.getElementById("hud-stab-val").textContent = `${Math.round((state.stability || 0) * 100)}%`;
  } else {
    row.style.display = "none";
  }
}

// --- Verbindung und Hinweise ---------------------------------------------

function setDisconnected(on) {
  let box = document.getElementById("disconnect");
  if (!on) {
    if (box) box.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.id = "disconnect";
    box.className = "disconnect";
    box.innerHTML = `<div><div class="dc-title">Verbindung verloren</div><div class="muted">Neuer Versuch läuft …</div></div>`;
    document.body.appendChild(box);
  }
}

let toastTimer = null;
function toast(text) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}
