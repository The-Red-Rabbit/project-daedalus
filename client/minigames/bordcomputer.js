// Mini-Spiel Bordcomputer: Signale durch Kacheln und Gatter leiten (Themenfeld 3).
//
// ─── Architektur ────────────────────────────────────────────────────────────
//
//  bordcomputer-logic.js   DOM-freie Logik; wird von Server UND Client importiert.
//                          Enthält: Board-System, Signal-Simulation, Solver,
//                          Level-Generator.
//
//  bordcomputer-ui.js      Canvas-UI; nur im Browser.
//                          Enthält: mount(), Kachel-Rotation, Signal-Animation,
//                          Debug-Overlay.
//
//  bordcomputer.js  ←───── Diese Datei: verbindet Logik + UI zur Mini-Spiel-Schnittstelle.
//                          Enthält: generate(), validate(), solve(), mount-Weiterleitung.
//
// ─── Austausch des Renderers ────────────────────────────────────────────────
//
//  Um bordcomputer-ui.js durch eine Sprite-basierte Implementierung zu ersetzen:
//
//  1. bordcomputer-sprite-ui.js erstellen; `mount(root, task, ctx)` muss dieselbe
//     Signatur und dasselbe Handle-Interface zurückgeben:
//
//       { unmount(): void, onResult(res): void }
//
//  2. Den Import in dieser Datei ändern:
//
//       import { mount } from './bordcomputer-sprite-ui.js';
//
//  3. generate(), validate() und solve() bleiben unverändert; sie sind
//     server-autoritativ und DOM-frei.
//
//  Die Asset-Beschreibungen für den Sprite-Renderer stehen in:
//    assets/sprites/bordcomputer-manifest.json
//
// ─── Server-autoritäre Funktionen ───────────────────────────────────────────
//
//  generate(level, rng) und validate(task, input) werden identisch auf Server
//  und Client ausgeführt. Kein DOM-Zugriff erlaubt. Der Server importiert diese
//  Datei direkt über die Registry.

import { generateBoard, evalBoard } from './bordcomputer-logic.js';
import { mount } from './bordcomputer-ui.js';

const GATE_LABELS = {
  AND: 'UND', OR: 'ODER', XOR: 'XOR', NAND: 'NAND', NOR: 'NOR',
};

// Erzeugt einen lesbaren Gatternamen auch für Zwei-Gatter-Ketten ("AND+XOR" → "UND+XOR").
function localizeGateType(gateType) {
  if (!gateType) return null;
  return gateType.split('+').map(g => GATE_LABELS[g] || g).join('+');
}

export default {
  id:      'bordcomputer',
  station: 'Bordcomputer',
  howto: {
    goal:    'Drehe die Kacheln so, dass das Signal von E1 (und E2 bei Gattern) korrekt zum Ausgang geleitet wird.',
    example: 'Tipp: Ein Klick dreht eine Kachel 90° im Uhrzeigersinn. Erst leiten, dann bestätigen.',
  },

  /**
   * Erzeugt eine Aufgabe aus dem deterministischen Zufallsgenerator.
   * Gleicher level + rng-Seed → immer dieselbe Aufgabe (Server nutzt das zur Prüfung).
   *
   * Rückgabe enthält u. a.:
   *   board, solutionBoard, inputA, inputB, target, gateType, gateTypes,
   *   prompt, generationAttempts
   */
  generate(level, rng) {
    const { board, solutionBoard, inputA, inputB, target, gateType, gateTypes, generationAttempts }
      = generateBoard(level, rng);

    const gateName = localizeGateType(gateType);
    const prompt = gateName
      ? `E1=${inputA}, E2=${inputB} → ${gateName}-Gatter → Ausgang=${target}. Verbinde die Leitungen.`
      : `E1=${inputA} → Ausgang=${target}. Leite das Signal von E1 zum Ausgang.`;

    return {
      level, board, solutionBoard,
      inputA, inputB, target,
      gateType, gateTypes, generationAttempts,
      prompt,
    };
  },

  /**
   * Prüft eine Spieler-Eingabe autoritativ (DOM-frei, läuft auf Server und Client).
   *
   * input.cells enthält die Kacheln mit den Spieler-Rotationen.
   * Gesperrte Kacheln werden aus der Aufgabe übernommen (unveränderlich).
   *
   * Gibt zurück: { geloest, teiltreffer: 0|0.5|1, hinweis }
   */
  validate(task, input) {
    const inputCells = input && input.cells;
    if (!inputCells) {
      return { geloest: false, teiltreffer: 0, hinweis: 'Keine Kacheldaten gesendet.' };
    }

    // Spieler-Rotationen auf Aufgaben-Typen aufsetzen; gesperrte Kacheln bleiben fest.
    const cells = task.board.cells.map((row, r) =>
      row.map((cell, c) => {
        if (cell.kind !== 'tile' || cell.locked) return cell;
        const rot = inputCells[r]?.[c]?.rotation;
        return { ...cell, rotation: rot != null ? ((rot % 4) + 4) % 4 : cell.rotation };
      }),
    );

    const result = evalBoard({ cells, gates: task.board.gates }, task.inputA, task.inputB);

    if (!result.reached) {
      return { geloest: false, teiltreffer: 0, hinweis: 'Kein Signal am Ausgang angekommen.' };
    }

    const geloest = result.value === task.target;
    return {
      geloest,
      teiltreffer: geloest ? 1 : 0.5,
      hinweis: geloest
        ? `Signal ${task.target} am Ausgang — kalibriert!`
        : `Signal ${result.value} am Ausgang, erwartet ${task.target}.`,
    };
  },

  /**
   * Gibt eine korrekte Lösung zurück (DOM-frei).
   * Wird von Debug-Bots und Tests verwendet, nicht im Spielbetrieb.
   */
  solve(task) {
    return { cells: task.solutionBoard.cells, gates: task.solutionBoard.gates };
  },

  mount,
};
