// A pattern that lies over the shape it fills: parallel lines at the pattern's angle.
// It adds lines, polys and dots to out over the box, at spacing s and angle a (radians), round
// (cx, cy);
// the painter clips them to the shape.

export default {
	family: 'pattern', name: 'hatch',
	geometry({ a, hatch }) {
		hatch(a, false);
	},
};
