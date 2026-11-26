// A frame shape: the outline of the frame, in the box (x, y, w, h), middle (cx, cy), as a closed
// list
// of points. arc(ax, ay, r, a0, a1, n) adds n + 1 points round an arc to pts. The rules are drawn
// on
// it and inset from it; the field (what's inside the last rule) is what the rest is laid in.
// A heraldic shield.

export default {
	family: 'frame', name: 'shield',
	poly({ x, y, w, h, pts }) {
		const sh = y + h * 0.45;
		pts.push([x, y], [x + w, y], [x + w, sh]);
		for (let i = 1; i <= 24; i++) {
			const t = i / 24;
			const px = x + w - (w / 2) * (1 - Math.cos(t * Math.PI / 2));
			const py = sh + (y + h - sh) * Math.sin(t * Math.PI / 2);
			pts.push([px, py]);
		}
		for (let i = 23; i >= 1; i--) {
			const t = i / 24;
			const px = x + (w / 2) * (1 - Math.cos(t * Math.PI / 2));
			const py = sh + (y + h - sh) * Math.sin(t * Math.PI / 2);
			pts.push([px, py]);
		}
		pts.push([x, sh]);
		return pts;
	},
};
