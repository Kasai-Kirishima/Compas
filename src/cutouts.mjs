/**
 * 2D cutout helpers for mechanical profiles.
 *
 * This module deliberately distinguishes between:
 *  - a geometric contour notch (edits one Polygon boundary), and
 *  - a hole/pocket contour (a separate closed contour placed inside a part).
 *
 * It is a 2D drafting operation, not a 3D solid Boolean operation.
 */
import { Polygon, Circle, distance, sub, add, mul, dot, cross, clamp, EPS } from './cad-geometry-trim.mjs';
import { createSlot } from './templates.mjs';

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} має бути додатним числом`);
  return value;
}
function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
function pointOnSegment(p, a, b, eps = 1e-8) {
  const ab = sub(b, a), ap = sub(p, a);
  if (Math.abs(cross(ab, ap)) > eps * Math.max(1, distance(a, b))) return false;
  return dot(ap, sub(p, b)) <= eps;
}
function pointInPolygon(point, vertices, eps = 1e-8) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j], b = vertices[i];
    if (pointOnSegment(point, a, b, eps)) return true;
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      (point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}
function orientation(a, b, c) { return cross(sub(b, a), sub(c, a)); }
function segmentsProperlyIntersect(a, b, c, d, eps = 1e-8) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  const scale = Math.max(1, distance(a, b), distance(c, d));
  const tol = eps * scale;
  if (Math.abs(o1) <= tol && pointOnSegment(c, a, b, eps)) return true;
  if (Math.abs(o2) <= tol && pointOnSegment(d, a, b, eps)) return true;
  if (Math.abs(o3) <= tol && pointOnSegment(a, c, d, eps)) return true;
  if (Math.abs(o4) <= tol && pointOnSegment(b, c, d, eps)) return true;
  return ((o1 > tol && o2 < -tol) || (o1 < -tol && o2 > tol)) &&
    ((o3 > tol && o4 < -tol) || (o3 < -tol && o4 > tol));
}
function isSimplePolygon(vertices, eps = 1e-8) {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i], b = vertices[(i + 1) % n];
    if (distance(a, b) <= eps) return false;
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || i === (j + 1) % n) continue;
      const c = vertices[j], d = vertices[(j + 1) % n];
      if (segmentsProperlyIntersect(a, b, c, d, eps)) return false;
    }
  }
  return true;
}

/**
 * Cut a rectangular, open-to-edge notch into one selected polygon edge.
 * `edgeIndex` is the edge from vertices[i] to vertices[(i+1)%n].
 * `width` runs along that edge; `depth` runs inward into the polygon.
 * `centerOffset` shifts the notch centre relative to the edge midpoint.
 *
 * Returns an immutable scene transaction compatible with SceneHistory.apply().
 * The original polygon is replaced by one polygon with a notched boundary.
 */
export function cutPolygonNotch(polygon, edgeIndex, width, depth, {
  centerOffset = 0,
  minWeb = 0,
  eps = 1e-7,
  style = polygon?.style,
} = {}) {
  if (!(polygon instanceof Polygon)) throw new TypeError('Виріз по краю підтримує лише об’єкт Polygon');
  if (polygon.locked) return { ok: false, reason: 'Контур заблоковано' };
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= polygon.vertices.length) {
    throw new RangeError('Неправильний індекс ребра багатокутника');
  }
  positive(width, 'Ширина вирізу'); positive(depth, 'Глибина вирізу');
  if (!Number.isFinite(centerOffset) || !Number.isFinite(minWeb) || minWeb < 0) {
    throw new TypeError('centerOffset має бути числом, а minWeb — невід’ємним числом');
  }
  const vertices = polygon.vertices.map(p => ({ ...p }));
  const a = vertices[edgeIndex], b = vertices[(edgeIndex + 1) % vertices.length];
  const edge = sub(b, a), edgeLength = distance(a, b);
  if (edgeLength <= eps) return { ok: false, reason: 'Вибране ребро занадто коротке' };
  const u = mul(edge, 1 / edgeLength);
  const area = signedArea(vertices);
  if (Math.abs(area) <= eps) return { ok: false, reason: 'Контур має нульову площу' };
  // For CCW winding, polygon interior is to the left of every directed edge.
  const inward = area > 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  const centerS = edgeLength / 2 + centerOffset;
  const s0 = centerS - width / 2, s1 = centerS + width / 2;
  if (s0 < minWeb - eps || s1 > edgeLength - minWeb + eps) {
    return { ok: false, reason: 'Виріз не поміщається на вибраному ребрі або порушує мінімальну перемичку' };
  }
  const p0 = add(a, mul(u, s0)), p1 = add(a, mul(u, s1));
  const q0 = add(p0, mul(inward, depth)), q1 = add(p1, mul(inward, depth));
  if (!pointInPolygon(q0, vertices, eps) || !pointInPolygon(q1, vertices, eps)) {
    return { ok: false, reason: 'Задана глибина виходить за межі контуру деталі' };
  }
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    result.push({ ...vertices[i] });
    if (i === edgeIndex) result.push(p0, q0, q1, p1);
  }
  if (!isSimplePolygon(result, eps)) return { ok: false, reason: 'Такий виріз створює самоперетин контуру' };
  const newArea = signedArea(result);
  if (Math.abs(newArea) >= Math.abs(area) - eps || Math.sign(newArea) !== Math.sign(area)) {
    return { ok: false, reason: 'Виріз не зменшив площу контуру коректним способом' };
  }
  const replacement = new Polygon(result, {
    style: style ?? polygon.style,
    visible: polygon.visible,
    locked: polygon.locked,
    ownerId: polygon.ownerId ?? polygon.id,
  });
  return {
    ok: true,
    operation: 'cutout',
    remove: [polygon.id],
    add: [replacement],
    removed: { polygonId: polygon.id, edgeIndex, width, depth, centerOffset },
    metadata: { oldArea: Math.abs(area), newArea: Math.abs(newArea), removedArea: Math.abs(area) - Math.abs(newArea) },
  };
}

/**
 * Cut an inward, open-to-edge notch into a circular boundary.
 * The opening width is measured as the straight chord between its two mouth points;
 * the side walls follow the circle's radial directions and the bottom is a chord.
 * The circular arc is tessellated into a closed Polygon because the editor stores
 * the resulting notched boundary as one editable polyline.
 */
export function cutCircleNotchAtPoint(circle, point, width, depth, {
  hitTolerance = Infinity,
  minWeb = 0,
  segmentsPerTurn = 360,
  eps = 1e-7,
  style = circle?.style,
} = {}) {
  if (!(circle instanceof Circle)) throw new TypeError('Виріз по краю окружності підтримує лише об’єкт Circle');
  if (circle.locked) return { ok: false, reason: 'Контур заблоковано' };
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError('Точка вирізу має містити координати x та y');
  }
  positive(width, 'Ширина вирізу');
  positive(depth, 'Глибина вирізу');
  if ((hitTolerance !== Infinity && (!Number.isFinite(hitTolerance) || hitTolerance < 0)) ||
      !Number.isFinite(minWeb) || minWeb < 0 || !Number.isInteger(segmentsPerTurn) || segmentsPerTurn < 36) {
    throw new TypeError('Неправильні параметри допуску, перемички або точності дуги');
  }

  const radius = circle.radius;
  const radialDistance = distance(circle.center, point);
  if (radialDistance <= eps) return { ok: false, reason: 'Щёлкните ближе к окружности, а не к её центру' };
  if (Math.abs(radialDistance - radius) > hitTolerance) {
    return { ok: false, reason: 'Клацніть ближче до лінії окружності' };
  }
  if (width >= 2 * radius - eps) {
    return { ok: false, reason: 'Ширина выреза должна быть меньше диаметра окружности' };
  }
  if (depth >= radius - eps) {
    return { ok: false, reason: 'Глубина выреза не должна достигать центра окружности' };
  }

  const halfAngle = Math.asin(width / (2 * radius));
  const openingSweep = 2 * halfAngle;
  const remainingArcLength = radius * (2 * Math.PI - openingSweep);
  if (remainingArcLength < 2 * minWeb - eps) {
    return { ok: false, reason: 'Слишком мало материала на оставшейся дуге для заданной минимальной перемычки' };
  }

  const angle = Math.atan2(point.y - circle.center.y, point.x - circle.center.x);
  const a0 = angle - halfAngle;
  const a1 = angle + halfAngle;
  const innerRadius = radius - depth;
  const pointAt = (r, a) => ({
    x: circle.center.x + r * Math.cos(a),
    y: circle.center.y + r * Math.sin(a),
  });
  const p0 = pointAt(radius, a0);
  const q0 = pointAt(innerRadius, a0);
  const q1 = pointAt(innerRadius, a1);
  const p1 = pointAt(radius, a1);

  const remainingSweep = 2 * Math.PI - openingSweep;
  const segmentCount = Math.max(2, Math.ceil(segmentsPerTurn * remainingSweep / (2 * Math.PI)));
  const vertices = [p0, q0, q1, p1];
  // Walk the remaining outer arc in the same direction and close back to p0.
  for (let i = 1; i < segmentCount; i++) {
    const a = a1 + remainingSweep * i / segmentCount;
    vertices.push(pointAt(radius, a));
  }

  if (!isSimplePolygon(vertices, eps)) {
    return { ok: false, reason: 'Такой вырез создаёт самопересечение контура' };
  }
  const oldArea = Math.PI * radius * radius;
  const newArea = Math.abs(signedArea(vertices));
  if (!(newArea < oldArea - eps)) {
    return { ok: false, reason: 'Не удалось корректно уменьшить площадь окружности' };
  }

  const replacement = new Polygon(vertices, {
    style: style ?? circle.style,
    visible: circle.visible,
    locked: circle.locked,
    ownerId: circle.ownerId ?? circle.id,
  });
  return {
    ok: true,
    operation: 'cutout',
    remove: [circle.id],
    add: [replacement],
    removed: { circleId: circle.id, width, depth, angle, halfAngle },
    metadata: { oldArea, newArea, removedArea: oldArea - newArea, remainingArcLength },
  };
}

/** Pick the nearest polygon edge to the click and cut a centred notch there. */
export function cutPolygonNotchAtPoint(polygon, point, width, depth, {
  hitTolerance = Infinity,
  ...options
} = {}) {
  if (!(polygon instanceof Polygon)) throw new TypeError('Потрібен багатокутник');
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError('Точка вирізу має містити координати x та y');
  let nearest = null;
  for (let i = 0; i < polygon.vertices.length; i++) {
    const a = polygon.vertices[i], b = polygon.vertices[(i + 1) % polygon.vertices.length];
    const ab = sub(b, a), den = dot(ab, ab);
    const t = den > 0 ? clamp(dot(sub(point, a), ab) / den, 0, 1) : 0;
    const projected = add(a, mul(ab, t));
    const d = distance(point, projected);
    if (!nearest || d < nearest.distance) nearest = { edgeIndex: i, distance: d, edgeLength: Math.sqrt(den), t };
  }
  if (!nearest || nearest.distance > hitTolerance) return { ok: false, reason: 'Клацніть ближче до ребра контуру' };
  const centerOffset = (nearest.t - 0.5) * nearest.edgeLength;
  return cutPolygonNotch(polygon, nearest.edgeIndex, width, depth, { ...options, centerOffset });
}

/** Closed inner rectangular contour. Use it as a 2D pocket/hole boundary. */
export function createRectangularPocket(center, width, height, angle = 0, { style = { stroke: '#111111', lineWidth: 0.25, lineDash: [] }, ownerId = null } = {}) {
  positive(width, 'Ширина кишені'); positive(height, 'Висота кишені');
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(angle)) throw new TypeError('Неправильний центр або кут кишені');
  const c = Math.cos(angle), s = Math.sin(angle), hw = width / 2, hh = height / 2;
  const vertices = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y]) => ({ x: center.x + x*c - y*s, y: center.y + x*s + y*c }));
  const pocket = new Polygon(vertices, { style, ownerId });
  pocket.feature = 'rectangular-pocket';
  return [pocket];
}

/** Circular hole contour for a 2D drawing. */
export function createCircularCutout(center, radius, options = {}) {
  positive(radius, 'Радіус отвору');
  const hole = new Circle(center, radius, options);
  hole.feature = 'circular-cutout';
  return [hole];
}

/** Rounded obround cutout contour, represented by two lines and two arcs. */
export function createObroundCutout(center, overallLength, width, angle = 0, options = {}) {
  const out = createSlot(center, overallLength, width, angle, options);
  out.forEach(object => { object.feature = 'obround-cutout'; });
  return out;
}
