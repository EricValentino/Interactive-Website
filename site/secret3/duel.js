/* ===========================
   FINAL DUEL — game runtime (enhanced)
   =========================== */

// ===== Canvas setup
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
let W, H, DPR = Math.min(2, self.devicePixelRatio || 1);
function resize(){
  W = canvas.width  = Math.floor(innerWidth * DPR);
  H = canvas.height = Math.floor(innerHeight * DPR);
  canvas.style.width  = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
}
addEventListener('resize', resize); resize();

// ===== UI refs
const hpYouEl  = document.getElementById('hpYou');
const hpBossEl = document.getElementById('hpBoss');
const overlay  = document.getElementById('overlay');
const ovTitle  = document.getElementById('ovTitle');
const ovText   = document.getElementById('ovText');
const backBtn  = document.getElementById('backBtn');
const retryBtn = document.getElementById('retryBtn');
const musicBtn = document.getElementById('musicBtn');

// ===== Auto-save star
try { localStorage.setItem('found_star3','1'); } catch(e){}

// ===== Music + SFX
const musicEl = document.getElementById('music');
let musicEnabled = (localStorage.getItem('duel_music') ?? '1') === '1';
musicBtn.classList.toggle('ghost', !musicEnabled);
musicBtn.textContent = musicEnabled ? '♫ Music' : '🔇 Music';

// WebAudio (SFX) — limiter + master gain
const AC = new (window.AudioContext || window.webkitAudioContext)();
const master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
const limiter = AC.createDynamicsCompressor();
limiter.threshold.value = -10;
limiter.knee.value = 0;
limiter.ratio.value = 20;
limiter.attack.value = 0.003;
limiter.release.value = 0.05;
limiter.connect(master);

// ensure AudioContext resumes on first gesture (for autoplay-restricted browsers)
function resumeAudio(){ if(AC.state !== 'running'){ AC.resume().catch(()=>{}); } }
addEventListener('pointerdown', resumeAudio, {once:true});
addEventListener('keydown', resumeAudio, {once:true});

// Music button
musicBtn.addEventListener('click', ()=>{
  musicEnabled = !musicEnabled;
  localStorage.setItem('duel_music', musicEnabled ? '1' : '0');
  musicBtn.classList.toggle('ghost', !musicEnabled);
  musicBtn.textContent = musicEnabled ? '♫ Music' : '🔇 Music';
  if(musicEnabled){
    musicEl.volume = 0; musicEl.play().catch(()=>{});
    fadeAudio(musicEl, 0.0, 0.75, 800);
  }else{
    fadeAudio(musicEl, musicEl.volume, 0.0, 600, ()=> musicEl.pause());
  }
});

function fadeAudio(el, from, to, ms, done){
  const t0 = performance.now();
  function tick(t){
    const k = Math.min(1,(t-t0)/ms);
    el.volume = from + (to-from)*k;
    if(k<1) requestAnimationFrame(tick); else done && done();
  }
  requestAnimationFrame(tick);
}
if(musicEnabled){
  musicEl.volume = 0; musicEl.play().catch(()=>{});
  fadeAudio(musicEl, 0, 0.75, 800);
}

// ---- SFX helpers
function osc(freq=440, type='sine'){ const o=AC.createOscillator(); o.type=type; o.frequency.value=freq; return o; }
function env(gain=0.06, dur=0.1){
  const g = AC.createGain();
  g.gain.value = 0.0001;
  const t = AC.currentTime;
  g.gain.exponentialRampToValueAtTime(gain, t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  return { g, t, dur };
}
function playNode(o, g, dur){ o.connect(g); g.connect(limiter); const t=AC.currentTime; o.start(t); o.stop(t+dur+0.03); }

const sfx = {
  hit(){
    const o1=osc(90,'sawtooth'), e1=env(0.12,0.12);
    const o2=osc(240,'square'),  e2=env(0.05,0.08);
    playNode(o1,e1.g,e1.dur); playNode(o2,e2.g,e2.dur);
  },
  dash(){
    const o=osc(620,'triangle'), e=env(0.06,0.12);
    o.frequency.exponentialRampToValueAtTime(240, e.t+0.12);
    playNode(o,e.g,0.12);
  },
  parry(){
    const o1=osc(1200,'square'), e1=env(0.08,0.10);
    const o2=osc(700,'triangle'), e2=env(0.06,0.14);
    playNode(o1,e1.g,e1.dur); playNode(o2,e2.g,e2.dur);
  },
  shield(){
    const o=osc(340,'sine'), e=env(0.04,0.06);
    playNode(o,e.g,0.06);
  },
  bossHurt(){
    const o=osc(140,'sawtooth'), e=env(0.12,0.18);
    playNode(o,e.g,0.18);
  },
  win(){
    const o1=osc(660,'triangle'), e1=env(0.08,0.14);
    const o2=osc(880,'triangle'), e2=env(0.08,0.18);
    const o3=osc(990,'square'),   e3=env(0.06,0.22);
    playNode(o1,e1.g,e1.dur); playNode(o2,e2.g,e2.dur); playNode(o3,e3.g,e3.dur);
  },
  lose(){
    const o1=osc(160,'sawtooth'), e1=env(0.10,0.24);
    const o2=osc(110,'sine'),     e2=env(0.08,0.28);
    playNode(o1,e1.g,e1.dur); playNode(o2,e2.g,e2.dur);
  }
};

// ===== Utility
const TAU = Math.PI*2;
const rnd = (a,b)=> a + Math.random()*(b-a);
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }

// ===== World / Player / Boss
const world = {
  stars: [],
  splashes: [], // {x,y,r,life,col,beam?,phase?}
  time: 0,
  shake: 0,       // camera shake magnitude (px @ DPR)
  vignette: 0,    // damage vignette alpha
  chroma: 0       // parry flash
};

function initStars(){
  world.stars.length = 0;
  const far = Math.round((W*H)/22000);
  const near= Math.round((W*H)/36000);
  for(let i=0;i<far;i++){
    world.stars.push({x:Math.random()*W, y:Math.random()*H, z:rnd(0.3,0.9), a:rnd(.3,.7), s:0.15});
  }
  for(let i=0;i<near;i++){
    world.stars.push({x:Math.random()*W, y:Math.random()*H, z:rnd(1.0,1.8), a:rnd(.25,.5), s:0.35});
  }
}
initStars();

const player = {
  x: W*0.25, y: H*0.6, r: 12*DPR, vx:0, vy:0, speed: 0.45*DPR, dash:0,
  hp:1, alive:true, shield:false, iFrames:0
};
const boss = {
  x: W*0.72, y: H*0.38, r: 18*DPR, hp:1, alive:true,
  phase:1, timer:0, attackCd:0, coreOpen:0, halo:0
};

// ===== Input
const keys = new Set();
let mouse = {x: W/2, y: H/2, rmb:false};
addEventListener('keydown', e=>{
  if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
});
addEventListener('keyup', e=> keys.delete(e.code));
addEventListener('mousemove', e=> { mouse.x = e.clientX*DPR; mouse.y = e.clientY*DPR; });
addEventListener('contextmenu', e=> e.preventDefault());
addEventListener('mousedown', e=> {
  if(e.button===2){ player.shield=true; sfx.shield(); }
  if(e.button===0){ doParry(); }
});
addEventListener('mouseup', e=> { if(e.button===2) player.shield=false; });

// ===== Projectiles (pooled)
const bullets = [];
function spawnBullet(x,y,vx,vy,r,col,life=8){
  bullets.push({x,y,vx,vy,r,col,life,age:0,dead:false});
}
function spawnRing(cx,cy, n, speed, r, col){
  for(let i=0;i<n;i++){
    const a = i/n*TAU;
    spawnBullet(cx,cy, Math.cos(a)*speed, Math.sin(a)*speed, r, col);
  }
}
function spawnHoming(n, speed, r, col){
  for(let i=0;i<n;i++){
    const a = rnd(0,TAU);
    const d = rnd(40,260)*DPR;
    const x = boss.x + Math.cos(a)*d;
    const y = boss.y + Math.sin(a)*d;
    const dir = Math.atan2(player.y-y, player.x-x);
    spawnBullet(x,y, Math.cos(dir)*speed, Math.sin(dir)*speed, r, col);
  }
}
function spawnSpiral(turns=2, n=40, base=0.6*DPR, r=6*DPR, col='#86fff0'){
  const T = turns*n;
  for(let i=0;i<T;i++){
    const a = i*(TAU/n);
    const sp = base + (i/T)*0.6*DPR;
    spawnBullet(boss.x, boss.y, Math.cos(a)*sp, Math.sin(a)*sp, r, col);
  }
}
function spawnSweep(){
  // telegraph rim
  world.splashes.push({x:W*0.5,y:boss.y, r:W*0.48, life:.7, col:'rgba(140,255,234,0.18)', beam:true, phase:'warn'});
  setTimeout(()=>{
    world.splashes.push({x:W*0.5,y:boss.y, r:W*0.48, life:.35, col:'rgba(120,240,220,0.45)', beam:true, phase:'hit'});
  }, 700);
}
function spawnSplash(x,y,r,col){ world.splashes.push({x,y,r,life:1,col}); }

// ===== Parry
function doParry(){
  spawnSplash(player.x, player.y, 90*DPR, 'rgba(138,255,234,.9)');
  sfx.parry();
  world.chroma = 0.5; // brief chromatic flash
  // clear nearby bullets
  for(const b of bullets){
    const rr = (70*DPR + b.r);
    if(dist2(b.x,b.y,player.x,player.y) < rr*rr){ b.dead = true; }
  }
  // damage during core window
  if(boss.coreOpen>0){
    boss.hp = Math.max(0, boss.hp - 0.20);
    spawnSplash(boss.x,boss.y,40*DPR,'#ff9bb0');
    sfx.bossHurt();
    world.shake = Math.min(12*DPR, world.shake + 7*DPR);
    boss.coreOpen = 0; // close after hit
  }
}

// ===== Boss AI (clearer rhythm + variety)
function bossThink(dt){
  boss.timer += dt; boss.attackCd -= dt;
  boss.halo = Math.max(0, boss.halo - dt*0.9);

  if(boss.phase===1){
    if(boss.attackCd<=0){
      spawnRing(boss.x, boss.y, 24, 0.9*DPR, 6*DPR, '#86fff0');
      boss.attackCd = 1.75;
    }
    if(boss.timer>12 || boss.hp < .75){ boss.phase=2; boss.timer=0; }
  }
  else if(boss.phase===2){
    if(boss.attackCd<=0){
      const roll = Math.random();
      if(roll<0.35) spawnSweep();
      else if(roll<0.7) spawnHoming(7, 1.15*DPR, 7*DPR,'#a3f7ff');
      else spawnSpiral(2, 28, 0.55*DPR, 6*DPR, '#a2fffb');
      boss.attackCd = 1.45;
    }
    if(boss.timer>16 || boss.hp < .45){ boss.phase=3; boss.timer=0; }
  }
  else if(boss.phase===3){
    boss.coreOpen -= dt;
    if(boss.attackCd<=0){
      spawnRing(boss.x, boss.y, 20, 1.05*DPR, 6*DPR, '#ffa7be');
      boss.attackCd = 1.2;
    }
    if(boss.timer>4.2){
      boss.timer=0; boss.coreOpen = 1.05; boss.halo = 1.0;
      spawnSplash(boss.x,boss.y,56*DPR,'rgba(255,160,190,.55)');
    }
  }
}

// ===== Game loop
let last = performance.now();
let running = true;
requestAnimationFrame(loop);

function loop(now){
  const dt = Math.min(0.033,(now-last)/1000); last = now;
  world.time += dt;

  update(dt);
  render();
  if(running) requestAnimationFrame(loop);
}

// ===== Update logic
function update(dt){
  // Player controls
  let ax=0, ay=0;
  if(keys.has('KeyW')) ay -= 1;
  if(keys.has('KeyS')) ay += 1;
  if(keys.has('KeyA')) ax -= 1;
  if(keys.has('KeyD')) ax += 1;
  const len = Math.hypot(ax,ay) || 1;
  ax/=len; ay/=len;

  // dash
  if(keys.has('Space') && player.dash<=0){
    player.vx += ax*6*DPR; player.vy += ay*6*DPR; player.dash = .55;
    sfx.dash(); spawnSplash(player.x, player.y, 26*DPR, 'rgba(138,255,234,.7)');
    world.shake = Math.min(10*DPR, world.shake + 5*DPR);
  } else player.dash -= dt;

  // acceleration + damping
  player.vx += ax*player.speed;
  player.vy += ay*player.speed;
  player.vx *= .985; player.vy *= .985;

  player.x = clamp(player.x + player.vx, 18*DPR, W-18*DPR);
  player.y = clamp(player.y + player.vy, 18*DPR, H-18*DPR);

  if(player.iFrames>0) player.iFrames -= dt;

  // Boss AI
  bossThink(dt);

  // Bullets
  for(const b of bullets){
    b.age += dt;
    // mild homing early life
    if(b.age<1){
      const ang = Math.atan2(player.y-b.y, player.x-b.x);
      b.vx += Math.cos(ang)*0.008*DPR;
      b.vy += Math.sin(ang)*0.008*DPR;
    }
    b.x += b.vx; b.y += b.vy;
    b.life -= dt;
    if(b.life<=0 || b.x<-240 || b.y<-240 || b.x>W+240 || b.y>H+240) b.dead=true;

    // collide with player
    if(!b.dead && player.alive){
      const rr = (player.r + b.r);
      if(dist2(b.x,b.y,player.x,player.y) < rr*rr){
        if(player.shield){ // deflect
          const a = Math.atan2(b.y-player.y, b.x-player.x);
          const sp = 1.2*DPR;
          b.vx = Math.cos(a)*-sp; b.vy = Math.sin(a)*-sp;
          b.col='#ffdede'; b.life*=0.65; sfx.shield();
          spawnSplash(player.x, player.y, 20*DPR,'rgba(140,255,234,.35)');
        } else if(player.iFrames<=0){
          player.hp = Math.max(0, player.hp - 0.09);
          player.iFrames = 0.6;
          sfx.hit();
          spawnSplash(player.x, player.y, 26*DPR, '#ff9bb0');
          world.vignette = Math.min(1, world.vignette + 0.5);
          world.shake = Math.min(12*DPR, world.shake + 6*DPR);
          if(player.hp<=0) return end(false);
        }
      }
    }
  }
  // remove dead bullets
  for(let i=bullets.length-1;i>=0;i--) if(bullets[i].dead) bullets.splice(i,1);

  // Boss soft drift
  boss.x += Math.cos(world.time*.7)*0.25*DPR;
  boss.y += Math.sin(world.time*.55)*0.22*DPR;

  // Splashes decay (beams have faster decay)
  for(const s of world.splashes){
    const k = s.beam ? (s.phase==='warn'?1.4:2.8) : 1.7;
    s.life -= dt * k;
    if(!s.beam) s.r *= 1.012;
  }
  for(let i=world.splashes.length-1;i>=0;i--) if(world.splashes[i].life<=0) world.splashes.splice(i,1);

  // reflected bullets chip boss
  for(const b of bullets){
    if(b.col==='#ffdede'){
      const r = (boss.r+b.r+6);
      if(dist2(boss.x,boss.y,b.x,b.y) < r*r){
        boss.hp = Math.max(0, boss.hp - 0.02);
        b.dead=true; sfx.bossHurt(); spawnSplash(boss.x,boss.y,20*DPR,'#ffbacb');
        world.shake = Math.min(10*DPR, world.shake + 4*DPR);
      }
    }
  }

  // HP bars (ease to value)
  const lerp = (a,b,t)=> a+(b-a)*t;
  if(!update._hpYou) update._hpYou = 1;
  if(!update._hpBoss) update._hpBoss = 1;
  update._hpYou  = lerp(update._hpYou,  clamp(player.hp,0,1), 0.18);
  update._hpBoss = lerp(update._hpBoss, clamp(boss.hp,0,1),  0.18);
  hpYouEl.style.transform  = `scaleX(${update._hpYou})`;
  hpBossEl.style.transform = `scaleX(${update._hpBoss})`;

  // Win
  if(boss.hp<=0) end(true);

  // global post FX decay
  world.shake   = Math.max(0, world.shake - dt*24);
  world.vignette= Math.max(0, world.vignette - dt*0.9);
  world.chroma  = Math.max(0, world.chroma - dt*2.5);
}

// ===== Render
function render(){
  // Camera shake offset
  const sx = (Math.random()*2-1) * world.shake;
  const sy = (Math.random()*2-1) * world.shake;

  // Space backdrop
  ctx.fillStyle = '#051013';
  ctx.fillRect(0,0,W,H);

  // starfield parallax
  for(const s of world.stars){
    s.x -= s.z*s.s; if(s.x<0) s.x=W;
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#93fff1';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.z, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(sx, sy);

  // beam sweeps
  for(const s of world.splashes){
    if(s.beam){
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(1, .12);
      const alpha = clamp(s.life,0,1);
      ctx.fillStyle = s.col.replace(')',`,${alpha})`).replace('rgba(','rgba(');
      ctx.beginPath(); ctx.arc(0,0, s.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // boss core + halo (parry window indicator)
  ctx.save();
  ctx.translate(boss.x, boss.y);
  const open = clamp(boss.coreOpen,0,1);
  const rCore = boss.r + 12*DPR + open*10*DPR;
  const grd = ctx.createRadialGradient(0,0,0,0,0,rCore);
  grd.addColorStop(0, `rgba(255,160,190,${.2 + .5*open})`);
  grd.addColorStop(1, 'rgba(255,160,190,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0,0,rCore,0,TAU); ctx.fill();

  if(boss.halo>0){
    ctx.strokeStyle = `rgba(255,200,220,${boss.halo})`;
    ctx.lineWidth = 3*DPR;
    ctx.beginPath(); ctx.arc(0,0,rCore+6*DPR*Math.sin(world.time*8),0,TAU); ctx.stroke();
  }
  ctx.restore();

  // player
  ctx.fillStyle = '#8affea';
  ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, TAU); ctx.fill();
  if(player.shield){
    ctx.strokeStyle = 'rgba(140,255,234,.55)'; ctx.lineWidth = 3*DPR;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r+6*DPR*(1+Math.sin(world.time*10)*.08), 0, TAU); ctx.stroke();
  }

  // bullets
  ctx.fillStyle = '#fff';
  for(const b of bullets){
    ctx.fillStyle = b.col;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  }

  // splashes (normal)
  for(const s of world.splashes){
    if(s.beam) continue;
    const a = clamp(s.life,0,1);
    const g = ctx.createRadialGradient(s.x,s.y,0, s.x,s.y, s.r);
    // inner tint
    g.addColorStop(0, s.col.includes('#') ? s.col : 'rgba(140,255,234,.8)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Post FX — vignette + chroma flash
  if(world.vignette>0 || world.chroma>0){
    // vignette
    const v = world.vignette * 0.6;
    const vg = ctx.createRadialGradient(W/2,H/2, Math.min(W,H)*0.2, W/2,H/2, Math.max(W,H)*0.65);
    vg.addColorStop(0, `rgba(0,0,0,0)`);
    vg.addColorStop(1, `rgba(100,0,20,${v})`);
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);

    // chroma flash (parry)
    if(world.chroma>0){
      const a = clamp(world.chroma,0,1)*0.6;
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(144,255,233,${a})`;
      ctx.fillRect(0,0,W,H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// ===== Endings
function end(win){
  if(!running) return;
  running=false;
  if(musicEnabled) fadeAudio(musicEl, musicEl.volume, 0, 1000, ()=> musicEl.pause());

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden','false');
  if(win){
    ovTitle.textContent = 'Victory!';
    ovText.textContent  = 'You shattered the Celestial Warden’s core. The final secret star is yours.';
    backBtn.classList.remove('disabled'); backBtn.setAttribute('aria-disabled','false');
    sfx.win();
  }else{
    ovTitle.textContent = 'Defeat';
    ovText.textContent  = 'The cosmos humbled you this time. Try again, champion.';
    sfx.lose();
  }
}
retryBtn.addEventListener('click', ()=> location.reload());

