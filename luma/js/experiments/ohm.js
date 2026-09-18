import { h, clear, text, fmt, calc, latestGroup, meanErr, uncStatement, pctError, actualResistance } from './common.js';
import { instrument } from '../noise.js';
import { linearFit } from '../plot.js';

const ammeter = instrument({ id: 'ammeter', label: 'Digital ammeter', unit: 'A', resolution: 0.0001, relNoise: 0.005, absNoise: 0.00005 });
const voltmeter = instrument({ id: 'voltmeter', label: 'Digital voltmeter', unit: 'V', resolution: 0.01, relNoise: 0.003, absNoise: 0.005 });

const Rnom = comps => comps.reduce((s, c) => s + c.R, 0);
const Ract = comps => comps.reduce((s, c, i) => s + actualResistance(c.R, i), 0);

export default {
  id: 'ohm', title: "Ohm's Law", subject: 'physics', timed: false, powerLabel: 'Power on',
  params: [{ id: 'V', label: 'Supply voltage', unit: 'V', min: 0, max: 12, step: 0.1, value: 5, digits: 1 }],
  components: { label: 'Resistors (in series)', singular: 'Resistor', min: 1, max: 4, addLabel: 'Add resistor', removeLabel: 'Remove',
    template: [{ id: 'R', label: 'Resistance', unit: 'Ω', min: 10, max: 10000, step: 10, digits: 0 }], defaults: [{ R: 220 }, { R: 470 }, { R: 1000 }] },
  instruments: [ammeter, voltmeter],
  columns: [
    { id: 'V', label: 'V set', unit: 'V', digits: 1, kind: 'param' }, { id: 'R', label: 'R nominal', unit: 'Ω', digits: 0, kind: 'param' },
    { id: 'Vm', label: 'V meter', unit: 'V', digits: 2, kind: 'meas' }, { id: 'I', label: 'I meter', unit: 'A', digits: 4, kind: 'meas' },
    { id: 'Ith', label: 'I = V/R', unit: 'A', digits: 4, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' },
  ],
  graphs: [
    { id: 'IV', label: 'I vs V (fit → R)', xLabel: 'Voltage (V)', yLabel: 'Current (A)', zeroX: true, zeroY: true,
      build(rows, p, comps) { const pts = rows.map(r => [r.Vm, r.I]); const f = linearFit(pts); const R = Rnom(comps);
        return { series: [{ label: 'Measured', points: pts, kind: 'points', color: 'a' }, { label: `Theory I = V/${R} Ω`, points: [[0, 0], [12, 12 / R]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = 1/R, so R = ${fmt(1 / f.slope, 1)} Ω from the fit (nominal ${R} Ω).` } : null }; } },
    { id: 'VI', label: 'V vs I (fit slope = R)', xLabel: 'Current (A)', yLabel: 'Voltage (V)', zeroX: true, zeroY: true,
      build(rows) { const pts = rows.map(r => [r.I, r.Vm]); const f = linearFit(pts);
        return { series: [{ label: 'Measured', points: pts, kind: 'points', color: 'a' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = R = ${fmt(f.slope, 1)} Ω.` } : null }; } },
    { id: 'MT', label: 'Measured vs theoretical current', xLabel: 'I theory (A)', yLabel: 'I measured (A)', zeroX: true, zeroY: true,
      build(rows) { const pts = rows.map(r => [r.Ith, r.I]); const f = linearFit(pts); return { series: [{ label: 'Measured vs theory', points: pts, kind: 'points', color: 'a' }], fit: f ? { ...f, label: 'Fit', meaning: 'A slope of 1 means agreement.' } : null }; } },
  ],
  tasks: [
    { title: 'Build the circuit', text: 'Keep one resistor to begin: remove the others with "Remove" so the chain has a single 220 Ω element.', controls: [] },
    { title: 'Power on', text: 'Press "Power on". The meters read the supply voltage and current.', controls: [] },
    { title: 'Measure at several voltages', text: 'Set 2 V, 4 V, 6 V, 8 V, 10 V, taking a measurement at each.', controls: ['V'] },
    { title: 'Fit the line', text: 'Open the "I vs V" graph. The slope of the line is 1/R.', controls: [] },
    { title: 'Add resistors', text: 'Add a second resistor and repeat: the slope falls as the total resistance rises.', controls: [] },
  ],
  describe(p, comps) { return `A variable DC supply set to ${fmt(p.V, 1)} V drives ${comps.length} resistor${comps.length > 1 ? 's in series' : ''} (${comps.map(c => c.R + ' Ω').join(', ')}; total ${Rnom(comps)} Ω nominal). An ammeter is in series with the chain and a voltmeter is across the whole chain.`; },
  init() { return { powered: false }; },
  step() {},
  done() { return false; },
  render(svg, s, p, comps, env) {
    clear(svg);
    const W = 800, H = 450, on = env.powered;
    const L = 120, R = 680, T = 90, B = 360;
    const wire = (x1, y1, x2, y2) => svg.appendChild(h('line', { x1, y1, x2, y2, stroke: on ? 'var(--phos)' : 'var(--text-3)', 'stroke-width': 2 }));
    // top wire with resistors
    const n = comps.length; const span = (R - L - 160); const seg = span / n;
    wire(L, T, L + 80, T);
    comps.forEach((c, i) => {
      const x0 = L + 80 + i * seg; const zx = x0 + seg / 2 - 30;
      wire(x0, T, zx, T);
      svg.appendChild(h('path', { d: `M${zx} ${T} l5 -10 l10 20 l10 -20 l10 20 l10 -20 l10 20 l5 -10`, fill: 'none', stroke: 'var(--amber)', 'stroke-width': 2 }));
      svg.appendChild(text(zx + 30, T - 18, `R${i + 1} = ${c.R} Ω`, { 'text-anchor': 'middle', fill: 'var(--amber)' }));
      wire(zx + 60, T, x0 + seg, T);
    });
    // ammeter
    wire(R - 80, T, R, T); wire(R, T, R, (T + B) / 2 - 22);
    svg.appendChild(h('circle', { cx: R, cy: (T + B) / 2, r: 22, fill: 'var(--bg)', stroke: on ? 'var(--phos)' : 'var(--text-3)', 'stroke-width': 2 }));
    svg.appendChild(text(R, (T + B) / 2 + 5, 'A', { 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 16 }));
    wire(R, (T + B) / 2 + 22, R, B); wire(R, B, L, B);
    // battery
    wire(L, B, L, (T + B) / 2 + 24); wire(L, (T + B) / 2 - 24, L, T);
    svg.appendChild(h('line', { x1: L - 18, y1: (T + B) / 2 - 8, x2: L + 18, y2: (T + B) / 2 - 8, stroke: 'var(--text)', 'stroke-width': 3 }));
    svg.appendChild(h('line', { x1: L - 9, y1: (T + B) / 2 + 8, x2: L + 9, y2: (T + B) / 2 + 8, stroke: 'var(--text)', 'stroke-width': 2 }));
    svg.appendChild(text(L - 26, (T + B) / 2 + 4, `${fmt(p.V, 1)} V`, { 'text-anchor': 'end', fill: 'var(--text-2)' }));
    // voltmeter across chain
    const vy = T + 70; wire(L + 80, T, L + 80, vy); wire(R - 80, T, R - 80, vy); wire(L + 80, vy, (L + R) / 2 - 22, vy); wire((L + R) / 2 + 22, vy, R - 80, vy);
    svg.appendChild(h('circle', { cx: (L + R) / 2, cy: vy, r: 22, fill: 'var(--bg)', stroke: on ? 'var(--phos)' : 'var(--text-3)', 'stroke-width': 2 }));
    svg.appendChild(text((L + R) / 2, vy + 5, 'V', { 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 16 }));
    // meter readings
    const I = on ? p.V / Ract(comps) : 0;
    svg.appendChild(text(R - 34, (T + B) / 2 + 5, on ? `${fmt(ammeter.read(I), 4)} A` : 'OFF', { 'text-anchor': 'end', fill: on ? 'var(--phos)' : 'var(--text-3)' }));
    svg.appendChild(text((L + R) / 2, vy + 40, on ? `${fmt(voltmeter.read(p.V), 2)} V` : 'OFF', { 'text-anchor': 'middle', fill: on ? 'var(--phos)' : 'var(--text-3)' }));
    // moving charge markers
    if (on && !env.rm && I > 0) {
      const period = Math.max(0.6, 6 / (I * 1000 + 0.5)); const ph = ((env.t || 0) / period) % 1;
      const path = [[L, T], [R, T], [R, B], [L, B]]; const total = 2 * (R - L) + 2 * (B - T);
      for (let k = 0; k < 8; k++) { const d = ((ph + k / 8) % 1) * total; const pt = along(path, d); svg.appendChild(h('circle', { cx: pt[0], cy: pt[1], r: 3, fill: 'var(--cyan)' })); }
    }
    svg.appendChild(text(20, H - 20, on ? 'STATUS: POWERED — meters live' : 'STATUS: OFF — press Power on', { fill: on ? 'var(--phos)' : 'var(--text-3)', 'font-size': 11 }));
  },
  readouts(s, p, comps, env) {
    const on = env.powered; const Rn = Rnom(comps); const I = p.V / Ract(comps);
    return [
      { label: 'Voltmeter', value: on ? fmt(voltmeter.read(p.V), 2) : '—', unit: 'V', note: on ? 'across chain' : 'power off' },
      { label: 'Ammeter', value: on ? fmt(ammeter.read(I), 4) : '—', unit: 'A', note: on ? `${fmt(I * 1000, 2)} mA` : 'power off' },
      { label: 'R total (nominal)', value: fmt(Rn, 0), unit: 'Ω', kind: 'theory' },
      { label: 'I = V/R (theory)', value: fmt(p.V / Rn, 4), unit: 'A', kind: 'theory' },
      { label: 'Power dissipated', value: on ? fmt(p.V * I, 3) : '—', unit: 'W' },
    ];
  },
  warnings(s, p, comps) { const P = p.V * p.V / Rnom(comps); return P > 0.25 ? [{ level: 'warn', text: `Dissipation ${fmt(P, 2)} W exceeds a ¼ W resistor rating — a real component would overheat.` }] : []; },
  measure(s, p, comps, rng, env) {
    if (!env.powered) return { error: 'Power on the circuit before taking a measurement.' };
    const Rn = Rnom(comps); const I = p.V / Ract(comps);
    const Im = ammeter.read(I, rng), Vm = voltmeter.read(p.V, rng); const Ith = p.V / Rn;
    return { V: p.V, R: Rn, n: comps.length, Vm, I: Im, Ith, err: pctError(Im, Ith) };
  },
  analyse(rows, p, comps) {
    const Rn = Rnom(comps); const grp = latestGroup(rows, ['V', 'R']); const u = uncStatement(grp, 'I', ammeter, 'A', 4);
    const e = meanErr(rows, 'err'); const pts = rows.map(r => [r.Vm, r.I]); const f = linearFit(pts); const Rfit = f ? 1 / f.slope : NaN;
    const calcs = [calc('Total series resistance', 'R = R₁ + R₂ + …', `R = ${comps.map(c => c.R).join(' + ')}`, `${Rn} Ω`), calc("Ohm's law", 'I = V / R', `I = ${fmt(p.V, 1)} / ${Rn}`, `${fmt(p.V / Rn, 4)} A`)];
    if (rows.length) { const l = rows[rows.length - 1]; calcs.push(calc('Percentage error (latest row)', '|I_meas − I_theory| / I_theory × 100', `|${fmt(l.I, 4)} − ${fmt(l.Ith, 4)}| / ${fmt(l.Ith, 4)} × 100`, `${fmt(l.err, 2)} %`)); }
    if (f && new Set(rows.map(r => r.V)).size >= 2) calcs.push(calc('Resistance from the V–I fit', 'slope of I vs V = 1/R', `R = 1 / ${fmt(f.slope, 5)}`, `${fmt(Rfit, 1)} Ω (R² = ${fmt(f.r2, 4)})`));
    const distinct = new Set(rows.map(r => r.V)).size;
    const conclusion = !rows.length ? 'No measurements recorded.' : `Across ${rows.length} reading${rows.length > 1 ? 's' : ''} the measured current agreed with V/R within a mean ${fmt(e, 2)} %.${distinct >= 2 && f ? ` The I–V data are linear (R² = ${fmt(f.r2, 3)}), confirming Ohm's law, with a fitted resistance of ${fmt(Rfit, 1)} Ω against ${Rn} Ω nominal (${fmt(pctError(Rfit, Rn), 2)} % difference, within the ±1 % manufacturing tolerance and meter noise).` : ' Measure at two or more voltages to test linearity and extract R from a fit.'}`;
    return {
      objective: 'Verify that current through a resistor is proportional to the voltage across it (I = V/R) and determine the resistance from the V–I graph.',
      setup: [['Supply', `${fmt(p.V, 1)} V`], ['Resistors', comps.map((c, i) => `R${i + 1} = ${c.R} Ω`).join(', ')], ['Total R (nominal)', `${Rn} Ω`], ['Ammeter', ammeter.describe()], ['Voltmeter', voltmeter.describe()], ['Component tolerance', '±1 % (fixed per slot)']],
      calculations: calcs,
      results: [`Mean current error: ${fmt(e, 2)} %`, isFinite(Rfit) ? `R from fit: ${fmt(Rfit, 1)} Ω` : 'No fit yet'],
      errorPct: e, uncertainty: u.text,
      sources: ['Ammeter resolution 0.1 mA and 0.5 % reading noise', 'Voltmeter resolution 0.01 V and 0.3 % noise', 'Resistor manufacturing tolerance (±1 %) — a systematic offset', 'Ideal wires and supply (zero internal resistance) assumed'],
      conclusion,
    };
  },
};
function along(path, d) { for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= len) { const f = d / len; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; } d -= len; } return path[0]; }
