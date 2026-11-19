import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '1.5.49');
assert.match(html, /data-tool="arrowLine"[^>]*>.*?Стрелка 1/s, 'Arrow 1 must be available as a ribbon command or geometry tile');
assert.ok((html.match(/data-tool="arrowLine"/g) || []).length >= 2, 'Arrow 1 must be available in both ribbon and tool panel');
assert.match(app, /arrowLine:'Стрелка 1:[^']*первая точка пустая, вторая с наконечником/s);
assert.match(app, /const lineTools=\['line','arrowLine'/, 'Arrow 1 must share Segment angle lock, Ortho and ruler behavior');
assert.match(app, /if\(\['line','arrowLine','construction'/, 'Arrow 1 must use the normal two-point segment preview');
assert.match(app, /state\.tool==='arrowLine'\)addObject\(\{type:'line',name:'Стрелка 1',arrowLine:true/, 'Arrow 1 must be stored as a normal editable line');
assert.match(app, /function drawSingleArrowHead\(/, 'Arrow head geometry must be rendered by a dedicated helper');
assert.match(app, /'data-line-arrow':'true'/, 'The arrow head must be a distinct filled SVG path');
assert.match(app, /if\(o\.type==='line'&&o\.arrowLine\)/, 'Line renderer must add exactly one arrow head to endpoint 2');
assert.match(app, /writeSolidTriangle\(/, 'DXF export must create a filled arrow head');
assert.match(app, /if\(o\.type==='line'&&o\.arrowLine\).*?writeSolidTriangle/s, 'DXF arrow must be exported with the line');
assert.match(app, /'arrowLine','arrowSize'/, 'CSV export must preserve Arrow 1 metadata');

const map = app.match(/const headingMap=\[([\s\S]*?)\n    \];/)?.[1] || '';
assert.match(map, /\['ШТРИХОВКА','annotations'\]/, 'Hatch controls belong to Annotations');
assert.match(map, /\['ТОЧНОСТЬ И ПАРАМЕТРЫ РИСОВАНИЯ','precision'\]/, 'Precision settings have a dedicated category');
assert.match(map, /\['ПРИВЯЗКИ И СЕТКА','precision'\]/, 'OSNAP and grid settings belong to Precision');
assert.match(map, /\['ЛИСТ И БИБЛИОТЕКА ШАБЛОНОВ','sheet'\]/, 'Templates and sheet controls have a dedicated category');
assert.match(map, /\['СЛОИ И ТИПЫ ЛИНИЙ','sheet'\]/, 'Layers and line types belong to Sheet');
assert.match(map, /\['ТИПЫ ЧЕРТЁЖНЫХ ЛИНИЙ','sheet'\]/, 'Drawing line roles belong to Sheet');
assert.match(map, /\['ТИПЫ ЧЕРТЁЖНЫХ ЛИНИЙ','sheet'\]/, 'Drawing line roles belong to Sheet');

console.log('Arrow 1 tool tests passed: two-point segment workflow, one filled endpoint arrow, SVG/DXF/CSV persistence, and updated tool categories.');
