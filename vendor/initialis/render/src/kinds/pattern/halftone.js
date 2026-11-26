// A pattern that follows the shape it fills (worked out per pixel from its mask): a 45° dot screen
// over the same dome's shading: big dots in the shade, pinpricks in the light; the dots swell in
// from nothing, across the sheet with a little scatter.
// put(i, coverage, when) sets each pixel and when (0..1) it arrives as the fill comes in; or set
// k.frame,
// or return { final, frame } for a fill that comes in its own way.

import { shading } from '../../fill.js?v=a8136959';

export default {
	family: 'pattern', name: 'halftone',
	follows: true,
	fill({ a, n, size, A, sp, w, put, rgba, angle, blurR, seed, k }) {
		// dots swell from nothing, across the sheet with a little scatter
		const { dark } = shading(a, size, blurR);
		const ca = Math.cos(angle + Math.PI / 4), sa = Math.sin(angle + Math.PI / 4);
		const R = new Float32Array(n), D = new Float32Array(n);
		for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
			const i = y * size + x;
			if (a[i] <= 0) continue;
			const u = (x * ca + y * sa) / sp, v = (-x * sa + y * ca) / sp, cu = Math.round(u), cv = Math.round(v);
			R[i] = Math.sqrt(0.08 + 0.9 * dark[i]) * sp * 0.6 + (w - 1) * 0.35;
			D[i] = Math.hypot(u - cu, v - cv) * sp;
			const h = Math.sin(cu * 12.9898 + cv * 78.233 + seed) * 43758.5453;
			put(i, R[i] - D[i] + 0.5, 0.55 * (x + y) / (2 * size) + 0.25 * (h - Math.floor(h)));
		}
		k.frame = (t) => rgba(i => {
			if (a[i] <= 0) return 0;
			const g = Math.min(1, Math.max(0, (t - A[i]) / 0.2)), e = g * g * (3 - 2 * g);
			return Math.round(255 * Math.min(1, Math.max(0, R[i] * e - D[i] + 0.5 * e)) * a[i]);
		});
	},
};
