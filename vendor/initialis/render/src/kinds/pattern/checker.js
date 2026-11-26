// A pattern that lies over the shape it fills: a chequerboard.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'checker',
	geometry({ s, a, cx, cy, R, out }) {
		const c = Math.cos(a), sn = Math.sin(a);
		const P = (u, v) => [cx + c * u - sn * v, cy + sn * u + c * v];
		for (let i = Math.floor(-R / s); i * s <= R; i++) for (let j = Math.floor(-R / s); j * s <= R; j++) {
			if ((i + j) & 1) continue;
			const u = i * s, v = j * s;
			out.polys.push([P(u, v), P(u + s, v), P(u + s, v + s), P(u, v + s)]);
		}
	},
};
