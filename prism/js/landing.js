// PRISM — landing page mini-demo (the triangle sample through the real pipeline).
import { getSample, toSVG } from './samples.js';
import { parseSVG } from './svg-parser.js';
import { describe } from './describe.js';
import { buildTree, outlineText } from './tree.js';
import { renderAccessibleSVG } from './accessible-svg.js';
import { Speaker } from './audio.js';
import { initChrome } from './ui.js';

initChrome();
const sample = getSample('triangle');
const speaker = new Speaker();
const params = { base: 3, height: 4 };
const $ = (id) => document.getElementById(id);
let levels = null;

function update() {
  const scene = parseSVG(toSVG(sample.build(params)), 'sample');
  $('demo-visual').innerHTML = renderAccessibleSVG(scene);
  levels = describe(scene);
  $('demo-desc').innerHTML = `<p>${levels.medium.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>`;
  const tree = buildTree(scene);
  $('demo-outline').textContent = outlineText({ ...tree, children: tree.children.filter(c => c.label === 'Objects') }).split('\n').slice(0, 22).join('\n') + '\n  …';
}
for (const k of ['base', 'height']) {
  const input = $(`demo-${k}`);
  input.addEventListener('input', () => { params[k] = Number(input.value); $(`demo-${k}-out`).textContent = `${input.value} cm`; update(); });
}
$('demo-speak').addEventListener('click', () => { if (!speaker.speak(levels?.medium)) { const live = $('a11y-live'); live.textContent = 'Speech synthesis is not available in this browser.'; } });
update();
