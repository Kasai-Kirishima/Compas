# Changelog

## 1.5.40
- Added a visible three-card template preset gallery in the drawing sidebar.
- The Lab 4 reference layout is now an explicit one-click option, not only an item in the dropdown.
- New-document template selection explicitly ensures all three custom A3 portrait presets exist.

## Version 1.5.39 — additional A3 reference template

- Reconnected the retained screenshot-matched laboratory sheet layout as a separate `lab4-reference-template` preset.
- Added it to both template selectors and the new-document preview/creation flow.
- The new preset is fixed to A3 portrait and receives reference defaults for Laboratory Work No. 4.
- Preserved the existing `lab5-template` and `technical-a3-template` choices without replacing either.
- Added an independent sheet-frame branch and title-block protection zone for the enlarged reference-style lower title block.
- Corrected the reference template footer to display the actual sheet format (A3 on this preset).

## Version 1.5.38 — drafting tool integration

- Added XLINE and RAY construction entities, sheet-clipped rendering and DXF XLINE/RAY import/export.
- Added radius/diameter circle input mode.
- Added per-mode OSNAP toggles for endpoint, midpoint, center, intersection, quadrant and tangent; added snap marker.
- Added line-role assignment and independent visibility controls for main, thin and center lines.
- Added selected-circle batch center marks.
- Extended Offset to arcs and polyline/spline point paths.
- Added tangent-arc fillet for two selected line segments; kept rectangle fillet/chamfer.
- Persisted the OSNAP and line-visibility settings in project snapshots.
- Added drafting-tool integration contract tests.
- Retained existing A3 portrait GOST templates and all previous editor features.

Known limitation: arbitrary circle-circle and arc-arc fillets are not implemented in this release; see README.md.
