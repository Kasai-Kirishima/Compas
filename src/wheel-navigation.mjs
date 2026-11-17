/**
 * Normalize wheel deltas across mouse wheels, precision trackpads and legacy events.
 * deltaMode: 0 = pixels, 1 = lines, 2 = pages.
 */
export function normalizeWheelDeltas(event, viewport = {}) {
  let deltaX = Number.isFinite(Number(event?.deltaX)) ? Number(event.deltaX) : 0;
  let deltaY = Number.isFinite(Number(event?.deltaY)) ? Number(event.deltaY) : 0;
  const mode = Number(event?.deltaMode) || 0;

  if (mode === 1) {
    deltaX *= 16;
    deltaY *= 16;
  } else if (mode === 2) {
    deltaX *= Math.max(1, Number(viewport.width) || 1);
    deltaY *= Math.max(1, Number(viewport.height) || 1);
  }

  // Older browsers and a few pointing-device drivers expose only wheelDelta.
  if (deltaX === 0 && Number.isFinite(Number(event?.wheelDeltaX))) deltaX = -Number(event.wheelDeltaX);
  if (deltaY === 0 && Number.isFinite(Number(event?.wheelDeltaY))) deltaY = -Number(event.wheelDeltaY);
  if (deltaX === 0 && deltaY === 0 && Number.isFinite(Number(event?.wheelDelta))) deltaY = -Number(event.wheelDelta);

  return { deltaX, deltaY };
}

/**
 * Smooth zoom multiplier: a conventional 120-unit wheel notch changes scale
 * by approximately 15%, while trackpad deltas remain proportional and smooth.
 * Negative deltaY is the conventional wheel-up direction (zoom in).
 */
export function wheelZoomFactor(deltaY) {
  const delta = Number(deltaY);
  if (!Number.isFinite(delta) || delta === 0) return 1;
  return Math.exp(-delta * 0.0012);
}
