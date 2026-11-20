/** Geometry transforms for CAD entities. Coordinates are drawing millimetres. */
import { boundsOfObject } from './geometry.mjs';

function materialize(source) {
  const object = structuredClone(source);
  const dx = Number(object.dx) || 0;
  const dy = Number(object.dy) || 0;
  if (dx || dy) {
    const move = p => p ? ({ x: p.x + dx, y: p.y + dy }) : p;
    if (object.points) object.points = object.points.map(move);
    for (const key of ['a', 'b', 'c', 'center']) if (object[key]) object[key] = move(object[key]);
    if (object.x != null) object.x += dx;
    if (object.y != null) object.y += dy;
  }
  object.dx = 0;
  object.dy = 0;
  return object;
}

export function rotateGeometryObject(source, angleDegrees, pivot) {
  if (!source || !Number.isFinite(Number(angleDegrees)) || !pivot || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) {
    throw new TypeError('Для поворота нужны объект, угол и центр вращения.');
  }
  const object = materialize(source);
  const radians = Number(angleDegrees) * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const rotate = point => ({
    x: pivot.x + (point.x - pivot.x) * cos - (point.y - pivot.y) * sin,
    y: pivot.y + (point.x - pivot.x) * sin + (point.y - pivot.y) * cos,
  });

  if (object.type === 'rect' || object.type === 'roundRect') {
    const corners = [
      { x: object.x, y: object.y },
      { x: object.x + object.w, y: object.y },
      { x: object.x + object.w, y: object.y + object.h },
      { x: object.x, y: object.y + object.h },
    ].map(rotate);
    object.type = 'polygon';
    object.points = corners;
    delete object.x; delete object.y; delete object.w; delete object.h; delete object.rx;
    object.rotation = (Number(object.rotation) || 0) + Number(angleDegrees);
    return object;
  }

  if (object.points) object.points = object.points.map(rotate);
  for (const key of ['a', 'b', 'c', 'center']) if (object[key]) object[key] = rotate(object[key]);
  if (object.type === 'text' && object.x != null && object.y != null) {
    const anchor = rotate({ x: object.x, y: object.y });
    object.x = anchor.x; object.y = anchor.y;
  } else if (object.type === 'reference') {
    const center = rotate({ x: object.x + object.w / 2, y: object.y + object.h / 2 });
    object.x = center.x - object.w / 2;
    object.y = center.y - object.h / 2;
  } else if (object.type === 'arc') {
    object.startAngle = (Number(object.startAngle) || 0) + Number(angleDegrees);
    object.endAngle = (Number(object.endAngle) || 0) + Number(angleDegrees);
  } else if (object.type === 'hatch') {
    object.angle = (Number(object.angle) || 45) + Number(angleDegrees);
  }
  object.rotation = (Number(object.rotation) || 0) + Number(angleDegrees);
  return object;
}

/**
 * Scale a CAD object around a drawing-space pivot. Scale factors are independent
 * in X/Y; callers keep circles/arcs/text/references uniform where appropriate.
 * Object offsets are baked so dragging and scaling use the same coordinates.
 */
export function scaleGeometryObject(source, scaleX, scaleY = scaleX, pivot = null) {
  const sx = Number(scaleX), sy = Number(scaleY);
  if (!source || !Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) {
    throw new TypeError('Масштаб объекта должен быть положительным числом.');
  }
  const object = materialize(source);
  const bounds = boundsOfObject(object);
  const center = pivot || { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) throw new TypeError('Не удалось определить центр масштабирования.');
  const map = p => ({ x: center.x + (p.x - center.x) * sx, y: center.y + (p.y - center.y) * sy });
  if (object.points) object.points = object.points.map(map);
  for (const key of ['a', 'b', 'c', 'center']) if (object[key]) object[key] = map(object[key]);
  if (object.x != null && object.y != null) {
    const p = map({ x: object.x, y: object.y });
    object.x = p.x; object.y = p.y;
    if (object.w != null) object.w *= sx;
    if (object.h != null) object.h *= sy;
  }
  const uniform = Math.sqrt(sx * sy);
  if (object.r != null) object.r *= uniform;
  if (object.rx != null) object.rx *= sx;
  if (object.ry != null) object.ry *= sy;
  if (object.type === 'arc') object.r *= uniform;
  if (object.type === 'text' && object.size != null) object.size *= uniform;
  for (const key of ['textSize', 'arrowSize', 'offset', 'spacing']) {
    if (object[key] != null) object[key] *= uniform;
  }
  if (object.type === 'rect' && object.rx != null) object.rx *= uniform;
  if (object.type === 'reference' && object.aspectRatio == null && object.h) object.aspectRatio = object.w / object.h;
  object.dx = 0; object.dy = 0;
  return object;
}

/** Resize an object to a target axis-aligned box while preserving circles and, optionally, references. */
export function scaleObjectToBounds(source, targetBounds, options = {}) {
  const object = materialize(source);
  const current = boundsOfObject(object);
  const x = Number(targetBounds?.x), y = Number(targetBounds?.y);
  const width = Number(targetBounds?.w), height = Number(targetBounds?.h);
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) {
    throw new TypeError('Новые координаты и размеры объекта должны быть корректными числами.');
  }
  let sx = current.w > 1e-8 ? width / current.w : 1;
  let sy = current.h > 1e-8 ? height / current.h : 1;
  const widthChanged = Math.abs(width - current.w) > 1e-4;
  const heightChanged = Math.abs(height - current.h) > 1e-4;
  if (object.type === 'circle') {
    const factor = widthChanged && !heightChanged ? sx : heightChanged && !widthChanged ? sy : Math.max(sx, sy);
    sx = factor; sy = factor;
  } else if (object.type === 'reference' && options.keepAspect !== false) {
    const factor = widthChanged && !heightChanged ? sx : heightChanged && !widthChanged ? sy : Math.max(sx, sy);
    sx = factor; sy = factor;
  }
  const scaled = scaleGeometryObject(object, sx, sy, { x: current.x, y: current.y });
  const after = boundsOfObject(scaled);
  const dx = x - after.x, dy = y - after.y;
  const move = p => p ? ({ x: p.x + dx, y: p.y + dy }) : p;
  if (scaled.points) scaled.points = scaled.points.map(move);
  for (const key of ['a', 'b', 'c', 'center']) if (scaled[key]) scaled[key] = move(scaled[key]);
  if (scaled.x != null) scaled.x += dx;
  if (scaled.y != null) scaled.y += dy;
  scaled.dx = 0; scaled.dy = 0;
  return scaled;
}
