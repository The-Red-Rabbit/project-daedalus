// Autoritativer Spielzustand: Stationen, Teilnehmer, geteilte Werte, Sektor-Schleife.
// Der Server verteilt Rollen selbst (Operator je Station, Co-Piloten als
// Unterstuetzung), rotiert die Sitzordnung je Sektor und justiert die
// Schwierigkeit pro Person nach dem Tempo.

import { mulberry32, makeSeed } from "../shared/rng.js";
import { STATUS, PHASES } from "../shared/protocol.js";
import { registry } from "../client/minigames/registry.js";

// Abstimmwerte des Spielkerns an einem Ort. Tempo-Profil: Vorschlagswerte,
// werden in AP8 (Balancing) nach Komplettdurchlaeufen justiert.
const ASTEROID_DAMAGE = 18;          // Huellenschaden je Asteroidenwelle
const HULL_DRAIN_CRITICAL = 0.5;     // unbesetzte Station, Huelle pro Sekunde
const HULL_DRAIN_WARN = 0.10;        // besetzt, aber nicht stabil, Huelle pro Sekunde
const GRACE_SEC = 6;                 // Schonzeit nach Start und Sektorwechsel: kein Verfall, kein Huellenverlust
const MAX_SECTORS = 3;               // nach dem letzten Sektor folgt der Sieg
const SUPPORTER_BOOST = 0.34;        // eine Co-Pilot-Loesung hebt die Stabilitaet der Station
const WRONG_SOLVE_PENALTY = 5;       // Energie-Abzug bei Fehlversuch (Raten wird teuer)
const FAST_SOLVE_SEC = 6;            // schneller geloest -> eine Stufe schwerer
const SLOW_SOLVE_SEC = 18;           // langsamer geloest -> eine Stufe leichter
// Joker-Abstimmung (AP4): geteilte Ladungen, Abstimmungsfenster, Huellenreparatur.
const JOKER_CHARGES = 3;             // Anzahl Joker-Ladungen je Spiel
const JOKER_VOTE_DURATION_SEC = 10;  // Abstimmungsfenster in Sekunden
const JOKER_HULL_REPAIR = 25;        // Huellenreparatur bei erfolgreicher Abstimmung
// Neue Schiffswerte (AP2): Energie treibt den Fortschritt.
const ENERGY_DECAY_PER_SEC = 3;      // Energie faellt ohne Aktivitaet (3/s macht den Unterschied aktiv/passiv sichtbar)
const ENERGY_GAIN_ON_SOLVE = 10;     // Energie je Loesung fuer Energie (Weg A)
const PROGRESS_RATE_MAX = 0.7;       // max. Fortschritt-% pro Sekunde bei voller Energie: Sektor dauert ~143 s
const HULL_REPAIR_ON_SECTOR = 15;    // automatische Huellenreparatur beim Sektorwechsel
export const ASTEROID_INTERVAL_SEC = 90; // mittlerer Abstand zwischen automatischen Asteroid-Treffern in Sekunden
export const DEFAULT_MAX_SECTORS = 3;
export const HELP_COOLDOWN_SEC = 20;     // Sperrzeit des Hilfe-Buttons nach einer Anfrage (einstellbar)
// Sonderfunktionen (Weg B des Stationsmenues): Groessen und Dauer.
const SPECIAL_ENERGY_BOOST = 20;         // Energieschub (Reaktor): Sofort-Plus auf die geteilte Energie
const SPECIAL_PROGRESS_BOOST = 15;       // Kurskorrektur (Navigation): Sofort-Schub auf den Fortschritt
const SPECIAL_HULL_REPAIR = 20;          // Schadenskontrolle (Bordcomputer): sofortige Huellenreparatur
export const ASTEROID_FILTER_DURATION_SEC = 30; // Asteroiden filtern (Sensorik): Dauer der gesenkten Einschlagrate in Sekunden
export const ASTEROID_FILTER_FACTOR = 4;         // Asteroiden filtern: Teiler fuer den Asteroidentakt (4x seltener)

function clampLevel(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(1, n));
}

export function createGame(config) {
  // Joker-Anfangsladungen aus der Konfiguration (Teststand kann 0 setzen).
  const initialJokerCharges = config.jokerCharges ?? JOKER_CHARGES;
  const stations = config.stations.map((s) => ({
    id: s.id,
    name: s.name,
    minigame: s.minigame,
    status: STATUS.CRITICAL,
    stability: 0,
    operatorId: null,
    supporters: [],
  }));

  // id -> { id, label, role, stationId, level, task, taskAt, contributions }
  const participants = new Map();

  const shared = { huelle: 100, energie: 100, fortschritt: 0, score: 0, lossReason: null, jokerCharges: initialJokerCharges };
  // Schnappschuss der Beitraege am Spielende (fuer die "Warum verloren?"-Anzeige in AP3).
  let endContributions = null;
  let sector = 1;
  const maxSectors = config.maxSectors || DEFAULT_MAX_SECTORS;
  // Das Spiel beginnt in der Lobby und wartet auf den Start durch die Lehrkraft.
  let phase = PHASES.LOBBY; // "lobby" | "running" | "won" | "lost"
  let baseLevel = clampLevel(config.baseLevel || 1);
  let now = 0; // Sekundenuhr aus den Ticks (fuer das Tempo)
  let graceUntil = 0; // Ende der Schonzeit; bis dahin kein Verfall und kein Huellenverlust
  // Joker-Abstimmungszustand (AP4): null wenn keine Abstimmung laeuft.
  // { initiatorId, deadline, casts: Map<pid, "yes"|"no"> }
  let vote = null;

  // Asteroiden-Filter (Sensorik-Sonderfunktion): Zeitpunkt, bis zu dem die Einschlagrate gesenkt ist.
  let asteroidFilterUntil = 0;

  // Stationsspezifische Sonderfunktionen (Weg B des Stationsmenues). Als Closure definiert,
  // damit sensorik auf asteroidFilterUntil und now zugreifen kann.
  const STATION_FUNCTIONS = {
    // Energieschub: Sofort-Plus auf die geteilte Energie ueber den normalen Ladewert hinaus
    reaktor:      (shared) => { shared.energie    = Math.min(100, shared.energie    + SPECIAL_ENERGY_BOOST);   return { boost: SPECIAL_ENERGY_BOOST }; },
    // Asteroiden filtern: senkt fuer eine konfigurierbare Dauer die Einschlagrate
    sensorik:     ()       => { asteroidFilterUntil = now + ASTEROID_FILTER_DURATION_SEC;                      return { duration: ASTEROID_FILTER_DURATION_SEC }; },
    // Kurskorrektur: Sofort-Schub auf den Fortschritt
    navigation:   (shared) => { shared.fortschritt = Math.min(100, shared.fortschritt + SPECIAL_PROGRESS_BOOST); return { boost: SPECIAL_PROGRESS_BOOST }; },
    // Schadenskontrolle: repariert ein Stueck Huelle
    bordcomputer: (shared) => { shared.huelle     = Math.min(100, shared.huelle     + SPECIAL_HULL_REPAIR);   return { repair: SPECIAL_HULL_REPAIR }; },
  };

  // Hilfe-Button: Cooldown-Ende je Anfragender (in 'now'-Sekunden).
  const helpCooldowns = new Map();

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
    const p = { id, label: label || "Crew", role: "operator", stationId: null, level: baseLevel, task: null, taskAt: now, contributions: 0, readyForNextSector: false, hasInitiatedVote: false };
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
  // Nur fuer den Debug-Teststand gedacht. Ein vorhandener Operator wird beim
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

  // Setzt das Spiel in den Verloren-Zustand und speichert den Beitrags-Schnappschuss.
  function triggerLoss() {
    shared.huelle = 0;
    shared.lossReason = "hull_depleted";
    endContributions = [...participants.values()].map((p) => ({ id: p.id, label: p.label, contributions: p.contributions }));
    phase = PHASES.LOST;
  }

  // Laedt die geteilte Energie um ENERGY_GAIN_ON_SOLVE Punkte und erhoehe den
  // Beitragszaehler des Teilnehmers (nur im laufenden Spiel).
  // Wird von solve() bei korrekter Loesung gerufen und ist zusaetzlich direkt
  // aufrufbar, damit AP3 das Stationsmenue (Weg A) anbinden kann.
  function addEnergyFromSolve(id) {
    if (phase !== PHASES.RUNNING) return;
    shared.energie = Math.min(100, shared.energie + ENERGY_GAIN_ON_SOLVE);
    const p = participants.get(id);
    if (p) p.contributions++;
  }

  // Loest die laufende Abstimmung auf: einfache Mehrheit entscheidet.
  // Bei Ja: eine Ladung verbrauchen, Huelle reparieren. Bei Nein: nichts.
  // Das Initiierungsrecht des Starters ist in jedem Fall bereits verbraucht.
  function resolveVote() {
    if (!vote) return null;
    let yes = 0, no = 0;
    for (const v of vote.casts.values()) {
      if (v === "yes") yes++;
      else no++;
    }
    const result = yes > no ? "yes" : "no";
    let chargeConsumed = false;
    if (result === "yes") {
      shared.jokerCharges = Math.max(0, shared.jokerCharges - 1);
      shared.huelle = Math.min(100, shared.huelle + JOKER_HULL_REPAIR);
      chargeConsumed = true;
    }
    const resolved = { result, yesCount: yes, noCount: no, chargeConsumed, remainingCharges: shared.jokerCharges };
    vote = null;
    return resolved;
  }

  // Startet eine Joker-Abstimmung (Weg C des Stationsmenues). Der Initiator
  // verbraucht sein einmaliges Recht sofort, unabhaengig vom Ergebnis.
  // Abgelehnt bei: keine Ladungen, Recht bereits verbraucht, Abstimmung laeuft.
  function voteStart(initiatorId) {
    if (phase !== PHASES.RUNNING) return { ok: false, reason: "not_running" };
    const p = participants.get(initiatorId);
    if (!p) return { ok: false, reason: "unknown_participant" };
    if (shared.jokerCharges <= 0) return { ok: false, reason: "no_charges" };
    if (p.hasInitiatedVote) return { ok: false, reason: "already_initiated" };
    if (vote) return { ok: false, reason: "vote_active" };
    p.hasInitiatedVote = true;
    vote = { initiatorId, deadline: now + JOKER_VOTE_DURATION_SEC, casts: new Map() };
    return { ok: true };
  }

  // Nimmt die Stimme eines Teilnehmers entgegen (je Abstimmung nur einmal).
  function voteCast(pid, choice) {
    if (phase !== PHASES.RUNNING) return { ok: false, reason: "not_running" };
    if (!vote) return { ok: false, reason: "no_vote_active" };
    if (!participants.has(pid)) return { ok: false, reason: "unknown_participant" };
    if (vote.casts.has(pid)) return { ok: false, reason: "already_cast" };
    if (choice !== "yes" && choice !== "no") return { ok: false, reason: "invalid_choice" };
    vote.casts.set(pid, choice);
    return { ok: true };
  }

  // Baut die Aufgabe aus dem Seed nach und prueft die Eingabe.
  // mode: "energy" (Standard, Weg A) laedt Energie und zaehlt Beitrag;
  //       "function" (Weg B) loest die Sonderfunktion der Station aus, kein Beitrag.
  // Fehlversuche kosten Energie unabhaengig vom Modus.
  function solve(id, input, mode = "energy") {
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
      if (phase === PHASES.RUNNING) {
        shared.score++;
        if (mode === "function" && s) {
          // Sonderfunktion (Weg B): Dispatcher aufrufen, kein Energie- oder Beitragszuwachs
          const handler = STATION_FUNCTIONS[s.id];
          const effectData = handler ? (handler(shared) || {}) : {};
          return { ...result, specialFunction: { stationId: s.id, ...effectData } };
        }
        // Energie-Modus (Standard, Weg A): Energie laden und Beitrag zaehlen
        addEnergyFromSolve(id);
      }
    } else if (phase === PHASES.RUNNING) {
      // Fehlversuch kostet Energie – blindes Raten wird teuer (gilt fuer beide Wege).
      shared.energie = Math.max(0, shared.energie - WRONG_SOLVE_PENALTY);
    }
    return result;
  }

  // Hilfe-Button: waehlt einen zufaelligen anderen aktiven Teilnehmer als Helfer
  // und berechnet einen Hinweis aus der Aufgabe des Anfragers. Blockt per Cooldown.
  function requestHelp(requesterId) {
    if (phase !== PHASES.RUNNING) return { ok: false, reason: "not_running" };
    const requester = participants.get(requesterId);
    if (!requester || !requester.task) return { ok: false, reason: "no_task" };

    const cooldownEnd = helpCooldowns.get(requesterId) || 0;
    if (now < cooldownEnd) {
      return { ok: false, reason: "cooldown", remaining: Math.ceil(cooldownEnd - now) };
    }

    const others = [...participants.values()].filter(p => p.id !== requesterId);
    if (others.length === 0) return { ok: false, reason: "no_helpers" };

    const helper = others[Math.floor(Math.random() * others.length)];

    const mod = registry[requester.task.minigame];
    if (!mod || typeof mod.hint !== "function") return { ok: false, reason: "no_hint" };
    const rng = mulberry32(requester.task.seed);
    const task = mod.generate(requester.task.level, rng);
    const hint = mod.hint(task);

    helpCooldowns.set(requesterId, now + HELP_COOLDOWN_SEC);

    return {
      ok: true,
      hint,
      helperId: helper.id,
      helperLabel: helper.label,
      requesterId,
      requesterLabel: requester.label,
    };
  }

  // Start durch die Lehrkraft: aus der Lobby ins laufende Spiel. Die Crew kommt
  // in einer kurzen Schonzeit an, bevor Verfall und Huellenverlust einsetzen.
  function startGame() {
    if (phase === PHASES.LOBBY) {
      phase = PHASES.RUNNING;
      sandbox = false; // ein echter Start verlaesst den Teststand
      graceUntil = now + GRACE_SEC;
      shared.score = 0;
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
    return assignmentOf(id);
  }

  // Ereignis vom Leitstand oder automatisch aus server/index.js.
  // Eine Asteroidenwelle senkt die Huelle; bei 0 tritt triggerLoss() ein.
  function triggerEvent(kind) {
    if (phase !== PHASES.RUNNING) return null;
    if (kind === "asteroid") {
      shared.huelle = Math.max(0, shared.huelle - ASTEROID_DAMAGE);
      if (shared.huelle <= 0) triggerLoss();
      return { kind: "asteroid", damage: ASTEROID_DAMAGE };
    }
    return null;
  }

  // Spieler meldet sich bereit fuer den naechsten Sektor. Nur moeglich, wenn
  // der Fortschritt 100 % erreicht hat; gibt true zurueck, wenn akzeptiert.
  function markReady(id) {
    const p = participants.get(id);
    if (!p || phase !== PHASES.RUNNING) return false;
    if (shared.fortschritt < 100) return false;
    p.readyForNextSector = true;
    return true;
  }

  // Naechsten Sektor starten (nur Host). Setzt Fortschritt zurueck, repariert die
  // Huelle automatisch, rotiert die Sitzordnung und startet die Schonzeit neu.
  // Liefert { won, sector } oder null, wenn der Aufruf ungueltigt ist.
  function advanceSector() {
    if (phase !== PHASES.RUNNING) return null;
    if (shared.fortschritt < 100) return null;
    sector++;
    if (sector > maxSectors) {
      phase = PHASES.WON;
      return { won: true, sector };
    }
    // Fortschritt zurueck auf 0, Huelle reparieren, Bereitschaft zuruecksetzen.
    shared.fortschritt = 0;
    shared.huelle = Math.min(100, shared.huelle + HULL_REPAIR_ON_SECTOR);
    for (const p of participants.values()) p.readyForNextSector = false;
    rotate(); // rotiert Stationen und setzt graceUntil
    return { won: false, sector };
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
    graceUntil = now + GRACE_SEC;
  }

  // Setzt das Spiel fuer einen neuen Anlauf zurueck. Die Crew bleibt sitzen,
  // landet aber wieder in der Lobby und wartet auf den naechsten Start.
  function reset() {
    shared.huelle = 100;
    shared.energie = 100;
    shared.fortschritt = 0;
    shared.score = 0;
    shared.lossReason = null;
    shared.jokerCharges = initialJokerCharges;
    endContributions = null;
    sector = 1;
    phase = PHASES.LOBBY;
    graceUntil = 0;
    sandbox = false; // den Teststand verlassen
    vote = null;
    helpCooldowns.clear();
    asteroidFilterUntil = 0;
    for (const s of stations) {
      s.stability = 0;
      refreshStatus(s);
    }
    for (const p of participants.values()) {
      p.task = null;
      p.level = baseLevel;
      p.contributions = 0;
      p.readyForNextSector = false;
      p.hasInitiatedVote = false;
    }
  }

  function tick(dtSeconds) {
    // Schonzeit nach Start und Sektorwechsel: die Crew kommt an, ohne dass
    // Energie verfaellt oder die Huelle leidet.
    // Gegen den gerade beginnenden Zeitschritt geprueft (vor dem Hochzaehlen der
    // Uhr), damit eine GRACE_SEC lange Schonzeit auch genau so lange wirkt.
    const inGrace = phase === PHASES.RUNNING && now < graceUntil;
    now += dtSeconds;
    // Nur das laufende Spiel wird simuliert. In der Lobby und nach Sieg/Niederlage
    // laeuft nur die Uhr weiter (fuer die adaptive Schwierigkeit).
    if (phase !== PHASES.RUNNING) return { rotated: false };

    // Stationsstatus aus Besetzung und Stabilitaet aktualisieren (kein Verfall mehr;
    // Status spiegelt nur noch Besetzung und ob die letzte Aufgabe geloest wurde).
    for (const s of stations) refreshStatus(s);

    // Leerlauf und Vernachlaessigung kosten Huelle: unbesetzt am staerksten,
    // besetzt aber nicht stabil weniger, stabil gar nicht. In der Schonzeit und im
    // Sandbox-Teststand nicht (einzelne Teststation soll das Schiff nicht aufreiben).
    if (!inGrace && !sandbox) {
      let drain = 0;
      for (const s of stations) {
        if (s.status === STATUS.CRITICAL) drain += HULL_DRAIN_CRITICAL;
        else if (s.status === STATUS.WARN) drain += HULL_DRAIN_WARN;
      }
      if (drain > 0) shared.huelle = Math.max(0, shared.huelle - drain * dtSeconds);
    }

    // Im Sandbox-Teststand ruht der Schiffsfluss: kein Niederlage-Ende, kein
    // Energie- und Fortschrittsfluss, damit eine einzelne Teststation nicht das
    // Schiff aufsaugt.
    if (sandbox) return { rotated: false };

    // Niederlage: leere Huelle beendet den Durchlauf (einzige Verlustbedingung).
    if (shared.huelle <= 0) {
      triggerLoss();
      return { rotated: false };
    }

    if (!inGrace) {
      // Energie faellt langsam ohne Aktivitaet (Loesungen via addEnergyFromSolve laden nach).
      shared.energie = Math.max(0, shared.energie - ENERGY_DECAY_PER_SEC * dtSeconds);
      // Fortschritt steigt umso schneller, je hoeher die Energie steht; klemmt bei 100.
      // Der Sektorwechsel und der Sieg kommen in AP3 (manuell durch die LK).
      shared.fortschritt = Math.min(100, shared.fortschritt + PROGRESS_RATE_MAX * (shared.energie / 100) * dtSeconds);
    }

    // Joker-Abstimmungsfenster pruefen: Frist abgelaufen oder alle haben abgestimmt.
    let voteResolved = null;
    if (vote && (now >= vote.deadline || vote.casts.size >= participants.size)) {
      voteResolved = resolveVote();
    }

    return { rotated: false, voteResolved };
  }

  // Gibt zurueck, ob der Asteroiden-Filter (Sensorik-Sonderfunktion) gerade aktiv ist.
  // server/index.js fragt das ab, um die Trefferwahrscheinlichkeit zu senken.
  function isAsteroidFiltered() {
    return phase === PHASES.RUNNING && now < asteroidFilterUntil;
  }

  const labelOf = (id) => (id && participants.get(id) ? participants.get(id).label : null);

  // Sicht auf den laufenden Abstimmungszustand fuer Beamer, Leitstand und Controller.
  function voteView() {
    if (!vote) return null;
    return {
      active: true,
      initiatorId: vote.initiatorId,
      initiatorLabel: labelOf(vote.initiatorId),
      timeLeft: Math.max(0, Math.ceil(vote.deadline - now)),
      castCount: vote.casts.size,
      total: participants.size,
    };
  }

  function hostState() {
    return {
      sector,
      sectorCount: maxSectors,
      phase,
      // Verbleibende Schonzeit in ganzen Sekunden (0, wenn keine laeuft).
      grace: phase === PHASES.RUNNING ? Math.max(0, Math.ceil(graceUntil - now)) : 0,
      crew: participants.size,
      // Vollstaendige Crewliste fuer Lobby und Leitstand (auch noch unverteilte Namen).
      // Sektorgrenzen-Zustand: wie viele Spieler haben sich bereit gemeldet?
      // Aktiv nur bei Fortschritt 100 im laufenden Spiel (AP3 Sektorfluss).
      atBoundary: phase === PHASES.RUNNING && shared.fortschritt >= 100,
      readyCount: [...participants.values()].filter((p) => p.readyForNextSector).length,
      roster: [...participants.values()].map((p) => ({
        id: p.id,
        label: p.label,
        role: p.role,
        stationName: stationName(p.stationId),
        contributions: p.contributions, // sichtbares Beitragskonto je Person
        ready: p.readyForNextSector,    // hat sich fuer den naechsten Sektor bereit gemeldet
      })),
      shared: { ...shared },
      vote: voteView(),
      // Schnappschuss der Beitraege am Spielende (fuer "Warum verloren?"-Anzeige in AP3).
      ...(endContributions ? { endContributions } : {}),
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        stability: s.stability,
        operator: labelOf(s.operatorId),
        supporters: s.supporters.length,
        supporterNames: s.supporters.map(labelOf).filter(Boolean),
      })),
    };
  }

  function participantState(id) {
    const p = participants.get(id);
    if (!p) return { phase, shared: { ...shared } };
    const s = station(p.stationId);
    const cooldownEnd = helpCooldowns.get(id) || 0;
    return {
      role: p.role,
      stationId: p.stationId,
      stationName: stationName(p.stationId),
      status: s ? s.status : STATUS.CRITICAL,
      stability: s ? s.stability : 0,
      phase,
      shared: { ...shared },
      contributions: p.contributions, // eigener Beitragszaehler fuer das Controller-Menue
      hasInitiatedVote: p.hasInitiatedVote,
      vote: vote ? { ...voteView(), hasCast: vote.casts.has(id) } : null,
      helpCooldown: Math.max(0, Math.ceil(cooldownEnd - now)), // verbleibende Sperrzeit in Sekunden
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
    addEnergyFromSolve,
    setBaseLevel,
    startGame,
    requestHelp,
    voteStart,
    voteCast,
    triggerEvent,
    markReady,
    advanceSector,
    rotate,
    reset,
    tick,
    hostState,
    participantState,
    isAsteroidFiltered,
  };
}
