// Canvas renderer shared by the player game and the teacher's spectator view.
(function () {
  const F = window.FF, SP = window.FFSprites;
  const INK = '#2b3445';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- ground ----------
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  function blobPath(list) {
    const p = new Path2D();
    for (const [x, y, w, h, r] of list) {
      p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
      p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
    }
    return p;
  }
  function pointsIn(list, n, test) {
    const out = [];
    let tries = 0;
    while (out.length < n && tries++ < n * 40) {
      const b = list[Math.floor(rnd() * list.length)];
      const x = b[0] + rnd() * b[2], y = b[1] + rnd() * b[3];
      if (test(x, y)) out.push([x, y, rnd()]);
    }
    return out;
  }
  const inBlobs = (list) => (x, y) => list.some(([bx, by, w, h, r]) => {
    if (x < bx + 6 || y < by + 6 || x > bx + w - 6 || y > by + h - 6) return false;
    const cx = F.clamp(x, bx + r, bx + w - r), cy = F.clamp(y, by + r, by + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= (r - 6) ** 2;
  });
  // Shapes worked out once per map (redone when the map changes).
  let GRASS_PATH, POND_PATH, GRASS_TUFTS, POND_MOTTLES, DECOR, SOLIDS, COVERS, preparedFor = null;
  function prepare() {
    if (preparedFor === F.mapId) return;
    preparedFor = F.mapId;
    seed = 11;
    GRASS_PATH = blobPath(F.GRASS);
    POND_PATH = blobPath(F.PONDS);
    GRASS_TUFTS = F.GRASS.length ? pointsIn(F.GRASS, 70, inBlobs(F.GRASS)) : [];
    POND_MOTTLES = F.PONDS.length ? pointsIn(F.PONDS, 40, inBlobs(F.PONDS)) : [];
    DECOR = F.DECOR;
    // Static objects split into y-sorted solids and the cover layer drawn over players.
    SOLIDS = []; COVERS = [];
    F.OBJECTS.forEach((o) => {
      const def = F.KINDS[o.k];
      if (def.cover) { COVERS.push(o); return; }
      let bottom = 0;
      for (const [, dy, , h] of def.rects || []) bottom = Math.max(bottom, dy + h);
      for (const [, dy, r] of def.circles || []) bottom = Math.max(bottom, dy + r * 0.6);
      SOLIDS.push({ o, base: o.y + bottom });
    });
    COVERS.sort((a, b) => a.y - b.y);
  }

  let snowTile = null;
  function groundPattern(ctx) {
    if (!snowTile) {
      snowTile = document.createElement('canvas');
      snowTile.width = snowTile.height = 220;
      const t = snowTile.getContext('2d');
      t.fillStyle = '#f5f8fc'; t.fillRect(0, 0, 220, 220);
      let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 55; i++) {
        t.fillStyle = r() > 0.5 ? 'rgba(170,195,220,0.28)' : 'rgba(255,255,255,1)';
        t.beginPath(); t.arc(r() * 220, r() * 220, 0.8 + r() * 1.8, 0, Math.PI * 2); t.fill();
      }
      t.strokeStyle = 'rgba(170,195,220,0.22)'; t.lineWidth = 1.5; t.lineCap = 'round';
      for (let i = 0; i < 6; i++) { const x = r() * 200, y = r() * 200; t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + 8, y - 3, x + 16, y); t.stroke(); }
    }
    return ctx.createPattern(snowTile, 'repeat');
  }

  // Cobbled streets (Snow Village)
  let cobbleTile = null;
  function cobblePattern(ctx) {
    if (!cobbleTile) {
      cobbleTile = document.createElement('canvas'); cobbleTile.width = cobbleTile.height = 48;
      const t = cobbleTile.getContext('2d');
      t.fillStyle = '#c9ccd3'; t.fillRect(0, 0, 48, 48);
      t.strokeStyle = 'rgba(120,128,142,0.55)'; t.lineWidth = 1.5;
      for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
        const x = i * 12 + (r % 2) * 6, y = r * 12;
        t.fillStyle = (r + i) % 3 ? '#cfd2d8' : '#bfc4cc';
        roundRect(t, x + 1, y + 1, 10, 10, 3); t.fill(); t.stroke();
      }
      t.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [x, y] of [[5, 7], [30, 20], [18, 40], [42, 33]]) { t.beginPath(); t.arc(x, y, 2.5, 0, Math.PI * 2); t.fill(); }
    }
    return ctx.createPattern(cobbleTile, 'repeat');
  }

  // The canal and its steps, seen from above (on the 2D maps only; the 3D view has the real thing).
  function drawCanal(ctx) {
    const c = F.extra && F.extra.canal;
    if (!c) return;
    const chY0 = 670, chY1 = 730;
    const open = [[c.x, c.tunnel.x0], [c.tunnel.x1, c.x + c.w]];
    ctx.save();
    for (const [a, b] of open) {
      ctx.fillStyle = '#8f98a6'; ctx.fillRect(a, c.y, b - a, c.h);                 // towpaths
      ctx.fillStyle = '#a9daf5'; ctx.fillRect(Math.max(a, 380), chY0, Math.min(b, 2020) - Math.max(a, 380), chY1 - chY0); // frozen channel
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
      for (let x = Math.max(a, 380) + 30; x < Math.min(b, 2020) - 20; x += 90) { ctx.beginPath(); ctx.moveTo(x, chY0 + 18); ctx.lineTo(x + 26, chY0 + 10); ctx.stroke(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(a, c.y, b - a, c.h);
    }
    // steps at the ends and the stairwells into the tunnel
    for (const r of F.RAMPS) {
      if (r.kind !== 'steps') continue;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, along = r.axis === 'y';
        const c0 = r.a0 + (r.a1 - r.a0) * t0, sz = (r.a1 - r.a0) / n;
        ctx.fillStyle = i % 2 ? '#b7bdc6' : '#cdd2d9';
        if (along) ctx.fillRect(r.x, Math.min(c0, c0 + sz), r.w, Math.abs(sz) + 0.5);
        else ctx.fillRect(Math.min(c0, c0 + sz), r.y, Math.abs(sz) + 0.5, r.h);
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    for (const y of [600, 770]) { ctx.fillStyle = '#8f98a6'; ctx.fillRect(c.well.x, y, c.well.w, 30); }
    ctx.restore();
  }
  // The tunnel under the square: a dashed outline so the teacher can see where it runs.
  function drawTunnel(ctx) {
    const c = F.extra && F.extra.canal;
    if (!c) return;
    ctx.save();
    ctx.fillStyle = 'rgba(43,62,99,0.14)'; ctx.fillRect(c.tunnel.x0, c.y, c.tunnel.x1 - c.tunnel.x0, c.h);
    ctx.setLineDash([22, 14]); ctx.strokeStyle = 'rgba(43,62,99,0.75)'; ctx.lineWidth = 7;
    ctx.strokeRect(c.tunnel.x0 + 4, c.y + 4, c.tunnel.x1 - c.tunnel.x0 - 8, c.h - 8);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(43,62,99,0.8)'; ctx.font = '800 26px "Bricolage Grotesque", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TUNNEL', c.tunnel.x0 + 62, c.y + c.h / 2); ctx.fillText('TUNNEL', c.tunnel.x1 - 62, c.y + c.h / 2);
    ctx.restore();
  }

  // opts.map: draw map-only marks (the canal from above, the tunnel outline)
  function drawGround(ctx, opts = {}) {
    prepare();
    ctx.fillStyle = groundPattern(ctx);
    ctx.fillRect(0, 0, F.MAP.width, F.MAP.height);
    // grass under the groves
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#7d9585'; ctx.lineWidth = 6; ctx.stroke(GRASS_PATH);
    ctx.fillStyle = '#95ac9c'; ctx.fill(GRASS_PATH);
    ctx.strokeStyle = '#7d9585'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const [x, y, k] of GRASS_TUFTS) {
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 2, y - 6); ctx.moveTo(x, y); ctx.lineTo(x + 1, y - 8); ctx.moveTo(x + 4, y); ctx.lineTo(x + 5, y - 5);
      if (k > 0.6) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, y - 3, 3, 3); }
      ctx.stroke();
    }
    // frozen ponds
    ctx.strokeStyle = '#a2cbe9'; ctx.lineWidth = 8; ctx.stroke(POND_PATH);
    ctx.fillStyle = '#bddcf3'; ctx.fill(POND_PATH);
    ctx.clip(POND_PATH);
    for (const [x, y, k] of POND_MOTTLES) {
      ctx.fillStyle = k > 0.5 ? 'rgba(214,236,250,0.9)' : 'rgba(160,200,232,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y, 10 + k * 18, 6 + k * 10, k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
    for (const [x, y, k] of POND_MOTTLES.slice(0, 14)) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12 + k * 10, y - 6 - k * 4); ctx.stroke(); }
    ctx.restore();
    if (F.ROADS.length) {
      ctx.save();
      ctx.fillStyle = cobblePattern(ctx);
      for (const [x, y, w, h] of F.ROADS) { roundRect(ctx, x, y, w, h, 14); ctx.fill(); }
      ctx.restore();
    }
    for (const [x, y] of DECOR) SP.draw(ctx, 'tuft', x, y);
    if (opts.map) { drawCanal(ctx); drawTunnel(ctx); }
  }

  // ---------- village buildings (seen from above) ----------
  function drawHouseRoof(ctx, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(70,100,140,0.22)'; roundRect(ctx, H.x + 8, H.y + 10, H.w, H.d, 6); ctx.fill();
    if (H.tower) {
      ctx.fillStyle = H.roof; ctx.fillRect(H.x, H.y, H.w, H.d);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.moveTo(H.x + H.w / 2, H.y + H.d / 2); ctx.lineTo(H.x + H.w, H.y); ctx.lineTo(H.x + H.w, H.y + H.d); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(H.x, H.y); ctx.lineTo(H.x + H.w, H.y + H.d); ctx.moveTo(H.x + H.w, H.y); ctx.lineTo(H.x, H.y + H.d); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(H.x + H.w / 2, H.y + H.d / 2, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeRect(H.x, H.y, H.w, H.d);
      ctx.restore(); return;
    }
    const alongX = H.ridge !== 'y';
    ctx.fillStyle = H.roof; ctx.fillRect(H.x - 6, H.y - 6, H.w + 12, H.d + 12);
    // the far slope is shaded; snow lies on both
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    if (alongX) ctx.fillRect(H.x - 6, H.y + H.d / 2, H.w + 12, H.d / 2 + 6); else ctx.fillRect(H.x + H.w / 2, H.y - 6, H.w / 2 + 6, H.d + 12);
    // roof tiles: rows parallel to the ridge
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2; ctx.beginPath();
    if (alongX) for (let y = H.y; y < H.y + H.d; y += 14) { ctx.moveTo(H.x - 6, y); ctx.lineTo(H.x + H.w + 6, y); }
    else for (let x = H.x; x < H.x + H.w; x += 14) { ctx.moveTo(x, H.y - 6); ctx.lineTo(x, H.y + H.d + 6); }
    ctx.stroke();
    // snow drifted along the ridge and in soft patches
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    if (alongX) { roundRect(ctx, H.x + 4, H.y + H.d / 2 - 16, H.w - 8, 32, 12); ctx.fill(); roundRect(ctx, H.x + H.w * 0.12, H.y + 6, H.w * 0.42, H.d * 0.22, 10); ctx.fill(); }
    else { roundRect(ctx, H.x + H.w / 2 - 16, H.y + 4, 32, H.d - 8, 12); ctx.fill(); roundRect(ctx, H.x + 6, H.y + H.d * 0.5, H.w * 0.22, H.d * 0.38, 10); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(H.x - 6, H.y - 6, H.w + 12, H.d + 12);
    ctx.lineWidth = 2.5; ctx.beginPath();
    if (alongX) { ctx.moveTo(H.x - 6, H.y + H.d / 2); ctx.lineTo(H.x + H.w + 6, H.y + H.d / 2); } else { ctx.moveTo(H.x + H.w / 2, H.y - 6); ctx.lineTo(H.x + H.w / 2, H.y + H.d + 6); }
    ctx.stroke();
    if (H.chimney) {
      const cx = alongX ? H.x + H.w * 0.75 : H.x + H.w / 2 + H.w * 0.18, cy = alongX ? H.y + H.d / 2 - H.d * 0.18 : H.y + H.d * 0.25;
      ctx.fillStyle = '#9b4a3a'; ctx.fillRect(cx - 9, cy - 9, 18, 18); ctx.strokeRect(cx - 9, cy - 9, 18, 18);
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 6, cy - 6, 12, 5);
    }
    ctx.restore();
  }
  function drawVillage(ctx) {
    // school and skate hut: floor plans, so you can see who's inside
    for (const B of [F.extra.school, F.extra.hut]) {
      if (!B) continue;
      ctx.fillStyle = 'rgba(70,100,140,0.22)'; roundRect(ctx, B.x + 8, B.y + 10, B.w, B.h, 6); ctx.fill();
      ctx.fillStyle = plankPattern(ctx); ctx.fillRect(B.x, B.y, B.w, B.h);
    }
    for (const [x, y, w, h, b, , kind] of F.BOXES) {
      if ((kind === 'brick' || kind === 'logwall') && b === 0) {
        ctx.fillStyle = kind === 'brick' ? '#b65a46' : '#8f5d36'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
      } else if ((kind === 'brick' || kind === 'logwall') && b > 0 && b < 80) {
        ctx.fillStyle = '#d6ecff'; ctx.fillRect(x, y, w, h); // a window
      } else if (kind === 'bridge') {
        ctx.fillStyle = plankPattern(ctx); ctx.fillRect(x, y, w, h); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, h);
      } else if (kind === 'rail') {
        ctx.fillStyle = b > 0 ? '#5c3a22' : '#39424f'; ctx.fillRect(x, y, w, h);
      }
    }
    for (const r of F.RAMPS) {
      if (r.kind !== 'bridge') continue;
      ctx.fillStyle = '#c9a274'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    for (const H of F.HOUSES) drawHouseRoof(ctx, H);
    for (const s of F.SIGNS) {
      ctx.fillStyle = '#6b4428'; const w = s.w * 0.9;
      const x = s.face === 'W' ? s.x - 30 : s.x, y = s.face === 'S' ? s.y + 18 : s.y;
      roundRect(ctx, x - w / 2, y - 11, w, 22, 6); ctx.fill();
      ctx.fillStyle = '#ffe9b0'; ctx.font = '800 15px "Bricolage Grotesque", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.text, x, y + 1);
    }
  }


  function drawFenceTop(ctx) {
    for (let x = 0; x < F.MAP.width; x += 40) SP.draw(ctx, 'railH', x, -1);
    for (let y = 0; y < F.MAP.height; y += 40) { SP.draw(ctx, 'railV', -2, y); SP.draw(ctx, 'railV', F.MAP.width - 28, y); }
  }
  function drawFenceBottom(ctx) {
    for (let x = 0; x < F.MAP.width; x += 40) SP.draw(ctx, 'railH', x, F.MAP.height - 28);
  }


  // ---------- lodges (seen from above) ----------
  let plankTile = null;
  function plankPattern(ctx) {
    if (!plankTile) {
      plankTile = document.createElement('canvas'); plankTile.width = 40; plankTile.height = 40;
      const t = plankTile.getContext('2d');
      t.fillStyle = '#b98a57'; t.fillRect(0, 0, 40, 40);
      t.strokeStyle = 'rgba(107,68,40,0.45)'; t.lineWidth = 1.5;
      for (let y = 0; y <= 40; y += 10) { t.beginPath(); t.moveTo(0, y); t.lineTo(40, y); t.stroke(); }
      t.beginPath(); t.moveTo(14, 0); t.lineTo(14, 10); t.moveTo(30, 10); t.lineTo(30, 20); t.moveTo(8, 20); t.lineTo(8, 30); t.moveTo(24, 30); t.lineTo(24, 40); t.stroke();
    }
    return ctx.createPattern(plankTile, 'repeat');
  }
  function drawLodges(ctx) {
    for (const L of F.LODGES || []) {
      const slab = L.boxes.find((b) => b[6] === 'slab');
      const [x, y, w, h] = slab;
      ctx.fillStyle = 'rgba(70,100,140,0.22)'; roundRect(ctx, x + 8, y + 10, w, h, 6); ctx.fill();
      ctx.fillStyle = plankPattern(ctx); ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
      for (const b of L.boxes) {
        if (b[6] !== 'parapet') continue;
        ctx.fillStyle = '#8f5d36'; ctx.fillRect(b[0], b[1], b[2], b[3]);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(b[0] + 1, b[1] + 1, b[2] - 2, Math.min(b[3] - 2, 3));
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(b[0], b[1], b[2], b[3]);
      }
      // stairs: steps get lighter as they climb
      const r = L.ramp;
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, sx = r.lowX + (r.highX - r.lowX) * t0, sw = (r.highX - r.lowX) / steps;
        const x0 = Math.min(sx, sx + sw);
        ctx.fillStyle = i % 2 ? '#a8784a' : '#b98a57';
        ctx.fillRect(x0, r.y, Math.abs(sw) + 0.5, r.h);
      }
      const lo = Math.min(r.highX, r.lowX), hi = Math.max(r.highX, r.lowX);
      const landing = r.highX < r.lowX ? [r.x, r.highX - r.x] : [r.highX, r.x + r.w - r.highX];
      ctx.fillStyle = '#b98a57'; ctx.fillRect(landing[0], r.y, landing[1], r.h);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 14px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('stairs ↑', (lo + hi) / 2, r.y + r.h / 2);
    }
  }

  // ---------- pickups ----------
  function drawPickup(ctx, k, now) {
    const bob = Math.sin(now / 300 + k[0]) * 3;
    const x = k[2], y = k[3] + bob;
    ctx.fillStyle = 'rgba(93,122,153,0.25)';
    ctx.beginPath(); ctx.ellipse(k[2], k[3] + 17, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,201,60,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(now / 200) * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    if (k[1] === 'shield') {
      ctx.fillStyle = '#2f6fe4'; roundRect(ctx, x - 10, y - 14, 20, 28, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9cc0ff'; ctx.fillRect(x - 8.5, y - 6, 17, 6);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y + 7);
    } else if (k[1] === 'cocoa') {
      ctx.beginPath(); ctx.arc(x + 10, y + 2, 5, -1.4, 1.4); ctx.stroke();
      ctx.fillStyle = '#e8473f'; roundRect(ctx, x - 11, y - 9, 20, 22, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.ellipse(x - 1, y - 8, 9, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(43,52,69,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 3, y - 13); ctx.quadraticCurveTo(x - 7, y - 18, x - 3, y - 23); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      for (const [dx, dy, r] of [[-7, 4, 8], [7, 4, 8], [0, -3, 9]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      for (const [dx, dy, r] of [[-7, 4, 6.8], [7, 4, 6.8], [0, -3, 7.8]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // ---------- players ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
  }

  function drawPlayer(ctx, p, info, isMe, teams, now) {
    const R = F.PLAYER_RADIUS;
    const colour = info.colour || '#888';
    const hat = teams && info.team ? F.TEAM_COLOURS[info.team] : shade(colour, -0.35);
    const a = p.angle || 0;
    if (p.inv && Math.floor(now / 100) % 2 === 0) ctx.globalAlpha = 0.45;
    else if ((p.z || 0) < -30) ctx.globalAlpha = 0.6; // down in the canal or the tunnel
    ctx.lineJoin = 'round';
    // ground ring (team colour) + shadow
    ctx.fillStyle = 'rgba(93,122,153,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + R - 3, R * 0.95, R * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    if (teams && info.team) {
      ctx.strokeStyle = F.TEAM_COLOURS[info.team]; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + R - 4, R * 1.05, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // mitten
    const mx = p.x + Math.cos(a) * (R + 4), my = p.y + Math.sin(a) * (R + 4);
    ctx.fillStyle = hat; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // body
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.arc(p.x, p.y, R, -0.6, Math.PI * 0.75); ctx.arc(p.x - 4, p.y - 4, R, Math.PI * 0.75, -0.6, true); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.stroke();
    // face, moustache and hat
    window.FFAvatar.draw(ctx, p.x, p.y, R, { colour, hat: (info.look || {}).hat, stache: (info.look || {}).stache, hatColour: hat }, 'normal', 0, { noBody: true });
    // red flash when hit, blue ring while shielded
    const hitAge = now - (p.hitAt || -1e9);
    if (hitAge < 400) { ctx.fillStyle = `rgba(255,40,40,${0.55 * (1 - hitAge / 400)})`; ctx.beginPath(); ctx.arc(p.x, p.y, R + 3, 0, Math.PI * 2); ctx.fill(); }
    if (p.shield > 0) { ctx.strokeStyle = 'rgba(90,168,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R + 7, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  function drawLabel(ctx, p, info, isMe) {
    const R = F.PLAYER_RADIUS;
    ctx.font = `700 ${isMe ? 14 : 13}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = info.name || '';
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = isMe ? 'rgba(27,42,74,0.92)' : 'rgba(27,42,74,0.66)';
    roundRect(ctx, p.x - w / 2, p.y - R - 42, w, 20, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, p.x, p.y - R - 31.5);
    const bw = 44, bx = p.x - bw / 2, by = p.y - R - 18;
    ctx.fillStyle = 'rgba(27,42,74,0.4)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = p.hp > 50 ? '#57c46a' : p.hp > 25 ? '#ffc93c' : '#e2453c';
    ctx.fillRect(bx, by, bw * Math.max(0, p.hp) / F.MAX_HP, 5);
    if (p.shield > 0) { ctx.fillStyle = '#5aa8ff'; ctx.fillRect(bx, by - 4, bw * p.shield / F.MAX_SHIELD, 3); }
  }

  // ---------- frame ----------
  function draw(ctx, cw, ch, cam, world, now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#d9e4ee';
    ctx.fillRect(0, 0, cw, ch);
    const z = cam.zoom;
    ctx.setTransform(z, 0, 0, z, cw / 2 - cam.x * z, ch / 2 - cam.y * z);

    // snowy surroundings beyond the fence
    ctx.fillStyle = groundPattern(ctx);
    ctx.fillRect(-2000, -2000, F.MAP.width + 4000, F.MAP.height + 4000);
    ctx.fillStyle = 'rgba(110,140,175,0.16)';
    ctx.fillRect(-2000, -2000, F.MAP.width + 4000, F.MAP.height + 4000);
    drawGround(ctx, { map: true });
    ctx.save(); ctx.beginPath(); ctx.rect(0, -10, F.MAP.width, F.MAP.height + 20); ctx.clip();
    drawFenceTop(ctx);
    ctx.restore();
    drawLodges(ctx);
    drawVillage(ctx);
    for (const k of world.pickups) drawPickup(ctx, k, now);

    // y-sorted solids and players
    const players = [...world.players.values()].filter((p) => p.alive && p.connected && !p.hidden && p.x != null);
    const items = SOLIDS.map((s) => ({ base: s.base, o: s.o }));
    for (const p of players) items.push({ base: p.y + F.PLAYER_RADIUS * 0.6, p });
    items.sort((a, b) => a.base - b.base);
    for (const it of items) {
      if (it.o) SP.draw(ctx, it.o.k, it.o.x, it.o.y, (it.o.z || 0) < -30 ? 0.7 : 1);
      else drawPlayer(ctx, it.p, world.roster.get(it.p.id) || {}, it.p.id === world.meId, world.teams, now);
    }

    // snowballs, extrapolated from the last snapshot
    const since = Math.min(0.12, (now - world.snapAt) / 1000);
    ctx.lineWidth = 2; ctx.strokeStyle = INK;
    for (const b of world.balls) {
      const x = b[1] + b[3] * since, y = b[2] + b[4] * since;
      ctx.fillStyle = 'rgba(93,122,153,0.25)';
      ctx.beginPath(); ctx.ellipse(x + 3, y + 10, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, F.SNOWBALL.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // cover layer: trees and igloos go over anyone hiding inside
    const me = world.meId ? world.players.get(world.meId) : null;
    for (const o of COVERS) {
      const r = F.KINDS[o.k].cover;
      const r2 = o.cover || r;
      const has = (p) => Math.abs((p.z || 0) - (o.z || 0)) < 40 && (p.x - o.x) ** 2 + (p.y - o.y) ** 2 < r2 * r2;
      let alpha = 1;
      if (me && me.alive && has(me)) alpha = 0.4;
      else if (players.some(has)) alpha = world.spectator ? 0.5 : 0.7;
      SP.draw(ctx, o.k, o.x, o.y, alpha, o.big ? 1.45 : 1);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, F.MAP.width, F.MAP.height + 10); ctx.clip();
    drawFenceBottom(ctx);
    ctx.restore();

    for (const p of players) drawLabel(ctx, p, world.roster.get(p.id) || {}, p.id === world.meId);

    // particles
    world.particles = world.particles.filter((pt) => now - pt.t0 < pt.life);
    for (const pt of world.particles) {
      const k = (now - pt.t0) / pt.life;
      if (pt.kind === 'text') {
        ctx.globalAlpha = 1 - k;
        ctx.font = '800 22px "Bricolage Grotesque", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#1b2a4a'; ctx.strokeText(pt.text, pt.x, pt.y - k * 40);
        ctx.fillStyle = pt.colour; ctx.fillText(pt.text, pt.x, pt.y - k * 40);
      } else if (pt.kind === 'ring') {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = pt.colour; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 10 + k * pt.size, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = pt.colour;
        ctx.beginPath(); ctx.arc(pt.x + pt.vx * k, pt.y + pt.vy * k, pt.size * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function burst(world, x, y, colour, n, spread, size, now) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spread * (0.4 + Math.random() * 0.6);
      world.particles.push({ kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: size * (0.6 + Math.random() * 0.6), colour, t0: now, life: 420 + Math.random() * 200 });
    }
  }

  // Apply a server snapshot. Entry: [id, x, y, hp, shield, alive, angle*100, invuln, ammo, kos, spawnSeq, connected, visible]
  function applySnapshot(world, s, now) {
    const seen = new Set();
    for (const a of s.p) {
      const id = a[0];
      seen.add(id);
      let p = world.players.get(id);
      if (!p) { p = { id, hidden: true }; world.players.set(id, p); }
      p.ammo = a[8]; p.kos = a[9]; p.connected = !!a[11];
      if (!a[12]) { p.hidden = true; continue; }
      const snap = p.hidden || p.x == null || p.seq !== a[10] || !p.alive;
      p.hidden = false;
      p.tx = a[1]; p.ty = a[2];
      if (snap) { p.x = a[1]; p.y = a[2]; }
      p.tz = a[13] || 0;
      if (snap) p.z = p.tz;
      p.hp = a[3]; p.shield = a[4]; p.alive = !!a[5]; p.serverAngle = a[6] / 100; p.inv = !!a[7];
      p.seq = a[10];
      if (id !== world.meId) p.angle = p.serverAngle;
    }
    for (const id of [...world.players.keys()]) if (!seen.has(id)) world.players.delete(id);
    world.balls = s.b;
    world.pickups = s.k;
    world.snapAt = now;
    world.timeLeft = s.t;
    world.timeAt = now;
    world.teamScores = s.ts;
  }

  function easeOthers(world, dt) {
    const k = Math.min(1, dt * 14);
    for (const p of world.players.values()) {
      if (p.id === world.meId || p.tx == null || p.hidden) continue;
      p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
      if (p.tz != null) p.z = (p.z || 0) + (p.tz - (p.z || 0)) * Math.min(1, k * 1.5);
    }
  }

  function newWorld(teams, spectator) {
    return { players: new Map(), roster: new Map(), balls: [], pickups: [], particles: [], snapAt: 0, timeLeft: 0, timeAt: 0, teams: !!teams, spectator: !!spectator, meId: null, teamScores: null };
  }

  window.FFRender = { draw, drawGround, drawPlayer, burst, applySnapshot, easeOthers, newWorld, roundRect };
})();
