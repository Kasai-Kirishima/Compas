const EPS = 1e-8;

const finitePoint = p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
const cross = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function normalizeRing(points) {
  if (!Array.isArray(points) || points.length < 3 || !points.every(finitePoint)) return null;
  const ring = points.map(p => ({ x: Number(p.x), y: Number(p.y) }));
  const repeatedEnd = ring.length > 3 && distance(ring[0], ring[ring.length - 1]) <= EPS;
  if (repeatedEnd) ring.pop();
  return ring.length >= 3 ? { ring, repeatedEnd } : null;
}

function closestPointOnSegment(point, a, b) {
  const ab = subtract(b, a), len2 = ab.x * ab.x + ab.y * ab.y;
  const t = len2 <= EPS ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / len2));
  const projected = add(a, scale(ab, t));
  return { point: projected, t, distance: distance(point, projected) };
}

/** Find the nearest finite edge of a closed polygonal ring. */
export function closestClosedPolylineEdge(points, point) {
  const normalized = normalizeRing(points);
  if (!normalized || !finitePoint(point)) return null;
  const { ring } = normalized;
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const hit = closestPointOnSegment(point, ring[i], ring[(i + 1) % ring.length]);
    if (!best || hit.distance < best.distance) best = { edgeIndex: i, ...hit };
  }
  return best;
}

function intersectInfiniteLines(a, b, c, d) {
  const r = subtract(b, a), s = subtract(d, c), denominator = cross(r, s);
  if (Math.abs(denominator) <= EPS) return null;
  const t = cross(subtract(c, a), s) / denominator;
  const p = add(a, scale(r, t));
  return finitePoint(p) ? p : null;
}

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function orientation(a, b, c) { return cross(subtract(b, a), subtract(c, a)); }
function onSegment(a, b, p, eps = 1e-7) {
  return Math.abs(orientation(a, b, p)) <= eps && p.x >= Math.min(a.x, b.x) - eps && p.x <= Math.max(a.x, b.x) + eps && p.y >= Math.min(a.y, b.y) - eps && p.y <= Math.max(a.y, b.y) + eps;
}
function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) && ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function hasSelfIntersection(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      const c = points[j], d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * Move one polygon face parallel to itself. Its two adjacent vertices are
 * recomputed as intersections with the neighbouring side lines; every other
 * vertex remains fixed. Positive offset follows the ring's left-hand normal.
 */
export function moveClosedPolylineEdge(points, edgeIndex, offset, { minEdgeLength = 0.05, precision = 1e-6 } = {}) {
  const normalized = normalizeRing(points);
  if (!normalized) return { ok: false, reason: 'Нужен замкнутый многоугольник минимум с тремя вершинами' };
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= normalized.ring.length) return { ok: false, reason: 'Неверно выбрана грань многоугольника' };
  const delta = Number(offset);
  if (!Number.isFinite(delta)) return { ok: false, reason: 'Смещение грани должно быть числом' };
  const original = normalized.ring, n = original.length;
  if (Math.abs(delta) <= precision) return { ok: true, points: normalized.repeatedEnd ? [...original, { ...original[0] }] : original.map(p => ({ ...p })), offset: 0 };

  const i = edgeIndex, j = (i + 1) % n, prev = (i - 1 + n) % n, next = (j + 1) % n;
  const a = original[i], b = original[j], edge = subtract(b, a), length = Math.hypot(edge.x, edge.y);
  if (length <= minEdgeLength) return { ok: false, reason: 'Выбранная грань слишком короткая' };
  const normal = { x: -edge.y / length, y: edge.x / length };
  const shift = scale(normal, delta), movedA = add(a, shift), movedB = add(b, shift);
  const newA = intersectInfiniteLines(original[prev], a, movedA, movedB);
  const newB = intersectInfiniteLines(movedA, movedB, b, original[next]);
  if (!newA || !newB) return { ok: false, reason: 'Соседняя грань параллельна выбранной — сместить эту сторону без перестройки контура нельзя' };
  if (distance(original[prev], newA) < minEdgeLength || distance(newA, newB) < minEdgeLength || distance(newB, original[next]) < minEdgeLength) {
    return { ok: false, reason: 'Смещение слишком велико: одна из соседних граней схлопнется' };
  }

  const result = original.map(p => ({ ...p }));
  result[i] = newA;
  result[j] = newB;
  const oldArea = signedArea(original), newArea = signedArea(result);
  if (Math.abs(newArea) < minEdgeLength * minEdgeLength || oldArea * newArea <= 0) return { ok: false, reason: 'Смещение вырождает или переворачивает многоугольник' };
  if (hasSelfIntersection(result)) return { ok: false, reason: 'Такое смещение создаёт самопересечение контура' };
  const rounded = result.map(p => ({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) }));
  if (normalized.repeatedEnd) rounded.push({ ...rounded[0] });
  return { ok: true, points: rounded, offset: delta, edgeIndex: i, normal };
}
