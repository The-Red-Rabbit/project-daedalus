// Bordcomputer: Board-System-Logik (DOM-frei).
// Kachel-Routing, Signal-Simulation, Gatterlogik und Level-Generierung.
//
// Öffentliche API-Übersicht
// ─────────────────────────
// Konstanten  : DIR, TILE_TYPE, GATE_TYPE, ROWS, COLS, ROW_LABELS, COL_LABELS,
//               INPUT_A, INPUT_B, OUTPUT, DR, DC, OPP
// Zell-Fabrik : emptyCell, tileCell, gateCell
// Board       : createBoard, placeGate, rotateTile, coordLabel, cloneBoard, createTestBoard
// Simulation  : getTileExits, evalGate, evalBoard
// Solver      : enumerateBoardSolutions, isBoardSolvable, hasUniqueBoardSolution
// Generator   : generateBoard
//
// Server und Client importieren aus dieser Datei; kein DOM-Zugriff erlaubt.

// ---------------------------------------------------------------------------
// Typen-Konstanten
// ---------------------------------------------------------------------------

/** Himmelsrichtungen als Zahlen (N=0, E=1, S=2, W=3). Reihenfolge ist Pflicht; DR/DC/OPP hängen davon ab. */
export const DIR = Object.freeze({ N: 0, E: 1, S: 2, W: 3 });

/** Alle Kacheltypen. Jeder Typ hat eine eigene Routing-Logik in getTileExits(). */
export const TILE_TYPE = Object.freeze({
  STRAIGHT: 'straight', // durchgehend, zwei gegenüberliegende Ports
  CORNER:   'corner',   // Ecke, schließt N und E an (Rotation verschiebt)
  CORNER_M: 'corner_m', // Spiegel-Ecke, schließt N und W an
  T_JCT:    't_jct',    // T-Kreuzung, drei offene Ports
  X_CROSS:  'x_cross',  // Kreuzung mit zwei unabhängigen Kanälen (N↔S, E↔W)
  DEAD_END: 'dead_end', // Sackgasse, schluckt alle Signale
});

/** Logik-Gattertypen. evalGate() wertet sie aus. */
export const GATE_TYPE = Object.freeze({
  AND:  'AND',
  OR:   'OR',
  XOR:  'XOR',
  NAND: 'NAND',
  NOR:  'NOR',
});

// ---------------------------------------------------------------------------
// Board-Abmessungen und feste Koordinaten
// ---------------------------------------------------------------------------

export const ROWS = 5;
export const COLS = 5;
export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E'];
export const COL_LABELS = ['0', '1', '2', '3', '4'];

/** E1-Eingang: Signalursprung unter Reihe E, Spalte 0. */
export const INPUT_A = { row: 4, col: 0, enterFrom: DIR.S };
/** E2-Eingang: Signalursprung unter Reihe E, Spalte 4. */
export const INPUT_B = { row: 4, col: 4, enterFrom: DIR.S };
/** Ausgang: Signal verlässt das Board nach oben aus Reihe A, Spalte 3. */
export const OUTPUT  = { row: 0, col: 3, exitTo: DIR.N };

// ---------------------------------------------------------------------------
// Richtungs-Helfer
// ---------------------------------------------------------------------------

/** Zeilendelta je Richtung: N=-1, E=0, S=+1, W=0. */
export const DR  = [-1, 0, 1, 0];
/** Spaltendelta je Richtung: N=0, E=+1, S=0, W=-1. */
export const DC  = [0, 1, 0, -1];
/** Gegenrichtung: N↔S, E↔W. */
export const OPP = [2, 3, 0, 1];

// ---------------------------------------------------------------------------
// Zell-Fabriken
// ---------------------------------------------------------------------------

/** Erzeugt eine leere Gitterzelle (kein Kachelinhalt, kein Gatter). */
export function emptyCell() {
  return { kind: 'empty' };
}

/**
 * Erzeugt eine Kachel-Zelle.
 * @param {string}  tileType - TILE_TYPE-Konstante
 * @param {number}  rotation - Startrotation 0–3 (je 90° im Uhrzeigersinn)
 * @param {boolean} locked   - Gesperrt: kann nicht gedreht werden
 */
export function tileCell(tileType, rotation = 0, locked = false) {
  return { kind: 'tile', tileType, rotation: ((rotation % 4) + 4) % 4, locked };
}

/**
 * Erzeugt die linke oder rechte Hälfte einer Gatter-Zelle.
 * @param {'left'|'right'} side   - Seite des Gatters
 * @param {number}         gateId - Index in board.gates[]
 */
export function gateCell(side, gateId) {
  return { kind: side === 'left' ? 'gate_l' : 'gate_r', gateId };
}

// ---------------------------------------------------------------------------
// Board-Operationen
// ---------------------------------------------------------------------------

/** Erzeugt eine neue leere 5×5-Tafel. */
export function createBoard() {
  const cells = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, emptyCell)
  );
  return { cells, gates: [] };
}

/**
 * Platziert ein Gatter auf dem Board. Belegt zwei horizontale Zellen
 * an (row, col) und (row, col+1). Gibt die Gatter-ID zurück.
 * @throws {RangeError} wenn col+1 außerhalb der Tafeln liegt
 */
export function placeGate(board, row, col, gateType) {
  if (col < 0 || col + 1 >= COLS) {
    throw new RangeError(`Gatter bei (${row},${col}) überschreitet die Tafeln-Breite`);
  }
  const id = board.gates.length;
  board.gates.push({ id, type: gateType, row, col });
  board.cells[row][col]     = gateCell('left',  id);
  board.cells[row][col + 1] = gateCell('right', id);
  return id;
}

/**
 * Dreht eine Kachel um 90° im Uhrzeigersinn.
 * Gesperrte Kacheln bleiben unverändert.
 * @returns {number} neue Rotation (0–3)
 */
export function rotateTile(cell) {
  if (cell.kind !== 'tile' || cell.locked) return cell.rotation ?? 0;
  return (cell.rotation + 1) % 4;
}

/**
 * Gibt das Koordinaten-Label einer Zelle zurück (z. B. "B3").
 */
export function coordLabel(row, col) {
  return `${ROW_LABELS[row] ?? '?'}${COL_LABELS[col] ?? '?'}`;
}

/** Tiefer Klon eines Boards (Cells und Gates werden kopiert). */
export function cloneBoard(board) {
  return {
    cells: board.cells.map(row => row.map(cell => ({ ...cell }))),
    gates: board.gates.map(g  => ({ ...g })),
  };
}

// ---------------------------------------------------------------------------
// Signal-Simulation
// ---------------------------------------------------------------------------

/**
 * Gibt die Austrittsrichtungen einer Kachel bei gegebener Eintrittsrichtung zurück.
 * X_CROSS hat zwei unabhängige Kanäle; T_JCT teilt das Signal auf zwei Richtungen auf.
 * @param {string} tileType - TILE_TYPE-Konstante
 * @param {number} rotation - Rotation 0–3
 * @param {number} fromDir  - Eintrittsrichtung (DIR-Konstante)
 * @returns {number[]} Aktive Austrittsrichtungen; leer = Signal wird absorbiert
 */
export function getTileExits(tileType, rotation, fromDir) {
  const r = ((rotation % 4) + 4) % 4;
  switch (tileType) {
    case TILE_TYPE.STRAIGHT: {
      if (r % 2 === 0) {                        // rot 0,2: N↔S
        if (fromDir === DIR.N) return [DIR.S];
        if (fromDir === DIR.S) return [DIR.N];
      } else {                                   // rot 1,3: E↔W
        if (fromDir === DIR.E) return [DIR.W];
        if (fromDir === DIR.W) return [DIR.E];
      }
      return [];
    }
    case TILE_TYPE.CORNER: {
      // rot r verbindet Port r und (r+1)%4
      const a = r, b = (r + 1) % 4;
      if (fromDir === a) return [b];
      if (fromDir === b) return [a];
      return [];
    }
    case TILE_TYPE.CORNER_M: {
      // Spiegel-Variante: rot r verbindet Port (r+3)%4 und r
      const a = (r + 3) % 4, b = r;
      if (fromDir === a) return [b];
      if (fromDir === b) return [a];
      return [];
    }
    case TILE_TYPE.T_JCT: {
      // Geschlossener Port = (r+3)%4; Signal teilt sich auf die anderen zwei auf
      const closed = (r + 3) % 4;
      if (fromDir === closed) return [];
      return [DIR.N, DIR.E, DIR.S, DIR.W].filter(d => d !== fromDir && d !== closed);
    }
    case TILE_TYPE.X_CROSS: {
      // Zwei unabhängige Kanäle: N↔S und E↔W (kein Übersprechen)
      if (fromDir === DIR.N) return [DIR.S];
      if (fromDir === DIR.S) return [DIR.N];
      if (fromDir === DIR.E) return [DIR.W];
      if (fromDir === DIR.W) return [DIR.E];
      return [];
    }
    case TILE_TYPE.DEAD_END:
    default:
      return [];
  }
}

/**
 * Wertet ein Logik-Gatter aus.
 * @param {string} gateType - GATE_TYPE-Konstante
 * @param {0|1}    a        - Eingang A
 * @param {0|1}    b        - Eingang B
 * @returns {0|1} Ausgangswert
 */
export function evalGate(gateType, a, b) {
  switch (gateType) {
    case GATE_TYPE.AND:  return a & b;
    case GATE_TYPE.OR:   return a | b;
    case GATE_TYPE.XOR:  return a ^ b;
    case GATE_TYPE.NAND: return 1 - (a & b);
    case GATE_TYPE.NOR:  return 1 - (a | b);
    default: return 0;
  }
}

/**
 * BFS-Signalverfolgung über das Board.
 *
 * Gibt zurück:
 *   reached     – true wenn Signal den Ausgang verlässt
 *   value       – Ausgangswert 0|1 (oder -1 wenn nicht erreicht)
 *   signalCells – Set aller besuchten "r,c"-Schlüssel
 *   signalOrder – BFS-Besuchsreihenfolge [{row,col}] für die Animations-Zeitachse
 *   cellValues  – Map<"r,c", 0|1>  letzter Eingangswert je besuchter Zelle (Debug)
 *   cellExits   – Map<"r,c", DIR[]> aktive Ausgangsrichtungen je Zelle (Debug)
 *   cellEntries – Map<"r,c", DIR[]> aktive Eingangsrichtungen je Zelle (Debug)
 *   loopCells   – Set<"r,c"> Zellen, in denen ein Signalzyklus erkannt wurde (Debug)
 *
 * @param {{ cells: Cell[][], gates: Gate[] }} board
 * @param {0|1} inputA - Wert am E1-Eingang
 * @param {0|1} inputB - Wert am E2-Eingang
 */
export function evalBoard(board, inputA, inputB) {
  const queue       = [];
  const visited     = new Set();
  const signalCells = new Set();
  const signalOrder = [];
  const gateInputs  = board.gates.map(() => ({ a: null, b: null }));

  // Debug-Maps – günstig im BFS mitzuführen, Aufrufer kann sie ignorieren
  const cellValues  = new Map(); // "r,c" → letzter Eingangssignalwert
  const cellExits   = new Map(); // "r,c" → DIR[] aktive Ausgänge
  const cellEntries = new Map(); // "r,c" → DIR[] aktive Eingänge
  const loopCells   = new Set(); // "r,c" mit erkanntem Zyklus

  let outputValue = -1;

  const push = (row, col, fromDir, value) => {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    queue.push({ row, col, fromDir, value });
  };

  push(INPUT_A.row, INPUT_A.col, DIR.S, inputA);
  push(INPUT_B.row, INPUT_B.col, DIR.S, inputB);

  while (queue.length > 0) {
    const { row, col, fromDir, value } = queue.shift();
    const key = `${row},${col},${fromDir}`;

    if (visited.has(key)) {
      // Zyklus: dieses (Zelle, Richtung)-Paar wurde bereits besucht
      loopCells.add(`${row},${col}`);
      continue;
    }
    visited.add(key);

    const cell = board.cells[row][col];
    if (!cell || cell.kind === 'empty') continue;

    const ck = `${row},${col}`;
    if (!signalCells.has(ck)) signalOrder.push({ row, col });
    signalCells.add(ck);
    cellValues.set(ck, value);

    // Eingangsrichtung merken
    const ents = cellEntries.get(ck) || [];
    if (!ents.includes(fromDir)) ents.push(fromDir);
    cellEntries.set(ck, ents);

    if (cell.kind === 'gate_l') {
      if (fromDir !== DIR.S) continue; // Gatter akzeptiert Signal nur von unten
      gateInputs[cell.gateId].a = value;
      const gi = gateInputs[cell.gateId];
      if (gi.a !== null && gi.b !== null) {
        const out = evalGate(board.gates[cell.gateId].type, gi.a, gi.b);
        // Ausgangsrichtung N an der gate_l-Zelle merken
        const exits = cellExits.get(ck) || [];
        exits.push(DIR.N);
        cellExits.set(ck, exits);
        push(row - 1, col, DIR.S, out);
      }
      continue;
    }

    if (cell.kind === 'gate_r') {
      if (fromDir !== DIR.S) continue;
      gateInputs[cell.gateId].b = value;
      const gi = gateInputs[cell.gateId];
      if (gi.a !== null && gi.b !== null) {
        const out = evalGate(board.gates[cell.gateId].type, gi.a, gi.b);
        push(row - 1, col - 1, DIR.S, out); // Ausgang an gate_l (col-1)
      }
      continue;
    }

    const exits = getTileExits(cell.tileType, cell.rotation, fromDir);
    const activeDirs = cellExits.get(ck) || [];
    for (const exitDir of exits) {
      activeDirs.push(exitDir);
      if (row === OUTPUT.row && col === OUTPUT.col && exitDir === OUTPUT.exitTo) {
        outputValue = value;
        continue; // Ausgang erreicht – nicht weiter verfolgen
      }
      push(row + DR[exitDir], col + DC[exitDir], OPP[exitDir], value);
    }
    if (activeDirs.length > 0) cellExits.set(ck, activeDirs);
  }

  return {
    reached: outputValue !== -1,
    value:   outputValue,
    signalCells,
    signalOrder,
    cellValues,
    cellExits,
    cellEntries,
    loopCells,
  };
}

// ---------------------------------------------------------------------------
// Board-Solver
// ---------------------------------------------------------------------------

// Kanonische Rotationen: STRAIGHT hat 2 (0/2 und 1/3 sind identisch),
// X_CROSS und DEAD_END brauchen nur 1, alle anderen 4.
function canonicalRotations(cell) {
  const r = ((cell.rotation % 4) + 4) % 4;
  if (cell.locked) return [r];
  switch (cell.tileType) {
    case TILE_TYPE.STRAIGHT:              return [0, 1];
    case TILE_TYPE.X_CROSS:
    case TILE_TYPE.DEAD_END:              return [0];
    case TILE_TYPE.CORNER:
    case TILE_TYPE.CORNER_M:
    case TILE_TYPE.T_JCT:                return [0, 1, 2, 3];
    default:                              return [r];
  }
}

function validBoardOutput(board, inputA, inputB, target) {
  const res = evalBoard(board, inputA, inputB);
  return res.reached && res.value === target;
}

/**
 * Enumeriert alle kanonischen Lösungen für die gegebene Tafel.
 * Verändert die Eingabe-Tafel nicht; jede Lösung ist ein Board-Klon
 * mit zusätzlichem `rotations`-Array.
 *
 * Optionen:
 *   maxSolutions – maximale Anzahl gespeicherter Lösungen (Default: Infinity)
 *   maxStates    – Abbruch nach so vielen geprüften Zuständen (Default: Infinity)
 *
 * Rückgabe:
 *   solvable     – mindestens eine Lösung gefunden
 *   unique       – genau eine Lösung (und Suche vollständig)
 *   solutionCount
 *   complete     – Suche nicht durch maxStates abgebrochen
 *   checked      – Anzahl geprüfter Zustände
 *   solutions    – Array von Board-Klonen mit .rotations
 */
export function enumerateBoardSolutions(board, inputA, inputB, target, options = {}) {
  const maxSolutions = options.maxSolutions == null ? Infinity : Math.max(0, options.maxSolutions);
  const maxStates    = options.maxStates    == null ? Infinity : Math.max(0, options.maxStates);
  const work = cloneBoard(board);
  const variables = [];
  let checked = 0;
  let stopped = false;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = work.cells[r][c];
      if (!cell || cell.kind !== 'tile' || cell.locked) continue;
      const rotations = canonicalRotations(cell);
      if (rotations.length > 1) variables.push({ row: r, col: c, rotations });
      else cell.rotation = rotations[0];
    }
  }

  const solutions = [];

  function captureSolution() {
    const solution = cloneBoard(work);
    solution.rotations = variables.map(({ row, col }) => ({
      row, col, rotation: solution.cells[row][col].rotation,
    }));
    solutions.push(solution);
    if (solutions.length >= maxSolutions) stopped = true;
  }

  function search(index) {
    if (stopped) return;
    if (checked >= maxStates) { stopped = true; return; }
    if (index >= variables.length) {
      checked += 1;
      if (validBoardOutput(work, inputA, inputB, target)) captureSolution();
      return;
    }
    const { row, col, rotations } = variables[index];
    const cell = work.cells[row][col];
    const original = cell.rotation;
    for (const rot of rotations) {
      cell.rotation = rot;
      search(index + 1);
      if (stopped) break;
    }
    cell.rotation = original;
  }

  if (maxSolutions > 0 && maxStates > 0) search(0);

  return {
    solvable:      solutions.length > 0,
    unique:        !stopped && solutions.length === 1,
    solutionCount: solutions.length,
    complete:      !stopped,
    checked,
    solutions,
  };
}

/** Prüft, ob mindestens eine Lösung existiert. */
export function isBoardSolvable(board, inputA, inputB, target, options = {}) {
  return enumerateBoardSolutions(board, inputA, inputB, target, {
    ...options, maxSolutions: 1,
  }).solvable;
}

/** Prüft, ob genau eine Lösung existiert. */
export function hasUniqueBoardSolution(board, inputA, inputB, target, options = {}) {
  const result = enumerateBoardSolutions(board, inputA, inputB, target, {
    ...options, maxSolutions: 2,
  });
  return result.complete && result.solutionCount === 1;
}

// ---------------------------------------------------------------------------
// Level-Generierung – interne Helfer
// ---------------------------------------------------------------------------

const T = TILE_TYPE;

function pt(board, pk, r, c, type, rot) {
  board.cells[r][c] = tileCell(type, rot);
  pk.add(`${r},${c}`);
}

function addGate(board, pk, row, col, gateType) {
  placeGate(board, row, col, gateType);
  pk.add(`${row},${col}`); pk.add(`${row},${col + 1}`);
}

// Ablenkerkacheln in leere Nicht-Pfad-Zellen einfüllen (alle gesperrt).
function fillDistractors(board, pk, rng, types) {
  const dt = types || [T.STRAIGHT, T.CORNER, T.DEAD_END];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board.cells[r][c].kind !== 'empty') continue;
      if (pk.has(`${r},${c}`)) continue;
      board.cells[r][c] = tileCell(
        dt[Math.floor(rng() * dt.length)],
        Math.floor(rng() * 4),
        true, // Ablenker sind immer gesperrt
      );
    }
  }
}

function shuffleInPlace(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Anzahl spielbarer (drehbarer) Pfad-Kacheln je Stufe.
function playableTargetCount(level) {
  if (level <= 1) return 4;
  if (level === 2) return 5;
  return 6;
}

// Alle Kacheln sperren, dann eine zufällige Auswahl der Pfad-Kacheln freischalten.
// Ablenker bleiben immer gesperrt → Eindeutigkeit der Lösung ist auf Pfad-Kacheln beschränkt.
function lockBoardAndChoosePlayable(board, pk, level, rng) {
  const candidates = [];
  for (const key of pk) {
    const [r, c] = key.split(',').map(Number);
    const cell = board.cells[r]?.[c];
    if (cell && cell.kind === 'tile' && canonicalRotations(cell).length > 1) {
      candidates.push({ row: r, col: c });
    }
  }

  // Erst alle Kacheln sperren…
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board.cells[r][c];
      if (cell.kind === 'tile') cell.locked = true;
    }
  }

  // …dann die spielbaren Kandidaten freischalten
  shuffleInPlace(candidates, rng);
  const count = Math.min(candidates.length, playableTargetCount(level));
  for (let i = 0; i < count; i++) {
    board.cells[candidates[i].row][candidates[i].col].locked = false;
  }
}

// Freigeschaltete Kacheln von der Lösungsrotation wegdrehen (Startzustand für Spieler).
function scrambleBoard(board, rng) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board.cells[r][c];
      if (cell.kind !== 'tile' || cell.locked) continue;
      const rotations = canonicalRotations(cell);
      if (rotations.length <= 1) continue;
      const current = ((cell.rotation % 4) + 4) % 4;
      const alternatives = rotations.filter(rot => rot !== current);
      cell.rotation = alternatives[Math.floor(rng() * alternatives.length)];
    }
  }
}

// ---------------------------------------------------------------------------
// Pfad-Vorlagen
// ---------------------------------------------------------------------------

// Stufe 1 – nur Wegleitung von INPUT_A zum Ausgang, kein Gatter.
const L1 = [
  // Vorlage 0: gerade linke Seite, oben nach rechts
  (board, pk) => {
    pt(board, pk, 4, 0, T.STRAIGHT, 0);
    pt(board, pk, 3, 0, T.STRAIGHT, 0);
    pt(board, pk, 2, 0, T.STRAIGHT, 0);
    pt(board, pk, 1, 0, T.STRAIGHT, 0);
    pt(board, pk, 0, 0, T.CORNER,   1);   // S→E
    pt(board, pk, 0, 1, T.STRAIGHT, 1);
    pt(board, pk, 0, 2, T.STRAIGHT, 1);
    pt(board, pk, 0, 3, T.CORNER,   3);   // W→N → AUSGANG
    pt(board, pk, 4, 4, T.DEAD_END, 0);
  },
  // Vorlage 1: hoch bis Reihe 2, rechts bis Spalte 3, hoch zum Ausgang
  (board, pk) => {
    pt(board, pk, 4, 0, T.STRAIGHT, 0);
    pt(board, pk, 3, 0, T.STRAIGHT, 0);
    pt(board, pk, 2, 0, T.CORNER,   1);   // S→E
    pt(board, pk, 2, 1, T.STRAIGHT, 1);
    pt(board, pk, 2, 2, T.STRAIGHT, 1);
    pt(board, pk, 2, 3, T.CORNER,   3);   // W→N
    pt(board, pk, 1, 3, T.STRAIGHT, 0);
    pt(board, pk, 0, 3, T.STRAIGHT, 0);   // → AUSGANG
    pt(board, pk, 4, 4, T.DEAD_END, 0);
  },
  // Vorlage 2: Zickzack
  (board, pk) => {
    pt(board, pk, 4, 0, T.STRAIGHT, 0);
    pt(board, pk, 3, 0, T.CORNER,   1);   // S→E
    pt(board, pk, 3, 1, T.CORNER,   3);   // W→N
    pt(board, pk, 2, 1, T.CORNER,   1);   // S→E
    pt(board, pk, 2, 2, T.STRAIGHT, 1);
    pt(board, pk, 2, 3, T.CORNER,   3);   // W→N
    pt(board, pk, 1, 3, T.STRAIGHT, 0);
    pt(board, pk, 0, 3, T.STRAIGHT, 0);   // → AUSGANG
    pt(board, pk, 4, 4, T.DEAD_END, 0);
  },
];

// Stufen 2/3 – ein Gatter; Palettenbreite steigt mit der Stufe.
const L2 = [
  // Vorlage 0: Gatter bei (2,1)-(2,2)
  (board, pk, gateType) => {
    pt(board, pk, 4, 0, T.STRAIGHT, 0);
    pt(board, pk, 3, 0, T.CORNER,   1);
    pt(board, pk, 3, 1, T.CORNER,   3);
    addGate(board, pk, 2, 1, gateType);
    pt(board, pk, 4, 4, T.STRAIGHT, 0);
    pt(board, pk, 3, 4, T.CORNER,   2);
    pt(board, pk, 3, 3, T.STRAIGHT, 1);
    pt(board, pk, 3, 2, T.CORNER,   0);
    pt(board, pk, 1, 1, T.STRAIGHT, 0);
    pt(board, pk, 0, 1, T.CORNER,   1);
    pt(board, pk, 0, 2, T.STRAIGHT, 1);
    pt(board, pk, 0, 3, T.CORNER,   3);   // → AUSGANG
  },
  // Vorlage 1: Gatter bei (3,2)-(3,3)
  (board, pk, gateType) => {
    pt(board, pk, 4, 0, T.CORNER,   1);
    pt(board, pk, 4, 1, T.STRAIGHT, 1);
    pt(board, pk, 4, 2, T.CORNER,   3);
    addGate(board, pk, 3, 2, gateType);
    pt(board, pk, 4, 4, T.CORNER,   2);
    pt(board, pk, 4, 3, T.CORNER,   0);
    pt(board, pk, 2, 2, T.STRAIGHT, 0);
    pt(board, pk, 1, 2, T.CORNER,   1);
    pt(board, pk, 1, 3, T.CORNER,   3);
    pt(board, pk, 0, 3, T.STRAIGHT, 0);   // → AUSGANG
  },
];

// Stufe 3 – gleiche Topologie wie Stufe 2, aber längerer Ausgangspfad.
const L3 = [
  // Vorlage 0: Gatter bei (2,1)-(2,2)
  (board, pk, gateType) => {
    pt(board, pk, 4, 0, T.STRAIGHT, 0);
    pt(board, pk, 3, 0, T.CORNER,   1);
    pt(board, pk, 3, 1, T.CORNER,   3);
    addGate(board, pk, 2, 1, gateType);
    pt(board, pk, 4, 4, T.STRAIGHT, 0);
    pt(board, pk, 3, 4, T.CORNER,   2);
    pt(board, pk, 3, 3, T.STRAIGHT, 1);
    pt(board, pk, 3, 2, T.CORNER,   0);
    pt(board, pk, 1, 1, T.CORNER,   2);
    pt(board, pk, 1, 0, T.CORNER,   0);
    pt(board, pk, 0, 0, T.CORNER,   1);
    pt(board, pk, 0, 1, T.STRAIGHT, 1);
    pt(board, pk, 0, 2, T.STRAIGHT, 1);
    pt(board, pk, 0, 3, T.CORNER,   3);   // → AUSGANG
  },
  // Vorlage 1: Gatter bei (3,2)-(3,3)
  (board, pk, gateType) => {
    pt(board, pk, 4, 0, T.CORNER,   1);
    pt(board, pk, 4, 1, T.STRAIGHT, 1);
    pt(board, pk, 4, 2, T.CORNER,   3);
    addGate(board, pk, 3, 2, gateType);
    pt(board, pk, 4, 4, T.CORNER,   2);
    pt(board, pk, 4, 3, T.CORNER,   0);
    pt(board, pk, 2, 2, T.CORNER,   2);
    pt(board, pk, 2, 1, T.CORNER,   0);
    pt(board, pk, 1, 1, T.CORNER,   1);
    pt(board, pk, 1, 2, T.STRAIGHT, 1);
    pt(board, pk, 1, 3, T.CORNER,   3);
    pt(board, pk, 0, 3, T.STRAIGHT, 0);   // → AUSGANG
  },
];

// Stufe 3 – zwei Gatter: out = G1(G0(E1,E2), E2).
const L3_TWO_GATE = [
  (board, pk, gateA, gateB) => {
    // E1 → gateA links
    pt(board, pk, 4, 0, T.CORNER,   1);
    pt(board, pk, 4, 1, T.CORNER,   3);
    addGate(board, pk, 3, 1, gateA);

    // E2 wird geteilt: ein Ast zu gateA rechts, ein Ast zu gateB rechts
    pt(board, pk, 4, 4, T.CORNER,   2);
    pt(board, pk, 4, 3, T.T_JCT,    3);
    pt(board, pk, 4, 2, T.CORNER,   0);
    pt(board, pk, 3, 3, T.STRAIGHT, 0);
    pt(board, pk, 2, 3, T.CORNER,   2);
    pt(board, pk, 2, 2, T.CORNER,   0);

    // gateA-Ausgang → gateB links
    pt(board, pk, 2, 1, T.STRAIGHT, 0);
    addGate(board, pk, 1, 1, gateB);

    // gateB-Ausgang → Ausgang
    pt(board, pk, 0, 1, T.CORNER,   1);
    pt(board, pk, 0, 2, T.STRAIGHT, 1);
    pt(board, pk, 0, 3, T.CORNER,   3);
  },
];

const GATE_PALETTES = {
  2: [GATE_TYPE.AND, GATE_TYPE.OR, GATE_TYPE.XOR],
  3: [GATE_TYPE.AND, GATE_TYPE.OR, GATE_TYPE.XOR, GATE_TYPE.NAND, GATE_TYPE.NOR],
};

const MAX_GENERATION_ATTEMPTS = 120;

function pickRandom(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function buildCandidateBoard(level, rng) {
  const board = createBoard();
  const pk = new Set();
  const gateTypes = [];
  let inputA = 1;
  let inputB = 0;

  if (level === 1) {
    pickRandom(L1, rng)(board, pk);
  } else {
    const palette = GATE_PALETTES[level === 3 ? 3 : 2];
    inputA = Math.floor(rng() * 2);
    inputB = Math.floor(rng() * 2);

    if (level >= 3 && rng() < 0.45) {
      gateTypes.push(pickRandom(palette, rng), pickRandom(palette, rng));
      pickRandom(L3_TWO_GATE, rng)(board, pk, gateTypes[0], gateTypes[1]);
    } else {
      gateTypes.push(pickRandom(palette, rng));
      const templates = level === 3 ? L3 : L2;
      pickRandom(templates, rng)(board, pk, gateTypes[0]);
    }
  }

  const distTypes = level >= 3
    ? [T.STRAIGHT, T.CORNER, T.CORNER_M, T.T_JCT, T.X_CROSS, T.DEAD_END]
    : [T.STRAIGHT, T.CORNER, T.DEAD_END];
  fillDistractors(board, pk, rng, distTypes);
  lockBoardAndChoosePlayable(board, pk, level, rng);

  return { board, inputA, inputB, gateTypes };
}

function validateGeneratedBoard(board, inputA, inputB) {
  const out = evalBoard(board, inputA, inputB);
  if (!out.reached) return null;

  const solver = enumerateBoardSolutions(board, inputA, inputB, out.value, { maxSolutions: 2 });
  if (!solver.complete || solver.solutionCount !== 1) return null;

  const solutionBoard = cloneBoard(solver.solutions[0]);
  const check = evalBoard(solutionBoard, inputA, inputB);
  if (!check.reached || check.value !== out.value) return null;

  return { solutionBoard, target: out.value };
}

/**
 * Erzeugt eine vollständige Aufgabe für das Bordcomputer-Mini-Spiel.
 *
 * Rückgabe:
 *   board               – verschlungene Spielertafel (freie Kacheln sind verdreht)
 *   solutionBoard       – Tafel mit Lösungsrotationen
 *   inputA, inputB      – Eingangswerte (0 oder 1)
 *   target              – erwarteter Ausgangswert
 *   gateType            – Gattertyp-String (z. B. "AND" oder "AND+XOR") oder null
 *   gateTypes           – Array der einzelnen Gattertypen
 *   generationAttempts  – Anzahl der benötigten Generierungsversuche
 *
 * @param {1|2|3} level      - Schwierigkeitsstufe
 * @param {()=>number} rng   - deterministischer Zufallsgenerator (mulberry32)
 * @param {{ maxAttempts?: number }} options
 * @throws {Error} wenn nach maxAttempts keine eindeutige Lösung gefunden wurde
 */
export function generateBoard(level, rng, options = {}) {
  const lvl = Math.max(1, Math.min(3, level));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts || MAX_GENERATION_ATTEMPTS));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = buildCandidateBoard(lvl, rng);
    const valid = validateGeneratedBoard(candidate.board, candidate.inputA, candidate.inputB);
    if (!valid) continue;

    const board = cloneBoard(valid.solutionBoard);
    scrambleBoard(board, rng);
    const gateType = candidate.gateTypes.length ? candidate.gateTypes.join('+') : null;
    return {
      board,
      solutionBoard: valid.solutionBoard,
      inputA: candidate.inputA,
      inputB: candidate.inputB,
      target: valid.target,
      gateType,
      gateTypes: candidate.gateTypes,
      generationAttempts: attempt,
    };
  }

  throw new Error(`Kein eindeutiges Bordcomputer-Board nach ${maxAttempts} Versuchen erzeugt`);
}

// ---------------------------------------------------------------------------
// Entwicklungs-Testtafel
// ---------------------------------------------------------------------------

/**
 * Baut eine Tafel mit allen sechs Kacheltypen und einem Beispiel-Gatter.
 * Dient der visuellen Entwicklung; stellt alle Rotationen sichtbar dar.
 * Nicht für den Spielbetrieb geeignet.
 */
export function createTestBoard() {
  const board = createBoard();
  const { cells } = board;

  // Reihe A (0): Gerade in beiden Orientierungen, drei Ecken
  cells[0][0] = tileCell(T.STRAIGHT, 0);
  cells[0][1] = tileCell(T.STRAIGHT, 1);
  cells[0][2] = tileCell(T.CORNER,   0);
  cells[0][3] = tileCell(T.CORNER,   1);
  cells[0][4] = tileCell(T.CORNER,   2);

  // Reihe B (1): letzte Ecke, alle vier Spiegel-Ecken
  cells[1][0] = tileCell(T.CORNER,   3);
  cells[1][1] = tileCell(T.CORNER_M, 0);
  cells[1][2] = tileCell(T.CORNER_M, 1);
  cells[1][3] = tileCell(T.CORNER_M, 2);
  cells[1][4] = tileCell(T.CORNER_M, 3);

  // Reihe C (2): vier T-Kreuzungen, eine X-Kreuzung
  cells[2][0] = tileCell(T.T_JCT,   0);
  cells[2][1] = tileCell(T.T_JCT,   1);
  cells[2][2] = tileCell(T.T_JCT,   2);
  cells[2][3] = tileCell(T.T_JCT,   3);
  cells[2][4] = tileCell(T.X_CROSS, 0);

  // Reihe D (3): vier Sackgassen, eine gesperrte Gerade
  cells[3][0] = tileCell(T.DEAD_END, 0);
  cells[3][1] = tileCell(T.DEAD_END, 1);
  cells[3][2] = tileCell(T.DEAD_END, 2);
  cells[3][3] = tileCell(T.DEAD_END, 3);
  cells[3][4] = tileCell(T.STRAIGHT, 0, true);

  // Reihe E (4): Eingangs-Kacheln, Gatter in der Mitte
  cells[4][0] = tileCell(T.STRAIGHT, 0);
  cells[4][1] = tileCell(T.CORNER,   3);
  placeGate(board, 4, 2, GATE_TYPE.AND);
  cells[4][4] = tileCell(T.STRAIGHT, 0);

  return board;
}
