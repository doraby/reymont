// A corner ornament: something small in each corner of the field, s px across. corners gives, for
// each, its middle (cx, cy) and (sx, sy), which way is in from the corner (±1 each); it adds
// polys,
// lines and dots to out.
// A quarter circle.

export default {
	family: 'corner', name: 'quarter',
	draw({ out, corners, s }) {
		for (const [cx, cy, sx, sy] of corners) {
			const p = [[cx - sx * s, cy - sy * s]];
			for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; p.push([cx - sx * s + sx * Math.cos(a) * s * 1.8, cy - sy * s + sy * Math.sin(a) * s * 1.8]); }
			out.polys.push(p);
		}
	},
};
