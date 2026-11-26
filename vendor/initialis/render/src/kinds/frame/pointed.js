// A frame shape: the outline of the frame, in the box (x, y, w, h), middle (cx, cy), as a closed
// list
// of points. arc(ax, ay, r, a0, a1, n) adds n + 1 points round an arc to pts. The rules are drawn
// on
// it and inset from it; the field (what's inside the last rule) is what the rest is laid in.
// A pointed gothic arch: two arcs of radius w meeting at the apex.

export default {
	family: 'frame', name: 'pointed',
	poly({ x, y, w, h, pts }) {
		const ys = y + Math.min(h * 0.6, w * 0.866);
		const sy = (ys - y) / (w * 0.866);
		pts.push([x + w, y + h], [x, y + h], [x, ys]);
		for (let i = 1; i <= 20; i++) { const a = Math.PI + (Math.PI / 3) * i / 20; pts.push([x + w + Math.cos(a) * w, ys + Math.sin(a) * w * sy]); }
		for (let i = 1; i <= 20; i++) { const a = Math.PI * 5 / 3 + (Math.PI / 3) * i / 20; pts.push([x + Math.cos(a) * w, ys + Math.sin(a) * w * sy]); }
		return pts;
	},
};
