// Equal-money duel harness. Load in the page: const D = await import('/tools/duel.js?' + Date.now())
import { DEF } from '/src/build.ts';
import { WEAPONS, BLD_HP } from '/src/combat.ts';

const g = window.game, CELL = 24, A = 1, B = 3; // teams 1 and 3: neither is the player, so both see by the same rules
const AX0 = 15, AX1 = 115, AY0 = 12, AY1 = 52, MIDY = 32;

export function setup() {
  if (g.state === 'title') g.menu('deploy');
  g.ais = []; g.checkEnd = () => {}; g.powerEff = () => 1; g.saveGame = async () => {};
  for (const c of g.camps) c.done = true;
  for (const k of Object.keys(g.looks)) if (k.endsWith('0')) g.looks[k.slice(0, -1) + B] ??= g.looks[k]; // team 3 isn't in a duel map: borrow the player's pictures
  const t = g.terrain;
  for (let y = AY0 - 4; y <= AY1 + 4; y++) for (let x = AX0 - 4; x <= AX1 + 4; x++) { const i = t.idx(x, y); t.type[i] = 0; t.elev[i] = 0; t.forest[i] = 0; t.occupied[i] = 0; }
  g.blds = g.blds.filter((b) => b.cx + b.w < AX0 - 4 || b.cx > AX1 + 4 || b.cy + b.h < AY0 - 4 || b.cy > AY1 + 4);
  g.state = 'paused';
}

function clear() {
  for (const k of Object.keys(g.looks)) if (k.endsWith('0')) g.looks[k.slice(0, -1) + B] ??= g.looks[k];
  const out = (u) => u.team === A || u.team === B || (u.x < (AX1 + 20) * CELL && u.y < (AY1 + 20) * CELL);
  for (const u of g.units) if (out(u)) u.gone = true;
  g.units = g.units.filter((u) => !u.gone);
  g.blds = g.blds.filter((b) => b.team !== A && b.team !== B);
  g.shells = []; g.fires = [];
}

const unitCost = (k) => DEF[k].cost;
export function count(k, budget) { return Math.max(1, Math.floor(budget / unitCost(k))); }

// a block of units centred on (x, y) cells
function spawnUnits(k, n, team, x, y, face) {
  const out = [], r = g.addUnit(k, team, 0, 0).def.radius; g.units.pop();
  const sp = Math.max(8, r * 2 + 5), cols = Math.max(1, Math.ceil(Math.sqrt(n * 0.6)));
  for (let i = 0; i < n; i++) {
    const c = i % cols, row = Math.floor(i / cols), rows = Math.ceil(n / cols);
    const u = g.addUnit(k, team, x * CELL - face * c * sp, y * CELL + (row - (rows - 1) / 2) * sp);
    u.heading = u.tHead = face > 0 ? 0 : Math.PI; out.push(u);
  }
  return out;
}
function spawnDefs(k, n, team, x, y) {
  const out = [], d = DEF[k], cols = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const c = i % cols, row = Math.floor(i / cols);
    const cx = Math.round(x + c * (d.w + 1)), cy = Math.round(y + (row - 1) * (d.h + 1));
    g.addBld(k, team, cx, cy, d.w, d.h, d.name); out.push(g.blds[g.blds.length - 1]);
  }
  return out;
}
const isDef = (k) => !!BLD_HP[k] && !DEF[k]?.from;
const val = (side) => side.reduce((s, o) => s + (g.alive(o) && (o.hp > 0) ? DEF[o.type].cost * Math.max(0, o.hp) / (o.def ? o.def.hp : o.max) : 0), 0);
const range = (o) => { const w = o.def ? WEAPONS[o.def.weapon] : WEAPONS[{ guardTower: 'towerMg', emplacement: 'emplacement', flakTower: 'flakTower' }[o.type]]; return w?.range ?? 0; };
const canHit = (o, t) => { const w = o.def ? (o.def.weapon ? WEAPONS[o.def.weapon] : null) : WEAPONS[{ guardTower: 'towerMg', emplacement: 'emplacement', flakTower: 'flakTower' }[o.type]]; return !!w && g.canHit(w, t); };

// one fight. a, b: unit keys (b may be a defence). mode 'amove' (both close) or 'kite' (a fights from its own reach).
export function fight(a, b, mode = 'amove', budget = 2400, opts = {}) {
  clear();
  const MIX = opts.mix ?? { rifle: 12, grenadier: 4, rocket: 3, scout: 2, tank: 1 }; // $2,400 of everything
  const mixCost = Object.entries(MIX).reduce((s, [k, n]) => s + DEF[k].cost * n, 0);
  const na = a === 'mix' ? 1 : count(a, budget), nb = b === 'mix' ? 1 : isDef(b) ? Math.max(1, Math.floor(budget / DEF[b].cost)) : count(b, budget);
  const left = { a: budget - (a === 'mix' ? mixCost : na * unitCost(a)), b: budget - (b === 'mix' ? mixCost : nb * DEF[b].cost) };
  const rk = (k) => k === 'mix' ? 96 : WEAPONS[g.addUnit(k, A, 0, 0).def.weapon]?.range ?? 0;
  const ra = rk(a); if (a !== 'mix') g.units.pop();
  const rb = isDef(b) ? range({ type: b }) : rk(b); if (!isDef(b) && b !== 'mix') g.units.pop();
  const gap = mode === 'kite' ? Math.max(ra, rb) / CELL + 3 : 14;
  const bx = 70, ax = bx - gap;
  const side = (k, n, team, x, face) => k === 'mix' ? Object.entries(MIX).flatMap(([u, m], i) => spawnUnits(u, m, team, x - face * i * 1.2, MIDY, face)) : spawnUnits(k, n, team, x, MIDY, face);
  const sa = side(a, na, A, ax, 1);
  const sb = isDef(b) ? spawnDefs(b, nb, B, bx, MIDY) : side(b, nb, B, bx, -1);
  const art = [a, b].includes('artillery') && !opts.noSpot; const seen0 = g.seenBy.bind(g);
  g.seenBy = art ? (team, x, y) => (team === (a === 'artillery' ? A : B) || (b === 'artillery' && team === B)) ? true : seen0(team, x, y) : seen0; // field guns fire as if spotted
  const v0a = val(sa), v0b = val(sb);
  const ctr = (s) => { const l = s.filter((o) => g.alive(o)); return l.length ? [l.reduce((t, o) => t + g.posOf(o)[0], 0) / l.length, l.reduce((t, o) => t + g.posOf(o)[1], 0) / l.length] : null; };
  const order = (s, other) => { const c = ctr(other); const us = s.filter((o) => g.alive(o) && o.def); if (c && us.length) g.orderUnits(us, c[0], c[1], true); };
  g.state = 'play';
  if (!isDef(b)) order(sb, sa);
  if (mode === 'amove') order(sa, sb);
  let t = 0, kt = 0, reorder = 0;
  const alive = (s) => s.some((o) => g.alive(o) && o.hp > 0);
  while (t < (opts.cap ?? 120) && alive(sa) && alive(sb)) {
    g.update(1 / 20); t += 1 / 20;
    if ((reorder -= 1 / 20) <= 0) { reorder = 5; // keep idle attackers heading in (an attack-move ends at the old spot)
      for (const [s, o] of [[sa, sb], [sb, sa]]) { if (s === sa && mode === 'kite') continue; const idle = s.filter((u) => g.alive(u) && u.def && !u.goal && !u.target); const c = ctr(o); if (idle.length && c) g.orderUnits(idle, c[0], c[1], true); }
    }
    if (mode === 'kite' && (kt -= 1 / 20) <= 0) { kt = 0.25;
      for (const u of sa) { if (!g.alive(u)) continue;
        let e = null, ed = 1e9; for (const o of sb) { if (!g.alive(o) || !o.def) continue; const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < ed) { ed = d; e = o; } }
        if (!e) continue; const er = canHit(e, u) ? range(e) : 0;
        if (er && ra > er + 6 && ed - u.def.radius - e.def.radius < er + Math.min(14, (ra - er) / 2)) { const dx = (u.x - e.x) / ed, dy = (u.y - e.y) / ed; let gx = u.x + dx * 50, gy = u.y + dy * 50; gx = Math.max((AX0 + 1) * CELL, Math.min((AX1 - 1) * CELL, gx)); gy = Math.max((AY0 + 1) * CELL, Math.min((AY1 - 1) * CELL, gy)); if (Math.hypot(gx - u.x, gy - u.y) < 20) gy += (gy < MIDY * CELL ? 1 : -1) * 60; g.orderUnits([u], gx, gy, false); }
        else if (u.goal && !u.amove) { u.goal = null; u.path = []; }
      }
    }
  }
  g.state = 'paused'; g.seenBy = seen0;
  const fa = val(sa) / v0a, fb = val(sb) / v0b;
  const win = !alive(sb) && alive(sa) ? a : !alive(sa) && alive(sb) ? b : fa > fb + 0.1 ? a + '?' : fb > fa + 0.1 ? b + '?' : 'draw';
  const res = { a, b, mode, na, nb, left, win, keepA: Math.round(fa * 100), keepB: Math.round(fb * 100), t: Math.round(t) };
  clear();
  return res;
}

// run a list of fights in the background, a slice at a time; results land in window.duels
export function runAll(list, budget = 2400) {
  window.duels = []; window.duelsDone = false; let i = 0;
  const step = () => { const t0 = performance.now(); while (i < list.length && performance.now() - t0 < 3000) { const [a, b, m, bud, o] = list[i++]; try { window.duels.push(fight(a, b, m, bud ?? budget, o)); } catch (e) { window.duels.push({ a, b, mode: m, err: String(e) }); } } try { localStorage.setItem('duels-' + (window.duelTag ?? 'last'), JSON.stringify(window.duels)); } catch {} if (i < list.length) setTimeout(step, 0); else window.duelsDone = true; };
  setTimeout(step, 0);
}

// a markdown grid: row unit against column unit; each cell "amove/kite" (kite: the row unit fights from
// its own reach), W or L for the row unit with the winner's kept share of its starting value (? = time ran out)
export function grid(res = window.duels) {
  const short = { rifle: 'rifle', rocket: 'rocket', grenadier: 'gren', scout: 'scout', tank: 'tank', juggernaut: 'jugg', artillery: 'fgun', flak: 'flak', gunship: 'gship', bomber: 'bomber', colossus: 'colos', guardTower: 'guardT', emplacement: 'emplac', flakTower: 'flakT' };
  const rows = [...new Set(res.map((r) => r.a))], cols = [...new Set(res.map((r) => r.b))];
  const cell = (r) => { if (!r) return ''; if (r.err) return 'ERR'; const w = r.win.replace('?', ''), q = r.win.endsWith('?') ? '?' : ''; return w === r.a ? `W${r.keepA}${q}` : w === r.b ? `L${r.keepB}${q}` : 'D'; };
  let s = '| vs | ' + cols.map((c) => short[c] ?? c).join(' | ') + ' | wins |\n|' + '---|'.repeat(cols.length + 2) + '\n';
  for (const a of rows) {
    let wins = 0, n = 0;
    s += `| **${short[a] ?? a}** | ` + cols.map((b) => { if (a === b) return '·'; const m = res.find((r) => r.a === a && r.b === b && r.mode === 'amove'), k = res.find((r) => r.a === a && r.b === b && r.mode === 'kite'); for (const r of [m, k]) if (r && !r.err) { n++; if (r.win.replace('?', '') === a) wins++; } return m || k ? `${cell(m)}/${cell(k)}` : ''; }).join(' | ') + ` | ${wins}/${n} |\n`;
  }
  return s;
}
