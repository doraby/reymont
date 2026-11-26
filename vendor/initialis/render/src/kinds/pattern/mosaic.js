// A pattern that follows the shape it fills (worked out per pixel from its mask): opus
// vermiculatum: rows of tesserae following the outline inward, each row cut into tiles (Voronoi
// cells of seeds along the row's middle), grout between.
// put(i, coverage, when) sets each pixel and when (0..1) it arrives as the fill comes in; or set
// k.frame,
// or return { final, frame } for a fill that comes in its own way.

import { mosaic } from '../../relief.js?v=a8136959';

export default {
	family: 'pattern', name: 'mosaic',
	follows: true,
	fill({ a, size, sp, w, put, seed }) {
		mosaic(a, put, size, sp * 1.7, Math.max(0.9, w * 0.7), seed);
	},
};
