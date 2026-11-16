import assert from 'node:assert/strict';
import { Line, Centerline, Circle, Arc, Polygon, LinearDimension } from '../src/cad-geometry-trim.mjs';
import { eraseAlongPath, eraseAtPoint, applyEraseTransaction, simplifyEraserPath, eraserRadiusInWorld } from '../src/eraser.mjs';
import { SceneHistory } from '../src/history.mjs';

const near = (a,b,e=1e-6) => assert.ok(Math.abs(a-b)<=e, `${a} != ${b}`);
const point = (a,b,e=1e-6) => { near(a.x,b.x,e); near(a.y,b.y,e); };

// Drag eraser removes only the crossed portion of a segment.
const line = new Line({x:0,y:0},{x:100,y:0});
let tx = eraseAlongPath([line], [{x:50,y:-20},{x:50,y:20}], 5);
assert.equal(tx.ok,true); assert.equal(tx.remove[0],line.id); assert.equal(tx.add.length,2);
point(tx.add[0].a,{x:0,y:0}); point(tx.add[0].b,{x:45,y:0});
point(tx.add[1].a,{x:55,y:0}); point(tx.add[1].b,{x:100,y:0});

// Diagonal stroke gives a finite clipped region; disjoint sweeps merge.
const diagonal = new Line({x:0,y:0},{x:100,y:100});
tx = eraseAlongPath([diagonal],[{x:48,y:52},{x:52,y:48}],2);
assert.equal(tx.ok,true); assert.equal(tx.add.length,2);
assert.ok(tx.add[0].b.x < tx.add[1].a.x);

// Pure tangency has zero area and must not replace an untouched object.
const tangentEraseLine = new Line({x:-10,y:0},{x:10,y:0});
tx=eraseAlongPath([tangentEraseLine],[{x:0,y:2},{x:0,y:5}],2);
assert.equal(tx.ok,false);

// Single dab works as a circular brush.
const dabLine = new Line({x:0,y:0},{x:100,y:0});
tx=eraseAtPoint([dabLine],{x:50,y:0},10);
assert.equal(tx.ok,true); assert.equal(tx.add.length,2);
near(tx.add[0].b.x,40); near(tx.add[1].a.x,60);

// Entirely covered object is deleted without fragments.
const shortLine = new Line({x:0,y:0},{x:5,y:0});
tx=eraseAlongPath([shortLine],[{x:-10,y:0},{x:10,y:0}],4);
assert.equal(tx.ok,true); assert.equal(tx.add.length,0);

// Centerline fragments preserve subtype and dash styling.
const axis = new Centerline({x:0,y:0},{x:100,y:0});
tx=eraseAlongPath([axis],[{x:50,y:-10},{x:50,y:10}],2);
assert.equal(tx.add.length,2); assert(tx.add.every(x=>x instanceof Centerline));

// Circle gets converted to remaining arcs; stroke through centreline erases two sectors.
const circle = new Circle({x:0,y:0},50);
tx=eraseAlongPath([circle],[{x:0,y:-100},{x:0,y:100}],4);
assert.equal(tx.ok,true); assert.equal(tx.remove[0],circle.id);
assert.ok(tx.add.length >= 2 && tx.add.every(x=>x instanceof Arc));
assert.ok(tx.add.reduce((sum,a)=>sum+Math.abs(a.sweep),0) < Math.PI*2);

// Local dab on circle removes only a short arc.
const circleDab = new Circle({x:0,y:0},30);
tx=eraseAtPoint([circleDab],{x:30,y:0},5);
assert.equal(tx.ok,true); assert.ok(tx.add.length >= 1 && tx.add.every(x=>x instanceof Arc));
assert.ok(tx.add.reduce((sum,a)=>sum+Math.abs(a.sweep),0) > Math.PI);

// Arc partial erasure preserves remaining arc parts.
const arc = new Arc({x:0,y:0},30,0,Math.PI);
tx=eraseAlongPath([arc],[{x:0,y:20},{x:0,y:40}],4);
assert.equal(tx.ok,true); assert.ok(tx.add.length >= 1 && tx.add.every(x=>x instanceof Arc));
assert.ok(tx.add.reduce((sum,a)=>sum+Math.abs(a.sweep),0) < Math.PI);

// Polygon is exploded only when one or more edges are hit; unhit sides remain.
const polygon = Polygon.regular({x:0,y:0},4,20,Math.PI/4);
tx=eraseAlongPath([polygon],[{x:0,y:-25},{x:0,y:-15}],2);
assert.equal(tx.ok,true); assert.equal(tx.remove[0],polygon.id);
assert.ok(tx.add.every(x=>x instanceof Line));

// Locked objects remain unchanged and are reported only when hit.
const locked = new Line({x:0,y:0},{x:100,y:0},{locked:true});
tx=eraseAlongPath([locked],[{x:50,y:-5},{x:50,y:5}],2);
assert.equal(tx.ok,false); assert.deepEqual(tx.skippedLocked,[locked.id]);

// Dimensions are treated as one annotation, never fragmented into invalid pieces.
const dim = new LinearDimension({x:0,y:0},{x:100,y:0},10);
tx=eraseAlongPath([dim],[{x:50,y:5},{x:50,y:15}],2);
assert.equal(tx.ok,true); assert.equal(tx.remove[0],dim.id); assert.equal(tx.add.length,0);

// SceneHistory supports undo, redo, and clearing redo on a new edit.
const h = new SceneHistory([line]);
tx=eraseAlongPath(h.scene,[{x:50,y:-20},{x:50,y:20}],5);
h.apply(tx); assert.equal(h.scene.length,2); assert.equal(h.canUndo,true);
h.undo(); assert.equal(h.scene.length,1); assert.equal(h.canRedo,true);
h.redo(); assert.equal(h.scene.length,2);
h.undo(); h.replace([new Line({x:0,y:0},{x:10,y:0})]); assert.equal(h.canRedo,false);


// Stroke simplification keeps corners and endpoints but removes dense pointer noise.
const dense = Array.from({length:101},(_,i)=>({x:i,y:Math.sin(i/100*Math.PI)*0.01}));
const simple = simplifyEraserPath(dense,0.1);
assert.equal(simple[0].x,0); assert.equal(simple.at(-1).x,100); assert.ok(simple.length < dense.length);
assert.throws(()=>simplifyEraserPath(dense,-1),RangeError);
near(eraserRadiusInWorld(12,3),4);
assert.throws(()=>eraserRadiusInWorld(12,0),RangeError);

// The round cap at the end of a stroke erases even when the strip projection misses.
const capLine = new Line({x:-10,y:0},{x:10,y:0});
tx=eraseAlongPath([capLine],[{x:0,y:2},{x:0,y:4}],3);
assert.equal(tx.ok,true); assert.equal(tx.add.length,2);
assert.ok(tx.add[0].b.x < 0 && tx.add[1].a.x > 0);

// A multi-segment stroke erases the union of its capsules, not the whole object.
const multiLine = new Line({x:0,y:0},{x:100,y:0});
tx=eraseAlongPath([multiLine],[{x:25,y:-5},{x:25,y:5},{x:75,y:5},{x:75,y:-5}],2);
assert.equal(tx.ok,true); assert.equal(tx.add.length,3);

// An annotation can be erased by crossing its detached text label.
const movedDim = new LinearDimension({x:0,y:0},{x:100,y:0},10,{textOffset:20});
tx=eraseAtPoint([movedDim],{x:50,y:30},1);
assert.equal(tx.ok,true); assert.equal(tx.remove[0],movedDim.id);

// Invalid inputs fail explicitly.
assert.throws(()=>eraseAlongPath([line],[],3),RangeError);
assert.throws(()=>eraseAlongPath([line],[{x:0,y:0}],0),RangeError);
assert.throws(()=>eraseAlongPath([line],[{x:NaN,y:0}],2),TypeError);

console.log('All partial eraser tests passed (13 groups).');

// Circle remnants across the 0/2π seam are merged into one continuous arc.
const seamCircle = new Circle({x:0,y:0},20);
tx = eraseAtPoint([seamCircle], {x:0,y:20}, 5);
assert.equal(tx.ok,true);
assert.equal(tx.add.length,1, 'A single local cut must leave one wrap-around arc, not two seam fragments');
assert.ok(tx.add[0] instanceof Arc);
assert.ok(Math.abs(tx.add[0].sweep) > Math.PI);
assert.equal(tx.add[0].ownerId,seamCircle.id);

// Locked annotations are reported instead of silently ignored.
const lockedDim = new LinearDimension({x:0,y:0},{x:100,y:0},10,{locked:true});
tx = eraseAtPoint([lockedDim], {x:50,y:10}, 2);
assert.equal(tx.ok,false);
assert.deepEqual(tx.skippedLocked,[lockedDim.id]);

// The final pointer location is not part of geometry core, but degenerate and
// repeated path samples must still behave consistently when passed by a UI.
const repeatedPathLine = new Line({x:0,y:0},{x:100,y:0});
tx = eraseAlongPath([repeatedPathLine],[{x:50,y:-4},{x:50,y:-4},{x:50,y:4}],2);
assert.equal(tx.ok,true);
assert.equal(tx.add.length,2);

console.log('Additional eraser regression tests passed (3 groups).');
