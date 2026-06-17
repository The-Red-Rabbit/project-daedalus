// Audio-Engine: synthetisierte Cues mit optionalen Datei-Slots.
// Liegt unter assets/audio/<cue>.mp3 eine Datei, wird sie bevorzugt,
// sonst spielt die einfache Synthese. Klanglich ist das ein Startpunkt
// in Richtung Industrie, der spaeter durch echte Samples ersetzt wird.

const SAMPLE_BASE = "/assets/audio/";

export function createAudio() {
  let ctx = null;
  const buffers = new Map();
  let sampleSet = null; // Set der vorhandenen Sample-Cues, einmalig geladen
  let ambient = null;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  // Vom ersten Antippen aus aufrufen, sonst bleibt Audio stumm (Browser-Regel).
  async function unlock() {
    ensure();
    if (ctx.state === "suspended") await ctx.resume();
  }

  // Liest einmalig assets/audio/manifest.json (eine Liste vorhandener Cues).
  // Nur gelistete Cues werden als Datei geladen, sonst entstuenden 404-Anfragen
  // fuer jedes fehlende Sample. Fehlt das Manifest, gilt: keine Samples.
  async function loadSampleSet() {
    if (sampleSet) return sampleSet;
    try {
      const res = await fetch(`${SAMPLE_BASE}manifest.json`);
      const list = res.ok ? await res.json() : [];
      sampleSet = new Set(Array.isArray(list) ? list : []);
    } catch {
      sampleSet = new Set();
    }
    return sampleSet;
  }

  async function tryLoadSample(cue) {
    if (buffers.has(cue)) return buffers.get(cue);
    const present = await loadSampleSet();
    if (!present.has(cue)) {
      buffers.set(cue, null);
      return null;
    }
    try {
      const res = await fetch(`${SAMPLE_BASE}${cue}.mp3`);
      if (!res.ok) throw new Error("kein Sample");
      const arr = await res.arrayBuffer();
      const buf = await ensure().decodeAudioData(arr);
      buffers.set(cue, buf);
      return buf;
    } catch {
      buffers.set(cue, null);
      return null;
    }
  }

  function playSample(buf, gain) {
    const c = ensure();
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g).connect(c.destination);
    src.start();
  }

  function noiseBurst(dur, { lowpass = 2000, gain = 0.3 } = {}) {
    const c = ensure();
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = lowpass;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(lp).connect(g).connect(c.destination);
    src.start();
  }

  function tone(freq, dur, { type = "sawtooth", gain = 0.2, sweepTo = null } = {}) {
    const c = ensure();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (sweepTo) osc.frequency.linearRampToValueAtTime(sweepTo, c.currentTime + dur);
    g.gain.value = gain;
    g.gain.linearRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  // Cue-Katalog. Siehe CLAUDE.md, Abschnitt Audio-Design.
  const synth = {
    "ui.toggle": () => noiseBurst(0.05, { lowpass: 4000, gain: 0.25 }),
    "ui.confirm": () => tone(90, 0.18, { type: "square", gain: 0.25 }),
    "ui.error": () => tone(120, 0.3, { type: "sawtooth", gain: 0.2 }),
    "station.stabilize": () => noiseBurst(0.4, { lowpass: 1200, gain: 0.2 }),
    "alarm.asteroid": () => tone(380, 0.8, { type: "sawtooth", gain: 0.2, sweepTo: 760 }),
    "impact.hull": () => noiseBurst(0.25, { lowpass: 600, gain: 0.4 }),
    "progress.tick": () => noiseBurst(0.04, { lowpass: 3000, gain: 0.15 }),
  };

  async function play(cue, gain = 1) {
    ensure();
    const buf = await tryLoadSample(cue);
    if (buf) return playSample(buf, gain);
    if (synth[cue]) synth[cue]();
  }

  function startAmbient() {
    const c = ensure();
    if (ambient) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 55;
    g.gain.value = 0.06;
    osc.connect(g).connect(c.destination);
    osc.start();
    ambient = { osc, g };
    // TODO: Neonroehren-Flackern und mehrere geschichtete Quellen.
  }

  return { unlock, play, startAmbient };
}
