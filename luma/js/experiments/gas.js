import { h, clear, text, fmt, calc, latestGroup, meanErr, uncStatement, pctError } from './common.js';
import { instrument } from '../noise.js';
import { linearFit } from '../plot.js';

const R = 8.314; // J/(mol·K)
const gauge = instrument({ id: 'gauge', label: 'Pressure transducer', unit: 'kPa', resolution: 0.1, relNoise: 0.002, absNoise: 0.05 });
const volumeScale = instrument({ id: 'volume', label: 'Piston position scale (volume)', unit: 'L', resolution: 0.01, relNoise: 0.002, absNoise: 0.005 });
const thermo = instrument({ id: 'thermo', label: 'Platinum thermometer', unit: 'K', resolution: 0.1, relNoise: 0, absNoise: 0.2 });
// van der Waals constants, a in Pa·m⁶/mol², b in m³/mol
const GASES = { ideal: { label: 'Ideal gas', a: 0, b: 0 }, he: { label: 'Helium', a: 0.00346, b: 2.38e-5 }, n2: { label: 'Nitrogen', a: 0.137, b: 3.87e-5 }, co2: { label: 'Carbon dioxide', a: 0.364, b: 4.27e-5 }, nh3: { label: 'Ammonia', a: 0.4225, b: 3.71e-5 } };

// Real (vdW) pressure in kPa given V in litres
function pReal(n, T, V, g) { const Vm = V / 1000; return (n * R * T / (Vm - n * g.b) - g.a * n * n / (Vm * Vm)) / 1000; }
function vReal(n, T, P, g) { let V = n * R * T / (P * 1000) * 1000; for (let i = 0; i < 40; i++) { const f = pReal(n, T, V, g) - P; const d = (pReal(n, T, V * 1.0001, g) - pReal(n, T, V, g)) / (V * 0.0001); if (!isFinite(d) || d === 0) break; V -= f / d; if (V <= n * g.b * 1000 * 1.05) V = n * g.b * 1000 * 1.05 + 0.01; } return V; }
/** Resolve the state given the mode: returns {P (kPa), V (L), T, n} for ideal and real gas. */
function stateOf(p) {
  const g = GASES[p.gas]; const n = p.n, T = p.T;
  if (p.mode === 'isobaric') { const P = p.P; return { n, T, P, Videal: n * R * T / (P * 1000) * 1000, V: vReal(n, T, P, g), Pideal: P, g }; }
  const V = p.V; return { n, T, V, Videal: V, Pideal: n * R * T / (V / 1000) / 1000, P: pReal(n, T, V, g), g };
}

export default {
  id: 'gas', title: 'Gas Laws', subject: 'chemistry', timed: false, powerLabel: 'Seal cylinder', animate: true,
  params: [
    { id: 'mode', label: 'Process', unit: '', type: 'select', value: 'isothermal', options: [{ value: 'isothermal', label: 'Isothermal — vary V, read P' }, { value: 'isochoric', label: 'Isochoric — vary T, read P' }, { value: 'isobaric', label: 'Isobaric — vary T, read V' }] },
    { id: 'n', label: 'Amount of gas', unit: 'mol', min: 0.1, max: 5, step: 0.1, value: 1, digits: 1 },
    { id: 'T', label: 'Temperature', unit: 'K', min: 150, max: 1000, step: 1, value: 300, digits: 0 },
    { id: 'V', label: 'Volume', unit: 'L', min: 0.5, max: 50, step: 0.1, value: 10, digits: 1, enabled: p => p.mode !== 'isobaric' },
    { id: 'P', label: 'Pressure (held)', unit: 'kPa', min: 20, max: 5000, step: 10, value: 250, digits: 0, enabled: p => p.mode === 'isobaric' },
    { id: 'gas', label: 'Gas (real-gas behaviour)', unit: '', type: 'select', value: 'ideal', options: Object.entries(GASES).map(([k, v]) => ({ value: k, label: v.label })), advanced: true },
  ],
  components: null,
  instruments: [gauge, volumeScale, thermo],
  columns: [
    { id: 'mode', label: 'Process', unit: '', kind: 'text' }, { id: 'n', label: 'n', unit: 'mol', digits: 1, kind: 'param' }, { id: 'T', label: 'T', unit: 'K', digits: 1, kind: 'meas' }, { id: 'V', label: 'V', unit: 'L', digits: 2, kind: 'meas' }, { id: 'P', label: 'P', unit: 'kPa', digits: 1, kind: 'meas' },
    { id: 'Pideal', label: 'P ideal', unit: 'kPa', digits: 1, kind: 'theory' }, { id: 'Videal', label: 'V ideal', unit: 'L', digits: 2, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' }, { id: 'Z', label: 'PV/nRT', unit: '', digits: 4, kind: 'meas' },
  ],
  graphs: [
    { id: 'PV', label: 'P vs V (Boyle) with ideal isotherm', xLabel: 'Volume (L)', yLabel: 'Pressure (kPa)', zeroX: true, zeroY: true,
      build(rows, p) { const sel = rows.filter(r => r.mode === 'isothermal' && r.T0 === p.T && r.n === p.n); const th = []; for (let i = 1; i <= 60; i++) { const V = 50 * i / 60; th.push([V, p.n * R * p.T / (V / 1000) / 1000]); }
        const vals = sel.length ? sel : rows; const pts = vals.map(r => [r.V, r.P]);
        return { series: [{ label: 'Measured', points: pts, kind: 'points', color: 'a' }, { label: `Ideal isotherm, T = ${p.T} K, n = ${fmt(p.n, 1)}`, points: th, color: 'b', dash: 'dash' }], xmax: Math.max(5, ...pts.map(q => q[0])) * 1.1, ymax: Math.max(...pts.map(q => q[1]), p.n * R * p.T / 0.005 / 1000 / 10) * 1.1 }; } },
    { id: 'P1V', label: 'P vs 1/V (fit slope → nRT)', xLabel: '1 / V (L⁻¹)', yLabel: 'Pressure (kPa)', zeroX: true, zeroY: true,
      build(rows, p) { const sel = rows.filter(r => r.mode === 'isothermal'); const pts = sel.map(r => [1 / r.V, r.P]); const f = linearFit(pts); return { series: [{ label: 'Measured (isothermal rows)', points: pts, kind: 'points', color: 'a' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = nRT = ${fmt(f.slope, 1)} kPa·L; with n = ${fmt(p.n, 1)} mol and T = ${p.T} K, nRT = ${fmt(p.n * R * p.T / 1000, 1)} kPa·L.` } : null }; } },
    { id: 'PT', label: 'P vs T (Gay-Lussac, fit slope → nR/V)', xLabel: 'Temperature (K)', yLabel: 'Pressure (kPa)', zeroX: true, zeroY: true,
      build(rows, p) { const sel = rows.filter(r => r.mode === 'isochoric'); const pts = sel.map(r => [r.T, r.P]); const f = linearFit(pts); return { series: [{ label: 'Measured (isochoric rows)', points: pts, kind: 'points', color: 'a' }, { label: `Ideal, V = ${fmt(p.V, 1)} L`, points: [[0, 0], [1000, p.n * R * 1000 / (p.V / 1000) / 1000]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = nR/V = ${fmt(f.slope, 3)} kPa/K; the line extrapolates to P = 0 at T = ${fmt(-f.intercept / f.slope, 0)} K (absolute zero if ideal).` } : null }; } },
    { id: 'VT', label: 'V vs T (Charles, fit slope → nR/P)', xLabel: 'Temperature (K)', yLabel: 'Volume (L)', zeroX: true, zeroY: true,
      build(rows, p) { const sel = rows.filter(r => r.mode === 'isobaric'); const pts = sel.map(r => [r.T, r.V]); const f = linearFit(pts); return { series: [{ label: 'Measured (isobaric rows)', points: pts, kind: 'points', color: 'a' }, { label: `Ideal, P = ${p.P} kPa`, points: [[0, 0], [1000, p.n * R * 1000 / (p.P * 1000) * 1000]], color: 'b', dash: 'dash' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = nR/P = ${fmt(f.slope, 4)} L/K; V → 0 at T = ${fmt(-f.intercept / f.slope, 0)} K.` } : null }; } },
    { id: 'Z', label: 'Compressibility PV/nRT vs P', xLabel: 'Pressure (kPa)', yLabel: 'Z = PV/nRT', zeroX: true,
      build(rows) { return { series: [{ label: 'Measured Z', points: rows.map(r => [r.P, r.Z]), kind: 'points', color: 'a' }, { label: 'Ideal Z = 1', points: [[0, 1], [Math.max(100, ...rows.map(r => r.P)), 1]], color: 'b', dash: 'dash' }] }; } },
  ],
  tasks: [
    { title: 'Seal the cylinder', text: 'Press "Seal cylinder". The gauge, scale and thermometer come alive.', controls: [] },
    { title: 'Boyle’s law', text: 'In isothermal mode, take measurements at 2, 5, 10, 20 and 40 L. Open "P vs 1/V".', controls: ['V'] },
    { title: 'Gay-Lussac’s law', text: 'Switch to isochoric and measure at 200, 300, 400, 600 K. "P vs T" extrapolates to absolute zero.', controls: ['mode', 'T'] },
    { title: 'Charles’s law', text: 'Switch to isobaric: the piston now moves as you change T. Measure at several temperatures.', controls: ['mode', 'T'] },
    { title: 'Real gases', text: 'Choose carbon dioxide (advanced), compress to 1 L at 300 K, and watch PV/nRT depart from 1.', controls: ['gas', 'V'] },
  ],
  describe(p) { const s = stateOf(p); return `A sealed cylinder with a movable piston contains ${fmt(p.n, 1)} mol of ${s.g.label.toLowerCase()} at ${p.T} K. ${p.mode === 'isothermal' ? `The piston is set to ${fmt(s.V, 2)} L and the gauge reads ${fmt(s.P, 1)} kPa.` : p.mode === 'isochoric' ? `The piston is locked at ${fmt(s.V, 2)} L; heating changes the pressure, now ${fmt(s.P, 1)} kPa.` : `The piston is free and loaded to hold ${p.P} kPa; heating expands the gas, now ${fmt(s.V, 2)} L.`}`; },
  init() { return {}; }, step() {}, done() { return false; },
  render(svg, st, p, c, env) {
    clear(svg); const on = env.powered; const s = stateOf(p); const W = 800, H = 450;
    const cx = 120, cy = 70, cw = 380, ch = 300; const vf = Math.min(1, Math.max(0.03, s.V / 50)); const gasW = cw * vf;
    svg.appendChild(h('rect', { x: cx, y: cy, width: cw, height: ch, fill: 'var(--bg)', stroke: 'var(--line-2)', 'stroke-width': 3 }));
    svg.appendChild(h('rect', { x: cx, y: cy, width: gasW, height: ch, fill: `rgba(89,214,255,${0.05 + 0.25 * Math.min(1, s.P / 1000)})` }));
    // piston
    svg.appendChild(h('rect', { x: cx + gasW, y: cy + 4, width: 22, height: ch - 8, fill: 'var(--bezel)', stroke: 'var(--text-2)' }));
    svg.appendChild(h('rect', { x: cx + gasW + 22, y: cy + ch / 2 - 6, width: W - cx - gasW - 100, height: 12, fill: 'var(--text-3)' }));
    if (p.mode === 'isochoric') svg.appendChild(text(cx + gasW + 30, cy + ch / 2 - 14, 'LOCKED', { fill: 'var(--amber)', 'font-size': 11 }));
    if (p.mode === 'isobaric') svg.appendChild(text(cx + gasW + 30, cy + ch / 2 - 14, `load ${p.P} kPa`, { fill: 'var(--amber)', 'font-size': 11 }));
    // particles
    const N = Math.round(8 + p.n * 14); const t = env.rm || !on ? 0 : (env.t || 0); const sp = Math.sqrt(p.T / 300);
    for (let i = 0; i < N; i++) {
      const fx = ((i * 0.618034 + t * 0.11 * sp * (1 + (i % 5) / 5)) % 1), fy = ((i * 0.381966 + t * 0.09 * sp * (1 + (i % 3) / 3)) % 1);
      const x = cx + 6 + (Math.abs(fx * 2 - 1)) * (gasW - 12), y = cy + 6 + (Math.abs(fy * 2 - 1)) * (ch - 12);
      svg.appendChild(h('circle', { cx: x, cy: y, r: 4, fill: 'var(--cyan)' }));
    }
    // gauge dial
    const gx = 650, gy = 150; svg.appendChild(h('circle', { cx: gx, cy: gy, r: 60, fill: 'var(--panel)', stroke: 'var(--line-2)', 'stroke-width': 2 }));
    for (let k = 0; k <= 10; k++) { const a = Math.PI * (1 + k / 10); svg.appendChild(h('line', { x1: gx + 50 * Math.cos(a), y1: gy + 50 * Math.sin(a), x2: gx + 58 * Math.cos(a), y2: gy + 58 * Math.sin(a), stroke: 'var(--text-3)' })); }
    const pf = Math.min(1, Math.log10(Math.max(1, s.P)) / 4); const na = Math.PI * (1 + pf);
    svg.appendChild(h('line', { x1: gx, y1: gy, x2: gx + 48 * Math.cos(na), y2: gy + 48 * Math.sin(na), stroke: on ? 'var(--phos)' : 'var(--text-3)', 'stroke-width': 3 }));
    svg.appendChild(text(gx, gy + 30, on ? `${fmt(gauge.read(s.P), 1)} kPa` : 'UNSEALED', { 'text-anchor': 'middle', fill: on ? 'var(--phos)' : 'var(--text-3)' }));
    svg.appendChild(text(gx, gy + 48, 'log scale 1–10⁴ kPa', { 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': 10 }));
    // thermometer + volume scale
    svg.appendChild(text(gx - 60, 260, `T = ${on ? fmt(thermo.read(p.T), 1) : '—'} K`, { fill: on ? 'var(--phos)' : 'var(--text-3)' }));
    svg.appendChild(text(gx - 60, 285, `V = ${on ? fmt(volumeScale.read(s.V), 2) : '—'} L`, { fill: on ? 'var(--phos)' : 'var(--text-3)' }));
    svg.appendChild(text(gx - 60, 310, `n = ${fmt(p.n, 1)} mol · ${s.g.label}`, { fill: 'var(--text-2)', 'font-size': 11 }));
    svg.appendChild(text(gx - 60, 335, `PV/nRT = ${on ? fmt(s.P * 1000 * s.V / 1000 / (p.n * R * p.T), 4) : '—'}`, { fill: 'var(--cyan)', 'font-size': 12 }));
    // volume scale under cylinder
    for (let k = 0; k <= 5; k++) { const x = cx + cw * k / 5; svg.appendChild(h('line', { x1: x, y1: cy + ch, x2: x, y2: cy + ch + 8, stroke: 'var(--text-3)' })); svg.appendChild(text(x, cy + ch + 22, `${k * 10}`, { 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': 10 })); }
    svg.appendChild(text(cx + cw / 2, cy + ch + 40, 'volume scale (L)', { 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': 10 }));
    svg.appendChild(text(20, H - 20, on ? `STATUS: SEALED — ${p.mode} process` : 'STATUS: UNSEALED — press "Seal cylinder"', { fill: on ? 'var(--phos)' : 'var(--text-3)', 'font-size': 11 }));
  },
  readouts(st, p, c, env) {
    const on = env.powered; const s = stateOf(p); const Z = s.P * s.V / (p.n * R * p.T);
    return [
      { label: 'Pressure gauge', value: on ? fmt(gauge.read(s.P), 1) : '—', unit: 'kPa', note: on ? '' : 'unsealed' },
      { label: 'P ideal (nRT/V)', value: fmt(s.Pideal, 1), unit: 'kPa', kind: 'theory' },
      { label: 'Volume scale', value: on ? fmt(volumeScale.read(s.V), 2) : '—', unit: 'L' },
      { label: 'V ideal (nRT/P)', value: fmt(s.Videal, 2), unit: 'L', kind: 'theory' },
      { label: 'Thermometer', value: on ? fmt(thermo.read(p.T), 1) : '—', unit: 'K' },
      { label: 'PV / nRT', value: on ? fmt(Z, 4) : '—', unit: '', kind: Math.abs(Z - 1) > 0.02 ? 'warn' : 'meas', note: 'Z = 1 for an ideal gas' },
      { label: 'Density', value: fmt(p.n / s.V, 3), unit: 'mol/L' },
      { label: 'Mean molar KE', value: fmt(1.5 * R * p.T / 1000, 3), unit: 'kJ/mol', kind: 'theory', note: '3RT/2' },
    ];
  },
  warnings(st, p) { const s = stateOf(p); const out = []; if (s.P > 3000) out.push({ level: 'warn', text: `Pressure ${fmt(s.P, 0)} kPa is above 30 atm — a laboratory glass cylinder would fail.` }); if (Math.abs(s.P * s.V / (p.n * R * p.T) - 1) > 0.02) out.push({ level: 'warn', text: `PV/nRT = ${fmt(s.P * s.V / (p.n * R * p.T), 3)}: the ${s.g.label.toLowerCase()} is departing from ideal behaviour (van der Waals corrections).` }); return out; },
  measure(st, p, c, rng, env) {
    if (!env.powered) return { error: 'Seal the cylinder before measuring.' };
    const s = stateOf(p); const P = gauge.read(s.P, rng), V = volumeScale.read(s.V, rng), T = thermo.read(p.T, rng);
    const Z = P * 1000 * (V / 1000) / (p.n * R * T);
    const err = p.mode === 'isobaric' ? pctError(V, s.Videal) : pctError(P, s.Pideal);
    return { mode: p.mode, n: p.n, T, T0: p.T, V, P, Pideal: s.Pideal, Videal: s.Videal, err, Z, gas: p.gas };
  },
  analyse(rows, p) {
    const s = stateOf(p); const grp = latestGroup(rows, ['mode', 'n', 'T0', 'gas']); const u = uncStatement(grp, p.mode === 'isobaric' ? 'V' : 'P', p.mode === 'isobaric' ? volumeScale : gauge, p.mode === 'isobaric' ? 'L' : 'kPa', 2);
    const e = meanErr(rows, 'err');
    const iso = rows.filter(r => r.mode === 'isothermal'), isoc = rows.filter(r => r.mode === 'isochoric'), isob = rows.filter(r => r.mode === 'isobaric');
    const fB = iso.length >= 2 ? linearFit(iso.map(r => [1 / r.V, r.P])) : null, fG = isoc.length >= 2 ? linearFit(isoc.map(r => [r.T, r.P])) : null, fC = isob.length >= 2 ? linearFit(isob.map(r => [r.T, r.V])) : null;
    const calcs = [calc('Ideal gas law', 'P V = n R T', p.mode === 'isobaric' ? `V = ${fmt(p.n, 1)} × 8.314 × ${p.T} / (${p.P} × 10³)` : `P = ${fmt(p.n, 1)} × 8.314 × ${p.T} / ${fmt(p.V / 1000, 4)} m³`, p.mode === 'isobaric' ? `${fmt(s.Videal, 3)} L` : `${fmt(s.Pideal, 2)} kPa`)];
    if (s.g.a) calcs.push(calc('van der Waals (the gas actually in the cylinder)', '(P + a n²/V²)(V − n b) = n R T', `a = ${s.g.a} Pa·m⁶/mol², b = ${s.g.b} m³/mol`, `P = ${fmt(s.P, 2)} kPa, Z = ${fmt(s.P * s.V / (p.n * R * p.T), 4)}`));
    if (fB) calcs.push(calc('Boyle: P vs 1/V', 'slope = n R T', `slope = ${fmt(fB.slope, 2)} kPa·L`, `nRT = ${fmt(p.n * R * p.T / 1000, 2)} kPa·L (R² = ${fmt(fB.r2, 4)})`));
    if (fG) calcs.push(calc('Gay-Lussac: P vs T', 'slope = n R / V; intercept → absolute zero', `slope = ${fmt(fG.slope, 4)} kPa/K`, `T(P=0) = ${fmt(-fG.intercept / fG.slope, 1)} K`));
    if (fC) calcs.push(calc('Charles: V vs T', 'slope = n R / P', `slope = ${fmt(fC.slope, 5)} L/K`, `T(V=0) = ${fmt(-fC.intercept / fC.slope, 1)} K`));
    const parts = [];
    if (!rows.length) parts.push('No measurements recorded.');
    else {
      parts.push(`Over ${rows.length} measurement${rows.length > 1 ? 's' : ''} the gauge readings differed from the ideal-gas prediction by a mean ${fmt(e, 2)} %.`);
      if (p.gas === 'ideal' || e < 1) parts.push('This is within the transducer resolution and noise, so PV = nRT is confirmed for these conditions.');
      else parts.push(`The systematic deviation reflects real-gas behaviour of ${s.g.label.toLowerCase()}: attractive forces (a) lower the pressure at moderate density and excluded volume (b) raises it at high density, so Z = PV/nRT departs from 1.`);
      if (fB) parts.push(`The P–1/V data are linear (R² = ${fmt(fB.r2, 3)}), as Boyle’s law requires.`);
      if (fG) parts.push(`The P–T line extrapolates to zero pressure at ${fmt(-fG.intercept / fG.slope, 0)} K, an estimate of absolute zero.`);
      if (fC) parts.push(`The V–T line extrapolates to zero volume at ${fmt(-fC.intercept / fC.slope, 0)} K.`);
    }
    return {
      objective: 'Test the ideal gas law PV = nRT by measuring pressure, volume and temperature in isothermal, isochoric and isobaric processes, and quantify departures from ideality.',
      setup: [['Process', p.mode], ['n', `${fmt(p.n, 1)} mol`], ['T', `${p.T} K`], [p.mode === 'isobaric' ? 'P (held)' : 'V', p.mode === 'isobaric' ? `${p.P} kPa` : `${fmt(p.V, 1)} L`], ['Gas', s.g.label], ['Gauge', gauge.describe()], ['Volume scale', volumeScale.describe()], ['Thermometer', thermo.describe()]],
      calculations: calcs, results: [`Mean deviation from ideal: ${fmt(e, 2)} %`, fB ? `Boyle fit R² = ${fmt(fB.r2, 4)}` : 'Boyle fit: needs ≥2 isothermal rows', fG ? `Absolute zero from P–T: ${fmt(-fG.intercept / fG.slope, 0)} K` : 'P–T fit: needs ≥2 isochoric rows'], errorPct: e, uncertainty: u.text,
      sources: ['Transducer resolution 0.1 kPa, 0.2 % noise', 'Volume scale 0.01 L, thermometer 0.2 K', 'Real-gas (van der Waals) behaviour when a non-ideal gas is selected — systematic', 'The van der Waals model itself is approximate near the critical point'], conclusion: parts.join(' '),
    };
  },
};
