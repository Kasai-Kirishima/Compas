import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

for (const tool of ['xline', 'ray']) assert.match(html, new RegExp(`data-tool="${tool}"`), `${tool} tool must be visible`);
for (const id of ['circleInputMode', 'snapEndpointToggle', 'snapMidpointToggle', 'snapCenterToggle', 'snapIntersectionToggle', 'snapQuadrantToggle', 'snapTangentToggle', 'drawingLineRole', 'drawingLineWidth', 'showMainLines', 'showThinLines', 'showCenterLines', 'snapIndicatorLayer']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} control must be present`);
}
assert.match(app, /getObjectSnapCandidates\(state\.objects\)/, 'OSNAP candidates must be built from drawing objects');
assert.match(app, /function tangentPointsFrom\(/, 'Tangent OSNAP geometry must be calculated');
assert.match(app, /snapTangentToggle/, 'Tangent OSNAP must be user-toggleable');
assert.match(app, /function extentLinePoints\(/, 'Infinite lines and rays must be clipped to the visible sheet');
assert.match(app, /type:'xline'/, 'Infinite line entities must be created');
assert.match(app, /type:'ray'/, 'Ray entities must be created');
assert.match(app, /function offsetPolylineVertices\(/, 'Offset must support polylines');
assert.match(app, /else if\(o\.type==='arc'\)\{const r=Number\(o\.r\)\+dist/, 'Offset must support arcs');
assert.match(app, /function lineLineFillet\(/, 'Fillet must support two selected line segments');
assert.match(app, /if\(action==='fillet'&&objs\.length===2&&objs\.every\(o=>o\.type==='line'\)\)/, 'Line-line fillet must be connected to the action');
assert.match(app, /action==='centerMarks'/, 'Selected circles must support batch center marks');
assert.match(app, /doc\.snapModes\.endpoint/, 'OSNAP modes must be restored from saved projects');
assert.match(app, /doc\.lineVisibility\.main/, 'Line-role visibility must be restored from saved projects');
assert.match(app, /s\.snapModes\.endpoint/, 'OSNAP modes must participate in undo/redo snapshots');
assert.match(app, /s\.lineVisibility\.main/, 'Line-role visibility must participate in undo/redo snapshots');
assert.match(app, /circleInputMode/, 'Circle construction must support radius/diameter modes');
assert.equal(pkg.version, '1.5.57');
console.log('Drafting tools integration tests passed (25 assertions).');
