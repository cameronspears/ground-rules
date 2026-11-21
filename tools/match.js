// Computer-vs-computer match recorder, run in the browser on the dev server:
//   const M = await import('/tools/match.js'); await M.start('colossus', 'colossus'); await M.run(40); M.report()
// start(plan1, plan0) deploys with the computer on both sides; run(min) plays on to that minute (call again if
// the browser's tool call times out); report() gives armies, worth, hubs, land and cash every 3 minutes, and losses
// every 5 minutes split by where each side's units died (own land, enemy land, neutral).
const g = window.game, CELL = 25;
const rec = { min: [], deaths: [] };
let prev = new Map();
const job = new Map(), born = new Map();

export async function start(plan1 = 'random', plan0) {
  g.plan = plan1; g.menu('deploy');
  const { AI } = await import('/src/ai.ts');
  g.ais.push(new AI(g, g.level, 0, plan0));
  return g.ais.map((a) => [a.me, a.plan]);
}

function sample() {
  const r = { m: Math.round(g.time / 60) };
  for (const t of [0, 1]) {
    const a = g.units.filter((u) => u.team === t && u.def.weapon && !['builder', 'harvester'].includes(u.type));
    r['army' + t] = a.length; r['val' + t] = Math.round(a.reduce((s, u) => s + g.costOf(u.type), 0) / 1000);
    r['hubs' + t] = g.blds.filter((b) => b.team === t && b.type === 'fieldCommand' && b.dying < 0).length;
    r['land' + t] = Math.round((g.territory.owner.filter((o) => o === t).length / g.territory.owner.length) * 1000) / 10;
    r['cash' + t] = Math.round(g.prods[t].credits);
  }
  rec.min.push(r);
}

function deaths() {
  const now = new Set(g.units), n = Math.round(Math.sqrt(g.territory.owner.length));
  for (const [u, [x, y]] of prev) if (!now.has(u) && u.hp <= 0) {
    const o = g.territory.owner[Math.floor(y / CELL) * n + Math.floor(x / CELL)];
    rec.deaths.push([Math.round(g.time / 60), u.team, o === u.team ? 'own' : o === 1 - u.team ? 'enemy' : 'neutral', g.costOf(u.type), job.get(u), u.rank, Math.round(g.time - (born.get(u) ?? g.time))]);
  }
  prev = new Map(g.units.filter((u) => u.team < 2 && u.def.weapon).map((u) => [u, [u.x, u.y]]));
  for (const u of g.units) if (!born.has(u)) born.set(u, g.time);
  for (const a of g.ais) for (const u of g.units) if (u.team === a.me && u.def.weapon) // what it was doing, as the computer saw it
    job.set(u, a.wave?.units.includes(u) ? 'wave' : a.clearing?.units.includes(u) ? 'clear' : a.raiders.has(u) ? 'squad' : a.guards.has(u) ? 'guard' : u.goal || u.path.length ? 'sent' : 'idle');
}

export async function run(min, budget = 40000) {
  const t0 = performance.now();
  while (g.time < min * 60 && performance.now() - t0 < budget) {
    const t1 = performance.now();
    for (let k = 0; performance.now() - t1 < 200; k++) {
      g.update(1 / 20);
      if (k % 20 === 0) deaths();
      if (Math.floor(g.time / 60) >= rec.min.length) sample();
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return Math.round(g.time / 60);
}

export function report() {
  const by = {};
  const jobs = {};
  for (const [m, t, w, c, j] of rec.deaths) { const o = (by[Math.floor(m / 5) * 5] ??= {}); o[t + w] = (o[t + w] ?? 0) + c / 1000; jobs[t + j] = (jobs[t + j] ?? 0) + c / 1000; }
  return [
    rec.min.filter((r) => r.m % 3 === 0).map((r) => `m${r.m} army ${r.army0}/${r.army1} worth ${r.val0}k/${r.val1}k hubs ${r.hubs0}/${r.hubs1} land ${r.land0}/${r.land1} cash ${r.cash0}/${r.cash1}`),
    Object.entries(by).map(([k, o]) => `${k}: ` + Object.entries(o).map(([a, b]) => `${a}=${Math.round(b)}k`).join(' ')),
    'rank at death (0/1/2/3): ' + [0, 1, 2, 3].map((r) => rec.deaths.filter((d) => d[5] === r).length).join('/') + ', median life ' + (rec.deaths.map((d) => d[6]).sort((a, b) => a - b)[rec.deaths.length >> 1] ?? 0) + 's',
    'living by rank (0/1/2/3): ' + [0, 1, 2, 3].map((r) => g.units.filter((u) => u.team < 2 && u.def.weapon && u.rank === r).length).join('/'),
    'lost by job: ' + Object.entries(jobs).sort().map(([a, b]) => `${a}=${Math.round(b)}k`).join(' '),
  ];
}
