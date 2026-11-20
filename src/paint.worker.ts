// Paints map chunks off the main thread. Each worker builds the same map (it's deterministic),
// prepares the painting tables, then paints the chunks it is given and sends the pixels back.
import { Terrain } from './terrain';

// A layer (winter's ice, a drained lake's mud) is painted the same way, only the changed parts.
self.onmessage = (e: MessageEvent<{ seed: number; players: number; chunks: number[]; mode?: 'ice' | 'drain'; drained?: number[] }>) => {
  const t = new Terrain(e.data.seed, e.data.players);
  for (const k of e.data.drained ?? []) t.drainLake(k);
  t.prepare();
  t.paintMode = e.data.mode ?? null;
  for (const i of e.data.chunks) {
    const { d, glints } = t.chunkPixels(i);
    (self as unknown as Worker).postMessage({ i, d, glints, mode: e.data.mode }, [d.buffer]);
  }
};
