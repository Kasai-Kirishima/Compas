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
assert.match(js, /\$\('zoomIn'\)\.onclick=\(\)=>setZoom\(1\.25\)/, 'plus button must zoom the workspace camera');
assert.match(js, /\$\('zoomOut'\)\.onclick=\(\)=>setZoom\(\.8\)/, 'minus button must zoom the workspace camera');
assert.match(html, /id="sheetRoot"/, 'page geometry and border must live inside a movable paper group');
assert.match(js, /sheetRoot\?\.getScreenCTM/, 'pointer coordinates must be transformed into paper-local coordinates');
assert.match(js, /\[65,135\]\.forEach\(dx=>line\(x\+dx,y,x\+dx,y\+55/, 'Form 1 keeps the main upper dividers across the full title block');
assert.match(js, /\[7,17,40,55\]\.forEach\(dx=>line\(x\+dx,y\+15,x\+dx,y\+55/, 'Form 1 approval-column dividers begin below the 15 mm header band');
assert.match(js, /line\(x,y\+15,x\+185,y\+15/, 'Form 1 header band spans the full title block width');
assert.match(js, /function renderLab8SampleTemplate\(/, 'the sample template must be a full page template');
assert.match(js, /const ink='#111111'/, 'all template linework must be black');
assert.match(js, /function renderKompasLab5Template\(/, 'uploaded Kompas Online frame must be available as a reusable template');
assert.match(js, /kompas-lab5-a4-template/, 'Kompas Online KCAD template must be selectable');
assert.doesNotMatch(js, /#1837ff|#1837FF/, 'no blue template linework remains');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
assert.match(css, /#templateLayer/, 'template layer styling is present');
assert.match(css, /@media print[^{]*\{[^}]*#templateLayer/s, 'monochrome black remains a print-only override');
assert.match(js, /title\.company\|\|'ШЦМГУ'/, 'institution text from the sample must be printed in the title block');
assert.match(js, /title\.copy\|\|'Копировал'/, 'the copy footer from the reference must be present');
assert.match(js, /Формат \$\{title\.sheetFormat\|\|'А3'\}/, 'the A3 format footer must be present');
assert.match(js, /captionW=3\.8/, 'left margin boxes must contain the narrow vertical caption field');
assert.match(js, /title\.variant\|\|'Вариант 8'/, 'the supplied sample variant text must be present');
assert.match(js, /title\.leftHeader\|\|'10 ХХ ХХ д\/ 02206018'/, 'the top-left reference label must be reproduced');
assert.match(js, /drawing\.addEventListener\('pointerdown',handlePointerDown\)/, 'modern pointerdown must drive drawing tools');
assert.match(js, /drawing\.setPointerCapture\(evt\.pointerId\)/, 'pointer capture must keep drawing and panning active outside the canvas');
assert.match(js, /window\.addEventListener\('pointermove',onCanvasMouseMove\)/, 'pointer movement must reach canvas navigation');
assert.match(js, /window\.addEventListener\('pointerup',onCanvasMouseUp\)/, 'pointer release must finish canvas gestures');
assert.match(js, /function onCanvasWheel\(/, 'wheel and touchpad navigation handler must be present');
assert.match(js, /Math\.abs\(dy\)<70/, 'smooth precision touchpad scrolling must pan the sheet rather than resize the frame');
assert.match(js, /panView\(state\.view,dx,dy/, 'two-finger touchpad scroll must move the complete page in workspace');
assert.match(js, /wheelZoomFactor/, 'wheel zoom must use normalized input deltas');

for (const match of js.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  const spec = match[1];
  if (spec.startsWith('.')) assert.ok(existsSync(resolve(root, 'js', spec)), `Missing JavaScript module: ${spec}`);
}
console.log(`app contract: ok (${ids.length} unique HTML ids, ${referencedIds.size} static JS references)`);
