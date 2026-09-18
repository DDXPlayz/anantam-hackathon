import { h, clear, text, rk4, fmt, calc, latestGroup, meanErr, uncStatement, pctError, rad, deg } from './common.js';
import { instrument, mean } from '../noise.js';
import { linearFit } from '../plot.js';

const stopwatch = instrument({ id: 'stopwatch', label: 'Photogate stopwatch (period)', unit: 's', resolution: 0.01, relNoise: 0.001, absNoise: 0.012 });

const T0 = p => 2 * Math.PI * Math.sqrt(p.L / p.g);
// Large-amplitude series correction for the exact period
function Tlarge(p) { const a = rad(p.theta0); const a2 = a * a; return T0(p) * (1 + a2 / 16 + 11 * a2 * a2 / 3072 + 173 * a2 * a2 * a2 / 737280); }

export default {
  id: 'pendulum', title: 'Simple Pendulum', subject: 'physics', timed: true,
  speed(p) { return T0(p) > 4 ? T0(p) / 4 : 1; },
  params: [
    { id: 'L', label: 'String length', unit: 'm', min: 0.1, max: 3, step: 0.01, value: 1, digits: 2 },
    { id: 'theta0', label: 'Release amplitude', unit: '°', min: 1, max: 90, step: 1, value: 10, digits: 0 },
    { id: 'm', label: 'Bob mass', unit: 'kg', min: 0.05, max: 2, step: 0.05, value: 0.5, digits: 2 },
    { id: 'g', label: 'Gravitational acceleration', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81, digits: 2, advanced: true },
    { id: 'b', label: 'Damping coefficient', unit: 'kg/s', min: 0, max: 0.5, step: 0.005, value: 0, digits: 3, advanced: true },
  ],
  components: null,
  instruments: [stopwatch],
  columns: [
    { id: 'L', label: 'L', unit: 'm', digits: 2, kind: 'param' }, { id: 'theta0', label: 'θ₀', unit: '°', digits: 0, kind: 'param' }, { id: 'g', label: 'g', unit: 'm/s²', digits: 2, kind: 'param' },
    { id: 'n', label: 'Periods timed', unit: '', digits: 0, kind: 'param' },
    { id: 'T', label: 'Period', unit: 's', digits: 3, kind: 'meas' }, { id: 'T0', label: '2π√(L/g)', unit: 's', digits: 3, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' },
    { id: 'Tl', label: 'Large-angle T', unit: 's', digits: 3, kind: 'theory' }, { id: 'errL', label: 'Error vs large-angle', unit: '%', digits: 2, kind: 'err' },
  ],
  graphs: [
    { id: 'live', label: 'Live: angle vs time', live: true, xLabel: 'Time (s)', yLabel: 'Angle (°)', zeroY: true,
      build(rows, p, c, state) {
        const sa = []; if (state) { const w = 2 * Math.PI / T0(p); for (let i = 0; i <= 200; i++) { const t = (state.tEnd || 10) * i / 200; sa.push([t, p.theta0 * Math.cos(w * t)]); } }
        return { series: [{ label: 'Nonlinear simulation', points: state ? state.trace : [], color: 'a' }, { label: 'Small-angle solution', points: sa, color: 'b', dash: 'dash' }] };
      } },
    { id: 'TL', label: 'Period vs length', xLabel: 'Length (m)', yLabel: 'Period (s)', zeroX: true, zeroY: true,
      build(rows, p) { const th = []; for (let i = 1; i <= 30; i++) { const L = 3 * i / 30; th.push([L, 2 * Math.PI * Math.sqrt(L / p.g)]); }
        return { series: [{ label: 'Measured period', points: rows.map(r => [r.L, r.T]), kind: 'points', color: 'a' }, { label: `2π√(L/g), g = ${fmt(p.g, 2)}`, points: th, color: 'b', dash: 'dash' }] }; } },
    { id: 'T2L', label: 'T² vs length (fit → g)', xLabel: 'Length (m)', yLabel: 'T² (s²)', zeroX: true, zeroY: true,
      build(rows) { const pts = rows.map(r => [r.L, r.T * r.T]); const f = linearFit(pts);
        return { series: [{ label: 'T² measured', points: pts, kind: 'points', color: 'a' }], fit: f ? { ...f, label: 'Linear fit', meaning: `Slope = 4π²/g, so g = ${fmt(4 * Math.PI * Math.PI / f.slope, 3)} m/s² from the fit.` } : null }; } },
    { id: 'TA', label: 'Period vs amplitude', xLabel: 'Amplitude (°)', yLabel: 'Period (s)', zeroX: true,
      build(rows, p) { const th = []; for (let a = 0; a <= 90; a += 3) th.push([a, Tlarge({ ...p, theta0: a })]);
        return { series: [{ label: 'Measured period', points: rows.map(r => [r.theta0, r.T]), kind: 'points', color: 'a' }, { label: 'Exact (series) at current L', points: th, color: 'b', dash: 'dash' }, { label: 'Small-angle 2π√(L/g)', points: [[0, T0(p)], [90, T0(p)]], color: 'c', dash: 'dot' }] }; } },
  ],
  tasks: [
    { title: 'Choose a length', text: 'Set the string length. Start with 1.00 m and a small amplitude (10°).', controls: ['L', 'theta0'] },
    { title: 'Run and time', text: 'Press Start. The photogate counts complete swings; the run stops after ten periods.', controls: [] },
    { title: 'Record the period', text: 'Press "Take measurement". The measured period is compared with 2π√(L/g).', controls: [] },
    { title: 'Vary the length', text: 'Repeat at 0.5 m, 1.5 m and 2.0 m, then open the "T² vs length" graph — the slope gives g.', controls: ['L'] },
    { title: 'Try a large amplitude', text: 'Set 60° and measure again. The period grows beyond the small-angle prediction.', controls: ['theta0'] },
  ],
  describe(p) {
    return `A bob of ${fmt(p.m, 2)} kg hangs on a ${fmt(p.L, 2)} m string from a fixed pivot and is released from rest at ${p.theta0}° from vertical, with g = ${fmt(p.g, 2)} m/s²${p.b ? ` and damping b = ${fmt(p.b, 3)} kg/s` : ' and no damping'}. A photogate at the bottom of the swing times each period.`;
  },
  init(p) { return { t: 0, th: rad(p.theta0), w: 0, trace: [[0, p.theta0]], crossings: [], lastTh: rad(p.theta0), tEnd: Math.min(30, 10.5 * Tlarge(p)), nPeriods: 0 }; },
  step(s, p, c, dt) {
    if (s.t >= s.tEnd) return;
    const f = (t, y) => [y[1], -(p.g / p.L) * Math.sin(y[0]) - (p.b / p.m) * y[1]];
    let rem = dt; const sub = 0.001;
    while (rem > 1e-9 && s.t < s.tEnd) {
      const hs = Math.min(sub, rem);
      const prev = s.th, prevW = s.w;
      [s.th, s.w] = rk4(f, [s.th, s.w], s.t, hs);
      s.t += hs; rem -= hs;
      // positive-going zero crossing → one period boundary (after the first half swing)
      if (prev < 0 && s.th >= 0 && s.w > 0) { const frac = -prev / (s.th - prev); s.crossings.push(s.t - hs + hs * frac); }
    }
    s.nPeriods = Math.max(0, s.crossings.length - 1);
    if (s.nPeriods >= 10) s.tEnd = s.t;
    const last = s.trace[s.trace.length - 1];
    if (s.t - last[0] > 0.02) s.trace.push([s.t, deg(s.th)]);
  },
  done(s) { return s.t >= s.tEnd; },
  render(svg, s, p) {
    clear(svg);
    const W = 800, H = 450, px = W / 2, py = 40;
    const len = Math.min(360, 60 + p.L / 3 * 300);
    const bx = px + len * Math.sin(s.th), by = py + len * Math.cos(s.th);
    svg.appendChild(h('rect', { x: px - 60, y: py - 14, width: 120, height: 14, fill: 'var(--bezel)', stroke: 'var(--line-2)' }));
    svg.appendChild(h('line', { x1: px, y1: py, x2: px, y2: py + len + 20, stroke: 'var(--line-2)', 'stroke-dasharray': '3 5' }));
    // amplitude arc
    const a0 = rad(p.theta0); const ax = px + len * Math.sin(a0), ay = py + len * Math.cos(a0);
    svg.appendChild(h('path', { d: `M${px - len * Math.sin(a0)} ${ay} A${len} ${len} 0 0 0 ${ax} ${ay}`, fill: 'none', stroke: 'var(--cyan)', 'stroke-dasharray': '4 4', opacity: .6 }));
    svg.appendChild(h('line', { x1: px, y1: py, x2: bx, y2: by, stroke: 'var(--text-2)', 'stroke-width': 1.5 }));
    const r = 10 + p.m * 8;
    svg.appendChild(h('circle', { cx: bx, cy: by, r, fill: 'var(--phos)', stroke: '#000' }));
    // photogate
    svg.appendChild(h('rect', { x: px - 4, y: py + len - 2, width: 8, height: 2 * r + 12, fill: 'none', stroke: 'var(--amber)' }));
    svg.appendChild(text(px + 14, py + len + 2 * r + 10, 'photogate', { fill: 'var(--amber)', 'font-size': 11 }));
    svg.appendChild(text(20, 30, `θ = ${fmt(deg(s.th), 1)}°`, { fill: 'var(--phos)' }));
    svg.appendChild(text(20, 50, `ω = ${fmt(s.w, 2)} rad/s`, { fill: 'var(--text-2)' }));
    svg.appendChild(text(W - 20, 30, `t = ${fmt(s.t, 2)} s`, { 'text-anchor': 'end', fill: 'var(--amber)' }));
    svg.appendChild(text(W - 20, 50, `periods counted: ${s.nPeriods}`, { 'text-anchor': 'end', fill: 'var(--text-2)' }));
  },
  readouts(s, p) {
    const per = periodFrom(s);
    return [
      { label: 'Time', value: fmt(s.t, 2), unit: 's' },
      { label: 'Angle', value: fmt(deg(s.th), 1), unit: '°' },
      { label: 'Periods counted', value: String(s.nPeriods), unit: '' },
      { label: 'Period (sim mean)', value: isFinite(per) ? fmt(per, 3) : '—', unit: 's', note: s.nPeriods ? `from ${s.nPeriods} period${s.nPeriods > 1 ? 's' : ''}` : 'needs one full swing' },
      { label: 'Small-angle T', value: fmt(T0(p), 3), unit: 's', kind: 'theory', note: '2π√(L/g)' },
      { label: 'Large-angle T', value: fmt(Tlarge(p), 3), unit: 's', kind: 'theory', note: 'series to θ⁶' },
      { label: 'Energy', value: fmt(0.5 * p.m * (p.L * s.w) ** 2 + p.m * p.g * p.L * (1 - Math.cos(s.th)), 4), unit: 'J' },
    ];
  },
  warnings(s, p) { return p.theta0 > 20 ? [{ level: 'warn', text: `Amplitude ${p.theta0}° exceeds the small-angle regime (≲ 15°): expect the period to be longer than 2π√(L/g).` }] : []; },
  measure(s, p, c, rng) {
    if (s.nPeriods < 1) return { error: 'Let the pendulum complete at least one full swing through the photogate before measuring.' };
    const intervals = []; for (let i = 1; i < s.crossings.length; i++) intervals.push(s.crossings[i] - s.crossings[i - 1]);
    // stopwatch measures the total time for n periods, then divides
    const total = stopwatch.read(s.crossings[s.crossings.length - 1] - s.crossings[0], rng);
    const T = total / intervals.length;
    return { L: p.L, theta0: p.theta0, g: p.g, n: intervals.length, T, T0: T0(p), err: pctError(T, T0(p)), Tl: Tlarge(p), errL: pctError(T, Tlarge(p)) };
  },
  analyse(rows, p) {
    const grp = latestGroup(rows, ['L', 'theta0', 'g']);
    const u = uncStatement(grp, 'T', stopwatch, 's', 3);
    const e0 = meanErr(rows, 'err'), eL = meanErr(rows, 'errL');
    const big = rows.filter(r => r.theta0 > 20), small = rows.filter(r => r.theta0 <= 20);
    const fitPts = rows.map(r => [r.L, r.T * r.T]); const f = linearFit(fitPts);
    const gFit = f ? 4 * Math.PI * Math.PI / f.slope : NaN;
    const calcs = [
      calc('Small-angle period', 'T₀ = 2π √(L / g)', `T₀ = 2π √(${fmt(p.L, 2)} / ${fmt(p.g, 2)})`, `${fmt(T0(p), 4)} s`),
      calc('Large-angle correction', 'T = T₀ (1 + θ₀²/16 + 11θ₀⁴/3072 + 173θ₀⁶/737280), θ₀ in radians', `T = ${fmt(T0(p), 4)} × (1 + ${fmt(rad(p.theta0) ** 2 / 16, 5)} + …)`, `${fmt(Tlarge(p), 4)} s`),
    ];
    if (rows.length) { const l = rows[rows.length - 1]; calcs.push(calc('Percentage error (latest row)', '|T_meas − T₀| / T₀ × 100', `|${fmt(l.T, 3)} − ${fmt(l.T0, 3)}| / ${fmt(l.T0, 3)} × 100`, `${fmt(l.err, 2)} %`)); }
    if (f && f.n >= 2 && new Set(rows.map(r => r.L)).size >= 2) calcs.push(calc('g from T² vs L fit', 'slope = 4π²/g  ⇒  g = 4π² / slope', `g = 4π² / ${fmt(f.slope, 4)}`, `${fmt(gFit, 3)} m/s² (R² = ${fmt(f.r2, 4)})`));
    let conclusion;
    if (!rows.length) conclusion = 'No measurements recorded.';
    else {
      const parts = [`The measured period agrees with 2π√(L/g) within a mean ${fmt(e0, 2)} % over ${rows.length} measurement${rows.length > 1 ? 's' : ''}.`];
      if (big.length && small.length) parts.push(`At amplitudes above 20° the deviation grows to ${fmt(meanErr(big, 'err'), 2) } % (versus ${fmt(meanErr(small, 'err'), 2)} % at small amplitudes) and the period is consistently longer, which is exactly the failure of the small-angle approximation sin θ ≈ θ; against the large-angle series the agreement is ${fmt(eL, 2)} %.`);
      else if (big.length) parts.push(`All runs used amplitudes above 20°, where the period exceeds the small-angle value; compared with the exact large-angle series the agreement is ${fmt(eL, 2)} %.`);
      if (isFinite(gFit) && new Set(rows.map(r => r.L)).size >= 2) parts.push(`The T² vs L fit gives g = ${fmt(gFit, 2)} m/s², ${fmt(pctError(gFit, p.g), 2)} % from the set value.`);
      if (p.b > 0) parts.push('Damping reduces the amplitude over the run but, for the light damping used, has a negligible effect on the period.');
      conclusion = parts.join(' ');
    }
    return {
      objective: 'Measure the period of a pendulum, test T = 2π√(L/g), and examine how the period depends on length and amplitude.',
      setup: [['Length', `${fmt(p.L, 2)} m`], ['Amplitude', `${p.theta0}°`], ['Mass', `${fmt(p.m, 2)} kg`], ['g', `${fmt(p.g, 2)} m/s²`], ['Damping', `${fmt(p.b, 3)} kg/s`], ['Integration', 'RK4 on θ″ = −(g/L) sin θ − (b/m) θ′, Δt = 1 ms; period from positive-going zero crossings']],
      calculations: calcs,
      results: [`Mean error vs small-angle formula: ${fmt(e0, 2)} %`, `Mean error vs large-angle series: ${fmt(eL, 2)} %`, isFinite(gFit) ? `g from fit: ${fmt(gFit, 3)} m/s²` : 'Vary L over at least two values to extract g from a fit'],
      errorPct: e0, uncertainty: u.text,
      sources: ['Stopwatch resolution (0.01 s) and photogate trigger noise (σ ≈ 12 ms), divided by the number of periods timed', 'Small-angle approximation (systematic, grows with θ₀²)', 'Numerical integration error (negligible at Δt = 1 ms)', 'Damping (if enabled) slightly changes the effective amplitude during the run'],
      conclusion,
    };
  },
};
function periodFrom(s) { if (s.crossings.length < 2) return NaN; return (s.crossings[s.crossings.length - 1] - s.crossings[0]) / (s.crossings.length - 1); }
