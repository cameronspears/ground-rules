// Equal-money duels, Swarm against the army, one unit type against another, in the real game with no screen:
//   node tools/swarm-duel.mjs [budget] [pairs, as swarmKey:armyKey,...]
// Prints what each side has left, as a share of the worth it started with. A fair Swarm keeps about what the army
// would keep in the same matchup played army against army.
import { boot } from './headless.mjs';
const budget = Number(process.argv[2] ?? 2400);
const pairs = (process.argv[3] ?? 'rifle:rifle,rocket:rocket,grenadier:grenadier,tank:tank,scout:scout,quad:quad,gunship:gunship,rifle:grenadier,tank:rocket,rocket:tank,gunship:quad,gunship:tank,rifle:quad,tank:artillery').split(',').map((p) => p.split(':'));
const { game: g } = await boot({ seed: 777, rseed: 1, side: 'army', foe: 'swarm' });
g.menu('deploy'); g.ais = []; g.checkEnd = () => {}; g.saveGame = async () => {};
for (const c of g.camps ?? []) c.done = true;
const S = 1, A = 0, CELL = 24, t = g.terrain;
const fight = (sk, ak) => {
  for (const u of [...g.units]) g.drop(u);
  g.blds = g.blds.filter((b) => b.team === 2 && !b.type.startsWith('dam'));
  // an open field halfway between the bases
  const cx = Math.round((t.bases[0][0] + t.bases[1][0]) / 2), cy = Math.round((t.bases[0][1] + t.bases[1][1]) / 2);
  for (let y = cy - 30; y <= cy + 30; y++) for (let x = cx - 40; x <= cx + 40; x++) { const i = t.idx(x, y); t.type[i] = 0; t.elev[i] = 0; t.forest[i] = 0; t.occupied[i] = 0; }
  const spawn = (k, team, x0, face) => {
    const cost = g.costOf(k, team), n = Math.max(1, Math.floor(budget / cost)), r = g.unitDef(k, team).radius, sp = Math.max(8, r * 2 + 5), cols = Math.max(1, Math.ceil(Math.sqrt(n * 0.6))), out = [];
    for (let i = 0; i < n; i++) { const c = i % cols, row = Math.floor(i / cols), rows = Math.ceil(n / cols); const u = g.addUnit(k, team, (cx + x0) * CELL - face * c * sp, cy * CELL + (row - (rows - 1) / 2) * sp); u.heading = u.tHead = face > 0 ? 0 : Math.PI; out.push(u); }
    return { out, worth: n * cost };
  };
  const s = spawn(sk, S, -8, 1), a = spawn(ak, A, 8, -1);
  for (const u of [...s.out, ...a.out]) { u.amove = true; u.goal = [cx * CELL, cy * CELL]; u.path = g.route(u, cx * CELL, cy * CELL); }
  for (let i = 0; i < 30 * 90; i++) { g.vis.fill(2); g.step(1 / 30); if (!g.units.some((u) => u.team === S && !u.mother) || !g.units.some((u) => u.team === A)) break; }
  const left = (team) => g.units.filter((u) => u.team === team && !u.mother).reduce((n, u) => n + (g.costOf(u.type, team) * u.hp) / u.def.hp, 0);
  return [Math.round((100 * left(S)) / s.worth), Math.round((100 * left(A)) / a.worth), s.out.length, a.out.length];
};
console.log(`${budget} a side. Swarm piece against army piece: the share of its worth each keeps (how many each had)`);
for (const [sk, ak] of pairs) {
  const [sp, ap, sn, an] = fight(sk, ak);
  console.log(`  swarm ${sk.padEnd(9)} vs army ${ak.padEnd(9)}  swarm keeps ${String(sp).padStart(3)}%  army keeps ${String(ap).padStart(3)}%   (${sn} v ${an})`);
}
process.exit(0);
