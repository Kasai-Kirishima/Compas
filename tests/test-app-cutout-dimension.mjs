import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

assert.match(html, /type="module" src="js\/app\.js"/, 'Main editor must load as a module so the cutout engine is connected');
assert.match(html, /data-tool="cutout"/, 'The main editor must expose an edge-cutout tool');
assert.match(html, /id="placeInnerCutoutBtn"/, 'The main editor must expose inner-contour placement');
assert.match(html, /id="cutoutShape"[\s\S]*value="slot"/, 'Inner-contour selector must include an obround slot');
assert.match(app, /cutPolygonNotchAtPoint/, 'Edge-cutout tool must call the polygon cutout engine');
assert.match(app, /createRectangularPocket[\s\S]*createCircularCutout[\s\S]*createObroundCutout/, 'Inner rectangular, circular and obround contours must be connected');
assert.match(app, /keepDimensionLabelClearOfLine/, 'Dimension labels must be kept clear of their dimension line automatically');
assert.doesNotMatch(app, /data-dimension-text-mask|fill:\s*'#ffffff'[^\n]*dimension/, 'Dimension numbers must not have an opaque white background');
assert.doesNotMatch(app, /shelfY|полка-ответвление|labelW=\s*Math\.max\(textSize/, 'Unwanted connector lines beside dimension numbers must not be rendered');

console.log('Main editor cutout and dimension UI contract tests passed (9 assertions).');
