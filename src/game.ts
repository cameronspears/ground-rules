// The battle itself: scene, units, weapons, destruction and player orders.
import * as THREE from 'three';
import { World, Building, RUBBLE } from './world';
import { buildProofMap, W as MAP_W, D as MAP_D } from './map';
import { Debris } from './debris';
import { Fx } from './fx';
import { audio } from './audio';
import { PixelCamera } from './camera';
import { findPath, passable } from './path';
import { MODELS, geometryFor, teamColors, turretGun, UNIT_SCALE } from './models';
import { mix, shade } from './voxel';
import { Hud } from './hud';
import { rampify, BLIT } from './shade';

const PLAYER = 0x3a8ad6, ENEMY = 0xd23a26;
const PLAYER_COLORS = teamColors(PLAYER), ENEMY_COLORS = teamColors(ENEMY);

interface UnitDef {
  name: string; hp: number; speed: number; turn: number; range: number; minRange: number; reload: number;
  weapon: 'shell' | 'rifle' | 'mortar'; radius: number; vehicle: boolean; crush: boolean; height: number; muzzle: number; turretTurn: number;
  barks: { select: string[]; move: string[]; attack: string[]; die: string[] };
}

const DEFS: Record<string, UnitDef> = {
  tank: {
    name: 'Battle Tank', hp: 320, speed: 15, turn: 2.4, range: 44, minRange: 0, reload: 2.3, weapon: 'shell', radius: 4.6, vehicle: true, crush: true, height: 5.5, muzzle: 10, turretTurn: 2.6,
    barks: {
      select: ['Armour\'s warm.', 'Point me at something.', 'Smile for the brochure.', 'Full tank. Of tank.'],
      move: ['Rolling.', 'Treads turning.', 'Mind the paint.', 'Out of my way, scenery.'],
      attack: ['Demolition is urban planning.', 'Firing for a brighter tomorrow!', 'That building looks load-bearing.', 'Knock knock.'],
      die: ['Tank down!'],
    },
  },
  rifle: {
    name: 'Rifleman', hp: 70, speed: 9.6, turn: 12, range: 30, minRange: 0, reload: 1.1, weapon: 'rifle', radius: 1.4, vehicle: false, crush: false, height: 4, muzzle: 2.5, turretTurn: 12,
    barks: {
      select: ['Reporting, mostly intact.', 'Yes, Commander?', 'Ready and expendable!', 'I read the pamphlet!'],
      move: ['On it.', 'Moving, moving!', 'Hup hup.', 'Right behind the tanks. Way behind.'],
      attack: ['For the poster!', 'Light \'em up!', 'Aim small, miss small!', 'Brick by brick!'],
      die: ['Man down!'],
    },
  },
};

let nextUnitId = 1;
export class Unit {
  id = nextUnitId++;
  def: UnitDef;
  hp: number;
  y = 0; heading = 0; tHead = 0; pitch = 0; roll = 0;
  path: [number, number][] = [];
  order: 'idle' | 'move' | 'attack' | 'amove' = 'idle';
  goal: [number, number] | null = null;
  target: Building | null = null;
  cooldown = Math.random();
  repath = 0; stuck = 0; bob = Math.random() * 10; moving = false;
  obj = new THREE.Group(); tilt = new THREE.Group(); turret?: THREE.Object3D; ring: THREE.Mesh;
  selected = false; dead = false; hitFlash = 0;
  constructor(public type: string, public team: number, public x: number, public z: number) {
    this.def = DEFS[type];
    this.hp = this.def.hp;
  }
}

interface Proj { x: number; y: number; z: number; vx: number; vy: number; vz: number; team: number; kind: 'shell' | 'mortar'; dmg: number; r: number; life: number; whistled?: boolean }

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam: PixelCamera;
  world: World;
  debris: Debris;
  fx: Fx;
  hud: Hud;
  sun: THREE.DirectionalLight;
  units: Unit[] = [];
  projs: Proj[] = [];
  later: { t: number; fn: () => void }[] = [];
  groups: Unit[][] = [];
  spawn: [number, number];
  attackMode = false;
  stats = { time: 0, blocks: 0, lost: 0 };
  over = false;
  started = false;
  mouse = { x: 0, y: 0, down: false, sx: 0, sy: 0, mid: false, drag: false, lastClick: 0 };
  hover: Building | null = null;
  private barkCool = 0;
  private v = new THREE.Vector3();

  constructor(private container: HTMLElement) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(devicePixelRatio);
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(r.domElement);
    this.hud = new Hud();
    this.fx = new Fx(this.scene);
    this.setupScene();
    this.cam = new PixelCamera({ w: MAP_W, d: MAP_D });
    this.load();
    this.bindInput();
    addEventListener('resize', () => this.resize());
    this.resize();
    (window as any).game = this;
  }

  setupScene() {
    const s = this.scene;
    s.background = new THREE.Color(0x0d0c0b);
    s.add(new THREE.HemisphereLight(0xc9d8e8, 0x6a5a44, 1.1));
    const sun = (this.sun = new THREE.DirectionalLight(0xffe6c4, 3.0));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.near = 10; sc.far = 900;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    s.add(sun, sun.target);
    // dark, unexplored land around the map
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0d0c0b }));
    edge.position.set(MAP_W / 2, 0.5, MAP_D / 2);
    s.add(edge);
  }

  load() {
    const { world, spawn } = buildProofMap();
    this.world = world;
    this.spawn = spawn;
    world.rebuildAll();
    this.scene.add(world.group);
    this.debris = new Debris(this.scene, world);
    this.debris.onLand = (x, y, z) => audio.clatter(x, z);
    this.cam.snap(spawn[0] + 50, spawn[1] - 50);
    const [sx, sz] = spawn;
    for (let i = 0; i < 3; i++) this.addUnit('tank', 1, sx + i * 13 - 6, sz - 6);
    for (let i = 0; i < 6; i++) this.addUnit('rifle', 1, sx - 8 + (i % 3) * 4, sz + 8 + Math.floor(i / 3) * 4);
    for (const b of world.buildings.values()) if (b.kind === 'turret') this.addGun(b);
    this.hud.objectives(this.targets());
  }

  restart() {
    for (const u of this.units) this.scene.remove(u.obj, u.ring);
    for (const b of this.world.buildings.values()) if (b.gun) this.scene.remove(b.gun.obj);
    this.scene.remove(this.world.group, this.debris.mesh);
    for (const m of this.world.chunks) m?.geometry.dispose();
    this.units = []; this.projs = []; this.later = []; this.groups = [];
    this.stats = { time: 0, blocks: 0, lost: 0 }; this.over = false;
    this.load();
  }

  targets() { return [...this.world.buildings.values()].filter((b) => b.target); }

  addUnit(type: string, team: number, x: number, z: number) {
    const u = new Unit(type, team, x, z);
    const g = geometryFor(type, team === 1 ? PLAYER_COLORS : ENEMY_COLORS);
    const mat = rampify(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const body = new THREE.Mesh(g.body, mat);
    body.castShadow = true;
    u.tilt.add(body);
    const d = MODELS[type];
    if (g.turret) {
      const t = new THREE.Mesh(g.turret, mat);
      t.castShadow = true;
      const at = d.turretAt!;
      t.position.set((at[0] - d.bodyPivot[0]) * UNIT_SCALE, (at[1] - d.bodyPivot[1]) * UNIT_SCALE, (at[2] - d.bodyPivot[2]) * UNIT_SCALE);
      u.tilt.add(t);
      u.turret = t;
    }
    u.obj.add(u.tilt);
    u.heading = u.tHead = Math.PI / 4;
    u.y = this.world.groundAt(x, z, u.def.crush);
    this.scene.add(u.obj);
    const rr = u.def.radius + 0.35;
    u.ring = new THREE.Mesh(new THREE.RingGeometry(rr - 0.18, rr, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8dffb0, transparent: true, opacity: 0.95, depthWrite: false }));
    u.ring.visible = false;
    u.ring.renderOrder = 4;
    this.scene.add(u.ring);
    this.units.push(u);
    return u;
  }

  addGun(b: Building) {
    const vb = turretGun();
    const geo = vb.geometry(ENEMY_COLORS, [4.5, 0, 4.5]);
    const obj = new THREE.Group();
    const barrel = new THREE.Mesh(geo, rampify(new THREE.MeshLambertMaterial({ vertexColors: true })));
    barrel.castShadow = true;
    obj.add(barrel);
    const cx = (b.min[0] + b.max[0] + 1) / 2, cz = (b.min[2] + b.max[2] + 1) / 2;
    obj.position.set(cx, b.max[1] + 1, cz);
    this.scene.add(obj);
    b.gun = { obj, barrel, cooldown: 1 + Math.random(), heading: Math.PI * 1.25, y: b.max[1] + 1 };
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.cam.resize(size.x, size.y);
  }

  // ---------------------------------------------------------------- destruction
  explode(x: number, y: number, z: number, r: number, dmg: number, team: number) {
    const w = this.world;
    const affected = new Set<number>();
    const R = Math.ceil(r + 1);
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    const removed: [number, number, number, number, number][] = [];
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const bx = cx + dx, by = cy + dy, bz = cz + dz;
          if (by <= 0) continue;
          const c = w.get(bx, by, bz);
          if (!c) continue;
          const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
          const own = w.owner(bx, by, bz);
          const rr = own === 0 ? r * 0.72 : r;
          if (d > rr + Math.random() * 1.2) {
            if (d < r + 3 && Math.random() < 0.75) {
              const i = w.idx(bx, by, bz);
              w.col[i] = mix(c, 0x2b2420, 0.35 + Math.random() * 0.25) ;
              w.touch(bx, bz);
            }
            continue;
          }
          if (own >= 2) { affected.add(own); this.stats.blocks++; }
          removed.push([bx, by, bz, c, own]);
          w.remove(bx, by, bz);
        }
    const p = Math.min(1, 160 / Math.max(1, removed.length));
    for (const [bx, by, bz, c, own] of removed) {
      if (Math.random() > p) continue;
      const ox = bx + 0.5 - x, oy = by + 0.5 - y, oz = bz + 0.5 - z;
      const l = Math.hypot(ox, oy, oz) || 1;
      const sp = (4 + Math.random() * 8) * (r / 4);
      this.debris.spawn(bx + 0.5, by + 0.5, bz + 0.5, (ox / l) * sp, Math.abs(oy / l) * sp + 8 + Math.random() * 10, (oz / l) * sp,
        c, own === 0 ? 0.6 + Math.random() * 0.3 : 0.7 + Math.random() * 0.4, false);
    }
    for (const id of affected) this.checkBuilding(w.buildings.get(id)!);
    for (const u of this.units) {
      if (u.dead || u.team === team) continue;
      const d = Math.hypot(u.x - x, u.y + 1 - y, u.z - z);
      if (d < r * 1.8) this.damage(u, dmg * (1 - d / (r * 1.8)));
    }
    this.fx.explosion(x, y, z, r);
    audio.explosion(x, z, r);
    this.shake(r * 0.18, x, z);
  }

  shake(amt: number, x: number, z: number) {
    const d = Math.hypot(x - this.cam.target.x, z - this.cam.target.z);
    this.cam.shake = Math.min(1.6, this.cam.shake + amt / (1 + d / 80));
  }

  checkBuilding(b: Building) {
    if (b.destroyed) return;
    const w = this.world;
    const loose = w.unsupported(b);
    for (const [x, y, z] of loose) {
      const c = w.get(x, y, z);
      w.remove(x, y, z);
      this.stats.blocks++;
      if (loose.length < 900 || Math.random() < 900 / loose.length)
        this.debris.spawn(x + 0.5, y + 0.5, z + 0.5, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, c, 1, Math.random() < 0.35);
    }
    if (b.total && b.alive / b.total < b.threshold) this.collapse(b);
  }

  collapse(b: Building) {
    const w = this.world;
    b.destroyed = true;
    const blocks = w.blocksOf(b);
    const cx = (b.min[0] + b.max[0] + 1) / 2, cz = (b.min[2] + b.max[2] + 1) / 2, base = b.min[1];
    const big = b.target;
    const p = Math.min(1, 5000 / Math.max(1, blocks.length));
    for (const [x, y, z] of blocks) {
      const c = w.get(x, y, z);
      w.remove(x, y, z);
      this.stats.blocks++;
      if (Math.random() > p) continue;
      // the building drops into its own footprint, spreading only a little
      const ox = x + 0.5 - cx, oz = z + 0.5 - cz;
      const k = 0.08 + Math.random() * 0.1;
      this.debris.spawn(x + 0.5, y + 0.5, z + 0.5, ox * k + (Math.random() - 0.5) * 2, -Math.random() * 4, oz * k + (Math.random() - 0.5) * 2, c, 1, Math.random() < 0.6);
    }
    if (b.gun) {
      const g = b.gun;
      this.scene.remove(g.obj);
      const vb = turretGun();
      vb.each((x, y, z, c) => {
        if (x % 2 || y % 2 || z % 2) return;
        const col = c < 8 ? ENEMY_COLORS[c - 1] : c;
        this.debris.spawn(g.obj.position.x + (x - 4.5) * UNIT_SCALE, g.y + y * UNIT_SCALE, g.obj.position.z + (z - 4.5) * UNIT_SCALE,
          (Math.random() - 0.5) * 14, 8 + Math.random() * 10, (Math.random() - 0.5) * 14, col, 0.5);
      });
      b.gun = undefined;
    }
    if (b.kind === 'tree') { audio.crunch(cx, cz); this.fx.dust(cx, base + 2, cz, 6, 3, 0x6f8a44); return; }
    if (!big) return;
    const span = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    this.fx.dust(cx, base + 2, cz, 50, span * 0.3);
    audio.collapse(cx, cz);
    this.shake(1.2, cx, cz);
    const booms = b.kind === 'hq' ? 5 : b.kind === 'silo' ? 4 : 2;
    for (let i = 0; i < booms; i++) {
      this.later.push({ t: 0.15 + i * 0.35 + Math.random() * 0.2, fn: () => {
        const bx = b.min[0] + Math.random() * (b.max[0] - b.min[0]), bz = b.min[2] + Math.random() * (b.max[2] - b.min[2]);
        this.explode(bx, w.heightAt(bx, bz) + 1, bz, b.kind === 'silo' ? 6.4 : 4.4, 30, b.team);
      } });
    }
    if (b.kind === 'silo') { this.fx.explosion(cx, base + 14, cz, 12); this.fx.column(cx, base + 10, cz, 10); }
    this.fx.column(cx, base + 4, cz, span * 0.3);
    this.fx.burn(cx, base + 3, cz, span * 0.15, 25);
    this.hud.objectives(this.targets());
    if (this.targets().every((t) => t.destroyed) && !this.over) {
      this.over = true;
      this.later.push({ t: 3.2, fn: () => { audio.fanfare(); this.hud.victory(this.stats, () => this.restart()); } });
    }
  }

  damage(u: Unit, amt: number) {
    if (u.dead) return;
    u.hp -= amt;
    u.hitFlash = 0.15;
    if (u.hp <= 0) this.kill(u);
  }

  kill(u: Unit) {
    u.dead = true;
    const sel = u.selected;
    u.selected = false;
    this.scene.remove(u.obj, u.ring);
    if (u.team === 1) this.stats.lost++;
    const d = MODELS[u.type];
    const cols = u.team === 1 ? PLAYER_COLORS : ENEMY_COLORS;
    const m = new THREE.Matrix4().makeRotationY(-u.heading);
    const spawnPart = (vb: typeof d.body, pivot: number[], offset: number[]) => {
      vb.each((x, y, z, c) => {
        if (u.def.vehicle ? x % 2 || y % 2 || z % 2 : Math.random() < 0.5) return;
        const col = c < 8 ? cols[c - 1] : c;
        this.v.set((x - pivot[0]) * UNIT_SCALE + offset[0], (y - pivot[1]) * UNIT_SCALE + offset[1], (z - pivot[2]) * UNIT_SCALE + offset[2]).applyMatrix4(m);
        const vx = this.v.x, vz = this.v.z;
        this.debris.spawn(u.x + vx, u.y + this.v.y, u.z + vz, vx * 3 + (Math.random() - 0.5) * 10, 8 + Math.random() * 14, vz * 3 + (Math.random() - 0.5) * 10,
          col, u.def.vehicle ? UNIT_SCALE * 2 : UNIT_SCALE);
      });
    };
    spawnPart(d.body, d.bodyPivot, [0, 0, 0]);
    if (d.turret) {
      const at = d.turretAt!;
      spawnPart(d.turret, d.turretPivot!, [(at[0] - d.bodyPivot[0]) * UNIT_SCALE, (at[1] - d.bodyPivot[1]) * UNIT_SCALE, (at[2] - d.bodyPivot[2]) * UNIT_SCALE]);
    }
    if (u.def.vehicle) {
      this.fx.explosion(u.x, u.y + 2, u.z, 4.4);
      this.fx.column(u.x, u.y + 2, u.z, 3);
      this.fx.burn(u.x, u.y + 2, u.z, 2, 14);
      audio.explosion(u.x, u.z, 2.5);
      this.shake(0.5, u.x, u.z);
      // the wreck stays as scrap
      for (let i = 0; i < 28; i++) {
        const wx = Math.floor(u.x + (Math.random() - 0.5) * 6), wz = Math.floor(u.z + (Math.random() - 0.5) * 6);
        this.world.set(wx, this.world.heightAt(wx, wz), wz, Math.random() < 0.4 ? shade(cols[1], 0.6) : 0x3a3b40, RUBBLE);
      }
    } else {
      this.fx.sparks(u.x, u.y + 2, u.z, 6);
      this.fx.dust(u.x, u.y + 1, u.z, 3, 1.6);
    }
    if (u.team === 1 && sel) this.say(u, 'die', true);
  }

  // ---------------------------------------------------------------- weapons
  fire(u: Unit, aim: [number, number, number]) {
    const d = u.def;
    const ax = aim[0] + 0.5, ay = aim[1] + 0.5, az = aim[2] + 0.5;
    const h = u.tHead;
    const mx = u.x + Math.cos(h) * d.muzzle, mz = u.z + Math.sin(h) * d.muzzle, my = u.y + d.height;
    const dx = ax - mx, dy = ay - my, dz = az - mz, dist = Math.hypot(dx, dy, dz);
    if (d.weapon === 'shell') {
      const sp = 150;
      this.projs.push({ x: mx, y: my, z: mz, vx: (dx / dist) * sp, vy: (dy / dist) * sp, vz: (dz / dist) * sp, team: u.team, kind: 'shell', dmg: 60, r: 4.2, life: 1.5 });
      this.fx.muzzle(mx, my, mz, Math.cos(h), Math.sin(h), true);
      audio.cannon(mx, mz);
      if (u.turret) u.turret.position.x -= 0.7; // recoil
    } else if (d.weapon === 'mortar') {
      const T = Math.max(1.3, Math.min(2.6, dist / 36)), g = 52;
      this.projs.push({ x: mx, y: my + 2, z: mz, vx: dx / T, vy: (dy - 2 + 0.5 * g * T * T) / T, vz: dz / T, team: u.team, kind: 'mortar', dmg: 70, r: 6.4, life: T + 2 });
      this.fx.muzzle(mx, my + 3, mz, 0, 0, true);
      audio.mortar(mx, mz);
    } else {
      const spread = 0.05;
      const ux = dx / dist + (Math.random() - 0.5) * spread, uy = dy / dist + (Math.random() - 0.5) * spread, uz = dz / dist + (Math.random() - 0.5) * spread;
      const hit = this.world.raycast(mx, my, mz, ux, uy, uz, d.range * 1.6);
      const end = hit ? new THREE.Vector3(mx + ux * hit.t, my + uy * hit.t, mz + uz * hit.t) : new THREE.Vector3(mx + ux * d.range, my + uy * d.range, mz + uz * d.range);
      this.fx.tracer(new THREE.Vector3(mx, my, mz), end, 0xffe8a0, 0.09);
      this.fx.muzzle(mx, my, mz, Math.cos(h), Math.sin(h), false);
      audio.rifle(mx, mz);
      if (hit) this.chip(hit.x, hit.y, hit.z, end);
    }
  }

  chip(x: number, y: number, z: number, at: THREE.Vector3) {
    const w = this.world;
    const own = w.owner(x, y, z), c = w.get(x, y, z);
    this.fx.sparks(at.x, at.y, at.z, 3);
    audio.ricochet(at.x, at.z);
    if (y <= 0 || Math.random() > (own >= 2 ? 0.8 : 0.2)) return;
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]]) {
      if ((dx || dy || dz) && Math.random() < 0.6) continue;
      if (w.owner(x + dx, y + dy, z + dz) !== own || y + dy <= 0 || !w.get(x + dx, y + dy, z + dz)) continue;
      w.remove(x + dx, y + dy, z + dz);
      if (own >= 2) this.stats.blocks++;
    }
    this.fx.dust(at.x, at.y, at.z, 1, 1, c);
    this.debris.spawn(x + 0.5, y + 0.5, z + 0.5, (Math.random() - 0.5) * 10, 6 + Math.random() * 6, (Math.random() - 0.5) * 10, c, 0.6);
    if (own >= 2) this.checkBuilding(w.buildings.get(own)!);
  }

  updateProjectiles(dt: number) {
    const w = this.world;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      if (p.kind === 'mortar') {
        p.vy -= 52 * dt;
        if (!p.whistled && p.vy < 0) { p.whistled = true; audio.whistle(p.x, p.z, 0.9); }
      }
      const sx = p.vx * dt, sy = p.vy * dt, sz = p.vz * dt, len = Math.hypot(sx, sy, sz);
      const hit = w.raycast(p.x, p.y, p.z, sx / len, sy / len, sz / len, len);
      let boom: [number, number, number] | null = null;
      if (hit) boom = [p.x + (sx / len) * Math.max(0, hit.t - 0.1), p.y + (sy / len) * Math.max(0, hit.t - 0.1), p.z + (sz / len) * Math.max(0, hit.t - 0.1)];
      const nx = p.x + sx, ny = p.y + sy, nz = p.z + sz;
      if (!boom) for (const u of this.units) {
        if (u.dead || u.team === p.team) continue;
        if (Math.hypot(u.x - nx, u.y + u.def.height * 0.5 - ny, u.z - nz) < u.def.radius + 0.5) { boom = [nx, ny, nz]; break; }
      }
      const ox = p.x, oy = p.y, oz = p.z;
      p.x = nx; p.y = ny; p.z = nz;
      if (boom) {
        this.projs.splice(i, 1);
        this.explode(boom[0], boom[1], boom[2], p.r, p.dmg, p.team);
        continue;
      }
      if (p.life <= 0 || ny < 0) { this.projs.splice(i, 1); continue; }
      this.fx.tracer(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(nx, ny, nz), p.team === 1 ? 0xfff0a0 : 0xffa080, 0.06);
      this.fx.trail(nx, ny, nz, p.kind === 'mortar');
    }
  }

  // ---------------------------------------------------------------- units
  say(u: Unit, kind: 'select' | 'move' | 'attack' | 'die', force = false) {
    if (!force && this.barkCool > 0) return;
    this.barkCool = 2.2;
    const lines = u.def.barks[kind];
    this.hud.say(u.def.name, lines[(Math.random() * lines.length) | 0]);
    audio.radio();
  }

  updateUnit(u: Unit, dt: number) {
    const d = u.def, w = this.world;
    u.cooldown -= dt;
    u.hitFlash = Math.max(0, u.hitFlash - dt);
    if (u.target?.destroyed) {
      u.target = null;
      if (u.order === 'attack') { u.order = 'idle'; u.path = []; }
    }
    // pick targets on our own when idle or attack-moving
    if (!u.target && (u.order === 'idle' || u.order === 'amove')) {
      let best: Building | null = null, bd = d.range + (u.order === 'amove' ? 4 : 0);
      for (const b of w.buildings.values()) {
        if (b.team === 0 || b.team === u.team || b.destroyed) continue;
        let dist = w.distTo(b, u.x, u.z);
        if (b.kind === 'turret') dist -= 6;
        if (dist < bd && dist >= d.minRange) { bd = dist; best = b; }
      }
      if (best) u.target = best;
    }
    let wantMove = false;
    let face: number | null = null;
    if (u.target) {
      const b = u.target;
      const dist = w.distTo(b, u.x, u.z);
      const cx = (b.min[0] + b.max[0] + 1) / 2, cz = (b.min[2] + b.max[2] + 1) / 2;
      if (dist > d.range) {
        if (u.order === 'attack' || u.order === 'amove') {
          if (!u.path.length && u.repath <= 0) {
            // head for a spot within range on our side of the building, not its middle (which can't be reached)
            const half = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2;
            const a = Math.atan2(u.z - cz, u.x - cx), k = half + d.range * 0.7;
            if (this.route(u, cx + Math.cos(a) * k, cz + Math.sin(a) * k)) u.repath = 1.5;
          }
          wantMove = true;
        } else u.target = null;
      } else if (dist < d.minRange) {
        u.target = null;
      } else {
        u.path = [];
        face = Math.atan2(cz - u.z, cx - u.x);
        const diff = angDiff(u.tHead, face);
        if (u.cooldown <= 0 && Math.abs(diff) < 0.12) {
          const aim = w.randomBlockOf(b, d.weapon === 'shell' ? 0.6 : 1);
          if (aim) {
            const ah = Math.atan2(aim[2] + 0.5 - u.z, aim[0] + 0.5 - u.x);
            u.tHead = ah;
            this.fire(u, aim);
            u.cooldown = d.reload * (0.9 + Math.random() * 0.2);
          }
        }
      }
    } else if (u.order === 'move' || u.order === 'amove') {
      wantMove = true;
      if (!u.path.length) {
        if (u.goal && Math.hypot(u.goal[0] - u.x, u.goal[1] - u.z) > 1.5 && u.stuck < 3) { if (this.route(u, u.goal[0], u.goal[1])) u.stuck++; }
        else { u.order = 'idle'; wantMove = false; }
      }
    }
    u.repath -= dt;
    u.moving = false;
    if (wantMove && u.path.length) {
      const [px, pz] = u.path[0];
      const dx = px - u.x, dz = pz - u.z, dist = Math.hypot(dx, dz);
      if (dist < (u.path.length > 1 ? 1.4 : 0.5)) u.path.shift();
      else {
        const want = Math.atan2(dz, dx);
        const diff = angDiff(u.heading, want);
        const turn = d.turn * dt;
        u.heading += Math.max(-turn, Math.min(turn, diff));
        const align = d.vehicle ? Math.max(0, Math.cos(diff)) ** 2 : 1;
        const step = Math.min(dist, d.speed * dt * align);
        this.moveUnit(u, Math.cos(u.heading) * step, Math.sin(u.heading) * step);
        u.moving = step > 0.001;
      }
    }
    if (face === null) face = u.heading; // not shooting: look where we are going
    if (face !== null) {
      const diff = angDiff(u.tHead, face);
      const t = d.turretTurn * dt;
      u.tHead += Math.max(-t, Math.min(t, diff));
    }
    if (!d.vehicle) u.heading = u.tHead;
    if (d.crush && u.moving) this.crush(u);
  }

  // Route-finding is shared out across frames: at most a few milliseconds per frame.
  private pathMs = 0;
  route(u: Unit, tx: number, tz: number) {
    if (this.pathMs > 4) return false;
    const t0 = performance.now();
    u.path = findPath(this.world, u.x, u.z, tx, tz, u.def.crush, u.def.vehicle);
    this.pathMs += performance.now() - t0;
    return true;
  }

  moveUnit(u: Unit, dx: number, dz: number) {
    const w = this.world, d = u.def;
    const ok = (x: number, z: number) => Math.floor(x) === Math.floor(u.x) && Math.floor(z) === Math.floor(u.z) || passable(w, Math.floor(u.x), Math.floor(u.z), Math.floor(x), Math.floor(z), d.crush, false);
    if (ok(u.x + dx, u.z + dz)) { u.x += dx; u.z += dz; u.stuck = 0; }
    else if (ok(u.x + dx, u.z)) u.x += dx;
    else if (ok(u.x, u.z + dz)) u.z += dz;
    else { u.path = []; u.repath = 0; }
  }

  // Tanks flatten sandbags and trees in their way.
  crush(u: Unit) {
    const w = this.world;
    const fx = u.x + Math.cos(u.heading) * 3.2, fz = u.z + Math.sin(u.heading) * 3.2;
    const hit = new Set<number>();
    for (let ox = -4; ox <= 4; ox++)
      for (let oz = -4; oz <= 4; oz++) {
        const x = Math.floor(fx + ox), z = Math.floor(fz + oz);
        if (Math.hypot(x + 0.5 - fx, z + 0.5 - fz) > 4.2) continue;
        const g = w.groundAt(x, z, true);
        for (let y = w.heightAt(x, z) - 1; y >= g; y--) {
          const o = w.owner(x, y, z), b = w.buildings.get(o);
          if (!b || !b.crushable) continue;
          const c = w.get(x, y, z);
          w.remove(x, y, z);
          hit.add(o);
          this.debris.spawn(x + 0.5, y + 0.5, z + 0.5, Math.cos(u.heading) * 12 + (Math.random() - 0.5) * 8, 5 + Math.random() * 8, Math.sin(u.heading) * 12 + (Math.random() - 0.5) * 8, c, 0.9, Math.random() < 0.3);
        }
      }
    if (hit.size) {
      audio.crunch(fx, fz);
      this.fx.dust(fx, u.y + 1, fz, 3, 2.4);
      for (const id of hit) this.checkBuilding(w.buildings.get(id)!);
    }
  }

  separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z, min = a.def.radius + b.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const px = (dx / d) * push, pz = (dz / d) * push;
        const wa = a.moving && !b.moving ? 0.25 : b.moving && !a.moving ? 0.75 : 0.5;
        this.moveUnit(a, -px * wa * 2 * 0.5, -pz * wa * 2 * 0.5);
        this.moveUnit(b, px * (1 - wa) * 2 * 0.5, pz * (1 - wa) * 2 * 0.5);
      }
    }
  }

  updateTurrets(dt: number) {
    for (const b of this.world.buildings.values()) {
      const g = b.gun;
      if (!g || b.destroyed) continue;
      g.cooldown -= dt;
      let best: Unit | null = null, bd = 54;
      for (const u of this.units) {
        if (u.dead || u.team === b.team) continue;
        const d = Math.hypot(u.x - g.obj.position.x, u.z - g.obj.position.z);
        if (d < bd) { bd = d; best = u; }
      }
      if (!best) continue;
      const want = Math.atan2(best.z - g.obj.position.z, best.x - g.obj.position.x);
      const diff = angDiff(g.heading, want);
      g.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      g.obj.rotation.y = -g.heading;
      if (g.cooldown <= 0 && Math.abs(diff) < 0.1) {
        g.cooldown = 2.6;
        const mx = g.obj.position.x + Math.cos(g.heading) * 10, mz = g.obj.position.z + Math.sin(g.heading) * 10, my = g.y + 2;
        const tx = best.x, ty = best.y + best.def.height * 0.5, tz = best.z;
        const dx = tx - mx, dy = ty - my, dz = tz - mz, dist = Math.hypot(dx, dy, dz), sp = 120;
        this.projs.push({ x: mx, y: my, z: mz, vx: (dx / dist) * sp, vy: (dy / dist) * sp, vz: (dz / dist) * sp, team: b.team, kind: 'shell', dmg: 48, r: 3.4, life: 1.2 });
        this.fx.muzzle(mx, my, mz, Math.cos(g.heading), Math.sin(g.heading), true);
        audio.cannon(mx, mz);
        audio.alarm();
      }
    }
  }

  syncUnit(u: Unit, dt: number) {
    const w = this.world, d = u.def;
    const gy = w.groundAt(u.x, u.z, d.crush);
    u.y += (gy - u.y) * (1 - Math.exp(-dt * 12));
    if (d.vehicle) {
      const c = Math.cos(u.heading), s = Math.sin(u.heading), L = d.radius;
      const hf = w.groundAt(u.x + c * L, u.z + s * L, d.crush), hb = w.groundAt(u.x - c * L, u.z - s * L, d.crush);
      const hl = w.groundAt(u.x - s * L * 0.7, u.z + c * L * 0.7, d.crush), hr = w.groundAt(u.x + s * L * 0.7, u.z - c * L * 0.7, d.crush);
      const pitch = Math.atan2(hf - hb, L * 2) * 0.8, roll = Math.atan2(hr - hl, L * 1.4) * 0.6;
      u.pitch += (pitch - u.pitch) * (1 - Math.exp(-dt * 8));
      u.roll += (roll - u.roll) * (1 - Math.exp(-dt * 8));
    }
    u.bob += dt * (u.moving ? 12 : 0);
    const bob = !d.vehicle && u.moving ? Math.abs(Math.sin(u.bob)) * 0.12 : d.vehicle && u.moving ? Math.sin(u.bob * 2.3) * 0.03 : 0;
    u.obj.position.set(u.x, u.y + bob, u.z);
    u.obj.rotation.y = -u.heading;
    u.tilt.rotation.set(-u.roll, 0, u.pitch);
    if (u.turret) {
      u.turret.rotation.y = -(u.tHead - u.heading);
      const d0 = MODELS[u.type];
      const home = (d0.turretAt![0] - d0.bodyPivot[0]) * UNIT_SCALE;
      u.turret.position.x += (home - u.turret.position.x) * (1 - Math.exp(-dt * 6));
    }
    if (!d.vehicle && !u.moving) u.obj.rotation.z = 0;
    u.ring.visible = u.selected;
    if (u.selected) {
      u.ring.position.set(u.x, u.y + 0.2, u.z);
      const k = 1 + Math.max(0, u.ring.userData.pop ?? 0);
      u.ring.scale.setScalar(k);
      u.ring.userData.pop = Math.max(0, (u.ring.userData.pop ?? 0) - dt * 4);
    }
  }

  // ---------------------------------------------------------------- orders & input
  selected() { return this.units.filter((u) => u.selected && !u.dead); }

  select(list: Unit[], add: boolean) {
    if (!add) for (const u of this.units) u.selected = false;
    for (const u of list) { u.selected = true; u.ring.userData.pop = 0.35; }
    if (list.length) { this.say(list[0], 'select', true); audio.click(); }
  }

  pickGround(cx: number, cy: number) {
    const { origin: o, dir: d } = this.cam.ray(cx, cy);
    const hit = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 700);
    if (hit) return { x: o.x + d.x * hit.t, y: o.y + d.y * hit.t, z: o.z + d.z * hit.t, bx: hit.x, by: hit.y, bz: hit.z };
    const t = (10 - o.y) / d.y;
    return { x: o.x + d.x * t, y: 10, z: o.z + d.z * t, bx: -1, by: -1, bz: -1 };
  }

  screenOf(x: number, y: number, z: number) {
    return this.cam.toScreen(x, y, z);
  }

  unitAt(sx: number, sy: number) {
    let best: Unit | null = null, bd = 22;
    for (const u of this.units) {
      if (u.dead) continue;
      const p = this.screenOf(u.x, u.y + u.def.height * 0.5, u.z);
      const d = Math.hypot(p.x - sx, p.y - sy) - u.def.radius * 3;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  enemyBuildingAt(sx: number, sy: number) {
    const p = this.pickGround(sx, sy);
    if (p.bx < 0) return null;
    const b = this.world.buildings.get(this.world.owner(p.bx, p.by, p.bz));
    return b && b.team !== 0 && b.team !== 1 && !b.destroyed ? b : null;
  }

  command(sx: number, sy: number, amove: boolean) {
    const sel = this.selected().filter((u) => u.team === 1);
    if (!sel.length) return;
    const target = this.enemyBuildingAt(sx, sy);
    const p = this.pickGround(sx, sy);
    if (target && !amove) {
      for (const u of sel) { u.order = 'attack'; u.target = target; u.path = []; u.repath = 0; u.stuck = 0; }
      this.fx.marker(p.x, p.y, p.z, 0xff5a4a);
      this.say(sel[0], 'attack', true);
      return;
    }
    // spread the group into a loose formation around the click
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length, cz = sel.reduce((s, u) => s + u.z, 0) / sel.length;
    const ang = Math.atan2(p.z - cz, p.x - cx);
    const sorted = [...sel].sort((a, b) => Number(b.def.vehicle) - Number(a.def.vehicle));
    const cols = Math.ceil(Math.sqrt(sorted.length));
    sorted.forEach((u, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const sp = 5.5;
      const lx = (col - (cols - 1) / 2) * sp, lz = -row * sp;
      const gx = p.x + Math.cos(ang) * lz - Math.sin(ang) * lx, gz = p.z + Math.sin(ang) * lz + Math.cos(ang) * lx;
      u.goal = [gx, gz];
      u.order = amove ? 'amove' : 'move';
      u.target = null;
      u.stuck = 0;
      u.path = [];
    });
    this.fx.marker(p.x, p.y, p.z, amove ? 0xffb84a : 0x8dffb0);
    this.say(sel[0], amove ? 'attack' : 'move', true);
  }

  bindInput() {
    const el = this.renderer.domElement;
    const M = this.mouse;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.started) return;
      audio.start();
      if (e.button === 0) {
        if (this.attackMode) { this.command(e.clientX, e.clientY, true); this.setAttackMode(false); return; }
        M.down = true; M.sx = e.clientX; M.sy = e.clientY; M.drag = false;
      } else if (e.button === 2) {
        if (this.attackMode) { this.setAttackMode(false); return; }
        this.command(e.clientX, e.clientY, false);
      } else if (e.button === 1) { M.mid = true; e.preventDefault(); }
    });
    addEventListener('pointermove', (e) => {
      const dx = e.clientX - M.x, dy = e.clientY - M.y;
      M.x = e.clientX; M.y = e.clientY;
      if (M.mid) this.cam.drag(dx, dy);
      if (M.down && Math.hypot(M.x - M.sx, M.y - M.sy) > 6) M.drag = true;
      this.hud.setBox(M.sx, M.sy, M.x, M.y, M.down && M.drag);
      const ex = M.x < 6 ? -1 : M.x > innerWidth - 6 ? 1 : 0, ey = M.y < 6 ? -1 : M.y > innerHeight - 6 ? 1 : 0;
      this.cam.edge.x = ex; this.cam.edge.y = ey;
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 1) M.mid = false;
      if (e.button !== 0 || !M.down) return;
      M.down = false;
      this.hud.setBox(0, 0, 0, 0, false);
      if (M.drag) {
        const x0 = Math.min(M.sx, M.x), x1 = Math.max(M.sx, M.x), y0 = Math.min(M.sy, M.y), y1 = Math.max(M.sy, M.y);
        const list = this.units.filter((u) => {
          if (u.dead || u.team !== 1) return false;
          const p = this.screenOf(u.x, u.y + 2, u.z);
          return p.front && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
        });
        this.select(list, e.shiftKey);
      } else {
        const u = this.unitAt(M.x, M.y);
        const now = performance.now();
        if (u && u.team === 1) {
          if (now - M.lastClick < 320) {
            this.select(this.units.filter((o) => !o.dead && o.team === 1 && o.type === u.type && this.onScreen(o)), e.shiftKey);
          } else if (e.shiftKey && u.selected) { u.selected = false; }
          else this.select([u], e.shiftKey);
        } else if (!e.shiftKey) this.select([], false);
        M.lastClick = now;
      }
    });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.wheel(e.deltaY); }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!this.started) return;
      const k = e.code;
      if (k === 'KeyA' && !e.metaKey && !e.ctrlKey && this.selected().length) { this.setAttackMode(true); }
      if (k === 'KeyS' && this.selected().length && !e.metaKey) { for (const u of this.selected()) { u.order = 'idle'; u.path = []; u.target = null; } }
      if (k === 'Escape') { this.setAttackMode(false); this.select([], false); }
      if (k === 'Space') { e.preventDefault(); this.cam.jump(this.spawn[0] + 50, this.spawn[1] - 50); }
      if ((e.ctrlKey || e.metaKey) && k === 'KeyA') { e.preventDefault(); this.select(this.units.filter((u) => !u.dead && u.team === 1), false); }
      const m = /^Digit(\d)$/.exec(k);
      if (m) {
        const n = +m[1];
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups[n] = this.selected(); audio.click(); }
        else if (this.groups[n]?.length) {
          const g = this.groups[n].filter((u) => !u.dead);
          const again = g.length && g.every((u) => u.selected) && this.selected().length === g.length;
          this.select(g, e.shiftKey);
          if (again) this.cam.jump(g.reduce((s, u) => s + u.x, 0) / g.length, g.reduce((s, u) => s + u.z, 0) / g.length);
        }
      }
    });
  }

  // Only take the WASD pan keys when they aren't being used as commands.
  setAttackMode(on: boolean) {
    this.attackMode = on;
    document.body.classList.toggle('cur-attackmove', on);
  }

  onScreen(u: Unit) {
    const p = this.screenOf(u.x, u.y, u.z);
    return p.front && p.x > 0 && p.y > 0 && p.x < innerWidth && p.y < innerHeight;
  }

  updateCursor() {
    if (this.attackMode || !this.started) return;
    const sel = this.selected().length > 0;
    const u = this.unitAt(this.mouse.x, this.mouse.y);
    const b = sel ? this.enemyBuildingAt(this.mouse.x, this.mouse.y) : null;
    this.hover = b;
    const cls = u && u.team === 1 ? 'cur-select' : b ? 'cur-attack' : sel ? 'cur-move' : '';
    for (const c of ['cur-select', 'cur-attack', 'cur-move']) document.body.classList.toggle(c, c === cls);
  }

  drawBars() {
    const ctx = this.hud.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const bar = (x: number, y: number, w: number, f: number, h = 4) => {
      ctx.fillStyle = 'rgba(10,14,28,0.75)';
      ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = f > 0.6 ? '#7dffa0' : f > 0.3 ? '#ffd24a' : '#ff5a4a';
      ctx.fillRect(x - w / 2, y, w * Math.max(0, f), h);
    };
    for (const u of this.units) {
      if (u.dead || (!u.selected && u.hp >= u.def.hp)) continue;
      const p = this.screenOf(u.x, u.y + u.def.height + 2.4, u.z);
      if (!p.front) continue;
      bar(p.x, p.y, u.def.vehicle ? 34 : 18, u.hp / u.def.hp, u.def.vehicle ? 4 : 3);
    }
    for (const b of this.world.buildings.values()) {
      if (!b.target || b.destroyed) continue;
      const f = Math.max(0, (b.alive / b.total - b.threshold) / (1 - b.threshold));
      if (f > 0.995 && this.hover !== b) continue;
      const p = this.screenOf((b.min[0] + b.max[0] + 1) / 2, b.max[1] + 6, (b.min[2] + b.max[2] + 1) / 2);
      if (!p.front) continue;
      bar(p.x, p.y, 70, f, 5);
      if (this.hover === b) {
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(10,14,28,0.8)';
        const tw = ctx.measureText(b.name).width + 14;
        ctx.fillRect(p.x - tw / 2, p.y - 22, tw, 18);
        ctx.fillStyle = '#ffd9d2';
        ctx.fillText(b.name, p.x, p.y - 9);
      }
    }
  }

  update(dt: number) {
    if (this.started && !this.over) this.stats.time += dt;
    this.barkCool -= dt;
    for (let i = this.later.length - 1; i >= 0; i--) {
      const L = this.later[i];
      if ((L.t -= dt) <= 0) { this.later.splice(i, 1); L.fn(); }
    }
    this.pathMs = 0;
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    this.separate();
    this.updateTurrets(dt);
    this.updateProjectiles(dt);
    this.units = this.units.filter((u) => !u.dead || u.selected);
    for (const u of this.units) if (!u.dead) this.syncUnit(u, dt);
    this.debris.update(dt);
    this.fx.update(dt);
    this.world.rebuild(5);
    this.cam.update(dt);
    this.followShadow();
    audio.listener.x = this.cam.target.x; audio.listener.z = this.cam.target.z; audio.listener.zoom = this.cam.zoom; audio.listener.yaw = 0;
    this.updateCursor();
    this.hud.update(dt, this.selected());
    this.drawBars();
  }

  // Keep the sun's shadow box centred on what the camera sees, snapped to whole texels so edges don't shimmer.
  followShadow() {
    const t = this.cam.target, s = this.sun, sc = s.shadow.camera;
    const ext = Math.round(Math.max(this.cam.W, this.cam.H) * 0.75 + 30);
    const texel = (ext * 2) / 2048;
    const x = Math.round(t.x / texel) * texel, z = Math.round(t.z / texel) * texel;
    s.target.position.set(x, 0, z);
    s.position.set(x - 170, 260, z - 130); // sun from the upper left of the screen
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
  }

  // The scene is drawn into a small frame (one block = one pixel), then blown up with hard pixels.
  private rt: THREE.WebGLRenderTarget;
  private post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial };
  render() {
    const r = this.renderer, c = this.cam;
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(c.W, c.H, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      const mat = new THREE.ShaderMaterial({
        uniforms: { tColor: { value: this.rt.texture }, frame: { value: new THREE.Vector2() }, dev: { value: new THREE.Vector2() }, k: { value: 1 }, frac: { value: new THREE.Vector2() } },
        vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: BLIT, depthTest: false, depthWrite: false,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      this.post = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    if (this.rt.width !== c.W || this.rt.height !== c.H) this.rt.setSize(c.W, c.H);
    r.setRenderTarget(this.rt);
    r.render(this.scene, c.cam);
    r.setRenderTarget(null);
    const U = this.post.mat.uniforms;
    U.frame.value.set(c.W, c.H); U.dev.value.set(c.devW, c.devH); U.k.value = c.k; U.frac.value.set(c.fx, c.fy);
    r.render(this.post.scene, this.post.cam);
  }
}

function angDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
