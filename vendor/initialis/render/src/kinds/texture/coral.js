// A texture: marks grown over the field, keeping clear of everything already there (the letter,
// the frame's rules, the ornament) by gap px. at(x, y) is how far a point is from those, grad(x,
// y)
// which way is away from them; R is the texture's random stream; it adds polys, lines, dots, rings
// and strokes to out (out.strokeW: the strokes' width). o: the texture's settings (scale, size,
// gap, grade, shape, style, twist, seed).
// Coral: reaction-diffusion grown on the GPU (ink.js), as coral, spots, maze, holes or worms. This
// hands over where it may grow; the worker grows it before drawing.

export default {
	family: 'texture', name: 'coral',
	grow({ map, o, out, s, gap }) {
		// the GPU grows it; hand over where it may grow
		const { nx, ny, d } = map;
		const mask = new Uint8Array(nx * ny);
		for (let i = 0; i < mask.length; i++) mask[i] = d[i] > gap ? 255 : 0;
		out.coral = { mask, nx, ny, cell: map.cell, scale: s, style: o.style, seed: o.seed };
	},
};
