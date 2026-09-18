// LUMA plotting — no chart library. One layout routine feeds a canvas renderer,
// an SVG renderer (for reports) and a textual describer (for screen readers).
//
// spec = {
//   xLabel, yLabel,
//   series: [{ label, points: [[x,y],...], kind: 'line'|'points'|'both', dash: 'solid'|'dash'|'dot'|'dashdot', color: 'a'|'b'|'c'|'d', marker: 'circle'|'square'|'triangle' }],
//   fit: { slope, intercept, label } | null,
//   xmin, xmax, ymin, ymax  (optional overrides), zeroX, zeroY (force include zero)
// }

const DASH = { solid: [], dash: [7, 5], dot: [2, 4], dashdot: [8, 4, 2, 4] };
const COLORS = {
  dark: { a: '#5CFF8A', b: '#59D6FF', c: '#FFB547', d: '#C89BFF', fit: '#FF6B6B', axis: '#6E7E8A', grid: '#1F2A32', text: '#9BABB7', bg: '#07090B' },
  hc:   { a: '#7CFFA5', b: '#8BE4FF', c: '#FFD37A', d: '#E0C4FF', fit: '#FF8A8A', axis: '#C4C4C4', grid: '#5A5A5A', text: '#FFFFFF', bg: '#000000' },
  print:{ a: '#0a7a34', b: '#0b5fa5', c: '#a35a00', d: '#6b2fb3', fit: '#b00020', axis: '#333', grid: '#ddd', text: '#222', bg: '#fff' },
};

export function linearFit(points) {
  const pts = points.filter(p => isFinite(p[0]) && isFinite(p[1]));
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - sy * sy / n;
  let ssRes = 0;
  for (const [x, y] of pts) ssRes += (y - (slope * x + intercept)) ** 2;
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  // standard error of slope
  const seSlope = n > 2 ? Math.sqrt((ssRes / (n - 2)) / (sxx - sx * sx / n)) : NaN;
  return { slope, intercept, r2, n, seSlope };
}

function niceStep(range, target = 6) {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const f = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return f * p;
}
function ticks(min, max, target) {
  const step = niceStep(max - min, target);
  const out = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function fmtTick(v) {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

export function layout(spec, W, H) {
  const pad = { l: 58, r: 14, t: 14, b: 42 };
  const all = [];
  for (const s of spec.series || []) for (const p of s.points || []) if (isFinite(p[0]) && isFinite(p[1])) all.push(p);
  let xmin = Math.min(...all.map(p => p[0])), xmax = Math.max(...all.map(p => p[0]));
  let ymin = Math.min(...all.map(p => p[1])), ymax = Math.max(...all.map(p => p[1]));
  if (!all.length) { xmin = 0; xmax = 1; ymin = 0; ymax = 1; }
  if (spec.zeroX) { xmin = Math.min(0, xmin); xmax = Math.max(0, xmax); }
  if (spec.zeroY) { ymin = Math.min(0, ymin); ymax = Math.max(0, ymax); }
  if (spec.xmin !== undefined) xmin = spec.xmin;
  if (spec.xmax !== undefined) xmax = spec.xmax;
  if (spec.ymin !== undefined) ymin = spec.ymin;
  if (spec.ymax !== undefined) ymax = spec.ymax;
  if (xmax - xmin < 1e-12) { xmin -= 1; xmax += 1; }
  if (ymax - ymin < 1e-12) { ymin -= Math.abs(ymin) * 0.1 || 1; ymax += Math.abs(ymax) * 0.1 || 1; }
  // pad y a little
  const py = (ymax - ymin) * 0.06; ymin -= spec.ymin !== undefined ? 0 : py; ymax += spec.ymax !== undefined ? 0 : py;
  const px = (xmax - xmin) * 0.03; xmin -= spec.xmin !== undefined ? 0 : px; xmax += spec.xmax !== undefined ? 0 : px;
  const xt = ticks(xmin, xmax, W < 360 ? 4 : 6), yt = ticks(ymin, ymax, 5);
  const x0 = pad.l, x1 = W - pad.r, y0 = pad.t, y1 = H - pad.b;
  const sx = x => x0 + (x - xmin) / (xmax - xmin) * (x1 - x0);
  const sy = y => y1 - (y - ymin) / (ymax - ymin) * (y1 - y0);
  return { xmin, xmax, ymin, ymax, xt, yt, x0, x1, y0, y1, sx, sy, W, H, n: all.length };
}

function themeFor(el) {
  const root = document.documentElement;
  return root.classList.contains('hc') ? COLORS.hc : COLORS.dark;
}

export function drawCanvas(canvas, spec, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(200, Math.round(rect.width)), H = Math.max(160, Math.round(rect.height));
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = opts.theme || themeFor(canvas);
  const L = layout(spec, W, H);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.font = '11px "IBM Plex Mono", monospace';
  // grid
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.setLineDash([]);
  for (const t of L.xt) { const x = Math.round(L.sx(t)) + .5; ctx.beginPath(); ctx.moveTo(x, L.y0); ctx.lineTo(x, L.y1); ctx.stroke(); }
  for (const t of L.yt) { const y = Math.round(L.sy(t)) + .5; ctx.beginPath(); ctx.moveTo(L.x0, y); ctx.lineTo(L.x1, y); ctx.stroke(); }
  // axes
  ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(L.x0 + .5, L.y0); ctx.lineTo(L.x0 + .5, L.y1 + .5); ctx.lineTo(L.x1, L.y1 + .5); ctx.stroke();
  ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of L.xt) ctx.fillText(fmtTick(t), L.sx(t), L.y1 + 5);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of L.yt) ctx.fillText(fmtTick(t), L.x0 - 6, L.sy(t));
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(spec.xLabel || '', (L.x0 + L.x1) / 2, H - 4);
  ctx.save(); ctx.translate(12, (L.y0 + L.y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.fillText(spec.yLabel || '', 0, 0); ctx.restore();
  // clip to plot area
  ctx.save(); ctx.beginPath(); ctx.rect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0); ctx.clip();
  // fit line
  if (spec.fit && isFinite(spec.fit.slope)) {
    ctx.strokeStyle = C.fit; ctx.lineWidth = 1.5; ctx.setLineDash(DASH.dashdot);
    ctx.beginPath(); ctx.moveTo(L.sx(L.xmin), L.sy(spec.fit.slope * L.xmin + spec.fit.intercept)); ctx.lineTo(L.sx(L.xmax), L.sy(spec.fit.slope * L.xmax + spec.fit.intercept)); ctx.stroke();
  }
  for (const s of spec.series || []) {
    const col = C[s.color || 'a'];
    const pts = (s.points || []).filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (!pts.length) continue;
    const kind = s.kind || 'line';
    if (kind !== 'points') {
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(DASH[s.dash || 'solid']);
      ctx.beginPath();
      pts.forEach((p, i) => { const x = L.sx(p[0]), y = L.sy(p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    if (kind !== 'line') {
      ctx.fillStyle = col; ctx.setLineDash([]);
      for (const p of pts) marker(ctx, L.sx(p[0]), L.sy(p[1]), s.marker || 'circle', 4);
    }
  }
  ctx.restore();
  // legend
  let lx = L.x0 + 8, ly = L.y0 + 6;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const items = [...(spec.series || []).map(s => ({ label: s.label, col: C[s.color || 'a'], dash: s.dash || 'solid', kind: s.kind || 'line', marker: s.marker || 'circle' }))];
  if (spec.fit && isFinite(spec.fit.slope)) items.push({ label: spec.fit.label || 'Linear fit', col: C.fit, dash: 'dashdot', kind: 'line' });
  for (const it of items) {
    if (!it.label) continue;
    const w = ctx.measureText(it.label).width + 34;
    if (lx + w > L.x1 - 4) { lx = L.x0 + 8; ly += 16; }
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(lx - 3, ly - 7, w, 14);
    ctx.strokeStyle = it.col; ctx.fillStyle = it.col; ctx.lineWidth = 2; ctx.setLineDash(DASH[it.dash]);
    if (it.kind !== 'points') { ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke(); }
    if (it.kind !== 'line') { ctx.setLineDash([]); marker(ctx, lx + 11, ly, it.marker, 3.5); }
    ctx.fillStyle = C.text; ctx.setLineDash([]);
    ctx.fillText(it.label, lx + 28, ly);
    lx += w + 6;
  }
  if (!L.n) { ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.fillText(opts.emptyText || 'No data yet — take a measurement', (L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2); }
  return L;
}

function marker(ctx, x, y, kind, r) {
  ctx.beginPath();
  if (kind === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (kind === 'triangle') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y + r); ctx.lineTo(x - r - 1, y + r); ctx.closePath(); }
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSVG(spec, W = 640, H = 340, theme = 'print', title = '') {
  const C = COLORS[theme] || COLORS.print;
  const L = layout(spec, W, H);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title || describe(spec))}" font-family="IBM Plex Mono, monospace" font-size="11">`);
  o.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  for (const t of L.xt) o.push(`<line x1="${L.sx(t).toFixed(1)}" y1="${L.y0}" x2="${L.sx(t).toFixed(1)}" y2="${L.y1}" stroke="${C.grid}"/>`);
  for (const t of L.yt) o.push(`<line x1="${L.x0}" y1="${L.sy(t).toFixed(1)}" x2="${L.x1}" y2="${L.sy(t).toFixed(1)}" stroke="${C.grid}"/>`);
  o.push(`<path d="M${L.x0} ${L.y0} V${L.y1} H${L.x1}" fill="none" stroke="${C.axis}"/>`);
  for (const t of L.xt) o.push(`<text x="${L.sx(t).toFixed(1)}" y="${L.y1 + 15}" text-anchor="middle" fill="${C.text}">${fmtTick(t)}</text>`);
  for (const t of L.yt) o.push(`<text x="${L.x0 - 6}" y="${(L.sy(t) + 4).toFixed(1)}" text-anchor="end" fill="${C.text}">${fmtTick(t)}</text>`);
  o.push(`<text x="${(L.x0 + L.x1) / 2}" y="${H - 6}" text-anchor="middle" fill="${C.text}">${esc(spec.xLabel || '')}</text>`);
  o.push(`<text transform="translate(14 ${(L.y0 + L.y1) / 2}) rotate(-90)" text-anchor="middle" fill="${C.text}">${esc(spec.yLabel || '')}</text>`);
  o.push(`<clipPath id="clip"><rect x="${L.x0}" y="${L.y0}" width="${L.x1 - L.x0}" height="${L.y1 - L.y0}"/></clipPath><g clip-path="url(#clip)">`);
  if (spec.fit && isFinite(spec.fit.slope)) {
    o.push(`<line x1="${L.sx(L.xmin).toFixed(1)}" y1="${L.sy(spec.fit.slope * L.xmin + spec.fit.intercept).toFixed(1)}" x2="${L.sx(L.xmax).toFixed(1)}" y2="${L.sy(spec.fit.slope * L.xmax + spec.fit.intercept).toFixed(1)}" stroke="${C.fit}" stroke-width="1.5" stroke-dasharray="8 4 2 4"/>`);
  }
  for (const s of spec.series || []) {
    const col = C[s.color || 'a'];
    const pts = (s.points || []).filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (!pts.length) continue;
    const kind = s.kind || 'line';
    if (kind !== 'points') {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${L.sx(p[0]).toFixed(1)} ${L.sy(p[1]).toFixed(1)}`).join('');
      o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="${DASH[s.dash || 'solid'].join(' ')}"/>`);
    }
    if (kind !== 'line') {
      for (const p of pts) {
        const x = L.sx(p[0]), y = L.sy(p[1]);
        if (s.marker === 'square') o.push(`<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" fill="${col}"/>`);
        else if (s.marker === 'triangle') o.push(`<path d="M${x.toFixed(1)} ${(y - 5).toFixed(1)} L${(x + 5).toFixed(1)} ${(y + 4).toFixed(1)} L${(x - 5).toFixed(1)} ${(y + 4).toFixed(1)}Z" fill="${col}"/>`);
        else o.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${col}"/>`);
      }
    }
  }
  o.push('</g>');
  // legend
  let lx = L.x0 + 8, ly = L.y0 + 10;
  const items = [...(spec.series || []).map(s => ({ label: s.label, col: C[s.color || 'a'], dash: s.dash || 'solid', kind: s.kind || 'line' }))];
  if (spec.fit && isFinite(spec.fit.slope)) items.push({ label: spec.fit.label || 'Linear fit', col: C.fit, dash: 'dashdot', kind: 'line' });
  for (const it of items) {
    if (!it.label) continue;
    const w = it.label.length * 6.6 + 34;
    if (lx + w > L.x1 - 4) { lx = L.x0 + 8; ly += 16; }
    if (it.kind !== 'points') o.push(`<line x1="${lx}" y1="${ly}" x2="${lx + 22}" y2="${ly}" stroke="${it.col}" stroke-width="2" stroke-dasharray="${DASH[it.dash].join(' ')}"/>`);
    if (it.kind !== 'line') o.push(`<circle cx="${lx + 11}" cy="${ly}" r="3.5" fill="${it.col}"/>`);
    o.push(`<text x="${lx + 28}" y="${ly + 4}" fill="${C.text}">${esc(it.label)}</text>`);
    lx += w + 6;
  }
  o.push('</svg>');
  return o.join('');
}

/** Textual summary: trend, extrema, fit — for screen readers and reports. */
export function describe(spec) {
  const parts = [];
  const series = (spec.series || []).filter(s => (s.points || []).some(p => isFinite(p[0]) && isFinite(p[1])));
  if (!series.length) return `Graph of ${spec.yLabel || 'y'} against ${spec.xLabel || 'x'}. No data plotted yet.`;
  parts.push(`Graph of ${spec.yLabel || 'y'} against ${spec.xLabel || 'x'} with ${series.length} series.`);
  for (const s of series) {
    const pts = s.points.filter(p => isFinite(p[0]) && isFinite(p[1])).slice().sort((a, b) => a[0] - b[0]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const iMin = ys.indexOf(ymin), iMax = ys.indexOf(ymax);
    let trend = 'is roughly constant';
    if (pts.length >= 2) {
      const f = linearFit(pts);
      const span = ymax - ymin;
      if (f && span > 1e-9) {
        const rel = f.slope * (xs[xs.length - 1] - xs[0]) / (Math.abs(ymax) + Math.abs(ymin) + 1e-12);
        if (f.r2 > 0.9) trend = rel > 0.05 ? 'increases approximately linearly' : rel < -0.05 ? 'decreases approximately linearly' : 'is roughly constant';
        else {
          // detect a peak
          if (iMax > 0 && iMax < pts.length - 1 && ys[0] < ymax && ys[ys.length - 1] < ymax) trend = `rises to a peak of ${fmtTick(ymax)} at x = ${fmtTick(xs[iMax])} then falls`;
          else if (iMin > 0 && iMin < pts.length - 1) trend = `falls to a minimum of ${fmtTick(ymin)} at x = ${fmtTick(xs[iMin])} then rises`;
          else trend = ys[ys.length - 1] > ys[0] ? 'increases non-linearly' : 'decreases non-linearly';
        }
      }
    }
    parts.push(`${s.label} (${s.kind === 'points' ? 'points' : (s.dash || 'solid') + ' line'}, ${pts.length} point${pts.length === 1 ? '' : 's'}): ${trend}; x from ${fmtTick(xs[0])} to ${fmtTick(xs[xs.length - 1])}; y minimum ${fmtTick(ymin)} at x = ${fmtTick(xs[iMin])}, maximum ${fmtTick(ymax)} at x = ${fmtTick(xs[iMax])}.`);
  }
  if (spec.fit && isFinite(spec.fit.slope)) {
    parts.push(`${spec.fit.label || 'Linear fit'}: slope ${fmtTick(spec.fit.slope)}, intercept ${fmtTick(spec.fit.intercept)}${isFinite(spec.fit.r2) ? `, R² = ${spec.fit.r2.toFixed(3)}` : ''}.`);
    if (spec.fit.meaning) parts.push(spec.fit.meaning);
  }
  return parts.join(' ');
}
