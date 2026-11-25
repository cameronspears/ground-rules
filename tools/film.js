// Film a computer-vs-computer match as a sped-up demo reel. It plays the match, points the camera at whatever is
// happening (a dam bursting, the biggest fight, bases going up), lights it as the game does (nights included), writes
// a caption on each frame, and posts each frame as a JPEG to a local helper that saves it (a tiny server on port 5298).
//   const F = await import('/tools/film.js'); await F.start(); await F.run(25)   (call run again if the tool call times out)
// Then stitch the frames with ffmpeg.
import { text, textWidth } from '/src/font.ts';
const g = window.game, CELL = 24, SINK = 'http://127.0.0.1:5298/';
let n = 0, t0 = 0, aim = null, label = '', holdUntil = 0, cut = false;
const burst = new Set();

export async function start(level = 'hard', plan1 = 'armour', plan0 = 'siege') {
  g.level = level; g.plan = plan1; g.menu('deploy');
  const { AI } = await import('/src/ai.ts');
  g.ais.push(new AI(g, g.level, 0, plan0));
  g.hints = false; g.saveGame = async () => {};
  t0 = g.time; n = 0;
  g.vis.fill(2); g.buildFogMask(); // the viewer sees the whole map: no fog
  return g.ais.map((a) => [a.me, a.plan]);
}

const mid = (bs) => [bs.reduce((s, b) => s + (b.cx + b.w / 2) * CELL, 0) / bs.length, bs.reduce((s, b) => s + (b.cy + b.h / 2) * CELL, 0) / bs.length];
const look = (at, words, hold) => { if (!at) return; if (!aim || Math.hypot(at[0] - aim[0], at[1] - aim[1]) > 40 * CELL) cut = true; aim = at; label = words; holdUntil = g.time + hold; };

// what to look at: a dam that just burst; else the biggest fight; else bases going up (early) or the newest building work
function pick() {
  for (const d of g.dams) if (d.burst && !burst.has(d)) { burst.add(d); look([(d.b.cx + d.b.w / 2) * CELL, (d.b.cy + d.b.h / 2) * CELL], 'A DAM BURSTS: THE VALLEY FLOODS', 20); return; }
  if (g.time < holdUntil) { if (label === 'BATTLE') follow(); return; }
  if (follow()) return;
  const m = (g.time - t0) / 60, side = Math.floor((g.time - t0) / 40) % 2;
  if (m < 8) { const [bx, by] = g.terrain.bases[side], bs = g.blds.filter((b) => b.team === side && b.dying < 0 && Math.hypot(b.cx - bx, b.cy - by) < 22); look(bs.length ? mid(bs) : [bx * CELL, by * CELL], `${side ? 'RED' : 'BLUE'} BASE GOING UP`, 12); return; }
  const sites = g.blds.filter((b) => b.team < 2 && b.rise < 1 && b.dying < 0 && b.type !== 'wall');
  if (sites.length) { const s = sites[sites.length - 1]; look(mid([s]), `${s.team ? 'RED' : 'BLUE'} BUILDS OUT`, 10); }
}
// the biggest fight on the map (units with a target, counted in patches), followed as it moves
function follow() {
  const cells = new Map();
  for (const u of g.units) if (u.team < 2 && u.target && u.def.weapon) { const k = Math.floor(u.x / (CELL * 14)) + ',' + Math.floor(u.y / (CELL * 14)); (cells.get(k) ?? cells.set(k, []).get(k)).push(u); }
  const best = [...cells.values()].sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 6) return false;
  look([best.reduce((s, u) => s + u.x, 0) / best.length, best.reduce((s, u) => s + u.y, 0) / best.length], 'BATTLE', 8);
  return true;
}

function caption() {
  const ctx = g.ctx, m = Math.floor((g.time - t0) / 60), night = g.darkness() > 0.5;
  const line = `MINUTE ${m}${night ? '  /  NIGHT' : ''}${label ? '  /  ' + label : ''}`, s = 2, w = textWidth(line, s);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const W = g.ctx.canvas.width, x = Math.round((W - w) / 2), y = 14;
  ctx.fillStyle = 'rgba(10,10,12,0.7)'; ctx.fillRect(x - 10, y - 6, w + 20, 7 * s + 12);
  text(ctx, line, x, y, '#e8c060', s);
  ctx.restore();
}

export async function run(min, budget = 100000) {
  const t1 = performance.now();
  while (g.time - t0 < min * 60 && performance.now() - t1 < budget && g.state === 'play') {
    for (let i = 0; i < 20; i++) g.update(1 / 20); // one game second per frame
    if (n % 3 === 0 || !aim) pick();
    if (aim) { g.centre(aim[0], aim[1]); if (cut) { g.vx = g.goalX; g.vy = g.goalY; cut = false; } else { g.vx += (g.goalX - g.vx) * 0.3; g.vy += (g.goalY - g.vy) * 0.3; } }
    g.vis.fill(2); g.select([], false); g.selBld = null; g.bark = { who: '', line: '', t: 0 };
    g.render(); caption();
    await fetch(SINK + '?n=' + n, { method: 'POST', body: g.ctx.canvas.toDataURL('image/jpeg', 0.85) });
    n++;
    await new Promise((r) => setTimeout(r, 0));
  }
  return { frames: n, minute: Math.round(((g.time - t0) / 60) * 10) / 10, state: g.state, dams: burst.size };
}
