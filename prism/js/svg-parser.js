// PRISM — SVG → scene graph.
// Two paths: (1) PRISM-semantic SVGs (data-role attributes, <title>/<desc>)
// are parsed into a complete scene: axes with scales, series inverted from
// pixel space back to data space, objects with properties, relationships,
// tables. (2) Any other SVG is parsed generically: shapes by element type,
// text read literally (SVG text is real text), structure inferred with a
// lower confidence.

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const pointsOf = (el) => (el.getAttribute('points') || '').trim().split(/[\s]+/).filter(Boolean).map(p => p.split(',').map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));

function shapeFromEl(el) {
  const tag = el.tagName.toLowerCase();
  const base = { color: el.getAttribute('stroke') || undefined, width: el.hasAttribute('stroke-width') ? num(el.getAttribute('stroke-width')) : undefined, fill: el.getAttribute('fill') && el.getAttribute('fill') !== 'none' ? el.getAttribute('fill') : undefined };
  if (el.getAttribute('marker-end')) base.arrow = true;
  switch (tag) {
    case 'polygon': return { shape: 'polygon', points: pointsOf(el), ...base };
    case 'polyline': return { shape: 'polyline', points: pointsOf(el), ...base };
    case 'line': return { shape: 'line', x1: num(el.getAttribute('x1')), y1: num(el.getAttribute('y1')), x2: num(el.getAttribute('x2')), y2: num(el.getAttribute('y2')), ...base };
    case 'circle': return { shape: 'circle', cx: num(el.getAttribute('cx')), cy: num(el.getAttribute('cy')), r: num(el.getAttribute('r')), ...base };
    case 'ellipse': return { shape: 'ellipse', cx: num(el.getAttribute('cx')), cy: num(el.getAttribute('cy')), rx: num(el.getAttribute('rx')), ry: num(el.getAttribute('ry')), ...base };
    case 'rect': return { shape: 'rect', x: num(el.getAttribute('x')), y: num(el.getAttribute('y')), w: num(el.getAttribute('width')), h: num(el.getAttribute('height')), rx: num(el.getAttribute('rx')), ...base };
    case 'path': return { shape: 'path', d: el.getAttribute('d') || '', ...base };
    case 'text': return { shape: 'text', x: num(el.getAttribute('x')), y: num(el.getAttribute('y')), text: el.textContent.trim(), size: el.hasAttribute('font-size') ? num(el.getAttribute('font-size')) : undefined, anchor: el.getAttribute('text-anchor') || 'start', transform: el.getAttribute('transform') || undefined };
    default: return null;
  }
}

function shapesIn(group) {
  const out = [];
  for (const el of group.children) { const s = shapeFromEl(el); if (s) out.push(s); }
  return out;
}

function parseAxis(g) {
  const cats = g.getAttribute('data-categories');
  return {
    label: g.getAttribute('data-label') || '', unit: g.getAttribute('data-unit') || '',
    categories: cats ? cats.split('|') : undefined,
    min: cats ? 0 : num(g.getAttribute('data-min')), max: cats ? Math.max(0, cats.split('|').length - 1) : num(g.getAttribute('data-max')),
    ticks: (g.getAttribute('data-ticks') || '').split(',').filter(s => s !== '').map(Number),
    px0: num(g.getAttribute('data-px0')), px1: num(g.getAttribute('data-px1'))
  };
}

/** Invert a pixel coordinate on an axis back to a data value. */
export function invert(axis, px) {
  if (!axis || axis.px0 === axis.px1) return px;
  if (axis.categories) { const n = axis.categories.length; return Math.round((px - axis.px0) / (axis.px1 - axis.px0) * n - 0.5); }
  const v = axis.min + (px - axis.px0) / (axis.px1 - axis.px0) * (axis.max - axis.min);
  // Snap to the resolution one pixel represents on this axis (pixel positions are stored to 0.1 px).
  const res = Math.abs(axis.max - axis.min) / Math.abs(axis.px1 - axis.px0);
  const digits = Math.min(4, Math.max(0, Math.ceil(-Math.log10(res || 1))));
  return Math.round(v * 10 ** digits) / 10 ** digits;
}
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

export function parseSVG(svgText, source = 'svg') {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root || doc.querySelector('parsererror')) throw new Error('This file is not a valid SVG document.');
  const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const viewBox = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, num(root.getAttribute('width'), 800), num(root.getAttribute('height'), 500)];
  const title = root.querySelector(':scope > title')?.textContent.trim() || '';
  const desc = root.querySelector(':scope > desc')?.textContent.trim() || '';
  return root.getAttribute('data-prism') === '1' ? parsePrism(root, { viewBox, title, desc, source }) : parseGeneric(root, { viewBox, title, desc, source });
}

function parsePrism(root, base) {
  const scene = { ...base, type: root.getAttribute('data-type') || 'unknown', subtype: root.getAttribute('data-subtype') || undefined, confidence: 1, notes: [], axes: null, series: [], objects: [], relations: [], table: null, summary: null, equation: null };
  const axes = root.querySelectorAll('[data-role="axis"]');
  if (axes.length) { scene.axes = {}; axes.forEach(g => { scene.axes[g.getAttribute('data-axis')] = parseAxis(g); }); }
  root.querySelectorAll('[data-role="series"]').forEach(g => {
    const kind = g.getAttribute('data-kind') || 'line';
    const s = { id: g.id, name: g.getAttribute('data-name') || g.id, kind, color: g.getAttribute('data-color') || '#000', points: [], px: [] };
    const X = scene.axes?.x, Y = scene.axes?.y;
    if (kind === 'line') { const pl = g.querySelector('polyline'); if (pl) { s.dash = pl.hasAttribute('stroke-dasharray'); for (const [px, py] of pointsOf(pl)) { s.px.push([px, py]); s.points.push([round(invert(X, px)), round(invert(Y, py))]); } } }
    if (kind === 'scatter') g.querySelectorAll('circle').forEach(c => { const px = num(c.getAttribute('cx')), py = num(c.getAttribute('cy')); s.px.push([px, py]); s.points.push([round(invert(X, px)), round(invert(Y, py))]); });
    if (kind === 'bar') g.querySelectorAll('rect').forEach(r => { const px = num(r.getAttribute('x')) + num(r.getAttribute('width')) / 2, py = num(r.getAttribute('y')); s.px.push([px, py]); s.points.push([r.hasAttribute('data-cat') ? num(r.getAttribute('data-cat')) : round(invert(X, px)), round(invert(Y, py))]); });
    scene.series.push(s);
  });
  root.querySelectorAll('[data-role="object"]').forEach(g => {
    const props = {};
    for (const a of g.attributes) if (a.name.startsWith('data-prop-')) { const i = a.value.indexOf('='); props[a.value.slice(0, i)] = a.value.slice(i + 1); }
    scene.objects.push({ id: g.id, kind: g.getAttribute('data-kind') || 'object', label: g.getAttribute('data-label') || g.querySelector(':scope > title')?.textContent || g.id, desc: g.querySelector(':scope > desc')?.textContent.trim() || '', color: g.getAttribute('data-color') || '#111318', props, shapes: shapesIn(g) });
  });
  root.querySelectorAll('[data-role="relation"]').forEach(g => scene.relations.push({ from: g.getAttribute('data-from'), to: g.getAttribute('data-to'), type: g.getAttribute('data-type') || 'related to', label: g.getAttribute('data-label') || '', shapes: shapesIn(g) }));
  const t = root.querySelector('[data-role="table"]');
  if (t) {
    const cells = [...t.querySelectorAll('[data-role="cell"]')].map(c => ({ r: num(c.getAttribute('data-row')), c: num(c.getAttribute('data-col')), text: c.querySelector('text')?.textContent.trim() || '', header: c.hasAttribute('data-header') }));
    const rows = num(t.getAttribute('data-rows')), cols = num(t.getAttribute('data-cols'));
    const grid = Array.from({ length: rows }, () => Array(cols).fill(''));
    cells.forEach(x => { if (grid[x.r]) grid[x.r][x.c] = x.text; });
    scene.table = { headers: grid[0], rows: grid.slice(1) };
  }
  const sm = root.querySelector('metadata[data-role="summary"]'); if (sm) { try { scene.summary = JSON.parse(sm.textContent); } catch { /* ignore */ } }
  const eq = root.querySelector('metadata[data-role="equation"]'); if (eq) { try { scene.equation = JSON.parse(eq.textContent); } catch { /* ignore */ } }
  return scene;
}

/* ---------------- Generic SVG (no PRISM annotations) ---------------- */
function bboxOf(sh) {
  switch (sh.shape) {
    case 'polygon': case 'polyline': { const xs = sh.points.map(p => p[0]), ys = sh.points.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
    case 'line': return [Math.min(sh.x1, sh.x2), Math.min(sh.y1, sh.y2), Math.max(sh.x1, sh.x2), Math.max(sh.y1, sh.y2)];
    case 'circle': return [sh.cx - sh.r, sh.cy - sh.r, sh.cx + sh.r, sh.cy + sh.r];
    case 'ellipse': return [sh.cx - sh.rx, sh.cy - sh.ry, sh.cx + sh.rx, sh.cy + sh.ry];
    case 'rect': return [sh.x, sh.y, sh.x + sh.w, sh.y + sh.h];
    case 'path': { const n = (sh.d.match(/-?\d*\.?\d+/g) || []).map(Number); if (n.length < 2) return [0, 0, 0, 0]; const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
    case 'text': return [sh.x, sh.y - 12, sh.x + (sh.text.length * 8), sh.y];
    default: return [0, 0, 0, 0];
  }
}

function parseGeneric(root, base) {
  const [, , W, H] = base.viewBox;
  const scene = { ...base, type: 'unknown', confidence: 0.4, notes: [], axes: null, series: [], objects: [], relations: [], table: null, summary: null, equation: null };
  const els = [...root.querySelectorAll('polygon, polyline, line, circle, ellipse, rect, path, text')];
  const shapes = els.map(shapeFromEl).filter(Boolean);
  const texts = shapes.filter(s => s.shape === 'text' && s.text);
  const geo = shapes.filter(s => s.shape !== 'text');
  // Skip a full-canvas background rectangle
  const isBackground = (s) => s.shape === 'rect' && s.w >= W * 0.95 && s.h >= H * 0.95;
  let n = 0;
  const lines = [], rects = [], others = [];
  for (const s of geo) {
    if (isBackground(s)) continue;
    const b = bboxOf(s); const bw = b[2] - b[0], bh = b[3] - b[1];
    if (s.shape === 'line' || (s.shape === 'polyline' && s.points.length === 2)) lines.push({ s, b, horizontal: bh < 3 && bw > W * 0.3, vertical: bw < 3 && bh > H * 0.3 });
    else if (s.shape === 'rect') rects.push({ s, b });
    else others.push({ s, b });
  }
  const longH = lines.filter(l => l.horizontal), longV = lines.filter(l => l.vertical);
  const hasAxes = longH.length >= 1 && longV.length >= 1 && longH.some(h => longV.some(v => Math.abs(h.b[0] - v.b[0]) < 15 && Math.abs(h.b[1] - v.b[3]) < 15));
  const gridLike = longH.length >= 3 && longV.length >= 3;
  const curves = geo.filter(s => (s.shape === 'polyline' && s.points.length > 2) || (s.shape === 'path' && s.color && s.color !== '#000' && s.color !== 'black'));
  if (gridLike && rects.length === 0) { scene.type = 'table'; scene.confidence = 0.55; scene.notes.push(`Found ${longH.length} horizontal and ${longV.length} vertical lines forming a grid; table cells were inferred from line positions, not from cell markup.`); }
  else if (hasAxes) { scene.type = 'graph'; scene.confidence = curves.length ? 0.7 : 0.5; scene.notes.push('Two long perpendicular lines meeting at a corner were interpreted as axes. Axis labels and tick values were read from nearby SVG text where present, but were not matched to positions.'); }
  else if (rects.length >= 6 && rects.length % 2 === 0 && texts.length >= rects.length / 2) { scene.type = 'table'; scene.confidence = 0.5; scene.notes.push('A regular grid of rectangles with text inside was interpreted as a table.'); }
  else if (others.length + rects.length > 0) { scene.type = 'diagram'; scene.confidence = 0.5; }
  scene.notes.push('This SVG has no PRISM annotations, so structure was inferred from element types. SVG text was read literally; meaning, units and relationships were not inferred.');
  const kindOf = (s) => s.shape === 'polygon' ? (s.points.length === 3 ? 'triangle' : s.points.length === 4 ? 'quadrilateral' : `${s.points.length}-sided polygon`) : s.shape === 'rect' ? 'rectangle' : s.shape === 'circle' ? 'circle' : s.shape === 'ellipse' ? 'ellipse' : s.shape === 'polyline' ? (s.points.length > 2 ? 'curve or path' : 'line') : s.shape;
  for (const { s, b } of [...others, ...rects, ...lines.filter(l => !l.horizontal && !l.vertical)]) {
    n++;
    const bw = b[2] - b[0], bh = b[3] - b[1];
    scene.objects.push({ id: 'shape-' + n, kind: kindOf(s), label: `${kindOf(s)} ${n}`, desc: `${kindOf(s)} about ${Math.round(bw)} by ${Math.round(bh)} units, at ${Math.round((b[0] + b[2]) / 2 / W * 100)}% across and ${Math.round((b[1] + b[3]) / 2 / H * 100)}% down.`, color: s.color || '#111318', props: { 'Width': `${Math.round(bw)} units`, 'Height': `${Math.round(bh)} units`, ...(s.fill ? { 'Fill colour': s.fill } : {}), ...(s.color ? { 'Stroke colour': s.color } : {}) }, shapes: [s] });
  }
  if (hasAxes) {
    const h = longH.find(h => longV.some(v => Math.abs(h.b[0] - v.b[0]) < 15)), v = longV.find(v => Math.abs(h.b[0] - v.b[0]) < 15);
    scene.axes = { x: { label: 'x (label unknown)', unit: '', min: 0, max: 1, ticks: [0, 0.5, 1], px0: h.b[0], px1: h.b[2] }, y: { label: 'y (label unknown)', unit: '', min: 0, max: 1, ticks: [0, 0.5, 1], px0: v.b[3], px1: v.b[1] } };
    scene.notes.push('Axis values are expressed as a fraction of the axis length (0 to 1) until you enter the real range in Refine.');
    curves.forEach((c, i) => { const pts = c.shape === 'polyline' ? c.points : []; if (!pts.length) return; scene.series.push({ id: 'series-' + (i + 1), name: `Series ${i + 1} (${c.color || 'unknown colour'})`, kind: 'line', color: c.color || '#111318', px: pts, points: pts.map(([px, py]) => [round(invert(scene.axes.x, px), 3), round(invert(scene.axes.y, py), 3)]) }); });
  }
  if (texts.length) scene.objects.push({ id: 'text', kind: 'text', label: `Text (${texts.length} items, read literally)`, desc: texts.map(t => t.text).join('; '), color: '#111318', props: Object.fromEntries(texts.slice(0, 40).map((t, i) => [`Text ${i + 1}`, t.text])), shapes: texts });
  scene.title = base.title || `Untitled SVG (${scene.type})`;
  return scene;
}
