import assert from 'node:assert/strict';
import {
  Line, Circle, Arc, Centerline, Polygon, createCenterMark, createSlot,
  createBoltCircle, createFlange, createPlate, createHexHead,
  createSteppedShaft, createBushing, createWasher, createBearing, createCounterboreHole, createHoleArray, createTemplate, TEMPLATE_CATALOG,
  serializeScene, deserializeScene
} from '../src/index.mjs';

const assertTypes = (items, type, count = null) => {
  assert.ok(items.every(x => x instanceof type), `Expected only ${type.name}`);
  if (count != null) assert.equal(items.length,count);
};

const centerMarks = createCenterMark({x:0,y:0},20);
assertTypes(centerMarks,Centerline,2);
assertTypes(createCenterMark({x:0,y:0},20,{gap:4}),Centerline,4);
const slot = createSlot({x:10,y:10},60,16,Math.PI/6,{centerline:true});
assert.equal(slot.filter(x=>x.type==='line').length,2);
assert.equal(slot.filter(x=>x instanceof Arc).length,2);
assert.equal(slot.filter(x=>x instanceof Centerline).length,1);
const roundSlot = createSlot({x:0,y:0},12,12);
assertTypes(roundSlot,Circle,1);
assert.throws(()=>createSlot({x:0,y:0},10,12),RangeError);

const bolt = createBoltCircle({x:0,y:0},40,8,4);
assert.equal(bolt.filter(x=>x instanceof Circle).length,9); // pitch + 8 holes
assert.equal(bolt.filter(x=>x instanceof Centerline).length,18); // centre + 8 marks
const flange = createFlange({center:{x:0,y:0},outerRadius:55,boreRadius:15,pitchRadius:40,holeCount:6,holeRadius:4});
assert.ok(flange.some(x=>x instanceof Circle && x.radius===55));
assert.equal(flange.filter(x=>x instanceof Circle && x.radius===4).length,6);
assert.throws(()=>createFlange({outerRadius:20,boreRadius:25}),RangeError);

const plate = createPlate({center:{x:0,y:0},width:100,height:60,chamfer:5,holes:[{x:-30,y:0,radius:4},{x:30,y:0,radius:4}]});
assertTypes([plate[0]],Polygon,1);
assert.equal(plate.filter(x=>x instanceof Circle).length,2);
const hex = createHexHead({x:0,y:0},24);
assertTypes(hex,Polygon,1);
assert.equal(hex[0].vertices.length,6);
const shaft = createSteppedShaft({center:{x:0,y:0},steps:[{length:20,diameter:10},{length:30,diameter:20}]});
assert.ok(shaft.some(x=>x instanceof Polygon));
assert.ok(shaft.some(x=>x instanceof Centerline));
const bushing = createBushing({x:0,y:0},25,10);
assert.equal(bushing.filter(x=>x instanceof Circle).length,2);
const washer = createWasher({x:0,y:0},24,10);
assert.equal(washer.filter(x=>x instanceof Circle).length,2);
const bearing = createBearing({x:0,y:0},32,14,5,8);
assert.equal(bearing.filter(x=>x instanceof Circle).length,11);
const counterbore = createCounterboreHole({x:0,y:0},4,8);
assert.equal(counterbore.filter(x=>x instanceof Circle).length,2);
const holeArray = createHoleArray({origin:{x:10,y:20},rows:2,columns:3,pitchX:30,pitchY:25,radius:4});
assert.equal(holeArray.filter(x=>x instanceof Circle).length,6);

for (const entry of TEMPLATE_CATALOG) {
  const objects = createTemplate(entry.id);
  assert.ok(objects.length > 0, `Template ${entry.id} should create geometry`);
  const restored = deserializeScene(serializeScene(objects));
  assert.equal(restored.length,objects.length,`Template ${entry.id} should serialize`);
}
assert.throws(()=>createTemplate('missing'),RangeError);
console.log(`All parametric template tests passed (${TEMPLATE_CATALOG.length} templates).`);
