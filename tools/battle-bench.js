// Big on-screen battle for measuring draw cost. In the page on the dev server:
//   const B = await import('/tools/battle-bench.js?' + Date.now()); B.setup(); B.bench(300)
// setup() puts ~200 units (yours against the enemy) in the duel arena with the camera on them; bench(n) runs
// n frames of update + render and reports the median and 90th-percentile ms per frame for each.
import * as D from '/tools/duel.js';
import { N } from '/src/terrain.ts';

const g = window.game, CELL = 24;
const X = N / 2 - 80, Y = N / 2;
const MIX = { tank: 14, juggernaut: 4, rifle: 30, rocket: 16, grenadier: 14, scout: 6, artillery: 6, flak: 4, gunship: 6 };

export function setup(seed = 1) {
  D.setup();
  let s = seed; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); // same fight every run
  g.units = g.units.filter((u) => u.team !== 0 && u.team !== 1 || Math.hypot(u.x / CELL - X, u.y / CELL - Y) > 60);
  for (const [team, face] of [[0, 1], [1, -1]]) {
    let i = 0;
    for (const [k, n] of Object.entries(MIX)) for (let j = 0; j < n; j++, i++) {
      const u = g.addUnit(k, team, (X - face * (8 + (i % 6) * 1.2)) * CELL, (Y - 12 + Math.floor(i / 6) * 1.1) * CELL);
      u.heading = u.tHead = face > 0 ? 0 : Math.PI;
    }
  }
  const us = (t) => g.units.filter((u) => u.team === t && Math.hypot(u.x / CELL - X, u.y / CELL - Y) < 30);
  g.orderUnits(us(0), (X + 10) * CELL, Y * CELL, true);
  g.orderUnits(us(1), (X - 10) * CELL, Y * CELL, true);
  g.centre(X * CELL, Y * CELL); g.vx = g.goalX; g.vy = g.goalY;
  g.state = 'play';
}

export function bench(n = 300) {
  const up = [], dr = [];
  for (let i = 0; i < n; i++) {
    let t = performance.now(); g.update(1 / 20); up.push(performance.now() - t);
    t = performance.now(); g.render(); dr.push(performance.now() - t);
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length * p)] * 100) / 100; };
  return { units: g.units.filter((u) => Math.hypot(u.x / CELL - X, u.y / CELL - Y) < 40).length, puffs: g.puffs.length, update: [q(up, 0.5), q(up, 0.9)], render: [q(dr, 0.5), q(dr, 0.9)] };
}

// The draw cost of the hit effects alone: each frame is drawn twice, with fallen soldiers, hit flashes and recoil
// on and with them off (alternating which goes first), so a busy machine slows both alike.
export function effectsCost(n = 200) {
  const on = [], off = [];
  const draw = (fx) => {
    const keep = g.bodies, f = g.units.map((u) => [u.flashAt, u.firedAt]);
    if (!fx) { g.bodies = []; for (const u of g.units) { u.flashAt = -99; u.firedAt = -99; } }
    const t = performance.now(); g.render(); const ms = performance.now() - t;
    if (!fx) { g.bodies = keep; g.units.forEach((u, i) => { [u.flashAt, u.firedAt] = f[i]; }); }
    return ms;
  };
  for (let i = 0; i < n; i++) {
    g.update(1 / 20);
    if (i % 2) { on.push(draw(true)); off.push(draw(false)); } else { off.push(draw(false)); on.push(draw(true)); }
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length * p)] * 100) / 100; };
  return { on: [q(on, 0.5), q(on, 0.9)], off: [q(off, 0.5), q(off, 0.9)], bodies: g.bodies.length };
}
