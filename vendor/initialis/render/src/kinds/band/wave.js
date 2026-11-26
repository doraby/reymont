// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// A wave.

export default {
	family: 'band', name: 'wave',
	draw({ out, along, w }) {
		const pts = along(w * 0.18).map((p, i) => {
			const o = Math.sin(i * 0.18 * Math.PI * 0.95) * w * 0.34;
			return [p.x - Math.sin(p.a) * o, p.y + Math.cos(p.a) * o];
		});
		out.lines.push([...pts, pts[0]]);
	},
};
