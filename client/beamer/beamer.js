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

const VOICE_CUES = ["voice.welcome", "voice.hull_low", "voice.hull_crit", "voice.external_damage"];

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
        audio.playVoice("voice.welcome");
      }
      banner(`Start · Sektor ${msg.sector}`);
    }
    if (msg.type === S2C.EVENT && msg.kind === "asteroid") {
      if (audioOn) {
        audio.play("alarm.asteroid");
        audio.play("impact.hull");
        audio.playVoice("voice.external_damage");
      }
      renderer.shake();
    }
    if (msg.type === S2C.EVENT && msg.kind === "rotate") {
      if (audioOn) audio.play("progress.tick");
      showSectorInterstitial(msg.sector, msg.sectorCount);
    }
  },
});

// Sektorwechsel-Zwischenbild: ein paar Sekunden gross einblenden, lang genug zum
// Lesen. Die Schonzeit nach dem Wechsel deckt diese Pause ab.
let interTimer = null;
function showSectorInterstitial(sector, sectorCount) {
  const box = el("sector-interstitial");
  el("si-sector").textContent = sectorCount ? `Sektor ${sector} / ${sectorCount}` : `Sektor ${sector}`;
  box.hidden = false;
  clearTimeout(interTimer);
  interTimer = setTimeout(() => {
    box.hidden = true;
  }, 4200);
}

let bannerTimer = null;
function banner(text) {
  const b = el("banner");
  b.textContent = text;
  b.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove("show"), 3000);
}

// Zeitstempel deterministisch als "DD.MM.YYYY, HH:MM" formatieren (keine Locale).
function formatTs(isoString) {
  const d = new Date(isoString);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  renderScore(state);
  renderJoker(state);
  renderVotePanel(state);
  renderHighscores(state);
  // Schonzeit-Hinweis: ruhiger Anflug, in dem nichts verfaellt.
  const graceHint = el("grace-hint");
  if (state.phase === PHASES.RUNNING && state.grace > 0) {
    graceHint.textContent = `▷ Anflug · noch ${state.grace} s zum Stabilisieren`;
    graceHint.hidden = false;
  } else {
    graceHint.hidden = true;
  }
  renderer.setState(state);
  // Huellenuebergaenge erkennen und Sprachansage ausloesen (nur waehrend des Spiels).
  if (audioOn && state.phase === PHASES.RUNNING) {
    const hull = state.shared.huelle;
    if (prevHull !== null) {
      if (prevHull >= 10 && hull < 10) {
        audio.playVoice("voice.hull_crit");
      } else if (prevHull >= 50 && hull < 50) {
        audio.playVoice("voice.hull_low");
      }
    }
    prevHull = hull;
  } else {
    prevHull = null;
  }
  // Fortschritts-Meilensteine (50 % und 95 %), einmal pro Schwelle pro Sektor.
  if (state.phase === PHASES.RUNNING) {
    if (state.sector !== prevSector) {
      firedMilestones.clear();
      prevSector = state.sector;
    }
    if (audioOn) {
      const p = state.shared.fortschritt;
      if (p >= 50 && !firedMilestones.has(50)) { firedMilestones.add(50); audio.play("progress.half"); }
      if (p >= 95 && !firedMilestones.has(95)) { firedMilestones.add(95); audio.play("progress.near"); }
    }
  } else {
    prevSector = null;
    firedMilestones.clear();
  }
  // Alarmbett bei kritischer Huelle (nur im laufenden Spiel und wenn Ton frei).
  if (audioOn) audio.setAlarm(state.phase === PHASES.RUNNING && state.shared.huelle <= 30);
}

// Live-Punktanzeige: gross und zentriert, nur im laufenden Einsatz.
function renderScore(state) {
  const panel = el("score-panel");
  if (state.phase !== PHASES.RUNNING) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  el("score-value").textContent = String(state.shared.score ?? 0);
}

// Highscore-Tabelle: nach Sieg oder Niederlage als Abschlussbild auf der Bruecke.
function renderHighscores(state) {
  if (state.phase !== PHASES.WON && state.phase !== PHASES.LOST) return;
  const card = el("hs-card");
  const won = state.phase === PHASES.WON;
  card.classList.toggle("lost", !won);
  el("hs-phase").textContent = won ? "Sieg" : "Niederlage";
  el("hs-sub").textContent = won
    ? `Ergebnis dieser Runde: ${state.shared.score ?? 0} Punkte`
    : `Ergebnis dieser Runde: ${state.shared.score ?? 0} Punkte · Die Hülle ist zusammengebrochen.`;

  // Niederlage: Beitragsschnappschuss gross anzeigen – aus dem Klassenraum lesbar.
  const lossPanel = el("loss-panel");
  if (!won && state.endContributions && state.endContributions.length) {
    lossPanel.hidden = false;
    const sorted = [...state.endContributions].sort((a, b) => b.contributions - a.contributions);
    const maxContrib = sorted[0].contributions || 1;
    lossPanel.innerHTML =
      `<div class="loss-reason">■ Hülle 0% – die Daedalus ist verloren</div>` +
      `<div class="loss-crew">` +
      sorted.map((p, i) => {
        const isTop = i === 0 && p.contributions > 0;
        return `<div class="loss-entry${isTop ? " top" : ""}">` +
          `<span class="loss-name">${p.label}</span>` +
          `<span class="loss-contrib">${p.contributions}<span class="loss-contrib-label">Beiträge</span></span>` +
          `</div>`;
      }).join("") +
      `</div>`;
  } else {
    lossPanel.hidden = true;
  }

  const list = state.highscores || [];
  const winTs = state.currentWinTs || null;
  const tbody = el("hs-tbody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="hs-empty">Noch keine Einträge vorhanden.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  list.forEach((entry, i) => {
    const tr = document.createElement("tr");
    const isCurrent = winTs && entry.ts === winTs;
    if (isCurrent) tr.className = "hs-current";
    const crewText = (entry.crew || []).join(", ") || "–";
    const dateText = entry.ts ? formatTs(entry.ts) : "–";
    tr.innerHTML =
      `<td>${i + 1}.</td>` +
      `<td>${entry.score ?? 0}</td>` +
      `<td>${crewText}</td>` +
      `<td>${dateText}</td>`;
    tbody.appendChild(tr);
  });
}

function applyPhase(state) {
  const phase = state.phase;
  el("lobby").hidden = phase !== PHASES.LOBBY;
  el("overlay").hidden = phase === PHASES.LOBBY;
  el("result").hidden = phase !== PHASES.WON && phase !== PHASES.LOST;
  // Das Zwischenbild gehoert nur ins laufende Spiel; sonst sofort ausblenden.
  if (phase !== PHASES.RUNNING) {
    el("sector-interstitial").hidden = true;
    clearTimeout(interTimer);
  }

  if (phase === PHASES.LOBBY) renderLobbyCrew(state.roster || []);
  // Highscore-Inhalt wird separat in renderHighscores() befuellt.

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
let prevVoteActive = false;
let prevJokerCharges = null;
let prevHull = null; // fuer Huellenuebergangs-Erkennung
let prevSector = null; // fuer Fortschritts-Meilensteine
const firedMilestones = new Set(); // welche Prozentschwellen im laufenden Sektor gespielt wurden

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

// Joker-Ladungen als Pip-Reihe und Zaehler im HUD anzeigen.
function renderJoker(state) {
  const charges = state.shared?.jokerCharges ?? 3;
  // Maximale Ladungen aus der Anfangsanzahl ableiten: so viele Pips zeigen wie zu Beginn.
  const maxCharges = Math.max(charges, prevJokerCharges ?? charges, 3);
  el("n-joker").textContent = `◈ ${charges}`;
  const pips = el("joker-pips");
  pips.innerHTML = "";
  for (let i = 0; i < maxCharges; i++) {
    const pip = document.createElement("span");
    pip.className = `joker-pip${i < charges ? "" : " used"}`;
    pips.appendChild(pip);
  }
  // Ergebnis-Banner, wenn eine Abstimmung gerade aufgeloest wurde.
  const voteIsActive = !!(state.vote);
  if (prevVoteActive && !voteIsActive) {
    const chargesNow = charges;
    const chargesWere = prevJokerCharges;
    if (chargesWere !== null && chargesNow < chargesWere) {
      banner("◈ Joker eingesetzt! Hülle +25");
    } else {
      banner("Abstimmung abgelehnt – kein Joker");
    }
  }
  prevVoteActive = voteIsActive;
  prevJokerCharges = charges;
}

// Joker-Abstimmung: grosse, klassenraumlesbare Einblendung.
function renderVotePanel(state) {
  const panel = el("vote-panel");
  const vote = state.vote;
  if (!vote || state.phase !== PHASES.RUNNING) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  el("vp-initiator").textContent = `Gestartet von ${vote.initiatorLabel || "…"}`;
  el("vp-timer").textContent = String(vote.timeLeft ?? 10);
  el("vp-tally").textContent = `${vote.castCount} von ${vote.total} abgestimmt`;
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
  audio.preload(...VOICE_CUES); // alle Voice-Lines vorab laden
  if (prevPhase === PHASES.LOBBY) audio.playVoice("voice.welcome");
  audioOn = true;
  el("btn-audio").textContent = "♪ Ton an ✓";
});

renderer.start();
