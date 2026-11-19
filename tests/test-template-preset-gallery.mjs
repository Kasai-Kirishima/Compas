import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const ids = [...html.matchAll(/data-template-preset="([^"]+)"/g)].map(m => m[1]);
const expected = [
  'lab4-reference-template','lab8-reference-template','lab5-a4-reference-template',
  'lab5-gost-a3-landscape','technical-gost-a3-landscape','lab5-gost-a3-portrait','technical-gost-a3-portrait'
];
assert.deepEqual(ids, expected, 'All seven distinct user/assistant-created variants are visible in the gallery');
const userGroup=html.match(/<optgroup label="Мои образцы">([\s\S]*?)<\/optgroup>/)?.[1]||'';
assert.deepEqual([...userGroup.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]),expected.slice(0,3));
const gostGroup=html.match(/<optgroup label="Созданные варианты ГОСТ \/ ЕСКД">([\s\S]*?)<\/optgroup>/)?.[1]||'';
assert.deepEqual([...gostGroup.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]),expected.slice(3));
for(const id of expected){
  assert.ok(html.includes(`data-template-preset="${id}"`),`Gallery card exists for ${id}`);
  assert.ok(html.includes(`value="${id}"`),`Selector option exists for ${id}`);
  assert.ok(app.includes(`'${id}'`),`App maps ${id}`);
}
assert.match(app,/const templatePresetProfiles=\{/);
assert.match(app,/const visibleTemplatePresets=Object\.entries\(templatePresetProfiles\)/);
assert.match(app,/const available=visibleTemplatePresets\.map\(p=>p\.value\)/);
assert.match(app,/function fixedFormatForTemplate\(template\)/);
for(const [id,fmt] of Object.entries({
  'lab4-reference-template':'A3P','lab8-reference-template':'A3L','lab5-a4-reference-template':'A4P',
  'lab5-gost-a3-landscape':'A3L','technical-gost-a3-landscape':'A3L','lab5-gost-a3-portrait':'A3P','technical-gost-a3-portrait':'A3P'
})) assert.match(app,new RegExp(`'${id}':\\{label:[^}]*format:'${fmt}'`));
assert.match(app,/document\.querySelectorAll\('\[data-template-preset\]'\)\.forEach\(button=>button\.addEventListener\('click'/);
assert.match(html,/Совместимость со старыми чертежами" hidden/);
console.log('Template preset gallery passed: seven distinct presets are exposed with their fixed A4/A3 orientations.');
