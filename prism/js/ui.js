// PRISM — shared page chrome: text-size and spacing controls, settings persistence.
import { getSettings, setSetting } from './store.js';

export function applySettings(s = getSettings()) {
  const scale = Math.min(1.6, Math.max(0.85, Number(s.fontScale) || 1));
  document.documentElement.style.setProperty('--scale', String(scale));
  document.body.classList.toggle('dyslexia', !!s.dyslexia);
  const dys = document.getElementById('a11y-dyslexia');
  if (dys) dys.setAttribute('aria-pressed', String(!!s.dyslexia));
  const out = document.getElementById('a11y-size');
  if (out) out.textContent = Math.round(scale * 100) + '%';
}

export function initChrome() {
  applySettings();
  const minus = document.getElementById('a11y-minus');
  const plus = document.getElementById('a11y-plus');
  const dys = document.getElementById('a11y-dyslexia');
  const live = document.getElementById('a11y-live');
  const announce = (msg) => { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); } };
  const step = (d) => {
    const s = getSettings();
    const next = Math.round(Math.min(1.6, Math.max(0.85, (Number(s.fontScale) || 1) + d)) * 100) / 100;
    applySettings(setSetting('fontScale', next));
    announce('Text size ' + Math.round(next * 100) + ' percent');
  };
  minus?.addEventListener('click', () => step(-0.1));
  plus?.addEventListener('click', () => step(0.1));
  dys?.addEventListener('click', () => {
    const s = getSettings();
    applySettings(setSetting('dyslexia', !s.dyslexia));
    announce(!s.dyslexia ? 'Wide spacing on' : 'Wide spacing off');
  });
  // Mark the current page in the nav
  const here = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll('.site-nav a').forEach(a => {
    const href = new URL(a.getAttribute('href'), location.href).pathname.replace(/index\.html$/, '');
    if (href === here) a.setAttribute('aria-current', 'page');
  });
}

/** Wordmark SVG: a prism splitting a single ray into a spectrum. */
export const WORDMARK_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="pw-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E5322D"/><stop offset=".25" stop-color="#F59E0B"/><stop offset=".5" stop-color="#22A06B"/><stop offset=".75" stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs><path d="M4 32 H22" stroke="#111318" stroke-width="4" stroke-linecap="round"/><path d="M32 12 L48 46 H16 Z" fill="none" stroke="#111318" stroke-width="4" stroke-linejoin="round"/><path d="M42 30 L60 22 M42 32 L60 30 M42 34 L60 38 M42 36 L60 46" stroke="url(#pw-s)" stroke-width="4" stroke-linecap="round"/></svg>`;

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
