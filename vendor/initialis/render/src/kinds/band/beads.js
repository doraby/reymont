// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// Beads.

export default {
	family: 'band', name: 'beads',
	draw({ out, along, w }) {
		for (const p of along(w * 1.05)) out.dots.push([p.x, p.y, w * 0.34]);
	},
};
