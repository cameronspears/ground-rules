// The test battlefield: dusty lowlands, a road network, a small town, and an enemy compound
// on a cliff-edged plateau. Everything is built from blocks at 2 blocks per metre.
import { World, Building } from './world';
import { hash3, mix, shade } from './voxel';

// ---- palette: dusty earth, loud propaganda accents ----
// dark, rich ground so the buildings and units pop
const GRASS = [0x3f5a2a, 0x4a6630, 0x355024, 0x52703a];
const DRY = [0x6f6a3a, 0x7a7442, 0x655f34];
const DIRT = [0x6e5a3e, 0x7d6646, 0x5f4d35, 0x846c4a];
const ROCK = [0x6a665c, 0x5c5850, 0x77736a, 0x4e4b45];
const ASPHALT = [0x3c3c3e, 0x424246, 0x37373a];
const PAVE = [0x8d8a82, 0x85827a, 0x95928a];
const CONC = [0xcfc6b2, 0xc6bda8, 0xd6cdb9];
const CONC_D = [0x9e9584, 0x958c7c];
const BRICK = [0xb5703f, 0xa8653a, 0xbd7a48];
const RED = 0xd23a26, RED_D = 0x8e2216, CREAM = 0xefe2c4, GOLD = 0xf4b833, CHAR = 0x2e2e33, STEEL = 0x6c7078, GLASS = 0x24324c, GLASS_L = 0x4d6b94, LIT = 0xffd77a;

const pick = (cols: number[], x: number, y: number, z: number) => cols[(hash3(x, y, z) * cols.length) | 0];

function noise(x: number, z: number, s: number, seed: number) {
  const fx = x / s, fz = z / s, ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const u = tx * tx * (3 - 2 * tx), v = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number) => hash3(a, seed, b);
  return (h(ix, iz) * (1 - u) + h(ix + 1, iz) * u) * (1 - v) + (h(ix, iz + 1) * (1 - u) + h(ix + 1, iz + 1) * u) * v;
}

type P = [number, number];
function segDist(x: number, z: number, a: P, b: P) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return { d: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), along: t * Math.sqrt(l2), side: ((x - a[0]) * dz - (z - a[1]) * dx) / Math.sqrt(l2) };
}
function lineDist(x: number, z: number, pts: P[]) {
  let best = { d: 1e9, along: 0, side: 0 }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(x, z, pts[i], pts[i + 1]);
    if (r.d < best.d) best = { d: r.d, along: acc + r.along, side: r.side };
    acc += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return best;
}

export interface MapData { world: World; spawn: [number, number]; }

const ROADS: P[][] = [
  [[18, 30], [48, 48], [84, 74], [112, 100], [130, 124], [150, 140]],
  [[24, 208], [62, 168], [96, 118], [112, 100], [150, 52], [206, 18]],
];
const PLATEAU: P = [160, 156];
const PR = 54, LOW = 10, HIGH = 18;
const SPAWN: P = [46, 46];

export function buildTestMap(): MapData {
  const W = 224, D = 224, H = 96;
  const w = new World(W, D, H);
  const hgt = new Int16Array(W * D);
  const road = (x: number, z: number) => {
    let best = { d: 1e9, along: 0, side: 0 };
    for (const r of ROADS) { const q = lineDist(x, z, r); if (q.d < best.d) best = q; }
    return best;
  };

  // ---- heights: gentle lowland, a flat plateau with cliffs, ramps where the roads climb ----
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const rd = road(x, z).d;
      const dP = Math.hypot(x - PLATEAU[0], z - PLATEAU[1]) + (noise(x, z, 9, 4) - 0.5) * 6;
      const width = rd < 10 ? 18 : 1.2;
      const t = Math.max(0, Math.min(1, (PR - dP) / width + 0.5));
      let low = LOW + (noise(x, z, 46, 1) - 0.5) * 5 + (noise(x, z, 17, 2) - 0.5) * 1.6;
      const dS = Math.hypot(x - SPAWN[0], z - SPAWN[1]);
      if (dS < 30) low += (LOW - low) * Math.min(1, (30 - dS) / 10);
      if (rd < 7) low += (Math.round(low) - low) * 0.5;
      hgt[z * W + x] = Math.round(low + (HIGH - low) * t);
    }
  const Hm = (x: number, z: number) => hgt[Math.max(0, Math.min(D - 1, z)) * W + Math.max(0, Math.min(W - 1, x))];

  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const h = Hm(x, z);
      const minN = Math.min(Hm(x - 1, z), Hm(x + 1, z), Hm(x, z - 1), Hm(x, z + 1));
      const cliff = h - minN >= 2;
      const r = road(x, z);
      const dP = Math.hypot(x - PLATEAU[0], z - PLATEAU[1]);
      for (let y = 0; y < h; y++) {
        const depth = h - 1 - y;
        let c: number;
        if (y === 0) c = 0x3a3330;
        else if (cliff && y >= minN - 1) c = shade(pick(ROCK, x, y, z), 0.92 + ((y >> 1) % 3) * 0.06);
        else if (depth === 0) {
          if (r.d < 4.6) {
            c = pick(ASPHALT, x, y, z);
            if (Math.abs(r.side) < 0.6 && Math.floor(r.along / 3) % 2 === 0) c = 0xd9bf4f;
            if (Math.abs(Math.abs(r.side) - 3.9) < 0.5) c = 0xc9c7bb;
            if (hash3(x, 5, z) < 0.04) c = shade(c, 0.8);
          } else if (r.d < 5.8) c = pick(DIRT, x, y, z);
          else if (dP < PR - 8 && h >= HIGH) {
            c = pick(PAVE, x, y, z);
            if (x % 8 === 0 || z % 8 === 0) c = shade(c, 0.86);
            if (hash3(x, 8, z) < 0.03) c = shade(c, 0.75);
          } else {
            const n = noise(x, z, 11, 5), n2 = noise(x, z, 5, 6);
            c = n > 0.62 ? pick(DRY, x, y, z) : n2 < 0.2 ? pick(DIRT, x, y, z) : pick(GRASS, x, y, z);
            const k = hash3(x, 3, z);
            if (k < 0.006) c = 0xe8d36a; else if (k < 0.009) c = 0xd8d4c4;
          }
        } else if (depth < 4) c = pick(DIRT, x, y, z);
        else c = pick(ROCK, x, y, z);
        w.set(x, y, z, c);
      }
    }
  const g = (x: number, z: number) => w.heightAt(x, z);

  // ---- enemy compound ----
  ministry(w, 148, 146);
  hall(w, 112, 168);
  depot(w, 186, 112);
  for (const [tx, tz] of [[126, 130], [152, 108], [108, 154]] as P[]) bunker(w, tx, tz);
  // sandbag lines near the ramp and edges
  sandbags(w, 120, 118, 140, 110); sandbags(w, 104, 140, 104, 166); sandbags(w, 142, 104, 168, 98);
  sandbags(w, 70, 88, 80, 80);
  // yard clutter
  for (const [x, z] of [[132, 150], [136, 152], [176, 130], [180, 134], [140, 186], [170, 186], [200, 150]] as P[]) barrels(w, x, z);
  for (const [x, z] of [[128, 160], [174, 140], [196, 136], [158, 190]] as P[]) crates(w, x, z);
  fence(w, 182, 100, 206, 100); fence(w, 206, 100, 206, 128); fence(w, 110, 196, 140, 204);
  for (const [x, z] of [[134, 140], [146, 132], [176, 176], [130, 176]] as P[]) lamp(w, x, z);
  flag(w, 140, 140);

  // ---- a small town in the lowlands (neutral, still breakable) ----
  house(w, 92, 80, 14, 11, 0xd9cdb0, RED_D);
  house(w, 70, 104, 12, 12, 0xc2b18e, 0x5a6a7a);
  house(w, 122, 76, 16, 10, 0xe2d6bc, 0x7a4a32);
  house(w, 84, 136, 12, 10, 0xcbbd9c, RED_D);
  for (const [x, z] of [[80, 80], [104, 100], [66, 130]] as P[]) lamp(w, x, z);
  fence(w, 60, 96, 60, 118); fence(w, 106, 70, 120, 70);
  for (let i = 0; i < 6; i++) pylon(w, 30 + i * 30, 70 + i * 6 + (i % 2) * 2);

  // ---- woods ----
  const clear = (x: number, z: number) => {
    const r = road(x, z).d;
    return r > 9 && Math.hypot(x - PLATEAU[0], z - PLATEAU[1]) > PR + 6 && Math.hypot(x - SPAWN[0], z - SPAWN[1]) > 24 && x > 6 && z > 6 && x < W - 7 && z < D - 7
      && ![...w.buildings.values()].some((b) => b.kind !== 'tree' && x > b.min[0] - 6 && x < b.max[0] + 6 && z > b.min[2] - 6 && z < b.max[2] + 6);
  };
  const trees: P[] = [];
  for (let i = 0; i < 2500 && trees.length < 130; i++) {
    const x = 6 + Math.floor(hash3(i, 7, 1) * (W - 12)), z = 6 + Math.floor(hash3(i, 8, 2) * (D - 12));
    if (noise(x, z, 26, 9) < 0.5 || !clear(x, z) || trees.some(([a, b]) => Math.hypot(a - x, b - z) < 7)) continue;
    trees.push([x, z]);
    if (hash3(i, 1, 9) < 0.45) pine(w, x, z, hash3(i, 1, 1)); else broadleaf(w, x, z, hash3(i, 1, 1));
  }
  for (let i = 0; i < 160; i++) {
    const x = 6 + Math.floor(hash3(i, 17, 1) * (W - 12)), z = 6 + Math.floor(hash3(i, 18, 2) * (D - 12));
    if (clear(x, z)) bush(w, x, z, hash3(i, 3, 3));
  }
  for (let i = 0; i < 26; i++) {
    const x = 8 + Math.floor(hash3(i, 11, 3) * (W - 16)), z = 8 + Math.floor(hash3(i, 12, 4) * (D - 16));
    if (!clear(x, z)) continue;
    const y0 = g(x, z), r = 2 + hash3(i, 2, 2) * 2.5;
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) for (let dy = 0; dy < 5; dy++)
      if (Math.hypot(dx, dy * 1.3, dz) < r + (hash3(x + dx, dy, z + dz) - 0.5)) w.set(x + dx, y0 + dy - 1, z + dz, shade(pick(ROCK, x + dx, dy, z + dz), 1.05 - dy * 0.03));
  }
  return { world: w, spawn: SPAWN };
}

// ------------------------------------------------------------------ building helpers
type CF = (x: number, y: number, z: number) => number;
function fill(w: World, b: Building | null, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | CF) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const col = typeof c === 'number' ? c : c(x, y, z);
    if (col) w.set(x, y, z, col, b ? b.id : 0);
  }
}
function groundMax(w: World, x0: number, z0: number, x1: number, z1: number) {
  let m = 0;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) m = Math.max(m, w.heightAt(x, z));
  return m;
}
function foundation(w: World, b: Building, x0: number, z0: number, x1: number, z1: number, top: number, cols = CONC_D) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) for (let y = w.heightAt(x, z); y < top; y++) w.set(x, y, z, pick(cols, x, y, z), b.id);
}

// A brutalist government tower: podium, window grid, setback crown, rooftop clutter, and a huge poster.
function ministry(w: World, x0: number, z0: number) {
  const b = w.addBuilding({ team: 2, kind: 'hq', name: 'Ministry Tower', target: true, threshold: 0.42 });
  const PW = 34, PD = 30;
  const base = groundMax(w, x0, z0, x0 + PW, z0 + PD) + 1;
  foundation(w, b, x0, z0, x0 + PW, z0 + PD, base);
  // podium with steps on the front
  fill(w, b, x0, base, z0, x0 + PW, base + 2, z0 + PD, (x, y, z) => y === base + 2 ? pick(CONC_D, x, y, z) : pick(CONC, x, y, z));
  for (let s = 0; s < 3; s++) fill(w, b, x0 + 11 + s, base + s - 3 + 3 - 3 + 0, z0 - 1 - (2 - s), x0 + 23 - s, base + s - 1, z0 - 1 - (2 - s), (x, y, z) => pick(CONC, x, y, z));
  const tx0 = x0 + 3, tz0 = z0 + 3, tx1 = x0 + PW - 3, tz1 = z0 + PD - 3, ty0 = base + 3, ty1 = base + 42;
  for (let y = ty0; y <= ty1; y++)
    for (let z = tz0; z <= tz1; z++)
      for (let x = tx0; x <= tx1; x++) {
        const ex = x === tx0 || x === tx1, ez = z === tz0 || z === tz1;
        const fy = (y - ty0) % 6, floor = fy === 0;
        if (!ex && !ez && !floor) continue;
        let c = pick(CONC, x, y, z);
        if (ex || ez) {
          const along = ex ? z - tz0 : x - tx0;
          const pil = along % 5 === 0;
          if (pil) c = pick(CONC_D, x, y, z);
          else if (fy >= 2 && fy <= 4) c = fy === 4 ? GLASS_L : hash3(x, y, z) < 0.12 ? LIT : GLASS;
          if (floor) c = shade(pick(CONC, x, y, z), 0.9);
          if (ex && ez) c = RED;
        }
        // doorway
        if (z === tz0 && x >= tx0 + 11 && x <= tx0 + 17 && y < ty0 + 5) continue;
        w.set(x, y, z, c, b.id);
      }
  // entrance canopy with columns
  fill(w, b, tx0 + 9, ty0 + 6, tz0 - 4, tx0 + 19, ty0 + 6, tz0 - 1, RED);
  for (const cx of [tx0 + 9, tx0 + 13, tx0 + 15, tx0 + 19]) fill(w, b, cx, ty0, tz0 - 4, cx, ty0 + 5, tz0 - 4, CREAM);
  // red vertical banners on the side face
  for (const bz of [tz0 + 4, tz1 - 4]) fill(w, b, tx0 - 1, ty0 + 10, bz - 1, tx0 - 1, ty1 - 3, bz + 1, (x, y, z) => (y - ty0) % 7 === 3 ? GOLD : z === bz ? RED : RED_D);
  // crown: a setback block with a parapet
  const cx0 = tx0 + 4, cz0 = tz0 + 4, cx1 = tx1 - 4, cz1 = tz1 - 4, cy0 = ty1 + 1, cy1 = ty1 + 8;
  fill(w, b, cx0, cy0, cz0, cx1, cy1, cz1, (x, y, z) => {
    const edge = x === cx0 || x === cx1 || z === cz0 || z === cz1;
    if (!edge && y !== cy0 && y !== cy1) return 0;
    if (edge && (y - cy0) % 4 === 2 && (x + z) % 3) return GLASS;
    return y === cy1 ? RED_D : pick(CONC, x, y, z);
  });
  fill(w, b, tx0, ty1 + 1, tz0, tx1, ty1 + 1, tz1, (x, y, z) => (x === tx0 || x === tx1 || z === tz0 || z === tz1) && (x + z) % 2 === 0 ? RED_D : 0);
  // rooftop clutter on the lower roof
  fill(w, b, tx0 + 1, ty1 + 1, tz1 - 3, tx0 + 4, ty1 + 3, tz1 - 1, STEEL);
  fill(w, b, tx1 - 4, ty1 + 1, tz0 + 1, tx1 - 1, ty1 + 2, tz0 + 3, shade(STEEL, 1.15));
  fill(w, b, tx1 - 3, ty1 + 3, tz0 + 2, tx1 - 2, ty1 + 3, tz0 + 2, CHAR);
  // water tank on the crown
  const wx = cx1 - 4, wz = cz1 - 4;
  for (let y = 0; y < 7; y++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const r = Math.hypot(dx, dz);
    if (y < 2 ? (Math.abs(dx) === 2 && Math.abs(dz) === 2) : r < 3.2) w.set(wx + dx, cy1 + 1 + y, wz + dz, y < 2 ? CHAR : y === 6 ? RED_D : 0x8a8f7a, b.id);
  }
  // antenna mast with a dish
  const ax = cx0 + 3, az = cz0 + 3;
  for (let y = 0; y < 16; y++) w.set(ax, cy1 + 1 + y, az, y === 15 ? 0xff3a2a : y % 4 === 0 ? CREAM : CHAR, b.id);
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) if (Math.hypot(dy, dz) < 2.6) w.set(ax + 1, cy1 + 10 + dy, az + dz, CREAM, b.id);
  // the poster: a gold sunburst star on red, with rays
  const pz = tz0 - 1, px0 = tx0 + 5, px1 = tx1 - 5, py0 = ty0 + 9, py1 = ty0 + 33;
  const pcx = (px0 + px1) / 2, pcy = (py0 + py1) / 2 + 1;
  fill(w, b, px0, py0, pz, px1, py1, pz, (x, y) => {
    if (x === px0 || x === px1 || y === py0 || y === py1) return RED_D;
    const dx = x - pcx, dy = y - pcy, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
    if (y < py0 + 5) return (x + y) % 2 ? CREAM : 0xe6d6b0;
    const star = r < 3.2 + 4.2 * Math.max(0, Math.cos(a * 5 - Math.PI / 2)) ** 3;
    if (r < 8.5) return star ? GOLD : RED;
    if (r < 9.5) return GOLD;
    return Math.floor((a + Math.PI) / (Math.PI / 10)) % 2 ? CREAM : 0xf0cf8f;
  });
  for (let x = px0 + 2; x <= px1 - 2; x++) if (x % 2 === 0) w.set(x, py0 + 2, pz - 0, CHAR, b.id);
}

// A brick hall with a red gable roof, big doors, a chimney.
function hall(w: World, x0: number, z0: number) {
  const b = w.addBuilding({ team: 2, kind: 'barracks', name: 'Volunteer Hall', target: true, threshold: 0.4 });
  const L = 28, Dd = 18, Hh = 10;
  const base = groundMax(w, x0, z0, x0 + L, z0 + Dd);
  foundation(w, b, x0, z0, x0 + L, z0 + Dd, base);
  fill(w, b, x0, base, z0, x0 + L, base + Hh, z0 + Dd, (x, y, z) => {
    const edge = x === x0 || x === x0 + L || z === z0 || z === z0 + Dd;
    if (!edge && y > base) return 0;
    const ly = y - base;
    if (z === z0 && x >= x0 + 10 && x <= x0 + 18 && ly > 0 && ly < 7) return 0; // doors
    if (edge && ly >= 3 && ly <= 5 && (edge && ((z === z0 || z === z0 + Dd) ? (x - x0) % 5 >= 2 : (z - z0) % 5 >= 2))) return ly === 5 ? GLASS_L : GLASS;
    if (ly === Hh) return CREAM;
    if (ly === 0 || ly === 1) return pick(CONC_D, x, y, z);
    return (ly + ((x + z) >> 1)) % 4 === 0 ? shade(pick(BRICK, x, y, z), 0.85) : pick(BRICK, x, y, z);
  });
  // gable roof along x
  const rz0 = z0 - 1, rz1 = z0 + Dd + 1;
  for (let x = x0 - 1; x <= x0 + L + 1; x++)
    for (let z = rz0; z <= rz1; z++) {
      const ry = Math.min(z - rz0, rz1 - z) >> 0;
      const yy = base + Hh + 1 + Math.floor(ry * 0.7);
      const isEnd = x === x0 - 1 || x === x0 + L + 1;
      w.set(x, yy, z, ry === Math.floor((rz1 - rz0) / 2) ? RED_D : (z % 2 ? RED : shade(RED, 0.88)), b.id);
      if (!isEnd && x > x0 && x < x0 + L) continue;
      for (let y = base + Hh + 1; y < yy; y++) w.set(x, y, z, CREAM, b.id);
    }
  // chimney + banner over the door
  fill(w, b, x0 + 22, base + Hh + 3, z0 + 12, x0 + 24, base + Hh + 10, z0 + 14, (x, y, z) => y === base + Hh + 10 ? CHAR : pick(BRICK, x, y, z));
  fill(w, b, x0 + 9, base + 7, z0 - 1, x0 + 19, base + 9, z0 - 1, (x, y) => y === base + 8 && x % 3 === 0 ? GOLD : RED);
}

// Two striped fuel tanks with ladders, a catwalk and pipes.
function depot(w: World, x0: number, z0: number) {
  const b = w.addBuilding({ team: 2, kind: 'silo', name: 'Fuel Depot', target: true, threshold: 0.45 });
  const tanks: [number, number, number, number][] = [[x0, z0, 7.4, 26], [x0 + 14, z0 + 10, 5.4, 19]];
  for (const [cx, cz, r, hh] of tanks) {
    const base = groundMax(w, cx - r, cz - r, cx + r, cz + r);
    foundation(w, b, Math.floor(cx - r - 1), Math.floor(cz - r - 1), Math.ceil(cx + r + 1), Math.ceil(cz + r + 1), base + 1);
    for (let y = 0; y < hh; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++)
        for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++) {
          const d = Math.hypot(x - cx, z - cz);
          const top = y === hh - 1;
          if (d > r || (!top && d < r - 1.3 && y > 0)) continue;
          let c = top ? (d > r - 1.5 ? RED_D : CONC_D[0]) : Math.floor(y / 4) % 2 ? RED : CREAM;
          if (!top && hash3(x, y, z) < 0.05) c = shade(c, 0.85);
          w.set(x, base + 1 + y, z, c, b.id);
        }
    // ladder on the front
    for (let y = 0; y < hh; y++) { w.set(Math.round(cx - r - 1), base + 1 + y, Math.round(cz) - 1, CHAR, b.id); w.set(Math.round(cx - r - 1), base + 1 + y, Math.round(cz) + 1, CHAR, b.id); if (y % 2) w.set(Math.round(cx - r - 1), base + 1 + y, Math.round(cz), STEEL, b.id); }
    // catwalk ring
    for (let a = 0; a < 64; a++) {
      const x = Math.round(cx + Math.cos((a / 64) * Math.PI * 2) * (r + 1)), z = Math.round(cz + Math.sin((a / 64) * Math.PI * 2) * (r + 1));
      if (!w.get(x, base + hh - 2, z)) w.set(x, base + hh - 2, z, STEEL, b.id);
      if (a % 4 === 0 && !w.get(x, base + hh - 1, z)) w.set(x, base + hh - 1, z, CHAR, b.id);
    }
  }
  // pipes between the tanks and down to the ground
  const py = groundMax(w, x0, z0, x0 + 14, z0 + 10) + 3;
  for (let i = 0; i <= 14; i++) { w.set(x0 + i, py, z0 + Math.round((i / 14) * 10), 0x8a8f7a, b.id); w.set(x0 + i, py + 1, z0 + Math.round((i / 14) * 10), 0x8a8f7a, b.id); }
}

function bunker(w: World, cx: number, cz: number) {
  const b = w.addBuilding({ team: 2, kind: 'turret', name: 'Gun Emplacement', target: true, threshold: 0.55 });
  const base = groundMax(w, cx - 5, cz - 5, cx + 5, cz + 5);
  foundation(w, b, cx - 5, cz - 5, cx + 5, cz + 5, base);
  for (let y = 0; y < 6; y++)
    for (let x = cx - 5; x <= cx + 5; x++)
      for (let z = cz - 5; z <= cz + 5; z++) {
        const cham = Math.abs(x - cx) + Math.abs(z - cz) > 8 - (y > 3 ? 1 : 0);
        if (cham) continue;
        let c = pick(CONC, x, y, z);
        if (y === 5) c = CHAR;
        else if (y === 3 && (Math.abs(x - cx) === 5 || Math.abs(z - cz) === 5)) c = RED;
        else if ((x + y * 3 + z) % 7 === 0) c = pick(CONC_D, x, y, z);
        w.set(x, base + y, z, c, b.id);
      }
  // sandbag ring
  for (let a = 0; a < 48; a++) {
    const x = Math.round(cx + Math.cos((a / 48) * Math.PI * 2) * 8), z = Math.round(cz + Math.sin((a / 48) * Math.PI * 2) * 8);
    if (a % 12 < 2) continue;
    const s = w.addBuilding({ team: 0, kind: 'wall', name: 'Sandbags', crushable: true, threshold: 0 });
    const y0 = w.heightAt(x, z);
    w.set(x, y0, z, bagColor(x, 0, z), s.id); w.set(x, y0 + 1, z, bagColor(x, 1, z), s.id);
  }
}

const bagColor = (x: number, y: number, z: number) => mix(0xc9b27a, 0xa8925c, hash3(x, y, z));
function sandbags(w: World, x0: number, z0: number, x1: number, z1: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  const b = w.addBuilding({ team: 0, kind: 'wall', name: 'Sandbags', crushable: true, threshold: 0 });
  const nx = -(z1 - z0) / n, nz = (x1 - x0) / n;
  for (let i = 0; i <= n; i++)
    for (let k = 0; k < 2; k++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n + nx * k), z = Math.round(z0 + ((z1 - z0) * i) / n + nz * k);
      if (w.owner(x, w.heightAt(x, z) - 1, z) === b.id) continue;
      const y = w.heightAt(x, z), hh = k === 0 ? 3 : 2;
      for (let j = 0; j < hh; j++) w.set(x, y + j, z, bagColor(x, y + j, z), b.id);
    }
}

function barrels(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'prop', name: 'Barrels', crushable: true, threshold: 0.3 });
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 1]]) {
    if (hash3(x + dx, 1, z + dz) < 0.25) continue;
    const y = w.heightAt(x + dx, z + dz), c = hash3(x + dx, 2, z + dz) < 0.5 ? RED : 0x5f6b3a;
    for (let j = 0; j < 3; j++) w.set(x + dx, y + j, z + dz, j === 1 ? shade(c, 0.8) : c, b.id);
  }
}
function crates(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'prop', name: 'Crates', crushable: true, threshold: 0.3 });
  const y = groundMax(w, x, z, x + 5, z + 3);
  fill(w, b, x, y, z, x + 2, y + 2, z + 2, (xx, yy, zz) => ((xx - x) % 2 === 0 && (yy - y) % 2 === 0) ? 0x7a5a34 : 0xa07c4a);
  fill(w, b, x + 3, y, z, x + 5, y + 1, z + 2, (xx, yy, zz) => (xx === x + 3 || xx === x + 5) ? 0x6e6a3a : 0x8a8448);
  fill(w, b, x + 1, y + 3, z, x + 2, y + 4, z + 1, 0xa07c4a);
}
function fence(w: World, x0: number, z0: number, x1: number, z1: number) {
  const b = w.addBuilding({ team: 0, kind: 'wall', name: 'Fence', crushable: true, threshold: 0 });
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), z = Math.round(z0 + ((z1 - z0) * i) / n), y = w.heightAt(x, z);
    if (i % 4 === 0) for (let j = 0; j < 4; j++) w.set(x, y + j, z, 0x6a5038, b.id);
    else { w.set(x, y + 1, z, 0x8a6a48, b.id); w.set(x, y + 3, z, 0x8a6a48, b.id); }
  }
}
function lamp(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'prop', name: 'Lamp', crushable: true, threshold: 0.5 });
  const y = w.heightAt(x, z);
  for (let j = 0; j < 9; j++) w.set(x, y + j, z, CHAR, b.id);
  w.set(x + 1, y + 8, z, CHAR, b.id); w.set(x + 1, y + 7, z, LIT, b.id);
}
function flag(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'prop', name: 'Flag', crushable: true, threshold: 0.5 });
  const y = w.heightAt(x, z);
  for (let j = 0; j < 18; j++) w.set(x, y + j, z, j === 17 ? GOLD : 0xbfbfb8, b.id);
  fill(w, b, x + 1, y + 11, z, x + 8, y + 16, z, (xx, yy) => (Math.hypot(xx - x - 4, yy - y - 13.5) < 1.6 ? GOLD : RED));
}
function pylon(w: World, x: number, z: number) {
  const b = w.addBuilding({ team: 0, kind: 'prop', name: 'Pylon', crushable: false, threshold: 0.5 });
  const y = w.heightAt(x, z);
  for (let j = 0; j < 22; j++) {
    const s = Math.max(0, 2 - Math.floor(j / 8));
    for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) w.set(x + dx, y + j, z + dz, 0x7c8088, b.id);
    if (j % 4 === 0) for (let k = -s; k <= s; k++) { w.set(x + k, y + j, z - s, 0x7c8088, b.id); w.set(x + k, y + j, z + s, 0x7c8088, b.id); }
  }
  fill(w, b, x - 5, y + 19, z, x + 5, y + 19, z, 0x7c8088);
}
function house(w: World, x0: number, z0: number, L: number, Dd: number, wall: number, roof: number) {
  const b = w.addBuilding({ team: 0, kind: 'house', name: 'House', threshold: 0.4 });
  const base = groundMax(w, x0, z0, x0 + L, z0 + Dd);
  foundation(w, b, x0, z0, x0 + L, z0 + Dd, base);
  fill(w, b, x0, base, z0, x0 + L, base + 7, z0 + Dd, (x, y, z) => {
    const edge = x === x0 || x === x0 + L || z === z0 || z === z0 + Dd;
    if (!edge && y > base) return 0;
    const ly = y - base;
    if (edge && ly >= 3 && ly <= 4 && ((x === x0 || x === x0 + L) ? (z - z0) % 4 === 2 : (x - x0) % 4 === 2)) return GLASS;
    if (z === z0 && x === x0 + 3 && ly > 0 && ly < 5) return 0x5a3a26;
    return ly === 0 ? CONC_D[0] : mix(wall, shade(wall, 0.9), hash3(x, y, z));
  });
  const half = Math.floor(Dd / 2) + 1;
  for (let x = x0 - 1; x <= x0 + L + 1; x++)
    for (let z = z0 - 1; z <= z0 + Dd + 1; z++) {
      const ry = Math.min(z - (z0 - 1), z0 + Dd + 1 - z);
      const yy = base + 8 + ry;
      w.set(x, yy, z, ry === half ? shade(roof, 0.75) : (x % 2 ? roof : shade(roof, 0.9)), b.id);
      if (x === x0 || x === x0 + L) for (let y = base + 8; y < yy; y++) w.set(x, y, z, wall, b.id);
    }
}

// ------------------------------------------------------------------ plants
function pine(w: World, x: number, z: number, r: number) {
  const b = w.addBuilding({ team: 0, kind: 'tree', name: 'Tree', crushable: true, threshold: 0.5 });
  const y0 = w.heightAt(x, z), th = 4 + Math.floor(r * 3), hh = 12 + Math.floor(r * 6);
  for (let y = 0; y < th; y++) w.set(x, y0 + y, z, 0x6a4a30, b.id);
  const cols = [0x1f3a1e, 0x284a24, 0x33582c];
  for (let y = 0; y < hh; y++) {
    const rad = (1 - y / hh) * (3.6 + r) + 0.4 - ((y % 3) === 0 ? 0.6 : 0);
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++)
      if (Math.hypot(dx, dz) < rad && hash3(x + dx, y, z + dz) > 0.08) w.set(x + dx, y0 + th - 1 + y, z + dz, cols[Math.min(2, Math.floor((y / hh) * 2.2 + hash3(dx, y, dz) * 0.8))], b.id);
  }
}
function broadleaf(w: World, x: number, z: number, r: number) {
  const b = w.addBuilding({ team: 0, kind: 'tree', name: 'Tree', crushable: true, threshold: 0.5 });
  const y0 = w.heightAt(x, z), th = 5 + Math.floor(r * 3);
  for (let y = 0; y < th; y++) { w.set(x, y0 + y, z, 0x6e5034, b.id); if (y < 2) w.set(x + 1, y0 + y, z, 0x6e5034, b.id); }
  w.set(x + 1, y0 + th - 1, z, 0x6e5034, b.id); w.set(x - 1, y0 + th, z + 1, 0x6e5034, b.id);
  const cr = 3.6 + r * 1.8, cy = y0 + th + 2;
  const leaf = [0x2c4a22, 0x3a5a2a, 0x4a6a32];
  for (const [ox, oy, oz, s] of [[0, 0, 0, 1], [2, 1, 1, 0.7], [-2, 1, -1, 0.7], [0, 2, 2, 0.6]]) {
    const rr = cr * s;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = -4; dy <= 5; dy++) {
      const d = Math.hypot(dx - ox, (dy - oy) * 1.2, dz - oz);
      if (d > rr || hash3(x + dx, cy + dy, z + dz) < (d > rr - 1 ? 0.3 : 0)) continue;
      w.set(x + dx, cy + dy, z + dz, leaf[Math.max(0, Math.min(2, Math.floor((dy + 3) / 3)))], b.id);
    }
  }
}
function bush(w: World, x: number, z: number, r: number) {
  const b = w.addBuilding({ team: 0, kind: 'tree', name: 'Bush', crushable: true, threshold: 0.3 });
  const y0 = w.heightAt(x, z), rr = 1.6 + r * 1.2;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy < 3; dy++)
    if (Math.hypot(dx, dy * 1.5, dz) < rr && hash3(x + dx, dy, z + dz) > 0.15) w.set(x + dx, y0 + dy, z + dz, dy === 2 ? 0x7a8a40 : 0x5f7434, b.id);
}
