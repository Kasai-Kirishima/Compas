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
assert.ok(Math.abs(wheelZoomFactor(-120)-1.154)<.003,'one traditional notch gives a responsive ~15% zoom step');

const app=await (await import('node:fs/promises')).readFile(new URL('../js/app.js',import.meta.url),'utf8');
assert.match(app,/window\.addEventListener\('wheel',[\s\S]*?const r=drawingArea\.getBoundingClientRect\(\)[\s\S]*?e\.clientX<r\.left[\s\S]*?\{capture:true,passive:false\}\)/,'wheel zoom must be captured before SVG descendants and hit-tested against the drawing viewport');
assert.match(app,/e\.preventDefault\(\);e\.stopPropagation\(\);[\s\S]*?setZoomAt\(state\.zoom\*wheelZoomFactor\(deltaY\),e\.clientX,e\.clientY\)/,'wheel input inside the viewport must suppress browser scrolling and zoom at the pointer');
assert.doesNotMatch(app,/drawingArea\.addEventListener\('wheel'/,'wheel handling must not depend on nested viewport bubbling');
assert.match(app,/setZoomAt\(state\.zoom\*wheelZoomFactor\(deltaY\),e\.clientX,e\.clientY\)/,'zoom must remain centred on the cursor');
assert.match(app,/const MIN_ZOOM=\.1, MAX_ZOOM=32/,'manual zoom should allow deep zoom in and out');
assert.match(app,/drawingArea\.addEventListener\('pointerdown',[\s\S]*?\{capture:true\}\)/,'pan gestures must be intercepted at the viewport in capture phase');
assert.match(app,/drawingArea\.addEventListener\('pointerdown',[\s\S]*?e\.button===1\|\|e\.button===2\|\|\(state\.space&&e\.button===0\)[\s\S]*?\{capture:true\}\)/,'right, middle and Space+left gestures must be captured before SVG tools');
assert.match(app,/if\(e\.button===1\|\|e\.button===2\|\|state\.space\)[\s\S]*?state\.pan=\{[\s\S]*?button:e\.button[\s\S]*?drawingArea\.setPointerCapture\(e\.pointerId\)/,'right and middle drag must start viewport panning and capture the pointer');
assert.match(app,/drawingArea\.addEventListener\('contextmenu',e=>\{e\.preventDefault\(\);\},\{capture:true\}\)/,'right-button panning must suppress the browser context menu');
assert.match(app,/if\(pan\.button===2&&!pan\.moved&&\(state\.tool==='polyline'\|\|state\.tool==='spline'\)\)finishPath\(\)/,'stationary right click keeps the polyline/spline finish gesture');
assert.match(app,/svg\.addEventListener\('pointerdown',e=>\{if\(e\.button!==1&&e\.button!==2&&!state\.space\)/,'right and middle buttons must not fall through to SVG draw/select handlers');
assert.match(app,/if\(state\.pan\)[\s\S]*?state\.pan\.pointerId!==undefined&&e\.pointerId!==state\.pan\.pointerId/,'only the captured pointer may move the viewport');
assert.match(app,/function finishPan\(pointerId=null\)[\s\S]*?drawingArea\.classList\.remove\('dragging'\)[\s\S]*?persistAutosave\(\)/,'pan must clean up and persist the view on release');
assert.match(app,/addEventListener\('pointercancel',onPointerUp\)/,'cancelled pointer gestures must also release panning');

console.log('PASS: cursor-centred wheel zoom, responsive wheel steps, right/middle-button pan and pointer capture');
