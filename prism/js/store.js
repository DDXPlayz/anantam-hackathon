// PRISM — local persistence. Everything lives under one namespaced key.
const KEY = 'prism:v1';
const DEFAULTS = {
  settings: { fontScale: 1, dyslexia: false, showAll: false, rate: 1, voice: '', level: 'medium', highContrast: false, largeLabels: false },
  history: []
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return { settings: { ...DEFAULTS.settings, ...(data.settings || {}) }, history: Array.isArray(data.history) ? data.history : [] };
  } catch { return structuredClone(DEFAULTS); }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function getSettings() { return load().settings; }
export function setSetting(name, value) {
  const data = load(); data.settings[name] = value; save(data); return data.settings;
}

export function getHistory() { return load().history; }
export function pushHistory(entry) {
  const data = load();
  data.history = [entry, ...data.history.filter(h => h.id !== entry.id)].slice(0, 10);
  if (!save(data)) {
    // Thumbnails may push us over quota; retry without them.
    data.history = data.history.map(h => ({ ...h, thumb: '' }));
    save(data);
  }
  return data.history;
}
export function clearHistory() { const data = load(); data.history = []; save(data); return []; }
