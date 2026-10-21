// First-person 3D view of the arena (three.js). Map coordinates (x, y) become three.js (x, z),
// and height is three.js y. The game state comes from the same snapshots the 2D view uses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const F = window.FF;
const INK = 0x2b3445;
const P = (x, h, y) => new THREE.Vector3(x, h, y);

// ---------- shared materials ----------
const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const matCache = new Map();
function toon(color, extra = {}) {
  // Shared materials keep the number of draw calls down once static scenery is merged.
  const key = `${color}|${extra.side || 0}|${extra.map ? extra.map.uuid : ''}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra });
  matCache.set(key, m);
  return m;
}
const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
function outline(mesh, s = 1.07) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(s);
  o.userData.outline = true;
  mesh.add(o);
  return mesh;
}
function mesh(geo, mat, x = 0, h = 0, y = 0, withOutline = true, s = 1.07) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h, y);
  if (withOutline) outline(m, s);
  return m;
}

// ---------- canvas textures ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
const woodTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#b57a43'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c98c52'; g.fillRect(12, 12, w - 24, h - 24);
  g.strokeStyle = '#6b4428'; g.lineWidth = 3; g.strokeRect(12, 12, w - 24, h - 24);
  g.lineWidth = 12; g.beginPath(); g.moveTo(16, h - 16); g.lineTo(w - 16, 16); g.stroke();
  g.strokeStyle = '#b57a43'; g.lineWidth = 6; g.stroke();
  g.strokeStyle = '#2b3445'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
});
const birchTex = () => canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#f3efe6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d6cfc0'; g.fillRect(w * 0.55, 0, w * 0.2, h);
  g.fillStyle = '#2b3445';
  for (let i = 0; i < 9; i++) { const y = 14 + i * 27 + (i % 2) * 6; g.fillRect((i * 23) % 40, y, 12 + (i % 3) * 5, 4); }
});
const ringsTex = () => canvasTex(64, 64, (g, w) => {
  g.fillStyle = '#d9a86a'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#b07a42'; g.lineWidth = 2;
  for (let r = 6; r < 32; r += 7) { g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke(); }
});
const iglooTex = () => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#e8f5fd'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#9cc4e0'; g.lineWidth = 2;
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * h;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    const n = 10 - r;
    for (let i = 0; i < n; i++) { const x = ((i + (r % 2) * 0.5) / n) * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h / rows); g.stroke(); }
  }
});
const blobTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(70,100,140,0.45)'); r.addColorStop(1, 'rgba(70,100,140,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function blob(x, y, w, d) {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.position.set(x, 0.6, y); m.scale.set(w, 1, d);
  m.renderOrder = 1;
  return m;
}

// ---------- map objects ----------
const SNOW = 0xffffff, SNOW_SHADE = 0xdbe8f4, WOOD = 0x8f5d36, WOOD_DARK = 0x6b4428, PINE = [0x2c7046, 0x34814f, 0x3e955c];
const geoCache = {};
const G = (key, make) => geoCache[key] || (geoCache[key] = make());

function buildPine() {
  const g = new THREE.Group();
  g.add(mesh(G('trunk', () => new THREE.CylinderGeometry(7, 10, 34, 8)), toon(WOOD), 0, 17, 0));
  const tiers = [[62, 70, 58], [48, 60, 96], [32, 50, 132]];
  tiers.forEach(([r, h, y], i) => {
    const cone = new THREE.Mesh(G('cone' + i, () => new THREE.ConeGeometry(r, h, 9)), toon(PINE[i], { side: THREE.DoubleSide }));
    cone.position.y = y; cone.userData.cover = true; g.add(cone);
    const rim = new THREE.Mesh(G('rim' + i, () => new THREE.CylinderGeometry(r * 0.78, r * 1.02, 9, 9, 1, true)), toon(SNOW, { side: THREE.DoubleSide }));
    rim.position.y = y - h / 2 + 4; rim.userData.cover = true; g.add(rim);
  });
  const cap = new THREE.Mesh(G('cap', () => new THREE.ConeGeometry(11, 18, 9)), toon(SNOW, { side: THREE.DoubleSide }));
  cap.position.y = 150; cap.userData.cover = true; g.add(cap);
  g.add(blob(0, 0, 150, 150));
  return g;
}

function buildBare(seed) {
  const g = new THREE.Group();
  const bark = toon(0x7a5233);
  const limb = (r1, r2, len, from, dir) => {
    const m = mesh(new THREE.CylinderGeometry(r2, r1, len, 6), bark, 0, 0, 0, true, 1.12);
    const d = new THREE.Vector3(...dir).normalize();
    m.position.copy(from).addScaledVector(d, len / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    g.add(m);
    const tip = from.clone().addScaledVector(d, len);
    const snow = mesh(G('twigsnow', () => new THREE.SphereGeometry(5, 8, 6)), toon(SNOW), tip.x, tip.y + 2, tip.z, false);
    snow.scale.set(1.3, 0.6, 1.3); g.add(snow);
    return tip;
  };
  const top = limb(13, 9, 90, P(0, 0, 0), [0, 1, 0]);
  const a = (seed * 1.7) % 6.28;
  for (let i = 0; i < 4; i++) {
    const ang = a + i * 1.6;
    const t = limb(6, 3, 48, P(0, 55 + i * 9, 0), [Math.cos(ang), 1.1, Math.sin(ang)]);
    limb(3, 1.5, 22, t, [Math.cos(ang + 0.6), 1.4, Math.sin(ang + 0.6)]);
  }
  limb(5, 2, 40, top, [0.2, 1, 0.1]);
  const base = mesh(G('basesnow', () => new THREE.SphereGeometry(20, 12, 8)), toon(SNOW), 0, 0, 0, false);
  base.scale.set(1, 0.25, 1); g.add(base);
  g.add(blob(0, 0, 70, 70));
  return g;
}

function buildIgloo(o) {
  const g = new THREE.Group();
  const tex = iglooTex();
  const dome = new THREE.Mesh(G('dome', () => new THREE.SphereGeometry(66, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
    toon(0xffffff, { map: tex, side: THREE.DoubleSide }));
  dome.userData.cover = true; g.add(dome);
  // entrance tunnel facing the middle of the map
  const ang = Math.atan2(F.MAP.height / 2 - o.y, F.MAP.width / 2 - o.x);
  const tunnel = new THREE.Group();
  const arch = new THREE.Mesh(G('arch', () => new THREE.CylinderGeometry(26, 26, 34, 16, 1, true, -Math.PI / 2, Math.PI)),
    toon(0xd5eafa, { side: THREE.DoubleSide }));
  arch.rotation.x = -Math.PI / 2; arch.position.z = 8; arch.userData.cover = true;
  tunnel.add(arch);
  const hole = new THREE.Mesh(G('hole', () => new THREE.CircleGeometry(20, 16, 0, Math.PI)), new THREE.MeshBasicMaterial({ color: 0x284e78, side: THREE.DoubleSide }));
  hole.position.z = 25.2; hole.userData.cover = true; tunnel.add(hole);
  tunnel.position.set(Math.cos(ang) * 56, 0, Math.sin(ang) * 56);
  tunnel.rotation.y = Math.atan2(Math.cos(ang), Math.sin(ang));
  g.add(tunnel);
  g.add(blob(0, 0, 160, 160));
  return g;
}

function buildMound(big) {
  const g = new THREE.Group();
  const m = mesh(G('mound', () => new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2)), toon(SNOW), 0, 0, 0, true, 1.04);
  if (big) m.scale.set(96, 44, 46); else m.scale.set(33, 30, 33);
  g.add(m);
  g.add(blob(4, 6, big ? 220 : 80, big ? 110 : 80));
  return g;
}

function buildSnowman(seed) {
  const g = new THREE.Group();
  const white = toon(SNOW);
  g.add(mesh(G('sm1', () => new THREE.SphereGeometry(26, 16, 12)), white, 0, 25, 0));
  g.add(mesh(G('sm2', () => new THREE.SphereGeometry(19, 16, 12)), white, 0, 62, 0));
  g.add(mesh(G('sm3', () => new THREE.SphereGeometry(14, 16, 12)), white, 0, 89, 0));
  g.add(mesh(G('brim', () => new THREE.CylinderGeometry(15, 15, 3, 16)), toon(0x2b2f3a), 0, 101, 0, false));
  g.add(mesh(G('hat', () => new THREE.CylinderGeometry(10, 10, 16, 16)), toon(0x2b2f3a), 0, 110, 0));
  g.add(mesh(G('band', () => new THREE.CylinderGeometry(10.4, 10.4, 3, 16)), toon(0xc8423b), 0, 104, 0, false));
  const scarf = mesh(G('scarf', () => new THREE.TorusGeometry(15, 4, 8, 16)), toon(0x3d8b5f), 0, 77, 0, false);
  scarf.rotation.x = Math.PI / 2; g.add(scarf);
  const nose = mesh(G('nose', () => new THREE.ConeGeometry(2.6, 14, 8)), toon(0xf08a2c), 0, 89, 19, false);
  nose.rotation.x = Math.PI / 2; g.add(nose);
  for (const x of [-5, 5]) g.add(mesh(G('eye', () => new THREE.SphereGeometry(1.8, 6, 6)), toon(INK), x, 93, 12, false));
  for (const y of [58, 68]) g.add(mesh(G('button', () => new THREE.SphereGeometry(2.2, 6, 6)), toon(INK), 0, y, 18, false));
  const arm = (side) => {
    const m = mesh(G('arm', () => new THREE.CylinderGeometry(1.6, 2.2, 34, 5)), toon(WOOD_DARK), side * 30, 70, 0, false);
    m.rotation.z = side * -1.0; g.add(m);
  };
  arm(1); arm(-1);
  g.rotation.y = (seed * 2.3) % 6.28;
  g.add(blob(0, 0, 70, 70));
  return g;
}

function boxWithSnow(w, h, d, mat, snowy = true) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, h, d), mat, 0, h / 2, 0, true, 1.04));
  if (snowy) {
    const s = mesh(new THREE.BoxGeometry(w + 2, 6, d + 2), toon(SNOW), 0, h + 2, 0, false);
    g.add(s);
  }
  return g;
}

let WOOD_TEX, BIRCH_TEX, RINGS_TEX;
function buildCrate(snowy = true) {
  const g = boxWithSnow(70, 60, 60, toon(0xffffff, { map: WOOD_TEX }), snowy);
  g.add(blob(4, 6, 90, 80));
  return g;
}
function buildIce(w, h, d) {
  const g = new THREE.Group();
  const ice = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color: 0x9dd3f3, transparent: true, opacity: 0.8, shininess: 90, specular: 0xffffff }));
  ice.position.y = h / 2; g.add(ice);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ice.geometry), new THREE.LineBasicMaterial({ color: INK }));
  edges.position.y = h / 2; g.add(edges);
  const top = mesh(new THREE.BoxGeometry(w, 4, d), toon(0xe8f7ff), 0, h + 2, 0, false); g.add(top);
  g.add(blob(3, 4, w + 20, d + 20));
  return g;
}
function birch(r, h) {
  const g = new THREE.Group();
  const side = toon(0xffffff, { map: BIRCH_TEX });
  const cyl = new THREE.Mesh(G('birch' + r + h, () => new THREE.CylinderGeometry(r, r, h, 12)), [side, toon(0xffffff, { map: RINGS_TEX }), toon(0xffffff, { map: RINGS_TEX })]);
  cyl.position.y = h / 2; outline(cyl, 1.08); g.add(cyl);
  const cap = mesh(G('bcap' + r, () => new THREE.SphereGeometry(r * 0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), toon(SNOW), 0, h, 0, false);
  cap.scale.y = 0.4; g.add(cap);
  return g;
}
function buildLogpile() {
  const g = new THREE.Group();
  for (const [x, y] of [[-15, -45], [15, -45], [-15, 0], [15, 0], [-15, 45], [15, 45]]) {
    const b = birch(14, 112 + ((x + y) % 7)); b.position.set(x, 0, y); g.add(b);
  }
  g.add(blob(4, 4, 90, 150));
  return g;
}
function buildPost() { const g = birch(16, 90); g.add(blob(3, 3, 50, 50)); return g; }
function buildBench() {
  const g = new THREE.Group();
  const wood = toon(WOOD), dark = toon(WOOD_DARK);
  g.add(mesh(new THREE.BoxGeometry(116, 6, 26), wood, 0, 24, 0, true, 1.03));
  g.add(mesh(new THREE.BoxGeometry(116, 20, 5), dark, 0, 40, -12, true, 1.03));
  for (const x of [-48, 48]) for (const y of [-9, 9]) g.add(mesh(new THREE.BoxGeometry(6, 22, 6), toon(0x4a3a2e), x, 11, y, false));
  const s = mesh(new THREE.BoxGeometry(80, 3, 20), toon(SNOW), -6, 28.5, 1, false); g.add(s);
  g.add(blob(3, 4, 140, 50));
  return g;
}
function buildStump() {
  const g = new THREE.Group();
  const side = toon(WOOD), top = toon(0xffffff, { map: RINGS_TEX });
  const c = new THREE.Mesh(G('stump', () => new THREE.CylinderGeometry(18, 20, 22, 12)), [side, top, side]);
  c.position.y = 11; outline(c, 1.08); g.add(c);
  const s = mesh(G('stumpsnow', () => new THREE.SphereGeometry(14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), toon(SNOW), 2, 22, -2, false);
  s.scale.y = 0.35; g.add(s);
  g.add(blob(3, 3, 55, 55));
  return g;
}
function buildLog() {
  const g = new THREE.Group();
  const side = toon(WOOD), end = toon(0xffffff, { map: RINGS_TEX });
  const c = new THREE.Mesh(G('log', () => new THREE.CylinderGeometry(14, 14, 104, 12)), [side, end, end]);
  c.rotation.z = Math.PI / 2; c.position.y = 14; outline(c, 1.06); g.add(c);
  const s = mesh(new THREE.BoxGeometry(92, 4, 14), toon(SNOW), 0, 28.5, 0, false); g.add(s);
  g.add(blob(3, 4, 120, 40));
  return g;
}
function buildFence(len, vertical) {
  const g = new THREE.Group();
  const post = toon(WOOD), rail = toon(0x9c6a3e);
  const n = Math.max(2, Math.round(len / 60) + 1);
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (len * i) / (n - 1);
    g.add(mesh(G('fpost', () => new THREE.BoxGeometry(9, 40, 9)), post, vertical ? 0 : t, 20, vertical ? t : 0, true, 1.08));
    const cap = mesh(G('fcap', () => new THREE.BoxGeometry(11, 3, 11)), toon(SNOW), vertical ? 0 : t, 41, vertical ? t : 0, false); g.add(cap);
  }
  for (const h of [14, 30]) {
    const r = mesh(new THREE.BoxGeometry(vertical ? 4 : len, 6, vertical ? len : 4), rail, 0, h, 0, true, 1.05);
    g.add(r);
  }
  return g;
}

// ---------- pickups ----------
function buildPickup(type) {
  const g = new THREE.Group();
  const item = new THREE.Group();
  if (type === 'shield') {
    item.add(mesh(G('can', () => new THREE.CylinderGeometry(10, 10, 26, 14)), toon(0x2f6fe4), 0, 0, 0));
    item.add(mesh(G('canband', () => new THREE.CylinderGeometry(10.3, 10.3, 7, 14)), toon(0x9cc0ff), 0, 2, 0, false));
    item.add(mesh(G('plusv', () => new THREE.BoxGeometry(2, 8, 1)), toon(SNOW), 0, -6, 10.2, false));
    item.add(mesh(G('plush', () => new THREE.BoxGeometry(8, 2, 1)), toon(SNOW), 0, -6, 10.2, false));
  } else if (type === 'cocoa') {
    item.add(mesh(G('mug', () => new THREE.CylinderGeometry(10, 9, 20, 14)), toon(0xe8473f), 0, 0, 0));
    item.add(mesh(G('cocoa', () => new THREE.CylinderGeometry(8.6, 8.6, 1, 14)), toon(0x7a4a2a), 0, 9.6, 0, false));
    const h = mesh(G('handle', () => new THREE.TorusGeometry(5, 2, 6, 12)), toon(0xe8473f), 11, 0, 0, false); item.add(h);
    item.add(mesh(G('heart', () => new THREE.SphereGeometry(3, 8, 6)), toon(SNOW), 0, 0, 9.5, false));
  } else {
    for (const [x, h, y, r] of [[-7, 0, 3, 9], [7, 0, 3, 9], [0, 7, -3, 10]]) item.add(mesh(G('snowball' + r, () => new THREE.SphereGeometry(r, 12, 8)), toon(SNOW), x, h, y));
  }
  item.position.y = 26;
  g.add(item);
  const ring = new THREE.Mesh(G('pring', () => new THREE.RingGeometry(20, 25, 28).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.85 }));
  ring.position.y = 0.8; g.add(ring);
  g.add(blob(0, 0, 36, 36));
  g.userData.item = item; g.userData.ring = ring;
  return g;
}

// Merge a group's meshes (in the group's own space) into one mesh per material.
function mergeLocal(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), done = [];
  group.traverse((m) => {
    if (!m.isMesh || m === group || Array.isArray(m.material)) return;
    let geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (geo.index) geo = geo.toNonIndexed();
    const b = buckets.get(m.material) || []; b.push(geo); buckets.set(m.material, b); done.push(m);
  });
  for (const m of done) if (m.parent) m.parent.remove(m);
  for (const [mat, geos] of buckets) { const g = mergeGeometries(geos, false); if (g) group.add(new THREE.Mesh(g, mat)); }
  return group;
}

// ---------- characters ----------
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
}

function nameTag() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(76, 24, 1);
  s.userData = { c, tex, key: '' };
  return s;
}
function drawTag(tag, name, hp, shield) {
  const key = `${name}|${hp}|${shield}`;
  if (tag.userData.key === key) return;
  tag.userData.key = key;
  const { c, tex } = tag.userData; const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = '700 30px "Atkinson Hyperlegible", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(27,42,74,0.78)';
  g.beginPath(); g.roundRect(128 - w / 2, 2, w, 42, 21); g.fill();
  g.fillStyle = '#fff'; g.fillText(name, 128, 24);
  g.fillStyle = 'rgba(27,42,74,0.6)'; g.fillRect(68, 54, 120, 14);
  g.fillStyle = hp > 50 ? '#57c46a' : hp > 25 ? '#ffc93c' : '#e2453c'; g.fillRect(70, 56, 116 * Math.max(0, hp) / 100, 10);
  if (shield > 0) {
    g.fillStyle = '#5aa8ff'; g.fillRect(70, 48, 116 * shield / 100, 5);
    // little shield badge
    g.fillStyle = '#5aa8ff'; g.strokeStyle = '#1b2a4a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(50, 46); g.lineTo(62, 50); g.quadraticCurveTo(62, 66, 50, 74); g.quadraticCurveTo(38, 66, 38, 50); g.closePath(); g.fill(); g.stroke();
  }
  tex.needsUpdate = true;
}

function buildHat(style, hat, R) {
  const g = new THREE.Group();
  const top = R * 2;
  const black = toon(0x2b2f3a), white = toon(SNOW), gold = toon(0xffc93c);
  switch (style) {
    case 'tophat':
      g.add(mesh(G('th-brim', () => new THREE.CylinderGeometry(21, 21, 2.5, 20)), black, 0, top - 4, 0, true, 1.04));
      g.add(mesh(G('th-crown', () => new THREE.CylinderGeometry(13, 13, 26, 18)), black, 0, top + 9, 0, true, 1.05));
      g.add(mesh(G('th-band', () => new THREE.CylinderGeometry(13.4, 13.4, 5, 18)), toon(hat), 0, top + 0.5, 0, false));
      break;
    case 'cowboy': {
      const brown = toon(0x9c6a3e);
      const brim = mesh(G('cb-brim', () => new THREE.CylinderGeometry(32, 30, 2.5, 22)), brown, 0, top - 4, 0, true, 1.03);
      g.add(brim);
      g.add(mesh(G('cb-crown', () => new THREE.CylinderGeometry(12, 15, 16, 16)), brown, 0, top + 5, 0, true, 1.05));
      g.add(mesh(G('cb-band', () => new THREE.CylinderGeometry(15.2, 15.2, 4, 16)), toon(hat), 0, top - 0.5, 0, false));
      break;
    }
    case 'crown':
      g.add(mesh(G('cr-ring', () => new THREE.CylinderGeometry(14, 14, 9, 18, 1, true)), toon(0xffc93c, { side: THREE.DoubleSide }), 0, top - 1, 0, false));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(mesh(G('cr-pt', () => new THREE.ConeGeometry(4, 10, 6)), gold, Math.cos(a) * 13, top + 8, Math.sin(a) * 13, true, 1.1));
      }
      for (const [x, c] of [[-7, 0xe2453c], [0, 0x3a86ff], [7, 0x7ac74f]]) g.add(mesh(G('gem', () => new THREE.SphereGeometry(2.4, 8, 6)), toon(c), x, top - 1, 13.5, false));
      break;
    case 'viking': {
      g.add(mesh(G('vk-dome', () => new THREE.SphereGeometry(R + 1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), toon(0x9aa5b6), 0, R + 1, 0, true, 1.04));
      g.add(mesh(G('vk-band', () => new THREE.CylinderGeometry(R * 0.9, R * 0.9, 4, 20, 1, true)), toon(0xc9a227, { side: THREE.DoubleSide }), 0, R + 9, 0, false));
      for (const sgn of [-1, 1]) {
        const horn = mesh(G('horn', () => new THREE.ConeGeometry(4.5, 22, 8)), toon(0xf3ead5), sgn * 22, top - 2, 0, true, 1.1);
        horn.rotation.z = -sgn * 0.9; g.add(horn);
      }
      break;
    }
    case 'earmuffs': {
      const band = mesh(G('em-band', () => new THREE.TorusGeometry(R + 1, 2.4, 6, 20, Math.PI)), toon(hat), 0, R, 0, true, 1.12);
      g.add(band);
      for (const sgn of [-1, 1]) g.add(mesh(G('muff', () => new THREE.SphereGeometry(8, 12, 8)), toon(hat), sgn * (R + 1), R, 0, true, 1.08));
      break;
    }
    case 'propeller': {
      g.add(mesh(G('pc-cap', () => new THREE.SphereGeometry(R + 1.2, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), toon(hat), 0, R + 1, 0, true, 1.05));
      const visor = mesh(G('pc-visor', () => new THREE.CylinderGeometry(12, 12, 2, 16, 1, false, -Math.PI / 2, Math.PI)), toon(shade('#' + hat.toString(16).padStart(6, '0'), -0.3)), 0, R + 9, 16, false);
      g.add(visor);
      g.add(mesh(G('pc-stem', () => new THREE.CylinderGeometry(1, 1, 7, 6)), toon(INK), 0, top + 4, 0, false));
      const prop = new THREE.Group(); prop.position.set(0, top + 7.5, 0);
      prop.add(mesh(G('blade', () => new THREE.BoxGeometry(26, 1.2, 5)), toon(0xe2453c), 0, 0, 0, true, 1.12));
      const b2 = mesh(G('blade', () => new THREE.BoxGeometry(26, 1.2, 5)), toon(0xffc93c), 0, 0.4, 0, true, 1.12); b2.rotation.y = Math.PI / 2; prop.add(b2);
      prop.userData.spin = true;
      g.add(prop);
      break;
    }
    case 'none': {
      const tuft = mesh(G('tuft', () => new THREE.ConeGeometry(4, 11, 6)), toon(0x5a3a24), 0, top + 3, 2, true, 1.1);
      tuft.rotation.z = 0.3; g.add(tuft);
      break;
    }
    default: { // beanie
      g.add(mesh(G('beanie', () => new THREE.SphereGeometry(R + 1.2, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), toon(hat), 0, R + 1, 0, true, 1.05));
      const band = mesh(G('bband', () => new THREE.TorusGeometry(R * 0.86, 3.2, 8, 24)), white, 0, R + 10, 0, false);
      band.rotation.x = Math.PI / 2; g.add(band);
      g.add(mesh(G('pom', () => new THREE.SphereGeometry(5.5, 10, 8)), white, 0, top + 4, 0));
    }
  }
  return g;
}

function buildStache(style, R) {
  const g = new THREE.Group();
  if (!style || style === 'none') return g;
  const hair = toon(0x5a3a24);
  const y = R - 5, z = 20.5;
  const lobe = (x, sx = 1.6, rot = 0) => { const m = mesh(G('st-lobe', () => new THREE.SphereGeometry(3.4, 10, 8)), hair, x, y, z, true, 1.15); m.scale.set(sx, 0.7, 0.6); m.rotation.z = rot; g.add(m); };
  if (style === 'classic') { lobe(-4, 1.6, 0.25); lobe(4, 1.6, -0.25); }
  else if (style === 'handlebar') {
    lobe(-4, 1.7, 0.2); lobe(4, 1.7, -0.2);
    for (const sgn of [-1, 1]) { const c = mesh(G('st-curl', () => new THREE.TorusGeometry(2.6, 1.1, 6, 10, Math.PI * 1.4)), hair, sgn * 11, y + 2, z - 0.5, false); c.rotation.z = sgn > 0 ? Math.PI * 0.9 : -Math.PI * 0.3; g.add(c); }
  } else if (style === 'walrus') { const m = mesh(G('st-walrus', () => new THREE.SphereGeometry(4.5, 10, 8)), hair, 0, y - 1.5, z, true, 1.1); m.scale.set(2.4, 1.05, 0.7); g.add(m); }
  else if (style === 'pencil') { g.add(mesh(G('st-pencil', () => new THREE.BoxGeometry(14, 1.6, 1.5)), hair, 0, y + 0.5, z + 0.6, false)); }
  else if (style === 'curly') {
    lobe(-3.5, 1.3, 0.15); lobe(3.5, 1.3, -0.15);
    for (const sgn of [-1, 1]) { const c = mesh(G('st-curly', () => new THREE.TorusGeometry(2.8, 1.2, 6, 12)), hair, sgn * 9.5, y + 0.5, z - 0.3, false); g.add(c); }
  }
  return g;
}

const flashMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false });
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.16, depthWrite: false });
const bubbleWire = new THREE.MeshBasicMaterial({ color: 0x9cd0ff, transparent: true, opacity: 0.55, wireframe: true, depthWrite: false });

function buildCharacter(info, teams) {
  const R = F.PLAYER_RADIUS;
  const colour = info.colour || '#888888';
  const look = info.look || {};
  const hatHex = teams && info.team ? F.TEAM_COLOURS[info.team] : null;
  const hat = hatHex ? parseInt(hatHex.slice(1), 16) : shade(colour, -0.35);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  body.add(mesh(G('body', () => new THREE.SphereGeometry(R, 20, 14)), toon(colour), 0, R, 0, true, 1.08));
  const face = mesh(G('face', () => new THREE.SphereGeometry(14, 16, 10)), toon(0xfdf8f2), 0, R - 2, 14, false);
  face.scale.set(1, 0.85, 0.55); body.add(face);
  for (const x of [-5.5, 5.5]) body.add(mesh(G('peye', () => new THREE.SphereGeometry(2.6, 8, 6)), toon(INK), x, R + 1, 21.5, false));
  for (const x of [-9.5, 9.5]) { const c = mesh(G('cheek', () => new THREE.SphereGeometry(2.2, 6, 6)), toon(0xf2a0a8), x, R - 5, 19.5, false); body.add(c); }
  body.add(buildStache(look.stache, R));
  const hatGroup = buildHat(look.hat || 'beanie', hat, R);
  let prop = null;
  hatGroup.traverse((m) => { if (m.userData.spin) prop = m; });
  if (prop) { hatGroup.remove(prop); }
  body.add(hatGroup);
  const mitR = mesh(G('mitten', () => new THREE.SphereGeometry(6.5, 10, 8)), toon(hat), 19, R - 2, 14);
  const mitL = mesh(G('mitten', () => new THREE.SphereGeometry(6.5, 10, 8)), toon(hat), -24, R - 4, 2);
  body.add(mitR, mitL);
  if (teams && info.team) {
    const ring = new THREE.Mesh(G('tring', () => new THREE.RingGeometry(R + 2, R + 6, 24).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: parseInt(F.TEAM_COLOURS[info.team].slice(1), 16) }));
    ring.position.y = 0.9; root.add(ring);
  }
  mergeLocal(body); // ~30 meshes become ~10, which matters with a full class on screen
  if (prop) body.add(prop);
  // red flash when hit, and a hex bubble while shielded
  const flash = new THREE.Mesh(G('flash', () => new THREE.SphereGeometry(R * 1.12, 16, 12)), flashMat.clone());
  flash.position.y = R; flash.renderOrder = 3; body.add(flash);
  const bubble = new THREE.Group();
  bubble.add(new THREE.Mesh(G('bubble', () => new THREE.SphereGeometry(R * 1.55, 20, 14)), bubbleMat.clone()));
  bubble.add(new THREE.Mesh(G('bubblewire', () => new THREE.IcosahedronGeometry(R * 1.58, 1)), bubbleWire.clone()));
  bubble.position.y = R; bubble.visible = false; bubble.renderOrder = 4; body.add(bubble);
  const shadow = blob(0, 0, 54, 54); root.add(shadow);
  const tag = nameTag(); tag.position.y = R * 2 + 34; root.add(tag);
  root.userData = { body, tag, shadow, mitR, prop, flash, bubble, hitAt: -1e9, shieldAt: -1e9 };
  return root;
}

// ---------- lodges ----------
function boxUV(geo, w, h, d, tile) {
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z (4 vertices each). Scale UVs to world size so textures tile.
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  uv.needsUpdate = true;
  return geo;
}
const logWallTex = () => canvasTex(128, 128, (g, w, h) => {
  for (let i = 0; i < 4; i++) {
    const y = i * 32;
    const grd = g.createLinearGradient(0, y, 0, y + 32);
    grd.addColorStop(0, '#a8744a'); grd.addColorStop(0.5, '#8f5d36'); grd.addColorStop(1, '#6b4428');
    g.fillStyle = grd; g.fillRect(0, y, w, 32);
    g.strokeStyle = '#4a2f1c'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y + 31); g.lineTo(w, y + 31); g.stroke();
    g.strokeStyle = 'rgba(74,47,28,0.4)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo((i * 37) % 128, y + 12); g.lineTo((i * 37) % 128 + 30, y + 14); g.stroke();
  }
}, null);
const plankTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#b98a57'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(107,68,40,0.55)'; g.lineWidth = 2;
  for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (const [x, y] of [[40, 0], [100, 32], [20, 64], [80, 96]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
}, null);

function buildLodge(L) {
  const g = new THREE.Group();
  const wallTex = logWallTex(); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  const deckTex = plankTex(); deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping;
  const wallMat = toon(0xffffff, { map: wallTex }), deckMat = toon(0xffffff, { map: deckTex }), trim = toon(0x5c3a22), snow = toon(SNOW);
  for (const [x, y, w, d, b, t, kind] of L.boxes) {
    const h = t - b;
    const geo = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, kind === 'slab' ? 64 : 48);
    const m = mesh(geo, kind === 'slab' ? deckMat : kind === 'parapet' ? toon(0xffffff, { map: wallTex }) : wallMat, x + w / 2, b + h / 2, y + d / 2, true, 1.0);
    m.children[0].scale.set(1 + 2 / w, 1 + 2 / h, 1 + 2 / d); // even outline thickness
    g.add(m);
    if (kind === 'parapet' || (kind === 'wall' && t === 96 && b === 0 && false)) {
      g.add(mesh(new THREE.BoxGeometry(w + 2, 3, d + 2), snow, x + w / 2, t + 1.5, y + d / 2, false));
    }
    if (kind === 'wall' && b > 0) g.add(mesh(new THREE.BoxGeometry(w + 3, 3, d + 3), trim, x + w / 2, b + 1.5, y + d / 2, false)); // window/door heads
    if (kind === 'wall' && b === 0 && t < 50) g.add(mesh(new THREE.BoxGeometry(w + 4, 3, d + 4), snow, x + w / 2, t + 1.5, y + d / 2, false)); // window sills
  }
  // floor inside the room
  const slab = L.boxes.find((b) => b[6] === 'slab');
  const floorGeo = new THREE.PlaneGeometry(slab[2] - 24, slab[3] - 24).rotateX(-Math.PI / 2);
  const uv = floorGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (slab[2] - 24) / 64, uv.getY(i) * (slab[3] - 24) / 64);
  const floor = new THREE.Mesh(floorGeo, deckMat); floor.position.set(slab[0] + slab[2] / 2, 0.8, slab[1] + slab[3] / 2); g.add(floor);
  // snow piled on the deck corners and a lantern by the door
  for (const [dx, dy] of [[14, 14], [slab[2] - 14, 14], [14, slab[3] - 14], [slab[2] - 14, slab[3] - 14]]) {
    const s = mesh(G('decksnow', () => new THREE.SphereGeometry(12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), snow, slab[0] + dx, slab[5], slab[1] + dy, false);
    s.scale.y = 0.5; g.add(s);
  }
  // stairs: visible steps (the physics is a smooth slope)
  const r = L.ramp, steps = 13, dir = Math.sign(r.highX - r.lowX), run = Math.abs(r.highX - r.lowX);
  for (let i = 0; i < steps; i++) {
    const h = (r.top * (i + 1)) / steps;
    const x0 = r.lowX + dir * (run * i) / steps, x1 = r.lowX + dir * (run * (i + 1)) / steps;
    const cx = (x0 + x1) / 2, sw = Math.abs(x1 - x0);
    const step = mesh(boxUV(new THREE.BoxGeometry(sw, h, r.h), sw, h, r.h, 48), wallMat, cx, h / 2, r.y + r.h / 2, true, 1.0);
    step.children[0].scale.set(1 + 2 / sw, 1 + 2 / h, 1 + 2 / r.h);
    g.add(step);
    g.add(mesh(new THREE.BoxGeometry(sw, 2.5, r.h - 6), snow, cx, h + 1.2, r.y + r.h / 2, false));
  }
  const landX0 = r.highX, landX1 = dir > 0 ? r.x + r.w : r.x;
  const lw = Math.abs(landX1 - landX0);
  const land = mesh(boxUV(new THREE.BoxGeometry(lw, r.top, r.h), lw, r.top, r.h, 48), wallMat, (landX0 + landX1) / 2, r.top / 2, r.y + r.h / 2, true, 1.0);
  land.children[0].scale.set(1 + 2 / lw, 1 + 2 / r.top, 1 + 2 / r.h); g.add(land);
  g.add(mesh(new THREE.BoxGeometry(lw, 2.5, r.h - 6), deckMat, (landX0 + landX1) / 2, r.top + 1.2, r.y + r.h / 2, false));
  // railing posts along the outer edge of the stairs (looks only; you can still jump off)
  for (let i = 0; i <= 6; i++) {
    const x = r.lowX + dir * (run * i) / 6, h = (r.top * i) / 6 + 30;
    g.add(mesh(G('rpost', () => new THREE.BoxGeometry(4, 30, 4)), trim, x - dir * 4, h - 15, r.y + r.h - 3, false));
  }
  const railLen = Math.hypot(run, r.top);
  const rail = mesh(new THREE.BoxGeometry(railLen, 3, 3), trim, (r.lowX + r.highX) / 2, r.top / 2 + 30, r.y + r.h - 3, false);
  rail.rotation.z = dir * Math.atan2(r.top, run); g.add(rail);
  // a sign over the door
  const door = L.boxes.find((b) => b[6] === 'wall' && b[4] === 80);
  const signTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#6b4428'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2b3445'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#ffe9b0'; c.font = '800 38px "Bricolage Grotesque", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LODGE', w / 2, h / 2 + 2);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(60, 15), new THREE.MeshBasicMaterial({ map: signTex }));
  const outward = door[0] < F.MAP.width / 2 ? 1 : -1;
  sign.position.set(door[0] + (outward > 0 ? door[2] + 0.8 : -0.8), 88, door[1] + door[3] / 2);
  sign.rotation.y = outward * Math.PI / 2;
  g.add(sign);
  return g;
}

// ---------- Snow Village ----------
const hex = (s) => parseInt(String(s).replace('#', ''), 16);
const stoneTex = (base, line) => () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.strokeStyle = line; g.lineWidth = 3;
  for (let r = 0; r < 4; r++) {
    const y = r * 32; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    for (let i = 0; i < 3; i++) { const x = ((i + (r % 2) * 0.5) / 3) * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
  }
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 18; i++) g.fillRect((i * 53) % w, (i * 31) % h, 6, 3);
});
const brickTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#e8dccb'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) for (let i = -1; i < 4; i++) {
    const x = i * 40 + (r % 2) * 20 + 2, y = r * 16 + 2;
    g.fillStyle = ['#b65a46', '#a94f3d', '#c06650'][(r + i + 3) % 3]; g.fillRect(x, y, 36, 12);
  }
});
const lockerTex = () => canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = '#3d8fb3'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2b6a87'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#25576f';
  for (let i = 0; i < 4; i++) g.fillRect(16, 14 + i * 7, 32, 3);
  for (let i = 0; i < 4; i++) g.fillRect(16, h - 40 + i * 7, 32, 3);
  g.fillStyle = '#e7eef3'; g.fillRect(48, 60, 6, 14);
});
const canopyTex = (a, b) => () => canvasTex(128, 32, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, h); }
});
const chalkTex = () => canvasTex(256, 160, (g, w, h) => {
  g.fillStyle = '#6b4428'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f5a44'; g.fillRect(10, 10, w - 20, h - 20);
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = '700 34px "Bricolage Grotesque", system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('2x + 3 = 11', w / 2, 66); g.fillText('x = ?', w / 2, 116);
});
const clockTex = () => canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#2b3445'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fbf6e8'; g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b3445';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(64 + Math.cos(a) * 46 - 3, 64 + Math.sin(a) * 46 - 3, 6, 6); }
  g.strokeStyle = '#2b3445'; g.lineCap = 'round';
  g.lineWidth = 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 30); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(90, 72); g.stroke();
});
const waterTex = () => canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#2f6f99'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(200,235,255,0.55)'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const x = (i * 37) % w, y = 6 + (i * 13) % (h - 12); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 22, y); g.stroke(); }
}, [8, 1]);
const glowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,226,150,0.95)'); r.addColorStop(0.4, 'rgba(255,200,110,0.35)'); r.addColorStop(1, 'rgba(255,200,110,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});
const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function glow(x, h, y, size) { const s = new THREE.Sprite(glowMat); s.position.set(x, h, y); s.scale.set(size, size, 1); return s; }
const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe29a });   // lit windows, lanterns
let V_TEX = null;
function villageTextures() {
  if (V_TEX) return V_TEX;
  V_TEX = {
    stone: stoneTex('#a9b3bf', '#7f8a98')(), dark: stoneTex('#6c7684', '#4f5866')(), flag: stoneTex('#c3c8cf', '#9aa2ad')(),
    brick: brickTex(), locker: lockerTex(), chalk: chalkTex(), clock: clockTex(), log: logWallTex(), plank: plankTex(),
    canopy: [canopyTex('#e2453c', '#fff6ea')(), canopyTex('#2f6fe4', '#fff6ea')(), canopyTex('#3d8b5f', '#fff6ea')()],
  };
  for (const k of ['stone', 'dark', 'flag', 'brick', 'log', 'plank']) V_TEX[k].wrapS = V_TEX[k].wrapT = THREE.RepeatWrapping;
  return V_TEX;
}
// a textured box whose texture tiles at world scale, with an even ink outline
function tiledBox(w, h, d, mat, x, b, y, tile = 48, withOutline = true) {
  const m = mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile), mat, x, b + h / 2, y, withOutline, 1.0);
  if (withOutline) m.children[0].scale.set(1 + 2 / w, 1 + 2 / h, 1 + 2 / d);
  return m;
}
function textSign(text, w, h, bg = '#6b4428', fg = '#ffe9b0') {
  const tex = canvasTex(256, 64, (c, cw, ch) => {
    c.fillStyle = bg; c.fillRect(0, 0, cw, ch); c.strokeStyle = '#2b3445'; c.lineWidth = 6; c.strokeRect(3, 3, cw - 6, ch - 6);
    c.fillStyle = fg; c.font = '800 38px "Bricolage Grotesque", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2 + 2);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

// A gable roof in local space: the ridge runs along x, the slopes fall to ±z.
function gableRoof(W, Dd, baseY, rise, roofCol, wallCol) {
  const g = new THREE.Group();
  const ov = 10, s = Dd / 2 + ov, L = Math.hypot(s, rise), a = Math.atan2(rise, s), t = 7;
  const roofMat = toon(hex(roofCol)), snow = toon(SNOW);
  for (const side of [1, -1]) {
    const slab = mesh(new THREE.BoxGeometry(W + ov * 2, t, L), roofMat, 0, baseY + rise / 2, side * s / 2, true, 1.03);
    slab.rotation.x = side * a; g.add(slab);
    const n = new THREE.Vector3(0, Math.cos(a), side * Math.sin(a));
    const sn = mesh(new THREE.BoxGeometry(W + ov * 2 - 6, 5, L - 5), snow, 0, baseY + rise / 2, side * s / 2, false);
    sn.position.addScaledVector(n, t / 2 + 2); sn.rotation.x = side * a; g.add(sn);
  }
  g.add(mesh(new THREE.BoxGeometry(W + ov * 2, 6, 12), snow, 0, baseY + rise + 2, 0, false));
  const tri = new THREE.Shape(); tri.moveTo(-Dd / 2, 0); tri.lineTo(Dd / 2, 0); tri.lineTo(0, rise * (Dd / 2) / s); tri.closePath();
  const triGeo = new THREE.ShapeGeometry(tri).rotateY(Math.PI / 2);
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(triGeo, toon(hex(wallCol), { side: THREE.DoubleSide }));
    m.position.set(side * (W / 2), baseY, 0); g.add(m);
  }
  return g;
}

function buildHouse(H) {
  const T = villageTextures();
  const g = new THREE.Group();
  if (H.tower) {
    const stone = toon(0xffffff, { map: T.stone });
    g.add(tiledBox(H.w, H.h, H.d, stone, 0, 0, 0, 40));
    for (const [dx, dy, ry] of [[0, H.d / 2 + 0.6, 0], [0, -H.d / 2 - 0.6, Math.PI], [H.w / 2 + 0.6, 0, Math.PI / 2], [-H.w / 2 - 0.6, 0, -Math.PI / 2]]) {
      const face = new THREE.Mesh(G('clockface', () => new THREE.CircleGeometry(28, 28)), new THREE.MeshBasicMaterial({ map: T.clock }));
      face.position.set(dx, H.h - 46, dy); face.rotation.y = ry; g.add(face);
      const win = new THREE.Mesh(G('belfry', () => new THREE.PlaneGeometry(26, 34)), lightMat);
      win.position.set(dx * 1.001, 70, dy * 1.001); win.rotation.y = ry; g.add(win);
    }
    g.add(tiledBox(H.w + 10, 8, H.d + 10, toon(0x8f98a6), 0, H.h, 0, 40, true));
    const roof = mesh(G('towerroof', () => new THREE.ConeGeometry(H.w * 0.78, H.rise, 4)), toon(hex(H.roof)), 0, H.h + 8 + H.rise / 2, 0, true, 1.04);
    roof.rotation.y = Math.PI / 4; g.add(roof);
    const cap = mesh(G('towercap', () => new THREE.ConeGeometry(H.w * 0.4, H.rise * 0.5, 4)), toon(SNOW), 0, H.h + 8 + H.rise * 0.75 + 1, 0, false);
    cap.rotation.y = Math.PI / 4; g.add(cap);
    g.add(mesh(G('vane', () => new THREE.CylinderGeometry(1.5, 1.5, 24, 6)), toon(INK), 0, H.h + 8 + H.rise + 10, 0, false));
    g.position.set(H.x + H.w / 2, 0, H.y + H.d / 2);
    g.add(blob(6, 8, H.w + 60, H.d + 60));
    return g;
  }
  const alongX = H.ridge !== 'y';
  const W = alongX ? H.w : H.d, Dd = alongX ? H.d : H.w;
  const cx = H.x + H.w / 2, cy = H.y + H.d / 2;
  // the door faces the canal (for houses along x) or the middle of the village
  const doorSide = alongX ? (cy < 700 ? 1 : -1) : (cx < 1200 ? -1 : 1); // (a quarter turn maps local +z to map -x)
  const wallMat = H.log ? toon(0xffffff, { map: T.log }) : toon(hex(H.wall));
  g.add(tiledBox(W, H.h, Dd, wallMat, 0, 0, 0, 48));
  const trim = toon(0x5c3a22), white = toon(0xf7f3ea), snow = toon(SNOW);
  if (!H.log) {
    for (const x of [-W / 2, W / 2]) for (const z of [-Dd / 2, Dd / 2]) g.add(mesh(G('hpost' + H.h, () => new THREE.BoxGeometry(7, H.h, 7)), trim, x, H.h / 2, z, false));
    g.add(mesh(new THREE.BoxGeometry(W + 4, 6, Dd + 4), trim, 0, H.h - 3, 0, false));
  }
  g.add(mesh(new THREE.BoxGeometry(W + 6, 8, Dd + 6), toon(0x9aa5b6), 0, 4, 0, false)); // stone plinth
  // windows (warm light inside) with snowy sills
  const winY = H.h * 0.56;
  const addWindow = (x, z, rotY) => {
    const w = new THREE.Group();
    w.add(mesh(G('wframe', () => new THREE.BoxGeometry(28, 32, 3)), white, 0, 0, 0, true, 1.06));
    const glass = new THREE.Mesh(G('wglass', () => new THREE.BoxGeometry(21, 25, 3.6)), lightMat); w.add(glass);
    w.add(mesh(G('wbar', () => new THREE.BoxGeometry(2.4, 25, 4)), trim, 0, 0, 0, false));
    w.add(mesh(G('wbarh', () => new THREE.BoxGeometry(21, 2.4, 4)), trim, 0, 0, 0, false));
    w.add(mesh(G('wsill', () => new THREE.BoxGeometry(34, 4, 8)), snow, 0, -17, 3, false));
    for (const sx of [-1, 1]) w.add(mesh(G('shutter', () => new THREE.BoxGeometry(9, 30, 2)), toon(hex(H.roof)), sx * 19, 0, 0.5, false));
    w.position.set(x, winY, z); w.rotation.y = rotY; g.add(w);
  };
  const n = Math.max(1, Math.floor((W - 30) / 56));
  for (const side of [1, -1]) for (let i = 0; i < n; i++) {
    const x = -W / 2 + (W / (n + 1)) * (i + 1);
    if (side === doorSide && Math.abs(x) < 34) continue;
    addWindow(x, side * (Dd / 2 + 1.5), side > 0 ? 0 : Math.PI);
  }
  if (Dd >= 120) for (const side of [1, -1]) addWindow(side * (W / 2 + 1.5), 0, side * Math.PI / 2);
  // front door with a wreath, a step and maybe a shop sign
  const dz = doorSide * (Dd / 2 + 2);
  const door = new THREE.Group();
  door.add(mesh(G('door', () => new THREE.BoxGeometry(34, 60, 4)), toon(0x7a4a2a), 0, 30, 0, true, 1.05));
  door.add(mesh(G('doorframe', () => new THREE.BoxGeometry(42, 66, 2)), white, 0, 33, -1.2, false));
  door.add(mesh(G('knob', () => new THREE.SphereGeometry(2.2, 8, 6)), toon(0xffc93c), 11, 30, 2.6, false));
  const wreath = mesh(G('wreath', () => new THREE.TorusGeometry(8, 3, 6, 14)), toon(0x2c7046), 0, 46, 3, false); door.add(wreath);
  door.add(mesh(G('bow', () => new THREE.SphereGeometry(2.8, 8, 6)), toon(0xe2453c), 0, 38, 4.5, false));
  door.add(mesh(G('step', () => new THREE.BoxGeometry(50, 6, 16)), snow, 0, 3, 8, false));
  door.position.set(0, 0, dz); door.rotation.y = doorSide > 0 ? 0 : Math.PI; g.add(door);
  if (H.sign) {
    const sign = textSign(H.sign, 64, 16);
    sign.position.set(0, 76, dz + doorSide * 1.2); sign.rotation.y = doorSide > 0 ? 0 : Math.PI; g.add(sign);
  }
  g.add(gableRoof(W, Dd, H.h, H.rise, H.roof, H.log ? '#8f5d36' : H.wall));
  if (H.chimney) {
    const ch = new THREE.Group();
    ch.add(tiledBox(18, 50, 18, toon(0xffffff, { map: T.brick }), 0, 0, 0, 32));
    ch.add(mesh(G('chcap', () => new THREE.BoxGeometry(23, 6, 23)), snow, 0, 52, 0, false));
    ch.position.set(W * 0.25, H.h + H.rise * 0.35, -Dd * 0.18); g.add(ch);
  }
  if (!alongX) g.rotation.y = -Math.PI / 2; // local x (the ridge) now runs along map y
  g.position.set(cx, 0, cy);
  g.add(blob(6, 8, W + 50, Dd + 50));
  return g;
}

// School, skate hut and the canal pieces are drawn from the map's boxes.
function buildVillageBoxes() {
  const T = villageTextures();
  const g = new THREE.Group();
  const brick = toon(0xffffff, { map: T.brick }), logs = toon(0xffffff, { map: T.log }), plank = toon(0xffffff, { map: T.plank });
  const stone = toon(0xffffff, { map: T.stone }), dark = toon(0xffffff, { map: T.dark });
  const trim = toon(0xf7f3ea), snow = toon(SNOW), rail = toon(0x5c3a22), iron = toon(0x39424f);
  const tun = F.extra && F.extra.canal && F.extra.canal.tunnel;
  const inTunnel = (x0, x1) => tun && x0 >= tun.x0 - 1 && x1 <= tun.x1 + 1;
  for (const [x, y, w, d, b, t, kind] of F.BOXES) {
    const h = t - b, cx = x + w / 2, cy = y + d / 2;
    if (kind === 'brick' || kind === 'logwall') {
      g.add(tiledBox(w, h, d, kind === 'brick' ? brick : logs, cx, b, cy, 48));
      if (b > 0) g.add(mesh(new THREE.BoxGeometry(w + 3, 4, d + 3), trim, cx, b + 2, cy, false));          // lintel
      if (b === 0 && t < 50) g.add(mesh(new THREE.BoxGeometry(w + 4, 3, d + 4), snow, cx, t + 1.5, cy, false)); // sill
    } else if (kind === 'roof') {
      g.add(tiledBox(w + 8, h, d + 8, toon(0xe9dfcf), cx, b, cy, 64)); // a pale ceiling inside
    } else if (kind === 'earth') {
      // split the canal walls so the stretch inside the tunnel is darker
      const cuts = tun ? [x, Math.max(x, Math.min(x + w, tun.x0)), Math.max(x, Math.min(x + w, tun.x1)), x + w] : [x, x + w];
      for (let i = 0; i < cuts.length - 1; i++) {
        const x0 = cuts[i], x1 = cuts[i + 1];
        if (x1 - x0 < 0.5) continue;
        g.add(tiledBox(x1 - x0, h - 0.6, d, inTunnel(x0, x1) ? dark : stone, (x0 + x1) / 2, b, cy, 40, false));
      }
    } else if (kind === 'street') {
      g.add(tiledBox(w, h - 1, d, dark, cx, b, cy, 40, false)); // the tunnel ceiling
    } else if (kind === 'pillar') {
      g.add(tiledBox(w, h - 0.6, d, stone, cx, b, cy, 32));
    } else if (kind === 'bridge') {
      g.add(tiledBox(w, h, d, plank, cx, b, cy, 40));
    } else if (kind === 'rail') {
      // posts and a top rail; dark iron round the stairwells, wood on the bridges
      const mat = b > 0 ? rail : iron, len = Math.max(w, d), along = w >= d, n = Math.max(2, Math.round(len / 34) + 1);
      for (let i = 0; i < n; i++) {
        const t2 = -len / 2 + (len * i) / (n - 1);
        g.add(mesh(G('rpost' + h, () => new THREE.BoxGeometry(5, h, 5)), mat, along ? cx + t2 : cx, b + h / 2, along ? cy : cy + t2, false));
      }
      g.add(mesh(new THREE.BoxGeometry(along ? len : 5, 5, along ? 5 : len), mat, cx, t - 2, cy, true, 1.04));
      g.add(mesh(new THREE.BoxGeometry(along ? len : 6, 2, along ? 6 : len), snow, cx, t + 1, cy, false));
    }
  }
  return g;
}

function buildRamp(r) {
  const T = villageTextures();
  const g = new THREE.Group();
  const base = Math.min(r.h0, r.h1, F.baseFloorAt(r.x + r.w / 2, r.y + r.h / 2)) - 8;
  const len = r.axis === 'y' ? r.h : r.w;
  const span = r.a1 - r.a0, start = r.axis === 'y' ? r.y : r.x;
  if (r.kind === 'bridge') {
    // a sloping plank walkway, then a flat landing to the deck, over a stone abutment
    const run = Math.abs(span), rise = r.h1 - r.h0, L = Math.hypot(run, rise), a = Math.atan2(rise, run);
    const plank = toon(0xffffff, { map: T.plank }), wood = toon(WOOD_DARK), stone = toon(0xffffff, { map: T.stone });
    const mid = (r.a0 + r.a1) / 2, w = r.w;
    const slope = mesh(new THREE.BoxGeometry(w, 6, L), plank, r.x + w / 2, (r.h0 + r.h1) / 2 - 3, mid, true, 1.03);
    slope.rotation.x = -Math.sign(span) * a; g.add(slope);
    const flatStart = r.a1, flatEnd = span > 0 ? r.y + r.h : r.y, fl = Math.abs(flatEnd - flatStart);
    if (fl > 1) {
      g.add(tiledBox(w, r.h1 - 6, fl, stone, r.x + w / 2, 0, (flatStart + flatEnd) / 2, 32));
      g.add(tiledBox(w, 6, fl, plank, r.x + w / 2, r.h1 - 6, (flatStart + flatEnd) / 2, 40));
    }
    for (const sx of [r.x + 4, r.x + w - 4]) {
      const rl = mesh(new THREE.BoxGeometry(5, 5, L), wood, sx, (r.h0 + r.h1) / 2 + 28, mid, true, 1.05); rl.rotation.x = slope.rotation.x; g.add(rl);
      for (let i = 0; i <= 3; i++) {
        const c = r.a0 + span * (i / 3), hh = r.h0 + rise * (i / 3);
        g.add(mesh(G('brpost', () => new THREE.BoxGeometry(5, 30, 5)), wood, sx, hh + 15, c, false));
      }
      if (fl > 1) g.add(mesh(new THREE.BoxGeometry(5, 5, fl), wood, sx, r.h1 + 28, (flatStart + flatEnd) / 2, true, 1.05));
    }
    return g;
  }
  // stone steps (the physics is a smooth slope)
  const steps = Math.max(4, Math.round(Math.abs(r.h1 - r.h0) / 7));
  const flag = toon(0xffffff, { map: T.flag });
  for (let i = 0; i < steps; i++) {
    const c0 = r.a0 + (span * i) / steps, c1 = r.a0 + (span * (i + 1)) / steps;
    const top = r.h0 + (r.h1 - r.h0) * ((i + 0.5) / steps);
    const sw = Math.abs(c1 - c0), cc = (c0 + c1) / 2, hh = top - base;
    if (r.axis === 'y') g.add(tiledBox(r.w, hh, sw, flag, r.x + r.w / 2, base, cc, 40));
    else g.add(tiledBox(sw, hh, r.h, flag, cc, base, r.y + r.h / 2, 40));
  }
  return g;
}

function buildCanal() {
  const c = F.extra.canal, T = villageTextures();
  const g = new THREE.Group();
  const flag = toon(0xffffff, { map: T.flag }), stone = toon(0xffffff, { map: T.stone }), darkFloor = toon(0x22303f);
  const chY0 = 670, chY1 = 730, x0 = 380, x1 = 2020;
  // towpaths (raised either side of the channel) and the channel bed
  g.add(tiledBox(x1 - x0, c.depth - c.channel, chY0 - c.y, flag, (x0 + x1) / 2, c.channel - 0.1, (c.y + chY0) / 2, 40, false));
  g.add(tiledBox(x1 - x0, c.depth - c.channel, c.y + c.h - chY1, flag, (x0 + x1) / 2, c.channel - 0.1, (chY1 + c.y + c.h) / 2, 40, false));
  g.add(mesh(new THREE.BoxGeometry(x1 - x0, 4, chY1 - chY0), darkFloor, (x0 + x1) / 2, c.channel - 2, (chY0 + chY1) / 2, false));
  // stairwell landings at the bottom of the steps
  g.add(tiledBox(c.well.w, 8, 30, flag, c.well.x + c.well.w / 2, c.depth - 8, 615, 40, false));
  g.add(tiledBox(c.well.w, 8, 30, flag, c.well.x + c.well.w / 2, c.depth - 8, 785, 40, false));
  // stone edging along the open stretches of the canal
  for (const [a, b] of [[c.x, c.tunnel.x0], [c.tunnel.x1, c.x + c.w]]) {
    for (const y of [c.y - 6, c.y + c.h + 6]) g.add(tiledBox(b - a, 5, 12, stone, (a + b) / 2, 0, y, 32));
  }
  // arches at the tunnel mouths
  const arch = G('arch', () => new THREE.TorusGeometry(66, 8, 8, 20, Math.PI));
  for (const x of [c.tunnel.x0, c.tunnel.x1]) {
    const m = mesh(arch, stone, x, c.channel, c.y + c.h / 2, true, 1.05);
    m.rotation.y = Math.PI / 2; g.add(m);
    g.add(tiledBox(14, 18, 18, stone, x, c.channel + 56, c.y + c.h / 2, 24)); // keystone
  }
  // lanterns along the tunnel walls
  for (let x = c.tunnel.x0 + 50; x < c.tunnel.x1 - 20; x += 100) {
    for (const [y, s] of [[c.y + 3, 1], [c.y + c.h - 3, -1]]) {
      g.add(mesh(G('lbracket', () => new THREE.BoxGeometry(4, 4, 10)), toon(0x39424f), x, -30, y + s * 3, false));
      g.add(mesh(G('lantern', () => new THREE.BoxGeometry(9, 13, 9)), lightMat, x, -36, y + s * 7, true, 1.15));
    }
  }
  return g;
}
// Moving and see-through things in the canal (kept out of the static merge).
function buildCanalLive(scene) {
  const c = F.extra.canal, live = { water: [] };
  const iceMat = new THREE.MeshPhongMaterial({ color: 0xa9daf5, transparent: true, opacity: 0.82, shininess: 100, specular: 0xffffff });
  for (const s of F.ICE) {
    if (s.round || s.z >= 0) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h).rotateX(-Math.PI / 2), iceMat);
    m.position.set(s.x + s.w / 2, s.z + 0.6, s.y + s.h / 2); scene.add(m);
  }
  for (const w of F.WATER) {
    const tex = waterTex(); tex.repeat.set(w.w / 60, 1);
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: tex, transparent: true, opacity: 0.85, shininess: 60 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h).rotateX(-Math.PI / 2), mat);
    m.position.set(w.x + w.w / 2, w.z + 5, w.y + w.h / 2); scene.add(m);
    live.water.push({ tex, speed: w.fx / 60 });
  }
  for (let x = c.tunnel.x0 + 50; x < c.tunnel.x1 - 20; x += 100) for (const y of [c.y + 10, c.y + c.h - 10]) scene.add(glow(x, -36, y, 46));
  return live;
}

function buildLocker() {
  const T = villageTextures();
  const g = new THREE.Group();
  const body = toon(0x3d8fb3), face = toon(0xffffff, { map: T.locker });
  const W = 46, H = 92, Dp = 40;
  const part = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.userData.cover = true; g.add(m); };
  part(W, H, 3, body, 0, H / 2, -Dp / 2 + 1.5);            // back
  part(3, H, Dp, body, -W / 2 + 1.5, H / 2, 0);             // sides
  part(3, H, Dp, body, W / 2 - 1.5, H / 2, 0);
  part(W, 3, Dp, body, 0, H - 1.5, 0);                      // top
  part(W, 3, Dp, body, 0, 1.5, 0);                          // floor
  const door = new THREE.Mesh(new THREE.BoxGeometry(W - 4, H - 6, 2.5), face);
  door.geometry.translate((W - 4) / 2, 0, 0);               // hinge on the left edge
  door.position.set(-W / 2 + 2, H / 2, Dp / 2); door.rotation.y = -1.1; door.userData.cover = true; g.add(door);
  return g;
}
function buildBin() {
  const g = new THREE.Group();
  const green = toon(0x3d7a4f), lid = toon(0x2e5e3d), dark = toon(0x22303f);
  const part = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.userData.cover = true; g.add(m); return m; };
  part(new THREE.BoxGeometry(78, 54, 52), green, 0, 33, 0);
  part(new THREE.BoxGeometry(84, 5, 56), lid, 0, 62, -6, -0.55);   // lid propped open
  part(new THREE.BoxGeometry(82, 5, 4), lid, 0, 46, 28);            // front lip
  for (const x of [-30, 30]) for (const z of [-18, 18]) {
    const wh = new THREE.Mesh(G('binwheel', () => new THREE.CylinderGeometry(6, 6, 5, 10)), dark); wh.rotation.z = Math.PI / 2; wh.position.set(x, 6, z); g.add(wh);
  }
  const snowLid = part(new THREE.BoxGeometry(70, 4, 40), toon(SNOW), 0, 66, -10, -0.55);
  snowLid.position.y += 2;
  g.add(blob(3, 4, 100, 76));
  return g;
}
function buildDrift(seed) {
  const g = new THREE.Group();
  const lumps = [[0, 0, 52, 0.62], [-34, 10, 34, 0.7], [30, -12, 36, 0.66], [8, 26, 28, 0.6], [-14, -28, 26, 0.6]];
  lumps.forEach(([x, z, r, sy], i) => {
    const m = new THREE.Mesh(G('lump', () => new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), toon(i % 2 ? SNOW_SHADE : SNOW));
    m.scale.set(r, r * sy * 1.5, r); m.position.set(x, 0, z); m.userData.cover = true; g.add(m);
  });
  g.rotation.y = (seed * 1.3) % 6.28;
  g.add(blob(4, 6, 150, 130));
  return g;
}
function buildLamp() {
  const g = new THREE.Group();
  const iron = toon(0x2b3445);
  g.add(mesh(G('lpole', () => new THREE.CylinderGeometry(2.5, 3.5, 120, 8)), iron, 0, 60, 0, true, 1.2));
  g.add(mesh(G('lbase', () => new THREE.CylinderGeometry(7, 8, 10, 10)), iron, 0, 5, 0, true, 1.08));
  g.add(mesh(G('lhead', () => new THREE.BoxGeometry(16, 20, 16)), lightMat, 0, 130, 0, true, 1.12));
  g.add(mesh(G('lroof', () => new THREE.ConeGeometry(14, 10, 4)), iron, 0, 145, 0, true, 1.08));
  g.add(mesh(G('lsnow', () => new THREE.ConeGeometry(11, 5, 4)), toon(SNOW), 0, 150, 0, false));
  g.add(blob(0, 0, 30, 30));
  return g;
}
function buildStall(seed) {
  const T = villageTextures();
  const g = new THREE.Group();
  const wood = toon(WOOD), canopy = toon(0xffffff, { map: T.canopy[seed % 3] });
  g.add(mesh(new THREE.BoxGeometry(104, 40, 40), toon(0xffffff, { map: WOOD_TEX }), 0, 20, 6, true, 1.03));
  for (const x of [-48, 48]) for (const z of [-22, 22]) g.add(mesh(G('stpost', () => new THREE.BoxGeometry(5, 76, 5)), wood, x, 38, z, false));
  const top = mesh(new THREE.BoxGeometry(116, 5, 64), canopy, 0, 80, 0, true, 1.03); top.rotation.x = 0.18; g.add(top);
  const sn = mesh(new THREE.BoxGeometry(108, 4, 56), toon(SNOW), 0, 84, -1, false); sn.rotation.x = 0.18; g.add(sn);
  const goods = [0xe2453c, 0xffc93c, 0x3a86ff, 0x7ac74f, 0xff70a6];
  for (let i = 0; i < 7; i++) g.add(mesh(G('bauble', () => new THREE.SphereGeometry(4.5, 10, 8)), toon(goods[(i + seed) % goods.length]), -36 + i * 12, 45, 14, false));
  g.add(blob(3, 4, 130, 70));
  return g;
}
function buildDesk(teacher) {
  const g = new THREE.Group();
  const wood = toon(0xc98c52), legs = toon(0x39424f);
  g.add(mesh(G('desktop', () => new THREE.BoxGeometry(56, 4, 36)), wood, 0, 28, 0, true, 1.06));
  for (const x of [-24, 24]) for (const z of [-14, 14]) g.add(mesh(G('dleg', () => new THREE.BoxGeometry(3, 26, 3)), legs, x, 13, z, false));
  if (teacher) {
    g.add(mesh(G('apple', () => new THREE.SphereGeometry(4.5, 10, 8)), toon(0xe2453c), 14, 34, 4, true, 1.12));
    g.add(mesh(G('books', () => new THREE.BoxGeometry(18, 7, 13)), toon(0x3a86ff), -12, 33, 0, true, 1.08));
  } else g.add(mesh(G('chair', () => new THREE.BoxGeometry(22, 3, 18)), toon(0x3d8fb3), 0, 16, 26, false));
  return g;
}
function buildHydrant() {
  const g = new THREE.Group();
  const red = toon(0xe2453c);
  g.add(mesh(G('hyd', () => new THREE.CylinderGeometry(8, 9, 26, 10)), red, 0, 13, 0, true, 1.1));
  g.add(mesh(G('hydtop', () => new THREE.SphereGeometry(8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), red, 0, 26, 0, true, 1.1));
  const nz = mesh(G('hydnz', () => new THREE.CylinderGeometry(3.5, 3.5, 24, 8)), red, 0, 16, 0, false); nz.rotation.z = Math.PI / 2; g.add(nz);
  g.add(mesh(G('hydsnow', () => new THREE.SphereGeometry(6, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)), toon(SNOW), 0, 32, 0, false));
  g.add(blob(0, 0, 34, 34));
  return g;
}
// The inside of the school and skate hut: floors, a chalkboard and the shop signs.
function buildInteriors() {
  const T = villageTextures();
  const g = new THREE.Group();
  const deck = toon(0xffffff, { map: T.plank });
  for (const B of [F.extra.school, F.extra.hut]) {
    if (!B) continue;
    const fw = B.w - 24, fd = B.h - 24;
    const geo = new THREE.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * fw / 64, uv.getY(i) * fd / 64);
    const floor = new THREE.Mesh(geo, deck); floor.position.set(B.x + B.w / 2, 0.8, B.y + B.h / 2); g.add(floor);
    g.add(gableRoof(B.w, B.h, B.top + 2, B === F.extra.school ? 56 : 44, B === F.extra.school ? '#3f6d9e' : '#6b4428', B === F.extra.school ? '#e8dccb' : '#8f5d36').translateX(B.x + B.w / 2).translateZ(B.y + B.h / 2));
  }
  const S = F.extra.school;
  if (S) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(68, 42), new THREE.MeshBasicMaterial({ map: T.chalk }));
    board.position.set(S.x + 180, 60, S.y + S.h - 12.6); board.rotation.y = Math.PI; g.add(board);
  }
  for (const s of F.SIGNS) {
    const m = textSign(s.text, s.w, s.w / 4.2);
    const out = 1.5;
    if (s.face === 'S') m.position.set(s.x, s.z, s.y + out);
    else if (s.face === 'N') { m.position.set(s.x, s.z, s.y - out); m.rotation.y = Math.PI; }
    else if (s.face === 'W') { m.position.set(s.x - out, s.z, s.y); m.rotation.y = -Math.PI / 2; }
    else { m.position.set(s.x + out, s.z, s.y); m.rotation.y = Math.PI / 2; }
    g.add(m);
  }
  return g;
}
// Merge a cover group's see-through parts into one mesh per material, so a hiding spot is a few draw calls.
function mergeCover(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), done = [];
  group.traverse((m) => {
    if (!m.isMesh || !m.userData.cover || Array.isArray(m.material)) return;
    let geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (geo.index) geo = geo.toNonIndexed();
    const b = buckets.get(m.material) || []; b.push(geo); buckets.set(m.material, b); done.push(m);
  });
  for (const m of done) if (m.parent) m.parent.remove(m);
  for (const [mat, geos] of buckets) {
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const mm = new THREE.Mesh(geo, mat); mm.userData.cover = true; group.add(mm);
  }
  return group;
}

function plusSprite(colour) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = colour; g.strokeStyle = '#1b2a4a'; g.lineWidth = 6; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(24, 8); g.lineTo(40, 8); g.lineTo(40, 24); g.lineTo(56, 24); g.lineTo(56, 40); g.lineTo(40, 40); g.lineTo(40, 56); g.lineTo(24, 56); g.lineTo(24, 40); g.lineTo(8, 40); g.lineTo(8, 24); g.lineTo(24, 24); g.closePath();
  g.stroke(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function shieldSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#5aa8ff'; g.strokeStyle = '#1b2a4a'; g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(32, 6); g.lineTo(54, 14); g.quadraticCurveTo(54, 44, 32, 58); g.quadraticCurveTo(10, 44, 10, 14); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#d6ecff'; g.beginPath(); g.moveTo(32, 14); g.lineTo(46, 19); g.quadraticCurveTo(46, 40, 32, 50); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// The arena floor as a set of rectangles, leaving out the holes where the ground is open (the canal).
function groundGeometry(W, H, holes) {
  const xs = new Set([0, W]), ys = new Set([0, H]);
  for (const [x, y, w, h] of holes) { xs.add(x); xs.add(x + w); ys.add(y); ys.add(y + h); }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
  const pos = [], nor = [], uv = [];
  const inHole = (x, y) => holes.some(([hx, hy, hw, hh]) => x > hx && x < hx + hw && y > hy && y < hy + hh);
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
    const x0 = X[i], x1 = X[i + 1], y0 = Y[j], y1 = Y[j + 1];
    if (inHole((x0 + x1) / 2, (y0 + y1) / 2)) continue;
    const quad = [[x0, y0], [x0, y1], [x1, y0], [x1, y0], [x0, y1], [x1, y1]];
    for (const [x, y] of quad) { pos.push(x, 0, y); nor.push(0, 1, 0); uv.push(x / W, 1 - y / H); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

// ---------- the world ----------
export class World3D {
  constructor(canvas) {
    this.canvas = canvas;
    // Lighter settings on low-power devices (many school Chromebooks); quality also adapts at runtime.
    const weak = (navigator.hardwareConcurrency || 4) <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !weak, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(weak ? 1 : 1.5, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.frameTimes = []; this.lastQualityCheck = 0;
    this.camera = new THREE.PerspectiveCamera(75, 1, 1, 6000);
    this.ready = false;
    this.loadSeq = 0;
    this.mapId = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resetScene();
    this.buildViewmodel();
  }

  resetScene() {
    if (this.scene) {
      this.scene.remove(this.camera);
      this.scene.traverse((m) => { if (m.isMesh || m.isPoints) m.geometry.dispose(); });
      for (const k of Object.keys(geoCache)) delete geoCache[k];
    }
    this.scene = new THREE.Scene();
    const sky = 0xcfe6f7;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 700, 2600);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xaec6de, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-600, 1200, 400); this.scene.add(sun);
    this.players = new Map();
    this.balls = new Map();
    this.pickups = new Map();
    this.particles = [];
    this.covers = [];
    this.fx = [];
    this.live = null;
    this.snow = null;
  }

  // Build the 3D arena for a map (the current one if none is given). Safe to call again to switch maps.
  async init(mapId) { return this.load(mapId || F.mapId); }
  async load(mapId) {
    const seq = ++this.loadSeq;
    this.ready = false;
    await window.FFSprites.ready;
    if (seq !== this.loadSeq) return false;
    F.useMap(mapId);
    this.resetScene();
    this.mapId = F.mapId;
    WOOD_TEX = woodTex(); BIRCH_TEX = birchTex(); RINGS_TEX = ringsTex();
    this.buildGround();
    this.buildFenceBorder();
    for (const L of F.LODGES || []) this.scene.add(buildLodge(L));
    if (F.HOUSES.length || F.extra.canal) {
      this.scene.add(buildVillageBoxes());
      for (const H of F.HOUSES) this.scene.add(buildHouse(H));
      for (const r of F.RAMPS) if (r.kind) this.scene.add(buildRamp(r));
      if (F.extra.canal) { this.scene.add(buildCanal()); this.live = buildCanalLive(this.scene); }
      this.scene.add(buildInteriors());
    }
    this.buildScenery();
    F.OBJECTS.forEach((o, i) => {
      let g;
      switch (o.k) {
        case 'pine': g = buildPine(); if (o.big) g.scale.setScalar(1.45); break;
        case 'locker': g = buildLocker(); break;
        case 'bin': g = buildBin(); break;
        case 'drift': g = buildDrift(i); break;
        case 'lamp': g = buildLamp(); break;
        case 'stall': g = buildStall(i); break;
        case 'desk': g = buildDesk(o.teacher); break;
        case 'hydrant': g = buildHydrant(); break;
        case 'crateS': g = buildCrate(!(o.z < 0)); g.scale.set(0.68, 0.7, 0.68); break; // no snow down in the canal
        case 'igloo': g = buildIgloo(o); break;
        case 'bare': g = buildBare(i); break;
        case 'mound': g = buildMound(true); break;
        case 'moundS': g = buildMound(false); break;
        case 'snowman': g = buildSnowman(i); break;
        case 'crate': g = buildCrate(); break;
        case 'iceTall': g = buildIce(46, 110, 100); break;
        case 'iceWide': g = buildIce(102, 56, 54); break;
        case 'logpile': g = buildLogpile(); break;
        case 'post': g = buildPost(); break;
        case 'bench': g = buildBench(); break;
        case 'stump': g = buildStump(); break;
        case 'log': g = buildLog(); break;
        case 'fenceH': g = buildFence(68, false); break;
        case 'fenceV': g = buildFence(130, true); break;
        default: return;
      }
      g.position.set(o.x, o.z || 0, o.y);
      if (o.rot || o.rotY) g.rotation.y = o.rot || o.rotY;
      this.scene.add(g);
      if (F.KINDS[o.k].cover) {
        mergeCover(g);
        const mats = [];
        g.traverse((m) => {
          if (m.isMesh && m.userData.cover) { m.material = m.material.clone(); m.material.transparent = true; mats.push(m.material); }
        });
        this.covers.push({ obj: i, group: g, mats, alpha: 1 });
      }
    });
    this.mergeStatic();
    if (!this.reducedMotion) this.buildSnowfall();
    await this.warmUp();
    if (seq !== this.loadSeq) return false;
    this.ready = true;
    return true;
  }

  // Bake every static, opaque mesh into one mesh per material: hundreds of draw calls become a few dozen.
  mergeStatic() {
    this.scene.updateMatrixWorld(true);
    const buckets = new Map();
    const baked = [];
    this.scene.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || Array.isArray(m.material)) return;
      if (m.material.transparent && m.material !== blobMat) return; // covers that fade, ice
      let geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv || !geo.attributes.normal) return;
      if (geo.index) geo = geo.toNonIndexed();
      const b = buckets.get(m.material) || [];
      b.push(geo); buckets.set(m.material, b);
      baked.push(m);
    });
    for (const m of baked) if (m.parent) m.parent.remove(m);
    for (const [mat, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, mat);
      if (mat === blobMat) mm.renderOrder = 1;
      mm.matrixAutoUpdate = false;
      this.scene.add(mm);
    }
  }

  // Compile every shader now (while students wait in the lobby) so the first frame of the
  // game doesn't stall: add one of each thing that appears later, compile, then remove them.
  async warmUp() {
    const temp = [buildCharacter({ colour: '#e85d75', name: '' }, true), buildCharacter({ colour: '#3a86ff', team: 'blue' }, true),
      buildPickup('shield'), buildPickup('cocoa'), buildPickup('snow'),
      mesh(G('ball', () => new THREE.SphereGeometry(F.SNOWBALL.radius, 12, 8)), toon(SNOW), 0, 0, 0, true, 1.12)];
    temp.forEach((t, i) => { t.position.set(900 + i * 40, 0, 650); this.scene.add(t); });
    this.burst(900, 650, 30, 2, 10); this.floatText('KO!', 900, 650, 80);
    this.camera.position.set(900, 60, 900); this.camera.lookAt(900, 40, 650);
    try {
      if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
      else this.renderer.compile(this.scene, this.camera);
    } catch (_) { /* compile on first frame instead */ }
    temp.forEach((t) => this.scene.remove(t));
    for (const p of this.particles) this.scene.remove(p.m);
    for (const f of this.fx) this.scene.remove(f.s);
    this.particles = []; this.fx = [];
  }

  buildGround() {
    // Paint the arena floor (snow, grass, ponds) with the same code as the 2D map.
    const W = 2048, H = Math.round(2048 * F.MAP.height / F.MAP.width);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.scale(W / F.MAP.width, H / F.MAP.height);
    window.FFRender.drawGround(g);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(groundGeometry(F.MAP.width, F.MAP.height, F.HOLES), new THREE.MeshLambertMaterial({ map: tex }));
    this.scene.add(floor);
    // snowy land beyond the fence (four strips, so nothing covers the canal)
    const outMat = new THREE.MeshLambertMaterial({ color: 0xe6eef6 }), E = 6000, MW = F.MAP.width, MH = F.MAP.height;
    for (const [x, y, w, h] of [[-E, -E, MW + 2 * E, E], [-E, MH, MW + 2 * E, E], [-E, 0, E, MH], [MW, 0, E, MH]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), outMat);
      m.position.set(x + w / 2, -0.5, y + h / 2); this.scene.add(m);
    }
  }

  buildFenceBorder() {
    const W = F.MAP.width, H = F.MAP.height, inset = 13;
    const pts = [];
    for (let x = inset; x <= W - inset; x += 40) { pts.push([x, inset]); pts.push([x, H - inset]); }
    for (let y = inset + 40; y < H - inset; y += 40) { pts.push([inset, y]); pts.push([W - inset, y]); }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(9, 46, 9), toon(WOOD), pts.length);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(11, 3, 11), toon(SNOW), pts.length);
    const outl = new THREE.InstancedMesh(new THREE.BoxGeometry(10.6, 47.5, 10.6), outlineMat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, y], i) => {
      m.makeTranslation(x, 23, y); posts.setMatrixAt(i, m); outl.setMatrixAt(i, m);
      m.makeTranslation(x, 47, y); caps.setMatrixAt(i, m);
    });
    this.scene.add(posts, caps, outl);
    const rail = toon(0x9c6a3e);
    for (const h of [16, 34]) {
      for (const [x, y, w, d] of [[W / 2, inset, W - 2 * inset, 4], [W / 2, H - inset, W - 2 * inset, 4], [inset, H / 2, 4, H - 2 * inset], [W - inset, H / 2, 4, H - 2 * inset]]) {
        this.scene.add(mesh(new THREE.BoxGeometry(w, 6, d), rail, x, h, y, true, 1.02));
      }
    }
  }

  buildScenery() {
    // Snowy hills and pines beyond the fence so the arena doesn't float in space.
    const cx = F.MAP.width / 2, cy = F.MAP.height / 2;
    let seed = 5; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const hillMat = toon(0xf4f8fc);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2, d = 1500 + r() * 500;
      const hill = new THREE.Mesh(G('hill', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hillMat);
      hill.position.set(cx + Math.cos(a) * d * 1.15, 0, cy + Math.sin(a) * d);
      hill.scale.set(260 + r() * 260, 120 + r() * 220, 260 + r() * 200);
      this.scene.add(hill);
    }
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = 1150 + r() * 350;
      const x = cx + Math.cos(a) * d * 1.2, y = cy + Math.sin(a) * d;
      if (x > -60 && x < F.MAP.width + 60 && y > -60 && y < F.MAP.height + 60) continue;
      const p = buildPine(); p.position.set(x, 0, y); p.scale.setScalar(0.9 + r() * 0.6); this.scene.add(p);
    }
  }

  buildSnowfall() {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 1400; pos[i * 3 + 1] = Math.random() * 500; pos[i * 3 + 2] = (Math.random() - 0.5) * 1400; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 3, transparent: true, opacity: 0.85, depthWrite: false }));
    this.scene.add(this.snow);
  }

  // A mitten holding a snowball, bottom-right of the screen.
  buildViewmodel() {
    const vm = new THREE.Group();
    this.vmMitten = mesh(new THREE.SphereGeometry(2.4, 14, 10), new THREE.MeshToonMaterial({ color: 0x888888, gradientMap: gradient }), 0, 0, 0, true, 1.12);
    this.vmMitten.scale.set(1, 0.9, 1.25);
    this.vmBall = mesh(new THREE.SphereGeometry(1.8, 14, 10), toon(SNOW), 0, 1.9, -0.9, true, 1.14);
    vm.add(this.vmMitten, this.vmBall);
    vm.position.set(6, -5.4, -16);
    // Drawn on top of the world: outlines first, then the mitten and snowball over them.
    vm.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone(); m.material.depthTest = false; m.material.depthWrite = false;
      m.renderOrder = m.userData.outline ? 10 : 11;
    });
    this.vmMitten.children[0].material.depthTest = false;
    this.vm = vm; this.vmBase = vm.position.clone(); this.throwAnim = 0;
    this.camera.add(vm);
  }
  setViewmodelColour(hex) { this.vmMitten.material.color.set(hex); }
  playThrow() { this.throwAnim = 1; }

  resize(w, h) {
    this.size = [w, h];
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  // ---------- effects ----------
  burst(x, y, h, n, spread, colour = 0xffffff, size = 3.2) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(G('part' + size, () => new THREE.SphereGeometry(size, 6, 4)), toon(colour));
      m.position.set(x, h, y);
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.particles.push({ m, vx: Math.cos(a) * spread * u, vz: Math.sin(a) * spread * u, vy: spread * (0.4 + Math.random() * 0.8), life: 0.55 + Math.random() * 0.3, t: 0 });
      this.scene.add(m);
    }
  }
  floatText(text, x, y, h, colour = '#ffc93c', life = 1, size = 34) {
    // size the canvas to the text so long labels ("+5 snowballs") aren't clipped
    const font = '800 64px "Bricolage Grotesque", system-ui, sans-serif';
    const m = document.createElement('canvas').getContext('2d'); m.font = font;
    const cw = Math.ceil(m.measureText(text).width + 28), c = document.createElement('canvas'); c.width = cw; c.height = 96;
    const g = c.getContext('2d');
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = '#1b2a4a'; g.strokeText(text, cw / 2, 48); g.fillStyle = colour; g.fillText(text, cw / 2, 48);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(size * cw / 96, size, 1); s.position.set(x, h, y); s.renderOrder = 5;
    this.scene.add(s);
    this.fx.push({ s, t: 0, life, rise: 40 });
  }

  // ---------- feedback for hits, shields and heals ----------
  hitPlayer(pid, x, y, z, dmg, shieldHit, byMe) {
    const ch = this.players.get(pid);
    if (ch) ch.userData.hitAt = performance.now();
    this.floatText(`-${dmg}`, x, y, (z || 30) + 22, shieldHit ? '#7cc0ff' : byMe ? '#ff4b3e' : '#ff8a80', 0.75);
  }
  spriteBurst(tex, x, y, h, n, size) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, d = 18 + Math.random() * 14;
      s.position.set(x + Math.cos(a) * d, h + Math.random() * 20, y + Math.sin(a) * d);
      const sc = size * (0.7 + Math.random() * 0.5); s.scale.set(sc, sc, 1); s.renderOrder = 6;
      this.scene.add(s);
      this.fx.push({ s, t: -i * 0.06, life: 1.1, rise: 45 + Math.random() * 25 });
    }
  }
  healEffect(pid, x, y, z) {
    this.plusTex = this.plusTex || plusSprite('#57d36a');
    this.spriteBurst(this.plusTex, x, y, (z || 0) + 20, 6, 16);
  }
  shieldEffect(pid, x, y, z) {
    const ch = this.players.get(pid);
    if (ch) ch.userData.shieldAt = performance.now();
    this.shieldTex = this.shieldTex || shieldSprite();
    this.spriteBurst(this.shieldTex, x, y, (z || 0) + 20, 4, 18);
  }

  // ---------- per-frame sync with game state ----------
  syncPlayers(world, now) {
    const seen = new Set();
    for (const p of world.players.values()) {
      if (p.id === world.meId || !p.alive || !p.connected || p.hidden || p.x == null) continue;
      const info = world.roster.get(p.id) || {};
      let ch = this.players.get(p.id);
      const key = `${info.colour}|${world.teams}|${info.team}|${(info.look || {}).hat}|${(info.look || {}).stache}`;
      if (ch && ch.userData.rosterKey !== key) { this.scene.remove(ch); ch = null; }
      if (!ch) { ch = buildCharacter(info, world.teams); ch.userData.rosterKey = key; this.players.set(p.id, ch); this.scene.add(ch); }
      seen.add(p.id);
      const z = p.z || 0;
      ch.position.set(p.x, 0, p.y);
      ch.userData.body.position.y = z;
      ch.userData.tag.position.y = z + F.PLAYER_RADIUS * 2 + 30;
      const s = Math.max(0.4, 1 - z / 120); ch.userData.shadow.scale.set(54 * s, 1, 54 * s);
      ch.userData.body.rotation.y = Math.atan2(Math.cos(p.angle || 0), Math.sin(p.angle || 0));
      ch.userData.tag.position.y = z + F.PLAYER_RADIUS * 2 + 34;
      drawTag(ch.userData.tag, info.name || '', p.hp, p.shield);
      const flick = p.inv && Math.floor(now / 100) % 2 === 0;
      ch.userData.body.visible = !flick;
      const u = ch.userData;
      if (u.prop) u.prop.rotation.y = now / 90;
      // red flash and a shake when hit
      const sinceHit = (now - u.hitAt) / 1000;
      const f = sinceHit < 0.6 ? 1 - sinceHit / 0.6 : 0;
      u.flash.material.opacity = f * 0.65;
      u.flash.visible = f > 0;
      u.body.position.x = f > 0 ? Math.sin(now / 18) * 3 * f : 0;
      u.flash.scale.setScalar(1 + (1 - f) * 0.15);
      // shield bubble while shielded, pulsing when it goes up
      u.bubble.visible = p.shield > 0;
      if (u.bubble.visible) {
        const sinceShield = (now - u.shieldAt) / 1000;
        const pulse = sinceShield < 0.6 ? 1 + Math.sin(sinceShield / 0.6 * Math.PI) * 0.18 : 1;
        u.bubble.scale.setScalar(pulse);
        u.bubble.rotation.y = now / 1500;
        u.bubble.children[0].material.opacity = 0.1 + 0.08 * (p.shield / 100) + (sinceShield < 0.6 ? 0.15 : 0);
      }
    }
    for (const [id, ch] of this.players) if (!seen.has(id)) { this.scene.remove(ch); this.players.delete(id); }
  }

  syncBalls(world, now) {
    const since = Math.min(0.15, (now - world.snapAt) / 1000);
    const seen = new Set();
    for (const b of world.balls) {
      let m = this.balls.get(b[0]);
      if (!m) { m = mesh(G('ball', () => new THREE.SphereGeometry(F.SNOWBALL.radius, 12, 8)), toon(SNOW), 0, 0, 0, true, 1.12); this.balls.set(b[0], m); this.scene.add(m); }
      const z = (b[5] ?? 30) + (b[6] ?? 0) * since - 0.5 * F.SNOWBALL.gravity * since * since;
      m.position.set(b[1] + b[3] * since, Math.max(F.SNOWBALL.radius * 0.5, z), b[2] + b[4] * since);
      seen.add(b[0]);
    }
    for (const [id, m] of this.balls) if (!seen.has(id)) { this.scene.remove(m); this.balls.delete(id); }
  }

  syncPickups(world, now) {
    const seen = new Set();
    for (const k of world.pickups) {
      let g = this.pickups.get(k[0]);
      if (!g) { g = buildPickup(k[1]); g.position.set(k[2], k[4] || 0, k[3]); this.pickups.set(k[0], g); this.scene.add(g); }
      seen.add(k[0]);
      g.userData.item.position.y = 26 + Math.sin(now / 300 + k[0]) * 4;
      g.userData.item.rotation.y = now / 700;
      g.userData.ring.material.opacity = 0.55 + Math.sin(now / 200) * 0.3;
    }
    for (const [id, g] of this.pickups) if (!seen.has(id)) { this.scene.remove(g); this.pickups.delete(id); }
  }

  // If frames are slow, render fewer pixels (down to 60%) and stop the falling snow.
  adaptQuality(dt, now) {
    this.frameTimes.push(dt);
    if (now - this.lastQualityCheck < 2500) return;
    this.lastQualityCheck = now;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimes.length);
    this.frameTimes = [];
    if (avg > 1 / 32 && this.pixelRatio > 0.6) {
      this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.2);
      this.renderer.setPixelRatio(this.pixelRatio);
      if (this.size) this.renderer.setSize(this.size[0], this.size[1], false);
      if (this.snow && this.pixelRatio <= 0.8) { this.scene.remove(this.snow); this.snow = null; }
    }
  }

  render(world, cam, dt, now) {
    if (!this.ready) return;
    this.adaptQuality(dt, now);
    this.syncPlayers(world, now);
    this.syncBalls(world, now);
    this.syncPickups(world, now);

    // camera
    const eye = cam.z + F.EYE_HEIGHT + cam.bob;
    this.camera.position.set(cam.x, eye, cam.y);
    const cp = Math.cos(cam.pitch);
    this.camera.lookAt(cam.x + Math.cos(cam.yaw) * cp, eye + Math.sin(cam.pitch), cam.y + Math.sin(cam.yaw) * cp);
    const fov = 75 + cam.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 8); this.camera.updateProjectionMatrix(); }

    // trees and igloos fade when you're inside them, so you can see out
    const inside = cam.alive ? F.coverAt(cam.x, cam.y, cam.z) : -1;
    for (let i = 0; i < this.covers.length; i++) {
      const c = this.covers[i];
      const target = i === inside ? 0.12 : 1;
      if (c.alpha !== target) {
        c.alpha += (target - c.alpha) * Math.min(1, dt * 10);
        if (Math.abs(c.alpha - target) < 0.01) c.alpha = target;
        for (const m of c.mats) { m.opacity = c.alpha; m.depthWrite = c.alpha > 0.99; }
      }
    }

    // viewmodel: bob while walking, punch forward on a throw
    this.vm.visible = cam.alive;
    this.vmBall.visible = cam.ammo > 0;
    this.throwAnim = Math.max(0, this.throwAnim - dt * 5);
    const t = this.throwAnim;
    this.vm.position.set(this.vmBase.x - t * 2.5, this.vmBase.y + cam.bob * 0.25 + t * 1.8, this.vmBase.z - t * 4);

    // particles and floating text
    this.particles = this.particles.filter((p) => {
      p.t += dt;
      if (p.t >= p.life) { this.scene.remove(p.m); return false; }
      p.vy -= 600 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(1, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(1 - p.t / p.life * 0.6);
      return true;
    });
    this.fx = this.fx.filter((f) => {
      f.t += dt;
      if (f.t >= f.life) { this.scene.remove(f.s); return false; }
      if (f.t < 0) { f.s.visible = false; return true; }
      f.s.visible = true;
      f.s.position.y += dt * (f.rise || 40); f.s.material.opacity = 1 - f.t / f.life;
      return true;
    });

    if (this.live) for (const w of this.live.water) w.tex.offset.x -= w.speed * dt;
    if (this.snow) {
      this.snow.visible = F.ceilingAt(cam.x, cam.y, cam.z) === Infinity; // no snow under a roof or in the tunnel
      this.snow.position.set(cam.x, cam.z, cam.y);
      const a = this.snow.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 40; if (y < 0) y += 500;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
