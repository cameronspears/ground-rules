// Paints map chunks off the main thread. Each worker builds the same map (it's deterministic),
// prepares the painting tables, then paints the chunks it is given and sends the pixels back.
import { Terrain } from './terrain';

self.onmessage = (e: MessageEvent<number[]>) => {
  const t = new Terrain();
  t.prepare();
  for (const i of e.data) {
    const { d, glints } = t.chunkPixels(i);
    (self as unknown as Worker).postMessage({ i, d, glints }, [d.buffer]);
  }
};
