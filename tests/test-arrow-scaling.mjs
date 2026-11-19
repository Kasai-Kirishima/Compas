import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scaledArrowHeadLength } from '../src/arrow-scaling.mjs';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.equal(scaledArrowHeadLength(0.5, 0.5, 3.5), 3.5, 'Default 0.50 mm line keeps the 3.5 mm head');
assert.equal(scaledArrowHeadLength(1, 0.5, 3.5), 7, 'Doubling line weight doubles arrow length');
assert.equal(scaledArrowHeadLength(0.25, 0.5, 3.5), 1.75, 'Halving line weight halves arrow length');
assert.equal(scaledArrowHeadLength(2, 0.5, 3.5), 14, 'Thicker line scales arrow proportionally');
assert.equal(scaledArrowHeadLength(0, 0.5, 3.5), 3.5, 'Invalid line width falls back to the safe default');
assert.ok(Math.abs(scaledArrowHeadLength(0.05, 0.5, 3.5) - 0.35) < 1e-9, 'Minimum supported line width remains proportional');
assert.equal(scaledArrowHeadLength(3, 0.5, 3.5), 21, 'Full supported 3 mm line weight scales without early saturation');

assert.match(app, /import \{ scaledArrowHeadLength \} from '\.\.\/src\/arrow-scaling\.mjs'/);
assert.match(app, /function arrowLineHeadLength\(/);
assert.match(app, /function captureArrowLineBase\(/);
assert.match(app, /o\.arrowBaseWidth=Number\(o\.arrowBaseWidth\)\|\|Number\(state\.gost\.mainLine\)/);
assert.match(app, /o\.arrowBaseSize=Number\(o\.arrowBaseSize\)\|\|Number\(o\.arrowSize\)/);
assert.match(app, /arrowLineHeadLength\(o\)/, 'On-canvas and DXF output use the calculated size');
assert.match(app, /scaledArrowHeadLength\(previewWidth/,'Preview uses the selected line width too');
assert.match(app, /'arrowBaseWidth','arrowBaseSize'/, 'CSV stores scale metadata');
assert.match(html, /id="objectWidth"/, 'Line weight remains editable from object properties');

console.log('Arrow scaling tests passed: proportional line/arrow sizing in preview, drawing, saved data and export.');
