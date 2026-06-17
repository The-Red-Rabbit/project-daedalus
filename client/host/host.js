// Host: verbindet Netz, Renderer und Audio und aktualisiert das HUD.
import { connect } from "/net.js";
import { C2S, S2C, STATUS } from "/shared/protocol.js";
import { createRenderer } from "/host/renderer.js";
import { createAudio } from "/audio.js";

const el = (id) => document.getElementById(id);
const canvas = el("scene");
const renderer = createRenderer(canvas);
const audio = createAudio();

const statusColor = {
  [STATUS.STABLE]: "var(--status-stable)",
  [STATUS.WARN]: "var(--status-warn)",
  [STATUS.CRITICAL]: "var(--status-critical)",
};

el("join-url").textContent = `${location.host}/controller`;

const net = connect({
  open: () => net.send(C2S.JOIN, { role: "host" }),
  message: (msg) => {
    if (msg.type === S2C.STATE) updateState(msg);
    if (msg.type === S2C.EVENT && msg.kind === "asteroid") {
      audio.play("alarm.asteroid");
      renderer.shake();
    }
  },
});

function updateState(state) {
  el("sector").textContent = `Sektor ${state.sector}`;
  el("v-huelle").style.width = `${state.shared.huelle}%`;
  el("v-energie").style.width = `${state.shared.energie}%`;
  el("v-fortschritt").style.width = `${state.shared.fortschritt}%`;
  renderStations(state.stations);
  renderer.setState(state);
}

function renderStations(stations) {
  const root = el("stations");
  root.innerHTML = "";
  for (const s of stations) {
    const div = document.createElement("div");
    div.className = "station";
    const owner = s.owner ? ` · ${s.owner}` : "";
    div.innerHTML =
      `<div class="name">${s.name}</div>` +
      `<div class="status" style="color:${statusColor[s.status] || "var(--text-muted)"}">${s.status}${owner}</div>`;
    root.appendChild(div);
  }
}

el("btn-event").addEventListener("click", () => {
  // TODO: Ereignis an den Server senden, sobald dieser es verarbeitet.
  audio.play("alarm.asteroid");
  renderer.shake();
});

el("btn-audio").addEventListener("click", async () => {
  await audio.unlock();
  audio.startAmbient();
});

renderer.start();
