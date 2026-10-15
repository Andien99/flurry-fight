// Player (student) client: join screen, 3D first-person game, questions and results.
import { World3D } from './world3d.js';

(() => {
  const F = window.FF, R = window.FFRender;
  const $ = (id) => document.getElementById(id);
  const socket = io();
  const SESSION_KEY = 'flurry-session';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    code: null, pid: null, token: null, name: '', colour: F.PLAYER_COLOURS[Math.floor(Math.random() * F.PLAYER_COLOURS.length)],
    settings: null, screen: 'join',
    world: R.newWorld(false),
    me: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, stamina: 100, tired: false, seq: -1, alive: false, ammo: 0 },
    jumpQueued: false, touchRun: false,
    revealUntil: 0,
    mode: 'question', keys: new Set(), mouse: { x: 0, y: 0, down: false },
    lastThrow: 0, lastSend: 0, lastHud: 0, lastOutToast: 0,
    question: null, answering: false, qTimer: null,
    koBy: '', deadAt: 0, feed: [], stick: null, results: null, looping: false,
  };

  // ---------- screens ----------
  function show(id) {
    for (const s of ['s-join', 's-wait', 's-game', 's-end']) $(s).hidden = s !== id;
    S.screen = id;
    if (id === 's-join' || id === 's-wait' || id === 's-end') startSnow();
  }

  // Falling snow on the join screen (static when reduced motion is on).
  let snowRunning = false;
  function startSnow() {
    const c = $('snowfall');
    if (!c || snowRunning) return;
    snowRunning = true;
    const ctx = c.getContext('2d');
    const flakes = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3, s: 0.02 + Math.random() * 0.05, d: Math.random() * 6 }));
    let last = performance.now();
    function frame(now) {
      if (S.screen !== 's-join') { snowRunning = false; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      c.width = c.clientWidth; c.height = c.clientHeight;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of flakes) {
        if (!reducedMotion) { f.y += f.s * dt * 3; f.x += Math.sin(now / 1500 + f.d) * 0.0004; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); } }
        ctx.beginPath(); ctx.arc(f.x * c.width, f.y * c.height, f.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!reducedMotion) requestAnimationFrame(frame); else snowRunning = false;
    }
    requestAnimationFrame(frame);
  }

  // ---------- joining ----------
  const swatches = $('swatches');
  F.PLAYER_COLOURS.forEach((col) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.style.background = col;
    b.setAttribute('aria-label', 'Colour ' + col);
    b.setAttribute('aria-pressed', String(col === S.colour));
    b.onclick = () => { S.colour = col; [...swatches.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); };
    swatches.appendChild(b);
  });

  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) $('code').value = urlCode.replace(/\D/g, '').slice(0, 6);
  $('code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });

  $('f-code').onsubmit = (e) => {
    e.preventDefault();
    const code = $('code').value.trim();
    $('code-err').textContent = '';
    if (code.length !== 6) { $('code-err').textContent = 'Game codes have 6 digits.'; return; }
    socket.emit('game:check', { code }, (res) => {
      if (!res || !res.ok) { $('code-err').textContent = (res && res.error) || 'Could not reach the game.'; return; }
      S.code = code;
      $('f-code').hidden = true; $('f-name').hidden = false;
      $('name').focus();
    });
  };
  $('back').onclick = () => { $('f-name').hidden = true; $('f-code').hidden = false; $('code').focus(); };
  $('f-name').onsubmit = (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    $('name-err').textContent = '';
    if (!name) { $('name-err').textContent = 'Type your name so your teacher knows who you are.'; return; }
    join({ code: S.code, name, colour: S.colour });
  };

  function join(payload) {
    socket.emit('player:join', payload, (res) => {
      if (!res || !res.ok) {
        sessionStorage.removeItem(SESSION_KEY);
        show('s-join');
        $('f-code').hidden = false; $('f-name').hidden = true;
        $('code-err').textContent = (res && res.error) || 'Could not join that game.';
        return;
      }
      S.code = payload.code; S.pid = res.pid; S.token = res.token; S.name = res.name; S.colour = res.colour;
      S.settings = res.settings;
      S.world.meId = res.pid;
      S.world.teams = !!res.settings.teams;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: S.code, token: S.token }));
      if (res.state === 'lobby') showWait();
      else if (res.state === 'playing') { S.me.ammo = res.me.ammo; enterGame(); }
      else if (res.results) showResults(res.results);
    });
  }

  // Rejoin automatically after a refresh or a dropped connection.
  function tryResume() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { /* ignore */ }
    if (saved && saved.code && saved.token) join({ code: saved.code, token: saved.token });
  }
  socket.on('connect', () => { if (S.token) join({ code: S.code, token: S.token }); });
  tryResume();

  function showWait() {
    show('s-wait');
    $('wait-name').textContent = S.name;
    const c = $('me-preview'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save(); ctx.translate(60, 75); ctx.scale(1.6, 1.6);
    R.drawPlayer(ctx, { x: 0, y: 0, angle: Math.PI / 2, hp: 100, shield: 0 }, { colour: S.colour, name: '' }, false, false, 0);
    ctx.restore();
    // hide the empty name tag drawn above the preview
  }

  socket.on('roster', (r) => {
    S.world.roster = new Map(r.players.map((p) => [p.id, p]));
    if (r.settings) { S.settings = r.settings; S.world.teams = !!r.settings.teams; }
    if (S.screen === 's-wait') {
      const list = $('wait-list');
      list.textContent = '';
      for (const p of r.players) {
        const el = document.createElement('span'); el.className = 'pill';
        const d = document.createElement('span'); d.className = 'dot'; d.style.background = p.colour;
        el.append(d, document.createTextNode(p.name));
        list.appendChild(el);
      }
    }
  });
  socket.on('started', () => { if (S.pid) enterGame(); });
  socket.on('ended', (res) => { if (S.pid) showResults(res); });
  socket.on('kicked', () => leave('Your teacher removed you from the game.'));
  socket.on('closed', () => leave('That game has closed.'));

  function leave(msg) {
    sessionStorage.removeItem(SESSION_KEY);
    S.pid = null; S.token = null;
    show('s-join');
    $('f-code').hidden = false; $('f-name').hidden = true;
    $('code-err').textContent = msg;
  }

  // ---------- game (3D, first person) ----------
  const canvas = $('view');
  const world3d = new World3D(canvas);
  const worldReady = world3d.init().then(() => { $('loading3d').hidden = true; });
  if (/[?&]debug\b/.test(location.search)) { window.__flurry3d = world3d; window.__flurryState = S; }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const SENS = 0.0022;
  const TURN_SPEED = 2.4; // arrow keys, radians per second
  const AIM_LIFT = 0.08;  // throw slightly above the crosshair so the arc lands on it at mid range

  function resize() {
    world3d.resize(canvas.clientWidth, canvas.clientHeight);
  }
  window.addEventListener('resize', resize);

  function enterGame() {
    show('s-game');
    resize();
    S.feed = [];
    world3d.setViewmodelColour((S.world.roster.get(S.pid) || {}).colour || S.colour);
    if (coarse) $('touch').hidden = false;
    setMode(S.mode || 'question');
    buildMinimapBase();
    if (!S.looping) { S.looping = true; requestAnimationFrame(loop); }
  }

  // ---------- mode switching and the mouse ----------
  const locked = () => document.pointerLockElement === canvas;
  function lockMouse() {
    if (coarse || locked()) return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* needs a click first */ }
  }
  function setMode(m) {
    S.mode = m;
    $('m-q').setAttribute('aria-pressed', String(m === 'question'));
    $('m-t').setAttribute('aria-pressed', String(m === 'throw'));
    $('qpanel').hidden = m !== 'question';
    $('s-game').classList.toggle('qmode', m === 'question');
    if (m === 'question') {
      if (locked()) document.exitPointerLock();
      if (!S.question && !S.qTimer) loadQuestion(); else if (S.question && S.question.type === 'text' && !coarse) $('qinput').focus();
    } else {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      lockMouse();
    }
    updateAimOverlay();
  }
  function updateAimOverlay() {
    $('aim-overlay').hidden = coarse || S.mode !== 'throw' || locked() || !S.me.alive && !!S.deadAt;
  }
  document.addEventListener('pointerlockchange', updateAimOverlay);
  $('m-q').onclick = () => setMode('question');
  $('m-t').onclick = () => setMode('throw');
  $('aim-btn').onclick = () => { setMode('throw'); lockMouse(); };

  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '];
  window.addEventListener('keydown', (e) => {
    if (S.screen !== 's-game') return;
    const k = e.key.toLowerCase();
    if (typing()) {
      if (k === 'escape') document.activeElement.blur();
      if (!k.startsWith('arrow')) return; // let them type; arrows still turn and walk
      e.preventDefault();
    }
    if (k === '1') { setMode('question'); return; }
    if (k === '2') { setMode('throw'); return; }
    if (MOVE_KEYS.includes(k)) {
      if (k === ' ' && !S.keys.has(' ')) S.jumpQueued = true;
      S.keys.add(k);
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => S.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { S.keys.clear(); S.mouse.down = false; });

  document.addEventListener('mousemove', (e) => {
    if (!locked()) return;
    S.me.yaw += e.movementX * SENS;
    S.me.pitch = F.clamp(S.me.pitch - e.movementY * SENS, -1.35, 1.35);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || coarse) return;
    if (S.mode !== 'throw' || !locked()) { setMode('throw'); return; } // first click just grabs the mouse
    S.mouse.down = true;
    throwBall();
  });
  window.addEventListener('mouseup', () => { S.mouse.down = false; });

  // ---------- touch: joystick on the left, drag to look on the right, buttons ----------
  if (coarse) {
    let look = null;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const r = canvas.getBoundingClientRect();
        const x = t.clientX - r.left, y = t.clientY - r.top;
        if (!S.stick && x < r.width * 0.42) {
          S.stick = { id: t.identifier, ox: x, oy: y, dx: 0, dy: 0 };
          const st = $('stick'); st.hidden = false; st.style.left = (x - 60) + 'px'; st.style.top = (y - 60) + 'px';
          st.firstElementChild.style.transform = 'translate(0,0)';
        } else if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (S.stick && t.identifier === S.stick.id) {
          const r = canvas.getBoundingClientRect();
          let dx = t.clientX - r.left - S.stick.ox, dy = t.clientY - r.top - S.stick.oy;
          const d = Math.hypot(dx, dy), max = 50;
          if (d > max) { dx = dx / d * max; dy = dy / d * max; }
          S.stick.dx = dx / max; S.stick.dy = dy / max;
          $('stick').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (look && t.identifier === look.id) {
          S.me.yaw += (t.clientX - look.x) * 0.006;
          S.me.pitch = F.clamp(S.me.pitch - (t.clientY - look.y) * 0.006, -1.35, 1.35);
          look.x = t.clientX; look.y = t.clientY;
        }
      }
    }, { passive: false });
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (S.stick && t.identifier === S.stick.id) { S.stick = null; $('stick').hidden = true; }
        if (look && t.identifier === look.id) look = null;
      }
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
    const hold = (id, on, off) => {
      const b = $(id);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); if (off) off(); }, { passive: false });
    };
    hold('t-jump', () => { S.jumpQueued = true; });
    hold('t-throw', () => { if (S.mode !== 'throw') setMode('throw'); S.mouse.down = true; throwBall(); }, () => { S.mouse.down = false; });
    hold('t-run', () => { S.touchRun = !S.touchRun; $('t-run').setAttribute('aria-pressed', String(S.touchRun)); });
  }

  function toast(text, ms = 1600) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms);
  }

  function throwBall() {
    const now = performance.now();
    if (!S.me.alive || now - S.lastThrow < F.SNOWBALL.cooldown * 1000 + 10) return;
    if (S.me.ammo <= 0) {
      if (now - S.lastOutToast > 1500) { S.lastOutToast = now; $('out-hint').hidden = false; clearTimeout(throwBall.h); throwBall.h = setTimeout(() => { $('out-hint').hidden = true; }, 2200); }
      return;
    }
    S.lastThrow = now;
    S.revealUntil = now + F.REVEAL_THROW_MS;
    S.me.ammo--; // optimistic; the next snapshot confirms it
    world3d.playThrow();
    socket.emit('player:throw', { a: S.me.yaw, p: S.me.pitch + AIM_LIFT });
  }

  // ---------- server updates ----------
  const nameOf = (id) => (S.world.roster.get(id) || {}).name || 'Someone';
  socket.on('state', (s) => {
    const now = performance.now();
    R.applySnapshot(S.world, s, now);
    const mine = S.world.players.get(S.pid);
    if (!mine) return;
    const wasAlive = S.me.alive;
    if (mine.seq !== S.me.seq || (mine.alive && !wasAlive)) {
      Object.assign(S.me, { x: mine.tx, y: mine.ty, z: 0, vx: 0, vy: 0, vz: 0, seq: mine.seq });
      if (!wasAlive || S.me.seq <= 1) S.me.yaw = Math.atan2(F.MAP.height / 2 - mine.ty, F.MAP.width / 2 - mine.tx); // face the middle
    } else if (mine.alive && Math.hypot(mine.tx - S.me.x, mine.ty - S.me.y) > 160) { S.me.x = mine.tx; S.me.y = mine.ty; }
    S.me.alive = mine.alive;
    if (now - S.lastThrow > 400) S.me.ammo = mine.ammo;
    if (mine.hp < (S.me.hp ?? 100) && wasAlive) flashDamage();
    S.me.hp = mine.hp; S.me.shield = mine.shield; S.me.kos = mine.kos;
  });

  function pushFeed(text) {
    S.feed.unshift({ text, at: performance.now() });
    S.feed = S.feed.slice(0, 4);
    renderFeed();
  }
  function renderFeed() {
    const el = $('feed');
    el.textContent = '';
    for (const f of S.feed) { const d = document.createElement('div'); d.textContent = f.text; el.appendChild(d); }
  }
  function flashDamage() {
    const d = $('dmg'); d.classList.remove('on'); void d.offsetWidth; d.classList.add('on');
  }
  function hitMarker(ko) {
    const h = $('hitmark'); h.className = 'hitmark'; void h.offsetWidth; h.className = 'hitmark on' + (ko ? ' ko' : '');
  }

  socket.on('ko', (e) => {
    world3d.burst(e.x, e.y, 30, 24, 160);
    world3d.floatText('KO!', e.x, e.y, 90);
    const by = e.by ? nameOf(e.by) : 'the snow';
    pushFeed(`${by} knocked out ${nameOf(e.victim)}`);
    if (e.victim === S.pid) { S.koBy = e.by ? `by ${by}` : ''; S.deadAt = performance.now(); S.me.alive = false; S.mouse.down = false; }
    if (e.by === S.pid) { toast(`You knocked out ${nameOf(e.victim)}!`); hitMarker(true); }
  });
  socket.on('splat', (e) => world3d.burst(e.x, e.y, Math.max(4, e.z || 4), 8, 90, 0xffffff, 2.4));
  socket.on('hit', (e) => {
    if (e.pid === S.pid) { S.revealUntil = performance.now() + F.REVEAL_HIT_MS; flashDamage(); }
    if (e.by === S.pid) hitMarker(false);
    if (e.shield) world3d.burst(e.x, e.y, e.z || 30, 6, 80, 0x5aa8ff, 2.4);
  });
  socket.on('pickup', (e) => {
    const labels = { shield: '+50 shield', cocoa: '+50 health', snow: '+5 snowballs' };
    world3d.floatText(labels[e.type], e.x, e.y, 60, '#ffffff');
    if (e.pid === S.pid) toast(`${F.PICKUP_TYPES[e.type].label}: ${labels[e.type]}`);
  });

  // ---------- minimap ----------
  let miniBase = null;
  function buildMinimapBase() {
    const c = $('minimap');
    miniBase = document.createElement('canvas'); miniBase.width = c.width; miniBase.height = c.height;
    const g = miniBase.getContext('2d');
    const draw = () => {
      const z = Math.min(c.width / F.MAP.width, c.height / F.MAP.height);
      R.draw(g, c.width, c.height, { x: F.MAP.width / 2, y: F.MAP.height / 2, zoom: z }, R.newWorld(false), 0);
    };
    window.FFSprites.ready.then(draw);
  }
  function drawMinimap(now) {
    const c = $('minimap'), g = c.getContext('2d');
    if (!miniBase) return;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(miniBase, 0, 0);
    const z = Math.min(c.width / F.MAP.width, c.height / F.MAP.height);
    const ox = (c.width - F.MAP.width * z) / 2, oy = (c.height - F.MAP.height * z) / 2;
    const P = (x, y) => [ox + x * z, oy + y * z];
    for (const k of S.world.pickups) { const [x, y] = P(k[2], k[3]); g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
    const me = S.world.roster.get(S.pid) || {};
    if (S.world.teams && me.team) {
      for (const p of S.world.players.values()) {
        const info = S.world.roster.get(p.id) || {};
        if (p.id === S.pid || info.team !== me.team || !p.alive || p.hidden || p.x == null) continue;
        const [x, y] = P(p.x, p.y); g.fillStyle = F.TEAM_COLOURS[me.team]; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    if (S.me.alive) {
      const [x, y] = P(S.me.x, S.me.y);
      g.save(); g.translate(x, y); g.rotate(S.me.yaw);
      g.fillStyle = '#e2453c'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  // ---------- frame loop ----------
  let lastFrame = performance.now(), bobT = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (S.screen !== 's-game') { S.looping = false; return; }
    const me = S.me, k = S.keys;
    let moving = false, running = false;

    if (me.alive) {
      // turning with arrow keys (handy while answering)
      if (k.has('arrowleft')) me.yaw -= TURN_SPEED * dt;
      if (k.has('arrowright')) me.yaw += TURN_SPEED * dt;
      // input relative to where you're looking
      let fwd = 0, side = 0;
      if (k.has('w') || k.has('arrowup')) fwd += 1;
      if (k.has('s') || k.has('arrowdown')) fwd -= 1;
      if (k.has('d')) side += 1;
      if (k.has('a')) side -= 1;
      if (S.stick) { fwd = -S.stick.dy; side = S.stick.dx; }
      const len = Math.hypot(fwd, side);
      moving = len > 0.08;
      const wantRun = (k.has('shift') || S.touchRun) && fwd > 0.2;
      if (me.stamina <= 0) me.tired = true;
      if (me.tired && me.stamina > 25) me.tired = false;
      running = moving && wantRun && !me.tired;
      if (running) { me.stamina = Math.max(0, me.stamina - 28 * dt); me.restAt = now + 700; }
      else if (now > (me.restAt || 0)) me.stamina = Math.min(100, me.stamina + 22 * dt);
      const speed = running ? F.RUN_SPEED : F.PLAYER_SPEED;
      const cos = Math.cos(me.yaw), sin = Math.sin(me.yaw);
      const n = len > 1 ? 1 / len : 1;
      const tx = (cos * fwd - sin * side) * n * speed, ty = (sin * fwd + cos * side) * n * speed;
      // snow gives grip, ponds make you slide, and you can't steer much in the air
      const grip = me.z > 0 ? 3 : F.onIce(me.x, me.y) ? 2.2 : 22;
      const kk = Math.min(1, grip * dt);
      me.vx += (tx - me.vx) * kk; me.vy += (ty - me.vy) * kk;
      // jumping
      if (S.jumpQueued && me.z <= 0) { me.vz = F.JUMP_SPEED; }
      S.jumpQueued = false;
      if (me.z > 0 || me.vz > 0) {
        me.vz -= F.GRAVITY * dt; me.z += me.vz * dt;
        if (me.z <= 0) { me.z = 0; me.vz = 0; }
      }
      const sp = Math.hypot(me.vx, me.vy);
      if (sp > 1) {
        const ox = me.x, oy = me.y;
        const pos = F.resolveCollisions(ox + me.vx * dt, oy + me.vy * dt, F.PLAYER_RADIUS, me.z);
        me.x = pos.x; me.y = pos.y;
        if (dt > 0) { me.vx = (pos.x - ox) / dt; me.vy = (pos.y - oy) / dt; }
      } else { me.vx = 0; me.vy = 0; }
      if (now - S.lastSend > 50) {
        S.lastSend = now;
        socket.volatile.emit('player:pos', { x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, z: Math.round(me.z), a: Math.round(me.yaw * 1000) / 1000, p: Math.round(me.pitch * 1000) / 1000, s: me.seq });
      }
      if (S.mouse.down && S.mode === 'throw') throwBall();
    }

    const w = S.world;
    R.easeOthers(w, dt);
    const ground = me.z <= 0 && Math.hypot(me.vx, me.vy) > 40;
    if (ground && !world3d.reducedMotion) bobT += dt * (running ? 13 : 9); else bobT *= 0.9;
    const bob = world3d.reducedMotion ? 0 : Math.sin(bobT) * (running ? 2.6 : 1.6);
    world3d.render(w, { x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, bob, fovKick: running ? 7 : 0, alive: me.alive, ammo: me.ammo }, dt, now);

    if (now - S.lastHud > 100) { S.lastHud = now; updateHud(now); }
    requestAnimationFrame(loop);
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateHud(now) {
    const w = S.world;
    $('timer').textContent = fmtTime(w.timeLeft - (now - w.timeAt));
    const hp = Math.max(0, S.me.hp ?? 100), sh = Math.max(0, S.me.shield || 0);
    $('hp-bar').style.width = hp + '%'; $('hp-num').textContent = hp;
    $('hp-bar').classList.toggle('low', hp <= 25);
    $('sh-bar').style.width = sh + '%'; $('sh-num').textContent = sh;
    $('st-bar').style.width = S.me.stamina + '%';
    $('st-bar').classList.toggle('tired', !!S.me.tired);
    const ammo = Math.max(0, S.me.ammo);
    $('ammo').textContent = ammo;
    $('ammo-box').classList.toggle('empty', ammo === 0);
    // out of snowballs: the Answer questions button pulses until you earn more
    $('m-q').classList.toggle('pulse', ammo === 0 && S.me.alive && S.mode === 'throw');
    if (S.feed.length && now - S.feed[S.feed.length - 1].at > 5000) { S.feed.pop(); renderFeed(); }

    $('hidden-chip').hidden = !(S.me.alive && now > S.revealUntil && F.coverAt(S.me.x, S.me.y) >= 0);
    const ko = $('ko');
    const dead = !S.me.alive && S.deadAt && now - S.deadAt < F.RESPAWN_MS + 1500;
    ko.hidden = !dead;
    if (dead) {
      $('ko-by').textContent = S.koBy ? `Knocked out ${S.koBy}` : '';
      const left = Math.max(0, Math.ceil((F.RESPAWN_MS - (now - S.deadAt)) / 1000));
      $('ko-count').textContent = left > 0 ? `Back in ${left}…` : 'Back in a moment…';
    }
    $('crosshair').hidden = !S.me.alive || (S.mode !== 'throw' && !coarse);
    updateAimOverlay();
    drawMinimap(now);

    // leaderboard
    const board = $('board');
    const ranked = [...w.players.values()].sort((a, b) => b.kos - a.kos);
    const rows = [];
    let html = '';
    if (w.teams && w.teamScores) {
      const b = w.teamScores.blue, r = w.teamScores.red, tot = Math.max(1, b + r);
      html += `<div class="teambar"><div style="flex:${Math.max(0.15, b / tot)};background:${F.TEAM_COLOURS.blue}">${b}</div><div style="flex:${Math.max(0.15, r / tot)};background:${F.TEAM_COLOURS.red}">${r}</div></div>`;
    }
    const top = ranked.slice(0, w.teams ? 3 : 5);
    if (!top.some((p) => p.id === S.pid) && mine()) top.push(mine());
    for (const p of top) {
      const info = w.roster.get(p.id) || {};
      const col = w.teams && info.team ? F.TEAM_COLOURS[info.team] : info.colour;
      rows.push(`<li class="${p.id === S.pid ? 'me' : ''}"><span>${ranked.indexOf(p) + 1}</span><span class="dot" style="background:${col}"></span><span class="nm">${esc(info.name || '')}</span><b>${p.kos}</b></li>`);
    }
    board.innerHTML = html + `<h3>Knockouts</h3><ol>${rows.join('')}</ol>`;
  }
  const mine = () => S.world.players.get(S.pid);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- questions ----------
  function typeset(el) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(el, {
          delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }],
          throwOnError: false,
        });
      } catch (_) { /* leave plain text */ }
    }
  }

  function loadQuestion() {
    clearTimeout(S.qTimer); S.qTimer = null;
    socket.emit('player:question', {}, (res) => {
      if (!res || !res.ok) return;
      if (res.wait > 0) { S.qTimer = setTimeout(loadQuestion, res.wait); return; }
      renderQuestion(res.question);
    });
  }

  function renderQuestion(q) {
    S.question = q; S.answering = false;
    $('qfeedback').hidden = true;
    const qt = $('qtext'); qt.textContent = q ? q.q : 'Your teacher has not added any questions.';
    typeset(qt);
    const opts = $('opts'); opts.textContent = '';
    $('qform').hidden = !q || q.type !== 'text';
    if (!q) return;
    if (q.type === 'mc') {
      q.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = o;
        b.onclick = () => answer({ choice: i }, b);
        opts.appendChild(b);
        typeset(b);
      });
    } else {
      $('qinput').value = '';
      if (S.mode === 'question' && window.innerWidth > 760) $('qinput').focus();
    }
  }

  $('qform').onsubmit = (e) => {
    e.preventDefault();
    const v = $('qinput').value.trim();
    if (!v) return;
    answer({ text: v }, null);
  };

  function answer(payload, btn) {
    if (S.answering || !S.question) return;
    S.answering = true;
    socket.emit('player:answer', payload, (res) => {
      if (!res || !res.ok) {
        S.answering = false;
        if (res && res.wait) { S.question = null; S.qTimer = setTimeout(loadQuestion, res.wait); }
        return;
      }
      S.me.ammo = res.ammo;
      const fb = $('qfeedback');
      fb.hidden = false;
      const buttons = [...$('opts').children];
      if (res.correct) {
        if (btn) btn.classList.add('right');
        fb.className = 'feedback good';
        fb.textContent = res.gained > 0 ? `Correct! +${res.gained} snowball${res.gained === 1 ? '' : 's'}` : `Correct! Your snowball bag is full (${S.settings.maxAmmo}).`;
        $('streak').textContent = res.streak >= 2 ? `${res.streak} in a row${res.streak % 5 === 4 ? ' — one more for a bonus' : ''}` : '';
      } else {
        if (btn) btn.classList.add('wrong');
        if (S.question.type === 'mc' && buttons[res.reveal]) buttons[res.reveal].classList.add('right');
        fb.className = 'feedback bad';
        fb.textContent = S.question.type === 'mc' ? 'Not quite. The right answer is highlighted.' : `Not quite. The answer is ${res.reveal}.`;
        typeset(fb);
        $('streak').textContent = '';
      }
      buttons.forEach((b) => { b.disabled = true; });
      $('qinput').blur();
      S.question = null;
      S.qTimer = setTimeout(loadQuestion, res.correct ? 700 : Math.max(1400, res.wait));
    });
  }

  // ---------- results ----------
  function showResults(res) {
    S.results = res;
    if (document.pointerLockElement) document.exitPointerLock();
    show('s-end');
    clearTimeout(S.qTimer); S.qTimer = null; S.question = null;
    sessionStorage.removeItem(SESSION_KEY);
    const ps = res.players;
    let line = '';
    if (res.teams) {
      const { blue, red } = res.teams;
      line = blue === red ? `It's a draw, ${blue} knockouts each.` : `${blue > red ? 'Blue' : 'Red'} team wins, ${Math.max(blue, red)} knockouts to ${Math.min(blue, red)}.`;
    } else if (ps[0]) line = ps[0].kos > 0 ? `${ps[0].name} wins with ${ps[0].kos} knockout${ps[0].kos === 1 ? '' : 's'}.` : `No knockouts this time. ${ps[0].name} tops the board with ${ps[0].correct} correct answers.`;
    $('end-line').textContent = line;
    const pod = $('podium'); pod.textContent = '';
    [1, 0, 2].forEach((i) => {
      const p = ps[i];
      const d = document.createElement('div');
      d.className = 'p' + (i + 1);
      if (p) d.innerHTML = `<div class="place">${i + 1}</div><div class="nm">${esc(p.name)}</div><div>${p.kos} KO</div>`;
      else d.style.visibility = 'hidden';
      pod.appendChild(d);
    });
    const me = ps.find((p) => p.id === S.pid);
    const st = $('mystats'); st.textContent = '';
    if (me) {
      const acc = me.attempted ? Math.round(100 * me.correct / me.attempted) : 0;
      const items = [[`#${ps.indexOf(me) + 1}`, 'Place'], [me.kos, 'Knockouts'], [me.deaths, 'Times knocked out'], [`${me.correct}/${me.attempted}`, 'Questions correct'], [`${acc}%`, 'Accuracy']];
      for (const [v, l] of items) { const d = document.createElement('div'); d.innerHTML = `<b>${v}</b>${l}`; st.appendChild(d); }
    }
  }

  if (window.matchMedia('(pointer: coarse)').matches) {
    document.querySelector('.qhint').textContent = 'Every correct answer makes snowballs. Tap Throw to switch to throwing. Use the left side of the screen to move and drag on the right to look around. Duck into trees or igloos to hide.';
  }
  show('s-join');
})();
