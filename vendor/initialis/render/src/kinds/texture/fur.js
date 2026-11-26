// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Fur: short strokes pointing away from the nearest edge.

export default {
	family: 'texture', name: 'fur',
	grow({ o, noise, R, at, grad, out, s, gap, W, H, sizeAt }) {
		const w = Math.max(0.6, o.size * 0.5);
		// fur: short strokes pointing away from the nearest edge
		let row = 0;
		for (let y = s / 2; y < H; y += s * 0.75, row++) {
			for (let x = (row % 2) * s / 2; x < W; x += s * 0.75) {
				const px = x + (R() - 0.5) * s * 0.6, py = y + (R() - 0.5) * s * 0.6;
				const c = at(px, py);
				if (c < gap + 1) continue;
				const [gx, gy] = grad(px, py);
				const a = Math.atan2(gy, gx) + o.twist * noise(px / (s * 6), py / (s * 6)) * 1.6;
				const L = Math.min(c - gap, s * 2.6) * (0.55 + R() * 0.45) * sizeAt(c);
				if (L < 2) continue;
				const x0 = px - Math.cos(a) * L / 2, y0 = py - Math.sin(a) * L / 2, x1 = px + Math.cos(a) * L / 2, y1 = py + Math.sin(a) * L / 2;
				if (at(x0, y0) < gap || at(x1, y1) < gap) continue;
				out.strokes.push([[x0, y0], [px, py], [x1, y1]]);
			}
		}
		out.strokeW = w;
	},
};
