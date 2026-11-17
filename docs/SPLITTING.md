# Geometry splitting / Разделение геометрии

The main editor exposes **Разделить объект** in the top ribbon and in the Edit panel. The tool does not delete a gap: it divides one geometry object into separate editable objects.

## Open paths — one click

Click anywhere on a line, construction line, centre line, arc, open polyline, spline, or freehand path. The nearest point on the path is used. The previous relative 2% end margin has been removed, so a click at 50% creates two equal halves and a click close to an endpoint creates one short and one long fragment. Only an exact endpoint cannot produce two non-zero pieces.

```js
import { splitOpenPathAtPoint } from './src/cutouts.mjs';
const result = splitOpenPathAtPoint(
  [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  { x: 50, y: 0 }
);
// result.fragments contains [0..50] and [50..100].
```

## Closed profiles — two boundary points

Choose **Разделить объект**, click the first point on a closed contour, then the second point on the same contour. A preview chord appears between the picks. The operation creates two closed editable contours sharing that chord. The first click can be changed by switching tools; failed second-point attempts keep the first point so another second point can be chosen.

Supported closed shapes include rectangles, rounded rectangles, circles, ellipses, and closed polylines/splines/freehand contours. Curved objects are converted to sampled polylines for the result.

```js
import { splitClosedPolygonAtPoints } from './src/cutouts.mjs';
const result = splitClosedPolygonAtPoints(
  [{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],
  {x:0,y:25}, {x:100,y:25}
);
// The result is two 50 x 25 mm closed polygons.
```

A closed-profile split needs two distinct boundary points and a chord that stays inside the contour. This is required by the geometry, not an arbitrary percentage limit. A chord crossing the exterior of a concave profile is rejected rather than creating invalid geometry. Text, dimensions, leaders, and raster references are not profile geometry and remain unchanged. Every successful split is undoable.
