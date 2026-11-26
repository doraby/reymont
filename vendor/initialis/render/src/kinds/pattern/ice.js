// A pattern that lies over the shape it fills: ice crack 冰裂: cells of a jittered grid cut by their
// neighbours, some split again inside.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'ice',
	geometry({ s, a, R, out, r, P, clipHalf }) {
		// ice crack: cells of a jittered grid cut by their neighbours, some split again inside
		const T = 5 * s, n = Math.ceil(R / T) + 2;
		const seeds = new Map();
		const seed = (i, j) => {
			const key = i + ',' + j;
			if (!seeds.has(key)) seeds.set(key, [(i + 0.15 + 0.7 * r()) * T, (j + 0.15 + 0.7 * r()) * T]);
			return seeds.get(key);
		};
		for (let j = -n - 2; j <= n + 2; j++) for (let i = -n - 2; i <= n + 2; i++) seed(i, j);
		for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
			const p = seed(i, j);
			let poly = [[p[0] - 2 * T, p[1] - 2 * T], [p[0] + 2 * T, p[1] - 2 * T], [p[0] + 2 * T, p[1] + 2 * T], [p[0] - 2 * T, p[1] + 2 * T]];
			for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
				if (!di && !dj) continue;
				const q = seed(i + di, j + dj);
				poly = clipHalf(poly, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [q[0] - p[0], q[1] - p[1]]);
			}
			if (poly.length < 3) continue;
			out.lines.push([...poly, poly[0]].map(([u, v]) => P(u, v)));
			// a second crack across some cells, corner to corner
			if (r() < 0.45 && poly.length > 4) {
				const k0 = (r() * poly.length) | 0, k1 = (k0 + 2 + ((r() * (poly.length - 3)) | 0)) % poly.length;
				out.lines.push([P(...poly[k0]), P(...poly[k1])]);
			}
		}
	},
};
