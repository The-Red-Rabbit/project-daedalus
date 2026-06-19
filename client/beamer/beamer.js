// Beamer: die Brücken-Ansicht für die ganze Klasse. Rendert die Szene durch das
// Cockpitfenster, zeigt in der Lobby den Beitritts-QR und die Crew, im Spiel das
// HUD und den Stationsstatus und am Ende das Ergebnis. Steuern kann der Beamer
// nichts – das macht der Leitstand (/dashboard).
import { connect } from "/net.js";
import { C2S, S2C, STATUS, PHASES } from "/shared/protocol.js";
import { createRenderer } from "/beamer/renderer.js";
import { createAudio } from "/audio.js";

const el = (id) => document.getElementById(id);
const renderer = createRenderer(el("scene"));
const audio = createAudio();
let audioOn = false; // erst nach "Ton an" darf Audio spielen
const WELCOME_URL = "/assets/audio/AI_welcome.wav"; // Begruessung der Bord-KI beim Start

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

// Beitritts-QR und LAN-URL vom Server holen (siehe /qr) und in Lobby + Ecke zeigen.
async function loadJoin() {
  try {
    const res = await fetch("/qr");
    const svg = await res.text();
    el("lobby-qr").innerHTML = svg;
    el("qr").innerHTML = svg;
    const url = res.headers.get("X-Join-URL");
    if (url) {
      el("lobby-url").textContent = url;
      el("join-url").textContent = url;
    }
  } catch {
    const fallback = `${location.host}/controller`;
    el("lobby-url").textContent = fallback;
    el("join-url").textContent = fallback;
  }
}
loadJoin();

const net = connect({
  open: () => net.send(C2S.JOIN, { role: "host" }),
  message: (msg) => {
    if (msg.type === S2C.STATE) updateState(msg);
    if (msg.type === S2C.EVENT && msg.kind === "start") {
      if (audioOn) {
        audio.play("ui.confirm");
        audio.playFile(WELCOME_URL); // einmalige Begruessung der Bord-KI
      }
      banner(`Start · Sektor ${msg.sector}`);
    }
    if (msg.type === S2C.EVENT && msg.kind === "asteroid") {
      if (audioOn) {
        audio.play("alarm.asteroid");
        audio.play("impact.hull");
      }
      renderer.shake();
    }
    if (msg.type === S2C.EVENT && msg.kind === "rotate") {
      if (audioOn) audio.play("progress.tick");
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
  applyPhase(state);
  el("sector").textContent = `Sektor ${state.sector} / ${state.sectorCount}`;
  el("crew").textContent = state.crew === 1 ? "1 Crew an Bord" : `${state.crew} Crew an Bord`;
  el("v-huelle").style.width = `${state.shared.huelle}%`;
  el("v-energie").style.width = `${state.shared.energie}%`;
  el("v-fortschritt").style.width = `${state.shared.fortschritt}%`;
  el("n-huelle").textContent = `${Math.round(state.shared.huelle)}%`;
  el("n-energie").textContent = `${Math.round(state.shared.energie)}%`;
  el("n-fortschritt").textContent = `${Math.round(state.shared.fortschritt)}%`;
  renderStations(state.stations);
  renderReaktor(state);
  // Schonzeit-Hinweis: ruhiger Anflug, in dem nichts verfaellt.
  const graceHint = el("grace-hint");
  if (state.phase === PHASES.RUNNING && state.grace > 0) {
    graceHint.textContent = `▷ Anflug · noch ${state.grace} s zum Stabilisieren`;
    graceHint.hidden = false;
  } else {
    graceHint.hidden = true;
  }
  renderer.setState(state);
  // Alarmbett bei kritischer Huelle (nur im laufenden Spiel und wenn Ton frei).
  if (audioOn) audio.setAlarm(state.phase === PHASES.RUNNING && state.shared.huelle <= 30);
}

function applyPhase(state) {
  const phase = state.phase;
  el("lobby").hidden = phase !== PHASES.LOBBY;
  el("overlay").hidden = phase === PHASES.LOBBY;
  el("result").hidden = phase !== PHASES.WON && phase !== PHASES.LOST;

  if (phase === PHASES.LOBBY) renderLobbyCrew(state.roster || []);
  if (phase === PHASES.WON || phase === PHASES.LOST) {
    const card = el("result-card");
    card.classList.toggle("lost", phase === PHASES.LOST);
    el("result-title").textContent = phase === PHASES.WON ? "Sieg" : "Niederlage";
    el("result-text").textContent =
      phase === PHASES.WON
        ? "Die Daedalus hat das Asteroidenfeld durchquert."
        : "Die Hülle ist zusammengebrochen.";
  }

  if (phase !== prevPhase) {
    if (audioOn && phase === PHASES.WON) audio.play("ui.confirm");
    if (audioOn && phase === PHASES.LOST) {
      audio.play("ui.error");
      audio.play("impact.hull");
    }
    prevPhase = phase;
  }
}
let prevPhase = PHASES.LOBBY;

function renderLobbyCrew(roster) {
  el("lobby-count").textContent = roster.length;
  const root = el("lobby-crew");
  if (!roster.length) {
    root.innerHTML = `<span class="lobby-empty">Noch niemand beigetreten …</span>`;
    return;
  }
  root.innerHTML = "";
  for (const p of roster) {
    const chip = document.createElement("span");
    chip.className = "crew-chip";
    chip.textContent = p.label;
    root.appendChild(chip);
  }
}

// Reaktor-Ziel und Naehe gross anzeigen, solange eine Koop-Station mitspielt.
function formatOhm(x) {
  if (x >= 1000) return `${(x / 1000).toFixed(2)} kΩ`;
  return `${Math.round(x)} Ω`;
}
function renderReaktor(state) {
  const panel = el("reaktor");
  const coopStation = (state.stations || []).find((s) => s.coop && s.coopView);
  if (!coopStation || state.phase !== PHASES.RUNNING) {
    panel.hidden = true;
    return;
  }
  const co = coopStation.coopView;
  panel.hidden = false;
  // Gruen erst, wenn wirklich eingerastet (nicht schon beim Betreten des Bandes).
  const locked = !!co.locked;
  panel.classList.toggle("locked", locked);
  el("rk-target").textContent = formatOhm(co.target);
  const pct = Math.round((co.match || 0) * 100);
  el("rk-match").style.width = `${pct}%`;
  // Klartext fuer die Klasse: einrasten / halten / Istwert.
  if (locked) el("rk-actual").textContent = "Kalibriert ✓";
  else if (co.inBand) el("rk-actual").textContent = `Im Zielband – halten ${Math.round((co.hold || 0) * 100)}%`;
  else el("rk-actual").textContent = `Ist ${formatOhm(co.actual)} · Übereinstimmung ${pct}%`;
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

el("btn-audio").addEventListener("click", async () => {
  await audio.unlock();
  audio.startAmbient();
  audio.preloadFile(WELCOME_URL); // damit die Begruessung beim Start sofort spielt
  audioOn = true;
  el("btn-audio").textContent = "♪ Ton an ✓";
});

renderer.start();
