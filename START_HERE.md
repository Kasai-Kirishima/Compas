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

Open <http://localhost:8000/> for the main CAD editor. The simplified demo is at <http://localhost:8000/examples/demo.html>. In the main editor, use **Разделить объект** from the top ribbon or Edit panel to divide geometry, and **Вырез / разрез** for width-defined material gaps/notches. Click a closed contour (rectangle, rounded rectangle, circle, ellipse or closed polyline) for an inward notch, or click an open line/arc/polyline/spline/freehand curve to remove a gap equal to the chosen width. You can cut again on the walls or bottom of an existing notch and on either remaining line fragment; there is no fixed number-of-cuts limit. Adjust width, depth and minimum web first. To add an internal hole or slot contour, choose its shape and click **Разместить внутренний контур**, then click the required centre on the drawing.

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
8. Export the scene to JSON. Undo/Redo is available during the session.

This is a 2D drafting toolkit. It does not create 3D solids or perform a general polygon-Boolean subtraction between arbitrary closed shapes.
