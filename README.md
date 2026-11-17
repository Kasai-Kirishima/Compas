# CAD Geometry Core 1.5.12

A dependency-free JavaScript ES-module geometry core and browser demo for 2D mechanical drafting.

## Included capabilities

### Drawing primitives
- finite line segments and centre lines;
- circles and signed-sweep arcs;
- regular and user-vertex polygons;
- linear and diameter dimensions with text orientation, readable placement, decimal-comma formatting, line gaps beneath labels, and the dedicated `⌀` diameter symbol (legacy `Ø` / Cyrillic `Ш` prefixes are normalized).

### Editing
- Split open paths at any interior point, including the exact midpoint or very near an endpoint;
- Split closed profiles into two independent closed contours by picking two boundary points;
- Split support includes lines, construction/centre lines, arcs, open polylines, splines, freehand curves, rectangles, rounded rectangles, circles, ellipses, and closed polygonal contours;
- Trim between neighbouring intersections;
- partial freehand erasing for lines, centre lines, circles, arcs, polygon edges, and dimension linework;
- safe single-target erasing (`eraseTargetAlongPath`) so a stroke does not affect unrelated nearby objects;
- complete-object erasing is deliberately disabled by the UI eraser; use Delete for whole-object removal;
- three edge-cutout modes on rectangles (including rounded corners), circles, ellipses, and closed polylines: full notch with both side walls and a bottom, open-bottom notch with side walls retained, and boundary opening without added walls;
- batch edge-cutting: select several geometries and click once to project the click to each selected object's nearest boundary; each compatible selected object receives the same width/depth operation;
- nested cutouts on existing notch walls and bases, with geometry checks that reject self-intersections;
- width-defined gaps on open lines, arcs, construction/centre lines, breaklines, splines, freehand curves, and open polylines; the remaining fragments stay independently editable;
- inner rectangular, circular, and obround cutout contours (available in the main editor as **Разместить внутренний контур**);
- automatic dimension-label clearance without opaque white text masks or extra connector shelves;
- dedicated duplicate placement for one or many selected objects, with cursor-following preview, click/drag placement, independent copied group IDs, `Ctrl+D`, Escape cancel, and Undo;
- edit dimension arrowheads as filled triangles, open V-arrows, diagonal ticks, dots, or no arrow; the first and second ends can use independent styles and per-dimension size;
- rotate only the dimension number from -360° to +360° without rotating the dimension line, extension lines, or measured geometry; reset the text rotation to 0°;
- freely drag dimension numbers directly by the text in any 2D direction (along or perpendicular to the dimension line), including closer to or farther from the line;
- insert multi-line text from the ribbon or annotation panel, press `T` to activate the text tool, or double-click an empty drawing area; adjust font, height, width, rotation, alignment, line/letter spacing, color, emphasis and frame; double-click an existing text object to edit it;
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

## Dimension arrowheads and independent label rotation

Select a dimension and open **Параметры размера** in the object properties panel. Choose a common arrowhead style: filled triangle, open V, diagonal tick, dot, or none. The first and second arrowheads can override the common style independently, or inherit it. Adjust arrow size separately for each dimension.

The **Поворот только цифры** field rotates the dimension label from -360° to +360° while leaving the dimension line, extension lines, measured points and arrowheads untouched. Use **Сбросить до 0°** to restore the default text angle. The setting works with linear, horizontal, vertical, radius, diameter and angular dimensions and is stored with the drawing.

## Duplicate objects and place dimension numbers

Select one or more objects and choose **Дублировать** in the ribbon or editing panel, or press `Ctrl+D`. Move the pointer to see a live preview of the copies, then click to place them; dragging also places the copies at the final cursor position. Copies receive new object IDs and independent group IDs. Press `Escape` before placement to cancel. The completed operation is one Undo step.

Select a dimension and drag the dimension number itself. The number can move freely in two dimensions: along the dimension line or perpendicular to it, closer to or farther from the measured geometry. The first movement starts at the currently displayed label position, and manual placement is retained rather than being automatically pushed away from the dimension line. Undo restores the previous label position.

## Split geometry

Use **Разделить объект** from the editing panel or the top ribbon. An open object (line, centre line, construction line, arc, open polyline, spline, or freehand path) is divided with one click anywhere along it. There is no 2% endpoint margin; any interior point is accepted. A closed object (rectangle, rounded rectangle, circle, ellipse, or closed polyline/spline) is divided with two clicks on its boundary. The straight chord between the points becomes a shared edge, and both resulting regions remain separate closed editable objects. Undo/Redo records the complete operation.

A split cannot create a zero-length fragment. For concave profiles, the selected chord must remain inside the original contour; a chord crossing an exterior notch is rejected to avoid malformed geometry. Text, dimensions, leaders, and raster references are annotations/references rather than profile geometry and are not split by this tool.

## Cutouts: important distinction

`cutPolygonNotch` modifies the boundary of one simple polygon by inserting a rectangular notch open to a selected edge. The main editor exposes three modes: full notch (two side walls plus the bottom edge), no-bottom-wall notch (two side walls remain while the bottom edge is removed and the contour is open), and no-walls gap (only an outer boundary segment is removed). Multi-selection batch mode applies the same width/depth to every selected editable object by projecting the click to each object's nearest boundary. `createRectangularPocket`, `createCircularCutout`, and `createObroundCutout` create separate closed 2D contours for drafting holes or pockets.

These are 2D drafting tools, not 3D solid Boolean operations. Repeated and nested notches are stored in the same editable contour; a new cut that would create a self-intersection or leave the profile is rejected. Internal hole contours are separate linework, not an automatic polygon-minus-polygon Boolean subtraction.

## Safer eraser behavior

The demo starts in Select mode. When Eraser is chosen, the first stroke is restricted to the topmost editable object directly under the pointer at stroke start; a stale selection cannot override it. To modify all touched objects, the user must explicitly enable the checkbox. Full-object deletion is never enabled by the demo's eraser. Fully covered objects are protected in the geometry API unless a caller explicitly opts into complete erasure; the safer `eraseTargetAlongPath` helper always forces protection.

## Modules

```text
src/
  cad-geometry-trim.mjs  primitives, intersections, Trim, dimensions, transforms, OSNAP, JSON
  eraser.mjs             partial eraser and single-target safe wrapper
  cutouts.mjs            three edge-notch modes, batch-ready boundary helpers, open-path gaps, splitting and inner contours
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

### Wheel zoom fix — 1.5.12

Wheel events are handled by the drawing viewport itself in capture phase, before SVG descendants. This avoids missed events from document-level target delegation. Wheel up zooms in and wheel down zooms out at the cursor. Manual zoom range is 10%–3200%; Shift+wheel and Alt+wheel retain horizontal and vertical panning.
