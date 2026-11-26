// A pattern that lies over the shape it fills: seven treasures 七宝: circles on a diagonal lattice,
// each overlapping its four neighbours.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'shippo',
	geometry({ s, a, R, out, circle }) {
		// seven treasures: circles on a diagonal lattice, each overlapping its four neighbours
		const rad = 2.4 * s, n = Math.ceil(R / rad) + 1;
		for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
			if ((i + j) & 1) continue;
			out.lines.push(circle(i * rad, j * rad, rad));
		}
	},
};
