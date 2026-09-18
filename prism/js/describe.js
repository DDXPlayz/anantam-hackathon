// PRISM — natural-language descriptions at three levels of detail.
import { seriesStats } from './data.js';
import { fmt } from './samples.js';

const TYPE_WORD = { graph: 'Graph', geometry: 'Geometry figure', circuit: 'Circuit diagram', diagram: 'Diagram', table: 'Table', flowchart: 'Flowchart', math: 'Mathematical diagram', chemistry: 'Chemistry diagram', unknown: 'Image' };

function axisName(ax) { return ax ? `${ax.label}${ax.unit ? ', ' + ax.unit : ''}` : 'unknown'; }
function val(v, ax) {
  if (!ax) return fmt(v, 3);
  if (ax.categories) return ax.categories[Math.round(v)] ?? fmt(v);
  return `${fmt(v, 3)}${ax.unit ? ' ' + shortUnit(ax.unit) : ''}`;
}
const shortUnit = (u) => ({ seconds: 's', metres: 'm', millimetres: 'mm', percent: '%', 'hours per week': 'h/week' }[u] || u);
const perUnit = (u) => ({ seconds: 'second', metres: 'metre', millimetres: 'millimetre', hours: 'hour', minutes: 'minute', 'hours per week': 'hour per week', years: 'year', days: 'day' }[u] || (u.length > 3 && /s$/.test(u) ? u.slice(0, -1) : u));
const pct = (c) => `${Math.round(c * 100)}%`;
const sent = (s) => s ? (s.trim().replace(/[.:]?$/, '.') + ' ') : '';

function graphSeries(s, scene, level) {
  const X = scene.axes?.x, Y = scene.axes?.y;
  const st = seriesStats(s); if (!st) return `Series "${s.name}" has no data. `;
  let t = `Series "${s.name}" (${s.kind === 'bar' ? 'bars' : s.kind === 'scatter' ? 'scatter points' : 'line'}, ${st.n} points). `;
  if (s.kind === 'bar') {
    t += `Highest bar: ${val(st.max[0], X)}, ${val(st.max[1], Y)}. Lowest bar: ${val(st.min[0], X)}, ${val(st.min[1], Y)}. `;
    t += `Across the categories, ${Y?.label ? Y.label.toLowerCase() : 'the value'} ${st.trend}. `;
    if (level === 'detailed') t += `Values in order: ${s.points.map(p => `${val(p[0], X)} ${val(p[1], Y)}`).join('; ')}. Mean: ${val(st.mean, Y)}. `;
  } else if (s.kind === 'scatter') {
    const r = st.fit?.r ?? 0; const strength = Math.abs(r) > 0.85 ? 'strong' : Math.abs(r) > 0.5 ? 'moderate' : Math.abs(r) > 0.25 ? 'weak' : 'no clear';
    t += `Points spread from ${val(st.first[0], X)} to ${val(st.last[0], X)} on the x-axis. Correlation: ${strength} ${r > 0.25 ? 'positive' : r < -0.25 ? 'negative' : ''} relationship (r = ${fmt(r, 2)}). `;
    t += `Lowest point: ${val(st.min[1], Y)} at ${val(st.min[0], X)}. Highest point: ${val(st.max[1], Y)} at ${val(st.max[0], X)}. `;
    if (level === 'detailed' && st.fit) t += `Best-fit line: slope ${fmt(st.fit.slope, 3)} per unit x, intercept ${fmt(st.fit.intercept, 2)}. `;
  } else {
    t += `Starts at ${val(st.first[0], X)}, ${val(st.first[1], Y)} and ends at ${val(st.last[0], X)}, ${val(st.last[1], Y)}. `;
    t += `Trend: ${Y?.label && !/not read|unknown/.test(Y.label) ? Y.label + ' ' : 'the value '}${st.trend}${st.shape === 'curved' ? ', following a curve' : st.shape === 'irregular' ? '' : `, ${st.shape}`}. `;
    t += `Minimum ${val(st.min[1], Y)} at ${val(st.min[0], X)}. Maximum ${val(st.max[1], Y)} at ${val(st.max[0], X)}. `;
    if (level === 'detailed') {
      if (st.fit) t += `Linear fit: slope ${fmt(st.fit.slope, 3)}${Y?.unit && X?.unit ? ` ${shortUnit(Y.unit)} per ${perUnit(X.unit)}` : ''}, y-intercept ${fmt(st.fit.intercept, 2)}, R² = ${fmt(st.fit.r2, 3)}. `;
      if (st.zeroCrossing !== null) t += `Crosses zero at x = ${fmt(st.zeroCrossing, 2)}. `;
      if (st.turns) t += `Turning points: ${st.turns}. `;
    }
  }
  return t;
}

function describeGraph(scene, level) {
  const X = scene.axes?.x, Y = scene.axes?.y;
  let t = '';
  if (scene.equation) t += `Equation: ${scene.equation.text}. `;
  if (X) t += `X-axis: ${axisName(X)}${X.categories ? `, ${X.categories.length} categories: ${X.categories.join(', ')}` : `, from ${fmt(X.min)} to ${fmt(X.max)}`}. `;
  if (Y) t += `Y-axis: ${axisName(Y)}, from ${fmt(Y.min)} to ${fmt(Y.max)}. `;
  t += `Number of series: ${scene.series.length}${scene.series.length ? ` (${scene.series.map(s => s.name).join('; ')})` : ''}. `;
  if (level === 'short') { const s = scene.series[0]; if (s) { const st = seriesStats(s); if (st) t += s.kind === 'bar' ? `Highest: ${val(st.max[0], X)} at ${val(st.max[1], Y)}; lowest: ${val(st.min[0], X)}. ` : `${s.name}: ${st.trend}. `; } return t; }
  for (const s of scene.series) t += graphSeries(s, scene, level);
  if (scene.equation && scene.subtype === 'function') {
    const a = scene.equation.a, c = scene.equation.c;
    if (a === 0) t += 'With a = 0 the graph is a horizontal line. ';
    else t += `The parabola opens ${a > 0 ? 'upward' : 'downward'} with its vertex at (0, ${fmt(c)}), which is the ${a > 0 ? 'minimum' : 'maximum'}. It is symmetric about the y-axis. ${Math.abs(a) > 1 ? 'It is narrower than y = x².' : Math.abs(a) < 1 ? 'It is wider than y = x².' : ''} `;
  }
  if (scene.series.length > 1 && scene.series.every(s => s.kind !== 'bar')) {
    const [a, b] = scene.series; const sa = seriesStats(a), sb = seriesStats(b);
    if (sa && sb && a.kind === 'line' && b.kind === 'line') t += `Comparison: at the end ${a.name} is at ${val(sa.last[1], Y)} and ${b.name} at ${val(sb.last[1], Y)}; ${sa.last[1] === sb.last[1] ? 'they finish level' : `${sa.last[1] > sb.last[1] ? a.name : b.name} finishes higher`}. `;
  }
  return t;
}

function describeObjects(scene, level, limit = Infinity) {
  let t = '';
  const objs = scene.objects.slice(0, limit);
  for (const o of objs) {
    t += `${o.label}. `;
    const entries = Object.entries(o.props || {});
    for (const [k, v] of (level === 'short' ? entries.slice(0, 4) : entries)) t += `${k}: ${v}. `;
    if (level === 'detailed' && o.desc) t += sent(o.desc);
  }
  return t;
}
function describeRelations(scene) { return scene.relations.filter(r => r.label).map(r => sent(r.label)).join(''); }
function describeSummary(scene) { return scene.summary ? Object.entries(scene.summary).map(([k, v]) => `${k}: ${v}. `).join('') : ''; }

function describeFlowchart(scene, level) {
  const byId = Object.fromEntries(scene.objects.map(o => [o.id, o]));
  const incoming = new Set(scene.relations.map(r => r.to));
  const start = scene.objects.find(o => !incoming.has(o.id)) || scene.objects[0];
  let t = `${scene.objects.length} steps and ${scene.relations.length} connections. `;
  if (level === 'short') return t + (start ? `Begins at "${start.label}". ` : '');
  const seen = new Set(); const queue = start ? [start.id] : []; let n = 0;
  while (queue.length) {
    const id = queue.shift(); if (seen.has(id)) continue; seen.add(id); const o = byId[id]; if (!o) continue; n++;
    const outs = scene.relations.filter(r => r.from === id);
    t += `Step ${n}: ${o.label}${o.kind !== 'process' ? ` (${o.kind})` : ''}. `;
    if (outs.length > 1) t += outs.map(r => { const m = r.label.match(/when (.+)$/); return `If ${m ? m[1] : r.type}, go to "${byId[r.to]?.label}"`; }).join('; ') + '. ';
    else if (outs.length === 1) t += `Next: "${byId[outs[0].to]?.label}". `;
    else t += 'This is the end. ';
    outs.forEach(r => queue.push(r.to));
  }
  return t;
}

function describeTable(scene, level) {
  const tb = scene.table; if (!tb) return '';
  let t = `${tb.headers.length} columns and ${tb.rows.length} data rows. Columns: ${tb.headers.join('; ')}. `;
  if (level === 'short') return t;
  const rows = level === 'medium' ? tb.rows.slice(0, 2) : tb.rows;
  rows.forEach((r, i) => { t += `Row ${i + 1}: ${r.map((c, j) => j === 0 ? c : `${tb.headers[j]} ${c}`).join('; ')}. `; });
  if (level === 'medium' && tb.rows.length > 2) t += `And ${tb.rows.length - 2} more rows (see the detailed level or the Data tab). `;
  return t;
}

function describeCircuit(scene, level) {
  let t = `${scene.objects.length} components: ${scene.objects.map(o => o.label).join(', ')}. `;
  if (level === 'short') return t + describeSummary(scene).split('. ').slice(0, 2).join('. ') + '. ';
  t += describeObjects(scene, level);
  t += 'Connections: ' + scene.relations.map(r => r.label).join('; ') + '. ';
  t += describeSummary(scene);
  return t;
}

export function describe(scene) {
  const word = TYPE_WORD[scene.type] || 'Image';
  const head = new RegExp('^' + word.split(' ')[0], 'i').test(scene.title) ? `${scene.title}. ` : `${word}: ${scene.title}. `;
  const src = scene.source === 'raster' ? `Analysed from a raster image with pixel heuristics; classified as ${scene.type} with ${pct(scene.confidence)} confidence. ` : scene.source === 'svg' && scene.confidence < 1 ? `Parsed from an SVG without PRISM annotations; confidence ${pct(scene.confidence)}. ` : '';
  const levels = {};
  for (const level of ['short', 'medium', 'detailed']) {
    let body = '';
    switch (scene.type) {
      case 'graph': body = describeGraph(scene, level) + (level !== 'short' && scene.objects.length ? describeObjects(scene, level) : ''); break;
      case 'table': body = describeTable(scene, level); break;
      case 'flowchart': body = describeFlowchart(scene, level); break;
      case 'circuit': body = describeCircuit(scene, level); break;
      default: body = describeObjects(scene, level, level === 'short' ? 1 : Infinity) + (level !== 'short' ? describeRelations(scene) : '') + (level !== 'short' ? describeSummary(scene) : '');
        if (level === 'short' && scene.objects.length > 1) body += `Plus ${scene.objects.length - 1} more component${scene.objects.length > 2 ? 's' : ''}. `;
        if (scene.type === 'unknown' && !scene.objects.length) body += 'No structure could be identified. ';
    }
    const notes = level === 'detailed' && scene.notes?.length ? 'Notes: ' + scene.notes.map(sent).join('') : level === 'medium' && scene.notes?.length ? sent(scene.notes[0]) : '';
    levels[level] = (level === 'short' ? head : head + src) + body + notes;
  }
  return levels;
}

/** One component ("What is this?"). */
export function describeComponent(scene, id) {
  const X = scene.axes?.x, Y = scene.axes?.y;
  const o = scene.objects.find(o => o.id === id);
  if (o) {
    const rels = scene.relations.filter(r => r.from === id || r.to === id).map(r => r.label).filter(Boolean);
    return `${o.label}. ${o.desc ? sent(o.desc) : ''}${Object.entries(o.props || {}).map(([k, v]) => `${k}: ${v}. `).join('')}${rels.length ? 'Relationships: ' + rels.join('; ') + '.' : ''}`.trim();
  }
  const s = scene.series.find(s => s.id === id);
  if (s) return graphSeries(s, scene, 'detailed').trim();
  if (id === 'axis-x' && X) return `X-axis: ${axisName(X)}. ${X.categories ? 'Categories: ' + X.categories.join(', ') : `Range ${fmt(X.min)} to ${fmt(X.max)}, tick marks at ${X.ticks.join(', ')}`}.`;
  if (id === 'axis-y' && Y) return `Y-axis: ${axisName(Y)}. Range ${fmt(Y.min)} to ${fmt(Y.max)}, tick marks at ${Y.ticks.join(', ')}.`;
  const r = scene.relations.find((r, i) => `rel-${i}` === id);
  if (r) return `Connection: ${r.label || `${r.from} ${r.type} ${r.to}`}.`;
  const m = id.match(/^cell-(\d+)-(\d+)$/);
  if (m && scene.table) { const ri = +m[1], ci = +m[2]; const text = ri === 0 ? scene.table.headers[ci] : scene.table.rows[ri - 1]?.[ci]; return ri === 0 ? `Column header ${ci + 1}: ${text}.` : `Row ${ri}, ${scene.table.headers[ci]}: ${text}.`; }
  const rm = id.match(/^row-(\d+)$/);
  if (rm && scene.table) { const ri = +rm[1]; const row = scene.table.rows[ri - 1]; return `Row ${ri}: ${row.map((c, j) => `${scene.table.headers[j]} ${c}`).join('; ')}.`; }
  return 'No description available for this component.';
}
