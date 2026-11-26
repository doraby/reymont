// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// A zigzag.

export default {
	family: 'band', name: 'zigzag',
	draw({ out, along, w }) {
		const pts = along(w * 0.7).map((p, i) => {
			const o = (i % 2 ? 1 : -1) * w * 0.38;
			return [p.x - Math.sin(p.a) * o, p.y + Math.cos(p.a) * o];
		});
		out.lines.push([...pts, pts[0]]);
	},
};
