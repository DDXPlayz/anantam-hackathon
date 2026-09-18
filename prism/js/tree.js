// PRISM — structured representation: an accessible tree view + text outline.
import { seriesStats } from './data.js';
import { fmt } from './samples.js';
import { escapeHtml as esc } from './ui.js';

export function buildTree(scene) {
  const root = { label: scene.title, value: `${scene.type}, ${scene.source}`, children: [] };
  if (scene.axes) {
    const ax = { label: 'Axes', children: [] };
    for (const k of ['x', 'y']) { const a = scene.axes[k]; if (!a) continue; ax.children.push({ label: `${k}-axis`, value: a.label + (a.unit ? ` (${a.unit})` : ''), cid: 'axis-' + k, children: a.categories ? [{ label: 'Categories', value: a.categories.join(', ') }] : [{ label: 'Range', value: `${fmt(a.min)} to ${fmt(a.max)}` }, { label: 'Ticks', value: a.ticks.join(', ') }] }); }
    root.children.push(ax);
  }
  if (scene.series?.length) {
    const sn = { label: 'Data series', value: `${scene.series.length}`, children: [] };
    for (const s of scene.series) {
      const st = seriesStats(s);
      const node = { label: s.name, value: `${s.kind}, ${s.points.length} points`, cid: s.id, children: [] };
      if (st) { node.children.push({ label: 'Trend', value: st.trend }, { label: 'Minimum', value: `${fmt(st.min[1], 3)} at x = ${fmt(st.min[0], 3)}` }, { label: 'Maximum', value: `${fmt(st.max[1], 3)} at x = ${fmt(st.max[0], 3)}` }); if (st.fit) node.children.push({ label: 'Linear fit', value: `slope ${fmt(st.fit.slope, 3)}, intercept ${fmt(st.fit.intercept, 2)}, R² ${fmt(st.fit.r2, 3)}` }); }
      node.children.push({ label: 'Points', children: s.points.slice(0, 60).map(([x, y]) => ({ label: `(${fmt(x, 3)}, ${fmt(y, 3)})` })) });
      sn.children.push(node);
    }
    root.children.push(sn);
  }
  if (scene.objects?.length) {
    root.children.push({ label: 'Objects', value: String(scene.objects.length), children: scene.objects.map(o => ({ label: o.label, value: o.kind, cid: o.id, children: [
      ...(o.desc ? [{ label: 'Description', value: o.desc }] : []),
      ...Object.entries(o.props || {}).map(([k, v]) => ({ label: k, value: v })),
      ...(scene.relations.some(r => r.from === o.id || r.to === o.id) ? [{ label: 'Relationships', children: scene.relations.filter(r => r.from === o.id || r.to === o.id).map(r => ({ label: r.from === o.id ? `${r.type} → ${nameOf(scene, r.to)}` : `${nameOf(scene, r.from)} ${r.type} → this`, value: r.label })) }] : [])
    ] })) });
  }
  if (scene.relations?.length) root.children.push({ label: 'Relationships', value: String(scene.relations.length), children: scene.relations.map((r, i) => ({ label: `${nameOf(scene, r.from)} — ${r.type} — ${nameOf(scene, r.to)}`, value: r.label, cid: r.shapes?.length ? `rel-${i}` : undefined })) });
  if (scene.table) root.children.push({ label: 'Table', value: `${scene.table.headers.length} columns × ${scene.table.rows.length} rows`, children: [{ label: 'Header row', value: scene.table.headers.join(' | '), cid: 'row-0' }, ...scene.table.rows.map((r, i) => ({ label: `Row ${i + 1}`, value: r.join(' | '), cid: `row-${i + 1}`, children: r.map((c, j) => ({ label: scene.table.headers[j], value: c, cid: `cell-${i + 1}-${j}` })) }))] });
  if (scene.summary) root.children.push({ label: 'Summary', children: Object.entries(scene.summary).map(([k, v]) => ({ label: k, value: v })) });
  if (scene.notes?.length) root.children.push({ label: 'Analysis notes', value: String(scene.notes.length), children: scene.notes.map(n => ({ label: n })) });
  return root;
}
const nameOf = (scene, id) => scene.objects.find(o => o.id === id)?.label || scene.series.find(s => s.id === id)?.name || id;

export function outlineText(node, depth = 0) {
  let t = `${'  '.repeat(depth)}${depth ? '- ' : ''}${node.label}${node.value ? ': ' + node.value : ''}\n`;
  for (const c of node.children || []) t += outlineText(c, depth + 1);
  return t;
}

/** Render an ARIA tree with full keyboard support. onSelect(cid) fires on Enter/Space or click for nodes bound to a component. */
export function renderTree(container, root, { onSelect } = {}) {
  container.innerHTML = '';
  const ul = document.createElement('ul'); ul.setAttribute('role', 'tree'); ul.setAttribute('aria-label', 'Structure of the visual');
  const make = (node, level, expanded) => {
    const li = document.createElement('li'); li.setAttribute('role', 'treeitem'); li.setAttribute('aria-level', level); li.tabIndex = -1;
    const has = node.children && node.children.length;
    if (has) li.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (node.cid) li.dataset.cid = node.cid;
    li.innerHTML = `<div class="ti"><span class="tw" aria-hidden="true">${has ? (expanded ? '▾' : '▸') : '·'}</span><span class="tk">${esc(node.label)}</span>${node.value ? `<span class="tv">— ${esc(node.value)}</span>` : ''}${node.cid ? '<span class="visually-hidden"> (press Enter to show this component)</span>' : ''}</div>`;
    if (has) { const sub = document.createElement('ul'); sub.setAttribute('role', 'group'); node.children.forEach(c => sub.appendChild(make(c, level + 1, level < 2))); li.appendChild(sub); }
    return li;
  };
  root.children.forEach(c => ul.appendChild(make(c, 1, true)));
  container.appendChild(ul);
  const items = () => [...ul.querySelectorAll('[role="treeitem"]')].filter(li => { let p = li.parentElement?.closest('[role="treeitem"]'); while (p) { if (p.getAttribute('aria-expanded') === 'false') return false; p = p.parentElement?.closest('[role="treeitem"]'); } return true; });
  const first = ul.querySelector('[role="treeitem"]'); if (first) first.tabIndex = 0;
  const focusItem = (li) => { ul.querySelectorAll('[role="treeitem"]').forEach(x => x.tabIndex = -1); li.tabIndex = 0; li.focus(); };
  const toggle = (li, open) => { if (!li.hasAttribute('aria-expanded')) return; const now = open ?? li.getAttribute('aria-expanded') !== 'true'; li.setAttribute('aria-expanded', String(now)); li.querySelector('.tw').textContent = now ? '▾' : '▸'; };
  ul.addEventListener('click', (e) => { const row = e.target.closest('.ti'); if (!row) return; const li = row.parentElement; focusItem(li); if (e.target.classList.contains('tw')) toggle(li); else { toggle(li, true); if (li.dataset.cid && onSelect) onSelect(li.dataset.cid); } });
  ul.addEventListener('keydown', (e) => {
    const li = e.target.closest('[role="treeitem"]'); if (!li) return; const vis = items(); const i = vis.indexOf(li);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (vis[i + 1]) focusItem(vis[i + 1]); break;
      case 'ArrowUp': e.preventDefault(); if (vis[i - 1]) focusItem(vis[i - 1]); break;
      case 'ArrowRight': e.preventDefault(); if (li.getAttribute('aria-expanded') === 'false') toggle(li, true); else { const c = li.querySelector(':scope > ul > [role="treeitem"]'); if (c) focusItem(c); } break;
      case 'ArrowLeft': e.preventDefault(); if (li.getAttribute('aria-expanded') === 'true') toggle(li, false); else { const p = li.parentElement.closest('[role="treeitem"]'); if (p) focusItem(p); } break;
      case 'Home': e.preventDefault(); focusItem(vis[0]); break;
      case 'End': e.preventDefault(); focusItem(vis[vis.length - 1]); break;
      case 'Enter': case ' ': e.preventDefault(); if (li.dataset.cid && onSelect) onSelect(li.dataset.cid); else toggle(li); break;
      case '*': e.preventDefault(); ul.querySelectorAll('[aria-expanded="false"]').forEach(x => toggle(x, true)); break;
    }
  });
  return { expandAll: () => ul.querySelectorAll('[aria-expanded="false"]').forEach(x => toggle(x, true)), collapseAll: () => ul.querySelectorAll('[aria-expanded="true"]').forEach(x => { if (+x.getAttribute('aria-level') > 1) toggle(x, false); }) };
}
