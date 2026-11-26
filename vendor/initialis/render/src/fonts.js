// Font list (base letters + complete decorative-initial fonts), lazy loading through opentype.js,
// and glyph outlines flattened to point lists in a 1000-unit em, y down. A face whose manifest entry
// says `caps` comes as its capitals' outlines only (fonts/caps/<id>.json, made from the font
// files when the site is built), a few KB instead of the whole font file.

// paths resolve from this module, so the same code works in the page and in workers
const ROOT = new URL('../', import.meta.url);
const cache = new Map();
const loaded = new Map();
let list = null;

const WEIGHT = { 400: '', 500: 'Medium', 700: 'Bold', 900: 'Black' };

// a JSON file. Where fetching is blocked (an artifact's sandbox lets scripts load and nothing else), the
// npm package has the same data as a script beside it, x.js for x.json (tools/package.py)
const data = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); })
	.catch(() => import(String(url).replace(/\.json$/, '.js')).then(m => m.default));

export async function fontList() {
	if (list) return list;
	const base = await data(new URL('fonts/base/manifest.json', ROOT));
	let init = [];
	try { init = await data(new URL('fonts/initials/manifest.json', ROOT)); } catch { }
	list = [];
	for (const f of base) {
		const ws = Object.keys(f.files);
		for (const w of ws) {
			const label = ws.length > 1 && WEIGHT[w] ? `${f.name} ${WEIGHT[w]}` : f.name;
			const id = `${f.slug}-${w}`;
			list.push({ id, name: label, family: f.name, group: f.group, note: f.note, caps: !!f.caps, url: new URL(f.caps ? `fonts/caps/${id}.json` : `fonts/base/${f.files[w]}`, ROOT).href });
		}
	}
	for (const f of init) {
		list.push({
			id: `init-${f.slug}`, name: f.name, family: f.name, group: 'initials', style: f.style, note: f.notes,
			caps: !!f.caps, url: new URL(f.caps ? `fonts/caps/init-${f.slug}.json` : `fonts/initials/${f.file}`, ROOT).href, coverage: f.coverage, designer: f.designer, license: f.license, source: f.source, year: f.year,
		});
	}
	return list;
}

export function fontInfo(id) { return list && list.find(f => f.id === id); }

// opentype.js, only for a whole font file (a face shipped as capitals, or a page's text, doesn't
// need its 170 KB parsed before the first initial)
export const opentype = () => globalThis.opentype ? Promise.resolve(globalThis.opentype) : import('../vendor/opentype.min.js?v=a8136959').then(() => globalThis.opentype);

export function loadFont(id) {
	if (cache.has(id)) return cache.get(id);
	const info = fontInfo(id);
	if (!info) return Promise.resolve(null);
	const p = (info.caps ? data(info.url).then(capsFont) : fetch(info.url).then(r => Promise.all([r.arrayBuffer(), opentype()])).then(([buf, ot]) => ot.parse(buf))).then(font => {
		loaded.set(id, font);
		return font;
	}).catch(e => { console.warn('font', id, e); return null; });
	cache.set(id, p);
	return p;
}

export function getFont(id) { return loaded.get(id) || null; }

// a face as its capitals only, { upm, A: [advance, svg path data], … } in the font's own units, y
// down: as much of an opentype.js Font as glyphs() asks of one, scaled the way opentype.js scales,
// so the outlines match the font file's exactly. `caps` keeps the raw outlines (the edit view's face
// chips draw them).
function capsFont(caps) {
	const gs = new Map(), upm = caps.upm;
	return {
		unitsPerEm: upm, caps,
		charToGlyph(ch) {
			if (!gs.has(ch)) {
				const g = caps[ch];
				gs.set(ch, !g ? { index: 0, advanceWidth: 0, getPath: () => ({ commands: [] }) } : {
					index: 1, advanceWidth: g[0],
					getPath: (x, y, size) => {
						// (1 / upm) * size, not size / upm: opentype.js's own order, so the last bit agrees too
						const k = 1 / upm * size, s = c => ({ ...c, x: x + c.x * k, y: y + c.y * k, x1: x + c.x1 * k, y1: y + c.y1 * k, x2: x + c.x2 * k, y2: y + c.y2 * k });
						return { commands: pathCommands(g[1]).map(s) };
					},
				});
			}
			return gs.get(ch);
		},
	};
}
const ARGS = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
function pathCommands(d) {
	const t = d.match(/[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [], out = [];
	for (let i = 0; i < t.length;) {
		const type = t[i++], v = t.slice(i, i + ARGS[type]).map(Number);
		i += ARGS[type];
		if (type === 'Q') out.push({ type, x1: v[0], y1: v[1], x: v[2], y: v[3] });
		else if (type === 'C') out.push({ type, x1: v[0], y1: v[1], x2: v[2], y2: v[3], x: v[4], y: v[5] });
		else if (type === 'Z') out.push({ type });
		else out.push({ type, x: v[0], y: v[1] });
	}
	return out;
}

function flatten(commands) {
	const contours = [];
	let cur = null, px = 0, py = 0, sx = 0, sy = 0;
	const push = (x, y) => { cur.push([x, y]); px = x; py = y; };
	for (const c of commands) {
		if (c.type === 'M') {
			if (cur && cur.length > 2) contours.push(cur);
			cur = []; push(c.x, c.y); sx = c.x; sy = c.y;
		} else if (c.type === 'L') push(c.x, c.y);
		else if (c.type === 'Q') {
			const L = Math.hypot(c.x1 - px, c.y1 - py) + Math.hypot(c.x - c.x1, c.y - c.y1);
			const n = Math.max(2, Math.min(24, Math.ceil(L / 7)));
			const x0 = px, y0 = py;
			for (let i = 1; i <= n; i++) {
				const t = i / n, u = 1 - t;
				push(u * u * x0 + 2 * u * t * c.x1 + t * t * c.x, u * u * y0 + 2 * u * t * c.y1 + t * t * c.y);
			}
		} else if (c.type === 'C') {
			const L = Math.hypot(c.x1 - px, c.y1 - py) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2);
			const n = Math.max(2, Math.min(32, Math.ceil(L / 7)));
			const x0 = px, y0 = py;
			for (let i = 1; i <= n; i++) {
				const t = i / n, u = 1 - t;
				push(u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
					u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y);
			}
		} else if (c.type === 'Z') {
			if (cur && cur.length > 2) contours.push(cur);
			cur = null; px = sx; py = sy;
		}
	}
	if (cur && cur.length > 2) contours.push(cur);
	// drop the duplicated closing point
	for (const c of contours) {
		const a = c[0], b = c[c.length - 1];
		if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) c.pop();
	}
	return contours;
}

// one entry per character: contours at 1000 units/em, its advance, and whether the font lacks it
export function glyphs(font, text) {
	const out = [];
	let x = 0;
	for (const ch of [...text]) {
		const g = font.charToGlyph(ch);
		const scale = 1000 / font.unitsPerEm;
		const missing = !g || g.index === 0;
		const contours = missing ? [] : flatten(g.getPath(0, 0, 1000).commands);
		out.push({ ch, contours, adv: (g ? g.advanceWidth : 600) * scale, missing: missing || contours.length === 0 });
		x += out[out.length - 1].adv;
	}
	return out;
}
