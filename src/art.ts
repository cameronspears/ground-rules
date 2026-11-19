// The art. Every model is built from blocks (one block ≈ 30 cm, and one pixel on screen),
// facing +X (east). Colours are chosen as they look in full sun; shading is added when baked.
// TEAM / TEAM_D / TEAM_L are swapped for each side's colours.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from './models';
import { hash3 } from './voxel';

const K = 0x1f2024, STEEL = 0x5d6168, STEEL_L = 0x8a8e94, GLASS = 0x2a3a58, GLASS_L = 0x6a8ab8, LAMP = 0xffe08a, RED = 0xd23a24;
const RUST = 0x8a4a26, RUST_L = 0xa85c2c, CREAM = 0xe3d8bd, CREAM_D = 0xc4b79c, CONC = 0xa9a294, CONC_D = 0x8c8679, HAZ = 0xf0c030, SKIN = 0xe0a878;

// ---------------------------------------------------------------- units
function tank(): ModelDef {
  const b = new VB();
  // tracks with road wheels and a lighter tread edge
  for (const z0 of [0, 11]) {
    b.box(1, 0, z0, 22, 3, z0 + 2, K);
    b.box(0, 1, z0, 0, 2, z0 + 2, K); b.box(23, 1, z0, 23, 2, z0 + 2, K);
    for (let x = 2; x <= 21; x += 4) { b.set(x, 1, z0 === 0 ? 0 : 13, STEEL); b.set(x + 1, 1, z0 === 0 ? 0 : 13, STEEL); }
    for (let x = 1; x <= 22; x++) b.set(x, 3, z0 === 0 ? 0 : 13, x % 2 ? STEEL_L : K); // tread links catch the light
    b.box(1, 3, z0 + (z0 === 0 ? 1 : 0), 22, 3, z0 + (z0 === 0 ? 2 : 1), STEEL);
  }
  // hull, sloped front, engine deck, lamps
  b.box(1, 2, 3, 21, 4, 10, TEAM_D);
  b.box(2, 4, 2, 20, 5, 11, TEAM);
  b.box(19, 4, 2, 22, 4, 11, TEAM); b.box(21, 3, 2, 23, 3, 11, TEAM_D);
  b.box(2, 6, 3, 7, 6, 10, TEAM_D);
  for (let z = 4; z <= 9; z += 2) b.box(3, 6, z, 6, 6, z, K); // engine grille
  b.set(22, 4, 3, LAMP); b.set(22, 4, 10, LAMP);
  b.box(8, 5, 11, 18, 5, 11, HAZ); // slogan stripe
  b.box(16, 6, 3, 17, 6, 4, STEEL_L); // driver's hatch
  b.box(3, 5, 0, 7, 6, 1, 0x6a6a4a); b.box(3, 6, 0, 7, 6, 1, 0x84845e); // stowage boxes on the track guards
  b.box(3, 5, 12, 6, 6, 13, 0x6a6a4a); b.box(3, 6, 12, 6, 6, 13, 0x84845e);
  b.box(0, 5, 4, 0, 5, 5, 0x3a3a3a); b.set(0, 6, 4, 0x2a2a2a); // exhaust
  for (let x = 2; x <= 20; x += 3) b.set(x, 2, 2, 0x4e4434); // mud on the lower hull
  const t = new VB();
  t.box(0, 0, 1, 9, 2, 7, TEAM); t.box(1, 0, 0, 8, 2, 8, TEAM);
  t.box(1, 3, 2, 8, 3, 6, TEAM_D); t.box(0, 1, 2, 0, 2, 6, TEAM_D);
  t.box(3, 4, 4, 5, 4, 6, STEEL_L); t.box(4, 5, 5, 4, 5, 5, K); // commander's hatch
  t.box(10, 1, 3, 21, 2, 5, STEEL); t.box(10, 2, 4, 21, 2, 4, STEEL_L); t.box(21, 1, 3, 22, 2, 5, K);
  t.box(9, 0, 2, 10, 3, 6, TEAM_D);
  t.box(1, 4, 1, 2, 4, 1, 0xd8d0b8); t.box(1, 5, 1, 1, 6, 1, K); // loudspeaker on a post
  for (let y = 4; y < 11; y++) t.set(1, y, 7, y === 10 ? 0xe04030 : K); // whip antenna
  t.box(2, 3, 8, 6, 3, 8, 0x5a5a40); // spare track links on the turret side
  return { body: b, bodyPivot: [11.5, 0, 6.5], turret: t, turretPivot: [4.5, 0, 4.5], turretAt: [11, 7, 6.5] };
}

function harvester(): ModelDef {
  const b = new VB();
  for (const x of [3, 9, 19]) for (const z of [0, 12]) { b.box(x, 0, z, x + 3, 3, z + 1, K); b.box(x + 1, 1, z === 0 ? 0 : 13, x + 2, 2, z === 0 ? 0 : 13, STEEL); }
  b.box(1, 2, 1, 25, 3, 12, STEEL); // chassis
  // hopper bed, open on top, full of salvaged scrap
  b.box(2, 4, 1, 17, 9, 12, (x, y, z) => (x === 2 || x === 17 || z === 1 || z === 12 ? (y === 9 ? TEAM_D : (x + y) % 5 === 0 ? TEAM_D : TEAM) : y < 7 ? 0 : 0));
  b.box(3, 4, 2, 16, 7, 11, (x, y, z) => (y < 7 || hash3(x, y, z) < 0.55 ? [RUST, RUST_L, STEEL, 0x6e3a20, STEEL_L][(hash3(x, z, y) * 5) | 0] : 0));
  for (let x = 3; x <= 16; x += 3) b.box(x, 9, 1, x, 9, 1, HAZ);
  for (const [x, y] of [[4, 5], [5, 6], [11, 4], [12, 5], [15, 7]]) { b.set(x, y, 12, RUST); b.set(x, y, 1, RUST_L); } // rust streaks
  // cab at the front
  b.box(19, 4, 2, 25, 10, 11, TEAM); b.box(25, 7, 3, 25, 9, 10, GLASS); b.box(25, 9, 3, 25, 9, 10, GLASS_L);
  b.box(20, 7, 11, 23, 9, 11, GLASS); b.box(20, 7, 2, 23, 9, 2, GLASS);
  b.box(19, 11, 2, 25, 11, 11, TEAM_D); b.box(21, 12, 4, 23, 12, 9, HAZ); // beacon bar
  b.set(26, 5, 3, LAMP); b.set(26, 5, 10, LAMP);
  // salvage crane with a claw over the bed
  b.box(17, 10, 6, 18, 14, 7, STEEL); b.box(8, 14, 6, 18, 14, 7, STEEL_L); b.box(8, 11, 6, 8, 13, 7, K);
  b.box(7, 10, 5, 9, 10, 8, K);
  return { body: b, bodyPivot: [13, 0, 6.5] };
}

function rifleman(): ModelDef {
  const b = new VB();
  b.box(1, 0, 0, 1, 2, 0, K); b.box(1, 0, 2, 1, 2, 2, K);   // legs
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, TEAM_D); // body, belt
  b.box(0, 4, 1, 0, 5, 1, 0xd8ccae);                        // bedroll
  b.box(1, 6, 1, 2, 6, 1, SKIN);                            // face
  b.box(1, 7, 0, 2, 7, 2, TEAM_D); b.set(2, 7, 1, TEAM_L);  // helmet
  b.box(2, 4, 3, 5, 4, 3, K); b.set(3, 5, 3, SKIN);         // rifle and hand
  return { body: b, bodyPivot: [1.5, 0, 1.5] };
}

// ---------------------------------------------------------------- buildings
// Field Command: the base's heart. Concrete pad with hazard edges, a cream main hall with a
// big bay door, a signal tower with a dish, and a gantry crane over the pad. 3 x 3 cells.
function fieldCommand(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => {
    if (x < 2 || x > 69 || z < 2 || z > 69) return ((x + z) >> 2) % 2 ? HAZ : K;
    return (x % 12 === 0 || z % 12 === 0) ? CONC_D : CONC;
  });
  // main hall
  const x0 = 6, x1 = 46, z0 = 8, z1 = 52;
  b.box(x0, 1, z0, x1, 20, z1, (x, y, z) => {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (!edge && y < 20) return 0;
    if (y === 20) return (x - x0) % 8 < 4 ? TEAM : TEAM_D;
    if (y >= 17) return TEAM;
    const along = z === z0 || z === z1 ? x - x0 : z - z0;
    if (z === z1 && x >= 14 && x <= 38 && y <= 13) return y === 13 ? K : (y % 3 === 0 ? 0x6a6e76 : 0x7c8088); // bay door
    if (along % 8 === 0) return CREAM_D;
    if (y >= 9 && y <= 12 && along % 8 >= 2 && along % 8 <= 5) return y === 12 ? GLASS_L : GLASS;
    if (y <= 1) return CONC_D;
    if (y <= 4 && hash3(x, y, z) < 0.45 - y * 0.08) return CREAM_D; // grime splashed up the walls
    return hash3(x, y, z) < 0.04 ? CREAM_D : CREAM;
  });
  b.box(x0 + 2, 21, z0 + 2, x0 + 9, 23, z0 + 9, STEEL); b.box(x0 + 3, 24, z0 + 3, x0 + 8, 24, z0 + 8, K); // vent block
  b.box(x1 - 12, 21, z0 + 4, x1 - 4, 22, z0 + 10, STEEL_L);
  for (let z = z0 + 14; z <= z1 - 4; z += 6) b.box(x0 + 14, 21, z, x1 - 4, 21, z + 1, CREAM_D); // roof ribs
  b.box(20, 14, z1 + 1, 32, 15, z1 + 1, RED); b.box(25, 14, z1 + 1, 27, 15, z1 + 1, HAZ); // red sign with a gold mark
  // signal tower
  const tx0 = 50, tx1 = 64, tz0 = 10, tz1 = 26;
  b.box(tx0, 1, tz0, tx1, 34, tz1, (x, y, z) => {
    const edge = x === tx0 || x === tx1 || z === tz0 || z === tz1;
    if (!edge && y < 34) return 0;
    if (y === 34) return TEAM_D;
    if (y % 8 === 0) return TEAM;
    const along = z === tz0 || z === tz1 ? x - tx0 : z - tz0;
    if (y % 8 >= 3 && y % 8 <= 5 && along % 4 !== 0) return y % 8 === 5 ? GLASS_L : GLASS;
    return CREAM;
  });
  for (let y = 35; y < 52; y++) b.set(57, y, 18, y % 4 === 0 ? RED : STEEL_L);
  b.set(57, 52, 18, 0xff4030);
  for (let a = -4; a <= 4; a++) for (let c = -4; c <= 4; c++) if (Math.hypot(a, c) < 4.5 && Math.hypot(a, c) > 1) b.set(61 + c * 0.3, 40 + a, 22 + c, CREAM); // dish
  // gantry crane over the pad
  for (const z of [58, 68]) { b.box(50, 1, z, 51, 26, z, HAZ); b.box(67, 1, z, 68, 26, z, HAZ); }
  b.box(50, 26, 58, 68, 27, 68, (x, y, z) => (z === 58 || z === 68 ? HAZ : 0));
  b.box(58, 27, 58, 60, 27, 68, STEEL); b.box(59, 18, 63, 59, 26, 63, K); b.box(57, 16, 61, 61, 17, 65, STEEL_L);
  // crates on the pad
  b.box(8, 1, 58, 15, 6, 65, (x, y, z) => ((x + y + z) % 4 === 0 ? 0x6e5232 : 0x9a7a4a));
  b.box(18, 1, 60, 23, 4, 66, (x, y) => (y === 4 ? 0x56603a : 0x6a7444));
  return { body: b, bodyPivot: [36, 0, 36] };
}

// ---------------------------------------------------------------- trees
// Foliage is built from clumps: bright tips on the outside, dark gaps between and inside,
// so each tree reads as many small light-and-dark marks rather than one green blob.
const PINES = [[0x1a2a1c, 0x26402a, 0x365a34, 0x4e7444, 0x6e9258], [0x1c2c20, 0x2a4430, 0x3a5e3c, 0x54784c, 0x789a60]];
export function pine(seed: number): ModelDef {
  const b = new VB();
  const hgt = 22 + Math.floor(hash3(seed, 1, 1) * 10), r = 6.5 + hash3(seed, 2, 2) * 2.5, pal = PINES[seed % 2];
  for (let y = 0; y < 5; y++) b.box(9, y, 9, 10, y, 10, y % 2 ? 0x4e3a28 : 0x5e4630);
  for (let j = 0; j < hgt; j++) {
    const tier = j % 4; // drooping tiers: wide at the bottom of each, tucked in at the top
    const rad = (1 - j / hgt) * r * (1.05 - tier * 0.12) + 0.7;
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
      const d = Math.hypot(dx + 0.5, dz + 0.5);
      if (d > rad) continue;
      const edge = d > rad - 1.3;
      if (edge && hash3(seed * 31 + dx, j, dz) < 0.4) continue; // ragged outline
      const ang = Math.atan2(dz, dx), spoke = Math.cos(ang * 7 + j * 0.9 + seed) > 0.2; // branch spokes
      let lvl = edge ? (spoke ? 4 : 3) : d > rad - 2.6 ? (spoke ? 3 : 1) : 0;
      if (tier === 3 && lvl > 1) lvl--;
      b.set(9.5 + dx, 4 + j, 9.5 + dz, pal[lvl]);
    }
  }
  return { body: b, bodyPivot: [9.5, 0, 9.5] };
}

export function broadleaf(seed: number): ModelDef {
  const b = new VB();
  const pal = [0x22341c, 0x34502a, 0x4a6a34, 0x64863e, 0x86a456];
  for (let y = 0; y < 8; y++) b.box(10, y, 10, 11, y, 11, y % 3 ? 0x5a4430 : 0x6c543a);
  b.box(12, 6, 10, 13, 7, 10, 0x5a4430); b.box(8, 7, 11, 9, 8, 11, 0x5a4430);
  // many small clumps make a lumpy, lively crown
  for (let c = 0; c < 14; c++) {
    const a = hash3(seed, c, 1) * Math.PI * 2, rr = c === 0 ? 0 : 2 + hash3(seed, c, 2) * 5;
    const ox = Math.cos(a) * rr, oz = Math.sin(a) * rr, oy = 11 + hash3(seed, c, 3) * 7 - rr * 0.3, r = 2.6 + hash3(seed, c, 4) * 1.8;
    for (let dx = -5; dx <= 5; dx++) for (let dy = -4; dy <= 4; dy++) for (let dz = -5; dz <= 5; dz++) {
      const d = Math.hypot(dx, dy * 1.2, dz);
      if (d > r || hash3(seed + dx * 7, dy + c * 13, dz) < (d > r - 1 ? 0.35 : 0)) continue;
      const top = dy >= 1 && d > r - 1.4;
      b.set(10.5 + ox + dx, oy + dy, 10.5 + oz + dz, top ? (hash3(dx, dy, c) < 0.5 ? pal[4] : pal[3]) : d > r - 1.2 ? pal[2] : d > r - 2.2 ? pal[1] : pal[0]);
    }
  }
  return { body: b, bodyPivot: [10.5, 0, 10.5] };
}

export function stump(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 1, 1, 1, 0x5a4028); b.set(0, 2, 0, 0x7a5a38); b.set(1, 1, 1, 0x8a6a48);
  return { body: b, bodyPivot: [1, 0, 1] };
}

export const ART: Record<string, () => ModelDef> = { tank, harvester, rifle: rifleman, fieldCommand };
