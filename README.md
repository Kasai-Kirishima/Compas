# CAD Geometry Core 1.5.7

A dependency-free JavaScript ES-module geometry core and browser demo for 2D mechanical drafting.

## Included capabilities

### Drawing primitives
- finite line segments and centre lines;
- circles and signed-sweep arcs;
- regular and user-vertex polygons;
- linear and diameter dimensions with text orientation, readable placement, decimal-comma formatting, and line gaps beneath labels.

### Editing
- Split open paths at any interior point, including the exact midpoint or very near an endpoint;
- Split closed profiles into two independent closed contours by picking two boundary points;
- Split support includes lines, construction/centre lines, arcs, open polylines, splines, freehand curves, rectangles, rounded rectangles, circles, ellipses, and closed polygonal contours;
- Trim between neighbouring intersections;
- partial freehand erasing for lines, centre lines, circles, arcs, polygon edges, and dimension linework;
- safe single-target erasing (`eraseTargetAlongPath`) so a stroke does not affect unrelated nearby objects;
- complete-object erasing is deliberately disabled by the UI eraser; use Delete for whole-object removal;
- repeatable edge notches on rectangles (including rounded corners), circles, ellipses, and closed polylines; curved boundaries are tessellated and can receive notches wider than one sampled edge;
- nested cutouts on existing notch walls and bases, with geometry checks that reject self-intersections;
- width-defined gaps on open lines, arcs, construction/centre lines, breaklines, splines, freehand curves, and open polylines; the remaining fragments stay independently editable;
- inner rectangular, circular, and obround cutout contours (available in the main editor as **Разместить внутренний контур**);
- automatic dimension-label clearance without opaque white text masks or extra connector shelves;
- dedicated duplicate placement for one or many selected objects, with cursor-following preview, click/drag placement, independent copied group IDs, `Ctrl+D`, Escape cancel, and Undo;
- freely drag dimension numbers directly by the text in any 2D direction (along or perpendicular to the dimension line), including closer to or farther from the line;
- OSNAP endpoint, midpoint, centre, and intersection points;
- bounded Undo/Redo history;
- JSON scene export/import.

### Mechanical templates
Twelve parametric drawing starters: rounded slot, bolt circle, flange, plate with holes, hex head, stepped shaft, bushing, washer, bearing, counterbored hole, rectangular hole array, and the radial-slot cover from Variant No. 6.

## Quick start

Requirements: Node.js 18+. No external npm dependencies.

```bash
npm test
python -m http.server 8000
```

Open <http://localhost:8000/> for the main CAD editor. The simplified demo remains available at <http://localhost:8000/examples/demo.html>.

## Duplicate objects and place dimension numbers

Select one or more objects and choose **Дублировать** in the ribbon or editing panel, or press `Ctrl+D`. Move the pointer to see a live preview of the copies, then click to place them; dragging also places the copies at the final cursor position. Copies receive new object IDs and independent group IDs. Press `Escape` before placement to cancel. The completed operation is one Undo step.

Select a dimension and drag the dimension number itself. The number can move freely in two dimensions: along the dimension line or perpendicular to it, closer to or farther from the measured geometry. The first movement starts at the currently displayed label position, and manual placement is retained rather than being automatically pushed away from the dimension line. Undo restores the previous label position.

## Split geometry

Use **Разделить объект** from the editing panel or the top ribbon. An open object (line, centre line, construction line, arc, open polyline, spline, or freehand path) is divided with one click anywhere along it. There is no 2% endpoint margin; any interior point is accepted. A closed object (rectangle, rounded rectangle, circle, ellipse, or closed polyline/spline) is divided with two clicks on its boundary. The straight chord between the points becomes a shared edge, and both resulting regions remain separate closed editable objects. Undo/Redo records the complete operation.

A split cannot create a zero-length fragment. For concave profiles, the selected chord must remain inside the original contour; a chord crossing an exterior notch is rejected to avoid malformed geometry. Text, dimensions, leaders, and raster references are annotations/references rather than profile geometry and are not split by this tool.

## Cutouts: important distinction

`cutPolygonNotch` modifies the boundary of one simple polygon by inserting a rectangular notch open to a selected edge. `createRectangularPocket`, `createCircularCutout`, and `createObroundCutout` create separate closed 2D contours for drafting holes or pockets.

These are 2D drafting tools, not 3D solid Boolean operations. Repeated and nested notches are stored in the same editable contour; a new cut that would create a self-intersection or leave the profile is rejected. Internal hole contours are separate linework, not an automatic polygon-minus-polygon Boolean subtraction.

## Safer eraser behavior

The demo starts in Select mode. When Eraser is chosen, the first stroke is restricted to the topmost editable object directly under the pointer at stroke start; a stale selection cannot override it. To modify all touched objects, the user must explicitly enable the checkbox. Full-object deletion is never enabled by the demo's eraser. Fully covered objects are protected in the geometry API unless a caller explicitly opts into complete erasure; the safer `eraseTargetAlongPath` helper always forces protection.

## Modules

```text
src/
  cad-geometry-trim.mjs  primitives, intersections, Trim, dimensions, transforms, OSNAP, JSON
  eraser.mjs             partial eraser and single-target safe wrapper
  cutouts.mjs            closed-boundary notches, open-path gaps, open-path splitting, closed-profile splitting and inner contours
  templates.mjs          parametric mechanical drawing templates
  history.mjs            Undo/Redo transaction history
  index.mjs              public exports
examples/
  demo.html              browser application shell
  demo.mjs               interactive Canvas demo
  sample-machined-part.json generic example drawing scene
  sample-variant-6-cover.json radial-slot cover from the supplied sketch
 tests/
  test-cad-geometry.mjs
  test-dimension-render.mjs
  test-eraser.mjs
  test-eraser-properties.mjs
  test-history.mjs
  test-templates.mjs
  test-cutouts.mjs
  test-sample-project.mjs
 docs/
  DIMENSIONS.md
  ERASER.md
  CUTOUTS.md
  TOOLS_FOR_LAB.md
  TEMPLATES.md
```

## Scope / known limitations

- Coordinates are model-space numbers (normally millimetres); Canvas scaling is a renderer concern.
- Cutout operations are 2D contours; there is no 3D material subtraction. A risky overlapping notch that would create a self-intersection is rejected rather than corrupting the outline. Inner circles/slots are separate contours.
- Arc creation in the demo uses a counter-clockwise sweep from the specified start point to end point.
- DXF/DWG file import/export and 3D modelling are not included.

See `START_HERE.md` for a short guided workflow and the `docs/` folder for detail.


## Кришка, варіант №6

У каталозі є параметричний шаблон `radialSlotCover`, побудований за наданим ескізом: зовнішній діаметр 84 мм, ділильне коло Ø46 мм, шість радіальних пазів шириною 6 мм із заокругленими кінцями Ø16 мм і центральний шестикутник 20 мм між гранями. Це параметризований 2D-контур; перед здачею потрібно звірити, що кількість пазів і всі розміри збігаються з оригінальним завданням.

## Поведінка демонстрації

- Ластик у звичайному режимі стирає тільки об’єкт, по якому розпочато штрих; стан «усі об’єкти» фіксується на початку жесту. Стара виділена сутність не підміняє об’єкт під курсором.
- Внутрішній отвір/карман розміщується наступним кліком по полотну. Розмір і кут задаються полями, фіксованої координати вставки немає.
- Завантажений зразок навколо початку координат автоматично центрується в демонстраційному полотні.
