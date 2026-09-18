import { h, clear, text, fmt, calc, latestGroup, meanErr, uncStatement, pctError, nextE12AtLeast } from './common.js';
import { instrument } from '../noise.js';

const ammeter = instrument({ id: 'ammeter', label: 'Digital ammeter', unit: 'A', resolution: 0.0001, relNoise: 0.005, absNoise: 0.00005 });
const voltmeter = instrument({ id: 'voltmeter', label: 'Digital voltmeter (across LED)', unit: 'V', resolution: 0.01, relNoise: 0.003, absNoise: 0.005 });

// Typical 5 mm indicator LEDs: forward voltage at 20 mA, absolute-maximum continuous current, and a colour name for the display.
const LEDS = {
  red: { label: 'Red (AlGaInP)', Vf: 1.8, Imax: 0.020, css: '#ff4d4d' },
  yellow: { label: 'Yellow', Vf: 2.0, Imax: 0.020, css: '#ffd23f' },
  green: { label: 'Green (InGaN)', Vf: 2.1, Imax: 0.020, css: '#5cff8a' },
  blue: { label: 'Blue', Vf: 3.0, Imax: 0.020, css: '#59a8ff' },
  white: { label: 'White', Vf: 3.2, Imax: 0.025, css: '#f2f6ff' },
};
const NVT = 0.05; // n·V_T (n ≈ 2 at room temperature)
function diode(led) { const Is = 0.020 / (Math.exp(led.Vf / NVT) - 1); return { Is, I: Vd => Is * (Math.exp(Vd / NVT) - 1) }; }
/** Solve Vd + R·I(Vd) = V by bisection. */
function solve(p) {
  const led = LEDS[p.colour]; const d = diode(led);
  let lo = 0, hi = Math.min(p.V, led.Vf + 0.6);
  if (p.V <= 0) return { I: 0, Vd: 0, led };
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; const f = mid + p.R * d.I(mid) - p.V; if (f > 0) hi = mid; else lo = mid; }
  const Vd = (lo + hi) / 2; return { I: d.I(Vd), Vd, led };
}
const state = (I, led) => I > led.Imax ? 'OVERCURRENT' : I < 0.001 ? 'OFF' : 'OK';

export default {
  id: 'led', title: 'LED Circuit', subject: 'electronics', timed: false, powerLabel: 'Power on',
  params: [
    { id: 'V', label: 'Supply voltage', unit: 'V', min: 0, max: 12, step: 0.1, value: 5, digits: 1 },
    { id: 'R', label: 'Series resistor', unit: 'Ω', min: 10, max: 2200, step: 10, value: 220, digits: 0 },
    { id: 'colour', label: 'LED colour', unit: '', type: 'select', value: 'red', options: Object.entries(LEDS).map(([k, v]) => ({ value: k, label: `${v.label} — V_f ${v.Vf} V, max ${v.Imax * 1000} mA` })) },
    { id: 'Itarget', label: 'Target current (for resistor choice)', unit: 'mA', min: 1, max: 30, step: 0.5, value: 15, digits: 1, advanced: true },
  ],
  components: null,
  instruments: [ammeter, voltmeter],
  columns: [
    { id: 'V', label: 'V', unit: 'V', digits: 1, kind: 'param' }, { id: 'R', label: 'R', unit: 'Ω', digits: 0, kind: 'param' }, { id: 'colour', label: 'LED', unit: '', kind: 'text' },
    { id: 'I', label: 'I meter', unit: 'mA', digits: 2, kind: 'meas' }, { id: 'Ilin', label: 'I (V−V_f)/R', unit: 'mA', digits: 2, kind: 'theory' }, { id: 'err', label: 'Error', unit: '%', digits: 2, kind: 'err' },
    { id: 'Vd', label: 'V_LED meter', unit: 'V', digits: 2, kind: 'meas' }, { id: 'bright', label: 'Brightness', unit: '%', digits: 0, kind: 'meas' }, { id: 'state', label: 'State', unit: '', kind: 'text' },
  ],
  graphs: [
    { id: 'IR', label: 'Current vs series resistor', xLabel: 'Series resistor (Ω)', yLabel: 'Current (mA)', zeroX: true, zeroY: true,
      build(rows, p) { const led = LEDS[p.colour]; const th = [], dm = []; for (let R = 10; R <= 2200; R += 30) { th.push([R, Math.max(0, (p.V - led.Vf) / R) * 1000]); dm.push([R, solve({ ...p, R }).I * 1000]); }
        return { series: [{ label: 'Measured', points: rows.filter(r => r.colour === p.colour).map(r => [r.R, r.I]), kind: 'points', color: 'a' }, { label: `Linear (V − V_f)/R at ${fmt(p.V, 1)} V`, points: th, color: 'b', dash: 'dash' }, { label: 'Diode-equation model', points: dm, color: 'c', dash: 'dot' }, { label: `Max ${led.Imax * 1000} mA`, points: [[0, led.Imax * 1000], [2200, led.Imax * 1000]], color: 'd', dash: 'dashdot' }] }; } },
    { id: 'IV', label: 'Current vs supply voltage', xLabel: 'Supply (V)', yLabel: 'Current (mA)', zeroX: true, zeroY: true,
      build(rows, p) { const led = LEDS[p.colour]; const th = [], dm = []; for (let V = 0; V <= 12; V += 0.25) { th.push([V, Math.max(0, (V - led.Vf) / p.R) * 1000]); dm.push([V, solve({ ...p, V }).I * 1000]); }
        return { series: [{ label: 'Measured', points: rows.filter(r => r.colour === p.colour).map(r => [r.V, r.I]), kind: 'points', color: 'a' }, { label: `Linear model, R = ${p.R} Ω`, points: th, color: 'b', dash: 'dash' }, { label: 'Diode-equation model', points: dm, color: 'c', dash: 'dot' }, { label: `Max ${led.Imax * 1000} mA`, points: [[0, led.Imax * 1000], [12, led.Imax * 1000]], color: 'd', dash: 'dashdot' }] }; } },
    { id: 'VI', label: 'LED forward voltage vs current (diode curve)', xLabel: 'Current (mA)', yLabel: 'V across LED (V)', zeroX: true, zeroY: true,
      build(rows, p) { const led = LEDS[p.colour]; const d = diode(led); const dm = []; for (let I = 0.1; I <= 30; I += 0.5) dm.push([I, NVT * Math.log(I / 1000 / d.Is + 1)]);
        return { series: [{ label: 'Measured', points: rows.filter(r => r.colour === p.colour).map(r => [r.I, r.Vd]), kind: 'points', color: 'a' }, { label: 'Diode equation', points: dm, color: 'c', dash: 'dot' }] }; } },
  ],
  tasks: [
    { title: 'Light the LED', text: 'With a red LED, 5 V and 220 Ω, press "Power on". The LED glows and the readouts show the current.', controls: [] },
    { title: 'Find the limit', text: 'Lower the resistor step by step. When the current exceeds 20 mA the warning appears — a real LED would fail.', controls: ['R'] },
    { title: 'Find turn-on', text: 'Raise the resistor to 2200 Ω, then lower the supply until the LED goes dark (below ~1 mA).', controls: ['V'] },
    { title: 'Choose a safe resistor', text: 'Read "Recommended R" in the readouts for the target current, set it, and take a measurement.', controls: ['R'] },
    { title: 'Compare models', text: 'Open "Current vs series resistor": the linear (V − V_f)/R estimate vs the diode-equation model.', controls: [] },
  ],
  describe(p) { const s = solve(p); return `A ${fmt(p.V, 1)} V supply, a ${p.R} Ω series resistor and a ${s.led.label.toLowerCase()} LED (forward voltage ≈ ${s.led.Vf} V, maximum ${s.led.Imax * 1000} mA) in one loop. An ammeter is in series and a voltmeter is across the LED. Current ${fmt(s.I * 1000, 2)} mA — ${state(s.I, s.led)}.`; },
  init() { return {}; }, step() {}, done() { return false; },
  render(svg, st, p, c, env) {
    clear(svg); const on = env.powered; const s = solve(p); const I = on ? s.I : 0; const led = s.led; const W = 800, H = 450;
    const col = on ? 'var(--phos)' : 'var(--text-3)'; const wire = (x1, y1, x2, y2) => svg.appendChild(h('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 2 }));
    const L = 120, R = 560, T = 100, B = 350;
    wire(L, T, 260, T); svg.appendChild(h('path', { d: `M260 ${T} l5 -10 l10 20 l10 -20 l10 20 l10 -20 l10 20 l5 -10`, fill: 'none', stroke: 'var(--amber)', 'stroke-width': 2 })); svg.appendChild(text(290, T - 18, `R = ${p.R} Ω`, { 'text-anchor': 'middle', fill: 'var(--amber)' }));
    wire(320, T, R, T); wire(R, T, R, 180);
    // LED symbol at (R, 225)
    const st8 = state(I, led); const bright = Math.min(1, I / led.Imax);
    if (on && I > 0.0005) { svg.appendChild(h('circle', { cx: R, cy: 225, r: 30 + 60 * bright, fill: led.css, opacity: 0.1 + 0.35 * bright })); svg.appendChild(h('circle', { cx: R, cy: 225, r: 22 + 20 * bright, fill: led.css, opacity: 0.25 + 0.5 * bright })); }
    svg.appendChild(h('path', { d: `M${R - 14} 205 L${R + 14} 205 L${R} 235 Z`, fill: on && I > 0.001 ? led.css : 'var(--bg)', stroke: 'var(--text)', 'stroke-width': 2 }));
    svg.appendChild(h('line', { x1: R - 14, y1: 235, x2: R + 14, y2: 235, stroke: 'var(--text)', 'stroke-width': 2 }));
    svg.appendChild(h('path', { d: `M${R + 18} 210 l12 -12 M${R + 24} 216 l12 -12`, stroke: 'var(--text)', 'stroke-width': 1.5 }));
    wire(R, 235, R, B); wire(R, B, L, B); wire(L, B, L, 245); wire(L, 205, L, T);
    svg.appendChild(h('line', { x1: L - 18, y1: 217, x2: L + 18, y2: 217, stroke: 'var(--text)', 'stroke-width': 3 })); svg.appendChild(h('line', { x1: L - 9, y1: 233, x2: L + 9, y2: 233, stroke: 'var(--text)', 'stroke-width': 2 }));
    svg.appendChild(text(L - 26, 229, `${fmt(p.V, 1)} V`, { 'text-anchor': 'end', fill: 'var(--text-2)' }));
    // ammeter on the bottom wire
    svg.appendChild(h('circle', { cx: 340, cy: B, r: 20, fill: 'var(--bg)', stroke: col, 'stroke-width': 2 })); svg.appendChild(text(340, B + 5, 'A', { 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 15 }));
    svg.appendChild(text(340, B + 38, on ? `${fmt(ammeter.read(I) * 1000, 2)} mA` : 'OFF', { 'text-anchor': 'middle', fill: col, 'font-size': 12 }));
    // status panel
    const sx = 620; svg.appendChild(h('rect', { x: sx, y: 80, width: 165, height: 150, fill: 'var(--panel)', stroke: 'var(--line-2)' }));
    svg.appendChild(text(sx + 12, 104, 'LED STATE', { fill: 'var(--text-3)', 'font-size': 11 }));
    const stCol = !on ? 'var(--text-3)' : st8 === 'OVERCURRENT' ? 'var(--red)' : st8 === 'OFF' ? 'var(--amber)' : 'var(--phos)';
    svg.appendChild(text(sx + 12, 130, on ? st8 : 'UNPOWERED', { fill: stCol, 'font-size': 16, 'font-weight': 600 }));
    svg.appendChild(text(sx + 12, 156, `brightness ${on ? fmt(bright * 100, 0) : 0} %`, { fill: 'var(--text-2)' }));
    svg.appendChild(h('rect', { x: sx + 12, y: 166, width: 140, height: 10, fill: 'var(--bg)', stroke: 'var(--line-2)' }));
    svg.appendChild(h('rect', { x: sx + 12, y: 166, width: 140 * (on ? bright : 0), height: 10, fill: led.css }));
    svg.appendChild(text(sx + 12, 200, `${led.label}`, { fill: 'var(--text-2)', 'font-size': 11 }));
    svg.appendChild(text(sx + 12, 218, `V_f ${led.Vf} V · max ${led.Imax * 1000} mA`, { fill: 'var(--text-3)', 'font-size': 11 }));
    if (on && st8 === 'OVERCURRENT') svg.appendChild(text(R, 290, '⚠ OVER MAXIMUM CURRENT', { 'text-anchor': 'middle', fill: 'var(--red)', 'font-weight': 600 }));
    if (on && st8 === 'OFF') svg.appendChild(text(R, 290, 'below turn-on: LED dark', { 'text-anchor': 'middle', fill: 'var(--amber)' }));
    svg.appendChild(text(20, H - 20, on ? `STATUS: POWERED — V across LED ${fmt(s.Vd, 2)} V, across R ${fmt(p.V - s.Vd, 2)} V` : 'STATUS: OFF — press Power on', { fill: col, 'font-size': 11 }));
  },
  readouts(st, p, c, env) {
    const on = env.powered; const s = solve(p); const led = s.led; const Ilin = Math.max(0, (p.V - led.Vf) / p.R);
    const Rrec = nextE12AtLeast(Math.max(1, (p.V - led.Vf) / (p.Itarget / 1000)));
    const st8 = state(s.I, led);
    return [
      { label: 'Ammeter', value: on ? fmt(ammeter.read(s.I) * 1000, 2) : '—', unit: 'mA', kind: on && st8 === 'OVERCURRENT' ? 'err' : on && st8 === 'OFF' ? 'warn' : 'meas', note: on ? st8 : 'power off' },
      { label: 'Linear estimate', value: fmt(Ilin * 1000, 2), unit: 'mA', kind: 'theory', note: '(V − V_f) / R' },
      { label: 'V across LED', value: on ? fmt(voltmeter.read(s.Vd), 2) : '—', unit: 'V', note: `V_f ≈ ${led.Vf} V` },
      { label: 'V across resistor', value: on ? fmt(p.V - s.Vd, 2) : '—', unit: 'V' },
      { label: 'Brightness', value: on ? fmt(Math.min(1, s.I / led.Imax) * 100, 0) : '0', unit: '%', note: 'I / I_max' },
      { label: 'LED power', value: on ? fmt(s.I * s.Vd * 1000, 1) : '—', unit: 'mW' },
      { label: 'Recommended R', value: fmt(Rrec, 0), unit: 'Ω', kind: 'theory', note: `E12 ≥ (V − V_f)/${fmt(p.Itarget, 1)} mA` },
      { label: 'Resistor power', value: on ? fmt(s.I * s.I * p.R * 1000, 1) : '—', unit: 'mW' },
    ];
  },
  warnings(st, p, c, env) {
    const s = solve(p); const led = s.led; const out = [];
    if (s.I > led.Imax) out.push({ level: 'err', text: `Overcurrent: ${fmt(s.I * 1000, 1)} mA exceeds the ${led.Imax * 1000} mA absolute maximum. A real LED would overheat and fail. Increase R to at least ${fmt(nextE12AtLeast((p.V - led.Vf) / led.Imax), 0)} Ω.` });
    else if (s.I < 0.001) out.push({ level: 'warn', text: `Below turn-on: ${fmt(s.I * 1000, 2)} mA. The supply (${fmt(p.V, 1)} V) is at or under the forward voltage (${led.Vf} V), so the LED stays dark.` });
    if (s.I * s.I * p.R > 0.25) out.push({ level: 'warn', text: `The series resistor dissipates ${fmt(s.I * s.I * p.R, 2)} W — above a ¼ W rating.` });
    return out;
  },
  measure(st, p, c, rng, env) {
    if (!env.powered) return { error: 'Power on the circuit first.' };
    const s = solve(p); const led = s.led; const Im = ammeter.read(s.I, rng); const Vd = voltmeter.read(s.Vd, rng);
    const Ilin = Math.max(0, (p.V - led.Vf) / p.R);
    return { V: p.V, R: p.R, colour: p.colour, I: Im * 1000, Imodel: s.I * 1000, Ilin: Ilin * 1000, err: Ilin > 0 ? pctError(Im, Ilin) : NaN, errModel: s.I > 0.001 ? pctError(Im, s.I) : NaN, Vd, bright: Math.min(1, Im / led.Imax) * 100, state: state(Im, led) };
  },
  analyse(rows, p) {
    const s = solve(p); const led = s.led; const grp = latestGroup(rows, ['V', 'R']); const u = uncStatement(grp, 'I', { uncertainty: v => ammeter.uncertainty(v / 1000) * 1000 }, 'mA', 2);
    const e = meanErr(rows, 'err'), em = meanErr(rows, 'errModel'); const Rrec = nextE12AtLeast(Math.max(1, (p.V - led.Vf) / (p.Itarget / 1000)));
    const d = diode(led);
    const calcs = [
      calc('Linear estimate', 'I ≈ (V − V_f) / R', `= (${fmt(p.V, 1)} − ${led.Vf}) / ${p.R}`, `${fmt(Math.max(0, (p.V - led.Vf) / p.R) * 1000, 2)} mA`),
      calc('Diode equation (solved numerically)', 'I = I_s (e^{V_d / nV_T} − 1),  V = V_d + I R,  nV_T = 0.05 V', `I_s = ${d.Is.toExponential(2)} A (fitted so V_d = ${led.Vf} V at 20 mA); bisection gives V_d = ${fmt(s.Vd, 3)} V`, `${fmt(s.I * 1000, 2)} mA`),
      calc('Resistor for the target current', 'R = (V − V_f) / I_target, rounded up to E12', `= (${fmt(p.V, 1)} − ${led.Vf}) / ${fmt(p.Itarget / 1000, 4)}`, `${fmt((p.V - led.Vf) / (p.Itarget / 1000), 0)} Ω → ${Rrec} Ω`),
      calc('Brightness', 'I / I_max × 100', `= ${fmt(s.I * 1000, 2)} / ${led.Imax * 1000} × 100`, `${fmt(Math.min(1, s.I / led.Imax) * 100, 0)} %`),
    ];
    const over = rows.filter(r => r.state === 'OVERCURRENT').length, off = rows.filter(r => r.state === 'OFF').length;
    const conclusion = !rows.length ? 'No measurements recorded.' : `Across ${rows.length} reading${rows.length > 1 ? 's' : ''} the measured current agreed with the diode-equation model to ${fmt(em, 2)} % and with the simple (V − V_f)/R estimate to ${fmt(e, 2)} %. ${e > 5 ? 'The linear estimate is noticeably worse because the LED’s forward voltage is not fixed: it rises with current, so the simple formula over-predicts at high currents and under-predicts near turn-on.' : 'At these settings the linear estimate is adequate, because the forward voltage varies little around its rated value.'}${over ? ` ${over} reading${over > 1 ? 's' : ''} exceeded the ${led.Imax * 1000} mA maximum — those configurations would destroy a real LED.` : ''}${off ? ` ${off} reading${off > 1 ? 's were' : ' was'} below turn-on.` : ''} For ${fmt(p.Itarget, 1)} mA at ${fmt(p.V, 1)} V the correct series resistor is ${Rrec} Ω.`;
    return {
      objective: 'Determine the current through an LED in series with a resistor, compare a linear estimate with a diode-equation model, and select a resistor that gives a safe target current.',
      setup: [['Supply', `${fmt(p.V, 1)} V`], ['Series resistor', `${p.R} Ω`], ['LED', `${led.label}, V_f ${led.Vf} V, I_max ${led.Imax * 1000} mA`], ['Target current', `${fmt(p.Itarget, 1)} mA`], ['Ammeter', ammeter.describe()], ['Voltmeter', voltmeter.describe()]],
      calculations: calcs, results: [`Mean error vs linear model: ${fmt(e, 2)} %`, `Mean error vs diode model: ${fmt(em, 2)} %`, `Recommended resistor: ${Rrec} Ω`], errorPct: em, uncertainty: u.text,
      sources: ['Ammeter 0.1 mA resolution and 0.5 % noise', 'The linear model treats V_f as constant — a systematic model error', 'Real LEDs vary in V_f by ±0.2 V between units and with temperature; the model uses one nominal value', 'Ideal supply with no internal resistance'], conclusion,
    };
  },
};
