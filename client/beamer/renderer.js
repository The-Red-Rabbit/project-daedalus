// Beamer-Szene aus der Perspektive der Bruecke: Blick durch das Cockpitfenster
// ins All. Winzige Sterne und schwere Asteroiden kommen aus der Tiefe auf die
// Crew zu und vermitteln so die Eigenbewegung des Schiffs. Ueber die Szene legt
// sich das Cockpit-Sprite (beamer-screen-overlay.png): sein durchsichtiges
// Fenster gibt das All frei, der massive Rahmen verdeckt alles ausserhalb.
// Alle Farben kommen aus den Designtokens (styles/tokens.css).

// Lage des durchsichtigen Fensters im Sprite (Anteile der Sprite-Masse),
// einmal aus der PNG vermessen. Der Fluchtpunkt sitzt in dessen Mitte.
const COCKPIT_SRC = "/assets/sprites/beamer-screen-overlay.png";
const WIN_CX = 0.499; // Fenstermitte horizontal
const WIN_CY = 0.394; // Fenstermitte vertikal

// Abstimmwerte der Tiefe und des Tempos (z laeuft von ZFAR fern nach ZNEAR nah).
const ZFAR = 1.0;
const ZNEAR = 0.06;
const STAR_COUNT = 260;
const ROCK_COUNT = 20;
const STAR_SPEED = 0.26; // z pro Sekunde
const ROCK_SPEED = 0.16; // z pro Sekunde
const FOCAL_FACTOR = 0.6; // Streuung am fernen Rand (Anteil der Sprite-Hoehe)

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const stars = [];
  const rocks = [];
  const sparks = [];
  let shakeUntil = 0;
  let shakeMag = 0;
  let state = { huelle: 100 };
  let palette = {};
  let last = 0;

  const cockpit = new Image();
  let cockpitReady = false;
  cockpit.addEventListener("load", () => { cockpitReady = true; });
  cockpit.src = COCKPIT_SRC;

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const get = (n, fb) => cs.getPropertyValue(n).trim() || fb;
    palette = {
      void: get("--bg-void", "#0d0e10"),
      steel: get("--steel", "#3a4a5a"),
      steelDark: get("--steel-dark", "#232a30"),
      rust: get("--rust", "#6e4a2f"),
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
  // Mischfarbe zwischen zwei Tokens (0 = a, 1 = b) fuer die Tiefenschattierung.
  function mix(a, b, k) {
    const [ar, ag, ab] = hexRgb(a);
    const [br, bg, bb] = hexRgb(b);
    const r = Math.round(ar + (br - ar) * k);
    const g = Math.round(ag + (bg - ag) * k);
    const bl = Math.round(ab + (bb - ab) * k);
    return `rgb(${r},${g},${bl})`;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function spawnStar(s, deep) {
    s.x = rand(-1, 1);
    s.y = rand(-1, 1);
    s.z = deep ? rand(ZNEAR, ZFAR) : ZFAR;
    s.tw = rand(0.002, 0.006);
    s.size = rand(1.0, 2.2);
  }
  function seedStars() {
    for (let i = 0; i < STAR_COUNT; i++) {
      const s = {};
      spawnStar(s, true);
      stars.push(s);
    }
  }

  // Unregelmaessiges Asteroiden-Polygon, einmal vorberechnet.
  function rockVerts() {
    const verts = [];
    const n = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.6 + Math.random() * 0.4;
      verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return verts;
  }
  function spawnRock(a, deep) {
    // Etwas weiter gestreut als Sterne, damit die Brocken seitlich vorbeiziehen.
    a.x = rand(-1.2, 1.2);
    a.y = rand(-1.2, 1.2);
    a.z = deep ? rand(ZNEAR, ZFAR) : ZFAR;
    a.baseR = rand(10, 24);
    a.rot = rand(0, Math.PI * 2);
    a.spin = rand(-0.5, 0.5);
    a.spd = rand(0.7, 1.3);
    a.verts = rockVerts();
  }
  function seedRocks() {
    for (let i = 0; i < ROCK_COUNT; i++) {
      const a = {};
      spawnRock(a, true);
      rocks.push(a);
    }
  }

  function drawRock(a, vpx, vpy, focal) {
    const scale = 1 / a.z;
    const sx = vpx + (a.x / a.z) * focal;
    const sy = vpy + (a.y / a.z) * focal;
    const r = a.baseR * scale;
    if (r < 0.8) return;
    // Tiefe -> Helligkeit: ferne Brocken dunkler, nahe deutlich angeleuchtet.
    const near = Math.min(1, (ZFAR - a.z) / ZFAR);
    const base = a.baseR > 17 ? palette.steel : palette.rust;
    const lit = mix(base, palette.text, 0.2 + near * 0.25);
    const dark = mix(base, palette.void, 0.5);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a.rot);
    ctx.beginPath();
    a.verts.forEach((v, i) => {
      const px = v[0] * r;
      const py = v[1] * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    // Volumen ueber einen Radialverlauf: Licht von oben links, Schatten zur Kante.
    const grad = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.15, 0, 0, r * 1.15);
    grad.addColorStop(0, lit);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.fill();
    // Lichtkante zum Schiff hin.
    ctx.strokeStyle = rgba(palette.text, 0.12 + near * 0.22);
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  function draw(now) {
    requestAnimationFrame(draw);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w) return;
    let dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.05) dt = 0.05; // nach Tab-Wechsel keine Spruenge

    // Cover-Anpassung des Cockpits; daraus folgt der Fluchtpunkt im Fenster.
    const iw = cockpit.naturalWidth || 1200;
    const ih = cockpit.naturalHeight || 895;
    const fit = Math.max(w / iw, h / ih);
    const dw = iw * fit;
    const dh = ih * fit;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    const vpx = dx + WIN_CX * dw;
    const vpy = dy + WIN_CY * dh;
    const focal = dh * FOCAL_FACTOR;

    // Erschuetterung: die ganze Bruecke (Szene und Cockpit) wackelt mit.
    let ox = 0;
    let oy = 0;
    if (now < shakeUntil) {
      const k = shakeMag * ((shakeUntil - now) / 400);
      ox = (Math.random() - 0.5) * k;
      oy = (Math.random() - 0.5) * k;
    }
    ctx.save();
    ctx.translate(ox, oy);

    // Tiefe All als Grundflaeche.
    ctx.fillStyle = palette.void;
    ctx.fillRect(-40, -40, w + 80, h + 80);

    // Winzige Sterne, aus der Tiefe nach aussen ziehend.
    for (const s of stars) {
      s.z -= STAR_SPEED * dt;
      if (s.z <= ZNEAR) spawnStar(s);
      const scale = 1 / s.z;
      const sx = vpx + (s.x / s.z) * focal;
      const sy = vpy + (s.y / s.z) * focal;
      const near = (ZFAR - s.z) / ZFAR;
      const a = (0.5 + near * 0.5) * (0.8 + 0.2 * Math.sin(now * s.tw));
      ctx.fillStyle = rgba(palette.text, Math.max(0, a));
      const size = Math.max(1.3, Math.min(3.4, s.size * scale * 0.6));
      // Nahe Sterne ziehen einen kurzen Schweif zum Fluchtpunkt (Warp-Gefuehl).
      if (scale > 3) {
        const tz = s.z + STAR_SPEED * dt * 7;
        const tx = vpx + (s.x / tz) * focal;
        const ty = vpy + (s.y / tz) * focal;
        ctx.strokeStyle = rgba(palette.text, Math.max(0, a * 0.55));
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }

    // Asteroiden, von fern nach nah sortiert (entfernte zuerst).
    for (const a of rocks) {
      a.z -= ROCK_SPEED * a.spd * dt;
      a.rot += a.spin * dt;
      if (a.z <= ZNEAR) spawnRock(a, false);
    }
    rocks.slice().sort((p, q) => q.z - p.z).forEach((a) => drawRock(a, vpx, vpy, focal));

    // Funken bei Treffern (in Fenstermitte).
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life -= 0.03;
      if (p.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.fillStyle = rgba(palette.orange, p.life);
      ctx.fillRect(p.x, p.y, 2.5, 2.5);
    }

    // Sanfte Vignette im Fenster fuer Tiefe.
    const vg = ctx.createRadialGradient(vpx, vpy, dh * 0.12, vpx, vpy, dh * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Notlicht bei wenig Huelle: pulsierender roter Schein im Fenster.
    if (state.huelle <= 30) {
      const pulse = 0.16 + 0.12 * Math.sin(now / 180);
      const flick = Math.random() < 0.04 ? 0.16 : 0;
      const rg = ctx.createRadialGradient(vpx, vpy, dh * 0.1, vpx, vpy, dh * 0.7);
      rg.addColorStop(0, rgba(palette.red, pulse + flick));
      rg.addColorStop(1, rgba(palette.red, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }

    // Cockpit darueber: das durchsichtige Fenster gibt die Szene frei, der
    // Rahmen verdeckt alles ausserhalb.
    if (cockpitReady) ctx.drawImage(cockpit, dx, dy, dw, dh);

    ctx.restore();
  }

  return {
    setState(s) {
      if (s && s.shared) state = s.shared;
    },
    shake(ms = 420, mag = 14) {
      shakeUntil = performance.now() + ms;
      shakeMag = mag;
      const cx = canvas.clientWidth * WIN_CX;
      const cy = canvas.clientHeight * WIN_CY;
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 4;
        sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
      }
    },
    start() {
      readPalette();
      resize();
      if (!stars.length) seedStars();
      if (!rocks.length) seedRocks();
      requestAnimationFrame(draw);
    },
  };
}
