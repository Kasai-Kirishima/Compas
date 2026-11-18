import assert from 'node:assert/strict';
import {
  PROJECT_FILE_KIND,
  PROJECT_FILE_VERSION,
  createProjectFile,
  readProjectFile,
  projectFileBaseName
} from '../src/project-file.mjs';

const completeDrawing = {
  app: 'Kompas Online', version: 14, format: 'A3L', fileName: 'Деталь.kcad',
  title: { title: 'Фланец', code: 'КР.001', material: 'Сталь', scale: '2:1', developer: 'А.Б.' },
  titleForm: 'lab5-template',
  templateTextOverrides: { 'lab5-template': { 'title-cell': 'Фланец — вариант Б', 'material-cell': 'Сталь 45' } },
  objects: [
    { id: 'dim-1', type: 'dimension', x1: 10, y1: 20, x2: 80, y2: 20, textSize: 7, arrowStyle: 'open', arrowStartStyle: 'tick', arrowEndStyle: 'dot', labelRotationDeg: 35, labelDx: 3, labelDy: -2, color: '#123456', layer: 'annotation' },
    { id: 'text-1', type: 'text', x: 12, y: 44, text: 'ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ\n1. Неуказанные...', size: 5, font: 'GOST type B,Arial,sans-serif', widthFactor: 1.1, rotation: 12, frame: true, underline: true, layer: 'annotation' },
    { id: 'rect-1', type: 'polyline', points: [{x:0,y:0},{x:50,y:0},{x:50,y:20}], straightPassCut: true, mode: 'noBottom', color: '#222', width: .5, layer: 'geometry' },
    { id: 'ref-1', type: 'reference', x: 0, y: 0, w: 25, h: 20, dataUrl: 'data:image/png;base64,aGVsbG8=', opacity: .5, locked: true, exportable: true, layer: 'reference' }
  ],
  ruler: { a: {x: 0, y: 0}, b: {x: 20, y: 0} }, rulerMode: 'parallel', rulerVisible: true,
  gost: { profile: 'eskd-study', mainLine: .5, thinLine: .25, dimensionTextHeight: 7, fontFamily: 'GOST type B' },
  assignmentDimensions: '⌀40; 70±0.1', viewPan: {x: 123, y: -45}, zoom: 2.75,
  grid: true, gridStep: 2.5, snap: true, objectSnap: false, ortho: true,
  template: true, visible: { geometry: true, dimensions: true, construction: false, template: true, reference: true }
};

const envelope = createProjectFile(completeDrawing, { exportedAt: '2026-11-18T10:00:00.000Z' });
assert.equal(envelope.kind, PROJECT_FILE_KIND);
assert.equal(envelope.schemaVersion, PROJECT_FILE_VERSION);
assert.deepEqual(readProjectFile(envelope), completeDrawing, 'A full project round-trip must preserve all drawing and formatting properties');
assert.deepEqual(readProjectFile(completeDrawing), completeDrawing, 'Legacy plain JSON project files must remain importable');
assert.equal(projectFileBaseName('C:\\Drawings\\Flange.kcad'), 'Flange');
assert.equal(projectFileBaseName('flange.json'), 'flange');
assert.equal(projectFileBaseName('', 'Backup'), 'Backup');
assert.throws(() => readProjectFile({ kind: 'other-app', schemaVersion: 1, document: completeDrawing }), /not a Kompas Online project/);
assert.throws(() => readProjectFile({ kind: PROJECT_FILE_KIND, schemaVersion: 999, document: completeDrawing }), /newer file format/);
assert.throws(() => readProjectFile({ kind: PROJECT_FILE_KIND, schemaVersion: 1, document: { format: 'A4P' } }), /no object list/);
console.log('Native project-file envelope tests passed (9 assertions).');
