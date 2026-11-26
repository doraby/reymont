// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// Laurel: leaves along the band, by turns to either side.

export default {
	family: 'band', name: 'laurel',
	draw({ out, width, along, w, blade }) {
		along(w * 0.75).forEach((p, i) => {
			const sd = i % 2 ? 1 : -1;
			const b = blade('lance', { x: p.x, y: p.y, dir: p.a + sd * 0.6, len: w * 0.8, width: 0.42, bend: -sd * 0.3, curl: 0, N: 10 });
			out.polys.push(b.polys[0]);
		});
	},
};
