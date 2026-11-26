// Texture: marks grown into whatever space is left after the letter, frame and ornament.
// Everything reads one distance field (how far each spot is from the nearest thing), so the
// texture keeps the same even gap the ornament keeps, and can grade with distance.
//   stipple  dots (or rings, crosses, stars, dashes) on a jittered grid, sized by distance
//   bubbles  circles packed biggest-first into the gaps
//   ripples  contour lines of the distance field: rings around everything
//   streams  evenly spaced flow lines that run along those contours
//   fur      short strokes radiating away from every edge
//   cells    Voronoi pebbles / shards / outlines
//   truchet  quarter-circle tiles (or 10 PRINT diagonals, or triangles)
//   coral    reaction–diffusion, grown on the GPU (see ink.js); here we only make its mask

import { edt, rng, clamp, lerp, TAU, offsetPolygon } from './util.js?v=a8136959';
import { kind as kindOf } from './kinds.js?v=a8136959';
import { BY_KEY } from './params.js?v=a8136959';

// each kind is a module of its own (kinds/texture/<name>.js); this sets up what they grow with
export const TEXTURES = BY_KEY.tKind.spec;

// exact distance from everything already placed (the field's zero cells), uncapped
export function distanceMap(field, useBase) {
	const { nx, ny, cell } = field;
	const src = useBase ? field.base : field.d;
	const f = new Float64Array(nx * ny);
	for (let i = 0; i < f.length; i++) f[i] = src[i] <= cell * 0.35 ? 0 : 1e20;
	edt(f, nx, ny);
	const d = new Float32Array(nx * ny);
	for (let i = 0; i < f.length; i++) d[i] = Math.sqrt(f[i]) * cell;
	return { d, nx, ny, cell };
}

function sampler(map) {
	const { d, nx, ny, cell } = map;
	const at = (x, y) => {
		const gx = x / cell, gy = y / cell;
		if (gx < 0 || gy < 0 || gx >= nx - 1 || gy >= ny - 1) return 0;
		const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * nx + i;
		return (d[k] + (d[k + 1] - d[k]) * fx) * (1 - fy) + (d[k + nx] + (d[k + nx + 1] - d[k + nx]) * fx) * fy;
	};
	const grad = (x, y) => {
		const e = cell;
		const gx = at(x + e, y) - at(x - e, y), gy = at(x, y + e) - at(x, y - e);
		const l = Math.hypot(gx, gy) || 1;
		return [gx / l, gy / l];
	};
	return { at, grad };
}

// iso-lines of a grid at a level, as polylines in units (marching squares, linked)
export function contour(map, level) {
	const { d, nx, ny, cell } = map;
	const key = (i, j, h) => ((j * nx + i) << 1) | h;
	const pt = new Map();
	const P = (id) => {
		let p = pt.get(id);
		if (p) return p;
		const h = id & 1, k = id >> 1, i = k % nx, j = (k / nx) | 0;
		const a = d[k], b = h ? d[k + nx] : d[k + 1];
		const t = (level - a) / (b - a);
		p = h ? [i * cell, (j + t) * cell] : [(i + t) * cell, j * cell];
		pt.set(id, p);
		return p;
	};
	const link = new Map();
	const add = (a, b) => { (link.get(a) || link.set(a, []).get(a)).push(b); (link.get(b) || link.set(b, []).get(b)).push(a); };
	for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
		const k = j * nx + i;
		const a = d[k] > level, b = d[k + 1] > level, c = d[k + nx + 1] > level, e = d[k + nx] > level;
		const cs = (a << 3) | (b << 2) | (c << 1) | e;
		if (cs === 0 || cs === 15) continue;
		const T = key(i, j, 0), L = key(i, j, 1), B = key(i, j + 1, 0), R = key(i + 1, j, 1);
		switch (cs) {
			case 1: case 14: add(L, B); break;
			case 2: case 13: add(B, R); break;
			case 3: case 12: add(L, R); break;
			case 4: case 11: add(T, R); break;
			case 6: case 9: add(T, B); break;
			case 7: case 8: add(T, L); break;
			case 5: case 10: add(T, R); add(L, B); break;
		}
	}
	const used = new Set(), out = [];
	const walk = (start) => {
		const line = [P(start)];
		used.add(start);
		let cur = start;
		for (;;) {
			const nxt = link.get(cur).find(q => !used.has(q));
			if (nxt === undefined) break;
			used.add(nxt); line.push(P(nxt)); cur = nxt;
		}
		return line;
	};
	// open lines from their ends first, then the closed loops
	for (const [k, nb] of link) if (nb.length === 1 && !used.has(k)) { const l = walk(k); if (l.length > 1) out.push(l); }
	for (const k of link.keys()) if (!used.has(k)) { const l = walk(k); if (l.length > 3) { l.push(l[0]); out.push(l); } }
	return out;
}

function clipRuns(pts, ok) {
	const out = [];
	let cur = [];
	for (const p of pts) {
		if (ok(p)) cur.push(p);
		else { if (cur.length > 1) out.push(cur); cur = []; }
	}
	if (cur.length > 1) out.push(cur);
	return out;
}

function star(x, y, r, n, inner, rot) {
	const p = [];
	for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU, q = i % 2 ? r * inner : r; p.push([x + Math.cos(a) * q, y + Math.sin(a) * q]); }
	return p;
}
function circle(x, y, r) {
	const n = clamp(Math.round(r * 1.4), 8, 40), p = [];
	for (let i = 0; i < n; i++) { const a = i / n * TAU; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
	return p;
}

// o: { kind, scale, size, gap, grade, shape, style, twist, seed, falloff }
export function growTexture(field, map, o, noise) {
	const R = rng(o.seed);
	const { at, grad } = sampler(map);
	const out = { polys: [], lines: [], dots: [], rings: [], strokes: [], kind: o.kind };
	const s = Math.max(2, o.scale), gap = o.gap;
	const W = field.W, H = field.H;
	const falloff = o.falloff || s * 7;
	// how big a mark is at distance c: grade > 0 grows away from things, < 0 shrinks away
	const sizeAt = (c) => {
		const t = clamp((c - gap) / falloff, 0, 1);
		return o.grade >= 0 ? lerp(1 - o.grade, 1, t) : lerp(1, 1 + o.grade, t);
	};
	const flowDir = (x, y) => {
		const [gx, gy] = grad(x, y);
		return Math.atan2(gy, gx) + Math.PI / 2 + o.twist * noise(x / (s * 9), y / (s * 9)) * Math.PI;
	};

	const m = kindOf('texture', o.kind);
	if (m) m.grow({ field, map, o, settings: o.settings || {}, noise, R, at, grad, out, s, gap, W, H, falloff, sizeAt, flowDir, star, circle, clipRuns, contour, offsetPolygon, clamp, lerp, TAU });
	return out;
}
