/** Resolve a reliable contour target for an inside-to-outside pass.
 *
 * The drawing editor represents each closed outline as an independent 2D path.
 * When a drag starts inside nested contours, the smallest containing outline is
 * the natural candidate (usually a hole/pocket); if it is nested inside a larger
 * outline, the pass expands that void outward. If it is the only containing
 * outline, it is an outer material profile and the pass is applied as a normal
 * inward notch with the drag direction reversed by the geometry kernel.
 */
function finitePoint(p) {
  return !!p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
function pointOnSegment(p, a, b, eps = 1e-7) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= eps) return distance(p, a) <= eps;
  const cross = Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x));
  if (cross > eps * Math.max(1, len)) return false;
  const dot = (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y);
  return dot <= eps * Math.max(1, len);
}
function pointInPolygon(point, points, eps = 1e-7) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if (pointOnSegment(point, a, b, eps)) return true;
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}
function interiorSample(points) {
  const area = signedArea(points), sign = area >= 0 ? 1 : -1;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const scale = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len <= 1e-9) continue;
    const normal = { x: -dy / len * sign, y: dx / len * sign };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const factor of [1e-6, 1e-5, 1e-4, 1e-3]) {
      const step = Math.min(len * 0.1, scale * factor);
      const sample = { x: mid.x + normal.x * step, y: mid.y + normal.y * step };
      if (pointInPolygon(sample, points, 1e-9)) return sample;
    }
  }
  const average = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
  if (pointInPolygon(average, points, 1e-9)) return average;
  // A vertex nudged toward the average is a final useful fallback for highly
  // concave outlines where the arithmetic centroid lies outside the contour.
  for (const p of points) {
    const sample = { x: p.x * 0.999 + average.x * 0.001, y: p.y * 0.999 + average.y * 0.001 };
    if (pointInPolygon(sample, points, 1e-9)) return sample;
  }
  return { ...points[0] };
}

/**
 * @param {Array<{id:string, points:Array<{x:number,y:number}>}>} contours
 * @param {{x:number,y:number}} start Actual snapped start of the user's drag.
 * @param {Iterable<string>} selectedIds Optional explicit contour selection.
 * @returns {Array<{id:string, side:'inside'|'outside', parentId:string|null, area:number}>}
 */
export function resolveInsideOutCutTargets(contours, start, selectedIds = []) {
  if (!finitePoint(start) || !Array.isArray(contours)) return [];
  const selected = new Set(selectedIds || []);
  const entries = contours.filter(item => item && typeof item.id === 'string' && Array.isArray(item.points) && item.points.length >= 3 && item.points.every(finitePoint))
    .map(item => ({ id: item.id, points: item.points, area: Math.abs(signedArea(item.points)), sample: interiorSample(item.points), innerHint: item.isInner === true || ['circular-cutout','rectangular-pocket','obround-cutout'].includes(item.feature) }))
    .filter(item => item.area > 1e-9);
  if (!entries.length) return [];

  let candidates = selected.size ? entries.filter(item => selected.has(item.id)) : entries.filter(item => pointInPolygon(start, item.points));
  if (!candidates.length && selected.size) return [];
  if (!selected.size) {
    // Clicking inside a hole is also geometrically inside its enclosing part.
    // Choose the smallest containing loop to target the hole, not its parent.
    candidates = candidates.sort((a, b) => a.area - b.area).slice(0, 1);
  }

  const resolved = candidates.map(candidate => {
    const parents = entries.filter(other => other.id !== candidate.id && other.area > candidate.area + 1e-7 && pointInPolygon(candidate.sample, other.points));
    parents.sort((a, b) => a.area - b.area);
    const parent = parents[0] || null;
    const explicitInnerSelection = selected.has(candidate.id);
    return { id: candidate.id, side: parent || candidate.innerHint || explicitInnerSelection ? 'outside' : 'inside', parentId: parent?.id || null, area: candidate.area, innerHint: candidate.innerHint, explicit: explicitInnerSelection };
  });

  // When both an internal loop and its parent have been selected, processing
  // the parent as a second independent target would make a second, unwanted
  // cut at the same gesture. The inner loop owns the outward operation.
  const innerParents = new Set(resolved.filter(item => item.side === 'outside').map(item => item.parentId).filter(Boolean));
  return resolved.filter(item => !innerParents.has(item.id));
}
