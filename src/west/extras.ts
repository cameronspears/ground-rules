// WILD WEST: the frontier's extra life and traffic, new kinds with no army original: buffalo, coyotes, jackrabbits,
// stagecoaches and the steam train. Facing +X, pivot at the middle of the footprint on the ground.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from '../models';
import { hash3 } from '../hash';
import { animate, pose, swing, turn } from './pose';

const K = 0x1f2024, HOOF = 0x2a2420, IRON = 0x34373a, IRON_L = 0x5e6266, SOOT = 0x1c1c1e, BRASS = 0xc89a40, BRASS_D = 0x8a6a2a;
const WOOD = 0x7a5a38, WOOD_D = 0x5a4028, WOOD_L = 0x9a7650, GLASS = 0x2e3440, LAMP = 0xffe08a, GOLD = 0xd0a848;
const LEATHER = 0x4a3020, CANVAS = 0xd8ccae, CANVAS_D = 0xb0a486, SKIN = 0xc8946c, FELT = 0x5a4028, FELT_L = 0x76563a;
const LOG = 0x8a6a46, LOG_D = 0x6e5236, LOG_END = 0xd8bc8c;
const OCHRE = 0xd0a040, OCHRE_D = 0xa07828;

// ---------------------------------------------------------------- helpers
// A spoked wheel standing in the x-y plane at z0..z1, turning as the loop goes round (see-through between spokes)
function wheel(b: VB, cx: number, cy: number, z0: number, z1: number, r: number, spoke: number = WOOD, rim = IRON) {
  const n = Math.ceil(r);
  for (let x = Math.floor(cx - n); x <= Math.ceil(cx + n); x++) for (let y = Math.floor(cy - n); y <= Math.ceil(cy + n); y++) {
    const dx0 = x - cx, dy0 = y - cy, d = Math.hypot(dx0, dy0);
    if (d > r + 0.3) continue;
    const q = -turn() * (r > 2.6 ? Math.PI / 4 : Math.PI / 2), dx = dx0 * Math.cos(q) - dy0 * Math.sin(q), dy = dx0 * Math.sin(q) + dy0 * Math.cos(q);
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const c = d > r - 0.8 ? rim : d < 0.6 ? BRASS_D : ax < 0.6 || ay < 0.6 || (r > 2.6 && Math.abs(ax - ay) < 0.6) ? spoke : 0;
    if (c) for (let z = z0; z <= z1; z++) b.set(x, y, z, c);
  }
}
// A thin straight line of blocks (rods, reins, a shotgun)
function line(b: VB, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 1.5) || 1;
  for (let i = 0; i <= n; i++) { const t = i / n; b.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, c); }
}
// A round cylinder lying along x from x0 to x1, centred on (cy, cz)
function cylX(b: VB, x0: number, x1: number, cy: number, cz: number, r: number, col: (x: number, y: number, z: number) => number) {
  for (let x = x0; x <= x1; x++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
    if ((y - cy) ** 2 + (z - cz) ** 2 <= r * r) b.set(x, y, z, col(x, y, z));
}
// A round post standing up at (cx, cz) from y0 to y1, its radius by height
function post(b: VB, cx: number, cz: number, y0: number, y1: number, r: (y: number) => number, col: (y: number) => number) {
  for (let y = y0; y <= y1; y++) { const rr = r(y), n = Math.ceil(rr); for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) if (x * x + z * z <= rr * rr + 0.2) b.set(cx + x, y, cz + z, col(y)); }
}
// A coach horse at a walk: 8 long (tail at ox-1, head at ox+6), 2 wide, 8 high, facing +x
function steed(b: VB, ox: number, oz: number, coat: number[], ph = 0) {
  for (const [x, z, p] of [[0, 0, 0.5], [0, 1, 0], [4, 0, 0], [4, 1, 0.5]]) { const sw = swing(p + ph); b.set(ox + x + sw, 0, oz + z, HOOF); b.set(ox + x + sw, 1, oz + z, coat[1]); b.set(ox + x, 2, oz + z, coat[1]); }
  b.box(ox, 3, oz, ox + 4, 4, oz + 1, (x, y) => (y === 4 ? coat[2] : coat[0]));
  b.box(ox + 5, 4, oz, ox + 5, 6, oz + 1, (x, y) => (y === 4 ? LEATHER : coat[0])); // the neck, a collar at its foot
  b.box(ox + 6, 5, oz, ox + 6, 7, oz + 1, (x, y) => (y === 5 ? coat[1] : y === 7 ? coat[2] : coat[0])); // the head
  b.set(ox + 6, 8, oz, coat[1]); b.set(ox + 5, 7, oz + 1, 0x2a1e16); b.set(ox + 2, 5, oz, LEATHER); b.set(ox + 2, 5, oz + 1, LEATHER); // ear, mane, the harness pad
  b.box(ox - 1, 2, oz, ox - 1, 4, oz, 0x2a1e16); // tail
}

// ---------------------------------------------------------------- animals
// American bison: a huge shaggy hump and head (a lighter woolly cape over dark brown), small curved horns, slim hindquarters.
const BISON = 0x553620, BISON_D = 0x3a2616, WOOL = 0x8e6036, WOOL_L = 0xac7c48, HORN = 0x6a645c;
function buffalo(): ModelDef {
  const b = new VB();
  const wool = (x: number, y: number, z: number) => (hash3(x, y, z) < 0.25 ? WOOL_L : hash3(x >> 1, y, z) < 0.3 ? BISON : WOOL);
  for (const [x, z, ph] of [[2, 1, 0.5], [2, 3, 0], [8, 1, 0], [8, 3, 0.5]]) { const sw = swing(ph); b.set(x + sw, 0, z, HOOF); b.set(x + sw, 1, z, BISON_D); b.set(x, 2, z, BISON_D); } // at a walk
  b.box(1, 3, 1, 5, 4, 3, (x, y) => (y === 4 ? BISON : BISON_D)); b.box(1, 3, 1, 1, 3, 3, 0); // slim hindquarters
  const top = [6, 7, 7, 7, 6]; // the hump, highest over the shoulders
  for (let x = 5; x <= 9; x++) for (let y = 3; y <= top[x - 5]; y++) for (let z = 0; z <= 4; z++) {
    if ((z === 0 || z === 4) && (y === top[x - 5] || x === 5 || x === 9)) continue; // rounded off at the edges
    if (y === 3 && (z === 0 || z === 4) && hash3(x, 9, z) < 0.5) continue;
    b.set(x, y, z, wool(x, y, z));
  }
  for (const z of [0, 4]) for (const x of [6, 8]) b.set(x, 2, z, WOOL); // shaggy fringes hanging over the forelegs
  b.box(10, 2, 1, 11, 5, 3, (x, y) => (x === 11 && y <= 3 ? K : y >= 4 ? WOOL : BISON_D)); // the great low head, its dark muzzle
  b.box(10, 6, 1, 10, 6, 3, WOOL_L); b.set(10, 1, 2, BISON_D); b.set(11, 1, 2, BISON_D); // woolly brow, beard
  for (const z of [0, 4]) { b.set(10, 5, z, HORN); b.set(10, 6, z, 0xb8ae9c); } // small horns, out and up
  b.box(0, 4, 2, 0, 5, 2, BISON_D); b.set(0, 3, 2, K); // the tail and its tuft
  return { body: b, bodyPivot: [6, 0, 2] };
}
// A bison calf: smaller, reddish-tan, no hump to speak of yet
function buffaloCalf(): ModelDef {
  const b = new VB();
  const C = 0xa8743c, C_D = 0x8a5a2c, C_L = 0xbe8a50;
  for (const [x, z, ph] of [[1, 0, 0.5], [1, 2, 0], [4, 0, 0], [4, 2, 0.5]]) { const sw = swing(ph); b.set(x + sw, 0, z, HOOF); b.set(x, 1, z, C_D); }
  b.box(0, 2, 0, 5, 3, 2, (x, y) => (y === 3 ? C_L : C)); b.box(3, 4, 1, 5, 4, 1, C_L); // body, a small hump
  b.box(6, 2, 0, 6, 4, 2, (x, y, z) => (z !== 1 && y !== 4 ? 0 : y === 2 ? C_D : C)); b.set(6, 4, 0, C_D); b.set(6, 4, 2, C_D); // head, ears
  b.set(0, 3, 1, C_D); b.set(0, 2, 1, K); // tail
  return { body: b, bodyPivot: [3.5, 0, 1.5] };
}
// Coyote: lean grey-tan, pale throat and belly, tall pointed ears, a bushy dark-tipped tail held low. At a trot.
function coyote(): ModelDef {
  const b = new VB();
  const G = 0xb4946a, G_D = 0x8a6e4c, G_L = 0xd4bc94, BELLY = 0xe0d4bc;
  for (const [x, z, ph] of [[1, 0, 0.5], [1, 1, 0], [4, 0, 0], [4, 1, 0.5]]) { const sw = swing(ph); b.set(x + sw, 0, z, G_D); b.set(x, 1, z, G_D); } // diagonal pairs together
  b.box(1, 2, 0, 4, 3, 1, (x, y) => (y === 2 ? BELLY : x === 3 ? G_D : G)); // the body, a darker saddle
  b.box(5, 3, 0, 5, 4, 1, (x, y) => (y === 3 ? BELLY : G)); b.box(6, 3, 0, 6, 3, 1, (x, y, z) => (z === 0 ? G_L : G)); b.set(7, 3, 0, K); // head, muzzle, nose
  b.set(5, 5, 0, G_D); b.set(5, 5, 1, G_D); // pointed ears
  b.box(0, 2, 0, 0, 3, 1, (x, y) => (y === 3 ? G : G_L)); b.set(0, 1, 0, K); // the bushy tail, its black tip
  return { body: b, bodyPivot: [3.5, 0, 1] };
}
// Jackrabbit: pale grey-brown, a white belly, enormous black-tipped ears. Hopping: crouched, then stretched out in the air.
function jackrabbit(): ModelDef {
  const b = new VB();
  const H = 0xccae7c, H_D = 0xa08458, BELLY = 0xf0e8d8, EAR_IN = 0xe0c098;
  const air = pose.t < 0 ? 0 : swing(0) > 0 ? 1 : 0, land = swing(0) < 0; // up and stretched; landing, front paws down first
  if (air) {
    b.box(1, 1, 0, 3, 2, 1, (x, y) => (y === 1 ? BELLY : H)); b.set(0, 1, 0, H_D); b.set(0, 1, 1, H_D); // stretched out, hind feet trailing
    b.box(4, 2, 0, 4, 3, 1, H); b.set(5, 1, 0, H_D); // head reaching, front paws forward
    for (const z of [0, 1]) { b.set(3, 4, z, z ? EAR_IN : H); b.set(2, 5, z, K); } // ears laid back
  } else {
    b.box(1, 0, 0, 3, 1, 1, (x, y) => (y === 0 && x > 1 ? BELLY : H)); b.box(1, 0, 0, 1, 0, 1, H_D); b.set(1, 2, 0, H); b.set(1, 2, 1, H); // crouched, big hind feet
    b.box(4, land ? 1 : 2, 0, 4, land ? 2 : 3, 1, H); b.set(4, 0, 0, H_D); // head, front paws
    for (const z of [0, 1]) { b.box(3, land ? 3 : 4, z, 3, land ? 4 : 5, z, z ? EAR_IN : H); b.set(3, land ? 5 : 6, z, K); } // the long ears, upright
  }
  b.set(0, air ? 2 : 1, 0, BELLY); // the white scut
  return { body: b, bodyPivot: [2.5, 0, 1] };
}

// ---------------------------------------------------------------- traffic
// Concord stagecoach: the rounded body in the paint colour, a dark belly, windows, luggage strapped on the roof,
// driver and shotgun guard up top, a big rear wheel and a smaller front one, four horses in two pairs.
function stagecoach(): ModelDef {
  const b = new VB();
  for (const z of [0, 7]) { wheel(b, 3, 3, z, z, 3, OCHRE, 0x2a2420); wheel(b, 9, 2.4, z, z, 2.4, OCHRE, 0x2a2420); } // yellow running gear
  b.box(3, 3, 1, 3, 3, 6, IRON); b.box(9, 2, 1, 9, 2, 6, IRON); b.box(3, 2, 3, 9, 2, 4, OCHRE_D); // axles, the perch between
  const bot = [6, 5, 4, 4, 4, 4, 5, 6]; // the body's egg-shaped bottom, x 2..9
  for (let x = 2; x <= 9; x++) for (let y = bot[x - 2]; y <= 9; y++) for (let z = 1; z <= 6; z++) {
    const side = z === 1 || z === 6, end = x === 2 || x === 9;
    if (!side && !end && y < 9) continue;
    const win = side && y >= 7 && y <= 8 && (x === 3 || x === 4 || x === 7 || x === 8);
    b.set(x, y, z, win ? GLASS : y === 9 ? TEAM_L : y <= bot[x - 2] + 1 ? TEAM_D : y === 6 ? GOLD : TEAM);
  }
  for (const z of [1, 6]) { b.box(5, 5, z, 6, 8, z, (x, y) => (y === 8 ? GLASS : x === 5 ? TEAM_D : TEAM)); b.set(6, 6, z, GOLD); } // the door with its window and handle
  b.box(1, 10, 1, 10, 10, 6, (x, y, z) => (z === 1 || z === 6 || x === 1 || x === 10 ? TEAM_L : TEAM_D)); // roof
  for (const z of [1, 6]) for (let x = 2; x <= 9; x += 7) b.set(x, 11, z, IRON_L); line(b, 2, 11, 1, 9, 11, 1, IRON_L); line(b, 2, 11, 6, 9, 11, 6, IRON_L); // the roof rail
  b.box(3, 11, 2, 5, 12, 5, (x, y) => (y === 12 ? 0x6a4a2e : LEATHER)); b.box(6, 11, 2, 8, 11, 5, (x, y, z) => ((x + z) % 2 ? CANVAS : CANVAS_D)); // a trunk, a canvas bundle
  for (const x of [4, 7]) b.box(x, 11, 2, x, x === 4 ? 13 : 12, 5, (xx, y, z) => (y === (x === 4 ? 13 : 12) || z === 2 || z === 5 ? 0x2a1e16 : 0)); // straps over the luggage
  b.box(0, 5, 2, 1, 7, 5, (x, y) => (y === 7 ? 0x6a4a2e : LEATHER)); // the leather rear boot
  b.box(10, 5, 2, 10, 8, 5, LEATHER); b.box(10, 9, 1, 10, 9, 6, WOOD); b.box(11, 7, 1, 11, 7, 6, WOOD_D); // front boot, the seat, footboard
  // the driver (duster, reins in hand) and the guard (shotgun up)
  for (const [z, coat] of [[2, 0x8a7a5a], [5, 0x3e4458]] as [number, number][]) {
    b.set(11, 8, z, 0x3a3226); b.box(10, 10, z, 10, 11, z, coat); b.set(10, 12, z, SKIN); b.box(9, 13, z - 1, 11, 13, z + 1, FELT); b.set(10, 14, z, FELT_L);
  }
  b.set(11, 10, 2, SKIN); line(b, 12, 10, 2, 25, 6, 2, 0x2a1e16); line(b, 12, 10, 2, 25, 6, 5, 0x2a1e16); // reins out to the leaders
  line(b, 10, 11, 6, 12, 14, 6, 0x3a3c3e); // the shotgun
  b.box(10, 3, 3, 24, 3, 4, WOOD_D); // the pole between the pairs
  steed(b, 12, 1, [0x6a3e20, 0x4e2c16, 0x845030]); steed(b, 12, 5, [0x7a4a28, 0x5a341c, 0x94603a], 0.5);
  steed(b, 19, 1, [0x8a8478, 0x6a645a, 0xa49e92], 0.25); steed(b, 19, 5, [0x3a2a20, 0x2a1e16, 0x544034], 0.75);
  return { body: b, bodyPivot: [13, 0, 3.5] };
}

// 1870s steam locomotive and tender: balloon stack, headlamp, cowcatcher, a dark boiler bound in brass, a cab and
// trim in the paint colour, two big driving wheels a side joined by side rods, a tender heaped with firewood.
function locomotive(): ModelDef {
  const b = new VB();
  // the tender
  for (const x of [3, 8]) { wheel(b, x, 1.8, 1, 1, 1.8, IRON_L); wheel(b, x, 1.8, 7, 7, 1.8, IRON_L); }
  b.box(0, 3, 1, 10, 3, 7, IRON);
  b.box(0, 4, 1, 10, 8, 7, (x, y, z) => (x > 0 && x < 10 && z > 1 && z < 7 ? 0 : y === 8 ? TEAM_L : y === 4 ? TEAM_D : y === 6 && (z === 1 || z === 7) && x > 1 && x < 9 ? GOLD : TEAM));
  for (let x = 1; x <= 9; x++) for (let z = 2; z <= 6; z++) b.set(x, 8, z, (z % 2 ? LOG : LOG_D)); // the wood stacked in
  for (let x = 1; x <= 9; x++) for (let z = 2; z <= 6; z++) if (hash3(x, 9, z) < 0.75) b.set(x, 9, z, x === 1 || x === 9 ? LOG_END : z % 2 ? LOG : LOG_D);
  for (let x = 2; x <= 8; x++) for (let z = 3; z <= 5; z++) if (hash3(x, 10, z) < 0.6) b.set(x, 10, z, (x + z) % 3 ? LOG : LOG_END);
  b.box(11, 3, 3, 11, 3, 5, IRON); // the coupling
  // frame and running board
  b.box(12, 4, 1, 38, 4, 7, IRON); b.box(19, 5, 0, 33, 5, 8, (x, y, z) => (z === 0 || z === 8 ? TEAM_D : IRON));
  // the cab
  b.box(12, 5, 1, 18, 12, 7, (x, y, z) => {
    if (x > 12 && x < 18 && z > 1 && z < 7) return 0;
    if (x === 12 && z > 2 && z < 6 && y > 5) return 0; // open at the back
    const win = (z === 1 || z === 7) && y >= 9 && y <= 10 && x >= 14 && x <= 16, fwin = x === 18 && y >= 9 && y <= 10 && (z === 2 || z === 6);
    return win || fwin ? GLASS : y === 5 ? TEAM_D : y === 8 ? GOLD : y === 12 ? TEAM_L : TEAM;
  });
  b.box(11, 13, 0, 19, 13, 8, (x, y, z) => (z === 0 || z === 8 ? K : 0x3a3430)); b.box(12, 14, 1, 18, 14, 7, (x, y, z) => (z === 1 || z === 7 ? 0x3a3430 : 0x4a4440)); // arched roof
  // the boiler, bound in brass
  cylX(b, 19, 32, 8.5, 4, 3.4, (x, y) => ((x - 19) % 4 === 2 ? BRASS : y < 8 ? 0x46525a : 0x5e6c74));
  post(b, 26, 4, 11, 13, (y) => (y === 13 ? 1.2 : 1.6), (y) => (y === 13 ? 0xe0b858 : BRASS)); // the steam dome
  post(b, 22, 4, 11, 12, () => 1.2, (y) => (y === 12 ? 0x6e7c84 : 0x5e6c74)); b.set(20, 12, 4, BRASS); b.set(20, 13, 4, BRASS); // sand dome, whistle
  // the smokebox, the balloon stack, the headlamp
  cylX(b, 33, 37, 8.5, 4, 3.4, (x, y, z) => (x === 37 && Math.hypot(y - 8.5, z - 4) < 1.4 ? IRON_L : SOOT));
  post(b, 34, 4, 12, 15, (y) => [1, 1.6, 2.2, 2.8][y - 12], (y) => (y === 15 ? 0x4a4a4c : SOOT)); post(b, 34, 4, 15, 15, () => 1.8, () => K); // the balloon stack, wide at the top, black inside
  b.box(36, 12, 3, 37, 13, 5, (x, y) => (y === 13 ? BRASS_D : BRASS)); b.box(38, 12, 3, 38, 13, 5, (x, y, z) => (z === 4 || y === 12 ? LAMP : BRASS)); b.set(36, 14, 4, 0x2a2a2c); // the lamp
  // cylinders and the pilot beam, the cowcatcher
  for (const z of [0, 8]) cylX(b, 32, 35, 3.5, z, 1.3, (x) => (x === 32 || x === 35 ? BRASS : IRON));
  b.box(38, 3, 0, 38, 4, 8, TEAM); b.set(38, 4, 4, GOLD);
  for (let x = 39; x <= 41; x++) { const h = 41 - x + 1, w = 41 - x + 1; for (let y = 0; y <= h; y++) for (let z = 4 - w - 1; z <= 4 + w + 1; z++) if (Math.abs(z - 4) <= w + (y === 0 ? 1 : 0) && (z % 2 === 0 || y === h)) b.set(x, y, z, z % 2 ? IRON_L : IRON); }
  b.box(38, 0, 1, 38, 2, 7, (x, y, z) => (z % 2 ? IRON_L : IRON));
  // wheels: a small leading truck, the two big drivers a side with their rods
  wheel(b, 36, 1.5, 1, 1, 1.5, IRON_L); wheel(b, 36, 1.5, 7, 7, 1.5, IRON_L);
  for (const x of [21, 28]) { wheel(b, x, 3.2, 1, 1, 3.2, TEAM, IRON); wheel(b, x, 3.2, 7, 7, 3.2, TEAM, IRON); }
  const q = turn() * Math.PI * 2, px = Math.round(1.6 * Math.cos(q)), py = Math.round(1.6 * Math.sin(q));
  for (const z of [0, 8]) {
    line(b, 21 + px, 3 + py, z, 28 + px, 3 + py, z, IRON_L); // the side rod
    const xh = 31 + px; line(b, xh, 3.5, z, 28 + px, 3 + py, z, IRON_L); line(b, xh, 3.5, z, 32, 3.5, z, 0x8a8e92); // main rod, piston rod
    b.set(21 + px, 3 + py, z, BRASS); b.set(28 + px, 3 + py, z, BRASS);
  }
  return { body: b, bodyPivot: [20.5, 0, 4] };
}

// A truck under a railway car: two small iron wheels a side on a frame, at x cx-2 and cx+2
function bogie(b: VB, cx: number) {
  for (const x of [cx - 2, cx + 2]) for (const z of [1, 7]) wheel(b, x, 1.5, z, z, 1.5, IRON_L, IRON);
  for (const z of [1, 7]) b.box(cx - 3, 2, z, cx + 3, 3, z, (x, y) => (y === 3 || x === cx ? IRON : 0)); b.box(cx - 1, 3, 2, cx + 1, 3, 6, IRON);
}
// Passenger car: a varnished wooden car in the paint colour, a row of windows, a curved roof, open platforms at both ends
function railcar(): ModelDef {
  const b = new VB();
  bogie(b, 6); bogie(b, 25);
  b.box(0, 4, 1, 31, 4, 7, (x) => (x <= 2 || x >= 29 ? WOOD : IRON)); // floor, the platforms
  for (const x of [0, 31]) { b.box(x, 5, 1, x, 7, 7, (xx, y, z) => (y === 7 || z === 1 || z === 7 ? IRON_L : 0)); b.box(x, 2, 2, x, 3, 6, (xx, y, z) => (z === 2 || z === 6 ? IRON : 0)); b.box(x, 3, 3, x, 3, 5, 0); } // railings, steps
  b.box(3, 5, 1, 28, 10, 7, (x, y, z) => {
    if (x > 3 && x < 28 && z > 1 && z < 7) return 0;
    if (x === 3 || x === 28) return z >= 3 && z <= 5 && y <= 8 ? (y >= 7 && z === 4 ? GLASS : WOOD_D) : TEAM_D; // end doors
    if (y >= 7 && y <= 8 && x >= 5 && x <= 26 && (x - 5) % 3 !== 2) return GLASS;
    return y === 10 ? 0xd8c890 : y <= 5 ? TEAM_D : y === 6 ? GOLD : TEAM;
  });
  b.box(2, 11, 0, 29, 11, 8, (x, y, z) => (z === 0 || z === 8 || x === 2 || x === 29 ? K : 0x3a3430)); // the roof, curving over
  b.box(3, 12, 2, 28, 12, 6, (x, y, z) => (z === 2 || z === 6 ? 0x3a3430 : 0x4a4440));
  b.set(4, 13, 4, IRON); // the stove pipe
  return { body: b, bodyPivot: [15.5, 0, 4] };
}
// Boxcar: upright boards in the paint colour, a big sliding door each side, a catwalk on the roof, a brake wheel, ladders
function boxcar(): ModelDef {
  const b = new VB();
  bogie(b, 6); bogie(b, 25);
  b.box(0, 4, 1, 31, 4, 7, IRON);
  b.box(1, 5, 1, 30, 11, 7, (x, y, z) => {
    if (x > 1 && x < 30 && z > 1 && z < 7) return 0;
    if (y === 5 || y === 11) return TEAM_D;
    return (x + z) % 3 === 0 ? TEAM_D : hash3(x, y >> 2, z) < 0.2 ? TEAM_L : TEAM;
  });
  for (const z of [0, 8]) { b.box(13, 5, z, 18, 10, z, (x, y) => (x === 13 || x === 18 || y === 10 || y === 5 ? IRON : x - 13 === y - 5 || 18 - x === y - 5 ? WOOD_L : TEAM_D)); b.box(11, 11, z, 20, 11, z, IRON); b.set(17, 7, z, IRON_L); } // the doors on their rails
  b.box(1, 12, 1, 30, 12, 7, (x, y, z) => (z === 1 || z === 7 ? 0x4a3430 : 0x5a4038)); b.box(1, 13, 4, 30, 13, 4, WOOD_L); // roof, catwalk
  for (const z of [3, 4, 5]) b.set(1, 14, z, IRON); b.set(1, 13, 4, IRON); // brake wheel
  for (const x of [0, 31]) for (let y = 6; y <= 11; y += 2) b.set(x, y, 6, IRON_L); // ladder rungs
  return { body: b, bodyPivot: [15.5, 0, 4] };
}

// Tumbleweed: a loose ball of dry tangled twigs, gaps right through it, turning over as it rolls along +x
function tumbleweed(): ModelDef {
  const b = new VB();
  const c = 2.5, a = -turn() * Math.PI * 2, co = Math.round(Math.cos(a)), si = Math.round(Math.sin(a)); // whole quarter turns
  for (let x = 0; x <= 5; x++) for (let y = 0; y <= 5; y++) for (let z = 0; z <= 4; z++) {
    const dx = x - c, dy = y - c, dz = z - 2, d = Math.hypot(dx, dy, dz * 1.15);
    if (d > 2.9) continue;
    const sx = Math.round((dx * co + dy * si) * 2), sy = Math.round((-dx * si + dy * co) * 2), h = hash3(sx + 40, sy + 40, z); // the tangle, turned
    const keep = d > 1.9 ? h < 0.55 : h < 0.2;
    if (keep) b.set(x, y, z, h < 0.12 ? 0x9a7c50 : h < 0.32 ? 0xc8a870 : (h * 100) % 2 < 1 ? 0xecd49c : 0xdcbe84);
  }
  return { body: b, bodyPivot: [2.5, 0, 2] };
}

export const EXTRAS: Record<string, () => ModelDef> = {
  buffalo: animate(buffalo), buffaloCalf: animate(buffaloCalf), coyote: animate(coyote), jackrabbit: animate(jackrabbit),
  stagecoach: animate(stagecoach), locomotive: animate(locomotive), railcar: animate(railcar), boxcar: animate(boxcar),
  tumbleweed: animate(tumbleweed),
};
