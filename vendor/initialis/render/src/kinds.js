// The renderer's kinds: every pattern, texture, frame shape, band, corner, leaf and flower is a small
// module of its own (kinds/<family>/<name>.js), registered here by name. The engine asks for one by
// name (kind('pattern', 'hatch')); need(P) loads the ones an initial uses before it's drawn, so a
// page or a worker only ever fetches what it draws. A module of your own registers the same way:
// use(url) imports and registers it, or register(module) if you've imported it yourself. What a
// module looks like, family by family: kinds/README.md.

import { NAMES, PARAMS_OF, FOLLOWS, HEADS } from './kinds/names.js?v=a8136959';
import { addParams, BY_KEY } from './params.js?v=a8136959';

export { NAMES, FOLLOWS, HEADS };
const registry = Object.fromEntries(Object.keys(NAMES).map(f => [f, new Map()]));
const builtIn = new Set(Object.entries(NAMES).flatMap(([f, ns]) => ns.map(n => f + '/' + n)));

// the build puts its version here, so one page load never mixes two deploys' modules
const STAMP = '?v=a8136959';
const loading = new Map();
// built-ins that couldn't be fetched, for a drawing told to go on without them
const gone = new Set();
// where a file can't have its kind's name: EasyPrivacy, in most ad blockers, blocks /pomegranate.js
const FILE = { pomegranate: 'pomegranate-fruit' };

// m: { family, name, …, draw (or whatever its family calls) }, or a list of them. A new name joins
// its family's settings (at the end); m.params (rows as in params.js) adds settings of its own.
export function register(m) {
	if (Array.isArray(m)) { m.forEach(register); return; }
	if (!m || !registry[m.family]) throw new Error(`INITIĀLIS: not a kind module (family must be one of ${Object.keys(registry).join(', ')})`);
	registry[m.family].set(m.name, m);
	if (!NAMES[m.family].includes(m.name)) {
		NAMES[m.family].push(m.name);
		for (const key of PARAMS_OF[m.family]) if (BY_KEY[key] && !BY_KEY[key].spec.includes(m.name)) BY_KEY[key].spec.push(m.name);
	}
	if (m.follows) FOLLOWS.add(m.name);
	if (m.head) HEADS.add(m.name);
	if (m.params) addParams(m.params);
}

// a kind that's here, or null for one nobody has (drawn as nothing). One that exists but hasn't been
// loaded is a mistake: need(P) should have run first.
export function kind(family, name) {
	const m = registry[family] && registry[family].get(name);
	if (m) return m;
	if (builtIn.has(family + '/' + name) && !gone.has(family + '/' + name)) throw new Error(`INITIĀLIS: the ${family} '${name}' isn't loaded (call need(P) before drawing)`);
	return null;
}

// A failed fetch isn't kept, so asking again tries again. (A worker's own imports remember a failure,
// so it takes a new worker to fetch that module again.) without: if it can't be had, the initial goes
// on without it, rather than not being drawn at all.
export function load(family, name, without = false) {
	if (!name || name === 'none' || registry[family].has(name)) return Promise.resolve();
	const key = family + '/' + name;
	if (!builtIn.has(key)) return Promise.resolve();
	if (!loading.has(key)) loading.set(key, import(new URL(`./kinds/${family}/${FILE[name] || name}.js${STAMP}`, import.meta.url).href).then(m => register(m.default)));
	return loading.get(key).catch(e => { loading.delete(key); if (!without) throw e; gone.add(key); });
}

// every kind an initial names, and the few the engine draws with whatever it names (hatching for
// shadows, the plain rectangle a frameless initial is laid out in, the trefoil of leafy filigree)
export function need(P, without = false) {
	const want = [['pattern', 'hatch'], ['frame', 'rect']];
	if (P.lFil === 'leafy') want.push(['leaf', 'trefoil']);
	for (const [family, keys] of Object.entries(PARAMS_OF)) for (const key of keys) want.push([family, P[key]]);
	return Promise.all(want.map(([f, n]) => load(f, n, without)));
}
// all of a family (or of every family), for tools that show them all
export function needAll(family = null) {
	return Promise.all(Object.entries(NAMES).filter(([f]) => !family || f === family).flatMap(([f, ns]) => ns.map(n => load(f, n, true))));
}

// a module of your own, by its URL (it can be on any site that serves it with CORS)
export async function use(url) {
	register((await import(url)).default);
}
