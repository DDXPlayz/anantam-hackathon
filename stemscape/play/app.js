// STEMSCAPE game controller — world screen, mission screens, HUD, palette, inspector,
// keyboard tile cursor, aria-live mirroring, tutorial, run history and progress.
import * as Store from './store.js';
import * as I from './iso.js';
import { starString, lineChartSVG, esc, fmtLakh } from './report.js';

const MISSIONS = [
  { id: 'power', num: 1, name: 'Village Power', file: './missions/power.js', color: '#FFB020', world: { x: 3, y: 3 }, short: 'Microgrid for 1,240 people with an unreliable grid.' },
  { id: 'bridge', num: 2, name: 'Bridge Builder', file: './missions/bridge.js', color: '#22D3C5', world: { x: 9, y: 2 }, short: 'A truss across a 24 m gorge for a 12-tonne truck.' },
  { id: 'water', num: 3, name: 'Clean Water', file: './missions/water.js', color: '#3FD27A', world: { x: 4, y: 8 }, short: 'A treatment train for 3,800 people.' },
  { id: 'flood', num: 4, name: 'Flood Defence', file: './missions/flood.js', color: '#A78BFA', world: { x: 10, y: 8 }, short: 'Protect a riverside town from a 100-year storm.' },
];
const modules = {};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

const state = Store.load();
let screen = 'world';
let cur = null; // { meta, mod, design, results, cursor, hover, selected, mode, attempt }
let hoverMission = null, worldT0 = performance.now();
let rafId = 0, running = false, needsDraw = true;

// ---------------------------------------------------------------- progress helpers
const rec = (id) => Store.missionRecord(state, id);
function unlocked(i) { if (i === 0 || state.unlockAll) return true; return rec(MISSIONS[i - 1].id).stars >= 1; }
function totalStars() { return MISSIONS.reduce((a, m) => a + rec(m.id).stars, 0); }
function saveState() { if (!Store.save(state)) announce('Warning: progress could not be saved (storage unavailable).'); }
function announce(msg) { const el = $('status-line'); if (el) el.textContent = msg; }

// ---------------------------------------------------------------- animation loop
function tick() {
  rafId = 0;
  if (document.hidden) { running = false; return; }
  draw();
  if (!reduced) rafId = requestAnimationFrame(tick); else running = false;
}
function startLoop() { if (running) return; running = true; if (!rafId) rafId = requestAnimationFrame(tick); }
function stopLoop() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
function requestDraw() { needsDraw = true; if (reduced || !running) { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); }); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else { if (screen === 'world' || cur) startLoop(); } });

function draw() {
  const t = (performance.now() - worldT0) / 1000;
  if (screen === 'world') drawWorld(t); else if (cur) drawMission(t);
  needsDraw = false;
}

// ---------------------------------------------------------------- world screen
const WORLD = { cols: 14, rows: 12 };
function worldTerrain(x, y) {
  if ((y === 5 && x < 8) || (x === 8 && y >= 5 && y < 9) || (y === 9 && x > 8 && x < 12)) return 'water';
  if (x === 12 && y >= 1 && y <= 4) return 'water';
  if (x === 6 && y !== 5 && y < 9) return 'road';
  if (y === 2 && x > 6 && x < 12) return 'road';
  if (y >= 10 && x >= 3 && x <= 5) return 'wet';
  return 'grass';
}
function drawWorld(t) {
  const canvas = $('world-canvas'); const { ctx, W, H } = I.setupCanvas(canvas);
  const v = I.makeView(W, H, WORLD.cols, WORLD.rows, { padTop: 0.14 });
  const day = reduced ? 1 : 0.5 + 0.5 * Math.cos(t / 9);
  I.sky(ctx, W, H, Math.max(0.35, day), t); I.mapEdges(ctx, v, WORLD.cols, WORLD.rows);
  for (let y = 0; y < WORLD.rows; y++) for (let x = 0; x < WORLD.cols; x++) I.terrainTile(ctx, v, x, y, worldTerrain(x, y), reduced ? 0 : t);
  // bridge across the river at x=6,y=5
  const b1 = I.toScreen(v, 6, 5, 0.1), b2 = I.toScreen(v, 7, 5, 0.1), b3 = I.toScreen(v, 7, 6, 0.1), b4 = I.toScreen(v, 6, 6, 0.1);
  I.poly(ctx, [b1, b2, b3, b4], '#8B5A2B');
  const houses = [[2, 2], [3, 2], [2, 4], [4, 3], [10, 1], [11, 1], [9, 3], [10, 3], [2, 7], [3, 7], [4, 7], [2, 8], [10, 7], [11, 7], [9, 8], [11, 8], [12, 6], [9, 10], [10, 10]];
  const trees = [[0, 0], [1, 1], [5, 1], [0, 3], [5, 7], [7, 10], [13, 5], [13, 0], [1, 10], [12, 11], [7, 3]];
  for (let y = 0; y < WORLD.rows; y++) for (let x = 0; x < WORLD.cols; x++) {
    if (houses.some(h => h[0] === x && h[1] === y)) I.house(ctx, v, x, y, { lit: day < 0.5, roof: (x + y) % 2 ? '#C9773A' : '#D9533A' });
    if (trees.some(h => h[0] === x && h[1] === y)) I.tree(ctx, v, x, y, x + y);
    if (x === 4 && y === 1) I.turbine(ctx, v, x, y, t, !reduced);
    if (x === 3 && y === 4) I.solar(ctx, v, x, y);
    if (x === 5 && y === 9) I.tank(ctx, v, x, y, 0.7);
    if (x === 12 && y === 8) I.levee(ctx, v, x, y, 2);
    if (x === 12 && y === 7) I.levee(ctx, v, x, y, 2);
  }
  MISSIONS.forEach((m, i) => {
    const locked = !unlocked(i);
    I.marker(ctx, v, m.world.x, m.world.y, locked ? '#8FA0C9' : m.color, locked ? '🔒' : String(m.num), t, !reduced && !locked);
    if (hoverMission === m.id) I.cursor(ctx, v, m.world.x, m.world.y, m.color, t);
  });
  I.nightOverlay(ctx, W, H, Math.max(0.35, day));
  canvas._view = v;
}
function worldHit(ev) {
  const canvas = $('world-canvas'); const v = canvas._view; if (!v) return null;
  const r = canvas.getBoundingClientRect(); const px = ev.clientX - r.left, py = ev.clientY - r.top;
  // markers are drawn above their tile; test a generous area around each marker
  for (const m of MISSIONS) { const p = I.toScreen(v, m.world.x + 0.5, m.world.y + 0.5, 0); if (Math.abs(px - p.X) < v.tw * 0.35 && py < p.Y + v.th * 0.5 && py > p.Y - v.tw * 1.3) return m; }
  return null;
}
function renderMissionList() {
  const ul = $('mission-list'); ul.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const r = rec(m.id), lock = !unlocked(i);
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button'; b.className = lock ? 'locked' : ''; b.dataset.id = m.id;
    b.innerHTML = `<span class="n" aria-hidden="true">${lock ? '🔒' : m.num}</span><span class="t">Mission ${m.num}: ${esc(m.name)}<span class="s">${lock ? `Locked — earn 1 star in Mission ${m.num - 1}` : esc(m.short)}</span></span><span class="stars" aria-label="${r.stars} of 3 stars">${starString(r.stars).replace(/☆/g, '<span class="off">☆</span>')}</span>`;
    b.addEventListener('focus', () => showCard(m.id)); b.addEventListener('mouseenter', () => showCard(m.id));
    b.addEventListener('click', () => { if (lock) { showCard(m.id); announce(`Mission ${m.num} is locked. Earn one star in Mission ${m.num - 1} or enable free play.`); } else openMission(m.id); });
    li.appendChild(b); ul.appendChild(li);
  });
  $('progress-chip').textContent = `${totalStars()} / ${MISSIONS.length * 3} stars`;
  $('unlock-all').checked = !!state.unlockAll;
}
async function showCard(id) {
  hoverMission = id; requestDraw();
  const meta = MISSIONS.find(m => m.id === id); const i = MISSIONS.indexOf(meta); const r = rec(id);
  const card = $('mission-card');
  document.querySelectorAll('#mission-list button').forEach(b => b.setAttribute('aria-current', b.dataset.id === id ? 'true' : 'false'));
  const mod = await loadModule(meta);
  card.innerHTML = `<h3>Mission ${meta.num}: ${esc(mod.name)}</h3><p class="brief">${esc(mod.brief)}</p>
    <h4>Constraints</h4><ul>${mod.constraints.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    <dl><dt>Best score</dt><dd>${r.best} / 100 <span class="stars">${starString(r.stars)}</span></dd><dt>Attempts</dt><dd>${r.runs.length}</dd><dt>Status</dt><dd>${unlocked(i) ? 'Open' : `Locked — earn 1 star in Mission ${meta.num - 1}`}</dd></dl>
    ${r.badges.length ? `<div class="badges">${r.badges.map(b => `<span class="chip green">${esc(b)}</span>`).join('')}</div>` : ''}
    <div style="margin-top:10px"><button type="button" class="btn sm ${unlocked(i) ? '' : 'ghost'}" data-open="${id}" ${unlocked(i) ? '' : 'disabled'}>${r.runs.length ? 'Continue mission' : 'Start mission'}</button></div>`;
  card.querySelector('[data-open]').addEventListener('click', () => openMission(id));
}
async function loadModule(meta) { if (!modules[meta.id]) modules[meta.id] = (await import(meta.file)).default; return modules[meta.id]; }

// ---------------------------------------------------------------- mission screen
async function openMission(id) {
  const meta = MISSIONS.find(m => m.id === id);
  const mod = await loadModule(meta);
  const design = state.designs[id] || mod.newDesign();
  state.designs[id] = design;
  cur = { meta, mod, design, results: null, cursor: { x: Math.floor(mod.cols / 2), y: Math.floor(mod.rows / 2) }, hover: null, selected: mod.palette[0].id, mode: 'place', attempt: rec(id).runs.length };
  screen = 'mission';
  $('screen-world').hidden = true; $('screen-mission').hidden = false;
  $('mission-title').textContent = `Mission ${meta.num}: ${mod.name}`;
  $('brief-text').textContent = mod.brief; $('brief-constraints').innerHTML = mod.constraints.map(c => `<li>${esc(c)}</li>`).join('');
  $('brief-panel').hidden = rec(id).runs.length > 0; $('btn-brief').setAttribute('aria-expanded', String(!$('brief-panel').hidden));
  $('results').hidden = true;
  renderOptions(); renderPalette(); renderHUD(); renderInspector(null); renderPlaced(); renderBest(); renderHistory();
  announce(`Mission ${meta.num}: ${mod.name}. ${mod.palette[0].name} selected. Use the arrow keys and Enter to build, or click tiles.`);
  location.hash = id;
  worldT0 = performance.now();
  startLoop(); requestDraw();
  setTimeout(() => $('stage-canvas').focus({ preventScroll: true }), 50);
}
function backToWorld() { cur = null; screen = 'world'; $('screen-mission').hidden = true; $('screen-world').hidden = false; history.replaceState(null, '', location.pathname); renderMissionList(); startLoop(); requestDraw(); $('mission-list').querySelector('button')?.focus(); }

function renderOptions() {
  const box = $('mission-options'); box.innerHTML = '';
  const o = cur.mod.options; if (!o) return;
  const lbl = document.createElement('label'); lbl.className = 'chip'; lbl.style.gap = '8px'; lbl.textContent = o.label + ' ';
  const sel = document.createElement('select'); sel.style.cssText = 'background:var(--sky-2);border:1px solid var(--line);border-radius:8px;color:var(--text);padding:2px 6px;font-family:var(--font-hud)';
  o.values.forEach(([v, name]) => { const op = document.createElement('option'); op.value = v; op.textContent = name; if (cur.design[o.id] === v) op.selected = true; sel.appendChild(op); });
  sel.addEventListener('change', () => { cur.design[o.id] = sel.value; saveState(); announce(`${o.label} set to ${sel.options[sel.selectedIndex].text}. Run the simulation to see the effect.`); });
  lbl.appendChild(sel); box.appendChild(lbl);
}
function renderPalette() {
  const ul = $('palette'); ul.innerHTML = '';
  cur.mod.palette.forEach(item => {
    const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.dataset.id = item.id;
    b.setAttribute('aria-pressed', String(item.id === cur.selected));
    b.innerHTML = `<span class="sw" style="background:${item.color}" aria-hidden="true"></span><span class="nm">${esc(item.name)}${item.key ? `<span class="key">[${item.key}]</span>` : ''}<span class="sp">${esc(item.specs)}</span></span><span class="cost">${item.cost ? fmtLakh(item.cost) + (item.unit || '') : '—'}</span>`;
    b.addEventListener('click', () => { selectItem(item.id); if (cur.mode !== 'place') setMode('place'); });
    li.appendChild(b); ul.appendChild(li);
  });
  $('chip-selected').textContent = cur.mod.palette.find(p => p.id === cur.selected)?.name || 'Nothing selected';
}
function selectItem(id) { cur.selected = id; document.querySelectorAll('#palette button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id))); const it = cur.mod.palette.find(p => p.id === id); $('chip-selected').textContent = it.name; announce(`${it.name} selected${it.cost ? ` (${fmtLakh(it.cost)}${it.unit || ''})` : ''}. ${it.specs}`); }
function setMode(m) { cur.mode = m; document.querySelectorAll('.palette .modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); $('chip-mode').textContent = m[0].toUpperCase() + m.slice(1); }
function renderHUD() {
  const hud = $('hud'); const cells = cur.mod.hud(cur.design, cur.results); const r = rec(cur.meta.id);
  cells.push({ label: 'Best score', value: `${r.best} · ${starString(r.stars)}` });
  hud.innerHTML = cells.map(c => `<div class="cell ${c.cls || ''}"><span class="l">${esc(c.label)}</span><span class="v">${esc(String(c.value))}</span>${c.sub ? `<span class="l">${esc(c.sub)}</span>` : ''}${c.bar != null ? `<div class="bar" aria-hidden="true"><i class="${c.bar > 1 ? 'over' : ''}" style="width:${Math.min(100, c.bar * 100).toFixed(0)}%"></i></div>` : ''}</div>`).join('');
}
function renderInspector(cell) {
  const box = $('inspector'); const info = cell ? cur.mod.inspect(cur.design, cell) : null;
  if (!info) { box.innerHTML = `<h3 style="font-size:1rem;margin-bottom:6px">Inspector</h3><p class="empty">${cell ? esc(cur.mod.cellLabel(cur.design, cell)) : 'Move the cursor onto a tile and press I, or use Inspect mode.'}</p>`; return; }
  box.innerHTML = `<h3 style="font-size:1rem;margin-bottom:6px">Inspector</h3><strong>${esc(info.title)}</strong><dl>${info.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl>${info.removable ? `<div class="actions"><button type="button" class="btn sm danger" id="insp-remove">Remove</button></div>` : ''}`;
  box.querySelector('#insp-remove')?.addEventListener('click', () => { doRemove(cell); $('stage-canvas').focus(); });
}
function renderPlaced() { const ol = $('placed-list'); const items = cur.mod.list(cur.design); ol.innerHTML = items.length ? items.map(s => `<li>${esc(s)}</li>`).join('') : '<li>Nothing placed yet.</li>'; }
function renderBest() { const r = rec(cur.meta.id); $('mission-best').textContent = starString(r.stars); $('mission-best').setAttribute('aria-label', `${r.stars} of 3 stars, best ${r.best}`); }

function afterChange(msg) { saveState(); renderHUD(); renderPlaced(); requestDraw(); if (msg) announce(msg); }
function doPlace(cell) { const r = cur.mod.place(cur.design, cur.selected, cell); afterChange(r.msg); if (!r.ok) renderInspector(cell); }
function doRemove(cell) { const r = cur.mod.remove(cur.design, cell); afterChange(r.msg); renderInspector(null); }
function doInspect(cell) { renderInspector(cell); announce(cur.mod.cellLabel(cur.design, cell)); }
function act(cell) { if (cur.mode === 'remove') doRemove(cell); else if (cur.mode === 'inspect') doInspect(cell); else doPlace(cell); }
function moveCursor(dx, dy) { const c = cur.cursor; c.x = Math.max(0, Math.min(cur.mod.cols - 1, c.x + dx)); c.y = Math.max(0, Math.min(cur.mod.rows - 1, c.y + dy)); requestDraw(); announce(cur.mod.cellLabel(cur.design, c)); }

function drawMission(t) {
  const canvas = $('stage-canvas'); const { ctx, W, H } = I.setupCanvas(canvas);
  const v = cur.mod.makeView(W, H); canvas._view = v;
  cur.mod.draw(ctx, v, cur.design, t, cur.cursor, cur.results, reduced);
  if (cur.hover && (cur.hover.x !== cur.cursor.x || cur.hover.y !== cur.cursor.y)) {
    if (cur.mod.viewType === 'iso') { ctx.save(); ctx.globalAlpha = 0.5; I.cursor(ctx, v, cur.hover.x, cur.hover.y, '#F4F1E8', 0); ctx.restore(); }
  }
}
function canvasCell(ev) { const canvas = $('stage-canvas'); const v = canvas._view; if (!v) return null; const r = canvas.getBoundingClientRect(); return cur.mod.hitTest(v, ev.clientX - r.left, ev.clientY - r.top); }

// ---------------------------------------------------------------- run + results
function runSimulation() {
  if (!cur) return;
  cur.attempt = rec(cur.meta.id).runs.length + 1;
  const results = cur.mod.simulate(cur.design, cur.attempt);
  cur.results = results;
  const r = Store.recordRun(state, cur.meta.id, results);
  renderResults(results, r); renderHUD(); renderBest(); renderHistory(); requestDraw();
  const unlockedNext = results.stars >= 1 && MISSIONS.indexOf(cur.meta) < MISSIONS.length - 1;
  announce(`Simulation complete: score ${results.score} of 100, ${results.stars} star${results.stars === 1 ? '' : 's'}. ${results.feedback[0]?.text || ''}${unlockedNext ? ` Mission ${cur.meta.num + 1} is unlocked.` : ''}`);
  $('results').hidden = false; $('results').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => $('res-report').focus({ preventScroll: true }), 400);
}
function renderResults(res, r) {
  $('res-score').textContent = res.score; $('res-stars').textContent = starString(res.stars); $('res-stars').setAttribute('aria-label', `${res.stars} of 3 stars`);
  $('res-attempt').textContent = `Attempt #${cur.attempt}${res.score >= r.best && r.runs.length > 1 ? ' · new best' : ''}`;
  $('res-feedback').innerHTML = res.feedback.map(f => `<li class="${f.cls}">${esc(f.text)}</li>`).join('');
  $('res-formula').textContent = res.text.split('\n').find(l => l.startsWith('Score = ')) || '';
  $('res-subscores').innerHTML = res.subscores.map(s => `<li><span class="lbl">${esc(s.name)} <span style="color:var(--dim)">(${Math.round(s.weight * 100)}%)</span></span><span class="hud-num">${(Math.max(0, Math.min(1, s.value)) * 100).toFixed(0)}</span><span class="bar" aria-hidden="true"><i style="width:${(Math.max(0, Math.min(1, s.value)) * 100).toFixed(0)}%"></i></span><span class="exp">${esc(s.explain)}</span></li>`).join('');
  $('res-hints').innerHTML = res.hints.map(h => `<li>${esc(h)}</li>`).join('');
  $('res-charts').innerHTML = (res.charts || []).join('');
  $('res-report').textContent = res.text;
  $('res-badges').innerHTML = r.badges.map(b => `<span class="chip green">Badge: ${esc(b)}</span>`).join('');
}
function renderHistory() {
  const r = rec(cur.meta.id); const table = $('history-table');
  if (!r.runs.length) { $('history-chart').innerHTML = '<p style="color:var(--dim);margin:0">No runs yet.</p>'; table.querySelector('thead').innerHTML = ''; table.querySelector('tbody').innerHTML = ''; return; }
  $('history-chart').innerHTML = lineChartSVG([{ label: 'Score', values: r.runs.map(x => x.score), color: '#FFB020', dots: true }], { title: 'Score per attempt', min: 0, max: 100, height: 120, xLabels: r.runs.map(x => '#' + x.n) });
  const keys = Object.keys(r.runs[r.runs.length - 1].key || {});
  table.querySelector('thead').innerHTML = `<tr><th>#</th><th>Score</th>${keys.map(k => `<th>${esc(k)}</th>`).join('')}</tr>`;
  table.querySelector('tbody').innerHTML = r.runs.slice(-8).reverse().map(x => `<tr><td>${x.n}</td><td>${x.score} ${starString(x.stars)}</td>${keys.map(k => `<td>${esc(String(x.key?.[k] ?? '—'))}</td>`).join('')}</tr>`).join('');
}
function downloadReport() {
  if (!cur?.results) return;
  const blob = new Blob([cur.results.text], { type: 'text/plain' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `stemscape-${cur.meta.id}-attempt-${cur.attempt}.txt`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Report downloaded as a text file.');
}

// ---------------------------------------------------------------- events
function bind() {
  const wc = $('world-canvas');
  wc.addEventListener('mousemove', ev => { const m = worldHit(ev); const id = m ? m.id : null; if (id !== hoverMission) { if (id) showCard(id); else { hoverMission = null; requestDraw(); } } });
  wc.addEventListener('click', ev => { const m = worldHit(ev); if (!m) return; const i = MISSIONS.indexOf(m); if (unlocked(i)) openMission(m.id); else { showCard(m.id); announce(`Mission ${m.num} is locked.`); } });
  $('unlock-all').addEventListener('change', ev => { state.unlockAll = ev.target.checked; saveState(); renderMissionList(); requestDraw(); announce(state.unlockAll ? 'Free play enabled: all missions unlocked.' : 'Free play disabled: missions unlock in order.'); });
  $('btn-reset').addEventListener('click', () => { if (confirm('Reset all STEMSCAPE progress, designs and run history in this browser?')) { Store.reset(); location.reload(); } });
  $('btn-help').addEventListener('click', () => $('tutorial').showModal());
  $('tut-start').addEventListener('click', () => { state.tutorialSeen = true; saveState(); $('tutorial').close(); });
  $('tut-skip').addEventListener('click', () => { state.tutorialSeen = true; saveState(); $('tutorial').close(); });

  $('btn-world').addEventListener('click', backToWorld);
  $('btn-run').addEventListener('click', runSimulation);
  $('btn-clear').addEventListener('click', () => { if (!cur) return; if (!confirm('Clear the whole design for this mission? Run history is kept.')) return; cur.design = state.designs[cur.meta.id] = cur.mod.newDesign(); cur.results = null; $('results').hidden = true; afterChange('Design cleared.'); renderInspector(null); });
  $('btn-brief').addEventListener('click', () => { const p = $('brief-panel'); p.hidden = !p.hidden; $('btn-brief').setAttribute('aria-expanded', String(!p.hidden)); });
  document.querySelectorAll('.palette .modes button').forEach(b => b.addEventListener('click', () => { setMode(b.dataset.mode); announce(`${b.dataset.mode} mode.`); }));
  $('btn-download').addEventListener('click', downloadReport);
  $('btn-print').addEventListener('click', () => window.print());
  $('sheet-toggle').addEventListener('click', () => { const s = $('side'); s.classList.toggle('open'); $('sheet-toggle').setAttribute('aria-expanded', String(s.classList.contains('open'))); });
  $('side').addEventListener('click', ev => { if (ev.target.closest('#palette button') && window.innerWidth <= 820) { $('side').classList.remove('open'); $('sheet-toggle').setAttribute('aria-expanded', 'false'); } });

  const sc = $('stage-canvas');
  sc.addEventListener('mousemove', ev => { if (!cur) return; const c = canvasCell(ev); if ((c?.x !== cur.hover?.x) || (c?.y !== cur.hover?.y)) { cur.hover = c; requestDraw(); } });
  sc.addEventListener('mouseleave', () => { if (cur) { cur.hover = null; requestDraw(); } });
  sc.addEventListener('click', ev => { if (!cur) return; const c = canvasCell(ev); if (!c) return; cur.cursor = c; if (ev.shiftKey) doRemove(c); else act(c); sc.focus({ preventScroll: true }); });
  sc.addEventListener('contextmenu', ev => { if (!cur) return; ev.preventDefault(); const c = canvasCell(ev); if (c) { cur.cursor = c; doInspect(c); requestDraw(); } });
  sc.addEventListener('keydown', ev => {
    if (!cur) return;
    const k = ev.key;
    if (k === 'ArrowLeft') { moveCursor(-1, 0); } else if (k === 'ArrowRight') { moveCursor(1, 0); } else if (k === 'ArrowUp') { moveCursor(0, -1); } else if (k === 'ArrowDown') { moveCursor(0, 1); }
    else if (k === 'Enter' || k === ' ') { act(cur.cursor); }
    else if (k === 'Delete' || k === 'Backspace') { doRemove(cur.cursor); }
    else if (k === 'i' || k === 'I') { doInspect(cur.cursor); }
    else if (k === 'r' || k === 'R') { runSimulation(); }
    else if (k === 'Escape') { if (cur.design.pending) { cur.design.pending = null; afterChange('Pending member cancelled.'); } else { setMode('place'); announce('Place mode.'); } }
    else if (/^[0-9]$/.test(k)) { const it = cur.mod.palette.find(p => p.key === k); if (it) { selectItem(it.id); setMode('place'); } else return; }
    else return;
    ev.preventDefault();
  });
  // resize → redraw
  new ResizeObserver(() => requestDraw()).observe(document.body);
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && MISSIONS.some(m => m.id === id) && (!cur || cur.meta.id !== id)) { const i = MISSIONS.findIndex(m => m.id === id); if (unlocked(i)) openMission(id); } });
}

// ---------------------------------------------------------------- boot
function boot() {
  bind(); renderMissionList(); startLoop();
  if (!state.tutorialSeen) { try { $('tutorial').showModal(); } catch { /* dialog unsupported */ } }
  const id = location.hash.slice(1);
  if (id && MISSIONS.some(m => m.id === id)) { const i = MISSIONS.findIndex(m => m.id === id); if (unlocked(i)) openMission(id); }
  else showCard(MISSIONS[0].id);
}
boot();
