// A pattern that lies over the shape it fills: hemp leaf 麻の葉: a triangle lattice with every
// triangle's corners tied to its middle.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'asanoha',
	geometry({ s, a, R, out, P }) {
		// a triangle lattice with every triangle's corners tied to its middle: hemp-leaf stars
		const L = 3 * s, h = L * Math.sqrt(3) / 2;
		const n = Math.ceil(R / h) + 2;
		const at = (i, j) => [i * L + j * L / 2, j * h];
		for (let j = -n; j <= n; j++) for (let i = -n - Math.ceil(n / 2); i <= n + Math.ceil(n / 2); i++) {
			const [u, v] = at(i, j);
			if (Math.abs(u) > R + L || Math.abs(v) > R + L) continue;
			const A = at(i, j), B = at(i + 1, j), C = at(i, j + 1), D = at(i + 1, j + 1);
			out.lines.push([P(...C), P(...A), P(...B), P(...C)]);
			for (const T of [[A, B, C], [B, D, C]]) {
				const m = [(T[0][0] + T[1][0] + T[2][0]) / 3, (T[0][1] + T[1][1] + T[2][1]) / 3];
				for (const q of T) out.lines.push([P(...q), P(...m)]);
			}
		}
	},
};
