// PRISM — audio description (Web Speech API) and sonification (Web Audio API).

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export class Speaker {
  constructor() { this.rate = 1; this.voiceURI = ''; this.listeners = new Set(); this.state = 'idle'; this._voices = []; if (speechSupported) { this._load(); speechSynthesis.addEventListener?.('voiceschanged', () => this._load()); } }
  _load() { this._voices = speechSynthesis.getVoices().filter(v => v.lang); this._emit(); }
  voices() { return this._voices; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this.state); }
  _set(state) { this.state = state; this._emit(); }
  speak(text, { interrupt = true } = {}) {
    if (!speechSupported || !text) return false;
    if (interrupt) speechSynthesis.cancel();
    // Long texts are split into sentence chunks: some engines stop after ~15 s.
    const chunks = String(text).match(/[^.!?\n]+[.!?]?\s*/g) || [text];
    let remaining = chunks.length;
    chunks.forEach(chunk => {
      const u = new SpeechSynthesisUtterance(chunk.trim());
      u.rate = this.rate;
      const v = this._voices.find(v => v.voiceURI === this.voiceURI); if (v) u.voice = v;
      u.onstart = () => this._set('speaking');
      u.onend = () => { remaining--; if (remaining <= 0) this._set('idle'); };
      u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') this._set('error'); else if (--remaining <= 0) this._set('idle'); };
      speechSynthesis.speak(u);
    });
    return true;
  }
  pause() { if (speechSupported && speechSynthesis.speaking && !speechSynthesis.paused) { speechSynthesis.pause(); this._set('paused'); } }
  resume() { if (speechSupported && speechSynthesis.paused) { speechSynthesis.resume(); this._set('speaking'); } }
  stop() { if (speechSupported) { speechSynthesis.cancel(); this._set('idle'); } }
}

/* ------------------------------------------------------------------ */
/* Sonification: pitch follows the y value as time sweeps along x.      */
let ctx = null;
export const audioSupported = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
function getCtx() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; }

const F_LOW = 220, F_HIGH = 880; // two octaves: A3 to A5
export const freqFor = (norm) => F_LOW * Math.pow(F_HIGH / F_LOW, Math.min(1, Math.max(0, norm)));

/**
 * Play a series. points: [[x, y]] in data units; yRange: [min, max] shared across series.
 * kind 'line' = continuous glide; 'bar'/'scatter' = one tone per point.
 * Returns { stop, duration } and calls onProgress(fraction, point) for visual/text sync.
 */
export function sonify(series, { yRange, xRange, duration = 3, onProgress, onEnd } = {}) {
  if (!audioSupported) return null;
  const ac = getCtx(); if (ac.state === 'suspended') ac.resume();
  const pts = [...series.points].filter(p => Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;
  const ys = pts.map(p => p[1]); const y0 = yRange?.[0] ?? Math.min(...ys), y1 = yRange?.[1] ?? Math.max(...ys);
  const xs = pts.map(p => p[0]); const x0 = xRange?.[0] ?? Math.min(...xs), x1 = xRange?.[1] ?? Math.max(...xs);
  const nY = (y) => y1 === y0 ? 0.5 : (y - y0) / (y1 - y0);
  const nX = (x) => x1 === x0 ? 0 : (x - x0) / (x1 - x0);
  const t0 = ac.currentTime + 0.05;
  const gain = ac.createGain(); gain.gain.setValueAtTime(0, t0); gain.connect(ac.destination);
  const osc = ac.createOscillator(); osc.type = 'triangle'; osc.connect(gain);
  const timers = [];
  if (series.kind === 'line') {
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.05);
    osc.frequency.setValueAtTime(freqFor(nY(pts[0][1])), t0);
    for (const [x, y] of pts) osc.frequency.linearRampToValueAtTime(freqFor(nY(y)), t0 + nX(x) * duration);
    gain.gain.setValueAtTime(0.25, t0 + duration); gain.gain.linearRampToValueAtTime(0, t0 + duration + 0.08);
    osc.start(t0); osc.stop(t0 + duration + 0.1);
  } else {
    const step = duration / pts.length;
    osc.start(t0); osc.stop(t0 + duration + 0.1);
    pts.forEach(([, y], i) => { const t = t0 + i * step; osc.frequency.setValueAtTime(freqFor(nY(y)), t); gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.3, t + 0.02); gain.gain.setValueAtTime(0.3, t + step * 0.7); gain.gain.linearRampToValueAtTime(0, t + step * 0.9); });
  }
  // progress callbacks for the visual cursor / announcements
  if (onProgress) pts.forEach((p, i) => { const when = series.kind === 'line' ? nX(p[0]) * duration : i * (duration / pts.length); timers.push(setTimeout(() => onProgress(when / duration, p, i), 50 + when * 1000)); });
  timers.push(setTimeout(() => onEnd && onEnd(), 50 + (duration + 0.15) * 1000));
  const stop = () => { timers.forEach(clearTimeout); try { gain.gain.cancelScheduledValues(ac.currentTime); gain.gain.setValueAtTime(0, ac.currentTime); osc.stop(ac.currentTime + 0.01); } catch { /* already stopped */ } };
  return { stop, duration };
}

/** A short confirmation blip (used when a component receives focus, optional). */
export function blip(norm = 0.5) {
  if (!audioSupported) return; const ac = getCtx(); if (ac.state === 'suspended') return;
  const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = freqFor(norm); g.gain.value = 0.0001; o.connect(g); g.connect(ac.destination);
  const t = ac.currentTime; g.gain.exponentialRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.start(t); o.stop(t + 0.16);
}
