// The map: 128 x 128 cells of 24 pixels (about 7 m each), so roughly 900 m across.
// Cells say what the ground is and how high (low, ramp, high plateau). The ground is painted
// pixel by pixel into big canvases once at load, with ragged natural edges, and then marked as
// the battle goes on: tank tracks, stumps, fallen trees.
import { hash3 } from './voxel';

export const CELL = 24, N = 128, MAP = CELL * N, LIFT = 8; // LIFT: pixels per elevation step
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
  bases: P[] = [[16, 110], [110, 17]];
  // dirt roads between bases and villages (cell coordinates); cars drive them
  roadLines: P[][] = [
    [[16, 110], [40, 100], [60, 86], [63, 74], [63, 58], [70, 50], [96, 40], [110, 17]],
    [[16, 110], [22, 82], [26.5, 62], [26.5, 40], [36, 34], [70, 22], [110, 17]],
    [[60, 86], [92, 96], [101.5, 88], [101.5, 70], [104, 58], [96, 40]],
  ];
  villages: P[] = [[36, 34], [92, 96], [58, 88], [104, 56]];
  // civilian buildings and capturable sites: kind + footprint in cells
  sites: { kind: string; cx: number; cy: number; w: number; h: number }[] = [];
  private wE: Float32Array; private wT: Float32Array; // precomputed edge-warp fields (quarter res)

  constructor() { this.generate(); }

  idx(cx: number, cy: number) { return cy * N + cx; }
  cellOf(px: number) { return Math.floor(px / CELL); }
  inside(cx: number, cy: number) { return cx >= 0 && cy >= 0 && cx < N && cy < N; }
  elevAt(px: number, py: number) { const cx = this.cellOf(px), cy = this.cellOf(py); return this.inside(cx, cy) ? this.elev[this.idx(cx, cy)] : 0; }
  lift(px: number, py: number) { return this.elevAt(px, py) * LIFT; }

  // Can a unit stand in this cell? Crushers (tanks) may drive into forest and flatten it.
  open(cx: number, cy: number, crush: boolean) {
    if (!this.inside(cx, cy)) return false;
    const i = this.idx(cx, cy), t = this.type[i];
    if (t === T.WATER || t === T.ROCK || this.occupied[i]) return false;
    return crush || !this.forest[i];
  }
  step(ax: number, ay: number, bx: number, by: number, crush: boolean) {
    return this.open(bx, by, crush) && Math.abs(this.elev[this.idx(ax, ay)] - this.elev[this.idx(bx, by)]) <= 1;
  }

  // ------------------------------------------------------------ layout
  generate() {
    const [p1, p2] = this.bases;
    const river: P[] = [[-2, 44], [22, 50], [44, 58], [64, 66], [84, 72], [106, 80], [130, 86]];
    const scrapFields: [number, number, number][] = [[28, 104, 5], [104, 30, 5], [44, 84, 4], [84, 44, 4], [60, 30, 4], [70, 100, 4], [12, 70, 3.5], [118, 60, 3.5]];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = this.idx(x, y);
        const dBase = Math.min(Math.hypot(x - p1[0], y - p1[1]), Math.hypot(x - p2[0], y - p2[1]));
        const [dr, rx] = lineDist(x + 0.5, y + 0.5, river);
        const hw = 1.5 + vnoise(x, 0, 9, 4) * 1.4;
        let t = T.GRASS;
        if (vnoise(x, y, 11, 6) > 0.76 || dBase < 5) t = T.DIRT;
        if (dr < hw) {
          t = T.WATER;
          if (x === 26 || x === 27 || x === 101 || x === 102) t = T.BRIDGE; // straight decks, two cells wide
          else if (Math.abs(rx - 63) < 2) t = T.FORD;
        }
        for (const [sx, sy, sr] of scrapFields)
          if (t !== T.WATER && Math.hypot(x - sx, y - sy) < sr * (0.75 + vnoise(x, y, 3, 8) * 0.5)) { t = T.SCRAP; this.scrap[i] = 300 + ((hash3(x, 1, y) * 400) | 0); }
        if (t === T.GRASS && dBase > 10 && dr > 4 && hash3(x, 2, y) < 0.006) t = T.ROCK;
        this.type[i] = t;
        let e = 0;
        if (vnoise(x, y, 14, 5) > 0.64 && dBase > 17 && dr > 5 && x > 3 && y > 3 && x < N - 4 && y < N - 4 && t !== T.SCRAP) e = 2;
        this.elev[i] = e;
      }
    // square off each bridge: both columns span the same rows and rest one cell onto each bank
    for (const bx of [26, 101]) {
      let y0 = N, y1 = -1;
      for (let y = 0; y < N; y++) if (this.type[this.idx(bx, y)] === T.BRIDGE || this.type[this.idx(bx + 1, y)] === T.BRIDGE) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let y = y0 - 1; y <= y1 + 1; y++) for (const x of [bx, bx + 1]) { this.type[this.idx(x, y)] = T.BRIDGE; this.elev[this.idx(x, y)] = 0; }
    }
    // tidy plateaus: drop lone high cells, then cut ramps into the edges
    for (let pass = 0; pass < 2; pass++)
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = this.idx(x, y);
        if (this.elev[i] !== 2) continue;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.elev[this.idx(x + dx, y + dy)] === 2) n++;
        if (n < 2) this.elev[i] = 0;
      }
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = this.idx(x, y);
      if (this.elev[i] !== 2) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.elev[this.idx(x + dx, y + dy)] === 0);
      if (edge && hash3(x, 3, y) < 0.16) this.elev[i] = 1;
    }
    this.layoutSettlements();
    // forests
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = this.idx(x, y);
      const dBase = Math.min(Math.hypot(x - p1[0], y - p1[1]), Math.hypot(x - p2[0], y - p2[1]));
      if (this.type[i] !== T.GRASS || this.elev[i] === 1 || dBase < 14 || this.nearVillage(x, y, 9) || this.sites.some((s) => x >= s.cx - 2 && x < s.cx + s.w + 2 && y >= s.cy - 2 && y < s.cy + s.h + 2)) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = this.type[this.idx(x + dx, y + dy)]; return t === T.WATER || t === T.BRIDGE || t === T.FORD; });
      if (near) continue;
      const dense = vnoise(x, y, 9, 9);
      if (dense > 0.57 || hash3(x, 4, y) < 0.015) {
        const count = dense > 0.66 ? 3 : dense > 0.57 ? 2 : 1;
        this.forest[i] = count;
        for (let k = 0; k < count; k++)
          this.trees.push([x * CELL + 4 + hash3(x, 10 + k, y) * 16, y * CELL + 5 + ((k + hash3(x, 20 + k, y)) / count) * 15]);
      }
    }
  }

  nearVillage(x: number, y: number, r: number) { return this.villages.some(([vx, vy]) => Math.hypot(x - vx, y - vy) < r); }

  // Roads, villages with fields, and the capturable sites. Deterministic, so workers agree.
  layoutSettlements() {
    const wet = (t: number) => t === T.WATER || t === T.BRIDGE || t === T.FORD;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y);
      let d = 1e9;
      for (const line of this.roadLines) d = Math.min(d, lineDist(x + 0.5, y + 0.5, line)[0]);
      if (d < 3 && !wet(this.type[i])) this.elev[i] = 0;          // roads run on level ground
      if (d < 1.1 && !wet(this.type[i])) { this.type[i] = T.ROAD; this.scrap[i] = 0; }
      if (this.nearVillage(x, y, 7) && !wet(this.type[i])) {
        this.elev[i] = 0;
        if (this.type[i] !== T.ROAD) this.type[i] = T.GRASS;
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
    const place = (kind: string, cx: number, cy: number, w: number, h: number) => {
      for (let r = 0; r < 7; r++) for (let a = 0; a < 16; a++) {
        const x = Math.round(cx + Math.cos((a / 16) * Math.PI * 2) * r), y = Math.round(cy + Math.sin((a / 16) * Math.PI * 2) * r);
        if (!free(x, y, w, h)) continue;
        this.sites.push({ kind, cx: x, cy: y, w, h });
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.occupied[this.idx(xx, yy)] = 1;
        return;
      }
    };
    const homes = ['cottage', 'cottage2', 'townhouse', 'cottage', 'shop', 'barn', 'townhouse', 'cottage2'];
    this.villages.forEach(([vx, vy], v) => {
      // farm fields beside each village
      const fx = vx + (v % 2 ? -10 : 5), fy = vy + (v < 2 ? 4 : -9);
      for (let y = fy; y < fy + 5; y++) for (let x = fx; x < fx + 7; x++)
        if (this.inside(x, y) && this.type[this.idx(x, y)] === T.GRASS && this.elev[this.idx(x, y)] === 0) this.type[this.idx(x, y)] = T.FIELD;
      for (let k = 0; k < 6; k++) {
        const kind = homes[(k + v * 3) % homes.length], big = kind === 'barn' || kind === 'townhouse';
        place(kind, vx + Math.round(Math.cos(k * 1.1 + v) * 3), vy + Math.round(Math.sin(k * 1.1 + v) * 3), big ? 2 : 1, 1);
      }
      place('waterTower', vx + 2, vy - 3, 1, 1);
    });
    place('motorPool', 40, 30, 3, 2);
    place('recruitOffice', 88, 100, 2, 2);
    place('watchtower', 60, 84, 1, 1);
    place('bunker', 24, 58, 1, 1);
    place('bunker', 104, 66, 1, 1);
    place('bunker', 66, 76, 1, 1);
  }

  // ------------------------------------------------------------ painting
  // Painting is split into chunks so the title screen can show progress: prepare(), then
  // paintChunk(i) for i < chunkCount, then finish().
  get chunkCount() { return this.cw * this.chh; }
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
    // Ground type for every pixel, worked out once (soft = ragged blend edges, hard = nearly exact).
    const PW = MAP, PH = MAP - OY, soft = new Uint8Array(PW * PH), hard = new Uint8Array(PW * PH);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const py = y + OY, wx = warp(this.wT, x, py, 0), wy = warp(this.wT, x, py, 1);
      let cx = Math.floor((x + wx) / CELL), cy = Math.floor((py + wy) / CELL);
      soft[y * PW + x] = cx >= 0 && cy >= 0 && cx < N && cy < N ? this.type[cy * N + cx] : T.GRASS;
      cx = Math.floor((x + wx * 0.3) / CELL); cy = Math.floor((py + wy * 0.3) / CELL);
      hard[y * PW + x] = cx >= 0 && cy >= 0 && cx < N && cy < N ? this.type[cy * N + cx] : T.GRASS;
    }
    const typeW = (px: number, py: number, isSoft: boolean) => {
      px = Math.round(px); py = Math.round(py);
      if (px < 0 || px >= PW || py < OY || py >= MAP) return T.GRASS;
      return (isSoft ? soft : hard)[(py - OY) * PW + px];
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
        // pebbles: bright top-left pixel, dark bottom-right pixel; grass overhang casts a dark lip
        if (grassUp) return SOIL_LO;
        const px = Math.floor(X / 4), py = Math.floor(Y / 4), ox = px * 4 + ((hash3(px, 2, py) * 3) | 0), oy = py * 4 + ((hash3(px, 3, py) * 3) | 0);
        if (hash3(px, 4, py) < 0.07) { if (X === ox && Y === oy) return SOIL_HI; if (X === ox + 1 && Y === oy + 1) return SOIL_LO; if (X === ox + 1 && Y === oy) return SOIL[0]; }
        const n = field(gx, gy, 1);
        return shadeHex(SOIL[n > 0.62 ? 1 : n < 0.38 ? 2 : 0], 0.94 + n * 0.12);
      }
      // grass: a lush-to-dry blend in big patches, then clumps drawn as a bright tip over a dark base
      const fcx = this.cellOf(gx + warp(this.wT, gx, gy, 0) * 0.6), fcy = this.cellOf(gy + warp(this.wT, gx, gy, 1) * 0.6);
      const woods = this.inside(fcx, fcy) && this.forest[this.idx(fcx, fcy)] >= 2;
      if (woods) {
        if (h < 0.02) return NEEDLE;
        return FOREST[field(gx, gy, 1) > 0.5 ? 1 : 0];
      }
      const dry = Math.min(1, Math.max(0, (field(gx, gy, 0) - 0.42) * 2.6 + dith(X, Y) * 0.5));
      const pal = e === 2 ? HIGH : dry > 0.5 ? DRY : LUSH;
      const cxl = Math.floor(X / 4), cyl = Math.floor(Y / 4);
      const k = hash3(cxl, 5, cyl);
      if (k < 0.16) {
        const ox = cxl * 4 + ((hash3(cxl, 6, cyl) * 3) | 0), oy = cyl * 4 + ((hash3(cxl, 7, cyl) * 2) | 0);
        if (X === ox && Y === oy) return k < 0.006 ? FLOWERS[(k * 500) % 3 | 0] : dry > 0.5 ? TIP_DRY : TIP;
        if (X === ox && Y === oy + 1) return shadeHex(pal[0], 1.18);
        if ((X === ox - 1 || X === ox + 1) && Y === oy + 1) return shadeHex(pal[1], 1.08);
        if (Y === oy + 2 && X >= ox - 1 && X <= ox + 1) return BASE;
      }
      if (!grassDown) return shadeHex(pal[0], 1.2); // sunlit edge where grass meets bare ground
      const n = field(gx, gy, 1);
      return shadeHex(pal[n > 0.64 ? 1 : n < 0.36 ? 2 : 0], 0.93 + n * 0.14);
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
    const M = 64, step = SW / M;
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
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ctx.drawImage(this.chunks[r * this.cw + c], c * CH - vx, r * CH + OY - vy);
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
      ctx.fillStyle = t === T.DIRT || t === T.SCRAP ? 'rgba(40,28,16,0.30)' : 'rgba(30,38,18,0.32)';
      ctx.fillRect(Math.round(x + ox), Math.round(y + oy), 1, 1);
      ctx.fillRect(Math.round(x - ox), Math.round(y - oy), 1, 1);
    });
  }
}

function shadeHex(c: number, k: number) {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}
