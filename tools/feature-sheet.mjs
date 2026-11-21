// The picture sheet: close-ups of every dam, bridge, ford, citadel gate, the citadel, flank compounds and villages across several
// maps, painted by the game's own map painter, on one image per kind, for checking by eye what rules
// can't. Buildings are drawn by the game, not the painter, so their footprints are outlined (red for
// dams, with an arrow the way the water runs; yellow for others).
//   node tools/feature-sheet.mjs [maps=6] [firstSeed=1]   ->  tools/out/<kind>.png
import { load } from './load.mjs';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 220, H = 150, COLS = 4;
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const n = +(process.argv[2] ?? 6), first = +(process.argv[3] ?? 1);
const { mods: [TER], close } = await load('/src/terrain.ts');
const { toScreen, CELL } = TER;
const sheets = {};
for (let s = first; s < first + n; s++) {
  const seed = s * 7919, t = new TER.Terrain(seed, 2);
  t.prepare();
  const tile = (gx, gy, marks, z = 1) => { // a close-up centred on a ground point (in squares); z > 1 shows more, smaller
    const [cx, cy] = toScreen((gx + 0.5) * CELL, (gy + 0.5) * CELL), img = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = t.pixel(Math.round(cx + (x - W / 2) * z), Math.round(cy + (y - H / 2) * z)); const k = (y * W + x) * 3; img[k] = (c >> 16) & 255; img[k + 1] = (c >> 8) & 255; img[k + 2] = c & 255; }
    const put = (sx, sy, col) => { const x = Math.round((sx - cx) / z + W / 2), y = Math.round((sy - cy) / z + H / 2); if (x < 0 || y < 0 || x >= W || y >= H) return; const k = (y * W + x) * 3; img[k] = col[0]; img[k + 1] = col[1]; img[k + 2] = col[2]; };
    const line = (a, b, col) => { const [ax, ay] = toScreen(a[0] * CELL, a[1] * CELL), [bx, by] = toScreen(b[0] * CELL, b[1] * CELL), m = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let i = 0; i <= m; i++) put(ax + ((bx - ax) * i) / m, ay + ((by - ay) * i) / m, col); };
    for (const mk of marks) {
      const { x, y, w, h, col } = mk;
      line([x, y], [x + w, y], col); line([x + w, y], [x + w, y + h], col); line([x + w, y + h], [x, y + h], col); line([x, y + h], [x, y], col);
      if (mk.ux !== undefined) { const ox = x + w / 2, oy = y + h / 2; line([ox, oy], [ox + mk.ux * 3, oy + mk.uy * 3], [255, 255, 255]); }
    }
    return img;
  };
  const siteMarks = (gx, gy, r = 14) => t.sites.filter((st) => Math.abs(st.cx - gx) < r && Math.abs(st.cy - gy) < r).map((st) => ({ x: st.cx, y: st.cy, w: st.w, h: st.h, col: [255, 220, 60] }));
  const add = (kind, img) => (sheets[kind] ??= []).push(img);
  for (const d of t.dams) add('dams', tile(d.x + 1, d.y + 1, [...siteMarks(d.x, d.y), { x: d.x, y: d.y, w: 2, h: 2, col: [255, 60, 40], ux: d.ux, uy: d.uy }]));
  for (const bx of t.bridgeCols ?? []) { let y0 = 1e9, y1 = -1; for (let y = 0; y < TER.N; y++) if (t.type[t.idx(bx, y)] === 4) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } if (y1 >= 0) add('bridges', tile(bx + 1, (y0 + y1) / 2, siteMarks(bx, y0), 2.5)); }
  for (const [fx, fy] of t.fordPts ?? []) add('fords', tile(fx, fy, siteMarks(fx, fy)));
  for (const g of (t.gates ?? []).slice(0, (t.gates ?? []).length / t.bases.length)) { const c = TER.N / 2 - 0.5, gx = c + Math.cos(g) * (t.island + 1.5), gy = c + Math.sin(g) * (t.island + 1.5); add('gates', tile(gx, gy, siteMarks(gx, gy), 2)); }
  add('citadel', tile(TER.N / 2 - 0.5, TER.N / 2 - 0.5, siteMarks(TER.N / 2, TER.N / 2, 20), 4.5));
  for (const [fx, fy] of (t.flanks ?? []).slice(0, 2)) add('flanks', tile(fx, fy, siteMarks(fx, fy), 3));
  for (const [vx, vy] of t.villages.slice(0, 2)) add('villages', tile(vx, vy, siteMarks(vx, vy), 2));
}
mkdirSync('tools/out', { recursive: true });
for (const [kind, tiles] of Object.entries(sheets)) {
  const rows = Math.ceil(tiles.length / COLS), SW = COLS * (W + 4), SH = rows * (H + 4), img = Buffer.alloc(SW * SH * 3, 20);
  tiles.forEach((tl, k) => { const ox = (k % COLS) * (W + 4) + 2, oy = Math.floor(k / COLS) * (H + 4) + 2; for (let y = 0; y < H; y++) tl.copy(img, ((oy + y) * SW + ox) * 3, y * W * 3, (y + 1) * W * 3); });
  writeFileSync(`tools/out/${kind}.png`, png(SW, SH, img));
  console.log(`tools/out/${kind}.png: ${tiles.length} close-ups`);
}
await close();
