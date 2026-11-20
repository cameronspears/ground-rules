// The economy: what can be built, what it costs, how long it takes, and what power it makes
// or uses. Training drains credits gradually while it works, and slows to half speed when the
// base uses more power than it makes. Structures are put up on site by Builders (game.ts);
// their time is for one Builder working alone.

export interface BuildDef {
  key: string; name: string; kind: 'structure' | 'unit';
  cost: number; time: number; // credits, seconds at full power
  power?: number;             // structures: + makes power, - uses it
  w?: number; h?: number;     // structures: footprint in cells
  needs?: string[];           // structures you must own first
  from?: string;              // units: which building trains them
}

export const BUILDS: BuildDef[] = [
  { key: 'generator', name: 'Generator', kind: 'structure', cost: 300, time: 10, power: 100, w: 2, h: 2 },
  { key: 'scrapyard', name: 'Scrapyard', kind: 'structure', cost: 1500, time: 20, power: -30, w: 3, h: 2, needs: ['generator'] },
  { key: 'barracks', name: 'Barracks', kind: 'structure', cost: 500, time: 14, power: -20, w: 2, h: 2, needs: ['generator'] },
  { key: 'depot', name: 'Vehicle Depot', kind: 'structure', cost: 1800, time: 24, power: -30, w: 3, h: 3, needs: ['scrapyard'] },
  // power depends on the strike: 100 on a small seep, 200 on a big one. Must sit on struck oil.
  { key: 'derrick', name: 'Derrick', kind: 'structure', cost: 600, time: 12, power: 100, w: 2, h: 2 },
  { key: 'guardTower', name: 'Guard Tower', kind: 'structure', cost: 500, time: 12, power: -10, w: 1, h: 1, needs: ['barracks'] },
  { key: 'emplacement', name: 'Cannon Emplacement', kind: 'structure', cost: 1000, time: 18, power: -25, w: 2, h: 2, needs: ['depot'] },
  { key: 'fieldCommand', name: 'Field Command', kind: 'structure', cost: 3000, time: 40, power: 20, w: 3, h: 3 },
  { key: 'builder', name: 'Builder', kind: 'unit', cost: 600, time: 10, from: 'fieldCommand' },
  { key: 'rifle', name: 'Rifleman', kind: 'unit', cost: 100, time: 4, from: 'barracks' },
  { key: 'tank', name: 'Battle Tank', kind: 'unit', cost: 800, time: 11, from: 'depot' },
  { key: 'harvester', name: 'Salvager', kind: 'unit', cost: 1200, time: 12, from: 'depot' },
];
export const DEF: Record<string, BuildDef> = Object.fromEntries(BUILDS.map((b) => [b.key, b]));
export const POWER: Record<string, number> = { fieldCommand: 20, ...Object.fromEntries(BUILDS.filter((b) => b.power).map((b) => [b.key, b.power!])) };

export const SCRAP_LOAD = 400, HARVEST_RATE = 40, UNLOAD_RATE = 160; // per Salvager trip / per second

export interface Job { def: BuildDef; spent: number }

export class Production {
  credits = 5000;
  queues: Record<string, Job[]> = { barracks: [], depot: [], fieldCommand: [] };

  progress(job: Job | null | undefined) { return job ? job.spent / job.def.cost : 0; }

  // Spend toward each active job; returns units that finished this tick.
  tick(dt: number, speed: number, hasFactory: (key: string) => boolean): BuildDef[] {
    const done: BuildDef[] = [];
    const work = (job: Job) => {
      const want = (job.def.cost / job.def.time) * dt * speed;
      const pay = Math.min(want, this.credits, job.def.cost - job.spent);
      this.credits -= pay; job.spent += pay;
      return job.spent >= job.def.cost;
    };
    for (const [from, q] of Object.entries(this.queues)) {
      if (!q.length || !hasFactory(from)) continue;
      if (work(q[0])) done.push(q.shift()!.def);
    }
    return done;
  }

  dequeue(from: string) {
    const q = this.queues[from], job = q.pop();
    if (job) this.credits += Math.round(job.spent);
  }
}
