# Changelog

## 1.5.10
- Added editable dimension arrowheads: filled triangles, open V-arrows, diagonal ticks, dots, or no arrow. The first and second endpoints can use independent overrides or inherit the common style.
- Added per-dimension arrow size, independently adjustable from 0.8 to 12 mm.
- Added independent dimension-number rotation from -360° to +360° with a one-click reset to 0°. It rotates only the label and does not rotate the dimension line or extension lines.
- Applied label rotation consistently to linear, horizontal, vertical, radius, diameter and angular dimensions; label dragging and placement remain independent.
- Added regression checks for the arrow-style controls, endpoint overrides, arrow size, and independent label rotation.


## 1.5.9
- Replaced the displayed diameter prefix with the dedicated Unicode diameter sign `⌀` in dimension labels, toolbar controls, tolerances and assignment examples. Legacy `Ø`, `ø` and Cyrillic `Ш/ш` prefixes are still accepted and normalized when reading diameter dimension labels.
- Made text insertion more discoverable: the ribbon and annotation panel now say **Добавить текст**, the `T` key activates the text tool, and double-clicking an empty drawing area in Select mode opens the text editor at that point.
- Retained multiline text entry and formatting for font, height, width, rotation, alignment, line spacing, letter spacing, color, bold/italic/underline/overline/strike and frame; existing text can be edited by double-clicking it.
- Added regression tests for diameter glyph normalization and text insertion entry points.


## 1.5.8
- Added a third **Без нижней стенки** edge-cutout mode: both side walls remain while the bottom/base connector is omitted, producing one editable open contour. Works on polygonal profiles and circles.
- Kept the existing full-notch mode (side walls + bottom line) and no-walls boundary-gap mode as separate controls with clearer labels.
- Added one-click batch processing for multiple selected objects: the click point is projected to each selected object's nearest boundary/path and the same cut width/depth is applied to all compatible objects. Successful edits are committed as one Undo step; incompatible/locked objects are skipped.
- Added core and main-editor regression tests for open-bottom notches on rectangles and circles, all three UI modes, and multi-selection batch projection.

## 1.5.7
- Added a dedicated **Дублировать** placement workflow for one or many selected objects, available from the ribbon, editing panel, and `Ctrl+D`.
- Duplicate placement displays a live cursor-following preview; click to place or drag to position. New IDs and independent group IDs are assigned to the copies; `Escape` cancels and Undo reverses the completed duplication.
- Dimension numbers can now be dragged directly by the text in any 2D direction, both along and perpendicular to the dimension line, closer to or farther from it.
- The first pointer movement starts from the actually rendered label coordinates, preventing a jump from the automatic-clearance position. A manually placed label remains exactly where dropped, including at the nominal baseline.
- Added regression checks for duplicate placement and no-jump, unrestricted 2D dimension-label movement.


## 1.5.5
- Added a separate general-purpose **Разделить объект** tool to the main editor and top ribbon.
- Open paths can be split with one click at any interior point, including the exact midpoint and points near endpoints; removed the previous arbitrary 2% minimum position limit.
- Closed contours can be split with two boundary picks; a chord creates two separate closed editable profiles.
- Added split support for lines, construction/centre lines, arcs, open polylines, splines, freehand curves, rectangles, rounded rectangles, circles, ellipses and closed contours.
- Preserved object style/layer and history, with guide preview between the two clicks for closed contours.
- Added regression tests for 50/50 splits, near-end splits, polyline splits, equal-area profile splits and concave-profile safety.

## 1.5.4
- Extended edge notches to ellipses, rounded rectangles and curved/tessellated boundaries; notch widths can span multiple consecutive boundary edges.
- Enabled repeated and nested cuts on an already-notched contour, including its walls and base; invalid self-intersecting results remain safely rejected.
- Added width-defined gaps for open segments, arcs, construction/centre lines and open polylines; remaining fragments stay independently editable and can be cut again.
- Removed any per-object cutout-count cap; the practical limit is drawing complexity and available memory.
- Added regression coverage for nested, repeated, curved-boundary and open-path cuts.


## 1.5.3
- Extended the main edge-cutout tool to circular boundaries; click the circumference to create a radial inward notch using the existing width, depth and minimum-web controls.
- Converts the edited circle into a single smooth closed polyline while retaining its object ID, name, color and line width.
- Added geometric and main-editor regression tests for valid and rejected circular notches.

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
