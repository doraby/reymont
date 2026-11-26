// Scene building (geometry: letter layout, frame, the grown ornament) and painting it into an
// ink-coverage canvas: red = ink A, green = ink B, blue = ink C, black = bare paper.
// Painting is the painter's algorithm, so "paper" is just another colour that knocks out.

import { Field } from './field.js?v=a8136959';
import { grow, stemPoly, stemDetail, ornSizes } from './ornament.js?v=a8136959';
import { frameGeometry, bandGeometry, cornerGeometry } from './frame.js?v=a8136959';
import { patternGeometry, SHAPE_FILLS } from './patterns.js?v=a8136959';
import { makeFill } from './fill.js?v=a8136959';
import { growTexture, distanceMap } from './texture.js?v=a8136959';
import { glyphs } from './fonts.js?v=a8136959';
import { hasOverlaps, unionContours, inflateContours } from './outline.js?v=a8136959';
import { rng, hash, makeNoise, bbox, resample, signedArea, edt, clamp, lerp, offsetPolygon, TAU } from './util.js?v=a8136959';

export const W = 1000, H = 1000;

// blown-up letters are a big module few initials use: loadBlob() before drawing one
let blobLetter = null;
export async function loadBlob() { blobLetter = blobLetter || (await import('./blob/blob.js?v=a8136959')).blobLetter; }
const D2R = Math.PI / 180;

function canvas(w, h) {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
	const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function plainPath(polys, closed = true) {
	const p = new Path2D();
	for (const poly of polys) {
		if (!poly || poly.length < 2) continue;
		p.moveTo(poly[0][0], poly[0][1]);
		for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0], poly[i][1]);
		if (closed) p.closePath();
	}
	return p;
}

function rasterMask(nx, ny, cell, draw) {
	const c = canvas(nx, ny);
	const x = c.getContext('2d', { willReadFrequently: true });
	x.setTransform(1 / cell, 0, 0, 1 / cell, 0.5, 0.5);
	x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.lineCap = 'round';
	draw(x);
	const d = x.getImageData(0, 0, nx, ny).data;
	const m = new Uint8Array(nx * ny);
	for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
	return m;
}

// distance (units) from every cell to the nearest cell where mask == v
function distTo(mask, v, nx, ny, cell) {
	const f = new Float64Array(nx * ny);
	for (let i = 0; i < f.length; i++) f[i] = mask[i] === v ? 0 : 1e20;
	edt(f, nx, ny);
	const out = new Float32Array(nx * ny);
	for (let i = 0; i < f.length; i++) out[i] = Math.sqrt(f[i]) * cell;
	return out;
}

const capCache = new WeakMap();
function capHeight(font) {
	if (capCache.has(font)) return capCache.get(font);
	let h = 700;
	for (const ch of ['H', 'E', 'I']) {
		const g = glyphs(font, ch)[0];
		if (!g.missing) { h = bbox(g.contours).h; break; }
	}
	capCache.set(font, h);
	return h;
}

function layoutLetter(P, font, fb, initials, res, room = null) {
	const text = [...(P.text || 'A')].slice(0, 3).join('');
	const gs = glyphs(font, text);
	const parts = [];
	let x = 0, y = 0, missing = false;
	for (const g of gs) {
		if (g.missing) { missing = true; continue; }
		const b = bbox(g.contours);
		const dx = x - b.x0, dy = y;
		parts.push(g.contours.map(c => c.map(([a, q]) => [a + dx, q + dy])));
		if (P.lLayout === 'stack') { x += b.w * (0.45 + P.tracking); y += b.h * (0.32 + P.tracking * 0.5); }
		else x += b.w + P.tracking * 1000;
	}
	const all = parts.flat();
	if (!all.length) return { contours: [], parts: [], missing: true };
	const b = bbox(all);
	const box = { w: fb.w, h: fb.h };
	let s;
	if (initials) s = P.size * 1.08 * Math.min(box.w / b.w, box.h / b.h);
	else s = Math.min(P.size * box.h / Math.max(capHeight(font), b.h * 0.6), P.size * 1.15 * box.w / b.w, 1.6 * box.h / b.h);
	const cx = fb.x0 + fb.w / 2 + P.dx * fb.w, cy = fb.y0 + fb.h / 2 + P.dy * fb.h;
	const bx = (b.x0 + b.x1) / 2, by = (b.y0 + b.y1) / 2;
	const map = c => c.map(([a, q]) => [cx + (a - bx) * s, cy + (q - by) * s]);
	let placed = parts.map(p => p.map(map)).map(p => !initials && hasOverlaps(p) ? unionContours(p, res) : p);
	if (P.lInflate > 0) placed = placed.map(p => inflateContours(p, P.lInflate, res));
	if (P.lBlob > 0 && room) {
		// blown up inside the frame: the whole text is one body of strokes
		const M = { inflate: Math.max(1, P.lBlob), weight: P.lBlobWeight, part: P.lBlobPart, counter: P.lBlobCounter, fillet: P.lBlobFillet, pad: P.lBlobRoom, glyph: P.font + ':' + P.text };
		const out = blobLetter(placed.flat(), room, M, res);
		if (out && out.length) placed = [out];
	}
	return { contours: placed.flat(), parts: placed, missing, scale: s };
}

function ornParams(P, budget) {
	return {
		margin: P.oMargin, stemW: P.oStemW, taper: P.oTaper, curl: P.oCurl, turns: P.oTurns, undulate: P.oUndulate,
		wander: P.oWander, thin: P.oThin, branch: P.oBranch, maxDepth: P.oDepth, branchAngle: P.oBranchAngle * D2R, length: P.oLength,
		leaf: P.oLeaf, leafSize: P.oLeafSize, leafEvery: P.oLeafEvery, leafW: P.oLeafW, lobes: P.oLobes, lobeDepth: P.oLobeDepth,
		serr: P.oSerr, leafCurl: P.oLeafCurl, leafAngle: P.oLeafAngle * D2R, leafSide: P.oLeafSide,
		flower: P.oFlower, flowerChance: P.oFlowerChance, flowerSize: P.oFlowerSize, petals: P.oPetals,
		berries: P.oBerries, berrySize: P.oBerrySize, dots: P.oDots, beads: P.oBeads, terminal: P.oTerminal,
		density: P.oDensity, sprout: P.oSprout, mains: P.oSeedCount, fillLeaves: P.oFillLeaves, detail: P.oDetail, budget, settings: P,
	};
}

function mirrorItems(items) {
	const mp = pts => pts.map(([x, y]) => [W - x, y]);
	const out = { stems: [], leaves: [], flowers: [], dots: [], beads: [] };
	for (const st of items.stems) out.stems.push({ ...st, pts: mp(st.pts), dirs: st.dirs.map(a => Math.PI - a), ks: st.ks.map(k => -k), sign: -st.sign });
	const shp = s => ({ ...s, polys: s.polys.map(mp), lines: s.lines.map(mp), dots: s.dots.map(([x, y, r]) => [W - x, y, r]), axis: s.axis ? mp(s.axis) : s.axis, bx: W - s.bx, cx: W - s.cx });
	for (const l of items.leaves) out.leaves.push(shp(l));
	for (const f of items.flowers) out.flowers.push(shp(f));
	for (const [x, y, ...rest] of items.dots) out.dots.push([W - x, y, ...rest]);
	for (const [x, y, ...rest] of items.beads) out.beads.push([W - x, y, ...rest]);
	for (const k of Object.keys(out)) items[k].push(...out[k]);
	return items;
}

function shadowOffsets(P) {
	if (P.lShadow === 'none' || P.lShadowLen <= 0) return [];
	const a = P.lShadowAngle * D2R, L = P.lShadowLen;
	if (P.lShadow === 'drop') return [[Math.cos(a) * L, Math.sin(a) * L]];
	const n = Math.max(2, Math.ceil(L / 1.5));
	const out = [];
	for (let i = 1; i <= n; i++) out.push([Math.cos(a) * L * i / n, Math.sin(a) * L * i / n]);
	return out;
}

// points where strokes end or serifs poke out: sharp convex turns on the outline
function letterTips(contours, mask, nx, cell, count, R) {
	const cand = [];
	for (const c of contours) {
		const pts = resample(c, 6, true);
		const n = pts.length;
		if (n < 8) continue;
		for (let i = 0; i < n; i++) {
			const a = pts[(i - 3 + n) % n], p = pts[i], b = pts[(i + 3) % n];
			const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
			let turn = t2 - t1;
			while (turn > Math.PI) turn -= TAU; while (turn < -Math.PI) turn += TAU;
			const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
			let nxv = ty / tl, nyv = -tx / tl;
			const pr = cell * 1.6 + 1;
			const gi = Math.round((p[0] + nxv * pr) / cell), gj = Math.round((p[1] + nyv * pr) / cell);
			if (mask[gj * nx + gi]) { nxv = -nxv; nyv = -nyv; }
			// convex when the neighbours fall back inside, behind the outward normal
			const mx = (a[0] + b[0]) / 2 - p[0], my = (a[1] + b[1]) / 2 - p[1];
			if (mx * nxv + my * nyv > -0.5) continue;
			cand.push({ x: p[0], y: p[1], nx: nxv, ny: nyv, score: Math.abs(turn) + R() * 0.05 });
		}
	}
	cand.sort((u, v) => v.score - u.score);
	const out = [];
	for (const c of cand) {
		if (out.length >= count) break;
		if (out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < 90)) continue;
		out.push(c);
	}
	return out;
}

// polylines at outside distance d from the letter, for dotted/dashed echoes
function echoCurves(contours, d, mask, dist, nx, ny, cell) {
	const out = [];
	for (const c of contours) {
		const pts = resample(c, 3, true);
		const n = pts.length;
		let cur = [];
		for (let i = 0; i <= n; i++) {
			const a = pts[(i - 1 + n) % n], p = pts[i % n], b = pts[(i + 1) % n];
			const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
			let nxv = ty / tl, nyv = -tx / tl;
			const pr = cell * 1.6 + 1;
			const gi = Math.round((p[0] + nxv * pr) / cell), gj = Math.round((p[1] + nyv * pr) / cell);
			if (gi >= 0 && gj >= 0 && gi < nx && gj < ny && mask[gj * nx + gi]) { nxv = -nxv; nyv = -nyv; }
			const q = [p[0] + nxv * d, p[1] + nyv * d];
			const qi = Math.round(q[0] / cell), qj = Math.round(q[1] / cell);
			const ok = qi >= 0 && qj >= 0 && qi < nx && qj < ny && Math.abs(dist[qj * nx + qi] - d) < Math.max(2.5, cell * 1.3);
			if (ok) cur.push(q);
			else { if (cur.length > 3) out.push(cur); cur = []; }
		}
		if (cur.length > 3) out.push(cur);
	}
	return out;
}

// when the last thing in a set of grown items finishes growing
function itemsEnd(items) {
	if (!items) return 0;
	let m = 0;
	for (const st of items.stems) m = Math.max(m, st.t0 + st.len);
	for (const l of items.leaves) m = Math.max(m, (l.t0 || 0) + (l.dur || 0));
	for (const f of items.flowers) m = Math.max(m, (f.t0 || 0) + (f.dur || 0));
	for (const d of items.dots) m = Math.max(m, (d[3] || 0) + 12);
	for (const d of items.beads) m = Math.max(m, (d[3] || 0) + 12);
	return m;
}

const ease = s => 1 - Math.pow(1 - s, 3);

function cutStem(st, L) {
	const { acc } = st;
	let i = 0;
	while (i < acc.length - 2 && acc[i + 1] < L) i++;
	const f = Math.min(1, (L - acc[i]) / Math.max(1e-6, acc[i + 1] - acc[i]));
	const lerp2 = (a, b) => a + (b - a) * f;
	const tip = [lerp2(st.pts[i][0], st.pts[i + 1][0]), lerp2(st.pts[i][1], st.pts[i + 1][1])];
	return {
		...st, len: L,
		pts: [...st.pts.slice(0, i + 1), tip], ws: [...st.ws.slice(0, i + 1), lerp2(st.ws[i], st.ws[i + 1])],
		dirs: [...st.dirs.slice(0, i + 1), st.dirs[i + 1]], ks: [...st.ks.slice(0, i + 1), st.ks[i + 1]],
	};
}

// texture marks spread outward from the letter as g goes 0 → 1
function revealTex(scene, T, g) {
	const L = scene.letter.contours.length ? bbox(scene.letter.contours) : { x0: 450, x1: 550, y0: 450, y1: 550 };
	const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2, lim = g * 760, band = 60;
	const d = (x, y) => Math.hypot(x - cx, y - cy);
	const fade = (x, y) => clamp((lim - d(x, y)) / band, 0, 1);
	const cen = p => { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; };
	if (!T._ld) T._ld = T.lines.map(l => d(...cen(l)));
	const dots = arr => arr.flatMap(([x, y, r]) => { const f = fade(x, y); return f > 0 ? [[x, y, r * ease(f)]] : []; });
	return {
		...T, dots: dots(T.dots), rings: dots(T.rings),
		polys: T.polys.flatMap(p => {
			const [x, y] = cen(p), f = fade(x, y);
			if (f <= 0) return [];
			const e = ease(f);
			return [f >= 1 ? p : p.map(([px, py]) => [x + (px - x) * e, y + (py - y) * e])];
		}),
		lines: T.lines.filter((l, i) => T._ld[i] < lim),
		strokes: T.strokes.filter(l => fade(...l[l.length >> 1]) > 0.3),
		clip: g >= 1 ? null : lim, cx, cy,
	};
}

// the grown items as they stand at time t: stems cut to length, leaves and flowers swelling in
function grownAt(items, t) {
	if (!items) return items;
	const out = { stems: [], leaves: [], flowers: [], dots: [], beads: [] };
	for (const st of items.stems) {
		const L = t - st.t0;
		if (L > 0) out.stems.push(L >= st.len ? st : cutStem(st, L));
	}
	const scaled = (sh, cx, cy, e) => {
		const m = ([x, y]) => [cx + (x - cx) * e, cy + (y - cy) * e];
		return { ...sh, polys: sh.polys.map(p => p.map(m)), lines: sh.lines.map(p => p.map(m)), dots: sh.dots.map(([x, y, r]) => [...m([x, y]), r * e]) };
	};
	for (const l of items.leaves) {
		const s = (t - (l.t0 || 0)) / (l.dur || 30);
		if (s > 0) out.leaves.push(s >= 1 ? l : scaled(l, l.bx, l.by, ease(s)));
	}
	for (const f of items.flowers) {
		const s = (t - (f.t0 || 0)) / (f.dur || 30);
		if (s > 0) out.flowers.push(s >= 1 ? f : scaled(f, f.cx, f.cy, ease(s)));
	}
	for (const k of ['dots', 'beads']) for (const d of items[k]) {
		const s = (t - (d[3] || 0)) / 12;
		if (s > 0) out[k].push(s >= 1 ? d : [d[0], d[1], d[2] * ease(s)]);
	}
	return out;
}

export function buildScene(P, font, opt = {}) {
	const q = opt.quality ?? 1;
	const seed = hash(P.seed, P.text, opt.salt || '');
	const R = rng(seed), noise = makeNoise(seed ^ 0x5bd1e995);
	const geo = frameGeometry(P, W, H);
	const fb = bbox([geo.field]);
	const initials = !!opt.initials;
	// a blown-up letter fills its frame; with none, the square its margin leaves
	const room = geo.none ? [[P.fMargin, P.fMargin], [W - P.fMargin, P.fMargin], [W - P.fMargin, H - P.fMargin], [P.fMargin, H - P.fMargin]] : geo.field;
	const letter = font ? layoutLetter(P, font, fb, initials, q >= 0.9 ? 0.5 : 1.1, room) : { contours: [], parts: [], missing: true };
	const e = P.embolden;
	const cell = lerp(6.5, 3, q);
	const nx = Math.ceil(W / cell) + 1, ny = Math.ceil(H / cell) + 1;
	const LP = plainPath(letter.contours);
	const shadows = shadowOffsets(P);
	const letterMask = rasterMask(nx, ny, cell, x => {
		x.fill(LP, 'nonzero');
		if (e > 0) { x.lineWidth = 2 * e; x.stroke(LP); }
	});
	// t: ms spent in the slow steps (for stats)
	const scene = { geo, letter, orn: null, fil: null, echo: [], cell, seed, t: {} };
	const timed = (k, f) => { const t0 = performance.now(), v = f(); scene.t[k] = (scene.t[k] || 0) + performance.now() - t0; return v; };
	const om = P.oMargin;

	// where ornament may grow
	const frameMask = rasterMask(nx, ny, cell, x => {
		if (geo.none) {
			const m = P.fMargin;
			x.fillRect(m, m, W - 2 * m, H - 2 * m);
		} else x.fill(plainPath([geo.field]));
		const corner = cornerGeometry(P.fCorner, geo.field, P.fCornerSize, P);
		x.globalCompositeOperation = 'destination-out';
		x.fill(plainPath(corner.polys));
		for (const [cx, cy, r] of corner.dots) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
	});
	const gap = P.letterGap + Math.max(0, e);
	const keepOut = rasterMask(nx, ny, cell, x => {
		const draw = (dx, dy) => {
			x.save(); x.translate(dx, dy);
			x.fill(LP, 'nonzero');
			x.lineWidth = 2 * gap; x.stroke(LP);
			x.restore();
		};
		draw(0, 0);
		for (const [dx, dy] of shadows) draw(dx, dy);
		if (P.lHalo > 0 && P.lHaloColor !== 'none') { x.lineWidth = 2 * (P.lHalo + e); x.stroke(LP); }
	});

	const wantOrn = P.orn !== 'none', wantTex = P.tKind !== 'none';
	if (wantOrn || wantTex) {
		let allowed = new Uint8Array(nx * ny);
		for (let i = 0; i < allowed.length; i++) allowed[i] = frameMask[i] && !keepOut[i] ? 1 : 0;
		if (P.oRegion !== 'field' && letter.contours.length) {
			const dOut = distTo(letterMask, 1, nx, ny, cell);
			if (P.oRegion === 'halo') {
				for (let i = 0; i < allowed.length; i++) if (dOut[i] > P.oHalo) allowed[i] = 0;
			} else if (P.oRegion === 'counters') {
				const dil = new Uint8Array(nx * ny);
				for (let i = 0; i < dil.length; i++) dil[i] = dOut[i] <= P.oHalo ? 1 : 0;
				const dEr = distTo(dil, 0, nx, ny, cell);
				for (let i = 0; i < allowed.length; i++) if (!(dEr[i] > P.oHalo)) allowed[i] = 0;
			}
		}
		const allowedFull = allowed.slice();
		const sym = P.oSym === 'mirror' && wantOrn;
		if (sym) {
			const wall = W / 2 + om / 2;
			for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
				const k = j * nx + i;
				const mi = Math.round((W - i * cell) / cell);
				if (i * cell >= wall || mi < 0 || mi >= nx || !allowed[j * nx + mi]) allowed[k] = 0;
			}
		}
		const o = ornParams(P, opt.budget || 3000);
		const field = new Field(W, H, cell, ornSizes(o).cap);
		const blocked = new Uint8Array(nx * ny);
		for (let i = 0; i < blocked.length; i++) blocked[i] = allowed[i] ? 0 : 1;
		field.setBlocked(blocked);
		scene.field = field;

		// seeds
		const seeds = [];
		const w = o.stemW;
		const n = P.oSeedCount;
		const inset = om + w + 4;
		const fx0 = fb.x0 + inset, fx1 = fb.x1 - inset, fy0 = fb.y0 + inset, fy1 = fb.y1 - inset;
		const cxm = (fb.x0 + fb.x1) / 2, cym = (fb.y0 + fb.y1) / 2;
		const towards = (x, y) => Math.atan2(cym - y, cxm - x);
		if (P.oSeeds === 'corners') {
			for (const [x, y] of [[fx0, fy1], [fx1, fy1], [fx0, fy0], [fx1, fy0]].slice(0, Math.max(1, n))) seeds.push({ x, y, dir: towards(x, y) + (R() - 0.5) * 0.6 });
		} else if (P.oSeeds === 'root') {
			const k = Math.max(1, n);
			for (let i = 0; i < k; i++) {
				const x = sym ? W / 2 - om - w * (1 + i * 1.5) : cxm + (i - (k - 1) / 2) * (w * 3 + om * 2);
				seeds.push({ x, y: fy1, dir: -Math.PI / 2 - (sym ? 0.25 + i * 0.2 : (i - (k - 1) / 2) * 0.3), grace: 0 });
			}
		} else if (P.oSeeds === 'frame') {
			const k = Math.max(1, n);
			for (let i = 0; i < k; i++) {
				const t = (i + R() * 0.6) / k;
				const side = Math.floor(t * 4), u = (t * 4) % 1;
				const pts = [[fx0 + (fx1 - fx0) * u, fy1], [fx1, fy1 - (fy1 - fy0) * u], [fx1 - (fx1 - fx0) * u, fy0], [fx0, fy0 + (fy1 - fy0) * u]][side];
				seeds.push({ x: pts[0], y: pts[1], dir: towards(pts[0], pts[1]) + (R() - 0.5) * 1.2 });
			}
		} else if (P.oSeeds === 'letter' && letter.contours.length) {
			for (const t of letterTips(letter.contours, letterMask, nx, cell, Math.max(1, n) * (sym ? 2 : 1), R)) {
				if (sym && t.x > W / 2) continue;
				let d = gap + om + w / 2 + 2;
				while (d < gap + 90 && field.at(t.x + t.nx * d, t.y + t.ny * d) < om + w / 2 + 1) d += 3;
				seeds.push({ x: t.x + t.nx * d, y: t.y + t.ny * d, dir: Math.atan2(t.ny, t.nx), grace: 0 });
			}
		}
		const texOpts = () => ({
			settings: P,
			kind: P.tKind, scale: P.tScale, size: P.tSize, gap: P.tGap, grade: P.tGrade, shape: P.tShape, twist: P.tTwist,
			style: { bubbles: P.tBubble, cells: P.tCell, truchet: P.tTruchet, coral: P.tCoral }[P.tKind], seed: seed ^ 0x2545,
		});
		// with mirror symmetry the growth field has a wall down the middle, so the texture
		// gets a field of its own: the full region, with the (mirrored) ornament drawn in
		const fresh = (withOrn) => {
			const f = new Field(W, H, cell, field.cap);
			const blk = new Uint8Array(nx * ny);
			for (let i = 0; i < blk.length; i++) blk[i] = allowedFull[i] ? 0 : 1;
			if (withOrn && scene.orn) {
				const it = scene.orn;
				const m = rasterMask(nx, ny, cell, x => {
					x.fill(plainPath([...it.stems.map(st => stemPoly(st)), ...it.leaves.flatMap(l => l.polys), ...it.flowers.flatMap(fl => fl.polys)].map(q => signedArea(q) < 0 ? q.slice().reverse() : q)), 'nonzero');
					for (const [cx, cy, r] of [...it.dots, ...it.beads]) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
				});
				for (let i = 0; i < blk.length; i++) if (m[i]) blk[i] = 1;
			}
			f.setBlocked(blk);
			return f;
		};
		// a ground texture grows first, on its own field, so the ornament can grow over it
		if (wantTex && P.tWhere === 'ground') {
			const f2 = sym ? fresh(false) : field.clone();
			scene.tex = timed('tex', () => growTexture(f2, distanceMap(f2, true), texOpts(), noise));
		}
		if (wantOrn) {
			const items = timed('orn', () => grow(field, o, R, noise, seeds.filter(s => field.at(s.x, s.y) > om * 0.5)));
			scene.orn = sym ? mirrorItems(items) : items;
			scene.seeds = seeds;
		}
		if (wantTex && P.tWhere !== 'ground') {
			const f3 = sym ? fresh(true) : field;
			scene.tex = timed('tex', () => growTexture(f3, distanceMap(f3, false), texOpts(), noise));
		}
	}

	// filigree inside the letter
	if (P.lFil !== 'none' && letter.contours.length) {
		const fs = P.lFilScale;
		const dIn = distTo(letterMask, 0, nx, ny, cell);
		const fm = Math.max(1.5, 3.2 * fs);
		const blocked = new Uint8Array(nx * ny);
		for (let i = 0; i < blocked.length; i++) blocked[i] = dIn[i] > P.lFilInset ? 0 : 1;
		const kind = P.lFil;
		const o = {
			margin: fm, stemW: Math.max(0.8, 2.6 * fs), taper: 0.5, curl: 0.92, turns: 1.4, undulate: 0, wander: 0.3,
			branch: 0.6, maxDepth: 2, branchAngle: 0.7, length: 0.25 * fs,
			leaf: kind === 'leafy' ? 'trefoil' : 'none', leafSize: 0.35 * fs, leafEvery: 0.5, leafW: 0.6, lobes: 3, lobeDepth: 0.3, serr: 0,
			leafCurl: 0.3, leafAngle: 0.8, leafSide: 'alt', flower: 'none', flowerChance: 0, flowerSize: 0.3, petals: 5,
			berries: kind === 'beads' ? 0.9 : 0.2, berrySize: 0.3 * fs, dots: kind === 'beads' ? 0.95 : 0.6, beads: kind === 'beads' ? 0.7 : 0,
			terminal: 'ball', density: 0.92, sprout: kind === 'beads' ? 0.3 : 1, fillLeaves: false, detail: 'none', budget: opt.budget || 3000, settings: P,
		};
		const field = new Field(W, H, cell, 40);
		field.setBlocked(blocked);
		scene.fil = grow(field, o, rng(seed ^ 77), noise, []);
	}

	// dotted / dashed echoes need real curves
	if (P.lEcho > 0 && P.lEchoStyle !== 'line' && letter.contours.length) {
		const dOut = distTo(letterMask, 1, nx, ny, cell);
		for (let i = 1; i <= P.lEcho; i++) scene.echo.push(echoCurves(letter.contours, P.lEchoGap * i, letterMask, dOut, nx, ny, cell));
	}

	// monogram crossings: where two letters overlap, alternate which one is on top
	if (P.lWeave === 'weave' && letter.parts.length > 1) {
		const masks = letter.parts.map(part => rasterMask(nx, ny, cell, x => {
			const pp = plainPath(part); x.fill(pp, 'nonzero'); if (e > 0) { x.lineWidth = 2 * e; x.stroke(pp); }
		}));
		scene.crossings = [];
		for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) {
			const seen = new Uint8Array(nx * ny);
			const comps = [];
			for (let k0 = 0; k0 < seen.length; k0++) {
				if (seen[k0] || !(masks[i][k0] && masks[j][k0])) continue;
				const cells = [], stack = [k0];
				seen[k0] = 1;
				while (stack.length) {
					const kk = stack.pop();
					cells.push([(kk % nx) * cell, Math.floor(kk / nx) * cell]);
					for (const nb of [kk - 1, kk + 1, kk - nx, kk + nx]) {
						if (nb < 0 || nb >= seen.length || seen[nb] || !(masks[i][nb] && masks[j][nb])) continue;
						seen[nb] = 1; stack.push(nb);
					}
				}
				if (cells.length < 2) continue;
				const cx = cells.reduce((a, q) => a + q[0], 0) / cells.length, cy = cells.reduce((a, q) => a + q[1], 0) / cells.length;
				comps.push({ cells, cx, cy });
			}
			// order the crossings along letter i's longest contour, then alternate
			const main = letter.parts[i].reduce((a, q) => q.length > a.length ? q : a, []);
			for (const cp of comps) {
				let bi = 0, bd = Infinity;
				for (let q = 0; q < main.length; q++) { const d = (main[q][0] - cp.cx) ** 2 + (main[q][1] - cp.cy) ** 2; if (d < bd) { bd = d; bi = q; } }
				cp.t = bi;
			}
			comps.sort((u, v) => u.t - v.t);
			comps.forEach((cp, n) => { if (n % 2 === (P.lWeaveFlip ? 1 : 0)) scene.crossings.push({ top: i, cells: cp.cells }); });
		}
	}

	scene.timeline = { orn: itemsEnd(scene.orn), fil: itemsEnd(scene.fil) };

	// split line for two-colour puzzle letters
	if (P.lFill === 'split' && letter.contours.length) {
		const b = bbox(letter.contours);
		const sx = b.x0 + b.w * (0.5 + P.lSplitPos);
		const line = [];
		const steps = 120, amp = b.w * 0.045, per = Math.max(20, b.h / P.lSplitFreq);
		for (let i = 0; i <= steps; i++) {
			const y = b.y0 - 20 + (b.h + 40) * i / steps;
			let x = sx;
			const ph = (y - b.y0) / per;
			if (P.lSplit === 'wave') x += Math.sin(ph * TAU) * amp;
			else if (P.lSplit === 'zigzag') x += (Math.abs((ph % 1 + 1) % 1 - 0.5) * 4 - 1) * amp;
			else if (P.lSplit === 'meander') x += (((ph % 1) + 1) % 1 < 0.5 ? 1 : -1) * amp;
			line.push([x, y]);
		}
		if (P.lSplit === 'meander') {
			// square it off
			const sq = [];
			for (let i = 0; i < line.length; i++) { if (i && line[i][0] !== line[i - 1][0]) sq.push([line[i - 1][0], line[i][1]]); sq.push(line[i]); }
			line.splice(0, line.length, ...sq);
		}
		scene.split = { line, right: [...line, [b.x1 + 40, b.y1 + 20], [b.x1 + 40, b.y0 - 20]] };
	}
	return scene;
}

// --- painting --------------------------------------------------------------

const COL = { A: '#ff0000', B: '#00ff00', C: '#0000ff', paper: '#000000' };

export class Painter {
	constructor(size) { this.resize(size); }
	resize(size) {
		this.size = size; this.k = size / W;
		this.main = canvas(size, size);
		this.c = this.main.getContext('2d');
		this.t = [canvas(size, size), canvas(size, size), canvas(size, size)];
		this.tc = this.t.map(t => t.getContext('2d'));
	}
}

export function paintScene(scene, P, pt, time = null) {
	const { c, k, size } = pt;
	const [t1, t2, t3] = pt.t, [c1, c2, c3] = pt.tc;
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.globalCompositeOperation = 'source-over';
	c.setLineDash([]);
	c.fillStyle = '#000'; c.fillRect(0, 0, size, size);
	const geo = scene.geo;

	const wn = makeNoise(hash('wobble', P.seed));
	const A = P.wobble, f = 1 / Math.max(5, P.wobbleScale);
	const wob = A > 0 ? (x, y, pass) => [x + A * wn(x * f + pass * 37.1, y * f), y + A * wn(x * f + 91.7 + pass * 37.1, y * f + 17.3)] : null;
	const rs = clamp(P.wobbleScale / 6, 2.5, 12);
	const passes = Math.max(1, Math.round(P.sketch));

	const path = (polys, closed = true, pass = 0, normalize = false) => {
		const p = new Path2D();
		for (let poly of polys) {
			if (!poly || poly.length < 2) continue;
			if (normalize && closed && signedArea(poly) < 0) poly = poly.slice().reverse();
			// small shapes keep their own points: resampling them at the wobble step would collapse them
			let pts = poly;
			if (wob) {
				let per = 0;
				for (let i = 1; i < poly.length; i++) per += Math.abs(poly[i][0] - poly[i - 1][0]) + Math.abs(poly[i][1] - poly[i - 1][1]);
				if (per > rs * 12) pts = resample(poly, rs, closed);
			}
			for (let i = 0; i < pts.length; i++) {
				let x = pts[i][0], y = pts[i][1];
				if (wob) [x, y] = wob(x, y, pass);
				if (i) p.lineTo(x * k, y * k); else p.moveTo(x * k, y * k);
			}
			if (closed) p.closePath();
		}
		return p;
	};
	const dotsPath = (dots, pass = 0) => {
		const p = new Path2D();
		for (const [x0, y0, r] of dots) {
			let x = x0, y = y0;
			if (wob) [x, y] = wob(x, y, pass);
			p.moveTo((x + r) * k, y * k);
			p.arc(x * k, y * k, Math.max(0.55, r * k), 0, TAU);
		}
		return p;
	};
	const fill = (ctx, p, slot, rule = 'nonzero') => {
		if (!slot || slot === 'none') return;
		ctx.fillStyle = COL[slot]; ctx.fill(p, rule);
	};
	const stroke = (ctx, p, slot, w) => {
		if (!slot || slot === 'none' || w <= 0) return;
		ctx.strokeStyle = COL[slot]; ctx.lineWidth = Math.max(0.95, w * k);
		ctx.lineJoin = 'round'; ctx.lineCap = 'round';
		ctx.stroke(p);
	};
	const strokeLines = (ctx, lines, slot, w, closed = false) => {
		for (let pass = 0; pass < passes; pass++) stroke(ctx, path(lines, closed, pass), slot, w * (pass ? 0.7 : 1));
	};
	const drawGeom = (ctx, g, slot, lw) => {
		if (g.polys.length) fill(ctx, path(g.polys, true, 0, true), slot);
		if (g.lines.length) strokeLines(ctx, g.lines, slot, lw, false);
		if (g.dots.length) fill(ctx, dotsPath(g.dots), slot);
	};
	// {sdf >= s} of a path (positive inside), into ctx
	const regionGE = (ctx, p, s, dx = 0, dy = 0, clear = true) => {
		if (clear) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, size, size); }
		ctx.setTransform(1, 0, 0, 1, dx * k, dy * k);
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
		ctx.fill(p, 'nonzero');
		if (s < 0) { ctx.lineWidth = -2 * s * k; ctx.stroke(p); }
		else if (s > 0) { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 2 * s * k; ctx.stroke(p); ctx.globalCompositeOperation = 'source-over'; }
		ctx.setTransform(1, 0, 0, 1, 0, 0);
	};
	const paintMask = (mc, m, slot) => {
		if (!slot || slot === 'none') return;
		m.globalCompositeOperation = 'source-in';
		m.fillStyle = COL[slot]; m.fillRect(0, 0, size, size);
		m.globalCompositeOperation = 'source-over';
		c.drawImage(mc, 0, 0);
	};
	const band = (p, lo, hi, slot) => {
		if (!slot || slot === 'none' || hi <= lo) return;
		// never thinner than a pixel, or the print pass loses it
		const minW = 1.05 / k;
		if (hi - lo < minW) { const mid = (lo + hi) / 2; lo = mid - minW / 2; hi = mid + minW / 2; }
		regionGE(c1, p, lo); regionGE(c2, p, hi);
		c1.globalCompositeOperation = 'destination-out'; c1.drawImage(t2, 0, 0); c1.globalCompositeOperation = 'source-over';
		paintMask(t1, c1, slot);
	};
	// a fill that follows the shape in mask m (relief.js), lengths in units
	// worked out once per scene and size (the growth animation repaints every frame), and while
	// the scene grows, as it stands then: it comes in over the first nine tenths
	const fillT = time == null ? null : clamp(time / 0.9, 0, 1);
	const shapeIn = (m, kind, slot, spacing, weight, angle, blurR, where) => {
		if (!slot || slot === 'none') return;
		const fills = scene.fills || (scene.fills = new Map()), key = [kind, where, size, spacing, weight, angle].join('|');
		let fill = fills.get(key);
		if (!fill) {
			fill = makeFill(kind, m.getImageData(0, 0, size, size).data, size, { spacing: spacing * k, weight: weight * k, angle: angle * D2R, blurR: blurR * k, seed: scene.seed, settings: P });
			if (size <= 1200) fills.set(key, fill); // not exports: they'd sit in the scene cache
		}
		c3.setTransform(1, 0, 0, 1, 0, 0);
		c3.putImageData(new ImageData(fillT == null || fillT >= 1 ? fill.final : fill.frame(fillT), size, size), 0, 0);
		paintMask(t3, c3, slot);
	};
	// pattern clipped by the alpha of mask canvas mc
	const patternIn = (mc, g, slot, lw) => {
		if (!slot || slot === 'none') return;
		c3.setTransform(1, 0, 0, 1, 0, 0); c3.clearRect(0, 0, size, size);
		drawGeom(c3, g, 'A', lw);
		c3.globalCompositeOperation = 'destination-in'; c3.drawImage(mc, 0, 0); c3.globalCompositeOperation = 'source-over';
		paintMask(t3, c3, slot);
	};

	// frame shadow, then knock out the frame's own area
	if (!geo.none && P.fShadow > 0) {
		const a = P.fShadowAngle * D2R, dx = Math.cos(a) * P.fShadow, dy = Math.sin(a) * P.fShadow;
		const sp = geo.outer.map(([x, y]) => [x + dx, y + dy]);
		if (P.fShadowStyle === 'solid') fill(c, path([sp]), P.fShadowColor);
		else if (P.fShadowStyle === 'hatch') {
			c.save(); c.clip(path([sp]));
			drawGeom(c, patternGeometry('hatch', bbox([sp]), { scale: Math.max(4, P.fShadow / 4), angle: 45, weight: 1.2 }), P.fShadowColor, Math.max(1, P.fShadow / 14));
			c.restore();
		} else {
			// two rules echoing the frame, like a second box behind
			strokeLines(c, [sp], P.fShadowColor, Math.max(1.5, P.fW1 * 0.6), true);
			if (P.fRules > 1) strokeLines(c, [geo.field.map(([x, y]) => [x + dx, y + dy])], P.fShadowColor, Math.max(1, P.fW2), true);
		}
		fill(c, path([geo.outer]), 'paper');
	}

	// the field and its ground
	const fieldPath = path([geo.field]);
	if (!geo.none) {
		if (P.fBorder !== 'none') fill(c, path([geo.outer]), P.fBorder);
		if (P.fField !== 'paper') fill(c, fieldPath, P.fField);
		if (SHAPE_FILLS.has(P.fPattern)) {
			// the ground the letter leaves, kept clear of it by its gap
			c1.setTransform(1, 0, 0, 1, 0, 0); c1.clearRect(0, 0, size, size);
			c1.fillStyle = '#fff'; c1.fill(fieldPath);
			if (scene.letter.contours.length) {
				const lp = path(scene.letter.contours);
				c1.globalCompositeOperation = 'destination-out';
				c1.fill(lp, 'nonzero');
				c1.lineWidth = 2 * (P.letterGap + Math.max(0, P.embolden)) * k; c1.lineJoin = 'round'; c1.stroke(lp);
				c1.globalCompositeOperation = 'source-over';
			}
			shapeIn(c1, P.fPattern, P.fPatColor, P.fPatScale, P.fPatW, P.fPatAngle, 60, 'ground');
		} else if (P.fPattern !== 'none') {
			c.save(); c.clip(fieldPath);
			const g = patternGeometry(P.fPattern, bbox([geo.field]), { scale: P.fPatScale, angle: P.fPatAngle, weight: P.fPatW, seed: scene.seed, settings: P });
			drawGeom(c, g, P.fPatColor, P.fPatW);
			c.restore();
		}
	}

	const contrast = (fillSlot, under) => (fillSlot === 'paper' || fillSlot === 'none') ? (under && under !== 'paper' ? under : 'A') : 'paper';

	// a stem as solid, dotted, beaded, dashed, double-lined or thorny
	const stemShapes = (st, s, polys, dots, edges) => {
		const style = s.stemStyle || 'solid';
		const minW = 1.05 / k;
		const { pts, ws, dirs } = st;
		const n = pts.length;
		if (style === 'dotted' || style === 'beaded') {
			let along = 0, next = 0, k2 = 0;
			for (let i = 0; i < n; i++) {
				if (i) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
				if (along < next) continue;
				const big = style === 'dotted' || k2 % 2 === 0;
				const r = Math.max(minW / 2, ws[i] * (big ? 0.6 : 0.32));
				dots.push([pts[i][0], pts[i][1], r]);
				next = along + Math.max(3, ws[i] * (style === 'dotted' ? 1.7 : 1.15));
				k2++;
			}
		} else if (style === 'dashed') {
			let along = 0, start = 0, on = true;
			const seg = i => ({ pts: pts.slice(start, i + 1), ws: ws.slice(start, i + 1), dirs: dirs.slice(start, i + 1) });
			for (let i = 1; i < n; i++) {
				along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
				const lim = Math.max(4, ws[i] * (on ? 3.2 : 1.6));
				if (along >= lim || i === n - 1) {
					if (on && i - start >= 1) polys.push(stemPoly(seg(i), s.contrast, s.penAngle, 'round', minW));
					on = !on; start = i; along = 0;
				}
			}
		} else if (style === 'double') {
			const L = [], R2 = [];
			for (let i = 0; i < n; i++) {
				const nx = -Math.sin(dirs[i]), ny = Math.cos(dirs[i]), h = Math.max(ws[i] / 2, minW);
				L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]); R2.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
			}
			edges.push(L, R2);
			edges.w = Math.max(0.8, (st.ws[0] || 4) * 0.16);
		} else {
			polys.push(stemPoly(st, s.contrast, s.penAngle, 'round', minW));
			if (style === 'thorny') {
				let along = 0, next = ws[0] * 2;
				for (let i = 1; i < n - 1; i++) {
					along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
					if (along < next) continue;
					next = along + Math.max(6, ws[i] * 3.5);
					const sd = st.ks[i] >= 0 ? -1 : 1, a = dirs[i];
					const nx = -Math.sin(a) * sd, ny = Math.cos(a) * sd, fx = Math.cos(a), fy = Math.sin(a);
					const h = ws[i] / 2, b = Math.max(1.5, ws[i] * 0.55), L = Math.max(3, ws[i] * 1.3);
					const [px, py] = pts[i];
					polys.push([[px + nx * h * 0.6 - fx * b, py + ny * h * 0.6 - fy * b], [px + nx * (h + L) + fx * L * 0.7, py + ny * (h + L) + fy * L * 0.7], [px + nx * h * 0.6 + fx * b, py + ny * h * 0.6 + fy * b]]);
				}
			}
		}
	};

	const paintItems = (items, s) => {
		if (!items) return;
		const polys = [], dots = [...items.dots, ...items.beads], edges = [];
		for (const st of items.stems) stemShapes(st, s, polys, dots, edges);
		for (const l of items.leaves) polys.push(...l.polys);
		for (const fl of items.flowers) polys.push(...fl.polys);
		if (s.stroke !== 'none' && s.strokeW > 0) {
			for (let pass = 0; pass < passes; pass++) {
				const w = s.strokeW * 2 * (pass ? 0.7 : 1);
				stroke(c, path(polys, true, pass, true), s.stroke, w);
				stroke(c, dotsPath(dots, pass), s.stroke, w);
			}
		}
		const P1 = path(polys, true, 0, true);
		fill(c, P1, s.fill);
		fill(c, dotsPath(dots), s.fill);
		if (edges.length) strokeLines(c, edges, s.fill === 'paper' && s.stroke !== 'none' ? s.stroke : s.fill, edges.w, false);
		if (s.detail !== 'none' && s.detailW > 0) {
			const lines = [];
			for (const st of items.stems) lines.push(...stemDetail(st, s.detail));
			for (const l of items.leaves) lines.push(...l.lines);
			for (const fl of items.flowers) lines.push(...fl.lines);
			strokeLines(c, lines.filter(l => l.length > 1), s.detailColor, s.detailW, false);
		}
		const fdots = items.flowers.flatMap(fl => fl.dots);
		if (fdots.length) fill(c, dotsPath(fdots), s.detailColor);
	};

	const ornUnder = geo.none ? 'paper' : P.fField;

	// growth animation: the ornament grows over the first part, the texture spreads out from the
	// letter over the rest
	let orn = scene.orn, fil = scene.fil, T = scene.tex;
	if (time != null) {
		const hasOrn = !!(scene.orn && scene.timeline.orn > 0), hasTex = !!scene.tex;
		const span = hasOrn && hasTex ? 0.75 : 1;
		const tf = Math.min(1, time / span);
		orn = grownAt(scene.orn, tf * scene.timeline.orn);
		fil = grownAt(scene.fil, tf * (scene.timeline.fil || 0));
		if (hasTex) {
			const start = hasOrn ? 0.5 : 0;
			T = revealTex(scene, scene.tex, clamp((time - start) / (1 - start), 0, 1));
		}
	}

	// texture, under the ornament
	if (T) {
		const tc = P.tColor !== 'auto' ? P.tColor : ornUnder === 'paper' ? 'A' : 'paper';
		const lw = Math.max(0.5, P.tSize * 0.5);
		if (T.polys.length) fill(c, path(T.polys, true, 0, true), tc);
		if (T.dots.length) fill(c, dotsPath(T.dots), tc);
		if (T.rings.length) stroke(c, dotsPath(T.rings), tc, Math.max(0.6, P.tSize * 0.3));
		if (T.lines.length) strokeLines(c, T.lines, tc, lw, false);
		if (T.strokes.length && T.strokeW * 2 * k < 1.6) {
			// too small to see a taper: plain lines are much cheaper
			strokeLines(c, T.strokes, tc, T.strokeW * 1.3, false);
		} else if (T.strokes.length) {
			// tapered at both ends
			const polys = [];
			for (const line of T.strokes) {
				const n = line.length;
				if (n < 2) continue;
				const dirs = line.map((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); });
				const ws = line.map((_, i) => T.strokeW * 2 * Math.pow(Math.sin(Math.PI * (i + 0.5) / n), 0.6));
				polys.push(stemPoly({ pts: line, ws, dirs }, 0, 0, 'round', 0.9 / k));
			}
			fill(c, path(polys, true, 0, true), tc);
		}
		if (T.coral && scene.coralImg && scene.coralImg[size]) {
			c1.setTransform(1, 0, 0, 1, 0, 0); c1.clearRect(0, 0, size, size);
			c1.drawImage(scene.coralImg[size], 0, 0);
			if (T.clip != null) {
				c1.globalCompositeOperation = 'destination-in';
				c1.beginPath(); c1.arc(T.cx * k, T.cy * k, Math.max(0, T.clip) * k, 0, TAU); c1.fillStyle = '#fff'; c1.fill();
				c1.globalCompositeOperation = 'source-over';
			}
			paintMask(t1, c1, tc);
		}
	}

	const oDet = P.oDetailColor !== 'auto' ? P.oDetailColor
		: (P.oFill === 'paper' || P.oFill === 'none') ? (P.oStroke !== 'none' ? P.oStroke : contrast('paper', ornUnder)) : 'paper';
	paintItems(orn, { fill: P.oFill, stroke: P.oStroke, strokeW: P.oStrokeW, detail: P.oDetail, detailW: P.oDetailW, detailColor: oDet, contrast: P.oContrast, penAngle: P.oPenAngle * D2R, stemStyle: P.oStemStyle });

	// the letter (or each letter of a monogram, in order, each with a gap around it)
	const L = scene.letter;
	const e = P.embolden;
	const shadows = shadowOffsets(P);
	const fillSlot = P.lFill;
	const letterColor = fillSlot === 'split' ? P.lSplitA : fillSlot === 'pattern' ? P.lPatBg : fillSlot;
	const gapColor = ornUnder;
	const paintLetter = (contours, echoes, gap, clipFil) => {
		const LP = path(contours, true, 0, false);
		if (gap > 0) {
			regionGE(c1, LP, -e - gap);
			for (const [dx, dy] of shadows) regionGE(c1, LP, -e - gap, dx, dy, false);
			paintMask(t1, c1, gapColor);
		}
		if (P.lHalo > 0 && P.lHaloColor !== 'none') {
			regionGE(c1, LP, -e - P.lHalo);
			for (const [dx, dy] of shadows) regionGE(c1, LP, -e - P.lHalo, dx, dy, false);
			paintMask(t1, c1, P.lHaloColor);
		}
		if (shadows.length) {
			c1.setTransform(1, 0, 0, 1, 0, 0); c1.clearRect(0, 0, size, size);
			for (const [dx, dy] of shadows) regionGE(c1, LP, -e, dx, dy, false);
			if (P.lShadowFill === 'hatch') {
				const g = patternGeometry('hatch', { x0: 0, y0: 0, x1: W, y1: H }, { scale: Math.max(3, P.lPatScale * 0.6), angle: P.lShadowAngle + 90, weight: 1 });
				patternIn(t1, g, P.lShadowColor, Math.max(0.8, P.lPatScale * 0.14));
			} else if (P.lShadowFill === 'outline') {
				// the shadow's silhouette as a line: dilate and subtract
				c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, size, size);
				for (const [dx, dy] of shadows) regionGE(c2, LP, -e - Math.max(1.5, P.lOutline || 2), dx, dy, false);
				c2.globalCompositeOperation = 'destination-out'; c2.drawImage(t1, 0, 0); c2.globalCompositeOperation = 'source-over';
				paintMask(t2, c2, P.lShadowColor);
			} else paintMask(t1, c1, P.lShadowColor);
		}
		// echoes
		if (P.lEcho > 0) {
			for (let i = 1; i <= P.lEcho; i++) {
				const d = e + P.lEchoGap * i;
				if (P.lEchoStyle === 'line' || !echoes) {
					for (let pass = 0; pass < passes; pass++) band(pass ? path(contours, true, pass) : LP, -d - P.lEchoW / 2, -d + P.lEchoW / 2, P.lEchoColor);
				} else {
					const curves = echoes[i - 1] || [];
					if (P.lEchoStyle === 'dots') {
						const dots = [];
						for (const cv of curves) for (const p of resample(cv, Math.max(3, P.lEchoW * 3.4), false)) dots.push([p[0], p[1], P.lEchoW * 1.05]);
						fill(c, dotsPath(dots), P.lEchoColor);
					} else {
						c.setLineDash([P.lEchoW * 3 * k, P.lEchoW * 2.5 * k]);
						strokeLines(c, curves, P.lEchoColor, P.lEchoW, false);
						c.setLineDash([]);
					}
				}
			}
		}
		// fill
		if (fillSlot === 'A' || fillSlot === 'B' || fillSlot === 'C' || fillSlot === 'paper') {
			regionGE(c1, LP, -e); paintMask(t1, c1, fillSlot);
		} else if (fillSlot === 'pattern') {
			regionGE(c1, LP, -e);
			if (P.lPatBg !== 'none') paintMask(t1, c1, P.lPatBg);
			if (SHAPE_FILLS.has(P.lPattern)) shapeIn(c1, P.lPattern, P.lPatColor, P.lPatScale, P.lPatW, P.lPatAngle, 34, 'letter');
			else patternIn(t1, patternGeometry(P.lPattern, bbox(L.contours), { scale: P.lPatScale, angle: P.lPatAngle, weight: P.lPatW, seed: scene.seed, settings: P }), P.lPatColor, P.lPatW);
		} else if (fillSlot === 'split' && scene.split) {
			regionGE(c1, LP, -e); paintMask(t1, c1, P.lSplitA);
			c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, size, size);
			c2.drawImage(t1, 0, 0);
			c2.globalCompositeOperation = 'destination-in'; c2.fillStyle = '#fff'; c2.fill(path([scene.split.right])); c2.globalCompositeOperation = 'source-over';
			paintMask(t2, c2, P.lSplitB);
			c2.clearRect(0, 0, size, size);
			stroke(c2, path([scene.split.line], false), 'A', P.lSplitGap);
			c2.globalCompositeOperation = 'destination-in'; c2.drawImage(t1, 0, 0); c2.globalCompositeOperation = 'source-over';
			paintMask(t2, c2, 'paper');
		}
		const filColor = P.lFilColor === 'auto' ? contrast(letterColor, ornUnder) : P.lFilColor;
		if (fil) {
			if (clipFil) { c.save(); c.clip(LP, 'nonzero'); }
			paintItems(fil, { fill: filColor, stroke: 'none', strokeW: 0, detail: 'none', detailW: 0, detailColor: filColor, contrast: 0, penAngle: 0 });
			if (clipFil) c.restore();
		}
		if (P.lInline > 0) {
			const ic = P.lInlineColor === 'auto' ? contrast(letterColor, ornUnder) : P.lInlineColor;
			for (let pass = 0; pass < passes; pass++) band(pass ? path(contours, true, pass) : LP, -e + P.lInlineOff, -e + P.lInlineOff + P.lInline * (pass ? 0.7 : 1), ic);
		}
		if (P.lOutline > 0) {
			for (let pass = 0; pass < passes; pass++) {
				const w = P.lOutline * (pass ? 0.7 : 1);
				band(pass ? path(contours, true, pass) : LP, -e - w / 2, -e + w / 2, P.lOutlineColor);
			}
		}
	};
	if (L.contours.length) {
		if (P.lWeave === 'none' || L.parts.length < 2) paintLetter(L.contours, scene.echo, 0, false);
		else {
			L.parts.forEach(part => paintLetter(part, null, P.lWeaveGap, true));
			// at alternate crossings the earlier letter comes back over the top
			for (const cr of scene.crossings || []) {
				const r = scene.cell * 0.9 + P.lWeaveGap + Math.max(P.lOutline, P.lEcho * P.lEchoGap) + Math.max(0, e) + 2;
				const clip = new Path2D();
				for (const [x0, y0] of cr.cells) {
					let x = x0, y = y0;
					if (wob) [x, y] = wob(x, y, 0);
					clip.moveTo((x + r) * k, y * k); clip.arc(x * k, y * k, r * k, 0, TAU);
				}
				c.save(); c.clip(clip, 'nonzero');
				paintLetter(L.parts[cr.top], null, P.lWeaveGap, true);
				c.restore();
			}
		}
	}

	// rules and bands on top
	if (!geo.none) {
		for (const r of geo.rules) {
			if (P.fRuleStyle === 'beads') {
				const dots = resample(r.pts, Math.max(3, r.w * 1.7), true).map(([x, y]) => [x, y, Math.max(0.8, r.w * 0.55)]);
				fill(c, dotsPath(dots), P.fRuleColor);
			} else if (P.fRuleStyle === 'dashed') {
				c.setLineDash([Math.max(2, r.w * 2.4) * k, Math.max(2, r.w * 1.6) * k]);
				strokeLines(c, [r.pts], P.fRuleColor, r.w, true);
				c.setLineDash([]);
			} else if (P.fRuleStyle === 'double' && r.w >= 3) {
				const h = Math.max(0.7, r.w * 0.2);
				strokeLines(c, [offsetPolygon(geo.base, r.inset - r.w / 2 + h / 2), offsetPolygon(geo.base, r.inset + r.w / 2 - h / 2)], P.fRuleColor, h, true);
			} else strokeLines(c, [r.pts], P.fRuleColor, r.w, true);
		}
		if (geo.band) drawGeom(c, bandGeometry(P.fBand, geo.band.pts, geo.band.width, P), P.fRuleColor, Math.max(0.8, geo.band.width * 0.09));
		if (P.fCorner !== 'none') drawGeom(c, cornerGeometry(P.fCorner, geo.field, P.fCornerSize, P), P.fCornerColor === 'auto' ? P.fRuleColor : P.fCornerColor, 1.5);
	}
	return pt.main;
}
