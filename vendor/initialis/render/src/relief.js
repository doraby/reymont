// Fills that follow the shape they fill, worked out per pixel from the shape's mask:
//   contour    rings at even steps in from the edge: bronze-age lines inside a letter, raked gravel
//              in a ground (where the rings round the letter meet the rings in from the frame)
//   engrave    hatching over a dome raised on the shape, the lines swelling where it turns from the
//              light and bending over its top: a copperplate engraving of an inflated shape
//   halftone   a 45° dot screen over the same dome's shading: big dots in the shade, pinpricks in
//              the light
//   mosaic     opus vermiculatum: rows of tesserae following the outline inward, each row cut into
//              tiles (Voronoi cells of seeds along the row's middle), grout between
//   wash       watercolour as print can hold it: a granulating stipple, densest where the pigment
//              dried against the edge, with backruns (pale blooms with lacy dark fronts)
//   frost      fern frost: needles from scattered specks, bending with the glass's grain, barbs at
//              sixty degrees and barblets on the barbs, every tip stopping at ice or the edge
//   mycelium   threads from a few spores: wandering tips that branch behind themselves, turn aside
//              from the mat they've made and stop when they can't, the oldest the thickest
// (After wen's contour and engraving bodies, and galley's halftone, tessera, watercolour, rime and
// hyphae reveals, held still.)

import { edt, rng, makeNoise } from './util.js?v=a8136959';
import { blur, depth, shading } from './fill.js?v=a8136959';

// the middle of the shape where it's thin (a hairline, a serif, an arm): ridge pixels of its
// depth, about as deep as anything near them, as [x, y, half width]
function ridges(d, size, C, thin) {
	const M = maxFilter(d, size, Math.ceil(C * 2)), out = [];
	for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
		const i = y * size + x, v = d[i];
		if (v < 0.8 || v > thin || v < 0.72 * M[i]) continue;
		const ridge = (p, q) => v >= d[p] && v >= d[q] && (v > d[p] || v > d[q]);
		if (ridge(i - 1, i + 1) || ridge(i - size, i + size) || ridge(i - size - 1, i + size + 1) || ridge(i - size + 1, i + size - 1)) out.push([x, y, v]);
	}
	return out;
}

// the largest d within R of each pixel (van Herk's running blocks, rows then columns)
function maxFilter(d, size, R) {
	const n = size, wnd = 2 * R + 1, L = new Float32Array(n), Rm = new Float32Array(n), f = new Float32Array(n);
	const tmp = new Float32Array(d.length), out = new Float32Array(d.length);
	const pass = (src, dst, at) => {
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) f[i] = src[at(j, i)];
			for (let i = 0; i < n; i++) L[i] = i % wnd === 0 ? f[i] : Math.max(L[i - 1], f[i]);
			for (let i = n - 1; i >= 0; i--) Rm[i] = i === n - 1 || (i + 1) % wnd === 0 ? f[i] : Math.max(Rm[i + 1], f[i]);
			for (let i = 0; i < n; i++) dst[at(j, i)] = Math.max(Rm[Math.max(0, i - R)], L[Math.min(n - 1, i + R)]);
		}
	};
	pass(d, tmp, (j, i) => j * n + i);
	pass(tmp, out, (j, i) => i * n + j);
	return out;
}

// the way a stroke runs through (x, y): of sixteen directions, the one staying deepest inside
function along(d, size, x, y, len) {
	let best = 0, top = -1;
	for (let q = 0; q < 16; q++) {
		const ca = Math.cos(q * Math.PI / 16), sa = Math.sin(q * Math.PI / 16);
		let sum = 0;
		for (const sg of [1, -1]) for (let t = 1; t <= len; t++) {
			const px = Math.round(x + ca * t * sg), py = Math.round(y + sa * t * sg);
			if (px < 0 || py < 0 || px >= size || py >= size || d[py * size + px] <= 0) break;
			sum += d[py * size + px];
		}
		if (sum > top) { top = sum; best = q * Math.PI / 16; }
	}
	return best;
}

// points of pts (each [x, y, ...]), in a random order, kept gap apart
function spaced(pts, gap, r) {
	const order = pts.map((_, k) => k);
	for (let k = order.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [order[k], order[j]] = [order[j], order[k]]; }
	const G = new Map(), out = [], key = (x, y) => Math.floor(x / gap) + Math.floor(y / gap) * 65536;
	for (const k of order) {
		const [x, y] = pts[k];
		let near = false;
		for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1 && !near; i++) {
			for (const [qx, qy] of G.get(key(x + i * gap, y + j * gap)) || []) if ((qx - x) ** 2 + (qy - y) ** 2 < gap * gap) { near = true; break; }
		}
		if (near) continue;
		out.push(pts[k]);
		const kk = key(x, y);
		(G.get(kk) || G.set(kk, []).get(kk)).push(pts[k]);
	}
	return out;
}

// the shape's separate pieces (the dot of an i, a stray serif): the deepest pixel of each, its size
// in pixels, and which piece each pixel belongs to
function pieces(d, size) {
	const lab = new Int32Array(d.length).fill(-1), stack = new Int32Array(d.length), list = [];
	for (let i0 = 0; i0 < d.length; i0++) {
		if (d[i0] <= 0.8 || lab[i0] >= 0) continue;
		const id = list.length;
		let n = 0, deep = i0, top = 0;
		lab[i0] = id; stack[top++] = i0;
		while (top) {
			const i = stack[--top], x = i % size;
			n++;
			if (d[i] > d[deep]) deep = i;
			if (x > 0 && lab[i - 1] < 0 && d[i - 1] > 0.8) { lab[i - 1] = id; stack[top++] = i - 1; }
			if (x < size - 1 && lab[i + 1] < 0 && d[i + 1] > 0.8) { lab[i + 1] = id; stack[top++] = i + 1; }
			if (i >= size && lab[i - size] < 0 && d[i - size] > 0.8) { lab[i - size] = id; stack[top++] = i - size; }
			if (i + size < d.length && lab[i + size] < 0 && d[i + size] > 0.8) { lab[i + size] = id; stack[top++] = i + size; }
		}
		list.push({ deep, n });
	}
	return { lab, list };
}

// seeds for the pieces no seed fell in, at their deepest point
function orphans(d, size, C, seeded) {
	const { lab, list } = pieces(d, size), has = new Set(seeded.map(i => lab[i]));
	return list.filter((p, id) => !has.has(id) && p.n >= Math.max(6, C * C * 0.5)).map(p => p.deep);
}

// along each thin stroke the growth left bare, its middle as dots a needle wide; each comes in a
// little after the growth nearest it (late, if none came near)
export function spine(d, size, C, segs, rounds, px, wid) {
	const cell = Math.max(2, C * 2), G = Math.ceil(size / cell), near = new Float32Array(G * G).fill(Infinity);
	for (const [x0, y0, x1, y1, , at] of segs) for (const [qx, qy] of [[x0, y0], [x1, y1]]) {
		const k = Math.floor(qy / cell) * G + Math.floor(qx / cell);
		if (k >= 0 && k < near.length && at < near[k]) near[k] = at;
	}
	const out = [];
	for (const [x, y, v] of ridges(d, size, C, C * 3)) {
		// bare: no ink across the stroke here
		let bare = true;
		const R = Math.ceil(v);
		for (let j = -R; j <= R && bare; j++) for (let i = -R; i <= R; i++) {
			const xx = x + i, yy = y + j;
			if (i * i + j * j > v * v + 1 || xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
			if (px[(yy * size + xx) * 4 + 3] > 80) { bare = false; break; }
		}
		if (!bare) continue;
		let at = Infinity;
		const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
		for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
			const k = (gy + j) * G + gx + i;
			if (gx + i >= 0 && gy + j >= 0 && gx + i < G && gy + j < G) at = Math.min(at, near[k] + Math.hypot(i, j) * 2.2);
		}
		out.push([x + 0.5, y + 0.5, Math.max(0.55, Math.min(v * 0.6, wid * 0.5)), Math.min(rounds, at === Infinity ? rounds * 0.8 : at)]);
	}
	return out;
}

// rows of tiles following the outline inward: seeds along the middle of each row, kept a tile
// apart, and each pixel joins the nearest seed in its own row; grout where it's as near another
export function mosaic(a, put, size, tile, grout, seed) {
	const d = depth(a, size), r = rng(seed), G = Math.max(2, Math.ceil(size / tile));
	const hash = new Map(), seeds = [];
	const key = (x, y) => Math.floor(x / tile) + Math.floor(y / tile) * G;
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		const i = y * size + x;
		if (a[i] <= 0.5) continue;
		const t = d[i] / tile, row = Math.floor(t);
		if (Math.abs(t - row - 0.5) > 0.1) continue;
		let near = false;
		for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
			for (const s of hash.get(key(x + dx * tile, y + dy * tile)) || []) if (s.row === row && (s.x - x) ** 2 + (s.y - y) ** 2 < (tile * 0.9) ** 2) { near = true; break; }
		}
		if (near) continue;
		const s = { x: x + (r() - 0.5) * tile * 0.15, y: y + (r() - 0.5) * tile * 0.15, row, at: r() };
		seeds.push(s);
		const k = key(s.x, s.y);
		(hash.get(k) || hash.set(k, []).get(k)).push(s);
	}
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		const i = y * size + x;
		if (a[i] <= 0) continue;
		const t = d[i] / tile, row = Math.floor(t);
		let s1 = null, s2 = null, d1 = Infinity, d2 = Infinity;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			for (const s of hash.get(key(x + dx * tile, y + dy * tile)) || []) {
				if (s.row !== row) continue;
				const q = (s.x - x) ** 2 + (s.y - y) ** 2;
				if (q < d1) { d2 = d1; s2 = s1; d1 = q; s1 = s; } else if (q < d2) { d2 = q; s2 = s; }
			}
		}
		// distance to the border with the next tile along the row, and to the row's own edges
		let edge = tile;
		if (s1 && s2) edge = (d2 - d1) / (2 * Math.hypot(s2.x - s1.x, s2.y - s1.y));
		const rowEdge = row === 0 ? (t - row) * tile + grout : Math.min(t - row, row + 1 - t) * tile;
		// laid outer row first, the tiles of a row in a scatter
		put(i, Math.min(edge, rowEdge) - grout / 2 + 0.5, Math.min(0.62, row * 0.09) + (s1 ? s1.at : 0) * 0.33);
	}
}

// pigment density: an even wash, darker where it dried against the edge, pale backruns with dark
// lacy fronts, granulation; then stippled, since print holds ink or none
export function wash(a, put, size, sp, w, seed) {
	const d = depth(a, size), r = rng(seed), nz = makeNoise(seed), inside = [];
	for (let i = 0; i < a.length; i += 7) if (a[i] > 0.5) inside.push(i);
	const blooms = [];
	for (let k = 0, m = Math.min(7, 2 + Math.round(inside.length * 7 / (sp * sp * 260))); k < m && inside.length; k++) {
		const i = inside[(r() * inside.length) | 0];
		blooms.push({ x: i % size, y: (i / size) | 0, R: sp * (2.2 + r() * 3.2) });
	}
	// the stipple is fine (a pixel or so), so the density reads as tone; weight coarsens it
	const grain = Math.max(1, w * 0.35);
	// the brush touched down at two or three places; the wash spreads out from them, unevenly
	const touch = [];
	for (let k = 0; k < 3 && inside.length; k++) { const i = inside[(r() * inside.length) | 0]; touch.push([i % size, (i / size) | 0]); }
	let far = 1;
	const reach = (x, y) => Math.min(...touch.map(([tx, ty]) => Math.hypot(x - tx, y - ty))) * (1 + 0.35 * nz(x / sp * 0.4 + 9, y / sp * 0.4));
	for (const i of inside) far = Math.max(far, reach(i % size, (i / size) | 0));
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		const i = y * size + x;
		if (a[i] <= 0) continue;
		// an even, pale wash, the pigment dried dark in a band along the edge
		let D = 0.22 + 0.62 * Math.exp(-d[i] / Math.max(1.5, sp * 0.3)) + 0.12 * Math.exp(-d[i] / (sp * 1.6));
		for (const b of blooms) {
			const q = Math.hypot(x - b.x, y - b.y) * (1 + 0.3 * nz(x / sp * 0.5, y / sp * 0.5) + 0.08 * nz(x / sp * 2.2, y / sp * 2.2)) - b.R;
			// inside a backrun the wash is pushed out pale; its front is a frilly dark line
			if (q < 0) D -= 0.16 * Math.min(1, -q / (sp * 0.6));
			D += 0.55 * Math.exp(-((q / Math.max(1, sp * 0.14)) ** 2));
		}
		// granulation: pigment settling in the paper's tooth, in soft patches
		D += 0.1 * nz(x / (sp * 0.8), y / (sp * 0.8)) + 0.06 * nz(x / (grain * 2) + 50, y / (grain * 2));
		const h = Math.sin(Math.floor(x / grain) * 127.1 + Math.floor(y / grain) * 311.7 + seed) * 43758.5453;
		put(i, D > h - Math.floor(h) ? 1 : 0, 0.92 * Math.min(1, reach(x, y) / far));
	}
}

// fern frost (galley's rime, still): an occupancy grid; needles bend with a noise grain, sprout
// barbs at about sixty degrees behind their tips, barbs sprout barblets; a tip stops at ice
// that isn't its own or at the edge, except in a thin stroke, where a needle turns to follow it.
// Thin strokes get specks of their own, laid along them, and every piece of the shape one; later
// specks fill what's left, next to the ice. Each segment keeps the round it grew in.
export function frost(d, size, sp, C, seed) {
	const r = rng(seed), nz = makeNoise(seed), GX = Math.ceil(size / C), thin = C * 3;
	const occ = new Int32Array(GX * GX).fill(-1), occAt = new Int32Array(GX * GX), segs = [];
	const cellOf = (x, y) => { const i = Math.floor(x / C), j = Math.floor(y / C); return i < 0 || j < 0 || i >= GX || j >= GX ? -1 : j * GX + i; };
	const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && d[(y | 0) * size + (x | 0)] > 0.8;
	const depthAt = (x, y) => inside(x, y) ? d[(y | 0) * size + (x | 0)] : 0;
	const grain = (x, y) => nz(x / size * 2.4, y / size * 2.4) * Math.PI * 1.3;
	const wrap = t => Math.atan2(Math.sin(t), Math.cos(t));
	const GEN = [{ step: 1, every: 1.7, angle: 1.0, max: 1e9 }, { step: 0.6, every: 1.3, angle: 0.95, max: 9 }, { step: 0.4, every: 0, angle: 0, max: 2.2 }];
	const spots = [];
	for (let i = 0; i < d.length; i += 3) if (d[i] > 1.5) spots.push(i);
	const area = spots.length * 3, seeds = [];
	for (let k = 0, m = Math.max(2, Math.round(area / (sp * sp * 90))); k < m && spots.length; k++) seeds.push({ i: spots[(r() * spots.length) | 0], t: r() * 30, arms: 3 + ((r() * 3) | 0) });
	for (const i of orphans(d, size, C, seeds.map(sd => sd.i))) seeds.push({ i, t: r() * 30, arms: 3, thin: d[i] <= thin });
	for (const [x, y] of spaced(ridges(d, size, C, thin), C * 4, r)) seeds.push({ i: y * size + x, t: 6 + r() * 60, arms: 2, thin: true });
	for (let k = 0, m = Math.round(area / (sp * sp * 9)); k < m && spots.length; k++) seeds.push({ i: spots[(r() * spots.length) | 0], t: 25 + r() * 80, arms: 2 + ((r() * 2) | 0), late: true, reach: sp * (3 + r() * 6) });
	seeds.sort((p, q) => p.t - q.t);
	const tips = [];
	let ids = 0, s = 0, round = 0;
	const free = (x, y) => { const i0 = Math.floor(x / C), j0 = Math.floor(y / C); for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) if (i >= 0 && j >= 0 && i < GX && j < GX && occ[j * GX + i] >= 0) return false; return true; };
	const nearIce = (x, y) => { for (let q = 0; q < 8; q++) { const c = cellOf(x + Math.cos(q * 0.785) * C * 4, y + Math.sin(q * 0.785) * C * 4); if (c >= 0 && occ[c] >= 0) return true; } return false; };
	const claim = (c, id) => { if (c >= 0 && occ[c] < 0) { occ[c] = id; occAt[c] = round; } };
	const cut = (tp) => segs.push([tp.sx, tp.sy, tp.x, tp.y, tp.gen, round]);
	for (; round < 400 && (s < seeds.length || tips.length); round++) {
		while (s < seeds.length && seeds[s].t <= round) {
			const sd = seeds[s++], x = sd.i % size, y = (sd.i / size) | 0;
			// a late speck far from any ice waits, unless it's very late
			if (!free(x, y) || (sd.late && sd.t < 90 && !nearIce(x, y))) continue;
			const id = ids++;
			// in a thin stroke, the arms go both ways along it
			const a0 = sd.thin ? along(d, size, x, y, Math.ceil(thin)) : r() * Math.PI * 2;
			for (let j = 0; j < sd.arms; j++) {
				let ang = a0 + j * 2 * Math.PI / sd.arms + (r() - 0.5) * (sd.thin ? 0.15 : 0.8);
				if (!sd.thin) ang += Math.max(-0.8, Math.min(0.8, wrap(grain(x, y) - ang))) * 0.35;
				tips.push({ x, y, sx: x, sy: y, a: ang, gen: 0, id, len: 0, next: C * (1.2 + r()), curv: sd.thin ? 0 : (r() - 0.5) * 0.03, max: sd.reach || 1e9, side: 1 });
			}
			claim(cellOf(x, y), id);
		}
		for (let k = tips.length - 1; k >= 0; k--) {
			const tp = tips[k], G = GEN[tp.gen], st = G.step * C * 0.9;
			if (tp.gen === 0) tp.a += tp.curv + wrap(grain(tp.x, tp.y) - tp.a) * 0.01 + (r() - 0.5) * 0.03;
			else tp.a += (r() - 0.5) * 0.04;
			let nx = tp.x + Math.cos(tp.a) * st, ny = tp.y + Math.sin(tp.a) * st;
			if (tp.gen === 0 && !inside(nx, ny) && depthAt(tp.x, tp.y) <= thin) {
				// a needle in a thin stroke turns to keep to its middle
				let best = -1, ba = tp.a;
				for (const turn of [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.25, -1.25]) {
					const v = depthAt(tp.x + Math.cos(tp.a + turn) * st, tp.y + Math.sin(tp.a + turn) * st);
					if (v > best + 0.3) { best = v; ba = tp.a + turn; }
				}
				if (best > 0) { tp.a = ba; nx = tp.x + Math.cos(ba) * st; ny = tp.y + Math.sin(ba) * st; }
			}
			const c0 = cellOf(tp.x, tp.y), c1 = cellOf(nx, ny);
			const stop = !inside(nx, ny) || tp.len + st > Math.min(tp.max, G.max * sp) || c1 < 0 ||
				(c1 !== c0 && occ[c1] >= 0 && (occ[c1] !== tp.id || round - occAt[c1] > 10));
			if (stop) { if (tp.x !== tp.sx || tp.y !== tp.sy) cut(tp); tips[k] = tips[tips.length - 1]; tips.pop(); continue; }
			claim(c1, tp.id);
			tp.x = nx; tp.y = ny; tp.len += st;
			if (Math.hypot(tp.x - tp.sx, tp.y - tp.sy) > C * 1.5) { cut(tp); tp.sx = tp.x; tp.sy = tp.y; }
			if (tp.gen < 2 && tp.len >= tp.next) {
				tp.next += G.every * C * (0.8 + 0.4 * r());
				for (const sd of tp.gen === 0 ? [1, -1] : [tp.side = -tp.side]) {
					if (tp.gen === 1 && r() < 0.35) continue;
					tips.push({ x: tp.x, y: tp.y, sx: tp.x, sy: tp.y, a: tp.a + sd * (G.angle + (r() - 0.5) * 0.12), gen: tp.gen + 1, id: tp.id, len: 0, next: C * 0.9, curv: 0, max: 1e9, side: sd });
				}
			}
		}
	}
	for (const tp of tips) cut(tp);
	return { segs, rounds: Math.max(1, round) };
}

// mycelium (galley's hyphae, still): a few spores; each tip wanders forward, turns aside from mat
// that isn't its own trail, stops when it can't, and branches behind itself; gen is how many
// branchings deep a thread is (the first ones are the cords). Every piece of the shape gets a
// spore, and thin strokes the threads haven't reached get spores along them, late.
export function mycelium(d, size, sp, C, seed) {
	const r = rng(seed), nz = makeNoise(seed + 7), GX = Math.ceil(size / C), thin = C * 3;
	const occ = new Int32Array(GX * GX).fill(-1), segs = [];
	const cellOf = (x, y) => { const i = Math.floor(x / C), j = Math.floor(y / C); return i < 0 || j < 0 || i >= GX || j >= GX ? -1 : j * GX + i; };
	const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && d[(y | 0) * size + (x | 0)] > 0.8;
	const free = (x, y) => { const i0 = Math.floor(x / C), j0 = Math.floor(y / C); for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) if (i >= 0 && j >= 0 && i < GX && j < GX && occ[j * GX + i] >= 0) return false; return true; };
	const spots = [];
	for (let i = 0; i < d.length; i += 3) if (d[i] > 1.5) spots.push(i);
	const spores = [];
	for (let k = 0, m = Math.max(2, Math.round(spots.length * 3 / (sp * sp * 260))); k < m && spots.length; k++) spores.push({ i: spots[(r() * spots.length) | 0], t: r() * 8, n: 3 });
	for (const i of orphans(d, size, C, spores.map(p => p.i))) spores.push({ i, t: r() * 8, n: 3 });
	for (const [x, y] of spaced(ridges(d, size, C, thin), C * 6, r)) spores.push({ i: y * size + x, t: 15 + r() * 150, n: 2, thin: true });
	spores.sort((p, q) => p.t - q.t);
	const tips = [];
	let ids = 0, s = 0, round = 0;
	const cut = (tp) => segs.push([tp.sx, tp.sy, tp.x, tp.y, tp.gen, round]);
	const ok = (x, y, tp) => { if (!inside(x, y)) return false; const c = cellOf(x, y); return c >= 0 && (occ[c] < 0 || occ[c] === tp.id || occ[c] === tp.parent); };
	for (; round < 1200 && (s < spores.length || tips.length); round++) {
		while (s < spores.length && spores[s].t <= round) {
			const sp0 = spores[s++], x = sp0.i % size, y = (sp0.i / size) | 0;
			if (sp0.thin && !free(x, y)) continue;
			const a0 = sp0.thin ? along(d, size, x, y, Math.ceil(thin)) : r() * Math.PI * 2;
			for (let j = 0; j < sp0.n; j++) tips.push({ x, y, sx: x, sy: y, a: a0 + j * 2 * Math.PI / sp0.n, gen: 0, id: ids++, len: 0, next: sp * (1.5 + r() * 2) });
		}
		for (let k = tips.length - 1; k >= 0; k--) {
			const tp = tips[k], st = C * 0.8;
			tp.a += 0.18 * nz(tp.x / sp * 0.35, tp.y / sp * 0.35 + tp.id) + (r() - 0.5) * 0.25;
			let moved = false;
			for (const turn of [0, 0.35, -0.35, 0.75, -0.75, 1.2, -1.2]) {
				const a = tp.a + turn, nx = tp.x + Math.cos(a) * st, ny = tp.y + Math.sin(a) * st;
				if (!ok(nx, ny, tp)) continue;
				tp.a = a; tp.x = nx; tp.y = ny; tp.len += st; moved = true;
				break;
			}
			if (!moved || tips.length > 4000) { if (tp.x !== tp.sx || tp.y !== tp.sy) cut(tp); tips[k] = tips[tips.length - 1]; tips.pop(); continue; }
			const c = cellOf(tp.x, tp.y); if (occ[c] < 0) occ[c] = tp.id;
			if (Math.hypot(tp.x - tp.sx, tp.y - tp.sy) > C * 1.4) { cut(tp); tp.sx = tp.x; tp.sy = tp.y; }
			if (tp.len >= tp.next && tp.gen < 9) {
				tp.next += sp * (1.6 + r() * 2.6);
				const sd = r() < 0.5 ? 1 : -1;
				tips.push({ x: tp.x, y: tp.y, sx: tp.x, sy: tp.y, a: tp.a + sd * (0.5 + r() * 0.5), gen: tp.gen + 1, id: ids++, parent: tp.id, len: 0, next: sp * (1.6 + r() * 2.6) });
			}
		}
	}
	for (const tp of tips) cut(tp);
	return { segs, rounds: Math.max(1, round) };
}
