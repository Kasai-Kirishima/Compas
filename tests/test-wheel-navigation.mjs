import assert from 'node:assert/strict';
import { normalizeWheelDeltas, wheelZoomFactor } from '../src/wheel-navigation.mjs';

assert.deepEqual(normalizeWheelDeltas({deltaX:0,deltaY:-120,deltaMode:0}),{deltaX:0,deltaY:-120});
assert.deepEqual(normalizeWheelDeltas({deltaX:1,deltaY:-2,deltaMode:1}),{deltaX:16,deltaY:-32});
assert.deepEqual(normalizeWheelDeltas({deltaX:1,deltaY:-.5,deltaMode:2},{width:800,height:600}),{deltaX:800,deltaY:-300});
assert.deepEqual(normalizeWheelDeltas({deltaX:0,deltaY:0,wheelDelta:-120}),{deltaX:0,deltaY:120});
assert.deepEqual(normalizeWheelDeltas({deltaX:0,deltaY:0,wheelDeltaX:40,wheelDeltaY:-80}),{deltaX:-40,deltaY:80});
assert.ok(wheelZoomFactor(-120)>1,'wheel up zooms in');
assert.ok(wheelZoomFactor(120)<1,'wheel down zooms out');
assert.equal(wheelZoomFactor(0),1);
assert.ok(Math.abs(wheelZoomFactor(-120)-1.1008)<.002,'one traditional notch is about 10%');

const app=await (await import('node:fs/promises')).readFile(new URL('../js/app.js',import.meta.url),'utf8');
assert.match(app,/drawingArea\.addEventListener\('wheel',[\s\S]*?\{capture:true,passive:false\}\)/,'wheel listener must capture events at the drawing viewport before SVG descendants');
assert.doesNotMatch(app,/document\.addEventListener\('wheel'/,'wheel handling must not rely on document target delegation');
assert.match(app,/setZoomAt\(state\.zoom\*wheelZoomFactor\(deltaY\),e\.clientX,e\.clientY\)/,'zoom must remain centred on the cursor');
assert.match(app,/const MIN_ZOOM=\.1, MAX_ZOOM=32/,'manual zoom should allow deep zoom in and out');

console.log('PASS: wheel zoom, legacy input, trackpad normalization and scoped capture');
