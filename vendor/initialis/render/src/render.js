// Turns params into pixels: scene cache (geometry), painters per size, the shared ink pass.
// Runs inside the render workers (worker.js); the page only shows the bitmaps they send back.

import { buildScene, paintScene, Painter } from './compose.js?v=a8136959';
import { Ink } from './ink.js?v=a8136959';
import { PARAMS } from './params.js?v=a8136959';
import { getFont, fontInfo } from './fonts.js?v=a8136959';

const PAINT_SIZES = [192, 272, 384, 544, 768, 1088];
const CHANNEL = { A: '#ff0000', B: '#00ff00', C: '#0000ff' };
const lum = h => { const v = parseInt(h.slice(1), 16); return (0.3 * (v >> 16 & 255) + 0.59 * (v >> 8 & 255) + 0.11 * (v & 255)) / 255; };
// text goes in the darkest of the style's inks, as books keep colour for the initial
const textInk = P => ['A', 'B', 'C'].sort((a, b) => lum(P['ink' + a]) - lum(P['ink' + b]))[0];

// the settings that change the scene, and what's painted (worked out again if a module adds some)
let seen = 0, GEO = [], PAINT = [];
const stages = () => {
	if (seen === PARAMS.length) return;
	seen = PARAMS.length;
	GEO = PARAMS.filter(p => p.stage === 'geo').map(p => p.key);
	PAINT = PARAMS.filter(p => p.stage !== 'ink').map(p => p.key);
};
const sig = (P, keys) => { stages(); return keys().map(k => P[k]).join('\u0001'); };

export class Renderer {
	constructor() {
		this.ink = new Ink();
		this.painters = new Map();
		this.scenes = new Map();
		this.last = new Map(); // painter -> paint signature
	}
	painter(size, own) {
		const key = own ? `${own}:${size}` : size;
		if (!this.painters.has(key)) this.painters.set(key, new Painter(size));
		return this.painters.get(key);
	}
	scene(P, quality, budget) {
		const key = sig(P, () => GEO) + '\u0002' + quality;
		let s = this.scenes.get(key);
		if (s) { this.scenes.delete(key); this.scenes.set(key, s); return s; }
		const info = fontInfo(P.font);
		const t0 = performance.now();
		s = buildScene(P, getFont(P.font), { quality, budget, initials: info && info.group === 'initials' });
		s.ms = performance.now() - t0;
		this.scenes.set(key, s);
		while (this.scenes.size > 40) this.scenes.delete(this.scenes.keys().next().value);
		return s;
	}
	// before draw(): build the scene, and grow its coral (if it has one) for this size in batches that
	// leave the GPU free for the page between them (ink.js coralAsync); draw() then finds it ready
	async prepare(P, { quality = 1, budget = 1500, size }) {
		const scene = this.scene(P, quality, budget);
		if (scene.tex && scene.tex.coral) {
			scene.coralImg = scene.coralImg || {};
			if (!scene.coralImg[size] && this.ink.coralAsync) { const t0 = performance.now(); scene.coralImg[size] = await this.ink.coralAsync(scene.tex.coral, size, quality); scene.t.coral = performance.now() - t0; }
		}
		return scene;
	}
	// draw P into ctx (its canvas size). `own` gives the view its own painter so ink-only changes
	// skip painting; `time` (0..1) paints the growth part way through, null paints it finished.
	// A wider canvas (video frames) gets the square initial centred, with the paper and its
	// grain carried out to the edges by the print pass.
	draw(ctx, P, { quality = 1, own = null, budget = 1500, time = null, clear = false } = {}) {
		const wide = ctx.canvas.width, size = ctx.canvas.height;
		const scene = this.scene(P, quality, budget);
		if (scene.tex && scene.tex.coral) {
			scene.coralImg = scene.coralImg || {};
			if (!scene.coralImg[size]) { const t0 = performance.now(); scene.coralImg[size] = this.ink.coral(scene.tex.coral, size, quality); scene.t.coral = performance.now() - t0; }
		}
		const pt = this.painter(size, own);
		const ps = sig(P, () => PAINT) + '\u0002' + quality + '\u0002' + time;
		if (!own || this.last.get(pt) !== ps) {
			const t0 = performance.now();
			paintScene(scene, P, pt, time);
			scene.t.paint = performance.now() - t0;
			this.last.set(pt, own ? ps : null);
		}
		let cov = pt.main;
		if (wide !== size) {
			if (!this.wide || this.wide.width !== wide || this.wide.height !== size) {
				this.wide = new OffscreenCanvas(wide, size);
				this.wideCtx = this.wide.getContext('2d');
			}
			this.wideCtx.fillStyle = '#000'; this.wideCtx.fillRect(0, 0, wide, size);
			this.wideCtx.drawImage(pt.main, Math.round((wide - size) / 2), 0);
			cov = this.wide;
		}
		const t1 = performance.now();
		const out = this.ink.render(cov, P, scene.seed, null, clear);
		if (clear) ctx.clearRect(0, 0, wide, size);
		ctx.drawImage(out, 0, 0, wide, size);
		// the copy out waits for the GPU, so this counts the whole print pass
		scene.t.ink = performance.now() - t1;
		return scene;
	}
}

// Pages of text in a column (a "galley"), each with its drop cap: blocks = [{P, page: {L, path}, y, h, gapTop, time, key}].
// cams = camera samples {z, c} in galley units; several are averaged into motion blur.
// Each block prints in its own pass with its own palette, its grain pinned to its own page, and
// fades in over the gap above it, so neighbouring papers blend between the pages.
Renderer.prototype.drawBlocks = function (ctx, blocks, cams, opts = {}) {
	const W = ctx.canvas.width, H = ctx.canvas.height;
	if (cams.length === 1) return this.drawSample(ctx, blocks, cams[0], W, H, opts);
	// heavy blur hides resolution: many samples render at half size
	const scale = cams.length > 6 ? 0.5 : 1, w = Math.round(W * scale), h = Math.round(H * scale);
	// average pairwise, like a binary counter, so dozens of 8-bit blends don't drift or band
	this.accPool = this.accPool || [];
	const take = () => {
		let c = this.accPool.find(c => !c.busy && c.cv.width === w && c.cv.height === h);
		if (!c) { const cv = new OffscreenCanvas(w, h); c = { cv, x: cv.getContext('2d') }; this.accPool.push(c); }
		c.busy = true; c.wt = 1;
		return c;
	};
	const merge = (A, B) => { A.x.globalAlpha = B.wt / (A.wt + B.wt); A.x.drawImage(B.cv, 0, 0); A.x.globalAlpha = 1; A.wt += B.wt; B.busy = false; };
	const stack = [];
	let first = null;
	for (const cam of cams) {
		const c = take();
		first = this.drawSample(c.x, blocks, { z: cam.z * scale, c: cam.c }, w, h, opts) || first;
		stack.push(c);
		while (stack.length > 1 && stack[stack.length - 1].wt === stack[stack.length - 2].wt) merge(stack[stack.length - 2], stack.pop());
	}
	while (stack.length > 1) merge(stack[stack.length - 2], stack.pop());
	ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(stack[0].cv, 0, 0, W, H);
	stack[0].busy = false;
	return first;
};

// one camera sample of the galley into target (W × H)
Renderer.prototype.drawSample = function (target, blocks, { z, c }, W, H, { quality = 1, budget = 8000 } = {}) {
	const mk = (k) => { const key = `${k}:${W}x${H}`; if (!this[key]) { const cv = new OffscreenCanvas(W, H); this[key] = { cv, x: cv.getContext('2d') }; } return this[key]; };
	const cov = mk('cov'), fade = mk('fade');
	let base = true, first = null; // the first page drawn covers everything; later ones fade in
	blocks.forEach((B, bi) => {
		const { L, path } = B.page, S = L.S;
		const scr = (y) => (y - c[1]) * z + H / 2;
		// on screen, and not hidden under the next page?
		if (bi > 0 && scr(B.gapTop) > H) return;
		// its paper shows until the next page has fully faded in above the top of the frame
		const next = blocks[bi + 1];
		if (next && scr(next.y - next.page.L.capH) - 2 < 0) return;
		const D = S * z;
		const size = PAINT_SIZES.find(s => s >= D * 0.98) || PAINT_SIZES[PAINT_SIZES.length - 1];
		const scene = this.scene(B.P, quality, budget);
		first = first || scene;
		if (scene.tex && scene.tex.coral) {
			scene.coralImg = scene.coralImg || {};
			if (!scene.coralImg[size]) scene.coralImg[size] = this.ink.coral(scene.tex.coral, size, quality);
		}
		const pt = this.painter(size, 'page:' + B.key);
		const ps = sig(B.P, () => PAINT) + '\u0002' + quality + '\u0002' + B.time;
		if (this.last.get(pt) !== ps) { paintScene(scene, B.P, pt, B.time); this.last.set(pt, ps); }
		// coverage: this block's initial and text only, the camera in the block's own coordinates
		const lc = [c[0], c[1] - B.y];
		const x = cov.x;
		x.setTransform(1, 0, 0, 1, 0, 0);
		x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
		const ox = W / 2 - lc[0] * z, oy = H / 2 - lc[1] * z;
		x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
		x.drawImage(pt.main, ox, oy, D, D);
		x.setTransform(z, 0, 0, z, ox, oy);
		x.fillStyle = CHANNEL[textInk(B.P)];
		x.fill(path);
		x.setTransform(1, 0, 0, 1, 0, 0);
		// print, pinned to this page: print units are the drop cap's 1000-unit square
		const zoom = z * S / H;
		const panDn = [(lc[0] - W / (2 * z)) * 1000 / S, (lc[1] - H / (2 * z)) * 1000 / S];
		const out = this.ink.render(cov.cv, B.P, scene.seed, { zoom, panDn, panUp: [panDn[0], -panDn[1] - 1000 / zoom] });
		if (base) { target.globalAlpha = 1; target.drawImage(out, 0, 0, W, H); base = false; return; }
		// fade in over the gap above
		const f = fade.x;
		f.globalCompositeOperation = 'copy';
		f.drawImage(out, 0, 0, W, H);
		f.globalCompositeOperation = 'destination-in';
		const y0 = Math.max(-1e4, scr(B.gapTop)), y1 = Math.min(1e4, scr(B.y - L.capH) - 2);
		const g = f.createLinearGradient(0, y0, 0, Math.max(y0 + 1, y1));
		g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
		f.fillStyle = g; f.fillRect(0, 0, W, H);
		f.globalCompositeOperation = 'source-over';
		target.drawImage(fade.cv, 0, 0);
	});
	return first;
};

// one page, the camera at progress k (0 = the drop cap fills the frame, 1 = the page); opts.camAt is
// page.js's, which the worker fetches only when there are pages to draw
Renderer.prototype.drawPage = function (ctx, P, page, k, opts = {}) {
	const W = ctx.canvas.width, H = ctx.canvas.height;
	const B = { P, page, y: 0, h: page.L.bottom, time: opts.time ?? null, key: P.text, gapTop: 0 };
	return this.drawBlocks(ctx, [B], [opts.camAt(page.L, k, W, H, opts.frame)], opts);
};

export function sceneStats(scene) {
	const o = scene.orn;
	return {
		missing: !!scene.letter.missing,
		ms: scene.ms,
		stems: o ? o.stems.length : 0, leaves: o ? o.leaves.length : 0, flowers: o ? o.flowers.length : 0,
		dots: o ? o.dots.length + o.beads.length : 0,
		texture: scene.tex ? scene.tex.kind : null,
		t: scene.t ? { ...scene.t } : {},
	};
}
