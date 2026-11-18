import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GOST_LINE_PATTERNS } from '../src/line-types.mjs';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const templates = await readFile(new URL('../src/templates.mjs', import.meta.url), 'utf8');
const geometry = await readFile(new URL('../src/cad-geometry-trim.mjs', import.meta.url), 'utf8');

assert.equal(GOST_LINE_PATTERNS.dashDotThin, '5 3 0.1 3');
assert.match(app, /dash:\s*GOST_LINE_PATTERNS\.dashDotThin/);
assert.match(app, /o\.type==='centerline'\?GOST_LINE_PATTERNS\.dashDotThin/);
assert.match(app, /normalizeGostDashPattern\(o\.dash\)/);
assert.match(html, /value="5 3 0\.1 3">Штрихпунктирна тонка — 5\/3 мм \(ГОСТ\)/);
assert.match(html, /value="8 3 0\.1 3">Штрихпунктирна з довшим штрихом — 8\/3 мм/);
assert.match(templates, /lineDash:\s*\[5, 3, 0\.1, 3\]/);
assert.match(geometry, /lineDash:\s*\[5, 3, 0\.1, 3\]/);
assert.match(app, /40\\n11\.1\\n49\\n5\\n49\\n-3\\n49\\n0\.1\\n49\\n-3/);
console.log('App line style tests passed');
