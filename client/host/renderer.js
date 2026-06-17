// Zeichnet die Schiffsszene auf Canvas: dunkler Raum, treibende Asteroiden
// und die Daedalus in der Mitte. Bewusst einfach, aber atmosphaerisch.
// Farben kommen aus den Designtokens (styles/tokens.css).

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let shakeUntil = 0;
  const asteroids = [];

  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  function seedAsteroids(n) {
    for (let i = 0; i < n; i++) {
      asteroids.push({
        x: Math.random(),
        y: Math.random(),
        r: 8 + Math.random() * 26,
        vx: -(0.01 + Math.random() * 0.03),
      });
    }
  }

  function drawShip(w, h) {
    const bob = Math.sin(Date.now() / 900) * 4;
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5 + bob);
    ctx.fillStyle = css("--steel", "#3a4a5a");
    ctx.fillRect(-70, -22, 150, 44);
    ctx.fillStyle = css("--steel-dark", "#2b2e31");
    ctx.fillRect(-92, -12, 30, 24);
    ctx.fillStyle = css("--accent-orange", "#e8761a");
    ctx.fillRect(-40, -22, 10, 44);
    ctx.fillStyle = css("--accent-cyan", "#36d0e0");
    ctx.fillRect(72, -6, 14, 12);
    ctx.restore();
  }

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w) {
      requestAnimationFrame(draw);
      return;
    }
    let ox = 0;
    let oy = 0;
    if (Date.now() < shakeUntil) {
      ox = (Math.random() - 0.5) * 10;
      oy = (Math.random() - 0.5) * 10;
    }
    ctx.save();
    ctx.translate(ox, oy);

    ctx.fillStyle = css("--bg-void", "#0d0e10");
    ctx.fillRect(-20, -20, w + 40, h + 40);

    ctx.fillStyle = css("--rust", "#6e4a2f");
    for (const a of asteroids) {
      a.x += a.vx / 60;
      if (a.x < -0.1) a.x = 1.1;
      ctx.beginPath();
      ctx.arc(a.x * w, a.y * h, a.r, 0, Math.PI * 2);
      ctx.fill();
    }

    drawShip(w, h);

    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
    requestAnimationFrame(draw);
  }

  return {
    setState() {
      // Platz fuer reaktive Effekte aus dem Zustand (z. B. Treffer, Status).
    },
    shake(ms = 400) {
      shakeUntil = Date.now() + ms;
    },
    start() {
      resize();
      if (!asteroids.length) seedAsteroids(14);
      requestAnimationFrame(draw);
    },
  };
}
