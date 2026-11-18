const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function dimensionExtensionField(end) {
  return end === 'start' ? 'extensionBeyondStart' : 'extensionBeyondEnd';
}

/**
 * Reads an individual witness-leg length. Older drawings stored one shared
 * `extensionBeyond` value; it remains the fallback until a side is edited.
 */
export function dimensionExtensionValue(object, end) {
  return clamp(Number(object?.[dimensionExtensionField(end)] ?? object?.extensionBeyond ?? 2), 0.1, 50);
}

/**
 * Geometric description of one dimension witness leg. `base` is the point on
 * the dimension line (or angular dimension arc), `axis` points outwards along
 * that one leg, and `tip` is its current draggable endpoint.
 */
export function dimensionExtensionSpec(object, end) {
  if (!object || object.type !== 'dimension') return null;
  const kind = object.kind || 'linear';
  let base;
  let axis;

  if (kind === 'angular') {
    const vx = Number(object.x);
    const vy = Number(object.y);
    const firstAngle = Math.atan2(Number(object.y2) - vy, Number(object.x2) - vx);
    const secondAngle = Math.atan2(Number(object.y3) - vy, Number(object.x3) - vx);
    let delta = (secondAngle - firstAngle + Math.PI * 2) % (Math.PI * 2);
    let start = firstAngle;
    let finish = secondAngle;
    if (delta > Math.PI) {
      start = secondAngle;
      finish = firstAngle;
    }
    const angle = end === 'start' ? start : finish;
    const radius = clamp(Number(object.radius) || 12, 2, 1000);
    axis = { x: Math.cos(angle), y: Math.sin(angle) };
    base = { x: vx + axis.x * radius, y: vy + axis.y * radius };
  } else {
    const x1 = Number(object.x);
    const y1 = Number(object.y);
    const x2 = Number(object.x2);
    const y2 = Number(object.y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < 0.01) return null;

    const rawOffset = Number.isFinite(Number(object.offset)) ? Number(object.offset) : 10;
    const offset = (Math.sign(rawOffset) || 1) * Math.max(10, Math.abs(rawOffset));

    if (kind === 'horizontal') {
      const side = offset >= 0 ? 1 : -1;
      const dimY = (side > 0 ? Math.max(y1, y2) : Math.min(y1, y2)) + side * Math.abs(offset);
      base = { x: end === 'start' ? x1 : x2, y: dimY };
      axis = { x: 0, y: side };
    } else if (kind === 'vertical') {
      const side = offset >= 0 ? 1 : -1;
      const dimX = (side > 0 ? Math.max(x1, x2) : Math.min(x1, x2)) + side * Math.abs(offset);
      base = { x: dimX, y: end === 'start' ? y1 : y2 };
      axis = { x: side, y: 0 };
    } else {
      const ux = dx / length;
      const uy = dy / length;
      const nx = -uy;
      const ny = ux;
      const side = Math.sign(offset) || 1;
      base = {
        x: (end === 'start' ? x1 : x2) + nx * offset,
        y: (end === 'start' ? y1 : y2) + ny * offset,
      };
      axis = { x: nx * side, y: ny * side };
    }
  }

  const value = dimensionExtensionValue(object, end);
  return {
    base,
    axis,
    value,
    tip: { x: base.x + axis.x * value, y: base.y + axis.y * value },
    end,
  };
}

/** Projects a pointer onto one leg's outward axis; the other leg is untouched. */
export function dimensionExtensionLengthFromPoint(spec, point, min = 0.1, max = 50) {
  if (!spec || !point) return null;
  const projected = (Number(point.x) - spec.base.x) * spec.axis.x + (Number(point.y) - spec.base.y) * spec.axis.y;
  if (!Number.isFinite(projected)) return null;
  return clamp(projected, min, max);
}

/**
 * Drag one witness-leg endpoint relative to its pointer-down position.
 * Keeping the original value and pointer anchor avoids jumps when the user
 * grabs anywhere inside the visible handle, and allows both shortening and
 * lengthening without moving the opposite leg.
 */
export function dimensionExtensionFromDrag(spec, point, pointerStart, originalValue, min = 0.1, max = 50) {
  if (!spec || !point || !pointerStart) return null;
  const dx = Number(point.x) - Number(pointerStart.x);
  const dy = Number(point.y) - Number(pointerStart.y);
  const delta = dx * spec.axis.x + dy * spec.axis.y;
  if (!Number.isFinite(delta) || !Number.isFinite(Number(originalValue))) return null;
  return clamp(Number(originalValue) + delta, min, max);
}
export function dimensionExtensionGapField(end) {
  return end === 'start' ? 'extensionGapStart' : 'extensionGapEnd';
}

/** Reads the object-side start gap for one witness leg. */
export function dimensionExtensionGapValue(object, end) {
  return clamp(Number(object?.[dimensionExtensionGapField(end)] ?? object?.extensionGap ?? 1), 0, 50);
}

/**
 * Geometric description of the object-side endpoint of one witness leg.
 * The axis points from the measured feature toward the dimension line, so
 * dragging inward shortens the gap and dragging outward lengthens it.
 */
export function dimensionExtensionGapSpec(object, end) {
  if (!object || object.type !== 'dimension' || ['angular', 'radius', 'diameter'].includes(object.kind)) return null;
  const far = dimensionExtensionSpec(object, end);
  if (!far) return null;
  const origin = end === 'start'
    ? { x: Number(object.x), y: Number(object.y) }
    : { x: Number(object.x2), y: Number(object.y2) };
  const dx = far.base.x - origin.x;
  const dy = far.base.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 0.2) return null;
  const axis = { x: dx / distance, y: dy / distance };
  const max = Math.max(0, distance - 0.1);
  const value = clamp(dimensionExtensionGapValue(object, end), 0, max);
  return { origin, axis, distance, max, value, tip: { x: origin.x + axis.x * value, y: origin.y + axis.y * value }, end };
}

/** Projects the pointer onto the object-side gap axis for one witness leg. */
export function dimensionExtensionGapFromPoint(spec, point, min = 0, max = spec?.max ?? 50) {
  if (!spec || !point) return null;
  const projected = (Number(point.x) - spec.origin.x) * spec.axis.x + (Number(point.y) - spec.origin.y) * spec.axis.y;
  if (!Number.isFinite(projected)) return null;
  return clamp(projected, min, max);
}

/** Relative pointer drag for the object-side (front) end of one witness leg. */
export function dimensionExtensionGapFromDrag(spec, point, pointerStart, originalValue, min = 0, max = spec?.max ?? 50) {
  return dimensionExtensionFromDrag(spec, point, pointerStart, originalValue, min, max);
}

