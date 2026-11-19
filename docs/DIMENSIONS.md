# Dimension rendering

Linear and diameter dimensions keep the measured geometry, text orientation, and text placement as separate properties.

Dimension labels are rendered without an opaque white background. In the main editor, the oriented text box is estimated on every render and shifted away from its own dimension line when the two would overlap; the clearance includes a margin based on text height and stroke width. Extension lines remain connected to the measured endpoints so it is clear which geometry the dimension refers to. Redundant connector shelves beside diameter, radius and linear labels are not drawn.

Supported text orientation values:

- `auto` — horizontal for predominantly horizontal dimensions and vertical for predominantly vertical dimensions;
- `horizontal` — always horizontal;
- `vertical` — always vertical;
- `aligned` — parallel to the measured line but kept readable.

Example:

```js
import { LinearDimension, drawPrimitive } from './src/index.mjs';
const dim = new LinearDimension({x: 20, y: 10}, {x: 20, y: 90}, -14, {
  textHeight: 7,
  textOrientation: 'auto',
  showValue: true
});
drawPrimitive(ctx, dim); // ctx should already use the drawing's world transform
```

Text heights are validated against the configured GOST lettering series. Dimension values use a decimal comma by default and trim redundant trailing zeroes.


## Editing arrowheads and rotating only the label

The main editor stores dimension display settings on each dimension object:

- `arrowStyle`: common arrow style (`filled`, `single`, `open`, `tick`, `dot`, or `none`); `single` leaves endpoint 1 empty and draws one filled arrowhead at endpoint 2;
- `arrowStartStyle` and `arrowEndStyle`: optional per-end overrides; when omitted, the common style is used;
- `arrowSize`: arrow length in millimetres (0.8–12);
- `labelRotationDeg`: additional label-only rotation in degrees (-360 to +360).

The first and second arrowhead can therefore be styled differently or independently hidden. The quick `single` preset (shown as **Стрелочка 1**) leaves the first end blank and keeps one filled arrowhead at the second end; radius dimensions retain their natural single arrow at the measured arc. `labelRotationDeg` is applied to the displayed number only. It does not alter the measured geometry, dimension line, extension lines, or arrow positions. For aligned text, the extra angle is added to the automatically derived alignment angle; for horizontal text, it is added to zero. All these settings are saved with the dimension object.


## Fine dimension annotation controls (1.5.24)

The main editor exposes a range slider and exact numeric entry for independent label rotation (`labelRotationDeg`), plus quick relative steps of ±1°, ±5° and ±15°. Rotation affects only the label glyph group.

The extension-line continuation beyond the dimension line (`extensionBeyond`) is adjustable from 0.1 to 10 mm in 0.1 mm increments using a slider, numeric input, or ±0.1/±0.5 mm controls. The same extension is used for both witness/extension legs. One slider drag is recorded as a single undo action.


## Convenient label rotation and extension-line adjustment (1.5.24)

The main editor includes a live slider for independent dimension-label rotation (−360° to +360°, 0.5° steps), exact numeric entry, quick ±1°/±5°/±15° controls and reset to 0°. The displayed number rotates without moving the dimension geometry or arrowheads.

The dimension-line offset (which controls the length of the extension legs from the measured geometry) is adjustable with 0.1 mm precision. A slider and ±0.1/±0.5 mm buttons preserve the existing side of the dimension line; the signed numeric field can also switch sides. The extra extension beyond the dimension line has its own 0.1 mm slider and numeric input (0.1–10 mm). A complete slider drag is one Undo step.
