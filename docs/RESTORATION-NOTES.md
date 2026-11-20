# Restoration notes — 1.5.58 archive repair

The supplied ZIP contained the full HTML/CSS interface and product documentation, but the application modules, tests, and template assets were absent. This restoration reconstructs a usable browser-based 2D drafting core from those remaining sources.

## Implemented and testable
- A3/A4/A2 page sizing and orientation switching, with additional paper formats preserved in the selector.
- Fourteen selectable frame presets; the Lab 8 A3 landscape reconstruction now uses black linework of the supplied `Корпус / Вариант 8 / ШЦМГУ` image, with editable title-block fields and Ukrainian captions. A separate fixed-orientation `lab8-a3-landscape-template` preset is available.
- SVG-based 2D geometry: line, one-ended arrow, circle, rectangle, rounded rectangle, ellipse, polygon, polyline, arc, freehand, center marks, construction line/ray, text, leader, simple dimensions (2.5 mm default text height), table and hatch for a selected closed object. Line, arrow and spline support point-to-drag live preview with endpoint markers.
- Selection, multiple selection, move, delete, duplicate, rotation, mirror (including a custom axis), rectangular/polar arrays, alignment, basic object properties, grid, orthogonal mode and basic endpoint/center snapping.
- Remove a finite-width segment from an open line/polyline; split open paths at one picked point; split simple rectangles/polygons by a chord between two boundary picks.
- Undo/redo, autosave, local project library, staged `.kcad`/`.json` import (adds to file list first, then explicit open), lossless project round-trip for supported entities, SVG/PNG/JPEG/WebP export, basic DXF import/export, print/PDF via the browser.

## A3 sample and standards scope
- The supplied sample is reconstructed on A3 landscape (420 × 297 mm), in black. All built-in title-block labels are Ukrainian. Its inner frame uses 20 mm left and 5 mm top/right/bottom margins; the bottom-right title block is 185 × 55 mm. The side fields and their tiny vertical captions are institution-specific; captions that are not legible in the low-resolution screenshot are approximated, not represented as a verbatim standard requirement.
- The title block uses the 185 × 55 mm footprint and Form 1 grid logic. In Ukraine, ДСТУ EN ISO 5457:2022 is listed as active for drawing-sheet formats; ДСТУ ГОСТ 2.104:2006 is listed as active from 1 March 2026 to 25 November 2027 with a restricted scope. The custom sample should therefore be treated as an educational/institutional reconstruction, not a certification of standards compliance.

## Import/export validation
- The user-provided Kompas Online file was imported as 32 editable objects, including 5 dimensions and text/template overrides. Export to the editor project format and parse/reopen preserves all 32 converted object records, their properties, title fields, dimension values and text. Imported dimension numeral height is compacted to 2.5 mm; the measurement geometry/value is not changed.
- Chromium browser QA confirms that importing adds a file card without replacing the current drawing; opening the card replaces the current drawing as a separate document.

## Deliberately limited / not equivalent to original claims
- The custom Lab 4 / Lab 5 frame reconstructions are approximations because their source SVG/PDF assets were not present in the ZIP. Lab 8 is reconstructed from its visible screenshot and prose changelog, not from source paths.
- Advanced topology operations such as inside-out/outside-in pass-cuts through nested contours, wall-mode cutouts, arbitrary Trim/Fillet/Offset, polygon-face editing, and automatic region detection are not restored. Closed-profile splitting is currently limited to simple rectangles/polygons with a straight chord. The UI reports the limitation instead of silently corrupting geometry.
- DXF import/export handles core entities only (LINE, CIRCLE, TEXT, LWPOLYLINE); DXF compatibility should be verified in the target CAD package.
- HPGL/PLT, CSV import, native KOMPAS CDW/DWG, parametric constraints and 3D modelling are not implemented.
- GOST/ESKD verification is a basic educational preflight and is not official standards compliance certification.
