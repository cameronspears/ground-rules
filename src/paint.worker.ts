// Paints map chunks off the main thread. Each worker builds the same map (it's deterministic),
// prepares the painting tables, then paints the chunks it is given and sends the pixels back.
import { Terrain } from './terrain';

self.onmessage = (e: MessageEvent<{ seed: number; players: number; chunks: number[] }>) => {
  const t = new Terrain(e.data.seed, e.data.players);
  t.prepare();
  for (const i of e.data.chunks) {
    const { d, glints } = t.chunkPixels(i);
    (self as unknown as Worker).postMessage({ i, d, glints }, [d.buffer]);
  }
};
