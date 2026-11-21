// A whole map, painted by the game's own map painter and shrunk to fit one picture, with buildings
// outlined (yellow: civilian and capturable; white: town halls) and each starting base ringed in red.
// Add "lines" to trace the road lines in orange on top, so the network reads at a glance.
//   [SIZE=320] node tools/map-view.mjs [seed=7919] [zoom=5] [players=2] [lines]   ->  tools/out/map-<seed>.png
import { load } from './load.mjs';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
if (process.env.SIZE) globalThis.localStorage = { getItem: () => process.env.SIZE }; // the map size, as the title screen would store it
const seed = +(process.argv[2] ?? 7919), z = +(process.argv[3] ?? 5), players = +(process.argv[4] ?? 2);
const { mods: [TER], close } = await load('/src/terrain.ts');
const { toScreen, CELL, SW, SH } = TER;
const t = new TER.Terrain(seed, players); t.prepare();
const W = Math.ceil(SW / z), H = Math.ceil(SH / z), img = Buffer.alloc(W * H * 3, 12);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = t.pixel(x * z, y * z); const k = (y * W + x) * 3; img[k] = (c >> 16) & 255; img[k + 1] = (c >> 8) & 255; img[k + 2] = c & 255; }
const put = (sx, sy, col) => { const x = Math.round(sx / z), y = Math.round(sy / z); if (x < 0 || y < 0 || x >= W || y >= H) return; const k = (y * W + x) * 3; img[k] = col[0]; img[k + 1] = col[1]; img[k + 2] = col[2]; };
const line = (a, b, col) => { const [ax, ay] = toScreen(a[0] * CELL, a[1] * CELL), [bx, by] = toScreen(b[0] * CELL, b[1] * CELL), m = Math.ceil(Math.hypot(bx - ax, by - ay) / z) + 1; for (let i = 0; i <= m; i++) put(ax + ((bx - ax) * i) / m, ay + ((by - ay) * i) / m, col); };
const box = (x, y, w, h, col) => { line([x, y], [x + w, y], col); line([x + w, y], [x + w, y + h], col); line([x + w, y + h], [x, y + h], col); line([x, y + h], [x, y], col); };
if (process.argv[5] === 'lines') for (const l of t.roadLines) for (let k = 1; k < l.length; k++) line(l[k - 1], l[k], [255, 140, 30]);
for (const s of t.sites) box(s.cx, s.cy, s.w, s.h, s.kind === 'townHall' ? [255, 255, 255] : [255, 220, 60]);
for (const [bx, by] of t.bases) for (const r of [9, 9.5]) for (let a = 0; a < 64; a++) line([bx + Math.cos(a / 64 * 6.283) * r, by + Math.sin(a / 64 * 6.283) * r], [bx + Math.cos((a + 1) / 64 * 6.283) * r, by + Math.sin((a + 1) / 64 * 6.283) * r], [230, 40, 40]);
mkdirSync('tools/out', { recursive: true });
writeFileSync(`tools/out/map-${seed}.png`, png(W, H, img));
console.log(`tools/out/map-${seed}.png ${W}x${H}, ${t.villages.length} villages, ${t.roadLines.length} road lines`);
await close();
