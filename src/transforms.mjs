/** Geometry transforms for CAD entities. Coordinates are drawing millimetres. */
export function rotateGeometryObject(source, angleDegrees, pivot) {
  if (!source || !Number.isFinite(Number(angleDegrees)) || !pivot || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) {
    throw new TypeError('Для поворота нужны объект, угол и центр вращения.');
  }
  const object = structuredClone(source);
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
  for (const key of ['a', 'b', 'center']) {
    if (object[key]) object[key] = rotate(object[key]);
  }

  if (object.type === 'text') {
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
