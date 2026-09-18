// MISSION 1 — VILLAGE POWER. Hourly 7-day microgrid dispatch with a real
// connectivity model, battery limits, seeded grid outages and a water sub-model.
import * as I from '../iso.js';
import { fmtINR, fmtLakh, pct, fmt, clamp01, weightedScore, reportText, rng, lineChartSVG, starsFor } from '../report.js';

const COLS = 12, ROWS = 10;
export const P = 1240, HOUSEHOLDS = 260, BUDGET = 60_00_000;
const HH_KWH_DAY = 1.6, CLINIC_KWH_DAY = 30, SCHOOL_KWH_DAY = 15;
const WATER_LPCD = 50, PUMP_KW = 3, PUMP_LPH = 12_000, TANK_L = 20_000, HEADER_L = 2_000;
const GRID_KW = 40, GRID_COST = 8, GRID_CO2 = 0.71, DIESEL_COST = 26, DIESEL_CO2 = 0.78, OM_FRAC = 0.015;
const DAYS = 7, HOURS = DAYS * 24;

const HH_SHAPE = [0.5, 0.4, 0.35, 0.35, 0.4, 0.6, 0.9, 1.0, 0.8, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.8, 1.3, 1.8, 2.0, 1.8, 1.4, 0.9, 0.6];
const CLINIC_SHAPE = [0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.5, 1.6, 1.6, 1.5, 1.4, 1.5, 1.5, 1.4, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5];
const SCHOOL_SHAPE = [0, 0, 0, 0, 0, 0, 0, 0.3, 1, 1, 1, 1, 1, 1, 0.8, 0.3, 0, 0, 0, 0, 0, 0, 0, 0];
const WATER_SHAPE = [0.1, 0.1, 0.1, 0.2, 0.6, 1.4, 1.8, 1.6, 1.0, 0.7, 0.6, 0.7, 0.6, 0.5, 0.5, 0.6, 1.0, 1.4, 1.5, 1.0, 0.6, 0.3, 0.2, 0.1];
// clear-sky irradiance shape (kW/m² ≈ per-kW output factor), peak-sun-hours ≈ 5.0
const IRR = [0, 0, 0, 0, 0, 0, 0.05, 0.2, 0.42, 0.63, 0.8, 0.92, 0.98, 0.92, 0.8, 0.63, 0.42, 0.2, 0.05, 0, 0, 0, 0, 0];
// wind capacity factor by hour (stronger afternoons/evenings)
const WIND = [0.22, 0.2, 0.2, 0.18, 0.18, 0.18, 0.2, 0.22, 0.25, 0.28, 0.32, 0.36, 0.4, 0.42, 0.42, 0.4, 0.38, 0.35, 0.32, 0.3, 0.28, 0.26, 0.24, 0.22];
const norm = (arr) => { const s = arr.reduce((a, b) => a + b, 0); return arr.map(v => v / s); };
const HH_N = norm(HH_SHAPE), CL_N = norm(CLINIC_SHAPE), SC_N = norm(SCHOOL_SHAPE), WA_N = norm(WATER_SHAPE);

const HOUSES = [[2, 1], [3, 1], [4, 1], [2, 3], [3, 3], [4, 3], [7, 1], [8, 1], [7, 3], [8, 3], [10, 3], [2, 6], [3, 6], [4, 6], [5, 7], [2, 7], [7, 6], [8, 6], [9, 6], [10, 6], [7, 8], [8, 8], [9, 8], [10, 8], [4, 9], [1, 8]];
const CLINIC = [9, 2], SCHOOL = [3, 8], WELL = [1, 4], GRIDPOLE = [11, 0];
const TREES = [[1, 1], [1, 2], [5, 2], [10, 1], [11, 3], [11, 7], [6, 9], [11, 9], [1, 6], [9, 4]];
const HH_PER_HOUSE = HOUSEHOLDS / HOUSES.length;

function terrainAt(x, y) {
  if (x === 0) return 'water';
  if (x === WELL[0] && y === WELL[1]) return 'dirt';
  if (y === 5 || x === 6) return 'road';
  return 'grass';
}
function fixedAt(x, y) {
  if (HOUSES.some(h => h[0] === x && h[1] === y)) return 'house';
  if (x === CLINIC[0] && y === CLINIC[1]) return 'clinic';
  if (x === SCHOOL[0] && y === SCHOOL[1]) return 'school';
  if (x === GRIDPOLE[0] && y === GRIDPOLE[1]) return 'gridpole';
  if (TREES.some(t => t[0] === x && t[1] === y)) return 'tree';
  return null;
}

const PALETTE = [
  { id: 'wire', name: 'Distribution line', cost: 15_000, color: '#8B5A2B', specs: 'Pole + LV line per tile. Loads must touch a line or a source tile.', key: '1' },
  { id: 'solar', name: 'Solar array 5 kW', cost: 2_00_000, color: '#1F3F8F', specs: '5 kWp · derating 0.80 · ≈20 kWh/day on a clear day', key: '2' },
  { id: 'wind', name: 'Wind turbine 10 kW', cost: 9_00_000, color: '#D8DCE4', specs: '10 kW · avg capacity factor ≈ 0.28 · generates at night too', key: '3' },
  { id: 'battery', name: 'Battery bank 10 kWh', cost: 1_20_000, color: '#2F8F5B', specs: '10 kWh · DoD 85% · round-trip 92% · 0.5C charge/discharge', key: '4' },
  { id: 'gen', name: 'Diesel generator 15 kW', cost: 3_20_000, color: '#8B8F98', specs: '15 kW · ₹26/kWh fuel · 0.78 kg CO₂/kWh · dispatched last', key: '5' },
  { id: 'pump', name: 'Well pump 3 kW', cost: 1_20_000, color: '#3C8BE0', specs: '12,000 L/h · 3 kW while running · only on the well tile (W)', key: '6' },
  { id: 'tank', name: 'Water tank 20,000 L', cost: 90_000, color: '#8FB7E8', specs: 'Lets the pump run when solar is abundant · gravity supply at night', key: '7' },
];
const CONDUCTIVE = new Set(['wire', 'solar', 'wind', 'battery', 'gen', 'pump', 'gridpole']);

function key(x, y) { return x + ',' + y; }

const M = {
  id: 'power', name: 'Village Power', num: 1, viewType: 'iso', cols: COLS, rows: ROWS, budget: BUDGET,
  short: 'Design a microgrid for 1,240 people with an unreliable grid.',
  brief: `Kesarpur has ${fmt(P)} people in ${HOUSEHOLDS} households, a clinic, a school and a well. The state grid reaches the village but is only available around 60% of the time. Design a distribution network and a generation mix that keeps the lights on, pumps ${fmt(P * WATER_LPCD)} L of water a day and stays within ₹60 lakh capital.`,
  constraints: [`Capital budget ${fmtLakh(BUDGET)}`, `Demand ≈ ${fmt(HOUSEHOLDS * HH_KWH_DAY + CLINIC_KWH_DAY + SCHOOL_KWH_DAY)} kWh/day + pumping`, 'Grid: 40 kW when available (~60% of hours)', 'Loads must be wired to a source', '7-day hourly simulation'],
  palette: PALETTE,

  newDesign() { return { placed: {} }; },
  cellLabel(d, c) { const p = d.placed[key(c.x, c.y)]; const f = fixedAt(c.x, c.y); const t = terrainAt(c.x, c.y);
    return `Tile ${c.x + 1},${c.y + 1}: ${p ? PALETTE.find(i => i.id === p).name : f ? ({ house: `houses (${Math.round(HH_PER_HOUSE)} households)`, clinic: 'clinic', school: 'school', gridpole: 'grid connection', tree: 'trees' })[f] : t === 'water' ? 'river' : t === 'dirt' ? 'well site' : t}`; },
  place(d, itemId, c) {
    const k = key(c.x, c.y), t = terrainAt(c.x, c.y), f = fixedAt(c.x, c.y);
    if (t === 'water') return { ok: false, msg: 'Cannot build in the river.' };
    if (f && f !== 'tree') return { ok: false, msg: `That tile is occupied by the ${f === 'gridpole' ? 'grid connection' : f}.` };
    if (d.placed[k]) return { ok: false, msg: `Tile already has a ${PALETTE.find(i => i.id === d.placed[k]).name}. Remove it first.` };
    if (itemId === 'pump' && !(c.x === WELL[0] && c.y === WELL[1])) return { ok: false, msg: 'The pump must sit on the well tile (marked W, next to the river).' };
    if (itemId !== 'pump' && c.x === WELL[0] && c.y === WELL[1]) return { ok: false, msg: 'The well tile is reserved for the pump.' };
    if (t === 'road' && itemId !== 'wire') return { ok: false, msg: 'Only distribution lines can run along the road.' };
    if (itemId === 'pump' && Object.values(d.placed).includes('pump')) return { ok: false, msg: 'There is only one well; one pump is enough.' };
    d.placed[k] = itemId;
    const item = PALETTE.find(i => i.id === itemId);
    return { ok: true, msg: `Placed ${item.name} at ${c.x + 1},${c.y + 1} (${fmtINR(item.cost)}). Capital used ${fmtLakh(M.capex(d))} of ${fmtLakh(BUDGET)}.` };
  },
  remove(d, c) { const k = key(c.x, c.y); if (!d.placed[k]) return { ok: false, msg: 'Nothing to remove on that tile.' };
    const n = PALETTE.find(i => i.id === d.placed[k]).name; delete d.placed[k]; return { ok: true, msg: `Removed ${n} from ${c.x + 1},${c.y + 1}.` }; },
  inspect(d, c) {
    const k = key(c.x, c.y), p = d.placed[k], f = fixedAt(c.x, c.y);
    if (p) { const it = PALETTE.find(i => i.id === p); return { title: it.name, rows: [['Position', `${c.x + 1},${c.y + 1}`], ['Cost', fmtINR(it.cost)], ['Specs', it.specs]], removable: true }; }
    if (f === 'house') return { title: 'Houses', rows: [['Households', Math.round(HH_PER_HOUSE)], ['Demand', `${(HH_PER_HOUSE * HH_KWH_DAY).toFixed(0)} kWh/day, evening peak`], ['Connection', 'Needs an adjacent line or source tile']] };
    if (f === 'clinic') return { title: 'Primary health clinic', rows: [['Demand', `${CLINIC_KWH_DAY} kWh/day (vaccine fridge runs all night)`], ['Connection', 'Needs an adjacent line or source tile']] };
    if (f === 'school') return { title: 'School', rows: [['Demand', `${SCHOOL_KWH_DAY} kWh/day, 07:00–16:00`]] };
    if (f === 'gridpole') return { title: 'Grid connection point', rows: [['Capacity', `${GRID_KW} kW import`], ['Availability', '≈60% of hours (seeded outages)'], ['Tariff', `₹${GRID_COST}/kWh · ${GRID_CO2} kg CO₂/kWh`], ['Note', 'Connect a line here to use it']] };
    if (c.x === WELL[0] && c.y === WELL[1]) return { title: 'Well site', rows: [['Water demand', `${fmt(P * WATER_LPCD)} L/day (${WATER_LPCD} L/person)`], ['Place', 'the Well pump here']] };
    if (terrainAt(c.x, c.y) === 'water') return { title: 'River', rows: [['Note', 'No construction in the river']] };
    return null;
  },
  list(d) { return Object.entries(d.placed).map(([k, id]) => { const [x, y] = k.split(',').map(Number); return `${PALETTE.find(i => i.id === id).name} at ${x + 1},${y + 1}`; }); },
  capex(d) { return Object.values(d.placed).reduce((a, id) => a + PALETTE.find(i => i.id === id).cost, 0); },
  hud(d, r) {
    const cap = M.capex(d);
    return [
      { label: 'Capital', value: `${fmtLakh(cap)}`, sub: `of ${fmtLakh(BUDGET)}`, bar: cap / BUDGET, cls: cap > BUDGET ? 'warn' : '' },
      { label: 'Served', value: r ? `${fmt(r.m.popServed)} / ${fmt(P)}` : '— / ' + fmt(P), cls: r && r.m.popServed >= P * 0.95 ? 'good' : '' },
      { label: 'Reliability', value: r ? pct(r.m.reliability, 1) : '—', cls: r ? (r.m.reliability >= 0.99 ? 'good' : r.m.reliability < 0.7 ? 'warn' : '') : '' },
      { label: 'CO₂ cut', value: r ? pct(r.m.co2Reduction) : '—' },
    ];
  },
  makeView(W, H) { return I.makeView(W, H, COLS, ROWS); },
  hitTest(v, px, py) { return I.hitTest(v, px, py); },

  draw(ctx, v, d, t, cur, r, reduced) {
    const hour = reduced ? 12 : (t * 2) % 24;                 // 12 s per simulated day
    const hi = Math.floor(hour);
    const day = I.dayFromHour(hour);
    I.sky(ctx, v.W, v.H, day, t);
    I.mapEdges(ctx, v, COLS, ROWS);
    const nets = analyseNetworks(d);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      I.terrainTile(ctx, v, x, y, terrainAt(x, y), reduced ? 0 : t);
      if (x === WELL[0] && y === WELL[1] && !d.placed[key(x, y)]) I.label(ctx, v, x, y, 'W', 0.02, '#22D3C5');
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = key(x, y), p = d.placed[k], f = fixedAt(x, y);
      const served = r ? (nets.loadNet[k] != null && r.sim.nets[nets.loadNet[k]] && r.sim.nets[nets.loadNet[k]].servedFrac > 0.5) : nets.loadNet[k] != null;
      if (f === 'house') I.house(ctx, v, x, y, { lit: served && day < 0.5, roof: (x * 3 + y) % 3 === 0 ? '#D9533A' : (x + y) % 2 ? '#C9773A' : '#B4453A' });
      else if (f === 'clinic') I.bigBuilding(ctx, v, x, y, { sign: '+', signColor: '#E5484D', roof: '#DCE7F5' });
      else if (f === 'school') I.bigBuilding(ctx, v, x, y, { sign: 'S', signColor: '#2E6DB3', wall: '#F3D8A0', roof: '#E0B86A' });
      else if (f === 'gridpole') I.gridPole(ctx, v, x, y, r ? r.sim.gridAvail[hi] : true);
      else if (f === 'tree' && !p) I.tree(ctx, v, x, y, x + y);
      if (!p) continue;
      const links = { n: isCond(d, x, y - 1), s: isCond(d, x, y + 1), e: isCond(d, x + 1, y), w: isCond(d, x - 1, y) };
      if (p === 'wire') I.pole(ctx, v, x, y, links);
      else {
        // draw wire stubs to neighbours from component tiles too
        if (links.e || links.s) I.pole(ctx, v, x, y, { e: links.e, s: links.s }, 'rgba(0,0,0,0)');
        const ni = nets.tileNet[k], sn = r && ni != null ? r.sim.nets[ni] : null;
        if (p === 'solar') I.solar(ctx, v, x, y);
        else if (p === 'wind') I.turbine(ctx, v, x, y, t, !reduced);
        else if (p === 'battery') I.battery(ctx, v, x, y, sn ? sn.socSeries[hi] : 0.5, reduced ? 0.5 : t);
        else if (p === 'gen') I.generator(ctx, v, x, y, sn ? sn.genSeries[hi] > 0 : false, t);
        else if (p === 'pump') I.pump(ctx, v, x, y, r ? r.sim.water.pumpOn[hi] : false, t);
        else if (p === 'tank') I.tank(ctx, v, x, y, r ? r.sim.water.levelSeries[hi] : 0.5);
      }
    }
    if (cur) I.cursor(ctx, v, cur.x, cur.y, '#FFB020', reduced ? 0 : t);
    I.nightOverlay(ctx, v.W, v.H, day);
    // clock
    ctx.fillStyle = 'rgba(6,14,34,.7)'; ctx.fillRect(10, v.H - 34, 132, 24);
    ctx.fillStyle = '#F4F1E8'; ctx.font = '700 13px "Chakra Petch", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`Day ${r ? (1 + Math.floor((t * 2) / 24) % DAYS) : 1} · ${String(hi).padStart(2, '0')}:00`, 18, v.H - 22);
  },

  simulate(d, attempt) {
    const nets = analyseNetworks(d);
    const rand = rng(20240913);
    // grid availability: two-state Markov chain, seeded → identical between runs
    const gridAvail = []; let up = true;
    for (let h = 0; h < HOURS; h++) { if (up && rand() < 0.09) up = false; else if (!up && rand() < 0.13) up = true; gridAvail.push(up); }
    const cloud = []; for (let dd = 0; dd < DAYS; dd++) cloud.push(0.65 + 0.35 * rand());
    const windVar = []; for (let dd = 0; dd < DAYS; dd++) windVar.push(0.7 + 0.6 * rand());

    const water = simulateWater(d, nets);
    const netResults = nets.nets.map((n, ni) => simulateNetwork(n, ni, nets, gridAvail, cloud, windVar, water));
    // aggregate
    const agg = { demand: 0, served: 0, solar: 0, wind: 0, batt: 0, grid: 0, gen: 0, curtailed: 0, hoursShort: 0 };
    for (const nr of netResults) for (const k of Object.keys(agg)) if (k !== 'hoursShort') agg[k] += nr[k];
    agg.hoursShort = new Set(netResults.flatMap(nr => nr.shortHours)).size;
    // unconnected loads
    const hhConnected = nets.nets.reduce((a, n) => a + n.houses, 0) * HH_PER_HOUSE;
    const hhUnconnected = HOUSEHOLDS - hhConnected;
    const unconnDemand = hhUnconnected * HH_KWH_DAY * DAYS + (nets.clinicNet == null ? CLINIC_KWH_DAY * DAYS : 0) + (nets.schoolNet == null ? SCHOOL_KWH_DAY * DAYS : 0);
    const demandTotal = agg.demand + unconnDemand;
    const reliability = demandTotal > 0 ? agg.served / demandTotal : 0;
    const relConnected = agg.demand > 0 ? agg.served / agg.demand : 0;
    let popServed = 0;
    nets.nets.forEach((n, ni) => { popServed += n.houses * HH_PER_HOUSE * (P / HOUSEHOLDS) * netResults[ni].servedFrac; });
    popServed = Math.round(Math.min(P, popServed));
    const capex = M.capex(d);
    const perYear = 365 / DAYS;
    const dieselKwhY = agg.gen * perYear, gridKwhY = agg.grid * perYear;
    const opex = dieselKwhY * DIESEL_COST + gridKwhY * GRID_COST + capex * OM_FRAC;
    const co2 = dieselKwhY * DIESEL_CO2 + gridKwhY * GRID_CO2;
    const baselineCo2 = demandTotal * perYear * DIESEL_CO2;
    // CO₂ avoided only counts for energy actually delivered: (served×diesel − actual) ÷ (demand×diesel)
    const co2Reduction = baselineCo2 > 0 ? clamp01((agg.served * perYear * DIESEL_CO2 - co2) / baselineCo2) : 0;
    const renewable = agg.served > 0 ? (agg.solar + agg.wind - agg.curtailed + agg.batt * 0) / Math.max(1, agg.served) : 0;
    const renFrac = clamp01(agg.served > 0 ? 1 - (agg.grid + agg.gen) / agg.served : 0);
    const overBudget = capex - BUDGET;

    // ---- subscores ----
    const sub = [
      { name: 'Reliability', weight: 0.30, value: reliability, explain: `${pct(reliability, 1)} of demand energy served over ${DAYS} days` },
      { name: 'Population served', weight: 0.20, value: popServed / P, explain: `${fmt(popServed)} of ${fmt(P)} people connected and supplied` },
      { name: 'Cost', weight: 0.20, value: overBudget > 0 ? 0 : (1 - 0.6 * capex / BUDGET) * clamp01(popServed / P / 0.5), explain: overBudget > 0 ? `over budget by ${fmtLakh(overBudget)} → 0` : `(1 − 0.6 × ${fmtLakh(capex)} ÷ ${fmtLakh(BUDGET)}) × min(1, served ÷ 50%)` },
      { name: 'Environment', weight: 0.20, value: co2Reduction, explain: `${pct(co2Reduction)} of diesel-only emissions avoided (credit only for energy served)` },
      { name: 'Water supply', weight: 0.10, value: water.servedFrac, explain: `${pct(water.servedFrac)} of daily water demand delivered` },
    ];
    const penalty = overBudget > 0 ? 0.6 : 1;
    const si = weightedScore(sub, penalty);
    if (overBudget > 0) si.penaltyNote = `Over-budget penalty: total × 0.6`;

    // ---- feedback ----
    const fb = [];
    fb.push({ cls: reliability >= 0.99 ? 'ok' : reliability >= 0.8 ? 'warn' : 'bad', text: `Your design supplies ${pct(reliability, 1)} of the required electricity (${fmt(agg.served / DAYS)} of ${fmt(demandTotal / DAYS)} kWh/day).` });
    if (hhUnconnected > 0.5) fb.push({ cls: 'bad', text: `${Math.round(hhUnconnected)} households are not connected to the distribution network.` });
    if (nets.clinicNet == null) fb.push({ cls: 'bad', text: 'The clinic is not connected — its vaccine fridge has no power.' });
    if (nets.schoolNet == null) fb.push({ cls: 'warn', text: 'The school is not connected.' });
    if (overBudget > 0) fb.push({ cls: 'bad', text: `Your system exceeds the budget by ${fmtINR(overBudget)}.` });
    else fb.push({ cls: 'ok', text: `Capital ${fmtLakh(capex)} is ${fmtLakh(BUDGET - capex)} under budget.` });
    for (const nr of netResults) {
      if (nr.battKwh > 0 && nr.firstEmpty != null) fb.push({ cls: 'warn', text: `Your battery system${nets.nets.length > 1 ? ` (network ${nr.ni + 1})` : ''} reaches empty at ${hhmm(nr.firstEmpty)} on day ${1 + Math.floor(nr.firstEmpty / 24)}.` });
      else if (nr.battKwh > 0 && nr.firstFull != null) fb.push({ cls: 'ok', text: `Battery${nets.nets.length > 1 ? ` (network ${nr.ni + 1})` : ''} first reaches full charge at ${hhmm(nr.firstFull)} on day ${1 + Math.floor(nr.firstFull / 24)} and never fully depletes.` });
      if (nr.sources === 0 && nr.houses + (nr.hasClinic ? 1 : 0) > 0) fb.push({ cls: 'bad', text: `Network ${nr.ni + 1} has loads but no generation source or grid connection.` });
    }
    if (agg.curtailed > 0.15 * (agg.solar + agg.wind) && (agg.solar + agg.wind) > 0) fb.push({ cls: 'warn', text: `${pct(agg.curtailed / (agg.solar + agg.wind))} of renewable energy was curtailed — not enough storage or daytime load.` });
    if (agg.gen > 0) fb.push({ cls: 'warn', text: `The diesel generator supplied ${fmt(agg.gen / DAYS)} kWh/day, burning ≈ ${fmtLakh(dieselKwhY * DIESEL_COST)} of fuel per year.` });
    if (!water.hasPump) fb.push({ cls: 'bad', text: 'No pump on the well: the village has no piped water.' });
    else if (water.servedFrac < 0.95) fb.push({ cls: 'warn', text: `Water supply met ${pct(water.servedFrac)} of demand — the pump ran ${water.pumpHoursPerDay.toFixed(1)} h/day (needs ${(P * WATER_LPCD / PUMP_LPH).toFixed(1)} h).` });
    else fb.push({ cls: 'ok', text: `Water demand fully met; pump ran ${water.pumpHoursPerDay.toFixed(1)} h/day.` });

    // ---- hints ----
    const hints = [];
    if (hhUnconnected > 0.5) hints.push(`Run distribution lines past the ${Math.round(hhUnconnected / HH_PER_HOUSE)} unconnected house tiles (₹15,000 each) — unconnected homes count as unserved.`);
    const sourceless = netResults.filter(nr => nr.sources === 0 && (nr.houses > 0 || nr.hasClinic));
    if (sourceless.length) hints.push(`${sourceless.length} wired network${sourceless.length > 1 ? 's have' : ' has'} no source: join ${sourceless.length > 1 ? 'them' : 'it'} to the main line or add generation there.`);
    const sourced = netResults.filter(nr => nr.sources > 0);
    const hoursShortSourced = new Set(sourced.flatMap(nr => nr.shortHours)).size;
    if (reliability < 0.95 && hoursShortSourced > 0) hints.push(`${hoursShortSourced} of ${HOURS} hours had shortfalls on powered networks, mostly ${shortWindow(sourced)}. Add storage for the evening peak or a dispatchable source.`);
    if (agg.curtailed > 0.1 * (agg.solar + agg.wind) && (agg.solar + agg.wind) > 0) hints.push('Curtailed solar is wasted capital: add batteries (₹1.2 lakh / 10 kWh) or shift the pump to daytime with a tank.');
    if (overBudget > 0) hints.push(`Remove ${fmtLakh(overBudget)} of equipment. Wind turbines are the most expensive item per kWh; the grid connection is free to use if wired.`);
    if (nets.gridNet == null) hints.push('The grid connection (top-right corner) is unused. A line to it gives 40 kW at ₹8/kWh when the grid is up (~60% of hours).');
    if (co2Reduction < 0.5 && agg.gen > 0) hints.push('Diesel dominates your emissions. Every 5 kW solar array displaces ≈20 kWh/day of diesel (≈5.7 t CO₂/year).');
    if (water.hasPump && water.servedFrac < 0.95 && water.tanks === 0) hints.push('Add a tank so the pump can run when solar is abundant and supply by gravity at night.');
    if (hints.length < 3) hints.push('Try trimming one battery or array at a time and re-run: the cost sub-score rewards the leanest design that still serves everyone.');
    if (hints.length < 3) hints.push('Watch the 24-hour chart: the evening peak (18:00–21:00) is where most designs fail.');

    const rows = {
      cost: `${fmtLakh(capex)} capex + ${fmtLakh(opex)} opex/yr = ${fmtLakh(capex + opex)} (budget ${fmtLakh(BUDGET)})`,
      population: `${fmt(popServed)} of ${fmt(P)} people (${pct(popServed / P)}) · ${Math.round(hhConnected)} of ${HOUSEHOLDS} households connected`,
      efficiency: `Renewable share ${pct(renFrac)} · curtailment ${pct((agg.solar + agg.wind) > 0 ? agg.curtailed / (agg.solar + agg.wind) : 0)} · water ${pct(water.servedFrac)}`,
      reliability: `${pct(reliability, 1)} energy served · ${HOURS - agg.hoursShort} of ${HOURS} hours without shortfall`,
      environment: `${fmt(co2 / 1000, 1)} t CO₂/yr vs ${fmt(baselineCo2 / 1000, 1)} t diesel-only baseline (−${pct(co2Reduction)})`,
      safety: 'n/a — no structural elements in this mission (electrical protection assumed)',
    };
    const extra = [
      `Generation (kWh/day): solar ${fmt(agg.solar / DAYS)} · wind ${fmt(agg.wind / DAYS)} · battery discharge ${fmt(agg.batt / DAYS)} · grid ${fmt(agg.grid / DAYS)} · diesel ${fmt(agg.gen / DAYS)} · curtailed ${fmt(agg.curtailed / DAYS)}`,
      `Consumption (kWh/day): ${fmt(demandTotal / DAYS)} required, ${fmt(agg.served / DAYS)} served`,
      `Networks: ${nets.nets.length} (${nets.nets.map((n, i) => `#${i + 1}: ${n.houses} house tiles, ${n.sources} sources${n.hasGrid ? ', grid' : ''}`).join('; ') || 'none'})`,
    ];
    const formula = 'Score = 100 × (0.30·Reliability + 0.20·Population + 0.20·Cost + 0.20·Environment + 0.10·Water)' + (overBudget > 0 ? ' × 0.6' : '');
    const text = reportText(M.name, attempt, rows, sub, si, hints, formula, extra);

    const badges = [];
    if (si.score >= 50 && overBudget <= 0) badges.push('Under budget');
    if (reliability >= 0.999) badges.push('100% reliability');
    if (agg.gen === 0 && reliability >= 0.9) badges.push('Zero diesel');
    if (hhUnconnected < 0.5 && nets.clinicNet != null && nets.schoolNet != null) badges.push('Every home connected');

    // charts: 24-h day-2 profile (demand vs supply) and battery SOC
    const dayIdx = 1;
    const demandDay = [], servedDay = [], solarDay = [], socDay = [];
    for (let h = 0; h < 24; h++) { const i = dayIdx * 24 + h; demandDay.push(netResults.reduce((a, n) => a + n.demandSeries[i], 0) + unconnDemand / HOURS); servedDay.push(netResults.reduce((a, n) => a + n.servedSeries[i], 0)); solarDay.push(netResults.reduce((a, n) => a + n.solarSeries[i], 0)); socDay.push(netResults.reduce((a, n) => a + n.socSeries[i] * n.battKwh, 0)); }
    const xl = Array.from({ length: 24 }, (_, i) => i % 6 === 0 ? String(i).padStart(2, '0') : '');
    const charts = [
      lineChartSVG([{ label: 'Demand kW', values: demandDay, color: '#FF6B6B' }, { label: 'Served kW', values: servedDay, color: '#3FD27A', fill: true }, { label: 'Solar+wind kW', values: solarDay, color: '#FFB020' }], { title: 'Day 2 hourly power', xLabels: xl, min: 0 }),
      lineChartSVG([{ label: 'Battery stored kWh', values: socDay, color: '#22D3C5', fill: true }], { title: 'Day 2 battery energy', xLabels: xl, min: 0 }),
    ];

    const sim = { gridAvail, nets: netResults, water };
    return { score: si.score, stars: si.stars, subscores: sub, rows, feedback: fb, hints, text, badges, charts,
      historyKeys: { Reliability: pct(reliability, 1), Served: fmt(popServed), Capex: fmtLakh(capex), 'CO₂ cut': pct(co2Reduction) },
      m: { popServed, reliability, capex, co2Reduction }, sim };
  }
};

function hhmm(h) { return String(h % 24).padStart(2, '0') + ':00'; }
function shortWindow(netResults) {
  const byHour = new Array(24).fill(0);
  for (const nr of netResults) nr.shortHours.forEach(h => byHour[h % 24]++);
  let best = 0, bi = 0; for (let i = 0; i < 24; i++) if (byHour[i] > best) { best = byHour[i]; bi = i; }
  return best ? `around ${hhmm(bi)}` : 'spread through the day';
}
function isCond(d, x, y) { if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false; if (fixedAt(x, y) === 'gridpole') return true; const p = d.placed[key(x, y)]; return !!p && CONDUCTIVE.has(p); }

// Connected components of conductive tiles; loads attach to the network of any adjacent conductive tile.
function analyseNetworks(d) {
  const tileNet = {}, nets = [];
  const cond = (x, y) => isCond(d, x, y);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = key(x, y); if (!cond(x, y) || tileNet[k] != null) continue;
    const ni = nets.length; const n = { tiles: [], houses: 0, hasClinic: false, hasSchool: false, hasGrid: false, solar: 0, wind: 0, batt: 0, gen: 0, pump: false, sources: 0 };
    nets.push(n);
    const stack = [[x, y]]; tileNet[k] = ni;
    while (stack.length) { const [cx, cy] = stack.pop(); n.tiles.push([cx, cy]);
      const p = d.placed[key(cx, cy)];
      if (fixedAt(cx, cy) === 'gridpole') n.hasGrid = true;
      if (p === 'solar') n.solar += 5; if (p === 'wind') n.wind += 10; if (p === 'battery') n.batt += 10; if (p === 'gen') n.gen += 15; if (p === 'pump') n.pump = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, nk = key(nx, ny); if (cond(nx, ny) && tileNet[nk] == null) { tileNet[nk] = ni; stack.push([nx, ny]); } }
    }
    n.sources = (n.solar > 0) + (n.wind > 0) + (n.gen > 0) + (n.hasGrid ? 1 : 0) + (n.batt > 0 ? 1 : 0);
  }
  const loadNet = {}; let clinicNet = null, schoolNet = null, gridNet = null;
  const attach = (x, y) => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = tileNet[key(x + dx, y + dy)]; if (ni != null) return ni; } return null; };
  for (const [x, y] of HOUSES) { const ni = attach(x, y); if (ni != null) { loadNet[key(x, y)] = ni; nets[ni].houses++; } }
  clinicNet = attach(...CLINIC); if (clinicNet != null) { nets[clinicNet].hasClinic = true; loadNet[key(...CLINIC)] = clinicNet; }
  schoolNet = attach(...SCHOOL); if (schoolNet != null) { nets[schoolNet].hasSchool = true; loadNet[key(...SCHOOL)] = schoolNet; }
  nets.forEach((n, i) => { if (n.hasGrid) gridNet = i; });
  return { nets, tileNet, loadNet, clinicNet, schoolNet, gridNet };
}

function simulateWater(d, nets) {
  const hasPump = Object.values(d.placed).includes('pump');
  const tanks = Object.values(d.placed).filter(p => p === 'tank').length;
  const cap = tanks * TANK_L + HEADER_L;
  const demandDay = P * WATER_LPCD;
  const pumpOn = new Array(HOURS).fill(false), levelSeries = new Array(HOURS).fill(0);
  let level = cap * 0.5, delivered = 0;
  const pumpNet = hasPump ? nets.tileNet[key(...WELL)] : null;
  const demAt = (h) => demandDay * WA_N[h % 24];
  // Pump policy: in daylight top the tank up (solar hours); at any hour run if the tank would
  // otherwise drop below 35% (or below this hour's demand). The pump runs a fraction of the hour
  // limited by tank headroom + what is drawn during the hour.
  const wantsAt = (h) => { const hod = h % 24, dem = demAt(h); return hasPump && (((hod >= 7 && hod <= 17) && level < cap * 0.98) || level - dem < Math.max(0.35 * cap, dem)); };
  const runFracAt = (h) => Math.max(0, Math.min(1, (cap - level + demAt(h)) / PUMP_LPH));
  return { hasPump, tanks, cap, demandDay, pumpOn, levelSeries, pumpNet, servedFrac: 0, pumpHoursPerDay: 0,
    wantsAt, runFracAt,
    // called once per hour by whichever network owns the pump (servedFrac = share of pump load actually powered)
    step(h, servedFrac) {
      const dem = demAt(h);
      const running = wantsAt(h) && servedFrac > 0.01;
      let pumped = 0;
      if (running) { pumped = PUMP_LPH * runFracAt(h) * servedFrac; pumpOn[h] = true; this.pumpHoursPerDay += runFracAt(h) * servedFrac / DAYS; }
      level += pumped;
      const got = Math.min(level, dem); level -= got; delivered += got;
      level = Math.min(level, cap);
      levelSeries[h] = level / cap;
      this.servedFrac = delivered / (demandDay * DAYS);
    }
  };
}

function simulateNetwork(n, ni, nets, gridAvail, cloud, windVar, water) {
  const battKwh = n.batt, usable = battKwh * 0.85, effC = Math.sqrt(0.92), effD = Math.sqrt(0.92), cRate = 0.5 * battKwh;
  let soc = usable * 0.8;
  const out = { ni, battKwh, demand: 0, served: 0, solar: 0, wind: 0, batt: 0, grid: 0, gen: 0, curtailed: 0, hoursShort: 0, shortHours: [], firstEmpty: null, firstFull: null,
    demandSeries: [], servedSeries: [], solarSeries: [], socSeries: [], genSeries: [], sources: n.sources, houses: n.houses, hasClinic: n.hasClinic, servedFrac: 0 };
  for (let h = 0; h < HOURS; h++) {
    const hod = h % 24, dd = Math.floor(h / 24);
    const solar = n.solar * IRR[hod] * 0.8 * cloud[dd];
    const wind = n.wind * WIND[hod] * windVar[dd];
    const firm = n.houses * HH_PER_HOUSE * HH_KWH_DAY * HH_N[hod] + (n.hasClinic ? CLINIC_KWH_DAY * CL_N[hod] : 0) + (n.hasSchool ? SCHOOL_KWH_DAY * SC_N[hod] : 0);
    const pumpLoad = (n.pump && water.wantsAt(h)) ? PUMP_KW * water.runFracAt(h) : 0;
    const load = firm + pumpLoad;
    const ren = solar + wind;
    let servedNow = 0, gridUsed = 0, genUsed = 0, curt = 0, battOut = 0;
    if (ren >= load) {
      servedNow = load;
      let surplus = ren - load;
      const charge = Math.min(surplus, cRate, (usable - soc) / effC);
      soc += charge * effC; surplus -= charge; curt = surplus;
    } else {
      servedNow = ren;
      let deficit = load - ren;
      const disc = Math.min(deficit, cRate, soc * effD);
      soc -= disc / effD; deficit -= disc; battOut = disc; servedNow += disc;
      if (n.hasGrid && gridAvail[h]) { gridUsed = Math.min(deficit, GRID_KW); deficit -= gridUsed; servedNow += gridUsed; }
      if (n.gen > 0) { genUsed = Math.min(deficit, n.gen); deficit -= genUsed; servedNow += genUsed; }
      if (deficit > 0.02 * load) { out.hoursShort++; out.shortHours.push(h); }
    }
    // opportunistic grid charging at night when the grid is up (cheap, keeps the battery ready for the evening peak)
    if (n.hasGrid && gridAvail[h] && soc < usable * 0.6 && ren < load) { const spare = Math.max(0, GRID_KW - gridUsed); const ch = Math.min(spare, cRate, (usable - soc) / effC); soc += ch * effC; gridUsed += ch; }
    if (battKwh > 0 && out.firstEmpty == null && soc <= usable * 0.02 && h > 0 && battOut > 0) out.firstEmpty = h;
    if (battKwh > 0 && out.firstFull == null && soc >= usable * 0.995) out.firstFull = h;
    const fracServed = load > 0 ? servedNow / load : 1;
    if (n.pump) water.step(h, pumpLoad > 0 ? fracServed : 0);
    out.demand += load; out.served += servedNow; out.solar += solar; out.wind += wind; out.batt += battOut; out.grid += gridUsed; out.gen += genUsed; out.curtailed += curt;
    out.demandSeries.push(load); out.servedSeries.push(servedNow); out.solarSeries.push(ren); out.socSeries.push(battKwh > 0 ? soc / usable : 0); out.genSeries.push(genUsed);
  }
  out.servedFrac = out.demand > 0 ? out.served / out.demand : (n.houses > 0 ? 0 : 1);
  return out;
}

// if there is no pump at all, water.step is never called → run it once so series exist
const _origSim = M.simulate;
M.simulate = function (d, attempt) {
  const r = _origSim.call(M, d, attempt);
  if (!r.sim.water.hasPump || r.sim.water.pumpNet == null) { for (let h = 0; h < HOURS; h++) r.sim.water.step(h, 0); r.subscores[4].value = r.sim.water.servedFrac; }
  return r;
};

export default M;
