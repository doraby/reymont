// A pattern that lies over the shape it fills: overlapping scales, row on row.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'scales',
	geometry({ s, a, cx, cy, R, out }) {
		const c = Math.cos(a), sn = Math.sin(a);
		let row = 0;
		for (let v = -R; v <= R; v += s * 0.5, row++) {
			for (let u = -R + (row % 2) * s / 2; u <= R; u += s) {
				const arc = [];
				for (let k = 0; k <= 12; k++) {
					const t = Math.PI * k / 12;
					const uu = u + Math.cos(t) * s / 2, vv = v + Math.sin(t) * s / 2;
					arc.push([cx + c * uu - sn * vv, cy + sn * uu + c * vv]);
				}
				out.lines.push(arc);
			}
		}
	},
};
