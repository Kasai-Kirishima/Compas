# Start here

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

Open <http://localhost:8000/examples/demo.html>. Use **Загрузить пример детали с вырезом** for the generic sample or **Загрузить крышку — вариант №6** for the supplied circular-cover sketch. Internal contours are placed by clicking the desired centre on the canvas.

## Suggested workflow for a 2D mechanical drawing

1. Draw the base contour with Line, Rectangle, or Polygon.
2. Use **Вырез по краю** for a rectangular notch open to a selected edge.
3. Use the inner contour selector for a circular hole, rectangular pocket boundary, or obround slot.
4. Add centre lines and dimensions.
5. Use Trim to remove contour sections at intersections.
6. Use the partial Eraser for small local corrections. It starts on a single target object and never deletes a fully covered object.
7. Export the scene to JSON. Undo/Redo is available during the session.

This is a 2D drafting toolkit. It does not create 3D solids or perform a general polygon-Boolean subtraction between arbitrary closed shapes.
