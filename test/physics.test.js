// Physics checks for both maps: walking down into the canal, through the tunnel, up the
// stairwells, over the bridges, into the school and its lockers; snowballs; spawns and pickups.
//   node test/physics.test.js
const FF = require('../public/shared.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } };

// 1. The meadow behaves as it always has.
const M = FF.world('meadow');
ok(M.groundAt(150, 650, 104) === 104, 'meadow: standing on the lodge roof deck');
ok(M.groundAt(240, 858, 0) > 0 && M.groundAt(150, 858, 70) > 70, 'meadow: lodge stairs rise from the ground');
ok(M.onIce(1526, 1090) && !M.onIce(1526, 1090, 50), 'meadow: the frozen pond is slippery');
ok(M.coverAt(550, 268) >= 0, 'meadow: hiding in a pine');
ok(!M.blocked3D(1200, 650, 40, 8) && M.blocked3D(1200, 650, -1, 8), 'meadow: snowballs fly, then hit the ground');

// 2. A simulated player walking through the village.
const V = FF.world('village');
function walk(W, from, to, opts = {}) {
  const p = { x: from[0], y: from[1], z: opts.z ?? W.groundAt(from[0], from[1], 0), vz: 0, grounded: true };
  const dt = 1 / 60;
  for (let t = 0; t < (opts.max || 30) / dt; t++) {
    const dx = to[0] - p.x, dy = to[1] - p.y, d = Math.hypot(dx, dy);
    if (d < 6) return { ...p, arrived: true, t: t * dt };
    const sp = 240 * dt;
    const nx = p.x + dx / d * Math.min(sp, d), ny = p.y + dy / d * Math.min(sp, d);
    const stepTo = W.groundAt(nx, ny, p.z);
    const zFor = p.grounded && stepTo > p.z ? stepTo : p.z;
    const pos = W.resolveCollisions(nx, ny, 22, zFor);
    p.x = pos.x; p.y = pos.y;
    W.settle(p, dt, !!opts.jump && t % 30 === 0);
  }
  return { ...p, arrived: false };
}
const route = (W, pts, label, opts) => {
  let p = { x: pts[0][0], y: pts[0][1], z: opts && opts.z };
  for (let i = 1; i < pts.length; i++) {
    const q = walk(W, [p.x, p.y], pts[i], { z: p.z, ...opts });
    if (!q.arrived) { ok(false, `${label}: stuck going to ${pts[i]} at (${q.x.toFixed(0)}, ${q.y.toFixed(0)}, z ${q.z.toFixed(0)})`); return q; }
    p = q;
  }
  return p;
};
// street -> down the west steps -> along the north towpath -> into the tunnel
let p = route(V, [[220, 700], [300, 700], [400, 650], [640, 700], [760, 650], [880, 650], [1000, 650]], 'west steps into tunnel');
ok(Math.abs(p.z - -72) < 0.5, `in the tunnel at towpath level (z ${p.z})`);
ok(V.ceilingAt(1000, 650, p.z) === -12, 'tunnel has a ceiling');
// tunnel -> up the north stairwell to the square
p = route(V, [[1000, 650], [1200, 650], [1200, 600], [1200, 515], [1200, 470]], 'tunnel up the north stairwell', { z: -72 });
ok(Math.abs(p.z) < 0.5, `back on the street after the stairwell (z ${p.z})`);
// across the square (above the tunnel) and down the south stairwell
p = route(V, [[1200, 470], [1100, 470], [1100, 700], [1100, 920], [1200, 920], [1200, 800], [1200, 700]], 'square and south stairwell');
ok(Math.abs(p.z - -80) < 0.5 || Math.abs(p.z - -72) < 0.5, `down in the tunnel again (z ${p.z})`);
// across the west bridge
p = route(V, [[610, 540], [610, 700]], 'onto the west bridge');
ok(Math.abs(p.z - 22) < 0.5, `standing on the bridge deck (z ${p.z})`);
p = route(V, [[610, 700], [610, 880]], 'off the bridge');
ok(Math.abs(p.z) < 0.5, 'back on the ground after the bridge');
// under the east bridge along the canal
p = route(V, [[1600, 700], [1850, 700]], 'under the east bridge', { z: -80 });
ok(p.arrived && p.z < -70, 'walked under the bridge');
// you can't climb straight out of the canal (walls are deeper than a jump)
let q = walk(V, [750, 650], [750, 560], { z: -72, jump: true, max: 4 });
ok(!q.arrived && q.y > 630 + 20, `climbed out of the canal wall (y ${q.y.toFixed(0)})`);
// you can't walk out sideways from the stairwell
q = walk(V, [1200, 580], [1050, 580], { z: V.groundAt(1200, 580, 0), max: 3 });
ok(!q.arrived && q.x >= 1150 + 21, `walked through the stairwell wall (x ${q.x.toFixed(0)})`);
// walking off the street into the open canal: you fall in
q = walk(V, [750, 560], [750, 700], { max: 3 }); for (let i = 0; i < 60; i++) V.settle(q, 1 / 60, false);
ok(q.z < -70, `fell into the canal (z ${q.z.toFixed(0)})`);
// into the school through the south door, to a locker, and hidden there
p = route(V, [[1200, 440], [1200, 200], [1176, 135]], 'into the school');
ok(V.coverAt(p.x, p.y, p.z) >= 0 && V.OBJECTS[V.COVERS[V.coverAt(p.x, p.y, p.z)].obj].k === 'locker', 'hidden in a school locker');
// into the skate hut and its lockers
p = route(V, [[720, 1080], [800, 1080], [838, 1045]], 'into the skate hut');
ok(V.coverAt(p.x, p.y, p.z) >= 0, 'hidden in a skate hut locker');
// cover is per floor: the tunnel under the village tree isn't hidden, the tree above is
ok(V.coverAt(1200, 700, 0) >= 0 && V.coverAt(1200, 700, -80) < 0, 'tree cover only counts on the square');
// ice and water by level
ok(V.onIce(600, 700, -80) && !V.onIce(610, 700, 22), 'canal ice is slippery, the bridge above is not');
ok(!!V.waterAt(1200, 700, -80) && !V.waterAt(1200, 700, 0), 'water flows in the tunnel only');
ok(V.onIce(500, 1110, 0), 'skating rink is ice');
// snowballs
ok(!V.blocked3D(700, 700, -40, 8), 'snowball flies through the open canal below street level');
ok(V.blocked3D(1200, 700, -6, 8), 'tunnel ceiling stops snowballs');
ok(V.blocked3D(1200, 700, -85, 8), 'canal floor stops snowballs');
ok(V.blocked3D(700, 620, -20, 8), 'canal wall stops snowballs');
ok(!V.blocked3D(1200, 380, 50, 8), 'snowballs fly through the school door');
ok(!V.blocked3D(1050, 380, 50, 8) && V.blocked3D(1050, 380, 20, 8), 'school window: through the glass gap, not the sill');

// 3. Every spawn is free and on ground; every pickup is reachable (not inside something solid).
for (const W of [M, V]) {
  for (const [team, list] of Object.entries(W.SPAWNS)) for (const s of list) {
    const pos = W.resolveCollisions(s.x, s.y, 22, 0);
    ok(Math.hypot(pos.x - s.x, pos.y - s.y) < 1, `${W.id} ${team} spawn ${s.x},${s.y} is inside something`);
    ok(W.groundAt(s.x, s.y, 0) === 0, `${W.id} spawn ${s.x},${s.y} is not on the ground`);
    ok(W.coverAt(s.x, s.y, 0) < 0, `${W.id} spawn ${s.x},${s.y} is inside cover`);
  }
  for (const k of W.PICKUP_SPOTS) {
    const z = k.z || 0;
    const pos = W.resolveCollisions(k.x, k.y, 18, z);
    ok(Math.hypot(pos.x - k.x, pos.y - k.y) < 1, `${W.id} pickup ${k.x},${k.y},${z} is inside something`);
    ok(Math.abs(W.groundAt(k.x, k.y, z) - z) < 1, `${W.id} pickup ${k.x},${k.y} floats (ground ${W.groundAt(k.x, k.y, z)} vs ${z})`);
  }
}
// 4. Every village cover can actually be stood in.
for (const c of V.COVERS) {
  const pos = V.resolveCollisions(c.x, c.y, 22, c.z);
  ok(Math.hypot(pos.x - c.x, pos.y - c.y) < c.r - 2, `cover ${V.OBJECTS[c.obj].k} at ${c.x},${c.y} can't be reached`);
}
console.log(fails ? `${fails} failures` : 'all physics checks passed');
process.exit(fails ? 1 : 0);
