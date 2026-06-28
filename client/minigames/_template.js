// Vorlage fuer ein neues Mini-Spiel.
// Kopieren, umbenennen, ausfuellen und in registry.js eintragen.
//
// Wichtig: generate() und validate() muessen ohne DOM auskommen,
// denn der Server ruft sie zur Pruefung ebenfalls auf. Nur mount()
// darf das Document benutzen.

import { pick, shuffle, randomInt } from "../../shared/rng.js";

export default {
  id: "vorlage", // eindeutig, klein geschrieben
  station: "Vorlage",

  // Erzeugt eine Aufgabe aus dem Zufall. Gleicher Seed ergibt dieselbe Aufgabe.
  generate(level, rng) {
    return {
      prompt: "Beschreibung der Aufgabe",
      // ... aufgabenspezifische Daten, z. B. Zielwerte ...
      level,
    };
  },

  // Baut die Controller-UI in root auf. ctx bietet:
  //   ctx.audio.play("ui.toggle"), ctx.submit(input), ctx.station
  // Rueckgabe: Handle mit unmount() und optional onResult(res).
  mount(root, task, ctx) {
    root.innerHTML = `<h1 class="title">${this.station}</h1><p>${task.prompt}</p>`;
    return {
      unmount() {
        root.innerHTML = "";
      },
      onResult(res) {
        // Rueckmeldung des Servers anzeigen.
      },
    };
  },

  // Prueft eine Eingabe gegen die Aufgabe.
  validate(task, input) {
    return { geloest: false, teiltreffer: 0, hinweis: "" };
  },
};
