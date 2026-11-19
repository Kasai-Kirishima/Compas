import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/template.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'js/template.js' });
const api = sandbox.window.KompasTemplate;
assert.deepEqual(JSON.parse(JSON.stringify(api.dimensions('A3P'))), { w: 297, h: 420 });

const presets = [
  ['technical-a3-template', { title: 'Корпус', code: '8.090220 АР ХХ ХХ 01', company: 'ШЦМГУ', scale: '1:1' }],
  ['lab5-template', { title: 'Лабораторна робота 4', code: 'КТ-24.ЛР4.001', company: 'Шосткинський фаховий коледж імені Івана Кожедуба СумДУ', scale: '1:1', developer: 'Кушвид О.А.', checker: 'Базиль Б.' }],
];
for (const [template, data] of presets) {
  const markup = api.markup('A3P', data, template);
  assert.ok(markup.includes('stroke="#000000"'), `${template}: technical lines are black`);
  assert.ok(!markup.includes('#2147d0'), `${template}: no blue decorative frame`);
  assert.ok(markup.includes('width="272" height="410"'), `${template}: A3 work frame has 20 mm left and 5 mm other margins`);
  assert.ok(markup.includes('width="185" height="55"'), `${template}: Form 1 title block is 185 x 55 mm`);
  assert.ok(markup.includes('x="107" y="360"'), `${template}: title block is in the lower-right corner`);

  // Appendix A: portrait A3 uses a vertical graph 26 on the upper-right edge.
  assert.ok(markup.includes('x="278" y="5" width="14" height="70"'), `${template}: portrait A3 graph 26 is 14 x 70 mm at top right`);
  assert.ok(markup.includes('data-template-rotation="90"'), `${template}: graph 26 designation is rotated 90 degrees`);

  // Form 1 exact column widths are 7 / 10 / 23 / 15 / 10 / 70 / 15 / 17 / 18 mm.
  for (const x of [114, 124, 147, 162, 172, 242, 257, 274]) {
    assert.ok(markup.includes(`x1="${x}"`), `${template}: Form 1 contains vertical division at x=${x}`);
  }
  // The right block has graph 4–6 headings, values, page count and organisation rows.
  for (const y of [375, 380, 395, 400]) {
    assert.ok(markup.includes(`y1="${y}"`), `${template}: Form 1 contains horizontal division at y=${y}`);
  }
  assert.ok(markup.includes('Розроб.'), `${template}: authoring row is present`);
  assert.ok(markup.includes('Перевір.'), `${template}: checking row is present`);
  assert.ok(markup.includes('Перше застос.'), `${template}: first-use archive field is present`);
  assert.ok(markup.includes('Інв. № дубл.'), `${template}: duplicate inventory field is present`);
  assert.ok(markup.includes('Інв. № ориг.'), `${template}: original inventory field is present`);
  assert.ok(markup.includes('Копіював'), `${template}: graph 31 is in the bottom page margin`);
  assert.ok(markup.includes('Формат A3'), `${template}: graph 32 identifies A3`);
  assert.ok(markup.includes(data.title), `${template}: product/document title remains editable`);
  assert.ok(markup.includes(data.code), `${template}: designation is shown in graphs 2 and 26`);
  assert.ok((markup.match(/data-template-text-id=/g) || []).length >= 25, `${template}: title-block text remains editable`);
  assert.ok(!/>(?:None|null|undefined)<\/text>/i.test(markup), `${template}: empty cells render blank, not JavaScript sentinel text`);
  const sizes = [...markup.matchAll(/data-template-size="([0-9.]+)"/g)].map(m => Number(m[1]));
  assert.ok(sizes.every(size => [2.5, 3.5, 5].includes(size)), `${template}: labels use standard lettering heights (2.5, 3.5, 5 mm)`);

  const multiSheet = api.markup('A3P', { ...data, sheet: '2', sheets: '3' }, template);
  assert.ok(multiSheet.includes('Арк. 2'), `${template}: graph 7 is populated for multi-sheet documents`);
  assert.ok(multiSheet.includes('Аркушів 3'), `${template}: graph 8 is populated for multi-sheet documents`);
}

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(app.includes("state.format='A3P'"), 'Selecting either custom template sets A3 portrait');
assert.ok(app.includes("format:'A3P'"), 'The application starts with the A3 portrait template');
assert.ok(app.includes("state.format=['lab5-template','technical-a3-template'].includes(state.titleForm)?'A3P'"), 'Loading legacy custom-template projects migrates them to A3 portrait');
assert.ok(app.includes("['lab5-template','technical-a3-template']"), 'Both custom templates are enforced as A3 portrait');
assert.ok(app.includes('technical-a3-template'), 'The app wires the technical template');
assert.ok(app.includes('lab5-template'), 'The app wires the lab template');
const frameRenderer = app.slice(app.indexOf('function renderSheetFrame'), app.indexOf('function svgEl', app.indexOf('function renderSheetFrame')));
assert.ok(frameRenderer.includes("stroke:'#000000'"), 'The A3 frame renderer uses black GOST lines');
assert.ok(!frameRenderer.includes("stroke:'#2147d0'"), 'The old blue technical frame is removed');
assert.equal((html.match(/value="technical-a3-template"/g) || []).length, 2, 'Both template selectors offer the technical template');
assert.equal((html.match(/value="lab5-template"/g) || []).length, 2, 'Both template selectors offer the lab template');
console.log('A3 portrait GOST Form 1 tests passed for both custom templates.');
