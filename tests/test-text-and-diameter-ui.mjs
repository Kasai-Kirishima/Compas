import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const core = await readFile(new URL('../src/cad-geometry-trim.mjs', import.meta.url), 'utf8');

assert.match(html, /data-tool="dimDia"[^>]*>[\s\S]*?<span>⌀<\/span>/, 'Diameter control must show the dedicated diameter symbol');
assert.match(html, /data-tool="text"[^>]*>[^<]*<span>Т<\/span>Добавить текст/, 'Ribbon must expose a direct add-text command');
assert.match(html, /id="textContent"[^>]*rows="5"/, 'Text editor must support multiline annotations');
assert.match(app, /if\(state\.tool==='text'\)\{openTextDialog\(\{x:p\.x,y:p\.y\},null\);\}/, 'Text tool click must open the text editor at the clicked point');
assert.match(app, /state\.tool==='select'&&!e\.target\.closest\?\.\('\.drawing-object\[data-id\]'\)[\s\S]*?openTextDialog/, 'Double-clicking blank canvas in select mode must add text');
assert.match(app, /e\.key\.toLowerCase\(\)==='t'[\s\S]*?selectTool\('text'\)/, 'T key must activate text tool when focus is not in a form field');
assert.match(app, /normalized\.match\(\/\^\\s\*\(⌀\|Ø\|ø\|Ш\|ш\|R\|D\|∠\)/, 'Dimension assignment parser must accept the dedicated diameter glyph and legacy prefixes');
assert.match(core, /return diameter \? `⌀\$\{number\}` : number;/, 'Core diameter dimensions must render the canonical diameter glyph');
assert.match(core, /replace\(\/\^\\s\*\(\?:Ш\|ш\|Ø\|ø\|⌀\)\\s\*\/u, '⌀'\)/, 'Legacy diameter prefixes must normalize to the diameter glyph');

console.log('Text insertion and diameter glyph UI contract tests passed (8 assertions).');
