// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// A chequer, two squares deep.

export default {
	family: 'band', name: 'checker',
	draw({ out, along, w }) {
		along(w * 0.5).forEach((p, i) => {
			const c = Math.cos(p.a), s = Math.sin(p.a), nx = -s, ny = c;
			const hw = w * 0.25, row = i % 2 ? 1 : -1;
			const ox = nx * row * w * 0.25, oy = ny * row * w * 0.25;
			out.polys.push([[p.x + ox - c * hw - nx * hw, p.y + oy - s * hw - ny * hw], [p.x + ox + c * hw - nx * hw, p.y + oy + s * hw - ny * hw], [p.x + ox + c * hw + nx * hw, p.y + oy + s * hw + ny * hw], [p.x + ox - c * hw + nx * hw, p.y + oy - s * hw + ny * hw]]);
		});
	},
};
