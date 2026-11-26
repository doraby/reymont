// A pattern that lies over the shape it fills: tortoiseshell 亀甲: hexagons, each with a second
// hexagon inside.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'kikko',
	geometry({ s, a, R, out, P }) {
		// tortoiseshell: hexagons, each with a second hexagon inside
		const rad = 2.4 * s, w = Math.sqrt(3) * rad, n = Math.ceil(R / (1.5 * rad)) + 2;
		const hex = (u, v, rr) => { const pts = []; for (let k = 0; k <= 6; k++) { const t = Math.PI / 6 + k * Math.PI / 3; pts.push(P(u + Math.cos(t) * rr, v + Math.sin(t) * rr)); } return pts; };
		for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
			const u = i * w + (j & 1 ? w / 2 : 0), v = j * 1.5 * rad;
			if (Math.abs(u) > R + w || Math.abs(v) > R + w) continue;
			out.lines.push(hex(u, v, rad), hex(u, v, rad - s * 0.8));
		}
	},
};
