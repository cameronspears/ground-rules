// Which art style is on. 'pixel' = low-resolution, dithered, classic 90s strategy-game look.
// 'print' = screen-printed poster look. Press P in game to switch (it reloads).
export type Style = 'pixel' | 'print';
let s: Style = 'pixel';
try { if (localStorage.getItem('conquer-style') === 'print') s = 'print'; } catch {}
export const STYLE: Style = s;
export function toggleStyle() {
  try { localStorage.setItem('conquer-style', STYLE === 'pixel' ? 'print' : 'pixel'); } catch {}
  location.reload();
}
