// Bordcomputer: Canvas-UI (nur Browser).
// Kacheln drehen sich animiert bei Klick oder Tipp.
// Signalpfad wird beim Prüfen schrittweise animiert.
// Debug-Overlay zeigt Typen, Rotationen, Signalwerte und Lösungsvergleich.

import {
  TILE_TYPE, ROWS, COLS, ROW_LABELS, COL_LABELS,
  INPUT_A, INPUT_B, OUTPUT,
  rotateTile, coordLabel, evalBoard, enumerateBoardSolutions,
} from './bordcomputer-logic.js';

// ---------------------------------------------------------------------------
// Layout-Konstanten
// ---------------------------------------------------------------------------
const LABEL_W  = 22;  // Breite der Zeilenbeschriftungsspalte in px
const COL_H    = 20;  // Höhe der Spaltenbeschriftungszeile in px
const MARKER_H = 30;  // Höhe der Eingabe-/Ausgabe-Markierungszeilen in px
const MIN_CELL = 44;  // Mindestzellgröße in px (mobil)
const MAX_CELL = 92;  // Maximale Zellgröße in px

// Rotationsanimation: 6 rad/s → 90° in ~0,26 s
const ANIM_SPEED_RAD_S = 6.0;
const SNAP_RAD         = 0.004; // Schwellwert zum Einrasten

// Signalanimation: 45 ms pro Zelle
const SIGNAL_STEP_MS = 45;

// ---------------------------------------------------------------------------
// Farbtokens (CSS-Variablen stehen auf Canvas nicht zur Verfügung)
// ---------------------------------------------------------------------------
const C = {
  bg:      '#0d0e10',
  panel:   '#17191c',
  panel2:  '#1f2226',
  edge:    '#2b2e31',
  muted:   '#8a8d86',
  primary: '#d7d9d2',
  cyan:    '#36d0e0',
  yellow:  '#f2c014',
  green:   '#9bbf6a',
  orange:  '#e8761a',
  red:     '#d23a36',
  dimWire: 'rgba(54,208,224,0.18)',   // inaktive Leitung während Signal-Anzeige
  dimLock: 'rgba(138,141,134,0.28)', // gesperrte Kachel während Signal-Anzeige
};

// ---------------------------------------------------------------------------
// Debug-Hilfstabellen
// ---------------------------------------------------------------------------

// Kurz-Kürzel für jeden Kacheltyp (max. 3 Zeichen für das Debug-Overlay)
const TYPE_ABBR = {
  [TILE_TYPE.STRAIGHT]: 'STR',
  [TILE_TYPE.CORNER]:   'CRN',
  [TILE_TYPE.CORNER_M]: 'CMR',
  [TILE_TYPE.T_JCT]:    'TJT',
  [TILE_TYPE.X_CROSS]:  'XCR',
  [TILE_TYPE.DEAD_END]: 'DED',
};

// Richtungspfeile für aktive Ein-/Ausgänge im Debug-Overlay
const DIR_ARROW = ['↑', '→', '↓', '←'];

// ---------------------------------------------------------------------------
// Hauptfunktion: mount
// ---------------------------------------------------------------------------

/**
 * Baut die Bordcomputer-UI in `root` auf.
 *
 * @param {HTMLElement} root  - Ziel-Container (wird vollständig ersetzt)
 * @param {object}      task  - Aufgabe aus bordcomputer.generate()
 * @param {object}      ctx   - Mini-Spiel-Kontext: { audio, submit, station, role }
 * @returns {{ unmount(): void, onResult(res): void }}
 */
export function mount(root, task, ctx) {
  const board = task.board;

  // ── DOM aufbauen ─────────────────────────────────────────────────────────

  root.innerHTML =
    `<h1 class="title">Bordcomputer</h1>` +
    `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>`;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:100%;overflow:hidden;line-height:0;position:relative;';
  root.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;touch-action:none;cursor:pointer;';
  wrapper.appendChild(canvas);

  // Debug-Umschalter (oben rechts über dem Canvas)
  const debugBtn = document.createElement('button');
  debugBtn.textContent = 'DBG';
  debugBtn.style.cssText =
    `position:absolute;top:${COL_H + 2}px;right:2px;` +
    `font:bold 9px monospace;letter-spacing:.05em;` +
    `padding:2px 5px;cursor:pointer;z-index:10;` +
    `background:${C.panel};color:${C.muted};border:1px solid ${C.edge};border-radius:2px;`;
  wrapper.appendChild(debugBtn);

  // Legende
  const legend = document.createElement('div');
  legend.style.cssText =
    `font-size:11px;letter-spacing:.04em;color:${C.muted};padding:7px 0 4px;` +
    `display:flex;flex-wrap:wrap;gap:10px;`;
  legend.innerHTML =
    `<span style="color:${C.green}">▲ Eingang</span>` +
    `<span style="color:${C.orange}">▲ Ausgang</span>` +
    `<span style="color:${C.yellow}">■ Ecke (M)</span>` +
    `<span style="color:${C.muted}">🔒 gesperrt</span>`;
  root.appendChild(legend);

  // Hinweis-Zeile
  const hintEl = document.createElement('div');
  hintEl.className = 'bc-hint';
  hintEl.textContent = 'Kacheln drehen, dann Prüfen.';
  root.appendChild(hintEl);

  // Prüfen-Knopf
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'bc-confirm';
  confirmBtn.textContent = 'Prüfen';
  root.appendChild(confirmBtn);

  // Debug-Panel (unter dem Prüfen-Knopf, standardmäßig versteckt)
  const debugPanel = document.createElement('pre');
  debugPanel.style.cssText =
    `display:none;font:10px/1.5 monospace;color:${C.muted};` +
    `background:${C.panel};border:1px solid ${C.edge};border-radius:3px;` +
    `padding:8px;margin-top:8px;white-space:pre;overflow-x:auto;tab-size:2;`;
  root.appendChild(debugPanel);

  // ── Canvas-Kontext ───────────────────────────────────────────────────────

  const c2d = canvas.getContext('2d');

  // ── Zustandsvariablen ────────────────────────────────────────────────────

  let cellSize = 60;
  let offsetX  = LABEL_W;
  let offsetY  = COL_H + MARKER_H;
  let rafId    = null;
  let lastTime = 0;
  let running  = false;

  // Signal-Zustand
  let signalCells  = null;  // Set "r,c" der aktuell beleuchteten Zellen
  let locked       = false; // Drehung gesperrt während Prüfung läuft
  let pendingResult = null; // gepuffertes Server-Ergebnis
  let animDone     = false; // Signalanimation abgeschlossen

  // Debug-Zustand
  let debugMode      = false;
  let lastEvalResult = null; // letztes vollständiges evalBoard-Ergebnis für das Overlay
  let debugSolutions = null; // Ergebnis aus enumerateBoardSolutions

  // Animationswinkel je Zelle (kumulativ, in Bogenmass)
  const animAng   = Array.from({ length: ROWS }, () => new Float64Array(COLS));
  const targetAng = Array.from({ length: ROWS }, () => new Float64Array(COLS));

  function initAngles() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board.cells[r][c];
        const base = cell.kind === 'tile' ? cell.rotation * Math.PI / 2 : 0;
        animAng[r][c]   = base;
        targetAng[r][c] = base;
      }
    }
  }
  initAngles();

  // ── Canvas-Größe berechnen ───────────────────────────────────────────────

  function updateSize() {
    const availW = wrapper.clientWidth || 320;
    const availH = window.innerHeight * 0.52;
    const byW = Math.floor((availW - LABEL_W) / COLS);
    const byH = Math.floor((availH - COL_H - MARKER_H * 2) / ROWS);
    cellSize = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.min(byW, byH)));

    const cssW = LABEL_W + COLS * cellSize;
    const cssH = COL_H + MARKER_H + ROWS * cellSize + MARKER_H;
    const dpr  = window.devicePixelRatio || 1;

    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);

    offsetX = LABEL_W;
    offsetY = COL_H + MARKER_H;
  }

  // ── Haupt-Zeichenroutine ─────────────────────────────────────────────────

  function draw() {
    const cssW = parseInt(canvas.style.width)  || 300;
    const cssH = parseInt(canvas.style.height) || 300;

    c2d.fillStyle = C.bg;
    c2d.fillRect(0, 0, cssW, cssH);

    drawColumnHeaders();
    drawRowHeaders();
    drawCellBackgrounds();
    drawTiles();
    drawLockIcons();
    drawGates();
    drawCellCoords();
    drawMarkers();

    if (debugMode) drawDebugLayer();
  }

  // ── Gitter-Beschriftungen ────────────────────────────────────────────────

  function drawColumnHeaders() {
    c2d.save();
    c2d.fillStyle    = C.muted;
    c2d.font         = 'bold 11px monospace';
    c2d.textAlign    = 'center';
    c2d.textBaseline = 'middle';
    for (let col = 0; col < COLS; col++) {
      c2d.fillText(COL_LABELS[col], offsetX + col * cellSize + cellSize / 2, COL_H / 2);
    }
    c2d.restore();
  }

  function drawRowHeaders() {
    c2d.save();
    c2d.fillStyle    = C.muted;
    c2d.font         = 'bold 11px monospace';
    c2d.textAlign    = 'center';
    c2d.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
      c2d.fillText(ROW_LABELS[r], LABEL_W / 2, offsetY + r * cellSize + cellSize / 2);
    }
    c2d.restore();
  }

  // ── Zell-Hintergründe ───────────────────────────────────────────────────

  function drawCellBackgrounds() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x    = offsetX + c * cellSize;
        const y    = offsetY + r * cellSize;
        const cell = board.cells[r][c];
        const isGate = cell.kind === 'gate_l' || cell.kind === 'gate_r';

        c2d.fillStyle = isGate ? C.panel2 : C.panel;
        c2d.fillRect(x, y, cellSize, cellSize);

        c2d.strokeStyle = C.edge;
        c2d.lineWidth   = 1;
        c2d.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);

        if (cell.kind === 'tile' && cell.locked) {
          c2d.fillStyle = 'rgba(255,255,255,0.04)';
          c2d.fillRect(x, y, cellSize, cellSize);
        }
      }
    }
  }

  // ── Kacheln ─────────────────────────────────────────────────────────────

  function drawTiles() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board.cells[r][c];
        if (cell.kind !== 'tile') continue;
        const cx      = offsetX + c * cellSize + cellSize / 2;
        const cy      = offsetY + r * cellSize + cellSize / 2;
        const isSignal = signalCells !== null && signalCells.has(`${r},${c}`);
        drawOneTile(cell, cx, cy, animAng[r][c], isSignal);
      }
    }
  }

  function drawOneTile(cell, cx, cy, angle, isSignal) {
    const half = cellSize / 2;
    const pw   = Math.max(3, Math.round(cellSize * 0.18));
    const showingSignal = signalCells !== null;

    // Farblogik: aktive Zellen grün, inaktive stark gedämpft während Signal-Anzeige
    const color = cell.locked
      ? (showingSignal ? C.dimLock : C.muted)
      : isSignal
        ? C.green
        : showingSignal
          ? C.dimWire
          : cell.tileType === TILE_TYPE.CORNER_M ? C.yellow : C.cyan;

    c2d.save();
    c2d.translate(cx, cy);
    c2d.rotate(angle);
    c2d.strokeStyle = color;
    c2d.fillStyle   = color;
    c2d.lineWidth   = pw;
    c2d.lineCap     = 'butt';
    c2d.lineJoin    = 'round';

    switch (cell.tileType) {
      case TILE_TYPE.STRAIGHT:
        c2d.beginPath();
        c2d.moveTo(0, -half);
        c2d.lineTo(0,  half);
        c2d.stroke();
        break;

      case TILE_TYPE.CORNER:
        // Bogenmittelpunkt an der äußeren Ecke (oben-rechts), damit die Kurve
        // durch das Zelleninnere läuft (klassische Pipe-Biegung).
        c2d.beginPath();
        c2d.arc(half, -half, half, Math.PI / 2, Math.PI, false);
        c2d.stroke();
        break;

      case TILE_TYPE.CORNER_M:
        // Gespiegelte Variante: Bogenmittelpunkt an der oberen-linken Ecke.
        c2d.beginPath();
        c2d.arc(-half, -half, half, 0, Math.PI / 2, false);
        c2d.stroke();
        break;

      case TILE_TYPE.T_JCT:
        c2d.beginPath();
        c2d.moveTo(0, -half);
        c2d.lineTo(0,  half);
        c2d.stroke();
        c2d.beginPath();
        c2d.moveTo(0,    0);
        c2d.lineTo(half, 0);
        c2d.stroke();
        break;

      case TILE_TYPE.X_CROSS:
        c2d.beginPath();
        c2d.moveTo(0,    -half);
        c2d.lineTo(0,     half);
        c2d.stroke();
        c2d.beginPath();
        c2d.moveTo(-half, 0);
        c2d.lineTo( half, 0);
        c2d.stroke();
        break;

      case TILE_TYPE.DEAD_END:
        c2d.beginPath();
        c2d.moveTo(0, -half);
        c2d.lineTo(0,  0);
        c2d.stroke();
        c2d.beginPath();
        c2d.arc(0, 0, pw * 0.9, 0, Math.PI * 2);
        c2d.fill();
        break;
    }

    c2d.restore();
  }

  // Schloss-Icons in Weltkoordinaten – außerhalb des rotierten Kontexts,
  // damit sie immer aufrecht und in derselben Ecke jeder Kachel erscheinen.
  function drawLockIcons() {
    const sz = Math.max(8, cellSize * 0.18);
    c2d.save();
    c2d.font         = `${sz}px sans-serif`;
    c2d.fillStyle    = C.muted;
    c2d.textAlign    = 'right';
    c2d.textBaseline = 'bottom';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board.cells[r][c];
        if (cell.kind !== 'tile' || !cell.locked) continue;
        c2d.fillText('🔒',
          offsetX + c * cellSize + cellSize - 2,
          offsetY + r * cellSize + cellSize - 1,
        );
      }
    }
    c2d.restore();
  }

  // ── Gatter ──────────────────────────────────────────────────────────────

  // Port-Farbe in Abhängigkeit vom Signal-Zustand des Ports.
  function portColor(active) {
    if (active) return C.green;
    return signalCells !== null ? C.dimWire : C.cyan;
  }

  function drawGates() {
    for (const gate of board.gates) {
      const lActive   = signalCells !== null && signalCells.has(`${gate.row},${gate.col}`);
      const rActive   = signalCells !== null && signalCells.has(`${gate.row},${gate.col + 1}`);
      const outActive = signalCells !== null && gate.row > 0 &&
                        signalCells.has(`${gate.row - 1},${gate.col}`);
      const bothIn    = lActive && rActive;

      const x   = offsetX + gate.col * cellSize;
      const y   = offsetY + gate.row * cellSize;
      const gw  = cellSize * 2;
      const gh  = cellSize;
      const pad = 5;
      const pw  = Math.max(3, Math.round(cellSize * 0.18));

      // Gatter-Körper
      c2d.fillStyle = C.panel2;
      c2d.fillRect(x + pad, y + pad, gw - pad * 2, gh - pad * 2);

      // Rahmen: grün wenn beide Eingänge aktiv, sonst orange
      c2d.strokeStyle = bothIn ? C.green : C.orange;
      c2d.lineWidth   = 2;
      c2d.strokeRect(x + pad + 1, y + pad + 1, gw - pad * 2 - 2, gh - pad * 2 - 2);

      c2d.lineCap = 'butt';

      // Eingangs-Stummel A (links)
      const portAx = x + cellSize / 2;
      c2d.strokeStyle = portColor(lActive);
      c2d.lineWidth   = pw;
      c2d.beginPath();
      c2d.moveTo(portAx, y + gh);
      c2d.lineTo(portAx, y + gh - pad * 2.5);
      c2d.stroke();

      // Eingangs-Stummel B (rechts)
      const portBx = x + cellSize + cellSize / 2;
      c2d.strokeStyle = portColor(rActive);
      c2d.lineWidth   = pw;
      c2d.beginPath();
      c2d.moveTo(portBx, y + gh);
      c2d.lineTo(portBx, y + gh - pad * 2.5);
      c2d.stroke();

      // Ausgangs-Stummel
      c2d.strokeStyle = portColor(outActive);
      c2d.lineWidth   = pw;
      c2d.beginPath();
      c2d.moveTo(portAx, y);
      c2d.lineTo(portAx, y + pad * 2.5);
      c2d.stroke();

      // Gattertyp-Beschriftung
      const fontSize = Math.round(cellSize * 0.28);
      c2d.fillStyle    = C.primary;
      c2d.font         = `bold ${fontSize}px monospace`;
      c2d.textAlign    = 'center';
      c2d.textBaseline = 'middle';
      c2d.fillText(gate.type, x + gw / 2, y + gh / 2);

      // Eingangs-Port-Labels
      const lsz = Math.round(cellSize * 0.17);
      c2d.fillStyle = C.muted;
      c2d.font      = `${lsz}px monospace`;
      c2d.fillText('A', portAx, y + gh - pad * 3.5);
      c2d.fillText('B', portBx, y + gh - pad * 3.5);
    }
  }

  // ── Koordinaten-Labels (immer schwach sichtbar) ──────────────────────────

  function drawCellCoords() {
    const fontSize = Math.max(8, Math.round(cellSize * 0.145));
    c2d.save();
    c2d.font          = `${fontSize}px monospace`;
    c2d.fillStyle     = 'rgba(138,141,134,0.45)';
    c2d.textAlign     = 'left';
    c2d.textBaseline  = 'top';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board.cells[r][c].kind === 'gate_r') continue; // Rechte Gatterhälfte überspringen
        c2d.fillText(coordLabel(r, c), offsetX + c * cellSize + 3, offsetY + r * cellSize + 2);
      }
    }
    c2d.restore();
  }

  // ── Eingangs-/Ausgangsmarkierungen ──────────────────────────────────────

  function drawMarkers() {
    const pw       = Math.max(2, cellSize * 0.08);
    const headW    = Math.max(6, cellSize * 0.20);
    const fontSize = Math.max(9, Math.round(cellSize * 0.17));

    // E1-Eingang (unten links) – Pfeil in oberer Hälfte der Marker-Zone, Label darunter
    {
      const cx      = offsetX + INPUT_A.col * cellSize + cellSize / 2;
      const gridBot = offsetY + ROWS * cellSize;
      const tip     = gridBot + 5;
      const bot     = gridBot + Math.round(MARKER_H * 0.5);
      drawArrow(cx, bot, cx, tip, headW, pw, C.green);
      c2d.fillStyle    = C.green;
      c2d.font         = `bold ${fontSize}px monospace`;
      c2d.textAlign    = 'center';
      c2d.textBaseline = 'top';
      c2d.fillText(`E1=${task.inputA}`, cx, bot + 3);
    }

    // E2-Eingang (unten rechts)
    {
      const cx      = offsetX + INPUT_B.col * cellSize + cellSize / 2;
      const gridBot = offsetY + ROWS * cellSize;
      const tip     = gridBot + 5;
      const bot     = gridBot + Math.round(MARKER_H * 0.5);
      drawArrow(cx, bot, cx, tip, headW, pw, C.green);
      c2d.fillStyle    = C.green;
      c2d.font         = `bold ${fontSize}px monospace`;
      c2d.textAlign    = 'center';
      c2d.textBaseline = 'top';
      c2d.fillText(`E2=${task.inputB}`, cx, bot + 3);
    }

    // Ausgang (oben, Spalte 3) – Pfeil in unterer Hälfte der Marker-Zone, Label darüber
    {
      const cx  = offsetX + OUTPUT.col * cellSize + cellSize / 2;
      const bot = offsetY - 5;
      const tip = COL_H + Math.round(MARKER_H / 2);
      drawArrow(cx, bot, cx, tip, headW, pw, C.orange);
      c2d.fillStyle    = C.orange;
      c2d.font         = `bold ${fontSize}px monospace`;
      c2d.textAlign    = 'center';
      c2d.textBaseline = 'bottom';
      c2d.fillText(`→${task.target}`, cx, tip);
    }
  }

  function drawArrow(x0, y0, x1, y1, headW, lw, color) {
    const dx  = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux  = dx / len, uy = dy / len;
    const hLen = Math.min(len * 0.5, headW * 1.4);

    c2d.beginPath();
    c2d.moveTo(x0, y0);
    c2d.lineTo(x1 - ux * hLen, y1 - uy * hLen);
    c2d.strokeStyle = color;
    c2d.lineWidth   = lw;
    c2d.lineCap     = 'round';
    c2d.stroke();

    const nx = -uy, ny = ux;
    const bx = x1 - ux * hLen, by = y1 - uy * hLen;
    c2d.beginPath();
    c2d.moveTo(x1, y1);
    c2d.lineTo(bx + nx * headW / 2, by + ny * headW / 2);
    c2d.lineTo(bx - nx * headW / 2, by - ny * headW / 2);
    c2d.closePath();
    c2d.fillStyle = color;
    c2d.fill();
  }

  // ── Debug-Overlay (Canvas-Schicht) ──────────────────────────────────────
  //
  // Zeichnet pro Zelle:
  //   oben-links  – Typ-Kürzel + aktuelle Rotation (STR/2)
  //   oben-rechts – Soll-Rotation wenn ≠ Ist-Rotation (→N, gelb)
  //   unten-rechts– Signalwert 0/1 wenn Zelle besucht wurde (farbiges Badge)
  //   Kanten      – Punkte an aktiven Ein-/Ausgängen (grün/cyan)
  //   Schleife    – rote Tönung bei erkannten Signalzyklen

  function drawDebugLayer() {
    if (!lastEvalResult) return;
    const { cellValues, cellExits, cellEntries, loopCells } = lastEvalResult;
    const fs = Math.max(7, Math.round(cellSize * 0.145));
    const dotR = Math.max(3, cellSize * 0.06);

    c2d.save();
    c2d.font         = `${fs}px monospace`;
    c2d.textBaseline = 'top';

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board.cells[r][c];
        const x    = offsetX + c * cellSize;
        const y    = offsetY + r * cellSize;
        const ck   = `${r},${c}`;

        // Zyklus-Tönung
        if (loopCells.has(ck)) {
          c2d.fillStyle = 'rgba(210,58,54,0.22)';
          c2d.fillRect(x, y, cellSize, cellSize);
        }

        // Typ + Rotation (oben-links)
        let typeLabel;
        if (cell.kind === 'tile') {
          typeLabel = `${TYPE_ABBR[cell.tileType] || '???'}/${cell.rotation}${cell.locked ? 'L' : ''}`;
        } else if (cell.kind === 'gate_l') {
          typeLabel = `GL${cell.gateId}`;
        } else if (cell.kind === 'gate_r') {
          typeLabel = `GR${cell.gateId}`;
        } else {
          typeLabel = 'EMP';
        }
        drawDebugBadge(typeLabel, x + 2, y + 2, C.primary, 'rgba(0,0,0,0.65)');

        // Soll-Rotation (oben-rechts, gelb) wenn abweichend von Lösung
        if (task.solutionBoard && cell.kind === 'tile' && !cell.locked) {
          const solCell = task.solutionBoard.cells[r][c];
          if (solCell && solCell.rotation !== cell.rotation) {
            const solLabel = `→${solCell.rotation}`;
            const tw = c2d.measureText(solLabel).width + 4;
            drawDebugBadge(solLabel, x + cellSize - tw - 1, y + 2, C.yellow, 'rgba(0,0,0,0.70)');
          }
        }

        // Signalwert-Badge (unten-rechts)
        const sigVal = cellValues.get(ck);
        if (sigVal != null) {
          const valStr = String(sigVal);
          const vw = c2d.measureText(valStr).width + 4;
          const badgeColor = sigVal ? 'rgba(155,191,106,0.88)' : 'rgba(232,118,26,0.88)';
          drawDebugBadge(valStr, x + cellSize - vw - 1, y + cellSize - fs - 4,
            '#0d0e10', badgeColor);
        }

        // Aktive Eingangs-Punkte (cyan) an den Kanten
        const entries = cellEntries.get(ck);
        if (entries) {
          for (const dir of entries) {
            const [dx, dy] = edgeMidpoint(x, y, dir);
            drawDot(dx, dy, dotR, C.cyan);
          }
        }

        // Aktive Ausgangs-Punkte (grün) an den Kanten
        const exits = cellExits.get(ck);
        if (exits) {
          for (const dir of exits) {
            const [dx, dy] = edgeMidpoint(x, y, dir);
            drawDot(dx, dy, dotR * 0.75, C.green);
          }
        }
      }
    }

    // Gate-IDs im unteren Bereich der Gate-Körper
    c2d.fillStyle    = C.muted;
    c2d.textBaseline = 'bottom';
    for (const gate of board.gates) {
      const x = offsetX + gate.col * cellSize + 3;
      const y = offsetY + (gate.row + 1) * cellSize - 2;
      c2d.fillText(`G${gate.id}:${gate.type}`, x, y);
    }

    c2d.restore();
  }

  // Hilfsfunktionen für drawDebugLayer

  function drawDebugBadge(text, x, y, textColor, bgColor) {
    const tw = c2d.measureText(text).width;
    const fs = parseFloat(c2d.font);
    c2d.fillStyle = bgColor;
    c2d.fillRect(x, y, tw + 4, fs + 3);
    c2d.fillStyle    = textColor;
    c2d.textAlign    = 'left';
    c2d.textBaseline = 'top';
    c2d.fillText(text, x + 2, y + 1);
  }

  function edgeMidpoint(cellX, cellY, dir) {
    const cx = cellX + cellSize / 2;
    const cy = cellY + cellSize / 2;
    if (dir === 0) return [cx, cellY + 2];            // N
    if (dir === 1) return [cellX + cellSize - 2, cy]; // E
    if (dir === 2) return [cx, cellY + cellSize - 2]; // S
    return [cellX + 2, cy];                           // W
  }

  function drawDot(x, y, r, color) {
    c2d.beginPath();
    c2d.arc(x, y, r, 0, Math.PI * 2);
    c2d.fillStyle = color;
    c2d.fill();
  }

  // ── Debug-Textpanel (DOM-Element) ────────────────────────────────────────

  function updateDebugPanel() {
    if (!debugMode) { debugPanel.style.display = 'none'; return; }
    debugPanel.style.display = '';

    const lines = [];
    lines.push('=== Bordcomputer Debug ===');
    lines.push(`Eingaben   : E1=${task.inputA}  E2=${task.inputB}  →  Ziel=${task.target}`);
    lines.push(`Gatter     : ${task.gateType || '(keiner)'}`);
    lines.push(`Generierung: ${task.generationAttempts ?? '?'} Versuch(e)`);

    if (lastEvalResult) {
      const r = lastEvalResult;
      const loops = [...r.loopCells].map(k => {
        const [row, col] = k.split(',').map(Number);
        return coordLabel(row, col);
      }).join(' ') || '(keine)';
      lines.push(`Signal     : reached=${r.reached}  value=${r.value !== -1 ? r.value : '—'}`);
      lines.push(`Pfadzellen : ${r.signalCells.size}  Schleifen: ${loops}`);
    } else {
      lines.push(`Signal     : (noch nicht geprüft)`);
    }

    if (debugSolutions) {
      const s = debugSolutions;
      const unique = s.complete ? (s.solutionCount === 1 ? 'eindeutig' : 'mehrdeutig') : 'Suche abgebrochen';
      lines.push(`Lösungen   : ${s.solutionCount} (${unique}, ${s.checked} Zustände geprüft)`);
      if (s.solutions[0]?.rotations) {
        const rots = s.solutions[0].rotations
          .map(({ row, col, rotation }) => `${coordLabel(row, col)}:${rotation}`)
          .join(' ');
        lines.push(`Lösung[0]  : ${rots}`);
      }
    } else {
      lines.push(`Lösungen   : (noch nicht berechnet)`);
    }

    lines.push('--- Aktuelle Tafel ---');
    for (let r = 0; r < ROWS; r++) {
      const cells = [];
      for (let c = 0; c < COLS; c++) {
        const cell = board.cells[r][c];
        const ck   = `${r},${c}`;
        const sig  = lastEvalResult?.cellValues.get(ck);
        const sigStr = sig != null ? `=${sig}` : '  ';
        if (cell.kind === 'tile') {
          const abbr   = TYPE_ABBR[cell.tileType] || '???';
          const locked = cell.locked ? 'L' : ' ';
          cells.push(`${abbr}${cell.rotation}${locked}${sigStr}`);
        } else if (cell.kind === 'gate_l') {
          cells.push(`GL${cell.gateId}  ${sigStr}`);
        } else if (cell.kind === 'gate_r') {
          cells.push(`GR${cell.gateId}  ${sigStr}`);
        } else {
          cells.push(`EMP   ${sigStr}`);
        }
      }
      lines.push(`${ROW_LABELS[r]}: ${cells.join(' | ')}`);
    }

    debugPanel.textContent = lines.join('\n');
  }

  // Debug-Modus umschalten und Solver starten
  function toggleDebug() {
    debugMode = !debugMode;
    debugBtn.style.color       = debugMode ? C.cyan  : C.muted;
    debugBtn.style.borderColor = debugMode ? C.cyan  : C.edge;
    debugBtn.style.background  = debugMode ? C.panel2 : C.panel;

    if (debugMode) {
      // Solver-Ergebnis lazily berechnen
      runDebugSolver();
    }
    updateDebugPanel();
    if (!running) draw();
  }

  function runDebugSolver() {
    // Solver auf der aktuellen Spieler-Tafel (begrenzt um schnell zu bleiben)
    const ev = evalBoard(board, task.inputA, task.inputB);
    lastEvalResult = ev;
    if (ev.reached) {
      debugSolutions = enumerateBoardSolutions(
        board, task.inputA, task.inputB, task.target,
        { maxSolutions: 10, maxStates: 8000 }
      );
    } else {
      debugSolutions = { solutionCount: 0, complete: true, checked: 0, solutions: [], solvable: false, unique: false };
    }
  }

  // ── Kachel-Rotationsanimation (rAF-Loop) ────────────────────────────────

  function stepAnimation(dt) {
    const step = ANIM_SPEED_RAD_S * dt;
    let any = false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const diff = targetAng[r][c] - animAng[r][c];
        if (Math.abs(diff) > SNAP_RAD) {
          animAng[r][c] += Math.sign(diff) * Math.min(Math.abs(diff), step);
          any = true;
        } else if (diff !== 0) {
          animAng[r][c] = targetAng[r][c];
        }
      }
    }
    return any;
  }

  function scheduleLoop() {
    if (running) return;
    running  = true;
    lastTime = performance.now();
    rafId    = requestAnimationFrame(loop);
  }

  function loop(ts) {
    const dt        = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime        = ts;
    const animating = stepAnimation(dt);
    draw();
    if (animating) {
      rafId = requestAnimationFrame(loop);
    } else {
      running = false;
      rafId   = null;
    }
  }

  // ── Signal-Propagations-Animation ───────────────────────────────────────
  //
  // Beleuchtet Zellen in BFS-Reihenfolge mit je SIGNAL_STEP_MS Verzögerung.
  // Läuft parallel zum Server-Submit, damit keine extra Latenz entsteht.

  function runSignalAnimation(signalOrder, onDone) {
    signalCells = new Set();
    if (signalOrder.length === 0) {
      if (!running) draw();
      onDone();
      return;
    }

    let i = 0;
    function step() {
      if (i >= signalOrder.length) {
        if (!running) draw();
        onDone();
        return;
      }
      const { row, col } = signalOrder[i];
      signalCells.add(`${row},${col}`);
      if (!running) draw();
      i++;
      setTimeout(step, SIGNAL_STEP_MS);
    }
    step();
  }

  // ── Ergebnis-Behandlung ──────────────────────────────────────────────────

  function onAnimComplete() {
    animDone = true;
    if (!pendingResult) {
      hintEl.textContent = 'Auswertung …';
      hintEl.style.color = C.muted;
    }
    maybeShowResult();
  }

  // Zeigt das Ergebnis erst, wenn sowohl Animation als auch Server-Antwort vorliegen.
  function maybeShowResult() {
    if (!animDone || !pendingResult) return;
    showResult(pendingResult);
  }

  function showResult(res) {
    if (res.geloest) {
      hintEl.textContent       = res.hinweis || 'Signal korrekt geleitet!';
      hintEl.style.color       = C.green;
      confirmBtn.textContent   = '✓ Kalibriert';
      confirmBtn.disabled      = true;
      confirmBtn.style.cssText =
        `background:rgba(155,191,106,0.15);color:${C.green};` +
        `border:1px solid ${C.green};cursor:default;`;
      ctx.audio.play('station.stabilize');
    } else {
      hintEl.textContent       = res.hinweis || 'Signal noch nicht korrekt.';
      hintEl.style.color       = C.orange;
      confirmBtn.textContent   = 'Nochmal prüfen';
      confirmBtn.disabled      = false;
      confirmBtn.style.cssText = ''; // CSS-Standard (orange) wiederherstellen
      locked = false;
      ctx.audio.play('ui.error');
    }
  }

  // ── Treffertest und Interaktion ──────────────────────────────────────────

  function cellAt(canvasX, canvasY) {
    const gx = canvasX - offsetX;
    const gy = canvasY - offsetY;
    if (gx < 0 || gy < 0 || gx >= COLS * cellSize || gy >= ROWS * cellSize) return null;
    return { row: Math.floor(gy / cellSize), col: Math.floor(gx / cellSize) };
  }

  function onTap(canvasX, canvasY) {
    if (locked) return;

    const hit = cellAt(canvasX, canvasY);
    if (!hit) return;
    const { row, col } = hit;
    const cell = board.cells[row][col];
    if (cell.kind !== 'tile') return;

    if (cell.locked) {
      hintEl.textContent = 'Diese Kachel ist gesperrt und kann nicht gedreht werden.';
      hintEl.style.color = C.muted;
      ctx.audio.play('ui.error');
      return;
    }

    cell.rotation = rotateTile(cell);
    targetAng[row][col] += Math.PI / 2;

    // Signal-Overlay und Ergebnis-Zustand zurücksetzen
    signalCells           = null;
    pendingResult         = null;
    animDone              = false;
    lastEvalResult        = null;
    confirmBtn.textContent   = 'Prüfen';
    confirmBtn.disabled      = false;
    confirmBtn.style.cssText = '';
    hintEl.textContent = `${coordLabel(row, col)} gedreht (→ Rot. ${cell.rotation})`;
    hintEl.style.color = C.muted;

    if (debugMode) {
      // Debug-Daten direkt aktualisieren (ohne Solver, um kein Lag zu verursachen)
      lastEvalResult = evalBoard(board, task.inputA, task.inputB);
      updateDebugPanel();
    }

    ctx.audio.play('ui.toggle');
    scheduleLoop();
  }

  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  canvas.addEventListener('click', (e) => { onTap(...canvasXY(e)); });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    const rect = canvas.getBoundingClientRect();
    onTap(t.clientX - rect.left, t.clientY - rect.top);
  }, { passive: false });

  // ── Prüfen-Knopf ────────────────────────────────────────────────────────

  confirmBtn.addEventListener('click', () => {
    if (locked) return;

    locked        = true;
    animDone      = false;
    pendingResult = null;
    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Prüfe …';
    hintEl.style.color     = C.muted;
    hintEl.textContent     = '';

    // 1. Client-seitige Simulation: liefert signalOrder für die Animation
    const ev = evalBoard(board, task.inputA, task.inputB);
    lastEvalResult = ev;

    // 2. Im Debug-Modus: Solver parallel laufen lassen
    if (debugMode) {
      debugSolutions = enumerateBoardSolutions(
        board, task.inputA, task.inputB, task.target,
        { maxSolutions: 10, maxStates: 8000 }
      );
      updateDebugPanel();
    }

    // 3. Signal-Animation (parallel zum Server-Submit)
    runSignalAnimation(ev.signalOrder, onAnimComplete);

    // 4. Autoritative Prüfung durch den Server
    ctx.submit({ cells: board.cells, gates: board.gates });
  });

  // ── Debug-Knopf ─────────────────────────────────────────────────────────

  debugBtn.addEventListener('click', toggleDebug);

  // ── Größenänderungen ─────────────────────────────────────────────────────

  const ro = new ResizeObserver(() => {
    updateSize();
    if (!running) draw();
  });
  ro.observe(wrapper);

  // ── Erster Aufbau ────────────────────────────────────────────────────────

  updateSize();
  draw();

  // ── Handle zurückgeben ───────────────────────────────────────────────────

  return {
    unmount() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      running = false;
      ro.disconnect();
      root.innerHTML = '';
    },

    onResult(res) {
      pendingResult = res;
      maybeShowResult();
    },
  };
}
