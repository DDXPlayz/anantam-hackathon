// Accessibility preferences and screen-reader announcements.
import { getPrefs, setPref } from './store.js';

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };

export const prefs = {
  get hc() { return !!getPrefs().hc; },
  get simple() { return !!getPrefs().simple; },
  // rm: null means "follow system"; true/false is an explicit choice
  get rm() { const v = getPrefs().rm; return v === null || v === undefined ? mq.matches : !!v; },
  get rmExplicit() { return getPrefs().rm; },
};

export function applyPrefs() {
  const root = document.documentElement;
  root.classList.toggle('hc', prefs.hc);
  root.classList.toggle('rm', prefs.rm);
  root.classList.toggle('simple', prefs.simple);
  document.querySelectorAll('[data-pref]').forEach(btn => {
    const k = btn.dataset.pref;
    btn.setAttribute('aria-pressed', String(prefs[k]));
  });
}

const listeners = new Set();
export function onPrefChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function bindPrefToggles() {
  document.querySelectorAll('[data-pref]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.pref;
      const next = !prefs[k];
      setPref(k, next);
      applyPrefs();
      announce(`${btn.dataset.label || k} ${next ? 'on' : 'off'}`);
      listeners.forEach(fn => fn(k, next));
    });
  });
  mq.addEventListener('change', () => { applyPrefs(); listeners.forEach(fn => fn('rm', prefs.rm)); });
  applyPrefs();
}

// ---------- Announcer (polite, throttled) ----------
let region = null, toast = null, toastTimer = null, lastAnnounce = 0, pending = null, pendingTimer = null;
function ensure() {
  if (!region) {
    region = document.getElementById('sr-announce');
    if (!region) {
      region = document.createElement('div');
      region.id = 'sr-announce';
      region.className = 'visually-hidden';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      document.body.appendChild(region);
    }
  }
  if (!toast) {
    toast = document.getElementById('toast');
  }
}
/** Announce to screen readers. Throttled to at most one message per `minGap` ms; the latest message wins. */
export function announce(text, { minGap = 1200, visual = false } = {}) {
  ensure();
  const now = Date.now();
  const emit = (t) => {
    region.textContent = '';
    // force re-announce of identical text
    requestAnimationFrame(() => { region.textContent = t; });
    lastAnnounce = Date.now();
    if (visual && toast) {
      toast.textContent = t; toast.hidden = false;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
    }
  };
  if (now - lastAnnounce >= minGap) { emit(text); return; }
  pending = text;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { if (pending) { emit(pending); pending = null; } }, minGap - (now - lastAnnounce));
}
