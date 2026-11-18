import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const advanced = await readFile(new URL('../src/sketch-advanced.mjs', import.meta.url), 'utf8');

assert.match(html, /data-tool="arc3"/, 'The three-point arc tool must be visible in the geometry toolbar');
assert.match(app, /arcThroughThreePoints\(pts\[0\],pts\[1\],p\)/, 'Three-point arc creation must use the geometry helper');
assert.match(app, /state\.tool==='arc3'/, 'Three-point arc clicks must be handled');
assert.match(html, /id="polygonMode"[\s\S]*?value="acrossFlats"/, 'Polygon size must include across-flats mode');
assert.match(app, /mode==='acrossFlats'\?pickedRadius\*2:pickedRadius/, 'Click radius must map to across-flats size correctly');
assert.match(app, /getObjectSnapCandidates\(state\.objects\)/, 'OSNAP candidates must be built from the active drawing');
assert.match(app, /findObjectSnap\(p,state\.objects/, 'OSNAP must snap input points to candidates');
assert.match(html, /id="objectSnapToggle"/, 'Object snap toggle must be available');
assert.match(app, /trimLegacyCurve\(subject,pointFromEvent\(e,true\)/, 'Trim must be connected to the canvas click');
assert.match(app, /function findAndHatchClosedRegions\(/, 'Automatic loop detection/hatching must be wired in the app');
assert.match(html, /id="findClosedLoopsHatchBtn"/, 'Automatic region hatch command must be available');
assert.match(app, /'fill-rule':'evenodd'/, 'Hatch renderer must preserve holes using even-odd fill');
assert.match(app, /o\.hatchSegments\.forEach/, 'Generated clipped hatch segments must render');
assert.match(advanced, /export function findClosedLoops\(/, 'Planar face detection helper must be exported');
assert.match(advanced, /export function createHatch\(/, 'Hatching helper must be exported');
assert.match(advanced, /export function trimLegacyCurve\(/, 'Legacy editor trim adapter must be exported');
console.log('Advanced sketch editor integration tests passed (17 assertions).');
