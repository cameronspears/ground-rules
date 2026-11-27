// The economy: what can be built, what it costs, how long it takes, and what power it makes
// or uses. Training drains credits gradually while it works, and slows to half speed when the
// base uses more power than it makes. Structures are put up on site by Builders (game.ts);
// their time is for one Builder working alone.

export interface BuildDef {
  key: string; name: string; kind: 'structure' | 'unit';
  cost: number; time: number; // credits, seconds at full power
  power?: number;             // structures: + makes power, - uses it
  w?: number; h?: number;     // structures: footprint in cells
  needs?: string[];           // structures you must own first (units too: the Field Gun needs an Arsenal)
  from?: string;              // units: which building trains them
}

export const BUILDS: BuildDef[] = [
  // In the order the menu shows them: buildings as a game unfolds (defences together on the last row), units by
  // where they are trained, cheapest first.
  { key: 'fieldCommand', name: 'Field Command', kind: 'structure', cost: 1500, time: 22, w: 3, h: 3 }, // makes no power: its lane is land (it made 20, and was built for it)
  { key: 'generator', name: 'Generator', kind: 'structure', cost: 400, time: 10, power: 100, w: 2, h: 2 },
  { key: 'scrapyard', name: 'Scrapyard', kind: 'structure', cost: 1500, time: 20, power: -30, w: 3, h: 2, needs: ['generator'] },
  { key: 'barracks', name: 'Barracks', kind: 'structure', cost: 500, time: 14, power: -20, w: 2, h: 2, needs: ['generator'] },
  { key: 'depot', name: 'Vehicle Depot', kind: 'structure', cost: 1800, time: 24, power: -30, w: 3, h: 3, needs: ['scrapyard'] },
  // power depends on the strike: 100 on a small seep, 200 on a big one. Must sit on struck oil.
  { key: 'derrick', name: 'Derrick', kind: 'structure', cost: 1200, time: 12, power: 100, w: 2, h: 2 },
  { key: 'workshop', name: 'Arsenal', kind: 'structure', cost: 1000, time: 16, power: -20, w: 3, h: 3, needs: ['depot'] },
  { key: 'radar', name: 'Radar Tower', kind: 'structure', cost: 1200, time: 16, power: -40, w: 2, h: 2, needs: ['fieldCommand'] },
  { key: 'airfield', name: 'Airfield', kind: 'structure', cost: 2000, time: 26, power: -40, w: 3, h: 3, needs: ['depot', 'fieldCommand'] },
  { key: 'reactor', name: 'Fusion Reactor', kind: 'structure', cost: 2400, time: 40, power: 400, w: 3, h: 3, needs: ['workshop'] },
  { key: 'provingGround', name: 'Proving Ground', kind: 'structure', cost: 4000, time: 40, power: -100, w: 3, h: 3, needs: ['workshop'] },
  { key: 'empCannon', name: 'EMP Cannon', kind: 'structure', cost: 5000, time: 45, power: -150, w: 3, h: 3, needs: ['radar', 'workshop'] }, // a pulse that switches machines off for a while: the push's door-opener
  { key: 'wall', name: 'Sandbag Wall', kind: 'structure', cost: 30, time: 3, w: 1, h: 1 }, // drag to plan a line; builders lay it block by block
  // not a building: a drag along your border lays a whole defence line (towers every few squares, sandbags between); priced by length
  { key: 'line', name: 'Defence Line', kind: 'structure', cost: 0, time: 0, w: 1, h: 1, needs: ['barracks'] },
  // Fighting units and the towers that answer them were halved in price twice (the second time Nov 2026, as the biggest
  // fights were 30 to 130 units at minute 24): the same money fields four times the army it did, matchups unchanged.
  { key: 'guardTower', name: 'Guard Tower', kind: 'structure', cost: 175, time: 12, power: -10, w: 1, h: 1, needs: ['barracks'] },
  { key: 'flakTower', name: 'Flak Tower', kind: 'structure', cost: 275, time: 12, power: -20, w: 1, h: 1, needs: ['barracks'] },
  { key: 'emplacement', name: 'Cannon Emplacement', kind: 'structure', cost: 350, time: 18, power: -25, w: 2, h: 2, needs: ['depot'] },
  { key: 'builder', name: 'Builder', kind: 'unit', cost: 600, time: 10, from: 'fieldCommand' },
  { key: 'harvester', name: 'Salvager', kind: 'unit', cost: 1200, time: 12, from: 'scrapyard' },
  { key: 'rifle', name: 'Rifleman', kind: 'unit', cost: 30, time: 4, from: 'barracks' },
  { key: 'rocket', name: 'Rocket Soldier', kind: 'unit', cost: 60, time: 6, from: 'barracks' },
  { key: 'grenadier', name: 'Grenadier', kind: 'unit', cost: 60, time: 6, from: 'barracks' },
  { key: 'scout', name: 'Scout Buggy', kind: 'unit', cost: 110, time: 7, from: 'depot' },
  { key: 'quad', name: 'Quad Gun', kind: 'unit', cost: 175, time: 9, from: 'depot' },
  { key: 'tank', name: 'Battle Tank', kind: 'unit', cost: 200, time: 11, from: 'depot' },
  { key: 'artillery', name: 'Field Gun', kind: 'unit', cost: 300, time: 15, from: 'depot', needs: ['workshop'] },
  { key: 'gunship', name: 'Gunship', kind: 'unit', cost: 350, time: 16, from: 'airfield' },
  { key: 'bomber', name: 'Bomber', kind: 'unit', cost: 400, time: 18, from: 'airfield' },
  { key: 'colossus', name: 'Colossus', kind: 'unit', cost: 3000, time: 150, from: 'provingGround' },
];
// Times follow simple rules, so cost and time always agree:
// - a building takes 4 s plus 1 s per $100 for one builder (defences go up faster: 3 s plus 1 s per $150);
// - a factory turns money into units at a steady rate, so a unit takes its cost divided by that rate.
export const MARAUDER = 5; // the marauders' side: hostile to everyone, never builds or expands
export const LAND_RATE = 0.025; // dollars a second for each square of territory you hold
export const FACTORY_RATE: Record<string, number> = { barracks: 35, depot: 75, scrapyard: 75, airfield: 90, provingGround: 120, fieldCommand: 60 };
const QUICK = new Set(['guardTower', 'emplacement', 'flakTower']);
for (const b of BUILDS) b.time = b.key === 'wall' || b.key === 'line' ? 0 : b.kind === 'structure' ? Math.round(QUICK.has(b.key) ? 3 + b.cost / 150 : 4 + b.cost / 100) : Math.max(1, Math.round(b.cost / FACTORY_RATE[b.from!]));
export const DEF: Record<string, BuildDef> = Object.fromEntries(BUILDS.map((b) => [b.key, b]));
// not on the build panel: a fallen bridge is rebuilt where it stood (any side's builders may)
DEF.bridge = { key: 'bridge', name: 'Bridge', kind: 'structure', cost: 1200, time: 40, w: 2, h: 1 };
export const POWER: Record<string, number> = { powerPlant: 250, dam: 400, ...Object.fromEntries(BUILDS.filter((b) => b.power).map((b) => [b.key, b.power!])) };

// The Orbital Uplink charges a strike every UPLINK_TIME seconds it is held.
// A flak tower under its side's radar holds one interceptor, for an orbital strike or EMP pulse coming down within
// INTERCEPT_RANGE squares of it, and reloads it in INTERCEPT_RELOAD seconds.
export const UPLINK_TIME = 180, INTERCEPT_RANGE = 10, INTERCEPT_RELOAD = 120;
// The EMP Cannon charges a pulse every EMP_TIME seconds (slower short of power); it switches off every vehicle, aircraft,
// defence and radar within EMP_R squares for EMP_STUN seconds, friend or foe. Soldiers don't notice.
export const EMP_TIME = 240, EMP_R = 6, EMP_STUN = 20;
export const CHARGE: Record<string, number> = { uplink: UPLINK_TIME, empCannon: EMP_TIME }; // buildings you aim: select, then right-click a target
export const SCRAP_LOAD = 700, HARVEST_RATE = 70, UNLOAD_RATE = 280; // per Salvager trip / per second

export interface Job { def: BuildDef; spent: number; at?: object } // at: the factory it was ordered from (a selected Barracks): it comes out there

export class Production {
  credits = 6000;
  queues: Record<string, Job[]> = { barracks: [], depot: [], scrapyard: [], fieldCommand: [], airfield: [], provingGround: [] }; // each line trains at its own kind of building (salvagers where they unload)
  repeat: Record<string, boolean> = {}; // REPEAT, set on a factory: each fighting unit it finishes goes back on its queue, so that factory never falls idle
  last: Record<string, BuildDef> = {}; // each line's last fighting unit: what REPEAT starts again on an empty queue

  progress(job: Job | null | undefined) { return job ? job.spent / job.def.cost : 0; }

  // Spend toward each active job; returns units that finished this tick. Every extra factory of a
  // kind adds to that line's speed (two Barracks train twice as fast).
  tick(dt: number, speed: number, factories: (key: string) => number): Job[] {
    const done: Job[] = [];
    const work = (job: Job, n: number) => {
      const want = (job.def.cost / job.def.time) * dt * speed * n;
      const pay = Math.min(want, this.credits, job.def.cost - job.spent);
      this.credits -= pay; job.spent += pay;
      return job.spent >= job.def.cost;
    };
    for (const [from, q] of Object.entries(this.queues)) {
      if (this.repeat[from] && !q.length && this.last[from]) q.push({ def: this.last[from], spent: 0 });
      const n = q.length ? factories(from) : 0;
      if (!n) continue;
      if (work(q[0], n)) { const j = q.shift()!, d = j.def, fights = d.key !== 'builder' && d.key !== 'harvester'; done.push(j); if (fights) this.last[from] = d; if (this.repeat[from] && fights) q.push({ def: d, spent: 0, at: j.at }); } // (builders and salvagers don't: they'd pile up for ever)
    }
    return done;
  }

  // take one of a unit off its factory's queue (what you right-clicked): the last one added, so one being built goes last
  dequeue(from: string, def: BuildDef) {
    const q = this.queues[from], k = q.map((j) => j.def).lastIndexOf(def), job = k >= 0 ? q.splice(k, 1)[0] : undefined;
    if (job) this.credits += Math.round(job.spent);
    if (!q.length) delete this.last[from]; // took the last one off: this factory stops, even on REPEAT
  }
}
