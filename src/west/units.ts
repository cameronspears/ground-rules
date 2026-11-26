// WILD WEST: the units' frontier looks. Each stands in for the ART model of the same key (see index.ts), at about
// the same size and pivot, so it fits the game's rules and drawing unchanged. Facing +X like every model.
import { VB, TEAM, TEAM_D, TEAM_L, ModelDef } from '../models';
import { hash3 } from '../hash';
import { tower, crates } from '../art';
import { animate, swing, turn } from './pose';

const SKIN = 0xc8946c, BOOT = 0x2a2622, STOCK = 0x5a4630, GUN = 0x4a4d50;
// A walker's two legs (boots and trousers, at x 1, z 0 and 2), one forward as the other goes back
export function legs(b: VB, trousers: number) { for (const [z, ph] of [[0, 0.25], [2, 0.75]]) { const x = 1 + swing(ph); b.set(x, 0, z, BOOT); b.box(x, 1, z, x, 1, z, trousers); b.set(1, 2, z, trousers); } }
// Gunslinger (the Wild West's rifleman): a wide-brimmed hat, denim, a rifle at the hip.
const DENIM = 0x3e4a62, FELT = 0x5a4028, FELT_L = 0x76563a;
export function gunslinger(): ModelDef {
  const b = new VB();
  legs(b, DENIM);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, 0x3a2a1c); b.set(2, 3, 1, 0xc8a040); // shirt in the side's colour, a belt and buckle
  b.box(1, 6, 0, 2, 6, 2, SKIN); b.set(2, 6, 1, TEAM_D); // a bandana at the neck
  b.box(0, 7, 0, 3, 7, 2, FELT); b.box(1, 8, 0, 2, 8, 2, FELT_L); // the hat: a wide brim, the crown on top
  b.box(2, 4, 3, 5, 4, 3, STOCK); b.set(5, 4, 3, GUN); b.set(3, 5, 3, SKIN); // a lever rifle and the hand on it
  return { body: b, bodyPivot: [1.5, 0, 1.5] };
}

// Horseman (the Wild West's scout): a bay horse at the gallop, a rider in the side's colours on a team blanket.
const BAY = 0x7a4a28, BAY_D = 0x5a341c, BAY_L = 0x94603a, MANE = 0x2a1e16;
export function horseman(): ModelDef {
  const b = new VB();
  for (const [x, z, ph] of [[3, 1, 0.5], [3, 3, 0], [10, 1, 0], [10, 3, 0.5]]) { // legs and hooves, at a trot (each diagonal pair together): reaching forward with the hoof lifted, or pushing off behind
    const s = swing(ph);
    if (s > 0) { b.set(x + 2, 1, z, MANE); b.set(x + 1, 2, z, BAY_D); b.set(x, 3, z, BAY_D); }
    else if (s < 0) { b.set(x - 2, 0, z, MANE); b.set(x - 1, 1, z, BAY_D); b.box(x - 1, 2, z, x, 3, z, BAY_D); }
    else { b.set(x, 0, z, MANE); b.box(x, 1, z, x, 3, z, BAY_D); }
  }
  b.box(2, 4, 1, 11, 7, 3, (x, y) => (y === 7 ? BAY_L : y === 4 ? BAY_D : BAY)); // the barrel of the body
  b.box(11, 7, 1, 12, 10, 3, (x, y) => (y === 10 ? BAY_L : BAY)); b.box(10, 8, 2, 11, 11, 2, MANE); // neck, mane
  b.box(13, 9, 1, 15, 11, 3, (x, y) => (x === 15 ? BAY_D : y === 11 ? BAY_L : BAY)); b.set(15, 9, 2, MANE); b.set(13, 12, 1, BAY_D); b.set(13, 12, 3, BAY_D); // head, muzzle, ears
  b.box(0, 5, 2, 1, 7, 2, MANE); b.set(0, 4, 2, MANE); // tail
  b.box(5, 6, 0, 8, 8, 4, (x, y, z) => (z === 0 || z === 4 ? (y === 6 ? TEAM_D : TEAM) : y === 8 ? 0x4a3020 : 0)); // the side's blanket under a saddle
  // the rider: legs down the horse's sides, shirt in the side's colours, the hat
  b.box(6, 6, 0, 6, 8, 0, DENIM); b.box(6, 6, 4, 6, 8, 4, DENIM); b.set(7, 5, 0, BOOT); b.set(7, 5, 4, BOOT);
  b.box(6, 9, 1, 7, 11, 3, TEAM); b.box(6, 9, 1, 7, 9, 3, 0x3a2a1c);
  b.box(6, 12, 1, 7, 12, 3, SKIN); b.box(5, 13, 0, 8, 13, 4, FELT); b.box(6, 14, 1, 7, 14, 3, FELT_L);
  b.box(8, 10, 0, 12, 10, 0, STOCK); b.set(12, 10, 0, GUN); // a rifle carried forward
  return { body: b, bodyPivot: [7.5, 0, 2] };
}

// ---------------------------------------------------------------- the frontier's kit
// Seasoned wood, black iron, brass fittings, sun-bleached canvas, red dynamite.
const WOOD = 0x7a5a38, WOOD_D = 0x5a4028, WOOD_L = 0x9a7650, IRON = 0x3a3c3e, IRON_L = 0x5e6266, SOOT = 0x1e1e20;
const BRASS = 0xc09440, BRASS_D = 0x8a6a2a, BRONZE = 0xa8783a, BRONZE_L = 0xc8984e, BRONZE_D = 0x7a5428;
const CANVAS = 0xd8ccae, CANVAS_D = 0xb0a486, CANVAS_L = 0xeae0c6, DYN = 0xb8342a, DYN_D = 0x8a2420, FUSE = 0xffd040;
const BUCK = 0x9a7a50, BUCK_L = 0xb8966a, LEATHER = 0x4a3020, GLOW = 0xffc860;
const LAMP = 0xffe08a, GLASS = 0x2a3a58, GLASS_L = 0x6a8ab8;
const MULE = 0x8e7c66, MULE_D = 0x6a5a4a, MULE_L = 0xa89680;

// A cartwheel standing in the x–y plane at z0..z1: an iron tyre, wooden spokes (see-through between), an iron hub
function wheel(b: VB, cx: number, cy: number, z0: number, z1: number, r: number, spoke = WOOD) {
  const n = Math.ceil(r);
  for (let x = cx - n; x <= cx + n; x++) for (let y = cy - n; y <= cy + n; y++) {
    const dx0 = x - cx, dy0 = y - cy, d = Math.hypot(dx0, dy0);
    if (d > r + 0.3) continue;
    const q = -turn() * (r > 3.5 ? Math.PI / 4 : Math.PI / 2), dx = dx0 * Math.cos(q) - dy0 * Math.sin(q), dy = dx0 * Math.sin(q) + dy0 * Math.cos(q); // (rolling: the spokes a little further round each frame)
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const c = d > r - 0.8 ? (dy0 > 0 ? IRON_L : IRON) : d < 1.2 ? (d < 0.5 ? BRASS_D : IRON) : ax < 0.6 || ay < 0.6 || (r > 3.5 && Math.abs(ax - ay) < 0.6) ? spoke : 0;
    if (c) for (let z = z0; z <= z1; z++) b.set(x, y, z, c);
  }
}
// A thick line of blocks from one point to another (struts, legs, rigging)
function line(b: VB, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, col: (x: number, y: number, z: number, t: number) => number) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 1.5) || 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t);
    for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) for (let e = -r; e <= r; e++) b.set(x + a, y + c, z + e, col(x + a, y + c, z + e, t));
  }
}
// A hollow egg (balloons, boilers): rx, ry, rz half-sizes round a centre, coloured by position
function egg(b: VB, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, col: (x: number, y: number, z: number) => number) {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
    const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
    const w = ((x - cx) / (rx - 1.4)) ** 2 + ((y - cy) / (ry - 1.4)) ** 2 + ((z - cz) / (rz - 1.4)) ** 2;
    if (v <= 1 && w > 1) b.set(x, y, z, col(x, y, z));
  }
}
// Envelope gores: long panels round the balloon, the side's colour and canvas in turn, lit on top
const gore = (cy: number, cz: number, ry: number) => (x: number, y: number, z: number) => {
  const a = Math.atan2(z - cz, y - cy), team = Math.floor((a + Math.PI) / (Math.PI / 4) + 0.5) % 2 === 0, up = (y - cy) / ry;
  return team ? (up > 0.55 ? TEAM_L : up < -0.4 ? TEAM_D : TEAM) : up > 0.55 ? CANVAS_L : up < -0.4 ? CANVAS_D : CANVAS;
};
// A mule (or with short ears, a horse) facing +x, x..x+9 long, z..z+2 wide, in the side's collar and blanket
function mule(b: VB, x: number, z: number, horse = false) {
  const C = horse ? 0x6a4226 : MULE, D = horse ? 0x4a2c18 : MULE_D, L = horse ? 0x8a5a36 : MULE_L;
  for (const [dx, dz, ph] of [[1, 0, 0.5], [1, 2, 0], [6, 0, 0], [6, 2, 0.5]]) { const s = swing(ph); b.set(x + dx + s, 0, z + dz, SOOT); b.set(x + dx + s, 1, z + dz, D); b.set(x + dx, 2, z + dz, D); } // legs, at a walk
  b.box(x, 3, z, x + 7, 5, z + 2, (xx, y) => (y === 5 ? L : y === 3 ? D : C)); // barrel
  b.box(x + 7, 5, z, x + 8, 7, z + 2, (xx, y) => (y === 7 ? L : C)); // neck
  b.box(x + 8, 6, z, x + 9, 8, z + 2, (xx, y) => (xx === x + 9 && y === 6 ? (horse ? D : 0xb0a08a) : y === 8 ? L : C)); // head, pale muzzle
  b.set(x + 8, 9, z, D); b.set(x + 8, 9, z + 2, D); if (!horse) { b.set(x + 8, 10, z, D); b.set(x + 8, 10, z + 2, D); } // ears (a mule's are long)
  b.box(x + 7, 8, z + 1, x + 7, 8, z + 1, SOOT); b.box(x - 1, 2, z + 1, x - 1, 4, z + 1, SOOT); // mane tuft, tail
  b.box(x + 6, 5, z, x + 6, 7, z + 2, TEAM); b.box(x + 6, 7, z, x + 6, 7, z + 2, BRASS_D); // collar, in the side's colour, brass hames on top
  b.box(x + 2, 6, z, x + 5, 6, z + 2, (xx, y, zz) => (zz === z + 1 ? LEATHER : TEAM_D)); // a team saddle-pad under the harness
}
// A seated driver or gunner, 2 wide, at (x, y, z): legs forward, shirt in the side's colour, a hat
function sitter(b: VB, x: number, y: number, z: number, hat = FELT, crown = FELT_L) {
  b.box(x + 1, y, z, x + 2, y, z + 1, DENIM); b.set(x + 2, y - 1, z, BOOT); b.set(x + 2, y - 1, z + 1, BOOT);
  b.box(x, y + 1, z, x, y + 2, z + 1, TEAM); b.box(x, y + 1, z, x, y + 1, z + 1, TEAM_D);
  b.box(x, y + 3, z, x, y + 3, z + 1, SKIN);
  b.box(x - 1, y + 4, z - 1, x + 1, y + 4, z + 2, hat); b.box(x, y + 5, z, x, y + 5, z + 1, crown);
}
// A Gatling's six barrels round a dark centre, along x from x0 to x1, centred (cy, cz..cz+1), a brass band near the muzzle
function gatling(b: VB, x0: number, x1: number, cy: number, cz: number) {
  for (let x = x0; x <= x1; x++) {
    const band = x === x1 - 3;
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 2; dz++) {
      const edge = dy !== 0 ? dz === 0 || dz === 1 : dz === -1 || dz === 2;
      if (band) { if (!(dy && (dz === -1 || dz === 2))) b.set(x, cy + dy, cz + dz, BRASS); continue; }
      if (edge) b.set(x, cy + dy, cz + dz, x === x1 ? SOOT : dy === 1 ? IRON_L : IRON);
      else if (dy === 0) b.set(x, cy, cz + dz, x === x1 ? SOOT : IRON);
    }
  }
}

// Buffalo Gunner (the rocket soldier's job, armour and aircraft): a frontiersman in buckskin with a very
// long, heavy buffalo rifle at the shoulder, a brass scope along its barrel, a cartridge belt across his chest.
export function buffaloGunner(): ModelDef {
  const b = new VB();
  legs(b, BUCK);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, BUCK); // coat in the side's colour over buckskin
  b.set(2, 5, 0, BRASS); b.set(2, 4, 1, BRASS); b.set(2, 3, 2, BRASS); // cartridge belt slung across
  b.box(0, 3, 0, 0, 4, 1, BUCK_L); // possibles bag at the back
  b.box(1, 6, 0, 2, 6, 2, SKIN); b.set(2, 6, 1, 0x6a4a30); // face, a beard
  b.box(0, 7, 0, 3, 7, 2, BUCK); b.box(1, 8, 0, 2, 8, 2, BUCK_L); b.set(1, 8, 2, TEAM_D); // a flat-crowned hat, a feather in the side's colour
  b.box(0, 5, 3, 1, 5, 3, STOCK); b.box(2, 5, 3, 9, 5, 3, (x) => (x === 9 ? SOOT : GUN)); // the long heavy rifle at the shoulder
  b.box(3, 6, 3, 6, 6, 3, BRASS_D); b.set(7, 6, 3, BRASS); // its scope
  b.set(2, 4, 3, SKIN); b.set(5, 4, 3, SKIN); // the hands under it
  return { body: b, bodyPivot: [1.5, 0, 1] };
}

// Dynamiter (the grenadier's job): a miner in a soft cap and braces, a bundle of red sticks on his back and
// one lit stick held high, its fuse fizzing.
export function dynamiter(): ModelDef {
  const b = new VB();
  legs(b, 0x5a4a38); // canvas work trousers
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.set(2, 4, 0, LEATHER); b.set(2, 4, 2, LEATHER); b.set(2, 5, 0, LEATHER); b.set(2, 5, 2, LEATHER); // shirt in the side's colour, braces
  b.box(0, 4, 0, 0, 5, 1, (x, y, z) => (z === 1 && y === 4 ? LEATHER : y === 5 ? DYN : DYN_D)); b.box(0, 3, 2, 0, 4, 2, 0x8a7a58); // a small bundle of sticks on the back, a canvas bag
  b.box(1, 6, 0, 2, 6, 2, SKIN); b.set(2, 6, 1, TEAM_D); // bandana
  b.box(1, 7, 0, 2, 7, 2, 0x6a5a46); b.set(3, 7, 1, 0x5a4a38); b.set(2, 8, 1, LAMP_OFF); // a miner's soft cap, its bill, a candle-lamp
  b.box(1, 5, 3, 1, 7, 3, SKIN); b.set(1, 8, 3, DYN); b.set(1, 9, 3, FUSE); // the arm up, a lit stick, the spark
  return { body: b, bodyPivot: [1.5, 0, 1] };
}
const LAMP_OFF = 0xd0b060;

// War Wagon (the tank's job): an iron-plated steam wagon in the side's colours on big spoked wheels, a cowcatcher
// at the front and a little smokestack at the back; on top, a Gatling gun behind a plate shield, its gunner in the seat.
export function warWagon(): ModelDef {
  const b = new VB();
  wheel(b, 6, 4, 0, 1, 4.2); wheel(b, 6, 4, 12, 13, 4.2); wheel(b, 19, 3, 0, 1, 3.2); wheel(b, 19, 3, 12, 13, 3.2); // big wheels behind, smaller in front
  b.box(6, 4, 2, 6, 4, 11, IRON); b.box(19, 3, 2, 19, 3, 11, IRON); // axles
  b.box(2, 2, 2, 21, 5, 11, (x, y, z) => {
    const side = z === 2 || z === 11 || x === 2 || x === 21;
    if (y === 5) return side ? TEAM_D : z % 2 ? WOOD : WOOD_D; // a plank deck inside an iron rim
    if (!side) return 0;
    if (y === 2) return IRON;
    return (y === 3 || y === 4) && x % 3 === 0 && (z === 2 || z === 11) ? IRON_L : TEAM; // riveted plates in the side's colour
  });
  b.box(22, 2, 3, 22, 4, 10, TEAM_D); b.box(22, 0, 3, 23, 1, 10, (x, y, z) => (x === 23 && y === 1 ? 0 : z % 2 ? IRON : IRON_L)); // nose plate, cowcatcher
  b.set(22, 5, 3, LAMP); b.set(22, 5, 10, LAMP); // lamps
  b.box(2, 6, 4, 4, 8, 9, (x, y, z) => (y === 7 ? BRASS : IRON)); // the boiler at the back, a brass band
  b.box(3, 9, 6, 3, 12, 7, IRON); b.box(2, 13, 5, 4, 13, 8, SOOT); // smokestack, flared top
  const t = new VB();
  t.box(1, 0, 1, 9, 0, 8, (x, y, z) => (x === 1 || x === 9 || z === 1 || z === 8 ? IRON : WOOD_D)); // a turntable
  t.box(4, 1, 3, 9, 4, 6, (x, y) => (y === 4 ? BRASS : BRASS_D)); t.box(7, 5, 4, 8, 7, 5, BRASS); // brass breech, the magazine standing on it
  t.set(5, 3, 7, IRON); t.set(5, 4, 8, IRON); t.set(5, 2, 8, IRON); // the crank
  gatling(t, 10, 22, 3, 4); // six barrels
  t.box(11, 1, 0, 11, 6, 9, (x, y, z) => (y === 6 ? TEAM_L : (y === 3 && (z === 3 || z === 6)) || (y === 2 || y === 4) && (z === 4 || z === 5) || (y === 3 && (z === 4 || z === 5)) ? 0 : (y + z) % 4 === 0 ? TEAM_D : TEAM)); // a plate shield in the side's colour, the barrels through it
  sitter(t, 2, 2, 4); t.box(1, 1, 3, 2, 1, 6, LEATHER); // the gunner on his seat
  return { body: b, bodyPivot: [11.5, 0, 6.5], turret: t, turretPivot: [6, 0, 4.5], turretAt: [11, 6, 6.5] };
}

// Ironclad (the juggernaut's job): a big riveted steam traction engine, huge cleated driving wheels behind,
// two tall stacks and a smokebox door up front, coal heaped behind; on top, an armoured casemate with a heavy cannon.
export function ironclad(): ModelDef {
  const b = new VB();
  wheel(b, 7, 5, 0, 2, 5.2, BRASS_D); wheel(b, 7, 5, 17, 19, 5.2, BRASS_D); // huge driving wheels
  for (const z of [0, 2, 17, 19]) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; if (k % 2) b.set(7 + Math.cos(a) * 5.7, 5 + Math.sin(a) * 5.7, z, IRON); } // cleats on the tyres
  wheel(b, 25, 3, 2, 3, 3.2); wheel(b, 25, 3, 16, 17, 3.2); // steering wheels
  b.box(7, 5, 3, 7, 5, 16, IRON); b.box(25, 3, 4, 25, 3, 15, IRON);
  b.box(2, 3, 4, 29, 8, 15, (x, y, z) => {
    const side = z === 4 || z === 15 || x === 2 || x === 29;
    if (y === 8) return side ? TEAM_D : (x + z) % 5 === 0 ? IRON : IRON_L; // a riveted iron deck
    if (!side) return 0;
    if (y === 3) return IRON;
    if ((y === 4 || y === 7) && x % 2 === 0) return IRON_L; // rivet rows
    return x % 7 === 0 ? TEAM_D : TEAM; // armour plates in the side's colour
  });
  b.box(30, 3, 6, 30, 8, 13, IRON); b.box(31, 4, 8, 31, 7, 11, (x, y, z) => (y === 4 || y === 7 || z === 8 || z === 11 ? BRASS_D : SOOT)); // smokebox and its round door
  b.set(31, 8, 9, LAMP); b.set(31, 8, 10, LAMP); // headlamp
  for (const z of [4, 14]) { b.box(26, 9, z, 27, 18, z + 1, (x, y) => (y === 12 || y === 16 ? BRASS : IRON)); b.box(25, 19, z - 1, 28, 19, z + 2, SOOT); } // two tall stacks
  b.box(1, 4, 5, 1, 9, 14, IRON); for (let x = 2; x <= 5; x++) for (let z = 6; z <= 13; z++) b.set(x, 9 + (hash3(x, 2, z) < 0.5 ? 1 : 0), z, hash3(x, 9, z) < 0.5 ? SOOT : 0x2e2e30); // coal heaped behind
  const t = new VB();
  t.box(0, 0, 1, 15, 5, 10, (x, y, z) => {
    const cx = x === 0 || x === 15, cz = z === 1 || z === 10;
    if (cx && cz) return 0; // chamfered corners
    if (y >= 5 && (cx || cz)) return 0; // the roof stepped in
    if (y === 5) return (x + z) % 4 === 0 ? IRON : TEAM_D;
    if ((y === 1 || y === 4) && (x + z) % 2 === 0) return IRON_L; // rivets
    return TEAM;
  });
  t.box(3, 6, 3, 5, 6, 5, IRON); for (let y = 6; y <= 10; y++) t.set(2, y, 8, IRON_L); t.box(3, 9, 8, 5, 10, 8, TEAM); // hatch, a pennant in the side's colour
  t.box(16, 0, 3, 17, 5, 8, IRON); // mantlet
  for (let x = 18; x <= 39; x++) { // a heavy iron gun: a thick reinforce at the breech, a swelling muzzle
    const r = x <= 22 ? 2.6 : x >= 36 ? 2.6 : 1.9;
    for (let y = 1; y <= 6; y++) for (let z = 3; z <= 8; z++) {
      const d = Math.hypot(y - 3.5, z - 5.5); if (d > r) continue;
      t.set(x, y - 1, z, x === 39 && d < 1.2 ? SOOT : y >= 5 ? IRON_L : x === 22 || x === 36 ? BRASS_D : IRON);
    }
  }
  return { body: b, bodyPivot: [15.5, 0, 9.5], turret: t, turretPivot: [7.5, 0, 5.5], turretAt: [14, 9, 9.5] };
}

// Field Cannon (artillery): a bronze cannon on a two-wheeled carriage painted in the side's colour, its trail on
// the ground behind, an ammunition limber parked in front; the long barrel raised high to lob shot.
export function fieldCannon(): ModelDef {
  const b = new VB();
  wheel(b, 12, 4, 0, 1, 4.2); wheel(b, 12, 4, 12, 13, 4.2); b.box(12, 4, 2, 12, 4, 11, IRON); // the gun's wheels and axle
  for (let x = 1; x <= 12; x++) { const y = Math.round((x - 1) * 0.3); b.box(x, y, 5, x, y + 1, 8, (xx, yy) => (yy === y ? TEAM_D : TEAM)); } // the trail, down to the ground
  b.box(0, 0, 5, 0, 1, 8, IRON); // the spade
  // the limber: an ammunition chest in the side's colour on two smaller wheels, its pole out front
  wheel(b, 21, 3, 1, 1, 3.2); wheel(b, 21, 3, 12, 12, 3.2); b.box(21, 3, 2, 21, 3, 11, IRON);
  b.box(18, 4, 3, 24, 7, 10, (x, y, z) => (y === 7 ? TEAM_D : (x === 18 || x === 24) && (z === 3 || z === 10) ? BRASS_D : y === 4 ? WOOD_D : TEAM));
  b.box(19, 7, 5, 23, 7, 8, (x) => (x % 2 ? TEAM_L : TEAM_D)); b.box(25, 2, 6, 25, 3, 7, WOOD_D); // lid stripes, the pole stub
  for (const [x, y, z] of [[3, 1, 1], [4, 1, 1], [3, 1, 2], [4, 1, 2], [3, 2, 1]]) b.set(x, y - 1 + (y === 2 ? 1 : 0), z, SOOT); // a little pile of shot
  const t = new VB();
  for (let x = 1; x <= 10; x++) { const top = Math.min(5, 1 + Math.round(x * 0.5)); for (const z of [1, 7]) t.box(x, 0, z, x, top, z, (xx, y) => (y === top ? TEAM_D : TEAM)); } // the carriage cheeks
  t.box(2, 0, 2, 9, 0, 6, WOOD_D); t.box(6, 5, 1, 8, 5, 7, IRON); // bed, trunnion caps
  t.box(2, 1, 4, 2, 2, 4, IRON); // elevating screw
  for (let x = 0; x <= 37; x++) { // the barrel: a cascabel knob, a thick breech tapering to the muzzle, rings, a swell at the mouth
    const y = 3 + Math.round(x * 0.27), thick = x <= 12 || x >= 35 || x === 22, r = x === 0 ? 0.5 : thick ? 1.5 : 1.1;
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (Math.hypot(dy, dz) > r) continue;
      t.set(x, y + dy, 4 + dz, x === 37 && !dy && !dz ? SOOT : x === 6 || x === 12 || x === 22 ? BRONZE_L : dy > 0 ? BRONZE_L : dy < 0 ? BRONZE_D : BRONZE);
    }
  }
  return { body: b, bodyPivot: [12.5, 0, 6.5], turret: t, turretPivot: [5, 0, 4], turretAt: [11, 6, 6.5] };
}

// Gatling Wagon (the flak truck's job): a team-painted wagon behind a pair of horses, the driver up front; on
// the bed, a Gatling on a tall pivot mount, its barrels cocked up at the sky.
export function gatlingWagon(): ModelDef {
  const b = new VB();
  wheel(b, 4, 3, 0, 0, 3.2); wheel(b, 4, 3, 13, 13, 3.2); wheel(b, 12, 3, 0, 0, 3.2); wheel(b, 12, 3, 13, 13, 3.2);
  b.box(1, 3, 1, 14, 6, 12, (x, y, z) => {
    const side = z === 1 || z === 12 || x === 1 || x === 14;
    if (y === 3) return WOOD_D;
    if (!side) return 0;
    return y === 6 ? WOOD_L : y === 4 ? TEAM_D : TEAM; // plank sides in the side's colour
  });
  crates(b, 2, 2, 3, 3, 5); b.box(2, 4, 9, 4, 5, 11, (x, y) => (y === 5 ? BRASS_D : WOOD)); // ammunition boxes
  b.box(13, 7, 3, 14, 7, 10, WOOD); b.box(14, 4, 6, 22, 4, 7, WOOD_D); // driver's bench, the pole
  sitter(b, 13, 7, 5);
  mule(b, 15, 1, true); mule(b, 15, 10, true); // a pair of horses
  b.box(15, 6, 3, 21, 6, 3, LEATHER); b.box(15, 6, 10, 21, 6, 10, LEATHER); // reins
  const t = new VB();
  t.box(2, 0, 2, 5, 0, 5, IRON); t.box(3, 1, 3, 4, 5, 4, IRON); t.box(2, 5, 1, 5, 6, 6, IRON_L); // a tall pivot post and its yoke
  t.box(7, 1, 0, 7, 6, 7, (x, y, z) => (y === 6 ? TEAM_L : (y + z) % 4 === 0 ? TEAM_D : TEAM)); // a plate shield in the side's colour
  t.box(0, 2, 3, 1, 3, 4, LEATHER); // the gunner's seat
  for (let i = 0; i <= 12; i++) { // six barrels cocked up at the sky
    const x = 4 + Math.round(i * 0.55), y = 6 + Math.round(i * 0.7);
    for (let dy = -1; dy <= 1; dy++) for (let dz = 2; dz <= 5; dz++) {
      const ring = dy ? dz === 3 || dz === 4 : dz === 2 || dz === 5;
      if (i === 9 && !(dy && (dz === 2 || dz === 5))) t.set(x, y + dy, dz, BRASS);
      else if (ring) t.set(x, y + dy, dz, i === 12 ? SOOT : dy > 0 ? IRON_L : IRON);
      else if (!dy) t.set(x, y, dz, SOOT);
    }
  }
  t.box(2, 7, 2, 5, 9, 5, (x, y) => (y === 9 ? BRASS : BRASS_D)); t.box(4, 10, 3, 5, 12, 4, BRASS); // brass breech, the magazine on top
  return { body: b, bodyPivot: [12.5, 0, 6.5], turret: t, turretPivot: [3.5, 0, 3.5], turretAt: [9, 6, 6.5] };
}

// War Balloon (the gunship's job): a round hot-air balloon, its gores in the side's colour and canvas in turn,
// a burner glowing in its mouth, a wicker basket slung under it with a Gatling poking over the rim.
export function warBalloon(): ModelDef {
  const b = new VB();
  const cx = 16, cy = 13.5, cz = 7;
  for (let y = 5; y <= 22; y++) { // the envelope: full above its waist, tapering to the mouth below
    const dy = (y - cy) / 8.5, round = Math.sqrt(Math.max(0, 1 - dy * dy)), R = y >= cy ? 6.8 * round : 6.8 * round * (0.55 + 0.45 * round) + 0.9 * (1 - round);
    for (let x = cx - 7; x <= cx + 7; x++) for (let z = cz - 7; z <= cz + 7; z++) {
      const d = Math.hypot(x - cx, z - cz); if (d > R || (d < R - 1.4 && y < 22 && y > 5)) continue;
      const g = Math.floor((Math.atan2(z - cz, x - cx) + Math.PI) / (Math.PI / 4) + 0.5) % 2 === 0, up = dy;
      b.set(x, y, z, y === 5 ? SOOT : g ? (up > 0.6 ? TEAM_L : up < -0.4 ? TEAM_D : TEAM) : up > 0.6 ? CANVAS_L : up < -0.4 ? CANVAS_D : CANVAS);
    }
  }
  b.set(cx, 5, cz, GLOW); b.set(cx, 4, cz, FUSE); // the burner's flame
  for (const [x, z] of [[14, 5], [18, 5], [14, 9], [18, 9]]) b.box(x, 3, z, x, 4, z, SOOT); // the ropes
  b.box(14, 0, 5, 18, 2, 9, (x, y, z) => {
    const side = x === 14 || x === 18 || z === 5 || z === 9;
    if (y === 0) return WOOD_D; if (!side) return 0;
    return y === 2 ? TEAM : (x + z + y) % 2 ? 0xa08050 : 0x8a6a40; // wicker, a team band round the rim
  });
  b.box(16, 1, 6, 16, 2, 6, TEAM); b.set(16, 3, 6, FELT); // the gunner
  b.box(18, 3, 7, 18, 3, 8, BRASS_D); b.box(19, 3, 7, 23, 3, 8, (x) => (x === 23 ? SOOT : x === 21 ? BRASS : IRON)); // the Gatling over the bow
  return { body: b, bodyPivot: [16, 0, 7], clean: true };
}

// Airship (the bomber's job): a long dirigible in the side's colours and canvas, a cabin slung beneath with a
// row of windows, engine pods on outriggers, cross fins at the tail, and crates of dynamite hung under the cabin.
export function airship(): ModelDef {
  const b = new VB();
  const Z = 17;
  egg(b, 19, 10.5, Z, 18, 4.4, 6.8, gore(10.5, Z, 4.4));
  for (let x = 1; x <= 7; x++) { const k = Math.round((7 - x) * 0.5); b.box(x, 14 - k + 1, Z, x, 14, Z, x === 1 ? TEAM_L : TEAM_D); b.box(x, 5, Z, x, 7 + k - 1, Z, TEAM_D); b.box(x, 10, Z - 11 + k, x, 10, Z - 6, TEAM_D); b.box(x, 10, Z + 6, x, 10, Z + 11 - k, TEAM_D); } // cross fins
  b.box(12, 4, 15, 26, 6, 19, (x, y, z) => {
    const side = z === 15 || z === 19 || x === 12 || x === 26;
    if (y === 6) return TEAM_D; if (!side) return y === 4 ? WOOD_D : 0;
    if (y === 5 && x % 2 === 0 && x > 12 && x < 26) return x === 25 ? GLASS_L : GLASS;
    return y === 4 ? WOOD_D : TEAM;
  });
  b.box(27, 4, 16, 27, 5, 18, GLASS); // the bridge window at the bow
  for (const x of [13, 25]) for (const z of [15, 19]) b.set(x, 7, z, SOOT); // struts up to the envelope
  for (const z of [7, 27]) { // engine pods on outriggers, propellers behind
    line(b, 18, 9, z < Z ? 11 : 23, 18, 7, z, 0, () => IRON);
    b.box(15, 6, z - 1, 21, 7, z + 1, (x, y) => (x === 21 ? BRASS_D : y === 7 ? IRON_L : IRON));
    for (let a = 0; a < 10; a++) b.set(14, 6.5 + Math.cos(a * 0.63) * 2, z + Math.sin(a * 0.63) * 2, 0x2e3032);
  }
  for (let x = 15; x <= 23; x += 4) { b.box(x, 2, 16, x + 2, 3, 18, (xx, y, z) => (y === 3 ? (z === 17 ? DYN : WOOD_L) : (xx + z) % 2 ? WOOD : WOOD_D)); b.set(x + 1, 4, 17, SOOT); } // dynamite crates on the bomb rack
  return { body: b, bodyPivot: [19, 0, Z], clean: true };
}

// Steam Titan (the colossus's job): a huge four-legged iron walker, a riveted hull in the side's colours on
// piston legs, a great boiler on its back with two tall smokestacks; the turret is its head, two portholes
// glowing like eyes, with a cannon arm on each side.
export function steamTitan(): ModelDef {
  const b = new VB();
  // four legs: a thigh out from the hull to a high knee, a piston shin down to a broad foot
  for (const [hx, hz, kx0, kz, ph] of [[9, 9, 3, 3, 0], [47, 9, 53, 3, 0.5], [9, 30, 3, 36, 0.5], [47, 30, 53, 36, 0]]) {
    const sw = swing(ph), kx = kx0 + sw * 3, lift = sw > 0 ? 3 : 0; // striding: each diagonal pair together, the leg coming forward lifted
    line(b, hx, 12, hz, kx, 25, kz, 1, (x, y) => (y % 4 === 0 ? TEAM_D : TEAM)); // thigh
    b.box(kx - 2, 24, kz - 2, kx + 2, 27, kz + 2, (x, y) => (y === 27 ? BRASS : IRON_L)); // knee
    line(b, kx, 23, kz, kx, 3 + lift, kz, 1, (x, y) => (y % 5 === 0 ? BRASS_D : IRON)); // shin
    line(b, kx + (kx < 28 ? 2 : -2), 18, kz + (kz < 19 ? 2 : -2), kx + (kx < 28 ? 2 : -2), 4 + lift, kz + (kz < 19 ? 2 : -2), 0, () => BRASS); // its piston rod
    b.box(kx - 3, lift, kz - 3, kx + 3, 2 + lift, kz + 3, (x, y, z) => (y === 2 + lift ? (Math.abs(x - kx) + Math.abs(z - kz) > 4 ? 0 : IRON_L) : (x + z) % 3 === 0 ? IRON_L : IRON)); // foot
  }
  // the hull: riveted plates in the side's colour, an iron belly, a deck on top
  b.box(4, 9, 7, 52, 16, 32, (x, y, z) => {
    const side = x === 4 || x === 52 || z === 7 || z === 32;
    if (y === 16) return side ? TEAM_L : (x % 6 === 0 || z % 6 === 0) ? IRON : IRON_L;
    if (y === 9) return IRON; if (!side) return 0;
    if ((y === 10 || y === 15) && (x + z) % 2 === 0) return IRON_L;
    return (z === 7 || z === 32) && x % 8 === 0 ? TEAM_D : TEAM;
  });
  for (let i = 0; i < 4; i++) b.box(53 + i, 10 + i, 9 + i, 53 + i, 15, 30 - i, (x, y) => (y === 15 ? TEAM_D : TEAM)); // the bow, sloped
  b.box(53, 9, 12, 55, 10, 27, (x, y, z) => (z % 2 ? IRON : IRON_L)); b.set(54, 12, 12, LAMP); b.set(54, 12, 27, LAMP); // a cowcatcher, lamps
  // the boiler on its back: a riveted drum with brass bands, a firebox glowing at its foot
  tower(b, 13, 19, 17, 34, (y) => (y > 31 ? 8 - (y - 31) * 1.5 : 8), (x, y, z, a) => (y % 6 === 0 ? BRASS : y % 6 === 1 ? BRASS_D : (Math.round(a * 8) & 1) ? IRON : IRON_L), 1.6);
  b.box(22, 17, 16, 22, 19, 22, (x, y, z) => (y === 17 || z === 16 || z === 22 ? IRON : GLOW)); // firebox door
  for (const z of [13, 26]) { b.box(7, 30, z - 1, 9, 43, z + 1, (x, y) => (y % 5 === 0 ? TEAM_D : IRON)); b.box(6, 44, z - 2, 10, 45, z + 2, SOOT); } // two tall smokestacks
  for (const z of [10, 29]) line(b, 20, 20, z < 19 ? 14 : 24, 44, 17, z, 0, () => BRASS_D); // steam pipes forward along the deck
  b.box(5, 17, 8, 7, 22, 30, (x, y, z) => (y === 22 ? SOOT : z % 3 ? IRON : IRON_L)); // a coal bunker at the stern
  const t = new VB();
  // the head: a domed riveted cab in the side's colours, two glowing porthole eyes, a brass crest
  for (let y = 0; y <= 13; y++) for (let x = 0; x <= 22; x++) for (let z = 3; z <= 19; z++) {
    const top = y > 8 ? (y - 8) * 1.6 : 0;
    if (x < top || x > 22 - top || z < 3 + top || z > 19 - top) continue;
    const side = x === Math.ceil(top) || x === Math.floor(22 - top) || z === Math.ceil(3 + top) || z === Math.floor(19 - top) || y === 13 || y === 0;
    if (!side) continue;
    t.set(x, y, z, y === 0 ? IRON : y === 13 ? BRASS : y === 8 ? TEAM_D : (y === 3 || y === 7) && (x + z) % 2 === 0 ? IRON_L : TEAM);
  }
  for (const zc of [8, 14]) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) { const d = Math.hypot(dy, dz); if (d < 2.6) t.set(22, 5 + dy, zc + dz, d > 1.6 ? BRASS : d > 0.8 ? GLOW : LAMP); } // porthole eyes
  t.box(23, 1, 9, 23, 2, 13, SOOT); // a grille mouth
  // a cannon arm on each side: a shoulder joint, a long iron barrel, a flared muzzle
  for (const zc of [1, 21]) {
    t.box(4, 1, zc - 1, 10, 7, zc + 1, (x, y) => (y === 7 ? BRASS : TEAM_D)); // shoulder
    for (let x = 11; x <= 54; x++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      const d = Math.hypot(dy, dz), r = x <= 16 ? 2.4 : x >= 50 ? 2.4 : 1.5;
      if (d > r) continue;
      t.set(x, 4 + dy, zc + dz, x === 54 && d < 1 ? SOOT : x === 16 || x === 30 || x === 50 ? BRASS_D : dy > 0 ? IRON_L : IRON);
    }
  }
  return { body: b, bodyPivot: [28, 0, 19.5], turret: t, turretPivot: [11, 0, 11], turretAt: [35, 17, 19.5] };
}

// Pioneer Wagon (the builder): a covered wagon, its canvas top striped in the side's colour, lumber and tools
// on board, the driver up front and two mules in harness.
export function pioneerWagon(): ModelDef {
  const b = new VB();
  wheel(b, 4, 4, 0, 0, 4.2); wheel(b, 4, 4, 13, 13, 4.2); wheel(b, 13, 3, 0, 0, 3.2); wheel(b, 13, 3, 13, 13, 3.2);
  b.box(1, 3, 1, 15, 6, 12, (x, y, z) => {
    const side = z === 1 || z === 12 || x === 1 || x === 15;
    if (y === 3) return WOOD_D; if (!side) return 0;
    return y === 6 ? WOOD_L : (y === 4 ? WOOD_D : WOOD);
  });
  // the canvas top on its hoops, bulging at the ends; a stripe of the side's colour every other panel
  for (let x = 1; x <= 15; x++) for (let z = 0; z <= 13; z++) {
    const dz = (z - 6.5) / 7, flare = x === 1 || x === 15 ? 0.6 : 0, h = 7 + Math.round(Math.sqrt(Math.max(0, 1 - dz * dz)) * (7 + flare));
    if (Math.abs(dz) > 1) continue;
    const stripe = (x - 1) % 4 === 1 || (x - 1) % 4 === 2 ? (x - 1) % 8 < 4 : false;
    for (let y = 7; y <= h; y++) {
      const shell = y === h || x === 1 || x === 15 || z === 0 || z === 13;
      if (!shell) continue;
      if ((x === 1 || x === 15) && y < h - 2 && Math.abs(z - 6.5) < 3) continue; // the open ends
      b.set(x, y, z, (x - 1) % 4 === 0 && y === h ? WOOD_D : stripe ? (y === h ? TEAM_L : TEAM) : y === h ? CANVAS_L : CANVAS);
    }
  }
  b.box(0, 6, 4, 3, 7, 9, (x, y, z) => (z % 2 ? WOOD_L : WOOD)); // planks out of the back
  b.box(1, 4, 0, 6, 4, 0, WOOD_L); b.set(7, 5, 0, IRON); // a shovel strapped to the side
  b.box(14, 7, 3, 15, 7, 10, WOOD); sitter(b, 15, 7, 5); // the driver's bench
  b.box(15, 3, 6, 23, 3, 7, WOOD_D); mule(b, 16, 1); mule(b, 16, 10); // the pole, two mules
  b.box(16, 6, 3, 22, 6, 3, LEATHER); b.box(16, 6, 10, 22, 6, 10, LEATHER); // reins
  return { body: b, bodyPivot: [13, 0, 6.5] };
}

// Prospector's Cart (the harvester): a mule-drawn ore cart, its sides in the side's colour, heaped with rock and
// glinting gold, a pick and a shovel stuck in the pile and the old prospector at the reins.
export function prospectorCart(): ModelDef {
  const b = new VB();
  wheel(b, 8, 4, 0, 1, 4.2); wheel(b, 8, 4, 12, 13, 4.2); b.box(8, 4, 2, 8, 4, 11, IRON);
  b.box(1, 4, 2, 15, 9, 11, (x, y, z) => {
    const side = z === 2 || z === 11 || x === 1 || x === 15;
    if (y === 4) return WOOD_D; if (!side) return 0;
    if (x % 5 === 0 || y === 9) return IRON; // iron bands
    return y === 5 ? TEAM_D : TEAM;
  });
  for (let x = 2; x <= 14; x++) for (let z = 3; z <= 10; z++) { // the heap: rock, quartz, and gold nuggets
    const top = 9 + Math.round(3 - Math.hypot((x - 8) / 3.5, (z - 6.5) / 2.6) + hash3(x, 3, z) * 1.2);
    for (let y = 5; y <= top; y++) { const h = hash3(x, z, y); b.set(x, y, z, y === top && h < 0.22 ? (h < 0.1 ? 0xf0c840 : 0xc89a30) : [0x8a7a68, 0x6e6052, 0x9a8a74, 0xb8ae9c, 0x5e5246][(h * 5) | 0]); }
  }
  b.box(4, 13, 4, 4, 16, 4, WOOD_L); b.box(3, 16, 4, 6, 16, 4, IRON); // the pick
  b.box(11, 12, 9, 11, 15, 9, WOOD_L); b.box(11, 11, 8, 11, 11, 10, IRON); // the shovel
  for (const z of [3, 10]) b.box(15, 4, z, 25, 4, z, WOOD_D); // the shafts
  mule(b, 16, 5); b.box(13, 10, 4, 15, 10, 9, WOOD); sitter(b, 14, 10, 6, 0x8a7a5a, 0x9a8a6a); // the mule, the prospector in a battered hat
  return { body: b, bodyPivot: [13, 0, 6.5] };
}

// Fort (Field Command): a log stockade with a blockhouse on each corner under roofs in the side's colour, the gate
// on the south face under a team sign; inside, a two-storey headquarters roofed in the side's colour, a long
// barracks shed, stores, and a tall flagpole flying the side's flag over everything.
const DIRT = [0xa88a5e, 0x9a7e54, 0xb4966a], LOG = [0x6e4e30, 0x7e5a38, 0x5e4228, 0x8a6640], CLAP = 0xd2c4a0, CLAP_D = 0xb4a684, WIN = 0x2e3a4a, WIN_L = 0x7a94b0;
export function fort(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 71, 0, 71, (x, y, z) => (Math.abs(x - 36) < 5 && z > 48 ? DIRT[1] : DIRT[(hash3(x >> 1, 3, z >> 1) * 3) | 0])); // packed dirt, a track worn to the gate
  // the stockade: sharpened logs, two deep, each its own tone
  const post = (x: number, z: number, n: number) => {
    const h = 13 + (n % 2), c = LOG[(hash3(n, 7, 1) * 4) | 0];
    for (let y = 1; y <= h; y++) b.set(x, y, z, y === h ? 0xa88458 : y === 1 ? LOG[2] : c);
  };
  for (let i = 4; i <= 67; i++) {
    post(i, 4, i); post(i, 5, i); post(4, i, i + 1); post(5, i, i + 1); post(67, i, i); post(66, i, i);
    if (i < 30 || i > 42) { post(i, 67, i + 1); post(i, 66, i + 1); }
  }
  for (let x = 6; x <= 65; x++) for (const z of [7, 64]) b.set(x, 10, z, WOOD_D); for (let z = 6; z <= 65; z++) for (const x of [7, 64]) b.set(x, 10, z, WOOD_D); // the firing step inside
  // the gate: two great posts, a beam, the side's sign over it, the doors swung open inward
  for (const x of [28, 43]) b.box(x, 1, 65, x + 1, 20, 68, (xx, y) => (y === 20 ? 0xa88458 : LOG[(xx + y) % 2]));
  b.box(28, 17, 66, 44, 18, 67, WOOD_D);
  b.box(31, 13, 68, 41, 16, 68, (x, y) => (y === 13 || y === 16 || x === 31 || x === 41 ? WOOD_D : (x + y) % 5 === 0 ? TEAM_L : TEAM)); // the sign
  for (const x of [30, 42]) b.box(x, 1, 59, x, 12, 65, (xx, y, z) => (y % 5 === 2 ? IRON : z % 2 ? LOG[1] : LOG[0])); // gate doors, open
  // four blockhouses: log walls, an overhanging upper storey with loopholes, a pyramid roof in the side's colour
  for (const [cx, cz] of [[6, 6], [65, 6], [6, 65], [65, 65]]) {
    b.box(cx - 5, 1, cz - 5, cx + 5, 14, cz + 5, (x, y, z) => {
      const side = Math.abs(x - cx) === 5 || Math.abs(z - cz) === 5; if (!side) return y === 14 ? WOOD_D : 0;
      if (y === 7 && (x + z) % 4 === 0) return SOOT; return y % 2 ? LOG[1] : LOG[2];
    });
    b.box(cx - 7, 15, cz - 7, cx + 7, 23, cz + 7, (x, y, z) => {
      const side = Math.abs(x - cx) === 7 || Math.abs(z - cz) === 7; if (!side) return 0;
      if (y >= 18 && y <= 19 && (x + z) % 4 === 1) return SOOT; // loopholes
      return y === 15 ? LOG[2] : y % 2 ? LOG[3] : LOG[0];
    });
    for (let k = 0; k <= 8; k++) b.box(cx - 8 + k, 24 + k, cz - 8 + k, cx + 8 - k, 24 + k, cz + 8 - k, (x, y, z) => (k === 8 ? TEAM_L : Math.abs(x - cx) === 8 - k || Math.abs(z - cz) === 8 - k ? (k % 2 ? TEAM_D : TEAM) : 0));
  }
  // the headquarters: two storeys of painted clapboard, windows, a porch in front, a gable roof in the side's colour
  b.box(22, 1, 20, 50, 20, 44, (x, y, z) => {
    const side = x === 22 || x === 50 || z === 20 || z === 44; if (!side) return y === 10 || y === 20 ? WOOD_D : 0;
    const along = z === 20 || z === 44 ? x - 22 : z - 20;
    if (z === 44 && x >= 34 && x <= 38 && y <= 7) return y === 7 ? WOOD_D : 0x4a3424; // the door
    const wy = y <= 10 ? y - 1 : y - 11;
    if (wy >= 3 && wy <= 6 && along % 6 >= 2 && along % 6 <= 4) return wy === 6 || along % 6 === 2 || along % 6 === 4 ? 0xe8e0cc : wy === 5 ? WIN_L : WIN; // windows in white frames
    if (y === 10 || y === 11) return WOOD_D; // the floor line
    return y % 2 ? CLAP : CLAP_D;
  });
  for (let z = 19; z <= 45; z++) { // the roof, ridged along x
    const h = 21 + Math.round((13 - Math.abs(z - 32)) * 0.75);
    for (let x = 21; x <= 51; x++) b.set(x, h, z, Math.abs(z - 32) <= 0 ? TEAM_L : (z + (x >> 2)) % 3 === 0 ? TEAM_D : TEAM);
    for (const x of [22, 50]) for (let y = 21; y < h; y++) b.set(x, y, z, y % 2 ? CLAP : CLAP_D); // gable ends
  }
  b.box(26, 21, 30, 28, 34, 32, (x, y) => (y >= 33 ? SOOT : (x + y) % 3 ? 0x8a4a36 : 0x6e3a2a)); // brick chimney
  b.box(22, 1, 45, 50, 1, 50, (x, y, z) => (x % 2 ? WOOD : WOOD_L)); // the porch boards
  for (let x = 22; x <= 50; x += 7) b.box(x, 2, 50, x, 10, 50, WOOD_L);
  b.box(21, 11, 45, 51, 11, 51, (x, y, z) => (z === 51 ? TEAM_D : x % 3 ? TEAM : TEAM_D)); // porch roof
  b.box(31, 12, 45, 41, 15, 45, (x, y) => (y === 12 || y === 15 || x === 31 || x === 41 ? WOOD_D : (x * 3 + y) % 4 === 0 ? 0x3a2a1c : CLAP)); // the HQ sign
  // a long barracks shed along the north wall, roofed in shingle with a team trim
  b.box(14, 1, 8, 58, 9, 14, (x, y, z) => {
    const side = x === 14 || x === 58 || z === 8 || z === 14; if (!side) return 0;
    if (z === 14 && y >= 3 && y <= 5 && x % 6 === 2) return WIN;
    if (z === 14 && y <= 6 && x % 12 === 8) return 0x4a3424; return y % 2 ? LOG[1] : LOG[3];
  });
  for (let z = 7; z <= 15; z++) b.box(13, 10 + Math.round((15 - z) * 0.4), z, 59, 10 + Math.round((15 - z) * 0.4), z, (x) => (z === 15 ? TEAM_D : (x + z) % 4 === 0 ? 0x5a4a3a : 0x6e5a46));
  // the flagpole by the parade ground, the side's flag snapping out from the top
  for (let y = 1; y <= 54; y++) b.set(36, y, 56, y < 3 ? 0x8a8274 : 0xe0dccc); b.set(36, 55, 56, BRASS);
  b.box(35, 1, 55, 37, 1, 57, 0x8a8274);
  for (let x = 37; x <= 50; x++) for (let y = 44; y <= 53; y++) {
    const z = 56 + Math.round(Math.sin(x * 0.7) * 0.7), canton = x <= 42 && y >= 49;
    b.set(x, y, z, canton ? ((x === 39 || x === 40) && (y === 51) ? TEAM_L : TEAM_D) : y % 2 ? TEAM : TEAM_L);
  }
  // the yard: water trough, barrels, crates, hay, a hitching rail
  b.box(52, 1, 50, 58, 2, 52, (x, y, z) => (y === 2 && x > 52 && x < 58 && z === 51 ? 0x4a6a8a : WOOD_D));
  for (const [x, z] of [[56, 22], [58, 22], [56, 25], [12, 50], [14, 52]]) tower(b, x, z, 1, 4, () => 1.3, (xx, y) => (y === 2 || y === 4 ? IRON : WOOD), 2);
  crates(b, 10, 20, 4, 4, 4); crates(b, 10, 25, 3, 3, 3);
  b.box(54, 1, 36, 60, 3, 39, (x, y) => (y === 3 ? 0xd8b85a : 0xc8a448)); // hay bales
  for (let x = 54; x <= 62; x++) b.set(x, 4, 58, WOOD_L); for (const x of [54, 62]) b.box(x, 1, 58, x, 3, 58, WOOD); // hitching rail
  return { body: b, bodyPivot: [36, 0, 36] };
}

export const UNITS: Record<string, () => ModelDef> = {
  // (walkers step in two frames; horses, mules, wheels and the Titan's legs go round in four)
  rifle: animate(gunslinger, 2), scout: animate(horseman), rocket: animate(buffaloGunner, 2), grenadier: animate(dynamiter, 2), tank: animate(warWagon), juggernaut: animate(ironclad), artillery: animate(fieldCannon),
  flak: animate(gatlingWagon), gunship: warBalloon, bomber: airship, colossus: animate(steamTitan), builder: animate(pioneerWagon), harvester: animate(prospectorCart), fieldCommand: fort,
};
