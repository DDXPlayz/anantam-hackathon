// Seeded pseudo-random generator and instrument noise model.
// Every "measured" value in LUMA passes through an Instrument: the true value is
// perturbed by Gaussian noise (a fraction of reading plus an absolute floor),
// then quantised to the instrument's display resolution.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = Date.now() & 0xffffffff) { this.seed = seed; this.next = mulberry32(seed); }
  uniform(a = 0, b = 1) { return a + (b - a) * this.next(); }
  gauss(sigma = 1) {
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export function quantize(value, resolution) {
  if (!resolution) return value;
  return Math.round(value / resolution) * resolution;
}

/**
 * Instrument definition.
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.label  e.g. "Digital ammeter"
 * @param {string} o.unit
 * @param {number} o.resolution  smallest displayed step
 * @param {number} o.relNoise    σ as a fraction of reading (e.g. 0.005)
 * @param {number} o.absNoise    σ floor in units
 */
export function instrument(o) {
  return {
    ...o,
    read(trueValue, rng) {
      const sigma = Math.hypot(o.relNoise * Math.abs(trueValue), o.absNoise || 0);
      const noisy = trueValue + (rng ? rng.gauss(sigma) : 0);
      return quantize(noisy, o.resolution);
    },
    // half-resolution + 1σ noise as a single-reading uncertainty
    uncertainty(trueValue) {
      const sigma = Math.hypot(o.relNoise * Math.abs(trueValue), o.absNoise || 0);
      return Math.hypot(o.resolution / 2, sigma);
    },
    describe() {
      const parts = [`resolution ${o.resolution} ${o.unit}`];
      if (o.relNoise) parts.push(`noise σ = ${(o.relNoise * 100).toFixed(2)} % of reading`);
      if (o.absNoise) parts.push(`floor σ = ${o.absNoise} ${o.unit}`);
      return `${o.label}: ${parts.join(', ')}`;
    },
  };
}

// ---------- Statistics helpers ----------
export function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
export function stddev(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
export function stderr(a) { return a.length >= 2 ? stddev(a) / Math.sqrt(a.length) : NaN; }
export function pctError(exp, theory) {
  if (!isFinite(exp) || !isFinite(theory) || theory === 0) return NaN;
  return Math.abs(exp - theory) / Math.abs(theory) * 100;
}

/** Summarise repeated readings: mean ± standard error when ≥3, else instrument uncertainty. */
export function summarise(values, instrumentUnc) {
  const clean = values.filter(v => isFinite(v));
  if (!clean.length) return { n: 0, mean: NaN, unc: NaN, method: 'none' };
  if (clean.length >= 3) {
    const se = stderr(clean);
    return { n: clean.length, mean: mean(clean), unc: Math.max(se, instrumentUnc / Math.sqrt(clean.length)), sd: stddev(clean), method: 'standard error of the mean' };
  }
  return { n: clean.length, mean: mean(clean), unc: instrumentUnc, method: 'instrument resolution' };
}

export function fmt(v, digits = 3) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(Math.max(1, digits - 1));
  return v.toFixed(digits);
}
export function fmtUnc(v, u, digits = 3) {
  if (!isFinite(u)) return fmt(v, digits);
  return `${fmt(v, digits)} ± ${fmt(u, digits)}`;
}
