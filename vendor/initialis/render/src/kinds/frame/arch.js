// A frame shape: the outline of the frame, in the box (x, y, w, h), middle (cx, cy), as a closed
// list
// of points. arc(ax, ay, r, a0, a1, n) adds n + 1 points round an arc to pts. The rules are drawn
// on
// it and inset from it; the field (what's inside the last rule) is what the rest is laid in.
// A round arch.

export default {
	family: 'frame', name: 'arch',
	poly({ x, y, w, h, cx, pts, arc, TAU }) {
		const r = w / 2;
		pts.push([x + w, y + h], [x, y + h]);
		arc(cx, y + r, r, Math.PI, TAU, 40);
		return pts;
	},
};
