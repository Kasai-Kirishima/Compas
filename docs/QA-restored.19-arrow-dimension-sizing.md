# QA — restored.19: arrow and dimension number sizing

## Changes
- Standalone `arrowLine` and `curvedArrow` arrowheads now default to 3.2 mm and use a slimmer 15° half-angle.
- Selected straight/curved arrow objects expose an independent `arrowSize` property (0.5–20 mm) in the object-specific inspector.
- Existing dimensions expose an independent number-height control: numeric input and range slider (0.5–30 mm).
- New dimensions use the independently configurable `defaultDimensionTextHeight` numeric setting.
- Dimension arrowhead size remains a separate property (`arrowSize`); changing `textSize` does not change it.

## Automated verification
- `npm test` passes, including syntax checks, app contract checks, geometry, object editing, transforms, viewport, reference manager and server checks.
- The supplied Kompas `.kcad` import regression still verifies all 32 objects and the five dimensions.
- Mixed project export/import verifies `arrowLine.arrowSize`, `dimension.textSize`, and `dimension.arrowSize` survive independently.

## Browser limitation
A Playwright Chromium attempt to open the local server was blocked by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`), so this build is not represented as physically mouse-tested in a browser here.
