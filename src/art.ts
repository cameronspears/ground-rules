// The art. Every model is built from blocks (one block ≈ 30 cm, and one pixel on screen),
// facing +X (east). Colours are chosen as they look in full sun; shading is added when baked.
// TEAM / TEAM_D / TEAM_L are swapped for each side's colours.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from './models';
import { hash3 } from './hash';
import { shade } from './voxel';

const K = 0x1f2024, STEEL = 0x5d6168, STEEL_L = 0x8a8e94, GLASS = 0x2a3a58, GLASS_L = 0x6a8ab8, LAMP = 0xffe08a, RED = 0xa03a2a;
const RUST = 0x8a4a26, RUST_L = 0xa85c2c, CREAM = 0xc4bdab, CREAM_D = 0xa69e8a, CONC = 0xa9a294, CONC_D = 0x8c8679, HAZ = 0xc9a23a, SKIN = 0xc8946c;

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
const pad = (x: number, z: number, w: number, d: number) => (x < 2 || x > w - 2 || z < 2 || z > d - 2 ? CONC_D : (x % 12 === 0 || z % 12 === 0 ? CONC_D : hash3(x >> 2, 9, z >> 2) < 0.1 && hash3(x, 9, z) < 0.6 ? 0x8a8478 : hash3(x, 5, z) < 0.05 ? 0x9c968a : CONC)); // (oil stains and worn patches)
// Real kit, not toys: worn paint, canvas, gunmetal, dark running gear
const TRK = 0x2a2a28, WHEEL = 0x45474a, HUB = 0x6a6c6c, GUN = 0x4a4d50, GRILLE = 0x262826, HATCH = 0x3e4042, LENS = 0xcfc49a;
const OLIVE = 0x4e5236, CANVAS = 0x6e6a4e, CANVAS_D = 0x5a5640, GUN_L = 0x7a7e80;
const AMBER = 0xd0892c, BOOM = 0xa88a44, KHAKI = 0x8a8262, STOCK = 0x5a4630, SAND = 0xa8956a, SAND_D = 0x8e7c54, DRAB = 0x45463a, BOOT = 0x2a2622;
// Big tyres (rounded, two deep, a hub on the outer face) at each x, on both sides (z0 and z1)
function wheels(b: VB, xs: number[], z0: number, z1: number) {
  for (const x of xs) for (const z of [z0, z1]) {
    b.box(x, 0, z, x + 3, 3, z + 1, (xx, y) => ((xx === x || xx === x + 3) && (y === 0 || y === 3) ? 0 : TRK));
    b.box(x + 1, 1, z === z0 ? z : z + 1, x + 2, 2, z === z0 ? z : z + 1, WHEEL); b.set(x + 1, 2, z === z0 ? z : z + 1, HUB);
  }
}
// A soldier, 3 blocks square and 8 tall, facing +x: boots, trousers, tunic in the side's colour, webbing, face, helmet
function soldier(b: VB, helmet = TEAM_D, crown = TEAM_L) {
  b.set(1, 0, 0, BOOT); b.set(1, 0, 2, BOOT); b.box(1, 1, 0, 1, 2, 0, DRAB); b.box(1, 1, 2, 1, 2, 2, DRAB);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, TEAM_D);
  b.box(1, 6, 1, 2, 6, 1, SKIN);
  b.box(1, 7, 0, 2, 7, 2, helmet); b.set(2, 7, 1, crown);
}
// A small open staff car, 10 long, facing +x, at (x, y, z)
function jeep(b: VB, x: number, y: number, z: number) {
  for (const dx of [1, 7]) for (const dz of [0, 5]) b.box(x + dx, y, z + dz, x + dx + 1, y + 1, z + dz, TRK);
  b.box(x, y + 1, z + 1, x + 9, y + 2, z + 4, TEAM_D); b.box(x + 6, y + 3, z + 1, x + 9, y + 3, z + 4, TEAM); b.box(x + 5, y + 3, z + 1, x + 5, y + 4, z + 4, GLASS_L);
  b.box(x + 1, y + 3, z + 1, x + 2, y + 3, z + 4, CANVAS);
}
// A gun barrel along x, two blocks square (y, y+1; z, z+1), lit on top
function barrel(b: VB, x0: number, x1: number, y: number, z: number) { b.box(x0, y, z, x1, y, z + 1, GUN); b.box(x0, y + 1, z, x1, y + 1, z + 1, GUN_L); }
// Tracks along x from x0 to x1 at each z0 (3 deep), road wheels showing on the outer faces, every `gap` blocks
function tracks(b: VB, x0: number, x1: number, zs: number[], gap: number, h = 3) {
  const outer = Math.max(...zs) + 2;
  for (const z0 of zs) {
    b.box(x0, 0, z0, x1, h - 1, z0 + 2, TRK);
    b.box(x0 - 1, 1, z0, x0 - 1, h - 2, z0 + 2, TRK); b.box(x1 + 1, 1, z0, x1 + 1, h - 2, z0 + 2, TRK); // the ends roll round
    b.box(x0, h, z0, x1, h, z0 + 2, (x) => (x % 2 ? 0x343432 : TRK)); // links on the top run
    const zf = z0 === Math.min(...zs) ? z0 : outer;
    for (let x = x0 + 1; x + 2 <= x1; x += gap) { b.box(x, 0, zf, x + 2, h - 1, zf, WHEEL); b.set(x + 1, Math.floor((h - 1) / 2), zf, HUB); }
  }
}

// ---------------------------------------------------------------- units
function tank(): ModelDef {
  const b = new VB();
  tracks(b, 1, 22, [0, 11], 5);
  // a low, wide hull: fenders over the tracks, a sloped glacis, the engine deck behind
  b.box(2, 2, 3, 21, 4, 10, TEAM_D);
  b.box(1, 4, 0, 22, 4, 13, (x, y, z) => (z < 2 || z > 11 ? TEAM_D : TEAM)); // fenders
  b.box(2, 5, 1, 18, 5, 12, TEAM);
  b.box(19, 5, 2, 20, 5, 11, TEAM); b.box(23, 2, 3, 23, 3, 10, TEAM_D); // glacis, lower nose plate
  for (let z = 4; z <= 9; z += 2) b.box(3, 5, z, 7, 5, z, GRILLE); // engine grille
  b.box(1, 5, 3, 1, 5, 4, K); b.box(1, 5, 9, 1, 5, 10, K); // exhausts
  b.box(2, 6, 3, 3, 6, 10, (x, y, z) => (z % 3 === 0 ? CANVAS_D : CANVAS)); // tarp rolled on the back
  b.box(2, 5, 0, 5, 6, 1, OLIVE); b.box(2, 5, 12, 4, 6, 13, OLIVE); // jerrycans on the fenders
  b.box(12, 5, 12, 17, 5, 13, STEEL); // tools on the fender
  b.box(17, 6, 3, 18, 6, 4, HATCH); // driver's hatch
  b.set(22, 5, 2, LENS); b.set(22, 5, 11, LENS); // headlights
  const t = new VB();
  t.box(0, 1, 2, 0, 2, 7, OLIVE); // stowage bin on the back
  t.box(1, 0, 1, 11, 0, 8, TEAM_D); t.box(1, 1, 0, 11, 2, 9, TEAM); t.box(2, 3, 1, 10, 3, 8, TEAM); // a wide, flat cast turret
  t.box(12, 1, 3, 12, 2, 6, TEAM_D); // mantlet
  barrel(t, 13, 23, 1, 4); t.box(16, 1, 3, 17, 2, 6, GUN); t.box(24, 1, 3, 24, 2, 6, K); // a long gun: fume extractor, muzzle brake
  t.box(3, 4, 5, 5, 4, 7, TEAM_D); t.set(4, 5, 6, HATCH); // commander's cupola
  t.box(10, 2, 0, 10, 2, 1, K); t.box(10, 2, 8, 10, 2, 9, K); // smoke dischargers
  for (let y = 4; y < 10; y++) t.set(2, y, 2, K); // whip antenna
  return { body: b, bodyPivot: [11.5, 0, 6.5], turret: t, turretPivot: [6, 0, 4.5], turretAt: [11, 6, 6.5] };
}

function harvester(): ModelDef {
  const b = new VB();
  wheels(b, [3, 9, 19], 0, 12);
  b.box(1, 2, 1, 25, 3, 12, STEEL); // chassis
  // a deep hopper, ribbed sides, heaped above its rim with salvaged scrap
  b.box(2, 4, 1, 17, 9, 12, (x, y, z) => (x === 2 || x === 17 || z === 1 || z === 12 ? (y === 9 ? 0x6e7072 : x % 4 === 1 && (z === 1 || z === 12) ? TEAM_D : TEAM) : 0));
  for (let x = 3; x <= 16; x++) for (let z = 2; z <= 11; z++) {
    const top = 9 + Math.round(2.4 - Math.hypot((x - 9.5) / 3.5, (z - 6.5) / 3) + hash3(x, 3, z) * 1.2);
    for (let y = 4; y <= top; y++) b.set(x, y, z, [RUST, RUST_L, STEEL, 0x6e3a20, STEEL_L, 0x4a4438][(hash3(x, z, y) * 6) | 0]);
  }
  for (const [x, y] of [[4, 5], [5, 6], [11, 4], [12, 5], [15, 7]]) { b.set(x, y, 12, RUST); b.set(x, y, 1, RUST); } // rust running down
  // cab at the front
  b.box(19, 4, 2, 25, 10, 11, TEAM); b.box(25, 7, 3, 25, 9, 10, GLASS); b.box(25, 9, 3, 25, 9, 10, GLASS_L);
  b.box(20, 7, 11, 23, 9, 11, GLASS); b.box(20, 7, 2, 23, 9, 2, GLASS);
  b.box(19, 11, 2, 25, 11, 11, TEAM_D); b.set(22, 12, 6, AMBER); // a single amber beacon
  b.box(26, 2, 2, 26, 3, 11, STEEL); b.set(26, 5, 3, LENS); b.set(26, 5, 10, LENS); // bumper, headlights
  // knuckle crane behind the cab, its claw over the heap
  b.box(17, 10, 6, 18, 16, 7, STEEL); b.box(9, 16, 6, 18, 16, 7, (x) => (x % 3 ? STEEL_L : STEEL)); b.box(9, 13, 6, 9, 15, 7, K);
  b.box(8, 11, 5, 10, 12, 8, (x, y) => (y === 12 ? 0x3a3c3e : K)); // the claw
  return { body: b, bodyPivot: [13, 0, 6.5] };
}

// Builder: a six-wheeled construction truck with a dozer blade, a folding crane and a work light.
function builder(): ModelDef {
  const b = new VB();
  wheels(b, [3, 9, 18], 0, 12);
  b.box(1, 2, 1, 23, 3, 12, STEEL);
  b.box(24, 1, 0, 25, 4, 13, (x, y, z) => (y === 4 ? STEEL_L : z % 3 === 0 ? 0x3a3c3e : STEEL)); b.box(22, 2, 2, 23, 2, 3, K); b.box(22, 2, 10, 23, 2, 11, K); // dozer blade on its arms
  b.box(17, 4, 2, 23, 10, 11, TEAM); b.box(23, 7, 3, 23, 9, 10, GLASS); b.box(23, 9, 3, 23, 9, 10, GLASS_L);
  b.box(18, 7, 11, 21, 9, 11, GLASS); b.box(18, 7, 2, 21, 9, 2, GLASS);
  b.box(17, 11, 2, 23, 11, 11, TEAM_D); b.set(20, 12, 6, AMBER); // amber work light
  b.box(2, 4, 1, 16, 5, 12, TEAM_D); // flatbed
  b.box(8, 6, 2, 14, 7, 4, 0x7a5e3a); b.box(9, 6, 9, 14, 7, 11, 0x6e7276); // timber and steel beams on the bed
  // the crane: a cab on a turntable and a lattice boom raised high, its hook hanging
  b.box(3, 6, 4, 7, 9, 9, (x, y, z) => (y === 9 ? TEAM_D : x === 7 && y >= 7 ? GLASS : TEAM));
  for (let i = 0; i < 15; i++) { const x = 6 + Math.round(i * 0.55), y = 9 + i; b.box(x, y, 6, x + 1, y, 7, (xx) => ((i + xx) % 3 ? BOOM : K)); }
  for (let y = 14; y < 23; y++) b.set(14, y, 6, K); b.box(13, 13, 6, 14, 13, 7, 0x3a3c3e); // cable and hook
  return { body: b, bodyPivot: [13, 0, 6.5] };
}

function rifleman(): ModelDef {
  const b = new VB();
  soldier(b);
  b.box(0, 4, 1, 0, 5, 1, KHAKI);                              // bedroll
  b.box(2, 4, 3, 5, 4, 3, GUN); b.set(2, 4, 3, STOCK); b.set(3, 5, 3, SKIN); // rifle and hand
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
    if (y === y1) return hash3(x, y, z) < 0.2 ? 0x84817a : 0x8c8981; // gravel roof
    if (y === y1 - 1) return CONC_D; // parapet coping
    if (y >= y1 - 3) return TEAM; // the side's colours painted round the top
    if (y === y0) return CONC_D;
    const along = z === z0 || z === z1 ? x - x0 : z - z0;
    if (y >= win && y <= win + 1 && along % 4 !== 0) return y === win + 1 ? GLASS_L : GLASS; // a band of window slits
    if (along % 8 === 0 || y === win + 2) return CONC_D; // panel joints, the sill
    return hash3(x, y, z) < 0.06 ? CONC_D : CONC;
  });
  block(4, 1, 18, 48, 12, 60, 6);   // wide lower floor
  block(10, 13, 24, 36, 26, 50, 18); // set-back command floor
  b.box(14, 27, 28, 20, 29, 34, STEEL); b.box(15, 30, 29, 19, 30, 33, K); // roof vent
  // entrance canopy on the south face, on two team-coloured posts, with a red sign
  b.box(18, 1, 61, 19, 9, 61, TEAM_D); b.box(33, 1, 61, 34, 9, 61, TEAM_D);
  b.box(16, 10, 58, 36, 10, 64, (x, y, z) => (z === 64 || x === 16 || x === 36 ? TEAM_D : TEAM));
  b.box(20, 1, 60, 32, 7, 60, (x, y) => (y === 7 ? K : 0x2a3040)); // glass doors
  b.box(22, 13, 61, 30, 17, 61, (x, y) => (y === 13 || y === 17 || x === 22 || x === 30 ? CONC_D : x === 26 || y === 15 ? 0xd0cab8 : TEAM_D)); // the side's crest over the door
  // radar: a round drum with a white dome on top, panel seams picked out
  tower(b, 58, 26, 1, 14, () => 10, (x, y) => (y % 5 === 0 ? CONC_D : y > 11 ? TEAM : CONC));
  dome(b, 58, 15, 26, 10, (x, y, z) => (y % 3 === 0 || (Math.round(Math.atan2(z - 26, x - 58) * 5) % 2 === 0 && y % 3 === 1) ? 0xaeaa9e : hash3(x, y, z) < 0.15 ? 0xbcb8ac : 0xcac6ba)); // a weathered radome, its panels showing
  // lattice mast on the command floor
  for (let y = 27; y < 50; y++) for (const [x, z] of [[30, 28], [33, 28], [30, 31], [33, 31]]) {
    const k = Math.round((y - 27) * 0.06), xx = x < 31 ? x + k : x - k, zz = z < 29 ? z + k : z - k;
    b.set(xx, y, zz, y % 6 < 3 ? STEEL_L : STEEL);
  }
  for (let y = 50; y < 56; y++) b.set(31.5, y, 29.5, y === 55 ? 0xc83a28 : STEEL);
  for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) if (Math.hypot(a, c) < 3.6) b.set(36 + Math.abs(c) * 0.4, 44 + a, 30 + c, 0xa8a69e); // dish
  for (let y = 13; y < 30; y++) b.set(44, y, 56, STEEL_L); b.box(44, 24, 57, 44, 29, 65, (x, y, z) => (y === 24 + Math.round(Math.sin(z * 0.8)) ? TEAM_D : TEAM)); // the side's flag over the hall
  jeep(b, 40, 1, 64); // a staff car parked by the door
  // fuel drums and crates on the pad
  for (const [x, z] of [[54, 46], [57, 46], [54, 49]]) tower(b, x, z, 1, 4, () => 1.4, (xx, y) => (y === 4 || y === 2 ? 0x3a3c30 : OLIVE), 2); // fuel drums
  b.box(6, 1, 63, 13, 6, 69, (x, y, z) => ((x + y + z) % 4 === 0 ? 0x6e5232 : 0x9a7a4a));
  b.box(56, 1, 58, 62, 4, 66, (x, y, z) => (y === 4 ? (z % 3 === 0 ? CANVAS_D : CANVAS) : OLIVE)); // stores under a tarp
  for (let x = 40; x <= 50; x++) { b.set(x, 1, 66, x % 3 ? 0x9a8a62 : 0x86774f); b.set(x, 2, 66, 0xa8986c); } // sandbags by the stores
  for (const [x, z] of [[8, 22], [40, 24], [8, 52]]) acUnit(b, x, 13, z); acUnit(b, 30, 27, 44); // air conditioners on the roofs
  for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) if (Math.hypot(a, c) < 2.6) b.set(43 + Math.abs(c) * 0.4, 16 + a, 52 + c, 0xa8a69e); b.box(42, 13, 52, 42, 14, 52, STEEL); // a small dish
  truck(b, 52, 38); lampPost(b, 2, 40, 12); lampPost(b, 66, 68, 12); lampPost(b, 50, 12, 12);
  fence(b, 0, 0, 71, 71, (x, z) => z === 71 && x >= 14 && x <= 38); // a fence round the compound, the gate at the front
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
function house(b: VB, x0: number, z0: number, x1: number, z1: number, wallH: number, wall: (x: number, y: number, z: number) => number, roof: number, roofD: number, shutter = 0x4e5e4a) {
  const mid = Math.floor((x1 - x0) / 2);
  b.box(x0, 0, z0, x1, wallH, z1, (x, y, z) => {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) return 0;
    const face = z === z0 || z === z1, along = face ? x - x0 : z - z0, m = along % 6, wy = y % 9;
    if (z === z1 && (along === mid || along === mid + 1) && y < 6) return y === 5 ? FRAME : along === mid && y === 3 ? 0xb89a50 : WOOD; // the front door
    if (wy >= 3 && wy <= 5 && (m === 2 || m === 3)) return wy === 5 ? FRAME : wy === 4 ? WIN_L : WIN; // windows
    if (face && wy >= 3 && wy <= 5 && (m === 1 || m === 4)) return shutter; // shutters
    if (wy === 2 && m >= 1 && m <= 4) return 0xcfc8b8; // sills
    if (y === 0) return 0x5a5248;
    return wall(x, y, z);
  });
  b.box(x0 + mid, 0, z1 + 1, x0 + mid + 1, 0, z1 + 1, STONE[1]); b.box(x0 + mid - 1, 6, z1 + 1, x0 + mid + 2, 6, z1 + 1, roofD); // doorstep, a little hood over the door
  const zm = (z0 + z1) / 2, half = (z1 - z0) / 2 + 1;
  for (let z = z0 - 1; z <= z1 + 1; z++) {
    const ry = Math.round((half - Math.abs(z - zm)) * 0.75);
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      b.set(x, wallH + 1 + ry, z, Math.abs(z - zm) < 1 ? shade(roofD, 0.85) : hash3((x + (z % 2)) >> 1, 3, z) < 0.22 ? roofD : roof); // tiles in courses, a darker ridge
      if (x === x0 || x === x1) for (let y = wallH + 1; y < wallH + 1 + ry; y++) b.set(x, y, z, wall(x, y, z));
    }
  }
}

function cottage(): ModelDef {
  const b = new VB();
  house(b, 4, 6, 19, 17, 8, (x, y, z) => (hash3(x, y, z) < 0.06 ? PLASTER_D : PLASTER), TILE, TILE_D);
  b.box(15, 9, 8, 16, 16, 9, (x, y) => (y === 16 ? 0x3a3a3a : y === 15 ? STONE[2] : STONE[(x + y) % 3])); b.set(15, 17, 8, 0x8a5a3a); // chimney and its pot
  // a front garden: picket fence with a gate, a stone path, a vegetable patch and flowers by the door
  for (let x = 2; x <= 21; x++) if (x < 11 || x > 12) { if (x % 2 === 0) b.box(x, 0, 22, x, 2, 22, 0xd8d0c0); b.set(x, 1, 22, 0xc8c0b0); }
  for (let z = 18; z <= 21; z++) b.box(11, 0, z, 12, 0, z, STONE[(z % 2)]);
  for (let x = 14; x <= 19; x++) for (let z = 19; z <= 21; z++) b.set(x, 0, z, z % 2 ? 0x4a3a28 : 0x5a7a34); for (let x = 14; x <= 19; x += 2) b.set(x, 1, 20, 0x6a8a3e);
  for (const [x, c] of [[6, 0xa84a44], [8, 0xc8b048], [16, 0xa84a44]] as [number, number][]) { b.set(x, 0, 18, 0x4e6a30); b.set(x, 1, 18, c); }
  // a shed out the back and washing on the line
  b.box(0, 0, 1, 3, 4, 4, (x, y) => (y === 4 ? 0x4a4e52 : x === 3 && y < 3 ? K : WOOD)); 
  for (const z of [7, 15]) b.box(22, 0, z, 22, 5, z, WOOD); b.box(22, 5, 8, 22, 5, 14, STEEL_L);
  for (const [z, c] of [[9, 0xd8d0c0], [11, 0x7a8aa0], [13, 0xb8a888]] as [number, number][]) b.box(22, 3, z, 22, 4, z, c);
  return { body: b, bodyPivot: [12, 0, 12] };
}

function cottage2(): ModelDef {
  const b = new VB();
  house(b, 5, 5, 18, 17, 8, (x, y, z) => STONE[(hash3(x >> 1, y, z >> 1) * 3) | 0], SLATE, SLATE_D);
  b.box(7, 9, 7, 8, 15, 8, (x, y) => (y === 15 ? 0x2a2a2a : STONE[1]));
  b.box(19, 0, 9, 22, 3, 12, (x, y, z) => (y === 3 ? 0x6a5a3a : (x + z) % 2 ? WOOD : WOOD_L)); // woodpile
  for (let x = 3; x <= 21; x++) if (x < 11 || x > 12) b.box(x, 0, 21, x, 1, 21, STONE[(x + (x >> 1)) % 3]); // a dry-stone wall round the front
  for (let z = 18; z <= 20; z++) b.box(11, 0, z, 12, 0, z, STONE[1]);
  tower(b, 2, 2, 0, 2, () => 1.8, (x, y) => (y === 2 ? STONE[2] : STONE[(x + y) % 3]), 1); for (const z of [1, 3]) b.box(2, 3, z, 2, 5, z, WOOD); b.box(1, 6, 1, 3, 6, 3, SLATE); // a well
  tower(b, 20, 15, 0, 3, () => 1.3, (x, y) => (y === 3 ? 0x2e3a4a : y % 2 ? WOOD : WOOD_L), 1); // rain barrel
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
  for (const x of [7, 17, 27, 37]) b.box(x - 1, 0, 19, x + 1, 0, 20, STONE[1]); // front steps
  for (const [x, z] of [[8, 8], [24, 15], [40, 9]]) { b.box(x, 18, z, x + 1, 21, z + 1, 0x8a4e38); b.set(x, 22, z, 0x8a5a3a); } // chimneys
  acUnit(b, 14, 18, 11); for (let y = 19; y < 25; y++) b.set(34, y, 7, K); b.box(32, 24, 7, 36, 24, 7, K); // a TV aerial
  for (const x of [12, 32]) lampPost(b, x, 22, 10);
  for (let y = 1; y < 17; y++) b.set(22, y, 19, 0x4a4c4e); // drainpipe
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
    return hash3(x, y, z) < 0.06 ? PLASTER_D : PLASTER;
  });
  for (let x = 3; x <= 20; x++) for (let k = 0; k < 3; k++) b.set(x, 8 - k, 18 + k, Math.floor(x / 2) % 2 ? 0x8e4a38 : 0xcfc6ae); // striped canvas awning, faded
  b.box(7, 11, 16, 16, 13, 16, 0x34485a); b.box(9, 12, 16, 14, 12, 16, 0xc8b47a); // sign
  b.box(6, 0, 20, 9, 1, 20, WOOD); b.box(6, 2, 21, 9, 2, 21, WOOD_L); // a bench
  for (const [x, c] of [[14, 0x6a8a3e], [16, 0xa84a3a]] as [number, number][]) { crates(b, x, 19, 2, 2, 1); b.box(x, 2, 19, x + 1, 2, 20, c); } // crates of greens and apples
  b.box(18, 0, 21, 19, 3, 21, (x, y) => (y === 3 ? 0x34485a : 0xd8d0c0)); // a board out front
  acUnit(b, 6, 11, 8);
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
  tower(b, 5, 21, 0, 22, () => 2.6, (x, y) => (y >= 21 ? 0x8a8e92 : y % 3 === 0 ? 0x7a7e84 : 0x9a9ea2), 1.3); // a grain silo
  { const tx = 27, tz = 20; b.box(tx, 0, tz, tx + 2, 3, tz, TRK); b.box(tx, 0, tz + 3, tx + 2, 3, tz + 3, TRK); b.box(tx + 5, 0, tz, tx + 6, 1, tz, TRK); b.box(tx + 5, 0, tz + 3, tx + 6, 1, tz + 3, TRK); // a tractor
    b.box(tx, 2, tz + 1, tx + 7, 3, tz + 2, 0x4e6a34); b.box(tx, 4, tz + 1, tx + 2, 6, tz + 2, (x, y) => (y === 6 ? 0x4e6a34 : GLASS)); b.set(tx + 6, 4, tz + 1, K); }
  for (let x = 34; x <= 39; x++) b.set(x, 0, 21, 0x7a6a40); // spilt straw
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
  b.box(1, 0, 1, 5, 4, 5, (x, y) => (y === 4 ? 0x4a4e52 : x === 5 && y < 3 ? K : 0x9a9282)); // pump house
  for (const [x, z] of [[6, 6], [17, 6], [6, 17], [17, 17]]) b.box(x - 1, 0, z - 1, x + 1, 0, z + 1, CONC_D); // footings
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
  truck(b, 8, 30); truck(b, 26, 30); { const j = new VB(); jeep(j, 0, 0, 0); stamp(b, j, 42, 1, 38); }
  for (const [x, z] of [[48, 26], [52, 27]]) tower(b, x, z, 1, 5, () => 1.6, (xx, y) => (y % 2 ? TRK : 0x343432), 1.2, true); // tyre stacks
  lampPost(b, 2, 44, 12); lampPost(b, 68, 22, 12);
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
  for (const x of [4, 43]) { for (let y = 1; y < 26; y++) b.set(x, y, 44, STEEL_L); b.box(x, 20, 45, x, 25, 45 + 0, TEAM); b.box(x, 20, 45, x, 25, 47, (xx, y, z) => (y === 22 && z === 46 ? TEAM_D : TEAM)); } // flags
  sandbagRow(b, 9, 42, 13, 42); sandbagRow(b, 34, 42, 38, 42);
  { const j = new VB(); jeep(j, 0, 0, 0); stamp(b, j, 3, 1, 2); } lampPost(b, 45, 4, 12);
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
  crates(b, 1, 1, 3, 2, 3); crates(b, 20, 19, 2, 3, 2); for (let y = 8; y < 15; y++) b.set(14, y, 9, K); b.box(9, 8, 13, 10, 9, 13, GUN); // ammunition, an aerial, a periscope
  return { body: b, bodyPivot: [12, 0, 12] };
}

// ---------------------------------------------------------------- traffic, people, animals
function car(): ModelDef {
  const b = new VB();
  for (const x of [2, 10]) for (const z of [0, 6]) { b.box(x, 0, z, x + 2, 1, z, TRK); b.set(x + 1, 1, z, 0x8a8c88); } // tyres, hubcaps
  b.box(0, 1, 1, 14, 2, 5, (x, y) => (y === 2 && (x < 4 || x > 10) ? TEAM : y === 1 && (x === 0 || x === 14) ? 0x9a9a98 : TEAM)); // body, bumpers
  b.box(4, 3, 1, 10, 3, 5, (x, y, z) => (z === 1 || z === 5 ? (x === 7 ? TEAM_D : GLASS) : x === 10 ? GLASS_L : x === 4 ? GLASS : 0)); // windows all round
  b.box(5, 4, 1, 9, 4, 5, TEAM); // roof
  b.box(14, 1, 2, 14, 1, 4, K); // grille
  b.set(14, 2, 1, 0xe8e0b0); b.set(14, 2, 5, 0xe8e0b0); b.set(0, 2, 1, 0xa83a2a); b.set(0, 2, 5, 0xa83a2a); // lights
  return { body: b, bodyPivot: [7, 0, 3] };
}

function pickup(): ModelDef {
  const b = new VB();
  for (const x of [2, 12]) for (const z of [0, 7]) { b.box(x, 0, z, x + 2, 2, z, TRK); b.set(x + 1, 1, z, 0x8a8c88); }
  b.box(0, 2, 1, 17, 3, 6, (x, y) => (y === 2 && (x === 0 || x === 17) ? 0x9a9a98 : TEAM));
  b.box(11, 4, 1, 15, 5, 6, (x, y, z) => (y === 5 ? TEAM : x === 15 ? GLASS_L : z === 1 || z === 6 ? (x === 13 ? TEAM_D : GLASS) : x === 11 ? GLASS : TEAM)); // cab
  b.box(16, 4, 1, 17, 4, 6, TEAM); b.box(17, 2, 2, 17, 2, 5, K); // bonnet, grille
  b.box(0, 4, 1, 10, 4, 6, (x, y, z) => (x === 0 || z === 1 || z === 6 ? TEAM_D : 0)); // open bed
  b.box(2, 4, 2, 5, 5, 4, WOOD_C); b.box(7, 4, 3, 8, 5, 4, 0x6e6a4e); // crates and a sack in the back
  b.set(17, 3, 1, 0xe8e0b0); b.set(17, 3, 6, 0xe8e0b0); b.set(0, 3, 1, 0xa83a2a); b.set(0, 3, 6, 0xa83a2a);
  return { body: b, bodyPivot: [8.5, 0, 3.5] };
}

function civilian(): ModelDef {
  const b = new VB();
  b.set(1, 0, 0, 0x2a2622); b.set(1, 0, 2, 0x2a2622); b.box(1, 1, 0, 1, 2, 0, 0x3a3e4e); b.box(1, 1, 2, 1, 2, 2, 0x3a3e4e); // shoes, trousers
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 1, 4, 0, TEAM_D); b.box(1, 3, 2, 1, 4, 2, TEAM_D); // shirt, arms at the sides
  b.box(1, 6, 1, 2, 6, 1, SKIN); b.set(1, 6, 0, 0x4a3426); b.set(1, 6, 2, 0x4a3426); b.box(1, 7, 0, 2, 7, 2, 0x4a3426); // face, hair
  return { body: b, bodyPivot: [1.5, 0, 1.5] };
}

function cow(): ModelDef {
  const b = new VB();
  for (const [x, z] of [[1, 0], [1, 3], [6, 0], [6, 3]]) { b.box(x, 1, z, x, 2, z, 0xe8e2d4); b.set(x, 0, z, 0x2a2420); } // legs and hooves
  b.box(0, 3, 0, 7, 5, 3, (x, y, z) => (hash3(x >> 1, y, z) < 0.35 ? 0x2a2622 : 0xe8e2d4));
  b.box(3, 2, 1, 4, 2, 2, 0xd8a8a0); // udder
  b.box(8, 4, 1, 9, 6, 2, 0xe8e2d4); b.set(10, 4, 1, 0xc89080); b.set(10, 4, 2, 0xc89080); b.set(8, 7, 0, 0xd8d0c0); b.set(8, 7, 3, 0xd8d0c0); b.set(8, 6, 0, 0x2a2622); b.set(8, 6, 3, 0x2a2622); // head, muzzle, horns, ears
  b.set(0, 4, 2, 0x2a2622); b.set(0, 3, 2, 0x2a2622); // tail
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
  soldier(b);
  b.box(0, 3, 0, 0, 5, 2, OLIVE);                              // pack of spare rockets
  b.box(-3, 6, 2, 5, 7, 3, (x, y) => (x === -3 ? K : y === 7 ? 0x6e7650 : 0x535a3c)); // launcher tube on the shoulder
  b.box(6, 6, 2, 7, 7, 3, 0x3c4230);                         // warhead
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// Scout Buggy: an open roll cage on four fat wheels with a pintle machine gun. Small and quick.
function scout(): ModelDef {
  const b = new VB();
  wheels(b, [2, 13], 0, 9);
  b.box(1, 2, 2, 17, 3, 8, TEAM_D); b.box(14, 4, 2, 18, 4, 8, TEAM); // chassis, bonnet
  b.box(2, 4, 2, 6, 5, 8, 0x3e4036);                         // engine at the back
  tower(b, 1, 5, 3, 6, () => 1.6, (x, y) => (y === 6 ? 0x3a3a38 : TRK), 1.2); // spare wheel
  b.box(8, 4, 3, 9, 5, 4, 0x2e2c28); b.box(8, 4, 6, 9, 5, 7, 0x2e2c28); // seats
  for (const [x, z] of [[7, 2], [7, 8], [12, 2], [12, 8]]) b.box(x, 4, z, x, 9, z, STEEL); // roll cage
  b.box(7, 9, 2, 12, 9, 8, (x, y, z) => (x === 7 || x === 12 || z === 2 || z === 8 ? STEEL_L : 0));
  b.box(10, 10, 5, 10, 10, 5, K); b.box(10, 10, 5, 15, 10, 5, GUN); b.box(9, 10, 4, 9, 11, 6, K); // machine gun and its shield on the cage
  b.set(19, 3, 3, LENS); b.set(19, 3, 7, LENS);
  for (let y = 5; y < 10; y++) b.set(1, y, 7, K);              // whip aerial
  return { body: b, bodyPivot: [9.5, 0, 5] };
}

// Field Gun: a tracked self-propelled howitzer, its long barrel raised for indirect fire.
function artillery(): ModelDef {
  const b = new VB();
  tracks(b, 1, 24, [0, 11], 5);
  b.box(1, 3, 2, 24, 5, 11, TEAM_D); b.box(2, 5, 3, 23, 5, 10, TEAM);
  b.box(20, 3, 2, 25, 4, 11, TEAM);                          // sloped nose
  b.box(0, 1, 3, 0, 4, 10, (x, y, z) => (z % 3 === 0 ? K : STEEL)); // recoil spade folded up at the back
  b.set(25, 4, 3, LENS); b.set(25, 4, 10, LENS);
  b.box(3, 6, 2, 6, 7, 3, OLIVE); b.box(3, 6, 10, 6, 7, 11, OLIVE); // ammunition lockers
  const t = new VB();
  t.box(0, 0, 0, 11, 5, 8, (x, y, z) => (y === 5 ? TEAM_D : x === 0 ? TEAM_D : TEAM)); // boxy gun house
  t.box(2, 6, 2, 4, 6, 4, HATCH); t.box(7, 6, 6, 8, 6, 7, TEAM_D);
  for (let i = 0; i < 28; i++) { const y = 3 + Math.floor(i / 2.5); t.box(11 + i, y, 3, 11 + i, y, 5, i > 25 ? K : GUN); t.box(11 + i, y + 1, 3, 11 + i, y + 1, 5, i > 25 ? K : GUN_L); } // a long barrel, raised to lob shells
  t.box(13, 3, 2, 14, 5, 6, GUN); // recoil cylinders
  t.box(10, 1, 2, 12, 5, 6, TEAM_D);                         // mantlet
  return { body: b, bodyPivot: [12.5, 0, 6.5], turret: t, turretPivot: [5, 0, 4], turretAt: [11, 6, 6.5] };
}

// Arsenal (key 'workshop'): the doorway to the war's biggest weapons. A lopsided concrete fortress, its walls sloped like
// a bunker's: a long low block with a taller block hard against one end, roofs edged in the side's colour, pipes and
// vents across them, a striped blast door, and a lattice floodlight tower at one corner. In the walled yard a gantry
// crane over a warhead on its rail carriage, a missile raised on its launcher, and rows of tall shells. Practical and
// off-centre on purpose (a centred stepped block with a spire and corner masts looked like a place of worship). 3 x 3 cells.
function workshop(): ModelDef {
  const b = new VB(), BRASS = 0xb8964a, BRASS_D = 0x8a6e36, SLAB = 0xb2ab9c, SLAB_D = 0x8e887b, WHITE = 0xd8d4c8, WHITE_D = 0xb4b0a6;
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => pad(x, z, 71, 71));
  // a block: each course set in from the one below on its outer faces, so its walls slope; its flat roof edged in the side's colour
  const block = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      const i = Math.floor((y - y0) / 3);
      b.box(x0 + i, y, z0 + i, x1 - i, y, z1 - i, (x, yy, z) => {
        const edge = x === x0 + i || x === x1 - i || z === z0 + i || z === z1 - i;
        if (!edge && yy < y1) return 0;
        if (yy === y1) return edge ? TEAM : (x + z) % 6 === 0 ? CONC_D : SLAB;
        if (yy >= y1 - 1) return TEAM_D;
        return yy === y0 ? CONC_D : (z % 6 === 0 || x % 6 === 0) ? SLAB_D : SLAB;
      });
    }
  };
  block(4, 4, 44, 30, 1, 11); // the long low magazine
  block(4, 4, 22, 30, 12, 22); // the taller block hard against its back end, where the big weapons are put together
  b.box(44, 1, 10, 45, 9, 24, (x, y, z) => (x === 44 ? 0 : y === 9 || z === 10 || z === 24 ? ((y + z) % 2 ? HAZ : K) : z === 17 ? K : y % 3 === 0 ? 0x4a4e54 : 0x5e6268)); // the blast door
  b.box(44, 10, 8, 48, 10, 26, (x, y, z) => (z === 8 || z === 26 ? TEAM_D : SLAB_D)); // its concrete canopy
  // pipes and vents along the roofs, a stair up the tall block's side
  b.box(26, 12, 8, 40, 13, 9, STEEL); b.box(26, 12, 24, 40, 13, 25, STEEL); for (const x of [30, 37]) { b.box(x, 12, 14, x + 3, 15, 18, (xx, y) => (y === 15 ? K : STEEL)); }
  for (const [x, z] of [[8, 9], [14, 22]]) b.box(x, 23, z, x + 2, 26, z + 2, (xx, y) => (y === 26 ? K : STEEL_L)); // exhaust stacks
  for (let k = 0; k < 10; k++) b.box(23 + Math.floor(k / 2), 12 + k, 31, 23 + Math.floor(k / 2), 12 + k, 33, GUN); // an outside stair
  // a lattice floodlight tower at one corner only
  for (let y = 1; y < 30; y++) for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) b.set(64 + dx, y, 3 + dz, y % 5 === 0 ? STEEL_L : GUN);
  for (let y = 5; y < 30; y += 5) b.box(64, y, 3, 67, y, 6, (x, yy, z) => (x === 64 || x === 67 || z === 3 || z === 6 ? STEEL : 0));
  b.box(62, 30, 2, 69, 31, 7, (x, y) => (y === 31 ? LAMP : STEEL_L));
  // the yard: a gantry crane over a warhead on its rail carriage
  for (const z of [36, 50]) b.box(6, 0, z, 44, 0, z, STEEL_L); // the rails
  for (const x of [10, 40]) for (const z of [35, 51]) b.box(x, 1, z, x + 1, 18, z + 1, (xx, y) => (y % 4 === 0 ? K : HAZ)); // the crane's legs
  b.box(10, 19, 35, 41, 20, 52, (x, y, z) => (z === 35 || z === 52 || z === 36 || z === 51 ? (x % 3 ? TEAM_D : K) : 0)); // its beams
  b.box(24, 19, 37, 28, 21, 50, STEEL); for (let y = 10; y < 19; y++) b.set(26, y, 43, K); // the trolley and its cable
  b.box(16, 1, 39, 34, 2, 47, (x, y) => (y === 2 ? GUN : K)); // the carriage
  for (let x = 17; x <= 33; x++) { const r = x > 29 ? 3.2 * (33 - x) / 4 + 0.4 : 3.2; for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 7; dy++) { if (Math.hypot(dz, dy - 3.5) > r) continue; b.set(x, 3 + dy, 43 + dz, x > 31 ? K : x === 23 || x === 24 ? RED : x % 4 === 0 ? WHITE_D : WHITE); } } // the warhead, lying on it
  // a missile raised on its launcher, and rows of tall shells
  b.box(50, 1, 34, 68, 2, 44, (x, y, z) => (y === 2 ? GUN : K)); // the launcher's bed
  for (let k = 0; k <= 22; k++) { const x = 51 + Math.round(k * 0.7), y = 4 + k; for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) if (Math.hypot(dz, dy) <= 2.2 - (k > 19 ? (k - 19) * 0.6 : 0)) b.set(x, y + dy, 39 + dz, k >= 21 ? K : k === 5 || k === 15 ? RED : WHITE); } // the missile
  for (let k = 0; k <= 14; k++) b.box(54 + Math.round(k * 0.5), 3 + Math.round(k * 0.8), 36, 54 + Math.round(k * 0.5), 3 + Math.round(k * 0.8), 42, k % 3 ? GUN : STEEL_L); // the arm raising it
  for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) { const cx = Math.round(50 + c * 3.8), cz = Math.round(52 + r * 4.2), h = 12 - (r + c) % 2; tower(b, cx, cz, 1, h, (y) => (y >= h - 1 ? 0.5 : 1.1), (x, y) => (y >= h - 1 ? BRASS_D : y === 1 || y === 6 ? 0x5a4a2a : BRASS), 2); b.set(cx, h + 1, cz, K); }
  for (const [x, z] of [[50, 10], [55, 10], [50, 15], [55, 15]]) b.box(x, 1, z, x + 3, 3, z + 2, (xx, y, zz) => (y === 3 ? 0x4a4e34 : (xx + zz) % 3 ? OLIVE : 0x3e4228)); // ammunition crates
  // the perimeter blast wall, with a gate in front of the door
  for (let k = 0; k < 72; k++) for (const [x, z] of [[k, 0], [k, 71], [0, k], [71, k]]) { if (x === 71 && z > 9 && z < 26) continue; b.box(x, 1, z, x, 5, z, (xx, y) => (y === 5 ? ((xx + z) % 8 < 4 ? TEAM_D : SLAB_D) : SLAB)); }
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Grenadier: a heavier-set soldier with a satchel of grenades and one wound back to throw.
function grenadier(): ModelDef {
  const b = new VB();
  soldier(b, 0x4e5a3a, 0x626e4c);                                        // olive helmet sets them apart
  b.box(0, 3, 2, 1, 4, 3, 0x5e5034); b.set(0, 4, 3, OLIVE);    // satchel of grenades on the hip
  b.box(0, 5, -1, 0, 7, -1, SKIN); b.box(0, 8, -1, 1, 8, 0, 0x343a28); // arm raised with a grenade
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// Sandbag Wall: one block of stacked sandbags on a timber frame. 1 x 1 cell; lines of them make walls.
function wall(): ModelDef {
  const b = new VB();
  // sandbags stacked in staggered courses, each course a little in from the one below, timber posts at the corners
  for (let y = 0; y < 9; y++) for (let x = 1; x <= 22; x++) for (let z = 1; z <= 22; z++) {
    const inset = Math.floor(y / 3);
    if (x < 1 + inset || x > 22 - inset || z < 1 + inset || z > 22 - inset) continue;
    const course = Math.floor(y / 2), bx = Math.floor((x + course * 3) / 6), bz = Math.floor((z + course * 3) / 6);
    const seam = (x + course * 3) % 6 === 0 || (z + course * 3) % 6 === 0 || y % 2 === 1 && hash3(x, y, z) < 0.25;
    const tone = hash3(bx, course, bz);
    b.set(x, y, z, seam ? SAND_D : y === 8 ? (tone < 0.5 ? 0xb4a274 : 0xaa9868) : tone < 0.3 ? 0x9c8a5e : tone < 0.7 ? SAND : 0xb09c6e);
  }
  for (const [x, z] of [[1, 1], [22, 1], [1, 22], [22, 22]]) b.box(x, 0, z, x, 9, z, WOOD);
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Fusion Reactor: a squat ribbed containment drum under a glass dome with a glowing core ring,
// cooling fins all round and conduits out to the pad. Huge power; a huge bang when destroyed. 3 x 3.
function reactor(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => { const d = Math.hypot(x - 36, z - 36); return d < 30 && d > 28 ? 0xd8d4c8 : pad(x, z, 71, 71); });
  tower(b, 36, 36, 1, 14, () => 22, (x, y, z, a) => (y === 14 ? TEAM_D : y >= 11 ? TEAM : (Math.round(a * 16) & 1) ? 0xa8a49a : 0xc2beb2), 2);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; for (let r = 22; r < 28; r++) b.box(36 + Math.cos(a) * r, 1, 36 + Math.sin(a) * r, 36 + Math.cos(a) * r, 10 - (r - 22), 36 + Math.sin(a) * r, STEEL); } // cooling fins
  tower(b, 36, 36, 15, 17, () => 18, (x, y) => (y === 17 ? 0x8ad0e0 : 0x4a8aa8), 3, true); // glowing core ring
  dome(b, 36, 17, 36, 15, (x, y, z) => ((x + z) % 7 === 0 || y % 5 === 0 ? 0x5a6670 : y > 28 ? 0x8aa4b4 : 0x6e8a9c)); // a dome of steel ribs and dark glass
  tower(b, 36, 36, 32, 36, () => 2.5, (x, y) => (y === 36 ? RED : STEEL_L));
  for (const [x0, z0, x1, z1] of [[4, 34, 14, 38], [58, 34, 68, 38], [34, 4, 38, 14], [34, 58, 38, 68]]) b.box(x0, 1, z0, x1, 3, z1, (x, y) => (y === 3 ? TEAM_D : STEEL)); // conduits
  truck(b, 2, 2); drums(b, 3, 60, 6); crates(b, 9, 61, 4, 4, 4);
  b.box(58, 1, 58, 68, 8, 68, (x, y, z) => (y === 8 ? TEAM_D : z === 68 && x >= 62 && x <= 64 && y < 6 ? K : CONC)); acUnit(b, 60, 9, 60); acUnit(b, 64, 9, 64); // pump house
  for (const [x, z] of [[2, 30], [68, 30], [30, 68], [44, 2]]) lampPost(b, x, z, 14);
  fence(b, 0, 0, 71, 71, (x, z) => z === 71 && x >= 30 && x <= 42);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Gunship: a stubby armoured helicopter with rocket pods on short wings and a tail boom. The rotor
// is drawn live as a blur.
function gunship(): ModelDef {
  const b = new VB();
  // a slim attack helicopter: a narrow armoured body with two stepped cockpits, gunner in front and pilot above and behind
  b.box(10, 2, 5, 24, 5, 7, (x, y) => (y === 2 ? TEAM_D : TEAM));
  b.box(25, 2, 5, 26, 4, 7, TEAM); b.box(27, 2, 6, 28, 3, 6, TEAM_D); // the nose tapering to a point
  b.box(22, 5, 5, 25, 5, 7, GLASS); b.set(26, 4, 6, GLASS); b.box(22, 6, 6, 24, 6, 6, GLASS_L); // gunner's canopy
  b.box(17, 6, 5, 21, 6, 7, GLASS); b.box(18, 7, 5, 20, 7, 7, GLASS_L); b.box(21, 6, 5, 21, 7, 7, K); // pilot's canopy, raised
  for (const z of [3, 9]) { b.box(11, 5, z, 17, 6, z, TEAM_D); b.set(11, 5, z, K); b.set(17, 6, z, GRILLE); } // engines either side of the mast
  b.box(12, 6, 4, 16, 6, 8, TEAM_D); b.box(14, 7, 5, 15, 8, 7, GUN); b.box(14, 9, 6, 15, 9, 6, K); // engine deck, mast and hub
  // stub wings, a rocket pod and a pair of missiles under each tip
  b.box(14, 4, 1, 17, 4, 11, (x, y, z) => (z === 1 || z === 11 ? GUN : TEAM_D));
  for (const z of [2, 10]) { b.box(13, 2, z, 18, 3, z, OLIVE); b.set(18, 2, z, K); b.set(18, 3, z, K); }
  for (const z of [1, 11]) b.box(13, 3, z, 19, 3, z, (x) => (x === 19 ? 0x8a8a80 : GUN));
  b.box(24, 1, 6, 25, 1, 6, GUN); b.box(26, 1, 6, 29, 1, 6, K); // chin gun
  // a long slim tail boom with a swept fin, tailplane and tail rotor
  b.box(4, 4, 6, 9, 5, 6, TEAM); b.box(8, 4, 5, 10, 5, 7, TEAM);
  for (let y = 5; y <= 11; y++) b.box(Math.round((y - 5) * -0.4) + 3, y, 6, Math.round((y - 5) * -0.4) + 5, y, 6, y === 11 ? TEAM_D : TEAM);
  b.box(2, 5, 3, 4, 5, 9, TEAM_D);
  for (let a = 0; a < 12; a++) b.set(1 + Math.cos(a / 2) * 2.4, 9 + Math.sin(a / 2) * 2.4, 7, 0x2e3032); // the tail rotor's blur
  b.box(22, 0, 4, 22, 1, 4, K); b.box(22, 0, 8, 22, 1, 8, K); b.box(4, 2, 6, 4, 3, 6, K); // wheels
  return { body: b, bodyPivot: [16, 0, 6], clean: true };
}

// Quad Gun: an armoured half-track, wheels in front and tracks behind, with four heavy machine guns on a
// turning mount in its open bed: two stacked each side of the gunner behind his shield, ammunition boxes
// on the outside. It hoses tracers at aircraft and infantry alike.
function quadGun(): ModelDef {
  const b = new VB();
  tracks(b, 1, 16, [0, 10], 4);
  wheels(b, [23], 0, 12);
  b.box(1, 3, 1, 28, 4, 11, K); // the chassis
  b.box(20, 5, 1, 26, 9, 11, (x, y, z) => (y === 9 ? TEAM_D : TEAM)); // the armoured cab
  b.box(21, 8, 1, 26, 8, 1, K); b.box(21, 8, 11, 26, 8, 11, K); b.box(26, 7, 3, 26, 8, 9, (x, y) => (y === 8 ? GLASS_L : GLASS)); // vision slits, windscreen
  for (let i = 0; i < 4; i++) b.box(27 + i, 5, 2 + i, 27 + i, 7 - Math.floor(i / 2), 10 - i, (x, y, z) => (i === 1 && y === 6 && z % 2 ? GRILLE : TEAM_D)); // the long sloped bonnet, a grille in it
  b.box(31, 4, 3, 31, 5, 9, K); b.set(30, 6, 4, LENS); b.set(30, 6, 8, LENS); // the bumper, headlights
  b.box(1, 5, 1, 19, 5, 11, TEAM_D); // the bed's floor
  b.box(1, 6, 1, 19, 7, 11, (x, y, z) => (x === 1 || z === 1 || z === 11 ? (y === 7 ? TEAM_D : (x + y) % 4 === 0 ? TEAM_D : TEAM) : 0)); // armoured sides round the bed
  for (const z of [2, 9]) b.box(2, 6, z, 4, 7, z + 1, OLIVE); // spare ammunition in the bed
  for (const z of [2, 9]) b.box(15, 6, z, 18, 6, z + 1, (x) => (x % 2 ? CANVAS : CANVAS_D)); // kit bags at the front of the bed
  b.box(20, 10, 3, 23, 10, 6, (x, z) => ((x + z) % 2 ? CANVAS : CANVAS_D)); // a tarp on the cab roof
  for (let y = 10; y < 17; y++) b.set(20, y, 10, K); // whip antenna
  const t = new VB();
  t.box(0, 0, 1, 8, 1, 12, GUN); t.box(1, 2, 3, 6, 2, 10, K); // the mount's ring and cradle, raised clear of the bed
  t.box(2, 3, 5, 3, 5, 8, TEAM); t.box(2, 6, 5, 3, 6, 8, SKIN); t.box(2, 7, 5, 3, 7, 8, TEAM_D); // the gunner
  t.box(6, 2, 4, 7, 8, 9, (x, y, z) => (y === 6 && z >= 6 && z <= 7 ? K : y === 8 ? TEAM_D : TEAM)); // his shield, a sight slit in it
  for (const z of [1, 11]) {
    t.box(3, 2, z, 8, 8, z + 1, (x, y) => (y === 8 ? TEAM_D : TEAM)); // the guns' armoured cradle, in the side's colour
    for (const y of [3, 6]) for (let k = 0; k <= 13; k++) { const x = 9 + k, yy = y + Math.floor(k / 6); t.box(x, yy, z, x, yy, z + 1, k >= 12 ? K : k % 3 === 0 ? GUN : STEEL_L); } // two long barrels, perforated jackets, raised a little
    const oz = z === 1 ? 0 : 13; t.box(2, 3, oz, 6, 6, oz, (x, y) => (y === 6 ? CANVAS_D : (x + y) % 3 ? OLIVE : CANVAS_D)); // an ammunition box outside
  }
  return { body: b, bodyPivot: [16, 0, 6], turret: t, turretPivot: [4, 0, 6.5], turretAt: [10, 8, 6] };
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
  { const g = gunship(); stamp(b, g.body, 32, 1, 16); for (let r = -11; r <= 11; r++) { b.set(48 + r, 11, 22, K); b.set(48, 11, 22 + r, K); } } // a helicopter on the pad
  truck(b, 32, 64); drums(b, 52, 64, 4); for (let z = 3; z <= 68; z += 6) b.set(34, 1, z, LAMP); // fuel truck, drums, edge lights
  lampPost(b, 69, 40, 14);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Flak Tower: a concrete pillar topped with a turning quad-barrelled anti-aircraft mount. 1 x 1.
function flakTower(): ModelDef {
  const b = new VB();
  // a squat concrete blockhouse, a gun platform on top behind sandbags
  b.box(5, 0, 5, 18, 9, 18, (x, y, z) => (x === 5 || x === 18 || z === 5 || z === 18 ? (y >= 5 && y <= 6 && (x + z) % 5 === 0 ? K : z === 18 && x >= 10 && x <= 12 && y < 5 ? K : y % 4 === 0 ? CONC_D : CONC) : y === 9 ? CONC : 0));
  b.box(3, 10, 3, 20, 10, 20, (x, y, z) => (x === 3 || x === 20 || z === 3 || z === 20 ? TEAM_D : CONC_D)); // platform
  for (let x = 3; x <= 20; x++) for (let z = 3; z <= 20; z++) if ((x === 3 || x === 20 || z === 3 || z === 20) && (x + z) % 7 > 1) { b.set(x, 11, z, (x + z) % 2 ? SAND : SAND_D); b.set(x, 12, z, (x + z) % 3 ? TEAM : SAND); } // sandbag parapet, the side's colour on the top bags
  crates(b, 4, 4, 3, 2, 12); crates(b, 17, 17, 3, 2, 12);
  for (let y = 1; y < 10; y++) b.set(19, y, 12, y % 2 ? STEEL_L : 0); // ladder
  const t = new VB();
  t.box(0, 0, 0, 7, 2, 7, (x, y) => (y === 2 ? TEAM_D : TEAM)); t.box(1, 3, 3, 2, 4, 4, 0x2e2c28); // mount, the gunner's seat
  for (const z of [0, 7]) t.box(2, 3, z, 5, 5, z, TEAM_D); // ammunition drums on each side
  for (const z of [1, 2, 5, 6]) for (let i = 0; i < 15; i++) { const x = 4 + Math.round(i * 0.6), y = 3 + i; t.box(x, y, z, x + 1, y, z, i > 12 ? K : i % 2 ? GUN : GUN_L); } // four long barrels raised at the sky
  return { body: b, bodyPivot: [12, 0, 12], turret: t, turretPivot: [3.5, 0, 3.5], turretAt: [12, 11, 12] };
}

// Radar Tower: a lattice mast on a bunker with a big curved dish and a blinking light. 2 x 2.
function radar(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  b.box(10, 1, 26, 30, 8, 42, (x, y, z) => (y === 8 ? TEAM_D : (x === 10 || x === 30 || z === 26 || z === 42) ? (z === 42 && x > 17 && x < 23 && y < 6 ? K : CREAM) : 0)); // equipment bunker
  for (let y = 1; y < 34; y++) { const k = Math.round((33 - y) * 0.18); for (const [x, z] of [[28 - k, 10 - k], [36 + k, 10 - k], [28 - k, 18 + k], [36 + k, 18 + k]]) b.set(x, y, z, y % 5 < 2 ? TEAM : STEEL); if (y % 6 === 0) b.box(28 - k, y, 10 - k, 36 + k, y, 18 + k, (x, yy, z) => (x === 28 - k || x === 36 + k || z === 10 - k || z === 18 + k ? STEEL_L : 0)); }
  for (let a = -9; a <= 9; a++) for (let c = -7; c <= 7; c++) if (Math.hypot(a, c * 1.2) < 9.5) b.set(32 + Math.abs(a) * 0.35 + Math.abs(c) * 0.25 - 3, 40 + c, 14 + a, Math.hypot(a, c) > 8 ? STEEL_L : 0xe8e4d8); // dish
  b.box(34, 34, 13, 35, 41, 15, STEEL); b.set(36, 44, 14, 0xff4030);
  for (const [x, z] of [[13, 29], [22, 36]]) acUnit(b, x, 9, z); // cooling for the radar's sets
  b.box(2, 1, 2, 7, 5, 6, (x, y) => (y === 5 ? TEAM_D : x === 7 && y === 3 ? K : 0x7a7e76)); // a generator box
  { const j = new VB(); jeep(j, 0, 0, 0); stamp(b, j, 34, 1, 30); } lampPost(b, 44, 44, 12);
  fence(b, 0, 0, 47, 47, (x, z) => z === 47 && x >= 16 && x <= 24);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Colossus: a mobile fortress on four huge track units, a stepped armoured hull with flak mounts
// at the corners and a great twin-cradle cannon turret. The biggest thing on the battlefield.
function colossus(): ModelDef {
  const b = new VB();
  // four armoured track pods at the corners, big road wheels showing on their outer faces
  for (const [x0, z0] of [[1, 0], [31, 0], [1, 30], [31, 30]]) {
    const x1 = x0 + 23, z1 = z0 + 9, outer = z0 === 0 ? z0 : z1;
    b.box(x0, 0, z0, x1, 6, z1, TRK); b.box(x0 - 1, 1, z0, x0 - 1, 5, z1, TRK); b.box(x1 + 1, 1, z0, x1 + 1, 5, z1, TRK);
    for (let x = x0 + 1; x + 4 <= x1; x += 6) { b.box(x, 0, outer, x + 4, 4, outer, (xx, y) => ((xx === x || xx === x + 4) && (y === 0 || y === 4) ? TRK : WHEEL)); b.set(x + 2, 2, outer, HUB); }
    b.box(x0, 7, z0, x1, 7, z1, (x) => (x % 2 ? 0x343432 : TRK)); // links on the top run
    b.box(x0 + 1, 8, z0, x1 - 1, 9, z1, (x, y, z) => (y === 9 ? TEAM_D : x % 6 === 0 ? TEAM_D : TEAM)); // the pod's armoured fairing
  }
  // a stepped hull: a broad lower hull, an upper deck with armour seams, a sloped bow
  b.box(2, 6, 9, 54, 13, 30, TEAM_D);
  b.box(3, 10, 6, 53, 13, 33, (x, y, z) => (y === 13 ? (x % 4 === 0 ? 0x4a4c4c : 0x5a5c5a) : x % 8 === 0 ? TEAM_D : TEAM)); // (a steel walkway along the ledge)
  b.box(5, 14, 8, 50, 16, 31, (x, y, z) => (y === 16 ? (x === 5 || x === 50 || z === 8 || z === 31 ? TEAM : (x % 6 === 0 || z % 6 === 0) ? 0x4a4c4c : 0x5a5c5a) : TEAM_D)); // a steel deck, the side's colour round its edge
  for (let x = 6; x <= 49; x++) for (const z of [8, 31]) if (x % 3 === 0) b.set(x, 17, z, STEEL_L); // deck rails
  for (let i = 0; i < 5; i++) b.box(51 + i, 14 - i, 8, 51 + i, 16 - i, 31, TEAM); // the bow
  b.box(54, 9, 10, 56, 10, 29, TEAM_D); b.set(56, 11, 11, LENS); b.set(56, 11, 28, LENS);
  // the command bridge at the stern: stepped decks, a band of windows, two funnels and a mast
  b.box(6, 17, 12, 20, 24, 27, (x, y, z) => (y === 24 ? TEAM_D : y >= 21 && y <= 22 && (x === 20 || z === 12 || z === 27) && (x + z) % 3 ? GLASS : TEAM));
  b.box(9, 25, 14, 18, 30, 25, (x, y, z) => (y === 30 ? TEAM_D : y >= 27 && y <= 28 && (x === 18 || z === 14 || z === 25) ? (y === 28 ? GLASS_L : GLASS) : TEAM)); // the bridge
  for (const z of [10, 29]) b.box(7, 17, z - 1, 9, 29, z + 1, (x, y) => (y >= 28 ? K : y % 5 === 0 ? TEAM_D : GUN)); // funnels
  for (let y = 31; y < 46; y++) b.set(13, y, 19, y % 4 === 0 ? STEEL_L : STEEL); b.box(11, 40, 19, 15, 40, 19, STEEL_L); b.box(12, 34, 16, 14, 35, 22, 0xa8a69e); // mast, yard, radar
  for (let y = 31; y < 41; y++) b.set(16, y, 23, K); // whip aerial
  // secondary turrets on the bow and flak mounts on the stern corners
  for (const z of [10, 29]) { b.box(42, 17, z - 2, 46, 18, z + 2, (x, y) => (y === 18 ? TEAM_D : TEAM)); b.box(47, 17, z - 1, 51, 17, z - 1, GUN); b.box(47, 17, z + 1, 51, 17, z + 1, GUN); }
  for (const z of [7, 32]) { b.box(22, 14, z - 1, 25, 15, z + 1, TEAM_D); b.box(24, 16, z, 27, 16, z, GUN); b.set(23, 16, z, K); }
  b.box(26, 17, 15, 30, 17, 24, (x, z) => ((x + z) % 2 ? CANVAS : CANVAS_D)); // tarps on the deck
  const t = new VB();
  // the main turret: wide, low and sloped, twin long guns, rangefinder arms out to the sides
  t.box(0, 0, 2, 22, 4, 20, (x, y, z) => (y === 0 ? TEAM_D : (x + z) % 9 === 0 ? TEAM_D : TEAM));
  t.box(1, 5, 3, 20, 6, 19, TEAM); t.box(3, 7, 5, 17, 7, 17, TEAM_D);
  t.box(4, 4, 0, 6, 5, 22, (x, y, z) => (z < 2 || z > 20 ? K : GUN)); // rangefinder
  t.box(6, 8, 9, 9, 9, 13, TEAM_D); t.box(10, 8, 11, 13, 8, 11, GUN); // commander's cupola and its gun
  for (const z of [6, 14]) { t.box(23, 1, z - 1, 25, 5, z + 2, TEAM_D); t.box(26, 2, z, 50, 2, z + 1, GUN); t.box(26, 3, z, 50, 3, z + 1, GUN_L); t.box(30, 1, z, 32, 4, z + 1, GUN); t.box(51, 1, z - 1, 54, 4, z + 2, K); } // twin long guns, mantlets, muzzle brakes
  for (let y = 8; y < 16; y++) t.set(2, y, 18, K);
  return { body: b, bodyPivot: [28, 0, 19.5], turret: t, turretPivot: [11, 0, 11], turretAt: [35, 17, 19.5] };
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
  b.box(56, 1, 52, 66, 3, 64, TRK); b.box(57, 4, 53, 65, 8, 63, (x, y, z) => (y === 8 ? TEAM : (x + z + y) % 5 === 0 ? 0x6e7278 : TEAM_D)); // a super-heavy hull half built under the gantry
  for (let y = 1; y < 12; y++) for (const [x, z] of [[55, 51], [67, 51], [55, 65]]) b.set(x, y, z, y % 3 ? STEEL : STEEL_L); b.box(55, 11, 51, 67, 11, 51, STEEL_L); // scaffolding
  truck(b, 10, 56); crates(b, 34, 58, 6, 5, 5); crates(b, 41, 59, 4, 4, 3); drums(b, 28, 64, 4);
  for (const [x, z] of [[2, 50], [50, 2], [52, 68]]) lampPost(b, x, z, 16);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// EMP Cannon: a tall coil mast banded in copper, three wide coil rings round it and a glowing emitter on top,
// four capacitor drums cabled to its foot and a control bunker in the corner. 3 x 3.
const COPPER = 0xb8763a, COPPER_D = 0x8a5428, EMP = 0x7fd8ff, EMP_L = 0xe0f8ff;
function empCannon(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => pad(x, z, 71, 71));
  tower(b, 36, 36, 1, 4, () => 17, (x, y) => (y === 4 ? CONC_D : CONC), 17); // a round plinth
  tower(b, 36, 36, 5, 9, () => 10, (x, y) => (y === 9 ? TEAM_D : TEAM), 10); // the armoured base of the mast, in team colour
  tower(b, 36, 36, 10, 48, (y) => 5.5 - (y - 10) * 0.05, (x, y) => (y % 4 === 0 ? COPPER : y % 4 === 1 ? COPPER_D : y % 4 === 2 ? STEEL : STEEL_L), 6); // the mast, wound in copper
  for (const [y, r] of [[16, 12], [27, 10], [38, 8]]) tower(b, 36, 36, y, y + 1, () => r, (x, yy) => (yy === y ? COPPER : COPPER_D), 1.6, true); // the coil rings
  for (const [y, r] of [[16, 12], [27, 10], [38, 8]]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; for (let d = 6; d < r; d++) b.set(36 + Math.round(Math.cos(a) * d), y, 36 + Math.round(Math.sin(a) * d), STEEL); } // their spokes
  dome(b, 36, 49, 36, 6, (x, y, z) => (y > 53 || hash3(x, y, z) < 0.25 ? EMP_L : EMP)); dome(b, 36, 49, 36, 4, () => EMP_L); // the emitter, glowing
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) if (Math.hypot(dx, dz) <= 6) b.set(36 + dx, 48, 36 + dz, Math.hypot(dx, dz) > 5 ? COPPER_D : EMP); // its lower half
  for (const [x, z] of [[10, 10], [62, 10], [10, 62], [62, 62]]) { // capacitor drums, cabled to the mast
    tower(b, x, z, 1, 10, () => 5, (xx, y) => (y === 10 ? STEEL_L : y === 3 || y === 7 ? TEAM_D : TEAM), 5);
    b.set(x, 11, z, EMP); b.box(x - 1, 11, z, x + 1, 11, z, STEEL); b.box(x, 11, z - 1, x, 11, z + 1, STEEL);
    const n = Math.max(Math.abs(36 - x), Math.abs(36 - z)); for (let i = 0; i <= n; i++) b.set(Math.round(x + ((36 - x) * i) / n), 1, Math.round(z + ((36 - z) * i) / n), K);
  }
  b.box(48, 1, 26, 58, 7, 40, (x, y, z) => (y === 7 ? TEAM_D : x === 58 && y >= 4 && y <= 5 && z % 3 ? GLASS : x === 58 && z >= 31 && z <= 33 && y < 6 ? K : CREAM)); // the control bunker
  for (const [x, z] of [[52, 30], [52, 36]]) acUnit(b, x, 8, z);
  lampPost(b, 4, 36, 14); lampPost(b, 68, 36, 14);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Bomber: a twin-engined straight-winged bomber with a glazed nose and a bomb bay.
function bomber(): ModelDef {
  const b = new VB();
  const Z = 17; // the centre line
  // a long jet fuselage tapering to a pointed nose, the cockpit glazed near the front
  b.box(2, 3, Z - 1, 31, 6, Z + 1, (x, y, z) => (y === 3 ? TEAM_D : z === Z && y === 6 && x % 6 === 0 ? TEAM_D : TEAM));
  b.box(32, 3, Z - 1, 34, 5, Z + 1, TEAM); b.box(35, 3, Z, 37, 4, Z, TEAM_D); b.set(38, 3, Z, 0x8a8a80); // nose and pitot probe
  b.box(28, 6, Z - 1, 31, 6, Z + 1, GLASS); b.box(29, 7, Z, 31, 7, Z, GLASS_L); b.box(32, 6, Z, 32, 6, Z, GLASS); // cockpit
  b.box(10, 2, Z - 1, 22, 2, Z + 1, (x) => (x % 4 === 0 ? 0x2e3032 : GRILLE)); // bomb bay doors
  // swept wings, panel lines and darker leading edges
  for (let d = 2; d <= 17; d++) {
    const lead = 23 - Math.round(d * 0.75), chord = Math.max(2, 11 - Math.round(d * 0.5));
    for (const z of [Z - d, Z + d]) b.box(lead - chord, 5, z, lead, 5, z, (x) => (x === lead ? TEAM_D : d % 5 === 0 ? TEAM_D : TEAM));
  }
  // two engines in pods under the wings
  for (const z of [Z - 7, Z + 7]) { b.box(10, 3, z, 19, 4, z + (z < Z ? 1 : -1), (x) => (x === 19 ? K : x === 10 ? 0x2e3032 : GUN)); b.box(14, 4, z, 16, 4, z, GUN); }
  // a tall swept fin and a swept tailplane
  for (let y = 7; y <= 14; y++) { const x0 = 1 + Math.round((y - 7) * -0.6) + 4; b.box(Math.max(0, x0 - 3), y, Z, x0 + 2, y, Z, y === 14 ? TEAM_D : TEAM); }
  for (let d = 2; d <= 8; d++) { const lead = 8 - Math.round(d * 0.6); for (const z of [Z - d, Z + d]) b.box(Math.max(0, lead - 4), 6, z, lead, 6, z, TEAM_D); }
  b.box(0, 4, Z - 1, 1, 5, Z + 1, 0x2e3032); // exhaust at the tail
  return { body: b, bodyPivot: [19, 0, Z], clean: true };
}

// ---------------------------------------------------------------- base life: props that make a base look lived in
const WOOD_C = 0x8a6a40, WOOD_CD = 0x6e5232;
function drums(b: VB, x: number, z: number, n: number) { for (let i = 0; i < n; i++) { const dx = x + (i % 2) * 2, dz = z + Math.floor(i / 2) * 2; b.box(dx, 1, dz, dx + 1, 3, dz + 1, (xx, y) => (y === 3 ? 0x3a3c30 : i % 3 === 2 ? RUST : OLIVE)); } }
function crates(b: VB, x: number, z: number, w: number, d: number, h: number) { b.box(x, 1, z, x + w - 1, h, z + d - 1, (xx, y, zz) => (y === h ? WOOD_C : (xx + zz) % 3 === 0 || y % 3 === 0 ? WOOD_CD : WOOD_C)); }
function lampPost(b: VB, x: number, z: number, h: number) { for (let y = 1; y < h; y++) b.set(x, y, z, STEEL); b.box(x, h, z, x + 1, h, z, STEEL_L); b.set(x + 1, h - 1, z, LAMP); }
function acUnit(b: VB, x: number, y: number, z: number) { b.box(x, y, z, x + 3, y + 1, z + 2, (xx, yy) => (yy === y + 1 && xx === x + 1 ? K : 0x8a8c88)); }
function sandbagRow(b: VB, x0: number, z0: number, x1: number, z1: number) { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { b.set(x, 1, z, (x + z) % 3 ? SAND : SAND_D); b.set(x, 2, z, SAND); } }
// A chain-link fence round a rectangle: posts every 3 blocks, a top rail, and gaps where open(x, z) says
function fence(b: VB, x0: number, z0: number, x1: number, z1: number, open: (x: number, z: number) => boolean = () => false) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if ((x !== x0 && x !== x1 && z !== z0 && z !== z1) || open(x, z)) continue;
    if ((x + z) % 4 === 0) { b.set(x, 1, z, 0x8a8c88); b.set(x, 2, z, 0x8a8c88); b.set(x, 3, z, 0x9a9c98); } // posts
    else if ((x + z) % 2 === 0) b.set(x, 3, z, 0xa4a6a2); // a thin wire on top, dashed: it reads as mesh, not a wall
  }
}
// An army truck parked along x (facing +x) or along z (facing +z): a cab in the side's colour, a canvas back
function truck(b: VB, x: number, z: number, alongZ = false) {
  const put = (dx: number, y: number, dz: number, c: number) => (alongZ ? b.set(x + dz, y, z + dx, c) : b.set(x + dx, y, z + dz, c));
  const box = (a0: number, y0: number, c0: number, a1: number, y1: number, c1: number, c: (a: number, y: number, cc: number) => number) => { for (let a = a0; a <= a1; a++) for (let y = y0; y <= y1; y++) for (let cc = c0; cc <= c1; cc++) put(a, y, cc, c(a, y, cc)); };
  for (const a of [1, 5, 11]) for (const c of [0, 5]) box(a, 1, c, a + 1, 2, c, () => TRK);
  box(0, 2, 0, 13, 2, 5, () => STEEL);
  box(10, 3, 0, 13, 6, 5, (a, y) => (a === 13 && y >= 5 ? GLASS : y === 6 ? TEAM_D : TEAM));
  box(0, 3, 0, 9, 6, 5, (a, y, c) => (y === 6 ? (a % 3 === 0 ? CANVAS_D : CANVAS) : c === 0 || c === 5 || a === 0 ? (a % 3 === 0 ? CANVAS_D : CANVAS) : 0));
}
// A canvas tent with a ridge along x
function tent(b: VB, x0: number, z0: number, x1: number, z1: number) {
  const mid = (z0 + z1) / 2, half = (z1 - z0) / 2;
  for (let z = z0; z <= z1; z++) { const h = 1 + Math.round((half - Math.abs(z - mid)) * 0.9); for (let x = x0; x <= x1; x++) { b.set(x, h, z, Math.abs(z - mid) < 1 ? CANVAS_D : x % 4 === 0 ? CANVAS_D : CANVAS); if (x === x0 || x === x1) for (let y = 1; y < h; y++) b.set(x, y, z, x === x1 && Math.abs(z - mid) < 1.5 && y < 4 ? K : CANVAS_D); } }
}
// Another model's blocks set down into this one (a parked helicopter, a vehicle on a hoist)
function stamp(b: VB, src: VB, dx: number, dy: number, dz: number) { src.each((x, y, z, c) => b.set(x + dx, y + dy, z + dz, c)); }

// ---------------------------------------------------------------- base structures
// Generator: a concrete cooling tower that waists in and flares out, beside a turbine shed and a
// transformer yard. Steam rises from the tower (drawn live). 2 x 2 cells.
function generator(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => pad(x, z, 47, 47));
  // a turbine hall in ribbed steel under a pitched roof in the side's colour, its windows lit
  b.box(3, 1, 24, 28, 13, 44, (x, y, z) => {
    if (x !== 3 && x !== 28 && z !== 24 && z !== 44) return 0;
    if (z === 44 && x >= 10 && x <= 17 && y < 10) return y === 9 ? K : y % 2 ? 0x5e6268 : 0x4a4e54; // roll-up door
    if (y >= 9 && y <= 10 && (z === 44 || x === 28) && (x + z) % 4 < 2) return y === 10 ? 0xe0a050 : 0xc8823a; // lit windows
    return y <= 1 ? CONC_D : (x + z) % 3 === 0 ? 0x8a8e94 : 0x9ea2a6;
  });
  for (let z = 24; z <= 44; z++) { const h = 13 + Math.round(6 - Math.abs(z - 34) * 0.55); for (let x = 2; x <= 29; x++) { b.set(x, h, z, x % 3 === 0 ? TEAM_D : TEAM); if (x === 3 || x === 28) for (let y = 14; y < h; y++) b.set(x, y, z, 0x9ea2a6); } }
  for (const x of [8, 16, 24]) b.box(x, 20, 33, x + 1, 21, 35, STEEL_L); // roof vents
  // a tall exhaust stack, its duct running from the hall
  tower(b, 8, 12, 1, 38, () => 2.6, (x, y) => (y >= 37 ? K : y >= 30 && y <= 31 ? TEAM : y % 6 === 0 ? STEEL_L : 0x8a8c88), 1.3);
  b.box(6, 9, 15, 10, 11, 24, (x, y) => (y === 11 ? 0x5a5e62 : GUN));
  for (let y = 2; y < 37; y += 2) b.set(10.6, y, 12, K); // ladder up the stack
  // a fan cooler on legs: four big fans in their shrouds
  for (let x = 16; x <= 42; x += 6) for (const z of [3, 13]) for (let y = 1; y <= 5; y++) b.set(x, y, z, STEEL);
  b.box(15, 6, 2, 43, 8, 14, (x, y, z) => (y === 8 ? 0x6e7278 : y === 7 && (z === 2 || z === 14) ? TEAM : 0x7a7e84));
  for (const cx of [19, 26, 33, 40]) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const d = Math.hypot(dx, dz); if (d > 3.2) continue;
    if (d > 2.4) b.set(cx + dx, 9, 8 + dz, STEEL_L); // shroud
    else b.set(cx + dx, 8, 8 + dz, d < 0.8 ? STEEL_L : Math.round(Math.atan2(dz, dx) * 1.9) % 2 ? 0x3a3c3e : K); // blades and hub
  }
  // a fuel tank on saddles, piped to the hall
  for (let x = 15; x <= 29; x++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) if (Math.hypot(dy, dz) <= 3.1) b.set(x, 4 + dy, 19 + dz, x === 22 ? TEAM : x === 15 || x === 29 ? 0xb0aca0 : 0xc8c4b8);
  for (const x of [17, 27]) b.box(x, 1, 16, x, 1, 22, K);
  b.box(20, 1, 22, 21, 2, 24, GUN);
  // the transformer yard and a pylon carrying the power away
  fence(b, 31, 22, 47, 47, (x, z) => z === 22 && x > 34 && x < 38);
  for (const z0 of [25, 37]) { b.box(34, 1, z0, 38, 5, z0 + 5, (x, y, z) => (y === 5 ? 0x5a5e64 : z % 2 ? 0x6a6e74 : 0x7a7e84)); for (const dz of [1, 3, 5]) for (let y = 6; y < 9; y++) b.set(36, y, z0 + dz - 1, y === 8 ? STEEL : 0xd8d0b8); }
  for (let y = 1; y <= 26; y++) { const k = Math.round((26 - y) * 0.11); for (const [x, z] of [[42 - k, 31 - k], [44 + k, 31 - k], [42 - k, 33 + k], [44 + k, 33 + k]]) b.set(x, y, z, STEEL); if (y % 5 === 0) b.box(42 - k, y, 31 - k, 44 + k, y, 33 + k, (x, yy, z) => (x === 42 - k || x === 44 + k || z === 31 - k || z === 33 + k ? STEEL_L : 0)); }
  for (const y of [22, 26]) { b.box(37, y, 32, 47, y, 32, STEEL_L); for (const x of [38, 47]) b.box(x, y - 2, 32, x, y - 1, 32, 0xd8d0b8); }
  drums(b, 4, 4, 4); lampPost(b, 30, 46, 12);
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
  lampPost(b, 2, 30, 12); lampPost(b, 68, 46, 12); drums(b, 66, 22, 4);
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
  for (let y = 1; y < 30; y++) b.set(40, y, 41, STEEL_L); // flagpole
  b.box(40, 22, 42, 40, 28, 51, (x, y, z) => (Math.abs(y - 25 + Math.sin(z * 0.7)) < 1 ? TEAM_D : TEAM)); // flag
  for (const [x, z] of [[2, 2], [9, 2], [2, 8], [9, 8]]) for (let y = 1; y < 14; y++) b.set(x, y, z, 0x5a4a34); // water tank on stilts
  tower(b, 5.5, 5, 14, 21, () => 4.6, (x, y) => (y === 21 ? TEAM_D : y % 3 === 0 ? 0x5a4a34 : WOOD_L));
  truck(b, 14, 2); crates(b, 31, 2, 5, 4, 4); crates(b, 32, 3, 3, 2, 6); drums(b, 39, 2, 4);
  tent(b, 17, 39, 29, 46); lampPost(b, 44, 36, 12); lampPost(b, 2, 30, 12);
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
  b.box(13, 1, 30, 26, 3, 40, (x, y) => (y === 3 ? TEAM : y === 1 ? TRK : TEAM_D)); b.box(16, 4, 33, 22, 5, 38, TEAM); b.box(23, 4, 35, 30, 4, 36, GUN); // a tank being fitted in the first bay
  for (let x = 46; x <= 60; x += 7) b.box(x, 0, 47, x, 0, 69, 0xd8d2c0); // painted parking bays
  truck(b, 48, 49, true); drums(b, 40, 64, 4); crates(b, 62, 60, 5, 5, 4); lampPost(b, 2, 46, 14); lampPost(b, 44, 47, 14);
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
  for (let y = 1; y < 22; y++) b.set(8, y, 40, y > 18 ? K : STEEL); // flare stack (the flame is drawn live)
  b.box(9, 3, 24, 22, 4, 25, STEEL_L); b.box(26, 3, 18, 33, 4, 19, STEEL_L); // pipes
  drums(b, 36, 34, 6); truck(b, 22, 40); b.box(2, 1, 2, 9, 6, 8, (x, y) => (y === 6 ? TEAM_D : x === 9 && y < 4 ? K : 0x7a7e76)); // drums, a tanker, the pump shed
  lampPost(b, 44, 26, 12);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Guard Tower: a tall concrete lookout on four legs, sandbagged gun nest under a peaked tin roof,
// with a searchlight. 1 x 1 cell.
function guardTower(): ModelDef {
  const b = new VB();
  for (let a = 0; a < 44; a++) { if (a % 11 < 2) continue; const x = 12 + Math.cos((a / 44) * 6.283) * 11, z = 12 + Math.sin((a / 44) * 6.283) * 11; b.set(x, 1, z, (a % 3) ? SAND : SAND_D); b.set(x, 2, z, SAND); } // sandbags round the foot
  b.box(7, 0, 7, 16, 1, 16, (x, y, z) => (hash3(x, y, z) < 0.1 ? CONC_D : CONC)); // footing
  // four splayed steel legs, braced in an X on every face
  const leg = (x: number, z: number, y: number): [number, number] => { const k = Math.round((17 - y) * 0.12); return [x < 12 ? x - k : x + k, z < 12 ? z - k : z + k]; };
  for (let y = 2; y < 18; y++) for (const [x, z] of [[7, 7], [16, 7], [7, 16], [16, 16]]) { const [lx, lz] = leg(x, z, y); b.set(lx, y, lz, 0x6a6e72); }
  for (let y = 2; y < 17; y++) { const f = ((y - 2) % 5) / 5, a = Math.round(7 + f * 9), c = Math.round(16 - f * 9); for (const p of [a, c]) { b.set(p, y, 6.5, STEEL); b.set(p, y, 17.5, STEEL); b.set(6.5, y, p, STEEL); b.set(17.5, y, p, STEEL); } }
  for (let y = 2; y < 18; y++) b.set(12, y, 18, y % 2 ? STEEL_L : 0); // ladder
  // the cabin: steel walls in the side's colour, firing slits, a tin roof that overhangs
  b.box(5, 18, 5, 18, 24, 18, (x, y, z) => {
    const edge = x === 5 || x === 18 || z === 5 || z === 18;
    if (!edge) return y === 18 ? 0x5a5c5a : 0;
    if (y === 18) return 0x5a5c5a;
    if (y >= 21 && y <= 22 && (x + z) % 4 !== 0 && !(x === 5 || x === 18) !== !(z === 5 || z === 18)) return K; // slits
    return y === 24 ? TEAM_D : (x + z) % 5 === 0 ? TEAM_D : TEAM;
  });
  b.box(4, 25, 4, 19, 25, 19, (x, y, z) => (x === 4 || x === 19 || z === 4 || z === 19 ? 0x4a4c4c : x % 3 === 0 ? 0x6a6c6c : 0x7a7c7a)); // tin roof
  b.box(19, 21, 11, 22, 21, 12, GUN); // machine gun
  b.box(10, 26, 10, 12, 27, 12, STEEL_L); b.set(13, 27, 11, LAMP); // searchlight
  for (let y = 26; y < 33; y++) b.set(6, y, 6, K); // aerial
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Cannon Emplacement: a sandbagged concrete ring with a turning gun turret. 2 x 2 cells.
function emplacement(): ModelDef {
  const b = new VB();
  // a gun pit: a sloped earth berm, grass on its crest, faced in concrete inside, round a concrete deck
  for (let y = 0; y < 7; y++) for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
    const d = Math.max(Math.abs(x - 23.5), Math.abs(z - 23.5)) * 0.7 + Math.hypot(x - 23.5, z - 23.5) * 0.35;
    if (d > 21 - y * 1.1 || (d < 14 && y > 0)) continue; // (open in the middle: the gun sits in the pit)
    const inner = d < 15.2;
    b.set(x, y, z, inner ? (y === 6 ? TEAM : y === 5 ? TEAM_D : hash3(x, y, z) < 0.1 ? CONC_D : CONC) : y >= 5 || d > 20.4 - y * 1.1 ? (hash3(x, y, z) < 0.4 ? 0x5e7440 : 0x6a7c48) : hash3(x, y, z) < 0.3 ? 0x5e4c36 : 0x6e5a40);
  }
  b.box(10, 0, 10, 37, 5, 37, (x, y, z) => (y === 5 && Math.hypot(x - 23.5, z - 23.5) < 13.5 ? (Math.abs(Math.hypot(x - 23.5, z - 23.5) - 9) < 0.6 ? 0x9a9488 : (x % 6 === 0 || z % 6 === 0) ? CONC_D : CONC) : 0)); // deck, a ring where the turret turns
  b.box(2, 1, 20, 9, 5, 27, (x, y, z) => (y === 5 ? 0x6a7c48 : x === 2 && z >= 22 && z <= 25 && y < 4 ? K : CONC)); // the magazine's door in the berm
  for (const [x, z] of [[14, 14], [33, 14], [14, 33]]) crates(b, x, z, 3, 2, 7); // shell boxes on the deck
  const t = new VB();
  // a wedge-shaped gun house: sloped front and sides, a long barrel
  for (let y = 0; y <= 6; y++) { const fx = 13 - Math.round(y * 0.7), s = Math.round(y * 0.5); t.box(0, y, 2 + s, fx, y, 13 - s, (x, yy, z) => (y === 6 ? TEAM_D : (x + z) % 7 === 0 ? TEAM_D : TEAM)); }
  t.box(12, 1, 5, 14, 4, 10, TEAM_D); // mantlet
  barrel(t, 15, 31, 2, 7); t.box(19, 1, 6, 21, 4, 9, GUN); t.box(32, 1, 6, 33, 4, 9, K); // fume extractor, muzzle brake
  t.box(3, 7, 9, 5, 7, 11, HATCH); t.box(1, 3, 1, 3, 4, 1, K);
  for (let y = 7; y < 13; y++) t.set(1, y, 4, K);
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
  b.box(3, 1, 3, 45, 2, 25, (x, y, z) => (x === 3 || x === 45 || z === 3 || z === 25 ? CONC_D : 0)); // a low bund wall round the tanks
  truck(b, 22, 27, true);
  for (let x = 10; x <= 40; x++) { b.set(x, 5, 26, GUN); if (x % 6 === 4) b.box(x, 1, 26, x, 4, 26, STEEL); } // pipe rack
  lampPost(b, 46, 26, 12);
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
  for (let dx = -8; dx <= 8; dx++) for (let dz = -5; dz <= 5; dz++) { const h = Math.round(5 - Math.hypot(dx * 0.6, dz) + hash3(dx, 1, dz)); for (let y = 1; y <= h; y++) b.set(12 + dx, y, 39 + dz, hash3(dx, y, dz) < 0.3 ? 0x2e2c2a : 0x222020); } // a coal heap
  for (let i = 0; i < 14; i++) b.box(20 + i, 2 + Math.round(i * 0.7), 36 - Math.round(i * 0.3), 20 + i, 2 + Math.round(i * 0.7), 37 - Math.round(i * 0.3), i % 3 ? K : STEEL_L); // conveyor up to the hall
  lampPost(b, 44, 2, 14); lampPost(b, 70, 46, 14);
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
  for (const [ax, az] of [[0, 0], [23, 0], [0, 23], [23, 23]]) { b.box(ax, 0, az, ax, 1, az, CONC_D); for (let t = 0.05; t < 1; t += 0.045) { const x = ax + (15.5 - ax) * t, z = az + (15.5 - az) * t, y = 1 + 40 * t; if (Math.round(t * 22) % 2) b.set(x, y, z, 0x3a3c3e); } } // guy wires
  acUnit(b, 7, 10, 7);
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
  b.box(18, 1, 22, 30, 3, 30, (x, y) => (y === 3 ? TEAM_D : TRK)); b.box(19, 4, 23, 29, 5, 29, TEAM); // a tank hull under the hoist
  b.box(30, 1, 33, 35, 3, 38, TEAM); b.box(35, 2, 35, 42, 2, 36, GUN); // its turret, lifted off and set down beside it
  for (const [x, z] of [[40, 40], [43, 42]]) tower(b, x, z, 1, 5, () => 1.6, (xx, y) => (y % 2 ? TRK : 0x343432), 1.2, true);
  lampPost(b, 44, 20, 12);
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
  tower(b, 39, 43, 1, 2, () => 3.5, (x, y) => STONE[(x + y) % 3], 1.2); b.box(37, 1, 41, 41, 1, 45, (x, y, z) => (Math.hypot(x - 39, z - 43) < 2.6 ? 0x5a8aa0 : 0)); b.box(39, 2, 43, 39, 4, 43, STONE[1]); b.set(39, 5, 43, 0xa8c8d8); // a fountain
  for (const x of [5, 12]) { b.box(x, 1, 44, x + 3, 1, 44, WOOD); b.box(x, 2, 45, x + 3, 2, 45, WOOD_L); } // benches
  for (const x of [16, 30]) lampPost(b, x, 44, 10);
  for (const [x, z] of [[3, 3], [44, 3]]) { b.box(x - 1, 1, z - 1, x + 1, 1, z + 1, STONE[1]); b.box(x - 1, 2, z - 1, x + 1, 3, z + 1, 0x4e6a30); } // planters
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Paved Road: only used for its build-panel picture (roads are painted into the ground).
function road(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 23, 0, 23, (x, y, z) => (x < 2 || x > 21 ? 0x9a968a : (z % 8 < 4 && x >= 11 && x <= 12) ? 0xe8e0c0 : hash3(x, 0, z) < 0.08 ? 0x2a2a2c : 0x4a4a4d));
  return { body: b, bodyPivot: [12, 0, 12] };
}

export const BASE: Record<string, () => ModelDef> = { road, generator, scrapyard, barracks, depot, derrick, guardTower, emplacement, workshop, wall, reactor, airfield, flakTower, radar, provingGround, empCannon };
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
    box(13, 20, 20, 18, 24, 27, (x, y, z) => (y === 24 ? 0x4a4842 : y === 22 && (x === 18 || x === 13) && z % 3 ? 0x6a8aa0 : 0x9a978e)); // the control hut
    for (const z of [6, 41]) box(19, 20, z, 19, 25, z, (x, y) => (y === 25 ? 0xe8d8a0 : 0x5a5850)); // lamps
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
  fence(b, 0, 0, 47, 47, (x, z) => z === 47 && x > 20 && x < 28); lampPost(b, 20, 44, 12); acUnit(b, 6, 12, 33);
  return { body: b, bodyPivot: [24, 0, 24] };
}

export const CIVIC: Record<string, () => ModelDef> = { uplink, dam0, dam1, dam2, dam3, damRuin0, damRuin1, damRuin2, damRuin3, cottage, cottage2, townhouse, shop, barn, waterTower, motorPool, recruitOffice, bunker, fuelDepot, powerPlant, commTower, repairYard, townHall };
export const LIFE: Record<string, () => ModelDef> = { car, pickup, civilian, cow, deer };

export const ART: Record<string, () => ModelDef> = { tank, harvester, builder, rifle: rifleman, rocket: rocketeer, scout, artillery, grenadier, gunship, quad: quadGun, colossus, bomber, fieldCommand };

// ---------------------------------------------------------------- the Swarm's own pieces (see src/swarm.ts)
// Each stands in for the model of the piece it replaces, for a side playing Swarm. /tools/models.html?part=swarm shows them.
const ROTOR_D = 0x8a8c88;
// A small attack quadcopter parked at (x, y, z) in a drone truck's cell: a team-coloured body over a dark charge, four
// arms, and crossed still blades, so its team colour shows on the deck
function quadcopter(b: VB, x: number, y: number, z: number) {
  b.box(x + 2, y, z + 2, x + 4, y + 1, z + 4, (xx, yy, zz) => (yy === y ? TEAM_D : xx === x + 3 && zz === z + 3 ? TEAM_L : TEAM)); b.set(x + 4, y, z + 3, K); // body, a camera eye at the front
  for (const dx of [1, 5]) for (const dz of [1, 5]) { b.set(x + dx, y + 1, z + dz, K); b.set(x + dx - 1, y + 2, z + dz + (dx === dz ? 1 : -1), STEEL_L); b.set(x + dx + 1, y + 2, z + dz - (dx === dz ? 1 : -1), STEEL_L); b.set(x + dx, y + 2, z + dz, GUN); } // arms, still blades
}
// Drone Truck: a heavy armoured six-wheeler, built like a mine-proof truck. Armoured fenders over big wheels,
// a ram on the nose, a low wedge cab with slit windows and a sensor ball with a red eye. Its back is an
// armoured launch box, slat armour on its flanks, four drones nested in its open cells, a jammer dish at the tail.
function droneTruck(n = 4): ModelDef {
  const b = new VB();
  wheels(b, [3, 10, 23], 0, 12);
  b.box(1, 3, 1, 29, 7, 12, (x, y, z) => (y === 3 ? K : y === 7 ? TEAM_D : (x + z) % 9 === 0 && y === 5 ? TEAM_D : TEAM)); // the hull, a V underneath
  for (const z of [0, 13]) b.box(1, 4, z, 29, 5, z, (x, y) => (x % 7 === 0 ? K : y === 5 ? TEAM_D : TEAM)); // armoured fenders over the wheels
  b.box(30, 3, 2, 31, 6, 11, (x, y, z) => (x === 31 && z % 2 ? K : GUN)); b.box(30, 7, 3, 30, 7, 10, GUN_L); // the ram
  b.set(30, 6, 2, LENS); b.set(30, 6, 11, LENS);
  // the wedge cab: its face slopes back as it rises
  for (let y = 8; y <= 11; y++) b.box(21, y, 2, 29 - (y - 8), y, 11, (x, yy, z) => (x === 29 - (y - 8) && y === 9 && z > 3 && z < 10 ? (z % 3 ? GLASS : K) : y === 11 ? TEAM_D : x === 21 ? TEAM_D : TEAM));
  for (const z of [2, 11]) b.box(23, 9, z, 26, 9, z, K); // side slits
  b.box(23, 12, 5, 24, 13, 8, GUN); b.box(25, 13, 6, 25, 13, 7, RED); b.box(24, 14, 6, 24, 14, 7, K); // the sensor ball, a red eye
  for (const z of [2, 11]) b.box(21, 12, z, 22, 12, z, OLIVE); // smoke dischargers
  // the launch box: armoured, chamfered on top, a hazard stripe round its rim, four open cells with a drone in each
  b.box(2, 8, 1, 19, 11, 12, (x, y, z) => {
    const edge = x === 2 || x === 19 || z === 1 || z === 12, wall = edge || x === 10 || x === 11 || z === 6 || z === 7;
    if (!wall) return y === 8 ? K : 0;
    if (y === 11) return edge ? HAZ : GUN;
    return edge ? ((x * 2 + y + z) % 11 === 0 ? RUST : TEAM) : GUN;
  });
  for (const [x, z] of [[3, 0], [11, 0], [3, 6], [11, 6]].slice(0, n)) quadcopter(b, x, 10, z); // n drones sitting down in their cells, blades just over the rim (the others out flying: their cells stand empty)
  for (const z of [0, 13]) for (let x = 2; x <= 19; x += 2) b.box(x, 7, z, x, 11, z, (xx, y) => (y === 11 ? GUN_L : K)); // slat armour on the flanks
  // at the tail: the jammer dish on a stout post, a whip antenna
  b.box(0, 8, 5, 1, 12, 8, GUN);
  for (let r = 0; r <= 3; r++) for (let a = 0; a < 16; a++) b.set(0, 15 + Math.round(Math.sin(a / 2.5) * r), 6.5 + Math.cos(a / 2.5) * r, r === 3 ? STEEL : r === 0 ? K : STEEL_L);
  for (let y = 12; y < 22; y++) b.set(20, y, 11, K); b.set(20, 22, 11, RED);
  return { body: b, bodyPivot: [16, 0, 6.5] };
}
// A drone in flight: a chunky body in the side's colour (what reads in the sky at game size), four dark arms, and
// a faint blur at each rotor, kept thin so it doesn't swamp the colour
function drone(): ModelDef {
  const b = new VB();
  b.box(2, 2, 2, 5, 3, 5, (x, y, z) => (y === 2 ? TEAM_D : (x === 3 || x === 4) && (z === 3 || z === 4) ? TEAM_L : TEAM)); b.set(6, 2, 3, K); b.set(6, 2, 4, K); // body, a camera at the front
  for (const [x, z] of [[1, 1], [6, 1], [1, 6], [6, 6]]) { b.set(x, 3, z, K); b.set(x, 4, z, GUN); for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) b.set(x + dx, 4, z + dz, ROTOR_D); } // arms, hubs, the rotors' blur
  return { body: b, bodyPivot: [3.5, 0, 3.5], clean: true };
}
export const SWARM: Record<string, () => ModelDef> = { gunship: () => droneTruck(4), drone, ...Object.fromEntries([0, 1, 2, 3].map((n) => ['droneTruck' + n, () => droneTruck(n)])) }; // by the key of the piece each stands in for (droneTruckN: with N drones home)
