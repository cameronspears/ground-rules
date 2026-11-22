// The interface, drawn as pixel art straight into the game frame so it belongs to the same world:
// riveted gunmetal panels, a propaganda-red trim, gold and cream lettering in our own pixel font.
import { text, textWidth } from './font';

export const C = {
  metal: '#2b2e35', metalL: '#454a55', metalLL: '#5d6370', metalD: '#17181c', rivet: '#8a8e96',
  screen: '#10140f', screenL: '#1c2419', red: '#b8281c', redD: '#7a1810', gold: '#f0c030', goldD: '#9a7418',
  cream: '#e8dcc0', muted: '#8a8a7a', ok: '#7ee08a', warn: '#f0c030', bad: '#e8503a', ink: '#0d0c0b',
};

export const TOP = 13, CONSOLE = 80;

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = C.metalD; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.metal; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = C.metalL; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = '#212329'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  // brushed-metal streaks
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let yy = y + 3; yy < y + h - 3; yy += 3) ctx.fillRect(x + 2, yy, w - 4, 1);
}

export function rivets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  for (const [rx, ry] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) {
    ctx.fillStyle = C.metalD; ctx.fillRect(rx, ry, 2, 2);
    ctx.fillStyle = C.rivet; ctx.fillRect(rx, ry, 1, 1);
  }
}

export function inset(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = C.screen) {
  ctx.fillStyle = C.metalD; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.metalLL; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

// Hazard-and-slogan trim along the top of the console.
export function trim(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = C.redD; ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = C.red; ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = C.gold;
  for (let i = x + 6; i < x + w - 6; i += 24) ctx.fillRect(i, y, 2, 2);
}

export interface Button { id: string; x: number; y: number; w: number; h: number; label: string; key?: string; on?: boolean } // on: a switch that's turned on (lit green)

export function button(ctx: CanvasRenderingContext2D, b: Button, hot: boolean, down: boolean) {
  const { x, y, w, h } = b;
  ctx.fillStyle = C.metalD; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = down ? '#202227' : hot ? '#3a3e48' : C.metal; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (!down) { ctx.fillStyle = hot ? C.metalLL : C.metalL; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2); }
  const oy = down ? 1 : 0;
  const tx = x + Math.round((w - textWidth(b.label)) / 2);
  text(ctx, b.label, tx, y + Math.round((h - 7) / 2) + oy, b.on ? C.ok : hot ? C.gold : C.cream, 1, C.ink);
  if (b.key && tx >= x + 9) text(ctx, b.key, x + w - 8, y + 2 + oy, C.goldD); // the keyboard shortcut, where it fits
}

// --- pixel cursors ---
const ARROW = ['X.........', 'XX........', 'XoX.......', 'XooX......', 'XoooX.....', 'XooooX....', 'XoooooX...', 'XooooooX..', 'XoooXXXXX.', 'XooX......', 'XoX.......', 'XX........'];
export function cursor(ctx: CanvasRenderingContext2D, kind: 'arrow' | 'move' | 'select' | 'busy' | 'attack' | 'amove' | 'build', x: number, y: number, t: number) {
  x = Math.round(x); y = Math.round(y);
  if (kind === 'build') { // a gold wrench (a right-click here builds or repairs), nodding as it works
    const k = Math.floor(t * 4) % 2, px = (dx: number, dy: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + k, 1, 1); };
    const handle: [number, number][] = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7]], jaw: [number, number][] = [[-3, -1], [-3, 0], [-2, 1], [-1, 1], [0, 1], [1, 0], [1, -1], [1, -2], [0, -3], [-1, -3]];
    for (const [dx, dy] of [...handle, ...jaw]) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px(dx + ox, dy + oy, C.ink);
    for (const [dx, dy] of handle) { px(dx, dy, C.gold); px(dx + 1, dy, C.goldD); }
    for (const [dx, dy] of jaw) px(dx, dy, C.gold);
    return;
  }
  if (kind === 'attack' || kind === 'amove') { // a red (or amber) gunsight that pulses
    const r = 5 + (Math.floor(t * 6) % 2), col = kind === 'attack' ? C.bad : C.warn;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.fillStyle = C.ink; ctx.fillRect(x + dx * r - (dy ? 1 : 0), y + dy * r - (dx ? 1 : 0), dy ? 3 : 1, dx ? 3 : 1);
      ctx.fillStyle = col; for (let k = 2; k <= r; k++) ctx.fillRect(x + dx * k, y + dy * k, 1, 1);
    }
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
    return;
  }
  if (kind === 'move') {
    const p = Math.floor(t * 6) % 3;
    for (const [dx, dy, ox, oy] of [[0, -1, 0, -6], [0, 1, 0, 4], [-1, 0, -6, 0], [1, 0, 4, 0]]) {
      for (let i = 0; i < 3; i++) {
        const cx = x + ox + dx * p, cy = y + oy + dy * p;
        ctx.fillStyle = C.ink;
        if (dy) ctx.fillRect(cx - 2 + i, cy + (dy > 0 ? i : 2 - i) - 1, 2, 2); else ctx.fillRect(cx + (dx > 0 ? i : 2 - i) - 1, cy - 2 + i, 2, 2);
      }
      ctx.fillStyle = C.ok;
      if (dy) { ctx.fillRect(x + ox - 1 + dx * p, y + oy + dy * p, 3, 1); ctx.fillRect(x + ox + dx * p, y + oy + dy * p + (dy > 0 ? 1 : -1), 1, 1); }
      else { ctx.fillRect(x + ox + dx * p, y + oy - 1 + dy * p, 1, 3); ctx.fillRect(x + ox + dx * p + (dx > 0 ? 1 : -1), y + oy, 1, 1); }
    }
    ctx.fillStyle = C.ok; ctx.fillRect(x, y, 1, 1);
    return;
  }
  if (kind === 'select') {
    ctx.fillStyle = C.ok;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.fillRect(x + sx * 5 - (sx < 0 ? 0 : 2), y + sy * 5, 3, 1); ctx.fillRect(x + sx * 5, y + sy * 5 - (sy < 0 ? 0 : 2), 1, 3); }
  }
  for (let r = 0; r < ARROW.length; r++) for (let c = 0; c < ARROW[r].length; c++) {
    const ch = ARROW[r][c];
    if (ch === '.') continue;
    ctx.fillStyle = ch === 'X' ? C.ink : kind === 'select' ? '#cff5d4' : C.cream;
    ctx.fillRect(x + c, y + r, 1, 1);
  }
}

// A small stamped metal plate with an engraved label, sitting on a panel edge.
export function plate(ctx: CanvasRenderingContext2D, label: string, x: number, y: number) {
  const w = textWidth(label) + 8;
  ctx.fillStyle = C.metalD; ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = '#3a3e47'; ctx.fillRect(x + 1, y + 1, w - 2, 8);
  ctx.fillStyle = C.metalLL; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  text(ctx, label, x + 4, y + 2, '#1a1b1f');
  text(ctx, label, x + 4, y + 1, C.goldD);
}

// Glass over a screen: faint scanlines and a soft glint in the top-left corner.
export function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let yy = y + 2; yy < y + h - 1; yy += 2) ctx.fillRect(x + 1, yy, w - 2, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 10; i++) ctx.fillRect(x + 2 + i, y + 2, 1, 10 - i);
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: number) {
  ctx.fillStyle = C.ink; ctx.fillRect(x - 1, y - 1, w + 2, 4);
  const segs = Math.max(1, Math.floor(w / 3));
  const on = Math.ceil(segs * Math.max(0, Math.min(1, f)));
  ctx.fillStyle = f > 0.6 ? C.ok : f > 0.3 ? C.warn : C.bad;
  for (let i = 0; i < on; i++) ctx.fillRect(x + i * 3, y, 2, 2);
}
