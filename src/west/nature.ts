// WILD WEST: the desert's plants, standing in for the woods' pines and broadleaves.
import { VB, ModelDef } from '../models';
import { hash3 } from '../hash';

// The desert's "trees": tall saguaros with their arms up, and low clumps of sagebrush between them.
const CACTUS = [0x2a3e24, 0x3a5430, 0x4a683a, 0x5e7e46, 0x7a9658];
export function saguaro(seed: number): ModelDef {
  const b = new VB();
  const hgt = 18 + Math.floor(hash3(seed, 1, 1) * 10), cx = 9, cz = 9;
  const stem = (x: number, z: number, y0: number, y1: number) => { // a ribbed column, 3 across, rounded at the top
    for (let y = y0; y <= y1; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (dx && dz && (y === y1 || hash3(x + dx, y, z + dz) < 0.5)) continue; // round it off
      const lit = dx + dz > 0, rib = (dx === 0) !== (dz === 0);
      b.set(x + dx, y, z + dz, y === y1 ? CACTUS[4] : rib ? (lit ? CACTUS[3] : CACTUS[1]) : lit ? CACTUS[2] : CACTUS[0]);
    }
  };
  stem(cx, cz, 0, hgt);
  const arms = 1 + Math.floor(hash3(seed, 3, 3) * 2.2); // one to three arms
  for (let a = 0; a < arms; a++) {
    const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][(seed + a * 3) % 4], at = 6 + Math.floor(hash3(seed, a, 4) * (hgt - 12)), out = 3, up = 4 + Math.floor(hash3(seed, a, 5) * 5);
    for (let k = 1; k <= out; k++) stem(cx + dir[0] * k, cz + dir[1] * k, at, at + 1); // out sideways
    stem(cx + dir[0] * out, cz + dir[1] * out, at, at + up); // then up
  }
  return { body: b, bodyPivot: [9.5, 0, 9.5] };
}
const SAGE = [0x4e5442, 0x646c52, 0x7a8466, 0x949c7c, 0xaab090];
export function sagebrush(seed: number): ModelDef {
  const b = new VB();
  for (let c = 0; c < 5; c++) { // a few grey-green tufts huddled together, dry twigs showing at the foot
    const a = hash3(seed, c, 1) * Math.PI * 2, rr = c ? 1.5 + hash3(seed, c, 2) * 2.5 : 0, ox = 9.5 + Math.cos(a) * rr, oz = 9.5 + Math.sin(a) * rr, r = 1.8 + hash3(seed, c, 3) * 1.4;
    for (let dx = -4; dx <= 4; dx++) for (let dy = 0; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) {
      const d = Math.hypot(dx, (dy - 1) * 1.4, dz); if (d > r || hash3(seed + dx * 5, dy + c * 11, dz) < (d > r - 1 ? 0.4 : 0)) continue;
      b.set(ox + dx, dy, oz + dz, dy === 0 ? 0x5a4630 : dy >= 2 && d > r - 1.2 ? SAGE[3 + (hash3(dx, dy, dz + c) < 0.4 ? 1 : 0)] : d > r - 1.2 ? SAGE[2] : SAGE[(hash3(dx, c, dz) * 2) | 0]);
    }
  }
  return { body: b, bodyPivot: [9.5, 0, 9.5] };
}
