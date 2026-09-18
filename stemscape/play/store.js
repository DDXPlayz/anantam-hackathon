// STEMSCAPE persistence — everything under one namespaced localStorage key.
const KEY = 'stemscape:v1';

const DEFAULT = { version: 1, tutorialSeen: false, unlockAll: false, missions: {}, designs: {} };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT), data);
  } catch { return structuredClone(DEFAULT); }
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function reset() { try { localStorage.removeItem(KEY); } catch {} }

export function missionRecord(state, id) {
  if (!state.missions[id]) state.missions[id] = { best: 0, stars: 0, runs: [], badges: [] };
  return state.missions[id];
}

export function recordRun(state, id, results) {
  const rec = missionRecord(state, id);
  const n = rec.runs.length + 1;
  rec.runs.push({ n, score: results.score, stars: results.stars, key: results.historyKeys, when: Date.now() });
  if (rec.runs.length > 40) rec.runs.shift();
  if (results.score > rec.best) rec.best = results.score;
  if (results.stars > rec.stars) rec.stars = results.stars;
  for (const b of results.badges || []) if (!rec.badges.includes(b)) rec.badges.push(b);
  save(state);
  return rec;
}
