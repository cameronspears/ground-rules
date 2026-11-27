// Paint fingerprints: paints a spread of map chunks (and a drained-lake layer and a bridge patch) on a few
// maps and hashes every pixel, so a change to the painter can prove it paints exactly the same. Also times each chunk.
//   node tools/paint-hash.mjs [std|west] [--save file] [--check file]   (runs one kind of map per run: WEST is fixed when the code loads)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { load } from './load.mjs';
const args = process.argv.slice(2), west = args[0] === 'west', flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
globalThis.self = { name: `n=362${west ? 'w' : ''}` }; // how a paint worker learns the map's size and kind
const { mods: [TER], close } = await load('/src/terrain.ts');
const { Terrain, toScreen, CELL, CH } = TER;
const out = {}, times = [];
const paint = (t, key, i) => {
  const s = performance.now(), { d, glints } = t.chunkPixels(i); times.push(performance.now() - s);
  out[key] = createHash('sha1').update(d).update(String(glints)).digest('hex').slice(0, 16);
};
const chunkAt = (t, gx, gy) => { const [sx, sy] = toScreen(gx, gy); return Math.floor((sy + 24) / CH) * t.cw + Math.floor(sx / CH); };
for (const seed of [7919, 31676]) for (const players of [2, 4]) {
  const t = new Terrain(seed, players); t.prepare();
  const need = t.neededChunks(...toScreen(t.bases[0][0] * CELL, t.bases[0][1] * CELL));
  for (let k = 0; k < need.length; k += Math.ceil(need.length / 7)) paint(t, `${seed}/${players}/${need[k]}`, need[k]);
  if (players === 2) { // the layers painted during play: a drained lake, and a patch over a bridge
    if (t.lakes.length) { const d = new Terrain(seed, players); d.drainLake(0); d.prepare(); d.paintMode = 'drain'; const i = chunkAt(d, (t.lakes[0][0] + 0.5) * CELL, (t.lakes[0][1] + 0.5) * CELL); paint(d, `${seed}/drain/${i}`, i); }
    const b = t.bridgeCols[0];
    if (b !== undefined) { const p = new Terrain(seed, players), bx = b % 362, by = Math.floor(b / 362); for (let y = by - 2; y <= by + 2; y++) for (let x = bx - 2; x <= bx + 2; x++) p.patchMask.add(y * 362 + x); p.prepare(); p.paintMode = 'patch'; const i = chunkAt(p, (bx + 0.5) * CELL, (by + 0.5) * CELL); paint(p, `${seed}/patch/${i}`, i); }
  }
}
times.sort((a, b) => a - b);
console.log(`${west ? 'west' : 'std'}: ${times.length} chunks, median ${times[times.length >> 1].toFixed(0)} ms, mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)} ms a chunk`);
if (flag('--save')) writeFileSync(flag('--save'), JSON.stringify(out, null, 1));
if (flag('--check')) {
  const old = JSON.parse(readFileSync(flag('--check'), 'utf8')), bad = Object.keys(old).filter((k) => old[k] !== out[k]);
  console.log(bad.length ? `${bad.length} DIFFERENT: ${bad.join(' ')}` : `all ${Object.keys(old).length} identical`);
}
close?.();
