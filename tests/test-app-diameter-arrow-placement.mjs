import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
assert.match(app, /const arrowsOutside=requestedArrowPlacement==='outside'\|\|\(requestedArrowPlacement==='auto'&&2\*r<\(2\*aSize\+1\)\)/,
  'Diameter dimensions must honour the explicit outside placement and auto-fit short diameters');
assert.match(app, /dimensionArrow\(g,p1\.x,p1\.y,arrowsOutside\?ux:-ux,arrowsOutside\?uy:-uy/,
  'For outside placement, the left diameter arrowhead must point inward with its tail outside');
assert.match(app, /dimensionArrow\(g,p2\.x,p2\.y,arrowsOutside\?-ux:ux,arrowsOutside\?-uy:uy/,
  'For outside placement, the right diameter arrowhead must point inward with its tail outside');
assert.match(app, /lowerDiameterSign:true/);
assert.match(app, /const sign=svgEl\('tspan',\{dy:shift\}\)/);
assert.match(app, /const digits=svgEl\('tspan',\{dy:`-\$\{shift\}`\}\)/);
console.log('Diameter arrow placement UI tests passed: outside arrows face inward and diameter glyph is lowered independently.');
