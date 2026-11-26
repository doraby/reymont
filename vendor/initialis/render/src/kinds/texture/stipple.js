// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Stipple: dots (or rings, crosses, stars, dashes along the flow) on a jittered grid, sized by how
// far they are from things.

export default {
	family: 'texture', name: 'stipple',
	grow({ o, R, at, out, s, gap, W, H, sizeAt, flowDir, star }) {
		let row = 0;
		for (let y = s / 2; y < H; y += s * 0.866, row++) {
			for (let x = (row % 2) * s / 2; x < W; x += s) {
				const px = x + (R() - 0.5) * s * 0.7, py = y + (R() - 0.5) * s * 0.7;
				const c = at(px, py);
				const r = o.size * 0.5 * sizeAt(c);
				if (r < 0.25 || c < r + gap) continue;
				if (o.shape === 'ring') out.rings.push([px, py, r]);
				else if (o.shape === 'cross') { const h = r * 1.3; out.lines.push([[px - h, py], [px + h, py]], [[px, py - h], [px, py + h]]); }
				else if (o.shape === 'star') out.polys.push(star(px, py, r * 1.6, 4, 0.32, R() * 0.4));
				else if (o.shape === 'dash') { const a = flowDir(px, py), h = r * 1.8; out.lines.push([[px - Math.cos(a) * h, py - Math.sin(a) * h], [px + Math.cos(a) * h, py + Math.sin(a) * h]]); }
				else out.dots.push([px, py, r]);
			}
		}
	},
};
