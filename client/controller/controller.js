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
  },
});

// Erst der Beitritt mit Namen, dann steuert die Phase den Bildschirm.
// Im Teststand entfaellt der Namens-Beitritt: open() setzt direkt, der Rest
// laeuft ueber assignment/task/state wie im echten Spiel.
if (devSeat) startDevSeat();
else showJoin();

function clear() {
  if (current && current.unmount) current.unmount();
  current = null;
  clearTimeout(interstitialTimer);
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
  // Aufgaben-Refresh nach dem Loesen mountet sofort neu; waehrend Zwischenbild
  // oder Anleitung wartet die Aufgabe auf „Los".
  if (gamePhase === PHASES.RUNNING && screen === "game") mountGame();
}

// --- Phasensteuerung ------------------------------------------------------

function updateState(state) {
  gamePhase = state.phase;
  lastState = state;
  updateHud(state);
  // Live-Werte (z. B. Match der Koop-Station) an das laufende Mini-Spiel reichen.
  if (screen === "game" && current && current.onState) current.onState(state);
  if (!joined) return;
  if (gamePhase === PHASES.WON || gamePhase === PHASES.LOST) {
    if (screen !== "end" || endPhase !== gamePhase) showEnd(gamePhase);
    return;
  }
  if (gamePhase === PHASES.RUNNING) {
    // Zwischenbild und Anleitung steuern sich selbst (Timer bzw. „Los"); nicht stoeren.
    if (screen === "interstitial" || screen === "howto") return;
    if (screen !== "game") enterStation();
    return;
  }
  // Lobby
  if (screen !== "waiting") showWaiting();
}

// Beim Betreten einer Station: erst die Kurzanleitung, sonst direkt mounten.
function enterStation() {
  if (!pendingTask) {
    showWaiting();
    return;
  }
  if (needHowto && !devSeat) showHowto();
  else mountGame();
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
    submit: (input) => net.send(C2S.SOLVE_ATTEMPT, { input }),
    // Koop-Station (Reaktor): stufenlose Reglereingabe. Das Einrasten entscheidet
    // der Server ueber die Haltezeit (Hold-to-Lock), keine Bestaetigung noetig.
    coopInput: (param, value) => net.send(C2S.COOP_INPUT, { param, value }),
  };
  current = mod.mount(root, task, ctx) || null;
  // Direkt mit dem letzten bekannten Zustand versorgen (Koop: Ziel/Match/Solo).
  if (current && current.onState && lastState) current.onState(lastState);
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
    mountGame();
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
