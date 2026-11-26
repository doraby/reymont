// Glyph analyses kept in IndexedDB, so the render workers share them and a reload doesn't trace the
// same letters again. A record per face and letter holds the analyses of its few shapes (a slant or
// a weight changes the shape), keyed by the glyph mask's hash. The draw itself can't wait, so the
// worker recalls a letter's analyses before drawing it and keeps any new ones after.
// Bump V when latin.js or hanzi.js trace differently, so old analyses are dropped.

import { traced, known } from './blob.js?v=a8136959';

const V = 1, STORE = 'analyses', PER_GLYPH = 8;
let db;
const open = () => db || (db = new Promise((ok) => {
	try {
		const r = indexedDB.open('incipit-blob', V);
		r.onupgradeneeded = () => { const d = r.result; if (d.objectStoreNames.contains(STORE)) d.deleteObjectStore(STORE); d.createObjectStore(STORE); };
		r.onsuccess = () => ok(r.result);
		r.onerror = r.onblocked = () => ok(null);
	} catch { ok(null); }
}));

// glyphs this worker has: found in the store, or traced itself. One not stored yet is asked for
// again next time, since another worker may have traced it meanwhile.
const have = new Set();
export async function recall(glyphs) {
	const want = glyphs.filter(g => !have.has(g));
	if (!want.length) return;
	const d = await open();
	if (!d) return;
	await new Promise((done) => {
		const t = d.transaction(STORE, 'readonly'), s = t.objectStore(STORE);
		for (const g of want) s.get(g).onsuccess = (e) => {
			if (!e.target.result) return;
			for (const [key, H] of e.target.result) known(key, H);
			have.add(g);
		};
		t.oncomplete = t.onerror = t.onabort = done;
	});
}

export async function keep() {
	if (!traced.length) return;
	const fresh = traced.splice(0);
	for (const [g] of fresh) have.add(g);
	const d = await open();
	if (!d) return;
	const by = new Map();
	for (const [g, key, H] of fresh) { if (!by.has(g)) by.set(g, []); by.get(g).push([key, H]); }
	const t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
	for (const [g, add] of by) {
		s.get(g).onsuccess = (e) => {
			const had = (e.target.result || []).filter(([k]) => !add.some(([a]) => a === k));
			s.put([...add, ...had].slice(0, PER_GLYPH), g);
		};
	}
}
