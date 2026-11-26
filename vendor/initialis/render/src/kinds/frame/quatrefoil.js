// A frame shape: the outline of the frame, in the box (x, y, w, h), middle (cx, cy), as a closed
// list
// of points. arc(ax, ay, r, a0, a1, n) adds n + 1 points round an arc to pts. The rules are drawn
// on
// it and inset from it; the field (what's inside the last rule) is what the rest is laid in.
// A quatrefoil: the union of four circles.

export default {
	family: 'frame', name: 'quatrefoil',
	poly({ w, h, cx, cy, pts, TAU }) {
		const r = w * 0.27, d = w / 2 - r;
		const M = 200;
		for (let i = 0; i < M; i++) {
			const a = i / M * TAU;
			let best = 0;
			for (let k = 0; k < 4; k++) {
				const ca = k * Math.PI / 2, ox = Math.cos(ca) * d, oy = Math.sin(ca) * d;
				// ray from centre to circle k
				const dx = Math.cos(a), dy = Math.sin(a);
				const b = dx * ox + dy * oy, c = ox * ox + oy * oy - r * r;
				const disc = b * b - c;
				if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
			}
			pts.push([cx + Math.cos(a) * best, cy + Math.sin(a) * best * h / w]);
		}
		return pts;
	},
};
