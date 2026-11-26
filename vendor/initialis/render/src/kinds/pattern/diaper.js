// A pattern that lies over the shape it fills: a diamond lattice with a dot in every cell.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'diaper',
	geometry({ o, s, a, cx, cy, R, out, hatch }) {
		// diamond lattice with a dot in every cell
		hatch(a + Math.PI / 4, false); hatch(a - Math.PI / 4, false);
		const c = Math.cos(a), sn = Math.sin(a), d = s / Math.SQRT2 * 2;
		for (let i = Math.floor(-R / d); i * d <= R; i++) for (let j = Math.floor(-R / d); j * d <= R; j++) {
			const u = i * d, v = j * d;
			out.dots.push([cx + c * u - sn * v, cy + sn * u + c * v, Math.max(1, o.weight * 1.1)]);
		}
	},
};
