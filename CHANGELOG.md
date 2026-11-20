# 1.5.58-restored.7 — точная раскладка А3 и панорамирование листа

- Перерисован пользовательский синий образец ЛР №8 на листе А3 альбомный (420×297 мм): рамка 20 мм слева и 5 мм с остальных сторон, исходный индекс, заголовок, штамп, поля «Корпус», «Вариант 8», «ШЦМГУ», «Копировал», «Формат А3».
- Уточнена структура штампа 185×55 мм по форме 1: делители 65/135 мм проходят по высоте штампа; внутренние колонки таблицы изменений начинаются под верхней полосой 15 мм.
- Вся бумага, рамка, штамп, вспомогательные поля и чертёжные объекты находятся внутри `#sheetRoot`; перемещение камеры сдвигает лист по серому рабочему пространству, не меняя положение геометрии относительно бумаги.
- Панорамирование протестировано средней/правой кнопкой, режимом «Ладонь», Space+ЛКМ и плавной двухпальцевой прокруткой тачпада; колесо/пинч и кнопки «+»/«−» меняют масштаб вида, а не размер рамки.
- Повторно выполнены `npm test` и браузерный Chromium QA на 1366×768: черчение, перемещение листа, геометрическая неизменность при панорамировании, зум, форма 1, создание нового А3 и отсутствие JS-ошибок.
- Нечитаемые из-за низкого разрешения боковые подписи оставлены как приблизительная реконструкция; соответствие кастомных надписей правилам конкретного учебного заведения требует сверки.

# 1.5.58-restored.4 — исправление блокирующей ошибки запуска и управления холстом

- Исправлена критическая опечатка в `bind()`: использовалось несуществующее имя `updateSelectedByProps` вместо объявленной `updateSelectionByProps`. Ошибка прерывала инициализацию редактора до подключения событий холста, из-за чего черчение и навигация не работали.
- Ввод холста переведён на Pointer Events с захватом указателя и fallback на Mouse Events для старых браузеров.
- Добавлены общие проверяемые функции масштабирования и панорамирования; вертикальная прокрутка/пинч масштабируют вид, горизонтальная прокрутка тачпада перемещает лист.
- Кнопки «+»/«−» изменяют только `viewBox` просмотра, не меняя размеры листа и геометрию рамки.
- Добавлены регрессионные тесты на имя обработчика и математику viewport.
- Проверено в Chromium на 1440×1000 и 1366×768: запуск без JS-ошибок, черчение перетягиванием и кликами, основные фигуры, отмена/повтор, зум, панорамирование и создание листа с рамкой.

## 1.5.58 — навигация мышью и исправление построения
- Перенесена обработка указателя на всю рабочую область листа; перетаскивание с зажатой средней кнопкой (колесиком) панорамирует лист, указатель захватывается на время жеста.
- Прокрутка колесика приближает/отдаляет вид относительно курсора, без скачка центра; Shift+колесо и Alt+колесо сохраняют горизонтальный/вертикальный сдвиг.
- Добавлено построение двухточечных объектов как протягиванием ЛКМ, так и последовательными кликами; предварительный просмотр обновляется во время протягивания.
- Сохранены многошаговые инструменты (размеры, выноски, ломаные, сплайны), свободное рисование, выделение рамкой и перетаскивание выбранной геометрии.
- Добавлены контрактные тесты для навигации и жестов черчения.

## 1.5.58 — Lab 8 typography and prototype alignment
- Increased the vertical left-strip labels and small title-block captions for legibility.
- Increased the `1:1` scale value to 6 mm text height.
- Repositioned and resized the upper-left drawing designation to keep it inside its cell while preserving its near-full-width appearance.
- Rechecked the left archive strip, upper designation cell, title-block row grid, main title, variant, company label, and footer against the supplied Lab 8 reference.

## 1.5.56 — fixed inside-to-outside pass cut
- Added an application-style regression test that reconstructs a part perimeter from four separate line entities, detects a separate circular bore, and joins the cut walls to the remaining bore arc.
- A release exactly on the outer profile is now accepted and nudged slightly past the boundary along the same drag vector; releases that stop inside the material are still rejected with a clear prompt.
- Updated the panel and help text: no preselection is required; the gesture starts inside the hole/pocket and ends past or exactly on the external boundary.
- Retained support for rectangular pockets, circular holes, arbitrary-angle passes, and all three wall modes.


## 1.5.55 — исправлен проходной вырез изнутри

- Внутренний вырез теперь определяет замкнутую область, собранную как из одного объекта, так и из отдельных соединённых отрезков/дуг.
- При старте внутри отверстия проход соединяет его с внешней границей: обрезается внешний контур, удаляется участок внутренней дуги, а боковые стенки стыкуются с оставшейся дугой без лишней торцевой заглушки.
- Сохранены обычный режим выреза из материала наружу, режимы стенок и обработка ранее созданных открытых фрагментов.
- Добавлены геометрические и интеграционные тесты для круглых и прямоугольных отверстий, отдельных линий и диагонального прохода.

# CAD Geometry Core 1.5.53

- Added bidirectional 2D cutouts: edge notches and straight pass-cuts can now cut inward from an external profile or outward from an inner hole/pocket boundary.
- Added the **Изнутри наружу** direction option. For straight pass-cuts, select the inner closed contour first; only selected inner contours are modified to protect surrounding outer profiles.
- Added outward geometry handling for polygon, circular and sampled curved boundaries, with wall modes (all walls, no bottom wall, and no walls) preserved.
- Preserved the cut direction on repeated passes through previously opened contours and in saved object metadata.
- Added regression tests for outward notch, blind and through pass-cuts, reverse drag direction, repeated passes, and editor selection safety.


- Added the full-walls mode to the straight pass-cut tool and made it the default. Blind cuts retain both parallel side walls plus the transverse end wall.
- Added the transverse end wall to the live pass-cut preview.
- Kept no-bottom-wall and no-walls modes available.

## 1.5.51 — Larger Arrow 1 triangle

- Increased the standalone Arrow 1 filled triangle length by 35% at every line weight.
- Widened the triangle from an 18° to a 28° included angle, making its silhouette easier to see.
- Kept the proportional relationship with line weight and synchronized preview, on-sheet rendering and DXF SOLID geometry.
- Dimension-line arrowheads are unchanged; this adjustment applies to the standalone Arrow 1 tool.

## 1.5.50 — Arrow 1 scales with line weight

- The standalone one-ended Arrow 1 now scales its arrowhead length proportionally to the line weight.
- Preview, canvas rendering, SVG/PDF export, and DXF export use the same calculated arrowhead size.
- The base line weight and base arrow size are stored with the object, so changing the width in Object Properties scales the head predictably and saved projects retain the relationship.
- Legacy Arrow 1 objects preserve their current arrow size until their line weight is first edited. CSV export/import now preserves arrow scaling metadata.

## 1.5.49 — Segment-style arrow tool and clearer tool tabs

- Kept “Стрелка 1” as a separate two-point drawing tool next to “Отрезок”; it creates an editable line with an open first end and a filled arrowhead at the second end.
- The arrow tool shares segment snapping, Ortho, Shift angle lock, ruler alignment, selection, movement, and line editing behavior.
- Clarified category contents and explicit assignments: polygon-face editing and cutout controls are under Editing; line-role and layer controls are under Sheet.
- Added regression coverage for category headings and the single-arrow line workflow.

## 1.5.48 — Arrow Line tool and reorganized tool tabs

- Added a standalone “Стрелка 1” drawing tool next to Segment in the ribbon and Geometry tab.
- It uses the same two-point workflow as Segment: first point is open, second point has a filled arrowhead.
- Shift angle lock, Ortho, OSNAP, and ruler alignment are shared with the Segment tool.
- Arrow lines remain normal editable line objects; arrowhead is preserved in project/CSV/SVG and exported to DXF as a filled SOLID triangle.
- Reorganized category assignment: hatch is under Annotations; precision controls and snaps are grouped; sheet presets and layers are grouped under Sheet.

## 1.5.47
- Added **Стрелочка 1** dimension preset: endpoint 1 remains open and endpoint 2 has a filled arrowhead.
- Radius dimensions keep their natural single arrow at the measured arc.
- Existing independent start/end arrow controls continue to work and override the preset when explicitly set.

## 1.5.46
- Fixed paper-format switching: template presets now provide a recommended starting format instead of locking the document to that size.
- Enabled genuine A4, A3 and A2 dimensions in portrait and landscape after selecting any active template.
- New-document preview and creation now honour the format selected by the user instead of resetting to the preset default.
- Displayed actual paper width and height in the document bar and added dimensions to the paper-format selector labels.
- Resized Lab 8 archival side fields vertically to follow the full usable sheet height on A4/A3/A2.
- Kept the standard Form 1 title block at 185 × 55 mm for the generated GOST/ESKD variants and the Lab 8 reference frame.
- Added regression coverage for all seven templates across six A4/A3/A2 orientations and actual paper-size selection.

# Changelog

## 1.5.45
- Restored all seven distinct drawing-frame variants from the conversation history and prior exports to the visible template gallery, main selector, and new-document flow.
- Added the user's original Lab 5 A4 portrait frame from the KOMPAS mobile screenshot.
- Re-exposed the four generated Form 1 GOST/ESKD-style variants: Lab 5 and technical drawing, each in A3 landscape and A3 portrait.
- Kept the user's Lab 4 A3 portrait and Lab 8 A3 landscape templates available.
- Kept legacy template IDs hidden for backwards compatibility, so older `.kcad` files continue to use their saved format and frame snapshot.
- Added per-preset protected zones for title blocks, upper designation boxes and auxiliary designation fields.
- Added runtime tests covering all seven layouts, paper sizes, key title text, developer spelling and legacy renderers.
- Identified the early `CAD-A3-Technical-Template.svg` as geometrically identical to Lab 8 and excluded it as a duplicate option.

## 1.5.44
- Cleaned the user template gallery and printable template folder: only Lab 4 (A3 portrait) and Lab 8 (A3 landscape) remain as active user layouts.
- Assigned Lab 8 its own `lab8-reference-template` ID so older projects using the former `technical-a3-template` cannot silently inherit the new frame.
- Restored the former `technical-a3-template` renderer as a hidden legacy option for opening existing `.kcad` files.
- Set Lab 4 as the default new document; Lab 8 now selects the original landscape frame with “Корпус / Вариант 8 / ШЦМГУ”.
- Kept the author field exactly `Кушвид О.`.
- Removed duplicate/obsolete exported frame assets; the `templates/` folder contains only the two user templates and their previews.

## 1.5.43
- Fixed legacy `.kcad` loading: a document's saved page format now wins over the selected template preset, so an older A4 drawing is not silently converted to A3.
- Legacy title fields are initialized as blank before saved values are applied; empty fields no longer inherit values from the previously open document.
- Per-document SVG frame snapshots are included in subsequent saves/exports to prevent future template-library edits from changing that document's frame.
- The developer field and all bundled Lab 5 SVG/PDF/preview assets use exactly `Кушвид О.` (without an extra initial).
- Existing legacy `Кушвид О.А.` values are normalized to `Кушвид О.` when a project is opened or exported.
- Added regression checks for A4/A3 format preservation, blank title fields, stored frame snapshots and the exact author spelling.

## 1.5.42
- Fixed legacy project imports: a document's saved page format now wins over any template default.
- Restored blank title values from imported projects and preserved per-document frame snapshots.
- Changed the author spelling to exactly `Кушвид О.` and added regression checks.

## 1.5.40
- Added a visible template preset gallery and one-click Lab 4 selection.

## 1.5.39
- Reconnected the screenshot-matched Lab 4 A3 portrait layout as a standalone preset.

## 1.5.38
- Added XLINE, RAY, circle radius/diameter mode, OSNAP modes, line roles, extended Offset, line-line Fillet, batch center marks and settings persistence.
- Retained the previous CAD editor functions and older frame renderers.


## 1.5.47 — Single-arrow dimension preset

- Added **Стрелочка 1** dimension preset: endpoint 1 has no arrowhead, endpoint 2 keeps one filled arrowhead.
- Preset applies to linear, diameter and angular dimensions; radius dimensions keep their natural single arrow at the measured arc.
- Existing independent first/second arrow overrides remain available.
- The selected preset is stored on each dimension and is preserved when the project is saved and reopened.

## 1.5.54 — inside-out cut target detection

- Fixed the inside-to-outside straight pass workflow: preselection is now optional.
- The editor resolves the smallest closed contour containing the drag start, classifying nested loops as holes/pockets and expanding them outward.
- When the start lies inside a single external part profile, the operation becomes an inward notch with the drag direction reversed, creating a proper exit slot rather than enlarging the external outline.
- Explicitly selected contours take priority; previously cut open fragments retain their saved side.
- Added regression tests for nested holes, solid starts, explicit selection, and parent-profile protection.

## 1.5.57 — Lab 8 A3 landscape title block
- Increased the small lettering in the Lab 8 blue frame and enlarged the title, variant, document code, and footer labels.
- Reworked the revision/signature table: role labels now have a 13 mm dedicated column; the following 27 mm column contains names. This keeps `Т. контр.` and `Н. контр.` inside their cell.
- Added default author/reviewer entries `Кушвид О.` and `Базиль Б.` to the Lab 8 preset.
- Kept the frame size, A3 landscape paper size, blue border, and the other six presets unchanged.

## 1.5.58-restored.1 — source archive reconstruction
- Rebuilt the missing browser application core from the surviving HTML/CSS and project documentation.
- Added a local HTTP server and Windows launcher because browser ES modules do not load reliably from `file://` URLs.
- Restored base 2D drafting, selection/editing, seven sheet presets, local project storage, `.kcad`, SVG/PNG and basic DXF exchange.
- Added a focused automated test suite for syntax, geometry helpers, history, project serialization and paper/template catalog.
- Explicitly documented advanced operations that remain unavailable because the original implementation and original automated tests were absent from the supplied archive.

- Added tested open-path cut and split operations, simple rectangle/polygon chord splitting, moved-object snapping, circle diameter mode, custom-axis mirror and rotated polar copies. Fixed the classic-script compatibility bridge so it contains no ES-module-only syntax.
- Added static UI reference checks and HTTP server smoke tests.
