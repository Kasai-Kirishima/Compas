import assert from 'node:assert/strict';
import {
  dimensionExtensionField,
  dimensionExtensionValue,
  dimensionExtensionSpec,
  dimensionExtensionLengthFromPoint,
  dimensionExtensionFromDrag,
  dimensionExtensionGapSpec,
  dimensionExtensionGapFromDrag,
} from '../src/dimension-extensions.mjs';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

// Legacy drawings with one shared length stay compatible until either side is edited.
const legacy = { type: 'dimension', kind: 'linear', x: 0, y: 0, x2: 20, y2: 0, offset: 10, extensionBeyond: 3 };
assert.equal(dimensionExtensionField('start'), 'extensionBeyondStart');
assert.equal(dimensionExtensionField('end'), 'extensionBeyondEnd');
assert.equal(dimensionExtensionValue(legacy, 'start'), 3);
assert.equal(dimensionExtensionValue(legacy, 'end'), 3);

// A horizontal dimension's first and second legs have distinct anchor points.
const horizontal = { ...legacy, kind: 'horizontal', y2: 20, extensionBeyondStart: 2, extensionBeyondEnd: 5 };
const hStart = dimensionExtensionSpec(horizontal, 'start');
const hEnd = dimensionExtensionSpec(horizontal, 'end');
near(hStart.tip.x, 0); near(hStart.tip.y, 32);
near(hEnd.tip.x, 20); near(hEnd.tip.y, 35);
near(dimensionExtensionLengthFromPoint(hStart, { x: 99, y: 41 }), 11); // projection ignores motion parallel to the dimension line
near(dimensionExtensionLengthFromPoint(hEnd, { x: 20, y: 38 }), 8);

// An aligned dimension follows its own normal at any angle.
const aligned = { type: 'dimension', kind: 'linear', x: 2, y: 3, x2: 12, y2: 13, offset: 10, extensionBeyond: 2 };
const aStart = dimensionExtensionSpec(aligned, 'start');
const aEnd = dimensionExtensionSpec(aligned, 'end');
near(Math.hypot(aStart.axis.x, aStart.axis.y), 1);
near(Math.hypot(aEnd.axis.x, aEnd.axis.y), 1);
near(aStart.tip.x - aStart.base.x, aStart.axis.x * 2);
near(aEnd.tip.y - aEnd.base.y, aEnd.axis.y * 2);
near(dimensionExtensionLengthFromPoint(aStart, { x: aStart.base.x + aStart.axis.x * 7, y: aStart.base.y + aStart.axis.y * 7 }), 7);

// Editing the first leg does not mutate or recalculate the second leg.
horizontal.extensionBeyondStart = 9;
assert.equal(dimensionExtensionValue(horizontal, 'start'), 9);
assert.equal(dimensionExtensionValue(horizontal, 'end'), 5);

// Vertical and angular dimensions expose correctly directed handles too.
const vertical = { ...legacy, kind: 'vertical', x2: 20, y2: 0, offset: -12 };
const vStart = dimensionExtensionSpec(vertical, 'start');
near(vStart.axis.x, -1); near(vStart.axis.y, 0);
const angular = { type: 'dimension', kind: 'angular', x: 0, y: 0, x2: 10, y2: 0, x3: 0, y3: 10, radius: 12, extensionBeyondStart: 1, extensionBeyondEnd: 4 };
const gStart = dimensionExtensionSpec(angular, 'start');
const gEnd = dimensionExtensionSpec(angular, 'end');
near(gStart.tip.x, 13); near(gStart.tip.y, 0);
near(gEnd.tip.x, 0); near(gEnd.tip.y, 16);

// Clamp very small / very large pointer projections to safe editing limits.
near(dimensionExtensionLengthFromPoint(hStart, { x: hStart.base.x, y: hStart.base.y }), 0.1);
near(dimensionExtensionLengthFromPoint(hStart, { x: hStart.base.x, y: hStart.base.y + 200 }), 50);


// Pointer-relative drag is stable when the handle is grabbed off-center and
// supports both directions from a 40 mm starting length without a jump.
const longLeg = { ...horizontal, extensionBeyondStart: 40, extensionBeyondEnd: 12 };
const longSpec = dimensionExtensionSpec(longLeg, 'start');
const grabbedOffCenter = { x: longSpec.tip.x + 0.25, y: longSpec.tip.y - 0.4 };
near(dimensionExtensionFromDrag(longSpec, grabbedOffCenter, grabbedOffCenter, 40, 0.1, 50), 40,
  1e-8);
near(dimensionExtensionFromDrag(longSpec,
  { x: grabbedOffCenter.x + longSpec.axis.x * 0.35, y: grabbedOffCenter.y + longSpec.axis.y * 0.35 },
  grabbedOffCenter, 40, 0.1, 50), 40.35);
near(dimensionExtensionFromDrag(longSpec,
  { x: grabbedOffCenter.x - longSpec.axis.x * 3, y: grabbedOffCenter.y - longSpec.axis.y * 3 },
  grabbedOffCenter, 40, 0.1, 50), 37);
assert.equal(longLeg.extensionBeyondEnd, 12, 'Dragging first leg must not alter the opposite leg');

// The object-side/front endpoint gets its own independent drag handle too.
const frontLeg = { ...horizontal, offset: 50, extensionGapStart: 40, extensionGapEnd: 5 };
const frontSpec = dimensionExtensionGapSpec(frontLeg, 'start');
assert.ok(frontSpec.max > 40, 'Front gap should permit 40 mm when the dimension line is far enough away');
const frontGrab = { x: frontSpec.tip.x - 0.2, y: frontSpec.tip.y + 0.25 };
near(dimensionExtensionGapFromDrag(frontSpec, frontGrab, frontGrab, 40, 0, frontSpec.max), 40);
near(dimensionExtensionGapFromDrag(frontSpec,
  { x: frontGrab.x - frontSpec.axis.x * 2.5, y: frontGrab.y - frontSpec.axis.y * 2.5 },
  frontGrab, 40, 0, frontSpec.max), 37.5);
near(dimensionExtensionGapFromDrag(frontSpec,
  { x: frontGrab.x + frontSpec.axis.x * 1.25, y: frontGrab.y + frontSpec.axis.y * 1.25 },
  frontGrab, 40, 0, frontSpec.max), 41.25);
assert.equal(frontLeg.extensionGapEnd, 5, 'Dragging the first front end must not alter the second front end');

console.log('Dimension extension geometry tests passed: independent front/far endpoints, relative drag, all dimension orientations and legacy compatibility.');
