# 2D Cutouts / Вирізи

The core supports four related 2D drafting workflows:

1. **Polygon edge notch (`cutPolygonNotch`)** — changes a closed `Polygon` boundary by inserting an inward open notch; the click helper can span multiple consecutive edges when needed.
2. **Circular edge notch (`cutCircleNotchAtPoint`)** — cuts an inward notch into a `Circle` at the clicked point on its circumference. The remaining arc is tessellated into one smooth closed `Polygon` so the editor can continue to edit it as a polyline.
3. **Open-path gap (`cutOpenPathGapAtPoint`)** — removes a specified length from an open line/path and returns the remaining editable fragment(s).
4. **Internal contour tools** — add separate rectangular, circular or obround closed contours.

These tools edit 2D linework. They do not perform 3D solid Boolean subtraction and do not infer material removal in a filled CAD solid.

## Three edge-cutout modes in the main editor

The main editor exposes three separate tools:

- **Full cutout (`cutout`)** — keeps the two side walls and the straight bottom/base line, so the edited 2D profile remains closed.
- **No bottom wall (`cutoutNoBottom`)** — keeps both side walls but removes the bottom/base connecting line. The resulting geometry is one editable open polyline whose endpoints are the two inner ends of the side walls. This is available for polygonal profiles and circles (circles are smoothly tessellated first).
- **No walls (`cutoutNoWalls`)** — removes only the selected section of the outer boundary; it adds neither side walls nor a bottom line.

For all three modes, open objects such as line segments, arcs and open paths receive a width-defined gap. The depth field applies only to closed profiles.

### Batch editing multiple objects

Shift-select two or more editable objects, choose one of the three modes, and click once. The clicked world-space point is projected onto the nearest boundary/path point of each selected object; the same width and depth are then applied to every compatible selection. For example, one click on the near side of a selected group of plates makes a corresponding notch in each plate at its nearest side. Objects that are locked, too small, or geometrically invalid are skipped; successful objects are committed as one undoable operation. The status line reports how many objects were changed and how many were skipped.

The geometry API for open-bottom notches is `cutPolygonNotchWithoutBottomAtPoint()` and `cutCircleNotchWithoutBottomAtPoint()`. Both return `{ ok, operation: 'cutout-open-base', path, metadata }`; `path` is an open path, not a closed polygon.

## Edge notch

```js
import { Polygon, cutPolygonNotchAtPoint, SceneHistory } from './src/index.mjs';

const plate = new Polygon([
  { x: 0, y: 0 }, { x: 140, y: 0 },
  { x: 140, y: 80 }, { x: 0, y: 80 }
]);
const scene = new SceneHistory([plate]);

// Click close to the lower edge at x=70. Cut a 24 mm wide, 12 mm deep notch.
const tx = cutPolygonNotchAtPoint(plate, { x: 70, y: 0 }, 24, 12, {
  hitTolerance: 3,
  minWeb: 4
});
if (!tx.ok) throw new Error(tx.reason);
scene.apply(tx);
```

`cutPolygonNotch(polygon, edgeIndex, width, depth, options)` lets the caller choose an exact edge and optional `centerOffset`. `cutPolygonNotchAtPoint` selects the nearest edge and centres the notch near the click.

The operation refuses invalid edits: locked polygons, a depth that leaves the original contour, self-intersecting output, or an insufficient web/edge margin. If the requested mouth is wider than one short polygon edge (as on a sampled ellipse or rounded corner), the click-based helper measures the width along the whole boundary and can span several adjacent edges.

## Circular edge notch

```js
import { Circle, cutCircleNotchAtPoint } from './src/index.mjs';

const outer = new Circle({ x: 0, y: 0 }, 50);
const tx = cutCircleNotchAtPoint(outer, { x: 50, y: 0 }, 18, 10, {
  hitTolerance: 3,
  minWeb: 2
});
if (!tx.ok) throw new Error(tx.reason);
// tx.add[0] is one closed Polygon with an inward-facing notch.
```

The width is the straight distance between the notch mouth points. The notch sides follow radial directions; the depth is measured inward from the circumference toward the circle centre. A click must land close to the circumference. Widths greater than or equal to the diameter and depths reaching the centre are rejected. The remaining outer arc is sampled at a fine angular step and stored as a closed polygonal contour.

## Repeated and nested notches

A successful notch remains a normal closed editable polyline. Select it or click one of its edges again to add another notch. Separately placed inner circles, rectangular pockets, and slots are also normal geometric contours and can be selected for a further edge cut. This supports a cut in the bottom or side wall of an existing notch, as well as many separate cuts on the same contour; there is no fixed cut-count quota. Ellipses and rounded rectangles are sampled into closed outlines before editing, and the new notch may span multiple short outline edges.

The editor validates the resulting profile after every operation. A cut that would produce a self-intersection, leave the material outline, or violate the minimum-web value is refused instead of damaging the contour. This is repeated 2D linework editing, not a general polygon-Boolean engine.

## Open-path / segment gap

```js
import { cutOpenPathGapAtPoint } from './src/cutouts.mjs';

const gap = cutOpenPathGapAtPoint(
  [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  { x: 50, y: 0 },
  18,
  { hitTolerance: 3 }
);
if (!gap.ok) throw new Error(gap.reason);
// gap.fragments contains the two remaining line segments.
```

The main editor exposes this through the same **Вырез / разрез** tool. Click an open line, arc, construction/centre line, breakline, spline, freehand curve, or open polyline: the width field determines the removed gap length. Depth is used only for closed-profile notches. Either remaining fragment can be cut again, so repeated gaps are supported.

## Inner contour tools

```js
import {
  createRectangularPocket,
  createCircularCutout,
  createObroundCutout
} from './src/index.mjs';

const rectangle = createRectangularPocket({ x: 40, y: 30 }, 32, 18, 0);
const hole = createCircularCutout({ x: 40, y: 30 }, 5);
const slot = createObroundCutout({ x: 40, y: 30 }, 48, 12, Math.PI / 4);
```

For a standards-oriented drawing, keep inner hole contours as separate closed entities and add centre marks / dimensions as separate annotation objects. The drawing renderer does not fill the contour white; the hole is represented by its visible boundary.

## Main editor workflow

1. Open the **Редактирование → Вырез и отверстия** section.
2. For an edge notch, set width/depth/minimum web, choose **Вырез / разрез**, then click a closed profile (rectangle, rounded rectangle, circle, ellipse, closed polyline, closed spline, or closed freehand contour) to cut inward. You can also click an open line, arc, construction/centre line, or open polyline to remove a gap of the chosen width.
3. For an internal contour, choose rectangle/circle/slot, press **Разместить внутренний контур**, then click its centre.
4. Use Undo if the result is not suitable.

The main editor keeps the selected object ID, style and layer when a closed boundary is cut. Open-path cuts preserve the original ID on one remaining fragment and create a second editable object when the gap splits the path in two.

## Object splitting is a separate operation

For dividing an object without removing a gap, use **Разделить объект** rather than **Вырез / разрез**. See [SPLITTING.md](./SPLITTING.md): one click divides open geometry anywhere along the path; two boundary points divide a closed profile into two separate closed parts.

## Demo workflow

1. Choose **Вырез / разрез**.
2. Set notch width, depth, and minimum edge web.
3. Click on an edge of a closed profile or on an open segment to create a width-defined gap.
4. Use Undo if the generated notch is not suitable.
5. To draw an internal hole or pocket contour, choose its shape and press **Добавить внутренний контур**.


## Interactive placement

The demo's internal-contour button now enters placement mode. The next click sets the centre of the hole/pocket/slot. Width, height, radius, length and angle are read from the controls; no fixed canvas coordinate is used. Press Escape to cancel placement.

## Radial-slot cover template

`createRadialSlotCover()` creates a 2D linework template for a circular cover with evenly spaced radial slots and rounded inner ends. Its defaults reflect the supplied sketch values (outer Ø84, pitch Ø46, slot-end Ø16, slot width 6, six slots, central hexagon 20 across flats). The output uses outer circular arcs, slot side lines, major end arcs, pitch circle and centre marks. Verify all values and slot count against the original assignment before treating it as an exact production drawing.

## Straight pass-cut across multiple profiles

Use **Прямой проходной вырез** for a long, straight slot that crosses several separate circles or closed profiles in one drag. Set the slot width in **Ширина выреза / разреза**, choose the tool, press the left mouse button and drag in a straight line along the desired path at any angle. It works from the top, bottom, left, right, or diagonally. For each intersected profile independently, if the drag starts inside that profile and ends outside it, the engine reverses the local direction automatically; the open entry remains on the side where the drag began. The exact pointer vector defines the pass axis; a live angle label and direction arrow are shown in the preview. The exact drag segment is swept into a rectangle of constant width; every visible, unlocked closed object on the geometry layer that intersects this corridor is processed automatically. No separate multi-selection is required. Lock or hide profiles that must be protected.

The straight pass tool offers two modes:

- **No bottom wall (`noBottom`, default)** — keeps both exact, parallel side walls and removes the transverse end cap when the drag stops inside a profile. The blind result becomes an open editable polyline with two free wall ends. A completely traversed profile still becomes two separate closed pieces with straight walls.
- **No walls (`noWalls`)** — removes only the original boundary spans covered by the swept strip. It adds neither side walls nor an end cap. A blind entry leaves one open boundary arc; a full through-cut leaves two open arcs.

The two modes apply to every visible unlocked closed profile intersected by the same drag. Curved outer arcs are sampled into editable polylines, while retained side walls in no-bottom mode use exact line coordinates parallel to the drag axis. The operation is a 2D profile edit, not a 3D milling simulation.

The public geometry helper is `cutClosedContourByStraightPass(vertices, start, end, width)`. It returns closed polygon fragments and, for open-wall modes, open editable paths and by default rejects paths that start inside the profile (to avoid creating an unintended internal hole); the main editor opts into safe direction reversal when the drag starts inside and ends outside. It still rejects paths with both endpoints inside, paths that miss the profile, zero-length paths, and contours that cannot be safely stitched into simple loops. Each successful object is replaced in one undoable scene action.
