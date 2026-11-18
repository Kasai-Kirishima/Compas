/**
 * ГОСТ 2.303-68 line patterns, expressed in drawing millimetres.
 * Thin dash-dot: choose the lower end of the allowed long-stroke and gap
 * ranges for compact, readable centre lines (5 mm dash, 3 mm gap).
 * The 0.1 mm dash is rendered as a round dot by SVG stroke-linecap="round".
 */
export const GOST_LINE_PATTERNS = Object.freeze({
  continuous: '',
  dashed: '6 2',
  dashDotThin: '5 3 0.1 3',
  dashDotThinLong: '8 3 0.1 3',
  dashDotTwoDots: '5 4 0.1 4 0.1 4',
  dotted: '0.1 2',
  shortDashed: '3 2',
  wave: 'WAVE',
  zigzag: 'ZIGZAG',
  none: 'none'
});

const legacyCenterlinePatterns = new Map([
  ['12 3 1 3', GOST_LINE_PATTERNS.dashDotThin],
  ['24 3 1 3', GOST_LINE_PATTERNS.dashDotThinLong],
  ['24 3 1 3 1 3', GOST_LINE_PATTERNS.dashDotTwoDots],
  ['18 2 1 2', GOST_LINE_PATTERNS.dashDotThin],
  ['8 1.5 1.5 1', GOST_LINE_PATTERNS.dashDotThin],
  ['8 2 1 2', GOST_LINE_PATTERNS.dashDotThin]
]);

export function normalizeGostDashPattern(value) {
  const pattern = String(value ?? '').trim();
  if (!pattern) return GOST_LINE_PATTERNS.dashDotThin;
  return legacyCenterlinePatterns.get(pattern) ?? pattern;
}

export const normalizeCenterlineDash = normalizeGostDashPattern;

export function isGostDashDotPattern(value) {
  const p = normalizeGostDashPattern(value);
  return [
    GOST_LINE_PATTERNS.dashDotThin,
    GOST_LINE_PATTERNS.dashDotThinLong,
    GOST_LINE_PATTERNS.dashDotTwoDots
  ].includes(p);
}
