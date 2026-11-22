// Road gaps: walks every road on a few maps and checks it is painted along its whole length (not counting water,
// bridges, fords, buildings or raised ground). Roads used to vanish wherever the water's soft edge painted over them.
//   node tools/check-roads.mjs [seeds=7919,15838,23757,31676]   -> must print 0 gaps for every map
import { load } from './load.mjs';
const { mods: [TER], close } = await load('/src/terrain.ts');
const { toScreen, CELL } = TER;
const isRoad = (c) => { const r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255; return r >= 70 && r <= 150 && g >= 55 && g <= 125 && b >= 35 && b <= 95 && r >= g - 4; };
const res = [];
for (const seed of (process.argv[2] ?? '7919,15838,23757,31676').split(',').map(Number)) {
  const t = new TER.Terrain(seed, 2); t.prepare(); const gaps = [];
  for (const l of t.roadLines) {
    let run = 0, start = null;
    for (let k = 1; k < l.length; k++) {
      const [ax, ay] = l[k - 1], [bx, by] = l[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let j = 0; j < n; j++) {
        const x = ax + (bx - ax) * j / n, y = ay + (by - ay) * j / n, cx = Math.round(x), cy = Math.round(y);
        const ty = t.inside(cx, cy) ? t.type[t.idx(cx, cy)] : 3;
        const skip = ty === 3 || ty === 4 || ty === 5 || t.occupied[t.idx(cx, cy)] || t.elev[t.idx(cx, cy)] > 0; // water, bridge, ford, a building, raised
        const [sx, sy] = toScreen(x * CELL + 12, y * CELL + 12);
        let ok = skip; if (!skip) for (const [ox, oy] of [[0, 0], [3, 0], [-3, 0], [0, 2], [0, -2]]) if (isRoad(t.pixel(Math.round(sx) + ox, Math.round(sy) + oy))) ok = true;
        if (!ok) { if (!run) start = [x, y]; run++; } else { if (run >= 3) gaps.push(start.map((v) => Math.round(v)).join(',') + ' x' + run); run = 0; }
      }
    }
  }
  res.push(`${seed}: ${gaps.length} gaps ${gaps.slice(0, 6).join(' ')}`);
}
console.log(res.join('\n')); close?.();
