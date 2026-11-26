// A band: ornament running along the closed path between a frame's first two rules, in a band w px
// wide.
// along(step) gives points every step px round it, each { x, y, a } with a the direction there; it
// adds
// polys, lines and dots to out.
// A twisted rope.

export default {
	family: 'band', name: 'rope',
	draw({ out, along, w }) {
		for (const p of along(w * 0.55)) {
			const c = Math.cos(p.a), s = Math.sin(p.a), nx = -s, ny = c;
			const q = [];
			for (let i = 0; i <= 8; i++) {
				const t = i / 8 - 0.5;
				const u = t * w * 0.62 + Math.sin(t * Math.PI) * w * 0.1, v = t * w * 0.92;
				q.push([p.x + c * u + nx * v, p.y + s * u + ny * v]);
			}
			out.lines.push(q);
		}
	},
};
