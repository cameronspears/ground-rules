// The "does this map make sense?" checker. Builds many random maps and tests each against rules
// that a real landscape obeys; prints every breach with where it is. Run after any map change:
//   node tools/check-maps.mjs [maps=50] [firstSeed=1] [players=2]
// A clean run prints "0 problems". Rules live in RULES below: add one whenever we find a new kind of
// mistake, so it can never quietly come back.
import { load } from './load.mjs';

const T = { GRASS: 0, DIRT: 1, SCRAP: 2, WATER: 3, BRIDGE: 4, FORD: 5, ROCK: 6, ROAD: 7, FIELD: 8, PAVED: 9 }; // mirrors terrain.ts

const RULES = {
  // water runs somewhere: every stream reaches other water, a river's shallows or the map's edge
  'stream goes nowhere'(t, out) {
    for (const st of t.streams ?? []) { const [x, y] = st.pts[st.pts.length - 1].map(Math.round); let ok = x <= 2 || y <= 2 || x >= t.N - 3 || y >= t.N - 3; for (let dy = -2; dy <= 2 && !ok; dy++) for (let dx = -2; dx <= 2; dx++) { const j = t.idx(x + dx, y + dy); if (t.inside(x + dx, y + dy) && (t.type[j] === T.WATER || (t.type[j] === T.FORD && !t.streamUnder.has(j)))) ok = true; } if (!ok) out.push([x, y, 'a stream that just stops']); }
  },
  // no hairline strips of land between two waters (from two drawings of one shore not lining up). Read off the
  // painted ground: land with open water on both sides within 15 pixels, in a run of eight squares or more
  // (natural points, islands and the little curled pockets we like are short or wide; a drawing fault runs along the bank).
  // The citadel's moat is built, not natural: its gates cut the bank on purpose
  'thin strip of land'(t, out) {
    const N = t.N, C = 24; t.prepare(); const G = t.ground, wet = (x, y) => G(x, y) === T.WATER;
    const near = new Uint8Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (t.type[t.idx(x, y)] === T.WATER) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) if (t.inside(x + k, y + j)) near[t.idx(x + k, y + j)] = 1;
    const hot = new Set();
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      const i = t.idx(cx, cy); if (!near[i] || t.occupied[i] || Math.hypot(cx - (N / 2 - 0.5), cy - (N / 2 - 0.5)) < t.island + 6) continue; let hits = 0;
      for (let sy = 2; sy < C && hits < 3; sy += 4) for (let sx = 2; sx < C; sx += 4) {
        const px = cx * C + sx, py = cy * C + sy, q = G(px, py); if (q === T.WATER || q === T.FORD || q === T.BRIDGE) continue;
        for (const [dx, dy] of [[1, 0], [0, 1], [0.707, 0.707], [0.707, -0.707]]) { let a = 0, b = 0; for (let r = 3; r <= 15; r += 3) { if (!a && wet(px + dx * r, py + dy * r)) a = r; if (!b && wet(px - dx * r, py - dy * r)) b = r; } if (a && b && a + b <= 15) { hits++; break; } }
      }
      if (hits >= 3) hot.add(i);
    }
    t.ground = null;
    const seen = new Set();
    for (const i of hot) { if (seen.has(i)) continue; const comp = [i]; seen.add(i); for (let k = 0; k < comp.length; k++) { const c = comp[k], x = c % N, y = Math.floor(c / N); for (let j = -1; j <= 1; j++) for (let m = -1; m <= 1; m++) { const n = t.idx(x + m, y + j); if (hot.has(n) && !seen.has(n)) { seen.add(n); comp.push(n); } } } if (comp.length >= 8) out.push([i % N, Math.floor(i / N), `a thin strip of land between waters, ${comp.length} squares long`]); }
  },
  // a stream is one unbroken channel (its squares join side to side)
  'stream broken'(t, out) {
    for (const st of t.streams ?? []) { if (!st.cells.length) continue; const set = new Set(st.cells), seen = new Set([st.cells[0]]), q = [st.cells[0]]; while (q.length) { const c = q.pop(), x = c % t.N, y = Math.floor(c / t.N); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = t.idx(x + dx, y + dy); if (set.has(j) && !seen.has(j)) { seen.add(j); q.push(j); } } } if (seen.size < set.size) out.push([st.cells[0] % t.N, Math.floor(st.cells[0] / t.N), `a stream in ${set.size - seen.size === 0 ? 1 : 'pieces'} (${seen.size} of ${set.size} squares joined)`]); }
  },
  // water bends gently: no sharp turns in a stream or a river
  'sharp bend in water'(t, out) {
    const bends = (pts, span) => { for (let k = span; k < pts.length - span; k++) { const ax = pts[k][0] - pts[k - span][0], ay = pts[k][1] - pts[k - span][1], bx = pts[k + span][0] - pts[k][0], by = pts[k + span][1] - pts[k][1], c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1); if (c < Math.cos(Math.PI / 3)) return pts[k]; } return null; };
    for (const st of t.streams ?? []) { const b = bends(st.pts, 2); if (b) out.push([Math.round(b[0]), Math.round(b[1]), 'a stream turns sharply']); }
    for (const rv of t.rivers ?? []) { for (let k = 1; k < rv.length - 1; k++) { const ax = rv[k][0] - rv[k - 1][0], ay = rv[k][1] - rv[k - 1][1], bx = rv[k + 1][0] - rv[k][0], by = rv[k + 1][1] - rv[k][1], c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1); if (c < Math.cos(Math.PI / 6)) { out.push([Math.round(rv[k][0]), Math.round(rv[k][1]), 'a river corner']); break; } } }
  },
  // water doesn't climb
  'stream runs uphill'(t, out) {
    for (const st of t.streams ?? []) { let lo = 1e9; for (const [x, y] of st.pts) { const h = t.height[t.idx(Math.round(x), Math.round(y))]; if (h > lo + 0.6) { out.push([Math.round(x), Math.round(y), `a stream climbs ${(h - lo).toFixed(1)}`]); break; } lo = Math.min(lo, h); } }
  },
  // plants follow the sun: woods are thicker on slopes facing south than on slopes facing north
  'trees ignore the sun'(t, out) {
    const YAW = (18 * Math.PI) / 180, YC = Math.cos(YAW), YS = Math.sin(YAW), b = { s: [0, 0], n: [0, 0] };
    for (let y = 2; y < t.N - 2; y++) for (let x = 2; x < t.N - 2; x++) { const i = t.idx(x, y); if (t.type[i] !== T.GRASS || t.elev[i]) continue; const H = t.height, sun = -(((H[i + 1] - H[i - 1]) / 2) * YS + ((H[i + t.N] - H[i - t.N]) / 2) * YC) * 6; const k = sun > 0.3 ? 's' : sun < -0.3 ? 'n' : null; if (!k) continue; b[k][0]++; if (t.forest[i]) b[k][1]++; }
    if (b.s[0] > 200 && b.n[0] > 200) { const fs = b.s[1] / b.s[0], fn = b.n[1] / b.n[0]; if (fs < fn * 1.25) out.push([0, 0, `woods on sunny slopes ${(fs * 100).toFixed(0)}% vs shaded ${(fn * 100).toFixed(0)}%`]); }
  },
  // every dam and capturable site can be reached on foot: open ground (no water, trees, rock or building) beside it
  'site no one can reach'(t, out) {
    const CAP = new Set(['townHall', 'fuelDepot', 'motorPool', 'recruitOffice', 'watchtower', 'bunker', 'powerPlant', 'commTower', 'repairYard', 'uplink']);
    const sites = [...t.sites.filter((s) => CAP.has(s.kind)).map((s) => ({ ...s })), ...t.dams.map((d) => ({ kind: 'dam', cx: d.x, cy: d.y, w: 2, h: 2 }))];
    for (const s of sites) { let open = 0; for (let y = s.cy - 1; y <= s.cy + s.h; y++) for (let x = s.cx - 1; x <= s.cx + s.w; x++) { if ((x >= s.cx && x < s.cx + s.w && y >= s.cy && y < s.cy + s.h) || !t.inside(x, y)) continue; const i = t.idx(x, y), q = t.type[i]; if (!t.occupied[i] && !t.forest[i] && q !== T.WATER && q !== T.ROCK) open++; } if (open < 2) out.push([s.cx, s.cy, `${s.kind} has ${open} open squares beside it`]); }
  },
  // a dam's flood valley swallows its own stream (no strip of stream left standing in the flood)
  'stream outside its flood'(t, out) {
    for (const d of t.dams) { const st = (t.streams ?? []).find((s) => s.lake === d.lake); if (!st) continue; const z = new Set(d.zone), first = new Set(st.pts.slice(0, 40).map(([x, y]) => t.idx(Math.round(x), Math.round(y)))), upper = st.cells.filter((i) => first.has(i)), miss = upper.filter((i) => !z.has(i)).length; if (miss > upper.length * 0.2) out.push([d.x, d.y, `${miss} of ${upper.length} squares of the stream's upper course would stay dry in the flood`]); }
  },
  // lakes lie in low ground: most of the land round a lake is at its level, not cliffs
  'lake walled in'(t, out) {
    for (const lk of t.lakes) { let hi = 0, all = 0; for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI * 2, x = Math.round(lk[0] + Math.cos(an) * (lk[2] * 1.3)), y = Math.round(lk[1] + Math.sin(an) * (lk[2] * 1.3)); if (!t.inside(x, y)) continue; all++; if (t.elev[t.idx(x, y)] > 0) hi++; } if (hi > all * 0.25) out.push([Math.round(lk[0]), Math.round(lk[1]), `${Math.round((hi / all) * 100)}% of its shore is raised ground`]); }
  },
  // every lake has its dam (twins get matching ones)
  'lake without a dam'(t, out) { for (const [k, lk] of t.lakes.entries()) if (!t.dams.some((d) => d.lake === k)) out.push([Math.round(lk[0]), Math.round(lk[1]), 'no dam on this lake']); },
  // nothing built stands on water, a stream, a bridge or a road
  'building on water or road'(t, out) {
    for (const s of t.sites) for (let y = s.cy; y < s.cy + s.h; y++) for (let x = s.cx; x < s.cx + s.w; x++) {
      const q = t.type[t.idx(x, y)];
      if (q === T.WATER || q === T.FORD || q === T.BRIDGE || q === T.ROAD || q === T.ROCK) out.push([x, y, `${s.kind} on ${Object.keys(T)[q]}`]);
    }
  },
  // nothing stands on the citadel's shore, where the moat is drawn (its true edge wobbles a square either way)
  'building in the moat'(t, out) {
    const C = t.N / 2 - 0.5;
    for (const s of t.sites) for (const [x, y] of [[s.cx, s.cy], [s.cx + s.w - 1, s.cy], [s.cx, s.cy + s.h - 1], [s.cx + s.w - 1, s.cy + s.h - 1]]) { const d = Math.hypot(x - C, y - C); if (d > t.island - 1.5 && d < t.island + 4.5) { out.push([s.cx, s.cy, `${s.kind} on the moat's edge`]); break; } }
  },
  // buildings don't overlap each other
  'buildings overlap'(t, out) {
    const own = new Map();
    for (const s of t.sites) for (let y = s.cy; y < s.cy + s.h; y++) for (let x = s.cx; x < s.cx + s.w; x++) { const i = t.idx(x, y), o = own.get(i); if (o) out.push([x, y, `${s.kind} over ${o}`]); else own.set(i, s.kind); }
  },
  // a building sits on one level (not half up a cliff)
  'building across a cliff'(t, out) {
    for (const s of t.sites) { const e = new Set(); for (let y = s.cy; y < s.cy + s.h; y++) for (let x = s.cx; x < s.cx + s.w; x++) e.add(t.elev[t.idx(x, y)]); if (e.size > 1) out.push([s.cx, s.cy, s.kind]); }
  },
  // roads belong to the towns: none comes near a base, and every town hall has a street at its door
  'road by a base'(t, out) {
    for (const [bx, by] of t.bases) { let hit = null; for (let y = by - 18; y <= by + 18 && !hit; y++) for (let x = bx - 18; x <= bx + 18; x++) if (t.inside(x, y) && Math.hypot(x - bx, y - by) < 18 && t.type[t.idx(x, y)] === T.ROAD) { hit = [x, y]; break; } if (hit) out.push([...hit, 'a road inside a base']); }
  },
  // roads bend in curves: no corner sharper than 50 degrees along a road
  'sharp turn in road'(t, out) {
    for (const l of t.roadLines) for (let k = 1; k < l.length - 1; k++) { const ax = l[k][0] - l[k - 1][0], ay = l[k][1] - l[k - 1][1], bx = l[k + 1][0] - l[k][0], by = l[k + 1][1] - l[k][1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (la < 0.05 || lb < 0.05) continue; if ((ax * bx + ay * by) / (la * lb) < Math.cos((50 * Math.PI) / 180)) out.push([Math.round(l[k][0]), Math.round(l[k][1]), 'a sharp corner in a road']); }
  },
  'town without a street'(t, out) {
    for (const s of t.sites) { if (s.kind !== 'townHall') continue; let ok = false; for (let y = s.cy - 4; y <= s.cy + 5 && !ok; y++) for (let x = s.cx - 4; x <= s.cx + 5; x++) if (t.inside(x, y) && t.type[t.idx(x, y)] === T.ROAD) { ok = true; break; } if (!ok) out.push([s.cx, s.cy, 'a town hall with no street by it']); }
  },
  // roads never run through water (only over a bridge or through a ford or gate)
  'road through water'(t, out) {
    for (const l of t.roadLines) for (let k = 1; k < l.length; k++) { const [ax, ay] = l[k - 1], [bx, by] = l[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); for (let j = 0; j <= n; j++) { const x = Math.round(ax + ((bx - ax) * j) / n), y = Math.round(ay + ((by - ay) * j) / n); if (t.inside(x, y) && t.type[t.idx(x, y)] === T.WATER) { out.push([x, y, 'track in water']); break; } } }
  },
  // a road fords a given stream at most once (not back and forth); it touches a stream within three quarters of a square (distance, not rounding, so twins agree)
  'road crosses stream'(t, out) {
    for (const st of t.streams ?? []) {
      const on = new Set(st.cells);
      for (const l of t.roadLines) { let inside = false, crossings = 0, last = null; for (let k = 1; k < l.length; k++) { const [ax, ay] = l[k - 1], [bx, by] = l[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3); for (let j = 0; j <= n; j++) { const px = ax + ((bx - ax) * j) / n, py = ay + ((by - ay) * j) / n, x = Math.round(px), y = Math.round(py); let now = false; for (let cy = Math.floor(py); cy <= Math.floor(py) + 1; cy++) for (let cx = Math.floor(px); cx <= Math.floor(px) + 1; cx++) if (Math.hypot(cx - px, cy - py) <= 0.75 && on.has(t.idx(cx, cy))) now = true; if (now && !inside && (!last || Math.hypot(x - last[0], y - last[1]) > 3)) crossings++; if (now) last = [x, y]; inside = now; } } // touches within three squares are one ford
        if (crossings > 1) out.push([st.cells[0] % t.N, Math.floor(st.cells[0] / t.N), `one road crosses the same stream ${crossings} times`]); }
    }
  },
  // every dam faces exactly along its outflow and closes a real outlet: lake water just upstream, its stream just downstream
  'dam badly placed'(t, out) {
    for (const d of t.dams) {
      const face = Math.abs(d.ux) > Math.abs(d.uy) ? (d.ux > 0 ? 0 : 2) : d.uy > 0 ? 1 : 3;
      if (face !== d.face || (Math.abs(d.ux) > 0.01 && Math.abs(d.uy) > 0.01)) out.push([d.x, d.y, `dam facing ${d.face} but water runs ${d.ux.toFixed(2)},${d.uy.toFixed(2)} (not along a side)`]);
      const cx = d.x + 0.5, cy = d.y + 0.5;
      const up = t.type[t.idx(Math.round(cx - d.ux * 1.6), Math.round(cy - d.uy * 1.6))];
      if (up !== T.WATER) out.push([d.x, d.y, `no lake water behind the dam (found ${Object.keys(T)[up]})`]);
      const st = (t.streams ?? []).find((s) => s.lake === d.lake), first = st?.pts[0];
      if (!st || st.pts.length < 8) out.push([d.x, d.y, `its stream is missing or too short (${st?.pts.length ?? 0} steps)`]);
      else if (Math.hypot(first[0] - cx - d.ux * 1.9, first[1] - cy - d.uy * 1.9) > 0.8) out.push([d.x, d.y, 'its stream does not start at the dam']);
    }
  },
  // no stray specks of water: every pool is a lake, a pond, the river, or part of one
  'stray water'(t, out) {
    const seen = new Uint8Array(t.type.length);
    for (let i = 0; i < t.type.length; i++) {
      if (seen[i] || t.type[i] !== T.WATER) continue;
      const q = [i], comp = []; seen[i] = 1;
      while (q.length) { const c = q.pop(); comp.push(c); const x = c % t.N, y = Math.floor(c / t.N); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!t.inside(nx, ny)) continue; const j = t.idx(nx, ny); if (!seen[j] && (t.type[j] === T.WATER)) { seen[j] = 1; q.push(j); } } }
      if (comp.length < 9) out.push([comp[0] % t.N, Math.floor(comp[0] / t.N), `a speck of ${comp.length} water squares`]);
    }
  },
  // each lake and its outlet are one body of water (no second little lake beside it)
  'lake in pieces'(t, out) {
    for (const [k, lk] of t.lakes.entries()) {
      if (t.drained?.has(k)) continue;
      const start = t.idx(Math.round(lk[0]), Math.round(lk[1])); if (t.type[start] !== T.WATER) continue;
      const seen = new Set([start]), q = [start];
      while (q.length) { const c = q.pop(), x = c % t.N, y = Math.floor(c / t.N); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!t.inside(nx, ny) || Math.hypot(nx - lk[0], ny - lk[1]) > lk[2] * 2) continue; const j = t.idx(nx, ny); if (!seen.has(j) && t.type[j] === T.WATER) { seen.add(j); q.push(j); } } }
      for (let y = Math.floor(lk[1] - lk[2] * 1.8); y <= lk[1] + lk[2] * 1.8; y++) for (let x = Math.floor(lk[0] - lk[2] * 1.8); x <= lk[0] + lk[2] * 1.8; x++) if (t.inside(x, y) && t.type[t.idx(x, y)] === T.WATER && !seen.has(t.idx(x, y)) && t.riverD?.(x, y) > 6) { out.push([x, y, 'water beside a lake but not part of it']); y = 1e9; break; }
    }
  },
  // three fronts: halfway between each pair of neighbouring bases sits a flank compound (a fuel depot, a repair yard
  // and a power plant on dry land, off the roads), as far from both bases, and the citadel has a wide gate facing it
  'flank compound wrong'(t, out) {
    const C = t.N / 2 - 0.5, adiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b)), ang = (x, y) => Math.atan2(y - C, x - C);
    if (t.flanks?.length !== t.bases.length) { out.push([0, 0, `${t.flanks?.length ?? 0} flank compounds for ${t.bases.length} bases`]); return; }
    for (const [fx, fy] of t.flanks) {
      const x = Math.round(fx), y = Math.round(fy), mine = t.sites.filter((s) => Math.hypot(s.cx + s.w / 2 - 0.5 - fx, s.cy + s.h / 2 - 0.5 - fy) < 10);
      for (const kind of ['fuelDepot', 'repairYard', 'powerPlant']) if (!mine.some((s) => s.kind === kind)) out.push([x, y, `no ${kind} in the flank compound`]);
      for (const s of mine) for (let yy = s.cy - 1; yy <= s.cy + s.h; yy++) for (let xx = s.cx - 1; xx <= s.cx + s.w; xx++) if (t.inside(xx, yy) && t.type[t.idx(xx, yy)] === T.ROAD) { out.push([xx, yy, `a road through the flank compound (by its ${s.kind})`]); yy = 1e9; break; }
      const d = t.bases.map(([bx, by]) => Math.hypot(bx - fx, by - fy)).sort((p, q) => p - q);
      if (d[1] - d[0] > 2) out.push([x, y, `the flank compound is ${(d[1] - d[0]).toFixed(1)} squares nearer one base than the other`]);
      const fa = ang(fx, fy), g = t.gates.filter((g) => Math.abs(adiff(g, fa)) < 0.7).sort((p, q) => Math.abs(adiff(p, fa)) - Math.abs(adiff(q, fa)))[0];
      if (g === undefined) { out.push([x, y, 'no citadel gate faces this flank']); continue; }
      const r = t.island + 1.5, ford = (a) => t.type[t.idx(Math.round(C + Math.cos(a) * r), Math.round(C + Math.sin(a) * r))] === T.FORD; let lo = 0, hi = 0; // the shallows' width across the moat, along its middle
      if (ford(g)) { while (lo < 3 && ford(g - lo - 0.01)) lo += 0.01; while (hi < 3 && ford(g + hi + 0.01)) hi += 0.01; }
      if ((lo + hi) * r < 5) out.push([x, y, `the citadel's gate facing this flank is ${((lo + hi) * r).toFixed(1)} squares wide`]);
    }
  },
  // each bridge's two ends meet a road
  'bridge without road'(t, out) {
    for (const bx of t.bridgeCols ?? []) {
      let y0 = 1e9, y1 = -1; for (let y = 0; y < t.N; y++) if (t.type[t.idx(bx, y)] === T.BRIDGE) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (y1 < 0) continue;
      for (const [y, dir] of [[y0, -1], [y1, 1]]) { let ok = false; for (let k = 1; k <= 3 && !ok; k++) for (const x of [bx - 1, bx, bx + 1, bx + 2]) if (t.inside(x, y + dir * k) && t.type[t.idx(x, y + dir * k)] === T.ROAD) ok = true; if (!ok) out.push([bx, y, 'a bridge end with no road']); }
    }
  },
};

const n = +(process.argv[2] ?? 50), first = +(process.argv[3] ?? 1), players = +(process.argv[4] ?? 2);
const { mods: [TER], close } = await load('/src/terrain.ts');
const totals = {}, examples = {};
for (let s = first; s < first + n; s++) {
  const t = new TER.Terrain(s * 7919, players); t.N = TER.N;
  for (const [name, rule] of Object.entries(RULES)) {
    const out = []; rule(t, out);
    totals[name] = (totals[name] ?? 0) + out.length;
    if (out.length) (examples[name] ??= []).push(`map ${s * 7919}: ` + out.slice(0, 3).map(([x, y, m]) => `(${x},${y}) ${m}`).join('; ') + (out.length > 3 ? ` (+${out.length - 3} more)` : ''));
  }
}
const all = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`${n} ${players > 2 ? 'four-player ' : ''}maps: ${all} problems`);
for (const [name, k] of Object.entries(totals)) if (k) { console.log(`\n${name}: ${k}`); for (const e of examples[name].slice(0, 4)) console.log('  ' + e); }
await close();
