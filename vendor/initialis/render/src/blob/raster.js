// Raster tools on the 256 px em grid shared by the analyses: exact distance
// transform, Zhang-Suen thinning, spur pruning. A mask is a Uint8Array(R * R).

export const R = 256;

// Exact Euclidean distance from every ink pixel to the nearest white one, px.
// Any square size `R` works; the analyses use the 256 px em.
export function distance(m, R = 256) {
  const INF = 1e12, D = new Float64Array(R * R);
  for (let i = 0; i < R * R; i++) D[i] = m[i] ? INF : 0;
  const f = new Float64Array(R), d = new Float64Array(R), v = new Int32Array(R), z = new Float64Array(R + 1);
  const pass = (get, set) => {
    for (let q = 0; q < R; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < R; q++) {
      let s;
      for (;;) {
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s > z[k]) break;
        k--;
      }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < R; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
    for (let q = 0; q < R; q++) set(q, d[q]);
  };
  for (let x = 0; x < R; x++) pass((q) => D[q * R + x], (q, val) => (D[q * R + x] = val));
  for (let y = 0; y < R; y++) pass((q) => D[y * R + q], (q, val) => (D[y * R + q] = val));
  const out = new Float32Array(R * R);
  for (let i = 0; i < R * R; i++) out[i] = Math.sqrt(D[i]);
  return out;
}

// Zhang-Suen thinning down to a one-pixel centreline.
export function thin(m) {
  const s = m.slice();
  let live = [];
  for (let i = 0; i < R * R; i++) {
    const x = i % R, y = (i / R) | 0;
    if (s[i] && x > 0 && y > 0 && x < R - 1 && y < R - 1) live.push(i);
    else s[i] = 0;
  }
  const p = new Uint8Array(8);
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const kill = [];
      for (const i of live) {
        if (!s[i]) continue;
        p[0] = s[i - R]; p[1] = s[i - R + 1]; p[2] = s[i + 1]; p[3] = s[i + R + 1];
        p[4] = s[i + R]; p[5] = s[i + R - 1]; p[6] = s[i - 1]; p[7] = s[i - R - 1];
        const b = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) & 7]) a++;
        if (a !== 1) continue;
        if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        kill.push(i);
      }
      for (const i of kill) s[i] = 0;
      if (kill.length) changed = true;
    }
    live = live.filter((i) => s[i]);
  }
  return s;
}

// Thinning leaves little spurs at corners and stroke ends; snip any branch
// shorter than `len` px that ends in nothing. With a distance map `dt`, a branch
// may also be up to `k` times as long as the ink is wide where it leaves (the
// triangle at the end of a Song bar, the corner of a heavy stroke).
export function prune(sk, len, dt = null, k = 0) {
  let far = len;
  if (dt) for (let i = 0; i < R * R; i++) if (sk[i]) far = Math.max(far, Math.ceil(k * dt[i]));
  const deg = (i) => {
    const x = i % R, y = (i / R) | 0;
    let d = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const xx = x + ox, yy = y + oy;
      if (xx >= 0 && yy >= 0 && xx < R && yy < R && sk[yy * R + xx]) d++;
    }
    return d;
  };
  for (let i = 0; i < R * R; i++) {
    if (!sk[i] || deg(i) !== 1) continue;
    const path = [i];
    let cur = i, prev = -1;
    while (path.length <= far) {
      let next = -1, count = 0;
      const x = cur % R, y = (cur / R) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= R || yy >= R) continue;
        const j = yy * R + xx;
        if (sk[j] && j !== prev && !path.includes(j)) { next = j; count++; }
      }
      if (count !== 1) break;
      if (deg(next) >= 3) {
        if (path.length <= Math.max(len, dt ? k * dt[next] : 0)) for (const p of path) sk[p] = 0;
        break;
      }
      prev = cur;
      cur = next;
      path.push(cur);
    }
  }
  return sk;
}
