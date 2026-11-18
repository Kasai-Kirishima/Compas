import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(html, /data-tool="moveFace"/, 'The face-move tool must be available in editing tools');
assert.match(html, /id="polygonFaceOffset"/, 'The face offset must support exact numeric input');
assert.match(html, /id="applyPolygonFaceOffsetBtn"/, 'The exact face offset must have an Apply action');
assert.match(app, /closestClosedPolylineEdge/, 'The app must identify the closest polygon edge');
assert.match(app, /moveClosedPolylineEdge/, 'The app must use the face offset geometry solver');
assert.match(app, /if\(state\.tool==='moveFace'&&e\.button===0\)/, 'The tool must start a face edit from a left click');
assert.match(app, /if\(state\.faceDrag\).*?updatePolygonFaceDrag/s, 'Pointer movement must continuously update the face');
assert.match(html, /Применить точное смещение/, 'The UI must expose the numeric face-offset action');
assert.ok(pkg.exports['./polygon-edit'], 'The polygon edit geometry module must be exported');
console.log('Polygon face editor integration tests passed (9 assertions).');
