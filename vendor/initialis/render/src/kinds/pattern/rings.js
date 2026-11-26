// A pattern that lies over the shape it fills: rings round a centre.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

import { TAU } from '../../util.js?v=a8136959';

export default {
	family: 'pattern', name: 'rings',
	geometry({ s, cx, cy, R, out }) {
		for (let rr = s; rr < R * 1.5; rr += s) {
			const ring = [];
			const n = Math.max(24, Math.round(rr * 0.6));
			for (let i = 0; i <= n; i++) { const t = i / n * TAU; ring.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]); }
			out.lines.push(ring);
		}
	},
};
