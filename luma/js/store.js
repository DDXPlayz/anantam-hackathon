// Persistence — everything under one namespaced key, every access wrapped in try/catch.
const KEY = 'luma:v1';

const DEFAULTS = () => ({
  prefs: { hc: false, rm: null, simple: false },
  lastExperiment: null,
  experiments: {},
});

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? Object.assign(DEFAULTS(), JSON.parse(raw)) : DEFAULTS();
  } catch (e) {
    cache = DEFAULTS();
  }
  return cache;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache || DEFAULTS())); return true; }
  catch (e) { return false; }
}

export function getPrefs() { return load().prefs; }
export function setPref(k, v) { load().prefs[k] = v; save(); }

export function getExperiment(id) {
  const s = load();
  if (!s.experiments[id]) s.experiments[id] = { params: null, components: null, rows: [], notes: [], graph: null, seed: null };
  return s.experiments[id];
}
export function setExperiment(id, data) {
  const s = load();
  s.experiments[id] = Object.assign(getExperiment(id), data);
  s.lastExperiment = id;
  save();
}
export function clearExperiment(id) {
  const s = load();
  delete s.experiments[id];
  save();
}
export function getLast() { return load().lastExperiment; }
export function wipeAll() {
  cache = DEFAULTS();
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
