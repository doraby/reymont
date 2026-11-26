// A pattern that follows the shape it fills (worked out per pixel from its mask): fern frost:
// needles from scattered specks, bending with the glass's grain, barbs at sixty degrees and
// barblets on the barbs, every tip stopping at ice or the edge.
// put(i, coverage, when) sets each pixel and when (0..1) it arrives as the fill comes in; or set
// k.frame,
// or return { final, frame } for a fill that comes in its own way.

import { depth } from '../../fill.js?v=a8136959';
import { frost, mycelium, spine } from '../../relief.js?v=a8136959';

export default {
	family: 'pattern', name: 'frost',
	follows: true,
	fill({ kind, a, size, sp, w, rgba, seed }) {
		const d = depth(a, size);
		const C = Math.max(1.2, sp * (kind === 'frost' ? 0.5 : 0.6));
		const { segs, rounds } = kind === 'frost' ? frost(d, size, sp, C, seed) : mycelium(d, size, sp, C, seed);
		const widths = kind === 'frost' ? [1, 0.62, 0.42] : null;
		const cv = new OffscreenCanvas(size, size), x = cv.getContext('2d', { willReadFrequently: true });
		let dots = [];
		const draw = (until) => {
			x.clearRect(0, 0, size, size);
			x.strokeStyle = x.fillStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
			for (const [x0, y0, x1, y1, gen, at] of segs) {
				if (at > until) continue;
				x.lineWidth = Math.max(0.7, widths ? w * widths[Math.min(2, gen)] : w * Math.max(0.42, 1.35 - 0.16 * gen));
				x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
			}
			x.beginPath();
			for (const [sx, sy, sr, at] of dots) if (at <= until) { x.moveTo(sx + sr, sy); x.arc(sx, sy, sr, 0, Math.PI * 2); }
			x.fill();
			return x.getImageData(0, 0, size, size).data;
		};
		// the spine along whatever thin strokes the growth left bare, so every part of the shape shows
		dots = spine(d, size, C, segs, rounds, draw(Infinity), Math.max(0.7, w));
		const masked = (px) => rgba(i => a[i] > 0 ? Math.round(px[i * 4 + 3] * a[i]) : 0);
		// paced by how much has grown, not by round: the last stragglers would otherwise take half the time
		const grown = new Float64Array(rounds + 2);
		for (const [x0, y0, x1, y1, , at] of segs) grown[Math.min(rounds, at) + 1] += Math.hypot(x1 - x0, y1 - y0);
		for (const [, , sr, at] of dots) grown[Math.min(rounds, Math.ceil(at)) + 1] += sr * 2;
		for (let k = 1; k < grown.length; k++) grown[k] += grown[k - 1];
		const total = grown[grown.length - 1] || 1;
		const roundAt = (t) => { let k = 0; while (k < rounds && grown[k + 1] < t * total) k++; return k; };
		return { final: masked(draw(Infinity)), frame: (t) => masked(draw(roundAt(t))) };
	},
};
