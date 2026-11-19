import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scaledArrowHeadLength } from '../src/arrow-scaling.mjs';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.ok(Math.abs(scaledArrowHeadLength(0.5, 0.5, 3.5) - 4.725) < 1e-9, 'Default 0.50 mm line uses the visibly enlarged 4.725 mm head');
assert.ok(Math.abs(scaledArrowHeadLength(1, 0.5, 3.5) - 9.45) < 1e-9, 'Doubling line weight doubles the enlarged arrow length');
assert.ok(Math.abs(scaledArrowHeadLength(0.25, 0.5, 3.5) - 2.3625) < 1e-9, 'Halving line weight halves the enlarged arrow length');
assert.ok(Math.abs(scaledArrowHeadLength(2, 0.5, 3.5) - 18.9) < 1e-9, 'Thicker line scales the enlarged arrow proportionally');
assert.ok(Math.abs(scaledArrowHeadLength(0, 0.5, 3.5) - 4.725) < 1e-9, 'Invalid line width falls back to the enlarged safe default');
assert.ok(Math.abs(scaledArrowHeadLength(0.05, 0.5, 3.5) - 0.4725) < 1e-9, 'Minimum supported line width remains proportional');
assert.ok(Math.abs(scaledArrowHeadLength(3, 0.5, 3.5) - 28.35) < 1e-9, 'Full supported 3 mm line weight scales without early saturation');

assert.match(app, /import \{ scaledArrowHeadLength \} from '\.\.\/src\/arrow-scaling\.mjs'/);
assert.match(app, /function arrowLineHeadLength\(/);
assert.match(app, /half=size\*Math\.tan\(14\*Math\.PI\/180\)/, 'Arrow 1 triangle is visibly wider');
assert.match(app, /half=size\*Math\.tan\(14\*Math\.PI\/180\),base=/, 'DXF triangle uses the same wider geometry');
assert.match(app, /function captureArrowLineBase\(/);
assert.match(app, /o\.arrowBaseWidth=Number\(o\.arrowBaseWidth\)\|\|Number\(state\.gost\.mainLine\)/);
assert.match(app, /o\.arrowBaseSize=Number\(o\.arrowBaseSize\)\|\|Number\(o\.arrowSize\)/);
assert.match(app, /arrowLineHeadLength\(o\)/, 'On-canvas and DXF output use the calculated size');
assert.match(app, /scaledArrowHeadLength\(previewWidth/,'Preview uses the selected line width too');
assert.match(app, /'arrowBaseWidth','arrowBaseSize'/, 'CSV stores scale metadata');
assert.match(html, /id="objectWidth"/, 'Line weight remains editable from object properties');

console.log('Arrow scaling tests passed: proportional line/arrow sizing in preview, drawing, saved data and export.');
