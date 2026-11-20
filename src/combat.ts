// Weapons, damage and the look of combat: tracer rounds, cannon shells, muzzle flashes and
// pixel-art explosions. Damage depends on what is hit: rifles shred infantry but barely scratch
// armour; cannons are the other way round.

export type Armour = 'inf' | 'veh' | 'bld';
export interface Weapon { range: number; reload: number; dmg: Record<Armour, number>; kind: 'bullet' | 'shell'; splash?: number; speed?: number; min?: number; arc?: number } // min: can't fire closer than this; arc: how high shells loft

export const WEAPONS: Record<string, Weapon> = {
  rifle: { range: 76, reload: 0.9, dmg: { inf: 13, veh: 2, bld: 3 }, kind: 'bullet' },
  cannon: { range: 112, reload: 2.2, dmg: { inf: 15, veh: 62, bld: 46 }, kind: 'shell', splash: 12, speed: 280 },
  mg: { range: 98, reload: 0.3, dmg: { inf: 8, veh: 2, bld: 1 }, kind: 'bullet' },
  emplacement: { range: 132, reload: 2.4, dmg: { inf: 26, veh: 78, bld: 50 }, kind: 'shell', splash: 13, speed: 320 },
  rocket: { range: 96, reload: 2.6, dmg: { inf: 8, veh: 70, bld: 38 }, kind: 'shell', splash: 6, speed: 360, arc: 0.02 },
  howitzer: { range: 240, reload: 6, dmg: { inf: 28, veh: 32, bld: 80 }, kind: 'shell', splash: 18, speed: 190, min: 72, arc: 0.3 },
  garrison: { range: 92, reload: 0.9, dmg: { inf: 9, veh: 2, bld: 2 }, kind: 'bullet' },
};

// How tough each building is.
export const BLD_HP: Record<string, number> = {
  fieldCommand: 2000, generator: 700, scrapyard: 1100, barracks: 800, depot: 1300, derrick: 500,
  guardTower: 700, emplacement: 900, workshop: 900,
};

// Defensive buildings and the weapon each carries.
export const DEFENCE: Record<string, string> = { guardTower: 'mg', emplacement: 'emplacement' };

// gx, gy: where it lands on the ground; src: who fired (so the target can shoot back)
export interface Shell { x: number; y: number; sx: number; sy: number; tx: number; ty: number; t: number; life: number; w: Weapon; team: number; arc: number; gx: number; gy: number; src: any }
export interface Blast { x: number; y: number; t: number; size: number } // screen-space map coordinates
export interface Tracer { x0: number; y0: number; x1: number; y1: number; t: number }

// A pixel-art explosion: white-hot core, then a ragged orange ball that darkens and breaks up.
export function drawBlast(ctx: CanvasRenderingContext2D, b: Blast, vx: number, vy: number) {
  const x = Math.round(b.x - vx), y = Math.round(b.y - vy), s = b.size, t = b.t;
  if (t < 0.08) {
    ctx.fillStyle = '#fff6d0'; disc(ctx, x, y, Math.round(s * 0.55), 1);
    return;
  }
  const f = Math.min(1, (t - 0.08) / 0.42), r = Math.round(s * (0.5 + f * 0.6));
  const outer = f < 0.4 ? '#f0902a' : f < 0.7 ? '#c0501e' : '#5a3a2a', inner = f < 0.4 ? '#ffe070' : f < 0.7 ? '#f08a2a' : '#7a4a2a';
  ctx.fillStyle = outer; disc(ctx, x, y - Math.round(f * 3), r, f > 0.6 ? 0.55 : 0.9);
  ctx.fillStyle = inner; disc(ctx, x, y - Math.round(f * 4), Math.round(r * 0.55), f > 0.7 ? 0.4 : 1);
}

// A filled pixel disc; density < 1 knocks out pixels in a fixed pattern for a broken-up edge.
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, density: number) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + dy * dy;
    if (d > r * r) continue;
    if (density < 1 && (((dx * 7 + dy * 13) & 7) / 8 > density || (d > (r - 1) * (r - 1) && ((dx + dy) & 1)))) continue;
    ctx.fillRect(cx + dx, cy + dy, 1, 1);
  }
}

export function drawShell(ctx: CanvasRenderingContext2D, s: Shell, vx: number, vy: number) {
  const f = s.t / s.life, x = s.sx + (s.tx - s.sx) * f, y = s.sy + (s.ty - s.sy) * f - Math.sin(f * Math.PI) * s.arc;
  const px = Math.round(x - vx), py = Math.round(y - vy);
  ctx.fillStyle = '#fff0b0'; ctx.fillRect(px, py, 2, 1);
  ctx.fillStyle = 'rgba(255,200,120,0.5)'; ctx.fillRect(px - Math.sign(s.tx - s.sx) * 2, py, 2, 1);
}

export function drawTracer(ctx: CanvasRenderingContext2D, tr: Tracer, vx: number, vy: number) {
  // a short bright streak travelling from gun to target
  const f = Math.min(1, tr.t / 0.07), x0 = tr.x0 + (tr.x1 - tr.x0) * Math.max(0, f - 0.35), y0 = tr.y0 + (tr.y1 - tr.y0) * Math.max(0, f - 0.35);
  const x1 = tr.x0 + (tr.x1 - tr.x0) * f, y1 = tr.y0 + (tr.y1 - tr.y0) * f;
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  ctx.fillStyle = '#ffe89a';
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n - vx), Math.round(y0 + ((y1 - y0) * i) / n - vy), 1, 1);
}
