import assert from 'node:assert/strict';
import { cutClosedContourByStraightPass, cutOpenPathByStraightPass } from '../src/cutouts.mjs';

const circle = (cx, cy, r, count = 720) => Array.from({ length: count }, (_, i) => ({
  x: cx + r * Math.cos(i * Math.PI * 2 / count),
  y: cy + r * Math.sin(i * Math.PI * 2 / count),
}));
const area = points => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;
const edges = points => points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
const openEdges = points => points.slice(1).map((b, i) => ({ a: points[i], b }));
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

// The new no-bottom-wall mode keeps the two exact parallel pass walls but
// removes the transverse end cap when the drag stops inside the smaller circle.
const blindNoBottom = cutClosedContourByStraightPass(circle(70, 0, 15), start, end, width, { mode: 'noBottom' });
assert.equal(blindNoBottom.ok, true, blindNoBottom.reason);
assert.equal(blindNoBottom.fragments.length, 0, 'A blind no-bottom cut is stored as an open editable contour');
assert.equal(blindNoBottom.openFragments.length, 1);
assert.equal(blindNoBottom.metadata.bottomWallRemoved, true);
const noBottomEdges = openEdges(blindNoBottom.openFragments[0]);
assert.ok(noBottomEdges.some(e => Math.abs(e.a.y - width / 2) < 1e-7 && Math.abs(e.b.y - width / 2) < 1e-7), 'The upper straight side wall remains');
assert.ok(noBottomEdges.some(e => Math.abs(e.a.y + width / 2) < 1e-7 && Math.abs(e.b.y + width / 2) < 1e-7), 'The lower straight side wall remains');
assert.equal(noBottomEdges.some(e => Math.abs(e.a.x - end.x) < 1e-7 && Math.abs(e.b.x - end.x) < 1e-7), false, 'The blind end cap is omitted');
for (const wallEdge of noBottomEdges.filter(e => Math.abs(e.a.y - e.b.y) < 1e-7 && Math.abs(Math.abs(e.a.y) - width / 2) < 1e-7)) {
  near(wallEdge.a.y, wallEdge.b.y, 1e-9);
}

// Repeatability regression: a blind no-bottom pass converts the small circle
// into an open editable contour. A second and third pass must still be able to
// cut that very same result; there is no one-cut-per-object guard.
const repeatSecond = cutOpenPathByStraightPass(blindNoBottom.openFragments[0],
  { x: 70, y: -30 }, { x: 70, y: 30 }, 3);
assert.equal(repeatSecond.ok, true, repeatSecond.reason);
assert.ok(repeatSecond.fragments.length >= 2, 'A second pass splits the existing open contour into new editable fragments');
assert.ok(repeatSecond.metadata.removedLength > 0, 'The second pass removes a measurable path length');
const secondPiece = repeatSecond.fragments[Math.floor(repeatSecond.fragments.length / 2)];
const bounds = secondPiece.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
const thirdCenter = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
const repeatThird = cutOpenPathByStraightPass(secondPiece,
  { x: thirdCenter.x - 30, y: thirdCenter.y - 30 },
  { x: thirdCenter.x + 30, y: thirdCenter.y + 30 }, 2);
assert.equal(repeatThird.ok, true, repeatThird.reason);
assert.ok(repeatThird.fragments.length >= 1, 'A third pass can be applied to a fragment created by the second pass');

// Editor-style repeat on a previous no-bottom cut must rebuild real side-wall
// geometry, not merely delete more points from the open path.
const repeatedThroughWithWalls = cutOpenPathByStraightPass(blindNoBottom.openFragments[0],
  { x: 70, y: -30 }, { x: 70, y: 30 }, 3,
  { mode: 'noBottom', reconstructContour: true });
assert.equal(repeatedThroughWithWalls.ok, true, repeatedThroughWithWalls.reason);
assert.equal(repeatedThroughWithWalls.operation, 'repeatable-straight-pass-cut-open-contour');
assert.equal(repeatedThroughWithWalls.fragments.length, 2, 'Repeated through-cut returns two editable closed parts');
assert.equal(repeatedThroughWithWalls.metadata.wallsRebuilt, true);
for (const [sideIndex, expectedX] of [68.5, 71.5].entries()) {
  const sideExists = repeatedThroughWithWalls.fragments.some(fragment => fragment.some((a, i) => {
    const b = fragment[(i + 1) % fragment.length];
    return Math.abs(a.x - expectedX) < 1e-6 && Math.abs(b.x - expectedX) < 1e-6 && Math.abs(a.y - b.y) > 1e-5;
  }));
  assert.equal(sideExists, true, `Repeated no-bottom pass creates side wall ${sideIndex + 1}`);
}

// A second blind pass also adds both parallel walls but omits its end cap.
const repeatedBlindWithWalls = cutOpenPathByStraightPass(blindNoBottom.openFragments[0],
  { x: 40, y: 0 }, { x: 70, y: 0 }, 3,
  { mode: 'noBottom', reconstructContour: true });
assert.equal(repeatedBlindWithWalls.ok, true, repeatedBlindWithWalls.reason);
assert.equal(repeatedBlindWithWalls.openFragments.length, 1);
assert.equal(repeatedBlindWithWalls.metadata.wallsRebuilt, true);
assert.equal(repeatedBlindWithWalls.metadata.bottomWallRemoved, true);
const repeatedBlindEdges = openEdges(repeatedBlindWithWalls.openFragments[0]);
for (const y of [1.5, -1.5]) {
  assert.ok(repeatedBlindEdges.some(e => Math.abs(e.a.y - y) < 1e-6 && Math.abs(e.b.y - y) < 1e-6 && Math.abs(e.a.x - e.b.x) > 1),
    `Repeated blind no-bottom pass creates a straight wall at y=${y}`);
}
assert.equal(repeatedBlindEdges.some(e => Math.abs(e.a.x - 70) < 1e-6 && Math.abs(e.b.x - 70) < 1e-6), false,
  'Repeated no-bottom pass omits the lower/end connecting wall');

// A third pass on the second pass result also rebuilds a fresh pair of walls.
const repeatedThirdWithWalls = cutOpenPathByStraightPass(repeatedBlindWithWalls.openFragments[0],
  { x: 80, y: -30 }, { x: 80, y: 30 }, 2,
  { mode: 'noBottom', reconstructContour: true });
assert.equal(repeatedThirdWithWalls.ok, true, repeatedThirdWithWalls.reason);
assert.equal(repeatedThirdWithWalls.fragments.length, 2);
assert.equal(repeatedThirdWithWalls.metadata.wallsRebuilt, true);
for (const x of [79, 81]) {
  assert.ok(repeatedThirdWithWalls.fragments.some(fragment => fragment.some((a, i) => {
    const b = fragment[(i + 1) % fragment.length];
    return Math.abs(a.x - x) < 1e-6 && Math.abs(b.x - x) < 1e-6 && Math.abs(a.y - b.y) > 1e-5;
  })), `Third pass creates a new straight wall at x=${x}`);
}

// Repeating in no-walls mode still deliberately removes all newly generated
// cutter walls; the selected mode controls every pass, including repeats.
const repeatedWithoutWalls = cutOpenPathByStraightPass(blindNoBottom.openFragments[0],
  { x: 70, y: -30 }, { x: 70, y: 30 }, 3,
  { mode: 'noWalls', reconstructContour: true });
assert.equal(repeatedWithoutWalls.ok, true, repeatedWithoutWalls.reason);
assert.equal(repeatedWithoutWalls.metadata.wallsRebuilt, false);
assert.equal(repeatedWithoutWalls.openFragments.length, 2);
assert.equal(repeatedWithoutWalls.openFragments.some(fragment => fragment.slice(1).some((b, i) => {
  const a = fragment[i]; return Math.abs(a.x - b.x) < 1e-6 && [68.5,71.5].some(x => Math.abs(a.x-x)<1e-6);
})), false, 'Repeated no-walls pass does not add side lines');

// A fully traversed profile stays split into closed pieces in no-bottom mode:
// there is no blind end cap to remove, and the straight side walls remain.
const throughNoBottom = cutClosedContourByStraightPass(circle(0, 0, 40), start, end, width, { mode: 'noBottom' });
assert.equal(throughNoBottom.ok, true, throughNoBottom.reason);
assert.equal(throughNoBottom.fragments.length, 2);
assert.equal(throughNoBottom.openFragments.length, 0);

// No-walls mode removes the newly generated longitudinal walls (and cap),
// leaving only the original boundary pieces as open editable paths.
const blindNoWalls = cutClosedContourByStraightPass(circle(70, 0, 15), start, end, width, { mode: 'noWalls' });
assert.equal(blindNoWalls.ok, true, blindNoWalls.reason);
assert.equal(blindNoWalls.fragments.length, 0);
assert.equal(blindNoWalls.openFragments.length, 1);
assert.equal(blindNoWalls.metadata.sideWallsRemoved, true);
const noWallEdges = openEdges(blindNoWalls.openFragments[0]);
assert.equal(noWallEdges.some(e => Math.abs(e.a.y - e.b.y) < 1e-7 && Math.abs(Math.abs(e.a.y) - width / 2) < 1e-7), false,
  'No-walls mode must not add either straight side wall');
// The open result from no-walls mode is repeatable as well.
const repeatNoWalls = cutOpenPathByStraightPass(blindNoWalls.openFragments[0],
  { x: 70, y: -30 }, { x: 70, y: 30 }, 3);
assert.equal(repeatNoWalls.ok, true, repeatNoWalls.reason);
const throughNoWalls = cutClosedContourByStraightPass(circle(0, 0, 40), start, end, width, { mode: 'noWalls' });
assert.equal(throughNoWalls.ok, true, throughNoWalls.reason);
assert.equal(throughNoWalls.fragments.length, 0);
assert.equal(throughNoWalls.openFragments.length, 2, 'A through cut without walls leaves two open boundary arcs');
assert.throws(() => cutClosedContourByStraightPass(circle(0, 0, 10), start, end, width, { mode: 'unknown' }), RangeError);

// Arbitrary-angle / bidirectional regression: rotate the same two-circle
// operation around the origin, preserving one constant-width corridor. The
// large circle is traversed, the small circle is entered only part-way.
for (const degrees of [0, 15, 30, 45, 60, 90, 120, 135, 165, 180, 210, 225, 255, 270, 300, 315, 345]) {
  const a = degrees * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  const startRot = { x: -60 * ux, y: -60 * uy };
  const endRot = { x: 60 * ux, y: 60 * uy };
  const bigRot = cutClosedContourByStraightPass(circle(0, 0, 40), startRot, endRot, width, { mode: 'noBottom' });
  assert.equal(bigRot.ok, true, `angled through-cut at ${degrees}°: ${bigRot.reason}`);
  assert.equal(bigRot.fragments.length, 2, `large circle separates at ${degrees}°`);
  const side = bigRot.metadata.sideWalls[0], vx = side.end.x - side.start.x, vy = side.end.y - side.start.y;
  near((endRot.x - startRot.x) * vy - (endRot.y - startRot.y) * vx, 0, 1e-5);

  const smallCenter = { x: 70 * ux, y: 70 * uy };
  const smallCircle = circle(smallCenter.x, smallCenter.y, 15);
  const smallRot = cutClosedContourByStraightPass(smallCircle, startRot, endRot, width, { mode: 'noBottom' });
  assert.equal(smallRot.ok, true, `angled blind entry at ${degrees}°: ${smallRot.reason}`);
  assert.equal(smallRot.openFragments.length, 1, `small circle has open entry at ${degrees}°`);
  assert.equal(smallRot.metadata.blindEnd, true);

  // Reverse the user's drag. The small circle now sees its start point inside
  // and its end outside; app mode must flip that individual contour direction.
  const reverseRot = cutClosedContourByStraightPass(smallCircle, endRot, startRot, width, {
    mode: 'noBottom', autoReverseIfStartInside: true,
  });
  assert.equal(reverseRot.ok, true, `reverse angled blind entry at ${degrees}°: ${reverseRot.reason}`);
  assert.equal(reverseRot.openFragments.length, 1);
  assert.equal(reverseRot.metadata.blindEnd, true);
  assert.equal(reverseRot.metadata.directionReversed, true);

  for (const mode of ['walls', 'noWalls']) {
    const pass = cutClosedContourByStraightPass(circle(0, 0, 40), startRot, endRot, width, { mode });
    assert.equal(pass.ok, true, `${mode} angled through-cut at ${degrees}°: ${pass.reason}`);
    if (mode === 'walls') assert.equal(pass.fragments.length, 2);
    else assert.equal(pass.openFragments.length, 2);
    const blind = cutClosedContourByStraightPass(smallCircle, startRot, endRot, width, { mode });
    assert.equal(blind.ok, true, `${mode} angled blind entry at ${degrees}°: ${blind.reason}`);
    assert.ok(blind.openFragments.length === 1 || blind.fragments.length === 1);
    const blindReverse = cutClosedContourByStraightPass(smallCircle, endRot, startRot, width, {
      mode, autoReverseIfStartInside: true,
    });
    assert.equal(blindReverse.ok, true, `${mode} reverse angled blind entry at ${degrees}°: ${blindReverse.reason}`);
    assert.ok(blindReverse.openFragments.length === 1 || blindReverse.fragments.length === 1);
    assert.equal(blindReverse.metadata.directionReversed, true);
  }
}

// The direct API remains conservative by default, while the editor opts into
// safe per-profile direction reversal for a drag started inside one contour.
const circleReverse = cutClosedContourByStraightPass(circle(0, 0, 20), { x: 0, y: 0 }, { x: 40, y: 0 }, 4, { autoReverseIfStartInside: true });
assert.equal(circleReverse.ok, true, circleReverse.reason);
assert.equal(circleReverse.metadata.directionReversed, true);
assert.equal(circleReverse.metadata.blindEnd, true);

console.log('Straight pass-cut tests passed: full walls, open-bottom walls, no-walls gaps, blind and through cuts, repeated second/third passes on the same open result, two-circle path, arbitrary-angle passes in 17 directions, reverse drag direction, exact parallel walls and invalid paths.');
