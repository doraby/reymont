// Clean outlines: many fonts (and every static instance cut from a variable font) build letters
// from overlapping contours. Filling hides that, but strokes, inlines and offsets trace the
// hidden seams. When overlaps are present, rasterize the letter and march the squares back
// into non-overlapping contours.

import { edt } from './util.js?v=a8136959';
import { blur } from './fill.js?v=a8136959';

function canvas(w, h) {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
	const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function pathOf(contours, s, ox, oy) {
	const p = new Path2D();
	for (const c of contours) {
		p.moveTo((c[0][0] - ox) * s, (c[0][1] - oy) * s);
		for (let i = 1; i < c.length; i++) p.lineTo((c[i][0] - ox) * s, (c[i][1] - oy) * s);
		p.closePath();
	}
	return p;
}

export function hasOverlaps(contours) {
	if (contours.length < 2) return false;
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	const n = 160, s = n / Math.max(x1 - x0, y1 - y0, 1);
	const w = Math.ceil((x1 - x0) * s) + 2, h = Math.ceil((y1 - y0) * s) + 2;
	const cv = canvas(w, h), x = cv.getContext('2d', { willReadFrequently: true });
	const p = pathOf(contours, s, x0 - 1 / s, y0 - 1 / s);
	x.fillStyle = '#f00'; x.fill(p, 'nonzero');
	x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(p, 'evenodd');
	const d = x.getImageData(0, 0, w, h).data;
	let diff = 0;
	for (let i = 3; i < d.length; i += 4) if (d[i] > 128) diff++;
	return diff > 2;
}

// res: units per pixel
export function unionContours(contours, res = 0.6) {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	const pad = 2;
	const ox = x0 - pad * res, oy = y0 - pad * res;
	const w = Math.ceil((x1 - x0) / res) + pad * 2 + 1, h = Math.ceil((y1 - y0) / res) + pad * 2 + 1;
	const cv = canvas(w, h), x = cv.getContext('2d', { willReadFrequently: true });
	// pixel centres sit on integer coordinates for the marching
	x.translate(0.5, 0.5);
	x.fillStyle = '#fff';
	x.fill(pathOf(contours, 1 / res, ox, oy), 'nonzero');
	const img = x.getImageData(0, 0, w, h).data;
	const v = new Float32Array(w * h);
	for (let i = 0; i < v.length; i++) v[i] = img[i * 4 + 3] / 255;
	return march(v, w, h, 0.5).map(l => l.map(([px, py]) => [ox + px * res, oy + py * res]));
}

// a letter blown up like a balloon (after bao's inflated characters): grown by `grow` units, then
// blurred and cut back at half, which rounds every corner and fills the crotches between strokes
export function inflateContours(contours, grow, res = 0.6) {
	// the outline comes out smooth, so a coarse grid does
	res = Math.max(res, 1.5, grow / 12);
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	if (!isFinite(x0)) return contours;
	const pad = 2.8 * grow / res + 4;
	const n = Math.ceil(Math.max(x1 - x0, y1 - y0) / res + 2 * pad);
	const ox = (x0 + x1) / 2 - n * res / 2, oy = (y0 + y1) / 2 - n * res / 2;
	const cv = canvas(n, n), x = cv.getContext('2d', { willReadFrequently: true });
	x.translate(0.5, 0.5);
	x.fillStyle = '#fff';
	x.fill(pathOf(contours, 1 / res, ox, oy), 'nonzero');
	const img = x.getImageData(0, 0, n, n).data;
	const f = new Float64Array(n * n);
	for (let i = 0; i < f.length; i++) f[i] = img[i * 4 + 3] > 127 ? 0 : 1e20;
	edt(f, n, n);
	// counters must stay open: if blowing up closes most of a hole, blow up less
	const holes = ls => ls.reduce((a, l) => a + Math.max(0, -area(l)), 0);
	const v0 = new Float32Array(n * n);
	for (let i = 0; i < v0.length; i++) v0[i] = f[i] === 0 ? 1 : 0;
	const open = holes(march(v0, n, n, 0.5));
	const v = new Float32Array(n * n);
	let loops = null;
	for (let g = grow / res, tries = 0; tries < 4; tries++, g *= 0.6) {
		for (let i = 0; i < v.length; i++) v[i] = Math.min(1, Math.max(0, g - Math.sqrt(f[i]) + 0.5));
		loops = march(blur(v, n, 0.9 * g), n, n, 0.5);
		if (!open || holes(loops) > 0.35 * open) break;
	}
	return loops.map(l => l.map(([px, py]) => [ox + px * res, oy + py * res]));
}

// the T level of v (w × h) as closed loops in pixel coordinates, outer loops one way and holes
// the other
export function march(v, w, h, T) {
	// edge ids: horizontal edge from (i,j) to (i+1,j) = 2k, vertical (i,j)-(i,j+1) = 2k+1
	const pts = new Map();
	const pt = (id) => {
		let p = pts.get(id);
		if (p) return p;
		const k = id >> 1, i = k % w, j = (k / w) | 0;
		const a = v[k];
		if (id & 1) { const b = v[k + w]; const t = (T - a) / (b - a); p = [i, j + t]; }
		else { const b = v[k + 1]; const t = (T - a) / (b - a); p = [i + t, j]; }
		pts.set(id, p);
		return p;
	};
	const link = new Map(); // edge id -> [other edge ids]
	const add = (e1, e2) => {
		(link.get(e1) || link.set(e1, []).get(e1)).push(e2);
		(link.get(e2) || link.set(e2, []).get(e2)).push(e1);
	};
	for (let j = 0; j < h - 1; j++) {
		for (let i = 0; i < w - 1; i++) {
			const k = j * w + i;
			const a = v[k] > T, b = v[k + 1] > T, c = v[k + w + 1] > T, d = v[k + w] > T;
			const cs = (a << 3) | (b << 2) | (c << 1) | d;
			if (cs === 0 || cs === 15) continue;
			const Te = 2 * k, Le = 2 * k + 1, Be = 2 * (k + w), Re = 2 * (k + 1) + 1;
			switch (cs) {
				case 1: case 14: add(Le, Be); break;
				case 2: case 13: add(Be, Re); break;
				case 3: case 12: add(Le, Re); break;
				case 4: case 11: add(Te, Re); break;
				case 6: case 9: add(Te, Be); break;
				case 7: case 8: add(Te, Le); break;
				case 5: case 10: {
					const mid = (v[k] + v[k + 1] + v[k + w] + v[k + w + 1]) / 4 > T;
					if ((cs === 5) === mid) { add(Te, Re); add(Le, Be); } else { add(Te, Le); add(Be, Re); }
					break;
				}
			}
		}
	}
	// walk loops
	const used = new Set();
	const loops = [];
	for (const start of link.keys()) {
		if (used.has(start)) continue;
		const loop = [];
		let prev = -1, cur = start;
		while (cur !== undefined && !used.has(cur)) {
			used.add(cur);
			loop.push(pt(cur));
			const nb = link.get(cur);
			const next = nb[0] !== prev ? nb[0] : nb[1];
			prev = cur; cur = next;
		}
		if (loop.length > 4) loops.push(simplify(loop, 0.18));
	}
	return orient(loops);
}

// drop points that sit on a straight run
function simplify(loop, tol) {
	const out = [];
	const n = loop.length;
	for (let i = 0; i < n; i++) {
		const a = out.length ? out[out.length - 1] : loop[n - 1], p = loop[i], b = loop[(i + 1) % n];
		const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
		const dist = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / l;
		if (dist > tol || l > 6) out.push(p);
	}
	return out.length > 3 ? out : loop;
}

const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
function inside(pt, poly) {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i], [xj, yj] = poly[j];
		if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
	}
	return c;
}
// outer loops one way, holes the other, so nonzero filling works
function orient(loops) {
	return loops.map((l, i) => {
		let depth = 0;
		for (let j = 0; j < loops.length; j++) if (j !== i && inside(l[0], loops[j])) depth++;
		const a = area(l);
		const want = depth % 2 === 0 ? 1 : -1;
		return Math.sign(a) === want ? l : l.slice().reverse();
	});
}
