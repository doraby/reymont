// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Cells: Voronoi cells of jittered seeds, inset, as pebbles, shards or outlines.

export default {
	family: 'texture', name: 'cells',
	grow({ o, R, at, out, s, gap, W, H, offsetPolygon }) {
		const pts = [];
		let row = 0;
		for (let y = 0; y < H; y += s * 0.87, row++) for (let x = (row % 2) * s / 2; x < W; x += s) {
			const px = x + (R() - 0.5) * s * 0.8, py = y + (R() - 0.5) * s * 0.8;
			if (at(px, py) > gap + s * 0.25) pts.push([px, py]);
		}
		const hc = s * 1.2, grid = new Map();
		for (const p of pts) { const k = ((p[0] / hc) | 0) * 100003 + ((p[1] / hc) | 0); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
		const inset = Math.max(0.5, o.size * 0.5);
		for (const p of pts) {
			let poly = [[p[0] - s * 1.6, p[1] - s * 1.6], [p[0] + s * 1.6, p[1] - s * 1.6], [p[0] + s * 1.6, p[1] + s * 1.6], [p[0] - s * 1.6, p[1] + s * 1.6]];
			const i0 = (p[0] / hc) | 0, j0 = (p[1] / hc) | 0;
			for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) {
				for (const q of grid.get(i * 100003 + j) || []) {
					if (q === p) continue;
					// keep the half-plane nearer p
					const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = q[0] - p[0], dy = q[1] - p[1];
					const side = (v) => (v[0] - mx) * dx + (v[1] - my) * dy;
					const next = [];
					for (let k = 0; k < poly.length; k++) {
						const A = poly[k], B = poly[(k + 1) % poly.length], sa = side(A), sb = side(B);
						if (sa <= 0) next.push(A);
						if ((sa <= 0) !== (sb <= 0)) { const t = sa / (sa - sb); next.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
					}
					poly = next;
					if (poly.length < 3) break;
				}
			}
			if (poly.length < 3) continue;
			poly = offsetPolygon(poly, inset);
			// pull corners in until they clear everything
			for (const v of poly) for (let k = 0; k < 10 && at(v[0], v[1]) < gap; k++) { v[0] += (p[0] - v[0]) * 0.25; v[1] += (p[1] - v[1]) * 0.25; }
			if (o.style === 'pebble') for (let it = 0; it < 2; it++) {
				const sm = [];
				for (let k = 0; k < poly.length; k++) { const A = poly[k], B = poly[(k + 1) % poly.length]; sm.push([A[0] * 0.75 + B[0] * 0.25, A[1] * 0.75 + B[1] * 0.25], [A[0] * 0.25 + B[0] * 0.75, A[1] * 0.25 + B[1] * 0.75]); }
				poly = sm;
			}
			if (o.style === 'outline') out.lines.push([...poly, poly[0]]);
			else out.polys.push(poly);
		}
	},
};
