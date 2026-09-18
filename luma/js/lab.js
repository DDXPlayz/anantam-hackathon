// LUMA laboratory controller — binds the experiment engines to the instrument-panel UI.
import { EXPERIMENTS, SUBJECTS, byId, DIFFICULTY } from './registry.js';
import * as store from './store.js';
import { prefs, bindPrefToggles, onPrefChange, announce } from './a11y.js';
import { drawCanvas, describe as describePlot } from './plot.js';
import { RNG, fmt } from './noise.js';
import { buildReportHTML, exportHTML, exportJSON, toCSV, download } from './report.js';

const $ = id => document.getElementById(id);
const el = {
  railGroups: $('rail-groups'), railSelect: $('rail-select'), appTitle: $('app-title'), ledRun: $('led-run'), ledPower: $('led-power'), clock: $('clock'),
  svg: $('apparatus'), appDesc: $('apparatus-desc'), grid: $('controls-grid'), comps: $('components'), compsTitle: $('components-title'), compsCount: $('components-count'), compsList: $('components-list'), btnAdd: $('btn-add-comp'),
  btnStart: $('btn-start'), btnPause: $('btn-pause'), btnStop: $('btn-stop'), btnStep: $('btn-step'), btnReset: $('btn-reset'), btnMeasure: $('btn-measure'), btnReport: $('btn-report'), msg: $('toolbar-msg'), btnResetParams: $('btn-reset-params'),
  task: $('task-strip'), taskEyebrow: $('task-eyebrow'), taskTitle: $('task-title'), taskText: $('task-text'), taskPrev: $('task-prev'), taskNext: $('task-next'),
  meters: $('meters'), warnings: $('warnings'), ledMeas: $('led-meas'), graphSelect: $('graph-select'), btnDescribe: $('btn-describe'), canvas: $('graph'), graphDesc: $('graph-desc'),
  table: $('data-table'), tableEmpty: $('table-empty'), btnCsv: $('btn-csv'), btnClear: $('btn-clear-rows'), rowCount: $('row-count'),
  noteText: $('note-text'), btnNote: $('btn-note'), notesList: $('notes-list'),
  dialog: $('report-dialog'), reportBody: $('report-body'), btnPrint: $('btn-print'), btnHtml: $('btn-dl-html'), btnJson: $('btn-dl-json'), btnClose: $('btn-close-report'),
};

const L = { exp: null, meta: null, params: {}, comps: [], rows: [], notes: [], state: null, running: false, paused: false, powered: false, raf: 0, last: 0, animT: 0, graphId: null, task: 0, rng: new RNG(), lastReadoutDom: 0, lastAnnounce: 0, lastGraph: 0, loading: false };

// ---------- rail ----------
function buildRail() {
  el.railGroups.innerHTML = '';
  el.railSelect.innerHTML = '';
  for (const s of SUBJECTS) {
    const g = document.createElement('div'); g.className = 'rail__group';
    const hd = document.createElement('h3'); hd.textContent = s.label; g.appendChild(hd);
    const ul = document.createElement('ul');
    const og = document.createElement('optgroup'); og.label = s.label;
    EXPERIMENTS.filter(e => e.subject === s.id).forEach(e => {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rail__btn'; b.dataset.id = e.id;
      b.innerHTML = `<span class="idx">${String(EXPERIMENTS.indexOf(e) + 1).padStart(2, '0')}</span><span>${e.title}</span>`;
      b.addEventListener('click', () => { location.hash = e.id; });
      li.appendChild(b); ul.appendChild(li);
      const o = document.createElement('option'); o.value = e.id; o.textContent = e.title; og.appendChild(o);
    });
    g.appendChild(ul); el.railGroups.appendChild(g); el.railSelect.appendChild(og);
  }
  el.railSelect.addEventListener('change', () => { location.hash = el.railSelect.value; });
}
function markRail(id) {
  el.railGroups.querySelectorAll('.rail__btn').forEach(b => { if (b.dataset.id === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  el.railSelect.value = id;
}

// ---------- loading an experiment ----------
async function openExperiment(id) {
  if (!byId[id]) id = EXPERIMENTS[0].id;
  if (L.loading) return; L.loading = true;
  stopRun(true);
  el.msg.textContent = '';
  try {
    const mod = await import(`./experiments/${id}.js`);
    L.exp = mod.default; L.meta = byId[id];
  } catch (e) {
    el.msg.textContent = `Could not load experiment "${id}".`; L.loading = false; return;
  }
  const saved = store.getExperiment(id);
  L.params = defaults(); if (saved.params) for (const k in saved.params) if (k in L.params) L.params[k] = saved.params[k];
  L.comps = L.exp.components ? (saved.components && Array.isArray(saved.components) ? saved.components.map(c => ({ ...c })) : initialComps()) : [];
  L.rows = Array.isArray(saved.rows) ? saved.rows : []; L.notes = Array.isArray(saved.notes) ? saved.notes : [];
  L.graphId = saved.graph && L.exp.graphs.some(g => g.id === saved.graph) ? saved.graph : L.exp.graphs[0].id;
  L.task = 0; L.powered = false; L.animT = 0;
  store.setExperiment(id, { params: L.params, components: L.comps });
  document.title = `${L.meta.title} — LUMA Laboratory`;
  el.appTitle.textContent = `${L.meta.title} · ${SUBJECTS.find(s => s.id === L.meta.subject).label} · ${DIFFICULTY[L.meta.difficulty]}`;
  markRail(id);
  buildControls(); buildGraphSelect(); resetState(); renderTable(); renderNotes(); updateToolbar(); renderTask();
  el.btnStep.hidden = !(L.exp.timed && prefs.rm);
  announce(`${L.meta.title} loaded. ${L.exp.describe(L.params, L.comps)}`, { minGap: 0 });
  L.loading = false;
}
function defaults() { const o = {}; for (const p of L.exp.params) o[p.id] = p.value; return o; }
function initialComps() { const C = L.exp.components; return C.defaults.slice(0, C.initial ?? C.defaults.length).map(c => ({ ...c })); }

// ---------- controls ----------
function buildControls() {
  el.grid.innerHTML = '';
  for (const p of L.exp.params) el.grid.appendChild(controlFor(p));
  const C = L.exp.components;
  if (C) {
    el.comps.hidden = false; el.compsTitle.textContent = C.label; el.btnAdd.textContent = C.addLabel || `Add ${C.singular.toLowerCase()}`;
    renderComponents();
  } else { el.comps.hidden = true; el.compsList.innerHTML = ''; }
  refreshEnabled();
}
function controlFor(p) {
  const wrap = document.createElement('div'); wrap.className = 'ctl' + (p.advanced ? ' is-advanced' : ''); wrap.dataset.param = p.id;
  const idBase = `p-${p.id}`;
  if (p.type === 'check') {
    wrap.classList.add('ctl--check');
    const inp = document.createElement('input'); inp.type = 'checkbox'; inp.id = idBase; inp.checked = !!L.params[p.id];
    const lab = document.createElement('label'); lab.htmlFor = idBase; lab.textContent = p.label;
    inp.addEventListener('change', () => setParam(p.id, inp.checked));
    wrap.append(inp, lab); return wrap;
  }
  const lab = document.createElement('label'); lab.className = 'ctl__label'; lab.htmlFor = idBase;
  lab.innerHTML = `<span>${p.label}</span>${p.unit ? `<span class="u">${p.unit}</span>` : ''}`;
  wrap.appendChild(lab);
  if (p.type === 'select') {
    const sel = document.createElement('select'); sel.id = idBase;
    for (const o of p.options) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; sel.appendChild(op); }
    sel.value = String(L.params[p.id]);
    sel.addEventListener('change', () => setParam(p.id, sel.value));
    wrap.appendChild(sel); return wrap;
  }
  const row = document.createElement('div'); row.className = 'ctl__row';
  const range = document.createElement('input'); range.type = 'range'; range.id = idBase; range.min = p.min; range.max = p.max; range.step = p.step; range.value = L.params[p.id];
  range.setAttribute('aria-valuetext', `${fmt(L.params[p.id], p.digits)} ${p.unit}`.trim());
  const num = document.createElement('input'); num.type = 'number'; num.min = p.min; num.max = p.max; num.step = p.step; num.value = L.params[p.id]; num.setAttribute('aria-label', `${p.label} value${p.unit ? ' in ' + p.unit : ''}`);
  range.addEventListener('input', () => { num.value = range.value; setParam(p.id, +range.value); range.setAttribute('aria-valuetext', `${fmt(+range.value, p.digits)} ${p.unit}`.trim()); });
  num.addEventListener('change', () => { let v = +num.value; if (!isFinite(v)) v = p.value; v = Math.min(p.max, Math.max(p.min, v)); num.value = v; range.value = v; setParam(p.id, v); range.setAttribute('aria-valuetext', `${fmt(v, p.digits)} ${p.unit}`.trim()); });
  row.append(range, num); wrap.appendChild(row); return wrap;
}
function refreshEnabled() {
  for (const p of L.exp.params) {
    if (!p.enabled) continue;
    const on = p.enabled(L.params);
    const wrap = el.grid.querySelector(`[data-param="${p.id}"]`); if (!wrap) continue;
    wrap.querySelectorAll('input,select').forEach(i => { i.disabled = !on; });
    wrap.style.opacity = on ? '' : '.45';
    wrap.title = on ? '' : 'Not adjustable in this process mode';
  }
}
function renderComponents() {
  const C = L.exp.components; el.compsList.innerHTML = '';
  el.compsCount.textContent = `${L.comps.length} of ${C.max}`;
  el.btnAdd.disabled = L.comps.length >= C.max;
  L.comps.forEach((c, i) => {
    const li = document.createElement('li');
    for (const t of C.template) {
      const id = `c-${i}-${t.id}`;
      const lab = document.createElement('label'); lab.className = 'ctl__label'; lab.htmlFor = id; lab.innerHTML = `<span>${C.singular} ${i + 1} — ${t.label}</span><span class="u">${t.unit}</span>`;
      const row = document.createElement('div'); row.className = 'ctl__row';
      const range = document.createElement('input'); range.type = 'range'; range.id = id; range.min = t.min; range.max = t.max; range.step = t.step; range.value = c[t.id]; range.setAttribute('aria-valuetext', `${fmt(c[t.id], t.digits)} ${t.unit}`);
      const num = document.createElement('input'); num.type = 'number'; num.min = t.min; num.max = t.max; num.step = t.step; num.value = c[t.id]; num.setAttribute('aria-label', `${C.singular} ${i + 1} ${t.label} value`);
      const upd = v => { v = Math.min(t.max, Math.max(t.min, +v || t.min)); c[t.id] = v; range.value = v; num.value = v; range.setAttribute('aria-valuetext', `${fmt(v, t.digits)} ${t.unit}`); paramsChanged(); };
      range.addEventListener('input', () => upd(range.value)); num.addEventListener('change', () => upd(num.value));
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn btn--sm'; rm.textContent = C.removeLabel || 'Remove'; rm.setAttribute('aria-label', `${C.removeLabel || 'Remove'} ${C.singular.toLowerCase()} ${i + 1}`); rm.disabled = L.comps.length <= C.min;
      rm.addEventListener('click', () => { L.comps.splice(i, 1); renderComponents(); paramsChanged(); announce(`${C.singular} ${i + 1} removed. ${L.comps.length} remaining.`, { minGap: 0 }); el.btnAdd.focus(); });
      row.append(range, num, rm); li.append(lab, row);
    }
    el.compsList.appendChild(li);
  });
}
el.btnAdd.addEventListener('click', () => {
  const C = L.exp.components; if (L.comps.length >= C.max) return;
  const d = C.defaults[L.comps.length] || C.defaults[C.defaults.length - 1]; L.comps.push({ ...d });
  renderComponents(); paramsChanged(); announce(`${C.singular} ${L.comps.length} added.`, { minGap: 0 });
  const last = el.compsList.querySelector('li:last-child input[type=range]'); if (last) last.focus();
});
function setParam(id, v) { L.params[id] = v; refreshEnabled(); paramsChanged(); }
function paramsChanged() {
  store.setExperiment(L.meta.id, { params: L.params, components: L.comps });
  if (L.exp.timed) { if (!L.running) resetState(); }
  else { renderAll(); }
  el.appDesc.textContent = L.exp.describe(L.params, L.comps);
}
el.btnResetParams.addEventListener('click', () => {
  L.params = defaults(); L.comps = L.exp.components ? initialComps() : [];
  buildControls(); paramsChanged(); announce('Parameters reset to defaults.', { minGap: 0, visual: true });
});

// ---------- state / run loop ----------
function env() { return { powered: L.powered, rm: prefs.rm, hc: prefs.hc, t: L.animT }; }
function resetState() {
  L.state = L.exp.init(L.params, L.comps); L.running = false; L.paused = false;
  renderAll(); updateToolbar();
}
function renderAll() {
  L.exp.render(el.svg, L.state, L.params, L.comps, env());
  el.appDesc.textContent = L.exp.describe(L.params, L.comps);
  renderReadouts(); renderGraph();
  el.clock.textContent = L.exp.timed ? `t = ${fmt(L.state.t, 2)} s` : '';
}
function startRun() {
  if (!L.exp.timed) { // power toggle
    L.powered = !L.powered; L.animT = 0;
    announce(L.powered ? `${L.exp.powerLabel || 'Power'}: on. ${readoutSummary()}` : 'Power off.', { minGap: 0 });
    updateToolbar(); renderAll();
    if (L.powered && L.exp.animate && !prefs.rm) { L.last = performance.now(); L.raf = requestAnimationFrame(tick); } else cancelAnimationFrame(L.raf);
    return;
  }
  if (L.exp.done(L.state, L.params, L.comps)) resetState();
  if (prefs.rm) { // stepwise: run to completion without animation
    let guard = 0; const dt = 0.25 * (L.exp.speed ? L.exp.speed(L.params) : 1);
    while (!L.exp.done(L.state, L.params, L.comps) && guard++ < 4000) L.exp.step(L.state, L.params, L.comps, dt);
    L.running = false; renderAll(); updateToolbar();
    announce(`Run complete (reduced motion: computed without animation). ${readoutSummary()}`, { minGap: 0, visual: true });
    return;
  }
  L.running = true; L.paused = false; L.last = performance.now(); cancelAnimationFrame(L.raf); L.raf = requestAnimationFrame(tick);
  announce('Run started.', { minGap: 0 }); updateToolbar();
}
function tick(now) {
  const real = Math.min(0.1, (now - L.last) / 1000); L.last = now; L.animT += real;
  if (L.exp.timed && L.running && !L.paused) {
    const dt = real * (L.exp.speed ? L.exp.speed(L.params) : 1);
    L.exp.step(L.state, L.params, L.comps, dt);
    el.clock.textContent = `t = ${fmt(L.state.t, 2)} s`;
    if (L.exp.done(L.state, L.params, L.comps)) { L.running = false; renderAll(); updateToolbar(); announce(`Run complete. ${readoutSummary()}`, { minGap: 0 }); return; }
  }
  L.exp.render(el.svg, L.state, L.params, L.comps, env());
  if (now - L.lastReadoutDom > 120) { renderReadouts(); L.lastReadoutDom = now; }
  if (now - L.lastGraph > 150 && currentGraph().live) { renderGraph(); L.lastGraph = now; }
  if (L.running && now - L.lastAnnounce > 3000) { announce(readoutSummary(3), { minGap: 2500 }); L.lastAnnounce = now; }
  if ((L.exp.timed && L.running) || (!L.exp.timed && L.powered && L.exp.animate && !prefs.rm)) L.raf = requestAnimationFrame(tick);
}
function pauseRun() { if (!L.running) return; L.paused = !L.paused; if (!L.paused) { L.last = performance.now(); L.raf = requestAnimationFrame(tick); } updateToolbar(); announce(L.paused ? 'Paused.' : 'Resumed.', { minGap: 0 }); }
function stopRun(silent) {
  cancelAnimationFrame(L.raf);
  if (L.exp && !L.exp.timed) { if (L.powered) { L.powered = false; if (!silent) announce('Power off.', { minGap: 0 }); } if (L.state) renderAll(); updateToolbar(); return; }
  if (L.running) { L.running = false; L.paused = false; if (!silent) announce('Run stopped.', { minGap: 0 }); }
  if (L.exp) { renderAll(); updateToolbar(); }
}
function stepRun() {
  if (!L.exp.timed) return;
  if (L.exp.done(L.state, L.params, L.comps)) { announce('Run already complete — press Reset to start again.', { minGap: 0, visual: true }); return; }
  const dt = 0.25 * (L.exp.speed ? L.exp.speed(L.params) : 1);
  L.exp.step(L.state, L.params, L.comps, dt); renderAll();
  announce(`Stepped to t = ${fmt(L.state.t, 2)} s. ${readoutSummary(3)}`, { minGap: 0 });
}
function updateToolbar() {
  const timed = L.exp.timed;
  el.btnPause.hidden = !timed; el.btnStep.hidden = !(timed && prefs.rm);
  if (timed) {
    const done = L.exp.done(L.state, L.params, L.comps);
    el.btnStart.textContent = done ? 'Run again' : L.running ? 'Running…' : 'Start';
    el.btnStart.disabled = L.running && !L.paused; el.btnPause.disabled = !L.running; el.btnPause.setAttribute('aria-pressed', String(L.paused)); el.btnPause.textContent = L.paused ? 'Resume' : 'Pause';
    el.btnStop.disabled = !L.running;
    el.ledRun.textContent = done ? 'complete' : L.paused ? 'paused' : L.running ? 'running' : 'idle';
    el.ledRun.className = 'led ' + (done ? 'led--on' : L.paused ? 'led--warn' : L.running ? 'led--busy' : '');
    el.ledPower.hidden = true;
  } else {
    el.btnStart.textContent = L.powered ? `${L.exp.powerLabel || 'Power'}: on` : (L.exp.powerLabel || 'Power on');
    el.btnStart.setAttribute('aria-pressed', String(L.powered)); el.btnStart.disabled = false;
    el.btnStop.disabled = !L.powered; el.btnStop.textContent = 'Power off';
    el.ledRun.textContent = L.powered ? 'live' : 'standby'; el.ledRun.className = 'led ' + (L.powered ? 'led--on' : '');
    el.ledPower.hidden = false; el.ledPower.textContent = L.powered ? 'power on' : 'power off'; el.ledPower.className = 'led ' + (L.powered ? 'led--on' : '');
  }
  if (timed) { el.btnStop.textContent = 'Stop'; el.btnStart.removeAttribute('aria-pressed'); }
}
el.btnStart.addEventListener('click', startRun); el.btnPause.addEventListener('click', pauseRun); el.btnStop.addEventListener('click', () => stopRun(false)); el.btnStep.addEventListener('click', stepRun);
el.btnReset.addEventListener('click', () => { cancelAnimationFrame(L.raf); L.powered = false; resetState(); el.msg.textContent = ''; announce('Apparatus reset.', { minGap: 0 }); });

// ---------- readouts ----------
function readoutList() { return L.exp.readouts(L.state, L.params, L.comps, env()); }
function renderReadouts() {
  const list = readoutList(); const frag = document.createDocumentFragment();
  for (const r of list) {
    const m = document.createElement('div'); m.className = 'meter' + (r.kind === 'theory' ? ' meter--theory' : r.kind === 'warn' ? ' meter--warn' : r.kind === 'err' ? ' meter--err' : '');
    m.innerHTML = `<div class="meter__label">${r.label}${r.kind === 'theory' ? ' <span aria-label="theoretical">(th)</span>' : ''}</div><div class="meter__value">${r.value}<span class="u">${r.unit || ''}</span></div>${r.note ? `<div class="meter__note">${r.note}</div>` : ''}`;
    frag.appendChild(m);
  }
  el.meters.replaceChildren(frag);
  const warns = L.exp.warnings(L.state, L.params, L.comps, env());
  el.warnings.replaceChildren(...warns.map(w => { const d = document.createElement('div'); d.className = 'warn-box' + (w.level === 'err' ? ' warn-box--err' : ''); d.setAttribute('role', w.level === 'err' ? 'alert' : 'status'); d.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/></svg><span><strong>${w.level === 'err' ? 'Error: ' : 'Warning: '}</strong>${w.text}</span>`; return d; }));
  el.ledMeas.textContent = `measurements: ${L.rows.length}`;
}
function readoutSummary(n = 4) { return readoutList().slice(0, n).map(r => `${r.label} ${r.value}${r.unit ? ' ' + r.unit : ''}`).join(', ') + '.'; }

// ---------- measurement ----------
el.btnMeasure.addEventListener('click', () => {
  const row = L.exp.measure(L.state, L.params, L.comps, L.rng, env());
  if (!row || row.error) { el.msg.textContent = row ? row.error : 'Cannot measure now.'; announce(row ? row.error : 'Cannot measure now.', { minGap: 0 }); return; }
  row._t = Date.now(); row._id = Math.random().toString(36).slice(2, 9);
  L.rows.push(row); el.msg.textContent = '';
  store.setExperiment(L.meta.id, { rows: L.rows });
  renderTable(); renderGraph(); renderReadouts();
  const cols = L.exp.columns.filter(c => c.kind === 'meas' || c.kind === 'err').slice(0, 4);
  announce(`Measurement ${L.rows.length} recorded: ` + cols.map(c => `${c.label} ${typeof row[c.id] === 'number' ? fmt(row[c.id], c.digits) : row[c.id]} ${c.unit || ''}`).join(', '), { minGap: 0, visual: true });
});

// ---------- table ----------
function renderTable() {
  const cols = L.exp.columns; const thead = el.table.tHead, tbody = el.table.tBodies[0];
  thead.innerHTML = `<tr><th scope="col">#</th>${cols.map(c => `<th scope="col">${c.label}${c.unit ? `<br>(${c.unit})` : ''}</th>`).join('')}<th scope="col"><span class="visually-hidden">Actions</span></th></tr>`;
  tbody.innerHTML = '';
  L.rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td>` + cols.map(c => { const v = r[c.id]; const cls = c.kind === 'meas' ? 'num-meas' : c.kind === 'theory' ? 'num-theory' : ''; return `<td class="${cls}">${typeof v === 'number' ? fmt(v, c.digits) : (v ?? '—')}</td>`; }).join('');
    const td = document.createElement('td'); const b = document.createElement('button'); b.type = 'button'; b.className = 'rowbtn'; b.textContent = 'Delete'; b.setAttribute('aria-label', `Delete row ${i + 1}`);
    b.addEventListener('click', () => { L.rows.splice(i, 1); store.setExperiment(L.meta.id, { rows: L.rows }); renderTable(); renderGraph(); renderReadouts(); announce(`Row ${i + 1} deleted. ${L.rows.length} rows remain.`, { minGap: 0 }); });
    td.appendChild(b); tr.appendChild(td); tbody.appendChild(tr);
  });
  el.tableEmpty.hidden = L.rows.length > 0; el.rowCount.textContent = `${L.rows.length} row${L.rows.length === 1 ? '' : 's'}`;
  el.btnCsv.disabled = !L.rows.length; el.btnClear.disabled = !L.rows.length;
}
el.btnCsv.addEventListener('click', () => { if (download(`luma-${L.meta.id}-data.csv`, toCSV(L.exp, L.rows), 'text/csv')) announce('CSV downloaded.', { minGap: 0, visual: true }); else el.msg.textContent = 'Download blocked by the browser.'; });
el.btnClear.addEventListener('click', () => { if (!L.rows.length) return; if (!confirm(`Delete all ${L.rows.length} measurements for ${L.meta.title}?`)) return; L.rows = []; store.setExperiment(L.meta.id, { rows: [] }); renderTable(); renderGraph(); renderReadouts(); announce('All measurements cleared.', { minGap: 0, visual: true }); });

// ---------- notes ----------
function renderNotes() {
  el.notesList.innerHTML = '';
  [...L.notes].reverse().forEach(n => {
    const li = document.createElement('li'); const d = new Date(n.t);
    li.innerHTML = `<div><time datetime="${d.toISOString()}">${d.toLocaleString()}</time><span></span></div>`; li.querySelector('span').textContent = n.text;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rowbtn'; b.textContent = 'Delete'; b.setAttribute('aria-label', `Delete observation from ${d.toLocaleTimeString()}`);
    b.addEventListener('click', () => { L.notes = L.notes.filter(x => x !== n); store.setExperiment(L.meta.id, { notes: L.notes }); renderNotes(); announce('Observation deleted.', { minGap: 0 }); });
    li.appendChild(b); el.notesList.appendChild(li);
  });
}
el.btnNote.addEventListener('click', () => {
  const t = el.noteText.value.trim(); if (!t) { announce('Type an observation first.', { minGap: 0, visual: true }); el.noteText.focus(); return; }
  L.notes.push({ t: Date.now(), text: t, params: { ...L.params } }); el.noteText.value = '';
  store.setExperiment(L.meta.id, { notes: L.notes }); renderNotes(); announce('Observation recorded.', { minGap: 0, visual: true });
});

// ---------- graph ----------
function buildGraphSelect() {
  el.graphSelect.innerHTML = '';
  for (const g of L.exp.graphs) { const o = document.createElement('option'); o.value = g.id; o.textContent = g.label; el.graphSelect.appendChild(o); }
  el.graphSelect.value = L.graphId; el.graphDesc.textContent = '';
}
function currentGraph() { return L.exp.graphs.find(g => g.id === L.graphId) || L.exp.graphs[0]; }
function graphSpec(g) { const b = g.build(L.rows, L.params, L.comps, L.state) || {}; return { xLabel: g.xLabel, yLabel: g.yLabel, zeroX: g.zeroX, zeroY: g.zeroY, series: b.series || [], fit: b.fit || null, xmin: b.xmin, xmax: b.xmax, ymin: b.ymin, ymax: b.ymax }; }
function renderGraph() { if (!L.exp) return; const spec = graphSpec(currentGraph()); drawCanvas(el.canvas, spec); el.canvas.setAttribute('aria-label', `${currentGraph().label}. ${describePlot(spec)}`); }
el.graphSelect.addEventListener('change', () => { L.graphId = el.graphSelect.value; store.setExperiment(L.meta.id, { graph: L.graphId }); el.graphDesc.textContent = ''; renderGraph(); });
el.btnDescribe.addEventListener('click', () => { const spec = graphSpec(currentGraph()); const t = describePlot(spec); el.graphDesc.textContent = t; });
let rsz; window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(renderGraph, 120); });

// ---------- report ----------
function reportOpts() {
  const graphSpecs = L.exp.graphs.filter(g => !g.live || L.state).map(g => ({ label: g.label, spec: graphSpec(g) })).filter(g => g.spec.series.some(s => s.points && s.points.length));
  return { meta: L.meta, exp: L.exp, params: L.params, comps: L.comps, rows: L.rows, notes: L.notes, analysis: L.exp.analyse(L.rows, L.params, L.comps), graphSpecs };
}
el.btnReport.addEventListener('click', () => {
  const opts = reportOpts();
  el.reportBody.innerHTML = buildReportHTML({ ...opts, theme: prefs.hc ? 'hc' : 'dark' });
  el.dialog.showModal(); el.btnClose.focus();
  announce(`Report generated. ${opts.analysis.conclusion}`, { minGap: 0 });
});
el.btnClose.addEventListener('click', () => el.dialog.close());
el.btnPrint.addEventListener('click', () => { const w = window.open('', '_blank'); if (!w) { el.msg.textContent = 'Pop-up blocked — use "Download HTML" and print that file.'; return; } w.document.write(exportHTML(reportOpts())); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); });
el.btnHtml.addEventListener('click', () => download(`luma-${L.meta.id}-report.html`, exportHTML(reportOpts()), 'text/html'));
el.btnJson.addEventListener('click', () => download(`luma-${L.meta.id}-report.json`, exportJSON(reportOpts()), 'application/json'));

// ---------- simplified-interface tasks ----------
function renderTask() {
  const tasks = L.exp.tasks || []; if (!tasks.length) { el.task.hidden = true; return; } el.task.hidden = false;
  L.task = Math.max(0, Math.min(tasks.length - 1, L.task)); const t = tasks[L.task];
  el.taskEyebrow.textContent = `Task ${L.task + 1} of ${tasks.length}`; el.taskTitle.textContent = t.title; el.taskText.textContent = t.text;
  el.taskPrev.disabled = L.task === 0; el.taskNext.disabled = L.task === tasks.length - 1;
  el.grid.querySelectorAll('.ctl').forEach(c => { c.style.outline = t.controls.includes(c.dataset.param) && prefs.simple ? '2px solid var(--amber)' : ''; c.style.outlineOffset = '4px'; });
}
el.taskPrev.addEventListener('click', () => { L.task--; renderTask(); announce(`${el.taskEyebrow.textContent}: ${el.taskTitle.textContent}. ${el.taskText.textContent}`, { minGap: 0 }); });
el.taskNext.addEventListener('click', () => { L.task++; renderTask(); announce(`${el.taskEyebrow.textContent}: ${el.taskTitle.textContent}. ${el.taskText.textContent}`, { minGap: 0 }); });

// ---------- preferences ----------
bindPrefToggles();
onPrefChange((k) => {
  if (!L.exp) return;
  if (k === 'rm') { el.btnStep.hidden = !(L.exp.timed && prefs.rm); if (prefs.rm) { cancelAnimationFrame(L.raf); if (L.running) { L.running = false; updateToolbar(); } } else if (!L.exp.timed && L.powered && L.exp.animate) { L.last = performance.now(); L.raf = requestAnimationFrame(tick); } }
  if (k === 'simple') renderTask();
  renderAll();
});

// ---------- boot ----------
buildRail();
function fromHash() { const id = location.hash.replace('#', '') || store.getLast() || EXPERIMENTS[0].id; if (!L.meta || L.meta.id !== id) openExperiment(id); }
window.addEventListener('hashchange', fromHash);
fromHash();
