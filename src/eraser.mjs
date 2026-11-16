/**
 * Partial/freehand eraser for CAD Geometry Core.
 * Eraser input is a polyline in world coordinates and a world-unit brush radius.
 * Line clipping is analytical against a union of capsules. Circle/arc clipping
 * partitions angular parameter space at exact capsule-boundary intersections,
 * then classifies each interval by its midpoint.
 */
import {
  EPS, TAU, Line, Centerline, Circle, Arc, Polygon,
  LinearDimension, DiameterDimension, distance, sub, add, mul, dot,
  clamp, normAngle, intersectCircleCircle, applyEditTransaction
} from './cad-geometry-trim.mjs';

const finitePoint = (p, name = 'Точка') => {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new TypeError(`${name} должна содержать конечные координаты x и y`);
  }
};
const distPointSegment = (p, a, b) => {
  const d = sub(b, a), den = dot(d, d);
  if (den <= EPS * EPS) return distance(p, a);
  const t = clamp(dot(sub(p, a), d) / den, 0, 1);
  return distance(p, add(a, mul(d, t)));
};
const normalizePath = path => {
  if (!Array.isArray(path) || path.length === 0) throw new RangeError('Путь ластика должен содержать минимум одну точку');
  path.forEach((p, i) => finitePoint(p, `Точка пути ${i + 1}`));
  const out = [];
  for (const p of path) if (!out.length || distance(out[out.length - 1], p) > EPS) out.push({ x: p.x, y: p.y });
  return out;
};
const pathSegments = path => path.length === 1 ? [[path[0], path[0]]] : path.slice(1).map((p, i) => [path[i], p]);
const distanceToPath = (p, segments) => segments.reduce((best, [a, b]) => Math.min(best, distPointSegment(p, a, b)), Infinity);

/** Ramer-Douglas-Peucker simplification for dense pointer-move input. */
export function simplifyEraserPath(path, tolerance = 0.1) {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError('Допуск упрощения должен быть неотрицательным числом');
  const points = normalizePath(path);
  if (points.length <= 2 || tolerance === 0) return points;
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]], tol2 = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let best = tol2, index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distPointSegment(points[i], points[first], points[last]);
      if (d * d > best) { best = d * d; index = i; }
    }
    if (index >= 0) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, i) => keep[i]);
}
function pathBounds(path) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const p of path) { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
  return { minX,minY,maxX,maxY };
}
function objectBounds(object) {
  if (object instanceof Line) return { minX:Math.min(object.a.x,object.b.x), minY:Math.min(object.a.y,object.b.y), maxX:Math.max(object.a.x,object.b.x), maxY:Math.max(object.a.y,object.b.y) };
  if (object instanceof Circle || object instanceof Arc) return { minX:object.center.x-object.radius, minY:object.center.y-object.radius, maxX:object.center.x+object.radius, maxY:object.center.y+object.radius };
  if (object instanceof Polygon) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const p of object.vertices) { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
    return { minX,minY,maxX,maxY };
  }
  const segs = objectLineSegments(object);
  if (!segs.length) return null;
  const pts = segs.flat();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const p of pts) { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
  for (const box of objectTextBoxes(object)) {
    minX=Math.min(minX,box.center.x-box.halfWidth); maxX=Math.max(maxX,box.center.x+box.halfWidth);
    minY=Math.min(minY,box.center.y-box.halfHeight); maxY=Math.max(maxY,box.center.y+box.halfHeight);
  }
  return { minX,minY,maxX,maxY };
}
function boundsOverlap(a,b,pad=0) {
  return a.maxX+pad>=b.minX && a.minX-pad<=b.maxX && a.maxY+pad>=b.minY && a.minY-pad<=b.maxY;
}

function solveDiskInterval(p0, direction, center, radius) {
  const m = sub(p0, center), a = dot(direction, direction);
  const b = 2 * dot(m, direction), c = dot(m, m) - radius * radius;
  if (a <= EPS * EPS) return c <= 0 ? [0, 1] : null;
  let disc = b * b - 4 * a * c;
  const tol = Number.EPSILON * (Math.abs(b * b) + Math.abs(4 * a * c) + 1) * 96;
  if (disc < -tol) return null;
  disc = Math.max(0, disc);
  const root = Math.sqrt(disc);
  // Stable quadratic formula: avoids cancellation when the brush is far from
  // the line origin or one of the roots is much smaller than the other.
  const q = -0.5 * (b + (b >= 0 ? root : -root));
  let t0, t1;
  if (Math.abs(q) <= Number.EPSILON * Math.max(1, Math.abs(b), root)) {
    t0 = t1 = -b / (2 * a);
  } else {
    t0 = q / a; t1 = c / q;
    if (t0 > t1) [t0, t1] = [t1, t0];
  }
  const lo = Math.max(0, t0), hi = Math.min(1, t1);
  return hi >= lo ? [lo, hi] : null;
}

function clipLinearRange(interval, coefficient, constant, eps = 1e-12) {
  // Keep values t for which coefficient*t + constant >= -eps.
  let [lo, hi] = interval;
  if (Math.abs(coefficient) <= eps) return constant >= -eps ? interval : null;
  const bound = (-eps - constant) / coefficient;
  if (coefficient > 0) lo = Math.max(lo, bound);
  else hi = Math.min(hi, bound);
  return hi >= lo ? [lo, hi] : null;
}

/** Exact parameter interval where a finite line is inside a circular brush dab. */
function lineDiskInterval(line, center, radius) {
  return solveDiskInterval(line.a, sub(line.b, line.a), center, radius);
}

/** Exact parameter interval where points on line are inside a stroke-segment capsule. */
function lineCapsuleInterval(line, a, b, radius) {
  const d = sub(line.b, line.a), v = sub(b, a), v2 = dot(v, v);
  if (v2 <= EPS * EPS) return lineDiskInterval(line, a, radius);
  const len = Math.sqrt(v2), u = mul(v, 1 / len), n = { x: -u.y, y: u.x };
  const rel = sub(line.a, a);
  const proj0 = dot(rel, u), projD = dot(d, u);
  const side0 = dot(rel, n), sideD = dot(d, n);
  let strip = [0, 1];
  strip = clipLinearRange(strip, projD, proj0);
  if (strip) strip = clipLinearRange(strip, -projD, len - proj0);
  if (strip) strip = clipLinearRange(strip, -sideD, radius - side0);
  if (strip) strip = clipLinearRange(strip, sideD, radius + side0);
  // End caps are independent of the strip projection. Do not return early
  // when a line misses the rectangle: it may still hit either round cap.
  const endpointA = lineDiskInterval(line, a, radius);
  const endpointB = lineDiskInterval(line, b, radius);
  const all = [strip, endpointA, endpointB].filter(Boolean);
  return all.length ? all : null;
}

function mergeIntervals(intervals, eps = 1e-9) {
  const sorted = intervals.filter(Boolean).map(([a, b]) => [clamp(Math.min(a, b), 0, 1), clamp(Math.max(a, b), 0, 1)])
    .filter(([a, b]) => b - a > eps) // A pure tangency has zero erased length.
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur[0] <= last[1] + eps) last[1] = Math.max(last[1], cur[1]);
    else out.push([...cur]);
  }
  return out;
}
function subtractIntervals(erased, eps = 1e-9) {
  const kept = []; let cursor = 0;
  for (const [a, b] of erased) {
    if (a > cursor + eps) kept.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < 1 - eps) kept.push([cursor, 1]);
  return kept;
}

function lineEraseIntervals(line, segments, radius) {
  const intervals = [];
  for (const [a, b] of segments) {
    if (distance(a, b) <= EPS) {
      const hit = lineDiskInterval(line, a, radius);
      if (hit) intervals.push(hit);
    } else {
      const hit = lineCapsuleInterval(line, a, b, radius);
      if (hit) intervals.push(...hit);
    }
  }
  return mergeIntervals(intervals);
}

function circleBoundaryAngles(target, a, b, brushRadius, eps) {
  const angles = [];
  const addPoint = p => angles.push(normAngle(Math.atan2(p.y - target.center.y, p.x - target.center.x)));
  // Round caps of the swept brush.
  for (const endpoint of [a, b]) {
    const cap = new Circle(endpoint, brushRadius);
    for (const hit of intersectCircleCircle(target, cap, eps)) addPoint(hit.point);
  }
  const v = sub(b, a), len = distance(a, b);
  if (len > EPS) {
    const u = mul(v, 1 / len), n = { x: -u.y, y: u.x };
    // The two straight sides of the capsule. Extra intersections outside the
    // finite projection are harmless: midpoint classification discards them.
    for (const sign of [-1, 1]) {
      const q = add(a, mul(n, sign * brushRadius));
      const m = sub(q, target.center), vv = dot(v, v);
      const tCenter = -dot(m, v) / vv;
      const closest = add(q, mul(v, tCenter));
      const h2 = target.radius * target.radius - dot(sub(closest, target.center), sub(closest, target.center));
      const tol = Number.EPSILON * (target.radius * target.radius + 1) * 128;
      if (h2 < -tol) continue;
      const dt = Math.sqrt(Math.max(0, h2) / vv);
      for (const t of dt <= EPS ? [tCenter] : [tCenter - dt, tCenter + dt]) addPoint(add(q, mul(v, t)));
    }
  }
  return angles;
}

function circleEraseIntervals(circle, segments, radius, eps) {
  const angles = [0, TAU];
  for (const [a, b] of segments) angles.push(...circleBoundaryAngles(circle, a, b, radius, eps));
  const angleTol = Math.max(1e-12, eps / Math.max(circle.radius, 1));
  const raw = angles.map(normAngle).sort((a, b) => a - b);
  const sorted = [];
  for (const angle of raw) {
    if (!sorted.length || angle - sorted[sorted.length - 1] > angleTol) sorted.push(angle);
  }
  if (!sorted.length || sorted[0] > angleTol) sorted.unshift(0);
  else sorted[0] = 0;
  if (TAU - sorted[sorted.length - 1] > angleTol) sorted.push(TAU);
  else sorted[sorted.length - 1] = TAU;
  const erased = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (b - a <= 1e-10) continue;
    const mid = (a + b) / 2;
    const p = circle.pointAtAngle(mid);
    if (distanceToPath(p, segments) <= radius + eps) erased.push([a / TAU, b / TAU]);
  }
  return mergeIntervals(erased);
}

function arcEraseIntervals(arc, segments, radius, eps) {
  const fullCircle = new Circle(arc.center, arc.radius);
  const params = [0, 1];
  for (const [a, b] of segments) {
    for (const angle of circleBoundaryAngles(fullCircle, a, b, radius, eps)) {
      const t = arc.parameterForAngle(angle, 1e-8);
      if (t !== null) params.push(t);
    }
  }
  const sorted = [...new Set(params.map(t => Number(clamp(t, 0, 1).toFixed(12))))].sort((a, b) => a - b);
  const erased = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (b - a <= 1e-10) continue;
    if (distanceToPath(arc.pointAt((a + b) / 2), segments) <= radius + eps) erased.push([a, b]);
  }
  return mergeIntervals(erased);
}

function makeLineFragment(source, t0, t1) {
  if (t1 - t0 <= 1e-9) return null;
  const opts = { style: source.style, visible: source.visible, ownerId: source.ownerId ?? source.id };
  return source instanceof Centerline
    ? new Centerline(source.pointAt(t0), source.pointAt(t1), opts)
    : new Line(source.pointAt(t0), source.pointAt(t1), opts);
}
function makeArcFragment(source, t0, t1) {
  if (t1 - t0 <= 1e-9) return null;
  const part = new Arc(source.center, source.radius, source.startAngle + source.sweep * t0, source.sweep * (t1 - t0), {
    style: source.style, visible: source.visible, ownerId: source.ownerId ?? source.id
  });
  part.ownerId = source.ownerId ?? source.id;
  return part;
}
function objectLineSegments(object) {
  if (object instanceof LinearDimension) {
    const g = object.geometry();
    return [[object.p1, g.q1], [object.p2, g.q2], [g.q1, g.q2]];
  }
  if (object instanceof DiameterDimension) {
    const g = object.geometry(); return [[g.p1, g.p2]];
  }
  return [];
}
function objectTextBoxes(object) {
  if (!object.showValue) return [];
  if (object instanceof LinearDimension) {
    const g = object.geometry(), center = add(g.middle, mul(g.normal, object.textOffset));
    const label = object.text ?? object.value.toFixed(2);
    return [{ center, halfWidth: Math.max(object.textHeight * 1.4, label.length * object.textHeight * 0.68) / 2, halfHeight: object.textHeight * 0.72 }];
  }
  if (object instanceof DiameterDimension) {
    const g = object.geometry(), center = mul(add(g.p1, g.p2), 0.5);
    const label = object.text ?? `Ø${object.value.toFixed(2)}`;
    return [{ center, halfWidth: Math.max(object.textHeight * 1.4, label.length * object.textHeight * 0.68) / 2, halfHeight: object.textHeight * 0.72 }];
  }
  return [];
}
function pointInBox(p, box, pad = 0) {
  return Math.abs(p.x - box.center.x) <= box.halfWidth + pad && Math.abs(p.y - box.center.y) <= box.halfHeight + pad;
}
function annotationHit(object, segments, radius) {
  if (objectLineSegments(object).some(([a, b]) => segments.some(([c, d]) => segmentDistance(a, b, c, d) <= radius))) return true;
  return objectTextBoxes(object).some(box => segments.some(([a, b]) =>
    pointInBox(a, box, radius) || pointInBox(b, box, radius) ||
    rectEdges(box.center, box.halfWidth, box.halfHeight).some(([c, d]) => segmentDistance(a, b, c, d) <= radius)
  ));
}
function rectEdges(center, halfWidth, halfHeight) {
  const a = { x: center.x - halfWidth, y: center.y - halfHeight };
  const b = { x: center.x + halfWidth, y: center.y - halfHeight };
  const c = { x: center.x + halfWidth, y: center.y + halfHeight };
  const d = { x: center.x - halfWidth, y: center.y + halfHeight };
  return [[a,b],[b,c],[c,d],[d,a]];
}
function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(distPointSegment(a, c, d), distPointSegment(b, c, d), distPointSegment(c, a, b), distPointSegment(d, a, b));
}
function segmentsIntersect(a, b, c, d) {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p, q, r, tol) =>
    q.x >= Math.min(p.x, r.x) - tol && q.x <= Math.max(p.x, r.x) + tol &&
    q.y >= Math.min(p.y, r.y) - tol && q.y <= Math.max(p.y, r.y) + tol;
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  const scale = Math.max(1, distance(a, b), distance(c, d));
  const orientTol = Number.EPSILON * scale * scale * 128;
  const coordTol = Number.EPSILON * scale * 128;
  if (((o1 > orientTol && o2 < -orientTol) || (o1 < -orientTol && o2 > orientTol)) &&
      ((o3 > orientTol && o4 < -orientTol) || (o3 < -orientTol && o4 > orientTol))) return true;
  return (Math.abs(o1) <= orientTol && onSegment(a, c, b, coordTol)) ||
    (Math.abs(o2) <= orientTol && onSegment(a, d, b, coordTol)) ||
    (Math.abs(o3) <= orientTol && onSegment(c, a, d, coordTol)) ||
    (Math.abs(o4) <= orientTol && onSegment(c, b, d, coordTol));
}

/**
 * Erase a freehand stroke from geometric objects without deleting untouched
 * portions. Returns a transaction compatible with applyEditTransaction().
 *
 * Options:
 * - eps: geometric tolerance (world units)
 * - minFragmentLength: suppress tiny line remnants
 * - minArcSweep: suppress tiny arc remnants (radians)
 * - eraseAnnotations: remove a dimension annotation as a whole if its drawn
 *   dimension/extension line is hit (dimensions cannot be sensibly split)
 * - filter(object): custom eligibility predicate
 */
export function eraseAlongPath(objects, path, radius, {
  eps = 1e-7,
  minFragmentLength = Math.max(eps * 4, 1e-7),
  minArcSweep = 1e-5,
  simplifyTolerance = 0,
  eraseAnnotations = true,
  filter = object => object.visible !== false && object.locked !== true
} = {}) {
  if (!Array.isArray(objects)) throw new TypeError('Сцена должна быть массивом объектов');
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('Радиус ластика должен быть положительным числом');
  const points = simplifyEraserPath(path, simplifyTolerance), segments = pathSegments(points);
  const strokeBounds = pathBounds(points);
  const remove = [], addObjects = [], removedSegments = [], skippedLocked = [];

  const eraseSimpleLine = line => {
    const erased = lineEraseIntervals(line, segments, radius);
    if (!erased.length) return null;
    const kept = subtractIntervals(erased);
    const fragments = kept.map(([a, b]) => makeLineFragment(line, a, b))
      .filter(Boolean)
      .filter(part => distance(part.a, part.b) >= minFragmentLength);
    return { erased, fragments };
  };

  for (const object of objects) {
    if (!object || object.visible === false) continue;
    const bounds = objectBounds(object);
    if (bounds && !boundsOverlap(bounds, strokeBounds, radius)) continue;
    if (object.locked) {
      const hit = object instanceof LinearDimension || object instanceof DiameterDimension
        ? annotationHit(object, segments, radius)
        : hitObjectByBrush(object, segments, radius);
      if (hit) skippedLocked.push(object.id);
      continue;
    }
    if (typeof filter === 'function' && !filter(object)) continue;

    if (object instanceof LinearDimension || object instanceof DiameterDimension) {
      if (eraseAnnotations && annotationHit(object, segments, radius)) {
        remove.push(object.id); removedSegments.push({ objectId: object.id, type: object.type, whole: true });
      }
      continue;
    }
    if (object instanceof Line) {
      const result = eraseSimpleLine(object);
      if (!result) continue;
      remove.push(object.id); addObjects.push(...result.fragments);
      removedSegments.push({ objectId: object.id, type: object.type, intervals: result.erased });
      continue;
    }
    if (object instanceof Circle) {
      const erased = circleEraseIntervals(object, segments, radius, eps);
      if (!erased.length) continue;
      const kept = subtractIntervals(erased);
      // Parameter 0 and 1 are the same point on a circle. If both end pieces
      // survive, merge them into one wrap-around arc instead of two artificial
      // fragments split at the angular seam.
      const ranges = kept.map(pair => [...pair]);
      const fragments = [];
      if (ranges.length >= 2 && ranges[0][0] <= 1e-10 && ranges.at(-1)[1] >= 1 - 1e-10) {
        const first = ranges.shift(), last = ranges.pop();
        const start = last[0] * TAU;
        const sweep = (1 - last[0] + first[1]) * TAU;
        if (sweep >= minArcSweep) {
          const wrap = new Arc(object.center, object.radius, start, Math.min(TAU, sweep), { style: object.style, visible: object.visible, ownerId: object.id });
          wrap.ownerId = object.id; fragments.push(wrap);
        }
      }
      for (const [a, b] of ranges) {
        if ((b - a) * TAU < minArcSweep) continue;
        const part = new Arc(object.center, object.radius, a * TAU, (b - a) * TAU, { style: object.style, visible: object.visible, ownerId: object.id });
        part.ownerId = object.id; fragments.push(part);
      }
      remove.push(object.id); addObjects.push(...fragments);
      removedSegments.push({ objectId: object.id, type: object.type, intervals: erased });
      continue;
    }
    if (object instanceof Arc) {
      const erased = arcEraseIntervals(object, segments, radius, eps);
      if (!erased.length) continue;
      const kept = subtractIntervals(erased);
      const fragments = kept.map(([a, b]) => makeArcFragment(object, a, b))
        .filter(Boolean).filter(part => Math.abs(part.sweep) >= minArcSweep);
      remove.push(object.id); addObjects.push(...fragments);
      removedSegments.push({ objectId: object.id, type: object.type, intervals: erased });
      continue;
    }
    if (object instanceof Polygon) {
      const edgeResults = object.edges().map(edge => ({ edge, result: eraseSimpleLine(edge) }));
      if (!edgeResults.some(x => x.result)) continue;
      remove.push(object.id);
      for (const { edge, result } of edgeResults) {
        if (result) addObjects.push(...result.fragments);
        else addObjects.push(new Line(edge.a, edge.b, { style: edge.style, ownerId: object.id }));
      }
      removedSegments.push({ objectId: object.id, type: object.type, edgesErased: edgeResults.filter(x => x.result).length });
    }
  }

  if (!remove.length) return { ok: false, reason: 'Ластик не задел доступную геометрию', remove: [], add: [], skippedLocked };
  return {
    ok: true,
    operation: 'erase',
    remove,
    add: addObjects,
    removed: removedSegments,
    skippedLocked,
    stats: { objectsChanged: remove.length, fragmentsCreated: addObjects.length, annotationsRemoved: removedSegments.filter(x => x.whole).length },
    brush: { radius, path: points }
  };
}

/** Convert a screen-space brush radius (pixels) into world units. */
export function eraserRadiusInWorld(pixelRadius, worldToScreenScale) {
  if (!Number.isFinite(pixelRadius) || pixelRadius <= 0) throw new RangeError('Экранный радиус должен быть положительным числом');
  if (!Number.isFinite(worldToScreenScale) || worldToScreenScale <= 0) throw new RangeError('Масштаб вида должен быть положительным числом');
  return pixelRadius / worldToScreenScale;
}

/** One-click circular eraser dab. */
export function eraseAtPoint(objects, point, radius, options = {}) {
  finitePoint(point);
  return eraseAlongPath(objects, [point], radius, options);
}

/** Apply eraser transaction using the same immutable scene helper as Trim. */
export function applyEraseTransaction(objects, transaction) {
  return applyEditTransaction(objects, transaction);
}

function hitObjectByBrush(object, segments, radius) {
  if (object instanceof Line) return lineEraseIntervals(object, segments, radius).length > 0;
  if (object instanceof Circle) return circleEraseIntervals(object, segments, radius, 1e-7).length > 0;
  if (object instanceof Arc) return arcEraseIntervals(object, segments, radius, 1e-7).length > 0;
  if (object instanceof Polygon) return object.edges().some(edge => lineEraseIntervals(edge, segments, radius).length > 0);
  return false;
}
