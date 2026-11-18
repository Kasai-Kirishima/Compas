import assert from 'node:assert/strict';
import { resizeDimensionPreservingOrientation } from '../src/dimension-extensions.mjs';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const sameDirection = (a, b, c, d) => {
  const cross = a * d - b * c;
  near(cross, 0, 1e-7);
  assert.ok(a * c + b * d > 0, 'Resize must not reverse the dimension direction');
};

// A diagonal linear dimension resized with a strongly different X/Y ratio
// must keep its exact original angle rather than leaning toward either axis.
const diagonal = {
  id: 'diag', type: 'dimension', kind: 'linear',
  x: 10, y: 10, x2: 40, y2: 50, offset: 12,
  textSize: 5, arrowSize: 3.5,
  extensionBeyondStart: 2, extensionBeyondEnd: 4,
  extensionGapStart: 1, extensionGapEnd: 1.5,
};
const oldBox = { x: 10, y: 10, w: 30, h: 40 };
const newBox = { x: 5, y: 7, w: 90, h: 12 };
const resized = resizeDimensionPreservingOrientation(diagonal, oldBox, newBox);
sameDirection(diagonal.x2 - diagonal.x, diagonal.y2 - diagonal.y,
  resized.x2 - resized.x, resized.y2 - resized.y);
near((resized.x + resized.x2) / 2, newBox.x + newBox.w / 2);
near((resized.y + resized.y2) / 2, newBox.y + newBox.h / 2);
assert.equal(resized.textSize, diagonal.textSize, 'Text height must not explode during dimension stretch');
assert.equal(resized.arrowSize, diagonal.arrowSize, 'Arrow size must remain a drafting setting');
assert.notEqual(resized.offset, diagonal.offset, 'Witness-line offset should follow the normal resize scale');

// Horizontal and vertical measurements retain their exact orientation even
// when the opposite bbox axis is stretched by a very large amount.
const horizontal = resizeDimensionPreservingOrientation(
  { type: 'dimension', kind: 'horizontal', x: 0, y: 20, x2: 50, y2: 20, offset: 10 },
  { x: 0, y: 20, w: 50, h: 0.2 },
  { x: 0, y: -5, w: 85, h: 60 },
);
near(horizontal.y2 - horizontal.y, 0);
assert.ok(horizontal.x2 > horizontal.x);
const vertical = resizeDimensionPreservingOrientation(
  { type: 'dimension', kind: 'vertical', x: 20, y: 0, x2: 20, y2: 50, offset: 10 },
  { x: 20, y: 0, w: 0.2, h: 50 },
  { x: -10, y: 0, w: 80, h: 90 },
);
near(vertical.x2 - vertical.x, 0);
assert.ok(vertical.y2 > vertical.y);

// Radial dimensions and both rays of angular dimensions preserve their
// direction/angle under non-uniform selection-box stretching.
for (const kind of ['radius', 'diameter']) {
  const result = resizeDimensionPreservingOrientation(
    { type: 'dimension', kind, x: 10, y: 20, x2: 30, y2: 40 },
    { x: 10, y: 20, w: 20, h: 20 },
    { x: 0, y: 0, w: 100, h: 20 },
  );
  sameDirection(20, 20, result.x2 - result.x, result.y2 - result.y);
}
const angular = resizeDimensionPreservingOrientation(
  { type: 'dimension', kind: 'angular', x: 10, y: 10, x2: 20, y2: 10, x3: 10, y3: 20, radius: 12 },
  { x: 10, y: 10, w: 10, h: 10 },
  { x: 0, y: 0, w: 80, h: 20 },
);
const oldAngle = Math.atan2(10, 0) - Math.atan2(0, 10);
const newAngle = Math.atan2(angular.y3 - angular.y, angular.x3 - angular.x) - Math.atan2(angular.y2 - angular.y, angular.x2 - angular.x);
near(Math.sin(oldAngle), Math.sin(newAngle));
near(Math.cos(oldAngle), Math.cos(newAngle));

console.log('Dimension resize orientation tests passed: horizontal, vertical, diagonal, radial and angular dimensions preserve direction.');
