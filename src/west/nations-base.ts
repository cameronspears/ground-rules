// WILD WEST: the Plains Nations' lodges and works, standing in for BASE (and the Field Command) by key when a side plays
// the Nations. Same footprint and pivot as the original.
// The Nations are a made-up alliance of plains peoples, drawn with care: tall lodges of tanned hide on fanned poles,
// painted in the side's colour; horse herds, drying racks, fire rings, brush corrals and stake barricades.
// Each building has one big shape that tells its job from the outline alone, even as a build-menu icon; the lodge is a
// supporting piece in most, the centre only of the Warrior Lodge.
// Facing +X like every model; the front (doors) faces south (+Z), as in base.ts.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from '../models';
import { animate, pose } from './pose';
import { hash3 } from '../hash';
import { tower } from '../art';

// ---------------------------------------------------------------- the plains palette
const K = 0x1f1c1a, DIRT = 0xa8865c, DIRT_D = 0x927250, DIRT_L = 0xbc9a6c, SAGE = 0x7a8466;
const GRASS = 0x9a9460, GRASS_D = 0x847e4e, GRASS_L = 0xb0a870;
const HIDE = 0xdab47a, HIDE_D = 0xbc965e, HIDE_L = 0xeacc96, HIDE_S = 0x8a6a4a; // tanned hide, its shadow side, the pale flesh side, smoke-stained
const POLE = 0x7a5634, POLE_L = 0x9a7448, LOG = 0x6a4a2c, LOG_D = 0x543a22, LOG_L = 0x86603a, LOG_END = 0xc09a6a;
const STONE = [0x8a8274, 0x9a9282, 0x7a7266], ROCK = [0x9a8a74, 0x857664, 0xab9c84, 0x76685a];
const FLINT = 0x7c7a86, FLINT_D = 0x56545e, FLINT_L = 0xaaa8b4;
const BRUSH = [0x6e6a3e, 0x5e5a34, 0x7e7448, 0x8a7a4e, 0x6a5a38];
const ASH = 0x5a524a, EMBER = 0xc8401a, GLOW = 0xff8a2a, GLOW_L = 0xffd070, FIRE_W = 0xfff2b8;
const SMOKE = 0xb4aea4, SMOKE_D = 0x96908a, SMOKE_L = 0xcac4ba;
const FUR = 0x4a3020, FUR_D = 0x3a2418, FUR_L = 0x5e3e26, HORN = 0xd8ccb0;
const SKIN = 0x9a6440, HAIR = 0x221a16, LEG = 0x8a6a46, ROPE = 0xc0a878, LEATHER = 0x5a3a22, BONE = 0xe6dcc6;

// ---------------------------------------------------------------- shared pieces
const dirt = (x: number, z: number) => { const h = hash3(x, 0, z); return h < 0.1 ? DIRT_D : h > 0.93 ? DIRT_L : hash3(x >> 3, 2, z >> 3) < 0.3 ? 0xa07e56 : DIRT; };
const grass = (x: number, z: number) => { const h = hash3(x, 11, z); return h < 0.15 ? GRASS_D : h > 0.9 ? GRASS_L : hash3(x >> 2, 12, z >> 2) < 0.25 ? SAGE : GRASS; };
// The camp ground: packed earth over the footprint, or what f says where it says something
function ground(b: VB, w: number, d: number, f?: (x: number, z: number) => number) { b.box(0, 0, 0, w, 0, d, (x, y, z) => (f && f(x, z)) || dirt(x, z)); }
// A straight line of blocks (a pole, a rope)
function line(b: VB, a: number[], c: number[], col: number | ((t: number) => number)) {
  const n = Math.ceil(Math.max(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]), Math.abs(c[2] - a[2])) * 1.3) || 1;
  for (let i = 0; i <= n; i++) { const t = i / n; b.set(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, typeof col === 'number' ? col : col(t)); }
}
// The frame being built (0 standing still, 1 to 4 through a building's loop): fires flicker, smoke climbs
const frame = () => (pose.t < 0 ? 0 : Math.floor(pose.t * 4) + 1);
// Another model's blocks set down at (ox, oz), turned a quarter turn at a time (rot 1: its +x faces +z)
function place(b: VB, src: VB, ox: number, oz: number, rot = 0, oy = 0) {
  src.each((x, y, z, c) => { const [px, pz] = rot === 0 ? [x, z] : rot === 1 ? [-z, x] : rot === 2 ? [-x, -z] : [z, -x]; b.set(ox + px, oy + y, oz + pz, c); });
}

// A lodge: a tall cone of tanned hide on its ring of poles, the poles crossing at the smoke hole and fanning out above,
// two smoke flaps, a door flap on the south, and painted in the side's colour: a band round the foot, a row of
// mountain peaks above it, a ring higher up with stars over it, the top darkened by smoke. art 1: a warrior's lodge,
// a broad painted belt with circles (shields) round it.
function lodge(b: VB, cx: number, cz: number, r: number, h: number, art = 0) {
  const R = (y: number) => Math.max(0.6, r * (1 - (y - 1) / h)), doorA = Math.PI / 2, n = Math.max(6, Math.round(r * 0.9));
  const lo = Math.round(h * 0.08) + 1, hi = Math.round(h * 0.34), up = Math.round(h * 0.6);
  tower(b, cx, cz, 1, h, R, (x, y, z, a) => {
    const da = Math.atan2(Math.sin(a - doorA), Math.cos(a - doorA)), f = y / h, w = 1.6 / Math.max(1.5, R(y)); // (w: about a block and a half, as an angle at this height)
    if (y <= Math.max(3, Math.round(h * 0.2)) && da > -w * 1.3 && da < w * 1.8) return da < w * 0.2 ? K : y === Math.max(3, Math.round(h * 0.2)) ? HIDE_S : HIDE_D; // the door, its flap tied back
    if (f > 0.86) return HIDE_S;
    if (Math.abs(da) < w * 0.5 && y > hi && y < up + 4 && y % 2 === 0) return POLE_L; // the lacing pins up the front
    if (y <= lo) return y === 1 ? TEAM_D : TEAM;
    const ph = ((((a + Math.PI) / (Math.PI * 2)) * n) % 1 + 1) % 1, peak = 1 - Math.abs(ph - 0.5) * 2;
    if (y <= hi && (y - lo) / (hi - lo) < peak) return y === hi - 1 && peak > 0.9 ? HIDE_L : TEAM; // the peaks, snow on their tips
    if (art === 1 && y >= hi + 2 && y <= up - 1) { // the warrior's belt: the side's colour, circles in it
      const cp = ((((a + Math.PI) / (Math.PI * 2)) * n) % 1 + 1) % 1, cy = (hi + 2 + up - 1) / 2, d = Math.hypot((cp - 0.5) * (Math.PI * 2 * R(y)) / n, y - cy);
      if (y === hi + 2 || y === up - 1) return TEAM_D;
      return d < 1.1 ? TEAM_D : d < 2.4 ? HIDE_L : TEAM;
    }
    if (y === up || y === up + 1) return TEAM_D;
    if (y === up + 3 && Math.round(((a + Math.PI) / (Math.PI * 2)) * n * 2) % 2 === 0) return TEAM_L; // stars
    return hash3(x >> 1, y >> 2, z >> 1) < 0.12 ? HIDE_D : HIDE; // (patches where one hide meets the next)
  }, 1.5);
  // the smoke flaps, standing out either side of the smoke hole, each on its own pole
  for (const s of [-1, 1]) {
    const y0 = Math.round(h * 0.64), y1 = Math.round(h * 0.9);
    for (let y = y0; y <= y1; y++) for (const da of [0.35, 0.55, 0.75]) {
      const a = doorA + s * da, rr = R(y) + 1 + (y - y0) * 0.12;
      b.set(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, y === y1 ? TEAM : da === 0.75 ? HIDE_S : HIDE_D);
    }
    const a = doorA + s * 0.95; line(b, [cx + Math.cos(a) * (r + 1), 1, cz + Math.sin(a) * (r + 1)], [cx + Math.cos(doorA + s * 0.6) * (R(y1) + 2.5), y1 + 3, cz + Math.sin(doorA + s * 0.6) * (R(y1) + 2.5)], POLE);
  }
  // the poles: crossing at the top, fanned out above
  const np = Math.max(7, Math.round(r * 0.8)), top = h + Math.max(3, Math.round(r * 0.4));
  for (let k = 0; k < np; k++) { const a = (k / np) * Math.PI * 2 + 0.2; for (let y = h - 2; y <= top; y++) { const rr = y < h - 1 ? (h - 1 - y) * 0.45 : (y - h + 1) * 0.75; b.set(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, y === top ? POLE_L : POLE); } }
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.set(cx + Math.cos(a) * (r + 0.6), 1, cz + Math.sin(a) * (r + 0.6), LOG_END); } // tent pegs
}

// A fire: a ring of stones round glowing coals and crossed logs, flames licking up (flickering through the loop)
function fire(b: VB, cx: number, cz: number, r: number, fh: number, ring = true) {
  const f = frame();
  for (let dx = -Math.ceil(r + 1); dx <= r + 1; dx++) for (let dz = -Math.ceil(r + 1); dz <= r + 1; dz++) {
    const d = Math.hypot(dx, dz), x = cx + dx, z = cz + dz;
    if (ring && d <= r + 0.5 && d > r - 0.8) { b.set(x, 1, z, STONE[(x * 3 + z) % 3]); if (r > 4 && hash3(x, 1, z) < 0.4) b.set(x, 2, z, STONE[(x + z) % 3]); continue; }
    if (d > r - 0.8) continue;
    b.set(x, 0, z, ASH);
    const h = hash3(x, 1, z); b.set(x, 1, z, h < 0.3 ? EMBER : h < 0.6 ? GLOW : h < 0.8 ? LOG_D : K);
    if (d > r - 1.6) continue;
    const e = 1 - d / (r - 1.2), hh = Math.round(fh * e * (0.5 + 0.7 * hash3(x, f * 7 + 3, z)));
    for (let y = 2; y <= 1 + hh; y++) { const t = (y - 1) / hh; b.set(x, y, z, t < 0.4 && e > 0.45 ? FIRE_W : t < 0.65 ? GLOW_L : t < 0.9 ? GLOW : EMBER); }
  }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6; line(b, [cx + Math.cos(a) * (r - 0.8), 1, cz + Math.sin(a) * (r - 0.8)], [cx + Math.cos(a) * 1.2, 2, cz + Math.sin(a) * 1.2], LOG_D); } // logs pushed in from the edge
}
// A stack of split firewood along x (or z): ends showing their rings, each course a little shorter
function woodpile(b: VB, x: number, z: number, len: number, w: number, h: number, alongZ = false) {
  for (let y = 1; y <= h; y++) { const s = Math.floor((y - 1) / 2); for (let a = s; a < len - s; a++) for (let c = s; c < w - s; c++) {
    const end = a === s || a === len - s - 1, col = end ? (hash3(a, y, c) < 0.25 ? LOG_D : LOG_END) : (y + c) % 2 ? LOG : LOG_L;
    if (alongZ) b.set(x + c, y, z + a, col); else b.set(x + a, y, z + c, col);
  } }
}
// Poles of firewood leaned together in a cone
function woodCone(b: VB, cx: number, cz: number, r: number, h: number) {
  tower(b, cx, cz, 1, h, (y) => r * (1 - (y - 1) / h) + 0.4, (x, y, z, a) => (Math.round((a + Math.PI) * r * 0.9) % 3 === 0 ? 0 : Math.round((a + Math.PI) * r * 0.9) % 3 === 1 ? LOG_L : LOG), 1.3, true);
  for (let k = 0; k < 6; k++) { const a = k * 1.05; b.set(cx + Math.cos(a) * 0.6, h + 1, cz + Math.sin(a) * 0.6, LOG_L); }
}
// A rawhide case (parfleche), painted with the side's diamonds and triangles
function parfleche(b: VB, x: number, z: number, w: number, d: number, h: number, y0 = 1) {
  b.box(x, y0, z, x + w - 1, y0 + h - 1, z + d - 1, (xx, y, zz) => {
    if (y === y0 + h - 1) { const m = Math.abs(xx - (x + (w - 1) / 2)) / (w / 2) + Math.abs(zz - (z + (d - 1) / 2)) / (d / 2); return m < 0.45 ? TEAM_D : m < 0.75 ? TEAM : xx === x || xx === x + w - 1 || zz === z || zz === z + d - 1 ? TEAM_D : HIDE_L; }
    const along = zz === z || zz === z + d - 1 ? xx - x : zz - z;
    return (along + y) % 4 === 0 || (along - y + 40) % 4 === 0 ? TEAM : HIDE_L;
  });
}
// A rolled hide, tied with rope, along x (or z)
function bundle(b: VB, x: number, z: number, len: number, alongZ = false, y0 = 1) {
  for (let a = 0; a < len; a++) for (let c = -1; c <= 1; c++) for (let y = 0; y <= 2; y++) {
    if (Math.abs(c) === 1 && (y === 0 || y === 2)) continue;
    const col = a === 1 || a === len - 2 ? ROPE : a === 0 || a === len - 1 ? (c === 0 && y === 1 ? HIDE_D : HIDE_L) : y === 2 ? HIDE : HIDE_D;
    if (alongZ) b.set(x + c, y0 + y, z + a, col); else b.set(x + a, y0 + y, z + c, col);
  }
}
// Woven brush round a rectangle: a rough hedge of dry branches on stakes, gaps where open() says
function brush(b: VB, x0: number, z0: number, x1: number, z1: number, h: number, open: (x: number, z: number) => boolean = () => false) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if ((x !== x0 && x !== x1 && z !== z0 && z !== z1) || open(x, z)) continue;
    const along = x === x0 || x === x1 ? z - z0 : x - x0, top = h + Math.round(hash3(x, 21, z) * 2) - 1;
    if (along % 6 === 0) { for (let y = 1; y <= h + 2; y++) b.set(x, y, z, y >= h + 1 ? TEAM : POLE); continue; } // stakes, their tops painted
    for (let y = 1; y <= top; y++) if (y < top || hash3(x, y, z) < 0.7) b.set(x, y, z, BRUSH[Math.floor(hash3(x, y + 3, z) * BRUSH.length)]);
    if (along % 6 === 3) b.set(x, Math.max(2, top - 1), z, TEAM); // a painted tie
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
// A round shield in the x-y plane at depth z (facing +z): the side's colour, a pale band, a dark boss, rawhide rim,
// two feathers hanging below
function shield(b: VB, cx: number, cy: number, z: number, r = 3.2) {
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const d = Math.hypot(i, j); if (d > r) continue; b.set(cx + i, cy + j, z, d > r - 0.9 ? HIDE_D : d < 1 ? TEAM_D : Math.abs(j) < 0.8 ? HIDE_L : TEAM); }
  for (const i of [-1, 1]) { b.set(cx + i, cy - r - 0.5, z, BONE); b.set(cx + i, cy - r - 1.5, z, BONE); b.set(cx + i, cy - r - 2.5, z, K); }
}
// A shield on its tripod
function shieldStand(b: VB, x: number, z: number) {
  const top = 11; line(b, [x - 3, 1, z - 2], [x, top, z], POLE); line(b, [x + 3, 1, z - 2], [x, top, z], POLE); line(b, [x, 1, z + 3], [x, top, z], POLE);
  b.set(x - 1, top + 1, z, POLE_L); b.set(x + 1, top + 1, z, POLE_L);
  shield(b, x, 7, z + 1);
}
// A carved post: bands cut and painted, streamers in the side's colour and a feather at the top
function post(b: VB, x: number, z: number, h: number) {
  for (let y = 1; y <= h; y++) { const c = y % 5 === 0 ? TEAM : y % 5 === 1 && y > 1 ? K : y % 5 === 4 ? HIDE_L : LOG; b.set(x, y, z, c); b.set(x + 1, y, z, c); b.set(x, y, z + 1, c === LOG ? LOG_D : c); b.set(x + 1, y, z + 1, c === LOG ? LOG_D : c); }
  b.box(x - 2, h + 1, z, x + 3, h + 1, z + 1, POLE_L);
  for (const sx of [x - 2, x + 3]) for (let y = h; y >= h - 4; y--) b.set(sx, y, z, y === h - 4 ? BONE : TEAM);
  b.set(x, h + 2, z, BONE); b.set(x, h + 3, z, BONE); b.set(x, h + 4, z, K);
}
// A tall lance-pole with long streamers in the side's colour flying along +x
function streamers(b: VB, x: number, z: number, h: number, len = 7) {
  for (let y = 1; y <= h; y++) b.set(x, y, z, POLE);
  b.set(x, h + 1, z, FLINT_L);
  for (let i = 1; i <= len; i++) { const sag = Math.round(i * 0.35 + Math.sin(i * 0.9) * 0.6); b.set(x + i, h - 1 - sag, z, TEAM); b.set(x + i, h - 2 - sag, z, i % 3 ? TEAM : TEAM_D); if (i < len - 1) b.set(x + i, h - 4 - sag, z, i % 2 ? TEAM_L : TEAM); }
  for (const y of [h - 7, h - 10]) { b.set(x + 1, y, z, BONE); b.set(x + 1, y - 1, z, K); }
}
// A raised pole platform: four splayed poles (lashed and braced) to a deck at y, a brush parapet with painted hide
// hangings, and a ladder up the south side
function platform(b: VB, x0: number, z0: number, x1: number, z1: number, y: number, splay = 3) {
  const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
  for (const [px, pz] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) {
    const sx = Math.sign(px - cxm), sz = Math.sign(pz - czm);
    line(b, [px + sx * splay, 1, pz + sz * splay], [px, y + 4, pz], POLE);
    for (let yy = 4; yy < y; yy += 6) b.set(px + sx * splay * (1 - yy / (y + 3)), yy, pz + sz * splay * (1 - yy / (y + 3)), ROPE);
  }
  for (const yy of [Math.round(y * 0.45)]) { const k = splay * (1 - yy / (y + 3)); line(b, [x0 + 1 - k, yy, z0 + 1 - k], [x1 - 1 + k, yy, z1 - 1 + k], POLE_L); line(b, [x1 - 1 + k, yy, z0 + 1 - k], [x0 + 1 - k, yy, z1 - 1 + k], POLE_L); }
  b.box(x0, y, z0, x1, y, z1, (x, yy, z) => (x === x0 || x === x1 || z === z0 || z === z1 ? LOG_D : (x + z) % 2 ? LOG : LOG_L));
  b.box(x0, y + 1, z0, x1, y + 3, z1, (x, yy, z) => {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) return 0;
    const along = x === x0 || x === x1 ? z : x, mid = along % 6;
    if (mid === 2 || mid === 3) return yy === y + 3 ? TEAM_D : TEAM; // painted hides hung on the parapet
    return yy === y + 3 && hash3(x, yy, z) < 0.35 ? 0 : BRUSH[Math.floor(hash3(x, yy, z) * BRUSH.length)];
  });
  const lx = Math.round(cxm); for (let yy = 1; yy < y; yy++) { b.set(lx - 1, yy, z1 + splay - 1, POLE); b.set(lx + 1, yy, z1 + splay - 1, POLE); if (yy % 2 === 0) b.set(lx, yy, z1 + splay - 1, POLE_L); }
}
// An archer facing +x, standing at y0, drawing a bow raised by `up` radians: two blocks wide (z, z + 1)
function archer(b: VB, x: number, y0: number, z: number, up: number) {
  for (const zz of [z, z + 1]) { b.set(x, y0, zz, LEATHER); b.set(x, y0 + 1, zz, LEG); b.set(x, y0 + 2, zz, LEG); }
  b.box(x, y0 + 3, z, x + 1, y0 + 3, z + 1, TEAM); b.set(x + 2, y0 + 3, z, TEAM_D); // breechcloth
  b.box(x, y0 + 4, z, x + 1, y0 + 5, z + 1, (xx, y) => (y === y0 + 4 ? HIDE_D : TEAM)); // a painted shirt over a hide belt
  b.box(x, y0 + 6, z, x + 1, y0 + 7, z + 1, (xx, y) => (xx === x || y === y0 + 7 ? HAIR : SKIN)); // head, hair
  b.set(x - 1, y0 + 5, z + 1, HAIR); b.set(x - 1, y0 + 4, z + 1, HAIR); // a braid
  b.set(x, y0 + 8, z, BONE); b.set(x, y0 + 9, z, K); // an eagle feather
  const ax = Math.cos(up), ay = Math.sin(up), C = [x + 2 + ax * 2.4, y0 + 5.5 + ay * 2.4], N = [C[0] - ax * 3, C[1] - ay * 3];
  for (let s = -1; s <= 1.001; s += 0.1) b.set(C[0] - ay * s * 4 + ax * (1 - s * s) * 1.3, C[1] + ax * s * 4 + ay * (1 - s * s) * 1.3, z, Math.abs(s) < 0.15 ? LEATHER : POLE_L); // the bow
  for (const s of [-1, 1]) line(b, [C[0] - ay * s * 4, C[1] + ax * s * 4, z], [N[0], N[1], z], 0xd8d0b8); // the string, drawn
  line(b, [N[0], N[1], z], [C[0] + ax * 2.2, C[1] + ay * 2.2, z], (t) => (t > 0.92 ? FLINT : t < 0.12 ? TEAM_L : POLE_L)); // the arrow
  line(b, [x + 1, y0 + 5, z], [C[0], C[1], z], SKIN); line(b, [x + 1, y0 + 5, z + 1], [N[0], N[1], z + 1], SKIN); // arms
}
// A pony standing along +x (its head at x + 10), in its own blocks; pinto patches, a blanket, grazing
function pony(coat: number, pinto = 0, blanket = false, graze = false): VB {
  const b = new VB(), D = 0x5a341c, MANE = 0x2a1e16;
  const c = (x: number, y: number, z: number) => (pinto && hash3(x >> 1, (y >> 1) + pinto, z) < 0.45 ? 0xe8e0d0 : coat);
  for (const [dx, dz] of [[1, 0], [1, 2], [7, 0], [7, 2]]) b.box(dx, 1, dz, dx, 3, dz, (x, y) => (y === 1 ? K : D));
  b.box(0, 4, 0, 8, 6, 2, c);
  if (graze) { b.box(8, 4, 1, 9, 5, 1, c); b.box(9, 1, 0, 10, 3, 2, (x, y) => (y === 1 ? D : c(x, y, 1))); b.box(8, 6, 1, 8, 6, 1, MANE); }
  else { b.box(8, 6, 1, 9, 8, 1, c); b.box(9, 8, 0, 11, 9, 2, (x) => (x === 11 ? D : c(x, 8, 1))); b.box(7, 7, 1, 8, 9, 1, MANE); b.set(9, 10, 0, coat); b.set(9, 10, 2, coat); }
  b.box(-1, 3, 1, -1, 5, 1, MANE);
  if (blanket) b.box(3, 7, -1, 5, 7, 3, (x, y, z) => (z === -1 || z === 3 ? TEAM_D : x === 4 ? TEAM_L : TEAM)), b.box(3, 5, -1, 5, 6, -1, TEAM), b.box(3, 5, 3, 5, 6, 3, TEAM);
  return b;
}
// A buffalo along +x (its head at x + 12): a shaggy humped forequarter, slim hindquarters, horns, head carried low
function buffalo(graze = false): VB {
  const b = new VB();
  for (const [dx, dz] of [[2, 0], [2, 3], [8, 0], [8, 3]]) b.box(dx, 1, dz, dx, 3, dz, (x, y) => (y === 1 ? K : FUR_D));
  b.box(1, 4, 0, 5, 7, 3, (x, y, z) => (y === 7 && (z === 0 || z === 3) ? 0 : FUR));
  b.box(6, 3, -1, 10, 8, 4, (x, y, z) => ((z === -1 || z === 4) && (y === 8 || y === 3) ? 0 : hash3(x, y, z) < 0.3 ? FUR_D : FUR_L)); // the shaggy forequarter
  b.box(6, 9, 0, 9, 10, 3, (x, y, z) => (y === 10 && (z === 0 || z === 3 || x === 9) ? 0 : FUR_L)); // the hump
  const hy = graze ? 1 : 3;
  b.box(11, hy, 0, 12, hy + 3, 3, (x, y, z) => (x === 12 && y === hy ? K : FUR_D)); // the head
  b.set(11, hy + 4, -1, HORN); b.set(11, hy + 4, 4, HORN); b.set(11, hy + 5, -1, K); b.set(11, hy + 5, 4, K);
  if (!graze) b.box(11, 2, 1, 11, 2, 2, FUR_D); // the beard
  b.set(0, 6, 1, FUR_D); b.set(0, 5, 2, FUR_D); b.set(0, 4, 2, K); // the tail
  return b;
}
// A woven-brush shelter: four posts, a flat roof of brush (a shaded arbor), optionally a painted hide awning
function arbor(b: VB, x0: number, z0: number, x1: number, z1: number, h: number, hideRoof = false) {
  for (let x = x0; x <= x1; x += Math.max(1, Math.floor((x1 - x0) / Math.max(1, Math.round((x1 - x0) / 8))))) for (const z of [z0, z1]) for (let y = 1; y <= h; y++) b.set(x, y, z, POLE);
  for (const z of [z0, z1]) for (let y = 1; y <= h; y++) b.set(x1, y, z, POLE);
  for (const z of [z0, z1]) b.box(x0, h, z, x1, h, z, POLE_L);
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) {
    if (hideRoof) { const sag = Math.round(Math.sin(((z - z0) / Math.max(1, z1 - z0)) * Math.PI) * -0.8); b.set(x, h + 1 + sag, z, (x + z) % 6 < 3 ? TEAM : HIDE_L); if (x === x0 - 1 || x === x1 + 1) b.set(x, h + sag, z, TEAM_D); continue; }
    const r = hash3(x, 31, z); b.set(x, h + 1, z, BRUSH[Math.floor(r * BRUSH.length)]); if (r < 0.45) b.set(x, h + 2, z, BRUSH[Math.floor(hash3(x, 32, z) * BRUSH.length)]);
    if ((x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1) && r < 0.3) b.set(x, h, z, BRUSH[1]); // twigs hanging off the edge
  }
}
// Logs laid round a fire to sit on
function seat(b: VB, x: number, z: number, len: number, alongZ = false) { for (let a = 0; a < len; a++) { const col = a === 0 || a === len - 1 ? LOG_END : a % 3 ? LOG : LOG_L; if (alongZ) b.set(x, 1, z + a, col); else b.set(x + a, 1, z, col); } }
// A tall blaze: tongues of flame roaring up from (cx, y0, cz), a white-hot core, yellow, then orange tips (flickering
// through the loop). The signature of the fires that give the Nations their power.
function blaze(b: VB, cx: number, cz: number, r: number, h: number, y0 = 2) {
  const f = frame();
  for (let dx = -Math.ceil(r); dx <= r; dx++) for (let dz = -Math.ceil(r); dz <= r; dz++) {
    const d = Math.hypot(dx, dz); if (d > r) continue;
    const x = cx + dx, z = cz + dz, e = 1 - d / (r + 0.5), hh = Math.max(1, Math.round(h * Math.pow(e, 0.6) * (0.3 + 0.55 * hash3(x >> 1, f * 7 + 3, z >> 1) + 0.3 * hash3(x, f * 5 + 1, z)))); // (ragged tongues, not a cone)
    for (let y = y0; y < y0 + hh; y++) { const t = (y - y0) / hh; b.set(x, y, z, t < 0.55 && e > 0.2 ? FIRE_W : t < 0.85 ? GLOW_L : GLOW); } // (bright all through: a fire has no shadow side)
  }
  for (let k = 0; k < 6; k++) { const a = hash3(k, f, 5) * Math.PI * 2, rr = hash3(k, f, 6) * r * 0.8; b.set(cx + Math.cos(a) * rr, y0 + h * (0.9 + hash3(k, f, 7) * 0.35), cz + Math.sin(a) * rr, k % 2 ? GLOW_L : GLOW); } // sparks flying up
}
// A ring of stones round (cx, cz), two high
function stones(b: VB, cx: number, cz: number, r: number, h = 2) {
  for (let dx = -Math.ceil(r + 1); dx <= r + 1; dx++) for (let dz = -Math.ceil(r + 1); dz <= r + 1; dz++) {
    const d = Math.hypot(dx, dz); if (d > r + 0.6 || d < r - 0.8) continue;
    for (let y = 1; y <= h; y++) if (y < h || hash3(cx + dx, y, cz + dz) < 0.6) b.set(cx + dx, y, cz + dz, STONE[(cx + dx + (cz + dz) * 2 + y) % 3]);
  }
}
// Glowing coals and ash on the ground inside radius r
function coals(b: VB, cx: number, cz: number, r: number) {
  for (let dx = -Math.ceil(r); dx <= r; dx++) for (let dz = -Math.ceil(r); dz <= r; dz++) { if (Math.hypot(dx, dz) > r) continue; const x = cx + dx, z = cz + dz, h = hash3(x, 1, z); b.set(x, 0, z, ASH); b.set(x, 1, z, h < 0.35 ? EMBER : h < 0.65 ? GLOW : h < 0.85 ? LOG_D : K); }
}
// A round fence of woven brush on stakes, the gate (a gap) at angle `gate`; painted ties in the side's colour
function brushRing(b: VB, cx: number, cz: number, r: number, h: number, gate: number, gw = 0.22) {
  const n = Math.ceil(Math.PI * 2 * r * 1.6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, da = Math.atan2(Math.sin(a - gate), Math.cos(a - gate)); if (Math.abs(da) < gw) continue;
    const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r), top = h + Math.round(hash3(x, 21, z) * 2) - 1;
    if (i % 10 === 0) { for (let y = 1; y <= h + 2; y++) b.set(x, y, z, y === h + 2 ? LOG_END : POLE); continue; }
    for (let y = 1; y <= top; y++) b.set(x, y, z, i % 10 === 5 && y === top - 1 ? TEAM : y === top ? BRUSH[3] : BRUSH[Math.floor(hash3(x, y + 3, z) * BRUSH.length)]);
  }
  for (const s of [-1, 1]) { const a = gate + s * gw, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; for (let y = 1; y <= h + 4; y++) b.set(x, y, z, y > h + 2 ? TEAM : POLE); } // the gateposts, painted
}

// ---------------------------------------------------------------- the buildings
// Fire Lodge (the Generator): the fire is the building: a big blaze in a broad stone ring, flames leaping higher than
// the small lodge of its keepers beside it, smoke climbing above; seats round it, firewood stacked. 2 x 2.
function fireLodge(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => { const d = Math.hypot(x - 27, z - 27); return d < 14 ? (d > 13 ? TEAM_D : d > 11.5 ? TEAM : hash3(x, 1, z) < 0.35 ? 0x8a7258 : DIRT_L) : 0; }); // the swept ground round the fire, edged in the side's paint
  lodge(b, 10, 37, 7, 19); // (off to the side, so it never stands behind the flames)
  stones(b, 27, 27, 10, 3); coals(b, 27, 27, 9);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; line(b, [27 + Math.cos(a) * 9, 1, 27 + Math.sin(a) * 9], [27 + Math.cos(a) * 2, 2, 27 + Math.sin(a) * 2], LOG_D); } // logs pushed in from the edge
  blaze(b, 27, 27, 8.5, 28);
  seat(b, 22, 40, 8); seat(b, 40, 20, 8, true);
  woodpile(b, 18, 3, 14, 5, 5); woodCone(b, 41, 9, 3, 8);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Great Fire (the Reactor): a ceremonial bonfire: a great crib of logs roaring up into a tower of flame far taller
// than anything else they build, in a broad ring of stones on a swept dance ground, a circle of tall painted posts
// round it, firewood piled low at the edge. Huge power; a huge blaze when destroyed. 3 x 3.
function greatFire(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => { const d = Math.hypot(x - 36, z - 36); return d < 27 ? (d > 26 ? TEAM_D : d > 24 ? TEAM : hash3(x, 2, z) < 0.3 ? 0x8a7258 : DIRT_L) : 0; }); // the dance ground, swept and edged in the side's paint
  stones(b, 36, 36, 14, 3); coals(b, 36, 36, 13);
  for (let y = 2; y <= 14; y++) { const s = 9 - Math.floor((y - 2) / 3); for (let k = -s; k <= s; k++) { // the crib of logs, laid crosswise, course on course
    const along = y % 2 === 0; for (const e of [-s, s]) { const [x, z] = along ? [36 + k, 36 + e] : [36 + e, 36 + k]; b.set(x, y, z, Math.abs(k) === s ? LOG_END : (hash3(x, y, z) < 0.35 ? EMBER : LOG_D)); }
  } }
  blaze(b, 36, 36, 10.5, 46, 3);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; post(b, Math.round(35.5 + Math.cos(a) * 22), Math.round(35.5 + Math.sin(a) * 22), 24); } // tall painted posts round the circle
  woodpile(b, 4, 3, 14, 5, 4); woodpile(b, 53, 3, 14, 5, 4); woodpile(b, 3, 52, 14, 5, 4, true); woodCone(b, 64, 64, 4, 8);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// A tall drying rack along x at depth z: forked posts, a crossbar at h, hung with big pieces that read from afar:
// tanned hides (pale, the fur side north), robes painted in the side's colour, and pack cases tied on by their thongs
function tallRack(b: VB, x0: number, z: number, x1: number, h: number, seed = 0) {
  for (const x of [x0, x1]) { for (let y = 1; y <= h; y++) b.set(x, y, z, POLE); b.set(x, h + 1, z - 1, POLE_L); b.set(x, h + 1, z + 1, POLE_L); }
  b.box(x0, h, z, x1, h, z, POLE_L);
  for (let x = x0 + 2, k = seed; x + 4 < x1; x += 6, k++) {
    const kind = k % 3;
    if (kind === 2) { parfleche(b, x, z - 1, 5, 3, 4, h - 5); for (const xx of [x + 1, x + 3]) b.set(xx, h - 1, z, LEATHER); continue; }
    const drop = 8 + Math.round(hash3(x, 6, z) * 2);
    for (let xx = x; xx < x + 5; xx++) for (let y = h - drop; y < h; y++) {
      const edge = xx === x || xx === x + 4, bottom = y === h - drop;
      if (kind === 0) { if (bottom && edge) continue; b.set(xx, y, z - 1, FUR); b.set(xx, y, z + 1, bottom || edge ? HIDE : HIDE_L); } // a tanned hide, ragged where the legs were
      else { const d = Math.hypot(xx - (x + 2), y - (h - drop / 2)); b.set(xx, y, z - 1, HIDE_D); b.set(xx, y, z + 1, edge || bottom ? TEAM_D : d < 1.2 ? HIDE_L : TEAM); } // a robe painted with a sun
    }
    b.box(x, h + 1, z, x + 4, h + 1, z, kind === 0 ? HIDE_L : TEAM_D); // folded over the bar
  }
}

// Trading Camp (the Scrapyard): where hides, meat and goods come in and go out: tall racks hung with tanned hides,
// painted robes and pack cases along the back, and in front a great trade blanket in the side's colour laid out on the
// ground with goods set on it; packs piled ready to go. Wide and low. 3 x 2.
function hideCamp(): ModelDef {
  const b = new VB();
  ground(b, 71, 47);
  tallRack(b, 3, 7, 34, 16, 0); tallRack(b, 37, 7, 68, 16, 1);
  tallRack(b, 9, 17, 32, 12, 2); tallRack(b, 39, 17, 62, 12, 0);
  b.box(12, 1, 27, 58, 1, 42, (x, y, z) => { // the trade blanket: a border, stripes, a row of diamonds
    if (x === 12 || x === 58 || z === 27 || z === 42) return TEAM_D;
    if (Math.abs((((x - 12) % 12) + 12) % 12 - 6) + Math.abs(z - 34.5) < 4) return HIDE_L;
    return z === 29 || z === 40 ? TEAM_L : TEAM;
  });
  parfleche(b, 15, 30, 5, 3, 3, 2); parfleche(b, 44, 37, 5, 3, 2, 2);
  bundle(b, 23, 31, 6, false, 2); bundle(b, 23, 38, 6, false, 2);
  for (let y = 2; y <= 4; y++) b.box(33 - (4 - y), y, 30, 38 + (4 - y) - 2, y, 33, (x) => (x % 2 ? FUR : FUR_L)); // a stack of buffalo robes
  for (let i = 0; i < 6; i++) b.set(48 + i, 2, 31 + (i % 2), i % 2 ? FLINT_L : FLINT); // flint blades laid out
  bundle(b, 61, 29, 7); bundle(b, 61, 34, 7); bundle(b, 62, 31, 5, false, 3); parfleche(b, 62, 39, 4, 3, 3); // packs piled to go
  for (let y = 1; y <= 2; y++) b.box(2 + y, y, 30, 9 - y, y, 38, (x) => (x % 2 ? FUR : FUR_D)); // more robes
  heap(b, 66, 44, 3, 2, 2, (x, y, z, r) => (r < 0.5 ? BONE : HORN)); // bones
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Flint Quarry (the Derrick): a pit dug dark into a rocky outcrop, a tall lifting tripod straddling it with a basket on
// its rope, flint heaped by the rim and knapped under a painted hide awning. 2 x 2.
function flintQuarry(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (Math.hypot(x - 21, z - 20) < 7.5 ? (hash3(x, 3, z) < 0.35 ? FLINT_D : 0x3e342c) : hash3(x, 4, z) < 0.04 ? FLINT : 0));
  for (let x = 0; x <= 47; x++) for (let z = 0; z <= 47; z++) { // the outcrop, broken by the pit, stepped down on the south side
    const d = Math.hypot((x - 20) / 1.1, z - 18); if (d > 19) continue;
    let h = Math.round(Math.min(12, (19 - d) * 1.2) + hash3(x >> 1, 8, z >> 1) * 2);
    const pit = Math.hypot(x - 21, z - 20);
    if (pit < 7.5) continue;
    if (pit < 10) h = Math.min(h, Math.round((pit - 7.5) * 3));
    if (z > 22 && Math.abs(x - 21) < 4) h = Math.min(h, Math.max(0, Math.round((pit - 7.5) * 1.5))); // steps down into the pit
    for (let y = 1; y <= h; y++) { const r = hash3(x, y, z); b.set(x, y, z, y === h && r < 0.15 ? SAGE : r < 0.05 ? FLINT_L : r < 0.09 ? FLINT : ROCK[Math.floor(hash3(x >> 1, y, z >> 1) * 4)]); }
  }
  for (const [x, z] of [[11, 12], [31, 11], [21, 31]]) { const top: number[] = [21, 36, 19]; line(b, [x, 1, z], top, POLE); line(b, [x + 1, 1, z], [top[0] + 1, top[1], top[2]], POLE_L); } // the tripod over the pit, two poles to a leg
  b.box(20, 33, 18, 22, 35, 20, (x, y) => (y === 34 ? TEAM_D : TEAM)); // lashed with a painted thong
  for (let i = 1; i <= 6; i++) { b.set(22 + i, 34 - Math.round(i * 0.5), 19, TEAM); b.set(22 + i, 33 - Math.round(i * 0.5), 19, i % 2 ? TEAM_L : TEAM); } // its streamer
  for (let y = 8; y <= 32; y++) b.set(21, y, 20, ROPE);
  b.box(19, 5, 18, 23, 8, 22, (x, y, z) => (y === 8 ? FLINT_L : (x + y + z) % 2 ? BRUSH[3] : 0xc8a878)); // a basket of flint coming up
  heap(b, 38, 34, 5, 4, 5, (x, y, z, r) => (r < 0.35 ? FLINT_L : r < 0.75 ? FLINT : FLINT_D)); heap(b, 40, 22, 3, 3, 3, (x, y, z, r) => (r < 0.4 ? FLINT_L : FLINT_D));
  arbor(b, 24, 38, 34, 45, 7, true); // the knappers' shelter: a painted hide awning
  for (const [x, z] of [[26, 41], [31, 43]]) { b.set(x, 1, z, LOG_END); for (let i = 0; i < 6; i++) b.set(x + (hash3(i, x, z) * 4 - 2), 0, z + (hash3(i, z, x) * 4 - 2), FLINT_L); } // stumps to work at, chips round them
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Warrior Lodge (the Barracks): THE great lodge, far bigger than any other, painted with the warrior's belt of
// shields, and ringed with shields on their tripods. 2 x 2.
function warriorLodge(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (Math.hypot(x - 22, z - 21) < 22 && hash3(x, 5, z) < 0.25 ? DIRT_D : 0));
  lodge(b, 22, 21, 17, 42, 1);
  for (const [x, z] of [[5, 41], [16, 43], [29, 43], [40, 37], [43, 27], [42, 13]]) shieldStand(b, x, z);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Horse Corral (the Vehicle Depot): a great round corral of woven brush filling the ground, the herd inside it, its
// gate on the south with painted posts and a lance flying streamers; a rack of painted blankets behind. 3 x 3.
function horseCorral(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => { const d = Math.hypot(x - 36, z - 36); return d < 30.5 ? (hash3(x, 6, z) < 0.18 ? DIRT_D : hash3(x >> 2, 7, z >> 2) < 0.3 ? 0xa07e56 : DIRT_L) : grass(x, z); });
  brushRing(b, 36, 36, 31, 6, Math.PI / 2);
  const W = 0xd8d0c0, BAY = 0x7a4a28, DUN = 0xc8a070, DARK = 0x3a2a20, RED = 0x9a5a30;
  ([[14, 30, 0, pony(BAY, 3, true)], [24, 16, 0, pony(W, 0, false, true)], [48, 14, 1, pony(RED, 0, true)], [56, 28, 1, pony(DUN, 0, false, true)],
    [40, 34, 3, pony(DARK, 5)], [24, 40, 0, pony(W, 0, true)], [48, 50, 2, pony(DUN, 7, false, true)], [20, 52, 0, pony(BAY, 0, false, true)], [60, 44, 2, pony(RED, 2, true)]] as [number, number, number, VB][])
    .forEach(([x, z, r, p]) => place(b, p, x, z, r));
  // the blanket rack behind the corral: blankets in the side's colour, a bridle
  for (const x of [2, 14]) for (let y = 1; y <= 8; y++) b.set(x, y, 4, POLE); b.box(2, 8, 4, 14, 8, 4, POLE_L);
  for (const x0 of [3, 9]) for (let x = x0; x <= x0 + 4; x++) for (let y = 3; y <= 7; y++) { b.set(x, y, 5, y % 3 === 0 ? TEAM_L : x === x0 || x === x0 + 4 ? TEAM_D : TEAM); b.set(x, y, 3, TEAM_D); }
  streamers(b, 42, 69, 18, 6);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Bow Maker (the Workshop): a long open arbor, a flat roof of brush on posts with a painted valance along its front,
// and before it a tall rack of bow staves seasoning, pale with sinew, some strung; arrows fletched in the side's colour
// stood in bundles, a small fire to bend the wood. Low and open. 2 x 2.
function bowMaker(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (z >= 6 && z <= 40 && hash3(x, 7, z) < 0.12 ? 0xc8a878 : 0)); // shavings
  arbor(b, 3, 9, 44, 23, 10, true); // (a painted hide roof: at game size the roof is what says whose it is)
  for (let x = 2; x <= 45; x++) for (let y = 8; y <= 10; y++) { const c = y === 8 ? (x % 3 === 0 ? 0 : TEAM_D) : x % 8 < 4 ? TEAM : HIDE_L; if (c) b.set(x, y, 25, c); } // the painted valance, fringed
  for (let x = 12; x <= 36; x += 4) for (let y = 1; y <= 3; y++) b.box(x, y, 14, x + 2, y, 18, y === 3 ? LOG_L : LOG); // stave blanks stacked in the shade
  for (const x of [5, 42]) for (let y = 1; y <= 15; y++) b.set(x, y, 32, POLE);
  b.box(5, 15, 32, 42, 15, 32, POLE_L); b.box(5, 6, 32, 42, 6, 32, POLE);
  for (let x = 8; x <= 39; x += 3) { // the bows: tall staves bending, pale with sinew, every other one strung
    const strung = (x / 3) % 2 === 0;
    for (let y = 2; y <= 15; y++) { const bend = Math.round(Math.sin(((y - 2) / 13) * Math.PI) * 1.8); b.set(x, y, 32 + bend, y === 8 || y === 9 ? LEATHER : 0xead8a8); if (strung && y > 2 && y < 15) b.set(x, y, 32, 0xd8d0b8); }
  }
  for (const [x, z] of [[9, 40], [15, 41], [29, 41]]) for (let i = 0; i < 4; i++) { const xx = x + (i % 2), zz = z + (i >> 1); for (let y = 1; y <= 7; y++) b.set(xx, y, zz, y >= 6 ? (y === 7 ? TEAM_L : TEAM) : POLE_L); } // arrows stood in bundles
  fire(b, 39, 40, 2.5, 3); for (const [x, z] of [[36, 37], [42, 37], [39, 44]]) line(b, [x, 1, z], [39, 9, 40], POLE); // the bending fire, a frame over it
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Herd Grounds (the Proving Ground): a wide pasture fenced with brush and stakes all round, full of the great herd:
// buffalo grazing, a salt lick, a pond; a lance flying streamers at the gate. 3 x 3.
function herdGrounds(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, grass);
  brush(b, 2, 2, 70, 70, 4, (x, z) => x === 2 && z > 32 && z < 40);
  for (const [x, z, r, g] of [[6, 8, 0, 1], [26, 7, 0, 0], [46, 9, 0, 1], [16, 20, 0, 0], [42, 22, 2, 1], [60, 18, 1, 1], [8, 34, 0, 1], [28, 36, 0, 0], [50, 34, 3, 1],
    [14, 48, 0, 0], [40, 50, 2, 1], [58, 46, 1, 0], [6, 62, 0, 1], [26, 63, 0, 0], [46, 62, 0, 1]]) place(b, buffalo(!!g), x, z, r);
  heap(b, 24, 29, 2, 2, 2, (x, y, z, r) => (r < 0.5 ? 0xe6e0d4 : 0xccc4b4)); // the salt lick
  for (let x = 60; x <= 68; x++) for (let z = 60; z <= 68; z++) if (Math.hypot((x - 64) / 3.5, (z - 64) / 2.8) < 1) b.set(x, 0, z, 0x4a7a9a); // a pond
  streamers(b, 1, 31, 16, 5);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Signal Hill (the Radar Tower): smoke signals, the way everyone pictures them: on open grass, two people hold
// a big blanket painted in the side's colour over a small fire, and separate round puffs of smoke climb into the sky
// with clear gaps between them (rising through the loop). No mound and no solid column: a cone with smoke on top
// reads as a volcano. 2 x 2.
function signalHill(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, grass);
  const g = 0, cx = 24, cz = 26;
  lodge(b, 9, 9, 6, 16); woodpile(b, 30, 4, 12, 4, 4); // (a small lodge and firewood at the back)
  { const f = new VB(); fire(f, 0, 0, 2.5, 4); place(b, f, cx, cz, 0, g); } // the small signal fire
  for (const [x, z] of [[cx - 9, cz], [cx + 9, cz]]) { // the two holding the blanket, arms up to its corners
    for (const zz of [z - 1, z]) { b.set(x, g + 1, zz, LEATHER); b.set(x, g + 2, zz, LEG); b.set(x, g + 3, zz, LEG); }
    b.box(x, g + 4, z - 1, x, g + 6, z, (xx, y) => (y === g + 4 ? HIDE_D : TEAM)); // a painted shirt
    b.box(x, g + 7, z - 1, x, g + 8, z, (xx, y) => (y === g + 8 ? HAIR : SKIN)); b.set(x, g + 9, z - 1, BONE); // head, a feather
    for (const zz of [z - 3, z + 2]) line(b, [x, g + 6, zz < z ? z - 1 : z], [x + (x < cx ? 1 : -1), g + 10, zz], SKIN); // arms raised
  }
  for (let x = cx - 8; x <= cx + 8; x++) for (let z = cz - 6; z <= cz + 6; z++) { // the blanket, sagging a little in the middle
    const sag = Math.abs(x - cx) < 4 ? 1 : 0, edge = x === cx - 8 || x === cx + 8 || z === cz - 6 || z === cz + 6, d = Math.hypot(x - cx, (z - cz) * 1.3);
    b.set(x, g + 11 - sag, z, edge ? TEAM_D : d < 2.5 ? HIDE_L : d < 4 ? TEAM_D : TEAM);
  }
  const rise = Math.max(0, pose.t) * 13; // the puffs: round balls, each bigger and further east, a gap between each
  for (const [k, r] of [[0, 3.2], [1, 4.2], [2, 5.2], [3, 6]] as const) {
    const py = g + 18 + k * 13 + rise, px = cx + k * 1.6 + rise * 0.12; if (py - r > 66) continue;
    for (let dx = -7; dx <= 7; dx++) for (let dy = -7; dy <= 7; dy++) for (let dz = -7; dz <= 7; dz++) {
      const d = Math.hypot(dx, dy * 1.15, dz); if (d > r) continue;
      b.set(px + dx, py + dy, cz + dz, dy > r * 0.35 ? SMOKE_L : dy < -r * 0.45 ? SMOKE_D : SMOKE);
    }
  }
  streamers(b, 42, 40, 15, 5); // a lance flying the side's streamers
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Sky Watch (the Interceptor Battery): the tallest thing they build: a high pole platform with archers on the perch
// watching the sky, a fire basket burning above them to light the arrows, earth banks on two sides, arrow bundles
// at the foot. 2 x 2.
function skyWatch(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  for (let x = 1; x <= 46; x++) for (let z = 1; z <= 46; z++) { const d = Math.min(x, z); if (d > 6) continue; const h = Math.min(5, 7 - d); for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? (hash3(x, y, z) < 0.2 ? SAGE : DIRT_L) : y % 2 ? DIRT_D : 0x9a7a52); } // earth banks
  platform(b, 15, 15, 31, 31, 30, 5);
  archer(b, 19, 31, 18, 1.0); archer(b, 24, 31, 25, 0.9);
  for (let y = 31; y <= 41; y++) b.set(28, y, 19, POLE); // the fire basket on its pole above the deck
  b.box(25, 41, 16, 31, 43, 22, (x, y, z) => (x === 25 || x === 31 || z === 16 || z === 22 ? ((x + z + y) % 2 ? TEAM_D : LOG) : y === 41 ? EMBER : 0));
  blaze(b, 28, 19, 3, 9, 42);
  for (const x of [12, 36]) for (const z of [38, 41]) { for (let y = 1; y <= 5; y++) b.set(x, y, z, y >= 4 ? TEAM : POLE_L); b.set(x, 6, z, TEAM_L); } // arrow bundles stood ready
  parfleche(b, 20, 40, 4, 3, 3); bundle(b, 26, 42, 5);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Stampede Grounds (the EMP Cannon): their great strike: two long drive lines of stakes and painted stone cairns
// funnelling the churned lane east to a narrow mouth, a big V on the ground; the buffalo penned at its wide end ready
// to be driven, a tall caller's pole with a buffalo skull at the mouth. 3 x 3.
function stampedeGrounds(): ModelDef {
  const b = new VB();
  const half = (x: number) => 4 + (64 - x) * 0.47, PALE = [0xbcb4a2, 0xaaa290, 0xccc4b2];
  ground(b, 71, 71, (x, z) => (x <= 66 && Math.abs(z - 36) < half(x) ? (hash3(x, 13, z) < 0.25 ? DIRT_D : DIRT_L) : grass(x, z))); // the lane, churned pale
  for (const s of [-1, 1]) for (let x = 3; x <= 64; x++) { // the drive lines
    const z = Math.round(36 + s * half(x));
    if (x % 8 === 4) { heap(b, x, z, 2, 2, 6, (xx, y, zz, r) => (y >= 5 ? TEAM : y === 4 ? TEAM_D : PALE[Math.floor(r * 3)])); continue; } // a cairn of pale stones, its top painted
    if (x % 2 === 0) { line(b, [x, 1, z], [x, 6, z + s], POLE_L); b.set(x, 7, z + s, LOG_END); continue; } // a stake leaning out
    b.set(x, 1, z, BRUSH[Math.floor(hash3(x, 1, z) * BRUSH.length)]); if (hash3(x, 2, z) < 0.5) b.set(x, 2, z, BRUSH[3]); // low brush between
  }
  for (let z = 6; z <= 66; z++) { if (z % 3 === 0) { for (let y = 1; y <= 6; y++) b.set(2, y, z, y === 6 ? LOG_END : POLE_L); } else for (let y = 1; y <= 3; y++) b.set(2, y, z, BRUSH[Math.floor(hash3(2, y, z) * BRUSH.length)]); } // the pen's back
  for (const [x, z] of [[8, 18], [10, 30], [6, 42], [12, 52], [22, 24], [24, 44], [20, 34]]) place(b, buffalo(), x, z, 0);
  // the caller's pole at the mouth: a tall painted post, streamers, a buffalo skull bound to it
  post(b, 62, 22, 40);
  b.box(61, 18, 24, 64, 20, 24, BONE); b.set(61, 21, 24, HORN); b.set(64, 21, 24, HORN); b.set(62, 19, 25, K); b.set(63, 19, 25, K);
  streamers(b, 64, 50, 26, 6);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Archer Platform (the Guard Tower): a raised platform on four splayed poles, a brush parapet hung with painted hides
// and shields, an archer at the rail. 1 x 1.
function archerPlatform(): ModelDef {
  const b = new VB();
  for (let x = 1; x <= 23; x++) for (let z = 1; z <= 23; z++) { const d = Math.hypot(x - 12, z - 12); if (d > 11.2) continue; b.set(x, 0, z, d > 10.3 ? STONE[(x + z) % 3] : dirt(x, z)); if (d > 10.3 && (x + z) % 3 === 0) b.set(x, 1, z, STONE[(x * z) % 3]); } // a pad ringed in stones
  platform(b, 5, 5, 18, 18, 16, 3);
  shield(b, 9, 17, 19, 2.6); shield(b, 15, 17, 19, 2.6); // shields hung on the front of the parapet
  archer(b, 14, 17, 10, 0.25);
  for (const [x, z] of [[6, 6], [17, 6], [6, 17], [17, 17]]) for (let y = 20; y <= 24; y++) b.set(x, y, z, y === 24 ? LOG_END : POLE); // the corner poles standing above the rail
  for (let i = 1; i <= 4; i++) { b.set(6 + i, 24 - Math.round(i * 0.3), 6, TEAM); b.set(6 + i, 23 - Math.round(i * 0.3), 6, i % 2 ? TEAM_L : TEAM); }
  b.box(2, 1, 10, 4, 3, 13, (x, y) => (y === 3 ? FLINT : (x + y) % 2 ? BRUSH[3] : BRUSH[4]));
  return { body: b, bodyPivot: [12, 0, 12] };
}

// Fire Arrow Nest (the Cannon Emplacement): a low ring of earth bristling with sharpened stakes outside, faced with
// woven brush inside, its rim painted; a packed floor with hide mats, a fire pot and bundles of fire arrows. The
// turret is a great bow anchored in a timber frame, a long arrow nocked and drawn, its head burning. 2 x 2.
function fireArrowNest(): ModelDef {
  const b = new VB();
  for (let y = 0; y < 7; y++) for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
    const d = Math.max(Math.abs(x - 23.5), Math.abs(z - 23.5)) * 0.7 + Math.hypot(x - 23.5, z - 23.5) * 0.35;
    if (d > 21 - y * 1.1 || (d < 14 && y > 0)) continue;
    const inner = d < 15.2;
    b.set(x, y, z, inner ? (y === 6 ? TEAM : y === 5 ? TEAM_D : BRUSH[Math.floor(hash3(x, y, z) * BRUSH.length)]) : y >= 5 || d > 20.4 - y * 1.1 ? (hash3(x, y, z) < 0.15 ? SAGE : DIRT_L) : hash3(x, y, z) < 0.3 ? DIRT_D : DIRT);
  }
  const st = new VB();
  for (let k = 0; k < 44; k++) { // stakes driven into the outer bank, leaning out, sharpened
    const a = (k / 44) * Math.PI * 2, rr = 19 - hash3(k, 1, 2) * 1.5, x = 23.5 + Math.cos(a) * rr, z = 23.5 + Math.sin(a) * rr;
    const bx = 23.5 + Math.cos(a) * (rr - 2.5), bz = 23.5 + Math.sin(a) * (rr - 2.5), by = Math.max(1, Math.round(6 - (rr - 2.5 - 14) * 1.1));
    line(st, [bx, by, bz], [x + Math.cos(a) * 2, by + 5, z + Math.sin(a) * 2], (t) => (t > 0.85 ? LOG_END : LOG));
  }
  st.each((x, y, z, c) => { if (x >= 2 && x <= 43 && z >= 4 && z <= 43) b.set(x, y, z, c); }); // (kept inside the redoubt's footprint)
  b.box(10, 0, 10, 37, 5, 37, (x, y, z) => { const d = Math.hypot(x - 23.5, z - 23.5); return y === 5 && d < 13.5 ? (Math.abs(d - 9) < 0.6 ? LOG_D : hash3(x, y, z) < 0.15 ? DIRT_D : DIRT_L) : 0; }); // the floor and the ring the bow turns on
  b.box(13, 5, 31, 18, 5, 36, (x, y, z) => (x === 13 || x === 18 || z === 31 || z === 36 ? TEAM_D : (x + z) % 4 === 0 ? HIDE_D : HIDE_L));
  b.box(2, 1, 20, 9, 5, 27, (x, y, z) => (y === 5 ? (hash3(x, y, z) < 0.3 ? SAGE : DIRT_L) : x === 2 && z >= 22 && z <= 25 && y < 4 ? (z === 22 || z === 25 || y === 3 ? POLE : z === 24 ? TEAM : K) : BRUSH[Math.floor(hash3(x, y, z) * BRUSH.length)])); // the store dug into the bank, a painted hide over its door
  { const f = new VB(); fire(f, 0, 0, 2, 3); place(b, f, 32, 14, 0, 5); } // the fire pot
  for (const [x, z] of [[13, 13], [32, 31], [14, 16]]) { for (let y = 6; y <= 10; y++) { b.set(x, y, z, y >= 9 ? TEAM : POLE_L); b.set(x + 1, y, z, y >= 9 ? TEAM_D : POLE_L); } b.set(x, 11, z, EMBER); } // fire arrow bundles, their heads wrapped
  const t = new VB();
  t.box(0, 0, 2, 14, 1, 13, (x, y, z) => (y === 1 ? (z === 2 || z === 13 ? TEAM_D : x % 3 === 0 ? LOG_D : LOG) : z % 3 === 0 ? LOG_END : LOG_D)); // the timber sled the frame stands on
  t.box(1, 2, 3, 6, 2, 12, (x, y, z) => (z === 3 || z === 12 || x === 1 || x === 6 ? TEAM_D : (x + z) % 3 === 0 ? TEAM_L : TEAM)); // a painted hide over it
  for (let y = 2; y <= 9; y++) { t.set(13, y, 7, POLE); t.set(13, y, 8, POLE); } line(t, [8, 2, 7.5], [13, 8, 7.5], POLE_L); t.box(13, 3, 3, 13, 3, 12, POLE_L); // the post the bow is lashed to, braced
  for (const z of [3, 12]) line(t, [13, 3, z], [13, 9, 7.5], POLE);
  for (let y = 2; y <= 9; y++) t.set(4, y, 7, POLE); t.set(4, 9, 8, POLE); // the post that holds the string drawn
  const xr = 14, cy = 9.5;
  const ly = 0.64, lz = 0.77; // (the bow canted over, so it reads from above as well as from the side)
  for (let s = -1; s <= 1.001; s += 0.04) { const y = cy + s * 8 * ly, z = 7.5 + s * 8 * lz, x = xr - s * s * 3.5, c = Math.abs(s) < 0.12 ? LEATHER : Math.abs(Math.abs(s) - 0.5) < 0.06 ? TEAM_D : TEAM; t.set(x, y, z, c); t.set(x - 1, y, z, c); t.set(x, y + 1, z, c); } // the great bow, painted
  for (const s of [-1, 1]) line(t, [xr - 3.5, cy + s * 8 * ly, 7.5 + s * 8 * lz], [4.5, cy, 7.5], 0xd8d0b8); // its string, drawn back
  line(t, [4.5, cy, 7.5], [23, cy, 7.5], (u) => (u < 0.1 ? TEAM_L : u > 0.94 ? FLINT : POLE_L)); // the arrow
  t.box(22, 9, 7, 25, 10, 8, (x, y) => (x === 25 ? GLOW_L : y === 10 ? GLOW : x === 22 ? EMBER : GLOW_L)); t.set(24, 11, 7, GLOW); t.set(25, 11, 8, GLOW_L); // its head, burning
  return { body: b, bodyPivot: [24, 0, 24], turret: t, turretPivot: [6.5, 0, 7.5], turretAt: [24, 6, 24] };
}

// Sky Archer Perch (the Flak Tower): a small platform on poles over a hide-walled store, a brush parapet painted in
// the side's colour; the turret is a pair of archers on a hide mat, drawing on the sky. 1 x 1.
function skyArcherPerch(): ModelDef {
  const b = new VB();
  b.box(3, 0, 3, 20, 0, 20, (x, y, z) => dirt(x, z));
  for (let x = 6; x <= 17; x++) for (let z = 6; z <= 17; z++) { // the store under the platform, hide walls on a frame
    if (x !== 6 && x !== 17 && z !== 6 && z !== 17) continue;
    for (let y = 1; y <= 9; y++) b.set(x, y, z, (x === 6 || x === 17) && (z === 6 || z === 17) ? POLE : z === 17 && x >= 10 && x <= 12 && y < 6 ? (x === 12 ? HIDE_D : K) : y === 3 || y === 4 ? ((x + z) % 4 < 2 ? TEAM : TEAM_D) : HIDE);
  }
  for (const [x, z] of [[3, 3], [20, 3], [3, 20], [20, 20]]) for (let y = 1; y < 10; y++) b.set(x, y, z, POLE);
  b.box(3, 10, 3, 20, 10, 20, (x, y, z) => (x === 3 || x === 20 || z === 3 || z === 20 ? LOG_D : (x + z) % 2 ? LOG : LOG_L));
  for (let x = 3; x <= 20; x++) for (let z = 3; z <= 20; z++) if (x === 3 || x === 20 || z === 3 || z === 20) { b.set(x, 11, z, BRUSH[Math.floor(hash3(x, 11, z) * BRUSH.length)]); b.set(x, 12, z, (x + z) % 3 ? TEAM : TEAM_D); }
  for (let y = 1; y < 10; y++) b.set(19, y, 12, y % 2 ? POLE_L : 0); // ladder
  for (const [x, z] of [[4, 4], [18, 18]]) { for (let y = 11; y <= 14; y++) b.set(x, y, z, y >= 13 ? TEAM : POLE_L); b.set(x, 15, z, TEAM_L); }
  const t = new VB();
  t.box(0, 0, 0, 7, 0, 7, (x, y, z) => (x === 0 || x === 7 || z === 0 || z === 7 ? TEAM_D : (x + z) % 3 === 0 ? TEAM : HIDE_L)); // the mat
  archer(t, 1, 1, 1, 1.05); archer(t, 2, 1, 5, 0.85);
  return { body: b, bodyPivot: [12, 0, 12], turret: t, turretPivot: [3.5, 0, 3.5], turretAt: [12, 11, 12] };
}

// Brush Barricade (the Wall): one cell of sharpened stakes, leaning out both ways, woven through with brush and bound
// with painted ties. Laid side by side they make a continuous line. 1 x 1.
function brushBarricade(): ModelDef {
  const b = new VB();
  for (let x = 1; x <= 22; x++) for (let z = 1; z <= 22; z++) {
    b.set(x, 0, z, dirt(x, z));
    const top = 5 + Math.round(hash3(x, 41, z) * 2); // woven brush through the cell
    for (let y = 1; y <= top; y++) if (y < top - 1 || hash3(x, y, z) < 0.6) b.set(x, y, z, BRUSH[Math.floor(hash3(x, y + 9, z) * BRUSH.length)]);
    if (x === 1 || x === 22 || z === 1 || z === 22) { // the stakes round the edge, cut to points, bound with a painted tie
      const along = x === 1 || x === 22 ? z : x; if (along % 3 !== 0) continue;
      const h = 8 + Math.floor(hash3(along, x, z) * 3);
      for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? LOG_END : y === 4 ? TEAM : y === 5 ? TEAM_D : along % 2 ? LOG : LOG_L);
    }
  }
  return { body: b, bodyPivot: [12, 0, 12] };
}

export const NATION_BASE: Record<string, () => ModelDef> = {
  generator: animate(fireLodge), reactor: animate(greatFire), scrapyard: animate(hideCamp), derrick: flintQuarry, // (fires flicker, smoke climbs)
  barracks: warriorLodge, depot: horseCorral, workshop: animate(bowMaker), provingGround: animate(herdGrounds),
  radar: animate(signalHill), interceptor: animate(skyWatch), empCannon: stampedeGrounds,
  guardTower: archerPlatform, emplacement: animate(fireArrowNest), flakTower: skyArcherPerch, wall: brushBarricade,
};
