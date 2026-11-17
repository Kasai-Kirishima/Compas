import assert from 'node:assert/strict';
import { Polygon, Circle } from '../src/cad-geometry-trim.mjs';
import { cutPolygonNotch, cutPolygonNotchAtPoint, cutCircleNotchAtPoint, cutPolygonNotchWithoutBottomAtPoint, cutCircleNotchWithoutBottomAtPoint, cutOpenPathGapAtPoint, cutClosedBoundaryGapAtPoint, splitOpenPathAtPoint, splitClosedPolygonAtPoints, createRectangularPocket, createCircularCutout, createObroundCutout } from '../src/cutouts.mjs';
import { SceneHistory } from '../src/history.mjs';

const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const rect = new Polygon([{x:0,y:0},{x:100,y:0},{x:100,y:60},{x:0,y:60}]);
let tx=cutPolygonNotch(rect,0,20,12);
assert.equal(tx.ok,true);
assert.equal(tx.operation,'cutout');
assert.equal(tx.remove[0],rect.id);
const cut=tx.add[0];
assert(cut instanceof Polygon);
assert.equal(cut.vertices.length,8);
assert.ok(tx.metadata.newArea < tx.metadata.oldArea);
// Bottom edge in CCW rectangle: interior points upward into the plate.
const notchInner=cut.vertices.filter(p=>Math.abs(p.y-12)<1e-7 && p.x>=40-1e-7 && p.x<=60+1e-7);
assert.equal(notchInner.length,2);
near(notchInner[0].x,40); near(notchInner[1].x,60);

// Notch selected by an actual cursor point is centred around the projected point.
const txAt=cutPolygonNotchAtPoint(rect,{x:25,y:1},10,8,{hitTolerance:3});
assert.equal(txAt.ok,true);
assert.equal(txAt.removed.edgeIndex,0);
assert.ok(txAt.add[0].vertices.some(p=>Math.abs(p.x-20)<1e-7&&Math.abs(p.y-8)<1e-7));

// Clockwise polygon uses the correct inward normal.
const cw=new Polygon([{x:0,y:0},{x:0,y:60},{x:100,y:60},{x:100,y:0}]);
const cwTx=cutPolygonNotch(cw,0,20,10);
assert.equal(cwTx.ok,true);
assert.ok(cwTx.add[0].vertices.some(p=>p.x===10));

// Safe refusal for too-wide, too-deep, locked and invalid-edge edits.
assert.equal(cutPolygonNotch(rect,0,120,10).ok,false);
assert.equal(cutPolygonNotch(rect,0,20,80).ok,false);
assert.equal(cutPolygonNotch(new Polygon(rect.vertices,{locked:true}),0,10,5).ok,false);
assert.throws(()=>cutPolygonNotch(rect,99,10,5),RangeError);
assert.throws(()=>cutPolygonNotch(rect,0,0,5),RangeError);

// A circular outer boundary accepts an inward notch at the clicked circumference.
const ring = new Circle({x:0,y:0},50,{id:'outer-ring',ownerId:'outer-ring'});
const ringTx = cutCircleNotchAtPoint(ring,{x:50,y:0},20,12,{hitTolerance:2,minWeb:2});
assert.equal(ringTx.ok,true);
assert.deepEqual(ringTx.remove,['outer-ring']);
assert(ringTx.add[0] instanceof Polygon);
assert(ringTx.add[0].vertices.length > 200, 'Circular remainder should be smooth, not a coarse polygon');
assert.ok(ringTx.metadata.newArea < ringTx.metadata.oldArea);
assert.ok(ringTx.metadata.removedArea > 0);
assert.ok(ringTx.add[0].vertices.some(p=>Math.abs(Math.hypot(p.x,p.y)-38)<1e-6), 'Notch base should be 12 mm inside the 50 mm radius');
assert.equal(cutCircleNotchAtPoint(ring,{x:0,y:0},20,12,{hitTolerance:2}).ok,false, 'Centre click is not a valid circle edge target');
assert.equal(cutCircleNotchAtPoint(ring,{x:30,y:0},20,12,{hitTolerance:2}).ok,false, 'Click too far from circumference should be rejected');
assert.equal(cutCircleNotchAtPoint(ring,{x:50,y:0},120,12,{hitTolerance:2}).ok,false, 'A mouth wider than the diameter must be rejected');
assert.equal(cutCircleNotchAtPoint(ring,{x:50,y:0},20,50,{hitTolerance:2}).ok,false, 'Depth reaching the centre must be rejected');
assert.equal(cutCircleNotchAtPoint(new Circle({x:0,y:0},50,{locked:true}),{x:50,y:0},20,12,{hitTolerance:2}).ok,false);

// Third edge-cutout mode: side walls remain but the bottom/base line is removed.
const openBaseRect=cutPolygonNotchWithoutBottomAtPoint(rect,{x:50,y:0},20,10,{hitTolerance:2,minWeb:1});
assert.equal(openBaseRect.ok,true);
assert.equal(openBaseRect.operation,'cutout-open-base');
assert.equal(openBaseRect.metadata.bottomWallRemoved,true);
assert.equal(openBaseRect.metadata.retainedSideWalls,true);
assert.ok(Math.hypot(openBaseRect.path[0].x-openBaseRect.metadata.notch.innerEnd.x,openBaseRect.path[0].y-openBaseRect.metadata.notch.innerEnd.y)<1e-6);
assert.ok(Math.hypot(openBaseRect.path.at(-1).x-openBaseRect.metadata.notch.innerStart.x,openBaseRect.path.at(-1).y-openBaseRect.metadata.notch.innerStart.y)<1e-6);
assert.ok(openBaseRect.path.some((p,i)=>i>0&&Math.hypot(p.x-openBaseRect.metadata.notch.mouthEnd.x,p.y-openBaseRect.metadata.notch.mouthEnd.y)<1e-6), 'Right side wall is retained');
assert.ok(openBaseRect.path.some((p,i)=>i>0&&Math.hypot(p.x-openBaseRect.metadata.notch.mouthStart.x,p.y-openBaseRect.metadata.notch.mouthStart.y)<1e-6), 'Left side wall is retained');
const innerStart=openBaseRect.metadata.notch.innerStart,innerEnd=openBaseRect.metadata.notch.innerEnd;
assert.equal(openBaseRect.path.slice(1).some((p,i)=>{
  const q=openBaseRect.path[i];
  return (Math.hypot(q.x-innerStart.x,q.y-innerStart.y)<1e-6&&Math.hypot(p.x-innerEnd.x,p.y-innerEnd.y)<1e-6)||
    (Math.hypot(q.x-innerEnd.x,q.y-innerEnd.y)<1e-6&&Math.hypot(p.x-innerStart.x,p.y-innerStart.y)<1e-6);
}),false,'The bottom/base connector is absent');
const hasEdge=(a,b)=>openBaseRect.path.slice(1).some((p,i)=>{
  const q=openBaseRect.path[i];
  return (Math.hypot(q.x-a.x,q.y-a.y)<1e-6&&Math.hypot(p.x-b.x,p.y-b.y)<1e-6)||
    (Math.hypot(q.x-b.x,q.y-b.y)<1e-6&&Math.hypot(p.x-a.x,p.y-a.y)<1e-6);
});
assert.equal(hasEdge(innerEnd,openBaseRect.metadata.notch.mouthEnd),true,'Right side wall remains connected');
assert.equal(hasEdge(innerStart,openBaseRect.metadata.notch.mouthStart),true,'Left side wall remains connected');
assert.equal(openBaseRect.path.slice(1).some((p,i)=>Math.hypot(p.x-openBaseRect.path[i].x,p.y-openBaseRect.path[i].y)<1e-8),false,'The open path has no zero-length segment');
const openBaseCircle=cutCircleNotchWithoutBottomAtPoint(ring,{x:50,y:0},20,12,{hitTolerance:2,minWeb:2});
assert.equal(openBaseCircle.ok,true,'A circular profile supports a notch without its bottom wall');
assert.equal(openBaseCircle.metadata.bottomWallRemoved,true);
assert.ok(openBaseCircle.path.length>200,'The circular open-base notch keeps a smooth remaining arc');
assert.ok(Math.hypot(openBaseCircle.path[0].x-openBaseCircle.metadata.notch.innerEnd.x,openBaseCircle.path[0].y-openBaseCircle.metadata.notch.innerEnd.y)<1e-6);
assert.ok(Math.hypot(openBaseCircle.path.at(-1).x-openBaseCircle.metadata.notch.innerStart.x,openBaseCircle.path.at(-1).y-openBaseCircle.metadata.notch.innerStart.y)<1e-6);

// A second, deeper cut can be made directly in the floor of an existing notch.
const nestedFirst=cutPolygonNotchAtPoint(rect,{x:50,y:0},20,10,{hitTolerance:2,minWeb:1});
assert.equal(nestedFirst.ok,true);
const nestedSecond=cutPolygonNotchAtPoint(nestedFirst.add[0],{x:50,y:10},8,4,{hitTolerance:2,minWeb:1});
assert.equal(nestedSecond.ok,true,'A notch can be placed inside the floor of an existing notch');
assert.ok(nestedSecond.metadata.newArea<nestedFirst.metadata.newArea);
// Repeated operations on the resulting contour are not restricted to the original shape.
const wallCut=cutPolygonNotchAtPoint(nestedSecond.add[0],{x:40,y:5},4,3,{hitTolerance:1.5,minWeb:0});
assert.equal(wallCut.ok,true,'An existing notch wall can be cut again');

// A sampled ellipse/rounded boundary can receive a mouth wider than one tiny tessellation edge.
const sampledEllipse=new Polygon(Array.from({length:128},(_,i)=>({x:50*Math.cos(i*Math.PI/64),y:35*Math.sin(i*Math.PI/64)})));
const ellipseCut=cutPolygonNotchAtPoint(sampledEllipse,{x:50,y:0},20,8,{hitTolerance:2,minWeb:2});
assert.equal(ellipseCut.ok,true,'A notch can span multiple small edges on a curved contour');
assert.ok(ellipseCut.add[0].vertices.length>100,'Most of the smooth ellipse boundary is retained');
const curvedNested=cutPolygonNotchAtPoint(ellipseCut.add[0],{x:45,y:-8},4,3,{hitTolerance:3,minWeb:0});
assert.equal(curvedNested.ok,true,'A new notch can be cut into the base of a previous curved-boundary notch');
for(const edgeClick of [{x:0,y:35},{x:-50,y:0},{x:0,y:-35},{x:35,y:24}]){
  const curvedSide=cutPolygonNotchAtPoint(sampledEllipse,edgeClick,18,7,{hitTolerance:2,minWeb:1});
  assert.equal(curvedSide.ok,true,`A curved boundary should be cut at ${edgeClick.x}, ${edgeClick.y}`);
}
const roundedVertices=[];
const roundedCorners=[{cx:90,cy:10,a:-Math.PI/2},{cx:90,cy:50,a:0},{cx:10,cy:50,a:Math.PI/2},{cx:10,cy:10,a:Math.PI}];
roundedCorners.forEach(({cx,cy,a})=>{for(let i=0;i<=10;i++){const angle=a+i*Math.PI/20,p={x:cx+10*Math.cos(angle),y:cy+10*Math.sin(angle)};if(!roundedVertices.length||distanceForTest(p,roundedVertices.at(-1))>.001)roundedVertices.push(p);}});
const roundedCut=cutPolygonNotchAtPoint(new Polygon(roundedVertices),{x:97,y:3},18,5,{hitTolerance:3,minWeb:1});
assert.equal(roundedCut.ok,true,'A rounded rectangle corner can receive a notch');

// A gap can be cut from an open segment; the API returns the remaining fragments.
const gap=cutOpenPathGapAtPoint([{x:0,y:0},{x:100,y:0}],{x:50,y:1},20,{hitTolerance:2});
assert.equal(gap.ok,true);
assert.equal(gap.operation,'segment-gap');
assert.equal(gap.fragments.length,2);
near(gap.fragments[0][0].x,0); near(gap.fragments[0].at(-1).x,40);
near(gap.fragments[1][0].x,60); near(gap.fragments[1].at(-1).x,100);
// The tool remains usable on either leftover segment, creating an additional gap.
const repeatedGap=cutOpenPathGapAtPoint(gap.fragments[0],{x:20,y:0},6,{hitTolerance:1});
assert.equal(repeatedGap.ok,true);
assert.equal(repeatedGap.fragments.length,2);
const polylineGap=cutOpenPathGapAtPoint([{x:0,y:0},{x:50,y:0},{x:50,y:50}],{x:50,y:4},20,{hitTolerance:2});
assert.equal(polylineGap.ok,true,'A single gap can span across several segments of an open polyline');
assert.equal(polylineGap.fragments.length,2);
assert.equal(cutOpenPathGapAtPoint([{x:0,y:0},{x:10,y:0}],{x:5,y:0},20,{hitTolerance:1}).ok,false,
  'A gap that removes the entire object is refused rather than leaving invalid geometry');

// No artificial cut-count cap: many edge notches can be applied successively.
let many=new Polygon([{x:0,y:0},{x:240,y:0},{x:240,y:100},{x:0,y:100}]);
for(let i=0;i<24;i++){
  const x=6+i*9;
  const y=i%2===0?0:100;
  const txMany=cutPolygonNotchAtPoint(many,{x,y},4,3,{hitTolerance:1,minWeb:1});
  assert.equal(txMany.ok,true,`Repeated notch ${i+1} should succeed`);
  many=txMany.add[0];
}
assert.ok(many.vertices.length>4,'The contour stores every repeated cut without a fixed count limit');


// Open paths can be split at the exact midpoint and arbitrarily close to an
// endpoint; there is no hard-coded 2% minimum-distance restriction.
const halfSplit = splitOpenPathAtPoint([{x:0,y:0},{x:100,y:0}], {x:50,y:.1}, {hitTolerance:1});
assert.equal(halfSplit.ok,true);
assert.equal(halfSplit.fragments.length,2);
near(halfSplit.metadata.firstLength,50);
near(halfSplit.metadata.secondLength,50);
const nearEndSplit = splitOpenPathAtPoint([{x:0,y:0},{x:100,y:0}], {x:1,y:0}, {hitTolerance:1});
assert.equal(nearEndSplit.ok,true);
near(nearEndSplit.metadata.firstLength,1);
near(nearEndSplit.metadata.secondLength,99);
const polylineSplit = splitOpenPathAtPoint([{x:0,y:0},{x:30,y:0},{x:30,y:40}], {x:30,y:15}, {hitTolerance:1});
assert.equal(polylineSplit.ok,true);
assert.equal(polylineSplit.fragments.length,2);
near(polylineSplit.metadata.firstLength,45);
near(polylineSplit.metadata.secondLength,25);

// A closed contour is divided by a chord into two independent closed contours.
const square = [{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}];
const squareSplit = splitClosedPolygonAtPoints(square,{x:0,y:25},{x:100,y:25},{hitTolerance:1});
assert.equal(squareSplit.ok,true);
assert.equal(squareSplit.fragments.length,2);
near(squareSplit.metadata.firstArea,2500);
near(squareSplit.metadata.secondArea,2500);
const squareDiagonal = splitClosedPolygonAtPoints(square,{x:0,y:0},{x:100,y:50},{hitTolerance:1});
assert.equal(squareDiagonal.ok,true);
near(squareDiagonal.metadata.firstArea+squareDiagonal.metadata.secondArea,5000);
const concave = [{x:0,y:0},{x:60,y:0},{x:60,y:20},{x:20,y:20},{x:20,y:60},{x:0,y:60}];
const concaveInvalid = splitClosedPolygonAtPoints(concave,{x:60,y:10},{x:10,y:60},{hitTolerance:1});
assert.equal(concaveInvalid.ok,false,'A chord through the exterior of a concave shape must be rejected');
const circleProfile=Array.from({length:256},(_,i)=>({x:40*Math.cos(i*Math.PI/128),y:40*Math.sin(i*Math.PI/128)}));
const circleHalf=splitClosedPolygonAtPoints(circleProfile,{x:-40,y:0},{x:40,y:0},{hitTolerance:.1});
assert.equal(circleHalf.ok,true,'A circular profile can be split into two closed halves');
near(circleHalf.metadata.firstArea,circleHalf.metadata.secondArea,1);
const repeatOpen=splitOpenPathAtPoint(halfSplit.fragments[0],{x:25,y:0},{hitTolerance:1});
assert.equal(repeatOpen.ok,true,'Either resulting open fragment can be split again');
const repeatClosed=splitClosedPolygonAtPoints(squareSplit.fragments[0],{x:0,y:12.5},{x:100,y:12.5},{hitTolerance:1});
assert.equal(repeatClosed.ok,true,'Either resulting closed part can be divided again');

// Inner contour utilities stay separate from the outer boundary.
const pocket=createRectangularPocket({x:20,y:25},30,12,Math.PI/6);
assert.equal(pocket.length,1); assert(pocket[0] instanceof Polygon);
const hole=createCircularCutout({x:20,y:25},5);
assert.equal(hole.length,1); assert(hole[0] instanceof Circle); assert.equal(hole[0].feature,'circular-cutout');
const slot=createObroundCutout({x:0,y:0},40,10,0);
assert.equal(slot.length,4); assert(slot.every(o=>o.feature==='obround-cutout'));
// Inner contours are regular editable geometry too, so they can receive further cuts.
const cutPocket=cutPolygonNotchAtPoint(pocket[0],{x:20,y:19},6,3,{hitTolerance:2,minWeb:0});
assert.equal(cutPocket.ok,true,'A previously placed inner rectangular contour can be cut again');
const cutHole=cutCircleNotchAtPoint(hole[0],{x:25,y:25},4,2,{hitTolerance:1});
assert.equal(cutHole.ok,true,'A previously placed inner circular contour can be cut again');

// The separate no-walls tool removes only a boundary arc and returns an open
// contour: there are no added side-wall or bottom segments.
const noWallsRect=[{x:0,y:0},{x:100,y:0},{x:100,y:60},{x:0,y:60}];
const noWalls=cutClosedBoundaryGapAtPoint(noWallsRect,{x:50,y:0},20,{hitTolerance:1});
assert.equal(noWalls.ok,true);
assert.equal(noWalls.operation,'cutout-open-boundary');
assert.equal(noWalls.path.length,6,'Only the two gap endpoints and surviving original corners remain');
near(noWalls.metadata.removedLength,20);
assert.equal(noWalls.path.some(p=>Math.abs(p.x-40)<1e-7&&Math.abs(p.y-0)<1e-7),true,'First open end lies on the original boundary');
assert.equal(noWalls.path.some(p=>Math.abs(p.x-60)<1e-7&&Math.abs(p.y-0)<1e-7),true,'Second open end lies on the original boundary');
const noWallsCircle=cutClosedBoundaryGapAtPoint(circleProfile,{x:40,y:0},12,{hitTolerance:1});
assert.equal(noWallsCircle.ok,true,'No-walls cut can open a circular outline too');
assert.ok(noWallsCircle.path.length>200,'Circular outline remains a finely sampled open curve');
assert.equal(cutClosedBoundaryGapAtPoint(noWallsRect,{x:50,y:20},20,{hitTolerance:1}).ok,false,'The click must be near the boundary');

// The cutout edit is compatible with transactional Undo/Redo.
const h=new SceneHistory([rect]); h.apply(tx); assert.equal(h.scene.length,1); assert.notEqual(h.scene[0].id,rect.id);
h.undo(); assert.equal(h.scene[0].id,rect.id); h.redo(); assert.equal(h.scene[0].vertices.length,8);
console.log('All profile cutout tests passed (nested/repeated boundary cuts and open-path segment gaps included).');

function distanceForTest(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
