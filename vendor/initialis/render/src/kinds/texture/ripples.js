// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Ripples: lines at even distances from everything, like water round stones.

export default {
	family: 'texture', name: 'ripples',
	grow({ map, out, s, gap, contour }) {
		// (a loop: the map is far too long to spread into Math.max, which Safari refuses)
		let top = 0;
		for (const d of map.d) if (d > top) top = d;
		top = Math.min(600, top);
		for (let lv = gap + s * 0.5; lv < top; lv += s) out.lines.push(...contour(map, lv));
	},
};
