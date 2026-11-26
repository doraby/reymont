// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Bubbles: the biggest circle that fits, again and again, each stamped out of the room left.

export default {
	family: 'texture', name: 'bubbles',
	grow({ field, o, out, s, gap }) {
		const rmax = Math.max(o.size * 3, s * 1.5), rmin = Math.max(0.8, o.size * 0.35);
		for (let n = 0; n < 2500; n++) {
			const b = field.biggest();
			const r = Math.min(b.d - gap, rmax);
			if (r < rmin) break;
			field.stamp(b.x, b.y, r);
			if (o.style === 'ring') out.rings.push([b.x, b.y, r - o.size * 0.25]);
			else if (o.style === 'target') { out.rings.push([b.x, b.y, r - o.size * 0.25]); if (r > o.size * 2) out.dots.push([b.x, b.y, r * 0.35]); }
			else out.dots.push([b.x, b.y, r]);
		}
	},
};
