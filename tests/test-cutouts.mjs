import assert from 'node:assert/strict';
import { Polygon, Circle } from '../src/cad-geometry-trim.mjs';
import { cutPolygonNotch, cutPolygonNotchAtPoint, cutCircleNotchAtPoint, createRectangularPocket, createCircularCutout, createObroundCutout } from '../src/cutouts.mjs';
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

// Inner contour utilities stay separate from the outer boundary.
const pocket=createRectangularPocket({x:20,y:25},30,12,Math.PI/6);
assert.equal(pocket.length,1); assert(pocket[0] instanceof Polygon);
const hole=createCircularCutout({x:20,y:25},5);
assert.equal(hole.length,1); assert(hole[0] instanceof Circle); assert.equal(hole[0].feature,'circular-cutout');
const slot=createObroundCutout({x:0,y:0},40,10,0);
assert.equal(slot.length,4); assert(slot.every(o=>o.feature==='obround-cutout'));

// The cutout edit is compatible with transactional Undo/Redo.
const h=new SceneHistory([rect]); h.apply(tx); assert.equal(h.scene.length,1); assert.notEqual(h.scene[0].id,rect.id);
h.undo(); assert.equal(h.scene[0].id,rect.id); h.redo(); assert.equal(h.scene[0].vertices.length,8);
console.log('All profile cutout tests passed (9 groups, including circular edge notches).');
