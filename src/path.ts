// Grid route-finding over the block heights. Steps of one block are fine; walls are not.
import { World } from './world';

export function passable(w: World, ax: number, az: number, bx: number, bz: number, crush: boolean, wide: boolean) {
  if (bx < 1 || bz < 1 || bx >= w.W - 1 || bz >= w.D - 1) return false;
  const ha = w.groundAt(ax, az, crush), hb = w.groundAt(bx, bz, crush);
  if (Math.abs(ha - hb) > 1) return false;
  if (wide) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (Math.abs(w.groundAt(bx + dx, bz + dz, crush) - hb) > 1) return false;
    }
  }
  return true;
}

export function findPath(w: World, sx: number, sz: number, tx: number, tz: number, crush: boolean, wide: boolean): [number, number][] {
  const W = w.W, D = w.D;
  sx = Math.floor(sx); sz = Math.floor(sz); tx = Math.max(1, Math.min(W - 2, Math.floor(tx))); tz = Math.max(1, Math.min(D - 2, Math.floor(tz)));
  const N = W * D;
  const g = new Float32Array(N).fill(1e9);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: number[] = [], hf: number[] = [];
  const push = (i: number, f: number) => {
    heap.push(i); hf.push(f);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0]; const li = heap.pop()!, lf = hf.pop()!;
    if (heap.length) {
      heap[0] = li; hf[0] = lf; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && hf[l] < hf[m]) m = l;
        if (r < heap.length && hf[r] < hf[m]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m;
      }
    }
    return top;
  };
  const hfun = (x: number, z: number) => { const dx = Math.abs(x - tx), dz = Math.abs(z - tz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const s = sz * W + sx, t = tz * W + tx;
  g[s] = 0; push(s, hfun(sx, sz));
  let best = s, bestH = hfun(sx, sz), expanded = 0;
  while (heap.length && expanded < 12000) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1; expanded++;
    if (cur === t) { best = t; break; }
    const cx = cur % W, cz = (cur / W) | 0;
    const hh = hfun(cx, cz);
    if (hh < bestH) { bestH = hh; best = cur; }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!passable(w, cx, cz, nx, nz, crush, wide)) continue;
        if (dx && dz && (!passable(w, cx, cz, cx + dx, cz, crush, wide) || !passable(w, cx, cz, cx, cz + dz, crush, wide))) continue;
        const ni = nz * W + nx;
        if (closed[ni]) continue;
        let cost = dx && dz ? 1.414 : 1;
        if (crush && w.groundAt(nx, nz, false) !== w.groundAt(nx, nz, true)) cost += 2;
        const ng = g[cur] + cost;
        if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ni, ng + hfun(nx, nz)); }
      }
  }
  const out: [number, number][] = [];
  for (let c = best; c !== -1 && c !== s; c = from[c]) out.push([(c % W) + 0.5, ((c / W) | 0) + 0.5]);
  out.reverse();
  return smooth(w, sx + 0.5, sz + 0.5, out, crush, wide);
}

// Drop waypoints we can walk straight past.
function smooth(w: World, sx: number, sz: number, p: [number, number][], crush: boolean, wide: boolean) {
  if (p.length < 3) return p;
  const out: [number, number][] = [];
  let ax = sx, az = sz, i = 0;
  while (i < p.length) {
    let j = Math.min(p.length - 1, i + 12);
    while (j > i && !clear(w, ax, az, p[j][0], p[j][1], crush, wide)) j--;
    out.push(p[j]);
    [ax, az] = p[j];
    i = j + 1;
  }
  return out;
}

function clear(w: World, ax: number, az: number, bx: number, bz: number, crush: boolean, wide: boolean) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d * 2);
  let px = Math.floor(ax), pz = Math.floor(az);
  for (let k = 1; k <= n; k++) {
    const x = Math.floor(ax + ((bx - ax) * k) / n), z = Math.floor(az + ((bz - az) * k) / n);
    if (x === px && z === pz) continue;
    if (!passable(w, px, pz, x, z, crush, wide)) return false;
    if (x !== px && z !== pz && (!passable(w, px, pz, x, pz, crush, wide) || !passable(w, px, pz, px, z, crush, wide))) return false;
    px = x; pz = z;
  }
  return true;
}
