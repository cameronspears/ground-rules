// The map: 256 x 256 cells of 24 pixels (about 7 m each), so roughly 1.8 km across.
// Cells say what the ground is and how high (low, ramp, high plateau). The ground is painted
// pixel by pixel into big canvases once at load, with ragged natural edges, and then marked as
// the battle goes on: tank tracks, stumps, fallen trees.
import { hash3 } from './voxel';

// The map's size (in cells) is picked on the title screen and stored; the background painters are
// told it through their worker name, since they can't read storage.
export const SIZES = [192, 256, 320];
function mapSize() {
  try {
    if (typeof localStorage !== 'undefined') { const v = Number(localStorage.getItem('conquer-size')); if (SIZES.includes(v)) return v; }
    else { const m = /^n=(\d+)$/.exec((self as unknown as { name: string }).name ?? ''); if (m && SIZES.includes(Number(m[1]))) return Number(m[1]); }
  } catch {}
  return 256;
}
export const CELL = 24, N = mapSize(), MAP = CELL * N, LIFT = 8; // LIFT: pixels per elevation step
export const ROAD_DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // the eight neighbours, in order round
export const enum T { GRASS, DIRT, SCRAP, WATER, BRIDGE, FORD, ROCK, ROAD, FIELD, PAVED } // PAVED: road laid during the game
const CH = 512, OY = -24; // chunk size; the painted area starts a little above row 0 for raised ground

// The map is turned a little on screen so buildings show two sides. Ground (x, y) -> screen (sx, sy).
export const YAW = (18 * Math.PI) / 180, YC = Math.cos(YAW), YS = Math.sin(YAW);
const SX0 = YS * MAP; // keeps screen x positive
export const SW = Math.ceil((YC + YS) * MAP), SH = Math.ceil((YC + YS) * MAP);
export function toScreen(gx: number, gy: number): [number, number] { return [YC * gx - YS * gy + SX0, YS * gx + YC * gy]; }
export function toGround(sx: number, sy: number): [number, number] { const x = sx - SX0; return [YC * x + YS * sy, -YS * x + YC * sy]; }

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
  roadBy = new Int8Array(N * N).fill(-1); // which side paved each road square (-1: nobody)
  scrap = new Uint16Array(N * N);
  chunks: HTMLCanvasElement[] = [];
  // The map changes during a game. Those changes are painted in the background as layers: 'ice' paints
  // only the water (as ice; everything else left clear) for winter, drawn over the map while it lasts;
  // 'drain' paints only the drained lakes (as mud), baked into the map for good.
  paintMode: null | 'ice' | 'drain' | 'patch' = null; patchMask = new Set<number>(); bridgeCols: number[] = []; // patch: repaint just these squares as they now are (a fallen or rebuilt bridge)
  drained = new Set<number>(); // lakes whose dam has gone
  ice: (HTMLCanvasElement | undefined)[] = []; showIce = false;
  // Where a dam's stream runs: like water, downhill along the cheapest way to other water (a river,
  // another lake, a pond, the moat) or off the map's edge, round plateaus and over nothing built.
  // The route's corners are then rounded off and it's laid square by square with no gaps.
  flowFrom(lk: number[], dx: number, dy: number, ux: number, uy: number, free: (x: number, y: number) => boolean): { pts: P[]; cells: [number, number][] } | null {
    const H = this.height, own = (x: number, y: number) => Math.hypot(x - lk[0], y - lk[1]) < lk[2] * 1.4 + 4; // (its own lake's water is no place to end)
    const goal = (x: number, y: number) => { if (x <= 1 || y <= 1 || x >= N - 2 || y >= N - 2) return true; const q = this.type[this.idx(x, y)]; return (q === T.WATER || (q === T.FORD && !this.streamUnder.has(this.idx(x, y)))) && !own(x, y); };
    const ox = dx - 0.5, oy = dy - 0.5, sx = Math.round(ox + ux * 4), sy = Math.round(oy + uy * 4); // it runs straight out for a few squares before it may turn
    for (let k = 2; k <= 4; k++) if (!free(Math.round(ox + ux * k), Math.round(oy + uy * k))) return null;
    // the search keeps a heading too, so turns cost: water bends gently, it doesn't zigzag
    const D8: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], d0 = D8.findIndex(([a, b]) => a === ux && b === uy);
    const st0 = (this.idx(sx, sy) * 8 + d0) * 3, g = new Map<number, number>([[st0, 0]]), from = new Map<number, number>(), heap: number[] = [st0], hf: number[] = [0];
    const push = (i: number, f: number) => { heap.push(i); hf.push(f); for (let k = heap.length - 1; k > 0;) { const q = (k - 1) >> 1; if (hf[q] <= hf[k]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; [hf[q], hf[k]] = [hf[k], hf[q]]; k = q; } };
    const pop = () => { const top = heap[0], li = heap.pop()!, lf = hf.pop()!; if (heap.length) { heap[0] = li; hf[0] = lf; for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
    let end = -1, endFrom = -1, n = 0;
    const done = new Set<number>();
    while (heap.length && n++ < 150000 && end < 0) {
      const cur = pop(); if (done.has(cur)) continue; done.add(cur);
      const cool = cur % 3, ci = Math.floor(cur / 24), cd = Math.floor(cur / 3) % 8, cx = ci % N, cy = (ci / N) | 0;
      for (const turn of cool ? [0] : [0, 1, -1]) { // straight on, or an eighth of a turn once it has run straight for two squares: water sweeps round, it never turns a corner
        const nd = (cd + turn + 8) % 8, [ex, ey] = D8[nd], x = cx + ex, y = cy + ey; if (!this.inside(x, y)) continue;
        const ni = this.idx(x, y);
        if (goal(x, y)) { end = ni; endFrom = cur; break; }
        if (!free(x, y) || (ex && ey && (!free(cx + ex, cy) || !free(cx, cy + ey)))) continue; // no squeezing between corners
        const ns = (ni * 8 + nd) * 3 + (turn ? 2 : Math.max(0, cool - 1)), ng = g.get(cur)! + (ex && ey ? 1.414 : 1) + (turn ? 0.6 : 0) + 8 * Math.max(0, H[ni] - H[ci]) + 0.4 * H[ni]; // water won't climb, keeps low, bends gently
        if (ng < (g.get(ns) ?? 1e9)) { g.set(ns, ng); from.set(ns, cur); push(ns, ng); }
      }
    }
    if (end < 0) return null;
    const raw: P[] = [[end % N, (end / N) | 0]]; for (let c: number | undefined = endFrom; c !== undefined; c = from.get(c)) { const ci = Math.floor(c / 24); raw.push([ci % N, (ci / N) | 0]); } raw.reverse();
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
  // a layer back from the painters: ice is kept aside, a drained lake is baked in
  putLayer(i: number, d: Uint8ClampedArray, mode: 'ice' | 'drain' | 'patch') {
    const c = document.createElement('canvas');
    c.width = CH; c.height = CH;
    c.getContext('2d')!.putImageData(new ImageData(d as Uint8ClampedArray<ArrayBuffer>, CH, CH), 0, 0);
    if (mode === 'ice') this.ice[i] = c;
    else if (this.chunks[i]) this.chunks[i].getContext('2d')!.drawImage(c, 0, 0);
  }
  cw = Math.ceil(SW / CH); chh = Math.ceil((SH - OY) / CH);
  minimap: HTMLCanvasElement;
  trees: P[] = [];
  glints: number[][] = []; // per chunk: x, y pairs of open-water pixels that sparkle
  bases: P[] = [];
  roadLines: P[][] = []; // dirt roads between bases, villages and crossings (cell coordinates); cars drive them
  villages: P[] = [];
  rivers: P[][] = [];
  island = 13; gates: number[] = []; // the citadel's radius, in squares, and the directions of its gates
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

  idx(cx: number, cy: number) { return cy * N + cx; }
  cellOf(px: number) { return Math.floor(px / CELL); }
  inside(cx: number, cy: number) { return cx >= 0 && cy >= 0 && cx < N && cy < N; }
  elevAt(px: number, py: number) { const cx = this.cellOf(px), cy = this.cellOf(py); return this.inside(cx, cy) ? this.elev[this.idx(cx, cy)] : 0; }
  lift(px: number, py: number) { return this.elevAt(px, py) * LIFT; }

  // Can a unit stand in this cell? Crushers (tanks) may drive into forest and flatten it.
  // crush: true for tanks (may flatten forest), 2 for hovercraft (may cross water, not forest)
  open(cx: number, cy: number, crush: boolean | 2) {
    if (!this.inside(cx, cy)) return false;
    const i = this.idx(cx, cy), t = this.type[i];
    if (t === T.ROCK || this.occupied[i]) return false;
    if (t === T.WATER) return crush === 2;
    return crush === true || !this.forest[i];
  }
  step(ax: number, ay: number, bx: number, by: number, crush: boolean | 2) {
    return this.open(bx, by, crush) && Math.abs(this.elev[this.idx(ax, ay)] - this.elev[this.idx(bx, by)]) <= 1;
  }

  // ------------------------------------------------------------ layout
  // A new map from the seed every game, mirrored through the centre so neither side is favoured:
  // a river splits the map with only a few crossings, an island in the middle with the richest
  // prize, rocky ridges with narrow passes, plateaus, villages linked by roads, scrap fields and
  // capture sites in mirrored pairs.
  generate() {
    const R = rng(this.seed), r = (a: number, b: number) => a + R() * (b - a), S = Math.abs(this.seed) % 997; // small: big seeds break the noise
    const four = this.players > 2, C: P = [N / 2 - 0.5, N / 2 - 0.5];
    // Symmetry: a duel map is mirrored through the centre; a map for three or four is turned four ways.
    const M = (p: P): P => [N - 1 - p[0], N - 1 - p[1]], Rot = (p: P): P => [N - 1 - p[1], p[0]];
    const orbit = (p: P): P[] => (four ? [p, Rot(p), M(p), Rot(M(p))] : [p, M(p)]);
    this.orbit = orbit;
    // the one square in each symmetric set used for "random" choices, so all copies choose alike
    const canon = (x: number, y: number) => { let bx = x, by = y; for (const [a, b] of orbit([x, y])) if (b * N + a < by * N + bx) { bx = a; by = b; } return [bx, by]; };
    const ch = (x: number, y: number, k: number) => { const [a, b] = canon(x, y); return hash3(a, k + S, b); };
    // symmetric noise: averaged over the symmetric copies, so it matches everywhere and stays smooth
    const sn = (x: number, y: number, s: number, k: number) => { const pts = orbit([x, y]); let v = 0; for (const [a, b] of pts) v += vnoise(a, b, s, k + S); return Math.max(0, Math.min(1, 0.5 + (v / pts.length - 0.5) * (four ? 2.3 : 1.7))); };
    const b0: P = [Math.round(r(18, 28)), Math.round(N - 1 - r(18, 28))];
    this.bases = orbit(b0);
    const dBase = (x: number, y: number) => Math.min(...this.bases.map(([bx, by]) => Math.hypot(x - bx, y - by)));
    // rivers: a duel has one, corner to corner between the bases; four players get a cross that
    // splits the map into four quarters. Both meet at the island in the middle.
    const half: P[] = [four ? [-3, C[1] + r(-N * 0.08, N * 0.08)] : [-3, r(N * 0.05, N * 0.25)]];
    for (let k = 1; k < 5; k++) {
      const f = k / 5, [sx, sy] = half[0], j = r(-1, 1) * N * 0.06;
      half.push([sx + (C[0] - sx) * f + j * 0.7, sy + (C[1] - sy) * f - j * 0.7]);
    }
    half.push(C);
    half.splice(0, half.length, ...smoothLine(half, 3)); // a river bends in curves, never corners (ends kept, so the halves meet straight through the middle)
    this.rivers = four ? [0, 1, 2, 3].map((k) => half.map((p) => orbit(p)[k])) : [[...half, ...half.slice(0, -1).reverse().map(M)]];
    const riverD = (x: number, y: number) => Math.min(...this.rivers.map((rv) => lineDist(x, y, rv)[0]));
    // crossings: bridges (duels only: straight decks) and fords, all in symmetric sets
    const along = (f: number): P => { const i = Math.min(half.length - 2, Math.floor(f * (half.length - 1))), t = f * (half.length - 1) - i; return [half[i][0] + (half[i + 1][0] - half[i][0]) * t, half[i][1] + (half[i + 1][1] - half[i][1]) * t]; };
    const bridges = four ? [] : [Math.round(along(0.3)[0]), N - 2 - Math.round(along(0.3)[0])];
    this.bridgeCols = bridges;
    const fords: P[] = four ? [...orbit(along(0.3)), ...orbit(along(0.66))] : orbit(along(0.62));
    this.fordPts = fords;
    const island = 13; this.island = island; // the citadel: a big island with a moat, a wide gate facing each side
    const gates = this.gates = this.bases.flatMap(([bx, by]) => { const a = Math.atan2(by - C[1], bx - C[0]); return [a - 0.42, a + 0.42]; });
    const gate = (x: number, y: number) => { const a = Math.atan2(y - C[1], x - C[0]), dc = Math.hypot(x - C[0], y - C[1]); return gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) * dc < 2.6); };
    // ponds
    const ponds: [number, number, number][] = [];
    for (let k = 0; k < 600 && ponds.length < (four ? 8 : 4); k++) {
      const x = r(20, N - 20), y = r(20, N - 20), rad = r(3, 6);
      if (dBase(x, y) < 30 || riverD(x, y) < rad + 10 || orbit([x, y]).some(([a, b]) => ponds.some(([px, py]) => Math.hypot(px - a, py - b) < 30))) continue;
      for (const [a, b] of orbit([x, y])) ponds.push([a, b, rad]);
    }
    // big lakes and mountain massifs: a symmetric set of each, clear of bases, rivers, the middle and each other
    const lakes: number[][] = [], peaks: [number, number, number][] = [];
    const clear = (x: number, y: number, rad: number) => dBase(x, y) > rad + 26 && riverD(x, y) > rad + 9 && Math.hypot(x - C[0], y - C[1]) > rad + 22 && x > rad + 6 && y > rad + 6 && x < N - rad - 7 && y < N - rad - 7
      && orbit([x, y]).every(([a, b]) => [...lakes, ...peaks, ...ponds].every(([px, py, pr]) => Math.hypot(px - a, py - b) > pr + rad + 10));
    { // lakes (each with a dam) go where the action is: partway out from the middle, close to the routes between bases
      let best: number[] | null = null, bs = -1e9;
      for (let k = 0; k < 900; k++) {
        const rad = r(13, 18), x = r(20, N - 20), y = r(20, N - 20);
        if (!clear(x, y, rad)) continue;
        const dc = Math.hypot(x - C[0], y - C[1]), route = Math.min(...this.bases.map(([bx, by]) => lineDist(x, y, [[bx, by], C])[0]));
        const score = -Math.abs(dc - N * 0.26) * 0.6 - Math.max(0, route - rad - 6) * 1.2 + r(0, 4);
        if (score > bs) { bs = score; best = [x, y, rad]; }
      }
      if (best) { const ph = [r(0, 6.28), r(0, 6.28), r(0, 6.28)]; orbit([best[0], best[1]]).forEach(([a, b], o) => lakes.push([a, b, best![2], o * (four ? Math.PI / 2 : Math.PI), ...ph])); }
    }
    for (let k = 0; k < 800 && peaks.length < (four ? 8 : 4); k++) { const rad = r(9, 14), x = r(20, N - 20), y = r(20, N - 20); if (clear(x, y, rad)) for (const [a, b] of orbit([x, y])) peaks.push([a, b, rad]); }
    this.lakes = lakes; this.peaks = peaks;
    // scrap: a field near each base, symmetric sets out in the open, and the rich island in the middle
    const fields: [number, number, number, number][] = []; // x, y, radius, richness
    { const a = Math.atan2(C[1] - b0[1], C[0] - b0[0]) + r(-0.9, 0.9), d = r(13, 16); for (const [x, y] of orbit([b0[0] + Math.cos(a) * d, b0[1] + Math.sin(a) * d])) fields.push([x, y, 5, 1]); }
    for (let k = 0; k < 1000 && fields.length < (four ? 18 : 12); k++) {
      const x = r(10, N - 10), y = r(10, N - 10), rad = r(3.5, 5.5);
      if (dBase(x, y) < 24 || riverD(x, y) < rad + 4 || orbit([x, y]).some(([a, b]) => fields.some(([fx, fy]) => Math.hypot(fx - a, fy - b) < 22)) || [...ponds, ...lakes, ...peaks].some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + rad + 3)) continue;
      const rich = 1 + Math.min(1, (dBase(x, y) - 24) / (N * 0.4)) * 0.6; // further from home, richer
      for (const [a, b] of orbit([x, y])) fields.push([a, b, rad, rich]);
    }
    fields.push([C[0], C[1], 4.5, 2.2]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y), db = dBase(x, y), dr = riverD(x, y);
      const hw = 1.8 + sn(x, y, 11, 4) * 1.8, dc = Math.hypot(x - C[0], y - C[1]);
      this.riverHW[i] = hw;
      let t = T.GRASS;
      if (sn(x, y, 13, 6) > 0.74 || db < 7) t = T.DIRT;
      if ((dr < hw || dc < island + 3) && dc >= island) {
        t = T.WATER;
        if (bridges.includes(x) || bridges.includes(x - 1)) t = T.BRIDGE;
        else if (fords.some(([fx, fy]) => Math.hypot(x - fx, y - fy) < 3.5) || (dc < island + 3 && gate(x, y))) t = T.FORD; // wide shallow gates across the moat
      }
      for (const [px, py, pr] of ponds) if (Math.hypot(x - px, y - py) < pr * (0.8 + sn(x, y, 4, 12) * 0.4)) t = T.WATER;
      for (const lk of lakes) if (Math.hypot(x - lk[0], y - lk[1]) < shoreR(lk, Math.atan2(y - lk[1], x - lk[0]))) t = T.WATER; // lakes, with smooth wavy shores
      for (const [sx, sy, sr, rich] of fields)
        if (t !== T.WATER && t !== T.BRIDGE && t !== T.FORD && Math.hypot(x - sx, y - sy) < sr * (0.75 + sn(x, y, 3, 8) * 0.5)) { t = T.SCRAP; this.scrap[i] = Math.round((300 + ch(x, y, 1) * 400) * rich); }
      if (t === T.GRASS && db > 14 && dr > 5 && ch(x, y, 2) < 0.004) t = T.ROCK; // scattered rocks
      this.type[i] = t;
      let e = 0;
      if (sn(x, y, 30, 5) > 0.64 && db > 20 && dr > 6 && dc > island + 4 && x > 3 && y > 3 && x < N - 4 && y < N - 4 && t !== T.SCRAP && t !== T.WATER && lakes.every((lk) => Math.hypot(x - lk[0], y - lk[1]) > lk[2] * 1.9)) e = 2; // (lakes lie in low ground, never sunk in a plateau)
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
      const x = r(10, N - 10), y = r(10, N - 10);
      if (dBase(x, y) < 26 || riverD(x, y) < 10) continue;
      const a = r(0, Math.PI * 2), len = r(26, 50), pts: P[] = [[x, y]];
      for (let s = 1; s <= 3; s++) { const b = a + r(-0.5, 0.5); pts.push([pts[s - 1][0] + Math.cos(b) * len / 3, pts[s - 1][1] + Math.sin(b) * len / 3]); }
      if (pts.some(([px, py]) => dBase(px, py) < 22 || riverD(px, py) < 8 || px < 3 || py < 3 || px > N - 4 || py > N - 4)) continue;
      const gap = r(0.35, 0.65), pieces: P[][] = [pts.slice(0, 2).concat([lerp(pts[1], pts[2], gap - 0.12)]), [lerp(pts[1], pts[2], gap + 0.12), ...pts.slice(2)]];
      for (const pc of pieces) for (let o = 0; o < orbit(pc[0]).length; o++) ridges.push(pc.map((p) => orbit(p)[o]));
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y), t = this.type[i];
      if (t === T.WATER || t === T.BRIDGE || t === T.FORD || t === T.SCRAP) continue;
      for (const rd of ridges) if (lineDist(x, y, rd)[0] < 1.3 + sn(x, y, 5, 14) * 1.1) { this.type[i] = T.ROCK; this.elev[i] = 2; break; }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { // mountain massifs: impassable rock
      const i = this.idx(x, y), t = this.type[i];
      if (t === T.WATER || t === T.BRIDGE || t === T.FORD) continue;
      for (const [px, py, pr] of peaks) if (Math.hypot(x - px, y - py) < pr * (0.65 + sn(x, y, 6, 23) * 0.6)) { this.type[i] = T.ROCK; this.elev[i] = 2; this.scrap[i] = 0; break; }
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
    const freeAll = (x: number, y: number, water = false) => orbit([x, y]).every(([a, b]) => { if (!this.inside(a, b)) return false; const ii = this.idx(a, b), w = this.type[ii]; return !this.occupied[ii] && w !== T.ROCK && (water || w !== T.WATER) && w !== T.BRIDGE && w !== T.FORD && this.elev[ii] === 0 && dBase(a, b) > 20; });
    // a whole candidate for the first lake of a set, or null: dam, channel back to the lake, stream on below
    const plan = (lk: number[], ux: number, uy: number, s2: number) => {
      const sr = shoreR(lk, Math.atan2(uy, ux)), dx = Math.round(lk[0] + ux * (sr + s2)), dy = Math.round(lk[1] + uy * (sr + s2));
      for (const [x, y] of [[dx - 1, dy - 1], [dx, dy - 1], [dx - 1, dy], [dx, dy]]) if (!freeAll(x, y)) return null;
      const ch = { ax: lk[0] + ux * (sr - 2.5), ay: lk[1] + uy * (sr - 2.5), bx: dx - 0.5 - ux * 1.1, by: dy - 0.5 - uy * 1.1 }; // ends against the dam's upstream face
      for (let y = Math.floor(Math.min(ch.ay, ch.by) - 3); y <= Math.max(ch.ay, ch.by) + 3; y++) for (let x = Math.floor(Math.min(ch.ax, ch.bx) - 3); x <= Math.max(ch.ax, ch.bx) + 3; x++) if (this.inside(x, y) && this.inChannel(ch, x, y, 0) > 0 && !freeAll(x, y, true)) return null; // a channel only through open ground
      const flow = this.flowFrom(lk, dx, dy, ux, uy, freeAll); // the stream: downhill to other water
      return flow ? { dx, dy, ch, pts: flow.pts, scells: flow.cells } : null;
    };
    for (let k0 = 0; k0 + setSize <= this.lakes.length; k0 += setSize) {
      const lk = this.lakes[k0], a0 = Math.atan2(C[1] - lk[1], C[0] - lk[0]) / (Math.PI / 2), q0 = Math.round(a0), q1 = a0 > q0 ? q0 + 1 : q0 - 1;
      // every side is tried; the outlet whose stream runs most downhill wins (the side facing the middle breaks ties)
      let best: ReturnType<typeof plan> = null, ux = 0, uy = 0, bs = 1e9;
      [q0, q1, q0 + 2, q1 + 2].forEach((q, rank) => {
        const vx = Math.round(Math.cos(q * Math.PI / 2)), vy = Math.round(Math.sin(q * Math.PI / 2));
        const bendsOf = (q: NonNullable<ReturnType<typeof plan>>) => { let b2 = 0; const P2 = q.pts; for (let k = 2; k < P2.length - 2; k++) { const ax = P2[k][0] - P2[k - 2][0], ay = P2[k][1] - P2[k - 2][1], bx = P2[k + 2][0] - P2[k][0], by = P2[k + 2][1] - P2[k][1]; if ((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1) < 0.5) b2++; } return b2; };
        let c: ReturnType<typeof plan> = null, s2 = 2.5; for (; s2 < 9 && !c; s2 += 0.5) c = plan(lk, vx, vy, s2);
        for (let tries = 0; c && bendsOf(c) && tries < 3 && s2 < 11; tries++, s2 += 1.5) { const c2 = plan(lk, vx, vy, s2); if (c2 && !bendsOf(c2)) c = c2; } // a bend after the dam? try it a little further out
        if (!c) return;
        let bends = 0; const P2 = c.pts; for (let k = 2; k < P2.length - 2; k++) { const ax = P2[k][0] - P2[k - 2][0], ay = P2[k][1] - P2[k - 2][1], bx = P2[k + 2][0] - P2[k][0], by = P2[k + 2][1] - P2[k][1]; if ((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1) < 0.5) bends++; } // sharp bends count against it
        let lo = 1e9, climb = 0; for (const [x, y] of c.pts) { const h = this.height[this.idx(Math.round(x), Math.round(y))]; climb += Math.max(0, h - lo); lo = Math.min(lo, h); }
        const score = climb * 10 + bends * 50 + rank * 0.8 + c.pts.length * 0.01;
        if (score < bs) { bs = score; best = c; ux = vx; uy = vy; }
      });
      if (!best) continue;
      { // what rise is left, the stream wears down: its bed (and a little either side) never stands above the water upstream
        let lo = 1e9; for (const [x, y] of (best as NonNullable<ReturnType<typeof plan>>).pts) { const cx = Math.round(x), cy = Math.round(y); for (const [a, b] of orbit([cx, cy])) { const i = this.idx(a, b); lo = Math.min(lo, this.height[i]); } for (const [a, b] of orbit([cx, cy])) for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) if (this.inside(a + ex, b + ey)) { const i = this.idx(a + ex, b + ey); if (this.height[i] > lo) this.height[i] = ex || ey ? (this.height[i] + lo) / 2 : lo; } }
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
    this.layoutSettlements(R, bridges, fords, C, riverD);
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
    // forests
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
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
      if (Math.min(...this.bases.map(([bx, by]) => Math.hypot(cx - bx, cy - by))) < 14) continue;
      let ok = true;
      for (const [ox, oy] of set) for (let y = oy - 1; y <= oy + 1; y++) for (let x = ox - 1; x <= ox + 1; x++) { if (!this.inside(x, y)) { ok = false; continue; } const i = this.idx(x, y), t = this.type[i]; if ((t !== T.GRASS && t !== T.DIRT) || this.occupied[i] || this.forest[i] || this.elev[i] === 1) ok = false; }
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
  layoutSettlements(R: () => number, bridges: number[], fords: P[], C: P, riverD: (x: number, y: number) => number) {
    const wet = (t: number) => t === T.WATER || t === T.BRIDGE || t === T.FORD, orbit = this.orbit;
    const r = (a: number, b: number) => a + R() * (b - a), b0 = this.bases[0];
    const dBase = (x: number, y: number) => Math.min(...this.bases.map(([bx, by]) => Math.hypot(x - bx, y - by)));
    // villages in mirrored pairs, on dry open ground
    const vs: P[] = [];
    for (let k = 0; k < 600 && vs.length < 4; k++) {
      const x = Math.round(r(12, N - 12)), y = Math.round(r(12, N - 12)), t = this.type[this.idx(x, y)];
      const set = orbit([x, y]);
      if (dBase(x, y) < 28 || t === T.WATER || t === T.ROCK || t === T.SCRAP || riverD(x, y) < 8 || set.some(([a, b], i) => i > 0 && Math.hypot(a - x, b - y) < 30)) continue;
      if (vs.flatMap((v) => orbit(v)).some(([vx, vy]) => set.some(([a, b]) => Math.hypot(vx - a, vy - b) < 26))) continue;
      vs.push([x, y]);
    }
    this.villages = vs.flatMap((v) => orbit(v));
    // roads: from your base to the two nearest villages, from each village to its nearest crossing; all mirrored
    const crossings: P[] = [...bridges.map((bx): P => { const ys: number[] = []; for (let y = 0; y < N; y++) if (this.type[this.idx(bx, y)] === T.BRIDGE) ys.push(y); return [bx + 1, ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : C[1]]; }), ...fords, C];
    const bend = (a: P, b: P): P[] => { const mx = (a[0] + b[0]) / 2 + r(-4, 4), my = (a[1] + b[1]) / 2 + r(-4, 4); return [a, [mx, my], b]; };
    const lines: P[][] = [];
    for (const v of [...this.villages].sort((a, c) => Math.hypot(a[0] - b0[0], a[1] - b0[1]) - Math.hypot(c[0] - b0[0], c[1] - b0[1])).slice(0, 2)) lines.push(bend(b0, v));
    { // roads into the citadel: from the nearest village to each gate, through the shallows, on to a ring round the uplink
      const isl = this.island, at = (a: number, d: number): P => [C[0] + Math.cos(a) * d, C[1] + Math.sin(a) * d];
      for (const g of this.gates.slice(0, 2)) { // the first side's two gates; the symmetric copies follow
        const out = at(g, isl + 6), v = this.villages.slice().sort((p, q) => Math.hypot(p[0] - out[0], p[1] - out[1]) - Math.hypot(q[0] - out[0], q[1] - out[1]))[0];
        lines.push([...(v && Math.hypot(v[0] - out[0], v[1] - out[1]) < N * 0.3 ? bend(v, out) : [out]), at(g, isl - 2), at(g, 3.6)]);
      }
      lines.push(Array.from({ length: 17 }, (_, k) => at((k / 16) * Math.PI * 2, 3.6))); // the ring
    }
    // which bank of a river a point is on
    const sideOf = (rv: P[], p: P) => { let best = 1e9, sgn = 0; for (let k = 0; k < rv.length - 1; k++) { const [ax, ay] = rv[k], [cx, cy] = rv[k + 1], dx = cx - ax, dy = cy - ay, t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy))), d = Math.hypot(p[0] - ax - dx * t, p[1] - ay - dy * t); if (d < best) { best = d; sgn = Math.sign(dx * (p[1] - ay) - dy * (p[0] - ax)); } } return sgn; };
    // every ford carries a track straight across the river, from the nearest village on each bank (laid for one ford of each set; the copies follow)
    const setSize = orbit([0, 0]).length;
    for (let k = 0; k < fords.length; k += setSize) {
      const f = fords[k], rv = this.rivers.slice().sort((a, b) => lineDist(f[0], f[1], a)[0] - lineDist(f[0], f[1], b)[0])[0];
      let seg = [0, 1] as [number, number], best = 1e9;
      for (let s = 0; s < rv.length - 1; s++) { const d = lineDist(f[0], f[1], [rv[s], rv[s + 1]])[0]; if (d < best) { best = d; seg = [rv[s + 1][0] - rv[s][0], rv[s + 1][1] - rv[s][1]]; } }
      const L = Math.hypot(seg[0], seg[1]) || 1, px = -seg[1] / L, py = seg[0] / L, A: P = [f[0] - px * 7, f[1] - py * 7], B: P = [f[0] + px * 7, f[1] + py * 7];
      const nearest = (end: P) => this.villages.filter((v) => sideOf(rv, v) === sideOf(rv, end)).sort((a, b) => Math.hypot(a[0] - end[0], a[1] - end[1]) - Math.hypot(b[0] - end[0], b[1] - end[1]))[0];
      const va = nearest(A), vb = nearest(B);
      lines.push([...(va ? bend(va, A) : [A]), f, ...(vb ? bend(B, vb) : [B])]);
    }
    // ...and every bridge carries a road straight across: down onto the deck from the nearest village
    // on each bank, and straight off the far end (laid for one bridge; its mirror gets the copy)
    if (bridges.length) {
      const bx = bridges[0], rows: number[] = [];
      for (let y = 0; y < N; y++) if (this.type[this.idx(bx, y)] === T.BRIDGE) rows.push(y);
      if (rows.length) {
        const y0 = rows[0], y1 = rows[rows.length - 1], x = bx + 0.5, rv = this.rivers[0];
        const side = (p: P) => { let best = 1e9, sgn = 0; for (let k = 0; k < rv.length - 1; k++) { const [ax, ay] = rv[k], [cx, cy] = rv[k + 1], dx = cx - ax, dy = cy - ay, t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy))), d = Math.hypot(p[0] - ax - dx * t, p[1] - ay - dy * t); if (d < best) { best = d; sgn = Math.sign(dx * (p[1] - ay) - dy * (p[0] - ax)); } } return sgn; };
        const nearest = (end: P) => this.villages.filter((v) => side(v) === side(end)).sort((a, b) => Math.hypot(a[0] - end[0], a[1] - end[1]) - Math.hypot(b[0] - end[0], b[1] - end[1]))[0];
        const top: P = [x, y0 - 6], bottom: P = [x, y1 + 6], vn = nearest(top), vsth = nearest(bottom);
        lines.push(vn ? [...bend(vn, top), [x, y0]] : [top, [x, y0]]);
        lines.push(vsth ? [[x, y1], ...bend(bottom, vsth)] : [[x, y1], bottom]);
      }
    }
    // tracks never run through water: a stretch that would is re-laid on the ground round it (hugging
    // the shore), crossing rivers only where there's a ford, a bridge or a citadel gate
    const wetAt = (x: number, y: number) => { const cx = Math.round(x), cy = Math.round(y); if (!this.inside(cx, cy)) return true; const q = this.type[this.idx(cx, cy)]; return q === T.WATER; };
    const near = (x: number, y: number) => wetAt(x, y) || wetAt(x + 1, y) || wetAt(x - 1, y) || wetAt(x, y + 1) || wetAt(x, y - 1) || stream(x, y); // a track is about a square wide (and only fords a stream on purpose)
    const crossing = (x: number, y: number) => { const cx = Math.round(x), cy = Math.round(y); if (!this.inside(cx, cy)) return false; const i = this.idx(cx, cy), q = this.type[i]; return (q === T.FORD && !this.streamUnder.has(i)) || q === T.BRIDGE; };
    // the stream a point touches (any stream square within three quarters of a square), or -1: by distance, not rounding, so twins agree
    const streamAt = (x: number, y: number) => { for (let cy = Math.floor(y); cy <= Math.floor(y) + 1; cy++) for (let cx = Math.floor(x); cx <= Math.floor(x) + 1; cx++) if (this.inside(cx, cy) && Math.hypot(cx - x, cy - y) <= 0.75 && this.streamUnder.has(this.idx(cx, cy))) { const i = this.idx(cx, cy); return this.streams.findIndex((q) => q.cells.includes(i)); } return -1; };
    const stream = (x: number, y: number) => streamAt(x, y) >= 0;
    const bank = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.inside(x + dx, y + dy) && this.streamUnder.has(this.idx(x + dx, y + dy))) return true; return false; };
    const clearSeg = (a: P, b: P) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); for (let k = 0; k <= n; k++) { const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n; if (!crossing(x, y) && near(x, y)) return false; } return true; };
    const dryNear = (p: P): P => { for (let r = 0; r < 12; r++) for (let a = 0; a < 16; a++) { const x = Math.round(p[0] + Math.cos((a / 16) * Math.PI * 2) * r), y = Math.round(p[1] + Math.sin((a / 16) * Math.PI * 2) * r); if (this.inside(x, y) && (crossing(x, y) || !near(x, y))) return [x, y]; } return p; };
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
      const line = lines[li].map((p) => (!crossing(p[0], p[1]) && near(p[0], p[1]) ? dryNear(p) : p)), out: P[] = [line[0]]; // no point of a track sits in the water
      for (let k = 1; k < line.length; k++) { const a = out[out.length - 1], b = line[k]; if (clearSeg(a, b)) { out.push(b); continue; } const r = around(a, b); if (r) out.push(...r); else out.push(b); }
      // a road fords a stream once: if its pieces would weave back and forth across one, it's laid again as a single route
      const fords = new Map<number, number>(); let inside = -1;
      for (let k = 1; k < out.length; k++) { const [ax, ay] = out[k - 1], [bx, by] = out[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3); for (let j = 0; j <= n; j++) { const st = streamAt(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n); if (st >= 0 && st !== inside) fords.set(st, (fords.get(st) ?? 0) + 1); inside = st; } }
      if ([...fords.values()].some((c) => c > 1)) { const r = around(out[0], out[out.length - 1]); if (r) { lines[li] = [out[0], ...r]; continue; } }
      lines[li] = out;
    }
    this.roadLines = lines.flatMap((l) => orbit(l[0]).map((_, o) => l.map((p) => orbit(p)[o])));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y);
      let d = 1e9;
      for (const line of this.roadLines) d = Math.min(d, lineDist(x, y, line)[0]);
      if (d < 3 && !wet(this.type[i])) this.elev[i] = 0;          // roads run on level ground (and cut passes through ridges)
      if (d < 1.1 && !wet(this.type[i])) { this.type[i] = T.ROAD; this.scrap[i] = 0; }
      if ((this.nearVillage(x, y, 7) || dBase(x, y) < 9) && !wet(this.type[i])) { // villages and bases sit on clear level ground
        this.elev[i] = 0;
        if (this.type[i] !== T.ROAD && this.type[i] !== T.SCRAP) this.type[i] = dBase(x, y) < 7 ? T.DIRT : T.GRASS;
      }
    }
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
    const homes = ['cottage', 'cottage2', 'townhouse', 'cottage', 'shop', 'barn', 'townhouse', 'cottage2'];
    vs.forEach(([vx, vy], v) => { // every town has a hall in the middle: hold it and the town trades with you
      pair('townHall', vx - 1, vy - 1, 2, 2);
    });
    vs.forEach(([vx, vy], v) => {
      // farm fields beside each village (and its twin)
      const fx = vx + (v % 2 ? -10 : 5), fy = vy + (v < 2 ? 4 : -9);
      for (let y = fy; y < fy + 5; y++) for (let x = fx; x < fx + 7; x++) for (const [xx, yy] of orbit([x, y]))
        if (this.inside(xx, yy) && this.type[this.idx(xx, yy)] === T.GRASS && this.elev[this.idx(xx, yy)] === 0) this.type[this.idx(xx, yy)] = T.FIELD;
      for (let k = 0; k < 7; k++) {
        const kind = homes[(k + v * 3) % homes.length], big = kind === 'barn' || kind === 'townhouse';
        pair(kind, vx + Math.round(Math.cos(k * 0.95 + v) * 3.5), vy + Math.round(Math.sin(k * 0.95 + v) * 3.5), big ? 2 : 1, 1);
      }
      pair('waterTower', vx + 2, vy - 3, 1, 1);
    });
    // capture sites: mirrored pairs out in the contested ground, the big prize on the island
    const spot = (lo: number, hi: number): P => {
      for (let k = 0; k < 200; k++) {
        const x = r(8, N - 8), y = r(8, N - 8), d = Math.hypot(x - b0[0], y - b0[1]), D = Math.hypot(N - 1 - 2 * b0[0], N - 1 - 2 * b0[1]);
        if (d > D * lo && d < D * hi && dBase(x, y) > 20 && riverD(x, y) > 5) return [Math.round(x), Math.round(y)];
      }
      return [Math.round(b0[0] + (C[0] - b0[0]) * lo), Math.round(b0[1] + (C[1] - b0[1]) * lo)];
    };
    const plan: [string, number, number, number, number][] = [['fuelDepot', 2, 2, 0.3, 0.45], ['motorPool', 3, 2, 0.3, 0.5], ['recruitOffice', 2, 2, 0.2, 0.35], ['watchtower', 1, 1, 0.25, 0.45], ['watchtower', 1, 1, 0.35, 0.48], ['bunker', 1, 1, 0.2, 0.4], ['bunker', 1, 1, 0.3, 0.48], ['bunker', 1, 1, 0.4, 0.48],
      ['powerPlant', 3, 2, 0.25, 0.5], ['commTower', 1, 1, 0.15, 0.48], ['commTower', 1, 1, 0.3, 0.5], ['repairYard', 2, 2, 0.22, 0.45], ['repairYard', 2, 2, 0.35, 0.5]];
    for (const [kind, w, h, lo, hi] of plan) for (let k = 0; k < 6; k++) { const [x, y] = spot(lo, hi); if (pair(kind, x, y, w, h)) break; }
    // the citadel: the orbital uplink dead centre, and round it a compound of prizes, each taken on its own,
    // so the middle changes hands piece by piece: a fuel depot (money), a repair yard, a comm tower (radar),
    // and bunkers by the gates. Every side gets a twin of each on its own side.
    for (let y = N / 2 - 1; y <= N / 2; y++) for (let x = N / 2 - 1; x <= N / 2; x++) { const i = this.idx(x, y); this.type[i] = T.DIRT; this.scrap[i] = 0; this.elev[i] = 0; }
    claim('uplink', N / 2 - 1, N / 2 - 1, 2, 2);
    { const a = Math.atan2(b0[1] - C[1], b0[0] - C[0]), at = (da: number, d: number, w: number, h: number): P => [Math.round(C[0] + Math.cos(a + da) * d - w / 2 + 0.5), Math.round(C[1] + Math.sin(a + da) * d - h / 2 + 0.5)];
      for (const [kind, da, d, w, h] of [['fuelDepot', 1.0, 7, 2, 2], ['repairYard', -1.0, 7, 2, 2], ['commTower', 0, 5.5, 1, 1], ['bunker', 0.42, 10.5, 1, 1], ['bunker', -0.42, 10.5, 1, 1]] as [string, number, number, number, number][]) pair(kind, ...at(da, d, w, h), w, h); }
    // abandoned war machines in out-of-the-way spots: the first to reach one claims it
    const kinds = ['tank', 'artillery', 'juggernaut', 'hovertank', 'tank'];
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
  prepare() {
    // warp fields make cell edges ragged and natural
    const Q = 4, qw = Math.ceil(MAP / Q) + 2, qh = Math.ceil((MAP - OY) / Q) + 2;
    this.wE = new Float32Array(qw * qh * 2); this.wT = new Float32Array(qw * qh * 2);
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      const px = x * Q, py = y * Q + OY, k = (y * qw + x) * 2;
      this.wE[k] = (vnoise(px, py, 13, 21) - 0.5) * 16 + (vnoise(px, py, 4, 27) - 0.5) * 4; this.wE[k + 1] = (vnoise(px, py, 13, 22) - 0.5) * 16 + (vnoise(px, py, 4, 28) - 0.5) * 4;
      this.wT[k] = (vnoise(px, py, 17, 23) - 0.5) * 18 + (vnoise(px, py, 5, 25) - 0.5) * 5;
      this.wT[k + 1] = (vnoise(px, py, 17, 24) - 0.5) * 18 + (vnoise(px, py, 5, 26) - 0.5) * 5;
    }
    const wq = qw;
    const warp = (f: Float32Array, px: number, py: number, o: number) => f[((Math.floor((py - OY) / Q)) * wq + Math.floor(px / Q)) * 2 + o] ?? 0;
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
      { // the citadel's moat and gates, drawn from their true shapes: a wavy ring of water with round shallows at each gate
        const gx = px / CELL - 0.5 - (N / 2 - 0.5), gy = py / CELL - 0.5 - (N / 2 - 0.5), dc = Math.hypot(gx, gy), isl = this.island;
        if (dc < isl + 4.5) {
          const wob = (vnoise(px, py, 40, 78) - 0.5) * 1.2 + (vnoise(px, py, 14, 79) - 0.5) * 0.4, inner = isl - 0.3 + wob * 0.7, outer = isl + 2.9 + (vnoise(px, py, 50, 80) - 0.5) * 1.1;
          if (dc >= inner && dc <= outer) {
            const mid = isl + 1.5, gate = this.gates.some((g) => { const ox = gx - Math.cos(g) * mid, oy = gy - Math.sin(g) * mid, rad = ox * Math.cos(g) + oy * Math.sin(g), tan = -ox * Math.sin(g) + oy * Math.cos(g); return Math.hypot(rad / 1.3, tan) < 2.9 + wob; });
            return gate ? T.FORD : T.WATER;
          }
          if (dc < inner) return t === T.WATER || t === T.FORD ? T.GRASS : t; // the island itself
          if ((t === T.WATER || t === T.FORD) && Math.hypot(cx - (N / 2 - 0.5), cy - (N / 2 - 0.5)) < isl + 3.2) return T.GRASS; // the moat's squares past its true edge are bank
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
        if (this.rivers.length && (t === T.WATER || t === T.FORD || this.type[Math.max(0, Math.min(N - 1, cy + 1)) * N + cx] === T.WATER || this.type[Math.max(0, Math.min(N - 1, cy - 1)) * N + cx] === T.WATER || this.type[cy * N + Math.max(0, Math.min(N - 1, cx + 1))] === T.WATER || this.type[cy * N + Math.max(0, Math.min(N - 1, cx - 1))] === T.WATER)) {
          const dc = Math.hypot(gx - (N / 2 - 0.5), gy - (N / 2 - 0.5));
          if (dc < this.island + 3.2) { /* the citadel's moat is drawn above */ } else {
            let d = 1e9; for (const rv of this.rivers) d = Math.min(d, lineDist(gx, gy, rv)[0]);
            const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy, at = (a: number, b: number) => this.riverHW[Math.max(0, Math.min(N - 1, b)) * N + Math.max(0, Math.min(N - 1, a))];
            const hw = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
            const bank = (vnoise(px, py, 60, 73) - 0.5) * 1.6 + (vnoise(px, py, 17, 74) - 0.5) * 0.4; // banks that wander
            if (d < hw + bank) return this.fordPts.some(([fx, fy]) => Math.hypot(gx - fx, gy - fy) < 3.3 + (vnoise(px, py, 40, 77) - 0.5) * 1.2) ? T.FORD : T.WATER; // round shallows, inside the river's own banks
            if ((t === T.WATER || t === T.FORD) && d < hw + 2.5) return T.GRASS;
          }
        }
      }
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
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      const px = x * Q, py = y * Q + OY, k = (y * qw + x) * 2;
      fld[k] = vnoise(px, py, 61, 37); fld[k + 1] = vnoise(px, py, 11, 33);
    }
    const field = (px: number, py: number, o: number) => {
      const fx = px / Q, fy = (py - OY) / Q, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const at = (a: number, b: number) => fld[(Math.min(qh - 1, Math.max(0, b)) * qw + Math.min(qw - 1, Math.max(0, a))) * 2 + o];
      return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    };
    // ground lumps and patch fields at quarter size (bytes): 0 lit (sun-facing slope), 1 tuft clumps,
    // 2 worn patches, 3 grime, 4 pebble patches
    const QC = 5, lumps = new Uint8Array(qw * qh * QC);
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      const px = x * Q, py = y * Q + OY, k = (y * qw + x) * QC;
      const lit = (vnoise(px - 1.5, py - 1.5, 6, 91) - vnoise(px + 1.5, py + 1.5, 6, 91)) * 1.6;
      lumps[k] = Math.max(0, Math.min(255, Math.round((lit + 0.5) * 255)));
      lumps[k + 1] = vnoise(px, py, 13, 94) * 255; lumps[k + 2] = vnoise(px, py, 7, 93) * 255;
      lumps[k + 3] = vnoise(px, py, 6, 96) * 255; lumps[k + 4] = vnoise(px, py, 9, 95) * 255;
    }
    const lump = (px: number, py: number, o: number) => {
      const fx = px / Q, fy = (py - OY) / Q, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
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
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      const px = x * Q, py = y * Q + OY;
      let best = 99;
      for (const [ax, ay, bx, by] of grid[Math.min(gw - 1, Math.max(0, Math.floor(py / TS))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(px / TS)))]) {
        const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(px - ax - dx * t, py - ay - dy * t));
      }
      roadD[y * qw + x] = best + (vnoise(px, py, 9, 61) - 0.5) * 2;
    }
    const roadAt = (px: number, py: number) => {
      const fx = px / Q, fy = (py - OY) / Q, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const at = (a: number, b: number) => roadD[Math.min(qh - 1, Math.max(0, b)) * qw + Math.min(qw - 1, Math.max(0, a))];
      return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    };
    const isWet = (t: number) => t === T.WATER || t === T.BRIDGE || t === T.FORD;
    const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const dith = (x: number, y: number) => B4[(y & 3) * 4 + (x & 3)] / 16 - 0.47;
    const grassAt = (x: number, y: number) => { const t = typeW(x, y, true); return t === T.GRASS || t === T.ROCK; };
    // gentle lumps in the ground lit from the upper left: >0 faces the sun, <0 is in shade
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
      if (this.paintMode === 'ice') { // winter: water is ice (bridges and dry ground left as they are)
        if (!isWet(hard) || hard === T.BRIDGE || exact === T.BRIDGE) return -1;
        let shore = 12;
        for (const r of [2, 4, 7]) if (!isWet(typeW(gx + r, gy, false)) || !isWet(typeW(gx - r, gy, false)) || !isWet(typeW(gx, gy + r, false)) || !isWet(typeW(gx, gy - r, false))) { shore = r; break; }
        const crack = (x: number, y: number) => { const n = vnoise(x, y, 26, 91) * 4 + vnoise(x, y, 9, 92); return Math.abs(n - Math.round(n)) < 0.035; };
        if (crack(gx, gy)) return 0x8fb4c6; // cracks
        if (shore <= 2) return h < 0.5 ? 0xf2f6f8 : 0xe2ecf0; // snow piled at the banks
        if (hash3(Math.floor((X + (Y % 9) * 2) / 7), 13, Y) < 0.05) return 0xffffff; // glints of frost
        const v = vnoise(gx, gy, 40, 93) + dith(X, Y) * 0.15;
        return shore <= 4 ? 0xd4e4ec : v > 0.62 ? 0xc6dae4 : v > 0.38 ? 0xb8d0dc : 0xaac6d4; // pale blue, darker where it's deep
      }
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
        if (hard === T.FORD) return h < 0.1 ? 0x8a8474 : h < 0.14 ? 0x5a5650 : h < 0.22 ? RIPPLE : shore <= 2 ? SAND : SHAL;
        if (shore <= 2) return h < 0.45 ? FOAM : h < 0.75 ? SAND : SAND_LO;
        if (shore <= 4) return h < 0.12 ? RIPPLE : SHAL;
        // ripples: short bright dashes with a dark trough under them
        const rx = Math.floor((X + (Y % 7) * 3) / 5);
        if (hash3(rx, 7, Y) < 0.08) return RIPPLE;
        if (hash3(rx, 7, Y - 1) < 0.08) return DEEP;
        return shore <= 7 ? (dith(X, Y) > 0.2 ? SHAL : MID) : (field(gx, gy, 0) + dith(X, Y) * 0.3 > 0.5 ? DEEP : MID);
      }
      if (e === 0 && !isWet(hard) && hard !== T.ROCK && hard !== T.ROAD && hard !== T.PAVED) { // beaches along some low shores (others stay grassy)
        const beachy = vnoise(gx, gy, 150, 71), bcx = Math.floor(gx / CELL), bcy = Math.floor(gy / CELL);
        let shoreSq = false; // only squares beside water can be beach: checked cheaply first
        for (let dy = -1; dy <= 1 && !shoreSq; dy++) for (let dx = -1; dx <= 1; dx++) { const q = this.type[Math.max(0, Math.min(N - 1, bcy + dy)) * N + Math.max(0, Math.min(N - 1, bcx + dx))]; if (q === T.WATER) { shoreSq = true; break; } }
        if (beachy > 0.52 && shoreSq) {
          const width = 7 + (beachy - 0.52) * 60; // wider where the shore is sandiest
          let near = 99;
          for (const r of [3, 7, 12, 18, 25]) { if (r > width + 2) break; if (isWet(typeW(gx + r, gy, false)) || isWet(typeW(gx - r, gy, false)) || isWet(typeW(gx, gy + r, false)) || isWet(typeW(gx, gy - r, false))) { near = r; break; } }
          if (near <= width && !(near > width * 0.6 && dith(X, Y) < (near - width * 0.6) / (width * 0.4) - 0.5)) // the inland edge breaks up into the grass
            return near <= 3 ? (h < 0.5 ? 0x8a7c5a : SAND_LO) : h < 0.06 ? SAND_LO : h < 0.1 ? 0xc4b48a : SAND; // wet sand at the waterline, a few pebbles
        }
      }
      if (hard === T.ROCK && this.peaks.length) { // a mountain: relief-shaded from a height map, snow up high, scree at the foot
        const H = (x: number, y: number) => this.mountainH(x, y);
        const hh = H(gx, gy);
        if (hh > -9) {
          const nx = H(gx + 2, gy) - H(gx - 2, gy), ny = H(gx, gy + 2) - H(gx, gy - 2);
          const light = 0.5 - (nx + ny) * 16; // lit from the top left of the screen
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
        if (lx < 2 && ly < 1) return ROCK_HI; // a lit edge on each slab
        if (h < 0.03) return MOSS;
        return tone([shadeHex(ROCK[2], 0.86), ROCK[2], ROCK[0], ROCK[1], shadeHex(ROCK[1], 1.1)], 0.5 + bumpLight(gx, gy) * 0.8 + (slab - 0.5) * 0.25 - (lx + ly) * 0.012, X, Y);
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
        // salvage: bent plates and girders, lit on the top-left edge, dark underneath, rare bright glints
        const bx = Math.floor(X / 3), by = Math.floor(Y / 2);
        if (hash3(bx, 5, by) < 0.45) {
          const c = SCRAP[(hash3(bx, 6, by) * SCRAP.length) | 0];
          if (X % 3 === 0 && Y % 2 === 0) return hash3(bx, 7, by) < 0.12 ? 0xe4e6e0 : shadeHex(c, 1.35);
          return Y % 2 === 1 ? shadeHex(c, 0.62) : c;
        }
        return hash3(bx, 8, by) < 0.3 ? 0x3a3026 : SCRAPBED[(h * 2) | 0];
      }
      if (t === T.DIRT) {
        // packed earth: lumpy and lit from the upper left, with clustered pebbles, cracks and grime
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

    // soft shade on low ground just below and right of raised ground (sun is upper left)
    const elevS = (sx: number, sy: number) => { const [x, y] = toGround(sx, sy); return elevW(x, y); };
    const shadeAt = (sx: number, sy: number, e: number, c: number) => {
      if (elevS(sx - 3, sy - 3) > e || elevS(sx, sy - 2) > e) return shadeHex(c, dith(sx, sy) > -0.1 ? 0.62 : 0.8);
      if (elevS(sx - 6, sy - 6) > e || elevS(sx, sy - 5) > e) return shadeHex(c, dith(sx, sy) > 0.15 ? 0.72 : 0.9);
      return c;
    };

    // One screen pixel. The map is turned a little (YAW), so each screen pixel looks up the ground
    // under it; raised ground is drawn LIFT pixels higher per step.
    const pixel = (px: number, py: number): number => {
      if (this.paintMode === 'patch') { const [gx, gy] = toGround(px, py), cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL); if (!this.inside(cx, cy) || !this.patchMask.has(this.idx(cx, cy))) return -1; }
      const layer = this.paintMode === 'ice' || this.paintMode === 'drain';
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
      if (gx < 0 || gy < 0 || gx >= MAP || gy >= MAP) return 0x0d0c0b;
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

    this.pixel = pixel;
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

  finish() { this.pixel = null; this.paintMinimap(); } // drop the painting tables (tens of MB)

  // The minimap shows the map turned the same way as the main view.
  paintMinimap() {
    const M = 128, step = SW / M;
    this.minimap = document.createElement('canvas');
    this.minimap.width = M; this.minimap.height = M;
    const ctx = this.minimap.getContext('2d')!;
    const img = ctx.createImageData(M, M), d = img.data;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      let r = 0, g = 0, b = 0;
      for (let sI = 0; sI < 4; sI++) {
        const [gx, gy] = toGround((x + 0.25 + (sI & 1) * 0.5) * step, (y + 0.25 + (sI >> 1) * 0.5) * step);
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
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = this.chunks[r * this.cw + c]; if (k) ctx.drawImage(k, c * CH - vx, r * CH + OY - vy); const ice = this.showIce && this.ice[r * this.cw + c]; if (ice) ctx.drawImage(ice, c * CH - vx, r * CH + OY - vy); }
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
  // ---- paved roads ----
  // A paved road is a chain of squares, each joined to the next (straight or diagonal), like a
  // board-game road: where two roads meet they share a square, so every junction joins cleanly.
  // links[i] has a bit for each neighbour square it's joined to (ROAD_DIRS order). The asphalt is
  // drawn from those joins: a dark kerb, then the surface, then a centre dash midway along each
  // join (so never in a junction). Each join is also kept as a segment for planning (paved).
  links = new Uint8Array(N * N);
  paved: { ax: number; ay: number; bx: number; by: number; team: number }[] = [];
  felled: number[] = []; // forest squares a road has just gone through (the game topples their trees)
  // Pave a chain of neighbouring squares for a side; returns how many new squares (dryRun: just counts them).
  paveCells(cells: number[], team: number, dryRun = false) {
    let fresh = 0;
    for (const i of cells) if (this.type[i] !== T.PAVED && this.type[i] !== T.BRIDGE) {
      fresh++;
      if (dryRun) continue;
      if (this.forest[i]) this.felled.push(i);
      this.type[i] = T.PAVED; this.roadBy[i] = team; this.scrap[i] = 0; this.forest[i] = 0;
    }
    if (dryRun) return fresh;
    const C = (i: number) => [((i % N) + 0.5) * CELL, (((i / N) | 0) + 0.5) * CELL];
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1], b = cells[k], d = ROAD_DIRS.findIndex(([dx, dy]) => (a % N) + dx === b % N && ((a / N) | 0) + dy === ((b / N) | 0));
      if (d < 0 || this.links[a] & (1 << d)) continue;
      this.links[a] |= 1 << d; this.links[b] |= 1 << ((d + 4) % 8);
      const [ax, ay] = C(a), [bx, by] = C(b); this.paved.push({ ax, ay, bx, by, team });
    }
    for (const i of cells) this.roadQueue.push(i); // painted a few squares a frame (see flushRoads), so a long road never stalls the game
    return fresh;
  }
  roadQueue: number[] = [];
  // Paint the asphalt for squares paved recently, a slice per frame, in the order they were laid.
  flushRoads(n = 24) {
    if (!this.roadQueue.length) return;
    this.drawRoads(new Set(this.roadQueue.splice(0, n)));
  }
  // Redraw the asphalt round some squares from their joins (kerbs first, then surface, then dashes,
  // so where joins overlap at a bend or junction the surface runs on unbroken).
  // Redraw the asphalt round some squares. Each stretch of road between junctions (or ends) is
  // traced square by square and smoothed into one flowing line, so bends sweep across several
  // squares; at a junction each road runs straight into its middle. Every pixel takes its colour
  // from its distance to the nearest line: a dark kerb at the edge, asphalt inside, and a centre
  // dash every square along each line.
  private drawRoads(cells: Set<number>) {
    const grow = (src: Set<number>) => { const out = new Set(src); for (const i of src) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = (i % N) + dx, y = ((i / N) | 0) + dy; if (this.inside(x, y)) out.add(y * N + x); } return out; };
    const paint = grow(grow(cells)), ext = grow(paint);
    const dirs = (c: number) => { const o: number[] = []; for (let d = 0; d < 8; d++) if (this.links[c] & (1 << d)) o.push(d); return o; };
    const step = (c: number, d: number) => c + ROAD_DIRS[d][1] * N + ROAD_DIRS[d][0];
    const C = (c: number): [number, number] => [((c % N) + 0.5) * CELL, (((c / N) | 0) + 0.5) * CELL];
    const mid = (a: number, b: number): [number, number] => { const [ax, ay] = C(a), [bx, by] = C(b); return [(ax + bx) / 2, (ay + by) / 2]; };
    const segs: number[][] = []; // ax, ay, bx, by, length along at a, at b
    const addLine = (pts: [number, number][]) => { let s0 = 0; for (let k = 1; k < pts.length; k++) { const L = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); segs.push([pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], s0, s0 + L]); s0 += L; } };
    const chaikin = (pts: [number, number][], n: number) => { for (let it = 0; it < n; it++) { const o: [number, number][] = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1]; o.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); } o.push(pts[pts.length - 1]); pts = o; } return pts; };
    const done = new Set<string>(), node = (c: number) => dirs(c).length !== 2;
    for (const c of ext) {
      if (this.type[c] !== T.PAVED && !this.links[c]) continue;
      const ds = dirs(c);
      if (!ds.length) { const [x, y] = C(c); segs.push([x, y, x + 0.01, y, 0, 0]); continue; } // a lone square
      if (node(c)) for (const d of ds) { // a junction or an end: straight into its middle, and the stretch that leaves it
        const [x, y] = C(c), m = mid(c, step(c, d)); addLine([[x, y], m]);
        let prev = c, cur = step(c, d); const key = c + '>' + cur; if (done.has(key)) continue;
        const chain: [number, number][] = [m];
        for (let guard = 0; guard < 400 && !node(cur); guard++) { chain.push(C(cur)); const nd = dirs(cur).find((k) => step(cur, k) !== prev)!; prev = cur; cur = step(cur, nd); }
        chain.push(mid(prev, cur)); done.add(cur + '>' + prev);
        if (chain.length > 2) addLine(chaikin(chain, 3));
      }
    }
    // stretches that loop without a junction
    for (const c of ext) {
      if (!this.links[c] || node(c) || done.has('loop' + c)) continue;
      let prev = c, cur = step(c, dirs(c)[0]); const ring: [number, number][] = [C(c)]; done.add('loop' + c);
      for (let guard = 0; guard < 400 && cur !== c && !node(cur); guard++) { ring.push(C(cur)); done.add('loop' + cur); const nd = dirs(cur).find((k) => step(cur, k) !== prev)!; prev = cur; cur = step(cur, nd); }
      if (cur === c && ring.length > 3) addLine(chaikin([...ring, ring[0]], 3));
    }
    const HW = 9;
    for (const c of paint) {
      const ti = this.type[c];
      if (ti === T.WATER || ti === T.ROCK || ti === T.BRIDGE || ti === T.FORD) continue; // the bridge deck stays as it is
      const cx = c % N, cy = (c / N) | 0, x0 = cx * CELL - HW - 3, x1 = (cx + 1) * CELL + HW + 3, y0 = cy * CELL - HW - 3, y1 = (cy + 1) * CELL + HW + 3;
      const near = segs.filter((g) => Math.max(g[0], g[2]) > x0 && Math.min(g[0], g[2]) < x1 && Math.max(g[1], g[3]) > y0 && Math.min(g[1], g[3]) < y1);
      if (!near.length) continue;
      for (let gy = cy * CELL; gy < (cy + 1) * CELL; gy++) for (let gx = cx * CELL; gx < (cx + 1) * CELL; gx++) {
        let best = 1e9, along = -1;
        for (const [ax, ay, bx, by, s0, s1] of near) {
          const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / L2)) : 0, d = Math.hypot(gx - ax - dx * t, gy - ay - dy * t);
          if (d < best) { best = d; along = s0 + (s1 - s0) * t; }
        }
        const edge = HW + (vnoise(gx, gy, 3, 77) - 0.5) * 2.5;
        if (best > edge) continue;
        const h = hash3(gx, 31, gy), m = along % CELL;
        const col = best < 1 && m > 8.5 && m < 15.5 ? (h < 0.15 ? '#a8a08a' : '#d8d0b4') : best > edge - 1.2 ? (h < 0.6 ? '#3a3a3c' : '#4e4c48') : h < 0.04 ? '#2c2c2e' : h < 0.12 ? '#56565a' : (vnoise(gx, gy, 9, 78) > 0.62 ? '#474749' : '#4d4d50');
        const [sx, sy] = toScreen(gx, gy);
        this.dot(Math.round(sx), Math.round(sy - this.lift(gx, gy)), col);
      }
    }
  }
  // A heavy hit blows a crater in a paved square: its joins break (everything past it may be cut off)
  // and it's scarred earth until repaired. Returns what it was joined to, for the repair.
  crater(i: number) {
    const was = this.links[i], team = this.roadBy[i];
    for (let d = 0; d < 8; d++) if (was & (1 << d)) { const j = i + ROAD_DIRS[d][1] * N + ROAD_DIRS[d][0]; this.links[j] &= ~(1 << ((d + 4) % 8)); }
    this.links[i] = 0; this.type[i] = T.DIRT; this.roadBy[i] = -1;
    const x = i % N, y = (i / N) | 0;
    for (let gy = y * CELL - 2; gy < (y + 1) * CELL + 2; gy++) for (let gx = x * CELL - 2; gx < (x + 1) * CELL + 2; gx++) {
      const d = Math.hypot(gx - (x + 0.5) * CELL, gy - (y + 0.5) * CELL) + (vnoise(gx, gy, 4, 81) - 0.5) * 4;
      if (d > 14) continue;
      const h = hash3(gx, 61, gy), c = d > 11 ? (h < 0.5 ? '#4a3c2c' : '#5a4a36') : d > 6 ? (h < 0.3 ? '#2a2420' : '#3a3028') : h < 0.2 ? '#1e1a16' : '#2e2620';
      const [sx, sy] = toScreen(gx, gy); this.dot(Math.round(sx), Math.round(sy - this.lift(gx, gy)), c);
    }
    this.drawRoads(new Set([i]));
    return { was, team };
  }
  // Patch a crater: the square is road again, joined back to whatever road is still beside it.
  repairCrater(i: number, was: number, team: number) {
    if (this.type[i] === T.WATER) return;
    this.type[i] = T.PAVED; this.roadBy[i] = team;
    for (let d = 0; d < 8; d++) if (was & (1 << d)) { const j = i + ROAD_DIRS[d][1] * N + ROAD_DIRS[d][0]; if (this.type[j] === T.PAVED || this.type[j] === T.BRIDGE) { this.links[i] |= 1 << d; this.links[j] |= 1 << ((d + 4) % 8); } }
    this.drawRoads(new Set([i]));
  }
  // A short concrete driveway from a building's side to its road (only over open ground, never
  // over the road itself, so it meets the kerb cleanly).
  paintDrive(ax: number, ay: number, bx: number, by: number) {
    const HW = 6, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let gy = Math.floor(Math.min(ay, by) - HW); gy <= Math.ceil(Math.max(ay, by) + HW); gy++) for (let gx = Math.floor(Math.min(ax, bx) - HW); gx <= Math.ceil(Math.max(ax, bx) + HW); gx++) {
      const t = Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / L2)), d = Math.hypot(gx - ax - dx * t, gy - ay - dy * t);
      if (d > HW) continue;
      const cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL); if (!this.inside(cx, cy)) continue;
      const i = this.idx(cx, cy), ty = this.type[i];
      if (ty === T.PAVED || ty === T.WATER || ty === T.BRIDGE || ty === T.FORD || ty === T.ROCK || this.occupied[i]) continue;
      const h = hash3(gx, 41, gy), c = d > HW - 1 ? (h < 0.5 ? '#5e5c56' : '#6a6862') : h < 0.05 ? '#6e6c66' : h < 0.1 ? '#9a978e' : '#86847c';
      const [sx, sy] = toScreen(gx, gy);
      this.dot(Math.round(sx), Math.round(sy - this.lift(gx, gy)), c);
    }
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

  // Tread marks: two dark lines pressed into soft ground.
  track(px: number, py: number, angle: number, half: number) {
    const i = this.idx(this.cellOf(px), this.cellOf(py)), t = this.type[i];
    if (t === T.WATER || t === T.BRIDGE || t === T.FORD) return;
    const [qx, qy] = toScreen(px, py);
    const sx = Math.round(qx), sy = Math.round(qy - this.lift(px, py)), a = angle + YAW;
    const ox = -Math.sin(a) * half, oy = Math.cos(a) * half;
    this.stamp(sx, sy, (ctx, x, y) => {
      // faint per pass: one vehicle leaves a light trace, heavy traffic slowly wears in a track
      ctx.fillStyle = t === T.DIRT || t === T.SCRAP ? 'rgba(40,28,16,0.11)' : 'rgba(30,38,18,0.12)';
      ctx.fillRect(Math.round(x + ox), Math.round(y + oy), 1, 1);
      ctx.fillRect(Math.round(x - ox), Math.round(y - oy), 1, 1);
    });
  }
}

export function shadeHex(c: number, k: number) {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}
