// Mini-Spiel Zahlensysteme (Themenfeld 3 Digitaltechnik, Station Navigation).
// Ziel: einen Zielcode ueber Bit-Kippschalter im Dualsystem nachbauen. Die Stufe
// steuert die Bitbreite und das Quellsystem (dezimal oder hexadezimal). Es gibt
// keine mitlaufende Dezimalanzeige mehr - man muss selbst umrechnen, die Pruefung
// kommt erst nach dem Bestaetigen.
// generate() und validate() sind DOM-frei, damit der Server sie pruefen kann.

import { randomInt } from "../../shared/rng.js";

function popcount(n) {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

function formatTarget(task) {
  if (task.displayBase === 16) return `0x${task.target.toString(16).toUpperCase()} (hexadezimal)`;
  return `${task.target} (dezimal)`;
}

export default {
  id: "zahlensysteme",
  station: "Navigation",

  generate(level, rng) {
    const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;
    const bits = lvl === 1 ? 4 : 8; // Stufe 1: 4 Bit, sonst 8 Bit
    const displayBase = lvl >= 2 ? 16 : 10; // ab Stufe 2 nennt das Ziel in Hex
    const target = randomInt(rng, 0, (1 << bits) - 1);
    return {
      prompt: "Stelle den Zielcode über die Bit-Schalter im Dualsystem ein.",
      level: lvl,
      bits,
      displayBase,
      target,
    };
  },

  validate(task, input) {
    const v = Number(input && input.value);
    const mask = (1 << task.bits) - 1;
    if (!Number.isInteger(v) || v < 0 || v > mask) {
      return { geloest: false, teiltreffer: 0, hinweis: "Bits setzen." };
    }
    const geloest = v === task.target;
    const wrongBits = popcount((v ^ task.target) & mask);
    const teiltreffer = (task.bits - wrongBits) / task.bits;
    let hinweis;
    if (geloest) hinweis = "Code erkannt.";
    else if (v > task.target) hinweis = "Der Wert ist noch zu hoch.";
    else hinweis = "Der Wert ist noch zu niedrig.";
    return { geloest, teiltreffer, hinweis };
  },

  // Liefert eine korrekte Eingabe zur Aufgabe (DOM-frei): der Zielwert selbst.
  // Genutzt von den Debug-Bots und den Tests.
  solve(task) {
    return { value: task.target };
  },

  mount(root, task, ctx) {
    const bitsOn = new Array(task.bits).fill(0); // Index 0 = hoechstwertiges Bit
    const weightOf = (i) => 1 << (task.bits - 1 - i);
    const value = () => bitsOn.reduce((sum, on, i) => sum + (on ? weightOf(i) : 0), 0);

    root.innerHTML =
      `<h1 class="title">Navigation</h1>` +
      `<div class="bc-scenario"><span class="bc-label">Auftrag</span>${task.prompt}</div>` +
      `<div class="zs-target">Zielcode <b>${formatTarget(task)}</b></div>` +
      `<div class="zs-bits"></div>` +
      `<div class="zs-readout">Eingestellt <span class="zs-bin"></span></div>` +
      `<div class="bc-hint zs-hint">Rechne den Zielcode selbst in Bits um, dann bestätigen. Ein Fehlversuch kostet Stabilität.</div>` +
      `<button class="bc-confirm">Bestätigen</button>`;

    const bitsEl = root.querySelector(".zs-bits");
    const binEl = root.querySelector(".zs-bin");
    const hintEl = root.querySelector(".zs-hint");
    const confirmEl = root.querySelector(".bc-confirm");

    // Kein mitlaufender Dezimalwert mehr - nur das eigene Bitmuster als Echo.
    function refresh() {
      binEl.textContent = value().toString(2).padStart(task.bits, "0");
    }

    for (let i = 0; i < task.bits; i++) {
      const b = document.createElement("button");
      b.className = "zs-bit";
      b.innerHTML = `<span class="zs-weight">${weightOf(i)}</span><span class="zs-state">0</span>`;
      b.addEventListener("click", () => {
        bitsOn[i] = bitsOn[i] ? 0 : 1;
        b.classList.toggle("on", !!bitsOn[i]);
        b.querySelector(".zs-state").textContent = bitsOn[i] ? "1" : "0";
        ctx.audio.play("ui.toggle");
        refresh();
      });
      bitsEl.appendChild(b);
    }
    refresh();

    confirmEl.addEventListener("click", () => {
      ctx.audio.play("ui.confirm");
      ctx.submit({ value: value() });
    });

    return {
      unmount() {
        root.innerHTML = "";
      },
      onResult(res) {
        if (res.hinweis) hintEl.textContent = res.geloest ? res.hinweis : `${res.hinweis} Fehlversuch kostet Stabilität.`;
        if (res.geloest) {
          confirmEl.textContent = "Erfasst";
          confirmEl.disabled = true;
        }
      },
    };
  },
};
