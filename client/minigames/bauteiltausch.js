// Mini-Spiel: Bauteile austauschen (Station Reaktor). Der Spieler identifiziert
// ein defektes elektronisches Bauteil anhand seines Schaltzeichens und tauscht es aus.
// Stufe 1: vier deutlich verschiedene Symbole, Name in der Aufgabe.
// Stufe 2: fuenf aehnlichere Symbole, Name in der Aufgabe.
// Stufe 3: Fehlerbeschreibung statt Name – Bauteil muss erschlossen werden.

// Elektronische Bauteile mit vereinfachten Schaltzeichen und Fehlerbeschreibungen.
const COMPONENTS = [
  {
    id: "widerstand",
    name: "Widerstand",
    symbol: "─[   ]─",   // Rechteck = Symbol fuer Widerstand
    faults: [
      "Das Bauteil begrenzt den Stromfluss im Schaltkreis.",
      "Das Bauteil wandelt elektrische Energie in Wärme um.",
    ],
  },
  {
    id: "kondensator",
    name: "Kondensator",
    symbol: "──||──",      // Zwei Platten = Kondensator-Symbol
    faults: [
      "Das Bauteil speichert elektrische Energie im elektrischen Feld.",
      "Das Bauteil blockiert Gleichstrom und lässt Wechselstrom durch.",
    ],
  },
  {
    id: "spule",
    name: "Spule",
    symbol: "─⌒⌒⌒─",      // Halbkreise = Spulenwicklung
    faults: [
      "Das Bauteil speichert Energie im Magnetfeld.",
      "Das Bauteil blockiert Wechselstrom und lässt Gleichstrom durch.",
    ],
  },
  {
    id: "diode",
    name: "Diode",
    symbol: "─▶|─",        // Gefuellter Pfeil mit Strich = Dioden-Symbol
    faults: [
      "Das Bauteil lässt elektrischen Strom nur in einer Richtung fließen.",
      "Das Bauteil schützt die Schaltung vor Verpolung.",
    ],
  },
  {
    id: "transistor",
    name: "Transistor",
    symbol: "─◁|─",        // Offener Pfeil mit Strich = vereinfachtes Transistor-Symbol
    faults: [
      "Das Bauteil verstärkt elektrische Signale oder schaltet Stromkreise.",
      "Das Bauteil arbeitet als steuerbarer elektronischer Schalter.",
    ],
  },
];

// Stufe 1 nutzt nur die ersten vier Bauteile (deutlich verschiedene Symbole).
const LEVEL1_POOL = COMPONENTS.slice(0, 4);

// Kurze Wortbeschreibung der Schaltzeichen fuer den Hilfe-Hinweis.
const SYMBOL_DESCRIPTIONS = {
  widerstand:  "Leeres Rechteck",
  kondensator: "zwei senkrechte Parallelstriche",
  spule:       "Reihe von Halbbögen",
  diode:       "gefüllter Dreieckspfeil mit Strich",
  transistor:  "offener Dreieckspfeil mit Strich",
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default {
  id: "bauteiltausch",
  station: "Reaktor",
  howto: {
    goal: "Ein Bauteil im Schaltkreis ist defekt. Erkenne sein Schaltzeichen und tausche es aus.",
    example: "Aufgabe: »WIDERSTAND defekt« – tippe auf das rechteckige Symbol.",
  },

  generate(level, rng) {
    const lvl = level >= 3 ? 3 : level >= 2 ? 2 : 1;
    const pool = lvl === 1 ? LEVEL1_POOL : COMPONENTS;
    const target = pick(rng, pool);
    const choices = shuffle(rng, pool).map(c => c.id);

    let prompt;
    if (lvl === 3) {
      const fi = Math.floor(rng() * target.faults.length);
      prompt = target.faults[fi];
    } else {
      prompt = `Defektes Bauteil: ${target.name.toUpperCase()}`;
    }

    return { level: lvl, target: target.id, choices, prompt };
  },

  validate(task, input) {
    if (!input || typeof input.id !== "string") {
      return { geloest: false, teiltreffer: 0, hinweis: "Bauteil auswählen." };
    }
    if (!task.choices.includes(input.id)) {
      return { geloest: false, teiltreffer: 0, hinweis: "Ungültiges Bauteil." };
    }
    const geloest = input.id === task.target;
    const targetComp = COMPONENTS.find(c => c.id === task.target);
    return {
      geloest,
      teiltreffer: geloest ? 1 : 0,
      hinweis: geloest
        ? `Richtiges Bauteil getauscht: ${targetComp.name}.`
        : `Falsch. Gesucht war: ${targetComp.name} (${targetComp.symbol}).`,
    };
  },

  solve(task) {
    return { id: task.target };
  },

  // Hinweistext fuer den Hilfe-Button (DOM-frei, server-autoritaer).
  // Beschreibt das Schaltzeichen des gesuchten Bauteils in Worten.
  hint(task) {
    const comp = COMPONENTS.find(c => c.id === task.target);
    const desc = SYMBOL_DESCRIPTIONS[task.target] || comp.symbol;
    return `Schaltzeichen von ${comp.name}: ${desc}.`;
  },

  mount(root, task, ctx) {
    const IMGS = {
      widerstand:  "/assets/sprites/bauteiltausch/resistor.webp",
      kondensator: "/assets/sprites/bauteiltausch/capasitor.webp",
      spule:       "/assets/sprites/bauteiltausch/coil.webp",
      diode:       "/assets/sprites/bauteiltausch/diode.webp",
      transistor:  "/assets/sprites/bauteiltausch/transistor.webp",
    };
    const comp = (id) => COMPONENTS.find(c => c.id === id);

    root.innerHTML =
      `<div class="bt-prompt-panel">` +
      `<span class="bt-prompt-kicker">Fehlerdiagnose</span>` +
      `<div class="bt-prompt-text">${task.prompt}</div>` +
      `</div>` +
      `<div class="bt-scene">` +
      `<div class="bt-grid" id="bt-grid"></div>` +
      `</div>` +
      `<div class="bc-hint" id="bt-hint" hidden></div>` +
      `<button class="bc-confirm" id="bt-confirm" disabled>Bauteil tauschen</button>`;

    const grid = root.querySelector("#bt-grid");
    const hint = root.querySelector("#bt-hint");
    const confirm = root.querySelector("#bt-confirm");

    // 2 Spalten fuer 4 Bauteile (Stufe 1), 3 Spalten fuer 5 (Stufe 2/3).
    grid.style.gridTemplateColumns = `repeat(${task.choices.length > 4 ? 3 : 2}, 1fr)`;

    let selected = null;

    for (const id of task.choices) {
      const c = comp(id);
      if (!c) continue;
      const btn = document.createElement("button");
      btn.className = "bt-comp";
      btn.dataset.id = id;
      const img = document.createElement("img");
      img.src = IMGS[id] || "";
      img.alt = c.name;
      img.className = "bt-comp-img";
      img.onerror = () => {
        img.remove();
        btn.classList.add("bt-comp-fallback");
        const sym = document.createElement("span");
        sym.className = "bt-comp-symbol";
        sym.textContent = c.symbol;
        btn.appendChild(sym);
      };
      btn.appendChild(img);
      btn.addEventListener("click", () => {
        grid.querySelectorAll(".bt-comp").forEach(b => b.classList.remove("sel"));
        btn.classList.add("sel");
        selected = id;
        confirm.disabled = false;
        ctx.audio.play("ui.toggle");
        hint.hidden = true;
      });
      grid.appendChild(btn);
    }

    confirm.addEventListener("click", () => {
      if (!selected) return;
      ctx.submit({ id: selected });
    });

    return {
      onResult(res) {
        hint.textContent = res.hinweis || "";
        hint.hidden = false;
        if (res.geloest) confirm.disabled = true;
      },
    };
  },
};
