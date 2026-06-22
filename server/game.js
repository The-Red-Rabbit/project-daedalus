// Autoritativer Spielzustand: Stationen, Teilnehmer, geteilte Werte, Sektor-Schleife.
// Der Server verteilt Rollen selbst (Operator je Station, Co-Piloten als
// Unterstuetzung), rotiert die Sitzordnung je Sektor und justiert die
// Schwierigkeit pro Person nach dem Tempo.

import { mulberry32, makeSeed } from "../shared/rng.js";
import { STATUS, PHASES } from "../shared/protocol.js";
import { registry } from "../client/minigames/registry.js";

// Abstimmwerte des Spielkerns an einem Ort. Tempo-Profil: "mittel" (spuerbar
// ruhiger als der erste Stand, aber noch fordernd).
const ASTEROID_DAMAGE = 22;          // Huellenschaden je Asteroidenwelle
const STABLE_DECAY_PER_SEC = 0.0625; // stabil haelt rund 16 Sekunden ohne neue Loesung
const HULL_DRAIN_CRITICAL = 1.0;     // unbesetzte Station, Huelle pro Sekunde
const HULL_DRAIN_WARN = 0.35;        // besetzt, aber nicht stabil, Huelle pro Sekunde
const GRACE_SEC = 6;                 // Schonzeit nach Start und Sektorwechsel: kein Verfall, kein Huellenverlust
const PROGRESS_PER_SEC = 8;          // Fortschritt pro Sekunde bei genug stabilen Stationen
const MAX_SECTORS = 3;               // nach dem letzten Sektor folgt der Sieg
const SUPPORTER_BOOST = 0.34;        // eine Co-Pilot-Loesung hebt die Stabilitaet der Station
const WRONG_SOLVE_PENALTY = 0.34;    // ein falscher Loesungsversuch senkt die Stabilitaet (Raten wird teuer)
const FAST_SOLVE_SEC = 6;            // schneller geloest -> eine Stufe schwerer
const SLOW_SOLVE_SEC = 18;           // langsamer geloest -> eine Stufe leichter
const ENERGIE_GAIN_PER_SEC = 4;      // stabil kalibrierter Reaktor hebt die Energie
const ENERGIE_DRAIN_PER_SEC = 3;     // unstabiler Reaktor laesst die Energie sinken
const HOLD_SEC = 1.5;                // Reaktor: so lange den kombinierten Wert im Zielband halten, dann rastet die Kalibrierung von selbst ein (Hold-to-Lock)
const RELOCK_PAUSE_SEC = 1.2;        // Reaktor: sichtbare "Kalibriert"-Pause nach dem Einrasten, bevor ein frisches Ziel rollt

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
    coop: !!s.coop, // kooperative Station mit geteiltem Zustand?
    status: STATUS.CRITICAL, // unbesetzt zaehlt als kritisch
    stability: 0, // 1 direkt nach dem Loesen, faellt im Tick auf 0
    operatorId: null, // Teilnehmer, der die Station bedient
    supporters: [], // Teilnehmer-Ids, die zuarbeiten
    // Koop-Zustand (nur bei coop): geteiltes Ziel und beide Reglerwerte.
    coopSeed: null,
    coopLevel: clampLevel(config.baseLevel || 1),
    coopTask: null,
    paramA: 0.5, // Operator-Regler (z. B. Kapazitaet), normiert 0..1
    paramB: 0.5, // Co-Pilot-Regler (z. B. Frequenz), normiert 0..1
    holdT: 0, // Hold-to-Lock: gehaltene Zeit im Zielband (Sekunden)
    lockPause: 0, // verbleibende sichtbare Pause nach dem Einrasten (Sekunden)
    locked: false, // gerade eingerastet (steigende Flanke loest die Rueckmeldung aus)
  }));

  // id -> { id, label, role, stationId, level, task, taskAt }
  const participants = new Map();

  const shared = { huelle: 100, energie: 100, fortschritt: 0, score: 0 };
  let sector = 1;
  // Das Spiel beginnt in der Lobby und wartet auf den Start durch die Lehrkraft.
  let phase = PHASES.LOBBY; // "lobby" | "running" | "won" | "lost"
  let baseLevel = clampLevel(config.baseLevel || 1);
  let now = 0; // Sekundenuhr aus den Ticks (fuer das Tempo)
  let graceUntil = 0; // Ende der Schonzeit; bis dahin kein Verfall und kein Huellenverlust
  // Sandbox: gesetzt durch den Debug-Teststand (debugSeat). Dann ruht der
  // Schiffsverfall (kein Huellenverlust, kein Sektorfluss, kein Spielende), damit
  // man ein einzelnes Mini-Spiel beliebig lange testen kann. Nur ueber DAEDALUS_DEBUG.
  let sandbox = false;

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

  // Loest einen Teilnehmer von seiner Station, ohne ihn zu entfernen (keine
  // Nachrueck-Logik). Hilfsschritt fuers gezielte Umsetzen (Debug-Teststand).
  function detach(p) {
    const s = station(p.stationId);
    if (!s) return;
    if (s.operatorId === p.id) s.operatorId = null;
    else s.supporters = s.supporters.filter((x) => x !== p.id);
    refreshStatus(s);
  }

  // Setzt einen vorhandenen Teilnehmer gezielt auf eine Station in einer Rolle.
  // Nur fuer den Debug-Teststand und den Koop-Bot-Partner gedacht (das normale
  // Spiel verteilt ueber place und rotate). Ein vorhandener Operator wird beim
  // Aufsetzen eines neuen Operators zum Co-Pilot.
  function seatParticipant(id, stationId, role) {
    const p = participants.get(id);
    const s = station(stationId);
    if (!p || !s) return null;
    detach(p);
    if (role === "supporter") {
      if (!s.supporters.includes(id)) s.supporters.push(id);
      p.role = "supporter";
    } else {
      if (s.operatorId && s.operatorId !== id) {
        const prev = participants.get(s.operatorId);
        if (prev) {
          s.supporters.unshift(prev.id);
          prev.role = "supporter";
        }
      }
      s.operatorId = id;
      p.role = "operator";
    }
    p.stationId = s.id;
    refreshStatus(s);
    return assignmentOf(id);
  }

  // --- Koop-Station (Reaktor): geteilter Zustand auf dem Server -------------

  const coopModule = (s) => registry[s.minigame] || null;

  // Rollt ein frisches Ziel fuer die Koop-Station (neuer Seed + Aufgabe) und
  // setzt die Haltezeit zurueck. Die Reglerwerte bleiben, damit nichts springt.
  function rollCoopTarget(s) {
    const op = participants.get(s.operatorId);
    s.coopLevel = clampLevel(op ? op.level : baseLevel);
    s.coopSeed = makeSeed();
    const mod = coopModule(s);
    s.coopTask = mod ? mod.generate(s.coopLevel, mulberry32(s.coopSeed)) : null;
    s.holdT = 0;
    s.lockPause = 0;
    s.locked = false;
  }

  // Setzt die Koop-Station ganz zurueck (Regler in die Mitte, frisches Ziel).
  function resetCoopStation(s) {
    s.paramA = 0.5;
    s.paramB = 0.5;
    rollCoopTarget(s);
  }

  // Stellt sicher, dass eine Koop-Station ein Ziel hat (lazy, fuer Zustands-
  // abfragen schon in der Lobby).
  function ensureCoopTask(s) {
    if (s.coop && !s.coopTask) resetCoopStation(s);
  }

  // Aktuelle Naehe der Koop-Station zum Ziel (DOM-frei ueber das Mini-Spiel).
  function coopMeasure(s) {
    ensureCoopTask(s);
    const mod = coopModule(s);
    if (!mod || !mod.validate) return { inBand: false, teiltreffer: 0, actual: 0 };
    return mod.validate(s.coopTask, { a: s.paramA, b: s.paramB });
  }

  const coopPartnerId = (s) => s.supporters[0] || null;

  // Stufenlose Eingabe eines Reglers. Der Server prueft die Berechtigung:
  // Operator stellt A, Co-Pilot stellt B; im Solo-Fall stellt der Operator beide.
  // Die Wirkung auf die Haltezeit ergibt sich im Tick (Verlassen des Bandes setzt
  // sie zurueck), nicht hier.
  function setCoopInput(pid, param, value) {
    const p = participants.get(pid);
    if (!p) return;
    const s = station(p.stationId);
    if (!s || !s.coop) return;
    ensureCoopTask(s);
    const v = Number(value);
    if (!(v >= 0 && v <= 1)) return;
    const isOp = s.operatorId === pid;
    const partnerId = coopPartnerId(s);
    const solo = !partnerId;
    if (param === "a") {
      if (!isOp) return;
      s.paramA = v;
    } else if (param === "b") {
      if (partnerId === pid) s.paramB = v;
      else if (isOp && solo) s.paramB = v;
    }
  }

  // Treibt das Hold-to-Lock einer Koop-Station fuer einen Zeitschritt voran.
  // Haelt das Paar (oder solo) den kombinierten Wert im Zielband, fuellt sich die
  // Haltezeit; ist sie voll, rastet die Kalibrierung ein: Station stabil, kurze
  // sichtbare Pause, danach ein frisches Ziel. Verlaesst der Wert das Band, faellt
  // die Haltezeit zurueck. Liefert das Crew-Array zurueck, wenn gerade eingerastet
  // wurde (steigende Flanke), sonst null – fuer die Rueckmeldung im Server.
  function advanceCoop(s, dtSeconds) {
    if (!s.coop) return null;
    ensureCoopTask(s);
    // Ohne Operator ruht die Station (keine Haltezeit).
    if (!s.operatorId) {
      s.holdT = 0;
      s.lockPause = 0;
      s.locked = false;
      return null;
    }
    // Nach dem Einrasten eine sichtbare Pause, dann ein neues Ziel.
    if (s.lockPause > 0) {
      s.lockPause = Math.max(0, s.lockPause - dtSeconds);
      if (s.lockPause === 0) rollCoopTarget(s); // setzt holdT/locked zurueck
      return null;
    }
    const measure = coopMeasure(s);
    if (measure.inBand) {
      s.holdT += dtSeconds;
      if (s.holdT >= HOLD_SEC) {
        // Eingerastet: Station stabil, sichtbare Pause, dann frisches Ziel.
        s.stability = 1;
        refreshStatus(s);
        s.locked = true;
        s.lockPause = RELOCK_PAUSE_SEC;
        shared.score++; // Koop-Einrasten zaehlt als eine gemeinsame Loesung
        const crew = [s.operatorId, coopPartnerId(s)].filter(Boolean);
        return crew;
      }
    } else {
      s.holdT = 0;
    }
    return null;
  }

  // Sicht der Bots auf eine Koop-Station (eigener Regler, Partnerwert, Naehe).
  function coopInfo(pid) {
    const p = participants.get(pid);
    if (!p) return null;
    const s = station(p.stationId);
    if (!s || !s.coop) return null;
    ensureCoopTask(s);
    const isOp = s.operatorId === pid;
    const partnerId = coopPartnerId(s);
    const isPartner = partnerId === pid;
    if (!isOp && !isPartner) return { spectator: true };
    const measure = coopMeasure(s);
    return {
      stationId: s.id,
      minigame: s.minigame,
      seed: s.coopSeed,
      level: s.coopLevel,
      param: isOp ? "a" : "b",
      solo: !partnerId,
      my: isOp ? s.paramA : s.paramB,
      partner: isOp ? s.paramB : s.paramA,
      inBand: measure.inBand,
    };
  }

  // Erzeugt eine neue Zufallsaufgabe fuer den Teilnehmer (Stufe pro Person).
  // Koop-Stationen liefern die geteilte Stationsaufgabe (fuer alle gleich).
  function assignTask(id) {
    const p = participants.get(id);
    if (!p) return null;
    const s = station(p.stationId);
    if (s && s.coop) {
      ensureCoopTask(s);
      p.task = { minigame: s.minigame, level: s.coopLevel, seed: s.coopSeed };
      p.taskAt = now;
      return p.task;
    }
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
    const s = station(p.stationId);
    if (result.geloest) {
      if (s) {
        if (p.role === "operator") s.stability = 1; // frisch stabilisiert
        else s.stability = Math.min(1, s.stability + SUPPORTER_BOOST); // Co-Pilot hilft
        refreshStatus(s);
      }
      adapt(p);
      if (phase === PHASES.RUNNING) shared.score++;
    } else if (s && !s.coop && phase === PHASES.RUNNING) {
      // Fehlversuch im laufenden Einsatz kostet ein Stueck Stabilitaet, damit
      // blindes Probieren teuer wird (Koop-Stationen rasten ueber die Haltezeit ein).
      s.stability = Math.max(0, s.stability - WRONG_SOLVE_PENALTY);
      refreshStatus(s);
    }
    return result;
  }

  // Start durch die Lehrkraft: aus der Lobby ins laufende Spiel. Die Crew kommt
  // in einer kurzen Schonzeit an, bevor Verfall und Huellenverlust einsetzen.
  function startGame() {
    if (phase === PHASES.LOBBY) {
      phase = PHASES.RUNNING;
      sandbox = false; // ein echter Start verlaesst den Teststand
      graceUntil = now + GRACE_SEC;
      shared.score = 0;
      for (const s of stations) if (s.coop) resetCoopStation(s);
    }
    return phase;
  }

  // Debug-Teststand: setzt einen Teilnehmer direkt als Operator auf eine Station
  // und versetzt das Spiel in den laufenden Sandbox-Zustand, ohne Lobby und ohne
  // Rotation. So mountet ein einzelnes Mini-Spiel sofort. Nur ueber den
  // debug-Pfad im Server erreichbar (DAEDALUS_DEBUG). Liefert die Zuweisung.
  function debugSeat(id, label, stationId, level) {
    const s = station(stationId);
    if (!s) return null;
    if (!participants.get(id)) addParticipant(id, label || "Dev");
    const p = participants.get(id);
    p.level = clampLevel(level);
    seatParticipant(id, stationId, "operator");
    sandbox = true;
    phase = PHASES.RUNNING;
    graceUntil = now + GRACE_SEC;
    if (s.coop) resetCoopStation(s);
    return assignmentOf(id);
  }

  // Ereignis vom Leitstand. Eine Asteroidenwelle senkt die Huelle.
  function triggerEvent(kind) {
    if (phase !== PHASES.RUNNING) return null;
    if (kind === "asteroid") {
      shared.huelle = Math.max(0, shared.huelle - ASTEROID_DAMAGE);
      if (shared.huelle <= 0) phase = PHASES.LOST;
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
    // Koop-Stationen mit neuem Ziel und mittiger Reglerstellung neu beginnen.
    for (const s of stations) if (s.coop) resetCoopStation(s);
    // Auch nach dem Sektorwechsel eine kurze Schonzeit zum Ankommen.
    graceUntil = now + GRACE_SEC;
  }

  // Setzt das Spiel fuer einen neuen Anlauf zurueck. Die Crew bleibt sitzen,
  // landet aber wieder in der Lobby und wartet auf den naechsten Start.
  function reset() {
    shared.huelle = 100;
    shared.energie = 100;
    shared.fortschritt = 0;
    shared.score = 0;
    sector = 1;
    phase = PHASES.LOBBY;
    graceUntil = 0;
    sandbox = false; // den Teststand verlassen
    for (const s of stations) {
      s.stability = 0;
      refreshStatus(s);
      if (s.coop) resetCoopStation(s);
    }
    for (const p of participants.values()) {
      p.task = null;
      p.level = baseLevel;
    }
  }

  function tick(dtSeconds) {
    // Schonzeit nach Start und Sektorwechsel: die Crew kommt an, ohne dass
    // Stabilitaet verfaellt oder die Huelle leidet (der Fortschritt darf laufen).
    // Gegen den gerade beginnenden Zeitschritt geprueft (vor dem Hochzaehlen der
    // Uhr), damit eine GRACE_SEC lange Schonzeit auch genau so lange wirkt.
    const inGrace = phase === PHASES.RUNNING && now < graceUntil;
    now += dtSeconds;
    // Nur das laufende Spiel wird simuliert. In der Lobby und nach Sieg/Niederlage
    // laeuft nur die Uhr weiter (fuer die adaptive Schwierigkeit).
    if (phase !== PHASES.RUNNING) return { rotated: false, coopLocks: [] };

    // Statusverfall: eine stabile Station faellt ohne neue Loesung auf "achtung".
    // Waehrend der Schonzeit haelt die Stabilitaet; der Status wird nur aufgefrischt.
    for (const s of stations) {
      if (!inGrace && s.operatorId && s.stability > 0) {
        s.stability = Math.max(0, s.stability - STABLE_DECAY_PER_SEC * dtSeconds);
      }
      refreshStatus(s);
    }

    // Reaktor (Koop-Stationen): Hold-to-Lock vorantreiben. Laeuft auch in der
    // Schonzeit und im Sandbox-Teststand, damit man jederzeit kalibrieren kann.
    // Sammelt die Crews, die gerade eingerastet sind, fuer die Rueckmeldung (RESULT).
    const coopLocks = [];
    for (const s of stations) {
      if (!s.coop) continue;
      const crew = advanceCoop(s, dtSeconds);
      if (crew) coopLocks.push({ stationId: s.id, participants: crew });
    }

    // Leerlauf und Vernachlaessigung kosten Huelle: unbesetzt am staerksten,
    // besetzt aber nicht stabil weniger, stabil gar nicht. In der Schonzeit nicht.
    // Im Sandbox-Teststand bleibt die Huelle voll (eine einzelne Teststation laesst
    // sonst die uebrigen unbesetzten Stationen das Schiff aufreiben).
    if (!inGrace && !sandbox) {
      let drain = 0;
      for (const s of stations) {
        if (s.status === STATUS.CRITICAL) drain += HULL_DRAIN_CRITICAL;
        else if (s.status === STATUS.WARN) drain += HULL_DRAIN_WARN;
      }
      if (drain > 0) shared.huelle = Math.max(0, shared.huelle - drain * dtSeconds);
    }

    // Energie haengt am Reaktor (Koop-Station): stabil kalibriert steigt sie,
    // sonst faellt sie. Ohne Koop-Station bleibt Energie konstant (kein Reaktor).
    if (!inGrace) {
      for (const s of stations) {
        if (!s.coop) continue;
        if (s.status === STATUS.STABLE) shared.energie = Math.min(100, shared.energie + ENERGIE_GAIN_PER_SEC * dtSeconds);
        else shared.energie = Math.max(0, shared.energie - ENERGIE_DRAIN_PER_SEC * dtSeconds);
      }
    }

    // Im Sandbox-Teststand ruht der Schiffsfluss: kein Niederlage-Ende, kein
    // Fortschritt und kein Sektorwechsel, damit eine einzelne Teststation nicht
    // wegrotiert oder gewinnt. Status- und Energieverlauf laufen weiter, damit das
    // Mini-Spiel sich echt anfuehlt (Stabilitaet faellt, Reaktor speist die Energie).
    if (sandbox) return { rotated: false, coopLocks };

    // Niederlage: leere Huelle beendet den Durchlauf.
    if (shared.huelle <= 0) {
      shared.huelle = 0;
      phase = PHASES.LOST;
      return { rotated: false, coopLocks };
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
        phase = PHASES.WON;
      } else {
        sector += 1;
        shared.fortschritt = 0;
        rotate();
        rotated = true;
      }
    }
    return { rotated, coopLocks };
  }

  const labelOf = (id) => (id && participants.get(id) ? participants.get(id).label : null);

  // Sicht der Brücke/des Leitstands auf die Koop-Station: Ziel, Naehe und Istwert.
  // Bewusst ohne die Einzel-Reglerwerte, damit der Informationsspalt bestehen bleibt.
  function coopHostView(s) {
    const m = coopMeasure(s);
    return {
      target: s.coopTask ? s.coopTask.targetX : 0,
      unit: "Ω",
      actual: m.actual,
      match: m.teiltreffer,
      inBand: m.inBand,
      hold: Math.min(1, s.holdT / HOLD_SEC), // Fortschritt des Einrastens 0..1
      locked: s.locked || s.lockPause > 0, // gerade eingerastet (inkl. sichtbarer Pause)
    };
  }

  // Sicht eines Teilnehmers auf die Koop-Station: nur der eigene Reglerwert, dazu
  // Ziel, Naehe und ob beide bestaetigt haben.
  function coopParticipantView(p, s) {
    const m = coopMeasure(s);
    const isOp = s.operatorId === p.id;
    const partnerId = coopPartnerId(s);
    const isPartner = partnerId === p.id;
    const solo = !partnerId;
    const myValue = solo ? { a: s.paramA, b: s.paramB } : isOp ? { a: s.paramA } : { b: s.paramB };
    return {
      role: isOp ? "operator" : isPartner ? "supporter" : "spectator",
      param: solo ? "ab" : isOp ? "a" : "b",
      solo,
      spectator: !isOp && !isPartner,
      partnerPresent: !!partnerId,
      target: s.coopTask ? s.coopTask.targetX : 0,
      unit: "Ω",
      actual: m.actual,
      match: m.teiltreffer,
      inBand: m.inBand,
      myValue,
      hold: Math.min(1, s.holdT / HOLD_SEC), // Fortschritt des Einrastens 0..1 (fuellt den Ring)
      locked: s.locked || s.lockPause > 0, // gerade eingerastet (inkl. sichtbarer Pause)
    };
  }

  function hostState() {
    return {
      sector,
      sectorCount: MAX_SECTORS,
      phase,
      // Verbleibende Schonzeit in ganzen Sekunden (0, wenn keine laeuft).
      grace: phase === PHASES.RUNNING ? Math.max(0, Math.ceil(graceUntil - now)) : 0,
      crew: participants.size,
      // Vollstaendige Crewliste fuer Lobby und Leitstand (auch noch unverteilte Namen).
      roster: [...participants.values()].map((p) => ({
        id: p.id,
        label: p.label,
        role: p.role,
        stationName: stationName(p.stationId),
      })),
      shared: { ...shared },
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        stability: s.stability,
        coop: s.coop || undefined,
        operator: labelOf(s.operatorId),
        supporters: s.supporters.length,
        supporterNames: s.supporters.map(labelOf).filter(Boolean),
        ...(s.coop ? { coopView: coopHostView(s) } : {}),
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
      ...(s && s.coop ? { coop: coopParticipantView(p, s) } : {}),
    };
  }

  return {
    station,
    addParticipant,
    removeParticipant,
    seatParticipant,
    debugSeat,
    assignTask,
    assignmentOf,
    solve,
    setCoopInput,
    coopInfo,
    setBaseLevel,
    startGame,
    triggerEvent,
    rotate,
    reset,
    tick,
    hostState,
    participantState,
  };
}
