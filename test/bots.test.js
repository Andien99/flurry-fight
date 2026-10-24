// Multiplayer test: a real server, a host and bot students who roam the map (down into the canal,
// through the tunnel, over the bridges, into the school), answer questions and throw snowballs.
//   node test/bots.test.js [map] [bots] [seconds]
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const FF = require('../public/shared.js');

const MAP = process.argv[2] || 'village';
const N = Number(process.argv[3] || 8);
const SECONDS = Number(process.argv[4] || 20);
const PORT = 3400 + Math.floor(Math.random() * 400);
const URL = `http://localhost:${PORT}`;
const W = FF.world(MAP);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok   ' : '  FAIL ') + msg); if (!c) fails++; };

// places worth visiting: every spawn, pickup and hiding spot (each with its floor height)
const WAYPOINTS = [
  ...W.SPAWNS.any.map((s) => [s.x, s.y]),
  ...W.PICKUP_SPOTS.map((k) => [k.x, k.y]),
  ...W.COVERS.map((c) => [c.x, c.y]),
];

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d; });
  await new Promise((r) => server.stdout.on('data', (d) => { if (/running/.test(d)) r(); }));

  const host = io(URL);
  await new Promise((r) => host.on('connect', r));
  const questions = [{ type: 'text', q: 'What is 2 + 2?', answers: ['4'] }, { type: 'text', q: 'What is 3 × 3?', answers: ['9'] }];
  const made = await new Promise((r) => host.emit('host:create', { title: 'Bots', questions, settings: { map: MAP, duration: 600, ammoPerCorrect: 5, wrongDelay: 0 } }, r));
  ok(made.ok && made.settings.map === MAP, `game created on ${MAP}`);

  const stats = { hits: 0, kos: 0, pickups: 0, splats: 0, correct: 0, floors: new Set(), covered: 0, runs: {}, bestRun: 0, runErr: '' };
  host.on('hit', () => stats.hits++); host.on('ko', (e) => {
    stats.kos++;
    // knockout runs: the thrower's run counts up from 1, the victim's ends
    const run = (stats.runs[e.by] || 0) + 1, ended = stats.runs[e.victim] || 0;
    if (e.by) { if (e.run !== run) stats.runErr = `run ${e.run}, expected ${run}`; stats.runs[e.by] = run; stats.bestRun = Math.max(stats.bestRun, run); }
    if (e.ended !== ended) stats.runErr = `ended ${e.ended}, expected ${ended}`;
    stats.runs[e.victim] = 0;
  }); host.on('pickup', () => stats.pickups++); host.on('splat', () => stats.splats++);
  host.on('state', (s) => { if (s.hid.length) stats.covered = Math.max(stats.covered, s.hid.length); });

  const bots = [];
  for (let i = 0; i < N; i++) {
    const s = io(URL); await new Promise((r) => s.on('connect', r));
    const check = await new Promise((r) => s.emit('game:check', { code: made.code }, r));
    if (i === 0) ok(check.map === MAP, 'students are told which map to load');
    const res = await new Promise((r) => s.emit('player:join', { code: made.code, name: 'Bot ' + i }, r));
    bots.push({ s, pid: res.pid, me: { x: 0, y: 0, z: 0, vz: 0, grounded: true, seq: -1, alive: false }, others: [], target: null, ammo: 0, stuck: 0, last: [0, 0] });
  }
  await new Promise((r) => host.emit('host:start', {}, r));

  for (const b of bots) {
    b.s.on('state', (st) => {
      const mine = st.p.find((r) => r[0] === b.pid);
      if (mine) {
        if (mine[10] !== b.me.seq || (mine[5] && !b.me.alive)) Object.assign(b.me, { x: mine[1], y: mine[2], z: mine[13], vz: 0, grounded: true, seq: mine[10] });
        b.me.alive = !!mine[5]; b.ammo = mine[8];
      }
      b.others = st.p.filter((r) => r[0] !== b.pid && r[12] && r[5]);
    });
    // answer questions in a loop
    (async () => {
      while (!b.done) {
        const q = await new Promise((r) => b.s.emit('player:question', {}, r));
        if (q && q.ok && q.question) {
          const a = await new Promise((r) => b.s.emit('player:answer', { text: q.question.q.includes('2 + 2') ? '4' : '9' }, r));
          if (a && a.correct) stats.correct++;
        }
        await sleep(400 + Math.random() * 600);
      }
    })();
  }

  // move with the same physics the browser uses, 20 times a second
  const dt = 0.05;
  const t0 = Date.now();
  while (Date.now() - t0 < SECONDS * 1000) {
    for (const b of bots) {
      const me = b.me;
      if (!me.alive) continue;
      if (!b.target || Math.hypot(b.target[0] - me.x, b.target[1] - me.y) < 30 || b.stuck > 40) {
        b.target = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)]; b.stuck = 0;
      }
      const dx = b.target[0] - me.x, dy = b.target[1] - me.y, d = Math.hypot(dx, dy) || 1;
      let vx = dx / d * FF.PLAYER_SPEED, vy = dy / d * FF.PLAYER_SPEED;
      const water = W.waterAt(me.x, me.y, me.z);
      if (water) { vx = vx * water.slow + water.fx; vy = vy * water.slow + water.fy; }
      const nx = me.x + vx * dt, ny = me.y + vy * dt;
      const stepTo = W.groundAt(nx, ny, me.z);
      const pos = W.resolveCollisions(nx, ny, FF.PLAYER_RADIUS, me.grounded && stepTo > me.z ? stepTo : me.z);
      me.x = pos.x; me.y = pos.y;
      W.settle(me, dt, Math.random() < 0.02);
      if (Math.hypot(me.x - b.last[0], me.y - b.last[1]) < 2) b.stuck++; b.last = [me.x, me.y];
      stats.floors.add(me.z < -60 ? 'canal' : me.z > 15 ? 'bridge/raised' : 'street');
      b.s.emit('player:pos', { x: me.x, y: me.y, z: Math.round(me.z), a: Math.atan2(dy, dx), p: 0, s: me.seq });
      // throw at the nearest enemy in sight
      const foe = b.others.map((r) => ({ r, d: Math.hypot(r[1] - me.x, r[2] - me.y) })).sort((a, c) => a.d - c.d)[0];
      if (foe && foe.d < 500 && b.ammo > 0 && Math.random() < 0.3) {
        const a = Math.atan2(foe.r[2] - me.y, foe.r[1] - me.x);
        const dz = (foe.r[13] - me.z);
        b.s.emit('player:throw', { a, p: Math.atan2(dz, foe.d) + 0.05 + foe.d / 6000 });
      }
    }
    await sleep(dt * 1000);
  }
  for (const b of bots) b.done = true;

  const results = await new Promise((r) => { host.once('ended', r); host.emit('host:end', {}, () => {}); });
  ok(results.players.length === N, `results list all ${N} students`);
  ok(stats.correct > N, `students answered questions (${stats.correct} correct)`);
  ok(stats.splats > 10, `snowballs were thrown and landed (${stats.splats})`);
  ok(stats.hits > 0, `snowballs hit students (${stats.hits} hits, ${stats.kos} knockouts)`);
  if (MAP === 'village') ok(stats.floors.has('canal') && stats.floors.has('street'), `students used the canal and the streets (${[...stats.floors].join(', ')})`);
  ok(!stats.runErr, 'knockout runs count up and end correctly' + (stats.runErr ? ` (${stats.runErr})` : ` (best ${stats.bestRun})`));
  ok(results.players.every((p) => typeof p.bestRun === 'number'), 'results include each student\'s most knockouts in a row');
  ok(!/Error|TypeError/.test(serverErr), 'no server errors' + (serverErr ? `:\n${serverErr.slice(0, 600)}` : ''));
  console.log(`  (pickups collected: ${stats.pickups}, most hidden at once: ${stats.covered})`);
  host.close(); for (const b of bots) b.s.close(); server.kill();
  console.log(fails ? `${fails} failures` : `bot game on ${MAP}: all checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
