/** Shared geometry and label helpers for editable CAD dimensions. */

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const point = (p) => ({ x: finite(p?.x), y: finite(p?.y) });
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function dimensionKind(object = {}) {
  return object.kind || object.type || 'dimension';
}

export function isDimensionObject(object) {
  return !!object && (object.type === 'dimension' || String(object.type || '').startsWith('dim'));
}

/** Return the actual dimension-line endpoints, direction and extension-line anchors. */
export function getDimensionGeometry(object = {}) {
  const a = point(object.a), b = point(object.b);
  const kind = dimensionKind(object);
  const dx = b.x - a.x, dy = b.y - a.y;
  const measuredLength = Math.hypot(dx, dy) || 1;
  const ux = dx / measuredLength, uy = dy / measuredLength;
  const offset = finite(object.offset, 2);
  let p1 = { ...a }, p2 = { ...b };

  if (kind === 'dimDia' || kind === 'diameter') {
    // The picked point is one end of a radius; extend the dimension through the centre.
    p1 = { x: a.x - dx, y: a.y - dy };
    p2 = { ...b };
  } else if (kind === 'dimH') {
    p1.y += offset;
    p2.y += offset;
  } else if (kind === 'dimV') {
    p1.x += offset;
    p2.x += offset;
  } else if (kind !== 'dimRad') {
    p1.x += -dy / measuredLength * offset;
    p1.y += dx / measuredLength * offset;
    p2.x += -dy / measuredLength * offset;
    p2.y += dx / measuredLength * offset;
  }

  const actualLength = length(p1, p2) || measuredLength;
  const axis = { x: (p2.x - p1.x) / actualLength, y: (p2.y - p1.y) / actualLength };
  const normal = { x: -axis.y, y: axis.x };
  return {
    kind, a, b, p1, p2, axis, normal,
    length: actualLength,
    midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    sourceLength: measuredLength,
  };
}

export function getDimensionLabelText(object = {}, geometry = getDimensionGeometry(object)) {
  if (object.label != null && String(object.label).trim() !== '') return String(object.label);
  if (geometry.kind === 'dimDia' || geometry.kind === 'diameter') return `⌀${formatDimensionValue(geometry.sourceLength * 2)}`;
  if (geometry.kind === 'dimRad') return `R${formatDimensionValue(geometry.sourceLength)}`;
  return formatDimensionValue(geometry.sourceLength);
}

function formatDimensionValue(value) {
  return Number(value).toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

/** Text anchor and rotation are intentionally independent of the dimension geometry. */
export function getDimensionLabelLayout(object = {}, geometry = getDimensionGeometry(object)) {
  const textSize = Math.max(.5, finite(object.textSize, 2.5));
  const text = getDimensionLabelText(object, geometry);
  const width = Math.max(textSize * .9, text.length * textSize * .62);
  const x = geometry.midpoint.x + finite(object.labelDx);
  const y = geometry.midpoint.y - 1.2 + finite(object.labelDy);
  let baseRotation = object.textOrientation === 'aligned'
    ? Math.atan2(geometry.axis.y, geometry.axis.x) * 180 / Math.PI
    : 0;
  // Keep aligned dimension text readable rather than upside down.
  if (baseRotation > 90 && baseRotation < 270) baseRotation -= 180;
  if (baseRotation < -90 && baseRotation > -270) baseRotation += 180;
  const rotation = baseRotation + finite(object.labelRotation);
  return { x, y, text, textSize, width, height: textSize * 1.45, rotation, baseRotation };
}

/** Decide where arrowheads go when the setting is automatic. */
export function getDimensionArrowPlacement(object = {}, geometry = getDimensionGeometry(object), label = getDimensionLabelLayout(object, geometry)) {
  const explicit = object.arrowPlacement;
  if (explicit === 'inside' || explicit === 'outside') return explicit;
  if (object.arrowPlacement === 'outside' || object.arrowPlacement === 'inside') return object.arrowPlacement;
  const hasValue = object.showValue !== false;
  const required = (hasValue ? label.width + 1.5 : 0) + Math.max(.5, finite(object.arrowSize, 2.5)) * 2 + 1;
  return geometry.length >= required ? 'inside' : 'outside';
}
