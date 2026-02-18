(() => {
  "use strict";

  // ---------- Canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- Asset helper (works in GitHub Pages subfolders) ----------
  function asset(file) {
    return new URL(`assets/${file}`, document.baseURI).toString();
  }

  function loadImg(file) {
    const img = new Image();
    img.src = asset(file);
    img.loaded = false;
    img.onload = () => (img.loaded = true);
    img.onerror = () => (img.loaded = false);
    return img;
  }

  const IMG = {
    player: loadImg("player.png"),
    worm: loadImg("worm.png"),
    blobking: loadImg("blobking.png"),
  };

  function drawImageOrFallback(img, x, y, w, h, fallbackFn) {
    if (img && img.loaded) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
      return;
    }
    fallbackFn?.();
  }

  // ---------- UI elements (must exist from your HTML) ----------
  const coinsEl = document.getElementById("coins");
  const heartsEl = document.getElementById("hearts");

  const screenTitle = document.getElementById("screenTitle");
  const screenWin = document.getElementById("screenWin");

  const btnStart = document.getElementById("btnStart");
  const btnPlayAgain = document.getElementById("btnPlayAgain");
  const btnRestart = document.getElementById("btnRestart");
  const btnFs = document.getElementById("btnFs");

  const panelCredits = document.getElementById("panelCredits");
  const panelSettings = document.getElementById("panelSettings");
  const btnCredits = document.getElementById("btnCredits");
  const btnSettings = document.getElementById("btnSettings");
  const toggleSfx = document.getElementById("toggleSfx");

  // Change win screen text to "YOU WIN!"
  // (Your HTML says "Level Complete!" by default, so we replace it here.)
  function setWinText() {
    const title = document.querySelector(".winTitle");
    const text = document.querySelector(".winText");
    if (title) title.textContent = "🎉 YOU WIN!";
    if (text) text.textContent = "You found the Cozy Star Portal ✨";
  }
  setWinText();

  // Logo (optional)
  const logoImg = document.getElementById("logoImg");
  if (logoImg) {
    logoImg.src = asset("logo.png");
    logoImg.onerror = () => (logoImg.style.display = "none");
  }

  // Title buttons
  if (btnCredits) btnCredits.onclick = () => {
    if (!panelCredits || !panelSettings) return;
    panelCredits.style.display = panelCredits.style.display === "block" ? "none" : "block";
    panelSettings.style.display = "none";
  };
  if (btnSettings) btnSettings.onclick = () => {
    if (!panelCredits || !panelSettings) return;
    panelSettings.style.display = panelSettings.style.display === "block" ? "none" : "block";
    panelCredits.style.display = "none";
  };

  if (btnFs) btnFs.onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  };

  // ---------- Simple built-in SFX (no mp3 required) ----------
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audio = AudioCtx ? new AudioCtx() : null;

  function ensureAudio() {
    if (!audio) return;
    if (audio.state === "suspended") audio.resume().catch(() => {});
  }

  function beep(freq = 700, dur = 0.06, type = "square", vol = 0.04) {
    if (!toggleSfx?.checked) return;
    if (!audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(audio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.stop(audio.currentTime + dur + 0.01);
  }

  // ---------- Input ----------
  const key = { left: false, right: false, jump: false, down: false };

  window.addEventListener("keydown", (e) => {
    ensureAudio();
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") key.left = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") key.right = true;
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") key.jump = true;
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") key.down = true;
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") key.left = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") key.right = false;
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") key.jump = false;
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") key.down = false;
  });

  // Mobile buttons (from your HTML)
  document.querySelectorAll(".mBtn").forEach((btn) => {
    const prop = btn.dataset.k;
    const on = (e) => { e.preventDefault(); ensureAudio(); key[prop] = true; };
    const off = (e) => { e.preventDefault(); key[prop] = false; };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("pointerleave", off);
  });

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // ---------- World / Entities ----------
  const GRAV = 2400;
  const MOVE = 780;
  const JUMP = 980;

  const world = {
    w: 6200,
    h: 1400,
    groundY: 1060
  };

  const cam = { x: 0, y: 0 };

  const player = {
    x: 220, y: 0,
    w: 48, h: 52,
    vx: 0, vy: 0,
    onGround: false,
    faceLeft: false
  };

  let platforms = [];
  let pipes = [];
  let worms = [];
  let coins = [];
  let blob = null;

  // New goal object (replaces flag pole)
  let portal = null;

  let coinCount = 0;
  let hearts = 3;

  // confetti particles
  let confetti = [];

  let state = "title"; // title | play | boss | win
  let running = false;

  function setHUD() {
    if (coinsEl) coinsEl.textContent = String(coinCount);
    if (heartsEl) heartsEl.textContent = String(hearts);
  }

  function resetAll() {
    coinCount = 0;
    hearts = 3;
    setHUD();

    state = "title";
    running = false;

    screenTitle?.classList.remove("hidden");
    screenWin?.classList.add("hidden");

    player.x = 220;
    player.y = world.groundY - player.h;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.faceLeft = false;

    // Platforms (cozy, simple)
    platforms = [
      { x: -600, y: world.groundY, w: world.w + 1200, h: 600 }, // ground slab
      { x: 520, y: 860, w: 260, h: 34 },
      { x: 900, y: 760, w: 260, h: 34 },
      { x: 1300, y: 860, w: 320, h: 34 },
      { x: 1700, y: 720, w: 260, h: 34 },
      { x: 2100, y: 860, w: 340, h: 34 },
      { x: 2550, y: 760, w: 280, h: 34 },
      { x: 2950, y: 860, w: 340, h: 34 },
      { x: 3400, y: 720, w: 260, h: 34 },
      { x: 3800, y: 860, w: 340, h: 34 },
      { x: 4200, y: 760, w: 280, h: 34 },
      // Boss arena floor
      { x: 4700, y: 880, w: 900, h: 34 },
    ];

    // Pipes (enterable teleport)
    pipes = [
      { x: 1120, y: world.groundY - 130, w: 96, h: 130, enter: true, toX: 3000, toY: world.groundY - 130 },
      { x: 3050, y: world.groundY - 130, w: 96, h: 130, enter: true, toX: 1180, toY: world.groundY - 130 },
      { x: 1900, y: world.groundY - 110, w: 96, h: 110, enter: false },
      { x: 4520, y: world.groundY - 150, w: 96, h: 150, enter: false },
    ];

    // Coins
    coins = [];
    const addCoins = (x, y, n, dx) => {
      for (let i = 0; i < n; i++) {
        coins.push({ x: x + i * dx, y, r: 14, taken: false, phase: Math.random() * Math.PI * 2 });
      }
    };
    addCoins(560, 820, 4, 46);
    addCoins(940, 720, 5, 46);
    addCoins(1360, 820, 5, 46);
    addCoins(1750, 680, 4, 46);
    addCoins(2160, 820, 6, 46);
    addCoins(2590, 720, 5, 46);
    addCoins(3000, 820, 6, 46);
    addCoins(3440, 680, 4, 46);
    addCoins(3860, 820, 6, 46);
    addCoins(4240, 720, 4, 46);
    addCoins(4880, 820, 8, 46);

    // Worm enemies
    worms = [
      { x: 860, y: world.groundY - 44, w: 54, h: 34, dir: 1, speed: 90, min: 800, max: 1100, alive: true },
      { x: 1600, y: world.groundY - 44, w: 54, h: 34, dir: -1, speed: 90, min: 1500, max: 1850, alive: true },
      { x: 2380, y: world.groundY - 44, w: 54, h: 34, dir: 1, speed: 90, min: 2250, max: 2600, alive: true },
      { x: 3250, y: world.groundY - 44, w: 54, h: 34, dir: -1, speed: 90, min: 3100, max: 3450, alive: true },
      { x: 4020, y: world.groundY - 44, w: 54, h: 34, dir: 1, speed: 90, min: 3920, max: 4300, alive: true },
    ];

    // Blobking boss
    blob = {
      x: 5050, y: world.groundY - 96, w: 120, h: 96,
      hp: 6, alive: true,
      dir: -1,
      speed: 110,
      stun: 0
    };

    // NEW GOAL: Cozy Star Portal (only works after boss is defeated)
    portal = {
      x: 5720,
      y: world.groundY - 210,
      w: 90,
      h: 160,
      active: false, // becomes true after boss dies
      reached: false,
      glow: 0
    };

    confetti = [];
  }

  // ---------- Physics / collision ----------
  function resolve(ent, dt) {
    ent.onGround = false;

    // horizontal
    ent.x += ent.vx * dt;
    const solids = [...platforms, ...pipes.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h }))];

    for (const s of solids) {
      if (overlap(ent, s)) {
        if (ent.vx > 0) ent.x = s.x - ent.w;
        if (ent.vx < 0) ent.x = s.x + s.w;
        ent.vx = 0;
      }
    }

    // vertical
    ent.y += ent.vy * dt;
    for (const s of solids) {
      if (overlap(ent, s)) {
        if (ent.vy > 0) {
          ent.y = s.y - ent.h;
          ent.vy = 0;
          ent.onGround = true;
        } else if (ent.vy < 0) {
          ent.y = s.y + s.h;
          ent.vy = 0;
        }
      }
    }

    ent.x = clamp(ent.x, 0, world.w - ent.w);
  }

  function tryEnterPipe() {
    if (!key.down) return;
    const feet = player.y + player.h;

    for (const p of pipes) {
      if (!p.enter) continue;
      const onTop = Math.abs(feet - p.y) < 3;
      const mid = player.x + player.w / 2;
      const within = mid > p.x && mid < p.x + p.w;

      if (onTop && within) {
        beep(240, 0.07, "square", 0.05);
        player.x = p.toX;
        player.y = p.toY - player.h;
        player.vx = 0;
        player.vy = 0;
      }
    }
  }

  function hurt() {
    hearts -= 1;
    setHUD();
    beep(170, 0.14, "square", 0.06);

    if (hearts <= 0) {
      resetAll(); // back to title
      return;
    }

    // respawn
    player.x = 220;
    player.y = world.groundY - player.h;
    player.vx = 0;
    player.vy = 0;
  }

  // ---------- Confetti ----------
  function confettiBurst(x, y) {
    for (let i = 0; i < 140; i++) {
      confetti.push({
        x, y,
        vx: (Math.random() * 2 - 1) * 600,
        vy: (-Math.random() * 820) - 120,
        g: 1200,
        life: 1.8 + Math.random() * 0.9,
        size: 4 + Math.random() * 6,
        r: Math.random() * Math.PI * 2,
        hue: Math.floor(Math.random() * 360),
      });
    }
  }

  function updateConfetti(dt) {
    for (const p of confetti) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.r += dt * 6;
    }
    confetti = confetti.filter(p => p.life > 0 && p.y < world.groundY + 600);
  }

  function drawConfetti() {
    for (const p of confetti) {
      const x = p.x - cam.x;
      const y = p.y - cam.y;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.r);
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = `hsl(${p.hue}, 95%, 65%)`;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#7fd6ff");
    g.addColorStop(1, "#d7fbff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sun glow
    const sx = W * 0.15, sy = H * 0.18;
    const rg = ctx.createRadialGradient(sx, sy, 20, sx, sy, 260);
    rg.addColorStop(0, "rgba(255,255,255,0.95)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // clouds
    drawCloud(240, 140, 1.2);
    drawCloud(620, 120, 1.0);
    drawCloud(980, 180, 1.35);
    drawCloud(1320, 120, 1.1);
    drawCloud(1620, 160, 1.25);
    drawCloud(1920, 130, 1.05);
  }

  function drawCloud(x, y, s) {
    const X = x - cam.x * 0.35;
    const Y = y - cam.y * 0.35;
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(X, Y, 60 * s, 34 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(X + 52 * s, Y + 6 * s, 56 * s, 30 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(X - 52 * s, Y + 8 * s, 52 * s, 28 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(X + 18 * s, Y - 18 * s, 52 * s, 30 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGrass() {
    const gy = world.groundY - cam.y;
    ctx.fillStyle = "#57d46c";
    ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = "#3fc85c";
    ctx.fillRect(0, gy, W, 18);
  }

  function drawPlatform(p) {
    const x = p.x - cam.x, y = p.y - cam.y;
    ctx.fillStyle = "#d39a63";
    roundRect(x, y, p.w, p.h, 10);
    ctx.fill();

    ctx.fillStyle = "#45d060";
    roundRect(x, y, p.w, Math.min(16, p.h), 10);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y + p.h - 8, p.w, 8);
  }

  function drawPipe(p) {
    const x = p.x - cam.x, y = p.y - cam.y;
    ctx.fillStyle = "#2fbf4d";
    roundRect(x, y, p.w, p.h, 14);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    roundRect(x + 10, y + 10, 18, p.h - 20, 12);
    ctx.fill();

    ctx.fillStyle = "#25a940";
    roundRect(x - 10, y - 20, p.w + 20, 28, 14);
    ctx.fill();
  }

  function drawCoin(c, t) {
    if (c.taken) return;
    const x = c.x - cam.x;
    const y = c.y - cam.y + Math.sin(t * 5 + c.phase) * 4;

    const glow = ctx.createRadialGradient(x, y, 2, x, y, 26);
    glow.addColorStop(0, "rgba(255,255,255,.9)");
    glow.addColorStop(1, "rgba(255,215,64,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffd24d";
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.beginPath();
    ctx.arc(x + 4, y + 3, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    const x = player.x - cam.x, y = player.y - cam.y;
    drawImageOrFallback(IMG.player, x, y, player.w, player.h, () => {
      ctx.fillStyle = "#3b6cff";
      roundRect(x, y, player.w, player.h, 12);
      ctx.fill();
      ctx.fillStyle = "#ffe7c9";
      roundRect(x + 8, y + 16, player.w - 16, 18, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.beginPath();
      ctx.arc(x + 14, y + 24, 2.2, 0, Math.PI * 2);
      ctx.arc(x + player.w - 14, y + 24, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawWorm(w) {
    if (!w.alive) return;
    const x = w.x - cam.x, y = w.y - cam.y;
    drawImageOrFallback(IMG.worm, x, y, w.w, w.h, () => {
      ctx.fillStyle = "#ffcc55";
      roundRect(x, y, w.w, w.h, 12);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.beginPath();
      ctx.arc(x + 14, y + 14, 2.2, 0, Math.PI * 2);
      ctx.arc(x + w.w - 14, y + 14, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawBlob() {
    if (!blob.alive) return;
    const x = blob.x - cam.x, y = blob.y - cam.y;
    drawImageOrFallback(IMG.blobking, x, y, blob.w, blob.h, () => {
      ctx.fillStyle = "#e9c18b";
      roundRect(x, y, blob.w, blob.h, 18);
      ctx.fill();
      ctx.fillStyle = "#ffd24d";
      ctx.beginPath();
      ctx.moveTo(x + 30, y);
      ctx.lineTo(x + 44, y - 18);
      ctx.lineTo(x + 58, y);
      ctx.closePath();
      ctx.fill();
    });

    // HP hearts above boss (cute)
    const hp = blob.hp;
    ctx.font = "900 16px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillText("♥".repeat(Math.max(0, hp)), x + blob.w / 2, y - 8);
  }

  function drawPortal(t) {
    if (!portal) return;
    const x = portal.x - cam.x;
    const y = portal.y - cam.y;

    portal.glow = 0.5 + 0.5 * Math.sin(t * 4);

    // glow halo
    ctx.save();
    ctx.globalAlpha = portal.active ? (0.25 + portal.glow * 0.25) : 0.10;
    const rg = ctx.createRadialGradient(x + portal.w / 2, y + portal.h / 2, 10, x + portal.w / 2, y + portal.h / 2, 110);
    rg.addColorStop(0, portal.active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.40)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(x - 120, y - 120, portal.w + 240, portal.h + 240);
    ctx.restore();

    // portal body
    ctx.fillStyle = portal.active ? "#a65bff" : "rgba(120,120,120,0.55)";
    roundRect(x, y, portal.w, portal.h, 26);
    ctx.fill();

    // inner swirl
    ctx.save();
    ctx.globalAlpha = portal.active ? 0.95 : 0.35;
    ctx.translate(x + portal.w / 2, y + portal.h / 2);
    ctx.rotate(t * 1.2);
    ctx.fillStyle = portal.active ? "#ffffff" : "rgba(255,255,255,0.7)";
    roundRect(-22, -38, 44, 76, 22);
    ctx.fill();
    ctx.globalAlpha = portal.active ? 0.35 : 0.18;
    ctx.fillStyle = "#ffe27a";
    roundRect(-14, -26, 28, 52, 18);
    ctx.fill();
    ctx.restore();

    // star icon
    ctx.font = "1000 22px ui-rounded, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = portal.active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.65)";
    ctx.fillText("✦", x + portal.w / 2, y + 30);

    // label
    ctx.font = "900 14px ui-monospace, monospace";
    ctx.fillStyle = portal.active ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.35)";
    ctx.fillText(portal.active ? "PORTAL" : "LOCKED", x + portal.w / 2, y + portal.h + 18);
  }

  // ---------- Game logic ----------
  function update(dt, t) {
    if (!running) return;

    // movement input
    const ax = (key.right ? 1 : 0) - (key.left ? 1 : 0);
    player.vx += ax * MOVE * dt;
    player.vx *= player.onGround ? 0.84 : 0.93;

    if (ax !== 0) player.faceLeft = ax < 0;

    // gravity
    player.vy += GRAV * dt;

    // jump
    if (key.jump && player.onGround) {
      player.vy = -JUMP;
      player.onGround = false;
      beep(880, 0.05, "square", 0.05);
    }

    // pipe enter
    tryEnterPipe();

    // collide
    resolve(player, dt);

    // camera follow
    cam.x = clamp(player.x + player.w / 2 - W * 0.5, 0, Math.max(0, world.w - W));
    cam.y = clamp(player.y + player.h / 2 - H * 0.55, 0, Math.max(0, world.h - H));

    // collect coins
    for (const c of coins) {
      if (c.taken) continue;
      const dx = (player.x + player.w / 2) - c.x;
      const dy = (player.y + player.h / 2) - c.y;
      if (dx * dx + dy * dy < 30 * 30) {
        c.taken = true;
        coinCount++;
        setHUD();
        beep(1180, 0.04, "square", 0.04);
      }
    }

    // worms movement + collisions
    for (const w of worms) {
      if (!w.alive) continue;
      w.x += w.dir * w.speed * dt;
      if (w.x < w.min) { w.x = w.min; w.dir = 1; }
      if (w.x > w.max) { w.x = w.max; w.dir = -1; }

      if (overlap(player, blob)) {
  const playerBottom = player.y + player.h;
  const blobTop = blob.y;

  // More forgiving stomp rule:
  // - player is falling
  // - player's bottom is near the top of the boss
  const stomp = (player.vy > 120) && (playerBottom - blobTop < 22);

  if (stomp) {
    blob.hp--;
    blob.stun = 0.55;

    // bounce player up
    player.vy = -JUMP * 0.70;
    player.y = blob.y - player.h - 1;

    beep(1040, 0.06, "triangle", 0.05);

    if (blob.hp <= 0) {
      blob.alive = false;
      portal.active = true; // unlock portal
      beep(520, 0.08, "square", 0.05);
      beep(660, 0.08, "square", 0.05);
      beep(820, 0.08, "square", 0.05);
    }
  } else {
    hurt();
  }
}


    // boss zone
    if (state === "play" && player.x > 4550) state = "boss";

    // blobking logic
    if (state === "boss" && blob.alive) {
      if (blob.stun > 0) blob.stun -= dt;
      else {
        blob.x += blob.dir * blob.speed * dt;
        if (blob.x < 4780) { blob.x = 4780; blob.dir = 1; }
        if (blob.x > 5320) { blob.x = 5320; blob.dir = -1; }
      }

      if (overlap(player, blob)) {
        const prevBottom = (player.y - player.vy * dt) + player.h;
        const stomp = (player.vy > 0) && (prevBottom <= blob.y + 10);
        if (stomp) {
          blob.hp--;
          blob.stun = 0.45;
          player.vy = -JUMP * 0.62;
          beep(1040, 0.06, "triangle", 0.05);

          if (blob.hp <= 0) {
            blob.alive = false;
            portal.active = true; // unlock portal
            beep(520, 0.08, "square", 0.05);
            beep(660, 0.08, "square", 0.05);
            beep(820, 0.08, "square", 0.05);
          }
        } else {
          hurt();
        }
      }
    }

    // win condition: touch portal AFTER boss is defeated
    if (portal && portal.active && !portal.reached) {
      const pr = { x: portal.x, y: portal.y, w: portal.w, h: portal.h };
      if (overlap(player, pr)) {
        portal.reached = true;
        state = "win";
        running = false;

        confettiBurst(portal.x + portal.w / 2, portal.y + 30);
        beep(880, 0.07, "square", 0.05);
        beep(1040, 0.07, "square", 0.05);
        beep(1320, 0.07, "square", 0.05);

        screenWin?.classList.remove("hidden");
      }
    }

    updateConfetti(dt);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    drawBackground();
    drawGrass();

    // platforms (except big ground slab drawn via grass)
    for (const p of platforms) {
      if (p.y < world.groundY) drawPlatform(p);
    }

    // pipes
    for (const p of pipes) drawPipe(p);

    // coins
    for (const c of coins) drawCoin(c, t);

    // worms
    for (const w of worms) drawWorm(w);

    // boss label
    if (player.x > 4400) {
      const x = 4800 - cam.x, y = 640 - cam.y;
      ctx.fillStyle = "rgba(255,255,255,.82)";
      roundRect(x, y, 360, 70, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.12)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#0b2030";
      ctx.font = "900 18px ui-monospace, monospace";
      ctx.fillText("Boss Arena: Blobking 👑", x + 16, y + 42);
    }

    // blobking
    drawBlob();

    // portal
    drawPortal(t);

    // player
    drawPlayer();

    // confetti
    drawConfetti();
  }

  // ---------- Loop ----------
  let last = performance.now();
  let time = 0;

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    time += dt;

    update(dt, time);
    draw(time);

    requestAnimationFrame(loop);
  }

  // ---------- Buttons ----------
  if (btnStart) btnStart.onclick = () => {
    ensureAudio();
    screenTitle?.classList.add("hidden");
    state = "play";
    running = true;
    beep(740, 0.06, "square", 0.05);
  };

  if (btnRestart) btnRestart.onclick = () => { ensureAudio(); resetAll(); beep(320, 0.06, "square", 0.05); };
  if (btnPlayAgain) btnPlayAgain.onclick = () => { ensureAudio(); resetAll(); beep(740, 0.06, "square", 0.05); };

  // ---------- Start ----------
  resetAll();
  requestAnimationFrame(loop);
})();
