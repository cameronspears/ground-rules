// Defence line check: for a few test lines round your base, what DEF LINE would lay, what it costs, and how well it
// covers the line against each kind of attacker (the share of the line inside the reach of that attacker's counter,
// counting defences you already have). In the running game: (await import('/tools/linecheck.js')).run()
const g = window.game, C = 24;
const COUNTER = { infantry: 'guardTower', vehicles: 'emplacement', aircraft: 'flakTower' };
const T = await import('/src/terrain.ts'), { DEF } = await import('/src/build.ts');

function cover(cells, towers) {
  const out = {};
  for (const [who, key] of Object.entries(COUNTER)) {
    const all = [...towers.filter((w) => w.key === key).map((w) => ({ cx: w.cx, cy: w.cy, w: DEF[key].w, h: DEF[key].h })), ...g.blds.filter((b) => b.team === 0 && b.type === key && b.dying < 0).map((b) => ({ cx: b.cx, cy: b.cy, w: b.w, h: b.h }))];
    let hit = 0;
    for (const [x, y] of cells) if (all.some((o) => Math.hypot(o.cx + o.w / 2 - x - 0.5, o.cy + o.h / 2 - y - 0.5) * C <= g.reachOf(key, 0, (o.cx + o.w / 2) * C, (o.cy + o.h / 2) * C))) hit++;
    out[who] = Math.round((hit / cells.length) * 100) + '%';
  }
  return out;
}
function plan(path) {
  g.linePath = path; g.lineCache = null;
  const p = g.linePlan(), cells = [];
  for (const c of path) if (!cells.some((d) => d[0] === c[0] && d[1] === c[1])) cells.push(c);
  g.linePath = [];
  // the first version, for comparison: a defence every 6 squares in a fixed mix
  const mix = g.sighted.air >= 2 ? ['guardTower', 'emplacement', 'flakTower', 'emplacement', 'flakTower'] : g.sighted.armour >= 4 ? ['emplacement', 'guardTower', 'emplacement', 'flakTower', 'emplacement'] : ['guardTower', 'emplacement', 'guardTower', 'emplacement', 'flakTower'];
  const taken = new Set(), old = [], t = g.terrain;
  const fits = (key, cx, cy) => { const d = DEF[key]; for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) if (taken.has(t.idx(x, y))) return false; return g.placeAt(d, [(cx + d.w / 2) * C, (cy + d.h / 2) * C])[2]; };
  for (let i = 2, k = 0; i < cells.length; i += 6) {
    const key = mix[k % mix.length], d = DEF[key];
    for (const j of [i, i + 1, i - 1, i + 2, i - 2]) { const c = cells[j]; if (!c || !fits(key, c[0], c[1])) continue; for (let y = c[1]; y < c[1] + d.h; y++) for (let x = c[0]; x < c[0] + d.w; x++) taken.add(t.idx(x, y)); old.push({ key, cx: c[0], cy: c[1] }); k++; break; }
  }
  const oc = old.reduce((n, w) => n + DEF[w.key].cost, 0);
  return { now: { towers: p.towers.map((t) => t.key[0]).join(''), towerCost: p.towers.reduce((n, w) => n + DEF[w.key].cost, 0), ...cover(cells, p.towers) }, before: { towers: old.map((t) => t.key[0]).join(''), towerCost: oc, ...cover(cells, old) } };
}
const drop = (b) => { for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) g.terrain.occupied[g.terrain.idx(x, y)] = 0; g.dropBld(b); };
export function run() {
  const fc = g.blds.find((b) => b.team === 0 && b.type === 'fieldCommand'), face = Math.atan2(T.N / 2 - fc.cy, T.N / 2 - fc.cx);
  const arc = (r, span) => { const p = []; for (let k = 0; k <= 80; k++) { const a = face - span / 2 + (span * k) / 80, c = [Math.round(fc.cx + 1 + Math.cos(a) * r), Math.round(fc.cy + 1 + Math.sin(a) * r)]; if (!p.length || p[p.length - 1][0] !== c[0] || p[p.length - 1][1] !== c[1]) p.push(c); } return p; };
  const out = {};
  const saved = g.sighted; g.sighted = { air: 0, armour: 0 };
  out.arc = plan(arc(16, 2.6));
  out.bigArc = plan(arc(22, 3.4));
  // with a radar by the Field Command
  g.addBld('radar', 0, fc.cx + 4, fc.cy - 3, 2, 2, 'Radar'); const radar = g.blds[g.blds.length - 1]; radar.rise = 1; radar.hp = radar.max; const had = g.radars; g.radars = [radar]; // (counted as working, whatever the test base's power)
  out.arcRadar = plan(arc(16, 2.6));
  drop(radar); g.radars = had;
  // two cannons already standing near the line
  const have = [];
  for (const a of [-0.5, 0.5]) { g.addBld('emplacement', 0, Math.round(fc.cx + Math.cos(face + a) * 13), Math.round(fc.cy + Math.sin(face + a) * 13), 2, 2, 'Cannon'); const b = g.blds[g.blds.length - 1]; b.rise = 1; b.hp = b.max; have.push(b); }
  out.arcWithCannons = plan(arc(16, 2.6));
  for (const b of have) drop(b);
  g.sighted = { air: 4, armour: 0 }; out.arcAirSeen = plan(arc(16, 2.6));
  g.sighted = saved;
  return out;
}
