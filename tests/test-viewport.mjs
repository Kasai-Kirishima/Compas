import assert from 'node:assert/strict';
import {zoomView,panView,wheelZoomFactor} from '../src/viewport.mjs';

const base={x:0,y:0,width:297,height:420};
const zoomed=zoomView(base,2,{x:.25,y:.75});
assert.equal(zoomed.width,148.5);
assert.equal(zoomed.height,210);
assert.ok(Math.abs((base.x+base.width*.25)-(zoomed.x+zoomed.width*.25))<1e-9,'zoom keeps the cursor anchor fixed horizontally');
assert.ok(Math.abs((base.y+base.height*.75)-(zoomed.y+zoomed.height*.75))<1e-9,'zoom keeps the cursor anchor fixed vertically');
const panned=panView(base,100,50,500,500);
assert.ok(Math.abs(panned.x+59.4)<1e-9);
assert.ok(Math.abs(panned.y+42)<1e-9);
assert.ok(wheelZoomFactor(-100)>1,'wheel up zooms in');
assert.ok(wheelZoomFactor(100)>0 && wheelZoomFactor(100)<1,'wheel down zooms out');
assert.ok(wheelZoomFactor(-100,0,true)>wheelZoomFactor(-100),'pinch zoom has a stronger response');
console.log('viewport: ok (cursor-anchored zoom, pointer pan, wheel and trackpad factors)');
