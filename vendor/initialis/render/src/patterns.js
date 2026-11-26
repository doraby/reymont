// Fills for grounds and letters: hatching, ruled grounds, criblé dots, diaper, rays, the Japanese
// grounds after wen (waves 青海波, hemp leaf 麻の葉, tortoiseshell 亀甲, seven treasures 七宝, thunder
// frets 雷纹, ice crack 冰裂), and the fills that follow the shape they fill (relief.js). Each kind is
// a module of its own, kinds/pattern/<name>.js; this sets up what they draw with and calls the one
// asked for. Each returns geometry over a bounding box; the painter clips it to the shape.

import { rng, TAU } from './util.js?v=a8136959';
import { kind as kindOf, NAMES, FOLLOWS } from './kinds.js?v=a8136959';

export const PATTERNS = NAMES.pattern;
export const SHAPE_FILLS = FOLLOWS;

// what a pattern module's geometry(k) gets: the box and options (o: scale, angle, weight, seed), the
// initial's settings, the spacing s (px between neighbouring lines), the angle a (radians) and its cos c and sin sn, the
// middle (cx, cy), a radius R that covers the box, out { lines, polys, dots } to add to, a random
// stream r, and helpers: P(u, v) turned to the angle round the middle, hatch(angle, wavy),
// circle(u, v, rad, from, to) (turned too), clipHalf(poly, m, d)
export function patternGeometry(kind, box, o) {
	const { x0, y0, x1, y1 } = box;
	const s = Math.max(2, o.scale), a = o.angle * Math.PI / 180;
	const cx = (x0 + x1) / 2 + (o.cx || 0), cy = (y0 + y1) / 2 + (o.cy || 0);
	const R = Math.hypot(x1 - x0, y1 - y0) / 2 + s * 2;
	const out = { lines: [], polys: [], dots: [] };
	const r = rng(o.seed || 1);
	const hatch = (ang, wavy) => {
		const c = Math.cos(ang), sn = Math.sin(ang);
		for (let d = -R; d <= R; d += s) {
			const line = [];
			const steps = wavy ? Math.ceil(2 * R / (s * 0.5)) : 1;
			for (let i = 0; i <= steps; i++) {
				const u = -R + 2 * R * i / steps;
				const v = d + (wavy ? Math.sin(u / (s * 2.2) * Math.PI) * s * 0.32 : 0);
				line.push([cx + c * u - sn * v, cy + sn * u + c * v]);
			}
			out.lines.push(line);
		}
	};
	const c = Math.cos(a), sn = Math.sin(a);
	const P = (u, v) => [cx + c * u - sn * v, cy + sn * u + c * v];
	const circle = (u, v, rad, from = 0, to = TAU) => {
		const n = Math.max(10, Math.ceil(rad * 0.7 * (to - from) / TAU) + 8), pts = [];
		for (let i = 0; i <= n; i++) { const t = from + (to - from) * i / n; pts.push(P(u + Math.cos(t) * rad, v + Math.sin(t) * rad)); }
		return pts;
	};
	const m = kindOf('pattern', kind);
	if (m && m.geometry) m.geometry({ kind, box, o, settings: o.settings || {}, x0, y0, x1, y1, s, a, cx, cy, R, out, r, hatch, c, sn, P, circle, clipHalf });
	return out;
}

// the part of a convex polygon on the near side of the line through m with normal d
function clipHalf(poly, m, d) {
	const side = p => (p[0] - m[0]) * d[0] + (p[1] - m[1]) * d[1];
	const out = [];
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
		if (sa <= 0) out.push(a);
		if ((sa < 0) !== (sb < 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
	}
	return out;
}
