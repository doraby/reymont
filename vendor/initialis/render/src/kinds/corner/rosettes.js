// A corner ornament: something small in each corner of the field, s px across. corners gives, for
// each, its middle (cx, cy) and (sx, sy), which way is in from the corner (±1 each); it adds
// polys,
// lines and dots to out.
// A rosette of six petals.

export default {
	family: 'corner', name: 'rosettes',
	draw({ out, corners, s, blade, circlePoly, TAU }) {
		for (const [cx, cy, sx, sy] of corners) {
			for (let i = 0; i < 6; i++) {
				const a = i / 6 * TAU;
				const b = blade('petal', { x: cx + Math.cos(a) * s * 0.25, y: cy + Math.sin(a) * s * 0.25, dir: a, len: s * 0.75, width: 1.1, bend: 0, curl: 0, N: 10 });
				out.polys.push(b.polys[0]);
			}
			out.polys.push(circlePoly(cx, cy, s * 0.2));
		}
	},
};
