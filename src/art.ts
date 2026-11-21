// The art. Every model is built from blocks (one block ≈ 30 cm, and one pixel on screen),
// facing +X (east). Colours are chosen as they look in full sun; shading is added when baked.
// TEAM / TEAM_D / TEAM_L are swapped for each side's colours.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from './models';
import { hash3 } from './hash';

const K = 0x1f2024, STEEL = 0x5d6168, STEEL_L = 0x8a8e94, GLASS = 0x2a3a58, GLASS_L = 0x6a8ab8, LAMP = 0xffe08a, RED = 0xd23a24;
const RUST = 0x8a4a26, RUST_L = 0xa85c2c, CREAM = 0xe3d8bd, CREAM_D = 0xc4b79c, CONC = 0xa9a294, CONC_D = 0x8c8679, HAZ = 0xf0c030, SKIN = 0xe0a878;

// ---------------------------------------------------------------- shape helpers
// A round tower whose radius can change with height (r(y)); hollow unless solid is set.
function tower(b: VB, cx: number, cz: number, y0: number, y1: number, r: (y: number) => number, col: (x: number, y: number, z: number, a: number) => number, wall = 1.3, open = false) {
  for (let y = y0; y <= y1; y++) {
    const R = r(y), n = Math.ceil(R) + 1;
    for (let dx = -n; dx <= n; dx++) for (let dz = -n; dz <= n; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > R || (d < R - wall && (open || y < y1))) continue;
      b.set(cx + dx, y, cz + dz, col(cx + dx, y, cz + dz, Math.atan2(dz, dx)));
    }
  }
}
// The top half of a ball, for radar domes and tank caps.
function dome(b: VB, cx: number, cy: number, cz: number, r: number, col: (x: number, y: number, z: number) => number) {
  for (let dy = 0; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const d = Math.hypot(dx, dy, dz);
    if (d <= r && d > r - 1.6) b.set(cx + dx, cy + dy, cz + dz, col(cx + dx, cy + dy, cz + dz));
  }
}
const pad = (x: number, z: number, w: number, d: number) => (x < 2 || x > w - 2 || z < 2 || z > d - 2 ? CONC_D : (x % 12 === 0 || z % 12 === 0 ? CONC_D : CONC));

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

// Builder: a six-wheeled construction truck with a dozer blade, a folding crane and a work light.
function builder(): ModelDef {
  const b = new VB();
  for (const x of [3, 9, 18]) for (const z of [0, 12]) { b.box(x, 0, z, x + 3, 3, z + 1, K); b.box(x + 1, 1, z === 0 ? 0 : 13, x + 2, 2, z === 0 ? 0 : 13, STEEL); }
  b.box(1, 2, 1, 23, 3, 12, STEEL);
  b.box(24, 1, 0, 25, 4, 13, (x, y, z) => (y === 4 ? STEEL_L : (z % 3 === 0 ? K : STEEL))); // dozer blade
  b.box(17, 4, 2, 23, 10, 11, TEAM); b.box(23, 7, 3, 23, 9, 10, GLASS); b.box(23, 9, 3, 23, 9, 10, GLASS_L);
  b.box(18, 7, 11, 21, 9, 11, GLASS); b.box(18, 7, 2, 21, 9, 2, GLASS);
  b.box(17, 11, 2, 23, 11, 11, TEAM_D); b.box(19, 12, 5, 21, 12, 8, HAZ); // amber work light
  b.box(2, 4, 1, 16, 5, 12, TEAM_D); // flatbed
  b.box(3, 6, 5, 6, 9, 8, HAZ); b.box(4, 10, 6, 5, 10, 7, K); // crane turret
  for (let i = 0; i < 12; i++) b.box(6 + i, 9 - Math.floor(i / 4), 6, 6 + i, 9 - Math.floor(i / 4), 7, i % 3 ? HAZ : K); // folded boom
  b.box(8, 6, 2, 14, 7, 4, 0x8a6a40); b.box(9, 6, 9, 13, 8, 11, 0x7a7e84); // timber and steel beams on the bed
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
  // A stepped command block under a big white radar dome, with a lattice mast: the tallest, roundest thing in a base.
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => pad(x, z, 71, 71));
  const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, win: number) => b.box(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (!edge && y < y1) return 0;
    if (y === y1) return (x + z) % 6 === 0 ? CONC_D : 0x9a968c;
    if (y >= y1 - 2) return TEAM;
    if (y === y0) return CONC_D;
    const along = z === z0 || z === z1 ? x - x0 : z - z0;
    if (y >= win && y <= win + 2 && along % 5 !== 0) return y === win + 2 ? GLASS_L : GLASS;
    if (along % 10 === 0) return CREAM_D;
    if (y <= y0 + 3 && hash3(x, y, z) < 0.4 - (y - y0) * 0.1) return CREAM_D; // grime splashed up the walls
    return hash3(x, y, z) < 0.04 ? CREAM_D : CREAM;
  });
  block(4, 1, 18, 48, 12, 60, 6);   // wide lower floor
  block(10, 13, 24, 36, 26, 50, 18); // set-back command floor
  b.box(14, 27, 28, 20, 29, 34, STEEL); b.box(15, 30, 29, 19, 30, 33, K); // roof vent
  // entrance canopy on the south face, on two team-coloured posts, with a red sign
  b.box(18, 1, 61, 19, 9, 61, TEAM_D); b.box(33, 1, 61, 34, 9, 61, TEAM_D);
  b.box(16, 10, 58, 36, 10, 64, (x) => (x % 4 < 2 ? TEAM : TEAM_D));
  b.box(20, 1, 60, 32, 7, 60, (x, y) => (y === 7 ? K : 0x2a3040)); // glass doors
  b.box(22, 14, 61, 30, 16, 61, RED); b.box(25, 14, 61, 27, 16, 61, HAZ);
  // radar: a round drum with a white dome on top, panel seams picked out
  tower(b, 58, 26, 1, 14, () => 10, (x, y) => (y % 5 === 0 ? CONC_D : y > 11 ? TEAM : CONC));
  dome(b, 58, 15, 26, 10, (x, y, z) => ((Math.round(Math.atan2(z - 26, x - 58) * 4) & 1) && y % 4 === 0 ? 0xc8c4b8 : y > 22 ? 0xf4f0e6 : 0xe8e4d8));
  b.set(58, 26, 26, RED);
  // lattice mast on the command floor
  for (let y = 27; y < 50; y++) for (const [x, z] of [[30, 28], [33, 28], [30, 31], [33, 31]]) {
    const k = Math.round((y - 27) * 0.06), xx = x < 31 ? x + k : x - k, zz = z < 29 ? z + k : z - k;
    b.set(xx, y, zz, y % 6 < 3 ? STEEL_L : STEEL);
  }
  for (let y = 50; y < 56; y++) b.set(31.5, y, 29.5, y === 55 ? 0xff4030 : RED);
  for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) if (Math.hypot(a, c) < 3.6) b.set(36 + Math.abs(c) * 0.4, 44 + a, 30 + c, CREAM); // dish
  // fuel drums and crates on the pad
  for (const [x, z] of [[54, 46], [57, 46], [54, 49]]) tower(b, x, z, 1, 4, () => 1.4, (xx, y) => (y === 4 ? K : y === 2 ? TEAM_D : 0x4e6a44), 2);
  b.box(6, 1, 63, 13, 6, 69, (x, y, z) => ((x + y + z) % 4 === 0 ? 0x6e5232 : 0x9a7a4a));
  b.box(56, 1, 58, 62, 4, 66, (x, y) => (y === 4 ? 0x56603a : 0x6a7444));
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

// ---------------------------------------------------------------- civilian buildings
// Footprints are whole cells (24 blocks each); buildings sit a little inside them.
const PLASTER = 0xe0d6bc, PLASTER_D = 0xc4b89a, STONE = [0x8a8274, 0x9a9282, 0x7a7266], WOOD = 0x6e4e32, WOOD_L = 0x8a6440;
const TILE = 0x9a4a34, TILE_D = 0x7a3a28, SLATE = 0x4e5258, SLATE_D = 0x3a3e44, WIN = 0x2e3a4a, WIN_L = 0x7a94b0, FRAME = 0xd8d0c0;

// A walled box with windows and a door on the south (+z) face, then a gable roof along x.
function house(b: VB, x0: number, z0: number, x1: number, z1: number, wallH: number, wall: (x: number, y: number, z: number) => number, roof: number, roofD: number) {
  b.box(x0, 0, z0, x1, wallH, z1, (x, y, z) => {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (!edge) return y === wallH ? 0 : 0;
    const along = z === z0 || z === z1 ? x - x0 : z - z0;
    if (z === z1 && along === Math.floor((x1 - x0) / 2) && y < 6) return y === 5 ? FRAME : WOOD; // door
    const wy = y % 9;
    if (wy >= 3 && wy <= 5 && along % 5 >= 2 && along % 5 <= 3) return wy === 5 ? FRAME : wy === 4 ? WIN_L : WIN;
    if (y === 0) return 0x5a5248;
    return wall(x, y, z);
  });
  const mid = (z0 + z1) / 2, half = (z1 - z0) / 2 + 1;
  for (let z = z0 - 1; z <= z1 + 1; z++) {
    const ry = Math.round((half - Math.abs(z - mid)) * 0.75);
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      b.set(x, wallH + 1 + ry, z, Math.abs(z - mid) < 1 ? roofD : (z + x) % 3 === 0 ? roofD : roof);
      if (x === x0 || x === x1) for (let y = wallH + 1; y < wallH + 1 + ry; y++) b.set(x, y, z, wall(x, y, z));
    }
  }
}

function cottage(): ModelDef {
  const b = new VB();
  house(b, 4, 6, 19, 17, 8, (x, y, z) => (hash3(x, y, z) < 0.06 ? PLASTER_D : PLASTER), TILE, TILE_D);
  b.box(15, 9, 8, 16, 16, 9, (x, y) => (y === 16 ? 0x3a3a3a : STONE[0])); // chimney
  b.box(2, 0, 20, 21, 1, 20, (x) => (x % 3 === 0 ? WOOD : 0)); // picket fence posts
  b.box(2, 1, 20, 21, 1, 20, WOOD_L);
  b.box(5, 0, 18, 7, 1, 19, 0x5a7a34); b.set(6, 2, 18, 0xd04a4a); // flower bed
  return { body: b, bodyPivot: [12, 0, 12] };
}

function cottage2(): ModelDef {
  const b = new VB();
  house(b, 5, 5, 18, 17, 8, (x, y, z) => STONE[(hash3(x >> 1, y, z >> 1) * 3) | 0], SLATE, SLATE_D);
  b.box(7, 9, 7, 8, 15, 8, (x, y) => (y === 15 ? 0x2a2a2a : STONE[1]));
  b.box(19, 0, 9, 22, 3, 12, (x, y, z) => (y === 3 ? 0x6a5a3a : (x + z) % 2 ? WOOD : WOOD_L)); // woodpile
  return { body: b, bodyPivot: [12, 0, 12] };
}

function townhouse(): ModelDef {
  const b = new VB();
  const BR = [0x9a5a40, 0x8a4e38, 0xa86448];
  b.box(3, 0, 5, 44, 17, 18, (x, y, z) => {
    const edge = x === 3 || x === 44 || z === 5 || z === 18;
    if (!edge && y < 17) return 0;
    if (y === 17) return x % 4 === 0 ? 0x6a6a6a : 0x7a7a7a; // flat roof
    const along = z === 5 || z === 18 ? x - 3 : z - 5, wy = y % 8;
    if (z === 18 && along % 10 === 4 && y < 6) return y === 5 ? FRAME : 0x3a4a5a;
    if (wy >= 3 && wy <= 5 && along % 5 >= 1 && along % 5 <= 3) return wy === 5 ? FRAME : wy === 4 ? WIN_L : WIN;
    if (y === 8 || y === 16) return 0xc8bca4; // stone bands
    return BR[(Math.floor(y / 2) + (x >> 1)) % 3];
  });
  b.box(3, 18, 5, 44, 18, 18, (x, y, z) => (x === 3 || x === 44 || z === 5 || z === 18 ? 0x9a9a9a : 0));
  b.box(30, 18, 9, 33, 20, 12, 0x6a6e74); // rooftop tank
  return { body: b, bodyPivot: [24, 0, 12] };
}

function shop(): ModelDef {
  const b = new VB();
  b.box(4, 0, 6, 19, 10, 17, (x, y, z) => {
    const edge = x === 4 || x === 19 || z === 6 || z === 17;
    if (!edge && y < 10) return 0;
    if (y === 10) return 0x8a8a8a;
    if (z === 17 && x >= 6 && x <= 17 && y >= 2 && y <= 6) return y === 6 ? FRAME : (x % 4 === 0 ? FRAME : WIN_L); // big shop window
    if (y === 0) return 0x5a5248;
    return 0xf0ead8;
  });
  for (let x = 3; x <= 20; x++) for (let k = 0; k < 3; k++) b.set(x, 8 - k, 18 + k, Math.floor(x / 2) % 2 ? 0xc84a3a : 0xf0e8d8); // striped awning
  b.box(7, 11, 16, 16, 13, 16, 0x3a5a7a); b.box(9, 12, 16, 14, 12, 16, 0xf0d070); // sign
  return { body: b, bodyPivot: [12, 0, 12] };
}

function barn(): ModelDef {
  const b = new VB();
  const RED = [0x8a3a2a, 0x7a3426];
  b.box(3, 0, 5, 44, 12, 18, (x, y, z) => {
    const edge = x === 3 || x === 44 || z === 5 || z === 18;
    if (!edge) return 0;
    if (z === 18 && x >= 18 && x <= 29 && y < 10) return x === 23 || x === 24 || y === 9 ? 0xe0d8c8 : (x + y) % 6 === 0 ? 0xe0d8c8 : 0x6a2c20; // big doors with a white X frame
    if (y === 0) return 0x4a3a2a;
    return x % 3 === 0 ? 0x5e2a1e : RED[(x + z) % 2];
  });
  for (let z = 4; z <= 19; z++) { // gambrel roof
    const dz = Math.abs(z - 11.5), ry = dz > 5 ? Math.round((7.5 - dz) * 1.4) : 3 + Math.round((5 - dz) * 0.6);
    for (let x = 2; x <= 45; x++) {
      b.set(x, 13 + ry, z, dz < 1 ? 0x2e3236 : x % 4 === 0 ? 0x3e4246 : 0x4a4e52);
      if (x === 3 || x === 44) for (let y = 13; y < 13 + ry; y++) b.set(x, y, z, RED[0]);
    }
  }
  b.box(40, 0, 20, 43, 5, 22, (x, y) => (y === 5 ? 0xd8c070 : 0xc8a858)); // hay bales
  return { body: b, bodyPivot: [24, 0, 12] };
}

function waterTower(): ModelDef {
  const b = new VB();
  for (const [x, z] of [[6, 6], [17, 6], [6, 17], [17, 17]]) for (let y = 0; y < 22; y++) b.set(x + (y < 11 ? 0 : x < 12 ? 1 : -1), y, z + (y < 11 ? 0 : z < 12 ? 1 : -1), 0x5a5e64);
  for (let y = 8; y < 22; y += 7) b.box(6, y, 6, 17, y, 6, 0x6a6e74);
  for (let y = 22; y < 34; y++) for (let x = 3; x <= 20; x++) for (let z = 3; z <= 20; z++) {
    const d = Math.hypot(x - 11.5, z - 11.5);
    if (d < 8.5 && (d > 7.3 || y === 22 || y === 33)) b.set(x, y, z, y === 33 ? 0x7a3a28 : y % 4 === 0 ? 0xb8b0a0 : (hash3(x, y, z) < 0.15 ? 0x9a6a4a : 0xd8d0c0));
  }
  for (let y = 0; y < 30; y++) b.set(12, y, 21, y % 2 ? 0x3a3a3a : 0x5a5a5a); // ladder
  return { body: b, bodyPivot: [12, 0, 12] };
}

// ---------------------------------------------------------------- capturable sites
// Team-coloured details show who holds them (neutral sites wear grey).
function motorPool(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 47, (x, y, z) => (x % 12 === 0 || z % 12 === 0 ? CONC_D : CONC)); // concrete apron
  // open-fronted shed with a corrugated roof
  b.box(4, 1, 4, 52, 16, 22, (x, y, z) => {
    const back = z === 4, side = x === 4 || x === 52, post = z === 22 && (x - 4) % 12 === 0;
    if (y === 16) return x % 2 ? 0x8a8e94 : 0x6e7278;
    if (y === 15 && z >= 4) return TEAM;
    if (back || side || post) return y < 2 ? CONC_D : back && y >= 8 && y <= 10 && x % 8 < 4 ? GLASS : 0xa8a49a;
    return 0;
  });
  // a parked truck in the shed and fuel drums outside
  b.box(10, 1, 9, 26, 6, 17, (x, y, z) => (x > 22 ? (y > 3 && x === 26 ? GLASS : TEAM) : y < 3 ? K : y === 6 ? TEAM_D : 0x5a6040));
  b.box(30, 1, 10, 44, 3, 16, K); b.box(32, 4, 11, 38, 6, 15, 0x6a6a5a); // engine on a stand
  for (let i = 0; i < 4; i++) b.box(56 + (i % 2) * 4, 1, 30 + Math.floor(i / 2) * 4, 58 + (i % 2) * 4, 5, 32 + Math.floor(i / 2) * 4, i % 2 ? RED : 0x56603a);
  b.box(58, 1, 6, 66, 8, 14, (x, y) => (y === 8 ? TEAM_D : y > 5 ? HAZ : 0x7a7e84)); // fuel pump block
  return { body: b, bodyPivot: [36, 0, 24] };
}

function recruitOffice(): ModelDef {
  const b = new VB();
  b.box(2, 0, 2, 45, 1, 45, CONC);
  b.box(6, 1, 8, 41, 18, 36, (x, y, z) => {
    const edge = x === 6 || x === 41 || z === 8 || z === 36;
    if (!edge && y < 18) return 0;
    if (y === 18) return (x + z) % 6 < 3 ? 0x8a8a84 : 0x9a9a92;
    const along = z === 8 || z === 36 ? x - 6 : z - 8;
    if (z === 36 && along >= 14 && along <= 21 && y < 9) return y === 8 ? FRAME : 0x3a3020; // tall doors
    if (y >= 10 && y <= 14 && along % 6 >= 2 && along % 6 <= 3) return y === 14 ? FRAME : WIN;
    if (y >= 15) return TEAM;
    return y % 4 === 0 ? CREAM_D : CREAM;
  });
  for (const cx of [14, 20, 27, 33]) b.box(cx, 1, 38, cx + 1, 12, 39, CREAM); // columns
  b.box(12, 13, 37, 35, 14, 40, CREAM_D); b.box(16, 0, 39, 31, 1, 43, CONC_D); // portico, steps
  b.box(8, 4, 37, 11, 11, 37, (x, y) => (y > 9 ? TEAM : 0xe8dcc0)); b.box(36, 4, 37, 39, 11, 37, (x, y) => (y > 9 ? TEAM : 0xe8dcc0)); // posters
  return { body: b, bodyPivot: [24, 0, 24] };
}

function bunker(): ModelDef {
  const b = new VB();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) for (let z = 0; z < 24; z++) {
    const d = Math.hypot(x - 11.5, z - 11.5), r = 10 - y * 0.75;
    if (d > r || (d < r - 2 && y < 7)) continue;
    const slit = y === 4 && (Math.abs(Math.atan2(z - 11.5, x - 11.5) * 4 % Math.PI) < 0.35);
    b.set(x, y, z, slit ? K : y === 7 ? TEAM_D : hash3(x, y, z) < 0.1 ? CONC_D : CONC);
  }
  for (let a = 0; a < 40; a++) { const x = 11.5 + Math.cos((a / 40) * Math.PI * 2) * 11.5, z = 11.5 + Math.sin((a / 40) * Math.PI * 2) * 11.5; if (a % 10 < 2) continue; b.set(x, 0, z, 0xb39a64); b.set(x, 1, z, 0xc2a970); }
  return { body: b, bodyPivot: [12, 0, 12] };
}

function watchtower(): ModelDef {
  const b = new VB();
  for (const [x, z] of [[5, 5], [18, 5], [5, 18], [18, 18]]) for (let y = 0; y < 26; y++) b.set(x + (y > 13 ? (x < 12 ? 1 : -1) : 0), y, z + (y > 13 ? (z < 12 ? 1 : -1) : 0), y % 6 === 0 ? WOOD_L : WOOD);
  for (let y = 7; y < 26; y += 9) { b.box(5, y, 5, 18, y, 5, WOOD_L); b.box(5, y, 18, 18, y, 18, WOOD_L); }
  b.box(3, 26, 3, 20, 26, 20, WOOD_L); // platform
  b.box(3, 27, 3, 20, 29, 20, (x, y, z) => (x === 3 || x === 20 || z === 3 || z === 20 ? (y === 29 ? TEAM : WOOD) : 0)); // railing
  for (let z = 2; z <= 21; z++) { const ry = Math.round((10 - Math.abs(z - 11.5)) * 0.4); for (let x = 2; x <= 21; x++) b.set(x, 34 + ry, z, z % 2 ? 0x5a4a34 : 0x4a3c2a); } // roof
  for (const [x, z] of [[3, 3], [20, 3], [3, 20], [20, 20]]) for (let y = 30; y < 34; y++) b.set(x, y, z, WOOD);
  for (let y = 0; y < 26; y++) b.set(12, y, 19, y % 2 ? WOOD_L : 0); // ladder rungs
  b.box(9, 30, 9, 10, 33, 10, 0xd8d0c0); // searchlight
  return { body: b, bodyPivot: [12, 0, 12] };
}

// ---------------------------------------------------------------- traffic, people, animals
function car(): ModelDef {
  const b = new VB();
  for (const x of [2, 10]) for (const z of [0, 6]) b.box(x, 0, z, x + 2, 1, z, K);
  b.box(0, 1, 1, 14, 3, 5, TEAM); b.box(0, 2, 1, 0, 2, 5, 0x9a9a9a); b.box(14, 2, 1, 14, 2, 5, 0x9a9a9a);
  b.box(4, 4, 1, 10, 5, 5, (x, y, z) => (z === 1 || z === 5 || x === 4 || x === 10 ? (y === 5 ? TEAM_D : GLASS_L) : TEAM_D));
  b.set(14, 3, 1, LAMP); b.set(14, 3, 5, LAMP); b.set(0, 3, 1, 0xc83a2a); b.set(0, 3, 5, 0xc83a2a);
  return { body: b, bodyPivot: [7, 0, 3] };
}

function pickup(): ModelDef {
  const b = new VB();
  for (const x of [2, 12]) for (const z of [0, 7]) b.box(x, 0, z, x + 2, 2, z, K);
  b.box(0, 2, 1, 17, 3, 6, TEAM);
  b.box(11, 4, 1, 16, 6, 6, (x, y, z) => (y === 6 ? TEAM_D : x === 16 || z === 1 || z === 6 ? GLASS : TEAM));
  b.box(0, 4, 1, 10, 4, 6, (x, y, z) => (x === 0 || z === 1 || z === 6 ? TEAM_D : 0)); // open bed
  b.box(2, 4, 2, 5, 5, 4, 0x8a6a40); // crates in the back
  b.set(17, 3, 1, LAMP); b.set(17, 3, 6, LAMP);
  return { body: b, bodyPivot: [8.5, 0, 3.5] };
}

function civilian(): ModelDef {
  const b = new VB();
  b.box(1, 0, 0, 1, 2, 0, 0x3a3a4a); b.box(1, 0, 2, 1, 2, 2, 0x3a3a4a);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.set(0, 4, 0, TEAM_D); b.set(0, 4, 2, TEAM_D);
  b.box(1, 6, 1, 2, 6, 1, SKIN); b.box(1, 7, 0, 2, 7, 2, TEAM_L);
  return { body: b, bodyPivot: [1.5, 0, 1.5] };
}

function cow(): ModelDef {
  const b = new VB();
  for (const [x, z] of [[1, 0], [1, 3], [6, 0], [6, 3]]) b.box(x, 0, z, x, 2, z, 0x2a2420);
  b.box(0, 3, 0, 7, 5, 3, (x, y, z) => (hash3(x >> 1, y, z) < 0.35 ? 0x2a2622 : 0xe8e2d4));
  b.box(8, 4, 1, 9, 6, 2, 0xe8e2d4); b.set(9, 4, 1, 0xc89080); b.set(9, 4, 2, 0xc89080); b.set(8, 7, 1, 0xd8d0c0); b.set(8, 7, 2, 0xd8d0c0);
  b.set(0, 4, 2, 0x2a2622); // tail
  return { body: b, bodyPivot: [4.5, 0, 1.5] };
}

function deer(): ModelDef {
  const b = new VB();
  for (const [x, z] of [[1, 0], [1, 2], [5, 0], [5, 2]]) b.box(x, 0, z, x, 3, z, 0x5a3e28);
  b.box(0, 4, 0, 6, 5, 2, (x, y) => (y === 4 ? 0xb8946a : 0x8a5e38));
  b.box(7, 5, 1, 7, 7, 1, 0x8a5e38); b.set(8, 7, 1, 0x7a5232);
  b.set(7, 8, 0, 0x6a5a48); b.set(7, 8, 2, 0x6a5a48); b.set(7, 9, 0, 0x6a5a48); b.set(7, 9, 2, 0x6a5a48); // antlers
  b.set(0, 5, 1, 0xe8e0d0); // white tail
  return { body: b, bodyPivot: [3.5, 0, 1] };
}

// Rocket Soldier: a rifleman's kit with a long launcher tube over the shoulder.
function rocketeer(): ModelDef {
  const b = new VB();
  b.box(1, 0, 0, 1, 2, 0, K); b.box(1, 0, 2, 1, 2, 2, K);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, TEAM_D);
  b.box(0, 3, 0, 0, 5, 2, 0x6a6a4a);                        // pack of spare rockets
  b.box(1, 6, 1, 2, 6, 1, SKIN);
  b.box(1, 7, 0, 2, 7, 2, TEAM_D); b.set(2, 7, 1, TEAM_L);
  b.box(-3, 6, 2, 5, 7, 3, (x, y) => (x === -3 ? K : y === 7 ? 0x9aa468 : 0x6e7848)); // fat launcher tube on the shoulder
  b.box(6, 6, 2, 7, 7, 3, RED);                             // warhead
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// Scout Buggy: an open roll cage on four fat wheels with a pintle machine gun. Small and quick.
function scout(): ModelDef {
  const b = new VB();
  for (const x of [2, 13]) for (const z of [0, 9]) { b.box(x, 0, z, x + 3, 3, z + 1, K); b.set(x + 1, 2, z === 0 ? 0 : 10, STEEL_L); }
  b.box(1, 2, 2, 17, 3, 8, TEAM_D); b.box(14, 4, 2, 18, 4, 8, TEAM); // chassis, bonnet
  b.box(2, 4, 2, 6, 5, 8, 0x4a4a3a);                        // engine at the back
  b.box(8, 4, 3, 9, 5, 4, K); b.box(8, 4, 6, 9, 5, 7, K);   // seats
  for (const [x, z] of [[7, 2], [7, 8], [12, 2], [12, 8]]) b.box(x, 4, z, x, 9, z, STEEL); // roll cage
  b.box(7, 9, 2, 12, 9, 8, (x, y, z) => (x === 7 || x === 12 || z === 2 || z === 8 ? STEEL_L : 0));
  b.box(10, 10, 5, 10, 10, 5, K); b.box(10, 10, 5, 15, 10, 5, K); // machine gun on the cage
  b.set(19, 3, 3, LAMP); b.set(19, 3, 7, LAMP);
  b.box(1, 5, 4, 1, 8, 4, K); b.set(1, 9, 4, 0xe04030);     // whip aerial
  return { body: b, bodyPivot: [9.5, 0, 5] };
}

// Field Gun: a tracked self-propelled howitzer, its long barrel raised for indirect fire.
function artillery(): ModelDef {
  const b = new VB();
  for (const z0 of [0, 11]) { b.box(1, 0, z0, 24, 3, z0 + 2, K); for (let x = 2; x <= 23; x += 4) b.set(x, 1, z0 === 0 ? 0 : 13, STEEL); }
  b.box(1, 3, 2, 24, 5, 11, TEAM_D); b.box(2, 5, 3, 23, 5, 10, TEAM);
  b.box(20, 3, 2, 25, 4, 11, TEAM);                          // sloped nose
  b.box(1, 1, 3, 1, 3, 10, STEEL);                           // recoil spade folded up at the back
  b.set(24, 5, 3, LAMP); b.set(24, 5, 10, LAMP);
  b.box(3, 6, 2, 6, 7, 11, 0x6a6a4a);                        // ammunition racks
  const t = new VB();
  t.box(0, 0, 0, 11, 5, 8, (x, y, z) => (y === 5 ? TEAM_D : x === 0 ? TEAM_D : TEAM)); // boxy gun house
  t.box(2, 6, 2, 4, 6, 4, STEEL_L);
  for (let i = 0; i < 26; i++) t.box(11 + i, 3 + Math.floor(i / 2.5), 3, 11 + i, 5 + Math.floor(i / 2.5), 5, i > 23 ? K : i % 6 === 0 ? STEEL_L : STEEL); // long raised barrel
  t.box(10, 1, 2, 12, 5, 6, K);                              // mantlet
  return { body: b, bodyPivot: [12.5, 0, 6.5], turret: t, turretPivot: [5, 0, 4], turretAt: [11, 6, 6.5] };
}

// Workshop: a vehicle repair shed with an open bay, a red A-frame hoist over the pad and a spanner
// sign. Vehicles parked beside it get patched up. 2 x 2 cells.
function workshop(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => (Math.abs(x - 34) < 9 && z > 24 && z < 44 ? ((x + z) % 4 === 0 ? 0x5a564e : 0x6e6a62) : pad(x, z, 47, 47)));
  b.box(3, 1, 4, 24, 13, 30, (x, y, z) => {
    const edge = x === 3 || x === 24 || z === 4 || z === 30;
    if (!edge) return 0;
    if (z === 30 && x >= 7 && x <= 20 && y < 11) return y === 10 ? K : 0x1e1e22; // open bay
    if (y >= 11) return TEAM;
    return y <= 1 ? CONC_D : x % 3 === 0 ? 0x7e8288 : 0x9a9ea2;
  });
  for (let z = 4; z <= 30; z++) { const h = 13 + Math.round(5 - Math.abs(z - 17) * 0.38); for (let x = 2; x <= 25; x++) b.set(x, h, z, x % 3 ? 0x8a8e94 : 0x6e7278); for (const x of [3, 24]) for (let y = 14; y < h; y++) b.set(x, y, z, 0x9a9ea2); }
  b.box(9, 14, 31, 18, 18, 31, (x, y) => (y === 14 || y === 18 || x === 9 || x === 18 ? K : CREAM)); // spanner sign
  for (let i = 0; i < 6; i++) b.set(11 + i, 15 + Math.round(i * 0.5), 32, RED);
  // A-frame hoist over the repair pad
  for (let y = 1; y < 24; y++) { const k = Math.round((23 - y) * 0.18); for (const z of [26 - k, 42 + k]) { b.set(28, y, z, RED); b.set(40, y, z, RED); } }
  b.box(28, 24, 26, 40, 25, 42, (x, y, z) => (z === 26 || z === 42 || x === 28 || x === 40 ? RED : 0));
  b.box(33, 24, 26, 35, 25, 42, STEEL);
  for (let y = 16; y < 24; y++) b.set(34, y, 34, K); b.box(32, 14, 32, 36, 15, 36, HAZ); // chain and hook block
  // tyres and a toolbox
  for (const [x, z] of [[6, 36], [6, 41], [11, 39]]) tower(b, x, z, 1, 3, () => 2.4, (xx, y) => (y === 3 ? 0x2a2a2a : K), 1.2, true);
  b.box(16, 1, 36, 21, 4, 40, (x, y) => (y === 4 ? RED : 0xa82a1c));
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Grenadier: a heavier-set soldier with a satchel of grenades and one wound back to throw.
function grenadier(): ModelDef {
  const b = new VB();
  b.box(1, 0, 0, 1, 2, 0, K); b.box(1, 0, 2, 1, 2, 2, K);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, TEAM_D);
  b.box(0, 3, 2, 1, 4, 3, 0x6a5a3a); b.set(0, 4, 3, 0x56603a); // satchel of grenades on the hip
  b.box(1, 6, 1, 2, 6, 1, SKIN);
  b.box(1, 7, 0, 2, 7, 2, 0x4e5a3a); b.set(2, 7, 1, 0x6a7850);  // olive helmet sets them apart
  b.box(0, 5, -1, 0, 7, -1, SKIN); b.box(0, 8, -1, 1, 8, 0, 0x3a4a2a); // arm raised with a grenade
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// Juggernaut: a huge wedge-hulled tank on wide tracks with side skirts and one long cannon.
function juggernaut(): ModelDef {
  const b = new VB();
  for (const z0 of [0, 16]) {
    b.box(0, 0, z0, 31, 4, z0 + 3, K);
    for (let x = 1; x <= 30; x++) b.set(x, 4, z0 === 0 ? 0 : 19, x % 2 ? STEEL_L : K);
    b.box(2, 3, z0 === 0 ? 0 : 19, 29, 6, z0 === 0 ? 0 : 19, (x, y) => (y === 6 ? TEAM_D : (x % 6 === 0 ? TEAM_D : TEAM))); // armoured side skirts
  }
  b.box(1, 3, 4, 30, 6, 15, TEAM_D);
  b.box(2, 7, 3, 26, 8, 16, TEAM);
  for (let i = 0; i < 6; i++) b.box(26 + i, 7 - Math.floor(i / 2), 3, 26 + i, 8 - Math.floor(i / 2), 16, TEAM); // sloped wedge front
  b.box(2, 9, 5, 8, 9, 14, TEAM_D); for (let z = 6; z <= 13; z += 2) b.box(3, 9, z, 7, 9, z, K); // engine deck
  b.box(10, 8, 17, 22, 8, 17, HAZ);
  b.set(31, 6, 4, LAMP); b.set(31, 6, 15, LAMP);
  const t = new VB();
  t.box(0, 0, 0, 14, 4, 11, (x, y, z) => (y === 4 ? TEAM_D : (x + z) % 9 === 0 ? TEAM_D : TEAM));
  t.box(1, 5, 2, 12, 5, 9, TEAM_D); t.box(3, 6, 3, 5, 6, 5, STEEL_L); t.box(9, 6, 6, 10, 7, 7, K);
  t.box(15, 1, 4, 34, 3, 7, STEEL); t.box(15, 3, 5, 34, 3, 6, STEEL_L); t.box(34, 0, 3, 37, 4, 8, K); // long barrel, big muzzle brake
  t.box(13, 0, 3, 15, 4, 8, TEAM_D);
  for (let y = 5; y < 13; y++) t.set(1, y, 10, y === 12 ? 0xe04030 : K);
  return { body: b, bodyPivot: [15.5, 0, 9.5], turret: t, turretPivot: [7, 0, 5.5], turretAt: [14, 9, 9.5] };
}

// Sandbag Wall: one block of stacked sandbags on a timber frame. 1 x 1 cell; lines of them make walls.
function wall(): ModelDef {
  const b = new VB();
  for (let y = 0; y < 9; y++) for (let x = 1; x <= 22; x++) for (let z = 1; z <= 22; z++) {
    const inset = Math.floor(y / 3); // each course sits a little in from the one below
    if (x < 1 + inset || x > 22 - inset || z < 1 + inset || z > 22 - inset) continue;
    const bag = ((x + (y % 2) * 3) % 6 === 0) || ((z + (y % 2) * 3) % 6 === 0) || y % 3 === 2; // seams between bags
    b.set(x, y, z, y === 8 ? (hash3(x, y, z) < 0.5 ? 0xc8b07a : 0xb8a06a) : bag ? 0x8a7448 : hash3(x, y, z) < 0.3 ? 0xa88e5c : 0xb39a64);
  }
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Field Hospital: a long canvas ward tent with a green cross, an ambulance bay and stretchers. 2 x 2.
function hospital(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  for (let z = 6; z <= 34; z++) { // ridge tent along x
    const dz = Math.abs(z - 20), h = Math.max(1, 15 - Math.round(dz * 0.9));
    for (let x = 4; x <= 40; x++) {
      b.set(x, h, z, x % 6 === 0 ? 0xc8c0a8 : 0xe6e0cc);
      if (x === 4 || x === 40) for (let y = 1; y < h; y++) b.set(x, y, z, 0xd8d0b8);
    }
  }
  for (const [cx, cy, cz] of [[22, 12, 30], [22, 12, 10]]) { b.box(cx - 4, cy - 1, cz, cx + 4, cy, cz, 0x3aa858); b.box(cx - 1, cy - 4, cz, cx, cy + 3, cz, 0x3aa858); } // green crosses on the roof slopes
  b.box(40, 1, 16, 40, 8, 24, (x, y) => (y === 8 ? TEAM : 0x5a4a34)); // door flap
  b.box(4, 1, 35, 40, 2, 35, TEAM); // team-coloured skirt
  for (const [x, z] of [[10, 40], [18, 40]]) b.box(x, 1, z, x + 5, 2, z + 2, (xx, y) => (y === 2 ? 0xe6e0cc : 0x5a4a34)); // stretchers
  b.box(30, 1, 38, 44, 7, 45, (x, y, z) => (y === 7 ? 0xe8e4d8 : z === 45 && y > 3 ? GLASS : x === 44 ? 0xd8d4c8 : y < 3 ? K : 0xe8e4d8)); // ambulance
  b.box(36, 5, 45, 38, 6, 45, 0x3aa858); b.set(37, 8, 41, 0x3aa8f8);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Fusion Reactor: a squat ribbed containment drum under a glass dome with a glowing core ring,
// cooling fins all round and conduits out to the pad. Huge power; a huge bang when destroyed. 3 x 3.
function reactor(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => { const d = Math.hypot(x - 36, z - 36); return d < 30 && d > 28 ? 0xd8d4c8 : pad(x, z, 71, 71); });
  tower(b, 36, 36, 1, 14, () => 22, (x, y, z, a) => (y === 14 ? TEAM_D : y >= 11 ? TEAM : (Math.round(a * 16) & 1) ? 0xa8a49a : 0xc2beb2), 2);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; for (let r = 22; r < 28; r++) b.box(36 + Math.cos(a) * r, 1, 36 + Math.sin(a) * r, 36 + Math.cos(a) * r, 10 - (r - 22), 36 + Math.sin(a) * r, STEEL); } // cooling fins
  tower(b, 36, 36, 15, 17, () => 18, (x, y) => (y === 17 ? 0x7ae8ff : 0x3ab0e0), 3, true); // glowing core ring
  dome(b, 36, 17, 36, 15, (x, y, z) => ((x + z) % 7 === 0 || y % 5 === 0 ? 0x5a8ab0 : y > 28 ? 0x9ad0f0 : 0x6aa8d8));
  tower(b, 36, 36, 32, 36, () => 2.5, (x, y) => (y === 36 ? 0xff4030 : STEEL_L));
  for (const [x0, z0, x1, z1] of [[4, 34, 14, 38], [58, 34, 68, 38], [34, 4, 38, 14], [34, 58, 38, 68]]) b.box(x0, 1, z0, x1, 3, z1, (x, y) => (y === 3 ? TEAM_D : STEEL)); // conduits
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Gunship: a stubby armoured helicopter with rocket pods on short wings and a tail boom. The rotor
// is drawn live as a blur.
function gunship(): ModelDef {
  const b = new VB();
  b.box(4, 2, 3, 15, 6, 9, (x, y, z) => (y === 6 ? TEAM_D : x > 12 ? (y > 3 ? GLASS : TEAM) : TEAM)); // cabin
  b.box(13, 3, 4, 17, 5, 8, (x, y) => (y > 3 ? GLASS_L : TEAM_D)); // nose glazing
  b.box(17, 2, 5, 18, 3, 7, K); // chin gun
  for (let x = -10; x < 4; x++) b.box(x, 4, 5, x, 5, 7, x % 3 ? TEAM_D : TEAM); // tail boom
  b.box(-11, 4, 4, -9, 9, 8, (x, y) => (y > 6 ? TEAM : TEAM_D)); // tail fin
  b.box(6, 3, -1, 11, 3, 13, STEEL); // stub wings
  for (const z of [-1, 12]) b.box(5, 1, z, 11, 3, z + 1, (x) => (x === 11 ? RED : 0x4a4e3a)); // rocket pods
  b.box(8, 7, 5, 10, 8, 7, K); // rotor mast
  b.box(4, 0, 4, 14, 0, 4, K); b.box(4, 0, 8, 14, 0, 8, K); // skids
  return { body: b, bodyPivot: [6, 0, 6] };
}

// Flak Truck: a six-wheeled lorry with a twin-barrelled anti-aircraft mount on the bed.
function flakTruck(): ModelDef {
  const b = new VB();
  for (const x of [3, 9, 18]) for (const z of [0, 12]) { b.box(x, 0, z, x + 3, 3, z + 1, K); b.box(x + 1, 1, z === 0 ? 0 : 13, x + 2, 2, z === 0 ? 0 : 13, STEEL); }
  b.box(1, 2, 1, 24, 3, 12, STEEL);
  b.box(17, 4, 2, 23, 9, 11, TEAM); b.box(23, 6, 3, 23, 8, 10, GLASS); b.box(23, 8, 3, 23, 8, 10, GLASS_L);
  b.box(17, 10, 2, 23, 10, 11, TEAM_D);
  b.box(2, 4, 1, 16, 5, 12, TEAM_D); // flatbed
  b.box(3, 6, 2, 15, 6, 11, 0x56603a); // sandbag ring on the bed
  const t = new VB();
  t.box(0, 0, 0, 7, 3, 7, (x, y) => (y === 3 ? TEAM_D : TEAM));
  for (const z of [1, 6]) for (let i = 0; i < 12; i++) t.box(6 + i, 3 + Math.floor(i / 2), z, 6 + i, 3 + Math.floor(i / 2), z, i > 9 ? K : STEEL); // twin barrels angled up
  t.box(2, 4, 2, 4, 5, 5, STEEL_L);
  return { body: b, bodyPivot: [12.5, 0, 6.5], turret: t, turretPivot: [3.5, 0, 3.5], turretAt: [9, 6, 6.5] };
}

// Airfield: a concrete apron with painted pads, a curved hangar, a control tower and a windsock. 3 x 3.
function airfield(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => pad(x, z, 71, 71));
  for (const [cx, cz] of [[48, 22], [48, 52]]) b.box(cx - 10, 0, cz - 10, cx + 10, 0, cz + 10, (x, y, z) => { const d = Math.hypot(x - cx, z - cz); return d < 9.5 && d > 8.3 ? HAZ : (Math.abs(x - cx) < 1 && Math.abs(z - cz) < 6) || (Math.abs(z - cz) < 1 && Math.abs(x - cx) < 4 && x < cx) ? 0xf0f0e8 : 0; }); // helipads
  for (let x = 4; x <= 30; x++) for (let z = 8; z <= 62; z++) { // hangar with a barrel roof
    const dx = (x - 17) / 13, top = Math.round(Math.sqrt(Math.max(0, 1 - dx * dx)) * 18);
    if (z === 8 || z === 62) { for (let y = 1; y <= top; y++) b.set(x, y, z, z === 62 && Math.abs(x - 17) < 9 && y < 14 ? 0x1e1e22 : 0x9ea2a6); }
    b.set(x, Math.max(1, top), z, z % 4 === 0 ? TEAM_D : TEAM);
  }
  b.box(60, 1, 60, 67, 22, 67, (x, y, z) => (y > 18 ? (y === 22 ? TEAM_D : GLASS) : (x + z) % 7 === 0 ? CREAM_D : CREAM)); // control tower
  b.box(59, 23, 59, 68, 23, 68, TEAM);
  for (let y = 1; y < 16; y++) b.set(66, y, 4, STEEL_L); b.box(67, 13, 4, 70, 15, 4, (x) => (x % 2 ? 0xf08030 : 0xe8e0d0)); // windsock
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Flak Tower: a concrete pillar topped with a turning quad-barrelled anti-aircraft mount. 1 x 1.
function flakTower(): ModelDef {
  const b = new VB();
  b.box(5, 0, 5, 18, 2, 18, CONC_D);
  tower(b, 12, 12, 3, 14, () => 5, (x, y) => (y % 4 === 0 ? CONC_D : y > 12 ? TEAM : CONC));
  b.box(5, 15, 5, 18, 15, 18, (x, y, z) => (x === 5 || x === 18 || z === 5 || z === 18 ? TEAM_D : CONC));
  const t = new VB();
  t.box(0, 0, 0, 7, 3, 7, (x, y) => (y === 3 ? TEAM_D : TEAM));
  for (const z of [0, 2, 5, 7]) for (let i = 0; i < 10; i++) t.box(6 + i, 2 + Math.floor(i / 2), z, 6 + i, 2 + Math.floor(i / 2), z, i > 7 ? K : STEEL);
  return { body: b, bodyPivot: [12, 0, 12], turret: t, turretPivot: [3.5, 0, 3.5], turretAt: [12, 16, 12] };
}

// Radar Tower: a lattice mast on a bunker with a big curved dish and a blinking light. 2 x 2.
function radar(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  b.box(10, 1, 26, 30, 8, 42, (x, y, z) => (y === 8 ? TEAM_D : (x === 10 || x === 30 || z === 26 || z === 42) ? (z === 42 && x > 17 && x < 23 && y < 6 ? K : CREAM) : 0)); // equipment bunker
  for (let y = 1; y < 34; y++) { const k = Math.round((33 - y) * 0.18); for (const [x, z] of [[28 - k, 10 - k], [36 + k, 10 - k], [28 - k, 18 + k], [36 + k, 18 + k]]) b.set(x, y, z, y % 5 < 2 ? TEAM : STEEL); if (y % 6 === 0) b.box(28 - k, y, 10 - k, 36 + k, y, 18 + k, (x, yy, z) => (x === 28 - k || x === 36 + k || z === 10 - k || z === 18 + k ? STEEL_L : 0)); }
  for (let a = -9; a <= 9; a++) for (let c = -7; c <= 7; c++) if (Math.hypot(a, c * 1.2) < 9.5) b.set(32 + Math.abs(a) * 0.35 + Math.abs(c) * 0.25 - 3, 40 + c, 14 + a, Math.hypot(a, c) > 8 ? STEEL_L : 0xe8e4d8); // dish
  b.box(34, 34, 13, 35, 41, 15, STEEL); b.set(36, 44, 14, 0xff4030);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Artillery Battery: a fortified concrete pit with a huge long-barrelled gun on a turntable. 2 x 2.
function battery(): ModelDef {
  const b = new VB();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
    const d = Math.hypot(x - 23.5, z - 23.5);
    if (d > 23 - y * 0.5 || (d < 18 && y < 7)) continue;
    b.set(x, y, z, y === 7 ? TEAM_D : y === 4 ? TEAM : hash3(x, y, z) < 0.1 ? CONC_D : CONC);
  }
  b.box(8, 0, 8, 39, 6, 39, (x, y, z) => (y === 6 && Math.hypot(x - 23.5, z - 23.5) < 18 ? (Math.hypot(x - 23.5, z - 23.5) > 14 ? HAZ : CONC_D) : 0));
  for (const [x, z] of [[6, 40], [10, 42], [40, 6]]) b.box(x, 7, z, x + 2, 9, z + 2, 0x6a5a3a); // ammunition crates on the rim
  const t = new VB();
  t.box(0, 0, 0, 16, 7, 14, (x, y, z) => (y === 7 ? TEAM_D : (x + z) % 8 === 0 ? TEAM_D : TEAM));
  t.box(2, 8, 3, 10, 8, 11, TEAM_D); t.box(4, 9, 5, 6, 9, 7, STEEL_L);
  for (let i = 0; i < 40; i++) t.box(16 + i, 3 + Math.floor(i / 5), 5, 16 + i, 5 + Math.floor(i / 5), 9, i > 37 ? K : i % 8 === 0 ? STEEL_L : STEEL); // very long raised barrel
  t.box(15, 1, 4, 17, 7, 10, K);
  return { body: b, bodyPivot: [24, 0, 24], turret: t, turretPivot: [8, 0, 7], turretAt: [24, 7, 24] };
}

// Colossus: a mobile fortress on four huge track units, a stepped armoured hull with flak mounts
// at the corners and a great twin-cradle cannon turret. The biggest thing on the battlefield.
function colossus(): ModelDef {
  const b = new VB();
  for (const [x0, z0] of [[0, 0], [30, 0], [0, 30], [30, 30]]) { // four track units
    b.box(x0, 0, z0, x0 + 26, 7, z0 + 9, K);
    for (let x = x0 + 1; x <= x0 + 25; x++) b.set(x, 7, z0 === 0 ? z0 : z0 + 9, x % 2 ? STEEL_L : K);
    for (let x = x0 + 3; x <= x0 + 23; x += 5) b.box(x, 2, z0 === 0 ? z0 : z0 + 9, x + 2, 4, z0 === 0 ? z0 : z0 + 9, STEEL);
  }
  b.box(2, 7, 4, 54, 14, 35, TEAM_D); // lower hull
  b.box(6, 15, 8, 50, 20, 31, (x, y, z) => (y === 20 ? TEAM_D : (x + z) % 9 === 0 ? TEAM_D : TEAM)); // upper hull
  for (let i = 0; i < 6; i++) b.box(50 + i, 15 - i, 8, 50 + i, 20 - i, 31, TEAM); // sloped glacis
  b.box(8, 21, 10, 18, 22, 29, TEAM_D); for (let z = 12; z <= 27; z += 3) b.box(9, 23, z, 17, 23, z, K); // engine deck and grilles
  for (const [x, z] of [[8, 6], [8, 33], [46, 6], [46, 33]]) { b.box(x - 2, 15, z - 2, x + 2, 19, z + 2, TEAM_D); b.box(x, 20, z - 1, x + 5, 20, z - 1, STEEL); b.box(x, 20, z + 1, x + 5, 20, z + 1, STEEL); } // corner flak mounts
  b.box(20, 15, 36, 40, 17, 36, HAZ);
  b.set(56, 12, 10, LAMP); b.set(56, 12, 29, LAMP);
  const t = new VB();
  t.box(0, 0, 0, 22, 9, 18, (x, y, z) => (y === 9 ? TEAM_D : (x + z) % 7 === 0 ? TEAM_D : TEAM));
  t.box(2, 10, 3, 16, 11, 15, TEAM_D); t.box(5, 12, 6, 9, 13, 10, STEEL_L);
  for (const z of [5, 12]) { t.box(22, 3, z, 52, 5, z + 2, STEEL); t.box(22, 5, z, 52, 5, z + 2, STEEL_L); t.box(52, 2, z - 1, 56, 6, z + 3, K); } // twin long cannons
  t.box(20, 1, 3, 23, 8, 16, K);
  for (let y = 10; y < 22; y++) t.set(2, y, 16, y === 21 ? 0xe04030 : K);
  return { body: b, bodyPivot: [28, 0, 20], turret: t, turretPivot: [11, 0, 9], turretAt: [28, 21, 20] };
}

// Proving Ground: a towering assembly hall with a huge door, a gantry crane over a test pad and
// warning stripes. Super-units are built here. 3 x 3.
function provingGround(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => pad(x, z, 71, 71));
  b.box(4, 1, 4, 50, 30, 46, (x, y, z) => {
    const edge = x === 4 || x === 50 || z === 4 || z === 46;
    if (!edge && y < 30) return 0;
    if (y === 30) return (x + z) % 6 === 0 ? TEAM_D : 0x6e7278;
    if (y >= 26) return TEAM;
    if (z === 46 && x >= 10 && x <= 44 && y < 24) return y === 23 ? K : x % 4 === 0 ? 0x3a3e44 : 0x4a4e54; // giant door
    if (y >= 15 && y <= 17 && (x - 4) % 6 >= 2 && (x - 4) % 6 <= 4) return y === 17 ? GLASS_L : GLASS;
    return y <= 1 ? CONC_D : (x + y) % 9 === 0 ? 0x8a8e94 : 0x9ea2a6;
  });
  for (const x of [54, 68]) for (let y = 1; y < 36; y++) { b.set(x, y, 6, y % 4 < 2 ? TEAM : STEEL); b.set(x, y, 66, y % 4 < 2 ? TEAM : STEEL); }
  b.box(54, 36, 6, 68, 37, 66, (x, y, z) => (x === 54 || x === 68 || z === 6 || z === 66 ? TEAM_D : 0));
  b.box(58, 36, 30, 64, 37, 36, STEEL_L); for (let y = 26; y < 36; y++) b.set(61, y, 33, K);
  b.box(54, 0, 50, 70, 0, 70, (x, y, z) => ((x + z) % 4 === 0 ? HAZ : 0)); // test pad stripes
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Interceptor Battery: an armoured launcher on a turntable carrying two long interceptors, with a
// tracking radar beside it. 2 x 2.
function interceptor(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  b.box(8, 1, 8, 40, 5, 40, (x, y, z) => (Math.hypot(x - 24, z - 24) < 16 ? (y === 5 ? CONC_D : CONC) : 0));
  b.box(14, 6, 18, 34, 10, 30, (x, y) => (y === 10 ? TEAM_D : TEAM)); // launcher base
  for (const z of [20, 27]) for (let i = 0; i < 26; i++) b.box(14 + i, 11 + Math.floor(i * 0.6), z, 14 + i, 12 + Math.floor(i * 0.6), z + 1, i > 22 ? 0xe8e4d8 : i % 6 === 0 ? RED : 0xd8d4c8); // two interceptors angled up
  for (let y = 6; y < 22; y++) b.set(6, y, 40, STEEL); b.box(3, 22, 37, 9, 26, 43, (x, y, z) => (Math.abs(x - 6) + Math.abs(y - 24) < 4 ? 0xe8e4d8 : 0)); // tracking radar
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Shield Generator: a squat reactor drum under a lattice pylon topped with a glowing emitter
// sphere and three halo rings. The dome itself is drawn live. 2 x 2.
function shieldGen(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  tower(b, 24, 24, 1, 10, () => 14, (x, y) => (y === 10 ? TEAM_D : y % 3 === 0 ? CONC_D : CONC), 2);
  for (let y = 11; y < 30; y++) { const k = Math.round((29 - y) * 0.25); for (const [x, z] of [[20 - k, 20 - k], [28 + k, 20 - k], [20 - k, 28 + k], [28 + k, 28 + k]]) b.set(x, y, z, y % 4 < 2 ? TEAM : STEEL); }
  for (const [y, r] of [[16, 9], [22, 7], [28, 5]]) tower(b, 24, 24, y, y, () => r, () => 0x7ae8ff, 1.2, true);
  dome(b, 24, 30, 24, 4, (x, y) => (y > 32 ? 0xd8f8ff : 0x9ae8ff));
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Engineer: a soldier in a hard hat with a heavy tool pack and a cable reel.
function engineer(): ModelDef {
  const b = new VB();
  b.box(1, 0, 0, 1, 2, 0, K); b.box(1, 0, 2, 1, 2, 2, K);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, TEAM_D);
  b.box(-1, 3, 0, 0, 6, 2, 0x5a5e64); b.set(-1, 6, 1, LAMP); // tool pack with a work light
  b.box(1, 6, 1, 2, 6, 1, SKIN);
  b.box(1, 7, 0, 2, 7, 2, HAZ); b.set(2, 7, 1, 0xfff0a0); // yellow hard hat
  b.box(3, 4, 1, 4, 4, 1, STEEL_L); // a wrench in hand
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// Bomber: a twin-engined straight-winged bomber with a glazed nose and a bomb bay.
function bomber(): ModelDef {
  const b = new VB();
  b.box(0, 3, 4, 26, 6, 8, (x, y) => (y === 6 ? TEAM_D : TEAM)); // fuselage
  b.box(26, 3, 5, 29, 5, 7, (x, y) => (y > 3 ? GLASS_L : GLASS)); // glazed nose
  b.box(11, 5, -10, 16, 5, 22, (x, y, z) => (z % 6 === 0 ? TEAM_D : TEAM)); // wings
  for (const z of [-3, 15]) { b.box(10, 3, z, 17, 6, z + 2, 0x4a4e3a); b.box(18, 4, z, 18, 5, z + 2, K); } // engines
  b.box(0, 6, 5, 3, 11, 7, TEAM); b.box(0, 7, 1, 3, 7, 11, TEAM_D); // tail
  b.box(8, 2, 5, 20, 2, 7, K); // bomb bay
  b.box(12, 6, -10, 13, 6, 22, HAZ);
  return { body: b, bodyPivot: [14, 0, 6] };
}

// Armoury: a research block with a sawtooth lab roof, test rigs, a shell rack and a tall antenna. 2 x 2.
function armoury(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  b.box(4, 1, 6, 34, 12, 32, (x, y, z) => {
    const edge = x === 4 || x === 34 || z === 6 || z === 32;
    if (!edge) return 0;
    if (y >= 10) return TEAM;
    if (y >= 5 && y <= 7 && (x - 4) % 5 >= 1 && (x - 4) % 5 <= 3) return y === 7 ? GLASS_L : GLASS;
    return y <= 1 ? CONC_D : (x + y) % 8 === 0 ? CREAM_D : CREAM;
  });
  for (let z = 6; z <= 32; z++) { const t = (z - 6) % 6, h = 13 + 4 - Math.floor(t * 0.7); for (let x = 4; x <= 34; x++) { b.set(x, h, z, x % 2 ? 0x8a8e94 : 0x74787e); if (t === 0) for (let y = 13; y < h; y++) b.set(x, y, z, GLASS); } }
  for (let x = 38; x <= 44; x += 2) for (let y = 1; y <= 4; y++) b.set(x, y, 40, y === 4 ? HAZ : 0x8a6a3a); // shell rack
  b.box(37, 1, 8, 45, 6, 16, (x, y) => (y === 6 ? K : x % 2 ? STEEL : STEEL_L)); // test rig
  for (let y = 13; y < 30; y++) b.set(30, y, 10, y % 3 ? STEEL : RED); b.set(30, 30, 10, 0xff4030);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// ---------------------------------------------------------------- base structures
// Generator: a concrete cooling tower that waists in and flares out, beside a turbine shed and a
// transformer yard. Steam rises from the tower (drawn live). 2 x 2 cells.
function generator(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  tower(b, 29, 18, 1, 34, (y) => 9 + 5 * ((y - 25) / 24) ** 2, (x, y, z, a) => {
    if (y >= 33) return TEAM_D;
    if (y >= 29 && y <= 30) return TEAM;
    if (y <= 3) return (Math.round(a * 6) & 1) ? CONC_D : 0x5a564e; // the open legs at the foot
    if (hash3(Math.round(a * 14), 0, 0) < 0.25 && y > 14 && y < 29) return 0xa29c8e; // rain stains run down from the lip
    return y < 8 ? 0xaaa496 : 0xc2bcae;
  }, 2.6, true);
  b.box(18, 1, 7, 40, 1, 29, (x, y, z) => (Math.hypot(x - 29, z - 18) < 11 ? 0x2e3a40 : 0)); // dark water deep inside
  // turbine shed with a pitched team-coloured roof and a glowing window
  b.box(3, 1, 30, 22, 9, 44, (x, y, z) => {
    const edge = x === 3 || x === 22 || z === 30 || z === 44;
    if (!edge && y < 9) return 0;
    if (y === 9) return 0;
    if (z === 44 && x >= 8 && x <= 17 && y >= 3 && y <= 6) return y === 6 ? K : x % 3 === 0 ? 0xffb040 : 0xe08020;
    return y <= 1 ? CONC_D : (x + y) % 9 === 0 ? CREAM_D : CREAM;
  });
  for (let z = 30; z <= 44; z++) { const h = 9 + Math.round(7 - Math.abs(z - 37)); for (let x = 3; x <= 22; x++) { b.set(x, h, z, x % 3 ? TEAM : TEAM_D); if (x === 3 || x === 22) for (let y = 9; y < h; y++) b.set(x, y, z, CREAM_D); } }
  b.box(22, 5, 34, 26, 6, 36, STEEL); b.box(26, 2, 34, 27, 6, 36, STEEL); // pipe from the shed to the tower
  // transformer yard
  b.box(30, 1, 36, 44, 1, 45, (x, z) => (x === 30 || x === 44 || z === 36 || z === 45 ? STEEL_L : 0));
  b.box(33, 1, 38, 38, 7, 43, (x, y) => (y === 7 ? K : y % 2 ? 0x6a6e74 : 0x8a8e94));
  for (let y = 8; y < 13; y++) { b.set(34, y, 39, 0xd8d0b8); b.set(37, y, 42, 0xd8d0b8); b.set(41, y - 2, 40, 0xd8d0b8); }
  for (let y = 1; y < 18; y++) b.set(44, y, 30, STEEL); b.box(42, 17, 30, 46, 17, 30, STEEL_L); // pylon
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Scrapyard: a rusting crusher hall with a sawtooth roof and a tall chimney, heaps of salvage and a
// magnet crane. The unloading bay is at the front (south). 3 x 2 cells.
function scrapyard(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 47, (x, y, z) => ((x % 12 === 0 || z % 12 === 0) ? CONC_D : hash3(x, 0, z) < 0.15 ? 0x7a6e5e : CONC));
  b.box(4, 1, 4, 34, 12, 26, (x, y, z) => {
    const edge = x === 4 || x === 34 || z === 4 || z === 26;
    if (!edge) return 0;
    if (z === 26 && x >= 12 && x <= 26 && y < 10) return y === 9 ? K : y % 3 === 0 ? 0x4a4e54 : 0x5e6268; // crusher door
    if (y >= 10) return TEAM;
    return x % 2 ? (hash3(x, y, z) < 0.25 ? RUST_L : RUST) : 0x6e3a20; // corrugated rusty sheet
  });
  for (let z = 4; z <= 26; z++) { // sawtooth roof: slopes face south, glass faces north
    const t = (z - 4) % 7, h = 12 + 7 - t;
    for (let x = 4; x <= 34; x++) {
      b.set(x, h, z, x % 2 ? 0x8a8e94 : 0x74787e);
      if (t === 0) for (let y = 13; y < h; y++) b.set(x, y, z, y === h - 1 ? GLASS_L : GLASS);
      if (x === 4 || x === 34) for (let y = 13; y < h; y++) b.set(x, y, z, RUST);
    }
  }
  tower(b, 9, 9, 13, 38, (y) => 2.6 - y * 0.02, (x, y) => (y >= 36 ? K : y >= 32 && y <= 33 ? TEAM : y % 5 === 0 ? 0x6e3a20 : 0x8a5a3a)); // chimney
  for (let i = 0; i < 26; i++) b.box(34 + i, 8 + Math.round(i * 0.35), 13, 34 + i, 9 + Math.round(i * 0.35), 16, i % 3 ? K : STEEL_L); // conveyor
  for (const [cx, cz, r] of [[56, 14, 9], [62, 34, 7], [44, 38, 6]]) // salvage heaps
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const hgt = Math.round((r - Math.hypot(dx, dz)) * 0.9);
      for (let y = 1; y <= hgt; y++) b.set(cx + dx, y, cz + dz, [RUST, RUST_L, STEEL, 0x6e3a20, STEEL_L, TEAM_D][(hash3(cx + dx, y, cz + dz) * 6) | 0]);
    }
  // magnet crane: a lattice mast, a long jib and a round magnet hanging over the heap
  for (let y = 1; y < 32; y++) for (const [x, z] of [[39, 5], [41, 5], [39, 7], [41, 7]]) b.set(x, y, z, y % 4 < 2 ? TEAM : STEEL);
  b.box(36, 32, 5, 64, 33, 7, (x) => (x % 3 === 0 ? STEEL_L : TEAM)); b.box(34, 32, 5, 37, 35, 7, 0x4a4e54); // jib and counterweight
  for (let y = 22; y < 32; y++) b.set(56, y, 6, K);
  tower(b, 56, 6, 19, 21, () => 3.4, (x, y) => (y === 21 ? STEEL_L : 0x3a3c40), 4);
  b.box(10, 0, 30, 30, 0, 44, (x, y, z) => ((x + z) % 6 === 0 ? CONC_D : 0)); // unloading bay markings
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Barracks: a long hut with a curved corrugated roof, sandbags and a noticeboard. 2 x 2 cells.
function barracks(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => ((x + z) % 9 === 0 ? 0x6a5a40 : 0x7a6a4c));
  for (let z = 10; z <= 34; z++) {
    const dz = (z - 22) / 12;
    const top = Math.round(Math.sqrt(Math.max(0, 1 - dz * dz)) * 14);
    for (let x = 4; x <= 43; x++) {
      b.set(x, Math.max(1, top), z, x % 3 === 0 ? 0x6a6e5a : 0x7a7e66);
      if (x === 4 || x === 43) for (let y = 1; y < top; y++) b.set(x, y, z, y > top - 3 ? TEAM : 0x5a5e4a);
    }
  }
  b.box(43, 1, 19, 43, 8, 25, (x, y) => (y === 8 ? K : 0x3a2c20)); // door
  b.box(44, 9, 18, 44, 10, 26, TEAM);
  for (let x = 6; x <= 40; x++) if (x % 9 > 1) { b.set(x, 1, 37, 0xb39a64); b.set(x, 2, 37, 0xc2a970); } // sandbags
  b.box(8, 1, 36, 8, 9, 36, 0x5a4a34); b.box(8, 6, 37, 14, 9, 37, (x, y) => (y === 9 ? TEAM : 0xe8dcc0)); // noticeboard
  for (let y = 1; y < 30; y++) b.set(40, y, 41, y === 29 ? HAZ : STEEL_L); // flagpole
  b.box(40, 22, 42, 40, 28, 51, (x, y, z) => (Math.abs(y - 25 + Math.sin(z * 0.7)) < 1 ? TEAM_D : TEAM)); // flag
  for (const [x, z] of [[2, 2], [9, 2], [2, 8], [9, 8]]) for (let y = 1; y < 14; y++) b.set(x, y, z, 0x5a4a34); // water tank on stilts
  tower(b, 5.5, 5, 14, 21, () => 4.6, (x, y) => (y === 21 ? TEAM_D : y % 3 === 0 ? 0x5a4a34 : WOOD_L));
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Vehicle Depot: a big hangar under a pitched team-coloured roof, with a glass control cab on stilts,
// a jib crane and a turntable on the apron. 3 x 3 cells.
function depot(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => pad(x, z, 71, 71));
  const x0 = 6, x1 = 60, z0 = 6, z1 = 44, wall = 14, ridge = 25;
  const roofAt = (z: number) => wall + Math.round((1 - Math.abs(z - ridge) / (ridge - z0)) * 11);
  b.box(x0, 1, z0, x1, wall, z1, (x, y, z) => {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (!edge) return 0;
    if (z === z1 && ((x >= 11 && x <= 28) || (x >= 38 && x <= 55)) && y < 12) return y === 11 ? K : (x === 11 || x === 38 || y > 8) ? 0x4a4e54 : 0x1e1e22; // two open bays
    if (y >= 12 && z === z1) return TEAM_D;
    return y <= 1 ? CONC_D : (x + z) % 4 === 0 ? 0x8a8e94 : 0x9ea2a6; // ribbed steel siding
  });
  for (let z = z0; z <= z1; z++) {
    const h = roofAt(z);
    for (let x = x0 - 1; x <= x1 + 1; x++) b.set(x, h, z, (x % 4 === 0) ? TEAM_D : TEAM);
    for (const x of [x0, x1]) for (let y = wall + 1; y < h; y++) b.set(x, y, z, 0x9ea2a6); // gable ends
  }
  for (let x = x0 + 4; x <= x1 - 4; x += 10) b.box(x, roofAt(ridge) + 1, ridge - 1, x + 2, roofAt(ridge) + 2, ridge + 1, STEEL_L); // roof vents
  // control cab on stilts at the corner
  for (const [x, z] of [[62, 48], [69, 48], [62, 55], [69, 55]]) for (let y = 1; y < 18; y++) b.set(x, y, z, STEEL);
  b.box(61, 18, 47, 70, 24, 56, (x, y, z) => (y === 24 ? TEAM_D : y === 18 ? STEEL : (x === 61 || x === 70 || z === 47 || z === 56) ? (y >= 20 && y <= 22 ? GLASS_L : CREAM) : 0));
  for (let y = 1; y < 18; y++) b.set(63, y, 57, y % 2 ? STEEL_L : 0); // ladder
  // jib crane over the apron
  for (let y = 1; y < 34; y++) for (const [x, z] of [[4, 50], [6, 50], [4, 52], [6, 52]]) b.set(x, y, z, y % 4 < 2 ? TEAM : STEEL);
  b.box(2, 34, 50, 40, 35, 52, (x) => (x % 3 === 0 ? STEEL_L : TEAM)); b.box(0, 34, 50, 3, 37, 52, 0x4a4e54);
  for (let y = 24; y < 34; y++) b.set(32, y, 51, K); b.box(30, 22, 49, 34, 23, 53, STEEL_L);
  // turntable with a painted ring
  b.box(16, 0, 50, 44, 0, 70, (x, y, z) => { const d = Math.hypot(x - 30, z - 60); return d < 9.5 ? (d > 8.5 || Math.abs(x - 30) < 1 ? 0xf0f0e8 : 0x6e6a62) : 0; });
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Derrick: a lattice drilling tower over the well, a squat storage tank and a gas flare. 2 x 2 cells.
function derrick(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => (Math.hypot(x - 24, z - 24) < 8 ? 0x1e1c1a : (x % 12 === 0 || z % 12 === 0 ? CONC_D : CONC)));
  for (let y = 1; y < 40; y++) { // tapering lattice tower
    const s = Math.round(9 - y * 0.19), c0 = 24 - s, c1 = 24 + s;
    for (const [x, z] of [[c0, c0], [c1, c0], [c0, c1], [c1, c1]]) b.set(x, y, z, y % 8 < 4 ? TEAM : STEEL);
    if (y % 6 === 0) for (let k = c0; k <= c1; k++) { b.set(k, y, c0, STEEL_L); b.set(k, y, c1, STEEL_L); b.set(c0, y, k, STEEL_L); b.set(c1, y, k, STEEL_L); }
  }
  b.box(21, 40, 21, 27, 41, 27, TEAM_D); b.box(23, 1, 23, 25, 6, 25, K); // crown block, wellhead
  for (let y = 1; y < 14; y++) for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) { // storage tank
    const d = Math.hypot(dx, dz);
    if (d < 5.8 && (d > 4.6 || y === 13)) b.set(38 + dx, y, 10 + dz, y === 13 ? STEEL : y % 4 === 0 ? TEAM_D : 0x3a3a3a);
  }
  for (let y = 1; y < 22; y++) b.set(8, y, 40, y % 3 ? STEEL : HAZ); // flare stack (the flame is drawn live)
  b.box(9, 3, 24, 22, 4, 25, STEEL_L); b.box(26, 3, 18, 33, 4, 19, STEEL_L); // pipes
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Guard Tower: a tall concrete lookout on four legs, sandbagged gun nest under a peaked tin roof,
// with a searchlight. 1 x 1 cell.
function guardTower(): ModelDef {
  const b = new VB();
  for (let a = 0; a < 44; a++) { const x = 12 + Math.cos((a / 44) * 6.283) * 11, z = 12 + Math.sin((a / 44) * 6.283) * 11; b.set(x, 0, z, 0xb39a64); b.set(x, 1, z, 0xc2a970); }
  b.box(8, 0, 8, 15, 4, 15, (x, y, z) => (hash3(x, y, z) < 0.1 ? CONC_D : CONC)); // footing
  for (const [x, z] of [[7, 7], [16, 7], [7, 16], [16, 16]]) for (let y = 1; y < 16; y++) { const k = Math.round((15 - y) * 0.08); b.set(x < 12 ? x - k : x + k, y, z < 12 ? z - k : z + k, CONC); }
  for (let y = 5; y < 16; y += 5) b.box(7, y, 11, 16, y, 12, STEEL); // cross braces
  b.box(4, 16, 4, 19, 17, 19, (x, y) => (y === 17 ? CONC_D : CONC)); // platform
  b.box(4, 18, 4, 19, 21, 19, (x, y, z) => (x === 4 || x === 19 || z === 4 || z === 19 ? (y === 21 ? TEAM : y % 2 ? 0xb39a64 : 0xc2a970) : 0)); // sandbags
  b.box(12, 20, 19, 12, 21, 24, K); // machine gun barrel poking out
  for (const [x, z] of [[4, 4], [19, 4], [4, 19], [19, 19]]) for (let y = 22; y < 26; y++) b.set(x, y, z, STEEL);
  for (let z = 2; z <= 21; z++) for (let x = 2; x <= 21; x++) { const h = 26 + Math.round(4 - Math.max(Math.abs(x - 11.5), Math.abs(z - 11.5)) * 0.4); b.set(x, h, z, (x + z) % 2 ? TEAM : TEAM_D); } // peaked roof
  b.box(18, 22, 9, 20, 24, 11, STEEL_L); b.set(21, 23, 10, LAMP); // searchlight
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Cannon Emplacement: a sandbagged concrete ring with a turning gun turret. 2 x 2 cells.
function emplacement(): ModelDef {
  const b = new VB();
  for (let y = 0; y < 7; y++) for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
    const d = Math.max(Math.abs(x - 23.5), Math.abs(z - 23.5)) * 0.7 + Math.hypot(x - 23.5, z - 23.5) * 0.35;
    if (d > 17 - y * 0.4 || (d < 14 && y < 6)) continue;
    b.set(x, y, z, y === 6 ? TEAM_D : y === 3 ? TEAM : hash3(x, y, z) < 0.1 ? CONC_D : CONC);
  }
  b.box(10, 0, 10, 37, 5, 37, (x, y, z) => (y === 5 ? (x % 4 === 0 || z % 4 === 0 ? CONC_D : CONC) : 0)); // deck
  for (let a = 0; a < 70; a++) { if (a % 14 < 2) continue; const x = 23.5 + Math.cos((a / 70) * 6.283) * 22, z = 23.5 + Math.sin((a / 70) * 6.283) * 22; b.set(x, 0, z, 0xb39a64); b.set(x, 1, z, 0xc2a970); }
  const t = new VB();
  t.box(0, 0, 2, 13, 5, 13, (x, y, z) => (y === 5 ? TEAM_D : (x + z) % 7 === 0 ? TEAM_D : TEAM));
  t.box(1, 6, 4, 9, 6, 11, TEAM_D); t.box(4, 7, 6, 6, 7, 8, STEEL_L);
  t.box(14, 2, 6, 30, 3, 9, STEEL); t.box(14, 3, 7, 30, 3, 8, STEEL_L); t.box(30, 1, 5, 32, 4, 10, K); // long barrel, muzzle brake
  t.box(12, 1, 4, 14, 5, 11, TEAM_D);
  return { body: b, bodyPivot: [24, 0, 24], turret: t, turretPivot: [6.5, 0, 7.5], turretAt: [24, 6, 24] };
}

// Fuel Depot: three squat fuel tanks behind a fence, a pump house and a loading arm. Captured,
// it pays its holder. 2 x 2 cells.
function fuelDepot(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => (x % 12 === 0 || z % 12 === 0 ? CONC_D : hash3(x, 0, z) < 0.1 ? 0x3a3630 : CONC));
  for (const [cx, cz, rad, h] of [[14, 14, 8, 14], [34, 14, 8, 14], [14, 34, 7, 11]]) {
    tower(b, cx, cz, 1, h, () => rad, (x, y) => (y === h ? 0x9a9e94 : y % 5 === 0 ? TEAM_D : y === h - 1 ? TEAM : 0xd8d4c8), 1.4);
    dome(b, cx, h, cz, Math.round(rad * 0.6), () => 0xb8bcb4);
    for (let y = 1; y < h; y++) b.set(cx + rad, y, cz, y % 2 ? K : 0); // ladder
  }
  b.box(28, 1, 28, 42, 8, 40, (x, y, z) => (y === 8 ? RED : (x === 28 || x === 42 || z === 28 || z === 40) ? (z === 40 && x > 32 && x < 38 && y < 6 ? K : CREAM) : 0)); // pump house
  for (let x = 1; x <= 46; x += 3) { b.set(x, 1, 46, STEEL); b.set(x, 2, 46, STEEL); } b.box(1, 3, 46, 46, 3, 46, STEEL_L); // fence
  b.box(21, 6, 24, 27, 7, 25, STEEL); b.box(26, 1, 24, 27, 6, 25, STEEL); // pipework
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Power Plant (neutral, capturable): an old brick turbine hall with two tall chimneys and a
// switchyard of pylons. Held, it powers your base. 3 x 2 cells.
function powerPlant(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 47, (x, y, z) => ((x % 12 === 0 || z % 12 === 0) ? CONC_D : hash3(x, 0, z) < 0.12 ? 0x4a4440 : CONC));
  const BRICK = [0x7a4a34, 0x8a5640, 0x6a3e2c];
  b.box(4, 1, 6, 40, 15, 30, (x, y, z) => {
    const edge = x === 4 || x === 40 || z === 6 || z === 30;
    if (!edge) return 0;
    if (y >= 13) return TEAM;
    if (y >= 6 && y <= 10 && (x - 4) % 6 >= 2 && (x - 4) % 6 <= 4 && z !== 6) return y === 10 ? GLASS_L : GLASS;
    return BRICK[(Math.floor(x / 2) + y + (y % 2)) % 3];
  });
  for (let z = 6; z <= 30; z++) { const h = 16 + Math.round(4 - Math.abs(z - 18) * 0.33); for (let x = 4; x <= 40; x++) b.set(x, h, z, x % 2 ? 0x5a5e64 : 0x4a4e54); }
  for (const cx of [12, 32]) tower(b, cx, 10, 17, 46, (y) => 3 - y * 0.015, (x, y) => (y >= 44 ? K : y % 7 === 0 ? TEAM : BRICK[(y + x) % 3]));
  for (const [x, z] of [[50, 10], [62, 10], [50, 36], [62, 36]]) { for (let y = 1; y < 18; y++) b.set(x, y, z, STEEL); b.box(x - 3, 17, z, x + 3, 17, z, STEEL_L); for (let y = 14; y < 17; y++) { b.set(x - 3, y, z, 0xd8d0b8); b.set(x + 3, y, z, 0xd8d0b8); } } // switchyard pylons
  b.box(46, 1, 20, 66, 6, 28, (x, y) => (y === 6 ? K : y % 2 ? 0x6a6e74 : 0x8a8e94)); // transformers
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Comm Tower (neutral, capturable): a very tall guyed lattice mast with dishes and a blinking top.
// Held, it lets you see far across the map. 1 x 1 cell.
function commTower(): ModelDef {
  const b = new VB();
  b.box(4, 0, 4, 19, 3, 19, (x, y) => (y === 3 ? CONC_D : CONC));
  b.box(6, 4, 6, 12, 9, 12, (x, y) => (y === 9 ? TEAM : CREAM)); // equipment hut
  for (let y = 4; y < 60; y++) { const k = Math.round((59 - y) * 0.05); for (const [x, z] of [[14 - k, 14 - k], [17 + k, 14 - k], [14 - k, 17 + k], [17 + k, 17 + k]]) b.set(x, y, z, y % 6 < 3 ? TEAM : STEEL_L); }
  for (const y of [24, 38]) for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) if (Math.hypot(a, c) < 3.5) b.set(20 + Math.abs(c) * 0.3, y + a, 15.5 + c, 0xe8e4d8); // dishes
  for (let y = 60; y < 66; y++) b.set(15.5, y, 15.5, y === 65 ? 0xff3020 : STEEL);
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Repair Yard (neutral, capturable): a fenced service apron with a gantry hoist, a fuel pump and
// stacked spare parts. Held, it repairs your units parked nearby. 2 x 2 cells.
function repairYard(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => (Math.abs(x - 24) < 12 && Math.abs(z - 26) < 12 ? ((x + z) % 4 === 0 ? 0x5a564e : 0x6e6a62) : pad(x, z, 47, 47)));
  for (let x = 1; x <= 46; x += 3) for (const z of [1, 46]) { b.set(x, 1, z, STEEL); b.set(x, 2, z, STEEL); }
  for (let z = 1; z <= 46; z += 3) for (const x of [1, 46]) { b.set(x, 1, z, STEEL); b.set(x, 2, z, STEEL); }
  for (const x of [12, 36]) for (let y = 1; y < 22; y++) { b.set(x, y, 14, TEAM); b.set(x, y, 38, TEAM); } // gantry legs
  b.box(12, 22, 14, 36, 23, 38, (x, y, z) => (x === 12 || x === 36 || z === 14 || z === 38 ? TEAM_D : 0));
  b.box(23, 22, 14, 25, 23, 38, STEEL); for (let y = 14; y < 22; y++) b.set(24, y, 26, K); b.box(22, 12, 24, 26, 13, 28, HAZ);
  b.box(4, 1, 4, 10, 9, 10, (x, y) => (y === 9 ? RED : y > 6 ? 0xd8d4c8 : 0xa82a1c)); // fuel pump
  for (const [x, z] of [[38, 4], [42, 4], [40, 8]]) b.box(x, 1, z, x + 3, 4, z + 3, (xx, y) => (y === 4 ? 0x8a6a3a : 0x6e5232)); // spare parts crates
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Town Hall (neutral, capturable): a plastered civic hall with a slate roof, a clock tower and
// a flag over the steps. Held, the town trades with you. 2 x 2 cells.
function townHall(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => ((x + z) % 7 === 0 ? 0x8a8478 : 0x9a9488)); // cobbled square
  house(b, 6, 8, 40, 36, 13, (x, y, z) => (y >= 5 && y <= 9 && (x % 5 === 2 || z % 5 === 2) ? (y === 9 ? WIN_L : WIN) : y <= 1 ? STONE[2] : PLASTER), SLATE, SLATE_D);
  b.box(18, 1, 37, 28, 2, 41, STONE[0]); b.box(20, 3, 37, 26, 3, 38, STONE[1]); // steps
  b.box(19, 1, 36, 27, 8, 36, (x, y) => (y === 8 ? FRAME : x === 19 || x === 27 ? FRAME : y < 7 ? WOOD : PLASTER)); // portico
  b.box(19, 13, 18, 27, 30, 26, (x, y, z) => (y === 30 ? SLATE_D : y >= 24 && y <= 27 && (x === 19 || x === 27 || z === 18 || z === 26) ? (y === 25 || y === 26 ? 0xf0ead8 : FRAME) : PLASTER)); // clock tower
  for (let y = 31; y < 37; y++) b.set(23, y, 22, y === 36 ? 0xe8c040 : WOOD);
  for (let y = 9; y < 24; y++) b.set(30, y, 40, STEEL_L); b.box(31, 19, 40, 36, 23, 40, TEAM); // flagpole and flag
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Paved Road: only used for its build-panel picture (roads are painted into the ground).
function road(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 23, 0, 23, (x, y, z) => (x < 2 || x > 21 ? 0x9a968a : (z % 8 < 4 && x >= 11 && x <= 12) ? 0xe8e0c0 : hash3(x, 0, z) < 0.08 ? 0x2a2a2c : 0x4a4a4d));
  return { body: b, bodyPivot: [12, 0, 12] };
}

export const BASE: Record<string, () => ModelDef> = { road, generator, scrapyard, barracks, depot, derrick, guardTower, emplacement, workshop, wall, hospital, reactor, airfield, flakTower, radar, battery, provingGround, interceptor, shield: shieldGen, armoury };
// Dam: a concrete wall right across the outflow with a walkway on top; the spillway pours out on the
// downstream side (+X), the lake sits behind it. Baked turned four ways so the wall always crosses the flow.
function damFacing(turns: number, ruined = false): () => ModelDef {
  return () => {
    const b = new VB(), put = (x: number, y: number, z: number, c: number) => { const [rx, rz] = turns === 0 ? [x, z] : turns === 1 ? [47 - z, x] : turns === 2 ? [47 - x, 47 - z] : [z, 47 - x]; b.set(rx, y, rz, c); };
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, f: (x: number, y: number, z: number) => number) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, f(x, y, z)); };
    box(0, 0, 0, 47, 1, 47, (x, y, z) => ((x + z) % 9 === 0 ? 0x5e5c56 : 0x6a6862)); // footing
    if (ruined) { // breached: the middle of the wall blown out, jagged stumps either side, rubble strewn downstream, no water
      const top = (z: number) => (z < 14 || z > 33 ? 18 - Math.max(0, (z < 14 ? z - 8 : 39 - z)) * 2 : 2 + ((z * 7) % 5)); // the wall falls away into the gap
      for (let z = 0; z <= 47; z++) box(10, 2, z, 21, Math.max(2, top(z)), z, (x, y) => (y >= top(z) - 1 ? 0x5e5c56 : z % 8 === 0 ? 0x4e4c46 : x > 19 ? 0x6a6862 : 0x7a7870));
      for (let k = 0; k < 40; k++) { const x = 22 + ((k * 13) % 22), z = 12 + ((k * 7) % 24), s = 1 + (k % 3); box(x, 2, z, x + s, 2 + (k % 2), z + s, () => (k % 3 ? 0x6a6862 : 0x8c8a82)); } // blocks of the wall, thrown downstream
      box(22, 1, 14, 46, 1, 33, (x, y, z) => ((x * 3 + z) % 7 === 0 ? 0x4a3c2c : 0x5e4a36)); // a scoured, muddy bed where the water went
      return { body: b, bodyPivot: [24, 0, 24] };
    }
    box(10, 2, 0, 21, 18, 47, (x, y, z) => (y === 18 ? 0x9a978e : z % 8 === 0 ? 0x5e5c56 : x > 19 ? 0x7a7870 : y < 5 ? 0x6e6c66 : 0x8c8a82)); // the wall, across the flow
    box(12, 19, 0, 19, 19, 47, (x, y, z) => (z % 6 === 0 ? 0x4a4842 : 0x7a7870)); // walkway
    for (const z of [0, 47]) box(11, 19, z, 20, 22, z, () => 0x5a5850); // railings
    box(22, 2, 18, 30, 15, 29, (x, y, z) => (Math.round(y + x * 0.6 + z) % 3 === 0 ? 0xe8f4fa : 0x9ac4d8)); // water pouring down the face
    box(31, 2, 15, 46, 2, 32, (x, y, z) => ((x + z) % 4 === 0 ? 0xe8f4fa : 0x6a9ab0)); // and the splash pool below
    return { body: b, bodyPivot: [24, 0, 24] };
  };
}
const dam0 = damFacing(0), dam1 = damFacing(1), dam2 = damFacing(2), dam3 = damFacing(3);
const damRuin0 = damFacing(0, true), damRuin1 = damFacing(1, true), damRuin2 = damFacing(2, true), damRuin3 = damFacing(3, true);

// Orbital Uplink (neutral, capturable): a big tilted dish on a concrete plinth, an antenna mast with a
// red light, and a control hut. Held long enough, it calls down a strike from orbit. 2 x 2 cells.
function uplink(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 2, 47, (x, y, z) => ((x + z) % 8 === 0 ? 0x5e5c56 : 0x7a7870)); // plinth
  b.box(4, 3, 30, 17, 11, 43, (x, y, z) => (y === 11 ? 0x4a4842 : y > 5 && y < 9 && x % 4 === 1 ? 0x9ad0f0 : 0x8c8a82)); // control hut
  b.box(26, 3, 18, 31, 14, 23, () => 0x6a6862); // dish pedestal
  for (let a = 0; a < 64; a++) for (let r = 0; r < 13; r++) { // the dish, tilted to the sky
    const t = (a / 64) * Math.PI * 2, x = Math.round(28 + Math.cos(t) * r), z = Math.round(20 + Math.sin(t) * r * 0.9), y = Math.round(16 + r * 0.55 + Math.sin(t) * r * 0.35);
    b.set(x, y, z, r > 11 ? 0x6a6862 : r % 4 === 0 ? 0xb8bab4 : 0xd8dad4);
  }
  for (let y = 16; y < 26; y++) b.set(28, y, 20, 0x4a4842); b.set(28, 26, 20, 0xffd040); // the feed horn
  for (let y = 3; y < 34; y++) b.set(42, y, 6, y % 4 === 0 ? 0x8c8a82 : 0x5a5850); b.set(42, 34, 6, 0xff4030); // mast and beacon
  return { body: b, bodyPivot: [24, 0, 24] };
}

export const CIVIC: Record<string, () => ModelDef> = { uplink, dam0, dam1, dam2, dam3, damRuin0, damRuin1, damRuin2, damRuin3, cottage, cottage2, townhouse, shop, barn, waterTower, motorPool, recruitOffice, bunker, watchtower, fuelDepot, powerPlant, commTower, repairYard, townHall };
export const LIFE: Record<string, () => ModelDef> = { car, pickup, civilian, cow, deer };

export const ART: Record<string, () => ModelDef> = { tank, harvester, builder, rifle: rifleman, rocket: rocketeer, scout, artillery, grenadier, juggernaut, gunship, flak: flakTruck, colossus, engineer, bomber, fieldCommand };
