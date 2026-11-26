// A corner ornament: something small in each corner of the field, s px across. corners gives, for
// each, its middle (cx, cy) and (sx, sy), which way is in from the corner (±1 each); it adds
// polys,
// lines and dots to out.
// A dot.

export default {
	family: 'corner', name: 'dots',
	draw({ out, corners, s }) {
		for (const [cx, cy, sx, sy] of corners) {
			out.dots.push([cx, cy, s * 0.45]);
		}
	},
};
