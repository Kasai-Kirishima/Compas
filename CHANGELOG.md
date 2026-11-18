## 1.5.20 — повторные проходы заново строят боковые стенки

- Исправлен повторный прямой проход по открытому контуру, полученному после предыдущего выреза. Раньше повторная операция только удаляла пересекающиеся сегменты пути и не добавляла боковые стенки.
- Для ранее вырезанного открытого контура программа временно замыкает границу только на время геометрического расчёта, повторно вычитает полосу заданной ширины и сохраняет результат с выбранным режимом стенок.
- В режиме «Без нижней стенки» каждый повторный глухой проход заново строит две точные параллельные боковые стенки и не создаёт поперечный торец. В режиме «Без стенок» новые боковые линии по-прежнему не создаются; полный режим сохраняет торец.
- Результаты помечаются как фрагменты прямого проходного выреза, поэтому повторные операции распознают их и продолжают Boolean-обработку. Для файлов 1.5.19 также предусмотрено распознавание открытых фрагментов по штатному имени «— открытый участок N».
- Обычные открытые отрезки, дуги и пользовательские линии продолжают получать простой разрыв без искусственного добавления стенок.
- Добавлены регрессионные тесты на повторный сквозной и глухой вырезы со стенками, проверку отсутствия торцевой линии и сохранение режима «Без стенок».

## 1.5.19 — повторные прямые вырезы без лимита на один объект

- Исправлено ограничение, из-за которого прямой проходной вырез обрабатывал только замкнутые контуры: открытые полилинии, оставшиеся после предыдущего глухого/безстеночного прохода, теперь также доступны для следующих операций.
- Добавлено геометрическое ядро `cutOpenPathByStraightPass`: оно вырезает из уже открытого пути участки, попавшие в повторную полосу произвольного направления, и сохраняет все оставшиеся части как отдельные редактируемые полилинии.
- Можно выполнять второй, третий и последующие проходы по одному и тому же результату предыдущего выреза; новые фрагменты остаются доступными для следующих вырезов. Фиксированного счётчика или флага «уже вырезано» нет.
- Поддержаны повторные проходы после режимов «Без нижней стенки» и «Без стенок», а также на обычных открытых линиях/полилиниях геометрического слоя.
- Новые операции объединяются в один шаг Undo на каждый жест; стили и слой исходного объекта сохраняются.
- Добавлены тесты повторного второго и третьего прохода по одному и тому же открытому результату и интеграционные проверки, что редактор включает открытые фрагменты в цели проходного выреза.

## 1.5.18 — произвольный угол и оба направления прямого прохода

- Прямой проходной вырез принимает произвольный вектор жеста: вертикально, горизонтально и под любым диагональным углом; геометрия полосы и две боковые стенки строятся строго по фактическому направлению жеста.
- Исправлена асимметрия направления для нескольких контуров: если начало жеста находится внутри конкретного профиля, а конец снаружи, направление прохода для этого профиля автоматически разворачивается. Это позволяет выполнять тот же проход с противоположной стороны, не меняя результат на остальных пересекаемых контурах.
- Добавлена стрелка направления и отображение текущего угла в предпросмотре.
- Добавлены регрессионные тесты на 17 направлений для режимов «Без нижней стенки», «Без стенок» и полного выреза, включая обратное направление на втором частично затронутом круге.

## 1.5.17
- Added a mode selector to **Прямой проходной вырез**: **Без нижней стенки** (default) preserves two exact parallel side walls but removes the transverse blind-end cap, leaving an open editable path; **Без стенок** removes only the boundary spans covered by the pass and adds no new side lines.
- Through-cuts retain closed split profiles in no-bottom mode; no-walls mode produces open boundary arcs. The selected mode is captured at pointer-down and applied consistently to all visible, unlocked intersected profiles in one undoable operation.
- Added geometry tests for blind and through passes in both modes, including assertions that no-bottom mode retains both straight walls without an end cap and no-walls mode creates no wall edges.

## 1.5.16 — прямой проходной вырез через несколько контуров

- Добавлен отдельный инструмент «Прямой проходной вырез»: зажать левую кнопку мыши снаружи детали, протянуть прямую полосу и отпустить в конечной точке.
- Один жест автоматически вырезает полосу одинаковой ширины во всех видимых, незаблокированных замкнутых объектах, находящихся на рабочих геометрических слоях и пересечённых траекторией; предварительное выделение не требуется.
- Две боковые стенки формируются точными параллельными отрезками постоянной ширины — они не наследуют сегментацию окружности.
- Полный проход через большой круг создаёт две отдельные замкнутые детали; остановка внутри следующего малого круга создаёт короткий глухой вход с прямым торцом. Продление жеста за круг прорезает его полностью.
- Добавлены интерактивный предпросмотр полосы, захват указателя, Escape для отмены, одна операция Undo и тесты большого/малого круга, сквозного/глухого прохода, прямых стенок и наклонного направления.

## 1.5.15 — восстановлена навигация рабочего поля и исправлен запуск редактора

- Исправлена блокирующая ошибка запуска: `updateSelectedDimension` вызывалась до инициализации `const`, из-за чего браузер выбрасывал `ReferenceError` и не доходил до регистрации обработчиков колёсика и панорамирования. Вспомогательная функция теперь объявлена через hoisted function declaration.
- Колёсико обрабатывается непосредственно на `drawingArea` в capture-фазе с `passive:false`: вверх приближает, вниз отдаляет относительно указателя. Событие отменяет нативную прокрутку браузера только внутри рабочей области; панели и поля интерфейса не затрагиваются.
- Рабочая область получила `overflow:hidden`: браузер больше не прокручивает лист как обычный контейнер вместо CAD-зумирования; перемещение листа выполняется только через внутренние координаты вида.
- Правая кнопка + перетаскивание реально двигают SVG-лист; панорамирование перехватывается до обработчиков рисования/выделения и блокирует контекстное меню браузера над чертежом. Средняя кнопка и Space + левая кнопка оставлены альтернативами.
- Добавлена браузерная проверка в Chromium: wheel увеличивает масштаб с 180% до 208%, `window.scrollY` остаётся 0, правая и средняя кнопки меняют `translate` рабочего листа, контекстное меню отменяется, ошибок JavaScript нет. В 1.5.14 та же проверка воспроизводила `ReferenceError: Cannot access 'updateSelectedDimension' before initialization`, после чего зум не работал.

## 1.5.14 — исправлено управление рабочим полем

- Основное панорамирование теперь выполняется удержанием правой кнопки мыши и перетаскиванием. Правая кнопка перехватывается на viewport до обработчиков SVG, поэтому не запускает рисование или выделение объектов.
- Средняя кнопка мыши и Space + левая кнопка оставлены как альтернативные способы перемещения рабочего поля.
- Контекстное меню браузера отключено только над рабочим полем; одиночный правый щелчок по-прежнему завершает открытую полилинию/сплайн.
- Обработчик колёсика перенесён на window capture и проверяет попадание координат указателя в область чертежа. Это не зависит от вложенного SVG-элемента, на котором возникло событие.
- Колёсико вверх/вниз масштабирует чертёж относительно курсора; чувствительность типичного шага увеличена примерно до 15%. Нативная прокрутка панелей вне листа не перехватывается.
- Добавлены проверки правой кнопки, блокировки контекстного меню, захвата указателя, обработки wheel на уровне окна и сохранения направления зума.

## 1.5.13 — прокрутка для зума, нажатое колесико для панорамирования

- Колесо мыши над рабочим полем масштабирует чертёж относительно положения курсора: прокрутка вверх приближает, вниз — отдаляет.
- Нажатие и удержание средней кнопки мыши (колёсика) с движением указателя перемещает рабочее поле; жест не запускает выбор, рисование или перемещение объектов.
- Панорамирование перехватывается на области чертежа в capture-фазе, а указатель захватывается самой областью, поэтому жест продолжается и за её границами.
- Добавлена обработка отмены указателя и потери pointer capture; при завершении панорамирования сохраняется новое положение листа.
- Сохранён альтернативный способ панорамирования через Space + перетаскивание левой кнопкой.
- Добавлены регрессионные проверки зума, средней кнопки, захвата указателя и завершения жеста.

## 1.5.12 — исправлено приближение колёсиком

- Перенесён обработчик `wheel` с `document` непосредственно на область чертежа и включена фаза захвата (`capture: true`), чтобы события гарантированно обрабатывались до вложенных SVG-элементов.
- Восстановлено ожидаемое управление: колесо вверх приближает, колесо вниз отдаляет; зум остаётся привязан к курсору.
- Расширен диапазон ручного масштаба с 25–600% до 10–3200%, чтобы приближение не упиралось в прежний предел.
- Сохранены `Shift + колесо` для горизонтального перемещения, `Alt + колесо` для вертикального перемещения и горизонтальное панорамирование тачпадом.
- Добавлены регрессионные проверки области и фазы обработки колёсика, направления зума и диапазона масштаба.

## 1.5.11 — восстановлена прокрутка колёсиком

- Перенесён обработчик колёсика на захват документа, чтобы события над вложенными SVG-слоями не терялись.
- Масштабирование снова центрируется по позиции курсора.
- Нормализованы события мыши, высокоточных тачпадов и старых `wheelDelta`; учтены пиксельные, линейные и постраничные единицы.
- Shift + колесо перемещает лист по горизонтали, Alt + колесо — по вертикали; чисто горизонтальный жест тачпада тоже перемещает лист.
- Вне области чертежа нативная прокрутка панелей и полей остаётся нетронутой.
- Добавлены автоматические тесты направления, масштаба и нормализации событий колеса.

# Changelog

## 1.5.16 — прямой проходной вырез через несколько контуров

- Добавлен отдельный инструмент «Прямой проходной вырез»: зажать левую кнопку мыши снаружи детали, протянуть прямую полосу и отпустить в конечной точке.
- Один жест автоматически вырезает полосу одинаковой ширины во всех видимых, незаблокированных замкнутых объектах геометрического слоя, пересечённых траекторией; предварительное выделение не требуется.
- Две боковые стенки формируются точными параллельными отрезками постоянной ширины — они не наследуют сегментацию окружности.
- Полный проход через большой круг создаёт две отдельные замкнутые детали; остановка внутри следующего малого круга создаёт короткий глухой вход с прямым торцом. Продление жеста за круг прорезает его полностью.
- Добавлены интерактивный предпросмотр полосы, захват указателя, Escape для отмены, одна операция Undo и тесты большого/малого круга, сквозного/глухого прохода, прямых стенок и наклонного направления.


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
