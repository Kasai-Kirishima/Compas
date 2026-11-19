# Параметрические шаблоны

Все координаты задаются в мировых единицах (для машиностроительного чертежа — мм), углы — в радианах. Каждая функция возвращает массив редактируемых объектов сцены.

## Каталог

- `createCenterMark(center, size, options)` — две осевые линии крестом.
- `createSlot(center, overallLength, width, angle, options)` — продолговатый паз с полукруглыми торцами. Если длина равна ширине, создаёт окружность.
- `createBoltCircle(center, pitchRadius, count, holeRadius, options)` — болтовое коло, отверстия, центровые метки.
- `createFlange(options)` — фланец с наружным контуром, центральным отверстием и болтовым колом.
- `createPlate(options)` — прямоугольная пластина с фасками и набором отверстий.
- `createHexHead(center, acrossFlats, angle, options)` — правильный шестигранник по размеру под ключ.
- `createSteppedShaft(options)` — ступенчатый вал боковым контуром и осевой линией.
- `createBushing(center, outerRadius, boreRadius, options)` — втулка в торцевом виде.
- `createTemplate(id, overrides)` — универсальная функция по `TEMPLATE_CATALOG` (12 готових пресетів).

## Пример

```js
import { createTemplate } from '../src/index.mjs';
const objects = createTemplate('plate', {
  center: { x: 100, y: 50 }, width: 120, height: 80, chamfer: 5,
  holes: [
    { x: -40, y: -25, radius: 4 },
    { x: 40, y: -25, radius: 4 },
    { x: 40, y: 25, radius: 4 },
    { x: -40, y: 25, radius: 4 }
  ]
});
scene = [...scene, ...objects];
```

`holes[].x` и `holes[].y` — смещения относительно центра пластины до поворота. `angle` задаётся в радианах.

## Ограничения

Шаблоны создают двумерную исходную геометрию, а не полноценные параметрические CAD-feature-деревья. Для пластины координаты отверстий не проверяются на пересечение с фасками или выход за границы — перед производственным применением такую проверку следует добавить на уровне конкретной методики/детали. Шестигранная головка и втулка — условные геометрические заготовки без стандартных допусков и фасок.


## Radial-slot cover / Variant No. 6

`createRadialSlotCover()` returns 2D primitives for a circular cover with a circular rim interrupted by equally spaced radial slots, major-arc rounded slot ends, a pitch circle, centre marks, and a central regular hexagon. Defaults from the reference sketch are outer radius 42, pitch radius 23, slot width 6, end radius 8, six slots, and central hexagon 20 across flats. These are a parametric interpretation of the provided screenshot, not a certified reconstruction: verify any ambiguous count or dimension against the assigned drawing.



## Активные пользовательские рамки (1.5.44)

В графическом интерфейсе и при создании нового документа доступны ровно два шаблона:

- `lab4-reference-template` — лабораторная работа №4, А3 книжный (297 × 420 мм), вертикальный образец пользователя.
- `lab8-reference-template` — лабораторная работа №8, А3 альбомный (420 × 297 мм), синий образец пользователя с полями «Корпус», «Вариант 8» и «ШЦМГУ».

Остальные форматы/ID сохранены только для обратной совместимости со старыми `.kcad`-документами и скрыты из обычного выбора. Файлы SVG этих двух рамок лежат в `templates/`.
