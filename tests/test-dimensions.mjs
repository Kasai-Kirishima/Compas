import assert from 'node:assert/strict';
import { getDimensionGeometry, getDimensionLabelLayout, getDimensionArrowPlacement, getDimensionLabelText, isDimensionObject } from '../src/dimensions.mjs';

const horizontal = { type: 'dimension', kind: 'dimH', a: { x: 10, y: 10 }, b: { x: 40, y: 10 }, offset: 4 };
const horizontalGeometry = getDimensionGeometry(horizontal);
assert.deepEqual(horizontalGeometry.p1, { x: 10, y: 14 });
assert.deepEqual(horizontalGeometry.p2, { x: 40, y: 14 });
assert.deepEqual(horizontalGeometry.axis, { x: 1, y: 0 });

const diameter = { type: 'dimension', kind: 'dimDia', a: { x: 20, y: 20 }, b: { x: 30, y: 20 }, arrowSize: 2.5 };
const diameterGeometry = getDimensionGeometry(diameter);
assert.deepEqual(diameterGeometry.p1, { x: 10, y: 20 });
assert.deepEqual(diameterGeometry.p2, { x: 30, y: 20 });
assert.equal(getDimensionLabelText(diameter, diameterGeometry), '⌀20');
assert.equal(getDimensionArrowPlacement({ ...diameter, arrowPlacement: 'outside' }, diameterGeometry), 'outside');
assert.equal(getDimensionArrowPlacement({ ...diameter, arrowPlacement: 'inside' }, diameterGeometry), 'inside');

const shortDiameter = { ...diameter, a: { x: 20, y: 20 }, b: { x: 21, y: 20 } };
assert.equal(getDimensionArrowPlacement(shortDiameter), 'outside', 'automatic arrow placement moves arrows outward when the number cannot fit');

const label = getDimensionLabelLayout({ ...horizontal, textSize: 5, labelDx: 3, labelDy: -2, labelRotation: 27, textOrientation: 'aligned' }, horizontalGeometry);
assert.equal(label.textSize, 5);
assert.equal(label.x, 28);
assert.equal(label.y, 10.8);
assert.ok(Math.abs(label.rotation - 27) < 1e-9);
assert.ok(label.width > 0);
assert.equal(isDimensionObject(horizontal), true);
assert.equal(isDimensionObject({ type: 'line' }), false);
console.log('dimensions: axis geometry, independent number layout, diameter arrows inside/outside and automatic placement: ok');
