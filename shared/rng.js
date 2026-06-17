// Deterministischer Zufall: gleicher Seed ergibt dieselbe Folge.
// So kann der Server eine vom Client erzeugte Aufgabe nachbauen und pruefen.
// Grundlage ist mulberry32, ein kompakter Pseudozufallsgenerator.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ganzzahl in [minInclusive, maxInclusive].
export function randomInt(rng, minInclusive, maxInclusive) {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

// Ein zufaelliges Element aus einem Array.
export function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

// Kopie des Arrays in zufaelliger Reihenfolge (Fisher-Yates).
export function shuffle(rng, array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Frischer Seed fuer eine neue Aufgabe.
export function makeSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
