// The game: a big painted map, pre-rendered pixel sprites, and the pixel-art interface,
// all drawn into one small frame that is blown up with hard square pixels.
import * as THREE from 'three';
import { Terrain, CELL, N, MAP, LIFT } from './terrain';
import { bake, facing, Sprite } from './bake';
import { ART, pine, broadleaf, stump } from './art';
import { teamColors, ModelDef } from './models';
import { findPath } from './path';
import { audio } from './audio';
import { text, textWidth } from './font';
import { C, TOP, CONSOLE, panel, rivets, inset, trim, button, Button, ICON, cursor, bar } from './ui';

const TEAMS = [teamColors(0x4a78a8), teamColors(0xb04434)]; // muted, painted-metal team colours

interface UnitDef {
  name: string; hp: number; speed: number; turn: number; radius: number; crush: boolean; vehicle: boolean; facings: number; track: number;
  barks: { select: string[]; move: string[] };
}
const DEFS: Record<string, UnitDef> = {
  tank: {
    name: 'Battle Tank', hp: 400, speed: 30, turn: 2.2, radius: 10, crush: true, vehicle: true, facings: 32, track: 5,
    barks: { select: ['Armour\'s warm.', 'Point me at something.', 'Smile for the brochure.'], move: ['Rolling.', 'Mind the paint.', 'Out of my way, scenery.'] },
  },
  harvester: {
    name: 'Salvager', hp: 600, speed: 22, turn: 1.6, radius: 11, crush: true, vehicle: true, facings: 32, track: 5,
    barks: { select: ['One man\'s wreck...', 'Scrap is money.', 'Salvager ready.'], move: ['Off to find treasure.', 'Moving out.', 'Heavy load, slow road.'] },
  },
  rifle: {
    name: 'Rifleman', hp: 60, speed: 12, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0,
    barks: { select: ['Reporting, mostly intact.', 'Yes, Commander?', 'I read the pamphlet!'], move: ['On it.', 'Moving, moving!', 'Hup hup.'] },
  },
};

let nextId = 1;
class Unit {
  id = nextId++; hp: number; heading = Math.PI * 1.75; tHead = Math.PI * 1.75;
  path: [number, number][] = []; goal: [number, number] | null = null;
  selected = false; moving = false; trackAcc = 0; stuck = 0; bob = 0; scan = 0; scanTo = 0; dust = 0;
  constructor(public type: string, public def: UnitDef, public team: number, public x: number, public y: number) { this.hp = def.hp; }
}
interface Tree { x: number; y: number; v: number; fall: number; dir: number }
interface Bld { type: string; team: number; cx: number; cy: number; w: number; h: number; name: string }
type Look = { body: Sprite[]; turret?: Sprite[]; def: ModelDef };

export class Game {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  terrain = new Terrain();
  units: Unit[] = [];
  trees: Tree[][] = Array.from({ length: N }, () => []); // by cell row
  blds: Bld[] = [];
  looks: Record<string, Look> = {};
  treeLooks: { stand: Sprite; fall: Sprite[][] }[] = [];
  stumpLook: Sprite;
  FW = 640; FH = 360; k = 3; zoomStep = 0;
  vx = 0; vy = 0; goalX = 0; goalY = 0;
  state: 'loading' | 'title' | 'play' = 'loading';
  loadStep = 0; loadTotal = 1;
  mouse = { x: 0, y: 0, down: false, sx: 0, sy: 0, drag: false, mid: false, last: 0, in: false };
  keys = new Set<string>();
  groups: Unit[][] = [];
  credits = 5000;
  bark = { who: '', line: '', t: 0 };
  markers: { x: number; y: number; t: number }[] = [];
  buttons: Button[] = [];
  menuItems: { id: string; label: () => string }[] = [{ id: 'deploy', label: () => 'DEPLOY' }, { id: 'sound', label: () => `SOUND: ${this.sound ? 'ON' : 'OFF'}` }];
  menuHot = 0; sound = true; time = 0;
  puffs: { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string; s: number }[] = [];
  clouds = makeClouds();

  constructor(host: HTMLElement) {
    host.append(this.canvas);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();
    this.load();
    (window as any).game = this;
  }

  // ------------------------------------------------------------------ loading
  async load() {
    const t = this.terrain;
    t.prepare();
    const jobs: (() => void)[] = [];
    for (const [key, make] of Object.entries(ART))
      for (const team of [0, 1]) jobs.push(() => {
        const def = make(), n = DEFS[key]?.facings ?? 1;
        this.looks[key + team] = { def, body: bake(def, 'body', { facings: n, team: TEAMS[team] }), turret: def.turret ? bake(def, 'turret', { facings: n, team: TEAMS[team] }) : undefined };
      });
    const variants: ModelDef[] = [pine(1), pine(2), pine(3), pine(4), broadleaf(5), broadleaf(6)];
    for (const def of variants) jobs.push(() => {
      const fall: Sprite[][] = [];
      for (let dir = 0; dir < 4; dir++) {
        const a = (dir * Math.PI) / 2, axis = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
        fall.push([0.5, 1.0, 1.5].map((ang) => bake(def, 'body', { tilt: { axis, angle: ang } })[0]));
      }
      this.treeLooks.push({ stand: bake(def, 'body')[0], fall });
    });
    jobs.push(() => { this.stumpLook = bake(stump(), 'body')[0]; });
    this.loadTotal = t.chunkCount + jobs.length;
    for (let i = 0; i < t.chunkCount; i++) { t.paintChunk(i); this.loadStep++; if (i % 3 === 2) await nextFrame(); }
    t.finish();
    for (const job of jobs) { job(); this.loadStep++; await nextFrame(); }
    this.populate();
    this.state = 'title';
  }

  populate() {
    const t = this.terrain;
    for (const [x, y] of t.trees) this.trees[Math.floor(y / CELL)].push({ x, y, v: (Math.random() * this.treeLooks.length) | 0, fall: -1, dir: 0 });
    for (const row of this.trees) row.sort((a, b) => a.y - b.y);
    t.bases.forEach(([bx, by], team) => {
      this.addBld('fieldCommand', team, bx - 1, by - 1, 3, 3, 'Field Command');
      const ox = bx * CELL, oy = by * CELL, dir = team === 0 ? 1 : -1;
      for (let i = 0; i < 3; i++) this.addUnit('tank', team, ox + dir * (70 + i * 26), oy - dir * 40);
      this.addUnit('harvester', team, ox + dir * 60, oy + dir * 50);
      for (let i = 0; i < 6; i++) this.addUnit('rifle', team, ox + dir * (40 + (i % 3) * 8), oy - dir * (70 + Math.floor(i / 3) * 8));
    });
    for (const u of this.units) if (u.team === 1) u.heading = u.tHead = Math.PI * 0.75;
    const [sx, sy] = t.bases[0];
    this.goalX = this.vx = sx * CELL + 120 - this.FW / 2; this.goalY = this.vy = sy * CELL - 60 - this.FH / 2;
  }

  addUnit(type: string, team: number, x: number, y: number) { const u = new Unit(type, DEFS[type], team, x, y); this.units.push(u); return u; }
  addBld(type: string, team: number, cx: number, cy: number, w: number, h: number, name: string) {
    this.blds.push({ type, team, cx, cy, w, h, name });
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
      const i = this.terrain.idx(x, y);
      this.terrain.occupied[i] = 1; this.terrain.forest[i] = 0;
    }
  }

  // ------------------------------------------------------------------ frame size
  resize() {
    const dpr = devicePixelRatio, dw = innerWidth * dpr, dh = innerHeight * dpr;
    const base = Math.max(2, Math.round(dw / 720));
    this.k = Math.max(2, base + this.zoomStep);
    this.FW = Math.floor(dw / this.k); this.FH = Math.floor(dh / this.k);
    this.canvas.width = this.FW; this.canvas.height = this.FH;
    this.canvas.style.width = (this.FW * this.k) / dpr + 'px';
    this.canvas.style.height = (this.FH * this.k) / dpr + 'px';
    this.ctx.imageSmoothingEnabled = false;
  }
  zoom(step: number) {
    const cx = this.vx + this.FW / 2, cy = this.vy + this.FH / 2;
    const s = Math.max(-2, Math.min(2, this.zoomStep + step));
    if (s === this.zoomStep) return;
    this.zoomStep = s; this.resize();
    this.goalX = this.vx = cx - this.FW / 2; this.goalY = this.vy = cy - this.FH / 2;
  }

  // ------------------------------------------------------------------ input
  framePos(e: MouseEvent) { const r = this.canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * this.FW, ((e.clientY - r.top) / r.height) * this.FH]; }
  inView(y: number) { return y > TOP && y < this.FH - CONSOLE; }

  bindInput() {
    const M = this.mouse, el = this.canvas;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.state === 'title') {
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') this.menuHot = (this.menuHot + 1) % this.menuItems.length;
        if (e.code === 'Enter' || e.code === 'Space') this.menu(this.menuItems[this.menuHot].id);
        return;
      }
      if (this.state !== 'play') return;
      const m = /^Digit(\d)$/.exec(e.code);
      if (m) {
        const n = +m[1];
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups[n] = this.selected(); audio.click(); }
        else if (this.groups[n]?.length) {
          const g = this.groups[n].filter((u) => this.units.includes(u));
          const again = g.length > 0 && g.every((u) => u.selected);
          this.select(g, false);
          if (again) this.centre(g[0].x, g[0].y);
        }
      }
      if (e.code === 'KeyS') this.order('stop');
      if (e.code === 'KeyX') this.order('scatter');
      if (e.code === 'KeyH' || e.code === 'Space') { e.preventDefault(); this.order('home'); }
      if (e.code === 'Escape') this.select([], false);
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { e.preventDefault(); this.select(this.units.filter((u) => u.team === 0), false); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mouseenter', () => (M.in = true));
    el.addEventListener('mouseleave', () => (M.in = false));
    el.addEventListener('pointerdown', (e) => {
      [M.x, M.y] = this.framePos(e);
      M.in = true;
      if (this.sound) audio.start();
      if (this.state === 'title') { const hit = this.menuHit(); if (hit) this.menu(hit); return; }
      if (this.state !== 'play') return;
      if (e.button === 1) { M.mid = true; e.preventDefault(); return; }
      if (this.uiClick(e.button)) return;
      if (e.button === 0) { M.down = true; M.sx = M.x; M.sy = M.y; M.drag = false; }
      if (e.button === 2) this.command(M.x + this.vx, M.y + this.vy);
    });
    addEventListener('pointermove', (e) => {
      const [x, y] = this.framePos(e);
      if (M.mid) { this.goalX -= x - M.x; this.goalY -= y - M.y; this.vx = this.goalX; this.vy = this.goalY; }
      M.x = x; M.y = y;
      if (M.down && Math.hypot(M.x - M.sx, M.y - M.sy) > 3) M.drag = true;
      if (M.down && this.minimapHit(M.sx, M.sy)) this.minimapJump();
      if (this.state === 'title') { const hit = this.menuHit(); if (hit) this.menuHot = this.menuItems.findIndex((m) => m.id === hit); }
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 1) M.mid = false;
      if (e.button !== 0 || !M.down) return;
      M.down = false;
      if (this.minimapHit(M.sx, M.sy)) return;
      if (M.drag) {
        const x0 = Math.min(M.sx, M.x) + this.vx, x1 = Math.max(M.sx, M.x) + this.vx, y0 = Math.min(M.sy, M.y) + this.vy, y1 = Math.max(M.sy, M.y) + this.vy;
        this.select(this.units.filter((u) => u.team === 0 && u.x >= x0 && u.x <= x1 && this.screenY(u) >= y0 && this.screenY(u) <= y1), e.shiftKey);
      } else {
        const u = this.unitAt(M.x + this.vx, M.y + this.vy);
        const now = performance.now();
        if (u && u.team === 0) {
          if (now - M.last < 320) this.select(this.units.filter((o) => o.team === 0 && o.type === u.type && this.onScreen(o)), e.shiftKey);
          else if (e.shiftKey && u.selected) u.selected = false;
          else this.select([u], e.shiftKey);
        } else if (!e.shiftKey) this.select([], false);
        M.last = now;
      }
    });
    el.addEventListener('wheel', (e) => { e.preventDefault(); if (this.state === 'play') this.zoom(e.deltaY > 0 ? -1 : 1); }, { passive: false });
  }

  menu(id: string) {
    audio.start(); audio.click();
    if (id === 'deploy') { this.state = 'play'; this.say(this.units[0], 'select'); }
    if (id === 'sound') { this.sound = !this.sound; audio.master?.gain.setValueAtTime(this.sound ? 0.8 : 0, 0); }
  }

  // ------------------------------------------------------------------ orders
  selected() { return this.units.filter((u) => u.selected); }
  select(list: Unit[], add: boolean) {
    if (!add) for (const u of this.units) u.selected = false;
    for (const u of list) u.selected = true;
    if (list.length) { this.say(list[0], 'select'); audio.click(); }
  }
  say(u: Unit, kind: 'select' | 'move') {
    const lines = u.def.barks[kind];
    this.bark = { who: u.def.name, line: lines[(Math.random() * lines.length) | 0], t: 3 };
    audio.radio();
  }
  command(wx: number, sy: number) {
    const sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return;
    const gy = this.groundY(wx, sy);
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length, cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
    const ang = Math.atan2(gy - cy, wx - cx), cols = Math.ceil(Math.sqrt(sel.length));
    [...sel].sort((a, b) => b.def.radius - a.def.radius).forEach((u, i) => {
      const sp = Math.max(10, u.def.radius * 2.6), r = Math.floor(i / cols), c = i % cols;
      const lx = (c - (cols - 1) / 2) * sp, lz = -r * sp;
      const gx = wx + Math.cos(ang) * lz - Math.sin(ang) * lx, gyy = gy + Math.sin(ang) * lz + Math.cos(ang) * lx;
      u.goal = [gx, gyy]; u.stuck = 0;
      u.path = findPath(this.terrain, u.x, u.y, gx, gyy, u.def.crush);
    });
    this.markers.push({ x: wx, y: gy, t: 0 });
    this.say(sel[0], 'move');
  }
  order(id: string) {
    if (id === 'home') { const [bx, by] = this.terrain.bases[0]; this.centre(bx * CELL, by * CELL); return; }
    const sel = this.selected();
    if (!sel.length) return;
    audio.click();
    for (const u of sel) {
      if (id === 'stop') { u.path = []; u.goal = null; }
      if (id === 'scatter') {
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
        u.goal = [u.x + Math.cos(a) * d, u.y + Math.sin(a) * d];
        u.path = findPath(this.terrain, u.x, u.y, u.goal[0], u.goal[1], u.def.crush);
      }
    }
  }
  centre(x: number, y: number) { this.goalX = x - this.FW / 2; this.goalY = y - (this.FH - CONSOLE + TOP) / 2; }

  // ground point under a screen point (raised ground is drawn higher up the screen)
  groundY(wx: number, sy: number) {
    for (const e of [2, 1]) { const gy = sy + e * LIFT; if (this.terrain.elevAt(wx, gy) === e) return gy; }
    return sy;
  }
  screenY(u: { x: number; y: number }) { return u.y - this.terrain.lift(u.x, u.y); }
  onScreen(u: Unit) { const sy = this.screenY(u) - this.vy, sx = u.x - this.vx; return sx > 0 && sx < this.FW && sy > TOP && sy < this.FH - CONSOLE; }
  unitAt(wx: number, wy: number) {
    let best: Unit | null = null, bd = 9;
    for (const u of this.units) {
      const d = Math.hypot(u.x - wx, this.screenY(u) - (u.def.vehicle ? 4 : 3) - wy) - u.def.radius * 0.6;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    this.time += dt;
    if (this.state !== 'play') return;
    const sp = 420 * dt, M = this.mouse;
    let mx = 0, my = 0;
    if (this.keys.has('ArrowLeft')) mx--; if (this.keys.has('ArrowRight')) mx++;
    if (this.keys.has('ArrowUp')) my--; if (this.keys.has('ArrowDown')) my++;
    if (M.in && !M.down) { if (M.x < 3) mx--; if (M.x > this.FW - 3) mx++; if (M.y < 3) my--; if (M.y > this.FH - 3) my++; }
    this.goalX += mx * sp; this.goalY += my * sp;
    this.goalX = Math.max(-8, Math.min(MAP - this.FW + 8, this.goalX));
    this.goalY = Math.max(-TOP - 16, Math.min(MAP - this.FH + CONSOLE + 8, this.goalY));
    this.vx += (this.goalX - this.vx) * (1 - Math.exp(-dt * 14));
    this.vy += (this.goalY - this.vy) * (1 - Math.exp(-dt * 14));
    for (const u of this.units) this.move(u, dt);
    this.separate();
    this.updateTrees(dt);
    for (const b of this.blds) if (Math.random() < dt * 3) {
      const gx = (b.cx + 0.6) * CELL, gy = (b.cy + 0.6) * CELL; // the vent block on the roof
      this.puffs.push({ x: gx + (Math.random() - 0.5) * 3, y: gy - 24, vx: 2 + Math.random() * 2, vy: -5 - Math.random() * 3, t: 0, life: 2 + Math.random(), c: '#6e6c66', s: 1 + (Math.random() < 0.5 ? 1 : 0) });
    }
    for (const p of this.puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.puffs = this.puffs.filter((p) => p.t < p.life);
    this.bark.t -= dt;
    for (const m of this.markers) m.t += dt;
    this.markers = this.markers.filter((m) => m.t < 0.6);
  }

  move(u: Unit, dt: number) {
    const d = u.def, t = this.terrain;
    u.moving = false;
    if (!u.path.length && this.looks[u.type + u.team]?.turret) {
      // idle tanks look around now and then
      if ((u.scan -= dt) <= 0) { u.scan = 2 + Math.random() * 4; u.scanTo = u.heading + (Math.random() - 0.5) * 2.2; }
      u.tHead += Math.max(-dt * 0.8, Math.min(dt * 0.8, angDiff(u.tHead, u.scanTo)));
    }
    if (!u.path.length) {
      if (u.goal && Math.hypot(u.goal[0] - u.x, u.goal[1] - u.y) > 6 && u.stuck < 3) { u.stuck++; u.path = findPath(t, u.x, u.y, u.goal[0], u.goal[1], d.crush); }
      return;
    }
    const [px, py] = u.path[0];
    const dx = px - u.x, dy = py - u.y, dist = Math.hypot(dx, dy);
    if (dist < (u.path.length > 1 ? 6 : 1.5)) { u.path.shift(); if (!u.path.length) u.goal = null; return; }
    const want = Math.atan2(dy, dx);
    let diff = angDiff(u.heading, want);
    const turn = d.turn * dt;
    u.heading += Math.max(-turn, Math.min(turn, diff));
    diff = angDiff(u.heading, want);
    const go = d.vehicle ? Math.max(0, Math.cos(diff)) ** 3 : 1;
    const step = Math.min(dist, d.speed * dt * go);
    const nx = u.x + Math.cos(u.heading) * step, ny = u.y + Math.sin(u.heading) * step;
    const ax = t.cellOf(u.x), ay = t.cellOf(u.y), bx = t.cellOf(nx), by = t.cellOf(ny);
    if ((ax === bx && ay === by) || t.step(ax, ay, bx, by, d.crush)) { u.x = nx; u.y = ny; }
    else { u.path = findPath(t, u.x, u.y, u.goal?.[0] ?? px, u.goal?.[1] ?? py, d.crush); u.stuck++; return; }
    u.tHead = u.heading;
    u.moving = step > 0.01;
    u.bob += dt * 10;
    if (d.track && u.moving) {
      u.trackAcc += step;
      while (u.trackAcc > 1) { u.trackAcc -= 1; t.track(u.x - Math.cos(u.heading) * 8, u.y - Math.sin(u.heading) * 8, u.heading, d.track); }
    }
    if (d.crush && u.moving) this.crush(u);
    if (d.vehicle && u.moving && (u.dust -= dt) <= 0) {
      u.dust = 0.12;
      const ty = t.type[t.idx(t.cellOf(u.x), t.cellOf(u.y))];
      if (ty <= 2) { // grass, dirt, scrap kick up dust
        const bx = u.x - Math.cos(u.heading) * 11, by = u.y - Math.sin(u.heading) * 11;
        this.puffs.push({ x: bx + (Math.random() - 0.5) * 6, y: by, vx: (Math.random() - 0.5) * 4, vy: -3 - Math.random() * 3, t: 0, life: 0.9 + Math.random() * 0.6, c: ty === 0 ? '#8a8a62' : '#9a8664', s: 1 + (Math.random() < 0.4 ? 1 : 0) });
      }
    }
  }

  // Tanks and salvagers knock trees over.
  crush(u: Unit) {
    const fx = u.x + Math.cos(u.heading) * u.def.radius * 0.8, fy = u.y + Math.sin(u.heading) * u.def.radius * 0.8;
    const row = Math.floor(fy / CELL);
    for (let r = row - 1; r <= row + 1; r++) for (const tr of this.trees[r] ?? []) {
      if (tr.fall >= 0 || Math.hypot(tr.x - fx, tr.y - fy) > u.def.radius * 0.75) continue;
      tr.fall = 0;
      tr.dir = ((Math.round(u.heading / (Math.PI / 2)) % 4) + 4) % 4;
      audio.crunch(tr.x, tr.y);
    }
  }

  updateTrees(dt: number) {
    const t = this.terrain;
    for (let r = 0; r < N; r++) {
      const row = this.trees[r];
      for (let i = row.length - 1; i >= 0; i--) {
        const tr = row[i];
        if (tr.fall < 0) continue;
        tr.fall += dt;
        if (tr.fall < 0.5) continue;
        // landed: press the fallen trunk and the stump into the ground for good
        const s = this.treeLooks[tr.v].fall[tr.dir][2], st = this.stumpLook, sy = Math.round(tr.y - t.lift(tr.x, tr.y));
        t.stamp(Math.round(tr.x), sy, (ctx, x, y) => {
          ctx.drawImage(s.shadow, Math.round(x - s.ax), Math.round(y - s.ay));
          ctx.drawImage(s.img, Math.round(x - s.ax), Math.round(y - s.ay));
          ctx.drawImage(st.img, Math.round(x - st.ax), Math.round(y - st.ay));
        });
        row.splice(i, 1);
        const ci = t.idx(t.cellOf(tr.x), t.cellOf(tr.y));
        if (t.forest[ci] > 0) t.forest[ci]--;
      }
    }
  }

  separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j];
      const dx = b.x - a.x, dy = b.y - a.y, min = a.def.radius + b.def.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) continue;
      const d = Math.sqrt(d2), push = (min - d) * 0.25;
      const wa = a.moving && !b.moving ? 0.3 : b.moving && !a.moving ? 0.7 : 0.5;
      this.nudge(a, (-dx / d) * push * wa * 2, (-dy / d) * push * wa * 2);
      this.nudge(b, (dx / d) * push * (1 - wa) * 2, (dy / d) * push * (1 - wa) * 2);
    }
  }
  nudge(u: Unit, dx: number, dy: number) {
    const t = this.terrain, ax = t.cellOf(u.x), ay = t.cellOf(u.y), bx = t.cellOf(u.x + dx), by = t.cellOf(u.y + dy);
    if ((ax === bx && ay === by) || t.step(ax, ay, bx, by, u.def.crush)) { u.x += dx; u.y += dy; }
  }

  // ------------------------------------------------------------------ drawing
  render() {
    const ctx = this.ctx, vx = Math.round(this.vx), vy = Math.round(this.vy), M = this.mouse;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, this.FW, this.FH);
    if (this.state === 'loading') { this.drawLoading(); return; }
    this.terrain.draw(ctx, vx, vy, this.FW, this.FH);
    this.drawGlints(vx, vy);
    const items: { y: number; draw: () => void; shadow: () => void }[] = [];
    const sprite = (s: Sprite, x: number, y: number) => ctx.drawImage(s.img, Math.round(x - s.ax), Math.round(y - s.ay));
    const shadow = (s: Sprite, x: number, y: number) => ctx.drawImage(s.shadow, Math.round(x - s.ax), Math.round(y - s.ay));
    const r0 = Math.max(0, Math.floor((vy - 40) / CELL)), r1 = Math.min(N - 1, Math.floor((vy + this.FH + 60) / CELL));
    for (let r = r0; r <= r1; r++) for (const tr of this.trees[r]) {
      if (tr.x < vx - 30 || tr.x > vx + this.FW + 30) continue;
      const look = this.treeLooks[tr.v];
      const s = tr.fall < 0 ? look.stand : look.fall[tr.dir][Math.min(2, Math.floor(tr.fall / 0.17))];
      const x = tr.x - vx, y = tr.y - this.terrain.lift(tr.x, tr.y) - vy;
      items.push({ y: tr.y, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y) });
    }
    for (const b of this.blds) {
      const s = this.looks[b.type + b.team].body[0];
      const gx = (b.cx + b.w / 2) * CELL, gy = (b.cy + b.h / 2) * CELL;
      const x = gx - vx, y = gy - this.terrain.lift(gx, gy) - vy;
      if (x < -120 || x > this.FW + 120 || y < -160 || y > this.FH + 100) continue;
      items.push({ y: (b.cy + b.h) * CELL - 4, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y) });
    }
    for (const u of this.units) {
      const look = this.looks[u.type + u.team];
      const x = u.x - vx, y = this.screenY(u) - vy - (!u.def.vehicle && u.moving ? Math.round(Math.abs(Math.sin(u.bob))) : 0);
      if (x < -30 || x > this.FW + 30 || y < -30 || y > this.FH + 30) continue;
      const body = facing(look.body, u.heading);
      items.push({
        y: u.y, shadow: () => shadow(body, x, y),
        draw: () => {
          sprite(body, x, y);
          if (look.turret) {
            const d = look.def, at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2];
            const c = Math.cos(u.heading), s = Math.sin(u.heading);
            sprite(facing(look.turret, u.tHead), x + ox * c - oz * s, y + ox * s + oz * c - (at[1] - d.bodyPivot[1]));
          }
        },
      });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.shadow();
    for (const it of items) it.draw();
    // dust and smoke: pixel puffs that thin out as they rise
    for (const p of this.puffs) {
      const f = p.t / p.life, x = Math.round(p.x - vx), y = Math.round(p.y - vy);
      if (((x + y) & 1) && f > 0.5) continue;
      ctx.fillStyle = p.c; ctx.fillRect(x, y, p.s + (f > 0.4 ? 1 : 0), p.s);
    }
    // cloud shadows drifting over everything
    const cw = this.clouds.width, ox = Math.round(this.time * 7 - vx) % cw, oy = Math.round(this.time * 3 - vy) % cw;
    for (let y = (oy > 0 ? oy - cw : oy); y < this.FH; y += cw) for (let x = (ox > 0 ? ox - cw : ox); x < this.FW; x += cw) ctx.drawImage(this.clouds, x, y);
    // move markers: a shrinking green diamond
    for (const m of this.markers) {
      const r = Math.round(8 * (1 - m.t / 0.6)) + 1, x = Math.round(m.x - vx), y = Math.round(m.y - this.terrain.lift(m.x, m.y) - vy);
      ctx.fillStyle = C.ok;
      for (let i = -r; i <= r; i++) { const j = r - Math.abs(i); ctx.fillRect(x + i, y + Math.round(j / 2), 1, 1); ctx.fillRect(x + i, y - Math.round(j / 2), 1, 1); }
    }
    // selection brackets and health pips
    for (const u of this.units) {
      if (!u.selected) continue;
      const x = Math.round(u.x - vx), y = Math.round(this.screenY(u) - vy), r = u.def.radius + 2, top = y - (u.def.vehicle ? r + 6 : 11), bot = y + Math.round(r / 2) + 2;
      ctx.fillStyle = C.cream;
      for (const [cx, cy, sx, sy] of [[x - r, top, 1, 1], [x + r, top, -1, 1], [x - r, bot, 1, -1], [x + r, bot, -1, -1]]) { ctx.fillRect(cx - (sx < 0 ? 2 : 0), cy, 3, 1); ctx.fillRect(cx, cy - (sy < 0 ? 2 : 0), 1, 3); }
      bar(ctx, x - r + 1, top - 4, r * 2 - 1, u.hp / u.def.hp);
    }
    // drag box: dotted pixel rectangle
    if (M.down && M.drag && this.state === 'play') {
      const x0 = Math.round(Math.min(M.sx, M.x)), x1 = Math.round(Math.max(M.sx, M.x)), y0 = Math.round(Math.min(M.sy, M.y)), y1 = Math.round(Math.max(M.sy, M.y));
      ctx.fillStyle = C.ok;
      for (let x = x0; x <= x1; x += 2) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x, y1, 1, 1); }
      for (let y = y0; y <= y1; y += 2) { ctx.fillRect(x0, y, 1, 1); ctx.fillRect(x1, y, 1, 1); }
    }
    if (this.state === 'title') this.drawTitle(); else this.drawHud();
    if (M.in) {
      const over = this.state === 'play' && this.inView(M.y) ? this.unitAt(M.x + vx, M.y + vy) : null;
      const kind = this.state !== 'play' || !this.inView(M.y) ? 'arrow' : over && over.team === 0 ? 'select' : this.selected().length ? 'move' : 'arrow';
      cursor(ctx, kind, M.x, M.y, this.time);
    }
  }

  // Open water sparkles: a few pixels catch the sun and twinkle.
  drawGlints(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain, CH = 512;
    const c0 = Math.max(0, Math.floor(vx / CH)), c1 = Math.min(t.cw - 1, Math.floor((vx + this.FW) / CH));
    const r0 = Math.max(0, Math.floor((vy + 24) / CH)), r1 = Math.min(t.chh - 1, Math.floor((vy + this.FH + 24) / CH));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const g = t.glints[r * t.cw + c];
      if (!g) continue;
      for (let i = 0; i < g.length; i += 2) {
        const x = g[i] - vx, y = g[i + 1] - vy;
        if (x < 0 || y < 0 || x >= this.FW || y >= this.FH) continue;
        const s = Math.sin(this.time * 2.3 + ((g[i] * 7 + g[i + 1] * 13) % 97));
        if (s < 0.9) continue;
        ctx.fillStyle = s > 0.985 ? '#f4f8f0' : '#8eb0b4';
        ctx.fillRect(x, y, s > 0.97 ? 2 : 1, 1);
      }
    }
  }

  drawLoading() {
    const ctx = this.ctx, w = 160, x = Math.round((this.FW - w) / 2), y = Math.round(this.FH / 2);
    this.logo(Math.round(this.FH / 2) - 50);
    inset(ctx, x, y, w, 7);
    ctx.fillStyle = C.gold; ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * (this.loadStep / this.loadTotal)), 5);
    const msg = 'SURVEYING THE BATTLEFIELD...';
    text(ctx, msg, Math.round((this.FW - textWidth(msg)) / 2), y + 12, C.muted);
  }

  logo(y: number) {
    const ctx = this.ctx, s = 4, word = 'CONQUER', w = textWidth(word, s), x = Math.round((this.FW - w) / 2);
    text(ctx, word, x + 2, y + 2, C.ink, s);
    text(ctx, word, x, y, C.goldD, s);
    text(ctx, word, x, y - 1, C.gold, s);
    ctx.fillStyle = C.red; ctx.fillRect(x, y + 7 * s + 3, w, 3);
    ctx.fillStyle = C.redD; ctx.fillRect(x, y + 7 * s + 6, w, 1);
  }

  drawTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,8,10,0.55)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const y = Math.round(this.FH * 0.24);
    this.logo(y);
    const tag = 'EVERY BUILDING IS A SUGGESTION.';
    text(ctx, tag, Math.round((this.FW - textWidth(tag)) / 2), y + 44, C.cream, 1, C.ink);
    const pw = 120, px = Math.round((this.FW - pw) / 2), py = y + 66, ph = 16 + this.menuItems.length * 16;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    this.menuItems.forEach((m, i) => {
      const label = m.label(), ty = py + 9 + i * 16, hot = i === this.menuHot;
      if (hot) { ctx.fillStyle = C.red; ctx.fillRect(px + 6, ty - 3, pw - 12, 13); ctx.fillStyle = C.redD; ctx.fillRect(px + 6, ty + 9, pw - 12, 1); }
      text(ctx, label, Math.round(px + (pw - textWidth(label)) / 2), ty, hot ? C.gold : C.cream, 1, C.ink);
    });
    const foot = 'DRAG TO SELECT   RIGHT-CLICK TO MOVE   WHEEL TO ZOOM';
    text(ctx, foot, Math.round((this.FW - textWidth(foot)) / 2), this.FH - 16, C.muted, 1, C.ink);
  }
  menuHit() {
    const y = Math.round(this.FH * 0.24), pw = 120, px = Math.round((this.FW - pw) / 2), py = y + 66, M = this.mouse;
    for (let i = 0; i < this.menuItems.length; i++) { const ty = py + 6 + i * 16; if (M.x > px && M.x < px + pw && M.y > ty && M.y < ty + 14) return this.menuItems[i].id; }
    return null;
  }

  // ------------------------------------------------------------------ the console
  drawHud() {
    const ctx = this.ctx, W = this.FW, H = this.FH;
    panel(ctx, 0, 0, W, TOP);
    ctx.fillStyle = C.red; ctx.fillRect(3, 3, 7, 7); ctx.fillStyle = C.gold; ctx.fillRect(5, 5, 3, 3);
    text(ctx, 'CONQUER', 13, 3, C.gold, 1, C.ink);
    const cr = '$ ' + this.credits.toLocaleString('en-US');
    inset(ctx, Math.round(W / 2) - 32, 2, 64, 9, C.screen);
    text(ctx, cr, Math.round(W / 2 - textWidth(cr) / 2), 3, C.gold);
    const y = H - CONSOLE;
    panel(ctx, 0, y, W, CONSOLE); trim(ctx, 0, y, W); rivets(ctx, 0, y + 3, W, CONSOLE - 3);
    // minimap
    const mx = 6, my = y + 9, ms = 66;
    inset(ctx, mx, my, ms, ms, C.ink);
    ctx.drawImage(this.terrain.minimap, mx + 1, my + 1);
    for (const b of this.blds) { ctx.fillStyle = b.team === 0 ? '#6ab8ff' : '#ff5a40'; ctx.fillRect(mx + 1 + Math.floor(b.cx / 2), my + 1 + Math.floor(b.cy / 2), 2, 2); }
    for (const u of this.units) { ctx.fillStyle = u.team === 0 ? '#6ab8ff' : '#ff5a40'; ctx.fillRect(mx + 1 + Math.floor(u.x / (CELL * 2)), my + 1 + Math.floor(u.y / (CELL * 2)), 1, 1); }
    const sc = 1 / (CELL * 2);
    const rx = mx + 1 + Math.round(this.vx * sc), ry = my + 1 + Math.round((this.vy + TOP) * sc), rw = Math.round(this.FW * sc), rh = Math.round((this.FH - CONSOLE - TOP) * sc);
    ctx.save(); ctx.beginPath(); ctx.rect(mx + 1, my + 1, 64, 64); ctx.clip();
    ctx.fillStyle = C.cream;
    ctx.fillRect(rx, ry, rw, 1); ctx.fillRect(rx, ry + rh, rw + 1, 1); ctx.fillRect(rx, ry, 1, rh); ctx.fillRect(rx + rw, ry, 1, rh);
    ctx.restore();
    // selection
    const sx = mx + ms + 8, sw = W - sx - 118;
    inset(ctx, sx, my, sw, ms, C.screen);
    ctx.save(); ctx.beginPath(); ctx.rect(sx + 1, my + 1, sw - 2, ms - 2); ctx.clip(); // keep text inside the screen
    const sel = this.selected();
    if (this.bark.t > 0) {
      text(ctx, this.bark.who.toUpperCase() + ':', sx + 5, my + 4, C.gold);
      text(ctx, this.bark.line.toUpperCase(), sx + 5 + textWidth(this.bark.who + ': '), my + 4, C.cream);
    } else text(ctx, sel.length ? `${sel.length} SELECTED` : 'NO UNITS SELECTED', sx + 5, my + 4, C.muted);
    if (!sel.length) {
      text(ctx, 'DRAG A BOX OVER YOUR UNITS,', sx + 5, my + 24, C.muted);
      text(ctx, 'THEN RIGHT-CLICK THE GROUND.', sx + 5, my + 34, C.muted);
    }
    const slot = 26, per = Math.max(1, Math.floor((sw - 8) / (slot + 2)));
    sel.slice(0, per * 2).forEach((u, i) => {
      const px = sx + 4 + (i % per) * (slot + 2), py = my + 14 + Math.floor(i / per) * (slot + 2);
      ctx.fillStyle = C.screenL; ctx.fillRect(px, py, slot, slot - 2);
      ctx.save(); ctx.beginPath(); ctx.rect(px, py, slot, slot - 2); ctx.clip();
      const look = this.looks[u.type + u.team], s = facing(look.body, Math.PI * 0.25);
      ctx.drawImage(s.img, Math.round(px + slot / 2 - s.ax), Math.round(py + slot / 2 + 3 - s.ay));
      if (look.turret) { const t = facing(look.turret, Math.PI * 0.25); ctx.drawImage(t.img, Math.round(px + slot / 2 - t.ax + 1), Math.round(py + slot / 2 - 4 - t.ay)); }
      ctx.restore();
      bar(ctx, px + 1, py + slot - 1, slot - 2, u.hp / u.def.hp);
    });
    ctx.restore();
    // orders
    const bx = W - 112;
    text(ctx, 'ORDERS', bx + 2, my, C.goldD);
    this.buttons = [
      { id: 'stop', x: bx, y: my + 10, w: 106, h: 17, label: 'STOP', key: 'S', icon: ICON.stop },
      { id: 'scatter', x: bx, y: my + 29, w: 106, h: 17, label: 'SCATTER', key: 'X', icon: ICON.scatter },
      { id: 'home', x: bx, y: my + 48, w: 106, h: 17, label: 'BASE', key: 'H', icon: ICON.home },
    ];
    const M = this.mouse;
    for (const b of this.buttons) {
      const hot = M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h;
      button(ctx, b, hot, hot && M.down);
    }
  }

  minimapHit(x: number, y: number) { const my = this.FH - CONSOLE + 9; return x > 7 && x < 71 && y > my + 1 && y < my + 65; }
  minimapJump() {
    const my = this.FH - CONSOLE + 9;
    const cx = (this.mouse.x - 7) * CELL * 2, cy = (this.mouse.y - my - 1) * CELL * 2;
    this.goalX = this.vx = cx - this.FW / 2; this.goalY = this.vy = cy - (this.FH - CONSOLE) / 2;
  }
  uiClick(btn: number) {
    const M = this.mouse;
    if (M.y < TOP) return true;
    if (M.y < this.FH - CONSOLE) return false;
    if (btn === 0 && this.minimapHit(M.x, M.y)) { this.minimapJump(); M.down = true; M.sx = M.x; M.sy = M.y; return true; }
    if (btn === 2 && this.minimapHit(M.x, M.y)) {
      const my = this.FH - CONSOLE + 9;
      this.command((M.x - 7) * CELL * 2, (M.y - my - 1) * CELL * 2);
      return true;
    }
    for (const b of this.buttons) if (M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h) { this.order(b.id); return true; }
    return true;
  }
}

// A tileable sheet of soft cloud shadow, dithered at the edges like the rest of the art.
function makeClouds() {
  const S = 512, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!, img = ctx.createImageData(S, S), d = img.data;
  const h = (x: number, y: number, s: number) => { x = ((x % s) + s) % s; y = ((y % s) + s) % s; const n = Math.sin(x * 127.1 + y * 311.7 + s) * 43758.5453; return n - Math.floor(n); };
  const vn = (x: number, y: number, cells: number) => {
    const f = S / cells, fx = x / f, fy = y / f, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
    return (h(ix, iy, cells) * (1 - u) + h(ix + 1, iy, cells) * u) * (1 - v) + (h(ix, iy + 1, cells) * (1 - u) + h(ix + 1, iy + 1, cells) * u) * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vn(x, y, 4) * 0.6 + vn(x, y, 9) * 0.3 + vn(x, y, 23) * 0.1;
    const k = (y * S + x) * 4;
    const on = n > 0.62 || (n > 0.58 && (x + y) % 2 === 0) || (n > 0.55 && x % 2 === 0 && y % 2 === 0);
    d[k] = 8; d[k + 1] = 14; d[k + 2] = 22; d[k + 3] = on ? 62 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function angDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Yield to the browser between loading steps without waiting for a screen refresh,
// so loading keeps going even if the tab is in the background.
const chan = new MessageChannel(), waiting: (() => void)[] = [];
chan.port1.onmessage = () => waiting.shift()?.();
const nextFrame = () => new Promise<void>((r) => { waiting.push(r); chan.port2.postMessage(0); });
