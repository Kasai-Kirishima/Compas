import assert from 'node:assert/strict';
import { cutClosedContourByStraightPass } from '../src/cutouts.mjs';

const circle = (cx, cy, r, count = 720) => Array.from({ length: count }, (_, i) => ({
  x: cx + r * Math.cos(i * Math.PI * 2 / count),
  y: cy + r * Math.sin(i * Math.PI * 2 / count),
}));
const area = points => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;
const edges = points => points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// One straight drag starts outside the large profile, crosses it completely,
// then enters the small profile only a short distance and stops inside it.
const start = { x: -60, y: 0 }, end = { x: 60, y: 0 }, width = 6;
const big = cutClosedContourByStraightPass(circle(0, 0, 40), start, end, width);
assert.equal(big.ok, true, big.reason);
assert.equal(big.operation, 'straight-pass-cut');
assert.equal(big.fragments.length, 2, 'The long pass completely separates the large circle into two parts');
assert.ok(big.metadata.removedArea > 450 && big.metadata.removedArea < 510);
for (const fragment of big.fragments) {
  assert.ok(fragment.length > 300, 'The circular arc remains smooth');
  const straightWalls = edges(fragment).filter(e => Math.abs(e.a.y - e.b.y) < 1e-7 && Math.abs(Math.abs(e.a.y) - width / 2) < 1e-7);
  assert.ok(straightWalls.length >= 1, 'Each half-circle includes an exact straight slot wall');
  for (const wall of straightWalls) near(Math.abs(wall.a.y), width / 2);
}

const small = cutClosedContourByStraightPass(circle(70, 0, 15), start, end, width);
assert.equal(small.ok, true, small.reason);
assert.equal(small.fragments.length, 1, 'The small circle is only entered, not fully cut through');
assert.equal(small.metadata.blindEnd, true);
const smallEdges = edges(small.fragments[0]);
const sideA = smallEdges.find(e => Math.abs(e.a.y - width / 2) < 1e-7 && Math.abs(e.b.y - width / 2) < 1e-7);
const sideB = smallEdges.find(e => Math.abs(e.a.y + width / 2) < 1e-7 && Math.abs(e.b.y + width / 2) < 1e-7);
const endCap = smallEdges.find(e => Math.abs(e.a.x - end.x) < 1e-7 && Math.abs(e.b.x - end.x) < 1e-7);
assert.ok(sideA && sideB, 'The blind slot has two perfectly straight and parallel side walls');
assert.ok(endCap, 'The small-circle blind entry has a straight end cap at the release point');
near(sideA.a.y, width / 2); near(sideA.b.y, width / 2);
near(sideB.a.y, -width / 2); near(sideB.b.y, -width / 2);
near(endCap.a.x, end.x); near(endCap.b.x, end.x);

// A full pass through the smaller circle creates two independent fragments.
const throughSmall = cutClosedContourByStraightPass(circle(70, 0, 15), start, { x: 100, y: 0 }, width);
assert.equal(throughSmall.ok, true, throughSmall.reason);
assert.equal(throughSmall.fragments.length, 2);

// A rectangular profile also gets a straight entry with exact-width parallel walls.
const rectangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
const rectCut = cutClosedContourByStraightPass(rectangle, { x: -20, y: 30 }, { x: 50, y: 30 }, 8);
assert.equal(rectCut.ok, true, rectCut.reason);
assert.equal(rectCut.fragments.length, 1);
assert.ok(rectCut.fragments[0].some(p => Math.abs(p.x - 50) < 1e-7 && Math.abs(p.y - 26) < 1e-7));
assert.ok(rectCut.fragments[0].some(p => Math.abs(p.x - 50) < 1e-7 && Math.abs(p.y - 34) < 1e-7));

// The cut direction can be angled: wall vectors remain parallel to the gesture.
const angleStart = { x: -30, y: -10 }, angleEnd = { x: 60, y: 50 }, angleWidth = 4;
const angled = cutClosedContourByStraightPass(circle(10, 20, 35), angleStart, angleEnd, angleWidth);
assert.equal(angled.ok, true, angled.reason);
const dx = angleEnd.x - angleStart.x, dy = angleEnd.y - angleStart.y;
const wall = angled.metadata.sideWalls[0], wallDx = wall.end.x - wall.start.x, wallDy = wall.end.y - wall.start.y;
near(dx * wallDy - dy * wallDx, 0, 1e-5);
near(Math.hypot(wallDx, wallDy), Math.hypot(dx, dy));

assert.equal(cutClosedContourByStraightPass(circle(0, 0, 20), { x: 0, y: 0 }, { x: 40, y: 0 }, 4).ok, false,
  'The pass must start outside the profile to avoid creating a hole instead of an open slot');
assert.equal(cutClosedContourByStraightPass(circle(0, 0, 20), { x: -40, y: 0 }, { x: -30, y: 0 }, 4).ok, false,
  'A pass which misses the contour is rejected');
assert.throws(() => cutClosedContourByStraightPass(rectangle, start, end, 0), RangeError);
assert.equal(cutClosedContourByStraightPass(rectangle, start, start, 4).ok, false);

console.log('Straight pass-cut tests passed: through-cut, blind entry, two-circle path, exact parallel walls, angled path, invalid start and miss handling.');
