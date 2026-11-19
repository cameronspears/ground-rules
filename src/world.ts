// The battlefield: a 3D grid of blocks, split into chunks that are re-meshed when blocks change.
import * as THREE from 'three';
import { meshVoxels } from './voxel';
import { printify } from './print';

export const CHUNK = 16;
export const TERRAIN = 0;
export const RUBBLE = 1;
export const M = { NONE: 0, GRASS: 1, DIRT: 2, ROCK: 3, LEAF: 4, TILE: 5, ASPHALT: 6, BRICK: 7, WOOD: 8 };

export interface Building {
  id: number;
  team: number; // 0 neutral, 1 player, 2 enemy
  kind: string;
  name: string;
  total: number;
  alive: number;
  min: [number, number, number];
  max: [number, number, number];
  threshold: number; // collapses when alive/total drops below this
  crushable: boolean;
  destroyed: boolean;
  target: boolean; // counts toward the objective
  gun?: { obj: THREE.Object3D; barrel: THREE.Object3D; cooldown: number; heading: number; y: number };
}

export class World {
  col: Uint32Array;
  own: Uint16Array;
  hm: Uint8Array;
  chunks: (THREE.Mesh | null)[];
  dirty = new Set<number>();
  group = new THREE.Group();
  mat = printify(new THREE.MeshLambertMaterial({ vertexColors: true }));
  buildings = new Map<number, Building>();
  nextId = 2;
  cw: number; cd: number;
  version = 0; // bumps whenever walkability might have changed

  constructor(public W: number, public D: number, public H: number) {
    this.col = new Uint32Array(W * D * H);
    this.own = new Uint16Array(W * D * H);
    this.hm = new Uint8Array(W * D);
    this.cw = Math.ceil(W / CHUNK);
    this.cd = Math.ceil(D / CHUNK);
    this.chunks = new Array(this.cw * this.cd).fill(null);
  }

  idx(x: number, y: number, z: number) { return (y * this.D + z) * this.W + x; }
  inB(x: number, y: number, z: number) { return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.H && z < this.D; }

  get(x: number, y: number, z: number) {
    if (y < 0) return 1;
    if (x < 0 || z < 0 || x >= this.W || z >= this.D || y >= this.H) return 0;
    return this.col[(y * this.D + z) * this.W + x];
  }
  owner(x: number, y: number, z: number) { return this.inB(x, y, z) ? this.own[this.idx(x, y, z)] : 0; }

  addBuilding(b: Partial<Building>): Building {
    const full: Building = {
      id: this.nextId++, team: 0, kind: 'prop', name: '', total: 0, alive: 0,
      min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], threshold: 0.4, crushable: false, destroyed: false, target: false, ...b,
    };
    this.buildings.set(full.id, full);
    return full;
  }

  set(x: number, y: number, z: number, c: number, owner = 0) {
    if (!this.inB(x, y, z)) return;
    const i = this.idx(x, y, z);
    const prevOwner = this.own[i];
    if (this.col[i] && prevOwner >= 2) {
      const b = this.buildings.get(prevOwner);
      if (b) { b.alive--; if (c) b.total--; } // overwriting a block while building isn't damage
    }
    this.col[i] = c;
    this.own[i] = c ? owner : 0;
    if (c && owner >= 2) {
      const b = this.buildings.get(owner)!;
      b.alive++; b.total++;
      b.min = [Math.min(b.min[0], x), Math.min(b.min[1], y), Math.min(b.min[2], z)];
      b.max = [Math.max(b.max[0], x), Math.max(b.max[1], y), Math.max(b.max[2], z)];
    }
    const hi = z * this.W + x;
    if (c && y >= this.hm[hi]) this.hm[hi] = y + 1;
    else if (!c && y === this.hm[hi] - 1) {
      let h = y;
      while (h > 0 && !this.col[this.idx(x, h - 1, z)]) h--;
      this.hm[hi] = h;
    }
    this.version++;
    this.touch(x, z);
  }

  // Remove a block without counting it as building damage bookkeeping twice.
  remove(x: number, y: number, z: number) { this.set(x, y, z, 0, 0); }

  touch(x: number, z: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.dirty.add(cz * this.cw + cx);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0 && cx > 0) this.dirty.add(cz * this.cw + cx - 1);
    if (lx === CHUNK - 1 && cx < this.cw - 1) this.dirty.add(cz * this.cw + cx + 1);
    if (lz === 0 && cz > 0) this.dirty.add((cz - 1) * this.cw + cx);
    if (lz === CHUNK - 1 && cz < this.cd - 1) this.dirty.add((cz + 1) * this.cw + cx);
  }

  heightAt(x: number, z: number) {
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= this.W || iz >= this.D) return 0;
    return this.hm[iz * this.W + ix];
  }

  // Height a vehicle sees: crushable things (sandbags, trees) don't count.
  groundAt(x: number, z: number, crush: boolean) {
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= this.W || iz >= this.D) return 255;
    let h = this.hm[iz * this.W + ix];
    if (!crush) return h;
    while (h > 1) {
      const o = this.own[this.idx(ix, h - 1, iz)];
      const b = o >= 2 ? this.buildings.get(o) : null;
      if (b && b.crushable) h--; else break;
    }
    return h;
  }

  // Re-mesh changed chunks, but stop after a few milliseconds so a big collapse never stutters.
  rebuild(budgetMs = 5) {
    const t0 = performance.now();
    for (const ci of this.dirty) {
      this.dirty.delete(ci);
      this.buildChunk(ci);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  rebuildAll() {
    for (let i = 0; i < this.chunks.length; i++) this.buildChunk(i);
    this.dirty.clear();
  }

  buildChunk(ci: number) {
    const cx = ci % this.cw, cz = Math.floor(ci / this.cw);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    let top = 0;
    for (let z = z0; z < Math.min(z0 + CHUNK, this.D); z++)
      for (let x = x0; x < Math.min(x0 + CHUNK, this.W); x++) top = Math.max(top, this.hm[z * this.W + x]);
    const geo = meshVoxels({
      x0, y0: 0, z0, x1: Math.min(x0 + CHUNK, this.W), y1: top, z1: Math.min(z0 + CHUNK, this.D),
      get: (x, y, z) => this.get(x, y, z), jitter: 0.04, mark: (x, y, z, c) => this.markOf(x, y, z, c),
    });
    const old = this.chunks[ci];
    if (old) { old.geometry.dispose(); if (!geo) { this.group.remove(old); this.chunks[ci] = null; } else old.geometry = geo; return; }
    if (!geo) return;
    const m = new THREE.Mesh(geo, this.mat);
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    this.chunks[ci] = m;
  }

  // Which pen mark a block is drawn with: grass tufts, dirt dots, rock hatching, leaf scallops,
  // tile or plank lines, asphalt speckle, brick courses. 0 = clean flat ink.
  markOf(x: number, y: number, z: number, c: number) {
    const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, s = mx ? (mx - mn) / mx : 0;
    let h = 0;
    if (mx !== mn) h = mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    h *= 60;
    const o = this.own[this.idx(x, y, z)];
    const green = h > 55 && h < 170 && s > 0.25;
    const warm = h < 55 || h > 330;
    if (o === RUBBLE) return M.ROCK;
    if (o >= 2) {
      const k = this.buildings.get(o)?.kind;
      if (k === 'tree') return green ? M.LEAF : M.WOOD;
      if (k === 'wall') return M.WOOD;
      if ((k === 'house' || k === 'barracks') && warm && s > 0.45) return v > 0.6 && h > 15 && h < 40 ? M.BRICK : M.TILE;
      return M.NONE;
    }
    if (green) return M.GRASS;
    if (s < 0.12 && v < 0.36) return M.ASPHALT;
    if (s < 0.3 && v < 0.62 && v > 0.3) return M.ROCK;
    if (warm || (h >= 40 && h <= 60)) return M.DIRT;
    return M.NONE;
  }

  // Walk the grid along a ray; returns the first solid block hit.
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(1 / dx) : 1e9, tdy = dy ? Math.abs(1 / dy) : 1e9, tdz = dz ? Math.abs(1 / dz) : 1e9;
    let tx = dx ? ((sx > 0 ? x + 1 - ox : ox - x) * tdx) : 1e9;
    let ty = dy ? ((sy > 0 ? y + 1 - oy : oy - y) * tdy) : 1e9;
    let tz = dz ? ((sz > 0 ? z + 1 - oz : oz - z) * tdz) : 1e9;
    let t = 0, nx = 0, ny = 0, nz = 0;
    while (t <= maxDist) {
      if (y >= 0 && y < this.H && this.get(x, y, z)) return { x, y, z, t, nx, ny, nz };
      if (y < 0 && sy <= 0) return { x, y: 0, z, t, nx: 0, ny: 1, nz: 0 };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  // Blocks of a building that are no longer connected to the ground.
  unsupported(b: Building): [number, number, number][] {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
    if (sx <= 0) return [];
    const seen = new Uint8Array(sx * sy * sz);
    const L = (x: number, y: number, z: number) => ((y - y0) * sz + (z - z0)) * sx + (x - x0);
    const stack: number[] = [];
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const i = this.idx(x, y, z);
          if (this.own[i] !== b.id) continue;
          const below = y === 0 || (this.get(x, y - 1, z) && this.owner(x, y - 1, z) !== b.id);
          if (below) { seen[L(x, y, z)] = 1; stack.push(x, y, z); }
        }
    while (stack.length) {
      const z = stack.pop()!, y = stack.pop()!, x = stack.pop()!;
      for (const [dx, dy, dz] of N6) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < x0 || ny < y0 || nz < z0 || nx > x1 || ny > y1 || nz > z1) continue;
        const l = L(nx, ny, nz);
        if (seen[l] || this.own[this.idx(nx, ny, nz)] !== b.id || !this.col[this.idx(nx, ny, nz)]) continue;
        seen[l] = 1; stack.push(nx, ny, nz);
      }
    }
    const out: [number, number, number][] = [];
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const i = this.idx(x, y, z);
          if (this.own[i] === b.id && this.col[i] && !seen[L(x, y, z)]) out.push([x, y, z]);
        }
    return out;
  }

  blocksOf(b: Building): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (let y = b.min[1]; y <= b.max[1]; y++)
      for (let z = b.min[2]; z <= b.max[2]; z++)
        for (let x = b.min[0]; x <= b.max[0]; x++) {
          const i = this.idx(x, y, z);
          if (this.own[i] === b.id && this.col[i]) out.push([x, y, z]);
        }
    return out;
  }

  randomBlockOf(b: Building, maxY = 1): [number, number, number] | null {
    const yTop = b.min[1] + Math.max(1, Math.floor((b.max[1] - b.min[1]) * maxY));
    for (let t = 0; t < 60; t++) {
      const x = b.min[0] + Math.floor(Math.random() * (b.max[0] - b.min[0] + 1));
      const y = b.min[1] + Math.floor(Math.random() * (yTop - b.min[1] + 1));
      const z = b.min[2] + Math.floor(Math.random() * (b.max[2] - b.min[2] + 1));
      if (this.owner(x, y, z) === b.id && this.get(x, y, z)) return [x, y, z];
    }
    const all = this.blocksOf(b);
    return all.length ? all[(Math.random() * all.length) | 0] : null;
  }

  // Distance from a point to a building's box, on the ground plane.
  distTo(b: Building, x: number, z: number) {
    const dx = Math.max(b.min[0] - x, 0, x - (b.max[0] + 1));
    const dz = Math.max(b.min[2] - z, 0, z - (b.max[2] + 1));
    return Math.hypot(dx, dz);
  }
}

const N6: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
