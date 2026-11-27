// WILD WEST: the towns, neutral sites and wildlife, standing in for CIVIC and LIFE by key. Same footprint and pivot as the original.
// Sun-bleached boards, adobe, red barns and iron; capturable sites wear the holder's colours on trim, flags and signs.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from '../models';
import { hash3 } from '../hash';
import { animate, swing, turn } from './pose';
import { tower, dome } from '../art';

type Col = (x: number, y: number, z: number) => number;
const K = 0x1f2024, IRON = 0x3a3634, IRON_L = 0x5e5854, GLASS = 0x2e3440, GLASS_L = 0x7a8a96, LAMP = 0xffd88a;
// weathered boards: grey-tan, lighter on the tops of things
const PL = 0xb4a084, PL_L = 0xcab89a, PL_D = 0x968266, PL_K = 0x6a5640, TRIM = 0xe4dac4;
const ADOBE = 0xdab08a, ADOBE_L = 0xe8c4a0, ADOBE_D = 0xc29872, VIGA = 0x5a4430, TURQ = 0x3e7a7c, CHILE = 0xa8281c, CHILE_D = 0x7a1c14;
const LOG = 0x92704c, LOG_D = 0x76583a, LOG_END = 0xd8bc8c, SHINGLE = 0x8a7a64, SHINGLE_D = 0x706250;
const TIN = 0xaaa69c, TIN_D = 0x8c887e, STONE = [0xb4a890, 0xa29680, 0xc4b8a0], BRICK = [0x8a4a36, 0x9a5640, 0x7a4030];
const DIRT = 0xb08e60, DIRT_D = 0x9a7a50, DIRT_L = 0xc29e70, HAY = 0xd0b060, HAY_D = 0xb09040, WATER = 0x4e7e94, WATER_L = 0x8ab4c4;
const BARN = [0x8a3a2a, 0x7c3426, 0x6a2c20], COAL = [0x222020, 0x2e2c2a, 0x3a3634];
const COAT = [0x7a4a28, 0x5a341c, 0x94603a], GREY_HORSE = [0x9a948a, 0x7a746a, 0xb4aea4], MANE = 0x2a1e16;
const SKIN = 0xc8946c, BOOT = 0x2a2622, CANVAS = 0xd8d0b8, CANVAS_D = 0xb8ae94;

// ---------------------------------------------------------------- helpers
const board: Col = (x, y, z) => (y % 2 === 0 ? PL_D : hash3(x >> 2, y, z >> 2) < 0.3 ? PL_L : PL); // horizontal clapboard
const batten: Col = (x, y, z) => ((x + z) % 3 === 0 ? PL_D : hash3(x, y >> 2, z) < 0.25 ? PL_L : PL); // upright boards
const mud: Col = (x, y, z) => (hash3(x, y, z) < 0.08 ? ADOBE_D : hash3(x >> 1, y >> 1, z >> 1) < 0.2 ? ADOBE_L : ADOBE);
const dirt = (x: number, z: number) => (hash3(x, 0, z) < 0.08 ? DIRT_D : hash3(x >> 2, 1, z >> 2) < 0.25 ? DIRT_L : DIRT);
// Only the outside of a box: walls (and a top when roofed)
function shell(b: VB, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: Col, roofed = false) {
  b.box(x0, y0, z0, x1, y1, z1, (x, y, z) => (x === x0 || x === x1 || z === z0 || z === z1 || (roofed && y === y1) ? col(x, y, z) : 0));
}
// A gable roof over x0..x1, z0..z1 from height y, ridge along x (or along z), with the gable ends filled in
function gable(b: VB, x0: number, z0: number, x1: number, z1: number, y: number, slope: number, roof: Col, wall: Col, alongZ = false, endIn = 1) {
  const [a0, a1, c0, c1] = alongZ ? [z0, z1, x0, x1] : [x0, x1, z0, z1];
  const mid = (c0 + c1) / 2, half = (c1 - c0) / 2;
  const put = (a: number, yy: number, c: number, col: number) => (alongZ ? b.set(c, yy, a, col) : b.set(a, yy, c, col));
  for (let c = c0; c <= c1; c++) {
    const ry = Math.round((half - Math.abs(c - mid)) * slope);
    for (let a = a0; a <= a1; a++) {
      const [x, z] = alongZ ? [c, a] : [a, c];
      put(a, y + ry, c, roof(x, y + ry, z));
      if (a === a0 + endIn || a === a1 - endIn) for (let yy = y; yy < y + ry; yy++) put(a, yy, c, wall(x, yy, z));
    }
  }
}
const shingles = (x: number, y: number, z: number) => (y % 2 ? SHINGLE : hash3(x >> 1, y, z) < 0.3 ? SHINGLE_D : SHINGLE);
const tin = (x: number) => (x % 2 ? TIN : TIN_D);
// A wooden spoked wheel standing upright in the x-y plane at depth z
function wheel(b: VB, cx: number, cy: number, z: number, r: number, rim = PL_K, spoke = PL) {
  for (let a = 0; a < 48; a++) { const t = (a / 48) * Math.PI * 2; b.set(cx + Math.cos(t) * r, cy + Math.sin(t) * r, z, rim); }
  if (r >= 2) for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; for (let s = 1; s < r; s++) b.set(cx + Math.cos(t) * s, cy + Math.sin(t) * s, z, spoke); }
  b.set(cx, cy, z, IRON);
}
function barrel(b: VB, x: number, z: number, h = 3, top = PL_L) { tower(b, x, z, 1, h, () => 1.2, (xx, y) => (y === h ? top : y === 2 ? IRON : PL_D), 1.2); }
function trough(b: VB, x0: number, z0: number, x1: number, z1: number) { b.box(x0, 1, z0, x1, 2, z1, (x, y, z) => (x === x0 || x === x1 || z === z0 || z === z1 ? (y === 2 ? PL_L : PL_D) : y === 2 ? WATER : 0)); }
function hitch(b: VB, x0: number, x1: number, z: number) { for (const x of [x0, x1]) b.box(x, 0, z, x, 2, z, PL_K); b.box(x0, 2, z, x1, 2, z, PL); }
// A split-rail fence round a rectangle: posts every 4, two rails, gaps where open(x, z) says
function rails(b: VB, x0: number, z0: number, x1: number, z1: number, open: (x: number, z: number) => boolean = () => false) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if ((x !== x0 && x !== x1 && z !== z0 && z !== z1) || open(x, z)) continue;
    if ((x - x0 + z - z0) % 4 === 0) b.box(x, 0, z, x, 3, z, PL_K);
    else { b.set(x, 2, z, (x + z) % 3 ? PL : PL_D); b.set(x, 3, z, PL_L); }
  }
}
function hay(b: VB, x0: number, z0: number, x1: number, z1: number, h: number) { b.box(x0, 1, z0, x1, h, z1, (x, y, z) => (y === h ? HAY : (x + y) % 3 === 0 ? HAY_D : HAY)); }
// A horse standing along x, 16 long and 12 high (head at +x, or -x when back)
function horse(b: VB, ox: number, oz: number, coat = COAT, back = false) {
  const put = (x: number, y: number, z: number, c: number) => b.set(back ? ox + 15 - x : ox + x, y, oz + z, c);
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, f: (x: number, y: number) => number) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, f(x, y)); };
  for (const [x, z] of [[3, 0], [3, 2], [10, 0], [10, 2]]) { put(x, 0, z, MANE); box(x, 1, z, x, 3, z, () => coat[1]); }
  box(2, 4, 0, 11, 7, 2, (x, y) => (y === 7 ? coat[2] : y === 4 ? coat[1] : coat[0]));
  box(11, 7, 0, 12, 9, 2, (x, y) => (y === 9 ? coat[2] : coat[0])); box(10, 8, 1, 10, 10, 1, () => MANE);
  box(13, 8, 0, 15, 10, 2, (x, y) => (x === 15 ? coat[1] : y === 10 ? coat[2] : coat[0])); put(15, 8, 1, MANE); put(13, 11, 0, coat[1]); put(13, 11, 2, coat[1]);
  box(0, 5, 1, 1, 7, 1, () => MANE); put(0, 4, 1, MANE);
}
// A small horse for the buggy and wagon: 6 long, 6 high, facing +x
function pony(b: VB, ox: number, oz: number, coat = COAT) {
  for (const [x, z, ph] of [[0, 0, 0.5], [0, 1, 0], [4, 0, 0], [4, 1, 0.5]]) { const sw = swing(ph); b.set(ox + x + sw, 0, oz + z, MANE); b.set(ox + x + Math.sign(sw) * 0.4, 1, oz + z, coat[1]); } // at a walk
  b.box(ox, 2, oz, ox + 4, 3, oz + 1, (x, y) => (y === 3 ? coat[2] : coat[0]));
  b.box(ox + 5, 4, oz, ox + 5, 4, oz + 1, coat[0]); b.box(ox + 6, 4, oz, ox + 6, 5, oz + 1, (x, y) => (y === 5 ? coat[2] : coat[1])); b.set(ox + 5, 5, oz, MANE);
  b.set(ox - 1, 3, oz, MANE); b.set(ox - 1, 2, oz + 1, MANE);
}
// A flag on a pole: pole at (x, z) up to y1, flag hanging out along +z
function flag(b: VB, x: number, z: number, y1: number, w = 3, h = 3) {
  for (let y = 1; y <= y1; y++) b.set(x, y, z, y === y1 ? 0xc8a040 : IRON_L);
  b.box(x, y1 - h, z + 1, x, y1 - 1, z + w, (xx, y, zz) => (y === y1 - 1 - Math.floor(h / 2) && zz === z + Math.ceil(w / 2) ? TEAM_L : (zz + y) % 4 === 0 ? TEAM_D : TEAM));
}
// A five-pointed sheriff's star, upright in the x-y plane at depth z
function star(b: VB, cx: number, cy: number, z: number, r: number, c = 0xd8b040, edge = 0xa88830) {
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    const d = Math.hypot(dx, dy); if (d > r + 0.3) continue;
    const t = Math.atan2(dx, dy), k = Math.cos(((t + Math.PI * 2) % (Math.PI * 0.4)) - Math.PI * 0.2) ; // 1 on a point, lower between
    const lim = r * (0.42 + 0.58 * Math.pow(Math.max(0, (k - 0.81) / 0.19), 1.6));
    if (d <= lim + 0.35) b.set(cx + dx, cy + dy, z, d > lim - 0.8 ? edge : c);
  }
}
// rails and ties along x at depth z0..z0+3
function track(b: VB, x0: number, x1: number, z0: number) { for (let x = x0; x <= x1; x++) { if (x % 2 === 0) b.box(x, 0, z0, x, 0, z0 + 4, PL_K); b.set(x, 1, z0 + 1, IRON_L); b.set(x, 1, z0 + 3, IRON_L); } }

// ---------------------------------------------------------------- town buildings
// Adobe house: flat-roofed mud walls with a smaller room stepped up on top, beams (vigas) poking out,
// a turquoise door with strings of red chillies, a beehive oven out back.
function adobeHouse(): ModelDef {
  const b = new VB();
  b.box(4, 0, 6, 19, 9, 17, (x, y, z) => {
    const edge = x === 4 || x === 19 || z === 6 || z === 17;
    if (!edge && y < 9) return 0;
    if (y === 9) return edge ? ADOBE_L : 0xb8875e;
    if (z === 17 && (x === 11 || x === 12) && y < 6) return y === 5 ? VIGA : TURQ;
    if (z === 17 && y >= 3 && y <= 5 && (x === 7 || x === 8 || x === 15 || x === 16)) return y === 5 ? VIGA : y === 4 ? 0x3a3a3e : TURQ;
    if (x === 4 && y >= 3 && y <= 4 && (z === 11 || z === 12)) return 0x3a3a3e;
    return y === 0 ? ADOBE_D : mud(x, y, z);
  });
  for (let x = 4; x <= 19; x++) for (const z of [6, 17]) if (x % 5) b.set(x, 10, z, ADOBE_L); for (let z = 6; z <= 17; z++) for (const x of [4, 19]) if (z % 5) b.set(x, 10, z, ADOBE_L); // a soft, uneven parapet
  for (let x = 5; x <= 18; x += 3) for (const z of [5, 18]) b.set(x, 8, z, VIGA); // vigas
  for (const x of [8, 14]) for (let y = 4; y <= 7; y++) b.set(x, y, 19, y % 2 ? CHILE : CHILE_D); // ristras hanging from the beams
  b.box(19, 7, 9, 20, 7, 9, PL_K); b.box(19, 7, 14, 20, 7, 14, PL_K); // canales (drain spouts)
  b.box(5, 10, 7, 12, 14, 12, (x, y, z) => (x === 5 || x === 12 || z === 7 || z === 12 || y === 14 ? (y === 14 ? 0xb8875e : z === 12 && x === 8 && y < 13 ? TURQ : mud(x, y, z)) : 0)); // the upper room
  for (let x = 5; x <= 12; x++) for (const z of [7, 12]) if (x % 3) b.set(x, 15, z, ADOBE_L);
  for (let x = 6; x <= 11; x += 2) b.set(x, 13, 13, VIGA);
  b.box(10, 15, 8, 11, 16, 9, mud); b.set(10, 17, 8, ADOBE_L); b.set(11, 17, 9, ADOBE_L); // a chimney
  for (let y = 10; y <= 15; y++) { b.set(15, y, 13 + Math.floor((y - 10) / 3), PL_K); b.set(17, y, 13 + Math.floor((y - 10) / 3), PL_K); if (y % 2) b.box(16, y, 13 + Math.floor((y - 10) / 3), 16, y, 13 + Math.floor((y - 10) / 3), PL); } // a ladder up the roof
  dome(b, 2, 0, 3, 2, mud); b.set(4, 1, 3, K); // the beehive oven (horno)
  for (let x = 2; x <= 21; x++) if (x < 10 || x > 13) b.box(x, 0, 22, x, 1, 22, (xx, y) => (y === 1 ? ADOBE_L : ADOBE_D)); // a low mud wall with a gap
  for (let z = 18; z <= 21; z++) b.box(11, 0, z, 12, 0, z, DIRT_D);
  b.box(20, 0, 9, 22, 2, 12, (x, y, z) => (y === 2 ? PL_L : (x + z) % 2 ? LOG : LOG_END)); // firewood
  for (const [x, z] of [[17, 20], [6, 20]]) { b.box(x, 0, z, x + 1, 1, z, 0x4a6a3a); b.set(x, 2, z, 0x5a7e44); b.set(x + 1, 2, z, 0xc8a040); } // prickly pear
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Log cabin: notched log walls, a shingle roof, a porch with a rocking chair, a stone chimney and a woodpile.
function logCabin(): ModelDef {
  const b = new VB();
  b.box(5, 0, 5, 18, 7, 15, (x, y, z) => {
    if (x !== 5 && x !== 18 && z !== 5 && z !== 15) return 0;
    if (z === 15 && (x === 11 || x === 12) && y < 6) return y === 5 ? LOG_D : PL_K;
    if (z === 15 && y >= 3 && y <= 4 && (x === 7 || x === 8 || x === 15 || x === 16)) return y === 4 ? GLASS_L : GLASS;
    if (x === 5 && y >= 3 && y <= 4 && (z === 9 || z === 10)) return GLASS;
    return y % 2 ? LOG : LOG_D;
  });
  for (const x of [5, 18]) for (const z of [5, 15]) for (let y = 0; y <= 7; y++) y % 2 ? b.set(x, y, z + (z === 5 ? -1 : 1), LOG_END) : b.set(x + (x === 5 ? -1 : 1), y, z, LOG_END); // the notched log ends
  gable(b, 4, 4, 19, 16, 8, 0.9, shingles, (x, y) => (y % 2 ? LOG : LOG_D));
  b.box(5, 0, 16, 18, 0, 19, (x, y, z) => (x % 3 === 0 ? PL_D : PL)); // porch boards
  for (const x of [5, 11, 18]) b.box(x, 1, 19, x, 6, 19, LOG_D);
  for (let z = 16; z <= 20; z++) b.box(4, 7 - Math.floor((z - 16) / 3), z, 19, 7 - Math.floor((z - 16) / 3), z, (x) => (x % 2 ? SHINGLE : SHINGLE_D)); // porch roof
  b.box(15, 1, 17, 16, 1, 18, PL_K); b.box(15, 2, 17, 15, 3, 18, PL_K); b.box(14, 0, 17, 17, 0, 17, PL_D); // a rocking chair
  b.box(19, 0, 8, 20, 15, 11, (x, y) => (y >= 14 ? 0x3a3634 : STONE[(x + y + (y >> 1)) % 3])); // stone chimney on the end
  b.box(21, 0, 3, 22, 3, 7, (x, y, z) => (y === 3 ? PL_L : (x + z + y) % 2 ? LOG : LOG_END)); // woodpile
  b.box(21, 0, 9, 21, 1, 9, LOG_D); b.set(21, 2, 9, IRON_L); // chopping block and axe
  for (let x = 1; x <= 22; x++) if (x < 10 || x > 13) { if (x % 4 === 1) b.box(x, 0, 21, x, 3, 21, PL_K); else { b.set(x, 2, 21, PL); b.set(x, 3, 21, PL_L); } } // split-rail fence
  tower(b, 2, 2, 0, 3, () => 1.3, (x, y) => (y === 3 ? WATER : y === 2 ? IRON : PL_D), 1); // rain barrel
  return { body: b, bodyPivot: [12, 0, 12] };
}

// A shopfront with a false front rising above its roof, a sign board, and a big window and door on +z.
function storefront(b: VB, x0: number, x1: number, h: number, front: number, wall: Col, z0: number, z1: number, step = false) {
  shell(b, x0, 0, z0, x1, h, z1, (x, y, z) => (y === h ? TIN_D : wall(x, y, z)), true);
  for (let x = x0; x <= x1; x++) for (let z = z0; z < z1; z++) b.set(x, h, z, tin(x));
  const mid = Math.floor((x0 + x1) / 2), w = x1 - x0;
  b.box(x0, 0, z1, x1, front, z1, (x, y) => {
    if (step && y > front - 3 && Math.abs(x - mid - 0.5) > w / 2 - 3) return 0; // a stepped top
    if (y === front || (step ? y === front - 3 : false)) return TRIM;
    if (y >= h + 1 && y <= h + 3 && x > x0 + 1 && x < x1 - 1) return y === h + 2 && x % 2 ? 0xe0d4b0 : 0x3a2e24; // the sign board
    if ((x === mid || x === mid + 1) && y < 6) return y === 5 ? TRIM : 0x4a3a2a; // the door
    if (y >= 2 && y <= 5 && x > x0 + 1 && x < x1 - 1 && Math.abs(x - mid - 0.5) > 2) return y === 5 ? TRIM : (x - x0) % 4 === 0 ? TRIM : y === 4 ? GLASS_L : GLASS; // shop windows
    if (y >= h - 3 && y <= h - 1 && w > 10 && h > 10 && (x - x0) % 4 === 2) return y === h - 1 ? TRIM : GLASS; // upstairs windows
    return x === x0 || x === x1 ? TRIM : wall(x, y, z1);
  });
  b.box(x0, front + 1, z1, x1, front + 1, z1, (x) => (step && Math.abs(x - mid - 0.5) > w / 2 - 3 ? 0 : PL_K)); // a cornice
}
const painted = (c: number, d: number): Col => (x, y, z) => (y % 2 === 0 ? d : hash3(x >> 2, y, z) < 0.2 ? d : c);

// General store row: three false-fronted shops (store, saloon, hotel) behind a boardwalk with awnings and hitching rails.
function storeRow(): ModelDef {
  const b = new VB();
  storefront(b, 3, 16, 11, 17, painted(0xb89a5a, 0xa08448), 6, 16); // general store, mustard
  storefront(b, 17, 30, 14, 22, painted(0x9a4a3a, 0x843e30), 5, 16, true); // saloon, faded red, two storeys
  b.box(22, 23, 16, 25, 24, 16, (x, y) => (y === 24 ? (x === 22 || x === 25 ? 0 : TRIM) : TRIM)); // the saloon's pediment
  storefront(b, 31, 44, 12, 18, painted(0xd0c8b0, 0xb8b098), 6, 16); // hotel, whitewash
  b.box(3, 0, 17, 44, 0, 21, (x, y, z) => (z === 21 ? PL_D : x % 3 === 0 ? PL_D : hash3(x, 0, z) < 0.2 ? PL_L : PL)); // the boardwalk
  for (const x of [3, 9, 16, 31, 37, 44]) b.box(x, 1, 21, x, 7, 21, PL_K); // awning posts
  for (let z = 17; z <= 21; z++) { const y = 8 - Math.floor((z - 17) / 2.5); b.box(3, y, z, 16, y, z, (x) => (Math.floor(x / 2) % 2 ? 0x8e4a38 : CANVAS)); b.box(31, y, z, 44, y, z, (x) => tin(x)); } // striped canvas, tin
  for (const x of [17, 23, 30]) b.box(x, 1, 21, x, 9, 21, PL_K); b.box(17, 9, 17, 30, 9, 21, PL); // the saloon's balcony
  b.box(17, 10, 21, 30, 11, 21, (x, y) => (y === 11 ? PL_L : x % 2 ? 0 : PL_D));
  for (let y = 1; y <= 4; y++) { b.set(23, y, 17, y === 4 ? 0 : PL_L); b.set(24, y, 17, y === 4 ? 0 : PL_L); } // batwing doors
  hitch(b, 5, 12, 22); hitch(b, 33, 41, 22);
  barrel(b, 14, 19); barrel(b, 4, 18 + 1); b.box(39, 1, 18, 41, 2, 19, (x, y) => (y === 2 ? PL_L : PL_D)); // barrels and a bench
  b.box(10, 1, 18, 11, 2, 19, PL_D); b.box(10, 3, 18, 10, 3, 19, 0x6a8a3e); // a crate of greens
  return { body: b, bodyPivot: [24, 0, 12] };
}

// Bank: a brick building behind a stone false front with a stepped top, barred windows and a gold sign.
function bank(): ModelDef {
  const b = new VB();
  shell(b, 4, 0, 6, 19, 9, 15, (x, y, z) => (y === 9 ? TIN_D : BRICK[(Math.floor(x / 2) + y + (y % 2)) % 3]), true);
  b.box(4, 0, 16, 19, 12, 16, (x, y) => {
    if (y === 12 && (x < 9 || x > 14)) return 0;
    if (y >= 11) return TRIM;
    if (y >= 8 && y <= 9 && x >= 6 && x <= 17) return y === 9 && x % 2 ? 0xd8b040 : 0x2a2a30; // the sign
    if ((x === 11 || x === 12) && y < 6) return y === 5 ? TRIM : 0x3a2a1a; // door
    if (y >= 2 && y <= 5 && (x >= 6 && x <= 8 || x >= 15 && x <= 17)) return y === 5 ? TRIM : x % 2 ? IRON : GLASS; // barred windows
    return y === 0 || y === 7 ? STONE[1] : STONE[(x + y) % 2 ? 0 : 2];
  });
  b.box(4, 10, 17, 19, 10, 17, PL_K); b.set(11, 13, 16, TRIM); b.set(12, 13, 16, TRIM); // cornice, finial
  b.box(4, 0, 17, 19, 0, 19, (x) => (x % 3 === 0 ? PL_D : PL)); // boardwalk
  for (const x of [4, 19]) b.box(x, 1, 19, x, 6, 19, PL_K); b.box(4, 7, 17, 19, 7, 19, (x) => tin(x)); // porch roof
  hitch(b, 3, 20, 21); trough(b, 6, 20, 10, 20);
  b.box(17, 1, 18, 18, 2, 18, IRON); b.set(18, 2, 18, 0xd8b040); // a strongbox
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Barn: weathered red boards with white-trimmed doors, a gambrel roof, a hayloft with a hoist beam, and a windmill pump.
function barn(): ModelDef {
  const b = new VB();
  b.box(3, 0, 5, 44, 12, 18, (x, y, z) => {
    if (x !== 3 && x !== 44 && z !== 5 && z !== 18) return 0;
    if (z === 18 && x >= 18 && x <= 29 && y < 10) return x === 23 || x === 24 || y === 9 || x === 18 || x === 29 || Math.abs((x < 24 ? x - 18 : 29 - x) - y * 0.55) < 0.6 ? TRIM : BARN[2]; // big doors, white X
    if ((x === 3 || x === 44) && (z === 5 || z === 18)) return TRIM;
    if (y === 0) return 0x4a3a2a;
    return x % 3 === 0 || z % 3 === 0 ? BARN[2] : hash3(x, y >> 2, z) < 0.18 ? 0x9a5a48 : BARN[(x + z) % 2];
  });
  for (let z = 4; z <= 19; z++) {
    const dz = Math.abs(z - 11.5), ry = dz > 5 ? Math.round((7.5 - dz) * 1.4) : 3 + Math.round((5 - dz) * 0.6);
    for (let x = 2; x <= 45; x++) {
      b.set(x, 13 + ry, z, dz < 1 ? SHINGLE_D : x % 4 === 0 ? SHINGLE_D : SHINGLE);
      if (x === 3 || x === 44) for (let y = 13; y < 13 + ry; y++) b.set(x, y, z, y === 13 + ry - 1 ? TRIM : BARN[(y + z) % 2]);
    }
  }
  b.box(44, 13, 10, 44, 17, 13, (x, y, z) => (y === 17 || z === 10 || z === 13 ? TRIM : 0x2a1e16)); b.box(45, 13, 11, 45, 14, 12, HAY); // hayloft door with hay showing
  b.box(45, 20, 11, 45, 20, 12, PL_K); b.box(45, 16, 12, 45, 19, 12, 0x8a8070); // hoist beam and rope
  // a windmill pump: a timber tower, the fan wheel up top and its tail vane
  for (const [x, z] of [[3, 19], [9, 19], [3, 23], [9, 23]]) for (let y = 0; y < 15; y++) b.set(x + (x < 6 ? 1 : -1) * (y / 15) * 2.5, y, z + (z < 21 ? 1 : -1) * (y / 15) * 1.6, PL_K);
  for (let y = 5; y < 15; y += 5) b.box(4, y, 21, 8, y, 21, PL);
  for (let a = 0; a < 18; a++) { const t = (a / 18) * Math.PI * 2; for (let r = 1; r <= 4; r++) if (r > 1 || a % 2 === 0) b.set(6 + Math.cos(t) * r, 18 + Math.sin(t) * r, 22, r === 4 ? IRON_L : a % 2 ? 0xc8c0b0 : 0xa8a090); }
  b.box(6, 18, 19, 6, 18, 21, IRON); b.box(6, 17, 19, 6, 19, 19, TRIM); b.box(6, 15, 21, 6, 17, 21, IRON);
  trough(b, 11, 21, 17, 22);
  hay(b, 38, 20, 43, 22, 4); for (let x = 32; x <= 37; x++) b.set(x, 0, 21, 0x9a8a50);
  return { body: b, bodyPivot: [24, 0, 12] };
}

// Railroad water tank: a hooped wooden barrel tank on heavy braced timber legs, a pointed roof and a swinging spout.
function waterTank(): ModelDef {
  const b = new VB();
  for (const [x, z] of [[5, 5], [15, 5], [5, 15], [15, 15]]) b.box(x, 0, z, x + 1, 19, z + 1, (xx, y) => (y % 6 === 0 ? PL_L : PL_D));
  for (const y of [6, 13]) { b.box(5, y, 5, 16, y, 5, PL); b.box(5, y, 16, 16, y, 16, PL); b.box(5, y, 5, 5, y, 16, PL); b.box(16, y, 5, 16, y, 16, PL); }
  for (let t = 0; t <= 10; t++) for (const z of [5, 16]) { b.set(6 + t, 1 + Math.round(t * 1.1), z, PL_K); b.set(15 - t, 1 + Math.round(t * 1.1), z, PL_K); } // X-braces
  b.box(4, 20, 4, 17, 20, 17, PL); // the deck
  for (let y = 21; y <= 30; y++) for (let x = 2; x <= 19; x++) for (let z = 2; z <= 19; z++) {
    const d = Math.hypot(x - 10.5, z - 10.5); if (d > 8 || (d < 6.8 && y > 21 && y < 30)) continue;
    const stave = Math.floor(((Math.atan2(z - 10.5, x - 10.5) + Math.PI) / (Math.PI * 2)) * 28);
    b.set(x, y, z, y === 30 ? PL_L : y % 3 === 0 ? IRON : stave % 2 ? PL : hash3(stave, y >> 2, 1) < 0.3 ? PL_D : 0xa48e6e);
  }
  for (let y = 31; y <= 33; y++) { const r = 8 - (y - 30) * 2.6; for (let x = 2; x <= 19; x++) for (let z = 2; z <= 19; z++) { const d = Math.hypot(x - 10.5, z - 10.5); if (d <= r && d > r - 2) b.set(x, y, z, shingles(x, y, z)); } }
  b.box(10, 33, 10, 11, 33, 11, SHINGLE_D);
  for (let k = 0; k <= 3; k++) b.box(10, 23 - k, 18 + k, 11, 23 - k, 18 + k, IRON); b.box(10, 18, 21, 11, 19, 21, IRON); b.set(11, 17, 21, IRON_L); // the spout swung down
  for (let y = 0; y < 30; y++) if (y % 2) b.box(19, y, 10, 19, y, 11, PL_L); else { b.set(19, y, 10, PL_K); b.set(19, y, 11, PL_K); } // ladder
  b.box(1, 0, 1, 4, 4, 4, (x, y) => (y === 4 ? TIN_D : x === 4 && y < 3 ? K : batten(x, y, 1))); // pump shed
  return { body: b, bodyPivot: [12, 0, 12] };
}

// ---------------------------------------------------------------- capturable sites
// Livery stable: a long board stable with open stalls and the holder's sign, a corral of horses, hay and a trough.
function liveryStable(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 47, (x, y, z) => dirt(x, z)); // a packed-dirt yard
  b.box(4, 1, 4, 44, 9, 20, (x, y, z) => {
    if (x !== 4 && x !== 44 && z !== 4 && z !== 20) return 0;
    if (z === 20 && x > 4 && x < 44 && (x - 4) % 8 !== 0 && y < 8) return y === 7 ? PL_K : y <= 3 && (x - 4) % 8 < 3 ? PL : 0; // open stalls, half-doors
    return batten(x, y, z);
  });
  for (let x = 6; x < 44; x += 8) b.box(x, 1, 6, x, 6, 18, PL_D); // stall partitions
  gable(b, 3, 3, 45, 21, 10, 0.7, (x, y, z) => (z === 21 || z === 3 ? TEAM : shingles(x, y, z)), batten);
  b.box(20, 12, 22, 28, 15, 22, (x, y) => (y === 15 || y === 12 || x === 20 || x === 28 ? TEAM_D : y === 13 && x % 2 ? TRIM : TEAM)); // the sign over the stalls
  b.box(44, 11, 11, 44, 14, 13, (x, y, z) => (z === 12 && y < 14 ? HAY_D : PL_K)); // hayloft
  for (const [x, c] of [[13, COAT], [37, GREY_HORSE]] as [number, number[]][]) horse(b, x - 7, 21, c, false); // two horses tied out front
  hitch(b, 5, 42, 25);
  rails(b, 48, 24, 70, 46, (x, z) => x === 48 && z > 30 && z < 36); // the corral
  horse(b, 51, 28, COAT, true); horse(b, 53, 39, GREY_HORSE); horse(b, 50, 34, [0x3a2a20, 0x2a1e16, 0x4e3a2c]);
  trough(b, 64, 28, 66, 36); hay(b, 66, 40, 68, 44, 3);
  hay(b, 48, 4, 56, 9, 5); hay(b, 49, 5, 55, 8, 7); hay(b, 58, 4, 62, 9, 4); // haystacks
  // a buckboard wagon parked in the yard
  b.box(10, 3, 32, 26, 3, 38, (x, z) => (x % 3 === 0 ? PL_D : PL)); b.box(10, 4, 32, 26, 5, 38, (x, y, z) => (x === 10 || z === 32 || z === 38 ? (y === 5 ? TEAM : PL_D) : 0));
  for (const x of [13, 23]) for (const z of [31, 39]) wheel(b, x, 3, z, 2.6);
  b.box(27, 2, 34, 33, 2, 34, PL_K); b.box(27, 2, 36, 33, 2, 36, PL_K); // the shafts
  barrel(b, 40, 32); barrel(b, 43, 33); barrel(b, 41, 35);
  b.box(2, 1, 44, 2, 12, 44, PL_K); b.set(3, 11, 44, LAMP); b.box(70, 1, 20, 70, 12, 20, PL_K); b.set(69, 11, 20, LAMP); // lantern posts
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Sheriff's office and jail: a board office with a tall false front carrying a big star, a stone jail block
// behind with barred windows, a porch, a hitching rail and the holder's flag.
function sheriffOffice(): ModelDef {
  const b = new VB();
  b.box(2, 0, 2, 45, 0, 45, (x, y, z) => dirt(x, z));
  shell(b, 6, 1, 8, 41, 13, 22, (x, y, z) => (y === 13 ? STONE[1] : y >= 7 && y <= 9 && (x - 6) % 6 === 3 && (z === 8 || x === 6 || x === 41) ? (x % 2 ? IRON : K) : STONE[(Math.floor(x / 3) + y + (y % 2) * 2) % 3]), true); // the jail block
  b.box(6, 14, 8, 41, 14, 22, (x, y, z) => (x === 6 || x === 41 || z === 8 ? STONE[2] : 0));
  shell(b, 8, 1, 22, 39, 14, 36, (x, y, z) => (y === 14 ? TIN_D : board(x, y, z)), true); // the office
  for (let x = 8; x <= 39; x++) for (let z = 22; z < 36; z++) b.set(x, 14, z, tin(x));
  b.box(6, 1, 36, 41, 22, 36, (x, y) => {
    if (y >= 21 && (x < 12 || x > 35)) return 0;
    if (y >= 21) return y === 22 ? TEAM_D : TEAM;
    if (y === 20 || y === 15 && (x < 12 || x > 35)) return TEAM_D;
    if (y >= 15) return x === 6 || x === 41 ? TRIM : TEAM;
    if (x >= 21 && x <= 26 && y < 9) return y === 8 ? TRIM : x === 23 || x === 24 ? 0x3a2a1a : 0x4a3a2a; // double doors
    if (y >= 3 && y <= 7 && (x >= 10 && x <= 16 || x >= 31 && x <= 37)) return y === 7 ? TRIM : (x % 3 === 0 ? TRIM : y > 5 ? GLASS_L : GLASS);
    if (y >= 10 && y <= 12 && x > 8 && x < 39 && x % 6 === 2) return y === 12 ? TRIM : GLASS;
    return x === 6 || x === 41 ? TRIM : board(x, y, 36);
  });
  star(b, 23.5, 17.5, 37, 4); // the star
  b.box(6, 1, 37, 41, 1, 41, (x) => (x % 3 === 0 ? PL_D : PL)); // porch
  for (const x of [6, 15, 32, 41]) b.box(x, 2, 41, x, 11, 41, PL_K); b.box(5, 12, 37, 42, 12, 42, (x) => tin(x));
  b.box(8, 2, 38, 13, 2, 39, PL_D); b.box(8, 3, 37, 13, 4, 37, PL_D); // a bench
  for (const x of [34, 36]) b.box(x, 3, 37, x + 1, 5, 37, 0xd8ccaa); // wanted posters
  hitch(b, 10, 20, 44); hitch(b, 27, 37, 44); trough(b, 28, 42, 35, 43);
  horse(b, 6, 42, COAT);
  flag(b, 43, 41, 25, 6, 4); // a flagpole with the holder's colours
  barrel(b, 3, 3); barrel(b, 3, 6); b.box(44, 0, 10, 46, 2, 14, (x, y, z) => (y === 2 ? PL_L : (x + z) % 2 ? LOG : LOG_END)); // barrels, firewood
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Log blockhouse: a squat log fort, its upper storey jutting out over the lower, rifle slits all round,
// a pyramid roof with a lookout, inside a ring of sharpened stakes.
function blockhouse(): ModelDef {
  const b = new VB();
  const logs = (slit: number): Col => (x, y, z) => (y === slit && (x + z) % 4 === 0 ? K : y % 2 ? LOG : LOG_D);
  shell(b, 5, 0, 5, 18, 5, 18, logs(3));
  b.box(4, 6, 4, 19, 6, 19, LOG_D); shell(b, 3, 6, 3, 20, 10, 20, (x, y, z) => (y === 10 ? TEAM : logs(8)(x, y, z)));
  for (let k = 0; k <= 3; k++) b.box(3 + k * 2, 11 + k, 3 + k * 2, 20 - k * 2, 11 + k, 20 - k * 2, (x, y, z) => (x === 3 + k * 2 || x === 20 - k * 2 || z === 3 + k * 2 || z === 20 - k * 2 ? (k === 0 ? TEAM_D : shingles(x, y, z)) : k ? SHINGLE_D : 0));
  b.box(10, 14, 10, 13, 14, 13, SHINGLE_D);
  b.box(11, 0, 18, 12, 4, 18, (x, y) => (y === 4 ? LOG_D : PL_K)); // the door
  for (let a = 0; a < 44; a++) { if (a % 11 < 2) continue; const t = (a / 44) * Math.PI * 2, x = 11.5 + Math.cos(t) * 11.5, z = 11.5 + Math.sin(t) * 11.5; b.set(x, 0, z, LOG_D); b.set(x, 1, z, LOG); if (a % 2) b.set(x, 2, z, LOG_END); } // the stakes
  barrel(b, 2, 12); b.box(19, 0, 2, 20, 1, 3, PL_D);
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Lookout: a tall braced timber tower, a railed platform in the holder's colours, a shingle roof and a bell.
function lookout(): ModelDef {
  const b = new VB();
  for (const [x, z] of [[5, 5], [18, 5], [5, 18], [18, 18]]) for (let y = 0; y < 26; y++) b.set(x + (y / 26) * (x < 12 ? 2 : -2), y, z + (y / 26) * (z < 12 ? 2 : -2), y % 6 === 0 ? PL_L : PL_D);
  for (const y0 of [1, 9, 17]) for (let t = 0; t <= 8; t++) { const y = y0 + t, sx = (y / 26) * 2; for (const z of [5, 18]) b.set(5 + sx + t * ((13 - 2 * sx) / 8), y, z + (z < 12 ? sx : -sx), PL_K); for (const x of [5, 18]) b.set(x + (x < 12 ? sx : -sx), y, 5 + sx + (8 - t) * ((13 - 2 * sx) / 8), PL_K); } // cross-bracing
  b.box(3, 26, 3, 20, 26, 20, (x, z) => (x % 2 ? PL : PL_L));
  b.box(3, 27, 3, 20, 29, 20, (x, y, z) => (x === 3 || x === 20 || z === 3 || z === 20 ? (y === 29 ? TEAM : y === 28 ? TEAM_D : (x + z) % 3 === 0 ? PL_K : 0) : 0));
  for (const [x, z] of [[3, 3], [20, 3], [3, 20], [20, 20]]) b.box(x, 27, z, x, 33, z, PL_D);
  for (let k = 0; k <= 4; k++) b.box(2 + k * 2, 34 + k, 2 + k * 2, 21 - k * 2, 34 + k, 21 - k * 2, (x, y, z) => (x === 2 + k * 2 || x === 21 - k * 2 || z === 2 + k * 2 || z === 21 - k * 2 ? (k === 0 ? TEAM_D : shingles(x, y, z)) : SHINGLE_D));
  b.box(11, 31, 11, 12, 32, 12, 0xb88a3a); b.set(11, 33, 11, IRON); // the alarm bell
  for (let y = 0; y < 26; y++) if (y % 2) b.box(11, y, 20, 12, y, 20, PL_L); else { b.set(11, y, 20, PL_K); b.set(12, y, 20, PL_K); } // ladder
  barrel(b, 1, 1); barrel(b, 3, 1); b.box(19, 27, 4, 19, 28, 6, LOG_D); // barrels, a rifle rack up top
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Coal and water stop: a timber coal tipple over a rail spur with a black heap, open coal bins, a water tank on legs, barrels.
function coalStop(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => (hash3(x, 0, z) < 0.15 ? COAL[1] : dirt(x, z)));
  track(b, 0, 47, 40);
  // the tipple: a tall timber bin on legs over the rails, a chute down to them
  for (const [x, z] of [[4, 28], [18, 28], [4, 44], [18, 44]]) b.box(x, 1, z, x + 1, 11, z + 1, PL_D);
  shell(b, 4, 12, 28, 19, 17, 45, (x, y, z) => (y === 17 ? TEAM_D : y === 16 ? TEAM : batten(x, y, z)), false);
  for (let z = 28; z <= 45; z++) for (let x = 4; x <= 19; x++) b.set(x, 18 + Math.round((9 - Math.abs(z - 36.5)) * 0.1), z, z === 28 || z === 45 ? TEAM : tin(x)); b.box(5, 12, 29, 18, 12, 44, PL_D);
  for (let k = 0; k <= 4; k++) b.box(10, 11 - k, 38 + Math.floor(k / 2), 13, 11 - k, 38 + Math.floor(k / 2), IRON);
  // open coal bins
  for (const x0 of [24, 33]) { b.box(x0, 1, 26, x0 + 8, 3, 34, (x, y, z) => (x === x0 || x === x0 + 8 || z === 26 ? (y === 3 ? PL_L : PL_D) : 0)); for (let x = x0 + 1; x < x0 + 8; x++) for (let z = 27; z <= 34; z++) { const h = 1 + Math.round(3 - Math.hypot(x - x0 - 4, (z - 30) * 0.6) * 0.7 + hash3(x, 2, z)); for (let y = 1; y <= h; y++) b.set(x, y, z, COAL[(hash3(x, y, z) * 3) | 0]); } }
  // a water tank on short legs
  for (const [x, z] of [[29, 9], [38, 9], [29, 18], [38, 18]]) b.box(x, 1, z, x, 7, z, PL_D);
  for (let y = 8; y <= 17; y++) for (let x = 26; x <= 41; x++) for (let z = 6; z <= 21; z++) { const d = Math.hypot(x - 33.5, z - 13.5); if (d > 7 || (d < 5.8 && y > 8 && y < 17)) continue; b.set(x, y, z, y === 17 ? PL_L : y === 12 ? TEAM : y % 3 === 0 ? IRON : Math.floor((Math.atan2(z - 13.5, x - 33.5) + 4) * 4) % 2 ? PL : 0xa48e6e); }
  for (let y = 18; y <= 19; y++) b.box(31 + (y - 18), y, 11 + (y - 18), 36 - (y - 18), y, 16 - (y - 18), SHINGLE);
  for (let k = 0; k <= 5; k++) b.set(33, 12 - k, 21 + Math.min(k, 3), IRON); // its spout
  for (let i = 0; i < 6; i++) barrel(b, 4 + (i % 3) * 3, 4 + Math.floor(i / 3) * 3, 3, i % 2 ? PL_L : IRON_L); // barrels
  b.box(12, 1, 3, 20, 6, 10, (x, y, z) => (y === 6 ? TIN_D : x === 12 || x === 20 || z === 3 || z === 10 ? (z === 10 && x === 16 && y < 5 ? K : batten(x, y, z)) : 0)); // tool shed
  b.box(44, 1, 26, 44, 10, 26, PL_K); b.set(43, 9, 26, LAMP);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Steam mill: a brick mill hall with a tall chimney, a big waterwheel fed by a flume on trestles, stacked lumber and coal.
function steamMill(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 47, (x, y, z) => (z >= 22 && z <= 26 && x >= 42 ? (x % 5 === 0 ? WATER_L : WATER) : dirt(x, z))); // the tailrace runs off east
  b.box(4, 1, 6, 40, 15, 30, (x, y, z) => {
    if (x !== 4 && x !== 40 && z !== 6 && z !== 30) return 0;
    if (y >= 13) return y === 14 ? TEAM_D : TEAM;
    if (y >= 5 && y <= 10 && (x - 4) % 6 >= 2 && (x - 4) % 6 <= 4 && z !== 6) return y === 10 || y === 5 ? STONE[2] : y === 9 ? GLASS_L : GLASS;
    if (z === 30 && x >= 19 && x <= 24 && y < 9) return y === 8 ? STONE[2] : PL_K;
    return BRICK[(Math.floor(x / 2) + y + (y % 2)) % 3];
  });
  gable(b, 3, 5, 41, 31, 16, 0.4, (x) => tin(x), (x, y, z) => BRICK[(x + y + z) % 3]);
  tower(b, 12, 10, 1, 46, (y) => 3.2 - y * 0.02, (x, y) => (y >= 44 ? K : y === 43 || y === 42 ? STONE[2] : y % 9 === 0 ? TEAM : BRICK[(y + x) % 3])); // the chimney
  // the waterwheel on the east wall, and the flume that feeds it from the hills
  for (let a = 0; a < 96; a++) { const t = (a / 96) * Math.PI * 2; for (const x of [42, 45]) b.set(x, 11 + Math.sin(t) * 9.5, 18 + Math.cos(t) * 9.5, PL_D); if ((a + Math.round(turn() * 12)) % 12 === 0) b.box(42, 11 + Math.sin(t) * 9.5, 18 + Math.cos(t) * 9.5, 45, 11 + Math.sin(t) * 9.5, 18 + Math.cos(t) * 9.5, PL_L); }
  for (let k = 0; k < 8; k++) { const t = ((k + turn()) / 8) * Math.PI * 2; for (let r = 1; r < 9.5; r++) for (const x of [42, 45]) b.set(x, 11 + Math.sin(t) * r, 18 + Math.cos(t) * r, PL); } // spokes turning with the water
  b.box(41, 11, 18, 46, 11, 18, IRON);
  b.box(43, 21, 16, 71, 22, 20, (x, y, z) => (z === 16 || z === 20 ? PL_D : y === 22 ? (x % 4 === 0 ? WATER_L : WATER) : PL_K)); // the flume
  for (let k = 0; k < 5; k++) b.box(43, 20 - k, 17, 44, 20 - k, 19, WATER_L); // spilling onto the wheel
  for (const x of [50, 58, 66]) for (const z of [16, 20]) b.box(x, 1, z, x, 20, z, PL_D);
  for (const x of [50, 58, 66]) for (let y = 4; y <= 18; y += 7) b.box(x, y, 16, x, y, 20, PL);
  // lumber stacked to season, logs waiting for the saw
  for (const [x0, z0] of [[46, 30], [58, 30], [46, 38]]) b.box(x0, 1, z0, x0 + 9, 6, z0 + 5, (x, y, z) => (y % 2 ? (x % 3 === 0 ? 0 : PL_L) : z % 2 ? PL : 0));
  b.box(60, 1, 39, 70, 3, 45, (x, y, z) => (x === 60 || x === 70 ? LOG_END : (y + z) % 2 ? LOG : LOG_D));
  for (let dx = -8; dx <= 8; dx++) for (let dz = -5; dz <= 5; dz++) { const h = Math.round(5 - Math.hypot(dx * 0.6, dz) + hash3(dx, 1, dz)); for (let y = 1; y <= h; y++) b.set(12 + dx, y, 39 + dz, COAL[(hash3(dx, y, dz) * 3) | 0]); } // a coal heap
  b.box(24, 1, 34, 34, 5, 40, (x, y, z) => (y === 5 ? TIN_D : x === 24 || x === 34 || z === 34 || z === 40 ? batten(x, y, z) : 0)); // a boiler shed
  tower(b, 29, 37, 6, 9, () => 1.2, (x, y) => (y === 9 ? K : IRON_L), 1);
  b.box(1, 1, 2, 1, 12, 2, PL_K); b.set(2, 11, 2, LAMP);
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Telegraph relay: a very tall timber mast with crossarms full of glass insulators, wires off to two small poles,
// guy ropes, and the telegraph hut with the holder's roof.
function telegraph(): ModelDef {
  const b = new VB();
  b.box(4, 0, 4, 19, 1, 19, (x, y, z) => (y === 1 ? STONE[(x + z) % 3] : STONE[1]));
  b.box(3, 2, 3, 10, 9, 10, (x, y, z) => (y === 9 ? TEAM : x === 3 || x === 10 || z === 3 || z === 10 ? (z === 10 && (x === 6 || x === 7) && y < 7 ? PL_K : x === 10 && y >= 4 && y <= 6 && z === 6 ? GLASS : board(x, y, z)) : 0)); // the hut
  for (let x = 3; x <= 10; x++) b.box(x, 10, 4, x, 10, 9, (xx, y, z) => (z === 4 || z === 9 ? TEAM_D : TEAM));
  b.box(8, 10, 5, 8, 12, 5, BRICK[0]);
  for (let y = 2; y < 62; y++) { const w = y < 36 ? 1 : 0; b.box(13, y, 13, 13 + w, y, 13 + w, y % 8 === 0 ? PL_L : hash3(1, y >> 2, 1) < 0.3 ? LOG_D : LOG); }
  for (let y = 2; y < 30; y += 2) b.set(15, y, 13, IRON_L); // climbing pegs
  for (const [y, half] of [[58, 6], [52, 7], [46, 8]]) { b.box(13 - half, y, 13, 14 + half, y, 14, PL_D); for (let x = 13 - half; x <= 14 + half; x += 2) if (x < 13 || x > 14) { b.set(x, y + 1, 13, 0x6aa890); b.set(x, y + 1, 14, 0x8ac8b0); } } // crossarms and green glass insulators
  for (const y of [61, 62, 63]) b.set(13, y, 13, y === 63 ? TEAM_L : IRON_L); b.box(13, 60, 14, 13, 61, 17, (x, y, z) => (z === 17 ? TEAM_D : TEAM)); b.box(13, 64, 13, 13, 65, 13, IRON_L); // a pennant, a lightning rod
  // wires sagging to a short pole either side
  for (const [px, pz] of [[0, 21], [23, 2]]) { b.box(px, 0, pz, px, 10, pz, LOG); b.box(px - (px ? 1 : 0), 10, pz, px + (px ? 0 : 1), 10, pz, PL_D); }
  for (let t = 0; t <= 1; t += 0.04) for (const [sx, sy, sz, ex, ez] of [[5, 46, 13, 0, 21], [21, 46, 13, 23, 2]]) if (Math.round(t * 25) % 2) b.set(sx + (ex - sx) * t, sy + (11 - sy) * t - Math.sin(t * Math.PI) * 3, sz + (ez - sz) * t, 0x4a4a48);
  for (const [ax, az] of [[0, 0], [23, 23], [23, 0]]) { b.box(ax, 0, az, ax, 1, az, PL_K); for (let t = 0.05; t < 1; t += 0.03) if (Math.round(t * 33) % 2) b.set(ax + (13.5 - ax) * t, 1 + 38 * t, az + (13.5 - az) * t, 0x8a8070); } // guy ropes
  b.box(16, 2, 16, 18, 4, 17, (x, y) => (y === 4 ? PL_L : PL_D)); barrel(b, 18, 6);
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Wheelwright's yard: an open timber shed over a wagon up on blocks, spare wheels leaning on the fence, a forge and anvil.
function wheelwright(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => (Math.abs(x - 24) < 15 && Math.abs(z - 22) < 10 && hash3(x, 3, z) < 0.12 ? 0xc8b088 : dirt(x, z))); // sawdust under the shed
  rails(b, 1, 1, 46, 46, (x, z) => z === 46 && x > 18 && x < 30);
  for (const x of [8, 16, 24, 32, 40]) for (const z of [12, 32]) b.box(x, 1, z, x, 12, z, PL_D); // shed posts
  gable(b, 6, 10, 42, 34, 13, 0.85, (x, y, z) => (z === 10 || z === 34 ? TEAM : shingles(x, y, z)), () => 0, false, 99);
  b.box(8, 1, 12, 40, 6, 12, batten); // a back wall
  b.box(20, 13, 35, 28, 16, 35, (x, y) => (y === 16 || y === 13 || x === 20 || x === 28 ? TEAM_D : y === 14 && x % 2 ? TRIM : TEAM)); // the sign
  // the wagon on blocks, a wheel off
  for (const x of [15, 27]) for (const z of [19, 26]) b.box(x, 1, z, x + 1, 2, z, LOG_D);
  b.box(13, 3, 19, 30, 3, 26, (x) => (x % 3 === 0 ? PL_D : PL)); b.box(13, 4, 19, 30, 6, 26, (x, y, z) => (x === 13 || x === 30 || z === 19 || z === 26 ? (y === 6 ? TEAM : PL_D) : 0));
  wheel(b, 16, 3, 27, 3); wheel(b, 16, 3, 18, 3); wheel(b, 28, 3, 18, 3.4);
  for (const [x, z] of [[33, 25], [36, 21]]) for (let y = 0; y <= 2; y++) b.set(x, 3 - y, z, IRON); // axle stands
  // spare wheels leaning on the back fence and lying flat
  for (const x of [5, 12]) wheel(b, x, 4, 2, 3.2);
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; b.set(39 + Math.cos(t) * 3, 1, 40 + Math.sin(t) * 3, PL_K); b.set(39 + Math.cos(t) * 3, 2, 40 + Math.sin(t) * 3, PL_K); } b.box(39, 1, 40, 39, 3, 40, IRON);
  // the forge: a brick hearth with a chimney, an anvil on a stump
  b.box(34, 1, 14, 39, 4, 18, (x, y, z) => (y === 4 && x > 34 && x < 39 && z > 14 && z < 18 ? 0xe86a28 : BRICK[(x + y + z) % 3]));
  b.box(36, 5, 15, 37, 20, 16, (x, y) => (y >= 19 ? K : BRICK[(x + y) % 3]));
  b.box(34, 1, 22, 35, 2, 23, LOG); b.box(33, 3, 22, 36, 3, 23, IRON); b.box(34, 4, 22, 35, 4, 23, IRON_L);
  b.box(4, 1, 30, 12, 3, 40, (x, y, z) => (x === 4 || x === 12 ? LOG_END : (y + z) % 2 ? LOG : LOG_D)); // seasoning timber
  barrel(b, 43, 4); barrel(b, 43, 7); b.box(44, 1, 20, 44, 12, 20, PL_K); b.set(43, 11, 20, LAMP);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Church (the town hall): white clapboard with a bell steeple over the doors, a picket fence, a few graves.
function church(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 47, 0, 47, (x, y, z) => dirt(x, z));
  const white: Col = (x, y, z) => (y % 2 === 0 ? 0xc8c0aa : hash3(x >> 2, y, z >> 2) < 0.25 ? 0xd2cab4 : 0xdcd4c0);
  b.box(13, 1, 6, 34, 13, 33, (x, y, z) => {
    if (x !== 13 && x !== 34 && z !== 6 && z !== 33) return 0;
    if ((x === 13 || x === 34) && y >= 4 && y <= 10 && (z - 6) % 6 === 3) return y >= 9 ? (y === 10 ? TEAM_L : TEAM) : y % 2 ? GLASS_L : GLASS; // tall windows, coloured glass at the top
    return (x === 13 || x === 34) && (z === 6 || z === 33) ? TRIM : white(x, y, z);
  });
  gable(b, 12, 5, 35, 34, 14, 0.75, (x, y, z) => (x === 12 || x === 35 ? TEAM_D : shingles(x, y, z)), white, true);
  // the steeple over the doors: a square tower, the belfry, a spire in the holder's colour
  b.box(20, 1, 32, 27, 24, 39, (x, y, z) => {
    if (x !== 20 && x !== 27 && z !== 32 && z !== 39 && y < 24) return 0;
    if (z === 39 && x >= 22 && x <= 25 && y < 9) return y === 8 ? TRIM : x === 23 || x === 24 ? 0x6a3a24 : 0x7a4a2c; // doors
    if (y >= 11 && y <= 13 && (x === 23 || x === 24 || z === 35 || z === 36)) return y === 13 ? TRIM : GLASS;
    if (y === 24 || y === 16) return TRIM;
    if (y >= 18 && y <= 23 && (x > 20 && x < 27 || z > 32 && z < 39)) return y === 23 ? TRIM : 0; // belfry openings
    return (x === 20 || x === 27) && (z === 32 || z === 39) ? TRIM : white(x, y, z);
  });
  b.box(23, 20, 35, 24, 22, 36, 0xb88a3a); b.set(23, 19, 35, 0x8a6a2a); b.box(23, 23, 35, 24, 23, 36, PL_K); // the bell
  for (let y = 25; y <= 33; y++) { const r = (33 - y) * 0.45; b.box(Math.round(23.5 - r), y, Math.round(35.5 - r), Math.round(23.5 + r), y, Math.round(35.5 + r), y % 2 ? TEAM : TEAM_D); }
  for (let y = 33; y <= 36; y++) b.set(23, y, 35, y === 35 ? 0xd8b040 : IRON_L); b.box(22, 35, 35, 24, 35, 35, 0xd8b040); // the cross
  b.box(20, 1, 40, 27, 1, 42, PL); b.box(21, 1, 43, 26, 1, 43, PL_D); // steps
  for (let x = 2; x <= 45; x++) for (const z of [2, 45]) if (z === 2 || x < 20 || x > 27) { if (x % 2 === 0) b.box(x, 1, z, x, 3, z, 0xd8d0c0); b.set(x, 2, z, 0xc8c0b0); } // picket fence
  for (let z = 2; z <= 45; z++) for (const x of [2, 45]) { if (z % 2 === 0) b.box(x, 1, z, x, 3, z, 0xd8d0c0); b.set(x, 2, z, 0xc8c0b0); }
  for (const [x, z] of [[5, 6], [8, 6], [5, 11], [8, 11], [5, 16]]) { b.box(x, 1, z, x, 4, z, PL_L); b.box(x, 3, z - 1, x, 3, z + 1, PL_L); b.box(x + 1, 1, z - 1, x + 3, 1, z + 1, DIRT_D); } // graves
  hitch(b, 37, 44, 41); horse(b, 30, 42, GREY_HORSE, true);
  b.box(4, 1, 38, 4, 9, 38, LOG); b.box(2, 7, 36, 6, 11, 40, (x, y, z) => (hash3(x, y, z) < 0.3 ? 0x4a5a34 : 0x5e6e40)); // a cottonwood
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Thunder tower (the prize at the centre): an iron lattice tower on a stone footing, crowned with a copper coil
// and a glowing ball that charges the strike from the sky; dynamo house, cables, lightning rods, the holder's banners.
const COPPER = 0xb8763a, COPPER_D = 0x8a5428, GLOW = 0x7fd8ff, GLOW_L = 0xe0f8ff;
function thunderTower(): ModelDef {
  const b = new VB(), FE = 0x6e5a4c, FE_L = 0x9a7c62;
  b.box(0, 0, 0, 47, 2, 47, (x, y, z) => (y === 2 ? ((x * 3 + z * 7) % 11 === 0 ? STONE[1] : (x >> 2) % 2 === (z >> 2) % 2 ? STONE[0] : STONE[2]) : STONE[1])); // dressed-stone footing
  b.box(14, 3, 14, 33, 3, 33, (x, y, z) => ((x + z) % 2 ? IRON : IRON_L));
  // the lattice: four legs leaning in, a zigzag of braces up each face, rings at the landings
  const leg = (y: number) => 8.5 - (y - 3) * 0.25, cx = 23.5;
  for (let y = 3; y <= 27; y++) { const r = leg(y); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { b.set(cx + sx * r, y, cx + sz * r, y % 6 === 3 ? FE_L : FE); if (y < 12) b.set(cx + sx * (r - 1), y, cx + sz * (r - 1), FE); } }
  for (let y = 3, k = 0; y < 27; y += 6, k++) { const r0 = leg(y), r1 = leg(y + 6); for (let t = 0; t <= 1; t += 0.05) { const r = r0 + (r1 - r0) * t, yy = y + 6 * t, u = k % 2 ? 1 - t : t; for (const s of [-1, 1]) { b.set(cx - r + 2 * r * u, yy, cx + s * r, FE_L); b.set(cx + s * r, yy, cx - r + 2 * r * u, FE_L); } } }
  for (const y of [9, 15, 21, 27]) { const r = leg(y); for (let a = -r; a <= r; a += 0.5) for (const s of [-1, 1]) { b.set(cx + a, y, cx + s * r, FE); b.set(cx + s * r, y, cx + a, FE); } }
  for (const [x, z] of [[23, 15], [24, 32], [15, 24], [32, 23]]) b.box(x - 1, 5, z - 1, x + 1, 8, z + 1, (xx, y) => (y === 8 ? TEAM_L : y === 5 ? TEAM_D : TEAM)); // the holder's banners on the faces
  // the coil: copper turns round a core, a ring on top, and the glowing ball
  tower(b, cx, cx, 26, 29, () => 2.2, (x, y) => (y % 2 ? COPPER : COPPER_D), 1.2);
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; b.set(cx + Math.cos(t) * 4, 30, cx + Math.sin(t) * 4, a % 2 ? IRON_L : COPPER); }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const d = Math.hypot(dx, dy * 1.2, dz); if (d <= 2.8) b.set(cx + dx, 32 + dy, cx + dz, d < 1.6 ? GLOW_L : hash3(dx, dy, dz) < 0.5 ? GLOW : GLOW_L); }
  for (const [x, y, z] of [[19, 30, 23], [28, 31, 24], [23, 29, 28], [24, 31, 19], [27, 28, 27]]) b.set(x, y, z, GLOW_L); // sparks jumping off the ring
  // the dynamo house at the front corner, glowing windows, a copper cable to the tower's foot
  b.box(34, 3, 4, 44, 10, 13, (x, y, z) => (y === 10 ? TIN_D : x === 34 || x === 44 || z === 4 || z === 13 ? (y >= 5 && y <= 7 && (x === 44 || z === 13) && (x + z) % 4 < 2 ? (y === 7 ? GLOW_L : GLOW) : z === 13 && x >= 38 && x <= 39 && y < 8 ? K : BRICK[(x + y + (y % 2)) % 3]) : 0));
  b.box(34, 11, 4, 44, 11, 13, (x, y, z) => (x === 34 || x === 44 || z === 4 || z === 13 ? TEAM : TIN));
  tower(b, 41, 7, 12, 16, () => 1, (x, y) => (y === 16 ? K : BRICK[y % 3]), 1);
  for (let t = 0; t <= 1; t += 0.03) b.set(34 + (29 - 34) * t, 4 + Math.sin(t * Math.PI) * 2, 10 + (18 - 10) * t, COPPER);
  // lightning rods on the corners, a wrought-iron fence with a gap at the gate
  for (const [x, z] of [[2, 2], [2, 44], [44, 44]]) { b.box(x, 3, z, x, 14, z, IRON_L); b.set(x, 15, z, COPPER); }
  for (let x = 0; x <= 47; x++) for (let z = 0; z <= 47; z++) { if ((x !== 0 && x !== 47 && z !== 0 && z !== 47) || (z === 47 && x > 20 && x < 28)) continue; b.set(x, 3, z, IRON); if ((x + z) % 2 === 0) b.set(x, 4, z, IRON); if ((x + z) % 6 === 0) b.set(x, 5, z, COPPER); }
  for (let i = 0; i < 6; i++) b.box(5 + i * 3, 3, 6, 6 + i * 3, 6, 7, (x, y) => (y === 6 ? (i % 2 ? GLOW : COPPER) : IRON)); // a row of iron battery cells
  for (let z = 22; z <= 26; z++) b.box(23, 3, z + 18, 24, 3, z + 18, STONE[2]); // the path in
  return { body: b, bodyPivot: [24, 0, 24] };
}

// ---------------------------------------------------------------- traffic, people, animals (facing +X)
// Horse and buggy: a little black buggy with a folding hood in the paint colour, a horse in the shafts.
function buggy(): ModelDef {
  const b = new VB();
  for (const z of [0, 6]) { for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; b.set(3 + Math.cos(t) * 1.6, 1.6 + Math.sin(t) * 1.6, z, PL_K); } b.set(3, 2, z, IRON); const q = turn() * Math.PI; b.set(3 + Math.round(Math.cos(q)), 2 + Math.round(Math.sin(q)), z, PL); } // the wheels, a spoke going round
  b.box(1, 2, 1, 6, 2, 5, 0x2a2420); b.box(0, 2, 2, 0, 2, 4, PL_K); // the box, a rear step
  b.box(1, 3, 1, 6, 3, 5, (x, y, z) => (z === 1 || z === 5 || x === 1 || x === 6 ? TEAM_D : 0)); // the box
  b.box(4, 3, 2, 4, 4, 4, 0x4a3020); // seat
  b.box(1, 4, 1, 3, 6, 5, (x, y, z) => (y === 6 || x === 1 ? TEAM : z === 1 || z === 5 ? (x === 3 ? TEAM_D : y === 4 ? 0 : TEAM) : 0)); // the hood
  b.box(5, 4, 2, 5, 5, 2, 0x3a3e4e); b.set(5, 6, 2, SKIN); b.set(5, 7, 2, 0x3a2a1c); // the driver
  for (const z of [2, 4]) b.box(7, 2, z, 8, 2, z, PL_K); // shafts
  pony(b, 8, 2);
  return { body: b, bodyPivot: [7, 0, 3] };
}

// Covered wagon: canvas over hoops on a box in the paint colour, two big wheels a side, a horse ahead.
function coveredWagon(): ModelDef {
  const b = new VB();
  for (const [cx, r] of [[2.5, 2], [8.5, 2]] as [number, number][]) for (const z of [0, 7]) { for (let a = 0; a < 20; a++) { const t = (a / 20) * Math.PI * 2; b.set(cx + Math.cos(t) * r, r + Math.sin(t) * r, z, PL_K); } b.set(Math.round(cx), r, z, IRON); }
  b.box(0, 2, 1, 10, 3, 6, (x, y, z) => (y === 2 ? 0x3a2e24 : z === 1 || z === 6 || x === 0 || x === 10 ? TEAM : 0));
  for (let z = 1; z <= 6; z++) { const h = 4 + Math.round(Math.sin(((z - 1) / 5) * Math.PI) * 2.4); for (let x = 1; x <= 9; x++) b.set(x, h, z, x % 3 === 0 ? CANVAS_D : CANVAS); for (const x of [1, 9]) for (let y = 4; y < h; y++) b.set(x, y, z, CANVAS_D); }
  b.box(0, 4, 3, 0, 5, 4, K); // the open back
  b.box(10, 4, 3, 10, 4, 4, 0x4a3020); b.set(10, 5, 3, 0x3a3e4e); b.set(10, 6, 3, SKIN); b.set(10, 7, 3, 0x5a4028); // the driver
  for (const z of [3, 4]) b.box(11, 2, z, 11, 2, z, PL_K);
  pony(b, 11, 3, [0x9a5e30, 0x744420, 0xb47440]);
  return { body: b, bodyPivot: [8.5, 0, 3.5] };
}

// Townsfolk: boots, trousers, a shirt in their colour, a vest, and a hat.
function townsfolk(): ModelDef {
  const b = new VB();
  for (const [z, ph] of [[0, 0.25], [2, 0.75]]) { const x = 1 + swing(ph); b.set(x, 0, z, BOOT); b.set(x, 1, z, 0x4a3e30); b.set(1, 2, z, 0x4a3e30); } // walking: one leg forward as the other goes back
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 1, 2, 4, 1, 0x3a2e24); b.box(1, 3, 0, 1, 4, 0, TEAM_D); b.box(1, 3, 2, 1, 4, 2, TEAM_D); // shirt, vest, arms
  b.box(1, 6, 1, 2, 6, 1, SKIN); b.set(1, 6, 0, 0x4a3426); b.set(1, 6, 2, 0x4a3426);
  b.box(1, 7, 0, 2, 7, 2, 0x5a4028); b.box(1, 8, 1, 2, 8, 1, 0x76563a); // hat brim and crown
  return { body: b, bodyPivot: [1.5, 0, 1.5] };
}

// Texas longhorn: a rangy speckled red-and-white steer with horns sweeping out wide and up at the tips.
function longhorn(): ModelDef {
  const b = new VB();
  const hide = (x: number, y: number, z: number) => (hash3(x, y >> 1, z) < 0.3 ? 0xe0d4bc : hash3(x >> 1, y, z) < 0.5 ? 0x8a4a2a : 0xa86438);
  for (const [x, z, ph] of [[1, 0, 0.5], [1, 3, 0], [6, 0, 0], [6, 3, 0.5]]) { const sw = swing(ph); b.set(x + sw, 1, z, 0x8a4a2a); b.set(x, 2, z, 0x8a4a2a); b.set(x + sw, 0, z, 0x2a2420); } // at a walk
  b.box(0, 3, 0, 7, 5, 3, hide); b.box(6, 6, 1, 7, 6, 2, hide); // body, a hump at the shoulder
  b.box(8, 4, 1, 9, 5, 2, (x, y) => (y === 5 ? 0xa86438 : 0xe0d4bc)); b.set(10, 4, 1, 0x5a3a2a); b.set(10, 4, 2, 0x5a3a2a);
  b.box(8, 6, 0, 8, 6, 3, 0xe8dcc0); b.set(9, 7, 0, 0xc8b898); b.set(9, 7, 3, 0xc8b898); // the horns, tips curling up and forward
  b.set(0, 4, 2, 0x2a2622); b.set(0, 3, 2, 0x2a2622);
  return { body: b, bodyPivot: [4.5, 0, 1.5] };
}

// Pronghorn: slender tan antelope with a white belly and rump, short black pronged horns.
function pronghorn(): ModelDef {
  const b = new VB();
  for (const [x, z, ph] of [[1, 0, 0.5], [1, 2, 0], [5, 0, 0], [5, 2, 0.5]]) { const sw = swing(ph); b.set(x + sw, 1, z, 0xc89a60); b.box(x, 2, z, x, 3, z, 0xc89a60); b.set(x + sw, 0, z, 0x2a2420); } // at a run
  b.box(0, 4, 0, 6, 5, 2, (x, y) => (y === 4 ? 0xece4d4 : x === 0 ? 0xece4d4 : 0xc08a50));
  b.box(6, 6, 1, 7, 6, 1, 0xc08a50); b.box(7, 7, 1, 8, 7, 1, 0xc08a50); b.set(8, 6, 1, 0xece4d4); b.set(8, 7, 1, 0x5a3e28); // neck, white throat band, muzzle
  for (const z of [0, 2]) { b.set(7, 8, z, 0x2a2420); b.set(7, 9, z, 0x2a2420); } // short black horns
  return { body: b, bodyPivot: [3.5, 0, 1] };
}

export const CIVIC: Record<string, () => ModelDef> = {
  cottage: adobeHouse, cottage2: logCabin, townhouse: storeRow, shop: bank, barn, waterTower: waterTank,
  motorPool: liveryStable, recruitOffice: sheriffOffice, bunker: blockhouse, watchtower: lookout, fuelDepot: coalStop,
  powerPlant: animate(steamMill), commTower: telegraph, repairYard: wheelwright, townHall: church, uplink: thunderTower,
  car: animate(buggy), pickup: animate(coveredWagon), civilian: animate(townsfolk, 2), cow: animate(longhorn), deer: animate(pronghorn),
};
