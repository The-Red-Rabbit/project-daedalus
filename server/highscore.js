// Highscore-Persistenz: Lesen und Schreiben der Bestenliste als JSON-Datei.
// Die Datei liegt unter data/highscores.json im Projektstamm und wird beim
// Beschreiben angelegt, falls sie noch nicht existiert. Ein korruptes oder
// fehlendes File ergibt eine leere Liste, ohne den Server zu stoppen.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const FILE = join(DATA_DIR, "highscores.json");

async function load() {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Sortierung: hoehere Punktzahl zuerst; Gleichstand bricht der frueherer Zeitstempel.
export function sort(list) {
  return [...list].sort((a, b) => b.score - a.score || new Date(a.ts) - new Date(b.ts));
}

// Die besten n Eintraege aus der sortierten Liste (Standard: 10).
export function top(list, n = 10) {
  return sort(list).slice(0, n);
}

// Haengt einen neuen Eintrag an die Datei und liefert die vollstaendige
// (unsortierte) Liste zurueck. Schreibfehler werden geloggt, aber nicht
// weitergegeben, damit ein Disk-Problem das Spiel nicht haengt.
export async function append(entry) {
  const list = await load();
  list.push(entry);
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    console.error("Highscore-Schreiben fehlgeschlagen:", e.message);
  }
  return list;
}

export { load };
