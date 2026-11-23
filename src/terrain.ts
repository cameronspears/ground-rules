// The map: a grid of cells of 24 pixels (about 7 m each). The playable ground is the diamond inside it
// (|x - c| + |y - c| within HALF), which the isometric view shows as a rectangle; the corners are off the map.
// Cells say what the ground is and how high (low, ramp, high plateau). The ground is painted
// pixel by pixel into big canvases once at load, with ragged natural edges, and then marked as
// the battle goes on: tank tracks, stumps, fallen trees.
import { hash3 } from './hash';

// The map's size (in cells) is picked on the title screen and stored; the background painters are
// told it through their worker name, since they can't read storage.
export const SIZES = [272, 362, 452]; // grid sides: the playable diamond holds half the grid, as much ground as the old square maps of 192, 256 and 320
function mapSize() {
  try {
    if (typeof localStorage !== 'undefined') { const v = Number(localStorage.getItem('conquer-size')); if (SIZES.includes(v)) return v; }
    else { const m = /^n=(\d+)f?$/.exec((self as unknown as { name: string }).name ?? ''); if (m && SIZES.includes(Number(m[1]))) return Number(m[1]); }
  } catch {}
  return 362;
}
// FRONT LINE: a long valley from base to base between two mountain walls, instead of the open map (two players only).
function frontLine() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem('conquer-front') === '1';
    return /f$/.test((self as unknown as { name: string }).name ?? '');
  } catch { return false; }
}
export const FRONT = frontLine();
export const CELL = 24, N = mapSize(), MAP = CELL * N, LIFT = 8, HALF = N / 2 - 1, PLAY = N / Math.SQRT2; // HALF: the playable diamond's reach from the middle; PLAY: the side of the square of ground it matches (layout distances scale by it) // LIFT: pixels per elevation step
// FRONT LINE's valley, in squares from the line between the bases: open floor out to VALE, mountain walls to WALL, then off the map
export const VALE = Math.round(PLAY * 0.1), WALL = VALE + 10;
const across = (x: number, y: number) => Math.abs(x - (N - 1) / 2 + (y - (N - 1) / 2)) / Math.SQRT2; // squares from the line between the bases (it runs left to right across the screen)
export const enum T { GRASS, DIRT, SCRAP, WATER, BRIDGE, FORD, ROCK, ROAD, FIELD, PAVED } // PAVED: road laid during the game
export const CH = 512; const OY = -24; // CH: chunk size; the painted area starts a little above row 0 for raised ground

// The classic isometric view: the map turned 45° on screen so every building shows two sides equally, and the
// ground squashed to half height (2:1 diamonds), as a camera looking down at a slant sees it. Ground (x, y) -> screen (sx, sy).
export const YAW = (45 * Math.PI) / 180, YC = Math.cos(YAW), YS = Math.sin(YAW), SQ = 0.5; // SQ: the ground squashed top to bottom, as a camera looking down at a slant sees it
const SX0 = YS * MAP; // keeps screen x positive
export const SW = Math.ceil((YC + YS) * MAP), SH = Math.ceil((YC + YS) * MAP * SQ);
export const MINI = { s: 128 }; // the radar's size in panel pixels: the side panel sets it to fill its width
export function toScreen(gx: number, gy: number): [number, number] { return [YC * gx - YS * gy + SX0, (YS * gx + YC * gy) * SQ]; }
export function toGround(sx: number, sy: number): [number, number] { const x = sx - SX0, y = sy / SQ; return [YC * x + YS * y, -YS * x + YC * y]; }
// The playable diamond on screen: a rectangle (VIEW, in screen pixels). The camera keeps to it, and the minimap
// shows it stretched back to a square (the view's turn without the squash), so it fills the radar's box.
export const VIEW = (() => { const m = MAP / 2, h = HALF * CELL, v = [[m - h, m], [m + h, m], [m, m - h], [m, m + h]].map(([x, y]) => toScreen(x, y)); const x0 = Math.min(...v.map((p) => p[0])), x1 = Math.max(...v.map((p) => p[0])), y0 = Math.min(...v.map((p) => p[1])), y1 = Math.max(...v.map((p) => p[1])); return { x0, y0, w: x1 - x0, h: y1 - y0 }; })();
// where the camera may go: the playable rectangle, or FRONT LINE's valley and its walls
export const CAM = FRONT ? (() => { const m = MAP / 2, c = toScreen(m, m)[1], w = (WALL * CELL) / Math.SQRT2, y1 = toScreen(m + w, m + w)[1]; return { ...VIEW, y0: 2 * c - y1, h: 2 * (y1 - c) }; })() : VIEW;
export function fromMini(x: number, y: number, s: number): [number, number] { return toGround(VIEW.x0 + (x / s) * VIEW.w, VIEW.y0 + (y / s) * VIEW.h); } // a point on an s-pixel minimap -> ground

// Smooth noise in 0..1 (mean 0.5), features about s across. Gradient (Perlin) noise: each grid point
// gets a random slope rather than a random height, which makes round, organic blobs. (Height noise
// makes squarish blobs with straight runs along the grid: the stair-stepped look.) Its spread matches
// the old noise's, so maps keep the same share of earth, woods and rock.
const GRAD = Float64Array.from({ length: 512 }, (_, i) => ((i & 1) ? Math.sin : Math.cos)(((i >> 1) / 256) * Math.PI * 2)); // 256 evenly spread directions
function vnoise(x: number, y: number, s: number, seed: number) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const g = (a: number, b: number, ox: number, oy: number) => { const k = ((hash3(a, seed, b) * 256) | 0) << 1; return GRAD[k] * ox + GRAD[k + 1] * oy; };
  const u = tx * tx * tx * (tx * (tx * 6 - 15) + 10), v = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  return 0.5 + (g(ix, iy, tx, ty) * (1 - u) + g(ix + 1, iy, tx - 1, ty) * u) * (1 - v) + (g(ix, iy + 1, tx, ty - 1) * (1 - u) + g(ix + 1, iy + 1, tx - 1, ty - 1) * u) * v;
}
type P = [number, number];
// Symmetry: a duel map is mirrored through the centre; a map for three or four is turned four ways.
function orbitFor(players: number) { const M = (p: P): P => [N - 1 - p[0], N - 1 - p[1]], Rot = (p: P): P => [N - 1 - p[1], p[0]]; return (p: P): P[] => (players > 2 ? [p, Rot(p), M(p), Rot(M(p))] : [p, M(p)]); }
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// a small seeded random number generator, so a seed always makes the same map
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// a lake's shore distance from its centre in a direction: a smooth, wavy outline (turned with each symmetric copy)
function shoreR(lk: number[], a: number) { const t = a - lk[3]; return lk[2] * (0.8 + 0.12 * Math.sin(2 * t + lk[4]) + 0.08 * Math.sin(3 * t + lk[5]) + 0.04 * Math.sin(5 * t + lk[6])); }
// Round off a line's corners (Chaikin's method, ends kept): each pass cuts every corner, so a few
// passes turn a zigzag into a natural curve.
export function smoothLine(pts: P[], passes = 3): P[] {
  let out = pts;
  for (let k = 0; k < passes && out.length > 2; k++) {
    const next: P[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) { const [ax, ay] = out[i], [bx, by] = out[i + 1]; next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
    next.push(out[out.length - 1]); out = next;
  }
  return out;
}
// The distance from a point to the nearest of some lines, fast: each 8x8-square area lists the line
// segments within `margin` squares of it, so a lookup checks only those. If none is that close it
// searches outward ring by ring until nothing further out could be nearer, so the answer is always
// exactly what checking every segment would give.
// (Rivers are smooth curves of hundreds of short segments: checking all of them for every pixel and
// every square was over half of all painting time.)
function segIndex(lines: P[][], margin: number, upTo = Infinity) { // upTo: distances beyond this (no more than margin) need only be known to be beyond it
  const BS = 8, nb = Math.ceil(N / BS) + 2, buckets: number[][] = Array.from({ length: nb * nb }, () => []), all: number[] = [];
  const BO = 32, no = Math.ceil(N / BO) + 2, own: number[][] = Array.from({ length: no * no }, () => []); // each segment filed under every (bigger) area its box touches, no margin, for the outward search
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const [ax, ay] = l[i], [bx, by] = l[i + 1]; all.push(ax, ay, bx, by);
    { const x0 = Math.max(0, Math.floor(Math.min(ax, bx) / BO) + 1), x1 = Math.min(no - 1, Math.floor(Math.max(ax, bx) / BO) + 1), y0 = Math.max(0, Math.floor(Math.min(ay, by) / BO) + 1), y1 = Math.min(no - 1, Math.floor(Math.max(ay, by) / BO) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) own[y * no + x].push(ax, ay, bx, by); }
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - margin) / BS) + 1), x1 = Math.min(nb - 1, Math.floor((Math.max(ax, bx) + margin) / BS) + 1);
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - margin) / BS) + 1), y1 = Math.min(nb - 1, Math.floor((Math.max(ay, by) + margin) / BS) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) buckets[y * nb + x].push(ax, ay, bx, by);
  }
  const near = (x: number, y: number, s: number[]) => {
    let best = 1e9;
    for (let k = 0; k < s.length; k += 4) { const ax = s[k], ay = s[k + 1], dx = s[k + 2] - ax, dy = s[k + 3] - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, d = Math.hypot(x - ax - dx * t, y - ay - dy * t); if (d < best) best = d; }
    return best;
  };
  return (x: number, y: number) => {
    const bx = Math.floor(x / BS) + 1, by = Math.floor(y / BS) + 1;
    if (bx >= 0 && by >= 0 && bx < nb && by < nb) { const d = near(x, y, buckets[by * nb + bx]); if (d <= margin || upTo <= margin) return d; }
    const ox = Math.floor(x / BO) + 1, oy = Math.floor(y / BO) + 1;
    if (ox < 0 || oy < 0 || ox >= no || oy >= no) return near(x, y, all);
    // further out: a segment not yet seen lies wholly beyond the rings searched, so at least that far away
    let best = 1e9;
    const edge = Math.min(x - (ox - 1) * BO, ox * BO - x, y - (oy - 1) * BO, oy * BO - y), look = (i: number, j: number) => { if (i >= 0 && j >= 0 && i < no && j < no && own[j * no + i].length) best = Math.min(best, near(x, y, own[j * no + i])); };
    for (let r = 0; r < no; r++) {
      if (!r) look(ox, oy);
      else { for (let i = ox - r; i <= ox + r; i++) { look(i, oy - r); look(i, oy + r); } for (let j = oy - r + 1; j < oy + r; j++) { look(ox - r, j); look(ox + r, j); } }
      if (best <= r * BO + edge) return best;
    }
    return best;
  };
}
// the stream search's working tables (see flowFrom), made on first use and let go once the map is made
const FLOW_POPS = 250000; // the most squares a stream's search looks at
let flowTables: { g: Float64Array; from: Int32Array; done: Uint8Array; seen: number[]; heap: Int32Array; hf: Float64Array } | null = null;
function lineDist(x: number, y: number, pts: P[]) {
  let best = 1e9, bx = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [cx, cy] = pts[i + 1];
    const dx = cx - ax, dy = cy - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
    if (d < best) { best = d; bx = ax + dx * t; }
  }
  return [best, bx];
}

// ---- hand-picked natural palette ----
// Grass blends between a lush and a dry family; every material has a light and a dark accent
// so detail can be drawn as bright pixels sitting right next to dark ones.
const LUSH = [0x46622f, 0x4c6a33, 0x41592b], DRY = [0x737544, 0x6a6c3e, 0x7c7c48], HIGH = [0x5b6e3a, 0x63743e, 0x566838];
const TIP = 0x8aa25a, TIP_DRY = 0xa8a466, BASE = 0x2c3e1f, FLOWERS = [0xe8dc8a, 0xd8d4c4, 0xc890a0];
const FOREST = [0x39472a, 0x404c2c, 0x47432e], NEEDLE = 0x5e4c32;
const SOIL = [0x6e5a40, 0x76624a, 0x665238], SOIL_HI = 0x9c8664, SOIL_LO = 0x463a29;
const SCRAPBED = [0x524434, 0x5a4a38];
const SCRAP = [0x8a5030, 0x9c5e36, 0x6c4028, 0x7a7c80, 0x5a5e64, 0x8e6a3c];
const DEEP = 0x26445a, MID = 0x2e5266, SHAL = 0x46706e, RIPPLE = 0x6a909a, FOAM = 0xd2dacc, SAND = 0xa69872, SAND_LO = 0x857858;
const ROCK = [0x7c786c, 0x868276, 0x6e6a60], ROCK_HI = 0xaaa494, ROCK_LO = 0x4c4a44, CRACK = 0x3a3832, MOSS = 0x5c6a3a;
const PLANK = [0x7a6040, 0x6c5438], PLANK_HI = 0x9c8058, RAIL = 0x3c2e20;

export class Terrain {
  type = new Uint8Array(N * N);
  elev = new Uint8Array(N * N); // 0 low, 1 ramp, 2 high
  forest = new Uint8Array(N * N); // standing trees in the cell
  occupied = new Uint8Array(N * N); // buildings
  scrap = new Uint16Array(N * N);
  chunks: HTMLCanvasElement[] = [];
  // The map changes during a game. Those changes are painted in the background as layers: 'drain'
  // paints only the drained lakes (as mud), baked into the map for good.
  paintMode: null | 'drain' | 'patch' = null; patchMask = new Set<number>(); bridgeCols: number[] = []; // patch: repaint just these squares as they now are (a fallen or rebuilt bridge)
  drained = new Set<number>(); // lakes whose dam has gone
  // Where a dam's stream runs: like water, down into the low ground and along it, meandering, to other
  // water (a river, another lake or pond; the citadel's moat only as a last resort) or off the map's
  // edge, round plateaus and over nothing built. (It used to weigh distance most, so it ran a ruler
  // line to the nearest water, which was often the moat.) The route's corners are then rounded off
  // and it's laid square by square with no gaps.
  flowFrom(lk: number[], dx: number, dy: number, ux: number, uy: number, free: (x: number, y: number) => boolean): { pts: P[]; cells: [number, number][] } | null {
    const H = this.height, own = (x: number, y: number) => Math.hypot(x - lk[0], y - lk[1]) < lk[2] * 1.4 + 4; // (its own lake's water is no place to end)
    const goal = (x: number, y: number) => { if (x <= 1 || y <= 1 || x >= N - 2 || y >= N - 2) return true; const q = this.type[this.idx(x, y)]; return (q === T.WATER || (q === T.FORD && !this.streamUnder.has(this.idx(x, y)))) && !own(x, y); };
    const ox = dx - 0.5, oy = dy - 0.5, sx = Math.round(ox + ux * 4), sy = Math.round(oy + uy * 4); // it runs straight out for a few squares before it may turn
    for (let k = 2; k <= 4; k++) if (!free(Math.round(ox + ux * k), Math.round(oy + uy * k))) return null;
    // the search keeps a heading too, so turns cost: water bends gently, it doesn't zigzag
    const D8: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], d0 = D8.findIndex(([a, b]) => a === ux && b === uy);
    // (the search's tables are flat arrays over every square, heading and straight run (and one more per square, for ending there), kept for the whole map-making and
    // wiped after each search: the same answers as maps and sets, many times faster on the biggest map)
    const S = (flowTables ??= { g: new Float64Array(N * N * 25).fill(1e9), from: new Int32Array(N * N * 25).fill(-1), done: new Uint8Array(N * N * 25), seen: [] as number[], heap: new Int32Array(3 * FLOW_POPS + 8), hf: new Float64Array(3 * FLOW_POPS + 8) }), { g, from, done, seen, heap, hf } = S;
    const st0 = (this.idx(sx, sy) * 8 + d0) * 3; let hn = 1; heap[0] = st0; hf[0] = 0; g[st0] = 0; seen.push(st0); // (the heap: hn entries; each step adds at most three)
    const push = (i: number, f: number) => { heap[hn] = i; hf[hn] = f; hn++; for (let k = hn - 1; k > 0;) { const q = (k - 1) >> 1; if (hf[q] <= hf[k]) break; const a = heap[q]; heap[q] = heap[k]; heap[k] = a; const b = hf[q]; hf[q] = hf[k]; hf[k] = b; k = q; } };
    const pop = () => { const top = heap[0]; hn--; const li = heap[hn], lf = hf[hn]; if (hn) { heap[0] = li; hf[0] = lf; for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && hf[l] < hf[m]) m = l; if (r < hn && hf[r] < hf[m]) m = r; if (m === k) break; const a = heap[m]; heap[m] = heap[k]; heap[k] = a; const b = hf[m]; hf[m] = hf[k]; hf[k] = b; k = m; } } return top; };
    // What the water feels: the lie of the land plus small rolls (a few squares across) it won't climb.
    // Low ground is cheap and high ground dear, so it finds the valley floor and follows it; distance alone counts for little.
    const lie = new Map<number, number>(), feel = (i: number) => { let v = lie.get(i); if (v === undefined) { const px = (i % N) * CELL, py = ((i / N) | 0) * CELL; v = H[i] + (vnoise(px, py, 12 * CELL, 211) - 0.5) * 1.6 + (vnoise(px, py, 5 * CELL, 212) - 0.5) * 0.5; lie.set(i, v); } return v; };
    // the citadel's moat is dug, not a valley: water keeps off the ground round it and joins the river well away from it
    const C0 = N / 2 - 0.5, byKeep = (i: number) => Math.hypot((i % N) - C0, ((i / N) | 0) - C0) < this.island + 14;
    const H0 = H[this.idx(sx, sy)], fc = new Map<number, number>(), fall = (i: number) => { let v = fc.get(i); if (v === undefined) { const px = (i % N) * CELL, py = ((i / N) | 0) * CELL; v = (0.3 + 0.8 * Math.exp(Math.min(2, feel(i) - H0))) * Math.exp((vnoise(px, py, 9 * CELL, 213) - 0.5) * 4) * (byKeep(i) ? 4 : 1); fc.set(i, v); } return v; }; // what a square costs to cross: dear above the head of the stream, cheap below it, and in patches dearer or cheaper still, which the water swings round (everywhere, the valley floor too)
    // Where it may end: a river, another lake or the map's edge. A little pond only if nothing else is anywhere near
    // (a pond fed by a stream would need an outlet too, and it hems in the land round it, and the roads); the moat only as a last resort.
    const pondOf = new Map<number, boolean>(), pond = (i: number) => {
      if (this.type[i] !== T.WATER) return false;
      let v = pondOf.get(i); if (v !== undefined) return v;
      const seen = [i], has = new Set(seen); for (let k = 0; k < seen.length && seen.length < 200; k++) { const c = seen[k], cx = c % N, cy = (c / N) | 0; for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + ex, y = cy + ey, j = this.idx(x, y); if (this.inside(x, y) && !has.has(j) && this.type[j] === T.WATER) { has.add(j); seen.push(j); } } }
      v = seen.length < 200; for (const c of seen) pondOf.set(c, v); return v;
    };
    const endCost = (i: number) => (byKeep(i) ? 60 : pond(i) ? 400 : 0), GOAL = N * N * 24;
    let end = -1, endFrom = -1, n = 0; const STRAIGHT = [0], TURNS = [0, 1, -1];
    while (hn && n++ < FLOW_POPS) {
      const cur = pop(); if (done[cur]) continue; done[cur] = 1;
      if (cur >= GOAL) { end = cur - GOAL; endFrom = from[cur]; break; }
      const cool = cur % 3, ci = Math.floor(cur / 24), cd = Math.floor(cur / 3) % 8, cx = ci % N, cy = (ci / N) | 0;
      for (const turn of cool ? STRAIGHT : TURNS) { // straight on, or an eighth of a turn once it has run straight for two squares: water sweeps round, it never turns a corner
        const nd = (cd + turn + 8) % 8, [ex, ey] = D8[nd], x = cx + ex, y = cy + ey; if (!this.inside(x, y)) continue;
        const ni = this.idx(x, y), len = ex && ey ? 1.414 : 1;
        if (goal(x, y)) { const ns = GOAL + ni, ng = g[cur] + len + endCost(ni); if (ng < g[ns]) { if (g[ns] === 1e9 && from[ns] < 0) seen.push(ns); g[ns] = ng; from[ns] = cur; push(ns, ng); } continue; }
        if (!free(x, y) || (ex && ey && (!free(cx + ex, cy) || !free(cx, cy + ey)))) continue; // no squeezing between corners
        const ns = (ni * 8 + nd) * 3 + (turn ? 2 : Math.max(0, cool - 1)), ng = g[cur] + len * fall(ni) + (turn ? 0.3 : 0) + 10 * Math.max(0, feel(ni) - feel(ci)); // water won't climb, keeps low, bends gently
        if (ng < g[ns]) { if (g[ns] === 1e9 && from[ns] < 0) seen.push(ns); g[ns] = ng; from[ns] = cur; push(ns, ng); }
      }
    }
    const raw: P[] = [];
    if (end >= 0) { raw.push([end % N, (end / N) | 0]); for (let c = endFrom; c >= 0; c = from[c]) { const ci = Math.floor(c / 24); raw.push([ci % N, (ci / N) | 0]); } raw.reverse(); }
    for (const i of seen) { g[i] = 1e9; from[i] = -1; done[i] = 0; } seen.length = 0;
    if (end < 0) return null;
    const head: P[] = [[ox + ux * 1.4, oy + uy * 1.4], [ox + ux * 3, oy + uy * 3]]; // straight out of the dam's middle (which falls between squares), then onto its route
    const ok = (x: number, y: number) => free(Math.round(x), Math.round(y)) || goal(Math.round(x), Math.round(y)); // the rounded line still on open ground
    // the widest curve: thin the route's points out and round it off; where the curve would cut onto
    // blocked ground, only that stretch is drawn back towards the route (which is all open ground)
    const mid = raw.slice(1, -1).filter((_, i) => i % 3 === 2), sm = smoothLine([...head, ...mid, raw[raw.length - 1]], 4);
    for (const p of sm) {
      if (ok(p[0], p[1])) continue;
      let best = raw[0], bd = 1e9; for (const r of raw) { const d = Math.hypot(r[0] - p[0], r[1] - p[1]); if (d < bd) { bd = d; best = r; } }
      for (let f = 0.25; f <= 1; f += 0.25) { const x = p[0] + (best[0] - p[0]) * f, y = p[1] + (best[1] - p[1]) * f; if (ok(x, y) || f === 1) { p[0] = x; p[1] = y; break; } }
    }
    const pts: P[] = [sm[0]]; // evenly spaced, half a square apart
    for (let i = 1; i < sm.length; i++) { let [px, py] = pts[pts.length - 1]; const [bx, by] = sm[i]; let d = Math.hypot(bx - px, by - py); while (d >= 0.5) { px += ((bx - px) / d) * 0.5; py += ((by - py) / d) * 0.5; pts.push([px, py]); d = Math.hypot(bx - px, by - py); } }
    const cells: [number, number][] = [], has = new Set<number>(), add = (x: number, y: number) => { const i = this.idx(x, y); if (!has.has(i) && !goal(x, y)) { has.add(i); cells.push([x, y]); } };
    let last: P | null = null;
    for (let k = 2; k <= 4; k++) add(Math.round(ox + ux * k), Math.round(oy + uy * k));
    for (const [px, py] of pts) { const x = Math.round(px), y = Math.round(py); if (last && last[0] !== x && last[1] !== y) { if (free(x, last[1])) add(x, last[1]); else add(last[0], y); } add(x, y); last = [x, y]; } // side by side, never just corner to corner: no breaks
    return pts.length >= 6 ? { pts, cells } : null;
  }
  // for each square near a stream, the stream's points close by (x, y, half-width, lake), for the painter
  private streamIdx: Map<number, number[]> | null = null;
  streamNear() {
    if (this.streamIdx) return this.streamIdx;
    const m = new Map<number, number[]>();
    for (const st of this.streams) st.pts.forEach(([x, y], k) => {
      const w = 0.42 + 0.3 * Math.min(1, k / 80);
      for (let cy = Math.floor(y - 1.6); cy <= Math.ceil(y + 1.6); cy++) for (let cx = Math.floor(x - 1.6); cx <= Math.ceil(x + 1.6); cx++) { if (!this.inside(cx, cy)) continue; const i = this.idx(cx, cy); let a = m.get(i); if (!a) m.set(i, (a = [])); a.push(x, y, w, st.lake); }
    });
    return (this.streamIdx = m);
  }
  // how far inside a lake's outlet channel a point is (in squares; negative outside): wide at the lake, narrow at the dam
  inChannel(ch: { ax: number; ay: number; bx: number; by: number }, x: number, y: number, wob: number) {
    const dx = ch.bx - ch.ax, dy = ch.by - ch.ay, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ch.ax) * dx + (y - ch.ay) * dy) / L));
    const d = Math.hypot(x - ch.ax - dx * t, y - ch.ay - dy * t), w = 2.2 - t * 1.1 + wob;
    return w - d;
  }
  // A lake's dam has gone: its water runs out and the bed is open mud (the same on every thread)
  drainLake(k: number) {
    const lk = this.lakes[k]; if (!lk || this.drained.has(k)) return [];
    this.drained.add(k);
    const out: number[] = [];
    for (let y = Math.floor(lk[1] - lk[2] * 1.3); y <= lk[1] + lk[2] * 1.3; y++) for (let x = Math.floor(lk[0] - lk[2] * 1.3); x <= lk[0] + lk[2] * 1.3; x++) {
      if (!this.inside(x, y)) continue;
      const i = this.idx(x, y);
      if (this.type[i] === T.WATER && Math.hypot(x - lk[0], y - lk[1]) < lk[2] * 1.25) {
        const wreck = vnoise(x * CELL, y * CELL, 70, 96) > 0.74 && Math.hypot(x - lk[0], y - lk[1]) < lk[2] * 0.8; // what sank over the years: scrap for salvagers
        this.type[i] = wreck ? T.SCRAP : T.DIRT; this.elev[i] = 0; if (wreck) this.scrap[i] = 500 + Math.floor(hash3(x, 97, y) * 400); out.push(i);
      }
    }
    for (const st of this.streams) if (st.lake === k) for (const i of st.cells) if (this.type[i] === T.FORD) { this.type[i] = T.DIRT; out.push(i); } // its stream runs dry
    for (const ch of this.channels) if (ch.lake === k) for (let y = Math.floor(Math.min(ch.ay, ch.by) - 3); y <= Math.max(ch.ay, ch.by) + 3; y++) for (let x = Math.floor(Math.min(ch.ax, ch.bx) - 3); x <= Math.max(ch.ax, ch.bx) + 3; x++) { if (!this.inside(x, y)) continue; const i = this.idx(x, y); if (this.type[i] === T.WATER && this.inChannel(ch, x, y, 0) > -0.5) { this.type[i] = T.DIRT; out.push(i); } }
    return out;
  }
  // which painted pieces of the map show some of these squares
  chunksOver(cells: (i: number) => boolean) {
    const out: number[] = [];
    for (let i = 0; i < this.chunkCount; i++) {
      const cx = i % this.cw, cy = Math.floor(i / this.cw);
      let hit = false;
      for (let a = 0; a <= 6 && !hit; a++) for (let b = 0; b <= 6 && !hit; b++) {
        const [gx, gy] = toGround(cx * CH + (a * CH) / 6, cy * CH + OY + (b * CH) / 6), x = Math.floor(gx / CELL), y = Math.floor(gy / CELL);
        for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) if (this.inside(x + dx, y + dy) && cells(this.idx(x + dx, y + dy))) hit = true;
      }
      if (hit) out.push(i);
    }
    return out;
  }
  // a layer back from the painters (a drained lake, a patch), baked into the map
  putLayer(i: number, d: Uint8ClampedArray) {
    const c = document.createElement('canvas');
    c.width = CH; c.height = CH;
    c.getContext('2d')!.putImageData(new ImageData(d as Uint8ClampedArray<ArrayBuffer>, CH, CH), 0, 0);
    if (this.chunks[i]) this.chunks[i].getContext('2d')!.drawImage(c, 0, 0);
    else this.later(i, (ctx) => ctx.drawImage(c, 0, 0)); // (a loaded save's changes can come back before the map itself is painted there)
  }
  cw = Math.ceil(SW / CH); chh = Math.ceil((SH - OY) / CH);
  minimap: HTMLCanvasElement;
  trees: P[] = [];
  glints: number[][] = []; // per chunk: x, y pairs of open-water pixels that sparkle
  bases: P[] = [];
  roadLines: P[][] = []; // dirt roads: the loop between the towns, their streets and the citadel drives (cell coordinates)
  villages: P[] = [];
  rivers: P[][] = [];
  island = 13; gates: number[] = []; gateW = 4; // the citadel's radius, in squares, the directions of its gates, and how far each gate's shallows reach either side of its line
  flanks: P[] = []; // the middle of each flank compound (a fuel depot, a repair yard and a power plant halfway between neighbouring bases)
  fordPts: P[] = []; // the middle of each ford
  dams: { lake: number; x: number; y: number; zone: number[]; face: number; ux: number; uy: number }[] = []; // face: which way the water runs (0 +x, 1 +y, 2 -x, 3 -y) // each dam's footprint corner and the squares it floods, nearest first
  height = new Float32Array(N * N); // the lie of the land (higher is higher): water runs down it, plants read its slopes
  channels: { lake: number; ax: number; ay: number; bx: number; by: number }[] = []; // each lake's outlet, narrowing to its dam
  streams: { lake: number; pts: P[]; cells: number[] }[] = []; streamUnder = new Map<number, number>(); // the stream below each dam (shallow, fordable), and the ground it runs over
  lakes: number[][] = []; peaks: [number, number, number][] = []; riverHW = new Float32Array(N * N); // lakes: x, y, radius, turn, three wave phases; peaks: x, y, radius; riverHW: the river's half-width near each square // big lakes and mountain massifs: x, y, radius
  orbit: (p: P) => P[] = (p) => [p]; // the symmetric copies of a square (set when the map is made)
  // civilian buildings and capturable sites: kind + footprint in cells
  sites: { kind: string; cx: number; cy: number; w: number; h: number }[] = [];
  derelicts: { type: string; x: number; y: number }[] = []; // abandoned machines waiting to be claimed
  // hidden oil: a different scatter every game. Found when a vehicle rolls close.
  oil: { cx: number; cy: number; big: boolean; found: boolean; tapped: boolean }[] = [];
  private wE: Float32Array; private wT: Float32Array; // precomputed edge-warp fields (quarter res)

  constructor(public seed = 1, public players = 2) { this.generate(); }
  // The made map as plain data, to hand to the paint workers (making it again in each costs seconds,
  // and a few touches use true randomness, so a remade map can differ in small ways).
  toData() { const skip = new Set(['chunks', 'minimap', 'pixel', 'ground', 'wE', 'wT', 'dotCtx', 'pending', 'streamIdx', 'glints', 'worn']); return Object.fromEntries(Object.entries(this).filter(([k, v]) => !skip.has(k) && typeof v !== 'function')); }
  static fromData(d: Record<string, unknown>): Terrain { const t = Object.create(Terrain.prototype) as Terrain; Object.assign(t, { chunks: [], glints: [], pending: new Map(), streamIdx: null, dotCtx: [], pixel: null, ground: null }, d); t.orbit = orbitFor(t.players); return t; }

  idx(cx: number, cy: number) { return cy * N + cx; }
  cellOf(px: number) { return Math.floor(px / CELL); }
  inside(cx: number, cy: number) { return Math.abs(cx - (N - 1) / 2) + Math.abs(cy - (N - 1) / 2) <= HALF && (!FRONT || across(cx, cy) <= WALL); } // on the playable diamond (and so on the grid); FRONT LINE: the valley and its walls
  edge(x: number, y: number) { const d = (HALF - Math.abs(x - (N - 1) / 2) - Math.abs(y - (N - 1) / 2)) / Math.SQRT2; return FRONT ? Math.min(d, VALE - across(x, y)) : d; } // squares to the nearest edge of the playable ground (negative: off it; FRONT LINE: the valley floor's edge)
  elevAt(px: number, py: number) { const cx = this.cellOf(px), cy = this.cellOf(py); return this.inside(cx, cy) ? this.elev[this.idx(cx, cy)] : 0; }
  lift(px: number, py: number) { return this.elevAt(px, py) * LIFT; }

  // Can a unit stand in this cell? Crushers (tanks) may drive into forest and flatten it.
  open(cx: number, cy: number, crush: boolean) {
    if (!this.inside(cx, cy)) return false;
    const i = this.idx(cx, cy), t = this.type[i];
    if (t === T.ROCK || this.occupied[i]) return false;
    if (t === T.WATER) return false;
    return crush || !this.forest[i];
  }
  step(ax: number, ay: number, bx: number, by: number, crush: boolean) {
    return this.open(bx, by, crush) && Math.abs(this.elev[this.idx(ax, ay)] - this.elev[this.idx(bx, by)]) <= 1;
  }

  // ------------------------------------------------------------ layout
  // A new map from the seed every game, mirrored through the centre so neither side is favoured:
  // a river splits the map with only a few crossings, an island in the middle with the richest
  // prize, rocky ridges with narrow passes, plateaus, villages on a loop road, scrap fields and
  // capture sites in mirrored pairs.
  generate() {
    const R = rng(this.seed), r = (a: number, b: number) => a + R() * (b - a), S = Math.abs(this.seed) % 997; // small: big seeds break the noise
    const four = this.players > 2, C: P = [N / 2 - 0.5, N / 2 - 0.5], SP = PLAY; // SP: distances across the map are set against the playable ground's size
    const pick = (m: number): P => { for (;;) { const x = r(0, N), y = r(0, N); if (this.edge(x, y) >= m) return [x, y]; } }; // a random spot at least m squares in from the edge
    const outTo = (p: P, past: number): P => { const dx = p[0] - C[0], dy = p[1] - C[1], k = (HALF + past * Math.SQRT2) / (Math.abs(dx) + Math.abs(dy)); return [C[0] + dx * k, C[1] + dy * k]; }; // out from the middle that way, to just past the edge
    // Symmetry: a duel map is mirrored through the centre; a map for three or four is turned four ways.
    const orbit = orbitFor(this.players), M = (p: P): P => [N - 1 - p[0], N - 1 - p[1]];
    this.orbit = orbit;
    // the one square in each symmetric set used for "random" choices, so all copies choose alike
    const canon = (x: number, y: number) => { let bx = x, by = y; for (const [a, b] of orbit([x, y])) if (b * N + a < by * N + bx) { bx = a; by = b; } return [bx, by]; };
    const ch = (x: number, y: number, k: number) => { const [a, b] = canon(x, y); return hash3(a, k + S, b); };
    // symmetric noise: averaged over the symmetric copies, so it matches everywhere and stays smooth
    const sn = (x: number, y: number, s: number, k: number) => { // (the copies worked out in place, in orbit's order: called for every square many times over)
      const mx = N - 1 - x, my = N - 1 - y; let v = vnoise(x, y, s, k + S);
      if (four) { v += vnoise(N - 1 - y, x, s, k + S); v += vnoise(mx, my, s, k + S); v += vnoise(N - 1 - my, mx, s, k + S); } else v += vnoise(mx, my, s, k + S);
      return Math.max(0, Math.min(1, 0.5 + (v / (four ? 4 : 2) - 0.5) * (four ? 2.3 : 1.7)));
    };
    const be = r(18, 26), bd = (HALF - be * Math.SQRT2) / 2, b0: P = [Math.round(C[0] - bd), Math.round(C[1] + bd)]; // the first base: at the left end of the screen's rectangle, be squares in from the edge
    this.bases = orbit(b0);
    const dBase = (x: number, y: number) => { let d = Infinity; for (const [bx, by] of this.bases) d = Math.min(d, Math.hypot(x - bx, y - by)); return d; };
    // rivers: a duel has one, corner to corner between the bases; four players get a cross that
    // splits the map into four quarters. Both meet at the island in the middle.
    const half: P[] = [outTo(four ? [-3, C[1] + r(-SP * 0.08, SP * 0.08)] : [-3 + C[0] - SP / 2, C[1] - SP / 2 + r(SP * 0.05, SP * 0.25)], 3)]; // (from just past the edge)
    for (let k = 1; k < 5; k++) {
      const f = k / 5, [sx, sy] = half[0], j = r(-1, 1) * SP * 0.06;
      half.push([sx + (C[0] - sx) * f + j * 0.7, sy + (C[1] - sy) * f - j * 0.7]);
    }
    // the flanks: halfway between neighbouring bases (a duel's two, on the line through the middle across the
    // one between the bases; four players' four, between each pair of neighbours), each with a compound of
    // prizes. The rivers divide the sides, so they'd run right through them: a river keeps a bank's width
    // to one side of each flank line, the side it starts on.
    const a0 = Math.atan2(b0[1] - C[1], b0[0] - C[0]), fa = a0 + (four ? Math.PI / 4 : Math.PI / 2);
    const flankDirs = orbit([C[0] + Math.cos(fa) * 40, C[1] + Math.sin(fa) * 40]).map(([x, y]) => Math.atan2(y - C[1], x - C[0]));
    for (const d of flankDirs) {
      const ux = Math.cos(d), uy = Math.sin(d), lat = (p: P) => -(p[0] - C[0]) * uy + (p[1] - C[1]) * ux, side = lat(half[0]) < 0 ? -1 : 1;
      for (let k = 1; k < half.length; k++) {
        const p = half[k], al = (p[0] - C[0]) * ux + (p[1] - C[1]) * uy, l = lat(p);
        if (al > SP * 0.14 && al < SP * 0.46 && l * side < 16) half[k] = [C[0] + ux * al - uy * side * 16, C[1] + uy * al + ux * side * 16];
      }
    }
    half.push(C);
    half.splice(0, half.length, ...smoothLine(half, 3)); // a river bends in curves, never corners (ends kept, so the halves meet straight through the middle)
    this.rivers = four ? [0, 1, 2, 3].map((k) => half.map((p) => orbit(p)[k])) : [[...half, ...half.slice(0, -1).reverse().map(M)]];
    const riverAt = segIndex(this.rivers, 48), riverMemo = new Float64Array(N * N).fill(-1); // (asked of every square several times over: each answer kept)
    const riverD = (x: number, y: number) => { if (!Number.isInteger(x) || !Number.isInteger(y) || !this.inside(x, y)) return riverAt(x, y); const i = this.idx(x, y); if (riverMemo[i] < 0) riverMemo[i] = riverAt(x, y); return riverMemo[i]; };
    // crossings: bridges (duels only: straight decks) and fords, all in symmetric sets
    const along = (f: number): P => { const i = Math.min(half.length - 2, Math.floor(f * (half.length - 1))), t = f * (half.length - 1) - i; return [half[i][0] + (half[i + 1][0] - half[i][0]) * t, half[i][1] + (half[i + 1][1] - half[i][1]) * t]; };
    const RING = SP * 0.36; // towns sit in a loose ring this far out from the middle, and the main road loops through them
    // the bridges, on that ring, where the river runs across a bridge's deck (decks run north-south on the grid), not along it
    const bridgeCost = (f: number) => { const [x, y] = along(f), [ax, ay] = along(Math.max(0, f - 0.02)), [bx, by] = along(Math.min(1, f + 0.02)); return Math.abs(Math.hypot(x - C[0], y - C[1]) - RING) + Math.max(0, Math.abs(by - ay) / (Math.abs(bx - ax) + 1e-6) - 0.8) * 20; };
    let fb = 0.3; for (let f = 0.1; f < 0.9; f += 0.01) if (bridgeCost(f) < bridgeCost(fb)) fb = f;
    const bridges = four ? [] : [Math.round(along(fb)[0]), N - 2 - Math.round(along(fb)[0])];
    this.bridgeCols = bridges;
    const fords: P[] = four ? [...orbit(along(0.3)), ...orbit(along(0.66))] : orbit(along(0.62));
    const island = 13; this.island = island; // the citadel: a big island with a moat, and wide shallow gates on every side
    // Its gates: a duel's two facing each base, four players' one; and on the flanks, one where each river
    // meets the moat, its mouth gone shallow, so the citadel opens onto both banks of the flank. Worked out
    // for the first side, then turned onto the others (so the list is the first side's gates, then each copy's).
    const ang = (p: P) => Math.atan2(p[1] - C[1], p[0] - C[0]), adiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    const mouthAt = (d: number): P => { for (let k = half.length - 1; k > 0; k--) if (Math.hypot(half[k - 1][0] - C[0], half[k - 1][1] - C[1]) >= d) { const [ax, ay] = half[k - 1], [bx, by] = half[k], da = Math.hypot(ax - C[0], ay - C[1]), db = Math.hypot(bx - C[0], by - C[1]), t = (da - d) / (da - db || 1); return [ax + (bx - ax) * t, ay + (by - ay) * t]; } return half[0]; };
    const m0 = ang(mouthAt(island + 2)), mouthDirs = orbit(mouthAt(island + 2)).map(ang), rMid = island + 1.5;
    const keepOff = (g: number) => { for (const m of mouthDirs) { const d = adiff(g, m), sep = (this.gateW * 2 + 3) / rMid; if (Math.abs(d) < sep) g = m + (d < 0 ? -sep : sep); } return g; }; // a base's gate stays clear of a river's
    const own = four ? [keepOff(m0 + (adiff(a0, m0) < 0 ? -1 : 1) * Math.PI / 4), m0] : [keepOff(a0 - 0.42), keepOff(a0 + 0.42), m0];
    if (!four && Math.abs(adiff(m0, fa)) > 0.6) own.push(keepOff(fa)); // the river met the moat well round from the flank: a gate of its own faces the flank compound // (four: the base's gate halfway between the rivers either side)
    const turned = (g: number) => orbit([C[0] + Math.cos(g) * 40, C[1] + Math.sin(g) * 40]).map(ang);
    const gates = this.gates = Array.from({ length: orbit([0, 0]).length }, (_, o) => own.map((g) => turned(g)[o])).flat();
    const gate = (x: number, y: number) => { const a = Math.atan2(y - C[1], x - C[0]), dc = Math.hypot(x - C[0], y - C[1]); return gates.some((g) => Math.abs(adiff(a, g)) * dc < this.gateW); };
    const mouths = orbit(mouthAt(island + 5.5)); // the river mouths' shallows, out past the moat
    this.fordPts = [...fords, ...mouths];
    this.flanks = FRONT ? [] : orbit([C[0] + Math.cos(fa) * SP * 0.28, C[1] + Math.sin(fa) * SP * 0.28]); // (where each compound aims to go; kept clear of ponds, lakes, mountains, ridges, scrap, rocks and rises)
    const dFlank = (x: number, y: number) => { let d = Infinity; for (const [fx, fy] of this.flanks) d = Math.min(d, Math.hypot(x - fx, y - fy)); return d; };
    // ponds
    const ponds: [number, number, number][] = [];
    for (let k = 0; k < 600 && ponds.length < (four ? 8 : 4); k++) {
      const [x, y] = pick(20), rad = r(3, 6);
      if (dBase(x, y) < 30 || riverD(x, y) < rad + 10 || dFlank(x, y) < rad + 12 || orbit([x, y]).some(([a, b]) => ponds.some(([px, py]) => Math.hypot(px - a, py - b) < 30))) continue;
      for (const [a, b] of orbit([x, y])) ponds.push([a, b, rad]);
    }
    // big lakes and mountain massifs: a symmetric set of each, clear of bases, rivers, the middle and each other
    const lakes: number[][] = [], peaks: [number, number, number][] = [];
    const clear = (x: number, y: number, rad: number) => dBase(x, y) > rad + 26 && dFlank(x, y) > rad + 14 && riverD(x, y) > rad + 9 && Math.hypot(x - C[0], y - C[1]) > rad + 22 && this.edge(x, y) > rad + 6
      && orbit([x, y]).every(([a, b]) => [...lakes, ...peaks, ...ponds].every(([px, py, pr]) => Math.hypot(px - a, py - b) > pr + rad + 10));
    { // lakes (each with a dam) go where the action is: partway out from the middle, close to the routes between bases
      let best: number[] | null = null, bs = -1e9;
      for (let k = 0; k < 900; k++) {
        const rad = r(13, 18), [x, y] = pick(20);
        if (!clear(x, y, rad)) continue;
        const dc = Math.hypot(x - C[0], y - C[1]), route = Math.min(...this.bases.map(([bx, by]) => lineDist(x, y, [[bx, by], C])[0]));
        const score = -Math.abs(dc - SP * 0.26) * 0.6 - Math.max(0, route - rad - 6) * 1.2 + r(0, 4);
        if (score > bs) { bs = score; best = [x, y, rad]; }
      }
      if (best) { const ph = [r(0, 6.28), r(0, 6.28), r(0, 6.28)]; orbit([best[0], best[1]]).forEach(([a, b], o) => lakes.push([a, b, best![2], o * (four ? Math.PI / 2 : Math.PI), ...ph])); }
    }
    for (let k = 0; k < 800 && peaks.length < (four ? 8 : 4); k++) { const rad = r(9, 14), [x, y] = pick(20); if (clear(x, y, rad)) for (const [a, b] of orbit([x, y])) peaks.push([a, b, rad]); }
    this.lakes = lakes; this.peaks = peaks;
    // scrap: a field near each base, symmetric sets out in the open, and the rich island in the middle
    const fields: [number, number, number, number][] = []; // x, y, radius, richness
    { const a = Math.atan2(C[1] - b0[1], C[0] - b0[0]) + r(-0.9, 0.9), d = r(13, 16); for (const [x, y] of orbit([b0[0] + Math.cos(a) * d, b0[1] + Math.sin(a) * d])) fields.push([x, y, 5, 1]); }
    for (let k = 0; k < 1000 && fields.length < (four ? 18 : 12); k++) {
      const [x, y] = pick(10), rad = r(3.5, 5.5);
      if (dBase(x, y) < 24 || riverD(x, y) < rad + 4 || dFlank(x, y) < rad + 9 || orbit([x, y]).some(([a, b]) => fields.some(([fx, fy]) => Math.hypot(fx - a, fy - b) < 22)) || [...ponds, ...lakes, ...peaks].some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + rad + 3)) continue;
      const rich = 1 + Math.min(1, (dBase(x, y) - 24) / (SP * 0.4)) * 0.6; // further from home, richer
      for (const [a, b] of orbit([x, y])) fields.push([a, b, rad, rich]);
    }
    fields.push([C[0], C[1], 4.5, 2.2]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!this.inside(x, y)) continue; // off the map: left as it is
      const i = this.idx(x, y), db = dBase(x, y), dr = riverD(x, y);
      const hw = 1.8 + sn(x, y, 11, 4) * 1.8, dc = Math.hypot(x - C[0], y - C[1]);
      this.riverHW[i] = hw;
      let t = T.GRASS;
      if (sn(x, y, 13, 6) > 0.74 || db < 7) t = T.DIRT;
      if ((dr < hw || dc < island + 3) && dc >= island) {
        t = T.WATER;
        if (bridges.includes(x) || bridges.includes(x - 1)) t = T.BRIDGE;
        else if (this.fordPts.some(([fx, fy]) => Math.hypot(x - fx, y - fy) < 3.5) || (dc < island + 3 && gate(x, y))) t = T.FORD; // wide shallow gates across the moat
      }
      for (const [px, py, pr] of ponds) if (Math.abs(x - px) < pr * 1.25 && Math.abs(y - py) < pr * 1.25 && Math.hypot(x - px, y - py) < pr * (0.8 + sn(x, y, 4, 12) * 0.4)) t = T.WATER; // (the first tests skip squares out of reach of any noise)
      for (const lk of lakes) if (Math.abs(x - lk[0]) < lk[2] * 1.1 && Math.abs(y - lk[1]) < lk[2] * 1.1 && Math.hypot(x - lk[0], y - lk[1]) < shoreR(lk, Math.atan2(y - lk[1], x - lk[0]))) t = T.WATER; // lakes, with smooth wavy shores
      for (const [sx, sy, sr, rich] of fields)
        if (t !== T.WATER && t !== T.BRIDGE && t !== T.FORD && Math.abs(x - sx) < sr * 1.3 && Math.abs(y - sy) < sr * 1.3 && Math.hypot(x - sx, y - sy) < sr * (0.75 + sn(x, y, 3, 8) * 0.5)) { t = T.SCRAP; this.scrap[i] = Math.round((300 + ch(x, y, 1) * 400) * rich); }
      if (t === T.GRASS && db > 14 && dr > 5 && dFlank(x, y) > 9 && ch(x, y, 2) < 0.004) t = T.ROCK; // scattered rocks
      this.type[i] = t;
      let e = 0;
      if (sn(x, y, 30, 5) > 0.64 && db > 20 && dr > 6 && dc > island + 4 && dFlank(x, y) > 10 && this.edge(x, y) > 3 && t !== T.SCRAP && t !== T.WATER && lakes.every((lk) => Math.hypot(x - lk[0], y - lk[1]) > lk[2] * 1.9)) e = 2; // (lakes lie in low ground, never sunk in a plateau)
      this.elev[i] = e;
    }
    // square off each bridge: both columns span the same rows and rest one cell onto each bank
    for (const bx of bridges) {
      let y0 = N, y1 = -1;
      for (let y = 0; y < N; y++) if (this.type[this.idx(bx, y)] === T.BRIDGE || this.type[this.idx(bx + 1, y)] === T.BRIDGE) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let y = 0; y < N; y++) for (const x of [bx, bx + 1]) {
        const i = this.idx(x, y);
        if (y >= y0 - 1 && y <= y1 + 1) { this.type[i] = T.BRIDGE; this.elev[i] = 0; }
        else if (this.type[i] === T.BRIDGE) this.type[i] = T.WATER;
      }
    }
    // tidy plateaus: drop lone high cells (worked out first, then applied, so it stays symmetric), then cut ramps
    for (let pass = 0; pass < 2; pass++) {
      const drop: number[] = [];
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = this.idx(x, y);
        if (this.elev[i] !== 2) continue;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.elev[this.idx(x + dx, y + dy)] === 2) n++;
        if (n < 2) drop.push(i);
      }
      for (const i of drop) this.elev[i] = 0;
    }
    const ramps: number[] = [];
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = this.idx(x, y);
      if (this.elev[i] !== 2) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.elev[this.idx(x + dx, y + dy)] === 0);
      if (edge && ch(x, y, 3) < 0.05) ramps.push(i); // few ramps: high ground is worth taking and holding
    }
    for (const i of ramps) this.elev[i] = 1;
    // rocky ridges with gaps (the passes), in symmetric sets
    const ridges: P[][] = [];
    for (let k = 0; k < 900 && ridges.length < (four ? 24 : 16); k++) {
      const [x, y] = pick(10);
      if (dBase(x, y) < 26 || riverD(x, y) < 10) continue;
      const a = r(0, Math.PI * 2), len = r(26, 50), pts: P[] = [[x, y]];
      for (let s = 1; s <= 3; s++) { const b = a + r(-0.5, 0.5); pts.push([pts[s - 1][0] + Math.cos(b) * len / 3, pts[s - 1][1] + Math.sin(b) * len / 3]); }
      if (this.flanks.some(([fx, fy]) => lineDist(fx, fy, pts)[0] < 12) || pts.some(([px, py]) => dBase(px, py) < 22 || riverD(px, py) < 8 || this.edge(px, py) < 3)) continue;
      const gap = r(0.35, 0.65), pieces: P[][] = [pts.slice(0, 2).concat([lerp(pts[1], pts[2], gap - 0.12)]), [lerp(pts[1], pts[2], gap + 0.12), ...pts.slice(2)]];
      for (const pc of pieces) for (let o = 0; o < orbit(pc[0]).length; o++) ridges.push(pc.map((p) => orbit(p)[o]));
    }
    const ridgeBox = ridges.map((rd) => [Math.min(...rd.map((p) => p[0])) - 2.5, Math.min(...rd.map((p) => p[1])) - 2.5, Math.max(...rd.map((p) => p[0])) + 2.5, Math.max(...rd.map((p) => p[1])) + 2.5]); // (a ridge is at most 2.4 squares wide either side)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y), t = this.type[i];
      if (t === T.WATER || t === T.BRIDGE || t === T.FORD || t === T.SCRAP) continue;
      for (let k = 0; k < ridges.length; k++) { const b = ridgeBox[k]; if (x < b[0] || y < b[1] || x > b[2] || y > b[3]) continue; if (lineDist(x, y, ridges[k])[0] < 1.3 + sn(x, y, 5, 14) * 1.1) { this.type[i] = T.ROCK; this.elev[i] = 2; break; } } // (each ridge's box, widened past its widest, skips the squares out of its reach)
    }
    if (FRONT) { // FRONT LINE: a chain of mountains along each side of the valley
      for (let a = -HALF / Math.SQRT2; a <= HALF / Math.SQRT2; a += 7) { // (each peak and its mirror twin: one wall each)
        const j = sn(a + C[0], C[1], 9, 31), o = (VALE + WALL) / 2 + 3 + j * 4, x = C[0] + (a + o) / Math.SQRT2, y = C[1] + (o - a) / Math.SQRT2; for (const q of orbit([x, y])) peaks.push([q[0], q[1], 9 + j * 4]); }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (across(x, y) > VALE + 1 + sn(x, y, 6, 29) * 4) { const i = this.idx(x, y); this.type[i] = T.ROCK; this.elev[i] = 2; this.scrap[i] = 0; this.forest[i] = 0; }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { // mountain massifs: impassable rock
      const i = this.idx(x, y), t = this.type[i];
      if (t === T.WATER || t === T.BRIDGE || t === T.FORD) continue;
      for (const [px, py, pr] of peaks) if (Math.abs(x - px) < pr * 1.3 && Math.abs(y - py) < pr * 1.3 && Math.hypot(x - px, y - py) < pr * (0.65 + sn(x, y, 6, 23) * 0.6)) { this.type[i] = T.ROCK; this.elev[i] = 2; this.scrap[i] = 0; break; }
    }
    // The lie of the land: a smooth height for every square, so water can run downhill and plants can
    // tell a sunny slope from a shaded one. Plateaus and mountains stand high, river valleys and lake
    // basins sink low, and gentle rolls run between (symmetric noise, so twins match).
    {
      const H = this.height;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = this.idx(x, y), e = this.elev[i];
        let h = sn(x, y, 70, 41) * 1.4 + sn(x, y, 26, 42) * 0.4 + (e === 2 ? 2.6 : e === 1 ? 1.3 : 0) + (this.type[i] === T.ROCK ? 1.5 : 0);
        h -= 1.8 * Math.exp(-riverD(x, y) / 10); // the river's valley
        for (const lk of lakes) { const d = Math.hypot(x - lk[0], y - lk[1]) / lk[2]; if (d < 2) h -= 1.6 * (1 - d / 2) ** 1.5; } // lake basins
        for (const [px, py, pr] of ponds) { const d = Math.hypot(x - px, y - py) / pr; if (d < 2.5) h -= 0.8 * (1 - d / 2.5); }
        H[i] = h;
      }
      for (let pass = 0; pass < 2; pass++) { const c = H.slice(); for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = this.idx(x, y); if (this.elev[i]) continue; let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += c[i + dy * N + dx]; H[i] = s / 9; } } // soften the low ground (cliff edges stay sharp)
    }
    // Dams close a lake's outlet. Each lake gets one where it faces the middle: its outflow runs along
    // one side of the grid (so the dam, drawn four ways, always faces along it), a narrow channel joins
    // the lake to the dam, and a stream runs on below it down the valley. All of it is real ground that
    // villages and roads must respect, and it's laid for a whole symmetric set of lakes at once (twins
    // get matching dams, or none), so mirrored roads stay right.
    const damAt: { lakeNo: number; dx: number; dy: number; ux: number; uy: number }[] = [];
    const setSize = orbit([0, 0]).length, turnDir = (ux: number, uy: number, o: number): [number, number] => (four ? (o === 0 ? [ux, uy] : o === 1 ? [-uy, ux] : o === 2 ? [-ux, -uy] : [uy, -ux]) : o === 0 ? [ux, uy] : [-ux, -uy]);
    const M2 = (p: P, o: number) => orbit(p)[o]; // the same transform for points and squares
    // can a square take this, on every twin? (built ground, rock, a rise, water or a crossing: no)
    // (asked of the same squares thousands of times while the streams are routed, so each answer is kept until the map next changes)
    const freeMemo = [new Int8Array(N * N), new Int8Array(N * N)];
    const freeAll = (x: number, y: number, water = false) => { if (!this.inside(x, y)) return false; const m = freeMemo[+water], i = this.idx(x, y); if (!m[i]) m[i] = freeCheck(x, y, water) ? 1 : -1; return m[i] > 0; };
    const freeCheck = (x: number, y: number, water: boolean) => orbit([x, y]).every(([a, b]) => { if (!this.inside(a, b)) return false; const ii = this.idx(a, b), w = this.type[ii]; return !this.occupied[ii] && w !== T.ROCK && (water || w !== T.WATER) && w !== T.BRIDGE && w !== T.FORD && this.elev[ii] === 0 && dBase(a, b) > 20; });
    // a whole candidate for the first lake of a set, or null: dam, channel back to the lake, stream on below
    const plan = (lk: number[], ux: number, uy: number, s2: number) => {
      const sr = shoreR(lk, Math.atan2(uy, ux)), dx = Math.round(lk[0] + ux * (sr + s2)), dy = Math.round(lk[1] + uy * (sr + s2));
      for (const [x, y] of [[dx - 1, dy - 1], [dx, dy - 1], [dx - 1, dy], [dx, dy]]) if (!freeAll(x, y)) return null;
      const ch = { ax: lk[0] + ux * (sr - 2.5), ay: lk[1] + uy * (sr - 2.5), bx: dx - 0.5 - ux * 1.1, by: dy - 0.5 - uy * 1.1 }; // ends against the dam's upstream face
      for (let y = Math.floor(Math.min(ch.ay, ch.by) - 3); y <= Math.max(ch.ay, ch.by) + 3; y++) for (let x = Math.floor(Math.min(ch.ax, ch.bx) - 3); x <= Math.max(ch.ax, ch.bx) + 3; x++) if (this.inside(x, y) && this.inChannel(ch, x, y, 0) > 0 && !freeAll(x, y, true)) return null; // a channel only through open ground
      const flow = this.flowFrom(lk, dx, dy, ux, uy, freeAll); // the stream: downhill to other water
      return flow ? { dx, dy, ch, pts: flow.pts, scells: flow.cells } : null;
    };
    const planAt = (lk: number[], ux: number, uy: number, s2: number) => {
      const sr = shoreR(lk, Math.atan2(uy, ux)), key = `${ux},${uy},${Math.round(lk[0] + ux * (sr + s2))},${Math.round(lk[1] + uy * (sr + s2))}`;
      if (!plans.has(key)) plans.set(key, plan(lk, ux, uy, s2));
      return plans.get(key)!;
    };
    const plans = new Map<string, ReturnType<typeof plan>>(); // (a plan depends only on where its dam lands: nearby tries often land on the same square)
    for (let k0 = 0; k0 + setSize <= this.lakes.length; k0 += setSize) {
      freeMemo[0].fill(0); freeMemo[1].fill(0); plans.clear(); // (the last set's dams changed the ground)
      const lk = this.lakes[k0], a0 = Math.atan2(C[1] - lk[1], C[0] - lk[0]) / (Math.PI / 2), q0 = Math.round(a0), q1 = a0 > q0 ? q0 + 1 : q0 - 1;
      // every side is tried; the outlet whose stream runs most downhill wins (the side facing the middle breaks ties)
      let best: ReturnType<typeof plan> = null, ux = 0, uy = 0, bs = 1e9;
      [q0, q1, q0 + 2, q1 + 2].forEach((q, rank) => {
        const vx = Math.round(Math.cos(q * Math.PI / 2)), vy = Math.round(Math.sin(q * Math.PI / 2));
        const bendsOf = (q: NonNullable<ReturnType<typeof plan>>) => { let b2 = 0; const P2 = q.pts; for (let k = 2; k < P2.length - 2; k++) { const ax = P2[k][0] - P2[k - 2][0], ay = P2[k][1] - P2[k - 2][1], bx = P2[k + 2][0] - P2[k][0], by = P2[k + 2][1] - P2[k][1]; if ((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1) < 0.5) b2++; } return b2; };
        let c: ReturnType<typeof plan> = null, s2 = 2.5; for (; s2 < 9 && !c; s2 += 0.5) c = planAt(lk, vx, vy, s2);
        for (let tries = 0; c && bendsOf(c) && tries < 3 && s2 < 11; tries++, s2 += 1.5) { const c2 = planAt(lk, vx, vy, s2); if (c2 && !bendsOf(c2)) c = c2; } // a bend after the dam? try it a little further out
        if (!c) return;
        let bends = 0; const P2 = c.pts; for (let k = 2; k < P2.length - 2; k++) { const ax = P2[k][0] - P2[k - 2][0], ay = P2[k][1] - P2[k - 2][1], bx = P2[k + 2][0] - P2[k][0], by = P2[k + 2][1] - P2[k][1]; if ((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1) < 0.5) bends++; } // sharp bends count against it
        let lo = 1e9, climb = 0; for (const [x, y] of c.pts) { const h = this.height[this.idx(Math.round(x), Math.round(y))]; climb += Math.max(0, h - lo); lo = Math.min(lo, h); }
        const score = climb * 10 + bends * 50 + rank * 0.8 + c.pts.length * 0.01;
        if (score < bs) { bs = score; best = c; ux = vx; uy = vy; }
      });
      if (!best) continue;
      { // what rise is left, the stream wears down: its bed (and a little either side) never stands above the water upstream (on every twin, rounded each twin's own way)
        let lo = 1e9; for (const [x, y] of (best as NonNullable<ReturnType<typeof plan>>).pts) { const cells = orbit([x, y]).flatMap(([a, b]) => orbit([Math.round(a), Math.round(b)])); for (const [a, b] of cells) { const i = this.idx(a, b); lo = Math.min(lo, this.height[i]); } for (const [a, b] of cells) for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) if (this.inside(a + ex, b + ey)) { const i = this.idx(a + ex, b + ey); if (this.height[i] > lo) this.height[i] = ex || ey ? (this.height[i] + lo) / 2 : lo; } }
      }
      // laid once, then copied exactly onto every twin (computing each twin on its own drifts by a square through rounding)
      const { dx, dy, ch, pts, scells } = best;
      for (let o = 0; o < setSize; o++) {
        const lakeNo = k0 + o, [vx, vy] = turnDir(ux, uy, o), [a1, b1] = M2([ch.ax, ch.ay], o), [c1, d1] = M2([ch.bx, ch.by], o);
        const chO = { lake: lakeNo, ax: a1, ay: b1, bx: c1, by: d1 };
        this.channels.push(chO);
        for (let y = Math.floor(Math.min(chO.ay, chO.by) - 3); y <= Math.max(chO.ay, chO.by) + 3; y++) for (let x = Math.floor(Math.min(chO.ax, chO.bx) - 3); x <= Math.max(chO.ax, chO.bx) + 3; x++) if (this.inside(x, y) && this.inChannel(chO, x, y, 0) > 0) { const ii = this.idx(x, y); this.type[ii] = T.WATER; this.elev[ii] = 0; this.forest[ii] = 0; this.scrap[ii] = 0; }
        const foot = [[dx - 1, dy - 1], [dx, dy - 1], [dx - 1, dy], [dx, dy]].map((c) => M2(c as P, o));
        for (const [x, y] of foot) { const ii = this.idx(x, y); this.type[ii] = T.DIRT; this.elev[ii] = 0; this.occupied[ii] = 1; this.forest[ii] = 0; }
        const cells: number[] = [];
        for (const c of scells) { const [x, y] = M2(c, o), ii = this.idx(x, y), w = this.type[ii]; if (w !== T.FORD && w !== T.BRIDGE) { this.streamUnder.set(ii, w); this.type[ii] = T.FORD; this.forest[ii] = 0; this.scrap[ii] = 0; cells.push(ii); } }
        this.streams.push({ lake: lakeNo, pts: pts.map((p) => M2(p, o)), cells });
        const fx = Math.min(...foot.map((c) => c[0])), fy = Math.min(...foot.map((c) => c[1]));
        damAt.push({ lakeNo, dx: fx + 1, dy: fy + 1, ux: vx, uy: vy });
      }
    }
    flowTables = null; // (tens of MB, no longer needed)
    this.layoutSettlements(R, bridges, fords, C, riverD, RING);
    { // no stray specks of water: a pool of fewer than nine squares (a leftover of the shapes above) becomes grass
      const seen = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) {
        if (seen[i] || this.type[i] !== T.WATER) continue;
        const q = [i], comp: number[] = []; seen[i] = 1;
        while (q.length) { const c = q.pop()!; comp.push(c); const x = c % N, y = (c / N) | 0; for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ddx, ny = y + ddy; if (!this.inside(nx, ny)) continue; const jj = this.idx(nx, ny); if (!seen[jj] && this.type[jj] === T.WATER) { seen[jj] = 1; q.push(jj); } } }
        if (comp.length < 9) for (const c of comp) this.type[c] = T.GRASS;
      }
    }
    // a dam on each lake, on the side facing the middle, holding back a valley that floods if it goes
    this.dams = [];
    for (const { lakeNo, dx, dy, ux, uy } of damAt) {
      const lk = this.lakes[lakeNo], fx = dx - 1, fy = dy - 1;
      const zone: number[] = [], seen = new Set<number>();
      const course: P[] = [...(this.streams.find((st) => st.lake === lakeNo)?.pts ?? [])]; // the flood runs down the stream's own course, then on straight past its end
      if (!course.length) course.push([dx - 0.5 + ux * 1.5, dy - 0.5 + uy * 1.5]);
      while (course.length < 54) { const [lx, ly] = course[course.length - 1]; course.push([lx + ux * 0.5, ly + uy * 0.5]); }
      for (let k = 0; k < course.length; k++) {
        const s = 1.5 + k * 0.5, w = 2.4 + s * 0.13 + Math.sin(s * 0.7 + lk[4]) * 0.8, [cx, cy] = course[k];
        for (let o = -w; o <= w; o += 0.5) {
          const x = Math.round(cx - uy * o), y = Math.round(cy + ux * o); if (!this.inside(x, y)) continue;
          const i = this.idx(x, y); if (seen.has(i)) continue; seen.add(i);
          const t = this.type[i];
          if (this.occupied[i] || t === T.WATER || t === T.ROCK || t === T.BRIDGE || (t === T.FORD && !this.streamUnder.has(i)) || dBase(x, y) < 22 || this.nearVillage(x, y, 8)) continue; // (the dam's own stream floods with the rest of its valley)
          if (this.sites.some((st) => x >= st.cx - 2 && x < st.cx + st.w + 2 && y >= st.cy - 2 && y < st.cy + st.h + 2)) continue;
          zone.push(i);
        }
      }
      { const inZone = new Set(zone); for (const i of this.streams.find((st) => st.lake === lakeNo)?.cells ?? []) if (!inZone.has(i) && !this.occupied[i]) zone.push(i); } // the stream swells along its own channel even where the flood spares the land (by a village)
      const along = (i: number) => ((i % N) - dx) * ux + (((i / N) | 0) - dy) * uy; // how far down the valley
      zone.sort((p, q) => along(p) - along(q));
      if (zone.length > 20) this.dams.push({ lake: lakeNo, x: fx, y: fy, zone, face: Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 0 : 2) : uy > 0 ? 1 : 3, ux, uy });
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!this.inside(x, y)) { const i = this.idx(x, y); this.type[i] = T.GRASS; this.elev[i] = 0; this.scrap[i] = 0; } // off the map: bare (shapes above ran on past the edge)
    // forests
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (this.edge(x, y) < 0.5) continue; // none off the map
      const i = this.idx(x, y);
      if (this.type[i] !== T.GRASS || this.elev[i] === 1 || dBase(x, y) < 16 || this.nearVillage(x, y, 9) || this.sites.some((s) => x >= s.cx - 2 && x < s.cx + s.w + 2 && y >= s.cy - 2 && y < s.cy + s.h + 2) || this.dams.some((d) => x >= d.x - 2 && x < d.x + 4 && y >= d.y - 2 && y < d.y + 4)) continue; // (a clearing round each dam: it has a way in)
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = this.type[this.idx(x + dx, y + dy)]; return t === T.WATER || t === T.BRIDGE || t === T.FORD; });
      if (near) continue;
      const Hh = this.height, hx = (Hh[i + 1] - Hh[i - 1]) / 2, hy = (Hh[i + N] - Hh[i - N]) / 2;
      const sun = Math.max(-1, Math.min(1, -(hx * YS + hy * YC) * 6)); // +1 on a slope facing south (down the screen, into the sun), -1 facing north
      const dense = sn(x, y, 12, 9) + sun * 0.09; // so woods grow thicker on sunny slopes and thin out on shaded ones
      if (dense > 0.67 || ch(x, y, 4) < 0.01 * (1 + sun)) {
        const count = dense > 0.76 ? 3 : dense > 0.67 ? 2 : 1;
        this.forest[i] = count;
        for (let k = 0; k < count; k++)
          this.trees.push([x * CELL + 4 + hash3(x, 10 + k, y) * 16, y * CELL + 5 + ((k + hash3(x, 20 + k, y)) / count) * 15]);
      }
    }
  }

  hideOil() {
    // in symmetric sets, so every side has the same luck
    for (let k = 0; k < 3000 && this.oil.length < (this.players > 2 ? 24 : 16); k++) {
      const cx = 4 + Math.floor(Math.random() * (N - 8)), cy = 4 + Math.floor(Math.random() * (N - 8)), set = this.orbit([cx, cy]);
      if (this.edge(cx, cy) < 4) continue;
      if (Math.min(...this.bases.map(([bx, by]) => Math.hypot(cx - bx, cy - by))) < 14) continue;
      let ok = true;
      for (const [ox, oy] of set) for (let y = oy - 1; y <= oy + 1; y++) for (let x = ox - 1; x <= ox + 1; x++) { if (!this.inside(x, y)) { ok = false; continue; } const i = this.idx(x, y), t = this.type[i]; if ((t !== T.GRASS && t !== T.DIRT) || this.occupied[i] || this.forest[i] || this.elev[i] !== this.elev[this.idx(ox, oy)] || this.elev[i] === 1) ok = false; } // (all one height: a Derrick must fit on it)
      if (!ok || set.some(([a, b], i) => set.some(([c, d], j) => i < j && Math.hypot(a - c, b - d) < 16)) || set.some(([a, b]) => this.oil.some((o) => Math.hypot(o.cx - a, o.cy - b) < 18))) continue;
      const big = Math.random() < 0.35;
      for (const [a, b] of set) this.oil.push({ cx: a, cy: b, big, found: false, tapped: false });
    }
  }

  // A glossy black pool where oil came up: dark pixels with a few bright sky reflections.
  oilPool(cx: number, cy: number, big: boolean) {
    const r = big ? 15 : 10, ox = (cx + 0.5) * CELL, oy = (cy + 0.5) * CELL;
    for (let gy = oy - r - 3; gy <= oy + r + 3; gy++) for (let gx = ox - r - 3; gx <= ox + r + 3; gx++) {
      const d = Math.hypot(gx - ox, (gy - oy) * 1.2) + (vnoise(gx, gy, 5, 71) - 0.5) * 6;
      if (d > r + 2) continue;
      const [sx, sy] = toScreen(gx, gy), px = Math.round(sx), py = Math.round(sy - this.lift(gx, gy));
      const c = d > r ? '#3a3226' : hash3(gx, 2, gy) < 0.04 ? '#6a7a86' : d < r * 0.5 && hash3(gx, 3, gy) < 0.08 ? '#2e3438' : '#141210';
      this.stamp(px, py, (ctx, x, y) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); });
    }
  }

  nearVillage(x: number, y: number, r: number) { return this.villages.some(([vx, vy]) => Math.hypot(x - vx, y - vy) < r); }

  // Roads, villages with fields, and the capturable sites. Deterministic, so workers agree.
  layoutSettlements(R: () => number, bridges: number[], fords: P[], C: P, riverD: (x: number, y: number) => number, RING: number) {
    const wet = (t: number) => t === T.WATER || t === T.BRIDGE || t === T.FORD, orbit = this.orbit;
    const r = (a: number, b: number) => a + R() * (b - a), b0 = this.bases[0];
    const pick = (m: number): P => { for (;;) { const x = r(0, N), y = r(0, N); if (this.edge(x, y) >= m) return [x, y]; } }; // a random spot at least m squares in from the edge
    const dBase = (x: number, y: number) => Math.min(...this.bases.map(([bx, by]) => Math.hypot(x - bx, y - by)));
    const free = (cx: number, cy: number, w: number, h: number) => {
      for (let y = cy - 1; y <= cy + h; y++) for (let x = cx - 1; x <= cx + w; x++) {
        if (!this.inside(x, y)) return false;
        const i = this.idx(x, y), t = this.type[i];
        if (this.occupied[i] || (y >= cy && y < cy + h && x >= cx && x < cx + w && (t !== T.GRASS && t !== T.DIRT || this.elev[i] !== 0))) return false;
        if (t === T.ROAD && y >= cy && y < cy + h && x >= cx && x < cx + w) return false;
      }
      return true;
    };
    const claim = (kind: string, x: number, y: number, w: number, h: number) => {
      this.sites.push({ kind, cx: x, cy: y, w, h });
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.occupied[this.idx(xx, yy)] = 1;
    };
    // place a site and its symmetric twins together, on the nearest spot where all of them fit
    // (each copy keeps its own footprint the same way round, so the art matches)
    const copies = (x: number, y: number, w: number, h: number): P[] => orbit([x, y]).map((_, o) => { const c = [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]].map((p) => orbit(p as P)[o]); return [Math.min(...c.map((q) => q[0])), Math.min(...c.map((q) => q[1]))] as P; });
    const pair = (kind: string, cx: number, cy: number, w: number, h: number) => {
      for (let rr = 0; rr < 9; rr++) for (let a = 0; a < 16; a++) {
        const x = Math.round(cx + Math.cos((a / 16) * Math.PI * 2) * rr), y = Math.round(cy + Math.sin((a / 16) * Math.PI * 2) * rr), set = copies(x, y, w, h);
        if (set.some(([a1, b1], i) => set.some(([a2, b2], j) => i < j && Math.abs(a1 - a2) < w + 2 && Math.abs(b1 - b2) < h + 2))) continue;
        if (!set.every(([sx, sy]) => free(sx, sy, w, h))) continue;
        for (const [sx, sy] of set) claim(kind, sx, sy, w, h);
        return true;
      }
      return false;
    };
    // the flank compounds, first, so towns and roads keep clear of them: a fuel depot, a repair yard and a power
    // plant in a line along the flank, halfway between neighbouring bases (so each is as far from both). Laid for
    // the first flank on the nearest dry level spot along its line where all three fit, then copied to its twins.
    const keep: [number, number, number, number][] = []; // each compound's ground (x0, y0, x1, y1), which roads go round
    if (!FRONT) { // (FRONT LINE has no flanks)
      const [f0x, f0y] = this.flanks[0], fd = Math.atan2(f0y - C[1], f0x - C[0]), ux = Math.cos(fd), uy = Math.sin(fd);
      const parts: [string, number, number, number][] = [['repairYard', -5, 2, 2], ['fuelDepot', 0, 2, 2], ['powerPlant', 5.5, 3, 2]]; // kind, how far out along the line, footprint
      const lay = (d: number, l: number) => parts.map(([kind, o, w, h]) => { const x = C[0] + ux * (d + o) - uy * l, y = C[1] + uy * (d + o) + ux * l; return { kind, w, h, x: Math.round(x - w / 2 + 0.5), y: Math.round(y - h / 2 + 0.5) }; });
      let best: ReturnType<typeof lay> | null = null; const before = this.sites.length, aim = this.flanks;
      const off = (plan: ReturnType<typeof lay>) => { const x0 = Math.min(...plan.map((b) => b.x)), y0 = Math.min(...plan.map((b) => b.y)), x1 = Math.max(...plan.map((b) => b.x + b.w)), y1 = Math.max(...plan.map((b) => b.y + b.h)), d = this.bases.map(([bx, by]) => Math.hypot(bx - (x0 + x1 - 1) / 2, by - (y0 + y1 - 1) / 2)).sort((p, q) => p - q); return d[1] - d[0]; }; // how much nearer one base it is (squares going astray in the rounding)
      for (const f of [0.28, 0.3, 0.26, 0.32, 0.24, 0.34, 0.22, 0.36]) for (const l of [0, 0.5, -0.5, 1, -1]) {
        if (best && off(best) < 1.2) break;
        const plan = lay(PLAY * f, l);
        if (plan.every((b) => copies(b.x, b.y, b.w, b.h).every(([sx, sy]) => free(sx, sy, b.w, b.h))) && (!best || off(plan) < off(best))) best = plan;
      }
      if (best) for (const b of best) for (const [sx, sy] of copies(b.x, b.y, b.w, b.h)) claim(b.kind, sx, sy, b.w, b.h);
      else for (const b of lay(PLAY * 0.28, 0)) pair(b.kind, b.x, b.y, b.w, b.h); // (nowhere it all fits: each finds its own spot nearby)
      const mine = this.sites.slice(before), nearest = (b: { cx: number; cy: number }) => aim.map(([x, y], o) => [Math.hypot(b.cx - x, b.cy - y), o]).sort((p, q) => p[0] - q[0])[0][1]; // this compound's buildings, every twin
      this.flanks = aim.map((_, o) => { const bs = mine.filter((b) => nearest(b) === o); const x0 = Math.min(...bs.map((b) => b.cx)), y0 = Math.min(...bs.map((b) => b.cy)), x1 = Math.max(...bs.map((b) => b.cx + b.w)), y1 = Math.max(...bs.map((b) => b.cy + b.h)); keep.push([x0, y0, x1, y1]); return [(x0 + x1 - 1) / 2, (y0 + y1 - 1) / 2] as P; });
    }
    const nearKeep = (x: number, y: number, m: number) => keep.some(([x0, y0, x1, y1]) => x > x0 - 1 - m && x < x1 + m && y > y0 - 1 - m && y < y1 + m);
    // villages in symmetric sets, on dry open ground, in a loose ring round the middle
    const vs: P[] = [];
    for (let k = 0; k < 600 && vs.length < 4; k++) {
      const [x0, y0] = pick(12), x = Math.round(x0), y = Math.round(y0), t = this.type[this.idx(x, y)];
      const set = orbit([x, y]);
      if (Math.abs(Math.hypot(x - C[0], y - C[1]) - RING) > PLAY * 0.08 || dBase(x, y) < 28 || this.flanks.some(([fx, fy]) => Math.hypot(x - fx, y - fy) < 24) || t === T.WATER || t === T.ROCK || t === T.SCRAP || riverD(x, y) < 8 || set.some(([a, b], i) => i > 0 && Math.hypot(a - x, b - y) < 30)) continue;
      if (vs.flatMap((v) => orbit(v)).some(([vx, vy]) => set.some(([a, b]) => Math.hypot(vx - a, vy - b) < 26))) continue;
      vs.push([x, y]);
    }
    this.villages = vs.flatMap((v) => orbit(v));
    // Roads belong to the towns, not the armies. One main road loops round the map through the towns,
    // crossing rivers only at bridges or fords, and keeps well clear of every base and of the citadel.
    // It passes each town by: a short side street turns off it into the town, where one street runs
    // past the hall with houses along it.
    // Worked out for one of each symmetric set, then copied exactly to its twins.
    const s = orbit([0, 0]).length, lines: P[][] = [];
    const segD = (x: number, y: number, a: P, b: P) => lineDist(x, y, [a, b])[0];
    const cut = (a: P, b: P, c: P, d: P) => { const o = (p: P, q: P, w: P) => Math.sign((q[0] - p[0]) * (w[1] - p[1]) - (q[1] - p[1]) * (w[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
    const isl = this.island, at = (a: number, d: number): P => [C[0] + Math.cos(a) * d, C[1] + Math.sin(a) * d];
    // the network's points, in symmetric sets: point (k, o) is copy o of set k
    const sets: { p: P; need: boolean }[] = [], decks: (P | null)[] = [], forced: [number, number][] = [];
    const id = (k: number, o: number) => k * s + o, pt = (n: number) => orbit(sets[(n / s) | 0].p)[n % s], turn = (n: number, g: number) => id((n / s) | 0, ((n % s) + g) % s);
    for (const v of vs) sets.push({ p: v, need: true });
    vs.forEach(() => decks.push(null));
    if (bridges.length) { // a bridge: a road onto each end of its deck (one bridge; its mirror is the other)
      const bx = bridges[0], rows: number[] = [];
      for (let y = 0; y < N; y++) if (this.type[this.idx(bx, y)] === T.BRIDGE) rows.push(y);
      if (rows.length) {
        const x = bx + 0.5, y0 = rows[0], y1 = rows[rows.length - 1], kt = sets.length;
        sets.push({ p: [x, y0 - 6], need: true }, { p: [x, y1 + 6], need: true }); decks.push([x, y0], [x, y1]);
        forced.push([kt, kt + 1]);
      }
    }
    for (let k = 0; k < fords.length; k += s) { // a ford: the road runs straight through, if the loop uses it
      const f = fords[k], rv = this.rivers.slice().sort((a, b) => lineDist(f[0], f[1], a)[0] - lineDist(f[0], f[1], b)[0])[0];
      let seg = [0, 1] as [number, number], best = 1e9;
      for (let q = 0; q < rv.length - 1; q++) { const d = lineDist(f[0], f[1], [rv[q], rv[q + 1]])[0]; if (d < best) { best = d; seg = [rv[q + 1][0] - rv[q][0], rv[q + 1][1] - rv[q][1]]; } }
      const L = Math.hypot(seg[0], seg[1]) || 1, px = -seg[1] / L, py = seg[0] / L, A: P = [f[0] - px * 7, f[1] - py * 7], B: P = [f[0] + px * 7, f[1] + py * 7], ka = sets.length;
      sets.push({ p: A, need: false }, { p: B, need: false }); decks.push(f, f);
      forced.push([ka, ka + 1]);
    }
    for (const g of this.gates.slice(0, this.gates.length / s)) lines.push([at(g, isl - 2), at(g, 3.6)]); // the citadel's own drives: in from each gate to a ring round the uplink (the first side's gates; the copies follow)
    lines.push(Array.from({ length: 17 }, (_, k) => at((k / 16) * Math.PI * 2, 3.6))); // the ring
    const n = sets.length * s;
    const adj = Array.from({ length: n }, () => new Set<number>());
    const link = (a: number, b: number) => { adj[a].add(b); adj[b].add(a); };
    for (const [a, b] of forced) for (let o = 0; o < s; o++) link(id(a, o), id(b, o));
    // the main road: one loop round the map, town to town in turn round the middle (civilians have no
    // business in the citadel). Where the next town is across a river, it goes by the handiest crossing.
    const clear = (A: P, B: P) => !this.rivers.some((rv) => rv.some((p, q) => q > 0 && cut(A, B, rv[q - 1], p))) && segD(C[0], C[1], A, B) >= isl + 5;
    const add = (a: number, b: number) => { for (let g = 0; g < s; g++) link(turn(a, g), turn(b, g)); };
    // the rivers cut the land into parts (two halves, or four quarters): label each square with its part
    const part = new Int32Array(N * N).fill(-1), dryLand = (i: number) => { const q = this.type[i]; return q !== T.WATER && q !== T.BRIDGE && (q !== T.FORD || this.streamUnder.has(i)); };
    for (let i0 = 0, lab = 0; i0 < N * N; i0++) {
      if (part[i0] >= 0 || !dryLand(i0)) continue;
      const q = [i0]; part[i0] = lab;
      while (q.length) { const c = q.pop()!, x = c % N, y = (c / N) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (!this.inside(x + dx, y + dy)) continue; const j = this.idx(x + dx, y + dy); if (part[j] < 0 && dryLand(j)) { part[j] = lab; q.push(j); } } }
      lab++;
    }
    const partOf = (p: P) => { for (let r2 = 0; r2 < 4; r2++) for (let dy = -r2; dy <= r2; dy++) for (let dx = -r2; dx <= r2; dx++) { const x = Math.round(p[0]) + dx, y = Math.round(p[1]) + dy; if (this.inside(x, y) && part[this.idx(x, y)] >= 0) return part[this.idx(x, y)]; } return -1; };
    const home = partOf(vs[0] ?? C), here = vs.flatMap((_, k) => Array.from({ length: s }, (_, o) => id(k, o))).filter((i) => partOf(pt(i)) === home);
    const dist = (a: number, b: number) => { const A = pt(a), B = pt(b); return Math.hypot(B[0] - A[0], B[1] - A[1]) + (clear(A, B) ? 0 : 1000) + (this.bases.some((bp) => segD(bp[0], bp[1], A, B) < 24) ? 300 : 0) };
    // in this part, the loop runs from one crossing to the next through the towns, the shortest way; a town far off
    // that way is reached by a short spur instead. Every other part is a twin, so this one decides the whole loop.
    let way: { path: number[]; spurs: [number, number][]; cost: number } | null = null;
    const perms = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r2) => [x, ...r2])));
    forced.forEach(([ka, kb]) => {
      const ends = Array.from({ length: s }, (_, g) => [turn(id(ka, 0), g), turn(id(kb, 0), g)]).flat().filter((i) => partOf(pt(i)) === home);
      if (ends.length !== 2) return;
      const extra = sets[ka].need || !bridges.length ? 0 : 60; // a bridge is a proper road's crossing: a ford only if it's much handier
      for (let m = 1; m < 1 << here.length; m++) {
        const on = here.filter((_, i) => m & (1 << i)), off = here.filter((_, i) => !(m & (1 << i)));
        for (const order of perms(on)) {
          const path = [ends[0], ...order, ends[1]];
          let cost = extra; for (let i = 1; i < path.length; i++) cost += dist(path[i - 1], path[i]);
          const spurs: [number, number][] = off.map((t) => [t, order.slice().sort((p, q) => dist(t, p) - dist(t, q))[0]]);
          if (spurs.some(([, t]) => t === undefined)) continue;
          for (const [t, u] of spurs) cost += dist(t, u) * 1.2;
          if (!way || cost < way.cost) way = { path, spurs, cost };
        }
      }
    });
    // the roads as chains of points (towns, crossing banks): the loop through this part, and spurs off it
    const chains: { ids: number[]; spur: boolean }[] = [];
    if (way) { const { path, spurs } = way as { path: number[]; spurs: [number, number][] }; for (let i = 1; i < path.length; i++) add(path[i - 1], path[i]); chains.push({ ids: path, spur: false }); for (const [t, u] of spurs) { add(t, u); chains.push({ ids: [t, u], spur: true }); } }
    // a bridge the loop doesn't use still gets a road: on to the nearest town on its bank
    for (const [ka, kb] of forced) for (const k of [ka, kb]) {
      const i = id(k, 0); if (!sets[k].need || adj[i].size > 1) continue;
      const X = pt(i), t = vs.flatMap((_, k) => Array.from({ length: s }, (_, o) => id(k, o))).filter((j) => clear(X, pt(j))).sort((p, q) => Math.hypot(pt(p)[0] - X[0], pt(p)[1] - X[1]) - Math.hypot(pt(q)[0] - X[0], pt(q)[1] - X[1]))[0];
      if (t !== undefined) { add(i, t); chains.push({ ids: [i, t], spur: true }); }
    }
    // where each town meets the road: a junction a little way out, on the side its roads come from
    // (or beside it, if they pass on both sides), so the main road runs by the town, not through it
    const towns = vs.map((v, k) => {
      const nb = [...adj[id(k, 0)]].map(pt), us = nb.map(([x, y]) => { const L = Math.hypot(x - v[0], y - v[1]) || 1; return [(x - v[0]) / L, (y - v[1]) / L]; });
      let ux = us.reduce((t, u) => t + u[0], 0), uy = us.reduce((t, u) => t + u[1], 0), L = Math.hypot(ux, uy);
      if (!us.length) { ux = C[0] - v[0]; uy = C[1] - v[1]; L = Math.hypot(ux, uy); }
      else if (L < 0.6) { ux = -us[0][1]; uy = us[0][0]; L = 1; if (ux * (C[0] - v[0]) + uy * (C[1] - v[1]) < 0) { ux = -ux; uy = -uy; } }
      ux /= L; uy /= L;
      return { v, ux, uy, j: [v[0] + ux * 8, v[1] + uy * 8] as P, linked: us.length > 0 };
    });
    const end = (i: number): P => { const k = (i / s) | 0; return k < vs.length ? orbit(towns[k].j)[i % s] : pt(i); };
    const deck = (i: number): P | null => { const d = decks[(i / s) | 0]; return d ? orbit(d)[i % s] : null; };
    // a gentle wander between two points: a few nudges either side of the straight line, rounded off later
    const wander = (A: P, B: P): P[] => { const L = Math.hypot(B[0] - A[0], B[1] - A[1]), nx = -(B[1] - A[1]) / (L || 1), ny = (B[0] - A[0]) / (L || 1), out: P[] = []; const k = Math.max(1, Math.round(L / 14)); for (let q = 1; q < k + 1; q++) { const f = q / (k + 1), o = r(-1, 1) * Math.min(5, L * 0.06); out.push([A[0] + (B[0] - A[0]) * f + nx * o, A[1] + (B[1] - A[1]) * f + ny * o]); } return out; };
    const curvy: { li: number; spur: boolean }[] = [];
    for (const { ids, spur } of chains) { // onto a crossing it runs straight off the deck's end, so the curve eases into it
      const line: P[] = [], d0 = deck(ids[0]), d1 = deck(ids[ids.length - 1]);
      if (d0) line.push(d0);
      line.push(end(ids[0]));
      for (let i = 1; i < ids.length; i++) line.push(...wander(end(ids[i - 1]), end(ids[i])), end(ids[i]));
      if (d1) line.push(d1);
      curvy.push({ li: lines.length, spur }); lines.push(line);
    }
    const sideStreets: number[] = [];
    for (const { v, ux, uy, j, linked } of towns) { // the town's own streets: in from the junction, then one across in front of the hall
      const P0: P = [v[0] + ux * 2.5, v[1] + uy * 2.5];
      if (linked) { sideStreets.push(lines.length); lines.push([j, P0]); }
      lines.push([[P0[0] - uy * 6, P0[1] + ux * 6], P0, [P0[0] + uy * 6, P0[1] - ux * 6]]);
    }
    // tracks never run through water (nor through a base): a stretch that would is re-laid on the ground round it (hugging
    // the shore), crossing rivers only where there's a ford, a bridge or a citadel gate
    const wetAt = (x: number, y: number) => { const cx = Math.round(x), cy = Math.round(y); if (!this.inside(cx, cy)) return true; const q = this.type[this.idx(cx, cy)]; return q === T.WATER; };
    const near = (x: number, y: number) => wetAt(x, y) || wetAt(x + 1, y) || wetAt(x - 1, y) || wetAt(x, y + 1) || wetAt(x, y - 1) || stream(x, y) || dBase(x, y) < 20 || nearKeep(x, y, 5); // a track is about a square wide (and only fords a stream on purpose), and keeps out of the bases
    const crossing = (x: number, y: number) => { const cx = Math.round(x), cy = Math.round(y); if (!this.inside(cx, cy)) return false; const i = this.idx(cx, cy), q = this.type[i]; return (q === T.FORD && !this.streamUnder.has(i)) || q === T.BRIDGE; };
    // the stream a point touches (any stream square within three quarters of a square), or -1: by distance, not rounding, so twins agree
    const streamAt = (x: number, y: number) => { for (let cy = Math.floor(y); cy <= Math.floor(y) + 1; cy++) for (let cx = Math.floor(x); cx <= Math.floor(x) + 1; cx++) if (this.inside(cx, cy) && Math.hypot(cx - x, cy - y) <= 0.75 && this.streamUnder.has(this.idx(cx, cy))) { const i = this.idx(cx, cy); return this.streams.findIndex((q) => q.cells.includes(i)); } return -1; };
    const stream = (x: number, y: number) => streamAt(x, y) >= 0;
    const bank = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.inside(x + dx, y + dy) && this.streamUnder.has(this.idx(x + dx, y + dy))) return true; return false; };
    const clearSeg = (a: P, b: P, overStreams = false) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); for (let k = 0; k <= n; k++) { const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n; if (!crossing(x, y) && near(x, y) && !(overStreams && stream(x, y))) return false; } return true; };
    const dryNear = (p: P): P => { for (let r = 0; r < 30; r++) for (let a = 0; a < 16; a++) { const x = Math.round(p[0] + Math.cos((a / 16) * Math.PI * 2) * r), y = Math.round(p[1] + Math.sin((a / 16) * Math.PI * 2) * r); if (this.inside(x, y) && (crossing(x, y) || !near(x, y))) return [x, y]; } return p; };
    const around = (a: P, b: P): P[] | null => { // A* on the squares, water (with a square of bank) off limits except at crossings
      const s = this.idx(Math.round(a[0]), Math.round(a[1])), goal = this.idx(Math.round(b[0]), Math.round(b[1]));
      const g = new Map<number, number>([[s, 0]]), from = new Map<number, number>(), done = new Set<number>(), heap: number[] = [s], hf: number[] = [0];
      const push = (i: number, f: number) => { heap.push(i); hf.push(f); for (let k = heap.length - 1; k > 0;) { const q = (k - 1) >> 1; if (hf[q] <= hf[k]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; [hf[q], hf[k]] = [hf[k], hf[q]]; k = q; } };
      const pop = () => { const top = heap[0], li2 = heap.pop()!, lf = hf.pop()!; if (heap.length) { heap[0] = li2; hf[0] = lf; for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
      let n = 0;
      while (heap.length && n++ < 40000) {
        const cur = pop();
        if (cur === goal) break;
        if (done.has(cur)) continue; done.add(cur);
        const cx = cur % N, cy = (cur / N) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, y = cy + dy; if ((!dx && !dy) || !this.inside(x, y) || (!crossing(x, y) && !stream(x, y) && near(x, y))) continue;
          const ni = this.idx(x, y), ng = g.get(cur)! + (dx && dy ? 1.414 : 1) + (stream(x, y) ? 40 : bank(x, y) ? 6 : 0); // fording a stream costs: once, where it must (round its end if that is not far); its banks cost a little, so a road crosses rather than runs along it
          if (ng < (g.get(ni) ?? 1e9)) { g.set(ni, ng); from.set(ni, cur); push(ni, ng + Math.hypot(x - b[0], y - b[1])); }
        }
      }
      if (!from.has(goal)) return null;
      const cells: P[] = []; for (let c = goal; c !== s; c = from.get(c)!) cells.push([c % N, (c / N) | 0]);
      cells.reverse();
      const out: P[] = []; let at = a; // keep only the turns: from each point, the farthest square still in a clear line
      for (let k = 0; k < cells.length;) { let j = Math.min(cells.length - 1, k + 30); while (j > k && !clearSeg(at, cells[j])) j--; out.push(cells[j]); at = cells[j]; k = j + 1; }
      return out;
    };
    for (let li = 0; li < lines.length; li++) {
      const wetPt = (p: P) => !crossing(p[0], p[1]) && near(p[0], p[1]), line = lines[li].filter((p, k, l) => k === 0 || k === l.length - 1 || !wetPt(p)).map((p) => (wetPt(p) ? dryNear(p) : p)), out: P[] = [line[0]]; // no point of a track sits in the water (a bend that would is dropped; an end is moved to dry ground)
      for (let k = 1; k < line.length; k++) { const a = out[out.length - 1], b = line[k]; if (clearSeg(a, b)) { out.push(b); continue; } const r = around(a, b); if (r) out.push(...r); else out.push(b); }
      // a road fords a stream once: if its pieces would weave back and forth across one, it's laid again as a single route
      const fords = new Map<number, number>(); let inside = -1;
      for (let k = 1; k < out.length; k++) { const [ax, ay] = out[k - 1], [bx, by] = out[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3); for (let j = 0; j <= n; j++) { const st = streamAt(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n); if (st >= 0 && st !== inside) fords.set(st, (fords.get(st) ?? 0) + 1); inside = st; } }
      if ([...fords.values()].some((c) => c > 1)) { const r = around(out[0], out[out.length - 1]); if (r) { lines[li] = [out[0], ...r]; continue; } }
      lines[li] = out;
    }
    // main roads curve: every corner is rounded off, as wide as it can be without running into water or a
    // base (a corner by a lake gets a tighter bend). The run onto a crossing's deck stays straight, so the
    // curve meets it head on.
    const round = (l0: P[]): P[] => {
      const l = l0.filter((p, k) => k === 0 || k === l0.length - 1 || Math.hypot(p[0] - l0[k - 1][0], p[1] - l0[k - 1][1]) > 0.5), out: P[] = [l[0]]; let fixes = 0; // (crumbs from the detours dropped)
      for (let k = 1; k < l.length - 1; k++) { const [p, v, q] = [l[k - 1], l[k], l[k + 1]], c = ((v[0] - p[0]) * (q[0] - v[0]) + (v[1] - p[1]) * (q[1] - v[1])) / (Math.hypot(v[0] - p[0], v[1] - p[1]) * Math.hypot(q[0] - v[0], q[1] - v[1]) || 1); if (c < -0.5 && fixes++ < 40) { const r = clearSeg(p, q, true) ? [] : around(p, q)?.slice(0, -1); if (r) { l.splice(k, 1, ...r); k = Math.max(0, k - 2); } } } // and any doubling back (straight over a stream it was crossing anyway, or the short way round)
      for (let k = 1; k < l.length - 1; k++) {
        const v = l[k], p = l[k - 1], q = l[k + 1], la = Math.hypot(v[0] - p[0], v[1] - p[1]), lb = Math.hypot(q[0] - v[0], q[1] - v[1]);
        if (la < 1e-6 || lb < 1e-6) continue;
        const ca = ((v[0] - p[0]) * (q[0] - v[0]) + (v[1] - p[1]) * (q[1] - v[1])) / (la * lb); if (ca > 0.995) { out.push(v); continue; } // straight on
        const room = (len: number, i: number) => (i === 0 || i === l.length - 1 ? (crossing(l[i][0], l[i][1]) ? Math.max(len - 3, len / 2) : len) : len / 2); // shared with the next corner, or kept clear of a deck
        let d = Math.min(8, room(la, k - 1), room(lb, k + 1)), curve: P[] | null = null;
        for (; d > 0.1 && !curve; d /= 2) {
          const A: P = [v[0] - ((v[0] - p[0]) / la) * d, v[1] - ((v[1] - p[1]) / la) * d], B: P = [v[0] + ((q[0] - v[0]) / lb) * d, v[1] + ((q[1] - v[1]) / lb) * d], c: P[] = [];
          for (let j = 0; j <= 8; j++) { const t = j / 8, u = 1 - t; c.push([u * u * A[0] + 2 * u * t * v[0] + t * t * B[0], u * u * A[1] + 2 * u * t * v[1] + t * t * B[1]]); }
          if (c.every((pt2, j) => j === 0 || clearSeg(c[j - 1], pt2))) curve = c;
        }
        out.push(...(curve ?? [v]));
      }
      out.push(l[l.length - 1]);
      return out;
    };
    for (const { li } of curvy) lines[li] = round(lines[li]);
    // the rounded road no longer runs through the junctions exactly, so whatever turns off it is brought to meet it
    const meet = (p: P, ls: P[][]): P => { let best = p, bd = 1e9; for (const l of ls) for (let k = 1; k < l.length; k++) { const [ax, ay] = l[k - 1], dx = l[k][0] - ax, dy = l[k][1] - ay, t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1))), q: P = [ax + dx * t, ay + dy * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } } return best; };
    const twins = (ls: P[][]) => ls.flatMap((l) => orbit(l[0]).map((_, o) => l.map((p) => orbit(p)[o]))); // a road's twins count too: a town may sit on a twin of the road worked out here
    const loopLines = twins(curvy.filter((c) => !c.spur).map((c) => lines[c.li]));
    // (an end brought a long way may now cross water to get there: that piece is laid again round it)
    const mend = (l: P[]): P[] => { if (l.length < 2 || clearSeg(l[0], l[1])) return l; const r = around(l[0], l[1]); return r ? [l[0], ...r, ...l.slice(2)] : l; };
    // (and an end brought over leaves no kink: points just before it that would make a sharp corner are dropped)
    const ease = (l: P[]): P[] => { while (l.length > 2) { const p = l[l.length - 3], v = l[l.length - 2], q = l[l.length - 1], ax = v[0] - p[0], ay = v[1] - p[1], bx = q[0] - v[0], by = q[1] - v[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (la > 0.05 && lb > 0.05 && (ax * bx + ay * by) / (la * lb) >= Math.cos((45 * Math.PI) / 180)) break; l.splice(l.length - 2, 1); } return l; };
    for (const { li, spur } of curvy) if (spur && loopLines.length) { const l = lines[li]; l[l.length - 1] = meet(l[l.length - 1], loopLines); lines[li] = mend(ease(l).reverse()).reverse(); }
    for (const li of sideStreets) { lines[li][0] = meet(lines[li][0], twins(curvy.map((c) => lines[c.li]))); lines[li] = mend(ease(lines[li].reverse()).reverse()); }
    lines.forEach((l, li) => { if (!curvy.some((c) => c.li === li)) lines[li] = round(l); }); // a town street that had to go round water bends too
    const tidy = (l: P[]): P[] => { const o: P[] = [l[0]]; for (let k = 1; k < l.length; k++) { const p = o[o.length - 1], q = o[o.length - 2], dx = l[k][0] - p[0], dy = l[k][1] - p[1]; if (q && k < l.length - 1 && Math.hypot(dx, dy) < 0.5 && dx * (p[0] - q[0]) + dy * (p[1] - q[1]) < 0) continue; o.push(l[k]); } return o; }; // a short step back (a crumb a cramped bend leaves) reads as a hairpin: dropped
    this.roadLines = lines.map(tidy).flatMap((l) => orbit(l[0]).map((_, o) => l.map((p) => orbit(p)[o])));
    const roadDist = segIndex(this.roadLines, 4, 4); // (only nearer than 3 matters)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y);
      const d = roadDist(x, y);
      if (d < 3 && !wet(this.type[i])) this.elev[i] = 0;          // roads run on level ground (and cut passes through ridges)
      if (d < 1.1 && !wet(this.type[i])) { this.type[i] = T.ROAD; this.scrap[i] = 0; }
      if ((this.nearVillage(x, y, 7) || dBase(x, y) < 9) && !wet(this.type[i])) { // villages and bases sit on clear level ground
        this.elev[i] = 0;
        if (this.type[i] !== T.ROAD && this.type[i] !== T.SCRAP) this.type[i] = dBase(x, y) < 7 ? T.DIRT : T.GRASS;
      }
    }
    const homes = ['cottage', 'cottage2', 'townhouse', 'cottage', 'shop', 'barn', 'townhouse', 'cottage2'];
    vs.forEach(([vx, vy], v) => { // every town has a hall in the middle: hold it and the town trades with you
      pair('townHall', vx - 1, vy - 1, 2, 2);
    });
    vs.forEach(([vx, vy], v) => {
      // houses face the street, on both sides of it, the hall's side a little further along; the water tower at its end
      const { ux, uy } = towns[v], P0: P = [vx + ux * 2.5, vy + uy * 2.5];
      const slots: [number, number][] = [[1, -2.5], [1, 2.5], [-1, -3.5], [-1, 3.5], [1, -4.5], [1, 4.5], [-1, -5.5], [-1, 5.5]];
      slots.forEach(([side, along], k) => {
        const kind = homes[(k + v * 3) % homes.length], w = kind === 'barn' || kind === 'townhouse' ? 2 : 1;
        pair(kind, Math.round(P0[0] + ux * side * 2.4 - uy * along - (w - 1) / 2), Math.round(P0[1] + uy * side * 2.4 + ux * along), w, 1);
      });
      pair('waterTower', Math.round(P0[0] - ux * 2.4 + uy * 7.5), Math.round(P0[1] - uy * 2.4 - ux * 7.5), 1, 1);
      // farm fields behind the town (and its twin)
      const fx = Math.round(vx - ux * 8 - 3), fy = Math.round(vy - uy * 8 - 2);
      for (let y = fy; y < fy + 5; y++) for (let x = fx; x < fx + 7; x++) for (const [xx, yy] of orbit([x, y]))
        if (this.inside(xx, yy) && this.type[this.idx(xx, yy)] === T.GRASS && this.elev[this.idx(xx, yy)] === 0 && !this.occupied[this.idx(xx, yy)]) this.type[this.idx(xx, yy)] = T.FIELD;
    });
    // capture sites: mirrored pairs out in the contested ground, the big prize on the island
    const spot = (lo: number, hi: number): P => {
      for (let k = 0; k < 200; k++) {
        const [x, y] = pick(12), d = Math.hypot(x - b0[0], y - b0[1]), D = Math.hypot(N - 1 - 2 * b0[0], N - 1 - 2 * b0[1]);
        if (d > D * lo && d < D * hi && dBase(x, y) > 20 && riverD(x, y) > 5 && Math.hypot(x - C[0], y - C[1]) > isl + 12) return [Math.round(x), Math.round(y)];
      }
      return [Math.round(b0[0] + (C[0] - b0[0]) * lo), Math.round(b0[1] + (C[1] - b0[1]) * lo)];
    };
    const plan: [string, number, number, number, number][] = [['fuelDepot', 2, 2, 0.3, 0.45], ['motorPool', 3, 2, 0.3, 0.5], ['recruitOffice', 2, 2, 0.2, 0.35], ['watchtower', 1, 1, 0.25, 0.45], ['watchtower', 1, 1, 0.35, 0.48], ['bunker', 1, 1, 0.2, 0.4], ['bunker', 1, 1, 0.3, 0.48], ['bunker', 1, 1, 0.4, 0.48],
      ['commTower', 1, 1, 0.15, 0.48], ['commTower', 1, 1, 0.3, 0.5], ['repairYard', 2, 2, 0.22, 0.45], ['repairYard', 2, 2, 0.35, 0.5]];
    for (const [kind, w, h, lo, hi] of plan) for (let k = 0; k < 6; k++) { const [x, y] = spot(lo, hi); if (pair(kind, x, y, w, h)) break; } // (no power plants: they're all out on the flanks)
    // the citadel: the orbital uplink dead centre, a comm tower (radar) for each side, and a bunker beside
    // each gate, each taken on its own. The money and repairs are out on the flanks, so armies split three ways.
    for (let y = N / 2 - 1; y <= N / 2; y++) for (let x = N / 2 - 1; x <= N / 2; x++) { const i = this.idx(x, y); this.type[i] = T.DIRT; this.scrap[i] = 0; this.elev[i] = 0; }
    claim('uplink', N / 2 - 1, N / 2 - 1, 2, 2);
    { const at = (a: number, d: number): P => [Math.round(C[0] + Math.cos(a) * d), Math.round(C[1] + Math.sin(a) * d)];
      pair('commTower', ...at(Math.atan2(b0[1] - C[1], b0[0] - C[0]), 5.5), 1, 1);
      for (const g of this.gates.slice(0, this.gates.length / s)) pair('bunker', ...at(g + 0.3, 10), 1, 1); } // (just off the gate's drive)
    // abandoned war machines in out-of-the-way spots: the first to reach one claims it
    const kinds = ['tank', 'artillery', 'juggernaut', 'tank', 'tank'];
    for (let k = 0, n = 0; k < 200 && n < 5; k++) {
      const [x, y] = spot(0.15, 0.5), set = orbit([x, y]);
      if (set.some(([a, b]) => !this.inside(a, b) || this.type[this.idx(a, b)] > T.DIRT || this.forest[this.idx(a, b)] || this.occupied[this.idx(a, b)])) continue;
      if (set.some(([a, b]) => this.derelicts.some((d) => Math.hypot(d.x - a, d.y - b) < 15))) continue;
      const type = kinds[n++];
      for (const [a, b] of set) this.derelicts.push({ type, x: a, y: b });
    }
  }

  // ------------------------------------------------------------ painting
  // Painting is split into chunks so the title screen can show progress: prepare(), then
  // paintChunk(i) for i < chunkCount, then finish().
  get chunkCount() { return this.cw * this.chh; }
  // The chunks that actually show some map (the turned map leaves the corners of the canvas empty),
  // nearest a point first, so the ground around your base is ready soonest.
  neededChunks(nearX: number, nearY: number) {
    const out: number[] = [];
    for (let i = 0; i < this.chunkCount; i++) {
      const cx = i % this.cw, cy = Math.floor(i / this.cw);
      let hit = false;
      for (let a = 0; a <= 8 && !hit; a++) for (let b = 0; b <= 8 && !hit; b++) {
        const [gx, gy] = toGround(cx * CH + (a * CH) / 8, cy * CH + OY + (b * CH) / 8);
        hit = gx > -64 && gy > -64 && gx < MAP + 64 && gy < MAP + 64;
      }
      if (hit) out.push(i);
    }
    const mid = (i: number) => [(i % this.cw + 0.5) * CH, (Math.floor(i / this.cw) + 0.5) * CH + OY];
    return out.sort((p, q) => Math.hypot(mid(p)[0] - nearX, mid(p)[1] - nearY) - Math.hypot(mid(q)[0] - nearX, mid(q)[1] - nearY));
  }
  private pixel: ((px: number, py: number) => number) | null = null;
  ground: ((px: number, py: number) => number) | null = null; // the painted ground type at a ground pixel (after prepare(); for the map checker)
  prepare() {
    // warp fields make cell edges ragged and natural
    const Q = 4, qw = Math.ceil(MAP / Q) + 2, qh = Math.ceil((MAP - OY) / Q) + 2;
    // The painting tables below (warps, colour patterns, lumps, road distance, water distance) are
    // at quarter size, and filled in by patches the first time painting reads from one: a worker only
    // paints part of the map, so working them out for all of it (as before) wasted seconds each.
    // A patch also fills one row and column of its neighbours, so a smooth read between four cells
    // never lands on an unfilled one.
    const riverAt = segIndex(this.rivers, 8); // (the painter only asks within a few squares of a river)
    const B = 32, nbx = Math.ceil(qw / B), nby = Math.ceil(qh / B), ready = new Uint8Array(nbx * nby), readyW = new Uint8Array(nbx * nby);
    const clampQ = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
    // Where feet and wheels wade through water: every ford and river mouth's shallows, each citadel gate,
    // and wherever a road fords a dam's stream (x, y, radius of the shallows, in squares). Their banks
    // are churned to mud; wadeSq marks the squares near enough to ask. Where a road runs down into the
    // shallows (landings), the mud runs further up it.
    const wades: [number, number, number][] = this.fordPts.map(([x, y]): [number, number, number] => [x, y, 3.3]), wadeSq = new Uint8Array(N * N), landings: P[] = [];
    { const C0 = N / 2 - 0.5, mid = this.island + 1.5; for (const g of this.gates) for (const o of [-2.6, 0, 2.6]) wades.push([C0 + Math.cos(g) * mid - Math.sin(g) * o, C0 + Math.sin(g) * mid + Math.cos(g) * o, 2.3]); }
    for (const l of this.roadLines) for (let k = 1; k < l.length; k++) {
      const [ax, ay] = l[k - 1], [bx, by] = l[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4);
      for (let j = 1; j <= n; j++) {
        const p = (f: number): P => [ax + (bx - ax) * f, ay + (by - ay) * f], [x0, y0] = p((j - 1) / n), [x1, y1] = p(j / n), i0 = this.idx(Math.round(x0), Math.round(y0)), i1 = this.idx(Math.round(x1), Math.round(y1));
        if ((this.type[i0] === T.FORD) === (this.type[i1] === T.FORD)) continue;
        const wetI = this.type[i0] === T.FORD ? i0 : i1; landings.push([(x0 + x1) / 2, (y0 + y1) / 2]);
        if (this.streamUnder.has(wetI)) wades.push([(x0 + x1) / 2, (y0 + y1) / 2, 0.8]);
      }
    }
    for (const [wx, wy, r] of wades) for (let y = Math.floor(wy - r - 3); y <= wy + r + 3; y++) for (let x = Math.floor(wx - r - 3); x <= wx + r + 3; x++) if (this.inside(x, y)) wadeSq[this.idx(x, y)] = 1;
    const ens = (qx: number, qy: number) => { const b = (clampQ(qy, qh - 1) >> 5) * nbx + (clampQ(qx, qw - 1) >> 5); if (!ready[b]) { ready[b] = 1; fillBlock(b % nbx, (b / nbx) | 0); } };
    this.wE = new Float32Array(qw * qh * 2); this.wT = new Float32Array(qw * qh * 2);
    const wE = this.wE, wT = this.wT;
    const wq = qw;
    const warp = (f: Float32Array, px: number, py: number, o: number) => { const qx = Math.floor(px / Q), qy = Math.floor((py - OY) / Q); ens(qx, qy); return f[(qy * wq + qx) * 2 + o] ?? 0; };
    // Smooth edges between squares: a value read at any point is blended from the 4x4 nearest squares
    // along a smooth curve that still passes exactly through each square's own value at its centre
    // (Catmull-Rom). So the ground at a square's middle is what the game says it is, and the edges
    // between squares curve instead of stepping in a staircase.
    const crW = new Float64Array(8);
    const crAt = (fx: number, fy: number) => { // weights for the 4x4 squares round (fx, fy), in squares; returns the top-left square
      const ix = Math.floor(fx), iy = Math.floor(fy);
      for (let k = 0; k < 2; k++) { const t = k ? fy - iy : fx - ix, t2 = t * t, t3 = t2 * t, o = k * 4; crW[o] = (-t3 + 2 * t2 - t) / 2; crW[o + 1] = (3 * t3 - 5 * t2 + 2) / 2; crW[o + 2] = (-3 * t3 + 4 * t2 + t) / 2; crW[o + 3] = (t3 - t2) / 2; }
      return [ix - 1, iy - 1];
    };
    // which squares sit in the middle of even ground (the 4x4 round them all alike), where blending changes nothing: 1 ground, 2 woods, 4 height
    const calm = new Uint8Array(N * N), cl = (v: number) => Math.max(0, Math.min(N - 1, v)), gk = (q: number) => (q === T.GRASS || q === T.DIRT || q === T.SCRAP || q === T.ROCK ? q : T.GRASS);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i0 = cl(y - 1) * N + cl(x - 1), t0 = gk(this.type[i0]), f0 = this.forest[i0] >= 2, e0 = this.elev[i0]; let m = 7;
      for (let j = -1; j <= 2 && m; j++) for (let k = -1; k <= 2; k++) { const i = cl(y + j) * N + cl(x + k); if (gk(this.type[i]) !== t0) m &= ~1; if ((this.forest[i] >= 2) !== f0) m &= ~2; if (this.elev[i] !== e0) m &= ~4; }
      calm[y * N + x] = m;
    }
    const calmAt = (fx: number, fy: number, bit: number) => (calm[cl(Math.floor(fy)) * N + cl(Math.floor(fx))] & bit) !== 0;
    const smooth = (fx: number, fy: number, val: (a: number, b: number) => number) => { const [x0, y0] = crAt(fx, fy); let s = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += crW[i] * crW[4 + j] * val(Math.max(0, Math.min(N - 1, x0 + i)), Math.max(0, Math.min(N - 1, y0 + j))); return s; };
    const NAT = [T.GRASS, T.DIRT, T.SCRAP, T.ROCK], natural = (q: number) => q === T.GRASS || q === T.DIRT || q === T.SCRAP || q === T.ROCK;
    const votes = new Float64Array(10);
    const blendType = (fx: number, fy: number) => { // the natural ground (grass, earth, salvage, rock) with the most weight here; built and wet squares count as grass
      if (calmAt(fx, fy, 1)) return gk(this.type[cl(Math.floor(fy)) * N + cl(Math.floor(fx))]);
      const [x0, y0] = crAt(fx, fy); votes.fill(0);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const q = this.type[Math.max(0, Math.min(N - 1, y0 + j)) * N + Math.max(0, Math.min(N - 1, x0 + i))]; votes[natural(q) ? q : T.GRASS] += crW[i] * crW[4 + j]; }
      let best = T.GRASS; for (const q of NAT) if (votes[q] > votes[best]) best = q; return best;
    };
    const elevW = (px: number, py: number) => { // plateau edges from a smooth blend of the nearest squares' heights, so cliffs curve instead of stepping
      const wx = px + warp(this.wE, px, py, 0), wy = py + warp(this.wE, px, py, 1), e0 = this.elevAt(wx, wy);
      if (e0 === 1) return 1; // ramps stay exactly where they are
      const ex = wx / CELL - 0.5, ey = wy / CELL - 0.5; if (calmAt(ex, ey, 4)) return e0;
      const f = smooth(ex, ey, (a, b) => { const q = this.elev[b * N + a]; return q === 2 ? 1 : q === 1 ? 0.5 : 0; });
      return f > 0.5 ? 2 : f < 0.5 ? 0 : e0;
    };
    // Ground type at a pixel (soft = ragged blend edges, hard = nearly exact), worked out on demand.
    const PW = MAP;
    const typeW = (px: number, py: number, isSoft: boolean) => {
      px = Math.round(px); py = Math.round(py);
      if (px < 0 || px >= PW || py < OY || py >= MAP) return T.GRASS;
      const f = isSoft ? 1 : 0.3, cx = Math.floor((px + warp(this.wT, px, py, 0) * f) / CELL), cy = Math.floor((py + warp(this.wT, px, py, 1) * f) / CELL);
      const tc = cx >= 0 && cy >= 0 && cx < N && cy < N ? this.type[cy * N + cx] : T.GRASS;
      if (tc === T.BRIDGE) return tc;
      const t = natural(tc) ? blendType((px + warp(this.wT, px, py, 0) * f) / CELL - 0.5, (py + warp(this.wT, px, py, 1) * f) / CELL - 0.5) : tc; // natural ground edges curve (built ground keeps its square edges)
      let moatBank = false;
      { // the citadel's moat and gates, drawn from their true shapes: a wavy ring of water with round shallows at each gate
        const gx = px / CELL - 0.5 - (N / 2 - 0.5), gy = py / CELL - 0.5 - (N / 2 - 0.5), dc = Math.hypot(gx, gy), isl = this.island;
        if (dc < isl + 4.5) {
          const wob = (vnoise(px, py, 40, 78) - 0.5) * 1.2 + (vnoise(px, py, 14, 79) - 0.5) * 0.4, inner = isl - 0.3 + wob * 0.7, outer = isl + 2.9 + (vnoise(px, py, 50, 80) - 0.5) * 1.1;
          if (dc >= inner && dc <= outer) {
            const mid = isl + 1.5, gate = this.gates.some((g) => { const ox = gx - Math.cos(g) * mid, oy = gy - Math.sin(g) * mid, rad = ox * Math.cos(g) + oy * Math.sin(g), tan = -ox * Math.sin(g) + oy * Math.cos(g); return Math.hypot(rad / 1.3, tan) < this.gateW + 0.3 + wob; });
            return gate ? T.FORD : T.WATER;
          }
          if (dc < inner) return t === T.WATER || t === T.FORD ? T.GRASS : t; // the island itself
          if ((t === T.WATER || t === T.FORD) && Math.hypot(cx - (N / 2 - 0.5), cy - (N / 2 - 0.5)) < isl + 3.2) moatBank = true; // the moat's squares past its true edge are bank (unless the river runs on into it, below)
        }
      }
      { // lakes and rivers from their true shapes: smooth shores, not squares
        const gx = px / CELL - 0.5, gy = py / CELL - 0.5;
        for (const ch of this.channels) if (!this.drained.has(ch.lake) && this.inChannel(ch, gx, gy, (vnoise(px, py, 30, 75) - 0.5) * 0.6) > 0) return T.WATER; // a lake's outlet, narrowing to its dam
        const near = this.streamNear().get(cy * N + cx);
        if (near) { // a stream, drawn along its true line, widening as it goes (tested near it, not just on its squares, so it never breaks)
          let best = 9, dry = false;
          for (let k = 0; k < near.length; k += 4) { const dd = Math.hypot(near[k] - gx, near[k + 1] - gy) - near[k + 2]; if (dd < best) { best = dd; dry = this.drained.has(near[k + 3]); } }
          if (best < (vnoise(px, py, 20, 79) - 0.5) * 0.25) return dry ? T.DIRT : T.FORD; // (once its lake has gone, a dry bed of bare earth)
          if (this.streamUnder.has(cy * N + cx)) return this.streamUnder.get(cy * N + cx)!;
        }
        for (const [lkNo, lk] of this.lakes.entries()) { if (this.drained.has(lkNo)) continue; const d = Math.hypot(gx - lk[0], gy - lk[1]); if (d < lk[2] * 1.2) { if (d < shoreR(lk, Math.atan2(gy - lk[1], gx - lk[0])) + (vnoise(px, py, 70, 75) - 0.5) * 1.6 + (vnoise(px, py, 20, 76) - 0.5) * 0.5) return T.WATER; return t === T.WATER ? T.GRASS : t; } } // the shore wobbles naturally
        if (this.rivers.length && (moatBank || t === T.WATER || t === T.FORD || this.type[Math.max(0, Math.min(N - 1, cy + 1)) * N + cx] === T.WATER || this.type[Math.max(0, Math.min(N - 1, cy - 1)) * N + cx] === T.WATER || this.type[cy * N + Math.max(0, Math.min(N - 1, cx + 1))] === T.WATER || this.type[cy * N + Math.max(0, Math.min(N - 1, cx - 1))] === T.WATER)) {
          { // (runs right on into the citadel's moat, so no strip of bank is left between them)
            const d = riverAt(gx, gy);
            const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy, at = (a: number, b: number) => this.riverHW[Math.max(0, Math.min(N - 1, b)) * N + Math.max(0, Math.min(N - 1, a))];
            const hw = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
            const bank = (vnoise(px, py, 60, 73) - 0.5) * 1.6 + (vnoise(px, py, 17, 74) - 0.5) * 0.4; // banks that wander (into the odd little curl and pocket, on purpose)
            if (d < hw + bank) return this.fordPts.some(([fx, fy]) => Math.hypot(gx - fx, gy - fy) < 3.3 + (vnoise(px, py, 40, 77) - 0.5) * 1.2) ? T.FORD : T.WATER; // round shallows, inside the river's own banks
            if (moatBank || d < hw + 2.5) return t === T.WATER || t === T.FORD ? T.GRASS : t; // near a river its true banks alone decide: no second, square-shaped shore beside them (which left thin strips of land between the two)
          }
        }
      }
      if (moatBank) return T.GRASS;
      // shorelines: blend the four nearest squares' water so lakes, ponds and rivers get smooth, rounded edges
      const fx = (px + warp(this.wT, px, py, 0) * 0.6) / CELL - 0.5, fy = (py + warp(this.wT, px, py, 1) * 0.6) / CELL - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const wet = (a: number, b: number) => { const q = this.type[Math.max(0, Math.min(N - 1, b)) * N + Math.max(0, Math.min(N - 1, a))]; return q === T.WATER ? 1 : 0; };
      const w = (wet(ix, iy) * (1 - tx) + wet(ix + 1, iy) * tx) * (1 - ty) + (wet(ix, iy + 1) * (1 - tx) + wet(ix + 1, iy + 1) * tx) * ty;
      if (w <= 0 || w >= 1) return t;
      if (w > 0.5) return T.WATER;
      if (t !== T.WATER) return t;
      for (const [a, b] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) { const q = this.type[Math.max(0, Math.min(N - 1, b)) * N + Math.max(0, Math.min(N - 1, a))]; if (q !== T.WATER && q !== T.BRIDGE && q !== T.FORD) return q; }
      return T.GRASS;
    };
    // big, slow colour patterns (lush vs dry, light vs dark), pre-computed at quarter size
    const fld = new Float32Array(qw * qh * 2);
    const field = (px: number, py: number, o: number) => {
      const fx = px / Q, fy = (py - OY) / Q, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      ens(ix, iy);
      const at = (a: number, b: number) => fld[(Math.min(qh - 1, Math.max(0, b)) * qw + Math.min(qw - 1, Math.max(0, a))) * 2 + o];
      return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    };
    // ground lumps and patch fields at quarter size (bytes): 0 lit (the top of a lump, from above), 1 tuft clumps,
    // 2 worn patches, 3 grime, 4 pebble patches
    const QC = 5, lumps = new Uint8Array(qw * qh * QC);
    const lump = (px: number, py: number, o: number) => {
      const fx = px / Q, fy = (py - OY) / Q, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      ens(ix, iy);
      const at = (a: number, b: number) => lumps[(Math.min(qh - 1, Math.max(0, b)) * qw + Math.min(qw - 1, Math.max(0, a))) * QC + o];
      return ((at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty) / 255;
    };
    // distance to the nearest road centre line, pre-computed at quarter size
    const roadD = new Float32Array(qw * qh);
    const segs = this.roadLines.flatMap((l) => l.slice(1).map((p, k) => [l[k][0] * CELL + 12, l[k][1] * CELL + 12, p[0] * CELL + 12, p[1] * CELL + 12]));
    // only the segments near each patch matter (a road only shows within a few pixels), so file them in a coarse grid first
    const TS = 96, gw = Math.ceil(MAP / TS) + 1, grid: number[][][] = Array.from({ length: gw * gw }, () => []);
    for (const sg of segs) {
      const x0 = Math.max(0, Math.floor((Math.min(sg[0], sg[2]) - 24) / TS)), x1 = Math.min(gw - 1, Math.floor((Math.max(sg[0], sg[2]) + 24) / TS));
      const y0 = Math.max(0, Math.floor((Math.min(sg[1], sg[3]) - 24) / TS)), y1 = Math.min(gw - 1, Math.floor((Math.max(sg[1], sg[3]) + 24) / TS));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) grid[gy * gw + gx].push(sg);
    }
    // one patch of every table but the water distance
    const fillBlock = (bx: number, by: number) => {
      for (let y = by * B, ye = Math.min(qh - 1, by * B + B); y <= ye; y++) for (let x = bx * B, xe = Math.min(qw - 1, bx * B + B); x <= xe; x++) {
        const px = x * Q, py = y * Q + OY, i = y * qw + x, k = i * 2, kl = i * QC;
        wE[k] = (vnoise(px, py, 13, 21) - 0.5) * 16 + (vnoise(px, py, 4, 27) - 0.5) * 4; wE[k + 1] = (vnoise(px, py, 13, 22) - 0.5) * 16 + (vnoise(px, py, 4, 28) - 0.5) * 4;
        wT[k] = (vnoise(px, py, 17, 23) - 0.5) * 18 + (vnoise(px, py, 5, 25) - 0.5) * 5;
        wT[k + 1] = (vnoise(px, py, 17, 24) - 0.5) * 18 + (vnoise(px, py, 5, 26) - 0.5) * 5;
        fld[k] = vnoise(px, py, 61, 37); fld[k + 1] = vnoise(px, py, 11, 33);
        // light from straight above: tops of lumps bright, hollows dark, no side favoured (the game's moving sun does the rest)
        const lit = (vnoise(px, py, 6, 91) - (vnoise(px + 3, py, 6, 91) + vnoise(px - 3, py, 6, 91) + vnoise(px, py + 3, 6, 91) + vnoise(px, py - 3, 6, 91)) / 4) * 2.9;
        lumps[kl] = Math.max(0, Math.min(255, Math.round((lit + 0.5) * 255)));
        lumps[kl + 1] = vnoise(px, py, 13, 94) * 255; lumps[kl + 2] = vnoise(px, py, 7, 93) * 255;
        lumps[kl + 3] = vnoise(px, py, 6, 96) * 255; lumps[kl + 4] = vnoise(px, py, 9, 95) * 255;
        let best = 99;
        for (const [ax, ay, sx, sy] of grid[Math.min(gw - 1, Math.max(0, Math.floor(py / TS))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(px / TS)))]) {
          const dx = sx - ax, dy = sy - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); // (a road's line can repeat a point: 0/0 made the distance NaN, and the road wasn't painted for a stretch round it)
          best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t));
        }
        roadD[i] = best + (vnoise(px, py, 9, 61) - 0.5) * 2;
      }
    };
    const roadAt = (px: number, py: number) => {
      const fx = px / Q, fy = (py - OY) / Q, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      ens(ix, iy);
      const at = (a: number, b: number) => roadD[Math.min(qh - 1, Math.max(0, b)) * qw + Math.min(qw - 1, Math.max(0, a))];
      return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    };
    const isWet = (t: number) => t === T.WATER || t === T.BRIDGE || t === T.FORD;
    // how far each spot is from the painted water, in pixels (a quarter-size distance map, exact
    // straight-line distance): beaches follow the shore round every bend instead of stepping
    const wd = new Uint8Array(qw * qh).fill(255);
    const nearSq = new Uint8Array(N * N); // only ground within a couple of squares of water need be looked at
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isWet(this.type[y * N + x])) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) { const a = x + k, b = y + j; if (a >= 0 && b >= 0 && a < N && b < N) nearSq[b * N + a] = 1; }
    // one patch of it, worked out over the patch and a margin of 12 cells (48 pixels): exact for every
    // distance under that, which is all a beach ever asks (it's at most 39 pixels wide)
    const WM = 12, WW = B + 1 + WM * 2, INF = 1e9, wf = new Float64Array(WW * WW), wv = new Int32Array(WW), wz = new Float64Array(WW + 1), wg = new Float64Array(WW), wdd = new Float64Array(WW);
    const pass = (n: number, get: (k: number) => number, put: (k: number, val: number) => void) => { // squared distances along a line (Felzenszwalb & Huttenlocher)
      for (let q = 0; q < n; q++) wg[q] = get(q);
      let k = 0; wv[0] = 0; wz[0] = -INF; wz[1] = INF;
      for (let q = 1; q < n; q++) { if (wg[q] >= INF) continue; let sct = 0; for (;;) { const r = wv[k]; sct = wg[r] >= INF ? -INF : ((wg[q] + q * q) - (wg[r] + r * r)) / (2 * q - 2 * r); if (sct <= wz[k] && k > 0) k--; else break; } if (wg[wv[k]] >= INF) { wv[k] = q; wz[k] = -INF; wz[k + 1] = INF; continue; } k++; wv[k] = q; wz[k] = sct; wz[k + 1] = INF; }
      if (wg[wv[0]] >= INF) { for (let q = 0; q < n; q++) put(q, INF); return; }
      k = 0; for (let q = 0; q < n; q++) { while (wz[k + 1] < q) k++; const r = wv[k]; wdd[q] = (q - r) * (q - r) + wg[r]; }
      for (let q = 0; q < n; q++) put(q, wdd[q]);
    };
    const fillWater = (bx: number, by: number) => {
      const x0 = bx * B - WM, y0 = by * B - WM; let any = false;
      for (let y = 0; y < WW; y++) for (let x = 0; x < WW; x++) { const qx = x0 + x, qy = y0 + y, px = qx * Q, py = qy * Q + OY, cx = Math.floor(px / CELL), cy = Math.floor(py / CELL); const w = qx >= 0 && qy >= 0 && qx < qw && qy < qh && cx >= 0 && cy >= 0 && cx < N && cy < N && nearSq[cy * N + cx] && isWet(typeW(px, py, false)); wf[y * WW + x] = w ? 0 : INF; if (w) any = true; }
      if (!any) return; // no water near: it all stays "far"
      for (let y = 0; y < WW; y++) pass(WW, (x) => wf[y * WW + x], (x, val) => { wf[y * WW + x] = val; });
      for (let x = 0; x < WW; x++) pass(WW, (y) => wf[y * WW + x], (y, val) => { wf[y * WW + x] = val; });
      for (let y = WM; y < WM + B + 1; y++) for (let x = WM; x < WM + B + 1; x++) { const qx = x0 + x, qy = y0 + y; if (qx < qw && qy < qh) wd[qy * qw + qx] = Math.min(255, Math.round(Math.sqrt(wf[y * WW + x]) * Q)); }
    };
    const waterDist = (px: number, py: number) => { // smoothly between the map's spots
      const fx = px / Q, fy = (py - OY) / Q, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      { const b = (clampQ(iy, qh - 1) >> 5) * nbx + (clampQ(ix, qw - 1) >> 5); if (!readyW[b]) { readyW[b] = 1; fillWater(b % nbx, (b / nbx) | 0); } }
      const at = (a: number, b: number) => wd[Math.min(qh - 1, Math.max(0, b)) * qw + Math.min(qw - 1, Math.max(0, a))];
      return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    };
    // how deep into a crossing's mud a ground pixel is: above 0 is mud, 1 at the water. It reaches about a
    // square up the bank, further where a track comes down to the water, and thins away to either side.
    const mudAt = (gx: number, gy: number) => {
      const sx = gx / CELL - 0.5, sy = gy / CELL - 0.5; let mid = 0; // 1 on the line across, 0 at the far ends of the shallows
      for (const [x, y, r] of wades) { const f = 1 - (Math.hypot(sx - x, sy - y) / (r + 2)) ** 2; if (f > mid) mid = f; }
      if (mid <= 0) return -1;
      const landing = roadAt(gx, gy) < 14 && landings.some(([x, y]) => Math.hypot(sx - x, sy - y) < 2.5);
      const reach = (8 + vnoise(gx, gy, 30, 305) * 34 + vnoise(gx, gy, 12, 301) * 12) * mid - 6 + (landing ? 16 : 0); // in patches: here a wide churned bank, there grass to the water
      return reach > 0 ? 1 - waterDist(gx, gy) / reach : -1;
    };
    const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const dith = (x: number, y: number) => B4[(y & 3) * 4 + (x & 3)] / 16 - 0.47;
    const grassAt = (x: number, y: number) => { const t = typeW(x, y, true); return t === T.GRASS || t === T.ROCK; };
    // gentle lumps in the ground lit from above: >0 a rise, <0 a hollow
    const bumpLight = (x: number, y: number) => lump(x, y, 0) - 0.5 + (hash3(x >> 1, 92, y >> 1) - 0.5) * 0.12;
    // pick a shade from dark to light, dithering only right at the boundary between two shades
    const tone = (shades: number[], v: number, X: number, Y: number) => {
      const f = Math.max(0, Math.min(shades.length - 1, v * (shades.length - 1))), i = Math.floor(f), frac = f - i;
      return frac > 0.82 && dith(X, Y) + 0.5 < (frac - 0.82) * 5.5 ? shades[Math.min(shades.length - 1, i + 1)] : shades[i];
    };

    // gx, gy: where on the ground (what material). X, Y: the screen pixel (fine texture stays crisp)
    const surface = (gx: number, gy: number, e: number, X: number, Y: number): number => {
      const cell = this.idx(Math.min(N - 1, Math.max(0, this.cellOf(gx))), Math.min(N - 1, Math.max(0, this.cellOf(gy))));
      const hard = typeW(gx, gy, false);
      const h = hash3(X, 1, Y);
      if (e === 1) return Y % 3 === 0 ? SOIL_LO : h < 0.1 ? SOIL_HI : SOIL[(h * 3) | 0]; // ramp: worn earth with ridges
      const exact = this.type[cell], ccx = this.cellOf(gx), ccy = this.cellOf(gy);
      if (exact === T.BRIDGE) {
        // a straight timber deck: rails and posts along both sides, planks across
        const lx = gx - ccx * CELL;
        const wEdge = this.type[this.idx(ccx - 1, ccy)] !== T.BRIDGE && lx < 3, eEdge = this.type[this.idx(ccx + 1, ccy)] !== T.BRIDGE && lx > CELL - 4;
        if (wEdge || eEdge) {
          const r = wEdge ? lx : CELL - 1 - lx;
          if (gy % 8 === 0) return 0x2a2016; // post
          return r === 0 ? 0x1e1610 : r === 1 ? 0x6e5838 : RAIL;
        }
        return gy % 3 === 0 ? 0x3a2a1c : gy % 3 === 1 ? PLANK_HI : PLANK[(Math.floor(gy / 3) + (hash3(Math.floor(gy / 3), 3, gx >> 4) < 0.5 ? 1 : 0)) % 2];
      }
      if (isWet(hard) && ccy > 0 && this.type[this.idx(ccx, ccy - 1)] === T.BRIDGE && gy - ccy * CELL < 4 && exact !== T.BRIDGE) return DEEP; // shadow under the deck
      if (this.paintMode === 'drain') { // a drained lake: wet mud, cracking as it dries, puddles in the hollows
        let depth = -1, R = 1; // how far inside the old shore (in squares), and the lake's size
        for (const k of this.drained) { const lk = this.lakes[k], dx = gx / CELL - 0.5 - lk[0], dy = gy / CELL - 0.5 - lk[1], d = shoreR(lk, Math.atan2(dy, dx)) + 0.8 - Math.hypot(dx, dy); if (d > depth) { depth = d; R = lk[2]; } }
        for (const ch of this.channels) if (this.drained.has(ch.lake)) { const d = this.inChannel(ch, gx / CELL - 0.5, gy / CELL - 0.5, 0.3) * 1.6; if (d > depth) { depth = d; R = this.lakes[ch.lake][2]; } } // and its outlet channel
        if (depth < 0) return -1;
        const n = vnoise(gx, gy, 34, 94), wob = (vnoise(gx, gy, 12, 98) - 0.5) * 1.6, dry = Math.min(1, Math.max(0, (depth + wob) / 4.5)); // 0 at the old shore, 1 well inside
        if (dith(X, Y) + 0.5 + (hash3(X >> 2, 41, Y >> 2) - 0.5) * 0.5 > dry * 1.3) { const pal = field(gx, gy, 0) + (h - 0.5) * 0.25 > 0.5 ? DRY : LUSH; return pal[(h * 2.99) | 0]; } // the old shore greening over with the same grass as round it, breaking raggedly into the bed
        if (this.type[this.idx(Math.floor(gx / CELL), Math.floor(gy / CELL))] === T.SCRAP) { const s = hash3(X >> 1, 99, Y >> 1); return s < 0.55 ? SCRAP[(s * 10.9) % 6 | 0] : SCRAPBED[(s * 4) & 1]; } // a sunken wreck, rusting in the mud (scrap, as salvagers know it)
        const wet = depth / (R * 0.9); // wetter toward the middle
        if (wet > 0.55 && n < 0.3) return h < 0.4 ? 0x52625a : 0x4a5a54; // the last of the water, in the deepest hollows
        if (Math.abs(vnoise(gx, gy, 7, 95) - 0.5) < 0.02 && wet < 0.6) return 0x4a3c2e; // drying cracks
        return wet > 0.5 ? (h < 0.5 ? 0x56442f : 0x4e3e2a) : h < 0.12 ? 0x7a6a4c : h < 0.6 ? 0x6e5c42 : 0x66543a; // dark wet mud in the middle, paler as it dries
      }
      if (isWet(hard)) {
        let shore = 12;
        for (const r of [2, 4, 7, 11]) {
          if (!isWet(typeW(gx + r, gy, false)) || !isWet(typeW(gx - r, gy, false)) || !isWet(typeW(gx, gy + r, false)) || !isWet(typeW(gx, gy - r, false))) { shore = r; break; }
        }
        if (hard === T.FORD && roadAt(gx, gy) < 7) { const rf = roadAt(gx, gy); return Math.abs(rf - 5) < 1.1 ? (h < 0.4 ? 0x4e5a52 : 0x56625a) : h < 0.5 ? 0x6e7a6c : 0x76806e; } // the track runs on through the shallows
        if (hard === T.FORD && shore <= 2 && wadeSq[cell] && mudAt(gx, gy) > -0.6) return h < 0.5 ? 0x544c3c : 0x5e5644; // silt stirred up at the water's edge
        if (hard === T.FORD) return h < 0.1 ? 0x8a8474 : h < 0.14 ? 0x5a5650 : h < 0.22 ? RIPPLE : shore <= 2 ? SAND : SHAL;
        if (shore <= 2) return h < 0.45 ? FOAM : h < 0.75 ? SAND : SAND_LO;
        if (shore <= 4) return h < 0.12 ? RIPPLE : SHAL;
        // ripples: short bright dashes with a dark trough under them
        const rx = Math.floor((X + (Y % 7) * 3) / 5);
        if (hash3(rx, 7, Y) < 0.08) return RIPPLE;
        if (hash3(rx, 7, Y - 1) < 0.08) return DEEP;
        return shore <= 7 ? (dith(X, Y) > 0.2 ? SHAL : MID) : (field(gx, gy, 0) + dith(X, Y) * 0.3 > 0.5 ? DEEP : MID);
      }
      if (e === 0 && !isWet(hard) && hard !== T.ROCK && wadeSq[cell]) { // the banks of a crossing, trodden and rutted to wet mud
        const m = mudAt(gx, gy) + (vnoise(gx, gy, 7, 302) - 0.5) * 0.45;
        if (m > 0 && !(m < 0.3 && dith(X, Y) + 0.5 > m / 0.3)) { // its edge breaks up into the grass
          const rd = roadAt(gx, gy);
          if (rd < 9 && Math.abs(rd - 5) < 1.4) return h < 0.5 ? 0x231c14 : 0x2a2219; // the ruts, deep and dark with water
          if (rd < 3.6) return h < 0.3 ? 0x54442f : 0x5e4c34; // packed hard between them
          if (m > 0.55 && vnoise(gx, gy, 5, 303) > 0.74) return h < 0.12 ? 0x7a8680 : 0x4c5650; // puddles, catching the sky
          if (hash3(Math.floor((X + (Y % 5) * 2) / 4), 304, Y) < 0.09) return 0x332a1f; // churned: hoof and tyre marks
          return tone([0x372e22, 0x42372a, 0x4e4130, 0x5a4a36, 0x66553d], 0.2 + (1 - Math.min(1, m)) * 0.5 + bumpLight(gx, gy) * 0.8, X, Y); // darkest and wettest at the water
        }
      }
      if (e === 0 && !isWet(hard) && hard !== T.ROCK && hard !== T.ROAD) { // beaches along some low shores (others stay grassy)
        const beachy = vnoise(gx, gy, 150, 71), bcx = Math.floor(gx / CELL), bcy = Math.floor(gy / CELL), width = 7 + (beachy - 0.52) * 60; // wider where the shore is sandiest
        let shoreSq = false; // only squares within a beach's reach of water can be beach: checked cheaply first (far enough that the beach is never cut off along a square's edge)
        const reach = Math.ceil(width / CELL) + 1;
        for (let dy = -reach; dy <= reach && !shoreSq && beachy > 0.52; dy++) for (let dx = -reach; dx <= reach; dx++) { const q = this.type[Math.max(0, Math.min(N - 1, bcy + dy)) * N + Math.max(0, Math.min(N - 1, bcx + dx))]; if (q === T.WATER) { shoreSq = true; break; } }
        if (beachy > 0.52 && shoreSq) {
          const near = waterDist(gx, gy); // how far the water is, measured straight (so the beach's edge curves round every bend)
          if (near <= width && !(near > width * 0.6 && dith(X, Y) < (near - width * 0.6) / (width * 0.4) - 0.5)) // the inland edge breaks up into the grass
            return near <= 3 ? (h < 0.5 ? 0x8a7c5a : SAND_LO) : h < 0.06 ? SAND_LO : h < 0.1 ? 0xc4b48a : SAND; // wet sand at the waterline, a few pebbles
        }
      }
      if (hard === T.ROCK && this.peaks.length) { // a mountain: relief-shaded from a height map, snow up high, scree at the foot
        const H = (x: number, y: number) => this.mountainH(x, y);
        const hh = H(gx, gy);
        if (hh > -9) {
          const nx = H(gx + 2, gy) - H(gx - 2, gy), ny = H(gx, gy + 2) - H(gx, gy - 2);
          const light = 0.56 - (Math.abs(nx) + Math.abs(ny)) * 8; // lit from above: steep ground darker, no side favoured
          const snowLine = 1.0 + (vnoise(gx, gy, 9, 63) - 0.5) * 0.16; // snow only on the summits
          if (hh > snowLine) return light > 0.55 ? (h < 0.1 ? 0xd8dee6 : 0xf0f2f4) : light > 0.3 ? 0xc8d0da : 0x9aa6b4;
          if (hh > snowLine - 0.06 && h < 0.5) return light > 0.4 ? 0xd0d6dc : 0x8a929c; // ragged snow edge
          if (Math.abs(vnoise(gx, gy, 18, 61) * 2 - 1) < 0.05 && hh > 0.2) return CRACK; // gullies along the crags
          if (hh < 0.1) return h < 0.5 ? ROCK[1] : h < 0.8 ? ROCK_LO : 0x5c5a52; // scree at the foot
          return tone([0x3e3c38, ROCK_LO, ROCK[2], ROCK[0], ROCK[1], ROCK_HI, 0xc0bab0], Math.max(0, Math.min(1, light + (h - 0.5) * 0.12)), X, Y);
        }
      }
      if (hard === T.ROCK && [[12, 0], [-12, 0], [0, 12], [0, -12]].filter(([ox, oy]) => typeW(gx + ox, gy + oy, false) === T.ROCK).length >= 2) {
        // a ridge: one craggy mass of rock, broken into lit slabs with dark cracks between them
        const sx = Math.floor((gx + warp(this.wT, gx, gy, 0) * 0.5) / 7), sy = Math.floor((gy + warp(this.wT, gx, gy, 1) * 0.5) / 7);
        const lx = gx - sx * 7, ly = gy - sy * 7, slab = hash3(sx, 31, sy);
        if ((lx < 1 || ly < 1) && hash3(sx + (lx < 1 ? 0 : 7), 32, sy) < 0.6) return CRACK; // seams between slabs
        if (h < 0.03) return MOSS;
        return tone([shadeHex(ROCK[2], 0.86), ROCK[2], ROCK[0], ROCK[1], shadeHex(ROCK[1], 1.1)], 0.5 + bumpLight(gx, gy) * 0.8 + (slab - 0.5) * 0.25 - (Math.abs(lx - 3.5) + Math.abs(ly - 3.5)) * 0.014, X, Y); // each slab domed, lit from above
      }
      if (hard === T.ROCK) {
        const cx = Math.floor(gx / CELL) * CELL + 12, cy = Math.floor(gy / CELL) * CELL + 12;
        const dx = gx - cx, dy = gy - cy, r = 8 + hash3(cx, 3, cy) * 3 + (vnoise(gx, gy, 3, 41) - 0.5) * 3;
        const d = Math.hypot(dx, dy * 1.3);
        if (d < r) {
          if (d > r - 1.2) return dx + dy < 0 ? ROCK[0] : ROCK_LO;
          if (hash3(Math.floor(X / 3), 4, Math.floor(Y / 2)) < 0.12) return CRACK;
          return dx + dy < -5 ? ROCK_HI : dx + dy > 4 ? ROCK_LO : ROCK[(h * 3) | 0];
        }
        if (d < r + 3 && dx + dy > 2) return dith(X, Y) > 0 ? BASE : LUSH[2]; // boulder shadow
      }
      // dirt road: packed earth with two darker wheel ruts and a grassy crown, ragged at the edge
      const rd = e === 0 ? roadAt(gx, gy) : 99;
      if (rd < 12 && !isWet(hard)) {
        if (rd > 10 && dith(X, Y) > (12 - rd) / 2 - 0.5) { /* fade into the verge */ } else {
          if (Math.abs(rd - 5) < 1.1) return h < 0.3 ? 0x56442e : 0x5e4c34;
          if (rd < 1.6) return h < 0.4 ? 0x6e7044 : 0x7a6a4a;
          return shadeHex(0x84704e, 0.95 + field(gx, gy, 1) * 0.1 + (h < 0.04 ? 0.15 : 0));
        }
      }
      if (this.type[cell] === T.FIELD) {
        // crop rows: green ridges with a lit top and dark furrows between, hedge at the border
        const edgeField = typeW(gx + 3, gy, true) !== T.FIELD || typeW(gx - 3, gy, true) !== T.FIELD || typeW(gx, gy + 3, true) !== T.FIELD || typeW(gx, gy - 3, true) !== T.FIELD;
        if (edgeField) return h < 0.5 ? 0x2e4424 : 0x3a5228;
        const row = ((gy % 4) + 4) % 4;
        if (row === 0) return 0x4e3e2a;
        if (row === 1) return h < 0.2 ? 0x8aa04a : 0x6e8a3a;
        return h < 0.15 ? 0x4e6a2c : 0x5c7834;
      }
      let t = typeW(gx, gy, true);
      if (t === T.ROAD || t === T.FIELD) t = T.GRASS;
      // the ground one screen pixel above and below (for overhang shadows and sunlit edges)
      const [ux, uy] = toGround(X, Y - 1 + e * LIFT), [dx2, dy2] = toGround(X, Y + 1 + e * LIFT);
      const grassUp = grassAt(ux, uy), grassDown = grassAt(dx2, dy2);
      if (t === T.ROCK || isWet(t)) t = T.GRASS;
      if (t === T.SCRAP && this.type[cell] !== T.SCRAP && hash3(X, 9, Y) < 0.5) t = T.DIRT;
      if (t === T.SCRAP) {
        // salvage: bent plates and girders, lit on top, dark underneath, rare bright glints
        const bx = Math.floor(X / 3), by = Math.floor(Y / 2);
        if (hash3(bx, 5, by) < 0.45) {
          const c = SCRAP[(hash3(bx, 6, by) * SCRAP.length) | 0];
          if (X % 3 === 0 && Y % 2 === 0) return hash3(bx, 7, by) < 0.12 ? 0xe4e6e0 : shadeHex(c, 1.35);
          return Y % 2 === 1 ? shadeHex(c, 0.62) : c;
        }
        return hash3(bx, 8, by) < 0.3 ? 0x3a3026 : SCRAPBED[(h * 2) | 0];
      }
      if (t === T.DIRT) {
        // packed earth: lumpy and lit from above, with clustered pebbles, cracks and grime
        if (grassUp) return SOIL_LO; // grass overhang casts a dark lip
        const lit = bumpLight(gx, gy), n = field(gx, gy, 1);
        const px = Math.floor(X / 3), py = Math.floor(Y / 3), ox = px * 3 + ((hash3(px, 2, py) * 2) | 0), oy = py * 3 + ((hash3(px, 3, py) * 2) | 0);
        if (hash3(px, 4, py) < 0.18 * lump(gx, gy, 4)) { // pebbles gather in patches: lit top, dark underside
          if (X === ox && Y === oy) return SOIL_HI; if (X === ox + 1 && Y === oy) return SOIL[0]; if (Y === oy + 1 && (X === ox || X === ox + 1)) return SOIL_LO;
        }
        const grime = lump(gx, gy, 3);
        if (grime > 0.72 && dith(X, Y) < (grime - 0.72) * 4) return shadeHex(SOIL[2], 0.78); // dark damp grime
        if (hash3(Math.floor(X / 5) + Math.floor(Y / 2), 9, Math.floor(Y / 2)) < 0.025 && hash3(X, 10, Y) < 0.6) return SOIL_LO; // hairline cracks
        return tone([shadeHex(SOIL[2], 0.85), SOIL[2], SOIL[0], SOIL[1], shadeHex(SOIL[1], 1.12)], 0.5 + lit * 1.1 + (n - 0.5) * 0.35, X, Y);
      }
      // grass: a lush-to-dry blend in big patches, then clumps drawn as a bright tip over a dark base
      const wfx = (gx + warp(this.wT, gx, gy, 0) * 0.6) / CELL - 0.5, wfy = (gy + warp(this.wT, gx, gy, 1) * 0.6) / CELL - 0.5;
      const woods = calmAt(wfx, wfy, 2) ? this.forest[cl(Math.floor(wfy)) * N + cl(Math.floor(wfx))] >= 2 : smooth(wfx, wfy, (a, b) => (this.forest[b * N + a] >= 2 ? 1 : 0)) > 0.5; // the wood's edge curves
      if (woods) {
        if (h < 0.03) return NEEDLE;
        return tone([shadeHex(FOREST[0], 0.82), FOREST[0], FOREST[1], FOREST[2]], 0.45 + bumpLight(gx, gy) * 1.0, X, Y);
      }
      const dry = Math.min(1, Math.max(0, (field(gx, gy, 0) - 0.42) * 2.6 + dith(X, Y) * 0.5));
      const pal = e === 2 ? HIGH : dry > 0.5 ? DRY : LUSH;
      const tip = dry > 0.5 ? TIP_DRY : TIP;
      // tufts gather in patches with open ground between: three blades, lit tips, a shadow at the foot
      const clump = lump(gx, gy, 1), cxl = Math.floor(X / 5), cyl = Math.floor(Y / 5), k = hash3(cxl, 5, cyl);
      if (k < (clump > 0.6 ? 0.42 : clump > 0.45 ? 0.1 : 0.02)) {
        const ox = cxl * 5 + 1 + ((hash3(cxl, 6, cyl) * 3) | 0), oy = cyl * 5 + 2 + ((hash3(cxl, 7, cyl) * 2) | 0);
        if (Y === oy - 2 && X === ox) return k < 0.004 ? FLOWERS[(k * 750) % 3 | 0] : tip;
        if (Y === oy - 1 && (X === ox - 1 || X === ox + 1)) return shadeHex(tip, 0.88);
        if (Y === oy - 1 && X === ox) return shadeHex(pal[1], 1.12);
        if (Y === oy && X >= ox - 1 && X <= ox + 1) return X === ox + 1 ? pal[2] : shadeHex(pal[1], 1.04);
        if (Y === oy + 1 && (X === ox || X === ox + 1)) return BASE; // the tuft's shadow, down and to the right
      }
      if (!grassDown) return shadeHex(pal[1], 1.22); // sunlit edge where grass meets bare ground
      const lit = bumpLight(gx, gy), n = field(gx, gy, 1);
      const wear = lump(gx, gy, 2); // worn, grimy patches and the odd bare spot
      if (wear > 0.8 && dith(X, Y) < (wear - 0.8) * 5) return wear > 0.86 ? SOIL[(h * 3) | 0] : shadeHex(pal[2], 0.8);
      if (h < 0.006) return BASE; // specks of grime
      return tone([shadeHex(pal[2], 0.84), pal[2], pal[0], pal[1], shadeHex(pal[1], 1.14)], 0.5 + lit * 1.2 + (n - 0.5) * 0.4, X, Y);
    };

    // a little shade tucked in at the foot of raised ground, on every side alike (the sun's shadows move in the game)
    const elevS = (sx: number, sy: number) => { const [x, y] = toGround(sx, sy); return elevW(x, y); };
    const shadeAt = (sx: number, sy: number, e: number, c: number) => {
      if (elevS(sx, sy - 2) > e || elevS(sx - 2, sy) > e || elevS(sx + 2, sy) > e) return shadeHex(c, dith(sx, sy) > -0.1 ? 0.74 : 0.86);
      if (elevS(sx, sy - 4) > e || elevS(sx - 4, sy) > e || elevS(sx + 4, sy) > e) return shadeHex(c, dith(sx, sy) > 0.15 ? 0.86 : 0.94);
      return c;
    };

    // One screen pixel. The map is turned a little (YAW), so each screen pixel looks up the ground
    // under it; raised ground is drawn LIFT pixels higher per step.
    const pixel = (px: number, py: number): number => {
      if (this.paintMode === 'patch') { const [gx, gy] = toGround(px, py), cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL); if (!this.inside(cx, cy) || !this.patchMask.has(this.idx(cx, cy))) return -1; }
      const layer = this.paintMode === 'drain';
      for (const e of [2, 1]) {
        const [gx, gy] = toGround(px, py + e * LIFT);
        if (gx < 0 || gy < 0 || gx >= MAP || gy >= MAP) continue;
        if (elevW(gx, gy) === e) {
          if (layer) return -1;
          if (e === 2 && elevS(px, py + e * LIFT + 1) < 2) return hash3(px, 5, py) < 0.3 ? MOSS : 0x9aa070; // bright cliff lip
          return surface(Math.round(gx), Math.round(gy), e, px, py);
        }
      }
      const [gx, gy] = toGround(px, py);
      if (gx < 0 || gy < 0 || gx >= MAP || gy >= MAP || this.edge(gx / CELL - 0.5, gy / CELL - 0.5) < -0.3) return 0x0d0c0b; // off the map
      const here = elevW(gx, gy);
      if (here > 0 && layer) return -1;
      if (here > 0) {
        // cliff face (or the earth bank of a ramp)
        let k = 1;
        while (k < here * LIFT && elevS(px, py + k) >= here) k++;
        if (here === 1) return k % 2 ? SOIL_LO : SOIL[0];
        const depth = here * LIFT - k; // 0 at the top edge
        // natural rock: meandering cracks with a sunlit lip above each, weathering streaks, moss
        const crack = (x: number, y: number) => { const n = vnoise(x, y * 2.2, 7, 51) * 3 + vnoise(x, y, 3, 52) * 0.6; return Math.abs(n - Math.round(n)) < 0.09; };
        if (crack(px, py)) return CRACK;
        if (crack(px, py + 1)) return ROCK_HI;
        if (depth < 2 && hash3(px, 1, py) < 0.45) return MOSS;
        const streak = hash3(px, 2, 0) < 0.18 ? 0.86 : 1;
        const c = ROCK[(vnoise(px, py, 5, 53) * 2.99) | 0];
        return shadeHex(c, (k <= 2 ? 0.66 : k <= 4 ? 0.82 : 1) * streak * (0.94 + hash3(px, 3, py) * 0.12));
      }
      const sc = surface(Math.round(gx), Math.round(gy), 0, px, py);
      return sc < 0 ? sc : shadeAt(px, py, 0, sc);
    };

    this.pixel = pixel; this.ground = (px, py) => typeW(px, py, true);
  }

  // The pixels of one chunk (runs in a background worker; see paint.worker.ts).
  chunkPixels(i: number) {
    const cx = i % this.cw, cy = Math.floor(i / this.cw), pixel = this.pixel;
    const d = new Uint8ClampedArray(CH * CH * 4), glints: number[] = [];
    for (let y = 0; y < CH; y++) {
      const py = cy * CH + y + OY;
      for (let x = 0; x < CH; x++) {
        const px = cx * CH + x;
        const col = pixel(px, py), k = (y * CH + x) * 4;
        if (col < 0) continue; // a layer: this pixel isn't part of it
        if ((col === DEEP || col === MID) && hash3(px, 11, py) < 0.02 && !this.paintMode) glints.push(px, py);
        d[k] = col >> 16; d[k + 1] = (col >> 8) & 255; d[k + 2] = col & 255; d[k + 3] = 255;
      }
    }
    return { d, glints };
  }

  // Back on the main thread: turn painted pixels into a chunk canvas.
  putChunk(i: number, d: Uint8ClampedArray, glints: number[]) {
    const c = document.createElement('canvas');
    c.width = CH; c.height = CH;
    c.getContext('2d')!.putImageData(new ImageData(d as Uint8ClampedArray<ArrayBuffer>, CH, CH), 0, 0);
    this.chunks[i] = c;
    if (glints.length) this.glints[i] = glints;
    const later = this.pending.get(i); // anything drawn here before it was painted
    if (later) { this.pending.delete(i); const ctx = c.getContext('2d')!; for (const f of later) f(ctx); }
  }
  private pending = new Map<number, ((ctx: CanvasRenderingContext2D) => void)[]>();
  private later(k: number, f: (ctx: CanvasRenderingContext2D) => void) { const q = this.pending.get(k); if (q) q.push(f); else this.pending.set(k, [f]); }

  // Fallback when workers aren't available.
  paintChunk(i: number) { const { d, glints } = this.chunkPixels(i); this.putChunk(i, d, glints); }

  finish() { this.pixel = null; this.ground = null; this.paintMinimap(); } // drop the painting tables (tens of MB)

  // The minimap: the playable rectangle, turned like the main view but not squashed, so it fills the whole
  // (square) box, painted at the size the side panel gives it (MINI).
  paintMinimap() {
    const M = MINI.s;
    this.minimap = document.createElement('canvas');
    this.minimap.width = M; this.minimap.height = M;
    const ctx = this.minimap.getContext('2d')!;
    const img = ctx.createImageData(M, M), d = img.data;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      let r = 0, g = 0, b = 0;
      for (let sI = 0; sI < 4; sI++) {
        const [gx, gy] = fromMini(x + 0.25 + (sI & 1) * 0.5, y + 0.25 + (sI >> 1) * 0.5, M);
        const cx = this.cellOf(gx), cy = this.cellOf(gy);
        let c = 0x0d0c0b;
        if (this.inside(cx, cy)) {
          const i = this.idx(cx, cy), t = this.type[i];
          c = t === T.ROAD ? 0x84704e : t === T.FIELD ? 0x6a7a3a : t === T.WATER ? 0x2e5266 : t === T.FORD ? 0x46706e : t === T.BRIDGE ? 0x7a6040 : t === T.SCRAP ? 0x7a5634 : t === T.DIRT ? 0x6e5a40 : t === T.ROCK ? 0x7c786c : this.forest[i] ? 0x2a4028 : 0x4c6a33;
          if (this.elev[i] === 2 && t === T.GRASS && !this.forest[i]) c = 0x63743e;
        }
        r += c >> 16; g += (c >> 8) & 255; b += c & 255;
      }
      const k = (y * M + x) * 4;
      d[k] = r / 4; d[k + 1] = g / 4; d[k + 2] = b / 4; d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Draw the ground for the view (view origin vx, vy in map pixels).
  draw(ctx: CanvasRenderingContext2D, vx: number, vy: number, w: number, h: number) {
    const c0 = Math.max(0, Math.floor(vx / CH)), c1 = Math.min(this.cw - 1, Math.floor((vx + w) / CH));
    const r0 = Math.max(0, Math.floor((vy - OY) / CH)), r1 = Math.min(this.chh - 1, Math.floor((vy + h - OY) / CH));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = this.chunks[r * this.cw + c]; if (k) ctx.drawImage(k, c * CH - vx, r * CH + OY - vy); }
  }

  // Paint something permanent into the ground at screen-space map pixel (sx, sy).
  // One pixel painted into the ground: it lies in exactly one chunk, so only that one is touched.
  private dotCtx: CanvasRenderingContext2D[] = [];
  dot(sx: number, sy: number, c: string) {
    const cx = Math.floor(sx / CH), cy = Math.floor((sy - OY) / CH);
    if (cx < 0 || cx >= this.cw || cy < 0) return;
    const k = cy * this.cw + cx, ch = this.chunks[k]; if (!ch) { const x = sx - cx * CH, y = sy - OY - cy * CH, col = c; this.later(k, (g) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }); return; }
    let ctx = this.dotCtx[k]; if (!ctx || ctx.canvas !== ch) ctx = this.dotCtx[k] = ch.getContext('2d')!; // chunks can be repainted
    ctx.fillStyle = c; ctx.fillRect(sx - cx * CH, sy - OY - cy * CH, 1, 1);
  }
  stamp(sx: number, sy: number, fn: (ctx: CanvasRenderingContext2D, x: number, y: number) => void) {
    const cx = Math.floor(sx / CH), cy = Math.floor((sy - OY) / CH);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (cx + dx < 0 || cx + dx >= this.cw || cy + dy < 0) continue;
      const k = (cy + dy) * this.cw + cx + dx, c = this.chunks[k], x = sx - (cx + dx) * CH, y = sy - OY - (cy + dy) * CH;
      if (!c) { if (k < this.cw * this.chh) this.later(k, (g) => fn(g, x, y)); continue; } // not painted yet: done when it is
      fn(c.getContext('2d')!, x, y);
    }
  }

  // A mountain's height at a ground point (0 at its foot, about 1.2 at the summit; -9 off any mountain):
  // a cone that steepens toward the top, with ridgelines running out from the summit and crags.
  mountainH(x: number, y: number) {
    const cx = x / CELL - 0.5, cy = y / CELL - 0.5;
    let best = -1, ang = 0;
    for (const [px, py, pr] of this.peaks) { const d = Math.hypot(cx - px, cy - py) / (pr * 1.05); if (d < 1.2 && 1 - d > best) { best = 1 - d; ang = Math.atan2(cy - py, cx - px); } }
    if (best < -0.5) return -9;
    const up = Math.max(0, best), ridge = Math.pow(1 - Math.abs(Math.sin(ang * 3 + vnoise(x, y, 30, 64) * 7)), 2);
    return Math.pow(up, 1.3) * 1.15 + up * ridge * 0.28 + (1 - Math.abs(vnoise(x, y, 18, 61) * 2 - 1)) * 0.12 + vnoise(x, y, 6, 62) * 0.04;
  }
  clearScrap(cx: number, cy: number) {
    const was = this.type[this.idx(cx, cy)];
    if (was !== T.SCRAP && was !== T.GRASS && was !== T.DIRT) return; // salvage picked off a road or field leaves it as it was
    this.type[this.idx(cx, cy)] = T.DIRT;
    const SOILS = ['#6e5a40', '#76624a', '#665238', '#5e4c34'];
    for (let gy = cy * CELL - 2; gy < (cy + 1) * CELL + 2; gy++) for (let gx = cx * CELL - 2; gx < (cx + 1) * CELL + 2; gx++) {
      const edge = gx < cx * CELL || gy < cy * CELL || gx >= (cx + 1) * CELL || gy >= (cy + 1) * CELL;
      if (edge && hash3(gx, 3, gy) < 0.5) continue;
      const [sx, sy] = toScreen(gx, gy), px = Math.round(sx), py = Math.round(sy - this.lift(gx, gy));
      this.stamp(px, py, (ctx, x, y) => { ctx.fillStyle = hash3(gx, 7, gy) < 0.05 ? '#8a5030' : SOILS[(hash3(gx, 5, gy) * 4) | 0]; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); });
    }
  }

  // Tread marks: two dark lines pressed into soft ground. Each pass darkens them a little, until the ground there is worn in
  // (a few passes: worn counts marks per 4-pixel patch of ground) and they stop: past that, a busy route went near-black
  // and looked just like a road that went nowhere.
  worn = new Uint8Array(0);
  track(px: number, py: number, angle: number, half: number) {
    const i = this.idx(this.cellOf(px), this.cellOf(py)), t = this.type[i];
    if (t === T.WATER || t === T.BRIDGE || t === T.FORD) return;
    const side = MAP >> 2, w = Math.max(0, Math.min(side - 1, px >> 2)) + Math.max(0, Math.min(side - 1, py >> 2)) * side;
    if (!this.worn.length) this.worn = new Uint8Array(side * side);
    if (this.worn[w] >= 16) return;
    this.worn[w]++;
    const [qx, qy] = toScreen(px, py);
    const sx = Math.round(qx), sy = Math.round(qy - this.lift(px, py)), a = angle + YAW;
    const ox = -Math.sin(a) * half, oy = Math.cos(a) * half;
    this.stamp(sx, sy, (ctx, x, y) => {
      ctx.fillStyle = t === T.DIRT || t === T.SCRAP ? 'rgba(40,28,16,0.06)' : 'rgba(30,38,18,0.06)';
      ctx.fillRect(Math.round(x + ox), Math.round(y + oy), 1, 1);
      ctx.fillRect(Math.round(x - ox), Math.round(y - oy), 1, 1);
    });
  }
}

export function shadeHex(c: number, k: number) {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}
