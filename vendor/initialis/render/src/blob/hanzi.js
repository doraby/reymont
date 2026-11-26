// Hanzi skeletons from Make Me a Hanzi.
//
// The stroke outlines decide which strokes touch (joined) and which stand apart
// (they must keep a gap). The stroke medians, the brush centrelines, are the
// skeletons both pages inflate. Everything is in MMH units: em 1024, y down.
//
// Out of the analysis comes a graph of skeleton points (particles along each
// median, tied together where strokes touch) and, for every pair of points of
// one character, how they relate:
//   0 friend   near each other along the skeleton: free to overlap and merge
//   1 counter  same connected group, but the straight line between them
//              crosses white in the glyph (a counter, a notch, the mouth of a
//              hook), and the way round along the skeleton is half as long
//              again. Points either side of a corner (way round ≈ 1.41 ×
//              across) stay friends, so inflated counters round their corners.
//   2 part     strokes that never touch: a gap between them, always

import { distance, thin, prune } from './raster.js?v=a8136959';

export const EM = 1024;
export const STEP = 18;       // particle spacing along a median
const RES = 256;              // contact raster, px per em
const WHITE = 3;              // raster px of white a chord must cross to count as a counter
const ROUND = 1.45;           // and how much longer the way round must be

const cache = new Map();

export function loadChar(ch) {
  const cp = ch.codePointAt(0);
  if (!cache.has(cp)) {
    cache.set(cp, fetch(`data/c/${cp.toString(16)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(cp);
}

export const isHan = (ch) => /\p{Script=Han}/u.test(ch);

// ------------------------------------------------------------ contact raster

let ctx2d = null;
function rasterCtx() {
  if (!ctx2d) {
    const cv = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(RES, RES)
      : Object.assign(document.createElement('canvas'), { width: RES, height: RES });
    ctx2d = cv.getContext('2d', { willReadFrequently: true });
  }
  return ctx2d;
}

// The whole glyph in one fill, so the seams where strokes abut stay ink.
function glyphMask(outlines) {
  const c = rasterCtx(), s = RES / EM;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, RES, RES);
  c.setTransform(s, 0, 0, s, 0, 0);
  for (const d of outlines) c.fill(new Path2D(d));
  const a = c.getImageData(0, 0, RES, RES).data;
  const m = new Uint8Array(RES * RES);
  for (let i = 0; i < RES * RES; i++) m[i] = a[i * 4 + 3] >= 100 ? 1 : 0;
  return m;
}

// Longest run of white along the straight line from (ax, ay) to (bx, by).
function whiteRun(mask, ax, ay, bx, by) {
  const k = RES / EM;
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * k));
  let run = 0, best = 0;
  for (let t = 0; t <= steps; t++) {
    const x = Math.floor((ax + ((bx - ax) * t) / steps) * k), y = Math.floor((ay + ((by - ay) * t) / steps) * k);
    const ink = x >= 0 && y >= 0 && x < RES && y < RES && mask[y * RES + x];
    if (ink) run = 0;
    else if (++run > best) best = run;
  }
  return best;
}

function strokeMasks(outlines) {
  const c = rasterCtx(), s = RES / EM;
  return outlines.map((d) => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, RES, RES);
    c.setTransform(s, 0, 0, s, 0, 0);
    c.fill(new Path2D(d));
    const a = c.getImageData(0, 0, RES, RES).data;
    const m = new Uint8Array(RES * RES);
    let x0 = RES, y0 = RES, x1 = -1, y1 = -1, area = 0;
    for (let i = 0; i < RES * RES; i++) {
      if (a[i * 4 + 3] < 100) continue;
      m[i] = 1;
      area++;
      const x = i % RES, y = (i / RES) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { m, x0, y0, x1, y1, area };
  });
}

// Two strokes touch where one's mask, grown by a pixel, meets the other's.
// MMH strokes abut (they were cut from one outline) or overlap at crossings,
// and a corner can touch by a single pixel; strokes that stand apart are at
// least three pixels (12 units) clear of each other.
function contacts(masks) {
  const out = [];
  for (let i = 0; i < masks.length; i++) {
    const A = masks[i];
    if (A.x1 < 0) continue;
    for (let j = i + 1; j < masks.length; j++) {
      const B = masks[j];
      if (B.x1 < 0) continue;
      const x0 = Math.max(A.x0 - 1, B.x0), x1 = Math.min(A.x1 + 1, B.x1);
      const y0 = Math.max(A.y0 - 1, B.y0), y1 = Math.min(A.y1 + 1, B.y1);
      if (x0 > x1 || y0 > y1) continue;
      let n = 0, sx = 0, sy = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!B.m[y * RES + x]) continue;
          let hit = false;
          for (let oy = -1; oy <= 1 && !hit; oy++) {
            const yy = y + oy;
            if (yy < 0 || yy >= RES) continue;
            for (let ox = -1; ox <= 1; ox++) {
              const xx = x + ox;
              if (xx >= 0 && xx < RES && A.m[yy * RES + xx]) { hit = true; break; }
            }
          }
          if (hit) { n++; sx += x; sy += y; }
        }
      }
      if (n >= 1) out.push({ a: i, b: j, n, c: [((sx / n + 0.5) * EM) / RES, ((sy / n + 0.5) * EM) / RES] });
    }
  }
  return out;
}

// ------------------------------------------------------------ polylines

function polyLength(P) {
  let L = 0;
  for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  return L;
}

export function closestOnPoly(P, p) {
  let best = { d: Infinity, q: P[0], seg: 0, t: 0 };
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1];
    const sx = b[0] - a[0], sy = b[1] - a[1];
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * sx + (p[1] - a[1]) * sy) / (sx * sx + sy * sy || 1)));
    const q = [a[0] + sx * t, a[1] + sy * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { d, q, seg: i, t };
  }
  if (P.length === 1) best.d = Math.hypot(p[0] - P[0][0], p[1] - P[0][1]);
  return best;
}

// Where a ray from o along unit d meets polyline P, as a distance along d (can
// be negative: behind o). The host's end segments count as lines, so an L-corner
// finds the corner where the two strokes' lines cross.
function rayHit(o, d, P) {
  let best = null;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-6) continue;
    const wx = a[0] - o[0], wy = a[1] - o[1];
    const t = (wx * ey - wy * ex) / den;
    const u = (wx * d[1] - wy * d[0]) / den;
    const lo = i === 0 ? -0.6 : 0, hi = i === P.length - 2 ? 1.6 : 1;
    if (u < lo || u > hi) continue;
    if (!best || Math.abs(t) < Math.abs(best.t)) best = { t, q: [o[0] + d[0] * t, o[1] + d[1] * t] };
  }
  return best;
}

// A stroke that ends on another stroke gets its end carried onto that stroke's
// centreline (along its own direction), so the two stay joined however thin
// they get. Ends that overshoot the centreline are trimmed back to it.
function snapEnds(polys, hw, joins) {
  for (const J of joins) {
    for (const [s, h] of [[J.a, J.b], [J.b, J.a]]) {
      const P = polys[s];
      if (P.length < 2) continue;
      for (const end of [0, 1]) {
        const ei = end ? P.length - 1 : 0, e = P[ei];
        if (Math.hypot(e[0] - J.c[0], e[1] - J.c[1]) > Math.max(70, 2.2 * hw[s])) continue;
        const prev = P[end ? ei - 1 : 1];
        const ox = e[0] - prev[0], oy = e[1] - prev[1], ol = Math.hypot(ox, oy) || 1;
        const reach = 3.5 * Math.max(hw[s], hw[h]) + 40;
        let hit = rayHit(e, [ox / ol, oy / ol], polys[h]);
        if (!hit || hit.t > reach || hit.t < -0.6 * ol) {
          const c = closestOnPoly(polys[h], e);
          if (c.d > reach) continue;
          const along = ((c.q[0] - e[0]) * ox + (c.q[1] - e[1]) * oy) / ol;
          hit = { t: along, q: c.q };
        }
        if (Math.abs(hit.t) < 4 && Math.hypot(hit.q[0] - e[0], hit.q[1] - e[1]) < 6) continue;
        if (hit.t > 0) {
          if (end) P.push(hit.q); else P.unshift(hit.q);
        } else if (-hit.t < 0.6 * ol) {
          P[ei] = hit.q;
        } else continue;
        J.ends = J.ends || [];
        J.ends.push({ stroke: s, end });
      }
    }
  }
}

function resample(P, step) {
  const L = polyLength(P);
  if (L < 1e-6) return [P[0].slice(), P[0].slice()];
  const n = Math.max(2, Math.round(L / step) + 1);
  const out = [];
  let j = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < P.length - 2) {
      const seg = Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]);
      if (acc + seg >= s) break;
      acc += seg;
      j++;
    }
    const seg = Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]) || 1;
    const t = Math.min(1, Math.max(0, (s - acc) / seg));
    out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t]);
  }
  return out;
}

// ------------------------------------------------------------ geodesics

function dijkstraAll(n, adj) {
  const D = new Float32Array(n * n).fill(Infinity);
  const heapI = new Int32Array(n * 8), heapD = new Float32Array(n * 8);
  for (let src = 0; src < n; src++) {
    const row = src * n;
    D[row + src] = 0;
    let hn = 0;
    const push = (i, d) => {
      let k = hn++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapD[p] <= d) break;
        heapI[k] = heapI[p]; heapD[k] = heapD[p]; k = p;
      }
      heapI[k] = i; heapD[k] = d;
    };
    const pop = () => {
      const top = heapI[0];
      const li = heapI[--hn], ld = heapD[hn];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= hn) break;
        if (c + 1 < hn && heapD[c + 1] < heapD[c]) c++;
        if (heapD[c] >= ld) break;
        heapI[k] = heapI[c]; heapD[k] = heapD[c]; k = c;
      }
      heapI[k] = li; heapD[k] = ld;
      return top;
    };
    push(src, 0);
    while (hn > 0) {
      const d0 = heapD[0], i = pop();
      if (d0 > D[row + i]) continue;
      for (const [j, w] of adj[i]) {
        const nd = d0 + w;
        if (nd < D[row + j]) {
          D[row + j] = nd;
          if (hn < heapI.length) push(j, nd);
        }
      }
    }
  }
  return D;
}

// ------------------------------------------------------------ holes

// The holes of a glyph: white regions the ink closes all the way round (the
// counters of 口, 日's two cells, 女's triangle). Each is thinned to its own
// centreline, an inverse skeleton: it draws nothing, it marks where white has
// to stay, and every point keeps how far it is from the ink around it.
function findHoles(ink) {
  const N = RES * RES, seen = new Uint8Array(N), holes = [];
  for (let i = 0; i < N; i++) {
    if (ink[i] || seen[i]) continue;
    const px = [], stack = [i];
    let edge = false;
    seen[i] = 1;
    while (stack.length) {
      const q = stack.pop(), x = q % RES, y = (q / RES) | 0;
      px.push(q);
      if (x === 0 || y === 0 || x === RES - 1 || y === RES - 1) edge = true;
      for (const j of [q - 1, q + 1, q - RES, q + RES]) {
        if (j < 0 || j >= N || (Math.abs((j % RES) - x) > 1) || ink[j] || seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (edge || px.length < 12) continue;
    const m = new Uint8Array(N);
    for (const q of px) m[q] = 1;
    const dt = distance(m);
    let w = 0;
    for (const q of px) w = Math.max(w, dt[q]);
    // the corner branches of a square hole's skeleton are no wider than the
    // hole itself: snip them, keep the spine
    const sk = prune(thin(m), Math.max(3, Math.round(1.2 * w)));
    let line = px.filter((q) => sk[q]);
    if (!line.length) line = [px.reduce((a, b) => (dt[b] > dt[a] ? b : a))];
    // points along it about a hole's width apart (at least 4 px)
    const gapPx = Math.max(4, Math.round(1.5 * w)), kept = [];
    for (const q of line.sort((a, b) => dt[b] - dt[a])) {
      const x = q % RES, y = (q / RES) | 0;
      if (kept.every((k) => Math.max(Math.abs((k % RES) - x), Math.abs(((k / RES) | 0) - y)) >= gapPx)) kept.push(q);
    }
    const U = EM / RES;
    holes.push({
      area: px.length * U * U,
      width: 2 * w * U,
      pts: kept.map((q) => [((q % RES) + 0.5) * U, (((q / RES) | 0) + 0.5) * U, dt[q] * U]),
    });
  }
  return holes;
}

// ------------------------------------------------------------ analysis

// The brush geometry straight from MMH: medians, stroke widths from the
// outlines, joins where the outlines meet, and the glyph's ink.
export function kaiGeometry(raw) {
  const masks = strokeMasks(raw.s);
  const polys = raw.m.map((med) => med.map((p) => [p[0], p[1]]));
  const hw = masks.map((M, i) => {
    const area = M.area * (EM / RES) * (EM / RES);
    return Math.min(60, Math.max(14, area / Math.max(60, polyLength(polys[i])) / 2));
  });
  return { style: 'brush', polys, hw, joins: contacts(masks), ink: glyphMask(raw.s) };
}

// 'brush' is the Kaiti as drawn; 'sans' is the same strokes fitted onto a sans
// glyph (align.js), falling back to brush if the font hasn't got the character.
export async function analyseStyle(raw, style) {
  const kai = kaiGeometry(raw);
  let H = null;
  if (style === 'sans') {
    const { sansGeometry } = await import('./align.js?v=a8136959');
    const g = await sansGeometry(raw, kai);
    if (g) H = analyse(raw, { style: 'sans', ...g });
  }
  H = H || analyse(raw, kai);
  H.kaiPolys = kai.polys;
  return H;
}

export function analyse(raw, geom = kaiGeometry(raw)) {
  const nS = geom.polys.length;
  const polys = geom.polys.map((P) => P.map((p) => [p[0], p[1]]));
  const hw = geom.hw;
  const joins = geom.joins.map((J) => ({ a: J.a, b: J.b, n: J.n, c: J.c }));
  snapEnds(polys, hw, joins);

  // groups of strokes that touch
  const parent = [...Array(nS).keys()];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const J of joins) parent[find(J.a)] = find(J.b);
  const compId = new Map();
  const comp = polys.map((_, i) => {
    const r = find(i);
    if (!compId.has(r)) compId.set(r, compId.size);
    return compId.get(r);
  });

  // particles along every median
  const strokes = [];
  const nx = [], ny = [], nStroke = [], nComp = [];
  polys.forEach((P, s) => {
    const pts = resample(P, STEP);
    strokes.push({ start: nx.length, count: pts.length, comp: comp[s], hw: hw[s], pts });
    for (const [x, y] of pts) { nx.push(x); ny.push(y); nStroke.push(s); nComp.push(comp[s]); }
  });
  const n = nx.length;
  const adj = Array.from({ length: n }, () => []);
  const chain = [];
  for (const S of strokes) {
    for (let k = 1; k < S.count; k++) {
      const a = S.start + k - 1, b = a + 1, w = Math.hypot(nx[b] - nx[a], ny[b] - ny[a]);
      adj[a].push([b, w]); adj[b].push([a, w]);
      chain.push(a, b);
    }
  }
  // Ties between every pair of touching strokes: their closest particles, and
  // the particles nearest where their ink meets (brush-entry tips can be the
  // closest pair while the real corner is further in).
  const ties = [];
  const tie = (ia, ib) => {
    const d = Math.hypot(nx[ia] - nx[ib], ny[ia] - ny[ib]);
    adj[ia].push([ib, d]); adj[ib].push([ia, d]);
    ties.push(ia, ib);
  };
  const nearest = (S, p) => {
    let best = Infinity, k = S.start;
    for (let i = S.start; i < S.start + S.count; i++) {
      const d = Math.hypot(nx[i] - p[0], ny[i] - p[1]);
      if (d < best) { best = d; k = i; }
    }
    return k;
  };
  for (const J of joins) {
    const A = strokes[J.a], B = strokes[J.b];
    let best = Infinity, ia = -1, ib = -1;
    for (let i = A.start; i < A.start + A.count; i++) {
      for (let j = B.start; j < B.start + B.count; j++) {
        const d = Math.hypot(nx[i] - nx[j], ny[i] - ny[j]);
        if (d < best) { best = d; ia = i; ib = j; }
      }
    }
    J.ia = ia; J.ib = ib;
    tie(ia, ib);
    const ca = nearest(A, J.c), cb = nearest(B, J.c);
    if (ca !== ia || cb !== ib) tie(ca, cb);
  }

  const geo = dijkstraAll(n, adj);
  const ink = geom.ink;
  // `white` keeps how much white a counter pair has between them (raster px),
  // so a coarse pixel grid can let go of counters smaller than one of its cells
  const rel = new Uint8Array(n * n), white = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) {
    const hi = hw[nStroke[i]];
    for (let j = i + 1; j < n; j++) {
      let v = 0;
      if (nComp[i] !== nComp[j]) v = 2;
      else {
        const e = Math.hypot(nx[i] - nx[j], ny[i] - ny[j]);
        if (geo[i * n + j] > ROUND * e + 8 && geo[i * n + j] > e + hi + hw[nStroke[j]]) {
          const w = whiteRun(ink, nx[i], ny[i], nx[j], ny[j]);
          if (w >= WHITE) { v = 1; white[i * n + j] = white[j * n + i] = Math.min(255, w); }
        }
      }
      rel[i * n + j] = rel[j * n + i] = v;
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, nx[i]); maxX = Math.max(maxX, nx[i]);
    minY = Math.min(minY, ny[i]); maxY = Math.max(maxY, ny[i]);
  }

  const joined = new Set(joins.map((J) => `${J.a},${J.b}`));
  return {
    ch: raw.c,
    style: geom.style,
    pinyin: raw.p,
    def: raw.d,
    outlines: raw.s,
    polys,
    strokes,
    joins,
    isJoined: (a, b) => a === b || joined.has(a < b ? `${a},${b}` : `${b},${a}`),
    nComps: compId.size,
    n,
    nx: Float32Array.from(nx),
    ny: Float32Array.from(ny),
    nStroke: Int16Array.from(nStroke),
    nComp: Int16Array.from(nComp),
    chain: Int32Array.from(chain),
    ties: Int32Array.from(ties),
    rel,
    white,
    whiteUnit: EM / RES,
    holes: findHoles(ink).map((h) => {
      // the strokes around it: any with a particle near one of its points
      const rim = new Set();
      for (const [x, y, r] of h.pts) {
        for (let i = 0; i < n; i++) if (Math.hypot(nx[i] - x, ny[i] - y) < 2 * r + hw[nStroke[i]] + 24) rim.add(nStroke[i]);
      }
      return { ...h, rim: [...rim] };
    }),
    bbox: { minX, minY, maxX, maxY },
  };
}
