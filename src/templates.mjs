/**
 * Parametric 2D mechanical-drawing templates.
 * All dimensions are in world units (normally millimetres), all angles in radians.
 */
import { Line, Centerline, Circle, Arc, Polygon } from './cad-geometry-trim.mjs';

const TAU = Math.PI * 2;
const finitePositive = (v, name) => {
  if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} має бути додатним числом`);
  return v;
};
const pointAt = (center, u, n, along, across) => ({
  x: center.x + u.x * along + n.x * across,
  y: center.y + u.y * along + n.y * across
});
const rotate = (p, angle) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) });
const defaultStyle = { stroke: '#111111', lineWidth: 0.25, lineDash: [] };

/** Horizontal and vertical centre mark for a hole or circle. */
export function createCenterMark(center, size, { style = { stroke: '#111', lineWidth: 0.18, lineDash: [8, 2, 1, 2] }, gap = 0 } = {}) {
  finitePositive(size, 'Розмір центрової мітки');
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) throw new TypeError('Центр має містити x та y');
  if (!Number.isFinite(gap) || gap < 0 || gap >= size) throw new RangeError('Проміжок центрової мітки має бути ≥ 0 та меншим за її розмір');
  const half = size / 2, inner = gap / 2;
  const segments = inner > 0
    ? [[{x:center.x-half,y:center.y},{x:center.x-inner,y:center.y}], [{x:center.x+inner,y:center.y},{x:center.x+half,y:center.y}], [{x:center.x,y:center.y-half},{x:center.x,y:center.y-inner}], [{x:center.x,y:center.y+inner},{x:center.x,y:center.y+half}]]
    : [[{x:center.x-half,y:center.y},{x:center.x+half,y:center.y}], [{x:center.x,y:center.y-half},{x:center.x,y:center.y+half}]];
  return segments.map(([a,b]) => { const line = new Centerline(a,b,{style}); line.centerMark = true; return line; });
}

/** Rounded-ended slot; length is the overall length, not the straight section. */
export function createSlot(center, overallLength, width, angle = 0, { style = defaultStyle, centerline = false } = {}) {
  finitePositive(overallLength, 'Довжина паза');
  finitePositive(width, 'Ширина паза');
  if (overallLength < width) throw new RangeError('Довжина паза не може бути меншою за ширину');
  if (!Number.isFinite(angle)) throw new TypeError('Кут має бути скінченним числом');
  const r = width / 2, straightHalf = Math.max(0, (overallLength - width) / 2);
  if (straightHalf <= 1e-9) {
    const round = new Circle(center, r, { style });
    return centerline ? [round, ...createCenterMark(center, width * 1.8)] : [round];
  }
  const u = { x: Math.cos(angle), y: Math.sin(angle) }, n = { x: -u.y, y: u.x };
  const left = pointAt(center, u, n, -straightHalf, 0), right = pointAt(center, u, n, straightHalf, 0);
  const topLeft = pointAt(center, u, n, -straightHalf, r), topRight = pointAt(center, u, n, straightHalf, r);
  const bottomLeft = pointAt(center, u, n, -straightHalf, -r), bottomRight = pointAt(center, u, n, straightHalf, -r);
  const out = [
    new Line(topLeft, topRight, { style }),
    new Arc(right, r, angle - Math.PI / 2, Math.PI, { style }),
    new Line(bottomRight, bottomLeft, { style }),
    new Arc(left, r, angle + Math.PI / 2, Math.PI, { style })
  ];
  if (centerline) out.push(new Centerline(pointAt(center, u, n, -overallLength * .6, 0), pointAt(center, u, n, overallLength * .6, 0)));
  return out;
}

/** Bolt-hole pattern with a dashed pitch circle and centre marks. */
export function createBoltCircle(center, pitchRadius, count, holeRadius, {
  startAngle = 0, pitchLine = true, centerMarks = true,
  holeStyle = defaultStyle,
  pitchStyle = { stroke: '#111', lineWidth: 0.18, lineDash: [8, 2, 1, 2] }
} = {}) {
  finitePositive(pitchRadius, 'Радіус болтового кола');
  finitePositive(holeRadius, 'Радіус отвору');
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Кількість отворів має бути цілим числом ≥ 1');
  if (!Number.isFinite(startAngle)) throw new TypeError('Початковий кут має бути скінченним числом');
  const out = [];
  if (pitchLine) out.push(new Circle(center, pitchRadius, { style: pitchStyle }));
  for (let i = 0; i < count; i++) {
    const a = startAngle + TAU * i / count;
    const p = { x: center.x + pitchRadius * Math.cos(a), y: center.y + pitchRadius * Math.sin(a) };
    out.push(new Circle(p, holeRadius, { style: holeStyle }));
    if (centerMarks) out.push(...createCenterMark(p, holeRadius * 3.2));
  }
  if (centerMarks) out.push(...createCenterMark(center, Math.max(pitchRadius * .35, holeRadius * 4)));
  return out;
}

/** Common flange: outside diameter, bore, bolt circle and hole centre marks. */
export function createFlange({ center = { x: 0, y: 0 }, outerRadius, boreRadius = 0, pitchRadius, holeCount = 4, holeRadius, startAngle = Math.PI / 4, includePitchCircle = true, centerMarks = true, style = defaultStyle } = {}) {
  finitePositive(outerRadius, 'Зовнішній радіус фланця');
  if (boreRadius < 0 || !Number.isFinite(boreRadius)) throw new RangeError('Радіус отвору має бути невід’ємним');
  if (boreRadius >= outerRadius) throw new RangeError('Центральний отвір має бути меншим за зовнішній радіус');
  if (pitchRadius != null && pitchRadius + (holeRadius ?? 0) > outerRadius) throw new RangeError('Болтове коло або отвори виходять за зовнішній контур');
  const out = [new Circle(center, outerRadius, { style })];
  if (boreRadius > 0) out.push(new Circle(center, boreRadius, { style }));
  if (centerMarks) out.push(...createCenterMark(center, outerRadius * .4));
  if (pitchRadius != null) out.push(...createBoltCircle(center, pitchRadius, holeCount, holeRadius, { startAngle, pitchLine: includePitchCircle, centerMarks, holeStyle: style }));
  return out;
}

/** Rectangular plate with optional corner chamfers and through-holes. */
export function createPlate({ center = { x: 0, y: 0 }, width, height, chamfer = 0, angle = 0, holes = [], style = defaultStyle, centerMarks = true } = {}) {
  finitePositive(width, 'Ширина пластини'); finitePositive(height, 'Висота пластини');
  if (!Number.isFinite(chamfer) || chamfer < 0 || chamfer * 2 >= Math.min(width, height)) throw new RangeError('Фаска має бути ≥ 0 та меншою за половину меншої сторони');
  if (!Number.isFinite(angle)) throw new TypeError('Кут має бути скінченним числом');
  let local;
  const x = width / 2, y = height / 2, c = chamfer;
  if (c === 0) local = [{x:-x,y:-y},{x:x,y:-y},{x:x,y:y},{x:-x,y:y}];
  else local = [{x:-x+c,y:-y},{x:x-c,y:-y},{x:x,y:-y+c},{x:x,y:y-c},{x:x-c,y:y},{x:-x+c,y:y},{x:-x,y:y-c},{x:-x,y:-y+c}];
  const vertices = local.map(p => { const q = rotate(p, angle); return { x: center.x + q.x, y: center.y + q.y }; });
  const out = [new Polygon(vertices, { style })];
  for (const hole of holes) {
    if (!Number.isFinite(hole.x) || !Number.isFinite(hole.y) || !Number.isFinite(hole.radius) || hole.radius <= 0) throw new TypeError('Кожен отвір має містити x, y та додатний radius');
    const q = rotate({ x: hole.x, y: hole.y }, angle);
    const p = { x: center.x + q.x, y: center.y + q.y };
    out.push(new Circle(p, hole.radius, { style: hole.style ?? style }));
    if (centerMarks) out.push(...createCenterMark(p, hole.radius * 3.2));
  }
  return out;
}

/** Regular hexagonal fastener head specified by across-flats size. */
export function createHexHead(center, acrossFlats, angle = Math.PI / 6, { style = defaultStyle } = {}) {
  finitePositive(acrossFlats, 'Розмір під ключ');
  const circumradius = acrossFlats / Math.sqrt(3);
  return [Polygon.regular(center, 6, circumradius, angle, { style })];
}

/** Stepped shaft side profile plus its longitudinal axis. */
export function createSteppedShaft({ center = { x: 0, y: 0 }, steps, angle = 0, style = defaultStyle, axis = true } = {}) {
  if (!Array.isArray(steps) || !steps.length) throw new RangeError('Потрібен масив ступенів вала');
  steps.forEach((s, i) => { finitePositive(s.length, `Довжина ступеня ${i + 1}`); finitePositive(s.diameter, `Діаметр ступеня ${i + 1}`); });
  const total = steps.reduce((sum, s) => sum + s.length, 0);
  let x = -total / 2;
  const top = [{ x, y: steps[0].diameter / 2 }];
  for (const s of steps) {
    x += s.length;
    top.push({ x, y: top.at(-1).y }, { x, y: s.diameter / 2 });
  }
  const bottom = [...top].reverse().map(p => ({ x: p.x, y: -p.y }));
  const vertices = [...top, ...bottom].map(p => { const q = rotate(p, angle); return { x: center.x + q.x, y: center.y + q.y }; });
  const out = [new Polygon(vertices, { style })];
  if (axis) {
    const u = { x: Math.cos(angle), y: Math.sin(angle) };
    out.push(new Centerline({ x: center.x - u.x * total * .6, y: center.y - u.y * total * .6 }, { x: center.x + u.x * total * .6, y: center.y + u.y * total * .6 }));
  }
  return out;
}


/** Washer end view: outer/inner circles and a centre mark. */
export function createWasher(center, outerRadius, innerRadius, { style = defaultStyle, centerMark = true } = {}) {
  finitePositive(outerRadius, 'Зовнішній радіус шайби'); finitePositive(innerRadius, 'Внутрішній радіус шайби');
  if (innerRadius >= outerRadius) throw new RangeError('Внутрішній отвір має бути меншим за зовнішній контур');
  const out = [new Circle(center, outerRadius, { style }), new Circle(center, innerRadius, { style })];
  if (centerMark) out.push(...createCenterMark(center, outerRadius * .5, { gap: innerRadius * .15 }));
  return out;
}

/** Simplified rolling bearing end view with equally spaced balls. */
export function createBearing(center, outerRadius, innerRadius, ballRadius, ballCount = 8, { style = defaultStyle, pitchStyle = { stroke:'#111', lineWidth:0.18, lineDash:[8,2,1,2] } } = {}) {
  finitePositive(outerRadius, 'Зовнішній радіус підшипника');
  finitePositive(innerRadius, 'Внутрішній радіус підшипника');
  finitePositive(ballRadius, 'Радіус тіла кочення');
  if (innerRadius >= outerRadius) throw new RangeError('Внутрішній радіус має бути меншим за зовнішній');
  if (!Number.isInteger(ballCount) || ballCount < 3) throw new RangeError('Кількість тіл кочення має бути цілим числом ≥ 3');
  const pitchRadius = (outerRadius + innerRadius) / 2;
  if (pitchRadius + ballRadius >= outerRadius || pitchRadius - ballRadius <= innerRadius) throw new RangeError('Тіла кочення не поміщаються між доріжками');
  const out = [new Circle(center, outerRadius, { style }), new Circle(center, innerRadius, { style }), new Circle(center, pitchRadius, { style: pitchStyle })];
  for (let i=0;i<ballCount;i++) {
    const a = TAU * i / ballCount;
    const p = { x:center.x + pitchRadius*Math.cos(a), y:center.y + pitchRadius*Math.sin(a) };
    out.push(new Circle(p, ballRadius, { style }));
  }
  out.push(...createCenterMark(center, outerRadius * .35));
  return out;
}

/** Concentric counterbore hole: through-hole and counterbore edges. */
export function createCounterboreHole(center, throughRadius, counterboreRadius, { style = defaultStyle, centerMark = true } = {}) {
  finitePositive(throughRadius, 'Радіус наскрізного отвору');
  finitePositive(counterboreRadius, 'Радіус цекування');
  if (counterboreRadius <= throughRadius) throw new RangeError('Радіус цекування має бути більшим за наскрізний отвір');
  const out = [new Circle(center, throughRadius, { style }), new Circle(center, counterboreRadius, { style })];
  if (centerMark) out.push(...createCenterMark(center, counterboreRadius * 2.4));
  return out;
}

/** Rectangularly spaced hole pattern; origin is the centre of the first hole. */
export function createHoleArray({ origin = { x:0, y:0 }, rows, columns, pitchX, pitchY, radius, centerMarks = true, style = defaultStyle } = {}) {
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) throw new RangeError('Кількість рядків і стовпців має бути цілим числом ≥ 1');
  finitePositive(pitchX, 'Крок X'); finitePositive(pitchY, 'Крок Y'); finitePositive(radius, 'Радіус отвору');
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) throw new TypeError('Початок масиву має містити x та y');
  const out=[];
  for(let row=0;row<rows;row++) for(let col=0;col<columns;col++) {
    const p={x:origin.x+col*pitchX,y:origin.y+row*pitchY};
    out.push(new Circle(p,radius,{style}));
    if(centerMarks) out.push(...createCenterMark(p,radius*3.2));
  }
  return out;
}

/** Simplified bearing/bushing end view: outer circle, bore and cross centre mark. */
export function createBushing(center, outerRadius, boreRadius, { style = defaultStyle, centerMark = true } = {}) {
  finitePositive(outerRadius, 'Зовнішній радіус втулки'); finitePositive(boreRadius, 'Радіус отвору');
  if (boreRadius >= outerRadius) throw new RangeError('Отвір має бути меншим за зовнішній контур');
  const out = [new Circle(center, outerRadius, { style }), new Circle(center, boreRadius, { style })];
  if (centerMark) out.push(...createCenterMark(center, outerRadius * .45));
  return out;
}

export const TEMPLATE_CATALOG = Object.freeze([
  { id: 'slot', label: 'Паз із заокругленими кінцями', description: 'Дві паралельні лінії та дві дуги', defaults: { center: {x:0,y:0}, overallLength: 60, width: 16, angle: 0 } },
  { id: 'boltCircle', label: 'Болтове коло', description: 'Рівномірно розташовані отвори та ділильне коло', defaults: { center: {x:0,y:0}, pitchRadius: 40, count: 6, holeRadius: 4 } },
  { id: 'flange', label: 'Фланець', description: 'Зовнішній контур, центральний отвір і кріпильні отвори', defaults: { center: {x:0,y:0}, outerRadius: 55, boreRadius: 16, pitchRadius: 40, holeCount: 6, holeRadius: 4 } },
  { id: 'plate', label: 'Пластина з отворами', description: 'Прямокутна пластина з фасками та отворами', defaults: { center: {x:0,y:0}, width: 100, height: 60, chamfer: 4, holes: [{x:-35,y:-15,radius:4},{x:35,y:-15,radius:4},{x:35,y:15,radius:4},{x:-35,y:15,radius:4}] } },
  { id: 'hexHead', label: 'Шестигранна головка', description: 'Шестикутник за розміром під ключ', defaults: { center: {x:0,y:0}, acrossFlats: 24 } },
  { id: 'shaft', label: 'Ступінчастий вал', description: 'Бічний профіль із осьовою лінією', defaults: { center: {x:0,y:0}, steps: [{length:30,diameter:20},{length:40,diameter:32},{length:25,diameter:16}] } },
  { id: 'bushing', label: 'Втулка', description: 'Зовнішнє коло, отвір і центрові лінії', defaults: { center: {x:0,y:0}, outerRadius: 25, boreRadius: 10 } },
  { id: 'washer', label: 'Шайба', description: 'Зовнішній і внутрішній контури шайби', defaults: { center: {x:0,y:0}, outerRadius: 24, innerRadius: 10 } },
  { id: 'bearing', label: 'Підшипник', description: 'Кільця та тіла кочення у торцевому вигляді', defaults: { center: {x:0,y:0}, outerRadius: 32, innerRadius: 14, ballRadius: 5, ballCount: 8 } },
  { id: 'counterbore', label: 'Отвір із цекуванням', description: 'Наскрізний отвір і контур цекування', defaults: { center: {x:0,y:0}, throughRadius: 4, counterboreRadius: 8 } },
  { id: 'holeArray', label: 'Прямокутний масив отворів', description: 'Отвори з рівним кроком по рядках і стовпцях', defaults: { origin: {x:0,y:0}, rows: 2, columns: 3, pitchX: 35, pitchY: 30, radius: 4 } }
]);

/** Create a named, parametric starter drawing. Returns an array of primitives. */
export function createTemplate(id, overrides = {}) {
  const item = TEMPLATE_CATALOG.find(entry => entry.id === id);
  if (!item) throw new RangeError(`Невідомий шаблон: ${id}`);
  const p = { ...item.defaults, ...overrides };
  switch (id) {
    case 'slot': return createSlot(p.center, p.overallLength, p.width, p.angle, p.options);
    case 'boltCircle': return createBoltCircle(p.center, p.pitchRadius, p.count, p.holeRadius, p.options);
    case 'flange': return createFlange(p);
    case 'plate': return createPlate(p);
    case 'hexHead': return createHexHead(p.center, p.acrossFlats, p.angle, p.options);
    case 'shaft': return createSteppedShaft(p);
    case 'bushing': return createBushing(p.center, p.outerRadius, p.boreRadius, p.options);
    case 'washer': return createWasher(p.center, p.outerRadius, p.innerRadius, p.options);
    case 'bearing': return createBearing(p.center, p.outerRadius, p.innerRadius, p.ballRadius, p.ballCount, p.options);
    case 'counterbore': return createCounterboreHole(p.center, p.throughRadius, p.counterboreRadius, p.options);
    case 'holeArray': return createHoleArray(p);
    default: throw new RangeError(`Шаблон не реалізований: ${id}`);
  }
}
