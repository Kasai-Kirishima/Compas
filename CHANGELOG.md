# Changelog

## 1.5.2
- Connected edge-notch and inner-contour tools to the main CAD editor UI.
- Added editable edge-notch width, depth and minimum-web settings, plus rectangular, circular and obround inner-contour placement.
- Removed opaque white dimension-label masks and redundant connector shelves next to dimension values.
- Added automatic dimension-label clearance from its own dimension line while retaining extension lines that identify the measured endpoints.
- Added main-editor regression checks for cutout wiring and dimension rendering.

## 1.5.1
- Fixed eraser target selection: the object directly under the starting pointer is used instead of a stale selected object.
- Captured the all-objects eraser setting at pointer-down so changing the checkbox mid-stroke cannot change the transaction scope.
- Internal pocket contours are now placed at the next canvas click with editable width, height, radius, length and angle inputs; removed hard-coded insertion coordinates.
- Centred the origin-based sample drawing when loaded into the demo canvas.
- Added parametric `radialSlotCover` template matching the provided cover sketch: six radial slots, rounded ends, pitch circle and central hexagon.


## 1.5.0 — 2026-11-16

- Added profile cutout module: rectangular edge notches with orientation-aware inside normals, width/depth checks, minimum web option, self-intersection rejection, and immutable history transactions.
- Added inner 2D contours for rectangular pockets, circular holes, and obround slots.
- Added `eraseTargetAlongPath`, a safer single-object eraser API that always disables complete-object deletion.
- Reworked demo eraser interaction: starts on selected / under-cursor entity, applies to one target by default, and only affects all intersected geometry when explicitly requested.
- Removed the demo's whole-object erase opt-in; use the explicit Delete command for deleting a complete entity.
- Added selectable construction tools in the demo: line, centre line, circle, three-point arc, rectangle, regular polygon, linear dimension, and diameter dimension.
- Added a polygon-edge cutout workflow with editable width, depth, and minimum web.
- Added internal pocket / hole / slot contour insertion.
- Improved vertical dimension text clearance; line-break projection now includes additional glyph and stroke margin so the dimension line cannot run through the label.
- Added dimension hit-testing so dimensions can be selected and locally erased.
- Added regression tests for dimension clearance, single-target erasing, and cutout validity.

## 1.4.0

- Orientation-aware dimension numbers with decimal-comma formatting and transparent line breaks.
- Partial freehand eraser for lines, circles, arcs, polygons, and dimension linework.
- Parametric mechanical drawing templates, OSNAP, transformations, JSON serialization, and history.
