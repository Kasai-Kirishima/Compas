import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const js = readFileSync(resolve(root, 'js/app.js'), 'utf8');
const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]);
const idSet = new Set(ids);
assert.equal(ids.length, idSet.size, 'HTML contains duplicate IDs');

const referencedIds = new Set([...js.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m => m[1]));
const generatedIds = new Set(['dynamicPrintPageStyle']);
const missing = [...referencedIds].filter(id => !idSet.has(id) && !generatedIds.has(id));
assert.deepEqual(missing, [], `JavaScript references missing HTML element IDs: ${missing.join(', ')}`);

for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
  const src = match[1];
  if (!/^(https?:)?\/\//.test(src)) assert.ok(existsSync(resolve(root, src)), `Missing script asset: ${src}`);
}
for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/g)) {
  const href = match[1];
  if (!/^(https?:)?\/\//.test(href) && !href.startsWith('#')) assert.ok(existsSync(resolve(root, href)), `Missing linked asset: ${href}`);
}
assert.match(js, /drawing\.addEventListener\('mousedown',onCanvasMouseDown\)/, 'drawing surface must receive reliable laptop mouse input');
assert.match(js, /function updateSelectionByProps\(/, 'property-panel change handler must exist before bind() finishes');
assert.match(js, /addEventListener\('change',updateSelectionByProps\)/, 'property controls must bind to the declared property updater');
assert.doesNotMatch(js, /updateSelectedByProps/, 'misspelled callback must not abort application initialization');
assert.match(js, /function populateNewDocTemplateOptions\(/, 'new-document template menu must be populated dynamically');
assert.match(js, /populateNewDocTemplateOptions\(\)/, 'new-document modal must populate frame options');
assert.match(js, /const margin=blue\?5:10/, 'legacy sample frame drawing must have a defined margin');
assert.match(js, /spaceDown\|\|evt\.altKey\|\|state\.tool==='pan'/, 'laptop pan fallback must support Space/Alt drag and pan tool');
assert.match(js, /window\.addEventListener\('mousemove',onCanvasMouseMove\)/, 'drag motion must continue when the cursor leaves the SVG');
assert.match(js, /window\.addEventListener\('mouseup',onCanvasMouseUp\)/, 'drawing must finish when the mouse is released');
assert.match(js, /svg\.viewBox\?\.baseVal/, 'SVG coordinates must have a viewBox fallback');
assert.match(js, /templateToggle.*templateVisible|templateVisible.*templateToggle/, 'template visibility controls must stay synchronized');
assert.match(js, /drawing\.addEventListener\('wheel'/, 'wheel zoom must work over the drawing area');
assert.match(js, /evt\.button===1/, 'middle mouse button must pan the sheet');
assert.match(js, /evt\.button===2/, 'right mouse button must also pan the sheet');
assert.match(html, /id="panModeBtn"/, 'visible pan mode button must exist for laptops without a middle mouse button');
assert.match(js, /drawGesture/, 'drag-to-draw gesture handling must be present');
assert.match(js, /function zoomFromWheel/, 'wheel zoom handler must be present');
assert.match(js, /drawing\.addEventListener\('pointerdown',handlePointerDown\)/, 'modern pointerdown must drive drawing tools');
assert.match(js, /drawing\.setPointerCapture\(evt\.pointerId\)/, 'pointer capture must keep drawing and panning active outside the canvas');
assert.match(js, /window\.addEventListener\('pointermove',onCanvasMouseMove\)/, 'pointer movement must reach canvas navigation');
assert.match(js, /window\.addEventListener\('pointerup',onCanvasMouseUp\)/, 'pointer release must finish canvas gestures');
assert.match(js, /function onCanvasWheel\(/, 'wheel and touchpad navigation handler must be present');
assert.match(js, /wheelZoomFactor/, 'wheel zoom must use normalized input deltas');

for (const match of js.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  const spec = match[1];
  if (spec.startsWith('.')) assert.ok(existsSync(resolve(root, 'js', spec)), `Missing JavaScript module: ${spec}`);
}
console.log(`app contract: ok (${ids.length} unique HTML ids, ${referencedIds.size} static JS references)`);
