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
