# CAD Geometry Core 1.5.47

2D mechanical CAD editor for technical drawings in millimetres. The template gallery now exposes the distinct drawing-frame layouts supplied in the conversation or generated for this project.

## Seven available drawing-frame variants

### User reference layouts

- **Лабораторная работа №4** — A3 portrait (297 × 420 mm), based on the supplied vertical sheet. Developer field: **Кушвид О.**
- **Лабораторная работа №8** — A3 landscape (420 × 297 mm), based on the supplied blue technical sheet with the title block **«Корпус / Вариант 8 / ШЦМГУ»**.
- **Лабораторная работа №5** — A4 portrait (210 × 297 mm), reconstructed from the supplied mobile KOMPAS screenshot.

### Generated GOST / ESKD-style variants

- **Лабораторная работа №5 — Form 1** — A3 landscape.
- **Technical drawing — Form 1** — A3 landscape.
- **Лабораторная работа №5 — Form 1** — A3 portrait.
- **Technical drawing — Form 1** — A3 portrait.

The four generated layouts are separate because portrait and landscape layouts have different title-block placement and auxiliary designation fields. They are editable educational reconstructions, not certified official forms. The early file `CAD-A3-Technical-Template.svg` is geometrically the same blue layout as Lab 8 and is not duplicated as an eighth option.

All seven variants appear in the sidebar gallery, the title-block selector, and the new-document dialog. Supported standard sheet sizes include A4 210×297 mm, A3 297×420 mm, and A2 420×594 mm; landscape orientation swaps the sides. Choosing a preset sets its recommended starting size and orientation, but does not lock the paper format. The paper-size selector can freely switch between A4, A3 and A2 in portrait or landscape; the saved project, SVG export and print/PDF output use the selected physical dimensions. The developer value for the user's custom Lab 4 and Lab 5 samples is **Кушвид О.**.

## Compatibility with older drawings

Legacy template IDs remain in the renderer so older `.kcad` documents can still be opened. Existing project files retain their saved page format, title fields, and frozen frame snapshot. Hidden legacy options are not offered for new drawings; they are retained solely for old-document compatibility.

## Main drafting tools

- Line, ray, infinite construction line, circle by radius/diameter, arc, rectangle, polyline, spline.
- OSNAP: endpoint, midpoint, center, intersection, quadrant and tangent; Ortho (F8).
- Offset, Trim, Mirror, supported Fillet operations, hatch with shared angle/spacing.
- Main/thin/center line roles and weights; dimensions, center marks and editable title-block text.
- SVG, DXF, PDF/print and image export.

## Known limitations

- Fillet for arbitrary circle/arc pairings is not fully implemented; supported line-line and rectangle fillets remain available.
- Spline offset is approximated from stored points and may be less smooth than the original curve.
- Check the target CAD application's compatibility when importing exported DXF.
- GOST/ESKD-style layouts use standard-form geometry as a drafting aid; verify typography and institutional fields before formal submission.

## Run

Unzip the package and open `index.html` in a modern browser. For the test suite, use Node.js 18+ and run:

```bash
npm test
```

No external npm dependencies are required to run the editor.
