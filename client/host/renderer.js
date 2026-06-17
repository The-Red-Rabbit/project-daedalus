// Zeichnet die Schiffsszene auf Canvas im Grimdark-Stil: dunkler Raum mit
// Sternenparallaxe, treibende Asteroiden, die schwer gebaute Daedalus mit
// Triebwerksglut und Abgasfahne, knappes Licht und Vignette. Die Szene
// reagiert auf den Zustand (Treffer-Erschuetterung, Notlicht bei wenig Huelle).
// Alle Farben kommen aus den Designtokens (styles/tokens.css).

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let shakeUntil = 0;
  let shakeMag = 0;
  const stars = [];
  const rocks = [];
  const exhaust = [];
  const sparks = [];
  let state = { huelle: 100, fortschritt: 0 };
  let palette = {};

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const get = (n, fb) => cs.getPropertyValue(n).trim() || fb;
    palette = {
      void: get("--bg-void", "#0d0e10"),
      steel: get("--steel", "#3a4a5a"),
      steelDark: get("--steel-dark", "#232a30"),
      rust: get("--rust", "#6e4a2f"),
      edge: get("--edge", "#2b2e31"),
      orange: get("--accent-orange", "#e8761a"),
      cyan: get("--accent-cyan", "#36d0e0"),
      red: get("--accent-red", "#d23a36"),
      text: get("--text-primary", "#d7d9d2"),
    };
  }

  function hexRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  function seedStars(n) {
    for (let i = 0; i < n; i++) {
      const layer = Math.random(); // 0 fern .. 1 nah
      stars.push({ x: Math.random(), y: Math.random(), z: layer, s: 0.4 + layer * 1.4 });
    }
  }

  // Unregelmaessiger Asteroid: zufaelliges Polygon, das einmal vorberechnet wird.
  function makeRock(layer) {
    const verts = [];
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.62 + Math.random() * 0.38;
      verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const base = layer * 18;
    return {
      x: Math.random() * 1.2,
      y: Math.random(),
      r: base + 10 + Math.random() * 14,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.01,
      vx: -(0.006 + Math.random() * 0.02) * (0.5 + layer),
      layer,
      verts,
    };
  }
  function seedRocks(n) {
    for (let i = 0; i < n; i++) rocks.push(makeRock(i % 2 === 0 ? 0.3 : 0.9));
  }

  function drawShip(w, h, t) {
    const bob = Math.sin(t / 900) * 4;
    const cx = w * 0.5;
    const cy = h * 0.5 + bob;

    // Abgasfahne aus den Triebwerken (nach hinten, also nach links).
    exhaust.push({ x: cx - 92, y: cy - 6 + (Math.random() - 0.5) * 8, life: 1, vx: -1.4 - Math.random() });
    exhaust.push({ x: cx - 92, y: cy + 6 + (Math.random() - 0.5) * 8, life: 1, vx: -1.4 - Math.random() });

    ctx.save();
    ctx.translate(cx, cy);

    // Triebwerksglut (Radialverlauf).
    const glow = ctx.createRadialGradient(-96, 0, 2, -96, 0, 40);
    glow.addColorStop(0, rgba(palette.cyan, 0.55));
    glow.addColorStop(1, rgba(palette.cyan, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(-150, -40, 110, 80);

    // Rumpf als kantiges Polygon.
    ctx.fillStyle = palette.steel;
    ctx.beginPath();
    ctx.moveTo(-78, -20);
    ctx.lineTo(64, -22);
    ctx.lineTo(92, 0);
    ctx.lineTo(64, 22);
    ctx.lineTo(-78, 20);
    ctx.closePath();
    ctx.fill();

    // Plattenlinien und Abnutzung.
    ctx.strokeStyle = rgba(palette.steelDark, 0.9);
    ctx.lineWidth = 2;
    for (const x of [-50, -20, 12, 42]) {
      ctx.beginPath();
      ctx.moveTo(x, -20);
      ctx.lineTo(x, 20);
      ctx.stroke();
    }

    // Triebwerksbloecke hinten.
    ctx.fillStyle = palette.steelDark;
    ctx.fillRect(-96, -16, 22, 12);
    ctx.fillRect(-96, 4, 22, 12);

    // Warnstreifen.
    ctx.fillStyle = palette.orange;
    ctx.fillRect(-30, -22, 9, 44);

    // Brueckenkuppel mit kaltem Licht.
    ctx.fillStyle = palette.steelDark;
    ctx.fillRect(40, -10, 26, 20);
    ctx.fillStyle = rgba(palette.cyan, 0.9);
    ctx.fillRect(72, -5, 12, 10);

    // Blinkendes Navlicht.
    if (Math.sin(t / 280) > 0.6) {
      ctx.fillStyle = palette.red;
      ctx.fillRect(-2, -26, 5, 5);
    }
    ctx.restore();
  }

  function drawRock(a, w, h) {
    const shade = a.layer < 0.6 ? palette.steelDark : palette.rust;
    ctx.save();
    ctx.translate(a.x * w, a.y * h);
    ctx.rotate(a.rot);
    ctx.fillStyle = shade;
    ctx.beginPath();
    a.verts.forEach((v, i) => {
      const px = v[0] * a.r;
      const py = v[1] * a.r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    // Lichtkante oben links.
    ctx.strokeStyle = rgba(palette.text, 0.12);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w) return requestAnimationFrame(draw);
    const t = Date.now();

    let ox = 0;
    let oy = 0;
    if (t < shakeUntil) {
      const k = shakeMag * ((shakeUntil - t) / 400);
      ox = (Math.random() - 0.5) * k;
      oy = (Math.random() - 0.5) * k;
    }
    ctx.save();
    ctx.translate(ox, oy);

    // Grundflaeche.
    ctx.fillStyle = palette.void;
    ctx.fillRect(-30, -30, w + 60, h + 60);

    // Sternenparallaxe.
    for (const st of stars) {
      st.x -= (0.0006 + st.z * 0.0016);
      if (st.x < -0.02) st.x = 1.02;
      ctx.fillStyle = rgba(palette.text, 0.15 + st.z * 0.4);
      ctx.fillRect(st.x * w, st.y * h, st.s, st.s);
    }

    // Ferne Asteroiden zuerst.
    for (const a of rocks) {
      a.x += a.vx / 60;
      a.rot += a.spin;
      if (a.x < -0.15) {
        a.x = 1.15;
        a.y = Math.random();
      }
      if (a.layer < 0.6) drawRock(a, w, h);
    }

    // Abgaspartikel.
    for (let i = exhaust.length - 1; i >= 0; i--) {
      const p = exhaust[i];
      p.x += p.vx;
      p.life -= 0.04;
      if (p.life <= 0) {
        exhaust.splice(i, 1);
        continue;
      }
      ctx.fillStyle = rgba(palette.cyan, p.life * 0.4);
      ctx.fillRect(p.x, p.y, 3, 3);
    }

    drawShip(w, h, t);

    // Nahe Asteroiden ueber dem Schiff.
    for (const a of rocks) if (a.layer >= 0.6) drawRock(a, w, h);

    // Funken bei Treffern.
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.06;
      s.life -= 0.03;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.fillStyle = rgba(palette.orange, s.life);
      ctx.fillRect(s.x, s.y, 2.5, 2.5);
    }

    // Knappes Licht: Vignette.
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.18, w / 2, h / 2, h * 0.9);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.74)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Notlicht bei wenig Huelle: pulsierender roter Saum, gelegentliches Flackern.
    if (state.huelle <= 30) {
      const pulse = 0.18 + 0.12 * Math.sin(t / 180);
      const flick = Math.random() < 0.04 ? 0.18 : 0;
      ctx.fillStyle = rgba(palette.red, pulse + flick);
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
    requestAnimationFrame(draw);
  }

  return {
    setState(s) {
      if (s && s.shared) state = s.shared;
    },
    shake(ms = 420, mag = 12) {
      shakeUntil = Date.now() + ms;
      shakeMag = mag;
      const cx = canvas.clientWidth * 0.5;
      const cy = canvas.clientHeight * 0.5;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 4;
        sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
      }
    },
    start() {
      readPalette();
      resize();
      if (!stars.length) seedStars(90);
      if (!rocks.length) seedRocks(10);
      requestAnimationFrame(draw);
    },
  };
}
