// Autoritativer Spielzustand: Stationen, Teilnehmer, geteilte Werte, Sektor-Schleife.
// Der Server verteilt Rollen selbst (Operator je Station, Co-Piloten als
// Unterstuetzung), rotiert die Sitzordnung je Sektor und justiert die
// Schwierigkeit pro Person nach dem Tempo.

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
const SUPPORTER_BOOST = 0.34;      // eine Co-Pilot-Loesung hebt die Stabilitaet der Station
const FAST_SOLVE_SEC = 6;          // schneller geloest -> eine Stufe schwerer
const SLOW_SOLVE_SEC = 18;         // langsamer geloest -> eine Stufe leichter

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
    stability: 0, // 1 direkt nach dem Loesen, faellt im Tick auf 0
    operatorId: null, // Teilnehmer, der die Station bedient
    supporters: [], // Teilnehmer-Ids, die zuarbeiten
  }));

  // id -> { id, label, role, stationId, level, task, taskAt }
  const participants = new Map();

  const shared = { huelle: 100, energie: 100, fortschritt: 0 };
  let sector = 1;
  let phase = "running"; // "running" | "won" | "lost"
  let baseLevel = clampLevel(config.baseLevel || 1);
  let now = 0; // Sekundenuhr aus den Ticks (fuer das Tempo)

  const station = (id) => stations.find((s) => s.id === id) || null;
  const stationName = (id) => (station(id) ? station(id).name : "");
  const minigameOf = (id) => (station(id) ? station(id).minigame : null);

  // Der Status ergibt sich aus Besetzung und Stabilitaet.
  function refreshStatus(s) {
    if (!s.operatorId) s.status = STATUS.CRITICAL;
    else if (s.stability > 0) s.status = STATUS.STABLE;
    else s.status = STATUS.WARN;
  }

  function assignmentOf(id) {
    const p = participants.get(id);
    if (!p) return null;
    return {
      id: p.id,
      label: p.label,
      role: p.role,
      stationId: p.stationId,
      stationName: stationName(p.stationId),
      minigame: minigameOf(p.stationId),
    };
  }

  // Freie Operator-Station bevorzugen, sonst Co-Pilot der am wenigsten
  // unterstuetzten besetzten Station (Gleichstand: niedrigste Stabilitaet).
  function place(p) {
    const free = stations.find((s) => !s.operatorId);
    if (free) {
      free.operatorId = p.id;
      p.role = "operator";
      p.stationId = free.id;
      refreshStatus(free);
      return;
    }
    const target = stations
      .slice()
      .sort((a, b) => a.supporters.length - b.supporters.length || a.stability - b.stability)[0];
    target.supporters.push(p.id);
    p.role = "supporter";
    p.stationId = target.id;
  }

  function addParticipant(id, label) {
    const p = { id, label: label || "Crew", role: "operator", stationId: null, level: baseLevel, task: null, taskAt: now };
    participants.set(id, p);
    place(p);
    return assignmentOf(id);
  }

  // Entfernt einen Teilnehmer. Faellt ein Operator weg, rueckt ein Co-Pilot nach.
  function removeParticipant(id) {
    const p = participants.get(id);
    if (!p) return {};
    const s = station(p.stationId);
    let promoted = null;
    if (s) {
      if (s.operatorId === id) {
        s.operatorId = null;
        if (s.supporters.length) {
          const nextId = s.supporters.shift();
          const np = participants.get(nextId);
          if (np) {
            s.operatorId = nextId;
            np.role = "operator";
            promoted = nextId;
          }
        }
        refreshStatus(s);
      } else {
        s.supporters = s.supporters.filter((x) => x !== id);
      }
    }
    participants.delete(id);
    return promoted ? { promoted: assignmentOf(promoted) } : {};
  }

  // Erzeugt eine neue Zufallsaufgabe fuer den Teilnehmer (Stufe pro Person).
  function assignTask(id) {
    const p = participants.get(id);
    if (!p) return null;
    p.task = { minigame: minigameOf(p.stationId), level: clampLevel(p.level), seed: makeSeed() };
    p.taskAt = now;
    return p.task;
  }

  // Grundschwierigkeit (Leitstand). Setzt die Stufe aller Teilnehmer neu.
  function setBaseLevel(level) {
    baseLevel = clampLevel(level);
    for (const p of participants.values()) p.level = baseLevel;
    return baseLevel;
  }

  // Adaptive Stufe: schnelle Loesungen werden schwerer, langsame leichter.
  function adapt(p) {
    const elapsed = now - p.taskAt;
    if (elapsed <= FAST_SOLVE_SEC) p.level = clampLevel(p.level + 1);
    else if (elapsed >= SLOW_SOLVE_SEC) p.level = clampLevel(p.level - 1);
  }

  // Baut die Aufgabe aus dem Seed nach und prueft die Eingabe.
  function solve(id, input) {
    const p = participants.get(id);
    if (!p || !p.task) return { geloest: false, teiltreffer: 0 };
    const mod = registry[p.task.minigame];
    if (!mod) return { geloest: false, teiltreffer: 0 };
    const rng = mulberry32(p.task.seed);
    const task = mod.generate(p.task.level, rng);
    const result = mod.validate(task, input);
    if (result.geloest) {
      const s = station(p.stationId);
      if (s) {
        if (p.role === "operator") s.stability = 1; // frisch stabilisiert
        else s.stability = Math.min(1, s.stability + SUPPORTER_BOOST); // Co-Pilot hilft
        refreshStatus(s);
      }
      adapt(p);
    }
    return result;
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

  // Sitzordnung neu verteilen: ausgehend von der aktuellen Reihenfolge ruecken
  // alle eine Position weiter, dann neu in Stationsreihenfolge austeilen.
  // So sitzt jede Person an einer anderen Station; ueberzaehlige werden Co-Piloten.
  // Jede Station startet im neuen Sektor instabil.
  function rotate() {
    // aktuelle Reihenfolge: zuerst Operatoren in Stationsreihenfolge, dann Co-Piloten
    const seated = [];
    for (const s of stations) if (s.operatorId) seated.push(s.operatorId);
    for (const s of stations) for (const sup of s.supporters) seated.push(sup);
    if (seated.length < 2) return; // mit hoechstens einer Person gibt es nichts zu drehen
    const order = seated.slice(1).concat(seated.slice(0, 1)); // um eins verschieben

    for (const s of stations) {
      s.operatorId = null;
      s.supporters = [];
      s.stability = 0;
    }
    order.forEach((pid, i) => {
      const s = stations[i % stations.length];
      const p = participants.get(pid);
      if (!s.operatorId) {
        s.operatorId = pid;
        p.role = "operator";
      } else {
        s.supporters.push(pid);
        p.role = "supporter";
      }
      p.stationId = s.id;
    });
    for (const s of stations) refreshStatus(s);
  }

  // Setzt das Spiel fuer einen neuen Anlauf zurueck. Die Crew bleibt sitzen,
  // braucht aber frische Aufgaben (vom Server neu vergeben).
  function reset() {
    shared.huelle = 100;
    shared.energie = 100;
    shared.fortschritt = 0;
    sector = 1;
    phase = "running";
    for (const s of stations) {
      s.stability = 0;
      refreshStatus(s);
    }
    for (const p of participants.values()) {
      p.task = null;
      p.level = baseLevel;
    }
  }

  function tick(dtSeconds) {
    now += dtSeconds;
    if (phase !== "running") return { rotated: false }; // nach Sieg/Niederlage ruht die Simulation

    // Statusverfall: eine stabile Station faellt ohne neue Loesung auf "achtung".
    for (const s of stations) {
      if (s.operatorId && s.stability > 0) {
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
      return { rotated: false };
    }

    // Kopplung: Fortschritt steigt nur, wenn die Mehrheit der besetzten
    // Stationen stabil ist. Unbesetzte Stationen ziehen die Huelle, blockieren
    // den Fortschritt aber nicht (sonst waere es fuer kleine Gruppen unspielbar).
    const manned = stations.filter((s) => s.operatorId);
    const stabil = manned.filter((s) => s.status === STATUS.STABLE).length;
    const noetig = manned.length ? Math.floor(manned.length / 2) + 1 : Infinity;
    if (stabil >= noetig) {
      shared.fortschritt = Math.min(100, shared.fortschritt + PROGRESS_PER_SEC * dtSeconds);
    }

    // Sektorfluss: volle Leiste fuehrt in den naechsten Sektor (mit Rollenwechsel),
    // nach dem letzten Sektor folgt der Sieg.
    let rotated = false;
    if (shared.fortschritt >= 100) {
      if (sector >= MAX_SECTORS) {
        shared.fortschritt = 100;
        phase = "won";
      } else {
        sector += 1;
        shared.fortschritt = 0;
        rotate();
        rotated = true;
      }
    }
    return { rotated };
  }

  function hostState() {
    return {
      sector,
      sectorCount: MAX_SECTORS,
      phase,
      crew: participants.size,
      shared: { ...shared },
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        stability: s.stability,
        operator: s.operatorId && participants.get(s.operatorId) ? participants.get(s.operatorId).label : null,
        supporters: s.supporters.length,
      })),
    };
  }

  function participantState(id) {
    const p = participants.get(id);
    if (!p) return { phase, shared: { ...shared } };
    const s = station(p.stationId);
    return {
      role: p.role,
      stationId: p.stationId,
      stationName: stationName(p.stationId),
      status: s ? s.status : STATUS.CRITICAL,
      stability: s ? s.stability : 0,
      phase,
      shared: { ...shared },
    };
  }

  return {
    station,
    addParticipant,
    removeParticipant,
    assignTask,
    assignmentOf,
    solve,
    setBaseLevel,
    triggerEvent,
    rotate,
    reset,
    tick,
    hostState,
    participantState,
  };
}
