import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

for (const id of [
  'dimensionArrowStyle', 'dimensionArrowStartStyle', 'dimensionArrowEndStyle',
  'dimensionArrowSize', 'dimensionLabelRotation', 'dimensionLabelRotationSlider',
  'dimensionSelectedOffset', 'dimensionSelectedOffsetSlider',
  'dimensionExtensionStartSlider', 'dimensionExtensionStart',
  'dimensionExtensionEndSlider', 'dimensionExtensionEnd', 'resetDimensionLabelRotation'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `The dimension properties panel must expose ${id}`);
}
assert.match(html, /value="open">Открытая V-стрелка/);
assert.match(html, /value="tick">Косая засечка/);
assert.match(html, /value="dot">Точка/);
assert.match(html, /value="none">Без стрелок/);
assert.match(html, /Поворот только цифры/);
assert.match(html, /data-dimension-rotation-step="-1"/);
assert.match(html, /data-dimension-rotation-step="1"/);
assert.match(html, /data-dimension-extension-side="start" data-dimension-extension-step="-0.1"/);
assert.match(html, /data-dimension-extension-side="end" data-dimension-extension-step="0.1"/);
assert.match(html, /data-dimension-offset-step="-0.1"/);
assert.match(html, /data-dimension-offset-step="0.1"/);
assert.match(html, /id="dimensionSelectedOffset" type="number" min="-200" max="200" step="0.1"/);
assert.match(html, /id="dimensionSelectedOffsetSlider" type="range" min="10" max="200" step="0.1"/);
assert.match(html, /id="dimensionExtensionStart" type="number" min="0.1" max="50" step="0.1"/);
assert.match(html, /id="dimensionExtensionEnd" type="number" min="0.1" max="50" step="0.1"/);
assert.match(html, /id="dimensionExtensionStartSlider" type="range" min="0.1" max="50" step="0.1"/);
assert.match(html, /id="dimensionExtensionEndSlider" type="range" min="0.1" max="50" step="0.1"/);

assert.match(app, /function dimensionArrow\([\s\S]*?style='filled'/, 'Dimension arrow renderer must accept an editable arrow style');
assert.match(app, /style==='open'/, 'Open V arrowheads must be rendered');
assert.match(app, /style==='tick'/, 'Tick arrowheads must be rendered');
assert.match(app, /style==='dot'/, 'Dot arrowheads must be rendered');
assert.match(app, /style==='none'/, 'Arrowheads must be independently suppressible');
assert.match(app, /function dimensionArrowStyle\(o,end\)/, 'Each endpoint must support its own style override');
assert.match(app, /arrowStartStyle/);
assert.match(app, /arrowEndStyle/);
assert.match(app, /Number\(o\.arrowSize\)[\s\S]*?\.8,12/, 'Per-dimension arrow size must be applied with a useful adjustable range');
assert.match(app, /labelRotationExtra=clamp\(Number\(o\.labelRotationDeg\)/, 'Dimension label rotation must be stored separately from dimension geometry');
assert.match(app, /dimensionLabel\(g,mx,my,`R\$\{label\}`,textSize,color,labelRotationExtra\)/, 'Radius label must use independent rotation');
assert.match(app, /dimensionLabel\(g,labelX,labelY,`⌀\$\{label\}`,textSize,color,labelRotationExtra,\{lowerDiameterSign:true\}\)/, 'Diameter label must use independent rotation while lowering only the ⌀ glyph');
assert.match(app, /dimensionLabel\(g,labelX,labelY,label,textSize,color,labelRotationExtra\)/, 'Angular label must use independent rotation');
assert.match(app, /finalLabelRotation=\(horizontal\?0:labelRotation\)\+labelRotationExtra/, 'Linear label rotation must be additive and independent');
assert.match(app, /updateSelectedDimension\('labelRotationDeg','dimensionLabelRotation'/);
assert.match(app, /bindDimensionLiveSlider\('dimensionLabelRotationSlider','dimensionLabelRotation','labelRotationDeg',-360,360/);
assert.match(app, /bindDimensionLiveSlider\('dimensionSelectedOffsetSlider','dimensionSelectedOffset','offset',10,200/);
assert.match(app, /bindDimensionLiveSlider\('dimensionExtensionStartSlider','dimensionExtensionStart','extensionBeyondStart',\.1,50/);
assert.match(app, /bindDimensionLiveSlider\('dimensionExtensionEndSlider','dimensionExtensionEnd','extensionBeyondEnd',\.1,50/);
assert.match(app, /data-dimension-rotation-step/);
assert.match(app, /data-dimension-extension-step/);
assert.match(app, /data-dimension-offset-step/);
assert.match(app, /dimensionExtensionSpec\(o,'start'\)/);
assert.match(app, /dimensionExtensionSpec\(o,'end'\)/);
assert.match(app, /resetDimensionLabelRotation/);

console.log('Dimension arrow editing and independent label rotation tests passed (25 assertions).');
