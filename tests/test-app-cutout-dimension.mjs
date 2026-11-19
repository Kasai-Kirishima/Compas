import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

assert.match(html, /type="module" src="js\/app\.js"/, 'Main editor must load as a module so the cutout engine is connected');
assert.match(html, /data-tool="cutout"/, 'The main editor must expose an edge-cutout tool');
assert.match(html, /id="placeInnerCutoutBtn"/, 'The main editor must expose inner-contour placement');
assert.match(html, /id="cutoutShape"[\s\S]*value="slot"/, 'Inner-contour selector must include an obround slot');
assert.match(html, /id="cutoutDirection"[\s\S]*value="inside" selected[\s\S]*value="outside"/, 'Cutout controls must expose both inward and outward directions');
assert.match(app, /cutPolygonNotchAtPoint/, 'Edge-cutout tool must call the polygon cutout engine');
assert.match(app, /cutCircleNotchAtPoint/, 'Edge-cutout tool must call the circular boundary cutout engine');
assert.match(app, /direction=\$\('cutoutDirection'\)\?\.value\|\|'inside'/, 'Edge cutouts must read the selected direction');
assert.match(app, /cutCircleNotchAtPoint\(circle,point,width,depth,\{hitTolerance:tolerance,minWeb,direction\}\)/, 'Circular cuts must apply outward direction on inner contours');
assert.match(app, /cutPolygonNotchAtPoint\(polygon,point,width,depth,\{hitTolerance:tolerance,minWeb,direction\}\)/, 'Polygon cuts must apply outward direction on inner contours');
assert.match(app, /source\.type==='circle'[\s\S]*cutCircleNotchAtPoint/, 'Main editor must route circular selections to circular notch geometry');
assert.match(app, /cutOpenPathGapAtPoint/, 'The edge-cutout tool must remove a width-defined gap from open geometry');
assert.match(app, /function appOpenPathPoints/, 'Open lines, arcs and polylines must be converted to editable paths');
assert.match(app, /function replaceWithOpenFragments/, 'A cut segment must leave editable fragments in the scene');
assert.match(app, /o\.type==='ellipse'/, 'Ellipses must be converted to editable closed contours for cutting');
assert.match(app, /Number\(o\.rx\|\|0\)>0/, 'Rounded rectangles must be supported as closed cutting contours');
assert.match(app, /Можно продолжать вырезать этот же контур/, 'The UI must explain repeated cutting of an already-cut contour');
assert.match(app, /createRectangularPocket[\s\S]*createCircularCutout[\s\S]*createObroundCutout/, 'Inner rectangular, circular and obround contours must be connected');
assert.match(app, /keepDimensionLabelClearOfLine/, 'Dimension labels must be kept clear of their dimension line automatically');
assert.doesNotMatch(app, /data-dimension-text-mask|fill:\s*'#ffffff'[^\n]*dimension/, 'Dimension numbers must not have an opaque white background');
assert.doesNotMatch(app, /shelfY|полка-ответвление|labelW=\s*Math\.max\(textSize/, 'Unwanted connector lines beside dimension numbers must not be rendered');


assert.match(app, /splitOpenPathAtPoint/, 'Split tool must split open geometry at any point');
assert.match(app, /splitClosedPolygonAtPoints/, 'Split tool must split closed contours by two boundary points');
assert.match(app, /function applySplitTool/, 'Main editor must route split interactions through the general geometry splitter');
assert.match(app, /function appClosedContourPoints/, 'Main editor must convert supported closed shapes to split-ready contours');
assert.match(app, /function replaceWithClosedFragments/, 'Closed shape splits must leave two editable closed objects');
assert.match(app, /state\.splitPending/, 'Closed-contour split must preserve its first point until the second click');
assert.match(html, /data-action="split">Разделить объект/, 'The action panel must expose the general object split tool');

console.log('Main editor cutout, split and dimension UI contract tests passed (21 assertions).');

assert.match(html, /data-tool="cutoutNoBottom"/, 'The main editor must expose the no-bottom-wall cutout mode');
assert.match(html, /Полный вырез[\s\S]*Без нижней стенки[\s\S]*Без стенок/, 'All three cutout modes must be available as separate controls');
assert.match(app, /cutPolygonNotchWithoutBottomAtPoint/, 'The application must call the polygon no-bottom-wall cutout engine');
assert.match(app, /cutCircleNotchWithoutBottomAtPoint/, 'The application must call the circular no-bottom-wall cutout engine');
assert.match(app, /batch=targets\.length>1[\s\S]*tolerance=batch\?Infinity:hitTolerance/, 'A single batch click must project to the nearest boundary of every selected object');
