// Turns a grid of coloured blocks into one mesh. Only faces that touch air are drawn,
// and each corner is darkened by its neighbours (ambient occlusion) so blocks read clearly.
import * as THREE from 'three';

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const AO = [0.55, 0.7, 0.86, 1];

type V3 = [number, number, number];
const FACES: { n: V3; v: V3[] }[] = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

// For every face corner: the two side neighbours and the diagonal neighbour that shade it.
const AO_OFF: V3[][][] = FACES.map((f) => {
  const a = f.n.findIndex((x) => x !== 0);
  const [u, w] = [0, 1, 2].filter((i) => i !== a);
  return f.v.map((c) => {
    const du = c[u] ? 1 : -1, dw = c[w] ? 1 : -1;
    const s1: V3 = [...f.n] as V3; s1[u] += du;
    const s2: V3 = [...f.n] as V3; s2[w] += dw;
    const cr: V3 = [...f.n] as V3; cr[u] += du; cr[w] += dw;
    return [s1, s2, cr];
  });
});

export function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export interface MeshOpts {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; // range, x1 exclusive
  get: (x: number, y: number, z: number) => number; // 0 = empty, else 0xRRGGBB
  scale?: number;
  offset?: V3;
  jitter?: number; // per-block brightness variation
  mark?: (x: number, y: number, z: number, c: number) => number; // pen-mark style per block (see print.ts)
}

export function meshVoxels(o: MeshOpts): THREE.BufferGeometry | null {
  const s = o.scale ?? 1;
  const off = o.offset ?? [0, 0, 0];
  const jit = o.jitter ?? 0.1;
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [], mk: number[] = [];
  const g = o.get;
  const ao = [0, 0, 0, 0];
  for (let y = o.y0; y < o.y1; y++)
    for (let z = o.z0; z < o.z1; z++)
      for (let x = o.x0; x < o.x1; x++) {
        const c = g(x, y, z);
        if (!c) continue;
        const v = 1 - jit / 2 + jit * hash3(x, y, z);
        const r = LIN[(c >> 16) & 255] * v, gg = LIN[(c >> 8) & 255] * v, b = LIN[c & 255] * v;
        const m = o.mark ? o.mark(x, y, z, c) : 0;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          if (g(x + F.n[0], y + F.n[1], z + F.n[2])) continue;
          const offs = AO_OFF[f];
          for (let k = 0; k < 4; k++) {
            const [s1, s2, cr] = offs[k];
            const a = g(x + s1[0], y + s1[1], z + s1[2]) ? 1 : 0;
            const bb = g(x + s2[0], y + s2[1], z + s2[2]) ? 1 : 0;
            const cc = g(x + cr[0], y + cr[1], z + cr[2]) ? 1 : 0;
            ao[k] = a && bb ? 0 : 3 - (a + bb + cc);
          }
          const base = pos.length / 3;
          for (let k = 0; k < 4; k++) {
            const vv = F.v[k];
            pos.push((x + vv[0]) * s + off[0], (y + vv[1]) * s + off[1], (z + vv[2]) * s + off[2]);
            nor.push(F.n[0], F.n[1], F.n[2]);
            const l = AO[ao[k]];
            col.push(r * l, gg * l, b * l);
            mk.push(m);
          }
          if (ao[0] + ao[2] < ao[1] + ao[3]) idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (o.mark) geo.setAttribute('mark', new THREE.Float32BufferAttribute(mk, 1));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function linColor(c: number, out = new THREE.Color()) {
  return out.setRGB(LIN[(c >> 16) & 255], LIN[(c >> 8) & 255], LIN[c & 255], THREE.LinearSRGBColorSpace);
}

export function shade(c: number, k: number) {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return (r << 16) | (g << 8) | b || 0x010101;
}

export function mix(a: number, b: number, t: number) {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0) || 0x010101;
}
