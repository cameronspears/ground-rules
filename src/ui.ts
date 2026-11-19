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

export interface Button { id: string; x: number; y: number; w: number; h: number; label: string; key?: string; icon?: (ctx: CanvasRenderingContext2D, x: number, y: number) => void }

export function button(ctx: CanvasRenderingContext2D, b: Button, hot: boolean, down: boolean) {
  const { x, y, w, h } = b;
  ctx.fillStyle = C.metalD; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = down ? '#202227' : hot ? '#3a3e48' : C.metal; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (!down) { ctx.fillStyle = hot ? C.metalLL : C.metalL; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2); }
  const oy = down ? 1 : 0;
  b.icon?.(ctx, x + 4, y + 4 + oy);
  const tx = b.icon ? x + 20 : x + Math.round((w - textWidth(b.label)) / 2);
  text(ctx, b.label, tx, y + Math.round((h - 7) / 2) + oy, hot ? C.gold : C.cream, 1, C.ink);
  if (b.key) text(ctx, b.key, x + w - 8, y + 2 + oy, C.goldD);
}

// --- small pixel icons (12 x 12) ---
export const ICON = {
  stop: (ctx: CanvasRenderingContext2D, x: number, y: number) => { ctx.fillStyle = C.ink; ctx.fillRect(x + 2, y + 2, 9, 9); ctx.fillStyle = C.red; ctx.fillRect(x + 1, y + 1, 9, 9); ctx.fillStyle = C.cream; ctx.fillRect(x + 3, y + 5, 5, 1); },
  scatter: (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = C.gold;
    for (const [dx, dy] of [[5, 5], [1, 1], [9, 1], [1, 9], [9, 9]]) ctx.fillRect(x + dx, y + dy, 2, 2);
    ctx.fillStyle = C.cream; ctx.fillRect(x + 3, y + 3, 1, 1); ctx.fillRect(x + 8, y + 3, 1, 1); ctx.fillRect(x + 3, y + 8, 1, 1); ctx.fillRect(x + 8, y + 8, 1, 1);
  },
  home: (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = C.cream; ctx.fillRect(x + 2, y + 6, 8, 5); ctx.fillStyle = C.red;
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 6 - i, y + 1 + i, i * 2 + 1, 1);
    ctx.fillStyle = C.ink; ctx.fillRect(x + 5, y + 8, 2, 3);
  },
};

// --- pixel cursors ---
const ARROW = ['X.........', 'XX........', 'XoX.......', 'XooX......', 'XoooX.....', 'XooooX....', 'XoooooX...', 'XooooooX..', 'XoooXXXXX.', 'XooX......', 'XoX.......', 'XX........'];
export function cursor(ctx: CanvasRenderingContext2D, kind: 'arrow' | 'move' | 'select' | 'busy', x: number, y: number, t: number) {
  x = Math.round(x); y = Math.round(y);
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
