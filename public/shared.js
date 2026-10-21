// Shared maps + physics, used by both the server (Node) and the browser.
// Each map is its own "world": its layout plus collision functions bound to it.
// The server keeps one world per game (FF.world(id)); a browser switches the current
// map with FF.useMap(id), after which FF.OBJECTS, FF.resolveCollisions and so on
// refer to that map.
(function (root) {
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
  //   cover: a radius you can walk into to hide (trees, igloos, lockers, bins, snow piles)
  //   top: height in world units (players can jump over anything lower than a jump)
  // An object can sit on a lower floor (the canal) with `z`.
  const KINDS = {
    pine:    { cover: 56, top: 170 },
    igloo:   { cover: 66, top: 70 },
    bare:    { circles: [[0, 0, 13]], top: 160 },
    mound:   { circles: [[-50, 2, 32], [50, 2, 32], [0, -4, 42]], top: 44 },
    moundS:  { circles: [[0, 0, 30]], top: 30 },
    snowman: { circles: [[0, 0, 24]], top: 100 },
    stump:   { circles: [[0, 0, 18]], top: 22 },
    crate:   { rects: [[-35, -30, 70, 60]], top: 62 },
    crateS:  { rects: [[-24, -20, 48, 40]], top: 44 },
    iceTall: { rects: [[-23, -50, 46, 100]], top: 110 },
    iceWide: { rects: [[-51, -27, 102, 54]], top: 56 },
    logpile: { rects: [[-32, -62, 64, 124]], top: 120 },
    post:    { rects: [[-16, -44, 32, 88]], top: 90 },
    bench:   { rects: [[-58, -14, 116, 28]], top: 30 },
    log:     { rects: [[-52, -14, 104, 28]], top: 28 },
    fenceH:  { rects: [[-34, -9, 68, 18]], top: 40 },
    fenceV:  { rects: [[-9, -65, 18, 130]], top: 40 },
    // Snow Village
    locker:  { cover: 27, top: 104 },          // step inside a school locker
    bin:     { cover: 40, top: 62 },           // climb into a big wheelie dumpster
    drift:   { cover: 54, top: 70 },           // burrow into a deep snow pile
    lamp:    { circles: [[0, 0, 7]], top: 150 },
    stall:   { rects: [[-52, -26, 104, 52]], top: 76 },
    desk:    { rects: [[-28, -18, 56, 36]], top: 30 },
    hydrant: { circles: [[0, 0, 10]], top: 34 },
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  const inRect = (x, y, o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
  function inRoundRect(x, y, r) {
    const [rx, ry, w, h, rad] = r;
    if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
    const cx = clamp(x, rx + rad, rx + w - rad), cy = clamp(y, ry + rad, ry + h - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  }
  // Height of a ramp (stairs, a bridge approach) at a point. Ramps run along x or y,
  // from height h0 at coordinate a0 to h1 at a1, and can go down into the canal too.
  function rampHeight(r, x, y) {
    const c = r.axis === 'y' ? y : x;
    const t = clamp((c - r.a0) / (r.a1 - r.a0), 0, 1);
    return r.h0 + t * (r.h1 - r.h0);
  }

  // ---------- building a world from a map description ----------
  function buildWorld(def) {
    const MAP = def.MAP;
    const OBJECTS = def.objects;
    const PITS = def.pits || [];        // sunken floors: { x, y, w, h, floor }
    const RAMPS = def.ramps || [];
    const SLABS = [];
    const ICE = (def.ponds || []).map((p) => ({ round: p, z: 0 })).concat((def.ice || []).map((r) => ({ ...r })));
    const WATER = def.water || [];

    const WALL = 1e6;
    const RECTS = [
      { x: 0, y: 0, w: MAP.width, h: BORDER, top: WALL, bottom: -WALL }, { x: 0, y: MAP.height - BORDER, w: MAP.width, h: BORDER, top: WALL, bottom: -WALL },
      { x: 0, y: 0, w: BORDER, h: MAP.height, top: WALL, bottom: -WALL }, { x: MAP.width - BORDER, y: 0, w: BORDER, h: MAP.height, top: WALL, bottom: -WALL },
    ];
    const CIRCLES = [];
    const COVERS = [];
    // Boxes: [x, y, w, h, bottom, top, kind]. 'slab'-like kinds are floors you can stand on.
    const FLOOR_KINDS = new Set(['slab', 'street', 'bridge', 'roof']);
    const BOXES = [];
    for (const L of def.lodges || []) BOXES.push(...L.boxes);
    BOXES.push(...(def.boxes || []));
    for (const H of def.houses || []) BOXES.push(...H.boxes);
    for (const [x, y, w, h, bottom, top, kind] of BOXES) {
      const b = { x, y, w, h, bottom, top, kind };
      RECTS.push(b);
      if (FLOOR_KINDS.has(kind)) SLABS.push(b);
    }
    OBJECTS.forEach((o, i) => {
      const def2 = KINDS[o.k];
      const z = o.z || 0;
      const turned = o.rotY && Math.abs(Math.sin(o.rotY)) > 0.7; // a quarter turn swaps the footprint
      for (const [dx, dy, w, h] of def2.rects || []) {
        if (turned) RECTS.push({ x: o.x + dy, y: o.y + dx, w: h, h: w, top: z + def2.top, bottom: z });
        else RECTS.push({ x: o.x + dx, y: o.y + dy, w, h, top: z + def2.top, bottom: z });
      }
      for (const [dx, dy, r] of def2.circles || []) CIRCLES.push({ x: o.x + dx, y: o.y + dy, r, top: z + def2.top, bottom: z });
      if (def2.cover) COVERS.push({ x: o.x, y: o.y, r: o.cover || def2.cover, z, obj: i });
    });

    // The natural ground at a point: 0, or the bottom of the canal / a stairwell.
    function baseFloorAt(x, y) {
      let f = 0;
      for (const p of PITS) if (inRect(x, y, p) && p.floor < f) f = p.floor;
      return f;
    }
    // The floor under a player at (x, y) whose feet are at z: the ground, a deck, a bridge or
    // the stairs, whichever is highest without being more than a step above their feet.
    function groundAt(x, y, z = 0) {
      let g = baseFloorAt(x, y);
      for (const s of SLABS) if (inRect(x, y, s) && s.top <= z + STEP_UP && s.top > g) g = s.top;
      for (const r of RAMPS) if (inRect(x, y, r)) { const h = rampHeight(r, x, y); if (h <= z + STEP_UP && h > g) g = h; }
      return g;
    }
    // The highest floor at (x, y), used by the server to sanity-check heights.
    function highestFloorAt(x, y) {
      let g = baseFloorAt(x, y);
      for (const s of SLABS) if (inRect(x, y, s)) g = Math.max(g, s.top);
      for (const r of RAMPS) if (inRect(x, y, r)) g = Math.max(g, rampHeight(r, x, y));
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

    function pushOutOfRect(x, y, r, o) {
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return null;
      if (d2 === 0) {
        const left = x - o.x, right = o.x + o.w - x, top = y - o.y, bottom = o.y + o.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) return { x: o.x - r, y }; if (m === right) return { x: o.x + o.w + r, y };
        if (m === top) return { x, y: o.y - r }; return { x, y: o.y + o.h + r };
      }
      const d = Math.sqrt(d2);
      return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
    }

    // Push a circle (x, y, r) out of every obstacle and keep it inside the map.
    // z is how high the player's feet are: anything lower than that is jumped over, and
    // anything entirely above their head (a ceiling, a bridge) is walked under.
    function resolveCollisions(x, y, r, z = 0) {
      for (let pass = 0; pass < 3; pass++) {
        for (const o of RECTS) {
          if (o.top <= z + 0.5) continue;
          if ((o.bottom || 0) >= z + PLAYER_HEIGHT) continue;
          const q = pushOutOfRect(x, y, r, o);
          if (q) { x = q.x; y = q.y; }
        }
        for (const c of CIRCLES) {
          if (c.top <= z) continue;
          if ((c.bottom || 0) >= z + PLAYER_HEIGHT) continue;
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
          // a staircase is a solid block except where it's no more than a step above your feet
          const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
          if (rampHeight(o, cx, cy) <= z + STEP_UP) continue;
          if (Math.min(o.h0, o.h1) >= z + PLAYER_HEIGHT) continue; // the whole ramp is overhead
          const q = pushOutOfRect(x, y, r, o);
          if (q) { x = q.x; y = q.y; }
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
        if ((o.bottom || 0) >= PLAYER_HEIGHT || o.top <= 0) continue;
        const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy < r * r) return true;
      }
      for (const c of CIRCLES) {
        if (c.top <= 0) continue;
        const dx = x - c.x, dy = y - c.y, m = r + c.r;
        if (dx * dx + dy * dy < m * m) return true;
      }
      return false;
    }

    // Does a snowball at height z hit the ground, an object or the fence?
    function blocked3D(x, y, z, r) {
      if (z <= baseFloorAt(x, y)) return true;
      if (x < BORDER || y < BORDER || x > MAP.width - BORDER || y > MAP.height - BORDER) return true;
      for (const o of RECTS) {
        if (z - r >= o.top || z + r <= (o.bottom || 0)) continue;
        const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
      // stairs are solid from the floor below up to their surface
      for (const o of RAMPS) if (inRect(x, y, o) && z - r < rampHeight(o, x, y)) return true;
      for (const c of CIRCLES) {
        if (z - r >= c.top || z + r <= (c.bottom || 0)) continue;
        const m = r + c.r;
        if ((x - c.x) ** 2 + (y - c.y) ** 2 < m * m) return true;
      }
      return false;
    }

    // Index of the cover (tree, igloo, locker, bin, snow pile) the point is inside, or -1.
    // Cover only counts on its own floor, so the canal tunnel under the village tree isn't hidden.
    function coverAt(x, y, z = 0) {
      for (let i = 0; i < COVERS.length; i++) {
        const c = COVERS[i];
        if (z < c.z - 30 || z > c.z + 40) continue;
        if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) return i;
      }
      return -1;
    }

    // Slippery ice (frozen ponds and the frozen canal), on the floor at height z.
    function onIce(x, y, z = 0) {
      for (const s of ICE) {
        if (Math.abs(z - s.z) > 2) continue;
        if (s.round ? inRoundRect(x, y, s.round) : inRect(x, y, s)) return true;
      }
      return false;
    }
    // Flowing water (the canal under the village square): slows you and carries you along.
    function waterAt(x, y, z = 0) {
      for (const w of WATER) if (Math.abs(z - w.z) <= 2 && inRect(x, y, w)) return w;
      return null;
    }

    return {
      id: def.id, name: def.name, theme: def.theme || def.id,
      MAP, SHIFT: def.shift || 0, LODGES: def.lodges || [], HOUSES: def.houses || [], BOXES, PITS, HOLES: def.holes || [], RAMPS, SLABS,
      OBJECTS, GRASS: def.grass || [], PONDS: def.ponds || [], ICE, WATER, ROADS: def.roads || [], DECOR: def.decor || [], SIGNS: def.signs || [],
      RECTS, CIRCLES, COVERS, SPAWNS: def.spawns, PICKUP_SPOTS: def.pickups,
      baseFloorAt, groundAt, highestFloorAt, ceilingAt, settle, resolveCollisions, blocked, blocked3D, coverAt, onIce, waterAt,
      rampHeight,
    };
  }

  // ======================= Map 1: Snowy Meadow (the original arena) =======================
  function meadowDef() {
    // The arena is 1800 wide; a 300-wide strip on each side holds a two-storey lodge.
    const SHIFT = 300;
    const MAP = { width: 1800 + SHIFT * 2, height: 1300 };
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
    for (const L of LODGES) {
      const r = L.ramp;
      Object.assign(r, { axis: 'x', a0: r.lowX, a1: r.highX, h0: 0, h1: r.top });
      for (const [x, y] of L.crates) OBJECTS.push({ k: 'crate', x, y });
    }
    // a little cover in the lodge strips
    OBJECTS.push({ k: 'pine', x: 160, y: 250 }, { k: 'mound', x: 160, y: 1060 }, { k: 'snowman', x: 230, y: 960 },
      { k: 'pine', x: MAP.width - 160, y: 250 }, { k: 'mound', x: MAP.width - 160, y: 1060 }, { k: 'snowman', x: MAP.width - 230, y: 960 });

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

    const DECOR = [[362, 200], [426, 164], [160, 462], [1104, 620], [560, 984], [1300, 420], [1690, 300], [96, 1010], [1260, 1240], [820, 300]]
      .map(([x, y]) => [x + SHIFT, y]);

    return {
      id: 'meadow', name: 'Snowy Meadow', MAP, shift: SHIFT, objects: OBJECTS, grass: GRASS, ponds: PONDS, lodges: LODGES,
      ramps: LODGES.map((L) => L.ramp), spawns: SPAWNS, pickups: PICKUP_SPOTS, decor: DECOR,
    };
  }

  // ======================= Map 2: Snow Village =======================
  // A snowy village split by a canal. The canal is sunk below the streets: steps lead down at
  // each end and from the village square, two bridges cross it, and in the middle it runs
  // underground through a tunnel beneath the square, where the water still flows.
  function villageDef() {
    const MAP = { width: 2400, height: 1400 };
    const D = -72;    // canal towpaths (deeper than a jump, so you need the steps to get out)
    const CH = -80;   // the water channel down the middle of the canal
    const EARTH = 'earth';
    const CANAL = { x: 260, y: 630, w: 1880, h: 140 };   // towpaths 40 wide either side of the channel
    const TUNNEL = { x0: 900, x1: 1500 };          // covered by the village square
    const WELL = { x: 1150, w: 100 };              // stairwells from the square down to the tunnel
    const pits = [
      { ...CANAL, floor: D },
      { x: 380, y: 670, w: 1640, h: 60, floor: CH }, // channel
      { x: WELL.x, y: 510, w: WELL.w, h: 120, floor: D },
      { x: WELL.x, y: 770, w: WELL.w, h: 120, floor: D },
    ];
    // where the ground is open to the sky (cut out of the street surface in 3D)
    const holes = [
      [CANAL.x, CANAL.y, TUNNEL.x0 - CANAL.x, CANAL.h],
      [TUNNEL.x1, CANAL.y, CANAL.x + CANAL.w - TUNNEL.x1, CANAL.h],
      [WELL.x, 510, WELL.w, 120], [WELL.x, 770, WELL.w, 120],
    ];
    const ramps = [
      // broad steps down into the canal at both ends
      { x: 260, y: 630, w: 120, h: 140, axis: 'x', a0: 260, a1: 380, h0: 0, h1: D, kind: 'steps' },
      { x: 2020, y: 630, w: 120, h: 140, axis: 'x', a0: 2140, a1: 2020, h0: 0, h1: D, kind: 'steps' },
      // stairwells from the village square into the tunnel (a flat landing at the bottom)
      { x: WELL.x, y: 510, w: WELL.w, h: 90, axis: 'y', a0: 510, a1: 600, h0: 0, h1: D, kind: 'steps' },
      { x: WELL.x, y: 800, w: WELL.w, h: 90, axis: 'y', a0: 890, a1: 800, h0: 0, h1: D, kind: 'steps' },
    ];
    const boxes = [
      // the village square is the roof of the tunnel
      [TUNNEL.x0, CANAL.y, TUNNEL.x1 - TUNNEL.x0, CANAL.h, -12, 0, 'street'],
      // canal walls (solid earth below street level, so you can't climb out without the steps)
      [260, 600, WELL.x - 260, 30, D, 0, EARTH], [WELL.x + WELL.w, 600, 2140 - WELL.x - WELL.w, 30, D, 0, EARTH],
      [260, 770, WELL.x - 260, 30, D, 0, EARTH], [WELL.x + WELL.w, 770, 2140 - WELL.x - WELL.w, 30, D, 0, EARTH],
      [WELL.x - 30, 510, 30, 120, D, 0, EARTH], [WELL.x + WELL.w, 510, 30, 120, D, 0, EARTH],
      [WELL.x - 30, 770, 30, 120, D, 0, EARTH], [WELL.x + WELL.w, 770, 30, 120, D, 0, EARTH],
      // stone pillars at the tunnel mouths
      [TUNNEL.x0 - 5, 630, 10, 8, D, 0, 'pillar'], [TUNNEL.x0 - 5, 762, 10, 8, D, 0, 'pillar'],
      [TUNNEL.x1 - 5, 630, 10, 8, D, 0, 'pillar'], [TUNNEL.x1 - 5, 762, 10, 8, D, 0, 'pillar'],
      // railings round the stairwell openings
      [WELL.x - 8, 510, 8, 120, 0, 36, 'rail'], [WELL.x + WELL.w, 510, 8, 120, 0, 36, 'rail'], [WELL.x, 624, WELL.w, 6, 0, 36, 'rail'],
      [WELL.x - 8, 770, 8, 120, 0, 36, 'rail'], [WELL.x + WELL.w, 770, 8, 120, 0, 36, 'rail'], [WELL.x, 770, WELL.w, 6, 0, 36, 'rail'],
    ];
    // two arched footbridges: a ramp up from each bank to a deck over the canal
    const BRIDGE_TOP = 22;
    const bridges = [560, 1740].map((bx) => ({ x: bx, w: 100 }));
    for (const b of bridges) {
      // each approach reaches deck height a player's width before the deck (a flat landing)
      ramps.push({ x: b.x, y: 550, w: b.w, h: 80, axis: 'y', a0: 550, a1: 602, h0: 0, h1: BRIDGE_TOP, kind: 'bridge' });
      ramps.push({ x: b.x, y: 770, w: b.w, h: 80, axis: 'y', a0: 850, a1: 798, h0: 0, h1: BRIDGE_TOP, kind: 'bridge' });
      boxes.push([b.x, 630, b.w, 140, 10, BRIDGE_TOP, 'bridge']);
      boxes.push([b.x, 630, 8, 140, BRIDGE_TOP, BRIDGE_TOP + 30, 'rail'], [b.x + b.w - 8, 630, 8, 140, BRIDGE_TOP, BRIDGE_TOP + 30, 'rail']);
    }

    // ---- enterable buildings ----
    // The village school: lockers along the back wall, desks, a chalkboard. Doors on three sides,
    // windows you can throw through.
    const S0 = { x: 950, y: 90, w: 500, h: 290 }, SW = 12, SH = 110, SILL = 34, HEAD = 74, SROOF = 100;
    const sx1 = S0.x + S0.w, sy1 = S0.y + S0.h;
    const school = [
      // north wall (solid, lockers in front of it)
      [S0.x, S0.y, S0.w, SW, 0, SH, 'brick'],
      // south wall: door in the middle, a window either side
      [S0.x, sy1 - SW, 70, SW, 0, SH, 'brick'], [S0.x + 70, sy1 - SW, 70, SW, 0, SILL, 'brick'], [S0.x + 70, sy1 - SW, 70, SW, HEAD, SH, 'brick'],
      [S0.x + 140, sy1 - SW, 80, SW, 0, SH, 'brick'], [S0.x + 220, sy1 - SW, 60, SW, 84, SH, 'brick'], [S0.x + 280, sy1 - SW, 80, SW, 0, SH, 'brick'],
      [S0.x + 360, sy1 - SW, 70, SW, 0, SILL, 'brick'], [S0.x + 360, sy1 - SW, 70, SW, HEAD, SH, 'brick'], [S0.x + 430, sy1 - SW, 70, SW, 0, SH, 'brick'],
      // west wall: a door
      [S0.x, S0.y, SW, 110, 0, SH, 'brick'], [S0.x, S0.y + 110, SW, 60, 84, SH, 'brick'], [S0.x, S0.y + 170, SW, S0.h - 170, 0, SH, 'brick'],
      // east wall: a window and a door
      [sx1 - SW, S0.y, SW, 70, 0, SH, 'brick'], [sx1 - SW, S0.y + 70, SW, 60, 0, SILL, 'brick'], [sx1 - SW, S0.y + 70, SW, 60, HEAD, SH, 'brick'],
      [sx1 - SW, S0.y + 130, SW, 40, 0, SH, 'brick'], [sx1 - SW, S0.y + 170, SW, 60, 84, SH, 'brick'], [sx1 - SW, S0.y + 230, SW, S0.h - 230, 0, SH, 'brick'],
      // flat roof (a ceiling inside; too high to jump onto)
      [S0.x, S0.y, S0.w, S0.h, SROOF, SH + 2, 'roof'],
    ];
    // The skate hut by the rink, with lockers for skates.
    const K0 = { x: 760, y: 1000, w: 180, h: 160 }, KW = 12, KH = 110, KROOF = 100;
    const kx1 = K0.x + K0.w, ky1 = K0.y + K0.h;
    const hut = [
      [K0.x, K0.y, K0.w, KW, 0, KH, 'logwall'], [K0.x, ky1 - KW, K0.w, KW, 0, KH, 'logwall'],
      [K0.x, K0.y, KW, 50, 0, KH, 'logwall'], [K0.x, K0.y + 50, KW, 60, 80, KH, 'logwall'], [K0.x, K0.y + 110, KW, 50, 0, KH, 'logwall'],
      [kx1 - KW, K0.y, KW, 50, 0, KH, 'logwall'], [kx1 - KW, K0.y + 50, KW, 60, 0, SILL, 'logwall'], [kx1 - KW, K0.y + 50, KW, 60, HEAD, KH, 'logwall'], [kx1 - KW, K0.y + 110, KW, 50, 0, KH, 'logwall'],
      [K0.x, K0.y, K0.w, K0.h, KROOF, KH + 2, 'roof'],
    ];
    boxes.push(...school, ...hut);

    // ---- closed houses: solid, with pitched roofs ----
    // [x, y, w, d, wall colour, roof colour, ridge along 'x' or 'y', wall height, extras]
    const HOUSE_LIST = [
      // north-west
      [300, 70, 200, 140, '#f3d9b1', '#b8473d', 'x', 100, { chimney: 1, sign: 'BAKERY' }],
      [300, 300, 170, 130, '#cfe3ef', '#3f6d9e', 'y', 92, {}],
      // north-east
      [1560, 70, 200, 150, '#f1c8c0', '#5c7d4b', 'x', 104, { chimney: 1, sign: 'POST' }],
      [1820, 80, 160, 130, '#f5ecd6', '#8a4f8e', 'y', 92, { chimney: 1 }],
      [1580, 330, 170, 130, '#d9ecd0', '#b8473d', 'x', 96, {}],
      // south
      [1000, 980, 180, 140, '#cfe3ef', '#b8473d', 'x', 96, { chimney: 1 }],
      [1260, 980, 160, 140, '#f3d9b1', '#3f6d9e', 'y', 100, {}],
      [1660, 960, 190, 140, '#f5ecd6', '#5c7d4b', 'x', 100, { chimney: 1, sign: 'CAFE' }],
      [1920, 980, 160, 130, '#f1c8c0', '#3f6d9e', 'y', 92, {}],
      [1060, 1230, 180, 120, '#d9ecd0', '#8a4f8e', 'x', 92, { chimney: 1 }],
      [1700, 1230, 200, 120, '#cfe3ef', '#b8473d', 'x', 96, {}],
      // west and east cabins
      [70, 520, 120, 100, '#c9a27a', '#6b4428', 'y', 84, { chimney: 1, log: 1 }],
      [2210, 780, 120, 100, '#c9a27a', '#6b4428', 'y', 84, { chimney: 1, log: 1 }],
    ];
    const houses = HOUSE_LIST.map(([x, y, w, d, wall, roof, ridge, h, extra]) => {
      const rise = Math.min(ridge === 'x' ? d : w, 160) * 0.42;
      const b = [[x, y, w, d, 0, h, 'house']];
      // a narrower block up the middle so snowballs hit the roof, not thin air
      if (ridge === 'x') b.push([x, y + d * 0.25, w, d * 0.5, h, h + rise * 0.6, 'house']);
      else b.push([x + w * 0.25, y, w * 0.5, d, h, h + rise * 0.6, 'house']);
      return { x, y, w, d, wall, roof, ridge, h, rise, ...extra, boxes: b };
    });
    // the clock tower on the south side of the square
    houses.push({ x: 1470, y: 960, w: 90, d: 90, wall: '#d8d2c4', roof: '#3f6d9e', ridge: 'tower', h: 230, rise: 80, tower: 1,
      boxes: [[1470, 960, 90, 90, 0, 230, 'house'], [1485, 975, 60, 60, 230, 290, 'house']] });

    const objects = [
      // lockers inside the school, along the back wall
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ k: 'locker', x: 1020 + i * 52, y: S0.y + SW + 25, rot: 0 })),
      // school desks and the teacher's desk
      ...[1040, 1130, 1270, 1360].flatMap((x) => [{ k: 'desk', x, y: 240 }, { k: 'desk', x, y: 330 }]),
      { k: 'desk', x: 1395, y: 200, teacher: 1 },
      // lockers in the skate hut, along the back wall
      ...[838, 890].map((x) => ({ k: 'locker', x, y: K0.y + KW + 25, rot: 0 })),
      { k: 'bench', x: 830, y: 1132 },
      // the village square, above the tunnel
      { k: 'pine', x: 1200, y: 700, big: 1, cover: 72 }, // the village tree
      { k: 'stall', x: 990, y: 575 }, { k: 'stall', x: 1410, y: 575 }, { k: 'stall', x: 990, y: 825 }, { k: 'stall', x: 1410, y: 825 },
      { k: 'lamp', x: 915, y: 525 }, { k: 'lamp', x: 1485, y: 525 }, { k: 'lamp', x: 915, y: 875 }, { k: 'lamp', x: 1485, y: 875 },
      { k: 'bench', x: 1060, y: 700, rotY: Math.PI / 2 }, { k: 'snowman', x: 1340, y: 700 },
      // lamps along the canal banks
      { k: 'lamp', x: 420, y: 585 }, { k: 'lamp', x: 780, y: 585 }, { k: 'lamp', x: 1640, y: 585 }, { k: 'lamp', x: 1980, y: 585 },
      { k: 'lamp', x: 420, y: 815 }, { k: 'lamp', x: 780, y: 815 }, { k: 'lamp', x: 1640, y: 815 }, { k: 'lamp', x: 1980, y: 815 },
      // wheelie bins in the lanes (climb in to hide)
      { k: 'bin', x: 535, y: 120 }, { k: 'bin', x: 515, y: 480 }, { k: 'bin', x: 905, y: 430 }, { k: 'bin', x: 1500, y: 300 },
      { k: 'bin', x: 2030, y: 520 }, { k: 'bin', x: 960, y: 930 }, { k: 'bin', x: 1620, y: 1150 }, { k: 'bin', x: 2120, y: 1180 },
      { k: 'bin', x: 600, y: 880 }, { k: 'bin', x: 1290, y: 1180 },
      // snow piles (burrow in to hide)
      { k: 'drift', x: 160, y: 300 }, { k: 'drift', x: 150, y: 1100 }, { k: 'drift', x: 2240, y: 330 }, { k: 'drift', x: 2250, y: 1120 },
      { k: 'drift', x: 880, y: 1300 }, { k: 'drift', x: 1470, y: 1290 }, { k: 'drift', x: 1960, y: 430 }, { k: 'drift', x: 690, y: 250 },
      // pine park (north, between the bakery and the school)
      { k: 'pine', x: 620, y: 140 }, { k: 'pine', x: 760, y: 120 }, { k: 'pine', x: 840, y: 230 }, { k: 'pine', x: 640, y: 380 }, { k: 'pine', x: 800, y: 360 },
      { k: 'stump', x: 720, y: 310 }, { k: 'log', x: 720, y: 450 },
      // north-east woods
      { k: 'pine', x: 2100, y: 120 }, { k: 'pine', x: 2230, y: 160 }, { k: 'pine', x: 2120, y: 300 }, { k: 'pine', x: 2240, y: 510 },
      // round the skating rink
      { k: 'pine', x: 260, y: 920 }, { k: 'pine', x: 230, y: 1290 }, { k: 'pine', x: 640, y: 1310 }, { k: 'snowman', x: 720, y: 930 },
      // west and east edges
      { k: 'pine', x: 160, y: 200 }, { k: 'pine', x: 120, y: 880 }, { k: 'pine', x: 2290, y: 610 }, { k: 'pine', x: 2230, y: 1220 },
      { k: 'crate', x: 210, y: 470 }, { k: 'crate', x: 2190, y: 940 }, { k: 'mound', x: 2190, y: 1040 }, { k: 'moundS', x: 150, y: 790 },
      // south streets
      { k: 'hydrant', x: 1285, y: 935 }, { k: 'hydrant', x: 1900, y: 900 }, { k: 'fenceH', x: 1350, y: 1200 }, { k: 'fenceH', x: 1418, y: 1200 },
      { k: 'crate', x: 1960, y: 1230 }, { k: 'snowman', x: 2000, y: 1320 }, { k: 'bench', x: 1500, y: 1110 },
      // north streets
      { k: 'hydrant', x: 1500, y: 470 }, { k: 'bench', x: 1830, y: 280 }, { k: 'snowman', x: 400, y: 520 },
      // down in the canal: crates on the towpaths and ice blocks to duck behind
      { k: 'crateS', x: 700, y: 652, z: D }, { k: 'crateS', x: 1880, y: 748, z: D },
      { k: 'crateS', x: 1030, y: 748, z: D }, { k: 'crateS', x: 1380, y: 652, z: D },
      { k: 'iceWide', x: 470, y: 700, z: CH }, { k: 'iceWide', x: 1960, y: 700, z: CH },
    ];

    // streets painted on the ground (cobbles): [x, y, w, h]
    const roads = [
      [26, 480, 2348, 120],            // Canal Street (north bank)
      [26, 800, 2348, 120],            // south bank
      [880, 480, 640, 440],            // the village square
      [500, 26, 110, 454], [1470, 26, 90, 454], [2000, 26, 90, 454],   // north lanes
      [560, 920, 110, 454], [1180, 920, 80, 454], [1560, 920, 100, 454], [2100, 920, 90, 454], // south lanes
      [940, 380, 520, 100],            // in front of the school
    ];
    const ponds = [[300, 960, 400, 300, 60], [330, 940, 300, 120, 50]]; // the skating rink
    const ice = [
      { x: 380, y: 670, w: TUNNEL.x0 - 380, h: 60, z: CH },          // frozen canal, west
      { x: TUNNEL.x1, y: 670, w: 2020 - TUNNEL.x1, h: 60, z: CH },  // frozen canal, east
    ];
    // under the square the water hasn't frozen: it slows you and carries you east
    const water = [{ x: TUNNEL.x0, y: 670, w: TUNNEL.x1 - TUNNEL.x0, h: 60, z: CH, fx: 90, fy: 0, slow: 0.6 }];

    const spawns = {
      any: [
        { x: 120, y: 110 }, { x: 110, y: 700 }, { x: 110, y: 1290 }, { x: 2290, y: 110 }, { x: 2290, y: 690 }, { x: 2290, y: 1290 },
        { x: 460, y: 545 }, { x: 1950, y: 545 }, { x: 800, y: 860 }, { x: 1700, y: 860 }, { x: 1200, y: 450 }, { x: 1200, y: 945 },
        { x: 820, y: 60 }, { x: 1700, y: 280 }, { x: 980, y: 1340 }, { x: 1580, y: 1340 },
      ],
      blue: [{ x: 90, y: 110 }, { x: 90, y: 420 }, { x: 90, y: 700 }, { x: 90, y: 960 }, { x: 90, y: 1290 }, { x: 220, y: 560 }, { x: 220, y: 840 }],
      red: [{ x: 2310, y: 110 }, { x: 2310, y: 420 }, { x: 2310, y: 690 }, { x: 2310, y: 1000 }, { x: 2310, y: 1290 }, { x: 2180, y: 560 }, { x: 2180, y: 860 }],
    };
    const pickups = [
      { x: 1100, y: 640 }, { x: 1200, y: 250 }, { x: 850, y: 1080 }, { x: 500, y: 1110 }, { x: 2170, y: 240 },
      { x: 2140, y: 1300 }, { x: 240, y: 240 }, { x: 1800, y: 450 },
      { x: 610, y: 700, z: BRIDGE_TOP }, { x: 1790, y: 700, z: BRIDGE_TOP },   // on the bridges
      { x: 1120, y: 650, z: D }, { x: 1300, y: 750, z: D },                   // in the tunnel
      { x: 820, y: 750, z: D }, { x: 1580, y: 650, z: D },                    // in the open canal
    ];
    const signs = [
      { text: 'SCHOOL', x: S0.x + S0.w / 2, y: sy1, z: SH - 18, face: 'S', w: 120 },
      { text: 'SKATES', x: K0.x, y: K0.y + K0.h / 2, z: KH - 16, face: 'W', w: 80 },
    ];
    const decor = [[180, 410], [440, 250], [880, 160], [1580, 260], [2050, 260], [370, 900], [1300, 1300], [2230, 1240], [1100, 1150], [1860, 1160]];

    return {
      id: 'village', name: 'Snow Village', MAP, objects, pits, holes, ramps, boxes, houses, roads, ponds, ice, water, spawns, pickups, signs, decor,
      school: { ...S0, roof: SROOF, top: SH }, hut: { ...K0, roof: KROOF, top: KH }, canal: { ...CANAL, depth: D, channel: CH, tunnel: TUNNEL, well: WELL }, bridges,
    };
  }

  const MAPS = {};
  for (const make of [meadowDef, villageDef]) {
    const def = make();
    const w = buildWorld(def);
    w.extra = { school: def.school, hut: def.hut, canal: def.canal, bridges: def.bridges };
    MAPS[def.id] = w;
  }
  const MAP_LIST = [
    { id: 'meadow', name: 'Snowy Meadow', blurb: 'Open fields, pine groves, igloos and two log lodges.' },
    { id: 'village', name: 'Snow Village', blurb: 'Houses, a school with lockers, bridges and a canal that runs underground.' },
  ];
  const world = (id) => MAPS[id] || MAPS.meadow;

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
  const PICKUP_TYPES = {
    shield: { label: 'Shield Can', radius: 18 },
    cocoa: { label: 'Hot Cocoa', radius: 18 },
    snow: { label: 'Snow Pile', radius: 18 },
  };

  const api = {
    BORDER, STEP_UP, PLAYER_RADIUS, PLAYER_SPEED, RUN_SPEED, PLAYER_HEIGHT, EYE_HEIGHT, JUMP_SPEED, GRAVITY, JUMP_MAX,
    MAX_HP, MAX_SHIELD, SNOWBALL, RESPAWN_MS, INVULN_MS,
    REVEAL_DIST, REVEAL_THROW_MS, REVEAL_HIT_MS,
    HATS, STACHES, cleanLook, KINDS, PICKUP_TYPES, PLAYER_COLOURS, TEAM_COLOURS, clamp,
    MAPS, MAP_LIST, world, mapId: null,
    // Switch the current map (browser): FF.OBJECTS, FF.resolveCollisions… then refer to it.
    useMap(id) {
      const w = world(id);
      if (api.mapId === w.id) return false;
      Object.assign(api, w);
      api.mapId = w.id;
      return true;
    },
  };
  api.useMap('meadow');
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FF = api;
})(typeof window !== 'undefined' ? window : globalThis);
