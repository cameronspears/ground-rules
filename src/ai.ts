// The computer opponent. It plays by the same rules as you: it spends credits on the same
// buildings, keeps its power up, harvests scrap, drills oil it stumbles on, trains an army,
// defends its base and attacks in waves. Difficulty changes its income and build speed, how big
// its waves are and how soon they come, and whether it goes after capture sites.
import type { Game } from './game';
import { DEF, BuildDef, FOUNDRY_POWER } from './build';
import { CELL, N } from './terrain';

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: Record<Level, { rate: number; wave: number; first: number; gap: number; salvagers: number; capture: boolean; towers: number; infantry: number }> = {
  easy: { rate: 0.7, wave: 6, first: 330, gap: 220, salvagers: 1, capture: false, towers: 1, infantry: 8 },
  normal: { rate: 1, wave: 9, first: 250, gap: 170, salvagers: 2, capture: true, towers: 2, infantry: 12 },
  hard: { rate: 1.35, wave: 12, first: 190, gap: 125, salvagers: 3, capture: true, towers: 3, infantry: 16 },
};

// What the enemy wants to own, in rough priority order. Power is handled first, separately.
const WANT: [string, number][] = [['scrapyard', 1], ['barracks', 1], ['fieldCommand', 1], ['depot', 1], ['guardTower', 1], ['scrapyard', 2], ['hospital', 1], ['workshop', 1], ['emplacement', 1],
  ['foundry', 1], ['flakTower', 1], ['guardTower', 2], ['radar', 1], ['airfield', 1], ['scrapyard', 3], ['barracks', 2], ['emplacement', 2], ['depot', 2], ['battery', 1], ['foundry', 2],
  ['flakTower', 2], ['guardTower', 3], ['emplacement', 3], ['reactor', 1], ['scrapyard', 4], ['foundry', 3], ['flakTower', 3], ['guardTower', 4], ['emplacement', 4], ['battery', 2],
  ['barracks', 3], ['depot', 3], ['airfield', 2], ['foundry', 4], ['reactor', 2]];

export class AI {
  t = 0; think = 0; nextWave: number; nextScout = 60; placeFails = 0; nextSalvager = 0; nextBuilder = 0; raiders = new Set<any>(); // raiders: units sent on the current attack
  cfg: (typeof LEVELS)[Level];

  foe: number;
  // me: which side it plays (1 normally; 0 too, for computer-vs-computer balance tests)
  constructor(private g: Game, level: Level, private me = 1) {
    this.cfg = LEVELS[level];
    this.foe = 1 - me;
    if (me === 1) g.aiRate = this.cfg.rate;
    this.nextWave = this.cfg.first;
  }

  update(dt: number) {
    this.t += dt;
    if ((this.think -= dt) > 0) return;
    this.think = 1; // decide once a second
    this.economy();
    this.military();
  }

  private count(key: string) { return this.g.blds.filter((b) => b.team === this.me && b.type === key && b.dying < 0).length; }
  private home(): [number, number] {
    const hq = this.g.blds.find((b) => b.team === this.me && b.type === 'fieldCommand') ?? this.g.blds.find((b) => b.team === this.me && b.max > 0);
    return hq ? [hq.cx + 1, hq.cy + 1] : this.g.terrain.bases[this.me];
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
    // start the next structure when nothing is going up
    const next = this.nextStructure();
    if (sites.length < crew.length && next && p.credits > next.cost * 0.3 + sites.length * 800) { // one site per builder
      if (this.place(next)) this.placeFails = 0; else this.placeFails = Math.min(this.placeFails + 1, 8);
    }
    // keep builders around, then train with what's left after saving for building
    // while the army is small, put soldiers first and let buildings wait their turn
    const armySize = g.units.filter((u) => u.team === this.me && u.def.weapon).length, small = armySize < this.cfg.wave;
    const q = p.queues, saving = sites.reduce((s, b) => s + (g.costOf(b.type) * (1 - b.rise)), 0) * (small ? 0.3 : 1) + (small ? 0 : (next?.cost ?? 0) * 0.5);
    const spare = p.credits - saving;
    const mine = (k: string) => g.units.filter((u) => u.team === this.me && u.type === k).length;
    if (g.owns('fieldCommand', this.me) && !q.fieldCommand.length && crew.length < (this.cfg.salvagers > 2 ? 2 : 1) + (p.credits > 2500 ? 1 : 0) + (p.credits > 5000 ? 1 : 0) && this.t >= this.nextBuilder) {
      q.fieldCommand.push({ def: DEF.builder, spent: 0 }); this.nextBuilder = this.t + 45; // lost one? wait before buying another
    }
    if (g.owns('depot', this.me) && !q.depot.length) {
      const salvage = mine('harvester') < this.cfg.salvagers + Math.max(0, this.count('scrapyard') - 2) && this.t >= this.nextSalvager;
      if (salvage) this.nextSalvager = this.t + 60; // lost one? wait a while before buying the next
      // a mixed army: mostly tanks, a scout or two, and field guns once there's a workshop
      const enemyAir = g.units.filter((u) => u.team === this.foe && u.def.air).length; // seen aircraft? bring flak
      const pick = salvage ? DEF.harvester : mine('scout') < 1 ? DEF.scout
        : mine('flak') < Math.min(6, Math.ceil(enemyAir / 2)) ? DEF.flak
        : g.owns('foundry', this.me) && mine('juggernaut') < Math.ceil(mine('tank') / 3) ? DEF.juggernaut
        : g.owns('workshop', this.me) && mine('artillery') < Math.ceil(mine('tank') / 3) ? DEF.artillery : DEF.tank;
      if (salvage || spare > pick.cost + 100) q.depot.push({ def: pick, spent: 0 });
    }
    if (g.owns('airfield', this.me) && !q.airfield.length && mine('gunship') < 2 + Math.floor(this.t / 300) && spare > 1600) q.airfield.push({ def: DEF.gunship, spent: 0 });
    const infantryCap = this.cfg.infantry + Math.floor(this.t / 120) * 2; // armies swell as the game goes on
    if (g.owns('barracks', this.me) && !q.barracks.length && mine('rifle') + mine('rocket') + mine('grenadier') < infantryCap && spare > 150) {
      const rockets = mine('rocket') < mine('rifle') / 2 && spare > 350; // one rocket soldier for every two riflemen
      const grenades = g.owns('hospital', this.me) && mine('grenadier') < mine('rifle') / 3 && spare > 300; // and a grenadier for every three
      q.barracks.push({ def: grenades ? DEF.grenadier : rockets ? DEF.rocket : DEF.rifle, spent: 0 });
    }
  }

  private nextStructure(): BuildDef | null {
    const pw = this.g.powers[this.me];
    if (pw.made - pw.used < 25) return DEF.generator;
    // foundries earn from spare power: keep enough surplus to feed them (a reactor once affordable)
    const foundries = this.count('foundry');
    if (foundries && pw.made - pw.used < FOUNDRY_POWER * foundries) return this.g.owns('workshop', this.me) && this.g.prods[this.me].credits > 4500 ? DEF.reactor : DEF.generator;
    if (!this.count('fieldCommand') && this.count('barracks') && this.g.prods[this.me].credits > 1200) return DEF.fieldCommand; // no HQ (or lost it): build one
    const [hx, hy] = this.home();
    if (this.g.terrain.oil.some((o) => o.found && !o.tapped && Math.hypot(o.cx - hx, o.cy - hy) < 30)) return DEF.derrick;
    for (const [key, n] of WANT) {
      const d = DEF[key];
      if ((key === 'guardTower' || key === 'emplacement' || key === 'flakTower') && n > this.cfg.towers + (this.t > 900 ? 1 : 0)) continue;
      if (this.count(key) < n && (d.needs ?? []).every((k) => this.g.owns(k, this.me))) return d;
    }
    // the list is done: keep sprawling while there's money, adding whatever is scarcest
    if (this.g.prods[this.me].credits < 3000) return null;
    const SPRAWL: [string, number][] = [['foundry', 1], ['generator', 1.5], ['barracks', 0.6], ['depot', 0.5], ['guardTower', 1], ['emplacement', 1], ['flakTower', 0.8], ['scrapyard', 0.5], ['hospital', 0.25], ['workshop', 0.25], ['airfield', 0.3], ['battery', 0.3], ['radar', 0.2]];
    const pick = SPRAWL.filter(([k]) => (DEF[k].needs ?? []).every((n) => this.g.owns(n, this.me))).sort((a, b) => this.count(a[0]) / a[1] - this.count(b[0]) / b[1])[0];
    return pick ? DEF[pick[0]] : null;
  }

  // Find somewhere for a finished structure: defences lean toward the player, the rest sit close.
  private place(d: BuildDef): boolean {
    const g = this.g, [hx, hy] = this.home();
    if (d.key === 'derrick') {
      const o = g.terrain.oil.filter((x) => x.found && !x.tapped).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0];
      if (!o) return false;
      g.tapSeep(o, this.me);
      return true;
    }
    const [px, py] = g.terrain.bases[this.foe], toward = Math.atan2(py - hy, px - hx);
    const defence = d.key === 'guardTower' || d.key === 'emplacement' || d.key === 'flakTower' || d.key === 'battery';
    const size = g.blds.filter((b) => b.team === this.me && b.max > 0).length;
    if (d.key === 'scrapyard' && this.count('scrapyard') >= 1) { // an outpost by the nearest untouched scrap
      const t = g.terrain; let best: [number, number] | null = null, bd = 1e9;
      for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) {
        const dd = Math.hypot(x - hx, y - hy);
        if (t.scrap[t.idx(x, y)] > 200 && dd > 10 && dd < 45 && dd < bd && !g.blds.some((b) => b.type === 'scrapyard' && Math.hypot(b.cx - x, b.cy - y) < 10)) { bd = dd; best = [x, y]; }
      }
      if (best && g.autoPlace('scrapyard', this.me, best[0], best[1] - 3, true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
    }
    for (let k = 0; k < 6; k++) {
      const a = defence ? toward + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const r = (defence ? 6 + Math.random() * 3 : 3 + Math.random() * 5) + size * 0.35 + this.placeFails * 1.5; // the base spreads as it grows
      if (g.autoPlace(d.key, this.me, Math.round(hx + Math.cos(a) * r), Math.round(hy + Math.sin(a) * r), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
    }
    return false;
  }

  private military() {
    const g = this.g, [hx, hy] = this.home();
    const army = g.units.filter((u) => u.team === this.me && u.def.weapon && !u.enter);
    const idle = army.filter((u) => !u.goal && !u.path.length && !u.forced);
    // defend: anyone of yours near the base gets everything thrown at them
    // defend with the units at home only: an attack under way keeps going
    for (const u of this.raiders) if (!g.units.includes(u)) this.raiders.delete(u);
    const homeGuard = army.filter((u) => !this.raiders.has(u) && Math.hypot(u.x / CELL - hx, u.y / CELL - hy) < 30);
    const intruder = g.units.find((u) => u.team === this.foe && Math.hypot(u.x / CELL - hx, u.y / CELL - hy) < 15);
    if (intruder) { g.orderUnits(homeGuard.filter((u) => !u.target), intruder.x, intruder.y, true); return; }
    // grab capture sites with spare infantry
    if (this.cfg.capture) {
      const spare = idle.filter((u) => u.type === 'rifle');
      if (spare.length >= 4) {
        const site = g.blds.filter((b) => g.isCapturable(b) && b.team !== this.me && b.garrison === 0 && !g.units.some((u) => u.enter === b))
          .sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0];
        if (site && Math.hypot(site.cx - hx, site.cy - hy) < N * 0.55) for (const u of spare.slice(0, 2)) g.sendIn(u, site);
      }
    }
    // scout now and then with one tank: it may strike oil
    if (this.t > this.nextScout) {
      this.nextScout = this.t + 90;
      const scout = idle.find((u) => u.type === 'scout') ?? idle.find((u) => u.type === 'tank');
      if (scout) { const a = Math.random() * Math.PI * 2, r = N * (0.15 + Math.random() * 0.25); g.orderUnits([scout], (hx + Math.cos(a) * r) * CELL, (hy + Math.sin(a) * r) * CELL, true); }
    }
    // attack in waves at your nearest building
    // raiders that finished their job come home and join the next wave
    for (const u of this.raiders) if (!u.goal && !u.path.length && !u.target) this.raiders.delete(u);
    const want = this.cfg.wave + Math.floor(this.t / 300) * 2; // waves grow as the game goes on
    if (this.t >= this.nextWave && idle.length >= want) {
      // aim past the gun towers at the base itself (attack-move still fights whatever is on the way)
      const theirs = g.blds.filter((b) => b.team === this.foe && b.max > 0 && b.dying < 0), guns = ['guardTower', 'emplacement'];
      const target = (theirs.some((b) => !guns.includes(b.type)) ? theirs.filter((b) => !guns.includes(b.type)) : theirs).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0] ?? g.units.find((u) => u.team === this.foe);
      if (!target) return;
      const [tx, ty] = g.posOf(target);
      const go = idle.filter((u) => u.type !== 'scout');
      for (const u of go) this.raiders.add(u);
      g.orderUnits(go, tx, ty, true, true);
      if (this.foe === 0) g.warn('Enemy forces advancing on your base!', [tx, ty]);
      this.nextWave = this.t + this.cfg.gap;
    }
  }
}
