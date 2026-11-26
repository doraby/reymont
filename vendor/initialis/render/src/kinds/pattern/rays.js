// A pattern that lies over the shape it fills: alternating wedges from a centre.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

import { TAU } from '../../util.js?v=a8136959';

export default {
	family: 'pattern', name: 'rays',
	geometry({ s, a, cx, cy, R, out }) {
		// alternating wedges from a centre
		const n = Math.max(6, Math.round(TAU * 260 / s) & ~1);
		// rays start a little out from the centre so they don't mush together
		const r0 = s * 1.4;
		for (let i = 0; i < n; i += 2) {
			const a0 = a + i / n * TAU, a1 = a + (i + 1) / n * TAU;
			out.polys.push([[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0], [cx + Math.cos(a0) * R * 2, cy + Math.sin(a0) * R * 2], [cx + Math.cos(a1) * R * 2, cy + Math.sin(a1) * R * 2], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0]]);
		}
	},
};
