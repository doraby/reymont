// A pattern that lies over the shape it fills: blue ocean waves 青海波: fans of four rings in rows
// half a fan high, each row hiding the lower part of the one behind.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'seigaiha',
	geometry({ s, a, R, out, P }) {
		// fans of four rings in rows half a fan high; each row hides the lower part of the one behind
		const rad = 3.6 * s, dx = 2 * rad, dy = rad / 2;
		const rows = Math.ceil(R / dy) + 2, cols = Math.ceil(R / dx) + 2;
		for (let j = -rows; j <= rows; j++) for (let i = -cols; i <= cols; i++) {
			const u0 = i * dx + (j & 1 ? rad : 0), v0 = j * dy;
			// the fans in front: the next two rows down
			const front = [];
			for (let jj = j + 1; jj <= j + 2; jj++) for (let ii = i - 2; ii <= i + 2; ii++) front.push([ii * dx + (jj & 1 ? rad : 0), jj * dy]);
			for (let rr = rad; rr > 0.3 * s; rr -= s) {
				const n = Math.max(16, Math.ceil(rr * 0.8));
				let run = [];
				for (let k = 0; k <= n; k++) {
					const t = Math.PI + Math.PI * k / n, u = u0 + Math.cos(t) * rr, v = v0 + Math.sin(t) * rr;
					const hid = front.some(([fu, fv]) => (u - fu) ** 2 + (v - fv) ** 2 < rad * rad);
					if (hid) { if (run.length > 1) out.lines.push(run); run = []; } else run.push(P(u, v));
				}
				if (run.length > 1) out.lines.push(run);
			}
		}
	},
};
