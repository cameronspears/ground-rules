// The computer opponent. It plays by the same rules as you: it spends credits on the same
// buildings, keeps its power up, harvests scrap, drills oil it stumbles on, trains an army,
// defends its base and attacks in waves. Difficulty changes its income and build speed, how big
// its waves are and how soon they come, and whether it goes after capture sites.
import type { Game } from './game';
import { DEF, BuildDef } from './build';
import { CELL } from './terrain';

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: Record<Level, { rate: number; wave: number; first: number; gap: number; salvagers: number; capture: boolean; towers: number; infantry: number }> = {
  easy: { rate: 0.7, wave: 6, first: 330, gap: 220, salvagers: 1, capture: false, towers: 1, infantry: 8 },
  normal: { rate: 1, wave: 9, first: 250, gap: 170, salvagers: 2, capture: true, towers: 2, infantry: 12 },
  hard: { rate: 1.35, wave: 12, first: 190, gap: 125, salvagers: 3, capture: true, towers: 3, infantry: 16 },
};

// What the enemy wants to own, in rough priority order. Power is handled first, separately.
const WANT: [string, number][] = [['scrapyard', 1], ['barracks', 1], ['depot', 1], ['guardTower', 1], ['scrapyard', 2], ['emplacement', 1], ['guardTower', 2], ['emplacement', 2], ['guardTower', 3], ['emplacement', 3]];

export class AI {
  t = 0; think = 0; nextWave: number; nextScout = 60; placeFails = 0;
  cfg: (typeof LEVELS)[Level];

  constructor(private g: Game, level: Level) {
    this.cfg = LEVELS[level];
    g.aiRate = this.cfg.rate;
    this.nextWave = this.cfg.first;
  }

  update(dt: number) {
    this.t += dt;
    if ((this.think -= dt) > 0) return;
    this.think = 1; // decide once a second
    this.economy();
    this.military();
  }

  private count(key: string) { return this.g.blds.filter((b) => b.team === 1 && b.type === key && b.dying < 0).length; }
  private home(): [number, number] {
    const hq = this.g.blds.find((b) => b.team === 1 && b.type === 'fieldCommand') ?? this.g.blds.find((b) => b.team === 1 && b.max > 0);
    return hq ? [hq.cx + 1, hq.cy + 1] : this.g.terrain.bases[1];
  }

  private economy() {
    const g = this.g, p = g.prods[1];
    const sites = g.blds.filter((b) => b.team === 1 && b.rise < 1 && b.dying < 0);
    const crew = g.builders(1);
    // every site gets a builder; spare builders help out
    for (const site of sites) if (!crew.some((u) => u.buildSite === site)) { const free = crew.find((u) => !u.buildSite); if (free) g.assignSite(free, site); }
    for (const u of crew) if (!u.buildSite && sites[0]) g.assignSite(u, sites[0]);
    // start the next structure when nothing is going up
    const next = this.nextStructure();
    if (!sites.length && crew.length && next && p.credits > next.cost * 0.3) {
      if (this.place(next)) this.placeFails = 0; else this.placeFails = Math.min(this.placeFails + 1, 8);
    }
    // keep builders around, then train with what's left after saving for building
    const q = p.queues, saving = sites.reduce((s, b) => s + (g.costOf(b.type) * (1 - b.rise)), 0) + (next?.cost ?? 0) * 0.5;
    const spare = p.credits - saving;
    const mine = (k: string) => g.units.filter((u) => u.team === 1 && u.type === k).length;
    if (g.owns('fieldCommand', 1) && !q.fieldCommand.length && crew.length < (this.cfg.salvagers > 2 ? 2 : 1)) q.fieldCommand.push({ def: DEF.builder, spent: 0 });
    if (g.owns('depot', 1) && !q.depot.length) {
      const salvage = mine('harvester') < this.cfg.salvagers;
      if (salvage || spare > 900) q.depot.push({ def: salvage ? DEF.harvester : DEF.tank, spent: 0 });
    }
    if (g.owns('barracks', 1) && !q.barracks.length && mine('rifle') < this.cfg.infantry && spare > 150) q.barracks.push({ def: DEF.rifle, spent: 0 });
  }

  private nextStructure(): BuildDef | null {
    const pw = this.g.powers[1];
    if (!this.count('fieldCommand') && this.g.prods[1].credits > 1500) return DEF.fieldCommand; // lost the HQ: rebuild it
    if (pw.made - pw.used < 25) return DEF.generator;
    const [hx, hy] = this.home();
    if (this.g.terrain.oil.some((o) => o.found && !o.tapped && Math.hypot(o.cx - hx, o.cy - hy) < 30)) return DEF.derrick;
    for (const [key, n] of WANT) {
      const d = DEF[key];
      if ((key === 'guardTower' || key === 'emplacement') && n > this.cfg.towers) continue;
      if (this.count(key) < n && (d.needs ?? []).every((k) => this.g.owns(k, 1))) return d;
    }
    return null;
  }

  // Find somewhere for a finished structure: defences lean toward the player, the rest sit close.
  private place(d: BuildDef): boolean {
    const g = this.g, [hx, hy] = this.home();
    if (d.key === 'derrick') {
      const o = g.terrain.oil.filter((x) => x.found && !x.tapped).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0];
      if (!o) return false;
      g.tapSeep(o, 1);
      return true;
    }
    const [px, py] = g.terrain.bases[0], toward = Math.atan2(py - hy, px - hx);
    const defence = d.key === 'guardTower' || d.key === 'emplacement';
    for (let k = 0; k < 6; k++) {
      const a = defence ? toward + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const r = (defence ? 6 + Math.random() * 3 : 3 + Math.random() * 5) + this.placeFails * 1.5; // crowded? look further out
      if (g.autoPlace(d.key, 1, Math.round(hx + Math.cos(a) * r), Math.round(hy + Math.sin(a) * r), true)) { g.startSite(g.blds[g.blds.length - 1]); return true; }
    }
    return false;
  }

  private military() {
    const g = this.g, [hx, hy] = this.home();
    const army = g.units.filter((u) => u.team === 1 && u.def.weapon && !u.enter);
    const idle = army.filter((u) => !u.goal && !u.path.length && !u.forced);
    // defend: anyone of yours near the base gets everything thrown at them
    const intruder = g.units.find((u) => u.team === 0 && Math.hypot(u.x / CELL - hx, u.y / CELL - hy) < 15);
    if (intruder) { g.orderUnits(army.filter((u) => !u.target), intruder.x, intruder.y, true); return; }
    // grab capture sites with spare infantry
    if (this.cfg.capture) {
      const spare = idle.filter((u) => u.type === 'rifle');
      if (spare.length >= 4) {
        const site = g.blds.filter((b) => g.isCapturable(b) && b.team !== 1 && b.garrison === 0 && !g.units.some((u) => u.enter === b))
          .sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0];
        if (site && Math.hypot(site.cx - hx, site.cy - hy) < 70) for (const u of spare.slice(0, 2)) g.sendIn(u, site);
      }
    }
    // scout now and then with one tank: it may strike oil
    if (this.t > this.nextScout) {
      this.nextScout = this.t + 90;
      const scout = idle.find((u) => u.type === 'tank');
      if (scout) { const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 20; g.orderUnits([scout], (hx + Math.cos(a) * r) * CELL, (hy + Math.sin(a) * r) * CELL, true); }
    }
    // attack in waves at your nearest building
    if (this.t >= this.nextWave && idle.length >= this.cfg.wave) {
      const target = g.blds.filter((b) => b.team === 0 && b.max > 0).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0] ?? g.units.find((u) => u.team === 0);
      if (!target) return;
      const [tx, ty] = g.posOf(target);
      g.orderUnits(idle, tx, ty, true);
      g.warn('Enemy forces advancing on your base!');
      this.nextWave = this.t + this.cfg.gap;
    }
  }
}
