// Frame shapes, the rules drawn around them, and the bands of beads/rope/waves between rules. Each
// shape, band and corner ornament is a module of its own (kinds/frame/, kinds/band/, kinds/corner/);
// this lays out the rules and calls them.

import { offsetPolygon, resample, TAU, polyLength } from './util.js?v=a8136959';
import { blade, circlePoly } from './shapes.js?v=a8136959';
import { kind as kindOf } from './kinds.js?v=a8136959';
import { BY_KEY } from './params.js?v=a8136959';

export const FRAMES = BY_KEY.frame.spec;

export function framePoly(kind, x, y, w, h, settings = {}) {
	const cx = x + w / 2, cy = y + h / 2;
	const pts = [];
	const arc = (ax, ay, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]); } };
	// one nobody has is a plain rectangle
	const m = kindOf('frame', kind) || kindOf('frame', 'rect');
	return m.poly({ kind, x, y, w, h, cx, cy, pts, arc, TAU, settings });
}

// rules from outermost in; the field is whatever is inside the last one
export function frameGeometry(P, W, H) {
	const m = P.fMargin;
	const x = m, y = m, w = W - 2 * m, h = H - 2 * m;
	const kind = P.frame === 'none' ? 'rect' : P.frame;
	const base = framePoly(kind, x, y, w, h, P);
	const rules = [];
	let inset = 0;
	const n = P.frame === 'none' ? 0 : P.fRules;
	for (let i = 0; i < n; i++) {
		const rw = i === 0 ? P.fW1 : P.fW2;
		if (i > 0) inset += P.fGap;
		if (rw > 0) rules.push({ pts: offsetPolygon(base, inset + rw / 2), w: rw, inset: inset + rw / 2 });
		inset += rw;
	}
	const field = inset > 0 ? offsetPolygon(base, inset) : base;
	let band = null;
	if (n >= 2 && P.fBand !== 'none') {
		const a = P.fW1, b = P.fW1 + P.fGap;
		band = { pts: offsetPolygon(base, (a + b) / 2), width: P.fGap };
	}
	return { base, outer: base, field, rules, band, box: { x, y, w, h }, kind, none: P.frame === 'none' };
}

// ornament running along a closed path, in a band of the given width
export function bandGeometry(kind, path, width, settings = {}) {
	const out = { polys: [], lines: [], dots: [] };
	const L = polyLength([...path, path[0]]);
	const along = (step) => {
		const n = Math.max(8, Math.round(L / step));
		const pts = resample(path, L / n, true);
		const res = [];
		for (let i = 0; i < pts.length; i++) {
			const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[(i + 1) % pts.length];
			const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
			res.push({ x: pts[i][0], y: pts[i][1], a });
		}
		return res;
	};
	const w = width;
	const m = kindOf('band', kind);
	if (m) m.draw({ kind, out, path, width, L, along, w, blade, TAU, settings });
	return out;
}

// little things in the corners of the field
export function cornerGeometry(kind, field, size, settings = {}) {
	const out = { polys: [], lines: [], dots: [] };
	if (kind === 'none') return out;
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const [x, y] of field) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	const s = size;
	// where each diagonal from the middle meets the field's edge, pulled in by the size
	const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
	const hit = (dx, dy) => {
		let best = Infinity;
		for (let i = 0; i < field.length; i++) {
			const [ax, ay] = field[i], [bx, by] = field[(i + 1) % field.length];
			const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
			if (Math.abs(den) < 1e-9) continue;
			const t = ((ax - mx) * ey - (ay - my) * ex) / den, u = ((ax - mx) * dy - (ay - my) * dx) / den;
			if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
		}
		const L = Math.hypot(dx, dy);
		const t = best - s * 1.42 / L;
		return [mx + dx * t, my + dy * t];
	};
	const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => {
		const [cx, cy] = hit(dx * (x1 - x0), dy * (y1 - y0));
		return [cx, cy, -dx, -dy];
	});
	const m = kindOf('corner', kind);
	if (m) m.draw({ kind, out, corners, s, field, blade, circlePoly, TAU, settings });
	return out;
}
