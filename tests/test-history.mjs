import assert from 'node:assert/strict';
import {History} from '../src/history.mjs';
const h=new History(3);h.push({n:1});assert.deepEqual(h.undo({n:2}),{n:1});assert.deepEqual(h.redo({n:1}),{n:2});assert.equal(h.canUndo,true);assert.equal(h.canRedo,false);
console.log('history: ok');
