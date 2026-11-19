import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/template.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'js/template.js' });
const api = sandbox.window.KompasTemplate;

const presets = [
  { id:'lab4-reference-template', defaultFormat:'A3P', title:'Лабораторна робота 4', code:'КТ-24.ЛР4.001', developer:'Кушвид О.' },
  { id:'lab8-reference-template', defaultFormat:'A3L', title:'Корпус', code:'8.090220 АР ХХ ХХ 01', developer:'Кушвид О.', checker:'Базиль Б.', extra:['Вариант 8','ШЦМГУ'] },
  { id:'lab5-a4-reference-template', defaultFormat:'A4P', title:'Лабораторна робота 5', code:'КТ-24.ЛР5.001', developer:'Кушвид О.' },
  { id:'lab5-gost-a3-landscape', defaultFormat:'A3L', title:'Лабораторная работа №5', code:'КТ-24.ЛР5.001', developer:'Кушвид О.' },
  { id:'technical-gost-a3-landscape', defaultFormat:'A3L', title:'Корпус', code:'8.090220 АР ХХ ХХ 01', developer:'Кушвид О.', company:'ШЦМГУ' },
  { id:'lab5-gost-a3-portrait', defaultFormat:'A3P', title:'Лабораторная работа №5', code:'КТ-24.ЛР5.001', developer:'Кушвид О.' },
  { id:'technical-gost-a3-portrait', defaultFormat:'A3P', title:'Корпус', code:'8.090220 АР ХХ ХХ 01', developer:'Кушвид О.', company:'ШЦМГУ' },
];

const paperSizes = {
  A4P:{w:210,h:297}, A4L:{w:297,h:210},
  A3P:{w:297,h:420}, A3L:{w:420,h:297},
  A2P:{w:420,h:594}, A2L:{w:594,h:420},
};
for (const preset of presets) {
  for (const [format, expected] of Object.entries(paperSizes)) {
    const dims = api.dimensions(format);
    assert.deepEqual(JSON.parse(JSON.stringify(dims)), expected, `${format} physical page dimensions`);
    const data = {
      title:preset.title, code:preset.code, developer:preset.developer || '', company:preset.company || '',
      checker:preset.checker || '', scale:'1:1', sheets:'1', sheet:'', liter:'', mass:'', material:'',
    };
    const markup = api.markup(format, data, preset.id);
    assert.ok(markup.length > 1500, `${preset.id} returns a complete editable frame at ${format}`);
    for (const term of [preset.title,preset.code,...(preset.extra||[]),...(preset.developer?[preset.developer]:[])]) {
      assert.ok(markup.includes(term), `${preset.id} contains ${term} at ${format}`);
    }
    assert.ok(!/>(?:None|null|undefined)<\/text>/i.test(markup), `${preset.id} does not print null-like values at ${format}`);
    if (preset.id.includes('gost') || preset.id==='lab8-reference-template') {
      const blockX=expected.w-190, blockY=expected.h-60;
      assert.ok(markup.includes(`x=\"${blockX}\" y=\"${blockY}\" width=\"185\" height=\"55\"`), `${preset.id} anchors a 185×55 mm title block to ${format}`);
    }
  }
}
assert.notDeepEqual(api.dimensions('A4P'),api.dimensions('A3P'));
assert.notDeepEqual(api.dimensions('A3P'),api.dimensions('A2P'));
assert.notDeepEqual(api.dimensions('A4L'),api.dimensions('A3L'));
assert.notDeepEqual(api.dimensions('A3L'),api.dimensions('A2L'));

const oldTech = api.markup('A3P', {title:'Старый документ'}, 'technical-a3-template');
assert.ok(oldTech.length > 1000, 'legacy technical template remains renderable for old projects');
const oldLab5 = api.markup('A3P', {title:'Старый документ'}, 'lab5-template');
assert.ok(oldLab5.length > 1000, 'legacy Lab 5 template remains renderable for old projects');
console.log('Template catalog runtime passed: all 7 layouts render at six genuinely different A4/A3/A2 sizes; GOST Form 1/Lab8 title blocks stay 185×55 mm and legacy IDs are retained.');
