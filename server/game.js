// Autoritativer Spielzustand: Stationen, geteilte Werte, Sektor-Schleife.
// Bewusst als nachvollziehbares Geruest gehalten. Stellen mit TODO sind
// fuer Claude Code zum Ausbauen vorgesehen.

import { mulberry32, makeSeed } from "../shared/rng.js";
import { STATUS } from "../shared/protocol.js";
import { registry } from "../client/minigames/registry.js";

// Abstimmwerte des Spielkerns an einem Ort.
const ASTEROID_DAMAGE = 22;        // Huellenschaden je Asteroidenwelle
const STABLE_DECAY_PER_SEC = 0.12; // stabil haelt rund 8 Sekunden ohne neue Loesung
const HULL_DRAIN_CRITICAL = 1.5;   // unbesetzte Station, Huelle pro Sekunde
const HULL_DRAIN_WARN = 0.6;       // besetzt, aber nicht stabil, Huelle pro Sekunde
const PROGRESS_PER_SEC = 8;        // Fortschritt pro Sekunde bei genug stabilen Stationen
const MAX_SECTORS = 3;             // nach dem letzten Sektor folgt der Sieg

function clampLevel(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(1, n));
}

export function createGame(config) {
  const stations = config.stations.map((s) => ({
    id: s.id,
    name: s.name,
    minigame: s.minigame,
    status: STATUS.CRITICAL, // unbesetzt zaehlt als kritisch
    owner: null, // { label }
    task: null, // { minigame, level, seed }
    stability: 0, // 1 direkt nach dem Loesen, faellt im Tick auf 0
  }));

  // Der Status ergibt sich aus Besetzung und Stabilitaet.
  function refreshStatus(s) {
    if (!s.owner) s.status = STATUS.CRITICAL;
    else if (s.stability > 0) s.status = STATUS.STABLE;
    else s.status = STATUS.WARN;
  }

  const shared = { huelle: 100, energie: 100, fortschritt: 0 };
  let sector = 1;
  let phase = "running"; // "running" | "won" | "lost"
  let baseLevel = clampLevel(config.baseLevel || 1);

  const station = (id) => stations.find((s) => s.id === id) || null;
  const freeStations = () => stations.filter((s) => !s.owner).map((s) => ({ id: s.id, name: s.name }));

  function claimStation(id, owner) {
    const s = station(id);
    if (!s || s.owner) return null;
    s.owner = owner;
    s.stability = 0;
    refreshStatus(s); // besetzt, aber noch nicht stabil -> achtung
    return s;
  }

  function releaseStation(id) {
    const s = station(id);
    if (!s) return;
    s.owner = null;
    s.task = null;
    s.stability = 0;
    refreshStatus(s);
  }

  // Erzeugt eine neue Zufallsaufgabe fuer die Station und merkt sich den Seed.
  function assignTask(s) {
    if (!s) return null;
    const seed = makeSeed();
    s.task = { minigame: s.minigame, level: baseLevel, seed };
    return s.task;
  }

  // Grundschwierigkeit (Leitstand). Neue Aufgaben entstehen aus dieser Stufe.
  function setBaseLevel(level) {
    baseLevel = clampLevel(level);
    return baseLevel;
  }

  // Ereignis vom Leitstand. Eine Asteroidenwelle senkt die Huelle.
  function triggerEvent(kind) {
    if (phase !== "running") return null;
    if (kind === "asteroid") {
      shared.huelle = Math.max(0, shared.huelle - ASTEROID_DAMAGE);
      if (shared.huelle <= 0) phase = "lost";
      return { kind: "asteroid", damage: ASTEROID_DAMAGE };
    }
    return null;
  }

  // Setzt das Spiel fuer einen neuen Anlauf zurueck. Besetzte Stationen behalten
  // ihre Crew, brauchen aber eine frische Aufgabe (vom Server neu vergeben).
  function reset() {
    shared.huelle = 100;
    shared.energie = 100;
    shared.fortschritt = 0;
    sector = 1;
    phase = "running";
    for (const s of stations) {
      s.stability = 0;
      s.task = null;
      refreshStatus(s);
    }
  }

  // Baut die Aufgabe aus dem Seed nach und prueft die Eingabe.
  function solve(id, input) {
    const s = station(id);
    if (!s || !s.task) return { geloest: false, teiltreffer: 0 };
    const mod = registry[s.task.minigame];
    if (!mod) return { geloest: false, teiltreffer: 0 };
    const rng = mulberry32(s.task.seed);
    const task = mod.generate(s.task.level, rng);
    const result = mod.validate(task, input);
    if (result.geloest) s.stability = 1; // frisch stabilisiert
    refreshStatus(s);
    return result;
  }

  function tick(dtSeconds) {
    if (phase !== "running") return; // nach Sieg oder Niederlage ruht die Simulation

    // Statusverfall: eine stabile Station faellt ohne neue Loesung auf "achtung".
    for (const s of stations) {
      if (s.owner && s.stability > 0) {
        s.stability = Math.max(0, s.stability - STABLE_DECAY_PER_SEC * dtSeconds);
      }
      refreshStatus(s);
    }

    // Leerlauf und Vernachlaessigung kosten Huelle: unbesetzt am staerksten,
    // besetzt aber nicht stabil weniger, stabil gar nicht.
    let drain = 0;
    for (const s of stations) {
      if (s.status === STATUS.CRITICAL) drain += HULL_DRAIN_CRITICAL;
      else if (s.status === STATUS.WARN) drain += HULL_DRAIN_WARN;
    }
    if (drain > 0) shared.huelle = Math.max(0, shared.huelle - drain * dtSeconds);

    // Niederlage: leere Huelle beendet den Durchlauf.
    if (shared.huelle <= 0) {
      shared.huelle = 0;
      phase = "lost";
      return;
    }

    // Kopplung: Fortschritt steigt nur, wenn die Mehrheit der Stationen stabil ist.
    const stabil = stations.filter((s) => s.status === STATUS.STABLE).length;
    const noetig = Math.floor(stations.length / 2) + 1;
    if (stabil >= noetig) {
      shared.fortschritt = Math.min(100, shared.fortschritt + PROGRESS_PER_SEC * dtSeconds);
    }

    // Sektorfluss: volle Fortschrittsleiste fuehrt in den naechsten Sektor,
    // nach dem letzten Sektor folgt der Sieg.
    if (shared.fortschritt >= 100) {
      if (sector >= MAX_SECTORS) {
        shared.fortschritt = 100;
        phase = "won";
      } else {
        sector += 1;
        shared.fortschritt = 0;
      }
    }
  }

  function hostState() {
    return {
      sector,
      sectorCount: MAX_SECTORS,
      phase,
      shared: { ...shared },
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        stability: s.stability,
        owner: s.owner ? s.owner.label : null,
      })),
    };
  }

  function controllerState(id) {
    const s = station(id);
    if (!s) return { phase, shared: { ...shared } };
    return { stationId: s.id, name: s.name, status: s.status, stability: s.stability, phase, shared: { ...shared } };
  }

  return {
    station,
    freeStations,
    claimStation,
    releaseStation,
    assignTask,
    solve,
    setBaseLevel,
    triggerEvent,
    reset,
    tick,
    hostState,
    controllerState,
  };
}
