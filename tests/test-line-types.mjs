import assert from 'node:assert/strict';
import {
  GOST_LINE_PATTERNS,
  normalizeCenterlineDash,
  isGostDashDotPattern
} from '../src/line-types.mjs';

assert.equal(GOST_LINE_PATTERNS.dashDotThin, '5 3 0.1 3');
assert.equal(GOST_LINE_PATTERNS.dashDotThinLong, '8 3 0.1 3');
assert.equal(GOST_LINE_PATTERNS.dashDotTwoDots, '5 4 0.1 4 0.1 4');
assert.equal(normalizeCenterlineDash(''), GOST_LINE_PATTERNS.dashDotThin);
assert.equal(normalizeCenterlineDash('12 3 1 3'), GOST_LINE_PATTERNS.dashDotThin);
assert.equal(normalizeCenterlineDash('24 3 1 3'), GOST_LINE_PATTERNS.dashDotThinLong);
assert.equal(normalizeCenterlineDash('24 3 1 3 1 3'), GOST_LINE_PATTERNS.dashDotTwoDots);
assert.equal(normalizeCenterlineDash('7 4 0.2 4'), '7 4 0.2 4', 'custom user pattern is preserved');
assert.equal(isGostDashDotPattern('12 3 1 3'), true);
assert.equal(isGostDashDotPattern('5 3 0.1 3'), true);
assert.equal(isGostDashDotPattern('6 2'), false);

// GOST thin dash-dot lower-bound choice: long stroke 5 mm and gaps 3 mm.
const [dash, gap1, dot, gap2] = GOST_LINE_PATTERNS.dashDotThin.split(/\s+/).map(Number);
assert(dash >= 5 && dash <= 30);
assert(gap1 >= 3 && gap1 <= 5);
assert(gap2 >= 3 && gap2 <= 5);
assert(dot < 0.25, 'round-cap dash should read as a point, not a second long dash');
console.log('Line pattern tests passed');
