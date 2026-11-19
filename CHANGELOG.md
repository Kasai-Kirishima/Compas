## 1.5.47
- Added **Стрелочка 1** dimension preset: endpoint 1 remains open and endpoint 2 has a filled arrowhead.
- Radius dimensions keep their natural single arrow at the measured arc.
- Existing independent start/end arrow controls continue to work and override the preset when explicitly set.

## 1.5.46
- Fixed paper-format switching: template presets now provide a recommended starting format instead of locking the document to that size.
- Enabled genuine A4, A3 and A2 dimensions in portrait and landscape after selecting any active template.
- New-document preview and creation now honour the format selected by the user instead of resetting to the preset default.
- Displayed actual paper width and height in the document bar and added dimensions to the paper-format selector labels.
- Resized Lab 8 archival side fields vertically to follow the full usable sheet height on A4/A3/A2.
- Kept the standard Form 1 title block at 185 × 55 mm for the generated GOST/ESKD variants and the Lab 8 reference frame.
- Added regression coverage for all seven templates across six A4/A3/A2 orientations and actual paper-size selection.

# Changelog

## 1.5.45
- Restored all seven distinct drawing-frame variants from the conversation history and prior exports to the visible template gallery, main selector, and new-document flow.
- Added the user's original Lab 5 A4 portrait frame from the KOMPAS mobile screenshot.
- Re-exposed the four generated Form 1 GOST/ESKD-style variants: Lab 5 and technical drawing, each in A3 landscape and A3 portrait.
- Kept the user's Lab 4 A3 portrait and Lab 8 A3 landscape templates available.
- Kept legacy template IDs hidden for backwards compatibility, so older `.kcad` files continue to use their saved format and frame snapshot.
- Added per-preset protected zones for title blocks, upper designation boxes and auxiliary designation fields.
- Added runtime tests covering all seven layouts, paper sizes, key title text, developer spelling and legacy renderers.
- Identified the early `CAD-A3-Technical-Template.svg` as geometrically identical to Lab 8 and excluded it as a duplicate option.

## 1.5.44
- Cleaned the user template gallery and printable template folder: only Lab 4 (A3 portrait) and Lab 8 (A3 landscape) remain as active user layouts.
- Assigned Lab 8 its own `lab8-reference-template` ID so older projects using the former `technical-a3-template` cannot silently inherit the new frame.
- Restored the former `technical-a3-template` renderer as a hidden legacy option for opening existing `.kcad` files.
- Set Lab 4 as the default new document; Lab 8 now selects the original landscape frame with “Корпус / Вариант 8 / ШЦМГУ”.
- Kept the author field exactly `Кушвид О.`.
- Removed duplicate/obsolete exported frame assets; the `templates/` folder contains only the two user templates and their previews.

## 1.5.43
- Fixed legacy `.kcad` loading: a document's saved page format now wins over the selected template preset, so an older A4 drawing is not silently converted to A3.
- Legacy title fields are initialized as blank before saved values are applied; empty fields no longer inherit values from the previously open document.
- Per-document SVG frame snapshots are included in subsequent saves/exports to prevent future template-library edits from changing that document's frame.
- The developer field and all bundled Lab 5 SVG/PDF/preview assets use exactly `Кушвид О.` (without an extra initial).
- Existing legacy `Кушвид О.А.` values are normalized to `Кушвид О.` when a project is opened or exported.
- Added regression checks for A4/A3 format preservation, blank title fields, stored frame snapshots and the exact author spelling.

## 1.5.42
- Fixed legacy project imports: a document's saved page format now wins over any template default.
- Restored blank title values from imported projects and preserved per-document frame snapshots.
- Changed the author spelling to exactly `Кушвид О.` and added regression checks.

## 1.5.40
- Added a visible template preset gallery and one-click Lab 4 selection.

## 1.5.39
- Reconnected the screenshot-matched Lab 4 A3 portrait layout as a standalone preset.

## 1.5.38
- Added XLINE, RAY, circle radius/diameter mode, OSNAP modes, line roles, extended Offset, line-line Fillet, batch center marks and settings persistence.
- Retained the previous CAD editor functions and older frame renderers.


## 1.5.47 — Single-arrow dimension preset

- Added **Стрелочка 1** dimension preset: endpoint 1 has no arrowhead, endpoint 2 keeps one filled arrowhead.
- Preset applies to linear, diameter and angular dimensions; radius dimensions keep their natural single arrow at the measured arc.
- Existing independent first/second arrow overrides remain available.
- The selected preset is stored on each dimension and is preserved when the project is saved and reopened.
