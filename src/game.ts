// The game: a big painted map, pre-rendered pixel sprites, and the pixel-art interface,
// all drawn into one small frame that is blown up with hard square pixels.
import * as THREE from 'three';
import { Terrain, T, CELL, N, LIFT, YAW, YC, YS, SW, SH, MAP as MAPSIZE, toScreen, toGround } from './terrain';
import { bake, facing, Sprite } from './bake';
import { ART, CIVIC, LIFE, BASE, pine, broadleaf, stump } from './art';
import { BUILDS, DEF, POWER, Production, BuildDef, FOUNDRY_POWER, FOUNDRY_RATE, MISSILE_TIME, MISSILE_COST, INTERCEPT_RANGE, INTERCEPT_RELOAD, SHIELD_HP, SHIELD_R, SCRAP_LOAD, HARVEST_RATE, UNLOAD_RATE } from './build';
import { AI, Level } from './ai';
import { teamColors, ModelDef } from './models';
import { findPath } from './path';
import { audio } from './audio';
import { text, textWidth } from './font';
import { WEAPONS, BLD_HP, DEFENCE, Shell, Blast, Tracer, Weapon, Armour, drawBlast, drawShell, drawTracer } from './combat';
import { C, panel, rivets, inset, button, Button, cursor, bar, glass } from './ui';

const SB = 150;
// What each thing is for, shown on the build panel's tooltip.
const ROLE: Record<string, string> = {
  generator: 'POWER FOR YOUR BASE. LOW POWER SLOWS EVERYTHING.',
  scrapyard: 'COMES WITH A SALVAGER. SCRAP IS YOUR MAIN EARLY INCOME.',
  barracks: 'TRAINS INFANTRY. MORE BARRACKS TRAIN FASTER.',
  wall: 'CHEAP BLOCKS. FUNNEL ATTACKERS INTO YOUR GUNS.',
  guardTower: 'MACHINE GUN NEST. SHREDS INFANTRY, WEAK TO ARMOUR.',
  fieldCommand: 'YOUR RADAR, TRAINS BUILDERS, PAYS A SMALL ALLOWANCE.',
  depot: 'BUILDS VEHICLES. MORE DEPOTS BUILD FASTER.',
  hospital: 'HEALS INFANTRY NEARBY. UNLOCKS GRENADIERS.',
  workshop: 'REPAIRS VEHICLES NEARBY. UNLOCKS FIELD GUNS.',
  derrick: 'ON STRUCK OIL: POWER AND STEADY MONEY.',
  emplacement: 'HEAVY CANNON. STOPS TANKS COLD.',
  foundry: 'TURNS SPARE POWER INTO MONEY. FEED IT GENERATORS.',
  reactor: 'HUGE POWER. A HUGE BLAST IF IT IS DESTROYED.',
  airfield: 'BUILDS AIRCRAFT.',
  flakTower: 'ANTI-AIR GUN. CANNOT HIT GROUND TARGETS.',
  radar: 'REVEALS A WIDE AREA AROUND IT, SO YOUR GUNS CAN SEE.',
  battery: 'GIANT FIXED GUN. FIRES ACROSS HALF THE MAP AT WHAT YOU CAN SEE.',
  builder: 'PUTS UP BUILDINGS AND REPAIRS THEM.',
  rifle: 'CHEAP INFANTRY. CAPTURES SITES, GARRISONS BUNKERS.',
  rocket: 'KILLS TANKS AND AIRCRAFT. WEAK TO RIFLEMEN.',
  grenadier: 'BREAKS UP INFANTRY CROWDS, CLEARS BUNKERS.',
  scout: 'FAST AND FAR-SIGHTED. HUNTS INFANTRY, FINDS OIL.',
  harvester: 'COLLECTS SCRAP FOR MONEY. KEEP IT SAFE.',
  tank: 'ALL-ROUND ARMOUR. BEST AGAINST VEHICLES AND BUILDINGS.',
  flak: 'MOBILE ANTI-AIR. ESCORT YOUR ARMY.',
  colossus: 'SUPER-UNIT FORTRESS. CRUSHES ALL IN ITS PATH. MASS ROCKETS TO STOP ONE.',
  provingGround: 'BUILDS THE COLOSSUS.',
  silo: 'CHARGES A STRATEGIC MISSILE ($4000, 150S). SELECT IT AND RIGHT-CLICK TO LAUNCH.',
  interceptor: 'SHOOTS DOWN INCOMING MISSILES NEARBY. HOLDS TWO, RELOADS SLOWLY.',
  shield: 'A DOME THAT SOAKS UP SHELLS. HUNGRY FOR POWER: NO POWER, NO SHIELD.',
  artillery: 'LONG-RANGE GUN. OUTRANGES DEFENCES. HELPLESS UP CLOSE.',
  juggernaut: 'HUGE HEAVY TANK. RUNS OVER INFANTRY.',
  gunship: 'FLIES OVER RIVERS AND RIDGES. ROCKETS GROUND TARGETS.',
};
const GB = N / 4; // unit-grid buckets per side
const ALT = 26; // how high aircraft fly, in screen pixels
// where smoke leaves a building: [x, z, height, puffs per second]
const VENTS: Record<string, [number, number, number, number]> = { generator: [29, 18, 36, 5], scrapyard: [9, 9, 40, 3] }; // width of the side panel, in panel pixels

const TEAMS = [teamColors(0x4a78a8), teamColors(0xb04434), teamColors(0x8a8a82)]; // player, enemy, neutral (grey)
const CAR_PAINT = [0xc8a840, 0x5a7a9a, 0x8a3a2a, 0xd8d4c8].map(teamColors);
const SHIRTS = [0xa86a3a, 0x6a8a5a, 0xc8c0a8].map(teamColors);
// What each capturable site does once your infantry take it.
const CAPTURE: Record<string, { name: string; tip: string; garrison?: number }> = {
  motorPool: { name: 'Motor Pool', tip: 'CAPTURE: DELIVERS A TANK, THEN ONE EVERY 90S' },
  recruitOffice: { name: 'Recruiting Office', tip: 'CAPTURE: 3 RIFLEMEN, THEN 2 EVERY 60S' },
  bunker: { name: 'Bunker', tip: 'GARRISON UP TO 3 INFANTRY TO FIRE FROM COVER', garrison: 3 },
  watchtower: { name: 'Watchtower', tip: 'GARRISON 2 INFANTRY: HIGH GROUND, LONG SIGHT', garrison: 2 },
  fuelDepot: { name: 'Fuel Depot', tip: 'CAPTURE: PAYS $8 A SECOND WHILE YOU HOLD IT' },
};

interface UnitDef {
  name: string; hp: number; speed: number; turn: number; radius: number; crush: boolean; vehicle: boolean; facings: number; track: number; weapon?: string; air?: boolean; weapon2?: string; // weapon2: a second gun that fires on its own
  barks: { select: string[]; move: string[] };
}
const DEFS: Record<string, UnitDef> = {
  tank: {
    name: 'Battle Tank', hp: 400, speed: 30, turn: 2.2, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon: 'cannon',
    barks: { select: ['Armour\'s warm.', 'Point me at something.', 'Smile for the brochure.'], move: ['Rolling.', 'Mind the paint.', 'Out of my way, scenery.'] },
  },
  harvester: {
    name: 'Salvager', hp: 600, speed: 22, turn: 1.6, radius: 11, crush: true, vehicle: true, facings: 32, track: 5,
    barks: { select: ['One man\'s wreck...', 'Scrap is money.', 'Salvager ready.'], move: ['Off to find treasure.', 'Moving out.', 'Heavy load, slow road.'] },
  },
  builder: {
    name: 'Builder', hp: 500, speed: 22, turn: 1.8, radius: 10, crush: true, vehicle: true, facings: 32, track: 5,
    barks: { select: ['Hard hat on.', 'What are we building?', 'Measure twice, shell once.'], move: ['On my way.', 'Mind the paintwork.', 'Bringing the toolbox.'] },
  },
  rocket: {
    name: 'Rocket Soldier', hp: 50, speed: 13, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'rocket',
    barks: { select: ['Got a tin can for me?', 'Tube\'s loaded.', 'Armour? Lovely.'], move: ['Moving.', 'Heavy tube, short legs.', 'On my way.'] },
  },
  scout: {
    name: 'Scout Buggy', hp: 180, speed: 52, turn: 4, radius: 8, crush: false, vehicle: true, facings: 32, track: 2, weapon: 'mg',
    barks: { select: ['Wheels up!', 'Fastest thing out here.', 'Where to, boss?'], move: ['Floor it!', 'Hold on to something.', 'Yee-haw.'] },
  },
  artillery: {
    name: 'Field Gun', hp: 200, speed: 17, turn: 1.4, radius: 10, crush: false, vehicle: true, facings: 32, track: 4, weapon: 'howitzer',
    barks: { select: ['Give me coordinates.', 'Gun crew standing by.', 'Long way to be dangerous.'], move: ['Relocating the gun.', 'Slow and steady.', 'Keep the scouts close.'] },
  },
  grenadier: {
    name: 'Grenadier', hp: 70, speed: 13, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'grenade',
    barks: { select: ['Pin\'s in. For now.', 'Who\'s hiding?', 'Got a present for them.'], move: ['Moving.', 'Mind the satchel.', 'Right behind you.'] },
  },
  juggernaut: {
    name: 'Juggernaut', hp: 1100, speed: 18, turn: 1.1, radius: 13, crush: true, vehicle: true, facings: 32, track: 7, weapon: 'heavy',
    barks: { select: ['The ground shakes.', 'Juggernaut, awake.', 'Who needs a door?'], move: ['Advancing.', 'Nothing stops us.', 'Clear the road.'] },
  },
  gunship: {
    name: 'Gunship', hp: 320, speed: 62, turn: 3, radius: 9, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'gunrockets', air: true,
    barks: { select: ['Rotors turning.', 'Eyes in the sky.', 'Where do you want the rain?'], move: ['Inbound.', 'Low and fast.', 'Over the river we go.'] },
  },
  flak: {
    name: 'Flak Truck', hp: 260, speed: 30, turn: 1.8, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon: 'flak',
    barks: { select: ['Watching the skies.', 'Flak ready.', 'Anything with rotors.'], move: ['Rolling.', 'Keeping up.', 'Moving the guns.'] },
  },
  colossus: {
    name: 'Colossus', hp: 9000, speed: 12, turn: 0.6, radius: 22, crush: true, vehicle: true, facings: 32, track: 9, weapon: 'colossus', weapon2: 'colossusFlak',
    barks: { select: ['The earth trembles.', 'Colossus awaits.', 'Point. I will flatten.'], move: ['Advancing. Clear the way.', 'Nothing stands.', 'Onward.'] },
  },
  rifle: {
    name: 'Rifleman', hp: 75, speed: 15, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'rifle',
    barks: { select: ['Reporting, mostly intact.', 'Yes, Commander?', 'I read the pamphlet!'], move: ['On it.', 'Moving, moving!', 'Hup hup.'] },
  },
};

let nextId = 1;
class Unit {
  id = nextId++; hp: number; heading = Math.PI * 1.75; tHead = Math.PI * 1.75;
  path: [number, number][] = []; goal: [number, number] | null = null;
  selected = false; moving = false; trackAcc = 0; stuck = 0; bob = 0; scan = 0; scanTo = 0; dust = 0; enter: Bld | null = null;
  cargo = 0; unloading = false; // salvagers
  queue: [number, number][] = []; pace = 0; avoid = 0; progT = 0; px0 = 0; py0 = 0; // progT: watching for a unit that has a route but isn't getting anywhere // avoid: times it gave up on a goal
  buildSite: Bld | null = null; // builders: the construction site they're working on // waypoints still to visit; group pace (0 = own speed)
  kills = 0; reload2 = 0; target2: Unit | Bld | null = null; // veterancy; the second gun
  get rank() { return this.kills >= 15 ? 3 : this.kills >= 7 ? 2 : this.kills >= 3 ? 1 : 0; }
  target: Unit | Bld | null = null; forced = false; amove = false; reload = 0; scanT = Math.random() * 0.3; chase = 0; // combat
  constructor(public type: string, public def: UnitDef, public team: number, public x: number, public y: number) { this.hp = def.hp; }
}
interface Tree { x: number; y: number; v: number; fall: number; dir: number }
interface Bld { type: string; team: number; cx: number; cy: number; w: number; h: number; name: string; garrison: number; timer: number; rise: number; rally: [number, number] | null; pw?: number;
  hp: number; max: number; reload: number; tHead: number; target: Unit | Bld | null; dying: number; seen?: boolean;
  ammo?: number; shieldHp?: number; shieldDown?: number; lastHit?: number } // interceptors in stock; a shield's strength
// Civilians, cars and animals going about their day.
interface Agent { kind: string; x: number; y: number; heading: number; look: Sprite[]; speed: number; home: [number, number]; goal: [number, number] | null; wait: number; scared: number; route?: [number, number][]; ri?: number; dir?: number; step: number }
type Look = { body: Sprite[]; turret?: Sprite[]; def: ModelDef };

export class Game {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  // the interface has its own layer and pixel size, independent of the battlefield's zoom
  hud = document.createElement('canvas');
  hctx = this.hud.getContext('2d')!;
  kH = 3; HW = 640; HH = 360;
  seed = (Math.random() * 1e9) | 0; // a new map every game
  terrain = new Terrain(this.seed);
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
  FW = 640; FH = 360; k = 3; zoomStep = -1;
  vx = 0; vy = 0; goalX = 0; goalY = 0;
  state: 'loading' | 'title' | 'play' | 'paused' | 'won' | 'lost' = 'loading';
  level: Level = (() => { try { return (localStorage.getItem('conquer-level') as Level) || 'normal'; } catch { return 'normal'; } })();
  ai: AI | null = null;
  menuRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
  loadStep = 0; loadTotal = 1;
  mouse = { x: 0, y: 0, hx: 0, hy: 0, down: false, sx: 0, sy: 0, drag: false, mid: false, last: 0, in: false, onMap: false };
  keys = new Set<string>();
  groups: Unit[][] = [];
  prods = [new Production(), new Production()]; // player, enemy
  get prod() { return this.prods[0]; }
  powers = [{ made: 0, used: 0 }, { made: 0, used: 0 }];
  get power() { return this.powers[0]; }
  pathBudget = 30; // routes that may be planned this frame
  lastWall: [number, number] | null = null; wallDrag = false; idleCycle = 0; sellArm: Bld | null = null; sellT = 0; helpT = 0;
  aiRate = 1; // the enemy's income and build speed, set by difficulty
  placing: BuildDef | null = null;  // a finished structure waiting to be put down
  selBld: Bld | null = null;
  icons: Record<string, Sprite> = {};
  buildTab: 'structure' | 'unit' = 'structure';
  slots: { def: BuildDef; x: number; y: number; w: number; h: number }[] = [];
  tabs: { id: 'structure' | 'unit'; x: number; y: number; w: number; h: number }[] = [];

  gushers: { x: number; y: number; t: number; big: boolean }[] = [];
  shells: Shell[] = []; blasts: Blast[] = []; tracers: Tracer[] = []; fires: { x: number; y: number; t: number; s: number }[] = [];
  attackMode = false;
  endCheck = 1;
  vis = new Uint8Array(N * N); // your side's view: 0 never seen, 1 seen before, 2 in sight now
  fogT = 0; fogMini = document.createElement('canvas');
  stats = { built: [0, 0], lost: [0, 0], razed: [0, 0], time: 0 }; // razed[t]: buildings team t destroyed
  bark = { who: '', line: '', t: 0 };
  markers: { x: number; y: number; t: number }[] = [];
  buttons: Button[] = [];
  // The menu for the current screen: title, pause, or the end of a battle.
  get menuItems(): { id: string; label: string }[] {
    const sound = { id: 'sound', label: `SOUND: ${this.sound ? 'ON' : 'OFF'}` };
    if (this.state === 'title') return [{ id: 'deploy', label: 'DEPLOY' }, { id: 'level', label: `ENEMY: ${this.level.toUpperCase()}` }, sound];
    if (this.state === 'paused') return [{ id: 'resume', label: 'RESUME' }, { id: 'restart', label: 'RESTART' }, sound, { id: 'quit', label: 'QUIT TO TITLE' }];
    return [{ id: 'restart', label: 'PLAY AGAIN' }, { id: 'quit', label: 'TITLE SCREEN' }];
  }
  inMenu() { return this.state === 'title' || this.state === 'paused' || this.state === 'won' || this.state === 'lost'; }
  menuHot = 0; sound = true; time = 0;
  loadReport: Record<string, unknown> = {}; // how long loading took, for keeping it fast
  puffs: { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string; s: number; g?: number }[] = [];
  shakeAt = 0;
  clouds = makeClouds();
  shadowLayer = document.createElement('canvas');
  sctx = this.shadowLayer.getContext('2d')!;

  constructor(host: HTMLElement) {
    host.append(this.canvas, this.hud);
    Object.assign(this.hud.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none' });
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
        if (key === 'fieldCommand' && team === 0) this.icons[key] = bake(def, 'body', { team: TEAMS[0], yaw: YAW, scale: 0.3 })[0];
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
      for (const team of [0, 1]) this.looks[key + team] = { def, body: bake(def, 'body', { team: TEAMS[team], yaw: YAW }), turret: def.turret ? bake(def, 'turret', { facings: 32, team: TEAMS[team] }) : undefined }; // guns that turn
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
    let skip = false;
    try { skip = sessionStorage.getItem('conquer-skip') === '1'; sessionStorage.removeItem('conquer-skip'); } catch {}
    if (skip) this.menu('deploy'); // 'restart' goes straight back into battle
  }

  paintInWorkers(): Promise<void> {
    const t = this.terrain, n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)); // leave a core or two for the game itself
    return new Promise((done) => {
      const [bx, by] = toScreen(t.bases[0][0] * CELL, t.bases[0][1] * CELL), todo = t.neededChunks(bx, by);
      let left = todo.length;
      this.loadTotal += todo.length - t.chunkCount;
      try {
        for (let w = 0; w < n; w++) {
          const worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module' });
          const mine = todo.filter((_, k) => k % n === w);
          if (!mine.length) { worker.terminate(); continue; }
          worker.onmessage = (e) => {
            t.putChunk(e.data.i, e.data.d, e.data.glints);
            this.loadStep++;
            if (--left === 0) done();
            if (e.data.i === mine[mine.length - 1]) worker.terminate();
          };
          worker.postMessage({ seed: t.seed, chunks: mine });
        }
      } catch {
        // no workers: paint here instead
        t.prepare();
        for (const i of todo) { t.paintChunk(i); this.loadStep++; }
        done();
      }
    });
  }

  populate() {
    const t = this.terrain;
    for (const [x, y] of t.trees) this.trees[Math.floor(y / CELL)].push({ x, y, v: (Math.random() * this.treeLooks.length) | 0, fall: -1, dir: 0 });
    for (const row of this.trees) row.sort((a, b) => a.y - b.y);
    t.bases.forEach(([bx, by], team) => {
      this.addUnit('builder', team, bx * CELL, by * CELL); // every game starts with one Builder and your credits
    });
    for (const u of this.units) if (u.team === 1) u.heading = u.tHead = Math.PI * 0.75;
    for (const st of t.sites) this.addBld(st.kind, 2, st.cx, st.cy, st.w, st.h, CAPTURE[st.kind]?.name ?? 'House');
    this.spawnLife();
    t.hideOil();
    const [bx, by] = t.bases[0];
    this.centre(bx * CELL, by * CELL); this.vx = this.goalX; this.vy = this.goalY;
  }

  // Put a structure down on the nearest free, level ground to a cell (used to set up bases).
  autoPlace(key: string, team: number, cx0: number, cy0: number, rising = false): boolean {
    const d = DEF[key], t = this.terrain;
    for (let r = 0; r < 8; r++) for (let a = 0; a < 16; a++) {
      const cx = Math.round(cx0 + Math.cos((a / 16) * Math.PI * 2) * r), cy = Math.round(cy0 + Math.sin((a / 16) * Math.PI * 2) * r);
      let ok = true, e = -1;
      for (let y = cy - 1; y <= cy + d.h!; y++) for (let x = cx - 1; x <= cx + d.w!; x++) {
        if (!t.inside(x, y)) { ok = false; continue; }
        const i = t.idx(x, y), inside = x >= cx && x < cx + d.w! && y >= cy && y < cy + d.h!;
        if (t.occupied[i]) ok = false;
        if (inside && (t.forest[i] || t.elev[i] === 1 || (t.type[i] !== 0 && t.type[i] !== 1 && t.type[i] !== 7))) ok = false;
        if (inside) { if (e < 0) e = t.elev[i]; else if (t.elev[i] !== e) ok = false; }
      }
      if (ok) { this.addBld(key, team, cx, cy, d.w!, d.h!, d.name); if (rising) this.blds[this.blds.length - 1].rise = 0; return true; }
    }
    return false;
  }

  addUnit(type: string, team: number, x: number, y: number) { const u = new Unit(type, DEFS[type], team, x, y); this.units.push(u); return u; }
  addBld(type: string, team: number, cx: number, cy: number, w: number, h: number, name: string) {
    const hp = BLD_HP[type] ?? 0; // civilian and capturable buildings can't be destroyed (hp 0)
    this.blds.push({ type, team, cx, cy, w, h, name, garrison: 0, timer: 0, rise: 1, rally: null, hp, max: hp, reload: 0, tHead: Math.PI * 0.75, target: null, dying: -1 });
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
      const i = this.terrain.idx(x, y);
      this.terrain.occupied[i] = 1; this.terrain.forest[i] = 0;
    }
  }

  // ------------------------------------------------------------------ frame size
  resize() {
    const dpr = devicePixelRatio, dw = innerWidth * dpr, dh = innerHeight * dpr;
    const base = Math.max(2, Math.round(dw / 720));
    this.k = Math.max(this.zoomStep <= -2 ? 1 : 2, base + this.zoomStep); // the furthest zoom goes down to real pixels: a commander's view
    this.FW = Math.floor(dw / this.k); this.FH = Math.floor(dh / this.k);
    this.canvas.width = this.FW; this.canvas.height = this.FH;
    this.canvas.style.width = (this.FW * this.k) / dpr + 'px';
    this.canvas.style.height = (this.FH * this.k) / dpr + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.kH = Math.max(2, Math.round(dw / 720));
    this.HW = Math.floor(dw / this.kH); this.HH = Math.floor(dh / this.kH);
    this.hud.width = this.HW; this.hud.height = this.HH;
    this.hud.style.width = (this.HW * this.kH) / dpr + 'px'; this.hud.style.height = (this.HH * this.kH) / dpr + 'px';
    this.hctx.imageSmoothingEnabled = false;
  }
  zoom(step: number) {
    const cx = this.vx + this.FW / 2, cy = this.vy + this.FH / 2;
    const s = Math.max(-4, Math.min(2, this.zoomStep + step));
    if (s === this.zoomStep) return;
    this.zoomStep = s; this.resize();
    this.goalX = this.vx = cx - this.FW / 2; this.goalY = this.vy = cy - this.FH / 2;
  }

  // ------------------------------------------------------------------ input
  framePos(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect(), dpr = devicePixelRatio;
    this.mouse.hx = (e.clientX * dpr) / this.kH; this.mouse.hy = (e.clientY * dpr) / this.kH; // panel pixels
    return [((e.clientX - r.left) / r.width) * this.FW, ((e.clientY - r.top) / r.height) * this.FH];
  }
  // the part of the screen that shows the battlefield (left of the side panel)
  worldW() { return this.FW - (SB * this.kH) / this.k; }
  worldH() { return this.FH; }
  inView(_y?: number) { return this.mouse.hx < this.HW - SB; }

  bindInput() {
    const M = this.mouse, el = this.canvas;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.inMenu()) {
        const n = this.menuItems.length;
        if (e.code === 'ArrowDown') this.menuHot = (this.menuHot + 1) % n;
        if (e.code === 'ArrowUp') this.menuHot = (this.menuHot + n - 1) % n;
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.menu(this.menuItems[this.menuHot].id); }
        if ((e.code === 'Escape' || e.code === 'KeyP') && this.state === 'paused') this.menu('resume');
        return;
      }
      if (this.state !== 'play') return;
      if (e.code === 'KeyP' || (e.code === 'Escape' && !this.placing && !this.attackMode && !this.selected().length && !this.selBld)) { this.state = 'paused'; this.menuHot = 0; audio.click(); return; }
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
      if ((e.code === 'Delete' || e.code === 'Backspace') && this.selBld && this.selBld.team === 0) {
        if (this.selBld.rise < 1) this.cancelSite(this.selBld);
        else this.order('sell');
      }
      if (e.code === 'KeyR' && this.selBld && this.prod.queues[this.selBld.type]) this.order('repeat');
      if (e.code === 'Period') this.order('idleBuilder');
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) this.order(e.shiftKey ? 'idleArmy' : 'army');
      if (e.code === 'KeyT') { const types = new Set(this.selected().map((u) => u.type)); if (types.size) this.select(this.units.filter((u) => u.team === 0 && types.has(u.type)), false); }
      if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey && this.selected().length) this.attackMode = true;
      if (e.code === 'KeyE' && this.selBld && CAPTURE[this.selBld.type]?.garrison) this.emptyGarrison(this.selBld);
      if (e.code === 'KeyX') this.order('scatter');
      if (e.code === 'KeyH') this.order('home');
      if (e.code === 'Space') { e.preventDefault(); if (this.alertAt) this.centre(...this.alertAt); } // jump to the latest alert
      if (e.code === 'Tab') { e.preventDefault(); this.buildTab = this.buildTab === 'structure' ? 'unit' : 'structure'; this.selBld = null; audio.click(); }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoom(-1);
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoom(1);
      if (e.code === 'Escape') { this.attackMode = false; if (this.placing) this.placing = null; else { this.select([], false); this.selBld = null; } }
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
      if (this.inMenu()) { const hit = this.menuHit(); if (hit) this.menu(hit); return; }
      if (this.state !== 'play') return;
      if (e.button === 1) { M.mid = true; e.preventDefault(); return; }
      if (this.uiClick(e.button)) return;
      if (this.placing) { if (e.button === 0) { this.place(); this.wallDrag = this.placing?.key === 'wall'; } else this.placing = null; return; }
      if (this.attackMode) { if (e.button === 0) this.command(M.x + this.vx, M.y + this.vy, true); this.attackMode = false; return; }
      if (e.button === 0) { M.down = true; M.sx = M.x; M.sy = M.y; M.drag = false; }
      if (e.button === 2) {
        if (this.selBld?.type === 'silo' && this.selBld.team === 0 && !this.selected().length) { // aim the missile
          const [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy);
          if (!this.launch(this.selBld, gx, gy)) this.bark = { who: 'Missile Silo', line: `Not ready yet: ${Math.floor(((this.selBld.timer ?? 0) / MISSILE_TIME) * 100)}% charged.`, t: 2.5 };
          else this.markers.push({ x: gx, y: gy, t: 0 });
        } else if (this.selBld && !this.selected().length) { // a selected building: set where its new units gather
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
      if (M.down && M.onMap) this.minimapJump();
      if (this.wallDrag && this.placing?.key === 'wall') { const [cx, cy] = this.placeAt(this.placing); if (!this.lastWall || cx !== this.lastWall[0] || cy !== this.lastWall[1]) this.place(); } // drag to lay a line
      if (this.inMenu()) { const hit = this.menuHit(); if (hit) this.menuHot = this.menuItems.findIndex((m) => m.id === hit); }
    });
    addEventListener('pointerup', (e) => {
      this.wallDrag = false;
      if (e.button === 1) M.mid = false;
      if (e.button !== 0 || !M.down) return;
      M.down = false;
      if (M.onMap) { M.onMap = false; return; }
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
          this.selBld = b && b.team === 0 && (!CAPTURE[b.type] || b.garrison > 0) ? b : null;
          if (this.selBld) audio.click();
        }
        M.last = now;
      }
    });
    // Two-finger swipe (or the mouse wheel) slides the map. Pinching does nothing, so the view
    // never jumps by accident; zoom is on the - and = keys.
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.state !== 'play' || e.ctrlKey) return;
      const f = e.deltaMode === 1 ? 16 : 1; // some mice report lines, not pixels
      this.goalX += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * f * 0.5;
      if (!e.shiftKey) this.goalY += e.deltaY * f * 0.5;
    }, { passive: false });
    addEventListener('gesturestart', (e) => e.preventDefault()); // Safari's own pinch-to-zoom
  }

  menu(id: string) {
    audio.start(); audio.click();
    if (id === 'deploy') { this.state = 'play'; this.ai = new AI(this, this.level); this.say(this.units[0], 'select'); }
    if (id === 'level') {
      const order: Level[] = ['easy', 'normal', 'hard'];
      this.level = order[(order.indexOf(this.level) + 1) % 3];
      try { localStorage.setItem('conquer-level', this.level); } catch {}
    }
    if (id === 'sound') { this.sound = !this.sound; audio.master?.gain.setValueAtTime(this.sound ? 0.8 : 0, 0); }
    if (id === 'resume') this.state = 'play';
    if (id === 'restart' || id === 'quit') { try { sessionStorage.setItem('conquer-skip', id === 'restart' ? '1' : ''); } catch {} location.reload(); }
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
  command(px: number, py: number, amove = false) {
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
    const crew = sel.filter((u) => u.type === 'builder');
    if (site && site.team === 0 && site.max > 0 && (site.rise < 1 || site.hp < site.max) && crew.length) { for (const u of crew) this.assignSite(u, site); this.say(crew[0], 'move'); return; }
    for (const u of crew) u.buildSite = null;
    const enemy = this.enemyAt(px, py);
    if (enemy && !amove) { // attack!
      for (const u of sel) if (u.def.weapon) { u.target = enemy; u.forced = true; u.amove = false; u.chase = 0; u.goal = null; u.path = []; }
      this.bark = { who: sel[0].def.name, line: ['Engaging.', 'Target acquired.', 'With pleasure.', 'They had it coming.'][(Math.random() * 4) | 0], t: 2.5 };
      audio.radio();
      return;
    }
    for (const u of sel) { u.forced = false; u.amove = amove; if (!amove) u.target = null; }
    // Formation: everyone keeps their place relative to the group (squeezed if spread out) and
    // the group moves at its slowest member's pace, so they arrive together.
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length, cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
    const spread = Math.max(1, ...sel.map((u) => Math.hypot(u.x - cx, u.y - cy))), fit = Math.sqrt(sel.length) * 12 + 8;
    const squeeze = spread > fit ? fit / spread : 1, pace = Math.min(...sel.map((u) => u.def.speed));
    const queue = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); // Shift: add a waypoint
    const shared = sel.length > 8 ? this.sharedRoutes(cx, cy, wx, gy) : null;
    for (const u of sel) {
      const g: [number, number] = [wx + (u.x - cx) * squeeze, gy + (u.y - cy) * squeeze];
      u.pace = sel.length > 1 ? pace : 0;
      if (queue && (u.goal || u.queue.length)) { u.queue.push(g); continue; }
      u.queue = []; u.goal = g; u.stuck = 0;
      u.path = u.def.air ? [g] : shared ? this.followRoute(u, shared[u.def.crush ? 1 : 0], cx, cy, g) : findPath(this.terrain, u.x, u.y, g[0], g[1], u.def.crush);
    }
    this.markers.push({ x: wx, y: gy, t: 0 });
    this.say(sel[0], 'move');
  }
  // How a unit gets somewhere: aircraft fly straight, everyone else plans a route on the ground.
  route(u: Unit, x: number, y: number): [number, number][] { return u.def.air ? [[x, y]] : findPath(this.terrain, u.x, u.y, x, y, u.def.crush); }
  // One route for the whole group (one for vehicles that can crush trees, one for those that can't).
  sharedRoutes(cx: number, cy: number, tx: number, ty: number): [[number, number][], [number, number][]] {
    return [findPath(this.terrain, cx, cy, tx, ty, false), findPath(this.terrain, cx, cy, tx, ty, true)];
  }
  // Each unit follows the group's route shifted by its place in the group (where that ground is
  // open), ending at its own spot; if it bumps into something it plans its own way round.
  followRoute(u: Unit, route: [number, number][], cx: number, cy: number, g: [number, number]): [number, number][] {
    const t = this.terrain, ox = (u.x - cx) * 0.5, oy = (u.y - cy) * 0.5, out: [number, number][] = [];
    for (let i = 0; i < route.length - 1; i++) {
      const [x, y] = route[i], sx = x + ox, sy = y + oy;
      out.push(t.open(t.cellOf(sx), t.cellOf(sy), u.def.crush) ? [sx, sy] : [x, y]);
    }
    out.push(g);
    return out;
  }
  order(id: string) {
    if (id === 'home') { const [bx, by] = this.terrain.bases[0]; this.centre(bx * CELL, by * CELL); return; }
    if (id === 'army' || id === 'idleArmy') { // everything that fights (or only the ones standing about)
      const army = this.units.filter((u) => u.team === 0 && u.def.weapon && !u.enter && (id === 'army' || (!u.goal && !u.path.length && !u.target)));
      this.select(army, false); audio.click();
      this.bark = { who: 'Command', line: army.length ? `${army.length} ${id === 'army' ? 'units' : 'idle units'} selected.` : 'Nobody to select.', t: 2 };
      return;
    }
    if (id === 'idleBuilder') { // cycle through builders with nothing to do
      const idle = this.builders(0).filter((u) => !u.buildSite && !u.goal && !u.path.length);
      if (!idle.length) { this.bark = { who: 'Command', line: 'Every builder is busy.', t: 2 }; return; }
      const u = idle[this.idleCycle++ % idle.length];
      this.select([u], false); this.centre(u.x, u.y); audio.click();
      return;
    }
    if (id === 'repeat' && this.selBld && this.prod.queues[this.selBld.type]) {
      const k = this.selBld.type, on = (this.prod.repeat[k] = !this.prod.repeat[k]);
      this.bark = { who: this.selBld.name, line: on ? 'Repeating: finished units go back on the queue.' : 'Repeat off.', t: 2.5 }; audio.click();
      return;
    }
    if (id === 'sell' && this.selBld) { // press twice to sell, so a slip of the finger can't
      const b = this.selBld, d = DEF[b.type];
      if (!d || b.rise < 1 || b.dying >= 0) return;
      if (this.sellArm !== b || this.time - this.sellT > 2.5) { this.sellArm = b; this.sellT = this.time; this.bark = { who: b.name, line: `Press Delete again to sell for $${Math.round(d.cost * 0.5 * b.hp / b.max)}.`, t: 2.5 }; return; }
      const refund = Math.round(d.cost * 0.5 * b.hp / b.max);
      this.prods[0].credits += refund;
      this.blds = this.blds.filter((o) => o !== b);
      for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
      this.selBld = null; this.sellArm = null;
      this.bark = { who: 'Command', line: `${b.name} sold for $${refund}.`, t: 2.5 }; audio.click();
      return;
    }
    const sel = this.selected();
    if (!sel.length) return;
    audio.click();
    for (const u of sel) {
      if (id === 'stop') { u.path = []; u.goal = null; u.queue = []; u.pace = 0; }
      if (id === 'scatter') {
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
        u.goal = [u.x + Math.cos(a) * d, u.y + Math.sin(a) * d];
        u.path = this.route(u, u.goal[0], u.goal[1]);
      }
    }
  }
  centre(x: number, y: number) { const [sx, sy] = toScreen(x, y); this.centreScreen(sx, sy); }
  centreScreen(sx: number, sy: number) { this.goalX = sx - this.worldW() / 2; this.goalY = sy - this.FH / 2; }

  // ground point under a screen point (raised ground is drawn higher up the screen)
  // the ground point under a screen point (raised ground is drawn higher up the screen)
  groundAt(sx: number, sy: number): [number, number] {
    for (const e of [2, 1]) { const [gx, gy] = toGround(sx, sy + e * LIFT); if (this.terrain.elevAt(gx, gy) === e) return [gx, gy]; }
    return toGround(sx, sy);
  }
  // where a ground point is drawn on screen (map space; subtract the view to get frame pixels)
  scr(p: { x: number; y: number; def?: UnitDef; id?: number }): [number, number] { const [sx, sy] = toScreen(p.x, p.y); return [sx, sy - (p.def?.air ? ALT + Math.sin(this.time * 2 + (p.id ?? 0)) * 1.5 : this.terrain.lift(p.x, p.y))]; }
  onScreen(u: Unit) { const [x, y] = this.scr(u), sx = x - this.vx, sy = y - this.vy; return sx > 0 && sx < this.worldW() && sy > 0 && sy < this.FH; }
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
    this.goalX = Math.max(-8, Math.min(SW - this.worldW() + 8, this.goalX));
    this.goalY = Math.max(-16, Math.min(SH - this.FH + 8, this.goalY));
    this.vx += (this.goalX - this.vx) * (1 - Math.exp(-dt * 14));
    this.vy += (this.goalY - this.vy) * (1 - Math.exp(-dt * 14));
    this.buildGrid(); this.pathBudget = 30;
    for (const u of this.units) this.move(u, dt);
    this.separate();
    this.updateTrees(dt);
    this.updateLife(dt);
    this.updateSites(dt);
    this.updateEconomy(dt);
    this.updateCombat(dt);
    this.updateMissiles(dt);
    this.ai?.update(dt);
    if ((this.fogT -= dt) <= 0) { this.fogT = 0.25; this.updateFog(); }
    this.stats.time += dt;
    if ((this.endCheck -= dt) <= 0) { this.endCheck = 1; this.checkEnd(); }
    // steam from cooling towers, smoke from scrapyard chimneys (model block coordinates: x, z on the ground, then height)
    for (const b of this.blds) {
      const vent = b.rise >= 1 && b.dying < 0 && VENTS[b.type];
      if (!vent || Math.random() > dt * vent[3]) continue;
      const [gx, gy] = toScreen(b.cx * CELL + vent[0], b.cy * CELL + vent[1]), steam = b.type === 'generator';
      this.puffs.push({ x: gx + (Math.random() - 0.5) * (steam ? 8 : 3), y: gy - vent[2], vx: 2 + Math.random() * 2, vy: -5 - Math.random() * 3, t: 0, life: 2 + Math.random(), c: steam ? (Math.random() < 0.5 ? '#e8e6e0' : '#c8c6c0') : '#5a5650', s: steam ? 2 : 1 + (Math.random() < 0.5 ? 1 : 0) });
    }
    for (const p of this.puffs) { p.t += dt; if (p.g) p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.puffs = this.puffs.filter((p) => p.t < p.life);
    this.bark.t -= dt;
    this.shakeAt = Math.max(0, this.shakeAt - dt);
    for (const m of this.markers) m.t += dt;
    this.markers = this.markers.filter((m) => m.t < 0.6);
  }

  move(u: Unit, dt: number) {
    const d = u.def, t = this.terrain;
    u.moving = false;
    if (u.type === 'harvester' && u.team !== 2) this.salvage(u, dt);
    if (u.buildSite) {
      const b = u.buildSite;
      if (!this.blds.includes(b) || (b.rise >= 1 && b.hp >= b.max) || b.dying >= 0) u.buildSite = null;
      else if (this.reach(u.x, u.y, b) < 36) { u.path = []; u.goal = null; }
      else if (!u.path.length && u.goal && u.stuck >= 3) this.assignSite(u, b);
      else if (!u.path.length && !u.goal) this.assignSite(u, b);
    }
    if (!u.path.length && !u.target && this.looks[u.type + u.team]?.turret) {
      // idle tanks look around now and then
      if ((u.scan -= dt) <= 0) { u.scan = 2 + Math.random() * 4; u.scanTo = u.heading + (Math.random() - 0.5) * 2.2; }
      u.tHead += Math.max(-dt * 0.8, Math.min(dt * 0.8, angDiff(u.tHead, u.scanTo)));
    }
    if (!u.path.length) {
      if (u.goal && d.air) { u.path = [u.goal]; return; }
      if (u.goal && Math.hypot(u.goal[0] - u.x, u.goal[1] - u.y) > 6) {
        if (this.pathBudget <= 0) return; // too many routes planned this frame: try again next frame
        if (u.stuck < 3) { u.stuck++; this.pathBudget--; u.path = findPath(t, u.x, u.y, u.goal[0], u.goal[1], d.crush); }
        else { u.goal = null; u.avoid = (u.avoid ?? 0) + 1; } // can't get there: give up rather than sit forever
      }
      return;
    }
    if ((u.progT += dt) > 3) { // three seconds with a route and no real progress: skip the stuck waypoint
      if (Math.hypot(u.x - u.px0, u.y - u.py0) < 6 && !u.target) { u.path.shift(); if (!u.path.length) { u.goal = null; u.pace = 0; } }
      u.progT = 0; u.px0 = u.x; u.py0 = u.y;
      if (!u.path.length) return;
    }
    const [px, py] = u.path[0];
    const dx = px - u.x, dy = py - u.y, dist = Math.hypot(dx, dy);
    // the last step: if someone is already standing on the spot, close enough counts
    // a waypoint someone else is already standing on counts as reached once you're close (otherwise two
    // units heading for the same spot shove each other round it forever)
    let crowded = false;
    if (dist < 18 && dist >= (u.path.length > 1 ? 6 : 1.5)) this.near(px, py, 24, (o) => (crowded = o !== u && Math.hypot(o.x - px, o.y - py) < o.def.radius + u.def.radius + 2));
    if (dist < (crowded ? 18 : u.path.length > 1 ? 6 : 1.5)) {
      u.path.shift();
      if (!u.path.length) {
        u.goal = null;
        const next = u.queue.shift();
        if (next) { u.goal = next; u.path = this.route(u, next[0], next[1]); } else u.pace = 0;
      }
      return;
    }
    const want = Math.atan2(dy, dx);
    let diff = angDiff(u.heading, want);
    const turn = d.turn * dt;
    u.heading += Math.max(-turn, Math.min(turn, diff));
    diff = angDiff(u.heading, want);
    const go = d.vehicle ? Math.max(0, Math.cos(diff)) ** 3 : 1;
    const step = Math.min(dist, (u.pace || d.speed) * dt * go);
    const nx = u.x + Math.cos(u.heading) * step, ny = u.y + Math.sin(u.heading) * step;
    const ax = t.cellOf(u.x), ay = t.cellOf(u.y), bx = t.cellOf(nx), by = t.cellOf(ny);
    if (d.air || (ax === bx && ay === by) || t.step(ax, ay, bx, by, d.crush)) { u.x = Math.max(0, Math.min(MAPSIZE - 1, nx)); u.y = Math.max(0, Math.min(MAPSIZE - 1, ny)); }
    else { if (this.pathBudget-- > 0) { u.path = findPath(t, u.x, u.y, u.goal?.[0] ?? px, u.goal?.[1] ?? py, d.crush); u.stuck++; } return; }
    if (!u.target) u.tHead = u.heading;
    u.moving = step > 0.01;
    u.bob += dt * 10;
    if (d.track && u.moving) {
      u.trackAcc += step;
      while (u.trackAcc > 1) { u.trackAcc -= 1; t.track(u.x - Math.cos(u.heading) * 8, u.y - Math.sin(u.heading) * 8, u.heading, d.track); }
    }
    if (u.enter && Math.hypot(u.x - (u.enter.cx + u.enter.w / 2) * CELL, u.y - (u.enter.cy + u.enter.h / 2) * CELL) < Math.max(u.enter.w, u.enter.h) * CELL * 0.5 + 20) this.enter(u, u.enter);
    if (d.crush && u.moving) this.crush(u);
    if ((u.type === 'juggernaut' || u.type === 'colossus') && u.moving) { // too big to stop for soldiers (and the Colossus for vehicles)
      const under: Unit[] = [];
      this.near(u.x, u.y, 30, (o) => { if (!o.def.air && o.type !== 'colossus' && (!o.def.vehicle || u.type === 'colossus') && this.hostile(u.team, o.team) && Math.hypot(o.x - u.x, o.y - u.y) < u.def.radius) under.push(o); });
      for (const o of under) { if (o.def.vehicle) this.damage(o, 500 * dt, u.team, u); else this.killUnit(o); }
    }
    if (d.vehicle && !d.air && u.moving && (u.dust -= dt) <= 0) {
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

  // ---- the unit grid: units sorted into 4x4-cell buckets once a frame, so each unit only looks
  // at its neighbours (this is what lets thousands of units run smoothly)
  grid: Unit[][] = Array.from({ length: GB * GB }, () => []);
  buildGrid() {
    for (const b of this.grid) b.length = 0;
    for (const u of this.units) this.grid[this.bucket(u.x, u.y)].push(u);
  }
  bucket(x: number, y: number) { const bx = Math.max(0, Math.min(GB - 1, Math.floor(x / (CELL * 4)))), by = Math.max(0, Math.min(GB - 1, Math.floor(y / (CELL * 4)))); return by * GB + bx; }
  // calls f for every unit in the buckets touching a circle; return true from f to stop early
  near(x: number, y: number, r: number, f: (u: Unit) => boolean | void) {
    const S = CELL * 4, x0 = Math.max(0, Math.floor((x - r) / S)), x1 = Math.min(GB - 1, Math.floor((x + r) / S)), y0 = Math.max(0, Math.floor((y - r) / S)), y1 = Math.min(GB - 1, Math.floor((y + r) / S));
    for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) for (const u of this.grid[by * GB + bx]) if (f(u)) return;
  }
  separate() {
    for (const a of this.units) this.near(a.x, a.y, 24, (b) => {
      if (b.id <= a.id || !!a.def.air !== !!b.def.air) return;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.def.radius + b.def.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) return;
      const d = Math.sqrt(d2), push = (min - d) * 0.25;
      const wa = a.moving && !b.moving ? 0.3 : b.moving && !a.moving ? 0.7 : 0.5;
      this.nudge(a, (-dx / d) * push * wa * 2, (-dy / d) * push * wa * 2);
      this.nudge(b, (dx / d) * push * (1 - wa) * 2, (dy / d) * push * (1 - wa) * 2);
    });
  }
  nudge(u: Unit, dx: number, dy: number) {
    if (u.def.air) { u.x += dx; u.y += dy; return; }
    const t = this.terrain, ax = t.cellOf(u.x), ay = t.cellOf(u.y), bx = t.cellOf(u.x + dx), by = t.cellOf(u.y + dy);
    if ((ax === bx && ay === by) || t.step(ax, ay, bx, by, u.def.crush)) { u.x += dx; u.y += dy; }
  }

  // ------------------------------------------------------------------ drawing
  render() {
    const sh = this.shakeAt > 0 ? Math.round((Math.random() - 0.5) * this.shakeAt * 6) : 0; // a gusher shakes the view
    const ctx = this.ctx, vx = Math.round(this.vx) + sh, vy = Math.round(this.vy) + sh, M = this.mouse;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, this.FW, this.FH);
    if (this.state === 'loading') { this.hctx.clearRect(0, 0, this.HW, this.HH); this.withHud(() => this.drawLoading()); return; }
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
      if (b.team !== 0 && !b.seen) continue; // never spotted: not on your map yet
      const s = this.looks[b.type + b.team].body[0];
      const [bx, by] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }), x = bx - vx, y = by - vy;
      if (x < -120 || x > this.FW + 120 || y < -160 || y > this.FH + 100) continue;
      const front = toScreen((b.cx + b.w) * CELL, (b.cy + b.h) * CELL)[1]; // its nearest corner decides draw order
      items.push({ y: front - 4, shadow: () => { if (b.rise >= 1) shadow(s, x, y); }, draw: () => {
        if (b.rise < 1) { // under construction: what's built so far rises inside scaffolding
          const h = s.img.height, show = Math.round(h * b.rise);
          ctx.drawImage(s.img, 0, h - show, s.img.width, show, Math.round(x - s.ax), Math.round(y - s.ay) + h - show, s.img.width, show);
          this.scaffold(b, vx, vy, Math.max(6, Math.round(show * 0.7) + 6));
          if (b === this.selBld) this.outline(b, vx, vy);
          return;
        }
        sprite(s, x, y);
        const tl = this.looks[b.type + b.team].turret;
        if (tl) { const d = this.looks[b.type + b.team].def, at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2]; sprite(facing(tl, b.tHead + YAW), x + YC * ox - YS * oz, y + YS * ox + YC * oz - at[1]); }
        if (b === this.selBld) this.outline(b, vx, vy);
        if (CAPTURE[b.type]) this.drawFlag(b, vx, vy);
        if (b.type === 'derrick') { // gas flare flickering on its stack
          const dx = -16, dz = 16, fx = Math.round(x + YC * dx - YS * dz), fy = Math.round(y + YS * dx + YC * dz - 23), f = Math.floor(this.time * 12);
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(fx, fy - 1 - (f % 2), 1, 2);
          ctx.fillStyle = '#f07828'; ctx.fillRect(fx - (f % 3 === 0 ? 1 : 0), fy - 3 - (f % 2), 1, 2); ctx.fillRect(fx + (f % 3 === 1 ? 1 : 0), fy - 2, 1, 1);
        }
        // warning beacon on top of the signal tower blinks
        if (b.type === 'fieldCommand' && Math.sin(this.time * 3.5 + b.team) > 0.2) {
          const dx = 21, dz = -18, lx = x + YC * dx - YS * dz, ly = y + YS * dx + YC * dz - 52;
          ctx.fillStyle = '#ff5a3a'; ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
          ctx.fillStyle = 'rgba(255,90,58,0.35)'; ctx.fillRect(Math.round(lx) - 1, Math.round(ly), 3, 1); ctx.fillRect(Math.round(lx), Math.round(ly) - 1, 1, 3);
        }
      } });
    }
    for (const u of this.units) {
      if (u.team !== 0 && !this.sees(u.x, u.y)) continue; // hidden in the fog
      const look = this.looks[u.type + u.team];
      const [ux, uy] = this.scr(u), x = ux - vx, y = uy - vy - (!u.def.vehicle && u.moving ? Math.round(Math.abs(Math.sin(u.bob))) : 0);
      if (x < -30 || x > this.FW + 30 || y < -30 || y > this.FH + 30) continue;
      const body = facing(look.body, u.heading + YAW); // headings are on the ground; the map is turned on screen
      const air = !!u.def.air, gy = air ? toScreen(u.x, u.y)[1] - vy : y; // aircraft cast their shadow on the ground far below
      items.push({
        y: toScreen(u.x, u.y)[1] + (air ? 4000 : 0), shadow: () => shadow(body, x, gy),
        draw: () => {
          sprite(body, x, y);
          if (u.type === 'gunship') { // rotor: a spinning blur of dark pixels
            const a = this.time * 30 + u.id, c = Math.cos(a), sn = Math.sin(a);
            ctx.fillStyle = 'rgba(20,20,20,0.55)';
            for (let r = -11; r <= 11; r += 1) { ctx.fillRect(Math.round(x + c * r), Math.round(y - 9 + sn * r * 0.5), 1, 1); ctx.fillRect(Math.round(x - sn * r), Math.round(y - 9 + c * r * 0.5), 1, 1); }
          }
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
      if (!this.vis[this.terrain.idx(Math.max(0, Math.min(N - 1, this.terrain.cellOf(a.x))), Math.max(0, Math.min(N - 1, this.terrain.cellOf(a.y))))]) continue;
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
    for (const tr of this.tracers) if (this.seenAt(tr.x1, tr.y1)) drawTracer(ctx, tr, vx, vy);
    for (const s of this.shells) if (this.seenAt(s.tx, s.ty)) drawShell(ctx, s, vx, vy);
    for (const b of this.blasts) if (this.seenAt(b.x, b.y)) drawBlast(ctx, b, vx, vy);
    this.drawDamage(vx, vy);
    // dust and smoke: pixel puffs that thin out as they rise
    for (const p of this.puffs) {
      const f = p.t / p.life, x = Math.round(p.x - vx), y = Math.round(p.y - vy);
      if (x < -4 || y < -4 || x > this.FW + 4 || y > this.FH + 4) continue;
      if (((x + y) & 1) && f > 0.5) continue;
      if (!this.seenAt(p.x, p.y + 10)) continue; // smoke in the fog would give the enemy away
      ctx.fillStyle = p.c; ctx.fillRect(x, y, p.s + (f > 0.4 ? 1 : 0), p.s);
    }
    // cloud shadows drifting over everything
    const cw = this.clouds.width, ox = Math.round(this.time * 7 - vx) % cw, oy = Math.round(this.time * 3 - vy) % cw;
    for (let y = (oy > 0 ? oy - cw : oy); y < this.FH; y += cw) for (let x = (ox > 0 ? ox - cw : ox); x < this.FW; x += cw) ctx.drawImage(this.clouds, x, y);
    this.drawBirds(vx, vy);
    if (this.state !== 'title') this.drawFog(vx, vy);
    // routes of selected units: a dotted line through each waypoint, with a small diamond at each stop
    for (const u of this.units) {
      if (!u.selected || u.team !== 0 || (!u.goal && !u.queue.length)) continue;
      let [px, py] = this.scr(u);
      for (const p of [u.goal, ...u.queue]) {
        if (!p) continue;
        const [qx, qy] = this.scr({ x: p[0], y: p[1] }), n = Math.max(1, Math.round(Math.hypot(qx - px, qy - py) / 3));
        ctx.fillStyle = 'rgba(126,224,138,0.55)';
        for (let i = 1; i < n; i += 2) ctx.fillRect(Math.round(px + ((qx - px) * i) / n - vx), Math.round(py + ((qy - py) * i) / n - vy), 1, 1);
        ctx.fillStyle = C.ok; ctx.fillRect(Math.round(qx - vx) - 1, Math.round(qy - vy), 3, 1); ctx.fillRect(Math.round(qx - vx), Math.round(qy - vy) - 1, 1, 3);
        [px, py] = [qx, qy];
      }
    }
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
      for (let k = 0; k < u.rank; k++) { ctx.fillStyle = C.ink; ctx.fillRect(x + r + 2, top - 5 + k * 3, 3, 2); ctx.fillStyle = C.gold; ctx.fillRect(x + r + 2, top - 5 + k * 3, 2, 1); } // rank pips
      if (u.type === 'harvester') { ctx.fillStyle = C.ink; ctx.fillRect(x - r, top - 1, r * 2 + 1, 3); ctx.fillStyle = '#c87a3a'; ctx.fillRect(x - r + 1, top, Math.round((r * 2 - 1) * (u.cargo / SCRAP_LOAD)), 1); }
    }
    // drag box: dotted pixel rectangle
    if (M.down && M.drag && this.state === 'play') {
      const x0 = Math.round(Math.min(M.sx, M.x)), x1 = Math.round(Math.max(M.sx, M.x)), y0 = Math.round(Math.min(M.sy, M.y)), y1 = Math.round(Math.max(M.sy, M.y));
      ctx.fillStyle = C.ok;
      for (let x = x0; x <= x1; x += 2) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x, y1, 1, 1); }
      for (let y = y0; y <= y1; y += 2) { ctx.fillRect(x0, y, 1, 1); ctx.fillRect(x1, y, 1, 1); }
    }
    // shield domes: a faint ring of light that flares where it's struck
    for (const b of this.blds) {
      if (b.type !== 'shield' || b.rise < 1 || b.dying >= 0 || !(b.shieldHp! > 0) || b.shieldDown || (b.team === 1 && !b.seen)) continue;
      const [cx, cy] = this.scr({ x: (b.cx + 1) * CELL, y: (b.cy + 1) * CELL }), R = SHIELD_R * CELL, hit = Math.max(0, 1 - (this.time - (b.lastHit ?? -9)) * 2);
      if (cx - vx < -R || cx - vx > this.FW + R || cy - vy < -R * 1.5 || cy - vy > this.FH + R) continue;
      const strength = b.shieldHp! / SHIELD_HP;
      ctx.fillStyle = `rgba(150,230,255,${0.18 + strength * 0.25 + hit * 0.5})`;
      for (let a = 0; a < 360; a += 3) { const r = (a * Math.PI) / 180; ctx.fillRect(Math.round(cx - vx + Math.cos(r) * R), Math.round(cy - vy + Math.sin(r) * R * 0.75 - Math.max(0, -Math.sin(r)) * R * 0.25), 1, 1); }
      ctx.fillStyle = `rgba(150,230,255,${0.06 + hit * 0.18})`;
      for (let k = 1; k <= 3; k++) for (let a = 180; a < 360; a += 5) { const r = (a * Math.PI) / 180, rr = R * (1 - k * 0.22); ctx.fillRect(Math.round(cx - vx + Math.cos(r) * rr), Math.round(cy - vy + Math.sin(r) * rr * 0.75 - k * R * 0.12), 1, 1); }
    }
    for (const m of this.missiles) { const [mx, my] = this.missilePos(m); ctx.fillStyle = '#fff8d0'; ctx.fillRect(Math.round(mx - vx) - 1, Math.round(my - vy) - 1, 3, 3); ctx.fillStyle = '#ff8a30'; ctx.fillRect(Math.round(mx - vx), Math.round(my - vy) + 2, 1, 2); }
    this.drawPlacement(vx, vy);
    if (this.selBld?.rally) { const [rx, ry] = this.scr({ x: this.selBld.rally[0], y: this.selBld.rally[1] }); ctx.fillStyle = C.ok; ctx.fillRect(Math.round(rx - vx), Math.round(ry - vy) - 8, 1, 8); ctx.fillRect(Math.round(rx - vx) + 1, Math.round(ry - vy) - 8, 4, 3); }
    let cursorKind: 'arrow' | 'move' | 'select' | 'busy' | 'attack' | 'amove' = 'arrow', hoverName = '';
    if (M.in) {
      const over = this.state === 'play' && this.inView(M.y) ? this.unitAt(M.x + vx, M.y + vy) : null;
      this.hoverBld = this.state === 'play' && this.inView(M.y) ? this.bldAt(...this.groundAt(M.x + vx, M.y + vy)) : null;
      const armed = this.selected().some((u) => u.def.weapon);
      const kind = this.state !== 'play' || !this.inView(M.y) ? 'arrow' : this.attackMode ? 'amove' : over && over.team === 0 ? 'select' : armed && this.enemyAt(M.x + vx, M.y + vy) ? 'attack' : this.selected().length ? 'move' : 'arrow';
      cursorKind = kind;
      // name of whatever is under the cursor, shown beside it
      const hb = this.hoverBld, seenU = over && (over.team === 0 || this.sees(over.x, over.y));
      hoverName = M.drag ? '' : seenU ? over!.def.name + (over!.team === 1 ? ' (ENEMY)' : '') : hb && (hb.team === 0 || hb.seen || hb.team === 2) ? (CAPTURE[hb.type]?.name ?? hb.name) + (hb.team === 1 ? ' (ENEMY)' : '') : '';
    }
    // the interface layer: side panel, caption, menus and the cursor, at a fixed pixel size
    this.hctx.clearRect(0, 0, this.HW, this.HH);
    this.withHud(() => {
      if (this.state === 'title') this.drawTitle();
      else { if (this.k === 1) this.drawIcons(vx, vy); this.drawSidebar(); this.drawCaption(); }
      if (this.state === 'paused') this.drawPause();
      if (this.state === 'won' || this.state === 'lost') this.drawEnd();
      if (M.in && hoverName && this.state === 'play' && M.x < this.FW - SB) { const l = hoverName.toUpperCase(), w = textWidth(l) + 6; this.ctx.fillStyle = 'rgba(13,12,11,0.8)'; this.ctx.fillRect(M.x + 10, M.y + 12, w, 10); text(this.ctx, l, M.x + 13, M.y + 14, hoverName.includes('ENEMY') ? C.bad : C.cream); }
      if (M.in) cursor(this.ctx, cursorKind, M.x, M.y, this.time);
    });
  }

  // ---- combat ----
  isUnit(t: Unit | Bld): t is Unit { return 'def' in t; }
  alive(t: Unit | Bld) { return this.isUnit(t) ? this.units.includes(t) : this.blds.includes(t) && t.dying < 0; }
  posOf(t: Unit | Bld): [number, number] { return this.isUnit(t) ? [t.x, t.y] : [(t.cx + t.w / 2) * CELL, (t.cy + t.h / 2) * CELL]; }
  armourOf(t: Unit | Bld): Armour { return this.isUnit(t) ? (t.def.air ? 'air' : t.def.vehicle ? 'veh' : 'inf') : 'bld'; }
  // can this weapon hit that target at all? (cannons can't hit aircraft; flak hits nothing else)
  canHit(w: Weapon, t: Unit | Bld) { return this.isUnit(t) && t.def.air ? (w.dmg.air ?? 0) > 0 : !w.airOnly; }
  hostile(a: number, b: number) { return a !== b && a !== 2 && b !== 2; }
  // distance from a point to a unit's edge or a building's footprint
  reach(x: number, y: number, t: Unit | Bld) {
    if (this.isUnit(t)) return Math.max(0, Math.hypot(t.x - x, t.y - y) - t.def.radius);
    const dx = Math.max(t.cx * CELL - x, 0, x - (t.cx + t.w) * CELL), dy = Math.max(t.cy * CELL - y, 0, y - (t.cy + t.h) * CELL);
    return Math.hypot(dx, dy);
  }
  // the enemy under the cursor, if any (for attack orders and the gunsight cursor)
  enemyAt(px: number, py: number): Unit | Bld | null {
    const u = this.unitAt(px, py);
    if (u && this.hostile(u.team, 0) && this.sees(u.x, u.y)) return u;
    const b = this.bldAt(...this.groundAt(px, py));
    return b && b.max > 0 && this.hostile(b.team, 0) && b.dying < 0 && b.seen ? b : null;
  }
  nearestEnemy(team: number, x: number, y: number, range: number, min = 0, w?: Weapon): Unit | Bld | null {
    let best: Unit | Bld | null = null, bd = range;
    const far = range > 150; // long guns: only what that side can actually see (the computer plays by your rules)
    this.near(x, y, range + 12, (u) => { if (this.hostile(team, u.team) && (!w || this.canHit(w, u)) && (team === 0 ? this.sees(u.x, u.y) : !far || this.seenBy(team, u.x, u.y))) { const d = this.reach(x, y, u); if (d < bd && d >= min) { bd = d; best = u; } } });
    if (best || w?.airOnly) return best; // soldiers and vehicles first, buildings after (flak never shoots buildings)
    for (const b of this.blds) if (b.max > 0 && b.dying < 0 && this.hostile(team, b.team)) { const d = this.reach(x, y, b); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // whether a side has eyes on a spot (yours uses the fog; the computer's is worked out the same way)
  seenBy(team: number, x: number, y: number) {
    let seen = false;
    this.near(x, y, 9 * CELL, (o) => (seen = o.team === team && Math.hypot(o.x - x, o.y - y) < this.sightOf(o.type) * CELL));
    if (seen) return true;
    for (const b of this.blds) if (b.team === team && b.dying < 0 && Math.hypot((b.cx + b.w / 2) * CELL - x, (b.cy + b.h / 2) * CELL - y) < this.sightOf(b.type, b.garrison) * CELL) return true;
    return false;
  }

  updateCombat(dt: number) {
    for (const u of [...this.units]) this.fight(u, dt);
    // defences and garrisons
    for (const b of this.blds) {
      if (b.dying >= 0 || b.rise < 1) continue;
      const wk = DEFENCE[b.type] ?? (b.garrison > 0 && b.team !== 2 ? 'garrison' : null);
      if (!wk) continue;
      const w = WEAPONS[wk], [bx, by] = this.posOf(b), range = w.range * (b.type === 'watchtower' ? 1.3 : 1);
      const lowPower = b.team === 0 && this.power.used > this.power.made;
      b.reload -= dt * (lowPower ? 0.5 : 1) * (wk === 'garrison' ? b.garrison : 1);
      if (!b.target || !this.alive(b.target) || this.reach(bx, by, b.target) > range) b.target = this.nearestEnemy(b.team, bx, by, range, w.min ?? 0, w);
      if (!b.target) continue;
      const [tx, ty] = this.posOf(b.target), want = Math.atan2(ty - by, tx - bx);
      const spin = b.type === 'battery' ? 0.6 : b.type === 'emplacement' ? 1.8 : b.type === 'flakTower' ? 4 : 0;
      if (spin) b.tHead += Math.max(-dt * spin, Math.min(dt * spin, angDiff(b.tHead, want))); else b.tHead = want;
      if (b.reload <= 0 && Math.abs(angDiff(b.tHead, want)) < 0.12) {
        b.reload = w.reload * (0.9 + Math.random() * 0.2);
        const [sx, sy] = this.scr({ x: bx, y: by }), h = ({ emplacement: 9, guardTower: 21, watchtower: 30, flakTower: 20, battery: 12 } as Record<string, number>)[b.type] ?? 6;
        const a = b.tHead + YAW, ml = ({ emplacement: 22, battery: 44, flakTower: 10 } as Record<string, number>)[b.type] ?? 6;
        this.shoot(sx + Math.cos(a) * ml, sy + Math.sin(a) * ml - h, b.target, w, b.team, b);
      }
    }
    // shells in flight
    for (const sh of this.shells) sh.t += dt;
    for (const sh of this.shells.filter((x) => x.t >= x.life)) this.explode(sh.gx, sh.gy, sh.w, sh.team, sh.src, sh.alt);
    this.shells = this.shells.filter((x) => x.t < x.life);
    for (const tr of this.tracers) tr.t += dt;
    this.tracers = this.tracers.filter((x) => x.t < 0.09);
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((x) => x.t < 0.55);
    // fires on wrecks and ruins: smoke and the odd flame
    for (const f of this.fires) {
      f.t -= dt;
      if (Math.random() < dt * 8) this.puffs.push({ x: f.x + (Math.random() - 0.5) * f.s, y: f.y - 2, vx: 1 + Math.random() * 2, vy: -6 - Math.random() * 4, t: 0, life: 1.6 + Math.random(), c: Math.random() < 0.6 ? '#2a2826' : '#4a4642', s: 2 });
      if (Math.random() < dt * 10) this.puffs.push({ x: f.x + (Math.random() - 0.5) * f.s * 0.6, y: f.y - 1, vx: 0, vy: -8, t: 0, life: 0.3, c: Math.random() < 0.5 ? '#ffb040' : '#e05a20', s: 1 });
    }
    this.fires = this.fires.filter((f) => f.t > 0);
    // workshops patch up their side's vehicles parked close by, hospitals their infantry (slower on low power)
    for (const b of this.blds) {
      if ((b.type !== 'workshop' && b.type !== 'hospital') || b.rise < 1 || b.dying >= 0) continue;
      const pw = this.powers[b.team], rate = (b.type === 'workshop' ? 30 : 8) * (pw.used > pw.made ? 0.5 : 1), vehicles = b.type === 'workshop';
      const [bx, by] = this.posOf(b), hits: Unit[] = [];
      this.near(bx, by, 100, (u) => { if (u.team === b.team && u.def.vehicle === vehicles && u.hp < u.def.hp && this.reach(u.x, u.y, b) < 60) hits.push(u); });
      for (const u of hits) {
        u.hp = Math.min(u.def.hp, u.hp + rate * dt);
        if (Math.random() < dt * 4) { const [sx, sy] = this.scr(u); this.puffs.push({ x: sx + (Math.random() - 0.5) * 8, y: sy - 8, vx: (Math.random() - 0.5) * 16, vy: -8, t: 0, life: 0.3, c: '#fff4b0', s: 1, g: 60 }); }
      }
    }
    // buildings going up in a chain of explosions
    for (const b of [...this.blds]) {
      if (b.dying < 0) continue;
      b.dying += dt;
      if (Math.random() < dt * 9) {
        const [sx, sy] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL);
        this.blasts.push({ x: sx, y: sy - Math.random() * 14, t: 0, size: 6 + Math.random() * 6 });
        if (Math.random() < 0.3) audio.explosion((b.cx + 1) * CELL, (b.cy + 1) * CELL, 1.4);
      }
      if (b.dying > 1.6) this.collapse(b);
    }
  }

  // A second gun (the Colossus's flak) picks its own targets and fires without turning the unit.
  fight2(u: Unit, dt: number) {
    const w = WEAPONS[u.def.weapon2!];
    u.reload2 -= dt;
    if (!u.target2 || !this.alive(u.target2) || this.reach(u.x, u.y, u.target2) > w.range) u.target2 = (u.scanT < 0.05) ? this.nearestEnemy(u.team, u.x, u.y, w.range, 0, w) : null;
    if (!u.target2 || u.reload2 > 0) return;
    u.reload2 = w.reload;
    const [sx, sy] = this.scr(u);
    this.shoot(sx + (Math.random() - 0.5) * 30, sy - 18, u.target2, w, u.team, u);
  }
  fight(u: Unit, dt: number) {
    if (u.def.weapon2) this.fight2(u, dt);
    if (u.rank && u.hp < u.def.hp) u.hp = Math.min(u.def.hp, u.hp + Math.min(u.def.hp * 0.004, 2) * u.rank * dt); // veterans patch themselves up
    const w = u.def.weapon ? WEAPONS[u.def.weapon] : null;
    if (!w) return;
    const turret = !!this.looks[u.type + u.team]?.turret, moving = !!u.goal && !u.amove && !u.forced; // moving: on a plain move order
    u.reload -= dt;
    if (u.target && !this.alive(u.target)) { u.target = null; u.forced = false; }
    if (!u.forced && (u.scanT -= dt) <= 0) {
      u.scanT = 0.3;
      // look for trouble when standing still or attack-moving (a plain move order ignores the enemy)
      // idle units notice enemies a little beyond their reach (and step up to fight them)
      // long guns only fire at what someone can see: the enemy's guns stay within their own sight
      const reach = w.range + (u.amove ? 24 : 40);
      if (!u.path.length || u.amove) u.target = this.nearestEnemy(u.team, u.x, u.y, reach, w.min ?? 0, w);
      else if (moving && turret) u.target = this.nearestEnemy(u.team, u.x, u.y, w.range, w.min ?? 0, w); // turrets fire on the move
    }
    if (u.goal && !u.amove && !u.forced && !turret) u.target = null; // on a plain move order: keep going, don't turn to fight
    if (u.target && !this.canHit(w, u.target)) { u.target = null; u.forced = false; }
    if (!u.target) return;
    const [tx, ty] = this.posOf(u.target), d = this.reach(u.x, u.y, u.target);
    if (w.min && d < w.min) { if (!u.forced) u.target = null; return; } // too close for the big gun
    if (d > w.range) {
      if (moving) { u.target = null; return; } // never chase while you're being moved away
      const close = d < w.range + 46; // a guard leash: idle units close a short gap, but don't chase far
      if (u.forced || (close && !u.goal)) { if ((u.chase -= dt) <= 0) { u.chase = 1; u.path = this.route(u, tx, ty); } }
      else if (!u.amove) u.target = null;
      return;
    }
    if (!moving) u.path = []; // in range: stop and fight (attack-move picks its route up again afterwards)
    const want = Math.atan2(ty - u.y, tx - u.x);
    if (this.looks[u.type + u.team]?.turret) u.tHead += Math.max(-dt * 3, Math.min(dt * 3, angDiff(u.tHead, want)));
    else u.heading = u.tHead = want;
    if (u.reload <= 0 && Math.abs(angDiff(u.tHead, want)) < 0.15) {
      u.reload = w.reload * (0.9 + Math.random() * 0.2);
      const [sx, sy] = this.scr(u), a = u.tHead + YAW, ml = u.def.vehicle ? 13 : 4, h = u.def.air ? 0 : u.def.vehicle ? 7 : 4;
      this.shoot(sx + Math.cos(a) * ml, sy + Math.sin(a) * ml - h, u.target, w, u.team, u);
    }
  }

  // Fire from a screen point at a target: bullets hit at once with a tracer; shells fly and explode.
  shoot(mx: number, my: number, t: Unit | Bld, w: Weapon, team: number, src: Unit | Bld) {
    const [gx, gy] = this.posOf(t), [ts, tsy] = this.scr({ x: gx, y: gy });
    const tAir = this.isUnit(t) && !!t.def.air, ty = tsy - (tAir ? ALT + 2 : this.isUnit(t) ? (t.def.vehicle ? 4 : 3) : 10);
    if (w.airOnly) for (let i = 0; i < 2; i++) this.puffs.push({ x: ts + (Math.random() - 0.5) * 10, y: ty + (Math.random() - 0.5) * 6, vx: 0, vy: -1, t: 0, life: 0.6 + Math.random() * 0.3, c: Math.random() < 0.5 ? '#2a2826' : '#4a4642', s: 2 }); // black flak bursts
    this.puffs.push({ x: mx, y: my, vx: 0, vy: 0, t: 0, life: 0.06, c: '#fff4c0', s: w.kind === 'shell' ? 3 : 1 }); // muzzle flash
    if (w.kind === 'bullet') {
      this.tracers.push({ x0: mx, y0: my, x1: ts + (Math.random() - 0.5) * 4, y1: ty + (Math.random() - 0.5) * 3, t: 0 });
      this.damage(t, (w.dmg[this.armourOf(t)] ?? 0) * (0.8 + Math.random() * 0.4), team, src);
      this.puffs.push({ x: ts + (Math.random() - 0.5) * 4, y: ty, vx: (Math.random() - 0.5) * 10, vy: -6, t: 0, life: 0.25, c: '#d8c8a0', s: 1 });
      audio.rifle(gx, gy);
      return;
    }
    const ex = gx + (Math.random() - 0.5) * 8, ey = gy + (Math.random() - 0.5) * 8, [es, esy] = this.scr({ x: ex, y: ey });
    const dist = Math.hypot(es - mx, esy - my);
    this.shells.push({ x: 0, y: 0, sx: mx, sy: my, tx: es, ty: esy - 3 - (tAir ? ALT : 0), alt: tAir ? ALT : 0, t: 0, life: dist / (w.speed ?? 280), w, team, arc: dist * (w.arc ?? 0.06), gx: ex, gy: ey, src });
    for (let i = 0; i < 4; i++) this.puffs.push({ x: mx, y: my, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 4, t: 0, life: 0.7, c: '#8a8478', s: 2 });
    audio.cannon(gx, gy);
  }

  // the active enemy shield (if any) covering a point
  shieldAt(gx: number, gy: number, team: number) {
    for (const b of this.blds) if (b.type === 'shield' && b.rise >= 1 && b.dying < 0 && (b.shieldHp ?? 0) > 0 && !b.shieldDown && this.hostile(team, b.team) && Math.hypot((b.cx + 1) * CELL - gx, (b.cy + 1) * CELL - gy) < SHIELD_R * CELL) return b;
    return null;
  }
  explode(gx: number, gy: number, w: Weapon, team: number, src: Unit | Bld, alt = 0) {
    const shield = alt ? null : this.shieldAt(gx, gy, team);
    if (shield) { // the dome takes it: a flash on the shield, nothing below is hurt
      shield.shieldHp! -= Math.max(w.dmg.bld, w.dmg.veh);
      shield.lastHit = this.time;
      if (shield.shieldHp! <= 0) { shield.shieldHp = 0; shield.shieldDown = 12; if (shield.team === 0) this.warn('Shield overloaded!', this.posOf(shield)); }
      const [hx, hy] = this.scr({ x: gx, y: gy });
      for (let i = 0; i < 5; i++) this.puffs.push({ x: hx + (Math.random() - 0.5) * 10, y: hy - 14 - Math.random() * 10, vx: (Math.random() - 0.5) * 20, vy: -6, t: 0, life: 0.35, c: Math.random() < 0.5 ? '#9ae8ff' : '#e8fbff', s: 1 });
      return;
    }
    const r = w.splash ?? 10, [sx, sy] = this.scr({ x: gx, y: gy });
    this.blasts.push({ x: sx, y: sy - 3 - alt, t: 0, size: r * 0.8 });
    if (alt) { // an airburst: only aircraft are hurt
      const hit: Unit[] = [];
      this.near(gx, gy, r + 12, (u) => { if (u.def.air && this.hostile(team, u.team) && Math.hypot(u.x - gx, u.y - gy) - u.def.radius < r) hit.push(u); });
      for (const u of hit) this.damage(u, (w.dmg.air ?? 0), team, src);
      return;
    }
    audio.explosion(gx, gy, 1.2);
    const hit: Unit[] = [];
    this.near(gx, gy, r + 12, (u) => { if (!u.def.air && this.hostile(team, u.team) && Math.hypot(u.x - gx, u.y - gy) - u.def.radius < r) hit.push(u); });
    for (const u of hit) { const d = Math.hypot(u.x - gx, u.y - gy) - u.def.radius; this.damage(u, (w.dmg[this.armourOf(u)] ?? 0) * (1 - (Math.max(0, d) / r) * 0.6), team, src); }
    for (const b of this.blds) if (b.max > 0 && this.hostile(team, b.team) && this.reach(gx, gy, b) < r * 0.5) this.damage(b, w.dmg.bld, team, src);
    if (w.clears) for (const b of this.blds) if (CAPTURE[b.type] && b.garrison > 0 && this.hostile(team, b.team) && this.reach(gx, gy, b) < r && Math.random() < 0.4) b.garrison--; // a grenade through the window
    this.scorch(sx, sy, r * 0.6);
    this.knockTrees(gx, gy, r);
    for (let i = 0; i < 8; i++) this.puffs.push({ x: sx, y: sy - 2, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, t: 0, life: 0.6 + Math.random() * 0.4, c: Math.random() < 0.5 ? '#5a4a36' : '#3a3026', s: 1, g: 90 }); // flung earth
    for (let i = 0; i < 4; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * r, y: sy - 4, vx: (Math.random() - 0.5) * 6, vy: -5 - Math.random() * 5, t: 0, life: 1.5 + Math.random(), c: '#3a3634', s: 2 });
  }

  damage(t: Unit | Bld, amt: number, team: number, src: Unit | Bld) {
    if (!this.alive(t) || (!this.isUnit(t) && t.max <= 0)) return;
    if (src && this.isUnit(src)) amt *= 1 + src.rank * 0.12; // veterans hit harder
    t.hp -= amt;
    if (t.hp <= 0 && src && this.isUnit(src) && this.isUnit(t)) { const before = src.rank; src.kills++; if (src.rank > before && src.team === 0) { this.bark = { who: src.def.name, line: ['Promoted!', 'Veteran now.', 'Elite!'][src.rank - 1], t: 2 }; } }
    if (t.team === 0 && this.time - this.alertT > 25) { // tell the player when they're hit, now and then
      this.alertT = this.time;
      this.warn(this.isUnit(t) ? 'Our units are under attack!' : 'Our base is under attack!', this.posOf(t));
    }
    if (this.isUnit(t)) {
      if (!t.target && t.def.weapon && this.alive(src) && (!t.goal || t.amove)) t.target = src; // shoot back, unless you ordered it away
      if (t.hp <= 0) this.killUnit(t);
    } else if (t.hp <= 0 && t.dying < 0) {
      t.dying = 0; t.hp = 0;
      if (t === this.selBld) this.selBld = null;
      this.bark = { who: t.team === 0 ? 'Base' : 'Field report', line: t.team === 0 ? `We've lost the ${t.name}!` : `Enemy ${t.name} destroyed.`, t: 3 };
    }
  }

  killUnit(u: Unit) {
    this.units = this.units.filter((o) => o !== u);
    this.stats.lost[u.team === 2 ? 0 : u.team]++;
    for (const g of this.groups) if (g) { const i = g.indexOf(u); if (i >= 0) g.splice(i, 1); }
    const [sx, sy] = this.scr(u);
    if (!u.def.vehicle) { // a puff of dust and he's gone
      for (let i = 0; i < 5; i++) this.puffs.push({ x: sx, y: sy - 2, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 4, t: 0, life: 0.8, c: '#8a8070', s: 1 });
      return;
    }
    this.blasts.push({ x: sx, y: sy - 4, t: 0, size: 14 });
    this.leaveScrap(u.x, u.y, (DEF[u.type]?.cost ?? 600) * 0.4, 0);
    audio.explosion(u.x, u.y, 2.2);
    this.shakeAt = Math.max(this.shakeAt, 0.25);
    for (let i = 0; i < 14; i++) this.puffs.push({ x: sx, y: sy - 4, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 40, t: 0, life: 0.8 + Math.random() * 0.5, c: ['#3a3a3e', '#5a5e64', '#2a2a2a', '#7a5a3a'][i % 4], s: 1, g: 90 });
    // the burnt-out hull stays behind, pressed into the ground
    const look = this.looks[u.type + u.team], spr = facing(look.body, u.heading + YAW);
    const c = document.createElement('canvas'); c.width = spr.img.width; c.height = spr.img.height;
    const cx2 = c.getContext('2d')!; cx2.drawImage(spr.img, 0, 0);
    cx2.globalCompositeOperation = 'source-atop'; cx2.fillStyle = 'rgba(28,22,18,0.78)'; cx2.fillRect(0, 0, c.width, c.height);
    this.scorch(sx, sy, 9);
    this.terrain.stamp(Math.round(sx), Math.round(sy), (ctx, x, y) => ctx.drawImage(c, Math.round(x - spr.ax), Math.round(y - spr.ay)));
    this.fires.push({ x: sx, y: sy - 4, t: 9, s: 8 });
  }

  // The building is gone: scorched rubble where it stood, and the ground is free again.
  // ---- strategic missiles ----
  missiles: { team: number; sx: number; sy: number; tx: number; ty: number; t: number; dur: number; done?: boolean }[] = [];
  launch(b: Bld, tx: number, ty: number) {
    if ((b.timer ?? 0) < MISSILE_TIME) return false;
    b.timer = 0;
    const sx = (b.cx + 1) * CELL, sy = (b.cy + 1) * CELL;
    this.missiles.push({ team: b.team, sx, sy, tx, ty, t: 0, dur: Math.max(6, Math.hypot(tx - sx, ty - sy) / 320) });
    audio.explosion(sx, sy, 1.6);
    if (b.team === 1) this.warn('MISSILE LAUNCH DETECTED!', [tx, ty]);
    else this.bark = { who: 'Missile Silo', line: 'Missile away.', t: 3 };
    return true;
  }
  updateMissiles(dt: number) {
    // silos charge (slower on low power), interceptors reload, shields recover
    for (const b of this.blds) {
      if (b.rise < 1 || b.dying >= 0 || b.team > 1) continue;
      const pw = this.powers[b.team], low = pw.used > pw.made, rate = (low ? 0.5 : 1) * (b.team === 1 ? this.aiRate : 1);
      if (b.type === 'silo' && (b.timer ?? 0) < MISSILE_TIME) {
        const pay = (MISSILE_COST / MISSILE_TIME) * dt * rate;
        if (this.prods[b.team].credits >= pay) { this.prods[b.team].credits -= pay; b.timer = (b.timer ?? 0) + dt * rate; if (b.timer >= MISSILE_TIME && b.team === 0) this.bark = { who: 'Missile Silo', line: 'Missile ready. Select the silo and right-click a target.', t: 4 }; }
      }
      if (b.type === 'interceptor') { b.ammo = b.ammo ?? 0; if (b.ammo < 2) { b.timer = (b.timer ?? 0) + dt * rate; if (b.timer >= INTERCEPT_RELOAD) { b.timer = 0; b.ammo++; } } }
      if (b.type === 'shield') {
        if (b.shieldHp === undefined) b.shieldHp = SHIELD_HP * 0.3;
        if (low) { b.shieldHp = 0; continue; } // no power, no shield
        if (b.shieldDown) { b.shieldDown = Math.max(0, b.shieldDown - dt); if (!b.shieldDown) b.shieldHp = SHIELD_HP * 0.3; continue; }
        if (this.time - (b.lastHit ?? -99) > 6) b.shieldHp = Math.min(SHIELD_HP, b.shieldHp + 30 * dt);
      }
    }
    for (const m of this.missiles) {
      m.t += dt;
      const f = Math.min(1, m.t / m.dur), [px, py] = this.missilePos(m);
      if (Math.random() < dt * 30) this.puffs.push({ x: px, y: py + 2, vx: (Math.random() - 0.5) * 3, vy: 1, t: 0, life: 1.4, c: Math.random() < 0.5 ? '#c8c4bc' : '#9a968e', s: 2 });
      // interceptors near the target have a go once it starts coming down
      if (f > 0.7 && !m.done) {
        const guard = this.blds.find((b) => b.type === 'interceptor' && b.team !== m.team && b.team < 2 && b.rise >= 1 && b.dying < 0 && (b.ammo ?? 0) > 0 && Math.hypot((b.cx + 1) * CELL - m.tx, (b.cy + 1) * CELL - m.ty) < INTERCEPT_RANGE * CELL);
        if (guard) {
          guard.ammo!--; m.done = true;
          const [gx, gy] = this.scr({ x: (guard.cx + 1) * CELL, y: (guard.cy + 1) * CELL });
          this.tracers.push({ x0: gx, y0: gy - 20, x1: px, y1: py, t: 0 });
          for (let i = 0; i < 4; i++) this.blasts.push({ x: px + (Math.random() - 0.5) * 16, y: py + (Math.random() - 0.5) * 10, t: -i * 0.08, size: 14 });
          audio.explosion(m.tx, m.ty, 2);
          if (guard.team === 0) this.bark = { who: 'Interceptor', line: 'Missile destroyed in flight!', t: 3 };
          else this.bark = { who: 'Missile Silo', line: 'Our missile was intercepted.', t: 3 };
        }
      }
      if (f >= 1 && !m.done) { m.done = true; this.detonate(m.tx, m.ty); }
    }
    this.missiles = this.missiles.filter((m) => !m.done);
  }
  missilePos(m: { sx: number; sy: number; tx: number; ty: number; t: number; dur: number }): [number, number] {
    const f = Math.min(1, m.t / m.dur), [ax, ay] = toScreen(m.sx, m.sy), [bx, by] = toScreen(m.tx, m.ty);
    return [ax + (bx - ax) * f, ay + (by - ay) * f - Math.sin(f * Math.PI) * Math.min(700, Math.hypot(bx - ax, by - ay) * 0.5)];
  }
  // A strategic warhead: everything within five cells is hurt, friend or foe; a shield takes some of it and collapses.
  detonate(gx: number, gy: number) {
    const R = 5 * CELL, [sx, sy] = this.scr({ x: gx, y: gy });
    let cut = 1;
    for (const b of this.blds) if (b.type === 'shield' && (b.shieldHp ?? 0) > 0 && !b.shieldDown && Math.hypot((b.cx + 1) * CELL - gx, (b.cy + 1) * CELL - gy) < SHIELD_R * CELL) { cut = 0.6; b.shieldHp = 0; b.shieldDown = 12; }
    for (let i = 0; i < 18; i++) this.blasts.push({ x: sx + (Math.random() - 0.5) * 110, y: sy - Math.random() * 70, t: -Math.random() * 0.6, size: 16 + Math.random() * 16 });
    this.shakeAt = 1.6; audio.explosion(gx, gy, 3);
    const hit: Unit[] = [];
    this.near(gx, gy, R + 30, (u) => { if (Math.hypot(u.x - gx, u.y - gy) < R) hit.push(u); });
    for (const u of hit) if (this.alive(u)) { u.hp -= 800 * cut * (1 - Math.hypot(u.x - gx, u.y - gy) / R * 0.5); if (u.hp <= 0) this.killUnit(u); }
    for (const o of [...this.blds]) if (o.max > 0 && o.dying < 0 && this.reach(gx, gy, o) < R) { o.hp -= 2600 * cut; if (o.hp <= 0) { o.hp = 0; o.dying = 0; } }
    this.scorch(sx, sy, 50); this.knockTrees(gx, gy, R + 20);
    for (let i = 0; i < 5; i++) this.fires.push({ x: sx + (Math.random() - 0.5) * 80, y: sy + (Math.random() - 0.5) * 40, t: 20 + Math.random() * 20, s: 10 });
  }
  // A destroyed Fusion Reactor goes up in a blast that hurts everyone nearby, friend or foe.
  meltdown(gx: number, gy: number) {
    const R = 5 * CELL, [sx, sy] = this.scr({ x: gx, y: gy });
    for (let i = 0; i < 10; i++) this.blasts.push({ x: sx + (Math.random() - 0.5) * 60, y: sy - Math.random() * 40, t: -Math.random() * 0.4, size: 14 + Math.random() * 12 });
    this.shakeAt = 1.2; audio.explosion(gx, gy, 3);
    const hit: Unit[] = [];
    this.near(gx, gy, R, (u) => { if (Math.hypot(u.x - gx, u.y - gy) < R) hit.push(u); });
    for (const u of hit) if (this.alive(u)) { u.hp -= 450 * (1 - Math.hypot(u.x - gx, u.y - gy) / R * 0.5); if (u.hp <= 0) this.killUnit(u); }
    for (const o of [...this.blds]) if (o.max > 0 && o.dying < 0 && this.reach(gx, gy, o) < R) { o.hp -= 700; if (o.hp <= 0) { o.hp = 0; o.dying = 0; } }
    this.scorch(sx, sy, 30); this.knockTrees(gx, gy, R);
  }
  // Wrecks are worth salvaging: scrap is left on the ground around them for salvagers to collect.
  leaveScrap(gx: number, gy: number, worth: number, r: number) {
    const t = this.terrain, cx0 = t.cellOf(gx), cy0 = t.cellOf(gy), cells: number[] = [];
    for (let y = cy0 - r; y <= cy0 + r; y++) for (let x = cx0 - r; x <= cx0 + r; x++) if (t.inside(x, y) && t.type[t.idx(x, y)] !== T.WATER && t.type[t.idx(x, y)] !== T.ROCK) cells.push(t.idx(x, y));
    for (const i of cells) t.scrap[i] += worth / cells.length;
  }
  collapse(b: Bld) {
    this.blds = this.blds.filter((o) => o !== b);
    if (b.type === 'reactor') this.meltdown((b.cx + 1.5) * CELL, (b.cy + 1.5) * CELL);
    if (DEF[b.type]) this.leaveScrap((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, DEF[b.type].cost * 0.3, Math.ceil(Math.max(b.w, b.h) / 2));
    if (b.team === 0 || b.team === 1) this.stats.razed[1 - b.team]++;
    for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
    const DEB = ['#2a2622', '#3a3430', '#5a5048', '#6a6258', '#1a1816', '#7a5a3a'];
    for (let gy = b.cy * CELL; gy < (b.cy + b.h) * CELL; gy++) for (let gx = b.cx * CELL; gx < (b.cx + b.w) * CELL; gx++) {
      if (Math.random() < 0.25) continue;
      const [sx, sy] = toScreen(gx, gy), lift = this.terrain.lift(gx, gy);
      const c = DEB[(Math.random() * DEB.length) | 0];
      this.terrain.stamp(Math.round(sx), Math.round(sy - lift), (ctx, x, y) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); });
    }
    for (let i = 0; i < b.w * b.h; i++) { const [sx, sy] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL); this.fires.push({ x: sx, y: sy, t: 10 + Math.random() * 8, s: 10 }); }
    const [sx, sy] = toScreen((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL);
    this.blasts.push({ x: sx, y: sy - 8, t: 0, size: 10 + b.w * 5 });
    audio.collapse((b.cx + 1) * CELL, (b.cy + 1) * CELL);
    this.shakeAt = Math.max(this.shakeAt, 0.6);
  }

  // A blackened crater pressed into the ground.
  scorch(sx: number, sy: number, r: number) {
    this.terrain.stamp(Math.round(sx), Math.round(sy), (ctx, x, y) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r * 1.3; dx <= r * 1.3; dx++) {
        const d = Math.hypot(dx / 1.3, dy) / r + (Math.random() - 0.5) * 0.3;
        if (d > 1) continue;
        ctx.fillStyle = d < 0.45 ? 'rgba(20,16,12,0.55)' : d > 0.8 && Math.random() < 0.3 ? 'rgba(120,100,70,0.35)' : 'rgba(30,24,18,0.3)';
        ctx.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
      }
    });
  }

  // Blasts topple nearby trees, falling away from the explosion.
  knockTrees(gx: number, gy: number, r: number) {
    const row = Math.floor(gy / CELL);
    for (let rr = row - 1; rr <= row + 1; rr++) for (const tr of this.trees[rr] ?? []) {
      if (tr.fall >= 0 || Math.hypot(tr.x - gx, tr.y - gy) > r) continue;
      tr.fall = 0; tr.dir = ((Math.round(Math.atan2(tr.y - gy, tr.x - gx) / (Math.PI / 2)) % 4) + 4) % 4;
    }
  }

  emptyGarrison(b: Bld) {
    const ox = (b.cx + b.w / 2) * CELL, oy = (b.cy + b.h + 0.7) * CELL;
    for (let i = 0; i < b.garrison; i++) { const u = this.addUnit('rifle', b.team, ox - 6 + i * 6, oy); u.heading = u.tHead = Math.PI / 2; }
    b.garrison = 0; audio.click();
    this.bark = { who: b.name, line: 'Everybody out.', t: 2 };
  }

  // Damaged buildings smoke, badly damaged ones burn; health shows on anything hurt.
  drawDamage(vx: number, vy: number) {
    const ctx = this.ctx;
    for (const b of this.blds) {
      if (b.max <= 0 || b.dying >= 0) continue;
      const f = b.hp / b.max, [sx, sy] = toScreen((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL), x = Math.round(sx - vx), y = Math.round(sy - vy);
      if (x < -60 || x > this.FW + 60 || y < -80 || y > this.FH + 40) continue;
      if (f < 0.6 && Math.random() < 0.15) this.puffs.push({ x: sx + (Math.random() - 0.5) * b.w * 14, y: sy - 14, vx: 2, vy: -6, t: 0, life: 2, c: f < 0.3 ? '#2a2826' : '#5a5650', s: 2 });
      if (f < 0.3 && Math.random() < 0.3) this.puffs.push({ x: sx + (Math.random() - 0.5) * b.w * 10, y: sy - 10, vx: 0, vy: -10, t: 0, life: 0.3, c: '#ff9a30', s: 1 });
      if ((f < 1 || b === this.selBld) && (b.team === 0 || this.seenAt(sx, sy))) bar(ctx, x - 12 * b.w, y - 26 - b.h * 6, 24 * b.w, f);
    }
    for (const u of this.units) {
      if (u.selected || u.hp >= u.def.hp) continue;
      const [sx, sy] = this.scr(u), x = Math.round(sx - vx), y = Math.round(sy - vy), r = u.def.radius + 2;
      if (x < -20 || x > this.FW + 20 || y < -20 || y > this.FH + 20) continue;
      bar(ctx, x - r + 1, y - (u.def.vehicle ? r + 10 : 15), r * 2 - 1, u.hp / u.def.hp);
    }
  }

  // ---- fog of war ----
  sees(x: number, y: number) { const t = this.terrain, cx = t.cellOf(x), cy = t.cellOf(y); return t.inside(cx, cy) && this.vis[t.idx(cx, cy)] === 2; }
  sightOf(type: string, garrison = 0) { return ({ tank: 6, builder: 7, rifle: 5, rocket: 5, grenadier: 5, juggernaut: 6, wall: 1, hospital: 4, foundry: 4, reactor: 5, gunship: 7, flak: 6, radar: 22, battery: 5, flakTower: 6, airfield: 6, colossus: 8, provingGround: 5, silo: 4, interceptor: 6, shield: 5, scout: 9, artillery: 4, harvester: 4, workshop: 4, fieldCommand: 8, guardTower: 7, emplacement: 7, watchtower: garrison ? 11 : 0, bunker: garrison ? 6 : 0 } as Record<string, number>)[type] ?? 5; }
  updateFog() {
    const v = this.vis, t = this.terrain;
    for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
    let explored = false; // new ground uncovered? only then do the fog pictures need redrawing
    const reveal = (x: number, y: number, r: number) => {
      const cx = t.cellOf(x), cy = t.cellOf(y);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r && t.inside(cx + dx, cy + dy)) { const i = t.idx(cx + dx, cy + dy); if (v[i] === 0) explored = true; v[i] = 2; }
    };
    for (const u of this.units) if (u.team === 0) reveal(u.x, u.y, this.sightOf(u.type));
    for (const b of this.blds) if (b.team === 0 && b.dying < 0) { const r = this.sightOf(b.type, b.garrison); if (r) reveal((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, r); }
    for (const b of this.blds) if (!b.seen) for (let y = b.cy; y < b.cy + b.h && !b.seen; y++) for (let x = b.cx; x < b.cx + b.w; x++) if (v[t.idx(x, y)] === 2) { b.seen = true; break; }
    if (!explored && this.fogMask.width === N) return;
    this.buildFogMask();
    // the radar's fog: black where never seen
    const M = 128, step = SW / M, fm = this.fogMini;
    if (fm.width !== M) { fm.width = M; fm.height = M; }
    const fctx = fm.getContext('2d')!, img = fctx.createImageData(M, M), d = img.data;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const [gx, gy] = toGround((x + 0.5) * step, (y + 0.5) * step), cx = t.cellOf(gx), cy = t.cellOf(gy);
      const s = t.inside(cx, cy) ? v[t.idx(cx, cy)] : 0, k = (y * M + x) * 4;
      d[k] = 8; d[k + 1] = 9; d[k + 2] = 10; d[k + 3] = s === 0 ? 255 : 0;
    }
    fctx.putImageData(img, 0, 0);
  }
  // Fog on the map: one small image (a pixel per cell) of where you've never been, blurred so its
  // edges are soft and round, then stretched over the turned map. Explored ground stays clear.
  fogMask = document.createElement('canvas');
  buildFogMask() {
    const m = this.fogMask, v = this.vis, t = this.terrain;
    if (m.width !== N) { m.width = N; m.height = N; }
    const a = new Float32Array(N * N);
    for (let i = 0; i < a.length; i++) a[i] = v[i] === 0 ? 1 : 0;
    const b = new Float32Array(N * N); // soften: a 3-wide average across, then down, twice
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; b[i] = ((x > 0 ? a[i - 1] : 1) + a[i] + (x < N - 1 ? a[i + 1] : 1)) / 3; }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; a[i] = ((y > 0 ? b[i - N] : 1) + b[i] + (y < N - 1 ? b[i + N] : 1)) / 3; }
    }
    const ctx = m.getContext('2d')!, img = ctx.createImageData(N, N), d = img.data;
    for (let i = 0; i < N * N; i++) { d[i * 4] = 13; d[i * 4 + 1] = 12; d[i * 4 + 2] = 11; d[i * 4 + 3] = Math.round(Math.min(1, a[i] * 1.6) * 255); }
    ctx.putImageData(img, 0, 0);
  }
  drawFog(vx: number, vy: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true; // smooth stretching gives the soft edge
    ctx.setTransform(YC * CELL, YS * CELL, -YS * CELL, YC * CELL, YS * MAPSIZE - vx, -vy); // same turn as the map: cell (x, y) lands where the ground does
    ctx.drawImage(this.fogMask, 0, 0);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
  // Is this screen point somewhere you can currently see? (Effects in the fog stay hidden.)
  seenAt(sx: number, sy: number) {
    if (this.state === 'title') return true;
    const [gx, gy] = toGround(sx, sy + 4), t = this.terrain, cx = t.cellOf(gx), cy = t.cellOf(gy);
    return t.inside(cx, cy) && this.vis[t.idx(cx, cy)] === 2;
  }

  // A side is beaten when it has no buildings and no fighting units left.
  checkEnd() {
    const standing = (team: number) => this.blds.some((b) => b.team === team && b.max > 0 && b.dying < 0 && b.type !== 'wall') || this.units.some((u) => u.team === team && u.type === 'builder'); // no buildings and no builder: beaten
    if (!standing(1)) { this.state = 'won'; this.menuHot = 0; audio.fanfare(); }
    else if (!standing(0)) { this.state = 'lost'; this.menuHot = 0; audio.alarm(); }
  }

  // ---- helpers the computer opponent uses ----
  isCapturable(b: Bld) { return !!CAPTURE[b.type]; }
  orderUnits(us: Unit[], x: number, y: number, amove: boolean, together = false) {
    const pace = together && us.length > 1 ? Math.min(...us.map((u) => u.def.speed)) : 0; // an attack wave travels together
    us.forEach((u, i) => {
      u.pace = pace;
      const a = (i / Math.max(1, us.length)) * Math.PI * 2, r = us.length > 1 ? 14 + (i % 3) * 8 : 0;
      const gx = x + Math.cos(a) * r, gy = y + Math.sin(a) * r;
      u.goal = [gx, gy]; u.amove = amove; u.forced = false; u.stuck = 0;
      u.path = this.route(u, gx, gy);
    });
  }
  sendIn(u: Unit, b: Bld) {
    const dx = (b.cx + b.w / 2) * CELL, dy = (b.cy + b.h + 0.5) * CELL;
    u.enter = b; u.goal = [dx, dy]; u.stuck = 0; u.path = findPath(this.terrain, u.x, u.y, dx, dy, false);
  }
  tapSeep(o: { cx: number; cy: number; big: boolean; tapped: boolean }, team: number) {
    o.tapped = true;
    this.addBld('derrick', team, o.cx - 1, o.cy - 1, 2, 2, 'Derrick');
    const b = this.blds[this.blds.length - 1];
    this.startSite(b); b.pw = o.big ? 200 : 100;
  }
  // An urgent message for the player, with an alarm.
  alertAt: [number, number] | null = null; alertT = 0;
  warn(line: string, at?: [number, number]) { this.bark = { who: 'Alert', line: line + (at ? '  (SPACE TO VIEW)' : ''), t: 4 }; audio.alarm(); if (at) this.alertAt = at; }

  // ---- construction ----
  startSite(b: Bld) { b.rise = 0; b.hp = Math.max(1, b.max * 0.1); }
  // send a builder to the nearest open cell around a site (the closest edge may be walled in)
  assignSite(u: Unit, b: Bld) {
    u.buildSite = b;
    const t = this.terrain, spots: [number, number][] = [];
    for (let y = b.cy - 1; y <= b.cy + b.h; y++) for (let x = b.cx - 1; x <= b.cx + b.w; x++)
      if ((x < b.cx || y < b.cy || x >= b.cx + b.w || y >= b.cy + b.h) && t.open(x, y, u.def.crush)) spots.push([(x + 0.5) * CELL, (y + 0.5) * CELL]);
    spots.sort((p, q) => Math.hypot(p[0] - u.x, p[1] - u.y) - Math.hypot(q[0] - u.x, q[1] - u.y));
    u.stuck = 0; u.queue = [];
    for (const [gx, gy] of spots.slice(0, 4)) {
      const path = findPath(t, u.x, u.y, gx, gy, u.def.crush), end = path[path.length - 1];
      if (end && Math.hypot(end[0] - gx, end[1] - gy) < CELL) { u.goal = [gx, gy]; u.path = path; return; }
    }
    if (spots[0]) { u.goal = spots[0]; u.path = findPath(t, u.x, u.y, spots[0][0], spots[0][1], u.def.crush); }
  }
  cancelSite(b: Bld) {
    const d = DEF[b.type];
    if (d) this.prods[b.team].credits += Math.round(d.cost * b.rise);
    this.blds = this.blds.filter((o) => o !== b);
    for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
    if (b === this.selBld) this.selBld = null;
    audio.click();
  }
  // Your idle builders don't stand about: they help with a site or patch up damage within 10 cells.
  builderHelp() {
    for (const u of this.builders(0)) {
      if (u.buildSite || u.goal || u.path.length) continue;
      let best: Bld | null = null, bd = 10 * CELL;
      for (const b of this.blds) if (b.team === 0 && b.max > 0 && b.dying < 0 && b.type !== 'wall' && (b.rise < 1 || b.hp < b.max * 0.9)) { const d = this.reach(u.x, u.y, b); if (d < bd) { bd = d; best = b; } }
      if (best) this.assignSite(u, best);
    }
  }
  // Builders at a site spend credits and raise the building; up to three can work together.
  updateConstruction(dt: number) {
    for (const b of this.blds) {
      if (b.dying >= 0 || b.max <= 0) continue;
      const d = DEF[b.type];
      if (!d) { b.rise = 1; continue; }
      if (b.rise >= 1 && b.hp >= b.max) continue;
      const crew = this.units.filter((u) => u.buildSite === b && this.reach(u.x, u.y, b) < 36).length;
      if (!crew) continue;
      if (b.rise >= 1) { // repairs: a builder restores about 5% a second, for a third of what the lost part cost
        const want = Math.min(b.max - b.hp, b.max * 0.05 * Math.min(crew, 3) * dt), pay = Math.min((want / b.max) * d.cost * 0.33, this.prods[b.team].credits);
        this.prods[b.team].credits -= pay; b.hp += (pay / (d.cost * 0.33)) * b.max;
        if (pay > 0 && Math.random() < dt * 6) { const [px, py] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL); this.puffs.push({ x: px, y: py - 6 - Math.random() * 12, vx: (Math.random() - 0.5) * 20, vy: -10, t: 0, life: 0.3, c: '#fff4b0', s: 1, g: 60 }); }
        if (b.hp >= b.max) { b.hp = b.max; for (const u of this.units) if (u.buildSite === b) u.buildSite = null; }
        continue;
      }
      const team = b.team, pw = this.powers[team];
      const rate = (Math.min(crew, 3) / d.time) * (pw.used > pw.made ? 0.5 : 1) * (team === 1 ? this.aiRate : 1);
      const pay = Math.min(d.cost * rate * dt, this.prods[team].credits, d.cost * (1 - b.rise));
      this.prods[team].credits -= pay;
      b.rise = Math.min(1, b.rise + pay / d.cost);
      b.hp = Math.min(b.max, b.hp + b.max * 0.9 * (pay / d.cost));
      if (pay > 0 && Math.random() < dt * 12) { // welding sparks and dust on the site
        const [px, py] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL), h = 4 + Math.random() * 20 * b.rise;
        this.puffs.push({ x: px, y: py - h, vx: (Math.random() - 0.5) * 20, vy: -10, t: 0, life: 0.3, c: Math.random() < 0.5 ? '#fff4b0' : '#ffb040', s: 1, g: 60 });
        if (Math.random() < 0.4) this.puffs.push({ x: px, y: py, vx: (Math.random() - 0.5) * 6, vy: -4, t: 0, life: 1.2, c: '#8a8070', s: 2 });
      }
      if (b.rise >= 1) {
        b.hp = b.max;
        for (const u of this.units) if (u.buildSite === b) u.buildSite = null;
        if (b.type === 'scrapyard') { const u = this.addUnit('harvester', team, (b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.8) * CELL); u.heading = u.tHead = Math.PI / 2; } // every scrapyard comes with a salvager
        if (team === 0) { this.bark = { who: 'Builder', line: `${d.name} complete.`, t: 3 }; audio.radio(); }
      }
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

  // Wooden scaffold poles at each corner with rails every few pixels, up to the work in progress.
  scaffold(b: Bld, vx: number, vy: number, h: number) {
    const ctx = this.ctx, lift = this.terrain.lift((b.cx + 0.5) * CELL, (b.cy + 0.5) * CELL);
    const corners = [[b.cx, b.cy], [b.cx + b.w, b.cy], [b.cx + b.w, b.cy + b.h], [b.cx, b.cy + b.h]].map(([gx, gy]) => { const [sx, sy] = toScreen(gx * CELL, gy * CELL); return [Math.round(sx - vx), Math.round(sy - lift - vy)]; });
    for (const [x, y] of corners) { ctx.fillStyle = '#7a5a34'; ctx.fillRect(x, y - h, 1, h); ctx.fillStyle = '#9a7a4a'; ctx.fillRect(x, y - h, 1, 1); }
    for (let k = 4; k < h; k += 6) for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i], [bx2, by2] = corners[(i + 1) % 4], n = Math.max(1, Math.round(Math.hypot(bx2 - ax, by2 - ay)));
      ctx.fillStyle = i < 2 ? 'rgba(150,120,70,0.8)' : 'rgba(110,86,52,0.9)';
      for (let j = 0; j <= n; j += 1) ctx.fillRect(Math.round(ax + ((bx2 - ax) * j) / n), Math.round(ay + ((by2 - ay) * j) / n) - k, 1, 1);
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
    if (c.garrison && b.team === u.team && b.garrison >= c.garrison) { u.path = []; u.goal = null; return; }
    if (b.team !== u.team && b.garrison > 0) { u.path = []; u.goal = null; return; } // held by the other side
    this.units = this.units.filter((o) => o !== u);
    const was = b.team;
    b.team = u.team;
    if (c.garrison) b.garrison++;
    if (u.team === 0) { this.bark = { who: c.name, line: was === 0 ? 'Another one inside. Cosy.' : 'Captured. The previous owners left in a hurry.', t: 3 }; audio.radio(); audio.click(); }
    else if (was === 0) this.warn(`The enemy has taken our ${c.name}!`, this.posOf(b));
    if (was !== u.team) { b.timer = 0; this.siteBonus(b, true); }
  }

  // Captured sites pay out: vehicles from the motor pool, infantry from the recruiting office.
  siteBonus(b: Bld, first: boolean) {
    const ox = (b.cx + b.w / 2) * CELL, oy = (b.cy + b.h + 0.8) * CELL;
    if (b.type === 'motorPool') this.addUnit('tank', b.team, ox, oy).heading = Math.PI / 2;
    if (b.type === 'recruitOffice') for (let i = 0; i < (first ? 3 : 2); i++) this.addUnit('rifle', b.team, ox - 6 + i * 6, oy);
  }
  updateSites(dt: number) {
    for (const b of this.blds) {
      if (b.team === 2 || (b.type !== 'motorPool' && b.type !== 'recruitOffice')) continue;
      if (!this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) continue; // no base of your own: the site has nobody to report to
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
      const civil = line.filter(([cx, cy]) => t.bases.every(([bx, by]) => Math.hypot(cx - bx, cy - by) > 16)); // stay away from the armies
      if (civil.length < 2) return;
      for (let i = 0; i < 3; i++) {
        const route = civil.map(([cx, cy]) => [cx * CELL + 12, cy * CELL + 12] as [number, number]);
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

  // Run drawing code against the interface layer: its own context, size and mouse position.
  withHud(fn: () => void) {
    const M = this.mouse, keep = [this.ctx, this.FW, this.FH, M.x, M.y] as const;
    this.ctx = this.hctx; this.FW = this.HW; this.FH = this.HH; M.x = M.hx; M.y = M.hy;
    try { fn(); } finally { [this.ctx, this.FW, this.FH, M.x, M.y] = keep as unknown as [CanvasRenderingContext2D, number, number, number, number]; }
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
    this.drawMenu(Math.round((this.FW - 120) / 2), y + 66, 120);
    const foot = 'DRAG TO SELECT   RIGHT-CLICK TO MOVE   SWIPE TO SCROLL';
    text(ctx, foot, Math.round((this.FW - textWidth(foot)) / 2), this.FH - 16, C.muted, 1, C.ink);
  }

  // A riveted panel of menu items; remembers where each item is for clicks.
  drawMenu(px: number, py: number, pw: number) {
    const ctx = this.ctx, items = this.menuItems, ph = 16 + items.length * 16;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    this.menuRects = [];
    items.forEach((m, i) => {
      const label = m.label, ty = py + 9 + i * 16, hot = i === this.menuHot;
      this.menuRects.push({ id: m.id, x: px, y: ty - 3, w: pw, h: 14 });
      if (hot) {
        ctx.fillStyle = C.red; ctx.fillRect(px + 6, ty - 3, pw - 12, 13);
        ctx.fillStyle = '#e04a34'; ctx.fillRect(px + 6, ty - 3, pw - 12, 1);
        ctx.fillStyle = C.redD; ctx.fillRect(px + 6, ty + 9, pw - 12, 1);
        const bob = Math.floor(this.time * 4) % 2; // a small pointer that nudges in and out
        text(ctx, '>', px + 10 + bob, ty, C.gold, 1, C.ink); text(ctx, '<', px + pw - 15 - bob, ty, C.gold, 1, C.ink);
      }
      text(ctx, label, Math.round(px + (pw - textWidth(label)) / 2), ty, hot ? C.gold : C.cream, 1, C.ink);
    });
  }
  menuHit() {
    const M = this.mouse;
    return this.menuRects.find((r) => M.hx > r.x && M.hx < r.x + r.w && M.hy > r.y && M.hy < r.y + r.h)?.id ?? null;
  }

  drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,8,10,0.55)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const t = 'PAUSED', s = 3, w = textWidth(t, s), y = Math.max(8, Math.round(this.FH * 0.5) - 150);
    text(ctx, t, Math.round((this.FW - w) / 2), y, C.gold, s, C.ink);
    this.drawMenu(Math.round((this.FW - 120) / 2), y + 28, 120);
    // the controls, on a card under the menu
    const rows: [string, string][] = [
      ['CLICK / DRAG', 'SELECT'], ['DOUBLE-CLICK', 'SAME TYPE ON SCREEN'], ['T', 'ALL OF THE SELECTED TYPES'],
      ['RIGHT-CLICK', 'MOVE, ATTACK, BUILD, REPAIR'], ['SHIFT + RIGHT', 'ADD A WAYPOINT'], ['A', 'ATTACK-MOVE'],
      ['S / X', 'STOP / SPREAD OUT'], ['CTRL + 1-9', 'MAKE A GROUP (1-9 PICKS IT)'], ['SWIPE / ARROWS', 'SCROLL THE MAP'],
      ['F / SHIFT + F', 'WHOLE ARMY / IDLE ARMY'], ['. (FULL STOP)', 'NEXT IDLE BUILDER'], ['R', 'REPEAT A FACTORY\'S QUEUE'], ['DELETE TWICE', 'SELL A BUILDING (HALF BACK)'],
      ['SPACE / H', 'LATEST ALERT / YOUR BASE'], ['TAB', 'BASE / ARMY BUILD LIST'], ['- / +', 'ZOOM OUT / IN'],
    ];
    const pw = 282, ph = rows.length * 10 + 12, px = Math.round((this.FW - pw) / 2), py = y + 108;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    rows.forEach(([k, v], i) => { text(ctx, k, px + 10, py + 7 + i * 10, C.gold); text(ctx, v, px + 104, py + 7 + i * 10, C.cream); });
  }

  // Victory or defeat: a poster-style panel with the battle's numbers.
  drawEnd() {
    const ctx = this.ctx, won = this.state === 'won';
    ctx.fillStyle = won ? 'rgba(8,10,8,0.5)' : 'rgba(14,6,6,0.6)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const y = Math.round(this.FH * 0.2), title = won ? 'VICTORY' : 'DEFEAT', s = 4, w = textWidth(title, s), x = Math.round((this.FW - w) / 2);
    if (won) this.sunburst(Math.round(this.FW / 2), y + 14, Math.round(Math.min(this.FW, this.FH) * 0.24));
    text(ctx, title, x + 3, y + 3, C.ink, s); text(ctx, title, x, y, won ? C.gold : C.bad, s);
    const quip = won ? 'THE MINISTRY THANKS YOU FOR YOUR PATIENCE.' : 'YOUR BASE HAS BEEN REZONED.';
    text(ctx, quip, Math.round((this.FW - textWidth(quip)) / 2), y + 38, C.cream, 1, C.ink);
    const st = this.stats, m = Math.floor(st.time / 60), sec = String(Math.floor(st.time % 60)).padStart(2, '0');
    const rows: [string, string][] = [['BATTLE TIME', `${m}:${sec}`], ['UNITS BUILT', String(st.built[0])], ['UNITS LOST', String(st.lost[0])], ['ENEMY UNITS DESTROYED', String(st.lost[1])], ['BUILDINGS RAZED', String(st.razed[0])], ['ENEMY STRATEGY', (this.ai?.planName ?? '').toUpperCase()]];
    const pw = 190, px = Math.round((this.FW - pw) / 2), py = y + 54, ph = rows.length * 11 + 10;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    rows.forEach(([k, v], i) => { text(ctx, k, px + 10, py + 7 + i * 11, C.muted); text(ctx, v, px + pw - 10 - textWidth(v), py + 7 + i * 11, C.gold); });
    this.drawMenu(Math.round((this.FW - 120) / 2), py + ph + 8, 120);
  }

  // ------------------------------------------------------------------ the side panel
  // Drawn on its own layer at a fixed pixel size (see withHud), so it never changes size when
  // you zoom the battlefield. Credits and power, the radar, what's selected, the build grid, orders.
  drawSidebar() {
    const ctx = this.ctx, W = this.FW, H = this.FH, x0 = W - SB, M = this.mouse;
    panel(ctx, x0, 0, SB, H);
    ctx.fillStyle = C.redD; ctx.fillRect(x0, 0, 3, H); ctx.fillStyle = C.red; ctx.fillRect(x0, 0, 2, H);
    for (let y = 8; y < H; y += 24) { ctx.fillStyle = C.gold; ctx.fillRect(x0, y, 2, 2); }
    this.buttons = [];
    // header: name and a pause button
    ctx.fillStyle = C.red; ctx.fillRect(x0 + 7, 4, 6, 6); ctx.fillStyle = C.gold; ctx.fillRect(x0 + 9, 6, 2, 2);
    text(ctx, 'CONQUER', x0 + 16, 4, C.gold, 1, C.ink);
    this.buttons.push({ id: 'pause', x: x0 + SB - 20, y: 2, w: 16, h: 11, label: 'II' });
    // credits and power
    const cr = '$ ' + Math.floor(this.prod.credits).toLocaleString('en-US');
    inset(ctx, x0 + 6, 16, SB - 12, 12, C.screen);
    text(ctx, cr, Math.round(x0 + SB / 2 - textWidth(cr) / 2), 19, C.gold);
    const low = this.power.used > this.power.made, cap = Math.max(this.power.made, this.power.used, 1);
    text(ctx, 'POWER', x0 + 6, 32, low ? C.bad : C.goldD);
    inset(ctx, x0 + 40, 31, SB - 46, 9, C.ink);
    ctx.fillStyle = low ? C.bad : C.ok; ctx.fillRect(x0 + 41, 32, Math.round((this.power.made / cap) * (SB - 48)), 3);
    ctx.fillStyle = low && Math.floor(this.time * 3) % 2 ? '#ff8060' : C.warn; ctx.fillRect(x0 + 41, 36, Math.round((this.power.used / cap) * (SB - 48)), 3);
    // radar
    const mx = x0 + Math.round((SB - 130) / 2), my = 45, mm = 128;
    this.mm = { x: mx + 1, y: my + 1, s: mm };
    inset(ctx, mx, my, mm + 2, mm + 2, C.ink);
    const radar = this.owns('fieldCommand');
    if (!radar) { // no Field Command, no radar: just static
      for (let i = 0; i < 500; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#141614' : '#2a2e2a'; ctx.fillRect(mx + 1 + ((Math.random() * mm) | 0), my + 1 + ((Math.random() * mm) | 0), 1, 1); }
      for (const [i, l] of ['NO RADAR', 'BUILD A', 'FIELD COMMAND'].entries()) text(ctx, l, mx + 1 + Math.round((mm - textWidth(l)) / 2), my + 50 + i * 11, i ? C.goldD : C.muted, 1, C.ink);
      glass(ctx, mx, my, mm + 2, mm + 2);
    }
    if (radar) {
    ctx.drawImage(this.terrain.minimap, mx + 1, my + 1);
    ctx.drawImage(this.fogMini, mx + 1, my + 1);
    const sc = mm / SW, dot = (gx: number, gy: number, c: string, s: number) => { const [a, b] = toScreen(gx, gy); ctx.fillStyle = c; ctx.fillRect(mx + 1 + Math.floor(a * sc), my + 1 + Math.floor(b * sc), s, s); };
    for (const o of this.terrain.oil) if (o.found && !o.tapped) dot((o.cx + 0.5) * CELL, (o.cy + 0.5) * CELL, C.gold, 2);
    for (const b of this.blds) if (b.team !== 2 && (b.team === 0 || b.seen)) dot((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, b.team === 0 ? '#6ab8ff' : '#ff5a40', 3);
    for (const u of this.units) if (u.team === 0 || this.sees(u.x, u.y)) dot(u.x, u.y, u.team === 0 ? '#9ad0ff' : '#ff7a60', 2);
    ctx.save(); ctx.beginPath(); ctx.rect(mx + 1, my + 1, mm, mm); ctx.clip();
    const vw = (this.worldW() * sc), vh = this.worldH() * sc, rx = mx + 1 + Math.round(this.vx * sc), ry = my + 1 + Math.round(this.vy * sc);
    ctx.fillStyle = C.cream;
    ctx.fillRect(rx, ry, Math.round(vw), 1); ctx.fillRect(rx, ry + Math.round(vh), Math.round(vw) + 1, 1); ctx.fillRect(rx, ry, 1, Math.round(vh)); ctx.fillRect(rx + Math.round(vw), ry, 1, Math.round(vh));
    for (let k = 0; k < 4; k++) { // radar sweep
      const a = this.time * 1.6 - k * 0.07;
      ctx.fillStyle = `rgba(126,224,138,${0.45 - k * 0.1})`;
      for (let r = 2; r < 92; r += 1) ctx.fillRect(mx + 65 + Math.round(Math.cos(a) * r), my + 65 + Math.round(Math.sin(a) * r), 1, 1);
    }
    if (low) {
      for (let i = 0; i < 700; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#1a1c1a' : '#6a706a'; ctx.fillRect(mx + 1 + ((Math.random() * mm) | 0), my + 1 + ((Math.random() * mm) | 0), 1, 1); }
      if (Math.floor(this.time * 2) % 2) text(ctx, 'LOW POWER', mx + 38, my + 60, C.bad, 1, C.ink);
    }
    ctx.restore();
    glass(ctx, mx, my, mm + 2, mm + 2);
    }
    // what's selected
    const iy = my + mm + 8, ih = 46;
    inset(ctx, x0 + 6, iy, SB - 12, ih, C.screen);
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + 7, iy + 1, SB - 14, ih - 2); ctx.clip();
    this.drawInfo(x0 + 10, iy + 4, SB - 20);
    ctx.restore();
    glass(ctx, x0 + 6, iy, SB - 12, ih);
    // build grid: a selected factory shows what it makes; otherwise the tabs decide
    const factory = this.selBld && this.prod.queues[this.selBld.type] ? this.selBld.type : null;
    const ty = iy + ih + 5;
    this.tabs = [{ id: 'structure', x: x0 + 6, y: ty, w: (SB - 14) / 2, h: 11 }, { id: 'unit', x: x0 + 8 + (SB - 14) / 2, y: ty, w: (SB - 14) / 2, h: 11 }];
    const tab = factory ? 'unit' : this.buildTab;
    for (const tb of this.tabs) {
      const on = tab === tb.id;
      ctx.fillStyle = C.metalD; ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
      ctx.fillStyle = on ? C.red : C.metal; ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, tb.h - 2);
      if (on) { ctx.fillStyle = '#e04a34'; ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, 1); }
      const label = tb.id === 'structure' ? 'BASE' : factory ? DEF[factory]?.name.toUpperCase().split(' ')[0] ?? 'ARMY' : 'ARMY';
      text(ctx, label, Math.round(tb.x + (tb.w - textWidth(label)) / 2), tb.y + 2, on ? C.gold : C.muted);
    }
    this.slots = []; this.hoverSlot = null;
    const defs = BUILDS.filter((d) => d.kind === tab && (!factory || d.from === factory));
    const cw = Math.floor((SB - 16) / 3), ch = 34, gy0 = ty + 14, rows = Math.max(1, Math.floor((H - 46 - gy0) / (ch + 2)));
    defs.slice(0, rows * 3).forEach((d, i) => {
      const sx = x0 + 6 + (i % 3) * (cw + 2), sy = gy0 + Math.floor(i / 3) * (ch + 2);
      this.slots.push({ def: d, x: sx, y: sy, w: cw, h: ch });
      this.drawSlot(d, sx, sy, cw, ch, M.x > sx && M.x < sx + cw && M.y > sy && M.y < sy + ch);
    });
    // orders along the bottom
    const by = H - 21, bw = Math.floor((SB - 16) / 3);
    const idleB = this.builders(0).filter((u) => !u.buildSite && !u.goal && !u.path.length).length;
    this.buttons.push({ id: 'army', x: x0 + 6, y: by - 18, w: bw, h: 16, label: 'ARMY', key: 'F' }, { id: 'idleArmy', x: x0 + 8 + bw, y: by - 18, w: bw, h: 16, label: 'IDLE', key: '' }, { id: 'idleBuilder', x: x0 + 10 + bw * 2, y: by - 18, w: bw, h: 16, label: idleB ? `BLD ${idleB}` : 'BLD', key: '.' });
    this.buttons.push({ id: 'stop', x: x0 + 6, y: by, w: bw, h: 16, label: 'STOP', key: 'S' }, { id: 'scatter', x: x0 + 8 + bw, y: by, w: bw, h: 16, label: 'SPLIT', key: 'X' }, { id: 'home', x: x0 + 10 + bw * 2, y: by, w: bw, h: 16, label: 'BASE', key: 'H' });
    for (const b of this.buttons) { const hot = M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h; button(ctx, b, hot, hot && M.down); }
    if (this.hoverSlot) this.drawTooltip(this.hoverSlot.d, x0 - 4, this.hoverSlot.y);
  }

  // Zoomed all the way out, units become crisp symbols drawn at interface size (as in big strategy
  // games): dots for infantry, diamonds for vehicles, triangles for guns, arrows for aircraft,
  // squares for workers; buildings get an outline in their side's colour.
  drawIcons(vx: number, vy: number) {
    const ctx = this.ctx, f = this.k / this.kH, cols = ['#6ab8ff', '#ff5a40'];
    const at = (wx: number, wy: number): [number, number] => [Math.round((wx - vx) * f), Math.round((wy - vy) * f)];
    for (const b of this.blds) {
      if (b.team > 1 || b.max <= 0 || (b.team === 1 && !b.seen)) continue;
      const [sx, sy] = at(...this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }));
      const r = Math.max(2, Math.round(Math.max(b.w, b.h) * CELL * f * 0.42));
      if (sx < -r || sy < -r || sx > this.FW + r || sy > this.FH + r) continue;
      ctx.fillStyle = cols[b.team]; ctx.fillRect(sx - r, sy - r, r * 2, 1); ctx.fillRect(sx - r, sy + r, r * 2 + 1, 1); ctx.fillRect(sx - r, sy - r, 1, r * 2); ctx.fillRect(sx + r, sy - r, 1, r * 2);
      if (DEFENCE[b.type]) ctx.fillRect(sx - 1, sy - 1, 3, 3);
    }
    const SHAPE: Record<string, string> = { rifle: 'dot', rocket: 'dot', grenadier: 'dot', scout: 'smallDiamond', tank: 'diamond', flak: 'diamond', juggernaut: 'bigDiamond', colossus: 'huge', artillery: 'triangle', harvester: 'square', builder: 'square', gunship: 'arrow' };
    for (const u of this.units) {
      if (u.team > 1 || (u.team === 1 && !this.sees(u.x, u.y))) continue;
      const [sx, sy] = at(...this.scr(u));
      if (sx < -6 || sy < -6 || sx > this.FW + 6 || sy > this.FH + 6) continue;
      const c = u.selected ? '#ffffff' : cols[u.team], shape = SHAPE[u.type] ?? 'dot';
      const fill = (pts: number[][]) => { ctx.fillStyle = C.ink; for (const [x, y, w, h] of pts) ctx.fillRect(sx + x - 1, sy + y - 1, w + 2, h + 2); ctx.fillStyle = c; for (const [x, y, w, h] of pts) ctx.fillRect(sx + x, sy + y, w, h); };
      if (shape === 'dot') fill([[-1, -1, 2, 2]]);
      else if (shape === 'square') fill([[-2, -2, 4, 4]]);
      else if (shape === 'smallDiamond') fill([[-1, -2, 2, 4], [-2, -1, 4, 2]]);
      else if (shape === 'diamond') fill([[-1, -3, 2, 6], [-2, -2, 4, 4], [-3, -1, 6, 2]]);
      else if (shape === 'bigDiamond') fill([[-1, -4, 2, 8], [-2, -3, 4, 6], [-3, -2, 6, 4], [-4, -1, 8, 2]]);
      else if (shape === 'huge') fill([[-2, -6, 4, 12], [-4, -4, 8, 8], [-6, -2, 12, 4]]);
      else if (shape === 'triangle') fill([[-1, -3, 2, 2], [-2, -1, 4, 2], [-3, 1, 6, 2]]);
      else if (shape === 'arrow') fill([[-1, -3, 2, 2], [-3, -1, 6, 2], [-3, 1, 2, 2], [1, 1, 2, 2]]);
      if (u.type === 'rocket' || u.type === 'flak') { ctx.fillStyle = C.ink; ctx.fillRect(sx, sy, 1, 1); } // anti-armour / anti-air: a dark pip
      if (u.type === 'harvester' || u.type === 'builder') { ctx.fillStyle = C.gold; ctx.fillRect(sx - 1, sy - 1, 2, 2); }
    }
  }

  // A card beside the build panel: what the item is called, what it costs, what it's for.
  hoverSlot: { d: BuildDef; y: number } | null = null;
  drawTooltip(d: BuildDef, right: number, y: number) {
    const ctx = this.ctx, w = 170, ok = this.available(d);
    const stats = [`$${d.cost}`, d.power ? `POWER ${d.power > 0 ? '+' : ''}${d.power}` : '', d.time ? `${d.time}S` : 'INSTANT'].filter(Boolean).join('   ');
    const wrap = (str: string) => { const out: string[] = []; let line = ''; for (const word of str.split(' ')) { const t = line ? line + ' ' + word : word; if (textWidth(t) > w - 14) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; };
    const role = wrap(ROLE[d.key] ?? ''), need = ok ? [] : wrap(this.tipFor(d));
    const h = 26 + role.length * 9 + (need.length ? need.length * 9 + 4 : 0);
    const x = right - w, top = Math.max(2, Math.min(this.FH - h - 2, y));
    panel(ctx, x, top, w, h);
    text(ctx, d.name.toUpperCase(), x + 7, top + 5, C.gold, 1, C.ink);
    text(ctx, stats, x + 7, top + 15, C.cream);
    role.forEach((l, i) => text(ctx, l, x + 7, top + 26 + i * 9, C.muted));
    need.forEach((l, i) => text(ctx, l, x + 7, top + 30 + role.length * 9 + i * 9, C.bad));
  }

  // The middle screen: unit types in the selection (click one to keep only that type), or the
  // selected building's details, or a hint.
  chips: { type: string; x: number; y: number; w: number; h: number }[] = [];
  drawInfo(x: number, y: number, w: number) {
    const ctx = this.ctx, sel = this.selected();
    this.chips = [];
    if (sel.length) {
      const types = [...new Set(sel.map((u) => u.type))];
      text(ctx, sel.length === 1 ? sel[0].def.name.toUpperCase() : `${sel.length} UNITS`, x, y, C.gold);
      types.slice(0, 4).forEach((ty, i) => {
        const cx = x + i * 32, cy = y + 11, n = sel.filter((u) => u.type === ty).length;
        this.chips.push({ type: ty, x: cx, y: cy, w: 30, h: 26 });
        ctx.fillStyle = C.screenL; ctx.fillRect(cx, cy, 30, 26);
        this.drawIcon({ key: ty, kind: 'unit' } as BuildDef, cx, cy, 30, 22);
        const hp = sel.filter((u) => u.type === ty).reduce((s, u) => s + u.hp / u.def.hp, 0) / n;
        bar(ctx, cx + 1, cy + 23, 28, hp);
        if (n > 1) text(ctx, String(n), cx + 30 - textWidth(String(n)) - 1, cy + 1, C.gold, 1, C.ink);
      });
      return;
    }
    const b = this.selBld;
    if (b) {
      const pw = b.pw ?? POWER[b.type] ?? 0, q = this.prod.queues[b.type];
      text(ctx, b.name.toUpperCase(), x, y, C.gold);
      if (b.max > 0) bar(ctx, x, y + 10, w, b.hp / b.max);
      text(ctx, b.rise < 1 ? 'UNDER CONSTRUCTION' : pw ? `POWER ${pw > 0 ? '+' : ''}${pw}` : CAPTURE[b.type] ? `${b.garrison} INSIDE  (E: EMPTY)` : '', x, y + 15, pw > 0 ? C.ok : C.cream);
      const special = b.type === 'silo' ? ((b.timer ?? 0) >= MISSILE_TIME ? 'READY: RIGHT-CLICK A TARGET' : `MISSILE ${Math.floor(((b.timer ?? 0) / MISSILE_TIME) * 100)}% CHARGED`)
        : b.type === 'interceptor' ? `INTERCEPTORS READY: ${b.ammo ?? 0} / 2` : b.type === 'shield' ? (b.shieldDown ? 'OVERLOADED: REBOOTING' : `SHIELD ${Math.round(((b.shieldHp ?? 0) / SHIELD_HP) * 100)}%`) : '';
      if (special && b.rise >= 1) { text(ctx, special, x, y + 25, b.type === 'silo' && (b.timer ?? 0) >= MISSILE_TIME ? C.bad : C.ok); return; }
      const info = q ? (q.length ? `${q[0].def.name.toUpperCase()} ${Math.floor(this.prod.progress(q[0]) * 100)}%  +${q.length - 1}` : 'CHOOSE UNITS BELOW') : b.type === 'scrapyard' ? 'SALVAGERS UNLOAD HERE' : '';
      text(ctx, info, x, y + 25, C.cream);
      if (q) text(ctx, this.prod.repeat[b.type] ? 'REPEAT ON (R)   RIGHT-CLICK: RALLY' : 'R: REPEAT   RIGHT-CLICK: RALLY', x, y + 34, this.prod.repeat[b.type] ? C.ok : C.muted);
      return;
    }
    if (this.hoverBld && CAPTURE[this.hoverBld.type]) {
      const hb = this.hoverBld, c = CAPTURE[hb.type];
      text(ctx, c.name.toUpperCase(), x, y, C.gold);
      text(ctx, hb.team === 0 ? 'YOURS' : hb.team === 1 ? 'ENEMY' : 'NEUTRAL', x, y + 10, C.cream);
      text(ctx, 'SEND INFANTRY IN', x, y + 22, C.muted);
      return;
    }
    text(ctx, 'NOTHING SELECTED', x, y, C.muted);
    text(ctx, 'DRAG OVER UNITS, OR', x, y + 14, C.muted);
    text(ctx, 'CLICK A BUILDING.', x, y + 24, C.muted);
  }

  // One build button: the item's picture, price, progress, and lock if it isn't available yet.
  drawSlot(d: BuildDef, sx: number, sy: number, w: number, h: number, hot: boolean) {
    const ctx = this.ctx, p = this.prod, ok = this.available(d);
    inset(ctx, sx, sy, w, h, hot && ok ? '#2a3824' : '#18201a');
    ctx.save(); ctx.beginPath(); ctx.rect(sx + 1, sy + 1, w - 2, h - 2); ctx.clip();
    this.drawIcon(d, sx + 1, sy + 1, w - 2, h - 9);
    const job = d.kind === 'structure' ? null : p.queues[d.from!]?.find((j) => j.def === d);
    const f = d.kind === 'structure' ? 0 : p.queues[d.from!][0]?.def === d ? p.progress(p.queues[d.from!][0]) : 0;
    if (job) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx + 1, sy + 1, w - 2, Math.round((h - 2) * (1 - f))); }
    if (!ok) { ctx.fillStyle = 'rgba(10,10,12,0.6)'; ctx.fillRect(sx + 1, sy + 1, w - 2, h - 2); }
    ctx.restore();
    ctx.fillStyle = 'rgba(8,8,10,0.75)'; ctx.fillRect(sx + 1, sy + h - 9, w - 2, 8);
    if (this.placing === d) { if (Math.floor(this.time * 3) % 2) text(ctx, 'PLACE', sx + Math.round((w - textWidth('PLACE')) / 2), sy + h - 8, C.gold); }
    else text(ctx, '$' + d.cost, sx + Math.round((w - textWidth('$' + d.cost)) / 2), sy + h - 8, ok ? C.cream : C.muted);
    const count = d.kind === 'unit' ? p.queues[d.from!].filter((j) => j.def === d).length : 0;
    if (count) text(ctx, String(count), sx + w - 7, sy + 2, C.gold, 1, C.ink);
    if (hot) this.hoverSlot = { d, y: sy };
  }

  // Draw an item's picture centred in a box, using the visible part of its sprite.
  drawIcon(d: BuildDef, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const parts: Sprite[] = d.kind === 'structure' ? [this.icons[d.key]] : (() => { const look = this.looks[d.key + '0']; return look ? [facing(look.body, Math.PI * 0.25), ...(look.turret ? [facing(look.turret, Math.PI * 0.25)] : [])] : []; })();
    if (!parts.length || !parts[0]) return;
    const bx = trimBox(parts[0]);
    const ox = Math.round(x + w / 2 - (bx.x + bx.w / 2)), oy = Math.round(y + h / 2 - (bx.y + bx.h / 2));
    ctx.drawImage(parts[0].img, ox, oy);
    if (parts[1]) { // a turret sits on its body at the same anchor offset the game uses
      const look = this.looks[d.key + '0'], df = look.def, at = df.turretAt!, ax = at[0] - df.bodyPivot[0], az = at[2] - df.bodyPivot[2], a = Math.PI * 0.25;
      const tx = ox + parts[0].ax + ax * Math.cos(a) - az * Math.sin(a), tyy = oy + parts[0].ay + ax * Math.sin(a) + az * Math.cos(a) - (at[1] - df.bodyPivot[1]);
      ctx.drawImage(parts[1].img, Math.round(tx - parts[1].ax), Math.round(tyy - parts[1].ay));
    }
  }

  // Unit chatter and tooltips: a caption at the bottom left of the battlefield.
  drawCaption() {
    if (this.bark.t <= 0) return;
    const ctx = this.ctx, who = this.bark.who.toUpperCase() + ': ', line = this.bark.line.toUpperCase();
    const w = Math.min(this.FW - SB - 12, textWidth(who + line) + 12), y = this.FH - 18;
    panel(ctx, 6, y, w, 13);
    ctx.save(); ctx.beginPath(); ctx.rect(7, y, w - 2, 13); ctx.clip();
    text(ctx, who, 12, y + 3, C.gold); text(ctx, line, 12 + textWidth(who), y + 3, C.cream);
    ctx.restore();
  }

  owns(key: string, team = 0) { return this.blds.some((b) => b.team === team && b.type === key && b.rise >= 1 && b.dying < 0); }
  costOf(type: string) { return DEF[type]?.cost ?? 0; }
  builders(team: number) { return this.units.filter((u) => u.team === team && u.type === 'builder'); }
  available(d: BuildDef) {
    if (d.kind === 'structure' && !this.builders(0).length) return false;
    if (d.key === 'derrick') return this.terrain.oil.some((o) => o.found && !o.tapped);
    return (d.needs ?? []).every((n) => this.owns(n)) && (d.kind === 'structure' || this.owns(d.from!));
  }
  tipFor(d: BuildDef) {
    if (d.kind === 'structure' && !this.builders(0).length) return 'NEEDS A BUILDER: TRAIN ONE AT THE FIELD COMMAND';
    if (d.key === 'derrick' && !this.available(d)) return 'STRIKE OIL FIRST: ROAM THE MAP WITH VEHICLES';
    if (d.key === 'derrick') return '$600  SMALL SEEP: +100 POWER, $5/S.  BIG STRIKE: +200, $10/S';
    const extra: Record<string, string> = {
      wall: '$30 A BLOCK. CLICK OR DRAG TO LAY A LINE; RIGHT-CLICK TO STOP', hospital: '$800  POWER -20  HEALS INFANTRY NEARBY; UNLOCKS GRENADIERS',
      foundry: '$2500  TURNS UP TO 250 SPARE POWER INTO $20/S', reactor: '$4000  POWER +400. DEVASTATING BLAST IF DESTROYED',
      workshop: '$1000  POWER -20  REPAIRS VEHICLES NEARBY; UNLOCKS FIELD GUNS',
    };
    if (extra[d.key] && this.available(d)) return extra[d.key];
    if (!this.available(d)) return 'NEEDS ' + [...(d.kind === 'unit' ? [d.from!] : []), ...(d.needs ?? [])].filter((n) => !this.owns(n)).map((n) => DEF[n].name.toUpperCase()).join(', ');
    const pw = d.power ? `  POWER ${d.power > 0 ? '+' : ''}${d.power}` : '';
    return `$${d.cost}${pw}  ${d.kind === 'structure' ? 'CLICK, THEN PLACE: A BUILDER PUTS IT UP' : 'CLICK TO TRAIN, RIGHT-CLICK REMOVES'}`;
  }

  buildClick(d: BuildDef, btn: number) {
    const p = this.prod;
    audio.click();
    if (d.kind === 'structure') {
      if (btn === 2) { this.placing = null; return; }
      if (this.available(d)) this.placing = d; // put the foundation down; a builder does the rest
      else this.bark = { who: d.name, line: this.tipFor(d), t: 3 };
      return;
    }
    if (btn === 2) { p.dequeue(d.from!); return; }
    if (this.available(d) && p.queues[d.from!].length < 6) p.queues[d.from!].push({ def: d, spent: 0 });
  }

  // ---- economy: production, power, placing structures, salvaging ----
  updateEconomy(dt: number) {
    for (const team of [0, 1]) {
      const pw = (this.powers[team] = { made: 0, used: 0 });
      for (const b of this.blds) {
        if (b.team !== team || b.rise < 1 || b.dying >= 0) continue;
        const v = b.pw ?? POWER[b.type] ?? 0;
        if (v > 0) pw.made += v; else pw.used -= v;
      }
      const speed = (pw.used > pw.made ? 0.5 : 1) * (team === 1 ? this.aiRate : 1);
      for (const d of this.prods[team].tick(dt, speed, (k) => this.blds.filter((b) => b.team === team && b.type === k && b.rise >= 1 && b.dying < 0).length)) {
        const fs = this.blds.filter((b) => b.team === team && b.type === d.from && b.rise >= 1 && b.dying < 0), f = fs[(Math.random() * fs.length) | 0]; // units roll out of any of your factories
        if (!f) continue;
        const u = this.addUnit(d.key, team, (f.cx + f.w / 2) * CELL, (f.cy + f.h + 0.6) * CELL);
        u.heading = u.tHead = Math.PI / 2;
        this.stats.built[team]++;
        const r = f.rally ?? [(f.cx + f.w / 2) * CELL + (Math.random() - 0.5) * 30, (f.cy + f.h + 2.5) * CELL];
        u.goal = [r[0], r[1]]; u.path = this.route(u, r[0], r[1]);
        if (team === 0) { this.bark = { who: d.name, line: d.key === 'harvester' ? 'Salvager reporting. Show me the scrap.' : 'Reporting for duty.', t: 2.5 }; audio.radio(); }
      }
    }
    this.prospect(dt);
    for (const team of [0, 1]) if (this.owns('fieldCommand', team)) this.prods[team].credits += dt * 4; // a small allowance from HQ, so nobody stalls for good
    if ((this.dangerT -= dt) <= 0) { this.dangerT = 5; this.markDanger(); }
    // foundries turn each side's spare power into money, up to FOUNDRY_POWER each
    for (const team of [0, 1]) {
      let spare = Math.max(0, this.powers[team].made - this.powers[team].used);
      for (const b of this.blds) if (b.type === 'foundry' && b.team === team && b.rise >= 1 && b.dying < 0) { const take = Math.min(spare, FOUNDRY_POWER); spare -= take; this.prods[team].credits += take * FOUNDRY_RATE * dt; }
    }
    for (const b of this.blds) if (b.type === 'fuelDepot' && b.team < 2 && this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) this.prods[b.team].credits += dt * 8; // captured fuel sells
    for (const b of this.blds) if (b.type === 'derrick' && b.rise >= 1 && b.dying < 0 && b.team < 2) this.prods[b.team].credits += dt * (b.pw === 200 ? 10 : 5); // oil sells: $5 a second, $10 on a big strike
    this.updateConstruction(dt);
    if ((this.helpT -= dt) <= 0) { this.helpT = 2; this.builderHelp(); }
  }

  // Where each side's salvagers shouldn't go: within 10 cells of the other side's buildings.
  danger = [new Uint8Array(N * N), new Uint8Array(N * N)]; dangerT = 0;
  markDanger() {
    const t = this.terrain;
    for (const team of [0, 1]) {
      const m = this.danger[team]; m.fill(0);
      for (const b of this.blds) if (b.team === 1 - team && b.max > 0 && b.dying < 0)
        for (let y = b.cy - 10; y <= b.cy + b.h + 10; y++) for (let x = b.cx - 10; x <= b.cx + b.w + 10; x++) if (t.inside(x, y)) m[t.idx(x, y)] = 1;
    }
  }
  seepNear(gx: number, gy: number) {
    return this.terrain.oil.find((o) => o.found && !o.tapped && Math.hypot((o.cx + 0.5) * CELL - gx, (o.cy + 0.5) * CELL - gy) < CELL * 2.5) ?? null;
  }

  // The wildcard: vehicles rolling near hidden oil set off a gusher.
  prospect(dt: number) {
    const t = this.terrain;
    for (const o of t.oil) {
      if (o.found) continue;
      const ox = (o.cx + 0.5) * CELL, oy = (o.cy + 0.5) * CELL;
      const finder = this.units.find((u) => u.team !== 2 && u.def.vehicle && Math.hypot(u.x - ox, u.y - oy) < 34);
      if (!finder) continue;
      o.found = true;
      t.occupied[t.idx(o.cx, o.cy)] = 1; // nothing else may be built on a well
      t.oilPool(o.cx, o.cy, o.big);
      this.gushers.push({ x: ox, y: oy, t: o.big ? 5 : 3, big: o.big });
      if (finder.team !== 0) continue; // the enemy found it: only you see your own strikes
      this.bark = o.big ? { who: 'Field report', line: 'BIG STRIKE! Oil everywhere. Build a Derrick on it.', t: 4 } : { who: 'Field report', line: 'Struck oil. A small seep, but it\'ll pump.', t: 4 };
      audio.explosion(ox, oy, o.big ? 2 : 1.2); audio.radio();
      this.shakeAt = 0.5;
    }
    for (const g of this.gushers) {
      g.t -= dt;
      const [sx, sy] = this.scr(g);
      for (let i = 0; i < (g.big ? 6 : 3); i++) // a black column spraying up and pattering down
        this.puffs.push({ x: sx + (Math.random() - 0.5) * 3, y: sy - 2, vx: (Math.random() - 0.5) * 14, vy: -30 - Math.random() * (g.big ? 40 : 22), t: 0, life: 1.2 + Math.random() * 0.6, c: Math.random() < 0.15 ? '#3a3a40' : '#111012', s: 1 + (Math.random() < 0.3 ? 1 : 0), g: 46 });
    }
    this.gushers = this.gushers.filter((g) => g.t > 0);
  }

  // Top-left cell for a structure centred under the mouse, and whether it may go there.
  placeAt(d: BuildDef): [number, number, boolean] {
    const M = this.mouse, [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy), t = this.terrain;
    let cx = Math.floor(gx / CELL - d.w! / 2 + 0.5), cy = Math.floor(gy / CELL - d.h! / 2 + 0.5), well = -1;
    if (d.key === 'derrick') { // snaps onto struck oil under the cursor; anywhere on the map
      const o = this.seepNear(gx, gy);
      if (!o) return [cx, cy, false];
      cx = o.cx - 1; cy = o.cy - 1; well = t.idx(o.cx, o.cy);
    }
    let ok = true, e = -1;
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) {
      if (!t.inside(x, y)) { ok = false; continue; }
      const i = t.idx(x, y), ty = t.type[i];
      if (ty !== 0 && ty !== 1 && ty !== 2 && ty !== 7 && ty !== 8 || (t.occupied[i] && i !== well) || t.forest[i] || t.elev[i] === 1) ok = false;
      if (e < 0) e = t.elev[i]; else if (t.elev[i] !== e) ok = false;
    }
    if (this.units.some((u) => u.x > cx * CELL - 4 && u.x < (cx + d.w!) * CELL + 4 && u.y > cy * CELL - 4 && u.y < (cy + d.h!) * CELL + 4)) ok = false;
    const near = this.blds.some((b) => b.team === 0 && !CAPTURE[b.type] && b.type !== 'wall' && cx < b.cx + b.w + 6 && cx + d.w! > b.cx - 6 && cy < b.cy + b.h + 6 && cy + d.h! > b.cy - 6);
    // ...or near one of your builders, so the first building (and outposts) can go up anywhere a builder has driven
    const mx = (cx + d.w! / 2) * CELL, my = (cy + d.h! / 2) * CELL;
    const byBuilder = this.builders(0).some((u) => Math.hypot(u.x - mx, u.y - my) < 8 * CELL);
    return [cx, cy, ok && (near || byBuilder || d.key === 'derrick')];
  }

  place() {
    const d = this.placing!, [cx, cy, ok] = this.placeAt(d);
    if (!ok) { audio.click(); return; }
    if (d.key === 'wall') { // walls are stacked straight away: no builder trip, keep laying until you right-click
      if (this.prod.credits < d.cost) { this.bark = { who: 'Builder', line: 'Not enough credits for sandbags.', t: 2 }; return; }
      this.prod.credits -= d.cost;
      this.addBld('wall', 0, cx, cy, 1, 1, d.name);
      this.lastWall = [cx, cy];
      audio.click();
      return;
    }
    const seep = d.key === 'derrick' ? this.seepNear((cx + 1) * CELL, (cy + 1) * CELL) : null;
    if (seep) { seep.tapped = true; this.terrain.occupied[this.terrain.idx(seep.cx, seep.cy)] = 0; }
    this.addBld(d.key, 0, cx, cy, d.w!, d.h!, d.name);
    const b = this.blds[this.blds.length - 1];
    this.startSite(b);
    if (seep) b.pw = seep.big ? 200 : 100;
    if (!this.keys.has('ShiftLeft') && !this.keys.has('ShiftRight')) this.placing = null; // Shift keeps placing more
    // the selected builders take it on, or else the nearest idle one
    const sel = this.selected().filter((u) => u.type === 'builder');
    const crew = sel.length ? sel : this.builders(0).filter((u) => !u.buildSite).sort((a, b2) => Math.hypot(a.x - cx * CELL, a.y - cy * CELL) - Math.hypot(b2.x - cx * CELL, b2.y - cy * CELL)).slice(0, 1);
    for (const u of crew) this.assignSite(u, b);
    this.bark = { who: 'Builder', line: crew.length ? 'Breaking ground.' : 'Site marked. Send a builder.', t: 2.5 };
    audio.radio();
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
    const t = this.terrain;
    // close enough to the scrap it was heading for: start digging (two salvagers nudging each
    // other off one spot would otherwise never arrive)
    if (u.goal && !u.unloading && u.cargo < SCRAP_LOAD && !u.forced && t.scrap[t.idx(t.cellOf(u.x), t.cellOf(u.y))] > 0 && Math.hypot(u.goal[0] - u.x, u.goal[1] - u.y) < 16) { u.path = []; u.goal = null; }
    const yards0 = this.blds.filter((b) => b.team === u.team && b.type === 'scrapyard' && b.rise >= 1 && b.dying < 0);
    if (u.cargo >= SCRAP_LOAD && !u.unloading && yards0.some((b) => Math.hypot((b.cx + b.w / 2) * CELL - u.x, (b.cy + b.h + 0.6) * CELL - u.y) < 22)) { u.path = []; u.goal = null; u.unloading = true; }
    if (u.path.length || u.goal) return; // busy following an order or a route
    const yards = this.blds.filter((b) => b.team === u.team && b.type === 'scrapyard' && b.rise >= 1 && b.dying < 0);
    if (!yards.length) return;
    const bay = (b: Bld): [number, number] => [(b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.6) * CELL];
    if (u.unloading) {
      const amt = Math.min(UNLOAD_RATE * dt, u.cargo);
      u.cargo -= amt; this.prods[u.team].credits += amt * (u.team === 1 ? this.aiRate : 1);
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
    // nearest scrap no other salvager is heading for, searching outward ring by ring
    const cx0 = t.cellOf(u.x), cy0 = t.cellOf(u.y), claimed = new Set<number>(), skip = Math.min(u.avoid, 6) * 3; // after giving up, look a little further afield
    if (u.avoid && Math.random() < 0.02) u.avoid--;
    for (const o of this.units) if (o !== u && o.type === 'harvester' && o.goal) claimed.add(t.idx(t.cellOf(o.goal[0]), t.cellOf(o.goal[1])));
    for (let r = 1; r < N; r++) {
      let best = -1, bd = 1e9;
      for (let y = cy0 - r; y <= cy0 + r; y++) for (let x = cx0 - r; x <= cx0 + r; x++) {
        if (Math.max(Math.abs(x - cx0), Math.abs(y - cy0)) !== r || !t.inside(x, y)) continue;
        const i = t.idx(x, y);
        if (t.scrap[i] > 0 && !t.occupied[i] && !claimed.has(i) && !(u.team < 2 && this.danger[u.team][i])) { const dd = Math.hypot(x - cx0, y - cy0); if (dd < bd) { bd = dd; best = i; } }
      }
      if (best >= 0 && r > skip) {
        const gx = ((best % N) + 0.5) * CELL, gy = (Math.floor(best / N) + 0.5) * CELL;
        u.goal = [gx, gy]; u.path = findPath(t, u.x, u.y, gx, gy, true);
        return;
      }
    }
  }

  // ---- side panel clicks (in panel pixels) ----
  mm = { x: 0, y: 0, s: 128 };
  minimapHit(x: number, y: number) { const m = this.mm; return x >= m.x && x < m.x + m.s && y >= m.y && y < m.y + m.s; }
  minimapPoint(): [number, number] { const m = this.mm, sc = SW / m.s; return [(this.mouse.hx - m.x) * sc, (this.mouse.hy - m.y) * sc]; }
  minimapJump() { const [x, y] = this.minimapPoint(); this.centreScreen(x, y); this.vx = this.goalX; this.vy = this.goalY; }
  uiClick(btn: number) {
    const M = this.mouse, hx = M.hx, hy = M.hy;
    if (hx < this.HW - SB) return false; // on the battlefield
    if (btn === 0 && this.minimapHit(hx, hy)) { this.minimapJump(); M.down = true; M.sx = M.x; M.sy = M.y; M.onMap = true; return true; }
    if (btn === 2 && this.minimapHit(hx, hy)) { const [x, y] = this.minimapPoint(); this.command(x, y); return true; }
    const hit = (r: { x: number; y: number; w: number; h: number }) => hx > r.x && hx < r.x + r.w && hy > r.y && hy < r.y + r.h;
    for (const b of this.buttons) if (hit(b)) { if (b.id === 'pause') { this.state = 'paused'; this.menuHot = 0; } else this.order(b.id); audio.click(); return true; }
    for (const c of this.chips) if (hit(c)) { this.select(this.selected().filter((u) => u.type === c.type), false); return true; } // keep only this type
    for (const tb of this.tabs) if (hit(tb)) { this.buildTab = tb.id; if (this.selBld && this.prod.queues[this.selBld.type]) this.selBld = null; audio.click(); return true; }
    for (const sl of this.slots) if (hit(sl)) { this.buildClick(sl.def, btn); return true; }
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
// The visible part of a sprite (cached), so pictures can be centred in buttons.
const trimCache = new WeakMap<Sprite, { x: number; y: number; w: number; h: number }>();
function trimBox(s: Sprite) {
  let b = trimCache.get(s);
  if (b) return b;
  const c = s.img, d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  b = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: c.width, h: c.height };
  trimCache.set(s, b);
  return b;
}

const nextFrame = () => new Promise<void>((r) => { waiting.push(r); chan.port2.postMessage(0); });
