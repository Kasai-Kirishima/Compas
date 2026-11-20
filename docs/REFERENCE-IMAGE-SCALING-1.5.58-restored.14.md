# Reference image scaling — restored.14

## Behaviour

- Raster import reads the source image's natural pixel dimensions and assigns a 100 mm maximum long side. The short side is calculated from the same scale factor, so portrait and landscape images keep their native ratio.
- Imported reference objects store `aspectRatio`, `naturalWidth`, `naturalHeight`, and `keepAspect` in the editable project.
- SVG rendering uses `preserveAspectRatio="xMidYMid meet"` by default. Stretching is possible only when the user deliberately disables the aspect lock.
- The reference properties panel supports editing width and height. With the aspect lock enabled, changing either value recalculates the other dimension.
- Scale buttons enlarge by ×1.25 or ×2 and reduce by ×0.8.
- Selecting an unlocked reference reveals a lower-right resize grip. Dragging it preserves the ratio while the checkbox is on.
- “Fit to sheet” contains the full image inside the page margins without distortion.
- Older projects without a stored aspect ratio are repaired asynchronously using the embedded image's natural dimensions; the old width is retained and height is recalculated.

## Automated validation

`tests/test-reference.mjs` covers landscape/portrait imports, width-driven and height-driven resizing, intentional free stretching, proportional scaling, and fitting to a sheet. `tests/test-app-contract.mjs` checks that the UI controls are present and wired to the reference functions.
