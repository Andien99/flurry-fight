// Snowdown — a live classroom snowball-fight quiz game.
// Server: Express serves the pages, Socket.IO runs the games.
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const FF = require('./public/shared.js');
const { answersMatch } = require('./public/answers.js');

const PORT = process.env.PORT || 3000;
const TICK_HZ = 30;
const SNAPSHOT_EVERY = 2; // ticks per snapshot (≈15 per second)
const PICKUP_EVERY_MS = 9000;
const MAX_PICKUPS = 4;

const app = express();
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// Libraries and fonts are served from this server, so nothing depends on outside CDNs (handy on school networks).
const mod = (p) => path.join(__dirname, 'node_modules', p);
app.use('/vendor/katex', express.static(mod('katex/dist'), { maxAge: '7d' }));
app.use('/vendor/mathlive', express.static(mod('mathlive'), { maxAge: '7d' }));
app.use('/vendor/qrcode', express.static(mod('qrcode-generator/dist'), { maxAge: '7d' }));
app.use('/vendor/three', express.static(mod('three/build'), { maxAge: '7d' }));
app.use('/vendor/three-addons', express.static(mod('three/examples/jsm'), { maxAge: '7d' }));
app.use('/vendor/jszip', express.static(mod('jszip/dist'), { maxAge: '7d' }));
app.use('/vendor/pdfjs', express.static(mod('pdfjs-dist/build'), { maxAge: '7d' }));
app.use('/vendor/xlsx', express.static(mod('xlsx/dist'), { maxAge: '7d' }));
app.use('/vendor/fonts/atkinson', express.static(mod('@fontsource/atkinson-hyperlegible'), { maxAge: '7d' }));
app.use('/vendor/fonts/bricolage', express.static(mod('@fontsource/bricolage-grotesque'), { maxAge: '7d' }));
app.get('/health', (_req, res) => res.send('ok'));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });

/** @type {Map<string, any>} */
const games = new Map();
const socketIndex = new Map(); // socket.id -> { code, role: 'host'|'player', pid }

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const token = () => crypto.randomBytes(12).toString('hex');
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function newCode() {
  let code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (games.has(code));
  return code;
}
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? FF.clamp(n, lo, hi) : dflt; };

function cleanSettings(s = {}) {
  return {
    duration: Math.round(num(s.duration, 60, 1800, 300)),
    ammoPerCorrect: Math.round(num(s.ammoPerCorrect, 1, 10, 3)),
    maxAmmo: Math.round(num(s.maxAmmo, 5, 99, 30)),
    wrongDelay: num(s.wrongDelay, 0, 10, 2),
    teams: !!s.teams,
    lateJoin: s.lateJoin !== false,
    pickups: s.pickups !== false,
    map: FF.MAPS[s.map] ? s.map : 'meadow',
  };
}

function cleanQuestions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const q of list.slice(0, 300)) {
    const text = str(q && q.q, 500).trim();
    if (!text) continue;
    const skill = str(q.skill, 60).trim() || undefined;
    if (q.type === 'text') {
      const answers = (Array.isArray(q.answers) ? q.answers : String(q.answers || '').split(';'))
        .map((a) => str(a, 120).trim()).filter(Boolean).slice(0, 10);
      if (answers.length) out.push({ type: 'text', q: text, answers, skill });
    } else {
      const options = (Array.isArray(q.options) ? q.options : []).map((o) => str(o, 200).trim());
      const correct = Number(q.correct);
      if (!Number.isInteger(correct) || correct < 0) continue;
      const filtered = [];
      let newCorrect = -1;
      options.forEach((o, i) => { if (o) { if (i === correct) newCorrect = filtered.length; filtered.push(o); } });
      if (filtered.length >= 2 && newCorrect >= 0 && newCorrect < 6) out.push({ type: 'mc', q: text, options: filtered.slice(0, 6), correct: newCorrect, skill });
    }
  }
  return out;
}

function cleanName(name, game) {
  let n = str(name, 16).replace(/[<>]/g, '').trim() || 'Player';
  const taken = new Set([...game.players.values()].map((p) => p.name.toLowerCase()));
  if (!taken.has(n.toLowerCase())) return n;
  for (let i = 2; i < 100; i++) { const c = `${n.slice(0, 13)} ${i}`; if (!taken.has(c.toLowerCase())) return c; }
  return n;
}

// ---------- game model ----------
function createGame(hostSocket, settings, questions, title, modified = []) {
  const code = newCode();
  const game = {
    code,
    title: str(title, 80) || 'Snowdown',
    hostToken: token(),
    hostSocketId: hostSocket.id,
    hostSeenAt: Date.now(),
    createdAt: Date.now(),
    state: 'lobby',
    settings,
    W: FF.world(settings.map), // this game's map: layout and collision
    // main and modified questions in one array; each pool lists the indexes it can serve
    questions: [...questions.map((q) => ({ ...q, list: 'main' })), ...modified.map((q) => ({ ...q, list: 'mod' }))],
    mainIdx: questions.map((_, k) => k),
    modIdx: modified.map((_, k) => questions.length + k),
    qStats: [...questions, ...modified].map(() => ({ attempts: 0, correct: 0 })),
    players: new Map(), // pid -> player
    snowballs: [],
    pickups: [],
    nextId: 1,
    tick: 0,
    endsAt: 0,
    endedAt: 0,
    nextPickupAt: 0,
    teamScores: { blue: 0, red: 0 },
  };
  games.set(code, game);
  return game;
}

function makePlayer(game, name, colour, look) {
  const pid = 'p' + game.nextId++;
  return {
    pid, token: token(), socketId: null, connected: true,
    name: cleanName(name, game),
    colour: FF.PLAYER_COLOURS.includes(colour) ? colour : FF.PLAYER_COLOURS[Math.floor(Math.random() * FF.PLAYER_COLOURS.length)],
    look: FF.cleanLook(look),
    team: null,
    x: 0, y: 0, z: 0, angle: 0, pitch: 0, lastPosAt: 0,
    hp: FF.MAX_HP, shield: 0, ammo: 0,
    alive: false, respawnAt: 0, invulnUntil: 0, spawnSeq: 0, revealUntil: 0,
    kos: 0, deaths: 0, correct: 0, attempted: 0, streak: 0, bestStreak: 0,
    run: 0, bestRun: 0, // knockouts in a row without being knocked out (the "on a roll" effect)
    mod: false, // gets the modified question list (only the host knows)
    skillStats: {}, missed: [],
    lastThrow: 0,
    qOrder: [], qPtr: 0, current: null, nextQAt: 0,
  };
}

function teamCounts(game) {
  const c = { blue: 0, red: 0 };
  for (const p of game.players.values()) if (p.team) c[p.team]++;
  return c;
}

function spawnPlayer(game, p, now) {
  const W = game.W;
  const pool = game.settings.teams && p.team ? W.SPAWNS[p.team] : W.SPAWNS.any;
  // Choose the spawn point furthest from living enemies.
  let best = pool[0], bestScore = -1;
  for (const s of shuffle(pool)) {
    let minD = Infinity;
    for (const o of game.players.values()) {
      if (o === p || !o.alive) continue;
      if (game.settings.teams && o.team === p.team) continue;
      minD = Math.min(minD, Math.hypot(o.x - s.x, o.y - s.y));
    }
    if (minD > bestScore) { bestScore = minD; best = s; }
  }
  const pos = W.resolveCollisions(best.x + rand(-15, 15), best.y + rand(-15, 15), FF.PLAYER_RADIUS);
  Object.assign(p, { x: pos.x, y: pos.y, z: W.groundAt(pos.x, pos.y, 0), hp: FF.MAX_HP, alive: true, invulnUntil: now + FF.INVULN_MS, lastPosAt: now });
  p.spawnSeq++;
}

function roster(game) {
  return [...game.players.values()].map((p) => ({ id: p.pid, name: p.name, colour: p.colour, look: p.look, team: p.team, connected: p.connected }));
}
function emitRoster(game) {
  io.to(game.code).emit('roster', { players: roster(game), state: game.state, settings: game.settings, title: game.title });
}

function startGame(game) {
  const now = Date.now();
  game.state = 'playing';
  game.endsAt = now + game.settings.duration * 1000;
  game.nextPickupAt = now + 4000;
  game.snowballs = [];
  game.pickups = [];
  game.teamScores = { blue: 0, red: 0 };
  const list = shuffle([...game.players.values()]);
  list.forEach((p, i) => {
    p.team = game.settings.teams ? (i % 2 === 0 ? 'blue' : 'red') : null;
    Object.assign(p, { kos: 0, deaths: 0, correct: 0, attempted: 0, streak: 0, bestStreak: 0, run: 0, bestRun: 0, ammo: 0, shield: 0, skillStats: {}, missed: [] });
    p.qOrder = shuffle(poolFor(game, p)); p.qPtr = 0; p.current = null; p.nextQAt = 0;
  });
  for (const p of list) spawnPlayer(game, p, now);
  emitRoster(game);
  io.to(game.code).emit('started', { endsAt: game.endsAt, serverNow: now, settings: game.settings });
}

function results(game, viewer = 'host') {
  const ranked = [...game.players.values()].sort((a, b) => b.kos - a.kos || b.correct - a.correct || a.deaths - b.deaths);
  const teams = game.settings.teams ? game.teamScores : null;
  if (viewer === 'host') {
    const players = ranked.map((p) => ({
      id: p.pid, name: p.name, colour: p.colour, look: p.look, team: p.team, mod: p.mod,
      kos: p.kos, deaths: p.deaths, correct: p.correct, attempted: p.attempted, bestStreak: p.bestStreak, bestRun: p.bestRun,
    }));
    const questions = game.questions.map((q, i) => ({ q: q.q, skill: q.skill || '', list: q.list, attempts: game.qStats[i].attempts, correct: game.qStats[i].correct }));
    return { players, questions, teams, title: game.title };
  }
  // Students see the standings and their own question stats, not classmates' accuracy or who is on the modified list.
  const players = ranked.map((p) => ({ id: p.pid, name: p.name, colour: p.colour, look: p.look, team: p.team, kos: p.kos, deaths: p.deaths }));
  const me = game.players.get(viewer);
  const mine = me ? {
    rank: ranked.indexOf(me) + 1, kos: me.kos, deaths: me.deaths, correct: me.correct, attempted: me.attempted, bestStreak: me.bestStreak, bestRun: me.bestRun,
    skills: Object.entries(me.skillStats).map(([skill, v]) => ({ skill, attempted: v.a, correct: v.c })),
    missed: me.missed.slice(0, 6),
  } : null;
  return { players, me: mine, teams, title: game.title };
}
function emitResults(game) {
  if (game.hostSocketId) io.to(game.hostSocketId).emit('ended', results(game, 'host'));
  for (const p of game.players.values()) if (p.socketId) io.to(p.socketId).emit('ended', results(game, p.pid));
}

function endGame(game) {
  if (game.state !== 'playing') return;
  game.state = 'ended';
  game.endedAt = Date.now();
  game.snowballs = [];
  emitRoster(game);
  emitResults(game);
}

// The questions a player draws from: the modified list if they're on it (and it has questions).
function poolFor(game, p) {
  if (p.mod && game.modIdx.length) return game.modIdx;
  return game.mainIdx.length ? game.mainIdx : game.modIdx;
}
function serveQuestion(game, p) {
  if (!game.questions.length) return null;
  if (p.current) return p.current.public;
  if (p.qPtr >= p.qOrder.length) { p.qOrder = shuffle(poolFor(game, p)); p.qPtr = 0; }
  const idx = p.qOrder[p.qPtr++];
  const q = game.questions[idx];
  if (q.type === 'text') {
    p.current = { idx, type: 'text', public: { type: 'text', q: q.q } };
  } else {
    const order = shuffle(q.options.map((_, k) => k));
    p.current = { idx, type: 'mc', order, correctPos: order.indexOf(q.correct), public: { type: 'mc', q: q.q, options: order.map((k) => q.options[k]) } };
  }
  return p.current.public;
}

// ---------- simulation ----------
function knockOut(game, victim, attacker, now) {
  victim.alive = false;
  victim.hp = 0;
  victim.shield = 0;
  victim.deaths++;
  victim.respawnAt = now + FF.RESPAWN_MS;
  const ended = victim.run || 0; // the victim's run of knockouts ends here
  victim.run = 0;
  let run = 0;
  if (attacker) {
    attacker.kos++;
    if (attacker.team) game.teamScores[attacker.team]++;
    run = attacker.run = (attacker.run || 0) + 1;
    attacker.bestRun = Math.max(attacker.bestRun || 0, run);
  }
  io.to(game.code).emit('ko', { victim: victim.pid, by: attacker ? attacker.pid : null, x: victim.x, y: victim.y, run, ended });
}

// Is this player tucked inside a tree, igloo, locker, bin or snow pile, and not given away recently?
function inCover(game, p, now) {
  return p.alive && now >= p.revealUntil && game.W.coverAt(p.x, p.y, p.z) >= 0;
}

// Each player gets their own snapshot: enemies hiding in cover are left out
// unless they are close by. The teacher sees everyone.
function sendSnapshots(game, now) {
  const list = [...game.players.values()].filter((p) => p.connected || p.alive);
  const rows = list.map((p) => [p.pid, Math.round(p.x), Math.round(p.y), p.hp, p.shield, p.alive ? 1 : 0,
    Math.round(p.angle * 100), now < p.invulnUntil ? 1 : 0, p.ammo, p.kos, p.spawnSeq, p.connected ? 1 : 0, 1,
    Math.round(p.z), Math.round(p.pitch * 100), p.alive ? p.run || 0 : 0]);
  const hidden = list.map((p) => inCover(game, p, now));
  const base = {
    t: game.endsAt - now,
    b: game.snowballs.map((b) => [b.id, Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), Math.round(b.z), Math.round(b.vz)]),
    k: game.pickups.map((k) => [k.id, k.type, k.x, k.y, k.z || 0]),
    ts: game.settings.teams ? game.teamScores : null,
  };
  if (game.hostSocketId) io.to(game.hostSocketId).volatile.emit('state', { ...base, p: rows, hid: list.filter((_, i) => hidden[i]).map((p) => p.pid) });
  const R2 = FF.REVEAL_DIST * FF.REVEAL_DIST;
  for (const viewer of list) {
    if (!viewer.socketId) continue;
    const p = rows.map((row, i) => {
      const o = list[i];
      if (!hidden[i] || o === viewer) return row;
      if (game.settings.teams && o.team && o.team === viewer.team) return row;
      if (viewer.alive && (o.x - viewer.x) ** 2 + (o.y - viewer.y) ** 2 < R2) return row;
      return [o.pid, 0, 0, 0, 0, 0, 0, 0, 0, o.kos, o.spawnSeq, o.connected ? 1 : 0, 0, 0, 0, 0];
    });
    io.to(viewer.socketId).volatile.emit('state', { ...base, p });
  }
}

function stepGame(game, dt, now) {
  if (now >= game.endsAt) { endGame(game); return; }

  for (const p of game.players.values()) {
    if (!p.alive && p.connected && p.respawnAt && now >= p.respawnAt) spawnPlayer(game, p, now);
  }

  // Snowballs
  const kept = [];
  for (const b of game.snowballs) {
    b.vz -= FF.SNOWBALL.gravity * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
    let hit = b.life <= 0 || game.W.blocked3D(b.x, b.y, b.z, FF.SNOWBALL.radius);
    if (!hit) {
      for (const p of game.players.values()) {
        if (!p.alive || p.pid === b.owner || !p.connected) continue;
        if (game.settings.teams && p.team && p.team === b.team) continue;
        const r = FF.PLAYER_RADIUS + FF.SNOWBALL.radius;
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 > r * r) continue;
        if (b.z < p.z - FF.SNOWBALL.radius || b.z > p.z + FF.PLAYER_HEIGHT + FF.SNOWBALL.radius) continue; // flew over or under
        hit = true;
        if (now < p.invulnUntil) break;
        let dmg = FF.SNOWBALL.damage;
        const absorbed = Math.min(p.shield, dmg);
        p.shield -= absorbed; dmg -= absorbed;
        p.hp -= dmg;
        p.revealUntil = now + FF.REVEAL_HIT_MS;
        io.to(game.code).emit('hit', { pid: p.pid, by: b.owner, x: b.x, y: b.y, z: b.z, shield: absorbed > 0 });
        if (p.hp <= 0) knockOut(game, p, game.players.get(b.owner), now);
        break;
      }
    }
    if (hit) io.to(game.code).emit('splat', { id: b.id, x: b.x, y: b.y, z: Math.max(0, b.z) });
    else kept.push(b);
  }
  game.snowballs = kept;

  // Pickups
  if (game.settings.pickups && now >= game.nextPickupAt) {
    game.nextPickupAt = now + PICKUP_EVERY_MS;
    if (game.pickups.length < MAX_PICKUPS) {
      const free = game.W.PICKUP_SPOTS.filter((s) => !game.pickups.some((k) => k.x === s.x && k.y === s.y));
      if (free.length) {
        const s = free[Math.floor(Math.random() * free.length)];
        const types = ['shield', 'shield', 'cocoa', 'snow'];
        game.pickups.push({ id: game.nextId++, type: types[Math.floor(Math.random() * types.length)], x: s.x, y: s.y, z: s.z || 0 });
      }
    }
  }
  game.pickups = game.pickups.filter((k) => {
    for (const p of game.players.values()) {
      if (!p.alive) continue;
      const r = FF.PLAYER_RADIUS + FF.PICKUP_TYPES[k.type].radius;
      if ((p.x - k.x) ** 2 + (p.y - k.y) ** 2 > r * r) continue;
      if (Math.abs(p.z - (k.z || 0)) > 45) continue; // on a different floor
      if (k.type === 'shield' && p.shield < FF.MAX_SHIELD) p.shield = Math.min(FF.MAX_SHIELD, p.shield + 50);
      else if (k.type === 'cocoa' && p.hp < FF.MAX_HP) p.hp = Math.min(FF.MAX_HP, p.hp + 50);
      else if (k.type === 'snow' && p.ammo < game.settings.maxAmmo) p.ammo = Math.min(game.settings.maxAmmo, p.ammo + 5);
      else continue;
      io.to(game.code).emit('pickup', { pid: p.pid, type: k.type, x: k.x, y: k.y, z: k.z || 0, hp: p.hp, shield: p.shield });
      return false;
    }
    return true;
  });

  game.tick++;
  if (game.tick % (TICK_HZ * 2) === 0 && game.hostSocketId) {
    io.to(game.hostSocketId).emit('stats', [...game.players.values()].map((p) => ({ id: p.pid, kos: p.kos, deaths: p.deaths, correct: p.correct, attempted: p.attempted })));
  }
  if (game.tick % SNAPSHOT_EVERY === 0) sendSnapshots(game, now);

}

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  for (const g of games.values()) if (g.state === 'playing') stepGame(g, dt, now);
}, 1000 / TICK_HZ);

// Tidy up abandoned games.
setInterval(() => {
  const now = Date.now();
  for (const [code, g] of games) {
    const hostGone = !g.hostSocketId && now - g.hostSeenAt > 30 * 60 * 1000;
    const oldEnded = g.state === 'ended' && now - g.endedAt > 2 * 60 * 60 * 1000;
    const tooOld = now - g.createdAt > 8 * 60 * 60 * 1000;
    if (hostGone || oldEnded || tooOld) {
      io.to(code).emit('closed');
      games.delete(code);
    }
  }
}, 60 * 1000);

// ---------- sockets ----------
function hostGame(socket) {
  const info = socketIndex.get(socket.id);
  if (!info || info.role !== 'host') return null;
  const g = games.get(info.code);
  return g && g.hostSocketId === socket.id ? g : null;
}
function playerOf(socket) {
  const info = socketIndex.get(socket.id);
  if (!info || info.role !== 'player') return {};
  const game = games.get(info.code);
  const p = game && game.players.get(info.pid);
  if (!p || p.socketId !== socket.id) return {};
  return { game, p };
}
const reply = (cb, data) => { if (typeof cb === 'function') cb(data); };

io.on('connection', (socket) => {
  // ----- host -----
  socket.on('host:create', (data = {}, cb) => {
    const questions = cleanQuestions(data.questions);
    const modified = cleanQuestions(data.modified);
    if (!questions.length && !modified.length) return reply(cb, { ok: false, error: 'Add at least one complete question first.' });
    const game = createGame(socket, cleanSettings(data.settings), questions, data.title, modified);
    socketIndex.set(socket.id, { code: game.code, role: 'host' });
    socket.join(game.code);
    reply(cb, { ok: true, code: game.code, hostToken: game.hostToken, settings: game.settings, questionCount: questions.length, modifiedCount: modified.length });
    emitRoster(game);
  });

  socket.on('host:resume', (data = {}, cb) => {
    const game = games.get(String(data.code));
    if (!game || game.hostToken !== data.hostToken) return reply(cb, { ok: false });
    game.hostSocketId = socket.id;
    game.hostSeenAt = Date.now();
    socketIndex.set(socket.id, { code: game.code, role: 'host' });
    socket.join(game.code);
    reply(cb, {
      ok: true, code: game.code, state: game.state, settings: game.settings, title: game.title,
      players: roster(game), endsAt: game.endsAt, serverNow: Date.now(),
      mods: [...game.players.values()].filter((p) => p.mod).map((p) => p.pid), modifiedCount: game.modIdx.length,
      results: game.state === 'ended' ? results(game, 'host') : null,
    });
  });

  // Put a player on (or off) the modified question list. Takes effect from their next question.
  socket.on('host:modified', (data = {}, cb) => {
    const game = hostGame(socket);
    if (!game) return reply(cb, { ok: false });
    const p = game.players.get(String(data.id));
    if (!p) return reply(cb, { ok: false });
    const on = !!data.on && game.modIdx.length > 0;
    if (p.mod !== on) { p.mod = on; p.qOrder = shuffle(poolFor(game, p)); p.qPtr = 0; }
    reply(cb, { ok: true, id: p.pid, on: p.mod });
  });

  socket.on('host:start', (_d, cb) => {
    const game = hostGame(socket);
    if (!game || game.state !== 'lobby') return reply(cb, { ok: false });
    if (!game.players.size) return reply(cb, { ok: false, error: 'Wait for at least one player to join.' });
    startGame(game);
    reply(cb, { ok: true });
  });

  socket.on('host:end', (_d, cb) => {
    const game = hostGame(socket);
    if (!game) return reply(cb, { ok: false });
    endGame(game);
    reply(cb, { ok: true });
  });

  socket.on('host:cancel', () => {
    const game = hostGame(socket);
    if (!game) return;
    io.to(game.code).emit('closed');
    games.delete(game.code);
  });

  socket.on('host:kick', (data = {}) => {
    const game = hostGame(socket);
    if (!game) return;
    const p = game.players.get(String(data.id));
    if (!p) return;
    game.players.delete(p.pid);
    if (p.socketId) {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) { s.emit('kicked'); s.leave(game.code); }
      socketIndex.delete(p.socketId);
    }
    emitRoster(game);
  });

  // ----- players -----
  socket.on('game:check', (data = {}, cb) => {
    const game = games.get(String(data.code || '').trim());
    if (!game) return reply(cb, { ok: false, error: 'No game found with that code. Check the code on the board.' });
    if (game.state === 'ended') return reply(cb, { ok: false, error: 'That game has finished.' });
    if (game.state === 'playing' && !game.settings.lateJoin) return reply(cb, { ok: false, error: 'This game has already started.' });
    reply(cb, { ok: true, title: game.title, map: game.settings.map });
  });

  socket.on('player:join', (data = {}, cb) => {
    const game = games.get(String(data.code || '').trim());
    if (!game) return reply(cb, { ok: false, error: "No game found with that code." });

    // Rejoining after a refresh or a dropped connection.
    let p = null;
    if (data.token) for (const q of game.players.values()) if (q.token === data.token) p = q;
    if (!p) {
      if (game.state === 'ended') return reply(cb, { ok: false, error: 'That game has finished.' });
      if (game.state === 'playing' && !game.settings.lateJoin) return reply(cb, { ok: false, error: 'This game has already started.' });
      if (game.players.size >= 60) return reply(cb, { ok: false, error: 'This game is full.' });
      p = makePlayer(game, data.name, data.colour, data.look);
      game.players.set(p.pid, p);
      if (game.state === 'playing') {
        if (game.settings.teams) { const c = teamCounts(game); p.team = c.blue <= c.red ? 'blue' : 'red'; }
        p.qOrder = shuffle(poolFor(game, p));
        spawnPlayer(game, p, Date.now());
      }
    }
    if (game.state === 'playing' && !p.alive && !p.respawnAt) spawnPlayer(game, p, Date.now());
    if (p.socketId && p.socketId !== socket.id) socketIndex.delete(p.socketId);
    p.socketId = socket.id;
    p.connected = true;
    socketIndex.set(socket.id, { code: game.code, role: 'player', pid: p.pid });
    socket.join(game.code);
    reply(cb, {
      ok: true, pid: p.pid, token: p.token, name: p.name, colour: p.colour, state: game.state, title: game.title,
      settings: game.settings, endsAt: game.endsAt, serverNow: Date.now(),
      me: { x: p.x, y: p.y, ammo: p.ammo, team: p.team, spawnSeq: p.spawnSeq },
      results: game.state === 'ended' ? results(game, p.pid) : null,
    });
    emitRoster(game);
  });

  socket.on('player:pos', (data = {}) => {
    const { game, p } = playerOf(socket);
    if (!p || game.state !== 'playing' || !p.alive) return;
    if (Number(data.s) !== p.spawnSeq) return; // stale update from before a respawn
    const x = Number(data.x), y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = Date.now();
    const elapsed = Math.min(0.5, (now - p.lastPosAt) / 1000);
    p.lastPosAt = now;
    // Reject speed hacks: never move further than the speed limit allows (+ slack for jitter).
    let dx = x - p.x, dy = y - p.y;
    const dist = Math.hypot(dx, dy);
    const maxDist = FF.RUN_SPEED * elapsed * 1.5 + 25;
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    const W = game.W;
    const z = Number(data.z);
    p.z = Number.isFinite(z) ? FF.clamp(z, W.baseFloorAt(x, y), W.highestFloorAt(x, y) + FF.JUMP_MAX + 4) : W.groundAt(x, y, 0);
    const pos = W.resolveCollisions(p.x + dx, p.y + dy, FF.PLAYER_RADIUS, p.z);
    p.x = pos.x; p.y = pos.y;
    if (Number.isFinite(Number(data.a))) p.angle = Number(data.a);
    if (Number.isFinite(Number(data.p))) p.pitch = FF.clamp(Number(data.p), -1.4, 1.4);
  });

  socket.on('player:throw', (data = {}) => {
    const { game, p } = playerOf(socket);
    if (!p || game.state !== 'playing' || !p.alive || p.ammo <= 0) return;
    const now = Date.now();
    if (now - p.lastThrow < FF.SNOWBALL.cooldown * 1000) return;
    const a = Number(data.a);
    if (!Number.isFinite(a)) return;
    p.lastThrow = now;
    p.ammo--;
    p.angle = a;
    p.invulnUntil = Math.min(p.invulnUntil, now); // throwing ends spawn protection
    p.revealUntil = now + FF.REVEAL_THROW_MS;     // and gives away a hiding spot
    // Throw along the aim: yaw `a` across the map, pitch `p` up or down.
    const pitch = Number.isFinite(Number(data.p)) ? FF.clamp(Number(data.p), -1.4, 1.4) : 0;
    p.pitch = pitch;
    const cos = Math.cos(a), sin = Math.sin(a), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const start = FF.PLAYER_RADIUS + FF.SNOWBALL.radius + 2;
    const speed = FF.SNOWBALL.speed;
    game.snowballs.push({
      id: game.nextId++, owner: p.pid, team: p.team,
      x: p.x + cos * start, y: p.y + sin * start, z: p.z + FF.EYE_HEIGHT - 8,
      vx: cos * cp * speed, vy: sin * cp * speed, vz: sp * speed, life: FF.SNOWBALL.life,
    });
  });

  socket.on('player:question', (_d, cb) => {
    const { game, p } = playerOf(socket);
    if (!p || game.state !== 'playing') return reply(cb, { ok: false });
    const wait = Math.max(0, p.nextQAt - Date.now());
    reply(cb, { ok: true, wait, question: serveQuestion(game, p) });
  });

  socket.on('player:answer', (data = {}, cb) => {
    const { game, p } = playerOf(socket);
    if (!p || game.state !== 'playing' || !p.current) return reply(cb, { ok: false });
    if (Date.now() < p.nextQAt) return reply(cb, { ok: false, wait: p.nextQAt - Date.now() });
    const cur = p.current;
    const q = game.questions[cur.idx];
    let correct, reveal;
    if (cur.type === 'text') {
      correct = answersMatch(str(data.text, 120), q.answers);
      reveal = q.answers[0];
    } else {
      correct = Number(data.choice) === cur.correctPos;
      reveal = cur.correctPos;
    }
    p.current = null;
    p.attempted++;
    game.qStats[cur.idx].attempts++;
    const sk = q.skill || 'Other questions';
    const ss = p.skillStats[sk] || (p.skillStats[sk] = { a: 0, c: 0 });
    ss.a++; if (correct) ss.c++;
    if (!correct && !p.missed.some((m) => m.q === q.q)) {
      p.missed.push({ q: q.q, answer: q.type === 'text' ? q.answers[0] : q.options[q.correct] });
      if (p.missed.length > 12) p.missed.shift();
    }
    let gained = 0;
    if (correct) {
      p.correct++; p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      game.qStats[cur.idx].correct++;
      const before = p.ammo;
      p.ammo = Math.min(game.settings.maxAmmo, p.ammo + game.settings.ammoPerCorrect + (p.streak > 0 && p.streak % 5 === 0 ? 2 : 0));
      gained = p.ammo - before;
    } else {
      p.streak = 0;
      p.nextQAt = Date.now() + game.settings.wrongDelay * 1000;
    }
    reply(cb, { ok: true, correct, reveal, gained, ammo: p.ammo, streak: p.streak, wait: correct ? 0 : game.settings.wrongDelay * 1000 });
  });

  socket.on('disconnect', () => {
    const info = socketIndex.get(socket.id);
    socketIndex.delete(socket.id);
    if (!info) return;
    const game = games.get(info.code);
    if (!game) return;
    if (info.role === 'host') {
      if (game.hostSocketId === socket.id) { game.hostSocketId = null; game.hostSeenAt = Date.now(); }
      return;
    }
    const p = game.players.get(info.pid);
    if (!p || p.socketId !== socket.id) return;
    p.socketId = null;
    p.connected = false;
    if (game.state === 'lobby') game.players.delete(p.pid);
    if (game.state === 'playing') { p.alive = false; p.respawnAt = 0; p.current = null; }
    emitRoster(game);
  });
});

server.listen(PORT, () => console.log(`Snowdown running on http://localhost:${PORT}`));
