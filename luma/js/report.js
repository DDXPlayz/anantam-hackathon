// Experiment report: in-app view, self-contained HTML export (printable) and JSON export.
import { toSVG, describe as describePlot } from './plot.js';
import { fmt } from './noise.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cell(row, col) {
  const v = row[col.id];
  if (col.kind === 'text') return esc(v ?? '');
  return typeof v === 'number' ? fmt(v, col.digits ?? 3) : esc(v ?? '—');
}

/** Build the report body as HTML. `graphSpecs` is an array of {label, spec}. */
export function buildReportHTML({ meta, exp, params, comps, rows, notes, analysis, graphSpecs, theme = 'dark', when = new Date() }) {
  const cols = exp.columns;
  const o = [];
  o.push(`<article class="rep">`);
  o.push(`<h1>${esc(meta.title)} — Experiment Report</h1>`);
  o.push(`<p class="meta">LUMA virtual laboratory · ${esc(when.toLocaleString())} · ${rows.length} measurement${rows.length === 1 ? '' : 's'} · ${notes.length} observation${notes.length === 1 ? '' : 's'}</p>`);
  o.push(`<h2>1. Objective</h2><p>${esc(analysis.objective)}</p>`);
  o.push(`<h2>2. Setup</h2><p>${esc(exp.describe(params, comps))}</p><table><tbody>`);
  for (const [k, v] of analysis.setup) o.push(`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`);
  o.push(`</tbody></table>`);
  o.push(`<h2>3. Measurements</h2>`);
  if (!rows.length) o.push(`<p>No measurements were taken.</p>`);
  else {
    o.push(`<div class="tbl-wrap"><table><thead><tr><th>#</th>`);
    for (const c of cols) o.push(`<th>${esc(c.label)}${c.unit ? ` (${esc(c.unit)})` : ''}</th>`);
    o.push(`</tr></thead><tbody>`);
    rows.forEach((r, i) => { o.push(`<tr><td>${i + 1}</td>`); for (const c of cols) o.push(`<td>${cell(r, c)}</td>`); o.push(`</tr>`); });
    o.push(`</tbody></table></div>`);
  }
  o.push(`<h2>4. Graphs</h2>`);
  for (const g of graphSpecs) {
    o.push(`<h3>${esc(g.label)}</h3>`);
    o.push(toSVG(g.spec, 640, 340, theme, g.label));
    o.push(`<p class="graph-desc">${esc(describePlot(g.spec))}</p>`);
  }
  o.push(`<h2>5. Calculations</h2><div class="calc">`);
  for (const c of analysis.calculations) o.push(`<div><b>${esc(c.label)}</b><span class="f">${esc(c.formula)}</span><br><span class="s">${esc(c.subst)}</span><br><span class="r">= ${esc(c.result)}</span></div>`);
  o.push(`</div>`);
  o.push(`<h2>6. Result</h2><div class="result">`);
  for (const r of analysis.results) o.push(`<p>${esc(r)}</p>`);
  o.push(`</div>`);
  o.push(`<h2>7. Error analysis</h2>`);
  o.push(`<p><strong>Mean percentage error:</strong> ${isFinite(analysis.errorPct) ? fmt(analysis.errorPct, 2) + ' %' : 'not available (no measurements)'} — computed per row as |experimental − theoretical| / theoretical × 100.</p>`);
  o.push(`<p><strong>Uncertainty:</strong> ${esc(analysis.uncertainty)}</p>`);
  o.push(`<p><strong>Likely sources of error:</strong></p><ul>`);
  for (const s of analysis.sources) o.push(`<li>${esc(s)}</li>`);
  o.push(`</ul>`);
  o.push(`<h2>8. Observations</h2>`);
  if (!notes.length) o.push(`<p>No observations were recorded.</p>`);
  else { o.push(`<ul>`); for (const n of notes) o.push(`<li><span class="meta">${esc(new Date(n.t).toLocaleString())}</span> — ${esc(n.text)}</li>`); o.push(`</ul>`); }
  o.push(`<h2>9. Conclusion</h2><p>${esc(analysis.conclusion)}</p>`);
  o.push(`<h2>Instruments</h2><ul>`);
  for (const i of exp.instruments) o.push(`<li>${esc(i.describe())}</li>`);
  o.push(`</ul>`);
  o.push(`</article>`);
  return o.join('\n');
}

const EXPORT_CSS = `
body{font-family:"IBM Plex Sans",system-ui,sans-serif;color:#111;background:#fff;margin:2rem auto;max-width:860px;padding:0 1.5rem;line-height:1.5}
h1{font-size:1.6rem;margin:0 0 .2rem}h2{font-size:1rem;letter-spacing:.08em;text-transform:uppercase;margin:1.6rem 0 .5rem;border-bottom:1px solid #ccc;padding-bottom:.3rem;font-family:"IBM Plex Mono",monospace}
h3{font-size:.95rem;margin:1rem 0 .4rem}.meta{color:#666;font-family:"IBM Plex Mono",monospace;font-size:.8rem}
table{border-collapse:collapse;width:100%;font-family:"IBM Plex Mono",monospace;font-size:.78rem}th,td{border:1px solid #ccc;padding:.3rem .5rem;text-align:right}th{text-align:left;background:#f3f3f3;font-weight:500}td:first-child{text-align:left}
.tbl-wrap{overflow-x:auto}.calc div{border:1px solid #ccc;padding:.5rem .7rem;margin:.4rem 0;font-family:"IBM Plex Mono",monospace;font-size:.8rem}.calc b{display:block;font-family:"IBM Plex Sans",sans-serif}
.calc .f{color:#0b5fa5}.calc .s{color:#555}.calc .r{color:#0a7a34}.result{border:1px solid #0a7a34;padding:.7rem 1rem}.result p{margin:.2rem 0}
svg{max-width:100%;height:auto;border:1px solid #ddd}.graph-desc{font-size:.85rem;color:#444}footer{margin-top:2rem;color:#666;font-size:.8rem}
@media print{body{margin:0}h2{break-after:avoid}svg{break-inside:avoid}}
`;

export function exportHTML(opts) {
  const body = buildReportHTML({ ...opts, theme: 'print' });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.meta.title)} — LUMA report</title><style>${EXPORT_CSS}</style></head><body>${body}<footer>Generated by LUMA — a laboratory in your browser. All values are computed from the mathematical model described in the LUMA documentation; instrument noise is simulated.</footer></body></html>`;
}

export function exportJSON(opts) {
  const { meta, exp, params, comps, rows, notes, analysis, graphSpecs } = opts;
  return JSON.stringify({
    generator: 'LUMA v1', experiment: meta.id, title: meta.title, subject: meta.subject, generated: new Date().toISOString(),
    parameters: params, components: comps, columns: exp.columns,
    measurements: rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_') || k === '_t'))),
    observations: notes, analysis, graphs: graphSpecs.map(g => ({ label: g.label, xLabel: g.spec.xLabel, yLabel: g.spec.yLabel, series: g.spec.series.map(s => ({ label: s.label, points: s.points })), fit: g.spec.fit ? { slope: g.spec.fit.slope, intercept: g.spec.fit.intercept, r2: g.spec.fit.r2 } : null, description: describePlot(g.spec) })),
    instruments: exp.instruments.map(i => ({ id: i.id, label: i.label, unit: i.unit, resolution: i.resolution, relNoise: i.relNoise, absNoise: i.absNoise })),
  }, null, 2);
}

export function toCSV(exp, rows) {
  const cols = exp.columns;
  const head = ['n', 'timestamp', ...cols.map(c => c.unit ? `${c.label} (${c.unit})` : c.label)];
  const q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [head.map(q).join(',')];
  rows.forEach((r, i) => lines.push([i + 1, new Date(r._t).toISOString(), ...cols.map(c => { const v = r[c.id]; return typeof v === 'number' ? (isFinite(v) ? String(v) : '') : (v ?? ''); })].map(x => q(String(x))).join(',')));
  return lines.join('\n');
}

export function download(filename, content, type = 'text/plain') {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) { return false; }
}
