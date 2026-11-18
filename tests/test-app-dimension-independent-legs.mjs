import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

assert.match(html, /id="dimensionExtensionStart"/);
assert.match(html, /id="dimensionExtensionEnd"/);
assert.match(html, /data-dimension-extension-side="start"/);
assert.match(html, /data-dimension-extension-side="end"/);
assert.match(html, /противоположная остаётся на месте/);
assert.match(app, /data-dimension-extension-handle/);
assert.match(app, /beginDimensionExtensionDrag\(e,objGroup\.getAttribute\('data-id'\),extensionHandle\.getAttribute\('data-dimension-extension-handle'\)\)/);
assert.match(app, /const value=dimensionExtensionLengthFromPoint\(d,raw,\.1,50\)/);
assert.match(app, /o\[d\.field\]=mm\(value\)/);
assert.match(app, /drawDimensionExtensionHandle\(g,dimensionExtensionSpec\(o,'start'\),selected,o\.locked\)/);
assert.match(app, /drawDimensionExtensionHandle\(g,dimensionExtensionSpec\(o,'end'\),selected,o\.locked\)/);
assert.match(app, /bindDimensionLiveSlider\('dimensionExtensionStartSlider','dimensionExtensionStart','extensionBeyondStart'/);
assert.match(app, /bindDimensionLiveSlider\('dimensionExtensionEndSlider','dimensionExtensionEnd','extensionBeyondEnd'/);
assert.match(app, /button\.dataset\.dimensionExtensionSide==='end'\?'end':'start'/);
console.log('Dimension independent-leg UI tests passed: separate handles, sliders, inputs and one-sided drag.');
