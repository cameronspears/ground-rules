// WILD WEST: the Plains Nations' lodges and works, standing in for BASE (and the Field Command) by key when a side plays
// the Nations. Same footprint and pivot as the original.
// The Nations are a made-up alliance of plains peoples, drawn with care: tall lodges of tanned hide on fanned poles,
// painted in the side's colour; horse herds, drying racks, fire rings, brush corrals and stake barricades.
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
const MEAT = 0x8a3a2a, MEAT_D = 0x6a2a20, FUR = 0x4a3020, FUR_D = 0x3a2418, FUR_L = 0x5e3e26, HORN = 0xd8ccb0;
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
// A drying rack along x at depth z: forked posts, a crossbar at height h; hung with hides (folded over the bar, fur
// out on the north) and strips of meat
function rack(b: VB, x0: number, z: number, x1: number, h: number, hang: 'hides' | 'meat' | 'mixed' = 'mixed') {
  for (const x of [x0, x1]) { for (let y = 1; y <= h; y++) b.set(x, y, z, POLE); b.set(x, h + 1, z - 1, POLE_L); b.set(x, h + 1, z + 1, POLE_L); }
  b.box(x0, h, z, x1, h, z, POLE_L);
  let x = x0 + 1;
  while (x < x1) {
    const hide = hang === 'hides' || (hang === 'mixed' && hash3(x, 5, z) < 0.5);
    if (hide) {
      const w = Math.min(5, x1 - x); if (w < 3) break;
      for (let xx = x; xx < x + w; xx++) { const drop = 5 + Math.round(hash3(xx, 6, z) * 1.5); for (let y = h - drop; y <= h; y++) { b.set(xx, y, z - 1, y === h - drop ? FUR_D : FUR); b.set(xx, y, z + 1, y === h - drop ? HIDE_D : HIDE_L); } b.set(xx, h + 1, z, HIDE_L); }
      x += w + 1;
    } else { for (let y = h - 4 + Math.round(hash3(x, 7, z)); y < h; y++) b.set(x, y, z, y % 2 ? MEAT : MEAT_D); x += 2; }
  }
}
// A hide stretched on an upright pole frame and laced in, painted with a sun in the side's colour. In the x-y plane
// at depth z (or the z-y plane at x)
function hideFrame(b: VB, x: number, z: number, w: number, h: number, alongZ = false) {
  const put = (a: number, y: number, c: number) => (alongZ ? b.set(x, y, z + a, c) : b.set(x + a, y, z, c));
  for (let y = 1; y <= h + 1; y++) { put(0, y, POLE); put(w, y, POLE); }
  for (let a = -1; a <= w + 1; a++) { put(a, 2, POLE); put(a, h, POLE); }
  const ca = w / 2, cy = (h + 2) / 2, rad = Math.min(w, h - 2) / 2 - 1.5;
  for (let a = 2; a <= w - 2; a++) for (let y = 4; y <= h - 2; y++) {
    const d = Math.hypot(a - ca, y - cy), ang = Math.atan2(y - cy, a - ca);
    put(a, y, d < rad * 0.45 ? TEAM_D : d < rad * 0.75 ? TEAM : d < rad + 0.6 && Math.abs(Math.sin(ang * 4)) > 0.6 ? TEAM : (a === 2 || a === w - 2 || y === 4 || y === h - 2) ? HIDE_D : HIDE_L);
  }
  for (let a = 1; a < w; a += 2) { put(a, 3, ROPE); put(a, h - 1, ROPE); }
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
// A travois along x: two long poles crossed high at the front (where a horse would be harnessed), trailing on the
// ground behind, a webbed platform with a load lashed on
function travois(b: VB, x: number, z: number) {
  line(b, [x, 1, z], [x + 14, 7, z + 3], POLE); line(b, [x, 1, z + 6], [x + 14, 7, z + 3], POLE);
  b.set(x + 15, 7.5, z + 2, POLE_L); b.set(x + 15, 7.5, z + 4, POLE_L);
  for (let xx = x + 2; xx <= x + 6; xx++) { const t = (xx - x) / 14, y = 1 + t * 6, a = z + t * 3, c = z + 6 - t * 3; line(b, [xx, y, a], [xx, y, c], xx % 2 ? ROPE : LEATHER); }
  bundle(b, x + 2, z + 3, 5, false, 2); parfleche(b, x + 3, z + 2, 3, 3, 2, 4);
}
// Woven brush round a rectangle: a rough hedge of dry branches on stakes, gaps where open() says
function brush(b: VB, x0: number, z0: number, x1: number, z1: number, h: number, open: (x: number, z: number) => boolean = () => false) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if ((x !== x0 && x !== x1 && z !== z0 && z !== z1) || open(x, z)) continue;
    const along = x === x0 || x === x1 ? z - z0 : x - x0, top = h + Math.round(hash3(x, 21, z) * 2) - 1;
    if (along % 6 === 0) { for (let y = 1; y <= h + 2; y++) b.set(x, y, z, y === h + 2 ? LOG_END : POLE); continue; }
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
// A hide mat on the ground, edged in the side's colour
function mat(b: VB, x0: number, z0: number, x1: number, z1: number) { b.box(x0, 0, z0, x1, 0, z1, (x, y, z) => (x === x0 || x === x1 || z === z0 || z === z1 ? TEAM_D : (x + z) % 4 === 0 ? HIDE_D : HIDE_L)); }
// Logs laid round a fire to sit on
function seat(b: VB, x: number, z: number, len: number, alongZ = false) { for (let a = 0; a < len; a++) { const col = a === 0 || a === len - 1 ? LOG_END : a % 3 ? LOG : LOG_L; if (alongZ) b.set(x, 1, z + a, col); else b.set(x + a, 1, z, col); } }

// ---------------------------------------------------------------- the buildings
// Fire Lodge (the Generator): a lodge, a big fire burning in its stone ring in front with a cooking tripod over it,
// seats round it, firewood stacked and leaned. 2 x 2.
function fireLodge(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (Math.hypot(x - 30, z - 32) < 10 && hash3(x, 1, z) < 0.35 ? 0x8a7258 : 0));
  lodge(b, 16, 17, 11, 30);
  fire(b, 30, 32, 6, 10);
  for (const [x, z] of [[24, 25], [37, 27], [30, 40]]) line(b, [x, 1, z], [30, 17, 31], POLE); // the tripod and its pot
  for (let y = 9; y <= 16; y++) b.set(30, y, 31, LEATHER); b.box(29, 7, 30, 31, 9, 32, (x, y) => (y === 9 ? K : 0x3a3430));
  seat(b, 21, 37, 6); seat(b, 38, 34, 6, true);
  woodpile(b, 34, 4, 12, 5, 6); woodpile(b, 40, 13, 6, 4, 4, true);
  woodCone(b, 7, 38, 4, 10); woodCone(b, 14, 42, 3, 7);
  mat(b, 4, 30, 10, 34); bundle(b, 22, 4, 5); parfleche(b, 28, 3, 4, 3, 3);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Great Fire (the Reactor): a ceremonial fire: a great crib of logs blazing in a broad ring of stones, painted posts
// round the circle, four lodges about it and firewood piled high. Huge power; a huge blaze when destroyed. 3 x 3.
function greatFire(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => { const d = Math.hypot(x - 36, z - 36); return d < 20 ? (d > 17.5 ? HIDE_D : hash3(x, 2, z) < 0.3 ? 0x8a7258 : DIRT_L) : 0; }); // the dance ground, swept and edged
  fire(b, 36, 36, 12, 4);
  for (let y = 2; y <= 12; y++) { const s = 6 - Math.floor((y - 2) / 3); for (let k = -s; k <= s; k++) { // the crib of logs, laid crosswise, course on course
    const along = y % 2 === 0; for (const e of [-s, s]) { const [x, z] = along ? [36 + k, 36 + e] : [36 + e, 36 + k]; b.set(x, y, z, Math.abs(k) === s ? LOG_END : (hash3(x, y, z) < 0.3 ? EMBER : LOG_D)); }
  } }
  const f = frame();
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) { // the blaze, roaring up out of the crib
    const d = Math.hypot(dx, dz); if (d > 7.5) continue;
    const e = 1 - d / 8, hh = Math.round(4 + 28 * e * (0.55 + 0.6 * hash3(36 + dx, f * 5 + 9, 36 + dz)));
    for (let y = 3; y <= hh; y++) { const t = (y - 3) / (hh - 2), x = 36 + dx, z = 36 + dz; if (b.get(x, y, z) && t < 0.5) continue; b.set(x, y, z, t < 0.35 && e > 0.4 ? FIRE_W : t < 0.62 ? GLOW_L : t < 0.88 ? GLOW : EMBER); }
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; post(b, Math.round(36 + Math.cos(a) * 15.5), Math.round(36 + Math.sin(a) * 15.5), 12); } // painted posts round the circle
  lodge(b, 11, 11, 9, 28); lodge(b, 60, 11, 9, 28); lodge(b, 11, 60, 9, 28, 1); // (none on the south-east, so nothing stands in front of the fire)
  woodpile(b, 26, 2, 20, 6, 9); woodpile(b, 64, 26, 18, 6, 6, true); woodpile(b, 2, 28, 14, 5, 6, true);
  woodCone(b, 60, 60, 5, 10); woodCone(b, 52, 65, 3, 7); woodCone(b, 65, 52, 3, 7); woodCone(b, 36, 65, 3, 6);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Hide Camp (the Scrapyard): where the hunters bring in hides and meat: rows of drying racks hung with robes and meat
// strips over a smoky fire, hides staked out and stretched on painted frames, a lodge, travois and pack cases. 3 x 2.
function hideCamp(): ModelDef {
  const b = new VB();
  ground(b, 71, 47);
  lodge(b, 12, 13, 10, 28);
  rack(b, 26, 8, 44, 10, 'hides'); rack(b, 26, 17, 44, 10, 'meat'); rack(b, 48, 8, 66, 10, 'mixed'); rack(b, 48, 17, 66, 9, 'meat');
  fire(b, 46, 13, 2.5, 3, true); // a slow fire to smoke the meat
  for (let y = 6; y <= 16; y++) { const t = (y - 6) / 10; b.set(46 + Math.sin(y * 0.7) * t * 2, y, 13 + t * 2, hash3(y, 4, 0) < 0.5 ? SMOKE : SMOKE_D); }
  hideFrame(b, 28, 30, 10, 12); hideFrame(b, 42, 30, 10, 12); // hides stretched on frames, painted
  for (const [x0, z0] of [[56, 27], [57, 37]]) { // hides staked flat on the ground to scrape
    b.box(x0, 1, z0, x0 + 9, 1, z0 + 6, (x, y, z) => (x === x0 || x === x0 + 9 || z === z0 || z === z0 + 6 ? ((x + z) % 2 ? 0 : HIDE_D) : HIDE_L));
    for (const [sx, sz] of [[x0 - 1, z0 - 1], [x0 + 10, z0 - 1], [x0 - 1, z0 + 7], [x0 + 10, z0 + 7]]) { b.set(sx, 1, sz, LOG_END); b.set(sx, 2, sz, LOG_END); }
  }
  travois(b, 4, 35); travois(b, 6, 27);
  parfleche(b, 24, 40, 4, 3, 3); parfleche(b, 29, 41, 4, 3, 2); parfleche(b, 25, 40, 3, 2, 2, 4);
  bundle(b, 34, 42, 6); bundle(b, 35, 42, 5, false, 4); bundle(b, 42, 41, 6); bundle(b, 50, 42, 6, false); // robes and packs
  for (let y = 1; y <= 3; y++) b.box(66 - y, y, 2, 70, y, 7, (x) => (x % 2 ? FUR : FUR_D)); // a pile of buffalo robes
  heap(b, 66, 44, 3, 2, 2, (x, y, z, r) => (r < 0.5 ? BONE : HORN)); // bones
  return { body: b, bodyPivot: [36, 0, 24] };
}

// Flint Quarry (the Derrick): a pit dug into a rocky outcrop, a lifting tripod over it with a basket on its rope,
// flint heaped by the rim and knapped at a painted hide shelter, a lance with streamers to mark the claim. 2 x 2.
function flintQuarry(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (Math.hypot(x - 21, z - 20) < 7 ? (hash3(x, 3, z) < 0.3 ? FLINT_D : 0x6a5a4a) : hash3(x, 4, z) < 0.04 ? FLINT : 0));
  for (let x = 0; x <= 47; x++) for (let z = 0; z <= 47; z++) { // the outcrop, broken by the pit, stepped down on the south side
    const d = Math.hypot((x - 20) / 1.1, z - 18); if (d > 19) continue;
    let h = Math.round(Math.min(15, (19 - d) * 1.4) + hash3(x >> 1, 8, z >> 1) * 2);
    const pit = Math.hypot(x - 21, z - 20);
    if (pit < 7) continue;
    if (pit < 9.5) h = Math.min(h, Math.round((pit - 7) * 3));
    if (z > 22 && Math.abs(x - 21) < 4) h = Math.min(h, Math.max(0, Math.round((pit - 7) * 1.5))); // steps down into the pit
    for (let y = 1; y <= h; y++) { const r = hash3(x, y, z); b.set(x, y, z, y === h && r < 0.15 ? SAGE : r < 0.06 ? FLINT : ROCK[Math.floor(hash3(x >> 1, y, z >> 1) * 4)]); }
  }
  for (const [x, z] of [[14, 15], [28, 14], [21, 28]]) line(b, [x, 6, z], [21, 26, 19], POLE); // the tripod over the pit
  for (let y = 7; y <= 25; y++) b.set(21, y, 20, ROPE);
  b.box(20, 4, 19, 22, 6, 21, (x, y) => (y === 6 ? FLINT_L : (x + y) % 2 ? BRUSH[3] : BRUSH[4])); // a basket coming up
  heap(b, 38, 34, 5, 4, 4, (x, y, z, r) => (r < 0.3 ? FLINT_L : r < 0.75 ? FLINT : FLINT_D)); heap(b, 40, 22, 3, 3, 3, (x, y, z, r) => (r < 0.4 ? FLINT_L : FLINT_D));
  arbor(b, 26, 37, 36, 45, 8, true); // the knappers' shelter: a painted hide awning
  for (const [x, z] of [[28, 40], [33, 42]]) { b.set(x, 1, z, LOG_END); for (let i = 0; i < 6; i++) b.set(x + (hash3(i, x, z) * 4 - 2), 0, z + (hash3(i, z, x) * 4 - 2), FLINT_L); } // stumps to work at, chips round them
  mat(b, 29, 39, 32, 43);
  for (let i = 0; i < 5; i++) b.set(30 + (i % 3), 1, 41 + (i >> 1), i % 2 ? FLINT_L : FLINT); // blades laid out
  streamers(b, 6, 40, 36, 7);
  b.box(42, 1, 8, 44, 3, 10, (x, y) => (y === 3 ? FLINT : (x + y) % 2 ? BRUSH[3] : BRUSH[4])); b.box(40, 1, 12, 42, 3, 14, (x, y) => (y === 3 ? FLINT_L : (x + y) % 2 ? BRUSH[3] : BRUSH[4])); // filled baskets
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Warrior Lodge (the Barracks): a great lodge painted with the warrior's belt of shields, shields on their tripods,
// a lance rack, a straw target shot full of arrows. 2 x 2.
function warriorLodge(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (x > 30 && z > 26 && hash3(x, 5, z) < 0.3 ? DIRT_D : 0));
  lodge(b, 18, 18, 14, 34, 1);
  shieldStand(b, 38, 8); shieldStand(b, 40, 18);
  for (let x = 4; x <= 14; x += 2) line(b, [x, 1, 41], [x + 2, 16, 37], (t) => (t > 0.94 ? FLINT_L : t > 0.82 ? TEAM : POLE)); // lances leaned on a rack
  b.box(3, 10, 38, 17, 10, 38, POLE_L); for (const x of [3, 17]) for (let y = 1; y <= 10; y++) b.set(x, y, 38, POLE);
  // the target: a bound bundle of grass on a frame, painted rings, arrows in it; shot at from the west
  for (const z of [36, 42]) for (let y = 1; y <= 9; y++) b.set(42, y, z, POLE);
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const d = Math.hypot(i, j); if (d > 4.2) continue; b.set(41, 9 + j, 39 + i, d < 1.2 ? TEAM_D : d < 2.4 ? 0xd8c070 : d < 3.3 ? TEAM : 0xc0a458); b.set(42, 9 + j, 39 + i, 0xc0a458); }
  for (const [y, z] of [[9, 40], [11, 38], [7, 37], [10, 41]]) { b.box(37, y, z, 40, y, z, POLE_L); b.set(36, y, z, TEAM_L); }
  b.box(24, 0, 38, 25, 0, 40, HIDE_D); b.set(24, 1, 39, LEATHER); b.set(24, 2, 39, TEAM); // a quiver set down at the shooting line
  for (let y = 1; y <= 4; y++) b.set(24, y + 1, 40, POLE_L);
  parfleche(b, 34, 2, 4, 3, 3); bundle(b, 2, 2, 5); seat(b, 30, 30, 6);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Horse Corral (the Vehicle Depot): a big corral of woven brush with the herd in it, a lodge, a tack rack hung with
// painted blankets and bridles, a travois waiting. 3 x 3.
function horseCorral(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => (x >= 26 && z >= 22 && hash3(x, 6, z) < 0.25 ? GRASS_D : 0));
  lodge(b, 14, 14, 11, 30);
  brush(b, 26, 22, 70, 70, 5, (x, z) => x === 26 && z > 40 && z < 50); // the corral, its gate on the west
  b.box(25, 1, 41, 25, 6, 41, POLE); b.box(25, 1, 49, 25, 6, 49, POLE); b.box(25, 6, 41, 25, 6, 49, POLE_L); // the gate frame
  place(b, pony(0x7a4a28, 0, true), 34, 30); place(b, pony(0x5a4030, 3), 52, 28, 1); place(b, pony(0xc8a070, 0, false, true), 44, 44, 0);
  place(b, pony(0x3a2a20, 5), 62, 58, 2); place(b, pony(0x9a5a30, 0, false, true), 38, 60, 3); place(b, pony(0x7a4a28, 7, true), 56, 46, 0);
  heap(b, 64, 30, 3, 3, 3, (x, y, z, r) => (r < 0.5 ? 0xd8c070 : 0xc0a458)); // cut grass
  for (let x = 46; x <= 52; x++) for (let z = 64; z <= 67; z++) b.set(x, 0, z, (x + z) % 3 ? 0x4a7a9a : 0x6a9ab8); // a water hole
  // the tack rack: blankets in the side's colour, bridles and pads
  for (const x of [4, 20]) for (let y = 1; y <= 8; y++) b.set(x, y, 36, POLE); b.box(4, 8, 36, 20, 8, 36, POLE_L);
  for (const x0 of [6, 13]) for (let x = x0; x <= x0 + 4; x++) for (let y = 3; y <= 8; y++) { b.set(x, y, 35, y % 3 === 0 ? TEAM_L : x === x0 || x === x0 + 4 ? TEAM_D : TEAM); b.set(x, y, 37, TEAM_D); }
  for (const x of [11, 18]) for (let y = 4; y <= 7; y++) b.set(x, y, 36, LEATHER);
  b.box(5, 1, 40, 9, 2, 43, (x, y) => (y === 2 ? LEATHER : HIDE_D)); b.box(11, 1, 40, 15, 2, 43, (x, y) => (y === 2 ? TEAM_D : HIDE_D)); // pads
  travois(b, 4, 56); woodCone(b, 18, 66, 3, 7); parfleche(b, 2, 30, 3, 3, 3);
  streamers(b, 26, 70, 18, 6);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Bow Maker (the Workshop): a shaded arbor of brush on poles, bows and staves drying on a rack beneath it, arrows
// fletched in the side's colour hung in rows, a small fire for bending the wood, a lodge behind. 2 x 2.
function bowMaker(): ModelDef {
  const b = new VB();
  ground(b, 47, 47, (x, z) => (x >= 5 && x <= 30 && z >= 18 && z <= 38 && hash3(x, 7, z) < 0.12 ? 0xc8a878 : 0)); // shavings
  arbor(b, 5, 18, 30, 38, 11);
  lodge(b, 34, 11, 9, 24);
  // the bow rack: staves curving, strung bows, in a row along x
  for (const x of [8, 26]) for (let y = 1; y <= 9; y++) b.set(x, y, 24, POLE); b.box(8, 9, 24, 26, 9, 24, POLE_L); b.box(8, 4, 24, 26, 4, 24, POLE_L);
  for (let x = 10; x <= 24; x += 3) { for (let y = 1; y <= 10; y++) b.set(x + Math.round(Math.sin(((y - 1) / 9) * Math.PI) * 1.2), y, 25, x % 2 ? POLE_L : LOG_L); for (let y = 2; y <= 9; y++) if (x % 2 === 0) b.set(x, y, 25, 0xd8d0b8); b.set(x + 1, 5, 25, x % 2 ? LEATHER : TEAM); }
  // arrows hung to dry, points down, fletching up in the side's colour
  b.box(9, 9, 32, 25, 9, 32, POLE_L); for (const x of [9, 25]) for (let y = 1; y <= 9; y++) b.set(x, y, 32, POLE);
  for (let x = 11; x <= 23; x++) if (x % 2) for (let y = 3; y <= 8; y++) b.set(x, y, 32, y === 3 ? FLINT : y >= 7 ? (y === 8 ? TEAM_L : TEAM) : POLE_L);
  // the work: a log bench, a stave on it, a bundle of shafts leaned up
  b.box(14, 1, 28, 21, 2, 29, (x, y) => (x === 14 || x === 21 ? LOG_END : y === 2 ? LOG_L : LOG)); b.box(15, 3, 28, 20, 3, 28, POLE_L);
  for (let k = 0; k < 6; k++) line(b, [4 + (k % 3), 1, 40 + (k >> 1)], [6, 12, 41], (t) => (t > 0.85 ? TEAM : LOG_L));
  fire(b, 38, 33, 3, 4); for (const [x, z] of [[34, 30], [42, 30], [38, 38]]) line(b, [x, 1, z], [38, 10, 33], POLE); // a fire, a frame over it to bend staves
  b.box(36, 9, 33, 40, 9, 33, LOG_L);
  parfleche(b, 40, 42, 4, 3, 3); bundle(b, 30, 43, 5); mat(b, 12, 34, 22, 37);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Herd Grounds (the Proving Ground): a wide pasture fenced with brush and stakes where the great herd is raised:
// buffalo grazing, a lodge for the herders, a salt lick, a tall lookout pole with a perch and streamers. 3 x 3.
function herdGrounds(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => (x >= 22 ? grass(x, z) : 0));
  brush(b, 22, 2, 70, 70, 4, (x, z) => x === 22 && z > 30 && z < 38);
  place(b, buffalo(true), 30, 10); place(b, buffalo(), 48, 8, 0); place(b, buffalo(true), 40, 26, 1); place(b, buffalo(true), 60, 30, 2);
  place(b, buffalo(), 32, 46, 0); place(b, buffalo(true), 52, 52, 3); place(b, buffalo(true), 44, 62, 0); place(b, buffalo(), 64, 50, 1);
  heap(b, 56, 40, 2, 2, 2, (x, y, z, r) => (r < 0.5 ? 0xe6e0d4 : 0xccc4b4)); // the salt lick
  for (let x = 30; x <= 36; x++) for (let z = 58; z <= 62; z++) if (Math.hypot((x - 33) / 3.5, (z - 60) / 2.5) < 1) b.set(x, 0, z, 0x4a7a9a); // a pond
  lodge(b, 10, 12, 9, 26);
  // the lookout pole: a tall pole with a perch, streamers above
  for (let y = 1; y <= 32; y++) { b.set(10, y, 56, POLE); b.set(11, y, 56, y % 6 === 0 ? TEAM : POLE); }
  for (const [x, z] of [[4, 52], [16, 52], [10, 63]]) line(b, [x, 1, z], [10.5, 20, 56], POLE_L); // its stays
  b.box(8, 24, 54, 13, 24, 58, (x, y, z) => (x === 8 || x === 13 || z === 54 || z === 58 ? LOG_D : LOG));
  b.box(8, 25, 54, 13, 26, 58, (x, y, z) => (x === 8 || x === 13 || z === 54 || z === 58 ? ((x + z) % 3 ? TEAM : TEAM_D) : 0));
  for (let y = 1; y < 24; y++) if (y % 2 === 0) b.set(11, y, 57, POLE_L);
  for (let i = 1; i <= 6; i++) { b.set(10 + i, 31 - Math.round(i * 0.3), 56, TEAM); b.set(10 + i, 30 - Math.round(i * 0.3), 56, i % 2 ? TEAM_L : TEAM); }
  b.set(10, 33, 56, BONE); b.set(10, 34, 56, K);
  travois(b, 2, 30); woodCone(b, 6, 42, 3, 7); fire(b, 16, 30, 2.5, 3); parfleche(b, 14, 64, 4, 3, 3);
  return { body: b, bodyPivot: [36, 0, 36] };
}

// Signal Hill (the Radar Tower): a raised earth mound, a signal fire in a stone ring on top sending a column of
// smoke up into the sky (puffs climbing through the loop), a painted blanket to send the signals, a watcher's
// brush shelter at the foot. 2 x 2.
function signalHill(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  const top = 11;
  for (let x = 0; x <= 47; x++) for (let z = 0; z <= 47; z++) { // the mound, a path climbing its south face
    const d = Math.hypot(x - 20, z - 20); if (d > 19) continue;
    let h = Math.min(top, Math.round((19 - d) * 0.9 + hash3(x >> 1, 9, z >> 1)));
    if (z > 20 && Math.abs(x - 20 - (z - 20) * 0.3) < 2) h = Math.max(1, Math.min(h, top - Math.round((z - 26) * 0.9))); // the path
    for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? (hash3(x >> 1, 15, z >> 1) < 0.22 ? grass(x, z) : hash3(x, y, z) < 0.3 ? DIRT_D : DIRT_L) : y > h - 2 ? DIRT : hash3(x, y, z) < 0.3 ? DIRT_D : DIRT);
  }
  { const f = new VB(); fire(f, 0, 0, 4.5, 7); place(b, f, 20, 20, 0, top); } // the signal fire on the summit
  const fr = frame();
  for (let y = top + 6; y <= 46; y++) { // the column of smoke, billowing, rising in puffs
    const t = (y - top - 6) / (46 - top - 6), ph = ((y + fr * 3) % 9) / 9, r = 1.4 + t * 2.4 + Math.sin(ph * Math.PI) * 1.2, drift = t * t * 5;
    if (ph > 0.85) continue; // the gaps between puffs
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { const d = Math.hypot(dx, dz); if (d > r) continue; b.set(20 + dx + drift, y, 20 + dz, d > r - 1 ? (hash3(dx, y, dz) < 0.5 ? SMOKE_D : SMOKE) : ph < 0.3 ? SMOKE_L : SMOKE); }
  }
  { const f = new VB(); hideFrame(f, 0, 0, 9, 10); place(b, f, 13, 26, 0, top - 1); } // the signal blanket on its frame by the fire
  for (const [x, z] of [[13, 16], [14, 25]]) for (let y = top + 1; y <= top + 2; y++) b.set(x, y, z, LOG_END); // stones to sit on
  arbor(b, 33, 3, 44, 11, 7); mat(b, 35, 5, 42, 9); bundle(b, 36, 7, 4); // the watcher's shelter
  streamers(b, 25, 15, top + 16, 6);
  woodpile(b, 38, 30, 6, 4, 4, true); parfleche(b, 2, 42, 4, 3, 3);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Sky Watch (the Interceptor Battery): a tall pole platform with archers on the perch watching the sky, a fire
// basket burning above them to light the arrows, earth banks on two sides, arrow bundles at the foot. 2 x 2.
function skyWatch(): ModelDef {
  const b = new VB();
  ground(b, 47, 47);
  for (let x = 1; x <= 46; x++) for (let z = 1; z <= 46; z++) { const d = Math.min(x, z); if (d > 6) continue; const h = Math.min(5, 7 - d); for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? (hash3(x, y, z) < 0.2 ? SAGE : DIRT_L) : y % 2 ? DIRT_D : 0x9a7a52); } // earth banks
  platform(b, 17, 17, 33, 33, 20, 4);
  archer(b, 21, 21, 20, 1.0); archer(b, 27, 21, 26, 0.9);
  // the fire basket: a woven iron-hard basket of green wood on a pole above the deck
  for (let y = 21; y <= 30; y++) b.set(30, y, 20, POLE);
  { const f = new VB(); fire(f, 0, 0, 3.6, 7, false); place(b, f, 30, 20, 0, 30); }
  b.box(27, 31, 17, 33, 32, 23, (x, y, z) => (x === 27 || x === 33 || z === 17 || z === 23 ? ((x + z + y) % 2 ? TEAM_D : LOG) : 0));
  for (const x of [12, 36]) for (const z of [38, 41]) { for (let y = 1; y <= 5; y++) b.set(x, y, z, y >= 4 ? TEAM : POLE_L); b.set(x, 6, z, TEAM_L); } // arrow bundles stood ready
  lodge(b, 39, 11, 6, 15); parfleche(b, 20, 40, 4, 3, 3); bundle(b, 26, 42, 5);
  return { body: b, bodyPivot: [24, 0, 24] };
}

// Stampede Grounds (the EMP Cannon): their great strike: a drive lane of stakes, brush and stone cairns funnelling
// out east, buffalo penned at its wide end ready to be driven, a tall caller's pole at the mouth, a lodge. 3 x 3.
function stampedeGrounds(): ModelDef {
  const b = new VB();
  ground(b, 71, 71, (x, z) => (Math.abs(z - 36) < 6 + (62 - x) * 0.45 && x < 66 ? (hash3(x, 13, z) < 0.25 ? DIRT_D : 0x9a7c54) : grass(x, z))); // churned earth in the lane
  for (const s of [-1, 1]) for (let x = 2; x <= 64; x++) { // the drive lines: stakes woven with brush, narrowing to the mouth
    const w = 4 + (64 - x) * 0.47, z = Math.round(36 + s * w), h = 5 + Math.round(hash3(x, 14, z) * 2);
    if (x % 9 === 4) { heap(b, x, z, 2, 2, 5, (xx, y, zz, r) => (y >= 4 ? TEAM : STONE[Math.floor(r * 3)])); continue; } // a cairn, its top painted
    if (x % 3 === 0) { line(b, [x, 1, z], [x, h + 2, z + s], LOG); b.set(x, h + 3, z + s, LOG_END); }
    for (let y = 1; y <= h - 1; y++) for (const dz of [0, -s]) if (hash3(x, y, z + dz) < 0.85) b.set(x, y, z + dz, BRUSH[Math.floor(hash3(x, y + 5, z + dz) * BRUSH.length)]);
  }
  brush(b, 2, 9, 2, 63, 6); // the pen's back
  place(b, buffalo(), 8, 18, 0); place(b, buffalo(), 10, 30, 0); place(b, buffalo(), 6, 42, 0); place(b, buffalo(), 12, 52, 0); place(b, buffalo(), 22, 24, 0); place(b, buffalo(), 24, 44, 0); place(b, buffalo(), 20, 34, 0);
  // the caller's pole at the mouth: a tall painted post, streamers, a buffalo skull bound to it
  post(b, 62, 22, 40);
  b.box(61, 18, 24, 64, 20, 24, BONE); b.set(61, 21, 24, HORN); b.set(64, 21, 24, HORN); b.set(62, 19, 25, K); b.set(63, 19, 25, K);
  streamers(b, 64, 50, 26, 6);
  lodge(b, 60, 61, 8, 24); lodge(b, 59, 9, 6, 18);
  woodCone(b, 44, 66, 3, 7); parfleche(b, 48, 4, 4, 3, 3);
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
