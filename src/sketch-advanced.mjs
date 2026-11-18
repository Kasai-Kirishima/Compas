/* Advanced 2D sketch operations for the legacy editor object format.
 * Coordinates are in millimetres. No DOM dependency: all helpers are deterministic.
 */
import {
  Line, Centerline, Circle, Arc, Polygon, trimAtPoint,
  distance, clamp, normAngle, TAU, intersectionSnapPoints
} from './cad-geometry-trim.mjs';

const EPS = 1e-8;
const clonePoint = p => ({ x: Number(p.x), y: Number(p.y) });
const hypot = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const positiveSweep = (start, end) => ((end - start) % TAU + TAU) % TAU || TAU;

function objectId(o, fallback = '') { return String(o?.id ?? fallback); }
function finitePoint(p) { return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)); }
function cleanPoints(points, tolerance = 1e-8) {
  const out = [];
  for (const p of points || []) {
    if (!finitePoint(p)) continue;
    const q = clonePoint(p);
    if (!out.length || hypot(out[out.length - 1], q) > tolerance) out.push(q);
  }
  return out;
}

/** Convert editor objects to one or more sampled/open polyline paths. */
export function objectToSketchPaths(object, { curveSegments = 192 } = {}) {
  if (!object || object.hidden || object.visible === false) return [];
  const type = object.type;
  const path = (points, closed = false) => {
    const clean = cleanPoints(points);
    return clean.length >= (closed ? 3 : 2) ? [{ points: clean, closed, sourceId: objectId(object) }] : [];
  };
  if (type === 'line' || type === 'construction' || type === 'centerline' || type === 'section') {
    if (![object.x, object.y, object.x2, object.y2].every(Number.isFinite)) return [];
    return path([{ x: object.x, y: object.y }, { x: object.x2, y: object.y2 }]);
  }
  if (type === 'rect') {
    const x1 = Math.min(object.x, object.x2), x2 = Math.max(object.x, object.x2);
    const y1 = Math.min(object.y, object.y2), y2 = Math.max(object.y, object.y2);
    const r = clamp(Number(object.rx) || 0, 0, Math.min((x2 - x1) / 2, (y2 - y1) / 2));
    if (!(r > EPS)) return path([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }], true);
    const corners = [
      { cx: x2 - r, cy: y1 + r, start: -Math.PI / 2 },
      { cx: x2 - r, cy: y2 - r, start: 0 },
      { cx: x1 + r, cy: y2 - r, start: Math.PI / 2 },
      { cx: x1 + r, cy: y1 + r, start: Math.PI }
    ];
    const pts = [];
    for (const c of corners) for (let i = 0; i <= 12; i++) {
      const a = c.start + i * Math.PI / 24;
      pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) });
    }
    return path(pts, true);
  }
  if (type === 'circle') {
    const radius = Math.hypot((Number(object.x2) || 0) - object.x, (Number(object.y2) || 0) - object.y);
    if (!(radius > EPS)) return [];
    const count = Math.max(64, Math.min(1024, curveSegments));
    return path(Array.from({ length: count }, (_, i) => {
      const a = TAU * i / count;
      return { x: object.x + radius * Math.cos(a), y: object.y + radius * Math.sin(a) };
    }), true);
  }
  if (type === 'arc') {
    const radius = Number(object.r) || 0;
    if (!(radius > EPS)) return [];
    const start = Number(object.start) || 0, sweep = positiveSweep(start, Number(object.end) || 0);
    const count = Math.max(16, Math.min(1024, Math.ceil(curveSegments * sweep / TAU)));
    return path(Array.from({ length: count + 1 }, (_, i) => {
      const a = start + sweep * i / count;
      return { x: object.x + radius * Math.cos(a), y: object.y + radius * Math.sin(a) };
    }));
  }
  if (type === 'ellipse') {
    const cx = (object.x + object.x2) / 2, cy = (object.y + object.y2) / 2;
    const rx = Math.abs(object.x2 - object.x) / 2, ry = Math.abs(object.y2 - object.y) / 2;
    if (!(rx > EPS && ry > EPS)) return [];
    const count = Math.max(64, Math.min(1024, curveSegments));
    return path(Array.from({ length: count }, (_, i) => {
      const a = TAU * i / count;
      return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    }), true);
  }
  if (type === 'polyline' || type === 'spline' || type === 'freehand' || type === 'breakline') {
    return Array.isArray(object.points) ? path(object.points, !!object.closed) : [];
  }
  if (type === 'hatch' && Array.isArray(object.points)) return path(object.points, true);
  return [];
}

function pathSegments(paths) {
  const out = [];
  for (const p of paths) {
    const n = p.points.length;
    for (let i = 0; i < n - 1 + (p.closed ? 1 : 0); i++) {
      const a = p.points[i], b = p.points[(i + 1) % n];
      if (hypot(a, b) > EPS) out.push({ a, b, sourceId: p.sourceId, pathIndex: i, pathLength: n, closed: p.closed });
    }
  }
  return out;
}

function segmentIntersection(a, b, c, d, eps = 1e-9) {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s), q = sub(c, a);
  const scale = Math.max(1, Math.hypot(r.x, r.y), Math.hypot(s.x, s.y));
  if (Math.abs(den) <= eps * scale * scale) return null;
  const t = cross(q, s) / den, u = cross(q, r) / den;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  const tc = clamp(t, 0, 1), uc = clamp(u, 0, 1);
  return { t: tc, u: uc, point: add(a, mul(r, tc)) };
}

function candidateAdd(out, type, point, sourceIds = []) {
  if (!finitePoint(point)) return;
  const rank = { intersection: 0, endpoint: 1, midpoint: 2, center: 3, quadrant: 4, vertex: 1 };
  const q = clonePoint(point);
  if (out.some(c => c.type === type && hypot(c.point, q) <= 1e-7)) return;
  out.push({ type, point: q, sourceIds, priority: rank[type] ?? 9 });
}

/** Build endpoint/midpoint/center/quadrant/intersection snap candidates. */
export function getObjectSnapCandidates(objects, { curveSegments = 256, includeIntersections = true } = {}) {
  const candidates = [], pathsByObject = [];
  for (const object of objects || []) {
    if (!object || object.hidden || object.visible === false || object.type === 'dimension' || object.type === 'text' || object.type === 'techReq' || object.type === 'reference' || object.type === 'hatch') continue;
    const paths = objectToSketchPaths(object, { curveSegments });
    if (!paths.length) continue;
    pathsByObject.push({ object, paths });
    const type = object.type;
    for (const p of paths) {
      const n = p.points.length;
      if (['line', 'construction', 'centerline', 'section', 'rect', 'polyline', 'spline', 'freehand', 'breakline'].includes(type)) {
        for (let i = 0; i < n; i++) {
          const q = p.points[i];
          const isOpenEnd = !p.closed && (i === 0 || i === n - 1);
          if (isOpenEnd || type === 'rect' || type === 'polyline') candidateAdd(candidates, 'endpoint', q, [objectId(object)]);
          if (i < n - 1 || p.closed) {
            const next = p.points[(i + 1) % n];
            candidateAdd(candidates, 'midpoint', { x: (q.x + next.x) / 2, y: (q.y + next.y) / 2 }, [objectId(object)]);
          }
        }
      }
    }
    if (type === 'arc') {
      const r = Number(object.r) || 0, start = Number(object.start) || 0, sweep = positiveSweep(start, Number(object.end) || 0);
      const mid = start + sweep / 2;
      candidateAdd(candidates, 'endpoint', { x: object.x + r * Math.cos(start), y: object.y + r * Math.sin(start) }, [objectId(object)]);
      candidateAdd(candidates, 'endpoint', { x: object.x + r * Math.cos(start + sweep), y: object.y + r * Math.sin(start + sweep) }, [objectId(object)]);
      candidateAdd(candidates, 'midpoint', { x: object.x + r * Math.cos(mid), y: object.y + r * Math.sin(mid) }, [objectId(object)]);
    }
    if (type === 'circle' || type === 'arc' || type === 'ellipse' || type === 'rect') {
      const cx = type === 'circle' || type === 'arc' ? object.x : (object.x + object.x2) / 2;
      const cy = type === 'circle' || type === 'arc' ? object.y : (object.y + object.y2) / 2;
      candidateAdd(candidates, 'center', { x: cx, y: cy }, [objectId(object)]);
    }
    if (type === 'circle') {
      const r = Math.hypot(object.x2 - object.x, object.y2 - object.y);
      [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach(a => candidateAdd(candidates, 'quadrant', { x: object.x + r * Math.cos(a), y: object.y + r * Math.sin(a) }, [objectId(object)]));
    } else if (type === 'arc') {
      const r = Number(object.r) || 0, start = Number(object.start) || 0, sweep = positiveSweep(start, Number(object.end) || 0);
      [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach(a => {
        const t = normAngle(a - start) / sweep;
        if (t >= -1e-8 && t <= 1 + 1e-8) candidateAdd(candidates, 'quadrant', { x: object.x + r * Math.cos(a), y: object.y + r * Math.sin(a) }, [objectId(object)]);
      });
    } else if (type === 'ellipse') {
      const cx = (object.x + object.x2) / 2, cy = (object.y + object.y2) / 2;
      const rx = Math.abs(object.x2 - object.x) / 2, ry = Math.abs(object.y2 - object.y) / 2;
      [{ x: cx + rx, y: cy }, { x: cx, y: cy + ry }, { x: cx - rx, y: cy }, { x: cx, y: cy - ry }].forEach(p => candidateAdd(candidates, 'quadrant', p, [objectId(object)]));
    }
  }
  if (includeIntersections) {
    // Prefer the CAD kernel's analytic solvers for line/line, line/circle,
    // line/arc and circle/circle intersections. Curved editor objects that
    // have no exact primitive representation (e.g. freehand) fall back to
    // their tessellated segments.
    const exact = [], approximate = [];
    for (const { object } of pathsByObject) {
      const primitive = toCorePrimitive(object);
      if (primitive) exact.push(primitive);
      else {
        const paths = objectToSketchPaths(object, { curveSegments: 96 });
        for (const path of paths) {
          const pts = path.points;
          for (let i = 0; i < pts.length - (path.closed ? 0 : 1); i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            try { approximate.push(new Line(a, b, { id: `${objectId(object)}:snap:${i}` })); } catch {}
          }
        }
      }
    }
    const exactHits = intersectionSnapPoints([...exact, ...approximate]);
    for (const hit of exactHits) candidateAdd(candidates, 'intersection', hit.point, hit.objectIds || []);
  }
  return candidates;
}

/** Return nearest snap candidate within a world-space tolerance. */
export function findObjectSnap(point, objects, { tolerance = 3, candidates = null } = {}) {
  if (!finitePoint(point) || !(tolerance >= 0)) return null;
  const all = candidates || getObjectSnapCandidates(objects);
  const ranked = all.map(candidate => ({ ...candidate, distance: hypot(candidate.point, point) }))
    .filter(candidate => candidate.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance || a.priority - b.priority);
  if (!ranked.length) return null;
  // A snap with slightly greater distance but higher geometric certainty should win
  // only when it is effectively tied with the nearest one.
  const best = ranked[0];
  const tied = ranked.filter(c => c.distance <= best.distance + Math.max(0.15, tolerance * 0.06));
  tied.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
  return tied[0];
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
      (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnPolygonBoundary(point, points, eps = 1e-8) {
  if (!finitePoint(point) || !Array.isArray(points) || points.length < 2) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    const t = length2 > eps * eps ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
    const px = a.x + dx * t, py = a.y + dy * t;
    if (Math.hypot(point.x - px, point.y - py) <= eps) return true;
  }
  return false;
}

/** True only for points in the material area: inside outer, outside every hole. */
export function pointInRegion(point, region, { boundaryTolerance = 1e-7 } = {}) {
  if (!finitePoint(point) || !region || !Array.isArray(region.outer) || region.outer.length < 3) return false;
  const inOuter = pointInPolygon(point, region.outer) || pointOnPolygonBoundary(point, region.outer, boundaryTolerance);
  if (!inOuter) return false;
  return !(region.holes || []).some(ring => pointInPolygon(point, ring) || pointOnPolygonBoundary(point, ring, boundaryTolerance));
}
function loopInteriorPoint(points, tolerance) {
  const sign = Math.sign(polygonArea(points)) || 1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], d = sub(b, a), len = Math.hypot(d.x, d.y);
    if (len <= tolerance * 2) continue;
    const mid = mul(add(a, b), 0.5), normal = { x: -d.y / len * sign, y: d.x / len * sign };
    const p = add(mid, mul(normal, Math.max(tolerance * 3, len * 1e-5)));
    if (pointInPolygon(p, points)) return p;
  }
  return points.reduce((s, p) => add(s, p), { x: 0, y: 0 });
}

/**
 * Find bounded planar regions formed by arbitrary 2D curves.
 * Curves are tessellated, split at crossings, converted into a planar half-edge
 * graph and walked into faces. Nested loops are represented as holes/islands.
 */
export function findClosedLoops(curves, { tolerance = 0.02, curveSegments = 256, maxSegments = 12000 } = {}) {
  const paths = (curves || []).flatMap(o => objectToSketchPaths(o, { curveSegments }));
  let segments = pathSegments(paths);
  if (segments.length < 3) return [];
  if (segments.length > maxSegments) throw new RangeError(`Слишком сложная геометрия: ${segments.length} сегментов (лимит ${maxSegments})`);
  const splitParams = segments.map(() => [0, 1]);
  const boxes = segments.map(s => ({
    minX: Math.min(s.a.x, s.b.x) - tolerance, maxX: Math.max(s.a.x, s.b.x) + tolerance,
    minY: Math.min(s.a.y, s.b.y) - tolerance, maxY: Math.max(s.a.y, s.b.y) + tolerance
  }));
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) continue;
    const hit = segmentIntersection(segments[i].a, segments[i].b, segments[j].a, segments[j].b, 1e-10);
    if (!hit) continue;
    splitParams[i].push(hit.t); splitParams[j].push(hit.u);
  }
  const nodeMap = new Map(), nodes = [], edgeKeys = new Set(), edges = [];
  const tol = Math.max(1e-7, Number(tolerance) || 0.02);
  const nodeFor = p => {
    const qx = Math.round(p.x / tol), qy = Math.round(p.y / tol), key = `${qx},${qy}`;
    if (nodeMap.has(key)) return nodeMap.get(key);
    const id = nodes.length; nodes.push({ id, point: clonePoint(p), neighbours: [] }); nodeMap.set(key, id); return id;
  };
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i], len = hypot(s.a, s.b);
    const ts = [...splitParams[i]].sort((a, b) => a - b).filter((t, k, arr) => !k || Math.abs(t - arr[k - 1]) > 1e-9);
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if ((t1 - t0) * len <= tol * 0.25) continue;
      const a = add(s.a, mul(sub(s.b, s.a), t0)), b = add(s.a, mul(sub(s.b, s.a), t1));
      const u = nodeFor(a), v = nodeFor(b);
      if (u === v) continue;
      const edgeKey = u < v ? `${u}:${v}` : `${v}:${u}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey); edges.push({ u, v });
      nodes[u].neighbours.push(v); nodes[v].neighbours.push(u);
    }
  }
  for (const node of nodes) node.neighbours.sort((a, b) => {
    const p = node.point, pa = nodes[a].point, pb = nodes[b].point;
    return Math.atan2(pa.y - p.y, pa.x - p.x) - Math.atan2(pb.y - p.y, pb.x - p.x);
  });
  const visited = new Set(), cycles = [], maxWalk = Math.max(16, edges.length * 2 + 4);
  for (const edge of edges) for (const [startU, startV] of [[edge.u, edge.v], [edge.v, edge.u]]) {
    const startKey = `${startU}>${startV}`;
    if (visited.has(startKey)) continue;
    let u = startU, v = startV, closed = false; const ids = [];
    for (let guard = 0; guard < maxWalk; guard++) {
      const key = `${u}>${v}`;
      if (visited.has(key)) { closed = u === startU && v === startV; break; }
      visited.add(key); ids.push(u);
      const neighbours = nodes[v].neighbours, reverseIndex = neighbours.indexOf(u);
      if (reverseIndex < 0 || !neighbours.length) break;
      const next = neighbours[(reverseIndex - 1 + neighbours.length) % neighbours.length];
      u = v; v = next;
      if (u === startU && v === startV) { closed = true; break; }
    }
    if (!closed || ids.length < 3) continue;
    const pts = ids.map(id => nodes[id].point), area = polygonArea(pts);
    if (area <= tol * tol) continue; // Keep bounded CCW faces; discard the exterior face.
    const key = ids.join(',');
    if (cycles.some(c => c.key === key)) continue;
    cycles.push({ key, points: pts, area, perimeter: pts.reduce((sum, p, i) => sum + hypot(p, pts[(i + 1) % pts.length]), 0) });
  }
  if (!cycles.length) return [];
  // Build a nesting tree: odd depth loops are voids; even depth loops are material islands.
  const ordered = cycles.map((loop, index) => ({ ...loop, index, sample: loopInteriorPoint(loop.points, tol), parent: null, depth: 0 }))
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  for (let i = 0; i < ordered.length; i++) {
    const child = ordered[i]; let parent = null;
    for (let j = 0; j < i; j++) {
      const candidate = ordered[j];
      if (Math.abs(candidate.area) > Math.abs(child.area) && pointInPolygon(child.sample, candidate.points) && (!parent || Math.abs(candidate.area) < Math.abs(parent.area))) parent = candidate;
    }
    child.parent = parent;
    child.depth = parent ? parent.depth + 1 : 0;
  }
  const regions = [];
  for (const loop of ordered) {
    if (loop.depth % 2 !== 0) continue;
    const holes = ordered.filter(candidate => candidate.parent === loop && candidate.depth === loop.depth + 1).map(h => h.points.map(clonePoint));
    regions.push({
      outer: loop.points.map(clonePoint), holes,
      area: Math.max(0, Math.abs(loop.area) - holes.reduce((sum, h) => sum + Math.abs(polygonArea(h)), 0)),
      perimeter: loop.perimeter,
      depth: loop.depth,
      sourceIds: [...new Set(segments.map(s => s.sourceId).filter(Boolean))]
    });
  }
  return regions.sort((a, b) => b.area - a.area);
}

/** Generate actual hatch line segments clipped to an outer loop and its holes.
 *
 * The clipping uses a half-open scan-line rule. This counts a polygon vertex
 * exactly once when a hatch line crosses it, twice when it only touches it,
 * and ignores edges coincident with the hatch line. Keeping those duplicate
 * tangent hits (rather than deduplicating them) preserves even/odd parity for
 * concave boundaries and nested holes.
 */
export function createHatch(region, { angle = 45, step = 2, pattern = 'single', maxLines = 20000 } = {}) {
  if (!region || !Array.isArray(region.outer) || region.outer.length < 3) {
    throw new TypeError('Для штриховки нужен замкнутый внешний контур');
  }
  const spacing = Number(step), baseAngle = Number(angle);
  if (!(spacing > 0) || !Number.isFinite(spacing)) {
    throw new RangeError('Шаг штриховки должен быть больше нуля');
  }
  if (!Number.isFinite(baseAngle)) throw new RangeError('Угол штриховки задан неверно');
  const allowedPatterns = new Set(['single', 'cross', 'triple', 'solid']);
  const hatchPattern = allowedPatterns.has(pattern) ? pattern : 'single';
  const outer = cleanPoints(region.outer), holes = (region.holes || [])
    .map(ring => cleanPoints(ring))
    .filter(ring => ring.length >= 3);
  if (outer.length < 3) throw new TypeError('Внешний контур штриховки повреждён');

  const rings = [outer, ...holes], all = rings.flat();
  if (!all.every(finitePoint)) throw new TypeError('Контур штриховки содержит неверные координаты');
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const extent = Math.hypot(maxX - minX, maxY - minY);
  const normalizedAngle = ((baseAngle % 180) + 180) % 180;
  const families = hatchPattern === 'cross'
    ? [normalizedAngle, normalizedAngle + 90]
    : hatchPattern === 'triple'
      ? [normalizedAngle, normalizedAngle + 60, normalizedAngle + 120]
      : [normalizedAngle];
  const segments = [];
  let totalLines = 0;

  if (hatchPattern !== 'solid') for (const degrees of families) {
    const radians = degrees * Math.PI / 180;
    const dir = { x: Math.cos(radians), y: Math.sin(radians) };
    const normal = { x: -Math.sin(radians), y: Math.cos(radians) };
    const projections = all.map(point => dot(sub(point, center), normal));
    const lo = Math.floor(Math.min(...projections) / spacing);
    const hi = Math.ceil(Math.max(...projections) / spacing);
    const lineCount = hi - lo + 1;
    totalLines += lineCount;
    if (!Number.isFinite(lineCount) || lineCount < 0 || totalLines > maxLines) {
      throw new RangeError(`Слишком плотная штриховка: требуется более ${maxLines} линий`);
    }

    // Scale-aware tolerances avoid unstable classification of nearly
    // coincident edges, while remaining far below drawing precision.
    const sideEpsilon = Math.max(1, extent) * 1e-11;
    const hitEpsilon = Math.max(1, extent) * 1e-10;
    const edges = [], coincidentLines = new Set();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        const sideP = dot(sub(p, center), normal), sideQ = dot(sub(q, center), normal);
        if (Math.abs(sideP - sideQ) <= sideEpsilon) {
          // Keep a set of scan lines coincident with polygon edges so those
          // lines are not drawn on top of the boundary itself.
          const k = Math.round(sideP / spacing);
          if (Math.abs(sideP - k * spacing) <= sideEpsilon) coincidentLines.add(k);
          continue;
        }
        edges.push({ p, q, sideP, sideQ, low: Math.min(sideP, sideQ), high: Math.max(sideP, sideQ) });
      }
    }
    edges.sort((a, b) => a.low - b.low || a.high - b.high);
    let nextEdge = 0, activeEdges = [];

    // Sweep through scan lines in increasing normal projection. Only edges
    // intersecting the current line are examined, avoiding a full contour
    // walk for every hatch stripe on large/freeform boundaries.
    for (let k = lo; k <= hi; k++) {
      const offset = k * spacing;
      while (nextEdge < edges.length && edges[nextEdge].low <= offset + sideEpsilon) {
        activeEdges.push(edges[nextEdge++]);
      }
      activeEdges = activeEdges.filter(edge => edge.high > offset + sideEpsilon);
      if (coincidentLines.has(k) || activeEdges.length < 2) continue;

      const hits = [];
      for (const edge of activeEdges) {
        // Half-open crossing rule: a crossing vertex is counted once; a
        // tangent vertex produces two equal hits and therefore a zero
        // interval. Do not deduplicate those hits before even/odd pairing.
        const ratio = Math.max(0, Math.min(1, (offset - edge.sideP) / (edge.sideQ - edge.sideP)));
        const point = {
          x: edge.p.x + (edge.q.x - edge.p.x) * ratio,
          y: edge.p.y + (edge.q.y - edge.p.y) * ratio
        };
        const t = dot(sub(point, center), dir);
        if (Number.isFinite(t)) hits.push(t);
      }
      if (hits.length < 2) continue;

      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const t0 = hits[i], t1 = hits[i + 1];
        if (t1 - t0 <= hitEpsilon) continue;
        const origin = add(center, mul(normal, offset));
        const a = add(origin, mul(dir, t0));
        const b = add(origin, mul(dir, t1));
        if (finitePoint(a) && finitePoint(b)) segments.push({ a, b, angle: degrees });
      }
    }
  }
  return {
    outer, holes,
    angle: normalizedAngle,
    spacing,
    pattern: hatchPattern,
    segments
  };
}

/** Radius measured to vertices, to the tangent/in-circle, or across opposite flats. */
export function regularPolygonVertices(center, sides, measuredRadius, { mode = 'circumradius', angle = -Math.PI / 2 } = {}) {
  if (!finitePoint(center)) throw new TypeError('Центр многоугольника задан неверно');
  if (!Number.isInteger(sides) || sides < 3 || sides > 256) throw new RangeError('Количество сторон должно быть от 3 до 256');
  if (!(Number(measuredRadius) > 0) || !Number.isFinite(Number(measuredRadius))) throw new RangeError('Размер многоугольника должен быть положительным');
  if (!['circumradius', 'inradius', 'acrossFlats'].includes(mode)) throw new RangeError('Режим размера: circumradius, inradius или acrossFlats');
  const apothem = mode === 'acrossFlats' ? Number(measuredRadius) / 2 : Number(measuredRadius);
  const radius = mode === 'circumradius' ? Number(measuredRadius) : apothem / Math.cos(Math.PI / sides);
  return Array.from({ length: sides }, (_, i) => {
    const a = Number(angle) + TAU * i / sides;
    return { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) };
  });
}

/**
 * Return the single outer boundary of a six-pointed star (hexagram).
 * Alternating outer tips and inner valleys produce one closed 12-vertex contour,
 * without the internal crossing edges of the two-triangle construction.
 */
export function sixPointStarOutline(center, radius, { angle = -Math.PI / 2, innerRatio = 0.5 } = {}) {
  if (!finitePoint(center)) throw new TypeError('Центр звезды задан неверно');
  if (!(Number(radius) > 0) || !Number.isFinite(Number(radius))) throw new RangeError('Радиус звезды должен быть положительным');
  const r = Number(radius), inner = clamp(Number(innerRatio) || 0.5, 0.1, 0.9);
  return Array.from({ length: 12 }, (_, i) => {
    const a = Number(angle) + Math.PI * i / 6;
    const rr = i % 2 === 0 ? r : r * inner;
    return { x: center.x + Math.cos(a) * rr, y: center.y + Math.sin(a) * rr };
  });
}

/**
 * A regular six-pointed star (hexagram) as two separately editable equilateral
 * triangles sharing one circumcircle. The caller can place both in one group.
 */
export function sixPointStarTriangles(center, radius, { angle = -Math.PI / 2 } = {}) {
  if (!finitePoint(center)) throw new TypeError('Центр звезды задан неверно');
  if (!(Number(radius) > 0) || !Number.isFinite(Number(radius))) throw new RangeError('Радиус звезды должен быть положительным');
  const r = Number(radius);
  return [
    regularPolygonVertices(center, 3, r, { mode: 'circumradius', angle: Number(angle) }),
    regularPolygonVertices(center, 3, r, { mode: 'circumradius', angle: Number(angle) + Math.PI / 3 })
  ];
}

/** Construct the unique circular arc passing through three non-collinear points. */
export function arcThroughThreePoints(start, through, end, { eps = 1e-9 } = {}) {
  if (![start, through, end].every(finitePoint)) throw new TypeError('Для дуги нужны три конечные точки');
  const a = clonePoint(start), b = clonePoint(through), c = clonePoint(end);
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const scale = Math.max(1, hypot(a, b), hypot(b, c), hypot(c, a));
  if (Math.abs(d) <= eps * scale * scale) throw new RangeError('Три точки дуги лежат почти на одной прямой');
  const aa = a.x * a.x + a.y * a.y, bb = b.x * b.x + b.y * b.y, cc = c.x * c.x + c.y * c.y;
  const center = {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d
  };
  const radius = hypot(center, a);
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const throughAngle = Math.atan2(b.y - center.y, b.x - center.x);
  const endAngle = Math.atan2(c.y - center.y, c.x - center.x);
  const ccwEnd = positiveSweep(startAngle, endAngle);
  const ccwThrough = positiveSweep(startAngle, throughAngle);
  // Store the arc in positive sweep direction so the editor's SVG arc renderer
  // can draw it without a separate clockwise flag.
  const useStartToEnd = ccwThrough <= ccwEnd + eps;
  const s = useStartToEnd ? startAngle : endAngle;
  const e = useStartToEnd ? endAngle : startAngle;
  const sweep = positiveSweep(s, e);
  return { center, radius, startAngle: s, endAngle: s + sweep, sweep, throughPoint: b };
}

function toCorePrimitive(object, idSuffix = '') {
  const id = `${objectId(object)}${idSuffix}`;
  const common = { id, style: { stroke: object.color || '#20252a', lineWidth: object.width || 0.35, lineDash: object.dash || [] }, locked: !!object.locked, visible: !object.hidden };
  const type = object.type;
  if (type === 'line' || type === 'construction' || type === 'centerline' || type === 'section') {
    const a = { x: object.x, y: object.y }, b = { x: object.x2, y: object.y2 };
    return type === 'centerline' ? new Centerline(a, b, common) : new Line(a, b, common);
  }
  if (type === 'circle') return new Circle({ x: object.x, y: object.y }, Math.hypot(object.x2 - object.x, object.y2 - object.y), common);
  if (type === 'arc') return new Arc({ x: object.x, y: object.y }, object.r, object.start, positiveSweep(object.start, object.end), common);
  if (type === 'rect' || type === 'ellipse' || (type === 'polyline' && object.closed)) {
    const path = objectToSketchPaths(object, { curveSegments: 256 })[0];
    return path?.closed ? new Polygon(path.points, common) : null;
  }
  return null;
}

function fromCorePrimitive(primitive, source) {
  const base = { color: source.color || '#20252a', width: source.width || 0.35, layer: source.layer || 'geometry', dash: source.dash, locked: false, visible: true };
  if (primitive instanceof Line) return { ...base, type: source.type === 'construction' || source.type === 'centerline' ? source.type : 'line', x: primitive.a.x, y: primitive.a.y, x2: primitive.b.x, y2: primitive.b.y };
  if (primitive instanceof Arc) return { ...base, type: 'arc', x: primitive.center.x, y: primitive.center.y, r: primitive.radius, start: primitive.startAngle, end: primitive.startAngle + primitive.sweep };
  if (primitive instanceof Circle) return { ...base, type: 'circle', x: primitive.center.x, y: primitive.center.y, x2: primitive.center.x + primitive.radius, y2: primitive.center.y };
  return null;
}

/**
 * Legacy-editor trim adapter. Trims the clicked interval between adjacent
 * intersections for lines, circles, arcs, rectangles and closed polylines.
 * Returns replacement editor objects without mutating the scene.
 */
export function trimLegacyCurve(subject, clickPoint, objects, { hitTolerance = 5, eps = 1e-7, makeId = null } = {}) {
  if (!subject || subject.locked || subject.hidden) return { ok: false, reason: 'Объект заблокирован или скрыт' };
  const coreSubject = toCorePrimitive(subject);
  if (!coreSubject) return { ok: false, reason: 'Усечение поддерживается для отрезков, окружностей, дуг, прямоугольников, эллипсов и замкнутых полилиний' };
  const coreOthers = [];
  for (const object of objects || []) {
    if (!object || object.id === subject.id || object.hidden || object.type === 'dimension' || object.type === 'text' || object.type === 'reference') continue;
    const simple = toCorePrimitive(object);
    if (simple) coreOthers.push(simple);
    else {
      const paths = objectToSketchPaths(object, { curveSegments: 192 });
      paths.forEach((path, pi) => {
        for (let i = 0; i < path.points.length - (path.closed ? 0 : 1); i++) {
          const a = path.points[i], b = path.points[(i + 1) % path.points.length];
          try { coreOthers.push(new Line(a, b, { id: `${objectId(object)}:seg:${pi}:${i}`, locked: !!object.locked })); } catch {}
        }
      });
    }
  }
  const transaction = trimAtPoint(coreSubject, clickPoint, coreOthers, { hitTolerance, eps });
  if (!transaction.ok) return transaction;
  const ids = makeId || (() => `trim-${Math.random().toString(36).slice(2)}`);
  let replacements = [];
  if (coreSubject instanceof Polygon) {
    replacements = transaction.add.filter(x => x instanceof Line).map(x => ({
      ...fromCorePrimitive(x, subject), id: ids(), sourceContourId: subject.id
    }));
  } else {
    replacements = transaction.add.map(x => fromCorePrimitive(x, subject)).filter(Boolean).map(o => ({ ...o, id: ids() }));
  }
  return { ok: true, operation: 'trim', remove: [subject.id], add: replacements, removed: transaction.removed };
}
