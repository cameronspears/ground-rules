// Block models: the art source. Every unit, building and tree is built from blocks, then baked
// into flat pixel sprites (see bake.ts). TEAM colours are swapped per side.
import { meshVoxels, shade, LIN, dirty, type Mesh } from './voxel';

export const TEAM = 1, TEAM_D = 2, TEAM_L = 3;

export class VB {
  static N = 128;
  m = new Map<number, number>();
  min = [1e9, 1e9, 1e9]; max = [-1e9, -1e9, -1e9];
  key(x: number, y: number, z: number) { return x + 128 * (y + 128 * z); }
  get(x: number, y: number, z: number) { return x < 0 || y < 0 || z < 0 || x >= 128 || y >= 128 || z >= 128 ? 0 : this.m.get(this.key(x, y, z)) ?? 0; }
  set(x: number, y: number, z: number, c: number) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (x < 0 || y < 0 || z < 0 || x >= 128 || y >= 128 || z >= 128) return;
    this.m.set(this.key(x, y, z), c);
    if (x < this.min[0]) this.min[0] = x; if (y < this.min[1]) this.min[1] = y; if (z < this.min[2]) this.min[2] = z;
    if (x > this.max[0]) this.max[0] = x; if (y > this.max[1]) this.max[1] = y; if (z > this.max[2]) this.max[2] = z;
  }
  del(x: number, y: number, z: number) { this.m.delete(this.key(x, y, z)); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | ((x: number, y: number, z: number) => number)) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const col = typeof c === 'number' ? c : c(x, y, z);
      if (col) this.set(x, y, z, col);
    }
  }
  each(f: (x: number, y: number, z: number, c: number) => void) {
    for (const [k, c] of this.m) f(k % 128, Math.floor(k / 128) % 128, Math.floor(k / 16384), c);
  }
  // pivot: model-space block coordinate that becomes the origin
  // The block model as a mesh, in a team's colours. It's meshed once (per pivot); another team's copy
  // only recolours the team-coloured corners, by the same sums in the same order, so it comes out
  // exactly as meshing it again would, at a fraction of the cost.
  private meshed = new Map<string, { geo: Mesh; rec: { slot: number[]; v: number[]; l: number[]; d: number[] } } | null>();
  geometry(team: number[], pivot: [number, number, number], grime = 0) {
    const pk = pivot.join() + '|' + grime;
    if (!this.meshed.has(pk)) {
      const rec = { slot: [] as number[], v: [] as number[], l: [] as number[], d: [] as number[] };
      const geo = meshVoxels({ x0: this.min[0], y0: this.min[1], z0: this.min[2], x1: this.max[0] + 1, y1: this.max[1] + 1, z1: this.max[2] + 1, jitter: 0.07, grime, offset: [-pivot[0], -pivot[1], -pivot[2]], get: (x, y, z) => this.get(x, y, z), record: rec });
      this.meshed.set(pk, geo ? { geo, rec } : null);
    }
    const m = this.meshed.get(pk);
    if (!m) return null; // (an empty model)
    const base = m.geo, rec = m.rec, col = new Float32Array(base.col);
    for (let k = 0; k < rec.slot.length; k++) {
      const sl = rec.slot[k]; if (!sl) continue;
      const c = team[sl - 1], v = rec.v[k], l = rec.l[k], [r, gg, b] = dirty(LIN[(c >> 16) & 255] * v, LIN[(c >> 8) & 255] * v, LIN[c & 255] * v, rec.d[k]);
      col[k * 3] = r * l; col[k * 3 + 1] = gg * l; col[k * 3 + 2] = b * l;
    }
    return { ...base, col };
  }
}

export function teamColors(main: number) { return [main, shade(main, 0.62), shade(main, 1.25)]; }
// Each side's paint (a little greyed: paint, not toy plastic): you (blue), red, neutral (grey), green, gold, marauders (purple)
export const TEAMS = [teamColors(0x4a6c94), teamColors(0xa0463a), teamColors(0x8a8a82), teamColors(0x527c40), teamColors(0xb08a38), teamColors(0x6e4c80)];

// Every model faces +X. Parts: body (+ optional turret on a pivot).
export interface ModelDef { clean?: boolean; body: VB; bodyPivot: [number, number, number]; turret?: VB; turretPivot?: [number, number, number]; turretAt?: [number, number, number]; frames?: VB[] } // frames: the body through a loop (legs walking, a wheel turning; see west/pose.ts)
