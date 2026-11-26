// Форма «box» для INITIĀLIS: прямоугольник заданной ширины и высоты (доли от квадрата 1000×1000) по центру.
// Нужна, чтобы виньетка могла быть не квадратной: орнамент растёт внутри формы, а лишние поля картинки
// потом обрезаются по её границам (см. lab/vignette.html). Скругление углов — fBoxR (доля от меньшей стороны).

export default {
	family: 'frame', name: 'box',
	params: [
		['fBoxW', 'frame', 'geo', 1, [0.1, 1, 0.01], 'box width'],
		['fBoxH', 'frame', 'geo', 0.4, [0.1, 1, 0.01], 'box height'],
		['fBoxR', 'frame', 'geo', 0, [0, 0.5, 0.01], 'box corner radius'],
	],
	poly({ cx, cy, w, h, pts, arc, TAU, settings }) {
		const bw = w * (settings.fBoxW ?? 1), bh = h * (settings.fBoxH ?? 0.4);
		const x0 = cx - bw / 2, y0 = cy - bh / 2, x1 = cx + bw / 2, y1 = cy + bh / 2;
		const r = Math.min(bw, bh) * (settings.fBoxR ?? 0);
		if (r < 1) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
		const q = TAU / 4, n = 8;
		arc(x1 - r, y0 + r, r, -q, 0, n);
		arc(x1 - r, y1 - r, r, 0, q, n);
		arc(x0 + r, y1 - r, r, q, 2 * q, n);
		arc(x0 + r, y0 + r, r, 2 * q, 3 * q, n);
		return pts;
	},
};
