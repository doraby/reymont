// A pattern that follows the shape it fills (worked out per pixel from its mask): watercolour as
// print can hold it: a granulating stipple, densest where the pigment dried against the edge, with
// backruns (pale blooms with lacy dark fronts).
// put(i, coverage, when) sets each pixel and when (0..1) it arrives as the fill comes in; or set
// k.frame,
// or return { final, frame } for a fill that comes in its own way.

import { wash } from '../../relief.js?v=a8136959';

export default {
	family: 'pattern', name: 'wash',
	follows: true,
	fill({ a, size, sp, w, put, seed }) {
		wash(a, put, size, sp, w, seed);
	},
};
