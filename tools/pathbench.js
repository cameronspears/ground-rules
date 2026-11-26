// Pathing test bench, run in the browser on the dev server:
//   const P = await import('/tools/pathbench.js?' + Date.now())
//   P.routes(200)        route planner alone: random trips vs the true shortest route (reached? how much longer? how slow?)
//   await P.suite()      units really driving through every scenario (or P.suite(['bridge', 'headOn'])): arrivals, time against the ideal, stuck units, frame times
// Each returns a small table of scores; lower 'long' and 'late', higher 'reached' and 'arrived' are better.
import { findPath, pathStats } from '/src/path.ts';
import { N, CELL } from '/src/terrain.ts';

const g = window.game;
const t = () => g.terrain;

// the time a step takes, in squares at full speed: roads are quicker (as move() drives them); forest, walls nearby, nothing else matters
function stepTime(T, ni, diag, crush) { const ty = T.type[ni]; return (diag ? 1.414 : 1) / (ty === 7 || ty === 4 ? (crush ? 1.3 : 1.1) : 1); }
// the true quickest route time from one square to every square (no search limit)
export function dijkstra(T, sx, sy, crush) {
  const d = new Float64Array(N * N).fill(1e9), hi = new Int32Array(N * N * 4), hv = new Float64Array(N * N * 4); let n = 0; // a plain binary heap in typed arrays
  const push = (i, f) => { let k = n++; while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= f) break; hi[k] = hi[p]; hv[k] = hv[p]; k = p; } hi[k] = i; hv[k] = f; };
  const s = sy * N + sx; d[s] = 0; push(s, 0);
  while (n) {
    const cur = hi[0], cd = hv[0], li = hi[--n], lf = hv[n];
    let k = 0; for (;;) { const l = 2 * k + 1; if (l >= n) break; const m = l + 1 < n && hv[l + 1] < hv[l] ? l + 1 : l; if (hv[m] >= lf) break; hi[k] = hi[m]; hv[k] = hv[m]; k = m; } hi[k] = li; hv[k] = lf;
    if (cd > d[cur]) continue;
    const cx = cur % N, cy = (cur / N) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!T.step(cx, cy, nx, ny, crush)) continue;
      if (dx && dy && (!T.step(cx, cy, nx, cy, crush) || !T.step(cx, cy, cx, ny, crush))) continue;
      const ni = ny * N + nx, nd = cd + stepTime(T, ni, dx && dy, crush);
      if (nd < d[ni]) { d[ni] = nd; push(ni, nd); }
    }
  }
  return d;
}
// the time a route as findPath returns it takes to drive (waypoints joined by straight lines), in squares at full speed:
// its true length, quicker on roads
function routeCost(T, sx, sy, pts, crush) {
  let c = 0, ax = sx, ay = sy;
  for (const [bx, by] of pts) {
    const len = Math.hypot(bx - ax, by - ay) / CELL, steps = Math.max(1, Math.ceil(len * 4));
    for (let k = 0; k < steps; k++) { const x = ax + ((bx - ax) * (k + 0.5)) / steps, y = ay + ((by - ay) * (k + 0.5)) / steps, ty = T.type[Math.floor(y / CELL) * N + Math.floor(x / CELL)]; c += len / steps / (ty === 7 || ty === 4 ? (crush ? 1.3 : 1.1) : 1); }
    ax = bx; ay = by;
  }
  return c;
}
let rs = 1; const rand = () => { rs |= 0; rs = (rs + 0x6d2b79f5) | 0; let x = Math.imul(rs ^ (rs >>> 15), 1 | rs); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; // repeatable: the same trips every run (open the page with ?seed=N for the same map too)
export const reseed = (n = 1) => { rs = n; };
const rnd = (a, b) => a + Math.floor(rand() * (b - a));
function openCell(crush) { const T = t(); for (;;) { const x = rnd(4, N - 4), y = rnd(4, N - 4); if (T.open(x, y, crush) && T.edge?.(x, y) !== 0) return [x, y]; } }

// Route planner alone. For each trip: did it reach the goal, how much longer than the best route, how much work, how long.
export function routes(trips = 200, maxNodes) {
  reseed(7); const T = t(), out = { soldiers: [], vehicles: [] };
  for (const crush of [false, true]) {
    const rows = crush ? out.vehicles : out.soldiers;
    let made = 0; const until = performance.now() + 30000;
    while (made < trips && performance.now() < until) {
      const [sx, sy] = openCell(crush), d = dijkstra(T, sx, sy, crush);
      for (let k = 0; k < 10 && made < trips; k++) {
        const [gx, gy] = openCell(crush), best = d[gy * N + gx];
        if (best >= 1e9 || best < 20) continue; // unreachable, or too short to tell anything
        const w0 = pathStats.work, t0 = performance.now();
        const p = findPath(T, (sx + 0.5) * CELL, (sy + 0.5) * CELL, (gx + 0.5) * CELL, (gy + 0.5) * CELL, crush, maxNodes);
        const ms = performance.now() - t0, reached = pathStats.reached, cost = routeCost(T, (sx + 0.5) * CELL, (sy + 0.5) * CELL, p, crush);
        rows.push({ best, reached, long: reached ? cost / best : null, work: pathStats.work - w0, ms, from: [sx, sy], to: [gx, gy], straight: Math.hypot(gx - sx, gy - sy) });
        made++;
      }
    }
  }
  const sum = (rows) => {
    const ok = rows.filter((r) => r.reached), longs = ok.map((r) => r.long).sort((a, b) => a - b), ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    const detour = rows.filter((r) => r.best > r.straight * 1.6); // trips where the way round is much longer than the crow flies: the hard ones
    return { trips: rows.length, reached: +(ok.length / rows.length).toFixed(3), reachedHard: +(detour.filter((r) => r.reached).length / (detour.length || 1)).toFixed(3), hard: detour.length,
      longMedian: +longs[longs.length >> 1]?.toFixed(3), long95: +longs[Math.floor(longs.length * 0.95)]?.toFixed(3), msMedian: +ms[ms.length >> 1].toFixed(2), ms95: +ms[Math.floor(ms.length * 0.95)].toFixed(2), msMax: +ms[ms.length - 1].toFixed(1) };
  };
  window.lastRoutes = out;
  return { soldiers: sum(out.soldiers), vehicles: sum(out.vehicles) };
}

// ---------------------------------------------------------------- units really driving
// Every scenario plays the real game (all sides at peace, no computer players) and scores each unit:
// arrived (within 2 squares of the spot it was given), late (time taken / the quickest possible drive),
// gave up (no order left, not there), stuck (not there, not moving for 10 seconds at the end), plus how long frames took.
const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }); // (not setTimeout: a hidden tab slows that to once a second)
function quiet() { g.ais = []; g.ally = g.ally.map(() => 0); g.checkEnd = () => {}; g.saveGame = async () => {}; for (const c of g.camps ?? []) c.done = true; }
let mainSeed = null, mainLab = null, mainId = -1;
function mainLabels() { // the biggest stretch of ground soldiers can walk (everything in a scenario starts and ends on it)
  const T = t(); if (mainSeed === T.seed && mainLab) return mainLab;
  const lab = new Int32Array(N * N).fill(-1), sizes = [];
  for (let s = 0; s < N * N; s++) {
    if (lab[s] >= 0 || !T.open(s % N, (s / N) | 0, false)) continue;
    const id = sizes.length, q = [s]; lab[s] = id; let n = 0;
    while (q.length) { const c = q.pop(); n++; const cx = c % N, cy = (c / N) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy, ni = ny * N + nx; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < N && ny < N && lab[ni] < 0 && T.step(cx, cy, nx, ny, false)) { lab[ni] = id; q.push(ni); } } }
    sizes.push(n);
  }
  mainId = sizes.indexOf(Math.max(...sizes)); mainSeed = T.seed; mainLab = lab; return lab;
}
const onMain = (x, y) => x >= 0 && y >= 0 && x < N && y < N && mainLabels()[y * N + x] === mainId;
function mainCell() { for (;;) { const x = rnd(4, N - 4), y = rnd(4, N - 4); if (onMain(x, y) && t().open(x, y, true)) return [x, y]; } }
function nearMain(x, y) { for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && onMain(x + dx, y + dy) && t().open(x + dx, y + dy, true)) return [x + dx, y + dy]; return null; }
const far = (a, min, max = 1e9) => { for (let k = 0; k < 5000; k++) { const b = mainCell(), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d >= min && d <= max) return b; } return mainCell(); };
// place units of these kinds in a sunflower round a spot, about as far apart as a formation stands them (each on its own open square)
function place(kinds, cx, cy, team = 0, spacing = 0.75) {
  const T = t(), us = [], taken = new Set(g.units.map((u) => T.idx(T.cellOf(u.x), T.cellOf(u.y)))); let n = 0;
  for (const k of kinds) for (let tries = 0; tries < 2000; tries++) {
    const r = spacing * Math.sqrt(n), a = n * 2.39996; n++;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    if (onMain(x, y) && T.open(x, y, true) && !taken.has(T.idx(x, y))) { taken.add(T.idx(x, y)); us.push(g.addUnit(k, team, (x + 0.5) * CELL, (y + 0.5) * CELL)); break; }
  }
  return us;
}
function clearUnits() { for (const u of g.units) u.gone = true; g.units = []; g.divisions = g.divisions.map(() => null); }
// an order exactly as the player gives it: select these units and right-click the spot (attack: press ATTACK first)
function order(us, x, y, attack = false) {
  const wx = (x + 0.5) * CELL, wy = (y + 0.5) * CELL, ground = g.groundAt, intent = g.intent;
  for (const u of g.units) u.selected = false;
  for (const u of us) { u.selected = true; u.sentTo = [wx, wy]; }
  g.groundAt = () => [wx, wy]; g.intent = () => ({ kind: 'move', site: null });
  try { g.command(0, 0, attack); } finally { g.groundAt = ground; g.intent = intent; for (const u of us) u.selected = false; }
}
// play on until every watched unit is at its spot (or time runs out); `during(t)` runs each half second (to re-order, build walls...)
async function watch(us, { limit, during, settle = 0 } = {}) {
  const T = t(), start = g.time, info = us.map((u) => ({ u, kind: u.type, at: null, gaveUp: false, still: 0, lx: u.x, ly: u.y, x0: u.x, y0: u.y, left: null, near: null }));
  // (a soldier riding a vehicle hops off beside it: it counts as there within 6 squares of the spot the army was sent to)
  const aim = (i, from) => { i.t0 = from; i.at = null; i.left = null; i.near = null; i.x0 = i.u.x; i.y0 = i.u.y; i.rider = !!i.u.ride; i.slot = i.u.goal && !i.u.ride ? [...i.u.goal] : i.u.sentTo ?? i.slot; const d = dijkstra(T, T.cellOf(i.u.x), T.cellOf(i.u.y), i.u.def.crush); i.ideal = i.slot ? (d[T.cellOf(i.slot[1]) * N + T.cellOf(i.slot[0])] * CELL) / (i.u.pace || i.u.def.speed) : 1e9; };
  for (const i of info) aim(i, 0);
  const finite = info.map((i) => i.ideal).filter((v) => v < 1e6);
  limit ??= (finite.length ? Math.max(...finite) : 60) * 2.5 + 30;
  const frames = []; let next = 0, riderR = Math.max(6, (Math.sqrt(us.length) * 34) / CELL / 2 + 2); // a rider hops off beside its vehicle: anywhere in the formation counts
  while (g.time - start < limit && (settle ? g.time - start < settle || info.some((i) => i.at === null) : info.some((i) => i.at === null))) {
    if (window.benchStop) throw new Error('stopped');
    g.state = 'play';
    if (during && g.time - start >= next) { next += 0.5; if (during(g.time - start, info) === 'reslot') for (const i of info) aim(i, g.time - start); }
    for (let k = 0; k < 20; k++) {
      const t0 = performance.now(); g.update(1 / 20); frames.push(performance.now() - t0);
      for (const i of info) if (i.at === null && i.slot) {
        const u = i.u; if (u.gone) { i.at = -1; continue; }
        const d = Math.hypot(u.x - i.slot[0], u.y - i.slot[1]), el = g.time - start - i.t0;
        if (i.left === null && Math.hypot(u.x - i.x0, u.y - i.y0) > 5 * CELL) i.left = el; // got going
        if (i.near === null && !i.rider && d < 6 * CELL) i.near = el; // in among the others at the end
        if (!u.ride && d < (i.rider ? riderR : 2) * CELL) i.at = el;
      }
    }
    for (const i of info) { const u = i.u; if (i.at === null && Math.hypot(u.x - i.lx, u.y - i.ly) < 3 && !u.ride) i.still += 1; else i.still = 0; i.lx = u.x; i.ly = u.y; if (!u.goal && !u.path.length && !u.ride && i.at === null) i.gaveUp = true; else i.gaveUp = false; }
    await yieldNow();
  }
  frames.sort((a, b) => a - b);
  return { rows: info.map((i) => ({ kind: i.kind, ideal: i.ideal, at: i.at, late: i.at > 0 && i.ideal < 1e6 ? i.at / i.ideal : null, left: i.left, settle: i.at > 0 && i.near !== null ? i.at - i.near : null, gaveUp: i.gaveUp && i.at === null, stuck: i.at === null && i.still >= 10, x: T.cellOf(i.u.x), y: T.cellOf(i.u.y), slot: i.slot?.map((v) => T.cellOf(v)) })),
    ms: { mean: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2), p99: +frames[Math.floor(frames.length * 0.99)].toFixed(1), max: +frames[frames.length - 1].toFixed(1) }, secs: +(g.time - start).toFixed(1) };
}
const SOLO = ['rifle', 'rocket', 'grenadier', 'tank', 'quad', 'artillery', 'builder', 'harvester', 'colossus'];
const mix = (n) => { const base = ['rifle', 'rifle', 'rifle', 'rocket', 'rocket', 'tank', 'tank', 'tank', 'quad', 'artillery']; return Array.from({ length: n }, (_, i) => base[i % base.length]); };
// bridges on this map: each as its two banks (open ground on the main stretch beyond each end)
function bridges() {
  const T = t(), seen = new Set(), out = [];
  for (let i = 0; i < N * N; i++) {
    if (T.type[i] !== 4 || seen.has(i)) continue;
    const q = [i], cells = []; seen.add(i);
    while (q.length) { const c = q.pop(); cells.push(c); for (const d of [1, -1, N, -N]) if (T.type[c + d] === 4 && !seen.has(c + d)) { seen.add(c + d); q.push(c + d); } }
    const xs = cells.map((c) => c % N), ys = cells.map((c) => (c / N) | 0), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const along = x1 - x0 >= y1 - y0 ? [1, 0] : [0, 1], half = Math.max(x1 - x0, y1 - y0) / 2 + 10;
    const a = nearMain(Math.round(mx - along[0] * half), Math.round(my - along[1] * half)), b = nearMain(Math.round(mx + along[0] * half), Math.round(my + along[1] * half));
    if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > half) out.push({ a, b, mid: [mx, my], len: cells.length });
  }
  return out;
}
// ---- the scenarios. Each returns rows (one per unit) and frame times.
const S = {
  async solo() { const rows = [], ms = []; for (const kind of SOLO) for (let k = 0; k < 3; k++) { clearUnits(); const a = mainCell(), b = far(a, 40), us = place([kind], ...a); order(us, ...b); const r = await watch(us); rows.push(...r.rows.map((x) => ({ ...x, kind }))); ms.push(r.ms); } return { rows, ms }; },
  async army30() { const rows = [], ms = []; for (let k = 0; k < 3; k++) { clearUnits(); const a = mainCell(), b = far(a, 40), us = place(mix(30), ...a); order(us, ...b); const r = await watch(us); rows.push(...r.rows); ms.push(r.ms); } return { rows, ms }; },
  async army120() { clearUnits(); const a = mainCell(), b = far(a, 50), us = place(mix(120), ...a); order(us, ...b); const r = await watch(us); return { rows: r.rows, ms: [r.ms] }; },
  async attack30() { const rows = [], ms = []; for (let k = 0; k < 2; k++) { clearUnits(); const a = mainCell(), b = far(a, 40), us = place(mix(30), ...a); order(us, ...b, true); const r = await watch(us); rows.push(...r.rows); ms.push(r.ms); } return { rows, ms }; },
  async attack120() { clearUnits(); const a = mainCell(), b = far(a, 50), us = place(mix(120), ...a); order(us, ...b, true); const r = await watch(us); return { rows: r.rows, ms: [r.ms] }; },
  async mass300() { clearUnits(); const a = mainCell(), b = far(a, 60), us = place(mix(300), ...a, 0, 0.7); order(us, ...b); const r = await watch(us); return { rows: r.rows, ms: [r.ms] }; },
  async headOn() { const rows = [], ms = []; for (let k = 0; k < 2; k++) { clearUnits(); const a = mainCell(), b = far(a, 30, 50), u1 = place(mix(30), ...a), u2 = place(mix(30), ...b); order(u1, ...b); order(u2, ...a); const r = await watch([...u1, ...u2]); rows.push(...r.rows); ms.push(r.ms); } return { rows, ms }; },
  async bridge() { const rows = [], ms = [], bs = bridges().slice(0, 3); for (const br of bs) { clearUnits(); const us = place(mix(30), ...br.a); order(us, ...br.b); const r = await watch(us); rows.push(...r.rows); ms.push(r.ms); } return { rows, ms, note: bs.length + ' bridges' }; },
  async bridgeHeadOn() { const rows = [], ms = [], bs = bridges().slice(0, 2); for (const br of bs) { clearUnits(); const u1 = place(mix(20), ...br.a), u2 = place(mix(20), ...br.b); order(u1, ...br.b); order(u2, ...br.a); const r = await watch([...u1, ...u2]); rows.push(...r.rows); ms.push(r.ms); } return { rows, ms }; },
  async crowdedSpot() { // 20 idle soldiers already stand on the spot; 20 more are sent there
    clearUnits(); const a = mainCell(), b = far(a, 30); place(mix(20), ...b); const us = place(mix(20), ...a); order(us, ...b); const r = await watch(us); return { rows: r.rows, ms: [r.ms] }; },
  async baseExit() { // an army packed in among your own buildings heads out
    clearUnits(); const fc = g.blds.find((b) => b.team === 0 && b.type === 'fieldCommand'); if (!fc) return { rows: [], ms: [] };
    const us = place(mix(30), fc.cx + 1, fc.cy + fc.h + 1), b = far([fc.cx, fc.cy], 40, 70); order(us, ...b); const r = await watch(us); return { rows: r.rows, ms: [r.ms] }; },
  async clickSpam() { // re-ordered every half second for 15 seconds between two spots, then sent on
    clearUnits(); const a = mainCell(), b = far(a, 15, 25), c = far(a, 40, 60), us = place(mix(30), ...a);
    order(us, ...b); const r = await watch(us, { during: (s) => { if (s < 15) { const [x, y] = Math.round(s * 2) % 2 ? a : b; order(us, x, y); } else if (s < 15.5) { order(us, ...c); return 'reslot'; } }, settle: 16, limit: 220 }); return { rows: r.rows, ms: [r.ms] }; },
  async wallAcross() { // 5 seconds in, a wall goes up across the route (with a gap, then without)
    const rows = [], ms = [];
    for (const gap of [true, false]) {
      clearUnits(); const a = mainCell(), b = far(a, 40, 60), us = place(mix(20), ...a); order(us, ...b);
      const T = t(), mx = Math.round((a[0] + b[0]) / 2), my = Math.round((a[1] + b[1]) / 2), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), px = -dy / l, py = dx / l;
      const r = await watch(us, { during: (s) => { if (s >= 5 && s < 5.5) { for (let k = -12; k <= 12; k++) { if (gap && Math.abs(k) <= 1) continue; const x = Math.round(mx + px * k), y = Math.round(my + py * k); if (T.open(x, y, true) && !g.units.some((u) => T.cellOf(u.x) === x && T.cellOf(u.y) === y)) { g.addBld('wall', 0, x, y, 1, 1, 'Wall'); T.occupied[T.idx(x, y)] = 1; } } } } });
      rows.push(...r.rows.map((x) => ({ ...x, kind: x.kind + (gap ? '/gap' : '/nogap') }))); ms.push(r.ms);
    }
    return { rows, ms };
  },
  async unreachable() { // the spot is in the water or on ground nobody can reach: they should stop at the nearest point, quickly, without burning time
    const T = t(), rows = [], ms = [];
    for (let k = 0; k < 3; k++) {
      clearUnits(); let w; for (let n = 0; n < 20000; n++) { const x = rnd(10, N - 10), y = rnd(10, N - 10); if (T.type[T.idx(x, y)] === 3 && !onMain(x, y)) { w = [x, y]; break; } }
      if (!w) break; const a = far(w, 20, 45), us = place(mix(10), ...a); order(us, ...w);
      const d = dijkstra(T, ...a, false); let best = 1e9; for (let y = w[1] - 30; y <= w[1] + 30; y++) for (let x = w[0] - 30; x <= w[0] + 30; x++) if (x >= 0 && y >= 0 && x < N && y < N && d[y * N + x] < 1e9) best = Math.min(best, Math.hypot(x - w[0], y - w[1]));
      const r = await watch(us, { limit: 90 });
      rows.push(...r.rows.map((x) => ({ ...x, kind: 'shore+' + Math.round(Math.hypot(x.x - w[0], x.y - w[1]) - best), at: Math.hypot(x.x - w[0], x.y - w[1]) - best < 8 ? 1 : null, stuck: false }))); ms.push(r.ms); // (a group of 10 fans out along the shore; standing still there is right)
    }
    return { rows, ms };
  },
};
// run some or all scenarios; results also land in window.bench
export async function suite(names = Object.keys(S), seed = 1) {
  quiet(); reseed(seed); const out = {}; window.bench = out;
  for (const n of names) { const t0 = performance.now(); const r = await S[n](); out[n] = { ...summary(r.rows), ms: r.ms, note: r.note, real: +((performance.now() - t0) / 1000).toFixed(0), rows: r.rows }; localStorage.benchProgress = n; }
  clearUnits(); return report(out);
}
export function summary(rows) {
  const ok = rows.filter((r) => r.at > 0), late = ok.map((r) => r.late).filter((v) => v).sort((a, b) => a - b);
  const q = (xs, p) => { xs = xs.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b); return +(xs[Math.floor(xs.length * p)] ?? 0).toFixed(1); };
  return { n: rows.length, arrived: +(ok.length / (rows.length || 1)).toFixed(2), lateMed: +(late[late.length >> 1] ?? 0).toFixed(2), late90: +(late[Math.floor(late.length * 0.9)] ?? 0).toFixed(2), gaveUp: rows.filter((r) => r.gaveUp).length, stuck: rows.filter((r) => r.stuck).length,
    go90: q(rows.map((r) => r.left), 0.9), settle90: q(rows.map((r) => r.settle), 0.9) }; // go90: seconds until 9 in 10 got going; settle90: seconds 9 in 10 took over their last 4 squares
}
export function report(out = window.bench) { return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { n: v.n, arrived: v.arrived, lateMed: v.lateMed, late90: v.late90, gaveUp: v.gaveUp, stuck: v.stuck, go90: v.go90, settle90: v.settle90, msMax: Math.max(...v.ms.map((m) => m.max)), msMean: Math.max(...v.ms.map((m) => m.mean)), note: v.note }])); }
export { S, bridges, place, order, clearUnits, quiet, watch, mix, mainCell, far };

// ---------------------------------------------------------------- planner experiments
// A copy of findPath with every ingredient adjustable, scored on the same trips as routes():
// hw: how hard the search leans toward the goal (findPath: 0.95 of the straight-line distance); road: a road step's
// cost; hug: extra cost beside buildings; forest: extra cost in trees; look/width: how far and how wide the
// straightening checks.
import { clear as clearLine } from '/src/path.ts';
export function variant(o = {}) {
  const { hw = 0.95, road = 0.75, hug = 0.6, forest = 3, look = 10, width = 7, max = 50000 } = o;
  return (T, sx, sy, tx, ty, crush) => {
    const g = new Float64Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N), hi = [], hv = [];
    const scx = Math.floor(sx / CELL), scy = Math.floor(sy / CELL), tcx = Math.floor(tx / CELL), tcy = Math.floor(ty / CELL), goal = tcy * N + tcx, s = scy * N + scx;
    const H = (x, y) => { const dx = Math.abs(x - tcx), dy = Math.abs(y - tcy); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * hw; };
    const push = (i, f) => { hi.push(i); hv.push(f); let k = hi.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= f) break; hi[k] = hi[p]; hv[k] = hv[p]; k = p; } hi[k] = i; hv[k] = f; };
    const pop = () => { const top = hi[0], li = hi.pop(), lf = hv.pop(); if (hi.length) { let k = 0; for (;;) { const l = 2 * k + 1; if (l >= hi.length) break; const m = l + 1 < hi.length && hv[l + 1] < hv[l] ? l + 1 : l; if (hv[m] >= lf) break; hi[k] = hi[m]; hv[k] = hv[m]; k = m; } hi[k] = li; hv[k] = lf; } return top; };
    g[s] = 0; push(s, H(scx, scy)); let n = 0, best = s, bestH = 1e9;
    while (hi.length && n < max) {
      const cur = pop(); if (closed[cur]) continue; closed[cur] = 1; n++;
      const cx = cur % N, cy = (cur / N) | 0, h = H(cx, cy); if (h < bestH) { bestH = h; best = cur; } if (cur === goal) break;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy;
        if (!T.step(cx, cy, nx, ny, crush)) continue;
        if (dx && dy && (!T.step(cx, cy, nx, cy, crush) || !T.step(cx, cy, cx, ny, crush))) continue;
        const ni = ny * N + nx; if (closed[ni]) continue;
        const ty2 = T.type[ni], occ = T.occupied, hg = occ[ni + 1] || occ[ni - 1] || occ[ni + N] || occ[ni - N] ? hug : 0;
        const c = (dx && dy ? 1.414 : 1) * (ty2 === 7 || ty2 === 4 ? road : 1) + (T.forest[ni] ? forest : 0) + hg;
        if (g[cur] + c < g[ni]) { g[ni] = g[cur] + c; from[ni] = cur; push(ni, g[ni] + H(nx, ny)); }
      }
    }
    const cells = []; for (let c = best; c !== s && c !== -1; c = from[c]) cells.push(c); cells.reverse();
    const p = cells.map((c) => [((c % N) + 0.5) * CELL, (((c / N) | 0) + 0.5) * CELL]);
    let out = p; if (p.length >= 3) { out = []; let ax = sx, ay = sy, i = 0; while (i < p.length) { let j = Math.min(p.length - 1, i + look); while (j > i && !clearLine(T, ax, ay, p[j][0], p[j][1], crush, width)) j--; out.push(p[j]); [ax, ay] = p[j]; i = j + 1; } }
    return { path: out, nodes: n, reached: best === goal };
  };
}
// score planners on the same trips: travel time against the quickest possible, and search effort
export function compare(variants, trips = 150) {
  const T = t(), res = {};
  for (const crush of [false, true]) {
    reseed(11); let made = 0; const rowsBy = Object.fromEntries(Object.keys(variants).map((k) => [k, []]));
    while (made < trips) {
      const [sx, sy] = openCell(crush), d = dijkstra(T, sx, sy, crush);
      for (let k = 0; k < 10 && made < trips; k++) {
        const [gx, gy] = openCell(crush), best = d[gy * N + gx]; if (best >= 1e9 || best < 20) continue;
        for (const [name, f] of Object.entries(variants)) { const t0 = performance.now(), r = f(T, (sx + 0.5) * CELL, (sy + 0.5) * CELL, (gx + 0.5) * CELL, (gy + 0.5) * CELL, crush); rowsBy[name].push({ long: routeCost(T, (sx + 0.5) * CELL, (sy + 0.5) * CELL, r.path, crush) / best, nodes: r.nodes, ms: performance.now() - t0, reached: r.reached }); }
        made++;
      }
    }
    for (const [name, rows] of Object.entries(rowsBy)) { const L = rows.map((r) => r.long).sort((a, b) => a - b), nd = rows.map((r) => r.nodes).sort((a, b) => a - b); (res[name] ??= {})[crush ? 'veh' : 'sol'] = { long: +L[L.length >> 1].toFixed(3), long95: +L[Math.floor(L.length * 0.95)].toFixed(3), nodes: nd[nd.length >> 1], nodes95: nd[Math.floor(nd.length * 0.95)], reached: rows.filter((r) => r.reached).length / rows.length }; }
  }
  return res;
}
