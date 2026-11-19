// Hand-drawn unit models ("stacked sprites"): each model is drawn as a pile of top-down slices,
// one text grid per layer, bottom layer first. Files live in src/sprites/*.txt and are picked
// up automatically. The format is described in docs/fable-sprite-prompt.md.
import { VB, type ModelDef } from './models';

// Same codes as TEAM, TEAM_D, TEAM_L in models.ts (kept literal: the two files load each other).
const TEAM_CODES: Record<string, number> = { team: 1, 'team-dark': 2, 'team-light': 3 };

export function parseSprite(text: string): { name: string; def: ModelDef } {
  const lines = text.split(/\r?\n/);
  let name = 'unnamed';
  const palette = new Map<string, number>();
  const parts: Record<string, { vb: VB; pivot: [number, number, number]; mount?: [number, number, number]; layer: number; row: number }> = {};
  let cur: (typeof parts)[string] | null = null;
  let inPalette = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const t = line.trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^name:\s*(.+)$/))) { name = m[1].trim(); continue; }
    if (t === 'palette:') { inPalette = true; continue; }
    if ((m = t.match(/^part:\s*(\w+)$/))) {
      inPalette = false;
      cur = parts[m[1]] = { vb: new VB(), pivot: [0, 0, 0], layer: -1, row: 0 };
      continue;
    }
    if (inPalette) {
      // "T team" or "k 2e2e33 dark steel"
      const p = t.match(/^(\S)\s+(\S+)/);
      if (p) palette.set(p[1], TEAM_CODES[p[2]] ?? parseInt(p[2], 16));
      continue;
    }
    if (!cur) continue;
    if ((m = t.match(/^pivot:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)$/))) { cur.pivot = [+m[1], +m[2], +m[3]]; continue; }
    if ((m = t.match(/^mount:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)$/))) { cur.mount = [+m[1], +m[2], +m[3]]; continue; }
    if ((m = t.match(/^layer\s+(\d+)$/))) { cur.layer = +m[1]; cur.row = 0; continue; }
    if (cur.layer < 0) continue;
    // a row of a slice: column = x (back to front), row = z (left side to right side)
    for (let x = 0; x < t.length; x++) {
      const c = palette.get(t[x]);
      if (c) cur.vb.set(x, cur.layer, cur.row, c);
    }
    cur.row++;
  }
  const body = parts.body ?? Object.values(parts)[0];
  const turret = parts.turret;
  if (!body) throw new Error(`sprite ${name}: no parts`);
  return {
    name,
    def: { body: body.vb, bodyPivot: body.pivot, turret: turret?.vb, turretPivot: turret?.pivot, turretAt: turret?.mount },
  };
}

// Every sprite file in src/sprites, keyed by its name.
export function loadSprites(): Record<string, ModelDef> {
  const files = import.meta.glob('./sprites/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const out: Record<string, ModelDef> = {};
  for (const [path, text] of Object.entries(files)) {
    try { const s = parseSprite(text); out[s.name] = s.def; }
    catch (e) { console.warn('Could not read sprite', path, e); }
  }
  return out;
}
