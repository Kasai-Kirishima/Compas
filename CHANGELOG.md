# Changelog

## 1.4.0 — 2026-11-16

- Added orientation-aware GOST-style dimension labels: horizontal, vertical, aligned and automatic modes.
- Dimension values now use decimal commas by default and trim redundant trailing zeroes.
- Removed opaque white text knockouts; dimension lines are split under labels to keep the drawing background transparent.
- Added partial erasing for dimension linework: remaining strokes become editable lines, and the number is erased separately when the brush crosses its text bounds. Whole-dimension deletion remains an explicit `eraseAnnotations: 'whole'` option.
- Added Trim support for polygon edges; untouched edges remain intact and the trimmed edge becomes editable line fragments.
- Added dimension rendering and polygon Trim examples plus regression tests.


## 1.3.0

- Исправлена численная устойчивость квадратичного решения для круглых торцов кисти.
- Улучшена дедупликация углов пересечения окружности с траекторией ластика.
- Оставшиеся части окружности, непрерывные через угловую границу 0/2π, объединяются в одну дугу.
- Заблокированные размеры корректно попадают в список `skippedLocked`.
- Добавлены 11 параметрических шаблонов: паз, болтовое коло, фланец, пластина с отверстиями, шестигранная головка, ступенчатый вал, втулка, шайба, подшипник, отверстие с цекованием, прямоугольный массив отверстий и центровые метки.
- Демо переработано: радиус кисти задаётся в экранных пикселях и пересчитывается при изменении размера Canvas; обработаны coalesced pointer events и конечная точка pointerup.
- Добавлены вставка шаблонов, удаление выбранного объекта, фильтр ластика по выбранному объекту и импорт JSON.
- Добавлены регрессионные тесты ластика и тесты каталога шаблонов.

## 1.2.0

- Добавлен частичный ластик свободным движением мыши.
- Добавлены частичные фрагменты отрезков, осевых, окружностей и дуг.
- Добавлены транзакции и интеграция с Undo/Redo.
- Добавлена интерактивная Canvas-демонстрация.
