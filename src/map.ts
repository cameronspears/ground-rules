// The test battlefield: rolling grass, a road, woods, and an enemy compound to flatten.
import { World, Building } from './world';
import { hash3, mix, shade } from './voxel';

const ENEMY = 0xe8412c, ENEMY_D = 0x9c2418, CREAM = 0xf1e6cc, CONC = 0xd8cfbd, CONC_D = 0xa89e8e, GLASS = 0x2a3a5c, GLASS_L = 0x5f86b8;
const GOLD = 0xffc93c, CHAR = 0x34343c;

function noise(x: number, z: number, s: number, seed: number) {
  const fx = x / s, fz = z / s, ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const u = tx * tx * (3 - 2 * tx), v = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number) => hash3(a, seed, b);
  return (h(ix, iz) * (1 - u) + h(ix + 1, iz) * u) * (1 - v) + (h(ix, iz + 1) * (1 - u) + h(ix + 1, iz + 1) * u) * v;
}

export interface MapData { world: World; spawn: [number, number]; }

export function buildTestMap(): MapData {
  const W = 112, D = 112, H = 44;
  const w = new World(W, D, H);
  const road = (x: number, z: number) => {
    const t = Math.max(0, Math.min(1, ((x - 18) * 1 + (z - 18) * 1) / (2 * 64)));
    const px = 18 + 64 * t + Math.sin(t * 5) * 6, pz = 18 + 64 * t - Math.sin(t * 5) * 6;
    return Math.hypot(x - px, z - pz);
  };
  // terrain
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      let h = 5 + noise(x, z, 22, 1) * 4 + noise(x, z, 9, 2) * 1.5;
      const dBase = Math.hypot(x - 80, z - 78), dSpawn = Math.hypot(x - 24, z - 24);
      if (dBase < 30) h = h + (6.5 - h) * Math.min(1, (30 - dBase) / 8);
      if (dSpawn < 16) h = h + (6 - h) * Math.min(1, (16 - dSpawn) / 6);
      const rd = road(x, z);
      h = Math.floor(h);
      for (let y = 0; y < h; y++) {
        let c: number;
        const depth = h - 1 - y;
        if (y === 0) c = 0x4a4048;
        else if (depth === 0) {
          if (rd < 2.4) c = mix(0xb9a37a, 0xa08a62, hash3(x, 9, z));
          else if (rd < 3.4) c = 0x96b858;
          else {
            const p = noise(x, z, 7, 5);
            c = mix(0x6fc24f, 0x9bd65a, p);
            const r = hash3(x, 3, z);
            if (r < 0.012) c = 0xfff3a0; else if (r < 0.02) c = 0xffffff; else if (r < 0.024) c = 0xff8fb0;
          }
        } else if (depth < 3) c = mix(0x9a7048, 0x845e3c, hash3(x, y, z));
        else c = mix(0x8a8478, 0x6e695f, hash3(x, y, z));
        w.set(x, y, z, c);
      }
    }
  const g = (x: number, z: number) => w.heightAt(x, z);

  // ---- Enemy headquarters: a hollow office tower with a giant poster emblem ----
  const hq = w.addBuilding({ team: 2, kind: 'hq', name: 'Ministry Tower', target: true, threshold: 0.42 });
  const hx = 74, hz = 76, hw = 16, hd = 14, hh = 20, hy = g(hx + 8, hz + 7);
  for (let x = hx; x < hx + hw; x++) for (let z = hz; z < hz + hd; z++) for (let y = hy - 2; y < hy; y++) if (!w.get(x, y, z)) w.set(x, y, z, CONC_D, hq.id);
  for (let y = 0; y < hh; y++)
    for (let x = hx; x < hx + hw; x++)
      for (let z = hz; z < hz + hd; z++) {
        const edgeX = x === hx || x === hx + hw - 1, edgeZ = z === hz || z === hz + hd - 1;
        const floor = y % 5 === 0;
        if (!(edgeX || edgeZ || floor)) continue;
        let c = CONC;
        if (edgeX && edgeZ) c = CONC_D;
        else if (!floor && (edgeX || edgeZ)) {
          const along = edgeX ? z - hz : x - hx;
          const fy = y % 5;
          if ((fy === 2 || fy === 3) && along % 3 !== 0) c = fy === 3 ? GLASS_L : GLASS;
          if (fy === 4) c = CREAM;
        }
        if (y === hh - 1 || (floor && (edgeX || edgeZ) && y > 0)) c = ENEMY;
        if (y === 0 && z === hz && x >= hx + 6 && x <= hx + 9) continue; // doorway
        if ((y === 1 || y === 2) && z === hz && x >= hx + 6 && x <= hx + 9) continue;
        w.set(x, hy + y, z, c, hq.id);
      }
  // parapet + antenna
  for (let x = hx; x < hx + hw; x++) for (let z = hz; z < hz + hd; z++)
    if ((x === hx || x === hx + hw - 1 || z === hz || z === hz + hd - 1) && (x + z) % 2 === 0) w.set(x, hy + hh, z, ENEMY_D, hq.id);
  for (let y = 0; y < 9; y++) w.set(hx + 12, hy + hh + y, hz + 10, y === 8 ? 0xff3030 : CHAR, hq.id);
  w.set(hx + 11, hy + hh + 5, hz + 10, CHAR, hq.id); w.set(hx + 13, hy + hh + 5, hz + 10, CHAR, hq.id);
  // poster on the south face (facing the player): sunburst star on a red field
  const pcx = hx + 7.5, pcy = hy + 12;
  for (let x = hx + 2; x <= hx + 13; x++)
    for (let y = hy + 6; y <= hy + 18; y++) {
      const dx = x - pcx, dy = y - pcy;
      const a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
      const star = r < 2.2 + 2.4 * Math.max(0, Math.cos(a * 5 - Math.PI / 2)) ** 3;
      const ray = Math.floor((a + Math.PI) / (Math.PI / 8)) % 2 === 0;
      let c = r < 5.6 ? (star ? GOLD : ENEMY) : ray ? CREAM : 0xf6d9a8;
      if (y === hy + 6 || y === hy + 18) c = ENEMY_D;
      w.set(x, y, hz - 1, c, hq.id);
    }

  // ---- Barracks: low hall with a stepped red roof ----
  const bk = w.addBuilding({ team: 2, kind: 'barracks', name: 'Volunteer Hall', target: true, threshold: 0.4 });
  const bx = 56, bz = 86, bw = 13, bd = 9, by = g(bx + 6, bz + 4);
  for (let x = bx; x < bx + bw; x++) for (let z = bz; z < bz + bd; z++) {
    for (let y = by - 2; y < by; y++) if (!w.get(x, y, z)) w.set(x, y, z, CONC_D, bk.id);
    for (let y = 0; y < 6; y++) {
      const edge = x === bx || x === bx + bw - 1 || z === bz || z === bz + bd - 1;
      if (!edge && y > 0) continue;
      let c = y === 5 ? CREAM : 0xc9b48a;
      if ((y === 2 || y === 3) && edge && (x + z) % 4 === 1) c = GLASS;
      if (y < 4 && z === bz && x >= bx + 5 && x <= bx + 7 && y > 0) continue;
      w.set(x, by + y, z, c, bk.id);
    }
    const roofH = Math.min(z - bz, bz + bd - 1 - z);
    for (let y = 0; y <= roofH; y++) w.set(x, by + 6 + y, z, y === roofH ? ENEMY_D : (x % 2 ? ENEMY : 0xd8392a), bk.id);
  }

  // ---- Fuel silo: striped cylinder ----
  const silo = w.addBuilding({ team: 2, kind: 'silo', name: 'Fuel Silo', target: true, threshold: 0.45 });
  const sx = 92, sz = 56, sy = g(sx, sz);
  for (let y = 0; y < 15; y++)
    for (let x = sx - 4; x <= sx + 4; x++)
      for (let z = sz - 4; z <= sz + 4; z++) {
        const r = Math.hypot(x - sx, z - sz);
        const top = y === 14;
        if (r > 4.3 || (!top && r < 3.2 && y > 0)) continue;
        const c = top ? CONC_D : Math.floor(y / 3) % 2 ? ENEMY : CREAM;
        w.set(x, sy + y, z, c, silo.id);
      }

  // ---- Gun turrets ----
  const turrets: Building[] = [];
  for (const [tx, tz] of [[62, 66], [80, 58], [66, 100]] as [number, number][]) {
    const t = w.addBuilding({ team: 2, kind: 'turret', name: 'Gun Emplacement', target: true, threshold: 0.55 });
    const ty = g(tx, tz);
    for (let x = tx - 2; x <= tx + 2; x++) for (let z = tz - 2; z <= tz + 2; z++)
      for (let y = 0; y < 4; y++) {
        const c = y === 3 ? CHAR : (x + y + z) % 3 === 0 ? CONC_D : CONC;
        w.set(x, ty + y, z, c, t.id);
      }
    turrets.push(t);
  }

  // ---- Sandbag walls (tanks can drive straight through) ----
  const sandbags = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    const b = w.addBuilding({ team: 0, kind: 'wall', name: 'Sandbags', crushable: true, threshold: 0 });
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), z = Math.round(z0 + ((z1 - z0) * i) / n);
      const y = g(x, z);
      const c = mix(0xd6bf86, 0xb59f68, hash3(x, 1, z));
      w.set(x, y, z, c, b.id); w.set(x, y + 1, z, shade(c, 1.06), b.id);
    }
  };
  sandbags(54, 60, 72, 56); sandbags(72, 56, 86, 50); sandbags(50, 64, 50, 80); sandbags(52, 82, 52, 96);
  sandbags(40, 40, 46, 36); sandbags(30, 46, 38, 44);

  // ---- Trees (crushable, and they fall when shot) ----
  const isClear = (x: number, z: number) =>
    Math.hypot(x - 80, z - 78) > 32 && Math.hypot(x - 24, z - 24) > 15 && road(x, z) > 5 && x > 3 && z > 3 && x < W - 4 && z < D - 4;
  let placed = 0;
  for (let i = 0; i < 400 && placed < 60; i++) {
    const x = 4 + Math.floor(hash3(i, 7, 1) * (W - 8)), z = 4 + Math.floor(hash3(i, 8, 2) * (D - 8));
    if (!isClear(x, z) || noise(x, z, 14, 9) < 0.45) continue;
    let ok = true;
    for (const b of w.buildings.values()) if (b.kind === 'tree' && Math.hypot((b.min[0] + b.max[0]) / 2 - x, (b.min[2] + b.max[2]) / 2 - z) < 5) ok = false;
    if (!ok) continue;
    tree(w, x, z, hash3(i, 1, 1));
    placed++;
  }
  // rocks
  for (let i = 0; i < 14; i++) {
    const x = 6 + Math.floor(hash3(i, 11, 3) * (W - 12)), z = 6 + Math.floor(hash3(i, 12, 4) * (D - 12));
    if (!isClear(x, z)) continue;
    const y0 = g(x, z), r = 1.2 + hash3(i, 2, 2) * 1.6;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy < 3; dy++)
      if (Math.hypot(dx, dy * 1.4, dz) < r) w.set(x + dx, y0 + dy - 1, z + dz, mix(0x9a978f, 0x7d7a73, hash3(x + dx, dy, z + dz)));
  }
  return { world: w, spawn: [24, 24] };
}

function tree(w: World, x: number, z: number, r: number) {
  const b = w.addBuilding({ team: 0, kind: 'tree', name: 'Tree', crushable: true, threshold: 0.5 });
  const y0 = w.heightAt(x, z), th = 3 + Math.floor(r * 3);
  for (let y = 0; y < th; y++) w.set(x, y0 + y, z, 0x7a5232, b.id);
  const cr = 2 + r * 1.2, cy = y0 + th + 1;
  const leaf = r > 0.5 ? [0x3f9e45, 0x5cbf4f] : [0x2f8a4a, 0x4aa857];
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -2; dy <= 3; dy++) {
    const d = Math.hypot(dx, dy * 1.15, dz);
    if (d > cr || hash3(x + dx, cy + dy, z + dz) < (d > cr - 0.8 ? 0.35 : 0)) continue;
    w.set(x + dx, cy + dy, z + dz, mix(leaf[0], leaf[1], (dy + 2) / 5), b.id);
  }
}
