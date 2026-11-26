// Runs the real game in Node with no screen: the same src/game.ts and src/ai.ts the browser runs, with a
// do-nothing stand-in for the canvas, storage and input (the shared part is tools/headless-core.js). Nothing is
// drawn, no pictures are baked and the map isn't painted; every rule (units, combat, economy, the computer) is
// the game's own code, untouched.
//   import { boot } from './headless.mjs';
//   const { game, match, close } = await boot({ seed: 777, rseed: 1, size: 362, rules: 'standard', level: 'normal' });
// rseed pins Math.random, so the same seed and rseed play the same match every time.
import { createServer } from 'vite';
import { prepare, make, fingerprint } from './headless-core.js';
export { fingerprint };

function fakeBrowser(store, [w, h, dpr]) {
  const noop = () => {};
  const imageData = (w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
  let ctx;
  const canvas = () => ({ width: 1, height: 1, style: {}, getContext: () => ctx, toDataURL: () => '', addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }), append: noop, setPointerCapture: noop, focus: noop });
  // a drawing context that accepts every call and draws nothing
  const calls = {
    createImageData: (a, b) => (typeof a === 'object' ? imageData(a.width, a.height) : imageData(a, b)),
    getImageData: (x, y, w, h) => imageData(w, h),
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), createPattern: () => ({}),
  };
  ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k in calls ? calls[k] : k === 'canvas' ? canvas() : noop), set: (o, k, v) => { o[k] = v; return true; } });
  const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() });
  const g = globalThis;
  g.window = g;
  g.document = { createElement: canvas, getElementById: canvas, body: canvas(), hidden: false, addEventListener: noop, removeEventListener: noop };
  g.addEventListener = noop; g.removeEventListener = noop;
  g.localStorage = storage(store); g.sessionStorage = storage(new Map());
  g.location = { search: '', reload: noop, href: '' };
  g.innerWidth = w; g.innerHeight = h; g.devicePixelRatio = dpr; // (the window's size moves the camera, and some effects on screen draw random numbers)
  g.matchMedia = () => ({ matches: false, addEventListener: noop });
  g.requestAnimationFrame = () => 0;
  g.ImageData = class { constructor(a, b, c) { const d = typeof a === 'object' ? a : null; this.width = d ? b : a; this.height = d ? c : b; this.data = d ?? new Uint8ClampedArray(this.width * this.height * 4); } };
  g.Worker = class { postMessage() {} terminate() {} addEventListener() {} };
  try { Object.defineProperty(g, 'navigator', { value: { hardwareConcurrency: 1, userAgent: 'node' }, configurable: true }); } catch {}
}

// opts: seed (the map), rseed (Math.random; leave out for a fresh match each time), size (272, 362 or 452),
// rules ('standard', 'autopilot', ...), level ('easy' .. 'brutal'), players (2 to 4), money, side and foe (WILD WEST: blue's and red's), pictures (see core),
// screen: the window it pretends to have, [width, height, pixel ratio]
export async function boot(opts = {}) {
  const { seed = 777, rseed, size = 362, rules = 'standard', level = 'normal', players = 2, money = 6000, side = 'settlers', foe = 'settlers', screen = [1280, 720, 1] } = opts;
  // settings the game reads at load (the map's size is fixed when the terrain module loads)
  fakeBrowser(new Map([['conquer-size', String(size)], ['conquer-rules', rules], ['conquer-level', level], ['conquer-players', String(players)], ['conquer-money', String(money)], ['conquer-hints', 'off'], ['conquer-learned', '1'], ['conquer-side', side], ['conquer-foe', foe]]), screen); // (side, foe: who blue and red play in WILD WEST, 'settlers' or 'nations')
  sessionStorage.setItem('conquer-seed', String(seed));
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
  const load = (p) => server.ssrLoadModule(p);
  const mods = { game: await load('/src/game.ts'), audio: await load('/src/audio.ts'), art: await load('/src/art.ts'), terrain: await load('/src/terrain.ts'), territory: await load('/src/territory.ts') };
  const match = await load('/tools/match.js'); // the same recorder the browser runs use
  prepare(mods, opts);
  await server.close(); // everything is loaded: the loader stops here, so it can't draw random numbers mid-match
  // Math.random is pinned last, once everything is loaded: the loader draws random numbers of its own (more on a
  // first run, as it fills its cache), which made the same seeds play different matches
  const game = make(mods.game.Game, document.body, rseed);
  match.bind(game);
  return { game, match, close: async () => {} };
}
