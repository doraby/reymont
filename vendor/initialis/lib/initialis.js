// INITIĀLIS as a library: draw any initial into a canvas, still or growing in, or put one on a page
// with a tag. It works from any site: it brings its own render workers, and fetches the fonts (each
// face's capitals) from wherever this file is served.
//
// An initial is its settings: only what differs from the defaults (DEFAULTS and PARAMS in
// render/src/params.js), as in a downloaded .json's params or a share link's &format=json.
// They're the thing to keep in a page, and to change: { text: 'Q' } alone is a Q in the default
// style. Share links work too (?i=…, or just the code), but a short one is looked up on the site.
//
//   <script type="module" src="https://initialis.azlen.me/lib/initialis.js"></script>
//   <initialis-cap settings='{"text":"Q","font":"cinzel-700","frame":"circle","inkA":"#23305e"}' size="240" grow></initialis-cap>
//
//   import { draw, grow, settings, random } from 'https://initialis.azlen.me/lib/initialis.js';
//   await draw(canvas, { text: 'Q', frame: 'circle' });   // settings, a share link or code, a .json
//   await grow(canvas, P, { seconds: 2.4 });               // growing in, then holding
//   const P = await random(42);                            // a fresh one's, as the field makes them
//
// <initialis-cap> attributes: settings (JSON), or src (a share link or its code), or seed (a fresh
// one; none of them: a new one each load); size (css px, default 200); paper (printed on its paper,
// rather than the ink alone on a transparent ground); grow (grows in once it's on screen); loop
// (grows in again and again); use (URLs of kind modules, by spaces). It needs WebGL2 in web workers:
// any current Chrome, Edge or Firefox, Safari 17 or later.
//
// Every pattern, texture, frame, band, corner, leaf and flower is a small module, fetched only when
// an initial uses it. To add your own, write one (copy lib/examples/chevrons.js; render/src/kinds/
// README.md has each family) and load it with use(url), or the tag's use attribute: it can live on
// any site, and its name then works in settings like a built-in one.

import { DEFAULTS } from '../render/src/params.js?v=a8136959';
import { use as useHere } from '../render/src/kinds.js?v=a8136959';
import { FOLLOWS } from '../render/src/kinds/names.js?v=a8136959';
import { decodeInitial, decodeGen, isShareId, BLOW_UP } from '../src/codes.js?v=a8136959';

const QUALITY = 0.6, BUDGET = 8000;

// --- the render workers -------------------------------------------------------------------------

// A page on another site can't start a worker from here directly, so it starts one of its own that
// imports this site's (the files are served to anyone, CORS open). On demand, not at the top of the
// worker: a sandbox that lets scripts in can still refuse a worker's opening imports. What's sent to it
// meanwhile waits until it's there.
const WORKER = new URL('../render/src/worker.js?v=a8136959', import.meta.url);
function spawn() {
	if (WORKER.origin === location.origin) return new Worker(WORKER, { type: 'module' });
	const shim = URL.createObjectURL(new Blob([`const held = []; self.onmessage = e => held.push(e); import(${JSON.stringify(WORKER.href)}).then(() => held.forEach(e => self.onmessage(e)), e => self.postMessage({ error: String(e) }));`], { type: 'text/javascript' }));
	return new Worker(shim, { type: 'module' });
}
let slots = null, ids = 0;
const queue = [], extras = [];
function pump() {
	if (!slots) {
		slots = Array.from({ length: Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 4) / 2))) }, () => ({ w: spawn(), job: null }));
		for (const href of extras) for (const s of slots) s.w.postMessage({ use: href });
	}
	for (const s of slots) {
		if (s.job || !queue.length) continue;
		const j = s.job = queue.shift(), id = ++ids;
		s.w.onmessage = (e) => {
			s.job = null;
			// a worker that's failed is replaced (it may have lost its GPU, as phones do under memory
			// pressure, or be stuck with a module that wouldn't load), and the initial asked for
			// again, a couple of times, the last going on without whatever it can't get
			if (e.data.error) {
				s.w.terminate();
				s.w = spawn();
				for (const href of extras) s.w.postMessage({ use: href });
				if ((j.tries = (j.tries || 0) + 1) < 3) { queue.unshift(j); pump(); return; }
			}
			if (j.timed) j.timed(performance.now() - j.t0);
			if (e.data.error) j.fail(new Error(e.data.error)); else j.done(e.data.bitmap);
			pump();
		};
		s.w.onerror = (e) => { s.job = null; j.fail(new Error(e.message || 'INITIĀLIS: the render worker failed (it needs WebGL2 in workers)')); pump(); };
		j.t0 = performance.now();
		s.w.postMessage({ id, P: j.P, size: j.size, quality: QUALITY, budget: j.budget, clear: !j.paper, time: j.time, without: j.tries >= 2 });
	}
}

// a kind module of your own, by its URL (on a site that serves it with CORS, or your own page's): here,
// so its name and settings are known, and in the render workers, which do the drawing
export async function use(url) {
	const href = new URL(url, location.href).href;
	if (extras.includes(href)) return;
	await useHere(href);
	extras.push(href);
	if (slots) for (const s of slots) s.w.postMessage({ use: href });
}

// --- what to draw ---------------------------------------------------------------------------------

// An initial's full settings from: a share link (?i=…, short or long), its code, a field link
// (#seed.q.r.…, its middle initial), a downloaded .json (or its text), or settings (only what
// differs from the defaults is needed)
export async function settings(x) {
	if (x && typeof x === 'object') return full(x.params || x);
	let s = String(x || '').trim();
	if (s.startsWith('{')) { const o = JSON.parse(s); return full(o.params || o); }
	if (/^https?:/.test(s)) {
		const u = new URL(s), i = u.searchParams.get('i');
		// a short link's settings are kept by the site it's from
		if (i && isShareId(i)) {
			const r = await fetch(new URL('/api/s?id=' + i, u.origin));
			const j = r.ok ? await r.json() : null;
			if (!j || j.k !== 'i') throw new Error('INITIĀLIS: ' + s + ' has no initial (yet?)');
			return full(j.d);
		}
		if (i) s = i;
		else {
			const g = decodeGen(u.hash.slice(1).split('~')[0]);
			if (g && g.root) return g.root.P;
			throw new Error('INITIĀLIS: that link has no one initial in it (a collection link? use each of its initials)');
		}
	}
	const P = await decodeInitial(s);
	if (!P) throw new Error('INITIĀLIS: no initial in ' + JSON.stringify(s.slice(0, 40)));
	return P;
}
function full(d) {
	const P = { ...DEFAULTS, ...d };
	if (!BLOW_UP) P.lBlob = 0;
	return P;
}

// a fresh initial, as the field makes them (the same seed, the same initial)
let pool = null;
export async function random(seed = (Math.random() * 1e9) | 0) {
	// the styles and the font list, fetched the first time (drawing a given initial doesn't need them)
	pool = pool || Promise.all([
		import('../src/breed.js?v=a8136959'),
		import('../render/src/fonts.js?v=a8136959').then(m => m.fontList()),
		fetch(new URL('../render/data/kept.json', import.meta.url)).then(r => r.json()).catch(() => import(new URL('../render/data/kept.js?v=a8136959', import.meta.url).href).then(m => m.default)).catch(() => []),
	]).then(([breed, fonts, kept]) => { breed.setKept(kept); return { wild: breed.wild, fonts: breed.fieldFonts(fonts) }; });
	const { wild, fonts } = await pool;
	return wild(seed, fonts);
}

// --- drawing --------------------------------------------------------------------------------------

// the initial as an ImageBitmap, size px square. paper: printed on its paper (otherwise the ink on a
// transparent ground); time: part way through growing in (0..1), or finished (null); budget: ms the
// ornament may take to grow (it stops where it's got to, so a busy machine can grow a little less);
// timed: called with how many ms it took
export async function render(x, { size = 512, paper = false, time = null, budget = BUDGET, timed = null } = {}) {
	const P = await settings(x);
	return new Promise((done, fail) => { queue.push({ P, size: Math.round(size), paper, time, budget, timed, done, fail }); pump(); });
}

// into a canvas. size: its pixels (default: its width on the page, at the screen's resolution)
function fit(canvas, size) {
	const px = Math.round(size || (canvas.clientWidth || 200) * Math.min(2, devicePixelRatio || 1));
	if (canvas.width !== px || canvas.height !== px) canvas.width = canvas.height = px;
	if (!canvas.style.width && !canvas.clientWidth) canvas.style.width = canvas.style.height = px / Math.min(2, devicePixelRatio || 1) + 'px';
	return px;
}
const playing = new WeakMap(); // canvas -> its growth, so a new draw stops the last
export async function draw(canvas, x, { size, paper = false } = {}) {
	playing.delete(canvas);
	const px = fit(canvas, size), bm = await render(x, { size: px, paper });
	const c = canvas.getContext('2d');
	c.clearRect(0, 0, px, px);
	c.drawImage(bm, 0, 0);
	bm.close();
	return canvas;
}

// growing in, as it does in the field: whatever grows (ornament, texture, patterned fills) comes in
// over `seconds`, then it holds. Frames render a few ahead of where it's showing; on a slow machine
// it plays as fast as they come. loop: again after `hold` seconds, until something else is drawn.
const grows = P => P.orn !== 'none' || P.tKind !== 'none' || P.lFil !== 'none' ||
	(P.lFill === 'pattern' && FOLLOWS.has(P.lPattern)) || (P.frame !== 'none' && FOLLOWS.has(P.fPattern));
const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
export async function grow(canvas, x, { size, paper = false, seconds = 2.4, fps = 15, loop = false, hold = 1.5 } = {}) {
	const P = await settings(x);
	if (!grows(P)) return draw(canvas, P, { size, paper });
	const me = {};
	playing.set(canvas, me);
	const px = fit(canvas, size), n = Math.max(2, Math.round(seconds * fps)), c = canvas.getContext('2d');
	const frames = [], want = i => { if (i < n && !frames[i]) frames[i] = render(P, { size: px, paper, time: ease(i / (n - 1)) }); };
	do {
		let at = performance.now();
		for (let i = 0; i < n; i++) {
			for (let k = i; k < i + 4; k++) want(k);
			const bm = await frames[i];
			if (playing.get(canvas) !== me) { bm.close(); return canvas; }
			const wait = at - performance.now();
			if (wait > 0) await new Promise(r => setTimeout(r, wait));
			c.clearRect(0, 0, px, px);
			c.drawImage(bm, 0, 0);
			// looping, the frames are kept to play again; otherwise each goes once shown
			if (!loop) { bm.close(); frames[i] = null; }
			at = Math.max(performance.now(), at) + 1000 / fps;
		}
		if (loop) {
			await new Promise(r => setTimeout(r, hold * 1000));
			if (playing.get(canvas) !== me) return canvas;
		}
	} while (loop);
	playing.delete(canvas);
	return canvas;
}

// --- <initialis-cap> -------------------------------------------------------------------------------

class InitialisCap extends HTMLElement {
	static observedAttributes = ['settings', 'src', 'seed', 'use', 'size', 'paper', 'grow', 'loop'];
	connectedCallback() {
		if (!this.cv) {
			this.cv = document.createElement('canvas');
			this.cv.style.display = 'block';
			this.append(this.cv);
			if (!this.style.display) this.style.display = 'inline-block';
			this.setAttribute('role', 'img');
		}
		this.show();
	}
	attributeChangedCallback() { if (this.cv) this.show(); }
	disconnectedCallback() { playing.delete(this.cv); if (this.seen) this.seen.disconnect(); }
	async show() {
		const css = +this.getAttribute('size') || 200, dpr = Math.min(2, devicePixelRatio || 1);
		Object.assign(this.cv.style, { width: css + 'px', height: css + 'px' });
		const ticket = this.ticket = {};
		try {
			for (const url of (this.getAttribute('use') || '').split(/\s+/).filter(Boolean)) await use(url);
			const from = this.getAttribute('settings') || this.getAttribute('src');
			const P = from ? await settings(from) : await random(this.hasAttribute('seed') ? +this.getAttribute('seed') : undefined);
			if (this.ticket !== ticket) return;
			this.setAttribute('aria-label', this.getAttribute('aria-label') || `drop cap ${P.text}`);
			const opts = { size: Math.round(css * dpr), paper: this.hasAttribute('paper') };
			if (!this.hasAttribute('grow') && !this.hasAttribute('loop')) return draw(this.cv, P, opts);
			// grows in once it's on screen
			if (this.seen) this.seen.disconnect();
			this.seen = new IntersectionObserver((es) => {
				if (!es.some(e => e.isIntersecting)) return;
				this.seen.disconnect();
				if (this.ticket === ticket) grow(this.cv, P, { ...opts, loop: this.hasAttribute('loop') });
			});
			this.seen.observe(this);
		} catch (e) { console.warn(e); }
	}
}
if (!customElements.get('initialis-cap')) customElements.define('initialis-cap', InitialisCap);
