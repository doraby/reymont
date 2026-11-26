// A pattern that follows the shape it fills (worked out per pixel from its mask): rings at even
// steps in from the edge: bronze-age lines inside a letter, raked gravel in a ground.
// put(i, coverage, when) sets each pixel and when (0..1) it arrives as the fill comes in; or set
// k.frame,
// or return { final, frame } for a fill that comes in its own way.

import { depth } from '../../fill.js?v=a8136959';

export default {
	family: 'pattern', name: 'contour',
	follows: true,
	fill({ a, n, size, sp, w, put }) {
		const d = depth(a, size);
		let dmax = 1;
		for (let i = 0; i < n; i++) if (d[i] > dmax) dmax = d[i];
		for (let i = 0; i < n; i++) {
			if (a[i] <= 0) continue;
			const t = d[i] / sp - 0.5;
			put(i, w / 2 - Math.abs(t - Math.round(t)) * sp + 0.5, 0.9 * Math.pow(d[i] / dmax, 0.8));
		}
	},
};
