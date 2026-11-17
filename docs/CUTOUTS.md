# 2D Cutouts / Вирізи

The core supports two distinct 2D drafting workflows:

1. **Polygon edge notch (`cutPolygonNotch`)** — changes a closed `Polygon` boundary by inserting a rectangular open notch into one edge.
2. **Circular edge notch (`cutCircleNotchAtPoint`)** — cuts an inward notch into a `Circle` at the clicked point on its circumference. The remaining arc is tessellated into one smooth closed `Polygon` so the editor can continue to edit it as a polyline.
3. **Internal contour tools** — add separate rectangular, circular or obround closed contours.
2. **Internal contour (`createRectangularPocket`, `createCircularCutout`, `createObroundCutout`)** — adds a closed inner contour representing a rectangular pocket, circular hole, or obround slot in a 2D engineering drawing.

These tools edit 2D linework. They do not perform 3D solid Boolean subtraction and do not infer material removal in a filled CAD solid.

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

The operation refuses invalid edits: locked polygons, a notch wider than its selected edge, a depth that leaves the original contour, self-intersecting output, or an insufficient web/edge margin.

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
2. For an edge notch, set width/depth/minimum web, choose **Вырез по краю**, then click the edge of a closed rectangle or polygonal polyline, or click directly on a circle circumference to cut inward toward its centre.
3. For an internal contour, choose rectangle/circle/slot, press **Разместить внутренний контур**, then click its centre.
4. Use Undo if the result is not suitable.

The main editor keeps the selected object ID when an edge notch replaces its boundary, so selection and object styling are retained.

## Demo workflow

1. Choose **Вырез по краю**.
2. Set notch width, depth, and minimum edge web.
3. Click on an edge of a closed polygon.
4. Use Undo if the generated notch is not suitable.
5. To draw an internal hole or pocket contour, choose its shape and press **Добавить внутренний контур**.


## Interactive placement

The demo's internal-contour button now enters placement mode. The next click sets the centre of the hole/pocket/slot. Width, height, radius, length and angle are read from the controls; no fixed canvas coordinate is used. Press Escape to cancel placement.

## Radial-slot cover template

`createRadialSlotCover()` creates a 2D linework template for a circular cover with evenly spaced radial slots and rounded inner ends. Its defaults reflect the supplied sketch values (outer Ø84, pitch Ø46, slot-end Ø16, slot width 6, six slots, central hexagon 20 across flats). The output uses outer circular arcs, slot side lines, major end arcs, pitch circle and centre marks. Verify all values and slot count against the original assignment before treating it as an exact production drawing.
