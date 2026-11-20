import assert from 'node:assert/strict';
import {TEMPLATES,FORMATS,formatForTemplate} from '../src/templates.mjs';
assert.equal(TEMPLATES.length,7);assert.equal(formatForTemplate('lab8-reference-template'),'A3L');assert.deepEqual(FORMATS.A3L,[420,297]);assert.deepEqual(FORMATS.A4P,[210,297]);assert.deepEqual(FORMATS.A2L,[594,420]);
console.log('templates: ok');
