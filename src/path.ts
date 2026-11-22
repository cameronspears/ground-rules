// Route-finding on the map's cells. Tanks may plough through forest (at a cost); infantry go around.
import { Terrain, N, CELL } from './terrain';

const g = new Float32Array(N * N), from = new Int32Array(N * N), closed = new Uint8Array(N * N), seen = new Uint32Array(N * N);
let gen = 0;
// how much searching has been done this frame (the game spreads route planning over frames), and
// whether the last search reached its goal or stopped at the nearest reachable square
export const pathStats = { work: 0, reached: true };

export function findPath(t: Terrain, sx: number, sy: number, tx: number, ty: number, crush: boolean, maxNodes = 50000): [number, number][] {
  gen++;
  const scx = Math.floor(sx / CELL), scy = Math.floor(sy / CELL);
  let tcx = Math.max(0, Math.min(N - 1, Math.floor(tx / CELL))), tcy = Math.max(0, Math.min(N - 1, Math.floor(ty / CELL)));
  if (!t.open(tcx, tcy, crush)) { // the spot itself is blocked (water, a building, a cliff): head for the nearest open square instead of searching for the impossible
    let bd = 1e9, bx = tcx, by = tcy;
    for (let r = 1; r <= 8 && bd === 1e9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tcx + dx, y = tcy + dy; if (x < 0 || y < 0 || x >= N || y >= N || !t.open(x, y, crush)) continue;
      const d = Math.hypot(dx, dy); if (d < bd) { bd = d; bx = x; by = y; }
    }
    if (bd < 1e9) { tcx = bx; tcy = by; tx = (bx + 0.5) * CELL; ty = (by + 0.5) * CELL; }
  }
  // a short hop with nothing in the way (closing on a target, stepping to a rally point): just go straight,
  // no search (in a big battle hundreds of units do this every second)
  if (Math.abs(tcx - scx) + Math.abs(tcy - scy) <= 12 && !t.forest[tcy * N + tcx] && clear(t, sx, sy, tx, ty, crush)) { pathStats.work += 12; pathStats.reached = true; return [[tx, ty]]; }
  const s = scy * N + scx, goal = tcy * N + tcx;
  const H = (x: number, y: number) => { const dx = Math.abs(x - tcx), dy = Math.abs(y - tcy); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 0.95; }; // close to the true distance, so the search heads for the goal without wandering
  const heap: number[] = [], hf: number[] = [];
  const push = (i: number, f: number) => {
    heap.push(i); hf.push(f);
    for (let k = heap.length - 1; k > 0;) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], li = heap.pop()!, lf = hf.pop()!;
    if (heap.length) {
      heap[0] = li; hf[0] = lf;
      for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; }
    }
    return top;
  };
  const touch = (i: number) => { if (seen[i] !== gen) { seen[i] = gen; g[i] = 1e9; from[i] = -1; closed[i] = 0; } };
  touch(s); g[s] = 0; push(s, H(scx, scy));
  let best = s, bestH = 1e9, n = 0;
  while (heap.length && n < maxNodes) { // a fresh order searches far enough to find the way off a plateau or round a long wall; a quick re-plan on the move searches less
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1; n++;
    const cx = cur % N, cy = (cur / N) | 0;
    const h = H(cx, cy);
    if (h < bestH) { bestH = h; best = cur; }
    if (cur === goal) break;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!t.step(cx, cy, nx, ny, crush)) continue;
      if (dx && dy && (!t.step(cx, cy, nx, cy, crush) || !t.step(cx, cy, cx, ny, crush))) continue;
      const ni = ny * N + nx;
      touch(ni);
      if (closed[ni]) continue;
      const ty = t.type[ni], occ = t.occupied, hug = occ[ni + 1] || occ[ni - 1] || occ[ni + N] || occ[ni - N] ? 0.6 : 0; // a square beside a building costs a little: routes keep some room from walls, down the middle of a gap
      const cost = (dx && dy ? 1.414 : 1) * (ty === 7 || ty === 4 ? 0.75 : 1) + (t.forest[ni] ? 3 : 0) + hug; // roads are quicker, so routes prefer them (7 road, 4 bridge)
      if (g[cur] + cost < g[ni]) { g[ni] = g[cur] + cost; from[ni] = cur; push(ni, g[ni] + H(nx, ny)); }
    }
  }
  pathStats.work += n; pathStats.reached = best === goal;
  const cells: number[] = [];
  for (let c = best; c !== s && c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  const pts: [number, number][] = cells.map((c) => [((c % N) + 0.5) * CELL, (((c / N) | 0) + 0.5) * CELL]);
  if (best === goal && pts.length) pts[pts.length - 1] = [tx, ty];
  return smooth(t, sx, sy, pts, crush);
}

// Skip waypoints we can drive straight past.
function smooth(t: Terrain, sx: number, sy: number, p: [number, number][], crush: boolean) {
  if (p.length < 3) return p;
  const out: [number, number][] = [];
  let ax = sx, ay = sy, i = 0;
  while (i < p.length) {
    let j = Math.min(p.length - 1, i + 10);
    while (j > i && !clear(t, ax, ay, p[j][0], p[j][1], crush, 7)) j--; // as wide as a vehicle: a short cut that clips a corner isn't one
    out.push(p[j]); [ax, ay] = p[j]; i = j + 1;
  }
  return out;
}

export function clear(t: Terrain, ax: number, ay: number, bx: number, by: number, crush: boolean, r = 0): boolean {
  if (r) { const d = Math.hypot(bx - ax, by - ay) || 1, ox = (-(by - ay) / d) * r, oy = ((bx - ax) / d) * r; if (!clear(t, ax + ox, ay + oy, bx + ox, by + oy, crush) || !clear(t, ax - ox, ay - oy, bx - ox, by - oy, crush)) return false; } // (the way is checked down both sides as well as the middle)
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 3));
  let pcx = Math.floor(ax / CELL), pcy = Math.floor(ay / CELL);
  for (let k = 1; k <= steps; k++) {
    const cx = Math.floor((ax + ((bx - ax) * k) / steps) / CELL), cy = Math.floor((ay + ((by - ay) * k) / steps) / CELL);
    if (cx === pcx && cy === pcy) continue;
    if (!t.step(pcx, pcy, cx, cy, crush)) return false;
    if (cx !== pcx && cy !== pcy && (!t.step(pcx, pcy, cx, pcy, crush) || !t.step(pcx, pcy, pcx, cy, crush))) return false;
    pcx = cx; pcy = cy;
  }
  return true;
}

// A route that keeps to the road: a breadth-first walk over the squares road(x, y) allows (a town's streets), corner to
// corner only where both sides are road too, returned as the squares where it turns. Empty if the road doesn't join.
export function roadRoute(t: Terrain, sx: number, sy: number, tx: number, ty: number, road: (x: number, y: number) => boolean): [number, number][] {
  const s = t.idx(Math.floor(sx / CELL), Math.floor(sy / CELL)), g = t.idx(Math.floor(tx / CELL), Math.floor(ty / CELL));
  const from = new Map<number, number>([[s, -1]]), q = [s];
  for (let k = 0; k < q.length && !from.has(g); k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, j = t.idx(nx, ny);
      if (from.has(j) || !road(nx, ny) || (dx && dy && !(road(x + dx, y) && road(x, y + dy)))) continue;
      from.set(j, i); q.push(j);
    }
  }
  if (!from.has(g) || s === g) return [];
  const cells: number[] = []; for (let i = g; i !== s; i = from.get(i)!) cells.push(i);
  cells.reverse();
  const pt = (i: number): [number, number] => [(i % N + 0.5) * CELL, (((i / N) | 0) + 0.5) * CELL];
  return cells.filter((c, k) => k === cells.length - 1 || cells[k + 1] - c !== c - (k ? cells[k - 1] : s)).map(pt); // keep only the turns (and the end)
}
