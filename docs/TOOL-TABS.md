# Tool panel reference

The left panel is separated into five main tabs:

- **Инструменты** — tool buttons grouped into Geometry, Dimensions, Annotations and Editing categories.
- **Документ** — object tree and drawing layers; selecting an item also opens its properties.
- **Свойства** — common style/lock controls, exact geometry values, dimensions and rotation for the selected object.
- **Референсы** — image reference list, preview, visibility, opacity, lock, fit/center, scale and delete.
- **Настройки** — general drawing defaults, ESKD/GOST settings, drawing precision, snaps/grid and sheet/template settings.

## Editing existing objects

Select an object on the page or in the document tree. The Properties tab exposes numeric fields for supported types: circle center/radius/diameter; line endpoints/length/angle; polyline/spline/curved-arrow vertices; rectangle position/width/height/corner radius; ellipse center/axes; arc center/radius/angles; dimension points/offset/text; text position/content/height/rotation; reference position/size/rotation. Apply the fields to update the existing object in place.

Selected line and curve vertices are shown as very small cyan points. Their pointer hit targets are larger but transparent so the visual control points do not obscure the drawing.

## Object rotation

The selected-object properties include a numeric angle, a slider and quick-angle buttons. A small amber circular handle above the selected bounding box can also be dragged to rotate the object around its center; hold Shift to snap to 15° increments. Rectangles become editable polygons when rotated to a non-axis-aligned angle. Circles are rotationally symmetric, so spinning a single circle does not visibly change its shape.

## Drafting tools

The working core includes selection, line, Arrow 1, curved arrow, circle, rectangle/rounded rectangle, ellipse, polygon/star, polyline, freehand, arc, spline, text, simple dimensions, leader, center marks, auxiliary/ray/construction lines, hatch for a selected closed contour, table, ruler and basic editing actions (move, duplicate, delete, rotate, mirror, scale, rectangular and polar arrays, align).

Some controls are retained for interface compatibility but remain limited: advanced contour cutouts (inside-out/outside-in and wall modes), arbitrary offset/fillet/chamfer/trim, polygon-face editing and splitting of curved/complex closed profiles. The restored Split tool handles open paths and simple polygon/rectangle chords; the Cutout tool removes a finite-width segment from open lines/polylines. Automatic multi-loop hatch, rich DXF entities, CSV/HPGL exchange and native CDW/DWG remain unavailable. See `RESTORATION-NOTES.md` for exact implementation boundaries.
