// Landing hero: a small animated isometric village drawn with the game's renderer.
import * as I from './play/iso.js';

const canvas = document.getElementById('hero-canvas');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLS = 9, ROWS = 8, t0 = performance.now();
const terrain = (x, y) => x === 0 ? 'water' : (y === 4 || x === 5) ? 'road' : 'grass';
const houses = [[2, 1], [3, 1], [2, 2], [7, 1], [7, 2], [2, 6], [3, 6], [7, 6], [8, 6], [3, 7]];
const trees = [[1, 0], [8, 0], [1, 7], [8, 3], [6, 7]];
let raf = 0;

function frame() {
  raf = 0;
  const t = (performance.now() - t0) / 1000;
  const { ctx, W, H } = I.setupCanvas(canvas);
  const v = I.makeView(W, H, COLS, ROWS, { padTop: 0.2 });
  const hour = reduced ? 14 : (t * 1.5) % 24, day = I.dayFromHour(hour), hi = Math.floor(hour);
  I.sky(ctx, W, H, day, t); I.mapEdges(ctx, v, COLS, ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) I.terrainTile(ctx, v, x, y, terrain(x, y), reduced ? 0 : t);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (houses.some(h => h[0] === x && h[1] === y)) I.house(ctx, v, x, y, { lit: day < 0.5, roof: (x + y) % 2 ? '#C9773A' : '#D9533A' });
    else if (trees.some(h => h[0] === x && h[1] === y)) I.tree(ctx, v, x, y, x + y);
    else if (x === 4 && y === 2) I.bigBuilding(ctx, v, x, y, { sign: '+', signColor: '#E5484D' });
    else if ((x === 6 || x === 7) && y === 3) I.solar(ctx, v, x, y);
    else if (x === 1 && y === 3) I.turbine(ctx, v, x, y, t, !reduced);
    else if (x === 6 && y === 5) I.battery(ctx, v, x, y, 0.35 + 0.35 * Math.sin(t / 3), t);
    else if (x === 4 && y === 6) I.tank(ctx, v, x, y, 0.6);
    else if (x === 1 && y === 5) I.pump(ctx, v, x, y, hi >= 8 && hi <= 16, t);
    else if (x === 8 && y === 4) I.gridPole(ctx, v, x, y, Math.floor(t / 7) % 3 !== 1);
    if (y === 4 && x > 0 && x !== 5 && x !== 8) I.pole(ctx, v, x, y, { e: x < 8, s: x === 6 });
    if (x === 5 && y !== 4) I.pole(ctx, v, x, y, { s: y < ROWS - 1, e: y === 4 });
  }
  I.nightOverlay(ctx, W, H, day);
  if (!reduced && !document.hidden) raf = requestAnimationFrame(frame);
}
function start() { if (!raf) raf = requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
new ResizeObserver(start).observe(canvas);
start();
