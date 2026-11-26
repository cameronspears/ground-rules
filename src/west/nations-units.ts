// WILD WEST: the Plains Nations' units, standing in for the ART model of the same key when a side plays the Nations
// (see index.ts). Same size and pivot as the Settlers' model for that key; facing +X like every model.
// The Nations are a made-up alliance of the plains, drawn with care: horses, bows, lances, round rawhide shields with
// simple painted designs, buckskin, beadwork and painted bands in the side's colour. Hair dark and long, often braided.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from '../models';
import { hash3 } from '../hash';
import { tower } from '../art';
import { animate, pose, swing } from './pose';

const SKIN = 0xa8704c, HAIR = 0x1c1612, BUCK = 0xa08058, BUCK_D = 0x7a5e3e, MOC = 0x5a4028, LEATHER = 0x4a3020;
const HIDE = 0xe0d0ae, HIDE_L = 0xeee2c6, HIDE_D = 0xbca886; // rawhide, lodge covers
const BOW = 0x7e5a34, STRING = 0xd8d0bc, SHAFT = 0xb09a70, FLETCH = 0xeae6da, QUILL = 0x3a3430, POINT = 0x6a6e70;
const FIRE = 0xff7a20, FLAME = 0xffd040, EMBER = 0xc83a18, CLAY = 0x8a5a3a, STONE = 0x7a7670, STONE_L = 0x9a968e;
const POLE = 0x8a6a44, POLE_D = 0x6a5034, HOOF = 0x2a2420;

// A thick line of blocks from one point to another (poles, lances)
function line(b: VB, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, col: (x: number, y: number, z: number, t: number) => number) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 1.5) || 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t);
    for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) for (let e = -r; e <= r; e++) b.set(x + a, y + c, z + e, col(x + a, y + c, z + e, t));
  }
}

// A drawn bow in the x–y plane at z: the grip at (gx, gy), the arrow pointing along (ax, ay), the limbs bending back
// to the string, which is pulled to the nock; the arrow on the string, its head (or a burning tip) at the front.
function bow(b: VB, gx: number, gy: number, z: number, ax: number, ay: number, half: number, tip = POINT, drawn = true) {
  const l = Math.hypot(ax, ay); ax /= l; ay /= l;
  const sx = -ay, sy = ax, bend = drawn ? 1.3 : 0.6;
  const at = (t: number) => [gx + sx * t * half - ax * t * t * bend, gy + sy * t * half - ay * t * t * bend];
  for (let i = -half * 3; i <= half * 3; i++) { const [x, y] = at(i / (half * 3)); b.set(x, y, z, Math.abs(i) > half * 2.4 ? LEATHER : BOW); }
  if (!drawn) return;
  const nx = gx - ax * (half + 0.5), ny = gy - ay * (half + 0.5);
  for (const end of [-1, 1]) { const [tx, ty] = at(end); for (let i = 1; i < 6; i++) b.set(tx + (nx - tx) * i / 6, ty + (ny - ty) * i / 6, z, STRING); }
  for (let i = 0; i <= half + 2; i++) b.set(nx + ax * i, ny + ay * i, z, i === half + 2 ? tip : SHAFT);
  b.set(nx, ny, z, SKIN); // the drawing hand
}
// A round rawhide shield in the x–y plane at z: a rim in the side's colour, pale hide, a painted centre (and on a big
// one a cross of four arms)
function shield(b: VB, cx: number, cy: number, z: number, r: number) {
  const n = Math.ceil(r);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const d = Math.hypot(i, j); if (d > r) continue;
    b.set(cx + i, cy + j, z, d > r - 0.95 ? TEAM : d < 0.8 ? (r > 3 ? TEAM_L : TEAM_D) : r > 3 && (i === 0 || j === 0) && d < r - 1.4 ? TEAM_D : HIDE);
  }
}

// A warrior on foot at (ox, oz), 3 wide (z), facing +x: buckskin leggings and moccasins, a shirt in the side's colour
// with a beadwork yoke, a long braid down the back
function walker(b: VB, ox: number, oz: number, o: { feather?: boolean; band?: boolean } = {}) {
  for (const [z, ph] of [[0, 0.25], [2, 0.75]]) { const x = ox + 1 + swing(ph); b.set(x, 0, oz + z, MOC); b.set(x, 1, oz + z, BUCK); b.set(ox + 1, 2, oz + z, BUCK_D); }
  b.set(ox + 2, 2, oz + 1, TEAM_D); // the breechcloth's flap
  b.box(ox + 1, 3, oz, ox + 2, 5, oz + 2, (x, y, z) => (y === 3 ? BUCK_D : y === 5 && (x + z) % 2 ? TEAM_L : TEAM));
  b.box(ox + 1, 6, oz, ox + 2, 6, oz + 2, (x) => (x === ox + 2 ? SKIN : HAIR));
  b.box(ox + 1, 7, oz, ox + 2, 7, oz + 2, HAIR);
  if (o.band) b.box(ox + 1, 6, oz, ox + 1, 6, oz + 2, TEAM_D); // a headband in the side's colour
  b.box(ox, 4, oz + 2, ox, 6, oz + 2, HAIR); // the braid
  if (o.feather) { b.set(ox, 8, oz + 1, FLETCH); b.set(ox, 9, oz + 1, QUILL); } // a single feather
}
// A quiver slung on the back, the arrows' fletching out of the top
function quiver(b: VB, x: number, y: number, z: number) { b.box(x, y, z, x, y + 2, z, (xx, yy) => (yy === y + 1 ? TEAM_D : LEATHER)); b.set(x, y + 3, z, FLETCH); b.set(x - 1, y + 3, z, FLETCH); }
// A bow carried unstrung-looking at the side while walking
function carriedBow(b: VB, x: number, z: number) { bow(b, x + 2, 4, z, 1, 0, 3, POINT, false); b.set(x + 2, 4, z - 1, SKIN); }

// Archer (rifle): on foot, a bow drawn, a quiver on the back
export function archer(): ModelDef {
  const b = new VB();
  walker(b, 0, 0, { feather: true });
  quiver(b, 0, 3, 0);
  b.box(3, 5, 3, 4, 5, 3, SKIN); // the bow arm out
  bow(b, 5, 5, 3, 1, 0, 3);
  return { body: b, bodyPivot: [1.5, 0, 1.5] };
}

// Fire Archer (rocket): an arrow nocked with a burning tip, a small clay fire pot hung at the hip, a headband
export function fireArcher(): ModelDef {
  const b = new VB();
  walker(b, 0, 0, { band: true });
  quiver(b, 0, 3, 0);
  b.box(3, 5, 3, 4, 5, 3, SKIN);
  bow(b, 5, 5, 3, 1, 0, 3, FIRE);
  b.set(7, 5, 3, FLAME); b.set(6, 6, 3, FLAME); b.set(7, 6, 3, FIRE); // the flame at the tip
  b.box(1, 2, 3, 2, 3, 3, (x, y) => (y === 3 ? (x === 1 ? FIRE : EMBER) : CLAY)); // the fire pot, coals glowing in its mouth
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// Shield Warrior (grenadier): a round painted rawhide shield on the left arm, a stone-headed war club in the right
export function shieldWarrior(): ModelDef {
  const b = new VB();
  walker(b, 0, 0, { feather: true });
  shield(b, 2, 4, 3, 2.5);
  b.set(3, 5, 0, SKIN); b.box(3, 6, 0, 3, 7, 0, (x, y) => (y === 6 ? TEAM_D : BOW)); b.box(3, 8, 0, 4, 8, 0, STONE); b.set(3, 9, 0, STONE_L); // the club raised
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// ---------------------------------------------------------------- horses
// A horse facing +x from (ox, oz): size 0 a pony (16 long, like the Settlers' horseman), 1 a bigger horse, 2 a heavy one.
// At a run (each diagonal pair together) or a walk. Gives where its rider sits.
interface Coat { body: (x: number, y: number, z: number) => number; d: number; l: number; mane: number }
interface Mount { T: number; rx: number; c: number; hw: number; x1: number; nt: number }
const BAY: Coat = { body: () => 0x7a4a28, d: 0x5a341c, l: 0x94603a, mane: 0x2a1e16 };
const PAINT: Coat = { body: (x, y, z) => (hash3(x >> 1, y >> 1, z >> 1) < 0.42 ? 0x7a4a2c : 0xe8e0d0), d: 0x8a6a50, l: 0xf0e8da, mane: 0x2a1e16 }; // a painted pony, white with brown patches
const DUN: Coat = { body: () => 0xb08a5a, d: 0x7a5a3a, l: 0xc4a070, mane: 0x2a1e16 };
const DARK: Coat = { body: () => 0x4a3020, d: 0x342218, l: 0x5e3e2a, mane: 0x1a1410 };
function horse(b: VB, ox: number, oz: number, size: number, coat: Coat, walk = false, ph = 0): Mount {
  const lt = 3 + size, hw = size === 2 ? 3 : size ? 2 : 1, c = oz + hw + 1, T = lt + 4 + size, x1 = ox + 11 + size * 2;
  for (const [lx, dz, p] of [[ox + 3 + size, -1, 0.5], [ox + 3 + size, 1, 0], [x1 - 1 - (size >> 1), -1, 0], [x1 - 1 - (size >> 1), 1, 0.5]]) {
    const z = c + dz * (hw > 2 ? 2 : 1), s = swing(p + ph), D = coat.d;
    for (let k = 0; k <= (size === 2 ? 1 : 0); k++) {
      const x = lx + k;
      if (walk) { b.set(x + s, 0, z, HOOF); b.set(x + s, 1, z, D); b.box(x, 2, z, x, lt, z, D); }
      else if (s > 0) { b.set(x + 2, 1, z, HOOF); b.set(x + 1, 2, z, D); b.box(x, 3, z, x, lt, z, D); }
      else if (s < 0) { b.set(x - 2, 0, z, HOOF); b.set(x - 1, 1, z, D); b.set(x - 1, 2, z, D); b.box(x, 2, z, x, lt, z, D); }
      else { b.set(x, 0, z, HOOF); b.box(x, 1, z, x, lt, z, D); }
    }
  }
  b.box(ox + 2, lt + 1, c - hw, x1, T, c + hw, (x, y, z) => (hw > 1 && (z === c - hw || z === c + hw) && (y === T || y === lt + 1) ? 0 : y === T ? coat.l : y === lt + 1 ? coat.d : coat.body(x, y, z))); // the barrel
  const nt = T + 3 + size, nw = size === 2 ? 2 : 1; // neck top, half its width
  b.box(x1, T, c - nw, x1 + 1, nt, c + nw, (x, y, z) => (y === nt ? coat.l : coat.body(x, y, z)));
  b.box(x1 - 1, T + 1, c, x1, nt + 1, c, coat.mane);
  const hx = x1 + 2, hl = size ? 3 : 2;
  b.box(hx, nt - 1, c - 1, hx + hl, nt + 1, c + 1, (x, y, z) => (x === hx + hl ? (y === nt - 1 ? coat.mane : coat.d) : y === nt + 1 ? coat.l : coat.body(x, y, z))); // head, dark muzzle
  b.set(hx, nt + 2, c - 1, coat.d); b.set(hx, nt + 2, c + 1, coat.d); // ears
  b.box(ox, T - 2, c, ox + 1, T, c, coat.mane); b.set(ox, T - 3, c, coat.mane); // tail
  return { T, rx: ox + 6 + size, c, hw, x1, nt };
}
// A blanket in the side's colour over the horse's back, hanging down both flanks, a checked beadwork band along it
function blanket(b: VB, x0: number, x1: number, T: number, zl: number, zr: number) {
  b.box(x0, T - 1, zl, x1, T + 1, zr, (x, y, z) => (z === zl || z === zr ? (y === T - 1 ? TEAM_D : y === T ? ((x + z) % 2 ? TEAM_L : TEAM_D) : TEAM) : y === T + 1 ? BUCK_D : 0));
}
// The rider astride: legs down the flanks, a shirt in the side's colour, dark hair and a braid
function rider(b: VB, m: Mount, o: { feather?: boolean; band?: boolean } = {}) {
  const { T, rx: x, c, hw } = m, zl = c - hw - 1, zr = c + hw + 1;
  blanket(b, x - 1, x + 2, T, zl, zr);
  for (const z of [zl, zr]) { b.box(x, T - 1, z, x, T + 1, z, BUCK); b.set(x + 1, T - 2, z, MOC); }
  b.box(x, T + 2, c - 1, x + 1, T + 4, c + 1, (xx, y, z) => (y === T + 2 ? BUCK_D : y === T + 4 && (xx + z) % 2 ? TEAM_L : TEAM));
  b.box(x, T + 5, c - 1, x + 1, T + 5, c + 1, (xx) => (xx === x + 1 ? SKIN : o.band ? TEAM_D : HAIR));
  b.box(x, T + 6, c - 1, x + 1, T + 6, c + 1, HAIR);
  b.box(x - 1, T + 3, c + 1, x - 1, T + 5, c + 1, HAIR); // the braid
  if (o.feather) { b.set(x, T + 7, c - 1, FLETCH); b.set(x, T + 8, c - 1, QUILL); }
}
// A pennant in the side's colour streaming back from (x, y) on a pole, hanging below it
function pennant(b: VB, x: number, y: number, z: number, len: number, rise = 0) {
  for (let i = 0; i < len; i++) { const h = Math.max(1, Math.round(3 * (1 - i / len))) ; for (let j = 0; j < h; j++) b.set(x - i, y - 1 - j + Math.round(i * rise), z, j === 1 ? TEAM_L : TEAM); }
}

// Mounted Archer (scout): a painted pony at a run, a rider on the side's blanket with a bow drawn
export function mountedArcher(): ModelDef {
  const b = new VB();
  const m = horse(b, 0, 0, 0, PAINT);
  rider(b, m, { feather: true });
  const { T, rx: x } = m;
  quiver(b, x - 1, T + 2, 1);
  b.box(x + 2, T + 4, 4, x + 3, T + 4, 4, SKIN);
  bow(b, x + 4, T + 4, 4, 1, 0, 3);
  return { body: b, bodyPivot: [7.5, 0, 2] };
}

// Lancers (tank): two riders abreast on big horses, long lances couched forward with pennants in the side's colour
// streaming under the points, round painted shields on their left arms.
export function lancers(): ModelDef {
  const b = new VB();
  for (const [ox, oz, coat, ph] of [[3, 0, BAY, 0], [0, 7, DUN, 0.25]] as [number, number, Coat, number][]) {
    const m = horse(b, ox, oz, 1, coat, false, ph);
    rider(b, m, { band: oz > 0 });
    const { T, rx: x, c, hw } = m, z = c + 2;
    shield(b, x + 1, T + 2, c - hw - 1, 2.6);
    b.set(x + 1, T + 3, z, SKIN);
    line(b, x - 4, T + 2, z, x + 19, T + 8, z, 0, (xx, y, zz, t) => (t > 0.94 ? POINT : t < 0.06 ? TEAM_D : POLE));
    pennant(b, x + 15, T + 7, z, 6, -0.25);
  }
  return { body: b, bodyPivot: [11.5, 0, 6.5] };
}

// Shield Riders (juggernaut): the side's heaviest riders. Two big dark horses under painted hide drapes, a wall of
// three overlapping rawhide shields hung along each outer flank, the riders holding tall lances upright, pennants flying.
export function shieldRiders(): ModelDef {
  const b = new VB();
  for (const [ox, oz, out, ph] of [[9, 1, -1, 0], [3, 11, 1, 0.25]]) {
    const m = horse(b, ox, oz, 2, DARK, false, ph);
    const { T, c, hw, x1 } = m, lt = T - 6;
    b.box(ox + 3, lt + 1, c - hw, x1 - 1, T, c + hw, (x, y, z) => { // the hide drape over the body, a band of stepped triangles in the side's colour at its hem
      if ((z === c - hw || z === c + hw) && (y === T || y === lt + 1)) return 0;
      const teeth = [0, 1, 2, 1][x % 4];
      return y === lt + 1 ? TEAM_D : y - lt - 2 <= teeth ? TEAM : y === T ? HIDE_L : HIDE;
    });
    rider(b, m, { feather: out > 0, band: out < 0 });
    const zo = out < 0 ? c - hw - 2 : c + hw + 2;
    for (const dx of [-5, 5, 0]) shield(b, m.rx + 1 + dx, T - 1, zo, 3.3); // the shield wall
    const lx = m.rx + 2, lz = c + (out < 0 ? 2 : -2);
    b.set(lx, T + 3, lz, SKIN);
    b.box(lx, T - 2, lz, lx, T + 18, lz, (x, y) => (y === T + 18 ? POINT : y === T + 17 ? POINT : POLE));
    pennant(b, lx - 1, T + 16, lz, 6, 0);
  }
  return { body: b, bodyPivot: [15.5, 0, 9.5] };
}

// ---------------------------------------------------------------- archers in groups
// A kneeling archer at (x, z): one knee down, a tall bow drawn and angled high in the plane z + 3
function kneeler(b: VB, x: number, z: number) {
  b.set(x - 1, 0, z, MOC); b.box(x, 0, z, x + 1, 0, z, BUCK); // the kneeling leg, shin on the ground
  b.set(x + 2, 0, z + 2, MOC); b.box(x + 2, 1, z + 2, x + 2, 2, z + 2, BUCK); // the other knee up
  b.box(x, 1, z, x + 1, 1, z + 2, BUCK_D);
  b.box(x, 2, z, x + 1, 4, z + 2, (xx, y, zz) => (y === 4 && (xx + zz) % 2 ? TEAM_L : TEAM));
  b.box(x, 5, z, x + 1, 5, z + 2, (xx) => (xx === x + 1 ? SKIN : HAIR)); b.box(x, 6, z, x + 1, 6, z + 2, HAIR);
  b.box(x - 1, 3, z + 2, x - 1, 5, z + 2, HAIR);
  quiver(b, x - 1, 2, z);
  b.box(x + 2, 4, z + 3, x + 3, 6, z + 3, SKIN);
  bow(b, x + 4, 7, z + 3, 1, 1.6, 6);
}
// A bundle of arrows stuck point-down in the ground, tied with a band in the side's colour
function arrowBundle(b: VB, x: number, z: number) {
  for (const [dx, dz, h] of [[0, 0, 4], [1, 0, 3], [0, 1, 3], [1, 1, 4], [2, 1, 3], [1, 2, 3]]) { b.box(x + dx, 1, z + dz, x + dx, h - 1, z + dz, (xx, y) => (y === 2 ? TEAM : SHAFT)); b.set(x + dx, h, z + dz, FLETCH); }
}

// A round shield lying flat on the ground (the x–z plane), its painted face up
function flatShield(b: VB, cx: number, cz: number, r: number) {
  const n = Math.ceil(r);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const d = Math.hypot(i, j); if (d <= r) b.set(cx + i, 1, cz + j, d > r - 0.95 ? TEAM : d < 0.8 ? TEAM_D : HIDE); }
}

// Volley Archers (artillery): three archers kneeling in a row, tall bows angled high to loose over anything, their
// shields laid on the ground behind them, a bundle of arrows stuck in the ground before them. On the move they stand
// and walk, bows in hand.
export function volleyArchers(): ModelDef {
  const b = new VB();
  const row = [[12, 0], [8, 5], [12, 10]];
  if (pose.t < 0) { for (const [x, z] of row) { kneeler(b, x, z); flatShield(b, x - 5, z + 1, 2.6); } arrowBundle(b, 20, 5); arrowBundle(b, 17, 1); }
  else for (const [x, z] of row) { walker(b, x, z, { feather: z === 5 }); quiver(b, x, 3, z); carriedBow(b, x, z + 3); }
  return { body: b, bodyPivot: [12.5, 0, 6.5] };
}

// Sky Archers (flak): a pair of archers drawing straight up at the sky beside a tall lookout pole flying a long
// banner in the side's colour.
export function skyArchers(): ModelDef {
  const b = new VB();
  const pair = [[11, 2], [15, 8]];
  for (const [x, z] of pair) {
    walker(b, x, z, { feather: x > 12 });
    quiver(b, x, 3, z);
    if (pose.t < 0) { b.box(x + 2, 6, z + 1, x + 2, 8, z + 1, SKIN); bow(b, x + 2, 10, z + 1, 0, 1, 3); }
    else carriedBow(b, x, z + 3);
  }
  // the lookout pole, a crossbar near the top, the banner hanging from it: the side's colour, a border, a column of diamonds, a fringe
  b.box(5, 1, 6, 5, 27, 6, (x, y) => (y === 27 ? FLETCH : POLE)); b.box(4, 0, 5, 6, 0, 7, STONE);
  b.box(5, 25, 6, 9, 25, 6, POLE_D);
  for (let x = 6; x <= 9; x++) for (let y = 12; y <= 24; y++) {
    const dia = Math.abs(x - 7.5) + Math.abs(((y - 12) % 5) - 2) < 1.6;
    b.set(x, y, 6, y === 24 || x === 6 || x === 9 ? TEAM_D : dia ? TEAM_L : TEAM);
  }
  for (const x of [6, 8, 9]) b.box(x, 10, 6, x, 11, 6, (xx, y) => (y === 10 ? HIDE : TEAM_D)); // fringe
  return { body: b, bodyPivot: [12.5, 0, 6.5] };
}

// ---------------------------------------------------------------- the great herd
const BUF = 0x5a3c24, BUF_D = 0x3a2616, BUF_DD = 0x261910, BUF_L = 0x7a5434, HORN = 0xd8ccb0;
// A buffalo charging, facing +x from (ox, oz), 17 long and 7 wide: short dark legs, lean hindquarters, a great shaggy
// hump over the shoulders, the head carried low, short curved horns, a beard
function buffalo(b: VB, ox: number, oz: number, ph: number) {
  const c = oz + 3;
  for (const [lx, dz, p] of [[ox + 3, -1, 0.5], [ox + 3, 1, 0], [ox + 11, -1, 0], [ox + 11, 1, 0.5]]) {
    const z = c + dz, s = swing(p + ph);
    if (s > 0) { b.set(lx + 2, 1, z, HOOF); b.set(lx + 1, 2, z, BUF_DD); b.set(lx, 3, z, BUF_D); }
    else if (s < 0) { b.set(lx - 2, 0, z, HOOF); b.set(lx - 1, 1, z, BUF_DD); b.box(lx - 1, 2, z, lx, 3, z, BUF_D); }
    else { b.set(lx, 0, z, HOOF); b.box(lx, 1, z, lx, 3, z, BUF_DD); }
  }
  b.box(ox + 1, 4, c - 2, ox + 7, 8, c + 2, (x, y, z) => (Math.abs(z - c) === 2 && (y === 4 || y === 8) ? 0 : y === 8 ? BUF_L : BUF)); // hindquarters
  const tops = [9, 11, 12, 12, 11, 10, 9];
  for (let i = 0; i < 7; i++) { // the shaggy forequarters and hump, ragged at the edges
    const x = ox + 7 + i, top = tops[i];
    for (let y = 3; y <= top; y++) for (let z = c - 3; z <= c + 3; z++) {
      const edge = Math.abs(z - c) === 3, h = hash3(x, y, z);
      if (edge && (y < 5 || y > top - 2 || h < 0.25)) continue;
      if (y === 3 && (Math.abs(z - c) > 1 || h < 0.4)) continue;
      b.set(x, y, z, y === top ? (h < 0.5 ? BUF_L : BUF) : h < 0.3 ? BUF_DD : BUF_D);
    }
  }
  b.box(ox + 14, 3, c - 1, ox + 16, 7, c + 1, (x, y, z) => (x === ox + 16 && y <= 4 ? 0x1a120c : x === ox + 16 && y === 7 ? 0 : BUF_DD)); // the head, low
  b.box(ox + 15, 2, c, ox + 15, 2, c, BUF_DD); // beard
  for (const s of [-1, 1]) { b.set(ox + 14, 7, c + s * 2, HORN); b.set(ox + 14, 8, c + s * 2, 0x8a8070); } // horns
  b.box(ox, 6, c, ox, 7, c, BUF_D); b.set(ox, 5, c, BUF_DD); // tail
}

// Great Herd (colossus): seven buffalo stampeding in a tight mass, three riders driving them from the flanks and the
// rear, the side's blankets on their horses and long pennants in the side's colour flying high on their lances.
export function greatHerd(): ModelDef {
  const b = new VB();
  const herd = [[38, 9], [39, 24], [24, 2], [21, 16], [25, 31], [7, 9], [6, 24]];
  herd.forEach(([x, z], i) => buffalo(b, x, z, (i * 0.37) % 1));
  for (const [ox, oz, coat, ph] of [[3, 0, PAINT, 0.1], [0, 17, BAY, 0.35], [5, 32, DUN, 0.6]] as [number, number, Coat, number][]) {
    const m = horse(b, ox, oz, 1, coat, false, ph);
    rider(b, m, { feather: oz > 10, band: oz < 10 });
    const { T, rx: x, c } = m, z = c + (oz > 20 ? -2 : 2), top = T + 22;
    b.set(x + 1, T + 3, z, SKIN);
    b.box(x + 2, T - 2, z, x + 2, top, z, (xx, y) => (y >= top - 1 ? POINT : POLE)); // a tall lance held upright, a long pennant flying from it over the herd
    for (let i = 0; i < 9; i++) { const h = Math.max(1, Math.round(4 * (1 - i / 9))); for (let j = 0; j < h; j++) b.set(x + 1 - i, top - 2 - j - (i >> 2), z, j === 1 ? TEAM_L : TEAM); }
  }
  return { body: b, bodyPivot: [28, 0, 19.5] };
}

// ---------------------------------------------------------------- workers
// A pair of parfleches, painted rawhide cases, hung down both flanks of a horse: a border and a diamond in the side's colour
function parfleches(b: VB, m: Mount) {
  const { T, c, rx } = m;
  for (const z of [c - 2, c + 2]) for (let x = rx - 3; x <= rx + 2; x++) for (let y = T - 3; y <= T + 1; y++) {
    const edge = x === rx - 3 || x === rx + 2 || y === T - 3 || y === T + 1, dia = Math.abs(x - (rx - 0.5)) + Math.abs(y - (T - 1)) < 1.6;
    b.set(x, y, z, edge ? TEAM : dia ? TEAM_D : HIDE);
  }
  b.box(rx - 3, T + 2, c - 1, rx + 2, T + 2, c + 1, LEATHER); // the strap over its back
}
// A travois dragging behind a horse: two long poles from either side of its withers down to the ground behind,
// lashed crosspieces, and a load on them
function travois(b: VB, m: Mount, x0: number) {
  const { T, c, x1 } = m;
  for (const s of [-1, 1]) line(b, x1 - 1, T + 2, c + s * 2, x0, 0, c + s * 3, 0, () => POLE);
  for (let x = x0 + 2; x <= x0 + 8; x += 3) { const y = Math.round((x - x0) * (T + 2) / (x1 - 1 - x0)); b.box(x, y, c - 2, x, y, c + 2, POLE_D); }
}

// Lodge Builders (builder): a horse pulling a travois loaded with a rolled lodge cover painted in the side's colour
// and a bundle of lodge poles, painted parfleches on its flanks, the builder walking beside with a lead rope.
export function lodgeBuilders(): ModelDef {
  const b = new VB();
  const m = horse(b, 10, 2, 0, DUN, true);
  parfleches(b, m);
  travois(b, m, 0);
  const { c } = m;
  for (let x = 2; x <= 8; x++) for (let y = 2; y <= 5; y++) for (let z = c - 2; z <= c + 2; z++) { // the rolled cover, along x
    const d = Math.hypot(y - 3.5 - (x - 2) * 0.15, z - c); if (d > 2.1) continue;
    b.set(x, y + Math.round((x - 2) * 0.3), z, x % 3 === 1 ? TEAM : d > 1.4 ? (y > 4 ? HIDE_L : HIDE) : HIDE_D);
  }
  for (const dz of [-1, 0, 1]) line(b, 0, 4, c + dz, 15, 9, c + dz, 0, (x, y, z, t) => (t > 0.97 ? POLE_D : (dz + 2) % 2 ? POLE : POLE_D)); // lodge poles bundled on top
  b.box(5, 6, c - 1, 5, 6, c + 1, TEAM_D); // their lashing
  walker(b, 15, 9, { band: true });
  line(b, 18, 4, 10, m.x1 + 3, m.nt - 1, c + 1, 0, () => LEATHER); // the lead rope
  return { body: b, bodyPivot: [13, 0, 6.5] };
}

// Buffalo Hunters (harvester): a hunter on a pony leading a pack horse with painted parfleches, its travois heaped
// with folded hides and meat under a robe painted in the side's colour.
export function buffaloHunters(): ModelDef {
  const b = new VB();
  const pack = horse(b, 6, 1, 0, BAY, true, 0.25);
  parfleches(b, pack);
  b.box(pack.rx - 2, pack.T + 3, pack.c - 1, pack.rx + 1, pack.T + 4, pack.c + 1, (x, y) => (y === pack.T + 3 ? 0x6a4a30 : 0x8a6440)); // a pack of hides on its back
  travois(b, pack, 0);
  const { c } = pack;
  for (let x = 1; x <= 8; x++) for (let z = c - 2; z <= c + 2; z++) { // the load: folded hides, fur side out, and cuts of meat
    const base = 1 + Math.round((x - 1) * 0.6), top = base + 1 + (hash3(x, 5, z) < 0.5 ? 1 : 0);
    for (let y = base; y <= top; y++) { const h = hash3(x, y, z); b.set(x, y, z, x >= 6 && y === top ? (h < 0.5 ? 0x9a3a2a : 0x7a2a20) : y === top ? (h < 0.5 ? 0x5a3c24 : 0x6e4a2c) : 0xc8b48a); }
  }
  for (let x = 1; x <= 5; x++) for (let z = c - 2; z <= c + 2; z++) b.set(x, 4 + Math.round((x - 1) * 0.6), z, z === c - 2 || z === c + 2 ? TEAM_D : (x + z) % 3 === 0 ? TEAM_L : TEAM); // a painted robe thrown over the hides
  const m = horse(b, 10, 8, 0, PAINT, true);
  rider(b, m, { feather: true });
  b.box(m.rx - 1, m.T + 3, m.c + 1, m.rx + 2, m.T + 6, m.c + 1, (x, y) => (x - (m.rx - 1) === m.T + 6 - y ? BOW : 0)); // a bow slung across the back
  line(b, m.rx + 1, m.T + 3, m.c - 2, pack.x1 + 4, pack.nt - 1, pack.c + 1, 0, () => LEATHER); // the lead rope
  return { body: b, bodyPivot: [13, 0, 6.5] };
}

// ---------------------------------------------------------------- the council camp (Field Command)
// A lodge: a tall cone of pale hide on its poles, the poles crossing out of the top, smoke flaps either side of the
// smoke hole, the door facing `door` (an angle), a painted band of stepped triangles round the foot, a band near the
// top and a motif between in the side's colour (0 discs, 1 stripes, 2 a row of diamonds)
function lodge(b: VB, cx: number, cz: number, R: number, H: number, door: number, style: number) {
  const r = (y: number) => 0.7 + (R - 0.7) * (1 - (y - 1) / (H - 1));
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const band = Math.round(H * 0.13), up0 = Math.round(H * 0.6), mid = Math.round(H * 0.36);
  tower(b, cx, cz, 1, H, r, (x, y, z, a) => {
    const da = wrap(a - door), u = a * R;
    if (Math.abs(da) < (R > 9 ? 0.2 : 0.32) && y <= H * 0.26) return Math.abs(da) > (R > 9 ? 0.13 : 0.2) ? TEAM_D : 0x2a2018; // the door, its painted frame
    const tooth = Math.abs((((u / 2.5) % 2) + 2) % 2 - 1);
    if (y === 1) return TEAM_D;
    if (y <= band + Math.round(tooth * 2)) return TEAM;
    if (y === up0 || y === up0 + 1) return TEAM_D;
    if (y > up0 + 1) return y > H - 3 ? 0x6a5a48 : y > H - 6 ? HIDE_D : HIDE;
    if (style === 0) { for (let k = 0; k < 4; k++) { const dk = wrap(a - door - Math.PI / 4 - (k * Math.PI) / 2) * r(y); const d = Math.hypot(dk, y - mid); if (d < R * 0.24) return d < R * 0.1 ? TEAM_L : TEAM; } }
    if (style === 1 && y > band + 2 && Math.floor((u + 40) / 2) % 4 === 0) return TEAM;
    if (style === 2 && Math.abs((((u / 5) % 1) + 1) % 1 - 0.5) * 5 + Math.abs(y - mid) < 2.2) return TEAM;
    return hash3(x, y, z) < 0.07 ? HIDE_D : HIDE;
  }, 1.4);
  for (const side of [-1, 1]) for (let y = Math.round(H * 0.66); y <= H - 2; y++) { const an = door + side * 0.45, rr = r(y) + 1; b.set(cx + Math.cos(an) * rr, y, cz + Math.sin(an) * rr, y > H - 4 ? TEAM : TEAM_D); } // smoke flaps
  const top = H + 3 + (R > 9 ? 3 : 0), spread = R * 0.22 + 1;
  for (let k = 0; k < 7; k++) { const an = k * 0.9 + 0.3; line(b, cx, H - 3, cz, cx + Math.cos(an) * spread, top, cz + Math.sin(an) * spread, 0, () => (k % 2 ? POLE : POLE_D)); } // the poles crossing out of the top
}
// A tripod of three poles with a painted shield hung on it, facing out
function shieldStand(b: VB, x: number, z: number) {
  for (const [dx, dz] of [[-2, -1], [2, -1], [0, 2]]) line(b, x + dx, 1, z + dz, x, 9, z, 0, () => POLE_D);
  shield(b, x, 6, z - 1, 2.6);
}
// A drying rack: two forked posts and a bar, strips of meat and a pale hide hung over it
function rack(b: VB, x: number, z: number) {
  for (const dx of [0, 9]) b.box(x + dx, 1, z, x + dx, 7, z, POLE_D);
  b.box(x, 7, z, x + 9, 7, z, POLE);
  for (let k = 1; k <= 8; k++) { const meat = k % 3 !== 0; b.box(x + k, meat ? 4 : 3, z, x + k, 6, z, meat ? (k % 2 ? 0x9a3a2a : 0x7a2a20) : HIDE); }
}
// A hide stretched on a square frame of poles, painted with a design in the side's colour
function hideFrame(b: VB, x: number, z: number) {
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const edge = i === 0 || i === 8 || j === 0 || j === 8, d = Math.abs(i - 4) + Math.abs(j - 4);
    if (edge) b.set(x + i, j + 2, z, POLE_D);
    else if (i > 1 && i < 7 && j > 1 && j < 7) b.set(x + i, j + 2, z, d <= 1 ? TEAM_L : d <= 3 ? TEAM : HIDE);
  }
  b.box(x, 1, z, x, 1, z, POLE_D); b.box(x + 8, 1, z, x + 8, 1, z, POLE_D);
}

// Council Camp (Field Command): a ring of painted lodges round a great council lodge, its door facing a fire ring of
// glowing coals with log seats; drying racks, painted hides and shields on stands between the lodges, and a tall pole
// flying a long banner in the side's colour over everything.
export function councilCamp(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => { // dry prairie grass, trampled to bare earth inside the ring
    const d = Math.hypot(x - 36, z - 38), h = hash3(x >> 1, 3, z >> 1);
    return d < 21 + h * 3 ? [0xa88a5e, 0x9a7e54, 0xb4966a][(hash3(x, 5, z) * 3) | 0] : [0xb4a066, 0xa8945a, 0xbeaa70][(h * 3) | 0];
  });
  lodge(b, 36, 33, 12, 34, Math.PI / 2, 0); // the council lodge
  const ring = [0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI];
  ring.forEach((off, i) => {
    const th = Math.PI / 2 + off, x = 36 + Math.cos(th) * 26.5, z = 37 + Math.sin(th) * 26.5;
    lodge(b, Math.round(x), Math.round(z), 6.5, 20 + (i % 2), Math.atan2(37 - z, 36 - x), i % 3);
  });
  // the fire ring before the council lodge: stones round glowing coals, a small flame, log seats round it
  const fx = 36, fz = 54;
  for (let x = fx - 4; x <= fx + 4; x++) for (let z = fz - 4; z <= fz + 4; z++) {
    const d = Math.hypot(x - fx, z - fz), h = hash3(x, 9, z);
    if (d <= 3.6 && d > 2.6) b.set(x, 1, z, h < 0.5 ? STONE : STONE_L);
    else if (d <= 2.6) b.set(x, 1, z, d < 1.2 ? FLAME : h < 0.45 ? FIRE : h < 0.8 ? EMBER : 0x3a2a20);
  }
  b.set(fx, 2, fz, FLAME); b.set(fx + 1, 2, fz, FIRE); b.set(fx, 3, fz, FIRE); b.set(fx - 1, 2, fz + 1, EMBER);
  for (const [x0, z0, x1, z1] of [[fx - 4, fz - 7, fx + 4, fz - 7], [fx - 8, fz - 3, fx - 8, fz + 4], [fx + 8, fz - 3, fx + 8, fz + 4]]) b.box(x0, 1, z0, x1, 1, z1, (x, y, z) => ((x + z) % 4 ? POLE_D : 0x5a4028));
  // the banner pole beside the fire: a long streamer in the side's colour, a border, diamonds, a fringe
  const px = 46, pz = 57;
  b.box(px - 1, 1, pz - 1, px + 1, 1, pz + 1, STONE);
  b.box(px, 1, pz, px, 58, pz, (x, y) => (y === 58 ? FLETCH : y > 55 ? POLE_D : POLE));
  b.box(px, 54, pz, px + 6, 54, pz, POLE_D);
  for (let x = px + 1; x <= px + 6; x++) for (let y = 30; y <= 53; y++) {
    const dia = Math.abs(x - (px + 3.5)) + Math.abs(((y - 30) % 6) - 3) < 2.1;
    b.set(x, y, pz, x === px + 1 || x === px + 6 || y === 53 ? TEAM_D : dia ? TEAM_L : TEAM);
  }
  for (let x = px + 1; x <= px + 6; x += 1) b.box(x, 26 + (x % 2), pz, x, 29, pz, (xx, y) => (y < 28 ? HIDE : TEAM_D)); // the fringe
  // between the lodges: racks, painted hides, shields on their stands, firewood
  rack(b, 15, 60); rack(b, 49, 9);
  hideFrame(b, 56, 64); hideFrame(b, 8, 12);
  shieldStand(b, 26, 52); shieldStand(b, 30, 57);
  for (let i = 0; i < 6; i++) b.box(58, 1 + (i >> 1), 40 + (i % 3) * 2 - (i >> 1), 63, 1 + (i >> 1), 40 + (i % 3) * 2 - (i >> 1), i % 2 ? POLE : POLE_D); // firewood
  return { body: b, bodyPivot: [36, 0, 36] };
}

export const NATION_UNITS: Record<string, () => ModelDef> = {
  // (walkers step in two frames; horses and buffalo in four)
  rifle: animate(archer, 2), rocket: animate(fireArcher, 2), grenadier: animate(shieldWarrior, 2),
  scout: animate(mountedArcher), tank: animate(lancers), juggernaut: animate(shieldRiders),
  artillery: animate(volleyArchers, 2), flak: animate(skyArchers, 2), colossus: animate(greatHerd),
  builder: animate(lodgeBuilders), harvester: animate(buffaloHunters), fieldCommand: councilCamp,
};
