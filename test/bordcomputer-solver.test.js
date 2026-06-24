// Tests fuer den Bordcomputer-Board-Solver.
// Der Solver arbeitet auf bestehenden Boards und erzeugt keine Level.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_TYPE, GATE_TYPE,
  createBoard, placeGate, tileCell,
  evalBoard,
  enumerateBoardSolutions, isBoardSolvable, hasUniqueBoardSolution,
} from '../client/minigames/bordcomputer-logic.js';

const T = TILE_TYPE;
const G = GATE_TYPE;

function pt(board, row, col, type, rotation, locked = true) {
  board.cells[row][col] = tileCell(type, rotation, locked);
}

function assertSolutionsValid(result, inputA, inputB, target) {
  for (const solution of result.solutions) {
    const res = evalBoard(solution, inputA, inputB);
    assert.equal(res.reached, true, 'Loesung erreicht den Ausgang');
    assert.equal(res.value, target, 'Loesung trifft den Zielwert');
  }
}

function makeLockedL1Board() {
  const board = createBoard();
  pt(board, 4, 0, T.STRAIGHT, 0);
  pt(board, 3, 0, T.STRAIGHT, 0);
  pt(board, 2, 0, T.STRAIGHT, 0);
  pt(board, 1, 0, T.STRAIGHT, 0);
  pt(board, 0, 0, T.CORNER, 1);
  pt(board, 0, 1, T.STRAIGHT, 1);
  pt(board, 0, 2, T.STRAIGHT, 1);
  pt(board, 0, 3, T.CORNER, 3);
  return board;
}

function makeLoopBoard() {
  const board = createBoard();
  pt(board, 4, 0, T.STRAIGHT, 0);
  pt(board, 3, 0, T.STRAIGHT, 0);
  pt(board, 2, 0, T.T_JCT, 0);       // from S -> N and E

  // Winning branch to the output.
  pt(board, 1, 0, T.STRAIGHT, 0);
  pt(board, 0, 0, T.CORNER, 1);
  pt(board, 0, 1, T.STRAIGHT, 1);
  pt(board, 0, 2, T.STRAIGHT, 1);
  pt(board, 0, 3, T.CORNER, 0, false); // variable, correct rotation is 3

  // Side branch loops back into the T junction.
  pt(board, 2, 1, T.STRAIGHT, 1);
  pt(board, 2, 2, T.CORNER, 2);
  pt(board, 3, 2, T.CORNER, 3);
  pt(board, 3, 1, T.STRAIGHT, 1);
  pt(board, 3, 0, T.T_JCT, 0);
  return board;
}

function makeOneGateBoard() {
  const board = createBoard();
  pt(board, 4, 0, T.STRAIGHT, 0);
  pt(board, 3, 0, T.CORNER, 1);
  pt(board, 3, 1, T.CORNER, 3);
  placeGate(board, 2, 1, G.AND);

  pt(board, 4, 4, T.STRAIGHT, 0);
  pt(board, 3, 4, T.CORNER, 2);
  pt(board, 3, 3, T.STRAIGHT, 1);
  pt(board, 3, 2, T.CORNER, 0);

  pt(board, 1, 1, T.STRAIGHT, 0);
  pt(board, 0, 1, T.CORNER, 1);
  pt(board, 0, 2, T.STRAIGHT, 1);
  pt(board, 0, 3, T.CORNER, 0, false); // variable, correct rotation is 3
  return board;
}

function makeTwoGateBoard() {
  const board = createBoard();

  // Gate 0: AND(A, B) at D1/D2.
  pt(board, 4, 0, T.CORNER, 1);
  pt(board, 4, 1, T.CORNER, 3);
  placeGate(board, 3, 1, G.AND);

  // B is split: one branch to gate 0, one branch to gate 1.
  pt(board, 4, 4, T.CORNER, 2);
  pt(board, 4, 3, T.T_JCT, 0, false); // variable, correct rotation is 3
  pt(board, 4, 2, T.CORNER, 0);
  pt(board, 3, 3, T.STRAIGHT, 0);
  pt(board, 2, 3, T.CORNER, 2);
  pt(board, 2, 2, T.CORNER, 0);

  // Gate 1: OR(gate0, B) at B1/B2.
  pt(board, 2, 1, T.STRAIGHT, 0);
  placeGate(board, 1, 1, G.OR);

  pt(board, 0, 1, T.CORNER, 1);
  pt(board, 0, 2, T.STRAIGHT, 1);
  pt(board, 0, 3, T.CORNER, 3);
  return board;
}

test('enumerateBoardSolutions: erkennt eine eindeutige Loesung', () => {
  const board = makeLockedL1Board();
  board.cells[0][3] = tileCell(T.CORNER, 0, false);

  const result = enumerateBoardSolutions(board, 1, 0, 1);

  assert.equal(result.complete, true);
  assert.equal(result.solvable, true);
  assert.equal(result.unique, true);
  assert.equal(result.solutionCount, 1);
  assert.equal(result.solutions[0].cells[0][3].rotation, 3);
  assert.equal(board.cells[0][3].rotation, 0, 'Eingabe-Board bleibt unveraendert');
  assertSolutionsValid(result, 1, 0, 1);
});

test('isBoardSolvable und hasUniqueBoardSolution liefern schnelle Antworten', () => {
  const board = makeLockedL1Board();
  board.cells[0][3] = tileCell(T.CORNER, 0, false);

  assert.equal(isBoardSolvable(board, 1, 0, 1), true);
  assert.equal(hasUniqueBoardSolution(board, 1, 0, 1), true);
});

test('enumerateBoardSolutions: erkennt unloesbare Boards', () => {
  const board = makeLockedL1Board();
  board.cells[0][3] = tileCell(T.CORNER, 0, true); // falsche, gesperrte Ausgangsecke

  const result = enumerateBoardSolutions(board, 1, 0, 1);

  assert.equal(result.complete, true);
  assert.equal(result.solvable, false);
  assert.equal(result.unique, false);
  assert.equal(result.solutionCount, 0);
  assert.equal(isBoardSolvable(board, 1, 0, 1), false);
  assert.equal(hasUniqueBoardSolution(board, 1, 0, 1), false);
});

test('enumerateBoardSolutions: zaehlt mehrere gueltige Loesungen', () => {
  const board = makeLockedL1Board();
  board.cells[2][2] = tileCell(T.CORNER, 0, false); // abgekoppelte, aber drehbare Ecke

  const result = enumerateBoardSolutions(board, 1, 0, 1);

  assert.equal(result.complete, true);
  assert.equal(result.solvable, true);
  assert.equal(result.unique, false);
  assert.equal(result.solutionCount, 4);
  assert.deepEqual(
    result.solutions.map((s) => s.cells[2][2].rotation).sort(),
    [0, 1, 2, 3],
  );
  assertSolutionsValid(result, 1, 0, 1);
});

test('enumerateBoardSolutions: kanonisiert rotationsgleiche Geraden', () => {
  const board = makeLockedL1Board();
  board.cells[1][0] = tileCell(T.STRAIGHT, 1, false); // richtig ist vertikal

  const result = enumerateBoardSolutions(board, 1, 0, 1);

  assert.equal(result.complete, true);
  assert.equal(result.solutionCount, 1, '0 und 2 zaehlen nicht als zwei Loesungen');
  assert.equal(result.solutions[0].cells[1][0].rotation, 0);
  assertSolutionsValid(result, 1, 0, 1);
});

test('enumerateBoardSolutions: kann nach einer Loesungsgrenze abbrechen', () => {
  const board = makeLockedL1Board();
  board.cells[2][2] = tileCell(T.CORNER, 0, false);

  const result = enumerateBoardSolutions(board, 1, 0, 1, { maxSolutions: 2 });

  assert.equal(result.complete, false);
  assert.equal(result.solvable, true);
  assert.equal(result.unique, false);
  assert.equal(result.solutionCount, 2);
});

test('enumerateBoardSolutions: unterstuetzt Schleifen ohne Endlossuche', () => {
  const board = makeLoopBoard();

  const result = enumerateBoardSolutions(board, 1, 0, 1);

  assert.equal(result.complete, true);
  assert.equal(result.solvable, true);
  assert.equal(result.unique, true);
  assert.equal(result.solutionCount, 1);
  assert.equal(result.solutions[0].cells[0][3].rotation, 3);
  assertSolutionsValid(result, 1, 0, 1);
});

test('enumerateBoardSolutions: unterstuetzt Boards mit einem Gatter', () => {
  const board = makeOneGateBoard();

  const result = enumerateBoardSolutions(board, 1, 1, 1);

  assert.equal(board.gates.length, 1);
  assert.equal(result.complete, true);
  assert.equal(result.solvable, true);
  assert.equal(result.unique, true);
  assert.equal(result.solutionCount, 1);
  assert.equal(result.solutions[0].cells[0][3].rotation, 3);
  assertSolutionsValid(result, 1, 1, 1);
});

test('enumerateBoardSolutions: unterstuetzt Boards mit zwei Gattern', () => {
  const board = makeTwoGateBoard();

  const result = enumerateBoardSolutions(board, 1, 1, 1);

  assert.equal(board.gates.length, 2);
  assert.equal(result.complete, true);
  assert.equal(result.solvable, true);
  assert.equal(result.unique, true);
  assert.equal(result.solutionCount, 1);
  assert.equal(result.solutions[0].cells[4][3].rotation, 3);
  assertSolutionsValid(result, 1, 1, 1);
});
