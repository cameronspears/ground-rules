import { say } from './west/words';

// Ground Rules' own pixel font: chunky 5x7 capitals, drawn here by hand (original, no licence).
// Text is drawn straight into the pixel frame, so it scales with the game's pixels.
const G: Record<string, string> = {
  A: '.###.#...##...#######...##...##...#', B: '####.#...#####.#...##...##...#####.', C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.', E: '######....####.#....#....#....#####', F: '######....####.#....#....#....#....',
  G: '.###.#...##....#.####...##...#.####', H: '#...##...#######...##...##...##...#', I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#....##...#.###..', K: '#...##..#.###..#..#.#...##...##...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##...##...##...##...#', N: '#...###..##.#.##..###...##...##...#', O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#..#.#...##...#',
  S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...#.#.#..#.#...#..', W: '#...##...##...##.#.##.#.###.###...#', X: '#...#.#.#...#...#.#.#...##...##...#',
  Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
  '0': '.###.#..###.#.###..##...##...#.###.', '1': '..#...##....#....#....#....#...###.', '2': '.###.#...#....#...#...#...#...#####',
  '3': '####.....#....#.###.....#....#####.', '4': '...#...##..#.#.#..#.#####...#....#.', '5': '######....####.....#....##...#.###.',
  '6': '..##..#...#....####.#...##...#.###.', '7': '#####....#...#...#...#....#....#...', '8': '.###.#...##...#.###.#...##...#.###.',
  '9': '.###.#...##...#.####....#...#..##..',
  '.': '...............................#...', ',': '..........................#...#....', ':': '.....##...##........##...##........',
  '!': '..#....#....#....#....#.........#..', '?': '.###.#...#...#...#....#.........#..', '-': '...............###.................',
  '+': '.......#....#..#####..#....#.......', '/': '....#...#....#...#...#....#...#....', "'": '..#....#...........................',
  '(': '...#...#...#....#....#.....#.....#.', ')': '.#.....#.....#....#....#...#...#...', '%': '##...##..#...#...#...#...#..##...##',
  '$': '..#...####.#....###....#.####...#..', '*': '.....#.#.#.###.#####.###.#.#.#.....', ' ': '...................................',
  '>': '.#.....#.....#.....#...#...#...#...', '<': '...#...#...#...#.....#.....#.....#.',
};

export const GLYPH_W = 5, GLYPH_H = 7;

export function textWidth(s: string, scale = 1) { s = say(s); return s.length ? (s.length * (GLYPH_W + 1) - 1) * scale : 0; }

// Draw text at (x, y) top-left. `shadow` draws a 1-pixel drop shadow first. Each piece of text (with its
// colour, size and shadow) is drawn dot by dot once into a small picture and copied after that: the
// interface redraws all its text every frame, and dot by dot that was a good part of each frame.
const cache = new Map<string, HTMLCanvasElement>();
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1, shadow?: string) {
  if (!s) return;
  s = say(s); // (WILD WEST: its own names for things)
  const key = s + '\u0000' + color + '\u0000' + scale + '\u0000' + (shadow ?? '');
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 3000) cache.clear(); // (changing numbers make new pieces: start afresh now and then)
    c = document.createElement('canvas'); c.width = textWidth(s, scale) + scale; c.height = (GLYPH_H + 1) * scale;
    const g = c.getContext('2d')!;
    if (shadow) dots(g, s, scale, scale, shadow, scale);
    dots(g, s, 0, 0, color, scale);
    cache.set(key, c);
  }
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, Math.round(x), Math.round(y));
  ctx.imageSmoothingEnabled = sm;
}
function dots(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale: number) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = G[ch] ?? G['?'];
    for (let i = 0; i < 35; i++) if (g[i] === '#') ctx.fillRect(cx + (i % 5) * scale, y + Math.floor(i / 5) * scale, scale, scale);
    cx += (GLYPH_W + 1) * scale;
  }
}
