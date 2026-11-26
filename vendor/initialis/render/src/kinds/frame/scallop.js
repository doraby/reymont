// A frame shape: the outline of the frame, in the box (x, y, w, h), middle (cx, cy), as a closed
// list
// of points. arc(ax, ay, r, a0, a1, n) adds n + 1 points round an arc to pts. The rules are drawn
// on
// it and inset from it; the field (what's inside the last rule) is what the rest is laid in.
// A square with a scalloped edge.

export default {
	family: 'frame', name: 'scallop',
	poly({ x, y, w, h, pts }) {
		const n = 7, M = 12;
		const side = (ax, ay, bx, by) => {
			for (let s = 0; s < n; s++) for (let i = 0; i < M; i++) {
				const t = (s + i / M) / n;
				const bump = Math.sin(i / M * Math.PI) * w * 0.022;
				const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
				const nx = (by - ay), ny = -(bx - ax), l = Math.hypot(nx, ny);
				pts.push([px + nx / l * bump, py + ny / l * bump]);
			}
		};
		side(x, y, x + w, y); side(x + w, y, x + w, y + h); side(x + w, y + h, x, y + h); side(x, y + h, x, y);
		return pts;
	},
};
