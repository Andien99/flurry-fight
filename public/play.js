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
    koBy: '', deadAt: 0, openingRight: 0, openingDone: false, feed: [], stick: null, results: null, looping: false,
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

  // ---------- joining and character customisation ----------
  const AV = window.FFAvatar;
  const LOOK_KEY = 'flurry-look';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') || {}; } catch (_) { /* first visit */ }
  if (F.PLAYER_COLOURS.includes(saved.colour)) S.colour = saved.colour;
  S.look = F.cleanLook(saved);
  const saveLook = () => { try { localStorage.setItem(LOOK_KEY, JSON.stringify({ colour: S.colour, ...S.look, name: $('name').value.trim() })); } catch (_) { /* private mode */ } };
  if (saved.name) $('name').value = saved.name;

  function optionButton(label, draw, pressed, onPick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'look-opt'; b.setAttribute('aria-pressed', String(pressed)); b.title = label;
    const c = document.createElement('canvas'); c.width = c.height = 120; draw(c.getContext('2d'));
    const span = document.createElement('span'); span.textContent = label;
    b.append(c, span);
    b.onclick = () => { [...b.parentNode.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(); saveLook(); };
    return b;
  }
  function buildCustomiser() {
    const sw = $('swatches'); sw.textContent = '';
    F.PLAYER_COLOURS.forEach((col) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.style.background = col;
      b.setAttribute('aria-label', 'Colour ' + col);
      b.setAttribute('aria-pressed', String(col === S.colour));
      b.onclick = () => { S.colour = col; [...sw.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); buildCustomiser(); saveLook(); };
      sw.appendChild(b);
    });
    const hats = $('hats'); hats.textContent = '';
    for (const h of F.HATS) {
      hats.appendChild(optionButton(h.label, (g) => AV.draw(g, 60, 74, 30, { colour: S.colour, hat: h.id, stache: 'none' }), S.look.hat === h.id, () => { S.look.hat = h.id; }));
    }
    const st = $('staches'); st.textContent = '';
    for (const m of F.STACHES) {
      st.appendChild(optionButton(m.label, (g) => { g.save(); g.translate(60, 42); g.scale(2.1, 2.1); AV.draw(g, 0, 0, 22, { colour: S.colour, hat: 'none', stache: m.id }, 'normal', 0); g.restore(); }, S.look.stache === m.id, () => { S.look.stache = m.id; }));
    }
  }
  // the preview bobs and blinks a little
  function previewLoop(now) {
    if (S.screen !== 's-join' || $('f-name').hidden) { S.previewing = false; return; }
    const c = $('look-preview'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const bob = reducedMotion ? 0 : Math.sin(now / 400) * 4;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(140, 250, 70 - bob, 12, 0, 0, Math.PI * 2); g.fill();
    const expr = Math.floor(now / 1400) % 6 === 5 ? 'happy' : 'normal';
    AV.draw(g, 140, 165 + bob, 78, { colour: S.colour, ...S.look }, expr, now);
    requestAnimationFrame(previewLoop);
  }
  function showCustomiser() {
    $('f-code').hidden = true; $('f-name').hidden = false;
    $('s-join').classList.add('customising');
    buildCustomiser();
    if (!S.previewing) { S.previewing = true; requestAnimationFrame(previewLoop); }
    $('name').focus();
  }
  $('look-random').onclick = () => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    S.colour = pick(F.PLAYER_COLOURS); S.look = { hat: pick(F.HATS).id, stache: pick(F.STACHES).id };
    buildCustomiser(); saveLook();
  };

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
      ensureMap(res.map); // start building the right arena while they make their character
      showCustomiser();
    });
  };
  $('back').onclick = () => { $('f-name').hidden = true; $('f-code').hidden = false; $('s-join').classList.remove('customising'); $('code').focus(); };
  $('f-name').onsubmit = (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    $('name-err').textContent = '';
    if (!name) { $('name-err').textContent = 'Type your name so your teacher knows who you are.'; return; }
    saveLook();
    join({ code: S.code, name, colour: S.colour, look: S.look });
  };

  function join(payload) {
    socket.emit('player:join', payload, (res) => {
      if (!res || !res.ok) {
        sessionStorage.removeItem(SESSION_KEY);
        show('s-join');
        $('f-code').hidden = false; $('f-name').hidden = true; $('s-join').classList.remove('customising');
        $('code-err').textContent = (res && res.error) || 'Could not join that game.';
        return;
      }
      S.code = payload.code; S.pid = res.pid; S.token = res.token; S.name = res.name; S.colour = res.colour;
      S.settings = res.settings;
      ensureMap(res.settings.map);
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
    const c = $('me-preview'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const info = S.world.roster.get(S.pid) || {};
    AV.draw(g, 80, 92, 48, { colour: S.colour, ...(info.look || S.look) }, 'happy', 0);
  }

  socket.on('roster', (r) => {
    S.world.roster = new Map(r.players.map((p) => [p.id, p]));
    if (r.settings) { S.settings = r.settings; S.world.teams = !!r.settings.teams; ensureMap(r.settings.map); }
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
  socket.on('started', () => { if (S.pid) { S.openingRight = 0; S.openingDone = false; enterGame(); } });
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
  // The arena is built while students join (the default map first); ensureMap switches to the teacher's choice.
  let wantMap = F.mapId;
  world3d.init(wantMap).then((done) => { if (done) $('loading3d').hidden = true; });
  function ensureMap(id) {
    if (!id || !F.MAPS[id] || id === wantMap) return;
    wantMap = id;
    F.useMap(id);
    miniBase = bigBase = null;
    $('loading3d').hidden = false;
    world3d.load(id).then((done) => {
      if (!done) return;
      $('loading3d').hidden = true;
      if (S.screen === 's-game') buildMinimapBase();
    });
  }
  if (/[?&]debug\b/.test(location.search)) { window.__flurry3d = world3d; window.__flurryState = S; window.__flurrySocket = socket; }
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
    $('log').textContent = '';
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
    $('m-q').classList.toggle('pulse', false);
    if (m === 'question') {
      if (locked()) document.exitPointerLock();
      if (!S.question && !S.qTimer) loadQuestion(); else if (S.question && S.question.type === 'text' && !coarse) $('qinput').focus();
      fitQuestionToScreen();
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
  $('q-close').onclick = () => setMode('throw');
  // ---------- big map (M) ----------
  function toggleBigMap(open = $('bigmap').hidden) {
    $('bigmap').hidden = !open;
    if (open) { if (locked()) document.exitPointerLock(); drawBigMap(); }
    else if (S.mode === 'throw') lockMouse();
  }
  $('mini-open').onclick = () => toggleBigMap(true);
  $('bigmap-close').onclick = () => toggleBigMap(false);
  $('bigmap').addEventListener('click', (e) => { if (e.target === $('bigmap')) toggleBigMap(false); });

  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '];
  window.addEventListener('keydown', (e) => {
    if (S.screen !== 's-game') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (!$('bigmap').hidden) { toggleBigMap(false); return; }
      if (S.mode === 'question') { setMode('throw'); return; }
    }
    if (typing()) {
      if (!k.startsWith('arrow')) return; // let them type; arrows still turn and walk
      e.preventDefault();
    }
    if (k === '1') { setMode('question'); return; }
    if (k === '2') { setMode('throw'); return; }
    if (k === 'm') { toggleBigMap(); return; }
    if (MOVE_KEYS.includes(k)) {
      if (k === ' ' && !S.keys.has(' ')) S.jumpQueued = true;
      S.keys.add(k);
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => S.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { S.keys.clear(); S.mouse.down = false; });

  // Chrome sometimes reports one huge bogus movement right after the mouse is captured,
  // which would snap the view to the sky, so skip the first moments and any absurd jumps.
  let lockedAt = 0;
  document.addEventListener('pointerlockchange', () => { if (locked()) lockedAt = performance.now(); });
  document.addEventListener('mousemove', (e) => {
    if (!locked()) return;
    if (performance.now() - lockedAt < 150) return;
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
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
      Object.assign(S.me, { x: mine.tx, y: mine.ty, z: mine.tz || 0, vx: 0, vy: 0, vz: 0, grounded: true, seq: mine.seq });
      if (!wasAlive || S.me.seq <= 1) S.me.yaw = Math.atan2(F.MAP.height / 2 - mine.ty, F.MAP.width / 2 - mine.tx); // face the middle
    } else if (mine.alive && Math.hypot(mine.tx - S.me.x, mine.ty - S.me.y) > 160) { S.me.x = mine.tx; S.me.y = mine.ty; S.me.z = mine.tz || 0; S.me.vz = 0; }
    S.me.alive = mine.alive;
    if (now - S.lastThrow > 400) S.me.ammo = mine.ammo;
    if (mine.hp < (S.me.hp ?? 100) && wasAlive) flashDamage();
    S.me.hp = mine.hp; S.me.shield = mine.shield; S.me.kos = mine.kos;
    setRun(mine.alive ? mine.run || 0 : 0);
  });

  // ---------- game status chat (left side) ----------
  const who = (id) => {
    const info = S.world.roster.get(id) || {};
    const col = S.world.teams && info.team ? F.TEAM_COLOURS[info.team] : info.colour || '#fff';
    const me = id === S.pid;
    return `<b style="color:${col}">${esc(me ? 'You' : info.name || 'Someone')}</b>`;
  };
  function addLog(html, kind = '') {
    const li = document.createElement('li');
    li.className = 'log-' + kind; li.innerHTML = html;
    const log = $('log');
    log.appendChild(li);
    while (log.children.length > 7) log.firstElementChild.remove();
    setTimeout(() => li.classList.add('old'), 9000);
    setTimeout(() => li.remove(), 10500);
  }
  // screen-edge hue: red when hit, blue when shielded, green when healed (low health glows red constantly)
  function edgeFlash(kind) {
    const el = $('edge').querySelector('.e-' + kind);
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  function flashDamage() { edgeFlash('hit'); S.hurtAt = performance.now(); }
  // little icons that float up from the HUD portrait
  function portraitFloat(kind) {
    const box = $('pfloat');
    for (let i = 0; i < (kind === 'heal' ? 4 : 2); i++) {
      const d = document.createElement('i');
      d.className = 'pf-' + kind;
      d.style.left = (20 + Math.random() * 60) + '%';
      d.style.animationDelay = (i * 0.12) + 's';
      box.appendChild(d);
      setTimeout(() => d.remove(), 1600);
    }
  }
  function hitMarker(ko) {
    const h = $('hitmark'); h.className = 'hitmark'; void h.offsetWidth; h.className = 'hitmark on' + (ko ? ' ko' : '');
  }

  // ---------- on a roll: knockouts in a row without being knocked out ----------
  // The HUD chip beside your portrait and the icy screen edge show your current run.
  function setRun(n) {
    if (S.me.run === n) return;
    S.me.run = n;
    const chip = $('run-chip');
    chip.hidden = n < 2;
    if (n >= 2) { chip.querySelector('b').textContent = '×' + n; chip.classList.toggle('gold', n >= 5); }
    $('edge').classList.toggle('roll', n >= F.ROLL_AURA);
    $('edge').classList.toggle('roll-gold', n >= 5);
  }
  // A big callout in the middle of the screen when you reach a new tier.
  function rollBanner(tier, n) {
    const el = $('roll-banner');
    el.querySelector('.rb-name').textContent = tier.name + '!';
    el.querySelector('.rb-sub').textContent = `${n} knockouts in a row`;
    el.className = 'roll-banner t' + Math.min(5, F.ROLL_TIERS.indexOf(tier) + 1);
    el.hidden = false; void el.offsetWidth; el.classList.add('on');
    clearTimeout(rollBanner.h); rollBanner.h = setTimeout(() => { el.hidden = true; }, 2200);
  }
  // Tier callouts only when a run reaches a new tier (and every knockout past the top one).
  const newTier = (n) => { const t = F.rollTier(n); const top = F.ROLL_TIERS[F.ROLL_TIERS.length - 1]; return t && (t.n === n || t === top) ? t : null; };

  socket.on('ko', (e) => {
    world3d.burst(e.x, e.y, 30, 24, 160);
    world3d.floatText('KO!', e.x, e.y, 90);
    const by = e.by ? nameOf(e.by) : 'the snow';
    addLog(e.by ? `${who(e.by)} <span class="verb">knocked out</span> ${who(e.victim)}` : `${who(e.victim)} <span class="verb">was knocked out</span>`, e.by === S.pid ? 'mine' : e.victim === S.pid ? 'bad' : 'ko');
    const tier = e.by ? newTier(e.run || 0) : null;
    if (tier) addLog(`${who(e.by)} ${e.by === S.pid ? 'are' : 'is'} on a roll: <span class="verb roll">${esc(tier.name)}!</span> (${e.run} in a row)`, 'roll');
    const endedTier = F.rollTier(e.ended || 0);
    if (endedTier && e.ended >= F.ROLL_AURA) {
      addLog(e.by ? `${who(e.by)} <span class="verb">ended</span> ${who(e.victim)}${e.victim === S.pid ? 'r' : "'s"} ${esc(endedTier.name)} run (${e.ended})` : `${who(e.victim)}${e.victim === S.pid ? 'r' : "'s"} ${esc(endedTier.name)} run <span class="verb">ended</span> (${e.ended})`, 'roll');
    }
    if (e.victim === S.pid) { S.koBy = e.by ? `by ${by}` : ''; S.deadAt = performance.now(); S.me.alive = false; S.mouse.down = false; setRun(0); }
    if (e.by === S.pid) {
      hitMarker(true);
      setRun(e.run || 0);
      if (tier) {
        rollBanner(tier, e.run);
        world3d.burst(e.x, e.y, 40, 36, 220, e.run >= 5 ? 0xffe28a : 0xbdf0ff, 3.6);
      } else if (endedTier && e.ended >= F.ROLL_AURA) toast(`You ended ${nameOf(e.victim)}'s ${endedTier.name} run!`, 2200);
      else toast(`You knocked out ${nameOf(e.victim)}!`);
    }
  });
  socket.on('splat', (e) => world3d.burst(e.x, e.y, Math.max(4, e.z || 4), 8, 90, 0xffffff, 2.4));
  socket.on('hit', (e) => {
    if (e.pid === S.pid) { S.revealUntil = performance.now() + F.REVEAL_HIT_MS; flashDamage(); }
    if (e.by === S.pid) hitMarker(false);
    if (e.pid !== S.pid) world3d.hitPlayer(e.pid, e.x, e.y, e.z, F.SNOWBALL.damage, e.shield, e.by === S.pid); // you see your own hits on the HUD
    if (e.shield) world3d.burst(e.x, e.y, e.z || 30, 6, 80, 0x5aa8ff, 2.4);
  });
  socket.on('pickup', (e) => {
    const labels = { shield: '+50 shield', cocoa: '+50 health', snow: '+5 snowballs' };
    const now = performance.now();
    // effects on other players in the world; your own pickups show on the HUD instead
    if (e.pid !== S.pid) {
      if (e.type === 'cocoa') world3d.healEffect(e.pid, e.x, e.y, e.z);
      else if (e.type === 'shield') world3d.shieldEffect(e.pid, e.x, e.y, e.z);
      else world3d.floatText(labels[e.type], e.x, e.y, (e.z || 0) + 60, '#ffffff', 1, 20);
    }
    addLog(`${who(e.pid)} <span class="verb">picked up</span> ${F.PICKUP_TYPES[e.type].label} <span class="gain gain-${e.type}">${labels[e.type]}</span>`, 'pick');
    if (e.pid === S.pid) {
      if (e.type === 'cocoa') { S.healAt = now; edgeFlash('heal'); portraitFloat('heal'); }
      if (e.type === 'shield') { S.shieldAt = now; edgeFlash('shield'); portraitFloat('shield'); }
    }
  });

  // ---------- minimap (top right) and big map (M) ----------
  let miniBase = null, bigBase = null;
  function mapBase(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const z = Math.min(w / F.MAP.width, h / F.MAP.height);
    R.draw(c.getContext('2d'), w, h, { x: F.MAP.width / 2, y: F.MAP.height / 2, zoom: z }, R.newWorld(false), 0);
    return c;
  }
  function buildMinimapBase() {
    window.FFSprites.ready.then(() => {
      miniBase = mapBase($('minimap').width, $('minimap').height);
      bigBase = mapBase($('bigmap-canvas').width, $('bigmap-canvas').height);
    });
  }
  function drawMarkers(g, w, h, scale) {
    const z = Math.min(w / F.MAP.width, h / F.MAP.height);
    const ox = (w - F.MAP.width * z) / 2, oy = (h - F.MAP.height * z) / 2;
    const P = (x, y) => [ox + x * z, oy + y * z];
    for (const k of S.world.pickups) {
      const [x, y] = P(k[2], k[3]);
      g.fillStyle = k[1] === 'shield' ? '#5aa8ff' : k[1] === 'cocoa' ? '#57d36a' : '#ffffff';
      g.strokeStyle = '#1b2a4a'; g.lineWidth = 1.5 * scale;
      g.beginPath(); g.arc(x, y, 3.5 * scale, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    const me = S.world.roster.get(S.pid) || {};
    if (S.world.teams && me.team) {
      for (const p of S.world.players.values()) {
        const info = S.world.roster.get(p.id) || {};
        if (p.id === S.pid || info.team !== me.team || !p.alive || p.hidden || p.x == null) continue;
        const [x, y] = P(p.x, p.y); g.fillStyle = F.TEAM_COLOURS[me.team]; g.strokeStyle = '#fff'; g.lineWidth = 1.5 * scale;
        g.beginPath(); g.arc(x, y, 4 * scale, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    if (S.me.alive) {
      const [x, y] = P(S.me.x, S.me.y);
      g.save(); g.translate(x, y); g.rotate(S.me.yaw); g.scale(scale, scale);
      g.fillStyle = '#e2453c'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }
  function drawMinimap() {
    const c = $('minimap'), g = c.getContext('2d');
    if (!miniBase) return;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(miniBase, 0, 0);
    drawMarkers(g, c.width, c.height, 1);
  }
  function drawBigMap() {
    const c = $('bigmap-canvas'), g = c.getContext('2d');
    if (!bigBase) return;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(bigBase, 0, 0);
    drawMarkers(g, c.width, c.height, 2.2);
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
      let tx = (cos * fwd - sin * side) * n * speed, ty = (sin * fwd + cos * side) * n * speed;
      // wading through the tunnel's water: slower, and the current carries you along
      const water = me.grounded ? F.waterAt(me.x, me.y, me.z) : null;
      if (water) { tx = tx * water.slow + water.fx; ty = ty * water.slow + water.fy; }
      // snow gives grip, ice makes you slide, and you can't steer much in the air
      const grip = !me.grounded ? 3 : F.onIce(me.x, me.y, me.z) ? 2.2 : water ? 8 : 22;
      const kk = Math.min(1, grip * dt);
      me.vx += (tx - me.vx) * kk; me.vy += (ty - me.vy) * kk;
      const sp = Math.hypot(me.vx, me.vy);
      if (sp > 1 || water) {
        const ox = me.x, oy = me.y;
        // step up onto stairs before checking walls, so the stairs don't count as a wall
        const stepTo = F.groundAt(ox + me.vx * dt, oy + me.vy * dt, me.z);
        const zFor = me.grounded && stepTo > me.z ? stepTo : me.z;
        const pos = F.resolveCollisions(ox + me.vx * dt, oy + me.vy * dt, F.PLAYER_RADIUS, zFor);
        me.x = pos.x; me.y = pos.y;
        if (dt > 0) { me.vx = (pos.x - ox) / dt; me.vy = (pos.y - oy) / dt; }
      } else { me.vx = 0; me.vy = 0; }
      // floors, stairs, jumping, falling and ceilings
      F.settle(me, dt, S.jumpQueued);
      S.jumpQueued = false;
      if (now - S.lastSend > 50) {
        S.lastSend = now;
        socket.volatile.emit('player:pos', { x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, z: Math.round(me.z), a: Math.round(me.yaw * 1000) / 1000, p: Math.round(me.pitch * 1000) / 1000, s: me.seq });
      }
      if (S.mouse.down && S.mode === 'throw') throwBall();
    }

    const w = S.world;
    R.easeOthers(w, dt);
    const ground = me.grounded && Math.hypot(me.vx, me.vy) > 40;
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

  // The HUD portrait's expression: swirly eyes when low, happy after healing, determined with a shield.
  function expression(now) {
    if (!S.me.alive) return 'ko';
    if (now - (S.healAt || -1e9) < 1800) return 'happy';
    if (now - (S.shieldAt || -1e9) < 1800) return 'strong';
    if ((S.me.hp ?? 100) <= 30) return 'hurt';
    if (now - (S.hurtAt || -1e9) < 400) return 'hurt';
    if ((S.me.shield || 0) > 0) return 'strong'; // stays determined while the shield lasts
    return 'normal';
  }
  function drawPortrait(now) {
    const c = $('portrait'), g = c.getContext('2d');
    const info = S.world.roster.get(S.pid) || {};
    const teams = S.world.teams && info.team;
    g.clearRect(0, 0, c.width, c.height);
    const expr = expression(now);
    const shake = expr === 'hurt' && now - (S.hurtAt || -1e9) < 400 ? Math.sin(now / 25) * 4 : 0;
    AV.draw(g, 120 + shake, 140, 80, { colour: info.colour || S.colour, ...(info.look || S.look), hatColour: teams ? F.TEAM_COLOURS[info.team] : undefined }, expr, now);
    $('pcard').dataset.mood = expr;
  }

  function updateHud(now) {
    const w = S.world;
    $('timer').textContent = fmtTime(w.timeLeft - (now - w.timeAt));
    const hp = Math.max(0, S.me.hp ?? 100), sh = Math.max(0, S.me.shield || 0);
    $('hp-bar').style.width = hp + '%'; $('hp-num').textContent = `${hp}/${F.MAX_HP}`;
    $('sh-bar').style.width = sh + '%'; $('sh-num').textContent = `${sh}/${F.MAX_SHIELD}`;
    $('st-bar').style.width = S.me.stamina + '%';
    $('st-bar').classList.toggle('tired', !!S.me.tired);
    $('pcard').classList.toggle('low', hp <= 30 && S.me.alive);
    $('pcard').classList.toggle('shielded', sh > 0);
    // low health: the screen edge glows red until you heal up
    $('edge').classList.toggle('low', hp <= 30 && S.me.alive);
    const ammo = Math.max(0, S.me.ammo);
    $('ammo').textContent = ammo;
    $('ammo-box').classList.toggle('empty', ammo === 0);
    // out of snowballs: the Questions key pulses until you earn more
    $('m-q').classList.toggle('pulse', ammo === 0 && S.me.alive && S.mode === 'throw');
    drawPortrait(now);

    $('hidden-chip').hidden = !(S.me.alive && now > S.revealUntil && F.coverAt(S.me.x, S.me.y, S.me.z) >= 0);
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
    drawMinimap();
    if (!$('bigmap').hidden) drawBigMap();

    // leaderboard under the minimap
    const board = $('board');
    const ranked = [...w.players.values()].sort((a, b) => b.kos - a.kos);
    const rows = [];
    let html = '';
    if (w.teams && w.teamScores) {
      const b = w.teamScores.blue, r = w.teamScores.red, tot = Math.max(1, b + r);
      html += `<div class="teambar"><div style="flex:${Math.max(0.15, b / tot)};background:${F.TEAM_COLOURS.blue}">${b}</div><div style="flex:${Math.max(0.15, r / tot)};background:${F.TEAM_COLOURS.red}">${r}</div></div>`;
    }
    const top = ranked.slice(0, w.teams ? 3 : 4);
    if (!top.some((p) => p.id === S.pid) && mine()) top.push(mine());
    for (const p of top) {
      const info = w.roster.get(p.id) || {};
      const col = w.teams && info.team ? F.TEAM_COLOURS[info.team] : info.colour;
      rows.push(`<li class="${p.id === S.pid ? 'me' : ''}"><span>${ranked.indexOf(p) + 1}</span><span class="dot" style="background:${col}"></span><span class="nm">${esc(info.name || '')}</span><b>${p.kos}</b></li>`);
    }
    board.innerHTML = html + `<ol>${rows.join('')}</ol>`;
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
      setTouchTyping(false);
      if (S.mode === 'question' && !coarse) $('qinput').focus();
    }
    $('keypad').hidden = !(coarse && q.type === 'text');
    if (coarse && q.type === 'text') setKeypadLetters(q.q);
    fitQuestionToScreen();
  }

  // ---------- on-screen maths keypad for tablets ----------
  // The iPad keyboard covers half the screen, so typed answers use this keypad instead.
  // "abc" switches to the normal keyboard for word answers; the popup then moves above it.
  const KEYS = [
    ['7', '8', '9', '(', ')', '⌫'],
    ['4', '5', '6', '+', '−', '×'],
    ['1', '2', '3', '/', '^', '='],
    ['0', '.', 'x', 'y', 'a', 'b'],
    ['n', 'k', 'm', 'p', 'abc', '✓'],
  ];
  function setTouchTyping(native) {
    const inp = $('qinput');
    if (!coarse) { inp.readOnly = false; inp.removeAttribute('inputmode'); return; }
    inp.readOnly = !native;
    inp.setAttribute('inputmode', native ? 'text' : 'none');
    $('keypad').classList.toggle('native', native);
  }
  // The letter keys show the question's own variables first (e.g. h, t), then common ones.
  const DEFAULT_LETTERS = ['x', 'y', 'a', 'b', 'n', 'k', 'm', 'p'];
  function setKeypadLetters(text) {
    const found = [];
    const add = (c) => { c = c.toLowerCase(); if (/^[a-z]$/.test(c) && !found.includes(c)) found.push(c); };
    // letters inside $...$ maths, minus LaTeX command names like \times
    for (const m of String(text).matchAll(/\$([^$]+)\$/g)) m[1].replace(/\\[a-zA-Z]+/g, ' ').replace(/[a-zA-Z]/g, add);
    // a lone letter in plain text ("when n = 4"), but not the words "a" or "I"
    for (const m of String(text).replace(/\$[^$]*\$/g, ' ').matchAll(/(?:^|[^A-Za-z])([b-hj-zB-HJ-Z])(?![A-Za-z])/g)) add(m[1]);
    const letters = found.concat(DEFAULT_LETTERS.filter((c) => !found.includes(c))).slice(0, 8);
    document.querySelectorAll('#keypad .kp-var').forEach((b, i) => { b.textContent = letters[i]; b.dataset.k = letters[i]; b.setAttribute('aria-label', letters[i]); });
  }
  (function buildKeypad() {
    const pad = $('keypad');
    for (const row of KEYS) for (const k of row) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = k; b.className = 'kp' + (k === '✓' ? ' kp-ok' : k === '⌫' ? ' kp-del' : k === 'abc' ? ' kp-abc' : /[a-z]/.test(k) ? ' kp-var' : '');
      b.setAttribute('aria-label', k === '⌫' ? 'Delete' : k === '✓' ? 'Check answer' : k === 'abc' ? 'Use the keyboard' : k);
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // don't steal focus
      b.onclick = () => {
        const inp = $('qinput');
        if (k === '⌫') inp.value = inp.value.slice(0, -1);
        else if (k === '✓') $('qform').requestSubmit();
        else if (k === 'abc') { setTouchTyping(true); inp.focus(); fitQuestionToScreen(); setTimeout(fitQuestionToScreen, 350); }
        else inp.value += k === '−' ? '-' : (b.dataset.k || k);
      };
      pad.appendChild(b);
    }
  })();

  // Keep the popup visible above an on-screen keyboard.
  const fullHeight = {};
  function fitQuestionToScreen() {
    const vv = window.visualViewport, card = $('qcard'), modal = $('qpanel');
    if (!vv || modal.hidden) return;
    // iPadOS doesn't always shrink innerHeight for its keyboard, so also compare with the tallest
    // viewport seen in this orientation, and treat "typing with the real keyboard" as keyboard up.
    const orient = window.innerWidth > window.innerHeight ? 'land' : 'port';
    fullHeight[orient] = Math.max(fullHeight[orient] || 0, vv.height);
    const inp = $('qinput');
    const keyboardUp = vv.height < window.innerHeight * 0.8 || vv.height < fullHeight[orient] * 0.8 ||
      (coarse && document.activeElement === inp && !inp.readOnly);
    modal.classList.toggle('kb', keyboardUp);
    modal.style.top = vv.offsetTop + 'px';
    modal.style.height = vv.height + 'px';
    card.style.maxHeight = (vv.height - 16) + 'px';
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitQuestionToScreen);
    window.visualViewport.addEventListener('scroll', fitQuestionToScreen);
  }
  $('qinput').addEventListener('blur', () => { if (coarse) setTimeout(() => { setTouchTyping(false); fitQuestionToScreen(); }, 50); });

  $('qform').onsubmit = (e) => {
    e.preventDefault();
    const v = $('qinput').value.trim();
    if (!v) return;
    answer({ text: v }, null);
  };

  const OPENING_ANSWERS = 2; // correct answers before the opening question window closes itself
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
      // Start of the game: after 2 correct answers, close the questions and send the player into the fight.
      if (res.correct && !S.openingDone && ++S.openingRight >= OPENING_ANSWERS) {
        S.openingDone = true;
        S.qTimer = setTimeout(() => {
          S.qTimer = null;
          if (S.mode === 'question') { setMode('throw'); toast(coarse ? 'Snowballs ready! Tap Questions for more.' : 'Snowballs ready! Press 1 for more questions.', 2200); }
        }, 900);
        return;
      }
      S.qTimer = setTimeout(loadQuestion, res.correct ? 700 : Math.max(1400, res.wait));
    });
  }

  // ---------- results ----------
  const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const TROPHY = {
    1: ['#ffd84a', '#e3a41c', '#fff3b0'],
    2: ['#e3e9f0', '#a3afbe', '#ffffff'],
    3: ['#eaa76a', '#b06a32', '#ffd9b5'],
  };
  function trophySVG(place) {
    const [fill, dark, shine] = TROPHY[place];
    return `<svg class="trophy" viewBox="0 0 64 72" role="img" aria-label="${ORD(place)} place trophy">
      <path d="M17 12 C4 12 4 34 21 34" fill="none" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
      <path d="M47 12 C60 12 60 34 43 34" fill="none" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
      <path d="M14 6 H50 V22 C50 36 42 44 32 44 C22 44 14 36 14 22 Z" fill="${fill}" stroke="#1b2a4a" stroke-width="3" stroke-linejoin="round"/>
      <path d="M20 10 V22 C20 28 22 33 26 36" fill="none" stroke="${shine}" stroke-width="3" stroke-linecap="round" opacity=".9"/>
      <rect x="27" y="44" width="10" height="10" fill="${dark}" stroke="#1b2a4a" stroke-width="3"/>
      <rect x="16" y="54" width="32" height="12" rx="3" fill="${fill}" stroke="#1b2a4a" stroke-width="3"/>
      <text x="32" y="30" text-anchor="middle" font-family="Bricolage Grotesque, system-ui, sans-serif" font-weight="800" font-size="17" fill="#1b2a4a">${place}</text>
    </svg>`;
  }
  function podiumAvatar(p, teams, place) {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 220; c.className = 'pod-avatar';
    c.setAttribute('aria-hidden', 'true');
    const look = { colour: p.colour, ...(p.look || {}), hatColour: teams && p.team ? F.TEAM_COLOURS[p.team] : undefined };
    if (AV) AV.draw(c.getContext('2d'), 110, 128, 72, look, place === 1 ? 'happy' : 'normal', 0);
    return c;
  }
  function showResults(res) {
    S.results = res;
    if (document.pointerLockElement) document.exitPointerLock();
    show('s-end');
    clearTimeout(S.qTimer); S.qTimer = null; S.question = null;
    sessionStorage.removeItem(SESSION_KEY);
    const ps = res.players || [];
    const me = res.me || null;
    let line = '';
    if (res.teams) {
      const { blue, red } = res.teams;
      line = blue === red ? `It's a draw, ${blue} knockouts each.` : `${blue > red ? 'Blue' : 'Red'} team wins, ${Math.max(blue, red)} knockouts to ${Math.min(blue, red)}.`;
    } else if (ps[0]) line = ps[0].kos > 0 ? `${ps[0].name} wins with ${ps[0].kos} knockout${ps[0].kos === 1 ? '' : 's'}.` : 'No knockouts this time!';
    $('end-line').textContent = line;

    // podium: 2nd, 1st, 3rd
    const pod = $('podium'); pod.textContent = '';
    for (const place of [2, 1, 3]) {
      const p = ps[place - 1];
      const col = document.createElement('div');
      col.className = `pod pod-${place}` + (p && p.id === S.pid ? ' is-me' : '');
      if (!p) { col.classList.add('empty'); pod.appendChild(col); continue; }
      col.innerHTML = trophySVG(place);
      col.appendChild(podiumAvatar(p, res.teams, place));
      const nm = document.createElement('div'); nm.className = 'pod-name'; nm.textContent = p.name + (p.id === S.pid ? ' (you)' : '');
      const ko = document.createElement('div'); ko.className = 'pod-ko'; ko.textContent = `${p.kos} knockout${p.kos === 1 ? '' : 's'}`;
      const block = document.createElement('div'); block.className = 'pod-block'; block.innerHTML = `<span>${ORD(place)}</span>`;
      if (res.teams && p.team) block.style.setProperty('--team', F.TEAM_COLOURS[p.team]);
      col.append(nm, ko, block);
      pod.appendChild(col);
    }
    const rank = me ? me.rank : ps.findIndex((p) => p.id === S.pid) + 1;
    $('my-place').textContent = rank > 3 ? `You came ${ORD(rank)} out of ${ps.length}, with ${me ? me.kos : 0} knockout${me && me.kos === 1 ? '' : 's'}.` : '';

    // the student's own question stats
    $('end-stats').hidden = !me;
    if (!me) return;
    const acc = me.attempted ? Math.round(100 * me.correct / me.attempted) : 0;
    const R0 = 46, C = 2 * Math.PI * R0;
    const ringCol = acc >= 75 ? '#57d36a' : acc >= 50 ? '#ffc93c' : '#ff7a6e';
    $('acc-ring').innerHTML = `<svg viewBox="0 0 120 120" class="acc-ring" role="img" aria-label="${acc}% of your answers were correct">
      <circle cx="60" cy="60" r="${R0}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="12"/>
      <circle cx="60" cy="60" r="${R0}" fill="none" stroke="${ringCol}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * acc / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="58" text-anchor="middle" class="ring-num">${me.attempted ? acc + '%' : '–'}</text>
      <text x="60" y="78" text-anchor="middle" class="ring-lab">correct</text>
    </svg>`;
    const st = $('mystats'); st.textContent = '';
    const tiles = [
      [`${me.correct}<small>/${me.attempted}</small>`, 'Questions right'],
      [me.bestStreak || 0, 'Best streak in a row'],
      [me.kos, 'Knockouts'],
      [me.bestRun || 0, 'Most knockouts in a row'],
      [ORD(rank), 'Place'],
    ];
    for (const [v, l] of tiles) { const d = document.createElement('div'); d.innerHTML = `<b>${v}</b><span>${l}</span>`; st.appendChild(d); }

    const sb = $('skillbars'); sb.textContent = '';
    const skills = (me.skills || []).filter((k) => k.attempted).sort((a, b) => b.correct / b.attempted - a.correct / a.attempted);
    if (skills.length) {
      sb.innerHTML = '<h3>By skill</h3>';
      for (const k of skills) {
        const pc = Math.round(100 * k.correct / k.attempted);
        const row = document.createElement('div'); row.className = 'skillbar';
        row.innerHTML = `<span class="sk-name"></span><span class="sk-bar"><i style="width:${pc}%;background:${pc >= 75 ? '#57d36a' : pc >= 50 ? '#ffc93c' : '#ff7a6e'}"></i></span><span class="sk-num">${k.correct}/${k.attempted}</span>`;
        row.querySelector('.sk-name').textContent = k.skill;
        sb.appendChild(row);
      }
    }
    const ms = $('missed'); ms.textContent = '';
    if (me.missed && me.missed.length) {
      ms.innerHTML = '<h3>Worth another look</h3>';
      const ul = document.createElement('ul');
      for (const m of me.missed) {
        const li = document.createElement('li');
        const q = document.createElement('div'); q.className = 'mq'; q.textContent = m.q;
        const a = document.createElement('div'); a.className = 'ma'; a.textContent = 'Answer: ' + m.answer;
        li.append(q, a); ul.appendChild(li);
      }
      ms.appendChild(ul);
      typeset(ms);
    } else if (me.attempted) ms.innerHTML = '<p class="all-right">You got every question right. Brilliant!</p>';
  }

  if (window.matchMedia('(pointer: coarse)').matches) {
    document.querySelector('.qhint').textContent = 'Every correct answer makes snowballs. Tap × to go back to throwing.';
    document.body.classList.add('touch-device');
  }
  show('s-join');
})();
