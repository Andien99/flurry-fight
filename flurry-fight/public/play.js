// Player (student) client.
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
    me: { x: 0, y: 0, vx: 0, vy: 0, seq: -1, alive: false, ammo: 0, angle: 0 },
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

  // ---------- game ----------
  const canvas = $('view');
  const ctx = canvas.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = canvas.clientWidth; cssH = canvas.clientHeight;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  }
  window.addEventListener('resize', resize);

  function enterGame() {
    show('s-game');
    resize();
    S.feed = [];
    setMode(S.mode || 'question');
    if (!S.looping) { S.looping = true; requestAnimationFrame(loop); }
  }

  function setMode(m) {
    S.mode = m;
    $('m-q').setAttribute('aria-pressed', String(m === 'question'));
    $('m-t').setAttribute('aria-pressed', String(m === 'throw'));
    $('qpanel').hidden = m !== 'question';
    $('s-game').classList.toggle('qmode', m === 'question');
    if (m === 'question') { if (!S.question && !S.qTimer) loadQuestion(); else if (S.question && S.question.type === 'text') $('qinput').focus(); }
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  $('m-q').onclick = () => setMode('question');
  $('m-t').onclick = () => setMode('throw');

  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  window.addEventListener('keydown', (e) => {
    if (S.screen !== 's-game') return;
    const k = e.key.toLowerCase();
    const arrow = k.startsWith('arrow');
    if (typing()) {
      if (k === 'escape') document.activeElement.blur();
      if (!arrow) return;
      e.preventDefault();
    }
    if (k === '1') setMode('question');
    else if (k === '2') setMode('throw');
    else if (k === ' ' && S.mode === 'throw') { e.preventDefault(); throwBall(); }
    if (['w', 'a', 's', 'd'].includes(k) || arrow) { S.keys.add(k); if (arrow) e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => S.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => S.keys.clear());

  canvas.addEventListener('mousemove', (e) => { S.mouse.x = e.offsetX; S.mouse.y = e.offsetY; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    S.mouse.x = e.offsetX; S.mouse.y = e.offsetY;
    if (S.mode !== 'throw') setMode('throw');
    S.mouse.down = true;
    aimAtMouse();
    throwBall();
  });
  window.addEventListener('mouseup', () => { S.mouse.down = false; });

  // Touch: drag on the left side to move, tap elsewhere to throw toward that spot.
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const r = canvas.getBoundingClientRect();
      const x = t.clientX - r.left, y = t.clientY - r.top;
      if (!S.stick && x < cssW * 0.45) {
        S.stick = { id: t.identifier, ox: x, oy: y, dx: 0, dy: 0 };
        const st = $('stick'); st.hidden = false; st.style.left = (x - 60) + 'px'; st.style.top = (y - 60) + 'px';
        st.firstElementChild.style.transform = 'translate(0,0)';
      } else {
        if (S.mode !== 'throw') setMode('throw');
        S.mouse.x = x; S.mouse.y = y; aimAtMouse(); throwBall();
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!S.stick || t.identifier !== S.stick.id) continue;
      const r = canvas.getBoundingClientRect();
      let dx = t.clientX - r.left - S.stick.ox, dy = t.clientY - r.top - S.stick.oy;
      const d = Math.hypot(dx, dy), max = 50;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      S.stick.dx = dx / max; S.stick.dy = dy / max;
      $('stick').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
    }
  }, { passive: false });
  const endTouch = (e) => { for (const t of e.changedTouches) if (S.stick && t.identifier === S.stick.id) { S.stick = null; $('stick').hidden = true; } };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  function panelShift() {
    if (S.mode !== 'question') return { x: 0, y: 0 };
    const p = $('qpanel');
    if (window.innerWidth > 760) return { x: p.offsetWidth / 2, y: 0 };
    return { x: 0, y: p.offsetHeight / 2 };
  }
  function zoom() {
    if (cssW <= 760) return F.clamp(cssW / 560, 0.5, 1);
    return F.clamp(Math.min(cssW / 1050, cssH / 720), 0.45, 1.5);
  }
  function aimAtMouse() {
    const sh = panelShift();
    const sx = cssW / 2 - sh.x, sy = cssH / 2 - sh.y;
    S.me.angle = Math.atan2(S.mouse.y - sy, S.mouse.x - sx);
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
      if (now - S.lastOutToast > 1800) { toast('Out of snowballs. Press 1 and answer questions to make more.', 2200); S.lastOutToast = now; }
      return;
    }
    S.lastThrow = now;
    S.revealUntil = now + F.REVEAL_THROW_MS;
    S.me.ammo--; // optimistic; the next snapshot confirms it
    socket.emit('player:throw', { a: S.me.angle });
  }

  // ---------- server updates ----------
  const nameOf = (id) => (S.world.roster.get(id) || {}).name || 'Someone';
  socket.on('state', (s) => {
    const now = performance.now();
    R.applySnapshot(S.world, s, now);
    const mine = S.world.players.get(S.pid);
    if (!mine) return;
    const wasAlive = S.me.alive;
    if (mine.seq !== S.me.seq || (mine.alive && !wasAlive)) { S.me.x = mine.tx; S.me.y = mine.ty; S.me.vx = 0; S.me.vy = 0; S.me.seq = mine.seq; }
    else if (mine.alive && Math.hypot(mine.tx - S.me.x, mine.ty - S.me.y) > 160) { S.me.x = mine.tx; S.me.y = mine.ty; }
    S.me.alive = mine.alive;
    if (now - S.lastThrow > 400) S.me.ammo = mine.ammo;
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

  socket.on('ko', (e) => {
    const now = performance.now();
    R.burst(S.world, e.x, e.y, '#ffffff', 22, 70, 7, now);
    S.world.particles.push({ kind: 'text', text: 'KO!', x: e.x, y: e.y - 20, colour: '#ffc93c', t0: now, life: 900 });
    const by = e.by ? nameOf(e.by) : 'the snow';
    pushFeed(`${by} knocked out ${nameOf(e.victim)}`);
    if (e.victim === S.pid) { S.koBy = e.by ? `by ${by}` : ''; S.deadAt = now; S.me.alive = false; }
    if (e.by === S.pid) toast(`You knocked out ${nameOf(e.victim)}!`);
  });
  socket.on('splat', (e) => R.burst(S.world, e.x, e.y, '#ffffff', 7, 26, 3.5, performance.now()));
  socket.on('hit', (e) => {
    if (e.pid === S.pid) S.revealUntil = performance.now() + F.REVEAL_HIT_MS;
    if (e.shield) S.world.particles.push({ kind: 'ring', x: e.x, y: e.y, colour: '#5aa8ff', size: 18, t0: performance.now(), life: 300 });
  });
  socket.on('pickup', (e) => {
    const labels = { shield: '+50 shield', cocoa: '+50 health', snow: '+5 snowballs' };
    S.world.particles.push({ kind: 'text', text: labels[e.type], x: e.x, y: e.y - 20, colour: '#ffffff', t0: performance.now(), life: 900 });
    if (e.pid === S.pid) toast(`${F.PICKUP_TYPES[e.type].label}: ${labels[e.type]}`);
  });

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

  // ---------- frame loop ----------
  let lastFrame = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (S.screen !== 's-game') { S.looping = false; return; }

    // movement (predicted locally, checked by the server)
    if (S.me.alive) {
      let mx = 0, my = 0;
      const k = S.keys;
      if (k.has('w') || k.has('arrowup')) my -= 1;
      if (k.has('s') || k.has('arrowdown')) my += 1;
      if (k.has('a') || k.has('arrowleft')) mx -= 1;
      if (k.has('d') || k.has('arrowright')) mx += 1;
      if (S.stick) { mx = S.stick.dx; my = S.stick.dy; }
      const len = Math.hypot(mx, my);
      const f = len > 0.05 ? Math.min(1, len) / len : 0;
      // Snow gives instant grip; frozen ponds make you slide.
      const grip = F.onIce(S.me.x, S.me.y) ? 2.2 : 22;
      const k2 = Math.min(1, grip * dt);
      S.me.vx += (mx * f * F.PLAYER_SPEED - S.me.vx) * k2;
      S.me.vy += (my * f * F.PLAYER_SPEED - S.me.vy) * k2;
      const sp = Math.hypot(S.me.vx, S.me.vy);
      if (sp > F.PLAYER_SPEED) { S.me.vx *= F.PLAYER_SPEED / sp; S.me.vy *= F.PLAYER_SPEED / sp; }
      if (sp > 1) {
        const ox = S.me.x, oy = S.me.y;
        const pos = F.resolveCollisions(ox + S.me.vx * dt, oy + S.me.vy * dt, F.PLAYER_RADIUS);
        S.me.x = pos.x; S.me.y = pos.y;
        if (dt > 0) { S.me.vx = (pos.x - ox) / dt; S.me.vy = (pos.y - oy) / dt; } // walls stop the slide
      } else { S.me.vx = 0; S.me.vy = 0; }
      if (!('ontouchstart' in window) || S.mouse.down) aimAtMouse();
      if (now - S.lastSend > 50) {
        S.lastSend = now;
        socket.volatile.emit('player:pos', { x: Math.round(S.me.x * 10) / 10, y: Math.round(S.me.y * 10) / 10, a: Math.round(S.me.angle * 100) / 100, s: S.me.seq });
      }
      if (S.mouse.down && S.mode === 'throw') throwBall();
    }

    const w = S.world;
    R.easeOthers(w, dt);
    const mine = w.players.get(S.pid);
    if (mine) { mine.x = S.me.x; mine.y = S.me.y; mine.angle = S.me.angle; }

    const z = zoom(), sh = panelShift();
    const cam = { x: S.me.x + sh.x / z, y: S.me.y + sh.y / z, zoom: z * dpr };
    R.draw(ctx, canvas.width, canvas.height, cam, w, now);

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
    $('hp-bar').style.width = (S.me.hp || 0) + '%';
    $('sh-bar').style.width = (S.me.shield || 0) + '%';
    $('ammo').textContent = `❄ ${Math.max(0, S.me.ammo)}`;
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

  // ---------- results ----------
  function showResults(res) {
    S.results = res;
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
    document.querySelector('.qhint').textContent = 'Every correct answer makes snowballs. Tap the map to throw toward that spot. Drag on the left side of the map to move.';
  }
  show('s-join');
})();
