import { h, clear, text, fmt, calc, latestGroup, meanErr, uncStatement, pctError, actualResistance } from './common.js';
import { instrument } from '../noise.js';
import { linearFit } from '../plot.js';

const ammeter = instrument({ id: 'ammeter', label: 'Digital ammeter', unit: 'A', resolution: 0.0001, relNoise: 0.005, absNoise: 0.00005 });
const voltmeter = instrument({ id: 'voltmeter', label: 'Digital voltmeter', unit: 'V', resolution: 0.01, relNoise: 0.003, absNoise: 0.005 });
const Rnom = comps => comps.reduce((s, c) => s + c.R, 0);
const Ract = comps => comps.reduce((s, c, i) => s + actualResistance(c.R, i), 0);

export default {
  id: 'series', title: 'Series Circuit', subject: 'electronics', timed: false, powerLabel: 'Power on',
  params: [{ id: 'V', label: 'Supply voltage', unit: 'V', min: 0, max: 24, step: 0.1, value: 9, digits: 1 }],
  components: { label: 'Resistors in series', singular: 'Resistor', min: 1, max: 4, addLabel: 'Add resistor', removeLabel: 'Remove',
    template: [{ id: 'R', label: 'Resistance', unit: 'Ω', min: 10, max: 10000, step: 10, digits: 0 }], defaults: [{ R: 100 }, { R: 220 }, { R: 330 }] },
  instruments: [ammeter, voltmeter],
  columns: [
    { id: 'V', label: 'V supply', unit: 'V', digits: 1, kind: 'param' }, { id: 'n', label: 'n', unit: '', digits: 0, kind: 'param' }, { id: 'R', label: 'R total', unit: 'Ω', digits: 0, kind: 'theory' },
    { id: 'I', label: 'I meter', unit: 'A', digits: 4, kind: 'meas' }, { id: 'Ith', label: 'I theory', unit: 'A', digits: 4, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' },
    { id: 'Vsum', label: 'ΣV meas', unit: 'V', digits: 2, kind: 'meas' }, { id: 'V1', label: 'V₁', unit: 'V', digits: 2, kind: 'meas' }, { id: 'V2', label: 'V₂', unit: 'V', digits: 2, kind: 'meas' }, { id: 'V3', label: 'V₃', unit: 'V', digits: 2, kind: 'meas' }, { id: 'V4', label: 'V₄', unit: 'V', digits: 2, kind: 'meas' },
  ],
  graphs: [
    { id: 'VR', label: 'Voltage drop vs resistance (latest row, fit → I)', xLabel: 'Resistance (Ω)', yLabel: 'Voltage across element (V)', zeroX: true, zeroY: true,
      build(rows) { const l = rows[rows.length - 1]; if (!l) return { series: [] }; const pts = l._Rs.map((R, i) => [R, l['V' + (i + 1)]]); const f = linearFit(pts);
        return { series: [{ label: 'Measured drops', points: pts, kind: 'points', color: 'a' }, { label: `Theory V = I·R (I = ${fmt(l.Ith, 4)} A)`, points: [[0, 0], [Math.max(...l._Rs), l.Ith * Math.max(...l._Rs)]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = current = ${fmt(f.slope, 4)} A (ammeter read ${fmt(l.I, 4)} A).` } : null }; } },
    { id: 'IV', label: 'Current vs supply voltage (fit → 1/R total)', xLabel: 'Supply (V)', yLabel: 'Current (A)', zeroX: true, zeroY: true,
      build(rows, p, comps) { const pts = rows.map(r => [r.V, r.I]); const f = linearFit(pts); return { series: [{ label: 'Measured', points: pts, kind: 'points', color: 'a' }, { label: `Theory, R = ${Rnom(comps)} Ω`, points: [[0, 0], [24, 24 / Rnom(comps)]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = 1/R_total ⇒ R_total = ${fmt(1 / f.slope, 1)} Ω.` } : null }; } },
    { id: 'KVL', label: 'ΣV measured vs supply (Kirchhoff)', xLabel: 'Supply (V)', yLabel: 'Sum of drops (V)', zeroX: true, zeroY: true,
      build(rows) { const pts = rows.map(r => [r.V, r.Vsum]); return { series: [{ label: 'ΣV measured', points: pts, kind: 'points', color: 'a' }, { label: 'ΣV = V supply', points: [[0, 0], [24, 24]], color: 'b', dash: 'dash' }] }; } },
  ],
  tasks: [
    { title: 'Build the chain', text: 'Use the default three resistors (100, 220, 330 Ω) or add a fourth.', controls: [] },
    { title: 'Power on and read', text: 'Press "Power on". Compare the ammeter with V / (R₁ + R₂ + R₃).', controls: [] },
    { title: 'Measure', text: 'Take a measurement. The voltage across each resistor is recorded (V₁, V₂, …).', controls: [] },
    { title: 'Check Kirchhoff', text: 'Open the "Voltage drop vs resistance" graph: the drops are proportional to R and sum to the supply.', controls: [] },
    { title: 'Vary the supply', text: 'Repeat at 3 V, 6 V, 12 V and view "Current vs supply voltage".', controls: ['V'] },
  ],
  describe(p, comps) { return `A ${fmt(p.V, 1)} V supply drives ${comps.length} resistor${comps.length > 1 ? 's' : ''} connected end-to-end (${comps.map((c, i) => `R${i + 1} = ${c.R} Ω`).join(', ')}). One ammeter is in series; a voltmeter is placed across each resistor in turn.`; },
  init() { return {}; }, step() {}, done() { return false; },
  render(svg, s, p, comps, env) {
    clear(svg); const on = env.powered; const W = 800, H = 450, L = 100, R = 700, T = 110, B = 340;
    const col = on ? 'var(--phos)' : 'var(--text-3)';
    const wire = (x1, y1, x2, y2) => svg.appendChild(h('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 2 }));
    const I = on ? p.V / Ract(comps) : 0;
    const n = comps.length, seg = (R - L - 120) / n;
    wire(L, T, L + 60, T);
    comps.forEach((c, i) => {
      const x0 = L + 60 + i * seg, zx = x0 + seg / 2 - 30;
      wire(x0, T, zx, T);
      svg.appendChild(h('path', { d: `M${zx} ${T} l5 -10 l10 20 l10 -20 l10 20 l10 -20 l10 20 l5 -10`, fill: 'none', stroke: 'var(--amber)', 'stroke-width': 2 }));
      svg.appendChild(text(zx + 30, T - 20, `R${i + 1} = ${c.R} Ω`, { 'text-anchor': 'middle', fill: 'var(--amber)' }));
      wire(zx + 60, T, x0 + seg, T);
      // voltmeter across element
      const vy = T + 70; wire(zx - 4, T, zx - 4, vy); wire(zx + 64, T, zx + 64, vy); wire(zx - 4, vy, zx + 14, vy); wire(zx + 46, vy, zx + 64, vy);
      svg.appendChild(h('circle', { cx: zx + 30, cy: vy, r: 16, fill: 'var(--bg)', stroke: col, 'stroke-width': 2 }));
      svg.appendChild(text(zx + 30, vy + 4, 'V', { 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 13 }));
      svg.appendChild(text(zx + 30, vy + 36, on ? `${fmt(voltmeter.read(I * actualResistance(c.R, i)), 2)} V` : 'OFF', { 'text-anchor': 'middle', fill: col, 'font-size': 12 }));
    });
    wire(R - 60, T, R, T); wire(R, T, R, 200); svg.appendChild(h('circle', { cx: R, cy: 225, r: 22, fill: 'var(--bg)', stroke: col, 'stroke-width': 2 })); svg.appendChild(text(R, 230, 'A', { 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 16 }));
    svg.appendChild(text(R - 30, 230, on ? `${fmt(ammeter.read(I), 4)} A` : 'OFF', { 'text-anchor': 'end', fill: col }));
    wire(R, 247, R, B); wire(R, B, L, B); wire(L, B, L, 245); wire(L, 205, L, T);
    svg.appendChild(h('line', { x1: L - 18, y1: 217, x2: L + 18, y2: 217, stroke: 'var(--text)', 'stroke-width': 3 })); svg.appendChild(h('line', { x1: L - 9, y1: 233, x2: L + 9, y2: 233, stroke: 'var(--text)', 'stroke-width': 2 }));
    svg.appendChild(text(L - 26, 229, `${fmt(p.V, 1)} V`, { 'text-anchor': 'end', fill: 'var(--text-2)' }));
    if (on && !env.rm && I > 0) { const period = Math.max(0.6, 6 / (I * 1000 + 0.5)); const ph = ((env.t || 0) / period) % 1; const total = 2 * (R - L) + 2 * (B - T); const path = [[L, T], [R, T], [R, B], [L, B]]; for (let k = 0; k < 10; k++) { const pt = along(path, ((ph + k / 10) % 1) * total); svg.appendChild(h('circle', { cx: pt[0], cy: pt[1], r: 3, fill: 'var(--cyan)' })); } }
    svg.appendChild(text(20, H - 20, on ? `STATUS: POWERED — I = ${fmt(I * 1000, 2)} mA through every element` : 'STATUS: OFF — press Power on', { fill: col, 'font-size': 11 }));
  },
  readouts(s, p, comps, env) {
    const on = env.powered; const Rn = Rnom(comps); const I = p.V / Ract(comps);
    const out = [
      { label: 'Ammeter', value: on ? fmt(ammeter.read(I), 4) : '—', unit: 'A', note: on ? `${fmt(I * 1000, 2)} mA` : 'power off' },
      { label: 'I theory', value: fmt(p.V / Rn, 4), unit: 'A', kind: 'theory', note: `V / ${Rn} Ω` },
      { label: 'R total (nominal)', value: fmt(Rn, 0), unit: 'Ω', kind: 'theory' },
    ];
    comps.forEach((c, i) => out.push({ label: `V across R${i + 1}`, value: on ? fmt(voltmeter.read(I * actualResistance(c.R, i)), 2) : '—', unit: 'V', note: `theory ${fmt(p.V * c.R / Rn, 2)} V` }));
    out.push({ label: 'Total power', value: on ? fmt(p.V * I, 3) : '—', unit: 'W' });
    return out;
  },
  warnings(s, p, comps) { const I = p.V / Rnom(comps); const hot = comps.filter(c => I * I * c.R > 0.25); return hot.length ? [{ level: 'warn', text: `${hot.length} resistor${hot.length > 1 ? 's' : ''} would dissipate more than ¼ W at this supply.` }] : []; },
  measure(s, p, comps, rng, env) {
    if (!env.powered) return { error: 'Power on the circuit first.' };
    const Rn = Rnom(comps); const I = p.V / Ract(comps); const Im = ammeter.read(I, rng);
    const row = { V: p.V, n: comps.length, R: Rn, I: Im, Ith: p.V / Rn, err: pctError(Im, p.V / Rn), _Rs: comps.map(c => c.R), _Vth: comps.map(c => p.V * c.R / Rn) };
    let sum = 0; comps.forEach((c, i) => { const v = voltmeter.read(I * actualResistance(c.R, i), rng); row['V' + (i + 1)] = v; sum += v; });
    for (let i = comps.length; i < 4; i++) row['V' + (i + 1)] = NaN;
    row.Vsum = sum; row.errKVL = pctError(sum, p.V);
    return row;
  },
  analyse(rows, p, comps) {
    const Rn = Rnom(comps); const grp = latestGroup(rows, ['V', 'R', 'n']); const u = uncStatement(grp, 'I', ammeter, 'A', 4);
    const e = meanErr(rows, 'err'), ek = meanErr(rows, 'errKVL'); const l = rows[rows.length - 1];
    const calcs = [calc('Equivalent resistance', 'R_total = R₁ + R₂ + … + Rₙ', `= ${comps.map(c => c.R).join(' + ')}`, `${Rn} Ω`), calc('Current', 'I = V / R_total', `= ${fmt(p.V, 1)} / ${Rn}`, `${fmt(p.V / Rn, 4)} A`)];
    comps.forEach((c, i) => calcs.push(calc(`Voltage across R${i + 1}`, 'Vᵢ = I × Rᵢ', `= ${fmt(p.V / Rn, 4)} × ${c.R}`, `${fmt(p.V * c.R / Rn, 3)} V`)));
    if (l) calcs.push(calc('Kirchhoff’s voltage law (latest row)', 'ΣVᵢ = V_supply', `${comps.map((c, i) => fmt(l['V' + (i + 1)], 2)).join(' + ')} = ${fmt(l.Vsum, 2)}`, `vs ${fmt(l.V, 2)} V (${fmt(l.errKVL, 2)} %)`));
    const conclusion = !rows.length ? 'No measurements recorded.' : `The measured current agrees with V/ΣR within a mean ${fmt(e, 2)} %, confirming that series resistances add. The sum of the individual voltage drops equals the supply voltage to ${fmt(ek, 2)} % (Kirchhoff’s voltage law), and each drop is proportional to its resistance. Residual differences match the ±1 % component tolerance plus meter noise; they are not evidence against the model.`;
    return {
      objective: 'Show that resistors in series add, that the same current flows through each, and that the voltage drops sum to the supply voltage.',
      setup: [['Supply', `${fmt(p.V, 1)} V`], ['Resistors', comps.map((c, i) => `R${i + 1} = ${c.R} Ω`).join(', ')], ['Ammeter', ammeter.describe()], ['Voltmeter', voltmeter.describe()], ['Tolerance', '±1 % per component (fixed per slot)']],
      calculations: calcs, results: [`Mean current error: ${fmt(e, 2)} %`, `Mean KVL closure error: ${fmt(ek, 2)} %`], errorPct: e, uncertainty: u.text,
      sources: ['Ammeter 0.1 mA resolution, 0.5 % noise', 'Voltmeter 0.01 V resolution, 0.3 % noise — summed over n readings for ΣV', 'Resistor tolerance ±1 %', 'Ideal supply and meters (no internal resistance, no loading)'], conclusion,
    };
  },
};
function along(path, d) { for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= len) { const f = d / len; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; } d -= len; } return path[0]; }
