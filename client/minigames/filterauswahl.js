// Mini-Spiel „Filter auswählen" (Themenfeld 2, Station Sensorik).
// Drei Asteroiden kommen nacheinander; jeder trägt eine Signalfrequenz.
// Der Spieler wählt den passenden Filter (Tiefpass / Hochpass / Bandpass).
//
// Stufe 1: fc zufällig aus [500, 1000, 2000, 5000] Hz, Anzeige in Hz.
// Stufe 2: fc zufällig aus [200, 500, 1000, 2000] Hz, Einheiten gemischt.
// Stufe 3: fL und fH zufällig, Bandpass kommt dazu.
//
// generate() und validate() sind DOM-frei (Server-Prüfung).

import { pick } from "../../shared/rng.js";

// ─── Konstanten ──────────────────────────────────────────────────────────────

// Kandidaten für die Grenzfrequenz je Stufe (Hz).
// Stufe 3: low und high so gewählt, dass fL stets deutlich unter fH liegt.
const FC_OPTIONS = {
  1: { low: [500, 1000, 2000, 5000] },
  2: { low: [200, 500, 1000, 2000] },
  3: { low: [100, 200, 300, 500], high: [2000, 3000, 5000, 10000] },
};

// Feste Winkel der Radarblips für Asteroiden 0–2 (Bogenmaß, Uhrzeigersinn ab rechts)
const BLIP_ANGLES = [
  Math.PI * 0.28,   // oben rechts
  Math.PI * 1.08,   // unten links
  Math.PI * 1.72,   // unten rechts
];

// ─── Hilfsfunktionen (DOM-frei) ──────────────────────────────────────────────

/** Zufallsganzzahl im Bereich [minHz, maxHz]. */
function getRandomFrequency(rng, minHz, maxHz) {
  return Math.round(minHz + rng() * (maxHz - minHz));
}

/**
 * Wandelt einen Hz-Wert in die gewünschte Einheit um.
 * toPrecision(3) entfernt überflüssige Nullen durch parseFloat.
 */
function toDisplay(hz, unit) {
  if (unit === "kHz") return { value: parseFloat((hz / 1000).toPrecision(3)), unit: "kHz" };
  if (unit === "MHz") return { value: parseFloat((hz / 1e6).toPrecision(3)), unit: "MHz" };
  return { value: Math.round(hz), unit: "Hz" };
}

/** Formatiert Frequenzwert + Einheit als String (schmales Leerzeichen vor Einheit). */
function fmtFreq(displayValue, displayUnit) {
  return `${displayValue} ${displayUnit}`;
}

/** Fisher-Yates-Mischung deterministisch mit dem RNG. */
function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Wählt eine Anzeigeeinheit passend zur Frequenz und Stufe.
 * MHz nur ab 1000 Hz, damit die Zahl lesbar bleibt.
 */
function chooseUnit(rng, hz, level, filterType) {
  if (level === 1) return "Hz";
  if (level === 3) return pick(rng, ["Hz", "kHz"]);
  // Stufe 2: Tiefpass → Hz/kHz; Hochpass → alle drei (MHz nur wenn groß genug)
  if (filterType === "Tiefpass") return pick(rng, ["Hz", "kHz"]);
  return hz >= 1000 ? pick(rng, ["Hz", "kHz", "MHz"]) : pick(rng, ["Hz", "kHz"]);
}

/**
 * Baut einen Asteroiden-Datensatz für den gegebenen Filtertyp.
 * Frequenz liegt sicher innerhalb des richtigen Bands (10 % Abstand zur Grenze).
 */
function buildAsteroid(rng, filterType, fcLow, fcHigh, level) {
  const fcTop = fcHigh ?? fcLow;
  let hz;
  if (filterType === "Tiefpass")       hz = getRandomFrequency(rng, 30,        fcLow * 0.88);
  else if (filterType === "Hochpass")  hz = getRandomFrequency(rng, fcTop * 1.12, fcTop * 10);
  else                                 hz = getRandomFrequency(rng, fcLow * 1.1,  fcHigh * 0.9);

  const unit = chooseUnit(rng, hz, level, filterType);
  const { value, unit: u } = toDisplay(hz, unit);
  return { hz, displayValue: value, displayUnit: u, correct: filterType };
}

// ─── Radar-Canvas (Browser-only, nur innerhalb von mount()) ──────────────────

/**
 * Startet die Sweep-Animation auf dem Canvas.
 * Gibt { stop(), setStatus(i, status) } zurück.
 * Statuswerte: "pending" | "correct" | "wrong"
 */
function startRadarAnimation(canvas, getActiveIndex) {
  const rctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const maxR = Math.min(cx, cy) - 4;

  let sweepAngle = 0;
  const status = BLIP_ANGLES.map(() => "pending");
  let frameId;

  function draw() {
    rctx.clearRect(0, 0, W, H);

    // Hintergrundkreis
    rctx.fillStyle = "#030d03";
    rctx.beginPath();
    rctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    rctx.fill();

    // Gitterringe
    rctx.strokeStyle = "rgba(90,107,58,0.25)";
    rctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      rctx.beginPath();
      rctx.arc(cx, cy, maxR * i / 4, 0, Math.PI * 2);
      rctx.stroke();
    }

    // Fadenkreuz
    rctx.strokeStyle = "rgba(90,107,58,0.3)";
    rctx.lineWidth = 1;
    rctx.beginPath();
    rctx.moveTo(cx - maxR, cy); rctx.lineTo(cx + maxR, cy);
    rctx.moveTo(cx, cy - maxR); rctx.lineTo(cx, cy + maxR);
    rctx.stroke();

    // Sweep-Spur (8 abklingende Linien hinter dem Zeiger)
    for (let t = 7; t >= 0; t--) {
      const a = sweepAngle - t * 0.07;
      const alpha = (1 - t / 8) * (t === 0 ? 0.9 : 0.1);
      rctx.strokeStyle = `rgba(100,200,80,${alpha})`;
      rctx.lineWidth = t === 0 ? 2 : 1;
      rctx.beginPath();
      rctx.moveTo(cx, cy);
      rctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a));
      rctx.stroke();
    }

    // Asteroiden-Blips
    const activeIdx = getActiveIndex();
    BLIP_ANGLES.forEach((bAngle, i) => {
      if (status[i] === "gone") return;

      const bR = maxR * 0.62;
      const bx = cx + bR * Math.cos(bAngle);
      const by = cy + bR * Math.sin(bAngle);

      // Annäherung des Sweep-Zeigers → Glow berechnen
      let diff = ((sweepAngle - bAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      const glow = diff < 0.45 ? Math.max(0, 1 - diff / 0.45) : 0;

      // Farbe je nach Status
      let rgb;
      if (status[i] === "correct")     rgb = "80,220,100";
      else if (status[i] === "wrong")  rgb = "220,70,50";
      else if (i === activeIdx)        rgb = "60,230,150";
      else                             rgb = "70,130,60";

      const isActive = i === activeIdx && status[i] === "pending";
      const baseAlpha = isActive ? 0.8 : 0.3;
      const dotR = isActive ? 5 + glow * 3 : 3;

      rctx.fillStyle = `rgba(${rgb},${Math.min(1, baseAlpha + glow * 0.35)})`;
      rctx.beginPath();
      rctx.arc(bx, by, dotR, 0, Math.PI * 2);
      rctx.fill();

      // Glühring beim aktiven Blip wenn Sweep vorbeizieht
      if (glow > 0.15 && isActive) {
        rctx.strokeStyle = `rgba(${rgb},${glow * 0.3})`;
        rctx.lineWidth = 1;
        rctx.beginPath();
        rctx.arc(bx, by, dotR + 7, 0, Math.PI * 2);
        rctx.stroke();
      }
    });

    // Äußerer Rahmen
    rctx.strokeStyle = "rgba(90,107,58,0.8)";
    rctx.lineWidth = 2;
    rctx.beginPath();
    rctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    rctx.stroke();

    sweepAngle = (sweepAngle + 0.022) % (Math.PI * 2);
    frameId = requestAnimationFrame(draw);
  }

  draw();
  return {
    stop()          { cancelAnimationFrame(frameId); },
    setStatus(i, s) { status[i] = s; },
  };
}

// ─── CSS (einmalig in <head> injiziert, in unmount() wieder entfernt) ─────────

const FA2_CSS = `
/* === Filterauswahl-Minispiel (fa2) === */
.fa2-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0 12px 16px;
}
.fa2-header {
  width: 100%;
  padding: 4px 0;
}
.fa2-fc-display {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--text-muted);
}
.fa2-fc-val {
  color: var(--accent-cyan);
  font-weight: bold;
}
.fa2-radar {
  display: block;
  border-radius: 50%;
  box-shadow: 0 0 20px rgba(90,107,58,0.4), 0 0 6px rgba(90,107,58,0.7);
}
.fa2-freq-hud {
  margin-top: 6px;
  text-align: center;
  font-family: var(--font-mono);
}
.fa2-freq-label {
  font-size: 0.58rem;
  letter-spacing: 0.18em;
  color: var(--mil-green);
  text-transform: uppercase;
}
.fa2-freq-value {
  font-size: 1.85rem;
  font-weight: bold;
  color: var(--accent-green);
  text-shadow: 0 0 10px rgba(155,191,106,0.5);
  letter-spacing: 0.04em;
  min-height: 2.3rem;
}
.fa2-progress {
  font-size: 0.68rem;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.6;
}
.fa2-feedback {
  min-height: 1.3em;
  font-size: 0.82rem;
  text-align: center;
  color: var(--text-muted);
  transition: color 0.2s;
  padding: 0 8px;
}
.fa2-feedback--ok  { color: var(--accent-green); }
.fa2-feedback--err { color: var(--accent-red); }
.fa2-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}
.fa2-filter-btn { min-width: 82px; }
.fa2-filter-btn.correct {
  background: rgba(155,191,106,0.18) !important;
  border-color: var(--accent-green) !important;
  color: var(--accent-green) !important;
}
.fa2-filter-btn.wrong {
  background: rgba(210,58,54,0.18) !important;
  border-color: var(--accent-red) !important;
  color: var(--accent-red) !important;
}
`;

// ─── Mini-Spiel-Export ───────────────────────────────────────────────────────

export default {
  id: "filterauswahl",
  station: "Sensorik",

  howto: {
    goal: "Drei Asteroiden kommen auf die Daedalus zu – jeder trägt eine Signalfrequenz. Wähle den richtigen Filter, um jede Asteroiden-Frequenz zu verstärken.",
    example: "Beispiel: fc = 1 kHz, Signal = 300 Hz → Tiefpass. Signal = 2 kHz → Hochpass.",
  },

  generate(level, rng) {
    const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;
    const opts = FC_OPTIONS[lvl];

    // Grenzfrequenzen zufällig aus den Kandidatenlisten wählen.
    const fcLow  = pick(rng, opts.low);
    const fcHigh = lvl === 3 ? pick(rng, opts.high) : undefined;

    // Stufe 3: alle drei Filtertypen erscheinen genau einmal.
    // Stufen 1–2: Tief- und Hochpass, mindestens einer von jedem.
    let types;
    if (lvl === 3) {
      types = shuffle(rng, ["Tiefpass", "Hochpass", "Bandpass"]);
    } else {
      types = shuffle(rng, ["Tiefpass", "Hochpass", pick(rng, ["Tiefpass", "Hochpass"])]);
    }

    const asteroids = types.map(t => buildAsteroid(rng, t, fcLow, fcHigh, lvl));
    return { level: lvl, asteroids, fcLow, fcHigh };
  },

  validate(task, input) {
    if (!input || !Array.isArray(input.answers)) {
      return { geloest: false, teiltreffer: 0, hinweis: "Keine Antworten eingegangen." };
    }
    const { asteroids } = task;
    let correct = 0;
    const errors = [];
    for (let i = 0; i < asteroids.length; i++) {
      if (input.answers[i] === asteroids[i].correct) {
        correct++;
      } else {
        errors.push(`Asteroid ${i + 1}: ${asteroids[i].correct} erwartet`);
      }
    }
    const geloest = correct === asteroids.length;
    return {
      geloest,
      teiltreffer: correct / asteroids.length,
      hinweis: geloest
        ? "Alle Asteroiden absorbiert – Sensorik kalibriert!"
        : errors.join("; ") + ".",
    };
  },

  solve(task) {
    return { answers: task.asteroids.map(a => a.correct) };
  },

  hint(task) {
    const { fcLow, fcHigh, asteroids } = task;

    // Filterregeln
    let filterLines;
    if (fcHigh !== undefined) {
      filterLines =
        `• Frequenz < ${fcLow} Hz → Tiefpass (Low-Pass)\n` +
        `• ${fcLow} Hz < Frequenz < ${fcHigh} Hz → Bandpass (Band-Pass)\n` +
        `• Frequenz > ${fcHigh} Hz → Hochpass (High-Pass)`;
    } else {
      const fcStr = fcLow >= 1000 ? `${fcLow / 1000} kHz` : `${fcLow} Hz`;
      filterLines =
        `• Frequenz < ${fcStr} → Tiefpass (Low-Pass)\n` +
        `• Frequenz > ${fcStr} → Hochpass (High-Pass)`;
    }

    // Umrechnungen für Asteroiden, die nicht in Hz angezeigt werden
    const conversions = asteroids
      .filter(a => a.displayUnit !== "Hz")
      .map(a => `• ${a.displayValue} ${a.displayUnit} = ${a.hz} Hz`);
    const convBlock = conversions.length > 0
      ? "\n\nEinheitenumrechnung:\n" + conversions.join("\n")
      : "";

    return filterLines + convBlock;
  },

  mount(root, task, ctx) {
    // Styles einmalig in <head> einbinden (ID verhindert Dopplung)
    if (!document.querySelector("#fa2-style")) {
      const s = document.createElement("style");
      s.id = "fa2-style";
      s.textContent = FA2_CSS;
      document.head.appendChild(s);
    }

    // ── Spielzustand ──
    let asteroidIndex = 0;
    const answers = [];
    let inputLocked = false;
    let radar = null;

    // ── HTML aufbauen ──
    const { fcLow, fcHigh } = task;
    const hasBandpass = fcHigh !== undefined;
    const fcLabel = hasBandpass
      ? `f<sub>L</sub> = ${fcLow} Hz &nbsp;|&nbsp; f<sub>H</sub> = ${fcHigh} Hz`
      : fcLow >= 1000
        ? `f<sub>c</sub> = ${fcLow / 1000} kHz`
        : `f<sub>c</sub> = ${fcLow} Hz`;

    root.innerHTML =
      `<div class="fa2-wrap">` +
        `<h1 class="title">Sensorik</h1>` +
        `<div class="fa2-header">` +
          `<div class="fa2-fc-display">` +
            `Grenzfrequenz: <span class="fa2-fc-val">${fcLabel}</span>` +
          `</div>` +
        `</div>` +
        `<canvas class="fa2-radar" id="fa2-radar" width="200" height="200"></canvas>` +
        `<div class="fa2-freq-hud">` +
          `<div class="fa2-freq-label">Signal eingehend</div>` +
          `<div class="fa2-freq-value" id="fa2-freq-val">&mdash;</div>` +
        `</div>` +
        `<div class="fa2-progress" id="fa2-progress">Asteroid 1 von 3</div>` +
        `<div class="fa2-feedback" id="fa2-feedback">&nbsp;</div>` +
        `<div class="fa2-btns" id="fa2-btns">` +
          `<button class="tp-mode-btn fa2-filter-btn" data-filter="Tiefpass">Tiefpass</button>` +
          (hasBandpass
            ? `<button class="tp-mode-btn fa2-filter-btn" data-filter="Bandpass">Bandpass</button>`
            : "") +
          `<button class="tp-mode-btn fa2-filter-btn" data-filter="Hochpass">Hochpass</button>` +
        `</div>` +
      `</div>`;

    // DOM-Referenzen
    const canvas     = root.querySelector("#fa2-radar");
    const freqValEl  = root.querySelector("#fa2-freq-val");
    const progressEl = root.querySelector("#fa2-progress");
    const feedbackEl = root.querySelector("#fa2-feedback");
    const btnsEl     = root.querySelector("#fa2-btns");

    // Radar starten
    radar = startRadarAnimation(canvas, () => asteroidIndex);

    // ── Ablaufsteuerung ──

    function loadAsteroid(i) {
      const a = task.asteroids[i];
      progressEl.textContent = `Asteroid ${i + 1} von ${task.asteroids.length}`;
      freqValEl.textContent  = fmtFreq(a.displayValue, a.displayUnit);
      feedbackEl.textContent = " ";
      feedbackEl.className   = "fa2-feedback";
      inputLocked = false;
      btnsEl.querySelectorAll(".fa2-filter-btn").forEach(b => {
        b.disabled = false;
        b.classList.remove("correct", "wrong");
      });
    }

    function handleFilter(chosen) {
      if (inputLocked) return;
      inputLocked = true;
      ctx.audio.play("ui.toggle");

      const a    = task.asteroids[asteroidIndex];
      const isOk = chosen === a.correct;
      answers.push(chosen);

      // Buttons einfärben: richtiger Kandidat grün, falsche Wahl rot
      btnsEl.querySelectorAll(".fa2-filter-btn").forEach(b => {
        b.disabled = true;
        if (b.dataset.filter === a.correct)           b.classList.add("correct");
        if (b.dataset.filter === chosen && !isOk)     b.classList.add("wrong");
      });

      if (isOk) {
        feedbackEl.textContent = "✓ Absorbiert!";
        feedbackEl.className   = "fa2-feedback fa2-feedback--ok";
        radar.setStatus(asteroidIndex, "correct");
        ctx.audio.play("station.stabilize");
      } else {
        feedbackEl.textContent = `✗ Richtig wäre: ${a.correct}`;
        feedbackEl.className   = "fa2-feedback fa2-feedback--err";
        radar.setStatus(asteroidIndex, "wrong");
        ctx.audio.play("ui.error");
      }

      // Falscher Filter → Runde sofort beenden; letzter Treffer → Runde abschließen
      setTimeout(() => {
        asteroidIndex++;
        if (!isOk || asteroidIndex >= task.asteroids.length) {
          finishRound();
        } else {
          loadAsteroid(asteroidIndex);
        }
      }, 880);
    }

    function finishRound() {
      // Sicherheitsnetz: fehlende Antworten auffüllen
      while (answers.length < task.asteroids.length) answers.push(null);
      const isWon = answers.every((a, i) => a === task.asteroids[i].correct);
      ctx.submit({ answers });
      // Bei Fehlversuch: Controller ins Menue leiten (kein Retry auf der gleichen Aufgabe)
      if (!isWon) ctx.lost();
    }

    // Button-Listener
    btnsEl.querySelectorAll(".fa2-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => handleFilter(btn.dataset.filter));
    });

    // Ersten Asteroiden anzeigen
    loadAsteroid(0);

    // ── Handle ──
    return {
      unmount() {
        if (radar) radar.stop();
        const s = document.querySelector("#fa2-style");
        if (s) s.remove();
        root.innerHTML = "";
      },

      onResult(res) {
        const fb = root.querySelector("#fa2-feedback");
        if (!fb) return;
        fb.textContent = res.hinweis || "";
        fb.className   = `fa2-feedback ${res.geloest ? "fa2-feedback--ok" : "fa2-feedback--err"}`;
      },
    };
  },
};
