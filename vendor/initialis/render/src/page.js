// A page of real text around the initial: the paragraph it opens, set in ET Book, justified,
// wrapped around a drop cap N lines deep, then the paragraphs that follow. Units are page units
// with the drop cap's box at the origin: [0, S] × [0, S].

import { opentype } from './fonts.js?v=a8136959';

const ROOT = new URL('../', import.meta.url);
let fontP = null;
export function textFont() {
	if (!fontP) fontP = Promise.all([fetch(new URL('fonts/text/et-book-roman-old-style-figures.ttf', ROOT)).then(r => r.arrayBuffer()), opentype()]).then(([b, ot]) => ot.parse(b));
	return fontP;
}

// Liang's hyphenation with TeX's US English patterns (data/hyph-en-us.*), as TeX does it:
// at least 2 letters before a break and 3 after
export function makeHyphenator(patText, exText = '') {
	const pats = new Map();
	let maxLen = 0;
	for (const p of patText.split(/\s+/)) {
		if (!p) continue;
		const letters = p.replace(/\d/g, '');
		const vals = new Array(letters.length + 1).fill(0);
		let pos = 0;
		for (const ch of p) { if (ch >= '0' && ch <= '9') vals[pos] = +ch; else pos++; }
		pats.set(letters, vals);
		maxLen = Math.max(maxLen, letters.length);
	}
	const ex = new Map();
	for (const w of exText.split(/\s+/)) if (w) ex.set(w.replace(/-/g, ''), w.split('-').slice(0, -1).reduce((a, part) => [...a, (a[a.length - 1] || 0) + part.length], []));
	// positions inside word where it may break
	return (word) => {
		const low = word.toLowerCase();
		if (ex.has(low)) return ex.get(low);
		const s = '.' + low + '.', pts = new Array(s.length + 1).fill(0);
		for (let i = 0; i < s.length; i++) for (let j = i + 1; j <= Math.min(s.length, i + maxLen); j++) {
			const v = pats.get(s.slice(i, j));
			if (v) for (let k = 0; k < v.length; k++) pts[i + k] = Math.max(pts[i + k], v[k]);
		}
		const out = [];
		for (let p = 2; p <= word.length - 3; p++) if (pts[p + 1] % 2) out.push(p);
		return out;
	};
}
let hyphP = null;
export function hyphenator() {
	if (!hyphP) hyphP = Promise.all(['data/hyph-en-us.pat.txt', 'data/hyph-en-us.hyp.txt'].map(f => fetch(new URL(f, ROOT)).then(r => r.text()))).then(([p, e]) => makeHyphenator(p, e));
	return hyphP;
}

export const PAGE = { fs: 22, lh: 30, measure: 600, lines: 3, maxLines: 30 };

const OPTS = { kerning: true, features: { liga: true, kern: true } };

// a word as glyph runs [{text, scale}]: small caps are capitals at two sizes
function runs(word, small) {
	if (!small) return [{ text: word, scale: 1 }];
	const out = [];
	for (const ch of word) {
		const scale = ch !== ch.toUpperCase() ? 0.76 : 1;
		const last = out[out.length - 1];
		if (last && last.scale === scale) last.text += ch.toUpperCase();
		else out.push({ text: ch.toUpperCase(), scale });
	}
	return out;
}

// opt: lines (how deep the drop cap is), maxLines, and indent(line) → units to keep clear at that
// line's left instead of the drop cap's box (to hug the initial's own shape)
export function layoutPage(font, par, hyph = null, measure = PAGE.measure, opt = {}) {
	const { fs, lh } = PAGE;
	const N = opt.lines ?? PAGE.lines, maxLines = opt.maxLines ?? PAGE.maxLines;
	const upm = font.unitsPerEm;
	const capH = ((font.tables.os2 && font.tables.os2.sCapHeight) || upm * 0.66) / upm * fs;
	const S = capH + (N - 1) * lh;           // the drop cap box: first line's cap height to the Nth baseline
	const gap = fs * 0.55;
	const space = font.getAdvanceWidth(' ', fs);
	const hyphenW = font.getAdvanceWidth('-', fs);
	const track = fs * 0.06;                  // small caps get a little air

	const width = (w) => {
		let x = 0;
		for (const r of w.runs) x += font.getAdvanceWidth(r.text, fs * r.scale, OPTS) + (r.scale < 1 ? track * r.text.length : 0);
		return x;
	};
	// paragraphs → words. The first paragraph loses its first letter to the initial; its first two words go in small caps.
	const paras = [par.text.slice(1), ...(par.next || [])];
	const lines = [];
	let y = capH; // first baseline
	paras.forEach((text, pi) => {
		if (lines.length >= maxLines) return;
		// words in pieces a line may break between: after em dashes and hyphens, and at hyphenation
		// points (hy: breaking there adds a hyphen). A "tight" piece has no space before it.
		const words = [];
		text.split(' ').filter(Boolean).forEach((t, wi) => {
			const small = pi === 0 && wi < 2;
			t.split(/(?<=—)|(?<=[a-z]-)(?=[a-z])/i).forEach((part, k) => {
				const m = part.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
				const cuts = hyph && !small && m && m[2].length >= 6 ? hyph(m[2]) : [];
				let prev = 0;
				const pieces = [];
				for (const c of cuts) { pieces.push(part.slice(prev, m[1].length + c)); prev = m[1].length + c; }
				pieces.push(part.slice(prev));
				pieces.forEach((pc, q) => words.push({ t: pc, tight: k > 0 || q > 0, hy: q < pieces.length - 1, runs: runs(pc, small) }));
			});
		});
		for (const w of words) w.w = width(w);
		const L0 = lines.length;
		const avail = (l) => {
			const ind = opt.indent ? opt.indent(L0 + l) : L0 + l < N ? S + gap : 0;
			return measure - (ind > 0 ? ind : l === 0 && pi > 0 ? fs * 1.4 : 0);
		};
		// whole-paragraph line breaking: choose every break at once so the spacing stays even.
		// best[i][l] = least cost to set words [0, i) in l lines
		const n = words.length, maxL = Math.min(maxLines - L0, n);
		const best = Array.from({ length: n + 1 }, () => new Float64Array(maxL + 1).fill(Infinity));
		const from = Array.from({ length: n + 1 }, () => new Int32Array(maxL + 1).fill(-1));
		best[0][0] = 0;
		for (let j = 0; j < n; j++) for (let l = 0; l < maxL; l++) {
			if (best[j][l] === Infinity) continue;
			if (j > 0 && words[j].tight && !words[j - 1].hy && !/[—-]$/.test(words[j - 1].t)) continue;
			const A = avail(l);
			let sum = 0, gaps = 0;
			for (let i = j + 1; i <= n; i++) {
				sum += words[i - 1].w;
				if (i > j + 1 && !words[i - 1].tight) gaps++;
				const last = i === n;
				// a break inside a word: legal only at its hyphenation points, and it costs a hyphen
				if (!last && words[i].tight && !words[i - 1].hy && !/[—-]$/.test(words[i - 1].t)) continue;
				const hyphen = !last && words[i].tight && words[i - 1].hy;
				const natural = sum + gaps * space + (hyphen ? hyphenW : 0);
				// badness as in TeX: spaces stretch by 60% and shrink by 30% for 100; beyond that it grows
				// with the cube, uncapped, so one awful line never hides behind a few merely loose ones
				let bad;
				if (natural <= A) bad = last ? 0 : gaps ? 100 * Math.pow((A - natural) / (gaps * space * 0.6), 3) : i - j > 1 ? 1e5 : 1e6;
				else if (gaps && natural - gaps * space * 0.3 <= A) bad = 100 * Math.pow((natural - A) / (gaps * space * 0.3), 3);
				else if (gaps) break;
				else bad = 1e6; // one word too long for the line
				const cost = best[j][l] + Math.pow(10 + bad, 2) + (hyphen ? 3000 : 0);
				if (cost < best[i][l + 1]) { best[i][l + 1] = cost; from[i][l + 1] = j; }
			}
		}
		let lBest = -1;
		for (let l = 1; l <= maxL; l++) if (best[n][l] < Infinity && (lBest < 0 || best[n][l] < best[n][lBest])) lBest = l;
		if (lBest < 0) return;
		const breaks = [];
		for (let i = n, l = lBest; l > 0; i = from[i][l], l--) breaks.unshift([from[i][l], i]);
		breaks.forEach(([j, i], l) => {
			const row = words.slice(j, i), A = avail(l), gaps = row.filter((w, k) => k > 0 && !w.tight).length;
			if (i < n && words[i].tight && row[row.length - 1].hy) row.push({ t: '-', tight: true, runs: [{ text: '-', scale: 1 }], w: hyphenW });
			const sw = i < n && gaps > 0 ? (A - row.reduce((a, w) => a + w.w, 0)) / gaps : space;
			let x = measure - A;
			lines.push({ y, words: row.map((w, k) => { if (k > 0 && !w.tight) x += sw; const o = { x, w }; x += w.w; return o; }) });
			y += lh;
		});
	});
	return { S, capH, lines, bottom: y - lh, measure, fs };
}

// the whole page as one Path2D in page units (optionally only its first n lines)
export function pagePath(font, L, n = Infinity) {
	let d = '';
	const track = L.fs * 0.06;
	for (const line of L.lines.slice(0, n)) for (const { x, w } of line.words) {
		let cx = x;
		for (const r of w.runs) {
			const size = L.fs * r.scale;
			if (r.scale === 1) {
				d += font.getPath(r.text, cx, line.y, size, OPTS).toPathData(2);
				cx += font.getAdvanceWidth(r.text, size, OPTS);
			} else for (const ch of r.text) {
				d += font.getPath(ch, cx, line.y, size, OPTS).toPathData(2);
				cx += font.getAdvanceWidth(ch, size, OPTS) + track;
			}
		}
	}
	return new Path2D(d);
}

// The camera at progress k (0..1): k = 0 has the drop cap filling the frame's height, k = 1 shows
// the page. Zoom moves in log space and the centre moves linearly in 1/zoom, which makes it a
// zoom about one fixed point, like pulling back from the page.
// The drop cap fits the frame's short side; the page view is 520 units tall or the column plus margins
// wide, whichever is tighter (wide frames are limited by height, tall ones by width).
// frame { fit, lift, head, margin }, to stay clear of the buttons and caption an app lays over the
// video: the drop cap starts at fit × the frame's width and lift × H above the middle; the page view
// leaves head units above the drop cap and margin units beside the column
export function camAt(L, k, W, H, { fit = 1, lift = 0, head = 60, margin = 50 } = {}) {
	const z0 = fit * Math.min(W, H) / L.S, c0 = [L.S / 2, L.S / 2 + lift * H / z0];
	const z1 = Math.min(H / 520, W / (L.measure + 2 * margin)), c1 = [L.measure / 2, -head + H / (2 * z1)];
	const z = Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * k);
	const g = (1 / z - 1 / z0) / (1 / z1 - 1 / z0);
	return { z, c: [c0[0] + (c1[0] - c0[0]) * g, c0[1] + (c1[1] - c0[1]) * g] };
}

// pages stacked in a column, a chapter break between each: blocks = [{page, lines, ...}] in order.
// Adds y (where its drop cap sits), h (to the end of its text) and gapTop (where the gap above starts).
export function stackBlocks(blocks, gap = 110) {
	let y = 0, prevEnd = 0;
	blocks.forEach((B, i) => {
		const L = B.page.L;
		B.y = i === 0 ? 0 : prevEnd + gap;
		// to below the last line (a page with no text ends at its drop cap)
		B.h = B.lines > 0 ? L.capH + (Math.min(B.lines, L.lines.length) - 1) * PAGE.lh + 8 : L.S + 8;
		B.gapTop = prevEnd;
		prevEnd = B.y + B.h;
	});
	return blocks;
}

const sineInOut = t => 0.5 - 0.5 * Math.cos(Math.PI * t);
const cubicInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = t => Math.min(1, Math.max(0, t));

// back to the start: from the first page's full view, scroll down the column and zoom into the last
// page's drop cap (k = 0, the montage's first frame). The scroll and the zoom overlap so it never
// stops between them, and the view pulls back while it moves fastest so several pages streak past.
export function loopCam(blocks, u, W, H, k0 = 0, frame) {
	const A = blocks[blocks.length - 1];
	const s = sineInOut(clamp01(u / 0.8));
	const k = 1 - (1 - k0) * cubicInOut(clamp01((u - 0.5) / 0.5)); // ends where the montage starts, k0
	const cA = camAt(A.page.L, k, W, H, frame);
	const dip = 1 + 0.75 * Math.sin(Math.PI * s);
	return { z: cA.z / dip, c: [cA.c[0], cA.c[1] + s * A.y] };
}
