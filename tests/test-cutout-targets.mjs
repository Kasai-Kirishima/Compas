import assert from 'node:assert/strict';
import { resolveInsideOutCutTargets } from '../src/cutout-targets.mjs';

const outer = { id: 'outer', points: [
  { x: -60, y: -40 }, { x: 60, y: -40 }, { x: 60, y: 40 }, { x: -60, y: 40 },
] };
const hole = { id: 'hole', points: Array.from({ length: 180 }, (_, i) => ({
  x: 12 * Math.cos(i * Math.PI * 2 / 180), y: 12 * Math.sin(i * Math.PI * 2 / 180),
})) };
const nested = [outer, hole];

// No preselection: starting in the hole chooses the smallest nested contour,
// not the enclosing part outline. It is correctly classified as an inner void.
let targets = resolveInsideOutCutTargets(nested, { x: 0, y: 0 });
assert.equal(targets.length, 1);
assert.equal(targets[0].id, 'hole');
assert.equal(targets[0].side, 'outside');
assert.equal(targets[0].parentId, 'outer');

// No preselection, but the drag starts in solid material away from the hole:
// choose the outer profile and make a conventional inward notch with reversed drag.
targets = resolveInsideOutCutTargets(nested, { x: 35, y: 0 });
assert.equal(targets.length, 1);
assert.equal(targets[0].id, 'outer');
assert.equal(targets[0].side, 'inside');
assert.equal(targets[0].parentId, null);

// Explicitly selecting the inner contour has priority over automatic detection.
targets = resolveInsideOutCutTargets(nested, { x: 0, y: 0 }, ['hole']);
assert.equal(targets.length, 1);
assert.equal(targets[0].id, 'hole');
assert.equal(targets[0].side, 'outside');

// Explicitly selecting a contour forces the user-requested inner-boundary
// operation even when its enclosing outline is not separately modelled.
targets = resolveInsideOutCutTargets([{ ...hole, isInner: false }], { x: 0, y: 0 }, ['hole']);
assert.equal(targets.length, 1);
assert.equal(targets[0].id, 'hole');
assert.equal(targets[0].side, 'outside');

// An explicitly marked pocket remains an inner void even when its parent
// outline is not present in the current drawing.
targets = resolveInsideOutCutTargets([{ ...hole, isInner: true }], { x: 0, y: 0 });
assert.equal(targets.length, 1);
assert.equal(targets[0].side, 'outside');

// Starting outside every contour without a selection does not modify anything.
assert.deepEqual(resolveInsideOutCutTargets(nested, { x: 90, y: 0 }), []);

// When both the inner loop and its parent are explicitly selected, process the
// inner void only; do not generate a duplicate cut on the outer material edge.
targets = resolveInsideOutCutTargets(nested, { x: 0, y: 0 }, ['outer', 'hole']);
assert.equal(targets.length, 1);
assert.equal(targets[0].id, 'hole');
assert.equal(targets[0].side, 'outside');

console.log('Inside-out cut target resolution tests passed: auto-detect nested holes, auto-detect solid starts, explicit selection, and parent protection.');
