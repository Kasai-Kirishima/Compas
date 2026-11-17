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
    metadata: {
      oldArea: Math.abs(area), newArea: Math.abs(newArea), removedArea: Math.abs(area) - Math.abs(newArea),
      notch: { mouthStart: p0, innerStart: q0, innerEnd: q1, mouthEnd: p1 },
    },
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
    metadata: {
      oldArea, newArea, removedArea: oldArea - newArea, remainingArcLength,
      notch: { mouthStart: p0, innerStart: q0, innerEnd: q1, mouthEnd: p1 },
    },
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
  // Curved outlines are tessellated into many short edges. When the requested
  // notch is wider than the nearest tessellation edge, measure its mouth along
  // the whole contour instead of refusing a perfectly valid cut.
  const minWeb = options.minWeb ?? 0;
  const halfWidth = width / 2;
  const centerS = nearest.t * nearest.edgeLength;
  if (width > nearest.edgeLength + 1e-7 || centerS - halfWidth < minWeb - 1e-7 ||
      centerS + halfWidth > nearest.edgeLength - minWeb + 1e-7) {
    return cutPolygonNotchAlongBoundaryAtPoint(polygon, point, width, depth, { hitTolerance, ...options });
  }
  const centerOffset = (nearest.t - 0.5) * nearest.edgeLength;
  return cutPolygonNotch(polygon, nearest.edgeIndex, width, depth, { ...options, centerOffset });
}

/**
 * Convert a normal inward notch into an open contour by removing only its
 * inner/base edge. Both side walls remain, while the bottom closing line is
 * intentionally absent. The returned path is a single editable open polyline.
 */
function openNotchWithoutBase(transaction, eps = 1e-6) {
  if (!transaction?.ok) return transaction;
  const vertices = transaction.add?.[0]?.vertices;
  const notch = transaction.metadata?.notch;
  if (!Array.isArray(vertices) || vertices.length < 4 || !notch?.innerStart || !notch?.innerEnd) {
    return { ok: false, reason: 'Не удалось определить нижнюю стенку выреза' };
  }
  const nearestIndex = target => {
    let best = { index: -1, distance: Infinity };
    vertices.forEach((vertex, index) => {
      const d = distance(vertex, target);
      if (d < best.distance) best = { index, distance: d };
    });
    return best;
  };
  const start = nearestIndex(notch.innerEnd); // q1: right end of the missing base
  const end = nearestIndex(notch.innerStart); // q0: left end of the missing base
  if (start.index < 0 || end.index < 0 || start.index === end.index || start.distance > eps || end.distance > eps) {
    return { ok: false, reason: 'Не удалось корректно построить открытый вырез' };
  }
  const path = [];
  let index = start.index;
  path.push({ ...vertices[index] });
  for (let guard = 0; guard < vertices.length && index !== end.index; guard++) {
    index = (index + 1) % vertices.length;
    path.push({ ...vertices[index] });
  }
  if (index !== end.index || path.length < 3) {
    return { ok: false, reason: 'Не удалось удалить нижнюю стенку выреза' };
  }
  return {
    ok: true,
    operation: 'cutout-open-base',
    path,
    metadata: { ...transaction.metadata, bottomWallRemoved: true, retainedSideWalls: true },
  };
}

/** Inward notch with side walls, but without the bottom/base closing line. */
export function cutPolygonNotchWithoutBottomAtPoint(polygon, point, width, depth, options = {}) {
  return openNotchWithoutBase(cutPolygonNotchAtPoint(polygon, point, width, depth, options));
}

/** Circular counterpart of cutPolygonNotchWithoutBottomAtPoint(). */
export function cutCircleNotchWithoutBottomAtPoint(circle, point, width, depth, options = {}) {
  return openNotchWithoutBase(cutCircleNotchAtPoint(circle, point, width, depth, options));
}

/**
 * Cut an inward notch whose mouth may span several consecutive polygon edges.
 * Width is measured as distance along the contour, which makes this suitable
 * for ellipses, rounded rectangles and already-notched outlines. The generated
 * notch has locally-normal side walls and a straight inner base.
 */
export function cutPolygonNotchAlongBoundaryAtPoint(polygon, point, width, depth, {
  hitTolerance = Infinity,
  minWeb = 0,
  eps = 1e-7,
  style = polygon?.style,
} = {}) {
  if (!(polygon instanceof Polygon)) throw new TypeError('Нужен замкнутый многоугольный контур');
  if (polygon.locked) return { ok: false, reason: 'Контур заблоковано' };
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError('Точка вирізу має містити координати x та y');
  positive(width, 'Ширина вирізу'); positive(depth, 'Глубина выреза');
  if ((hitTolerance !== Infinity && (!Number.isFinite(hitTolerance) || hitTolerance < 0)) || !Number.isFinite(minWeb) || minWeb < 0) {
    throw new TypeError('Неправильні параметри допуску або перемички');
  }

  const vertices = polygon.vertices.map(p => ({ ...p }));
  const area = signedArea(vertices), absArea = Math.abs(area);
  if (absArea <= eps) return { ok: false, reason: 'Контур має нульову площу' };
  const lengths = [], cumulative = [0];
  for (let i = 0; i < vertices.length; i++) {
    const len = distance(vertices[i], vertices[(i + 1) % vertices.length]);
    if (len <= eps) return { ok: false, reason: 'Контур містить занадто коротке ребро' };
    lengths.push(len); cumulative.push(cumulative[i] + len);
  }
  const perimeter = cumulative[cumulative.length - 1];
  if (width >= perimeter - 2 * minWeb - eps) return { ok: false, reason: 'Ширина выреза слишком велика для периметра контура' };

  let nearest = null;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length], ab = sub(b, a), den = dot(ab, ab);
    const t = den > 0 ? clamp(dot(sub(point, a), ab) / den, 0, 1) : 0;
    const projected = add(a, mul(ab, t)), d = distance(point, projected);
    if (!nearest || d < nearest.distance) nearest = { edgeIndex: i, distance: d, t, along: cumulative[i] + lengths[i] * t };
  }
  if (!nearest || nearest.distance > hitTolerance) return { ok: false, reason: 'Клацніть ближче до контуру' };

  const start = ((nearest.along - width / 2) % perimeter + perimeter) % perimeter;
  const end = start + width;
  const pointAt = target => {
    const s = ((target % perimeter) + perimeter) % perimeter;
    for (let i = 0; i < lengths.length; i++) {
      if (s <= cumulative[i + 1] + eps) {
        const t = clamp((s - cumulative[i]) / lengths[i], 0, 1);
        return { point: add(vertices[i], mul(sub(vertices[(i + 1) % vertices.length], vertices[i]), t)), edgeIndex: i };
      }
    }
    return { point: { ...vertices[0] }, edgeIndex: 0 };
  };
  const mouth0 = pointAt(start), mouth1 = pointAt(end);
  const inwardNormal = edgeIndex => {
    const a = vertices[edgeIndex], b = vertices[(edgeIndex + 1) % vertices.length], d = sub(b, a), len = lengths[edgeIndex];
    return area > 0 ? { x: -d.y / len, y: d.x / len } : { x: d.y / len, y: -d.x / len };
  };
  const p0 = mouth0.point, p1 = mouth1.point;
  const n0 = inwardNormal(mouth0.edgeIndex), n1 = inwardNormal(mouth1.edgeIndex);
  const q0 = add(p0, mul(n0, depth)), q1 = add(p1, mul(n1, depth));
  if (!pointInPolygon(q0, vertices, eps) || !pointInPolygon(q1, vertices, eps)) {
    return { ok: false, reason: 'Заданная глубина выходит за пределы контура детали' };
  }
  // A straight bottom across a strongly concave region could leave the part.
  for (let i = 1; i < 8; i++) {
    const t = i / 8, sample = add(q0, mul(sub(q1, q0), t));
    if (!pointInPolygon(sample, vertices, eps)) return { ok: false, reason: 'Вырез пересекает вогнутую границу контура' };
  }

  const result = [p0, q0, q1, p1];
  // Follow the uncut part of the original boundary from the second mouth
  // point back to the first, naturally crossing the perimeter origin if needed.
  const retainedVertices = [];
  for (let i = 0; i < vertices.length; i++) {
    let along = cumulative[i];
    while (along <= end + eps) along += perimeter;
    if (along < start + perimeter - eps) retainedVertices.push({ along, point: { ...vertices[i] } });
  }
  retainedVertices.sort((a, b) => a.along - b.along);
  retainedVertices.forEach(({ point: p }) => result.push(p));
  if (!isSimplePolygon(result, eps)) return { ok: false, reason: 'Такой вырез создаёт самопересечение контура' };
  const newArea = Math.abs(signedArea(result));
  if (!(newArea < absArea - eps) || Math.sign(signedArea(result)) !== Math.sign(area)) {
    return { ok: false, reason: 'Не удалось корректно уменьшить площадь контура' };
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
    removed: { edgeIndex: nearest.edgeIndex, width, depth, start, end, alongBoundary: true },
    metadata: {
      oldArea: absArea, newArea, removedArea: absArea - newArea, perimeter, remainingBoundary: perimeter - width,
      notch: { mouthStart: p0, innerStart: q0, innerEnd: q1, mouthEnd: p1 },
    },
  };
}

/**
 * Remove a finite-width gap from an open path (a line, arc approximation, or
 * open polyline). The gap is measured along the path, centred on the nearest
 * point to the click. It can be called repeatedly on any remaining fragment;
 * there is deliberately no per-object cut-count limit.
 *
 * `points` are ordered from the start to the end of the path. The result
 * contains zero, one, or two open point arrays in `fragments`.
 */
export function cutOpenPathGapAtPoint(points, point, width, {
  hitTolerance = Infinity,
  eps = 1e-7,
} = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new TypeError('Для разреза нужен открытый путь минимум из двух точек');
  }
  points.forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError(`Точка пути ${i + 1} должна содержать конечные координаты x и y`);
    }
  });
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError('Точка разреза должна содержать координаты x и y');
  }
  positive(width, 'Ширина разреза');
  if ((hitTolerance !== Infinity && (!Number.isFinite(hitTolerance) || hitTolerance < 0)) ||
      !Number.isFinite(eps) || eps <= 0) {
    throw new TypeError('Неправильный допуск разреза');
  }

  const lengths = [];
  const cumulative = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const length = distance(points[i], points[i + 1]);
    lengths.push(length);
    cumulative.push(cumulative[i] + length);
  }
  const totalLength = cumulative[cumulative.length - 1];
  if (totalLength <= eps) return { ok: false, reason: 'Отрезок слишком короткий для разреза' };

  let nearest = null;
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i], b = points[i + 1], ab = sub(b, a), den = dot(ab, ab);
    if (den <= eps * eps) continue;
    const t = clamp(dot(sub(point, a), ab) / den, 0, 1);
    const projected = add(a, mul(ab, t));
    const d = distance(point, projected);
    if (!nearest || d < nearest.distance) {
      nearest = { segmentIndex: i, distance: d, t, along: cumulative[i] + lengths[i] * t, projected };
    }
  }
  if (!nearest || nearest.distance > hitTolerance) {
    return { ok: false, reason: 'Щёлкните ближе к отрезку или линии' };
  }

  const start = Math.max(0, nearest.along - width / 2);
  const end = Math.min(totalLength, nearest.along + width / 2);
  const removedLength = end - start;
  if (removedLength <= eps) return { ok: false, reason: 'Не удалось определить участок разреза' };

  const pointAtDistance = target => {
    if (target <= 0) return { ...points[0] };
    if (target >= totalLength) return { ...points[points.length - 1] };
    for (let i = 0; i < lengths.length; i++) {
      if (target <= cumulative[i + 1] + eps) {
        const len = lengths[i];
        const t = len > eps ? clamp((target - cumulative[i]) / len, 0, 1) : 0;
        return add(points[i], mul(sub(points[i + 1], points[i]), t));
      }
    }
    return { ...points[points.length - 1] };
  };
  const slicePath = (from, to) => {
    if (to - from <= eps) return [];
    const result = [pointAtDistance(from)];
    for (let i = 1; i < points.length - 1; i++) {
      if (cumulative[i] > from + eps && cumulative[i] < to - eps) result.push({ ...points[i] });
    }
    result.push(pointAtDistance(to));
    return result.filter((p, i) => i === 0 || distance(p, result[i - 1]) > eps);
  };

  const fragments = [slicePath(0, start), slicePath(end, totalLength)]
    .filter(fragment => fragment.length >= 2 &&
      fragment.some((p, i) => i > 0 && distance(p, fragment[i - 1]) > eps));
  if (!fragments.length) return { ok: false, reason: 'Разрез удаляет весь отрезок — оставшейся геометрии нет' };

  return {
    ok: true,
    operation: 'segment-gap',
    fragments,
    removed: {
      segmentIndex: nearest.segmentIndex,
      clickDistance: nearest.distance,
      centerDistance: nearest.along,
      requestedWidth: width,
      actualWidth: removedLength,
      start,
      end,
    },
    metadata: { oldLength: totalLength, newLength: totalLength - removedLength, removedLength, fragmentCount: fragments.length },
  };
}


/**
 * Split an open path into two independently editable paths at the point nearest
 * to the cursor. The split is allowed at any interior position, including the
 * exact midpoint; there is no percentage-of-length restriction.
 */
export function splitOpenPathAtPoint(points, point, {
  hitTolerance = Infinity,
  eps = 1e-8,
} = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new TypeError('Для разделения нужен открытый путь минимум из двух точек');
  }
  points.forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError(`Точка пути ${i + 1} должна содержать конечные координаты x и y`);
    }
  });
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError('Точка разделения должна содержать координаты x и y');
  }
  if ((hitTolerance !== Infinity && (!Number.isFinite(hitTolerance) || hitTolerance < 0)) ||
      !Number.isFinite(eps) || eps <= 0) {
    throw new TypeError('Неправильный допуск разделения');
  }

  const lengths = [], cumulative = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const len = distance(points[i], points[i + 1]);
    lengths.push(len);
    cumulative.push(cumulative[i] + len);
  }
  const totalLength = cumulative.at(-1);
  if (totalLength <= eps) return { ok: false, reason: 'Длина пути равна нулю' };

  let nearest = null;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] <= eps) continue;
    const a = points[i], b = points[i + 1], ab = sub(b, a);
    const t = clamp(dot(sub(point, a), ab) / dot(ab, ab), 0, 1);
    const projected = add(a, mul(ab, t));
    const d = distance(point, projected);
    if (!nearest || d < nearest.distance) {
      nearest = { segmentIndex: i, t, distance: d, along: cumulative[i] + lengths[i] * t, projected };
    }
  }
  if (!nearest || nearest.distance > hitTolerance) {
    return { ok: false, reason: 'Щёлкните по линии или ближе к ней' };
  }

  const splitAt = nearest.along;
  // Only the mathematical endpoints are non-splittable. No arbitrary 2% or
  // other relative margin is imposed on short or long segments.
  if (splitAt <= eps || totalLength - splitAt <= eps) {
    return { ok: false, reason: 'Точка находится на самом конце пути — выберите любую внутреннюю точку' };
  }
  const pointAt = target => {
    if (target <= eps) return { ...points[0] };
    if (target >= totalLength - eps) return { ...points.at(-1) };
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] <= eps) continue;
      if (target <= cumulative[i + 1] + eps) {
        const t = clamp((target - cumulative[i]) / lengths[i], 0, 1);
        return add(points[i], mul(sub(points[i + 1], points[i]), t));
      }
    }
    return { ...points.at(-1) };
  };
  const slice = (from, to) => {
    const out = [pointAt(from)];
    for (let i = 1; i < points.length - 1; i++) {
      if (cumulative[i] > from + eps && cumulative[i] < to - eps) out.push({ ...points[i] });
    }
    out.push(pointAt(to));
    return out.filter((p, i) => i === 0 || distance(p, out[i - 1]) > eps);
  };
  const fragments = [slice(0, splitAt), slice(splitAt, totalLength)]
    .filter(path => path.length >= 2 && path.some((p, i) => i > 0 && distance(p, path[i - 1]) > eps));
  if (fragments.length !== 2) return { ok: false, reason: 'Не удалось создать две непустые части' };

  return {
    ok: true,
    operation: 'split-open-path',
    fragments,
    splitPoint: nearest.projected,
    removed: { segmentIndex: nearest.segmentIndex, parameter: nearest.t, distance: nearest.distance, along: splitAt },
    metadata: { originalLength: totalLength, firstLength: splitAt, secondLength: totalLength - splitAt, fragmentCount: 2 },
  };
}

/**
 * Divide a simple closed contour with a straight chord whose endpoints are
 * picked on the boundary. Each returned part is a closed polygon, sharing the
 * newly-created cutting edge. Works for convex and concave contours whenever
 * the chosen chord lies inside the original contour.
 */
export function splitClosedPolygonAtPoints(vertices, firstPoint, secondPoint, {
  hitTolerance = Infinity,
  eps = 1e-7,
} = {}) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    throw new TypeError('Для разделения нужен замкнутый контур минимум из трёх точек');
  }
  vertices.forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError(`Вершина ${i + 1} должна содержать конечные координаты x и y`);
    }
  });
  for (const [p, name] of [[firstPoint, 'Первая'], [secondPoint, 'Вторая']]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`${name} точка разреза должна содержать координаты x и y`);
  }
  if ((hitTolerance !== Infinity && (!Number.isFinite(hitTolerance) || hitTolerance < 0)) || !Number.isFinite(eps) || eps <= 0) {
    throw new TypeError('Неправильный допуск разделения');
  }

  const clean = vertices.map(p => ({ ...p }));
  if (clean.length > 3 && distance(clean[0], clean.at(-1)) <= eps) clean.pop();
  const lengths = [], cumulative = [0];
  for (let i = 0; i < clean.length; i++) {
    const len = distance(clean[i], clean[(i + 1) % clean.length]);
    if (len <= eps) return { ok: false, reason: 'Контур содержит нулевое ребро' };
    lengths.push(len); cumulative.push(cumulative.at(-1) + len);
  }
  const perimeter = cumulative.at(-1);
  if (Math.abs(signedArea(clean)) <= eps) return { ok: false, reason: 'Площадь контура равна нулю' };

  const project = p => {
    let best = null;
    for (let i = 0; i < clean.length; i++) {
      const a = clean[i], b = clean[(i + 1) % clean.length], ab = sub(b, a), den = dot(ab, ab);
      const t = clamp(dot(sub(p, a), ab) / den, 0, 1);
      const q = add(a, mul(ab, t)), d = distance(p, q);
      if (!best || d < best.distance) best = { edgeIndex: i, t, point: q, distance: d, along: cumulative[i] + lengths[i] * t };
    }
    return best;
  };
  const a = project(firstPoint), b = project(secondPoint);
  if (a.distance > hitTolerance || b.distance > hitTolerance) {
    return { ok: false, reason: 'Обе точки нужно поставить на границе одного контура' };
  }
  const forward = ((b.along - a.along) % perimeter + perimeter) % perimeter;
  const backward = perimeter - forward;
  if (Math.min(forward, backward) <= eps || distance(a.point, b.point) <= eps) {
    return { ok: false, reason: 'Точки разделения совпадают — выберите две разные точки контура' };
  }

  const pointAt = target => {
    const s = ((target % perimeter) + perimeter) % perimeter;
    for (let i = 0; i < lengths.length; i++) {
      if (s <= cumulative[i + 1] + eps) {
        const t = clamp((s - cumulative[i]) / lengths[i], 0, 1);
        return add(clean[i], mul(sub(clean[(i + 1) % clean.length], clean[i]), t));
      }
    }
    return { ...clean[0] };
  };
  const boundaryChain = (from, distanceAlong) => {
    const to = from + distanceAlong, out = [pointAt(from)];
    for (let lap = 0; lap <= 1; lap++) {
      for (let i = 0; i < clean.length; i++) {
        const s = cumulative[i] + lap * perimeter;
        if (s > from + eps && s < to - eps) out.push({ ...clean[i] });
      }
    }
    out.push(pointAt(to));
    return out.filter((p, i) => i === 0 || distance(p, out[i - 1]) > eps);
  };
  const first = boundaryChain(a.along, forward);
  const second = boundaryChain(b.along, backward);
  if (first.length < 2 || second.length < 2) return { ok: false, reason: 'Не удалось построить части контура' };

  // The chord must be inside the original region. Sampling the whole chord
  // avoids silently producing invalid pieces across a concave indentation.
  for (let i = 1; i < 20; i++) {
    const t = i / 20, sample = add(a.point, mul(sub(b.point, a.point), t));
    if (!pointInPolygon(sample, clean, eps)) {
      return { ok: false, reason: 'Линия разреза выходит за пределы вогнутого контура. Выберите другие точки' };
    }
  }
  if (!isSimplePolygon(first, eps) || !isSimplePolygon(second, eps)) {
    return { ok: false, reason: 'Такое разделение создаёт самопересечение. Выберите другие точки' };
  }
  const oldArea = Math.abs(signedArea(clean));
  const area1 = Math.abs(signedArea(first)), area2 = Math.abs(signedArea(second));
  if (area1 <= eps || area2 <= eps || Math.abs(area1 + area2 - oldArea) > Math.max(eps * 20, oldArea * 1e-5)) {
    return { ok: false, reason: 'Не удалось разделить контур на две корректные части' };
  }
  return {
    ok: true,
    operation: 'split-closed-polygon',
    fragments: [first, second],
    splitPoints: [a.point, b.point],
    metadata: { originalArea: oldArea, firstArea: area1, secondArea: area2, firstPerimeter: forward + distance(a.point, b.point), secondPerimeter: backward + distance(a.point, b.point) },
  };
}

/**
 * Remove a measured segment from a closed contour without adding notch walls.
 * The remaining perimeter is returned as one editable open path. Width is
 * measured along the contour, centred at the closest point to the click.
 */
export function cutClosedBoundaryGapAtPoint(points, point, width, { hitTolerance = Infinity, eps = 1e-7 } = {}) {
  if (!Array.isArray(points) || points.length < 3) return { ok: false, reason: 'Потрібен замкнутий контур' };
  positive(width, 'Ширина розрізу');
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      (hitTolerance !== Infinity && (!Number.isFinite(hitTolerance) || hitTolerance < 0))) {
    throw new TypeError('Неправильна точка або допуск розрізу');
  }
  const cumulative = [0];
  let perimeter = 0, nearest = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len > eps) {
      const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (len * len), 0, 1);
      const projected = { x: a.x + dx * t, y: a.y + dy * t };
      const d = distance(projected, point);
      if (!nearest || d < nearest.distance) nearest = { distance: d, s: perimeter + t * len };
      perimeter += len;
    }
    cumulative.push(perimeter);
  }
  if (!nearest || nearest.distance > hitTolerance) return { ok: false, reason: 'Щёлкните ближе к границе контура' };
  if (width >= perimeter - eps) return { ok: false, reason: 'Ширина разреза должна быть меньше длины контура' };

  const wrap = value => ((value % perimeter) + perimeter) % perimeter;
  const atDistance = value => {
    const d = wrap(value);
    for (let i = 0; i < points.length; i++) {
      const start = cumulative[i], end = cumulative[i + 1], len = end - start;
      if (len > eps && d <= end + eps) {
        const t = clamp((d - start) / len, 0, 1), a = points[i], b = points[(i + 1) % points.length];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return { ...points[0] };
  };
  const begin = wrap(nearest.s + width / 2), remaining = perimeter - width, endTravel = begin + remaining;
  const path = [atDistance(begin)];
  // Keep vertices on the surviving arc, including the wrapped portion.
  for (let cycle = 0; cycle <= 1; cycle++) {
    for (let i = 0; i < points.length; i++) {
      const d = cumulative[i] + cycle * perimeter;
      if (d > begin + eps && d < endTravel - eps) path.push({ ...points[i] });
    }
  }
  path.push(atDistance(endTravel));
  const clean = path.filter((p, i) => i === 0 || distance(p, path[i - 1]) > eps);
  if (clean.length < 2) return { ok: false, reason: 'Не удалось построить открытую границу' };
  return {
    ok: true,
    operation: 'cutout-open-boundary',
    path: clean,
    metadata: { perimeter, removedLength: width, hitDistance: nearest.distance },
  };
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
