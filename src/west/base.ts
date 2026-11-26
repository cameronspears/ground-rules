// WILD WEST: the base buildings' frontier looks, standing in for BASE (and the Field Command) by key. Same footprint and pivot as the original.
// Facing +X like every model; the front door is on the south (+Z) face, as in art.ts.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from '../models';
import { hash3 } from '../hash';
import { tower, dome } from '../art';

// ---------------------------------------------------------------- the frontier's palette
const K = 0x1f1c1a, DIRT = 0xa8865c, DIRT_D = 0x927250, DIRT_L = 0xbc9a6c, CINDER = 0x4e4440, CINDER_D = 0x3a3330, SAGE = 0x7a8466;
const BOARD = 0x8a6440, BOARD_D = 0x6a4a2e, BOARD_L = 0xa47c50, GREY = 0x8e8474, GREY_D = 0x6e6658, GREY_L = 0xa09484;
const LOG = 0x6a4a2c, LOG_D = 0x543a22, LOG_L = 0x86603a, LOG_END = 0xc09a6a;
const SHINGLE = 0x5e4a36, SHINGLE_D = 0x4a3a2a, PAINT = 0xd8ccb0, PAINT_D = 0xbcae90;
const BRICK = [0x8a4a34, 0x9a5640, 0x7a3e2c], STONE = [0x8a8274, 0x9a9282, 0x7a7266];
const IRON = 0x2e2e30, IRON_L = 0x55555a, IRON_D = 0x1a1a1c, BRASS = 0xc89a40, BRASS_D = 0x9a7430;
const COPPER = 0xb8763a, COPPER_D = 0x8a5428, COPPER_L = 0xd8965a, EMP = 0x7fd8ff, EMP_L = 0xe0f8ff;
const GLOW = 0xff8a2a, GLOW_L = 0xffd070, LAMP = 0xffe08a, GOLD = 0xf0c840, WATER = 0x4a7a9a, WATER_L = 0x6a9ab8;
const CANVAS = 0xe0d6bc, CANVAS_D = 0xc4b89a, ROPE = 0xc0a878, HAY = 0xd8c070, HAY_D = 0xc0a458, LEATHER = 0x5a3a22, WICKER = 0xa0804a;
const GLASS = 0x6aa0a8, TAIL = 0xb8ae98, TAIL_D = 0xa49a84; // (glass jars; mill tailings)

// ---------------------------------------------------------------- shared pieces
type Col = (x: number, y: number, z: number) => number;
const dirt = (x: number, z: number) => { const h = hash3(x, 0, z); return h < 0.1 ? DIRT_D : h > 0.93 ? DIRT_L : hash3(x >> 3, 2, z >> 3) < 0.3 ? 0xa07e56 : DIRT; };
// The yard: packed dirt over the whole footprint, or what f says where it says something
function ground(b: VB, w: number, d: number, f?: (x: number, z: number) => number) { b.box(0, 0, 0, w, 0, d, (x, y, z) => (f && f(x, z)) || dirt(x, z)); }
const boards: Col = (x, y, z) => ((x + z) % 4 === 0 ? BOARD_D : hash3(x, y >> 2, z) < 0.12 ? BOARD_L : BOARD); // board and batten
const weathered: Col = (x, y, z) => ((x + z) % 3 === 0 ? GREY_D : hash3(x, y >> 1, z) < 0.15 ? GREY_L : GREY);
const brick: Col = (x, y, z) => BRICK[(Math.floor((x + z) / 2) + y + (y % 2)) % 3];
const logs: Col = (x, y) => (y % 2 ? LOG : LOG_L); // horizontal logs, a course a block
type Roof = (x: number, z: number, ridge: boolean) => number;
const teamRoof: Roof = (x, z, ridge) => (ridge ? TEAM_D : x % 4 === 0 ? TEAM_D : TEAM);
const teamRoofZ: Roof = (x, z, ridge) => (ridge ? TEAM_D : z % 4 === 0 ? TEAM_D : TEAM);
const shingles: Roof = (x, z, ridge) => (ridge ? SHINGLE_D : hash3(x >> 1, 3, z) < 0.25 ? SHINGLE_D : SHINGLE);
// Four walls (wall() says each block, 0 for an opening) under a gable roof; the ridge runs along x, or along z.
// Returns the ridge's height.
function roofed(b: VB, x0: number, z0: number, x1: number, z1: number, wallH: number, wall: Col, roof: Roof, alongZ = false, pitch = 0.7, eave = 1) {
  b.box(x0, 1, z0, x1, wallH, z1, (x, y, z) => (x === x0 || x === x1 || z === z0 || z === z1 ? wall(x, y, z) : 0));
  const [a0, a1, c0, c1] = alongZ ? [z0, z1, x0, x1] : [x0, x1, z0, z1], cm = (c0 + c1) / 2, half = (c1 - c0) / 2 + eave;
  let top = 0;
  for (let c = c0 - eave; c <= c1 + eave; c++) {
    const ry = Math.round((half - Math.abs(c - cm)) * pitch), y = wallH + 1 + ry; top = Math.max(top, y);
    for (let a = a0 - eave; a <= a1 + eave; a++) {
      const [x, z] = alongZ ? [c, a] : [a, c];
      b.set(x, y, z, roof(x, z, Math.abs(c - cm) < 1));
      if (a === a0 || a === a1) for (let yy = wallH + 1; yy < y; yy++) b.set(x, yy, z, wall(x, yy, z)); // gable ends
    }
  }
  return top;
}
// A flagpole and a flag in the side's colours, flying along +x (or +z)
function flag(b: VB, x: number, z: number, y0: number, top: number, len = 6, alongZ = false) {
  for (let y = y0; y <= top; y++) b.set(x, y, z, y === top ? BRASS : LOG_L);
  for (let i = 1; i <= len; i++) for (let y = top - 4; y < top; y++) {
    const c = Math.abs(y - (top - 2.5) + Math.sin(i * 0.8) * 0.6) < 0.6 ? TEAM_L : TEAM;
    if (alongZ) b.set(x, y + (i > len - 2 ? -1 : 0), z + i, c); else b.set(x + i, y + (i > len - 2 ? -1 : 0), z, c);
  }
}
// A spoked wheel standing upright: in the x-y plane at depth cz (axis 'z'), or in the z-y plane at x = cx (axis 'x')
function wheel(b: VB, cx: number, cy: number, cz: number, r: number, axis: 'x' | 'z' = 'z', spoke = BOARD_L, rim = IRON_L) {
  const n = Math.ceil(r);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const d = Math.hypot(i, j); if (d > r + 0.3) continue;
    let c = 0;
    if (d > r - 1) c = rim; else if (d < 1.3) c = IRON; else if (Math.abs(Math.sin(Math.atan2(j, i) * 4)) < 0.7 / d + 0.08) c = spoke;
    if (!c) continue;
    if (axis === 'z') b.set(cx + i, cy + j, cz, c); else b.set(cx, cy + j, cz + i, c);
  }
}
function barrel(b: VB, x: number, z: number, h = 3) { b.box(x, 1, z, x + 1, h, z + 1, (xx, y) => (y === h ? BOARD_D : y === 1 || y === h - 1 ? IRON_L : BOARD_L)); }
function hay(b: VB, x: number, z: number, w: number, d: number, h: number) { b.box(x, 1, z, x + w - 1, h, z + d - 1, (xx, y, zz) => (y === h ? HAY : (xx + zz + y) % 3 === 0 ? HAY_D : HAY)); }
function crate(b: VB, x: number, z: number, w: number, d: number, h: number, y0 = 1) { b.box(x, y0, z, x + w - 1, y0 + h - 1, z + d - 1, (xx, y, zz) => (y === y0 + h - 1 ? BOARD_L : (xx + zz) % 3 === 0 || y % 3 === 0 ? BOARD_D : BOARD)); }
function lantern(b: VB, x: number, z: number, h: number) { for (let y = 1; y < h; y++) b.set(x, y, z, LOG); b.box(x, h, z, x + 1, h, z, LOG_L); b.set(x + 1, h - 1, z, LAMP); }
// A water trough along x, z deep 3
function trough(b: VB, x0: number, z: number, x1: number) { b.box(x0, 1, z, x1, 2, z + 2, (x, y, zz) => (y === 2 && x > x0 && x < x1 && zz === z + 1 ? WATER_L : BOARD_D)); }
// A split-rail fence round a rectangle: posts every 4, two rails, gaps where open() says
function railFence(b: VB, x0: number, z0: number, x1: number, z1: number, open: (x: number, z: number) => boolean = () => false) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if ((x !== x0 && x !== x1 && z !== z0 && z !== z1) || open(x, z)) continue;
    const post = (x === x0 || x === x1) ? (z - z0) % 4 === 0 : (x - x0) % 4 === 0;
    if (post) for (let y = 1; y <= 4; y++) b.set(x, y, z, y === 4 ? LOG_END : LOG); else { b.set(x, 2, z, BOARD_L); b.set(x, 4, z, BOARD_L); }
  }
}
// A heap: rounded, rough, coloured by c (which gets a dice roll per block)
function heap(b: VB, cx: number, cz: number, rx: number, rz: number, h: number, c: (x: number, y: number, z: number, roll: number) => number) {
  for (let dx = -rx; dx <= rx; dx++) for (let dz = -rz; dz <= rz; dz++) {
    const e = 1 - Math.hypot(dx / rx, dz / rz); if (e <= 0) continue;
    const hh = Math.round(e * h + hash3(cx + dx, 7, cz + dz) * 1.2);
    for (let y = 1; y <= hh; y++) b.set(cx + dx, y, cz + dz, c(cx + dx, y, cz + dz, hash3(cx + dx, y, cz + dz)));
  }
}
// A telegraph wire (or rope), sagging between two points
function wire(b: VB, a: number[], c: number[], sag: number, col = K) {
  const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) * 1.5);
  for (let i = 0; i <= n; i++) { const t = i / n; b.set(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t, col); }
}
// A cart of ore on rails along x: an iron tub, rock heaped in it with gold showing
function oreCart(b: VB, x: number, z: number) {
  b.set(x + 1, 1, z, K); b.set(x + 3, 1, z, K); b.set(x + 1, 1, z + 3, K); b.set(x + 3, 1, z + 3, K);
  b.box(x, 2, z, x + 4, 4, z + 3, (xx, y, zz) => (xx === x || xx === x + 4 || zz === z || zz === z + 3 ? (y === 4 ? IRON_L : IRON) : y === 4 ? (hash3(xx, y, zz) < 0.3 ? GOLD : 0x7a6a58) : 0));
  b.box(x + 1, 5, z + 1, x + 3, 5, z + 2, (xx, y, zz) => (hash3(xx, y, zz) < 0.35 ? GOLD : 0x6a5a4a));
}
// A simple horse standing along x, its head at x0 + 10
function horse(b: VB, x: number, z: number, coat = 0x7a4a28) {
  const D = 0x5a341c, MANE = 0x2a1e16;
  for (const [dx, dz] of [[1, 0], [1, 2], [7, 0], [7, 2]]) b.box(x + dx, 1, z + dz, x + dx, 3, z + dz, D);
  b.box(x, 4, z, x + 8, 6, z + 2, coat); b.box(x + 8, 6, z + 1, x + 9, 8, z + 1, coat); b.box(x + 9, 8, z, x + 11, 9, z + 2, (xx) => (xx === x + 11 ? D : coat));
  b.box(x + 7, 7, z + 1, x + 8, 9, z + 1, MANE); b.box(x - 1, 3, z + 1, x - 1, 5, z + 1, MANE);
}

// ---------------------------------------------------------------- the buildings
// Windmill (the Generator): a tall timber lattice tower with a many-bladed fan and a tail vane, pumping water to a
// tank on stilts; a little shed and a corral by the trough. 2 x 2.
function windmill(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (Math.abs(z - 25) < 3 && x > 25 && x < 43 && hash3(x, 1, z) < 0.5 ? 0x7a6448 : 0)); // mud by the trough
  const cx = 18, cz = 18;
  for (let y = 1; y <= 28; y++) { // the lattice tower, tapering, banded in the side's colour
    const s = Math.round(5 - (y - 1) * 0.11);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.set(cx + sx * s, y, cz + sz * s, y % 7 < 2 ? TEAM : LOG_L);
    if (y % 5 === 0) for (let k = -s; k <= s; k++) for (const e of [-s, s]) { b.set(cx + k, y, cz + e, BOARD); b.set(cx + e, y, cz + k, BOARD); }
    else { const k = Math.round(-s + ((y % 5) / 5) * 2 * s); for (const e of [-s, s]) { b.set(cx + k, y, cz + e, BOARD_D); b.set(cx + e, y, cz - k, BOARD_D); } } // diagonal braces
    b.set(cx, y, cz, IRON_L); // the pump rod
  }
  b.box(cx - 3, 29, cz - 3, cx + 3, 29, cz + 3, (x, y, z) => (x === cx - 3 || x === cx + 3 || z === cz - 3 || z === cz + 3 ? BOARD_D : BOARD)); // a platform
  b.box(cx - 1, 30, cz - 1, cx + 2, 32, cz + 1, (x, y) => (y === 32 ? IRON_L : IRON)); // gearbox
  b.box(cx + 3, 32, cz, cx + 3, 32, cz, IRON);
  for (let dy = -7; dy <= 7; dy++) for (let dz = -7; dz <= 7; dz++) { // the fan: a ring of blades, alternately the side's colour
    const d = Math.hypot(dy, dz); if (d > 6.6) continue;
    const a = Math.atan2(dy, dz), f = (((a + Math.PI) / (Math.PI * 2)) * 16) % 1, i = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16);
    const c = d < 1.6 ? IRON : d > 5.8 || Math.abs(d - 2.6) < 0.5 ? IRON_L : f > 0.12 && f < 0.88 ? (i % 2 ? TEAM : CANVAS) : 0;
    if (c) b.set(cx + 4, 32 + dy, cz + dz, c);
  }
  b.box(cx - 8, 32, cz, cx + 1, 32, cz, IRON_L); // the tail boom and its vane
  b.box(cx - 12, 29, cz, cx - 7, 35, cz, (x, y) => (x === cx - 12 || y === 29 || y === 35 ? TEAM_D : y === 32 ? TEAM : CANVAS));
  b.box(cx - 1, 1, cz - 1, cx + 1, 3, cz + 1, IRON); // the pump head, piped across to the tank
  b.box(cx + 2, 2, cz, 37, 2, cz, IRON_L); for (let y = 2; y < 10; y++) b.set(37, y, cz, IRON_L);
  for (const [x, z] of [[33, 9], [41, 9], [33, 17], [41, 17]]) for (let y = 1; y < 10; y++) b.set(x, y, z, LOG); // the water tank on stilts
  tower(b, 37, 13, 10, 18, () => 5.5, (x, y, z, a) => (y === 18 ? BOARD_D : y === 11 || y === 15 ? IRON : y === 17 ? TEAM : Math.round(a * 6) & 1 ? BOARD : BOARD_L), 1.3);
  for (let y = 11; y <= 18; y++) b.set(42.6, y, 13, y % 2 ? K : 0); // its ladder
  trough(b, 28, 24, 41); barrel(b, 43, 23); barrel(b, 43, 26, 4);
  // the shed, its roof in the side's colour
  roofed(b, 4, 31, 21, 43, 7, (x, y, z) => (z === 43 && x >= 10 && x <= 13 && y < 6 ? (y === 5 ? BOARD_L : K) : x === 21 && y >= 3 && y <= 4 && z % 5 === 2 ? K : y === 1 ? BOARD_D : boards(x, y, z)), teamRoof, false, 0.75);
  railFence(b, 26, 30, 46, 46, (x, z) => z === 30 && x > 33 && x < 39);
  hay(b, 40, 39, 4, 3, 3); hay(b, 41, 40, 2, 2, 4); barrel(b, 2, 44); lantern(b, 23, 44, 9);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Steam Works (the Reactor): a great brick boiler house, its arched windows lit by the fires, two tall chimneys,
// a pair of riveted boilers on brick saddles and a coal heap. Huge power; a huge bang when destroyed. 3 x 3.
function steamWorks(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => ((x > 44 || z > 50) && hash3(x, 1, z) < 0.35 ? (hash3(x, 2, z) < 0.5 ? CINDER : 0x6a5a4a) : 0));
  const wall: Col = (x, y, z) => {
    const face = z === 48 ? x : x === 44 ? z : -1, m = (face - 6 + 600) % 6;
    if (z === 48 && x >= 21 && x <= 29 && y < 12) return y >= 10 || x === 21 || x === 29 ? IRON : y < 3 ? GLOW_L : GLOW; // the firing door, open on the furnaces
    if (face >= 0 && (m === 2 || m === 3) && y >= 5 && y <= 11) return y === 11 ? BRICK[2] : y >= 9 ? GLOW_L : GLOW; // tall lit windows
    if (y <= 1) return STONE[(x + z) % 3];
    if (y === 14 || y === 15) return TEAM; // a painted band under the eaves
    return brick(x, y, z);
  };
  const top = roofed(b, 6, 12, 44, 48, 16, wall, teamRoof, false, 0.55);
  b.box(10, top + 1, 28, 40, top + 2, 32, (x, y, z) => (y === top + 2 ? TEAM_D : x % 3 === 0 ? GLOW : IRON_L)); // a vent along the ridge, glowing
  for (const cx of [14, 36]) tower(b, cx, 20, 1, 36, (y) => (y >= 33 ? 3.8 : 3.2 - y * 0.01), (x, y) => (y >= 35 ? K : y === 30 || y === 31 ? TEAM : brick(x, y, 0)), 1.3); // two tall chimneys
  for (const cz of [24, 38]) { // the boilers: riveted iron drums on brick saddles, their fireboxes glowing at the east end
    for (const x of [51, 58, 65]) b.box(x, 1, cz - 3, x + 1, 2, cz + 3, BRICK[0]);
    for (let x = 48; x <= 68; x++) for (let dy = -5; dy <= 5; dy++) for (let dz = -5; dz <= 5; dz++) {
      const d = Math.hypot(dy, dz); if (d > 4.5) continue;
      b.set(x, 7 + dy, cz + dz, x === 48 || x === 68 ? IRON_D : (x - 48) % 5 === 0 ? IRON_L : dy >= 3 ? 0x44444a : IRON);
    }
    b.box(69, 4, cz - 1, 69, 6, cz + 1, (x, y) => (y === 6 ? IRON : GLOW_L)); b.box(69, 7, cz - 2, 69, 7, cz + 2, IRON_L);
    tower(b, 58, cz, 12, 13, () => 1.7, (x, y) => (y === 13 ? BRASS : BRASS_D), 2); // the steam dome
    tower(b, 66, cz, 12, 20, () => 1.2, (x, y) => (y >= 19 ? K : y === 16 ? TEAM : IRON), 1.2); // its stack
    b.box(45, 9, cz - 1, 47, 10, cz + 1, IRON_L); // piped into the house
  }
  heap(b, 58, 60, 10, 8, 7, (x, y, z, r) => (r < 0.25 ? 0x3a3634 : r < 0.6 ? 0x2a2624 : 0x222020)); // the coal heap
  for (let x = 16; x <= 46; x++) { b.set(x, 1, 56, IRON_L); b.set(x, 1, 59, IRON_L); if (x % 2 === 0) b.box(x, 0, 55, x, 0, 60, BOARD_D); } // a coal tramway
  b.box(28, 2, 56, 33, 4, 59, (x, y) => (y === 4 ? 0x2a2624 : IRON)); // and its tub
  for (const [x, z] of [[8, 58], [16, 58], [8, 66], [16, 66]]) for (let y = 1; y < 9; y++) b.set(x, y, z, LOG); // a water tank on stilts
  tower(b, 12, 62, 9, 16, () => 5.2, (x, y, z, a) => (y === 16 ? BOARD_D : y === 10 || y === 14 ? IRON : Math.round(a * 6) & 1 ? BOARD : BOARD_L), 1.3);
  barrel(b, 22, 64); barrel(b, 25, 64); barrel(b, 23, 67, 4);
  for (const [x, z] of [[2, 30], [46, 2], [2, 52], [68, 46]]) lantern(b, x, z, 11);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Stamp Mill (the Scrapyard): a timber mill stepping down a hillside, ore tipped in at the top from the mine cart,
// a battery of stamps pounding at the open front, a sluice running out east and pale tailings heaped beside. 3 x 2.
function stampMill(): ModelDef {
  const b = new VB();
  ground(b, 71, 47);
  const STRATA = [0x9a6a48, 0x8a5a3c, 0xa87a54];
  for (let x = 0; x <= 27; x++) for (let z = 0; z <= 47; z++) { // the hillside the mill is built against
    const h = Math.min(12, Math.round(12 - (x - 9) * 0.75)) - (hash3(x, 9, z) < 0.3 ? 1 : 0);
    for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? (hash3(x, y, z) < 0.12 ? SAGE : DIRT_L) : STRATA[(y + (hash3(x >> 2, y, z >> 2) < 0.3 ? 1 : 0)) % 3]);
  }
  // the upper house, where ore is tipped in, and the lower house with the stamps: weathered boards, mono-pitch roofs in the side's colour
  b.box(14, 1, 8, 30, 28, 36, (x, y, z) => (x === 14 || x === 30 || z === 8 || z === 36 ? (y >= 22 && y <= 23 && z === 36 && x % 4 === 1 ? K : weathered(x, y, z)) : 0));
  for (let x = 13; x <= 31; x++) { const h = 29 + Math.round((31 - x) * 0.35); for (let z = 7; z <= 37; z++) b.set(x, h, z, teamRoofZ(x, z, false)); if (x >= 14 && x <= 30) for (const z of [8, 36]) for (let y = 29; y < h; y++) b.set(x, y, z, weathered(x, y, z)); }
  b.box(30, 1, 10, 48, 18, 34, (x, y, z) => {
    if (x !== 30 && x !== 48 && z !== 10 && z !== 34) return 0;
    if (z === 34 && x >= 33 && x <= 45 && y <= 15) return 0; // open on the stamps
    return weathered(x, y, z);
  });
  for (let x = 31; x <= 49; x++) { const h = 19 + Math.round((49 - x) * 0.35); for (let z = 9; z <= 35; z++) b.set(x, h, z, teamRoofZ(x, z, false)); if (x <= 48) for (const z of [10, 34]) for (let y = 19; y < h; y++) b.set(x, y, z, weathered(x, y, z)); }
  b.box(33, 1, 29, 45, 3, 33, (x, y) => (y === 3 ? IRON_L : IRON_D)); // the mortar box
  for (let x = 34; x <= 44; x += 2) { b.box(x, 4, 31, x, 4, 31, IRON); for (let y = 5 + (x % 4 ? 2 : 0); y <= 14; y++) b.set(x, y, 31, IRON_L); b.set(x, 11 + (x % 4 ? 2 : 0), 31, BOARD_L); } // the stamps, rising and falling
  b.box(33, 15, 31, 45, 15, 31, IRON); b.box(32, 1, 33, 32, 15, 33, LOG); b.box(46, 1, 33, 46, 15, 33, LOG); // the cam shaft and the frame
  wheel(b, 49, 11, 22, 6.5, 'x', BOARD_L, IRON); // the flywheel on the east wall
  tower(b, 44, 14, 19, 34, () => 1.3, (x, y) => (y >= 33 ? K : y === 28 ? TEAM : IRON), 1.2); // the engine's stack
  // the ore bin on the hill, a cart beside it on its rails, and the chute down into the upper house
  b.box(2, 13, 16, 9, 19, 26, (x, y, z) => (x === 2 || x === 9 || z === 16 || z === 26 ? (y === 18 ? TEAM : boards(x, y, z)) : y === 19 ? (hash3(x, y, z) < 0.2 ? GOLD : 0x7a6a58) : 0));
  for (let z = 28; z <= 46; z++) { b.set(4, 13, z, IRON_L); b.set(7, 13, z, IRON_L); }
  { const c = new VB(); oreCart(c, 0, 0); c.each((x, y, z, col) => b.set(3 + z, 12 + y, 34 + x, col)); }
  for (let i = 0; i <= 8; i++) { const x = 9 + i, y = 19 + Math.round(i * 0.9); b.box(x, y, 20, x, y, 22, BOARD_D); b.set(x, y + 1, 20, BOARD); b.set(x, y + 1, 22, BOARD); }
  // the sluice: a trough on trestles, water in it, falling away east
  for (let x = 50; x <= 70; x++) {
    const y = 9 - Math.round((x - 50) * 0.28);
    b.box(x, y, 21, x, y, 25, BOARD); b.set(x, y + 1, 21, BOARD_D); b.set(x, y + 1, 25, BOARD_D); b.box(x, y + 1, 22, x, y + 1, 24, x % 4 === 0 ? BOARD_L : WATER);
    if (x % 5 === 0) for (let yy = 1; yy < y; yy++) { b.set(x, yy, 21, LOG); b.set(x, yy, 25, LOG); }
  }
  heap(b, 62, 38, 9, 7, 6, (x, y, z, r) => (r < 0.4 ? TAIL_D : TAIL)); heap(b, 60, 9, 7, 6, 4, (x, y, z, r) => (r < 0.4 ? TAIL_D : TAIL)); // tailings
  flag(b, 15, 9, 35, 38, 5);
  barrel(b, 50, 40); barrel(b, 53, 42); lantern(b, 50, 2, 10);
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Gold Mine (the Derrick): a timber head-frame over the shaft with its sheave wheel, the hoist house that winds
// it, ore carts on rails out to the spoil heap, glints of gold in the rock. 2 x 2.
function goldMine(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (x >= 21 && x <= 27 && z >= 21 && z <= 27 ? IRON_D : 0)); // the shaft
  b.box(20, 1, 20, 28, 1, 28, (x, y, z) => (x === 20 || x === 28 || z === 20 || z === 28 ? BOARD_L : 0)); // its collar
  for (let y = 1; y <= 32; y++) { // the head-frame: four legs, braced, banded in the side's colour
    const k = Math.round((32 - y) * 0.06);
    for (const [x, z] of [[20 - k, 20 - k], [28 + k, 20 - k], [20 - k, 28 + k], [28 + k, 28 + k]]) b.set(x, y, z, y % 9 < 2 ? TEAM : LOG_L);
    if (y % 8 === 0) for (let i = 20 - k; i <= 28 + k; i++) for (const e of [20 - k, 28 + k]) { b.set(i, y, e, BOARD); b.set(e, y, i, BOARD); }
  }
  for (let i = 0; i <= 20; i++) { const x = 20 - Math.round(i * 0.7), y = 31 - Math.round(i * 1.45); if (y < 1) break; b.set(x, y, 21, LOG); b.set(x, y, 27, LOG); } // the backstays to the hoist house
  b.box(19, 32, 19, 29, 32, 29, (x, y, z) => (x === 19 || x === 29 || z === 19 || z === 29 ? BOARD_D : 0));
  b.box(23, 33, 23, 25, 33, 25, IRON);
  wheel(b, 24, 37, 24, 4.6, 'z', TEAM, IRON); // the sheave wheel, its spokes in the side's colour
  for (let y = 2; y < 33; y++) b.set(27, y, 24, K); // the rope down the shaft, and back to the drum
  wire(b, [20, 37, 24], [12, 6, 24], 0);
  b.box(20, 25, 29, 28, 28, 29, (x, y) => (y === 25 || y === 28 || x === 20 || x === 28 ? TEAM_D : (x + y) % 3 === 0 ? TEAM_L : TEAM)); // a painted board across the front
  roofed(b, 2, 16, 13, 32, 8, (x, y, z) => (x === 13 && z >= 22 && z <= 26 && y < 6 ? (y === 5 ? BOARD_L : K) : y === 1 ? BOARD_D : boards(x, y, z)), teamRoofZ, true, 0.8); // the hoist house
  tower(b, 5, 19, 9, 20, () => 1.2, (x, y) => (y >= 19 ? K : IRON), 1.2);
  for (let x = 29; x <= 47; x++) { if (x % 2 === 0) b.box(x, 0, 22, x, 0, 26, BOARD_D); b.set(x, 1, 23, IRON_L); b.set(x, 1, 26, IRON_L); } // the rails
  oreCart(b, 32, 23); oreCart(b, 40, 23);
  heap(b, 37, 9, 9, 7, 8, (x, y, z, r) => (r < 0.05 ? GOLD : r < 0.4 ? 0x7a5a40 : r < 0.75 ? 0x8a6a4c : 0x6a4a34)); // the spoil heap
  heap(b, 41, 38, 4, 3, 3, (x, y, z, r) => (r < 0.25 ? GOLD : 0x7a6a58)); // a pile of good ore
  crate(b, 33, 41, 3, 3, 3); barrel(b, 4, 36); barrel(b, 7, 36); barrel(b, 5, 39, 4); lantern(b, 30, 30, 10); lantern(b, 44, 18, 9);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Saloon (the Barracks): a two-storey clapboard saloon behind a tall false front painted in the side's colour with
// its sign, a balcony over the boardwalk, swinging doors, a hitching rail and a flag. 2 x 2.
function saloon(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  const wall: Col = (x, y, z) => {
    const front = z === 34, side = x === 40, along = front ? x : z, m = along % 6;
    if (front && x >= 21 && x <= 25 && y <= 7) return y === 7 ? BOARD_L : y >= 2 && y <= 5 && x !== 23 ? (y === 2 || y === 5 ? BOARD_D : BOARD_L) : K; // the swinging doors
    if ((front || side) && (m === 2 || m === 3) && ((y >= 2 && y <= 6) || (y >= 12 && y <= 16))) return y === 6 || y === 16 ? PAINT : y >= 14 || (y >= 4 && y <= 5) ? GLOW_L : K;
    if (y === 9) return BOARD_D;
    return y % 2 ? BOARD_L : BOARD;
  };
  roofed(b, 6, 8, 40, 34, 19, wall, shingles, true, 0.4);
  b.box(5, 18, 35, 41, 27, 35, (x, y) => { // the false front, stepped up in the middle
    if (y >= 26 && (x < 14 || x > 32)) return 0;
    if (y >= 21 && y <= 24 && x >= 10 && x <= 36) return y === 21 || y === 24 || x === 10 || x === 36 ? TEAM_D : (x + y * 3) % 5 === 0 || (x % 3 === 0 && y === 22) ? K : PAINT; // the sign
    return y === 27 || (y === 25 && (x < 14 || x > 32)) ? TEAM_D : TEAM;
  });
  b.box(14, 28, 35, 32, 28, 35, (x) => (x === 14 || x === 32 ? 0 : TEAM_D)); b.box(21, 29, 35, 25, 29, 35, TEAM_D);
  b.box(4, 1, 35, 42, 1, 43, (x, y, z) => (z % 2 ? BOARD : BOARD_L)); // the boardwalk
  b.box(6, 10, 35, 40, 10, 41, (x, y, z) => (z % 2 ? BOARD_D : BOARD)); // the balcony, its rail painted
  for (let x = 6; x <= 40; x++) { b.set(x, 13, 41, TEAM); if (x % 3 === 0) { b.set(x, 11, 41, BOARD_L); b.set(x, 12, 41, BOARD_L); } }
  for (let z = 35; z <= 41; z++) for (const x of [6, 40]) { b.set(x, 13, z, TEAM); if (z % 3 === 0) { b.set(x, 11, z, BOARD_L); b.set(x, 12, z, BOARD_L); } }
  for (const x of [6, 14, 22, 24, 32, 40]) for (let y = 2; y < 10; y++) b.set(x, y, 41, BOARD_D); // its posts
  for (const x of [8, 18]) for (let y = 1; y <= 3; y++) b.set(x, y, 46, LOG); b.box(8, 3, 46, 18, 3, 46, LOG_L); // the hitching rail
  horse(b, 9, 44); trough(b, 26, 44, 34);
  flag(b, 44, 44, 1, 28, 7, true);
  roofed(b, 40, 1, 44, 5, 7, (x, y, z) => (z === 5 && x === 42 && y >= 5 && y <= 6 ? K : boards(x, y, z)), shingles, true, 0.8, 0); // the outhouse
  for (const [x, z] of [[2, 2], [5, 2], [2, 5]]) barrel(b, x, z, 4); crate(b, 10, 2, 4, 3, 3); crate(b, 11, 3, 2, 2, 5);
  lantern(b, 2, 40, 10);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Wagon Works and Livery (the Vehicle Depot): a big barn under a gambrel roof in the side's colour, wide doors, a
// hay loft and its hoist, a covered wagon in the yard, wheels stacked against the wall and a horse in the corral. 3 x 3.
function wagonWorks(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => (z > 45 && x < 34 && hash3(x, 3, z) < 0.1 ? HAY_D : 0));
  const x0 = 6, x1 = 58, z0 = 6, z1 = 42, wallH = 15, zm = 24;
  b.box(x0, 1, z0, x1, wallH, z1, (x, y, z) => {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) return 0;
    if (z === z1 && ((x >= 12 && x <= 28) || (x >= 36 && x <= 52)) && y <= 13) { // the two big doors, white X braces
      const lx = x < 30 ? x - 12 : x - 36, d1 = Math.abs(lx - (y - 1) * 16 / 12), d2 = Math.abs(16 - lx - (y - 1) * 16 / 12);
      return y === 13 || lx === 0 || lx === 16 || lx === 8 || d1 < 1 || d2 < 1 ? CANVAS_D : x < 30 ? K : BOARD;
    }
    return y === 1 ? BOARD_D : weathered(x, y, z);
  });
  for (let z = z0 - 1; z <= z1 + 1; z++) { // the gambrel roof
    const dz = Math.abs(z - zm), ry = dz > 10 ? Math.round((19 - dz) * 1.3) : 12 + Math.round((10 - dz) * 0.5);
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      b.set(x, wallH + 1 + ry, z, dz < 1 ? TEAM_D : x % 4 === 0 ? TEAM_D : TEAM);
      if (x === x0 || x === x1) for (let y = wallH + 1; y < wallH + 1 + ry; y++) b.set(x, y, z, x === x1 && y >= 19 && y <= 26 && dz <= 3 ? (y === 26 || dz === 3 ? CANVAS_D : y < 21 ? HAY : K) : weathered(x, y, z)); // the hay loft door
    }
  }
  b.box(59, 28, 24, 63, 28, 24, LOG_L); for (let y = 21; y < 28; y++) b.set(63, y, 24, ROPE); b.box(62, 18, 23, 64, 20, 25, HAY); // the loft hoist and a bale on it
  b.box(30, 34, 22, 34, 36, 26, (x, y, z) => (y === 35 && (x + z) % 2 === 0 ? K : CANVAS)); b.box(29, 37, 21, 35, 37, 27, TEAM_D); // a cupola
  for (const cz of [11, 18, 25, 32]) wheel(b, 4, 5, cz, 3.8, 'x'); // wheels stacked against the west wall
  for (const [x, z] of [[60, 8], [60, 14]]) wheel(b, x, 5, z, 3.8, 'x');
  // the covered wagon: a bed with a painted side, two pairs of wheels, a canvas bonnet on its hoops
  b.box(10, 4, 51, 26, 6, 59, (x, y, z) => (z === 51 || z === 59 ? (y === 5 ? TEAM : BOARD) : y === 4 ? BOARD_D : 0));
  for (const x of [12, 24]) for (const z of [50, 60]) wheel(b, x, 4, z, 3.6, 'z');
  for (let z = 51; z <= 59; z++) { const h = 7 + Math.round(Math.sqrt(Math.max(0, 1 - ((z - 55) / 4.6) ** 2)) * 6); for (let x = 11; x <= 25; x++) { b.set(x, h, z, x % 4 === 3 ? CANVAS_D : CANVAS); if (x === 11 || x === 25) for (let y = 7; y < h; y++) b.set(x, y, z, x === 25 && Math.abs(z - 55) < 2 ? K : CANVAS_D); } }
  b.box(27, 3, 55, 33, 3, 55, BOARD_D);
  railFence(b, 36, 47, 70, 70, (x, z) => z === 47 && x > 49 && x < 55); // the corral
  horse(b, 54, 58); horse(b, 42, 62, 0x5a4030); trough(b, 58, 66, 67); hay(b, 38, 50, 4, 3, 3);
  for (let y = 1; y <= 4; y++) b.box(4, y, 63 + (y % 2), 22, y, 66 + (y % 2), (x, yy, z) => (x % 5 === 0 ? BOARD_D : BOARD_L)); // a lumber pile
  barrel(b, 30, 64); barrel(b, 30, 67, 4); lantern(b, 2, 46, 11); lantern(b, 34, 44, 11);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Blacksmith (the Workshop): an open forge shed, its coals glowing under a brick chimney, anvil, bellows and quench
// barrel, a horseshoe sign in the side's colour, wheels and iron about, a wagon up on blocks in the yard. 2 x 2.
function blacksmith(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (x < 22 && z < 22 && hash3(x, 4, z) < 0.3 ? CINDER : 0));
  const wall: Col = (x, y, z) => {
    if (z === 6 || x === 4) return y === 1 ? BOARD_D : boards(x, y, z);
    if ((x === 30 && (z === 18 || z === 30)) || (z === 30 && (x === 17 || x === 30))) return LOG; // posts
    return y >= 11 ? BOARD_D : 0; // a beam round the open sides
  };
  roofed(b, 4, 6, 30, 30, 12, wall, teamRoof, false, 0.5);
  b.box(7, 1, 8, 14, 4, 14, (x, y, z) => (y === 4 && x >= 9 && x <= 12 && z >= 9 && z <= 13 ? (hash3(x, y, z) < 0.4 ? GLOW_L : GLOW) : STONE[(x + y + z) % 3])); // the hearth, coals glowing
  b.box(8, 9, 8, 13, 10, 13, brick); b.box(9, 11, 8, 12, 12, 12, brick); b.box(9, 13, 8, 11, 25, 10, (x, y, z) => (y >= 24 ? K : brick(x, y, z))); // the hood and chimney
  b.box(15, 3, 9, 18, 3, 11, LEATHER); b.box(15, 4, 10, 17, 4, 10, LEATHER); b.box(19, 3, 10, 19, 3, 10, BOARD_D); // bellows
  tower(b, 20, 18, 1, 3, () => 1.6, (x, y) => (y === 3 ? LOG_END : LOG), 2); // the anvil on its stump
  b.box(18, 4, 17, 22, 4, 19, IRON); b.box(19, 5, 17, 22, 5, 19, IRON_L); b.box(23, 5, 18, 24, 5, 18, IRON_L);
  barrel(b, 23, 9, 3); b.set(23, 3, 9, WATER); b.set(24, 3, 10, WATER); // the quench barrel
  for (let y = 5; y <= 8; y++) for (let x = 16; x <= 26; x += 2) if ((x + y) % 3) b.set(x, y, 7, IRON_L); // tongs and hammers on the back wall
  b.box(14, 8, 32, 20, 12, 32, (x, y) => (x === 14 || x === 20 || y === 8 || y === 12 ? TEAM_D : TEAM)); // the sign, a horseshoe on it
  for (const [x, y] of [[15, 11], [15, 10], [16, 9], [17, 9], [18, 9], [19, 10], [19, 11]]) b.set(x, y, 33, IRON_L);
  b.box(17, 12, 31, 17, 12, 32, IRON);
  wheel(b, 8, 5, 32, 3.8); wheel(b, 25, 5, 32, 3.8); // wheels leaning on the front
  for (let y = 1; y <= 3; y++) b.box(24, y, 23, 28, y, 27, (x, yy, z) => ((x + z + yy) % 2 ? IRON_L : 0)); // a rack of bar iron
  heap(b, 7, 18, 3, 2, 3, (x, y, z, r) => (r < 0.5 ? CINDER : CINDER_D)); // coal
  // the wagon in the yard, one corner on a block, its wheel off and lying by
  b.box(32, 4, 35, 44, 5, 42, (x, y, z) => (z === 35 || z === 42 || x === 32 || x === 44 ? (y === 5 ? TEAM_D : BOARD) : y === 4 ? BOARD_D : 0));
  wheel(b, 34, 4, 34, 3.6); wheel(b, 34, 4, 43, 3.6); wheel(b, 42, 4, 43, 3.6); b.box(41, 1, 33, 43, 3, 35, LOG_L);
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { const d = Math.hypot(dx, dz); if (d <= 3.8 && (d > 2.8 || d < 1.2 || (dx === 0 || dz === 0))) b.set(40 + dx, 1, 30 + dz - 2, d > 2.8 ? IRON_L : BOARD_L); }
  b.box(45, 3, 38, 46, 3, 39, BOARD_D);
  wheel(b, 38, 4, 12, 3, 'x', STONE[1], STONE[2]); b.box(37, 1, 9, 39, 1, 15, BOARD_D); b.box(37, 2, 11, 39, 3, 11, LOG); b.box(37, 2, 13, 39, 3, 13, LOG); // a grindstone
  horse(b, 33, 22); for (let y = 1; y <= 4; y++) b.set(45, y, 23, LOG);
  lantern(b, 2, 40, 10);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Balloon Field (the Airfield): a flat field with whitewashed rings of stones, a great striped canvas balloon shed,
// a balloon up on its tethers and another being filled, a timber mooring mast and a windsock. 3 x 3.
function balloonField(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => { const h = hash3(x, 5, z); return h < 0.25 ? 0xb8a070 : h < 0.3 ? SAGE : DIRT_L; });
  for (const [cx, cz] of [[48, 22], [48, 52]]) b.box(cx - 10, 0, cz - 10, cx + 10, 0, cz + 10, (x, y, z) => { const d = Math.hypot(x - cx, z - cz); return d < 9.5 && d > 8.5 && (x + z) % 2 === 0 ? 0xf0ece0 : 0; });
  for (let x = 4; x <= 30; x++) for (let z = 8; z <= 62; z++) { // the shed: canvas on a barrel of timber ribs, striped in the side's colour
    const dx = (x - 17) / 13, top = Math.round(Math.sqrt(Math.max(0, 1 - dx * dx)) * 18);
    if (z === 8 || z === 62) for (let y = 1; y <= top; y++) b.set(x, y, z, z === 62 && Math.abs(x - 17) < 8 && y < 14 ? K : CANVAS_D);
    b.set(x, Math.max(1, top), z, (z - 8) % 9 === 0 ? LOG_L : (z >> 2) % 2 ? TEAM : CANVAS);
  }
  // the balloon up: a striped envelope, ropes down to a wicker basket, tethered to stakes
  tower(b, 48, 52, 5, 22, (y) => (y >= 14 ? Math.sqrt(Math.max(0, 64 - (y - 14) ** 2)) : 2.5 + (y - 5) * 0.6), (x, y, z, a) => (y >= 21 ? TEAM_D : y === 9 ? BRASS_D : y === 14 || y === 15 ? CANVAS : Math.round(a * 12 / (Math.PI * 2)) % 2 ? TEAM : TEAM_L), 2.2);
  b.box(46, 1, 50, 50, 3, 54, (x, y, z) => (y === 3 ? LEATHER : (x + y) % 2 ? WICKER : 0x8a6a3a));
  for (const [x, z] of [[46, 50], [50, 50], [46, 54], [50, 54]]) wire(b, [x, 4, z], [48 + (x - 48) * 0.8, 5, 52 + (z - 52) * 0.8], 0, ROPE);
  for (const [x, z] of [[40, 44], [56, 60]]) { wire(b, [x, 1, z], [48 + (x - 48) * 0.4, 8, 52 + (z - 52) * 0.4], -0.5, ROPE); b.set(x, 1, z, LOG_END); }
  // the other being filled: an envelope lying on the field, a hose to the gas wagon
  for (let x = 37; x <= 59; x++) for (let z = 15; z <= 29; z++) { const e = ((x - 48) / 11) ** 2 + ((z - 22) / 7) ** 2; if (e > 1) continue; const h = 1 + Math.round(Math.sqrt(1 - e) * 4); b.set(x, h, z, Math.floor((x - 37) / 3) % 2 ? TEAM : CANVAS); if (h > 1) b.set(x, h - 1, z, CANVAS_D); }
  b.box(57, 3, 31, 66, 4, 37, BOARD_D); for (const x of [59, 64]) for (const z of [30, 38]) wheel(b, x, 3, z, 2.6, 'z');
  for (const x of [58, 61, 64]) tower(b, x + 0.5, 34, 5, 9, () => 1.6, (xx, y) => (y === 6 || y === 9 ? IRON : BOARD_L), 2);
  wire(b, [58, 6, 33], [55, 2, 25], -1, LEATHER);
  // the mooring mast: a timber lattice, a ring at the top and a pennant
  for (let y = 1; y <= 20; y++) { const s = Math.round(3 - y * 0.1); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.set(63 + sx * s, y, 9 + sz * s, y % 6 < 2 ? TEAM : LOG_L); if (y % 4 === 0) for (let k = -s; k <= s; k++) for (const e of [-s, s]) { b.set(63 + k, y, 9 + e, BOARD); b.set(63 + e, y, 9 + k, BOARD); } }
  b.box(61, 20, 7, 65, 20, 11, BOARD_D); tower(b, 63, 9, 21, 21, () => 1.5, () => BRASS, 2); b.set(63, 22, 9, IRON); b.box(64, 23, 9, 68, 23, 9, TEAM); b.box(64, 22, 9, 66, 22, 9, TEAM_D); b.set(63, 23, 9, IRON);
  for (let y = 1; y < 16; y++) b.set(66, y, 68, LOG_L); b.box(67, 13, 68, 70, 15, 68, (x) => (x % 2 ? TEAM : CANVAS)); // windsock
  crate(b, 34, 64, 4, 4, 4); crate(b, 38, 65, 3, 3, 3); for (let x = 52; x <= 58; x += 2) b.box(x, 1, 66, x + 1, 1, 70, IRON_L); // gas cylinders
  for (let z = 3; z <= 68; z += 6) b.set(34, 1, z, LOG_END); lantern(b, 69, 40, 12);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Ironworks (the Proving Ground): a brick foundry hall with molten light pouring from its great doors, a stone blast
// furnace with its hoist, a timber gantry crane over the yard lifting an iron plate, a great gun barrel on trestles. 3 x 3.
function ironworks(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => (hash3(x, 6, z) < 0.3 ? CINDER : 0));
  const wall: Col = (x, y, z) => {
    if (z === 44 && x >= 12 && x <= 38 && y <= 18) return y === 18 || x === 12 || x === 38 ? IRON : y <= 2 ? GLOW_L : y <= 5 ? GLOW : 0x5a2a1a; // the great doors, open on the pour
    const face = z === 44 ? x : x === 46 ? z : -1, m = (face + 600) % 6;
    if (face >= 0 && (m === 2 || m === 3) && y >= 8 && y <= 16) return y === 16 ? BRICK[2] : y >= 14 ? GLOW_L : GLOW;
    if (y <= 1) return STONE[(x + z) % 3];
    if (y === 20 || y === 21) return TEAM;
    return brick(x, y, z);
  };
  const top = roofed(b, 4, 4, 46, 44, 22, wall, teamRoof, false, 0.35);
  b.box(6, top + 1, 21, 44, top + 2, 27, (x, y, z) => (y === top + 2 ? TEAM_D : (z === 21 || z === 27) && x % 3 === 0 ? GLOW : IRON_L)); // a monitor along the ridge
  b.box(5, top + 3, 20, 45, top + 3, 28, (x, y, z) => (z === 20 || z === 28 ? TEAM_D : TEAM));
  // the blast furnace: a stone stack banded in iron, glowing at the tap, a runner of molten iron
  tower(b, 58, 15, 1, 34, (y) => 8 - y * 0.11, (x, y, z) => (y >= 33 ? IRON : y === 30 || y === 31 ? TEAM : y % 6 === 0 ? IRON_L : STONE[(x + y + z) % 3]), 1.4);
  b.box(57, 1, 22, 59, 3, 23, (x, y) => (y === 3 ? STONE[0] : GLOW_L)); b.box(58, 0, 24, 58, 0, 30, GLOW_L); b.box(56, 1, 31, 60, 3, 34, (x, y, z) => (y === 3 && x > 56 && x < 60 && z > 31 && z < 34 ? GLOW_L : IRON)); // tap, runner, ladle
  for (let y = 1; y <= 36; y++) for (const [x, z] of [[66, 3], [70, 3], [66, 7], [70, 7]]) b.set(x, y, z, y % 7 < 2 ? TEAM : LOG_L); // the hoist tower
  b.box(66, 36, 3, 70, 36, 7, BOARD_D); b.box(62, 35, 4, 66, 35, 6, BOARD); b.box(67, 12, 4, 69, 14, 6, IRON_L); for (let y = 15; y < 36; y++) b.set(68, y, 5, K); // its bridge, a skip on its rope
  // the gantry crane over the yard
  for (const [x, z] of [[53, 45], [69, 45], [53, 69], [69, 69]]) for (let y = 1; y <= 30; y++) b.set(x, y, z, y % 6 < 2 ? TEAM : LOG_L);
  for (const x of [53, 69]) b.box(x, 31, 45, x, 32, 69, TEAM); b.box(53, 31, 56, 69, 32, 58, (x) => (x % 3 === 0 ? TEAM_D : BOARD));
  for (let y = 17; y < 31; y++) b.set(61, y, 57, K); b.box(56, 15, 54, 66, 16, 60, (x, y, z) => (y === 16 ? IRON_L : IRON)); // an iron plate on the hook
  for (let y = 1; y <= 4; y++) b.box(55 + (y % 2), y, 61, 66 - (y % 2), y, 68, (x, yy) => (yy % 2 ? IRON : IRON_L)); // plates stacked
  // a great gun barrel finished on its trestles
  for (let x = 6; x <= 32; x++) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) { const r = x >= 30 ? 3.4 : 3.4 - (x - 6) * 0.04, d = Math.hypot(dy, dz); if (d > r) continue; b.set(x, 6 + dy, 56 + dz, x === 32 && d < 1.5 ? K : dy >= 2 && Math.abs(dz) < 2 ? IRON_L : IRON); }
  for (const x of [10, 26]) b.box(x, 1, 52, x + 1, 3, 60, BOARD_D);
  heap(b, 40, 62, 7, 6, 5, (x, y, z, r) => (r < 0.4 ? CINDER_D : CINDER)); // coke
  for (const [x, z] of [[2, 50], [48, 2], [50, 68]]) lantern(b, x, z, 12);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Telegraph Office (the Radar Tower): a clapboard office behind a false front in the side's colour, a tall timber
// lookout tower with a lamp at the top, and telegraph poles carrying wires off across the country. 2 x 2.
function telegraph(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  const wall: Col = (x, y, z) => {
    if (z === 40 && x >= 14 && x <= 16 && y <= 6) return y === 6 ? BOARD_L : K; // door
    if ((z === 40 || x === 24) && y >= 3 && y <= 5 && ((z === 40 ? x : z) % 6 === 2 || (z === 40 ? x : z) % 6 === 3) && !(z === 40 && x >= 13 && x <= 17)) return y === 5 ? PAINT : GLOW_L;
    return y === 1 ? GREY_D : y % 2 ? PAINT : PAINT_D;
  };
  roofed(b, 6, 26, 24, 40, 9, wall, shingles, true, 0.5);
  b.box(5, 8, 41, 25, 15, 41, (x, y) => (y >= 10 && y <= 13 && x >= 8 && x <= 22 ? (y === 10 || y === 13 || x === 8 || x === 22 ? TEAM_D : (x * 2 + y) % 4 === 0 ? K : PAINT) : y === 15 ? TEAM_D : TEAM)); // the false front and its sign
  b.box(5, 7, 42, 25, 7, 45, (x, y, z) => (z === 45 ? TEAM_D : SHINGLE)); for (const x of [5, 15, 25]) for (let y = 1; y < 7; y++) b.set(x, y, 45, BOARD_D); // the porch
  b.box(5, 0, 42, 25, 0, 44, (x, y, z) => (z % 2 ? BOARD : BOARD_L));
  // the lookout tower
  const cx = 34, cz = 10;
  for (let y = 1; y <= 35; y++) { const s = Math.round(6 - y * 0.07); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.set(cx + sx * s, y, cz + sz * s, y % 9 < 2 ? TEAM : LOG_L); if (y % 6 === 0) for (let k = -s; k <= s; k++) for (const e of [-s, s]) { b.set(cx + k, y, cz + e, BOARD); b.set(cx + e, y, cz + k, BOARD); } else { const k = Math.round(-s + ((y % 6) / 6) * 2 * s); b.set(cx + k, y, cz + s, BOARD_D); b.set(cx + s, y, cz - k, BOARD_D); } }
  for (let y = 1; y <= 35; y++) b.set(cx, y, cz + 5.6, y % 2 ? K : 0); // ladder
  b.box(cx - 4, 36, cz - 4, cx + 4, 38, cz + 4, (x, y, z) => (y === 36 ? BOARD_D : x === cx - 4 || x === cx + 4 || z === cz - 4 || z === cz + 4 ? (y === 38 ? TEAM_D : TEAM) : 0)); // its cabin, half-walled
  for (const [x, z] of [[cx - 4, cz - 4], [cx + 4, cz - 4], [cx - 4, cz + 4], [cx + 4, cz + 4]]) for (let y = 39; y <= 41; y++) b.set(x, y, z, LOG);
  for (let i = 0; i <= 4; i++) b.box(cx - 5 + i, 42 + i, cz - 5 + i, cx + 5 - i, 42 + i, cz + 5 - i, (x, y, z) => (i === 4 || x === cx - 5 + i || x === cx + 5 - i || z === cz - 5 + i || z === cz + 5 - i ? shingles(x, z, false) : 0));
  b.set(cx, 47, cz, LAMP); b.set(cx, 39, cz, LAMP);
  // telegraph poles and their wires
  const pole = (x: number, z: number) => { for (let y = 1; y <= 17; y++) b.set(x, y, z, LOG); b.box(x - 2, 16, z, x + 2, 16, z, BOARD_D); b.set(x - 2, 17, z, GLASS); b.set(x + 2, 17, z, GLASS); };
  pole(43, 44); pole(43, 24);
  wire(b, [45, 17, 44], [45, 17, 24], 2, 0x3a3430); wire(b, [41, 17, 24], [cx + 4, 36, cz + 4], 1, 0x3a3430); wire(b, [41, 17, 44], [24, 16, 33], 1.5, 0x3a3430);
  horse(b, 30, 30); for (let y = 1; y <= 4; y++) b.set(42, y, 31, LOG);
  barrel(b, 2, 38); crate(b, 26, 42, 3, 3, 2); lantern(b, 28, 44, 9);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Lightning Tower (the Interceptor Battery): a copper coil on a log crib, a fat copper ring and rods up top to catch
// what falls from the sky, battery jars and a control shack cabled to it, earth banks on two sides. 2 x 2.
function lightningTower(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  for (let x = 1; x <= 46; x++) for (let z = 1; z <= 46; z++) { const d = Math.min(x, z); if (d > 6) continue; const h = Math.min(5, 7 - d); for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? (hash3(x, y, z) < 0.2 ? SAGE : DIRT_L) : y % 2 ? DIRT_D : 0x9a7a52); } // earth banks
  b.box(19, 1, 19, 35, 6, 35, (x, y, z) => (x === 19 || x === 35 || z === 19 || z === 35 ? (y === 6 ? TEAM : (x === 19 || x === 35) && (z === 19 || z === 35) ? LOG_END : logs(x, y, z)) : y === 6 ? (x % 2 ? BOARD : BOARD_L) : 0)); // the crib
  for (const [x, z] of [[20, 20], [34, 20], [20, 34], [34, 34]]) { for (let y = 7; y <= 11; y++) b.set(x, y, z, TEAM_D); b.set(x, 12, z, GLASS); } // painted posts with insulators
  tower(b, 27, 27, 7, 8, () => 6, (x, y, z, a) => (y === 8 ? COPPER_L : COPPER_D), 1.4); // the primary
  tower(b, 27, 27, 9, 18, () => 2.6, (x, y) => (y % 2 ? COPPER : COPPER_D), 3); // the coil
  tower(b, 27, 27, 19, 20, () => 5.5, (x, y, z) => (y === 20 ? COPPER_L : COPPER), 2.2, true); // the ring
  b.box(26, 19, 26, 28, 20, 28, COPPER_D);
  for (let y = 21; y <= 25; y++) b.set(27, y, 27, COPPER_L); b.set(27, 26, 27, EMP_L); // the rods, the main one tipped with light
  for (const [x, z] of [[23, 23], [31, 23], [23, 31], [31, 31]]) { for (let y = 21; y <= 22; y++) b.set(x, y, z, COPPER_L); b.set(x, 23, z, EMP); }
  roofed(b, 4, 34, 15, 45, 6, (x, y, z) => (x === 15 && z >= 38 && z <= 40 && y < 5 ? K : y === 1 ? BOARD_D : boards(x, y, z)), teamRoof, false, 0.8); // the shack
  for (let x = 36; x <= 44; x += 2) for (let z = 38; z <= 44; z += 2) { b.set(x, 1, z, GLASS); b.set(x, 2, z, COPPER); } // battery jars
  b.box(16, 1, 40, 35, 1, 40, K); b.box(27, 1, 36, 27, 1, 40, K); // cables
  b.box(34, 2, 4, 44, 3, 9, BOARD_D); for (const z of [5, 8]) b.box(35, 4, z, 43, 4, z, COPPER_L); for (const x of [36, 42]) for (const z of [3, 10]) wheel(b, x, 2, z, 1.8); // spare rods on a cart
  lantern(b, 45, 20, 10);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Tesla Cannon (the EMP Cannon): a towering copper-wound coil mast on a brick base, three coil rings, a ball of blue
// light at the top, four great Leyden jars cabled to its foot and a brick control house. 3 x 3.
function teslaCannon(): ModelDef {
  const b = new VB();
  ground(b, 71, 71);
  tower(b, 36, 36, 1, 4, () => 17, (x, y, z) => (y === 4 ? STONE[1] : STONE[(x + y + z) % 3]), 17); // a round stone plinth
  tower(b, 36, 36, 5, 9, () => 10, (x, y, z) => (y >= 8 ? (y === 9 ? TEAM_D : TEAM) : brick(x, y, z)), 10); // the brick base, a band in the side's colour
  tower(b, 36, 36, 10, 48, (y) => 5.5 - (y - 10) * 0.05, (x, y) => (y % 6 === 0 ? BOARD_D : y % 2 ? COPPER : COPPER_L), 6); // the mast, wound in copper
  for (const [y, r] of [[16, 12], [27, 10], [38, 8]]) tower(b, 36, 36, y, y + 1, () => r, (x, yy) => (yy === y ? COPPER_L : COPPER_D), 1.6, true); // the coil rings
  for (const [y, r] of [[16, 12], [27, 10], [38, 8]]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; for (let d = 6; d < r; d++) b.set(36 + Math.round(Math.cos(a) * d), y, 36 + Math.round(Math.sin(a) * d), BOARD_D); }
  dome(b, 36, 49, 36, 6, (x, y, z) => (y > 53 || hash3(x, y, z) < 0.25 ? EMP_L : EMP)); dome(b, 36, 49, 36, 4, () => EMP_L); // the ball of light
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) if (Math.hypot(dx, dz) <= 6) b.set(36 + dx, 48, 36 + dz, Math.hypot(dx, dz) > 5 ? COPPER_D : EMP);
  for (const [x, z] of [[10, 10], [62, 10], [10, 62], [62, 62]]) { // Leyden jars: glass, foiled in copper below, a brass rod and knob
    tower(b, x, z, 1, 10, () => 4.6, (xx, y) => (y === 10 ? BOARD_D : y === 6 ? TEAM : y < 6 ? COPPER : GLASS), 5);
    for (let y = 11; y <= 13; y++) b.set(x, y, z, BRASS); b.set(x, 14, z, EMP);
    const n = Math.max(Math.abs(36 - x), Math.abs(36 - z)); for (let i = 0; i <= n; i++) b.set(Math.round(x + ((36 - x) * i) / n), 1, Math.round(z + ((36 - z) * i) / n), K);
  }
  roofed(b, 50, 26, 60, 40, 7, (x, y, z) => (x === 60 && z >= 31 && z <= 33 && y < 6 ? K : x === 60 && y >= 4 && y <= 5 && z % 4 === 1 ? EMP : brick(x, y, z)), teamRoofZ, true, 0.7); // the control house
  lantern(b, 4, 36, 12); lantern(b, 68, 36, 12);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Wooden Watchtower (the Guard Tower): a lookout on four splayed log stilts, a half-walled platform painted in the
// side's colour, a shingle roof, a rifle poking out east. 1 x 1.
function watchtower(): ModelDef {
  const b = new VB();
  for (let x = 1; x <= 23; x++) for (let z = 1; z <= 23; z++) { const d = Math.hypot(x - 12, z - 12); if (d > 11.2) continue; b.set(x, 0, z, d > 10.3 ? STONE[(x + z) % 3] : dirt(x, z)); if (d > 10.3 && (x + z) % 3 === 0) b.set(x, 1, z, STONE[(x * z) % 3]); } // a pad ringed in stones
  const leg = (x: number, z: number, y: number): [number, number] => { const k = Math.round((18 - y) * 0.12); return [x < 12 ? x - k : x + k, z < 12 ? z - k : z + k]; };
  for (let y = 1; y < 18; y++) for (const [x, z] of [[6, 6], [17, 6], [6, 17], [17, 17]]) { const [lx, lz] = leg(x, z, y); b.set(lx, y, lz, y === 1 ? LOG_END : LOG_L); }
  for (let y = 2; y < 17; y++) { const f = ((y - 2) % 7) / 7, a = Math.round(6 + f * 11); for (const p of [a]) { b.set(p, y, 5.5, BOARD_D); b.set(p, y, 18.5, BOARD_D); b.set(5.5, y, p, BOARD_D); b.set(18.5, y, p, BOARD_D); } } // braces
  for (let y = 1; y < 18; y++) { b.set(11, y, 19, LOG); b.set(13, y, 19, LOG); if (y % 2) b.set(12, y, 19, BOARD_L); } // ladder
  b.box(4, 18, 4, 19, 18, 19, (x, y, z) => (x === 4 || x === 19 || z === 4 || z === 19 ? BOARD_D : x % 2 ? BOARD : BOARD_L)); // floor
  b.box(4, 19, 4, 19, 22, 19, (x, y, z) => { // half walls, painted, a firing gap
    if (x !== 4 && x !== 19 && z !== 4 && z !== 19) return 0;
    if ((x === 4 || x === 19) && (z === 4 || z === 19)) return LOG;
    if (y === 21 && (x + z) % 4 !== 0) return 0;
    return y === 22 ? TEAM_D : (x + z) % 5 === 0 ? TEAM_D : TEAM;
  });
  for (const [x, z] of [[4, 4], [19, 4], [4, 19], [19, 19]]) for (let y = 23; y <= 26; y++) b.set(x, y, z, LOG);
  for (let i = 0; i <= 4; i++) b.box(3 + i * 2, 27 + i, 3 + i * 2, 20 - i * 2, 27 + i, 20 - i * 2, (x, y, z) => (x === 3 + i * 2 || x === 20 - i * 2 || z === 3 + i * 2 || z === 20 - i * 2 ? SHINGLE_D : shingles(x, z, false))); // the roof
  b.set(11, 32, 11, TEAM); b.set(12, 32, 11, TEAM); b.set(11, 32, 12, TEAM_D); // a painted finial
  b.box(17, 21, 12, 18, 21, 12, LEATHER); b.box(19, 21, 12, 23, 21, 12, IRON); // the rifle
  b.set(5, 25, 5, LAMP);
  barrel(b, 8, 21); barrel(b, 15, 20); b.box(3, 1, 9, 5, 2, 12, (x, y) => (y === 2 ? BOARD_L : BOARD_D));
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Cannon Redoubt (the Cannon Emplacement): a low ring of earth faced inside with logs, their tops painted, round a
// plank deck with a traversing rail; a log-framed powder magazine in the bank, shot piled ready. The turret is a big
// black iron cannon on a carriage painted in the side's colour. 2 x 2.
function redoubt(): ModelDef {
  const b = new VB();
  for (let y = 0; y < 7; y++) for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
    const d = Math.max(Math.abs(x - 23.5), Math.abs(z - 23.5)) * 0.7 + Math.hypot(x - 23.5, z - 23.5) * 0.35;
    if (d > 21 - y * 1.1 || (d < 14 && y > 0)) continue;
    const inner = d < 15.2;
    b.set(x, y, z, inner ? (y === 6 ? TEAM : y === 5 ? LOG_D : (x + z) % 2 ? LOG : LOG_L) : y >= 5 || d > 20.4 - y * 1.1 ? (hash3(x, y, z) < 0.15 ? SAGE : DIRT_L) : hash3(x, y, z) < 0.3 ? DIRT_D : DIRT);
  }
  b.box(10, 0, 10, 37, 5, 37, (x, y, z) => { const d = Math.hypot(x - 23.5, z - 23.5); return y === 5 && d < 13.5 ? (Math.abs(d - 9) < 0.6 ? IRON_L : x % 3 === 0 ? BOARD_D : BOARD) : 0; }); // the deck and its rail
  b.box(2, 1, 20, 9, 5, 27, (x, y, z) => (y === 5 ? DIRT_L : x === 2 && z >= 22 && z <= 25 && y < 4 ? (z === 22 || z === 25 || y === 3 ? BOARD_L : K) : logs(x, y, z))); // the magazine
  for (const [x, z] of [[13, 13], [32, 13], [13, 32]]) { b.box(x, 6, z, x + 2, 6, z + 2, IRON); b.set(x + 1, 7, z + 1, IRON_L); } // shot, piled
  b.box(32, 6, 32, 34, 6, 33, BOARD_D); // a powder keg rack
  const t = new VB();
  for (const z of [3, 4, 10, 11]) for (let x = 0; x <= 15; x++) { const top = Math.min(7, 1 + Math.round(x * 0.5)); for (let y = x < 6 ? 0 : 2; y <= top; y++) t.set(x, y, z, y === top ? TEAM_D : TEAM); } // the carriage's cheeks
  t.box(1, 1, 5, 3, 2, 9, BOARD_D); t.box(9, 3, 5, 11, 4, 9, BOARD_D); // transoms
  for (const z of [1, 2, 12, 13]) wheel(t, 10, 5, z, 5, 'z', BOARD_L, IRON);
  t.box(10, 5, 1, 10, 5, 13, IRON);
  for (let x = 5; x <= 33; x++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) { // the barrel, swelling at breech and muzzle
    const r = x >= 31 ? 2.9 : x <= 8 ? 3.2 : 3 - (x - 8) * 0.03, d = Math.hypot(dy, dz); if (d > r) continue;
    t.set(x, 8 + dy, 7 + dz, x === 33 && d < 1.4 ? K : dy >= 2 && Math.abs(dz) <= 1 ? IRON_L : x === 9 || x === 20 ? IRON_D : IRON);
  }
  t.box(3, 8, 7, 4, 8, 7, IRON); t.set(8, 12, 7, IRON_L); t.box(12, 8, 3, 12, 8, 11, IRON_L); // the knob, the vent, the trunnions
  return { body: b, bodyPivot: [24, 0, 24], turret: t, turretPivot: [6.5, 0, 7.5], turretAt: [24, 6, 24] };
}

// Gatling Tower (the Flak Tower): a log blockhouse with a railed platform on top, painted rails; the turret is a
// Gatling gun on a pivot, its barrels raised at the sky, a magazine on top. 1 x 1.
function gatlingTower(): ModelDef {
  const b = new VB();
  b.box(3, 0, 3, 20, 0, 20, (x, y, z) => dirt(x, z));
  b.box(5, 1, 5, 18, 9, 18, (x, y, z) => (x === 5 || x === 18 || z === 5 || z === 18 ? ((x === 5 || x === 18) && (z === 5 || z === 18) ? (y % 2 ? LOG_END : LOG_D) : z === 18 && x >= 10 && x <= 12 && y < 6 ? (y === 5 ? BOARD_L : K) : y >= 6 && y <= 7 && (x + z) % 5 === 0 ? K : logs(x, y, z)) : 0)); // the blockhouse
  b.box(3, 10, 3, 20, 10, 20, (x, y, z) => (x === 3 || x === 20 || z === 3 || z === 20 ? BOARD_D : x % 2 ? BOARD : BOARD_L)); // the platform
  for (let x = 3; x <= 20; x++) for (let z = 3; z <= 20; z++) if (x === 3 || x === 20 || z === 3 || z === 20) { if ((x + z) % 4 === 0) b.set(x, 11, z, LOG); b.set(x, 12, z, (x + z) % 3 ? TEAM : TEAM_D); } // the rail, painted
  crate(b, 4, 4, 3, 2, 1, 11); crate(b, 17, 17, 3, 2, 1, 11);
  for (let y = 1; y < 10; y++) b.set(19, y, 12, y % 2 ? BOARD_L : 0); // ladder
  const t = new VB();
  t.box(0, 0, 0, 7, 2, 7, (x, y) => (y === 2 ? TEAM_D : TEAM)); t.box(1, 3, 3, 2, 4, 4, LEATHER); // the mount, the gunner's seat
  for (const z of [1, 6]) t.box(2, 3, z, 5, 5, z, TEAM_D); // its yoke
  t.box(4, 3, 2, 7, 6, 5, BRASS); // the breech housing
  for (const [dz, dx] of [[2, 0], [5, 0], [3, 1], [4, 1], [3, -1], [4, -1]]) for (let i = 0; i <= 12; i++) { const x = 5 + dx + Math.round(i * 0.6), y = 4 + i; t.set(x, y, dz, i === 12 ? K : i === 6 ? BRASS_D : IRON); } // six barrels, raised at the sky
  t.box(5, 7, 3, 6, 9, 4, BRASS_D); t.box(4, 4, 6, 4, 5, 7, IRON); t.set(4, 6, 7, BOARD_L); // magazine, crank
  return { body: b, bodyPivot: [12, 0, 12], turret: t, turretPivot: [3.5, 0, 3.5], turretAt: [12, 11, 12] };
}

// Log Barricade (the Wall): one cell of sharpened-log palisade, two logs thick, bound with a painted band, banked with
// earth inside. Laid side by side they make a continuous stockade. 1 x 1.
function barricade(): ModelDef {
  const b = new VB();
  for (let x = 1; x <= 22; x++) for (let z = 1; z <= 22; z++) {
    if (x === 1 || x === 22 || z === 1 || z === 22) { // the stakes: logs two blocks round, lit on one half, each cut to a point
      const along = x === 1 || x === 22 ? z : x, i = along >> 1, half = along & 1, h = 7 + Math.floor(hash3(i, x === 1 || x === 22 ? x : 0, z === 1 || z === 22 ? z : 0) * 3) - half;
      for (let y = 0; y <= h; y++) b.set(x, y, z, y === h ? LOG_END : y === 4 ? (half ? TEAM_D : TEAM) : y === 3 ? (half ? TEAM : TEAM_D) : half ? LOG_D : LOG_L);
    } else for (let y = 0; y <= 3; y++) b.set(x, y, z, y === 3 ? (hash3(x, y, z) < 0.15 ? DIRT_D : DIRT_L) : DIRT); // earth banked behind
  }
  return { body: b, bodyPivot: [12, 0, 12] };
}

export const BASE: Record<string, () => ModelDef> = {
  generator: windmill, reactor: steamWorks, scrapyard: stampMill, derrick: goldMine, barracks: saloon, depot: wagonWorks, workshop: blacksmith,
  airfield: balloonField, provingGround: ironworks, radar: telegraph, interceptor: lightningTower, empCannon: teslaCannon,
  guardTower: watchtower, emplacement: redoubt, flakTower: gatlingTower, wall: barricade,
};
