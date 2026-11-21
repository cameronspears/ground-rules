// The computer opponent. It plays by the same rules as you: same buildings, same costs, same fog.
// Each game it picks a strategy (an armoured push, air raids, an artillery siege or a super-unit),
// then adapts: it watches what you field and builds the counter (flak for aircraft, shields for
// artillery, interceptors for the orbital strike, rockets for a Colossus). It gathers its waves at
// a staging point before striking, pulls back to repair when a fight goes badly, raids your economy
// with gunships, and aims the uplink's strike where it will hurt most.
import type { Game } from './game';
import { WEAPONS } from './combat';
import { DEF, BuildDef, UPLINK_TIME, INTERCEPT_RANGE, MARAUDER } from './build';
import { CELL, N, T } from './terrain';
import { findPath } from './path';

export type Level = 'easy' | 'normal' | 'hard' | 'brutal';
// Difficulty is how well it plays, never extra money or speed: it plays by your rules.
// think: seconds between decisions; tactics: flanks and pincers; anticipate: prepares for what you
// could do, not just what it has seen.
export const LEVELS: Record<Level, { wave: number; first: number; gap: number; salvagers: number; capture: boolean; towers: number; infantry: number; think: number; tactics: boolean; anticipate: boolean; dams: boolean; retreat: number; hubEvery: number; crew: number }> = {
  easy: { wave: 6, first: 420, gap: 240, salvagers: 1, capture: false, towers: 1, infantry: 8, think: 2.5, tactics: false, anticipate: false, dams: false, retreat: 0.2, hubEvery: 300, crew: 0 },
  normal: { wave: 9, first: 280, gap: 170, salvagers: 2, capture: true, towers: 2, infantry: 12, think: 1.5, tactics: true, anticipate: false, dams: true, retreat: 0.3, hubEvery: 200, crew: 0 },
  hard: { wave: 12, first: 200, gap: 130, salvagers: 3, capture: true, towers: 3, infantry: 16, think: 0.75, tactics: true, anticipate: true, dams: true, retreat: 0.35, hubEvery: 140, crew: 1 },
  brutal: { wave: 14, first: 160, gap: 100, salvagers: 4, capture: true, towers: 3, infantry: 20, think: 0.4, tactics: true, anticipate: true, dams: true, retreat: 0.4, hubEvery: 100, crew: 2 },
};

export type Plan = 'armour' | 'air' | 'siege' | 'colossus';
const PLANS: Record<Level, Plan[]> = { easy: ['armour', 'air'], normal: ['armour', 'air', 'siege', 'colossus'], hard: ['armour', 'air', 'siege', 'colossus'], brutal: ['armour', 'air', 'siege', 'colossus'] };

// The basics every plan wants, in rough priority order (power is handled first, separately).
const CORE: [string, number][] = [['scrapyard', 1], ['barracks', 1], ['fieldCommand', 1], ['depot', 1], ['guardTower', 1], ['scrapyard', 2], ['hospital', 1], ['workshop', 1], ['emplacement', 1],
  ['armoury', 1], ['flakTower', 1], ['guardTower', 2], ['radar', 1], ['scrapyard', 3], ['barracks', 2], ['emplacement', 2], ['depot', 2],
  ['flakTower', 2], ['guardTower', 3], ['emplacement', 3], ['reactor', 1], ['scrapyard', 4], ['flakTower', 3], ['guardTower', 4], ['emplacement', 4],
  ['barracks', 3], ['depot', 3], ['reactor', 2]];
// units whose guns fire explosives (only those can bring down a dam or a bridge)
const blasts = (u: any) => !!u.def.weapon && WEAPONS[u.def.weapon]?.kind === 'shell';
// What each plan adds, slotted in once it's past the given minute.
const PLAN_WANTS: Record<Plan, [string, number, number][]> = {
  armour: [['depot', 2, 4], ['depot', 3, 9], ['workshop', 1, 6], ['provingGround', 1, 22]],
  air: [['airfield', 1, 5], ['airfield', 2, 10], ['flakTower', 2, 8], ['airfield', 3, 16]],
  siege: [['radar', 1, 6], ['battery', 1, 9], ['shield', 1, 11], ['battery', 2, 13], ['battery', 3, 18], ['shield', 2, 18]],
  colossus: [['reactor', 1, 10], ['provingGround', 1, 12], ['shield', 1, 16]],
};
const PLAN_NAMES: Record<Plan, string> = { armour: 'an armoured push', air: 'air power', siege: 'an artillery siege', colossus: 'a super-unit' };
const WORTH: Record<string, number> = { uplink: 22, dam: 12, fuelDepot: 10, powerPlant: 9, townHall: 8, motorPool: 8, commTower: 7, repairYard: 6, recruitOffice: 6, watchtower: 4, bunker: 3 }; // how much each capturable site is worth having
const CAMO = ['rifle', 'rocket', 'grenadier', 'artillery']; // can hide still in forest (matches game.ts)
const DEFENCES = ['guardTower', 'emplacement', 'flakTower', 'battery'];
type Bld = Game['blds'][number];

export class AI {
  outpost: [number, number] | null = null; fortified = new Set<any>(); bridged = new Map<any, number>(); bridgeTo: any = null; bridgeUntil = 0; nextHub = 360; planned = new Map<any, number>(); fortifyAt: any = null; known = new Set<any>(); nextStreet = 0; nextDam = 600; clearing: { units: any[]; x: number; y: number; until: number } | null = null; nextClear = 240; // known: enemy buildings it has seen // planned: how far each hub's streets have got; paved: when it last tried to road each cut-off building // a far site it holds that needs a guard tower
  t = 0; think = 0; part = 2; nextWave: number; nextScout = 60; nextRaid = 400; nextBomb = 450; nextIntel = 0; placeFails = 0; nextSalvager = 0; nextBuilder = 0; nextHelp = 0;
  raiders = new Set<any>(); // units on the current wave
  wave: { state: 'gather' | 'attack'; units: any[]; hp0: number; stage: [number, number]; target: [number, number]; until: number; groups?: { units: any[]; stage: [number, number] }[]; guns?: any[]; tactic?: string; moved?: number; n0?: number } | null = null;
  nextBridge = 0;
  guards = new WeakSet<object>(); // units posted to hold a hub: they stay put
  intel = { air: 0, guns: 0, colossus: 0, strike: false, infantry: 0, defences: 0, heavies: 0, army: 0 }; // what it has seen of you
  cfg: (typeof LEVELS)[Level];
  plan: Plan;
  foe: number;
  lean = [0, 1, 2, 3, 4].map(() => 0.9 + Math.random() * 0.2); grudge: number[] = []; // its own preferences; damage taken from each side

  // me: which side it plays (1 normally; 0 too, for computer-vs-computer tests)
  constructor(private g: Game, level: Level, public me = 1, plan?: Plan) {
    this.cfg = LEVELS[level];
    this.foe = this.pickFoe();
    this.nextWave = this.cfg.first; this.think = (me % 6) * this.cfg.think / 18; // each side thinks at its own moment
    const options = PLANS[level];
    this.plan = plan && PLAN_WANTS[plan] ? plan : options[(Math.random() * options.length) | 0]; // (a stored choice from an older version may no longer exist)
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
  private enemy(t: number) { return this.g.hostile(this.me, t); } // anyone who'll shoot at it, marauders included
  private rival(t: number) { return t !== MARAUDER && this.enemy(t); } // a side it's actually at war with

  update(dt: number) {
    this.t += dt;
    if ((this.think -= dt) > 0) return;
    // How quickly it reacts depends on its level. Each thought comes in three parts a moment apart
    // (what it builds and buys, what it links and walls in, its army), so no one step of the game
    // carries all of it and stutters; each side starts at a different moment, so theirs never pile up.
    this.think = this.cfg.think / 3; this.part = (this.part + 1) % 3;
    if (this.part === 0) {
      this.noteBuildings();
      if (this.t >= this.nextIntel) { this.nextIntel = this.t + 20; this.foe = this.pickFoe(); this.scoutReport(); }
      this.economy();
    } else if (this.part === 1) this.links();
    else this.military();
  }

  private count(key: string) { return this.g.blds.filter((b) => b.team === this.me && b.type === key && b.dying < 0).length; }
  private mine(k: string) { return this.g.units.filter((u) => u.team === this.me && u.type === k).length + Object.values(this.g.prods[this.me].queues).reduce((n, q) => n + q.filter((j) => j.def.key === k).length, 0); } // on the field or on order
  private depth(k: string) { return Math.min(6, 1 + Math.floor(this.count(k) / 2)); } // keep every factory busy between thoughts
  // Clearly stronger than anything it has seen of you lately? Then press: attack sooner, hold on longer.
  private ahead() { const mine = this.g.units.filter((u) => u.team === this.me && u.def.weapon && !u.def.air).length; return this.cfg.tactics && this.t > 600 && mine > 1.6 * Math.max(12, this.intel.army); }
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

  // Enemy buildings it has laid eyes on (remembered until it sees them gone), noted every thought.
  private noteBuildings() {
    const g = this.g;
    for (const b of g.blds) if (this.rival(b.team) && b.max > 0 && b.dying < 0 && !this.known.has(b) && g.seenBy(this.me, (b.cx + 1) * CELL, (b.cy + 1) * CELL)) this.known.add(b);
    for (const b of this.known) if (b.dying >= 0 || !this.enemy(b.team) || !g.blds.includes(b)) this.known.delete(b);
  }
  // What has it seen of you? (It only counts what its side can actually see.)
  private scoutReport() {
    const g = this.g, seen = (x: number, y: number) => g.seenBy(this.me, x, y);
    const units = g.units.filter((u) => this.rival(u.team) && !g.hid(u, this.me) && seen(u.x, u.y));
    const blds = [...this.known].filter((b) => seen((b.cx + 1) * CELL, (b.cy + 1) * CELL));
    const i = this.intel;
    i.air = Math.max(i.air * 0.7, units.filter((u) => u.def.air).length);
    i.guns = Math.max(i.guns * 0.8, units.filter((u) => u.type === 'artillery').length + blds.filter((b) => b.type === 'battery').length * 3);
    i.colossus = Math.max(i.colossus * 0.8, units.filter((u) => u.type === 'colossus').length);
    i.strike = i.strike || g.strikes.some((m) => this.rival(m.team)); // an orbital strike has come down on it: interceptors go up
    i.infantry = Math.max(i.infantry * 0.8, units.filter((u) => !u.def.vehicle).length);
    i.army = Math.max(i.army * 0.94, units.filter((u) => u.def.weapon && !u.def.air).length); // the biggest force it has seen lately (fades over minutes)
    i.defences = Math.max(i.defences * 0.9, blds.filter((b) => DEFENCES.includes(b.type)).length);
    i.heavies = Math.max(i.heavies * 0.8, units.filter((u) => u.type === 'juggernaut').length + units.filter((u) => u.type === 'colossus').length * 4);
    if (this.cfg.anticipate) { // prepare for what they could do: an airfield means aircraft are coming, guns mean shells, a proving ground a super-unit
      const has = (k: string) => [...this.known].some((b) => b.type === k);
      if (has('airfield')) i.air = Math.max(i.air, 2);
      if (has('battery') || has('workshop')) i.guns = Math.max(i.guns, 3);
      if (has('provingGround')) { i.colossus = Math.max(i.colossus, 0.6); i.heavies = Math.max(i.heavies, 3); }
      if (has('uplink')) i.strike = true;
      if (has('workshop') && has('depot')) i.heavies = Math.max(i.heavies, 2);
    }
  }

  private economy() {
    const g = this.g, p = g.prods[this.me];
    const sites = g.blds.filter((b) => b.team === this.me && b.rise < 1 && b.dying < 0 && b.type !== 'wall' && !(b.blocked! > g.time)); // (not one its builders found no way to just now) // wall lines are laid by idle builders, block by block
    const crew = g.builders(this.me);
    // every site gets a builder; spare builders help out
    for (const site of sites) if (!crew.some((u) => u.buildSite === site)) { const free = crew.find((u) => !u.buildSite); if (free) g.assignSite(free, site); }
    for (const u of crew) if (!u.buildSite && sites[0]) g.assignSite(u, sites[0]);
    // nothing to build? patch up whatever is damaged
    const hurt = g.blds.find((b) => b.team === this.me && b.max > 0 && b.rise >= 1 && b.dying < 0 && b.hp < b.max * 0.7);
    if (hurt) for (const u of crew) if (!u.buildSite) g.assignSite(u, hurt);
    // on a last stand, raise a new heart at once, whatever else is under way
    if (g.lastStand.has(this.me) && crew.length && !this.count('fieldCommand') && p.credits >= DEF.fieldCommand.cost * 0.3) this.place(DEF.fieldCommand);
    // start the next structure (one site per builder)
    const next = this.nextStructure();
    if (sites.length < crew.length && next && p.credits > next.cost * 0.3 + sites.length * 800) {
      if (this.place(next)) this.placeFails = 0; else this.placeFails = Math.min(this.placeFails + 1, 8);
    }
    // land grab: a forward Field Command at the edge of its territory starts a new heart
    const hubs = this.count('fieldCommand');
    if (this.t >= this.nextHub && hubs >= 1 && hubs < Math.min(Math.round(N / 24), 1 + Math.floor(this.t / (this.cfg.hubEvery * 1.3))) && p.credits > DEF.fieldCommand.cost + 500 && !sites.some((b) => b.type === 'fieldCommand')) {
      this.nextHub = this.t + this.cfg.hubEvery * 0.3;
      const spot = this.frontier();
      if (spot && g.autoPlace('fieldCommand', this.me, spot[0], spot[1], true)) g.startSite(g.blds[g.blds.length - 1]);
    }
    // while the army is small, soldiers come first and buildings wait their turn
    const armySize = g.units.filter((u) => u.team === this.me && u.def.weapon).length, small = armySize < this.cfg.wave;
    const q = p.queues, saving = Math.min(1500, Math.min(sites.reduce((s, b) => s + (g.costOf(b.type) * (1 - b.rise)), 0), 500 + 250 * sites.length) * (small ? 0.3 : 1) + (small ? 0 : Math.min(1000, (next?.cost ?? 0) * 0.5))); // sites draw money as they're built, so only a little is set aside for them, and never more than $1,500 however many are under way
    let spare = p.credits - saving; const mine = (k: string) => this.mine(k), i = this.intel;
    if (g.owns('fieldCommand', this.me) && !q.fieldCommand.length && crew.length < Math.min(12, this.cfg.crew + (this.cfg.salvagers > 2 ? 2 : 1) + Math.min(3, Math.ceil(sites.filter((b) => !crew.some((u) => u.buildSite === b)).length / 2)) + this.count('fieldCommand') - 1) && this.t >= this.nextBuilder) {
      q.fieldCommand.push({ def: DEF.builder, spent: 0 }); this.nextBuilder = this.t + 45; // lost one? wait before buying another (how many: its base crew, one more per Field Command, and one for every two sites nobody is building, up to three: builders follow the work, not the money in the bank, which it now spends)
    }
    while (g.owns('depot', this.me) && q.depot.length < this.depth('depot')) {
      const salvage = mine('harvester') < this.cfg.salvagers + Math.max(0, this.count('scrapyard') - 2) && this.t >= this.nextSalvager;
      if (salvage) this.nextSalvager = this.t + 60;
      // the army mix leans on the plan, and answers what it has seen
      const heavy = this.plan === 'armour' ? 2 : 3, guns = this.plan === 'siege' ? 2 : 3;
      const pick = salvage ? DEF.harvester : mine('scout') < (this.cfg.anticipate ? 2 : 1) ? DEF.scout
        : mine('flak') < Math.min(8, Math.ceil(i.air / 1.5)) ? DEF.flak
        : g.owns('workshop', this.me) && mine('juggernaut') < Math.ceil(mine('tank') / heavy) + i.colossus * 2 ? DEF.juggernaut
        : g.owns('workshop', this.me) && mine('artillery') < Math.max(Math.ceil(mine('tank') / guns), Math.min(16, Math.floor(Math.max(i.defences, [...this.known].filter((b) => DEFENCES.includes(b.type)).length) / 4))) ? DEF.artillery : DEF.tank; // field guns to crack the defences it has seen
      if (!(salvage || spare > pick.cost + 100)) break;
      q.depot.push({ def: pick, spent: 0 }); spare -= pick.cost;
    }
    const airCap = (this.plan === 'air' ? 5 : 2) + this.cfg.crew + Math.floor(this.t / (this.plan === 'air' ? 75 : 150));
    if (g.owns('airfield', this.me) && !q.airfield.length && mine('gunship') + mine('bomber') < airCap && spare > 1600) q.airfield.push({ def: mine('bomber') < mine('gunship') / 2 ? DEF.bomber : DEF.gunship, spent: 0 });
    // a super-unit when the plan calls for one (or late in any long game)
    const wantSupers = (this.plan === 'colossus' ? 2 : 1) + (this.t > 1900 ? 1 : 0);
    if (g.owns('provingGround', this.me) && !q.provingGround.length && mine('colossus') < wantSupers && p.credits > 6000) q.provingGround.push({ def: DEF.colossus, spent: 0 });
    // research at the armoury, one upgrade at a time
    if (g.owns('armoury', this.me) && !q.armoury.length && spare > 2000) { const next = ['armourUp', 'shellsUp', 'optics', 'engines'].find((k) => !g.upgrades[this.me].has(k)); if (next) q.armoury.push({ def: DEF[next], spent: 0 }); }
    // a couple of engineers on hand to slip in with attacks
    if (g.owns('barracks', this.me) && g.owns('fieldCommand', this.me) && !q.barracks.length && this.t > 600 && mine('engineer') < 2 && spare > 1200) q.barracks.push({ def: DEF.engineer, spent: 0 });
    const infantryCap = this.cfg.infantry + Math.floor(this.t / 60) * 2; // grows with the game: about 70 foot soldiers by half an hour (spare money goes to armour, not more riflemen)
    while (g.owns('barracks', this.me) && q.barracks.length < this.depth('barracks') && mine('rifle') + mine('rocket') + mine('grenadier') < infantryCap && spare > 150) {
      const wantRockets = i.colossus || i.air > 2 ? 1 : 0.5; // rockets answer big armour and aircraft
      const rockets = mine('rocket') < mine('rifle') * wantRockets + 1 && spare > 350;
      const grenades = g.owns('hospital', this.me) && mine('grenadier') < mine('rifle') / (i.infantry > 15 ? 2 : 3) && spare > 300;
      const d = grenades ? DEF.grenadier : rockets ? DEF.rocket : DEF.rifle; q.barracks.push({ def: d, spent: 0 }); spare -= d.cost;
    }
  }

  // Its empire links building to building (see territory.ts): a valuable building left cut off (a
  // hub, a captured site, oil, a scrapyard) gets the next few buildings set down in the gap, chaining
  // the base out to it. Then sandbag lines round its towns.
  private links() {
    const g = this.g, L = g.territory.linked, V = (b: any) => (b.type === 'fieldCommand' ? 5 : g.isCapturable(b) ? 4 : b.type === 'derrick' ? 3 : b.type === 'scrapyard' ? 2 : 1);
    if (this.bridgeTo && (L.has(this.bridgeTo) || !g.blds.includes(this.bridgeTo) || this.bridgeTo.team !== this.me || this.t > this.bridgeUntil)) this.bridgeTo = null;
    if (!this.bridgeTo) {
      const far = g.blds.filter((b) => b.team === this.me && b.dying < 0 && b.rise >= 1 && V(b) > 1 && !L.has(b) && this.t - (this.bridged.get(b) ?? -1e9) > 300).sort((a, b) => V(b) - V(a))[0];
      if (far) { this.bridged.set(far, this.t); this.bridgeTo = far; this.bridgeUntil = this.t + 420; } // several minutes to reach it, then it tries another
    }
    this.planTowns();
  }

  // Once a hub's towers stand, a sandbag line joins them on the side facing the enemy.
  private planTowns() {
    const g = this.g, p = g.prods[this.me], [ex, ey] = g.terrain.bases[g.baseOf(this.foe)], t = g.terrain;
    for (const h of g.blds) {
      if (h.team !== this.me || h.type !== 'fieldCommand' || h.rise < 1 || h.dying >= 0 || this.planned.get(h) || p.credits < 2500 || this.defenceAt(h) < 3) continue;
      const face = Math.atan2(ey - h.cy, ex - h.cx);
      for (let a = -0.9, k = 0; a <= 0.9; a += 0.06, k++) {
        if (k % 6 === 3) continue; // a gate every few yards: its own troops get out, and attackers are funnelled to where the towers cover
        const cx = Math.round(h.cx + 1 + Math.cos(face + a) * 11), cy = Math.round(h.cy + 1 + Math.sin(face + a) * 11);
        if (!t.inside(cx, cy)) continue;
        const i = t.idx(cx, cy); if (t.occupied[i] || t.forest[i] || t.elev[i] === 1 || (t.type[i] !== T.GRASS && t.type[i] !== T.DIRT)) continue; // gaps where the ground won't take one
        g.addBld('wall', this.me, cx, cy, 1, 1, DEF.wall.name); g.startSite(g.blds[g.blds.length - 1]); // a site: its builders lay it, paying as they go, like yours
      }
      this.planned.set(h, 1);
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

  // Marauders dug in round a prize, or a camp with a bounty: it sends a force big enough for the guns
  // it can see there (prizes first, near ones before far), and calls it off once they're gone.
  private clearMarauders(idle: any[]) {
    const g = this.g;
    if (this.clearing) {
      const c = this.clearing; c.units = c.units.filter((u: any) => g.units.includes(u));
      const left = g.blds.some((b) => b.team === MARAUDER && b.dying < 0 && Math.hypot(b.cx + 1 - c.x, b.cy + 1 - c.y) < 9) || g.units.some((u) => u.team === MARAUDER && Math.hypot(u.x / CELL - c.x, u.y / CELL - c.y) < 9);
      if (!left || !c.units.length || this.t > c.until) { for (const u of c.units) this.raiders.delete(u); this.clearing = null; }
      return;
    }
    if (this.t < this.nextClear || this.wave?.state === 'gather') return;
    this.nextClear = this.t + 20;
    const ground = idle.filter((u) => !u.def.air && u.def.weapon && !['scout', 'engineer'].includes(u.type));
    const [hx, hy] = this.home();
    const spots: { x: number; y: number; worth: number }[] = g.blds.filter((b) => b.team === MARAUDER && b.dying < 0).map((b) => ({ x: b.cx + 1, y: b.cy + 1, worth: g.blds.filter((s) => g.isCapturable(s) && s.team !== this.me && Math.hypot(s.cx - b.cx, s.cy - b.cy) < 8).reduce((m, s) => Math.max(m, WORTH[s.type] ?? 2), 0) || 5 }));
    for (const c of g.camps) if (!c.done) spots.push({ x: c.x / CELL, y: c.y / CELL, worth: 6 }); // a camp's bounty is worth a fair prize
    const pick = spots.map((s) => ({ ...s, need: Math.ceil(3 + this.danger(s.x, s.y) * 1.2), score: s.worth / (1 + Math.hypot(s.x - hx, s.y - hy) / 40) })).filter((x) => x.need <= ground.length).sort((a, b) => b.score - a.score)[0];
    if (!pick) return;
    const squad = ground.slice(0, pick.need + 2);
    for (const u of squad) this.raiders.add(u);
    g.orderUnits(squad, pick.x * CELL, pick.y * CELL, true, true);
    this.clearing = { units: squad, x: pick.x, y: pick.y, until: this.t + 150 };
  }
  // A dam whose valley holds more of the enemy than of its own: a squad goes to blow it.
  private blowDams(idle: any[]) {
    const g = this.g;
    if (!this.cfg.dams || this.t < this.nextDam) return;
    this.nextDam = this.t + 8;
    for (const d of g.dams) {
      if (d.burst || d.b.dying >= 0) continue;
      const k = g.dams.indexOf(d) + 1, t = g.terrain, inZone = (cx: number, cy: number) => g.floodMask[t.idx(cx, cy)] === k;
      const seen = (x: number, y: number) => g.seenBy(this.me, x, y); // only what its side can see, like a player
      let value = 0;
      for (const b of g.blds) if (b.max > 0 && b.dying < 0 && inZone(b.cx, b.cy) && (b.team === this.me || seen((b.cx + 1) * CELL, (b.cy + 1) * CELL))) value += (this.rival(b.team) ? 1 : b.team === this.me ? -1.5 : 0) * g.costOf(b.type);
      for (const u of g.units) if (u.def.weapon && inZone(t.cellOf(u.x), t.cellOf(u.y)) && (u.team === this.me || (seen(u.x, u.y) && !g.hid(u, this.me)))) value += this.rival(u.team) ? 150 : u.team === this.me ? -200 : 0;
      if (d.b.team === this.me) value -= 2500; else if (this.rival(d.b.team)) value += 1200; // its own power station is costly to lose; the enemy's is worth denying
      const [dx, dy] = g.posOf(d.b), watch = idle.filter((u) => this.guards.has(u) && Math.hypot(u.x - dx, u.y - dy) < 8 * CELL);
      if (value >= 1000) { // blow it: the watch at the dam first, then anyone idle
        const squad = [...watch, ...idle.filter((u) => !u.def.air && u.def.weapon && !this.raiders.has(u) && !watch.includes(u))].filter((u) => blasts(u)).slice(0, 8); // only explosives bring a dam down
        for (const u of squad) { this.raiders.add(u); u.target = d.b; u.forced = true; u.amove = false; u.goal = null; u.path = []; }
        return;
      }
      // the better players post a small watch near a dam whose valley the enemy could come down, ready to blow it
      if (this.cfg.anticipate && this.t > 420 && !watch.length) {
        const mine = g.blds.some((b) => b.team === this.me && b.dying < 0 && Math.hypot(b.cx - dx / CELL, b.cy - dy / CELL) < 30);
        const pick = idle.filter((u) => !u.def.air && u.def.weapon && !this.raiders.has(u) && !this.guards.has(u) && (u.type === 'tank' || u.type === 'artillery' || u.type === 'rocket')).slice(0, 3);
        if (mine && pick.length) { const a = Math.atan2(dy - this.home()[1] * CELL, dx - this.home()[0] * CELL); g.orderUnits(pick, dx - Math.cos(a) * 4 * CELL, dy - Math.sin(a) * 4 * CELL, true); for (const u of pick) this.guards.add(u); }
      }
    }
  }
  // Bridges: the better players drop one under an enemy force crossing it (only what they can see),
  // and every level rebuilds a fallen bridge near its own ground when it can spare the money.
  private bridges(idle: any[]) {
    const g = this.g, t = g.terrain;
    if (this.cfg.anticipate) for (const b of g.blds) {
      if (b.type !== 'bridge' || b.team !== 2 || b.rise < 1 || b.dying >= 0) continue;
      let value = 0; const [bx, by] = g.posOf(b);
      for (const u of g.units) if (u.def.weapon && !u.def.air && u.x > (b.cx - 1) * CELL && u.x < (b.cx + b.w + 1) * CELL && u.y > (b.cy - 1) * CELL && u.y < (b.cy + b.h + 1) * CELL) value += u.team === this.me ? -300 : this.rival(u.team) && g.seenBy(this.me, u.x, u.y) ? 150 : 0;
      if (value < 900) continue;
      const squad = idle.filter((u) => !u.def.air && blasts(u) && !this.raiders.has(u) && Math.hypot(u.x - bx, u.y - by) < 25 * CELL).slice(0, 8);
      for (const u of squad) { this.raiders.add(u); u.target = b; u.forced = true; u.amove = false; u.goal = null; u.path = []; }
    }
    if (g.prods[this.me].credits < 2500) return;
    for (const f of g.fallen) {
      if (g.blds.some((b) => b.type === 'bridge' && b.cx === f.cx && b.cy === f.cy)) continue;
      if (!g.blds.some((b) => b.team === this.me && b.dying < 0 && Math.hypot(b.cx - f.cx, b.cy - f.cy) < 35)) continue;
      const crew = g.builders(this.me).filter((u) => !u.buildSite).slice(0, 1);
      if (crew.length) { g.rebuildBridge(f, this.me, crew); return; }
    }
  }

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
      if (x < 5 || y < 5 || x > N - 6 || y > N - 6 || hubs.some((o) => Math.hypot(o.cx - x, o.cy - y) < 18) || g.floodMask[t.idx(x, y)]) continue; // not in a flood valley
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
    if (i.strike) out.push(['radar', 1], ['interceptor', 1], ['interceptor', 2]);
    if (i.air > 0.5) out.push(['flakTower', Math.min(8, Math.max(1 + Math.ceil(i.air / 2), this.count('scrapyard') + 1))]); // any aircraft seen: flak goes up, one by each scrapyard
    if (i.guns >= 3) out.push(['shield', i.guns >= 8 ? 2 : 1]);
    if (i.colossus) out.push(['radar', 1], ['battery', 2]);
    if (i.defences > 8) out.push(['radar', 1], ['battery', 1]);
    for (const [k, n, at] of PLAN_WANTS[this.plan]) if (min >= at) out.push([k, n]);
    if (min > 25) out.push(['provingGround', 1], ['radar', 1]); // a long game escalates
    if (min > 32) out.push(['provingGround', 2]); // and escalates again
    return [...out, ...CORE];
  }

  private nextStructure(): BuildDef | null {
    const g = this.g, pw = g.powers[this.me];
    if (g.lastStand.has(this.me) && !this.count('fieldCommand')) return DEF.fieldCommand; // a last stand: a new heart before anything else
    if (pw.made - pw.used < 40) return g.owns('workshop', this.me) && this.count('generator') >= 8 && g.prods[this.me].credits > 3000 ? DEF.reactor : DEF.generator;
    if (this.outpost && g.prods[this.me].credits > 800) return DEF.guardTower;
    // power as needed, not spare: generators early; reactors once it's big and can afford them (cheaper to run)
    if (!this.count('fieldCommand') && this.count('barracks') && g.prods[this.me].credits > 1200) return DEF.fieldCommand;
    const [hx, hy] = this.home();
    if (g.terrain.oil.some((o) => o.found && !o.tapped && Math.hypot(o.cx - hx, o.cy - hy) < 30)) return DEF.derrick;
    const cash = g.prods[this.me].credits;
    { // factories keep pace with the empire: about one more for each hub, so a bigger empire fields a bigger army
      const hubs = this.count('fieldCommand'), F: [string, number][] = [['depot', 1], ['barracks', 0.6], ['workshop', 0.25]];
      const f = F.filter(([k]) => (DEF[k].needs ?? []).every((n) => g.owns(n, this.me))).sort((a, b) => this.count(a[0]) / a[1] - this.count(b[0]) / b[1])[0];
      if (f && hubs >= 3 && cash > DEF[f[0]].cost && this.count('depot') + this.count('barracks') + this.count('workshop') < 1 + hubs) return DEF[f[0]]; // only once it has spread out: early on, money buildings come first
    }
    if (cash > 1500 && this.count('barracks')) { // each hub holds its ground: a line of the right towers facing the enemy
      const h = this.weakHub();
      if (h) {
        this.fortifyAt = h;
        const i = this.intel, n = this.defenceAt(h);
        const pick = i.air > 2 && n % 4 === 3 ? 'flakTower' : n % 2 || (i.heavies >= 3 && n % 4 === 2) ? 'emplacement' : 'guardTower'; // heavy armour seen: more emplacements
        const d = DEF[pick]; if ((d.needs ?? []).every((k) => g.owns(k, this.me))) return d;
        return DEF.guardTower;
      }
    }
    if (cash > 4000) { // money truly piling up: more factories, so it turns into army (below that, the factories it has are kept busy)
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
    const SPRAWL: [string, number][] = [['barracks', 0.6], ['depot', 0.5], ['guardTower', 1], ['emplacement', 1], ['flakTower', 0.8], ['scrapyard', 0.5], ['hospital', 0.25], ['workshop', 0.25], ['airfield', 0.3], ['battery', 0.3], ['radar', 0.2]];
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
    if (this.bridgeTo && !defence && !central) { // into the gap: a few squares out from the linked building nearest the cut-off one, toward it
      const f = this.bridgeTo, fx = f.cx + f.w / 2, fy = f.cy + f.h / 2;
      const from = g.blds.filter((b) => b.team === this.me && b.dying < 0 && g.territory.linked.has(b)).sort((a, b) => Math.hypot(a.cx - fx, a.cy - fy) - Math.hypot(b.cx - fx, b.cy - fy))[0];
      if (from) {
        const ox = from.cx + from.w / 2, oy = from.cy + from.h / 2, a0 = Math.atan2(fy - oy, fx - ox), r = Math.max(from.w, from.h) / 2 + 3 + (d.w ?? 2) / 2;
        for (const da of [0, 0.4, -0.4, 0.8, -0.8]) if (g.autoPlace(d.key, this.me, Math.round(ox + Math.cos(a0 + da) * r - (d.w ?? 2) / 2), Math.round(oy + Math.sin(a0 + da) * r - (d.h ?? 2) / 2), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
      }
    }
    if (hub && !defence && !central) { // round the emptiest hub, nearest first
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
    g.bldsNear(x * CELL, y * CELL, 8 * CELL, (b) => { if (this.enemy(b.team) && b.dying < 0 && Math.hypot(b.cx - x, b.cy - y) < 6 && this.known.has(b)) d += air ? (b.type === 'flakTower' ? 3 : 0) : DEFENCES.includes(b.type) ? 2 : 0; }); // only what's nearby (the grids)
    g.near(x * CELL, y * CELL, 6 * CELL, (u) => { if (this.enemy(u.team) && u.def.weapon && Math.hypot(u.x / CELL - x, u.y / CELL - y) < 6 && g.seenBy(this.me, u.x, u.y) && !g.hid(u, this.me)) d += air ? (u.type === 'flak' || u.type === 'rocket' ? 1.5 : 0) : u.def.vehicle ? 1 : 0.4; });
    return d; // only what its side has seen, like a player
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
    // a hub or held site under attack calls for help: the idle troops within reach go to it
    if (this.cfg.tactics && this.t >= this.nextHelp) {
      this.nextHelp = this.t + 5;
      let worst: any = null, most = 0;
      for (const b of g.blds) {
        if (b.team !== this.me || b.dying >= 0 || (b.type !== 'fieldCommand' && !g.isCapturable(b))) continue;
        let n = 0; g.near((b.cx + 1) * CELL, (b.cy + 1) * CELL, 12 * CELL, (u: any) => { if (this.enemy(u.team) && u.def.weapon && !u.def.air && !g.hid(u, this.me)) n++; });
        if (n > most) { most = n; worst = b; }
      }
      if (worst && most >= 6) {
        const [bx, by] = g.posOf(worst);
        const help = idle.filter((u) => !this.guards.has(u) && !u.def.air && u.type !== 'scout' && Math.hypot(u.x - bx, u.y - by) < 50 * CELL).slice(0, most * 2);
        if (help.length) g.orderUnits(help, bx, by, true, true);
      }
    }
    this.orbitalStrike();
    this.airRaid(idle);
    // capture squads: the best site anywhere on the map, worth against distance and danger
    if (this.cfg.capture) {
      const spare = idle.filter((u) => u.type === 'rifle' || u.type === 'grenadier');
      const missions = g.units.filter((u) => u.team === this.me && u.enter && u.goal).length; // errands still under way
      if (spare.length >= 3 && missions < 9) {
        const site = g.blds.filter((b) => g.isCapturable(b) && (b.team === 2 || this.enemy(b.team)) && b.garrison === 0 && !g.units.some((u) => u.team === this.me && u.enter === b && u.goal))
          .map((b) => ({ b, score: (WORTH[b.type] ?? 2) / (1 + Math.hypot(b.cx - hx, b.cy - hy) / 50) - this.danger(b.cx, b.cy) * 0.6 }))
          .sort((a, b) => b.score - a.score)[0];
        if (site && site.score > 0.5) for (const u of spare.slice(0, 3)) g.sendIn(u, site.b);
      }
      // far-flung sites it holds get a guard tower (an outpost)
      if (!this.outpost) { const held = g.blds.find((b) => g.isCapturable(b) && b.team === this.me && !this.fortified.has(b) && Math.hypot(b.cx - hx, b.cy - hy) > 40); if (held) { this.fortified.add(held); this.outpost = [held.cx, held.cy]; } } // each outpost gets one try
    }
    // fast units go after supply crates and abandoned machines out on the map
    const runners = idle.filter((u) => u.type === 'tank').slice(0, 2); // scouts keep scouting
    for (const u of runners) {
      const prizes: [number, number][] = [...g.crates.filter((c) => g.seenBy(this.me, c.x, c.y) || Math.hypot(c.x / CELL - hx, c.y / CELL - hy) < 40).map((c) => [c.x, c.y] as [number, number]),
        ...g.units.filter((d) => d.team === 2 && d.def.weapon).map((d) => [d.x, d.y] as [number, number])];
      const best = prizes.filter(([x, y]) => this.danger(x / CELL, y / CELL) < 2).sort((a, b) => Math.hypot(a[0] - u.x, a[1] - u.y) - Math.hypot(b[0] - u.x, b[1] - u.y))[0];
      if (best && Math.hypot(best[0] - u.x, best[1] - u.y) < 70 * CELL) g.orderUnits([u], best[0], best[1], false);
    }
    // scouting: buggies run into enemy country to find what to hit (it may strike oil on the way); with
    // batteries, one sits forward as their spotter. The better players scout more.
    if (this.t > this.nextScout) {
      this.nextScout = this.t + (this.cfg.anticipate ? 45 : 90);
      const scouts = idle.filter((u) => u.type === 'scout'), scout = scouts[0] ?? idle.find((u) => u.type === 'tank');
      const battery = g.blds.find((b) => b.team === this.me && b.type === 'battery' && b.rise >= 1);
      if (scout && battery) { const [bx, by] = g.terrain.bases[g.baseOf(this.foe)], a = Math.atan2(by - battery.cy, bx - battery.cx); g.orderUnits([scout], (battery.cx + Math.cos(a) * 17) * CELL, (battery.cy + Math.sin(a) * 17) * CELL, false); }
      const runners = battery ? scouts.slice(1) : scouts; // only real scouts go running
      for (const u of runners) { // a point deep in their half, towards their base
        const [ex, ey] = g.terrain.bases[g.baseOf(this.foe)], a = Math.atan2(ey - hy, ex - hx) + (Math.random() - 0.5) * 1.2, d = Math.hypot(ex - hx, ey - hy) * (0.6 + Math.random() * 0.45);
        g.orderUnits([u], Math.max(2, Math.min(N - 2, hx + Math.cos(a) * d)) * CELL, Math.max(2, Math.min(N - 2, hy + Math.sin(a) * d)) * CELL, false);
      }
    }
    this.clearMarauders(idle);
    this.blowDams(idle);
    if (this.t >= (this.nextBridge ?? 0)) { this.nextBridge = this.t + 8; this.bridges(idle); }
    // standing guards: idle units hold the hearts and sites nearest the enemy, up to four on each
    const [ex, ey] = g.terrain.bases[g.baseOf(this.foe)];
    const posts = g.blds.filter((b) => b.team === this.me && b.dying < 0 && (b.type === 'fieldCommand' || g.isCapturable(b))).sort((a, b) => Math.hypot(a.cx - ex, a.cy - ey) - Math.hypot(b.cx - ex, b.cy - ey)).slice(0, 6);
    const posted = g.units.filter((u) => u.team === this.me && this.guards.has(u) && !this.raiders.has(u)).length;
    if (posts.length > 1 && posted < posts.length * 4 + 3) { // four on each post (plus a dam watch), counting those on their way
      const free = idle.filter((u) => !u.def.air && u.type !== 'scout' && u.type !== 'engineer' && posts.every((b) => Math.hypot(u.x / CELL - b.cx, u.y / CELL - b.cy) > 10));
      for (const b of posts) {
        if (!free.length) break;
        let guards = 0; g.near((b.cx + 1) * CELL, (b.cy + 1) * CELL, 8 * CELL, (u: any) => { if (u.team === this.me && u.def.weapon) guards++; });
        if (guards < 4) {
          const u = free.shift(), a = Math.atan2(ey - b.cy, ex - b.cx);
          let px = Math.round(b.cx + 1 + Math.cos(a) * 4), py = Math.round(b.cy + 1 + Math.sin(a) * 4);
          if (CAMO.includes(u.type)) { const t = g.terrain; let bd = 99; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = px + dx, y = py + dy; if (t.inside(x, y) && t.forest[t.idx(x, y)] && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); px = x; py = y; } } } // foot soldiers and field guns wait in the trees: an ambush
          g.orderUnits([u], (px + 0.5) * CELL, (py + 0.5) * CELL, true); this.guards.add(u);
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
        const groups = w.groups ?? [{ units: w.units, stage: w.stage }];
        const ready = groups.every((gp) => { const live = gp.units.filter((u) => g.units.includes(u)); return !live.length || live.filter((u) => Math.hypot(u.x - gp.stage[0], u.y - gp.stage[1]) < 8 * CELL).length >= live.length * 0.7; });
        if (ready || this.t > w.until) {
          w.state = 'attack'; w.hp0 = hp; w.n0 = w.units.length;
          for (const gp of groups) g.orderUnits(gp.units.filter((u) => g.units.includes(u)), w.target[0], w.target[1], true, true); // all at once, from every side
          const guns = (w.guns ?? []).filter((u) => g.units.includes(u)); if (guns.length) { const [tx, ty] = w.target, gx = guns[0].x, gy = guns[0].y, d = Math.hypot(tx - gx, ty - gy) || 1, r = 12 * CELL; g.orderUnits(guns, tx + ((gx - tx) / d) * r, ty + ((gy - ty) / d) * r, true, true); } // in range, not in the brawl
          const prize = g.blds.filter((b) => b.team === this.foe && b.max > 0 && b.dying < 0 && b.type !== 'wall' && !DEFENCES.includes(b.type) && Math.hypot((b.cx + 1) * CELL - w.target[0], (b.cy + 1) * CELL - w.target[1]) < 12 * CELL).sort((a, b) => g.costOf(b.type) - g.costOf(a.type))[0];
          if (prize) for (const u of g.units) if (u.team === this.me && u.type === 'engineer' && !u.grab && !u.goal) g.sendEngineer(u, prize);
          if (this.foe === 0) g.warn('Enemy forces advancing on your base!', w.target);
          else if (g.friendly(this.foe)) g.warn('Enemy forces moving on our ally!', w.target);
        }
        return;
      }
      const fresh = this.cfg.tactics ? idle.filter((u) => !u.goal && !u.def.air && !this.raiders.has(u) && !this.guards.has(u) && u.def.weapon && u.type !== 'scout') : [];
      if (fresh.length >= Math.max(8, (w.n0 ?? 0) * 0.25) && hp > w.hp0 * 0.55) { // reinforcements stream out to a fight that's going well, instead of idling at home
        for (const u of fresh) { this.raiders.add(u); w.units.push(u); }
        w.hp0 += fresh.reduce((s, u) => s + u.hp, 0); g.orderUnits(fresh, w.target[0], w.target[1], true, true);
      }
      if (hp < w.hp0 * this.cfg.retreat * (this.ahead() ? 0.5 : 1)) { // losing: fall back to repair and regroup (better players cut their losses sooner)
        g.orderUnits(w.units, hx * CELL, hy * CELL, false);
        for (const u of w.units) this.raiders.delete(u);
        this.wave = null; this.nextWave = this.t + this.cfg.gap * 0.6;
      } else if (this.t > (w.moved ?? 0) && w.units.filter((u) => !u.goal && !u.path.length && !u.target).length >= w.units.length * 0.5) { // target gone (most stand idle): on to the next one
        w.moved = this.t + 20; // a big army re-routes at most every 20 seconds
        const next = this.pickTarget(); if (next) { w.target = next; g.orderUnits(w.units, next[0], next[1], true, true); } else this.wave = null;
      }
      return;
    }
    const want = Math.round((this.cfg.wave + Math.floor(this.t / 150) * 3) * (this.ahead() ? 0.6 : 1)); // waves grow with the game: about 45 strong by half an hour
    const ground = idle.filter((u) => u.type !== 'scout' && u.type !== 'engineer' && !u.def.air);
    if (this.t < this.nextWave || ground.length < want) return;
    const target = this.pickTarget(undefined, ground.length);
    if (!target) return;
    const base = g.blds.filter((b) => b.team === this.me && b.type === 'fieldCommand' && b.dying < 0).sort((a, b) => Math.hypot((a.cx + 1) * CELL - target[0], (a.cy + 1) * CELL - target[1]) - Math.hypot((b.cx + 1) * CELL - target[0], (b.cy + 1) * CELL - target[1]))[0];
    const ox = base ? (base.cx + 1.5) * CELL : hx * CELL, oy = base ? (base.cy + 1.5) * CELL : hy * CELL; // marshal at the forward hub nearest the target
    for (const u of ground) { this.raiders.add(u); this.guards.delete(u); }
    // Tactics, as an old general would, where they work in this game:
    // - hammer and anvil: their defences face one way, so the main body pins the front while the fast
    //   units swing round and strike from the side they don't face;
    // - pincer: two halves close from two directions at once, splitting the defenders' fire;
    // - and the field guns always set up behind the line, shelling from range.
    const R = 13 * CELL, dx = ox - target[0], dy = oy - target[1], dl = Math.hypot(dx, dy) || 1, toUs = Math.atan2(dy, dx);
    const at = (a: number, r = R): [number, number] => [target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r];
    const guns = ground.filter((u) => u.type === 'artillery'), fast = ground.filter((u) => u.type === 'scout' || (u.type === 'tank' && u.id % 2 === 0)), rest = ground.filter((u) => !guns.includes(u));
    const defs = g.blds.filter((b) => this.rival(b.team) && b.dying < 0 && DEFENCES.includes(b.type) && Math.hypot((b.cx + 1) * CELL - target[0], (b.cy + 1) * CELL - target[1]) < 12 * CELL);
    const front = defs.length ? Math.atan2(defs.reduce((s, b) => s + (b.cy + 1) * CELL - target[1], 0), defs.reduce((s, b) => s + (b.cx + 1) * CELL - target[0], 0)) : toUs;
    let tactic = 'direct', groups: { units: any[]; stage: [number, number] }[];
    if (this.cfg.tactics && defs.length >= 3 && fast.length >= 4 && rest.length - fast.length >= 6) { // hammer and anvil
      tactic = 'flank';
      const anvil = rest.filter((u) => !fast.includes(u)), side = front + Math.PI + (Math.random() < 0.5 ? 0.9 : -0.9);
      groups = [{ units: anvil, stage: at(toUs) }, { units: fast, stage: at(side, R * 1.1) }];
    } else if (this.cfg.tactics && rest.length >= 16 && this.cfg.anticipate) { // pincer
      tactic = 'pincer';
      groups = [{ units: rest.filter((_, k) => k % 2 === 0), stage: at(toUs + 0.95) }, { units: rest.filter((_, k) => k % 2 === 1), stage: at(toUs - 0.95) }];
    } else groups = [{ units: rest, stage: [ox + (target[0] - ox) * 0.5, oy + (target[1] - oy) * 0.5] }];
    const gunStage = at(toUs, R + 5 * CELL); // the guns, behind the line
    for (const gp of groups) g.orderUnits(gp.units, gp.stage[0], gp.stage[1], true, true);
    if (guns.length) g.orderUnits(guns, gunStage[0], gunStage[1], false, true);
    this.wave = { state: 'gather', units: ground, hp0: 0, stage: groups[0].stage, target, until: this.t + 75, groups, guns, tactic };
    this.nextWave = this.t + this.cfg.gap;
  }

  // Where to hit: buildings worth a lot and defended little, with economy counting double.
  private pickTarget(avoid?: [number, number], strength = 10): [number, number] | null {
    const g = this.g, [hx, hy] = this.home();
    const econ = ['scrapyard', 'reactor', 'generator', 'derrick', 'fieldCommand', 'provingGround'];
    let best: [number, number] | null = null, bs = -1e9;
    for (const b of this.known) { // only what it has scouted
      if (b.team !== this.foe || b.max <= 0 || b.dying >= 0 || b.type === 'wall') continue;
      const value = g.costOf(b.type) * (b.type === 'fieldCommand' ? 3 : econ.includes(b.type) ? 2 : 1), dist = Math.hypot(b.cx - hx, b.cy - hy); // a hub is the prize: it cuts their network
      let score = value / 1000 - this.danger(b.cx, b.cy) * 1.5 * Math.min(1, 20 / Math.max(1, strength)) - dist * 0.03; // a big army minds defences less
      if (avoid && Math.hypot((b.cx + 1) * CELL - avoid[0], (b.cy + 1) * CELL - avoid[1]) < 25 * CELL) score -= 100; // the flank goes somewhere else
      if (score > bs) { bs = score; best = g.posOf(b); }
    }
    if (best) return best;
    const [ex, ey] = g.terrain.bases[g.baseOf(this.foe)]; // nothing scouted: everyone knows where they started
    return g.blds.some((b) => b.team === this.foe && b.dying < 0) || g.units.some((x) => x.team === this.foe) ? [ex * CELL, ey * CELL] : null;
  }

  // Gunships raid the economy where there's least flak, and come home to repair when hurt.
  private airRaid(idle: any[]) {
    const g = this.g, [hx, hy] = this.home();
    for (const u of g.units) if (u.team === this.me && u.type === 'gunship' && u.hp < u.def.hp * 0.4 && u.goal && u.amove) g.orderUnits([u], hx * CELL, hy * CELL, false);
    const bombers = idle.filter((u) => u.type === 'bomber' && u.hp > u.def.hp * 0.7);
    if (bombers.length >= 2 && this.t >= this.nextBomb) {
      this.nextBomb = this.t + 60;
      const targets = [...this.known].filter((b) => this.rival(b.team) && b.max > 0 && b.dying < 0 && b.type !== 'wall').map((b) => [b.cx + 1, b.cy + 1, g.costOf(b.type)] as [number, number, number]);
      const best = targets.map((t) => ({ t, s: t[2] / 1000 - this.danger(t[0], t[1], true) * 2 })).sort((a, b) => b.s - a.s)[0]?.t; // score each once, then sort
      if (best) g.orderUnits(bombers, best[0] * CELL, best[1] * CELL, true, true);
    }
    const ships = idle.filter((u) => u.type === 'gunship' && u.hp > u.def.hp * 0.7);
    if (this.t < this.nextRaid || ships.length < 3) return;
    this.nextRaid = this.t + 70;
    const prey = g.units.filter((u) => this.rival(u.team) && !u.def.air && (u.type === 'harvester' || u.type === 'builder' || u.def.vehicle) && g.seenBy(this.me, u.x, u.y) && !g.hid(u, this.me)).map((u) => [u.x / CELL, u.y / CELL]) as [number, number][];
    const target = prey.map((p) => ({ p, s: this.danger(p[0], p[1], true) })).sort((a, b) => a.s - b.s)[0]?.p;
    if (target) g.orderUnits(ships, target[0] * CELL, target[1] * CELL, true, true);
  }

  // A charged uplink fires at the richest target it can see that isn't under an interceptor:
  // a cluster of buildings, or an army massed in the open.
  private orbitalStrike() {
    const g = this.g;
    const uplink = g.blds.find((b) => b.team === this.me && b.type === 'uplink' && b.rise >= 1 && b.dying < 0 && (b.timer ?? 0) >= UPLINK_TIME);
    if (!uplink) return;
    const theirs = [...this.known].filter((b) => this.rival(b.team) && b.max > 0 && b.dying < 0); // only what it has seen
    const troops = g.units.filter((u) => this.rival(u.team) && u.def.weapon && !u.def.air && g.seenBy(this.me, u.x, u.y) && !g.hid(u, this.me));
    const guards = theirs.filter((b) => b.type === 'interceptor' && (b.ammo ?? 0) > 0);
    const spots: [number, number][] = [...theirs.map((b) => g.posOf(b)), ...troops.filter((_, k) => k % 3 === 0).map((u) => [u.x, u.y] as [number, number])];
    let best: [number, number] | null = null, bs = 0;
    for (const [x, y] of spots) {
      let value = 0;
      for (const o of theirs) if (Math.hypot((o.cx + 1) * CELL - x, (o.cy + 1) * CELL - y) < 5 * CELL) value += g.costOf(o.type);
      for (const u of troops) if (Math.hypot(u.x - x, u.y - y) < 4 * CELL) value += g.costOf(u.type);
      if (guards.some((i) => Math.hypot((i.cx + 1) * CELL - x, (i.cy + 1) * CELL - y) < INTERCEPT_RANGE * CELL)) value *= 0.25; // probably shot down: try elsewhere
      if (value > bs) { bs = value; best = [x, y]; }
    }
    if (best && bs > 2000) g.launch(uplink, best[0], best[1]);
  }
}
