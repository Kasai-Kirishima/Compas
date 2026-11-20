/** Viewport math for the 2D drawing canvas. Coordinates are in drawing units. */
export function zoomView(view, factor, anchor = { x: 0.5, y: 0.5 }, limits = {}) {
  const minWidth = Number.isFinite(limits.minWidth) ? limits.minWidth : 1;
  const maxWidth = Number.isFinite(limits.maxWidth) ? limits.maxWidth : 100000;
  const fx = Math.max(0, Math.min(1, Number(anchor.x) || 0));
  const fy = Math.max(0, Math.min(1, Number(anchor.y) || 0));
  const oldWidth = Math.max(1e-9, view.width);
  const oldHeight = Math.max(1e-9, view.height);
  const nextWidth = Math.max(minWidth, Math.min(maxWidth, oldWidth / factor));
  const nextHeight = nextWidth * oldHeight / oldWidth;
  const atX = view.x + oldWidth * fx;
  const atY = view.y + oldHeight * fy;
  return {
    x: atX - nextWidth * fx,
    y: atY - nextHeight * fy,
    width: nextWidth,
    height: nextHeight,
  };
}

/** Dragging the pointer right/down moves the drawing with it. */
export function panView(view, deltaX, deltaY, viewportWidth, viewportHeight) {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const viewWidth = view.width ?? view.w;
  const viewHeight = view.height ?? view.h;
  return {
    x: view.x - (deltaX / width) * viewWidth,
    y: view.y - (deltaY / height) * viewHeight,
    width: viewWidth,
    height: viewHeight,
  };
}

export function wheelZoomFactor(deltaY, deltaMode = 0, ctrlKey = false, viewportHeight = 800) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, viewportHeight) : 1;
  const multiplier = ctrlKey ? 0.0032 : 0.0016;
  return Math.exp(-deltaY * unit * multiplier);
}
