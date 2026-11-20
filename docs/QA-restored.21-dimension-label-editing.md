# QA — restored.21 dimension label editing

## Changes

- Dimension value text is independently draggable without moving the measured geometry or dimension line.
- Selecting a dimension exposes a free-move square, an axis-constrained diamond, a text-height handle and a dedicated text-rotation handle.
- The Properties panel now commits the value text, visibility, label X/Y offsets, text orientation, label rotation, text height, arrow style and arrow placement.
- Numeric text height has a slider and quick +/- 0.5 / 1 mm adjustments. Label rotation retains numeric, slider and quick-angle controls.
- Arrow placement supports automatic, inside and outside modes. The same layout logic applies to diameter dimensions. Individual endpoint styles support filled, open, tick, dot and no-arrow variants.
- Diameter/radius labels are generated from current geometry unless a custom label is entered, avoiding stale values for newly created dimensions.
- Dimension definition points have direct endpoint grips.
- Added pure dimension-layout helpers and automated tests for horizontal geometry, diameter geometry/value, automatic arrow placement and independent label offsets/rotation.

## Automated verification

- `npm test` passes, including all previous project import/export, transform, app-contract and server tests plus `tests/test-dimensions.mjs`.
- The supplied Kompas `.kcad` project still imports and round-trips its 32 editable objects.

## Browser limitation

The application can be source-checked and tested in Node. A real mouse-driven Chromium smoke test should still be performed in the target browser before relying on cursor hit areas at all zoom levels.
