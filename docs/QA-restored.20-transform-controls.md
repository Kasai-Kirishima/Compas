# QA — restored.20 transform controls

## Root causes fixed

- The selection overlay uses `pointer-events:none`. The object rotation grip had no explicit `pointer-events:all`, and the stylesheet selector targeted the old, mismatched `data-rotate-handle` name. The grip therefore could not receive mouse input. The actual handle now declares `pointer-events:all` and has a matching CSS selector.
- The rotation button treated the displayed angle as an incremental delta. It now treats the input as the desired final angle and applies only `targetAngle - currentAngle`.
- The former box resize logic used `max(width,height)` for a circle. Changing only width could have no visible effect if the unchanged height was larger. Resizing is now handled by `scaleObjectToBounds`, preserving a circular profile when either dimension changes.
- General geometry scaling previously existed only as an incomplete menu action. A shared `scaleGeometryObject` transform now scales coordinates, radii, axes, text height, dimension text/arrow size, and reference dimensions.

## User controls

- Properties → Scale object: numeric factor and presets ×0.5, ×0.8, ×1.25, ×2.
- Properties → Position and size: actual geometry bounds are applied through the shared transform helper.
- Corner drag grips are provided for circle, ellipse, rectangle, and hatch. Shift preserves proportions during a non-uniform box resize.
- Rotation field is an absolute target angle. The amber mouse grip remains available for drag rotation; Shift snaps to 15-degree increments.

## Automated verification

`npm test` covers source syntax, app element bindings, the rotation handle's pointer-event contract, numeric scaling control bindings, scale math for circles/ellipses/rectangles/lines/text/references, the supplied Kompas `.kcad` import/export round-trip (32 objects), history, viewport, templates, and server assets.

## Browser limitation

A Chromium smoke test was attempted with Playwright against both `http://127.0.0.1` and an intercepted local test origin, but this environment returned `ERR_BLOCKED_BY_ADMINISTRATOR` before the page loaded. Therefore interactive drag behavior is not claimed as physically observed in this environment; the pointer event wiring is covered by code/DOM contract tests and the transform mathematics by unit tests.
