// Soft-body sim over hanzi skeletons (grown from among-blob's letter sim).
//
// Particles sit along each stroke's median and carry a radius; the drawn
// character is the union of round capsules between neighbours. Particles spring
// toward their slot in the layout, radii inflate past rest size ("pressure") so
// strokes press flat against whatever stops them, and wherever two points that
// must stay apart come closer than their gap, the overlap is paid for partly by
// pushing the skeleton and partly by thinning the stroke.
//
// Which points must stay apart comes from the analysis (hanzi.js): strokes that
// never touch keep the part gap, points around a counter keep the counter gap,
// and two characters keep a hairline. Both inner gaps are capped by the rest
// clearance, so pressure only swells outward, and close toward the hairline as
// the box squeezes.

export const MAX_SEGS = 8192;

export class Sim {
  constructor() {
    this.n = 0;
    this.seg = new Float32Array(MAX_SEGS * 8);
  }

  // glyphs: [{ H (analysis), ox, oy, bw, bh }] — the frame (ox, oy, bw, bh) is the
  // part of rest space that gets mapped onto the character's cell.
  build(glyphs) {
    let n = 0;
    for (const G of glyphs) n += G.H.n;
    this.n = n;
    const F = () => new Float32Array(n);
    this.x = F(); this.y = F(); this.px = F(); this.py = F();
    this.r = F(); this.tx = F(); this.ty = F(); this.tmp = F(); this.tmp2 = F(); this.solid = F().fill(1);
    this.u = F(); this.v = F(); this.arc = F();
    this.letterOf = new Int16Array(n);
    this.localIdx = new Int16Array(n);
    this.compOf = new Int16Array(n);
    this.strokeOf = new Int16Array(n);
    this.nb0 = new Int32Array(n).fill(-1);
    this.nb1 = new Int32Array(n).fill(-1);
    this.pairs = new Int32Array(Math.max(1024, n * 32));
    this.pairGap = new Float32Array(this.pairs.length / 2);
    this.npairs = 0;
    this.letters = [];
    this.strokes = [];

    const edges = [];
    let idx = 0, compBase = 0, strokeBase = 0;
    glyphs.forEach((G, li) => {
      const H = G.H;
      const L = {
        G, start: idx, count: H.n, phase: li * 1.9 + 0.7,
        rBase: 10, gIn: 5, gPart: 5, pressure: 1, transit: 0,
        compBase, nComps: H.nComps, strokes: [],
        xf: { x0: 0, y0: 0, sx: 1, sy: 1 },
        cell: { x: 0, y: 0, w: 1, h: 1 },
      };
      for (let k = 0; k < H.n; k++) {
        const i = idx + k;
        this.u[i] = H.nx[k];
        this.v[i] = H.ny[k];
        this.letterOf[i] = li;
        this.localIdx[i] = k;
        this.compOf[i] = compBase + H.nComp[k];
        this.strokeOf[i] = strokeBase + H.nStroke[k];
      }
      H.strokes.forEach((S) => {
        const s = { letter: li, start: idx + S.start, count: S.count, comp: compBase + S.comp };
        let arc = 0;
        for (let k = 0; k < S.count; k++) {
          const i = s.start + k;
          if (k > 0) {
            arc += Math.hypot(this.u[i] - this.u[i - 1], this.v[i] - this.v[i - 1]);
            edges.push(i - 1, i);
            this.nb1[i - 1] = i;
            this.nb0[i] = i - 1;
          }
          this.arc[i] = arc;
        }
        L.strokes.push(this.strokes.length);
        this.strokes.push(s);
      });
      for (let k = 0; k < H.ties.length; k += 2) edges.push(idx + H.ties[k], idx + H.ties[k + 1]);
      idx += H.n;
      compBase += H.nComps;
      strokeBase += H.strokes.length;
      this.letters.push(L);
    });
    this.nComps = compBase;
    this.edges = new Int32Array(edges);
    this.edgeRest = new Float32Array(edges.length / 2);
  }

  computeTargets() {
    const { tx, ty, u, v } = this;
    for (const L of this.letters) {
      const { x0, y0, sx, sy } = L.xf, { ox, oy } = L.G;
      for (let i = L.start; i < L.start + L.count; i++) {
        tx[i] = x0 + (u[i] - ox) * sx;
        ty[i] = y0 + (v[i] - oy) * sy;
      }
    }
  }

  // Start every character in place as a thin skeleton; the radii then inflate.
  reset(thin = true) {
    this.computeTargets();
    for (const L of this.letters) {
      for (let i = L.start; i < L.start + L.count; i++) {
        this.x[i] = this.px[i] = this.tx[i];
        this.y[i] = this.py[i] = this.ty[i];
        this.r[i] = L.rBase * (thin ? 0.15 : 1);
      }
    }
  }

  step(dt, P, box, t, poke) {
    const { n, x, y, px, py, r, tx, ty, u, v, arc, letterOf } = this;
    this.computeTargets();

    const k = Math.min(0.6, P.stiffness * dt * dt);
    const damp = P.damping;
    for (let i = 0; i < n; i++) {
      const vx = (x[i] - px[i]) * damp, vy = (y[i] - py[i]) * damp;
      px[i] = x[i]; py[i] = y[i];
      x[i] += vx + (tx[i] - x[i]) * k;
      y[i] += vy + (ty[i] - y[i]) * k;
    }

    // radii inflate past their rest size so strokes press flat against whatever
    // stops them; a slow wave along each stroke keeps them breathing
    for (let i = 0; i < n; i++) {
      const L = this.letters[letterOf[i]];
      const w = 1 + P.wobble * Math.sin(arc[i] * 0.012 + t * 1.1 + L.phase + this.strokeOf[i] * 0.7) * Math.sin(t * 0.37 + L.phase * 1.7);
      const rt = L.rBase * L.pressure * w * (1 - 0.3 * L.transit);
      r[i] += (rt - r[i]) * (rt > r[i] ? P.grow : 0.4);
    }
    const tmp = this.tmp;
    for (let i = 0; i < n; i++) {
      const a = this.nb0[i], b = this.nb1[i];
      let s = r[i], c = 1;
      if (a >= 0) { s += r[a]; c++; }
      if (b >= 0) { s += r[b]; c++; }
      tmp[i] = r[i] + (s / c - r[i]) * 0.4;
    }
    r.set(tmp);

    const E = this.edges, rest = this.edgeRest;
    for (let e = 0, q = 0; e < E.length; e += 2, q++) {
      const a = E[e], b = E[e + 1], xf = this.letters[letterOf[a]].xf;
      rest[q] = Math.hypot((u[a] - u[b]) * xf.sx, (v[a] - v[b]) * xf.sy);
    }

    // A particle far from its slot (a character swapping places) turns ghostly
    // toward the other character so it can pass through instead of getting wedged.
    const solid = this.solid;
    for (const L of this.letters) {
      const a = 0.8 * L.rBase + 6, b = 2.5 * L.rBase + 20;
      for (let i = L.start; i < L.start + L.count; i++) {
        const e = (Math.hypot(x[i] - tx[i], y[i] - ty[i]) - a) / (b - a);
        solid[i] = e <= 0 ? 1 : e >= 1 ? 0 : 1 - e * e * (3 - 2 * e);
      }
    }

    this.findPairs(P);
    for (let it = 0; it < P.iterations; it++) {
      this.solveEdges(0.5);
      this.solvePairs(P);
      this.solveWalls(box, P);
      if (poke) this.solvePoke(poke, P);
    }
    this.smoothDeviation(0.5);
    this.limitSlope(0.3);
    this.clampToBox(box, P);
  }

  // Smooth each particle's offset from its slot along the stroke, so pushes bend
  // the stroke as a whole instead of leaving particle-sized zigzags.
  smoothDeviation(beta) {
    const { n, x, y, tx, ty, nb0, nb1 } = this;
    const dx = this.tmp, dy = this.tmp2;
    for (let i = 0; i < n; i++) { dx[i] = x[i] - tx[i]; dy[i] = y[i] - ty[i]; }
    for (let i = 0; i < n; i++) {
      const a = nb0[i], b = nb1[i];
      let sx = dx[i], sy = dy[i], c = 1;
      if (a >= 0) { sx += dx[a]; sy += dy[a]; c++; }
      if (b >= 0) { sx += dx[b]; sy += dy[b]; c++; }
      x[i] += (sx / c - dx[i]) * beta;
      y[i] += (sy / c - dy[i]) * beta;
    }
  }

  // Radii may only change gently along a stroke. Only ever shrinks, so it never
  // re-opens an overlap the solver just closed; it turns dents into smooth valleys.
  limitSlope(c) {
    const { x, y, r } = this, E = this.edges;
    for (let pass = 0; pass < 2; pass++) {
      const fwd = pass === 0;
      for (let q = 0; q < E.length; q += 2) {
        const e = fwd ? q : E.length - 2 - q;
        const a = E[e], b = E[e + 1];
        const lim = c * Math.hypot(x[a] - x[b], y[a] - y[b]);
        if (r[a] > r[b] + lim) r[a] = r[b] + lim;
        else if (r[b] > r[a] + lim) r[b] = r[a] + lim;
      }
    }
  }

  // Candidate pairs from a uniform grid, so a 30-stroke character stays cheap.
  findPairs(P) {
    const { n, x, y, r, tx, ty, letterOf, localIdx } = this;
    let maxR = 0, maxG = P.gap, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (r[i] > maxR) maxR = r[i];
      if (x[i] < x0) x0 = x[i]; if (x[i] > x1) x1 = x[i];
      if (y[i] < y0) y0 = y[i]; if (y[i] > y1) y1 = y[i];
    }
    for (const L of this.letters) maxG = Math.max(maxG, L.gIn, L.gPart);
    let cell = Math.max(6, 2.5 * maxR + maxG + 4);
    let gw = Math.floor((x1 - x0) / cell) + 1, gh = Math.floor((y1 - y0) / cell) + 1;
    while (gw * gh > 40000) { cell *= 1.5; gw = Math.floor((x1 - x0) / cell) + 1; gh = Math.floor((y1 - y0) / cell) + 1; }
    if (!this.head || this.head.length < gw * gh) this.head = new Int32Array(gw * gh);
    if (!this.next || this.next.length < n) this.next = new Int32Array(n);
    const head = this.head, next = this.next;
    head.fill(-1, 0, gw * gh);
    const cx = new Int32Array(n), cy = new Int32Array(n);
    for (let i = n - 1; i >= 0; i--) {
      cx[i] = Math.floor((x[i] - x0) / cell);
      cy[i] = Math.floor((y[i] - y0) / cell);
      const c = cy[i] * gw + cx[i];
      next[i] = head[c];
      head[c] = i;
    }

    let np = 0, pairs = this.pairs, gaps = this.pairGap;
    for (let i = 0; i < n; i++) {
      const li = letterOf[i], L = this.letters[li], rel = L.G.H.rel, cnt = L.count, ri = localIdx[i] * cnt;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy[i] + oy;
        if (yy < 0 || yy >= gh) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx[i] + ox;
          if (xx < 0 || xx >= gw) continue;
          for (let j = head[yy * gw + xx]; j >= 0; j = next[j]) {
            if (j <= i) continue;
            const same = letterOf[j] === li;
            let kind = 3;
            if (same) {
              kind = rel[ri + localIdx[j]];
              if (!kind) continue;
            }
            const dx = x[j] - x[i], dy = y[j] - y[i];
            const reach = (r[i] + r[j]) * 1.25 + (same ? Math.max(L.gIn, L.gPart) : P.gap) + 4;
            if (dx * dx + dy * dy > reach * reach) continue;
            let g = P.gap;
            if (same) {
              const rest = Math.hypot(tx[j] - tx[i], ty[j] - ty[i]) - 2 * L.rBase;
              g = Math.max(P.gap, Math.min(kind === 2 ? L.gPart : L.gIn, rest));
            }
            if (np * 2 + 2 > pairs.length) {
              const grown = new Int32Array(pairs.length * 2);
              grown.set(pairs);
              pairs = this.pairs = grown;
              const grownG = new Float32Array(grown.length / 2);
              grownG.set(gaps);
              gaps = this.pairGap = grownG;
            }
            pairs[np * 2] = i;
            pairs[np * 2 + 1] = j;
            gaps[np] = g;
            np++;
          }
        }
      }
    }
    this.npairs = np;
  }

  solveEdges(stiff) {
    const { x, y } = this, E = this.edges, rest = this.edgeRest;
    for (let e = 0, k = 0; e < E.length; e += 2, k++) {
      const a = E[e], b = E[e + 1];
      const dx = x[b] - x[a], dy = y[b] - y[a];
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      const f = ((d - rest[k]) / d) * 0.5 * stiff;
      x[a] += dx * f; y[a] += dy * f;
      x[b] -= dx * f; y[b] -= dy * f;
    }
  }

  solvePairs(P) {
    const { x, y, r, tx, ty, pairs, pairGap, letterOf, solid } = this;
    const a = P.push, rMin = P.rMin;
    for (let p = 0; p < this.npairs; p++) {
      const i = pairs[p * 2], j = pairs[p * 2 + 1];
      const dx = x[j] - x[i], dy = y[j] - y[i];
      let d = Math.hypot(dx, dy);
      const need = r[i] + r[j] + pairGap[p];
      if (d >= need) continue;
      let nx, ny, w = 1;
      if (letterOf[i] === letterOf[j]) {
        // separate along the rest-shape direction, so crossed strokes get pulled
        // back through each other rather than locked in a tangle
        let ex = tx[j] - tx[i], ey = ty[j] - ty[i];
        const el = Math.hypot(ex, ey);
        if (el > 1e-6) { ex /= el; ey /= el; } else { ex = 1; ey = 0; }
        const cosA = d > 1e-6 ? (dx * ex + dy * ey) / d : -1;
        if (cosA < 0.5) { d = dx * ex + dy * ey; nx = ex; ny = ey; }
        else { nx = dx / d; ny = dy / d; }
        if (d >= need) continue;
        if (d < 0) {
          const m = Math.min(need - d, need) * 0.25;
          x[i] -= nx * m; y[i] -= ny * m;
          x[j] += nx * m; y[j] += ny * m;
          continue;
        }
      } else {
        w = Math.min(solid[i], solid[j]);
        if (w <= 0) continue;
        if (d < 1e-4) { nx = 1; ny = 0; } else { nx = dx / d; ny = dy / d; }
      }
      const over = (need - d) * w;
      const m = over * a * 0.5;
      x[i] -= nx * m; y[i] -= ny * m;
      x[j] += nx * m; y[j] += ny * m;
      const shrink = over * (1 - a) * 0.5;
      r[i] = Math.max(rMin, r[i] - shrink);
      r[j] = Math.max(rMin, r[j] - shrink);
    }
  }

  solveWalls(box, P) {
    const { n, x, y, r } = this;
    const a = P.wallPush, rMin = P.rMin;
    for (let i = 0; i < n; i++) {
      let o = box.x0 - (x[i] - r[i]);
      if (o > 0) { x[i] += o * a; r[i] = Math.max(rMin, r[i] - o * (1 - a)); }
      o = x[i] + r[i] - box.x1;
      if (o > 0) { x[i] -= o * a; r[i] = Math.max(rMin, r[i] - o * (1 - a)); }
      o = box.y0 - (y[i] - r[i]);
      if (o > 0) { y[i] += o * a; r[i] = Math.max(rMin, r[i] - o * (1 - a)); }
      o = y[i] + r[i] - box.y1;
      if (o > 0) { y[i] -= o * a; r[i] = Math.max(rMin, r[i] - o * (1 - a)); }
    }
  }

  solvePoke(poke, P) {
    const { n, x, y, r } = this;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - poke.x, dy = y[i] - poke.y;
      const d = Math.hypot(dx, dy) || 1e-3;
      const need = poke.r + r[i];
      if (d >= need) continue;
      const over = need - d;
      x[i] += (dx / d) * over * 0.5;
      y[i] += (dy / d) * over * 0.5;
      r[i] = Math.max(P.rMin, r[i] - over * 0.25);
    }
  }

  // Hard guarantee: no ink ever leaves the box.
  clampToBox(box, P) {
    const { n, x, y, r } = this;
    const m = P.rMin;
    for (let i = 0; i < n; i++) {
      x[i] = Math.min(box.x1 - m, Math.max(box.x0 + m, x[i]));
      y[i] = Math.min(box.y1 - m, Math.max(box.y0 + m, y[i]));
      r[i] = Math.max(m * 0.5, Math.min(r[i], x[i] - box.x0, box.x1 - x[i], y[i] - box.y0, box.y1 - y[i]));
    }
  }

  // Capsules for the renderer, grouped by connected part, then stroke: each part
  // is painted as one sticker, strokes inside it blend at their joins.
  pack() {
    const { x, y, r } = this;
    const seg = this.seg, M4 = MAX_SEGS * 4;
    let ns = 0;
    const order = this.letters.map((L, i) => i).sort((a, b) => this.letters[a].transit - this.letters[b].transit);
    let compRank = 0;
    for (const li of order) {
      const L = this.letters[li];
      for (let c = 0; c < L.nComps; c++, compRank++) {
        for (const sid of L.strokes) {
          const S = this.strokes[sid];
          if (S.comp !== L.compBase + c) continue;
          for (let k = 0; k + 1 < S.count && ns < MAX_SEGS; k++) {
            const i = S.start + k, j = i + 1, o = ns * 4;
            seg[o] = x[i]; seg[o + 1] = y[i]; seg[o + 2] = x[j]; seg[o + 3] = y[j];
            seg[M4 + o] = r[i]; seg[M4 + o + 1] = r[j]; seg[M4 + o + 2] = compRank; seg[M4 + o + 3] = sid;
            ns++;
          }
        }
      }
    }
    return { segs: seg, nSegs: ns };
  }
}
