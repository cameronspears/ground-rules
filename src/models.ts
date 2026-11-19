// Unit model support: block grids, team-colour swapping, and the shared mesh cache.
import * as THREE from 'three';
import { meshVoxels, shade } from './voxel';
import { loadSprites } from './sprites';

export const TEAM = 1, TEAM_D = 2, TEAM_L = 3;
export const UNIT_SCALE = 1; // one model cell = one world block = one pixel

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

const STEEL = 0x50545c, DARK = 0x1d1f24, LAMP = 0xffe38a;

export function teamColors(main: number) { return [main, shade(main, 0.62), shade(main, 1.25)]; }

// Every model faces +X. Parts: body (+ optional turret on a pivot).
export interface ModelDef { body: VB; bodyPivot: [number, number, number]; turret?: VB; turretPivot?: [number, number, number]; turretAt?: [number, number, number] }

export function turretGun(): VB {
  const t = new VB();
  t.box(0, 0, 0, 9, 1, 9, STEEL);
  t.box(1, 2, 1, 8, 6, 8, TEAM); t.box(1, 7, 2, 7, 7, 7, TEAM_D);
  t.box(9, 3, 2, 22, 4, 3, DARK); t.box(9, 3, 6, 22, 4, 7, DARK);
  t.box(8, 2, 1, 9, 5, 8, TEAM_D);
  t.box(3, 5, 0, 6, 5, 0, LAMP);
  return t;
}

// Every unit model is hand-drawn in src/sprites/*.txt.
export const MODELS: Record<string, ModelDef> = loadSprites();

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
