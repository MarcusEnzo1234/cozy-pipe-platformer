(() => {
  // ---------- Canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W=0,H=0,DPR=1;
  function resize(){
    DPR = Math.min(devicePixelRatio||1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.floor(W*DPR);
    canvas.height = Math.floor(H*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  addEventListener("resize", resize);
  resize();

  // ---------- UI ----------
  const coinsEl = document.getElementById("coins");
  const heartsEl = document.getElementById("hearts");

  const screenTitle = document.getElementById("screenTitle");
  const screenWin = document.getElementById("screenWin");

  const btnStart = document.getElementById("btnStart");
  const btnCredits = document.getElementById("btnCredits");
  const btnSettings = document.getElementById("btnSettings");
  const btnPlayAgain = document.getElementById("btnPlayAgain");

  const panelCredits = document.getElementById("panelCredits");
  const panelSettings = document.getElementById("panelSettings");
  const toggleSfx = document.getElementById("toggleSfx");

  const btnFs = document.getElementById("btnFs");
  const btnRestart = document.getElementById("btnRestart");

  // logo image
  const logoImg = document.getElementById("logoImg");
  logoImg.src = "assets/logo.png";
  logoImg.onerror = () => { logoImg.style.display="none"; };

  btnCredits.onclick = () => {
    panelCredits.style.display = panelCredits.style.display==="block" ? "none" : "block";
    panelSettings.style.display = "none";
  };
  btnSettings.onclick = () => {
    panelSettings.style.display = panelSettings.style.display==="block" ? "none" : "block";
    panelCredits.style.display = "none";
  };

  btnFs.onclick = async () => {
    try{
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    }catch{}
  };

  // ---------- Simple SFX (no mp3 needed) ----------
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audio = new AudioCtx();
  function ensureAudio(){ if(audio.state==="suspended") audio.resume().catch(()=>{}); }
  function beep(freq=700, dur=0.06, type="square", vol=0.04){
    if(!toggleSfx.checked) return;
    const o=audio.createOscillator(), g=audio.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=vol;
    o.connect(g).connect(audio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime+dur);
    o.stop(audio.currentTime+dur+0.01);
  }
  function noisePop(dur=0.06, vol=0.03){
    if(!toggleSfx.checked) return;
    const n=Math.floor(audio.sampleRate*dur);
    const buf=audio.createBuffer(1,n,audio.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const src=audio.createBufferSource(); src.buffer=buf;
    const g=audio.createGain(); g.gain.value=vol;
    src.connect(g).connect(audio.destination);
    src.start();
  }

  // ---------- Input ----------
  const key = {left:false,right:false,jump:false,down:false};
  addEventListener("keydown",(e)=>{
    ensureAudio();
    if(e.key==="ArrowLeft"||e.key==="a"||e.key==="A") key.left=true;
    if(e.key==="ArrowRight"||e.key==="d"||e.key==="D") key.right=true;
    if(e.key===" "||e.key==="ArrowUp"||e.key==="w"||e.key==="W") key.jump=true;
    if(e.key==="ArrowDown"||e.key==="s"||e.key==="S") key.down=true;
  });
  addEventListener("keyup",(e)=>{
    if(e.key==="ArrowLeft"||e.key==="a"||e.key==="A") key.left=false;
    if(e.key==="ArrowRight"||e.key==="d"||e.key==="D") key.right=false;
    if(e.key===" "||e.key==="ArrowUp"||e.key==="w"||e.key==="W") key.jump=false;
    if(e.key==="ArrowDown"||e.key==="s"||e.key==="S") key.down=false;
  });

  // Mobile buttons
  document.querySelectorAll(".mBtn").forEach(btn=>{
    const prop = btn.dataset.k;
    const on = (e)=>{ e.preventDefault(); ensureAudio(); key[prop]=true; };
    const off = (e)=>{ e.preventDefault(); key[prop]=false; };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("pointerleave", off);
  });

  // ---------- Helpers ----------
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const overlap=(a,b)=>a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  // ---------- Sprites ----------
  // NOTE: If you upload PNGs, they appear automatically.
  function loadImg(src){
    const img = new Image();
    img.src = src;
    img.loaded = false;
    img.onload = ()=> img.loaded=true;
    img.onerror = ()=> img.loaded=false;
    return img;
  }
  const imgPlayer = loadImg("assets/player.png");
  const imgWorm = loadImg("assets/worm.png");
  const imgBlob = loadImg("assets/blobking.png");

  // Draw sprite helper (pixel)
  function drawSprite(img, x,y,w,h){
    if(img && img.loaded){
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
      return true;
    }
    return false;
  }

  // ---------- Game World ----------
  const GRAV=2400, MOVE=720, JUMP=920;
  const TILE=56;

  const world = {
    w: 5600,
    h: 1400,
    groundY: 1060
  };

  const cam = {x:0,y:0};
  let coins=0, hearts=3;
  let state = "title"; // title | play | boss | win

  const player = {x:240,y:0,w:48,h:52,vx:0,vy:0,onGround:false};
  let platforms=[], coinsList=[], worms=[], pipes=[], flag=null;
  let blobking=null;
  let confetti=[];

  function resetLevel(){
    coins=0; hearts=3;
    coinsEl.textContent=coins;
    heartsEl.textContent=hearts;

    state="title";
    screenTitle.classList.remove("hidden");
    screenWin.classList.add("hidden");

    player.x=240; player.y=world.groundY-player.h;
    player.vx=0; player.vy=0; player.onGround=false;

    // Platforms
    platforms = [
      {x:-500,y:world.groundY,w:world.w+1000,h:500},
      {x:520,y:860,w:260,h:34},
      {x:900,y:760,w:260,h:34},
      {x:1300,y:860,w:300,h:34},
      {x:1700,y:720,w:260,h:34},
      {x:2100,y:860,w:320,h:34},
      {x:2550,y:760,w:280,h:34},
      {x:2950,y:860,w:320,h:34},
      {x:3400,y:720,w:260,h:34},
      {x:3800,y:860,w:320,h:34},
      {x:4200,y:760,w:260,h:34},
      // Boss arena platform area
      {x:4700,y:880,w:700,h:34},
    ];

    // Coins
    coinsList=[];
    function coinLine(x,y,n,dx){
      for(let i=0;i<n;i++) coinsList.push({x:x+i*dx,y,r:14,taken:false,phase:Math.random()*6.28});
    }
    coinLine(560,820,4,46);
    coinLine(940,720,5,46);
    coinLine(1360,820,5,46);
    coinLine(1750,680,4,46);
    coinLine(2160,820,6,46);
    coinLine(2590,720,5,46);
    coinLine(3000,820,6,46);
    coinLine(3440,680,4,46);
    coinLine(3860,820,6,46);
    coinLine(4240,720,4,46);
    coinLine(4880,820,8,46); // boss arena coins

    // Pipes (enterable)
    pipes = [
      {x:1120,y:world.groundY-130,w:96,h:130,enter:true,toX:3000,toY:world.groundY-130},
      {x:3050,y:world.groundY-130,w:96,h:130,enter:true,toX:1180,toY:world.groundY-130},
      {x:1900,y:world.groundY-110,w:96,h:110,enter:false},
      {x:4520,y:world.groundY-150,w:96,h:150,enter:false},
    ];

    // Enemies (worms)
    worms = [
      {x:860,y:world.groundY-44,w:54,h:34,dir:1,speed:90,min:800,max:1100,alive:true},
      {x:1600,y:world.groundY-44,w:54,h:34,dir:-1,speed:90,min:1500,max:1850,alive:true},
      {x:2380,y:world.groundY-44,w:54,h:34,dir:1,speed:90,min:2250,max:2600,alive:true},
      {x:3250,y:world.groundY-44,w:54,h:34,dir:-1,speed:90,min:3100,max:3450,alive:true},
      {x:4020,y:world.groundY-44,w:54,h:34,dir:1,speed:90,min:3920,max:4300,alive:true},
    ];

    // Boss
    blobking = {x:5000,y:world.groundY-96,w:120,h:96,hp:6,alive:true,dir:-1,vx:80,stun:0};

    // Flagpole
    flag = {x:5450,y:world.groundY-360,w:18,h:360,reached:false};

    confetti=[];
  }

  // collisions
  function resolve(entity, dt){
    entity.onGround=false;

    entity.x += entity.vx*dt;
    // platforms + pipes (solid)
    const solids = [...platforms, ...pipes.map(p=>({x:p.x,y:p.y,w:p.w,h:p.h}))];
    for(const s of solids){
      if(overlap(entity,s)){
        if(entity.vx>0) entity.x = s.x-entity.w;
        if(entity.vx<0) entity.x = s.x+s.w;
        entity.vx = 0;
      }
    }

    entity.y += entity.vy*dt;
    for(const s of solids){
      if(overlap(entity,s)){
        if(entity.vy>0){
          entity.y = s.y-entity.h;
          entity.vy = 0;
          entity.onGround=true;
        }else if(entity.vy<0){
          entity.y = s.y+s.h;
          entity.vy = 0;
        }
      }
    }

    entity.x = clamp(entity.x, 0, world.w-entity.w);
  }

  function tryEnterPipe(){
    if(!key.down) return;
    const feet = player.y+player.h;
    for(const p of pipes){
      if(!p.enter) continue;
      const onTop = Math.abs(feet - p.y) < 3;
      const mid = player.x + player.w/2;
      const within = mid>p.x && mid<p.x+p.w;
      if(onTop && within){
        noisePop(0.06,0.03); beep(260,0.06,"square",0.05);
        player.x = p.toX;
        player.y = p.toY - player.h;
        player.vx=0; player.vy=0;
      }
    }
  }

  function hurt(){
    hearts--;
    heartsEl.textContent=hearts;
    beep(170,0.14,"square",0.05);
    if(hearts<=0){
      // reset to title
      resetLevel();
    }else{
      player.x=240;
      player.y=world.groundY-player.h;
      player.vx=0; player.vy=0;
    }
  }

  // confetti burst
  function confettiBurst(x,y){
    for(let i=0;i<120;i++){
      confetti.push({
        x,y,
        vx:(Math.random()*2-1)*520,
        vy:(-Math.random()*700)-120,
        g:1200,
        life:1.8+Math.random()*0.8,
        size:4+Math.random()*6,
        r:Math.random()*Math.PI*2
      });
    }
  }

  // ---------- Draw World ----------
  function drawBackground(){
    // sky
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#7fd6ff");
    g.addColorStop(1,"#d7fbff");
    ctx.fillStyle=g;
    ctx.fillRect(0,0,W,H);

    // sun glow
    const sx=W*0.16, sy=H*0.18;
    const rg=ctx.createRadialGradient(sx,sy,20,sx,sy,260);
    rg.addColorStop(0,"rgba(255,255,255,0.9)");
    rg.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=rg;
    ctx.fillRect(0,0,W,H);

    // clouds (parallax)
    drawCloud(240,140,1.2);
    drawCloud(620,120,1.0);
    drawCloud(980,180,1.35);
    drawCloud(1320,120,1.1);
    drawCloud(1620,160,1.25);
    drawCloud(1920,130,1.05);
  }

  function drawCloud(x,y,s){
    const X = x - cam.x*0.35;
    const Y = y - cam.y*0.35;
    ctx.save();
    ctx.globalAlpha=0.96;
    ctx.fillStyle="rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(X, Y, 60*s, 34*s, 0, 0, Math.PI*2);
    ctx.ellipse(X+52*s, Y+6*s, 56*s, 30*s, 0, 0, Math.PI*2);
    ctx.ellipse(X-52*s, Y+8*s, 52*s, 28*s, 0, 0, Math.PI*2);
    ctx.ellipse(X+18*s, Y-18*s, 52*s, 30*s, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawGrass(){
    const gy = world.groundY - cam.y;
    ctx.fillStyle="#57d46c";
    ctx.fillRect(0, gy, W, H-gy);
    ctx.fillStyle="#3fc85c";
    ctx.fillRect(0, gy, W, 18);
  }

  function drawPlatform(p){
    const x=p.x-cam.x, y=p.y-cam.y;
    ctx.fillStyle="#d39a63"; roundRect(x,y,p.w,p.h,10); ctx.fill();
    ctx.fillStyle="#45d060"; roundRect(x,y, p.w, Math.min(16,p.h), 10); ctx.fill();
    ctx.fillStyle="rgba(0,0,0,0.08)";
    ctx.fillRect(x, y+p.h-8, p.w, 8);
  }

  function drawPipe(p){
    const x=p.x-cam.x, y=p.y-cam.y;
    ctx.fillStyle="#2fbf4d"; roundRect(x,y,p.w,p.h,14); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.22)"; roundRect(x+10,y+10,18,p.h-20,12); ctx.fill();
    ctx.fillStyle="#25a940"; roundRect(x-10,y-20,p.w+20,28,14); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.18)"; roundRect(x-6,y-16,p.w+12,18,12); ctx.fill();
  }

  function drawCoin(cn, t){
    if(cn.taken) return;
    const x=cn.x-cam.x, y=cn.y-cam.y + Math.sin(t*5+cn.phase)*4;

    const glow=ctx.createRadialGradient(x,y,2,x,y,26);
    glow.addColorStop(0,"rgba(255,255,255,.9)");
    glow.addColorStop(1,"rgba(255,215,64,0)");
    ctx.fillStyle=glow;
    ctx.beginPath(); ctx.arc(x,y,24,0,Math.PI*2); ctx.fill();

    ctx.fillStyle="#ffd24d";
    ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(0,0,0,.14)";
    ctx.beginPath(); ctx.arc(x+4,y+3,9,0,Math.PI*2); ctx.fill();
  }

  function drawPlayer(){
    const x=player.x-cam.x, y=player.y-cam.y;
    // try draw image sprite; fallback if missing
    const ok = drawSprite(imgPlayer, x, y, player.w, player.h);
    if(!ok){
      ctx.fillStyle="#3b6cff"; roundRect(x,y,player.w,player.h,12); ctx.fill();
      ctx.fillStyle="#ffe7c9"; roundRect(x+8,y+16,player.w-16,18,10); ctx.fill();
      ctx.fillStyle="rgba(0,0,0,.55)";
      ctx.beginPath(); ctx.arc(x+14,y+24,2.2,0,Math.PI*2); ctx.arc(x+player.w-14,y+24,2.2,0,Math.PI*2); ctx.fill();
    }
  }

  function drawWorm(w){
    if(!w.alive) return;
    const x=w.x-cam.x, y=w.y-cam.y;
    const ok = drawSprite(imgWorm, x, y, w.w, w.h);
    if(!ok){
      ctx.fillStyle="#ffcc55"; roundRect(x,y,w.w,w.h,12); ctx.fill();
      ctx.fillStyle="rgba(0,0,0,.55)";
      ctx.beginPath(); ctx.arc(x+14,y+14,2.2,0,Math.PI*2); ctx.arc(x+w.w-14,y+14,2.2,0,Math.PI*2); ctx.fill();
    }
  }

  function drawBlobking(b){
    if(!b.alive) return;
    const x=b.x-cam.x, y=b.y-cam.y;
    const ok = drawSprite(imgBlob, x, y, b.w, b.h);
    if(!ok){
      ctx.fillStyle="#e9c18b"; roundRect(x,y,b.w,b.h,18); ctx.fill();
      // crown
      ctx.fillStyle="#ffd24d";
      ctx.beginPath();
      ctx.moveTo(x+30,y); ctx.lineTo(x+44,y-18); ctx.lineTo(x+58,y);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawFlag(){
    const x=flag.x-cam.x, y=flag.y-cam.y;
    // pole
    ctx.fillStyle="#e6e6e6";
    roundRect(x,y,flag.w,flag.h,8); ctx.fill();
    // flag
    ctx.fillStyle="#ff4a6e";
    roundRect(x+flag.w, y+24, 64, 34, 10); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.35)";
    roundRect(x+flag.w+8, y+30, 38, 10, 8); ctx.fill();
  }

  function drawBossArenaLabel(){
    // cozy boss arena sign
    const x=4800-cam.x, y=640-cam.y;
    ctx.fillStyle="rgba(255,255,255,.8)";
    roundRect(x,y,360,70,16); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,.12)"; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle="#0b2030";
    ctx.font="900 18px ui-monospace, monospace";
    ctx.fillText("Boss Arena: Blobking 👑", x+16, y+42);
  }

  function drawConfetti(dt){
    for(const p of confetti){
      p.vy += p.g*dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.life -= dt;
      p.r += dt*6;
    }
    confetti = confetti.filter(p=>p.life>0 && p.y < world.groundY+400);

    for(const p of confetti){
      const x=p.x-cam.x, y=p.y-cam.y;
      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(p.r);
      ctx.globalAlpha = clamp(p.life,0,1);
      // pastel random color
      ctx.fillStyle = `hsl(${Math.floor((p.r*80)%360)}, 90%, 65%)`;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    }
  }

  // ---------- Game Update ----------
  let running = false;
  let t=0, last=performance.now();

  btnStart.onclick = () => {
    ensureAudio();
    screenTitle.classList.add("hidden");
    state="play";
    running=true;
    beep(740,0.06,"square",0.05);
  };

  btnRestart.onclick = () => { ensureAudio(); resetLevel(); beep(320,0.06,"square",0.05); };
  btnPlayAgain.onclick = () => { ensureAudio(); resetLevel(); beep(740,0.06,"square",0.05); };

  function step(now){
    const dt=Math.min(0.033,(now-last)/1000);
    last=now; t+=dt;

    if(running){
      // movement
      const ax = (key.right?1:0) - (key.left?1:0);
      player.vx += ax*MOVE*dt;
      player.vx *= player.onGround ? 0.86 : 0.95;

      // gravity
      player.vy += GRAV*dt;

      // jump
      if(key.jump && player.onGround){
        player.vy = -JUMP;
        player.onGround=false;
        beep(880,0.05,"square",0.05);
      }

      // pipe enter
      tryEnterPipe();

      // collisions
      resolve(player, dt);

      // camera follow
      cam.x = clamp(player.x + player.w/2 - W*0.5, 0, Math.max(0, world.w - W));
      cam.y = clamp(player.y + player.h/2 - H*0.55, 0, Math.max(0, world.h - H));

      // coins
      for(const c of coinsList){
        if(c.taken) continue;
        const dx=(player.x+player.w/2)-c.x;
        const dy=(player.y+player.h/2)-c.y;
        if(dx*dx+dy*dy < 30*30){
          c.taken=true;
          coins++;
          coinsEl.textContent=coins;
          beep(1180,0.04,"square",0.04);
        }
      }

      // worms
      for(const w of worms){
        if(!w.alive) continue;
        w.x += w.dir*w.speed*dt;
        if(w.x<w.min){w.x=w.min; w.dir=1;}
        if(w.x>w.max){w.x=w.max; w.dir=-1;}

        if(overlap(player,w)){
          // stomp?
          const prevBottom = (player.y - player.vy*dt) + player.h;
          const stomp = (player.vy>0) && (prevBottom <= w.y+8);
          if(stomp){
            w.alive=false;
            player.vy = -JUMP*0.55;
            noisePop(0.05,0.03); beep(980,0.05,"triangle",0.05);
          }else{
            hurt();
            break;
          }
        }
      }

      // Boss zone trigger
      if(state==="play" && player.x>4550){
        state="boss";
      }

      // Blobking boss logic
      if(state==="boss" && blobking.alive){
        if(blobking.stun>0) blobking.stun -= dt;
        else{
          blobking.x += blobking.vx*blobking.dir*dt;
          if(blobking.x<4780){blobking.x=4780; blobking.dir=1;}
          if(blobking.x>5250){blobking.x=5250; blobking.dir=-1;}
        }

        // collide
        if(overlap(player,blobking)){
          const prevBottom = (player.y - player.vy*dt) + player.h;
          const stomp = (player.vy>0) && (prevBottom <= blobking.y+10);
          if(stomp){
            blobking.hp--;
            blobking.stun = 0.4;
            player.vy = -JUMP*0.62;
            noisePop(0.06,0.035);
            beep(1040,0.06,"triangle",0.05);

            if(blobking.hp<=0){
              blobking.alive=false;
              beep(520,0.08,"square",0.05);
              beep(660,0.08,"square",0.05);
            }
          }else{
            hurt();
          }
        }
      }

      // Flagpole reach (only after boss defeated)
      if(!flag.reached && !blobking.alive){
        const r = {x:flag.x-12, y:flag.y, w:flag.w+90, h:flag.h};
        if(overlap(player,r)){
          flag.reached=true;
          state="win";
          running=false;
          screenWin.classList.remove("hidden");
          confettiBurst(flag.x+40, flag.y+50);
          beep(880,0.07,"square",0.05);
          beep(1040,0.07,"square",0.05);
          beep(1320,0.07,"square",0.05);
        }
      }
    }

    // ---------- Draw ----------
    ctx.clearRect(0,0,W,H);
    drawBackground();
    drawGrass();

    // platforms
    for(const p of platforms) if(p.y < world.groundY) drawPlatform(p);

    // pipes
    for(const p of pipes) drawPipe(p);

    // coins
    for(const c of coinsList) drawCoin(c, t);

    // worms
    for(const w of worms) drawWorm(w);

    // boss label + boss
    if(player.x>4400) drawBossArenaLabel();
    drawBlobking(blobking);

    // flag
    drawFlag();

    // player
    drawPlayer();

    // confetti
    drawConfetti(dt);

    requestAnimationFrame(step);
  }

  function confettiBurst(x,y){
    for(let i=0;i<140;i++){
      confetti.push({
        x,y,
        vx:(Math.random()*2-1)*600,
        vy:(-Math.random()*780)-120,
        g:1200,
        life:1.8+Math.random()*0.9,
        size:4+Math.random()*6,
        r:Math.random()*Math.PI*2
      });
    }
  }

  // Start!
  resetLevel();
  requestAnimationFrame(step);
})();
