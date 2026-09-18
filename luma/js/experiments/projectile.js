import { h, clear, text, rk4, fmt, calc, latestGroup, meanErr, uncStatement, pctError, rad } from './common.js';
import { instrument } from '../noise.js';
import { linearFit } from '../plot.js';

const tape = instrument({ id: 'tape', label: 'Measuring tape (range)', unit: 'm', resolution: 0.01, relNoise: 0.002, absNoise: 0.005 });
const height = instrument({ id: 'height', label: 'Height gauge (max height)', unit: 'm', resolution: 0.01, relNoise: 0.003, absNoise: 0.005 });
const timer = instrument({ id: 'timer', label: 'Photogate timer (time of flight)', unit: 's', resolution: 0.01, relNoise: 0.001, absNoise: 0.008 });

function analytic(p) {
  const th = rad(p.angle), vy = p.v0 * Math.sin(th), vx = p.v0 * Math.cos(th);
  const T = (vy + Math.sqrt(vy * vy + 2 * p.g * p.h0)) / p.g;
  return { T, R: vx * T, H: p.h0 + vy * vy / (2 * p.g), vx, vy };
}
const dragK = comps => (comps && comps.length ? comps[0].k : 0);

export default {
  id: 'projectile', title: 'Projectile Motion', subject: 'physics', timed: true,
  speed(p) { const T = analytic(p).T; return T > 6 ? T / 6 : 1; },
  params: [
    { id: 'v0', label: 'Launch speed', unit: 'm/s', min: 1, max: 80, step: 0.5, value: 20, digits: 1 },
    { id: 'angle', label: 'Launch angle', unit: '°', min: 0, max: 90, step: 1, value: 45, digits: 0 },
    { id: 'h0', label: 'Launch height', unit: 'm', min: 0, max: 30, step: 0.5, value: 0, digits: 1 },
    { id: 'g', label: 'Gravitational acceleration', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81, digits: 2, advanced: true },
  ],
  components: { label: 'Air drag', singular: 'Drag element', min: 0, max: 1, initial: 0, addLabel: 'Add air drag', removeLabel: 'Remove air drag',
    template: [{ id: 'k', label: 'Drag coefficient k (quadratic, per unit mass)', unit: 'm⁻¹', min: 0.001, max: 0.2, step: 0.001, digits: 3 }],
    defaults: [{ k: 0.02 }] },
  instruments: [tape, height, timer],
  columns: [
    { id: 'v0', label: 'v₀', unit: 'm/s', digits: 1, kind: 'param' }, { id: 'angle', label: 'θ', unit: '°', digits: 0, kind: 'param' }, { id: 'h0', label: 'h₀', unit: 'm', digits: 1, kind: 'param' }, { id: 'k', label: 'k', unit: 'm⁻¹', digits: 3, kind: 'param' },
    { id: 'R', label: 'Range', unit: 'm', digits: 2, kind: 'meas' }, { id: 'Rth', label: 'Range (theory)', unit: 'm', digits: 2, kind: 'theory' }, { id: 'errR', label: 'Error', unit: '%', digits: 2, kind: 'err' },
    { id: 'H', label: 'Max height', unit: 'm', digits: 2, kind: 'meas' }, { id: 'Hth', label: 'H (theory)', unit: 'm', digits: 2, kind: 'theory' },
    { id: 'T', label: 'Flight time', unit: 's', digits: 2, kind: 'meas' }, { id: 'Tth', label: 'T (theory)', unit: 's', digits: 2, kind: 'theory' },
  ],
  graphs: [
    { id: 'traj', label: 'Live: trajectory y vs x', live: true, xLabel: 'x (m)', yLabel: 'y (m)', zeroX: true, zeroY: true,
      build(rows, p, comps, state) {
        const a = analytic(p); const th = [];
        for (let i = 0; i <= 60; i++) { const t = a.T * i / 60; th.push([a.vx * t, p.h0 + a.vy * t - 0.5 * p.g * t * t]); }
        return { series: [ { label: 'Simulated path', points: state ? state.trace : [], color: 'a', dash: 'solid' }, { label: 'Analytic (no drag)', points: th, color: 'b', dash: 'dash' } ] };
      } },
    { id: 'RvsA', label: 'Range vs launch angle', xLabel: 'Launch angle (°)', yLabel: 'Range (m)', zeroY: true,
      build(rows, p) {
        const th = [];
        for (let a = 0; a <= 90; a += 3) th.push([a, analytic({ ...p, angle: a }).R]);
        return { series: [ { label: 'Measured range', points: rows.map(r => [r.angle, r.R]), kind: 'points', color: 'a' }, { label: `Theory at v₀=${fmt(p.v0, 1)} m/s, h₀=${fmt(p.h0, 1)} m`, points: th, color: 'b', dash: 'dash' } ] };
      } },
    { id: 'TvsA', label: 'Time of flight vs angle', xLabel: 'Launch angle (°)', yLabel: 'Time of flight (s)', zeroY: true,
      build(rows, p) {
        const th = []; for (let a = 0; a <= 90; a += 3) th.push([a, analytic({ ...p, angle: a }).T]);
        return { series: [ { label: 'Measured T', points: rows.map(r => [r.angle, r.T]), kind: 'points', color: 'a' }, { label: 'Theory (current v₀, h₀)', points: th, color: 'b', dash: 'dash' } ] };
      } },
    { id: 'RR', label: 'Measured range vs theoretical range', xLabel: 'Theoretical range (m)', yLabel: 'Measured range (m)', zeroX: true, zeroY: true,
      build(rows) {
        const pts = rows.map(r => [r.Rth, r.R]);
        const f = linearFit(pts);
        return { series: [{ label: 'Measured vs theory', points: pts, kind: 'points', color: 'a' }], fit: f ? { ...f, label: 'Linear fit', meaning: `A slope of 1 means perfect agreement; the fitted slope is ${fmt(f.slope, 3)}${f.slope < 0.97 ? ', so measured ranges fall short of the analytic prediction (expected when drag is present)' : ''}.` } : null };
      } },
  ],
  tasks: [
    { title: 'Set the launch', text: 'Choose a launch speed and angle. Try 20 m/s at 45°.', controls: ['v0', 'angle'] },
    { title: 'Run the launch', text: 'Press Start and watch the projectile until it lands. The readouts show live position and the landing results.', controls: [] },
    { title: 'Record the result', text: 'Press "Take measurement" to add a row to the data table with measured range, height and flight time next to the theoretical values.', controls: [] },
    { title: 'Change the angle and repeat', text: 'Try 30°, 45° and 60°. Then look at the "Range vs launch angle" graph.', controls: ['angle'] },
    { title: 'Write it up', text: 'Press "Generate report" to get calculations, error analysis and a conclusion.', controls: [] },
  ],
  describe(p, comps) {
    const k = dragK(comps);
    return `A launcher at height ${fmt(p.h0, 1)} m fires a projectile at ${fmt(p.v0, 1)} m/s, ${fmt(p.angle, 0)}° above horizontal, with g = ${fmt(p.g, 2)} m/s²${k ? ` and quadratic air drag k = ${fmt(k, 3)} m⁻¹` : ' and no air resistance'}. The flat ground is at y = 0.`;
  },
  init(p, comps) {
    const th = rad(p.angle);
    return { t: 0, x: 0, y: p.h0, vx: p.v0 * Math.cos(th), vy: p.v0 * Math.sin(th), trace: [[0, p.h0]], maxH: p.h0, landed: false, R: null, T: null, k: dragK(comps) };
  },
  step(s, p, comps, dt) {
    if (s.landed) return;
    const k = s.k;
    const f = (t, y) => { const sp = Math.hypot(y[2], y[3]); return [y[2], y[3], -k * sp * y[2], -p.g - k * sp * y[3]]; };
    let remaining = dt; const sub = 0.002;
    while (remaining > 1e-9 && !s.landed) {
      const hstep = Math.min(sub, remaining);
      const y0 = [s.x, s.y, s.vx, s.vy];
      const y1 = rk4(f, y0, s.t, hstep);
      if (y1[1] < 0 && s.t > 0) {
        const frac = y0[1] / (y0[1] - y1[1]);
        s.x = y0[0] + (y1[0] - y0[0]) * frac; s.y = 0; s.t += hstep * frac; s.landed = true; s.R = s.x; s.T = s.t;
        s.trace.push([s.x, 0]);
        break;
      }
      [s.x, s.y, s.vx, s.vy] = y1; s.t += hstep; remaining -= hstep;
      if (s.y > s.maxH) s.maxH = s.y;
    }
    if (!s.landed) { const last = s.trace[s.trace.length - 1]; if (Math.hypot(s.x - last[0], s.y - last[1]) > 0.02 * Math.max(1, analytic(p).R / 40)) s.trace.push([s.x, s.y]); }
  },
  done(s) { return s.landed; },
  render(svg, s, p, comps, env) {
    clear(svg);
    const W = 800, H = 450; const a = analytic(p);
    const xmax = Math.max(a.R, 5) * 1.08, ymax = Math.max(a.H, 2) * 1.25;
    const scale = Math.min((W - 90) / xmax, (H - 80) / ymax);
    const ox = 60, oy = H - 40;
    const X = x => ox + x * scale, Y = y => oy - y * scale;
    svg.appendChild(h('line', { x1: 20, y1: oy, x2: W - 10, y2: oy, stroke: 'var(--line-2)', 'stroke-width': 2 }));
    // scale bar
    const bar = niceBar(xmax / 4);
    svg.appendChild(h('line', { x1: X(0), y1: oy + 18, x2: X(bar), y2: oy + 18, stroke: 'var(--text-3)' }));
    svg.appendChild(text(X(bar / 2), oy + 32, `${bar} m`, { 'text-anchor': 'middle', fill: 'var(--text-3)' }));
    // launcher
    const th = rad(p.angle);
    svg.appendChild(h('rect', { x: X(0) - 8, y: Y(p.h0), width: 16, height: Y(0) - Y(p.h0), fill: 'var(--bezel)', stroke: 'var(--line-2)' }));
    svg.appendChild(h('line', { x1: X(0), y1: Y(p.h0), x2: X(0) + 36 * Math.cos(th), y2: Y(p.h0) - 36 * Math.sin(th), stroke: 'var(--amber)', 'stroke-width': 6, 'stroke-linecap': 'round' }));
    // analytic path
    const d = []; for (let i = 0; i <= 60; i++) { const t = a.T * i / 60; d.push(`${i ? 'L' : 'M'}${X(a.vx * t).toFixed(1)} ${Y(p.h0 + a.vy * t - 0.5 * p.g * t * t).toFixed(1)}`); }
    svg.appendChild(h('path', { d: d.join(''), fill: 'none', stroke: 'var(--cyan)', 'stroke-dasharray': '6 5', 'stroke-width': 1.5, opacity: .8 }));
    svg.appendChild(text(X(a.R), Y(0) - 8, 'analytic', { 'text-anchor': 'middle', fill: 'var(--cyan)', 'font-size': 11 }));
    // trace
    if (s.trace.length > 1) svg.appendChild(h('path', { d: s.trace.map((pt, i) => `${i ? 'L' : 'M'}${X(pt[0]).toFixed(1)} ${Y(pt[1]).toFixed(1)}`).join(''), fill: 'none', stroke: 'var(--phos)', 'stroke-width': 2 }));
    // max height marker
    if (s.maxH > p.h0 + 0.01) { svg.appendChild(h('line', { x1: X(0), y1: Y(s.maxH), x2: X(xmax), y2: Y(s.maxH), stroke: 'var(--line-2)', 'stroke-dasharray': '2 4' })); svg.appendChild(text(X(0) + 4, Y(s.maxH) - 4, `H = ${fmt(s.maxH, 2)} m`, { fill: 'var(--text-3)', 'font-size': 11 })); }
    // ball
    svg.appendChild(h('circle', { cx: X(s.x), cy: Y(s.y), r: 7, fill: 'var(--phos)', stroke: '#000' }));
    if (s.landed) { svg.appendChild(h('line', { x1: X(s.R), y1: oy - 12, x2: X(s.R), y2: oy + 4, stroke: 'var(--amber)', 'stroke-width': 2 })); svg.appendChild(text(X(s.R), oy - 16, `R = ${fmt(s.R, 2)} m`, { 'text-anchor': 'middle', fill: 'var(--amber)' })); }
    svg.appendChild(text(W - 12, 22, `t = ${fmt(s.t, 2)} s`, { 'text-anchor': 'end', fill: 'var(--amber)' }));
    if (s.k) svg.appendChild(text(W - 12, 40, `drag k = ${fmt(s.k, 3)} m⁻¹`, { 'text-anchor': 'end', fill: 'var(--text-3)', 'font-size': 11 }));
  },
  readouts(s, p) {
    const a = analytic(p);
    return [
      { label: 'Time', value: fmt(s.t, 2), unit: 's' },
      { label: 'Position x', value: fmt(s.x, 2), unit: 'm' },
      { label: 'Position y', value: fmt(s.y, 2), unit: 'm' },
      { label: 'Speed', value: fmt(Math.hypot(s.vx, s.vy), 2), unit: 'm/s' },
      { label: 'Range (sim)', value: s.landed ? fmt(s.R, 2) : '—', unit: 'm', note: s.landed ? 'landed' : 'in flight' },
      { label: 'Range (theory)', value: fmt(a.R, 2), unit: 'm', kind: 'theory' },
      { label: 'Max height (sim)', value: fmt(s.maxH, 2), unit: 'm' },
      { label: 'Max height (theory)', value: fmt(a.H, 2), unit: 'm', kind: 'theory' },
      { label: 'Flight time (theory)', value: fmt(a.T, 2), unit: 's', kind: 'theory' },
    ];
  },
  warnings() { return []; },
  measure(s, p, comps, rng) {
    if (!s.landed) return { error: 'Run the launch until the projectile lands, then take the measurement.' };
    const a = analytic(p);
    const R = tape.read(s.R, rng), H = height.read(s.maxH, rng), T = timer.read(s.T, rng);
    return { v0: p.v0, angle: p.angle, h0: p.h0, k: s.k, R, Rth: a.R, errR: pctError(R, a.R), H, Hth: a.H, errH: pctError(H, a.H), T, Tth: a.T, errT: pctError(T, a.T) };
  },
  analyse(rows, p, comps) {
    const a = analytic(p); const th = rad(p.angle);
    const grp = latestGroup(rows, ['v0', 'angle', 'h0', 'k']);
    const uR = uncStatement(grp, 'R', tape, 'm', 2), uT = uncStatement(grp, 'T', timer, 's', 2);
    const eR = meanErr(rows, 'errR'), eH = meanErr(rows, 'errH'), eT = meanErr(rows, 'errT');
    const dragRows = rows.filter(r => r.k > 0), noDrag = rows.filter(r => !(r.k > 0));
    const last = rows[rows.length - 1];
    const calcs = [
      calc('Time of flight', 'T = [v₀ sin θ + √(v₀² sin² θ + 2 g h₀)] / g', `T = [${fmt(p.v0, 1)} × sin ${p.angle}° + √((${fmt(p.v0, 1)} × sin ${p.angle}°)² + 2 × ${fmt(p.g, 2)} × ${fmt(p.h0, 1)})] / ${fmt(p.g, 2)}`, `${fmt(a.T, 3)} s`),
      calc('Range', 'R = v₀ cos θ × T', `R = ${fmt(p.v0, 1)} × cos ${p.angle}° × ${fmt(a.T, 3)}`, `${fmt(a.R, 3)} m`),
      calc('Maximum height', 'H = h₀ + (v₀ sin θ)² / (2 g)', `H = ${fmt(p.h0, 1)} + (${fmt(p.v0, 1)} × sin ${p.angle}°)² / (2 × ${fmt(p.g, 2)})`, `${fmt(a.H, 3)} m`),
    ];
    if (last) calcs.push(calc('Percentage error (range, latest row)', '|R_meas − R_theory| / R_theory × 100', `|${fmt(last.R, 2)} − ${fmt(last.Rth, 2)}| / ${fmt(last.Rth, 2)} × 100`, `${fmt(last.errR, 2)} %`));
    let conclusion;
    if (!rows.length) conclusion = 'No measurements were recorded, so no conclusion can be drawn.';
    else if (dragRows.length && noDrag.length) conclusion = `Without drag the measured range agreed with the analytic prediction to a mean ${fmt(meanErr(noDrag, 'errR'), 2)} %; with drag enabled the deviation grew to ${fmt(meanErr(dragRows, 'errR'), 2) } %, always falling short of the prediction. This is consistent with the analytic model neglecting air resistance, which removes kinetic energy along the path and shortens the flight.`;
    else if (dragRows.length) conclusion = `All ${rows.length} runs included air drag. The measured range fell short of the drag-free analytic prediction by a mean ${fmt(eR, 2)} %, and flight time by ${fmt(eT, 2)} %. The analytic formulae are therefore not a valid model for this apparatus; the deviation is systematic, not random, and is explained by the quadratic drag term.`;
    else conclusion = `Over ${rows.length} run${rows.length > 1 ? 's' : ''} the measured range agreed with v₀ cos θ × T to a mean ${fmt(eR, 2)} %, maximum height to ${fmt(eH, 2)} % and time of flight to ${fmt(eT, 2)} %. ${eR < 1 ? 'The residual differences are within the instrument resolution and noise, so the projectile equations are confirmed for a drag-free flight.' : 'The residual differences exceed what instrument noise alone would produce; check that all runs completed and that the parameters did not change mid-run.'}`;
    return {
      objective: 'Verify the kinematic equations for projectile motion by measuring range, maximum height and time of flight, and compare against the analytic (drag-free) predictions.',
      setup: [['Launch speed', `${fmt(p.v0, 1)} m/s`], ['Launch angle', `${p.angle}°`], ['Launch height', `${fmt(p.h0, 1)} m`], ['g', `${fmt(p.g, 2)} m/s²`], ['Air drag', dragK(comps) ? `k = ${fmt(dragK(comps), 3)} m⁻¹` : 'none'], ['Integration', 'RK4, Δt = 2 ms; landing found by linear interpolation of the last step']],
      calculations: calcs,
      results: [`Mean range error over ${rows.length} rows: ${fmt(eR, 2)} %`, `Mean max-height error: ${fmt(eH, 2)} %`, `Mean time-of-flight error: ${fmt(eT, 2)} %`],
      errorPct: eR,
      uncertainty: `Range: ${uR.text} Flight time: ${uT.text}`,
      sources: ['Tape and height gauge resolution (0.01 m) and reading noise', 'Timer resolution (0.01 s) plus photogate trigger jitter', 'Numerical integration step (RK4, 2 ms) and landing interpolation', dragK(comps) ? 'Air drag, which the analytic formulae neglect (systematic)' : 'The analytic model assumes no air resistance — enable drag to explore this'],
      conclusion,
    };
  },
};

function niceBar(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m < 2 ? 1 : m < 5 ? 2 : 5) * p; }
