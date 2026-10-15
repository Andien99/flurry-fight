// Shared map + physics, used by both the server (Node) and the browser.
(function (root) {
  // The arena is 1800 wide; a 300-wide strip on each side holds a two-storey lodge.
  const SHIFT = 300;
  const MAP = { width: 1800 + SHIFT * 2, height: 1300 };
  const BORDER = 26; // fence thickness around the arena
  const PLAYER_RADIUS = 22;
  const PLAYER_SPEED = 240;  // walking, units per second
  const RUN_SPEED = 380;     // holding Shift
  const PLAYER_HEIGHT = 56;  // hit box height
  const EYE_HEIGHT = 46;     // first-person camera height
  const JUMP_SPEED = 340;
  const GRAVITY = 1150;      // for players
  const JUMP_MAX = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY); // ≈ 50
  const MAX_HP = 100;
  const MAX_SHIELD = 100;
  const SNOWBALL = { speed: 820, radius: 8, life: 1.6, damage: 25, cooldown: 0.28, gravity: 320 };
  const RESPAWN_MS = 3000;
  const INVULN_MS = 2000;
  const REVEAL_DIST = 120;      // enemies this close can see you even in cover
  const REVEAL_THROW_MS = 1200; // throwing gives away your hiding spot
  const REVEAL_HIT_MS = 1000;   // so does getting hit
  const STEP_UP = 30;           // how high a step you can walk up (stairs)

  // What each kind of map object does. Positions are relative to the object's x, y.
  //   rects/circles: solid (block players and snowballs)
  //   cover: a radius you can walk into to hide (trees, igloos)
  //   top: height in world units (players can jump over anything lower than a jump)
  const KINDS = {
    pine:    { cover: 56, top: 170 },
    igloo:   { cover: 66, top: 70 },
    bare:    { circles: [[0, 0, 13]], top: 160 },
    mound:   { circles: [[-50, 2, 32], [50, 2, 32], [0, -4, 42]], top: 44 },
    moundS:  { circles: [[0, 0, 30]], top: 30 },
    snowman: { circles: [[0, 0, 24]], top: 100 },
    stump:   { circles: [[0, 0, 18]], top: 22 },
    crate:   { rects: [[-35, -30, 70, 60]], top: 62 },
    iceTall: { rects: [[-23, -50, 46, 100]], top: 110 },
    iceWide: { rects: [[-51, -27, 102, 54]], top: 56 },
    logpile: { rects: [[-32, -62, 64, 124]], top: 120 },
    post:    { rects: [[-16, -44, 32, 88]], top: 90 },
    bench:   { rects: [[-58, -14, 116, 28]], top: 30 },
    log:     { rects: [[-52, -14, 104, 28]], top: 28 },
    fenceH:  { rects: [[-34, -9, 68, 18]], top: 40 },
    fenceV:  { rects: [[-9, -65, 18, 130]], top: 40 },
  };

  // Arena layout.
  const OBJECTS = [
    // top band
    { k: 'mound', x: 211, y: 140 }, { k: 'log', x: 533, y: 142 },
    { k: 'fenceH', x: 795, y: 128 }, { k: 'fenceH', x: 902, y: 128 },
    { k: 'moundS', x: 1237, y: 142 }, { k: 'iceTall', x: 1651, y: 162 },
    // top-left grove + bare trees
    { k: 'pine', x: 250, y: 268 }, { k: 'pine', x: 320, y: 318 },
    { k: 'bare', x: 506, y: 318 }, { k: 'bare', x: 578, y: 282 }, { k: 'bare', x: 810, y: 372 },
    // birch posts
    { k: 'post', x: 967, y: 224 }, { k: 'post', x: 1049, y: 224 }, { k: 'post', x: 967, y: 362 }, { k: 'post', x: 1049, y: 362 },
    // top-right grove
    { k: 'pine', x: 1370, y: 255 }, { k: 'pine', x: 1410, y: 208 }, { k: 'pine', x: 1495, y: 228 }, { k: 'pine', x: 1450, y: 338 },
    { k: 'stump', x: 1548, y: 345 }, { k: 'snowman', x: 1671, y: 410 },
    // middle band
    { k: 'bench', x: 384, y: 492 }, { k: 'snowman', x: 193, y: 590 }, { k: 'stump', x: 441, y: 585 },
    { k: 'bare', x: 938, y: 578 }, { k: 'igloo', x: 1201, y: 500 },
    { k: 'crate', x: 1519, y: 580 }, { k: 'crate', x: 1597, y: 580 },
    { k: 'logpile', x: 352, y: 706 }, { k: 'logpile', x: 459, y: 706 },
    { k: 'pine', x: 690, y: 770 }, { k: 'pine', x: 738, y: 728 },
    { k: 'iceWide', x: 979, y: 746 }, { k: 'iceWide', x: 1083, y: 746 },
    { k: 'mound', x: 1362, y: 702 },
    { k: 'iceTall', x: 1590, y: 785 }, { k: 'iceTall', x: 1590, y: 922 },
    { k: 'mound', x: 193, y: 822 }, { k: 'moundS', x: 270, y: 858 },
    { k: 'moundS', x: 899, y: 866 }, { k: 'stump', x: 1283, y: 850 }, { k: 'stump', x: 166, y: 958 },
    // bottom-left grove
    { k: 'pine', x: 357, y: 985 }, { k: 'pine', x: 456, y: 1015 }, { k: 'pine', x: 420, y: 1068 }, { k: 'pine', x: 335, y: 1075 },
    { k: 'fenceV', x: 229, y: 1092 }, { k: 'log', x: 428, y: 1178 },
    { k: 'bare', x: 111, y: 1176 }, { k: 'bare', x: 158, y: 1150 },
    // igloo village
    { k: 'snowman', x: 640, y: 1032 }, { k: 'igloo', x: 750, y: 1015 }, { k: 'igloo', x: 928, y: 1015 }, { k: 'igloo', x: 838, y: 1138 },
    { k: 'snowman', x: 1024, y: 1190 },
    // bottom-right
    { k: 'mound', x: 1528, y: 1150 }, { k: 'mound', x: 1622, y: 1104 },
  ];

  // Ground layers: rounded rectangles that merge into blobs.
  const GRASS = [
    [196, 222, 165, 170, 34], [150, 250, 120, 120, 30],
    [1313, 172, 262, 142, 34], [1378, 290, 140, 112, 30], [1320, 280, 90, 70, 26],
    [232, 936, 175, 150, 34], [270, 1010, 255, 200, 34], [232, 1060, 120, 120, 30],
  ];
  const PONDS = [
    [692, 214, 88, 80, 26], [712, 196, 52, 44, 18],
    [590, 432, 150, 92, 30], [650, 470, 136, 114, 30], [620, 500, 70, 60, 22],
    [1126, 1000, 200, 180, 34], [1180, 936, 150, 120, 30], [1260, 1020, 116, 120, 30], [1150, 1100, 120, 86, 26],
  ];

  // Move the arena layout right to make room for the lodges.
  for (const o of OBJECTS) o.x += SHIFT;
  for (const g of GRASS) g[0] += SHIFT;
  for (const p of PONDS) p[0] += SHIFT;

  // ---------- lodges: two storeys, a roof deck and an outside staircase ----------
  // Boxes are solid blocks with a bottom and top height. Slabs are floors you can stand on.
  const FLOOR = 96, DECK = 104, PARAPET = 128;
  const LEFT_LODGE = {
    boxes: [
      // ground-floor walls (with a door and windows facing the arena)
      [50, 470, 12, 360, 0, FLOOR, 'wall'],
      [50, 470, 70, 12, 0, FLOOR, 'wall'], [120, 470, 60, 12, 0, 34, 'wall'], [120, 470, 60, 12, 70, FLOOR, 'wall'], [180, 470, 70, 12, 0, FLOOR, 'wall'],
      [50, 818, 200, 12, 0, FLOOR, 'wall'],
      [238, 482, 12, 28, 0, FLOOR, 'wall'],
      [238, 510, 12, 50, 0, 34, 'wall'], [238, 510, 12, 50, 70, FLOOR, 'wall'],
      [238, 560, 12, 50, 0, FLOOR, 'wall'],
      [238, 610, 12, 80, 80, FLOOR, 'wall'],
      [238, 690, 12, 50, 0, FLOOR, 'wall'],
      [238, 740, 12, 50, 0, 34, 'wall'], [238, 740, 12, 50, 70, FLOOR, 'wall'],
      [238, 790, 12, 28, 0, FLOOR, 'wall'],
      // roof deck
      [50, 470, 200, 360, FLOOR, DECK, 'slab'],
      // parapet round the deck: a gap at the top of the stairs and a jump-off gap facing the arena
      [50, 470, 200, 8, DECK, PARAPET, 'parapet'], [50, 470, 8, 360, DECK, PARAPET, 'parapet'],
      [242, 470, 8, 130, DECK, PARAPET, 'parapet'], [242, 700, 8, 130, DECK, PARAPET, 'parapet'],
      [130, 822, 120, 8, DECK, PARAPET, 'parapet'],
    ],
    // stairs along the outside of the south wall: ground level at x 250, deck level from x 110 to 62
    ramp: { x: 62, y: 834, w: 188, h: 48, lowX: 250, highX: 110, top: DECK },
    crates: [[100, 530], [100, 770]],
    pickup: { x: 150, y: 650, z: DECK },
  };
  const mirrorBox = ([x, y, w, h, b, t, k]) => [MAP.width - x - w, y, w, h, b, t, k];
  const RIGHT_LODGE = {
    boxes: LEFT_LODGE.boxes.map(mirrorBox),
    ramp: { ...LEFT_LODGE.ramp, x: MAP.width - LEFT_LODGE.ramp.x - LEFT_LODGE.ramp.w, lowX: MAP.width - LEFT_LODGE.ramp.lowX, highX: MAP.width - LEFT_LODGE.ramp.highX },
    crates: LEFT_LODGE.crates.map(([x, y]) => [MAP.width - x, y]),
    pickup: { ...LEFT_LODGE.pickup, x: MAP.width - LEFT_LODGE.pickup.x },
  };
  const LODGES = [LEFT_LODGE, RIGHT_LODGE];
  for (const L of LODGES) for (const [x, y] of L.crates) OBJECTS.push({ k: 'crate', x, y });
  // a little cover in the lodge strips
  OBJECTS.push({ k: 'pine', x: 160, y: 250 }, { k: 'mound', x: 160, y: 1060 }, { k: 'snowman', x: 230, y: 960 },
    { k: 'pine', x: MAP.width - 160, y: 250 }, { k: 'mound', x: MAP.width - 160, y: 1060 }, { k: 'snowman', x: MAP.width - 230, y: 960 });
  const RAMPS = LODGES.map((L) => L.ramp);
  const SLABS = [];

  function rampHeight(r, x) {
    const t = (x - r.lowX) / (r.highX - r.lowX);
    return clamp(t, 0, 1) * r.top;
  }

  // Build collision + cover lists from the objects and the fence.
  const WALL = 1e6;
  const RECTS = [
    { x: 0, y: 0, w: MAP.width, h: BORDER, top: WALL }, { x: 0, y: MAP.height - BORDER, w: MAP.width, h: BORDER, top: WALL },
    { x: 0, y: 0, w: BORDER, h: MAP.height, top: WALL }, { x: MAP.width - BORDER, y: 0, w: BORDER, h: MAP.height, top: WALL },
  ];
  const CIRCLES = [];
  const COVERS = [];
  for (const L of LODGES) for (const [x, y, w, h, bottom, top, kind] of L.boxes) {
    const b = { x, y, w, h, bottom, top, kind };
    RECTS.push(b);
    if (kind === 'slab') SLABS.push(b);
  }
  OBJECTS.forEach((o, i) => {
    const def = KINDS[o.k];
    for (const [dx, dy, w, h] of def.rects || []) RECTS.push({ x: o.x + dx, y: o.y + dy, w, h, top: def.top });
    for (const [dx, dy, r] of def.circles || []) CIRCLES.push({ x: o.x + dx, y: o.y + dy, r, top: def.top });
    if (def.cover) COVERS.push({ x: o.x, y: o.y, r: def.cover, obj: i });
  });

  const SPAWNS = {
    any: [
      { x: 80, y: 80 }, { x: 1720, y: 80 }, { x: 70, y: 1225 }, { x: 1725, y: 1220 }, { x: 650, y: 70 },
      { x: 1120, y: 80 }, { x: 70, y: 420 }, { x: 1728, y: 640 }, { x: 560, y: 1230 }, { x: 1180, y: 1235 },
      { x: 860, y: 520 }, { x: 1150, y: 640 },
    ],
    blue: [{ x: 70, y: 420 }, { x: 70, y: 690 }, { x: 80, y: 80 }, { x: 70, y: 1050 }, { x: 70, y: 1230 }],
    red: [{ x: 1728, y: 500 }, { x: 1728, y: 700 }, { x: 1720, y: 80 }, { x: 1728, y: 1000 }, { x: 1725, y: 1230 }],
  };

  const PICKUP_SPOTS = [
    { x: 1140, y: 400 }, { x: 860, y: 640 }, { x: 560, y: 880 }, { x: 1180, y: 840 },
    { x: 1460, y: 900 }, { x: 1010, y: 1080 }, { x: 640, y: 330 },
  ];
  for (const list of [SPAWNS.any, SPAWNS.blue, SPAWNS.red, PICKUP_SPOTS]) for (const p of list) p.x += SHIFT;
  SPAWNS.any.push({ x: 150, y: 150 }, { x: 150, y: 1180 }, { x: MAP.width - 150, y: 150 }, { x: MAP.width - 150, y: 1180 });
  SPAWNS.blue.push({ x: 150, y: 150 }, { x: 150, y: 1180 });
  SPAWNS.red.push({ x: MAP.width - 150, y: 150 }, { x: MAP.width - 150, y: 1180 });
  for (const L of LODGES) PICKUP_SPOTS.push({ ...L.pickup });

  const PICKUP_TYPES = {
    shield: { label: 'Shield Can', radius: 18 },
    cocoa: { label: 'Hot Cocoa', radius: 18 },
    snow: { label: 'Snow Pile', radius: 18 },
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  const inRect = (x, y, o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;

  // The floor under a player at (x, y) whose feet are at z: the ground, a roof deck or the
  // stairs, whichever is highest without being more than a step above their feet.
  function groundAt(x, y, z = 0) {
    let g = 0;
    for (const s of SLABS) if (inRect(x, y, s) && s.top <= z + STEP_UP && s.top > g) g = s.top;
    for (const r of RAMPS) if (inRect(x, y, r)) { const h = rampHeight(r, x); if (h <= z + STEP_UP && h > g) g = h; }
    return g;
  }
  // The highest floor at (x, y), used by the server to sanity-check heights.
  function highestFloorAt(x, y) {
    let g = 0;
    for (const s of SLABS) if (inRect(x, y, s)) g = Math.max(g, s.top);
    for (const r of RAMPS) if (inRect(x, y, r)) g = Math.max(g, rampHeight(r, x));
    return g;
  }
  // The underside of a floor above a player's head (or Infinity), so jumping indoors bumps the ceiling.
  function ceilingAt(x, y, z) {
    let c = Infinity;
    for (const s of SLABS) if (inRect(x, y, s) && s.bottom >= z + PLAYER_HEIGHT - 2 && s.bottom < c) c = s.bottom;
    return c;
  }

  // Vertical movement for one frame: stand on floors, walk up and down stairs, jump, fall,
  // and bump your head on ceilings. `p` has x, y, z, vz and grounded; call after moving x and y.
  function settle(p, dt, wantJump) {
    const ground = groundAt(p.x, p.y, p.z);
    const stickDown = p.grounded && p.vz <= 0 && p.z - ground <= STEP_UP; // stay on the stairs going down
    if ((p.z <= ground + 0.5 || stickDown) && p.vz <= 0) {
      p.z = ground; p.vz = 0; p.grounded = true;
      if (wantJump) { p.vz = JUMP_SPEED; p.grounded = false; }
    } else p.grounded = false;
    if (!p.grounded) {
      const ceiling = ceilingAt(p.x, p.y, p.z);
      p.vz -= GRAVITY * dt;
      p.z += p.vz * dt;
      if (p.z + PLAYER_HEIGHT > ceiling) { p.z = ceiling - PLAYER_HEIGHT; p.vz = Math.min(0, p.vz); }
      const g = groundAt(p.x, p.y, Math.max(p.z, ground));
      if (p.z <= g) { p.z = g; p.vz = 0; p.grounded = true; }
    }
    return p;
  }

  // Push a circle (x, y, r) out of every obstacle and keep it inside the map.
  // z is how high the player's feet are: anything lower than that is jumped over, and
  // anything entirely above their head (a ceiling) is walked under.
  function resolveCollisions(x, y, r, z = 0) {
    for (let pass = 0; pass < 3; pass++) {
      for (const o of RECTS) {
        if (o.top <= z + 0.5) continue;
        if ((o.bottom || 0) >= z + PLAYER_HEIGHT) continue;
        const cx = clamp(x, o.x, o.x + o.w);
        const cy = clamp(y, o.y, o.y + o.h);
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 === 0) {
            const left = x - o.x, right = o.x + o.w - x, top = y - o.y, bottom = o.y + o.h - y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) x = o.x - r; else if (m === right) x = o.x + o.w + r;
            else if (m === top) y = o.y - r; else y = o.y + o.h + r;
          } else {
            const d = Math.sqrt(d2);
            x = cx + (dx / d) * r;
            y = cy + (dy / d) * r;
          }
        }
      }
      for (const c of CIRCLES) {
        if (c.top <= z) continue;
        const dx = x - c.x, dy = y - c.y;
        const min = r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.001;
          x = c.x + (dx / d) * min;
          y = c.y + (dy / d) * min;
        }
      }
      for (const o of RAMPS) {
        // the staircase is a solid block except where it's no more than a step above your feet
        const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
        if (rampHeight(o, cx) <= z + STEP_UP) continue;
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 === 0) {
          const left = x - o.x, right = o.x + o.w - x, top = y - o.y, bottom = o.y + o.h - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = o.x - r; else if (m === right) x = o.x + o.w + r;
          else if (m === top) y = o.y - r; else y = o.y + o.h + r;
        } else { const d = Math.sqrt(d2); x = cx + (dx / d) * r; y = cy + (dy / d) * r; }
      }
      x = clamp(x, r, MAP.width - r);
      y = clamp(y, r, MAP.height - r);
    }
    return { x, y };
  }

  // True if a small circle at ground level overlaps any solid obstacle or the map edge.
  function blocked(x, y, r) {
    if (x < r || y < r || x > MAP.width - r || y > MAP.height - r) return true;
    for (const o of RAMPS) {
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    for (const o of RECTS) {
      if ((o.bottom || 0) >= PLAYER_HEIGHT) continue;
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    for (const c of CIRCLES) {
      const dx = x - c.x, dy = y - c.y, m = r + c.r;
      if (dx * dx + dy * dy < m * m) return true;
    }
    return false;
  }

  // Does a snowball at height z hit the ground, an object or the fence?
  function blocked3D(x, y, z, r) {
    if (z <= 0) return true;
    if (x < BORDER || y < BORDER || x > MAP.width - BORDER || y > MAP.height - BORDER) return true;
    for (const o of RECTS) {
      if (z - r >= o.top || z + r <= (o.bottom || 0)) continue;
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    for (const o of RAMPS) if (inRect(x, y, o) && z - r < rampHeight(o, x)) return true;
    for (const c of CIRCLES) {
      if (z - r >= c.top) continue;
      const m = r + c.r;
      if ((x - c.x) ** 2 + (y - c.y) ** 2 < m * m) return true;
    }
    return false;
  }

  // Index of the cover (tree canopy / igloo) the point is inside, or -1.
  function coverAt(x, y) {
    for (let i = 0; i < COVERS.length; i++) {
      const c = COVERS[i];
      if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) return i;
    }
    return -1;
  }

  function inRoundRect(x, y, r) {
    const [rx, ry, w, h, rad] = r;
    if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
    const cx = clamp(x, rx + rad, rx + w - rad), cy = clamp(y, ry + rad, ry + h - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  }
  function onIce(x, y) { return PONDS.some((p) => inRoundRect(x, y, p)); }

  // Character customisation
  const HATS = [
    { id: 'beanie', label: 'Beanie' }, { id: 'tophat', label: 'Top hat' }, { id: 'cowboy', label: 'Cowboy hat' },
    { id: 'crown', label: 'Crown' }, { id: 'viking', label: 'Viking helmet' }, { id: 'earmuffs', label: 'Earmuffs' },
    { id: 'propeller', label: 'Propeller cap' }, { id: 'none', label: 'No hat' },
  ];
  const STACHES = [
    { id: 'none', label: 'None' }, { id: 'classic', label: 'Classic' }, { id: 'handlebar', label: 'Handlebar' },
    { id: 'walrus', label: 'Walrus' }, { id: 'pencil', label: 'Pencil' }, { id: 'curly', label: 'Curly' },
  ];
  function cleanLook(l = {}) {
    return {
      hat: HATS.some((h) => h.id === l.hat) ? l.hat : 'beanie',
      stache: STACHES.some((m) => m.id === l.stache) ? l.stache : 'none',
    };
  }

  const PLAYER_COLOURS = ['#e85d75', '#f29e4c', '#f1c453', '#7ac74f', '#2ec4b6', '#3a86ff', '#8e6cf0', '#ff70a6', '#6d9dc5', '#a0522d'];
  const TEAM_COLOURS = { blue: '#2f6fe4', red: '#e2453c' };

  const api = {
    MAP, SHIFT, BORDER, STEP_UP, LODGES, RAMPS, SLABS, rampHeight, groundAt, highestFloorAt, ceilingAt, settle, PLAYER_RADIUS, PLAYER_SPEED, RUN_SPEED, PLAYER_HEIGHT, EYE_HEIGHT, JUMP_SPEED, GRAVITY, JUMP_MAX,
    MAX_HP, MAX_SHIELD, SNOWBALL, RESPAWN_MS, INVULN_MS,
    REVEAL_DIST, REVEAL_THROW_MS, REVEAL_HIT_MS,
    HATS, STACHES, cleanLook,
    KINDS, OBJECTS, GRASS, PONDS, RECTS, CIRCLES, COVERS, SPAWNS, PICKUP_SPOTS, PICKUP_TYPES, PLAYER_COLOURS, TEAM_COLOURS,
    resolveCollisions, blocked, blocked3D, coverAt, onIce, clamp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FF = api;
})(typeof window !== 'undefined' ? window : globalThis);
