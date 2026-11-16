# Быстрый старт — CAD Geometry Core 1.4.0

## 1. Нужно
- Node.js 18 или новее — только для запуска тестов.
- Современный браузер — для интерактивной демонстрации.
- Внешние npm-библиотеки не требуются.

## 2. Проверить проект
В корневой папке проекта выполните:

```bash
npm test
```

## 3. Запустить демонстрацию
Из корневой папки:

```bash
python -m http.server 8000
```

Откройте в браузере:

```text
http://localhost:8000/examples/demo.html
```

В демо показаны частичный ластик, Trim/вырезка, многоугольники и размеры с автоматической ориентацией текста.

## 4. Где искать функции
- `src/cad-geometry-trim.mjs` — геометрия, размеры, пересечения, Trim.
- `src/eraser.mjs` — частичное стирание линий, окружностей, дуг, полигонов и графики размеров.
- `src/templates.mjs` — готовые шаблоны машиностроительных элементов.
- `src/history.mjs` — Undo/Redo.
- `docs/DIMENSIONS.md` — настройка размерных надписей.
- `docs/ERASER.md` — подключение ластика.
- `docs/TEMPLATES.md` — шаблоны.

## 5. Пример создания размеров

```js
import { LinearDimension, DiameterDimension } from './src/index.mjs';

const horizontal = new LinearDimension({x:0,y:0}, {x:60,y:0}, 8, {
  textHeight: 5,
  textOrientation: 'auto'
});
const vertical = new LinearDimension({x:0,y:0}, {x:0,y:40}, 8, {
  textHeight: 5,
  textOrientation: 'auto'
});
const diameter = new DiameterDimension({x:50,y:50}, 20, {
  angle: Math.PI / 4,
  textHeight: 5
});
```

Горизонтальный размер получает горизонтальную надпись над линией, вертикальный — вертикальную надпись слева. Белая подложка не рисуется: размерная линия имеет разрыв под числом.

## 6. Пример Trim многоугольника

```js
import { Polygon, Line, trimAtPoint, applyEditTransaction } from './src/index.mjs';

const plate = new Polygon([
  {x:0,y:0}, {x:100,y:0}, {x:100,y:60}, {x:0,y:60}
]);
const cutterA = new Line({x:30,y:-10}, {x:30,y:10});
const cutterB = new Line({x:70,y:-10}, {x:70,y:10});
let scene = [plate, cutterA, cutterB];
const tx = trimAtPoint(plate, {x:50,y:0}, scene, {hitTolerance:2});
if (tx.ok) scene = applyEditTransaction(scene, tx);
```

Trim разрезает выбранное ребро между соседними пересечениями; остальные рёбра сохраняются.
