// Paints map chunks off the main thread. At load the game hands each worker the map once (keep: it
// stays set up) and then one chunk at a time as each finishes, so fast cores do more of the work.
// Other jobs (a layer: winter's ice, a drained lake's mud, a patch) make the map from the seed and
// paint only the changed parts.
import { Terrain } from './terrain';

let kept: Terrain | null = null;
self.onmessage = (e: MessageEvent<{ seed: number; players: number; chunks: number[]; mode?: 'ice' | 'drain' | 'patch'; drained?: number[]; cells?: [number, number][]; mask?: number[]; map?: Record<string, unknown>; keep?: boolean }>) => {
  let t: Terrain;
  if (e.data.keep && kept && !e.data.map) t = kept;
  else {
    t = e.data.map ? Terrain.fromData(e.data.map) : new Terrain(e.data.seed, e.data.players); // the map itself when the game hands it over (much quicker than making it again)
    for (const k of e.data.drained ?? []) t.drainLake(k);
    for (const [i, ty] of e.data.cells ?? []) t.type[i] = ty; // squares changed since the map was made (fallen bridges)
    t.patchMask = new Set(e.data.mask ?? []);
    t.prepare();
    t.paintMode = e.data.mode ?? null;
    if (e.data.keep) kept = t;
  }
  for (const i of e.data.chunks) {
    const { d, glints } = t.chunkPixels(i);
    (self as unknown as Worker).postMessage({ i, d, glints, mode: e.data.mode }, [d.buffer]);
  }
};
