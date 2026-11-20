# Restoration notes — 1.5.58 archive repair

The supplied ZIP contained the full HTML/CSS interface and product documentation, but the application modules, tests, and template assets were absent. This restoration reconstructs a usable browser-based 2D drafting core from those remaining sources.

## Implemented and testable
- A3/A4/A2 page sizing and orientation switching, with additional paper formats preserved in the selector.
- Seven selectable frame presets; Lab 8 has a blue A3 landscape frame with an editable title block and the `Кушвид О.` / `Базиль Б.` defaults.
- SVG-based 2D geometry: line, one-ended arrow, circle, rectangle, rounded rectangle, ellipse, polygon, polyline, arc, freehand, center marks, construction line/ray, text, leader, simple dimensions, table and hatch for a selected closed object.
- Selection, multiple selection, move, delete, duplicate, rotation, mirror (including a custom axis), rectangular/polar arrays, alignment, basic object properties, grid, orthogonal mode and basic endpoint/center snapping.
- Remove a finite-width segment from an open line/polyline; split open paths at one picked point; split simple rectangles/polygons by a chord between two boundary picks.
- Undo/redo, autosave, local project library, `.kcad` JSON project save/load, SVG/PNG/JPEG/WebP export, basic DXF import/export, print/PDF via the browser.

## Deliberately limited / not equivalent to original claims
- The custom Lab 4 / Lab 5 frame reconstructions are approximations because their source SVG/PDF assets were not present in the ZIP. Lab 8 is reconstructed from its visible screenshot and prose changelog, not from source paths.
- Advanced topology operations such as inside-out/outside-in pass-cuts through nested contours, wall-mode cutouts, arbitrary Trim/Fillet/Offset, polygon-face editing, and automatic region detection are not restored. Closed-profile splitting is currently limited to simple rectangles/polygons with a straight chord. The UI reports the limitation instead of silently corrupting geometry.
- DXF import/export handles core entities only (LINE, CIRCLE, TEXT, LWPOLYLINE); DXF compatibility should be verified in the target CAD package.
- HPGL/PLT, CSV import, native KOMPAS CDW/DWG, parametric constraints and 3D modelling are not implemented.
- GOST/ESKD verification is a basic educational preflight and is not official standards compliance certification.
