// Fills that follow the shape they fill, worked out per pixel from its mask. Each kind is a module
// (kinds/pattern/<name>.js, follows: true); this is what they all share: the shape's depth and
// shading, and makeFill, which sets a fill going. The biggest (mosaic, wash, frost, mycelium) have
// their machinery in relief.js, fetched only for them.

import { edt, rng } from './util.js?v=a8136959';
import { kind as kindOf } from './kinds.js?v=a8136959';

// three box blurs, about a gaussian of radius r (px), of a square size × size field
export function blur(a, size, r) {
	r = Math.max(1, Math.round(r));
	const out = new Float32Array(a), tmp = new Float32Array(a.length), span = 2 * r + 1, last = size - 1;
	// a running sum along one line (from base, every step), the ends held at the edge value
	const line = (from, to, base, step) => {
		let s = from[base] * (r + 1);
		for (let i = 1; i <= r; i++) s += from[base + Math.min(i, last) * step];
		for (let i = 0; i < size; i++) {
			to[base + i * step] = s / span;
			s += from[base + Math.min(i + r + 1, last) * step] - from[base + Math.max(i - r, 0) * step];
		}
	};
	for (let n = 0; n < 3; n++) {
		for (let j = 0; j < size; j++) line(out, tmp, j * size, 1);
		for (let j = 0; j < size; j++) line(tmp, out, j, size);
	}
	return out;
}

// distance (px) in from the shape's edge, 0 outside
export function depth(a, size) {
	const f = new Float64Array(size * size);
	for (let i = 0; i < f.length; i++) f[i] = a[i] > 0.5 ? 1e20 : 0;
	edt(f, size, size);
	const d = new Float32Array(f.length);
	for (let i = 0; i < f.length; i++) d[i] = Math.sqrt(f[i]);
	return d;
}

// how far each point of a dome raised on the shape turns from a light at the upper left (0 lit, 1
// in shade), and the dome's height
export function shading(a, size, blurR) {
	const H = blur(a, size, blurR || size * 0.03), dark = new Float32Array(a.length);
	const lx = -0.55, ly = -0.65, lz = 0.52, relief = blurR ? 3.2 * blurR : size * 0.1;
	for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
		const i = y * size + x;
		if (a[i] <= 0) continue;
		const gx = (H[i + 1] - H[i - 1]) / 2 * relief, gy = (H[i + size] - H[i - size]) / 2 * relief;
		const lam = (-gx * lx - gy * ly + lz) / Math.hypot(gx, gy, 1);
		const t = Math.min(1, Math.max(0, (0.9 - lam) / 0.75));
		dark[i] = t * t * (3 - 2 * t);
	}
	return { H, dark };
}

// src: RGBA of the shape's mask (alpha = inside). spacing, weight in px; angle in radians.
// (The kinds themselves are modules: kinds/pattern/contour.js and the rest with follows: true.)
// Returns { final, frame(t) }: the fill as RGBA (white, its coverage as alpha), finished or as it
// stands at t (0..1) while it comes in. Each kind comes in its own way: rings from the edge in,
// the engraving cut line by line, halftone dots swelling, mosaic tiles laid outer row first, a wash
// spreading from where the brush touched, frost and mycelium growing as they grew.
export function makeFill(kind, src, size, { spacing, weight, angle = 0, blurR, seed = 1, settings = {} }) {
	const n = size * size, a = new Float32Array(n);
	for (let i = 0; i < n; i++) a[i] = src[i * 4 + 3] / 255;
	const F = new Float32Array(n), A = new Float32Array(n);
	const sp = Math.max(2, spacing), w = Math.max(0.9, weight), r = rng(seed ^ 0x2f6b);
	// coverage v, arriving at time at
	const put = (i, v, at = 0) => { F[i] = Math.min(1, Math.max(0, v)) * a[i]; A[i] = at; };
	const rgba = (alpha) => { const o = new Uint8ClampedArray(n * 4).fill(255); for (let i = 0; i < n; i++) o[i * 4 + 3] = alpha(i); return o; };
	// each kind is a module (kinds/pattern/<name>.js, follows: true): its fill(k) sets every pixel
	// with put, and may set k.frame, or return { final, frame } outright
	const k = { kind, a, n, size, F, A, sp, w, r, put, rgba, angle, blurR, seed, settings, frame: null, depth: () => depth(a, size), shading: (br = blurR) => shading(a, size, br) };
	k.k = k;
	const m = kindOf('pattern', kind), done = m && m.fill ? m.fill(k) : null;
	if (done) return done;
	const frame = k.frame;
	const final = rgba(i => Math.round(255 * F[i]));
	return {
		final,
		frame: frame || ((t) => rgba(i => {
			if (F[i] <= 0) return 0;
			return Math.round(255 * F[i] * Math.min(1, Math.max(0, (t - A[i]) / 0.03 + 0.5)));
		})),
	};
}
// the finished fill only
export const shapeFill = (kind, src, size, opts) => makeFill(kind, src, size, opts).final;

