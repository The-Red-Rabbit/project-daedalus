// Autoritativer Spielzustand: Stationen, geteilte Werte, Sektor-Schleife.
// Bewusst als nachvollziehbares Geruest gehalten. Stellen mit TODO sind
// fuer Claude Code zum Ausbauen vorgesehen.

import { mulberry32, makeSeed } from "../shared/rng.js";
import { STATUS } from "../shared/protocol.js";
import { registry } from "../client/minigames/registry.js";

export function createGame(config) {
  const stations = config.stations.map((s) => ({
    id: s.id,
    name: s.name,
    minigame: s.minigame,
    status: STATUS.CRITICAL, // unbesetzt zaehlt als kritisch
    owner: null, // { label }
    task: null, // { minigame, level, seed }
  }));

  const shared = { huelle: 100, energie: 100, fortschritt: 0 };
  let sector = 1;

  const station = (id) => stations.find((s) => s.id === id) || null;
  const freeStations = () => stations.filter((s) => !s.owner).map((s) => ({ id: s.id, name: s.name }));

  function claimStation(id, owner) {
    const s = station(id);
    if (!s || s.owner) return null;
    s.owner = owner;
    s.status = STATUS.WARN; // besetzt, aber noch nicht stabil
    return s;
  }

  function releaseStation(id) {
    const s = station(id);
    if (!s) return;
    s.owner = null;
    s.task = null;
    s.status = STATUS.CRITICAL;
  }

  // Erzeugt eine neue Zufallsaufgabe fuer die Station und merkt sich den Seed.
  function assignTask(s) {
    if (!s) return null;
    const level = config.baseLevel || 1;
    const seed = makeSeed();
    s.task = { minigame: s.minigame, level, seed };
    return s.task;
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
    s.status = result.geloest ? STATUS.STABLE : STATUS.WARN;
    return result;
  }

  function tick(dtSeconds) {
    // Leerlauf kostet Huelle: jede unbesetzte Station zieht Wert ab.
    const leer = stations.filter((s) => !s.owner).length;
    if (leer > 0) shared.huelle = Math.max(0, shared.huelle - leer * 2 * dtSeconds);

    // Kopplung: Fortschritt steigt nur bei genug stabilen Stationen.
    const stabil = stations.filter((s) => s.status === STATUS.STABLE).length;
    const noetig = Math.max(1, Math.ceil(stations.length / 2));
    if (stabil >= noetig) shared.fortschritt = Math.min(100, shared.fortschritt + 3 * dtSeconds);

    // TODO: Status einer Station faellt mit der Zeit zurueck (Nachjustieren noetig).
    // TODO: Ereignisse (Asteroidenwelle) und Sektorwechsel mit Rollenrotation.
  }

  function hostState() {
    return {
      sector,
      shared: { ...shared },
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        owner: s.owner ? s.owner.label : null,
      })),
    };
  }

  function controllerState(id) {
    const s = station(id);
    if (!s) return { shared: { ...shared } };
    return { stationId: s.id, name: s.name, status: s.status, shared: { ...shared } };
  }

  return {
    station,
    freeStations,
    claimStation,
    releaseStation,
    assignTask,
    solve,
    tick,
    hostState,
    controllerState,
  };
}
