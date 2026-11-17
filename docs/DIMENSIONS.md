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

- `arrowStyle`: common arrow style (`filled`, `open`, `tick`, `dot`, or `none`);
- `arrowStartStyle` and `arrowEndStyle`: optional per-end overrides; when omitted, the common style is used;
- `arrowSize`: arrow length in millimetres (0.8–12);
- `labelRotationDeg`: additional label-only rotation in degrees (-360 to +360).

The first and second arrowhead can therefore be styled differently or independently hidden. `labelRotationDeg` is applied to the displayed number only. It does not alter the measured geometry, dimension line, extension lines, or arrow positions. For aligned text, the extra angle is added to the automatically derived alignment angle; for horizontal text, it is added to zero. All these settings are saved with the dimension object.
