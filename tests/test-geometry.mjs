import assert from 'node:assert/strict';
import {distance,constrainAngle,lineProjection,boundsOfObject,nearestPoint,pathData, splinePathData, arrowHeadPoints} from '../src/geometry.mjs';
assert.equal(distance({x:0,y:0},{x:3,y:4}),5);
assert.deepEqual(constrainAngle({x:0,y:0},{x:10,y:1},45),{x:10.04987562112089,y:0});
assert.deepEqual(lineProjection({x:5,y:2},{x:0,y:0},{x:10,y:0}),{x:5,y:0,t:.5});
assert.deepEqual(boundsOfObject({type:'rect',x:2,y:3,w:10,h:20}),{x:2,y:3,w:10,h:20});
const snap=nearestPoint({x:5,y:0.4},[{id:'a',type:'line',a:{x:0,y:0},b:{x:10,y:0}}],1);
assert.equal(snap.type,'segment');assert.equal(snap.id,'a');
assert.equal(pathData([{x:0,y:0},{x:1,y:2}],true),'M 0 0 L 1 2 Z');
const moved = nearestPoint({x:10,y:10}, [{id:'moved',type:'line',a:{x:0,y:0},b:{x:10,y:0},dx:5,dy:10}], 0.01);
assert.equal(moved.type,'segment'); assert.equal(moved.id,'moved');
assert.ok(Math.abs(moved.x-10)<1e-9 && Math.abs(moved.y-10)<1e-9);
const movedRect = nearestPoint({x:20,y:20}, [{id:'r',type:'rect',x:0,y:0,w:10,h:10,dx:20,dy:10}], 0.01);
assert.equal(movedRect.type,'endpoint'); assert.equal(movedRect.x,20); assert.equal(movedRect.y,20);
console.log('geometry: ok');

const smooth = splinePathData([{x:0,y:0},{x:10,y:10},{x:20,y:0}]);
assert.match(smooth, /C /, 'a spline with three control points must render as smooth Bézier geometry');
assert.match(splinePathData([{x:0,y:0},{x:1,y:1}]), /L 1 1/, 'two spline points remain a drawable segment');
console.log('geometry: spline path ok');


// Arrowhead geometry must be isosceles and remain proportionate for horizontal,
// vertical and diagonal vectors. The previous implementation confused mm with radians.
for (const [tip, from] of [
  [{x:20,y:10},{x:0,y:10}],
  [{x:10,y:20},{x:10,y:0}],
  [{x:20,y:20},{x:0,y:0}],
]) {
  const [pTip, p1, p2] = arrowHeadPoints(tip, from, 5, 14);
  assert.deepEqual(pTip, tip);
  const base = {x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2};
  const headLen = Math.hypot(tip.x-base.x, tip.y-base.y);
  const halfWidth = Math.hypot(p1.x-base.x, p1.y-base.y);
  assert.ok(Math.abs(headLen-5)<1e-9, 'arrowhead length is measured along its axis');
  assert.ok(Math.abs(halfWidth/headLen-Math.tan(14*Math.PI/180))<1e-9, 'arrowhead has a consistent included angle');
  assert.ok(Math.abs(Math.hypot(tip.x-p1.x,tip.y-p1.y)-Math.hypot(tip.x-p2.x,tip.y-p2.y))<1e-9, 'arrowhead sides are symmetric');
}
const shortArrow = arrowHeadPoints({x:1,y:0},{x:0,y:0},5,14);
assert.ok(Math.abs(Math.hypot(shortArrow[0].x-(shortArrow[1].x+shortArrow[2].x)/2,shortArrow[0].y-(shortArrow[1].y+shortArrow[2].y)/2)-.45)<1e-9, 'short arrows cap the head so it does not overrun the shaft');
console.log('geometry: proportional arrowhead geometry ok');
