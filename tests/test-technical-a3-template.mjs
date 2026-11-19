import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/template.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'js/template.js' });
const api = sandbox.window.KompasTemplate;
assert.deepEqual(JSON.parse(JSON.stringify(api.dimensions('A3P'))), { w:297, h:420 });
assert.deepEqual(JSON.parse(JSON.stringify(api.dimensions('A3L'))), { w:420, h:297 });

const lab4 = api.markup('A3P', { title:'Лабораторна робота 4', code:'КТ-24.ЛР4.001', company:'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ', developer:'Кушвид О.', checker:'Базиль Б.', scale:'1:1', liter:'', mass:'' }, 'lab4-reference-template');
assert.ok(lab4.includes('Лабораторна робота 4') && lab4.includes('КТ-24.ЛР4.001') && lab4.includes('Кушвид О.'));
assert.ok(!lab4.includes('Кушвид О.А.'));
assert.ok(lab4.includes('Перш. застос.') && lab4.includes('Інв. № ориг.'));
assert.ok(!lab4.includes('width="185" height="287"'), 'Lab4 page frame is drawn once by the sheet-frame layer');

const lab8 = api.markup('A3L', { title:'Корпус', code:'8.090220 АР ХХ ХХ 01', company:'ШЦМГУ', scale:'1:1' }, 'lab8-reference-template');
for (const value of ['Корпус','Вариант 8','8.090220 АР ХХ ХХ 01','ШЦМГУ']) assert.ok(lab8.includes(value));
assert.ok(lab8.includes('#2147d0'));
assert.ok(lab8.includes('width="185" height="55"'));
assert.ok(lab8.includes('data-template-text-id='));
assert.ok(!/>(?:None|null|undefined)<\/text>/i.test(lab8));

const legacyLab5 = api.markup('A3P', { title:'Old' }, 'lab5-template');
const legacyTechnical = api.markup('A3P', { title:'Old' }, 'technical-a3-template');
assert.ok(legacyLab5.length > 1000 && legacyTechnical.length > 1000, 'Legacy templates stay renderable for saved files');

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
assert.match(app,/titleForm:'lab4-reference-template'/);
assert.match(app,/'lab8-reference-template':\{label:[^}]*format:'A3L'/);
assert.match(app,/state\.format=doc\.format\|\|fixedFormatForTemplate\(state\.titleForm\)\|\|'A4P'/);
assert.match(app,/developer:'Кушвид О\.'/);
const frame = app.slice(app.indexOf('function renderSheetFrame'), app.indexOf('function svgEl', app.indexOf('function renderSheetFrame')));
assert.ok(frame.includes("stroke:'#2147d0'"));
assert.ok(frame.includes("const isLab4=state.titleForm==='lab4-reference-template'"));
assert.ok(frame.includes("const isLab8=state.titleForm==='lab8-reference-template'"));
console.log('Lab4/Lab8 template geometry passed: A3 portrait and landscape layouts, reference title blocks, and legacy renderer compatibility.');
