import { N, CELL, Terrain } from './terrain';

// Territory: your buildings are your empire.
// A side's network starts at its hearts (each Field Command, and its starting ground while it has
// buildings there) and spreads from building to building: any of its buildings within LINK squares
// of one already linked joins in. Everything linked claims the ground around it, so building outward
// pushes the border out. Where two sides' claims meet, the nearer claim wins; equal claims are no one's.

export interface Holder { type: string; team: number; cx: number; cy: number; w: number; h: number; dying: number }

const CORE = 14; // the heart's reach, in squares
const LINK = 6; // how far apart two buildings may stand and still link (the gap between them, in squares)
const BLD_R = 6; // ground a linked building claims around it

// the gap between two buildings, in squares (0 when they touch)
const nearHeart = (b: Holder, x: number, y: number) => Math.hypot(Math.max(0, b.cx - x, x - (b.cx + b.w)), Math.max(0, b.cy - y, y - (b.cy + b.h))) <= CORE + 2; // within a heart's reach
const gap = (a: Holder, b: Holder) => Math.hypot(Math.max(0, a.cx - (b.cx + b.w), b.cx - (a.cx + a.w)), Math.max(0, a.cy - (b.cy + b.h), b.cy - (a.cy + a.h)));

export class Territory {
  owner = new Int8Array(N * N).fill(-1); // who owns each square (-1: no one)
  linked = new Set<Holder>(); // buildings joined to their side's network
  area = new Map<number, number>(); // squares each side owns
  hearts = new Map<number, [number, number][]>(); // each side's hearts (Field Commands, home ground)
  lines = new Map<number, number[]>(); // each side's border, as ground-pixel segments x1 y1 x2 y2 nx ny (n points inside)

  compute(t: Terrain, sides: number[], blds: Holder[], home: (team: number) => [number, number]) {
    const NN = N * N, owner = this.owner, best = new Uint8Array(NN), str = new Uint8Array(NN);
    owner.fill(-1); this.linked.clear(); this.hearts.clear();
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
      str.fill(0);
      // the hearts, and everything within their reach
      const hubs: [number, number][] = mine.filter((b) => b.type === 'fieldCommand').map((b) => [b.cx + b.w / 2, b.cy + b.h / 2]);
      const [hx, hy] = home(team);
      if (mine.some((b) => Math.hypot(b.cx + b.w / 2 - hx, b.cy + b.h / 2 - hy) < CORE)) hubs.push([hx + 0.5, hy + 0.5]);
      for (const [x0, y0] of hubs) claim(x0, y0, CORE, CORE + 4);
      this.hearts.set(team, hubs);
      const queue = mine.filter((b) => hubs.some(([x, y]) => nearHeart(b, x, y)));
      const linked = new Set(queue);
      // then building to building
      for (let h = 0; h < queue.length; h++) for (const b of mine) if (!linked.has(b) && gap(queue[h], b) <= LINK) { linked.add(b); queue.push(b); }
      for (const b of linked) { this.linked.add(b); claim(b.cx + b.w / 2, b.cy + b.h / 2, Math.max(b.w, b.h) / 2 + BLD_R); }
      for (let i = 0; i < NN; i++) {
        if (!str[i]) continue;
        if (str[i] > best[i]) { best[i] = str[i]; owner[i] = team; } else if (str[i] === best[i]) owner[i] = -2; // a tie: contested
      }
    }
    this.area.clear();
    for (let i = 0; i < NN; i++) { if (owner[i] === -2) owner[i] = -1; if (owner[i] >= 0) this.area.set(owner[i], (this.area.get(owner[i]) ?? 0) + 1); }
    this.trace(sides);
  }

  // What a building set down here would link to: its side's linked buildings within reach, and
  // whether it's within a heart's reach (the placement preview shows these).
  joins(team: number, b: Holder): { mates: Holder[]; heart: boolean } {
    return { mates: [...this.linked].filter((o) => o.team === team && gap(o, b) <= LINK), heart: b.type === 'fieldCommand' || (this.hearts.get(team) ?? []).some(([x, y]) => nearHeart(b, x, y)) };
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
