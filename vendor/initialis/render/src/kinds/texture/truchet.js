// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Truchet tiles: arcs, diagonals or triangles turned at random in a grid.

export default {
	family: 'texture', name: 'truchet',
	grow({ o, R, at, out, s, gap, W, H, clipRuns }) {
		const w = Math.max(0.6, o.size * 0.5);
		const ok = (p) => at(p[0], p[1]) >= gap + w / 2;
		for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
			const flip = R() < 0.5;
			if (o.style === 'diagonal') {
				const line = flip ? [[x, y], [x + s, y + s]] : [[x + s, y], [x, y + s]];
				const pts = [];
				for (let i = 0; i <= 8; i++) pts.push([line[0][0] + (line[1][0] - line[0][0]) * i / 8, line[0][1] + (line[1][1] - line[0][1]) * i / 8]);
				out.lines.push(...clipRuns(pts, ok));
			} else if (o.style === 'triangles') {
				const tri = flip ? [[x, y], [x + s, y], [x, y + s]] : [[x + s, y], [x + s, y + s], [x, y + s]];
				const shrink = tri.map(([a, b]) => [a + (x + s / 2 - a) * 0.12, b + (y + s / 2 - b) * 0.12]);
				if (shrink.every(ok)) out.polys.push(shrink);
			} else {
				const cs = flip ? [[x, y, 0], [x + s, y + s, Math.PI]] : [[x + s, y, Math.PI / 2], [x, y + s, -Math.PI / 2]];
				for (const [cx, cy, a0] of cs) {
					const pts = [];
					for (let i = 0; i <= 10; i++) { const a = a0 + i / 10 * Math.PI / 2; pts.push([cx + Math.cos(a) * s / 2, cy + Math.sin(a) * s / 2]); }
					out.lines.push(...clipRuns(pts, ok));
				}
			}
		}
	},
};
