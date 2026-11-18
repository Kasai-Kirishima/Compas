# CAD Geometry Core 1.5.31

## 1.5.31 — сняты фиксированные ограничения длины ножек размеров

- Убрано фиксированное ограничение 50 мм у продолжения обеих выносных ножек за размерной линией. Допускаются любые неотрицательные конечные значения, включая 0 мм.
- Убрано фиксированное ограничение 50 мм у передних зазоров; геометрический предел — только расстояние до размерной линии, чтобы ножка не пересекала её.
- Убрано ограничение 200 мм у отступа размерной линии.
- Ползунки автоматически расширяют диапазон при отпускании на крайнем значении; ввод числа и перетаскивание не имеют фиксированного максимума.

## 1.5.30 — star outline, region selection and fixed-angle hatching

- The six-pointed star is now one closed outer polyline (12 alternating tips and valleys), with no internal triangle lines.
- Use **Выбор области** to pick and highlight a bounded face separately from object selection; then press **Заштриховать выбранную область**. Direct click-to-hatch remains available.
- All area hatches use the angle set in **Фиксированный угол**; pointer location does not change orientation. `0°` is a valid angle. The same angle applies to sequential and automatic hatching.
- When a dimension is selected, square bounding-box resize handles are hidden; circular handles remain for editing its text, witness-leg endpoints/gaps and rotation.


## 1.5.28 — area hatch, six-pointed star and dimension handle refinements

- The **Штриховка области** tool now works by clicking inside a closed region. It identifies the smallest bounded face under the cursor, clips generated hatch segments to that exact region, and excludes interior holes. Multiple regions can be filled one after another without leaving the tool.
- Automatic loop detection uses a tighter boundary tolerance and more curve samples for smooth circular/elliptical boundaries. Original sketch curves remain unchanged; the hatch is stored as its own editable object.
- Added a **Шестиконечная звезда** tool. Click the center and a point on the circumcircle; the star is created as two equilateral triangle polylines in one group, so it moves, duplicates and exports together while remaining editable.
- Front/object-side and far/outer endpoints of both dimension witness legs are independently draggable. Relative pointer movement avoids jumps and supports both shortening and lengthening; changing one leg leaves the other untouched.
- Diameter dimensions expose **Снаружи** arrow placement: both arrowheads are positioned outside the circle and point inward. The `⌀` glyph is lowered slightly independently of the numeric baseline.
- Added regression tests for point-in-region hit-testing (including holes), click-to-hatch UI wiring, star geometry, diameter arrow placement and dimension-leg drag behavior.

## 1.5.24 dimension editing controls

- Dimension label rotation has a live slider (−360°…+360°, 0.5° steps), precise numeric input (0.1°), quick ±1°/±5°/±15° increments and reset. Only the text rotates.
- Dimension-line offset (the main length of the extension legs) has a slider and ±0.1/±0.5 mm buttons. Its numeric field accepts either sign to keep the dimension on either side of the measured geometry.
- Extension beyond the dimension line has a separate 0.1 mm fine slider and numeric field. Each slider drag is one Undo operation.

## 1.5.23 advanced 2D sketch operations

- Object snaps are now connected to the main editor: endpoints, segment midpoints, circle/arc/ellipse centres, circle quadrants and intersections. The analytic geometry kernel is used for line/circle/arc and circle/circle intersections; sampled paths are used only where the source is intrinsically freeform.
- Trim now works by clicking the section to remove between adjacent intersections on line segments, circles, arcs, rectangles, ellipses and closed polylines. Source objects are replaced by editable pieces in one undoable transaction.
- Added the **Arc (3 points)** tool: start, a point on the arc, and end. The solver selects the corresponding minor/major sweep and rejects degenerate collinear input.
- Regular polygons now include **Across flats** sizing. For a hexagon with 40 mm across flats, set the cursor at the apothem distance (20 mm from the centre to the midpoint of a side); the core API accepts the full across-flats measurement.
- Added planar-region recognition from independent and intersecting sketch curves. The graph splits intersections, walks bounded faces, and classifies nested loops as holes/islands.
- Added automatic region hatching for the detected faces. Hatch segments are clipped around inner holes; solid hatching uses even-odd fill. Original source curves remain unchanged.
- Existing circles, lines, arcs, polygons, circular/rectangular arrays, single-boundary hatch, and basic geometry primitives were already present and were not duplicated. 3D boss extrusion and through-all Boolean cuts are not included because this project remains a 2D editor and has no 3D solid kernel.


A dependency-free JavaScript ES-module geometry core and browser demo for 2D mechanical drafting.

## 1.5.23 full project exchange (.kcad)

Use **Экспорт проекта** to download a `.kcad` file. It preserves the complete editable drawing: all geometry, open/closed cut contours, dimensions and individual arrow/label settings, text with multi-line content and frames, title-block/frame template and per-cell overrides, sheet and GOST/DSTU settings, layers/visibility, ruler and viewport options, and embedded image references. Use **Импорт проекта** to restore it; the application automatically creates a separate “— импорт” project in the local file library instead of overwriting the source. Legacy plain `.json` project files remain importable.

## 1.5.21 repeated-cut opening preservation

When an earlier blind/no-bottom pass leaves an open contour, the editor temporarily closes it for the next Boolean calculation. The temporary segment joining the two open endpoints is now tracked and removed again after the calculation (including any sub-segments created where a new pass crosses it). This prevents a previous missing bottom wall from reappearing on the second, third, or later pass. The selected wall mode applies only to the newly created cut; previously open ends stay open.

## Included capabilities

### Drawing primitives
- finite line segments and centre lines;
- circles and signed-sweep arcs;
- regular and user-vertex polygons;
- linear and diameter dimensions with text orientation, readable placement, decimal-comma formatting, line gaps beneath labels, and the dedicated `⌀` diameter symbol (legacy `Ø` / Cyrillic `Ш` prefixes are normalized).

### Editing
- Straight pass-cut by left-button drag: sweep a fixed-width straight corridor through visible unlocked closed profiles and open paths; choose **Без нижней стенки** to retain exact parallel side walls while leaving a blind end open, or **Без стенок** to remove only boundary portions without adding side lines; through-cuts remain editable fragments;
- Unlimited repeated straight passes on the same geometry: open contours left by earlier blind/no-walls cuts are reconstructed virtually for Boolean subtraction, then saved again with the selected side-wall mode; second and later passes therefore create their own exact parallel walls instead of only deleting line segments;
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

## Straight pass-cut across multiple circles / profiles

Choose **Прямой проходной вырез**, set its width, select a boundary mode, press the left mouse button and drag along the desired straight path at any angle and from either side. If the drag begins inside a profile and ends outside it, the editor reverses the local direction for that profile so the open end remains on the starting side. The same pass applies automatically to every visible, unlocked closed profile it intersects; no separate multi-selection is required. Lock or hide profiles that must be protected.

- **Без нижней стенки** (default) retains two exactly straight, parallel side walls. If the drag stops inside a later/smaller circle, the inner end cap is removed and the contour becomes an open editable polyline; both side walls remain and end freely at the release point. If the drag exits a profile completely, it becomes two closed editable pieces joined by the straight side walls.
- **Без стенок** removes the original boundary portions covered by the pass corridor and adds no side walls or end cap. A blind entry leaves one open boundary arc; a complete through-cut leaves the two remaining boundary arcs as separate open editable paths.

Curved outer arcs remain sampled polylines. In **Без нижней стенки**, the new side walls use exact line coordinates parallel to the drag axis. This is a 2D profile edit, not 3D milling simulation.

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

### Рабочее поле и навигация — 1.5.15

- Наведи указатель на чертёж и крути колесо мыши: вверх — приблизить, вниз — отдалить. Масштабирование привязано к позиции курсора и меняется примерно на 15% за стандартный шаг колеса.
- Над рабочим полем колесо не прокручивает страницу или лист как обычный HTML-контейнер: `drawingArea` не имеет нативной прокрутки, а wheel-событие в capture-фазе отменяет браузерное действие и меняет масштаб CAD.
- Чтобы двигать рабочее поле, удерживай **правую кнопку мыши** и перетаскивай мышь. Контекстное меню браузера над листом подавляется; объект не выделяется и не редактируется.
- Средняя кнопка + перетаскивание и `Space` + левая кнопка + перетаскивание остаются альтернативными способами панорамирования.
- Обычная левая кнопка работает как раньше — выбирает объекты и запускает текущий инструмент; для панорамирования левой кнопкой нужно удерживать `Space`.
- В 1.5.14 ошибка инициализации JavaScript останавливала подключение навигационных обработчиков. В 1.5.15 она исправлена; проверено реальными wheel/pointer событиями в Chromium.

## 1.5.25 перемещение отдельной грани многоугольника

Выбери категорию **Редактирование** → **Переместить грань**. Наведи курсор на любую сторону замкнутого многоугольника или обычного прямоугольника: сторона подсветится. Зажми левую кнопку и перетащи её поперёк — она останется параллельной исходной, а две соседние вершины автоматически сместятся по линиям соседних сторон. Остальные вершины останутся на месте.

Для точного изменения можно один раз щёлкнуть по стороне, ввести знаковое смещение в миллиметрах (шаг поля 0,1 мм) и нажать **Применить точное смещение**. Положительное/отрицательное значения двигают грань в противоположных направлениях относительно её обхода. Во время перетаскивания удерживай **Shift**, чтобы округлять смещение до шага 0,5 мм. `Ctrl+Z` отменяет последнее изменение грани.

Поддерживаются замкнутые полилинии, включая правильные многоугольники и контуры, а также обычные прямоугольники (они становятся редактируемой полилинией после первого изменения). Скруглённые прямоугольники, открытые линии и окружности этим инструментом не редактируются. Операция отклоняется, если соседняя грань параллельна выбранной, сторона схлопывается или контур самопересекается.


## 1.5.26 — независимые выносные ножки размеров

Выбранный размер показывает две отдельные голубые ручки на концах выносных линий. Потяните нужную ручку вдоль её оси: длина изменится только у этой ножки, противоположная останется неизменной. В панели свойств также доступны отдельные числовые поля, ползунки и шаги ±0,1/±0,5 мм для первой и второй ножки.

Для старых проектов поддерживается прежнее общее поле `extensionBeyond`: оно используется как начальное значение обеих ножек, пока пользователь не отредактирует каждую отдельно. Новые значения `extensionBeyondStart` и `extensionBeyondEnd` сохраняются в `.kcad`.


### 1.5.27 — компактная штрихпунктирная линия по ГОСТ

Тонкая штрихпунктирная линия по умолчанию: штрих 5 мм, промежуток 3 мм, точка — короткая круглая отметка. Дополнительный вариант: штрих 8 мм и промежуток 3 мм. Старые шаблоны 12/24 мм автоматически приводятся к новым компактным значениям при отображении.


## Area hatch by clicking inside a boundary

Choose **Штриховка области** and click inside a closed area. The editor builds planar regions from the selected geometry, or from all visible unlocked sketch geometry when nothing is selected. It hatches only the smallest region under the cursor; segments are clipped to the outer boundary and excluded from holes. You can click several different regions consecutively. Use the pattern selector for single, cross or solid fill. The separate **Найти замкнутые области из линий и заштриховать** command still hatches every detected bounded face.

## Six-pointed star

Choose **Звезда 6-кон.**, click its centre, then click a point on the outer circumcircle to define size and orientation. The editor creates two intersecting equilateral triangles as editable closed polylines in one group. Selecting or moving either triangle selects/moves the complete star; ungroup to edit one triangle independently.

## Independent dimension extension endpoints and diameter arrows

When a dimension is selected, blue handles at the far ends and green handles at the object-side beginnings of the two extension lines can be dragged independently. The opposite endpoint does not move. Dragging is relative to the initial pointer position, so grabbing the handle away from its centre does not cause a jump; drag toward the object to shorten a front gap or away from the dimension to lengthen it. For diameter dimensions, choose **Снаружи** in arrow placement to draw both arrowheads beyond the circle, pointing inward. The diameter `⌀` glyph sits slightly below the numeric baseline.


### Dimension resizing (1.5.29)

Selection-box resizing now preserves dimension orientation. Diagonal dimensions no longer tilt when the bounding box is stretched unevenly; horizontal and vertical dimensions keep their exact axis. The measured length scales along the dimension direction, while the offset and witness legs scale perpendicular to it. Radius, diameter and angular annotations also retain their ray directions/angle. Text height and arrow size stay fixed during geometry resizing.
