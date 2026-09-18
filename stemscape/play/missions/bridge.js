// MISSION 2 — BRIDGE BUILDER. A 2D truss editor solved with the direct stiffness method,
// a 12-tonne truck stepped across the deck, buckling and yield checks, and deflection limits.
import { solveTruss, looseNodes } from '../truss.js';
import { fmtINR, fmtLakh, pct, fmt, clamp01, weightedScore, reportText, lineChartSVG } from '../report.js';

const SPAN = 24, DX = 2, NI = SPAN / DX + 1, NJ = 6, DECK_J = 2; // j → y = (j-2)*2 m
const BUDGET = 6_00_000, TRUCK_KN = 117.7, AXLE = 4, DECK_KN_PER_M = 2.0, JOINT_COST = 4_000, DECK_COST = 36_000;
const DEFL_LIMIT = SPAN * 1000 / 250; // mm
const MAX_PANEL = 6; // m — longest deck panel the stringers may span
const g = 9.81;

const MAT = {
  steel: { name: 'Steel tube', rho: 7850, st: 250e6, sc: 250e6, E: 200e9, price: 80, color: '#C9D1DE',
    sections: { S: { s: 0.08, t: 0.007 }, M: { s: 0.12, t: 0.01 }, L: { s: 0.16, t: 0.012 } }, hollow: true },
  timber: { name: 'Sal timber', rho: 800, st: 14e6, sc: 11e6, E: 12e9, price: 35, color: '#C98B4A',
    sections: { S: { s: 0.10 }, M: { s: 0.15 }, L: { s: 0.20 } } },
  bamboo: { name: 'Bamboo bundle', rho: 700, st: 25e6, sc: 18e6, E: 15e9, price: 12, color: '#B9D46B',
    sections: { M: { culms: 3 }, L: { culms: 6 } }, culm: { A: 2.83e-3, I: 2.9e-6 } },
  concrete: { name: 'Precast concrete', rho: 2500, st: 3e6, sc: 15e6, E: 27e9, price: 9, color: '#A9AEB8',
    sections: { M: { s: 0.20 }, L: { s: 0.30 } } },
};
function sectionProps(matId, sec) {
  const m = MAT[matId], sd = m.sections[sec];
  if (m.culm) return { A: m.culm.A * sd.culms, I: m.culm.I * sd.culms, desc: `${sd.culms} culms Ø100 mm` };
  if (m.hollow) { const so = sd.s, si = sd.s - 2 * sd.t; return { A: so * so - si * si, I: (so ** 4 - si ** 4) / 12, desc: `${so * 1000}×${so * 1000} mm tube, t ${sd.t * 1000} mm` }; }
  return { A: sd.s * sd.s, I: sd.s ** 4 / 12, desc: `${sd.s * 1000}×${sd.s * 1000} mm solid` };
}
const PALETTE = [{ id: 'node', name: 'Joint (node)', cost: JOINT_COST, color: '#FFB020', specs: 'Pin joint. Enter on a grid point adds one; Delete removes it with its members.', key: '1' }];
const items = [['steel', 'S', '2'], ['steel', 'M', '3'], ['steel', 'L', '4'], ['timber', 'S', '5'], ['timber', 'M', '6'], ['timber', 'L', '7'], ['bamboo', 'M', '8'], ['bamboo', 'L', '9'], ['concrete', 'M', ''], ['concrete', 'L', '']];
for (const [mid, sec, key] of items) {
  const m = MAT[mid], sp = sectionProps(mid, sec);
  PALETTE.push({ id: `${mid}:${sec}`, mat: mid, sec, name: `${m.name} ${sec}`, cost: Math.round(m.rho * sp.A * m.price), unit: '/m', color: m.color, key,
    specs: `${sp.desc} · ${fmt(m.rho * sp.A, 1)} kg/m · σ ${m.st / 1e6}/${m.sc / 1e6} MPa (t/c) · E ${m.E / 1e9} GPa` });
}
PALETTE.push({ id: 'cut', name: 'Remove member', cost: 0, color: '#FF6B6B', specs: 'Enter on one end, then the other, to delete a member.', key: '0' });

const yOf = (j) => (j - DECK_J) * DX, xOf = (i) => i * DX;
const nk = (i, j) => i + ',' + j;

const M = {
  id: 'bridge', name: 'Bridge Builder', num: 2, viewType: 'side', cols: NI, rows: NJ, budget: BUDGET,
  short: 'Span a 24 m gorge with a truss that carries a 12-tonne truck.',
  brief: `The road to Kesarpur crosses a ${SPAN} m gorge. Build a truss between the two abutments: place joints on the 2 m grid, connect them with members of steel, timber, bamboo or concrete, then run a ${TRUCK_KN / g * 1000 / 1000 | 0}-tonne truck across. The solver computes every member force, checks yield and buckling, and measures mid-span deflection against L/250.`,
  constraints: [`Budget ${fmtLakh(BUDGET)}`, `Deck joints along y = 0, panels ≤ ${MAX_PANEL} m`, `12 t truck, two axles ${AXLE} m apart, stepped across`, `Deflection limit L/250 = ${DEFL_LIMIT} mm`, 'Any member over capacity = collapse'],
  palette: PALETTE,
  newDesign() { return { nodes: { [nk(0, DECK_J)]: 1, [nk(NI - 1, DECK_J)]: 1 }, members: [], pending: null }; },
  cellLabel(d, c) { const has = d.nodes[nk(c.x, c.y)]; const deg = d.members.filter(m => (m.a === nk(c.x, c.y) || m.b === nk(c.x, c.y))).length;
    return `x = ${xOf(c.x)} m, y = ${yOf(c.y)} m${c.y === DECK_J ? ' (deck level)' : ''}: ${has ? `joint with ${deg} member${deg === 1 ? '' : 's'}` : 'empty grid point'}${d.pending ? ` — member started at ${d.pending.replace(',', '/')}` : ''}`; },
  place(d, itemId, c) {
    const k = nk(c.x, c.y);
    if (itemId === 'node') { if (d.nodes[k]) return { ok: false, msg: 'There is already a joint here.' }; d.nodes[k] = 1; return { ok: true, msg: `Joint added at x ${xOf(c.x)} m, y ${yOf(c.y)} m.` }; }
    if (itemId === 'cut') {
      if (!d.nodes[k]) return { ok: false, msg: 'No joint here. Pick the first end of the member to remove.' };
      if (!d.pending) { d.pending = k; return { ok: true, msg: `Removing: first end at x ${xOf(c.x)} m, y ${yOf(c.y)} m. Now choose the other end.` }; }
      const i = d.members.findIndex(m => (m.a === d.pending && m.b === k) || (m.b === d.pending && m.a === k)); d.pending = null;
      if (i < 0) return { ok: false, msg: 'No member between those joints.' };
      d.members.splice(i, 1); return { ok: true, msg: `Member removed. ${d.members.length} members remain.` };
    }
    const it = PALETTE.find(p => p.id === itemId); if (!it) return { ok: false, msg: 'Unknown item.' };
    if (!d.nodes[k]) d.nodes[k] = 1;
    if (!d.pending) { d.pending = k; return { ok: true, msg: `${it.name}: first end at x ${xOf(c.x)} m, y ${yOf(c.y)} m. Move to the other end and press Enter.` }; }
    if (d.pending === k) { d.pending = null; return { ok: false, msg: 'Member cancelled (same joint twice).' }; }
    const [ai, aj] = d.pending.split(',').map(Number);
    const L = Math.hypot(xOf(c.x) - xOf(ai), yOf(c.y) - yOf(aj));
    if (L > 8.01) { d.pending = null; return { ok: false, msg: `Member too long (${L.toFixed(1)} m). Members are limited to 8 m.` }; }
    // reject members that pass straight through an existing joint (they would be two members)
    const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
    const gg = gcd(c.x - ai, c.y - aj);
    for (let q = 1; q < gg; q++) { const mi = ai + (c.x - ai) / gg * q, mj = aj + (c.y - aj) / gg * q; if (d.nodes[nk(mi, mj)]) { d.pending = null; return { ok: false, msg: `That member would pass through the joint at (${xOf(mi)}, ${yOf(mj)}) — connect to it instead.` }; } }
    const ex = d.members.find(m => (m.a === d.pending && m.b === k) || (m.b === d.pending && m.a === k));
    const from = d.pending; d.pending = null;
    if (ex) { ex.mat = it.mat; ex.sec = it.sec; return { ok: true, msg: `Member changed to ${it.name} (${L.toFixed(1)} m, ${fmtINR(it.cost * L)}).` }; }
    d.members.push({ a: from, b: k, mat: it.mat, sec: it.sec });
    return { ok: true, msg: `${it.name} member added, ${L.toFixed(1)} m, ${fmtINR(it.cost * L)}. Material so far ${fmtLakh(M.capex(d))}.` };
  },
  remove(d, c) {
    const k = nk(c.x, c.y);
    if (d.pending) { d.pending = null; return { ok: true, msg: 'Pending member cancelled.' }; }
    if (!d.nodes[k]) return { ok: false, msg: 'No joint here.' };
    if (k === nk(0, DECK_J) || k === nk(NI - 1, DECK_J)) return { ok: false, msg: 'The abutment joints are fixed supports and cannot be removed.' };
    const before = d.members.length; d.members = d.members.filter(m => m.a !== k && m.b !== k); delete d.nodes[k];
    return { ok: true, msg: `Joint removed with ${before - d.members.length} member(s).` };
  },
  inspect(d, c) {
    const k = nk(c.x, c.y);
    if (!d.nodes[k]) return c.y === DECK_J ? { title: 'Deck level grid point', rows: [['Position', `x ${xOf(c.x)} m, y 0 m`], ['Note', `Deck joints along y = 0 no more than ${MAX_PANEL} m apart`]] } : null;
    const ms = d.members.filter(m => m.a === k || m.b === k);
    const rows = [['Position', `x ${xOf(c.x)} m, y ${yOf(c.y)} m`], ['Support', k === nk(0, DECK_J) ? 'Pinned abutment' : k === nk(NI - 1, DECK_J) ? 'Roller abutment' : 'Free joint'], ['Members', ms.length ? ms.map(m => { const o = m.a === k ? m.b : m.a; const [oi, oj] = o.split(',').map(Number); return `${MAT[m.mat].name} ${m.sec} → (${xOf(oi)}, ${yOf(oj)})`; }).join('; ') : 'none']];
    return { title: `Joint (${xOf(c.x)} m, ${yOf(c.y)} m)`, rows, removable: !(k === nk(0, DECK_J) || k === nk(NI - 1, DECK_J)) };
  },
  list(d) { return [...Object.keys(d.nodes).map(k => { const [i, j] = k.split(',').map(Number); return `Joint at x ${xOf(i)} m, y ${yOf(j)} m`; }), ...d.members.map((m, i) => { const [ai, aj] = m.a.split(',').map(Number), [bi, bj] = m.b.split(',').map(Number); return `Member ${i + 1}: ${MAT[m.mat].name} ${m.sec} from (${xOf(ai)}, ${yOf(aj)}) to (${xOf(bi)}, ${yOf(bj)})`; })]; },
  capex(d) { return Object.keys(d.nodes).length * JOINT_COST + (deckComplete(d) ? DECK_COST : 0) + d.members.reduce((a, m) => a + memberCost(m), 0); },
  hud(d, r) { const cap = M.capex(d); return [
    { label: 'Cost', value: fmtLakh(cap), sub: `of ${fmtLakh(BUDGET)}`, bar: cap / BUDGET, cls: cap > BUDGET ? 'warn' : '' },
    { label: 'Members', value: `${d.members.length} · ${Object.keys(d.nodes).length} joints` },
    { label: 'Safety factor', value: r ? (r.m.sf === Infinity ? '—' : r.m.sf.toFixed(2) + '×') : '—', cls: r ? (r.m.sf < 1 ? 'warn' : r.m.sf >= 1.5 ? 'good' : '') : '' },
    { label: 'Deflection', value: r ? `${r.m.defl.toFixed(0)} mm` : '—', cls: r ? (r.m.defl > DEFL_LIMIT ? 'warn' : 'good') : '' },
  ]; },
  makeView(W, H) { const padX = 40, gx = (W - 2 * padX) / (NI - 1); const gy = Math.min(gx, (H * 0.8) / (NJ + 0.5)); return { W, H, gx, gy, ox: padX, oy: H * 0.62 }; },
  hitTest(v, px, py) { const i = Math.round((px - v.ox) / v.gx), j = Math.round(DECK_J + (v.oy - py) / v.gy); if (i < 0 || j < 0 || i >= NI || j >= NJ) return null; return { x: i, y: j }; },
  draw(ctx, v, d, t, cur, r, reduced) {
    const sx = (i) => v.ox + i * v.gx, sy = (j) => v.oy - (j - DECK_J) * v.gy;
    // sky, hills, gorge
    const grd = ctx.createLinearGradient(0, 0, 0, v.H); grd.addColorStop(0, '#2C6FCB'); grd.addColorStop(1, '#BFE3FF'); ctx.fillStyle = grd; ctx.fillRect(0, 0, v.W, v.H);
    const groundY = sy(DECK_J) + 6, floorY = sy(-1.5);
    ctx.fillStyle = '#4FB35E'; ctx.fillRect(0, groundY, sx(0), v.H); ctx.fillRect(sx(NI - 1), groundY, v.W, v.H);
    ctx.fillStyle = '#7A5A38'; ctx.fillRect(0, groundY + 10, sx(0), v.H); ctx.fillRect(sx(NI - 1), groundY + 10, v.W, v.H);
    // gorge sides
    ctx.fillStyle = '#6E4E2E'; ctx.beginPath(); ctx.moveTo(sx(0), groundY); ctx.lineTo(sx(0) + v.gx * 0.6, floorY); ctx.lineTo(sx(NI - 1) - v.gx * 0.6, floorY); ctx.lineTo(sx(NI - 1), groundY); ctx.closePath(); ctx.fill();
    // river
    ctx.fillStyle = '#2A8FD6'; ctx.fillRect(sx(0) + v.gx * 0.6, floorY, sx(NI - 1) - sx(0) - v.gx * 1.2, v.H - floorY);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const wx = sx(0) + v.gx * 1 + ((i * 97 + (reduced ? 0 : t * 30)) % (sx(NI - 1) - sx(0) - v.gx * 2)); ctx.beginPath(); ctx.moveTo(wx, floorY + 12 + i * 6); ctx.lineTo(wx + 18, floorY + 12 + i * 6); ctx.stroke(); }
    // abutments
    ctx.fillStyle = '#9FA6B2'; ctx.fillRect(sx(0) - 14, groundY - 6, 14, 30); ctx.fillRect(sx(NI - 1), groundY - 6, 14, 30);
    // grid points
    for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) { ctx.fillStyle = j === DECK_J ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.arc(sx(i), sy(j), 2.5, 0, Math.PI * 2); ctx.fill(); }
    // y labels
    ctx.fillStyle = 'rgba(6,14,34,.75)'; ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let j = 0; j < NJ; j++) ctx.fillText(`${yOf(j)} m`, v.ox - 8, sy(j));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i < NI; i += 2) ctx.fillText(`${xOf(i)}`, sx(i), sy(0) + 8);
    // deflected shape (exaggerated) after a run
    const defl = r && r.sim.worst && r.sim.worst.u;
    const idx = r ? r.sim.nodeIndex : null;
    const exag = 25;
    // members
    d.members.forEach((m, mi) => {
      const [ai, aj] = m.a.split(',').map(Number), [bi, bj] = m.b.split(',').map(Number);
      const mat = MAT[m.mat], w = m.sec === 'L' ? 7 : m.sec === 'M' ? 5 : 3.5;
      let color = mat.color;
      if (r && r.sim.util) { const u = r.sim.util[mi]; color = u > 1 ? '#FF3B3B' : u > 0.8 ? '#FFB020' : u > 0.5 ? '#B9D46B' : '#3FD27A'; }
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx(ai), sy(aj)); ctx.lineTo(sx(bi), sy(bj)); ctx.stroke();
      if (r && r.sim.util && r.sim.util[mi] > 1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(sx(ai), sy(aj)); ctx.lineTo(sx(bi), sy(bj)); ctx.stroke(); ctx.setLineDash([]); }
      if (defl && idx) { const a = idx[m.a], b = idx[m.b]; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(sx(ai) + defl[2 * a] * exag * v.gx / DX, sy(aj) - defl[2 * a + 1] * exag * v.gy / DX); ctx.lineTo(sx(bi) + defl[2 * b] * exag * v.gx / DX, sy(bj) - defl[2 * b + 1] * exag * v.gy / DX); ctx.stroke(); ctx.setLineDash([]); }
    });
    // deck surface
    if (deckComplete(d)) { ctx.strokeStyle = '#3B3E45'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx(0), sy(DECK_J) - 5); ctx.lineTo(sx(NI - 1), sy(DECK_J) - 5); ctx.stroke(); }
    // nodes
    for (const k of Object.keys(d.nodes)) { const [i, j] = k.split(',').map(Number); const sup = k === nk(0, DECK_J) || k === nk(NI - 1, DECK_J);
      ctx.fillStyle = k === d.pending ? '#FF6B6B' : sup ? '#FFB020' : '#F4F1E8'; ctx.strokeStyle = '#06101F'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(i), sy(j), sup ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (sup) { ctx.fillStyle = '#06101F'; ctx.beginPath(); ctx.moveTo(sx(i), sy(j) + 6); ctx.lineTo(sx(i) - 9, sy(j) + 20); ctx.lineTo(sx(i) + 9, sy(j) + 20); ctx.closePath(); ctx.fill(); if (k !== nk(0, DECK_J)) { ctx.beginPath(); ctx.arc(sx(i) - 5, sy(j) + 24, 3, 0, Math.PI * 2); ctx.arc(sx(i) + 5, sy(j) + 24, 3, 0, Math.PI * 2); ctx.fill(); } }
    }
    // truck (animated across after a run, parked on the left otherwise)
    const tx = r && r.sim.crossed ? ((reduced ? 0.5 : (t * 0.12) % 1.3) * (SPAN + 8) - 4) : -6;
    drawTruck(ctx, sx(0) + tx / DX * v.gx, sy(DECK_J) - 6, v.gx / DX);
    if (cur) { ctx.strokeStyle = '#FFB020'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx(cur.x), sy(cur.y), 11, 0, Math.PI * 2); ctx.stroke(); }
    // legend
    if (r && r.sim.util) { ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const leg = [['#3FD27A', '< 50% capacity'], ['#B9D46B', '50–80%'], ['#FFB020', '80–100%'], ['#FF3B3B', 'over capacity']]; const lx = v.W - 130; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(lx - 6, 6, 128, 70); leg.forEach((l, i) => { ctx.fillStyle = l[0]; ctx.fillRect(lx, 12 + i * 16, 12, 8); ctx.fillStyle = '#06101F'; ctx.fillText(l[1], lx + 18, 16 + i * 16); }); }
  },
  simulate(d, attempt) { return simulateBridge(d, attempt); }
};
function drawTruck(ctx, x, y, ppm) {
  const L = 6 * ppm, H = 2.2 * ppm;
  ctx.fillStyle = '#E5484D'; ctx.fillRect(x - L, y - H, L * 0.7, H * 0.8);
  ctx.fillStyle = '#FFB020'; ctx.fillRect(x - L * 0.3, y - H * 0.6, L * 0.3, H * 0.6);
  ctx.fillStyle = '#A5D8FF'; ctx.fillRect(x - L * 0.25, y - H * 0.55, L * 0.15, H * 0.25);
  ctx.fillStyle = '#1B1F2A'; [x - L * 0.85, x - L * 0.55, x - L * 0.15].forEach(wx => { ctx.beginPath(); ctx.arc(wx, y, ppm * 0.45, 0, Math.PI * 2); ctx.fill(); });
}
function memberLen(m) { const [ai, aj] = m.a.split(',').map(Number), [bi, bj] = m.b.split(',').map(Number); return Math.hypot(xOf(bi) - xOf(ai), yOf(bj) - yOf(aj)); }
function memberCost(m) { const it = PALETTE.find(p => p.id === `${m.mat}:${m.sec}`); return it.cost * memberLen(m); }
// Deck = chain of deck-level joints from x=0 to x=24, each pair joined by a member and no panel longer than 6 m
// (the deck stringers span between joints and hand axle loads to them by the lever rule).
function deckJoints(d) { const js = []; for (let i = 0; i < NI; i++) if (d.nodes[nk(i, DECK_J)]) js.push(i); if (js[0] !== 0 || js[js.length - 1] !== NI - 1) return null;
  for (let q = 0; q < js.length - 1; q++) { const a = nk(js[q], DECK_J), b = nk(js[q + 1], DECK_J); if ((js[q + 1] - js[q]) * DX > MAX_PANEL) return null; if (!d.members.some(m => (m.a === a && m.b === b) || (m.b === a && m.a === b))) return null; } return js; }
function deckComplete(d) { return !!deckJoints(d); }

function simulateBridge(d, attempt) {
  const keys = Object.keys(d.nodes); const nodeIndex = {}; keys.forEach((k, i) => { nodeIndex[k] = i; });
  const nodes = keys.map(k => { const [i, j] = k.split(',').map(Number); return { x: xOf(i), y: yOf(j), fixX: k === nk(0, DECK_J), fixY: k === nk(0, DECK_J) || k === nk(NI - 1, DECK_J) }; });
  const members = d.members.map(m => { const sp = sectionProps(m.mat, m.sec); return { a: nodeIndex[m.a], b: nodeIndex[m.b], E: MAT[m.mat].E, A: sp.A, I: sp.I, L: memberLen(m), mat: m.mat, sec: m.sec }; });
  const deck = deckComplete(d);
  const n = nodes.length;
  // self-weight
  const selfLoad = new Float64Array(2 * n);
  let weightN = 0;
  members.forEach(m => { const w = MAT[m.mat].rho * m.A * m.L * g; weightN += w; selfLoad[2 * m.a + 1] -= w / 2; selfLoad[2 * m.b + 1] -= w / 2; });
  const dj = deckJoints(d);
  const deckLoad = (loads, x, P) => { // lever rule onto the two deck joints bounding x
    if (!dj || x < 0 || x > SPAN) return; let q = 0; while (q < dj.length - 2 && xOf(dj[q + 1]) < x) q++;
    const xa = xOf(dj[q]), xb = xOf(dj[q + 1]), f = (x - xa) / (xb - xa);
    loads[2 * nodeIndex[nk(dj[q], DECK_J)] + 1] -= P * (1 - f); loads[2 * nodeIndex[nk(dj[q + 1], DECK_J)] + 1] -= P * f; };
  if (deck) for (let x = 0; x <= SPAN; x += 1) { const w = DECK_KN_PER_M * 1000 * (x === 0 || x === SPAN ? 0.5 : 1); deckLoad(selfLoad, x, w); weightN += w; }
  // capacities
  const cap = members.map(m => { const mat = MAT[m.mat]; const pcr = Math.PI ** 2 * mat.E * m.I / (m.L * m.L); return { t: mat.st * m.A, c: Math.min(mat.sc * m.A, pcr), pcr, buckles: pcr < mat.sc * m.A }; });
  const loose = looseNodes(nodes, members);
  const stepsN = deck ? (SPAN + AXLE) / DX + 1 : 1;
  const util = members.map(() => 0), maxF = members.map(() => 0), signF = members.map(() => 0);
  let worst = null, maxDefl = 0, singular = false, deflByStep = [], worstStep = 0;
  for (let s = 0; s < stepsN; s++) {
    const loads = Float64Array.from(selfLoad);
    if (deck) { const front = s * DX, rear = front - AXLE; for (const ax of [front, rear]) deckLoad(loads, ax, TRUCK_KN * 1000 / 2); }
    const sol = solveTruss(nodes, members, loads);
    if (!sol.ok) { singular = true; break; }
    let dmax = 0;
    for (const i of (dj || [])) { const ni = nodeIndex[nk(i, DECK_J)]; dmax = Math.max(dmax, -sol.u[2 * ni + 1] * 1000); }
    deflByStep.push(dmax);
    if (dmax >= maxDefl) { maxDefl = dmax; worst = sol; worstStep = s; }
    sol.forces.forEach((F, i) => { const u = F >= 0 ? F / cap[i].t : -F / cap[i].c; if (u > util[i]) { util[i] = u; maxF[i] = Math.abs(F); signF[i] = Math.sign(F); } });
  }
  const worstUtil = Math.max(0, ...util);
  const sf = members.length && worstUtil > 0 ? 1 / worstUtil : Infinity;
  const failed = util.map((u, i) => u > 1 ? i : -1).filter(i => i >= 0);
  const collapsed = singular || failed.length > 0;
  const crossed = deck && !collapsed;
  const cost = M.capex(d), over = cost - BUDGET;
  const weightT = weightN / g / 1000;
  const massRatio = weightN > 0 ? (TRUCK_KN * 1000) / weightN : 0;

  const sub = [
    { name: 'Safety factor', weight: 0.35, value: collapsed ? 0 : clamp01((sf - 1) / 1), explain: singular ? 'mechanism — the truss is not stable' : failed.length ? `${failed.length} member(s) over capacity → 0` : `min(1, (SF ${sf === Infinity ? '∞' : sf.toFixed(2)} − 1) ÷ 1): full credit at SF ≥ 2` },
    { name: 'Deflection', weight: 0.20, value: !crossed ? 0 : maxDefl <= DEFL_LIMIT ? 1 : clamp01(2 - maxDefl / DEFL_LIMIT), explain: !crossed ? 'truck could not cross' : `${maxDefl.toFixed(0)} mm vs limit ${DEFL_LIMIT} mm${maxDefl <= DEFL_LIMIT ? '' : ' → 2 − δ/limit'}` },
    { name: 'Cost', weight: 0.25, value: over > 0 ? 0 : (1 - 0.6 * cost / BUDGET) * (crossed ? 1 : 0), explain: over > 0 ? `over budget by ${fmtLakh(over)} → 0` : crossed ? `1 − 0.6 × ${fmtLakh(cost)} ÷ ${fmtLakh(BUDGET)}` : 'no credit until the truck crosses' },
    { name: 'Material efficiency', weight: 0.10, value: crossed ? clamp01(massRatio / 2) : 0, explain: crossed ? `truck ÷ bridge weight = ${massRatio.toFixed(2)} (full credit at 2.0)` : 'n/a' },
    { name: 'Crossing', weight: 0.10, value: crossed ? 1 : 0, explain: crossed ? 'truck crossed at all 15 positions' : deck ? 'collapse during crossing' : 'deck incomplete' },
  ];
  const si = weightedScore(sub, collapsed ? 0.5 : 1); if (collapsed) si.penaltyNote = 'Collapse penalty: total × 0.5';

  const fb = [];
  if (!deck) fb.push({ cls: 'bad', text: `Deck incomplete: the truck cannot cross. Deck joints at y = 0 must run from x = 0 to ${SPAN} m, each pair joined by a member, no panel longer than ${MAX_PANEL} m.` });
  if (singular) fb.push({ cls: 'bad', text: `The structure is a mechanism (unstable): ${loose.length ? `${loose.length} joint(s) have fewer than two members` : 'it can move without straining any member'}. Triangulate it.` });
  failed.forEach(i => { const m = members[i]; fb.push({ cls: 'bad', text: `Member ${i + 1} (${MAT[m.mat].name} ${m.sec}) carries ${fmt(maxF[i] / 1000)} kN in ${signF[i] > 0 ? 'tension' : 'compression'}, ${util[i].toFixed(1)}× its capacity${signF[i] < 0 && cap[i].buckles ? ' (Euler buckling governs)' : ''}.` }); });
  if (crossed) {
    const wi = util.indexOf(worstUtil);
    fb.push({ cls: sf >= 1.5 ? 'ok' : 'warn', text: `Truck crossed. Weakest link: member ${wi + 1} at ${pct(worstUtil)} of capacity (${fmt(maxF[wi] / 1000)} kN ${signF[wi] > 0 ? 'tension' : 'compression'}) → safety factor ${sf.toFixed(2)}.` });
    fb.push({ cls: maxDefl <= DEFL_LIMIT ? 'ok' : 'warn', text: `Deflection ${maxDefl.toFixed(0)} mm ${maxDefl <= DEFL_LIMIT ? 'is within' : 'exceeds'} the ${DEFL_LIMIT} mm limit (truck at ${worstStep * DX - AXLE / 2} m).` });
  }
  fb.push({ cls: over > 0 ? 'bad' : 'ok', text: over > 0 ? `Cost ${fmtLakh(cost)} exceeds the budget by ${fmtINR(over)}.` : `Cost ${fmtLakh(cost)}, ${fmtLakh(-over)} under budget. Bridge weighs ${weightT.toFixed(1)} t.` });
  const det = members.length + 3 - 2 * n;
  fb.push({ cls: 'ok', text: `Determinacy m + r − 2j = ${members.length} + 3 − ${2 * n} = ${det} (${det === 0 ? 'statically determinate' : det > 0 ? `${det} redundant member(s)` : 'mechanism unless braced'}).` });

  const hints = [];
  if (!deck) hints.push(`Start with the deck: joints along y = 0 at most ${MAX_PANEL} m apart (4 m panels are classic), chords between them, then triangulate above or below.`);
  if (singular) hints.push('Every free joint needs at least two members, and every panel should be a triangle. A rectangle without a diagonal is a mechanism.');
  failed.forEach(i => { const m = members[i]; if (signF[i] < 0 && cap[i].buckles) hints.push(`Member ${i + 1} buckles: shorten it (buckling load ∝ 1/L²) or use a larger section (∝ I).`); else hints.push(`Member ${i + 1} yields: upgrade to a larger section or a stronger material (${m.mat === 'concrete' && signF[i] > 0 ? 'concrete is very weak in tension' : m.mat === 'bamboo' || m.mat === 'timber' ? 'steel has 10–20× the strength' : 'try L section'}).`); });
  if (crossed && sf < 1.5) hints.push('A safety factor below 1.5 leaves no margin for overloads or defects; strengthen the most-utilised members (shown red/amber).');
  if (crossed && maxDefl > DEFL_LIMIT) hints.push('Deflection is governed by stiffness (E·A) and truss depth: taller trusses (4 m instead of 2 m) cut deflection roughly 4×.');
  if (crossed && sf > 3 && over <= 0) hints.push(`Safety factor ${sf.toFixed(1)} is generous: downsize members with utilisation under 30% (green) to reduce cost and weight.`);
  if (over > 0) hints.push('Bamboo and timber are cheap per metre; use steel only where forces are highest (bottom chord in tension, top chord in compression).');
  if (hints.length < 3) hints.push('Compare a Pratt (diagonals sloping toward mid-span) with a Warren truss: member forces and cost differ even with the same depth.');
  if (hints.length < 3) hints.push('The dashed outline shows the deflected shape ×25; watch how it changes with truss depth.');

  const rows = {
    cost: `${fmtLakh(cost)} material + joints (budget ${fmtLakh(BUDGET)}) · bridge weight ${weightT.toFixed(2)} t`,
    population: 'n/a — a road link; village access is the mission outcome, not a headcount',
    efficiency: crossed ? `Truck load ÷ self-weight = ${massRatio.toFixed(2)} · worst member at ${pct(worstUtil)} capacity` : 'n/a — no crossing',
    reliability: crossed ? `Truck crossed at all ${stepsN} positions` : deck ? 'Collapse — crossing failed' : 'No deck — crossing impossible',
    environment: `Embodied material: ${weightT.toFixed(2)} t (${members.map(m => m.mat).filter((v, i, a) => a.indexOf(v) === i).map(m => MAT[m].name).join(', ') || 'none'})`,
    safety: singular ? 'Unstable (mechanism)' : members.length ? `${sf === Infinity ? '∞' : sf.toFixed(2)} (min over ${members.length} members) · deflection ${maxDefl.toFixed(0)} mm / ${DEFL_LIMIT} mm` : 'n/a — no members',
  };
  const extra = members.map((m, i) => `Member ${i + 1}: ${MAT[m.mat].name} ${m.sec}, L ${m.L.toFixed(2)} m, max ${fmt(maxF[i] / 1000, 1)} kN ${signF[i] > 0 ? 'T' : signF[i] < 0 ? 'C' : ''}, capacity ${fmt(cap[i][signF[i] >= 0 ? 't' : 'c'] / 1000)} kN${signF[i] < 0 && cap[i].buckles ? ' (buckling)' : ''}, utilisation ${pct(util[i])}`).slice(0, 40);
  const formula = 'Score = 100 × (0.35·Safety + 0.20·Deflection + 0.25·Cost + 0.10·Efficiency + 0.10·Crossing)' + (collapsed ? ' × 0.5' : '');
  const text = reportText(M.name, attempt, rows, sub, si, hints, formula, extra);
  const badges = []; if (crossed && over <= 0) badges.push('Under budget'); if (crossed && sf >= 2) badges.push('Safety factor 2+'); if (crossed && !members.some(m => m.mat === 'steel')) badges.push('No steel'); if (crossed && maxDefl <= DEFL_LIMIT / 2) badges.push('Stiff as a rock');
  const charts = crossed ? [lineChartSVG([{ label: 'Deck deflection mm', values: deflByStep, color: '#22D3C5', fill: true }], { title: 'Deflection vs truck position', hline: DEFL_LIMIT, hlineLabel: 'L/250', xLabels: deflByStep.map((_, i) => i % 3 === 0 ? `${i * DX - AXLE} m` : ''), min: 0 })] : [];
  return { score: si.score, stars: si.stars, subscores: sub, rows, feedback: fb, hints, text, badges, charts,
    historyKeys: { SF: singular ? 'unstable' : sf === Infinity ? '—' : sf.toFixed(2), Deflection: crossed ? `${maxDefl.toFixed(0)} mm` : '—', Cost: fmtLakh(cost), Crossed: crossed ? 'yes' : 'no' },
    m: { sf: collapsed ? 0 : sf, defl: maxDefl, cost }, sim: { util, worst, nodeIndex, crossed, singular } };
}
export default M;
