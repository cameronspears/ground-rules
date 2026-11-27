// The model sheet (see models.html): bakes models the way the game does and draws them large on grass.
import { ART, BASE, CIVIC, LIFE, SWARM } from '../src/art';
import { WILD as SETTLERS, NATIONS, EXTRAS, saguaro, sagebrush } from '../src/west';
import { bake, facing, Sprite } from '../src/bake';
import * as M from '../src/models';
import { LOOK } from '../src/look';
import { YAW } from '../src/terrain';

const q = new URLSearchParams(location.search);
const WILD = q.get('side') === 'nations' ? { ...SETTLERS, ...NATIONS } : q.get('part') === 'extras' ? EXTRAS : SETTLERS; // ?side=nations: the Plains Nations' looks; ?part=extras: the frontier's extra life and traffic
const part = q.get('part') ?? 'units', night = q.get('night') === '1', only = q.get('only')?.split(',');
const TEAMS: number[][] = (M as any).TEAMS ?? [0x4a78a8, 0xb04434, 0x8a8a82].map(M.teamColors); // (older code kept them in game.ts)
const INFANTRY = ['rifle', 'rocket', 'grenadier'];
const cv = document.getElementById('c') as HTMLCanvasElement, ctx = cv.getContext('2d')!;
const GRASS = part === 'west' || part === 'extras' || part === 'review' ? '#c09a66' : '#5f7440', LABEL = 14;

type Item = { name: string; draw: (x: number, y: number) => void; w: number; h: number };
const items: Item[] = [];
const S = +(q.get('scale') ?? (part === 'zoom' ? 1 : part === 'units' || part === 'life' || part === 'west' || part === 'extras' ? 3 : 2));

let g: CanvasRenderingContext2D; // where the models are drawn: a small canvas, blown up after
function put(sp: Sprite, x: number, y: number) {
  g.globalAlpha = 0.3; g.drawImage(sp.shadow, Math.round(x - sp.sx), Math.round(y - sp.sy)); g.globalAlpha = 1;
  g.drawImage(sp.img, Math.round(x - sp.ax), Math.round(y - sp.ay));
}
// A unit at a screen angle (0 = east, clockwise), its turret on top as the game places it
const PAINT = [0x5a7a9a, 0x8a3a2a].map(M.teamColors); // (cars and people: two of the game's paints)
function unit(key: string, team: number, n: number) {
  const life = !ART[key] && !SWARM[key] && key !== 'camp', tc = life ? PAINT[team] : TEAMS[team];
  const def = ((part === 'west' && WILD[key]) || (part === 'swarm' && SWARM[key]) || ART[key] || SWARM[key] || LIFE[key])(), body = bake(def, 'body', { facings: n, team: tc }), tur = def.turret ? bake(def, 'turret', { facings: n, team: tc }) : null;
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
if (part === 'units' || part === 'zoom' || part === 'life' || part === 'swarm') {
  const keys = pick(part === 'swarm' ? [...Object.keys(SWARM).filter((k) => !/^droneTruck\d/.test(k)), 'quad'] : part === 'life' ? Object.keys(LIFE) : Object.keys(ART).filter((k) => k !== 'fieldCommand'));
  const angles = [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, Math.PI];
  for (const k of keys) {
    const n = INFANTRY.includes(k) || ['civilian', 'cow', 'deer'].includes(k) ? 8 : part === 'life' ? 16 : 32, draws = [0, 1].map((t) => unit(k, t, n)), big = k === 'colossus' ? 96 : ['quad', 'artillery'].includes(k) || k.startsWith('droneTruck') || (part === 'swarm' && k === 'tank') || (part === 'swarm' && k === 'gunship') ? 66 : ['bomber', 'gunship'].includes(k) ? 62 : 40;
    const cell = INFANTRY.includes(k) || k === 'civilian' ? 16 : part === 'life' ? 24 : big;
    items.push({ name: k, w: cell * angles.length * 2 + 8, h: cell + 6, draw: (x, y) => draws.forEach((d, t) => angles.forEach((a, i) => d(x + cell / 2 + (t * angles.length + i) * cell + t * 8, y + cell * 0.6, a))) });
  }
} else if (part === 'review') { // ?part=review: every unit as the army has it, the Settlers and the Plains Nations, side by side at one angle in both teams' colours (scale 1 is game size)
  const a = Math.PI * 0.75, kinds = Object.keys(ART).filter((k) => k !== 'fieldCommand' && (q.get('only') ? only!.includes(k) : true));
  const sets: [string, Record<string, () => M.ModelDef>][] = [['army', ART], ['settlers', SETTLERS], ['nations', { ...SETTLERS, ...NATIONS }]];
  for (const k of kinds) {
    const cell = k === 'colossus' ? 70 : ['juggernaut', 'artillery', 'bomber', 'gunship'].includes(k) ? 46 : INFANTRY.includes(k) ? 14 : 32;
    const draws = sets.flatMap(([, src]) => [0, 1].map((t) => { const d = (src[k] ?? ART[k])(), n = INFANTRY.includes(k) ? 8 : 32, body = bake(d, 'body', { facings: n, team: TEAMS[t] }), tur = d.turret ? bake(d, 'turret', { facings: n, team: TEAMS[t] }) : null; return (x: number, y: number) => { put(facing(body, a), x, y); if (tur) { const at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2], c = Math.cos(a), sn = Math.sin(a); put(facing(tur, a), x + ox * c - oz * sn, y + ox * sn + oz * c - (at[1] - d.bodyPivot[1])); } }; }));
    items.push({ name: k + ' (army | settlers | nations)', w: cell * 6 + 24, h: cell + 4, draw: (x, y) => draws.forEach((d, i) => d(x + cell / 2 + i * cell + Math.floor(i / 2) * 8, y + cell * 0.65)) });
  }
} else if (part === 'extras') { // the frontier's extra life and traffic, both paints, four angles
  const angles = [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, Math.PI];
  for (const k of pick(Object.keys(EXTRAS))) {
    const def = EXTRAS[k](), R = Math.max(def.body.max[0] - def.body.min[0], def.body.max[2] - def.body.min[2], def.body.max[1]), cell = Math.max(16, R * 1.5);
    const draws = [0, 1].map((t) => { const sp = bake(def, 'body', { facings: 16, team: PAINT[t] }); return (x: number, y: number, a: number) => put(facing(sp, a), x, y); });
    items.push({ name: k, w: cell * angles.length * 2 + 8, h: cell + 6, draw: (x, y) => draws.forEach((d, t) => angles.forEach((a, i) => d(x + cell / 2 + (t * angles.length + i) * cell + t * 8, y + cell * 0.65, a))) });
  }
} else if (part === 'west') { // WILD WEST (?part=west): every frontier unit, then the buildings, then the desert's plants
  const angles = [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, Math.PI];
  const framesOnly = q.get('frames') === '1';
  for (const k of framesOnly ? [] : pick(Object.keys(WILD).filter((k) => (ART[k] || LIFE[k] || k === 'camp') && k !== 'fieldCommand'))) {
    const small = INFANTRY.includes(k) || ['civilian', 'cow', 'deer'].includes(k), n = small ? 8 : 32, draws = [0, 1].map((t) => unit(k, t, n)), cell = small ? 16 : k === 'colossus' || k === 'camp' ? 96 : ['juggernaut', 'artillery', 'bomber', 'gunship'].includes(k) ? 66 : 40;
    items.push({ name: k, w: cell * angles.length * 2 + 8, h: cell + 6, draw: (x, y) => draws.forEach((d, t) => angles.forEach((a, i) => d(x + cell / 2 + (t * angles.length + i) * cell + t * 8, y + cell * 0.6, a))) });
  }
  for (const k of framesOnly ? [] : pick(Object.keys(WILD).filter((k) => BASE[k] || CIVIC[k] || k === 'fieldCommand'))) {
    const civic = !!CIVIC[k], bs = (civic ? [2, 0] : [0, 1]).map((t) => building(WILD[k], t)), cell = Math.round(bs[0].R * 1.45 + 20);
    items.push({ name: k, w: cell * 2, h: Math.round(cell * 0.95), draw: (x, y) => bs.forEach((b, i) => b.draw(x + cell / 2 + i * cell, y + cell * 0.62)) });
  }
  if (framesOnly) for (const k of pick(Object.keys(WILD))) { // ?frames=1: each moving model's frames side by side, at one angle (units) or as built (buildings)
    const def = WILD[k](); if (!def.frames) continue;
    const isUnit = !!(ART[k] || LIFE[k]) && k !== 'fieldCommand', tc = LIFE[k] ? PAINT[0] : TEAMS[0];
    const sps = [def.body, ...def.frames].map((f) => bake({ ...def, body: f }, 'body', isUnit ? { facings: 8, team: tc } : { team: tc, yaw: YAW, lit: true }));
    const R = Math.max(def.body.max[0] - def.body.min[0], def.body.max[2] - def.body.min[2], isUnit ? def.body.max[1] * 1.2 : 0), cell = isUnit ? Math.max(16, R * 1.6) : Math.round(R * 1.45 + 20); // (tall walkers get room for their height)
    items.push({ name: k + ' (still, then frames)', w: cell * sps.length + 8, h: cell + 6, draw: (x, y) => sps.forEach((sp, i) => put(isUnit ? facing(sp, 0) : sp[0], x + cell / 2 + i * cell, y + cell * (isUnit ? 0.6 : 0.62))) });
  }
  if (!only && !framesOnly) {
    const plants = [1, 2, 7, 9].map((s) => building(() => saguaro(s), 2)).concat([3, 4, 5].map((s) => building(() => sagebrush(s), 2)));
    items.push({ name: 'saguaro, sagebrush', w: plants.length * 30, h: 44, draw: (x, y) => plants.forEach((b, i) => b.draw(x + 15 + i * 30, y + 38)) });
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
