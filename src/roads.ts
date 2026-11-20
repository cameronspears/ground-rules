import { N, CELL, T, Terrain } from './terrain';

// Road planning, used by you and the computer alike, aiming for roads that look planned:
// - ends snap onto your existing roads, and a new road turns in to meet an old one square on,
//   like a real T-junction; started from a road's open end, it carries straight on instead;
// - a straight road wherever nothing is in the way, cutting through woods (the trees are felled);
//   otherwise it goes round water, cliffs and buildings (crossing rivers on bridges), pulled
//   straight where it can be, corners rounded;
// - both ends on the same old dirt track: it upgrades that track, following its curve.
// Laying a road never repaints road already there, so junctions stay crisp.

export interface Snap { x: number; y: number; dx: number; dy: number; end: boolean } // a point on a road, the road's direction there, and whether it's the road's open end
export interface RoadPlan { pts: [number, number][]; fresh: number; snapA: Snap | null; snapB: Snap | null } // ground points to pave through; new squares it would pave

const LEAD = CELL * 1.6; // how far a road runs square-on into a junction

function passable(t: Terrain, i: number) { // forest is fine: the trees in the way are felled
  const ty = t.type[i];
  return ty !== T.WATER && ty !== T.ROCK && ty !== T.FORD && !t.occupied[i];
}
// How far each square's middle is from the nearest old dirt track's centre line (worked out once per map).
const trackCache = new WeakMap<Terrain, Float32Array>();
function trackDist(t: Terrain) {
  let d = trackCache.get(t);
  if (d) return d;
  d = new Float32Array(N * N).fill(1e9);
  for (const line of t.roadLines as [number, number][][]) for (let k = 0; k < line.length - 1; k++) {
    const ax = line[k][0] * CELL + 12, ay = line[k][1] * CELL + 12, bx = line[k + 1][0] * CELL + 12, by = line[k + 1][1] * CELL + 12, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) / CELL) - 3), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) / CELL) + 3), y0 = Math.max(0, Math.floor(Math.min(ay, by) / CELL) - 3), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) / CELL) + 3);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL, u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)), dd = Math.hypot(px - ax - dx * u, py - ay - dy * u);
      if (dd < d[y * N + x]) d[y * N + x] = dd;
    }
  }
  trackCache.set(t, d);
  return d;
}
const ON_TRACK = CELL * 0.6, BESIDE_TRACK = CELL * 2.5; // riding a track; running alongside one (which looks wrong, so it costs extra)
// the nearest point on an old dirt track's centre line, if within reach
function onTrackLine(t: Terrain, x: number, y: number, r = CELL): [number, number] | null {
  let best: [number, number] | null = null, bd = r;
  for (const line of t.roadLines as [number, number][][]) for (let k = 0; k < line.length - 1; k++) {
    const ax = line[k][0] * CELL + 12, ay = line[k][1] * CELL + 12, dx = line[k + 1][0] * CELL + 12 - ax, dy = line[k + 1][1] * CELL + 12 - ay, u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const px = ax + dx * u, py = ay + dy * u, d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; best = [px, py]; }
  }
  return best;
}
const cellAt = (t: Terrain, x: number, y: number) => t.idx(Math.max(0, Math.min(N - 1, Math.floor(x / CELL))), Math.max(0, Math.min(N - 1, Math.floor(y / CELL))));

// the nearest point on one of a side's paved roads, within r
export function snapTo(t: Terrain, team: number, x: number, y: number, r = CELL * 1.6, ok?: (s: { ax: number; ay: number; bx: number; by: number }) => boolean): Snap | null {
  let best: Snap | null = null, bd = r, seg: (typeof t.paved)[number] | null = null, tt = 0;
  for (const s of t.paved) {
    if (s.team !== team || (ok && !ok(s))) continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / L2));
    const px = s.ax + dx * k, py = s.ay + dy * k, d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { x: px, y: py, dx: dx / L, dy: dy / L, end: false }; seg = s; tt = k; }
  }
  if (best && seg && (tt < 0.02 || tt > 0.98)) { // at an end of its stretch: is anything else joined there?
    const ex = tt < 0.5 ? seg.ax : seg.bx, ey = tt < 0.5 ? seg.ay : seg.by, s0 = seg;
    if (!t.paved.some((s) => s !== s0 && s.team === team && (Math.hypot(s.ax - ex, s.ay - ey) < 4 || Math.hypot(s.bx - ex, s.by - ey) < 4))) {
      best = { x: ex, y: ey, dx: tt < 0.5 ? -best.dx : best.dx, dy: tt < 0.5 ? -best.dy : best.dy, end: true }; // direction points out of the open end
    }
  }
  return best;
}

// a straight line that stays on good ground (the squares at either end are always allowed)
function clearLine(t: Terrain, ax: number, ay: number, bx: number, by: number) {
  const a = cellAt(t, ax, ay), b = cellAt(t, bx, by), steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
  for (let s = 1; s < steps; s++) { const i = cellAt(t, ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps); if (i !== a && i !== b && !passable(t, i) && t.type[i] !== T.BRIDGE && t.type[i] !== T.PAVED) return false; }
  return true;
}

// the square-by-square way round obstacles (bridges are welcome, everything else costs the same)
const NEIGH = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
// costs: your own paved road is cheapest (new roads join the network rather than run beside it),
// an old track is cheap to upgrade, running right alongside a track costs extra, woods a little more.
function stepCost(t: Terrain, team: number, j: number, td: Float32Array) {
  const ty = t.type[j];
  if (ty === T.PAVED) return t.roadBy[j] === team ? 0.35 : 1;
  if (ty === T.BRIDGE) return 0.6;
  if (td[j] < ON_TRACK) return 0.55;
  return (td[j] < BESIDE_TRACK ? 1.7 : 1) * (t.forest[j] ? 1.6 : 1);
}
function cellRoute(t: Terrain, team: number, start: number, end: number, maxNodes = 30000): number[] | null {
  const td = trackDist(t);
  const ok = (i: number) => i === start || i === end || passable(t, i) || t.type[i] === T.BRIDGE || t.type[i] === T.PAVED;
  const ex = end % N, ey = (end / N) | 0;
  const g = new Map<number, number>([[start, 0]]), from = new Map<number, number>(), heap: [number, number][] = [[0, start]];
  const push = (f: number, i: number) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  let n = 0, found = false;
  while (heap.length && n++ < maxNodes) {
    const [, i] = pop();
    if (i === end) { found = true; break; }
    const x = i % N, y = (i / N) | 0, gi = g.get(i)!;
    for (const [dx, dy, c] of NEIGH) {
      const nx = x + dx, ny = y + dy; if (!t.inside(nx, ny)) continue;
      const j = ny * N + nx; if (!ok(j)) continue;
      if (dx && dy && (!ok(y * N + nx) || !ok(ny * N + x))) continue; // no squeezing between corners
      const ng = gi + c * stepCost(t, team, j, td);
      if (ng >= (g.get(j) ?? Infinity)) continue;
      g.set(j, ng); from.set(j, i);
      const hx = Math.abs(nx - ex), hy = Math.abs(ny - ey);
      push(ng + (Math.max(hx, hy) + 0.414 * Math.min(hx, hy)) * 0.4, j);
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let i = end; ; i = from.get(i)!) { cells.push(i); if (i === start) break; }
  return cells.reverse();
}

// The old dirt track both points lie on, if any: the stretch of it between them.
function trackBetween(t: Terrain, ax: number, ay: number, bx: number, by: number): [number, number][] | null {
  const P = (p: [number, number]): [number, number] => [p[0] * CELL + 12, p[1] * CELL + 12];
  const on = (line: [number, number][], x: number, y: number) => {
    let best: { k: number; px: number; py: number } | null = null, bd = CELL;
    for (let k = 0; k < line.length - 1; k++) {
      const [x0, y0] = P(line[k]), [x1, y1] = P(line[k + 1]), dx = x1 - x0, dy = y1 - y0, u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
      const px = x0 + dx * u, py = y0 + dy * u, d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = { k: k + u, px, py }; }
    }
    return best;
  };
  for (const line of t.roadLines as [number, number][][]) {
    const a = on(line, ax, ay), b = on(line, bx, by);
    if (!a || !b || Math.abs(a.k - b.k) < 0.05) continue;
    const pts: [number, number][] = [[a.px, a.py]], dir = b.k > a.k ? 1 : -1;
    for (let k = dir > 0 ? Math.ceil(a.k) : Math.floor(a.k); dir > 0 ? k < b.k : k > b.k; k += dir) pts.push(P(line[k]));
    pts.push([b.px, b.py]);
    return pts;
  }
  return null;
}

// What a square is for laying road: on a paved road, on an old track, or open ground.
function kind(t: Terrain, i: number, td: Float32Array) { return t.type[i] === T.PAVED || t.type[i] === T.BRIDGE ? 2 : td[i] < ON_TRACK ? 1 : 0; }
// Pull a square-by-square route straight wherever a line stays clear and on the same kind of
// ground (so it keeps to a road or track it runs along), then lay bends on a track onto its centre.
function pull(t: Terrain, cells: number[]): [number, number][] {
  const td = trackDist(t), at = (i: number): [number, number] => [((i % N) + 0.5) * CELL, (((i / N) | 0) + 0.5) * CELL];
  const same = (a: number, b: number) => {
    const [ax, ay] = at(a), [bx, by] = at(b), k0 = kind(t, a, td), steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
    for (let s = 1; s < steps; s++) if (kind(t, cellAt(t, ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps), td) !== k0) return false;
    return clearLine(t, ax, ay, bx, by);
  };
  const keep = [cells[0]];
  for (let i = 0; i < cells.length - 1;) {
    let j = cells.length - 1;
    while (j > i + 1 && !same(cells[i], cells[j])) j--;
    keep.push(cells[j]); i = j;
  }
  return keep.map((i) => (kind(t, i, td) === 1 ? onTrackLine(t, ...at(i)) ?? at(i) : at(i)));
}
// round each inner corner: cut a quarter of the way along both sides
function round(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    if (k > 0) out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
    if (k < pts.length - 2) out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A road for a side from one ground point to another.
export function planBetween(t: Terrain, team: number, a: [number, number], b: [number, number]): RoadPlan | null {
  const sa = snapTo(t, team, a[0], a[1]), sb = snapTo(t, team, b[0], b[1]);
  const A: [number, number] = sa ? [sa.x, sa.y] : a, B: [number, number] = sb ? [sb.x, sb.y] : b;
  if (Math.hypot(B[0] - A[0], B[1] - A[1]) < CELL * 0.75) return null;
  const done = (pts: [number, number][]): RoadPlan => ({ pts, fresh: t.paveRoute(pts, team, true), snapA: sa, snapB: sb });
  const track = trackBetween(t, A[0], A[1], B[0], B[1]);
  if (track) return done(track);
  // lead-ins: square on into a road's side, or straight on out of its open end
  const lead = (s: Snap | null, P: [number, number], toward: [number, number]): [number, number] | null => {
    if (!s) return null;
    let dx = s.end ? s.dx : -s.dy, dy = s.end ? s.dy : s.dx;
    if (!s.end && dx * (toward[0] - P[0]) + dy * (toward[1] - P[1]) < 0) { dx = -dx; dy = -dy; } // the side facing where it's going
    if (s.end && dx * (toward[0] - P[0]) + dy * (toward[1] - P[1]) < Math.hypot(toward[0] - P[0], toward[1] - P[1]) * 0.3) return null; // carrying straight on would double back
    const q: [number, number] = [P[0] + dx * LEAD, P[1] + dy * LEAD];
    return passable(t, cellAt(t, q[0], q[1])) ? q : null;
  };
  const A2 = lead(sa, A, B), B2 = lead(sb, B, A), from = A2 ?? A, to = B2 ?? B;
  let mid: [number, number][];
  const td = trackDist(t), plain = (() => { const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 6); for (let s = 1; s < steps; s++) { const i = cellAt(t, from[0] + ((to[0] - from[0]) * s) / steps, from[1] + ((to[1] - from[1]) * s) / steps); if (td[i] < BESIDE_TRACK || t.type[i] === T.PAVED) return false; } return true; })();
  if (plain && clearLine(t, from[0], from[1], to[0], to[1])) mid = [from, to]; // open ground all the way: one straight road
  else {
    const cells = cellRoute(t, team, cellAt(t, from[0], from[1]), cellAt(t, to[0], to[1]));
    if (!cells) return null;
    mid = pull(t, cells); mid[0] = from; mid[mid.length - 1] = to;
  }
  const pts: [number, number][] = [...(A2 ? [A] : []), ...mid, ...(B2 ? [B] : [])];
  return done(round(pts));
}
