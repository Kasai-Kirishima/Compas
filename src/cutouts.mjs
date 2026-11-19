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
  direction = 'inside',
  eps = 1e-7,
  style = polygon?.style,
} = {}) {
  if (!(polygon instanceof Polygon)) throw new TypeError('Виріз по краю підтримує лише об’єкт Polygon');
  if (polygon.locked) return { ok: false, reason: 'Контур заблоковано' };
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= polygon.vertices.length) {
    throw new RangeError('Неправильний індекс ребра багатокутника');
  }
  positive(width, 'Ширина вирізу'); positive(depth, 'Глибина вирізу');
  if (!['inside', 'outside'].includes(direction)) throw new RangeError('Неподдерживаемое направление выреза');
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
  const normal = direction === 'outside' ? mul(inward, -1) : inward;
  const centerS = edgeLength / 2 + centerOffset;
  const s0 = centerS - width / 2, s1 = centerS + width / 2;
  if (s0 < minWeb - eps || s1 > edgeLength - minWeb + eps) {
    return { ok: false, reason: 'Виріз не поміщається на вибраному ребрі або порушує мінімальну перемичку' };
  }
  const p0 = add(a, mul(u, s0)), p1 = add(a, mul(u, s1));
  const q0 = add(p0, mul(normal, depth)), q1 = add(p1, mul(normal, depth));
  const q0Inside = pointInPolygon(q0, vertices, eps), q1Inside = pointInPolygon(q1, vertices, eps);
  if (direction === 'inside' ? (!q0Inside || !q1Inside) : (q0Inside || q1Inside)) {
    return { ok: false, reason: direction === 'inside'
      ? 'Заданная глубина выходит за пределы контура детали'
      : 'Внешний вырез пересекает контур повторно; уменьши глубину или выбери другое место' };
  }
  if (direction === 'outside') {
    for (let i = 1; i < 8; i++) {
      const sample = add(q0, mul(sub(q1, q0), i / 8));
      if (pointInPolygon(sample, vertices, eps)) return { ok: false, reason: 'Внешняя стенка выреза пересекает контур детали' };
    }
  }
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    result.push({ ...vertices[i] });
    if (i === edgeIndex) result.push(p0, q0, q1, p1);
  }
  if (!isSimplePolygon(result, eps)) return { ok: false, reason: 'Такий виріз створює самоперетин контуру' };
  const newArea = signedArea(result);
  const areaChangedCorrectly = direction === 'inside'
    ? Math.abs(newArea) < Math.abs(area) - eps
    : Math.abs(newArea) > Math.abs(area) + eps;
  if (!areaChangedCorrectly || Math.sign(newArea) !== Math.sign(area)) {
    return { ok: false, reason: direction === 'inside'
      ? 'Вырез не уменьшил площадь контура корректным способом'
      : 'Внешний вырез не увеличил область внутреннего контура корректным способом' };
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
    removed: { polygonId: polygon.id, edgeIndex, width, depth, centerOffset, direction },
    metadata: {
      oldArea: Math.abs(area), newArea: Math.abs(newArea), removedArea: direction === 'inside' ? Math.abs(area) - Math.abs(newArea) : Math.abs(newArea) - Math.abs(area), direction,
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
  direction = 'inside',
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
  if (!['inside', 'outside'].includes(direction)) throw new RangeError('Неподдерживаемое направление выреза');
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
  if (direction === 'inside' && depth >= radius - eps) {
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
  const notchRadius = direction === 'inside' ? radius - depth : radius + depth;
  const pointAt = (r, a) => ({
    x: circle.center.x + r * Math.cos(a),
    y: circle.center.y + r * Math.sin(a),
  });
  const p0 = pointAt(radius, a0);
  const q0 = pointAt(notchRadius, a0);
  const q1 = pointAt(notchRadius, a1);
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
  const areaChangedCorrectly = direction === 'inside' ? newArea < oldArea - eps : newArea > oldArea + eps;
  if (!areaChangedCorrectly) {
    return { ok: false, reason: direction === 'inside'
      ? 'Не удалось корректно уменьшить площадь окружности'
      : 'Не удалось корректно расширить внутренний контур окружности' };
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
    removed: { circleId: circle.id, width, depth, angle, halfAngle, direction },
    metadata: {
      oldArea, newArea, removedArea: direction === 'inside' ? oldArea - newArea : newArea - oldArea, remainingArcLength, direction,
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
  direction = 'inside',
  eps = 1e-7,
  style = polygon?.style,
} = {}) {
  if (!(polygon instanceof Polygon)) throw new TypeError('Нужен замкнутый многоугольный контур');
  if (polygon.locked) return { ok: false, reason: 'Контур заблоковано' };
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError('Точка вирізу має містити координати x та y');
  positive(width, 'Ширина вирізу'); positive(depth, 'Глубина выреза');
  if (!['inside', 'outside'].includes(direction)) throw new RangeError('Неподдерживаемое направление выреза');
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
  const directionSign = direction === 'outside' ? -1 : 1;
  const n0 = mul(inwardNormal(mouth0.edgeIndex), directionSign), n1 = mul(inwardNormal(mouth1.edgeIndex), directionSign);
  const q0 = add(p0, mul(n0, depth)), q1 = add(p1, mul(n1, depth));
  const q0Inside = pointInPolygon(q0, vertices, eps), q1Inside = pointInPolygon(q1, vertices, eps);
  if (direction === 'inside' ? (!q0Inside || !q1Inside) : (q0Inside || q1Inside)) {
    return { ok: false, reason: direction === 'inside'
      ? 'Заданная глубина выходит за пределы контура детали'
      : 'Внешний вырез пересекает контур повторно; уменьши глубину или выбери другое место' };
  }
  // A straight bottom across a strongly concave region could leave the part.
  for (let i = 1; i < 8; i++) {
    const t = i / 8, sample = add(q0, mul(sub(q1, q0), t));
    const inside = pointInPolygon(sample, vertices, eps);
    if (direction === 'inside' ? !inside : inside) return { ok: false, reason: direction === 'inside'
      ? 'Вырез пересекает вогнутую границу контура'
      : 'Внешний вырез пересекает контур детали' };
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
  const areaChangedCorrectly = direction === 'inside' ? newArea < absArea - eps : newArea > absArea + eps;
  if (!areaChangedCorrectly || Math.sign(signedArea(result)) !== Math.sign(area)) {
    return { ok: false, reason: direction === 'inside'
      ? 'Не удалось корректно уменьшить площадь контура'
      : 'Не удалось корректно увеличить площадь внутреннего контура' };
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
    removed: { edgeIndex: nearest.edgeIndex, width, depth, start, end, alongBoundary: true, direction },
    metadata: {
      oldArea: absArea, newArea, removedArea: direction === 'inside' ? absArea - newArea : newArea - absArea, perimeter, remainingBoundary: perimeter - width, direction,
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

/**
 * Subtract a finite-width straight pass from a closed 2D contour.
 *
 * The pass is a rectangle swept from `start` to `end`, centred on that axis.
 * `mode: 'walls'` retains the conventional side walls and blind end cap;
 * `mode: 'noBottom'` keeps the two exact parallel side walls but opens the blind
 * end; `mode: 'noWalls'` removes only the original boundary spans covered by
 * the strip and adds no new wall edges. Open results are returned in
 * `openFragments`, through-cut regions in `fragments`.
 *
 * This operation is suited to one straight pass through several separately
 * processed profiles (e.g. a large and a small circle). Curved source edges
 * remain sampled polylines; created side walls are exact segments parallel to
 * the requested pass axis.
 */
export function cutClosedContourByStraightPass(vertices, start, end, width, {
  eps = 1e-7,
  rejectStartInside = true,
  autoReverseIfStartInside = false,
  side = 'inside', // retained material side: contour interior or exterior (for a nested hole)
  mode = 'walls', // 'walls' | 'noBottom' | 'noWalls'
  preserveOpenEdges = [], // virtual closing edges for previously open pass-cut contours
} = {}) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    throw new TypeError('Для проходного выреза нужен замкнутый контур минимум из трёх точек');
  }
  vertices.forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError(`Вершина контура ${i + 1} должна содержать конечные координаты x и y`);
    }
  });
  for (const [name, p] of [['Начальная точка', start], ['Конечная точка', end]]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError(`${name} проходного выреза должна содержать координаты x и y`);
    }
  }
  positive(width, 'Ширина проходного выреза');
  if (!['inside', 'outside'].includes(side)) throw new RangeError('Неподдерживаемая сторона проходного выреза');
  if (!['walls', 'noBottom', 'noWalls'].includes(mode)) throw new RangeError('Неподдерживаемый режим прямого проходного выреза');
  if (!Number.isFinite(eps) || eps <= 0) throw new TypeError('Допуск геометрии должен быть положительным числом');

  const clean = vertices.filter((p, i) => i === 0 || distance(p, vertices[i - 1]) > eps).map(p => ({ x: p.x, y: p.y }));
  if (clean.length > 1 && distance(clean[0], clean.at(-1)) <= eps) clean.pop();
  if (clean.length < 3 || !isSimplePolygon(clean, eps)) return { ok: false, reason: 'Исходный контур не является простым замкнутым контуром' };

  const dx = end.x - start.x, dy = end.y - start.y, passLength = Math.hypot(dx, dy);
  if (passLength <= eps) return { ok: false, reason: 'Протяни инструмент от начальной точки к конечной — длина прохода слишком мала' };
  const ux = dx / passLength, uy = dy / passLength;
  const nx = -uy, ny = ux, half = width / 2;
  const area = signedArea(clean), orientationSign = Math.sign(area);
  if (Math.abs(area) <= eps) return { ok: false, reason: 'Площадь исходного контура слишком мала' };
  const startInside = pointInPolygon(start, clean, eps);
  const endInside = pointInPolygon(end, clean, eps);
  if (side === 'inside' && rejectStartInside && startInside) {
    // For an external material boundary, orient the operation from the
    // outside toward the inside. A drag started inside the profile is reversed
    // so the blind end remains at the user's starting point.
    if (autoReverseIfStartInside && !endInside) {
      const reversed = cutClosedContourByStraightPass(clean, end, start, width, {
        eps, rejectStartInside: true, autoReverseIfStartInside: false, side, mode, preserveOpenEdges,
      });
      if (!reversed.ok) return reversed;
      return {
        ...reversed,
        metadata: {
          ...reversed.metadata,
          requestedStart: { ...start }, requestedEnd: { ...end },
          directionReversed: true,
        },
      };
    }
    return { ok: false, reason: endInside
      ? 'Обе точки прохода находятся внутри контура. Начни или закончи жест за пределами детали.'
      : 'Начни проход снаружи контура, чтобы получить ровный входящий паз' };
  }
  if (side === 'outside' && !startInside) {
    // For an internal boundary (a hole/pocket contour), the retained material
    // is on the polygon exterior. Orient the drag from the empty hole toward
    // the surrounding material, reversing a gesture made in the other order.
    if (autoReverseIfStartInside && endInside && !startInside) {
      const reversed = cutClosedContourByStraightPass(clean, end, start, width, {
        eps, rejectStartInside: false, autoReverseIfStartInside: false, side, mode, preserveOpenEdges,
      });
      if (!reversed.ok) return reversed;
      return { ...reversed, metadata: { ...reversed.metadata, requestedStart: { ...start }, requestedEnd: { ...end }, directionReversed: true } };
    }
    return { ok: false, reason: 'Для выреза из отверстия начни жест внутри него и протяни наружу' };
  }

  const offset = (p, side) => ({ x: p.x + nx * half * side, y: p.y + ny * half * side });
  let cutter = [offset(start, 1), offset(end, 1), offset(end, -1), offset(start, -1)];
  if (Math.sign(signedArea(cutter)) !== orientationSign) cutter.reverse();

  const scale = Math.max(1, ...clean.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))),
    Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y), width);
  const tol = Math.max(eps, scale * 1e-10);
  const paramTol = Math.max(1e-10, tol / Math.max(passLength, width, 1));
  const pointAt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const segmentParameters = (a, b, c, d) => {
    const r = sub(b, a), s = sub(d, c), den = cross(r, s);
    const denTol = tol * Math.max(1, Math.hypot(r.x, r.y), Math.hypot(s.x, s.y));
    if (Math.abs(den) <= denTol) return null; // parallel or collinear; handled by midpoint classification
    const q = sub(c, a), t = cross(q, s) / den, u = cross(q, r) / den;
    if (t < -paramTol || t > 1 + paramTol || u < -paramTol || u > 1 + paramTol) return null;
    return { t: clamp(t, 0, 1), u: clamp(u, 0, 1) };
  };
  const dedupeParameters = values => values.sort((a, b) => a - b).filter((v, i, all) => i === 0 || Math.abs(v - all[i - 1]) > paramTol);
  const insideStrip = p => {
    const rx = p.x - start.x, ry = p.y - start.y;
    const along = rx * ux + ry * uy, across = rx * nx + ry * ny;
    return along > -tol && along < passLength + tol && Math.abs(across) < half - tol;
  };

  const boundaryPieces = [];
  // Keep source-boundary portions outside the swept rectangle.
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i], b = clean[(i + 1) % clean.length], ts = [0, 1];
    for (let j = 0; j < cutter.length; j++) {
      const hit = segmentParameters(a, b, cutter[j], cutter[(j + 1) % cutter.length]);
      if (hit) ts.push(hit.t);
    }
    const cuts = dedupeParameters(ts);
    for (let k = 0; k < cuts.length - 1; k++) {
      const t0 = cuts[k], t1 = cuts[k + 1];
      if (t1 - t0 <= paramTol) continue;
      const p0 = pointAt(a, b, t0), p1 = pointAt(a, b, t1), mid = pointAt(a, b, (t0 + t1) / 2);
      if (!insideStrip(mid) && distance(p0, p1) > tol) boundaryPieces.push({ a: p0, b: p1 });
    }
  }

  // Add the cutter's boundary where it lies inside the material. Reversing
  // its winding makes the retained material stay on the same side as the
  // original contour, yielding clean external contours rather than a hole.
  for (let i = 0; i < cutter.length; i++) {
    const a = cutter[i], b = cutter[(i + 1) % cutter.length], ts = [0, 1];
    for (let j = 0; j < clean.length; j++) {
      const hit = segmentParameters(a, b, clean[j], clean[(j + 1) % clean.length]);
      if (hit) ts.push(hit.t);
    }
    const cuts = dedupeParameters(ts);
    for (let k = 0; k < cuts.length - 1; k++) {
      const t0 = cuts[k], t1 = cuts[k + 1];
      if (t1 - t0 <= paramTol) continue;
      const p0 = pointAt(a, b, t0), p1 = pointAt(a, b, t1), mid = pointAt(a, b, (t0 + t1) / 2);
      const retainedSide = side === 'inside' ? pointInPolygon(mid, clean, tol) : !pointInPolygon(mid, clean, tol);
      if (retainedSide && distance(p0, p1) > tol) boundaryPieces.push(side === 'inside' ? { a: p1, b: p0 } : { a: p0, b: p1 });
    }
  }

  if (!boundaryPieces.length) return { ok: false, reason: 'Проход не пересекает выбранный контур' };
  const nodeKey = p => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`;
  const outgoing = new Map();
  boundaryPieces.forEach((edge, index) => {
    edge.index = index; edge.startKey = nodeKey(edge.a); edge.endKey = nodeKey(edge.b); edge.used = false;
    if (!outgoing.has(edge.startKey)) outgoing.set(edge.startKey, []);
    outgoing.get(edge.startKey).push(edge);
  });

  const loops = [];
  for (const first of boundaryPieces) {
    if (first.used) continue;
    const loop = [{ ...first.a }];
    let edge = first, closed = false, guard = 0;
    while (edge && !edge.used && guard++ <= boundaryPieces.length + 2) {
      edge.used = true;
      loop.push({ ...edge.b });
      if (edge.endKey === first.startKey) { closed = true; break; }
      const candidates = (outgoing.get(edge.endKey) || []).filter(candidate => !candidate.used);
      if (candidates.length === 1) edge = candidates[0];
      else if (candidates.length > 1) {
        // At a multi-way vertex, follow the tightest boundary turn while
        // preserving the selected winding (the conventional face walk).
        const incomingAngle = Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x);
        const turn = candidate => {
          const angle = Math.atan2(candidate.b.y - candidate.a.y, candidate.b.x - candidate.a.x);
          let delta = orientationSign > 0 ? (angle - incomingAngle + Math.PI * 2) % (Math.PI * 2)
            : (incomingAngle - angle + Math.PI * 2) % (Math.PI * 2);
          return delta;
        };
        candidates.sort((a, b) => turn(a) - turn(b)); edge = candidates[0];
      } else edge = null;
    }
    if (!closed) continue;
    loop.pop(); // duplicate closing point
    const compact = loop.filter((p, i) => i === 0 || distance(p, loop[i - 1]) > tol);
    if (compact.length >= 3 && Math.abs(signedArea(compact)) > tol * tol && isSimplePolygon(compact, tol * 4)) {
      loops.push(compact);
    }
  }

  if (!loops.length) return { ok: false, reason: 'Не удалось собрать замкнутые части после прохода. Проверь направление и ширину.' };
  const wrongWinding = loops.some(loop => Math.sign(signedArea(loop)) !== orientationSign);
  if (wrongWinding) return { ok: false, reason: side === 'inside'
    ? 'Проход образовал внутреннюю полость вместо открытого паза. Начни линию за пределами детали.'
    : 'Проход из отверстия образовал самопересечение. Проверь направление и глубину.' };
  const oldArea = Math.abs(area), newArea = loops.reduce((sum, loop) => sum + Math.abs(signedArea(loop)), 0);
  const removedArea = side === 'inside' ? oldArea - newArea : newArea - oldArea;
  if (!(removedArea > Math.max(tol * tol, oldArea * 1e-12))) {
    return { ok: false, reason: side === 'inside' ? 'Проход не удалил материал контура' : 'Проход не расширил внутреннюю область контура' };
  }

  // Convert the conventional closed Boolean result into the requested open
  // boundary style. The geometry is first fully stitched and area-checked;
  // then only the generated cutter edges are removed. This keeps the circle's
  // remaining sampled arc unchanged and leaves the two pass walls mathematically
  // collinear with the requested drag axis.
  const blindEnd = side === 'inside' ? pointInPolygon(end, clean, tol) : !pointInPolygon(end, clean, tol);
  const local = p => {
    const rx = p.x - start.x, ry = p.y - start.y;
    return { along: rx * ux + ry * uy, across: rx * nx + ry * ny };
  };
  const edgeIsSideWall = (a, b) => {
    const A = local(a), B = local(b), dx = B.along - A.along, dy = B.across - A.across;
    const len = Math.hypot(dx, dy);
    return len > tol && Math.abs(dy) <= tol * 8 &&
      Math.abs(Math.abs((A.across + B.across) / 2) - half) <= tol * 8 &&
      Math.abs(dx) >= len - tol * 8 &&
      Math.max(A.along, B.along) >= -tol * 8 && Math.min(A.along, B.along) <= passLength + tol * 8;
  };
  const edgeIsEndCap = (a, b) => {
    const A = local(a), B = local(b);
    return Math.abs(A.along - passLength) <= tol * 8 && Math.abs(B.along - passLength) <= tol * 8 &&
      Math.abs(Math.abs(A.across) - half) <= tol * 8 && Math.abs(Math.abs(B.across) - half) <= tol * 8;
  };
  const edgeIsStartCap = (a, b) => {
    const A = local(a), B = local(b);
    return Math.abs(A.along) <= tol * 8 && Math.abs(B.along) <= tol * 8 &&
      Math.abs(Math.abs(A.across) - half) <= tol * 8 && Math.abs(Math.abs(B.across) - half) <= tol * 8;
  };
  // A previous no-bottom/no-walls pass is stored as an open path. Rebuilding
  // the Boolean input requires a temporary closing segment between its two
  // endpoints, but that segment is NOT material and must never be written back
  // to the drawing. The new cutter may split this seam into several smaller
  // edges, so remove every resulting edge that lies on the same virtual line
  // segment, not just one exact endpoint-to-endpoint edge.
  const liesOnSegment = (point, segmentStart, segmentEnd) => {
    const v = sub(segmentEnd, segmentStart), w = sub(point, segmentStart);
    const length = Math.hypot(v.x, v.y);
    if (length <= tol) return distance(point, segmentStart) <= tol * 8;
    const crossDistance = Math.abs(cross(v, w)) / length;
    const projection = dot(w, v) / (length * length);
    return crossDistance <= tol * 8 && projection >= -paramTol * 8 && projection <= 1 + paramTol * 8;
  };
  const edgeIsPreviouslyOpen = (a, b) => preserveOpenEdges.some(segment => {
    const segmentStart = segment?.start || segment?.a;
    const segmentEnd = segment?.end || segment?.b;
    if (!segmentStart || !segmentEnd || distance(segmentStart, segmentEnd) <= tol) return false;
    return liesOnSegment(a, segmentStart, segmentEnd) && liesOnSegment(b, segmentStart, segmentEnd);
  });
  const openFragments = [], closedFragments = [];
  for (const loop of loops) {
    const n = loop.length;
    const removeEdge = Array.from({ length: n }, (_, i) => {
      const a = loop[i], b = loop[(i + 1) % n];
      // Previously open gaps remain open regardless of the mode selected for
      // this new pass. The mode controls only walls generated by the new cut.
      if (edgeIsPreviouslyOpen(a, b)) return true;
      if (mode === 'noWalls') return edgeIsSideWall(a, b) || edgeIsEndCap(a, b) || edgeIsStartCap(a, b);
      if (mode === 'noBottom') return blindEnd && edgeIsEndCap(a, b);
      return false;
    });
    if (!removeEdge.some(Boolean)) { closedFragments.push(loop); continue; }
    if (removeEdge.every(Boolean)) continue;
    const kept = removeEdge.map(value => !value), visited = new Set();
    for (let i = 0; i < n; i++) {
      const previous = (i - 1 + n) % n;
      if (!kept[i] || kept[previous]) continue;
      const path = [{ ...loop[i] }]; let edgeIndex = i, guard = 0;
      while (kept[edgeIndex] && !visited.has(edgeIndex) && guard++ <= n + 1) {
        visited.add(edgeIndex);
        path.push({ ...loop[(edgeIndex + 1) % n] });
        edgeIndex = (edgeIndex + 1) % n;
      }
      const compact = path.filter((point, j) => j === 0 || distance(point, path[j - 1]) > tol);
      if (compact.length >= 2) openFragments.push(compact);
    }
    // Defensive fallback for a directed cycle without a clean first open edge.
    for (let i = 0; i < n; i++) {
      if (!kept[i] || visited.has(i)) continue;
      const path = [{ ...loop[i] }]; let edgeIndex = i, guard = 0;
      while (kept[edgeIndex] && !visited.has(edgeIndex) && guard++ <= n + 1) {
        visited.add(edgeIndex); path.push({ ...loop[(edgeIndex + 1) % n] }); edgeIndex = (edgeIndex + 1) % n;
      }
      const compact = path.filter((point, j) => j === 0 || distance(point, path[j - 1]) > tol);
      if (compact.length >= 2) openFragments.push(compact);
    }
  }
  if (!closedFragments.length && !openFragments.length) {
    return { ok: false, reason: 'Режим выреза удалил всю границу контура; уменьши ширину или глубину прохода' };
  }
  return {
    ok: true,
    operation: 'straight-pass-cut',
    fragments: closedFragments,
    openFragments,
    metadata: {
      oldArea, newArea, removedArea, fragmentCount: closedFragments.length, openFragmentCount: openFragments.length, passLength,
      width, mode, side, start: { ...start }, end: { ...end },
      sideWalls: [
        { start: offset(start, 1), end: offset(end, 1) },
        { start: offset(start, -1), end: offset(end, -1) },
      ],
      blindEnd,
      bottomWallRemoved: mode === 'noBottom' && blindEnd,
      sideWallsRemoved: mode === 'noWalls',
      preservedOpenEdgeCount: preserveOpenEdges.length,
    },
  };
}

/**
 * Remove the part of an already-open editable path that lies inside a
 * finite-width straight pass. This is the complementary operation to
 * `cutClosedContourByStraightPass`: after a blind/no-bottom or no-walls cut,
 * the result is an open polyline, and later passes must be able to cut that
 * same geometry again. There is intentionally no per-object operation count.
 *
 * For a prior pass-cut contour, pass `reconstructContour: true`: the open
 * boundary is closed virtually for Boolean calculation, then the requested
 * wall mode is rebuilt and returned as editable closed/open fragments. For
 * ordinary user-drawn open lines, the legacy segment-clipping path remains in
 * use so no artificial walls are added to a line.
 */
export function cutOpenPathByStraightPass(points, start, end, width, {
  eps = 1e-7,
  mode = 'noBottom',
  side = 'inside',
  reconstructContour = false,
} = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new TypeError('Для повторного проходного выреза нужен открытый путь минимум из двух точек');
  }
  points.forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError(`Точка открытого пути ${i + 1} должна содержать конечные координаты x и y`);
    }
  });
  for (const [name, p] of [['Начальная точка', start], ['Конечная точка', end]]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError(`${name} повторного прохода должна содержать конечные координаты x и y`);
    }
  }
  positive(width, 'Ширина повторного проходного выреза');
  if (!Number.isFinite(eps) || eps <= 0) throw new TypeError('Допуск геометрии должен быть положительным числом');
  if (!['walls', 'noBottom', 'noWalls'].includes(mode)) throw new RangeError('Неподдерживаемый режим повторного проходного выреза');
  if (!['inside', 'outside'].includes(side)) throw new RangeError('Неподдерживаемая сторона повторного проходного выреза');

  // A no-bottom/no-walls pass is stored by the editor as an open boundary
  // path. Merely clipping that path (the legacy behaviour below) creates a
  // gap, but cannot create the new side walls. For pass-cut fragments, close
  // the path virtually for the Boolean calculation, subtract the new strip,
  // and let the closed-contour routine rebuild the selected wall style.
  // The closing edge is computational only; the selected mode decides whether
  // a cap or side walls are actually kept in the returned geometry.
  if (reconstructContour) {
    const contour = points.filter((p, i) => i === 0 || distance(p, points[i - 1]) > eps)
      .map(p => ({ x: p.x, y: p.y }));
    if (contour.length > 1 && distance(contour[0], contour.at(-1)) <= eps) contour.pop();
    if (contour.length < 3 || !isSimplePolygon(contour, eps)) {
      return { ok: false, reason: 'Не удалось восстановить замкнутую область предыдущего выреза — проверь контур перед повторным проходом' };
    }
    // The direct segment from the last point back to the first is a virtual
    // bridge used only to recover a temporary polygon for Boolean subtraction.
    // Keep its exact location so the closed helper can omit it again afterward;
    // without this, the previous blind end cap is silently restored on every
    // subsequent pass, even though the new cut itself is open at its end.
    const previousOpenGap = { start: { ...contour.at(-1) }, end: { ...contour[0] } };
    const rebuilt = cutClosedContourByStraightPass(contour, start, end, width, {
      eps,
      rejectStartInside: true,
      autoReverseIfStartInside: true,
      side,
      mode,
      preserveOpenEdges: [previousOpenGap],
    });
    if (!rebuilt.ok) return rebuilt;
    const removedLength = rebuilt.metadata?.removedArea > 0
      ? rebuilt.metadata.removedArea / width
      : 0;
    return {
      ...rebuilt,
      operation: 'repeatable-straight-pass-cut-open-contour',
      sourceWasOpen: true,
      metadata: {
        ...rebuilt.metadata,
        removedLength,
        reconstructedFromOpenBoundary: true,
        previousOpenGapPreserved: true,
        wallsRebuilt: mode !== 'noWalls',
      },
    };
  }

  const dx = end.x - start.x, dy = end.y - start.y;
  const passLength = Math.hypot(dx, dy);
  if (passLength <= eps) return { ok: false, reason: 'Длина повторного прохода слишком мала' };
  const ux = dx / passLength, uy = dy / passLength;
  const nx = -uy, ny = ux, half = width / 2;
  const local = p => {
    const rx = p.x - start.x, ry = p.y - start.y;
    return { along: rx * ux + ry * uy, across: rx * nx + ry * ny };
  };
  const pointAt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const scale = Math.max(1, passLength, width,
    ...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))),
    Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y));
  const tol = Math.max(eps, scale * 1e-10);
  const paramTol = Math.max(1e-10, tol / Math.max(passLength, width, 1));

  // Liang–Barsky/slab clipping in the pass-local coordinate system.
  const clipSegment = (a, b) => {
    const A = local(a), B = local(b);
    const dAlong = B.along - A.along, dAcross = B.across - A.across;
    let enter = 0, leave = 1;
    const clipAxis = (origin, delta, min, max) => {
      if (Math.abs(delta) <= paramTol) return origin >= min - tol && origin <= max + tol;
      let t0 = (min - origin) / delta, t1 = (max - origin) / delta;
      if (t0 > t1) [t0, t1] = [t1, t0];
      enter = Math.max(enter, t0);
      leave = Math.min(leave, t1);
      return enter <= leave + paramTol;
    };
    if (!clipAxis(A.along, dAlong, 0, passLength) ||
        !clipAxis(A.across, dAcross, -half, half) ||
        leave < -paramTol || enter > 1 + paramTol) return null;
    enter = clamp(enter, 0, 1);
    leave = clamp(leave, 0, 1);
    if (leave - enter <= paramTol) return null; // tangency does not create a cut
    return { enter, leave };
  };

  const fragments = [];
  let current = [];
  let removedLength = 0;
  let cutSegments = 0;
  const flush = () => {
    const compact = current.filter((p, i) => i === 0 || distance(p, current[i - 1]) > tol);
    if (compact.length >= 2 && compact.some((p, i) => i > 0 && distance(p, compact[i - 1]) > tol)) {
      fragments.push(compact);
    }
    current = [];
  };
  const appendInterval = (a, b) => {
    if (distance(a, b) <= tol) return;
    if (!current.length) current.push({ ...a });
    else if (distance(current.at(-1), a) > tol) {
      flush();
      current.push({ ...a });
    }
    if (distance(current.at(-1), b) > tol) current.push({ ...b });
  };

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], segmentLength = distance(a, b);
    if (segmentLength <= tol) continue;
    const hit = clipSegment(a, b);
    if (!hit) {
      appendInterval(a, b);
      continue;
    }
    const { enter, leave } = hit;
    const removed = (leave - enter) * segmentLength;
    if (removed <= tol) {
      appendInterval(a, b);
      continue;
    }
    removedLength += removed;
    cutSegments++;
    if (enter > paramTol) appendInterval(a, pointAt(a, b, enter));
    else flush();
    // The strip separates the retained portion before it from the portion
    // after it, even when the removed region spans several source segments.
    flush();
    if (leave < 1 - paramTol) appendInterval(pointAt(a, b, leave), b);
    else flush();
  }
  flush();

  if (removedLength <= tol || !cutSegments) {
    return { ok: false, reason: 'Прямая полоса не пересекает оставшиеся участки контура' };
  }
  if (!fragments.length) {
    return { ok: false, reason: 'Проход удалил весь открытый контур; оставшейся геометрии нет' };
  }
  return {
    ok: true,
    operation: 'repeatable-straight-pass-cut-open-path',
    fragments,
    metadata: {
      passLength, width, removedLength, cutSegments, fragmentCount: fragments.length,
      start: { ...start }, end: { ...end },
      sideWalls: [
        { start: { x: start.x + nx * half, y: start.y + ny * half }, end: { x: end.x + nx * half, y: end.y + ny * half } },
        { start: { x: start.x - nx * half, y: start.y - ny * half }, end: { x: end.x - nx * half, y: end.y - ny * half } },
      ],
    },
  };
}

/**
 * Connect an existing inner void (hole/pocket) to the exterior of its parent
 * profile with one straight pass. The outer wall and the hole wall are edited
 * together so the new slot really opens into the hole instead of creating a
 * second, detached contour around the hole.
 *
 * `start` must be inside the hole and `end` must pass outside the parent. The
 * parent is cut from `end` back to `start`; the closing cap at the hole side is
 * omitted and the matching arc portion is removed from the hole boundary.
 */
export function cutInnerVoidToExteriorStraightPass(outerContour, holeContour, start, end, width, {
  eps = 1e-7,
  mode = 'walls',
} = {}) {
  if (!Array.isArray(outerContour) || outerContour.length < 3 || !Array.isArray(holeContour) || holeContour.length < 3) {
    throw new TypeError('Для выреза из отверстия нужны внешний контур и внутренний замкнутый контур');
  }
  for (const [name, point] of [['Начальная точка', start], ['Конечная точка', end]]) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError(`${name} выреза из отверстия должна содержать конечные координаты x и y`);
    }
  }
  positive(width, 'Ширина выреза из отверстия');
  if (!['walls', 'noBottom', 'noWalls'].includes(mode)) throw new RangeError('Неподдерживаемый режим выреза из отверстия');
  if (!pointInPolygon(start, holeContour, eps)) {
    return { ok: false, reason: 'Начни вырез внутри отверстия или кармана' };
  }
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length <= eps) return { ok: false, reason: 'Длина прохода слишком мала' };
  const ux = dx / length, uy = dy / length;
  // A user often releases the pointer exactly on the outer edge (especially
  // with OSNAP enabled). Treat a near-boundary endpoint as a valid exit and
  // extend it a tiny amount along the same drag axis so the Boolean pass is
  // unambiguously outside. Endpoints well inside the solid are still rejected.
  const pointSegmentDistance = (p, a, b) => {
    const ab = sub(b, a), den = dot(ab, ab);
    const t = den > eps * eps ? clamp(dot(sub(p, a), ab) / den, 0, 1) : 0;
    return distance(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
  };
  const boundaryDistance = Math.min(...outerContour.map((a, i) => pointSegmentDistance(end, a, outerContour[(i + 1) % outerContour.length])));
  const endpointTolerance = Math.max(eps * 100, 0.01);
  const boundaryNudge = Math.max(eps * 1000, Math.min(width * 0.05, 0.25));
  const effectiveEnd = pointInPolygon(end, outerContour, eps)
    ? boundaryDistance <= endpointTolerance
      ? { x: end.x + ux * boundaryNudge, y: end.y + uy * boundaryNudge }
      : null
    : { x: end.x, y: end.y };
  if (!effectiveEnd) {
    return { ok: false, reason: 'Для соединения отверстия с внешним краем протяни проход через стенку до внешней границы детали' };
  }
  const effectiveDx = effectiveEnd.x - start.x, effectiveDy = effectiveEnd.y - start.y;
  const effectiveLength = Math.hypot(effectiveDx, effectiveDy);
  const intersections = [];
  for (let i = 0; i < holeContour.length; i++) {
    const a = holeContour[i], b = holeContour[(i + 1) % holeContour.length];
    const edge = sub(b, a), fromStart = sub(a, start), den = cross({ x: effectiveDx, y: effectiveDy }, edge);
    const scale = Math.max(1, effectiveLength, distance(a, b));
    if (Math.abs(den) <= eps * scale) continue;
    const t = cross(fromStart, edge) / den;
    const u = cross(fromStart, { x: effectiveDx, y: effectiveDy }) / den;
    if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) intersections.push(clamp(t, 0, 1));
  }
  intersections.sort((a, b) => a - b);
  const unique = intersections.filter((t, i) => i === 0 || Math.abs(t - intersections[i - 1]) > eps * 10);
  let holeExit = null;
  for (const t of unique) {
    if (t <= eps) continue;
    const afterT = Math.min(1, t + Math.max(1e-7, eps * 20 / effectiveLength));
    const after = { x: start.x + effectiveDx * afterT, y: start.y + effectiveDy * afterT };
    if (!pointInPolygon(after, holeContour, eps * 0.1)) {
      holeExit = { x: start.x + effectiveDx * t, y: start.y + effectiveDy * t };
      break;
    }
  }
  if (!holeExit) return { ok: false, reason: 'Не найден выход траектории через границу отверстия. Продли линию от его внутренней части наружу.' };

  // The strip is carried from the exterior endpoint through the hole's front
  // boundary to the actual start point inside the void. Its two side walls are
  // then trimmed back to where they intersect the remaining hole arc.
  const parentMode = mode === 'noWalls' ? 'noWalls' : 'noBottom';
  const outer = cutClosedContourByStraightPass(outerContour, effectiveEnd, start, width, {
    eps, rejectStartInside: true, autoReverseIfStartInside: false, side: 'inside', mode: parentMode,
  });
  if (!outer.ok) return { ok: false, reason: `Не удалось открыть внешний контур: ${outer.reason}`, outer };
  if (!outer.openFragments?.length) {
    return { ok: false, reason: 'Внешний контур не создал открытые боковые стенки для соединения с отверстием', outer };
  }

  const closedHolePath = [...holeContour.map(p => ({ x: p.x, y: p.y })), { x: holeContour[0].x, y: holeContour[0].y }];
  const hole = cutOpenPathByStraightPass(closedHolePath, effectiveEnd, start, width, { eps, mode: 'noWalls' });
  if (!hole.ok || !hole.fragments?.length) {
    return { ok: false, reason: `Не удалось разомкнуть внутренний контур: ${hole.reason || 'нет оставшейся дуги'}`, outer, hole };
  }

  // The input loop is passed as an open path with its first point repeated at
  // the end. If the removed arc does not cross that seam, clipping returns two
  // fragments which are actually one continuous remaining arc. Join fragments
  // whose endpoints meet at the original loop seam before aligning the walls.
  const holeFragments = hole.fragments.map(path => path.map(p => ({ x: p.x, y: p.y })));
  let merged = true;
  while (merged && holeFragments.length > 1) {
    merged = false;
    outerMerge: for (let i = 0; i < holeFragments.length; i++) for (let j = i + 1; j < holeFragments.length; j++) {
      const a = holeFragments[i], b = holeFragments[j];
      if (distance(a.at(-1), b[0]) <= eps * 20) {
        holeFragments[i] = [...a, ...b.slice(1)];
      } else if (distance(b.at(-1), a[0]) <= eps * 20) {
        holeFragments[i] = [...b, ...a.slice(1)];
      } else if (distance(a[0], b[0]) <= eps * 20) {
        holeFragments[i] = [...a.slice().reverse(), ...b.slice(1)];
      } else if (distance(a.at(-1), b.at(-1)) <= eps * 20) {
        holeFragments[i] = [...a, ...b.slice().reverse().slice(1)];
      } else continue;
      holeFragments.splice(j, 1); merged = true; break outerMerge;
    }
  }
  // A single straight pass through a simple hole should leave exactly one arc.
  if (outer.openFragments.length !== 1 || holeFragments.length !== 1) {
    return { ok: false, reason: 'Отверстие или внешний контур разделяется неоднозначно. Выбери один замкнутый контур без пересечений.', outer, hole };
  }
  const outerPath = outer.openFragments[0].map(p => ({ x: p.x, y: p.y }));
  const holePath = holeFragments[0];
  if (outerPath.length < 2 || holePath.length < 2) {
    return { ok: false, reason: 'Не удалось сформировать соединённые стенки выреза', outer, hole };
  }
  const outerEnds = [outerPath[0], outerPath.at(-1)], holeEnds = [holePath[0], holePath.at(-1)];
  const directCost = distance(outerEnds[0], holeEnds[0]) + distance(outerEnds[1], holeEnds[1]);
  const reverseCost = distance(outerEnds[0], holeEnds[1]) + distance(outerEnds[1], holeEnds[0]);
  if (directCost <= reverseCost) {
    outerPath[0] = { ...holeEnds[0] };
    outerPath[outerPath.length - 1] = { ...holeEnds[1] };
  } else {
    outerPath[0] = { ...holeEnds[1] };
    outerPath[outerPath.length - 1] = { ...holeEnds[0] };
  }
  const endpointExtension = Math.max(directCost, reverseCost) / 2;
  // The outer wall endpoints are intentionally extended from the drag start
  // to the first intersection of each side wall with the hole contour. A
  // long extension is normal when the gesture begins near the hole centre.
  // Both resulting contours share the exact same endpoint coordinates.
  const joinedEndpointDistance = Math.max(
    distance(outerPath[0], directCost <= reverseCost ? holeEnds[0] : holeEnds[1]),
    distance(outerPath.at(-1), directCost <= reverseCost ? holeEnds[1] : holeEnds[0])
  );
  if (joinedEndpointDistance > eps * 100) {
    return { ok: false, reason: 'Не удалось состыковать боковые стенки с внутренней дугой. Проверь ширину прохода и контур.', outer, hole };
  }

  return {
    ok: true,
    operation: 'inside-void-to-exterior-straight-pass',
    outer: { ...outer, openFragments: [outerPath] },
    hole: { ...hole, fragments: [holePath] },
    metadata: {
      mode, parentMode, width, start: { ...start }, end: { ...effectiveEnd }, requestedEnd: { ...end }, holeExit,
      matchedEndpoints: [ { ...outerPath[0] }, { ...outerPath.at(-1) } ],
      boundaryNudge, endpointExtension,
      outerAreaRemoved: outer.metadata?.removedArea || 0,
      holeBoundaryRemoved: hole.metadata?.removedLength || 0,
      wallsConnectedToHole: true,
    },
  };
}
