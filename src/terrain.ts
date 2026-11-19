// The map: 128 x 128 cells of 24 pixels (about 7 m each), so roughly 900 m across.
// Cells say what the ground is and how high (low, ramp, high plateau). The ground is painted
// pixel by pixel into big canvases once at load, with ragged natural edges, and then marked as
// the battle goes on: tank tracks, stumps, fallen trees.
import { hash3 } from './voxel';

export const CELL = 24, N = 128, MAP = CELL * N, LIFT = 8; // LIFT: pixels per elevation step
export const enum T { GRASS, DIRT, SCRAP, WATER, BRIDGE, FORD, ROCK }
const CH = 512, OY = -24; // chunk size; the painted area starts a little above row 0 for raised ground

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

// ---- hand-picked palette ----
const GRASS = [0x3d5a26, 0x41602a, 0x395424, 0x3f5c28], GRASS_HI = 0x5a7c34, GRASS_LO = 0x2c431c;
const HIGHGRASS = [0x4a6230, 0x4e6832, 0x465c2c];
const FOREST = [0x3e4a28, 0x44502a, 0x4a4630]; // needle-strewn forest floor
const DIRT = [0x6b5236, 0x75593a, 0x664e33], PEBBLE = 0x8e7a5c;
const SCRAPBED = [0x54432f, 0x5c4a34];
const SCRAP = [0x8a4a26, 0xa85c2c, 0x6e3a20, 0x7c7f86, 0x5d6168, 0x9a5228];
const WATER = [0x2b5882, 0x2f5e8a], DEEP = 0x254e76, RIPPLE = 0x5f8fbc, FOAM = 0xc6d8e2, SHALLOW = 0x4a7aa0, SAND = 0xa48d5e;
const STRATA = [0x6f6658, 0x5f584c, 0x7b7262, 0x585145], LIP = 0x86955a;
const PLANK = [0x7a5a38, 0x6e5032], RAIL = 0x3a2c1e, ROCKS = [0x8a8478, 0x767064, 0x5c574e, 0xa29c8e];

export class Terrain {
  type = new Uint8Array(N * N);
  elev = new Uint8Array(N * N); // 0 low, 1 ramp, 2 high
  forest = new Uint8Array(N * N); // standing trees in the cell
  occupied = new Uint8Array(N * N); // buildings
  scrap = new Uint16Array(N * N);
  chunks: HTMLCanvasElement[] = [];
  cw = Math.ceil(MAP / CH); chh = Math.ceil((MAP - OY) / CH);
  minimap = document.createElement('canvas');
  trees: P[] = [];
  bases: P[] = [[16, 110], [110, 17]];
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
          if (Math.abs(rx - 26) < 1.6 || Math.abs(rx - 101) < 1.6) t = T.BRIDGE;
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
    // forests
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = this.idx(x, y);
      const dBase = Math.min(Math.hypot(x - p1[0], y - p1[1]), Math.hypot(x - p2[0], y - p2[1]));
      if (this.type[i] !== T.GRASS || this.elev[i] === 1 || dBase < 14) continue;
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

  // ------------------------------------------------------------ painting
  // Painting is split into chunks so the title screen can show progress: prepare(), then
  // paintChunk(i) for i < chunkCount, then finish().
  get chunkCount() { return this.cw * this.chh; }
  private pixel: (px: number, py: number) => number;
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
    const typeW = (px: number, py: number, soft: boolean) => {
      const s = soft ? 1 : 0.3;
      const cx = this.cellOf(px + warp(this.wT, px, py, 0) * s), cy = this.cellOf(py + warp(this.wT, px, py, 1) * s);
      return this.inside(cx, cy) ? this.type[this.idx(cx, cy)] : T.GRASS;
    };
    const isWet = (t: number) => t === T.WATER || t === T.BRIDGE || t === T.FORD;

    const surface = (gx: number, gy: number, e: number): number => {
      const cell = this.idx(Math.min(N - 1, Math.max(0, this.cellOf(gx))), Math.min(N - 1, Math.max(0, this.cellOf(gy))));
      const hard = typeW(gx, gy, false);
      const h = hash3(gx, 1, gy);
      if (e === 1) return (gy % 3 === 0 ? 0x5e4830 : DIRT[(h * 3) | 0]);
      if (isWet(hard)) {
        if (hard === T.BRIDGE) {
          const lx = gx - Math.floor(gx / CELL) * CELL;
          const westEdge = !isWet(typeW(gx - 3, gy, false)) || typeW(gx - 2, gy, false) !== T.BRIDGE;
          const eastEdge = typeW(gx + 2, gy, false) !== T.BRIDGE;
          if (westEdge || eastEdge) return gy % 6 === 0 ? 0x2a2018 : RAIL;
          return gy % 3 === 0 ? 0x4e3a26 : PLANK[(Math.floor(gy / 3) + (lx > 11 ? 1 : 0)) % 2];
        }
        let shore = 9;
        for (const r of [2, 4, 6]) {
          if (!isWet(typeW(gx + r, gy, false)) || !isWet(typeW(gx - r, gy, false)) || !isWet(typeW(gx, gy + r, false)) || !isWet(typeW(gx, gy - r, false))) { shore = r; break; }
        }
        if (hard === T.FORD) return h < 0.08 ? 0x8a8070 : h < 0.16 ? RIPPLE : shore <= 2 ? SAND : SHALLOW;
        if (shore <= 2) return h < 0.5 ? FOAM : SAND;
        if (shore <= 4) return SHALLOW;
        if (gy % 3 === 0 && hash3(Math.floor(gx / 5), 7, gy) < 0.12) return RIPPLE;
        return vnoise(gx, gy, 23, 31) > 0.55 ? DEEP : WATER[(h * 2) | 0];
      }
      if (hard === T.ROCK) {
        const cx = Math.floor(gx / CELL) * CELL + 12, cy = Math.floor(gy / CELL) * CELL + 12;
        const dx = gx - cx, dy = gy - cy, r = 8 + hash3(cx, 3, cy) * 3 + (vnoise(gx, gy, 3, 41) - 0.5) * 3;
        const d = Math.hypot(dx, dy * 1.3);
        if (d < r) return d > r - 1.2 ? ROCKS[2] : dx + dy < -4 ? ROCKS[3] : dx + dy > 5 ? ROCKS[1] : ROCKS[0];
        if (d < r + 2 && dx + dy > 0) return GRASS_LO; // boulder's shadow
      }
      let t = typeW(gx, gy, true);
      if (t === T.ROCK || isWet(t)) t = T.GRASS;
      if (t === T.SCRAP && this.type[cell] !== T.SCRAP && hash3(gx, 9, gy) < 0.5) t = T.DIRT;
      if (t === T.SCRAP) {
        const bx = Math.floor(gx / 3), by = Math.floor(gy / 2);
        if (hash3(bx, 5, by) < 0.42) {
          const c = SCRAP[(hash3(bx, 6, by) * SCRAP.length) | 0];
          if (gx % 3 === 0 && gy % 2 === 0) return hash3(bx, 7, by) < 0.15 ? 0xd8dce0 : shadeHex(c, 1.25);
          return gy % 2 === 1 && gx % 3 === 2 ? shadeHex(c, 0.7) : c;
        }
        return SCRAPBED[(h * 2) | 0];
      }
      if (t === T.DIRT) {
        if (h < 0.025) return PEBBLE;
        if (hash3(gx, 1, gy - 1) < 0.025) return 0x4e3b26;
        return DIRT[(h * 3) | 0];
      }
      // grass (darker forest floor, drier on the high ground)
      // forest floor only under real woods, with the same ragged edge as other ground
      const fcx = this.cellOf(gx + warp(this.wT, gx, gy, 0) * 0.6), fcy = this.cellOf(gy + warp(this.wT, gx, gy, 1) * 0.6);
      const woods = this.inside(fcx, fcy) && this.forest[this.idx(fcx, fcy)] >= 2;
      const pal = woods ? FOREST : e === 2 ? HIGHGRASS : GRASS;
      if (h < 0.035) return GRASS_HI;
      if (hash3(gx, 1, gy - 1) < 0.035) return GRASS_LO;
      if (h > 0.997) return 0xe8d870;
      const n = vnoise(gx, gy, 13, 33);
      return n > 0.66 ? shadeHex(pal[0], 1.1) : n < 0.3 ? shadeHex(pal[0], 0.9) : pal[(h * pal.length) | 0];
    };

    const pixel = (px: number, py: number): number => {
      for (const e of [2, 1]) {
        const gy = py + e * LIFT;
        if (elevW(px, gy) === e) {
          if (e === 2 && elevW(px, gy + 2) < 2) return LIP;
          return surface(px, gy, e);
        }
      }
      const here = elevW(px, py);
      if (here > 0) {
        let k = 1;
        while (k < here * LIFT && elevW(px, py + k) >= here) k++;
        if (here === 1) return k % 2 ? 0x5a4630 : 0x6b5236;
        const c = STRATA[(Math.floor(py / 2) + (hash3(px, 0, Math.floor(py / 2)) < 0.15 ? 1 : 0)) % 4];
        return k <= 2 ? shadeHex(c, 0.72) : k >= here * LIFT - 1 ? shadeHex(c, 1.12) : c;
      }
      return surface(px, py, 0);
    };

    this.pixel = pixel;
  }

  paintChunk(i: number) {
    const cx = i % this.cw, cy = Math.floor(i / this.cw), pixel = this.pixel;
    {
      {
        const c = document.createElement('canvas');
        c.width = CH; c.height = CH;
        const ctx = c.getContext('2d')!;
        const img = ctx.createImageData(CH, CH), d = img.data;
        for (let y = 0; y < CH; y++) {
          const py = cy * CH + y + OY;
          for (let x = 0; x < CH; x++) {
            const px = cx * CH + x;
            const col = px >= MAP || py >= MAP ? 0x0d0c0b : pixel(px, py);
            const k = (y * CH + x) * 4;
            d[k] = col >> 16; d[k + 1] = (col >> 8) & 255; d[k + 2] = col & 255; d[k + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        this.chunks[i] = c;
      }
    }
  }

  finish() { this.paintMinimap(); }

  paintMinimap() {
    const M = 64;
    this.minimap.width = M; this.minimap.height = M;
    const ctx = this.minimap.getContext('2d')!;
    const img = ctx.createImageData(M, M), d = img.data;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      let r = 0, g = 0, b = 0;
      for (let s = 0; s < 4; s++) {
        const cx = x * 2 + (s & 1), cy = y * 2 + (s >> 1), i = this.idx(cx, cy), t = this.type[i];
        let c = t === T.WATER ? 0x2f5e8a : t === T.FORD ? 0x4a7aa0 : t === T.BRIDGE ? 0x7a5a38 : t === T.SCRAP ? 0x8a5a30 : t === T.DIRT ? 0x6b5236 : t === T.ROCK ? 0x767064 : this.forest[i] ? 0x24401c : 0x3d5a26;
        if (this.elev[i] === 2 && t === T.GRASS && !this.forest[i]) c = 0x55703a;
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

  // Tread marks: two dark lines pressed into soft ground.
  track(px: number, py: number, angle: number, half: number) {
    const i = this.idx(this.cellOf(px), this.cellOf(py)), t = this.type[i];
    if (t === T.WATER || t === T.BRIDGE || t === T.FORD) return;
    const sx = Math.round(px), sy = Math.round(py - this.lift(px, py));
    const ox = -Math.sin(angle) * half, oy = Math.cos(angle) * half;
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
