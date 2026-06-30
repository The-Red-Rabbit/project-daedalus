// Controller: Beitritt, Rollenanzeige (Operator oder Co-Pilot) und das
// zugewiesene Mini-Spiel. Vor dem Start wartet die Station in der Lobby, nach
// Sieg/Niederlage zeigt sie das Ergebnis. Der Server verteilt die Rollen,
// startet das Spiel auf Befehl der Lehrkraft und rotiert die Rollen je Sektor.
import { connect } from "/net.js";
import { C2S, S2C, STATUS, PHASES } from "/shared/protocol.js";
import { registry } from "/minigames/registry.js";
import { mulberry32 } from "/shared/rng.js";
import { createAudio } from "/audio.js";

const app = document.getElementById("app");
const audio = createAudio();

let current = null;       // Handle des laufenden Mini-Spiels
let joinedLabel = null;   // gesetzt nach dem ersten Beitritt (fuer Wiederverbinden)
let joined = false;       // hat diese Person bereits beigetreten
let role = null;          // "operator" | "supporter"
let stationName = "";
let gamePhase = null;     // letzte bekannte Phase aus STATE
let pendingTask = null;   // letzte zugewiesene Aufgabe (wird beim Start gemountet)
let screen = "join";      // "join" | "waiting" | "interstitial" | "howto" | "game" | "end"
let endPhase = null;      // welche Endphase zuletzt gezeigt wurde
let lastState = null;     // letzter STATE (fuer Live-Updates der Koop-Station)
let needHowto = false;    // vor dem Mounten erst die Kurzanleitung zeigen (Erststart + nach jeder Rotation)
let interstitialTimer = null; // Sektorwechsel-Zwischenbild: danach geht es zur Anleitung
let interSector = 0, interSectorCount = 0, interStationKnown = false; // Daten des Zwischenbilds
const INTERSTITIAL_MS = 4200; // lang genug zum Lesen; die Schonzeit nach dem Wechsel deckt es
let stationId = null;     // gesetzt mit der Zuweisung (fuer Sonderfunktions-Label)
let currentMode = "energy"; // Modus der aktuellen Loesung: "energy" (Weg A) | "function" (Weg B)

// Sonderfunktionsnamen je Station (Menue B), aus GAME_DESIGN.md Abschnitt 7.
const STATION_SPECIAL = {
  bordcomputer: "Schadenskontrolle",
  sensorik:     "Asteroiden filtern",
  navigation:   "Kurskorrektur",
  reaktor:      "Energieschub",
};

// Debug-Teststand (/dev): per Query-Parameter direkt auf eine Station setzen,
// ohne Lobby und Rotation. Greift nur, wenn der Server mit DAEDALUS_DEBUG laeuft
// (sonst ignoriert er die debugSeat-Nachricht). Beispiel: ?station=reaktor&level=2
const devParams = new URLSearchParams(location.search);
const devSeat = devParams.get("station")
  ? { station: devParams.get("station"), level: Number(devParams.get("level")) || 1, label: "Dev" }
  : null;

const net = connect({
  open: () => {
    setDisconnected(false);
    // Teststand: direkt auf die gewaehlte Station setzen (auch nach Reconnect).
    if (devSeat) return net.send(C2S.DEBUG_SEAT, devSeat);
    // Nach einem Reconnect automatisch mit demselben Namen wieder beitreten.
    if (joinedLabel !== null) net.send(C2S.JOIN, { role: "controller", label: joinedLabel });
  },
  close: () => setDisconnected(true),
  message: (msg) => {
    if (msg.type === S2C.ASSIGNMENT) applyAssignment(msg);
    if (msg.type === S2C.TASK_ASSIGNED) applyTask(msg);
    if (msg.type === S2C.RESULT) handleResult(msg);
    if (msg.type === S2C.STATE) updateState(msg);
    // Sektorwechsel: erst ein Zwischenbild (Sektor erreicht, neue Station), dann
    // die Anleitung, dann das Spiel. Der Start braucht kein Zwischenbild – dort
    // fuehrt die Phase direkt zur Anleitungskarte.
    if (msg.type === S2C.EVENT && msg.kind === "rotate") showInterstitial(msg.sector, msg.sectorCount);
    // Hilfe-Button: Hinweis empfangen (dieser Spieler wurde als Helfer ausgewaehlt)
    if (msg.type === S2C.HELP_HINT) showHelpHint(msg.hint, msg.requesterLabel);
    // Hilfe gesendet / abgelehnt: kurzes Feedback an den Anfrager
    if (msg.type === S2C.EVENT && msg.kind === "helpSent") showToast(`Hilfe auf dem Weg zu ${msg.helperLabel}.`);
    if (msg.type === S2C.EVENT && msg.kind === "helpDenied" && msg.reason !== "cooldown") showToast("Hilfe gerade nicht möglich.");
    if (msg.type === S2C.EVENT && msg.kind === "voteResult") {
      showToast(msg.result === "yes" ? "Joker eingesetzt – +25 Hülle" : "Joker abgelehnt.", 4000);
    }
  },
});

// Erst der Beitritt mit Namen, dann steuert die Phase den Bildschirm.
// Im Teststand entfaellt der Namens-Beitritt: open() setzt direkt, der Rest
// laeuft ueber assignment/task/state wie im echten Spiel.
if (devSeat) startDevSeat();
else showJoin();

// Kurze Einblendung fuer Feedback-Meldungen (wiederverwendet das vorhandene .toast-CSS).
function showToast(msg, durationMs = 2800) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), durationMs);
}

// Warteschlange fuer eingehende Hilferufe: kommen mehrere gleichzeitig an (grosse
// Crew, gleicher Helfer zufaellig mehrfach gewaehlt), werden sie nacheinander
// angezeigt statt sich gegenseitig zu ueberschreiben.
const helpQueue = [];

function showHelpHint(hint, requesterLabel) {
  helpQueue.push({ hint, requesterLabel });
  if (helpQueue.length === 1) renderNextHelpHint();
}

function renderNextHelpHint() {
  const { hint, requesterLabel } = helpQueue[0];
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const remaining = helpQueue.length - 1;

  let overlay = document.getElementById("help-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "help-overlay";
    overlay.className = "help-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML =
    `<div class="help-box">` +
    `<div class="help-kicker">Hilferuf${remaining > 0 ? ` · noch ${remaining} weitere` : ""}</div>` +
    `<div class="help-for">von ${esc(requesterLabel)}</div>` +
    `<div class="help-cta">Ruf das deinem Crewmitglied zu:</div>` +
    `<div class="help-hint-text">${esc(hint)}</div>` +
    `<button class="help-dismiss">${remaining > 0 ? "Verstanden · nächster" : "Verstanden"}</button>` +
    `</div>`;
  overlay.hidden = false;
  overlay.querySelector(".help-dismiss").addEventListener("click", () => {
    audio.play("ui.confirm");
    helpQueue.shift();
    if (helpQueue.length > 0) {
      renderNextHelpHint();
    } else {
      overlay.hidden = true;
    }
  });
  audio.play("ui.toggle");
}

// Aktualisiert alle Hilfe-Buttons im DOM: Text und Zustand je nach Cooldown.
function refreshHelpButton() {
  const cooldown = lastState && lastState.helpCooldown != null ? lastState.helpCooldown : 0;
  for (const btn of document.querySelectorAll(".btn-help")) {
    btn.disabled = cooldown > 0;
    btn.textContent = cooldown > 0 ? `Hilfe rufen (${cooldown} s)` : "Hilfe rufen";
  }
}

// Hilfeanfrage abschicken.
function sendHelpRequest() {
  audio.play("ui.toggle");
  net.send(C2S.HELP_REQUEST, {});
  // Sofort lokal sperren; der Server bestaetigt per State-Update
  for (const btn of document.querySelectorAll(".btn-help")) btn.disabled = true;
}

// In-Game Hilfe-Leiste ueber dem HUD: persistent, wird nur ein/ausgeblendet.
function showHelpBar() {
  let bar = document.getElementById("help-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "help-bar";
    bar.className = "help-bar";
    bar.innerHTML = `<button class="btn-help">Hilfe rufen</button>`;
    document.body.appendChild(bar);
    bar.querySelector(".btn-help").addEventListener("click", sendHelpRequest);
  }
  bar.hidden = false;
  document.body.classList.add("has-help-bar");
  refreshHelpButton();
}

function hideHelpBar() {
  const bar = document.getElementById("help-bar");
  if (bar) bar.hidden = true;
  document.body.classList.remove("has-help-bar");
}

function clear() {
  if (current && current.unmount) current.unmount();
  current = null;
  clearTimeout(interstitialTimer);
  hideHelpBar();
  app.innerHTML = "";
}

// --- Beitritt -------------------------------------------------------------

function showJoin() {
  clear();
  screen = "join";
  setTopbar(false);
  const wrap = document.createElement("div");
  wrap.className = "screen lobby";
  wrap.innerHTML =
    `<h1 class="title">Daedalus</h1>` +
    `<p class="muted">Tritt der Crew bei. Der Leitstand weist dir eine Station zu und startet den Einsatz.</p>` +
    `<input id="lobby-name" class="lobby-name" placeholder="Dein Name" maxlength="24" autocomplete="off">` +
    `<button id="lobby-join" class="bc-confirm">Beitreten</button>`;
  app.appendChild(wrap);
  const input = wrap.querySelector("#lobby-name");
  const btn = wrap.querySelector("#lobby-join");
  const go = async () => {
    const label = input.value.trim() || "Crew";
    joinedLabel = label;
    joined = true;
    screen = "joining";
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

// Teststand: ohne Namens-Eingabe sofort als beigetreten gelten. Das Setzen selbst
// uebernimmt der open-Handler (debugSeat); danach mounten assignment, task und
// state das Mini-Spiel wie im echten Spiel. Ton entsperrt sich beim ersten Tippen.
function startDevSeat() {
  joined = true;
  joinedLabel = devSeat.label;
  screen = "joining";
  app.innerHTML = `<div class="screen"><p class="muted">Teststand wird gesetzt …</p></div>`;
}

function applyAssignment(msg) {
  role = msg.role;
  stationId = msg.stationId || null;
  stationName = msg.stationName || "";
  setTopbar(true);
  // Jede (Neu-)Zuweisung ist ein frisches Hinsetzen: vor dem Mounten erst die
  // Kurzanleitung zeigen (Erststart und nach jeder Rotation). Der Teststand
  // ueberspringt sie, damit das Mini-Spiel sofort kommt.
  if (!devSeat) needHowto = true;
  // Im Wartezustand die Rollenanzeige aktualisieren; im Zwischenbild die neue
  // Station nachtragen. Die Stations-UI baut sich erst nach „Los" auf.
  if (screen === "waiting") showWaiting();
  else if (screen === "interstitial") {
    interStationKnown = true;
    renderInterstitial();
  }
}

function applyTask(msg) {
  pendingTask = msg;
  // Nach korrekter Loesung (TASK_ASSIGNED kommt nur dann) zum Menue, damit der
  // Spieler den Weg fuer die naechste Loesung waehlt. Teststand: direkt mounten.
  if (gamePhase === PHASES.RUNNING && screen === "game") {
    if (devSeat) mountGame();
    else showMenu();
  }
}

// --- Phasensteuerung ------------------------------------------------------

function updateState(state) {
  gamePhase = state.phase;
  lastState = state;
  updateHud(state);
  updateVoteOverlay(state);
  // Beitragszaehler und Weg-C-Schaltflaeche im Menue live aktualisieren.
  const contribEl = document.getElementById("menu-contrib");
  if (contribEl && state.contributions != null) contribEl.textContent = `✦ ${state.contributions}`;
  refreshVoteButton(document.getElementById("menu-btn-c"));
  // Hilfe-Button in Menue und Spiel live auf Cooldown pruefen.
  refreshHelpButton();
  // Live-Werte (z. B. Match der Koop-Station) an das laufende Mini-Spiel reichen.
  if (screen === "game" && current && current.onState) current.onState(state);
  if (!joined) return;
  if (gamePhase === PHASES.WON || gamePhase === PHASES.LOST) {
    if (screen !== "end" || endPhase !== gamePhase) showEnd(gamePhase);
    return;
  }
  if (gamePhase === PHASES.RUNNING) {
    // Sektorgrenze: Fortschritt 100 → Bereit-Bildschirm anzeigen.
    if (state.shared && state.shared.fortschritt >= 100) {
      if (screen !== "boundary") showBoundary();
      return;
    }
    // Menue, Zwischenbild, Anleitung und Sektorgrenze steuern sich selbst; nicht stoeren.
    if (screen === "menu" || screen === "interstitial" || screen === "howto" || screen === "boundary") return;
    if (screen !== "game") enterStation();
    return;
  }
  // Lobby
  if (screen !== "waiting") showWaiting();
}

// Liefert den Zustand von Weg C (Joker): ob er aktiv ist und warum nicht.
function voteButtonState() {
  const charges = lastState?.shared?.jokerCharges ?? 3;
  const hasInitiated = !!(lastState?.hasInitiatedVote);
  const voteActive = !!(lastState?.vote);
  const canStart = charges > 0 && !hasInitiated && !voteActive;
  let label = canStart
    ? `Abstimmung starten · ${charges} ◈`
    : `Abstimmung starten`;
  let reason = "";
  if (!canStart) {
    reason = hasInitiated ? "bereits genutzt" : charges <= 0 ? "keine Ladungen mehr" : "läuft bereits";
  }
  return { canStart, label, reason };
}

// Aktualisiert Schaltflaechenzustand von Weg C im Menue (wird per updateState live gehalten).
function refreshVoteButton(btn) {
  if (!btn) return;
  const { canStart, label, reason } = voteButtonState();
  btn.disabled = !canStart;
  const txt = btn.querySelector(".menu-text");
  if (!txt) return;
  txt.textContent = reason ? `${label} (${reason})` : label;
}

// Abstimmungs-Overlay: wird ueber dem aktuellen Bildschirm eingeblendet, wenn
// eine Joker-Abstimmung laeuft. Verschwindet automatisch, wenn der Vote endet.
function updateVoteOverlay(state) {
  const vote = state.vote;
  let overlay = document.getElementById("vote-overlay");
  if (!vote) {
    if (overlay) overlay.hidden = true;
    return;
  }
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "vote-overlay";
    overlay.className = "vote-overlay";
    overlay.innerHTML =
      `<div class="vote-box">` +
      `<div class="vote-kicker">Abstimmung läuft</div>` +
      `<div class="vote-initiator" id="vote-initiator"></div>` +
      `<div class="vote-timer" id="vote-timer">10</div>` +
      `<div class="vote-tally" id="vote-tally"></div>` +
      `<div class="vote-actions" id="vote-actions">` +
      `<button class="vote-yes" id="vote-yes">✓ Ja</button>` +
      `<button class="vote-no" id="vote-no">✗ Nein</button>` +
      `</div>` +
      `<div class="vote-cast-msg" id="vote-cast-msg" hidden>Stimme abgegeben ✓</div>` +
      `</div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#vote-yes").addEventListener("click", () => {
      audio.play("ui.confirm");
      net.send(C2S.VOTE_CAST, { choice: "yes" });
    });
    overlay.querySelector("#vote-no").addEventListener("click", () => {
      audio.play("ui.toggle");
      net.send(C2S.VOTE_CAST, { choice: "no" });
    });
  }
  overlay.hidden = false;
  document.getElementById("vote-initiator").textContent = `von ${vote.initiatorLabel || "…"}`;
  document.getElementById("vote-timer").textContent = String(vote.timeLeft ?? 10);
  document.getElementById("vote-tally").textContent = `${vote.castCount} von ${vote.total} abgestimmt`;
  const hasCast = !!vote.hasCast;
  document.getElementById("vote-actions").hidden = hasCast;
  document.getElementById("vote-cast-msg").hidden = !hasCast;
}

// Stationsmenue (A/B/C): erscheint nach der Anleitung und nach jeder geloesten Aufgabe.
function showMenu() {
  if (!pendingTask) { showWaiting(); return; }
  clear();
  screen = "menu";
  setTopbar(true);
  const special = STATION_SPECIAL[stationId] || "Sonderfunktion";
  const contrib = lastState && lastState.contributions != null ? lastState.contributions : 0;
  const { canStart, label, reason } = voteButtonState();
  const cText = reason ? `${label} (${reason})` : label;
  const wrap = document.createElement("div");
  wrap.className = "screen menu";
  wrap.innerHTML =
    `<div class="menu-header">` +
    `<span class="menu-station">${stationName || "Station"}</span>` +
    `<span class="menu-contrib" id="menu-contrib">✦ ${contrib}</span>` +
    `</div>` +
    `<div class="menu-label">Wähle deinen Weg</div>` +
    `<div class="menu-choices">` +
    `<button class="menu-btn menu-a" id="menu-btn-a">` +
    `<span class="menu-key">A</span>` +
    `<span class="menu-text">Für Energie lösen</span>` +
    `</button>` +
    `<button class="menu-btn menu-b" id="menu-btn-b">` +
    `<span class="menu-key">B</span>` +
    `<span class="menu-text">Für ${special} lösen</span>` +
    `</button>` +
    `<button class="menu-btn menu-c" id="menu-btn-c"${canStart ? "" : " disabled"}>` +
    `<span class="menu-key">C</span>` +
    `<span class="menu-text">${cText}</span>` +
    `</button>` +
    `</div>`;
  app.appendChild(wrap);
  wrap.querySelector("#menu-btn-a").addEventListener("click", () => {
    audio.play("ui.toggle");
    currentMode = "energy";
    mountGame();
  });
  wrap.querySelector("#menu-btn-b").addEventListener("click", () => {
    audio.play("ui.toggle");
    currentMode = "function";
    mountGame();
  });
  wrap.querySelector("#menu-btn-c").addEventListener("click", () => {
    audio.play("ui.confirm");
    net.send(C2S.VOTE_START, {});
  });
}

// Sektorgrenze: Fortschritt hat 100 % erreicht. Spieler meldet sich bereit;
// die Lehrkraft startet am Leitstand den naechsten Sektor.
function showBoundary() {
  clear();
  screen = "boundary";
  setTopbar(true);
  const wrap = document.createElement("div");
  wrap.className = "screen boundary";
  wrap.innerHTML =
    `<div class="boundary-kicker">Sektor abgeschlossen</div>` +
    `<div class="boundary-progress">100 %</div>` +
    `<p class="muted">Der nächste Sektor wird von der Lehrkraft freigegeben. Melde dich bereit.</p>` +
    `<button class="bc-confirm" id="btn-ready">Bereit</button>` +
    `<div class="boundary-wait" id="boundary-wait" hidden>` +
    `<div class="wait-dots"><span></span><span></span><span></span></div>` +
    `<p class="muted">Bereit gemeldet · warte auf Lehrkraft …</p>` +
    `</div>`;
  app.appendChild(wrap);
  wrap.querySelector("#btn-ready").addEventListener("click", () => {
    audio.play("ui.confirm");
    net.send(C2S.READY, {});
    wrap.querySelector("#btn-ready").disabled = true;
    wrap.querySelector("#boundary-wait").hidden = false;
  });
}

// Beim Betreten einer Station: Teststand direkt mounten; sonst erst Anleitung, dann Menue.
function enterStation() {
  if (!pendingTask) { showWaiting(); return; }
  if (devSeat) { mountGame(); return; }
  if (needHowto) { showHowto(); return; }
  showMenu();
}

function showWaiting() {
  clear();
  screen = "waiting";
  setTopbar(true);
  const rolle = role === "supporter" ? "Co-Pilot" : "Operator";
  const line = stationName
    ? `Du bist <b>${rolle}</b> der Station <b>${stationName}</b>.`
    : `Der Leitstand weist dir gleich eine Station zu.`;
  const wrap = document.createElement("div");
  wrap.className = "screen waiting";
  wrap.innerHTML =
    `<h1 class="title">Bereit</h1>` +
    `<p class="role-line">${line}</p>` +
    // Kurze Einsatzbesprechung beim ersten Beitritt: worum es geht und dass die
    // Crew die Stationen gemeinsam stabil haelt.
    `<div class="mission">` +
    `<div class="mission-head">Mission</div>` +
    `<p>Die Daedalus fliegt durch ein Asteroidenfeld. Jede Person hält an ihrer Station ein kleines System stabil, nur gemeinsam kommt das Schiff voran. Fällt eine Station zu lange aus, leidet die Hülle.</p>` +
    `</div>` +
    `<p class="muted">Warte auf den Start durch die Lehrkraft …</p>` +
    `<div class="wait-dots"><span></span><span></span><span></span></div>`;
  app.appendChild(wrap);
}

function mountGame() {
  if (!pendingTask) {
    if (screen !== "waiting") showWaiting();
    return;
  }
  clear();
  screen = "game";
  setTopbar(true);
  const mod = registry[pendingTask.minigame];
  if (!mod) {
    app.innerHTML = `<p class="muted">Unbekanntes Mini-Spiel: ${pendingTask.minigame}</p>`;
    return;
  }
  const rng = mulberry32(pendingTask.seed);
  const task = mod.generate(pendingTask.level, rng);
  const root = document.createElement("div");
  root.className = "screen";
  app.appendChild(root);
  const ctx = {
    audio,
    station: stationName,
    role,
    // Loesung abschicken: Modus (Weg A oder B) wird mitgesendet.
    submit: (input) => net.send(C2S.SOLVE_ATTEMPT, { input, mode: currentMode }),
    // Optionales Signal fuer Mini-Spiele, die bei einem Fehlversuch sofort enden
    // (kein Retry auf der gleichen Aufgabe). Leitet nach kurzer Lesepause ins Menue.
    lost: () => setTimeout(() => { if (screen === "game") showMenu(); }, 1800),
  };
  current = mod.mount(root, task, ctx) || null;
  if (current && current.onState && lastState) current.onState(lastState);
  showHelpBar();
}

// --- Sektorwechsel-Zwischenbild und Kurzanleitung -------------------------

// Zeigt nach einem Sektorwechsel ein paar Sekunden ein Zwischenbild (Sektor
// erreicht, neue Station), bevor es zur Anleitung und ins Spiel geht. Die neue
// Station traegt das anschliessende assignment nach (renderInterstitial).
function showInterstitial(sector, sectorCount) {
  clear();
  screen = "interstitial";
  setTopbar(true);
  interSector = sector || 0;
  interSectorCount = sectorCount || 0;
  interStationKnown = false;
  audio.play("progress.tick");
  renderInterstitial();
  interstitialTimer = setTimeout(() => {
    if (screen === "interstitial") enterStation();
  }, INTERSTITIAL_MS);
}

function renderInterstitial() {
  if (screen !== "interstitial") return;
  const rolle = role === "supporter" ? "Co-Pilot" : "Operator";
  const sectorLine = interSectorCount ? `Sektor ${interSector} / ${interSectorCount}` : `Sektor ${interSector}`;
  const stationLine =
    interStationKnown && stationName
      ? `Neue Station: <b>${stationName}</b> als <b>${rolle}</b>`
      : `Neue Station wird zugewiesen …`;
  app.innerHTML =
    `<div class="screen interstitial">` +
    `<div class="inter-kicker">Sektor erreicht</div>` +
    `<div class="inter-sector">${sectorLine}</div>` +
    `<div class="inter-rotate">Rollenwechsel</div>` +
    `<div class="inter-station">${stationLine}</div>` +
    `<div class="wait-dots"><span></span><span></span><span></span></div>` +
    `</div>`;
}

// Kurzanleitung vor dem Spielen: Station, Ziel und ein kleines Beispiel, dann
// „Los". Erscheint beim ersten Mal und nach jeder Rotation (nicht nach dem Loesen).
function showHowto() {
  if (!pendingTask) {
    showWaiting();
    return;
  }
  clear();
  screen = "howto";
  setTopbar(true);
  const mod = registry[pendingTask.minigame];
  const howto = (mod && mod.howto) || null;
  const rolle = role === "supporter" ? "Co-Pilot" : "Operator";
  const goal = howto ? howto.goal : "Bediene die Station und halte sie stabil.";
  const example = howto && howto.example ? `<div class="howto-example">${howto.example}</div>` : "";
  const name = stationName || (mod ? mod.station : "Station");
  const wrap = document.createElement("div");
  wrap.className = "screen howto";
  wrap.innerHTML =
    `<div class="howto-kicker">${rolle} · Station</div>` +
    `<h1 class="title howto-name">${name}</h1>` +
    `<div class="howto-card"><div class="howto-goal">${goal}</div>${example}</div>` +
    `<button class="bc-confirm howto-go">Los</button>`;
  app.appendChild(wrap);
  wrap.querySelector(".howto-go").addEventListener("click", () => {
    audio.play("ui.toggle");
    needHowto = false;
    showMenu();
  });
}

function showEnd(phase) {
  clear();
  screen = "end";
  endPhase = phase;
  setTopbar(true);
  const won = phase === PHASES.WON;
  const wrap = document.createElement("div");
  wrap.className = `screen end ${won ? "won" : "lost"}`;
  wrap.innerHTML =
    `<div class="end-title">${won ? "Sieg" : "Niederlage"}</div>` +
    `<p class="muted">${won ? "Die Daedalus hat das Asteroidenfeld durchquert." : "Die Hülle ist zusammengebrochen."}</p>` +
    `<p class="muted">Schaut auf die Brücke – dort seht ihr die Bestenliste.</p>` +
    `<p class="muted small">Die Lehrkraft startet am Leitstand einen neuen Anlauf.</p>`;
  app.appendChild(wrap);
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

  // Stationszeile nur im laufenden Spiel zeigen (in der Lobby noch nicht aktiv).
  const row = document.getElementById("hud-station-row");
  if (state.status && state.phase === PHASES.RUNNING) {
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
