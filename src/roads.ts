import { N, CELL, T, Terrain, ROAD_DIRS } from './terrain';

// Road planning, used by you and the computer alike. Roads are chains of squares (see
// Terrain.paveCells), so a new road that meets an old one shares its square: junctions always join.
// The route is the cheapest chain between two squares where:
// - your own road costs little, so new roads run along the network rather than beside it;
// - every turn costs extra (a sharp one more), so roads run long and straight and bend at 45°;
// - squares beside a building cost extra, so roads keep their distance, and never cut a corner;
// - woods cost a little more (the trees are felled), bridges a little less; water and cliffs are out.

export interface RoadPlan { cells: number[]; pts: [number, number][]; fresh: number; snapA: boolean; snapB: boolean } // the squares; their middles; new squares it would pave; whether each end joins a road
export interface Snap { x: number; y: number; dx: number; dy: number; end: boolean }

const centre = (i: number): [number, number] => [((i % N) + 0.5) * CELL, (((i / N) | 0) + 0.5) * CELL];
const cellAt = (t: Terrain, x: number, y: number) => t.idx(Math.max(0, Math.min(N - 1, Math.floor(x / CELL))), Math.max(0, Math.min(N - 1, Math.floor(y / CELL))));

// the nearest point on one of a side's paved roads, within r (the joins between road squares)
export function snapTo(t: Terrain, team: number, x: number, y: number, r = CELL * 1.6, ok?: (s: { ax: number; ay: number; bx: number; by: number }) => boolean): Snap | null {
  let best: Snap | null = null, bd = r;
  for (const s of t.paved) {
    if (s.team !== team || (ok && !ok(s))) continue;
    const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / L2));
    const px = s.ax + dx * k, py = s.ay + dy * k, d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { x: px, y: py, dx: dx / L, dy: dy / L, end: false }; }
  }
  return best;
}
// the nearest square of a side's own road within r, or -1
function roadSquare(t: Terrain, team: number, x: number, y: number, r = CELL * 1.6) {
  let best = -1, bd = r;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), R = Math.ceil(r / CELL);
  for (let yy = cy - R; yy <= cy + R; yy++) for (let xx = cx - R; xx <= cx + R; xx++) {
    if (!t.inside(xx, yy)) continue;
    const i = t.idx(xx, yy); if (t.type[i] !== T.PAVED || t.roadBy[i] !== team) continue;
    const d = Math.hypot((xx + 0.5) * CELL - x, (yy + 0.5) * CELL - y); if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function open(t: Terrain, i: number) { const ty = t.type[i]; return ty !== T.WATER && ty !== T.ROCK && ty !== T.FORD && !t.occupied[i]; }

// Squares at a cliff edge, worked out once per map (heights only change where a flood or drained lake
// leaves flat water or mud, which at most nudges what a road there costs).
const EDGES = new WeakMap<Terrain, Uint8Array>();
function edgesOf(t: Terrain) {
  let edge = EDGES.get(t); if (edge) return edge;
  edge = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; for (const [dx, dy] of ROAD_DIRS) if (t.inside(x + dx, y + dy) && Math.abs(t.elev[t.idx(x + dx, y + dy)] - t.elev[i]) > 1) { edge[i] = 1; break; } }
  EDGES.set(t, edge); return edge;
}
// search scratch, reused between searches (a stamp marks which entries belong to this search)
let G: Float32Array | null = null, FROM: Int32Array | null = null, STAMP: Uint32Array | null = null, gen = 0;
function route(t: Terrain, team: number, start: number, end: number, maxStates = 60000): number[] | null {
  const ok = (i: number) => i === start || i === end || open(t, i);
  const ex = end % N, ey = (end / N) | 0;
  // Can it get there at all? A quick flood over the squares (by the same rules, turns aside) rules
  // out the hopeless searches, like a road to the far bank of a river, that would try every way there is.
  const reach = new Uint8Array(N * N), q = new Int32Array(N * N); let qh = 0, qt = 0, found = false; q[qt++] = start; reach[start] = 1;
  while (qh < qt && !found) {
    const i = q[qh++], x = i % N, y = (i / N) | 0, ei = t.elev[i];
    for (let d = 0; d < 8; d++) {
      const [dx, dy] = ROAD_DIRS[d], nx = x + dx, ny = y + dy; if (!t.inside(nx, ny)) continue;
      const j = ny * N + nx; if (reach[j] || !ok(j)) continue;
      const ej = t.elev[j]; if (Math.abs(ei - ej) > 1) continue;
      if (dx && dy && (!ok(y * N + nx) || !ok(ny * N + x))) continue;
      if (dx && dy && (t.elev[y * N + nx] !== ei && t.elev[y * N + nx] !== ej || t.elev[ny * N + x] !== ei && t.elev[ny * N + x] !== ej)) continue;
      if (j === end) { found = true; break; }
      reach[j] = 1; q[qt++] = j;
    }
  }
  if (!found) return null;
  if (!G || G.length !== N * N * 9) { G = new Float32Array(N * N * 9); FROM = new Int32Array(N * N * 9); STAMP = new Uint32Array(N * N * 9); }
  const st = STAMP!, gA = G, fA = FROM!; gen++;
  const edge = edgesOf(t), nearC = new Uint8Array(N * N); // squares at a cliff edge; squares beside a building (1 no, 2 yes: worked out only for squares the search reaches)
  const near = (j: number) => { if (!nearC[j]) { const x = j % N, y = (j / N) | 0; nearC[j] = 1; for (const [dx, dy] of ROAD_DIRS) if (t.inside(x + dx, y + dy) && t.occupied[t.idx(x + dx, y + dy)]) { nearC[j] = 2; break; } } return nearC[j] === 2; };
  const g = { get: (s: number) => (st[s] === gen ? gA[s] : undefined), set: (s: number, v: number) => { st[s] = gen; gA[s] = v; } }, from = { get: (s: number) => fA[s], set: (s: number, v: number) => { fA[s] = v; } };
  const hf: number[] = [], hs: number[] = []; // the open list: a heap of (cost so far plus estimate, state) kept as two plain arrays
  const push = (f: number, s: number) => { let k = hf.length; hf.push(f); hs.push(s); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hs[k] = hs[p]; k = p; } hf[k] = f; hs[k] = s; };
  const pop = () => { const top = hs[0], lf = hf.pop()!, ls = hs.pop()!, L = hf.length; if (L) { let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = -1, mf = lf; if (l < L && hf[l] < mf) { m = l; mf = hf[l]; } if (r < L && hf[r] < mf) m = r; if (m < 0) break; hf[k] = hf[m]; hs[k] = hs[m]; k = m; } hf[k] = lf; hs[k] = ls; } return top; };
  const s0 = start * 9 + 8; g.set(s0, 0); push(0, s0); // a state is a square and the way it was entered (8: no way yet)
  let n = 0, goal = -1;
  while (hf.length && n++ < maxStates) {
    const s = pop(), i = (s / 9) | 0, came = s % 9;
    if (i === end) { goal = s; break; }
    const x = i % N, y = (i / N) | 0, gs = g.get(s)!;
    for (let d = 0; d < 8; d++) {
      const [dx, dy] = ROAD_DIRS[d], nx = x + dx, ny = y + dy; if (!t.inside(nx, ny)) continue;
      const j = ny * N + nx; if (!ok(j)) continue;
      const ei = t.elev[i], ej = t.elev[j];
      if (Math.abs(ei - ej) > 1) continue; // up and down cliffs only by a ramp
      if (dx && dy && (!ok(y * N + nx) || !ok(ny * N + x))) continue; // never cut a corner
      if (dx && dy && (t.elev[y * N + nx] !== ei && t.elev[y * N + nx] !== ej || t.elev[ny * N + x] !== ei && t.elev[ny * N + x] !== ej)) continue; // nor cut across a cliff edge
      const own = t.type[j] === T.PAVED && t.roadBy[j] === team;
      let turn = 0;
      if (came < 8 && came !== d) { const k = Math.min(Math.abs(came - d), 8 - Math.abs(came - d)); if (k > 2) continue; turn = (k === 1 ? 0.4 : 1.2) * (own ? 0.2 : 1); } // no hairpins
      const ground = own ? 0.3 : t.type[j] === T.BRIDGE ? 0.6 : (t.forest[j] ? 1.5 : 1) * (j !== end && near(j) ? 1.8 : 1) * (edge[j] ? 1.6 : 1); // keep back from cliff edges
      const ns = j * 9 + d, ng = gs + (dx && dy ? 1.414 : 1) * ground + turn;
      if (ng >= (g.get(ns) ?? Infinity)) continue;
      g.set(ns, ng); from.set(ns, s);
      const hx = Math.abs(nx - ex), hy = Math.abs(ny - ey);
      push(ng + (Math.max(hx, hy) + 0.414 * Math.min(hx, hy)) * 0.75, ns); // leans toward the goal: a good road, found quickly
    }
  }
  if (goal < 0) return null;
  const cells: number[] = [];
  for (let s = goal; ; s = from.get(s)!) { cells.push((s / 9) | 0); if (s === s0) break; }
  return cells.reverse();
}

// A road for a side from one ground point to another (each end joins a road of its own if one is close).
export function planBetween(t: Terrain, team: number, a: [number, number], b: [number, number], maxStates?: number): RoadPlan | null {
  const ra = roadSquare(t, team, a[0], a[1]), rb = roadSquare(t, team, b[0], b[1]);
  const start = ra >= 0 ? ra : cellAt(t, a[0], a[1]), end = rb >= 0 ? rb : cellAt(t, b[0], b[1]);
  if (start === end) return null;
  const cells = route(t, team, start, end, maxStates);
  if (!cells) return null;
  return { cells, pts: cells.map(centre), fresh: t.paveCells(cells, team, true), snapA: ra >= 0, snapB: rb >= 0 };
}
