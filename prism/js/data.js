// PRISM — data extraction and statistics for graphs and tables.
import { linearFit, fmt } from './samples.js';

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Statistics for one series. Values are in the scene's data units. */
export function seriesStats(s) {
  const pts = [...s.points].filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;
  let min = pts[0], max = pts[0];
  for (const p of pts) { if (p[1] < min[1]) min = p; if (p[1] > max[1]) max = p; }
  const first = pts[0], last = pts[pts.length - 1];
  const fit = linearFit(pts);
  const mean = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  // Turning points (sign changes of the difference), ignoring tiny wobble
  const range = max[1] - min[1] || 1;
  let ups = 0, downs = 0, turns = 0, prevSign = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i][1] - pts[i - 1][1];
    if (Math.abs(d) < range * 0.01) continue;
    const sign = Math.sign(d); if (sign > 0) ups++; else downs++;
    if (prevSign && sign !== prevSign) turns++;
    prevSign = sign;
  }
  let trend, shape;
  const total = last[1] - first[1];
  if (ups + downs === 0) trend = 'constant';
  else if (downs === 0) trend = 'increases';
  else if (ups === 0) trend = 'decreases';
  else if (turns === 1) trend = first[1] > pts[Math.floor(pts.length / 2)][1] && last[1] > min[1] && min !== first && min !== last ? 'decreases then increases (U-shaped)' : (max !== first && max !== last ? 'increases then decreases (inverted U)' : (total > 0 ? 'mostly increases' : 'mostly decreases'));
  else trend = Math.abs(total) > range * 0.4 ? (total > 0 ? 'increases overall, with fluctuations' : 'decreases overall, with fluctuations') : 'fluctuates without a clear direction';
  // Curvature: compare the slope of the first half with the second half.
  const half = Math.floor(pts.length / 2);
  const f1 = linearFit(pts.slice(0, half + 1)), f2 = linearFit(pts.slice(half));
  const curv = f1 && f2 && Math.abs(f1.slope) > 1e-9 && Math.sign(f1.slope) === Math.sign(f2.slope) ? Math.abs(f2.slope) / Math.abs(f1.slope) : null;
  if (fit && fit.r2 > 0.995) shape = 'approximately linear';
  else if (curv !== null && curv > 1.6 && turns === 0) shape = 'curved, getting steeper';
  else if (curv !== null && curv < 0.6 && turns === 0) shape = 'curved, levelling off';
  else if (fit && fit.r2 > 0.9) shape = 'roughly linear';
  else if (turns <= 1 && ups + downs > 2) shape = 'curved';
  else shape = 'irregular';
  const xInt = fit && Math.abs(fit.slope) > 1e-9 ? -fit.intercept / fit.slope : null;
  // crossing zero along the actual data
  let zero = null;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) { if (y1 !== y0) { zero = x0 + (0 - y0) * (x1 - x0) / (y1 - y0); break; } } }
  return { n: pts.length, min, max, first, last, mean: round(mean), fit: fit ? { slope: round(fit.slope, 4), intercept: round(fit.intercept, 3), r: round(fit.r, 3), r2: round(fit.r2, 3) } : null, xIntercept: xInt === null ? null : round(xInt), yIntercept: fit ? round(fit.intercept, 3) : null, zeroCrossing: zero === null ? null : round(zero), trend, shape, turns };
}

/** Build a flat table from the scene: graphs → x column + one column per series. */
export function sceneTable(scene) {
  if (scene.table) return { headers: [...scene.table.headers], rows: scene.table.rows.map(r => [...r]) };
  if (!scene.series?.length) return null;
  const X = scene.axes?.x, Y = scene.axes?.y;
  const xh = X ? (X.categories ? X.label || 'Category' : `${X.label || 'x'}${X.unit ? ' (' + X.unit + ')' : ''}`) : 'x';
  const headers = [xh, ...scene.series.map(s => `${s.name}${Y?.unit ? ' (' + Y.unit + ')' : ''}`)];
  const xs = new Map();
  scene.series.forEach((s, i) => s.points.forEach(([x, y]) => { const k = String(x); if (!xs.has(k)) xs.set(k, { x, vals: Array(scene.series.length).fill('') }); xs.get(k).vals[i] = fmt(y, 3); }));
  const rows = [...xs.values()].sort((a, b) => a.x - b.x).map(r => [X?.categories ? (X.categories[r.x] ?? String(r.x)) : fmt(r.x, 3), ...r.vals]);
  return { headers, rows };
}

export function toCSV(table) {
  const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [table.headers.map(q).join(','), ...table.rows.map(r => r.map(q).join(','))].join('\n');
}

export function toJSON(scene, table) {
  const out = { title: scene.title, type: scene.type, source: scene.source, confidence: scene.confidence, notes: scene.notes };
  if (scene.axes) out.axes = { x: { label: scene.axes.x?.label, unit: scene.axes.x?.unit }, y: { label: scene.axes.y?.label, unit: scene.axes.y?.unit } };
  if (scene.series?.length) out.series = scene.series.map(s => ({ name: s.name, kind: s.kind, points: s.points, stats: seriesStats(s) }));
  if (table) out.table = table;
  if (scene.objects?.length) out.objects = scene.objects.map(o => ({ id: o.id, kind: o.kind, label: o.label, properties: o.props }));
  if (scene.relations?.length) out.relations = scene.relations.map(r => ({ from: r.from, to: r.to, type: r.type, label: r.label }));
  return JSON.stringify(out, null, 2);
}

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Apply an edited table back onto the scene's series (graphs) or table. */
export function applyTable(scene, table) {
  if (scene.table) { scene.table = { headers: table.headers, rows: table.rows }; return scene; }
  if (!scene.series?.length) return scene;
  const X = scene.axes?.x;
  scene.series.forEach((s, i) => {
    const pts = [];
    table.rows.forEach(r => { const xv = X?.categories ? X.categories.indexOf(r[0]) : parseFloat(r[0]); const yv = parseFloat(r[i + 1]); if (Number.isFinite(xv) && xv >= 0 && Number.isFinite(yv)) pts.push([xv, yv]); });
    if (pts.length) { s.points = pts; s.px = null; }
  });
  return scene;
}
