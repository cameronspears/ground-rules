// A super-unit against a small defended base, in the real game with no screen: the Hive (Swarm) and the Colossus
// (army) each attack the same few buildings and defences, alone, for two minutes.
//   node tools/swarm-siege.mjs
// Prints what each knocked down, and how much health it had left.
import { boot } from './headless.mjs';
const { game: g } = await boot({ seed: 777, rseed: 1, side: 'army', foe: 'swarm' });
g.menu('deploy'); g.ais = []; g.checkEnd = () => {}; g.saveGame = async () => {};
for (const c of g.camps ?? []) c.done = true;
const CELL = 24, t = g.terrain;
const BASE = [['barracks', 0, 0], ['generator', 4, 0], ['depot', 0, 4], ['guardTower', 7, 3], ['emplacement', 7, 5], ['flakTower', 7, 8], ['scrapyard', 0, 9]];
function siege(attacker, team, defenders) {
  for (const u of [...g.units]) g.drop(u);
  g.blds = g.blds.filter((b) => b.team === 2 && !b.type.startsWith('dam'));
  const cx = Math.round((t.bases[0][0] + t.bases[1][0]) / 2), cy = Math.round((t.bases[0][1] + t.bases[1][1]) / 2);
  for (let y = cy - 30; y <= cy + 30; y++) for (let x = cx - 40; x <= cx + 40; x++) { const i = t.idx(x, y); t.type[i] = 0; t.elev[i] = 0; t.forest[i] = 0; t.occupied[i] = 0; }
  for (const [k, dx, dy] of BASE) { const d = g.catalog(defenders)[k]; g.addBld(k, defenders, cx + dx, cy - 6 + dy, d.w, d.h, d.name); }
  const u = g.addUnit(attacker, team, (cx - 20) * CELL, cy * CELL);
  u.amove = true; u.goal = [(cx + 4) * CELL, cy * CELL]; u.path = g.route(u, ...u.goal);
  const start = g.blds.filter((b) => b.team === defenders).length;
  for (let i = 0; i < 30 * 120 && g.alive(u); i++) { g.vis.fill(2); g.step(1 / 30); if (!u.goal && !u.path.length && !u.target) { u.amove = true; u.goal = [(cx + 4) * CELL, cy * CELL]; u.path = g.route(u, ...u.goal); } }
  const left = g.blds.filter((b) => b.team === defenders && b.dying < 0);
  return `${g.unitDef(attacker, team).name}: knocked down ${start - left.length} of ${start} (${BASE.filter(([k]) => !left.some((b) => b.type === k)).map(([k]) => k).join(', ') || 'nothing'}), ${g.alive(u) ? Math.round((100 * u.hp) / u.def.hp) + '% health left' : 'destroyed'}`;
}
console.log(siege('colossus', 0, 1));
console.log(siege('colossus', 1, 0));
process.exit(0);
