(() => {
  "use strict";

  // ===== DOM =====
  const menu = document.getElementById("menu");
  const credits = document.getElementById("credits");
  const gameWrap = document.getElementById("gameWrap");
  const win = document.getElementById("win");

  const startBtn = document.getElementById("startBtn");
  const creditsBtn = document.getElementById("creditsBtn");
  const backBtn = document.getElementById("backBtn");
  const homeBtn = document.getElementById("homeBtn");
  const menuBtn = document.getElementById("menuBtn");
  const playAgainBtn = document.getElementById("playAgainBtn");

  const soundBtn = document.getElementById("soundBtn");
  const fsBtn = document.getElementById("fsBtn");

  const coinCountEl = document.getElementById("coinCount");
  const heartsEl = document.getElementById("hearts");
  const statusEl = document.getElementById("status");

  const bgm = document.getElementById("bgm");

  // ===== Canvas =====
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W=0,H=0,DPR=1;

  function resize(){
    DPR = Math.min(window.devicePixelRatio||1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W*DPR);
    canvas.height = Math.floor(H*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ===== Asset helper (GitHub Pages safe) =====
  function asset(p){ return new URL(`assets/${p}`, document.baseURI).toString(); }
  function loadImg(p){
    const i = new Image();
    i.src = asset(`img/${p}`);
    i.ok = false;
    i.onload = () => i.ok = true;
    i.onerror = () => i.ok = false;
    return i;
  }

  // Sprite sheets (from your CC0 pack)
  const IMG = {
    player: loadImg("player_sheet.png"),
    slime: loadImg("worm_sheet.png"),
    king: loadImg("blobking_sheet.png"),
  };

  // ===== Simple WebAudio fallback SFX (no files needed) =====
  const AC = window.AudioContext || window.webkitAudioContext;
  const audio = AC ? new AC() : null;
  let muted = false;

  function unlockAudio(){
    if (!audio) return;
    if (audio.state === "suspended") audio.resume().catch(()=>{});
    if (bgm && !muted){
      bgm.volume = 0.35;
      bgm.play().catch(()=>{});
    }
  }
  window.addEventListener("pointerdown", unlockAudio, { once:true });
  window.addEventListener("keydown", unlockAudio, { once:true });

  function beep(freq=700, dur=0.06, type="square", vol=0.04){
    if (muted || !audio) return;
    const t0 = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g).connect(audio.destination);
    o.start(t0);
    o.stop(t0+dur+0.02);
  }

  function setSoundLabel(){
    soundBtn.textContent = muted ? "🔇 Sound: OFF" : "🔊 Sound: ON";
  }
  setSoundLabel();

  soundBtn.addEventListener("click", ()=>{
    muted = !muted;
    if (bgm) bgm.muted = muted;
    setSoundLabel();
    if (!muted) unlockAudio();
  });

  fsBtn.addEventListener("click", async ()=>{
    try{
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    }catch{}
  });

  // ===== Input =====
  const key = { left:false, right:false, jump:false, down:false };
  addEventListener("keydown", (e)=>{
    unlockAudio();
    if (["ArrowLeft","a","A"].includes(e.key)) key.left=true;
    if (["ArrowRight","d","D"].includes(e.key)) key.right=true;
    if ([" ","ArrowUp","w","W"].includes(e.key)) key.jump=true;
    if (["ArrowDown","s","S"].includes(e.key)) key.down=true;
  });
  addEventListener("keyup", (e)=>{
    if (["ArrowLeft","a","A"].includes(e.key)) key.left=false;
    if (["ArrowRight","d","D"].includes(e.key)) key.right=false;
    if ([" ","ArrowUp","w","W"].includes(e.key)) key.jump=false;
    if (["ArrowDown","s","S"].includes(e.key)) key.down=false;
  });

  // Mobile buttons
  document.querySelectorAll(".mBtn").forEach(btn=>{
    const k = btn.dataset.k;
    const on = (e)=>{ e.preventDefault(); unlockAudio(); key[k]=true; };
    const off = (e)=>{ e.preventDefault(); key[k]=false; };
    btn.addEventListener("pointerdown", on, { passive:false });
    btn.addEventListener("pointerup", off, { passive:false });
    btn.addEventListener("pointercancel", off, { passive:false });
    btn.addEventListener("pointerleave", off, { passive:false });
  });

  // ===== Sprite draw =====
  function drawSprite(img, frame, fw, fh, x, y, w, h, flip=false){
    if (!img.ok) return false;
    const cols = Math.max(1, Math.floor(img.width / fw));
    const sx = (frame % cols) * fw;
    const sy = Math.floor(frame / cols) * fh;
    ctx.save();
    ctx.translate(x, y);
    if (flip){
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, fw, fh, -w, 0, w, h);
    } else {
      ctx.drawImage(img, sx, sy, fw, fh, 0, 0, w, h);
    }
    ctx.restore();
    return true;
  }

  // ===== Helpers =====
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const overlap=(a,b)=>a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;

  function groundY(){ return H - 120; }

  // ===== World + Entities =====
  const GRAV=2400, MOVE=920, JUMP=980;

  const player = { x:140, y:0, w:52, h:52, vx:0, vy:0, on:false, flip:false };
  const cam = { x:0 };

  const platforms = [];
  const pipes = [];
  const coins = [];
  const slimes = [];
  const boss = { x:0, y:0, w:120, h:96, hp:6, alive:true, stun:0 };

  const portal = { x:0, y:0, w:90, h:160, active:false, reached:false };

  let coinCount=0;
  let hearts=3;
  let state="menu"; // menu|play|win

  function setHUD(){
    coinCountEl.textContent = String(coinCount);
    heartsEl.textContent = String(hearts);
  }
  setHUD();

  function resetWorld(){
    coinCount=0; hearts=3; setHUD();
    state="play";
    portal.active=false; portal.reached=false;

    player.x=140; player.y=groundY()-player.h; player.vx=0; player.vy=0; player.on=false;
    cam.x=0;

    platforms.length=0; pipes.length=0; coins.length=0; slimes.length=0;

    // ground
    platforms.push({ x:-1000, y:groundY(), w:9000, h:700 });

    // some cozy platforms
    platforms.push({ x:520, y:groundY()-200, w:260, h:24 });
    platforms.push({ x:920, y:groundY()-310, w:260, h:24 });
    platforms.push({ x:1300, y:groundY()-200, w:320, h:24 });
    platforms.push({ x:1720, y:groundY()-340, w:260, h:24 });
    platforms.push({ x:2100, y:groundY()-220, w:340, h:24 });

    // pipes (teleport)
    pipes.push({ x:1120, y:groundY()-130, w:96, h:130, enter:true, toX:2400, toY:groundY()-130 });
    pipes.push({ x:2420, y:groundY()-130, w:96, h:130, enter:true, toX:1140, toY:groundY()-130 });

    // coins
    function addCoins(x,y,n){
      for(let i=0;i<n;i++) coins.push({ x:x+i*46, y, r:14, taken:false, phase:Math.random()*Math.PI*2 });
    }
    addCoins(560, groundY()-240, 4);
    addCoins(950, groundY()-350, 5);
    addCoins(1340, groundY()-240, 5);
    addCoins(1720, groundY()-380, 4);
    addCoins(2120, groundY()-260, 6);

    // slimes
    slimes.push({ x:820, y:groundY()-34, w:52, h:34, dir:1, min:760, max:1040, alive:true });
    slimes.push({ x:1560, y:groundY()-34, w:52, h:34, dir:-1, min:1460, max:1740, alive:true });

    // boss area
    boss.x = 3000;
    boss.y = groundY() - boss.h;
    boss.hp = 6;
    boss.alive = true;
    boss.stun = 0;

    portal.x = 3400;
    portal.y = groundY() - 210;
  }

  function hurt(){
    hearts--;
    setHUD();
    beep(170,0.12,"square",0.06);
    if (hearts<=0){
      goMenu();
      return;
    }
    player.x=140; player.y=groundY()-player.h; player.vx=0; player.vy=0;
  }

  function goMenu(){
    state="menu";
    menu.classList.remove("hidden");
    credits.classList.add("hidden");
    gameWrap.classList.add("hidden");
    win.classList.add("hidden");
    if (statusEl) statusEl.textContent = "Find Blobking!";
  }

  // ===== Pipe enter =====
  function tryEnterPipe(){
    if (!key.down) return;
    const feet = player.y + player.h;
    for (const p of pipes){
      if (!p.enter) continue;
      const onTop = Math.abs(feet - p.y) < 4;
      const mid = player.x + player.w/2;
      const within = mid > p.x && mid < p.x + p.w;
      if (onTop && within){
        beep(240,0.07,"square",0.05);
        player.x = p.toX;
        player.y = p.toY - player.h;
        player.vx = 0; player.vy = 0;
      }
    }
  }

  // ===== Animation frames (ASSUMES 16x16 or 32x32 frames; adjust if needed) =====
  // If your pack uses 16x16 frames, keep as is.
  const P_FW=16, P_FH=16;     // player frame size
  const S_FW=16, S_FH=16;     // slime frame size
  const K_FW=32, K_FH=32;     // boss frame size (often bigger)

  let time=0;
  function playerFrame(){
    if (!player.on) return 6; // jump frame
    if (Math.abs(player.vx)>40) return 2 + (Math.floor(time*12)%4); // run 2..5
    return Math.floor(time*2)%2; // idle 0..1
  }
  const slimeFrame = ()=> Math.floor(time*10)%4;
  const kingFrame = ()=> (boss.stun>0 ? 3 + (Math.floor(time*18)%2) : Math.floor(time*4)%3);

  // ===== Draw helpers =====
  function rr(x,y,w,h,r){
    const R=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+R,y);
    ctx.arcTo(x+w,y,x+w,y+h,R);
    ctx.arcTo(x+w,y+h,x,y+h,R);
    ctx.arcTo(x,y+h,x,y,R);
    ctx.arcTo(x,y,x+w,y,R);
    ctx.closePath();
  }

  function drawBackground(){
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#7fd6ff");
    g.addColorStop(1,"#d7fbff");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // clouds
    ctx.globalAlpha=.95;
    cloud(200,120,1.2);
    cloud(560,90,1.0);
    cloud(980,150,1.3);
    cloud(1320,110,1.1);
    ctx.globalAlpha=1;

    // grass
    ctx.fillStyle="#57d46c";
    ctx.fillRect(0,groundY(),W,H-groundY());
    ctx.fillStyle="#3fc85c";
    ctx.fillRect(0,groundY(),W,18);
  }

  function cloud(x,y,s){
    const X = x - cam.x*0.35;
    ctx.fillStyle="rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(X,y,60*s,34*s,0,0,Math.PI*2);
    ctx.ellipse(X+52*s,y+6*s,56*s,30*s,0,0,Math.PI*2);
    ctx.ellipse(X-52*s,y+8*s,52*s,28*s,0,0,Math.PI*2);
    ctx.ellipse(X+18*s,y-18*s,52*s,30*s,0,0,Math.PI*2);
    ctx.fill();
  }

  function drawPlatform(p){
    const x=p.x-cam.x, y=p.y;
    ctx.fillStyle="#d39a63"; rr(x,y,p.w,p.h,10); ctx.fill();
    ctx.fillStyle="#45d060"; rr(x,y,p.w,Math.min(16,p.h),10); ctx.fill();
  }

  function drawPipe(p){
    const x=p.x-cam.x, y=p.y;
    ctx.fillStyle="#2fbf4d"; rr(x,y,p.w,p.h,14); ctx.fill();
    ctx.fillStyle="#25a940"; rr(x-10,y-20,p.w+20,28,14); ctx.fill();
    ctx.globalAlpha=.22; ctx.fillStyle="#fff"; rr(x+10,y+10,18,p.h-20,12); ctx.fill(); ctx.globalAlpha=1;
  }

  function drawCoin(c){
    if (c.taken) return;
    const x=c.x-cam.x;
    const y=c.y + Math.sin(time*5 + c.phase)*4;
    ctx.fillStyle="rgba(255,255,255,.35)";
    ctx.beginPath(); ctx.arc(x,y,22,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#ffd24d";
    ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.fill();
  }

  function drawPortal(){
    const x=portal.x-cam.x, y=portal.y;
    const glow = 0.45 + 0.45*Math.sin(time*4);
    ctx.globalAlpha = portal.active ? (0.25+glow*0.25) : 0.10;
    const rg = ctx.createRadialGradient(x+portal.w/2,y+portal.h/2,10,x+portal.w/2,y+portal.h/2,120);
    rg.addColorStop(0,"rgba(255,255,255,0.95)");
    rg.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=rg; ctx.fillRect(x-140,y-140,portal.w+280,portal.h+280);
    ctx.globalAlpha=1;

    ctx.fillStyle = portal.active ? "#a65bff" : "rgba(120,120,120,0.55)";
    rr(x,y,portal.w,portal.h,26); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.75)";
    ctx.font="900 18px HarvettFox96, system-ui";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(portal.active ? "GO!" : "LOCKED", x+portal.w/2, y+portal.h/2);
  }

  // ===== Game update =====
  function update(dt){
    time += dt;

    // move
    const ax = (key.right?1:0) - (key.left?1:0);
    player.vx += ax*MOVE*dt;
    player.vx *= player.on ? 0.84 : 0.93;
    if (ax!==0) player.flip = ax<0;

    // gravity
    player.vy += GRAV*dt;

    // jump
    if (key.jump && player.on){
      player.vy = -JUMP;
      player.on = false;
      beep(880,0.05,"square",0.05);
    }

    // integrate
    player.x += player.vx*dt;
    player.y += player.vy*dt;

    // ground
    player.on = false;
    if (player.y + player.h >= groundY()){
      player.y = groundY() - player.h;
      player.vy = 0;
      player.on = true;
    }

    // pipes enter
    tryEnterPipe();

    // camera
    cam.x = clamp(player.x + player.w/2 - W*0.45, 0, 4000);

    // platforms collide (simple)
    for (const p of platforms){
      if (p.y === groundY()) continue;
      const box = { x:p.x, y:p.y, w:p.w, h:p.h };
      if (overlap(player, box) && player.vy>0){
        const prevBottom = (player.y - player.vy*dt) + player.h;
        if (prevBottom <= p.y + 8){
          player.y = p.y - player.h;
          player.vy = 0;
          player.on = true;
        }
      }
    }

    // coins
    for (const c of coins){
      if (c.taken) continue;
      const dx=(player.x+player.w/2)-c.x;
      const dy=(player.y+player.h/2)-c.y;
      if (dx*dx+dy*dy < 30*30){
        c.taken = true;
        coinCount++;
        setHUD();
        beep(1180,0.04,"square",0.04);
      }
    }

    // slimes
    for (const s of slimes){
      if (!s.alive) continue;
      s.x += s.dir*100*dt;
      if (s.x < s.min){ s.x=s.min; s.dir=1; }
      if (s.x > s.max){ s.x=s.max; s.dir=-1; }

      if (overlap(player, s)){
        const stomp = player.vy > 200 && ((player.y+player.h) - s.y < 18);
        if (stomp){
          s.alive=false;
          player.vy = -JUMP*0.6;
          beep(980,0.06,"triangle",0.05);
        } else {
          hurt();
          return;
        }
      }
    }

    // boss zone message
    if (player.x > 2500 && boss.alive) statusEl.textContent = "Defeat Blobking!";
    if (!boss.alive) statusEl.textContent = "Go to the portal!";

    // boss
    if (boss.alive){
      boss.y = groundY() - boss.h;
      if (boss.stun>0) boss.stun-=dt;

      // small patrol
      if (boss.stun<=0){
        boss.x += Math.sin(time*1.2)*40*dt;
      }

      if (overlap(player, boss)){
        const stomp = player.vy > 200 && ((player.y+player.h) - boss.y < 22);
        if (stomp){
          boss.hp--;
          boss.stun = 0.45;
          player.vy = -JUMP*0.7;
          beep(1040,0.06,"triangle",0.05);
          if (boss.hp <= 0){
            boss.alive = false;
            portal.active = true;
            beep(520,0.08,"square",0.05);
            beep(660,0.08,"square",0.05);
            beep(820,0.08,"square",0.05);
          }
        } else {
          hurt();
          return;
        }
      }
    }

    // portal win
    if (portal.active && !portal.reached){
      if (overlap(player, portal)){
        portal.reached=true;
        win.classList.remove("hidden");
        state="win";
      }
    }
  }

  // ===== Draw =====
  function draw(){
    ctx.clearRect(0,0,W,H);
    drawBackground();

    // platforms
    for (const p of platforms) if (p.y !== groundY()) drawPlatform(p);

    // pipes
    for (const p of pipes) drawPipe(p);

    // coins
    for (const c of coins) drawCoin(c);

    // slimes
    for (const s of slimes){
      if (!s.alive) continue;
      const ok = drawSprite(IMG.slime, slimeFrame(), S_FW, S_FH, s.x-cam.x, s.y, s.w, s.h, s.dir<0);
      if (!ok){
        ctx.fillStyle="#ffc84d";
        rr(s.x-cam.x, s.y, s.w, s.h, 12); ctx.fill();
      }
    }

    // boss
    if (boss.alive){
      const okB = drawSprite(IMG.king, kingFrame(), K_FW, K_FH, boss.x-cam.x, boss.y, boss.w, boss.h, false);
      if (!okB){
        ctx.fillStyle="#e9c18b";
        rr(boss.x-cam.x, boss.y, boss.w, boss.h, 18); ctx.fill();
      }

      // HP bar
      const barW=260, barH=14;
      const x=W/2-barW/2, y=70;
      ctx.fillStyle="rgba(255,255,255,.8)"; rr(x-10,y-10,barW+20,barH+20,14); ctx.fill();
      ctx.fillStyle="rgba(0,0,0,.18)"; rr(x,y,barW,barH,10); ctx.fill();
      const pct = clamp(boss.hp/6, 0, 1);
      ctx.fillStyle="#ff5a5a"; rr(x,y,barW*pct,barH,10); ctx.fill();
      ctx.fillStyle="rgba(0,0,0,.55)";
      ctx.font="900 14px HarvettFox96, system-ui";
      ctx.textAlign="center"; ctx.textBaseline="bottom";
      ctx.fillText("Blobking HP", W/2, y-8);
    }

    // portal
    drawPortal();

    // player
    const okP = drawSprite(IMG.player, playerFrame(), P_FW, P_FH, player.x-cam.x, player.y, player.w, player.h, player.flip);
    if (!okP){
      ctx.fillStyle="#3b6cff";
      rr(player.x-cam.x, player.y, player.w, player.h, 12); ctx.fill();
    }
  }

  // ===== Main loop =====
  let last = performance.now();
  function tick(now){
    const dt = Math.min(0.033, (now-last)/1000);
    last = now;

    if (state === "play") update(dt);
    draw();

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ===== Menu actions =====
  function showGame(){
    menu.classList.add("hidden");
    credits.classList.add("hidden");
    gameWrap.classList.remove("hidden");
    win.classList.add("hidden");
  }

  startBtn.addEventListener("click", ()=>{
    unlockAudio();
    showGame();
    resetWorld();
    state="play";
  });

  creditsBtn.addEventListener("click", ()=>{
    menu.classList.add("hidden");
    credits.classList.remove("hidden");
  });

  backBtn.addEventListener("click", ()=>{
    credits.classList.add("hidden");
    menu.classList.remove("hidden");
  });

  homeBtn.addEventListener("click", ()=>{ goMenu(); });
  menuBtn.addEventListener("click", ()=>{ goMenu(); });

  playAgainBtn.addEventListener("click", ()=>{
    win.classList.add("hidden");
    resetWorld();
    state="play";
  });

  // Start in menu
  goMenu();
})();
