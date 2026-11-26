// A pattern that lies over the shape it fills: thunder frets 雷纹: a square spiral in every tile,
// turning the other way in the next.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'frets',
	geometry({ s, a, R, out, P }) {
		// thunder frets: a square spiral in every tile, turning the other way in the next
		const T = 7 * s, n = Math.ceil(R / T) + 1;
		for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
			const flip = (i + j) & 1 ? -1 : 1, u0 = i * T, v0 = j * T;
			const pts = [P(u0, v0)];
			let u = 0, v = 0, len = s, dir = 0;
			const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
			while (len < T - s * 1.2) {
				for (let rep = 0; rep < 2 && len < T - s * 1.2; rep++) {
					u += D[dir][0] * len * flip; v += D[dir][1] * len;
					pts.push(P(u0 + u, v0 + v));
					dir = (dir + 1) % 4;
				}
				len += s;
			}
			out.lines.push(pts);
		}
	},
};
