// A frame shape: the outline of the frame, in the box (x, y, w, h), middle (cx, cy), as a closed
// list
// of points. arc(ax, ay, r, a0, a1, n) adds n + 1 points round an arc to pts. The rules are drawn
// on
// it and inset from it; the field (what's inside the last rule) is what the rest is laid in.
// A rectangle with rounded corners.

export default {
	family: 'frame', name: 'rounded',
	poly({ x, y, w, h, pts, arc }) {
		const r = Math.min(w, h) * 0.13;
		arc(x + w - r, y + r, r, -Math.PI / 2, 0, 10);
		arc(x + w - r, y + h - r, r, 0, Math.PI / 2, 10);
		arc(x + r, y + h - r, r, Math.PI / 2, Math.PI, 10);
		arc(x + r, y + r, r, Math.PI, Math.PI * 1.5, 10);
		return pts;
	},
};
