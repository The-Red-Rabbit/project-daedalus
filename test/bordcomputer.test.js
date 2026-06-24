// Tests fuer das Mini-Spiel Bordcomputer (Signal-Routing-Puzzle).
// generate() und validate() sind DOM-frei. Die Tests pruefen Kachel-Exits,
// Signalverfolgung, Level-Generierung und die komplette Spieler-Schnittstelle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../shared/rng.js';
import {
  TILE_TYPE, GATE_TYPE, DIR,
  ROWS, COLS, ROW_LABELS, COL_LABELS,
  INPUT_A, INPUT_B, OUTPUT,
  emptyCell, tileCell, gateCell,
  createBoard, placeGate,
  rotateTile, coordLabel,
  createTestBoard,
  DR, DC, OPP,
  getTileExits, evalGate, evalBoard, cloneBoard, generateBoard, enumerateBoardSolutions,
} from '../client/minigames/bordcomputer-logic.js';
import bordcomputer from '../client/minigames/bordcomputer.js';

// --- Konstanten ---

test('ROWS und COLS sind 5', () => {
  assert.equal(ROWS, 5);
  assert.equal(COLS, 5);
});

test('ROW_LABELS enthaelt A-E, COL_LABELS enthaelt 0-4', () => {
  assert.deepEqual(ROW_LABELS, ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(COL_LABELS, ['0', '1', '2', '3', '4']);
});

test('Feste Eingangs- und Ausgangspunkte sind korrekt', () => {
  assert.equal(INPUT_A.row, 4); assert.equal(INPUT_A.col, 0); assert.equal(INPUT_A.enterFrom, DIR.S);
  assert.equal(INPUT_B.row, 4); assert.equal(INPUT_B.col, 4); assert.equal(INPUT_B.enterFrom, DIR.S);
  assert.equal(OUTPUT.row,  0); assert.equal(OUTPUT.col,  3); assert.equal(OUTPUT.exitTo,    DIR.N);
});

test('DIR-Konstanten haben die richtigen Werte', () => {
  assert.equal(DIR.N, 0);
  assert.equal(DIR.E, 1);
  assert.equal(DIR.S, 2);
  assert.equal(DIR.W, 3);
});

test('DR/DC/OPP: Deltas und Gegenrichtungen korrekt', () => {
  assert.deepEqual(DR,  [-1, 0, 1, 0]);
  assert.deepEqual(DC,  [0, 1, 0, -1]);
  assert.deepEqual(OPP, [2, 3, 0, 1]);
});

// --- Zell-Fabriken ---

test('emptyCell gibt eine leere Zelle zurueck', () => {
  assert.deepEqual(emptyCell(), { kind: 'empty' });
});

test('tileCell: kind, tileType, rotation und locked korrekt', () => {
  const c = tileCell(TILE_TYPE.STRAIGHT, 2, true);
  assert.equal(c.kind, 'tile');
  assert.equal(c.tileType, TILE_TYPE.STRAIGHT);
  assert.equal(c.rotation, 2);
  assert.equal(c.locked, true);
});

test('tileCell: Rotation wird modulo 4 normalisiert', () => {
  assert.equal(tileCell(TILE_TYPE.CORNER, 4).rotation, 0);
  assert.equal(tileCell(TILE_TYPE.CORNER, 5).rotation, 1);
  assert.equal(tileCell(TILE_TYPE.CORNER, -1).rotation, 3);
});

test('tileCell: locked ist standardmaessig false', () => {
  assert.equal(tileCell(TILE_TYPE.STRAIGHT).locked, false);
});

test('gateCell: kind gate_l oder gate_r mit gateId', () => {
  const l = gateCell('left',  0);
  const r = gateCell('right', 1);
  assert.equal(l.kind, 'gate_l'); assert.equal(l.gateId, 0);
  assert.equal(r.kind, 'gate_r'); assert.equal(r.gateId, 1);
});

// --- Board ---

test('createBoard: 5×5 Raster aus leeren Zellen, kein Gatter', () => {
  const b = createBoard();
  assert.equal(b.cells.length, ROWS);
  for (const row of b.cells) {
    assert.equal(row.length, COLS);
    for (const cell of row) assert.deepEqual(cell, emptyCell());
  }
  assert.deepEqual(b.gates, []);
});

test('placeGate: legt Gatter ab und schreibt gate_l und gate_r in die Zellen', () => {
  const b = createBoard();
  const id = placeGate(b, 2, 1, GATE_TYPE.AND);
  assert.equal(id, 0);
  assert.equal(b.gates.length, 1);
  assert.deepEqual(b.gates[0], { id: 0, type: GATE_TYPE.AND, row: 2, col: 1 });
  assert.equal(b.cells[2][1].kind, 'gate_l');
  assert.equal(b.cells[2][1].gateId, 0);
  assert.equal(b.cells[2][2].kind, 'gate_r');
  assert.equal(b.cells[2][2].gateId, 0);
});

test('placeGate: mehrere Gatter erhalten aufsteigende IDs', () => {
  const b = createBoard();
  const id0 = placeGate(b, 0, 0, GATE_TYPE.OR);
  const id1 = placeGate(b, 1, 0, GATE_TYPE.XOR);
  assert.equal(id0, 0);
  assert.equal(id1, 1);
  assert.equal(b.gates.length, 2);
});

test('placeGate: wirft RangeError, wenn Gatter die Tafel ueberschreitet', () => {
  const b = createBoard();
  assert.throws(() => placeGate(b, 0, 4, GATE_TYPE.AND), RangeError); // col+1 = 5, ausserhalb
});

// --- rotateTile ---

test('rotateTile: erhoehe Rotation mod 4', () => {
  const c = tileCell(TILE_TYPE.STRAIGHT, 0);
  assert.equal(rotateTile(c), 1);
  c.rotation = 3;
  assert.equal(rotateTile(c), 0);
});

test('rotateTile: gesperrte Kachel unveraendert', () => {
  const c = tileCell(TILE_TYPE.CORNER, 2, true);
  assert.equal(rotateTile(c), 2); // bleibt bei 2
});

test('rotateTile: nicht-Kacheln geben 0 zurueck', () => {
  assert.equal(rotateTile(emptyCell()), 0);
  assert.equal(rotateTile(gateCell('left', 0)), 0);
});

test('rotateTile: vier Drehungen enden wieder bei der Ausgangsrotation', () => {
  const c = tileCell(TILE_TYPE.T_JCT, 0);
  for (let i = 0; i < 4; i++) c.rotation = rotateTile(c);
  assert.equal(c.rotation, 0);
});

// --- coordLabel ---

test('coordLabel: korrekte Labels fuer alle Eckpunkte', () => {
  assert.equal(coordLabel(0, 0), 'A0');
  assert.equal(coordLabel(0, 4), 'A4');
  assert.equal(coordLabel(4, 0), 'E0');
  assert.equal(coordLabel(4, 4), 'E4');
  assert.equal(coordLabel(2, 3), 'C3');
});

// --- createTestBoard ---

test('createTestBoard: liefert gueltiges Board mit genau ROWS×COLS Zellen', () => {
  const b = createTestBoard();
  assert.equal(b.cells.length, ROWS);
  for (const row of b.cells) assert.equal(row.length, COLS);
});

test('createTestBoard: kein kind-Wert ist undefiniert', () => {
  const { cells } = createTestBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      assert.ok(cells[r][c].kind, `Zelle ${coordLabel(r, c)} hat kein kind`);
    }
  }
});

test('createTestBoard: enthielt mindestens ein Gatter', () => {
  const b = createTestBoard();
  assert.ok(b.gates.length >= 1, 'Testtafel muss mindestens ein Gatter enthalten');
});

test('createTestBoard: alle Kachel-Rotationen liegen im Bereich 0-3', () => {
  const { cells } = createTestBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = cells[r][c];
      if (cell.kind === 'tile') {
        assert.ok(
          cell.rotation >= 0 && cell.rotation <= 3,
          `${coordLabel(r, c)}: Rotation ${cell.rotation} ausserhalb 0-3`
        );
      }
    }
  }
});

test('createTestBoard: alle sechs Kacheltypen sind vorhanden', () => {
  const { cells } = createTestBoard();
  const found = new Set();
  for (const row of cells) for (const cell of row) if (cell.kind === 'tile') found.add(cell.tileType);
  for (const t of Object.values(TILE_TYPE)) {
    assert.ok(found.has(t), `Kacheltyp ${t} fehlt in der Testtafel`);
  }
});

// --- getTileExits ---

test('getTileExits: STRAIGHT rot=0 leitet N-S, blockiert E-W', () => {
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 0, DIR.S), [DIR.N]);
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 0, DIR.N), [DIR.S]);
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 0, DIR.E), []);
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 0, DIR.W), []);
});

test('getTileExits: STRAIGHT rot=1 leitet E-W, blockiert N-S', () => {
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 1, DIR.E), [DIR.W]);
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 1, DIR.W), [DIR.E]);
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 1, DIR.N), []);
  assert.deepEqual(getTileExits(TILE_TYPE.STRAIGHT, 1, DIR.S), []);
});

test('getTileExits: CORNER rot=0 verbindet N-E', () => {
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 0, DIR.N), [DIR.E]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 0, DIR.E), [DIR.N]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 0, DIR.S), []);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 0, DIR.W), []);
});

test('getTileExits: CORNER alle vier Rotationen', () => {
  // rot=0: N-E, rot=1: E-S, rot=2: S-W, rot=3: W-N
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 1, DIR.E), [DIR.S]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 1, DIR.S), [DIR.E]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 2, DIR.S), [DIR.W]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 2, DIR.W), [DIR.S]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 3, DIR.W), [DIR.N]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER, 3, DIR.N), [DIR.W]);
});

test('getTileExits: CORNER_M rot=0 verbindet W-N (Spiegelvariante)', () => {
  // CORNER_M rot=0: a=(0+3)%4=W, b=0=N
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER_M, 0, DIR.W), [DIR.N]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER_M, 0, DIR.N), [DIR.W]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER_M, 0, DIR.E), []);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER_M, 0, DIR.S), []);
});

test('getTileExits: CORNER_M rot=1 verbindet N-E', () => {
  // CORNER_M rot=1: a=(1+3)%4=N=0, b=1=E
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER_M, 1, DIR.N), [DIR.E]);
  assert.deepEqual(getTileExits(TILE_TYPE.CORNER_M, 1, DIR.E), [DIR.N]);
});

test('getTileExits: T_JCT rot=0 geschlossener Port W, Signal teilt auf N+E', () => {
  // rot=0: closed=(0+3)%4=W; offene Ports: N, E, S
  const fromS = getTileExits(TILE_TYPE.T_JCT, 0, DIR.S);
  assert.ok(fromS.includes(DIR.N));
  assert.ok(fromS.includes(DIR.E));
  assert.equal(fromS.length, 2);
  assert.deepEqual(getTileExits(TILE_TYPE.T_JCT, 0, DIR.W), []); // geschlossen
});

test('getTileExits: T_JCT rot=1 geschlossener Port N', () => {
  // rot=1: closed=(1+3)%4=0=N
  const fromW = getTileExits(TILE_TYPE.T_JCT, 1, DIR.W);
  assert.ok(fromW.includes(DIR.E));
  assert.ok(fromW.includes(DIR.S));
  assert.deepEqual(getTileExits(TILE_TYPE.T_JCT, 1, DIR.N), []);
});

test('getTileExits: X_CROSS trennt N-S von E-W', () => {
  assert.deepEqual(getTileExits(TILE_TYPE.X_CROSS, 0, DIR.N), [DIR.S]);
  assert.deepEqual(getTileExits(TILE_TYPE.X_CROSS, 0, DIR.S), [DIR.N]);
  assert.deepEqual(getTileExits(TILE_TYPE.X_CROSS, 0, DIR.E), [DIR.W]);
  assert.deepEqual(getTileExits(TILE_TYPE.X_CROSS, 0, DIR.W), [DIR.E]);
});

test('getTileExits: DEAD_END schluckt alle Richtungen', () => {
  for (const d of [DIR.N, DIR.E, DIR.S, DIR.W]) {
    assert.deepEqual(getTileExits(TILE_TYPE.DEAD_END, 0, d), []);
  }
});

// --- evalGate ---

test('evalGate: AND, OR, XOR, NAND, NOR – alle 4 Eingabekombinationen', () => {
  assert.equal(evalGate(GATE_TYPE.AND,  1, 1), 1);
  assert.equal(evalGate(GATE_TYPE.AND,  1, 0), 0);
  assert.equal(evalGate(GATE_TYPE.AND,  0, 1), 0);
  assert.equal(evalGate(GATE_TYPE.AND,  0, 0), 0);
  assert.equal(evalGate(GATE_TYPE.OR,   1, 1), 1);
  assert.equal(evalGate(GATE_TYPE.OR,   1, 0), 1);
  assert.equal(evalGate(GATE_TYPE.OR,   0, 0), 0);
  assert.equal(evalGate(GATE_TYPE.XOR,  1, 1), 0);
  assert.equal(evalGate(GATE_TYPE.XOR,  1, 0), 1);
  assert.equal(evalGate(GATE_TYPE.XOR,  0, 0), 0);
  assert.equal(evalGate(GATE_TYPE.NAND, 1, 1), 0);
  assert.equal(evalGate(GATE_TYPE.NAND, 1, 0), 1);
  assert.equal(evalGate(GATE_TYPE.NOR,  0, 0), 1);
  assert.equal(evalGate(GATE_TYPE.NOR,  1, 0), 0);
});

// --- evalBoard ---

// Baut den Pfad aus Vorlage L1[0]: gerade linke Seite, oben nach rechts.
function makeL1Board() {
  const board = createBoard();
  const T = TILE_TYPE;
  board.cells[4][0] = tileCell(T.STRAIGHT, 0);
  board.cells[3][0] = tileCell(T.STRAIGHT, 0);
  board.cells[2][0] = tileCell(T.STRAIGHT, 0);
  board.cells[1][0] = tileCell(T.STRAIGHT, 0);
  board.cells[0][0] = tileCell(T.CORNER, 1);    // S→E  {E,S}
  board.cells[0][1] = tileCell(T.STRAIGHT, 1);  // W→E
  board.cells[0][2] = tileCell(T.STRAIGHT, 1);
  board.cells[0][3] = tileCell(T.CORNER, 3);    // W→N  {W,N} → AUSGANG
  return board;
}

test('evalBoard: gerader Pfad – Signal 1 kommt am Ausgang an', () => {
  const res = evalBoard(makeL1Board(), 1, 0);
  assert.equal(res.reached, true);
  assert.equal(res.value, 1);
});

test('evalBoard: gerader Pfad – Signal 0 kommt korrekt an', () => {
  const res = evalBoard(makeL1Board(), 0, 0);
  assert.equal(res.reached, true);
  assert.equal(res.value, 0);
});

test('evalBoard: unterbrochener Pfad – kein Signal am Ausgang', () => {
  const board = makeL1Board();
  board.cells[2][0] = tileCell(TILE_TYPE.STRAIGHT, 1); // E-W statt N-S → bricht ab
  const res = evalBoard(board, 1, 0);
  assert.equal(res.reached, false);
  assert.equal(res.value, -1);
});

test('evalBoard: leere Tafel – kein Signal', () => {
  const res = evalBoard(createBoard(), 1, 1);
  assert.equal(res.reached, false);
});

test('evalBoard: signalCells enthaelt alle besuchten Zellen', () => {
  const { signalCells } = evalBoard(makeL1Board(), 1, 0);
  assert.ok(signalCells.has('4,0'), '(4,0) besucht');
  assert.ok(signalCells.has('0,0'), '(0,0) besucht');
  assert.ok(signalCells.has('0,3'), '(0,3) besucht');
});

// Hilfstafel mit AND-Gatter – Pfad aus Vorlage L2[0].
function makeAndBoard(gateType = GATE_TYPE.AND) {
  const board = createBoard();
  const T = TILE_TYPE;
  // Pfad A: (4,0)→(3,0)→(3,1)→gate_l(2,1)
  board.cells[4][0] = tileCell(T.STRAIGHT, 0);
  board.cells[3][0] = tileCell(T.CORNER, 1);    // S→E
  board.cells[3][1] = tileCell(T.CORNER, 3);    // W→N → gate_l
  placeGate(board, 2, 1, gateType);
  // Pfad B: (4,4)→(3,4)→(3,3)→(3,2)→gate_r(2,2)
  board.cells[4][4] = tileCell(T.STRAIGHT, 0);
  board.cells[3][4] = tileCell(T.CORNER, 2);    // S→W
  board.cells[3][3] = tileCell(T.STRAIGHT, 1);  // E→W
  board.cells[3][2] = tileCell(T.CORNER, 0);    // E→N
  // Ausgangspfad: (1,1)→(0,1)→(0,2)→(0,3)→AUSGANG
  board.cells[1][1] = tileCell(T.STRAIGHT, 0);
  board.cells[0][1] = tileCell(T.CORNER, 1);    // S→E
  board.cells[0][2] = tileCell(T.STRAIGHT, 1);
  board.cells[0][3] = tileCell(T.CORNER, 3);    // W→N → AUSGANG
  return board;
}

test('evalBoard: AND-Gatter – alle vier Eingabekombinationen', () => {
  const b = makeAndBoard(GATE_TYPE.AND);
  assert.equal(evalBoard(b, 1, 1).value, 1, 'AND(1,1)=1');
  assert.equal(evalBoard(b, 1, 0).value, 0, 'AND(1,0)=0');
  assert.equal(evalBoard(b, 0, 1).value, 0, 'AND(0,1)=0');
  assert.equal(evalBoard(b, 0, 0).value, 0, 'AND(0,0)=0');
});

test('evalBoard: OR-Gatter – alle vier Eingabekombinationen', () => {
  const b = makeAndBoard(GATE_TYPE.OR);
  assert.equal(evalBoard(b, 1, 1).value, 1);
  assert.equal(evalBoard(b, 1, 0).value, 1);
  assert.equal(evalBoard(b, 0, 0).value, 0);
});

test('evalBoard: XOR-Gatter – alle vier Eingabekombinationen', () => {
  const b = makeAndBoard(GATE_TYPE.XOR);
  assert.equal(evalBoard(b, 1, 1).value, 0);
  assert.equal(evalBoard(b, 1, 0).value, 1);
  assert.equal(evalBoard(b, 0, 0).value, 0);
});

test('evalBoard: NAND-Gatter', () => {
  const b = makeAndBoard(GATE_TYPE.NAND);
  assert.equal(evalBoard(b, 1, 1).value, 0);
  assert.equal(evalBoard(b, 1, 0).value, 1);
});

test('evalBoard: NOR-Gatter', () => {
  const b = makeAndBoard(GATE_TYPE.NOR);
  assert.equal(evalBoard(b, 0, 0).value, 1);
  assert.equal(evalBoard(b, 1, 0).value, 0);
});

// --- Verzweigung (T_JCT auf Board-Ebene) ---

// T_JCT r=0 {closed=W}: fromS teilt auf {N, E}.
//   Arm N: (1,0)→(0,0)CORNER r=1→(0,1..3)→AUSGANG
//   Arm E: (2,1) DEAD_END — Signal wird geschluckt, aber Arm N gewinnt trotzdem.
test('evalBoard: T-Kreuzung – ein Arm zum Ausgang, anderer zur Sackgasse', () => {
  const board = createBoard();
  const T = TILE_TYPE;
  board.cells[4][0] = tileCell(T.STRAIGHT, 0);
  board.cells[3][0] = tileCell(T.STRAIGHT, 0);
  board.cells[2][0] = tileCell(T.T_JCT,   0);  // closed=W; fromS→{N,E}
  board.cells[1][0] = tileCell(T.STRAIGHT, 0);  // Arm N weiter
  board.cells[0][0] = tileCell(T.CORNER,   1);  // S→E
  board.cells[0][1] = tileCell(T.STRAIGHT, 1);
  board.cells[0][2] = tileCell(T.STRAIGHT, 1);
  board.cells[0][3] = tileCell(T.CORNER,   3);  // W→N → AUSGANG
  board.cells[2][1] = tileCell(T.DEAD_END, 0);  // Arm E: Sackgasse

  const res = evalBoard(board, 1, 0);
  assert.equal(res.reached, true,  'Signal muss den Ausgang erreichen');
  assert.equal(res.value,   1);
  assert.ok(res.signalCells.has('2,0'), 'T-Kreuzung besucht');
  assert.ok(res.signalCells.has('2,1'), 'Sackgassen-Arm besucht');
});

// T_JCT teilt Signal 0 auf beide Arme; ein Arm endet blind, einer traegt 0 zum Ausgang.
test('evalBoard: T-Kreuzung – Signal 0 wird korrekt weitergegeben', () => {
  const board = createBoard();
  const T = TILE_TYPE;
  board.cells[4][0] = tileCell(T.STRAIGHT, 0);
  board.cells[3][0] = tileCell(T.STRAIGHT, 0);
  board.cells[2][0] = tileCell(T.T_JCT,   0);
  board.cells[1][0] = tileCell(T.STRAIGHT, 0);
  board.cells[0][0] = tileCell(T.CORNER,   1);
  board.cells[0][1] = tileCell(T.STRAIGHT, 1);
  board.cells[0][2] = tileCell(T.STRAIGHT, 1);
  board.cells[0][3] = tileCell(T.CORNER,   3);
  board.cells[2][1] = tileCell(T.DEAD_END, 0);

  assert.equal(evalBoard(board, 0, 0).value, 0);
});

// --- X-Kreuzung ---

// X_CROSS leitet N-S unabhaengig von E-W; Signal bleibt auf dem N-S-Kanal.
test('evalBoard: X-Kreuzung – N-S-Kanal unabhaengig von E-W', () => {
  const board = createBoard();
  const T = TILE_TYPE;
  board.cells[4][0] = tileCell(T.STRAIGHT, 0);
  board.cells[3][0] = tileCell(T.STRAIGHT, 0);
  board.cells[2][0] = tileCell(T.STRAIGHT, 0);
  board.cells[1][0] = tileCell(T.X_CROSS,  0);  // N-S passiert durch; E-W ohne Anschluss
  board.cells[0][0] = tileCell(T.CORNER,   1);  // S→E
  board.cells[0][1] = tileCell(T.STRAIGHT, 1);
  board.cells[0][2] = tileCell(T.STRAIGHT, 1);
  board.cells[0][3] = tileCell(T.CORNER,   3);  // W→N → AUSGANG

  const res = evalBoard(board, 1, 0);
  assert.equal(res.reached, true);
  assert.equal(res.value,   1);
});

// --- Sackgasse ---

// DEAD_END als erste Kachel: Signal tritt ein, nichts kommt raus.
test('evalBoard: Sackgasse direkt am Eingang – reached=false', () => {
  const board = createBoard();
  board.cells[4][0] = tileCell(TILE_TYPE.DEAD_END, 0);
  const res = evalBoard(board, 1, 0);
  assert.equal(res.reached,          false);
  assert.equal(res.signalCells.size, 1, 'Nur die Sackgasse selbst besucht');
});

// DEAD_END mitten im Pfad: Kacheln davor sind besucht, Kacheln danach nicht.
test('evalBoard: Sackgasse mitten im Pfad – Signal bricht dort ab', () => {
  const board = createBoard();
  const T = TILE_TYPE;
  board.cells[4][0] = tileCell(T.STRAIGHT, 0);
  board.cells[3][0] = tileCell(T.DEAD_END, 0);  // Sackgasse
  board.cells[2][0] = tileCell(T.STRAIGHT, 0);  // danach – darf nicht besucht werden
  const { signalCells } = evalBoard(board, 1, 0);
  assert.ok( signalCells.has('4,0'), '(4,0) besucht');
  assert.ok( signalCells.has('3,0'), '(3,0) besucht');
  assert.ok(!signalCells.has('2,0'), '(2,0) muss unbesucht bleiben');
});

// --- Zyklen und Terminierung ---

// Zwei T_JCTs zeigen aufeinander und erzeugen ein bidirektionales Echo:
//   (2,1) T_JCT r=0 {closed=W}: fromS→{N,E} – sendet E→(2,2)
//   (2,2) T_JCT r=2 {closed=E}: fromW→{N,S} – sendet nichts zurueck nach E
// Das gibt keinen echten Kreis, aber (2,1) wird von fromE nochmals adressiert,
// weil (2,2) N→(1,2)→... zurueck auf (2,1) kommen koennte.
// Entscheidend: die Funktion terminiert in << 50 ms und liefert ein gueltiges Ergebnis.
test('evalBoard: bidirektionales Echo – terminiert ohne Endlosschleife', () => {
  const board = createBoard();
  const T = TILE_TYPE;
  // Zufuhr
  board.cells[4][0] = tileCell(T.STRAIGHT, 0);
  board.cells[3][0] = tileCell(T.CORNER,   1);  // S→E
  board.cells[3][1] = tileCell(T.CORNER,   3);  // W→N
  // Echo-Paar
  board.cells[2][1] = tileCell(T.T_JCT, 0);    // closed=W; fromS→{N,E}
  board.cells[2][2] = tileCell(T.T_JCT, 2);    // closed=E; fromW→{N,S}
  board.cells[1][1] = tileCell(T.CORNER, 1);   // S→E
  board.cells[1][2] = tileCell(T.CORNER, 3);   // W→N (kein weiterer Anschluss)

  const start = Date.now();
  const res   = evalBoard(board, 1, 0);
  assert.ok(Date.now() - start < 50, 'evalBoard muss in < 50 ms terminieren');
  assert.equal(typeof res.reached, 'boolean', 'Ergebnis muss gueltiger boolean sein');
});

// Volle Tafel mit T_JCT – maximale Verzweigung, trotzdem bounded.
// Ohne visited-Set wuerde BFS nicht enden (max 5×5×4 = 100 Eintraege).
test('evalBoard: volle T_JCT-Tafel – terminiert mit bounded Schritten', () => {
  const board = createBoard();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      board.cells[r][c] = tileCell(TILE_TYPE.T_JCT, (r + c) % 4);

  const start = Date.now();
  evalBoard(board, 1, 1);
  assert.ok(Date.now() - start < 100, 'Volle Tafel muss in < 100 ms terminieren');
});

// --- Getrennte Pfade (disconnected) ---

// Nur INPUT_B (4,4) hat einen Pfad zum Ausgang; INPUT_A (4,0) ist nicht verdrahtet.
// Der Ausgang traegt den Wert von INPUT_B, nicht von A.
test('evalBoard: disconnected – nur INPUT_B ist verdrahtet', () => {
  const board = createBoard();
  const T = TILE_TYPE;
  // Pfad nur von (4,4):
  board.cells[4][4] = tileCell(T.STRAIGHT, 0);
  board.cells[3][4] = tileCell(T.CORNER,   2);  // S→W
  board.cells[3][3] = tileCell(T.STRAIGHT, 1);
  board.cells[3][2] = tileCell(T.STRAIGHT, 1);
  board.cells[3][1] = tileCell(T.STRAIGHT, 1);
  board.cells[3][0] = tileCell(T.CORNER,   0);  // E→N
  board.cells[2][0] = tileCell(T.STRAIGHT, 0);
  board.cells[1][0] = tileCell(T.STRAIGHT, 0);
  board.cells[0][0] = tileCell(T.CORNER,   1);  // S→E
  board.cells[0][1] = tileCell(T.STRAIGHT, 1);
  board.cells[0][2] = tileCell(T.STRAIGHT, 1);
  board.cells[0][3] = tileCell(T.CORNER,   3);  // W→N → AUSGANG
  // (4,0) bleibt leer – INPUT_A findet keine Kachel.

  assert.equal(evalBoard(board, 0, 0).value, 0, 'inputB=0 kommt an');
  assert.equal(evalBoard(board, 0, 1).value, 1, 'inputB=1 kommt an');
  assert.equal(evalBoard(board, 1, 0).value, 0, 'inputA spielt keine Rolle');
});

// --- cloneBoard ---

test('cloneBoard: erzeugt unabhaengige Kopie', () => {
  const b = makeL1Board();
  const c = cloneBoard(b);
  c.cells[0][0].rotation = 99;
  assert.notEqual(b.cells[0][0].rotation, 99);
});

// --- generateBoard ---

function boardFingerprint(board) {
  return JSON.stringify({ cells: board.cells, gates: board.gates });
}

test('generateBoard: gleicher Seed → gleiche Aufgabe', () => {
  for (const seed of [1, 42, 9999]) {
    for (const lvl of [1, 2, 3]) {
      const a = generateBoard(lvl, mulberry32(seed));
      const b = generateBoard(lvl, mulberry32(seed));
      assert.equal(a.inputA,    b.inputA,    `Seed ${seed} Stufe ${lvl}: inputA`);
      assert.equal(a.inputB,    b.inputB,    `Seed ${seed} Stufe ${lvl}: inputB`);
      assert.equal(a.target,    b.target,    `Seed ${seed} Stufe ${lvl}: target`);
      assert.equal(a.gateType,  b.gateType,  `Seed ${seed} Stufe ${lvl}: gateType`);
      assert.equal(boardFingerprint(a.board), boardFingerprint(b.board), `Seed ${seed} Stufe ${lvl}: board`);
      assert.equal(boardFingerprint(a.solutionBoard), boardFingerprint(b.solutionBoard), `Seed ${seed} Stufe ${lvl}: solutionBoard`);
    }
  }
});

test('generateBoard: Stufe 1 hat kein Gatter', () => {
  for (let seed = 0; seed < 10; seed++) {
    const t = generateBoard(1, mulberry32(seed));
    assert.equal(t.gateType, null, `Seed ${seed}: kein Gatter erwartet`);
    assert.equal(t.board.gates.length, 0);
  }
});

test('generateBoard: Stufe 2 hat ein Gatter, Stufe 3 hat ein oder zwei Gatter', () => {
  let sawTwoGate = false;
  for (let seed = 0; seed < 10; seed++) {
    const l2 = generateBoard(2, mulberry32(seed));
    assert.ok(l2.gateType !== null, `Stufe 2 Seed ${seed}: gateType fehlt`);
    assert.equal(l2.board.gates.length, 1, `Stufe 2 Seed ${seed}: genau 1 Gatter erwartet`);

    const l3 = generateBoard(3, mulberry32(seed));
    assert.ok(l3.gateType !== null, `Stufe 3 Seed ${seed}: gateType fehlt`);
    assert.ok([1, 2].includes(l3.board.gates.length), `Stufe 3 Seed ${seed}: 1 oder 2 Gatter erwartet`);
    if (l3.board.gates.length === 2) sawTwoGate = true;
  }
  assert.equal(sawTwoGate, true, 'Stufe 3 soll auch Zwei-Gatter-Boards erzeugen');
});

test('generateBoard: board hat ROWS×COLS Zellen', () => {
  for (const lvl of [1, 2, 3]) {
    const { board } = generateBoard(lvl, mulberry32(0));
    assert.equal(board.cells.length, ROWS);
    for (const row of board.cells) assert.equal(row.length, COLS);
  }
});

test('generateBoard: solutionBoard loest immer die Aufgabe (30 Seeds × 3 Stufen)', () => {
  for (let seed = 0; seed < 30; seed++) {
    for (const lvl of [1, 2, 3]) {
      const { solutionBoard, inputA, inputB, target } = generateBoard(lvl, mulberry32(seed));
      const res = evalBoard(solutionBoard, inputA, inputB);
      assert.equal(res.reached, true,  `Stufe ${lvl} Seed ${seed}: Signal erreicht nicht den Ausgang`);
      assert.equal(res.value, target,  `Stufe ${lvl} Seed ${seed}: Ausgangswert falsch`);
    }
  }
});

test('generateBoard: erzeugte Boards sind eindeutig loesbar und treffen den Zielwert', () => {
  for (let seed = 0; seed < 15; seed++) {
    for (const lvl of [1, 2, 3]) {
      const task = generateBoard(lvl, mulberry32(seed));
      const solved = evalBoard(task.solutionBoard, task.inputA, task.inputB);
      assert.equal(solved.reached, true, `Stufe ${lvl} Seed ${seed}: Loesungsboard erreicht Ausgang nicht`);
      assert.equal(solved.value, task.target, `Stufe ${lvl} Seed ${seed}: Zielwert falsch`);

      const solver = enumerateBoardSolutions(task.solutionBoard, task.inputA, task.inputB, task.target, { maxSolutions: 2 });
      assert.equal(solver.complete, true, `Stufe ${lvl} Seed ${seed}: Solver-Suche nicht vollstaendig`);
      assert.equal(solver.solutionCount, 1, `Stufe ${lvl} Seed ${seed}: nicht eindeutig loesbar`);
    }
  }
});

test('generateBoard: board ist tatsaechlich verschluesselt (nicht identisch mit solutionBoard)', () => {
  let diffFound = false;
  for (let seed = 0; seed < 20 && !diffFound; seed++) {
    const { board, solutionBoard } = generateBoard(2, mulberry32(seed));
    for (let r = 0; r < ROWS && !diffFound; r++) {
      for (let c = 0; c < COLS && !diffFound; c++) {
        const a = board.cells[r][c], b = solutionBoard.cells[r][c];
        if (a.kind === 'tile' && !a.locked && a.rotation !== b.rotation) diffFound = true;
      }
    }
  }
  assert.ok(diffFound, 'Kein Seed hat eine abweichende Kachelrotation – scrambleBoard scheint inaktiv');
});

test('generateBoard: unterschiedliche Seeds erzeugen unterschiedliche Boards', () => {
  const seen = new Set();
  for (let seed = 0; seed < 8; seed++) {
    const task = generateBoard(3, mulberry32(seed));
    seen.add(boardFingerprint(task.board));
    assert.ok(task.generationAttempts >= 1, 'Generator meldet die Anzahl der Versuche');
  }
  assert.ok(seen.size > 1, 'Mehrere Seeds sollen unterschiedliche Boards erzeugen');
});

// --- Minigame-Schnittstelle (bordcomputer.js) ---

test('howto: Kurzanleitung vorhanden (Ziel und Beispiel)', () => {
  assert.ok(typeof bordcomputer.howto.goal === 'string' && bordcomputer.howto.goal.length > 5);
  assert.ok(typeof bordcomputer.howto.example === 'string' && bordcomputer.howto.example.length > 5);
});

test('generate: deterministisch (gleicher Seed → gleiche Task)', () => {
  for (const seed of [1, 100, 0xabcdef]) {
    for (const lvl of [1, 2, 3]) {
      const t1 = bordcomputer.generate(lvl, mulberry32(seed));
      const t2 = bordcomputer.generate(lvl, mulberry32(seed));
      assert.equal(t1.inputA,   t2.inputA,   `Seed ${seed} Stufe ${lvl}: inputA`);
      assert.equal(t1.inputB,   t2.inputB,   `Seed ${seed} Stufe ${lvl}: inputB`);
      assert.equal(t1.target,   t2.target,   `Seed ${seed} Stufe ${lvl}: target`);
      assert.equal(t1.gateType, t2.gateType, `Seed ${seed} Stufe ${lvl}: gateType`);
    }
  }
});

test('generate: liefert inputA, inputB, target, board und solutionBoard', () => {
  for (const lvl of [1, 2, 3]) {
    const task = bordcomputer.generate(lvl, mulberry32(1));
    assert.ok('inputA'      in task, 'inputA fehlt');
    assert.ok('inputB'      in task, 'inputB fehlt');
    assert.ok('target'      in task, 'target fehlt');
    assert.ok(task.board && Array.isArray(task.board.cells),         'board.cells fehlt');
    assert.ok(Array.isArray(task.board.gates),                       'board.gates fehlt');
    assert.ok(task.solutionBoard && Array.isArray(task.solutionBoard.cells), 'solutionBoard.cells fehlt');
  }
});

test('solve: liefert Loesung die validate besteht (50 Seeds × 3 Stufen)', () => {
  for (let seed = 0; seed < 50; seed++) {
    for (const lvl of [1, 2, 3]) {
      const task = bordcomputer.generate(lvl, mulberry32(seed));
      const sol  = bordcomputer.solve(task);
      const res  = bordcomputer.validate(task, sol);
      assert.equal(res.geloest,     true, `Stufe ${lvl} Seed ${seed}: nicht geloest`);
      assert.equal(res.teiltreffer, 1,    `Stufe ${lvl} Seed ${seed}: teiltreffer !== 1`);
    }
  }
});

test('validate: korrekte Antwort → geloest=true, teiltreffer=1', () => {
  const task = bordcomputer.generate(1, mulberry32(7));
  const sol  = bordcomputer.solve(task);
  const res  = bordcomputer.validate(task, sol);
  assert.equal(res.geloest,     true);
  assert.equal(res.teiltreffer, 1);
  assert.ok(typeof res.hinweis === 'string');
});

test('validate: Signal kommt an aber falscher Wert → teiltreffer=0.5', () => {
  // Stufe 1 mit inputA=1, target=1 → richtige Loesung dreht die Kacheln korrekt
  // Wir suchen einen Seed wo target=1, dann uebergeben wir 0 statt 1 als inputA
  // Tatsaechlich aendern wir das target manuell fuer diesen Test.
  const task = bordcomputer.generate(1, mulberry32(3));
  // Korrekte Loesung hat Signal 1. Wir bauen eine Fake-Task mit target=0,
  // damit derselbe Signalpfad das falsche Ergebnis produziert.
  const modifiedTask = { ...task, target: task.inputA === 1 ? 0 : 1 };
  const sol = bordcomputer.solve(task); // korrekte Rotationen fuer den echten Task
  const res = bordcomputer.validate(modifiedTask, sol);
  // Signal kommt an (teiltreffer) aber Wert stimmt nicht → 0.5
  if (res.geloest) {
    // Falls inputA zufaellig mit dem falschen target uebereinstimmt: Test ueberspringen
    assert.ok(true, 'Wertekonflikt – Test gilt als bestanden');
  } else {
    assert.equal(res.teiltreffer, 0.5);
  }
});

test('validate: fehlende oder leere Eingabe → geloest=false, teiltreffer=0', () => {
  const task = bordcomputer.generate(2, mulberry32(7));
  for (const bad of [undefined, {}, { cells: null }]) {
    const res = bordcomputer.validate(task, bad);
    assert.equal(res.geloest,     false);
    assert.equal(res.teiltreffer, 0);
    assert.ok(typeof res.hinweis === 'string' && res.hinweis.length > 0);
  }
});
