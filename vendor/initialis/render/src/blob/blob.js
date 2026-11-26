// Blown-up letters, the way among-blob, bao and wen make them. The glyph's strokes (latin.js) become
// particles along their centrelines (sim.js) that start as a thin skeleton where the letter stands
// and inflate inside the frame like a balloon in a box: they press flat against its walls and
// against each other, keeping a gap between strokes that don't touch and holding counters open.
// The settled capsules fold into one outline, strokes of a part by an angle-aware smooth union
// (wen's fillet) and parts by a hard one, and that outline is the letter.

import { Sim } from './sim.js?v=a8136959';
import { R } from './raster.js?v=a8136959';
import { analysedMask } from './latin.js?v=a8136959';
import { edt } from '../util.js?v=a8136959';
import { march } from '../outline.js?v=a8136959';

const R0 = 30;      // rest stroke radius, em units (bao's 1024 em)
const WEN_PX = 0.42; // wen's natural scale, px per em unit: its gaps and floors are tuned there
const U = 1024 / R;  // em units per raster px

// a polygon's signed distance on a grid (negative inside), sampled smoothly, with its gradient
function wallField(poly, cell) {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	const m = 6, ox = x0 - m * cell, oy = y0 - m * cell;
	const w = Math.ceil((x1 - x0) / cell) + 2 * m, h = Math.ceil((y1 - y0) / cell) + 2 * m;
	const cv = new OffscreenCanvas(w, h), c = cv.getContext('2d', { willReadFrequently: true });
	c.beginPath();
	poly.forEach(([x, y], i) => i ? c.lineTo((x - ox) / cell, (y - oy) / cell) : c.moveTo((x - ox) / cell, (y - oy) / cell));
	c.closePath();
	c.fill();
	const a = c.getImageData(0, 0, w, h).data;
	const fin = new Float64Array(w * h), fout = new Float64Array(w * h);
	for (let i = 0; i < w * h; i++) { const inside = a[i * 4 + 3] > 127; fin[i] = inside ? 1e20 : 0; fout[i] = inside ? 0 : 1e20; }
	edt(fin, w, h); edt(fout, w, h);
	const d = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) d[i] = (Math.sqrt(fout[i]) - Math.sqrt(fin[i])) * cell;
	const at = (x, y) => {
		const fx = Math.min(w - 1.001, Math.max(0, (x - ox) / cell)), fy = Math.min(h - 1.001, Math.max(0, (y - oy) / cell));
		const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * w + i;
		return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + w] * (1 - u) + d[k + w + 1] * u) * v;
	};
	return {
		sd: at,
		grad(x, y) {
			const gx = at(x + cell, y) - at(x - cell, y), gy = at(x, y + cell) - at(x, y - cell), l = Math.hypot(gx, gy) || 1;
			return [gx / l, gy / l];
		},
		box: { x0, y0, x1, y1 },
	};
}

// cells in a field share a few frame shapes, so each shape's field is worked out once
const wallsCache = new Map();
function wallsFor(poly, cell) {
	const key = cell + ':' + poly.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
	let w = wallsCache.get(key);
	if (!w) {
		w = wallField(poly, cell);
		wallsCache.set(key, w);
		if (wallsCache.size > 24) wallsCache.delete(wallsCache.keys().next().value);
	}
	return w;
}

// bao's sim with the frame for walls: a disc poking past it is pushed back along the gradient,
// partly, and thinned by the rest (wen's WallSim)
class WallSim extends Sim {
	wallAt(S, x, y) { return S.sd(x, y) + this.pad; }
	solveWalls(S, P) {
		const { n, x, y, r } = this, a = P.wallPush, rMin = P.rMin;
		for (let i = 0; i < n; i++) {
			const o = this.wallAt(S, x[i], y[i]) + r[i];
			if (o <= 0) continue;
			const [gx, gy] = S.grad(x[i], y[i]);
			x[i] -= gx * o * a;
			y[i] -= gy * o * a;
			r[i] = Math.max(rMin, r[i] - o * (1 - a));
		}
	}
	clampToBox(S, P) {
		const { n, x, y, r } = this, m = P.rMin;
		for (let i = 0; i < n; i++) {
			let d = this.wallAt(S, x[i], y[i]);
			if (d > -m) {
				const [gx, gy] = S.grad(x[i], y[i]);
				x[i] -= gx * (d + m);
				y[i] -= gy * (d + m);
				d = this.wallAt(S, x[i], y[i]);
			}
			r[i] = Math.max(m * 0.5, Math.min(r[i], -d));
		}
	}
}

// The same glyph (same face and letter, any size or place) is analysed once, and only what the sim
// reads of it is kept. New ones wait in `traced` under their glyph's name for the worker to store
// (store.js), which also hands back ones traced before, by any worker, with `known`.
const analysedCache = new Map();
export const traced = [];
const slim = H => H && H.n ? {
	n: H.n, nComps: H.nComps, nx: H.nx, ny: H.ny, nComp: H.nComp, nStroke: H.nStroke, ties: H.ties, rel: H.rel,
	strokes: H.strokes.map(S => ({ start: S.start, count: S.count, comp: S.comp })),
} : null;
function remember(key, H) {
	analysedCache.set(key, H);
	if (analysedCache.size > 160) analysedCache.delete(analysedCache.keys().next().value);
}
export function known(key, H) { if (!analysedCache.has(key)) remember(key, H); }

// contours: the letter as placed (scene units); room: the polygon it inflates inside.
// M: { inflate, weight, part, counter, fillet, pad, glyph }. Returns the blown-up outline, or null
// when the glyph has no strokes to follow.
export function blobLetter(contours, room, M, res = 1) {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	if (!isFinite(x0)) return null;
	// the glyph on bao's grid, about as big as wen draws its letters
	const s = 0.72 * R / Math.max(x1 - x0, y1 - y0), ox = R / 2 - (x0 + x1) / 2 * s, oy = R / 2 - (y0 + y1) / 2 * s;
	const cv = new OffscreenCanvas(R, R), c = cv.getContext('2d', { willReadFrequently: true });
	c.beginPath();
	for (const ct of contours) ct.forEach(([x, y], i) => i ? c.lineTo(x * s + ox, y * s + oy) : c.moveTo(x * s + ox, y * s + oy));
	c.fill('nonzero');
	const img = c.getImageData(0, 0, R, R).data, mask = new Uint8Array(R * R);
	let any = 0;
	for (let i = 0; i < R * R; i++) if (img[i * 4 + 3] >= 128) { mask[i] = 1; any++; }
	if (!any) return null;
	let key = 0;
	for (let i = 0; i < mask.length; i++) key = (Math.imul(key, 31) + (mask[i] ? i : 0)) | 0;
	let H = analysedCache.get(key);
	if (H === undefined) {
		try { H = slim(analysedMask(mask)); } catch { H = null; }
		remember(key, H);
		if (M.glyph) traced.push([M.glyph, key, H]);
	}
	if (!H) return null;

	// scene units per em unit, and per wen px
	const uL = 1 / (U * s), f = uL / WEN_PX;
	const walls = wallsFor(room, Math.max(2, res * 3));
	const sim = new WallSim();
	sim.pad = M.pad;
	sim.build([{ H, ox: 0, oy: 0, bw: 1, bh: 1 }]);
	const g = 2.5 * f;
	const L = sim.letters[0];
	L.rBase = R0 * M.weight * uL;
	L.gIn = Math.max(g, M.counter * uL);
	L.gPart = Math.max(g, M.part * uL);
	L.pressure = M.inflate;
	// raster px = scene · s + o, and the strokes come in em units (px · U)
	L.xf = { x0: -ox / s, y0: -oy / s, sx: uL, sy: uL };
	const P = { gap: g, wobble: 0, stiffness: 320, damping: 0.86, grow: 0.12, push: 0.4, wallPush: 0.25, rMin: 0.9 * f, iterations: 6 };
	sim.reset(true);
	// it blows up within about forty steps and is still by sixty or seventy: it stops once nothing
	// moves and the strokes have stopped swelling
	for (let k = 0, was = 0; k < 160; k++) {
		sim.step(1 / 60, P, walls, k / 60, null);
		if (k % 10 !== 9) continue;
		let moving = 0, size = 0;
		for (let i = 0; i < sim.n; i++) { moving = Math.max(moving, Math.abs(sim.x[i] - sim.px[i]) + Math.abs(sim.y[i] - sim.py[i])); size += sim.r[i]; }
		if (k >= 39 && moving < 0.01 * f && Math.abs(size - was) < 0.002 * size) break;
		was = size;
	}
	return fold(sim, M.fillet, walls.box, Math.max(1.5, res * 3));
}

// the capsules as one outline: per point, strokes of a part by an angle-aware smooth union, parts
// by a hard min (wen's blobAt), on a grid binned so each point only looks at capsules near it. A
// coarse pass first; the fine grid only works out the points near the edge and takes the rest
// from the coarse one, whose sign is all the marching needs there.
function fold(sim, fillet, box, cell) {
	const { segs, nSegs } = sim.pack(), M4 = segs.length / 2;
	let maxR = 1;
	for (let k = 0; k < nSegs; k++) maxR = Math.max(maxR, segs[M4 + k * 4], segs[M4 + k * 4 + 1]);
	const ox = box.x0 - 2 * cell, oy = box.y0 - 2 * cell;
	const w = Math.ceil((box.x1 - box.x0) / cell) + 4, h = Math.ceil((box.y1 - box.y0) / cell) + 4;
	const B = Math.max(8, maxR), bw = Math.ceil(w * cell / B) + 1, bh = Math.ceil(h * cell / B) + 1;
	const bins = Array.from({ length: bw * bh }, () => []);
	const reach = maxR * (1 + fillet) + 2 * cell;
	for (let k = 0; k < nSegs; k++) {
		const o = k * 4, ax = segs[o], ay = segs[o + 1], bx = segs[o + 2], by = segs[o + 3];
		const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - ox) / B)), i1 = Math.min(bw - 1, Math.floor((Math.max(ax, bx) + reach - ox) / B));
		const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - oy) / B)), j1 = Math.min(bh - 1, Math.floor((Math.max(ay, by) + reach - oy) / B));
		for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bins[j * bw + i].push(k);
	}
	// fold state: d, dl, rl, ds, rs, ga (x, y), gq (x, y)
	const F = new Float64Array(9);
	const foldStroke = () => {
		const l = Math.hypot(F[7], F[8]) || 1e-4, gsx = F[7] / l, gsy = F[8] / l;
		if (F[1] > 1e4) { F[1] = F[3]; F[5] = gsx; F[6] = gsy; F[2] = F[4]; return; }
		let k = fillet * Math.min(F[2], F[4]);
		const e = Math.min(1, Math.max(0, (F[5] * gsx + F[6] * gsy + 0.9) / 0.7));
		k *= e * e * (3 - 2 * e);
		const a = F[1], b = F[3];
		let nd = Math.min(a, b);
		if (k >= 1e-3) { const q = Math.max(k - Math.abs(a - b), 0) / k; nd -= q * q * k * 0.25; }
		if (b < a) { F[5] = gsx; F[6] = gsy; F[2] = F[4]; }
		F[1] = nd;
	};
	const at = (px, py) => {
		const list = bins[Math.min(bh - 1, Math.max(0, ((py - oy) / B) | 0)) * bw + Math.min(bw - 1, Math.max(0, ((px - ox) / B) | 0))];
		let comp = -1, stroke = -1;
		F[0] = 1e5; F[1] = 1e5; F[2] = 0; F[3] = 1e5; F[4] = 0; F[5] = 1; F[6] = 0; F[7] = 1; F[8] = 0;
		for (let n = 0; n < list.length; n++) {
			const k = list[n], o = k * 4, cp = segs[M4 + o + 2], st = segs[M4 + o + 3];
			if (st !== stroke) {
				if (stroke >= 0) foldStroke();
				if (cp !== comp) { if (comp >= 0) F[0] = Math.min(F[0], F[1]); F[1] = 1e5; comp = cp; }
				stroke = st;
				F[3] = 1e5;
			}
			const ax = segs[o], ay = segs[o + 1], bax = segs[o + 2] - ax, bay = segs[o + 3] - ay;
			const pax = px - ax, pay = py - ay;
			const t = Math.min(1, Math.max(0, (pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-6)));
			const qx = pax - bax * t, qy = pay - bay * t, r = segs[M4 + o] + (segs[M4 + o + 1] - segs[M4 + o]) * t;
			const dd = Math.hypot(qx, qy) - r;
			if (dd < F[3]) { F[3] = dd; F[7] = qx; F[8] = qy; F[4] = r; }
		}
		if (stroke >= 0) { foldStroke(); F[0] = Math.min(F[0], F[1]); }
		return F[0];
	};
	const C = 4, cw = Math.ceil(w / C) + 1, ch = Math.ceil(h / C) + 1, coarse = new Float32Array(cw * ch);
	for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) coarse[j * cw + i] = at(ox + i * C * cell, oy + j * C * cell);
	const v = new Float32Array(w * h), band = 1.6 * C * cell;
	for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
		const I = Math.min(cw - 2, (i / C) | 0), J = Math.min(ch - 2, (j / C) | 0), u = i / C - I, q = j / C - J, k = J * cw + I;
		const est = (coarse[k] * (1 - u) + coarse[k + 1] * u) * (1 - q) + (coarse[k + cw] * (1 - u) + coarse[k + cw + 1] * u) * q;
		v[j * w + i] = -(Math.abs(est) > band ? est : at(ox + i * cell, oy + j * cell));
	}
	return march(v, w, h, 0).map(l => l.map(([x, y]) => [ox + x * cell, oy + y * cell]));
}
