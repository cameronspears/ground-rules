// Unit models, built from small blocks in code. TEAM colours are swapped per side.
import * as THREE from 'three';
import { meshVoxels, shade } from './voxel';
import { loadSprites } from './sprites';

export const TEAM = 1, TEAM_D = 2, TEAM_L = 3;
export const UNIT_SCALE = 0.36;

export class VB {
  m = new Map<number, number>();
  key(x: number, y: number, z: number) { return x + 64 * (y + 64 * z); }
  set(x: number, y: number, z: number, c: number) { if (x >= 0 && y >= 0 && z >= 0 && x < 64 && y < 64 && z < 64) this.m.set(this.key(x, y, z), c); }
  del(x: number, y: number, z: number) { this.m.delete(this.key(x, y, z)); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, c);
  }
  each(f: (x: number, y: number, z: number, c: number) => void) {
    for (const [k, c] of this.m) f(k % 64, Math.floor(k / 64) % 64, Math.floor(k / 4096), c);
  }
  // pivot: model-space block coordinate that becomes the origin
  geometry(team: number[], pivot: [number, number, number]) {
    const res = (c: number) => (c === TEAM ? team[0] : c === TEAM_D ? team[1] : c === TEAM_L ? team[2] : c);
    return meshVoxels({
      x0: 0, y0: 0, z0: 0, x1: 64, y1: 64, z1: 64, scale: UNIT_SCALE, jitter: 0.1,
      offset: [-pivot[0] * UNIT_SCALE, -pivot[1] * UNIT_SCALE, -pivot[2] * UNIT_SCALE],
      get: (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 64 || z >= 64 ? 0 : res(this.m.get(this.key(x, y, z)) ?? 0)),
    })!;
  }
}

const TRACK = 0x2a2c31, STEEL = 0x50545c, DARK = 0x1d1f24, GLASS = 0x223047, LAMP = 0xffe38a, SKIN = 0xf0c08a;

export function teamColors(main: number) { return [main, shade(main, 0.62), shade(main, 1.25)]; }

// Every model faces +X. Parts: body (+ optional turret on a pivot).
export interface ModelDef { body: VB; bodyPivot: [number, number, number]; turret?: VB; turretPivot?: [number, number, number]; turretAt?: [number, number, number] }

function tank(): ModelDef {
  const b = new VB();
  b.box(0, 0, 0, 21, 3, 2, TRACK); b.box(0, 0, 11, 21, 3, 13, TRACK);
  for (let x = 1; x < 21; x += 3) { b.set(x, 1, 0, STEEL); b.set(x, 1, 13, STEEL); }
  b.box(1, 3, 1, 21, 3, 12, TEAM_D);
  b.box(1, 4, 2, 19, 6, 11, TEAM);
  b.box(18, 4, 2, 20, 4, 11, TEAM); b.box(19, 5, 2, 19, 5, 11, TEAM_D);
  b.box(1, 6, 2, 3, 6, 11, TEAM_D);
  b.set(20, 5, 3, LAMP); b.set(20, 5, 10, LAMP);
  b.box(0, 5, 4, 0, 6, 5, DARK); b.box(0, 5, 8, 0, 6, 9, DARK);
  b.box(4, 7, 3, 16, 7, 10, TEAM_D);
  for (let x = 2; x < 19; x += 4) { b.set(x, 6, 1, TEAM_L); b.set(x, 6, 12, TEAM_L); }
  const t = new VB();
  t.box(0, 0, 0, 9, 3, 7, TEAM); t.box(1, 4, 1, 8, 4, 6, TEAM_D);
  t.box(2, 5, 4, 4, 5, 6, STEEL); t.box(0, 1, 0, 0, 2, 7, TEAM_D);
  t.box(10, 1, 3, 19, 2, 4, STEEL); t.box(18, 0, 2, 19, 3, 5, DARK);
  t.box(9, 0, 2, 10, 3, 5, TEAM_D);
  for (let y = 5; y < 12; y++) t.set(1, y, 1, DARK);
  t.set(1, 12, 1, 0xff4040);
  t.box(6, 2, 0, 8, 2, 0, TEAM_L); t.box(6, 2, 7, 8, 2, 7, TEAM_L);
  return { body: b, bodyPivot: [10.5, 0, 7], turret: t, turretPivot: [4.5, 0, 3.5], turretAt: [9.5, 8, 7] };
}

function rifleman(): ModelDef {
  const b = new VB();
  b.box(1, 0, 0, 2, 2, 0, DARK); b.box(1, 0, 2, 2, 2, 2, DARK);
  b.box(1, 3, 0, 2, 5, 2, TEAM); b.box(1, 3, 0, 2, 3, 2, TEAM_D);
  b.set(0, 4, 1, TEAM_D); b.set(0, 5, 1, TEAM_D);
  b.box(1, 6, 0, 2, 6, 2, SKIN); b.set(3, 6, 1, SKIN);
  b.box(0, 7, 0, 3, 7, 2, TEAM_D); b.box(1, 8, 0, 2, 8, 2, TEAM_D);
  b.box(2, 4, 3, 6, 4, 3, DARK); b.set(3, 3, 3, DARK); b.set(2, 5, 3, SKIN);
  return { body: b, bodyPivot: [1.5, 0, 1.5] };
}

function mortar(): ModelDef {
  const b = new VB();
  for (const x of [2, 7, 15]) { b.box(x, 0, 0, x + 2, 2, 1, TRACK); b.box(x, 0, 10, x + 2, 2, 11, TRACK); b.set(x + 1, 1, 0, STEEL); b.set(x + 1, 1, 11, STEEL); }
  b.box(1, 2, 1, 19, 3, 10, DARK);
  b.box(14, 4, 1, 19, 9, 10, TEAM); b.box(19, 6, 2, 19, 8, 9, GLASS); b.box(14, 7, 1, 17, 8, 1, GLASS); b.box(14, 7, 10, 17, 8, 10, GLASS);
  b.box(14, 10, 1, 19, 10, 10, TEAM_D); b.set(19, 4, 2, LAMP); b.set(19, 4, 9, LAMP);
  b.box(1, 4, 1, 13, 4, 10, TEAM_D); b.box(1, 5, 1, 13, 6, 1, TEAM); b.box(1, 5, 10, 13, 6, 10, TEAM); b.box(1, 5, 1, 1, 6, 10, TEAM);
  for (let z = 2; z < 10; z += 3) b.box(2, 5, z, 4, 6, z + 1, 0x8a7a50);
  const t = new VB();
  t.box(0, 0, 0, 4, 1, 4, STEEL);
  for (let i = 0; i < 9; i++) t.box(1 + Math.floor(i * 0.6), 2 + i, 1, 3 + Math.floor(i * 0.6), 2 + i, 3, i > 6 ? DARK : TEAM_D);
  return { body: b, bodyPivot: [10, 0, 5.5], turret: t, turretPivot: [2, 0, 2], turretAt: [7, 5, 5.5] };
}

export function turretGun(): VB {
  const t = new VB();
  t.box(0, 0, 0, 9, 1, 9, STEEL);
  t.box(1, 2, 1, 8, 6, 8, TEAM); t.box(1, 7, 2, 7, 7, 7, TEAM_D);
  t.box(9, 3, 2, 22, 4, 3, DARK); t.box(9, 3, 6, 22, 4, 7, DARK);
  t.box(8, 2, 1, 9, 5, 8, TEAM_D);
  t.box(3, 5, 0, 6, 5, 0, LAMP);
  return t;
}

// Code-built models are the fallback; a hand-drawn sprite file with the same name replaces one.
export const MODELS: Record<string, ModelDef> = { tank: tank(), rifle: rifleman(), mortar: mortar(), ...loadSprites() };

const cache = new Map<string, { body: THREE.BufferGeometry; turret?: THREE.BufferGeometry }>();
export function geometryFor(key: string, team: number[]) {
  const id = key + team[0];
  let g = cache.get(id);
  if (!g) {
    const d = MODELS[key];
    g = { body: d.body.geometry(team, d.bodyPivot), turret: d.turret?.geometry(team, d.turretPivot!) };
    cache.set(id, g);
  }
  return g;
}
