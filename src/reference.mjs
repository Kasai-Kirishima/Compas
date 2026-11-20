const MIN_SIZE = 1;
const MAX_SIZE = 2000;

function finitePositive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function referenceAspectRatio(reference) {
  return finitePositive(reference?.aspectRatio, finitePositive(reference?.w, 1) / finitePositive(reference?.h, 1));
}

export function referenceImportSize(pixelWidth, pixelHeight, maxSideMm = 100) {
  const pw = finitePositive(pixelWidth, 1);
  const ph = finitePositive(pixelHeight, 1);
  const maxSide = Math.min(MAX_SIZE, finitePositive(maxSideMm, 100));
  const scale = maxSide / Math.max(pw, ph);
  return {
    w: Math.max(MIN_SIZE, pw * scale),
    h: Math.max(MIN_SIZE, ph * scale),
    aspectRatio: pw / ph,
    naturalWidth: pw,
    naturalHeight: ph,
    keepAspect: true,
  };
}

export function resizeReference(reference, axis, value, keepAspect = reference?.keepAspect !== false) {
  const currentW = finitePositive(reference?.w, 100);
  const currentH = finitePositive(reference?.h, 100);
  const ratio = referenceAspectRatio(reference);
  const v = Math.max(MIN_SIZE, Math.min(MAX_SIZE, finitePositive(value, axis === 'width' ? currentW : currentH)));
  if (!keepAspect) return axis === 'width' ? { ...reference, w: v, keepAspect: false } : { ...reference, h: v, keepAspect: false };
  return axis === 'width'
    ? { ...reference, w: v, h: Math.max(MIN_SIZE, Math.min(MAX_SIZE, v / ratio)), aspectRatio: ratio, keepAspect: true }
    : { ...reference, h: v, w: Math.max(MIN_SIZE, Math.min(MAX_SIZE, v * ratio)), aspectRatio: ratio, keepAspect: true };
}

export function scaleReference(reference, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) throw new RangeError('Scale factor must be a positive number');
  const w = Math.max(MIN_SIZE, Math.min(MAX_SIZE, finitePositive(reference?.w, 100) * f));
  const ratio = referenceAspectRatio(reference);
  return { ...reference, w, h: Math.max(MIN_SIZE, Math.min(MAX_SIZE, w / ratio)), aspectRatio: ratio, keepAspect: true };
}

export function fitReferenceToSheet(reference, sheetWidth, sheetHeight, margin = 10) {
  const ratio = referenceAspectRatio(reference);
  const maxW = Math.max(MIN_SIZE, Number(sheetWidth) - margin * 2);
  const maxH = Math.max(MIN_SIZE, Number(sheetHeight) - margin * 2);
  const baseW = finitePositive(reference?.w, 100);
  const baseH = baseW / ratio;
  const scale = Math.min(maxW / baseW, maxH / baseH);
  const w = Math.max(MIN_SIZE, baseW * scale);
  const h = w / ratio;
  return { ...reference, x: (Number(sheetWidth) - w) / 2, y: (Number(sheetHeight) - h) / 2, w, h, aspectRatio: ratio, keepAspect: true };
}
