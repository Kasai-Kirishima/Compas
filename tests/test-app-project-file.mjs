import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(html, /id="exportProjectBtn"[^>]*>[\s\S]*?Экспорт проекта/);
assert.match(html, /id="importProjectBtn"[^>]*>[\s\S]*?Импорт проекта/);
assert.match(html, /id="fileInput" accept="[^"]*\.kcad[^"]*\.json/);
assert.match(html, /Файл проекта \.kcad сохраняет весь редактируемый чертёж/);
assert.match(app, /createProjectFile\(payload\)/, 'Export must package a native project envelope');
assert.match(app, /\.kcad`\)/, 'Project export must use the .kcad extension');
assert.match(app, /readProjectFile\(raw\)/, 'Import must accept the native project envelope');
assert.match(app, /saveProject\(\{name:importedName,forceNew:true\}\)/, 'Import must save as a new separate project, not overwrite the source');
assert.match(app, /zoom:state\.zoom,grid:state\.grid,gridStep:gridStep\(\),snap:state\.snap,objectSnap:state\.objectSnap,ortho:state\.ortho/);
assert.match(app, /o=>o&&supportedTypes\.has\(o\.type\)/, 'Import must restore supported editable scene objects');
assert.equal(pkg.version, '1.5.40');
assert.ok(pkg.scripts.test.includes('tests/test-project-file.mjs'));
console.log('Native project import/export UI contract tests passed (11 assertions).');
