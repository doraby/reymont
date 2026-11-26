// A pattern that lies over the shape it fills: the dots scattered, each a different size.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'stipple',
	geometry({ kind, o, x0, y0, x1, y1, s, a, cx, cy, R, out, r }) {
		const c = Math.cos(a), sn = Math.sin(a);
		const rad = Math.max(0.6, o.weight * 0.5);
		let row = 0;
		for (let v = -R; v <= R; v += s * 0.87, row++) {
			for (let u = -R + (row % 2) * s / 2; u <= R; u += s) {
				let uu = u, vv = v, rr = rad;
				if (kind === 'stipple') { uu += (r() - 0.5) * s * 0.9; vv += (r() - 0.5) * s * 0.9; rr *= 0.55 + r() * 0.9; }
				const px = cx + c * uu - sn * vv, py = cy + sn * uu + c * vv;
				if (px < x0 - s || px > x1 + s || py < y0 - s || py > y1 + s) continue;
				out.dots.push([px, py, rr]);
			}
		}
	},
};
