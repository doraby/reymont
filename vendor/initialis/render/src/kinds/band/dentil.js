// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// Dentils: little blocks across the band.

export default {
	family: 'band', name: 'dentil',
	draw({ out, along, w }) {
		for (const p of along(w * 0.9)) {
			const c = Math.cos(p.a), s = Math.sin(p.a), nx = -s, ny = c;
			const hw = w * 0.22, hh = w * 0.42;
			out.polys.push([[p.x - c * hw - nx * hh, p.y - s * hw - ny * hh], [p.x + c * hw - nx * hh, p.y + s * hw - ny * hh], [p.x + c * hw + nx * hh, p.y + s * hw + ny * hh], [p.x - c * hw + nx * hh, p.y - s * hw + ny * hh]]);
		}
	},
};
