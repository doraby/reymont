// A corner ornament: something small in each corner of the field, s px across. corners gives, for
// each, its middle (cx, cy) and (sx, sy), which way is in from the corner (±1 each); it adds
// polys,
// lines and dots to out.
// A square.

export default {
	family: 'corner', name: 'squares',
	draw({ out, corners, s }) {
		for (const [cx, cy, sx, sy] of corners) {
			const q = s * 0.8;
			out.polys.push([[cx - sx * s, cy - sy * s], [cx - sx * s + sx * q * 1.6, cy - sy * s], [cx - sx * s + sx * q * 1.6, cy - sy * s + sy * q * 1.6], [cx - sx * s, cy - sy * s + sy * q * 1.6]]);
		}
	},
};
