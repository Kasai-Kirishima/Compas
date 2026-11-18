import assert from 'node:assert/strict';
import { closestClosedPolylineEdge, moveClosedPolylineEdge } from '../src/polygon-edit.mjs';

const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const rectangle=[{x:0,y:0},{x:40,y:0},{x:40,y:20},{x:0,y:20}];
const hit=closestClosedPolylineEdge(rectangle,{x:20,y:-.2});
assert.equal(hit.edgeIndex,0);
near(hit.distance,.2);
near(hit.point.x,20);near(hit.point.y,0);

// Move the top edge of a rectangle upward: only its two endpoints move,
// and the neighbouring sides remain on their original supporting lines.
const moved=moveClosedPolylineEdge(rectangle,0,-5);
assert.equal(moved.ok,true);
near(moved.points[0].y,-5);near(moved.points[1].y,-5);
near(moved.points[0].x,0);near(moved.points[1].x,40);
near(moved.points[2].x,40);near(moved.points[2].y,20);
near(moved.points[3].x,0);near(moved.points[3].y,20);
near(moved.points[1].x-moved.points[0].x,40);

// Opposite direction moves the same edge into the polygon.
const inward=moveClosedPolylineEdge(rectangle,0,3);
assert.equal(inward.ok,true);
near(inward.points[0].y,3);near(inward.points[1].y,3);

// Every face of a regular hexagon is independently addressable and parallel after the move.
const hex=Array.from({length:6},(_,i)=>({x:50+20*Math.cos(i*Math.PI/3),y:50+20*Math.sin(i*Math.PI/3)}));
for(let i=0;i<hex.length;i++){
  const result=moveClosedPolylineEdge(hex,i,2.5);
  assert.equal(result.ok,true,`edge ${i}: ${result.reason||''}`);
  const oldA=hex[i],oldB=hex[(i+1)%hex.length],newA=result.points[i],newB=result.points[(i+1)%hex.length];
  const old= {x:oldB.x-oldA.x,y:oldB.y-oldA.y},next={x:newB.x-newA.x,y:newB.y-newA.y};
  near(old.x*next.y-old.y*next.x,0,1e-3);
  const len=Math.hypot(old.x,old.y),signed=((newA.x-oldA.x)*(-old.y/len)+(newA.y-oldA.y)*(old.x/len));
  near(signed,2.5,1e-3);
}

// Explicitly closed rings with a duplicated terminal point remain duplicated.
const repeated=[...rectangle,{...rectangle[0]}];
const repeatedMoved=moveClosedPolylineEdge(repeated,1,2);
assert.equal(repeatedMoved.ok,true);
assert.deepEqual(repeatedMoved.points[0],repeatedMoved.points.at(-1));

assert.equal(moveClosedPolylineEdge(rectangle,8,1).ok,false);
assert.equal(moveClosedPolylineEdge(rectangle,0,Infinity).ok,false);
assert.equal(moveClosedPolylineEdge([{x:0,y:0},{x:10,y:0}],0,1).ok,false);
console.log('Polygon face editing tests passed (all rectangle and six individual hexagon faces).');
