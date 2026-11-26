# Kinds: adding to the renderer

Every pattern, texture, frame shape, band, corner, leaf and flower is a small module of its own, one file per kind, registered by name. Settings name them (`fPattern: 'seigaiha'`), and only the ones an initial uses are fetched. To add one, write a module. You don't need to change the renderer.

The engine (`compose.js`) keeps the order of the layers: ground, frame, pattern, letter, ornament, texture, then the ink pass. Modules fill the slots in it. They don't paint: they return geometry (or, for fills that follow the shape, coverage), and the engine paints it in the initial's inks.

## Make one

1. Copy the nearest module. They're all short: `pattern/scales.js`, `texture/stipple.js`, `frame/lozenge.js`, `band/zigzag.js`, `corner/dots.js`, `leaf/heart.js`, `flower/star.js`. Or start from [lib/examples/chevrons.js](../../../lib/examples/chevrons.js), a complete pattern with a setting of its own.
2. Give it a `family` and a new `name`, and change what it draws.
3. Load it and name it in settings:

```js
import { use, draw } from 'https://initialis.azlen.me/lib/initialis.js';
await use('https://your.site/mine.js');                  // any URL served with CORS, or your own page's
await draw(canvas, { text: 'Q', fPattern: 'mine' });
```

```html
<initialis-cap use="https://your.site/mine.js" settings='{"text":"Q","fPattern":"mine"}'></initialis-cap>
```

A module loaded this way needs no imports: everything it draws with comes in as its argument. In a copy of the site you can instead add it here: put the file in `kinds/<family>/`, and add its name to the end of its list in `names.js`. (On the end, because variation picks a kind by its place in the list. If it follows the shape, or is a stem-end flower, add it to `FOLLOWS` or `HEADS` there too.)

## What a module looks like

```js
export default {
	family: 'pattern',
	name: 'chevrons',
	params: [['fChevronDepth', 'frame', 'paint', 0.6, [0.1, 2, 0.05], 'chevron depth']],  // optional
	geometry({ s, R, P, out, settings }) { /* add to out */ },
};
```

`params` adds settings of its own, as rows of the table in `params.js`: key, section (`letter`, `frame`, `orn`, `tex`, `ink`), stage (`geo` if it changes the layout, `paint` if it only changes what's painted), default, `[min, max, step]` or a list of choices, label. They then work like any other: in share links, in variation, in `settings` given to every module. A module can export a list of modules, too.

Keep randomness to the stream you're given (`r`, `R`), never `Math.random()`: an initial has to come out the same every time. All lengths are in the initial's units: it's 1000 across.

Every family gets `settings` (the initial's full settings) and these:

| Family | Setting | Function | Gets | Gives back |
|---|---|---|---|---|
| `pattern` | `lPattern`, `fPattern` | `geometry(k)` | `box` `{ x0, y0, x1, y1 }`, `o` (`scale`, `angle`, `weight`, `seed`), `s` spacing, `a` angle in radians, `c` `sn` its cos and sin, `cx` `cy` middle, `R` a radius covering the box, `r` random, `P(u, v)` a point turned to the angle round the middle, `hatch(angle, wavy)`, `circle(u, v, rad, from, to)`, `clipHalf(poly, m, d)` | adds to `out` `{ lines, polys, dots }`; the painter clips it to the shape |
| `pattern`, `follows: true` | same | `fill(k)` | `a` the shape's mask (0..1 per pixel), `n`, `size` px, `sp` spacing, `w` weight, `angle`, `seed`, `r` random, `depth()`, `shading()`, `put(i, coverage, when)`, `rgba(fn)` | sets each pixel with `put` (`when`, 0..1: when it arrives as the fill comes in); may set `k.frame = t => rgba`, or return `{ final, frame }` |
| `texture` | `tKind` | `grow(k)` | `o` (`scale`, `size`, `gap`, `grade`, `shape`, `style`, `twist`, `seed`), `field`, `map`, `at(x, y)` distance from what's there, `grad(x, y)` which way is away from it, `s`, `gap`, `W`, `H`, `R` random, `noise`, `sizeAt(c)`, `flowDir(x, y)`, `star`, `circle`, `clipRuns`, `contour`, `offsetPolygon`, `clamp`, `lerp`, `TAU` | adds to `out` `{ polys, lines, dots, rings, strokes }`, `out.strokeW` |
| `frame` | `frame` | `poly(k)` | the box `x`, `y`, `w`, `h`, `cx`, `cy`, `pts`, `arc(ax, ay, r, a0, a1, n)` (adds to `pts`), `TAU` | a closed list of points |
| `band` | `fBand` | `draw(k)` | `path`, `L` its length, `w` width, `along(step)` points `{ x, y, a }`, `blade`, `TAU` | adds to `out` `{ polys, lines, dots }` |
| `corner` | `fCorner` | `draw(k)` | `corners` `[cx, cy, sx, sy]` (`sx`, `sy`: ±1, which way is in), `s` size, `field`, `blade`, `circlePoly`, `TAU` | adds to `out` `{ polys, lines, dots }` |
| `leaf` | `oLeaf` | `draw(k)` | `o` (`x`, `y`, `dir`, `len`, `width`, `bend`, `curl`, `lobes`, `depth`, `serr`, `detail`), `blade(shape, o)`, `bladeDetail(b, kind)`, `bladeCover(b, step)`, `circlePoly`, `circleLine`, `resampleClosed`, `TAU`, `clamp` | `{ polys, lines, dots, cover }`; `cover` is discs `[x, y, r, t]` over the whole leaf (`t`: how far from its base, 0..1), for fitting it among the rest |
| `flower` | `oFlower` | `draw(k)` | `o` (`petals`, `detail`), `x`, `y`, `r`, `rot`, `ring(n, r0, r1, width, shape, off)`, `blade`, `bladeDetail`, `circlePoly`, `circleLine`, `TAU`, `clamp`; with `head: true` (it sits on the end of a stem) also `dir`, `P(u, v)` along and across the stem, `det` | adds to `out` `{ polys, lines, dots }`; sets `out.radius` to how far it reaches |

`blade(shape, o)` is a single blade along a bending axis, for leaves, petals and laurel. `shape` is a name (`lance`, `willow`, `ovate`, `teardrop`, `petal`, `boteh`, `acanthus`, `oak`) or a function `(t, side, o) => half width` (0..1) of your own.

## Check your work

Open [lib/check.html](../../../lib/check.html) in a browser and press **keep as the baseline** before you change anything in the renderer. Afterwards, press **compare with the baseline**. It draws an initial for every kind, the built-in styles and some fresh ones, and shows anything that came out different, side by side, or failed to draw. A new module shouldn't change any of them; if it does, it's reached into something shared. The baseline stays in that browser, so use the same one for both. Opened on a phone, it's also the quickest way to see what fails or runs slowly there: it lists anything that wouldn't draw, and the slowest.

## Trimming

Nothing needs trimming: a page fetches only the kinds its initials use. Blown-up letters (`blob/`), pages of text (`page.js`), the shape-fill machinery (`relief.js`) and the built-in styles (`styles.js`) are fetched only when they're wanted too.
