import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const demo = await readFile(new URL('../examples/demo.mjs', import.meta.url), 'utf8');
const html = await readFile(new URL('../examples/demo.html', import.meta.url), 'utf8');
assert.match(demo, /const target = eraseAllForCurrentStroke \? null : findTarget\(p,/,
  'Eraser must target the primitive under the pointer, not a stale selected object');
assert.doesNotMatch(demo, /selectedObject\(\)\s*\?\?\s*findTarget\(p/,
  'Stale selection must not override the clicked eraser target');
assert.match(demo, /eraseAllForCurrentStroke\s*=\s*\$\('eraseAllTargets'\)\.checked/,
  'Eraser scope must be captured at stroke start');
assert.match(demo, /if\(mode==='placePocket'\)/,
  'Pocket placement must use a canvas click');
assert.doesNotMatch(demo, /center=\{x:770,y:355\}/,
  'Pocket must not use a hard-coded insertion point');
assert.match(demo, /translatePrimitive\(object,\{x:canvas\.width\/2,y:canvas\.height\/2\}\)/,
  'Origin-based sample must be centred on load');
assert.match(html, /id="loadCoverBtn"/);
assert.match(html, /value="radialSlotCover"/);
console.log('Demo interaction contract tests passed (7 assertions).');
