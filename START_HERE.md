## 1.5.30 — star outline, region selection and fixed-angle hatching

- **Звезда 6-кон.** now creates one closed outline without the internal crossing lines.
- For a separate region-picking step, activate **Выбор области**, click inside the intended bounded area, then use **Заштриховать выбранную область**. The picked area is highlighted before hatching.
- Set **Фиксированный угол** once. Every hatch uses that same angle regardless of where you click; `0°` works as expected.
- Selected dimensions no longer show square resize grips. The circular edit handles remain.

## 1.5.29 — растяжение размеров без перекоса

При растяжении размера за ручки рамки выделения сохраняется его исходный угол. Для горизонтальных размеров остаётся горизонтальная ось, для вертикальных — вертикальная, для наклонных — исходный наклон. Измеряемая длина изменяется вдоль размерной линии; отступ и выносные ножки — по перпендикуляру. Текст и наконечники не увеличиваются случайно.

## 1.5.24 advanced 2D sketch tools

- Toggle **Привязка к объектам** to snap to endpoints, midpoints, centres, quadrants and intersections. The tolerance follows the current zoom.
- Use **Дуга (3 точки)** and pick start, a point on the curve, and end.
- For regular polygons choose **По граням** and click at the apothem distance from the centre; the generated across-flats dimension is twice that distance. **По вершинам** and **По апофеме** remain available.
- Use **Усечь** and click the line/arc/circle section between two adjacent intersections. Closed rectangles, ellipses and closed polylines can also be trimmed; each edit can be undone.
- To hatch faces formed by several separate/intersecting lines and curves, select the relevant geometry (or leave the selection empty to use all visible geometry) and press **Найти замкнутые области из линий и заштриховать**. Holes are detected and left unhatched.

## 1.5.24 2D sketch tools

3D boss extrusion and Boolean through-all cutting are not available in this 2D-only application; these require a separate 3D solid kernel.

## 1.5.24 full project exchange (.kcad)

Use **Экспорт проекта** to download a `.kcad` file. It preserves the complete editable drawing: all geometry, open/closed cut contours, dimensions and individual arrow/label settings, text with multi-line content and frames, title-block/frame template and per-cell overrides, sheet and GOST/DSTU settings, layers/visibility, ruler and viewport options, and embedded image references. Use **Импорт проекта** to restore it; the application automatically creates a separate “— импорт” project in the local file library instead of overwriting the source. Legacy plain `.json` project files remain importable.

# Start here

## 1.5.28 area hatching and six-pointed star

- Choose **Штриховка области**, then click inside the closed area. The editor scans all visible, unlocked boundary geometry even if another object was previously selected, detects the smallest region under the click, and clips hatch lines to that region. Inner holes remain empty. To fill the area completely rather than use line hatching, choose **Сплошная** in the hatch pattern setting. Repeat clicks to hatch additional areas.
- For boundaries made from separate/intersecting lines, keep all boundary pieces visible and make sure the intended region is fully closed. The command **Найти замкнутые области из линий и заштриховать** remains available to fill all detected regions at once.
- Choose **Звезда 6-кон.**, click its centre, then click a point on the outer radius. The tool creates two equilateral triangles rotated by 60 degrees in one group. Move or duplicate the group as one object; the two triangles remain individually editable if ungrouped.
- Dimension witness-leg handles are available at both the part-side and outer ends; each endpoint can be dragged independently. Diameter dimensions can place arrows outside the circle (pointing inward), with the diameter sign lowered separately.

## Precise dimension editing (1.5.24)

Select one or more dimensions. Use the **Поворот только цифры** slider for smooth label rotation, the number field for an exact 0.1° value, or the ±1°/±5°/±15° buttons. The reset button returns the label to 0° without changing the measured geometry.

To change the extension-leg length, adjust **Отступ размерной линии (длина ножек)** with its slider or ±0.1/±0.5 mm buttons. The signed number field selects which side of the measured geometry the dimension line occupies. **Длина ножек за размерной линией** controls the small continuation beyond the dimension line separately.

## Add text and diameter dimensions

Choose **Добавить текст** in the ribbon or annotation tools, or press `T` and click the drawing sheet. You can also double-click an empty place on the drawing while Select is active. The text editor accepts multiple lines and lets you set font, height, width factor, rotation, alignment, baseline, line/letter spacing, color, bold, italic, underline, overline, strike-through and a frame. Double-click an existing text object to edit it.

Diameter dimensions are displayed with the dedicated `⌀` sign. Older files that contain `Ø`, `ø` or a Cyrillic `Ш/ш` before a diameter value are normalized on display.

## Requirements

- Node.js 18 or newer for tests and scripts.
- No third-party npm dependencies are required.
- A modern browser for the Canvas demo.

## Install / verify

From this folder run:

```bash
npm test
```

## Open the demo

Run a local static server from the project root:

```bash
python -m http.server 8000
```

Open <http://localhost:8000/> for the main CAD editor. The simplified demo is at <http://localhost:8000/examples/demo.html>. In the main editor, use **Разделить объект** from the top ribbon or Edit panel to divide geometry. The **Вырез / разрез** panel has three independent modes for closed profiles: **Полный вырез** keeps two side walls and a bottom/base line; **Без нижней стенки** keeps both side walls but removes the base line, leaving an open contour; **Без стенок** removes only the selected outer boundary segment. Click a closed contour (rectangle, rounded rectangle, circle, ellipse or closed polyline) to create the selected notch, or click an open line/arc/polyline/spline/freehand curve to remove a gap equal to the chosen width. For batch editing, Shift-select multiple editable objects and click once: the click is projected to the nearest boundary/path point of each selected object and the same width/depth is applied to all compatible objects. Blocked or geometrically invalid objects are skipped. You can repeat cuts on previous notch walls/bases and remaining fragments; there is no fixed cut-count limit. Adjust width, depth and minimum web first. To add an internal hole or slot contour, choose its shape and click **Разместить внутренний контур**, then click the required centre on the drawing.

## Duplicate and move dimension numbers

Select one or more objects and click **Дублировать** (or press `Ctrl+D`). Move the cursor to preview the copy and click to place it; you can also drag to the required position. Press `Escape` to cancel. The new copy is a separate object or group and can be undone with `Ctrl+Z`.

To reposition a dimension value, select its dimension and drag directly on the number. Move it left/right or up/down relative to the dimension line; it can be placed closer to or farther from the line. The label does not jump when dragging starts, and the manually chosen position is kept.

## Divide geometry

Choose **Разделить объект**. For an open line/path, click once at any point along it; click exactly at the midpoint to create equal halves. For a closed profile, click one point on its boundary, then a second point on the same boundary. A straight chord joins the two picks and creates two separate closed parts. The first click is shown as a guide while you choose the second. The operation can be repeated on either new part.

## Suggested workflow for a 2D mechanical drawing

1. Draw the base contour with Line, Rectangle, or Polygon.
2. Use **Разделить объект** to split a line at any point or divide a closed profile into two parts.
3. Use **Вырез / разрез** for notches in closed profiles or width-defined gaps in open segments. Repeat on the same object to create nested or additional cuts.
4. Use the inner contour selector for a circular hole, rectangular pocket boundary, or obround slot.
5. Add centre lines and dimensions.
6. Use Trim to remove contour sections at intersections.
7. Use the partial Eraser for small local corrections. It starts on a single target object and never deletes a fully covered object.
8. Export the complete editable project with **Экспорт проекта** as `.kcad`; import creates a separate project copy. Undo/Redo is available during the session.

This is a 2D drafting toolkit. It does not create 3D solids or perform a general polygon-Boolean subtraction between arbitrary closed shapes.


### Редактирование стрелок и поворот числа размера

Выберите один размер. В свойствах размера доступны общий тип стрелок (треугольник, открытая V-стрелка, засечка, точка или без стрелок), отдельный тип первой и второй стрелки, а также размер стрелок. Поле «Поворот только цифры» меняет угол числовой надписи независимо от размерной линии; кнопка сбрасывает его до 0°.


## Навигация колёсиком — версия 1.5.12

Колёсико над листом снова управляет масштабом относительно курсора. Прокрутка нормализуется для обычной мыши, точного тачпада и старых событий браузера. Shift + колёсико двигает лист по горизонтали, Alt + колёсико — по вертикали; горизонтальный жест тачпада без вертикальной составляющей также перемещает лист. Обработчик работает только внутри области чертежа и не перехватывает прокрутку панелей и полей ввода.


В версии 1.5.12 обработчик колеса мыши закреплён непосредственно за областью чертежа в фазе захвата — SVG-элементы больше не могут перехватить событие до масштабирования. Колесо вверх приближает, вниз отдаляет; диапазон ручного масштаба — 10–3200%. Масштабирование остаётся привязанным к положению курсора.

## Управление рабочим полем — версия 1.5.18

- **Колёсико вверх/вниз над чертежом** — плавное приближение/отдаление относительно курсора, около 15% за обычный шаг. Внутри холста браузер не прокручивает страницу вместо зума.
- **Правая кнопка мыши: нажать, удерживать и двигать мышь** — основной способ перемещения рабочего поля. Отпустить правую кнопку — закончить панорамирование.
- Во время панорамирования объект не выделяется и не редактируется; контекстное меню браузера над чертежом отключено.
- Альтернативы: средняя кнопка (нажатое колесо) + перетаскивание или `Space` + перетаскивание левой кнопкой.
- Обычный левый щелчок остаётся для выбора и черчения. Левая кнопка перемещает лист только при удерживаемом `Space`.
- Вне чертежа колёсико не перехватывается CAD и работает с панелями интерфейса как обычно.
- Если в старой версии навигация не работала, это было связано с ошибкой запуска JavaScript в 1.5.14; в 1.5.16 она исправлена и проверена в Chromium реальными событиями мыши.


### Прямой проходной вырез
В панели «Вырез и отверстия» выбери «Без нижней стенки» (две ровные параллельные боковые стенки, но без поперечного торца на глухом конце) либо «Без стенок» (без добавления боковых линий). Задай ширину поля «Ширина выреза / разреза». На листе зажми левую кнопку мыши и протяни прямую линию в любом направлении: снизу вверх, сверху вниз, слева направо, справа налево или под произвольным углом. Если для отдельного профиля начало жеста оказалось внутри, а конец снаружи, направление для этого профиля автоматически разворачивается, чтобы паз оставался открытым со стороны начала. Все пересечённые видимые незаблокированные замкнутые контуры будут обработаны автоматически. Escape отменяет текущий жест.


## Повторные прямые проходы и сохранение открытых концов — версия 1.5.21

В панели «Вырез и отверстия» выберите вариант перед запуском инструмента «Прямой проходной вырез». Режим «Без нижней стенки» (по умолчанию) оставляет две точные параллельные боковые стенки и удаляет поперечный торец на глухом конце — поэтому малый круг получает открытый паз без нижней линии. Режим «Без стенок» удаляет только участки исходной окружности/границы, попавшие в проходную полосу, не добавляя боковые стенки и торец. Жест можно начинать с любой стороны и вести под любым углом. Для каждого контура направление автоматически нормализуется: если указатель начал внутри него и закончился снаружи, алгоритм разворачивает проход только для этого контура. Так сохраняется открытый вход с требуемой стороны.

**Повторные проходы по одному объекту не ограничены.** Если после первого прохода осталась открытая полилиния, созданная этим инструментом, программа временно замыкает её только для геометрического расчёта, повторно вычитает новую полосу и снова строит границы результата. Поэтому во втором и последующих проходах боковые стенки появляются заново: в режиме «Без нижней стенки» остаются две прямые параллельные стенки без поперечного торца; в режиме «Без стенок» новые стенки намеренно не создаются; в полном режиме сохраняется и торцевая линия. Временное замыкание не рисуется и не добавляется в чертёж. Каждое движение мышью — отдельный шаг `Ctrl+Z`.





### Исправление повторных вырезов — версия 1.5.21

При каждом повторном проходе программа временно замыкает старую открытую полилинию только для геометрического расчёта. Эта вспомогательная линия теперь гарантированно удаляется из результата, в том числе если новая полоса разделила её на несколько участков. Поэтому нижняя/торцевая стенка предыдущего выреза больше не появляется снова. Выбранный режим относится только к новому проходу; старые открытые концы сохраняются независимо от текущего режима.

### Перемещение отдельной стороны многоугольника (1.5.25)

1. Открой категорию **Редактирование** и включи **Переместить грань**.
2. Наведи указатель на сторону замкнутого многоугольника. Подсветка покажет, какая именно грань будет редактироваться.
3. Перетащи сторону мышью. Сторона останется параллельной самой себе, а две соседние вершины будут пересчитаны по соседним сторонам.
4. Для точного значения щёлкни сторону без перетаскивания, введи смещение со знаком в миллиметрах и нажми **Применить точное смещение**. Shift во время перетаскивания задаёт шаг 0,5 мм; поле точного ввода поддерживает шаг 0,1 мм.

Каждая операция отменяется через Ctrl+Z. Поддерживаются замкнутые многоугольники и обычные прямоугольники; скруглённые прямоугольники не поддерживаются этим режимом.


### Независимое изменение выносных ножек размера (1.5.26)

1. Выберите размер инструментом «Выбор».
2. На концах двух выносных линий появятся голубые ручки.
3. Потяните нужную ручку наружу или к размерной линии. Изменяется только эта ножка; вторая не двигается.
4. Для точной настройки используйте отдельные поля «Первая ножка» и «Вторая ножка» в свойствах размера.
5. Одно перетаскивание отменяется одной командой Ctrl+Z; Esc во время перетаскивания отменяет текущий жест.


### Типы штрихпунктирных линий

В свойствах выбранного объекта выберите «Штрихпунктирная тонкая — 5/3 мм (ГОСТ)» для компактной осевой линии. По ГОСТ 2.303-68 длину штриха тонкой штрихпунктирной линии выбирают в пределах 5–30 мм, а промежуток — 3–5 мм; в этой сборке по умолчанию выбрана нижняя граница этих интервалов.


## Compact GOST dash-dot lines (1.5.27)

For a thin centre/dash-dot line choose **Штрихпунктирна тонка — 5/3 мм (ГОСТ)**. The long dash is 5 mm and each gap is 3 mm; the tiny 0.1 mm dash is shown as a round point by the round line cap. The long-dash option uses 8 mm / 3 mm. These choices use the lower end of the ГОСТ 2.303-68 ranges for a compact drawing. Old built-in 12 mm / 24 mm dash patterns are automatically displayed using the new compact patterns, while custom dash values are preserved.


## Штриховка внутри области и шестиконечная звезда (1.5.28)

- Выберите **Штриховка области** и щёлкните внутри замкнутого контура или одной из ячеек, полученных пересечением линий. Штриховка будет построена только внутри этой области; внутренние отверстия останутся пустыми. Повторные щелчки позволяют заштриховать другие области.
- Для автоматической обработки всех найденных ячеек используйте **Найти замкнутые области из линий и заштриховать**.
- Для шестиконечной звезды выберите **Звезда 6-кон.**, щёлкните центр, затем точку на окружности желаемого радиуса. Создаются два равносторонних треугольника в одной группе.
- У выбранного размера можно тянуть голубые ручки на дальних концах ножек и зелёные ручки у детали. Каждая ручка регулирует только свой конец; противоположный конец остаётся неподвижным.
- Для диаметрального размера в поле размещения стрелок можно выбрать **Снаружи**: стрелки будут за кругом и направлены к его контуру.


### Размеры при растяжении

При растяжении размерной надписи за габаритные ручки исходный угол размерной линии сохраняется. Для наклонных размеров не происходит перекоса из-за независимого масштаба X/Y; горизонтальные и вертикальные размеры остаются на своих осях. Длина измерения меняется вдоль собственной оси, отступ и ножки — поперёк неё. Высота текста и размер стрелок не увеличиваются случайно.
