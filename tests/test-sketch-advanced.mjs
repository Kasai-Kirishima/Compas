import assert from 'node:assert/strict';
import {
  getObjectSnapCandidates, findObjectSnap, findClosedLoops, createHatch,
  regularPolygonVertices, trimLegacyCurve, arcThroughThreePoints
} from '../src/sketch-advanced.mjs';

const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

// Object snaps: midpoint, circle centre/quadrants and exact line crossing candidates.
const snapLines=[
  {id:'h',type:'line',x:0,y:0,x2:20,y2:0},
  {id:'v',type:'line',x:10,y:-10,x2:10,y2:10},
  {id:'c',type:'circle',x:30,y:0,x2:35,y2:0}
];
const candidates=getObjectSnapCandidates(snapLines);
assert(candidates.some(c=>c.type==='intersection'&&Math.hypot(c.point.x-10,c.point.y)<1e-6));
assert(candidates.some(c=>c.type==='midpoint'&&Math.hypot(c.point.x-10,c.point.y)<1e-6));
assert(candidates.some(c=>c.type==='center'&&Math.hypot(c.point.x-30,c.point.y)<1e-6));
assert(candidates.some(c=>c.type==='quadrant'&&Math.hypot(c.point.x-35,c.point.y)<1e-6));
assert.equal(findObjectSnap({x:10.2,y:.1},snapLines,{tolerance:1}).type,'intersection');
// Line/circle intersections are solved analytically, not snapped to a tessellated chord.
const exactCircleSnap = getObjectSnapCandidates([
  {id:'axis',type:'line',x:-20,y:0,x2:20,y2:0},
  {id:'round',type:'circle',x:0,y:0,x2:10,y2:0}
]).filter(c=>c.type==='intersection');
assert.equal(exactCircleSnap.length, 2);
near(exactCircleSnap[0].point.y, 0, 1e-9);
near(Math.abs(exactCircleSnap[0].point.x), 10, 1e-9);

// Four independent line entities are recognized as one closed region.
const square=[
  {id:'s1',type:'line',x:0,y:0,x2:40,y2:0},
  {id:'s2',type:'line',x:40,y:0,x2:40,y2:30},
  {id:'s3',type:'line',x:40,y:30,x2:0,y2:30},
  {id:'s4',type:'line',x:0,y:30,x2:0,y2:0}
];
const squareRegions=findClosedLoops(square);
assert.equal(squareRegions.length,1);
near(squareRegions[0].area,1200);

// A pair of nested rings forms one material region with an inner hole.
const ringRegions=findClosedLoops([
  {id:'outer',type:'circle',x:0,y:0,x2:50,y2:0},
  {id:'inner',type:'circle',x:0,y:0,x2:20,y2:0}
]);
assert.equal(ringRegions.length,1);
assert.equal(ringRegions[0].holes.length,1);
assert.ok(ringRegions[0].area>0);
const hatch=createHatch(ringRegions[0],{angle:0,step:5,pattern:'single'});
assert.ok(hatch.segments.length>0);
for(const segment of hatch.segments){
  const mid={x:(segment.a.x+segment.b.x)/2,y:(segment.a.y+segment.b.y)/2};
  assert.ok(Math.hypot(mid.x,mid.y)>=20-1e-4,'Hatch segment must not pass through inner hole');
  assert.ok(Math.hypot(mid.x,mid.y)<=50+1e-4,'Hatch segment must stay inside outer ring');
}

// Crossed geometry is split into bounded faces, not only its outside boundary.
const crossed=[
  {id:'box1',type:'line',x:0,y:0,x2:20,y2:0},
  {id:'box2',type:'line',x:20,y:0,x2:20,y2:20},
  {id:'box3',type:'line',x:20,y:20,x2:0,y2:20},
  {id:'box4',type:'line',x:0,y:20,x2:0,y2:0},
  {id:'diag1',type:'line',x:0,y:0,x2:20,y2:20},
  {id:'diag2',type:'line',x:0,y:20,x2:20,y2:0}
];
const crossedRegions=findClosedLoops(crossed);
assert.ok(crossedRegions.length>=4,'A crossing must split the boundary into bounded sub-regions');

// Inradius and across-flats polygon modes.
const hex=regularPolygonVertices({x:0,y:0},6,20,{mode:'inradius',angle:0});
assert.equal(hex.length,6);
for(let i=0;i<hex.length;i++){
  const a=hex[i],b=hex[(i+1)%hex.length],d=Math.abs(a.x*b.y-a.y*b.x)/Math.hypot(b.x-a.x,b.y-a.y);
  near(d,20,1e-6);
}
const acrossHex=regularPolygonVertices({x:0,y:0},6,40,{mode:'acrossFlats',angle:0});
for(let i=0;i<acrossHex.length;i++){
  const a=acrossHex[i],b=acrossHex[(i+1)%acrossHex.length],d=Math.abs(a.x*b.y-a.y*b.x)/Math.hypot(b.x-a.x,b.y-a.y);
  near(d,20,1e-6);
}

// Three-point arc passes through the supplied middle point, including major arcs.
const upperArc=arcThroughThreePoints({x:10,y:0},{x:0,y:10},{x:-10,y:0});
near(upperArc.center.x,0,1e-8);near(upperArc.center.y,0,1e-8);near(upperArc.radius,10,1e-8);near(upperArc.sweep,Math.PI,1e-8);
const lowerArc=arcThroughThreePoints({x:10,y:0},{x:0,y:-10},{x:-10,y:0});
near(lowerArc.center.x,0,1e-8);near(lowerArc.center.y,0,1e-8);near(lowerArc.radius,10,1e-8);
assert.ok(lowerArc.sweep>Math.PI-1e-8);
assert.throws(()=>arcThroughThreePoints({x:0,y:0},{x:1,y:0},{x:2,y:0}),/одной прямой/);
// Trim removes the clicked interval between neighbouring intersections.
const trim=trimLegacyCurve(
  {id:'trim-base',type:'line',x:0,y:0,x2:100,y2:0},
  {x:50,y:0},
  [
    {id:'trim-base',type:'line',x:0,y:0,x2:100,y2:0},
    {id:'cut-a',type:'line',x:30,y:-10,x2:30,y2:10},
    {id:'cut-b',type:'line',x:70,y:-10,x2:70,y2:10}
  ],
  {hitTolerance:2,makeId:(()=>{let n=0;return()=>`new-${++n}`;})()}
);
assert.equal(trim.ok,true);
assert.deepEqual(trim.remove,['trim-base']);
assert.equal(trim.add.length,2);
near(trim.add[0].x2,30);
near(trim.add[1].x,70);

console.log('Advanced sketch tests passed: snaps, planar regions, holes, hatch, inradius polygons and multi-curve trim.');
