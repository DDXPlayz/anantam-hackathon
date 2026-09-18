// STEMSCAPE isometric renderer — procedural 2D tiles and sprites on one canvas.
// All sprites are drawn from primitives (no image assets). Sizes are in units of
// the tile width `tw` so the same scene scales to any canvas.

export function makeView(W, H, cols, rows, opts = {}) {
  const padTop = opts.padTop ?? 0.22, padBottom = opts.padBottom ?? 0.06;
  const twByW = (W * 0.96) / ((cols + rows) / 2);
  const twByH = (H * (1 - padTop - padBottom)) / ((cols + rows) / 4);
  const tw = Math.min(twByW, twByH);
  const th = tw / 2;
  const mapW = (cols + rows) * tw / 2, mapH = (cols + rows) * th / 2;
  const ox = W / 2 - (cols - rows) * tw / 4;
  const oy = H * padTop + (H * (1 - padTop - padBottom) - mapH) / 2;
  return { W, H, cols, rows, tw, th, ox, oy, mapW, mapH };
}

export function toScreen(v, x, y, z = 0) {
  return { X: v.ox + (x - y) * v.tw / 2, Y: v.oy + (x + y) * v.th / 2 - z * v.tw };
}

export function hitTest(v, px, py) {
  const a = (px - v.ox) / (v.tw / 2), b = (py - v.oy) / (v.th / 2);
  const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
  if (x < 0 || y < 0 || x >= v.cols || y >= v.rows) return null;
  return { x, y };
}

// ---- colour helpers ----
export function shade(hex, f) {
  // f > 0 lighten, f < 0 darken
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0].X, pts[0].Y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].X, pts[i].Y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

// ---- terrain ----
export const TERRAIN = {
  grass: '#4FB35E', grass2: '#46A455', dirt: '#B98A4E', sand: '#E5CF8B', water: '#2A8FD6',
  road: '#5C6270', rock: '#8A8F9A', wet: '#3D9E7A', dark: '#2E7A3C', deep: '#1E6FB0', concrete: '#9FA6B2'
};

export function tileTop(ctx, v, x, y, color, z = 0, stroke) {
  const A = toScreen(v, x, y, z), B = toScreen(v, x + 1, y, z), C = toScreen(v, x + 1, y + 1, z), D = toScreen(v, x, y + 1, z);
  poly(ctx, [A, B, C, D], color, stroke);
}

export function block(ctx, v, x, y, w, d, h, c, z = 0) {
  // box occupying tiles [x,x+w) × [y,y+d), height h (in tile widths), base elevation z
  const top = { A: toScreen(v, x, y, z + h), B: toScreen(v, x + w, y, z + h), C: toScreen(v, x + w, y + d, z + h), D: toScreen(v, x, y + d, z + h) };
  const D0 = toScreen(v, x, y + d, z), C0 = toScreen(v, x + w, y + d, z), B0 = toScreen(v, x + w, y, z);
  poly(ctx, [top.D, top.C, C0, D0], c.left || shade(c.top, -0.28));
  poly(ctx, [top.C, top.B, B0, C0], c.right || shade(c.top, -0.45));
  poly(ctx, [top.A, top.B, top.C, top.D], c.top, c.stroke);
  return top;
}

export function terrainTile(ctx, v, x, y, kind, t = 0) {
  if (kind === 'water') {
    tileTop(ctx, v, x, y, TERRAIN.water);
    // ripples
    const c = toScreen(v, x + 0.5, y + 0.5, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, v.tw * 0.02);
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.6 + i * 0.5 + (x * 7 + y * 3) % 5 * 0.2) % 1;
      const rx = v.tw * 0.12 + ph * v.tw * 0.22, ry = rx / 2;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.ellipse(c.X, c.Y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  const base = kind === 'road' ? TERRAIN.road : kind === 'dirt' ? TERRAIN.dirt : kind === 'sand' ? TERRAIN.sand : kind === 'rock' ? TERRAIN.rock : kind === 'wet' ? TERRAIN.wet : kind === 'concrete' ? TERRAIN.concrete : ((x + y) % 2 ? TERRAIN.grass : TERRAIN.grass2);
  tileTop(ctx, v, x, y, base, 0, 'rgba(0,0,0,.08)');
  if (kind === 'road') {
    const c1 = toScreen(v, x + 0.5, y, 0), c2 = toScreen(v, x + 0.5, y + 1, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([v.tw * .08, v.tw * .08]); ctx.lineWidth = Math.max(1, v.tw * .03);
    ctx.beginPath(); ctx.moveTo(c1.X, c1.Y); ctx.lineTo(c2.X, c2.Y); ctx.stroke(); ctx.setLineDash([]);
  }
}

// cliff edge along the south/east border of the map so the world looks like a floating slab
export function mapEdges(ctx, v, cols, rows, depth = 0.45) {
  const D = toScreen(v, 0, rows, 0), C = toScreen(v, cols, rows, 0), B = toScreen(v, cols, 0, 0);
  const D0 = toScreen(v, 0, rows, -depth), C0 = toScreen(v, cols, rows, -depth), B0 = toScreen(v, cols, 0, -depth);
  poly(ctx, [D, C, C0, D0], '#6E4E2E');
  poly(ctx, [C, B, B0, C0], '#4E3620');
}

// ---- sprites ----
export function house(ctx, v, x, y, opts = {}, z = 0) {
  const wall = opts.wall || '#F3E2B8', roof = opts.roof || '#D9533A';
  const h = 0.32;
  const top = block(ctx, v, x + 0.15, y + 0.15, 0.7, 0.7, h, { top: wall, left: shade(wall, -0.18), right: shade(wall, -0.35) }, z);
  // roof: ridge along x
  const rl = toScreen(v, x + 0.15, y + 0.5, z + h + 0.22), rr = toScreen(v, x + 0.85, y + 0.5, z + h + 0.22);
  poly(ctx, [top.A, top.B, rr, rl], shade(roof, 0.05));
  poly(ctx, [top.D, top.C, rr, rl], shade(roof, -0.3));
  poly(ctx, [top.D, rl, top.A], shade(wall, -0.1));
  // door
  const d1 = toScreen(v, x + 0.45, y + 0.85, z), d2 = toScreen(v, x + 0.6, y + 0.85, z), d3 = toScreen(v, x + 0.6, y + 0.85, z + 0.18), d4 = toScreen(v, x + 0.45, y + 0.85, z + 0.18);
  poly(ctx, [d1, d2, d3, d4], '#6B3F2A');
  if (opts.lit) { // window glow at night
    const w1 = toScreen(v, x + 0.85, y + 0.35, z + 0.1), w2 = toScreen(v, x + 0.85, y + 0.5, z + 0.1), w3 = toScreen(v, x + 0.85, y + 0.5, z + 0.24), w4 = toScreen(v, x + 0.85, y + 0.35, z + 0.24);
    poly(ctx, [w1, w2, w3, w4], '#FFD86B');
  }
}

export function bigBuilding(ctx, v, x, y, opts = {}) {
  const wall = opts.wall || '#DCE7F5', h = opts.h || 0.5;
  const top = block(ctx, v, x + 0.1, y + 0.1, 0.8, 0.8, h, { top: opts.roof || '#7E8FA8', left: shade(wall, -0.15), right: shade(wall, -0.35) });
  // sign
  if (opts.sign) {
    const s = toScreen(v, x + 0.5, y + 0.5, h + 0.02);
    ctx.fillStyle = opts.signColor || '#E5484D';
    ctx.beginPath(); ctx.arc(s.X, s.Y, v.tw * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${v.tw * 0.14}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.sign, s.X, s.Y + 1);
  }
  return top;
}

export function tree(ctx, v, x, y, seed = 0) {
  const ox = 0.35 + (seed % 3) * 0.15, oy = 0.35 + ((seed * 7) % 3) * 0.15;
  const b = toScreen(v, x + ox, y + oy, 0);
  ctx.fillStyle = '#6B4A2B'; ctx.fillRect(b.X - v.tw * 0.02, b.Y - v.tw * 0.2, v.tw * 0.04, v.tw * 0.2);
  ctx.fillStyle = '#2E9E4A'; ctx.beginPath(); ctx.arc(b.X, b.Y - v.tw * 0.3, v.tw * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#48C466'; ctx.beginPath(); ctx.arc(b.X - v.tw * 0.04, b.Y - v.tw * 0.34, v.tw * 0.09, 0, Math.PI * 2); ctx.fill();
}

export function solar(ctx, v, x, y) {
  const base = block(ctx, v, x + 0.1, y + 0.1, 0.8, 0.8, 0.04, { top: '#7C8391' });
  // tilted panel: raised on the north edge
  const A = toScreen(v, x + 0.12, y + 0.12, 0.3), B = toScreen(v, x + 0.88, y + 0.12, 0.3), C = toScreen(v, x + 0.88, y + 0.88, 0.1), D = toScreen(v, x + 0.12, y + 0.88, 0.1);
  poly(ctx, [A, B, C, D], '#1F3F8F', '#0F2148');
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const f = i / 4;
    const p1 = toScreen(v, x + 0.12 + 0.76 * f, y + 0.12, 0.3), p2 = toScreen(v, x + 0.12 + 0.76 * f, y + 0.88, 0.1);
    ctx.beginPath(); ctx.moveTo(p1.X, p1.Y); ctx.lineTo(p2.X, p2.Y); ctx.stroke();
    const q1 = toScreen(v, x + 0.12, y + 0.12 + 0.76 * f, 0.3 - 0.2 * f), q2 = toScreen(v, x + 0.88, y + 0.12 + 0.76 * f, 0.3 - 0.2 * f);
    ctx.beginPath(); ctx.moveTo(q1.X, q1.Y); ctx.lineTo(q2.X, q2.Y); ctx.stroke();
  }
  // glint
  ctx.fillStyle = 'rgba(255,255,255,.18)'; poly(ctx, [A, { X: (A.X + B.X) / 2, Y: (A.Y + B.Y) / 2 }, { X: (A.X + D.X) / 2, Y: (A.Y + D.Y) / 2 }], 'rgba(255,255,255,.18)');
  return base;
}

export function battery(ctx, v, x, y, level = 0.7, t = 0) {
  const top = block(ctx, v, x + 0.2, y + 0.2, 0.6, 0.6, 0.42, { top: '#2F8F5B', left: '#256F47', right: '#1B5334' });
  // level bar on left face
  const l1 = toScreen(v, x + 0.25, y + 0.8, 0.05), l2 = toScreen(v, x + 0.75, y + 0.8, 0.05);
  const hh = 0.3 * Math.max(0.03, level);
  const l3 = toScreen(v, x + 0.75, y + 0.8, 0.05 + hh), l4 = toScreen(v, x + 0.25, y + 0.8, 0.05 + hh);
  const b3 = toScreen(v, x + 0.75, y + 0.8, 0.35), b4 = toScreen(v, x + 0.25, y + 0.8, 0.35);
  poly(ctx, [l1, l2, b3, b4], '#0F2A1B');
  poly(ctx, [l1, l2, l3, l4], level < 0.25 ? '#FF6B6B' : '#7CFF9F');
  // status LED blink
  const led = toScreen(v, x + 0.5, y + 0.5, 0.44);
  ctx.fillStyle = (Math.floor(t * 2) % 2 === 0) ? '#7CFF9F' : '#1E5A34';
  ctx.beginPath(); ctx.arc(led.X, led.Y, v.tw * 0.04, 0, Math.PI * 2); ctx.fill();
  return top;
}

export function generator(ctx, v, x, y, running = false, t = 0) {
  const top = block(ctx, v, x + 0.15, y + 0.2, 0.7, 0.6, 0.36, { top: '#8B8F98', left: '#6D717A', right: '#50545C' });
  // exhaust stack
  const s = toScreen(v, x + 0.3, y + 0.35, 0.36);
  ctx.fillStyle = '#3B3E45'; ctx.fillRect(s.X - v.tw * 0.03, s.Y - v.tw * 0.18, v.tw * 0.06, v.tw * 0.18);
  if (running) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.8 + i / 3) % 1;
      ctx.fillStyle = `rgba(200,200,210,${0.5 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(s.X + ph * v.tw * 0.1, s.Y - v.tw * 0.2 - ph * v.tw * 0.35, v.tw * (0.04 + ph * 0.08), 0, Math.PI * 2); ctx.fill();
    }
  }
  // stripe
  const p1 = toScreen(v, x + 0.15, y + 0.8, 0.18), p2 = toScreen(v, x + 0.85, y + 0.8, 0.18);
  ctx.strokeStyle = '#FFB020'; ctx.lineWidth = Math.max(1, v.tw * 0.035); ctx.beginPath(); ctx.moveTo(p1.X, p1.Y); ctx.lineTo(p2.X, p2.Y); ctx.stroke();
  return top;
}

export function turbine(ctx, v, x, y, t = 0, spinning = true) {
  const b = toScreen(v, x + 0.5, y + 0.5, 0);
  const H = v.tw * 0.9;
  ctx.fillStyle = '#D8DCE4'; ctx.fillRect(b.X - v.tw * 0.03, b.Y - H, v.tw * 0.06, H);
  ctx.fillStyle = '#9AA1AD'; ctx.beginPath(); ctx.ellipse(b.X, b.Y, v.tw * 0.14, v.tw * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  const hub = { X: b.X, Y: b.Y - H };
  const ang = spinning ? t * 2.2 : 0.4;
  ctx.strokeStyle = '#F4F1E8'; ctx.lineWidth = Math.max(2, v.tw * 0.04); ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = ang + i * Math.PI * 2 / 3;
    ctx.beginPath(); ctx.moveTo(hub.X, hub.Y); ctx.lineTo(hub.X + Math.cos(a) * v.tw * 0.36, hub.Y + Math.sin(a) * v.tw * 0.36); ctx.stroke();
  }
  ctx.fillStyle = '#FF6B6B'; ctx.beginPath(); ctx.arc(hub.X, hub.Y, v.tw * 0.045, 0, Math.PI * 2); ctx.fill();
}

export function pole(ctx, v, x, y, links = {}, color = '#8B5A2B') {
  const b = toScreen(v, x + 0.5, y + 0.5, 0);
  const H = v.tw * 0.55;
  ctx.fillStyle = color; ctx.fillRect(b.X - v.tw * 0.025, b.Y - H, v.tw * 0.05, H);
  ctx.fillRect(b.X - v.tw * 0.12, b.Y - H + v.tw * 0.04, v.tw * 0.24, v.tw * 0.035);
  ctx.strokeStyle = '#1B1F2A'; ctx.lineWidth = Math.max(1, v.tw * 0.02);
  const top = { X: b.X, Y: b.Y - H + v.tw * 0.04 };
  const link = (dx, dy) => { const n = toScreen(v, x + 0.5 + dx, y + 0.5 + dy, 0); const nt = { X: n.X, Y: n.Y - H + v.tw * 0.04 };
    ctx.beginPath(); ctx.moveTo(top.X, top.Y); ctx.quadraticCurveTo((top.X + nt.X) / 2, (top.Y + nt.Y) / 2 + v.tw * 0.06, nt.X, nt.Y); ctx.stroke(); };
  if (links.e) link(1, 0); if (links.s) link(0, 1);
  if (links.w) link(-1, 0); if (links.n) link(0, -1);
}

export function pump(ctx, v, x, y, running = false, t = 0) {
  const top = block(ctx, v, x + 0.25, y + 0.25, 0.5, 0.5, 0.22, { top: '#3C8BE0', left: '#2E6DB3', right: '#214F82' });
  const c = toScreen(v, x + 0.5, y + 0.5, 0.24);
  ctx.fillStyle = running && Math.floor(t * 3) % 2 === 0 ? '#7CFF9F' : '#FFB020';
  ctx.beginPath(); ctx.arc(c.X, c.Y, v.tw * 0.05, 0, Math.PI * 2); ctx.fill();
  // pipe
  const p1 = toScreen(v, x + 0.75, y + 0.5, 0.1), p2 = toScreen(v, x + 1.0, y + 0.5, 0.1);
  ctx.strokeStyle = '#BFC7D3'; ctx.lineWidth = Math.max(2, v.tw * 0.05); ctx.beginPath(); ctx.moveTo(p1.X, p1.Y); ctx.lineTo(p2.X, p2.Y); ctx.stroke();
  return top;
}

export function tank(ctx, v, x, y, level = 0.5, color = '#8FB7E8') {
  const c = toScreen(v, x + 0.5, y + 0.5, 0);
  const rx = v.tw * 0.28, ry = rx / 2, H = v.tw * 0.45;
  ctx.fillStyle = shade(color, -0.35); ctx.beginPath(); ctx.ellipse(c.X, c.Y, rx, ry, 0, 0, Math.PI); ctx.lineTo(c.X - rx, c.Y - H); ctx.ellipse(c.X, c.Y - H, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(color, -0.15); ctx.fillRect(c.X - rx, c.Y - H, rx, H);
  ctx.fillStyle = shade(color, -0.35); ctx.fillRect(c.X, c.Y - H, rx, H);
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(c.X, c.Y - H, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  // level gauge
  ctx.fillStyle = '#0B1A3A'; ctx.fillRect(c.X - v.tw * 0.04, c.Y - H + ry, v.tw * 0.05, H - ry * 1.2);
  const lh = (H - ry * 1.2) * Math.max(0, Math.min(1, level));
  ctx.fillStyle = '#22D3C5'; ctx.fillRect(c.X - v.tw * 0.04, c.Y - ry * 0.2 - lh, v.tw * 0.05, lh);
}

export function gridPole(ctx, v, x, y, on = true) {
  const b = toScreen(v, x + 0.5, y + 0.5, 0);
  const H = v.tw * 0.95;
  ctx.strokeStyle = '#B7BCC7'; ctx.lineWidth = Math.max(2, v.tw * 0.035);
  ctx.beginPath(); ctx.moveTo(b.X - v.tw * 0.12, b.Y); ctx.lineTo(b.X, b.Y - H); ctx.lineTo(b.X + v.tw * 0.12, b.Y); ctx.stroke();
  for (let i = 1; i <= 3; i++) { const yy = b.Y - H * i / 3.6, w = v.tw * (0.3 - i * 0.05); ctx.beginPath(); ctx.moveTo(b.X - w, yy); ctx.lineTo(b.X + w, yy); ctx.stroke(); }
  ctx.fillStyle = on ? '#7CFF9F' : '#FF6B6B'; ctx.beginPath(); ctx.arc(b.X, b.Y - H, v.tw * 0.05, 0, Math.PI * 2); ctx.fill();
}

export function levee(ctx, v, x, y, height = 1) {
  const h = 0.12 + 0.1 * height;
  return block(ctx, v, x + 0.05, y + 0.25, 0.9, 0.5, h, { top: '#B5A16B', left: '#8E7B4C', right: '#6E5D36' });
}

export function marker(ctx, v, x, y, color, label, t = 0, bounce = true) {
  const b = toScreen(v, x + 0.5, y + 0.5, 0);
  const lift = bounce ? Math.abs(Math.sin(t * 2.5)) * v.tw * 0.12 : 0;
  const y0 = b.Y - v.tw * 0.9 - lift;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(b.X, b.Y, v.tw * 0.16, v.tw * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(b.X, b.Y - lift); ctx.lineTo(b.X - v.tw * 0.22, y0 + v.tw * 0.2); ctx.arc(b.X, y0, v.tw * 0.26, Math.PI * 0.85, Math.PI * 0.15, false); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#06101F'; ctx.font = `bold ${v.tw * 0.28}px Bungee, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, b.X, y0 + 1);
}

export function cursor(ctx, v, x, y, color = '#FFB020', t = 0) {
  const pulse = 0.85 + 0.15 * Math.sin(t * 6);
  ctx.save(); ctx.globalAlpha = pulse;
  ctx.lineWidth = Math.max(2, v.tw * 0.05); ctx.strokeStyle = color;
  const A = toScreen(v, x, y, 0.02), B = toScreen(v, x + 1, y, 0.02), C = toScreen(v, x + 1, y + 1, 0.02), D = toScreen(v, x, y + 1, 0.02);
  poly(ctx, [A, B, C, D], 'rgba(255,176,32,.18)', color);
  ctx.restore();
}

// Sky with day/night mixing. `day` in [0,1]: 1 = noon, 0 = midnight.
export function sky(ctx, W, H, day, t = 0) {
  const top = mix('#060E22', '#3A8BE0', day), bot = mix('#0B1A3A', '#BFE3FF', day);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (day < 0.55) {
    ctx.fillStyle = `rgba(255,255,255,${(0.55 - day) * 1.4})`;
    for (let i = 0; i < 40; i++) { const sx = ((i * 97) % 101) / 101 * W, sy = ((i * 53) % 37) / 37 * H * 0.5; const tw = 0.6 + 0.4 * Math.sin(t * 3 + i); ctx.globalAlpha = tw * (0.55 - day) * 1.6; ctx.fillRect(sx, sy, 2, 2); }
    ctx.globalAlpha = 1;
  }
  // sun / moon
  const cx = W * 0.85, cy = H * 0.14;
  if (day > 0.5) { ctx.fillStyle = '#FFD86B'; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.fillStyle = '#E8ECF5'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill(); }
}
export function nightOverlay(ctx, W, H, day) {
  if (day < 0.5) { ctx.fillStyle = `rgba(6,14,34,${(0.5 - day) * 0.9})`; ctx.fillRect(0, 0, W, H); }
}
export function mix(a, b, f) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) * (1 - f) + (pb >> 16) * f) | 0, g = (((pa >> 8) & 255) * (1 - f) + ((pb >> 8) & 255) * f) | 0, bl = ((pa & 255) * (1 - f) + (pb & 255) * f) | 0;
  return `rgb(${r},${g},${bl})`;
}
// day fraction from an hour-of-day: 0 at 0h, 1 at 12h
export function dayFromHour(h) { return 0.5 - 0.5 * Math.cos(h / 24 * Math.PI * 2); }

export function label(ctx, v, x, y, text, z = 0.5, color = '#F4F1E8') {
  const p = toScreen(v, x + 0.5, y + 0.5, z);
  ctx.font = `700 ${Math.max(9, v.tw * 0.16)}px "Chakra Petch", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(6,14,34,.75)'; ctx.fillRect(p.X - w / 2, p.Y - v.tw * 0.2, w, v.tw * 0.2);
  ctx.fillStyle = color; ctx.fillText(text, p.X, p.Y - 2);
}

export function setupCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}
