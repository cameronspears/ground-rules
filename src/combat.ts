// Weapons, damage and the look of combat: tracer rounds, cannon shells, muzzle flashes and
// pixel-art explosions. Damage depends on what is hit: rifles shred infantry but barely scratch
// armour; cannons are the other way round.

export type Armour = 'inf' | 'veh' | 'bld' | 'air';
export interface Weapon { range: number; reload: number; dmg: Partial<Record<Armour, number>> & { inf: number; veh: number; bld: number }; kind: 'bullet' | 'shell'; splash?: number; speed?: number; min?: number; arc?: number; clears?: boolean; airOnly?: boolean; footOnly?: boolean; stick?: number } // dmg.air: can it hit aircraft at all; airOnly: flak // min: can't fire closer than this; arc: how high shells loft

export const WEAPONS: Record<string, Weapon> = {
  rifle: { range: 76, reload: 0.9, dmg: { inf: 13, veh: 0.6, bld: 2, air: 0.5 }, kind: 'bullet' }, // for soldiers; armour shrugs it off
  cannon: { range: 112, reload: 2.2, dmg: { inf: 15, veh: 62, bld: 46 }, kind: 'shell', splash: 12, speed: 280 },
  sidearm: { range: 110, reload: 1, dmg: { inf: 8, veh: 0, bld: 0, air: 0 }, kind: 'bullet', footOnly: true }, // a builder's pintle gun: keeps a lone soldier off it, nothing more
  mg: { range: 98, reload: 0.3, dmg: { inf: 8, veh: 1, bld: 1, air: 1 }, kind: 'bullet' }, // the scout's gun
  towerMg: { range: 98, reload: 0.3, dmg: { inf: 11, veh: 1, bld: 1, air: 1 }, kind: 'bullet' }, // the guard tower's, heavier
  emplacement: { range: 132, reload: 2.4, dmg: { inf: 8, veh: 92, bld: 50 }, kind: 'shell', splash: 8, speed: 320 }, // stops vehicles; soldiers walk past it (pair it with a guard tower)
  rocket: { range: 96, reload: 2.6, dmg: { inf: 8, veh: 80, bld: 15, air: 60 }, kind: 'shell', splash: 6, speed: 360, arc: 0.02 },
  howitzer: { range: 240, reload: 6, dmg: { inf: 28, veh: 32, bld: 80 }, kind: 'shell', splash: 18, speed: 190, min: 72, arc: 0.3 },
  grenade: { range: 84, reload: 2.2, dmg: { inf: 44, veh: 8, bld: 30 }, kind: 'shell', splash: 18, speed: 150, arc: 0.4, clears: true }, // clears: can knock soldiers out of a garrison
  heavy: { range: 124, reload: 2.6, dmg: { inf: 26, veh: 160, bld: 85 }, kind: 'shell', splash: 14, speed: 300 },
  flak: { range: 132, reload: 0.4, dmg: { inf: 0, veh: 0, bld: 0, air: 24 }, kind: 'bullet', airOnly: true },
  flakTower: { range: 156, reload: 0.3, dmg: { inf: 0, veh: 0, bld: 0, air: 28 }, kind: 'bullet', airOnly: true },
  gunrockets: { range: 104, reload: 1.5, dmg: { inf: 20, veh: 44, bld: 4 }, // gunships hunt units; buildings shrug them off
  kind: 'shell', splash: 9, speed: 340, arc: 0.02 },
  battery: { range: 480, reload: 8.5, dmg: { inf: 50, veh: 60, bld: 130 }, kind: 'shell', splash: 26, speed: 260, min: 110, arc: 0.32 },
  colossus: { range: 156, reload: 3, dmg: { inf: 22, veh: 220, bld: 120 }, // the army breaker
  kind: 'shell', splash: 14, speed: 300 }, // soldiers swarming it are its weakness
  colossusFlak: { range: 150, reload: 0.25, dmg: { inf: 0, veh: 0, bld: 0, air: 26 }, kind: 'bullet', airOnly: true },
  bombs: { range: 34, reload: 7, dmg: { inf: 4, veh: 8, bld: 260 }, // bombers break buildings; moving units dodge them
  kind: 'shell', splash: 20, speed: 120, arc: 0, stick: 4 }, // stick: bombs dropped in a line
  garrison: { range: 92, reload: 0.9, dmg: { inf: 9, veh: 1, bld: 2, air: 1 }, kind: 'bullet' },
};

// How tough each building is.
export const BLD_HP: Record<string, number> = {
  dam: 3000, bridge: 4000, dam0: 3000, dam1: 3000, dam2: 3000, dam3: 3000,
  fieldCommand: 2000, generator: 700, scrapyard: 1100, barracks: 800, depot: 1300, derrick: 500,
  guardTower: 700, emplacement: 900, workshop: 900, wall: 260, hospital: 800, reactor: 1600, airfield: 1500, flakTower: 650, radar: 700, battery: 1300, shield: 1100, interceptor: 1000, provingGround: 2400, armoury: 1000,
};

// Defensive buildings and the weapon each carries.
export const DEFENCE: Record<string, string> = { guardTower: 'towerMg', emplacement: 'emplacement', flakTower: 'flakTower', battery: 'battery' };

// gx, gy: where it lands on the ground; src: who fired (so the target can shoot back)
export interface Shell { x: number; y: number; sx: number; sy: number; tx: number; ty: number; t: number; life: number; w: Weapon; team: number; arc: number; gx: number; gy: number; src: any; alt?: number } // alt: aimed at an aircraft, so it bursts in the air
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
