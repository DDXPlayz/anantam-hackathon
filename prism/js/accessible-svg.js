// PRISM — regenerate the visual as a semantic, keyboard-navigable SVG.
// Every component is a focusable <g> with role="img", aria-label, <title>/<desc>.
import { fmt } from './samples.js';
import { describeComponent } from './describe.js';
import { escapeHtml as esc } from './ui.js';

const INK = '#111318';

function bbox(shapes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const s of shapes) {
    switch (s.shape) {
      case 'polygon': case 'polyline': s.points.forEach(p => add(p[0], p[1])); break;
      case 'line': add(s.x1, s.y1); add(s.x2, s.y2); break;
      case 'circle': add(s.cx - s.r, s.cy - s.r); add(s.cx + s.r, s.cy + s.r); break;
      case 'ellipse': add(s.cx - s.rx, s.cy - s.ry); add(s.cx + s.rx, s.cy + s.ry); break;
      case 'rect': add(s.x, s.y); add(s.x + s.w, s.y + s.h); break;
      case 'path': { const n = (s.d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number); for (let i = 0; i + 1 < n.length; i += 2) add(n[i], n[i + 1]); break; }
      case 'text': add(s.x - (s.anchor === 'middle' ? s.text.length * 5 : s.anchor === 'end' ? s.text.length * 10 : 0), s.y - 18); add(s.x + (s.anchor === 'end' ? 0 : s.text.length * (s.anchor === 'middle' ? 5 : 10)), s.y + 4); break;
    }
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

function shapeSVG(s, color, fs) {
  const stroke = s.color || color || INK, w = s.width ?? 3, fill = s.fill || 'none', dash = s.dashed ? ' stroke-dasharray="8 6"' : '';
  const P = (v) => fmt(v, 1);
  switch (s.shape) {
    case 'polygon': return `<polygon class="stroke" points="${s.points.map(p => p.map(P).join(',')).join(' ')}" fill="${fill}" stroke="${w ? stroke : 'none'}" stroke-width="${w}" stroke-linejoin="round"${dash}/>`;
    case 'polyline': return `<polyline class="stroke" points="${s.points.map(p => p.map(P).join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${s.arrow ? ' marker-end="url(#a-arrow)"' : ''}${dash}/>`;
    case 'line': return `<line class="stroke" x1="${P(s.x1)}" y1="${P(s.y1)}" x2="${P(s.x2)}" y2="${P(s.y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"${dash}/>`;
    case 'circle': return `<circle class="stroke" cx="${P(s.cx)}" cy="${P(s.cy)}" r="${P(s.r)}" fill="${fill}" stroke="${w ? stroke : 'none'}" stroke-width="${w}"${dash}/>`;
    case 'ellipse': return `<ellipse class="stroke" cx="${P(s.cx)}" cy="${P(s.cy)}" rx="${P(s.rx)}" ry="${P(s.ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"${dash}/>`;
    case 'rect': return `<rect class="stroke" x="${P(s.x)}" y="${P(s.y)}" width="${P(s.w)}" height="${P(s.h)}" rx="${s.rx || 0}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"${dash}/>`;
    case 'path': return `<path class="stroke" d="${esc(s.d)}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"${dash}/>`;
    case 'text': return `<text x="${P(s.x)}" y="${P(s.y)}" font-size="${s.size || fs}" font-weight="700" fill="${INK}" text-anchor="${s.anchor || 'start'}"${s.transform ? ` transform="${esc(s.transform)}"` : ''} aria-hidden="true">${esc(s.text)}</text>`;
    default: return '';
  }
}

function group(id, label, desc, inner, box, role = 'img', extra = '') {
  if (desc.startsWith(label + '.')) desc = desc.slice(label.length + 1).trim();
  const hl = box ? `<rect class="hl" x="${fmt(box[0] - 6, 1)}" y="${fmt(box[1] - 6, 1)}" width="${fmt(box[2] - box[0] + 12, 1)}" height="${fmt(box[3] - box[1] + 12, 1)}" rx="8"/>` : '';
  return `<g tabindex="0" role="${role}" data-cid="${esc(id)}" aria-label="${esc(label)}. ${esc(desc)}"${extra}><title>${esc(label)}</title><desc>${esc(desc)}</desc>${inner}${hl}</g>`;
}

/** scene → accessible SVG markup. opts.background = data URL drawn faintly under a raster analysis. */
export function renderAccessibleSVG(scene, opts = {}) {
  const [vx, vy, W, H] = scene.viewBox || [0, 0, 800, 500];
  const fs = Math.max(16, Math.round(W / 42));
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${W} ${H}" role="group" aria-label="Accessible version of: ${esc(scene.title)}. ${(scene.objects.length + scene.series.length)} navigable components. Use Tab or arrow keys to move between components." font-family="Atkinson Hyperlegible, Arial, sans-serif" data-prism-accessible="1">`);
  out.push(`<title>${esc(scene.title)}</title><desc>${esc(scene.desc || '')}</desc>`);
  out.push(`<defs><marker id="a-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs>`);
  out.push(`<rect x="${vx}" y="${vy}" width="${W}" height="${H}" fill="#FFFFFF"/>`);
  if (opts.background) out.push(`<image href="${opts.background}" x="0" y="0" width="${W}" height="${H}" opacity="0.28" aria-hidden="true"/>`);

  // Axes and series
  if (scene.axes) {
    const X = scene.axes.x, Y = scene.axes.y;
    const mx = (v) => X.categories ? X.px0 + (v + 0.5) * (X.px1 - X.px0) / X.categories.length : X.px0 + (v - X.min) / ((X.max - X.min) || 1) * (X.px1 - X.px0);
    const my = (v) => Y.px0 + (v - Y.min) / ((Y.max - Y.min) || 1) * (Y.px1 - Y.px0);
    const zx = !X.categories && X.min < 0 && X.max > 0 ? mx(0) : X.px0, zy = Y.min < 0 && Y.max > 0 ? my(0) : Y.px0;
    let xin = `<line class="stroke" x1="${fmt(X.px0, 1)}" y1="${fmt(zy, 1)}" x2="${fmt(X.px1, 1)}" y2="${fmt(zy, 1)}" stroke="${INK}" stroke-width="3"/>`;
    if (X.categories) X.categories.forEach((c, i) => { xin += `<text x="${fmt(mx(i), 1)}" y="${fmt(Y.px0 + fs * 1.4, 1)}" text-anchor="middle" font-size="${fs}" fill="${INK}" aria-hidden="true">${esc(c)}</text>`; });
    else (X.ticks || []).forEach(t => { xin += `<line x1="${fmt(mx(t), 1)}" y1="${fmt(zy, 1)}" x2="${fmt(mx(t), 1)}" y2="${fmt(zy + 8, 1)}" stroke="${INK}" stroke-width="2"/><text x="${fmt(mx(t), 1)}" y="${fmt(zy + fs * 1.5, 1)}" text-anchor="middle" font-size="${fs * 0.9}" fill="${INK}" aria-hidden="true">${fmt(t)}</text>`; });
    xin += `<text x="${fmt((X.px0 + X.px1) / 2, 1)}" y="${fmt(Math.min(H - 6, Y.px0 + fs * 2.9), 1)}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${INK}" aria-hidden="true">${esc(X.label)}${X.unit ? ' (' + esc(X.unit) + ')' : ''}</text>`;
    out.push(group('axis-x', 'X-axis', describeComponent(scene, 'axis-x'), xin, [X.px0, zy - 4, X.px1, Math.min(H, Y.px0 + fs * 3)]));
    let yin = `<line class="stroke" x1="${fmt(zx, 1)}" y1="${fmt(Y.px0, 1)}" x2="${fmt(zx, 1)}" y2="${fmt(Y.px1, 1)}" stroke="${INK}" stroke-width="3"/>`;
    (Y.ticks || []).forEach(t => { yin += `<line x1="${fmt(zx - 8, 1)}" y1="${fmt(my(t), 1)}" x2="${fmt(zx, 1)}" y2="${fmt(my(t), 1)}" stroke="${INK}" stroke-width="2"/><text x="${fmt(zx - 12, 1)}" y="${fmt(my(t) + fs * 0.35, 1)}" text-anchor="end" font-size="${fs * 0.9}" fill="${INK}" aria-hidden="true">${fmt(t)}</text>`; });
    yin += `<text transform="translate(${fmt(Math.max(fs, zx - fs * 3.2), 1)} ${fmt((Y.px0 + Y.px1) / 2, 1)}) rotate(-90)" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${INK}" aria-hidden="true">${esc(Y.label)}${Y.unit ? ' (' + esc(Y.unit) + ')' : ''}</text>`;
    out.push(group('axis-y', 'Y-axis', describeComponent(scene, 'axis-y'), yin, [Math.max(0, zx - fs * 4), Y.px1, zx + 4, Y.px0]));
    for (const s of scene.series) {
      const px = s.px && s.px.length === s.points.length ? s.px : s.points.map(([x, y]) => [mx(x), my(y)]);
      let inner = '';
      if (s.kind === 'line') inner = `<polyline class="stroke" points="${px.map(p => p.map(v => fmt(v, 1)).join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${Math.max(4, W / 200)}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="10 8"' : ''}/>`;
      else if (s.kind === 'scatter') inner = px.map(([x, y]) => `<circle cx="${fmt(x, 1)}" cy="${fmt(y, 1)}" r="${Math.max(7, W / 110)}" fill="${s.color}" stroke="#fff" stroke-width="2"/>`).join('');
      else { const bw = (X.px1 - X.px0) / Math.max(1, (X.categories?.length || s.points.length)) * 0.6; inner = px.map(([x, y], i) => `<rect x="${fmt(x - bw / 2, 1)}" y="${fmt(y, 1)}" width="${fmt(bw, 1)}" height="${fmt(Math.max(0, zy - y), 1)}" fill="${s.color}" rx="4"/><text x="${fmt(x, 1)}" y="${fmt(y - 6, 1)}" text-anchor="middle" font-size="${fs * 0.8}" fill="${INK}" aria-hidden="true">${fmt(s.points[i][1], 3)}</text>`).join(''); }
      inner += `<circle class="cursor" r="${Math.max(8, W / 90)}" fill="none" stroke="${INK}" stroke-width="3" opacity="0" aria-hidden="true"/>`;
      out.push(group(s.id, `Series: ${s.name}`, describeComponent(scene, s.id), inner, bbox(s.kind === 'bar' ? [{ shape: 'polyline', points: [...px, [px[0]?.[0] ?? 0, zy]] }] : [{ shape: 'polyline', points: px }])));
    }
    if (scene.series.length > 1) out.push(`<g aria-hidden="true">${scene.series.map((s, i) => `<line x1="${fmt(X.px0 + 16, 1)}" y1="${fmt(Y.px1 + 14 + i * fs * 1.4, 1)}" x2="${fmt(X.px0 + 56, 1)}" y2="${fmt(Y.px1 + 14 + i * fs * 1.4, 1)}" stroke="${s.color}" stroke-width="5"${s.dash ? ' stroke-dasharray="8 6"' : ''}/><text x="${fmt(X.px0 + 66, 1)}" y="${fmt(Y.px1 + 20 + i * fs * 1.4, 1)}" font-size="${fs * 0.85}" fill="${INK}">${esc(s.name)}</text>`).join('')}</g>`);
  } else if (scene.series.length) {
    for (const s of scene.series) { const px = s.px || []; out.push(group(s.id, `Series: ${s.name}`, describeComponent(scene, s.id), `<polyline class="stroke" points="${px.map(p => p.map(v => fmt(v, 1)).join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="4"/><circle class="cursor" r="10" fill="none" stroke="${INK}" stroke-width="3" opacity="0" aria-hidden="true"/>`, bbox([{ shape: 'polyline', points: px }]))); }
  }
  // Relations with geometry (wires, arrows, bonds) — drawn under objects
  scene.relations.forEach((r, i) => { if (!r.shapes?.length) return; out.push(group(`rel-${i}`, `Connection: ${r.type}`, r.label, r.shapes.map(s => shapeSVG(s, INK, fs)).join(''), bbox(r.shapes))); });
  // Objects
  for (const o of scene.objects) out.push(group(o.id, o.label, describeComponent(scene, o.id), o.shapes.map(s => shapeSVG(s, o.color, fs)).join(''), bbox(o.shapes)));
  // Table
  if (scene.table) {
    const t = scene.table, cols = t.headers.length, rows = t.rows.length + 1, cw = (W - 80) / cols, rh = Math.min(64, (H - 80) / rows), x0 = 40, y0 = 60;
    const cell = (r, c, text, header) => `<g tabindex="0" role="cell" data-cid="cell-${r}-${c}" aria-label="${esc(r === 0 ? `Column header ${c + 1}: ${text}` : `Row ${r}, ${t.headers[c]}: ${text}`)}"><rect x="${fmt(x0 + c * cw, 1)}" y="${fmt(y0 + r * rh, 1)}" width="${fmt(cw, 1)}" height="${fmt(rh, 1)}" fill="${header ? '#ECEEF5' : '#fff'}" stroke="${INK}" stroke-width="2"/><text x="${fmt(x0 + c * cw + 12, 1)}" y="${fmt(y0 + r * rh + rh / 2 + fs * 0.35, 1)}" font-size="${fs * 0.9}"${header ? ' font-weight="700"' : ''} fill="${INK}" aria-hidden="true">${esc(text)}</text><rect class="hl" x="${fmt(x0 + c * cw, 1)}" y="${fmt(y0 + r * rh, 1)}" width="${fmt(cw, 1)}" height="${fmt(rh, 1)}"/></g>`;
    out.push(`<g role="table" aria-label="${esc(scene.title)}"><g role="row">${t.headers.map((h, c) => cell(0, c, h, true)).join('')}</g>${t.rows.map((row, r) => `<g role="row">${row.map((v, c) => cell(r + 1, c, v, false)).join('')}</g>`).join('')}</g>`);
  }
  out.push('</svg>');
  return out.join('');
}

/** Keyboard + pointer navigation between components. Returns { focus(id), destroy }. */
export function bindAccessibleSVG(svg, { onFocus, onActivate } = {}) {
  const items = () => [...svg.querySelectorAll('[data-cid][tabindex]')];
  const setCurrent = (el) => { svg.querySelectorAll('g.current').forEach(g => g.classList.remove('current')); el.classList.add('current'); };
  const onKey = (e) => {
    const el = e.target.closest('[data-cid]'); if (!el) return; const list = items(); const i = list.indexOf(el);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = list[(i + 1) % list.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate && onActivate(el.dataset.cid); return; }
    if (next) { e.preventDefault(); next.focus(); announce(next); }
  };
  let last = null;
  const announce = (el) => { if (el === last) return; last = el; setCurrent(el); onFocus && onFocus(el.dataset.cid, el); };
  const onFocusIn = (e) => { const el = e.target.closest('[data-cid]'); if (el) announce(el); };
  const onClick = (e) => { const el = e.target.closest('[data-cid]'); if (!el) return; el.focus(); onActivate && onActivate(el.dataset.cid); };
  svg.addEventListener('keydown', onKey); svg.addEventListener('focusin', onFocusIn); svg.addEventListener('click', onClick);
  return {
    focus(id) { const el = svg.querySelector(`[data-cid="${CSS.escape(id)}"]`); if (el) { el.focus(); return true; } return false; },
    cursor(id, px) { const g = svg.querySelector(`[data-cid="${CSS.escape(id)}"] .cursor`); if (!g) return; if (!px) { g.setAttribute('opacity', '0'); return; } g.setAttribute('cx', px[0]); g.setAttribute('cy', px[1]); g.setAttribute('opacity', '1'); },
    destroy() { svg.removeEventListener('keydown', onKey); svg.removeEventListener('focusin', onFocusIn); svg.removeEventListener('click', onClick); }
  };
}
