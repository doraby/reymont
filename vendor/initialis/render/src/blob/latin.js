// From wen (src/latin.js), for the renderer's blown-up letters: the glyph comes in
// already rasterized on bao's 256 px em grid, thinned to its
// centreline, and the centreline is traced into branches between junctions.
// Branches that carry straight on through a junction (the stem of a t past its
// bar) become one stroke; a closed loop (o, the bowls of 8) is cut into two
// halves tied at both ends, since a stroke can't close on itself in the sim.
// Strokes that meet at a junction are joined there. Then bao's own analysis
// takes it from the same geometry it gets from the Kaiti or the sans fit.

import { EM, analyse } from './hanzi.js?v=a8136959';
import { R, distance, thin, prune } from './raster.js?v=a8136959';

const U = EM / R;

const N8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
// 4-neighbours first, so a walk takes a staircase step by step instead of
// cutting its corner and leaving a pixel behind
const WALK = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

// Thinning leaves staircases whose corner pixels are redundant (their
// neighbours touch each other anyway). Removing every such pixel, one at a time
// so nothing comes apart, leaves a line pixel exactly two neighbours.
function minimal(sk) {
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < R * R; i++) {
      if (!sk[i]) continue;
      const x = i % R, y = (i / R) | 0;
      const nb = [];
      for (const [ox, oy] of N8) {
        const xx = x + ox, yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < R && yy < R && sk[yy * R + xx]) nb.push([ox, oy]);
      }
      if (nb.length < 2) continue;
      // with all four sides inked, removing it would punch a hole
      if (nb.filter(([ox, oy]) => !ox || !oy).length === 4) continue;
      // are the neighbours all one cluster among themselves?
      const seen = [0], stack = [0];
      while (stack.length) {
        const a = nb[stack.pop()];
        nb.forEach((b, k) => {
          if (!seen.includes(k) && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1) { seen.push(k); stack.push(k); }
        });
      }
      if (seen.length === nb.length) { sk[i] = 0; changed = true; }
    }
  }
  return sk;
}

// The centreline as branches: [{ pts (px), a, b }] where a and b are node ids,
// junction clusters first, then one id per free end.
function trace(sk) {
  const on = (x, y) => x >= 0 && y >= 0 && x < R && y < R && sk[y * R + x] === 1;
  const kind = new Int8Array(R * R); // 1 path, 2 end, 3 junction
  for (let i = 0; i < R * R; i++) {
    if (!sk[i]) continue;
    const x = i % R, y = (i / R) | 0;
    let n = 0;
    for (let k = 0; k < 8; k++) if (on(x + N8[k][0], y + N8[k][1])) n++;
    // on a minimal skeleton (see minimal) a third neighbour means a junction,
    // even where they form only two runs (a tail meeting a bowl on the slant)
    kind[i] = n <= 1 ? 2 : n >= 3 ? 3 : 1;
  }
  // junction clusters
  const node = new Int32Array(R * R).fill(-1);
  const centres = [];
  for (let i = 0; i < R * R; i++) {
    if (kind[i] !== 3 || node[i] >= 0) continue;
    const id = centres.length, stack = [i];
    let sx = 0, sy = 0, c = 0;
    node[i] = id;
    while (stack.length) {
      const j = stack.pop(), x = j % R, y = (j / R) | 0;
      sx += x; sy += y; c++;
      for (const [ox, oy] of N8) {
        const k = (y + oy) * R + x + ox;
        if (on(x + ox, y + oy) && kind[k] === 3 && node[k] < 0) { node[k] = id; stack.push(k); }
      }
    }
    centres.push([sx / c, sy / c]);
  }
  const nJ = centres.length;
  let nextEnd = nJ;
  const seen = new Uint8Array(R * R);
  const branches = [];
  // walk from pixel `s` (next to where the branch starts) to the next junction or end
  const walk = (start, s, a) => {
    const pts = [start, s];
    seen[s] = 1;
    let prev = start, cur = s;
    for (;;) {
      if (kind[cur] === 3) return { pts, a, b: node[cur] };
      if (kind[cur] === 2 && pts.length > 2) return { pts, a, b: nextEnd++ };
      const x = cur % R, y = (cur / R) | 0;
      let next = -1;
      // a junction next door ends the branch even if a plain pixel also is
      for (const [ox, oy] of WALK) {
        const k = (y + oy) * R + x + ox;
        if (on(x + ox, y + oy) && k !== prev && kind[k] === 3 && node[k] !== a) { next = k; break; }
      }
      if (next < 0) {
        for (const [ox, oy] of WALK) {
          const k = (y + oy) * R + x + ox;
          if (on(x + ox, y + oy) && k !== prev && !seen[k] && kind[k] !== 3) { next = k; break; }
        }
      }
      if (next < 0) {
        // back at a junction it started from (a loop on one junction)
        for (const [ox, oy] of WALK) {
          const k = (y + oy) * R + x + ox;
          if (on(x + ox, y + oy) && k !== prev && kind[k] === 3 && pts.length > 3) { next = k; break; }
        }
      }
      if (next < 0) return { pts, a, b: kind[cur] === 2 ? nextEnd++ : -2 };
      if (kind[next] !== 3) seen[next] = 1;
      pts.push(next);
      prev = cur;
      cur = next;
    }
  };
  for (let i = 0; i < R * R; i++) {
    if (kind[i] !== 3) continue;
    const x = i % R, y = (i / R) | 0;
    for (const [ox, oy] of WALK) {
      const k = (y + oy) * R + x + ox;
      if (on(x + ox, y + oy) && kind[k] !== 3 && !seen[k]) branches.push(walk(i, k, node[i]));
    }
  }
  for (let i = 0; i < R * R; i++) {
    if (kind[i] !== 2 || seen[i]) continue;
    seen[i] = 1;
    const x = i % R, y = (i / R) | 0;
    let s = -1;
    for (const [ox, oy] of WALK) {
      const k = (y + oy) * R + x + ox;
      if (on(x + ox, y + oy) && !seen[k] && kind[k] !== 3) { s = k; break; }
    }
    if (s < 0) { branches.push({ pts: [i], a: nextEnd++, b: nextEnd++ }); continue; }
    branches.push(walk(i, s, nextEnd++));
  }
  // what's left is closed loops with no junction on them (o, 0)
  for (let i = 0; i < R * R; i++) {
    if (!sk[i] || seen[i] || kind[i] === 3) continue;
    seen[i] = 1;
    const x = i % R, y = (i / R) | 0;
    let s = -1;
    for (const [ox, oy] of WALK) {
      const k = (y + oy) * R + x + ox;
      if (on(x + ox, y + oy) && !seen[k]) { s = k; break; }
    }
    if (s < 0) continue;
    const loop = nextEnd++;
    const br = walk(i, s, loop);
    if (br.pts.length > 6) branches.push({ pts: br.pts, a: loop, b: loop });
  }
  return { branches: branches.filter((b) => b.b !== -2 || b.pts.length > 3).map((b) => (b.b === -2 ? { ...b, b: nextEnd++ } : b)), centres, nJ, nNodes: () => nextEnd++ };
}

const smooth = (P, k = 2) => P.map((p, i) => {
  if (i === 0 || i === P.length - 1) return p;
  let sx = 0, sy = 0, c = 0;
  for (let j = Math.max(0, i - k); j <= Math.min(P.length - 1, i + k); j++) { sx += P[j][0]; sy += P[j][1]; c++; }
  return [sx / c, sy / c];
});

// direction leaving the polyline at its start, from a few px along it
function leave(P) {
  if (P.length < 2) return [1, 0];
  const q = P[Math.min(P.length - 1, 6)];
  const dx = q[0] - P[0][0], dy = q[1] - P[0][1], l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

// m: the glyph's ink on the R×R grid (1 = ink), as the renderer rasterises it
export function latinGeometry(m) {
  if (!m) return null;
  const dt = distance(m);
  let maxDt = 0;
  for (let i = 0; i < R * R; i++) if (dt[i] > maxDt) maxDt = dt[i];
  const sk = minimal(prune(thin(m), 3));
  // thinning erases a round dot altogether: give each inkblot that lost its
  // centreline a pixel at its middle
  {
    const lab = new Int32Array(R * R).fill(-1);
    for (let i = 0; i < R * R; i++) {
      if (!m[i] || lab[i] >= 0) continue;
      const stack = [i], px = [];
      lab[i] = i;
      let hasSk = false;
      while (stack.length) {
        const j = stack.pop(), x = j % R, y = (j / R) | 0;
        px.push(j);
        if (sk[j]) hasSk = true;
        for (const [ox, oy] of N8) {
          const xx = x + ox, yy = y + oy, k = yy * R + xx;
          if (xx >= 0 && yy >= 0 && xx < R && yy < R && m[k] && lab[k] < 0) { lab[k] = i; stack.push(k); }
        }
      }
      if (hasSk || px.length < 6) continue;
      let best = px[0];
      for (const j of px) if (dt[j] > dt[best]) best = j;
      sk[best] = 1;
    }
  }
  const T = trace(sk);
  if (!T.branches.length) return null;

  // thinning can leave a pixel's gap between a junction and a branch it should
  // reach: a loose end that close to a junction belongs to it
  for (const br of T.branches) {
    for (const end of [0, 1]) {
      const n = end ? br.b : br.a;
      if (n < T.nJ || br.a === br.b) continue;
      const i = end ? br.pts[br.pts.length - 1] : br.pts[0], x = i % R, y = (i / R) | 0;
      let best = -1, bd = 3.6;
      T.centres.forEach(([cx, cy], j) => { const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = j; } });
      if (best >= 0 && best !== (end ? br.a : br.b)) { if (end) br.b = best; else br.a = best; }
    }
  }

  // a junction with only two branches isn't one (a staircase the rule above
  // caught, or a corner left when a spur goes): the two become one branch
  const dissolve = () => {
    for (;;) {
      const ends = new Map();
      T.branches.forEach((br, i) => {
        for (const e of [0, 1]) {
          const n = e ? br.b : br.a;
          if (n >= T.nJ) continue;
          if (!ends.has(n)) ends.set(n, []);
          ends.get(n).push([i, e]);
        }
      });
      let did = false;
      for (const [, E] of ends) {
        if (E.length !== 2 || E[0][0] === E[1][0]) continue;
        const [[i, ei], [j, ej]] = E;
        const A = T.branches[i], Bj = T.branches[j];
        const pa = ei ? A.pts : A.pts.slice().reverse();
        const pb = ej ? Bj.pts.slice().reverse() : Bj.pts;
        T.branches[i] = { pts: [...pa, ...pb], a: ei ? A.a : A.b, b: ej ? Bj.a : Bj.b };
        T.branches.splice(j, 1);
        did = true;
        break;
      }
      if (!did) return;
    }
  };
  dissolve();

  // Spurs: a branch from a junction out to nothing that is the medial axis
  // running into a pointed corner (the apex of an A, the peaks of an M, the
  // corners of a square stroke end) rather than a stroke: it never leaves the
  // junction's disc, or narrows like a wedge all the way out. A real arm,
  // however short or thin (the bar of a t), doesn't. Only where the junction
  // keeps two others.
  {
    const deg = new Map();
    for (const br of T.branches) for (const n of [br.a, br.b]) deg.set(n, (deg.get(n) || 0) + 1);
    const at = (i) => dt[i] || 0;
    T.branches = T.branches.filter((br) => {
      const ja = br.a < T.nJ, jb = br.b < T.nJ;
      if (ja === jb) return true;
      const J = ja ? br.a : br.b;
      if ((deg.get(J) || 0) < 3) return true;
      const pts = ja ? br.pts : br.pts.slice().reverse();
      const c = T.centres[J], dJ = at(Math.round(c[1]) * R + Math.round(c[0]));
      // past the junction's own disc, a spur narrows steadily the whole way out
      // like a wedge, losing about its own width over its length; a real arm
      // stays roughly level, however its start bulges or its end is cut
      const out = pts.filter((i) => Math.hypot((i % R) - c[0], ((i / R) | 0) - c[1]) > dJ);
      let spur = out.length < 2;
      if (!spur && out.length > 3) {
        const n = out.length, ys = out.map(at);
        let mx = 0, my = 0;
        ys.forEach((y, k) => { mx += k / (n - 1); my += y; });
        mx /= n; my /= n;
        let sxy = 0, sxx = 0;
        ys.forEach((y, k) => { const x = k / (n - 1) - mx; sxy += x * (y - my); sxx += x * x; });
        const drop = -sxy / sxx, med = ys.slice().sort((p, q) => p - q)[n >> 1];
        // and it starts narrowing at once: a stroke that tapers (the tail of a
        // Q) first runs level for about its own width
        let level = 0;
        while (level < n && ys[level] >= 0.9 * ys[0]) level++;
        spur = drop > 1.1 * med && level < 0.6 * ys[0];
      }
      if (spur) deg.set(J, deg.get(J) - 1);
      return !spur;
    });
  }

  dissolve();

  // a free end that hooks off into a corner of the ink (a slanted stroke cut
  // flat) loses the hook: its tip is trimmed back to where it still has most
  // of the branch's width
  for (const br of T.branches) {
    for (const end of [0, 1]) {
      const n = end ? br.b : br.a;
      if (n < T.nJ || br.a === br.b || br.pts.length < 8) continue;
      const pts = end ? br.pts : br.pts.slice().reverse();
      const mid = pts.slice(Math.floor(pts.length * 0.25), Math.ceil(pts.length * 0.75)).map((i) => dt[i]).sort((x, y) => x - y);
      const plateau = mid[mid.length >> 1];
      let k = pts.length - 1;
      while (k > pts.length * 0.6 && dt[pts[k]] < 0.5 * plateau) k--;
      if (k < pts.length - 1) {
        const kept = pts.slice(0, k + 1);
        br.pts = end ? kept : kept.reverse();
      }
    }
  }

  // branches in px with their two ends; loops (a == b) cut in two at a new node
  let B = [];
  const cuts = new Set();
  for (const br of T.branches) {
    const P = br.pts.map((i) => [i % R, (i / R) | 0]);
    if (br.a === br.b) {
      const h = P.length >> 1, mid = T.nNodes();
      cuts.add(mid);
      if (br.a >= T.nJ) cuts.add(br.a);
      B.push({ P: P.slice(0, h + 1), a: br.a, b: mid }, { P: P.slice(h), a: mid, b: br.b });
    } else B.push({ P, a: br.a, b: br.b });
  }
  const isJ = (n) => n < T.nJ;
  // the two ends at a loop's cut meet halfway
  for (const n of cuts) {
    const E = [];
    B.forEach((br) => { if (br.a === n) E.push([br, 0]); if (br.b === n) E.push([br, 1]); });
    if (E.length !== 2) continue;
    const p = E.map(([br, at]) => (at ? br.P[br.P.length - 1] : br.P[0]));
    const c = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
    for (const [br, at] of E) br.P[at ? br.P.length - 1 : 0] = c;
  }
  const free = (n) => !isJ(n) && !cuts.has(n);
  // junction ends reach the cluster's middle; free ends carry on to the edge of the ink
  const ink = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < R && yi < R && m[yi * R + xi]; };
  const reach = (P) => {
    const [dx, dy] = leave(P);
    const p0 = P[0], d0 = dt[Math.round(p0[1]) * R + Math.round(p0[0])] || 1;
    let t = 0;
    while (t < d0 * 1.6 && ink(p0[0] - dx * (t + 1), p0[1] - dy * (t + 1))) t++;
    return t > 1 ? [[p0[0] - dx * t * 0.7, p0[1] - dy * t * 0.7], ...P] : P;
  };
  B = B.map((br) => {
    let P = br.P;
    if (isJ(br.a)) P = [T.centres[br.a], ...P]; else if (free(br.a) && P.length > 1) P = reach(P);
    if (isJ(br.b)) P = [...P, T.centres[br.b]]; else if (free(br.b) && P.length > 1) P = reach(P.slice().reverse()).reverse();
    return { ...br, P: smooth(P) };
  });

  // straight continuations through a junction become one stroke; never a pairing
  // that closes a stroke on itself
  const ends = new Map(); // node → [{ bi, at: 0|1, dir }]
  B.forEach((br, bi) => {
    for (const at of [0, 1]) {
      const n = at ? br.b : br.a;
      const P = at ? br.P.slice().reverse() : br.P;
      if (!ends.has(n)) ends.set(n, []);
      ends.get(n).push({ bi, at, dir: leave(P.slice(1)) });
    }
  });
  const link = B.map(() => [null, null]); // link[bi][at] = { bi, at }
  const chainOf = B.map((_, i) => i);
  const find = (i) => (chainOf[i] === i ? i : (chainOf[i] = find(chainOf[i])));
  const chainEnds = B.map((br) => [br.a, br.b]);
  const chainNodes = B.map((br) => new Set([br.a, br.b]));
  for (const [n, E] of ends) {
    if (E.length < 2) continue;
    const pairs = [];
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      pairs.push([E[i].dir[0] * E[j].dir[0] + E[i].dir[1] * E[j].dir[1], E[i], E[j]]);
    }
    pairs.sort((p, q) => p[0] - q[0]);
    const used = new Set();
    for (const [dot, x, y] of pairs) {
      if (dot > -0.72 || used.has(x) || used.has(y)) continue;
      const cx = find(x.bi), cy = find(y.bi);
      if (cx === cy) continue;
      const ox = chainEnds[cx].filter((e) => e !== n), oy = chainEnds[cy].filter((e) => e !== n);
      const e1 = ox.length ? ox[0] : n, e2 = oy.length ? oy[0] : n;
      if (e1 === e2) continue;
      // a stroke may pass each junction once
      if ([...chainNodes[cx]].some((v) => v !== n && chainNodes[cy].has(v))) continue;
      used.add(x); used.add(y);
      link[x.bi][x.at] = y;
      link[y.bi][y.at] = x;
      chainOf[cx] = cy;
      chainEnds[cy] = [e1, e2];
      for (const v of chainNodes[cx]) chainNodes[cy].add(v);
    }
  }

  // walk the chains into strokes
  const strokeOf = new Int32Array(B.length).fill(-1);
  const polys = [];
  const startAt = (bi, at) => {
    const s = polys.length, P = [];
    let cur = { bi, at };
    while (cur && strokeOf[cur.bi] < 0) {
      strokeOf[cur.bi] = s;
      const Q = cur.at === 0 ? B[cur.bi].P : B[cur.bi].P.slice().reverse();
      P.push(...(P.length ? Q.slice(1) : Q));
      const out = 1 - cur.at;
      cur = link[cur.bi][out];
      if (cur) cur = { bi: cur.bi, at: cur.at };
    }
    polys.push(P);
  };
  B.forEach((br, bi) => {
    if (strokeOf[bi] >= 0) return;
    if (!link[bi][0]) startAt(bi, 0);
    else if (!link[bi][1]) startAt(bi, 1);
  });
  B.forEach((br, bi) => { if (strokeOf[bi] < 0) startAt(bi, 0); });

  // a dot (tittle, full stop) thins to a point: give it a little length
  const out = polys.map((P) => {
    let L = 0;
    for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (L < 2) {
      const c = P[0], d = dt[Math.round(c[1]) * R + Math.round(c[0])] || 2;
      return [[c[0] - d * 0.4, c[1]], [c[0] + d * 0.4, c[1]]];
    }
    return P;
  });

  const toU = (p) => [(p[0] + 0.5) * U, (p[1] + 0.5) * U];
  const unitPolys = out.map((P) => P.map(toU));
  const hw = out.map((P) => {
    let s = 0;
    for (const p of P) s += dt[Math.min(R - 1, Math.round(p[1])) * R + Math.min(R - 1, Math.round(p[0]))] || 0;
    return Math.min(60, Math.max(14, (s / P.length) * U));
  });
  // joins: every two strokes with an end, or a pass, at the same junction (or loop cut)
  const at = new Map();
  B.forEach((br, bi) => {
    for (const n of [br.a, br.b]) {
      if (!at.has(n)) at.set(n, { strokes: new Set(), p: null });
      at.get(n).strokes.add(strokeOf[bi]);
      at.get(n).p = isJ(n) ? T.centres[n] : (n === br.a ? br.P[0] : br.P[br.P.length - 1]);
    }
  });
  const joins = [];
  for (const [, v] of at) {
    const S = [...v.strokes];
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const a = Math.min(S[i], S[j]), b = Math.max(S[i], S[j]);
      joins.push({ a, b, n: 1, c: toU(v.p) });
    }
  }
  return { polys: unitPolys, hw, joins, ink: m };
}

// the glyph's strokes, analysed as bao analyses a character's
export function analysedMask(m, name = '?') {
  const g = latinGeometry(m);
  if (!g) return null;
  const H = analyse({ c: name, p: '', d: 'incipit', s: [] }, { style: 'font', ...g });
  H.latin = true;
  return H;
}

// Letters of one text share a vertical frame (the union of their tops and
// bottoms), so a lowercase o stays shorter than an l beside it. Returns each
// glyph's frame (its own bounds for hanzi).
export function shareFrame(Hs) {
  const L = Hs.filter((H) => H && H.latin);
  const y0 = Math.min(...L.map((H) => H.bbox.minY)), y1 = Math.max(...L.map((H) => H.bbox.maxY));
  return Hs.map((H) => (H && H.latin && L.length > 1 ? { ...H.bbox, minY: y0, maxY: y1 } : H && H.bbox));
}
