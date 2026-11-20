/** Geometry edits shared by the inspector and automated tests. */
const finite = value => Number.isFinite(Number(value));
const num = value => finite(value) ? Number(value) : null;

export function circleGeometryFromInputs(circle, values = {}) {
  const cx = num(values['центрX']);
  const cy = num(values['центрY']);
  const radius = num(values.radius);
  const diameter = num(values.diameter);
  if (cx == null || cy == null) throw new Error('Координаты центра окружности должны быть числами.');

  let r = Number(circle.r);
  // Respect whichever measurement the user actually changed in the inspector.
  if (radius != null && Math.abs(radius - Number(circle.r)) > 1e-4) r = radius;
  else if (diameter != null && Math.abs(diameter - Number(circle.r) * 2) > 1e-4) r = diameter / 2;
  if (!Number.isFinite(r) || r <= 0) throw new Error('Радиус окружности должен быть больше нуля.');
  return { center: { x: cx, y: cy }, r };
}

export function parsePointRows(value, minimum = 2) {
  const rows = String(value ?? '').split(/\n+/).map(row => row.trim()).filter(Boolean);
  const points = rows.map(row => {
    const parts = row.split(/[;\s]+/);
    if (parts.length < 2) return null;
    const x = Number(parts[0].replace(',', '.'));
    const y = Number(parts[1].replace(',', '.'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  });
  if (points.length < minimum || points.some(point => !point)) {
    throw new Error(`Укажите минимум ${minimum} корректные точки в формате X; Y.`);
  }
  return points;
}

export function lineGeometryFromInputs(line, values = {}) {
  const read = key => num(values[key]);
  const a = { x: read('началоX'), y: read('началоY') };
  const b = { x: read('конецX'), y: read('конецY') };
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) throw new Error('Координаты концов линии должны быть числами.');
  const oldLength = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  const oldAngle = Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x);
  const length = read('lineLength');
  const angleDegrees = read('lineAngle');
  const endpointChanged = Math.hypot(a.x - line.a.x, a.y - line.a.y) > 1e-4 || Math.hypot(b.x - line.b.x, b.y - line.b.y) > 1e-4;
  const angle = angleDegrees == null ? null : angleDegrees * Math.PI / 180;
  const lengthAngleChanged = (length != null && Math.abs(length - oldLength) > 1e-4) || (angle != null && Math.abs(angle - oldAngle) > 1e-4);
  if (!endpointChanged && lengthAngleChanged) {
    if (!(length > 0) || angle == null) throw new Error('Длина должна быть больше нуля, а угол — числом.');
    b.x = a.x + length * Math.cos(angle);
    b.y = a.y + length * Math.sin(angle);
  }
  if (Math.hypot(b.x - a.x, b.y - a.y) < .05) throw new Error('Начало и конец линии должны быть различными.');
  return { a, b };
}
