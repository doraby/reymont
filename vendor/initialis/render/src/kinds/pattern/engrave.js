// A pattern that follows the shape it fills (worked out per pixel from its mask): hatching over a
// dome raised on the shape, the lines swelling where it turns from the light and bending over its
// top: a copperplate engraving of an inflated shape.
// put(i, coverage, when) sets each pixel and when (0..1) it arrives as the fill comes in; or set
// k.frame,
// or return { final, frame } for a fill that comes in its own way.

import { shading } from '../../fill.js?v=a8136959';

export default {
	family: 'pattern', name: 'engrave',
	follows: true,
	fill({ a, size, sp, w, put, angle, blurR }) {
		const { H, dark } = shading(a, size, blurR);
		const ca = Math.cos(angle), sa = Math.sin(angle);
		for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
			const i = y * size + x;
			if (a[i] <= 0) continue;
			// lines thin to a hair in the light and swell to near solid in the shade; they bow over the dome
			const lw = Math.min(sp * 0.92, w * (0.25 + 3.4 * dark[i]));
			const v = (x * ca + y * sa) / sp + H[i] * 2.6;
			// cut one line after another, each along its length
			put(i, lw / 2 - Math.abs(v - Math.round(v)) * sp + 0.5, 0.72 * Math.round(v) * sp / (size * 1.42) + 0.2 * ((-x * sa + y * ca) / size + 0.7) / 1.4);
		}
	},
};
