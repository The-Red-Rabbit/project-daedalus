// Host: verbindet Netz, Renderer und Audio und aktualisiert das HUD.
import { connect } from "/net.js";
import { C2S, S2C, STATUS } from "/shared/protocol.js";
import { createRenderer } from "/host/renderer.js";
import { createAudio } from "/audio.js";

const el = (id) => document.getElementById(id);
const canvas = el("scene");
const renderer = createRenderer(canvas);
const audio = createAudio();
let audioOn = false; // erst nach "Ton an" darf Audio spielen

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

// Beitritts-QR und LAN-URL vom Server holen (siehe /qr).
async function loadJoin() {
  try {
    const res = await fetch("/qr");
    el("qr").innerHTML = await res.text();
    const url = res.headers.get("X-Join-URL");
    if (url) el("join-url").textContent = url;
  } catch {
    el("join-url").textContent = `${location.host}/controller`;
  }
}
loadJoin();

const net = connect({
  open: () => net.send(C2S.JOIN, { role: "host" }),
  message: (msg) => {
    if (msg.type === S2C.STATE) updateState(msg);
    if (msg.type === S2C.EVENT && msg.kind === "asteroid") {
      audio.play("alarm.asteroid");
      audio.play("impact.hull");
      renderer.shake();
    }
    if (msg.type === S2C.EVENT && msg.kind === "rotate") {
      audio.play("progress.tick");
      banner(`Sektor ${msg.sector} · Rollenwechsel`);
    }
  },
});

let bannerTimer = null;
function banner(text) {
  const b = el("banner");
  b.textContent = text;
  b.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove("show"), 3000);
}

function updateState(state) {
  el("sector").textContent = `Sektor ${state.sector} / ${state.sectorCount}`;
  el("crew").textContent = state.crew === 1 ? "1 Crew an Bord" : `${state.crew} Crew an Bord`;
  el("v-huelle").style.width = `${state.shared.huelle}%`;
  el("v-energie").style.width = `${state.shared.energie}%`;
  el("v-fortschritt").style.width = `${state.shared.fortschritt}%`;
  el("n-huelle").textContent = `${Math.round(state.shared.huelle)}%`;
  el("n-energie").textContent = `${Math.round(state.shared.energie)}%`;
  el("n-fortschritt").textContent = `${Math.round(state.shared.fortschritt)}%`;
  renderStations(state.stations);
  renderer.setState(state);
  applyPhase(state.phase);
  // Alarmbett bei kritischer Huelle (nur wenn der Ton freigegeben ist).
  if (audioOn) audio.setAlarm(state.phase === "running" && state.shared.huelle <= 30);
}

let prevPhase = "running";
function applyPhase(phase) {
  const box = el("result");
  if (phase === "running") {
    box.hidden = true;
  } else {
    const card = el("result-card");
    card.classList.toggle("lost", phase === "lost");
    el("result-title").textContent = phase === "won" ? "Sieg" : "Niederlage";
    el("result-text").textContent =
      phase === "won"
        ? "Die Daedalus hat das Asteroidenfeld durchquert."
        : "Die Hülle ist zusammengebrochen.";
    box.hidden = false;
  }
  if (phase !== prevPhase) {
    if (phase === "won") audio.play("ui.confirm");
    if (phase === "lost") {
      audio.play("ui.error");
      audio.play("impact.hull");
    }
    prevPhase = phase;
  }
}

function renderStations(stations) {
  const root = el("stations");
  root.innerHTML = "";
  for (const s of stations) {
    const div = document.createElement("div");
    div.className = "station";
    const color = statusColor[s.status] || "var(--text-muted)";
    const shape = statusShape[s.status] || "";
    const stability = Math.round((s.stability || 0) * 100);
    const who = s.operator ? s.operator : "frei";
    const sup = s.supporters > 0 ? ` · +${s.supporters} Co-Pilot${s.supporters > 1 ? "en" : ""}` : "";
    div.innerHTML =
      `<div class="name">${s.name}</div>` +
      `<div class="status" style="color:${color}">${shape} ${s.status}</div>` +
      `<div class="who">${who}${sup}</div>` +
      `<div class="stability"><div style="width:${stability}%; background:${color}"></div></div>`;
    root.appendChild(div);
  }
}

el("btn-event").addEventListener("click", () => {
  // Server loest die Welle aus und meldet sie als EVENT an alle zurueck.
  net.send(C2S.TRIGGER_EVENT, { kind: "asteroid" });
});

el("sel-difficulty").addEventListener("change", (e) => {
  net.send(C2S.SET_DIFFICULTY, { level: Number(e.target.value) });
});

el("btn-restart").addEventListener("click", () => {
  net.send(C2S.RESET_GAME);
});

el("btn-reset").addEventListener("click", () => {
  net.send(C2S.RESET_GAME);
});

el("btn-audio").addEventListener("click", async () => {
  await audio.unlock();
  audio.startAmbient();
  audioOn = true;
  el("btn-audio").textContent = "Ton an ✓";
});

renderer.start();
