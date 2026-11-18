## 1.5.30 — star outline, fixed-angle area hatch, region selection and dimension handles

- Reworked the six-pointed star as a single closed 12-vertex outer contour. The two crossing equilateral-triangle edges are no longer drawn as internal lines; the star is one selectable, movable and editable polyline.
- Added a separate **Выбор области** tool. It highlights the bounded region under the cursor, then **Заштриховать выбранную область** creates a hatch for that exact selected region. The existing direct click-to-hatch workflow remains available.
- Hatch direction now comes only from the fixed **Угол** field and is independent of the click location or direction. A true `0°` value is accepted instead of falling back to `45°`; all hatch creation paths use the same angle normalization.
- Generic square bounding-box resize grips are hidden when a dimension is selected. Circular dimension handles for label movement, individual witness-leg ends/gaps and rotation remain available.
- Added regression tests for the 12-point star outline, explicit region selection, selected-region hatching, fixed/zero-degree hatch-angle handling and dimension-handle presentation.

## 1.5.29 — исправлено растяжение размеров без наклона

- Исправлено сильное изменение угла размерной линии при растяжении за рамку выделения.
- Линейные размеры масштабируются в собственных осях: измеряемая длина изменяется вдоль размерной линии, отступ и выносные ножки — перпендикулярно ей.
- Горизонтальные и вертикальные размеры сохраняют точную ориентацию; наклонные размеры сохраняют исходный угол.
- Радиальные, диаметральные и угловые размеры сохраняют направления лучей и величину угла.
- Высота цифр и размер стрелок остаются постоянными при растяжении геометрии.
- Добавлены регрессионные тесты для всех типов размеров.

# Changelog

## 1.5.31 — сняты фиксированные ограничения длины выносных ножек размеров

- Убрано фиксированное ограничение 50 мм для обеих выносных ножек за размерной линией; значения хранятся и отображаются без такого потолка. Допускается нулевая длина, отрицательная длина не создаёт перевёрнутую ножку.
- Убраны максимумы 50 мм для передних зазоров у детали; они ограничиваются только расстоянием до размерной линии, чтобы начало ножки не пересекало её.
- Снято ограничение 200 мм для отступа размерной линии как основного расстояния, формирующего ножки. Новые и существующие размеры могут использовать большие значения.
- Ползунки автоматически расширяют диапазон по мере достижения края; расширение происходит после отпускания ползунка, чтобы не сдвигать бегунок во время движения. Числовой ввод и перетаскивание ручек не имеют фиксированного максимума.
- Добавлены тесты значений 640–750 мм, длинных перетаскиваний и сохранения независимости противоположной ножки.


## 1.5.28 — штриховка по области и шестиконечная звезда

- Инструмент «Штриховка области» работает щелчком внутри замкнутой области. Редактор находит наименьшую ограниченную грань под курсором, формирует штриховку внутри внешней границы и полностью исключает внутренние отверстия.
- Для поиска границ увеличено число точек аппроксимации окружностей/эллипсов и ужесточён геометрический допуск; штрихи не выходят за границу распознанной области. Исходные объекты не изменяются.
- Добавлен инструмент «Звезда 6-кон.»: центр и точка на описанной окружности задают размер и ориентацию. Результат состоит из двух равносторонних треугольников в общей группе — звезду можно перемещать и дублировать целиком, а при разгруппировке редактировать по частям.
- Передний (у детали) и дальний концы каждой из двух размерных ножек регулируются независимо. Движение рассчитывается относительно точки нажатия, поэтому ручка не скачет при захвате не по центру; можно укорачивать и удлинять выбранную ножку без изменения противоположной.
- Для диаметральных размеров доступно размещение «Снаружи»: стрелки находятся за окружностью и направлены вершинами внутрь. Знак `⌀` понижается относительно цифровой части без смещения самих цифр.
- Добавлены тесты попадания в область с отверстием, отсечения штриховки, интерфейса штриховки по щелчку, геометрии шестиконечной звезды, выноса стрелок диаметра и независимой регулировки ножек.

## 1.5.27 — короче штрихпунктирные линии по ГОСТ 2.303-68

- Для тонкой штрихпунктирной линии установлены компактные параметры по нижней границе ГОСТ: длинный штрих 5 мм, промежутки 3 мм; точка отображается коротким круглым штрихом 0,1 мм.
- Вариант с более длинным штрихом уменьшен до 8 мм; штрихпунктирная с двумя точками использует штрих 5 мм и промежутки 4 мм.
- Новые значения применяются к осевым линиям, центровым отметкам, пресетам типов линий и DXF-обмену.
- Старые встроенные значения 12/24 мм автоматически нормализуются при отображении к более компактному стандартному шаблону; пользовательские нестандартные шаблоны сохраняются.
- Обновлены подписи выбора типа линии с явным размером штриха и промежутка в миллиметрах. Добавлены регрессионные тесты.


## 1.5.24 — удобный поворот размерного числа и плавная регулировка ножек

- Добавлен ползунок независимого поворота цифры размера в диапазоне −360°…+360° с шагом 0,5°, сохранён точный числовой ввод.
- Добавлены быстрые шаги поворота ±1°, ±5° и ±15°, а также сброс до 0°. Поворот не влияет на размерную линию, стрелки и выносные линии.
- Для длины ножек (отступа размерной линии от измеряемой геометрии) добавлен ползунок с шагом 0,1 мм и быстрые кнопки ±0,1/±0,5 мм; знак числового значения сохраняет сторону расположения размера.
- Продолжение выносных ножек за размерную линию также регулируется отдельно с шагом 0,1 мм в диапазоне 0,1–10 мм.
- Изменение ползунком фиксируется одним действием Undo; все функции применяются к одному или нескольким выбранным размерам.
- Добавлены UI-контрактные тесты на ползунки, быстрые шаги, точность 0,1 мм и сохранение Undo.


## 1.5.23 — расширенные 2D-эскизы и контуры

- Подключены объектные привязки в главном редакторе: конечные точки, середины, центры окружностей/дуг/эллипсов, квадранты и пересечения. Для базовых кривых используются аналитические пересечения ядра; для свободных/сглаженных путей — полилинейное приближение.
- Интегрирован Trim по щелчку на удаляемом участке между соседними пересечениями: отрезки, окружности, дуги, прямоугольники, эллипсы и замкнутые полилинии. Результат атомарный и поддерживает Undo.
- Добавлена дуга по трём точкам: начало, точка на дуге и конец. Построение выбирает соответствующую малую или большую дугу, отвергает почти коллинеарные точки.
- Добавлен режим правильного многоугольника «По граням»: значение задаётся расстоянием между противоположными параллельными сторонами; режимы по вершинам и по апофеме сохранены.
- Добавлено распознавание замкнутых областей по набору пересекающихся отрезков/дуг/окружностей/контуров через граф кривых, с разделением граней в точках пересечения и поиском вложенных отверстий/островков.
- Добавлена автоштриховка распознанных регионов с обходом внутренних отверстий и экспортируемыми отрезками штриховки; добавлена even-odd заливка для сплошного узора.
- Существующие примитивы, массивы, одиночная штриховка и базовая геометрия не дублировались. Универсальные 3D-выдавливание и булево вычитание не добавлены: текущее приложение — 2D-редактор без 3D-ядра.
- Добавлены тесты геометрии, привязок, дуги по трём точкам, trim, многоугольника по размеру между гранями, областей с отверстиями, штриховки и интеграции UI.

## 1.5.21 — предыдущие открытые концы больше не закрываются при повторном проходе

- Исправлен баг, из-за которого при втором/третьем проходе виртуальная замыкающая линия предыдущего выреза попадала обратно в результат и становилась видимой нижней стенкой.
- При повторной Boolean-обработке программа теперь отдельно запоминает сегмент, которым временно замыкает открытую полилинию, и удаляет его из результата после вычисления. Если новая полоса пересекает этот сегмент, удаляются также все образовавшиеся части виртуальной линии.
- Старые открытые концы остаются открытыми независимо от режима следующего прохода. Выбранный режим управляет только стенками нового выреза: предыдущий «Без нижней стенки» не превращается в закрытый паз после следующей операции.
- Добавлены регрессионные тесты: второй проход в другом месте, третий глухой проход с двумя независимыми открытыми концами, а также повторная обработка в режиме «Без стенок».

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

## 1.5.31 — сняты фиксированные ограничения длины выносных ножек размеров

- Убрано фиксированное ограничение 50 мм для обеих выносных ножек за размерной линией; значения хранятся и отображаются без такого потолка. Допускается нулевая длина, отрицательная длина не создаёт перевёрнутую ножку.
- Убраны максимумы 50 мм для передних зазоров у детали; они ограничиваются только расстоянием до размерной линии, чтобы начало ножки не пересекало её.
- Снято ограничение 200 мм для отступа размерной линии как основного расстояния, формирующего ножки. Новые и существующие размеры могут использовать большие значения.
- Ползунки автоматически расширяют диапазон по мере достижения края; расширение происходит после отпускания ползунка, чтобы не сдвигать бегунок во время движения. Числовой ввод и перетаскивание ручек не имеют фиксированного максимума.
- Добавлены тесты значений 640–750 мм, длинных перетаскиваний и сохранения независимости противоположной ножки.


## 1.5.22 — полный экспорт и импорт редактируемого проекта (.kcad)

- Added a dedicated native `.kcad` project-file envelope with schema versioning. The file contains the complete editable document rather than a flattened drawing export.
- Preserves every geometry and annotation object record verbatim, including dimensions and their arrow/text settings, multiline text and frames, cut features, layer/visibility/locking/style fields, and embedded raster reference data URLs.
- Preserves sheet format, title-block template, title-cell overrides, main title fields, GOST/DSTU profile settings, assignment-dimension notes, ruler, viewport pan/zoom, grid settings, object/grid snaps, orthogonal mode and layer visibility.
- Import accepts the new `.kcad` format and legacy plain-document `.json` files. It restores the complete drawing and automatically saves it as a new, separate project-library entry with an “— импорт” suffix; the source project is never overwritten.
- Added full round-trip, compatibility, schema-version rejection, project-name parsing and main-editor UI-contract tests.

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

## 1.5.25 — независимое перемещение граней многоугольника

- Добавлен отдельный инструмент «Переместить грань»: пользователь наводит курсор на сторону замкнутого многоугольника и перетаскивает её; выбранная сторона перемещается строго параллельно самой себе.
- Две соседние вершины пересчитываются как пересечения смещённой стороны с продолжениями соседних граней. Остальные вершины и направления остальных сторон сохраняются.
- Добавлено точное числовое смещение со знаком (+/−), шаг ввода 0,1 мм и применение выбранной стороны отдельной кнопкой; при перетаскивании Shift фиксирует шаг 0,5 мм.
- Добавлено подсвечивание стороны под курсором и выделение выбранной стороны. После изменения грань остаётся выбранной для точного повторного смещения.
- Обычные прямоугольники редактируются как четыре грани и преобразуются в замкнутую полилинию при первом изменении; скруглённые прямоугольники защищены от неприменимого линейного изменения.
- Встроены ограничения против схлопывания граней, переворота площади и самопересечения. Каждое перетаскивание — одно действие Undo; отмена жеста через Escape или потерю фокуса возвращает исходную геометрию.
- Добавлен независимый модуль `src/polygon-edit.mjs` и тесты для четырёх граней прямоугольника, всех шести граней правильного шестиугольника, направления и величины смещения, дублирующей конечной точки и некорректных операций.

## 1.5.26 — независимое редактирование каждой выносной ножки размера

- Заменена общая длина продолжения обеих выносных линий на независимые значения `extensionBeyondStart` и `extensionBeyondEnd`; старое поле `extensionBeyond` сохранено как обратносуместимый источник значения по умолчанию для существующих чертежей.
- На концах выносных ножек выбранного размера отображаются отдельные перетаскиваемые ручки. Перетаскивание проецируется на ось только захваченной ножки, поэтому движение изменяет только её длину, а противоположная сторона остаётся неподвижной.
- Добавлены независимые ползунки, числовые поля и кнопки шага 0,1/0,5 мм для первой и второй ножки; диапазон увеличен до 50 мм.
- Поддерживаются линейные, горизонтальные, вертикальные и угловые размеры. Отмена жеста и Ctrl+Z работают как единая операция.
- Добавлены геометрические тесты направлений и проекций, совместимости со старыми проектами и UI-тесты выбора/перетаскивания каждой ножки.


## 1.5.29 — Dimension resize keeps its angle

- Fixed dimension annotations tilting sharply when stretched with selection-box resize handles.
- Linear dimensions now resize in their own local axes: measured length follows the resize along the dimension direction, while offset and witness-leg lengths follow the perpendicular direction.
- Horizontal and vertical dimensions remain horizontal and vertical; aligned dimensions retain their original angle.
- Radius, diameter and angular dimensions use orientation-preserving uniform geometry scaling.
- Dimension text height and arrow size remain unchanged during geometry stretching.
- Added regression tests for diagonal, horizontal, vertical, radius, diameter and angular dimensions.
