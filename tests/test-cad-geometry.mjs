import assert from 'node:assert/strict';
import {
  Line, Centerline, Circle, Arc, Polygon,
  LinearDimension, DiameterDimension,
  trimAtPoint, applyEditTransaction, polarArray, rotatePrimitive,
  intersectionsOn, intersectLineLine, intersectLineCircle, intersectCircleCircle,
  translatePrimitive, scalePrimitive, mirrorPrimitive, snapPoints,
  intersectionSnapPoints, serializeScene, deserializeScene, hitTest,
  drawPrimitive, drawWorldTextUpright, formatDimensionValue, getDimensionTextLayout, readableDimensionAngle,
  assertGostTextHeight, isGostTextHeight
} from '../src/cad-geometry-trim.mjs';

const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) <= eps, `${a} не близко к ${b}`);
const pointNear = (a, b, eps = 1e-7) => { near(a.x, b.x, eps); near(a.y, b.y, eps); };

// Short, but non-zero, segments keep a proper normalized parameter.
const microLine = new Line({x:0,y:0},{x:1e-5,y:0});
near(microLine.parameterAt({x:5e-6,y:0}),.5,1e-8);

// Basic line Trim between two crossing objects.
const base = new Line({x:0,y:0},{x:10,y:0});
const v1 = new Line({x:3,y:-5},{x:3,y:5});
const v2 = new Line({x:7,y:-5},{x:7,y:5});
let tx = trimAtPoint(base,{x:5,y:0},[base,v1,v2],{hitTolerance:1});
assert.equal(tx.ok,true); assert.equal(tx.add.length,2);
near(tx.add[0].a.x,0); near(tx.add[0].b.x,3); near(tx.add[1].a.x,7); near(tx.add[1].b.x,10);
assert.equal(applyEditTransaction([base,v1,v2],tx).length,4);

// Collinear overlap is represented by its finite endpoints and can delimit Trim.
const overlap = new Line({x:3,y:0},{x:7,y:0});
const overlapHits = intersectLineLine(base, overlap);
assert.equal(overlapHits.length,2); near(overlapHits[0].t,.3); near(overlapHits[1].t,.7);
tx = trimAtPoint(base,{x:5,y:0},[base,overlap],{hitTolerance:.1});
assert.equal(tx.ok,true); assert.equal(tx.add.length,2); near(tx.removed.t0,.3); near(tx.removed.t1,.7);

// Circle Trim: the clicked sector is removed, the remainder is an Arc.
const circ = new Circle({x:0,y:0},5);
const cutter = new Line({x:-10,y:0},{x:10,y:0});
tx=trimAtPoint(circ,{x:0,y:5},[circ,cutter],{hitTolerance:1});
assert.equal(tx.ok,true); assert.equal(tx.add.length,1); assert(tx.add[0] instanceof Arc);
near(Math.abs(tx.add[0].sweep),Math.PI);

// Arc Trim, including clockwise sweep.
const arc = new Arc({x:0,y:0},5,0,Math.PI);
const a1 = new Line({x:2,y:-10},{x:2,y:10});
const a2 = new Line({x:-2,y:-10},{x:-2,y:10});
tx=trimAtPoint(arc,{x:0,y:5},[arc,a1,a2],{hitTolerance:1});
assert.equal(tx.ok,true); assert.equal(tx.add.length,2);
const cwArc = new Arc({x:0,y:0},5,Math.PI,-Math.PI);
assert.notEqual(cwArc.parameterAt({x:0,y:5}),null);

// Polygon edge Trim converts the polygon into editable edges and removes only the clicked edge interval.
const trimPoly = new Polygon([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]);
const trimCutA = new Line({x:3,y:-2},{x:3,y:2});
const trimCutB = new Line({x:7,y:-2},{x:7,y:2});
const polyTx = trimAtPoint(trimPoly,{x:5,y:0},[trimPoly,trimCutA,trimCutB],{hitTolerance:1});
assert.equal(polyTx.ok,true); assert.deepEqual(polyTx.remove,[trimPoly.id]);
assert.equal(polyTx.add.length,5); assert(polyTx.add.every(o=>o instanceof Line));
assert.ok(polyTx.add.some(o=>Math.abs(o.a.x-0)<1e-7 && Math.abs(o.b.x-3)<1e-7));
assert.ok(polyTx.add.some(o=>Math.abs(o.a.x-7)<1e-7 && Math.abs(o.b.x-10)<1e-7));

// Tangencies should be one point, not two almost-identical points.
const tangentCircle = new Circle({x:0,y:0},5);
const tangentLine = new Line({x:-10,y:5},{x:10,y:5});
assert.equal(intersectionsOn(tangentCircle,[tangentLine]).length,1);
const c2 = new Circle({x:10,y:0},5);
assert.equal(intersectCircleCircle(tangentCircle,c2).length,1);
assert.equal(intersectCircleCircle(new Circle({x:0,y:0},5),new Circle({x:6,y:0},5)).length,2);
assert.equal(intersectCircleCircle(new Circle({x:0,y:0},5),new Circle({x:20,y:0},5)).length,0);
assert.equal(intersectLineLine(new Line({x:0,y:0},{x:1,y:0}),new Line({x:0,y:2},{x:1,y:2})).length,0);

// Large coordinate and near-tangent stability.
const largeCircle = new Circle({x:1e9,y:1e9},100);
const largeTangent = new Line({x:1e9-500,y:1e9+100},{x:1e9+500,y:1e9+100});
assert.equal(intersectLineCircle(largeTangent,largeCircle).length,1);
const largeCross = new Line({x:1e9,y:1e9-200},{x:1e9,y:1e9+200});
assert.equal(intersectLineCircle(largeCross,largeCircle).length,2);

// Blocked object cannot be edited but can still act as a cutting boundary.
const lockedSubject = new Line({x:0,y:0},{x:10,y:0},{locked:true});
assert.equal(trimAtPoint(lockedSubject,{x:5,y:0},[lockedSubject,v1],{hitTolerance:1}).ok,false);
const lockedCutter = new Line({x:3,y:-1},{x:3,y:1},{locked:true});
const unlockedSubject = new Line({x:0,y:0},{x:5,y:0});
assert.equal(trimAtPoint(unlockedSubject,{x:4,y:0},[unlockedSubject,lockedCutter],{hitTolerance:1}).ok,true);

// Polygon cleanup, validation, and exploded edges.
const poly = Polygon.regular({x:0,y:0},6,10);
assert.equal(poly.edges().length,6);
const cleanedPoly = new Polygon([{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:0,y:1},{x:0,y:0}]);
assert.equal(cleanedPoly.vertices.length,3);
assert.throws(() => new Polygon([{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:0,y:0}]), RangeError);

// Polar arrays preserve primitive subtype and have predictable counts.
const centerline = new Centerline({x:1,y:0},{x:2,y:0});
const arr=polarArray([centerline],{x:0,y:0},4);
assert.equal(arr.length,4); assert(arr[1] instanceof Centerline);
const copies=polarArray([base],{x:0,y:0},3,{includeOriginal:false}); assert.equal(copies.length,3);

// Transform helpers operate immutably and also support dimension annotations.
const moved = translatePrimitive(base,{x:5,y:2}); pointNear(moved.a,{x:5,y:2}); pointNear(base.a,{x:0,y:0});
const scaled = scalePrimitive(base,2,{x:0,y:0}); near(scaled.b.x,20);
const mirrored = mirrorPrimitive(new Line({x:2,y:0},{x:4,y:0}),{x:0,y:-1},{x:0,y:1});
pointNear(mirrored.a,{x:-2,y:0}); pointNear(mirrored.b,{x:-4,y:0});
const ld=new LinearDimension({x:0,y:0},{x:10,y:0},3);
const dimScaledNegative = scalePrimitive(ld,-2,{x:0,y:0}); near(dimScaledNegative.offset,6);
const rotatedDim=rotatePrimitive(ld,{x:0,y:0},Math.PI/2); pointNear(rotatedDim.p2,{x:0,y:10});
const dd=new DiameterDimension({x:0,y:0},5);
assert.equal(rotatePrimitive(dd,{x:1,y:1},.25).type,'diameterDimension');

// OSNAP candidates and intersection snaps.
assert.equal(snapPoints(base).filter(p=>p.type==='endpoint').length,2);
assert(snapPoints(circ).some(p=>p.type==='quadrant'));
assert(intersectionSnapPoints([base,v1,v2]).some(p=>p.type==='intersection'));
assert.equal(hitTest(base,{x:5,y:.2},.3),true);

// Dimension number formatting and automatic orientation follow measurement direction.
assert.equal(formatDimensionValue(20), '20');
assert.equal(formatDimensionValue(20.5), '20,5');
assert.equal(formatDimensionValue(20.567, { precision: 2 }), '20,57');
assert.equal(formatDimensionValue(-0.00001), '0');
const hDim = new LinearDimension({x:0,y:0},{x:40,y:0},6);
const vDim = new LinearDimension({x:0,y:0},{x:0,y:40},6);
const hLayout = getDimensionTextLayout(hDim), vLayout = getDimensionTextLayout(vDim);
near(hLayout.angle,0); assert.ok(hLayout.center.y > hDim.geometry().middle.y);
near(vLayout.angle,Math.PI/2); assert.ok(vLayout.center.x < vDim.geometry().middle.x);
const reverseVDim = new LinearDimension({x:0,y:40},{x:0,y:0},6);
near(getDimensionTextLayout(reverseVDim).angle,Math.PI/2);
const alignedDim = new LinearDimension({x:0,y:0},{x:20,y:30},6,{textOrientation:'aligned'});
near(getDimensionTextLayout(alignedDim).angle,Math.atan2(30,20));
assert.ok(readableDimensionAngle(Math.PI*.75) < Math.PI/2);

// Generic renderer dispatches dimension classes and compensates for Y-up text.
const calls=[];
const mockCtx={
  save(){calls.push('save')}, restore(){calls.push('restore')},
  setLineDash(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, closePath(){}, fill(){}, arc(){},
  fillRect(){calls.push('fillRect')}, fillText(){calls.push('fillText')}, translate(){calls.push('translate')}, rotate(a){calls.push(`rotate:${a}`)},
  scale(x,y){calls.push(`scale:${x},${y}`)}, measureText(text){return {width:String(text).length*2}},
  set strokeStyle(v){}, set fillStyle(v){}, set lineWidth(v){}, set font(v){}, set textAlign(v){}, set textBaseline(v){}
};
const testDimension=new LinearDimension({x:0,y:0},{x:20,y:10},4);
drawPrimitive(mockCtx,testDimension);
drawPrimitive(mockCtx,new DiameterDimension({x:0,y:0},5));
drawWorldTextUpright(mockCtx,'CAD',0,0);
assert(calls.includes('fillText')); assert(calls.includes('scale:1,-1')); assert.ok(!calls.includes('fillRect'), 'Размерные числа не должны закрываться белой маской'); assert.ok(calls.some(c=>String(c).startsWith('rotate:')));

// Dimensions, GOST text-height selector and JSON round-trip.
assert.equal(ld.value,10); assert.equal(dd.value,10);
assert.equal(isGostTextHeight(7),true); assert.equal(isGostTextHeight(6),false);
assert.throws(() => assertGostTextHeight(6),RangeError);
const all=[base,circ,arc,centerline,poly,ld,dd];
const roundTrip=deserializeScene(serializeScene(all));
assert.equal(roundTrip.length,7);
assert(roundTrip[0] instanceof Line && roundTrip[1] instanceof Circle && roundTrip[2] instanceof Arc);
assert(roundTrip[3] instanceof Centerline && roundTrip[4] instanceof Polygon);
assert(roundTrip[5] instanceof LinearDimension && roundTrip[6] instanceof DiameterDimension);
const styledDim = new LinearDimension({x:0,y:0},{x:0,y:25},4,{textOrientation:'vertical',precision:1,showLines:false});
const styledRoundTrip = deserializeScene(serializeScene([styledDim]))[0];
assert.equal(styledRoundTrip.textOrientation,'vertical'); assert.equal(styledRoundTrip.precision,1); assert.equal(styledRoundTrip.showLines,false);
assert.equal(trimAtPoint(new Line({x:0,y:0},{x:5,y:0}),{x:2,y:0},[],{hitTolerance:1}).ok,false);

console.log('All CAD geometry core tests passed (20 test groups).');
