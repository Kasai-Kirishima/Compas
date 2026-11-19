import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/template.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'js/template.js' });
const api = sandbox.window.KompasTemplate;

const cases = [
  { id:'lab4-reference-template', format:'A3P', title:'Лабораторна робота 4', code:'КТ-24.ЛР4.001', developer:'Кушвид О.' },
  { id:'lab8-reference-template', format:'A3L', title:'Корпус', code:'8.090220 АР ХХ ХХ 01', extra:['Вариант 8','ШЦМГУ'] },
  { id:'lab5-a4-reference-template', format:'A4P', title:'Лабораторна робота 5', code:'КТ-24.ЛР5.001', developer:'Кушвид О.' },
  { id:'lab5-gost-a3-landscape', format:'A3L', title:'Лабораторная работа №5', code:'КТ-24.ЛР5.001', developer:'Кушвид О.' },
  { id:'technical-gost-a3-landscape', format:'A3L', title:'Корпус', code:'8.090220 АР ХХ ХХ 01', developer:'Кушвид О.', company:'ШЦМГУ' },
  { id:'lab5-gost-a3-portrait', format:'A3P', title:'Лабораторная работа №5', code:'КТ-24.ЛР5.001', developer:'Кушвид О.' },
  { id:'technical-gost-a3-portrait', format:'A3P', title:'Корпус', code:'8.090220 АР ХХ ХХ 01', developer:'Кушвид О.', company:'ШЦМГУ' },
];

for (const item of cases) {
  const dims = api.dimensions(item.format);
  const expected = item.format === 'A4P' ? {w:210,h:297} : item.format === 'A3P' ? {w:297,h:420} : {w:420,h:297};
  assert.deepEqual(JSON.parse(JSON.stringify(dims)), expected, `${item.id} page size`);
  const data = {
    title:item.title, code:item.code, developer:item.developer || '', company:item.company || '',
    checker:'', scale:'1:1', sheets:'1', sheet:'', liter:'', mass:'', material:'',
  };
  const markup = api.markup(item.format, data, item.id);
  assert.ok(markup.length > 1500, `${item.id} returns a complete editable frame`);
  for (const term of [item.title,item.code,...(item.extra||[]),...(item.developer?[item.developer]:[])]) {
    assert.ok(markup.includes(term), `${item.id} contains ${term}`);
  }
  assert.ok(!/>(?:None|null|undefined)<\/text>/i.test(markup), `${item.id} does not print null-like values`);
}

const oldTech = api.markup('A3P', {title:'Старый документ'}, 'technical-a3-template');
assert.ok(oldTech.length > 1000, 'legacy technical template remains renderable for old projects');
const oldLab5 = api.markup('A3P', {title:'Старый документ'}, 'lab5-template');
assert.ok(oldLab5.length > 1000, 'legacy Lab 5 template remains renderable for old projects');
console.log('Template catalog runtime passed: all 7 active layouts render at their correct paper sizes, with legacy IDs retained.');
