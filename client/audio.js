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
  let alarmBed = null;

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

  function tone(freq, dur, { type = "sawtooth", gain = 0.2, sweepTo = null, delay = 0 } = {}) {
    const c = ensure();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.linearRampToValueAtTime(sweepTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  // Cue-Katalog. Siehe CLAUDE.md, Abschnitt Audio-Design.
  const synth = {
    "ui.toggle": () => noiseBurst(0.05, { lowpass: 4000, gain: 0.25 }),
    // schwerer Verschluss: zwei kurze tiefe Schlaege
    "ui.confirm": () => {
      tone(120, 0.08, { type: "square", gain: 0.3 });
      tone(70, 0.16, { type: "square", gain: 0.28, delay: 0.06 });
    },
    "ui.error": () => tone(120, 0.3, { type: "sawtooth", gain: 0.2 }),
    // zischende Druckluft mit kurzem Abklingen
    "station.stabilize": () => noiseBurst(0.45, { lowpass: 1600, gain: 0.18 }),
    "alarm.asteroid": () => tone(380, 0.8, { type: "sawtooth", gain: 0.2, sweepTo: 760 }),
    // dumpfer Metallschlag: tiefer Stoss plus gefiltertes Rauschen
    "impact.hull": () => {
      tone(70, 0.28, { type: "sine", gain: 0.5 });
      noiseBurst(0.3, { lowpass: 500, gain: 0.45 });
    },
    "progress.tick": () => noiseBurst(0.04, { lowpass: 3000, gain: 0.15 }),
  };

  async function play(cue, gain = 1) {
    ensure();
    const buf = await tryLoadSample(cue);
    if (buf) return playSample(buf, gain);
    if (synth[cue]) synth[cue]();
  }

  // Endlosschleife aus weissem Rauschen als Quelle fuer Rumpeln und Flackern.
  function loopNoise() {
    const c = ensure();
    const n = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  // Geschichtete Klangkulisse: zwei leicht verstimmte Brummschichten, tiefes
  // Rumpeln und ein langsam waberndes Neonroehren-Flackern.
  function startAmbient() {
    const c = ensure();
    if (ambient) return;
    const master = c.createGain();
    master.gain.value = 1;
    master.connect(c.destination);

    const hum = (type, freq, gain) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g).connect(master);
      o.start();
      return o;
    };
    const h1 = hum("triangle", 48, 0.05);
    const h2 = hum("sine", 55, 0.04); // leichte Schwebung gegen h1

    // Tiefes Rumpeln.
    const rumble = loopNoise();
    const rlp = c.createBiquadFilter();
    rlp.type = "lowpass";
    rlp.frequency.value = 140;
    const rg = c.createGain();
    rg.gain.value = 0.05;
    rumble.connect(rlp).connect(rg).connect(master);
    rumble.start();

    // Neonroehren-Flackern: schmalbandiges Rauschen, langsam in der Lautstaerke moduliert.
    const neon = loopNoise();
    const nbp = c.createBiquadFilter();
    nbp.type = "bandpass";
    nbp.frequency.value = 1600;
    nbp.Q.value = 0.8;
    const ng = c.createGain();
    ng.gain.value = 0.012;
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain).connect(ng.gain);
    neon.connect(nbp).connect(ng).connect(master);
    neon.start();
    lfo.start();

    ambient = { master, sources: [h1, h2, rumble, neon, lfo] };
  }

  // Alarmbett bei kritischer Lage: pulsierender tiefer Ton, an- und abschaltbar.
  function setAlarm(on) {
    const c = ensure();
    if (on && !alarmBed) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 116;
      const g = c.createGain();
      g.gain.value = 0.03;
      const lfo = c.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 1.7;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 0.03; // Lautstaerke pulst zwischen 0 und 0.06
      lfo.connect(lfoGain).connect(g.gain);
      o.connect(g).connect(c.destination);
      o.start();
      lfo.start();
      alarmBed = { o, lfo };
    } else if (!on && alarmBed) {
      alarmBed.o.stop();
      alarmBed.lfo.stop();
      alarmBed = null;
    }
  }

  return { unlock, play, startAmbient, setAlarm };
}
