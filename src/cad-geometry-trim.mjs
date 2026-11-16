/*
 * CAD geometry core for a 2D engineering editor (JavaScript / HTML5 Canvas).
 * Coordinates are world units (normally millimetres). Canvas transforms belong
 * to the renderer/tool layer, not to this geometry module.
 */

export const TAU = Math.PI * 2;
export const EPS = 1e-8;
export const GOST_TEXT_HEIGHTS = Object.freeze([1.8, 2.5, 3.5, 5, 7, 10, 14, 20, 28, 40]);
export const isGostTextHeight = h => GOST_TEXT_HEIGHTS.some(v => Math.abs(v - Number(h)) < 1e-9);
export function assertGostTextHeight(h) {
  if (!isGostTextHeight(h)) throw new RangeError(`Недопустимая высота шрифта. Используйте: ${GOST_TEXT_HEIGHTS.join(', ')} мм`);
  return Number(h);
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const normAngle = a => ((a % TAU) + TAU) % TAU;
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (p, k) => ({ x: p.x * k, y: p.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const length = p => Math.hypot(p.x, p.y);
export const distance = (a, b) => length(sub(a, b));
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

/** Validate public geometry input early so NaN/Infinity never leak into SVG/Canvas. */
export function assertPoint(p, name = 'Точка') {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new TypeError(`${name} должна содержать конечные координаты x и y`);
  }
  return p;
}
export function assertFinite(value, name = 'Значение') {
  if (!Number.isFinite(value)) throw new TypeError(`${name} должно быть конечным числом`);
  return value;
}
const coordinateScale = (...points) => Math.max(1, ...points.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
const geometricTolerance = (eps, ...points) => Math.max(Math.abs(eps), Number.EPSILON * coordinateScale(...points) * 64);

let nextId = 1;
const makeId = prefix => `${prefix}-${nextId++}`;
const copyMeta = p => ({ id: makeId(p.type), style: structuredCloneSafe(p.style), locked: false, visible: p.visible });
const structuredCloneSafe = value => value == null ? value : JSON.parse(JSON.stringify(value));

export class Primitive {
  constructor(type, { id = makeId(type), style = {}, locked = false, visible = true } = {}) {
    this.id = id;
    this.type = type;
    this.style = { stroke: '#111111', lineWidth: 0.25, lineDash: [], ...style };
    this.locked = locked;
    this.visible = visible;
  }
}

export class Line extends Primitive {
  constructor(a, b, options = {}) {
    super('line', options);
    assertPoint(a, 'Начальная точка'); assertPoint(b, 'Конечная точка');
    if (distance(a, b) <= EPS) throw new RangeError('Длина отрезка должна быть больше нуля');
    this.a = { ...a };
    this.b = { ...b };
    this.ownerId = options.ownerId ?? null;
  }
  pointAt(t) { return lerp(this.a, this.b, t); }
  parameterAt(p) {
    const d = sub(this.b, this.a), den = dot(d, d);
    return den <= EPS * EPS ? 0 : dot(sub(p, this.a), d) / den;
  }
  closestPoint(p) { return this.pointAt(clamp(this.parameterAt(p), 0, 1)); }
}

export class Centerline extends Line {
  constructor(a, b, options = {}) {
    super(a, b, { ...options, style: { stroke: '#111111', lineWidth: 0.18, lineDash: [8, 2, 1, 2], ...options.style } });
    this.type = 'centerline';
  }
}

export class Circle extends Primitive {
  constructor(center, radius, options = {}) {
    super('circle', options);
    assertFinite(radius, 'Радиус');
    if (!(radius > 0)) throw new RangeError('Радиус окружности должен быть больше нуля');
    assertPoint(center, 'Центр окружности'); assertFinite(radius, 'Радиус');
    this.center = { ...center };
    this.radius = radius;
  }
  pointAtAngle(angle) {
    return { x: this.center.x + this.radius * Math.cos(angle), y: this.center.y + this.radius * Math.sin(angle) };
  }
  parameterAt(p) { return normAngle(Math.atan2(p.y - this.center.y, p.x - this.center.x)) / TAU; }
}

export class Arc extends Primitive {
  // sweep may be positive (CCW) or negative (CW), |sweep| <= 2π.
  constructor(center, radius, startAngle, sweep, options = {}) {
    super('arc', options);
    assertFinite(radius, 'Радиус');
    if (!(radius > 0)) throw new RangeError('Радиус дуги должен быть больше нуля');
    if (Math.abs(sweep) <= EPS || Math.abs(sweep) > TAU + EPS) throw new RangeError('Размах дуги должен быть в диапазоне (0; 2π]');
    assertPoint(center, 'Центр дуги'); assertFinite(radius, 'Радиус');
    assertFinite(startAngle, 'Начальный угол'); assertFinite(sweep, 'Угловой размах');
    this.center = { ...center };
    this.radius = radius;
    this.startAngle = startAngle;
    this.sweep = Math.abs(Math.abs(sweep) - TAU) <= EPS ? Math.sign(sweep) * TAU : sweep;
  }
  angleAt(t) { return this.startAngle + this.sweep * t; }
  pointAt(t) {
    const a = this.angleAt(t);
    return { x: this.center.x + this.radius * Math.cos(a), y: this.center.y + this.radius * Math.sin(a) };
  }
  parameterForAngle(angle, eps = EPS) {
    const delta = this.sweep >= 0
      ? normAngle(angle - this.startAngle)
      : normAngle(this.startAngle - angle);
    const t = delta / Math.abs(this.sweep);
    return t <= 1 + eps ? clamp(t, 0, 1) : null;
  }
  parameterAt(p) { return this.parameterForAngle(Math.atan2(p.y - this.center.y, p.x - this.center.x)); }
}

export class Polygon extends Primitive {
  constructor(vertices, options = {}) {
    super('polygon', options);
    if (!Array.isArray(vertices) || vertices.length < 3) throw new RangeError('Многоугольнику нужны минимум 3 вершины');
    vertices.forEach((p, i) => assertPoint(p, `Вершина ${i + 1}`));
    const clean = vertices.filter((p, i) => i === 0 || distance(p, vertices[i - 1]) > EPS);
    if (clean.length > 1 && distance(clean[0], clean[clean.length - 1]) <= EPS) clean.pop();
    if (clean.length < 3) throw new RangeError('После удаления повторяющихся вершин должно остаться минимум 3 точки');
    this.vertices = clean.map(p => ({ ...p }));
  }
  static regular(center, vertexCount, circumradius, rotation = -Math.PI / 2, options = {}) {
    assertPoint(center, 'Центр многоугольника'); assertFinite(circumradius, 'Радиус описанной окружности'); assertFinite(rotation, 'Угол поворота');
    if (!Number.isInteger(vertexCount) || vertexCount < 3) throw new RangeError('Количество вершин должно быть целым числом ≥ 3');
    if (!(circumradius > 0)) throw new RangeError('Радиус должен быть больше нуля');
    const vertices = Array.from({ length: vertexCount }, (_, i) => {
      const a = rotation + TAU * i / vertexCount;
      return { x: center.x + circumradius * Math.cos(a), y: center.y + circumradius * Math.sin(a) };
    });
    return new Polygon(vertices, options);
  }
  edges() {
    return this.vertices.map((p, i) => new Line(p, this.vertices[(i + 1) % this.vertices.length], {
      id: `${this.id}:edge:${i}`, ownerId: this.id, style: this.style, locked: this.locked
    }));
  }
}

// Dimensions are annotations, not cutting/intersection boundaries by default.
export class LinearDimension extends Primitive {
  constructor(p1, p2, offset, options = {}) {
    super('linearDimension', options);
    assertPoint(p1, 'Первая точка размера'); assertPoint(p2, 'Вторая точка размера'); assertFinite(offset, 'Вынос размера');
    if (distance(p1, p2) <= EPS) throw new RangeError('Нельзя создать размер нулевой длины');
    this.p1 = { ...p1 }; this.p2 = { ...p2 }; this.offset = offset;
    this.showValue = options.showValue ?? true;
    this.textHeight = options.textHeight ?? 3.5;
    this.text = options.text ?? null;
    this.textOffset = options.textOffset ?? 0;
    this.horizontalText = options.horizontalText ?? true;
  }
  get value() { return distance(this.p1, this.p2); }
  geometry() {
    const d = sub(this.p2, this.p1), n = length(d);
    if (n < EPS) return null;
    const normal = { x: -d.y / n, y: d.x / n };
    const q1 = add(this.p1, mul(normal, this.offset));
    const q2 = add(this.p2, mul(normal, this.offset));
    return { q1, q2, normal, middle: mul(add(q1, q2), 0.5), value: this.value };
  }
}

export class DiameterDimension extends Primitive {
  constructor(center, radius, options = {}) {
    super('diameterDimension', options);
    assertFinite(radius, 'Радиус');
    if (!(radius > 0)) throw new RangeError('Радиус должен быть больше нуля');
    assertPoint(center, 'Центр диаметрального размера');
    this.center = { ...center }; this.radius = radius;
    this.angle = assertFinite(options.angle ?? 0, 'Угол диаметрального размера');
    this.showValue = options.showValue ?? true;
    this.textHeight = options.textHeight ?? 3.5;
    this.text = options.text ?? null;
  }
  get value() { return 2 * this.radius; }
  geometry() {
    const u = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    return { p1: sub(this.center, mul(u, this.radius)), p2: add(this.center, mul(u, this.radius)), value: this.value };
  }
}

export function regularPolygon(center, vertexCount, circumradius, rotation = -Math.PI / 2) {
  return Polygon.regular(center, vertexCount, circumradius, rotation);
}

/** Convert a polygon group into independently editable/trimmable line segments. */
export function explodePolygon(polygon) {
  if (!(polygon instanceof Polygon)) throw new TypeError('Ожидался объект Polygon');
  return polygon.edges().map(edge => new Line(edge.a, edge.b, { style: edge.style, ownerId: polygon.id }));
}

// ---------- Intersection mathematics ----------
function inUnit(t, eps = EPS) { return t >= -eps && t <= 1 + eps; }
function pointOnArc(arc, point, eps = 1e-7) {
  return arc.parameterAt(point) !== null && Math.abs(distance(point, arc.center) - arc.radius) <= eps * Math.max(1, arc.radius);
}

export function intersectLineLine(a, b, eps = EPS) {
  const r = sub(a.b, a.a), s = sub(b.b, b.a), qp = sub(b.a, a.a);
  const rr = dot(r, r), ss = dot(s, s);
  const tol = geometricTolerance(eps, a.a, a.b, b.a, b.b);
  if (rr <= tol * tol || ss <= tol * tol) return [];
  const den = cross(r, s);
  const parallelTol = Number.EPSILON * Math.sqrt(rr * ss) * 64;
  if (Math.abs(den) > parallelTol) {
    const t = cross(qp, s) / den, u = cross(qp, r) / den;
    const tEps = tol / Math.sqrt(rr), uEps = tol / Math.sqrt(ss);
    if (t < -tEps || t > 1 + tEps || u < -uEps || u > 1 + uEps) return [];
    const tc = clamp(t, 0, 1), uc = clamp(u, 0, 1);
    return [{ point: a.pointAt(tc), t: tc, u: uc }];
  }
  // Parallel but not collinear: no intersection. Collinear overlap is represented
  // by its finite overlap endpoints, which are useful as Trim boundaries.
  const collinearTol = tol * Math.sqrt(rr);
  if (Math.abs(cross(qp, r)) > collinearTol) return [];
  const t0 = dot(qp, r) / rr;
  const t1 = t0 + dot(s, r) / rr;
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(1, Math.max(t0, t1));
  const tEps = tol / Math.sqrt(rr);
  if (hi < lo - tEps) return [];
  const ts = Math.abs(hi - lo) <= tEps ? [clamp((lo + hi) / 2, 0, 1)] : [clamp(lo, 0, 1), clamp(hi, 0, 1)];
  return ts.map(t => {
    const point = a.pointAt(t), u = dot(sub(point, b.a), s) / ss;
    return { point, t, u: clamp(u, 0, 1) };
  });
}

export function intersectLineCircle(line, circleOrArc, eps = EPS) {
  const d = sub(line.b, line.a), f = sub(line.a, circleOrArc.center);
  const A = dot(d, d);
  if (A <= EPS * EPS) return [];
  // Closest-point form is more stable than the textbook quadratic formula
  // when the line is far from the origin or almost tangent to the circle.
  const tCenter = -dot(f, d) / A;
  const closest = add(line.a, mul(d, tCenter));
  const dist2 = dot(sub(closest, circleOrArc.center), sub(closest, circleOrArc.center));
  const r2 = circleOrArc.radius ** 2;
  const tol = geometricTolerance(eps, line.a, line.b, circleOrArc.center) * Math.max(1, circleOrArc.radius) * 2;
  let h2 = (r2 - dist2) / A;
  if (h2 < -tol / A) return [];
  h2 = Math.max(0, h2);
  const root = Math.sqrt(h2);
  const roots = root <= Number.EPSILON * 64 ? [tCenter] : [tCenter - root, tCenter + root];
  const lineTol = geometricTolerance(eps, line.a, line.b) / Math.sqrt(A);
  const out = [];
  for (const rawT of roots) {
    if (rawT < -lineTol || rawT > 1 + lineTol) continue;
    const t = clamp(rawT, 0, 1), point = line.pointAt(t);
    if (circleOrArc instanceof Arc && circleOrArc.parameterAt(point) === null) continue;
    out.push({ point, t });
  }
  return dedupeHits(out, geometricTolerance(eps, line.a, line.b, circleOrArc.center));
}

export function intersectCircleCircle(a, b, eps = EPS) {
  const delta = sub(b.center, a.center), d = length(delta);
  const tol = Math.max(geometricTolerance(eps, a.center, b.center), Number.EPSILON * Math.max(a.radius, b.radius) * 64);
  const tol2 = tol * Math.max(1, a.radius, b.radius);
  if (d <= tol && Math.abs(a.radius - b.radius) <= tol) return []; // Coincident: infinite overlap.
  if (d <= tol || d > a.radius + b.radius + tol || d < Math.abs(a.radius - b.radius) - tol) return [];
  const x = (a.radius ** 2 - b.radius ** 2 + d ** 2) / (2 * d);
  let h2 = a.radius ** 2 - x ** 2;
  if (h2 < -tol2) return [];
  h2 = Math.max(0, h2);
  const h = Math.sqrt(h2), u = mul(delta, 1 / d), base = add(a.center, mul(u, x));
  const perp = { x: -u.y, y: u.x };
  const candidates = h <= tol ? [base] : [add(base, mul(perp, h)), sub(base, mul(perp, h))];
  return dedupeHits(candidates
    .filter(p => !(a instanceof Arc) || a.parameterAt(p) !== null)
    .filter(p => !(b instanceof Arc) || b.parameterAt(p) !== null)
    .map(point => ({ point, t: parameterOn(a, point) })), tol);
}

export function parameterOn(object, point) {
  if (object instanceof Line) return object.parameterAt(point);
  if (object instanceof Arc) return object.parameterAt(point);
  if (object instanceof Circle) return object.parameterAt(point);
  return null;
}

function dedupeHits(hits, eps = 1e-7) {
  const out = [];
  for (const h of hits) if (!out.some(x => distance(x.point, h.point) <= eps)) out.push(h);
  return out;
}

function asTrimEdges(object) {
  if (object instanceof Polygon) return object.edges();
  return [object];
}

/** Get all unique intersection points on subject, parameterized along subject. */
export function intersectionsOn(subject, objects, { eps = 1e-7 } = {}) {
  const hits = [];
  const subjectEdges = asTrimEdges(subject);
  for (const otherObject of objects) {
    if (!otherObject || otherObject.id === subject.id || otherObject.ownerId === subject.id ||
        (subject.ownerId && otherObject.ownerId === subject.ownerId) || otherObject.visible === false) continue;
    if (otherObject instanceof LinearDimension || otherObject instanceof DiameterDimension) continue;
    for (const a of subjectEdges) {
      for (const b of asTrimEdges(otherObject)) {
        let points = [];
        if (a instanceof Line && b instanceof Line) {
          points = intersectLineLine(a, b, eps).map(h => h.point);
        } else if (a instanceof Line && (b instanceof Circle || b instanceof Arc)) {
          points = intersectLineCircle(a, b, eps).map(h => h.point);
        } else if ((a instanceof Circle || a instanceof Arc) && b instanceof Line) {
          points = intersectLineCircle(b, a, eps).map(h => h.point);
        } else if ((a instanceof Circle || a instanceof Arc) && (b instanceof Circle || b instanceof Arc)) {
          points = intersectCircleCircle(a, b, eps).map(h => h.point);
        }
        for (const point of points) {
          if (subject instanceof Polygon) continue; // Trim polygon edges as their own Line objects.
          const t = parameterOn(subject, point);
          if (t !== null && Number.isFinite(t)) hits.push({ point, t: clamp(t, 0, 1) });
        }
      }
    }
  }
  hits.sort((a, b) => a.t - b.t);
  const scale = subject instanceof Line ? Math.max(1, distance(subject.a, subject.b)) : Math.max(1, subject.radius);
  return dedupeHitsByParameter(hits, Math.max(eps / scale, Number.EPSILON * 64), eps);
}

function dedupeHitsByParameter(hits, parameterEps, pointEps = parameterEps) {
  const result = [];
  for (const h of hits) if (!result.some(x => Math.abs(x.t - h.t) <= parameterEps || distance(x.point, h.point) <= pointEps)) result.push(h);
  return result;
}

// ---------- Trim operation ----------
function pointDistanceToLine(line, point) { return distance(line.closestPoint(point), point); }
function pointDistanceToCircle(circle, point) { return Math.abs(distance(circle.center, point) - circle.radius); }
function pointDistanceToArc(arc, point) {
  const a = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
  if (arc.parameterForAngle(a) !== null) return pointDistanceToCircle(arc, point);
  return Math.min(distance(point, arc.pointAt(0)), distance(point, arc.pointAt(1)));
}
function clickParameter(object, point) {
  if (object instanceof Line) return clamp(object.parameterAt(point), 0, 1);
  if (object instanceof Circle) return object.parameterAt(point);
  if (object instanceof Arc) return object.parameterAt(point);
  return null;
}
function makeLinePart(source, t0, t1) {
  if (t1 - t0 <= EPS) return null;
  return new Line(source.pointAt(t0), source.pointAt(t1), { style: source.style });
}
function makeArcPart(source, t0, t1) {
  if (t1 - t0 <= EPS) return null;
  return new Arc(source.center, source.radius, source.angleAt(t0), source.sweep * (t1 - t0), { style: source.style });
}
function uniqueSorted(values, eps = 1e-7) {
  const out = [];
  for (const v of values.sort((a, b) => a - b)) if (!out.length || Math.abs(v - out[out.length - 1]) > eps) out.push(v);
  return out;
}

/**
 * Trim the interval under clickPoint between adjacent crossings.
 * Returns an edit transaction; it does not mutate `objects` itself.
 */
export function trimAtPoint(subject, clickPoint, objects, { hitTolerance = Infinity, eps = 1e-7 } = {}) {
  if (!subject || subject.locked) return { ok: false, reason: 'Объект заблокирован или не выбран' };
  if (!(subject instanceof Line || subject instanceof Circle || subject instanceof Arc)) {
    return { ok: false, reason: 'Усечение поддерживается для отрезков, окружностей и дуг' };
  }
  const dist = subject instanceof Line ? pointDistanceToLine(subject, clickPoint)
    : subject instanceof Circle ? pointDistanceToCircle(subject, clickPoint)
    : pointDistanceToArc(subject, clickPoint);
  if (dist > hitTolerance) return { ok: false, reason: 'Щелчок слишком далеко от объекта' };

  const hits = intersectionsOn(subject, objects, { eps });
  if (subject instanceof Circle) {
    const cuts = uniqueSorted(hits.map(h => normAngle(Math.atan2(h.point.y - subject.center.y, h.point.x - subject.center.x)) / TAU), eps);
    if (cuts.length < 2) return { ok: false, reason: 'Для усечения окружности нужны минимум две разные точки пересечения' };
    const clickT = clickParameter(subject, clickPoint);
    let start, end;
    for (let i = 0; i < cuts.length; i++) {
      const a = cuts[i], b = i === cuts.length - 1 ? cuts[0] + 1 : cuts[i + 1];
      const t = clickT < a ? clickT + 1 : clickT;
      if (t > a + eps && t < b - eps) { start = a; end = b; break; }
    }
    if (start === undefined) return { ok: false, reason: 'Щелкните внутри сегмента между пересечениями' };
    const removedSweep = (end - start) * TAU;
    const remainingStart = normAngle(end * TAU);
    const remainder = TAU - removedSweep;
    const replacement = remainder > eps ? [new Arc(subject.center, subject.radius, remainingStart, remainder, { style: subject.style })] : [];
    return { ok: true, remove: [subject.id], add: replacement, removed: { startAngle: normAngle(start * TAU), sweep: removedSweep } };
  }

  if (hits.length === 0) return { ok: false, reason: 'На объекте нет точек пересечения с другими примитивами' };
  const params = hits.map(h => h.t).filter(t => t > eps && t < 1 - eps);
  if (params.length === 0) return { ok: false, reason: 'Нет внутренних точек пересечения для усечения' };
  const cuts = uniqueSorted([0, ...params, 1], eps);
  const clickT = clickParameter(subject, clickPoint);
  let lo, hi;
  for (let i = 0; i < cuts.length - 1; i++) {
    if (clickT > cuts[i] + eps && clickT < cuts[i + 1] - eps) { lo = cuts[i]; hi = cuts[i + 1]; break; }
  }
  if (lo === undefined) return { ok: false, reason: 'Щелкните внутри участка между соседними пересечениями' };
  const parts = subject instanceof Line
    ? [makeLinePart(subject, 0, lo), makeLinePart(subject, hi, 1)]
    : [makeArcPart(subject, 0, lo), makeArcPart(subject, hi, 1)];
  return { ok: true, remove: [subject.id], add: parts.filter(Boolean), removed: { t0: lo, t1: hi } };
}

/** Apply a successful Trim transaction atomically to the scene array. */
export function applyEditTransaction(objects, transaction) {
  if (!transaction?.ok) return objects;
  const remove = new Set(transaction.remove ?? []);
  return [...objects.filter(o => !remove.has(o.id)), ...(transaction.add ?? [])];
}

// ---------- Polar array ----------
export function rotatePoint(point, center, angle) {
  const p = sub(point, center), c = Math.cos(angle), s = Math.sin(angle);
  return add(center, { x: p.x * c - p.y * s, y: p.x * s + p.y * c });
}

export function rotatePrimitive(object, center, angle) {
  const options = { style: object.style, locked: false, visible: object.visible };
  if (object instanceof Centerline) return new Centerline(rotatePoint(object.a, center, angle), rotatePoint(object.b, center, angle), options);
  if (object instanceof Line) return new Line(rotatePoint(object.a, center, angle), rotatePoint(object.b, center, angle), options);
  if (object instanceof Circle) return new Circle(rotatePoint(object.center, center, angle), object.radius, options);
  if (object instanceof Arc) return new Arc(rotatePoint(object.center, center, angle), object.radius, object.startAngle + angle, object.sweep, options);
  if (object instanceof Polygon) return new Polygon(object.vertices.map(p => rotatePoint(p, center, angle)), options);
  if (object instanceof LinearDimension) return new LinearDimension(rotatePoint(object.p1, center, angle), rotatePoint(object.p2, center, angle), object.offset, { ...options, showValue: object.showValue, textHeight: object.textHeight, text: object.text, textOffset: object.textOffset, horizontalText: object.horizontalText });
  if (object instanceof DiameterDimension) return new DiameterDimension(rotatePoint(object.center, center, angle), object.radius, { ...options, angle: object.angle + angle, showValue: object.showValue, textHeight: object.textHeight, text: object.text });
  throw new TypeError(`Нельзя повернуть объект типа ${object.type}`);
}

/**
 * Polar array. If includeOriginal=true, count is the total number of positions
 * including the source objects. If false, count is the number of new copies.
 */
export function polarArray(objects, center, count, { totalAngle = TAU, includeOriginal = true } = {}) {
  if (!Number.isInteger(count) || count < 1 || (includeOriginal && count < 2)) {
    throw new RangeError('Для массива нужно минимум 2 позиции с исходником или 1 копия без исходника');
  }
  const result = includeOriginal ? [...objects] : [];
  if (includeOriginal) {
    for (let i = 1; i < count; i++) {
      const angle = totalAngle * i / count;
      result.push(...objects.map(object => rotatePrimitive(object, center, angle)));
    }
  } else {
    for (let i = 1; i <= count; i++) {
      const angle = totalAngle * i / (count + 1);
      result.push(...objects.map(object => rotatePrimitive(object, center, angle)));
    }
  }
  return result;
}

/** Translate a primitive without mutating the original object. */
export function translatePrimitive(object, delta) {
  assertPoint(delta, 'Вектор перемещения');
  const P = p => add(p, delta), options = { style: object.style, visible: object.visible, locked: false };
  if (object instanceof Centerline) return new Centerline(P(object.a), P(object.b), options);
  if (object instanceof Line) return new Line(P(object.a), P(object.b), options);
  if (object instanceof Circle) return new Circle(P(object.center), object.radius, options);
  if (object instanceof Arc) return new Arc(P(object.center), object.radius, object.startAngle, object.sweep, options);
  if (object instanceof Polygon) return new Polygon(object.vertices.map(P), options);
  if (object instanceof LinearDimension) return new LinearDimension(P(object.p1), P(object.p2), object.offset, { ...options, showValue: object.showValue, textHeight: object.textHeight, text: object.text, textOffset: object.textOffset, horizontalText: object.horizontalText });
  if (object instanceof DiameterDimension) return new DiameterDimension(P(object.center), object.radius, { ...options, angle: object.angle, showValue: object.showValue, textHeight: object.textHeight, text: object.text });
  throw new TypeError(`Нельзя переместить объект типа ${object.type}`);
}

/** Scale a primitive uniformly about a fixed point. */
export function scalePrimitive(object, factor, origin = { x: 0, y: 0 }) {
  assertFinite(factor, 'Масштаб'); assertPoint(origin, 'Центр масштабирования');
  if (factor === 0) throw new RangeError('Масштаб не может быть равен нулю');
  const P = p => add(origin, mul(sub(p, origin), factor));
  const r = Math.abs(factor), options = { style: object.style, visible: object.visible, locked: false };
  if (object instanceof Centerline) return new Centerline(P(object.a), P(object.b), options);
  if (object instanceof Line) return new Line(P(object.a), P(object.b), options);
  if (object instanceof Circle) return new Circle(P(object.center), object.radius * r, options);
  if (object instanceof Arc) return new Arc(P(object.center), object.radius * r, object.startAngle + (factor < 0 ? Math.PI : 0), object.sweep, options);
  if (object instanceof Polygon) return new Polygon(object.vertices.map(P), options);
  if (object instanceof LinearDimension) return new LinearDimension(P(object.p1), P(object.p2), object.offset * r, { ...options, showValue: object.showValue, textHeight: object.textHeight * r, text: object.text, textOffset: object.textOffset * r, horizontalText: object.horizontalText });
  if (object instanceof DiameterDimension) return new DiameterDimension(P(object.center), object.radius * r, { ...options, angle: object.angle + (factor < 0 ? Math.PI : 0), showValue: object.showValue, textHeight: object.textHeight * r, text: object.text });
  throw new TypeError(`Нельзя масштабировать объект типа ${object.type}`);
}

/** Reflect an object across an infinite axis line. */
export function mirrorPrimitive(object, axisA, axisB) {
  assertPoint(axisA, 'Точка оси отражения'); assertPoint(axisB, 'Вторая точка оси отражения');
  const axis = sub(axisB, axisA), den = dot(axis, axis);
  if (den <= EPS * EPS) throw new RangeError('Ось отражения должна иметь ненулевую длину');
  const P = p => { const v = sub(p, axisA), projection = add(axisA, mul(axis, dot(v, axis) / den)); return sub(mul(projection, 2), p); };
  const angle = a => normAngle(2 * Math.atan2(axis.y, axis.x) - a);
  const options = { style: object.style, visible: object.visible, locked: false };
  if (object instanceof Centerline) return new Centerline(P(object.a), P(object.b), options);
  if (object instanceof Line) return new Line(P(object.a), P(object.b), options);
  if (object instanceof Circle) return new Circle(P(object.center), object.radius, options);
  if (object instanceof Arc) return new Arc(P(object.center), object.radius, angle(object.startAngle), -object.sweep, options);
  if (object instanceof Polygon) return new Polygon(object.vertices.map(P), options);
  if (object instanceof LinearDimension) return new LinearDimension(P(object.p1), P(object.p2), -object.offset, { ...options, showValue: object.showValue, textHeight: object.textHeight, text: object.text, textOffset: -object.textOffset, horizontalText: object.horizontalText });
  if (object instanceof DiameterDimension) return new DiameterDimension(P(object.center), object.radius, { ...options, angle: angle(object.angle), showValue: object.showValue, textHeight: object.textHeight, text: object.text });
  throw new TypeError(`Нельзя отразить объект типа ${object.type}`);
}

/** Return common OSNAP points (end, midpoint, center, quadrant, polygon vertex). */
export function snapPoints(object) {
  if (object instanceof Centerline || object instanceof Line) return [
    { type: 'endpoint', point: { ...object.a } },
    { type: 'midpoint', point: object.pointAt(0.5) },
    { type: 'endpoint', point: { ...object.b } }
  ];
  if (object instanceof Circle) return [
    { type: 'center', point: { ...object.center } },
    ...[0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(a => ({ type: 'quadrant', point: object.pointAtAngle(a) }))
  ];
  if (object instanceof Arc) return [
    { type: 'endpoint', point: object.pointAt(0) },
    { type: 'midpoint', point: object.pointAt(0.5) },
    { type: 'endpoint', point: object.pointAt(1) },
    ...[0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].filter(a => object.parameterForAngle(a) !== null).map(a => ({ type: 'quadrant', point: object.pointAt(object.parameterForAngle(a)) }))
  ];
  if (object instanceof Polygon) return object.vertices.map(point => ({ type: 'vertex', point: { ...point } }));
  if (object instanceof LinearDimension) return [{ type: 'endpoint', point: { ...object.p1 } }, { type: 'midpoint', point: mul(add(object.p1, object.p2), 0.5) }, { type: 'endpoint', point: { ...object.p2 } }];
  if (object instanceof DiameterDimension) return [{ type: 'center', point: { ...object.center } }, ...[0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(a => ({ type: 'quadrant', point: add(object.center, { x: object.radius * Math.cos(a), y: object.radius * Math.sin(a) }) }))];
  return [];
}

/** Find nearest valid intersection snap among visible objects. */
export function intersectionSnapPoints(objects, { eps = 1e-7 } = {}) {
  const out = [];
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i], b = objects[j];
    if (!a?.visible || !b?.visible || a instanceof LinearDimension || a instanceof DiameterDimension || b instanceof LinearDimension || b instanceof DiameterDimension) continue;
    const aa = asTrimEdges(a), bb = asTrimEdges(b);
    for (const x of aa) for (const y of bb) {
      let hits = [];
      if (x instanceof Line && y instanceof Line) hits = intersectLineLine(x, y, eps);
      else if (x instanceof Line && (y instanceof Circle || y instanceof Arc)) hits = intersectLineCircle(x, y, eps);
      else if ((x instanceof Circle || x instanceof Arc) && y instanceof Line) hits = intersectLineCircle(y, x, eps).map(h => ({ point: h.point }));
      else if ((x instanceof Circle || x instanceof Arc) && (y instanceof Circle || y instanceof Arc)) hits = intersectCircleCircle(x, y, eps);
      for (const h of hits) if (!out.some(q => distance(q.point, h.point) <= eps)) out.push({ type: 'intersection', point: { ...h.point }, objectIds: [a.id, b.id] });
    }
  }
  return out;
}

/** Serialize the scene into a JSON-compatible object, preserving geometry and styles. */
export function serializeScene(objects) {
  return {
    schema: 'cad-geometry-scene',
    version: 1,
    objects: objects.map(o => {
      const base = { id: o.id, type: o.type, style: structuredCloneSafe(o.style), locked: o.locked, visible: o.visible };
      if (o instanceof Centerline || o instanceof Line) return { ...base, a: { ...o.a }, b: { ...o.b }, ownerId: o.ownerId ?? null };
      if (o instanceof Circle) return { ...base, center: { ...o.center }, radius: o.radius };
      if (o instanceof Arc) return { ...base, center: { ...o.center }, radius: o.radius, startAngle: o.startAngle, sweep: o.sweep };
      if (o instanceof Polygon) return { ...base, vertices: o.vertices.map(p => ({ ...p })) };
      if (o instanceof LinearDimension) return { ...base, p1: { ...o.p1 }, p2: { ...o.p2 }, offset: o.offset, showValue: o.showValue, textHeight: o.textHeight, text: o.text, textOffset: o.textOffset, horizontalText: o.horizontalText };
      if (o instanceof DiameterDimension) return { ...base, center: { ...o.center }, radius: o.radius, angle: o.angle, showValue: o.showValue, textHeight: o.textHeight, text: o.text };
      throw new TypeError(`Неизвестный тип объекта для сериализации: ${o.type}`);
    })
  };
}

/** Restore class instances from a value produced by serializeScene(). */
export function deserializeScene(data) {
  if (!data || data.schema !== 'cad-geometry-scene' || !Array.isArray(data.objects)) {
    throw new TypeError('Некорректный формат сцены');
  }
  return data.objects.map(o => {
    const common = { id: o.id, style: o.style, locked: o.locked, visible: o.visible };
    switch (o.type) {
      case 'line': return new Line(o.a, o.b, { ...common, ownerId: o.ownerId });
      case 'centerline': return new Centerline(o.a, o.b, common);
      case 'circle': return new Circle(o.center, o.radius, common);
      case 'arc': return new Arc(o.center, o.radius, o.startAngle, o.sweep, common);
      case 'polygon': return new Polygon(o.vertices, common);
      case 'linearDimension': return new LinearDimension(o.p1, o.p2, o.offset, { ...common, showValue: o.showValue, textHeight: o.textHeight, text: o.text, textOffset: o.textOffset, horizontalText: o.horizontalText });
      case 'diameterDimension': return new DiameterDimension(o.center, o.radius, { ...common, angle: o.angle, showValue: o.showValue, textHeight: o.textHeight, text: o.text });
      default: throw new TypeError(`Неизвестный тип объекта: ${o.type}`);
    }
  });
}

// ---------- Canvas renderer helpers ----------
/** Draw readable text in a world-Y-up Canvas transform (ctx.scale(s, -s)). */
export function drawWorldTextUpright(ctx, text, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, -1); ctx.fillText(text, 0, 0); ctx.restore();
}

export function drawPrimitive(ctx, object) {
  if (!object.visible) return;
  if (object instanceof LinearDimension) return drawLinearDimension(ctx, object);
  if (object instanceof DiameterDimension) return drawDiameterDimension(ctx, object);
  ctx.save();
  ctx.strokeStyle = object.style.stroke ?? '#111';
  ctx.lineWidth = object.style.lineWidth ?? 0.25;
  ctx.setLineDash(object.style.lineDash ?? []);
  ctx.beginPath();
  if (object instanceof Line) {
    ctx.moveTo(object.a.x, object.a.y); ctx.lineTo(object.b.x, object.b.y);
  } else if (object instanceof Circle) {
    ctx.arc(object.center.x, object.center.y, object.radius, 0, TAU);
  } else if (object instanceof Arc) {
    const start = object.startAngle, end = object.startAngle + object.sweep;
    ctx.arc(object.center.x, object.center.y, object.radius, start, end, object.sweep < 0);
  } else if (object instanceof Polygon) {
    ctx.moveTo(object.vertices[0].x, object.vertices[0].y);
    for (let i = 1; i < object.vertices.length; i++) ctx.lineTo(object.vertices[i].x, object.vertices[i].y);
    ctx.closePath();
  }
  ctx.stroke(); ctx.restore();
}

export function drawLinearDimension(ctx, dimension, { format = v => v.toFixed(2), textPadding = 1 } = {}) {
  const g = dimension.geometry(); if (!g) return;
  ctx.save();
  ctx.strokeStyle = dimension.style.stroke ?? '#111';
  ctx.fillStyle = dimension.style.stroke ?? '#111';
  ctx.lineWidth = dimension.style.lineWidth ?? 0.18;
  ctx.setLineDash([]);
  // Extension lines and dimension line.
  ctx.beginPath(); ctx.moveTo(dimension.p1.x, dimension.p1.y); ctx.lineTo(g.q1.x, g.q1.y);
  ctx.moveTo(dimension.p2.x, dimension.p2.y); ctx.lineTo(g.q2.x, g.q2.y);
  ctx.moveTo(g.q1.x, g.q1.y); ctx.lineTo(g.q2.x, g.q2.y); ctx.stroke();
  const dx = g.q2.x - g.q1.x, dy = g.q2.y - g.q1.y, len = Math.hypot(dx, dy);
  let label = '';
  if (dimension.showValue) {
    label = dimension.text ?? format(g.value);
    ctx.font = `${dimension.textHeight}px "GOST type B", "ISO 3098", sans-serif`;
  }
  if (len > EPS) {
    const ux = dx / len, uy = dy / len;
    const arrowSize = Math.max(1.8, dimension.textHeight * 0.8);
    const measured = dimension.showValue ? ctx.measureText(label).width : 0;
    const arrowsOutside = len < measured + arrowSize * 2 + 2 * textPadding;
    // For short dimensions, arrow bases move outside the extension lines.
    for (const [tip, dir] of [[g.q1, 1], [g.q2, -1]]) {
      const baseDir = arrowsOutside ? -dir : dir;
      const bx = tip.x + ux * arrowSize * baseDir, by = tip.y + uy * arrowSize * baseDir;
      const px = -uy * arrowSize * 0.22, py = ux * arrowSize * 0.22;
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(bx + px, by + py); ctx.lineTo(bx - px, by - py); ctx.closePath(); ctx.fill();
    }
    if (dimension.showValue) {
      const tx = g.middle.x + g.normal.x * dimension.textOffset;
      const ty = g.middle.y + g.normal.y * dimension.textOffset;
      // White knockout behind text prevents the dimension line crossing digits.
      const metrics = ctx.measureText(label);
      const h = dimension.textHeight;
      ctx.save(); ctx.translate(tx, ty); ctx.scale(1, -1);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-metrics.width / 2 - textPadding, -h * 0.65, metrics.width + 2 * textPadding, h * 1.3);
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // Counter-flip text for an upright glyph orientation in a world-Y-up scene.
      ctx.fillText(label, 0, 0); ctx.restore();
    }
  }
  ctx.restore();
}

export function drawDiameterDimension(ctx, dimension, { format = v => v.toFixed(2), textPadding = 1 } = {}) {
  const g = dimension.geometry();
  ctx.save(); ctx.strokeStyle = dimension.style.stroke ?? '#111'; ctx.fillStyle = '#111';
  ctx.lineWidth = dimension.style.lineWidth ?? 0.18;
  ctx.beginPath(); ctx.moveTo(g.p1.x, g.p1.y); ctx.lineTo(g.p2.x, g.p2.y); ctx.stroke();
  // Arrow tips touch the circle; bases point toward its centre.
  const ux = Math.cos(dimension.angle), uy = Math.sin(dimension.angle);
  const arrowSize = Math.max(1.8, dimension.textHeight * 0.8);
  for (const [tip, direction] of [[g.p1, 1], [g.p2, -1]]) {
    const bx = tip.x + ux * arrowSize * direction, by = tip.y + uy * arrowSize * direction;
    const px = -uy * arrowSize * 0.22, py = ux * arrowSize * 0.22;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(bx + px, by + py); ctx.lineTo(bx - px, by - py); ctx.closePath(); ctx.fill();
  }
  if (dimension.showValue) {
    const mid = mul(add(g.p1, g.p2), 0.5);
    const label = dimension.text ?? `Ø${format(g.value)}`;
    ctx.font = `${dimension.textHeight}px "GOST type B", "ISO 3098", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(label), h = dimension.textHeight;
    ctx.save(); ctx.translate(mid.x, mid.y); ctx.scale(1, -1);
    ctx.fillStyle = '#fff'; ctx.fillRect(-metrics.width / 2 - textPadding, -h * 0.65, metrics.width + 2 * textPadding, h * 1.3);
    ctx.fillStyle = '#111'; ctx.fillText(label, 0, 0); ctx.restore();
  }
  ctx.restore();
}

// ---------- Simple pointer-to-object helper ----------
export function hitTest(object, point, tolerance) {
  if (object instanceof Line) return pointDistanceToLine(object, point) <= tolerance;
  if (object instanceof Circle) return pointDistanceToCircle(object, point) <= tolerance;
  if (object instanceof Arc) return pointDistanceToArc(object, point) <= tolerance;
  if (object instanceof Polygon) return object.edges().some(edge => pointDistanceToLine(edge, point) <= tolerance);
  return false;
}
