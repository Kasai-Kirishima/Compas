import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

assert.match(html, /id="dimensionLabelRotationSlider" type="range" min="-360" max="360" step="0.5"/);
assert.match(html, /data-dimension-rotation-step="-1"/);
assert.match(html, /data-dimension-rotation-step="1"/);
assert.match(html, /id="dimensionSelectedOffsetSlider" type="range" min="10" max="200" step="0.1"/);
assert.match(html, /id="dimensionSelectedOffset" type="number" min="-200" max="200" step="0.1"/);
assert.match(html, /data-dimension-offset-step="-0.1"/);
assert.match(html, /data-dimension-offset-step="0.1"/);
assert.match(html, /id="dimensionExtensionBeyondSlider" type="range" min="0.1" max="10" step="0.1"/);
assert.match(app, /function bindDimensionLiveSlider\(sliderId,numberId,field,min,max,message,transformValue=null\)/);
assert.match(app, /bindDimensionLiveSlider\('dimensionSelectedOffsetSlider'[\s\S]*?\(o,value\)=>\(Number\(o\.offset\)<0\?-1:1\)\*value\)/);
assert.match(app, /bindDimensionLiveSlider\('dimensionLabelRotationSlider','dimensionLabelRotation','labelRotationDeg',-360,360/);
assert.match(app, /if\(JSON\.stringify\(original\.objects\)!==JSON\.stringify\(state\.objects\)\)\{commit\(original\)/);
assert.match(app, /extension=clamp\(Number\(o\.extensionBeyond\?\?2\),\.1,10\)/);
assert.match(app, /data-dimension-rotation-step/);
assert.match(app, /data-dimension-offset-step/);
console.log('Dimension ergonomics tests passed: label rotation, fine dimension-leg adjustment and extension controls.');
