# Инструмент частичного ластика

## UX-поток указателя

1. На `pointerdown` преобразуйте экранную точку в мировые координаты и начните `stroke`.
2. На `pointermove` добавляйте новые мировые точки только если расстояние до предыдущей точки больше небольшого экранного порога.
3. Пока указатель удерживается, рисуйте preview-след кисти; геометрию сцены до `pointerup` не меняйте.
4. На `pointerup` вызовите `eraseAlongPath(scene, stroke, radiusWorld)`.
5. Если транзакция успешна — передайте её в `SceneHistory.apply(tx)` и перерисуйте сцену.
6. На `pointercancel` отбросьте preview без изменения документа.

Не используйте CSS-пиксели напрямую как мировые координаты. Пересчитывайте радиус:

```js
const radiusWorld = eraserRadiusInWorld(radiusPx, pixelsPerWorldUnit);
```

## Пример интеграции

```js
import { eraseAlongPath, SceneHistory, eraserRadiusInWorld } from '../src/index.mjs';

const history = new SceneHistory(initialScene);
let pointerStroke = [];
let erasing = false;

canvas.addEventListener('pointerdown', event => {
  if (activeTool !== 'eraser') return;
  erasing = true;
  canvas.setPointerCapture(event.pointerId);
  pointerStroke = [screenToWorld(event)];
});

canvas.addEventListener('pointermove', event => {
  if (!erasing) return;
  pointerStroke.push(screenToWorld(event));
  renderEraserPreview(pointerStroke, radiusWorld);
});

canvas.addEventListener('pointerup', () => {
  if (!erasing) return;
  erasing = false;
  const tx = eraseAlongPath(history.scene, pointerStroke, radiusWorld);
  if (tx.ok) history.apply(tx);
  pointerStroke = [];
  redraw(history.scene);
});

canvas.addEventListener('pointercancel', () => {
  erasing = false;
  pointerStroke = [];
  redraw(history.scene);
});
```

## Почему объекты обрабатываются по-разному

- Линия является параметрическим отрезком. Удаляемые параметры можно вычислить точно как вход/выход из капсулы кисти.
- Окружность и дуга параметризуются углом. Границы кисти создают конечный набор граничных углов; интервалы между ними классифицируются по средней точке.
- Полигон после стирания перестаёт быть замкнутым полигоном. Поэтому при первом частичном стирании он разбивается на линии и далее редактируется как набор рёбер.
- Размер — составная аннотация (линии, стрелки и текст). В обычном режиме его графика разбирается на фрагменты: стирается только пересечённая часть линий, а число удаляется отдельно, только если кисть попала в текст. Для удаления всего размера нужно явно передать `eraseAnnotations: "whole"`. После частичного стирания ассоциативный размер раскладывается в независимую линейную графику и текстовую метку.

## Производительность

Перед точной геометрией используются AABB объектов и следа кисти. Если объект далеко от следа, его геометрия не анализируется. Для очень длинных следов можно упрощать точки через `simplifyEraserPath(path, tolerance)`, но выбирайте tolerance намного меньше радиуса ластика, чтобы не терять узкие проходы.


## Рекомендации для надёжного UI-ластика

- Храните геометрию в мировых единицах, а радиус кисти задавайте в CSS-пикселях. Пересчитывайте его при каждом жесте: `radiusWorld = eraserRadiusInWorld(radiusCssPx, cssPixelsPerWorldUnit)`.
- Получайте `event.getCoalescedEvents()` там, где браузер поддерживает этот API, чтобы не пропускать быстрые движения пера/мыши. Если список пуст, используйте сам `pointermove`.
- На `pointerdown` вызывайте `setPointerCapture(pointerId)`, на `pointerup` обязательно добавляйте финальную точку жеста, на `pointercancel` и `lostpointercapture` отменяйте предпросмотр без изменения сцены.
- Отрисовывайте круг кисти и след в том же мировом масштабе, что и геометрию; это помогает пользователю понимать фактическую область стирания.
- Используйте `filter` для режима «только выбранные объекты» и `locked` для защиты заблокированной геометрии.
- Результат применяйте одной транзакцией через `SceneHistory.apply(tx)`, чтобы весь жест отменялся одной командой Undo.
- При стирании окружности оставшиеся части на стыке параметров 0 и 2π объединяются в одну непрерывную дугу.
