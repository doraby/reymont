// A frame shape: the outline of the frame, in the box (x, y, w, h), middle (cx, cy), as a closed
// list
// of points. arc(ax, ay, r, a0, a1, n) adds n + 1 points round an arc to pts. The rules are drawn
// on
// it and inset from it; the field (what's inside the last rule) is what the rest is laid in.
// A circle (an ellipse in a box that isn't square).

export default {
	family: 'frame', name: 'circle',
	poly({ w, h, cx, cy, pts, TAU }) {
		for (let i = 0; i < 120; i++) { const a = i / 120 * TAU; pts.push([cx + Math.cos(a) * w / 2, cy + Math.sin(a) * h / 2]); }
		return pts;
	},
};
