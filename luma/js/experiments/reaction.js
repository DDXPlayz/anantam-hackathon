import { h, clear, text, rk4, fmt, calc, latestGroup, meanErr, uncStatement, pctError } from './common.js';
import { instrument } from '../noise.js';
import { linearFit } from '../plot.js';

const RGAS = 8.314; // J/(mol·K)
const probe = instrument({ id: 'probe', label: 'Concentration probe (colorimeter)', unit: 'M', resolution: 0.001, relNoise: 0.004, absNoise: 0.0005 });

function kOf(p) { const Ea = (p.Ea - (p.catalyst ? p.dEa : 0)) * 1000; return p.A * Math.exp(-Ea / (RGAS * p.T)); }
function duration(p) { const k = kOf(p); const n = +p.order; const t = n === 1 ? 4 / k : 19 / (k * p.c0); return Math.min(3600, Math.max(5, t)); }
function exact(p, t) { const k = kOf(p); return +p.order === 1 ? p.c0 * Math.exp(-k * t) : p.c0 / (1 + k * p.c0 * t); }
const rate0 = p => kOf(p) * Math.pow(p.c0, +p.order);
const tHalf = p => (+p.order === 1 ? Math.LN2 / kOf(p) : 1 / (kOf(p) * p.c0));

export default {
  id: 'reaction', title: 'Reaction Rate', subject: 'chemistry', timed: true,
  speed(p) { return duration(p) / 12; },
  params: [
    { id: 'c0', label: 'Initial concentration [A]₀', unit: 'M', min: 0.05, max: 2, step: 0.05, value: 1, digits: 2 },
    { id: 'T', label: 'Temperature', unit: 'K', min: 250, max: 400, step: 1, value: 298, digits: 0 },
    { id: 'catalyst', label: 'Catalyst present', unit: '', type: 'check', value: false },
    { id: 'Ea', label: 'Activation energy Eₐ', unit: 'kJ/mol', min: 20, max: 120, step: 1, value: 50, digits: 0, advanced: true },
    { id: 'dEa', label: 'Catalyst lowers Eₐ by', unit: 'kJ/mol', min: 5, max: 40, step: 1, value: 15, digits: 0, advanced: true },
    { id: 'A', label: 'Pre-exponential factor A', unit: 's⁻¹ (M⁻¹s⁻¹ if 2nd order)', min: 1e6, max: 1e9, step: 1e6, value: 1e7, digits: 0, advanced: true },
    { id: 'order', label: 'True reaction order (hidden from the data)', unit: '', type: 'select', value: '1', options: [{ value: '1', label: 'First order' }, { value: '2', label: 'Second order' }], advanced: true },
  ],
  components: null,
  instruments: [probe],
  columns: [
    { id: 'c0', label: '[A]₀', unit: 'M', digits: 2, kind: 'param' }, { id: 'T', label: 'T', unit: 'K', digits: 0, kind: 'param' }, { id: 'cat', label: 'Cat.', unit: '', kind: 'text' }, { id: 'Ea', label: 'Eₐ eff', unit: 'kJ/mol', digits: 0, kind: 'param' },
    { id: 'rate', label: 'Initial rate', unit: 'M/s', digits: 4, kind: 'meas' }, { id: 'rateth', label: 'k[A]₀ⁿ', unit: 'M/s', digits: 4, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' },
    { id: 'k', label: 'k (theory)', unit: '', digits: 4, kind: 'theory' }, { id: 'thalf', label: 't½ meas', unit: 's', digits: 1, kind: 'meas' },
  ],
  graphs: [
    { id: 'live', label: 'Live: [A] vs time', live: true, xLabel: 'Time (s)', yLabel: '[A] (M)', zeroX: true, zeroY: true,
      build(rows, p, c, s) { const th = []; if (s) for (let i = 0; i <= 100; i++) { const t = s.tEnd * i / 100; th.push([t, exact(p, t)]); }
        return { series: [{ label: 'Probe readings', points: s ? s.samples : [], kind: 'points', color: 'a' }, { label: 'Simulated [A]', points: s ? s.trace : [], color: 'a' }, { label: `Analytic ${+p.order === 1 ? '[A]₀e^(−kt)' : '[A]₀/(1+k[A]₀t)'}`, points: th, color: 'b', dash: 'dash' }] }; } },
    { id: 'order', label: 'ln(rate) vs ln[A]₀ (fit slope → order)', xLabel: 'ln [A]₀', yLabel: 'ln (initial rate)',
      build(rows, p) { const sel = rows.filter(r => r.T === p.T && r.cat === (p.catalyst ? 'yes' : 'no') && r.rate > 0); const pts = sel.map(r => [Math.log(r.c0), Math.log(r.rate)]); const f = linearFit(pts);
        return { series: [{ label: `Measured at T = ${p.T} K${p.catalyst ? ', catalyst' : ''}`, points: pts, kind: 'points', color: 'a' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = reaction order n = ${fmt(f.slope, 2)} (nearest integer ${Math.round(f.slope)}).` } : null }; } },
    { id: 'arr', label: 'ln(rate) vs 1/T (Arrhenius, fit → Eₐ)', xLabel: '1 / T (K⁻¹)', yLabel: 'ln (initial rate)',
      build(rows, p) { const sel = rows.filter(r => r.c0 === p.c0 && r.cat === (p.catalyst ? 'yes' : 'no') && r.rate > 0); const pts = sel.map(r => [1 / r.T, Math.log(r.rate)]); const f = linearFit(pts);
        return { series: [{ label: `Measured at [A]₀ = ${fmt(p.c0, 2)} M${p.catalyst ? ', catalyst' : ''}`, points: pts, kind: 'points', color: 'a' }], fit: f ? { ...f, label: 'Arrhenius fit', meaning: `Slope = −Eₐ/R ⇒ Eₐ = ${fmt(-f.slope * RGAS / 1000, 1)} kJ/mol (effective value set: ${p.Ea - (p.catalyst ? p.dEa : 0)} kJ/mol).` } : null }; } },
    { id: 'rc', label: 'Initial rate vs [A]₀', xLabel: '[A]₀ (M)', yLabel: 'Initial rate (M/s)', zeroX: true, zeroY: true,
      build(rows, p) { const sel = rows.filter(r => r.T === p.T && r.cat === (p.catalyst ? 'yes' : 'no')); const th = []; for (let i = 0; i <= 40; i++) { const c = 2 * i / 40; th.push([c, kOf(p) * Math.pow(c, +p.order)]); }
        return { series: [{ label: 'Measured', points: sel.map(r => [r.c0, r.rate]), kind: 'points', color: 'a' }, { label: 'Model k[A]₀ⁿ', points: th, color: 'b', dash: 'dash' }] }; } },
  ],
  tasks: [
    { title: 'Run a reaction', text: 'Press Start with [A]₀ = 1.00 M at 298 K. The probe samples the concentration as the reactant is consumed.', controls: [] },
    { title: 'Measure the initial rate', text: 'Once the run has passed 10 % of its length, take a measurement: the rate comes from a straight-line fit to the first probe readings.', controls: [] },
    { title: 'Vary concentration', text: 'Repeat at 0.25, 0.50 and 2.00 M, then open "ln(rate) vs ln[A]₀" — the slope is the reaction order.', controls: ['c0'] },
    { title: 'Vary temperature', text: 'Back at 1.00 M, run at 280, 320 and 350 K. The Arrhenius graph gives Eₐ from the slope.', controls: ['T'] },
    { title: 'Add a catalyst', text: 'Switch the catalyst on and repeat one run — the rate rises although the temperature did not.', controls: ['catalyst'] },
  ],
  describe(p) { return `A stirred vessel holds reactant A at ${fmt(p.c0, 2)} M and ${p.T} K${p.catalyst ? ' with a solid catalyst that lowers the activation energy' : ''}. A colorimetric probe reads [A] every few seconds. Effective activation energy ${p.Ea - (p.catalyst ? p.dEa : 0)} kJ/mol; rate constant k = ${kOf(p).toPrecision(3)}.`; },
  init(p) { return { t: 0, c: p.c0, trace: [[0, p.c0]], samples: [], tEnd: duration(p), nextSample: 0, tHalf: null }; },
  step(s, p, c, dt) {
    if (s.t >= s.tEnd) return;
    const k = kOf(p), n = +p.order; const f = (t, y) => [-k * Math.pow(Math.max(0, y[0]), n)];
    let rem = Math.min(dt, s.tEnd - s.t); const sub = Math.min(0.05, s.tEnd / 2000);
    while (rem > 1e-9) {
      const hs = Math.min(sub, rem); [s.c] = rk4(f, [s.c], s.t, hs); s.t += hs; rem -= hs;
      if (s.t >= s.nextSample - 1e-9) { s.samples.push([s.t, s.c]); s.nextSample += s.tEnd / 200; }
      if (s.c <= p.c0 / 2 && s.tHalf === null) s.tHalf = s.t;
    }
    if (s.t - s.trace[s.trace.length - 1][0] >= s.tEnd / 200) s.trace.push([s.t, s.c]);
  },
  done(s) { return s.t >= s.tEnd; },
  render(svg, s, p, c, env) {
    clear(svg); const W = 800, H = 450; const frac = Math.max(0, Math.min(1, s.c / p.c0));
    // beaker
    const bx = 260, by = 90, bw = 220, bh = 280;
    svg.appendChild(h('rect', { x: bx, y: by + 40, width: bw, height: bh - 40, fill: `rgba(200,155,255,${0.08 + 0.55 * frac})`, stroke: 'none' }));
    svg.appendChild(h('path', { d: `M${bx} ${by} V${by + bh} H${bx + bw} V${by}`, fill: 'none', stroke: 'var(--text-2)', 'stroke-width': 3 }));
    // particles proportional to concentration
    const N = Math.round(60 * frac); const t = env.rm ? 0 : (env.t || 0);
    for (let i = 0; i < N; i++) { const ang = i * 2.399 + t * (0.3 + 0.002 * (p.T - 250)); const rr = 20 + (i * 37) % 90; const x = bx + bw / 2 + Math.cos(ang) * rr * 0.9, y = by + 60 + bh / 2 - 40 + Math.sin(ang * 1.3) * rr * 0.8; svg.appendChild(h('circle', { cx: x, cy: y, r: 4, fill: 'var(--violet)' })); }
    if (p.catalyst) { svg.appendChild(h('rect', { x: bx + 70, y: by + bh - 30, width: 80, height: 18, fill: 'var(--amber)', opacity: .8 })); svg.appendChild(text(bx + 110, by + bh - 36, 'catalyst', { 'text-anchor': 'middle', fill: 'var(--amber)', 'font-size': 11 })); }
    svg.appendChild(text(bx + bw / 2, by + bh + 30, `[A] = ${fmt(s.c, 3)} M  (${fmt(frac * 100, 0)} % of [A]₀)`, { 'text-anchor': 'middle', fill: 'var(--phos)' }));
    // thermometer
    const tx = 600; svg.appendChild(h('rect', { x: tx - 8, y: 100, width: 16, height: 220, rx: 8, fill: 'var(--bg)', stroke: 'var(--line-2)' }));
    const tf = (p.T - 250) / 150; svg.appendChild(h('rect', { x: tx - 4, y: 310 - 200 * tf, width: 8, height: 200 * tf + 4, fill: 'var(--red)' }));
    svg.appendChild(h('circle', { cx: tx, cy: 325, r: 14, fill: 'var(--red)' })); svg.appendChild(text(tx, 360, `${p.T} K`, { 'text-anchor': 'middle', fill: 'var(--text-2)' }));
    svg.appendChild(text(tx, 378, `${fmt(p.T - 273.15, 1)} °C`, { 'text-anchor': 'middle', fill: 'var(--text-3)', 'font-size': 11 }));
    // probe readout
    svg.appendChild(h('rect', { x: 40, y: 90, width: 170, height: 110, fill: 'var(--panel)', stroke: 'var(--line-2)' }));
    svg.appendChild(text(52, 112, 'PROBE', { fill: 'var(--text-3)', 'font-size': 11 })); svg.appendChild(text(52, 140, `${fmt(probe.read(s.c), 3)} M`, { fill: 'var(--phos)', 'font-size': 18 }));
    svg.appendChild(text(52, 165, `t = ${fmt(s.t, 1)} s`, { fill: 'var(--amber)' })); svg.appendChild(text(52, 185, `samples: ${s.samples.length}`, { fill: 'var(--text-2)', 'font-size': 11 }));
    svg.appendChild(text(20, H - 20, `k = ${kOf(p).toPrecision(3)} ${+p.order === 1 ? 's⁻¹' : 'M⁻¹s⁻¹'} · run length ${fmt(s.tEnd, 0)} s (time-compressed)`, { fill: 'var(--text-3)', 'font-size': 11 }));
  },
  readouts(s, p) {
    return [
      { label: 'Reaction time', value: fmt(s.t, 1), unit: 's' },
      { label: 'Probe [A]', value: fmt(probe.read(s.c), 3), unit: 'M' },
      { label: 'Rate constant k', value: kOf(p).toPrecision(3), unit: +p.order === 1 ? 's⁻¹' : 'M⁻¹s⁻¹', kind: 'theory', note: 'A·e^(−Eₐ/RT)' },
      { label: 'Initial rate (theory)', value: rate0(p).toPrecision(3), unit: 'M/s', kind: 'theory' },
      { label: 'Half-life (theory)', value: fmt(tHalf(p), 1), unit: 's', kind: 'theory' },
      { label: 'Half-life (sim)', value: s.tHalf !== null ? fmt(s.tHalf, 1) : '—', unit: 's', note: s.tHalf === null ? 'not reached yet' : '' },
      { label: 'Fraction remaining', value: fmt(s.c / p.c0 * 100, 1), unit: '%' },
      { label: 'Eₐ (effective)', value: String(p.Ea - (p.catalyst ? p.dEa : 0)), unit: 'kJ/mol', kind: 'theory' },
    ];
  },
  warnings(s, p) { return duration(p) >= 3600 ? [{ level: 'warn', text: 'The reaction is very slow at these settings (run capped at 1 hour of simulated time). Raise the temperature or lower Eₐ.' }] : []; },
  measure(s, p, c, rng) {
    if (s.t < 0.1 * s.tEnd) return { error: `Let the run reach at least 10 % of its length (${fmt(0.1 * s.tEnd, 1)} s) so the probe has enough early readings for an initial-rate fit.` };
    const early = s.samples.filter(q => q[0] <= 0.1 * s.tEnd + 1e-9).map(q => [q[0], probe.read(q[1], rng)]);
    if (early.length < 5) return { error: 'Not enough probe samples yet — keep the run going.' };
    const f = quadFit(early); const rate = -f.b; const th = rate0(p);
    return { c0: p.c0, T: p.T, cat: p.catalyst ? 'yes' : 'no', Ea: p.Ea - (p.catalyst ? p.dEa : 0), rate, rateth: th, err: pctError(rate, th), k: kOf(p), thalf: s.tHalf !== null ? s.tHalf : NaN, order: +p.order, nfit: early.length };
  },
  analyse(rows, p) {
    const grp = latestGroup(rows, ['c0', 'T', 'Ea']); const u = uncStatement(grp, 'rate', { uncertainty: v => Math.abs(v) * 0.03 + 1e-6 }, 'M/s', 5);
    const e = meanErr(rows, 'err'); const k = kOf(p); const EaEff = p.Ea - (p.catalyst ? p.dEa : 0);
    const oSel = rows.filter(r => r.T === p.T && r.cat === (p.catalyst ? 'yes' : 'no') && r.rate > 0); const fo = new Set(oSel.map(r => r.c0)).size >= 2 ? linearFit(oSel.map(r => [Math.log(r.c0), Math.log(r.rate)])) : null;
    const aSel = rows.filter(r => r.c0 === p.c0 && r.cat === (p.catalyst ? 'yes' : 'no') && r.rate > 0); const fa = new Set(aSel.map(r => r.T)).size >= 2 ? linearFit(aSel.map(r => [1 / r.T, Math.log(r.rate)])) : null;
    const catRows = rows.filter(r => r.cat === 'yes'), noCat = rows.filter(r => r.cat === 'no');
    const calcs = [
      calc('Arrhenius rate constant', 'k = A · exp(−Eₐ / (R T))', `k = ${p.A.toExponential(1)} × exp(−${EaEff * 1000} / (8.314 × ${p.T}))`, `${k.toPrecision(4)} ${+p.order === 1 ? 's⁻¹' : 'M⁻¹s⁻¹'}`),
      calc('Initial rate', 'rate₀ = k [A]₀ⁿ', `= ${k.toPrecision(4)} × ${fmt(p.c0, 2)}^${p.order}`, `${rate0(p).toPrecision(4)} M/s`),
      calc('Half-life', +p.order === 1 ? 't½ = ln 2 / k' : 't½ = 1 / (k [A]₀)', +p.order === 1 ? `= 0.6931 / ${k.toPrecision(4)}` : `= 1 / (${k.toPrecision(4)} × ${fmt(p.c0, 2)})`, `${fmt(tHalf(p), 2)} s`),
    ];
    if (fo) calcs.push(calc('Reaction order from data', 'ln(rate) = n ln[A]₀ + ln k  ⇒  n = slope', `slope of ${oSel.length} points`, `n = ${fmt(fo.slope, 2)} (R² = ${fmt(fo.r2, 3)})`));
    if (fa) calcs.push(calc('Activation energy from data', 'ln(rate) = −(Eₐ/R)(1/T) + const  ⇒  Eₐ = −slope × R', `= −(${fmt(fa.slope, 1)}) × 8.314`, `${fmt(-fa.slope * RGAS / 1000, 1)} kJ/mol (set ${EaEff})`));
    const parts = [];
    if (!rows.length) parts.push('No measurements recorded.');
    else {
      parts.push(`The initial rates measured by fitting the early probe readings agree with k[A]₀ⁿ within a mean ${fmt(e, 2)} % over ${rows.length} run${rows.length > 1 ? 's' : ''}.`);
      if (fo) parts.push(`The log–log plot of rate against concentration has slope ${fmt(fo.slope, 2)}, identifying the reaction as ${Math.round(fo.slope) === 1 ? 'first' : Math.round(fo.slope) === 2 ? 'second' : `order ${Math.round(fo.slope)}`} order${Math.round(fo.slope) === +p.order ? ', which matches the model' : ' — inconsistent with the model order; check that all runs used the same temperature and catalyst setting'}.`);
      else parts.push('Vary [A]₀ over at least two values at fixed temperature to determine the order.');
      if (fa) parts.push(`The Arrhenius plot yields Eₐ = ${fmt(-fa.slope * RGAS / 1000, 1)} kJ/mol against ${EaEff} kJ/mol set (${fmt(pctError(-fa.slope * RGAS / 1000, EaEff), 1)} %).`);
      if (catRows.length && noCat.length) parts.push('Runs with the catalyst were faster at the same temperature, consistent with a lower activation energy and an unchanged pre-exponential factor.');
      parts.push('The residual scatter comes mainly from probe noise amplified by differentiating the concentration–time data to obtain a rate.');
    }
    return {
      objective: 'Measure the initial rate of A → products, determine the rate law (order) from concentration dependence, and the activation energy from temperature dependence.',
      setup: [['[A]₀', `${fmt(p.c0, 2)} M`], ['Temperature', `${p.T} K`], ['Catalyst', p.catalyst ? `yes (Eₐ lowered by ${p.dEa} kJ/mol)` : 'no'], ['Eₐ (effective)', `${EaEff} kJ/mol`], ['A', `${p.A.toExponential(1)}`], ['Model order', p.order], ['Probe', probe.describe()], ['Integration', 'RK4 on d[A]/dt = −k[A]ⁿ; initial rate = −(linear coefficient) of a least-squares quadratic through the probe samples in the first 10 % of the run']],
      calculations: calcs, results: [`Mean initial-rate error: ${fmt(e, 2)} %`, fo ? `Order from fit: ${fmt(fo.slope, 2)}` : 'Order: not yet determined', fa ? `Eₐ from fit: ${fmt(-fa.slope * RGAS / 1000, 1)} kJ/mol` : 'Eₐ: not yet determined'], errorPct: e, uncertainty: u.text,
      sources: ['Probe resolution 0.001 M and 0.4 % noise on each sample', 'Initial-rate estimate from a quadratic fit to a curved early segment (small systematic bias, larger for second-order runs)', 'Isothermal, well-stirred assumption; no reverse reaction', 'Time is compressed so a run takes ~12 s of real time'], conclusion: parts.join(' '),
    };
  },
};

/** Least-squares quadratic c = a + b t + q t² (normal equations); returns {a, b, q}. */
function quadFit(pts) {
  let n = 0, st = 0, st2 = 0, st3 = 0, st4 = 0, sy = 0, sty = 0, st2y = 0;
  for (const [t, y] of pts) { n++; st += t; st2 += t * t; st3 += t ** 3; st4 += t ** 4; sy += y; sty += t * y; st2y += t * t * y; }
  const M = [[n, st, st2], [st, st2, st3], [st2, st3, st4]], v = [sy, sty, st2y];
  // Gaussian elimination
  for (let i = 0; i < 3; i++) { let piv = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r; [M[i], M[piv]] = [M[piv], M[i]]; [v[i], v[piv]] = [v[piv], v[i]];
    for (let r = i + 1; r < 3; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c < 3; c++) M[r][c] -= f * M[i][c]; v[r] -= f * v[i]; } }
  const x = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let acc = v[i]; for (let c = i + 1; c < 3; c++) acc -= M[i][c] * x[c]; x[i] = acc / M[i][i]; }
  return { a: x[0], b: x[1], q: x[2] };
}
