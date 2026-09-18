// Shared helpers for experiment engines.
import { fmt, summarise, pctError, mean } from '../noise.js';
export { fmt, summarise, pctError, mean };

const NS = 'http://www.w3.org/2000/svg';
export function h(tag, attrs = {}, children = []) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  for (const c of children) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
export function text(x, y, str, attrs = {}) {
  return h('text', { x, y, fill: 'var(--text-2)', 'font-family': 'var(--font-mono)', 'font-size': 12, ...attrs }, [str]);
}

/** Classic RK4 for y' = f(t, y) with y an array. */
export function rk4(f, y, t, dt) {
  const n = y.length;
  const k1 = f(t, y);
  const y2 = new Array(n); for (let i = 0; i < n; i++) y2[i] = y[i] + dt / 2 * k1[i];
  const k2 = f(t + dt / 2, y2);
  const y3 = new Array(n); for (let i = 0; i < n; i++) y3[i] = y[i] + dt / 2 * k2[i];
  const k3 = f(t + dt / 2, y3);
  const y4 = new Array(n); for (let i = 0; i < n; i++) y4[i] = y[i] + dt * k3[i];
  const k4 = f(t + dt, y4);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
export function nearestE12(r) {
  if (!(r > 0)) return 10;
  const dec = Math.pow(10, Math.floor(Math.log10(r)));
  let best = null, bestD = Infinity;
  for (const m of [1, 10]) for (const e of E12) { const v = e * dec * m / 10; const d = Math.abs(Math.log(v / r)); if (d < bestD) { bestD = d; best = v; } }
  return best;
}
export function nextE12AtLeast(r) {
  const dec = Math.pow(10, Math.floor(Math.log10(r)));
  for (const m of [1, 10, 100]) for (const e of E12) { const v = e * dec * m / 10; if (v >= r - 1e-9) return v; }
  return r;
}

/** Deterministic manufacturing tolerance: a nominal resistor's actual value deviates by up to ±1 %, fixed per slot and nominal. */
export function actualResistance(nominal, slot) {
  let x = Math.imul((Math.round(nominal * 100) + 1) * 2654435761 + (slot + 1) * 40503, 1) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; x ^= x >>> 15;
  const t = (x / 4294967296) * 2 - 1;
  return nominal * (1 + 0.01 * t);
}

export function deg(rad) { return rad * 180 / Math.PI; }
export function rad(d) { return d * Math.PI / 180; }

/** Rows whose parameter columns match the latest row — for repeated-measurement statistics. */
export function latestGroup(rows, keys) {
  if (!rows.length) return [];
  const last = rows[rows.length - 1];
  return rows.filter(r => keys.every(k => Math.abs((r[k] ?? 0) - (last[k] ?? 0)) < 1e-9 && String(r[k]) === String(last[k])));
}

export function meanErr(rows, key) {
  const v = rows.map(r => r[key]).filter(x => isFinite(x));
  return v.length ? mean(v) : NaN;
}

export function calc(label, formula, subst, result) { return { label, formula, subst, result }; }

/** Uncertainty statement for a measured quantity across the latest repeated group. */
export function uncStatement(group, key, inst, unit, digits = 3) {
  const vals = group.map(r => r[key]).filter(isFinite);
  const trueVal = vals.length ? mean(vals) : NaN;
  const s = summarise(vals, inst.uncertainty(trueVal));
  if (!s.n) return { text: 'No measurements yet.', s };
  if (s.n >= 3) return { text: `${s.n} repeated readings: mean ${fmt(s.mean, digits)} ± ${fmt(s.unc, digits)} ${unit} (standard error of the mean; sample SD ${fmt(s.sd, digits)} ${unit}).`, s };
  return { text: `${s.n} reading${s.n > 1 ? 's' : ''}: ${fmt(s.mean, digits)} ± ${fmt(s.unc, digits)} ${unit} (from instrument resolution and noise; take 3 or more readings at the same settings for a standard error).`, s };
}

export function svgLed(x, y, on, cls) {
  return h('g', {}, [h('circle', { cx: x, cy: y, r: 4, fill: on ? 'var(--phos)' : 'var(--line-2)' })]);
}
