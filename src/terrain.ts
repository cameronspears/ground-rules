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
export const enum T { GRASS, DIRT, SCRAP, WATER, BRIDGE, FORD, ROCK, ROAD, FIELD }
const CH = 512, OY = -24; // chunk size; the painted area starts a little above row 0 for raised ground

// The map is turned a little on screen so buildings show two sides. Ground (x, y) -> screen (sx, sy).
export const YAW = (18 * Math.PI) / 180, YC = Math.cos(YAW), YS = Math.sin(YAW);
const SX0 = YS * MAP; // keeps screen x positive
export const SW = Math.ceil((YC + YS) * MAP), SH = Math.ceil((YC + YS) * MAP);
export function toScreen(gx: number, gy: number): [number, number] { return [YC * gx - YS * gy + SX0, YS * gx + YC * gy]; }
export function toGround(sx: number, sy: number): [number, number] { const x = sx - SX0; return [YC * x + YS * sy, -YS * x + YC * sy]; }

function vnoise(x: number, y: number, s: number, seed: number) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy, u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
  const a = hash3(ix, seed, iy), b = hash3(ix + 1, seed, iy), c = hash3(ix, seed, iy + 1), d = hash3(ix + 1, seed, iy + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
type P = [number, number];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// a small seeded random number generator, so a seed always makes the same map
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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
  scrap = new Uint16Array(N * N);
  chunks: HTMLCanvasElement[] = [];
  cw = Math.ceil(SW / CH); chh = Math.ceil((SH - OY) / CH);
  minimap: HTMLCanvasElement;
  trees: P[] = [];
  glints: number[][] = []; // per chunk: x, y pairs of open-water pixels that sparkle
  bases: P[] = [];
  roadLines: P[][] = []; // dirt roads between bases, villages and crossings (cell coordinates); cars drive them
  villages: P[] = [];
  rivers: P[][] = [];
  orbit: (p: P) => P[] = (p) => [p]; // the symmetric copies of a square (set when the map is made)
  // civilian buildings and capturable sites: kind + footprint in cells
  sites: { kind: string; cx: number; cy: number; w: number; h: number }[] = [];
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
    this.rivers = four ? [0, 1, 2, 3].map((k) => half.map((p) => orbit(p)[k])) : [[...half, ...half.slice(0, -1).reverse().map(M)]];
    const riverD = (x: number, y: number) => Math.min(...this.rivers.map((rv) => lineDist(x, y, rv)[0]));
    // crossings: bridges (duels only: straight decks) and fords, all in symmetric sets
    const along = (f: number): P => { const i = Math.min(half.length - 2, Math.floor(f * (half.length - 1))), t = f * (half.length - 1) - i; return [half[i][0] + (half[i + 1][0] - half[i][0]) * t, half[i][1] + (half[i + 1][1] - half[i][1]) * t]; };
    const bridges = four ? [] : [Math.round(along(0.3)[0]), N - 2 - Math.round(along(0.3)[0])];
    const fords: P[] = four ? [...orbit(along(0.3)), ...orbit(along(0.66))] : orbit(along(0.62));
    const island = 6;
    // ponds
    const ponds: [number, number, number][] = [];
    for (let k = 0; k < 600 && ponds.length < (four ? 8 : 4); k++) {
      const x = r(20, N - 20), y = r(20, N - 20), rad = r(3, 6);
      if (dBase(x, y) < 30 || riverD(x, y) < rad + 10 || orbit([x, y]).some(([a, b]) => ponds.some(([px, py]) => Math.hypot(px - a, py - b) < 30))) continue;
      for (const [a, b] of orbit([x, y])) ponds.push([a, b, rad]);
    }
    // scrap: a field near each base, symmetric sets out in the open, and the rich island in the middle
    const fields: [number, number, number, number][] = []; // x, y, radius, richness
    { const a = Math.atan2(C[1] - b0[1], C[0] - b0[0]) + r(-0.9, 0.9), d = r(13, 16); for (const [x, y] of orbit([b0[0] + Math.cos(a) * d, b0[1] + Math.sin(a) * d])) fields.push([x, y, 5, 1]); }
    for (let k = 0; k < 1000 && fields.length < (four ? 18 : 12); k++) {
      const x = r(10, N - 10), y = r(10, N - 10), rad = r(3.5, 5.5);
      if (dBase(x, y) < 24 || riverD(x, y) < rad + 4 || orbit([x, y]).some(([a, b]) => fields.some(([fx, fy]) => Math.hypot(fx - a, fy - b) < 22)) || ponds.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + rad + 3)) continue;
      const rich = 1 + Math.min(1, (dBase(x, y) - 24) / (N * 0.4)) * 0.6; // further from home, richer
      for (const [a, b] of orbit([x, y])) fields.push([a, b, rad, rich]);
    }
    fields.push([C[0], C[1], island - 1.5, 2.2]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y), db = dBase(x, y), dr = riverD(x, y);
      const hw = 1.8 + sn(x, y, 11, 4) * 1.8, dc = Math.hypot(x - C[0], y - C[1]);
      let t = T.GRASS;
      if (sn(x, y, 13, 6) > 0.74 || db < 7) t = T.DIRT;
      if ((dr < hw || dc < island + 2.5) && dc >= island) {
        t = T.WATER;
        const diag = Math.abs((x - C[0]) + (y - C[1])) < 3 || (four && Math.abs((x - C[0]) - (y - C[1])) < 3); // fords from each bank onto the island
        if (bridges.includes(x) || bridges.includes(x - 1)) t = T.BRIDGE;
        else if (fords.some(([fx, fy]) => Math.hypot(x - fx, y - fy) < 3.5) || (Math.abs(dc - island - 1) < 2.5 && diag)) t = T.FORD;
      }
      for (const [px, py, pr] of ponds) if (Math.hypot(x - px, y - py) < pr * (0.8 + sn(x, y, 4, 12) * 0.4)) t = T.WATER;
      for (const [sx, sy, sr, rich] of fields)
        if (t !== T.WATER && t !== T.BRIDGE && t !== T.FORD && Math.hypot(x - sx, y - sy) < sr * (0.75 + sn(x, y, 3, 8) * 0.5)) { t = T.SCRAP; this.scrap[i] = Math.round((300 + ch(x, y, 1) * 400) * rich); }
      if (t === T.GRASS && db > 14 && dr > 5 && ch(x, y, 2) < 0.004) t = T.ROCK; // scattered rocks
      this.type[i] = t;
      let e = 0;
      if (sn(x, y, 20, 5) > 0.68 && db > 20 && dr > 6 && dc > island + 4 && x > 3 && y > 3 && x < N - 4 && y < N - 4 && t !== T.SCRAP && t !== T.WATER) e = 2;
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
      if (edge && ch(x, y, 3) < 0.12) ramps.push(i);
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
    this.layoutSettlements(R, bridges, fords, C, riverD);
    // forests
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = this.idx(x, y);
      if (this.type[i] !== T.GRASS || this.elev[i] === 1 || dBase(x, y) < 16 || this.nearVillage(x, y, 9) || this.sites.some((s) => x >= s.cx - 2 && x < s.cx + s.w + 2 && y >= s.cy - 2 && y < s.cy + s.h + 2)) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = this.type[this.idx(x + dx, y + dy)]; return t === T.WATER || t === T.BRIDGE || t === T.FORD; });
      if (near) continue;
      const dense = sn(x, y, 12, 9);
      if (dense > 0.67 || ch(x, y, 4) < 0.01) {
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
    for (const v of vs) { const c = crossings.slice().sort((a, b) => Math.hypot(a[0] - v[0], a[1] - v[1]) - Math.hypot(b[0] - v[0], b[1] - v[1]))[0]; lines.push(bend(v, c)); }
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
    const plan: [string, number, number, number, number][] = [['fuelDepot', 2, 2, 0.3, 0.45], ['motorPool', 3, 2, 0.3, 0.5], ['recruitOffice', 2, 2, 0.2, 0.35], ['watchtower', 1, 1, 0.25, 0.45], ['watchtower', 1, 1, 0.35, 0.48], ['bunker', 1, 1, 0.2, 0.4], ['bunker', 1, 1, 0.3, 0.48], ['bunker', 1, 1, 0.4, 0.48]];
    for (const [kind, w, h, lo, hi] of plan) for (let k = 0; k < 6; k++) { const [x, y] = spot(lo, hi); if (pair(kind, x, y, w, h)) break; }
    // the island: a Fuel Depot dead centre, guarded by a bunker on each side
    for (let y = N / 2 - 1; y <= N / 2; y++) for (let x = N / 2 - 1; x <= N / 2; x++) { const i = this.idx(x, y); this.type[i] = T.DIRT; this.scrap[i] = 0; this.elev[i] = 0; }
    claim('fuelDepot', N / 2 - 1, N / 2 - 1, 2, 2);
    pair('bunker', N / 2 - 4, N / 2 + 2, 1, 1);
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
    const elevW = (px: number, py: number) => this.elevAt(px + warp(this.wE, px, py, 0), py + warp(this.wE, px, py, 1));
    // Ground type at a pixel (soft = ragged blend edges, hard = nearly exact), worked out on demand.
    const PW = MAP;
    const typeW = (px: number, py: number, isSoft: boolean) => {
      px = Math.round(px); py = Math.round(py);
      if (px < 0 || px >= PW || py < OY || py >= MAP) return T.GRASS;
      const f = isSoft ? 1 : 0.3, cx = Math.floor((px + warp(this.wT, px, py, 0) * f) / CELL), cy = Math.floor((py + warp(this.wT, px, py, 1) * f) / CELL);
      return cx >= 0 && cy >= 0 && cx < N && cy < N ? this.type[cy * N + cx] : T.GRASS;
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
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      const px = x * Q, py = y * Q + OY;
      let best = 1e9;
      for (const [ax, ay, bx, by] of segs) {
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
      if (isWet(hard)) {
        let shore = 12;
        for (const r of [2, 4, 7, 11]) {
          if (!isWet(typeW(gx + r, gy, false)) || !isWet(typeW(gx - r, gy, false)) || !isWet(typeW(gx, gy + r, false)) || !isWet(typeW(gx, gy - r, false))) { shore = r; break; }
        }
        if (hard === T.FORD) return h < 0.1 ? 0x8a8474 : h < 0.14 ? 0x5a5650 : h < 0.22 ? RIPPLE : shore <= 2 ? SAND : SHAL;
        if (shore <= 2) return h < 0.45 ? FOAM : h < 0.75 ? SAND : SAND_LO;
        if (shore <= 4) return h < 0.12 ? RIPPLE : SHAL;
        // ripples: short bright dashes with a dark trough under them
        const rx = Math.floor((X + (Y % 7) * 3) / 5);
        if (hash3(rx, 7, Y) < 0.08) return RIPPLE;
        if (hash3(rx, 7, Y - 1) < 0.08) return DEEP;
        return shore <= 7 ? (dith(X, Y) > 0.2 ? SHAL : MID) : (field(gx, gy, 0) + dith(X, Y) * 0.3 > 0.5 ? DEEP : MID);
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
      const fcx = this.cellOf(gx + warp(this.wT, gx, gy, 0) * 0.6), fcy = this.cellOf(gy + warp(this.wT, gx, gy, 1) * 0.6);
      const woods = this.inside(fcx, fcy) && this.forest[this.idx(fcx, fcy)] >= 2;
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
      for (const e of [2, 1]) {
        const [gx, gy] = toGround(px, py + e * LIFT);
        if (gx < 0 || gy < 0 || gx >= MAP || gy >= MAP) continue;
        if (elevW(gx, gy) === e) {
          if (e === 2 && elevS(px, py + e * LIFT + 1) < 2) return hash3(px, 5, py) < 0.3 ? MOSS : 0x9aa070; // bright cliff lip
          return surface(Math.round(gx), Math.round(gy), e, px, py);
        }
      }
      const [gx, gy] = toGround(px, py);
      if (gx < 0 || gy < 0 || gx >= MAP || gy >= MAP) return 0x0d0c0b;
      const here = elevW(gx, gy);
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
      return shadeAt(px, py, 0, surface(Math.round(gx), Math.round(gy), 0, px, py));
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
        const col = pixel(px, py);
        if ((col === DEEP || col === MID) && hash3(px, 11, py) < 0.02) glints.push(px, py);
        const k = (y * CH + x) * 4;
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
  }

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
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = this.chunks[r * this.cw + c]; if (k) ctx.drawImage(k, c * CH - vx, r * CH + OY - vy); }
  }

  // Paint something permanent into the ground at screen-space map pixel (sx, sy).
  stamp(sx: number, sy: number, fn: (ctx: CanvasRenderingContext2D, x: number, y: number) => void) {
    const cx = Math.floor(sx / CH), cy = Math.floor((sy - OY) / CH);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chunks[(cy + dy) * this.cw + cx + dx];
      if (!c || cx + dx < 0 || cx + dx >= this.cw) continue;
      fn(c.getContext('2d')!, sx - (cx + dx) * CH, sy - OY - (cy + dy) * CH);
    }
  }

  // A scrap patch that has been picked clean turns back into churned earth.
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

function shadeHex(c: number, k: number) {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}
