import { N, CELL, T, Terrain } from './terrain';

// Territory: the road network is each side's empire.
// A side's network starts at its heart (each Field Command, and its starting ground while it has
// buildings there) and spreads along roads it paved, across bridges, and through its own buildings,
// jumping gaps of a square or so. Everything the network reaches is "linked", and claims the ground
// around it. Where two sides' claims meet, the nearer claim wins; equal claims are no one's.

export interface Holder { type: string; team: number; cx: number; cy: number; w: number; h: number; dying: number }

const CORE = 14; // the heart's reach, in squares
const ROAD_R = 3; // ground a linked road claims either side
const BLD_R = 3; // ground a linked building claims around it

export class Territory {
  owner = new Int8Array(N * N).fill(-1); // who owns each square (-1: no one)
  linked = new Set<Holder>(); // buildings joined to their side's network
  lines = new Map<number, number[]>(); // each side's border, as ground-pixel segments x1 y1 x2 y2 nx ny (n points inside)

  compute(t: Terrain, sides: number[], blds: Holder[], home: (team: number) => [number, number]) {
    const NN = N * N, owner = this.owner, best = new Uint8Array(NN);
    const str = new Uint8Array(NN), conduit = new Uint8Array(NN), seen = new Uint8Array(NN), queue = new Int32Array(NN);
    owner.fill(-1); this.linked.clear();
    const claim = (x0: number, y0: number, r: number, base = r + 1) => { // stronger nearer the source
      for (let y = Math.max(0, Math.floor(y0 - r)); y <= Math.min(N - 1, Math.ceil(y0 + r)); y++)
        for (let x = Math.max(0, Math.floor(x0 - r)); x <= Math.min(N - 1, Math.ceil(x0 + r)); x++) {
          const d = Math.hypot(x + 0.5 - x0, y + 0.5 - y0); if (d > r) continue;
          const v = Math.min(255, Math.round(base - d)), i = y * N + x; if (v > str[i]) str[i] = v;
        }
    };
    for (const team of sides) {
      const mine = blds.filter((b) => b.team === team && b.dying < 0 && b.type !== 'wall');
      if (!mine.length) continue;
      str.fill(0); conduit.fill(0); seen.fill(0);
      for (let i = 0; i < NN; i++) { const ty = t.type[i]; if ((ty === T.PAVED && t.roadBy[i] === team) || ty === T.BRIDGE) conduit[i] = 1; }
      const at = new Map<number, Holder>();
      for (const b of mine) for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) if (t.inside(x, y)) { const i = y * N + x; conduit[i] = 2; at.set(i, b); }
      // the hearts
      const hubs: [number, number][] = mine.filter((b) => b.type === 'fieldCommand').map((b) => [b.cx + b.w / 2, b.cy + b.h / 2]);
      const [hx, hy] = home(team);
      if (mine.some((b) => Math.hypot(b.cx + b.w / 2 - hx, b.cy + b.h / 2 - hy) < CORE)) hubs.push([hx + 0.5, hy + 0.5]);
      let qn = 0;
      const push = (i: number) => { if (!seen[i]) { seen[i] = 1; queue[qn++] = i; } };
      for (const [x0, y0] of hubs) {
        claim(x0, y0, CORE, CORE + 4);
        for (let y = Math.max(0, Math.floor(y0 - CORE)); y <= Math.min(N - 1, Math.ceil(y0 + CORE)); y++)
          for (let x = Math.max(0, Math.floor(x0 - CORE)); x <= Math.min(N - 1, Math.ceil(x0 + CORE)); x++)
            if (Math.hypot(x + 0.5 - x0, y + 0.5 - y0) <= CORE) push(y * N + x);
      }
      // spread along the network, jumping gaps of up to a square
      for (let h = 0; h < qn; h++) {
        const i = queue[h], x = i % N, y = (i / N) | 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx; if (conduit[j]) push(j);
        }
      }
      for (let h = 0; h < qn; h++) {
        const i = queue[h];
        if (conduit[i] === 1 && t.type[i] !== T.BRIDGE) claim((i % N) + 0.5, ((i / N) | 0) + 0.5, ROAD_R);
        else if (conduit[i] === 2) this.linked.add(at.get(i)!);
      }
      for (const b of this.linked) if (b.team === team) claim(b.cx + b.w / 2, b.cy + b.h / 2, Math.max(b.w, b.h) / 2 + BLD_R);
      for (let i = 0; i < NN; i++) {
        if (!str[i]) continue;
        if (str[i] > best[i]) { best[i] = str[i]; owner[i] = team; } else if (str[i] === best[i]) owner[i] = -2; // a tie: contested
      }
    }
    for (let i = 0; i < NN; i++) if (owner[i] === -2) owner[i] = -1;
    this.trace(sides);
  }

  // Borders by marching squares over square centres, so they run diagonally instead of in steps.
  private trace(sides: number[]) {
    const o = this.owner, C = CELL;
    this.lines.clear();
    for (const team of sides) {
      const seg: number[] = [];
      const own = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && o[y * N + x] === team;
      for (let y = -1; y < N; y++) for (let x = -1; x < N; x++) {
        const a = own(x, y), b = own(x + 1, y), c = own(x + 1, y + 1), d = own(x, y + 1);
        if (a === b && b === c && c === d) continue;
        const Tp = [(x + 1) * C, (y + 0.5) * C], R = [(x + 1.5) * C, (y + 1) * C], B = [(x + 1) * C, (y + 1.5) * C], L = [(x + 0.5) * C, (y + 1) * C];
        const cut: number[][] = [];
        if (a !== b) cut.push(Tp); if (b !== c) cut.push(R); if (c !== d) cut.push(B); if (d !== a) cut.push(L);
        if (cut.length === 2) seg.push(cut[0][0], cut[0][1], cut[1][0], cut[1][1]);
        else if (a) seg.push(...Tp, ...L, ...R, ...B); // two corners owned across a diagonal: cut round each
        else seg.push(...Tp, ...R, ...B, ...L);
      }
      const out: number[] = [];
      for (let k = 0; k < seg.length; k += 4) { // which way is inside?
        const ax = seg[k], ay = seg[k + 1], bx = seg[k + 2], by = seg[k + 3], L = Math.hypot(bx - ax, by - ay) || 1;
        let nx = -(by - ay) / L, ny = (bx - ax) / L;
        if (!own(Math.floor((ax + bx) / 2 / C + nx * 0.5), Math.floor((ay + by) / 2 / C + ny * 0.5))) { nx = -nx; ny = -ny; }
        out.push(ax, ay, bx, by, nx, ny);
      }
      if (out.length) this.lines.set(team, out);
    }
  }
}
