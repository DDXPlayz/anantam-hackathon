// PRISM — sample library.
// Each sample is a structured JSON description (axes, series, objects with
// properties, relationships, tables). `toSVG(spec)` renders that JSON into a
// semantic SVG: every meaningful element carries data-* attributes plus
// <title>/<desc>, so the parser (svg-parser.js) can read it back for real.

const W = 800, H = 500;
const PLOT = { left: 90, right: W - 30, top: 36, bottom: H - 80 };

export const COLORS = { blue: '#2563EB', orange: '#D97706', green: '#15803D', violet: '#7C3AED', red: '#DC2626', ink: '#111318', grey: '#6B7280' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n, d = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const r = Math.round(n * 10 ** d) / 10 ** d;
  return String(Number.isInteger(r) ? r : r.toFixed(d).replace(/\.?0+$/, ''));
};

/* ------------------------------------------------------------------ */
/* Least squares (used by the scatter sample to draw an honest trend)   */
export function linearFit(points) {
  const n = points.length; if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
  const den = n * sxx - sx * sx; if (Math.abs(den) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const r = (n * sxy - sx * sy) / Math.sqrt(den * (n * syy - sy * sy) || 1e-12);
  return { slope, intercept, r, r2: r * r };
}

/* ------------------------------------------------------------------ */
/* Sample definitions                                                   */
export const SAMPLES = [
  {
    id: 'line-graph', category: 'Line graph', name: 'Distance vs time', type: 'graph',
    params: [],
    build() {
      const a = [], b = [];
      for (let t = 0; t <= 10; t++) { a.push([t, 4 * t]); b.push([t, Math.round(0.4 * t * t * 10) / 10]); }
      return {
        type: 'graph', title: 'Distance travelled by two cars over ten seconds',
        desc: 'Line graph with two series. Car A moves at a constant speed; Car B accelerates.',
        axes: { x: { label: 'Time', unit: 'seconds', min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10] }, y: { label: 'Distance', unit: 'metres', min: 0, max: 50, ticks: [0, 10, 20, 30, 40, 50] } },
        series: [
          { id: 'car-a', name: 'Car A', kind: 'line', color: COLORS.blue, points: a },
          { id: 'car-b', name: 'Car B', kind: 'line', color: COLORS.orange, points: b, dash: true }
        ]
      };
    }
  },
  {
    id: 'bar-chart', category: 'Bar chart', name: 'Monthly rainfall', type: 'graph',
    params: [],
    build() {
      const cats = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const vals = [12, 18, 25, 44, 70, 96];
      return {
        type: 'graph', title: 'Monthly rainfall, January to June',
        desc: 'Bar chart with one series of six monthly rainfall totals.',
        axes: { x: { label: 'Month', unit: '', categories: cats }, y: { label: 'Rainfall', unit: 'millimetres', min: 0, max: 100, ticks: [0, 20, 40, 60, 80, 100] } },
        series: [{ id: 'rain', name: 'Rainfall', kind: 'bar', color: COLORS.blue, points: vals.map((v, i) => [i, v]) }]
      };
    }
  },
  {
    id: 'scatter-trend', category: 'Scatter plot', name: 'Study hours vs score', type: 'graph',
    params: [],
    build() {
      const raw = [[1, 52], [1.5, 58], [2, 55], [3, 64], [3.5, 70], [4, 66], [5, 74], [5.5, 79], [6, 76], [7, 85], [8, 88], [9, 93]];
      const fit = linearFit(raw);
      const trend = [[0, fit.intercept], [10, fit.intercept + fit.slope * 10]].map(([x, y]) => [x, Math.round(y * 10) / 10]);
      return {
        type: 'graph', title: 'Test score against weekly study hours for twelve students',
        desc: 'Scatter plot of twelve students with a least-squares trend line.',
        axes: { x: { label: 'Study time', unit: 'hours per week', min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10] }, y: { label: 'Test score', unit: 'percent', min: 40, max: 100, ticks: [40, 50, 60, 70, 80, 90, 100] } },
        series: [
          { id: 'students', name: 'Students', kind: 'scatter', color: COLORS.violet, points: raw },
          { id: 'trend', name: 'Trend line (least squares)', kind: 'line', color: COLORS.ink, points: trend, dash: true }
        ]
      };
    }
  },
  {
    id: 'triangle', category: 'Geometry', name: 'Right triangle 3-4-5', type: 'geometry',
    params: [
      { id: 'base', label: 'Base', unit: 'cm', min: 1, max: 8, step: 0.5, value: 3 },
      { id: 'height', label: 'Height', unit: 'cm', min: 1, max: 8, step: 0.5, value: 4 }
    ],
    build(p) {
      const b = p.base, h = p.height, hyp = Math.sqrt(b * b + h * h);
      const s = 44, ox = 180, oy = H - 90;
      const A = [ox, oy], B = [ox + b * s, oy], C = [ox, oy - h * s];
      const angB = Math.atan(h / b) * 180 / Math.PI, angC = 90 - angB;
      return {
        type: 'geometry', title: `Right-angled triangle with base ${fmt(b)} cm and height ${fmt(h)} cm`,
        desc: 'A right-angled triangle drawn with the right angle at the bottom-left corner.',
        objects: [
          { id: 'tri', kind: 'triangle', label: 'Triangle ABC', color: COLORS.blue,
            props: { 'Base': `${fmt(b)} cm`, 'Height': `${fmt(h)} cm`, 'Hypotenuse': `${fmt(hyp)} cm`, 'Right angle': 'between base and height, at A', 'Angle at B': `${fmt(angB, 1)}°`, 'Angle at C': `${fmt(angC, 1)}°`, 'Area': `${fmt(b * h / 2)} cm²`, 'Perimeter': `${fmt(b + h + hyp)} cm` },
            desc: `Right-angled triangle. Base ${fmt(b)} cm, height ${fmt(h)} cm, hypotenuse ${fmt(hyp)} cm.`,
            shapes: [{ shape: 'polygon', points: [A, B, C], fill: 'rgba(37,99,235,.12)' },
              { shape: 'text', x: ox - 22, y: oy + 26, text: 'A' }, { shape: 'text', x: B[0] + 14, y: oy + 26, text: 'B' }, { shape: 'text', x: ox - 22, y: C[1] - 8, text: 'C' }] },
          { id: 'base', kind: 'side', label: 'Base AB', props: { 'Length': `${fmt(b)} cm`, 'Position': 'horizontal, bottom' }, desc: `Base, ${fmt(b)} cm, horizontal.`, color: COLORS.ink,
            shapes: [{ shape: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1], width: 4 }, { shape: 'text', x: (A[0] + B[0]) / 2, y: oy + 34, text: `${fmt(b)} cm`, anchor: 'middle' }] },
          { id: 'height', kind: 'side', label: 'Height AC', props: { 'Length': `${fmt(h)} cm`, 'Position': 'vertical, left' }, desc: `Height, ${fmt(h)} cm, vertical.`, color: COLORS.ink,
            shapes: [{ shape: 'line', x1: A[0], y1: A[1], x2: C[0], y2: C[1], width: 4 }, { shape: 'text', x: ox - 16, y: (A[1] + C[1]) / 2 + 6, text: `${fmt(h)} cm`, anchor: 'end' }] },
          { id: 'hyp', kind: 'side', label: 'Hypotenuse BC', props: { 'Length': `${fmt(hyp)} cm`, 'Position': 'slanted, from B up to C' }, desc: `Hypotenuse, ${fmt(hyp)} cm, opposite the right angle.`, color: COLORS.ink,
            shapes: [{ shape: 'line', x1: B[0], y1: B[1], x2: C[0], y2: C[1], width: 4 }, { shape: 'text', x: (B[0] + C[0]) / 2 + 16, y: (B[1] + C[1]) / 2 - 6, text: `${fmt(hyp)} cm` }] },
          { id: 'right', kind: 'angle', label: 'Right angle at A', props: { 'Measure': '90°', 'Between': 'base and height' }, desc: 'Right angle, 90 degrees, between the base and the height.', color: COLORS.violet,
            shapes: [{ shape: 'polyline', points: [[ox + 18, oy], [ox + 18, oy - 18], [ox, oy - 18]], width: 3 }] }
        ],
        relations: [
          { from: 'base', to: 'tri', type: 'part of', label: 'Base is a side of the triangle' },
          { from: 'height', to: 'tri', type: 'part of', label: 'Height is a side of the triangle' },
          { from: 'hyp', to: 'tri', type: 'part of', label: 'Hypotenuse is the longest side of the triangle' },
          { from: 'base', to: 'height', type: 'perpendicular', label: 'Base and height meet at a right angle' },
          { from: 'hyp', to: 'right', type: 'opposite', label: 'Hypotenuse is opposite the right angle (Pythagoras: base² + height² = hypotenuse²)' }
        ]
      };
    }
  },
  {
    id: 'circle', category: 'Geometry', name: 'Circle with radius', type: 'geometry',
    params: [{ id: 'r', label: 'Radius', unit: 'cm', min: 1, max: 8, step: 0.5, value: 4 }],
    build(p) {
      const r = p.r, s = 26, cx = 400, cy = 250, R = r * s;
      return {
        type: 'geometry', title: `Circle with radius ${fmt(r)} cm`, desc: 'A circle with its centre marked and one radius drawn.',
        objects: [
          { id: 'circle', kind: 'circle', label: 'Circle', color: COLORS.blue,
            props: { 'Radius': `${fmt(r)} cm`, 'Diameter': `${fmt(2 * r)} cm`, 'Circumference': `${fmt(2 * Math.PI * r)} cm`, 'Area': `${fmt(Math.PI * r * r)} cm²` },
            desc: `Circle of radius ${fmt(r)} cm.`, shapes: [{ shape: 'circle', cx, cy, r: R, fill: 'rgba(37,99,235,.10)' }] },
          { id: 'centre', kind: 'point', label: 'Centre O', props: { 'Position': 'middle of the circle' }, desc: 'Centre point O.', color: COLORS.ink,
            shapes: [{ shape: 'circle', cx, cy, r: 6, fill: COLORS.ink }, { shape: 'text', x: cx - 12, y: cy + 28, text: 'O' }] },
          { id: 'radius', kind: 'segment', label: 'Radius OP', props: { 'Length': `${fmt(r)} cm`, 'From': 'centre O', 'To': 'point P on the circle' }, desc: `Radius, ${fmt(r)} cm, from the centre to the edge.`, color: COLORS.violet,
            shapes: [{ shape: 'line', x1: cx, y1: cy, x2: cx + R, y2: cy, width: 4 }, { shape: 'text', x: cx + R / 2, y: cy - 12, text: `r = ${fmt(r)} cm`, anchor: 'middle' }, { shape: 'text', x: cx + R + 10, y: cy + 8, text: 'P' }] }
        ],
        relations: [{ from: 'radius', to: 'circle', type: 'part of', label: 'The radius joins the centre to the circumference' }, { from: 'centre', to: 'circle', type: 'centre of', label: 'O is the centre of the circle' }]
      };
    }
  },
  {
    id: 'angles', category: 'Geometry', name: 'Angles on a line', type: 'geometry',
    params: [{ id: 'theta', label: 'Angle a', unit: '°', min: 10, max: 170, step: 5, value: 60 }],
    build(p) {
      const t = p.theta, ox = 400, oy = 340, L = 300;
      const rad = t * Math.PI / 180; const ex = ox + Math.cos(rad) * 220, ey = oy - Math.sin(rad) * 220;
      const arc = (r, a0, a1) => { const p0 = [ox + Math.cos(a0) * r, oy - Math.sin(a0) * r], p1 = [ox + Math.cos(a1) * r, oy - Math.sin(a1) * r]; return `M ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${(a1 - a0) > Math.PI ? 1 : 0} 0 ${p1[0]} ${p1[1]}`; };
      return {
        type: 'geometry', title: `Two angles on a straight line: ${t}° and ${180 - t}°`, desc: 'A straight line with a ray from a point on it, making two adjacent angles.',
        objects: [
          { id: 'line', kind: 'line', label: 'Straight line XY', props: { 'Angle along the line': '180°' }, desc: 'A horizontal straight line through point O.', color: COLORS.ink,
            shapes: [{ shape: 'line', x1: ox - L, y1: oy, x2: ox + L, y2: oy, width: 4 }, { shape: 'text', x: ox - L - 26, y: oy + 8, text: 'X' }, { shape: 'text', x: ox + L + 12, y: oy + 8, text: 'Y' }, { shape: 'text', x: ox - 8, y: oy + 34, text: 'O' }] },
          { id: 'ray', kind: 'ray', label: 'Ray OP', props: { 'Direction': `${t}° above the line, measured from Y` }, desc: `A ray from O, tilted ${t} degrees from the line.`, color: COLORS.blue,
            shapes: [{ shape: 'line', x1: ox, y1: oy, x2: ex, y2: ey, width: 4 }, { shape: 'text', x: ex + 8, y: ey - 6, text: 'P' }] },
          { id: 'a', kind: 'angle', label: 'Angle a', props: { 'Measure': `${t}°`, 'Between': 'ray OP and OY', 'Type': t < 90 ? 'acute' : t === 90 ? 'right' : 'obtuse' }, desc: `Angle a is ${t} degrees, between the ray and the right-hand part of the line.`, color: COLORS.violet,
            shapes: [{ shape: 'path', d: arc(60, 0, rad), width: 4 }, { shape: 'text', x: ox + Math.cos(rad / 2) * 90, y: oy - Math.sin(rad / 2) * 90 + 8, text: `a = ${t}°`, anchor: 'middle' }] },
          { id: 'b', kind: 'angle', label: 'Angle b', props: { 'Measure': `${180 - t}°`, 'Between': 'ray OP and OX', 'Type': 180 - t < 90 ? 'acute' : 180 - t === 90 ? 'right' : 'obtuse' }, desc: `Angle b is ${180 - t} degrees, between the ray and the left-hand part of the line.`, color: COLORS.green,
            shapes: [{ shape: 'path', d: arc(80, rad, Math.PI), width: 4 }, { shape: 'text', x: ox + Math.cos((rad + Math.PI) / 2) * 112, y: oy - Math.sin((rad + Math.PI) / 2) * 112 + 8, text: `b = ${180 - t}°`, anchor: 'middle' }] }
        ],
        relations: [{ from: 'a', to: 'b', type: 'supplementary', label: `a + b = 180° (${t}° + ${180 - t}° = 180°)` }, { from: 'ray', to: 'line', type: 'meets', label: 'The ray meets the line at O' }]
      };
    }
  },
  {
    id: 'circuit', category: 'Circuit', name: 'Battery, resistors, LED', type: 'circuit',
    params: [{ id: 'v', label: 'Battery voltage', unit: 'V', min: 3, max: 12, step: 0.5, value: 9 }],
    build(p) {
      const V = p.v, R1 = 220, R2 = 330, Vled = 2, Rt = R1 + R2, I = Math.max(0, (V - Vled) / Rt);
      const L = 120, R = 680, T = 90, B = 400;
      const zig = (x0, y, w) => { const pts = [[x0, y]]; const n = 8, step = w / n; for (let i = 0; i < n; i++) pts.push([x0 + step * (i + 0.5), y + (i % 2 ? 14 : -14)]); pts.push([x0 + w, y]); return pts; };
      return {
        type: 'circuit', title: `Series circuit: ${fmt(V)} V battery, two resistors and an LED`, desc: 'A single loop. Current flows from the battery through R1, then R2, then the LED, and back.',
        objects: [
          { id: 'battery', kind: 'battery', label: 'Battery', color: COLORS.ink, props: { 'Voltage': `${fmt(V)} V`, 'Position': 'left side of the loop', 'Terminals': 'positive at top (long line), negative at bottom (short line)' }, desc: `${fmt(V)} volt battery on the left side.`,
            shapes: [{ shape: 'line', x1: L - 30, y1: 230, x2: L + 30, y2: 230, width: 5 }, { shape: 'line', x1: L - 16, y1: 250, x2: L + 16, y2: 250, width: 5 }, { shape: 'line', x1: L - 30, y1: 270, x2: L + 30, y2: 270, width: 5 }, { shape: 'line', x1: L - 16, y1: 290, x2: L + 16, y2: 290, width: 5 }, { shape: 'text', x: L - 44, y: 222, text: '+', size: 26 }, { shape: 'text', x: L - 44, y: 310, text: '−', size: 26 }, { shape: 'text', x: L + 44, y: 266, text: `${fmt(V)} V` }] },
          { id: 'r1', kind: 'resistor', label: 'Resistor R1', color: COLORS.orange, props: { 'Resistance': `${R1} Ω`, 'Position': 'top wire, left' }, desc: `Resistor R1, ${R1} ohms, on the top wire.`,
            shapes: [{ shape: 'polyline', points: zig(250, T, 110), width: 4 }, { shape: 'text', x: 305, y: T - 24, text: `R1 = ${R1} Ω`, anchor: 'middle' }] },
          { id: 'r2', kind: 'resistor', label: 'Resistor R2', color: COLORS.orange, props: { 'Resistance': `${R2} Ω`, 'Position': 'top wire, right' }, desc: `Resistor R2, ${R2} ohms, on the top wire after R1.`,
            shapes: [{ shape: 'polyline', points: zig(450, T, 110), width: 4 }, { shape: 'text', x: 505, y: T - 24, text: `R2 = ${R2} Ω`, anchor: 'middle' }] },
          { id: 'led', kind: 'led', label: 'LED', color: COLORS.red, props: { 'Forward voltage (assumed)': `${Vled} V`, 'Position': 'right side of the loop', 'Direction': 'anode at top, cathode at bottom' }, desc: 'Light-emitting diode on the right side, pointing downward.',
            shapes: [{ shape: 'polygon', points: [[R - 26, 225], [R + 26, 225], [R, 265]], fill: 'rgba(220,38,38,.15)', width: 4 }, { shape: 'line', x1: R - 26, y1: 265, x2: R + 26, y2: 265, width: 4 }, { shape: 'line', x1: R + 22, y1: 236, x2: R + 48, y2: 214, width: 3 }, { shape: 'line', x1: R + 30, y1: 252, x2: R + 56, y2: 230, width: 3 }, { shape: 'text', x: R - 90, y: 252, text: 'LED' }] }
        ],
        relations: [
          { from: 'battery', to: 'r1', type: 'wire', label: 'Battery positive terminal connects to R1', shapes: [{ shape: 'polyline', points: [[L, 230], [L, T], [250, T]], width: 3 }] },
          { from: 'r1', to: 'r2', type: 'wire', label: 'R1 connects in series to R2', shapes: [{ shape: 'line', x1: 360, y1: T, x2: 450, y2: T, width: 3 }] },
          { from: 'r2', to: 'led', type: 'wire', label: 'R2 connects to the LED anode', shapes: [{ shape: 'polyline', points: [[560, T], [R, T], [R, 225]], width: 3 }] },
          { from: 'led', to: 'battery', type: 'wire', label: 'LED cathode returns to the battery negative terminal', shapes: [{ shape: 'polyline', points: [[R, 265], [R, B], [L, B], [L, 290]], width: 3 }] }
        ],
        summary: { 'Topology': 'single series loop', 'Total resistance': `${Rt} Ω`, 'Estimated current': `${fmt(I * 1000, 1)} mA (assuming a ${Vled} V drop across the LED)`, 'Voltage across R1': `${fmt(I * R1)} V`, 'Voltage across R2': `${fmt(I * R2)} V` }
      };
    }
  },
  {
    id: 'plant-cell', category: 'Science diagram', name: 'Labelled plant cell', type: 'diagram',
    params: [],
    build() {
      const lbl = (x1, y1, x2, y2, text, anchor = 'start') => [{ shape: 'line', x1, y1, x2, y2, width: 2, color: COLORS.grey }, { shape: 'text', x: x2 + (anchor === 'end' ? -6 : 6), y: y2 + 6, text, anchor }];
      return {
        type: 'diagram', title: 'Labelled diagram of a plant cell', desc: 'A rectangular plant cell with six labelled parts.',
        objects: [
          { id: 'wall', kind: 'structure', label: 'Cell wall', color: COLORS.green, props: { 'Function': 'rigid outer layer that gives the cell its shape', 'Made of': 'cellulose' }, desc: 'Thick outer boundary, rectangular with rounded corners.', shapes: [{ shape: 'rect', x: 160, y: 60, w: 480, h: 380, rx: 30, width: 8 }, ...lbl(160, 100, 60, 70, 'Cell wall', 'start')] },
          { id: 'membrane', kind: 'structure', label: 'Cell membrane', color: COLORS.ink, props: { 'Function': 'controls what enters and leaves the cell' }, desc: 'Thin line just inside the cell wall.', shapes: [{ shape: 'rect', x: 176, y: 76, w: 448, h: 348, rx: 24, width: 2 }, ...lbl(176, 380, 60, 430, 'Cell membrane', 'start')] },
          { id: 'cytoplasm', kind: 'structure', label: 'Cytoplasm', color: COLORS.grey, props: { 'Function': 'jelly-like fluid where chemical reactions happen' }, desc: 'Fills the space inside the membrane.', shapes: [{ shape: 'text', x: 600, y: 410, text: 'Cytoplasm', anchor: 'end' }] },
          { id: 'vacuole', kind: 'structure', label: 'Vacuole', color: COLORS.blue, props: { 'Function': 'stores water and keeps the cell firm', 'Size': 'large, central' }, desc: 'Large oval in the centre-right of the cell.', shapes: [{ shape: 'ellipse', cx: 440, cy: 250, rx: 130, ry: 100, fill: 'rgba(37,99,235,.10)', width: 3 }, ...lbl(560, 300, 700, 340, 'Vacuole', 'start')] },
          { id: 'nucleus', kind: 'structure', label: 'Nucleus', color: COLORS.violet, props: { 'Function': 'controls the cell and holds genetic material (DNA)' }, desc: 'Circle in the upper-left region.', shapes: [{ shape: 'circle', cx: 260, cy: 160, r: 48, fill: 'rgba(124,58,237,.14)', width: 3 }, { shape: 'circle', cx: 272, cy: 150, r: 12, fill: 'rgba(124,58,237,.5)', width: 0 }, ...lbl(300, 130, 700, 60, 'Nucleus', 'start')] },
          { id: 'chloro', kind: 'structure', label: 'Chloroplasts', color: COLORS.green, props: { 'Function': 'site of photosynthesis', 'Count in diagram': '3', 'Contains': 'chlorophyll' }, desc: 'Three small green ovals scattered in the cytoplasm.', shapes: [{ shape: 'ellipse', cx: 250, cy: 330, rx: 34, ry: 18, fill: 'rgba(21,128,61,.25)', width: 2 }, { shape: 'ellipse', cx: 330, cy: 390, rx: 34, ry: 18, fill: 'rgba(21,128,61,.25)', width: 2 }, { shape: 'ellipse', cx: 560, cy: 120, rx: 34, ry: 18, fill: 'rgba(21,128,61,.25)', width: 2 }, ...lbl(250, 348, 60, 300, 'Chloroplast', 'start')] }
        ],
        relations: [
          { from: 'membrane', to: 'wall', type: 'inside', label: 'The cell membrane lies just inside the cell wall' },
          { from: 'nucleus', to: 'cytoplasm', type: 'inside', label: 'The nucleus sits in the cytoplasm' },
          { from: 'vacuole', to: 'cytoplasm', type: 'inside', label: 'The vacuole takes up most of the cytoplasm' },
          { from: 'chloro', to: 'cytoplasm', type: 'inside', label: 'Chloroplasts are scattered in the cytoplasm' }
        ]
      };
    }
  },
  {
    id: 'lever', category: 'Science diagram', name: 'Simple lever', type: 'diagram',
    params: [
      { id: 'load', label: 'Load', unit: 'N', min: 10, max: 200, step: 10, value: 100 },
      { id: 'dl', label: 'Load arm', unit: 'm', min: 0.5, max: 2, step: 0.25, value: 1 },
      { id: 'de', label: 'Effort arm', unit: 'm', min: 0.5, max: 4, step: 0.25, value: 2 }
    ],
    build(p) {
      const s = 110, fx = 400, fy = 330, effort = p.load * p.dl / p.de, ma = p.de / p.dl;
      const lx = fx - p.dl * s, ex = fx + p.de * s;
      const beamY = fy - 20;
      return {
        type: 'diagram', title: `Simple lever balancing a ${p.load} N load`, desc: 'A first-class lever: a beam resting on a fulcrum, with the load on the left and the effort on the right.',
        objects: [
          { id: 'beam', kind: 'beam', label: 'Beam', color: COLORS.ink, props: { 'Length shown': `${fmt(p.dl + p.de)} m`, 'Rests on': 'the fulcrum' }, desc: 'Horizontal rigid beam.', shapes: [{ shape: 'line', x1: lx - 30, y1: beamY, x2: ex + 30, y2: beamY, width: 8 }] },
          { id: 'fulcrum', kind: 'fulcrum', label: 'Fulcrum', color: COLORS.violet, props: { 'Position': `${fmt(p.dl)} m from the load, ${fmt(p.de)} m from the effort` }, desc: 'Triangle under the beam; the pivot point.', shapes: [{ shape: 'polygon', points: [[fx, beamY + 4], [fx - 36, fy + 50], [fx + 36, fy + 50]], fill: 'rgba(124,58,237,.18)', width: 3 }, { shape: 'text', x: fx, y: fy + 80, text: 'Fulcrum', anchor: 'middle' }] },
          { id: 'load', kind: 'force', label: 'Load', color: COLORS.orange, props: { 'Force': `${p.load} N`, 'Distance from fulcrum': `${fmt(p.dl)} m`, 'Direction': 'downward' }, desc: `Load of ${p.load} newtons sitting on the left end.`, shapes: [{ shape: 'rect', x: lx - 30, y: beamY - 64, w: 60, h: 60, fill: 'rgba(217,119,6,.2)', width: 3 }, { shape: 'text', x: lx, y: beamY - 26, text: `${p.load} N`, anchor: 'middle' }, { shape: 'text', x: lx, y: beamY - 76, text: 'Load', anchor: 'middle' }] },
          { id: 'effort', kind: 'force', label: 'Effort', color: COLORS.blue, props: { 'Force needed to balance': `${fmt(effort, 1)} N`, 'Distance from fulcrum': `${fmt(p.de)} m`, 'Direction': 'downward' }, desc: `Effort of ${fmt(effort, 1)} newtons pushing down on the right end.`, shapes: [{ shape: 'line', x1: ex, y1: beamY - 110, x2: ex, y2: beamY - 14, width: 5 }, { shape: 'polygon', points: [[ex - 12, beamY - 30], [ex + 12, beamY - 30], [ex, beamY - 8]], fill: COLORS.blue, width: 0 }, { shape: 'text', x: ex, y: beamY - 122, text: `Effort ${fmt(effort, 1)} N`, anchor: 'middle' }] },
          { id: 'dl', kind: 'distance', label: 'Load arm', color: COLORS.grey, props: { 'Length': `${fmt(p.dl)} m` }, desc: 'Distance from the load to the fulcrum.', shapes: [{ shape: 'line', x1: lx, y1: fy + 20, x2: fx - 40, y2: fy + 20, width: 2, color: COLORS.grey }, { shape: 'text', x: (lx + fx) / 2 - 20, y: fy + 44, text: `${fmt(p.dl)} m`, anchor: 'middle' }] },
          { id: 'de', kind: 'distance', label: 'Effort arm', color: COLORS.grey, props: { 'Length': `${fmt(p.de)} m` }, desc: 'Distance from the fulcrum to the effort.', shapes: [{ shape: 'line', x1: fx + 40, y1: fy + 20, x2: ex, y2: fy + 20, width: 2, color: COLORS.grey }, { shape: 'text', x: (fx + ex) / 2 + 20, y: fy + 44, text: `${fmt(p.de)} m`, anchor: 'middle' }] }
        ],
        relations: [
          { from: 'load', to: 'effort', type: 'balances', label: `Moments balance: ${p.load} N × ${fmt(p.dl)} m = ${fmt(effort, 1)} N × ${fmt(p.de)} m` },
          { from: 'fulcrum', to: 'beam', type: 'supports', label: 'The fulcrum supports the beam between load and effort' }
        ],
        summary: { 'Lever class': 'first class (fulcrum between load and effort)', 'Mechanical advantage': fmt(ma, 2), 'Effort needed': `${fmt(effort, 1)} N` }
      };
    }
  },
  {
    id: 'table', category: 'Table', name: 'Planet data table', type: 'table',
    params: [],
    build() {
      return {
        type: 'table', title: 'Four inner planets: size, moons and day length', desc: 'A data table with four columns and four data rows.',
        table: {
          headers: ['Planet', 'Diameter (km)', 'Moons', 'Day length (hours)'],
          rows: [['Mercury', '4,879', '0', '4,222.6'], ['Venus', '12,104', '0', '2,802'], ['Earth', '12,756', '1', '24'], ['Mars', '6,792', '2', '24.7']]
        }
      };
    }
  },
  {
    id: 'flowchart', category: 'Flowchart', name: 'Even or odd?', type: 'flowchart',
    params: [],
    build() {
      const node = (id, kind, label, x, y, w, h, extra = {}) => {
        let shapes;
        if (kind === 'terminal') shapes = [{ shape: 'rect', x: x - w / 2, y: y - h / 2, w, h, rx: h / 2, fill: 'rgba(21,128,61,.12)', width: 3 }];
        else if (kind === 'decision') shapes = [{ shape: 'polygon', points: [[x, y - h / 2], [x + w / 2, y], [x, y + h / 2], [x - w / 2, y]], fill: 'rgba(124,58,237,.12)', width: 3 }];
        else if (kind === 'input') shapes = [{ shape: 'polygon', points: [[x - w / 2 + 16, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2 - 16, y + h / 2], [x - w / 2, y + h / 2]], fill: 'rgba(37,99,235,.12)', width: 3 }];
        else shapes = [{ shape: 'rect', x: x - w / 2, y: y - h / 2, w, h, rx: 6, fill: 'rgba(217,119,6,.12)', width: 3 }];
        shapes.push({ shape: 'text', x, y: y + 7, text: label, anchor: 'middle' });
        return { id, kind, label, props: { 'Step type': kind, ...extra }, desc: `${kind} step: ${label}`, color: COLORS.ink, shapes };
      };
      const arrow = (from, to, pts, label) => ({ from, to, type: 'next', label: label ? `${from} → ${to} when ${label}` : `${from} → ${to}`, shapes: [{ shape: 'polyline', points: pts, width: 3, arrow: true }, ...(label ? [{ shape: 'text', x: pts[pts.length - 1][0] + (pts[pts.length - 1][0] < 400 ? -40 : 40), y: (pts[0][1] + pts[pts.length - 1][1]) / 2 - 10, text: label, anchor: 'middle' }] : [])] });
      return {
        type: 'flowchart', title: 'Deciding whether a number is even or odd', desc: 'Six steps: start, input, one decision with two branches, and an end.',
        objects: [
          node('start', 'terminal', 'Start', 400, 50, 160, 50),
          node('input', 'input', 'Input a number n', 400, 130, 260, 54),
          node('decide', 'decision', 'Is n ÷ 2 a whole number?', 400, 250, 360, 110, { 'Branches': 'Yes → Print Even; No → Print Odd' }),
          node('even', 'process', 'Print Even', 200, 380, 200, 54),
          node('odd', 'process', 'Print Odd', 600, 380, 200, 54),
          node('end', 'terminal', 'End', 400, 460, 160, 50)
        ],
        relations: [
          arrow('start', 'input', [[400, 75], [400, 103]]),
          arrow('input', 'decide', [[400, 157], [400, 195]]),
          arrow('decide', 'even', [[220, 250], [200, 250], [200, 353]], 'Yes'),
          arrow('decide', 'odd', [[580, 250], [600, 250], [600, 353]], 'No'),
          arrow('even', 'end', [[200, 407], [200, 460], [320, 460]]),
          arrow('odd', 'end', [[600, 407], [600, 460], [480, 460]])
        ]
      };
    }
  },
  {
    id: 'parabola', category: 'Mathematics', name: 'Function plot y = a·x² + c', type: 'graph',
    params: [
      { id: 'a', label: 'Coefficient a', unit: '', min: -3, max: 3, step: 0.25, value: 1 },
      { id: 'c', label: 'Constant c', unit: '', min: -6, max: 6, step: 0.5, value: 0 }
    ],
    build(p) {
      const pts = [];
      for (let x = -3; x <= 3.0001; x += 0.25) pts.push([Math.round(x * 100) / 100, Math.round((p.a * x * x + p.c) * 100) / 100]);
      const eq = `y = ${p.a === 1 ? '' : p.a === -1 ? '−' : fmt(p.a)}x²${p.c ? (p.c > 0 ? ' + ' + fmt(p.c) : ' − ' + fmt(-p.c)) : ''}`;
      return {
        type: 'graph', subtype: 'function', title: `Graph of ${eq}`, desc: `The curve ${eq} plotted for x from −3 to 3.`,
        axes: { x: { label: 'x', unit: '', min: -3, max: 3, ticks: [-3, -2, -1, 0, 1, 2, 3] }, y: { label: 'y', unit: '', min: -10, max: 10, ticks: [-10, -5, 0, 5, 10] } },
        series: [{ id: 'f', name: eq, kind: 'line', color: COLORS.violet, points: pts }],
        equation: { a: p.a, c: p.c, text: eq }
      };
    }
  },
  {
    id: 'vectors', category: 'Mathematics', name: 'Vector addition', type: 'math',
    params: [
      { id: 'ux', label: 'u, x-component', unit: '', min: -4, max: 4, step: 1, value: 3 },
      { id: 'uy', label: 'u, y-component', unit: '', min: -4, max: 4, step: 1, value: 1 },
      { id: 'vx', label: 'v, x-component', unit: '', min: -4, max: 4, step: 1, value: 1 },
      { id: 'vy', label: 'v, y-component', unit: '', min: -4, max: 4, step: 1, value: 2 }
    ],
    build(p) {
      const s = 42, ox = 400, oy = 260;
      const P = (x, y) => [ox + x * s, oy - y * s];
      const wx = p.ux + p.vx, wy = p.uy + p.vy;
      const mag = (x, y) => Math.hypot(x, y), ang = (x, y) => (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      const vec = (id, label, x, y, color, from = [0, 0]) => ({ id, kind: 'vector', label, color, props: { 'Components': `(${x}, ${y})`, 'Magnitude': fmt(mag(x, y)), 'Direction': `${fmt(ang(x, y), 1)}° from the positive x-axis`, 'Tail at': `(${from[0]}, ${from[1]})` }, desc: `Vector ${label} = (${x}, ${y}), length ${fmt(mag(x, y))}.`, shapes: [{ shape: 'polyline', points: [P(from[0], from[1]), P(from[0] + x, from[1] + y)], width: 5, arrow: true }, { shape: 'text', x: P(from[0] + x / 2, from[1] + y / 2)[0] + 10, y: P(from[0] + x / 2, from[1] + y / 2)[1] - 8, text: label }] });
      const grid = [];
      for (let g = -9; g <= 9; g++) { grid.push({ shape: 'line', x1: ox + g * s, y1: 20, x2: ox + g * s, y2: 480, width: 1, color: '#D5D8E2' }); }
      for (let g = -5; g <= 5; g++) { grid.push({ shape: 'line', x1: 30, y1: oy + g * s, x2: 770, y2: oy + g * s, width: 1, color: '#D5D8E2' }); }
      return {
        type: 'math', title: 'Adding two vectors on a grid', desc: 'Vector u in blue, vector v in orange placed tip-to-tail after u, and their sum w in violet.',
        objects: [
          { id: 'grid', kind: 'grid', label: 'Coordinate grid', color: COLORS.grey, props: { 'Spacing': '1 unit', 'Origin': 'centre of the diagram' }, desc: 'Square grid with x and y axes through the origin.', shapes: [...grid, { shape: 'line', x1: 30, y1: oy, x2: 770, y2: oy, width: 3 }, { shape: 'line', x1: ox, y1: 20, x2: ox, y2: 480, width: 3 }, { shape: 'text', x: 752, y: oy - 10, text: 'x' }, { shape: 'text', x: ox + 10, y: 36, text: 'y' }] },
          vec('u', 'u', p.ux, p.uy, COLORS.blue),
          vec('v', 'v', p.vx, p.vy, COLORS.orange, [p.ux, p.uy]),
          vec('w', 'u + v', wx, wy, COLORS.violet)
        ],
        relations: [{ from: 'u', to: 'v', type: 'tip to tail', label: 'v starts where u ends' }, { from: 'w', to: 'u', type: 'sum', label: `u + v = (${p.ux} + ${p.vx}, ${p.uy} + ${p.vy}) = (${wx}, ${wy})` }]
      };
    }
  },
  {
    id: 'water', category: 'Chemistry', name: 'Water molecule H₂O', type: 'chemistry',
    params: [],
    build() {
      const cx = 400, cy = 230, bl = 150, half = 104.5 / 2 * Math.PI / 180;
      const H1 = [cx - Math.sin(half) * bl, cy + Math.cos(half) * bl], H2 = [cx + Math.sin(half) * bl, cy + Math.cos(half) * bl];
      return {
        type: 'chemistry', title: 'Water molecule, H₂O', desc: 'One oxygen atom bonded to two hydrogen atoms in a bent shape.',
        objects: [
          { id: 'o', kind: 'atom', label: 'Oxygen atom (O)', color: COLORS.red, props: { 'Element': 'oxygen', 'Symbol': 'O', 'Bonds': '2 single bonds', 'Lone pairs': '2', 'Partial charge': 'slightly negative (δ−)' }, desc: 'Large red circle at the top centre.', shapes: [{ shape: 'circle', cx, cy, r: 56, fill: 'rgba(220,38,38,.18)', width: 4 }, { shape: 'text', x: cx, y: cy + 10, text: 'O', anchor: 'middle', size: 30 }, { shape: 'text', x: cx, y: cy - 72, text: 'δ−', anchor: 'middle' }] },
          { id: 'h1', kind: 'atom', label: 'Hydrogen atom (H, left)', color: COLORS.blue, props: { 'Element': 'hydrogen', 'Symbol': 'H', 'Bonds': '1 single bond to O', 'Partial charge': 'slightly positive (δ+)' }, desc: 'Small blue circle, lower left.', shapes: [{ shape: 'circle', cx: H1[0], cy: H1[1], r: 34, fill: 'rgba(37,99,235,.16)', width: 4 }, { shape: 'text', x: H1[0], y: H1[1] + 9, text: 'H', anchor: 'middle', size: 26 }, { shape: 'text', x: H1[0] - 60, y: H1[1] + 8, text: 'δ+', anchor: 'middle' }] },
          { id: 'h2', kind: 'atom', label: 'Hydrogen atom (H, right)', color: COLORS.blue, props: { 'Element': 'hydrogen', 'Symbol': 'H', 'Bonds': '1 single bond to O', 'Partial charge': 'slightly positive (δ+)' }, desc: 'Small blue circle, lower right.', shapes: [{ shape: 'circle', cx: H2[0], cy: H2[1], r: 34, fill: 'rgba(37,99,235,.16)', width: 4 }, { shape: 'text', x: H2[0], y: H2[1] + 9, text: 'H', anchor: 'middle', size: 26 }, { shape: 'text', x: H2[0] + 60, y: H2[1] + 8, text: 'δ+', anchor: 'middle' }] },
          { id: 'angle', kind: 'angle', label: 'Bond angle', color: COLORS.violet, props: { 'Measure': '104.5°', 'Between': 'the two O–H bonds', 'Shape': 'bent (V-shaped)' }, desc: 'The H–O–H angle is 104.5 degrees.', shapes: [{ shape: 'path', d: `M ${cx - Math.sin(half) * 80} ${cy + Math.cos(half) * 80} A 80 80 0 0 0 ${cx + Math.sin(half) * 80} ${cy + Math.cos(half) * 80}`, width: 3 }, { shape: 'text', x: cx, y: cy + 118, text: '104.5°', anchor: 'middle' }] }
        ],
        relations: [
          { from: 'o', to: 'h1', type: 'single bond', label: 'O–H single covalent bond, length 0.096 nm', shapes: [{ shape: 'line', x1: cx, y1: cy, x2: H1[0], y2: H1[1], width: 6, color: COLORS.ink }] },
          { from: 'o', to: 'h2', type: 'single bond', label: 'O–H single covalent bond, length 0.096 nm', shapes: [{ shape: 'line', x1: cx, y1: cy, x2: H2[0], y2: H2[1], width: 6, color: COLORS.ink }] }
        ],
        summary: { 'Formula': 'H₂O', 'Shape': 'bent', 'Bond angle': '104.5°', 'Polarity': 'polar molecule' }
      };
    }
  }
];

export function getSample(id) { return SAMPLES.find(s => s.id === id); }
export function defaultParams(sample) { const p = {}; for (const q of sample.params || []) p[q.id] = q.value; return p; }

/* ------------------------------------------------------------------ */
/* Scales                                                                */
export function makeScales(axes) {
  const x = axes.x, y = axes.y;
  const xs = x.categories
    ? { px0: PLOT.left, px1: PLOT.right, cat: true, n: x.categories.length, map: (i) => PLOT.left + (i + 0.5) * (PLOT.right - PLOT.left) / x.categories.length }
    : { px0: PLOT.left, px1: PLOT.right, map: (v) => PLOT.left + (v - x.min) / (x.max - x.min) * (PLOT.right - PLOT.left) };
  const ys = { px0: PLOT.bottom, px1: PLOT.top, map: (v) => PLOT.bottom - (v - y.min) / (y.max - y.min) * (PLOT.bottom - PLOT.top) };
  return { xs, ys };
}

/* ------------------------------------------------------------------ */
/* Shape → SVG                                                           */
function shapeSVG(sh, color) {
  const stroke = sh.color || color || COLORS.ink;
  const w = sh.width ?? 3;
  const fill = sh.fill || 'none';
  const cls = 'stroke';
  switch (sh.shape) {
    case 'polygon': return `<polygon class="${cls}" points="${sh.points.map(p => p.map(v => fmt(v, 1)).join(',')).join(' ')}" fill="${fill}" stroke="${w ? stroke : 'none'}" stroke-width="${w}" stroke-linejoin="round"/>`;
    case 'polyline': return `<polyline class="${cls}" points="${sh.points.map(p => p.map(v => fmt(v, 1)).join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${sh.arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
    case 'line': return `<line class="${cls}" x1="${fmt(sh.x1, 1)}" y1="${fmt(sh.y1, 1)}" x2="${fmt(sh.x2, 1)}" y2="${fmt(sh.y2, 1)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
    case 'circle': return `<circle class="${cls}" cx="${fmt(sh.cx, 1)}" cy="${fmt(sh.cy, 1)}" r="${fmt(sh.r, 1)}" fill="${fill}" stroke="${w ? stroke : 'none'}" stroke-width="${w}"/>`;
    case 'ellipse': return `<ellipse class="${cls}" cx="${fmt(sh.cx, 1)}" cy="${fmt(sh.cy, 1)}" rx="${fmt(sh.rx, 1)}" ry="${fmt(sh.ry, 1)}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
    case 'rect': return `<rect class="${cls}" x="${fmt(sh.x, 1)}" y="${fmt(sh.y, 1)}" width="${fmt(sh.w, 1)}" height="${fmt(sh.h, 1)}" rx="${sh.rx || 0}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
    case 'path': return `<path class="${cls}" d="${sh.d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
    case 'text': return `<text data-role="label" x="${fmt(sh.x, 1)}" y="${fmt(sh.y, 1)}" font-size="${sh.size || 20}" font-weight="700" fill="${COLORS.ink}" text-anchor="${sh.anchor || 'start'}">${esc(sh.text)}</text>`;
    default: return '';
  }
}

/* ------------------------------------------------------------------ */
/* Spec → semantic SVG                                                   */
export function toSVG(spec) {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="pt pd" data-prism="1" data-type="${esc(spec.type)}"${spec.subtype ? ` data-subtype="${esc(spec.subtype)}"` : ''} font-family="Atkinson Hyperlegible, Arial, sans-serif">`);
  out.push(`<title id="pt">${esc(spec.title)}</title><desc id="pd">${esc(spec.desc)}</desc>`);
  out.push(`<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="#FFFFFF" data-role="background"/>`);
  if (spec.summary) out.push(`<metadata data-role="summary">${esc(JSON.stringify(spec.summary))}</metadata>`);
  if (spec.equation) out.push(`<metadata data-role="equation">${esc(JSON.stringify(spec.equation))}</metadata>`);

  if (spec.axes) {
    const { xs, ys } = makeScales(spec.axes);
    const x = spec.axes.x, y = spec.axes.y;
    // Zero lines for signed axes
    const zx = !x.categories && x.min < 0 && x.max > 0 ? xs.map(0) : PLOT.left;
    const zy = y.min < 0 && y.max > 0 ? ys.map(0) : PLOT.bottom;
    // x axis
    out.push(`<g data-role="axis" data-axis="x" data-label="${esc(x.label)}" data-unit="${esc(x.unit || '')}" ${x.categories ? `data-categories="${esc(x.categories.join('|'))}"` : `data-min="${x.min}" data-max="${x.max}" data-ticks="${x.ticks.join(',')}"`} data-px0="${xs.px0}" data-px1="${xs.px1}"><title>x-axis: ${esc(x.label)}${x.unit ? ' (' + esc(x.unit) + ')' : ''}</title>`);
    out.push(`<line x1="${PLOT.left}" y1="${fmt(zy, 1)}" x2="${PLOT.right}" y2="${fmt(zy, 1)}" stroke="${COLORS.ink}" stroke-width="3"/>`);
    if (x.categories) x.categories.forEach((c, i) => out.push(`<text data-role="tick" x="${fmt(xs.map(i), 1)}" y="${PLOT.bottom + 28}" text-anchor="middle" font-size="18" fill="${COLORS.ink}">${esc(c)}</text>`));
    else x.ticks.forEach(t => { const px = xs.map(t); out.push(`<line x1="${fmt(px, 1)}" y1="${fmt(zy, 1)}" x2="${fmt(px, 1)}" y2="${fmt(zy + 8, 1)}" stroke="${COLORS.ink}" stroke-width="2"/><text data-role="tick" data-value="${t}" x="${fmt(px, 1)}" y="${fmt(zy + 30, 1)}" text-anchor="middle" font-size="18" fill="${COLORS.ink}">${t}</text>`); });
    out.push(`<text data-role="axis-label" x="${(PLOT.left + PLOT.right) / 2}" y="${H - 14}" text-anchor="middle" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(x.label)}${x.unit ? ' (' + esc(x.unit) + ')' : ''}</text></g>`);
    // y axis
    out.push(`<g data-role="axis" data-axis="y" data-label="${esc(y.label)}" data-unit="${esc(y.unit || '')}" data-min="${y.min}" data-max="${y.max}" data-ticks="${y.ticks.join(',')}" data-px0="${ys.px0}" data-px1="${ys.px1}"><title>y-axis: ${esc(y.label)}${y.unit ? ' (' + esc(y.unit) + ')' : ''}</title>`);
    out.push(`<line x1="${fmt(zx, 1)}" y1="${PLOT.top}" x2="${fmt(zx, 1)}" y2="${PLOT.bottom}" stroke="${COLORS.ink}" stroke-width="3"/>`);
    y.ticks.forEach(t => { const py = ys.map(t); out.push(`<line x1="${fmt(zx - 8, 1)}" y1="${fmt(py, 1)}" x2="${fmt(zx, 1)}" y2="${fmt(py, 1)}" stroke="${COLORS.ink}" stroke-width="2"/><text data-role="tick" data-value="${t}" x="${fmt(zx - 14, 1)}" y="${fmt(py + 6, 1)}" text-anchor="end" font-size="18" fill="${COLORS.ink}">${t}</text>`); });
    out.push(`<text data-role="axis-label" transform="translate(22 ${(PLOT.top + PLOT.bottom) / 2}) rotate(-90)" text-anchor="middle" font-size="20" font-weight="700" fill="${COLORS.ink}">${esc(y.label)}${y.unit ? ' (' + esc(y.unit) + ')' : ''}</text></g>`);
    // gridlines (light)
    out.push(`<g data-role="grid" aria-hidden="true">${y.ticks.map(t => `<line x1="${PLOT.left}" y1="${fmt(ys.map(t), 1)}" x2="${PLOT.right}" y2="${fmt(ys.map(t), 1)}" stroke="#E4E6EE" stroke-width="1"/>`).join('')}</g>`);
    // series
    for (const s of spec.series || []) {
      out.push(`<g data-role="series" id="${esc(s.id)}" data-name="${esc(s.name)}" data-kind="${s.kind}" data-color="${s.color}"><title>${esc(s.name)}</title><desc>${s.kind} series with ${s.points.length} points</desc>`);
      if (s.kind === 'line') out.push(`<polyline points="${s.points.map(([px, py]) => `${fmt(xs.map(px), 1)},${fmt(ys.map(py), 1)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="10 8"' : ''}/>`);
      if (s.kind === 'scatter') s.points.forEach(([px, py]) => out.push(`<circle cx="${fmt(xs.map(px), 1)}" cy="${fmt(ys.map(py), 1)}" r="7" fill="${s.color}" stroke="#fff" stroke-width="2"/>`));
      if (s.kind === 'bar') { const bw = (PLOT.right - PLOT.left) / (x.categories?.length || s.points.length) * 0.6; s.points.forEach(([i, v]) => out.push(`<rect data-cat="${i}" x="${fmt(xs.map(i) - bw / 2, 1)}" y="${fmt(ys.map(v), 1)}" width="${fmt(bw, 1)}" height="${fmt(ys.map(0) - ys.map(v), 1)}" fill="${s.color}" rx="4"/><text x="${fmt(xs.map(i), 1)}" y="${fmt(ys.map(v) - 8, 1)}" text-anchor="middle" font-size="16" fill="${COLORS.ink}">${v}</text>`)); }
      out.push('</g>');
    }
    // legend
    if ((spec.series || []).length > 1) {
      out.push(`<g data-role="legend" aria-hidden="true">${spec.series.map((s, i) => `<line x1="${PLOT.left + 16}" y1="${PLOT.top + 16 + i * 26}" x2="${PLOT.left + 56}" y2="${PLOT.top + 16 + i * 26}" stroke="${s.color}" stroke-width="5"${s.dash ? ' stroke-dasharray="8 6"' : ''}/><text x="${PLOT.left + 66}" y="${PLOT.top + 22 + i * 26}" font-size="17" fill="${COLORS.ink}">${esc(s.name)}</text>`).join('')}</g>`);
    }
  }

  for (const rel of spec.relations || []) {
    out.push(`<g data-role="relation" data-from="${esc(rel.from)}" data-to="${esc(rel.to)}" data-type="${esc(rel.type)}" data-label="${esc(rel.label)}"><title>${esc(rel.label)}</title>${(rel.shapes || []).map(sh => shapeSVG(sh, COLORS.ink)).join('')}</g>`);
  }
  for (const o of spec.objects || []) {
    const props = Object.entries(o.props || {}).map(([k, v]) => ` data-prop-${esc(k.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''))}="${esc(k)}=${esc(v)}"`).join('');
    out.push(`<g data-role="object" id="${esc(o.id)}" data-kind="${esc(o.kind)}" data-label="${esc(o.label)}" data-color="${o.color || COLORS.ink}"${props}><title>${esc(o.label)}</title><desc>${esc(o.desc || '')}</desc>${o.shapes.map(sh => shapeSVG(sh, o.color)).join('')}</g>`);
  }
  if (spec.table) {
    const t = spec.table, cols = t.headers.length, rows = t.rows.length + 1;
    const cw = (W - 80) / cols, rh = Math.min(64, (H - 80) / rows), x0 = 40, y0 = 60;
    out.push(`<g data-role="table" data-cols="${cols}" data-rows="${rows}"><title>${esc(spec.title)}</title>`);
    const cell = (r, c, text, header) => `<g data-role="cell" data-row="${r}" data-col="${c}"${header ? ' data-header="1"' : ''}><rect x="${x0 + c * cw}" y="${y0 + r * rh}" width="${cw}" height="${rh}" fill="${header ? '#ECEEF5' : '#fff'}" stroke="${COLORS.ink}" stroke-width="2"/><text x="${x0 + c * cw + 14}" y="${y0 + r * rh + rh / 2 + 7}" font-size="19"${header ? ' font-weight="700"' : ''} fill="${COLORS.ink}">${esc(text)}</text></g>`;
    t.headers.forEach((h, c) => out.push(cell(0, c, h, true)));
    t.rows.forEach((row, r) => row.forEach((v, c) => out.push(cell(r + 1, c, v, false))));
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('');
}

/** Small thumbnail SVG for the library (same renderer, no text clutter needed). */
export function thumbSVG(sample) {
  const svg = toSVG(sample.build(defaultParams(sample)));
  return svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ').replace(/role="img" aria-labelledby="pt pd"/, '').replace(/ id="(pt|pd)"/g, '');
}
