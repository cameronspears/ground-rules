// Loads the game's TypeScript modules in Node through Vite, so map checks run without a browser.
import { createServer } from 'vite';
export async function load(...paths) {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
  const mods = [];
  for (const p of paths) mods.push(await server.ssrLoadModule(p));
  return { mods, close: () => server.close() };
}
