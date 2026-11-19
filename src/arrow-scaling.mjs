/**
 * Scale a one-ended arrow head with the stroke weight of its line.
 * The base dimensions are stored on the object so existing projects keep
 * their original arrow size until the user changes the line weight.
 */
export function scaledArrowHeadLength(lineWidth, baseWidth = 0.5, baseSize = 3.5) {
  const width = Number(lineWidth);
  const referenceWidth = Number(baseWidth);
  const referenceSize = Number(baseSize);
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0.5;
  const safeBaseWidth = Number.isFinite(referenceWidth) && referenceWidth > 0 ? referenceWidth : 0.5;
  const safeBaseSize = Number.isFinite(referenceSize) && referenceSize > 0 ? referenceSize : 3.5;
  // Keep the relationship proportional for the full supported line-weight range.
  return Math.min(30, Math.max(0.2, safeBaseSize * safeWidth / safeBaseWidth));
}
