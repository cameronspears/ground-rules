// Route-finding on the map's cells. Tanks may plough through forest (at a cost); infantry go around.
import { Terrain, N, CELL, insideMask } from './terrain';

const g = new Float32Array(N * N), from = new Int32Array(N * N), closed = new Uint8Array(N * N), seen = new Uint32Array(N * N);
let gen = 0;
let heapI = new Int32Array(1 << 14), heapF = new Float64Array(1 << 14); // the search's open list (see push and pop), kept between searches
function grow() { const i = new Int32Array(heapI.length * 2), f = new Float64Array(heapF.length * 2); i.set(heapI); f.set(heapF); heapI = i; heapF = f; }
// how much searching has been done this frame (the game spreads route planning over frames), and
// whether the last search reached its goal or stopped at the nearest reachable square
export const pathStats = { work: 0, reached: true };
// globalThis.pathVerify: check every remembered route against a fresh search (the simulator's --check turns it on)
const verify = () => (globalThis as { pathVerify?: boolean }).pathVerify === true;

export function findPath(t: Terrain, sx: number, sy: number, tx: number, ty: number, crush: boolean, maxNodes = 50000): [number, number][] {
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
  // The same search again (a unit that can't get there asks every few frames from the square it's stuck on; a crowd
  // sent to one spot asks from the same squares): the answer is kept while the ground it searched hasn't changed
  if (cacheOf !== t || cache.size > 50000) { cache.clear(); cacheOf = t; } // (a new map: a new game in the same page)
  const key = ((s * N * N + goal) * 2 + (crush ? 1 : 0)) * 65536 + maxNodes; // (maxNodes: below 65536)
  let r = cache.get(key);
  if (r && r.ver !== t.ver) { // the ground has changed since: still good if none of it was inside the box this search read
    const ch = t.changes;
    for (let k = r.ver * 4; k < ch.length; k += 4) if (ch[k] <= r.x1 && ch[k + 2] >= r.x0 && ch[k + 1] <= r.y1 && ch[k + 3] >= r.y0) { r = undefined; break; }
    if (r) r.ver = t.ver;
  }
  if (!r) { r = search(t, s, goal, tcx, tcy, crush, maxNodes); cache.set(key, r); }
  else if (verify()) { const f = search(t, s, goal, tcx, tcy, crush, maxNodes); if (f.n !== r.n || f.reached !== r.reached || f.cells.join() !== r.cells.join()) throw new Error(`stale route cache: ${s} -> ${goal}`); } // (every answer kept is the answer a fresh search gives,
  if (verify() && ++checks % 20 === 0) { const c = codes(t), inside = insideMask(); for (let i = 0; i < N * N; i++) if (c[i] !== codeAt(t, inside, i)) throw new Error(`stale square code: ${i}`); } // and every square's byte is what the map says)
  pathStats.work += r.n; pathStats.reached = r.reached;
  const pts: [number, number][] = Array.from(r.cells, (c) => [((c % N) + 0.5) * CELL, (((c / N) | 0) + 0.5) * CELL]);
  if (r.reached && pts.length) pts[pts.length - 1] = [tx, ty];
  return smooth(t, sx, sy, pts, crush);
}

// What a search needs to know about each square, in one byte (read eight times a square visited; the five tables it
// comes from cost five reads): 1 no way in (off the playable ground, rock, water or a building), 2 trees, 4 road or bridge,
// 8 beside a building, and its height times 16. Made once for a map, then kept up to date from t.changes.
let code = new Uint8Array(0), codeOf: Terrain | null = null, codeVer = 0, checks = 0;
function codeAt(t: Terrain, inside: Uint8Array, i: number) {
  const ty = t.type[i], occ = t.occupied;
  return (!inside[i] || ty === 6 || ty === 3 || occ[i] ? 1 : 0) | (t.forest[i] ? 2 : 0) | (ty === 7 || ty === 4 ? 4 : 0) | (occ[i + 1] || occ[i - 1] || occ[i + N] || occ[i - N] ? 8 : 0) | (t.elev[i] << 4); // (6 rock, 3 water, 7 road, 4 bridge)
}
function codes(t: Terrain) {
  const inside = insideMask(), NN = N * N;
  if (codeOf !== t) { code = new Uint8Array(NN); for (let i = 0; i < NN; i++) code[i] = codeAt(t, inside, i); codeOf = t; codeVer = t.ver; }
  const ch = t.changes;
  for (let k = codeVer * 4; k < ch.length; k += 4) { // each changed square, and its four neighbours (beside a building or not)
    const x0 = Math.max(0, ch[k]), y0 = Math.max(0, ch[k + 1]), x1 = Math.min(N - 1, ch[k + 2]), y1 = Math.min(N - 1, ch[k + 3]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const i of [y * N + x, y * N + x - 1, y * N + x + 1, (y - 1) * N + x, (y + 1) * N + x]) if (i >= 0 && i < NN) code[i] = codeAt(t, inside, i);
  }
  codeVer = t.ver;
  return code;
}

// the squares from the start (not included) to the goal or the nearest it got, how many squares it looked at, and the box of
// ground it read (the squares it looked at, and two more all round: their neighbours, and theirs for keeping off walls) as of t.ver
type Found = { cells: Int32Array; n: number; reached: boolean; ver: number; x0: number; y0: number; x1: number; y1: number };
const cache = new Map<number, Found>();
let cacheOf: Terrain | null = null;

// A* from square s toward goal, looking at no more than maxNodes squares. Written out in one loop over typed arrays
// (it visits millions of squares in a match): the open list is a binary heap, entries moved along a hole; a square's
// neighbours are taken row above, own row, row below, each left to right (the order breaks ties between equal routes)
const DX = [-1, 0, 1, -1, 1, -1, 0, 1], DY = [-1, -1, -1, 0, 0, 1, 1, 1];
function search(t: Terrain, s: number, goal: number, tcx: number, tcy: number, crush: boolean, maxNodes: number): Found {
  const gn = ++gen;
  const c = codes(t);
  // close to the true distance, so the search heads for the goal without wandering
  const H = (x: number, y: number) => { const dx = Math.abs(x - tcx), dy = Math.abs(y - tcy); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 0.95; };
  // can a unit at height e step onto square i (t.step): a way in (off the grid reads undefined), no trees unless it
  // crushes them, and no more than one step up or down
  const step = (e: number, i: number) => { const ci = c[i]; return ci !== undefined && !(ci & 1) && (crush || !(ci & 2)) && Math.abs(e - (ci >> 4)) <= 1; };
  let hI = heapI, hF = heapF, len = 0;
  const scx = s % N, scy = (s / N) | 0;
  seen[s] = gn; g[s] = 0; from[s] = -1; closed[s] = 0;
  hI[0] = s; hF[0] = H(scx, scy); len = 1;
  let best = s, bestH = 1e9, n = 0, x0 = scx, y0 = scy, x1 = scx, y1 = scy;
  const ok = [false, false, false, false, false, false, false, false];
  while (len && n < maxNodes) { // a fresh order searches far enough to find the way off a plateau or round a long wall; a quick re-plan on the move searches less
    const cur = hI[0];
    if (--len) { // pop
      const li = hI[len], lf = hF[len];
      let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k, mf = lf; if (l < len && hF[l] < mf) { m = l; mf = hF[l]; } if (r < len && hF[r] < mf) m = r; if (m === k) break; hI[k] = hI[m]; hF[k] = hF[m]; k = m; }
      hI[k] = li; hF[k] = lf;
    }
    if (closed[cur]) continue;
    closed[cur] = 1; n++;
    const cx = cur % N, cy = (cur / N) | 0;
    if (cx < x0) x0 = cx; else if (cx > x1) x1 = cx;
    if (cy < y0) y0 = cy; else if (cy > y1) y1 = cy;
    const h = H(cx, cy);
    if (h < bestH) { bestH = h; best = cur; }
    if (cur === goal) break;
    // the four straight steps, checked once: a diagonal needs both of its sides open too
    const e = c[cur] >> 4, up = step(e, cur - N), down = step(e, cur + N), left = step(e, cur - 1), right = step(e, cur + 1);
    ok[0] = up && left && step(e, cur - N - 1); ok[1] = up; ok[2] = up && right && step(e, cur - N + 1);
    ok[3] = left; ok[4] = right;
    ok[5] = down && left && step(e, cur + N - 1); ok[6] = down; ok[7] = down && right && step(e, cur + N + 1);
    const gc = g[cur];
    for (let d = 0; d < 8; d++) {
      if (!ok[d]) continue;
      const dx = DX[d], dy = DY[d], ni = cur + dy * N + dx;
      if (seen[ni] !== gn) { seen[ni] = gn; g[ni] = 1e9; from[ni] = -1; closed[ni] = 0; }
      else if (closed[ni]) continue;
      const cn = c[ni], cost = (dx && dy ? 1.414 : 1) * (cn & 4 ? 0.75 : 1) + (cn & 2 ? 3 : 0) + (cn & 8 ? 0.6 : 0); // roads are quicker, so routes prefer them; trees cost; and a square beside a building costs a little: routes keep some room from walls, down the middle of a gap
      if (gc + cost < g[ni]) { // push
        g[ni] = gc + cost; from[ni] = cur;
        const f = g[ni] + H(cx + dx, cy + dy);
        if (len === hI.length) { grow(); hI = heapI; hF = heapF; }
        let k = len++;
        while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= f) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; }
        hI[k] = ni; hF[k] = f;
      }
    }
  }
  const cells: number[] = [];
  for (let c = best; c !== s && c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  return { cells: Int32Array.from(cells), n, reached: best === goal, ver: t.ver, x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 };
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
