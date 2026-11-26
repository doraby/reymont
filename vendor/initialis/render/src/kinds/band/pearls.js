// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// Pearls, big and small by turns.

export default {
	family: 'band', name: 'pearls',
	draw({ out, along, w }) {
		along(w * 0.9).forEach((p, i) => out.dots.push([p.x, p.y, i % 2 ? w * 0.16 : w * 0.34]));
	},
};
