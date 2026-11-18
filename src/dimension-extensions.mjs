const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function dimensionExtensionField(end) {
  return end === 'start' ? 'extensionBeyondStart' : 'extensionBeyondEnd';
}

/**
 * Reads an individual witness-leg length. Older drawings stored one shared
 * `extensionBeyond` value; it remains the fallback until a side is edited.
 */
export function dimensionExtensionValue(object, end) {
  const raw = Number(object?.[dimensionExtensionField(end)] ?? object?.extensionBeyond ?? 2);
  // A witness leg may be longer than any fixed drafting preset. Keep only a
  // non-negative finite value; the editor's viewport, not an arbitrary 50 mm
  // ceiling, determines how far it can be extended.
  return Number.isFinite(raw) ? Math.max(0, raw) : 2;
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
export function dimensionExtensionLengthFromPoint(spec, point, min = 0, max = Infinity) {
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
export function dimensionExtensionFromDrag(spec, point, pointerStart, originalValue, min = 0, max = Infinity) {
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
  const raw = Number(object?.[dimensionExtensionGapField(end)] ?? object?.extensionGap ?? 1);
  return Number.isFinite(raw) ? Math.max(0, raw) : 1;
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
export function dimensionExtensionGapFromPoint(spec, point, min = 0, max = spec?.max ?? Infinity) {
  if (!spec || !point) return null;
  const projected = (Number(point.x) - spec.origin.x) * spec.axis.x + (Number(point.y) - spec.origin.y) * spec.axis.y;
  if (!Number.isFinite(projected)) return null;
  return clamp(projected, min, max);
}

/** Relative pointer drag for the object-side (front) end of one witness leg. */
export function dimensionExtensionGapFromDrag(spec, point, pointerStart, originalValue, min = 0, max = spec?.max ?? Infinity) {
  return dimensionExtensionFromDrag(spec, point, pointerStart, originalValue, min, max);
}


/**
 * Resize a dimension annotation without introducing angular skew.
 * Generic scene resizing scales X and Y independently; doing that to a
 * diagonal dimension rotates its measured vector. Here the measured vector
 * keeps its original direction, while its length responds to the scale
 * projected along that vector. Offset and extension legs respond to the
 * perpendicular scale. Radial and angular dimensions use a uniform scale so
 * their rays and included angle remain unchanged.
 */
export function resizeDimensionPreservingOrientation(source, oldBounds, newBounds) {
  if (!source || source.type !== 'dimension' || !oldBounds || !newBounds) return null;

  const oldW = Math.max(0.2, Number(oldBounds.w) || 0.2);
  const oldH = Math.max(0.2, Number(oldBounds.h) || 0.2);
  const sx = Math.max(0.001, (Number(newBounds.w) || oldW) / oldW);
  const sy = Math.max(0.001, (Number(newBounds.h) || oldH) / oldH);
  const mapPoint = (x, y) => ({
    x: Number(newBounds.x) + (Number(x) - Number(oldBounds.x)) * sx,
    y: Number(newBounds.y) + (Number(y) - Number(oldBounds.y)) * sy,
  });
  const uniformScale = Math.sqrt(sx * sy);
  const o = { ...source };
  const kind = source.kind || 'linear';

  // Dimension text height and arrow size are drafting settings, not geometric
  // coordinates. Keep them fixed so a tall/narrow selection box cannot make
  // lettering or arrows explode in size.
  if (Number.isFinite(Number(source.labelDx))) o.labelDx = Number(source.labelDx) * sx;
  if (Number.isFinite(Number(source.labelDy))) o.labelDy = Number(source.labelDy) * sy;

  if (kind === 'angular') {
    const center = mapPoint(source.x, source.y);
    const scaleRay = (x, y) => ({
      x: center.x + (Number(x) - Number(source.x)) * uniformScale,
      y: center.y + (Number(y) - Number(source.y)) * uniformScale,
    });
    const first = scaleRay(source.x2, source.y2);
    const second = scaleRay(source.x3, source.y3);
    o.x = center.x; o.y = center.y;
    o.x2 = first.x; o.y2 = first.y;
    o.x3 = second.x; o.y3 = second.y;
    if (Number.isFinite(Number(source.radius))) o.radius = Number(source.radius) * uniformScale;
    return o;
  }

  if (kind === 'radius' || kind === 'diameter') {
    const center = mapPoint(source.x, source.y);
    o.x = center.x; o.y = center.y;
    o.x2 = center.x + (Number(source.x2) - Number(source.x)) * uniformScale;
    o.y2 = center.y + (Number(source.y2) - Number(source.y)) * uniformScale;
    return o;
  }

  const x1 = Number(source.x), y1 = Number(source.y);
  const x2 = Number(source.x2), y2 = Number(source.y2);
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-8) {
    const center = mapPoint(x1, y1);
    o.x = center.x; o.y = center.y;
    const fallback = mapPoint(x2, y2);
    o.x2 = fallback.x; o.y2 = fallback.y;
    return o;
  }

  const ux = dx / length, uy = dy / length;
  // Scale the dimension along its own axis, without rotating it.
  const alongScale = ux * ux * sx + uy * uy * sy;
  // Scale its offset and witness legs in the perpendicular direction.
  const normalScale = uy * uy * sx + ux * ux * sy;
  const nextCenter = mapPoint((x1 + x2) / 2, (y1 + y2) / 2);
  const nextLength = Math.max(0.2, length * alongScale);
  const halfX = ux * nextLength / 2;
  const halfY = uy * nextLength / 2;
  o.x = nextCenter.x - halfX;
  o.y = nextCenter.y - halfY;
  o.x2 = nextCenter.x + halfX;
  o.y2 = nextCenter.y + halfY;

  for (const field of ['offset', 'extensionBeyond', 'extensionBeyondStart', 'extensionBeyondEnd', 'extensionGap', 'extensionGapStart', 'extensionGapEnd']) {
    if (Number.isFinite(Number(source[field]))) o[field] = Number(source[field]) * normalScale;
  }
  return o;
}
