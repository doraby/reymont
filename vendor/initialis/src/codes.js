// An initial as text: the links and codes that carry its settings. Apart from breed.js so that reading
// an initial (the library, a share link) doesn't need the styles that make new ones.

import { DEFAULTS } from '../render/src/params.js?v=a8136959';

// The blown-up letter (the renderer's lBlob) is parked: the field keeps to the faces as cut, and the
// edit view doesn't offer it. true brings it back, in these faces only and clamped.
export const BLOW_UP = false;
// generations in the URL: the seed, and for a bred field the root's cell and its initial
// (as its differences from the defaults)
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export function diff(P) {
	const d = {};
	for (const k in P) if (k in DEFAULTS && P[k] !== DEFAULTS[k]) d[k] = P[k];
	return d;
}
export function encodeGen(g) {
	return g.root ? `${g.seed}.${g.root.q}.${g.root.r}.${b64(JSON.stringify(diff(g.root.P)))}` : String(g.seed);
}
export function decodeGen(s) {
	try {
		const [seed, q, r, P] = s.split('.');
		if (!/^\d+$/.test(seed)) return null;
		if (P === undefined) return { seed: +seed, root: null };
		const root = { ...DEFAULTS, ...JSON.parse(unb64(P)) };
		if (!BLOW_UP) root.lBlob = 0;
		return { seed: +seed, root: { q: +q, r: +r, P: root } };
	} catch { return null; }
}
// a key for an initial: its differences from the defaults, as base64 (a share link's ?i= too)
export const keyHash = P => b64(JSON.stringify(diff(P)));
// a share link's code: the settings deflated, as URL-safe base64, after "z." (half as long as
// keyHash's); keyHash's own codes read too
const bytesB64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const pipe = (bytes, stream) => new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
export async function shareCode(P) {
	if (typeof CompressionStream === 'undefined') return keyHash(P);
	return 'z.' + bytesB64(new Uint8Array(await pipe(new TextEncoder().encode(JSON.stringify(diff(P))), new CompressionStream('deflate-raw'))));
}
// a whole collection in one link (#c=…): their settings deflated together, about 460 characters an
// initial. After the # it never reaches the server, so there's no limit on how many
export async function collectionCode(Ps) {
	return 'z.' + bytesB64(new Uint8Array(await pipe(new TextEncoder().encode(JSON.stringify(Ps.map(diff))), new CompressionStream('deflate-raw'))));
}
export async function decodeCollection(code) {
	try {
		const list = JSON.parse(new TextDecoder().decode(await pipe(Uint8Array.from(atob(code.slice(2).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)), new DecompressionStream('deflate-raw'))));
		if (!Array.isArray(list)) return null;
		return list.filter(d => d && typeof d === 'object').map(d => { const P = { ...DEFAULTS, ...d }; if (!BLOW_UP) P.lBlob = 0; return P; });
	} catch { return null; }
}
// Short links (?i=<id>, ?c=<id>): the site keeps the settings (functions/api/s.js) under an id that
// is a hash of them, so the same initial always gets the same link, and nothing but settings can be
// kept. The settings with their keys in order, and the id: FNV-1a (64 bits) of the kind ("i" one
// initial, "c" a collection) and the settings, as ten base-62 characters. The site works it out the
// same way, and keeps only what matches.
const sorted = d => { const o = {}; for (const k of Object.keys(d).sort()) o[k] = d[k]; return o; };
export const shareBody = (k, x) => JSON.stringify(k === 'i' ? sorted(diff(x)) : x.map(P => sorted(diff(P))));
const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function shareId(k, body) {
	let h = 0xcbf29ce484222325n;
	for (const b of new TextEncoder().encode(k + ':' + body)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
	let id = '';
	for (let i = 0; i < 10; i++) { id += B62[Number(h % 62n)]; h /= 62n; }
	return id;
}
export const isShareId = s => /^[0-9A-Za-z]{10}$/.test(s);
// what a short link holds, from the site: one initial, or a collection's; null if it isn't there
export async function fetchShared(k, id) {
	try {
		// from the site this file is on (the library can be on someone else's page)
		const r = await fetch(new URL('../api/s?id=' + id, import.meta.url));
		if (!r.ok) return null;
		const j = await r.json();
		if (!j || j.k !== k) return null;
		const P = d => { const P = { ...DEFAULTS, ...d }; if (!BLOW_UP) P.lBlob = 0; return P; };
		return k === 'i' ? P(j.d) : j.d.map(P);
	} catch { return null; }
}
// and back: a share link's initial, or null if the code doesn't read
export async function decodeInitial(code) {
	if (isShareId(code)) return fetchShared('i', code);
	try {
		const json = code.startsWith('z.')
			? new TextDecoder().decode(await pipe(Uint8Array.from(atob(code.slice(2).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)), new DecompressionStream('deflate-raw')))
			: unb64(code);
		const P = { ...DEFAULTS, ...JSON.parse(json) };
		if (!BLOW_UP) P.lBlob = 0;
		return P;
	} catch { return null; }
}
