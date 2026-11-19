import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const cutouts=readFileSync(new URL('../src/cutouts.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(app,/findClosedLoops\(editableTargets,\{tolerance:\.02,curveSegments:384,maxSegments:20000\}\)/,
  'Inside-out pass must reconstruct closed regions from connected lines and curves');
assert.match(app,/region\.holeSourceIds\?\.\[hit\.index\]/,
  'The internal contour must be mapped back to its source objects');
assert.match(app,/cutInnerVoidToExteriorStraightPass\(hit\.region\.outer,hit\.ring,start,end,width/,
  'A pass that starts inside a hole must edit both its enclosing profile and the hole boundary');
assert.match(cutouts,/wallsConnectedToHole:\s*true/,
  'The geometric operation must report a connected hole-to-exterior result');
assert.match(app,/replaceObjectSetWithPaths\(outerIds,outerPaths/,
  'The reconstructed external boundary must replace its original source objects');
assert.match(app,/replaceObjectSetWithPaths\(holeIds,tx\.hole\.fragments/,
  'The removed part of the hole arc must be replaced by the remaining open arc');
assert.match(app,/Начни внутри материала или отверстия; линии детали должны образовывать замкнутый контур/,
  'The editor must explain when the user has no closed region to cut');
assert.match(html,/Предварительное выделение не обязательно/,
  'The direction hint must not incorrectly require preselection');
assert.match(html,/точно на ней/,
  'The direction hint must explain that an endpoint on the outside boundary is accepted');
console.log('App inside-out cut integration tests passed: region reconstruction, nested-hole handling, source replacement and diagnostics.');
