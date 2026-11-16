# Toolset for a mechanical drawing / Набір інструментів для лабораторної

The browser demo exposes the following tool groups:

## Build geometry
- **Line** — two-point straight segment.
- **Centre line** — two-point dash-dot axis.
- **Circle** — centre plus radius point.
- **Arc** — centre, start point, end point (counter-clockwise sweep).
- **Rectangle** — two opposite corners.
- **Regular polygon** — centre plus circumradius; choose 3–24 vertices.

## Make cutouts
- **Edge notch** — select a closed polygon edge and click on it. Set width, depth, and minimum remaining web. It changes the actual polygon boundary.
- **Rectangular pocket contour** — adds a closed inner rectangular contour.
- **Circular hole contour** — adds a circle for a hole.
- **Obround slot contour** — enters placement mode; click the desired centre. Width, length and angle come from the controls.

For the supplied circular-cover sketch, use the **Кришка — варіант №6** preset: it generates six radial slots with rounded inner ends, a Ø46 pitch circle and a central hexagon. Its default dimensions (outer Ø84, slot-end Ø16, slot width 6, hexagon 20) are an interpretation of the screenshot and must be checked against the original assignment. For other work, start with a rectangle or polygon as the plate outline, use an edge notch if the recess opens to the outer edge, and use an inner circle/slot if the feature is a through-hole or enclosed slot.

## Dimensions
- **Linear dimension** — pick two endpoints. The selected text height is applied from the permitted drawing-height list.
- **Diameter dimension** — click close to a circle.
- Vertical text is placed to the left by default, with a calculated gap in the dimension line. No opaque white background is painted beneath the label.

## Correct / revise geometry
- **Trim** — remove the selected part between adjacent intersections.
- **Partial eraser** — starts on the topmost editable entity directly under the cursor and removes only the brush-covered segment. A stale selection does not change the target. It does not remove an entire object; use Delete for that.
- **Undo/Redo** — reverse recent scene edits.
- **Parametric templates** — insert common parts such as flange, plate with holes, stepped shaft, bushing, washer, bearing, bolt circle, and hole array.

## Suggested sequence

1. Load **Загрузить пример детали с вырезом** to inspect a sample.
2. Reset or start a new scene and draw the outer profile.
3. Add the notch or inner contour.
4. Add hole centre marks and axes.
5. Add horizontal/vertical dimensions and a diameter dimension.
6. Use Trim for intersections and partial eraser for local corrections.
7. Export JSON to save the working scene.

The included sample is illustrative. Enter the exact dimensions from the assignment sheet; do not treat sample measurements as actual assignment values.
