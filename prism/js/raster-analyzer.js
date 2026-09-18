// PRISM — raster (PNG/JPG) analysis with plain canvas heuristics.
// No OCR, no machine learning. Everything here is pixel arithmetic:
//   1. downscale + grayscale + background estimate + ink mask
//   2. long horizontal / vertical lines (axes, table grids)
//   3. dominant non-grey colours → curve pixel runs → sampled points
//   4. connected components → text-like clusters vs. large shapes
//   5. convex hull + polygon simplification → triangle / rectangle / circle
//   6. classification with a confidence score, plus honest notes.

const MAX_W = 360;

export async function analyzeRaster(img, { name = 'uploaded image' } = {}) {
  const natW = img.naturalWidth || img.width, natH = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_W / natW);
  const w = Math.max(8, Math.round(natW * scale)), h = Math.max(8, Math.round(natH * scale));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const N = w * h;
  const lum = new Uint8Array(N), sat = new Uint8Array(N), hue = new Int16Array(N);
  const hist = new Uint32Array(16);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const L = a < 40 ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lum[i] = L; sat[i] = a < 40 ? 0 : mx - mn; hist[L >> 4]++;
    if (mx - mn > 0) { let H; if (mx === r) H = ((g - b) / (mx - mn)) % 6; else if (mx === g) H = (b - r) / (mx - mn) + 2; else H = (r - g) / (mx - mn) + 4; hue[i] = Math.round(((H * 60) + 360) % 360); } else hue[i] = -1;
  }
  let bgBin = 0; for (let k = 1; k < 16; k++) if (hist[k] > hist[bgBin]) bgBin = k;
  const bgLum = bgBin * 16 + 8, darkBg = bgLum < 128;
  const ink = new Uint8Array(N), colour = new Uint8Array(N), tint = new Uint8Array(N);
  let inkCount = 0;
  for (let i = 0; i < N; i++) {
    const diff = Math.abs(lum[i] - bgLum);
    colour[i] = sat[i] > 70 ? 1 : 0;
    tint[i] = sat[i] > 25 ? 1 : 0; // includes the anti-aliased fringe of coloured strokes
    ink[i] = (diff > 55 || colour[i]) ? 1 : 0; inkCount += ink[i];
  }
  const inkFraction = inkCount / N;

  /* ---- 2. long lines ---- */
  const minRun = Math.round(w * 0.35), minRunV = Math.round(h * 0.35);
  const rowLines = [], colLines = [];
  // A run may pass through coloured pixels (a curve crossing an axis) but must be mostly dark ink.
  const scan = (len, at, minLen, push) => { let run = 0, dark = 0, best = 0, bestEnd = 0, bestDark = 0; for (let i = 0; i <= len; i++) { const idx = i < len ? at(i) : -1; if (idx >= 0 && ink[idx]) { run++; if (!colour[idx]) dark++; } else { if (run > best) { best = run; bestEnd = i; bestDark = dark; } run = 0; dark = 0; } } if (best >= minLen && bestDark / best >= 0.6) push(bestEnd - best, bestEnd - 1); };
  for (let y = 0; y < h; y++) scan(w, (x) => y * w + x, minRun, (a, b) => rowLines.push({ y, x0: a, x1: b }));
  for (let x = 0; x < w; x++) scan(h, (y) => y * w + x, minRunV, (a, b) => colLines.push({ x, y0: a, y1: b }));
  const merge = (arr, key) => { const out = []; for (const l of arr) { const last = out[out.length - 1]; if (last && l[key] - last[key + 'End'] <= 1) { last[key + 'End'] = l[key]; last.thickness++; } else out.push({ ...l, [key + 'End']: l[key], thickness: 1 }); } return out.map(l => ({ ...l, [key]: Math.round((l[key] + l[key + 'End']) / 2) })); };
  // Thick "lines" are filled regions (a solid circle, a block), not rules.
  const maxThick = Math.max(4, Math.round(Math.min(w, h) * 0.025));
  let hLines = merge(rowLines, 'y').filter(l => l.thickness <= maxThick), vLines = merge(colLines, 'x').filter(l => l.thickness <= maxThick);

  /* ---- axes: a vertical line in the left half meeting a horizontal line in the lower half ---- */
  let axes = null;
  const inkNear = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && ink[yy * w + xx]) return true; } return false; };
  for (const v of vLines) { if (v.x > w * 0.5) continue; for (const hl of hLines) { if (hl.y < h * 0.4) continue; const meets = Math.abs(hl.x0 - v.x) < w * 0.05 && Math.abs(v.y1 - hl.y) < h * 0.05; if (!meets) continue;
      // If ink runs along the segment joining the two far ends, this is a triangle outline, not a pair of axes.
      let hits = 0; for (let k = 1; k < 20; k++) { const t = k / 20; if (inkNear(hl.x1 + (v.x - hl.x1) * t, hl.y + (v.y0 - hl.y) * t)) hits++; }
      if (hits >= 14) { hLines = hLines.filter(l => l !== hl); vLines = vLines.filter(l => l !== v); continue; }
      axes = { originX: v.x, originY: hl.y, xEnd: hl.x1, yTop: v.y0 }; break; } if (axes) break; }
  const lineMask = new Uint8Array(N);
  for (const l of hLines) for (let y = l.y - l.thickness; y <= l.y + l.thickness; y++) if (y >= 0 && y < h) for (let x = l.x0; x <= l.x1; x++) lineMask[y * w + x] = 1;
  for (const l of vLines) for (let x = l.x - l.thickness; x <= l.x + l.thickness; x++) if (x >= 0 && x < w) for (let y = l.y0; y <= l.y1; y++) lineMask[y * w + x] = 1;

  /* ---- grid / table ---- */
  let grid = null;
  if (hLines.length >= 3 && vLines.length >= 3) {
    const hs = hLines.filter(l => (l.x1 - l.x0) > w * 0.5), vs = vLines.filter(l => (l.y1 - l.y0) > h * 0.5);
    if (hs.length >= 3 && vs.length >= 3) {
      const gaps = (arr, k) => arr.slice(1).map((l, i) => l[k] - arr[i][k]);
      const regular = (g) => { const m = g.reduce((a, b) => a + b, 0) / g.length; return g.every(x => Math.abs(x - m) < m * 0.6); };
      if (regular(gaps(hs, 'y')) && regular(gaps(vs, 'x'))) grid = { rows: hs.length - 1, cols: vs.length - 1, hs, vs };
    }
  }
  if (grid) axes = null; // the outer rules of a grid are not axes

  /* ---- 3. coloured curves ---- */
  const BINS = 12, binCount = new Uint32Array(BINS);
  const plotL = axes ? axes.originX + 2 : 0, plotR = axes ? axes.xEnd : w - 1, plotT = axes ? axes.yTop : 0, plotB = axes ? axes.originY - 2 : h - 1;
  for (let y = plotT; y <= plotB; y++) for (let x = plotL; x <= plotR; x++) { const i = y * w + x; if (colour[i] && !lineMask[i]) binCount[Math.floor(hue[i] / (360 / BINS))]++; }
  const minColour = Math.max(30, N * 0.0015);
  const colourBins = []; for (let b = 0; b < BINS; b++) if (binCount[b] >= minColour) colourBins.push(b);
  // merge adjacent bins (a red curve straddles bins 0 and 11)
  const groups = []; for (const b of colourBins) { const last = groups[groups.length - 1]; if (last && (b - last[last.length - 1] === 1)) last.push(b); else groups.push([b]); }
  if (groups.length > 1 && groups[0][0] === 0 && groups[groups.length - 1].includes(BINS - 1)) { groups[0].push(...groups.pop()); }
  const series = [];
  const hueName = (hDeg) => { const names = [[15, 'red'], [45, 'orange'], [70, 'yellow'], [160, 'green'], [200, 'cyan'], [260, 'blue'], [300, 'purple'], [345, 'pink'], [360, 'red']]; for (const [lim, n] of names) if (hDeg < lim) return n; return 'red'; };
  for (const g of groups) {
    const inGroup = (i) => colour[i] && !lineMask[i] && g.includes(Math.floor(hue[i] / (360 / BINS)));
    const colSum = new Float64Array(w), colN = new Uint16Array(w), colMin = new Int16Array(w).fill(-1), colMax = new Int16Array(w).fill(-1);
    let rs = 0, gs = 0, bs = 0, cnt = 0, hueSum = 0;
    for (let y = plotT; y <= plotB; y++) for (let x = plotL; x <= plotR; x++) { const i = y * w + x; if (inGroup(i)) { colSum[x] += y; colN[x]++; if (colMin[x] < 0) colMin[x] = y; colMax[x] = y; rs += data[i * 4]; gs += data[i * 4 + 1]; bs += data[i * 4 + 2]; cnt++; hueSum += hue[i]; } }
    if (cnt < minColour) continue;
    const color = `rgb(${Math.round(rs / cnt)},${Math.round(gs / cnt)},${Math.round(bs / cnt)})`;
    const cols = []; for (let x = plotL; x <= plotR; x++) if (colN[x]) cols.push(x);
    const coverage = cols.length / Math.max(1, plotR - plotL);
    const extents = cols.map(x => colMax[x] - colMin[x]); extents.sort((a, b) => a - b);
    const medExtent = extents[Math.floor(extents.length / 2)] || 0;
    // contiguous column runs
    const runs = []; let start = null; for (let x = plotL; x <= plotR + 1; x++) { if (x <= plotR && colN[x]) { if (start === null) start = x; } else if (start !== null) { runs.push([start, x - 1]); start = null; } }
    let kind = 'line';
    // Bars: several similar-width column runs, each a solidly filled block of its own height.
    const runInfo = runs.map(([a, b]) => { let filled = 0, top = h, bottom = 0; for (let x = a; x <= b; x++) { filled += colN[x]; if (colMin[x] >= 0 && colMin[x] < top) top = colMin[x]; if (colMax[x] > bottom) bottom = colMax[x]; } const ext = bottom - top + 1; return { width: b - a + 1, ext, fill: filled / ((b - a + 1) * ext) }; });
    const widths = runInfo.map(r => r.width);
    if (runs.length >= 2 && runInfo.every(r => r.width >= 3 && r.fill > 0.6) && Math.max(...runInfo.map(r => r.ext)) > (plotB - plotT) * 0.15 && Math.max(...widths) / Math.min(...widths) < 2.5) kind = 'bar';
    else if (coverage < 0.5 && runs.length >= 4 && runs.every(([a, b]) => b - a < w * 0.06)) kind = 'scatter';
    let px = [];
    if (kind === 'bar') px = runs.map(([a, b]) => { let top = h; for (let x = a; x <= b; x++) if (colMin[x] >= 0 && colMin[x] < top) top = colMin[x]; return [(a + b) / 2, top]; });
    else if (kind === 'scatter') px = runs.map(([a, b]) => { let sy = 0, n = 0; for (let x = a; x <= b; x++) { sy += colSum[x]; n += colN[x]; } return [(a + b) / 2, sy / n]; });
    else { const step = Math.max(1, Math.round((plotR - plotL) / 24)); for (let x = plotL; x <= plotR; x += step) { let best = -1, bd = 1e9; for (let d = 0; d <= step / 2; d++) { for (const xx of [x + d, x - d]) if (xx >= plotL && xx <= plotR && colN[xx] && d < bd) { best = xx; bd = d; } if (best >= 0) break; } if (best >= 0) px.push([best, colSum[best] / colN[best]]); } }
    if (px.length < 2) continue;
    const name = `${hueName(hueSum / cnt)} ${kind === 'bar' ? 'bars' : kind === 'scatter' ? 'points' : 'curve'}`;
    series.push({ id: 'series-' + (series.length + 1), name, kind, color, pxSmall: px, coverage: Math.round(coverage * 100), pixels: cnt });
  }

  /* ---- 4. connected components on ink minus long lines and curves ---- */
  const label = new Int32Array(N).fill(-1); const comps = [];
  const stack = new Int32Array(N);
  const isCurvePixel = (i) => tint[i] && series.length && !lineMask[i];
  for (let s = 0; s < N; s++) {
    if (!ink[s] || lineMask[s] || label[s] >= 0 || (axes && isCurvePixel(s))) continue;
    let sp = 0; stack[sp++] = s; label[s] = comps.length;
    const c = { id: comps.length, n: 0, x0: w, y0: h, x1: 0, y1: 0, boundary: [] };
    while (sp) { const i = stack[--sp]; const x = i % w, y = (i - x) / w; c.n++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      let edge = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) { edge = true; continue; } const j = ny * w + nx; if (!ink[j] || lineMask[j]) edge = true; else if (label[j] < 0) { label[j] = c.id; stack[sp++] = j; } }
      if (edge) c.boundary.push([x, y]); }
    comps.push(c);
  }
  const small = [], large = [];
  for (const c of comps) { const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1; if (c.n < 3) continue; if (bh <= h * 0.07 && bw <= w * 0.12 && bh <= 28) small.push(c); else if (c.n >= 12) large.push(c); }
  // cluster small components into text-like regions (horizontal neighbours with vertical overlap)
  small.sort((a, b) => a.x0 - b.x0);
  const regions = []; const used = new Set();
  for (const c of small) { if (used.has(c.id)) continue; const reg = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, glyphs: 1 }; used.add(c.id); let grew = true; while (grew) { grew = false; for (const d of small) { if (used.has(d.id)) continue; const hgt = Math.max(reg.y1 - reg.y0, d.y1 - d.y0) + 1; const gap = d.x0 - reg.x1; const overlap = Math.min(reg.y1, d.y1) - Math.max(reg.y0, d.y0); if (gap <= hgt * 1.2 && gap > -hgt && overlap > -hgt * 0.3) { reg.x0 = Math.min(reg.x0, d.x0); reg.y0 = Math.min(reg.y0, d.y0); reg.x1 = Math.max(reg.x1, d.x1); reg.y1 = Math.max(reg.y1, d.y1); reg.glyphs++; used.add(d.id); grew = true; } } } regions.push(reg); }
  const textRegions = regions.filter(r => r.glyphs >= 2 || (r.x1 - r.x0) > (r.y1 - r.y0) * 2.5);

  /* ---- 5. shape approximation ---- */
  const shapes = large.map((c, idx) => classifyShape(c, idx));

  /* ---- 6. classification ---- */
  let type = 'unknown', confidence = 0.2; const notes = [];
  if (grid) { type = 'table'; confidence = 0.55 + Math.min(0.3, grid.rows * grid.cols * 0.01); }
  else if (axes && series.length) { type = 'graph'; confidence = 0.6 + Math.min(0.3, series.length * 0.1 + (series[0].coverage > 60 ? 0.1 : 0)); }
  else if (axes) { type = 'graph'; confidence = 0.45; notes.push('Axes were found but no coloured data series. Black-on-white curves cannot be separated from axes and text by colour alone.'); }
  else if (shapes.length) { type = 'diagram'; confidence = 0.4 + Math.min(0.3, shapes.length * 0.08 + (textRegions.length ? 0.1 : 0)); }
  else if (series.length) { type = 'graph'; confidence = 0.35; notes.push('Coloured runs were found but no axes; positions are given as fractions of the image.'); }
  else if (textRegions.length >= 3 && inkFraction < 0.3) { type = 'diagram'; confidence = 0.3; notes.push('Mostly text-like marks. This may be a page of text or an equation, which PRISM cannot read.'); }
  if (inkFraction > 0.6) { notes.push('More than 60% of the image is non-background. Photographs and dense images are outside what these heuristics can analyse.'); confidence = Math.min(confidence, 0.3); }
  if (textRegions.length) notes.push(`${textRegions.length} text-like region${textRegions.length > 1 ? 's' : ''} detected but NOT read. PRISM has no OCR; add axis labels, units and values in Refine.`);
  if (darkBg) notes.push('Dark background detected; the image was analysed as light-on-dark.');
  if (type === 'graph' && axes) notes.push('Axis tick values were not read. Data values are fractions of the axis length (0 to 1) until you enter the real axis range in Refine.');
  confidence = Math.round(Math.min(0.95, confidence) * 100) / 100;

  /* ---- build the scene in original pixel coordinates ---- */
  const S = 1 / scale;
  const objects = [], sceneSeries = [];
  let sceneAxes = null;
  if (axes) {
    sceneAxes = { x: { label: 'x (label not read)', unit: '', min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], px0: axes.originX * S, px1: axes.xEnd * S }, y: { label: 'y (label not read)', unit: '', min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], px0: axes.originY * S, px1: axes.yTop * S } };
    notes.push(`Axes found: origin at pixel (${Math.round(axes.originX * S)}, ${Math.round(axes.originY * S)}), x-axis ${Math.round((axes.xEnd - axes.originX) * S)} px long, y-axis ${Math.round((axes.originY - axes.yTop) * S)} px long.`);
  }
  for (const s of series) {
    const px = s.pxSmall.map(([x, y]) => [x * S, y * S]);
    const points = px.map(([x, y]) => axes ? [r3((x - sceneAxes.x.px0) / (sceneAxes.x.px1 - sceneAxes.x.px0)), r3((y - sceneAxes.y.px0) / (sceneAxes.y.px1 - sceneAxes.y.px0))] : [r3(x / natW), r3(1 - y / natH)]);
    sceneSeries.push({ id: s.id, name: s.name, kind: s.kind, color: s.color, px, points, coverage: s.coverage });
  }
  let table = null;
  if (grid) {
    objects.push({ id: 'grid', kind: 'grid', label: `Grid of ${grid.rows} rows by ${grid.cols} columns`, color: '#111318', props: { 'Rows': String(grid.rows), 'Columns': String(grid.cols), 'Cell contents': 'not read (no OCR)' }, desc: `${grid.rows} by ${grid.cols} grid detected from ${grid.hs.length} horizontal and ${grid.vs.length} vertical lines.`, shapes: [...grid.hs.map(l => ({ shape: 'line', x1: l.x0 * S, y1: l.y * S, x2: l.x1 * S, y2: l.y * S, width: 2 })), ...grid.vs.map(l => ({ shape: 'line', x1: l.x * S, y1: l.y0 * S, x2: l.x * S, y2: l.y1 * S, width: 2 }))] });
    table = { headers: Array.from({ length: grid.cols }, (_, c) => `Column ${c + 1}`), rows: Array.from({ length: grid.rows - 1 }, () => Array(grid.cols).fill('?')) };
    notes.push('Table cells were located by their grid lines; their contents are shown as "?" for you to fill in.');
  }
  shapes.forEach(sh => objects.push({ ...sh, shapes: sh.shapes.map(g => scaleShape(g, S)), props: { ...sh.props, 'Size': `${Math.round(sh.bw * S)} × ${Math.round(sh.bh * S)} px`, 'Position': `${Math.round(sh.cx / w * 100)}% across, ${Math.round(sh.cy / h * 100)}% down` } }));
  textRegions.forEach((r, i) => objects.push({ id: 'text-' + (i + 1), kind: 'text', label: `Text region ${i + 1} (not read)`, color: '#6B7280', props: { 'Glyph-like marks': String(r.glyphs), 'Position': `${Math.round((r.x0 + r.x1) / 2 / w * 100)}% across, ${Math.round((r.y0 + r.y1) / 2 / h * 100)}% down`, 'Content': 'not read — no OCR' }, desc: `A cluster of ${r.glyphs} small marks that looks like text. Its content was not read.`, shapes: [{ shape: 'rect', x: (r.x0 - 2) * S, y: (r.y0 - 2) * S, w: (r.x1 - r.x0 + 5) * S, h: (r.y1 - r.y0 + 5) * S, width: 2, dashed: true }] }));

  const relations = [];

  return {
    type, subtype: undefined, title: `${name} — ${typeName(type)} (raster analysis)`, desc: `Raster image ${natW} × ${natH} px analysed with pixel heuristics.`,
    source: 'raster', confidence, notes, viewBox: [0, 0, natW, natH], axes: sceneAxes, series: sceneSeries, objects, relations, table, summary: null, equation: null,
    features: { width: natW, height: natH, inkFraction: r3(inkFraction), darkBackground: darkBg, longHorizontalLines: hLines.length, longVerticalLines: vLines.length, axes: !!axes, grid: grid ? `${grid.rows}×${grid.cols}` : null, colouredSeries: series.length, components: comps.length, shapes: shapes.length, textRegions: textRegions.length }
  };
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const typeName = (t) => ({ graph: 'graph', table: 'table', diagram: 'diagram', unknown: 'unclassified image' }[t] || t);
function scaleShape(g, S) { const o = { ...g }; for (const k of ['x', 'y', 'w', 'h', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2']) if (k in o) o[k] *= S; if (o.points) o.points = o.points.map(p => [p[0] * S, p[1] * S]); return o; }

/* ---- geometry helpers ---- */
function convexHull(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = []; for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = []; for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop(); return lower.concat(upper);
}
function simplify(pts, eps) { // Douglas–Peucker on a closed ring
  if (pts.length < 4) return pts;
  const dist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L; };
  const dp = (arr) => { if (arr.length < 3) return arr; let idx = 0, md = 0; for (let i = 1; i < arr.length - 1; i++) { const d = dist(arr[i], arr[0], arr[arr.length - 1]); if (d > md) { md = d; idx = i; } } if (md > eps) { const a = dp(arr.slice(0, idx + 1)), b = dp(arr.slice(idx)); return a.slice(0, -1).concat(b); } return [arr[0], arr[arr.length - 1]]; };
  // split ring at the two farthest-apart points to run DP on two open chains
  let ai = 0, bi = 0, best = 0; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2; if (d > best) { best = d; ai = i; bi = j; } }
  const c1 = dp(pts.slice(ai, bi + 1)), c2 = dp(pts.slice(bi).concat(pts.slice(0, ai + 1)));
  return c1.slice(0, -1).concat(c2.slice(0, -1));
}
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(a) / 2; }
function classifyShape(c, idx) {
  const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  const hull = convexHull(c.boundary);
  const hullArea = polyArea(hull) || 1;
  const filled = c.n / hullArea; // ~1 for filled, small for outlines
  const bboxFill = hullArea / (bw * bh);
  // circle test: hull points at near-constant distance from the centroid
  const hc = hull.reduce((a, p) => [a[0] + p[0] / hull.length, a[1] + p[1] / hull.length], [0, 0]);
  const ds = hull.map(p => Math.hypot(p[0] - hc[0], p[1] - hc[1])); const mean = ds.reduce((a, b) => a + b, 0) / ds.length; const cv = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / ds.length) / (mean || 1);
  const poly = simplify(hull, Math.max(1.5, 0.045 * Math.max(bw, bh)));
  let kind, shapes, props = {};
  const style = filled > 0.55 ? 'filled' : 'outline';
  if (cv < 0.07 && Math.abs(bw - bh) / Math.max(bw, bh) < 0.2 && bboxFill > 0.7) { kind = 'circle'; shapes = [{ shape: 'circle', cx: hc[0], cy: hc[1], r: mean, width: 3 }]; props = { 'Approximate radius': `${Math.round(mean)} px (scaled)`, 'Style': style }; }
  else if (poly.length === 3) { kind = 'triangle'; shapes = [{ shape: 'polygon', points: poly, width: 3 }]; const sides = poly.map((p, i) => Math.hypot(p[0] - poly[(i + 1) % 3][0], p[1] - poly[(i + 1) % 3][1])); const angles = poly.map((p, i) => { const a = poly[(i + 2) % 3], b = poly[(i + 1) % 3]; const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]]; return Math.round(Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)) * 180 / Math.PI); }); props = { 'Vertices': '3', 'Angles (approx.)': angles.map(a => a + '°').join(', '), 'Right angle': angles.some(a => Math.abs(a - 90) <= 6) ? 'yes (about 90°)' : 'no', 'Side ratio': sides.map(s => (s / Math.min(...sides)).toFixed(2)).join(' : '), 'Style': style }; }
  else if (poly.length === 4) { const rectLike = bboxFill > 0.9; kind = rectLike ? 'rectangle' : 'quadrilateral'; shapes = [{ shape: 'polygon', points: poly, width: 3 }]; props = { 'Vertices': '4', 'Aspect ratio (w:h)': (bw / bh).toFixed(2), 'Style': style }; }
  else if (poly.length >= 5 && poly.length <= 8) { kind = `${poly.length}-sided polygon`; shapes = [{ shape: 'polygon', points: poly, width: 3 }]; props = { 'Vertices': String(poly.length), 'Style': style }; }
  else { kind = filled < 0.25 ? 'line drawing' : 'irregular shape'; shapes = [{ shape: 'polygon', points: hull.length > 24 ? simplify(hull, 2) : hull, width: 2, dashed: true }]; props = { 'Hull vertices': String(poly.length), 'Style': style }; }
  return { id: 'shape-' + (idx + 1), kind, label: `${kind[0].toUpperCase() + kind.slice(1)} ${idx + 1}`, color: '#3B2AB8', desc: `${style} ${kind} about ${bw} by ${bh} pixels (analysis scale).`, props, shapes, bw, bh, cx, cy };
}
