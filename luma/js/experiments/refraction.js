import { h, clear, text, fmt, calc, latestGroup, meanErr, uncStatement, pctError, rad, deg } from './common.js';
import { instrument } from '../noise.js';
import { linearFit } from '../plot.js';

const protractor = instrument({ id: 'protractor', label: 'Optical protractor', unit: '°', resolution: 0.5, relNoise: 0, absNoise: 0.3 });
const MEDIA = [[1.000, 'air'], [1.333, 'water'], [1.36, 'ethanol'], [1.47, 'glycerol'], [1.52, 'crown glass'], [1.62, 'flint glass'], [2.42, 'diamond']];
const nameFor = n => { let best = MEDIA[0]; for (const m of MEDIA) if (Math.abs(m[0] - n) < Math.abs(best[0] - n)) best = m; return Math.abs(best[0] - n) < 0.02 ? best[1] : 'custom medium'; };

function solve(p) {
  const sinr = p.n1 * Math.sin(rad(p.i)) / p.n2;
  const tir = sinr > 1;
  const crit = p.n1 > p.n2 ? deg(Math.asin(p.n2 / p.n1)) : NaN;
  return { sinr, r: tir ? NaN : deg(Math.asin(sinr)), tir, crit };
}

export default {
  id: 'refraction', title: 'Refraction & Snell’s Law', subject: 'physics', timed: false, powerLabel: 'Laser on',
  params: [
    { id: 'i', label: 'Angle of incidence', unit: '°', min: 0, max: 89, step: 0.5, value: 30, digits: 1 },
    { id: 'n1', label: 'Refractive index n₁ (top medium)', unit: '', min: 1, max: 2.5, step: 0.01, value: 1, digits: 2 },
    { id: 'n2', label: 'Refractive index n₂ (bottom medium)', unit: '', min: 1, max: 2.5, step: 0.01, value: 1.5, digits: 2 },
  ],
  components: null,
  instruments: [protractor],
  columns: [
    { id: 'n1', label: 'n₁', unit: '', digits: 2, kind: 'param' }, { id: 'n2', label: 'n₂', unit: '', digits: 2, kind: 'param' }, { id: 'i', label: 'i', unit: '°', digits: 1, kind: 'param' },
    { id: 'r', label: 'r measured', unit: '°', digits: 1, kind: 'meas' }, { id: 'rth', label: 'r Snell', unit: '°', digits: 2, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' },
    { id: 'sini', label: 'sin i', unit: '', digits: 4, kind: 'param' }, { id: 'sinr', label: 'sin r', unit: '', digits: 4, kind: 'meas' }, { id: 'ratio', label: 'sin i / sin r', unit: '', digits: 3, kind: 'meas' },
  ],
  graphs: [
    { id: 'sin', label: 'sin r vs sin i (fit → n₁/n₂)', xLabel: 'sin i', yLabel: 'sin r', zeroX: true, zeroY: true,
      build(rows, p) { const pts = rows.map(r => [r.sini, r.sinr]); const f = linearFit(pts);
        return { series: [{ label: 'Measured', points: pts, kind: 'points', color: 'a' }, { label: `Snell: slope n₁/n₂ = ${fmt(p.n1 / p.n2, 3)}`, points: [[0, 0], [1, Math.min(1, p.n1 / p.n2)]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Fitted slope ${fmt(f.slope, 4)} = n₁/n₂, so n₂/n₁ = ${fmt(1 / f.slope, 3)} (set value ${fmt(p.n2 / p.n1, 3)}).` } : null }; } },
    { id: 'ri', label: 'r vs i', xLabel: 'Angle of incidence (°)', yLabel: 'Angle of refraction (°)', zeroX: true, zeroY: true,
      build(rows, p) { const th = []; for (let i = 0; i <= 90; i += 2) { const s = solve({ ...p, i }); if (!s.tir) th.push([i, s.r]); }
        return { series: [{ label: 'Measured', points: rows.map(r => [r.i, r.r]), kind: 'points', color: 'a' }, { label: 'Snell (current n₁, n₂)', points: th, color: 'b', dash: 'dash' }] }; } },
  ],
  tasks: [
    { title: 'Choose the media', text: 'Set n₁ = 1.00 (air) and n₂ = 1.50 (glass). Press "Laser on".', controls: ['n1', 'n2'] },
    { title: 'Measure the refracted angle', text: 'Set the incidence angle and take a measurement. Try 10°, 20°, 30°, 45°, 60°.', controls: ['i'] },
    { title: 'Fit the line', text: 'Open "sin r vs sin i". The slope equals n₁/n₂.', controls: [] },
    { title: 'Find total internal reflection', text: 'Swap the media (n₁ = 1.50, n₂ = 1.00) and raise i past the critical angle — the refracted ray disappears.', controls: ['n1', 'n2', 'i'] },
  ],
  describe(p) { const s = solve(p); return `A laser beam in ${nameFor(p.n1)} (n₁ = ${fmt(p.n1, 2)}) strikes a flat horizontal interface with ${nameFor(p.n2)} (n₂ = ${fmt(p.n2, 2)}) at ${fmt(p.i, 1)}° to the normal. ${s.tir ? `This exceeds the critical angle of ${fmt(s.crit, 1)}°, so the beam is totally internally reflected.` : `The refracted beam continues at ${fmt(s.r, 1)}° to the normal, ${p.n2 > p.n1 ? 'bending towards' : 'bending away from'} the normal.`}`; },
  init() { return {}; }, step() {}, done() { return false; },
  render(svg, s, p, c, env) {
    clear(svg);
    const W = 800, H = 450, cx = 400, cy = 225, on = env.powered;
    svg.appendChild(h('rect', { x: 0, y: 0, width: W, height: cy, fill: `rgba(89,214,255,${0.03 + (p.n1 - 1) * 0.08})` }));
    svg.appendChild(h('rect', { x: 0, y: cy, width: W, height: H - cy, fill: `rgba(89,214,255,${0.03 + (p.n2 - 1) * 0.08})` }));
    svg.appendChild(h('line', { x1: 0, y1: cy, x2: W, y2: cy, stroke: 'var(--text-2)', 'stroke-width': 2 }));
    svg.appendChild(h('line', { x1: cx, y1: 20, x2: cx, y2: H - 20, stroke: 'var(--text-3)', 'stroke-dasharray': '6 5' }));
    svg.appendChild(text(20, 30, `n₁ = ${fmt(p.n1, 2)} (${nameFor(p.n1)})`, { fill: 'var(--text-2)' }));
    svg.appendChild(text(20, H - 20, `n₂ = ${fmt(p.n2, 2)} (${nameFor(p.n2)})`, { fill: 'var(--text-2)' }));
    svg.appendChild(text(cx + 8, 34, 'normal', { fill: 'var(--text-3)', 'font-size': 11 }));
    const R = 200; const ia = rad(p.i); const sol = solve(p);
    // laser box
    const sx = cx - R * Math.sin(ia), sy = cy - R * Math.cos(ia);
    svg.appendChild(h('rect', { x: sx - 14, y: sy - 14, width: 28, height: 28, transform: `rotate(${p.i} ${sx} ${sy})`, fill: 'var(--bezel)', stroke: 'var(--line-2)' }));
    if (on) {
      svg.appendChild(h('line', { x1: sx, y1: sy, x2: cx, y2: cy, stroke: 'var(--red)', 'stroke-width': 3 }));
      // reflected
      const rx = cx + R * Math.sin(ia), ry = cy - R * Math.cos(ia);
      svg.appendChild(h('line', { x1: cx, y1: cy, x2: rx, y2: ry, stroke: 'var(--red)', 'stroke-width': sol.tir ? 3 : 1.5, opacity: sol.tir ? 1 : .5, 'stroke-dasharray': sol.tir ? '' : '4 4' }));
      if (!sol.tir) { const ra = rad(sol.r); svg.appendChild(h('line', { x1: cx, y1: cy, x2: cx + R * Math.sin(ra), y2: cy + R * Math.cos(ra), stroke: 'var(--red)', 'stroke-width': 3 })); }
      // angle arcs
      svg.appendChild(arc(cx, cy, 60, -90 - p.i, -90, 'var(--amber)')); svg.appendChild(text(cx - 70 * Math.sin(ia / 2) - 10, cy - 70 * Math.cos(ia / 2), `i = ${fmt(p.i, 1)}°`, { fill: 'var(--amber)', 'text-anchor': 'end' }));
      if (!sol.tir) { const ra = rad(sol.r); svg.appendChild(arc(cx, cy, 60, 90 - sol.r, 90, 'var(--phos)')); svg.appendChild(text(cx + 70 * Math.sin(ra / 2) + 10, cy + 70 * Math.cos(ra / 2) + 4, `r = ${fmt(sol.r, 1)}°`, { fill: 'var(--phos)' })); }
      else svg.appendChild(text(cx, cy + 40, 'TOTAL INTERNAL REFLECTION — no refracted ray', { fill: 'var(--amber)', 'text-anchor': 'middle' }));
      svg.appendChild(text(cx + 70 * Math.sin(ia / 2) + 10, cy - 70 * Math.cos(ia / 2), `reflected ${fmt(p.i, 1)}°`, { fill: 'var(--text-3)', 'font-size': 11 }));
    } else svg.appendChild(text(cx, cy - 40, 'LASER OFF — press "Laser on"', { fill: 'var(--text-3)', 'text-anchor': 'middle' }));
    if (isFinite(sol.crit)) svg.appendChild(text(W - 20, 30, `critical angle ${fmt(sol.crit, 1)}°`, { fill: 'var(--cyan)', 'text-anchor': 'end' }));
  },
  readouts(s, p, c, env) {
    const sol = solve(p); const on = env.powered;
    return [
      { label: 'Protractor (r)', value: on && !sol.tir ? fmt(protractor.read(sol.r), 1) : '—', unit: '°', note: on ? (sol.tir ? 'no refracted ray' : 'refracted ray') : 'laser off' },
      { label: 'r (Snell)', value: sol.tir ? 'TIR' : fmt(sol.r, 2), unit: '°', kind: 'theory' },
      { label: 'Critical angle', value: isFinite(sol.crit) ? fmt(sol.crit, 2) : 'none', unit: isFinite(sol.crit) ? '°' : '', kind: 'theory', note: isFinite(sol.crit) ? 'n₁ > n₂' : 'n₁ ≤ n₂' },
      { label: 'n₂ / n₁', value: fmt(p.n2 / p.n1, 3), unit: '', kind: 'theory' },
      { label: 'Speed ratio v₂/v₁', value: fmt(p.n1 / p.n2, 3), unit: '', kind: 'theory' },
      { label: 'Reflected angle', value: on ? fmt(p.i, 1) : '—', unit: '°' },
    ];
  },
  warnings(s, p) { const sol = solve(p); return sol.tir ? [{ level: 'warn', text: `Total internal reflection: i = ${fmt(p.i, 1)}° is above the critical angle ${fmt(sol.crit, 1)}°. No refracted angle can be measured.` }] : []; },
  measure(s, p, c, rng, env) {
    if (!env.powered) return { error: 'Switch the laser on before measuring.' };
    const sol = solve(p); if (sol.tir) return { error: `Total internal reflection — there is no refracted ray. Reduce i below the critical angle (${fmt(sol.crit, 1)}°).` };
    if (p.i === 0) return { error: 'At normal incidence there is no deviation to measure; set i above 0°.' };
    const r = Math.max(0, protractor.read(sol.r, rng));
    return { n1: p.n1, n2: p.n2, i: p.i, r, rth: sol.r, err: pctError(r, sol.r), sini: Math.sin(rad(p.i)), sinr: Math.sin(rad(r)), ratio: Math.sin(rad(p.i)) / Math.sin(rad(r)) };
  },
  analyse(rows, p) {
    const sol = solve(p); const grp = latestGroup(rows, ['n1', 'n2', 'i']); const u = uncStatement(grp, 'r', protractor, '°', 1);
    const e = meanErr(rows, 'err'); const pts = rows.map(r => [r.sini, r.sinr]); const f = linearFit(pts);
    const calcs = [calc('Snell’s law', 'n₁ sin i = n₂ sin r  ⇒  sin r = (n₁/n₂) sin i', `sin r = (${fmt(p.n1, 2)}/${fmt(p.n2, 2)}) × sin ${fmt(p.i, 1)}° = ${fmt(sol.sinr, 4)}`, sol.tir ? 'sin r > 1: no solution (TIR)' : `r = ${fmt(sol.r, 2)}°`)];
    if (isFinite(sol.crit)) calcs.push(calc('Critical angle', 'sin θc = n₂ / n₁', `sin θc = ${fmt(p.n2, 2)} / ${fmt(p.n1, 2)}`, `θc = ${fmt(sol.crit, 2)}°`));
    if (rows.length) { const l = rows[rows.length - 1]; calcs.push(calc('Refractive-index ratio from one reading', 'n₂/n₁ = sin i / sin r', `= sin ${fmt(l.i, 1)}° / sin ${fmt(l.r, 1)}°`, `${fmt(l.ratio, 3)} (set ${fmt(l.n2 / l.n1, 3)})`)); }
    if (f && new Set(rows.map(r => r.i)).size >= 2) calcs.push(calc('Ratio from the sin r vs sin i fit', 'slope = n₁/n₂', `n₂/n₁ = 1 / ${fmt(f.slope, 4)}`, `${fmt(1 / f.slope, 3)} (R² = ${fmt(f.r2, 4)})`));
    const conclusion = !rows.length ? 'No measurements recorded.' : `The measured refracted angles agree with Snell's law within a mean ${fmt(e, 2)} % over ${rows.length} reading${rows.length > 1 ? 's' : ''}.${f && new Set(rows.map(r => r.i)).size >= 2 ? ` A plot of sin r against sin i is linear (R² = ${fmt(f.r2, 3)}) with slope ${fmt(f.slope, 3)}, giving n₂/n₁ = ${fmt(1 / f.slope, 3)} against the set ${fmt(p.n2 / p.n1, 3)} (${fmt(pctError(1 / f.slope, p.n2 / p.n1), 2)} % difference).` : ''} Percentage errors are largest at small angles, where the ±0.5° protractor resolution is a larger fraction of the reading — an argument for using the sin–sin fit rather than single readings.`;
    return {
      objective: 'Measure the angle of refraction for a range of incidence angles, verify Snell’s law, and determine the ratio of refractive indices.',
      setup: [['n₁ (top)', `${fmt(p.n1, 2)} — ${nameFor(p.n1)}`], ['n₂ (bottom)', `${fmt(p.n2, 2)} — ${nameFor(p.n2)}`], ['Incidence', `${fmt(p.i, 1)}°`], ['Protractor', protractor.describe()]],
      calculations: calcs, results: [`Mean angle error: ${fmt(e, 2)} %`, f ? `n₂/n₁ from fit: ${fmt(1 / f.slope, 3)}` : 'No fit yet'],
      errorPct: e, uncertainty: u.text,
      sources: ['Protractor resolution 0.5° and reading noise σ = 0.3°', 'Relative error inflates at small angles', 'The model assumes monochromatic light: dispersion (n varying with wavelength) is not simulated'],
      conclusion,
    };
  },
};
function arc(cx, cy, r, a0, a1, stroke) { const p = a => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return h('path', { d: `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`, fill: 'none', stroke, 'stroke-width': 1.5 }); }
