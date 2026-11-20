import { N, CELL, T, Terrain } from './terrain';

// Road planning: the cheapest way to lay a road between two places. Reusing paved road costs
// nothing, an old dirt track is cheap to upgrade, bridges carry it over rivers, and it goes round
// water, cliffs, forest and buildings. The route is then pulled straight where it can be and its
// corners rounded, so roads come out as long smooth curves rather than steps.

export interface RoadPlan { pts: [number, number][]; fresh: number } // ground points to pave through; new squares it would pave

const NEIGH = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

function passable(t: Terrain, i: number, ends: Set<number>) {
  const ty = t.type[i];
  if (ty === T.WATER || ty === T.ROCK || ty === T.FORD) return false;
  if (ends.has(i)) return true; // the doorsteps at either end are always allowed
  return !t.occupied[i] && !t.forest[i];
}
function stepCost(t: Terrain, i: number) {
  const ty = t.type[i];
  return ty === T.PAVED ? 0.1 : ty === T.BRIDGE ? 0.2 : ty === T.ROAD ? 0.55 : 1;
}

// from a start square to the first square goal() accepts, heading toward (hx, hy)
export function planRoad(t: Terrain, sx: number, sy: number, goal: (cx: number, cy: number) => boolean, hx: number, hy: number, maxNodes = 40000): RoadPlan | null {
  const start = t.idx(sx, sy), ends = new Set([start]);
  const g = new Map<number, number>([[start, 0]]), from = new Map<number, number>();
  const heap: [number, number][] = [[0, start]];
  const push = (f: number, i: number) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  let n = 0, end = -1;
  while (heap.length && n++ < maxNodes) {
    const [, i] = pop(), x = i % N, y = (i / N) | 0;
    if (goal(x, y)) { end = i; break; }
    const gi = g.get(i)!;
    for (const [dx, dy, c] of NEIGH) {
      const nx = x + dx, ny = y + dy; if (!t.inside(nx, ny)) continue;
      const j = ny * N + nx; if (!passable(t, j, ends) && !goal(nx, ny)) continue;
      if (dx && dy && (!passable(t, y * N + nx, ends) || !passable(t, ny * N + x, ends))) continue; // no squeezing between corners
      const ng = gi + c * stepCost(t, j);
      if (ng >= (g.get(j) ?? Infinity)) continue;
      g.set(j, ng); from.set(j, i);
      push(ng + Math.hypot(nx - hx, ny - hy) * 0.35, j);
    }
  }
  if (end < 0) return null;
  const cells: number[] = [];
  for (let i = end; ; i = from.get(i)!) { cells.push(i); if (i === start) break; }
  cells.reverse();
  const pts = smooth(t, cells, new Set([start, end]));
  return { pts, fresh: t.paveRoute(pts, -1, true) }; // priced by a dry run of the real paving, so the cost shown is the cost paid
}

// a road between two squares
export function roadBetween(t: Terrain, sx: number, sy: number, ex: number, ey: number) {
  return planRoad(t, sx, sy, (x, y) => x === ex && y === ey, ex, ey);
}

// Pull the route straight wherever a straight line stays on good ground (and on or off old roads
// alike), then round each corner once.
function smooth(t: Terrain, cells: number[], ends: Set<number>): [number, number][] {
  const at = (i: number): [number, number] => [((i % N) + 0.5) * CELL, (((i / N) | 0) + 0.5) * CELL];
  const road = (i: number) => t.type[i] === T.PAVED || t.type[i] === T.ROAD || t.type[i] === T.BRIDGE;
  const clear = (a: number, b: number) => {
    const [ax, ay] = at(a), [bx, by] = at(b), steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 6), r0 = road(a);
    for (let s = 1; s < steps; s++) {
      const i = t.idx(Math.floor((ax + ((bx - ax) * s) / steps) / CELL), Math.floor((ay + ((by - ay) * s) / steps) / CELL));
      if (!passable(t, i, ends) || road(i) !== r0) return false; // keep to the old road where it runs along one
    }
    return true;
  };
  const keep = [cells[0]];
  for (let i = 0; i < cells.length - 1;) {
    let j = cells.length - 1;
    while (j > i + 1 && !clear(cells[i], cells[j])) j--;
    keep.push(cells[j]); i = j;
  }
  let pts = keep.map(at);
  if (pts.length > 2) { // round the corners: each corner cut a quarter of the way along both sides
    const out: [number, number][] = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      if (k > 0) out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      if (k < pts.length - 2) out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
