# 2D Cutouts / Вирізи

The core supports two distinct 2D drafting workflows:

1. **Edge notch (`cutPolygonNotch`)** — changes a closed `Polygon` boundary by inserting a rectangular open notch into one edge. The result is a single replacement polygon and is returned as a `SceneHistory` transaction.
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
