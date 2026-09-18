// MISSION 3 — CLEAN WATER. A treatment train: stages placed on the process lane are ordered
// by position; contaminants are removed in series, capacity is the bottleneck stage, and
// disinfection performance depends on the turbidity reaching it.
import * as I from '../iso.js';
import { fmtINR, fmtLakh, pct, fmt, clamp01, weightedScore, reportText, lineChartSVG } from '../report.js';

const COLS = 12, ROWS = 8;
const N = 3800, LPCD = 40, DEMAND = N * LPCD; // L/day
const BUDGET = 18_00_000;
const SOURCE = { turb: 85, ecoli: 1200, as: 45, f: 1.8 };      // NTU, CFU/100 mL, µg/L, mg/L
const LIMIT = { turb: 1, ecoli: 1, as: 10, f: 1.5 };
const GRID_COST = 9, GRID_CO2 = 0.71, SOLAR_KWH_DAY = 20;

// Stage library. cap L/day per unit; removal: turb/as/f as fractions, ecoli as log10 units.
const STAGES = {
  pump: { name: 'Intake pump', cap: 240_000, capex: 1_80_000, opex: 20_000, kwh: 0.35, color: '#3C8BE0', rm: {}, specs: '10 m³/h · 0.35 kWh/m³ · required to lift river water', key: '1' },
  screen: { name: 'Intake screen', cap: 400_000, capex: 40_000, opex: 2_000, kwh: 0, color: '#8A8F9A', rm: { turb: 0.05 }, specs: 'Removes debris · without it the pump clogs (−30% capacity)', key: '2' },
  coag: { name: 'Coagulation + settling', cap: 120_000, capex: 2_60_000, opex: 60_000, kwh: 0.02, color: '#B98A4E', rm: { turb: 0.85, ecoli: 0.5, as: 0.6, f: 0.1 }, specs: 'Alum dosing + sedimentation · 85% turbidity · 60% arsenic (co-precipitation)', key: '3' },
  ssf: { name: 'Slow sand filter', cap: 60_000, capex: 1_80_000, opex: 15_000, kwh: 0, color: '#E5CF8B', rm: { turb: 0.9, ecoli: 2.0, as: 0.1 }, specs: '0.2 m/h · 2-log bacteria · clogs above 30 NTU inlet (½ capacity)', key: '4' },
  rsf: { name: 'Rapid sand filter', cap: 200_000, capex: 2_20_000, opex: 30_000, kwh: 0.05, color: '#D9B36A', rm: { turb: 0.8, ecoli: 0.5 }, specs: '5 m/h · needs coagulation upstream (else 50% turbidity)', key: '5' },
  gac: { name: 'Activated carbon', cap: 150_000, capex: 1_50_000, opex: 45_000, kwh: 0.02, color: '#3B3E45', rm: { turb: 0.1, as: 0.15, f: 0.05 }, specs: 'Taste/organics · minor arsenic · media replaced yearly', key: '6' },
  alumina: { name: 'Activated alumina', cap: 100_000, capex: 1_60_000, opex: 55_000, kwh: 0.02, color: '#DCE7F5', rm: { f: 0.9, as: 0.5 }, specs: '90% fluoride · 50% arsenic · regeneration chemicals', key: '7' },
  chlor: { name: 'Chlorination', cap: 500_000, capex: 60_000, opex: 25_000, kwh: 0.005, color: '#B9D46B', rm: { ecoli: 3.0 }, specs: '3-log bacteria if inlet ≤ 5 NTU (else 1-log) · leaves a residual', key: '8' },
  uv: { name: 'UV disinfection', cap: 150_000, capex: 1_40_000, opex: 20_000, kwh: 0.04, color: '#A78BFA', rm: { ecoli: 4.0 }, specs: '4-log bacteria if inlet ≤ 5 NTU (else 1.5-log) · needs power · no residual', key: '9' },
  ro: { name: 'Reverse osmosis', cap: 80_000, capex: 4_50_000, opex: 1_20_000, kwh: 2.5, color: '#22D3C5', rm: { turb: 0.99, ecoli: 4.0, as: 0.95, f: 0.95 }, specs: '2.5 kWh/m³ · 50% recovery · fouls above 5 NTU (½ capacity)', key: '0' },
  tank: { name: 'Storage tank 50,000 L', cap: Infinity, capex: 1_20_000, opex: 5_000, kwh: 0, color: '#8FB7E8', rm: {}, specs: 'Buffers pump/power outages · 12 h storage = full reliability', key: '' },
  solar: { name: 'Solar array 5 kW', cap: Infinity, capex: 2_00_000, opex: 3_000, kwh: 0, color: '#1F3F8F', rm: {}, specs: `≈${SOLAR_KWH_DAY} kWh/day offsets grid power (₹${GRID_COST}/kWh, ${GRID_CO2} kg CO₂/kWh)`, key: '' },
};
const PALETTE = Object.entries(STAGES).map(([id, s]) => ({ id, name: s.name, cost: s.capex, color: s.color, specs: `${s.cap !== Infinity ? fmt(s.cap) + ' L/day · ' : ''}${s.specs} · opex ${fmtINR(s.opex)}/yr`, key: s.key }));
const HOUSES = [[6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [3, 6], [4, 6], [11, 6]];
const TREES = [[0, 2], [0, 4], [0, 6], [11, 2], [1, 7], [5, 7]];
const key = (x, y) => x + ',' + y;
const terrainAt = (x, y) => y === 0 ? 'water' : (y === 2 || y === 3) && x >= 1 && x <= 10 ? 'concrete' : y === 5 && x >= 5 ? 'road' : 'grass';
const isLane = (x, y) => terrainAt(x, y) === 'concrete';
const fixedAt = (x, y) => HOUSES.some(h => h[0] === x && h[1] === y) ? 'house' : TREES.some(t => t[0] === x && t[1] === y) ? 'tree' : null;

const M = {
  id: 'water', name: 'Clean Water', num: 3, viewType: 'iso', cols: COLS, rows: ROWS, budget: BUDGET,
  short: 'Turn a turbid, contaminated river into safe water for 3,800 people.',
  brief: `Dhaneri draws water from a river carrying ${SOURCE.turb} NTU of silt, ${fmt(SOURCE.ecoli)} E. coli per 100 mL, ${SOURCE.as} µg/L arsenic and ${SOURCE.f} mg/L fluoride. Build a treatment train on the process lane (left → right = flow order) that delivers ${fmt(DEMAND)} L/day meeting drinking-water limits, within ${fmtLakh(BUDGET)}.`,
  constraints: [`Budget ${fmtLakh(BUDGET)}`, `Demand ${fmt(DEMAND)} L/day (${LPCD} L/person)`, `Limits: turbidity < ${LIMIT.turb} NTU · E. coli < ${LIMIT.ecoli}/100 mL · arsenic < ${LIMIT.as} µg/L · fluoride ≤ ${LIMIT.f} mg/L`, 'Stages on the lane run in x-order (left to right)', 'Same stage repeated = parallel units (capacity adds)'],
  palette: PALETTE,
  newDesign() { return { placed: {} }; },
  cellLabel(d, c) { const p = d.placed[key(c.x, c.y)]; const t = terrainAt(c.x, c.y); const f = fixedAt(c.x, c.y);
    return `Tile ${c.x + 1},${c.y + 1}: ${p ? STAGES[p].name : f === 'house' ? 'village houses' : t === 'water' ? 'river (source)' : t === 'concrete' ? 'process lane, position ' + c.x : t}`; },
  place(d, id, c) {
    const k = key(c.x, c.y), t = terrainAt(c.x, c.y);
    if (t === 'water') return { ok: false, msg: 'Cannot build in the river.' };
    if (fixedAt(c.x, c.y) === 'house') return { ok: false, msg: 'That tile has houses.' };
    if (d.placed[k]) return { ok: false, msg: `Tile already has ${STAGES[d.placed[k]].name}. Remove it first.` };
    const lane = isLane(c.x, c.y);
    if (!lane && !(id === 'solar' || id === 'tank')) return { ok: false, msg: 'Treatment stages must sit on the concrete process lane (rows 3–4). Solar and tanks can go anywhere on land.' };
    if (t === 'road') return { ok: false, msg: 'Keep the road clear.' };
    d.placed[k] = id;
    return { ok: true, msg: `Placed ${STAGES[id].name} at ${c.x + 1},${c.y + 1} (${fmtINR(STAGES[id].capex)}). Capital ${fmtLakh(M.capex(d))} of ${fmtLakh(BUDGET)}.` };
  },
  remove(d, c) { const k = key(c.x, c.y); if (!d.placed[k]) return { ok: false, msg: 'Nothing to remove here.' }; const n = STAGES[d.placed[k]].name; delete d.placed[k]; return { ok: true, msg: `Removed ${n}.` }; },
  inspect(d, c) { const p = d.placed[key(c.x, c.y)]; if (p) { const s = STAGES[p]; return { title: s.name, rows: [['Capacity', s.cap === Infinity ? 'n/a' : fmt(s.cap) + ' L/day'], ['Capex', fmtINR(s.capex)], ['Opex', fmtINR(s.opex) + '/yr'], ['Energy', s.kwh + ' kWh/m³'], ['Removes', Object.entries(s.rm).map(([k, v]) => k === 'ecoli' ? `E. coli ${v}-log` : `${{ turb: 'turbidity', as: 'arsenic', f: 'fluoride' }[k]} ${pct(v)}`).join(', ') || 'nothing (support stage)'], ['Notes', s.specs]], removable: true }; }
    if (terrainAt(c.x, c.y) === 'water') return { title: 'River source', rows: [['Turbidity', `${SOURCE.turb} NTU`], ['E. coli', `${fmt(SOURCE.ecoli)} CFU/100 mL`], ['Arsenic', `${SOURCE.as} µg/L`], ['Fluoride', `${SOURCE.f} mg/L`]] };
    if (fixedAt(c.x, c.y) === 'house') return { title: 'Dhaneri', rows: [['People', fmt(N)], ['Demand', `${fmt(DEMAND)} L/day`]] };
    if (isLane(c.x, c.y)) return { title: 'Process lane', rows: [['Order', `position ${c.x} of 10 (flow left → right)`]] };
    return null; },
  list(d) { const tr = train(d); return tr.order.map((id) => `${STAGES[id].name} × ${tr.count[id]} (train position ${tr.order.indexOf(id) + 1})`).concat(Object.entries(d.placed).filter(([, id]) => id === 'solar' || id === 'tank').map(([k, id]) => `${STAGES[id].name} at ${k.split(',').map(n => +n + 1).join(',')}`)); },
  capex(d) { return Object.values(d.placed).reduce((a, id) => a + STAGES[id].capex, 0); },
  hud(d, r) { const cap = M.capex(d); return [
    { label: 'Capital', value: fmtLakh(cap), sub: `of ${fmtLakh(BUDGET)}`, bar: cap / BUDGET, cls: cap > BUDGET ? 'warn' : '' },
    { label: 'Capacity', value: r ? `${fmt(r.m.capacity / 1000)} m³/d` : '—', cls: r ? (r.m.capacity >= DEMAND ? 'good' : 'warn') : '' },
    { label: 'Safe water', value: r ? (r.m.safe ? 'YES' : 'NO') : '—', cls: r ? (r.m.safe ? 'good' : 'warn') : '' },
    { label: 'Served', value: r ? `${fmt(r.m.popServed)} / ${fmt(N)}` : '— / ' + fmt(N) },
  ]; },
  makeView(W, H) { return I.makeView(W, H, COLS, ROWS); },
  hitTest(v, px, py) { return I.hitTest(v, px, py); },
  draw(ctx, v, d, t, cur, r, reduced) {
    I.sky(ctx, v.W, v.H, 0.95, t); I.mapEdges(ctx, v, COLS, ROWS);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { I.terrainTile(ctx, v, x, y, terrainAt(x, y), reduced ? 0 : t); if (isLane(x, y) && !d.placed[key(x, y)]) { const p = I.toScreen(v, x + 0.5, y + 0.5, 0); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = `700 ${Math.max(8, v.tw * 0.14)}px "Chakra Petch"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(x), p.X, p.Y); } }
    // pipes along the lane between consecutive stages
    const tr = train(d);
    const pts = tr.tiles;
    if (pts.length) { ctx.strokeStyle = '#BFC7D3'; ctx.lineWidth = Math.max(2, v.tw * 0.06); ctx.lineCap = 'round';
      const src = I.toScreen(v, pts[0][0] + 0.5, 0.5, 0.05); const first = I.toScreen(v, pts[0][0] + 0.5, pts[0][1] + 0.5, 0.05);
      ctx.beginPath(); ctx.moveTo(src.X, src.Y); ctx.lineTo(first.X, first.Y); for (let i = 1; i < pts.length; i++) { const p = I.toScreen(v, pts[i][0] + 0.5, pts[i][1] + 0.5, 0.05); ctx.lineTo(p.X, p.Y); } const last = pts[pts.length - 1]; const vill = I.toScreen(v, 8.5, 6.5, 0.05); ctx.lineTo(vill.X, vill.Y); ctx.stroke();
      if (r && r.m.capacity > 0 && !reduced) { // flowing dots
        const path = [src, first, ...pts.slice(1).map(p => I.toScreen(v, p[0] + 0.5, p[1] + 0.5, 0.05)), vill];
        let segs = []; let total = 0; for (let i = 1; i < path.length; i++) { const L = Math.hypot(path[i].X - path[i - 1].X, path[i].Y - path[i - 1].Y); segs.push({ a: path[i - 1], b: path[i], L }); total += L; }
        ctx.fillStyle = r.m.safe ? '#22D3C5' : '#B98A4E';
        for (let k = 0; k < 14; k++) { let s = ((t * 60 + k * total / 14) % total); for (const sg of segs) { if (s <= sg.L) { const f = s / sg.L; ctx.beginPath(); ctx.arc(sg.a.X + (sg.b.X - sg.a.X) * f, sg.a.Y + (sg.b.Y - sg.a.Y) * f, Math.max(2, v.tw * 0.04), 0, Math.PI * 2); ctx.fill(); break; } s -= sg.L; } }
      } }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const p = d.placed[key(x, y)], f = fixedAt(x, y);
      if (f === 'house') I.house(ctx, v, x, y, { roof: (x + y) % 2 ? '#C9773A' : '#D9533A' });
      else if (f === 'tree' && !p) I.tree(ctx, v, x, y, x * 3 + y);
      if (!p) continue;
      const s = STAGES[p];
      if (p === 'solar') I.solar(ctx, v, x, y);
      else if (p === 'tank') I.tank(ctx, v, x, y, r ? clamp01(r.m.storageHours / 12) : 0.5);
      else if (p === 'pump') I.pump(ctx, v, x, y, !!r && r.m.capacity > 0, t);
      else { I.block(ctx, v, x + 0.12, y + 0.12, 0.76, 0.76, p === 'ro' ? 0.4 : p === 'chlor' || p === 'uv' ? 0.25 : 0.3, { top: s.color, left: I.shade(s.color, -0.25), right: I.shade(s.color, -0.45) });
        if (p === 'coag' || p === 'ssf' || p === 'rsf') { const c = I.toScreen(v, x + 0.5, y + 0.5, p === 'coag' ? 0.31 : 0.31); ctx.fillStyle = p === 'coag' ? '#7A5A38' : '#2A8FD6'; ctx.beginPath(); ctx.ellipse(c.X, c.Y, v.tw * 0.28, v.tw * 0.14, 0, 0, Math.PI * 2); ctx.fill(); }
        I.label(ctx, v, x, y, { coag: 'COAG', ssf: 'SSF', rsf: 'RSF', gac: 'GAC', alumina: 'AA', chlor: 'Cl₂', uv: 'UV', ro: 'RO', screen: 'SCR' }[p] || p, 0.55); }
    }
    if (cur) I.cursor(ctx, v, cur.x, cur.y, '#FFB020', reduced ? 0 : t);
  },
  simulate(d, attempt) {
    const tr = train(d);
    const count = tr.count;
    const hasPump = !!count.pump, hasScreen = !!count.screen;
    // ---- capacity: bottleneck through the train (RO recovery halves what it can pass) ----
    let cap = hasPump ? STAGES.pump.cap * count.pump * (hasScreen ? 1 : 0.7) : 0;
    let bottleneck = hasPump ? 'intake pump' : 'no pump';
    const q = { ...SOURCE }; const notes = []; let coagUpstream = false;
    let kwhPerM3 = hasPump ? STAGES.pump.kwh : 0;
    const profile = [{ stage: 'Source', ...q }];
    for (const id of tr.order) {
      if (id === 'pump' || id === 'tank' || id === 'solar') continue;
      const s = STAGES[id]; let unitCap = s.cap * count[id]; let rm = { ...s.rm };
      if (id === 'ssf' && q.turb > 30) { unitCap *= 0.5; rm.turb = 0.7; notes.push(`Slow sand filter receives ${q.turb.toFixed(0)} NTU (>30): clogging halves its capacity and cuts removal to 70%.`); }
      if (id === 'rsf' && !coagUpstream) { rm.turb = 0.5; notes.push('Rapid sand filter has no coagulation upstream: turbidity removal drops to 50%.'); }
      if ((id === 'chlor' || id === 'uv') && q.turb > 5) { rm.ecoli = id === 'chlor' ? 1.0 : 1.5; notes.push(`${s.name} receives ${q.turb.toFixed(1)} NTU (>5): particles shield bacteria, only ${rm.ecoli}-log removal.`); }
      if (id === 'ro') { if (q.turb > 5) { unitCap *= 0.5; notes.push(`RO membranes foul at ${q.turb.toFixed(1)} NTU inlet: capacity halved.`); } cap = Math.min(cap * 0.5, unitCap); kwhPerM3 += s.kwh * 2; notes.push('RO recovery 50%: half the pumped water is rejected as brine.'); }
      else { if (unitCap < cap) { cap = unitCap; bottleneck = s.name; } kwhPerM3 += s.kwh; }
      if (id === 'ro' && unitCap < cap) bottleneck = s.name;
      if (id === 'coag') coagUpstream = true;
      q.turb *= 1 - (rm.turb || 0); q.as *= 1 - (rm.as || 0); q.f *= 1 - (rm.f || 0); q.ecoli *= Math.pow(10, -(rm.ecoli || 0));
      profile.push({ stage: s.name, turb: q.turb, ecoli: q.ecoli, as: q.as, f: q.f });
    }
    if (!hasPump) cap = 0;
    const meets = { turb: q.turb < LIMIT.turb, ecoli: q.ecoli < LIMIT.ecoli, as: q.as < LIMIT.as, f: q.f <= LIMIT.f };
    const safe = meets.turb && meets.ecoli && meets.as && meets.f;
    const storageL = (count.tank || 0) * 50_000, storageHours = DEMAND > 0 ? storageL / (DEMAND / 24) : 0;
    const reliability = cap > 0 ? 0.6 + 0.4 * clamp01(storageHours / 12) : 0;
    const coverage = clamp01(cap / DEMAND);
    const popServed = Math.round(N * coverage * reliability);
    const popSafe = safe ? popServed : 0;
    const m3day = Math.min(cap, DEMAND) / 1000;
    const kwhDay = m3day * kwhPerM3;
    const solarKwh = (count.solar || 0) * SOLAR_KWH_DAY;
    const gridKwh = Math.max(0, kwhDay - solarKwh);
    const capex = M.capex(d), opexYear = Object.values(d.placed).reduce((a, id) => a + STAGES[id].opex, 0) + gridKwh * 365 * GRID_COST;
    const co2 = gridKwh * 365 * GRID_CO2;
    const over = capex - BUDGET;
    const costPerM3 = m3day > 0 ? (capex / 15 + opexYear) / (m3day * 365) : 0; // 15-year life
    const qualityScore = ((meets.turb ? 1 : 0) + (meets.ecoli ? 2 : 0) + (meets.as ? 1 : 0) + (meets.f ? 1 : 0)) / 5;

    const sub = [
      { name: 'Water safety', weight: 0.35, value: cap > 0 ? qualityScore : 0, explain: cap > 0 ? `${Object.values(meets).filter(Boolean).length} of 4 limits met (bacteria counts double)` : 'no water produced' },
      { name: 'Coverage', weight: 0.25, value: popSafe / N, explain: `${fmt(popSafe)} of ${fmt(N)} people get safe water (capacity ${pct(coverage)} × reliability ${pct(reliability)}${safe ? '' : ', × 0 because unsafe'})` },
      { name: 'Cost', weight: 0.20, value: over > 0 ? 0 : (1 - 0.6 * capex / BUDGET) * clamp01(popSafe / N / 0.5), explain: over > 0 ? `over budget by ${fmtLakh(over)} → 0` : `(1 − 0.6 × ${fmtLakh(capex)} ÷ ${fmtLakh(BUDGET)}) × min(1, safe coverage ÷ 50%)` },
      { name: 'Energy', weight: 0.10, value: cap > 0 ? clamp01(1 - (gridKwh / Math.max(1, m3day)) / 2) : 0, explain: `${(gridKwh / Math.max(1, m3day)).toFixed(2)} grid kWh/m³ (full credit at 0, none at 2)` },
      { name: 'Reliability', weight: 0.10, value: reliability, explain: `${storageHours.toFixed(1)} h of storage → ${pct(reliability)}` },
    ];
    const penalty = over > 0 ? 0.6 : 1; const si = weightedScore(sub, penalty); if (over > 0) si.penaltyNote = 'Over-budget penalty: total × 0.6';

    const fb = [];
    if (!hasPump) fb.push({ cls: 'bad', text: 'No intake pump: nothing is lifted from the river, so the plant produces no water.' });
    else fb.push({ cls: cap >= DEMAND ? 'ok' : 'warn', text: `Capacity ${fmt(cap)} L/day vs demand ${fmt(DEMAND)} L/day — limited by the ${bottleneck}.` });
    if (cap > 0) {
      const say = (k, label, unit, val) => `${label} ${k === 'ecoli' ? (val < 1 ? '<1' : fmt(val)) : val.toFixed(k === 'turb' ? 1 : k === 'f' ? 2 : 0)} ${unit} (limit ${k === 'turb' ? '< ' + LIMIT.turb : k === 'ecoli' ? '< ' + LIMIT.ecoli : k === 'as' ? '< ' + LIMIT.as : '≤ ' + LIMIT.f})`;
      if (meets.turb && !meets.ecoli) fb.push({ cls: 'bad', text: `Your system meets turbidity targets but bacteria are not removed — ${say('ecoli', 'E. coli', 'CFU/100 mL', q.ecoli)}. Add disinfection.` });
      else fb.push({ cls: meets.ecoli ? 'ok' : 'bad', text: say('ecoli', 'E. coli', 'CFU/100 mL', q.ecoli) + (meets.ecoli ? ' ✓' : '') });
      fb.push({ cls: meets.turb ? 'ok' : 'bad', text: say('turb', 'Turbidity', 'NTU', q.turb) + (meets.turb ? ' ✓' : '') });
      fb.push({ cls: meets.as ? 'ok' : 'bad', text: say('as', 'Arsenic', 'µg/L', q.as) + (meets.as ? ' ✓' : '') });
      fb.push({ cls: meets.f ? 'ok' : 'bad', text: say('f', 'Fluoride', 'mg/L', q.f) + (meets.f ? ' ✓' : '') });
    }
    notes.forEach(n => fb.push({ cls: 'warn', text: n }));
    if (over > 0) fb.push({ cls: 'bad', text: `Capital ${fmtLakh(capex)} exceeds the budget by ${fmtINR(over)}.` }); else fb.push({ cls: 'ok', text: `Capital ${fmtLakh(capex)}, opex ${fmtLakh(opexYear)}/yr → ≈ ₹${costPerM3.toFixed(1)} per m³ over 15 years.` });
    if (cap > 0 && storageHours < 12) fb.push({ cls: 'warn', text: `${storageHours.toFixed(1)} h of storage: outages interrupt supply (reliability ${pct(reliability)}).` });

    const hints = [];
    if (!hasPump) hints.push('Place an Intake pump on the lane first — every train starts with lifting water.');
    if (hasPump && !hasScreen) hints.push('An intake screen (₹40,000) stops the pump clogging and restores 30% of its capacity.');
    if (cap > 0 && cap < DEMAND) hints.push(`Add another ${bottleneck} unit in parallel: each adds ${STAGES[tr.order.find(id => STAGES[id].name === bottleneck) || 'pump']?.cap ? fmt(STAGES[tr.order.find(id => STAGES[id].name === bottleneck) || 'pump'].cap) + ' L/day' : 'capacity'}.`);
    if (cap > 0 && !meets.turb) hints.push(q.turb > 5 ? 'Turbidity is far too high: coagulation + settling (85%) followed by a sand filter (80–90%) brings 85 NTU below 1 NTU.' : 'Turbidity is close: a second filtration stage (slow sand after rapid sand) or GAC polishing gets under 1 NTU.');
    if (cap > 0 && !meets.ecoli) hints.push(q.turb > 5 ? 'Disinfection only works on clear water: cut turbidity below 5 NTU before chlorination or UV.' : 'Add chlorination (3-log) or UV (4-log) after the filters; the source needs ≈3.1-log total removal.');
    if (cap > 0 && !meets.as) hints.push('Arsenic: coagulation removes 60%, activated alumina 50%, RO 95%. Two of these in series get 45 µg/L under 10.');
    if (cap > 0 && !meets.f) hints.push('Fluoride 1.8 mg/L needs activated alumina (90%) or RO; sand filters do nothing for it.');
    if (cap > 0 && storageHours < 12) hints.push('Two storage tanks (100,000 L ≈ 16 h) lift reliability to 100% for ₹2.4 lakh.');
    if (gridKwh > 100) hints.push(`The plant draws ${fmt(gridKwh)} grid kWh/day; a 5 kW solar array offsets ${SOLAR_KWH_DAY} kWh/day, or replace RO with cheaper stages.`);
    if (hints.length < 3) hints.push('Check the concentration profile below: a stage that removes nothing you still need is wasted capital.');
    if (hints.length < 3) hints.push('Stage order matters: put settling before filters, filters before disinfection.');

    const rows = {
      cost: `${fmtLakh(capex)} capex + ${fmtLakh(opexYear)} opex/yr (budget ${fmtLakh(BUDGET)}) · ≈ ₹${costPerM3.toFixed(1)}/m³`,
      population: `${fmt(popSafe)} of ${fmt(N)} people with safe water (${pct(popSafe / N)})${!safe && popServed ? ` — ${fmt(popServed)} would receive unsafe water` : ''}`,
      efficiency: cap > 0 ? `Turbidity −${pct(1 - q.turb / SOURCE.turb, 1)} · E. coli −${(Math.log10(SOURCE.ecoli / Math.max(q.ecoli, 1e-6))).toFixed(1)} log · arsenic −${pct(1 - q.as / SOURCE.as)} · fluoride −${pct(1 - q.f / SOURCE.f)}` : 'n/a — no flow',
      reliability: `${pct(reliability)} (${storageHours.toFixed(1)} h storage) · capacity ${pct(coverage)} of demand`,
      environment: `${fmt(kwhDay)} kWh/day (${kwhPerM3.toFixed(2)} kWh/m³), ${fmt(solarKwh)} from solar → ${fmt(co2 / 1000, 1)} t CO₂/yr`,
      safety: cap > 0 ? `Water safety: ${safe ? 'ALL limits met' : Object.entries(meets).filter(([, v]) => !v).map(([k]) => ({ turb: 'turbidity', ecoli: 'bacteria', as: 'arsenic', f: 'fluoride' })[k]).join(', ') + ' over limit'}` : 'n/a — no water produced',
    };
    const extra = profile.map(p => `${p.stage.padEnd(24)} turb ${p.turb.toFixed(2)} NTU · E. coli ${p.ecoli < 1 ? '<1' : fmt(p.ecoli)} · As ${p.as.toFixed(1)} µg/L · F ${p.f.toFixed(2)} mg/L`);
    const formula = 'Score = 100 × (0.35·Safety + 0.25·Coverage + 0.20·Cost + 0.10·Energy + 0.10·Reliability)' + (over > 0 ? ' × 0.6' : '');
    const text = reportText(M.name, attempt, rows, sub, si, hints, formula, extra);
    const badges = []; if (safe && over <= 0 && popSafe >= N * 0.95) badges.push('Under budget'); if (safe && gridKwh === 0 && cap > 0) badges.push('Zero grid power'); if (safe && q.ecoli < 0.01) badges.push('Multi-barrier');
    const labels = profile.map(p => p.stage.split(' ')[0]);
    const charts = cap > 0 ? [lineChartSVG([{ label: 'Turbidity NTU', values: profile.map(p => p.turb), color: '#B98A4E', dots: true }], { title: 'Turbidity along the train', xLabels: labels, hline: LIMIT.turb, hlineLabel: 'limit 1 NTU', min: 0 }),
      lineChartSVG([{ label: 'log10 E. coli', values: profile.map(p => Math.log10(Math.max(p.ecoli, 0.01))), color: '#A78BFA', dots: true }], { title: 'Bacteria along the train (log scale)', xLabels: labels, hline: 0, hlineLabel: 'limit 1/100 mL', min: -2 })] : [];
    return { score: si.score, stars: si.stars, subscores: sub, rows, feedback: fb, hints, text, badges, charts,
      historyKeys: { Safe: safe ? 'yes' : 'no', Capacity: fmt(cap / 1000) + ' m³', Served: fmt(popSafe), Capex: fmtLakh(capex) },
      m: { capacity: cap, safe, popServed: popSafe, storageHours }, sim: {} };
  }
};
function train(d) {
  const tiles = Object.entries(d.placed).filter(([k, id]) => { const [x, y] = k.split(',').map(Number); return isLane(x, y) && id !== 'solar' && id !== 'tank'; }).map(([k, id]) => { const [x, y] = k.split(',').map(Number); return { x, y, id }; }).sort((a, b) => a.x - b.x || a.y - b.y);
  const order = [], count = {};
  for (const t of tiles) { if (!count[t.id]) { count[t.id] = 0; order.push(t.id); } count[t.id]++; }
  for (const id of Object.values(d.placed)) if (id === 'solar' || id === 'tank') count[id] = (count[id] || 0) + 1;
  return { order, count, tiles: tiles.map(t => [t.x, t.y]) };
}
export default M;
