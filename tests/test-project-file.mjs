import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/project-file.mjs';
const source={name:'sample',sheet:{width:420,height:297,format:'A3L'},templateId:'lab8-reference-template',title:{title:'Корпус'},objects:[{id:'x',type:'circle',center:{x:1,y:2},r:3}],settings:{grid:true}};
const packed=createProject(source);const opened=parseProject(JSON.stringify(packed));
assert.equal(opened.name,'sample');assert.equal(opened.sheet.width,420);assert.equal(opened.templateId,'lab8-reference-template');assert.equal(opened.objects[0].r,3);assert.throws(()=>parseProject('{bad json'));
console.log('project-file: ok');

const kompas = parseProject({
  kind: 'kompas-online-project', schemaVersion: 1,
  document: {
    version: 14, format: 'A4P', fileName: 'lab4', titleForm: 'lab5-template',
    title: { title: 'Лабораторна робота 5', code: 'КТ-24.ЛР5.001', company: 'Коледж', developer: 'Кушвид О.А.', checker: 'Базиль Б.', scale: '1:1' },
    templateTextOverrides: { 'lab5-template': { label: { text: 'Лабораторна робота 4', x: 145, y: 246.6, size: 7, rotation: 0, anchor: 'middle' } } },
    objects: [
      { type: 'line', x: 1, y: 2, x2: 3, y2: 4, color: '#20252a', width: 0.5 },
      { type: 'construction', x: 5, y: 6, x2: 7, y2: 8, color: '#8c969d', dash: '18 2 1 2' },
      { type: 'ellipse', x: 10, y: 11, x2: 20, y2: 21 },
      { type: 'polyline', closed: true, points: [{x:1,y:1},{x:2,y:1},{x:2,y:2}] },
      { type: 'polyline', closed: false, points: [{x:3,y:3},{x:4,y:4}] },
      { type: 'dimension', kind: 'diameter', x: 8, y: 9, x2: 10, y2: 11, offset: 10, labelDx: 2, labelDy: -3 },
      { type: 'text', text: '5 отв.', x: 12, y: 13, size: 7.6, color: '#20252a' }
    ]
  }
});
assert.equal(kompas.sheet.format, 'A4P');
assert.equal(kompas.sheet.width, 210);
assert.equal(kompas.sheet.height, 297);
assert.equal(kompas.templateId, 'kompas-lab5-a4-template');
assert.equal(kompas.name, 'lab4');
assert.equal(kompas.objects.length, 7);
assert.deepEqual(kompas.objects[0].a, {x:1,y:2});
assert.deepEqual(kompas.objects[0].b, {x:3,y:4});
assert.equal(kompas.objects[1].type, 'construction');
assert.deepEqual(kompas.objects[2].center, {x:15,y:16});
assert.equal(kompas.objects[3].type, 'polygon');
assert.equal(kompas.objects[4].type, 'polyline');
assert.equal(kompas.objects[5].kind, 'dimDia');
assert.equal(kompas.objects[6].text, '5 отв.');
assert.equal(kompas.title.kompasTemplateTextOverrides.label.text, 'Лабораторна робота 4');


// Проверка оригинального файла Kompas Online, предоставленного пользователем.
import {readFileSync} from 'node:fs';
const originalKompas = parseProject(readFileSync(new URL('../examples/ЛР5-Кушвид-исходный-проект-Kompas-Online.kcad', import.meta.url), 'utf8'));
assert.equal(originalKompas.sheet.format, 'A4P');
assert.equal(originalKompas.sheet.width, 210);
assert.equal(originalKompas.sheet.height, 297);
assert.equal(originalKompas.templateId, 'kompas-lab5-a4-template');
assert.equal(originalKompas.objects.length, 32);
assert.equal(originalKompas.name, 'Кресленик_1');
assert.equal(originalKompas.title.title, 'Лабораторна робота 5');
assert.equal(originalKompas.title.code, 'КТ-24.ЛР5.001');
assert.equal(originalKompas.title.checker, 'Базиль Б.');
console.log('project-file: original supplied Kompas .kcad imported (32 editable objects)');
