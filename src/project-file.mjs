/** Full-fidelity native project-file envelope for the browser CAD editor. */
export const PROJECT_FILE_KIND = 'kompas-online-project';
export const PROJECT_FILE_VERSION = 1;

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { throw new TypeError('Project data must be JSON-serializable'); }
}

function assertDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('Project document must be an object');
  }
  if (!Array.isArray(document.objects)) {
    throw new TypeError('Project document has no object list');
  }
  if (document.objects.length > 250000) {
    throw new RangeError('Project contains too many objects to import safely');
  }
  if (document.format != null && typeof document.format !== 'string') {
    throw new TypeError('Project sheet format is invalid');
  }
}

/**
 * Package a complete editor document. Object records are copied as-is, so all
 * type-specific fields (dimension styling, text frames, cut metadata, image
 * data URLs, layer/visibility/locking flags, etc.) survive round trips.
 */
export function createProjectFile(document, { exportedAt = new Date().toISOString() } = {}) {
  assertDocument(document);
  return {
    kind: PROJECT_FILE_KIND,
    schemaVersion: PROJECT_FILE_VERSION,
    exportedAt,
    document: cloneJson(document)
  };
}

/**
 * Read current .kcad envelopes and legacy plain-document .json files.
 * Returns a detached document and rejects unknown future file schemas.
 */
export function readProjectFile(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('File is not a CAD project');
  }
  let document = payload;
  if (payload.kind != null) {
    if (payload.kind !== PROJECT_FILE_KIND) throw new TypeError('This file is not a Kompas Online project');
    const version = Number(payload.schemaVersion);
    if (!Number.isInteger(version) || version < 1) throw new TypeError('Project file version is invalid');
    if (version > PROJECT_FILE_VERSION) throw new RangeError(`Project was created by a newer file format (v${version})`);
    document = payload.document;
  }
  assertDocument(document);
  return cloneJson(document);
}

export function projectFileBaseName(filename, fallback = 'Кресленик_1') {
  const value = String(filename || fallback).replace(/\\/g, '/').split('/').pop() || fallback;
  return value.replace(/\.(?:kcad|json)$/i, '').trim() || fallback;
}
