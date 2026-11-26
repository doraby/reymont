// A pattern that lies over the shape it fills: a ruled grid.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'grid',
	geometry({ a, hatch }) {
		hatch(a, false); hatch(a + Math.PI / 2, false);
	},
};
