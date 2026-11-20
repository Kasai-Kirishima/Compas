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
assert.match(js, /\[7,17,40,55,65\]\.forEach\(dx=>line\(x\+dx,y,x\+dx,y\+bh/, 'sample change-register columns span the full 55 mm title-block height');
assert.match(js, /\[7,17,40,55,65\]\.forEach\(dx=>line\(x\+dx,y,x\+dx,y\+bh/, 'sample change-register columns span the full 55 mm title-block height');
assert.match(js, /\[5,10,15,20,27,34,41,48\]\.forEach\(dy=>line\(x,y\+dy,x\+65,y\+dy/, 'sample title block includes three blank upper rows and header/data rows');
assert.match(js, /rect\(16\.3,4,70\.5,14,\.30\)/, 'top-left document label box matches the reference proportions');
assert.match(js, /tx\(51\.55,13\.9,title\.leftHeader\|\|'10 ХХ ХХ д\/ 02206018',5\.6/, 'top-left document label is enlarged for readability');
assert.match(js, /headerText\.setAttribute\('textLength','65\.5'\)/, 'the enlarged upper-left text stays inside its cell');
assert.match(js, /roleLabel\.setAttribute\('textLength','5\.2'\)/, 'enlarged left role labels remain within the narrow signature register');
assert.match(js, /nameText\.setAttribute\('textLength','11\.8'\)/, 'developer and checker names remain inside their signature cell');
assert.equal((js.match(/line\(x\+65,y\+15,x\+185,y\+15,\.27\)/g)||[]).length,1,'document code divider must appear exactly once (no duplicate/extra divider)');
assert.match(js, /function renderLab8SampleTemplate\(/, 'the sample template must be a full page template');
assert.match(js, /lab8-a3-landscape-template/, 'the user sample must be available as a separate A3 landscape template');
assert.match(js, /addImportedProjectToLibrary\(project,file.name\)/, 'project import must stage files in the library instead of opening over the current drawing');
assert.match(js, /if\(dragDrawTools.has\(g.tool\)&&distPx>=3\)/, 'two-stage point-and-drag drawing must preview from the first anchor');
assert.match(js, /const pts=o.points\?\.length\?\[o.points\[0\],o.points\[o.points.length-1\]\]/, 'preview must show live endpoint markers');
assert.match(js, /function renderLab8SampleTemplate\([\s\S]*?const ink='#000000'/, 'the copied A3 sample frame uses pure black linework');
assert.match(js, /rect\(\.6,\.6,418\.8,295\.8,\.18\)/, 'sample includes the thin page perimeter');
assert.match(js, /rect\(4\.5,4,409,285,\.30\)/, 'sample frame has the measured A3 landscape inset');
assert.match(js, /const x=228\.5,y=234\.0,bw=185,bh=55/, 'sample title block is 185×55 mm at the reference bottom-right location');
assert.match(js, /tx\(x\+47\.5,yy,r\[1\],2\.3,'middle'/, 'author and teacher names are placed in the signature column, not the document-number column');
assert.match(js, /title\.code\|\|'8\.090220 ЛР XX XX 01',8\.0/, 'document code is enlarged for readability');
assert.match(js, /title\.sheet\|\|'1',4\.2/, 'sheet numerals are enlarged for readability');
assert.match(js, /title\.scale\|\|'1:1',4\.2/, 'scale numerals are enlarged for readability');
assert.match(js, /function renderKompasLab5Template\(/, 'uploaded Kompas Online frame must be available as a reusable template');
assert.match(js, /kompas-lab5-a4-template/, 'Kompas Online KCAD template must be selectable');
assert.doesNotMatch(js, /#1837ff|#1837FF/, 'no blue template linework remains');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
assert.match(css, /#templateLayer/, 'template layer styling is present');
assert.match(css, /@media print[^{]*\{[^}]*#templateLayer/s, 'monochrome black remains a print-only override');
assert.match(css, /\.drawing-area svg text,\s*\.drawing-area svg tspan\{stroke:none!important;stroke-width:0!important;\}/, 'PDF text must not inherit a black outline stroke that makes letters look bold');
assert.match(css, /#templateLayer text,#templateLayer tspan,\s*#sheetFrameLayer text,#sheetFrameLayer tspan\{fill:#000!important;\}/, 'template and frame text must remain solid black after disabling the print stroke');
assert.match(js, /title\.company\|\|'ШЦМГУ'/, 'institution text from the sample must be printed in the title block');
assert.match(js, /developer:'Кушвид О\.',checker:'Базиль Б\.'/,'developer and checker names are included by default');
assert.match(js, /title\.copy\|\|'Копіював'/, 'the copy footer from the reference must be present');
assert.match(js, /Формат \$\{title\.sheetFormat\|\|'А3'\}/, 'the A3 format footer must be present');
assert.match(js, /line\(9\.5,4,9\.5,124\.5,\.24\)/, 'upper left margin contains the two-column vertical divider');
assert.match(js, /\[64\.5,124\.5,145,180\.5,187,216,224\.5,261\.5\]/, 'left margin cell separators follow the supplied geometry');
assert.match(js, /title\.variant\|\|'Варіант 8'/, 'the supplied sample variant text must be present');
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

assert.match(js, /nameText\.setAttribute\('textLength','11\.8'\)/, 'signature names keep safe inner margins');

assert.match(js, /preserveAspectRatio:aspectMode/, 'reference image rendering must preserve aspect ratio by default');
assert.match(js, /function importReference\([\s\S]*?referenceImportSize\(/, 'reference import must use natural image dimensions');
assert.match(js, /function resizeSelectedReference\(/, 'reference width/height properties must support aspect-locked resizing');
assert.match(js, /referenceEnlarge2Btn/, 'reference must have a direct enlarge control');
assert.match(js, /data-reference-resize-handle/, 'selected reference must expose a proportional resize handle');
assert.match(js, /\$\('referenceKeepAspect'\)\.onchange/, 'preserve-aspect checkbox must be wired');

assert.match(html, /data-panel=\"references\"/, 'a dedicated References tab must be present next to Tools and Document');
assert.match(html, /id=\"referencesPanel\"/, 'dedicated references panel must exist');
assert.match(html, /id=\"referenceList\"/, 'reference panel must show the loaded image list');
assert.match(html, /id=\"referenceManagerPreview\"/, 'selected reference must have a larger preview');
assert.match(html, /id=\"referenceManagerOpacity\"/, 'reference manager must expose an independent opacity control');
assert.match(html, /id=\"referenceManagerLockBtn\"/, 'reference manager must expose lock/unlock');
assert.match(html, /id=\"referenceManagerFitBtn\"/, 'reference manager must expose fit-to-sheet');
assert.match(js, /function renderReferenceManager\(/, 'reference list and selected-image preview must be rendered from document state');
assert.match(js, /function mutateReference\(/, 'per-reference visibility and lock actions must be persisted');
assert.match(js, /referenceManagerEnlargeBtn/, 'reference manager must provide scale up/down actions');
assert.match(js, /referenceShowAllBtn/, 'reference manager must provide show-all-hidden action');
assert.match(js, /opacity:\.88,exportable:false/, 'new references must default to a readable 88% opacity');
assert.match(js, /q\.opacity===\.35\)q\.opacity=\.88/, 'legacy references must be upgraded from the old low-visibility default');
assert.doesNotMatch(js, /el\('image',\{href:o\.dataUrl,[^}]*opacity:o\.opacity/, 'reference opacity must not be multiplied a second time on the image itself');
assert.match(js, /const visible=checked\('referenceVisibleToggle'\)&&checked\('referenceVisibleToggleSecondary'\)/, 'reference manager and layer panel visibility switches must work together');

assert.match(js, /arrowHeadPoints/, 'rendered arrowheads use the proportional geometry helper');
assert.doesNotMatch(js, /half=size\*Math\.tan\(14\*Math\.PI\/180\)/, 'arrowhead length must not be incorrectly reused as a radians angle');
assert.match(html, /data-panel="references"/, 'reference management is exposed as its own panel tab');

assert.match(js, /drawArrow\(wrap,b,a,Math\.max\(\.5,Number\(o\.arrowSize\?\?3\.2\)\),o\.color\|\|'#20252a',15\)/, 'standalone arrow tool uses a smaller default proportionate arrowhead');
assert.match(js, /addArrowHeadSize\(o\.arrowSize\?\?3\.2\)/, 'arrow object exposes an independent numeric and slider arrowhead size');
assert.match(js, /slider\.addEventListener\('input',\(\)=>\{input\.value=slider\.value;\}/, 'arrowhead slider synchronizes its numeric field');
assert.match(js, /if\(o\.type==='arrowLine'\)o\.arrowSize=values\.arrowSize/, 'standalone arrowhead size is applied to the selected arrow object');
assert.match(js, /if\(o\.type==='curvedArrow'\)o\.arrowSize=values\.arrowSize/, 'curved arrowhead size is independently applied');

assert.match(html, /data-panel=\"properties\"/, 'selected object editing has a dedicated properties tab');
assert.match(html, /id=\"objectSpecificFields\"/, 'the properties panel exposes object-specific editable dimensions');
assert.match(js, /function renderObjectSpecificFields\(o\)/, 'properties are generated for selected object types');
assert.match(js, /circleGeometryFromInputs\(o,values\)/, 'circle radius and diameter are editable after creation');
assert.match(js, /lineGeometryFromInputs\(o,values\)/, 'line length, angle and endpoints are editable after creation');
assert.match(js, /addGrip\(o.center,'circle-center',0\);addGrip\(\{x:o.center.x\+o.r,y:o.center.y\},'circle-radius',0\)/, 'selected circles have direct center/radius grips');
assert.match(js, /visible=\.28\/Math.max\(\.1,state.zoom\)/, 'line and polyline vertex grips are visually compact');
assert.match(js, /fill:'transparent',stroke:'transparent',[^}]*'pointer-events':'all'/, 'closed geometry has an easy-to-hit transparent selection surface');
assert.match(js, /function undo\(\)\{const currentView=\{\.\.\.state.view\}/, 'undo preserves the current workspace camera');
assert.match(js, /function redo\(\)\{const currentView=\{\.\.\.state.view\}/, 'redo preserves the current workspace camera');
assert.match(js, /type:t==='spline'\?'spline':t==='curvedArrow'\?'curvedArrow':'polyline'/, 'curved-arrow tool commits a smooth path object');
assert.match(js, /'paint-order':'normal','stroke':'none'/, 'dimension numerals are rendered without a white outline');
assert.match(html, /id=\"dimensionOffset\" type=\"number\" min=\"0\.01\"/, 'dimension extension minimum is reduced');

assert.match(js, /function updateSelectedDimensionProps\(/, 'selected dimension parameters can be edited after creation');
assert.match(html, /id=\"dimensionTextHeight\" type=\"number\" min=\"0\.5\" max=\"30\"/, 'dimension number height is independently editable as a numeric value');
assert.match(html, /id=\"dimensionTextHeightSlider\" type=\"range\" min=\"0\.5\" max=\"30\"/, 'dimension number height also has a separate slider');
assert.match(js, /put\('dimensionTextHeightSlider',o\.textSize/, 'selected dimension loads its own number height into the slider');
assert.match(js, /o\.textSize=Math\.max\(\.5,getNum\('dimensionTextHeight'/, 'dimension number resizing is stored independently from arrow size');
assert.match(js, /dimensionSelectedOffsetSlider.*addEventListener\('change',updateSelectedDimensionProps\)/s, 'dimension extension/offset slider applies its value');
assert.match(js, /Math\.max\(\.5,Number\(o\.arrowSize\?\?3\.2\)\),o\.color\|\|'#20252a',15\)/, 'curved arrow head uses an independently adjustable smaller size');
assert.match(js, /visible=\.28\/Math\.max/, 'vertex grips are reduced to compact dots');
assert.match(html, /id="dimensionSelectedOffset" type="number" min="0\.01"/, 'dimension offset supports very short extension legs');
console.log('restored.20 UX contract: tabs, object editing, compact points, smaller arrows and undo camera preservation');

assert.match(js, /data-object-rotate-handle/, 'selected objects expose a mouse rotation grip');
assert.match(js, /rotateGeometryObject\(state.drag.original,delta,state.drag.pivot\)/, 'mouse rotation operates from original geometry and stable pivot');
assert.match(js, /document.querySelectorAll\('\[data-rotate-step\]'\)/, 'quick angle buttons are wired');
assert.match(js, /objectRotationSlider'\)\.onchange/, 'rotation slider applies its selected angle');

assert.match(js, /data-dimension-label-hit/, 'the rendered value has its own hit target');
assert.match(js, /dimensionLabelAxis/, 'the label has an axis-constrained move operation');
assert.match(js, /dimensionLabelSize/, 'the label has an independent size drag operation');
assert.match(js, /dimensionLabelRotate/, 'the label has an independent rotation drag operation');
assert.match(js, /drawDimensionArrow\(wrap,p1,startToward[\s\S]*drawDimensionArrow\(wrap,p2,endToward/, 'both dimension arrowheads follow the inside/outside placement setting');
assert.match(html, /id="dimensionArrowPlacement"[\s\S]*option value="inside"[\s\S]*option value="outside"/, 'dimension arrow placement is exposed in Properties');
assert.match(html, /data-dimension-text-step/, 'dimension number height has convenient step buttons');
console.log('restored.21 dimension label and arrow interaction contract: ok');

assert.match(js, /function textLabelLayoutWorld\(o\)/, 'standalone text exposes a world-space label layout for manipulation');
assert.match(js, /data-text-label-hit/, 'standalone text has its own hit target');
assert.match(js, /data-text-label-move-handle/, 'selected text exposes a free-move grip');
assert.match(js, /data-text-label-axis-handle/, 'selected text exposes an axis-constrained move grip');
assert.match(js, /data-text-label-size-handle/, 'selected text exposes a font-height grip');
assert.match(js, /data-text-label-rotate-handle/, 'selected text exposes an independent rotation grip');
assert.match(js, /textLabelMove/, 'text movement is handled independently of the drawing geometry');
assert.match(js, /textLabelAxis/, 'text axis movement has its own drag operation');
assert.match(js, /textLabelSize/, 'text height is resized without scaling unrelated geometry');
assert.match(js, /textLabelRotate/, 'text rotation has its own drag operation');
assert.match(css, /\[data-text-label-size-handle\][\s\S]*?cursor:nwse-resize/, 'text size grip has a resize cursor');
assert.match(js, /addTextSlider\('size'/, 'standalone text has a live font-height slider and quick steps');
assert.match(js, /addTextSlider\('rotation'/, 'standalone text has a live rotation slider and quick steps');
assert.match(js, /stepAttr:'textSizeStep'/, 'standalone text exposes quick font-height buttons');
assert.match(js, /stepAttr:'textRotationStep'/, 'standalone text exposes quick rotation buttons');
assert.match(js, /width:3\.6\/scale,height:3\.6\/scale/, 'text and dimension font-height grips are easier to grab');
assert.match(js, /r:2\.05\/scale/, 'text and dimension rotation grips are larger');
assert.match(css, /dimension-step-row button\{[^}]*min-height:35px[^}]*font-size:13px/, 'dimension increase and rotation step buttons are larger');
console.log('restored.22 standalone text manipulation contract: ok');

console.log('restored.20 rotation interaction contract: ok');

assert.match(html, /id="applyObjectScaleBtn"/, 'selected objects expose an explicit scale control');
assert.match(html, /id="objectScaleFactor"/, 'selected objects expose a numeric scale factor');
assert.match(js, /data-object-scale-handle/, 'selection box exposes interactive resize grips');
assert.match(js, /state\.drag=\{type:'objectScale'/, 'scale grip starts an actual geometry transform');
assert.match(js, /state\.drag\?\.type==='objectScale'/, 'scale grip updates geometry while dragging');
assert.match(js, /scaleGeometryObject\(o,f,f,pivot\)/, 'scale-by-factor transforms actual object geometry');
assert.match(js, /scaleObjectToBounds\(o,\{x,y,w,h\}/, 'numeric width/height fields apply geometry changes');
assert.match(js, /target-\(Number\(o\.rotation\)\|\|0\)/, 'rotation field uses an absolute target angle');
assert.match(js, /'pointer-events':'all',[^}]*'data-object-rotate-handle':'true'/, 'rotation handle can receive mouse input');
assert.match(css, /\[data-object-rotate-handle\][\s\S]*?pointer-events:all!important/, 'rotation handle overrides non-interactive selection layer');
console.log('restored.20 transform UI contract: scale handles, numeric scale and functional rotation hit testing');
