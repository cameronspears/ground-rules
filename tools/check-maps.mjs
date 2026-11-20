// The "does this map make sense?" checker. Builds many random maps and tests each against rules
// that a real landscape obeys; prints every breach with where it is. Run after any map change:
//   node tools/check-maps.mjs [maps=50] [firstSeed=1]
// A clean run prints "0 problems". Rules live in RULES below: add one whenever we find a new kind of
// mistake, so it can never quietly come back.
import { load } from './load.mjs';

const T = { GRASS: 0, DIRT: 1, SCRAP: 2, WATER: 3, BRIDGE: 4, FORD: 5, ROCK: 6, ROAD: 7, FIELD: 8, PAVED: 9 }; // mirrors terrain.ts

const RULES = {
  // a dam's flood valley swallows its own stream (no strip of stream left standing in the flood)
  'stream outside its flood'(t, out) {
    for (const d of t.dams) { const st = (t.streams ?? []).find((s) => s.lake === d.lake); if (!st) continue; const z = new Set(d.zone), miss = st.cells.filter((i) => !z.has(i)).length; if (miss > st.cells.length * 0.2) out.push([d.x, d.y, `${miss} of ${st.cells.length} stream squares would stay dry in the flood`]); }
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
  // buildings don't overlap each other
  'buildings overlap'(t, out) {
    const own = new Map();
    for (const s of t.sites) for (let y = s.cy; y < s.cy + s.h; y++) for (let x = s.cx; x < s.cx + s.w; x++) { const i = t.idx(x, y), o = own.get(i); if (o) out.push([x, y, `${s.kind} over ${o}`]); else own.set(i, s.kind); }
  },
  // a building sits on one level (not half up a cliff)
  'building across a cliff'(t, out) {
    for (const s of t.sites) { const e = new Set(); for (let y = s.cy; y < s.cy + s.h; y++) for (let x = s.cx; x < s.cx + s.w; x++) e.add(t.elev[t.idx(x, y)]); if (e.size > 1) out.push([s.cx, s.cy, s.kind]); }
  },
  // roads never run through water (only over a bridge or through a ford or gate)
  'road through water'(t, out) {
    for (const l of t.roadLines) for (let k = 1; k < l.length; k++) { const [ax, ay] = l[k - 1], [bx, by] = l[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); for (let j = 0; j <= n; j++) { const x = Math.round(ax + ((bx - ax) * j) / n), y = Math.round(ay + ((by - ay) * j) / n); if (t.inside(x, y) && t.type[t.idx(x, y)] === T.WATER) { out.push([x, y, 'track in water']); break; } } }
  },
  // a road fords a given stream at most once (not back and forth)
  'road crosses stream'(t, out) {
    for (const st of t.streams ?? []) {
      const on = new Set(st.cells);
      for (const l of t.roadLines) { let inside = false, crossings = 0, last = null; for (let k = 1; k < l.length; k++) { const [ax, ay] = l[k - 1], [bx, by] = l[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3); for (let j = 0; j <= n; j++) { const x = Math.round(ax + ((bx - ax) * j) / n), y = Math.round(ay + ((by - ay) * j) / n), now = on.has(t.idx(x, y)); if (now && !inside && (!last || Math.hypot(x - last[0], y - last[1]) > 3)) crossings++; if (now) last = [x, y]; inside = now; } } // touches within three squares are one ford
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
  // each bridge's two ends meet a road
  'bridge without road'(t, out) {
    for (const bx of t.bridgeCols ?? []) {
      let y0 = 1e9, y1 = -1; for (let y = 0; y < t.N; y++) if (t.type[t.idx(bx, y)] === T.BRIDGE) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (y1 < 0) continue;
      for (const [y, dir] of [[y0, -1], [y1, 1]]) { let ok = false; for (let k = 1; k <= 3 && !ok; k++) for (const x of [bx - 1, bx, bx + 1, bx + 2]) if (t.inside(x, y + dir * k) && t.type[t.idx(x, y + dir * k)] === T.ROAD) ok = true; if (!ok) out.push([bx, y, 'a bridge end with no road']); }
    }
  },
};

const n = +(process.argv[2] ?? 50), first = +(process.argv[3] ?? 1);
const { mods: [TER], close } = await load('/src/terrain.ts');
const totals = {}, examples = {};
for (let s = first; s < first + n; s++) {
  const t = new TER.Terrain(s * 7919, 2); t.N = TER.N;
  for (const [name, rule] of Object.entries(RULES)) {
    const out = []; rule(t, out);
    totals[name] = (totals[name] ?? 0) + out.length;
    if (out.length) (examples[name] ??= []).push(`map ${s * 7919}: ` + out.slice(0, 3).map(([x, y, m]) => `(${x},${y}) ${m}`).join('; ') + (out.length > 3 ? ` (+${out.length - 3} more)` : ''));
  }
}
const all = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`${n} maps: ${all} problems`);
for (const [name, k] of Object.entries(totals)) if (k) { console.log(`\n${name}: ${k}`); for (const e of examples[name].slice(0, 4)) console.log('  ' + e); }
await close();
