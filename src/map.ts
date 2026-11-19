// The proof battlefield, designed by hand: lowland meadow and pine forest, a river with a ford,
// a rocky cliff, and an enemy compound on the high ground. One block = one pixel on screen,
// so every colour choice here is a pixel-art decision.
import { World, Building } from './world';
import { hash3, mix } from './voxel';

const pick = (cols: number[], x: number, y: number, z: number) => cols[(hash3(x, y, z) * cols.length) | 0];
function noise(x: number, z: number, s: number, seed: number) {
  const fx = x / s, fz = z / s, ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz, u = tx * tx * (3 - 2 * tx), v = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number) => hash3(a, seed, b);
  return (h(ix, iz) * (1 - u) + h(ix + 1, iz) * u) * (1 - v) + (h(ix, iz + 1) * (1 - u) + h(ix + 1, iz + 1) * u) * v;
}
type P = [number, number];
function lineDist(x: number, z: number, pts: P[]) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// ---- hand-picked palette ----
const GRASS = [0x3d5a26, 0x41602a, 0x395424, 0x3d5a26];
const GRASS_HI = 0x587a32, GRASS_LO = 0x2c431c;
const PLATEAU = [0x4a6230, 0x4e6832, 0x465c2c];
const SOIL = [0x6b5236, 0x664e33];
const ROAD = [0x7a6040, 0x735a3c, 0x7f6544], RUT = 0x56412b;
const YARD = [0x76664a, 0x6e5f44, 0x7c6c50];
const STRATA = [0x6f6658, 0x5f584c, 0x7b7262, 0x585145];
const SAND = [0xa48d5e, 0x99835a];
const WATER = [0x2c5a84, 0x31608c], RIPPLE = 0x5f8fbc, FOAM = 0xc6d8e2, SHALLOW = 0x4a7aa0;
const ROCK = [0x7a7468, 0x6a6458, 0x857e70];
const PINE = [0x1d3518, 0x24421d, 0x2f5425, 0x3d6a2e];
const CREAM = 0xe6dbc0, CREAM_D = 0xc8bba0, PLINTH = 0xb3a78f, GLASS = 0x2b3b5c, GLASS_HI = 0x6585b5;
const RED = 0xc4301f, RED_D = 0xa22717, RED_DD = 0x76190f, GOLD = 0xf0bf38, STEEL = 0x8a8e94, CHAR = 0x2a2a2e;

export const W = 320, D = 224;
const LOW = 12, HIGH = 20;
const SPAWN: P = [62, 196];
const ROADPTS: P[] = [[40, 222], [62, 196], [96, 168], [116, 134], [124, 116], [142, 94], [160, 72], [186, 56], [214, 50]];
const riverZ = (x: number) => 128 + 16 * Math.sin(x / 47 + 0.6) + 6 * Math.sin(x / 13);
const cliffZ = (x: number) => 66 + 8 * Math.sin(x / 23) + (noise(x, 0, 9, 3) - 0.5) * 8;

export interface MapData { world: World; spawn: P; }

export function buildProofMap(): MapData {
  const w = new World(W, D, 48);
  const hgt = new Int16Array(W * D);
  const kind = new Uint8Array(W * D); // 0 meadow, 1 plateau, 2 road, 3 sand, 4 water, 5 ford, 6 yard
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const rd = lineDist(x, z, ROADPTS);
      const cz = cliffZ(x);
      // the ramp: where the road meets the cliff the ground climbs gently
      let up = z < cz ? 1 : 0;
      if (rd < 9 && Math.abs(z - cz) < 14) up = Math.max(0, Math.min(1, (cz + 14 - z) / 28));
      let h = Math.round(LOW + (HIGH - LOW) * up);
      let k = up >= 1 ? 1 : 0;
      if (k === 0 && up === 0 && noise(x, z, 17, 1) > 0.72) h += 1; // gentle mounds
      if (k === 1 && noise(x, z, 13, 2) > 0.74) h += 1;
      const dr = Math.abs(z - riverZ(x)), hw = 7 + noise(x, 0, 11, 4) * 3;
      if (k === 0 && up === 0) {
        if (dr < hw) { h = rd < 7 ? LOW - 1 : LOW - 2; k = rd < 7 ? 5 : 4; }
        else if (dr < hw + 3) { h = LOW - 1; k = 3; }
      }
      if (rd < 3.2 && k !== 4 && k !== 5) k = 2;
      if (x > 168 && x < 276 && z > 12 && z < 60 && k === 1) k = 6;
      hgt[i] = h; kind[i] = k;
    }
  const Hm = (x: number, z: number) => hgt[Math.max(0, Math.min(D - 1, z)) * W + Math.max(0, Math.min(W - 1, x))];

  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x, h = hgt[i], k = kind[i];
      const minN = Math.min(Hm(x - 1, z), Hm(x + 1, z), Hm(x, z - 1), Hm(x, z + 1));
      const rd = lineDist(x, z, ROADPTS);
      for (let y = 0; y < h; y++) {
        const top = y === h - 1;
        let c: number;
        if (!top && y >= minN - 1 && h - minN >= 2) c = STRATA[((y >> 1) + (hash3(x, 0, z) < 0.2 ? 1 : 0)) % 4]; // cliff face
        else if (!top) c = y > h - 4 ? pick(SOIL, x, y, z) : pick(STRATA, x, y, z);
        else if (k === 4) {
          const dr = Math.abs(z - riverZ(x));
          c = dr > 5.5 + noise(x, 0, 11, 4) * 3 ? FOAM : hash3(x, 9, z) < 0.07 ? RIPPLE : pick(WATER, x, y, z);
        } else if (k === 5) c = hash3(x, 9, z) < 0.15 ? RIPPLE : hash3(x, 8, z) < 0.1 ? 0x8a8070 : SHALLOW;
        else if (k === 3) c = pick(SAND, x, y, z);
        else if (k === 2) c = Math.abs(rd - 1.6) < 0.5 ? RUT : pick(ROAD, x, y, z);
        else if (k === 6) c = hash3(x, 4, z) < 0.05 ? 0x8f8064 : pick(YARD, x, y, z);
        else {
          const base = k === 1 ? PLATEAU : GRASS;
          c = pick(base, x, y, z);
          const r = hash3(x, 3, z), n = noise(x, z, 6, 7);
          if (r < 0.05 + n * 0.05) c = GRASS_HI; else if (r > 0.94) c = GRASS_LO;
          if (h - minN >= 2) c = 0x6a8a3a; // sunlit lip of the cliff
        }
        w.set(x, y, z, c);
      }
    }

  hall(w, 200, 22);
  tower(w, 246, 28);
  // sandbag wall along the front of the compound, with a gap for the road
  for (let x = 168; x <= 276; x++) if (x < 206 || x > 222) sandbag(w, x, 61);
  for (let z = 14; z <= 61; z++) { sandbag(w, 168, z); sandbag(w, 276, z); }
  for (const [x, z] of [[184, 30], [186, 32], [262, 50], [180, 48]] as P[]) barrels(w, x, z);
  flag(w, 236, 46);

  // pine forest: dense clumps, kept off the road, river, cliff lip, compound and spawn
  const clear = (x: number, z: number) => {
    const k = kind[z * W + x];
    if (k !== 0 && k !== 1) return false;
    if (lineDist(x, z, ROADPTS) < 7) return false;
    if (Math.abs(z - riverZ(x)) < 15 || Math.abs(z - cliffZ(x)) < 5) return false;
    if (Math.hypot(x - SPAWN[0], z - SPAWN[1]) < 30) return false;
    if (x > 160 && x < 284 && z < 68) return false;
    return x > 3 && z > 3 && x < W - 4 && z < D - 4;
  };
  for (let z = 4; z < D - 4; z += 4)
    for (let x = 4; x < W - 4; x += 4) {
      const jx = x + Math.floor(hash3(x, 1, z) * 4), jz = z + Math.floor(hash3(x, 2, z) * 4);
      const dense = noise(jx, jz, 28, 9);
      if (dense < 0.5 || hash3(jx, 5, jz) > (dense - 0.45) * 2.2 || !clear(jx, jz)) continue;
      pine(w, jx, jz, hash3(jx, 6, jz));
    }
  // boulders in the river and on the meadow
  for (let i = 0; i < 40; i++) {
    const x = 6 + Math.floor(hash3(i, 11, 3) * (W - 12));
    const z = i < 14 ? Math.round(riverZ(x) + (hash3(i, 1, 1) - 0.5) * 10) : 6 + Math.floor(hash3(i, 12, 4) * (D - 12));
    if (i >= 14 && !clear(x, z)) continue;
    if (lineDist(x, z, ROADPTS) < 6) continue;
    boulder(w, x, z, 1 + hash3(i, 2, 2) * 1.6);
  }
  return { world: w, spawn: SPAWN };
}

// ------------------------------------------------------------------ structures
function fill(w: World, b: Building, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: (x: number, y: number, z: number) => number) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const col = c(x, y, z); if (col) w.set(x, y, z, col, b.id); }
}

// The Broadcast Hall: a cream civic building with a red tiled roof, a red portico,
// hanging banners, and a loudspeaker mast on the ridge.
function hall(w: World, x0: number, z0: number) {
  const b = w.addBuilding({ team: 2, kind: 'hq', name: 'Broadcast Hall', target: true, threshold: 0.42 });
  const x1 = x0 + 29, z1 = z0 + 19, base = w.heightAt(x0, z0);
  fill(w, b, x0 - 1, base, z0 - 1, x1 + 1, base, z1 + 1, (x, y, z) => (x + z) % 7 === 0 ? 0xa59a83 : PLINTH);
  const yb = base + 1, yt = base + 10;
  fill(w, b, x0, yb, z0, x1, yt, z1, (x, y, z) => {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    const ly = y - yb;
    if (!edge && ly > 0 && ly !== 5) return 0; // hollow, with one upper floor
    if (!edge) return 0x8a7f6c;
    const along = z === z0 || z === z1 ? x - x0 : z - z0;
    const front = z === z1;
    if (front && x >= x0 + 12 && x <= x0 + 17 && ly < 5) return ly < 4 && (x === x0 + 14 || x === x0 + 15) ? 0 : ly < 4 ? 0xb02a1e : CREAM_D; // red doors, dark gap
    if (ly === 0) return 0x8a7f6c;
    if (along % 5 === 0) return CREAM_D; // pilasters
    const win = (ly >= 2 && ly <= 3) || (ly >= 6 && ly <= 8);
    if (win && along % 5 !== 0 && along % 5 !== 3) return ly === 3 || ly === 8 ? GLASS_HI : GLASS;
    if (ly === 9) return CREAM_D;
    return CREAM;
  });
  // portico: two red columns and a lintel with a gold emblem
  for (const cx of [x0 + 11, x0 + 18]) fill(w, b, cx, yb, z1 + 2, cx, yb + 5, z1 + 2, () => RED);
  fill(w, b, x0 + 10, yb + 6, z1 + 1, x0 + 19, yb + 6, z1 + 2, (x) => (x === x0 + 14 || x === x0 + 15) ? GOLD : RED_D);
  fill(w, b, x0 + 10, base, z1 + 2, x0 + 19, base, z1 + 3, () => PLINTH);
  // hanging banners between the windows
  for (const bx of [x0 + 3, x0 + 25]) fill(w, b, bx, yb + 2, z1 + 1, bx + 1, yb + 8, z1 + 1, (x, y) => (y === yb + 6 ? GOLD : y === yb + 2 ? RED_D : RED));
  // red tiled gable roof, ridge along x, one block of overhang
  const rz0 = z0 - 1, rz1 = z1 + 1, mid = (rz0 + rz1) / 2;
  for (let z = rz0; z <= rz1; z++) {
    const ry = Math.floor(Math.min(z - rz0, rz1 - z) * 0.6);
    const yy = yt + 1 + ry;
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const ridge = Math.abs(z - mid) < 1;
      w.set(x, yy, z, ridge ? RED_DD : z % 2 ? RED : RED_D, b.id);
      if (x === x0 || x === x1) for (let y = yt + 1; y < yy; y++) w.set(x, y, z, CREAM, b.id); // gable ends
    }
  }
  const ridgeY = yt + 1 + Math.floor((rz1 - rz0) / 2 * 0.6);
  // vent stack and loudspeaker mast
  fill(w, b, x0 + 24, ridgeY - 2, z0 + 5, x0 + 25, ridgeY + 2, z0 + 6, (x, y) => (y === ridgeY + 2 ? CHAR : STEEL));
  fill(w, b, x0 + 5, ridgeY, Math.round(mid), x0 + 5, ridgeY + 6, Math.round(mid), () => CHAR);
  fill(w, b, x0 + 4, ridgeY + 5, Math.round(mid) + 1, x0 + 6, ridgeY + 6, Math.round(mid) + 1, (x) => x === x0 + 5 ? CHAR : CREAM);
}

// A lattice loudspeaker tower with red and white bands and a beacon.
function tower(w: World, x0: number, z0: number) {
  const b = w.addBuilding({ team: 2, kind: 'silo', name: 'Loudspeaker Tower', target: true, threshold: 0.5 });
  const base = w.heightAt(x0, z0);
  fill(w, b, x0 - 1, base, z0 - 1, x0 + 5, base, z0 + 5, () => PLINTH);
  for (let y = 1; y <= 24; y++) {
    const inset = Math.floor(y / 10);
    const a = x0 + inset, c = x0 + 4 - inset, za = z0 + inset, zc = z0 + 4 - inset;
    const band = Math.floor(y / 4) % 2 ? RED : 0xe8e0d0;
    for (const [px, pz] of [[a, za], [c, za], [a, zc], [c, zc]]) w.set(px, base + y, pz, band, b.id);
    if (y % 4 === 2) for (let t = a; t <= c; t++) { w.set(t, base + y, za, STEEL, b.id); w.set(t, base + y, zc, STEEL, b.id); w.set(a, base + y, z0 + t - x0, STEEL, b.id); w.set(c, base + y, z0 + t - x0, STEEL, b.id); }
  }
  const top = base + 25;
  fill(w, b, x0 - 1, top, z0 - 1, x0 + 5, top, z0 + 5, (x, y, z) => (x + z) % 2 ? CHAR : 0x3a3a40);
  for (const [dx, dz] of [[2, -2], [2, 6], [-2, 2], [6, 2]]) fill(w, b, x0 + dx - (dz === 2 ? 0 : 1), top + 1, z0 + dz - (dx === 2 ? 0 : 1), x0 + dx + (dz === 2 ? 0 : 1), top + 2, z0 + dz + (dx === 2 ? 0 : 1), () => CREAM);
  fill(w, b, x0 + 2, top + 1, z0 + 2, x0 + 2, top + 4, z0 + 2, (x, y) => y === top + 4 ? 0xff3a2a : STEEL);
}

function sandbag(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'wall', name: 'Sandbags', crushable: true, threshold: 0 });
  const y = w.heightAt(x, z);
  w.set(x, y, z, hash3(x, 1, z) < 0.5 ? 0xb39a64 : 0x9e8654, b.id);
  w.set(x, y + 1, z, hash3(x, 2, z) < 0.5 ? 0xc2a970 : 0xab9360, b.id);
}
function barrels(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'prop', name: 'Barrels', crushable: true, threshold: 0.3 });
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [2, 1]]) {
    const y = w.heightAt(x + dx, z + dz), c = (dx + dz) % 2 ? RED : 0x56603a;
    w.set(x + dx, y, z + dz, c, b.id); w.set(x + dx, y + 1, z + dz, mix(c, 0xffffff, 0.15), b.id);
  }
}
function flag(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'prop', name: 'Flag', crushable: true, threshold: 0.5 });
  const y = w.heightAt(x, z);
  for (let j = 0; j < 12; j++) w.set(x, y + j, z, j === 11 ? GOLD : 0xbdbdb6, b.id);
  fill(w, b, x + 1, y + 7, z, x + 5, y + 10, z, (xx, yy) => (xx === x + 3 && yy === y + 9 ? GOLD : RED));
}
function pine(w: World, x: number, z: number, r: number) {
  const b = w.addBuilding({ team: 0, kind: 'tree', name: 'Tree', crushable: true, threshold: 0.5 });
  const y0 = w.heightAt(x, z), hh = 6 + Math.floor(r * 4);
  w.set(x, y0, z, 0x4a3524, b.id); w.set(x, y0 + 1, z, 0x4a3524, b.id);
  for (let j = 0; j < hh; j++) {
    const rad = (1 - j / hh) * (2.4 + r * 0.8) + 0.3;
    const shade = PINE[Math.min(3, Math.floor((j / hh) * 3.2 + 0.2))];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > rad || (d > rad - 0.7 && hash3(x + dx, j, z + dz) < 0.3)) continue;
      w.set(x + dx, y0 + 2 + j, z + dz, d > rad - 0.8 && dx < 0 && dz < 0 ? PINE[Math.min(3, PINE.indexOf(shade) + 1)] : shade, b.id);
    }
  }
}
function boulder(w: World, x: number, z: number, r: number) {
  const y0 = w.heightAt(x, z);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy < 3; dy++)
    if (Math.hypot(dx, dy * 1.4, dz) < r + (hash3(x + dx, dy, z + dz) - 0.5) * 0.6) w.set(x + dx, y0 + dy - 1, z + dz, dy > 0 && dx < 0 ? 0x948d7e : pick(ROCK, x + dx, dy, z + dz));
}
