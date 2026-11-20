import assert from 'node:assert/strict';
import { circleGeometryFromInputs, lineGeometryFromInputs, parsePointRows } from '../src/object-edit.mjs';

const c = { center: { x: 12, y: 18 }, r: 10 };
let next = circleGeometryFromInputs(c, { 'центрX': '15', 'центрY': '20', radius: '24', diameter: '20' });
assert.deepEqual(next, { center: { x: 15, y: 20 }, r: 24 }, 'circle inspector changes center and radius independently');
next = circleGeometryFromInputs(c, { 'центрX': '12', 'центрY': '18', radius: '10', diameter: '64' });
assert.equal(next.r, 32, 'circle inspector supports editing diameter as well as radius');
assert.throws(() => circleGeometryFromInputs(c, { 'центрX': '12', 'центрY': '18', radius: '0', diameter: '20' }), /Радиус/);

const line = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
next = lineGeometryFromInputs(line, { 'началоX': '0', 'началоY': '0', 'конецX': '10', 'конецY': '0', lineLength: '25', lineAngle: '90' });
assert.ok(Math.abs(next.b.x) < 1e-8 && Math.abs(next.b.y - 25) < 1e-8, 'line length and angle can be edited in place');
next = lineGeometryFromInputs(line, { 'началоX': '2', 'началоY': '3', 'конецX': '12', 'конецY': '3', lineLength: '10', lineAngle: '0' });
assert.deepEqual(next, { a: { x: 2, y: 3 }, b: { x: 12, y: 3 } }, 'line endpoints can be edited directly');
assert.deepEqual(parsePointRows('10; 20\n30; 40\n50; 60', 3), [{x:10,y:20},{x:30,y:40},{x:50,y:60}]);
assert.throws(() => parsePointRows('10; 20\ninvalid', 2), /корректные точки/);
console.log('object-edit: ok (circle radius/diameter, line dimensions, polyline vertices)');
