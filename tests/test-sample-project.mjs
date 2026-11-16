import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserializeScene, Polygon, Circle, Arc, Line, LinearDimension, DiameterDimension, translatePrimitive } from '../src/index.mjs';

const raw=JSON.parse(await readFile(new URL('../examples/sample-machined-part.json',import.meta.url),'utf8'));
const scene=deserializeScene(raw);
assert.ok(scene.length>=10,'Sample drawing should contain contour, holes, marks and dimensions');
assert.equal(scene.filter(o=>o instanceof Polygon).length,1,'The sample should contain one notched outer contour');
assert.equal(scene.filter(o=>o instanceof Circle).length,2,'The sample should have two hole contours');
assert.equal(scene.filter(o=>o instanceof LinearDimension).length,2,'The sample should have linear dimensions');
assert.equal(scene.filter(o=>o instanceof DiameterDimension).length,1,'The sample should have a diameter dimension');
const contour=scene.find(o=>o instanceof Polygon);
assert.equal(contour.vertices.length,8,'The outer contour includes the edge notch');
console.log(`Sample machining drawing loaded and verified (${scene.length} objects).`);


const coverRaw=JSON.parse(await readFile(new URL('../examples/sample-variant-6-cover.json',import.meta.url),'utf8'));
const cover=deserializeScene(coverRaw);
assert.equal(cover.filter(o=>o instanceof Arc && Math.abs(o.radius-42)<1e-8).length,6,'Variant 6 has six outer rim sectors');
assert.equal(cover.filter(o=>o instanceof Arc && Math.abs(o.radius-8)<1e-8).length,6,'Variant 6 has six rounded slot ends');
assert.equal(cover.filter(o=>o.type==='line').length,12,'Variant 6 has twelve slot side walls');
assert.equal(cover.filter(o=>o instanceof Circle && Math.abs(o.radius-23)<1e-8).length,1,'Variant 6 has a Ø46 pitch circle');
assert.equal(cover.filter(o=>o instanceof Polygon).length,1,'Variant 6 has a central hexagon');
const centered=cover.map(o=>translatePrimitive(o,{x:600,y:360}));
const arc0=centered.find(o=>o instanceof Arc && Math.abs(o.radius-42)<1e-8);
assert.ok(arc0.center.x>500 && arc0.center.y>300,'Centred cover has a visible model-space centre');
console.log(`Variant 6 cover scene loaded and verified (${cover.length} objects).`);
