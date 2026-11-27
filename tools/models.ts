// The model sheet (see models.html): bakes models the way the game does and draws them large on grass.
import { ART, BASE, CIVIC, LIFE } from '../src/art';
import { bake, facing, Sprite } from '../src/bake';
import * as M from '../src/models';
import { LOOK } from '../src/look';
import { YAW } from '../src/terrain';

const q = new URLSearchParams(location.search);
const part = q.get('part') ?? 'units', night = q.get('night') === '1', only = q.get('only')?.split(',');
const TEAMS: number[][] = (M as any).TEAMS ?? [0x4a78a8, 0xb04434, 0x8a8a82].map(M.teamColors); // (older code kept them in game.ts)
const INFANTRY = ['rifle', 'rocket', 'grenadier'];
const cv = document.getElementById('c') as HTMLCanvasElement, ctx = cv.getContext('2d')!;
const GRASS = '#5f7440', LABEL = 14;

type Item = { name: string; draw: (x: number, y: number) => void; w: number; h: number };
const items: Item[] = [];
const S = +(q.get('scale') ?? (part === 'zoom' ? 1 : part === 'units' || part === 'life' ? 3 : 2));

let g: CanvasRenderingContext2D; // where the models are drawn: a small canvas, blown up after
function put(sp: Sprite, x: number, y: number) {
  g.globalAlpha = 0.3; g.drawImage(sp.shadow, Math.round(x - sp.ax), Math.round(y - sp.ay)); g.globalAlpha = 1;
  g.drawImage(sp.img, Math.round(x - sp.ax), Math.round(y - sp.ay));
}
// A unit at a screen angle (0 = east, clockwise), its turret on top as the game places it
const PAINT = [0x5a7a9a, 0x8a3a2a].map(M.teamColors); // (cars and people: two of the game's paints)
function unit(key: string, team: number, n: number) {
  const life = !ART[key], tc = life ? PAINT[team] : TEAMS[team];
  const def = (ART[key] ?? LIFE[key])(), body = bake(def, 'body', { facings: n, team: tc }), tur = def.turret ? bake(def, 'turret', { facings: n, team: tc }) : null;
  return (x: number, y: number, a: number) => {
    put(facing(body, a), x, y);
    if (tur) { const at = def.turretAt!, ox = at[0] - def.bodyPivot[0], oz = at[2] - def.bodyPivot[2], c = Math.cos(a), s = Math.sin(a); put(facing(tur, a), x + ox * c - oz * s, y + ox * s + oz * c - (at[1] - def.bodyPivot[1])); }
  };
}
function building(make: () => M.ModelDef, team: number) {
  const def = make(), sp = bake(def, 'body', { team: TEAMS[team], yaw: YAW, lit: true })[0], tur = def.turret ? bake(def, 'turret', { facings: 32, team: TEAMS[team] }) : null;
  const R = Math.max(def.body.max[0] - def.body.min[0], def.body.max[2] - def.body.min[2]);
  return { R, draw: (x: number, y: number) => {
    put(sp, x, y);
    if (tur) { const at = def.turretAt!, ox = at[0] - def.bodyPivot[0], oz = at[2] - def.bodyPivot[2], C = Math.cos(YAW), Sn = Math.sin(YAW); put(facing(tur, Math.PI * 0.25 + YAW), x + C * ox - Sn * oz, y + (Sn * ox + C * oz) * 0.5 - at[1]); }
  } };
}

const pick = (keys: string[]) => keys.filter((k) => !only || only.includes(k));
if (part === 'units' || part === 'zoom' || part === 'life') {
  const keys = pick(part === 'life' ? Object.keys(LIFE) : Object.keys(ART).filter((k) => k !== 'fieldCommand'));
  const angles = [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, Math.PI];
  for (const k of keys) {
    const n = INFANTRY.includes(k) || ['civilian', 'cow', 'deer'].includes(k) ? 8 : part === 'life' ? 16 : 32, draws = [0, 1].map((t) => unit(k, t, n)), big = k === 'colossus' ? 96 : ['quad', 'artillery'].includes(k) ? 66 : ['bomber', 'gunship'].includes(k) ? 62 : 40;
    const cell = INFANTRY.includes(k) || k === 'civilian' ? 16 : part === 'life' ? 24 : big;
    items.push({ name: k, w: cell * angles.length * 2 + 8, h: cell + 6, draw: (x, y) => draws.forEach((d, t) => angles.forEach((a, i) => d(x + cell / 2 + (t * angles.length + i) * cell + t * 8, y + cell * 0.6, a))) });
  }
} else {
  const src = part === 'base' ? { ...BASE, fieldCommand: ART.fieldCommand } : CIVIC;
  for (const k of pick(Object.keys(src))) {
    if (k === 'road') continue;
    const teams = part === 'base' ? [0, 1] : [2, 0];
    const bs = teams.map((t) => building(src[k], t)), cell = Math.round(bs[0].R * 1.45 + 20);
    items.push({ name: k, w: cell * 2, h: Math.round(cell * 0.95), draw: (x, y) => bs.forEach((b, i) => b.draw(x + cell / 2 + i * cell, y + cell * 0.62)) });
  }
}

// lay out in rows that fit 1600 screen pixels
const W = Math.floor(1600 / S); let x = 0, y = 0, rowH = 0; const at: [Item, number, number][] = [];
for (const it of items) { if (x + it.w > W && x > 0) { x = 0; y += rowH + LABEL; rowH = 0; } at.push([it, x, y + LABEL]); x += it.w + 4; rowH = Math.max(rowH, it.h); }
const H = y + rowH + LABEL;
const off = document.createElement('canvas'); off.width = W; off.height = H;
const o = off.getContext('2d')!;
o.fillStyle = GRASS; o.fillRect(0, 0, W, H);
g = o;
for (const [it, ix, iy] of at) it.draw(ix, iy);
if (night) { o.globalCompositeOperation = 'multiply'; const [r, g, b] = [112, 128, 186].map((c) => c + (255 - c) * LOOK.night); o.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; o.fillRect(0, 0, W, H); o.globalCompositeOperation = 'source-over'; }
cv.width = W * S; cv.height = H * S;
ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, W * S, H * S);
ctx.font = '12px monospace'; ctx.fillStyle = '#fff';
for (const [it, ix, iy] of at) ctx.fillText(it.name, ix * S + 2, (iy - LABEL) * S + 12);
cv.style.filter = `contrast(${LOOK.contrast}) saturate(${LOOK.saturate}) brightness(${LOOK.bright})`;
document.title = `done ${cv.width}x${cv.height}`;
