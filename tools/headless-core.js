// The part of the headless runner that works anywhere: in Node (tools/headless.mjs, with a stand-in for the
// browser) or in the browser itself (to check the two play the same match). It swaps the game's loading for one
// that bakes no pictures and paints no map, and pins Math.random so a seed always plays the same match.

// A small, fast, seedable stand-in for Math.random (mulberry32)
export function seeded(s) {
  let a = s >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// mods: the game's own modules ({ game, audio, art, terrain, territory }, as loaded from /src)
// opts.pictures: keep everything skipped below for the screen (slower; to check that skipping it changes nothing)
export function prepare(mods, opts = {}) {
  const { Game } = mods.game, { ART, CIVIC, BASE, LIFE } = mods.art, { N, MINI, Terrain } = mods.terrain, { Territory } = mods.territory;
  const skip = !opts.pictures;
  // a list that stays empty: smoke, blasts, tracers, flames, flares and fallen soldiers are only ever drawn
  const none = []; none.push = () => 0; none.unshift = () => 0; none.filter = () => none; none.shift = () => undefined;
  mods.audio.audio.start = () => {}; // no sound: it never starts, and every sound asks for it first
  // Blank pictures built from the real models: the rules read a look in a few places (a unit with a turret swings
  // it to aim instead of turning its hull; a dying soldier leaves a body), so each look carries its model, turret and all
  const blank = () => { const c = document.createElement('canvas'); return { img: c, ax: 0, ay: 0, shadow: c }; };
  const turns = (n) => Array.from({ length: n }, blank);
  const models = { ...ART, ...CIVIC, ...BASE, ...LIFE }, made = new Map();
  const look = (k) => { // 'tank1' -> the tank model; 'dam02' -> dam0; 'civilian2' -> civilian
    let key = k; while (key && !models[key]) key = key.slice(0, -1);
    if (!key) return undefined;
    if (!made.has(key)) { const def = models[key](); made.set(key, { def, body: turns(32), turret: def.turret ? turns(32) : undefined }); }
    return made.get(key);
  };
  const looks = () => new Proxy({}, { get: (o, k) => (typeof k !== 'string' || k in o ? o[k] : (o[k] = look(k))), has: (o, k) => k in o ? o[k] !== undefined : !!look(String(k)) }); // (each answer kept: the rules ask for a unit's look every frame)
  // instead of baking pictures and painting the map: what load() does that play needs
  Game.prototype.load = async function () {
    this.looks = looks(); this.lifeLooks = looks(); this.icons = new Proxy({}, { get: () => blank() });
    this.treeLooks = Array.from({ length: 6 }, () => ({ stand: blank(), fall: [0, 1, 2, 3].map(() => turns(3)) })); // six kinds of tree, as the browser bakes
    this.stumpLook = blank();
    this.terrain.finish(); this.populate(); this.state = 'title';
    if (skip) for (const k of ['puffs', 'blasts', 'tracers', 'fires', 'flares', 'bodies']) this[k] = none;
  };
  Game.prototype.render = () => {};
  Game.prototype.saveGame = async () => {};
  // What the update makes only for the screen, skipped. Nothing in the rules reads any of it, and decoration draws its own
  // random numbers (fx in game.ts), so skipping it can't shift a dice roll: the fog's soft-edged image and the radar's pictures of
  // fog and land (the rules use the vis table, still kept) and the border lines (together 40% of a run), paint pressed into the ground (craters, rubble,
  // tracks), the people and animals of the countryside, and the effects lists above. --check proves it, bit for bit.
  if (skip) {
    Game.prototype.buildFogMask = function () { this.fogMask.width = N; this.fogMask.height = N; };
    Game.prototype.drawFogMini = function () { this.fogMini.width = MINI.s; };
    Game.prototype.drawLandMini = () => {};
    Territory.prototype.trace = function () { this.lines.clear(); };
    Terrain.prototype.stamp = () => {};
    Game.prototype.updateLife = () => {};
  }
}

// Makes the game, with Math.random pinned to rseed first (left out: a different match each time)
export const draws = { n: 0 }; // how many random numbers the game has drawn (to find where two runs part)
export function make(Game, host, rseed) {
  if (rseed !== undefined) { const r = seeded(rseed); Math.random = () => { draws.n++; return r(); }; }
  return new Game(host); // (its constructor runs the load above, all at once: nothing in it waits)
}

// Everything the fingerprint covers, written out, to see what two runs that part disagree on
export function snapshot(g) {
  const r = (v) => Math.round(v * 1000) / 1000;
  return { time: r(g.time), credits: g.prods.map((p) => r(p.credits)), units: g.units.map((u) => [u.id, u.type, u.team, r(u.x), r(u.y), r(u.hp), r(u.xp ?? 0), r(u.heading)]), blds: g.blds.map((b) => [b.type, b.team, b.cx, b.cy, r(b.hp), r(b.rise)]) };
}

// A fingerprint of everything play changes: every unit and building (where, how healthy, whose), each side's
// money, the land and the clock. Two runs with the same fingerprint played the same match.
// exact: every bit of every number (to find the first sliver two runs differ by), not rounded to a 16th
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
export function fingerprint(g, exact = false) {
  let h = 2166136261;
  const mix = exact ? (v) => { f64[0] = v; h = Math.imul(h ^ u32[0], 16777619) >>> 0; h = Math.imul(h ^ u32[1], 16777619) >>> 0; } : (v) => { h = Math.imul(h ^ (Math.round(v * 16) | 0), 16777619) >>> 0; };
  mix(g.time); mix(g.units.length); mix(g.blds.length);
  for (const u of g.units) { mix(u.id ?? 0); mix(u.team); mix(u.x); mix(u.y); mix(u.hp); mix(u.xp ?? 0); if (exact) { mix(u.heading); mix(u.fwd ?? 0); } for (const c of u.type) mix(c.charCodeAt(0)); }
  for (const b of g.blds) { mix(b.team); mix(b.cx); mix(b.cy); mix(b.hp); mix(b.rise); }
  for (const p of g.prods) mix(p.credits);
  for (let i = 0; i < g.territory.owner.length; i += 7) mix(g.territory.owner[i]);
  return h.toString(16);
}
