// Leitstand: die Lehrkraft-Ansicht. Verbindet sich als Host, zeigt den
// Spielzustand (Phase, Schiffswerte, Stationen, Crew) und sendet die
// Steuerbefehle: Spiel starten, Grundstufe setzen, Asteroidenwelle, neuer Anlauf.
import { connect } from "/net.js";
import { C2S, S2C, STATUS, PHASES } from "/shared/protocol.js";

const el = (id) => document.getElementById(id);

const statusColor = {
  [STATUS.STABLE]: "var(--status-stable)",
  [STATUS.WARN]: "var(--status-warn)",
  [STATUS.CRITICAL]: "var(--status-critical)",
};
const statusShape = {
  [STATUS.STABLE]: "●",
  [STATUS.WARN]: "▲",
  [STATUS.CRITICAL]: "✕",
};
const phaseLabel = {
  [PHASES.LOBBY]: "Lobby",
  [PHASES.RUNNING]: "Einsatz läuft",
  [PHASES.WON]: "Sieg",
  [PHASES.LOST]: "Niederlage",
};

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
  open: () => {
    setConn(true);
    net.send(C2S.JOIN, { role: "host" });
  },
  close: () => setConn(false),
  message: (msg) => {
    if (msg.type === S2C.JOINED && msg.role === "host") el("debug").hidden = !msg.debug;
    if (msg.type === S2C.STATE) updateState(msg);
  },
});

function setConn(on) {
  const box = el("conn");
  box.classList.toggle("off", !on);
  el("conn-text").textContent = on ? "verbunden" : "getrennt …";
}

function updateState(state) {
  const phase = state.phase;
  const pill = el("phase-pill");
  pill.textContent = phaseLabel[phase] || phase;
  pill.className = `pill ${phase}`;
  el("sector").textContent = `Sektor ${state.sector} / ${state.sectorCount}`;

  el("v-huelle").style.width = `${state.shared.huelle}%`;
  el("v-energie").style.width = `${state.shared.energie}%`;
  el("v-fortschritt").style.width = `${state.shared.fortschritt}%`;
  el("n-huelle").textContent = `${Math.round(state.shared.huelle)}%`;
  el("n-energie").textContent = `${Math.round(state.shared.energie)}%`;
  el("n-fortschritt").textContent = `${Math.round(state.shared.fortschritt)}%`;

  renderStations(state.stations || []);
  renderCrew(state.roster || []);
  renderVote(state);
  setControls(state);
}

// Kompakter Joker-Status: Ladungen und laufende Abstimmung fuer die Lehrkraft.
function renderVote(state) {
  const charges = state.shared?.jokerCharges ?? 3;
  const vote = state.vote;
  const content = el("vote-content");
  if (!content) return;
  if (!vote) {
    const pips = "◈".repeat(charges) + (charges < 3 ? "◇".repeat(3 - charges) : "");
    content.innerHTML =
      `<span style="font-family:var(--font-mono); color:var(--accent-yellow); font-size:18px; letter-spacing:0.1em;">${pips}</span>` +
      `<span style="margin-left:8px;">${charges} Ladung${charges === 1 ? "" : "en"} verbleibend</span>`;
    return;
  }
  content.innerHTML =
    `<div style="margin-bottom:6px; color:var(--accent-yellow); font-weight:600; letter-spacing:0.06em; text-transform:uppercase;">Läuft · noch ${vote.timeLeft ?? "?"}s</div>` +
    `<div>Initiiert von: <b style="color:var(--text-primary);">${vote.initiatorLabel || "–"}</b></div>` +
    `<div style="margin-top:4px;">Abgestimmt: ${vote.castCount} von ${vote.total}</div>`;
}

// Schwellenwert fuer "Nächsten Sektor starten": die Schaltflaeche wird freigeschaltet,
// sobald der Fortschritt 100 % erreicht hat. Der Bereit-Zaehler informiert die Lehrkraft,
// wer sich gemeldet hat; die Freigabe liegt immer beim Leitstand.
function setControls(state) {
  const phase = state.phase;
  const start = el("btn-start");
  start.disabled = phase !== PHASES.LOBBY;
  start.textContent = phase === PHASES.LOBBY ? "Spiel starten" : "Einsatz läuft …";
  el("btn-event").disabled = phase !== PHASES.RUNNING;
  el("btn-reset").disabled = phase === PHASES.LOBBY;

  const atBoundary = !!state.atBoundary;
  const btnNext = el("btn-next-sector");
  const readyInfo = el("ready-info");
  btnNext.disabled = !atBoundary;
  if (atBoundary) {
    const crew = state.crew || 0;
    const ready = state.readyCount || 0;
    btnNext.textContent = `Nächsten Sektor starten (${ready}/${crew} bereit)`;
    readyInfo.style.display = "";
    readyInfo.textContent = `${ready} von ${crew} Crewmitglied${crew === 1 ? "" : "ern"} bereit.`;
  } else {
    btnNext.textContent = "Nächsten Sektor starten";
    readyInfo.style.display = "none";
  }
}

function renderStations(stations) {
  const root = el("stations");
  root.innerHTML = "";
  for (const s of stations) {
    const color = statusColor[s.status] || "var(--text-muted)";
    const shape = statusShape[s.status] || "";
    const stability = Math.round((s.stability || 0) * 100);
    const op = s.operator ? `Operator: <b>${s.operator}</b>` : `<span class="empty">frei</span>`;
    const names = s.supporterNames && s.supporterNames.length ? s.supporterNames.join(", ") : "";
    const sup = names ? ` · Co-Pilot${s.supporterNames.length > 1 ? "en" : ""}: ${names}` : "";
    const div = document.createElement("div");
    div.className = "station";
    div.innerHTML =
      `<div class="row"><span class="name">${s.name}</span>` +
      `<span class="status" style="color:${color}">${shape} ${s.status}</span></div>` +
      `<div class="who">${op}${sup}</div>` +
      `<div class="stability"><div style="width:${stability}%; background:${color}"></div></div>`;
    root.appendChild(div);
  }
}

function renderCrew(roster) {
  el("crew-count").textContent = roster.length;
  const root = el("crew");
  if (!roster.length) {
    root.innerHTML = `<span class="empty">Noch niemand beigetreten …</span>`;
    return;
  }
  root.innerHTML = "";
  for (const p of roster) {
    const chip = document.createElement("span");
    chip.className = `crew-chip ${p.role === "supporter" ? "supporter" : ""}`;
    const rolle = p.role === "supporter" ? "Co-Pilot" : "Operator";
    const readyMark = p.ready ? " ✓" : "";
    chip.innerHTML = `${p.label}${readyMark} <small>· ${rolle}${p.stationName ? " " + p.stationName : ""}</small>`;
    root.appendChild(chip);
  }
}

el("btn-start").addEventListener("click", () => net.send(C2S.START_GAME));
el("btn-next-sector").addEventListener("click", () => net.send(C2S.NEXT_SECTOR));
el("btn-event").addEventListener("click", () => net.send(C2S.TRIGGER_EVENT, { kind: "asteroid" }));
el("btn-reset").addEventListener("click", () => net.send(C2S.RESET_GAME));
el("sel-difficulty").addEventListener("change", (e) => {
  net.send(C2S.SET_DIFFICULTY, { level: Number(e.target.value) });
});

// Debug-Bereich (nur sichtbar mit DAEDALUS_DEBUG): simulierte Spieler steuern.
el("btn-bots-spawn").addEventListener("click", () => {
  const count = Math.min(20, Math.max(1, Number(el("bot-count").value) || 1));
  net.send(C2S.DEBUG_BOTS, { action: "spawn", count });
});
el("btn-bots-clear").addEventListener("click", () => net.send(C2S.DEBUG_BOTS, { action: "clear" }));
