import { h, clear, text, fmt, calc, latestGroup, meanErr, uncStatement, pctError, actualResistance } from './common.js';
import { instrument } from '../noise.js';
import { linearFit } from '../plot.js';

const ammeter = instrument({ id: 'ammeter', label: 'Digital ammeter (branch and total)', unit: 'A', resolution: 0.0001, relNoise: 0.005, absNoise: 0.00005 });
const voltmeter = instrument({ id: 'voltmeter', label: 'Digital voltmeter', unit: 'V', resolution: 0.01, relNoise: 0.003, absNoise: 0.005 });
const Req = comps => 1 / comps.reduce((s, c) => s + 1 / c.R, 0);
const ReqAct = comps => 1 / comps.reduce((s, c, i) => s + 1 / actualResistance(c.R, i), 0);

export default {
  id: 'parallel', title: 'Parallel Circuit', subject: 'electronics', timed: false, powerLabel: 'Power on',
  params: [{ id: 'V', label: 'Supply voltage', unit: 'V', min: 0, max: 24, step: 0.1, value: 6, digits: 1 }],
  components: { label: 'Parallel branches', singular: 'Branch', min: 1, max: 4, addLabel: 'Add branch', removeLabel: 'Remove',
    template: [{ id: 'R', label: 'Branch resistance', unit: 'Ω', min: 10, max: 10000, step: 10, digits: 0 }], defaults: [{ R: 100 }, { R: 220 }] },
  instruments: [ammeter, voltmeter],
  columns: [
    { id: 'V', label: 'V supply', unit: 'V', digits: 1, kind: 'param' }, { id: 'n', label: 'branches', unit: '', digits: 0, kind: 'param' }, { id: 'Req', label: 'R eq', unit: 'Ω', digits: 1, kind: 'theory' },
    { id: 'I', label: 'I total', unit: 'A', digits: 4, kind: 'meas' }, { id: 'Ith', label: 'I theory', unit: 'A', digits: 4, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' },
    { id: 'Isum', label: 'ΣIᵢ', unit: 'A', digits: 4, kind: 'meas' }, { id: 'I1', label: 'I₁', unit: 'A', digits: 4, kind: 'meas' }, { id: 'I2', label: 'I₂', unit: 'A', digits: 4, kind: 'meas' }, { id: 'I3', label: 'I₃', unit: 'A', digits: 4, kind: 'meas' }, { id: 'I4', label: 'I₄', unit: 'A', digits: 4, kind: 'meas' },
  ],
  graphs: [
    { id: 'IG', label: 'Branch current vs 1/R (latest row, fit → V)', xLabel: 'Conductance 1/R (S)', yLabel: 'Branch current (A)', zeroX: true, zeroY: true,
      build(rows) { const l = rows[rows.length - 1]; if (!l) return { series: [] }; const pts = l._Rs.map((R, i) => [1 / R, l['I' + (i + 1)]]); const f = linearFit(pts);
        return { series: [{ label: 'Measured branch currents', points: pts, kind: 'points', color: 'a' }, { label: `Theory I = V/R (V = ${fmt(l.V, 1)})`, points: [[0, 0], [Math.max(...pts.map(q => q[0])), l.V * Math.max(...pts.map(q => q[0]))]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = supply voltage = ${fmt(f.slope, 2)} V (set ${fmt(l.V, 1)} V).` } : null }; } },
    { id: 'IV', label: 'Total current vs supply (fit → 1/R eq)', xLabel: 'Supply (V)', yLabel: 'Total current (A)', zeroX: true, zeroY: true,
      build(rows, p, comps) { const pts = rows.map(r => [r.V, r.I]); const f = linearFit(pts); return { series: [{ label: 'Measured', points: pts, kind: 'points', color: 'a' }, { label: `Theory, R_eq = ${fmt(Req(comps), 1)} Ω`, points: [[0, 0], [24, 24 / Req(comps)]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `R_eq = 1/slope = ${fmt(1 / f.slope, 1)} Ω.` } : null }; } },
    { id: 'KCL', label: 'ΣIᵢ vs I total (Kirchhoff)', xLabel: 'I total measured (A)', yLabel: 'Sum of branch currents (A)', zeroX: true, zeroY: true,
      build(rows) { const pts = rows.map(r => [r.I, r.Isum]); const m = Math.max(0.001, ...pts.map(q => q[0])); return { series: [{ label: 'ΣIᵢ', points: pts, kind: 'points', color: 'a' }, { label: 'ΣIᵢ = I total', points: [[0, 0], [m, m]], color: 'b', dash: 'dash' }] }; } },
  ],
  tasks: [
    { title: 'Two branches', text: 'Start with 100 Ω and 220 Ω in parallel. Press "Power on".', controls: [] },
    { title: 'Read the currents', text: 'Each branch has its own ammeter. Note the branch with the lower resistance takes more current.', controls: [] },
    { title: 'Measure', text: 'Take a measurement, then open "Branch current vs 1/R".', controls: [] },
    { title: 'Add branches', text: 'Add a third and fourth branch. The equivalent resistance drops below the smallest branch.', controls: [] },
    { title: 'Vary the supply', text: 'Measure at 3 V, 6 V, 9 V, 12 V and view "Total current vs supply".', controls: ['V'] },
  ],
  describe(p, comps) { return `A ${fmt(p.V, 1)} V supply feeds ${comps.length} branch${comps.length > 1 ? 'es' : ''} in parallel (${comps.map((c, i) => `R${i + 1} = ${c.R} Ω`).join(', ')}), each with its own ammeter, plus one ammeter on the supply line. Equivalent resistance ${fmt(Req(comps), 1)} Ω.`; },
  init() { return {}; }, step() {}, done() { return false; },
  render(svg, s, p, comps, env) {
    clear(svg); const on = env.powered; const W = 800, H = 450; const col = on ? 'var(--phos)' : 'var(--text-3)';
    const wire = (x1, y1, x2, y2) => svg.appendChild(h('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 2 }));
    const L = 90, T = 60, B = 390; const n = comps.length; const bx0 = 250, bx1 = 720; const gap = (bx1 - bx0) / n;
    wire(L, T, bx1 - gap / 2, T); wire(L, B, bx1 - gap / 2, B);
    // supply and main ammeter
    wire(L, B, L, 245); wire(L, 205, L, T);
    svg.appendChild(h('line', { x1: L - 18, y1: 217, x2: L + 18, y2: 217, stroke: 'var(--text)', 'stroke-width': 3 })); svg.appendChild(h('line', { x1: L - 9, y1: 233, x2: L + 9, y2: 233, stroke: 'var(--text)', 'stroke-width': 2 }));
    svg.appendChild(text(L - 26, 229, `${fmt(p.V, 1)} V`, { 'text-anchor': 'end', fill: 'var(--text-2)' }));
    const Itot = on ? p.V / ReqAct(comps) : 0;
    svg.appendChild(h('circle', { cx: 170, cy: T, r: 20, fill: 'var(--bg)', stroke: col, 'stroke-width': 2 })); svg.appendChild(text(170, T + 5, 'A', { 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 15 }));
    svg.appendChild(text(170, T + 40, on ? `${fmt(ammeter.read(Itot), 4)} A` : 'OFF', { 'text-anchor': 'middle', fill: col, 'font-size': 12 }));
    comps.forEach((c, i) => {
      const x = bx0 + i * gap + gap / 2; const Ii = on ? p.V / actualResistance(c.R, i) : 0;
      wire(x, T, x, 140); svg.appendChild(h('circle', { cx: x, cy: 160, r: 18, fill: 'var(--bg)', stroke: col, 'stroke-width': 2 })); svg.appendChild(text(x, 165, 'A', { 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 14 }));
      svg.appendChild(text(x + 24, 165, on ? `${fmt(Ii * 1000, 1)} mA` : 'OFF', { fill: col, 'font-size': 11 }));
      wire(x, 178, x, 215);
      svg.appendChild(h('path', { d: `M${x} 215 l-10 5 l20 10 l-20 10 l20 10 l-20 10 l20 10 l-10 5`, fill: 'none', stroke: 'var(--amber)', 'stroke-width': 2 }));
      svg.appendChild(text(x + 18, 250, `R${i + 1} = ${c.R} Ω`, { fill: 'var(--amber)', 'font-size': 12 }));
      wire(x, 275, x, B);
      if (on && !env.rm && Ii > 0) { const period = Math.max(0.5, 5 / (Ii * 1000 + 0.5)); const ph = ((env.t || 0) / period) % 1; for (let k = 0; k < 4; k++) { const y = T + ((ph + k / 4) % 1) * (B - T); svg.appendChild(h('circle', { cx: x, cy: y, r: 3, fill: 'var(--cyan)' })); } }
    });
    svg.appendChild(text(20, H - 20, on ? `STATUS: POWERED — R_eq = ${fmt(Req(comps), 1)} Ω` : 'STATUS: OFF — press Power on', { fill: col, 'font-size': 11 }));
  },
  readouts(s, p, comps, env) {
    const on = env.powered; const Rq = Req(comps); const Itot = p.V / ReqAct(comps);
    const out = [
      { label: 'I total (meter)', value: on ? fmt(ammeter.read(Itot), 4) : '—', unit: 'A', note: on ? `${fmt(Itot * 1000, 2)} mA` : 'power off' },
      { label: 'I total theory', value: fmt(p.V / Rq, 4), unit: 'A', kind: 'theory', note: `V / ${fmt(Rq, 1)} Ω` },
      { label: 'R equivalent', value: fmt(Rq, 1), unit: 'Ω', kind: 'theory', note: '1/R = Σ 1/Rᵢ' },
    ];
    comps.forEach((c, i) => out.push({ label: `I branch ${i + 1}`, value: on ? fmt(ammeter.read(p.V / actualResistance(c.R, i)), 4) : '—', unit: 'A', note: `theory ${fmt(p.V / c.R, 4)} A` }));
    return out;
  },
  warnings(s, p, comps) { const hot = comps.filter(c => p.V * p.V / c.R > 0.25); return hot.length ? [{ level: 'warn', text: `${hot.length} branch resistor${hot.length > 1 ? 's' : ''} would dissipate more than ¼ W at ${fmt(p.V, 1)} V.` }] : []; },
  measure(s, p, comps, rng, env) {
    if (!env.powered) return { error: 'Power on the circuit first.' };
    const Rq = Req(comps); const Itot = p.V / ReqAct(comps); const Im = ammeter.read(Itot, rng);
    const row = { V: p.V, n: comps.length, Req: Rq, I: Im, Ith: p.V / Rq, err: pctError(Im, p.V / Rq), _Rs: comps.map(c => c.R) };
    let sum = 0; comps.forEach((c, i) => { const v = ammeter.read(p.V / actualResistance(c.R, i), rng); row['I' + (i + 1)] = v; sum += v; });
    for (let i = comps.length; i < 4; i++) row['I' + (i + 1)] = NaN;
    row.Isum = sum; row.errKCL = pctError(sum, Im);
    return row;
  },
  analyse(rows, p, comps) {
    const Rq = Req(comps); const grp = latestGroup(rows, ['V', 'Req', 'n']); const u = uncStatement(grp, 'I', ammeter, 'A', 4);
    const e = meanErr(rows, 'err'), ek = meanErr(rows, 'errKCL'); const l = rows[rows.length - 1];
    const calcs = [calc('Equivalent resistance', '1/R_eq = 1/R₁ + 1/R₂ + …', `1/R_eq = ${comps.map(c => '1/' + c.R).join(' + ')} = ${fmt(1 / Rq, 5)} S`, `R_eq = ${fmt(Rq, 2)} Ω`), calc('Total current', 'I = V / R_eq', `= ${fmt(p.V, 1)} / ${fmt(Rq, 2)}`, `${fmt(p.V / Rq, 4)} A`)];
    comps.forEach((c, i) => calcs.push(calc(`Branch ${i + 1} current`, 'Iᵢ = V / Rᵢ', `= ${fmt(p.V, 1)} / ${c.R}`, `${fmt(p.V / c.R, 4)} A`)));
    if (l) calcs.push(calc('Kirchhoff’s current law (latest row)', 'ΣIᵢ = I_total', `${comps.map((c, i) => fmt(l['I' + (i + 1)], 4)).join(' + ')} = ${fmt(l.Isum, 4)}`, `vs ${fmt(l.I, 4)} A (${fmt(l.errKCL, 2)} %)`));
    const smallest = Math.min(...comps.map(c => c.R));
    const conclusion = !rows.length ? 'No measurements recorded.' : `The total current matches V/R_eq within a mean ${fmt(e, 2)} %, and the branch currents sum to the supply current to ${fmt(ek, 2)} % (Kirchhoff’s current law). The equivalent resistance (${fmt(Rq, 1)} Ω) is smaller than the smallest branch (${smallest} Ω), as the reciprocal-sum rule requires, and each branch current is inversely proportional to its resistance. Deviations are consistent with ±1 % component tolerance and 0.5 % ammeter noise.`;
    return {
      objective: 'Verify the reciprocal-sum rule for parallel resistors and Kirchhoff’s current law by measuring branch and total currents.',
      setup: [['Supply', `${fmt(p.V, 1)} V`], ['Branches', comps.map((c, i) => `R${i + 1} = ${c.R} Ω`).join(', ')], ['R equivalent', `${fmt(Rq, 2)} Ω`], ['Ammeters', ammeter.describe()], ['Tolerance', '±1 % per component']],
      calculations: calcs, results: [`Mean total-current error: ${fmt(e, 2)} %`, `Mean KCL closure error: ${fmt(ek, 2)} %`], errorPct: e, uncertainty: u.text,
      sources: ['Ammeter resolution 0.1 mA and 0.5 % noise on each of n + 1 meters', 'Resistor tolerance ±1 %', 'Ideal supply: in a real circuit the supply’s internal resistance would reduce V as branches are added'], conclusion,
    };
  },
};
