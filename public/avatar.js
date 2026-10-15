// Front-facing character portrait, drawn with canvas paths. Used for the customisation
// screen, the HUD portrait (with expressions) and the 2D map.
(function () {
  const INK = '#2b3445';
  const HAIR = '#5a3a24';

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
  }

  function eyes(g, R, expr, t) {
    const ex = R * 0.27, ey = R * 0.02;
    g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of [-1, 1]) {
      const x = s * ex, y = ey;
      if (expr === 'happy') {
        g.lineWidth = R * 0.09;
        g.beginPath(); g.arc(x, y + R * 0.06, R * 0.11, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      } else if (expr === 'hurt') {
        // swirly eyes
        g.lineWidth = R * 0.05;
        g.beginPath();
        const turns = 2.4, rot = (t || 0) / 180 * s;
        for (let a = 0; a <= Math.PI * 2 * turns; a += 0.25) {
          const r = (a / (Math.PI * 2 * turns)) * R * 0.15;
          const px = x + Math.cos(a + rot) * r, py = y + Math.sin(a + rot) * r;
          if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      } else if (expr === 'ko') {
        g.lineWidth = R * 0.07; const d = R * 0.09;
        g.beginPath(); g.moveTo(x - d, y - d); g.lineTo(x + d, y + d); g.moveTo(x + d, y - d); g.lineTo(x - d, y + d); g.stroke();
      } else if (expr === 'strong') {
        // narrowed, determined eyes with angry brows
        g.beginPath(); g.ellipse(x, y + R * 0.03, R * 0.1, R * 0.07, 0, 0, Math.PI * 2); g.fill();
        g.lineWidth = R * 0.08;
        g.beginPath(); g.moveTo(x + s * R * 0.17, y - R * 0.16); g.lineTo(x - s * R * 0.05, y - R * 0.07); g.stroke();
      } else {
        g.beginPath(); g.arc(x, y, R * 0.12, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x + R * 0.04, y - R * 0.04, R * 0.04, 0, Math.PI * 2); g.fill(); g.fillStyle = INK;
      }
    }
  }

  function mouth(g, R, expr, hasStache) {
    const y = R * 0.42;
    g.strokeStyle = INK; g.lineWidth = R * 0.06; g.lineCap = 'round';
    if (expr === 'happy') {
      g.fillStyle = '#c8423b';
      g.beginPath(); g.moveTo(-R * 0.18, y - R * 0.04); g.quadraticCurveTo(0, y + R * 0.26, R * 0.18, y - R * 0.04); g.closePath(); g.fill(); g.stroke();
    } else if (expr === 'hurt') {
      g.beginPath(); g.moveTo(-R * 0.16, y + R * 0.03);
      for (let i = 1; i <= 4; i++) g.lineTo(-R * 0.16 + i * R * 0.08, y + (i % 2 ? -R * 0.04 : R * 0.03));
      g.stroke();
    } else if (expr === 'strong') {
      g.fillStyle = '#fff';
      g.beginPath(); g.rect(-R * 0.15, y - R * 0.05, R * 0.3, R * 0.12); g.fill(); g.stroke();
      g.lineWidth = R * 0.03; g.beginPath(); g.moveTo(-R * 0.15, y + R * 0.01); g.lineTo(R * 0.15, y + R * 0.01); g.stroke();
    } else if (expr === 'ko') {
      g.beginPath(); g.ellipse(0, y + R * 0.02, R * 0.07, R * 0.09, 0, 0, Math.PI * 2); g.stroke();
    } else if (!hasStache) {
      g.beginPath(); g.arc(0, y - R * 0.1, R * 0.12, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
    }
  }

  function stache(g, R, style) {
    if (!style || style === 'none') return;
    const y = R * 0.3;
    g.fillStyle = HAIR; g.strokeStyle = INK; g.lineWidth = R * 0.035; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    if (style === 'classic') {
      g.moveTo(0, y - R * 0.04);
      g.bezierCurveTo(-R * 0.12, y - R * 0.12, -R * 0.3, y - R * 0.04, -R * 0.3, y + R * 0.06);
      g.bezierCurveTo(-R * 0.18, y + R * 0.02, -R * 0.08, y + R * 0.08, 0, y + R * 0.03);
      g.bezierCurveTo(R * 0.08, y + R * 0.08, R * 0.18, y + R * 0.02, R * 0.3, y + R * 0.06);
      g.bezierCurveTo(R * 0.3, y - R * 0.04, R * 0.12, y - R * 0.12, 0, y - R * 0.04);
    } else if (style === 'handlebar') {
      g.moveTo(0, y - R * 0.03);
      g.bezierCurveTo(-R * 0.14, y - R * 0.12, -R * 0.3, y + R * 0.05, -R * 0.38, y - R * 0.12);
      g.bezierCurveTo(-R * 0.42, y - R * 0.2, -R * 0.33, y - R * 0.22, -R * 0.33, y - R * 0.14);
      g.bezierCurveTo(-R * 0.26, y + R * 0.12, -R * 0.08, y + R * 0.06, 0, y + R * 0.04);
      g.bezierCurveTo(R * 0.08, y + R * 0.06, R * 0.26, y + R * 0.12, R * 0.33, y - R * 0.14);
      g.bezierCurveTo(R * 0.33, y - R * 0.22, R * 0.42, y - R * 0.2, R * 0.38, y - R * 0.12);
      g.bezierCurveTo(R * 0.3, y + R * 0.05, R * 0.14, y - R * 0.12, 0, y - R * 0.03);
    } else if (style === 'walrus') {
      g.moveTo(-R * 0.3, y - R * 0.02);
      g.quadraticCurveTo(0, y - R * 0.16, R * 0.3, y - R * 0.02);
      g.lineTo(R * 0.27, y + R * 0.2);
      for (let i = 0; i <= 6; i++) g.lineTo(R * 0.27 - i * R * 0.09, y + (i % 2 ? R * 0.13 : R * 0.21));
      g.closePath();
    } else if (style === 'pencil') {
      g.moveTo(-R * 0.22, y + R * 0.02); g.quadraticCurveTo(0, y - R * 0.06, R * 0.22, y + R * 0.02);
      g.lineTo(R * 0.22, y + R * 0.05); g.quadraticCurveTo(0, y - R * 0.01, -R * 0.22, y + R * 0.05); g.closePath();
    } else if (style === 'curly') {
      g.moveTo(0, y - R * 0.02);
      g.bezierCurveTo(-R * 0.1, y - R * 0.1, -R * 0.24, y, -R * 0.24, y + R * 0.04);
      g.arc(-R * 0.3, y + R * 0.02, R * 0.06, 0, Math.PI * 1.6, true);
      g.lineTo(-R * 0.22, y + R * 0.09); g.quadraticCurveTo(-R * 0.08, y + R * 0.08, 0, y + R * 0.04);
      g.quadraticCurveTo(R * 0.08, y + R * 0.08, R * 0.22, y + R * 0.09);
      g.arc(R * 0.3, y + R * 0.02, R * 0.06, Math.PI * 1.4, Math.PI * 3, true);
      g.bezierCurveTo(R * 0.24, y, R * 0.1, y - R * 0.1, 0, y - R * 0.02);
    }
    g.fill(); g.stroke();
  }

  function hat(g, R, style, colour, t) {
    g.strokeStyle = INK; g.lineWidth = R * 0.08; g.lineJoin = 'round';
    const top = -R;
    if (style === 'tophat') {
      g.fillStyle = '#2b2f3a';
      g.beginPath(); g.roundRect(-R * 0.48, top - R * 0.85, R * 0.96, R * 0.9, R * 0.06); g.fill(); g.stroke();
      g.fillStyle = colour; g.fillRect(-R * 0.46, top - R * 0.22, R * 0.92, R * 0.17);
      g.fillStyle = '#2b2f3a'; g.beginPath(); g.ellipse(0, top + R * 0.04, R * 0.8, R * 0.13, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    } else if (style === 'cowboy') {
      g.fillStyle = '#9c6a3e';
      g.beginPath(); g.moveTo(-R * 0.45, top + R * 0.02); g.lineTo(-R * 0.38, top - R * 0.55); g.quadraticCurveTo(0, top - R * 0.35, R * 0.38, top - R * 0.55); g.lineTo(R * 0.45, top + R * 0.02); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = colour; g.fillRect(-R * 0.44, top - R * 0.16, R * 0.88, R * 0.12);
      g.fillStyle = '#9c6a3e'; g.beginPath();
      g.moveTo(-R * 1.05, top - R * 0.12); g.quadraticCurveTo(-R * 0.7, top + R * 0.16, 0, top + R * 0.12); g.quadraticCurveTo(R * 0.7, top + R * 0.16, R * 1.05, top - R * 0.12);
      g.quadraticCurveTo(R * 0.7, top + R * 0.02, 0, top + R * 0.0); g.quadraticCurveTo(-R * 0.7, top + R * 0.02, -R * 1.05, top - R * 0.12); g.closePath(); g.fill(); g.stroke();
    } else if (style === 'crown') {
      g.fillStyle = '#ffc93c';
      g.beginPath(); g.moveTo(-R * 0.55, top + R * 0.12);
      const pts = [[-0.55, -0.42], [-0.3, -0.12], [0, -0.55], [0.3, -0.12], [0.55, -0.42]];
      for (const [x, y] of pts) g.lineTo(x * R, top + y * R);
      g.lineTo(R * 0.55, top + R * 0.12); g.closePath(); g.fill(); g.stroke();
      for (const [x, c] of [[-0.3, '#e2453c'], [0, '#3a86ff'], [0.3, '#7ac74f']]) { g.fillStyle = c; g.beginPath(); g.arc(x * R, top - R * 0.02, R * 0.07, 0, Math.PI * 2); g.fill(); }
    } else if (style === 'viking') {
      g.fillStyle = '#f3ead5';
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(s * R * 0.6, top + R * 0.25); g.quadraticCurveTo(s * R * 1.15, top + R * 0.1, s * R * 1.05, top - R * 0.6);
        g.quadraticCurveTo(s * R * 0.95, top - R * 0.1, s * R * 0.55, top + R * 0.05); g.closePath(); g.fill(); g.stroke();
      }
      g.fillStyle = '#9aa5b6';
      g.beginPath(); g.arc(0, top + R * 0.42, R * 0.78, Math.PI * 1.08, Math.PI * 1.92); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#c9a227'; g.fillRect(-R * 0.72, top + R * 0.18, R * 1.44, R * 0.12);
    } else if (style === 'earmuffs') {
      g.strokeStyle = INK; g.lineWidth = R * 0.2; g.beginPath(); g.arc(0, top + R * 0.75, R * 0.92, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.strokeStyle = colour; g.lineWidth = R * 0.11; g.stroke();
      g.strokeStyle = INK; g.lineWidth = R * 0.07; g.fillStyle = colour;
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * R * 0.92, top + R * 0.75, R * 0.26, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(s * R * 0.92 - s * R * 0.06, top + R * 0.68, R * 0.08, 0, Math.PI * 2); g.fill(); g.fillStyle = colour; }
    } else if (style === 'propeller') {
      g.fillStyle = colour;
      g.beginPath(); g.arc(0, top + R * 0.42, R * 0.78, Math.PI * 1.1, Math.PI * 1.9); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = shade(colour, -0.3); g.beginPath(); g.ellipse(R * 0.45, top + R * 0.2, R * 0.42, R * 0.1, 0.1, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = INK; g.lineWidth = R * 0.05; g.beginPath(); g.moveTo(0, top - R * 0.36); g.lineTo(0, top - R * 0.55); g.stroke();
      const spin = (t || 0) / 60;
      for (const [k, c] of [[0, '#e2453c'], [1, '#ffc93c']]) {
        const a = spin + k * Math.PI;
        g.fillStyle = c; g.beginPath(); g.ellipse(Math.cos(a) * R * 0.25, top - R * 0.56, Math.abs(Math.cos(a)) * R * 0.25 + R * 0.04, R * 0.06, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      g.fillStyle = '#3a86ff'; g.beginPath(); g.arc(0, top - R * 0.56, R * 0.06, 0, Math.PI * 2); g.fill();
    } else if (style === 'none') {
      g.fillStyle = HAIR;
      g.beginPath(); g.moveTo(-R * 0.2, top + R * 0.15); g.quadraticCurveTo(-R * 0.1, top - R * 0.25, 0, top - R * 0.05);
      g.quadraticCurveTo(R * 0.12, top - R * 0.3, R * 0.22, top + R * 0.12); g.closePath(); g.fill(); g.stroke();
    } else { // beanie
      g.fillStyle = colour;
      g.beginPath(); g.arc(0, top + R * 0.62, R * 0.97, Math.PI * 1.08, Math.PI * 1.92); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.roundRect(-R * 0.86, top + R * 0.36, R * 1.72, R * 0.24, R * 0.12); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, top - R * 0.12, R * 0.22, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }

  // Draw a portrait centred at (cx, cy) with body radius R.
  // look: { colour, hat, stache, hatColour }  expr: normal | happy | hurt | strong | ko
  function draw(g, cx, cy, R, look, expr = 'normal', t = 0, opts = {}) {
    const colour = look.colour || '#888888';
    const hatCol = look.hatColour || shade(colour, -0.35);
    g.save();
    g.translate(cx, cy);
    g.lineJoin = 'round';
    if (!opts.noBody) {
      g.fillStyle = colour; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(0, 0, R, -0.6, Math.PI * 0.75); g.arc(-R * 0.18, -R * 0.18, R, Math.PI * 0.75, -0.6, true); g.fill();
      g.strokeStyle = INK; g.lineWidth = Math.max(2, R * 0.12); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#fdf8f2';
    g.beginPath(); g.ellipse(0, R * 0.2, R * 0.62, R * 0.52, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = Math.max(1.5, R * 0.07); g.stroke();
    g.fillStyle = expr === 'hurt' ? '#b8d4f0' : '#f2a0a8';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * R * 0.42, R * 0.3, R * 0.1, 0, Math.PI * 2); g.fill(); }
    eyes(g, R, expr, t);
    mouth(g, R, expr, look.stache && look.stache !== 'none');
    stache(g, R, look.stache);
    hat(g, R, look.hat || 'beanie', hatCol, t);
    g.restore();
  }

  window.FFAvatar = { draw, shade };
})();
