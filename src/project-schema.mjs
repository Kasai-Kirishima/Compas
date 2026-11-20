/** Minimal project schema and safe normalizer for .kcad JSON files. */
export const PROJECT_VERSION = '1.6.0-rebuilt';
export function normalizeProject(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Project must be an object');
  const width = Number(input.width) || 420;
  const height = Number(input.height) || 297;
  if (!(width > 0 && height > 0 && width <= 3000 && height <= 3000)) throw new RangeError('Invalid paper dimensions');
  const objects = Array.isArray(input.objects) ? input.objects : [];
  const normalized = objects
    .filter((o) => o && typeof o === 'object')
    .map((o, i) => ({ ...o, id: String(o.id ?? `obj-${i + 1}`) }));
  return { ...input, version: PROJECT_VERSION, width, height, objects: normalized };
}
