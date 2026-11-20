// The computer opponent. It plays by the same rules as you: same buildings, same costs, same fog.
// Each game it picks a strategy (an armoured push, air raids, an artillery siege, a super-unit, or
// missiles), then adapts: it watches what you field and builds the counter (flak for aircraft,
// shields for artillery, interceptors for a missile silo, rockets for a Colossus). It gathers its
// waves at a staging point before striking, pulls back to repair when a fight goes badly, raids
// your economy with gunships, and aims missiles where they'll hurt most.
import type { Game } from './game';
import { DEF, BuildDef, FOUNDRY_POWER, MISSILE_TIME, INTERCEPT_RANGE } from './build';
import { CELL, N, T } from './terrain';
import { findPath } from './path';

export type Level = 'easy' | 'normal' | 'hard' | 'brutal';
export const LEVELS: Record<Level, { rate: number; wave: number; first: number; gap: number; salvagers: number; capture: boolean; towers: number; infantry: number }> = {
  easy: { rate: 0.7, wave: 6, first: 330, gap: 220, salvagers: 1, capture: false, towers: 1, infantry: 8 },
  normal: { rate: 1, wave: 9, first: 250, gap: 170, salvagers: 2, capture: true, towers: 2, infantry: 12 },
  hard: { rate: 1.35, wave: 12, first: 190, gap: 125, salvagers: 3, capture: true, towers: 3, infantry: 16 },
  brutal: { rate: 1.7, wave: 14, first: 160, gap: 100, salvagers: 4, capture: true, towers: 4, infantry: 20 },
};

export type Plan = 'armour' | 'air' | 'siege' | 'colossus' | 'missile';
const PLANS: Record<Level, Plan[]> = { easy: ['armour', 'air'], normal: ['armour', 'air', 'siege', 'colossus', 'missile'], hard: ['armour', 'air', 'siege', 'colossus', 'missile'], brutal: ['armour', 'air', 'siege', 'colossus', 'missile'] };

// The basics every plan wants, in rough priority order (power is handled first, separately).
const CORE: [string, number][] = [['scrapyard', 1], ['barracks', 1], ['fieldCommand', 1], ['depot', 1], ['guardTower', 1], ['scrapyard', 2], ['hospital', 1], ['workshop', 1], ['emplacement', 1],
  ['foundry', 1], ['armoury', 1], ['flakTower', 1], ['guardTower', 2], ['radar', 1], ['scrapyard', 3], ['barracks', 2], ['emplacement', 2], ['depot', 2], ['foundry', 2],
  ['flakTower', 2], ['guardTower', 3], ['emplacement', 3], ['reactor', 1], ['scrapyard', 4], ['foundry', 3], ['flakTower', 3], ['guardTower', 4], ['emplacement', 4],
  ['barracks', 3], ['depot', 3], ['foundry', 4], ['reactor', 2]];
// What each plan adds, slotted in once it's past the given minute.
const PLAN_WANTS: Record<Plan, [string, number, number][]> = {
  armour: [['depot', 2, 4], ['depot', 3, 9], ['workshop', 1, 6], ['provingGround', 1, 22]],
  air: [['airfield', 1, 5], ['airfield', 2, 10], ['flakTower', 2, 8], ['airfield', 3, 16]],
  siege: [['radar', 1, 6], ['battery', 1, 9], ['shield', 1, 11], ['battery', 2, 13], ['battery', 3, 18], ['shield', 2, 18]],
  colossus: [['foundry', 2, 8], ['reactor', 1, 10], ['provingGround', 1, 12], ['shield', 1, 16]],
  missile: [['radar', 1, 7], ['foundry', 2, 9], ['interceptor', 1, 11], ['silo', 1, 13], ['shield', 1, 18]],
};
const PLAN_NAMES: Record<Plan, string> = { armour: 'an armoured push', air: 'air power', siege: 'an artillery siege', colossus: 'a super-unit', missile: 'missile strikes' };
const CAMO = ['rifle', 'rocket', 'grenadier', 'artillery']; // can hide still in forest (matches game.ts)
const DEFENCES = ['guardTower', 'emplacement', 'flakTower', 'battery', 'railTower'];
type Bld = Game['blds'][number];

export class AI {
  outpost: [number, number] | null = null; fortified = new Set<any>(); paved = new Map<any, number>(); nextPave = 120; nextHub = 360; planned = new Map<any, number>(); fortifyAt: any = null; known = new Set<any>(); watch: [number, number] | null = null; nextSpy = 520; lastReveal = -999; // known: enemy buildings it has seen; watch: where a spy hit it // planned: how far each hub's streets have got; paved: when it last tried to road each cut-off building // a far site it holds that needs a guard tower
  t = 0; think = 0; nextWave: number; nextScout = 60; nextRaid = 400; nextBomb = 450; nextIntel = 0; placeFails = 0; nextSalvager = 0; nextBuilder = 0;
  raiders = new Set<any>(); // units on the current wave
  wave: { state: 'gather' | 'attack'; units: any[]; hp0: number; stage: [number, number]; target: [number, number]; until: number } | null = null;
  intel = { air: 0, guns: 0, colossus: 0, silo: false, infantry: 0, defences: 0, heavies: 0 }; // what it has seen of you
  cfg: (typeof LEVELS)[Level];
  plan: Plan;
  foe: number;
  lean = [0, 1, 2, 3, 4].map(() => 0.9 + Math.random() * 0.2); grudge: number[] = []; // its own preferences; damage taken from each side

  // me: which side it plays (1 normally; 0 too, for computer-vs-computer tests)
  constructor(private g: Game, level: Level, public me = 1, plan?: Plan) {
    this.cfg = LEVELS[level];
    this.foe = this.pickFoe();
    if (me !== 0) g.aiRate = this.cfg.rate;
    this.nextWave = this.cfg.first;
    const options = PLANS[level];
    this.plan = plan ?? options[(Math.random() * options.length) | 0];
  }
  get planName() { return PLAN_NAMES[this.plan]; }
  // hit from the air: count it straight away (raids are over before a scout report would see them)
  airHit() { this.intel.air = Math.max(this.intel.air, 1) + 0.05; }
  // With several enemies, the main target is the nearest side still standing.
  private pickFoe() {
    const g = this.g, [hx, hy] = g.terrain.bases[g.baseOf(this.me)];
    const alive = g.sides.filter((t) => g.hostile(this.me, t) && !g.out.has(t));
    // nearest first, nudged by its own leanings, and by a grudge against whoever has been hurting it
    const score = (t: number) => { const [x, y] = g.terrain.bases[g.baseOf(t)]; return Math.hypot(x - hx, y - hy) * this.lean[t] - (this.grudge[t] ?? 0) / 40; };
    alive.sort((a, b) => score(a) - score(b));
    for (const t of g.sides) this.grudge[t] = (this.grudge[t] ?? 0) * 0.5; // grudges fade
    return alive[0] ?? this.foe ?? 0;
  }
  private enemy(t: number) { return this.g.hostile(this.me, t); }

  update(dt: number) {
    this.t += dt;
    if ((this.think -= dt) > 0) return;
    this.think = 1; // decide once a second
    if (this.t >= this.nextIntel) { this.nextIntel = this.t + 20; this.foe = this.pickFoe(); this.scoutReport(); }
    this.economy();
    this.military();
  }

  private count(key: string) { return this.g.blds.filter((b) => b.team === this.me && b.type === key && b.dying < 0).length; }
  private mine(k: string) { return this.g.units.filter((u) => u.team === this.me && u.type === k).length; }
  private home(): [number, number] {
    const hq = this.g.blds.find((b) => b.team === this.me && b.type === 'fieldCommand') ?? this.g.blds.find((b) => b.team === this.me && b.max > 0);
    return hq ? [hq.cx + 1, hq.cy + 1] : this.g.terrain.bases[this.g.baseOf(this.me)];
  }
  // the middle of its own base (where shields and interceptors do most good)
  private heart(): [number, number] {
    const own = this.g.blds.filter((b) => b.team === this.me && b.max > 0 && b.type !== 'wall');
    if (!own.length) return this.home();
    return [own.reduce((s, b) => s + b.cx + b.w / 2, 0) / own.length, own.reduce((s, b) => s + b.cy + b.h / 2, 0) / own.length];
  }

  // What has it seen of you? (It only counts what its side can actually see.)
  private scoutReport() {
    const g = this.g, seen = (x: number, y: number) => g.seenBy(this.me, x, y);
    const units = g.units.filter((u) => this.enemy(u.team) && !g.hid(u, this.me) && seen(u.x, u.y));
    const blds = g.blds.filter((b) => this.enemy(b.team) && b.max > 0 && b.dying < 0 && seen((b.cx + 1) * CELL, (b.cy + 1) * CELL));
    for (const b of blds) this.known.add(b);
    for (const b of this.known) if (!g.blds.includes(b) || b.dying >= 0 || !this.enemy(b.team)) this.known.delete(b);
    const i = this.intel;
    i.air = Math.max(i.air * 0.7, units.filter((u) => u.def.air).length);
    i.guns = Math.max(i.guns * 0.8, units.filter((u) => u.type === 'artillery').length + blds.filter((b) => b.type === 'battery').length * 3);
    i.colossus = Math.max(i.colossus * 0.8, units.filter((u) => u.type === 'colossus').length);
    i.silo = i.silo || blds.some((b) => b.type === 'silo') || g.missiles.some((m) => this.enemy(m.team));
    i.infantry = Math.max(i.infantry * 0.8, units.filter((u) => !u.def.vehicle).length);
    i.defences = Math.max(i.defences * 0.9, blds.filter((b) => DEFENCES.includes(b.type)).length);
    i.heavies = Math.max(i.heavies * 0.8, units.filter((u) => u.type === 'juggernaut').length + units.filter((u) => u.type === 'colossus').length * 4);
  }

  private economy() {
    const g = this.g, p = g.prods[this.me];
    const sites = g.blds.filter((b) => b.team === this.me && b.rise < 1 && b.dying < 0);
    const crew = g.builders(this.me);
    // every site gets a builder; spare builders help out
    for (const site of sites) if (!crew.some((u) => u.buildSite === site)) { const free = crew.find((u) => !u.buildSite); if (free) g.assignSite(free, site); }
    for (const u of crew) if (!u.buildSite && sites[0]) g.assignSite(u, sites[0]);
    // nothing to build? patch up whatever is damaged
    const hurt = g.blds.find((b) => b.team === this.me && b.max > 0 && b.rise >= 1 && b.dying < 0 && b.hp < b.max * 0.7);
    if (hurt) for (const u of crew) if (!u.buildSite) g.assignSite(u, hurt);
    // start the next structure (one site per builder)
    const next = this.nextStructure();
    if (sites.length < crew.length && next && p.credits > next.cost * 0.3 + sites.length * 800) {
      if (this.place(next)) this.placeFails = 0; else this.placeFails = Math.min(this.placeFails + 1, 8);
    }
    // road its cut-off buildings into the network, most valuable first: hubs, captured sites, oil, scrap
    if (this.t >= this.nextPave && p.credits > 1200) {
      this.nextPave = this.t + 30;
      const L = g.territory.linked, V = (b: any) => (b.type === 'fieldCommand' ? 5 : g.isCapturable(b) ? 4 : b.type === 'derrick' ? 3 : b.type === 'scrapyard' ? 2 : 1);
      const far = g.blds.filter((b) => b.team === this.me && b.dying < 0 && b.rise >= 1 && b.type !== 'wall' && !L.has(b) && this.t - (this.paved.get(b) ?? -1e9) > 300).sort((a, b) => V(b) - V(a))[0];
      if (far) { this.paved.set(far, this.t); g.linkByRoad(far); } // the cheapest road home, reusing roads it already has; one try every few minutes
    }
    this.planTowns();
    // land grab: a forward Field Command at the edge of its territory starts a new heart (then gets roaded in)
    const hubs = this.count('fieldCommand');
    if (this.t >= this.nextHub && hubs >= 1 && hubs < Math.min(8, 1 + Math.floor(this.t / 240)) && p.credits > DEF.fieldCommand.cost + 500 && !sites.some((b) => b.type === 'fieldCommand')) {
      this.nextHub = this.t + 45;
      const spot = this.frontier();
      if (spot && g.autoPlace('fieldCommand', this.me, spot[0], spot[1], true)) g.startSite(g.blds[g.blds.length - 1]);
    }
    // while the army is small, soldiers come first and buildings wait their turn
    const armySize = g.units.filter((u) => u.team === this.me && u.def.weapon).length, small = armySize < this.cfg.wave;
    const q = p.queues, saving = Math.min(sites.reduce((s, b) => s + (g.costOf(b.type) * (1 - b.rise)), 0), 700 * sites.length) * (small ? 0.3 : 1) + (small ? 0 : Math.min(1000, (next?.cost ?? 0) * 0.5)); // sites draw money as they're built, so only about 20 seconds' worth is set aside
    const spare = p.credits - saving, mine = (k: string) => this.mine(k), i = this.intel;
    if (g.owns('fieldCommand', this.me) && !q.fieldCommand.length && crew.length < Math.min(10, (this.cfg.salvagers > 2 ? 2 : 1) + (p.credits > 2500 ? 1 : 0) + (p.credits > 5000 ? 1 : 0) + this.count('fieldCommand') - 1) && this.t >= this.nextBuilder) {
      q.fieldCommand.push({ def: DEF.builder, spent: 0 }); this.nextBuilder = this.t + 45; // lost one? wait before buying another
    }
    if (g.owns('depot', this.me) && !q.depot.length) {
      const salvage = mine('harvester') < this.cfg.salvagers + Math.max(0, this.count('scrapyard') - 2) && this.t >= this.nextSalvager;
      if (salvage) this.nextSalvager = this.t + 60;
      // the army mix leans on the plan, and answers what it has seen
      const heavy = this.plan === 'armour' ? 2 : 3, guns = this.plan === 'siege' ? 2 : 3;
      const pick = salvage ? DEF.harvester : mine('scout') < 1 ? DEF.scout
        : mine('flak') < Math.min(8, Math.ceil(i.air / 1.5)) ? DEF.flak
        : g.owns('workshop', this.me) && mine('hovertank') < Math.floor(mine('tank') / 4) ? DEF.hovertank
        : g.owns('foundry', this.me) && mine('juggernaut') < Math.ceil(mine('tank') / heavy) + i.colossus * 2 ? DEF.juggernaut
        : g.owns('workshop', this.me) && mine('artillery') < Math.ceil(mine('tank') / guns) + (i.defences > 6 ? 2 : 0) ? DEF.artillery : DEF.tank;
      if (salvage || spare > pick.cost + 100) q.depot.push({ def: pick, spent: 0 });
    }
    const airCap = (this.plan === 'air' ? 5 : 2) + Math.floor(this.t / (this.plan === 'air' ? 75 : 150));
    if (g.owns('airfield', this.me) && !q.airfield.length && mine('gunship') + mine('bomber') < airCap && spare > 1600) q.airfield.push({ def: mine('bomber') < mine('gunship') / 2 ? DEF.bomber : DEF.gunship, spent: 0 });
    // a super-unit when the plan calls for one (or late in any long game)
    const supers = mine('colossus') + mine('tempest'), wantSupers = (this.plan === 'colossus' ? 2 : 1) + (this.t > 1900 ? 1 : 0);
    if (g.owns('provingGround', this.me) && !q.provingGround.length && supers < wantSupers && p.credits > 6000) {
      const air = g.owns('airfield', this.me) && (this.plan === 'air' || (supers > 0 && mine('tempest') === 0));
      q.provingGround.push({ def: air ? DEF.tempest : DEF.colossus, spent: 0 });
    }
    // research at the armoury, one upgrade at a time
    if (g.owns('armoury', this.me) && !q.armoury.length && spare > 2000) { const next = ['armourUp', 'shellsUp', 'optics', 'engines'].find((k) => !g.upgrades[this.me].has(k)); if (next) q.armoury.push({ def: DEF[next], spent: 0 }); }
    if (g.owns('barracks', this.me) && g.owns('fieldCommand', this.me) && !q.barracks.length && this.t > 480 && mine('infiltrator') < 1 + Math.floor(this.t / 900) && spare > 1000) q.barracks.push({ def: DEF.infiltrator, spent: 0 });
    // a couple of engineers on hand to slip in with attacks
    if (g.owns('barracks', this.me) && g.owns('fieldCommand', this.me) && !q.barracks.length && this.t > 600 && mine('engineer') < 2 && spare > 1200) q.barracks.push({ def: DEF.engineer, spent: 0 });
    const infantryCap = this.cfg.infantry + Math.floor(this.t / 60) * 3; // grows with the game: about 100 foot soldiers by half an hour
    if (g.owns('barracks', this.me) && !q.barracks.length && mine('rifle') + mine('rocket') + mine('grenadier') < infantryCap && spare > 150) {
      const wantRockets = i.colossus || i.air > 2 ? 1 : 0.5; // rockets answer big armour and aircraft
      const rockets = mine('rocket') < mine('rifle') * wantRockets + 1 && spare > 350;
      const grenades = g.owns('hospital', this.me) && mine('grenadier') < mine('rifle') / (i.infantry > 15 ? 2 : 3) && spare > 300;
      q.barracks.push({ def: grenades ? DEF.grenadier : rockets ? DEF.rocket : DEF.rifle, spent: 0 });
    }
  }

  // Every hub is laid out as a town: first a cross of streets through it, then a ring road round
  // the blocks, then (once its towers stand) a sandbag line joining them on the side facing the enemy.
  private planTowns() {
    const g = this.g, p = g.prods[this.me], C = CELL, [ex, ey] = g.terrain.bases[g.baseOf(this.foe)];
    for (const h of g.blds) {
      if (h.team !== this.me || h.type !== 'fieldCommand' || h.rise < 1 || h.dying >= 0) continue;
      const stage = this.planned.get(h) ?? 0, x = (h.cx + 1.5) * C, y = (h.cy + 1.5) * C;
      if (stage === 0 && p.credits > 1200) { // the main streets
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.paveFor(this.me, [[x + dx * 2 * C, y + dy * 2 * C], [x + dx * 13 * C, y + dy * 13 * C]]);
        this.planned.set(h, 1);
      } else if (stage === 1 && p.credits > 4000) { // the ring road
        const R = 8 * C, ring: number[][] = [[x - R, y - R], [x + R, y - R], [x + R, y + R], [x - R, y + R], [x - R, y - R]];
        g.paveFor(this.me, ring); this.planned.set(h, 2);
      } else if (stage === 2 && p.credits > 2500 && this.defenceAt(h) >= 3) { // the sandbag line between its towers
        const face = Math.atan2(ey - h.cy, ex - h.cx), t = g.terrain;
        for (let a = -0.9; a <= 0.9; a += 0.06) {
          const cx = Math.round(h.cx + 1 + Math.cos(face + a) * 11), cy = Math.round(h.cy + 1 + Math.sin(face + a) * 11);
          if (!t.inside(cx, cy)) continue;
          const i = t.idx(cx, cy); if (t.occupied[i] || t.forest[i] || t.elev[i] === 1 || (t.type[i] !== T.GRASS && t.type[i] !== T.DIRT)) continue; // gaps for its own roads
          if (p.credits < DEF.wall.cost) break;
          p.credits -= DEF.wall.cost; g.addBld('wall', this.me, cx, cy, 1, 1, DEF.wall.name);
        }
        this.planned.set(h, 3);
      }
    }
  }
  private defenceAt(h: any) { return this.g.blds.filter((b) => b.team === this.me && b.dying < 0 && DEFENCES.includes(b.type) && Math.hypot(b.cx - h.cx, b.cy - h.cy) < 13).length; }
  // A hub short of its share of defences: hubs nearer the enemy want more, and every hub wants more as the game goes on.
  private weakHub() {
    const g = this.g, [ex, ey] = g.terrain.bases[g.baseOf(this.foe)];
    const hubs = g.blds.filter((b) => b.team === this.me && b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0).sort((a, b) => Math.hypot(a.cx - ex, a.cy - ey) - Math.hypot(b.cx - ex, b.cy - ey));
    for (const [k, h] of hubs.entries()) if (this.defenceAt(h) < 2 + (k < 2 ? 2 : 0) + Math.floor(this.t / 600)) return h;
    return null;
  }

  // Infiltrators go for enemy buildings it has seen that no guard tower or radar watches. Before an
  // attack it blacks out their power; otherwise it steals maps (now and then) or cash.
  private sendSpies() {
    const g = this.g;
    if (this.t < this.nextSpy) return;
    const spies = g.units.filter((u) => u.team === this.me && u.type === 'infiltrator' && !u.spy);
    if (!spies.length) return;
    this.nextSpy = this.t + 20;
    const watched = (b: any) => g.blds.some((o) => this.enemy(o.team) && o.dying < 0 && ((o.type === 'guardTower' && Math.hypot(o.cx - b.cx, o.cy - b.cy) < 7) || (o.type === 'radar' && Math.hypot(o.cx - b.cx, o.cy - b.cy) < 13)));
    const open = [...this.known].filter((b) => b.type !== 'wall' && b.max > 0 && !watched(b));
    if (!open.length) return;
    const want = this.wave?.state === 'gather' ? 'sabotage' : this.t - this.lastReveal > 300 ? 'reveal' : 'steal';
    const [hx, hy] = this.home();
    const pick = open.filter((b) => g.spyAct(b) === want).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0] ?? open.filter((b) => g.spyAct(b) === 'steal')[0];
    if (!pick) return;
    if (g.spyAct(pick) === 'reveal') this.lastReveal = this.t;
    g.sendSpy(spies[0], pick);
  }
  // A spy got in: remember to post a guard tower there.
  spyHit(b: any) { this.watch = [b.cx, b.cy]; }

  // The best spot for a new heart: a ring out from one of its hearts, where it would claim the
  // most unowned land and the most worth having (sites, oil, scrap), away from danger and the enemy's base.
  private frontier(): [number, number] | null {
    const g = this.g, t = g.terrain, own = g.territory.owner, [ex, ey] = t.bases[g.baseOf(this.foe)];
    const hubs = g.blds.filter((b) => b.team === this.me && b.type === 'fieldCommand' && b.dying < 0);
    if (!hubs.length) return null;
    let best: [number, number] | null = null, bs = 0;
    for (let k = 0; k < 160; k++) {
      const h = hubs[(Math.random() * hubs.length) | 0], a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 14;
      const x = Math.round(h.cx + 1 + Math.cos(a) * r), y = Math.round(h.cy + 1 + Math.sin(a) * r);
      if (x < 5 || y < 5 || x > N - 6 || y > N - 6 || hubs.some((o) => Math.hypot(o.cx - x, o.cy - y) < 18)) continue;
      let fresh = 0;
      for (let dy = -12; dy <= 12; dy += 3) for (let dx = -12; dx <= 12; dx += 3) { const i = t.idx(Math.min(N - 1, Math.max(0, x + dx)), Math.min(N - 1, Math.max(0, y + dy))); if (own[i] === -1 && t.type[i] !== T.WATER) fresh++; }
      let prize = t.scrap[t.idx(x, y)] ? 0.5 : 0;
      for (const b of g.blds) if (g.isCapturable(b) && b.team !== this.me && Math.hypot(b.cx - x, b.cy - y) < 14) prize += 1.5;
      for (const b of g.blds) if (b.team === this.me && !g.territory.linked.has(b) && Math.hypot(b.cx - x, b.cy - y) < 14) prize += 1; // brings its stray buildings home
      for (const o of t.oil) if (!o.tapped && Math.hypot(o.cx - x, o.cy - y) < 14) prize += 1.5;
      const score = fresh * 0.12 + prize - this.danger(x, y) * 2 - (Math.hypot(ex - x, ey - y) < 35 ? 5 : 0);
      if (score > bs) { bs = score; best = [x, y]; }
    }
    return best;
  }

  // What to build: answers to what it has seen first, then the plan, then the basics.
  private wants(): [string, number][] {
    const i = this.intel, min = this.t / 60, out: [string, number][] = [];
    if (i.silo) out.push(['radar', 1], ['interceptor', 1], ['interceptor', 2]);
    if (i.air > 0.5) out.push(['flakTower', Math.min(8, Math.max(1 + Math.ceil(i.air / 2), this.count('scrapyard') + 1))]); // any aircraft seen: flak goes up, one by each scrapyard
    if (i.guns >= 3) out.push(['foundry', 1], ['shield', i.guns >= 8 ? 2 : 1]);
    if (i.colossus) out.push(['radar', 1], ['battery', 2]);
    if (i.heavies >= 3) out.push(['railTower', Math.min(4, Math.ceil(i.heavies / 3))]); // rail towers answer heavy armour
    if (i.defences > 8) out.push(['radar', 1], ['battery', 1]);
    for (const [k, n, at] of PLAN_WANTS[this.plan]) if (min >= at) out.push([k, n]);
    if (min > 25) out.push(['provingGround', 1], ['radar', 1], ['silo', 1]); // a long game escalates
    if (min > 32) out.push(['silo', 2], ['interceptor', 2], ['provingGround', 2]); // and escalates again: one interceptor battery can't stop two silos
    return [...out, ...CORE];
  }

  private nextStructure(): BuildDef | null {
    const g = this.g, pw = g.powers[this.me];
    if (pw.made - pw.used < 25) return DEF.generator;
    if (this.outpost && g.prods[this.me].credits > 800) return DEF.guardTower;
    const foundries = this.count('foundry');
    if (foundries && pw.made - pw.used < FOUNDRY_POWER * foundries) return g.owns('workshop', this.me) && g.prods[this.me].credits > 4500 ? DEF.reactor : DEF.generator;
    if (!this.count('fieldCommand') && this.count('barracks') && g.prods[this.me].credits > 1200) return DEF.fieldCommand;
    const [hx, hy] = this.home();
    if (g.terrain.oil.some((o) => o.found && !o.tapped && Math.hypot(o.cx - hx, o.cy - hy) < 30)) return DEF.derrick;
    const cash = g.prods[this.me].credits;
    if (this.watch && cash > 600) return DEF.guardTower; // robbed or sabotaged: post a watch where it happened
    if (cash > 1500 && this.count('barracks')) { // each hub holds its ground: a line of the right towers facing the enemy
      const h = this.weakHub();
      if (h) {
        this.fortifyAt = h;
        const i = this.intel, n = this.defenceAt(h);
        const pick = i.air > 2 && n % 4 === 3 ? 'flakTower' : i.heavies >= 3 && n % 4 === 2 ? 'railTower' : n % 2 ? 'emplacement' : 'guardTower';
        const d = DEF[pick]; if ((d.needs ?? []).every((k) => g.owns(k, this.me))) return d;
        return DEF.guardTower;
      }
    }
    if (cash > 4000) { // money piling up: more factories, so it turns into army
      const F: [string, number][] = [['depot', 1], ['barracks', 0.7], ['airfield', this.plan === 'air' ? 0.8 : 0.35], ['workshop', 0.3]];
      const f = F.filter(([k]) => (DEF[k].needs ?? []).every((n) => g.owns(n, this.me))).sort((a, b) => this.count(a[0]) / a[1] - this.count(b[0]) / b[1])[0];
      if (f && this.count(f[0]) < 3 + Math.floor(cash / 4000)) return DEF[f[0]];
    }
    for (const [key, n] of this.wants()) {
      const d = DEF[key];
      if ((key === 'guardTower' || key === 'emplacement') && n > this.cfg.towers + (this.t > 900 ? 1 : 0)) continue;
      if (this.count(key) >= n) continue;
      if ((d.needs ?? []).every((k) => g.owns(k, this.me))) return d;
      // can't yet? build what it needs first
      const missing = (d.needs ?? []).find((k) => !g.owns(k, this.me) && !this.count(k));
      if (missing && (DEF[missing].needs ?? []).every((k) => g.owns(k, this.me))) return DEF[missing];
    }
    if (g.prods[this.me].credits < 3000) return null;
    const SPRAWL: [string, number][] = [['foundry', 1], ['generator', 1.5], ['barracks', 0.6], ['depot', 0.5], ['guardTower', 1], ['emplacement', 1], ['flakTower', 0.8], ['scrapyard', 0.5], ['hospital', 0.25], ['workshop', 0.25], ['airfield', 0.3], ['battery', 0.3], ['radar', 0.2]];
    const pick = SPRAWL.filter(([k]) => (DEF[k].needs ?? []).every((n) => g.owns(n, this.me))).sort((a, b) => this.count(a[0]) / a[1] - this.count(b[0]) / b[1])[0];
    return pick ? DEF[pick[0]] : null;
  }

  // Where to put it: defences lean toward the enemy, shields and interceptors cover the heart of
  // the base, scrapyards go out to untouched scrap, the rest spread around home.
  private place(d: BuildDef): boolean {
    const g = this.g, [hx, hy] = this.home();
    if (d.key === 'derrick') {
      const o = g.terrain.oil.filter((x) => x.found && !x.tapped).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0];
      if (!o) return false;
      g.tapSeep(o, this.me);
      return true;
    }
    const [px, py] = g.terrain.bases[g.baseOf(this.foe)], toward = Math.atan2(py - hy, px - hx);
    const defence = DEFENCES.includes(d.key), central = d.key === 'shield' || d.key === 'interceptor';
    if (d.key === 'guardTower' && this.watch) { // the watch tower beside where a spy struck
      const [wx, wy] = this.watch; this.watch = null;
      for (let k = 0; k < 6; k++) { const a = Math.random() * Math.PI * 2; if (g.autoPlace('guardTower', this.me, Math.round(wx + Math.cos(a) * 3), Math.round(wy + Math.sin(a) * 3), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; } }
      return true;
    }
    if (d.key === 'guardTower' && this.outpost) { // the outpost's tower (if it won't fit, it isn't tried again)
      const [ox, oy] = this.outpost; this.outpost = null;
      for (let k = 0; k < 8; k++) { const a = Math.random() * Math.PI * 2; if (g.autoPlace('guardTower', this.me, Math.round(ox + Math.cos(a) * 3), Math.round(oy + Math.sin(a) * 3), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; } }
      return true; // counted as handled, so the next pick isn't stuck on it
    }
    if (d.key === 'flakTower') { // flak guards the economy first: the scrapyard with least flak nearby
      const yard = g.blds.filter((b) => b.team === this.me && b.type === 'scrapyard' && b.dying < 0).sort((a, b) => this.flakNear(a) - this.flakNear(b))[0];
      if (yard && this.flakNear(yard) === 0) for (let k = 0; k < 6; k++) { const a = Math.random() * Math.PI * 2; if (g.autoPlace('flakTower', this.me, Math.round(yard.cx + 1 + Math.cos(a) * 4), Math.round(yard.cy + 1 + Math.sin(a) * 4), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; } }
    }
    const size = g.blds.filter((b) => b.team === this.me && b.max > 0).length;
    if (d.key === 'scrapyard' && this.count('scrapyard') >= 1) {
      const t = g.terrain; let best: [number, number] | null = null, bd = 1e9;
      for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) {
        const dd = Math.hypot(x - hx, y - hy);
        if (t.scrap[t.idx(x, y)] > 200 && dd > 10 && dd < (this.t > 900 ? N * 0.4 : 45) && dd < bd && !g.blds.some((b) => b.type === 'scrapyard' && Math.hypot(b.cx - x, b.cy - y) < 10)) { bd = dd; best = [x, y]; }
      }
      if (best && g.autoPlace('scrapyard', this.me, best[0], best[1] - 3, true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
    }
    if (defence && this.fortifyAt && g.blds.includes(this.fortifyAt)) { // the hub's defensive line: evenly along an arc facing the enemy
      const h = this.fortifyAt, n = this.defenceAt(h), face = Math.atan2(py - h.cy, px - h.cx); this.fortifyAt = null;
      for (let k = 0; k < 4; k++) {
        const a = face + [0, -0.45, 0.45, -0.9, 0.9, -0.22, 0.22, -0.67, 0.67][(n + k) % 9];
        if (g.autoPlace(d.key, this.me, Math.round(h.cx + 1 + Math.cos(a) * 9), Math.round(h.cy + 1 + Math.sin(a) * 9), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
      }
    }
    const hearts = g.blds.filter((b) => b.team === this.me && b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0);
    const around = (h: any) => g.blds.filter((b) => b.team === this.me && b.max > 0 && Math.hypot(b.cx - h.cx, b.cy - h.cy) < 12).length;
    const hub = hearts.sort((a, b) => around(a) - around(b))[0]; // the emptiest heart gets the next building
    const [cx, cy] = central ? this.heart() : hub ? [hub.cx + 1, hub.cy + 1] : [hx, hy], local = hub ? around(hub) * 1.5 : size;
    const face = defence ? Math.atan2(py - cy, px - cx) : toward;
    if (hub && !defence && !central) { // packed in tight round the hub, nearest free plot first (a square's alley between)
      for (const r of [0, 6, 9, 12]) for (let k = 0; k < (r ? 8 : 1); k++) {
        const a = (k / 8) * Math.PI * 2 + r;
        if (g.autoPlace(d.key, this.me, Math.round(cx - (d.w ?? 2) / 2 + Math.cos(a) * r), Math.round(cy - (d.h ?? 2) / 2 + Math.sin(a) * r), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
      }
    }
    for (let k = 0; k < 6; k++) {
      const a = defence ? face + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const r = central ? 1 + Math.random() * 4 + this.placeFails : (defence ? 6 + Math.random() * 3 : 3 + Math.random() * 5) + local * 0.35 + this.placeFails * 1.5;
      if (g.autoPlace(d.key, this.me, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
    }
    return false;
  }

  private flakNear(b: { cx: number; cy: number }) { return this.g.blds.filter((o) => o.team === this.me && o.type === 'flakTower' && Math.hypot(o.cx - b.cx, o.cy - b.cy) < 8).length; }
  // How well defended is a spot? (Defences and armed units within six cells.)
  private danger(x: number, y: number, air = false) {
    const g = this.g; let d = 0;
    g.bldsNear(x * CELL, y * CELL, 8 * CELL, (b) => { if (this.enemy(b.team) && b.dying < 0 && Math.hypot(b.cx - x, b.cy - y) < 6) d += air ? (b.type === 'flakTower' ? 3 : 0) : DEFENCES.includes(b.type) ? 2 : 0; }); // only what's nearby (the grids)
    g.near(x * CELL, y * CELL, 6 * CELL, (u) => { if (this.enemy(u.team) && u.def.weapon && Math.hypot(u.x / CELL - x, u.y / CELL - y) < 6) d += air ? (u.type === 'flak' || u.type === 'rocket' ? 1.5 : 0) : u.def.vehicle ? 1 : 0.4; });
    return d;
  }

  private military() {
    const g = this.g, [hx, hy] = this.home();
    const army = g.units.filter((u) => u.team === this.me && u.def.weapon && !u.enter);
    for (const u of this.raiders) if (!g.units.includes(u)) this.raiders.delete(u);
    const idle = army.filter((u) => !u.goal && !u.path.length && !u.forced && !this.raiders.has(u));
    // defend with the units at home; an attack under way keeps going
    const homeGuard = army.filter((u) => !this.raiders.has(u) && Math.hypot(u.x / CELL - hx, u.y / CELL - hy) < 30);
    const intruder = g.units.find((u) => this.enemy(u.team) && Math.hypot(u.x / CELL - hx, u.y / CELL - hy) < 15);
    if (intruder) g.orderUnits(homeGuard.filter((u) => !u.target), intruder.x, intruder.y, true);
    this.missileStrike();
    this.airRaid(idle);
    // capture squads: the best site anywhere on the map, worth against distance and danger
    if (this.cfg.capture) {
      const spare = idle.filter((u) => u.type === 'rifle' || u.type === 'grenadier');
      const missions = g.units.filter((u) => u.team === this.me && u.enter).length;
      if (spare.length >= 3 && missions < 9) {
        const WORTH: Record<string, number> = { fuelDepot: 10, powerPlant: 9, townHall: 8, motorPool: 8, commTower: 7, repairYard: 6, recruitOffice: 6, watchtower: 4, bunker: 3 };
        const site = g.blds.filter((b) => g.isCapturable(b) && (b.team === 2 || this.enemy(b.team)) && b.garrison === 0 && !g.units.some((u) => u.team === this.me && u.enter === b))
          .map((b) => ({ b, score: (WORTH[b.type] ?? 2) / (1 + Math.hypot(b.cx - hx, b.cy - hy) / 50) - this.danger(b.cx, b.cy) * 0.6 }))
          .sort((a, b) => b.score - a.score)[0];
        if (site && site.score > 0.5) for (const u of spare.slice(0, 3)) g.sendIn(u, site.b);
      }
      // far-flung sites it holds get a guard tower (an outpost)
      if (!this.outpost) { const held = g.blds.find((b) => g.isCapturable(b) && b.team === this.me && !this.fortified.has(b) && Math.hypot(b.cx - hx, b.cy - hy) > 40); if (held) { this.fortified.add(held); this.outpost = [held.cx, held.cy]; } } // each outpost gets one try
    }
    // fast units go after supply crates and abandoned machines out on the map
    const runners = idle.filter((u) => u.type === 'scout' || u.type === 'hovertank' || u.type === 'tank').slice(0, 2);
    for (const u of runners) {
      const prizes: [number, number][] = [...g.crates.filter((c) => g.seenBy(this.me, c.x, c.y) || Math.hypot(c.x / CELL - hx, c.y / CELL - hy) < 40).map((c) => [c.x, c.y] as [number, number]),
        ...g.units.filter((d) => d.team === 2 && d.def.weapon).map((d) => [d.x, d.y] as [number, number])];
      const best = prizes.filter(([x, y]) => this.danger(x / CELL, y / CELL) < 2).sort((a, b) => Math.hypot(a[0] - u.x, a[1] - u.y) - Math.hypot(b[0] - u.x, b[1] - u.y))[0];
      if (best && Math.hypot(best[0] - u.x, best[1] - u.y) < 70 * CELL) g.orderUnits([u], best[0], best[1], false);
    }
    // scouting: a buggy roams (it may strike oil); with batteries, one sits forward as their spotter
    if (this.t > this.nextScout) {
      this.nextScout = this.t + 90;
      const scout = idle.find((u) => u.type === 'scout') ?? idle.find((u) => u.type === 'tank');
      const battery = g.blds.find((b) => b.team === this.me && b.type === 'battery' && b.rise >= 1);
      if (scout && battery) { const [bx, by] = g.terrain.bases[g.baseOf(this.foe)], a = Math.atan2(by - battery.cy, bx - battery.cx); g.orderUnits([scout], (battery.cx + Math.cos(a) * 17) * CELL, (battery.cy + Math.sin(a) * 17) * CELL, false); }
      else if (scout) { const a = Math.random() * Math.PI * 2, r = N * (0.15 + Math.random() * 0.25); g.orderUnits([scout], (hx + Math.cos(a) * r) * CELL, (hy + Math.sin(a) * r) * CELL, true); }
    }
    this.sendSpies();
    // standing guards: idle units hold the hearts and sites nearest the enemy, up to four on each
    const [ex, ey] = g.terrain.bases[g.baseOf(this.foe)];
    const posts = g.blds.filter((b) => b.team === this.me && b.dying < 0 && (b.type === 'fieldCommand' || g.isCapturable(b))).sort((a, b) => Math.hypot(a.cx - ex, a.cy - ey) - Math.hypot(b.cx - ex, b.cy - ey)).slice(0, 6);
    if (posts.length > 1) {
      const free = idle.filter((u) => !u.def.air && u.type !== 'scout' && u.type !== 'engineer' && u.type !== 'infiltrator' && posts.every((b) => Math.hypot(u.x / CELL - b.cx, u.y / CELL - b.cy) > 10));
      for (const b of posts) {
        if (!free.length) break;
        let guards = 0; g.near((b.cx + 1) * CELL, (b.cy + 1) * CELL, 8 * CELL, (u: any) => { if (u.team === this.me && u.def.weapon) guards++; });
        if (guards < 4) {
          const u = free.shift(), a = Math.atan2(ey - b.cy, ex - b.cx);
          let px = Math.round(b.cx + 1 + Math.cos(a) * 4), py = Math.round(b.cy + 1 + Math.sin(a) * 4);
          if (CAMO.includes(u.type)) { const t = g.terrain; let bd = 99; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = px + dx, y = py + dy; if (t.inside(x, y) && t.forest[t.idx(x, y)] && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); px = x; py = y; } } } // foot soldiers and field guns wait in the trees: an ambush
          g.orderUnits([u], (px + 0.5) * CELL, (py + 0.5) * CELL, true);
        }
      }
    }
    this.runWave(idle);
  }

  // The main army: wait until it's big enough, gather at a staging point short of the target,
  // strike together, and pull back to repair if it's losing.
  private runWave(idle: any[]) {
    const g = this.g, [hx, hy] = this.home();
    if (this.wave) {
      const w = this.wave; w.units = w.units.filter((u) => g.units.includes(u));
      const hp = w.units.reduce((s, u) => s + u.hp, 0);
      if (!w.units.length) { this.wave = null; return; }
      if (w.state === 'gather') {
        const there = w.units.filter((u) => Math.hypot(u.x - w.stage[0], u.y - w.stage[1]) < 8 * CELL).length;
        if (there >= w.units.length * 0.75 || this.t > w.until) {
          w.state = 'attack'; w.hp0 = hp;
          g.orderUnits(w.units, w.target[0], w.target[1], true, true);
          const prize = g.blds.filter((b) => b.team === this.foe && b.max > 0 && b.dying < 0 && b.type !== 'wall' && !DEFENCES.includes(b.type) && Math.hypot((b.cx + 1) * CELL - w.target[0], (b.cy + 1) * CELL - w.target[1]) < 12 * CELL).sort((a, b) => g.costOf(b.type) - g.costOf(a.type))[0];
          if (prize) for (const u of g.units) if (u.team === this.me && u.type === 'engineer' && !u.grab && !u.goal) g.sendEngineer(u, prize);
          if (this.foe === 0) g.warn('Enemy forces advancing on your base!', w.target);
          else if (g.friendly(this.foe)) g.warn('Enemy forces moving on our ally!', w.target);
        }
      } else if (hp < w.hp0 * 0.35) { // losing: fall back to repair and regroup
        g.orderUnits(w.units, hx * CELL, hy * CELL, false);
        for (const u of w.units) this.raiders.delete(u);
        this.wave = null; this.nextWave = this.t + this.cfg.gap * 0.6;
      } else if (w.units.every((u) => !u.goal && !u.path.length && !u.target)) { // target gone: pick the next one
        const next = this.pickTarget(); if (next) { w.target = next; g.orderUnits(w.units, next[0], next[1], true, true); } else this.wave = null;
      }
      return;
    }
    const want = this.cfg.wave + Math.floor(this.t / 300) * 2;
    const ground = idle.filter((u) => u.type !== 'scout' && u.type !== 'engineer' && u.type !== 'infiltrator' && !u.def.air);
    if (this.t < this.nextWave || ground.length < want) return;
    const target = this.pickTarget();
    if (!target) return;
    const base = g.blds.filter((b) => b.team === this.me && b.type === 'fieldCommand' && b.dying < 0).sort((a, b) => Math.hypot((a.cx + 1) * CELL - target[0], (a.cy + 1) * CELL - target[1]) - Math.hypot((b.cx + 1) * CELL - target[0], (b.cy + 1) * CELL - target[1]))[0];
    const ox = base ? (base.cx + 1.5) * CELL : hx * CELL, oy = base ? (base.cy + 1.5) * CELL : hy * CELL; // marshal at the forward hub nearest the target
    const stage: [number, number] = [ox + (target[0] - ox) * 0.5, oy + (target[1] - oy) * 0.5];
    for (const u of ground) this.raiders.add(u);
    let main = ground;
    if (ground.length >= want * 2) { // two prongs: the flank strikes a different target straight away
      const second = this.pickTarget(target);
      if (second) { const flank = ground.filter((_, i) => i % 3 === 0); main = ground.filter((_, i) => i % 3 !== 0); g.orderUnits(flank, second[0], second[1], true, true); }
    }
    g.orderUnits(main, stage[0], stage[1], true, true);
    this.wave = { state: 'gather', units: main, hp0: 0, stage, target, until: this.t + 60 };
    this.nextWave = this.t + this.cfg.gap;
  }

  // Where to hit: buildings worth a lot and defended little, with economy counting double. With a
  // missile nearly charged and enemy interceptors in the way, knock those out first.
  private pickTarget(avoid?: [number, number]): [number, number] | null {
    const g = this.g, [hx, hy] = this.home();
    const charging = g.blds.some((b) => b.team === this.me && b.type === 'silo' && b.rise >= 1 && (b.timer ?? 0) > MISSILE_TIME * 0.6);
    const shield = charging && g.blds.filter((b) => this.enemy(b.team) && b.type === 'interceptor' && b.dying < 0 && g.seenBy(this.me, (b.cx + 1) * CELL, (b.cy + 1) * CELL)).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0];
    if (shield) return g.posOf(shield);
    const econ = ['scrapyard', 'foundry', 'reactor', 'generator', 'derrick', 'fieldCommand', 'silo', 'provingGround'];
    let best: [number, number] | null = null, bs = -1e9;
    for (const b of g.blds) {
      if (b.team !== this.foe || b.max <= 0 || b.dying >= 0 || b.type === 'wall') continue;
      const value = g.costOf(b.type) * (econ.includes(b.type) ? 2 : 1), dist = Math.hypot(b.cx - hx, b.cy - hy);
      let score = value / 1000 - this.danger(b.cx, b.cy) * 1.5 - dist * 0.03;
      if (avoid && Math.hypot((b.cx + 1) * CELL - avoid[0], (b.cy + 1) * CELL - avoid[1]) < 25 * CELL) score -= 100; // the flank goes somewhere else
      if (score > bs) { bs = score; best = g.posOf(b); }
    }
    if (best) return best;
    const u = g.units.find((x) => this.enemy(x.team));
    return u ? [u.x, u.y] : null;
  }

  // Gunships raid the economy where there's least flak, and come home to repair when hurt.
  private airRaid(idle: any[]) {
    const g = this.g, [hx, hy] = this.home();
    for (const u of g.units) if (u.team === this.me && u.type === 'gunship' && u.hp < u.def.hp * 0.4 && u.goal && u.amove) g.orderUnits([u], hx * CELL, hy * CELL, false);
    const bombers = idle.filter((u) => (u.type === 'bomber' || u.type === 'tempest') && u.hp > u.def.hp * 0.7);
    if (bombers.length >= 2 && this.t >= this.nextBomb) {
      this.nextBomb = this.t + 60;
      const targets = g.blds.filter((b) => this.enemy(b.team) && b.max > 0 && b.dying < 0 && b.type !== 'wall').map((b) => [b.cx + 1, b.cy + 1, g.costOf(b.type)] as [number, number, number]);
      const best = targets.map((t) => ({ t, s: t[2] / 1000 - this.danger(t[0], t[1], true) * 2 })).sort((a, b) => b.s - a.s)[0]?.t; // score each once, then sort
      if (best) g.orderUnits(bombers, best[0] * CELL, best[1] * CELL, true, true);
    }
    const ships = idle.filter((u) => u.type === 'gunship' && u.hp > u.def.hp * 0.7);
    if (this.t < this.nextRaid || ships.length < 3) return;
    this.nextRaid = this.t + 70;
    const prey = g.units.filter((u) => this.enemy(u.team) && !u.def.air && (u.type === 'harvester' || u.type === 'builder' || u.def.vehicle)).map((u) => [u.x / CELL, u.y / CELL]) as [number, number][];
    const target = prey.map((p) => ({ p, s: this.danger(p[0], p[1], true) })).sort((a, b) => a.s - b.s)[0]?.p;
    if (target) g.orderUnits(ships, target[0] * CELL, target[1] * CELL, true, true);
  }

  // A charged silo fires at the richest cluster of enemy buildings that isn't under an interceptor.
  private missileStrike() {
    const g = this.g;
    const silo = g.blds.find((b) => b.team === this.me && b.type === 'silo' && b.rise >= 1 && b.dying < 0 && (b.timer ?? 0) >= MISSILE_TIME);
    if (!silo) return;
    const theirs = g.blds.filter((b) => this.enemy(b.team) && b.max > 0 && b.dying < 0);
    const guards = theirs.filter((b) => b.type === 'interceptor' && (b.ammo ?? 0) > 0);
    let best: Bld | null = null, bs = 0;
    for (const b of theirs) {
      let value = 0;
      for (const o of theirs) if (Math.hypot(o.cx - b.cx, o.cy - b.cy) < 5) value += g.costOf(o.type);
      if (guards.some((i) => Math.hypot(i.cx - b.cx, i.cy - b.cy) < INTERCEPT_RANGE)) value *= 0.25; // probably shot down: try elsewhere
      if (value > bs) { bs = value; best = b; }
    }
    if (best && bs > 3000) g.launch(silo, ...g.posOf(best));
  }
}
