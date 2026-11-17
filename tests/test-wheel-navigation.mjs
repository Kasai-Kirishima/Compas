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
const updateFn=app.indexOf('function updateSelectedDimension(');
const firstUse=app.indexOf("updateSelectedDimension('arrowSize'");
assert.ok(updateFn>=0&&firstUse>updateFn,'dimension setup helper must be initialized before first use (avoid startup TDZ crash)');
assert.match(app,/drawingArea\.addEventListener\('wheel',[\s\S]*?e\.preventDefault\(\);e\.stopPropagation\(\);[\s\S]*?setZoomAt\(state\.zoom\*wheelZoomFactor\(deltaY\),e\.clientX,e\.clientY\)/,'wheel over the drawing viewport must prevent native scrolling and zoom at the pointer');
assert.doesNotMatch(app,/window\.addEventListener\('wheel'/,'wheel handling is scoped directly to the drawing viewport');
assert.match(app,/drawingArea\.addEventListener\('pointerdown',[\s\S]*?e\.button===1\|\|e\.button===2\|\|\(state\.space&&e\.button===0\)[\s\S]*?\{capture:true\}/,'right/middle/Space+left gestures must be captured before SVG tools');
assert.match(app,/if\(e\.button===1\|\|e\.button===2\|\|state\.space\)[\s\S]*?state\.pan=\{[\s\S]*?button:e\.button[\s\S]*?drawingArea\.setPointerCapture\(e\.pointerId\)/,'right and middle drag must start viewport panning and capture the pointer');
assert.match(app,/drawingArea\.addEventListener\('contextmenu',e=>\{e\.preventDefault\(\);\},\{capture:true\}\)/,'right-button panning must suppress the browser context menu');
assert.match(app,/svg\.addEventListener\('pointerdown',e=>\{if\(e\.button!==1&&e\.button!==2&&!state\.space\)/,'navigation buttons must not fall through to SVG draw/select handlers');
assert.match(app,/function finishPan\(pointerId=null\)[\s\S]*?drawingArea\.classList\.remove\('dragging'\)[\s\S]*?persistAutosave\(\)/,'pan must clean up and persist the view on release');
assert.match(app,/addEventListener\('pointercancel',onPointerUp\)/,'cancelled pointer gestures must also release panning');

const css=await (await import('node:fs/promises')).readFile(new URL('../styles.css',import.meta.url),'utf8');
assert.match(css,/\.drawing-area\{[^}]*overflow:hidden/,'viewport must not natively scroll the page or canvas instead of zooming/panning');

console.log('PASS: startup-safe dimension setup, canvas wheel zoom without native page scroll, right/middle/Space pan');
