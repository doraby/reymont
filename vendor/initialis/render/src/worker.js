// A render worker: params in, ImageBitmap out. Growing, painting and the WebGL print pass all
// happen here, so the page stays responsive however heavy an initial is.

import { fontList, loadFont } from './fonts.js?v=a8136959';
import { Renderer, sceneStats } from './render.js?v=a8136959';
import { loadBlob } from './compose.js?v=a8136959';
import { need, use } from './kinds.js?v=a8136959';

// blown-up letters' strokes, traced once for every worker (blob/store.js)
const blown = Ps => Ps.filter(P => P.lBlob > 0).map(P => P.font + ':' + P.text);

// the page of text (In context, the montage) and blown-up letters: fetched the first time they're wanted
const pageKit = () => import('./page.js?v=a8136959');
const blobKit = () => import('./blob/store.js?v=a8136959');

// pages of text for the montage, laid out once per letter
let paras = null;
const pages = new Map();
async function page(letter, measure) {
	const key = letter + ':' + (measure || '');
	if (pages.has(key)) return pages.get(key);
	const { textFont, layoutPage, pagePath, hyphenator } = await pageKit();
	paras = paras || await fetch(new URL('../data/paragraphs.json', import.meta.url)).then(r => r.json());
	const font = await textFont();
	const L = layoutPage(font, paras[letter], await hyphenator(), measure);
	const pg = { L, path: pagePath(font, L), paths: new Map() };
	pages.set(key, pg);
	return pg;
}
async function pageLines(letter, n, measure) {
	const pg = await page(letter, measure);
	if (n === 0) return { L: pg.L, path: new Path2D() }; // the drop cap alone
	if (!pg.paths.has(n)) { const { textFont, pagePath } = await pageKit(); pg.paths.set(n, { L: pg.L, path: pagePath(await textFont(), pg.L, n) }); }
	return pg.paths.get(n);
}

// the loop's column of pages, and its camera samples for one frame: several across the shutter when
// the picture moves fast, averaged into motion blur
async function loopFrame(q) {
	const { stackBlocks, loopCam } = await pageKit();
	const { blocks: spec, u, du, shutter = 0.5 } = q.loop;
	const blocks = stackBlocks(await Promise.all(spec.map(async (b, i) => ({
		P: b.P, lines: b.lines, time: b.time ?? null, key: b.letter + ':' + i, page: await pageLines(b.letter, b.lines, q.measure),
	}))));
	const W = q.w, H = q.size;
	const at = (v) => loopCam(blocks, Math.min(1, Math.max(0, v)), W, H, q.loop.k0 || 0, q.frame);
	// how far the frame corners travel during the shutter, in px
	const a = at(u - du * shutter / 2), b = at(u + du * shutter / 2);
	let move = 0;
	for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]]) {
		const px = (sx - W / 2) / a.z + a.c[0], py = (sy - H / 2) / a.z + a.c[1];
		move = Math.max(move, Math.hypot((px - b.c[0]) * b.z + W / 2 - sx, (py - b.c[1]) * b.z + H / 2 - sy));
	}
	// a sample every ~2.5 px of travel, so the blur smears rather than showing separate copies
	const n = Math.max(1, Math.min(48, Math.ceil(move / 2.5)));
	const cams = n === 1 ? [at(u)] : Array.from({ length: n }, (_, i) => at(u + du * shutter * (i / (n - 1) - 0.5)));
	return { blocks, cams, n, move };
}

const ready = fontList().then(() => new Renderer());
const canvases = new Map();

// modules of someone's own (the library's use()), in the order they came, before anything after them
let extras = Promise.resolve();
self.onmessage = async (e) => {
	const q = e.data;
	if (q.use) { extras = extras.then(() => use(q.use)).catch(err => console.warn(err)); return; }
	try {
		const R = await ready;
		await extras;
		await loadFont(q.P.font);
		// the kinds (patterns, frames, leaves…) each initial draws with, fetched the first time
		await Promise.all([q.P, ...(q.loop ? q.loop.blocks.map(b => b.P) : [])].map(P => need(P, q.without)));
		const big = blown([q.P, ...(q.loop ? q.loop.blocks.map(b => b.P) : [])]);
		if (big.length) { await loadBlob(); await (await blobKit()).recall(big); }
		if (q.type === 'growth') {
			// when each grown thing appears, in growth units (0..timeline.orn), for the montage's sound
			const sc = R.scene(q.P, q.quality ?? 1, q.budget ?? 8000), o = sc.orn
			const out = { total: sc.timeline.orn, stems: [], leaves: [], flowers: [], dots: [] }
			if (o) {
				// with where each sits across the frame (0..1), for panning
				for (const st of o.stems) out.stems.push([st.t0, st.len, st.ws[0], st.pts.reduce((a, p) => a + p[0], 0) / st.pts.length / 1000])
				for (const l of o.leaves) out.leaves.push([l.t0 || 0, l.dur || 0, (l.bx ?? 500) / 1000])
				for (const f of o.flowers) out.flowers.push([f.t0 || 0, f.dur || 0, f.radius || 10, (f.cx ?? 500) / 1000])
				for (const d of [...o.dots, ...o.beads]) out.dots.push([d[3] || 0, d[2]])
			}
			self.postMessage({ id: q.id, growth: out })
			return
		}
		// q.w makes a wide frame (the initial centred); otherwise square
		const key = `${q.w || q.size}x${q.size}`;
		let c = canvases.get(key);
		if (!c) {
			const canvas = new OffscreenCanvas(q.w || q.size, q.size);
			c = { canvas, ctx: canvas.getContext('2d') };
			canvases.set(key, c);
		}
		const t0 = performance.now();
		let scene, extra = {};
		if (q.loop) {
			const { blocks, cams, n, move } = await loopFrame(q);
			for (const B of blocks) await loadFont(B.P.font);
			scene = R.drawBlocks(c.ctx, blocks, cams, { quality: q.quality, budget: q.budget });
			extra = { samples: n, move: Math.round(move) };
		} else if (q.page) scene = R.drawPage(c.ctx, q.P, q.bare ? await pageLines(q.page, 0, q.measure) : await page(q.page, q.measure), q.k ?? 0, { quality: q.quality, budget: q.budget, time: q.time ?? null, frame: q.frame, camAt: (await pageKit()).camAt });
		else {
			await R.prepare(q.P, { quality: q.quality, budget: q.budget, size: q.size });
			scene = R.draw(c.ctx, q.P, { quality: q.quality, own: q.own, budget: q.budget, time: q.time ?? null, clear: !!q.clear });
		}
		// a lost GPU (a phone under memory pressure drops contexts) draws blank without a word: this
		// worker can't draw any more, so say so, and the page starts another and asks again
		if (R.ink.gl.isContextLost()) { self.postMessage({ id: q.id, error: 'the GPU context was lost', lost: true }); return; }
		const stats = { ...(scene ? sceneStats(scene) : {}), ...extra, total: performance.now() - t0 };
		const bitmap = c.canvas.transferToImageBitmap();
		// one-off sizes (exports) shouldn't stay around
		if (q.once) { canvases.delete(key); R.painters.delete(q.size); }
		self.postMessage({ id: q.id, bitmap, stats }, [bitmap]);
		if (big.length) (await blobKit()).keep();
	} catch (err) {
		self.postMessage({ id: q.id, error: String(err && err.stack || err) });
	}
};
