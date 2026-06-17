// Controller: Station waehlen, Mini-Spiel laden, Eingaben senden.
import { connect } from "/net.js";
import { C2S, S2C } from "/shared/protocol.js";
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

function updateHull(state) {
  if (!state.shared) return;
  let bar = document.getElementById("hull");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "hull";
    bar.className = "hull";
    bar.innerHTML = `<span>Schiffshülle</span><div class="hull-bar"><div></div></div>`;
    document.body.appendChild(bar);
  }
  bar.querySelector(".hull-bar > div").style.width = `${state.shared.huelle}%`;
}
