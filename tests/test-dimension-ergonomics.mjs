import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

assert.match(html, /id="dimensionLabelRotationSlider" type="range" min="-360" max="360" step="0.5"/);
assert.match(html, /data-dimension-rotation-step="-1"/);
assert.match(html, /data-dimension-rotation-step="1"/);
assert.match(html, /id="dimensionSelectedOffsetSlider" type="range" min="10" max="200" step="0.1"/);
assert.match(html, /id="dimensionSelectedOffset" type="number" step="0.1"/);
assert.doesNotMatch(html.match(/<input id="dimensionSelectedOffset"[^>]+/)[0], /max=/, 'Dimension offset input must have no arbitrary upper limit');
assert.match(html, /data-dimension-offset-step="-0.1"/);
assert.match(html, /data-dimension-offset-step="0.1"/);
assert.match(html, /id="dimensionExtensionStartSlider" type="range" min="0" max="50" step="0.1"/);
assert.match(html, /id="dimensionExtensionEndSlider" type="range" min="0" max="50" step="0.1"/);
assert.match(app, /function bindDimensionLiveSlider\(sliderId,numberId,field,min,max,message,transformValue=null,adaptiveMax=false\)/);
assert.match(app, /syncDimensionLengthSliders\(dims\)/);
assert.match(app, /adaptiveMax\?Infinity:max/);
assert.match(app, /bindDimensionLiveSlider\('dimensionSelectedOffsetSlider'[\s\S]*?\(o,value\)=>\(Number\(o\.offset\)<0\?-1:1\)\*value,true\)/);
assert.match(app, /bindDimensionLiveSlider\('dimensionLabelRotationSlider','dimensionLabelRotation','labelRotationDeg',-360,360/);
assert.match(app, /if\(JSON\.stringify\(original\.objects\)!==JSON\.stringify\(state\.objects\)\)\{commit\(original\)/);
assert.match(app, /dimensionExtensionSpec\(o,'start'\)/);
assert.match(app, /dimensionExtensionSpec\(o,'end'\)/);
assert.match(app, /data-dimension-rotation-step/);
assert.match(app, /data-dimension-offset-step/);
console.log('Dimension ergonomics tests passed: label rotation, fine dimension-leg adjustment and extension controls.');
