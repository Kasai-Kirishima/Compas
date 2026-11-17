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
