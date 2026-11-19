// The game: a big painted map, pre-rendered pixel sprites, and the pixel-art interface,
// all drawn into one small frame that is blown up with hard square pixels.
import * as THREE from 'three';
import { Terrain, CELL, N, LIFT, YAW, YC, YS, SW, SH, toScreen, toGround } from './terrain';
import { bake, facing, Sprite } from './bake';
import { ART, CIVIC, LIFE, BASE, pine, broadleaf, stump } from './art';
import { BUILDS, DEF, POWER, Production, BuildDef, SCRAP_LOAD, HARVEST_RATE, UNLOAD_RATE } from './build';
import { teamColors, ModelDef } from './models';
import { findPath } from './path';
import { audio } from './audio';
import { text, textWidth } from './font';
import { C, TOP, CONSOLE, panel, rivets, inset, trim, button, Button, ICON, cursor, bar, plate, glass } from './ui';

const TEAMS = [teamColors(0x4a78a8), teamColors(0xb04434), teamColors(0x8a8a82)]; // player, enemy, neutral (grey)
const CAR_PAINT = [0xc8a840, 0x5a7a9a, 0x8a3a2a, 0xd8d4c8].map(teamColors);
const SHIRTS = [0xa86a3a, 0x6a8a5a, 0xc8c0a8].map(teamColors);
// What each capturable site does once your infantry take it.
const CAPTURE: Record<string, { name: string; tip: string; garrison?: number }> = {
  motorPool: { name: 'Motor Pool', tip: 'CAPTURE: DELIVERS A TANK, THEN ONE EVERY 90S' },
  recruitOffice: { name: 'Recruiting Office', tip: 'CAPTURE: 3 RIFLEMEN, THEN 2 EVERY 60S' },
  bunker: { name: 'Bunker', tip: 'GARRISON UP TO 3 INFANTRY TO FIRE FROM COVER', garrison: 3 },
  watchtower: { name: 'Watchtower', tip: 'GARRISON 2 INFANTRY: HIGH GROUND, LONG SIGHT', garrison: 2 },
};

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
  selected = false; moving = false; trackAcc = 0; stuck = 0; bob = 0; scan = 0; scanTo = 0; dust = 0; enter: Bld | null = null;
  cargo = 0; unloading = false; // salvagers
  constructor(public type: string, public def: UnitDef, public team: number, public x: number, public y: number) { this.hp = def.hp; }
}
interface Tree { x: number; y: number; v: number; fall: number; dir: number }
interface Bld { type: string; team: number; cx: number; cy: number; w: number; h: number; name: string; garrison: number; timer: number; rise: number; rally: [number, number] | null }
// Civilians, cars and animals going about their day.
interface Agent { kind: string; x: number; y: number; heading: number; look: Sprite[]; speed: number; home: [number, number]; goal: [number, number] | null; wait: number; scared: number; route?: [number, number][]; ri?: number; dir?: number; step: number }
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
  lifeLooks: Record<string, Sprite[]> = {};
  agents: Agent[] = [];
  birds: { x: number; y: number; vx: number; vy: number; n: number; seed: number }[] = [];
  hoverBld: Bld | null = null;
  FW = 640; FH = 360; k = 3; zoomStep = 0;
  vx = 0; vy = 0; goalX = 0; goalY = 0;
  state: 'loading' | 'title' | 'play' = 'loading';
  loadStep = 0; loadTotal = 1;
  mouse = { x: 0, y: 0, down: false, sx: 0, sy: 0, drag: false, mid: false, last: 0, in: false };
  keys = new Set<string>();
  groups: Unit[][] = [];
  prod = new Production();
  placing: BuildDef | null = null;  // a finished structure waiting to be put down
  selBld: Bld | null = null;
  icons: Record<string, Sprite> = {};
  buildTab: 'structure' | 'unit' = 'structure';
  slots: { def: BuildDef; x: number; y: number; w: number; h: number }[] = [];
  tabs: { id: 'structure' | 'unit'; x: number; y: number; w: number; h: number }[] = [];
  power = { made: 0, used: 0 };
  bark = { who: '', line: '', t: 0 };
  markers: { x: number; y: number; t: number }[] = [];
  buttons: Button[] = [];
  menuItems: { id: string; label: () => string }[] = [{ id: 'deploy', label: () => 'DEPLOY' }, { id: 'sound', label: () => `SOUND: ${this.sound ? 'ON' : 'OFF'}` }];
  menuHot = 0; sound = true; time = 0;
  loadReport: Record<string, unknown> = {}; // how long loading took, for keeping it fast
  puffs: { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string; s: number }[] = [];
  clouds = makeClouds();
  shadowLayer = document.createElement('canvas');
  sctx = this.shadowLayer.getContext('2d')!;

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
    const jobs: (() => void)[] = [];
    for (const [key, make] of Object.entries(ART))
      for (const team of [0, 1]) jobs.push(() => {
        const def = make(), n = DEFS[key]?.facings ?? 1;
        this.looks[key + team] = { def, body: bake(def, 'body', { facings: n, team: TEAMS[team], yaw: n === 1 ? YAW : 0 }), turret: def.turret ? bake(def, 'turret', { facings: n, team: TEAMS[team] }) : undefined };
      });
    const variants: ModelDef[] = [pine(1), pine(2), pine(3), pine(4), broadleaf(5), broadleaf(6)];
    for (const def of variants) jobs.push(() => {
      const fall: Sprite[][] = [];
      for (let dir = 0; dir < 4; dir++) {
        const a = (dir * Math.PI) / 2 + YAW, axis = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)); // fall directions on the turned map
        fall.push([0.5, 1.0, 1.5].map((ang) => bake(def, 'body', { tilt: { axis, angle: ang } })[0]));
      }
      this.treeLooks.push({ stand: bake(def, 'body')[0], fall });
    });
    jobs.push(() => { this.stumpLook = bake(stump(), 'body')[0]; });
    for (const [key, make] of Object.entries(CIVIC)) jobs.push(() => {
      const def = make(), teams = CAPTURE[key] ? [0, 1, 2] : [2];
      for (const team of teams) this.looks[key + team] = { def, body: bake(def, 'body', { team: TEAMS[team], yaw: YAW }) };
    });
    for (const [key, make] of Object.entries(BASE)) jobs.push(() => {
      const def = make();
      for (const team of [0, 1]) this.looks[key + team] = { def, body: bake(def, 'body', { team: TEAMS[team], yaw: YAW }) };
      this.icons[key] = bake(def, 'body', { team: TEAMS[0], yaw: YAW, scale: 0.3 })[0];
    });
    jobs.push(() => {
      for (const kind of ['car', 'pickup']) CAR_PAINT.forEach((paint, i) => { const def = LIFE[kind](); this.lifeLooks[kind + i] = bake(def, 'body', { facings: 16, team: paint }); });
      SHIRTS.forEach((shirt, i) => { this.lifeLooks['civilian' + i] = bake(LIFE.civilian(), 'body', { facings: 8, team: shirt }); });
      for (const kind of ['cow', 'deer']) this.lifeLooks[kind] = bake(LIFE[kind](), 'body', { facings: 8 });
    });
    this.loadTotal = t.chunkCount + jobs.length;
    // the map is painted by background workers while the sprites are baked here
    const t0 = performance.now();
    let mapAt = 0;
    const painting = this.paintInWorkers().then(() => { mapAt = performance.now() - t0; });
    const slow: [number, number][] = [];
    for (let j = 0; j < jobs.length; j++) { const s = performance.now(); jobs[j](); slow.push([j, performance.now() - s]); this.loadStep++; await nextFrame(); }
    const spritesAt = performance.now() - t0;
    await painting;
    t.finish();
    slow.sort((a, b) => b[1] - a[1]);
    this.loadReport = { totalMs: Math.round(performance.now() - t0), spritesMs: Math.round(spritesAt), mapMs: Math.round(mapAt), slowestJobs: slow.slice(0, 5).map(([j, ms]) => `${j}:${Math.round(ms)}`) };
    this.populate();
    this.state = 'title';
  }

  paintInWorkers(): Promise<void> {
    const t = this.terrain, n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    return new Promise((done) => {
      let left = t.chunkCount;
      try {
        for (let w = 0; w < n; w++) {
          const worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module' });
          const mine: number[] = [];
          for (let i = w; i < t.chunkCount; i += n) mine.push(i);
          worker.onmessage = (e) => {
            t.putChunk(e.data.i, e.data.d, e.data.glints);
            this.loadStep++;
            if (--left === 0) done();
            if (mine.length && e.data.i === mine[mine.length - 1]) worker.terminate();
          };
          worker.postMessage(mine);
        }
      } catch {
        // no workers: paint here instead
        t.prepare();
        for (let i = 0; i < t.chunkCount; i++) { t.paintChunk(i); this.loadStep++; }
        done();
      }
    });
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
    for (const st of t.sites) this.addBld(st.kind, 2, st.cx, st.cy, st.w, st.h, CAPTURE[st.kind]?.name ?? 'House');
    this.spawnLife();
    const [bx, by] = t.bases[0];
    this.centre(bx * CELL + 100, by * CELL - 60); this.vx = this.goalX; this.vy = this.goalY;
  }

  addUnit(type: string, team: number, x: number, y: number) { const u = new Unit(type, DEFS[type], team, x, y); this.units.push(u); return u; }
  addBld(type: string, team: number, cx: number, cy: number, w: number, h: number, name: string) {
    this.blds.push({ type, team, cx, cy, w, h, name, garrison: 0, timer: 0, rise: 1, rally: null });
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
      if (e.code === 'Escape') { if (this.placing) this.placing = null; else { this.select([], false); this.selBld = null; } }
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
      if (this.placing) { if (e.button === 0) this.place(); else this.placing = null; return; }
      if (e.button === 0) { M.down = true; M.sx = M.x; M.sy = M.y; M.drag = false; }
      if (e.button === 2) {
        if (this.selBld && !this.selected().length) { // a selected building: set where its new units gather
          const [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy);
          this.selBld.rally = [gx, gy]; this.markers.push({ x: gx, y: gy, t: 0 }); audio.click();
        } else this.command(M.x + this.vx, M.y + this.vy);
      }
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
        this.select(this.units.filter((u) => { const [sx, sy] = this.scr(u); return u.team === 0 && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1; }), e.shiftKey);
      } else {
        const u = this.unitAt(M.x + this.vx, M.y + this.vy);
        const now = performance.now();
        if (u && u.team === 0) {
          if (now - M.last < 320) this.select(this.units.filter((o) => o.team === 0 && o.type === u.type && this.onScreen(o)), e.shiftKey);
          else if (e.shiftKey && u.selected) u.selected = false;
          else this.select([u], e.shiftKey);
        } else {
          if (!e.shiftKey) this.select([], false);
          const b = this.bldAt(...this.groundAt(M.x + this.vx, M.y + this.vy));
          this.selBld = b && b.team === 0 && !CAPTURE[b.type] ? b : null;
          if (this.selBld) audio.click();
        }
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
    if (list.length) this.selBld = null;
    for (const u of list) u.selected = true;
    if (list.length) { this.say(list[0], 'select'); audio.click(); }
  }
  say(u: Unit, kind: 'select' | 'move') {
    const lines = u.def.barks[kind];
    this.bark = { who: u.def.name, line: lines[(Math.random() * lines.length) | 0], t: 3 };
    audio.radio();
  }
  command(px: number, py: number) {
    const sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return;
    const [wx, gy] = this.groundAt(px, py);
    // infantry sent onto a capturable site go in and take it
    const site = this.bldAt(wx, gy);
    const foot = sel.filter((u) => !u.def.vehicle);
    if (site && CAPTURE[site.type] && foot.length && (site.team !== 0 || CAPTURE[site.type].garrison)) {
      const dx = (site.cx + site.w / 2) * CELL, dy = (site.cy + site.h + 0.5) * CELL;
      for (const u of foot) { u.enter = site; u.goal = [dx, dy]; u.stuck = 0; u.path = findPath(this.terrain, u.x, u.y, dx, dy, false); }
      this.bark = { who: foot[0].def.name, line: site.team === 0 ? 'Moving in.' : 'Under new management, coming up.', t: 3 };
      audio.radio();
      return;
    }
    for (const u of sel) u.enter = null;
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
  centre(x: number, y: number) { const [sx, sy] = toScreen(x, y); this.centreScreen(sx, sy); }
  centreScreen(sx: number, sy: number) { this.goalX = sx - this.FW / 2; this.goalY = sy - (this.FH - CONSOLE + TOP) / 2; }

  // ground point under a screen point (raised ground is drawn higher up the screen)
  // the ground point under a screen point (raised ground is drawn higher up the screen)
  groundAt(sx: number, sy: number): [number, number] {
    for (const e of [2, 1]) { const [gx, gy] = toGround(sx, sy + e * LIFT); if (this.terrain.elevAt(gx, gy) === e) return [gx, gy]; }
    return toGround(sx, sy);
  }
  // where a ground point is drawn on screen (map space; subtract the view to get frame pixels)
  scr(p: { x: number; y: number }): [number, number] { const [sx, sy] = toScreen(p.x, p.y); return [sx, sy - this.terrain.lift(p.x, p.y)]; }
  onScreen(u: Unit) { const [x, y] = this.scr(u), sx = x - this.vx, sy = y - this.vy; return sx > 0 && sx < this.FW && sy > TOP && sy < this.FH - CONSOLE; }
  unitAt(wx: number, wy: number) {
    let best: Unit | null = null, bd = 9;
    for (const u of this.units) {
      const [sx, sy] = this.scr(u);
      const d = Math.hypot(sx - wx, sy - (u.def.vehicle ? 4 : 3) - wy) - u.def.radius * 0.6;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    this.time += dt;
    if (this.state === 'title') { this.goalX += dt * 9; this.goalY += dt * 3; this.vx = this.goalX; this.vy = this.goalY; } // the battlefield drifts by behind the menu
    if (this.state !== 'play') return;
    const sp = 420 * dt, M = this.mouse;
    let mx = 0, my = 0;
    if (this.keys.has('ArrowLeft')) mx--; if (this.keys.has('ArrowRight')) mx++;
    if (this.keys.has('ArrowUp')) my--; if (this.keys.has('ArrowDown')) my++;
    if (M.in && !M.down) { if (M.x < 3) mx--; if (M.x > this.FW - 3) mx++; if (M.y < 3) my--; if (M.y > this.FH - 3) my++; }
    this.goalX += mx * sp; this.goalY += my * sp;
    this.goalX = Math.max(-8, Math.min(SW - this.FW + 8, this.goalX));
    this.goalY = Math.max(-TOP - 16, Math.min(SH - this.FH + CONSOLE + 8, this.goalY));
    this.vx += (this.goalX - this.vx) * (1 - Math.exp(-dt * 14));
    this.vy += (this.goalY - this.vy) * (1 - Math.exp(-dt * 14));
    for (const u of this.units) this.move(u, dt);
    this.separate();
    this.updateTrees(dt);
    this.updateLife(dt);
    this.updateSites(dt);
    this.updateEconomy(dt);
    for (const b of this.blds) if (b.type === 'fieldCommand' && Math.random() < dt * 3) {
      const [gx, gy] = toScreen((b.cx + 0.6) * CELL, (b.cy + 0.6) * CELL); // the vent block on the roof (puffs live in screen space)
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
    if (u.type === 'harvester' && u.team === 0) this.salvage(u, dt);
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
    if (u.enter && Math.hypot(u.x - (u.enter.cx + u.enter.w / 2) * CELL, u.y - (u.enter.cy + u.enter.h / 2) * CELL) < Math.max(u.enter.w, u.enter.h) * CELL * 0.5 + 20) this.enter(u, u.enter);
    if (d.crush && u.moving) this.crush(u);
    if (d.vehicle && u.moving && (u.dust -= dt) <= 0) {
      u.dust = 0.12;
      const ty = t.type[t.idx(t.cellOf(u.x), t.cellOf(u.y))];
      if (ty <= 2) { // grass, dirt, scrap kick up dust
        const [bx, by] = this.scr({ x: u.x - Math.cos(u.heading) * 11, y: u.y - Math.sin(u.heading) * 11 });
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
        const s = this.treeLooks[tr.v].fall[tr.dir][2], st = this.stumpLook, [tsx, tsy] = this.scr(tr);
        t.stamp(Math.round(tsx), Math.round(tsy), (ctx, x, y) => {
          ctx.globalAlpha = 0.38; ctx.drawImage(s.shadow, Math.round(x - s.ax), Math.round(y - s.ay)); ctx.globalAlpha = 1;
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
    const sctx = this.sctx;
    const shadow = (s: Sprite, x: number, y: number) => sctx.drawImage(s.shadow, Math.round(x - s.ax), Math.round(y - s.ay));
    // the view covers a turned rectangle of ground: walk the ground rows it touches
    let gy0 = 1e9, gy1 = -1e9;
    for (const [cx, cy] of [[vx - 40, vy - 40], [vx + this.FW + 40, vy - 40], [vx - 40, vy + this.FH + 60], [vx + this.FW + 40, vy + this.FH + 60]]) { const g = toGround(cx, cy)[1]; gy0 = Math.min(gy0, g); gy1 = Math.max(gy1, g); }
    const r0 = Math.max(0, Math.floor(gy0 / CELL)), r1 = Math.min(N - 1, Math.floor(gy1 / CELL));
    for (let r = r0; r <= r1; r++) for (const tr of this.trees[r]) {
      const [tx, ty] = this.scr(tr), x = tx - vx, y = ty - vy;
      if (x < -30 || x > this.FW + 30 || y < -60 || y > this.FH + 40) continue;
      const look = this.treeLooks[tr.v];
      const s = tr.fall < 0 ? look.stand : look.fall[tr.dir][Math.min(2, Math.floor(tr.fall / 0.17))];
      items.push({ y: y + vy, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y) });
    }
    for (const b of this.blds) {
      const s = this.looks[b.type + b.team].body[0];
      const [bx, by] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }), x = bx - vx, y = by - vy;
      if (x < -120 || x > this.FW + 120 || y < -160 || y > this.FH + 100) continue;
      const front = toScreen((b.cx + b.w) * CELL, (b.cy + b.h) * CELL)[1]; // its nearest corner decides draw order
      items.push({ y: front - 4, shadow: () => { if (b.rise >= 1) shadow(s, x, y); }, draw: () => {
        if (b.rise < 1) { // rising out of the ground: reveal from the bottom up
          const h = s.img.height, show = Math.round(h * b.rise);
          ctx.drawImage(s.img, 0, h - show, s.img.width, show, Math.round(x - s.ax), Math.round(y - s.ay) + h - show, s.img.width, show);
          return;
        }
        sprite(s, x, y);
        if (b === this.selBld) this.outline(b, vx, vy);
        if (CAPTURE[b.type]) this.drawFlag(b, vx, vy);
        // warning beacon on top of the signal tower blinks
        if (b.type === 'fieldCommand' && Math.sin(this.time * 3.5 + b.team) > 0.2) {
          const dx = 21, dz = -18, lx = x + YC * dx - YS * dz, ly = y + YS * dx + YC * dz - 52;
          ctx.fillStyle = '#ff5a3a'; ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
          ctx.fillStyle = 'rgba(255,90,58,0.35)'; ctx.fillRect(Math.round(lx) - 1, Math.round(ly), 3, 1); ctx.fillRect(Math.round(lx), Math.round(ly) - 1, 1, 3);
        }
      } });
    }
    for (const u of this.units) {
      const look = this.looks[u.type + u.team];
      const [ux, uy] = this.scr(u), x = ux - vx, y = uy - vy - (!u.def.vehicle && u.moving ? Math.round(Math.abs(Math.sin(u.bob))) : 0);
      if (x < -30 || x > this.FW + 30 || y < -30 || y > this.FH + 30) continue;
      const body = facing(look.body, u.heading + YAW); // headings are on the ground; the map is turned on screen
      items.push({
        y: toScreen(u.x, u.y)[1], shadow: () => shadow(body, x, y),
        draw: () => {
          sprite(body, x, y);
          if (u.type === 'harvester' && u.moving) {
            // amber beacon bar on the cab flashes while it drives
            const a = u.heading + YAW, lx = x + Math.cos(a) * 9, ly = y + Math.sin(a) * 9 - 12;
            ctx.fillStyle = Math.floor(this.time * 6) % 2 ? '#ffc040' : '#a06818';
            ctx.fillRect(Math.round(lx) - 1, Math.round(ly), 2, 1);
          }
          if (look.turret) {
            const d = look.def, at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2];
            const c = Math.cos(u.heading + YAW), s = Math.sin(u.heading + YAW);
            sprite(facing(look.turret, u.tHead + YAW), x + ox * c - oz * s, y + ox * s + oz * c - (at[1] - d.bodyPivot[1]));
          }
        },
      });
    }
    for (const a of this.agents) {
      const [ax, ay] = this.scr(a), x = ax - vx, y = ay - vy - (a.kind === 'civilian' && a.goal ? Math.round(Math.abs(Math.sin(a.step))) : 0);
      if (x < -20 || x > this.FW + 20 || y < -20 || y > this.FH + 20) continue;
      const s = facing(a.look, a.heading + YAW);
      items.push({ y: ay, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y) });
    }
    items.sort((a, b) => a.y - b.y);
    // all shadows go on one layer first, then down once, so overlapping shadows never stack up darker
    if (this.shadowLayer.width !== this.FW || this.shadowLayer.height !== this.FH) { this.shadowLayer.width = this.FW; this.shadowLayer.height = this.FH; }
    sctx.clearRect(0, 0, this.FW, this.FH);
    for (const it of items) it.shadow();
    ctx.globalAlpha = 0.38; ctx.drawImage(this.shadowLayer, 0, 0); ctx.globalAlpha = 1;
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
    this.drawBirds(vx, vy);
    // move markers: a shrinking green diamond
    for (const m of this.markers) {
      const [mx, my] = this.scr(m), r = Math.round(8 * (1 - m.t / 0.6)) + 1, x = Math.round(mx - vx), y = Math.round(my - vy);
      ctx.fillStyle = C.ok;
      for (let i = -r; i <= r; i++) { const j = r - Math.abs(i); ctx.fillRect(x + i, y + Math.round(j / 2), 1, 1); ctx.fillRect(x + i, y - Math.round(j / 2), 1, 1); }
    }
    // selection brackets and health pips
    for (const u of this.units) {
      if (!u.selected) continue;
      const [ux, uy] = this.scr(u), x = Math.round(ux - vx), y = Math.round(uy - vy), r = u.def.radius + 2, top = y - (u.def.vehicle ? r + 6 : 11), bot = y + Math.round(r / 2) + 2;
      ctx.fillStyle = C.cream;
      for (const [cx, cy, sx, sy] of [[x - r, top, 1, 1], [x + r, top, -1, 1], [x - r, bot, 1, -1], [x + r, bot, -1, -1]]) { ctx.fillRect(cx - (sx < 0 ? 2 : 0), cy, 3, 1); ctx.fillRect(cx, cy - (sy < 0 ? 2 : 0), 1, 3); }
      bar(ctx, x - r + 1, top - 4, r * 2 - 1, u.hp / u.def.hp);
      if (u.type === 'harvester') { ctx.fillStyle = C.ink; ctx.fillRect(x - r, top - 1, r * 2 + 1, 3); ctx.fillStyle = '#c87a3a'; ctx.fillRect(x - r + 1, top, Math.round((r * 2 - 1) * (u.cargo / SCRAP_LOAD)), 1); }
    }
    // drag box: dotted pixel rectangle
    if (M.down && M.drag && this.state === 'play') {
      const x0 = Math.round(Math.min(M.sx, M.x)), x1 = Math.round(Math.max(M.sx, M.x)), y0 = Math.round(Math.min(M.sy, M.y)), y1 = Math.round(Math.max(M.sy, M.y));
      ctx.fillStyle = C.ok;
      for (let x = x0; x <= x1; x += 2) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x, y1, 1, 1); }
      for (let y = y0; y <= y1; y += 2) { ctx.fillRect(x0, y, 1, 1); ctx.fillRect(x1, y, 1, 1); }
    }
    this.drawPlacement(vx, vy);
    if (this.selBld?.rally) { const [rx, ry] = this.scr({ x: this.selBld.rally[0], y: this.selBld.rally[1] }); ctx.fillStyle = C.ok; ctx.fillRect(Math.round(rx - vx), Math.round(ry - vy) - 8, 1, 8); ctx.fillRect(Math.round(rx - vx) + 1, Math.round(ry - vy) - 8, 4, 3); }
    if (this.state === 'title') this.drawTitle(); else this.drawHud();
    if (M.in) {
      const over = this.state === 'play' && this.inView(M.y) ? this.unitAt(M.x + vx, M.y + vy) : null;
      this.hoverBld = this.state === 'play' && this.inView(M.y) ? this.bldAt(...this.groundAt(M.x + vx, M.y + vy)) : null;
      const kind = this.state !== 'play' || !this.inView(M.y) ? 'arrow' : over && over.team === 0 ? 'select' : this.selected().length ? 'move' : 'arrow';
      cursor(ctx, kind, M.x, M.y, this.time);
    }
  }

  // Corner brackets around a selected building's footprint, on the turned grid.
  outline(b: Bld, vx: number, vy: number) {
    const ctx = this.ctx, lift = this.terrain.lift((b.cx + 0.5) * CELL, (b.cy + 0.5) * CELL);
    ctx.fillStyle = C.cream;
    for (const [gx, gy] of [[b.cx, b.cy], [b.cx + b.w, b.cy], [b.cx, b.cy + b.h], [b.cx + b.w, b.cy + b.h]]) {
      const [sx, sy] = toScreen(gx * CELL, gy * CELL), x = Math.round(sx - vx), y = Math.round(sy - lift - vy);
      ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
    }
  }

  bldAt(gx: number, gy: number) {
    const cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL);
    return this.blds.find((b) => cx >= b.cx && cx < b.cx + b.w && cy >= b.cy && cy < b.cy + b.h) ?? null;
  }

  // Infantry reach a site: capture it, or climb in to garrison it.
  enter(u: Unit, b: Bld) {
    u.enter = null;
    const c = CAPTURE[b.type];
    if (!c) return;
    if (c.garrison && b.team === 0 && b.garrison >= c.garrison) { u.path = []; u.goal = null; return; }
    this.units = this.units.filter((o) => o !== u);
    const was = b.team;
    b.team = 0;
    if (c.garrison) b.garrison++;
    this.bark = { who: c.name, line: was === 0 ? 'Another one inside. Cosy.' : 'Captured. The previous owners left in a hurry.', t: 3 };
    audio.radio(); audio.click();
    if (was !== 0) { b.timer = 0; this.siteBonus(b, true); }
  }

  // Captured sites pay out: vehicles from the motor pool, infantry from the recruiting office.
  siteBonus(b: Bld, first: boolean) {
    const ox = (b.cx + b.w / 2) * CELL, oy = (b.cy + b.h + 0.8) * CELL;
    if (b.type === 'motorPool') this.addUnit('tank', b.team, ox, oy).heading = Math.PI / 2;
    if (b.type === 'recruitOffice') for (let i = 0; i < (first ? 3 : 2); i++) this.addUnit('rifle', b.team, ox - 6 + i * 6, oy);
  }
  updateSites(dt: number) {
    for (const b of this.blds) {
      if (b.team !== 0 || (b.type !== 'motorPool' && b.type !== 'recruitOffice')) continue;
      b.timer += dt;
      const every = b.type === 'motorPool' ? 90 : 60;
      if (b.timer >= every) { b.timer -= every; this.siteBonus(b, false); }
    }
  }

  // A flag on a pole at the site's corner, in the owner's colour, rippling in the wind.
  drawFlag(b: Bld, vx: number, vy: number) {
    const ctx = this.ctx, [fx, fy] = this.scr({ x: b.cx * CELL + 3, y: b.cy * CELL + 3 });
    const x = Math.round(fx - vx), y = Math.round(fy - vy);
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(x, y - 22, 1, 22);
    ctx.fillStyle = '#c8c8c0'; ctx.fillRect(x, y - 23, 1, 1);
    const col = b.team === 0 ? '#5a8ac0' : b.team === 1 ? '#c85040' : '#d8d4c8', dark = b.team === 0 ? '#3a5a80' : b.team === 1 ? '#8a3428' : '#9a968a';
    const wave = Math.floor(this.time * 5 + b.cx) % 2;
    for (let i = 0; i < 7; i++) {
      const dy = i > 2 && (i + wave) % 3 === 0 ? 1 : 0;
      ctx.fillStyle = i % 3 === 2 ? dark : col; ctx.fillRect(x + 1 + i, y - 22 + dy, 1, 4);
    }
    const g = CAPTURE[b.type].garrison;
    if (g) for (let i = 0; i < g; i++) { ctx.fillStyle = i < b.garrison ? C.ok : '#3a3a3a'; ctx.fillRect(x + 1 + i * 3, y - 16, 2, 2); }
  }

  // ---- ambient life ----
  spawnLife() {
    const t = this.terrain, rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const add = (kind: string, look: Sprite[], x: number, y: number, speed: number) =>
      this.agents.push({ kind, x, y, heading: Math.random() * 7, look, speed, home: [x, y], goal: null, wait: Math.random() * 4, scared: 0, step: 0 });
    for (const [vx, vy] of t.villages) {
      for (let i = 0; i < 7; i++) add('civilian', this.lifeLooks['civilian' + (i % 3)], (vx + rnd(-3, 3)) * CELL, (vy + rnd(-3, 3)) * CELL, 7);
      for (let i = 0; i < 4; i++) {
        // cows graze on open grass near the village fields
        const x = (vx + rnd(-8, 8)) * CELL, y = (vy + rnd(-8, 8)) * CELL;
        if (t.open(t.cellOf(x), t.cellOf(y), false)) add('cow', this.lifeLooks.cow, x, y, 4);
      }
    }
    // deer at forest edges
    let deer = 0;
    for (let k = 0; k < 400 && deer < 22; k++) {
      const [x, y] = t.trees[(Math.random() * t.trees.length) | 0];
      const nx = x + rnd(-30, 30), ny = y + rnd(-30, 30);
      if (t.open(t.cellOf(nx), t.cellOf(ny), false)) { add('deer', this.lifeLooks.deer, nx, ny, 8); deer++; }
    }
    // traffic on the roads
    t.roadLines.forEach((line, li) => {
      for (let i = 0; i < 3; i++) {
        const route = line.map(([cx, cy]) => [cx * CELL + 12, cy * CELL + 12] as [number, number]);
        const ri = 1 + ((i * 2 + li) % (route.length - 1));
        const kind = (i + li) % 2 ? 'pickup' : 'car';
        const [x, y] = route[ri - 1];
        this.agents.push({ kind, x, y, heading: 0, look: this.lifeLooks[kind + ((i + li) % 4)], speed: 26, home: [x, y], goal: null, wait: i * 6, scared: 0, route, ri, dir: 1, step: 0 });
      }
    });
    for (let i = 0; i < 4; i++) this.birds.push({ x: rnd(0, SW), y: rnd(0, SH), vx: rnd(14, 22) * (i % 2 ? 1 : -1), vy: rnd(-6, 6), n: 4 + (i % 4), seed: i * 7 });
  }

  updateLife(dt: number) {
    const t = this.terrain;
    for (const a of this.agents) {
      a.step += dt * 9;
      // anything military coming close makes people and animals scatter
      let threat: Unit | null = null, td = a.kind === 'deer' ? 90 : 46;
      if (a.kind !== 'car' && a.kind !== 'pickup')
        for (const u of this.units) { if (a.kind !== 'deer' && !u.def.vehicle) continue; const d = Math.hypot(u.x - a.x, u.y - a.y); if (d < td) { td = d; threat = u; } }
      if (threat) {
        const ang = Math.atan2(a.y - threat.y, a.x - threat.x) + (Math.random() - 0.5) * 0.6;
        a.goal = [a.x + Math.cos(ang) * 50, a.y + Math.sin(ang) * 50]; a.scared = 2.5; a.wait = 0;
      }
      if (a.route) { // cars follow their road, waiting if the army is in the way
        if (a.wait > 0) { a.wait -= dt; continue; }
        const [tx, ty] = a.route[a.ri!], dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
        if (d < 3) { a.ri! += a.dir!; if (a.ri! >= a.route.length || a.ri! < 0) { a.dir = -a.dir!; a.ri! += a.dir! * 2; a.wait = 3 + Math.random() * 6; } continue; }
        const want = Math.atan2(dy, dx);
        a.heading += Math.max(-dt * 2.5, Math.min(dt * 2.5, angDiff(a.heading, want)));
        const ahead = this.units.some((u) => Math.hypot(u.x - (a.x + Math.cos(a.heading) * 16), u.y - (a.y + Math.sin(a.heading) * 16)) < u.def.radius + 8);
        if (ahead) continue;
        const go = Math.max(0, Math.cos(angDiff(a.heading, want)));
        a.x += Math.cos(a.heading) * a.speed * dt * go; a.y += Math.sin(a.heading) * a.speed * dt * go;
        continue;
      }
      if (!a.goal) {
        if ((a.wait -= dt) > 0) continue;
        const r = a.kind === 'cow' ? 40 : a.kind === 'deer' ? 70 : 60, ang = Math.random() * Math.PI * 2;
        const gx = a.home[0] + Math.cos(ang) * Math.random() * r, gy = a.home[1] + Math.sin(ang) * Math.random() * r;
        if (t.open(t.cellOf(gx), t.cellOf(gy), false)) a.goal = [gx, gy];
        a.wait = a.kind === 'cow' ? 4 + Math.random() * 8 : 1 + Math.random() * 4;
        continue;
      }
      const dx = a.goal[0] - a.x, dy = a.goal[1] - a.y, d = Math.hypot(dx, dy);
      if (d < 2) { a.goal = null; continue; }
      a.heading = Math.atan2(dy, dx);
      const sp = a.speed * (a.scared > 0 ? (a.kind === 'cow' ? 2.5 : 3) : 1) * dt;
      a.scared -= dt;
      const nx = a.x + (dx / d) * sp, ny = a.y + (dy / d) * sp;
      if (t.open(t.cellOf(nx), t.cellOf(ny), false)) { a.x = nx; a.y = ny; } else a.goal = null;
    }
  }

  // Small flocks crossing the sky, with faint shadows far below.
  drawBirds(vx: number, vy: number) {
    const ctx = this.ctx, dt = 1 / 60;
    for (const f of this.birds) {
      f.x = (f.x + f.vx * dt + SW) % SW; f.y = (f.y + f.vy * dt + SH) % SH;
      for (let i = 0; i < f.n; i++) {
        const bx = Math.round(f.x - vx + ((i * 7 + f.seed) % 11) - 5 - (i * Math.sign(f.vx)) * 4), by = Math.round(f.y - vy + ((i * 5 + f.seed) % 9) - 4 + i * 2);
        if (bx < -10 || by < -10 || bx > this.FW + 10 || by > this.FH + 10) continue;
        const up = Math.floor(this.time * 7 + i) % 2;
        ctx.fillStyle = 'rgba(10,16,24,0.18)'; ctx.fillRect(bx + 14, by + 26, 3, 1);
        ctx.fillStyle = '#2a2622';
        ctx.fillRect(bx, by, 1, 1); ctx.fillRect(bx - 1, by - up, 1, 1); ctx.fillRect(bx + 1, by - up, 1, 1);
      }
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

  // The logo: chunky gold letters with a bevel (bright top edge, dark base), an ink drop shadow,
  // and a red banner underneath.
  logo(y: number) {
    const ctx = this.ctx, s = 4, word = 'CONQUER', w = textWidth(word, s), x = Math.round((this.FW - w) / 2);
    text(ctx, word, x + 3, y + 3, C.ink, s);
    text(ctx, word, x, y + 1, '#6a4c10', s);
    text(ctx, word, x, y, C.goldD, s);
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, w + 4, 3 * s); ctx.clip();
    text(ctx, word, x, y - 1, '#ffe27a', s);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y + 3 * s - 1, w + 4, 5 * s); ctx.clip();
    text(ctx, word, x, y - 1, C.gold, s);
    ctx.restore();
    const by = y + 7 * s + 4;
    ctx.fillStyle = C.ink; ctx.fillRect(x - 5, by + 1, w + 12, 7);
    ctx.fillStyle = C.redD; ctx.fillRect(x - 6, by, w + 12, 6);
    ctx.fillStyle = C.red; ctx.fillRect(x - 6, by, w + 12, 4);
    ctx.fillStyle = '#e04a34'; ctx.fillRect(x - 6, by, w + 12, 1);
    for (let i = x; i < x + w; i += 10) { ctx.fillStyle = C.gold; ctx.fillRect(i, by + 1, 2, 2); }
  }

  // Propaganda sunburst: alternating red rays fanning out behind the logo, dithered toward the
  // edges so they fade into the battlefield. Drawn once into a cached image (only redrawn on resize).
  private burst: HTMLCanvasElement | null = null;
  sunburst(cx: number, cy: number, r: number) {
    const key = r * 10000 + cx;
    if (!this.burst || (this.burst as any).key !== key) {
      const c = document.createElement('canvas'), w = Math.ceil(r * 3.2), h = r * 2;
      c.width = w; c.height = h; (c as any).key = key;
      const bctx = c.getContext('2d')!, img = bctx.createImageData(w, h), d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x - w / 2) / 1.6, dy = y - r, dist = Math.hypot(dx, dy);
        if (dist > r || dist < 6) continue;
        if (!(Math.floor((Math.atan2(dy, dx) / (Math.PI * 2)) * 24 + 24) % 2)) continue;
        const fade = dist / r;
        if ((fade > 0.55 && ((x + y) & 1)) || (fade > 0.8 && ((x | y) & 1))) continue;
        const k = (y * w + x) * 4;
        d[k] = 184; d[k + 1] = 40; d[k + 2] = 28; d[k + 3] = fade < 0.35 ? 64 : 38;
      }
      bctx.putImageData(img, 0, 0);
      this.burst = c;
    }
    this.ctx.drawImage(this.burst, Math.round(cx - this.burst.width / 2), cy - r);
  }

  drawTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,8,10,0.5)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const y = Math.round(this.FH * 0.24);
    this.sunburst(Math.round(this.FW / 2), y + 14, Math.round(Math.min(this.FW, this.FH) * 0.26));
    this.logo(y);
    const tag = 'EVERY BUILDING IS A SUGGESTION.';
    text(ctx, tag, Math.round((this.FW - textWidth(tag)) / 2), y + 44, C.cream, 1, C.ink);
    const pw = 120, px = Math.round((this.FW - pw) / 2), py = y + 66, ph = 16 + this.menuItems.length * 16;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    this.menuItems.forEach((m, i) => {
      const label = m.label(), ty = py + 9 + i * 16, hot = i === this.menuHot;
      if (hot) {
        ctx.fillStyle = C.red; ctx.fillRect(px + 6, ty - 3, pw - 12, 13);
        ctx.fillStyle = '#e04a34'; ctx.fillRect(px + 6, ty - 3, pw - 12, 1);
        ctx.fillStyle = C.redD; ctx.fillRect(px + 6, ty + 9, pw - 12, 1);
        const bob = Math.floor(this.time * 4) % 2; // a small pointer that nudges in and out
        text(ctx, '>', px + 10 + bob, ty, C.gold, 1, C.ink); text(ctx, '<', px + pw - 15 - bob, ty, C.gold, 1, C.ink);
      }
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
    const cr = '$ ' + Math.floor(this.prod.credits).toLocaleString('en-US');
    inset(ctx, Math.round(W / 2) - 40, 2, 80, 9, C.screen);
    text(ctx, cr, Math.round(W / 2 - textWidth(cr) / 2), 3, C.gold);
    // power: how much the base uses against how much it makes
    const low = this.power.used > this.power.made, pwX = W - 110;
    text(ctx, 'POWER', pwX, 3, low ? C.bad : C.goldD);
    inset(ctx, pwX + 33, 3, 72, 7, C.ink);
    const cap = Math.max(this.power.made, this.power.used, 1);
    ctx.fillStyle = low ? C.bad : C.ok; ctx.fillRect(pwX + 34, 4, Math.round((this.power.made / cap) * 70), 2);
    ctx.fillStyle = low && Math.floor(this.time * 3) % 2 ? '#ff8060' : C.warn; ctx.fillRect(pwX + 34, 7, Math.round((this.power.used / cap) * 70), 2);
    const y = H - CONSOLE;
    panel(ctx, 0, y, W, CONSOLE); trim(ctx, 0, y, W); rivets(ctx, 0, y + 3, W, CONSOLE - 3);
    // minimap
    const mx = 6, my = y + 9, ms = 66;
    inset(ctx, mx, my, ms, ms, C.ink);
    ctx.drawImage(this.terrain.minimap, mx + 1, my + 1);
    const sc = 64 / SW; // the minimap shows the turned map, like the main view
    for (const b of this.blds) { const [bx, by] = toScreen((b.cx + 1.5) * CELL, (b.cy + 1.5) * CELL); ctx.fillStyle = b.team === 0 ? '#6ab8ff' : '#ff5a40'; ctx.fillRect(mx + Math.floor(bx * sc), my + Math.floor(by * sc), 2, 2); }
    for (const u of this.units) { const [ux, uy] = toScreen(u.x, u.y); ctx.fillStyle = u.team === 0 ? '#6ab8ff' : '#ff5a40'; ctx.fillRect(mx + 1 + Math.floor(ux * sc), my + 1 + Math.floor(uy * sc), 1, 1); }
    const rx = mx + 1 + Math.round(this.vx * sc), ry = my + 1 + Math.round((this.vy + TOP) * sc), rw = Math.round(this.FW * sc), rh = Math.round((this.FH - CONSOLE - TOP) * sc);
    ctx.save(); ctx.beginPath(); ctx.rect(mx + 1, my + 1, 64, 64); ctx.clip();
    ctx.fillStyle = C.cream;
    ctx.fillRect(rx, ry, rw, 1); ctx.fillRect(rx, ry + rh, rw + 1, 1); ctx.fillRect(rx, ry, 1, rh); ctx.fillRect(rx + rw, ry, 1, rh);
    // radar sweep: a green line turning around the centre with a fading trail
    for (let k = 0; k < 4; k++) {
      const a = this.time * 1.6 - k * 0.07;
      ctx.fillStyle = `rgba(126,224,138,${0.5 - k * 0.12})`;
      for (let r = 2; r < 46; r += 1) ctx.fillRect(mx + 33 + Math.round(Math.cos(a) * r), my + 33 + Math.round(Math.sin(a) * r), 1, 1);
    }
    if (this.power.used > this.power.made) { // not enough power: the radar breaks up into static
      for (let i = 0; i < 260; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#1a1c1a' : '#6a706a'; ctx.fillRect(mx + 1 + ((Math.random() * 64) | 0), my + 1 + ((Math.random() * 64) | 0), 1, 1); }
      if (Math.floor(this.time * 2) % 2) text(ctx, 'LOW POWER', mx + 6, my + 29, C.bad, 1, C.ink);
    }
    ctx.restore();
    glass(ctx, mx, my, ms, ms);
    plate(ctx, 'RADAR', mx + 3, my - 5);
    // selection
    const sx = mx + ms + 8, sw = W - sx - 206;
    inset(ctx, sx, my, sw, ms, C.screen);
    ctx.save(); ctx.beginPath(); ctx.rect(sx + 1, my + 1, sw - 2, ms - 2); ctx.clip(); // keep text inside the screen
    const sel = this.selected();
    if (this.bark.t > 0) {
      text(ctx, this.bark.who.toUpperCase() + ':', sx + 5, my + 8, C.gold);
      text(ctx, this.bark.line.toUpperCase(), sx + 5 + textWidth(this.bark.who + ': '), my + 8, C.cream);
    } else if (this.selBld && !sel.length) {
      const b = this.selBld, pw = POWER[b.type] ?? 0, q = this.prod.queues[b.type];
      text(ctx, b.name.toUpperCase() + (b.rise < 1 ? ' (BUILDING)' : ''), sx + 5, my + 8, C.gold);
      text(ctx, pw ? `POWER ${pw > 0 ? '+' : ''}${pw}` : '', sx + 5, my + 18, pw > 0 ? C.ok : C.warn);
      const info = b.type === 'scrapyard' ? 'SALVAGERS UNLOAD SCRAP HERE FOR CREDITS.' : q ? (q.length ? `TRAINING ${q[0].def.name.toUpperCase()} ${Math.floor(this.prod.progress(q[0]) * 100)}%  QUEUE ${q.length}` : 'IDLE. ORDER UNITS FROM THE BUILD PANEL.') : b.type === 'generator' ? 'KEEP POWER ABOVE USE OR EVERYTHING SLOWS.' : '';
      text(ctx, info, sx + 5, my + 30, C.cream);
      if (q || b.type === 'fieldCommand') text(ctx, 'RIGHT-CLICK THE GROUND TO SET A RALLY POINT.', sx + 5, my + 42, C.muted);
    } else if (this.hoverBld && CAPTURE[this.hoverBld.type]) {
      const b = this.hoverBld, c = CAPTURE[b.type], owner = b.team === 0 ? 'YOURS' : b.team === 1 ? 'ENEMY' : 'NEUTRAL';
      text(ctx, c.name.toUpperCase() + ' (' + owner + (c.garrison ? `, ${b.garrison}/${c.garrison} INSIDE` : '') + ')', sx + 5, my + 8, C.gold);
      text(ctx, c.tip, sx + 5, my + 18, C.cream);
    } else text(ctx, sel.length ? `${sel.length} SELECTED` : 'NO UNITS SELECTED', sx + 5, my + 8, C.muted);
    if (!sel.length && !this.selBld) {
      text(ctx, 'DRAG A BOX OVER YOUR UNITS,', sx + 5, my + 28, C.muted);
      text(ctx, 'THEN RIGHT-CLICK THE GROUND.', sx + 5, my + 38, C.muted);
    }
    const slot = 26, per = Math.max(1, Math.floor((sw - 8) / (slot + 2)));
    const shown = sel.length > per ? per - 1 : per; // one row of portraits; the last slot says how many more
    if (sel.length > per) text(ctx, '+' + (sel.length - shown), sx + 6 + shown * (slot + 2), my + 30, C.gold);
    sel.slice(0, shown).forEach((u, i) => {
      const px = sx + 4 + i * (slot + 2), py = my + 20;
      ctx.fillStyle = C.screenL; ctx.fillRect(px, py, slot, slot - 2);
      ctx.save(); ctx.beginPath(); ctx.rect(px, py, slot, slot - 2); ctx.clip();
      const look = this.looks[u.type + u.team], s = facing(look.body, Math.PI * 0.25);
      ctx.drawImage(s.img, Math.round(px + slot / 2 - s.ax), Math.round(py + slot / 2 + 3 - s.ay));
      if (look.turret) { const t = facing(look.turret, Math.PI * 0.25); ctx.drawImage(t.img, Math.round(px + slot / 2 - t.ax + 1), Math.round(py + slot / 2 - 4 - t.ay)); }
      ctx.restore();
      bar(ctx, px + 1, py + slot - 1, slot - 2, u.hp / u.def.hp);
    });
    ctx.restore();
    glass(ctx, sx, my, sw, ms);
    plate(ctx, 'COMMAND', sx + 3, my - 5);
    // orders
    const bx = W - 196, M = this.mouse;
    plate(ctx, 'ORDERS', bx, my - 5);
    this.buttons = [
      { id: 'stop', x: bx, y: my + 10, w: 62, h: 17, label: 'STOP', key: 'S', icon: ICON.stop },
      { id: 'scatter', x: bx, y: my + 29, w: 62, h: 17, label: 'SPLIT', key: 'X', icon: ICON.scatter },
      { id: 'home', x: bx, y: my + 48, w: 62, h: 17, label: 'BASE', key: 'H', icon: ICON.home },
    ];
    for (const b of this.buttons) {
      const hot = M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h;
      button(ctx, b, hot, hot && M.down);
    }
    this.drawBuildPanel(W - 128, my);
  }

  // The build panel: tabs for structures and units, then a grid of buttons showing each item's
  // picture and price, with progress filling in as credits are spent.
  drawBuildPanel(x: number, y: number) {
    const ctx = this.ctx, M = this.mouse, p = this.prod;
    plate(ctx, 'BUILD', x, y - 5);
    this.tabs = [{ id: 'structure', x, y: y + 6, w: 60, h: 10 }, { id: 'unit', x: x + 62, y: y + 6, w: 60, h: 10 }];
    for (const tb of this.tabs) {
      const on = this.buildTab === tb.id;
      ctx.fillStyle = C.metalD; ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
      ctx.fillStyle = on ? C.red : C.metal; ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, tb.h - 2);
      const label = tb.id === 'structure' ? 'BASE' : 'ARMY';
      text(ctx, label, tb.x + Math.round((tb.w - textWidth(label)) / 2), tb.y + 2, on ? C.gold : C.muted);
    }
    this.slots = [];
    const defs = BUILDS.filter((d) => d.kind === this.buildTab);
    defs.forEach((d, i) => {
      const sx = x + (i % 3) * 41, sy = y + 18 + Math.floor(i / 3) * 25, w = 39, h = 23;
      this.slots.push({ def: d, x: sx, y: sy, w, h });
      const ok = this.available(d), hot = M.x > sx && M.x < sx + w && M.y > sy && M.y < sy + h;
      inset(ctx, sx, sy, w, h, hot && ok ? '#24301f' : C.screen);
      ctx.save(); ctx.beginPath(); ctx.rect(sx + 1, sy + 1, w - 2, h - 2); ctx.clip();
      if (d.kind === 'structure') { const ic = this.icons[d.key]; ctx.drawImage(ic.img, Math.round(sx + w / 2 - ic.ax), Math.round(sy + h - 3 - ic.ay + ic.img.height * 0.2)); }
      else {
        const look = this.looks[d.key + '0'], s = facing(look.body, Math.PI * 0.25);
        ctx.drawImage(s.img, Math.round(sx + w / 2 - s.ax), Math.round(sy + h / 2 + 2 - s.ay));
        if (look.turret) { const tt = facing(look.turret, Math.PI * 0.25); ctx.drawImage(tt.img, Math.round(sx + w / 2 - tt.ax + 1), Math.round(sy + h / 2 - 5 - tt.ay)); }
      }
      // progress: the undone part stays dark
      const job = d.kind === 'structure' ? (p.structure?.def === d ? p.structure : null) : p.queues[d.from!]?.find((j) => j.def === d);
      const f = d.kind === 'structure' ? p.progress(job) : p.queues[d.from!][0]?.def === d ? p.progress(p.queues[d.from!][0]) : 0;
      if (job) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx + 1, sy + 1, w - 2, Math.round((h - 2) * (1 - f))); }
      if (!ok) { ctx.fillStyle = 'rgba(10,10,12,0.65)'; ctx.fillRect(sx + 1, sy + 1, w - 2, h - 2); }
      ctx.restore();
      const ready = d.kind === 'structure' && p.ready() && p.structure!.def === d;
      if (ready) { if (Math.floor(this.time * 3) % 2) text(ctx, 'READY', sx + 5, sy + 8, C.gold, 1, C.ink); }
      else text(ctx, String(d.cost), sx + 2, sy + h - 8, ok ? C.cream : C.muted, 1, C.ink);
      const count = d.kind === 'unit' ? p.queues[d.from!].filter((j) => j.def === d).length : 0;
      if (count) text(ctx, String(count), sx + w - 8, sy + 2, C.gold, 1, C.ink);
      if (hot) { this.bark = { who: d.name, line: this.tipFor(d), t: 0.05 }; }
    });
  }

  owns(key: string) { return this.blds.some((b) => b.team === 0 && b.type === key && b.rise >= 1); }
  available(d: BuildDef) { return d.kind === 'structure' ? (d.needs ?? []).every((n) => this.owns(n)) : this.owns(d.from!); }
  tipFor(d: BuildDef) {
    if (!this.available(d)) return d.kind === 'structure' ? 'NEEDS ' + (d.needs ?? []).map((n) => DEF[n].name.toUpperCase()).join(', ') : 'NEEDS ' + DEF[d.from!].name.toUpperCase();
    const pw = d.power ? `  POWER ${d.power > 0 ? '+' : ''}${d.power}` : '';
    return `$${d.cost}${pw}  ${d.kind === 'structure' ? 'CLICK TO BUILD, RIGHT-CLICK CANCELS' : 'CLICK TO TRAIN, RIGHT-CLICK REMOVES'}`;
  }

  buildClick(d: BuildDef, btn: number) {
    const p = this.prod;
    audio.click();
    if (d.kind === 'structure') {
      if (btn === 2) { if (p.structure?.def === d) { p.cancelStructure(); this.placing = null; } return; }
      if (p.ready() && p.structure!.def === d) { this.placing = d; return; }
      if (!p.structure && this.available(d)) p.structure = { def: d, spent: 0 };
      return;
    }
    if (btn === 2) { p.dequeue(d.from!); return; }
    if (this.available(d) && p.queues[d.from!].length < 6) p.queues[d.from!].push({ def: d, spent: 0 });
  }

  // ---- economy: production, power, placing structures, salvaging ----
  updateEconomy(dt: number) {
    this.power = { made: 0, used: 0 };
    for (const b of this.blds) {
      if (b.team !== 0 || b.rise < 1) continue;
      const pw = POWER[b.type] ?? 0;
      if (pw > 0) this.power.made += pw; else this.power.used -= pw;
    }
    const speed = this.power.used > this.power.made ? 0.5 : 1;
    for (const d of this.prod.tick(dt, speed, (k) => this.owns(k))) {
      const f = this.blds.find((b) => b.team === 0 && b.type === d.from && b.rise >= 1);
      if (!f) continue;
      const u = this.addUnit(d.key, 0, (f.cx + f.w / 2) * CELL, (f.cy + f.h + 0.6) * CELL);
      u.heading = u.tHead = Math.PI / 2;
      const r = f.rally ?? [(f.cx + f.w / 2) * CELL + (Math.random() - 0.5) * 30, (f.cy + f.h + 2.5) * CELL];
      u.goal = [r[0], r[1]]; u.path = findPath(this.terrain, u.x, u.y, r[0], r[1], u.def.crush);
      this.bark = { who: d.name, line: d.key === 'harvester' ? 'Salvager reporting. Show me the scrap.' : 'Reporting for duty.', t: 2.5 };
      audio.radio();
    }
    for (const b of this.blds) if (b.rise < 1) {
      b.rise = Math.min(1, b.rise + dt / 2.2);
      if (Math.random() < dt * 14) {
        const [px, py] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + b.h) * CELL);
        this.puffs.push({ x: px, y: py, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 4, t: 0, life: 1 + Math.random(), c: '#8a8070', s: 2 });
      }
    }
  }

  // Top-left cell for a structure centred under the mouse, and whether it may go there.
  placeAt(d: BuildDef): [number, number, boolean] {
    const M = this.mouse, [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy), t = this.terrain;
    const cx = Math.floor(gx / CELL - d.w! / 2 + 0.5), cy = Math.floor(gy / CELL - d.h! / 2 + 0.5);
    let ok = true, e = -1;
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) {
      if (!t.inside(x, y)) { ok = false; continue; }
      const i = t.idx(x, y), ty = t.type[i];
      if (ty !== 0 && ty !== 1 && ty !== 2 && ty !== 7 && ty !== 8 || t.occupied[i] || t.forest[i] || t.elev[i] === 1) ok = false;
      if (e < 0) e = t.elev[i]; else if (t.elev[i] !== e) ok = false;
    }
    if (this.units.some((u) => u.x > cx * CELL - 4 && u.x < (cx + d.w!) * CELL + 4 && u.y > cy * CELL - 4 && u.y < (cy + d.h!) * CELL + 4)) ok = false;
    const near = this.blds.some((b) => b.team === 0 && !CAPTURE[b.type] && cx < b.cx + b.w + 6 && cx + d.w! > b.cx - 6 && cy < b.cy + b.h + 6 && cy + d.h! > b.cy - 6);
    return [cx, cy, ok && near];
  }

  place() {
    const d = this.placing!, [cx, cy, ok] = this.placeAt(d);
    if (!ok) { audio.click(); return; }
    this.addBld(d.key, 0, cx, cy, d.w!, d.h!, d.name);
    const b = this.blds[this.blds.length - 1];
    b.rise = 0;
    this.prod.structure = null; this.placing = null;
    this.bark = { who: d.name, line: 'Breaking ground.', t: 2.5 };
    audio.radio();
    if (d.key === 'scrapyard') { // every scrapyard comes with a salvager
      const u = this.addUnit('harvester', 0, (cx + d.w! / 2) * CELL, (cy + d.h! + 0.8) * CELL);
      u.heading = u.tHead = Math.PI / 2;
    }
  }

  drawPlacement(vx: number, vy: number) {
    if (!this.placing || !this.inView(this.mouse.y)) return;
    const ctx = this.ctx, d = this.placing, [cx, cy, ok] = this.placeAt(d), t = this.terrain;
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) {
      const lift = t.lift((x + 0.5) * CELL, (y + 0.5) * CELL);
      const pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b2]) => { const [sx, sy] = toScreen(a * CELL, b2 * CELL); return [Math.round(sx - vx), Math.round(sy - lift - vy)]; });
      ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
      ctx.fillStyle = ok ? 'rgba(126,224,138,0.22)' : 'rgba(232,80,58,0.28)'; ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(126,224,138,0.8)' : 'rgba(232,80,58,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    }
    const s = this.looks[d.key + '0'].body[0], [bx, by] = this.scr({ x: (cx + d.w! / 2) * CELL, y: (cy + d.h! / 2) * CELL });
    ctx.globalAlpha = 0.55; ctx.drawImage(s.img, Math.round(bx - vx - s.ax), Math.round(by - vy - s.ay)); ctx.globalAlpha = 1;
  }

  // Salvagers work on their own: find scrap, fill up, haul it to the nearest scrapyard, unload.
  salvage(u: Unit, dt: number) {
    if (u.path.length || u.goal) return; // busy following an order or a route
    const t = this.terrain;
    const yards = this.blds.filter((b) => b.team === 0 && b.type === 'scrapyard' && b.rise >= 1);
    if (!yards.length) return;
    const bay = (b: Bld): [number, number] => [(b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.6) * CELL];
    if (u.unloading) {
      const amt = Math.min(UNLOAD_RATE * dt, u.cargo);
      u.cargo -= amt; this.prod.credits += amt;
      if (u.cargo <= 0) { u.cargo = 0; u.unloading = false; }
      return;
    }
    if (u.cargo >= SCRAP_LOAD) {
      const yard = yards.reduce((a, b) => (Math.hypot(...sub(bay(a), u)) < Math.hypot(...sub(bay(b), u)) ? a : b));
      const [bx, by] = bay(yard);
      if (Math.hypot(bx - u.x, by - u.y) < 16) { u.unloading = true; return; }
      u.goal = [bx, by]; u.path = findPath(t, u.x, u.y, bx, by, true);
      return;
    }
    const ci = t.idx(t.cellOf(u.x), t.cellOf(u.y));
    if (t.scrap[ci] > 0) {
      const take = Math.min(HARVEST_RATE * dt, t.scrap[ci], SCRAP_LOAD - u.cargo);
      u.cargo += take; t.scrap[ci] = Math.max(0, t.scrap[ci] - take);
      if (t.scrap[ci] <= 0) t.clearScrap(t.cellOf(u.x), t.cellOf(u.y));
      if (Math.random() < dt * 4) { const [px, py] = this.scr(u); this.puffs.push({ x: px + (Math.random() - 0.5) * 10, y: py - 6, vx: (Math.random() - 0.5) * 6, vy: -4, t: 0, life: 0.8, c: '#8a5a34', s: 1 }); }
      u.heading += dt * 0.6; // working the field
      return;
    }
    // nearest scrap, searching outward ring by ring
    const cx0 = t.cellOf(u.x), cy0 = t.cellOf(u.y);
    for (let r = 1; r < 50; r++) {
      let best = -1, bd = 1e9;
      for (let y = cy0 - r; y <= cy0 + r; y++) for (let x = cx0 - r; x <= cx0 + r; x++) {
        if (Math.max(Math.abs(x - cx0), Math.abs(y - cy0)) !== r || !t.inside(x, y)) continue;
        const i = t.idx(x, y);
        if (t.scrap[i] > 0 && !t.occupied[i]) { const dd = Math.hypot(x - cx0, y - cy0); if (dd < bd) { bd = dd; best = i; } }
      }
      if (best >= 0) {
        const gx = ((best % N) + 0.5) * CELL, gy = (Math.floor(best / N) + 0.5) * CELL;
        u.goal = [gx, gy]; u.path = findPath(t, u.x, u.y, gx, gy, true);
        return;
      }
    }
  }

  minimapHit(x: number, y: number) { const my = this.FH - CONSOLE + 9; return x > 7 && x < 71 && y > my + 1 && y < my + 65; }
  minimapJump() {
    const my = this.FH - CONSOLE + 9;
    const sc = SW / 64, cx = (this.mouse.x - 7) * sc, cy = (this.mouse.y - my - 1) * sc;
    this.centreScreen(cx, cy); this.vx = this.goalX; this.vy = this.goalY;
  }
  uiClick(btn: number) {
    const M = this.mouse;
    if (M.y < TOP) return true;
    if (M.y < this.FH - CONSOLE) return false;
    if (btn === 0 && this.minimapHit(M.x, M.y)) { this.minimapJump(); M.down = true; M.sx = M.x; M.sy = M.y; return true; }
    if (btn === 2 && this.minimapHit(M.x, M.y)) {
      const my = this.FH - CONSOLE + 9;
      this.command((M.x - 7) * (SW / 64), (M.y - my - 1) * (SW / 64));
      return true;
    }
    for (const b of this.buttons) if (M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h) { this.order(b.id); return true; }
    for (const tb of this.tabs) if (M.x > tb.x && M.x < tb.x + tb.w && M.y > tb.y && M.y < tb.y + tb.h) { this.buildTab = tb.id; audio.click(); return true; }
    for (const sl of this.slots) if (M.x > sl.x && M.x < sl.x + sl.w && M.y > sl.y && M.y < sl.y + sl.h) { this.buildClick(sl.def, btn); return true; }
    return true;
  }
}

// A tileable sheet of soft cloud shadow.
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
    // smooth, soft-edged and see-through: no dither pattern to crawl over sprite shadows
    d[k] = 8; d[k + 1] = 14; d[k + 2] = 22; d[k + 3] = Math.max(0, Math.min(1, (n - 0.53) / 0.1)) * 54;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const sub = (a: [number, number], u: { x: number; y: number }): [number, number] => [a[0] - u.x, a[1] - u.y];

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
