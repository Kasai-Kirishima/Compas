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
assert.match(html, /value="single">Стрелочка 1 — один конец пустой, стрелка на конце 2/);
assert.match(html, /value="open">Две открытые V-стрелки/);
assert.match(html, /value="tick">Две косые засечки/);
assert.match(html, /value="dot">Две точки/);
assert.match(html, /value="none">Без стрелок/);
assert.match(html, /Поворот только цифры/);
assert.match(html, /data-dimension-rotation-step="-1"/);
assert.match(html, /data-dimension-rotation-step="1"/);
assert.match(html, /data-dimension-extension-side="start" data-dimension-extension-step="-0.1"/);
assert.match(html, /data-dimension-extension-side="end" data-dimension-extension-step="0.1"/);
assert.match(html, /data-dimension-offset-step="-0.1"/);
assert.match(html, /data-dimension-offset-step="0.1"/);
assert.match(html, /id="dimensionSelectedOffset" type="number" step="0.1"/);
assert.doesNotMatch(html.match(/<input id="dimensionSelectedOffset"[^>]+/)[0], /max=/);
assert.match(html, /id="dimensionSelectedOffsetSlider" type="range" min="10" max="200" step="0.1"/);
assert.match(html, /id="dimensionExtensionStart" type="number" min="0" step="0.1"/);
assert.match(html, /id="dimensionExtensionEnd" type="number" min="0" step="0.1"/);
assert.match(html, /id="dimensionExtensionStartSlider" type="range" min="0" max="50" step="0.1"/);
assert.match(html, /id="dimensionExtensionEndSlider" type="range" min="0" max="50" step="0.1"/);

assert.match(app, /function dimensionArrow\([\s\S]*?style='filled'/, 'Dimension arrow renderer must accept an editable arrow style');
assert.match(app, /style==='open'/, 'Open V arrowheads must be rendered');
assert.match(app, /style==='tick'/, 'Tick arrowheads must be rendered');
assert.match(app, /style==='dot'/, 'Dot arrowheads must be rendered');
assert.match(app, /style==='none'/, 'Arrowheads must be independently suppressible');
assert.match(app, /function dimensionArrowStyle\(o,end\)/, 'Each endpoint must support its own style override');
assert.match(app, /if\(o\.arrowStyle==='single'\)return end==='End'\?'filled':'none'/, 'The single-arrow preset must leave endpoint 1 empty and draw one arrow at endpoint 2');
const arrowStyleBody = app.match(/function dimensionArrowStyle\(o,end\)\{([\s\S]*?)\n  \}/)?.[1];
assert.ok(arrowStyleBody, 'The arrow style resolver must exist');
const resolveArrowStyle = new Function('o', 'end', arrowStyleBody);
assert.equal(resolveArrowStyle({arrowStyle:'single'}, 'Start'), 'none', 'The first end must stay empty');
assert.equal(resolveArrowStyle({arrowStyle:'single'}, 'End'), 'filled', 'The second end must keep a filled arrow');
assert.equal(resolveArrowStyle({arrowStyle:'single', arrowStartStyle:'dot'}, 'Start'), 'dot', 'Explicit endpoint overrides must still win');
assert.equal((app.match(/\['filled','single','open','tick','dot','none'\]\.includes\(/g)||[]).length, 2, 'The single-arrow preset must remain visible when one or multiple dimensions are selected');
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
assert.match(app, /bindDimensionLiveSlider\('dimensionSelectedOffsetSlider','dimensionSelectedOffset','offset',10,Infinity/);
assert.match(app, /bindDimensionLiveSlider\('dimensionExtensionStartSlider','dimensionExtensionStart','extensionBeyondStart',0,Infinity/);
assert.match(app, /bindDimensionLiveSlider\('dimensionExtensionEndSlider','dimensionExtensionEnd','extensionBeyondEnd',0,Infinity/);
assert.match(app, /data-dimension-rotation-step/);
assert.match(app, /data-dimension-extension-step/);
assert.match(app, /data-dimension-offset-step/);
assert.match(app, /dimensionExtensionSpec\(o,'start'\)/);
assert.match(app, /dimensionExtensionSpec\(o,'end'\)/);
assert.match(app, /resetDimensionLabelRotation/);

console.log('Dimension arrow editing, single-arrow preset and independent label rotation tests passed.');
