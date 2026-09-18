// PRISM — app controller: input → scene graph → five representations.
import { SAMPLES, getSample, defaultParams, toSVG, thumbSVG, fmt } from './samples.js';
import { parseSVG } from './svg-parser.js';
import { analyzeRaster } from './raster-analyzer.js';
import { describe, describeComponent } from './describe.js';
import { buildTree, renderTree, outlineText } from './tree.js';
import { renderAccessibleSVG, bindAccessibleSVG } from './accessible-svg.js';
import { Speaker, speechSupported, audioSupported, sonify } from './audio.js';
import { seriesStats, sceneTable, toCSV, toJSON, download, applyTable } from './data.js';
import { getSettings, setSetting, getHistory, pushHistory, clearHistory } from './store.js';
import { initChrome, escapeHtml as esc } from './ui.js';

initChrome();
const $ = (id) => document.getElementById(id);
const live = (msg) => { const el = $('a11y-live'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); };

const state = { scene: null, sample: null, params: null, image: null, level: getSettings().level || 'medium', levels: null, table: null, asvg: null, focused: null, sonifying: null, tree: null };
const speaker = new Speaker();

/* ---------------- Sample library ---------------- */
const samplesEl = $('samples');
for (const s of SAMPLES) {
  const li = document.createElement('li');
  li.innerHTML = `<button class="sample" type="button" data-id="${s.id}" aria-pressed="false">${thumbSVG(s)}<span>${esc(s.name)}</span><span class="cat">${esc(s.category)}</span></button>`;
  samplesEl.appendChild(li);
}
samplesEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) loadSample(b.dataset.id); });

function loadSample(id, params) {
  const sample = getSample(id); if (!sample) return;
  state.sample = sample; state.params = { ...defaultParams(sample), ...(params || {}) }; state.image = null;
  rebuildSample();
  samplesEl.querySelectorAll('.sample').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('preview').hidden = true; $('upload-status').textContent = '';
  renderParams();
  remember();
  live(`Loaded sample: ${sample.name}.`);
}
function rebuildSample() {
  const spec = state.sample.build(state.params);
  const svg = toSVG(spec);
  const scene = parseSVG(svg, 'sample');      // the parser reads the SVG back — same path as an uploaded semantic SVG
  scene.sampleId = state.sample.id; scene.params = { ...state.params };
  setScene(scene);
}

/* ---------------- Parameters ("what happens if…") ---------------- */
function renderParams() {
  const panel = $('params-panel'), box = $('params');
  const ps = state.sample?.params || [];
  panel.hidden = !ps.length; box.innerHTML = '';
  for (const p of ps) {
    const v = state.params[p.id];
    const div = document.createElement('div'); div.className = 'param';
    div.innerHTML = `<label for="p-${p.id}">${esc(p.label)}: <output id="po-${p.id}" for="p-${p.id}">${fmt(v)}${p.unit ? ' ' + esc(p.unit) : ''}</output></label><input id="p-${p.id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" aria-describedby="params-hint">`;
    box.appendChild(div);
    const input = div.querySelector('input');
    let t;
    input.addEventListener('input', () => { state.params[p.id] = Number(input.value); $(`po-${p.id}`).textContent = `${fmt(Number(input.value))}${p.unit ? ' ' + p.unit : ''}`; clearTimeout(t); t = setTimeout(() => { rebuildSample(); remember(); }, 120); });
    input.addEventListener('change', () => live(`${p.label} ${fmt(Number(input.value))}${p.unit ? ' ' + p.unit : ''}. All representations updated.`));
  }
  if (ps.length && !$('params-hint')) { const h = document.createElement('p'); h.id = 'params-hint'; h.className = 'visually-hidden'; h.textContent = 'Changing this value regenerates the description, structure, accessible visual, audio and data.'; box.appendChild(h); }
}

/* ---------------- Uploads: file, drop, paste ---------------- */
const dz = $('dropzone');
$('file').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); });
document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea, [contenteditable]')) return;
  const items = [...(e.clipboardData?.items || [])];
  const it = items.find(i => i.type.startsWith('image/') || i.type === 'image/svg+xml');
  if (it) { const f = it.getAsFile(); if (f) { e.preventDefault(); handleFile(f, 'pasted image'); } }
});

async function handleFile(file, label) {
  const name = label || file.name || 'image';
  const status = $('upload-status');
  if (!file.type.startsWith('image/') && !/\.svg$/i.test(file.name || '')) { status.textContent = `"${name}" is not an image file.`; return; }
  if (file.size > 12 * 1024 * 1024) { status.textContent = 'That file is larger than 12 MB. Please use a smaller image.'; return; }
  status.textContent = `Analysing ${name}…`;
  try {
    let scene;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '')) {
      const text = await file.text();
      scene = parseSVG(text, 'svg');
      if (!scene.title) scene.title = name;
      state.image = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
    } else {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The image could not be decoded.')); i.src = url; });
      scene = await analyzeRaster(img, { name: name.replace(/\.[a-z0-9]+$/i, '') });
      state.image = await thumbnail(img, 640);
      URL.revokeObjectURL(url);
    }
    state.sample = null; state.params = null;
    samplesEl.querySelectorAll('.sample').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('params-panel').hidden = true;
    $('preview').hidden = false; $('preview').innerHTML = `<img src="${state.image}" alt="Preview of ${esc(name)}">`;
    setScene(scene);
    remember();
    status.textContent = `${name}: classified as ${scene.type} (${Math.round(scene.confidence * 100)}% confidence).`;
    live(status.textContent + ' Outputs updated.');
  } catch (err) { status.textContent = `Could not analyse ${name}: ${err.message}`; }
}
function thumbnail(img, max) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}

/* ---------------- Scene → all outputs ---------------- */
function setScene(scene) {
  stopAudio();
  state.scene = scene;
  $('empty').hidden = true; $('results').hidden = false;
  renderHead(); renderDescription(); renderTreeView(); renderSVG(); renderAudio(); renderData(); renderRefine();
}
function renderHead() {
  const s = state.scene;
  $('result-title').textContent = s.title;
  const conf = Math.round(s.confidence * 100);
  const cls = conf >= 85 ? 'ok' : conf >= 55 ? 'warn' : 'err';
  $('result-badges').innerHTML = `<span class="badge">${esc(s.type)}</span><span class="badge">${s.source === 'sample' ? 'sample (semantic SVG)' : s.source === 'svg' ? 'uploaded SVG' : 'uploaded raster'}</span><span class="badge ${cls}">confidence ${conf}%</span>${s.series?.length ? `<span class="badge">${s.series.length} series</span>` : ''}${s.objects?.length ? `<span class="badge">${s.objects.length} objects</span>` : ''}`;
  $('notes').innerHTML = s.notes?.length ? `<div class="notice warn"><p><strong>Honest limits:</strong></p><ul style="margin:.3rem 0 0">${s.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
}

function renderDescription() {
  state.levels = describe(state.scene);
  $('description').innerHTML = `<p>${esc(state.levels[state.level])}</p>`;
  document.querySelectorAll('.levels [data-level]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === state.level)));
}
document.querySelectorAll('.levels [data-level]').forEach(b => b.addEventListener('click', () => { state.level = b.dataset.level; setSetting('level', state.level); renderDescription(); }));
$('speak-desc').addEventListener('click', () => speakOrWarn(state.levels[state.level]));
$('copy-desc').addEventListener('click', () => copy(state.levels[state.level], 'Description copied.'));

function renderTreeView() {
  const root = buildTree(state.scene);
  state.tree = renderTree($('tree'), root, { onSelect: (cid) => { selectTab('tab-svg'); if (state.asvg?.focus(cid)) live('Component shown in the accessible visual.'); } });
  $('outline').textContent = outlineText(root);
}
$('tree-expand').addEventListener('click', () => state.tree?.expandAll());
$('tree-collapse').addEventListener('click', () => state.tree?.collapseAll());
$('copy-outline').addEventListener('click', () => copy($('outline').textContent, 'Outline copied.'));

function renderSVG() {
  const wrap = $('asvg');
  state.asvg?.destroy();
  wrap.innerHTML = renderAccessibleSVG(state.scene, { background: state.scene.source === 'raster' ? state.image : null });
  wrap.classList.toggle('hc', $('opt-hc').checked); wrap.classList.toggle('large', $('opt-large').checked);
  const svg = wrap.querySelector('svg');
  state.asvg = bindAccessibleSVG(svg, {
    onFocus: (cid) => { state.focused = cid; const text = describeComponent(state.scene, cid); $('focus-desc').innerHTML = `<p>${esc(text)}</p>`; if ($('opt-autospeak').checked) speaker.speak(text); },
    onActivate: (cid) => { state.focused = cid; const text = describeComponent(state.scene, cid); $('focus-desc').innerHTML = `<p><strong>What is this?</strong> ${esc(text)}</p>`; live(text); if ($('opt-autospeak').checked || !speechSupported) return; speaker.speak(text); }
  });
  $('focus-desc').innerHTML = '<p>Move through the components to hear what each one is.</p>';
}
$('opt-hc').addEventListener('change', (e) => { $('asvg').classList.toggle('hc', e.target.checked); setSetting('highContrast', e.target.checked); });
$('opt-large').addEventListener('change', (e) => { $('asvg').classList.toggle('large', e.target.checked); setSetting('largeLabels', e.target.checked); });
$('speak-focus').addEventListener('click', () => { if (!state.focused) { live('No component is selected yet. Tab into the visual first.'); $('focus-desc').innerHTML = '<p>No component selected yet — Tab into the visual or click a component first.</p>'; return; } speakOrWarn(describeComponent(state.scene, state.focused)); });
$('download-svg').addEventListener('click', () => { const svg = $('asvg').querySelector('svg'); if (!svg) return; const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML.replace(/ class="current"/g, ''); download(slug(state.scene.title) + '-accessible.svg', xml, 'image/svg+xml'); live('Accessible SVG downloaded.'); });

/* ---------------- Audio ---------------- */
function renderAudio() {
  $('speech-unsupported').hidden = speechSupported; $('speech-controls').hidden = !speechSupported;
  const list = $('component-list'); list.innerHTML = '';
  const comps = [...(state.scene.axes ? [['axis-x', 'X-axis'], ['axis-y', 'Y-axis']] : []), ...state.scene.series.map(s => [s.id, 'Series: ' + s.name]), ...state.scene.objects.map(o => [o.id, o.label]), ...(state.scene.table ? state.scene.table.rows.map((r, i) => [`row-${i + 1}`, `Row ${i + 1}: ${r[0]}`]) : [])];
  for (const [cid, name] of comps) { const li = document.createElement('li'); li.innerHTML = `<span class="name">${esc(name)}</span><button class="btn ghost sm" type="button" data-speak="${esc(cid)}">Speak</button><button class="btn ghost sm" type="button" data-show="${esc(cid)}">Show</button>`; list.appendChild(li); }
  // sonification
  const sel = $('sonify-series'); sel.innerHTML = '';
  const sonifiable = state.scene.series.filter(s => s.points.length >= 2);
  $('sonify').hidden = !sonifiable.length || !audioSupported; $('sonify-unavailable').hidden = !!sonifiable.length && audioSupported;
  if (!audioSupported) $('sonify-unavailable').querySelector('p').textContent = 'Web Audio is not available in this browser, so sonification is unavailable.';
  sonifiable.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o); });
  $('sonify-status').textContent = '';
}
$('component-list').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.speak) speakOrWarn(describeComponent(state.scene, b.dataset.speak)); if (b.dataset.show) { selectTab('tab-svg'); state.asvg?.focus(b.dataset.show); } });
function speakOrWarn(text) { if (!speaker.speak(text)) live('Speech synthesis is not available in this browser.'); }
function populateVoices() { const sel = $('voice'); const cur = getSettings().voice; sel.innerHTML = '<option value="">Default voice</option>'; for (const v of speaker.voices()) { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`; if (v.voiceURI === cur) o.selected = true; sel.appendChild(o); } speaker.voiceURI = sel.value; }
populateVoices(); speaker.onChange(() => { if ($('voice').options.length <= 1) populateVoices(); $('sp-status').textContent = { speaking: 'Speaking…', paused: 'Paused.', idle: '', error: 'The speech engine reported an error.' }[speaker.state] || ''; });
$('voice').addEventListener('change', (e) => { speaker.voiceURI = e.target.value; setSetting('voice', e.target.value); });
{ const r = getSettings().rate || 1; $('rate').value = r; speaker.rate = r; $('rate-out').textContent = r.toFixed(1) + '×'; }
$('rate').addEventListener('input', (e) => { speaker.rate = Number(e.target.value); $('rate-out').textContent = Number(e.target.value).toFixed(1) + '×'; setSetting('rate', speaker.rate); });
$('sp-play').addEventListener('click', () => speakOrWarn(state.levels[state.level]));
$('sp-pause').addEventListener('click', () => speaker.pause());
$('sp-resume').addEventListener('click', () => speaker.resume());
$('sp-stop').addEventListener('click', () => speaker.stop());

$('sonify-play').addEventListener('click', () => {
  stopSonify();
  const s = state.scene.series.find(x => x.id === $('sonify-series').value); if (!s) return;
  const ys = state.scene.series.flatMap(x => x.points.map(p => p[1]));
  const X = state.scene.axes?.x, Y = state.scene.axes?.y;
  const yRange = Y && !isNaN(Y.min) ? [Math.min(Y.min, ...ys), Math.max(Y.max, ...ys)] : [Math.min(...ys), Math.max(...ys)];
  selectTabIfHidden('tab-audio');
  const status = $('sonify-status');
  state.sonifying = sonify(s, { yRange, duration: Number($('sonify-dur').value), onProgress: (frac, p, i) => { const px = s.px?.[i] || null; state.asvg?.cursor(s.id, px); status.textContent = `${s.name}: x = ${X?.categories ? X.categories[p[0]] : fmt(p[0], 3)}, y = ${fmt(p[1], 3)}`; }, onEnd: () => { state.asvg?.cursor(s.id, null); status.textContent = `Finished: ${s.name}, ${s.points.length} points, ${seriesStats(s)?.trend}.`; state.sonifying = null; } });
  if (!state.sonifying) status.textContent = 'Sonification could not start.'; else live(`Playing ${s.name}.`);
});
$('sonify-stop').addEventListener('click', () => { stopSonify(); $('sonify-status').textContent = 'Stopped.'; });
function stopSonify() { if (state.sonifying) { state.sonifying.stop(); state.sonifying = null; } if (state.scene) state.scene.series.forEach(s => state.asvg?.cursor(s.id, null)); }
function stopAudio() { speaker.stop(); stopSonify(); }

/* ---------------- Data ---------------- */
function renderData() {
  const s = state.scene;
  state.table = sceneTable(s);
  const stats = $('stats'); stats.innerHTML = '';
  const X = s.axes?.x, Y = s.axes?.y, u = (ax) => ax?.unit ? ' ' + ax.unit : '';
  for (const ser of s.series) {
    const st = seriesStats(ser); if (!st) continue;
    const tiles = [['Series', ser.name], ['Points', st.n], ['Minimum y', `${fmt(st.min[1], 3)}${u(Y)} at x = ${X?.categories ? X.categories[st.min[0]] : fmt(st.min[0], 3)}`], ['Maximum y', `${fmt(st.max[1], 3)}${u(Y)} at x = ${X?.categories ? X.categories[st.max[0]] : fmt(st.max[0], 3)}`], ['Trend', st.trend]];
    if (st.fit && ser.kind !== 'bar') tiles.push(['Slope (linear fit)', `${fmt(st.fit.slope, 4)}${Y?.unit && X?.unit ? ` ${Y.unit} per ${X.unit.replace(/s$/, '')}` : ''}`], ['Y-intercept (fit)', fmt(st.fit.intercept, 3)], ['R²', fmt(st.fit.r2, 3)]);
    if (st.xIntercept !== null && ser.kind !== 'bar') tiles.push(['X-intercept (fit)', fmt(st.xIntercept, 3)]);
    if (st.zeroCrossing !== null) tiles.push(['Crosses y = 0 at x', fmt(st.zeroCrossing, 3)]);
    for (const [k, v] of tiles) { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = `<div class="k">${esc(k)}</div><div class="v">${esc(String(v))}</div>`; stats.appendChild(d); }
  }
  const t = $('data-table'); t.innerHTML = '';
  $('data-none').hidden = !!state.table; $('apply-table').hidden = !state.table; $('dl-csv').hidden = !state.table; t.hidden = !state.table;
  if (state.table) {
    t.innerHTML = `<caption class="visually-hidden">Extracted data (cells are editable)</caption><thead><tr>${state.table.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${state.table.rows.map((r, ri) => `<tr>${r.map((c, ci) => `<td contenteditable="true" data-r="${ri}" data-c="${ci}" aria-label="Row ${ri + 1}, ${esc(state.table.headers[ci])}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }
}
$('apply-table').addEventListener('click', () => {
  if (!state.table) return;
  const rows = [...$('data-table').querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
  applyTable(state.scene, { headers: state.table.headers, rows });
  if (state.scene.table) state.scene.notes = state.scene.notes.filter(n => !/shown as "\?"/.test(n));
  state.scene.source === 'raster' && state.scene.notes.push('Values were edited by hand in the Data tab.');
  setScene(state.scene); remember(); live('Edited values applied to every representation.'); selectTab('tab-data');
});
$('dl-csv').addEventListener('click', () => { if (state.table) { download(slug(state.scene.title) + '.csv', toCSV(state.table), 'text/csv'); live('CSV downloaded.'); } });
$('dl-json').addEventListener('click', () => { download(slug(state.scene.title) + '.json', toJSON(state.scene, state.table), 'application/json'); live('JSON downloaded.'); });

/* ---------------- Refine (raster / generic SVG) ---------------- */
function renderRefine() {
  const s = state.scene; const panel = $('refine-panel');
  panel.hidden = s.source === 'sample';
  if (panel.hidden) return;
  $('rf-title').value = s.title;
  $('rf-axes').hidden = !s.axes;
  if (s.axes) { $('rf-xlabel').value = /not read|unknown/.test(s.axes.x.label) ? '' : s.axes.x.label; $('rf-xunit').value = s.axes.x.unit; $('rf-xmin').value = s.axes.refined ? s.axes.x.min : ''; $('rf-xmax').value = s.axes.refined ? s.axes.x.max : ''; $('rf-ylabel').value = /not read|unknown/.test(s.axes.y.label) ? '' : s.axes.y.label; $('rf-yunit').value = s.axes.y.unit; $('rf-ymin').value = s.axes.refined ? s.axes.y.min : ''; $('rf-ymax').value = s.axes.refined ? s.axes.y.max : ''; }
  const box = $('rf-series'); box.innerHTML = '';
  s.series.forEach((ser, i) => { const d = document.createElement('div'); d.className = 'field'; d.innerHTML = `<label for="rf-s${i}">Name of series ${i + 1} (${esc(ser.name)})</label><input id="rf-s${i}" type="text" value="${esc(ser.name)}" autocomplete="off">`; box.appendChild(d); });
}
$('refine-form').addEventListener('submit', (e) => {
  e.preventDefault(); const s = state.scene; if (!s) return;
  s.title = $('rf-title').value.trim() || s.title;
  if (s.axes) {
    const num = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };
    const xmin = num('rf-xmin'), xmax = num('rf-xmax'), ymin = num('rf-ymin'), ymax = num('rf-ymax');
    if ($('rf-xlabel').value.trim()) s.axes.x.label = $('rf-xlabel').value.trim();
    if ($('rf-ylabel').value.trim()) s.axes.y.label = $('rf-ylabel').value.trim();
    s.axes.x.unit = $('rf-xunit').value.trim(); s.axes.y.unit = $('rf-yunit').value.trim();
    // Keep the normalised (0..1) values so the range can be re-entered any number of times.
    s.series.forEach(ser => { if (!ser.norm) ser.norm = ser.points.map(p => [...p]); });
    const rescale = (ax, lo, hi) => { if (lo === null || hi === null || lo === hi) return false; ax.min = lo; ax.max = hi; ax.ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((lo + f * (hi - lo)) * 1000) / 1000); return true; };
    const rx = rescale(s.axes.x, xmin, xmax), ry = rescale(s.axes.y, ymin, ymax);
    if (rx || ry) { s.axes.refined = true; s.series.forEach(ser => { ser.points = ser.norm.map(([nx, ny]) => [rx ? Math.round((xmin + nx * (xmax - xmin)) * 1000) / 1000 : nx, ry ? Math.round((ymin + ny * (ymax - ymin)) * 1000) / 1000 : ny]); }); s.notes = s.notes.filter(n => !/fraction/i.test(n)); s.notes.push('Axis ranges were supplied by you in Refine; data values are scaled from pixel positions using those ranges.'); }
  }
  s.series.forEach((ser, i) => { const v = $(`rf-s${i}`)?.value.trim(); if (v) ser.name = v; });
  s.notes = s.notes.filter(n => !/add axis labels/i.test(n));
  setScene(s); remember(); live('Refinements applied to every representation.');
});

/* ---------------- Tabs ---------------- */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(id, focus = false) {
  tabs.forEach(t => { const on = t.id === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; const p = $(t.getAttribute('aria-controls')); if (!$('show-all').checked) p.hidden = !on; else p.hidden = false; if (on && focus) t.focus(); });
}
function selectTabIfHidden(id) { if (!$('show-all').checked) selectTab(id); }
tabs.forEach(t => { t.addEventListener('click', () => selectTab(t.id)); t.addEventListener('keydown', (e) => { const i = tabs.indexOf(t); let n = null; if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length]; if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length]; if (e.key === 'Home') n = tabs[0]; if (e.key === 'End') n = tabs[tabs.length - 1]; if (n) { e.preventDefault(); selectTab(n.id, true); } }); });
$('show-all').checked = !!getSettings().showAll;
const applyShowAll = () => { $('results').classList.toggle('show-all', $('show-all').checked); $('tablist').hidden = $('show-all').checked; selectTab(tabs.find(t => t.getAttribute('aria-selected') === 'true')?.id || 'tab-desc'); };
$('show-all').addEventListener('change', () => { setSetting('showAll', $('show-all').checked); applyShowAll(); live($('show-all').checked ? 'All outputs are now shown one after another.' : 'Outputs are now in tabs.'); });
applyShowAll();
$('opt-hc').checked = !!getSettings().highContrast; $('opt-large').checked = !!getSettings().largeLabels;

/* ---------------- History ---------------- */
function remember() {
  const s = state.scene; if (!s) return;
  const id = s.sampleId ? `sample:${s.sampleId}` : `img:${Date.now()}`;
  const entry = { id, ts: Date.now(), title: s.title, type: s.type, source: s.source, confidence: s.confidence, sampleId: s.sampleId || null, params: s.params || null, thumb: s.source === 'raster' ? state.image : '' };
  if (!s.sampleId) entry.scene = JSON.parse(JSON.stringify({ ...s, params: undefined }));
  renderHistory(pushHistory(entry));
}
function renderHistory(list = getHistory()) {
  const ul = $('history'); ul.innerHTML = ''; $('history-empty').hidden = list.length > 0;
  for (const h of list) {
    const li = document.createElement('li');
    const when = new Date(h.ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    li.innerHTML = `<button type="button" data-hid="${esc(h.id)}">${h.thumb ? `<img src="${h.thumb}" alt="">` : ''}<span>${esc(h.title)}<span class="meta">${esc(h.type)} · ${esc(h.source)} · ${when}</span></span></button>`;
    ul.appendChild(li);
  }
}
$('history').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-hid]'); if (!b) return;
  const h = getHistory().find(x => x.id === b.dataset.hid); if (!h) return;
  if (h.sampleId) loadSample(h.sampleId, h.params || undefined);
  else if (h.scene) { state.sample = null; state.params = null; state.image = h.thumb || null; $('params-panel').hidden = true; samplesEl.querySelectorAll('.sample').forEach(x => x.setAttribute('aria-pressed', 'false')); if (h.thumb) { $('preview').hidden = false; $('preview').innerHTML = `<img src="${h.thumb}" alt="Preview of ${esc(h.title)}">`; } setScene(h.scene); live(`Restored: ${h.title}.`); }
});
$('clear-history').addEventListener('click', () => { renderHistory(clearHistory()); live('History cleared.'); });
renderHistory();

/* ---------------- Utilities ---------------- */
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'prism'; }
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); live(msg); } catch { live('Copying is not available here; select the text and copy it manually.'); } }

// Deep link: app/?sample=triangle
const q = new URLSearchParams(location.search).get('sample');
if (q && getSample(q)) loadSample(q);
