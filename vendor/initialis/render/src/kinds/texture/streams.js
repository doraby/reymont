// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Streams: long lines following the flow round things, spaced so they never crowd.

export default {
	family: 'texture', name: 'streams',
	grow({ o, R, at, out, s, gap, W, H, flowDir }) {
		const occ = new Map(), hc = s * 0.6;
		const hkey = (x, y) => ((x / hc) | 0) * 100003 + ((y / hc) | 0);
		const near = (x, y, dmin) => {
			const i0 = (x / hc) | 0, j0 = (y / hc) | 0, r = Math.ceil(dmin / hc);
			for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
				const b = occ.get(i * 100003 + j);
				if (b) for (const [px, py] of b) if ((px - x) ** 2 + (py - y) ** 2 < dmin * dmin) return true;
			}
			return false;
		};
		const mark = (pts) => { for (const p of pts) { const k = hkey(p[0], p[1]); (occ.get(k) || occ.set(k, []).get(k)).push(p); } };
		const w = Math.max(0.6, o.size * 0.5);
		const seeds = [];
		for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) seeds.push([x + (R() - 0.5) * s, y + (R() - 0.5) * s, R()]);
		seeds.sort((a, b) => a[2] - b[2]);
		const step = s * 0.3;
		for (const [sx, sy] of seeds) {
			if (at(sx, sy) < gap + w || near(sx, sy, s * 0.9)) continue;
			const half = (sign) => {
				const pts = [];
				let x = sx, y = sy;
				for (let n = 0; n < 400; n++) {
					const a = flowDir(x, y) + (sign < 0 ? Math.PI : 0);
					const nx2 = x + Math.cos(a) * step, ny2 = y + Math.sin(a) * step;
					if (at(nx2, ny2) < gap + w || near(nx2, ny2, s * 0.5)) break;
					x = nx2; y = ny2; pts.push([x, y]);
				}
				return pts;
			};
			const line = [...half(-1).reverse(), [sx, sy], ...half(1)];
			if (line.length * step < s * 2.5) continue;
			mark(line);
			out.strokes.push(line);
		}
		out.strokeW = w;
	},
};
