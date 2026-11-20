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
assert.match(js, /drawing\.addEventListener\('pointerdown',onPointerDown\)/, 'drawing surface must receive pointer input');
assert.match(js, /drawing\.addEventListener\('wheel'/, 'wheel zoom must work over the drawing area');
assert.match(js, /evt\.button===1/, 'middle mouse button must pan the sheet');
assert.match(js, /drawGesture/, 'drag-to-draw gesture handling must be present');
assert.match(js, /function zoomFromWheel/, 'wheel zoom handler must be present');
for (const match of js.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  const spec = match[1];
  if (spec.startsWith('.')) assert.ok(existsSync(resolve(root, 'js', spec)), `Missing JavaScript module: ${spec}`);
}
console.log(`app contract: ok (${ids.length} unique HTML ids, ${referencedIds.size} static JS references)`);
