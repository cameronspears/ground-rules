// WILD WEST: the base buildings' frontier looks, standing in for BASE (and the Field Command) by key. Same footprint and pivot as the original.
// Facing +X like every model; the front door is on the south (+Z) face, as in art.ts.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from '../models';
import { widen, animate, turn } from './pose';
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

// The Arsenal's yard round the blacksmith (3 x 3): heavy guns waiting for their carriages, shot stacked in
// pyramids, powder kegs and crates of shells
function armoryYard(b: VB) {
  ground(b, 71, 71);
  for (const z of [63, 67]) { // two cannon barrels on timber blocks, muzzles east, a band in the side's colour
    for (const x of [8, 22]) b.box(x, 1, z - 1, x + 1, 1, z + 1, BOARD_D);
    for (let x = 5; x <= 27; x++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (Math.abs(dy) + Math.abs(dz) < 2 || x < 9) b.set(x, 3 + dy, z + dz, x === 24 || x === 25 ? TEAM : x === 27 ? K : x < 9 ? IRON_D : IRON);
  }
  for (const [cx, cz] of [[36, 64], [44, 66]]) for (let lv = 0; lv < 3; lv++) for (let dx = -2 + lv; dx <= 2 - lv; dx += 2) for (let dz = -2 + lv; dz <= 2 - lv; dz += 2) b.box(cx + dx, 1 + lv * 2, cz + dz, cx + dx + 1, 2 + lv * 2, cz + dz + 1, IRON_D); // round shot in pyramids
  for (const [x, z] of [[62, 6], [65, 6], [63, 9], [62, 60], [66, 63]]) barrel(b, x, z);
  crate(b, 61, 20, 6, 5, 3); crate(b, 62, 20, 4, 4, 2, 4); crate(b, 4, 4, 6, 5, 3); crate(b, 61, 40, 5, 6, 4);
  wheel(b, 55, 6, 66, 5.5, 'x');
  flag(b, 3, 66, 1, 18, 6);
}

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
    if (d > r - 1) c = rim; else if (d < 1.3) c = IRON; else if (Math.abs(Math.sin(Math.atan2(j, i) * 4 + turn() * Math.PI)) < 0.7 / d + 0.08) c = spoke; // (turning: a little further round each frame)
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

// A thick straight timber or girder from one point to another (struts, stays, trestle legs)
function beam(b: VB, a: number[], c: number[], r: number, col: Col) {
  const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) * 1.5) || 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t, z = a[2] + (c[2] - a[2]) * t;
    for (let dx = 0; dx < r; dx++) for (let dz = 0; dz < r; dz++) b.set(x + dx, y, z + dz, col(Math.round(x + dx), Math.round(y), Math.round(z + dz)));
  }
}
// A hollow egg (the balloon's envelope): half-sizes round a centre, coloured by position
function egg(b: VB, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, col: Col) {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
    const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2, w = ((x - cx) / (rx - 1.6)) ** 2 + ((y - cy) / (ry - 1.6)) ** 2 + ((z - cz) / (rz - 1.6)) ** 2;
    if (v <= 1 && w > 1) b.set(x, y, z, col(x, y, z));
  }
}

// ---------------------------------------------------------------- the buildings
// Each has one big shape that says its job from the outline alone, even as a build-menu icon; the side's colour goes
// on flags, trim, bands and a signature part or two, not on every roof, so the roofs and materials tell them apart.

// Windmill (the Generator): the most upright small building. A tall see-through lattice tower of pale timber, a big
// pale many-bladed fan on top and a tail vane in the side's colour; a water tank on stilts, a low shed, a trough. 2 x 2.
function windmill(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (Math.abs(z - 25) < 3 && x > 25 && x < 43 && hash3(x, 1, z) < 0.5 ? 0x7a6448 : 0)); // mud by the trough
  const cx = 16, cz = 18, H = 36;
  for (let y = 1; y <= H; y++) { // the lattice tower, tapering: pale legs banded in the side's colour, open between
    const s = 6.5 - (y - 1) * (5 / (H - 1)), r = Math.round(s);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.set(cx + sx * s, y, cz + sz * s, y % 9 < 2 ? TEAM : LOG_END);
    if (y % 6 === 0) for (let k = -r; k <= r; k++) for (const e of [-r, r]) { b.set(cx + k, y, cz + e, BOARD_L); b.set(cx + e, y, cz + k, BOARD_L); } // girts
    else if (y % 2 === 0) { const k = Math.round(-r + ((y % 6) / 6) * 2 * r); for (const e of [-r, r]) { b.set(cx + k, y, cz + e, BOARD); b.set(cx + e, y, cz - k, BOARD); } } // a light brace
    b.set(cx, y, cz, IRON_L); // the pump rod
  }
  b.box(cx - 2, H + 1, cz - 2, cx + 2, H + 1, cz + 2, BOARD_D); // a platform
  b.box(cx - 1, H + 2, cz - 1, cx + 2, H + 4, cz + 1, (x, y) => (y === H + 4 ? IRON_L : IRON)); // gearbox
  const fy = H + 6, fx = cx + 4;
  b.box(cx + 3, fy, cz, fx, fy, cz, IRON);
  for (let dy = -11; dy <= 11; dy++) for (let dz = -11; dz <= 11; dz++) { // the fan: a big wheel of pale blades, a dark rim to hold its edge
    const d = Math.hypot(dy, dz); if (d > 10.6) continue;
    const a = Math.atan2(dy, dz) + turn() * (Math.PI / 4), u = ((((a + Math.PI) / (Math.PI * 2)) * 16) % 16 + 16) % 16, f = u % 1; // (the fan turning in the wind: two blades round each loop)
    const c = d < 1.8 ? IRON : d > 9.8 ? IRON : Math.abs(d - 3.2) < 0.5 ? IRON_L : f > 0.1 && f < 0.9 ? (d > 7 ? CANVAS : 0xf2ecdc) : 0;
    if (c) b.set(fx, fy + dy, cz + dz, c);
  }
  b.box(cx - 9, fy, cz, cx + 2, fy, cz, IRON_L); // the tail boom and its vane, the side's colour
  b.box(cx - 15, fy - 4, cz, cx - 9, fy + 4, cz, (x, y) => (x === cx - 15 || y === fy - 4 || y === fy + 4 ? TEAM_D : TEAM));
  b.box(cx - 1, 1, cz - 1, cx + 1, 3, cz + 1, IRON); // the pump head, piped across to the tank
  b.box(cx + 2, 2, cz, 37, 2, cz, IRON_L); for (let y = 2; y < 10; y++) b.set(37, y, cz, IRON_L);
  for (const [x, z] of [[33, 9], [41, 9], [33, 17], [41, 17]]) for (let y = 1; y < 10; y++) b.set(x, y, z, LOG); // the water tank on stilts
  tower(b, 37, 13, 10, 17, () => 5, (x, y, z, a) => (y === 17 ? BOARD_D : y === 11 || y === 15 ? IRON : Math.round(a * 6) & 1 ? BOARD : BOARD_L), 1.3);
  trough(b, 28, 24, 41); barrel(b, 43, 23); barrel(b, 43, 26, 4);
  roofed(b, 4, 34, 18, 43, 6, (x, y, z) => (z === 43 && x >= 9 && x <= 12 && y < 5 ? (y === 4 ? BOARD_L : K) : y === 1 ? BOARD_D : boards(x, y, z)), shingles, false, 0.6); // a low shed
  railFence(b, 26, 30, 46, 46, (x, z) => z === 30 && x > 33 && x < 39);
  hay(b, 40, 39, 4, 3, 3); hay(b, 41, 40, 2, 2, 4); barrel(b, 2, 44); lantern(b, 23, 44, 9);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Steam Works (the Reactor): three great brick smokestacks, banded in the side's colour, stand over everything; a low
// boiler house roofed in the side's colour, glowing at its doors, two big riveted boilers on brick saddles, a coal heap. Huge power; a
// huge bang when destroyed. 3 x 3.
function steamWorks(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => ((x > 44 || z > 52) && hash3(x, 1, z) < 0.35 ? (hash3(x, 2, z) < 0.5 ? CINDER : 0x6a5a4a) : 0));
  for (const [cx, top] of [[12, 52], [25, 60], [38, 52]]) { // the stacks: a stone foot, a tapering brick shaft, a band, a corbelled black cap
    tower(b, cx, 14, 1, 4, () => 5.6, (x, y, z) => (y === 4 ? STONE[1] : STONE[(x + y + z) % 3]), 2);
    tower(b, cx, 14, 5, top, (y) => (y >= top - 3 ? 5 : 4.4 - (y - 5) * 0.014), (x, y, z) => (y === top ? K : y >= top - 3 ? (y === top - 3 ? BRICK[2] : IRON_D) : y === top - 12 || y === top - 11 ? TEAM : y === top - 13 ? TEAM_D : brick(x, y, z)), 1.4);
  }
  const wall: Col = (x, y, z) => { // the boiler house: brick, its firing door and tall windows lit by the fires
    const face = z === 52 ? x : x === 44 ? z : -1, m = (face + 600) % 6;
    if (z === 52 && x >= 19 && x <= 27 && y < 10) return y === 9 || x === 19 || x === 27 ? IRON : y < 3 ? GLOW_L : GLOW;
    if (face >= 0 && (m === 2 || m === 3) && y >= 4 && y <= 9) return y === 9 ? BRICK[2] : y >= 7 ? GLOW_L : GLOW;
    if (y <= 1) return STONE[(x + z) % 3];
    if (y === 11) return TEAM; // a painted band under the eaves
    return brick(x, y, z);
  };
  roofed(b, 6, 24, 44, 52, 12, wall, teamRoofZ, false, 0.25); // (the roof in the side's colour: at game size it's the part you see)
  for (const cz of [22, 40]) { // the boilers: big riveted drums on brick saddles, fireboxes glowing at the east end
    for (const x of [50, 58, 66]) b.box(x, 1, cz - 4, x + 1, 2, cz + 4, BRICK[0]);
    for (let x = 47; x <= 69; x++) for (let dy = -6; dy <= 6; dy++) for (let dz = -6; dz <= 6; dz++) {
      const d = Math.hypot(dy, dz); if (d > 6.2) continue;
      b.set(x, 9 + dy, cz + dz, x === 47 || x === 69 ? IRON_D : (x - 47) % 5 === 0 ? IRON_L : dy >= 4 ? 0x5a5a62 : IRON);
    }
    b.box(70, 4, cz - 2, 70, 7, cz + 2, (x, y) => (y === 7 ? IRON : GLOW_L));
    tower(b, 58, cz, 15, 17, () => 2, (x, y) => (y === 17 ? BRASS : BRASS_D), 2); // the steam dome
    b.box(45, 10, cz - 1, 46, 11, cz + 1, IRON_L); // piped into the house
  }
  heap(b, 58, 61, 10, 8, 7, (x, y, z, r) => (r < 0.25 ? 0x3a3634 : r < 0.6 ? 0x2a2624 : 0x222020)); // the coal heap
  for (let x = 8; x <= 46; x++) { b.set(x, 1, 58, IRON_L); b.set(x, 1, 61, IRON_L); if (x % 2 === 0) b.box(x, 0, 57, x, 0, 62, BOARD_D); } // a coal tramway
  b.box(28, 2, 58, 33, 4, 61, (x, y) => (y === 4 ? 0x2a2624 : IRON)); // and its tub
  barrel(b, 12, 65); barrel(b, 15, 65); barrel(b, 13, 68, 4);
  for (const [x, z] of [[2, 30], [46, 2], [2, 56], [68, 50]]) lantern(b, x, z, 11);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Stamp Mill (the Scrapyard): the gold-country mill, a tall timber building stepping down a hillside in three tiers
// under dark shingle, ore fed in at the top from a trestle off the hill, the stamps pounding at the open foot, and a
// long sluice on trestles running away east to the pale tailings. 3 x 2.
function stampMill(): ModelDef {
  const b = new VB();
  ground(b, 71, 47);
  const STRATA = [0x9a6a48, 0x8a5a3c, 0xa87a54];
  const hill = (x: number) => Math.min(20, Math.round(20 - (x - 4) * 1.3));
  for (let x = 0; x <= 19; x++) for (let z = 0; z <= 47; z++) { // the hillside the mill is built against
    const h = hill(x) - (hash3(x, 9, z) < 0.3 ? 1 : 0);
    for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? (hash3(x, y, z) < 0.12 ? SAGE : DIRT_L) : STRATA[(y + (hash3(x >> 2, y, z >> 2) < 0.3 ? 1 : 0)) % 3]);
  }
  // three houses, each lower and further east: weathered boards, rows of small windows, mono-pitch shingle roofs
  // with a painted fascia in the side's colour along each eave
  const tier = (x0: number, x1: number, z0: number, z1: number, wallH: number, open = false) => {
    b.box(x0, 1, z0, x1, wallH, z1, (x, y, z) => {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) return 0;
      if (open && z === z1 && x > x0 + 1 && x < x1 - 1 && y <= wallH - 4) return 0; // open on the stamps
      if ((z === z1 || x === x1) && y > wallH - 7 && y < wallH - 3 && ((z === z1 ? x : z) % 4 === 1)) return K; // windows
      return y === 1 ? GREY_D : weathered(x, y, z);
    });
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const h = wallH + 1 + Math.round((x1 + 1 - x) * 0.45);
      for (let z = z0 - 1; z <= z1 + 1; z++) b.set(x, h, z, x === x1 + 1 || z === z1 + 1 ? TEAM_D : z % 4 === 0 ? TEAM_D : TEAM);
      if (x >= x0 && x <= x1) for (const z of [z0, z1]) for (let y = wallH + 1; y < h; y++) b.set(x, y, z, weathered(x, y, z));
    }
  };
  tier(12, 24, 6, 34, 33);
  tier(24, 36, 8, 34, 24);
  tier(36, 48, 10, 34, 15, true);
  b.box(38, 1, 29, 46, 3, 33, (x, y) => (y === 3 ? IRON_L : IRON_D)); // the mortar box
  for (let x = 39; x <= 45; x += 2) { b.set(x, 4, 31, IRON); for (let y = 5 + (x % 4 === 1 ? 2 : 0); y <= 11; y++) b.set(x, y, 31, IRON_L); } // the stamps, rising and falling
  b.box(38, 11, 31, 46, 11, 31, IRON);
  wheel(b, 49, 9, 22, 6.5, 'x', BOARD_L, IRON); // the flywheel on the east wall
  tower(b, 44, 14, 19, 30, () => 1.3, (x, y) => (y >= 29 ? K : y === 25 ? TEAM : IRON), 1.2); // the engine's stack
  // the ore trestle: a tramway on tall timber legs from the bin on the hill into the top of the mill
  b.box(1, 21, 14, 7, 27, 26, (x, y, z) => (x === 1 || x === 7 || z === 14 || z === 26 ? (y === 26 ? TEAM : boards(x, y, z)) : y === 27 ? (hash3(x, y, z) < 0.2 ? GOLD : 0x7a6a58) : 0));
  for (let x = 7; x <= 12; x++) { const y = 28 + Math.round((x - 7) * 0.5); b.box(x, y, 18, x, y, 22, BOARD_D); b.set(x, y + 1, 18, BOARD_L); b.set(x, y + 1, 22, BOARD_L); }
  { const c = new VB(); oreCart(c, 0, 0); c.each((x, y, z, col) => b.set(2 + z, 20 + y, 30 + x, col)); }
  for (let z = 28; z <= 44; z++) { b.set(3, 20 + (z > 36 ? 0 : 0), z, IRON_L); b.set(6, 20, z, IRON_L); }
  // the sluice: a trough high on trestles, water in it, falling away east to the tailings
  for (let x = 49; x <= 70; x++) {
    const y = 13 - Math.round((x - 49) * 0.4);
    b.box(x, y, 20, x, y, 24, BOARD); b.set(x, y + 1, 20, BOARD_D); b.set(x, y + 1, 24, BOARD_D); b.box(x, y + 1, 21, x, y + 1, 23, x % 4 === 0 ? WATER_L : WATER);
    if (x % 4 === 1) for (let yy = 1; yy < y; yy++) { b.set(x, yy, 20, LOG_L); b.set(x, yy, 24, LOG_L); if (yy % 4 === 0) b.box(x, yy, 21, x, yy, 23, BOARD_D); }
  }
  heap(b, 62, 38, 9, 7, 6, (x, y, z, r) => (r < 0.4 ? TAIL_D : TAIL)); heap(b, 61, 9, 8, 6, 4, (x, y, z, r) => (r < 0.4 ? TAIL_D : TAIL)); // tailings
  flag(b, 13, 7, 39, 45, 5);
  barrel(b, 50, 40); barrel(b, 53, 42); lantern(b, 50, 2, 10);
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Gold Mine (the Derrick): a tall timber head-frame over the shaft is the whole picture: thick braced legs, raking
// back-stays, and a big sheave wheel at the top with its spokes in the side's colour. A small hoist house winds it;
// ore carts run out on rails to the spoil heap. 2 x 2.
function goldMine(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (x >= 21 && x <= 27 && z >= 21 && z <= 27 ? IRON_D : 0)); // the shaft
  b.box(19, 1, 19, 29, 1, 29, (x, y, z) => (x === 19 || x === 29 || z === 19 || z === 29 ? BOARD_L : 0)); // its collar
  const H = 40;
  for (let y = 1; y <= H; y++) { // the head-frame: four thick legs, splayed at the foot, braced, banded in the side's colour
    const k = Math.round((H - y) * 0.07);
    for (const [x, z] of [[19 - k, 19 - k], [28 + k, 19 - k], [19 - k, 28 + k], [28 + k, 28 + k]]) b.box(x, y, z, x + 1, y, z + 1, y % 10 < 2 ? TEAM : (x + z) % 2 ? LOG_L : LOG_END);
    if (y % 8 === 0) for (let i = 19 - k; i <= 29 + k; i++) for (const e of [19 - k, 29 + k]) { b.set(i, y, e, BOARD); b.set(e, y, i, BOARD); }
  }
  beam(b, [19, H, 20], [6, 9, 20], 2, () => LOG_L); beam(b, [19, H, 27], [6, 9, 27], 2, () => LOG_L); // the back-stays to the hoist house
  b.box(18, H + 1, 18, 30, H + 1, 30, (x, y, z) => (x === 18 || x === 30 || z === 18 || z === 30 ? BOARD_D : 0));
  for (const z of [21, 27]) b.box(22, H + 2, z, 26, H + 4, z, LOG); // the bearers
  const wy = H + 9;
  wheel(b, 24, wy, 23, 7, 'z', TEAM, IRON); wheel(b, 24, wy, 25, 7, 'z', TEAM, IRON); // the sheave wheel, double-rimmed
  b.box(24, wy, 22, 24, wy, 26, IRON_L);
  for (let y = 2; y < wy - 6; y++) b.set(31, y, 24, K); // the rope down the shaft, and back to the drum
  b.box(17, 1, 23, 17, 1, 23, K); wire(b, [17, wy, 24], [10, 6, 24], 0);
  roofed(b, 2, 16, 11, 32, 7, (x, y, z) => (x === 11 && z >= 22 && z <= 26 && y < 6 ? (y === 5 ? BOARD_L : K) : y === 1 ? BOARD_D : boards(x, y, z)), teamRoofZ, true, 0.8); // the hoist house
  tower(b, 5, 19, 8, 16, () => 1.2, (x, y) => (y >= 15 ? K : IRON), 1.2);
  for (let x = 30; x <= 47; x++) { if (x % 2 === 0) b.box(x, 0, 22, x, 0, 26, BOARD_D); b.set(x, 1, 23, IRON_L); b.set(x, 1, 26, IRON_L); } // the rails
  oreCart(b, 33, 23); oreCart(b, 41, 23);
  heap(b, 37, 9, 9, 7, 8, (x, y, z, r) => (r < 0.05 ? GOLD : r < 0.4 ? 0x7a5a40 : r < 0.75 ? 0x8a6a4c : 0x6a4a34)); // the spoil heap
  heap(b, 41, 38, 4, 3, 3, (x, y, z, r) => (r < 0.25 ? GOLD : 0x7a6a58)); // a pile of good ore
  crate(b, 33, 41, 3, 3, 3); barrel(b, 4, 36); barrel(b, 7, 36); barrel(b, 5, 39, 4); lantern(b, 44, 18, 9);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Saloon (the Barracks): the frontier's town front. A tall square false front of pale painted boards faces the street,
// a big sign board across it, a cornice and balcony rail in the side's colour, swinging doors under the balcony; the
// low shingled hall behind hides behind it. A horse at the hitching rail. 2 x 2.
function saloon(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  const wall: Col = (x, y, z) => (x === 40 && y >= 3 && y <= 6 && z % 6 === 2 ? GLOW_L : y === 1 ? BOARD_D : y % 2 ? BOARD_L : BOARD);
  roofed(b, 6, 8, 40, 32, 13, wall, shingles, true, 0.3);
  const F = 33, T = 32;
  b.box(4, 1, F, 42, T, F + 1, (x, y, z) => { // the false front, two boards deep
    if (z === F && y > 1) return PAINT_D;
    if (y === T) return TEAM_D; // the cornice
    if (y >= T - 3) return y === T - 3 ? TEAM_D : TEAM;
    if (y >= 19 && y <= 27 && x >= 8 && x <= 38) return y === 19 || y === 27 || x === 8 || x === 38 ? TEAM_D : y >= 21 && y <= 25 && x >= 10 && x <= 36 && ((x - 10) % 5 < 3) && (y !== 23 || (x - 10) % 5 === 1) ? GOLD : K; // the big sign
    if (x >= 20 && x <= 26 && y <= 8) return y === 8 ? BOARD_D : y >= 3 && y <= 6 && x !== 23 ? (y === 3 || y === 6 ? BOARD_D : BOARD_L) : K; // the swinging doors
    const m = x % 8;
    if ((m === 2 || m === 3 || m === 4) && ((y >= 3 && y <= 7) || (y >= 13 && y <= 16)) && !(x >= 18 && x <= 28 && y <= 8)) return y === 7 || y === 16 ? PAINT : y >= 15 || y === 5 ? GLOW_L : K; // windows, lit
    return y === 1 ? BOARD_D : y === 10 ? PAINT_D : x % 4 === 0 ? PAINT_D : PAINT;
  });
  b.box(13, T + 1, F, 33, T + 5, F + 1, (x, y) => (y >= T + 5 - Math.floor(Math.abs(x - 23) / 4) ? 0 : y === T + 4 - Math.floor(Math.abs(x - 23) / 4) || x === 13 || x === 33 ? TEAM_D : TEAM)); // the stepped pediment over the middle
  flag(b, 23, F, T + 5, T + 11, 5);
  b.box(3, 1, F + 2, 43, 1, 42, (x, y, z) => (z % 2 ? BOARD : BOARD_L)); // the boardwalk
  b.box(4, 10, F + 2, 42, 10, 41, (x, y, z) => (z === 41 ? TEAM_D : z % 2 ? BOARD_D : BOARD)); // the balcony over it, its rail painted
  for (let x = 4; x <= 42; x++) { b.set(x, 13, 41, TEAM); if (x % 2 === 0) { b.set(x, 11, 41, PAINT); b.set(x, 12, 41, PAINT); } }
  for (let z = F + 2; z <= 41; z++) for (const x of [4, 42]) { b.set(x, 13, z, TEAM); if (z % 2 === 0) { b.set(x, 11, z, PAINT); b.set(x, 12, z, PAINT); } }
  for (const x of [4, 13, 22, 24, 33, 42]) for (let y = 2; y < 10; y++) b.set(x, y, 41, PAINT_D); // its posts
  for (const x of [6, 16]) for (let y = 1; y <= 3; y++) b.set(x, y, 45, LOG); b.box(6, 3, 45, 16, 3, 45, LOG_L); // the hitching rail
  horse(b, 7, 43); trough(b, 28, 43, 36);
  roofed(b, 40, 1, 44, 5, 7, (x, y, z) => (z === 5 && x === 42 && y >= 5 && y <= 6 ? K : boards(x, y, z)), shingles, true, 0.8); // the outhouse
  for (const [x, z] of [[2, 2], [5, 2], [2, 5]]) barrel(b, x, z, 4); crate(b, 10, 2, 4, 3, 3); crate(b, 11, 3, 2, 2, 5);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Wagon Works and Livery (the Vehicle Depot): THE barn, the only one on the frontier: a big barn under a high gambrel
// roof in the side's colour, two great doors with white X braces, a hay loft and its hoist, a covered wagon in the yard,
// wheels stacked against the walls and horses in the corral. 3 x 3.
function wagonWorks(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => (z > 45 && x < 34 && hash3(x, 3, z) < 0.1 ? HAY_D : 0));
  const x0 = 6, x1 = 58, z0 = 6, z1 = 42, wallH = 14, zm = 24;
  b.box(x0, 1, z0, x1, wallH, z1, (x, y, z) => {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) return 0;
    if (z === z1 && ((x >= 10 && x <= 30) || (x >= 34 && x <= 54)) && y <= 13) { // the two great doors, white X braces
      const lx = x < 32 ? x - 10 : x - 34, d1 = Math.abs(lx - (y - 1) * 20 / 12), d2 = Math.abs(20 - lx - (y - 1) * 20 / 12);
      return y === 13 || lx === 0 || lx === 20 || lx === 10 || d1 < 1.1 || d2 < 1.1 ? PAINT : x < 32 ? K : BOARD;
    }
    if (y === wallH || x === x0 || x === x1 || (z === z1 && (x === 32 || x === 33))) return PAINT_D; // white corner boards and eave trim
    return y === 1 ? BOARD_D : weathered(x, y, z);
  });
  for (let z = z0 - 1; z <= z1 + 1; z++) { // the gambrel roof: steep lower slopes, a shallow cap
    const dz = Math.abs(z - zm), ry = dz > 11 ? Math.round((20 - dz) * 1.6) : 14 + Math.round((11 - dz) * 0.5);
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      b.set(x, wallH + 1 + ry, z, dz < 1 ? TEAM_D : x % 4 === 0 ? TEAM_D : TEAM);
      if (x === x0 || x === x1) for (let y = wallH + 1; y < wallH + 1 + ry; y++) b.set(x, y, z, x === x1 && y >= 18 && y <= 26 && dz <= 3 ? (y === 26 || dz === 3 ? PAINT : y < 20 ? HAY : K) : weathered(x, y, z)); // the hay loft door
    }
  }
  b.box(59, 29, 24, 63, 29, 24, LOG_L); for (let y = 21; y < 29; y++) b.set(63, y, 24, ROPE); b.box(62, 18, 23, 64, 20, 25, HAY); // the loft hoist and a bale on it
  b.box(30, 36, 22, 34, 38, 26, (x, y, z) => (y === 37 && (x + z) % 2 === 0 ? K : PAINT)); b.box(29, 39, 21, 35, 39, 27, TEAM_D); // a cupola
  for (const cz of [11, 18, 25, 32]) wheel(b, 4, 5, cz, 3.8, 'x'); // wheels stacked against the west wall
  for (const [x, z] of [[60, 8], [60, 14]]) wheel(b, x, 5, z, 3.8, 'x');
  // the covered wagon: a bed with a painted side, two pairs of wheels, a canvas bonnet on its hoops
  b.box(10, 4, 51, 26, 6, 59, (x, y, z) => (z === 51 || z === 59 ? (y === 5 ? TEAM : BOARD) : y === 4 ? BOARD_D : 0));
  for (const x of [12, 24]) for (const z of [50, 60]) wheel(b, x, 4, z, 3.6, 'z');
  for (let z = 51; z <= 59; z++) { const h = 7 + Math.round(Math.sqrt(Math.max(0, 1 - ((z - 55) / 4.6) ** 2)) * 6); for (let x = 11; x <= 25; x++) { b.set(x, h, z, x % 4 === 3 ? CANVAS_D : CANVAS); if (x === 11 || x === 25) for (let y = 7; y < h; y++) b.set(x, y, z, x === 25 && Math.abs(z - 55) < 2 ? K : CANVAS_D); } }
  b.box(27, 3, 55, 33, 3, 55, BOARD_D);
  railFence(b, 36, 47, 70, 70, (x, z) => z === 47 && x > 49 && x < 55); // the corral
  horse(b, 54, 58); horse(b, 42, 62, 0x5a4030); trough(b, 58, 66, 67); hay(b, 38, 50, 4, 3, 3);
  for (let y = 1; y <= 4; y++) b.box(4, y, 63 + (y % 2), 22, y, 66 + (y % 2), (x) => (x % 5 === 0 ? BOARD_D : BOARD_L)); // a lumber pile
  barrel(b, 30, 64); barrel(b, 30, 67, 4); lantern(b, 2, 46, 11); lantern(b, 34, 44, 11);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Blacksmith (the Workshop): low and open. A great brick forge stands out in the yard, its bed of coals glowing, a tall
// chimney rising from it; behind, a low open-fronted lean-to of tools and iron under shingle with an awning edge in
// the side's colour; the anvil, quench tub and wheels about, a horseshoe sign on a post. 2 x 2.
function blacksmith(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (x > 8 && x < 34 && z > 18 && z < 40 && hash3(x, 4, z) < 0.35 ? CINDER : 0));
  // the lean-to: closed at the back and west, open to the yard, its roof falling to the south
  b.box(4, 1, 4, 34, 12, 16, (x, y, z) => {
    if (z === 4 || x === 4) return y === 1 ? BOARD_D : y > 13 - Math.round((z - 3) * 0.2) - 1 ? 0 : boards(x, y, z);
    if ((x === 34 || x === 19) && z === 16 && y < 10) return LOG; // posts
    return 0;
  });
  for (let z = 3; z <= 18; z++) { const y = 13 - Math.round((z - 3) * 0.2); b.box(3, y, z, 35, y, z, (x) => (z === 18 ? ((x >> 1) % 2 ? TEAM : TEAM_L) : z === 17 ? TEAM_D : x % 3 === 0 ? TEAM_D : TEAM)); for (let yy = 12; yy < y; yy++) b.set(4, yy, z, boards(4, yy, z)); } // its roof in the side's colour, the eave edge striped
  for (let y = 4; y <= 8; y++) for (let x = 8; x <= 30; x += 2) if ((x + y) % 3) b.set(x, y, 5, IRON_L); // tongs and hammers on the back wall
  for (let y = 1; y <= 3; y++) b.box(24, y, 7, 32, y, 12, (x, yy, z) => ((x + z + yy) % 2 ? IRON_L : 0)); // a rack of bar iron
  // the forge: a brick hearth, a big bed of glowing coals, its mouth glowing, the chimney climbing from its back
  b.box(9, 1, 20, 21, 6, 30, (x, y, z) => {
    if (y === 6) return x >= 11 && x <= 19 && z >= 22 && z <= 29 ? (hash3(x, y, z) < 0.35 ? GLOW_L : hash3(x, 1, z) < 0.15 ? 0xffe8a8 : GLOW) : BRICK[2];
    if ((z === 30 || x === 21) && y >= 2 && y <= 4 && ((z === 30 && x >= 13 && x <= 17) || (x === 21 && z >= 23 && z <= 27))) return y === 4 ? IRON : GLOW_L; // the mouth
    return y === 1 ? STONE[(x + z) % 3] : brick(x, y, z);
  });
  b.box(13, 7, 20, 17, 7, 21, BRICK[2]);
  tower(b, 15, 20, 7, 32, (y) => (y >= 30 ? 2.9 : 2.4), (x, y, z) => (y === 32 ? K : y >= 30 ? IRON_D : brick(x, y, z)), 1.3); // the chimney
  b.box(6, 2, 23, 8, 4, 27, LEATHER); b.box(5, 3, 24, 5, 3, 26, BOARD_D); // the bellows
  tower(b, 27, 27, 1, 4, () => 2, (x, y) => (y === 4 ? LOG_END : LOG), 2); // the anvil on its stump
  b.box(24, 5, 26, 30, 5, 28, IRON); b.box(25, 6, 26, 30, 6, 28, IRON_L); b.box(31, 6, 27, 33, 6, 27, IRON_L);
  tower(b, 25, 34, 1, 3, () => 2.2, (x, y) => (y === 3 ? WATER : y === 2 ? IRON_L : BOARD), 1); // the quench tub
  for (const x of [14, 20]) for (let y = 1; y <= 14; y++) b.set(x, y, 42, LOG); b.box(13, 14, 42, 21, 14, 42, LOG_L); // the sign on its post
  b.box(14, 8, 43, 20, 13, 43, (x, y) => (x === 14 || x === 20 || y === 8 || y === 13 ? TEAM_D : TEAM));
  for (const [x, y] of [[15, 12], [15, 11], [15, 10], [16, 9], [17, 9], [18, 9], [19, 10], [19, 11], [19, 12]]) b.set(x, y, 44, IRON_L);
  wheel(b, 8, 5, 36, 3.8); wheel(b, 3, 5, 30, 3.8, 'x'); // wheels leaning on the shed
  heap(b, 7, 12, 3, 2, 3, (x, y, z, r) => (r < 0.5 ? CINDER : CINDER_D)); // coal
  // the wagon in the yard, one corner on a block, its wheel off and lying by
  b.box(32, 4, 34, 44, 5, 41, (x, y, z) => (z === 34 || z === 41 || x === 32 || x === 44 ? (y === 5 ? TEAM_D : BOARD) : y === 4 ? BOARD_D : 0));
  wheel(b, 34, 4, 33, 3.6); wheel(b, 34, 4, 42, 3.6); wheel(b, 42, 4, 42, 3.6); b.box(41, 1, 32, 43, 3, 34, LOG_L);
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { const d = Math.hypot(dx, dz); if (d <= 3.8 && (d > 2.8 || d < 1.2 || (dx === 0 || dz === 0))) b.set(40 + dx, 1, 26 + dz, d > 2.8 ? IRON_L : BOARD_L); }
  horse(b, 33, 19); for (let y = 1; y <= 4; y++) b.set(45, y, 20, LOG);
  lantern(b, 2, 40, 10);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Balloon Field (the Airfield): a big striped balloon riding high on its tethers over the field is the picture, its
// gores in the side's colour and canvas, a wicker basket under it; a canvas balloon shed, another envelope laid out
// being filled from the gas wagon, a mooring mast and a windsock. 3 x 3.
function balloonField(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => { const h = hash3(x, 5, z); return h < 0.25 ? 0xb8a070 : h < 0.3 ? SAGE : DIRT_L; });
  for (const [cx, cz] of [[48, 22], [48, 50]]) b.box(cx - 10, 0, cz - 10, cx + 10, 0, cz + 10, (x, y, z) => { const d = Math.hypot(x - cx, z - cz); return d < 9.5 && d > 8.5 && (x + z) % 2 === 0 ? 0xf0ece0 : 0; });
  for (let x = 4; x <= 28; x++) for (let z = 8; z <= 62; z++) { // the shed: canvas on a barrel of timber ribs, its arch trimmed in the side's colour
    const dx = (x - 16) / 12, top = Math.round(Math.sqrt(Math.max(0, 1 - dx * dx)) * 15);
    if (z === 8 || z === 62) for (let y = 1; y <= top; y++) b.set(x, y, z, z === 62 && Math.abs(x - 16) < 7 && y < 11 ? K : y >= top - 1 ? TEAM : CANVAS_D);
    b.set(x, Math.max(1, top), z, (z - 8) % 9 === 0 ? LOG_L : z === 62 || z === 8 ? TEAM : (z >> 2) % 2 ? CANVAS : CANVAS_D);
  }
  // the balloon up: a big envelope of gores, a neck, ropes to a wicker basket, tethered down to stakes
  const bx = 48, bz = 48, by = 40;
  egg(b, bx, by, bz, 11, 12, 11, (x, y, z) => {
    const a = Math.atan2(z - bz, x - bx), team = Math.floor((a + Math.PI) / (Math.PI / 4)) % 2 === 0, up = (y - by) / 12;
    return up > 0.85 ? TEAM_D : team ? (up > 0.45 ? TEAM_L : up < -0.5 ? TEAM_D : TEAM) : up > 0.45 ? 0xf4eedc : up < -0.5 ? CANVAS_D : CANVAS;
  });
  tower(b, bx, bz, by - 15, by - 11, (y) => 1.6 + (y - (by - 15)) * 0.8, (x, y) => (y === by - 15 ? BRASS_D : CANVAS_D), 1.2, true); // the neck
  b.box(bx - 2, by - 22, bz - 2, bx + 2, by - 19, bz + 2, (x, y, z) => (y === by - 19 ? LEATHER : (x + y) % 2 ? WICKER : 0x8a6a3a)); // the basket
  for (const [x, z] of [[bx - 2, bz - 2], [bx + 2, bz - 2], [bx - 2, bz + 2], [bx + 2, bz + 2]]) wire(b, [x, by - 18, z], [bx + (x - bx) * 0.8, by - 15, bz + (z - bz) * 0.8], 0, ROPE);
  for (const [x, z] of [[38, 40], [58, 58], [58, 40], [38, 58]]) { wire(b, [x, 1, z], [bx + (x - bx) * 0.2, by - 22, bz + (z - bz) * 0.2], 0, ROPE); b.box(x, 1, z, x, 2, z, LOG_END); }
  // the other being filled: an envelope lying on the field, a hose to the gas wagon
  for (let x = 37; x <= 59; x++) for (let z = 15; z <= 29; z++) { const e = ((x - 48) / 11) ** 2 + ((z - 22) / 7) ** 2; if (e > 1) continue; const h = 1 + Math.round(Math.sqrt(1 - e) * 3); b.set(x, h, z, Math.floor((x - 37) / 3) % 2 ? CANVAS_D : CANVAS); if (h > 1) b.set(x, h - 1, z, CANVAS_D); }
  b.box(57, 3, 31, 66, 4, 37, BOARD_D); for (const x of [59, 64]) for (const z of [30, 38]) wheel(b, x, 3, z, 2.6, 'z');
  for (const x of [58, 61, 64]) tower(b, x + 0.5, 34, 5, 9, () => 1.6, (xx, y) => (y === 6 || y === 9 ? IRON : BOARD_L), 2);
  wire(b, [58, 6, 33], [55, 2, 25], -1, LEATHER);
  // the mooring mast: a timber lattice, a ring at the top and a pennant
  for (let y = 1; y <= 20; y++) { const s = Math.round(3 - y * 0.1); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.set(63 + sx * s, y, 9 + sz * s, LOG_L); if (y % 4 === 0) for (let k = -s; k <= s; k++) for (const e of [-s, s]) { b.set(63 + k, y, 9 + e, BOARD); b.set(63 + e, y, 9 + k, BOARD); } }
  b.box(61, 20, 7, 65, 20, 11, BOARD_D); tower(b, 63, 9, 21, 21, () => 1.5, () => BRASS, 2); b.set(63, 22, 9, IRON); b.box(64, 23, 9, 68, 23, 9, TEAM); b.box(64, 22, 9, 66, 22, 9, TEAM_D); b.set(63, 23, 9, IRON);
  for (let y = 1; y < 16; y++) b.set(66, y, 68, LOG_L); b.box(67, 13, 68, 70, 15, 68, (x) => (x % 2 ? TEAM : CANVAS)); // windsock
  crate(b, 34, 64, 4, 4, 4); crate(b, 38, 65, 3, 3, 3); for (let x = 52; x <= 58; x += 2) b.box(x, 1, 66, x + 1, 1, 70, IRON_L); // gas cylinders
  for (let z = 3; z <= 68; z += 6) b.set(32, 1, z, LOG_END); lantern(b, 69, 40, 12);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Ironworks (the Proving Ground): a squat stone blast furnace, banded in iron and glowing orange at its tuyeres and
// tap, molten iron running out in glowing channels across the casting floor; a skip incline up to its mouth, a big
// gantry crane in the side's colour over the yard lifting an iron plate, a great gun barrel finished on trestles. 3 x 3.
function ironworks(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => (hash3(x, 6, z) < 0.3 ? CINDER : 0));
  const cx = 24, cz = 22;
  tower(b, cx, cz, 1, 3, () => 14, (x, y, z) => (y === 3 ? STONE[1] : STONE[(x + y + z) % 3]), 14); // the stone base
  const r = (y: number) => (y < 14 ? 9.5 + (y - 4) * 0.2 : 11.5 - (y - 14) * 0.3); // the furnace: swelling to the bosh, then tapering
  tower(b, cx, cz, 4, 30, r, (x, y, z, a) => {
    if (y >= 6 && y <= 8 && Math.abs(Math.sin(a * 4)) < 0.3) return y === 8 ? IRON : GLOW_L; // the tuyeres, glowing
    if (y === 25 || y === 26) return TEAM; // a band in the side's colour
    if (y % 5 === 0) return IRON_L; // iron hoops
    return STONE[(x + y + z) % 3];
  }, 1.6);
  tower(b, cx, cz, 30, 30, () => 7.5, (x, y, z) => (Math.hypot(x - cx, z - cz) < 4.5 ? GLOW : IRON), 8); // its mouth, glowing
  tower(b, cx, cz, 31, 33, () => 8.5, (x, y, z) => (y === 33 ? IRON_L : (x + z) % 3 === 0 ? IRON : 0), 1.2, true); // the charging-floor rail
  tower(b, cx - 3, cz - 3, 31, 38, () => 1.8, (x, y) => (y >= 37 ? K : IRON), 1.2); // a short stack
  b.box(cx - 2, 1, cz + 10, cx + 2, 5, cz + 13, (x, y, z) => (y >= 4 ? IRON : x === cx && z === cz + 13 ? 0 : GLOW_L)); // the tap hole
  for (let z = cz + 14; z <= 54; z++) b.set(cx, 0, z, GLOW_L); // the runner, and the pig beds off it
  for (let z = 40; z <= 54; z += 3) for (let x = cx - 14; x <= cx + 14; x++) if (x !== cx) b.set(x, 0, z, Math.abs(x - cx) % 4 === 0 ? 0x5a2a1a : GLOW);
  b.box(cx - 15, 1, 38, cx - 15, 1, 56, BOARD_D); b.box(cx + 15, 1, 38, cx + 15, 1, 56, BOARD_D);
  // the skip incline: a girder from the yard up to the furnace's mouth, a skip on it
  beam(b, [52, 1, cz - 2], [cx + 9, 32, cz - 2], 1, () => IRON); beam(b, [52, 1, cz + 2], [cx + 9, 32, cz + 2], 1, () => IRON);
  for (let i = 0; i <= 6; i++) { const t = i / 6, x = Math.round(52 + (cx + 9 - 52) * t), y = Math.round(1 + 31 * t); b.box(x, 1, cz - 2, x, y, cz - 2, LOG_L); b.box(x, 1, cz + 2, x, y, cz + 2, LOG_L); }
  b.box(41, 13, cz - 1, 43, 15, cz + 1, IRON_L);
  // the gantry crane over the yard, the side's colour
  for (const [x, z] of [[54, 34], [69, 34], [54, 68], [69, 68]]) b.box(x, 1, z, x + 1, 27, z + 1, (xx, y) => (y % 6 === 0 ? TEAM_D : TEAM));
  for (const x of [54, 69]) b.box(x, 28, 34, x + 1, 29, 69, (xx, y, z) => (z % 4 === 0 ? TEAM_D : TEAM));
  b.box(54, 30, 50, 70, 31, 52, (x) => (x % 3 === 0 ? TEAM_D : TEAM)); b.box(60, 29, 50, 63, 29, 52, IRON);
  for (let y = 16; y < 29; y++) b.set(61, y, 51, K); b.box(56, 14, 47, 66, 15, 55, (x, y) => (y === 15 ? IRON_L : IRON)); // an iron plate on the hook
  for (let y = 1; y <= 4; y++) b.box(56 + (y % 2), y, 58, 67 - (y % 2), y, 66, (x, yy) => (yy % 2 ? IRON : IRON_L)); // plates stacked
  // a great gun barrel finished on its trestles
  for (let x = 6; x <= 34; x++) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) { const rr = x >= 32 ? 3.4 : 3.4 - (x - 6) * 0.04, d = Math.hypot(dy, dz); if (d > rr) continue; b.set(x, 6 + dy, 63 + dz, x === 34 && d < 1.5 ? K : dy >= 2 && Math.abs(dz) < 2 ? IRON_L : IRON); }
  for (const x of [10, 28]) b.box(x, 1, 59, x + 1, 3, 67, BOARD_D);
  heap(b, 46, 8, 7, 6, 5, (x, y, z, rr) => (rr < 0.4 ? CINDER_D : CINDER)); // coke
  heap(b, 58, 8, 5, 4, 4, (x, y, z, rr) => (rr < 0.3 ? 0x8a3a2a : 0x6a3a2a)); // ore
  for (const [x, z] of [[2, 40], [44, 30], [50, 68]]) lantern(b, x, z, 12);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Telegraph Lookout (the Radar Tower): a tall timber lookout tower with a cabin and lamp at the top is the shape;
// telegraph poles with double cross-arms march off across the lot carrying their wires, a little office at the foot
// with a sign board in the side's colour. 2 x 2.
function telegraph(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  const wall: Col = (x, y, z) => {
    if (z === 40 && x >= 13 && x <= 15 && y <= 5) return y === 5 ? BOARD_L : K; // door
    if ((z === 40 || x === 22) && y >= 3 && y <= 4 && (z === 40 ? x : z) % 5 === 2) return GLOW_L;
    return y === 1 ? GREY_D : y % 2 ? PAINT : PAINT_D;
  };
  roofed(b, 6, 30, 22, 40, 7, wall, teamRoofZ, true, 0.5);
  b.box(8, 8, 41, 20, 11, 41, (x, y) => (y === 8 || y === 11 || x === 8 || x === 20 ? TEAM_D : (x * 2 + y) % 4 === 0 ? K : TEAM)); // the sign
  for (const x of [8, 20]) b.box(x, 1, 41, x, 7, 41, BOARD_D);
  // the lookout tower: pale legs, braced, a cabin in the side's colour and a lamp
  const cx = 30, cz = 16, H = 40;
  for (let y = 1; y <= H; y++) {
    const s = 7 - y * 0.085, r = Math.round(s);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.set(cx + sx * s, y, cz + sz * s, y % 10 < 2 ? TEAM : LOG_END);
    if (y % 7 === 0) for (let k = -r; k <= r; k++) for (const e of [-r, r]) { b.set(cx + k, y, cz + e, BOARD_L); b.set(cx + e, y, cz + k, BOARD_L); }
    else if (y % 2) { const k = Math.round(-r + ((y % 7) / 7) * 2 * r); b.set(cx + k, y, cz + r, BOARD); b.set(cx + r, y, cz - k, BOARD); }
  }
  for (let y = 1; y <= H; y++) b.set(cx, y, cz + 4.6, y % 2 ? K : 0); // ladder
  b.box(cx - 5, H + 1, cz - 5, cx + 5, H + 4, cz + 5, (x, y, z) => (y === H + 1 ? BOARD_D : x === cx - 5 || x === cx + 5 || z === cz - 5 || z === cz + 5 ? (y === H + 4 ? TEAM_D : TEAM) : 0)); // its cabin, half-walled
  for (const [x, z] of [[cx - 5, cz - 5], [cx + 5, cz - 5], [cx - 5, cz + 5], [cx + 5, cz + 5]]) for (let y = H + 5; y <= H + 7; y++) b.set(x, y, z, LOG);
  for (let i = 0; i <= 5; i++) b.box(cx - 6 + i, H + 8 + i, cz - 6 + i, cx + 6 - i, H + 8 + i, cz + 6 - i, (x, y, z) => (i === 5 || x === cx - 6 + i || x === cx + 6 - i || z === cz - 6 + i || z === cz + 6 - i ? (i === 5 ? TEAM_D : TEAM) : 0));
  b.box(cx - 1, H + 5, cz - 1, cx, H + 6, cz, LAMP); b.set(cx, H + 14, cz, IRON);
  // telegraph poles: tall, two cross-arms with glass insulators, wires sagging between
  const P = 24, poles = [[42, 44], [42, 26], [42, 8]];
  for (const [x, z] of poles) { for (let y = 1; y <= P; y++) b.set(x, y, z, y === P ? TEAM : LOG); for (const y of [P - 1, P - 4]) { b.box(x - 3, y, z, x + 3, y, z, BOARD_D); b.set(x - 3, y + 1, z, GLASS); b.set(x + 3, y + 1, z, GLASS); } }
  for (let i = 0; i + 1 < poles.length; i++) for (const [dx, dy] of [[-3, 0], [3, 0], [-3, -3], [3, -3]]) wire(b, [poles[i][0] + dx, P + dy, poles[i][1]], [poles[i + 1][0] + dx, P + dy, poles[i + 1][1]], 1.5, 0x3a3430);
  wire(b, [39, P - 3, 26], [22, 12, 35], 2, 0x3a3430);
  horse(b, 26, 34); for (let y = 1; y <= 4; y++) b.set(38, y, 35, LOG);
  barrel(b, 2, 38); crate(b, 24, 43, 3, 3, 2); lantern(b, 4, 44, 9);
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
  // (the windmill's fan, the mill's flywheel and the mine's wheel turn)
  generator: animate(windmill), reactor: steamWorks, scrapyard: animate(stampMill), derrick: animate(goldMine), barracks: saloon, depot: wagonWorks, workshop: widen(blacksmith, armoryYard),
  airfield: balloonField, provingGround: ironworks, radar: telegraph, empCannon: teslaCannon,
  guardTower: watchtower, emplacement: redoubt, flakTower: gatlingTower, wall: barricade,
};
