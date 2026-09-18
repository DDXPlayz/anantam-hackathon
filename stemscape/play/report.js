// STEMSCAPE Engineering Report + scoring helpers shared by all missions.

export const fmtINR = (n) => {
  // Indian grouping: 12,34,567
  const neg = n < 0; n = Math.round(Math.abs(n));
  let s = String(n);
  if (s.length > 3) { const last3 = s.slice(-3); let rest = s.slice(0, -3); rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ','); s = rest + ',' + last3; }
  return (neg ? '-₹' : '₹') + s;
};
export const fmtLakh = (n) => {
  const a = Math.abs(n);
  if (a >= 1e7) return (n < 0 ? '-' : '') + '₹' + (a / 1e7).toFixed(2) + ' crore';
  if (a >= 1e5) return (n < 0 ? '-' : '') + '₹' + (a / 1e5).toFixed(2) + ' lakh';
  return fmtINR(n);
};
export const pct = (f, d = 0) => (100 * f).toFixed(d) + '%';
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const fmt = (n, d = 0) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });

export function starsFor(score) { return score >= 85 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0; }
export function starString(s) { return '★'.repeat(s) + '☆'.repeat(3 - s); }

// Weighted score: subscores = [{name, weight, value(0..1), explain}]
export function weightedScore(subscores, penalty = 1) {
  const total = subscores.reduce((a, s) => a + s.weight, 0);
  const raw = subscores.reduce((a, s) => a + s.weight * clamp01(s.value), 0) / total;
  const score = Math.round(100 * raw * penalty);
  return { score, raw, stars: starsFor(score) };
}

// Build the canonical text block. `rows` is {cost, population, efficiency, reliability, environment, safety}
export function reportText(missionName, attempt, rows, subscores, scoreInfo, hints, formula, extra = []) {
  const line = (k, v) => `${k.padEnd(22, ' ')} ${v}`;
  const out = [];
  out.push('STEMSCAPE — ENGINEERING REPORT');
  out.push(`Mission: ${missionName}   Attempt #${attempt}   ${new Date().toLocaleString('en-IN')}`);
  out.push('');
  out.push('ENGINEERING PERFORMANCE');
  out.push(line('Cost', rows.cost));
  out.push(line('Population Served', rows.population));
  out.push(line('Efficiency', rows.efficiency));
  out.push(line('Reliability', rows.reliability));
  out.push(line('Environmental Impact', rows.environment));
  out.push(line('Safety Factor', rows.safety));
  out.push(line('FINAL SCORE', `${scoreInfo.score} / 100   ${starString(scoreInfo.stars)}`));
  out.push('');
  out.push('SCORE BREAKDOWN');
  out.push(formula);
  for (const s of subscores) out.push(`  ${s.name.padEnd(20, ' ')} ${String(Math.round(s.weight * 100)).padStart(3)}% × ${clamp01(s.value).toFixed(2)}  — ${s.explain}`);
  if (scoreInfo.penaltyNote) out.push(`  ${scoreInfo.penaltyNote}`);
  if (extra.length) { out.push(''); out.push('DETAILS'); extra.forEach(e => out.push('  ' + e)); }
  out.push('');
  out.push('ITERATION HINTS');
  hints.forEach((h, i) => out.push(`  ${i + 1}. ${h}`));
  return out.join('\n');
}

// Seeded PRNG (mulberry32) so "random" outages are reproducible between runs.
export function rng(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Tiny SVG line chart for series {label, values[], color}; returns markup string.
export function lineChartSVG(series, opts = {}) {
  const W = opts.width || 520, H = opts.height || 150, padL = 44, padR = 10, padT = 12, padB = 26;
  const n = Math.max(...series.map(s => s.values.length));
  let lo = opts.min ?? Infinity, hi = opts.max ?? -Infinity;
  if (opts.min == null || opts.max == null) for (const s of series) for (const v of s.values) { if (opts.min == null) lo = Math.min(lo, v); if (opts.max == null) hi = Math.max(hi, v); }
  if (!isFinite(lo)) lo = 0; if (!isFinite(hi)) hi = 1; if (hi === lo) hi = lo + 1;
  const sx = (i) => padL + (n <= 1 ? 0 : i / (n - 1)) * (W - padL - padR);
  const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'chart')}: ${series.map(s => s.label + ' ' + s.values.map(v => Math.round(v * 100) / 100).join(', ')).join('; ')}">`;
  g += `<rect x="0" y="0" width="${W}" height="${H}" fill="#060E22"/>`;
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; const y = sy(v); g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="#1E3F78" stroke-width="1"/><text x="${padL - 6}" y="${y + 4}" fill="#8FA0C9" font-size="10" text-anchor="end" font-family="Chakra Petch, sans-serif">${fmtTick(v)}</text>`; }
  if (opts.xLabels) opts.xLabels.forEach((l, i) => { const x = sx(i); g += `<text x="${x}" y="${H - 8}" fill="#8FA0C9" font-size="10" text-anchor="middle" font-family="Chakra Petch, sans-serif">${esc(l)}</text>`; });
  if (opts.hline != null) { const y = sy(opts.hline); g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="#FF6B6B" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${W - padR}" y="${y - 4}" fill="#FF6B6B" font-size="10" text-anchor="end" font-family="Chakra Petch, sans-serif">${esc(opts.hlineLabel || '')}</text>`; }
  for (const s of series) {
    const d = s.values.map((v, i) => (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(v).toFixed(1)).join(' ');
    if (s.fill) g += `<path d="${d} L${sx(s.values.length - 1).toFixed(1)} ${sy(lo)} L${sx(0)} ${sy(lo)} Z" fill="${s.color}" opacity=".18"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    if (s.dots) s.values.forEach((v, i) => { g += `<circle cx="${sx(i)}" cy="${sy(v)}" r="3.5" fill="${s.color}"/>`; });
  }
  let lx = padL;
  for (const s of series) { g += `<rect x="${lx}" y="${H - 20}" width="10" height="3" fill="${s.color}"/><text x="${lx + 14}" y="${H - 15}" fill="#C2CCE6" font-size="10" font-family="Chakra Petch, sans-serif">${esc(s.label)}</text>`; lx += 20 + s.label.length * 6; }
  g += '</svg>';
  return g;
}
function fmtTick(v) { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k'; return a >= 10 ? Math.round(v) : Math.round(v * 10) / 10; }
export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
