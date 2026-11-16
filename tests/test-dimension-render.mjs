import assert from 'node:assert/strict';
import {
  LinearDimension, DiameterDimension, drawLinearDimension, drawDiameterDimension,
  formatDimensionValue, getDimensionTextLayout, dimensionDrawingSegments,
  serializeScene, deserializeScene, rotatePrimitive, mirrorPrimitive, scalePrimitive, nearestGostTextHeight
} from '../src/cad-geometry-trim.mjs';

const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b}`);

// Horizontal, vertical and aligned orientation modes.
const horizontal = new LinearDimension({x:0,y:0},{x:50,y:0},8,{textHeight:5});
const vertical = new LinearDimension({x:0,y:0},{x:0,y:50},8,{textHeight:5});
const reverseVertical = new LinearDimension({x:0,y:50},{x:0,y:0},8,{textHeight:5});
const reverseHorizontal = new LinearDimension({x:50,y:0},{x:0,y:0},8,{textHeight:5});
const diagonal = new LinearDimension({x:0,y:0},{x:30,y:40},8,{textOrientation:'aligned',textHeight:5});
near(getDimensionTextLayout(horizontal).angle,0);
near(getDimensionTextLayout(vertical).angle,Math.PI/2);
near(getDimensionTextLayout(reverseVertical).angle,Math.PI/2);
near(getDimensionTextLayout(reverseHorizontal).angle,0);
assert.ok(getDimensionTextLayout(reverseHorizontal).center.y > reverseHorizontal.geometry().middle.y);
near(getDimensionTextLayout(diagonal).angle,Math.atan2(40,30));
assert.ok(getDimensionTextLayout(horizontal).center.y > horizontal.geometry().middle.y);
assert.ok(getDimensionTextLayout(vertical).center.x < vertical.geometry().middle.x);

// Correct compact engineering number formatting.
assert.equal(formatDimensionValue(25), '25');
assert.equal(formatDimensionValue(25.5), '25,5');
assert.equal(formatDimensionValue(25.567), '25,57');
assert.equal(formatDimensionValue(25.5,{precision:3,trimTrailingZeros:false}), '25,500');
assert.equal(formatDimensionValue(-0.00001), '0');
assert.equal(getDimensionTextLayout(new DiameterDimension({x:0,y:0},12)).label, 'Ø24');
assert.equal(nearestGostTextHeight(7.5),7);
assert.equal(nearestGostTextHeight(9),10);
assert.throws(()=>nearestGostTextHeight(0),RangeError);

// The linework gap is represented in editable segments; the text background remains transparent.
assert.ok(dimensionDrawingSegments(horizontal).length >= 8);
const calls=[];
const ctx={
  save(){},restore(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},closePath(){},fill(){},
  translate(){},rotate(a){calls.push(['rotate',a]);},scale(){},fillText(t){calls.push(['text',t]);},
  measureText(t){return {width:String(t).length*3,actualBoundingBoxAscent:4,actualBoundingBoxDescent:1};},
  set strokeStyle(v){},set fillStyle(v){},set lineWidth(v){},set font(v){},set textAlign(v){},set textBaseline(v){}
};
drawLinearDimension(ctx,horizontal);
drawLinearDimension(ctx,vertical);
drawLinearDimension(ctx,diagonal);
drawDiameterDimension(ctx,new DiameterDimension({x:0,y:0},12,{angle:Math.PI/3}));
assert.ok(calls.some(x=>x[0]==='text'));
assert.ok(calls.some(x=>x[0]==='rotate' && Math.abs(x[1]-Math.PI/2)<1e-8));
assert.ok(calls.every(x=>x[0]!=='fillRect'), 'Dimension renderer must not paint an opaque white knockout');

// Dimension settings survive transformations and JSON serialization.
const custom = new LinearDimension({x:0,y:0},{x:20,y:30},5,{textHeight:7,textOrientation:'vertical',textSide:'negative',precision:1,showLines:false});
for (const obj of [rotatePrimitive(custom,{x:0,y:0},.2), mirrorPrimitive(custom,{x:0,y:0},{x:0,y:1}), scalePrimitive(custom,2)]) {
  assert.equal(obj.textOrientation,'vertical');
  assert.equal(obj.textSide,'negative');
  assert.equal(obj.showLines,false);
}
const scaledByNonStandardFactor = scalePrimitive(custom,1.5);
assert.equal(scaledByNonStandardFactor.textHeight,10);
const restored=deserializeScene(serializeScene([custom]))[0];
assert.equal(restored.textOrientation,'vertical');
assert.equal(restored.precision,1);
assert.equal(restored.showLines,false);

console.log('All orientation-aware dimension render tests passed.');
