// MISSION 4 — FLOOD DEFENCE. A 72-hour storm hydrograph routed through a river reach with
// level-pool storage, a Manning rating curve, upstream detention, levee overtopping as a
// broad-crested weir, town stage-storage, pumps and a depth-damage model.
import * as I from '../iso.js';
import { fmtINR, fmtLakh, pct, fmt, clamp01, weightedScore, reportText, lineChartSVG } from '../report.js';

const COLS = 14, ROWS = 10;
const RIVER_X = [2, 3], BANK_X = 4, BASIN_SITES = [[0, 1], [0, 4], [0, 7]];
const BUDGET = 40e7; // ₹40 crore
const REACH_M = 1000, TILE_M = 100, TILE_AREA = TILE_M * TILE_M;
const CH = { B: 30, D: 3, n: 0.035, S: 0.0008, nfp: 0.10, fpLeft: 60, fpRight: 40 };
const DIVERT_Q = 250, BASIN_M3 = 2.5e6;
const TOWN_BASE = 3.5, SLOPE = 0.25; // m above channel bed at the bank, rising away from the river
const STORMS = { 10: { peak: 180, label: '10-year' }, 50: { peak: 300, label: '50-year' }, 100: { peak: 380, label: '100-year' } };
const BASE_Q = 30, TP = 24, K = 4, HOURS = 72, DT = 0.1;
const PUMP_M3H = 10_000, PUMP_KWH_M3 = 0.3, OUTFALL_M3S = 5;
const POP = 2400, HH_PER_TILE = 20, PEOPLE_PER_TILE = 100;

const HOUSES = [[6, 1], [7, 1], [8, 1], [6, 3], [7, 3], [9, 3], [6, 5], [7, 5], [8, 5], [9, 5], [6, 7], [7, 7], [8, 7], [10, 7], [6, 9], [7, 9], [8, 9], [9, 9], [11, 1], [11, 5], [11, 9], [12, 3], [12, 7], [10, 1]];
const ASSETS = { clinic: [9, 1], school: [8, 3], market: [10, 5], substation: [10, 3] };
const ASSET_VALUE = { house: 1.6e7, clinic: 6e7, school: 4e7, market: 5e7, substation: 10e7 };
const ASSET_NAME = { clinic: 'Clinic', school: 'School', market: 'Market', substation: 'Power substation' };
const key = (x, y) => x + ',' + y;
const elevOf = (x) => TOWN_BASE + SLOPE * Math.max(0, x - 5);
const terrainAt = (x, y) => RIVER_X.includes(x) ? 'water' : x === BANK_X ? 'sand' : x < 2 ? 'wet' : y === 4 && x > 4 ? 'road' : 'grass';
const fixedAt = (x, y) => HOUSES.some(h => h[0] === x && h[1] === y) ? 'house' : Object.entries(ASSETS).find(([, p]) => p[0] === x && p[1] === y)?.[0] || (BASIN_SITES.some(b => b[0] === x && b[1] === y) ? 'basinsite' : null);

const PALETTE = [
  { id: 'levee1', name: 'Levee 1 m', cost: 30e5, color: '#B5A16B', specs: 'Earth embankment, crest 4.5 m · ₹30,000/m × 100 m per bank tile', key: '1', h: 1 },
  { id: 'levee2', name: 'Levee 2 m', cost: 60e5, color: '#A08C55', specs: 'Crest 5.5 m · ₹60,000/m per bank tile', key: '2', h: 2 },
  { id: 'levee3', name: 'Levee 3 m', cost: 100e5, color: '#8B7743', specs: 'Crest 6.5 m · ₹1,00,000/m per bank tile (needs all 10 tiles to close)', key: '3', h: 3 },
  { id: 'basin', name: 'Detention basin 2.5 Mm³', cost: 120e6, color: '#3D9E7A', specs: `Upstream site (B) · side weir diverts flow above ${DIVERT_Q} m³/s until full`, key: '4' },
  { id: 'dredge', name: 'Dredge reach +1 m', cost: 40e5, color: '#2A8FD6', specs: 'Deepens 100 m of channel by 1 m · whole reach must be dredged to count', key: '5' },
  { id: 'widen', name: 'Widen reach +10 m', cost: 60e5, color: '#1E6FB0', specs: 'Widens 100 m of channel by 10 m · whole reach must be widened to count', key: '6' },
  { id: 'pump', name: 'Flood pump 10,000 m³/h', cost: 80e5, color: '#3C8BE0', specs: 'Drains ponded water from the town · 0.3 kWh/m³', key: '7' },
  { id: 'elevate', name: 'Elevate asset +1.5 m', cost: 25e5, color: '#F1D9A0', specs: 'Raise a house tile on a plinth (₹25 lakh; other assets ×3)', key: '8' },
];

const M = {
  id: 'flood', name: 'Flood Defence', num: 4, viewType: 'iso', cols: COLS, rows: ROWS, budget: BUDGET,
  short: 'Protect a riverside town of 2,400 from a 100-year storm.',
  brief: `Sitapur sits on the right bank of the Ghora river. A ${CH.B} m channel carries about ${Math.round(manning(CH.B, CH.D, CH.D, CH.n))} m³/s before it spills; the 100-year storm peaks at ${STORMS[100].peak} m³/s. Choose levees, detention, channel works, pumps and elevation to keep water out of homes — and check the residual risk across the 10, 50 and 100-year storms. Budget ₹40 crore.`,
  constraints: [`Budget ${fmtLakh(BUDGET)}`, 'Levee must cover all 10 bank tiles — any gap lets the river in at 3.5 m', '72-hour storm, peak at 24 h', 'Damage = depth-damage curve × asset value', 'Residual risk = expected annual damage over the three storms'],
  palette: PALETTE,
  options: { label: 'Design storm', id: 'storm', values: [['100', '100-year (380 m³/s)'], ['50', '50-year (300 m³/s)'], ['10', '10-year (180 m³/s)']] },
  newDesign() { return { placed: {}, storm: '100' }; },
  cellLabel(d, c) { const p = d.placed[key(c.x, c.y)]; const f = fixedAt(c.x, c.y); const t = terrainAt(c.x, c.y);
    return `Tile ${c.x + 1},${c.y + 1}: ${p ? PALETTE.find(i => i.id === p).name : f === 'house' ? `houses (${HH_PER_TILE} households, ground ${elevOf(c.x).toFixed(2)} m)` : f === 'basinsite' ? 'detention basin site (B)' : f ? `${ASSET_NAME[f]} (ground ${elevOf(c.x).toFixed(2)} m)` : t === 'water' ? 'river' : t === 'sand' ? 'river bank (levee line)' : t === 'wet' ? 'left floodplain (farmland)' : `${t}, ground ${elevOf(c.x).toFixed(2)} m`}`; },
  place(d, id, c) {
    const k = key(c.x, c.y), t = terrainAt(c.x, c.y), f = fixedAt(c.x, c.y);
    if (d.placed[k]) return { ok: false, msg: `Tile already has ${PALETTE.find(i => i.id === d.placed[k]).name}.` };
    if (id.startsWith('levee')) { if (c.x !== BANK_X) return { ok: false, msg: 'Levees go on the sandy bank tiles between the river and the town (column 5).' }; }
    else if (id === 'basin') { if (f !== 'basinsite') return { ok: false, msg: 'Detention basins go on the three upstream sites marked B on the left floodplain.' }; }
    else if (id === 'dredge' || id === 'widen') { if (t !== 'water') return { ok: false, msg: 'Channel works go on river tiles.' }; }
    else if (id === 'pump') { if (t === 'water' || c.x < 5 || f) return { ok: false, msg: 'Pumps go on empty town tiles (right of the bank).' }; }
    else if (id === 'elevate') { if (!f || f === 'basinsite') return { ok: false, msg: 'Elevation applies to a house or asset tile.' }; }
    d.placed[k] = id;
    return { ok: true, msg: `Placed ${PALETTE.find(i => i.id === id).name} at ${c.x + 1},${c.y + 1} (${fmtLakh(M.itemCost(d, k))}). Spent ${fmtLakh(M.capex(d))} of ${fmtLakh(BUDGET)}.` };
  },
  itemCost(d, k) { const id = d.placed[k]; const it = PALETTE.find(i => i.id === id); if (id === 'elevate') { const [x, y] = k.split(',').map(Number); return fixedAt(x, y) === 'house' ? it.cost : it.cost * 3; } return it.cost; },
  remove(d, c) { const k = key(c.x, c.y); if (!d.placed[k]) return { ok: false, msg: 'Nothing to remove here.' }; const n = PALETTE.find(i => i.id === d.placed[k]).name; delete d.placed[k]; return { ok: true, msg: `Removed ${n}.` }; },
  inspect(d, c) { const k = key(c.x, c.y), p = d.placed[k], f = fixedAt(c.x, c.y);
    if (p) { const it = PALETTE.find(i => i.id === p); return { title: it.name, rows: [['Position', `${c.x + 1},${c.y + 1}`], ['Cost', fmtLakh(M.itemCost(d, k))], ['Specs', it.specs]], removable: true }; }
    if (f === 'house') return { title: 'Houses', rows: [['Households', HH_PER_TILE], ['Ground level', `${elevOf(c.x).toFixed(2)} m above channel bed`], ['Value at risk', fmtLakh(ASSET_VALUE.house)]] };
    if (f && f !== 'basinsite') return { title: ASSET_NAME[f], rows: [['Ground level', `${elevOf(c.x).toFixed(2)} m`], ['Value at risk', fmtLakh(ASSET_VALUE[f])], ['Note', f === 'substation' ? 'Flooding above 0.3 m cuts power to the whole town' : 'Critical facility']] };
    if (f === 'basinsite') return { title: 'Detention basin site', rows: [['Storage', '2.5 million m³ per basin'], ['Effect', `Diverts flow above ${DIVERT_Q} m³/s until full`]] };
    if (terrainAt(c.x, c.y) === 'water') return { title: 'Ghora river', rows: [['Channel', `${CH.B} m wide, ${CH.D} m deep, n = ${CH.n}, slope ${CH.S}`], ['Bankfull', `≈${Math.round(manning(CH.B, CH.D, CH.D, CH.n))} m³/s`]] };
    if (c.x === BANK_X) return { title: 'River bank', rows: [['Level', `${TOWN_BASE} m — the town floods above this without a levee`]] };
    return null; },
  list(d) { return Object.entries(d.placed).map(([k, id]) => { const [x, y] = k.split(',').map(Number); return `${PALETTE.find(i => i.id === id).name} at ${x + 1},${y + 1}`; }); },
  capex(d) { return Object.keys(d.placed).reduce((a, k) => a + M.itemCost(d, k), 0); },
  hud(d, r) { const cap = M.capex(d); return [
    { label: 'Spent', value: fmtLakh(cap), sub: `of ${fmtLakh(BUDGET)}`, bar: cap / BUDGET, cls: cap > BUDGET ? 'warn' : '' },
    { label: 'Peak level', value: r ? `${r.m.peak.toFixed(2)} m` : '—', cls: r ? (r.m.overtopH > 0 ? 'warn' : 'good') : '' },
    { label: 'Damage', value: r ? fmtLakh(r.m.damage) : '—', cls: r ? (r.m.damage > 0 ? 'warn' : 'good') : '' },
    { label: 'Protected', value: r ? `${fmt(r.m.protectedPop)} / ${fmt(POP)}` : '— / ' + fmt(POP) },
  ]; },
  makeView(W, H) { return I.makeView(W, H, COLS, ROWS); },
  hitTest(v, px, py) { return I.hitTest(v, px, py); },
  draw(ctx, v, d, t, cur, r, reduced) {
    const stormT = r && !reduced ? (t * 3) % HOURS : (r ? 24 : 0); // 24 s per storm
    const si = r ? Math.min(r.sim.h.length - 1, Math.floor(stormT / DT)) : 0;
    const level = r ? r.sim.h[si] : 1.2, townW = r ? r.sim.townW[si] : -1;
    const storm = r ? clamp01(r.sim.inflow[si] / 400) : 0;
    I.sky(ctx, v.W, v.H, 0.9 - 0.5 * storm, t); I.mapEdges(ctx, v, COLS, ROWS);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const tr = terrainAt(x, y);
      if (tr === 'water') { I.tileTop(ctx, v, x, y, I.mix('#2A8FD6', '#7A5A38', clamp01((level - 2) / 4)), 0); const c = I.toScreen(v, x + 0.5, y + 0.5, 0); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; for (let i = 0; i < 2; i++) { const ph = ((reduced ? 0.3 : t * (0.5 + storm)) + i * 0.5 + (x * 7 + y * 3) % 5 * 0.2) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.ellipse(c.X, c.Y - ph * v.th * 0.8, v.tw * 0.15, v.tw * 0.06, 0, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; }
      else I.terrainTile(ctx, v, x, y, tr, reduced ? 0 : t);
      // flood water over floodplain/town
      const isTown = x > BANK_X, isLeft = x < 2;
      let depth = 0;
      if (isTown && townW > 0) depth = Math.max(0, townW - elevOf(x) - (d.placed[key(x, y)] === 'elevate' ? 1.5 : 0));
      if (isLeft && level > CH.D) depth = level - CH.D;
      if (x === BANK_X && level > TOWN_BASE && !d.placed[key(x, y)]) depth = level - TOWN_BASE;
      if (depth > 0.02) { I.tileTop(ctx, v, x, y, `rgba(42,143,214,${clamp01(0.35 + depth * 0.3)})`, 0.01); }
      if (fixedAt(x, y) === 'basinsite' && !d.placed[key(x, y)]) I.label(ctx, v, x, y, 'B', 0.02, '#22D3C5');
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = key(x, y), p = d.placed[k], f = fixedAt(x, y);
      const elev = p === 'elevate' ? 0.12 : 0;
      if (elev) I.block(ctx, v, x + 0.1, y + 0.1, 0.8, 0.8, elev, { top: '#C9B27A' });
      if (f === 'house') I.house(ctx, v, x, y, { roof: (x + y) % 2 ? '#C9773A' : '#D9533A' }, elev);
      else if (f === 'clinic') I.bigBuilding(ctx, v, x, y, { sign: '+', signColor: '#E5484D' });
      else if (f === 'school') I.bigBuilding(ctx, v, x, y, { sign: 'S', signColor: '#2E6DB3', wall: '#F3D8A0', roof: '#E0B86A' });
      else if (f === 'market') I.bigBuilding(ctx, v, x, y, { sign: 'M', signColor: '#E08A00', wall: '#F1D9A0', roof: '#B4453A', h: 0.35 });
      else if (f === 'substation') { I.block(ctx, v, x + 0.2, y + 0.2, 0.6, 0.6, 0.2, { top: '#8B8F98' }); I.gridPole(ctx, v, x, y, !(r && r.m.substationOut)); }
      if (!p) continue;
      if (p.startsWith('levee')) I.levee(ctx, v, x, y, +p.slice(-1));
      else if (p === 'basin') { I.tileTop(ctx, v, x, y, '#1E6FB0', 0.005, '#0F2148'); const fill = r ? clamp01(r.sim.basinFill[si]) : 0.2; I.tileTop(ctx, v, x + (1 - fill) / 2, y + (1 - fill) / 2, '#2A8FD6', 0.01); I.label(ctx, v, x, y, 'BASIN', 0.3); }
      else if (p === 'dredge' || p === 'widen') { const c = I.toScreen(v, x + 0.5, y + 0.5, 0.02); ctx.strokeStyle = '#F4F1E8'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(c.X, c.Y, v.tw * 0.32, v.tw * 0.16, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); I.label(ctx, v, x, y, p === 'dredge' ? '+1 m' : '+10 m', 0.2); }
      else if (p === 'pump') I.pump(ctx, v, x, y, r ? r.sim.pumpOn[si] : false, t);
    }
    if (r && !reduced) { // rain
      ctx.strokeStyle = `rgba(200,220,255,${0.5 * storm})`; ctx.lineWidth = 1;
      for (let i = 0; i < 60 * storm; i++) { const rx = ((i * 131 + t * 300) % v.W), ry = ((i * 71 + t * 900) % v.H); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 12); ctx.stroke(); }
    }
    if (cur) I.cursor(ctx, v, cur.x, cur.y, '#FFB020', reduced ? 0 : t);
    ctx.fillStyle = 'rgba(6,14,34,.7)'; ctx.fillRect(10, v.H - 34, 236, 24); ctx.fillStyle = '#F4F1E8'; ctx.font = '700 13px "Chakra Petch", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(r ? `T+${stormT.toFixed(0)} h · river ${level.toFixed(2)} m · Q ${fmt(r.sim.inflow[si])} m³/s` : 'Run the simulation to see the storm', 18, v.H - 22);
  },
  simulate(d, attempt) {
    const T = +d.storm || 100;
    const cfg = configOf(d);
    const results = {}; for (const rp of [10, 50, 100]) results[rp] = route(cfg, rp);
    const base = {}; for (const rp of [10, 50, 100]) base[rp] = route(configOf({ placed: {} }), rp);
    const r = results[T], b = base[T];
    const noLevee = route({ ...cfg, crest: cfg.crest.map(() => TOWN_BASE), leveed: false }, T);
    const damage = r.damage, baseDamage = b.damage;
    const avoided = baseDamage > 0 ? clamp01(1 - damage / baseDamage) : 1;
    const ead = (res) => 0.5 * res[10].damage * (0.2 - 0.1) + 0.5 * (res[10].damage + res[50].damage) * (0.1 - 0.02) + 0.5 * (res[50].damage + res[100].damage) * (0.02 - 0.01) + res[100].damage * 0.01;
    const eadNow = ead(results), eadBase = ead(base);
    const cost = M.capex(d), over = cost - BUDGET;
    const protectedPop = r.protectedPop;
    const pumpKwh = r.pumpM3 * PUMP_KWH_M3;

    const sub = [
      { name: 'Damage avoided', weight: 0.35, value: avoided, explain: `${fmtLakh(damage)} vs ${fmtLakh(baseDamage)} unprotected in the ${STORMS[T].label} storm` },
      { name: 'Residual risk', weight: 0.25, value: eadBase > 0 ? clamp01(1 - eadNow / eadBase) : 1, explain: `expected annual damage ${fmtLakh(eadNow)} vs ${fmtLakh(eadBase)} (10/50/100-yr integrated)` },
      { name: 'Cost', weight: 0.20, value: over > 0 ? 0 : (1 - 0.6 * cost / BUDGET) * clamp01(avoided / 0.5), explain: over > 0 ? `over budget by ${fmtLakh(over)} → 0` : `(1 − 0.6 × ${fmtLakh(cost)} ÷ ${fmtLakh(BUDGET)}) × min(1, avoided ÷ 50%)` },
      { name: 'People protected', weight: 0.10, value: protectedPop / POP, explain: `${fmt(protectedPop)} of ${fmt(POP)} in homes with < 0.1 m water` },
      { name: 'Pump energy', weight: 0.10, value: clamp01(1 - pumpKwh / 50_000) * clamp01(avoided / 0.5), explain: `${fmt(pumpKwh)} kWh pumped this storm (full credit at 0, none at 50,000) × min(1, avoided ÷ 50%)` },
    ];
    const penalty = over > 0 ? 0.6 : 1; const si = weightedScore(sub, penalty); if (over > 0) si.penaltyNote = 'Over-budget penalty: total × 0.6';

    const fb = [];
    const minCrest = Math.min(...cfg.crest);
    if (cfg.leveed) {
      if (r.overtopH > 0) fb.push({ cls: 'bad', text: `Peak level ${r.peak.toFixed(2)} m overtops your ${minCrest.toFixed(1)} m levee for ${r.overtopH.toFixed(0)} hours; damage ${fmtLakh(damage)}.` });
      else fb.push({ cls: 'ok', text: `Peak level ${r.peak.toFixed(2)} m stays ${(minCrest - r.peak).toFixed(2)} m below the levee crest (${minCrest.toFixed(1)} m).` });
      const gaps = cfg.crest.map((c, i) => c === TOWN_BASE ? i + 1 : 0).filter(Boolean);
      if (gaps.length) fb.push({ cls: 'bad', text: `Levee gap at bank tile${gaps.length > 1 ? 's' : ''} row ${gaps.join(', ')}: the river enters the town at ${TOWN_BASE} m.` });
      if (r.peak - noLevee.peak > 0.05) fb.push({ cls: 'warn', text: `Confining the floodplain raised the peak river level by ${(r.peak - noLevee.peak).toFixed(2)} m (levee effect).` });
    } else fb.push({ cls: r.peak > TOWN_BASE ? 'bad' : 'ok', text: `No levee: peak level ${r.peak.toFixed(2)} m ${r.peak > TOWN_BASE ? `spills into the town (${(r.peak - TOWN_BASE).toFixed(2)} m over the bank); damage ${fmtLakh(damage)}` : 'stays within the bank'}.` });
    if (cfg.basins) fb.push({ cls: 'ok', text: `${cfg.basins} detention basin${cfg.basins > 1 ? 's' : ''} cut the peak from ${fmt(r.peakIn)} to ${fmt(r.peakRouted)} m³/s${r.basinFullAt != null ? ` (full at T+${r.basinFullAt.toFixed(0)} h)` : ''}.` });
    if (cfg.dredgePartial || cfg.widenPartial) fb.push({ cls: 'warn', text: `Channel works cover only part of the reach (${cfg.dredgeTiles} dredged, ${cfg.widenTiles} widened of 10 tiles): capacity is set by the narrowest section, so they have no effect yet.` });
    else if (cfg.dredge || cfg.widen) fb.push({ cls: 'ok', text: `Channel now ${cfg.B} m × ${cfg.D} m: bankfull capacity ${fmt(cfg.qBankfull)} m³/s.` });
    if (r.maxTownDepth > 0) fb.push({ cls: 'warn', text: `Town water peaks at ${r.maxTownDepth.toFixed(2)} m deep (lowest street); ${fmt(POP - protectedPop)} people in flooded homes.` });
    if (r.substationOut) fb.push({ cls: 'bad', text: 'The substation flooded above 0.3 m — power to the whole town is lost.' });
    if (cfg.pumps && r.pumpM3 > 0) fb.push({ cls: 'ok', text: `${cfg.pumps} pump${cfg.pumps > 1 ? 's' : ''} removed ${fmt(r.pumpM3)} m³ using ${fmt(pumpKwh)} kWh.` });
    fb.push({ cls: over > 0 ? 'bad' : 'ok', text: over > 0 ? `Spent ${fmtLakh(cost)} — over budget by ${fmtLakh(over)}.` : `Spent ${fmtLakh(cost)} of ${fmtLakh(BUDGET)}; residual expected annual damage ${fmtLakh(eadNow)}.` });

    const hints = [];
    if (!cfg.leveed && damage > 0) hints.push(`A continuous levee on all 10 bank tiles is the direct defence: the ${STORMS[T].label} peak is ${r.peak.toFixed(2)} m, so a 2 m levee (crest 5.5 m) would hold it if the level does not rise when confined.`);
    if (cfg.leveed && r.overtopH > 0) hints.push(`Raise the levee above ${r.peak.toFixed(2)} m, or lower the river: each basin shaves the routed peak; check the hydrograph chart.`);
    if (cfg.leveed && cfg.crest.some(c => c === TOWN_BASE)) hints.push('Close the levee gaps first — a levee with one gap protects nothing.');
    if (!cfg.basins && T >= 50) hints.push(`Detention basins (₹12 crore each) store 2.5 Mm³ upstream above ${DIVERT_Q} m³/s; two of them hold the 100-year peak down to ${DIVERT_Q} m³/s.`);
    if (results[100].damage > 0 && T !== 100) hints.push(`Your design is checked against all storms: the 100-year event still causes ${fmtLakh(results[100].damage)} — residual risk is 25% of the score.`);
    if (r.maxTownDepth > 0 && !cfg.pumps) hints.push('Once water is behind a levee it stays: a pump (10,000 m³/h) drains ponded water and cuts damage duration.');
    if (cfg.dredgePartial || cfg.widenPartial) hints.push('Finish the channel works on all 10 river-tile rows or remove them — partial works are money spent for nothing.');
    if (avoided > 0.95 && over <= 0 && cost > BUDGET * 0.6) hints.push('You are fully protected — now try to reach the same result cheaper (1 m less levee with one basin, or fewer pumps).');
    if (hints.length < 3) hints.push('Elevating the clinic and substation (+1.5 m) protects the highest-value assets even if the levee fails.');
    if (hints.length < 3) hints.push('Compare the 10-year storm: cheap measures that handle frequent floods often pay back faster than a full 100-year defence.');

    const rows = {
      cost: `${fmtLakh(cost)} protection works (budget ${fmtLakh(BUDGET)}) · pump energy ${fmt(pumpKwh)} kWh`,
      population: `${fmt(protectedPop)} of ${fmt(POP)} people protected in the ${STORMS[T].label} storm`,
      efficiency: `Damage avoided ${pct(avoided)} · ${fmtLakh(baseDamage - damage)} saved for ${fmtLakh(cost)} spent (benefit/cost ${cost > 0 ? ((baseDamage - damage) / cost).toFixed(2) : 'n/a'})`,
      reliability: `Residual expected annual damage ${fmtLakh(eadNow)} (was ${fmtLakh(eadBase)}) · 10-yr ${fmtLakh(results[10].damage)} · 50-yr ${fmtLakh(results[50].damage)} · 100-yr ${fmtLakh(results[100].damage)}`,
      environment: `Pump energy ${fmt(pumpKwh)} kWh (${fmt(pumpKwh * 0.71)} kg CO₂) · floodplain storage ${cfg.leveed ? 'reduced by the levee' : 'intact'}`,
      safety: cfg.leveed ? `Freeboard ${(minCrest - r.peak).toFixed(2)} m (crest ${minCrest.toFixed(1)} m vs peak ${r.peak.toFixed(2)} m)` : `n/a — no levee; peak ${r.peak.toFixed(2)} m vs bank ${TOWN_BASE} m`,
    };
    const extra = [`Channel ${cfg.B} m × ${cfg.D} m, bankfull ${fmt(cfg.qBankfull)} m³/s · inflow peak ${fmt(r.peakIn)} m³/s → routed ${fmt(r.peakRouted)} m³/s`, `Peak river level ${r.peak.toFixed(2)} m at T+${r.peakAt.toFixed(0)} h · overtopping ${r.overtopH.toFixed(1)} h · town peak depth ${r.maxTownDepth.toFixed(2)} m`, ...r.damages.filter(x => x.dmg > 0).slice(0, 12).map(x => `${x.name} at ${x.pos}: depth ${x.depth.toFixed(2)} m → ${pct(x.frac)} of ${fmtLakh(x.value)} = ${fmtLakh(x.dmg)}`)];
    const formula = 'Score = 100 × (0.35·Damage avoided + 0.25·Residual risk + 0.20·Cost + 0.10·People + 0.10·Energy)' + (over > 0 ? ' × 0.6' : '');
    const text = reportText(M.name, attempt, rows, sub, si, hints, formula, extra);
    const badges = []; if (avoided >= 0.999 && over <= 0) badges.push('Dry town'); if (results[100].damage === 0 && over <= 0) badges.push('100-year ready'); if (avoided > 0.9 && cost < BUDGET * 0.5) badges.push('Under budget');
    const step = Math.round(1 / DT), xl = r.h.filter((_, i) => i % step === 0).map((_, i) => i % 12 === 0 ? `${i}h` : '');
    const charts = [
      lineChartSVG([{ label: 'Inflow m³/s', values: r.inflow.filter((_, i) => i % step === 0), color: '#8FA0C9' }, { label: 'Routed m³/s', values: r.outflow.filter((_, i) => i % step === 0), color: '#22D3C5', fill: true }], { title: 'Hydrograph', xLabels: xl, min: 0 }),
      lineChartSVG([{ label: 'River level m', values: r.h.filter((_, i) => i % step === 0), color: '#3C8BE0', fill: true }, { label: 'Town water m', values: r.townW.filter((_, i) => i % step === 0).map(w => Math.max(w, 0)), color: '#FF6B6B' }], { title: 'Water levels', xLabels: xl, hline: cfg.leveed ? minCrest : TOWN_BASE, hlineLabel: cfg.leveed ? 'levee crest' : 'bank', min: 0 }),
    ];
    return { score: si.score, stars: si.stars, subscores: sub, rows, feedback: fb, hints, text, badges, charts,
      historyKeys: { Storm: STORMS[T].label, Peak: r.peak.toFixed(2) + ' m', Damage: fmtLakh(damage), Spent: fmtLakh(cost) },
      m: { peak: r.peak, overtopH: r.overtopH, damage, protectedPop, substationOut: r.substationOut }, sim: r };
  }
};

function configOf(d) {
  const crest = []; for (let y = 0; y < ROWS; y++) { const p = d.placed[key(BANK_X, y)]; crest.push(TOWN_BASE + (p && p.startsWith('levee') ? +p.slice(-1) : 0)); }
  const leveed = crest.some(c => c > TOWN_BASE);
  const riverTiles = ROWS; let dredgeTiles = 0, widenTiles = 0;
  for (let y = 0; y < ROWS; y++) { let dd = false, ww = false; for (const x of RIVER_X) { const p = d.placed[key(x, y)]; if (p === 'dredge') dd = true; if (p === 'widen') ww = true; } if (dd) dredgeTiles++; if (ww) widenTiles++; }
  const dredge = dredgeTiles === riverTiles, widen = widenTiles === riverTiles;
  const B = CH.B + (widen ? 10 : 0), D = CH.D + (dredge ? 1 : 0);
  const basins = BASIN_SITES.filter(([x, y]) => d.placed[key(x, y)] === 'basin').length;
  const pumps = Object.values(d.placed).filter(p => p === 'pump').length;
  const elevated = new Set(Object.entries(d.placed).filter(([, p]) => p === 'elevate').map(([k]) => k));
  const qBankfull = manning(B, D, D, CH.n) ;
  return { crest, leveed, B, D, dredge, widen, dredgeTiles, widenTiles, dredgePartial: dredgeTiles > 0 && !dredge, widenPartial: widenTiles > 0 && !widen, basins, pumps, elevated, qBankfull, placed: d.placed };
}
function manning(B, h, D, n) { const A = B * Math.min(h, D) + (h > D ? B * (h - D) : 0); const P = B + 2 * Math.min(h, D); const R = A / P; return (1 / n) * A * Math.pow(R, 2 / 3) * Math.sqrt(CH.S); }
// rating: channel + floodplain flow (left always; right only when not leveed)
function outflowAt(h, cfg) { let Q = manning(cfg.B, h, cfg.D, CH.n); if (h > cfg.D) { const d = h - cfg.D; const Wfp = CH.fpLeft + (cfg.leveed ? 0 : CH.fpRight); Q += (1 / CH.nfp) * Wfp * d * Math.pow(d, 2 / 3) * Math.sqrt(CH.S); } return Q; }
function storageAt(h, cfg) { let A = cfg.B * Math.min(h, cfg.D); if (h > cfg.D) A += (cfg.B + CH.fpLeft + (cfg.leveed ? 0 : CH.fpRight)) * (h - cfg.D); return A * REACH_M; }
function levelForStorage(S, cfg) { let lo = 0, hi = 15; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (storageAt(mid, cfg) < S) lo = mid; else hi = mid; } return (lo + hi) / 2; }
function hydrograph(t, peak) { const x = t / TP; return BASE_Q + (peak - BASE_Q) * Math.pow(x, K) * Math.exp(K * (1 - x)); }

function route(cfg, rp) {
  const peak = STORMS[rp].peak;
  const townTiles = []; for (let y = 0; y < ROWS; y++) for (let x = BANK_X + 1; x < COLS; x++) townTiles.push({ x, y, elev: elevOf(x) });
  const townLevel = (V) => { // fill lowest tiles first
    const sorted = townTiles.map(t => t.elev).sort((a, b) => a - b); let lo = sorted[0], hi = sorted[0] + 10;
    const vol = (w) => sorted.reduce((a, e) => a + Math.max(0, w - e) * TILE_AREA, 0);
    if (V <= 0) return -1; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (vol(mid) < V) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const basinCap = cfg.basins * BASIN_M3; let basinV = 0, basinFullAt = null;
  let S = storageAt(1.0, cfg), Vtown = 0, pumpM3 = 0;
  const h = [], townW = [], inflow = [], outflow = [], pumpOn = [], basinFill = [];
  let peakH = 0, peakAt = 0, overtopH = 0, peakIn = 0, peakRouted = 0, maxDepth = 0;
  const depthMax = {};
  for (let t = 0; t <= HOURS; t += DT) {
    const I0 = hydrograph(t, peak); peakIn = Math.max(peakIn, I0);
    let Iin = I0;
    if (basinCap > basinV && I0 > DIVERT_Q) { const div = Math.min(I0 - DIVERT_Q, (basinCap - basinV) / (DT * 3600)); basinV += div * DT * 3600; Iin -= div; if (basinV >= basinCap - 1 && basinFullAt == null) basinFullAt = t; }
    peakRouted = Math.max(peakRouted, Iin);
    const level = levelForStorage(S, cfg);
    const O = outflowAt(level, cfg);
    // overtopping / spill into town
    let spill = 0;
    const wTown = townLevel(Vtown);
    if (cfg.leveed) { // broad-crested weir; once the town has filled to river level the head is gone (submerged)
      for (const c of cfg.crest) { const head = level - Math.max(c, wTown); if (level > c && head > 0) spill += 1.7 * TILE_M * Math.pow(head, 1.5); }
      if (cfg.crest.some(c => level > c)) overtopH += DT; }
    else if (level > TOWN_BASE) { // hydraulically connected: town level follows the river
      const wT = townLevel(Vtown); const target = level; if (target > wT) spill = Math.min((townTiles.reduce((a, tt) => a + Math.max(0, target - tt.elev) * TILE_AREA, 0) - Vtown) / (DT * 3600), 0.5 * O); }
    // drainage back when river below town level (flap outfall) + pumps
    let drain = 0; const wT0 = townLevel(Vtown);
    if (Vtown > 0 && wT0 > level) drain += cfg.leveed ? OUTFALL_M3S : Math.min(Vtown / (DT * 3600), 0.5 * O);
    let pumped = 0; if (Vtown > 0 && cfg.pumps) { pumped = Math.min(cfg.pumps * PUMP_M3H / 3600, Vtown / (DT * 3600)); }
    S += (Iin - O - spill) * DT * 3600; S = Math.max(storageAt(0.05, cfg), S);
    Vtown = Math.max(0, Vtown + (spill - drain - pumped) * DT * 3600); pumpM3 += pumped * DT * 3600;
    const wT = townLevel(Vtown);
    h.push(level); townW.push(wT); inflow.push(I0); outflow.push(O + spill); pumpOn.push(pumped > 0); basinFill.push(basinCap ? basinV / basinCap : 0);
    if (level > peakH) { peakH = level; peakAt = t; }
    for (const tt of townTiles) { const dep = wT - tt.elev; if (dep > 0) { const k = key(tt.x, tt.y); depthMax[k] = Math.max(depthMax[k] || 0, dep); maxDepth = Math.max(maxDepth, dep); } }
  }
  // damage
  const damages = []; let damage = 0, protectedPop = 0, substationOut = false;
  const dd = (x, y, name, type) => { const k = key(x, y); const raised = cfg.elevated.has(k) ? 1.5 : 0; const depth = Math.max(0, (depthMax[k] || 0) - raised); const frac = depth > 0 ? Math.min(1, 0.05 + 0.2 * Math.pow(depth, 0.8)) : 0; const value = ASSET_VALUE[type]; const dmg = frac * value; damage += dmg; damages.push({ name, pos: `${x + 1},${y + 1}`, depth, frac, value, dmg }); return depth; };
  for (const [x, y] of HOUSES) { const depth = dd(x, y, 'Houses', 'house'); if (depth < 0.1) protectedPop += PEOPLE_PER_TILE; }
  for (const [type, [x, y]] of Object.entries(ASSETS)) { const depth = dd(x, y, ASSET_NAME[type], type); if (type === 'substation' && depth > 0.3) substationOut = true; }
  return { h, townW, inflow, outflow, pumpOn, basinFill, peak: peakH, peakAt, overtopH, peakIn, peakRouted, maxTownDepth: maxDepth, damage, damages, protectedPop, substationOut, pumpM3, basinFullAt };
}
export default M;
