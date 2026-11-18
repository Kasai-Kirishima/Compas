import assert from 'node:assert/strict';
import {
  getObjectSnapCandidates, findObjectSnap, findClosedLoops, createHatch, pointInRegion,
  regularPolygonVertices, sixPointStarTriangles, sixPointStarOutline, trimLegacyCurve, arcThroughThreePoints
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


// Region hit-testing follows the clipped fill: outer area is included, holes and exterior are excluded.
const hitRegion={outer:[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}],holes:[[{x:6,y:6},{x:14,y:6},{x:14,y:14},{x:6,y:14}]]};
assert.equal(pointInRegion({x:2,y:2},hitRegion),true);
assert.equal(pointInRegion({x:10,y:10},hitRegion),false);
assert.equal(pointInRegion({x:25,y:10},hitRegion),false);
assert.equal(pointInRegion({x:6,y:10},hitRegion),false,'Hole boundary is not filled');

// Six-pointed star is made from two equilateral triangles on the same circumcircle.
const star=sixPointStarTriangles({x:5,y:7},12,{angle:.2});
assert.equal(star.length,2);assert.equal(star[0].length,3);assert.equal(star[1].length,3);
for(const triangle of star){
  const sides=triangle.map((p,i)=>Math.hypot(p.x-triangle[(i+1)%3].x,p.y-triangle[(i+1)%3].y));
  near(sides[0],sides[1]);near(sides[1],sides[2]);
  triangle.forEach(p=>near(Math.hypot(p.x-5,p.y-7),12));
}
const angleA=Math.atan2(star[0][0].y-7,star[0][0].x-5),angleB=Math.atan2(star[1][0].y-7,star[1][0].x-5);
near(Math.abs(Math.atan2(Math.sin(angleB-angleA),Math.cos(angleB-angleA))),Math.PI/3);

// The editor's star tool uses one closed 12-vertex outline with no triangle crossing edges.
const starOutline=sixPointStarOutline({x:5,y:7},12,{angle:.2});
assert.equal(starOutline.length,12);
for(let i=0;i<starOutline.length;i++)near(Math.hypot(starOutline[i].x-5,starOutline[i].y-7),i%2===0?12:6,1e-6);
// Adjacent outline edges are finite and the outline alternates between six tips and six valleys.
assert.ok(starOutline.every((p,i)=>Math.hypot(p.x-starOutline[(i+1)%12].x,p.y-starOutline[(i+1)%12].y)>0.1));

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
assert.ok(hatch.segments.every(segment=>segment.angle===0),'A zero-degree hatch remains horizontal and is not changed by any hit point');
for(const segment of hatch.segments)near(segment.a.y,segment.b.y,1e-7);
const solidHatch=createHatch(ringRegions[0],{pattern:'solid'});
assert.equal(solidHatch.segments.length,0,'Solid mode should fill the whole detected region rather than generate sparse hatch strokes');

// Scan-line clipping stays inside concave regions and does not bridge their notches.
const concaveRegion={outer:[
  {x:0,y:0},{x:30,y:0},{x:30,y:10},{x:10,y:10},{x:10,y:30},{x:0,y:30}
],holes:[]};
const concaveHatch=createHatch(concaveRegion,{angle:0,step:5,pattern:'single'});
const upperLeg=concaveHatch.segments.filter(s=>Math.abs(s.a.y-15)<1e-6);
assert.equal(upperLeg.length,1,'A horizontal hatch through the upper leg should produce one clipped segment');
near(Math.min(upperLeg[0].a.x,upperLeg[0].b.x),0);
near(Math.max(upperLeg[0].a.x,upperLeg[0].b.x),10);
assert.ok(concaveHatch.segments.every(s=>Math.abs(s.a.y-s.b.y)<1e-7),'Zero-degree hatch lines should remain horizontal');

// A scan line through hole edges must not paint across the hole.
const squareRing={outer:[
  {x:0,y:0},{x:40,y:0},{x:40,y:40},{x:0,y:40}
],holes:[[
  {x:10,y:10},{x:30,y:10},{x:30,y:30},{x:10,y:30}
]]};
const squareRingHatch=createHatch(squareRing,{angle:0,step:5});
const throughHole=squareRingHatch.segments.filter(s=>Math.abs(s.a.y-15)<1e-6);
assert.equal(throughHole.length,2,'A line through a hole must be split into two visible spans');
assert.ok(throughHole.every(s=>Math.max(s.a.x,s.b.x)<=10+1e-6||Math.min(s.a.x,s.b.x)>=30-1e-6),'No hatch segment may cross the interior hole');

// All 12 quick angles are accepted, and multi-direction patterns retain the requested angles.
for(const angle of [0,15,30,45,60,75,90,105,120,135,150,165]){
  const angled=createHatch({outer:[{x:0,y:0},{x:30,y:0},{x:30,y:20},{x:0,y:20}],holes:[]},{angle,step:4});
  assert.ok(angled.segments.length>0,`Angle ${angle}° should generate visible hatch segments`);
  assert.ok(angled.segments.every(segment=>Number.isFinite(segment.a.x)&&Number.isFinite(segment.a.y)&&Number.isFinite(segment.b.x)&&Number.isFinite(segment.b.y)));
}
const tripleHatch=createHatch(concaveRegion,{angle:30,step:5,pattern:'triple'});
assert.deepEqual([...new Set(tripleHatch.segments.map(segment=>Math.round(segment.angle)))].sort((a,b)=>a-b),[30,90,150]);
const crossHatch=createHatch(concaveRegion,{angle:15,step:5,pattern:'cross'});
assert.deepEqual([...new Set(crossHatch.segments.map(segment=>Math.round(segment.angle)))].sort((a,b)=>a-b),[15,105]);
assert.equal(solidHatch.holes.length,1,'Solid fill must preserve internal holes');
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
