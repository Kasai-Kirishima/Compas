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
