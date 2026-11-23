// The game's finish: a light colour grade, a little sun warmth, a soft bloom off bright things and a
// faint vignette, laid over the world after the time of day and before health bars, words and the fog.
// Each piece is one number here (0, or false, turns it off) so any of them can go without the others.
export const LOOK = {
  contrast: 1.06, saturate: 1.06, bright: 1.02, // the grade (1 = as painted), done by the browser as it shows the picture
  warm: 0.14, // a warm wash over the light parts while the sun is up
  bloom: 0.2, // light spilling off fire, flashes and bright roofs
  vignette: 0.15, // the corners darken a touch
  glow: 0.5, // fire, blasts and muzzle flashes glow by day too (they always do at night)
  ring: true, // big blasts throw a pale shock ring
  edge: true, // things that turn (units, turrets, people, cars) have their outer pixels deepened (baked at load)
  smooth: true, // art shaded in smooth steps, not five hard ones with a checker where they meet (baked at load)
  night: 0.2, // how far the night's darkness is lifted toward daylight (lights still burn as at full night)
};

let vig: HTMLCanvasElement | null = null, bloomC: HTMLCanvasElement | null = null;
// VW: the width the battlefield shows in, left of the side panel (the vignette centres on it); dark: 0 by day, 1 at night
export function grade(ctx: CanvasRenderingContext2D, W: number, H: number, VW: number, dark: number) {
  const c = ctx.canvas, L = LOOK;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  if (L.bloom > 0) { // bright parts only, shrunk to an eighth, then stretched back soft and added on
    const bw = Math.ceil(W / 8), bh = Math.ceil(H / 8);
    if (!bloomC) bloomC = document.createElement('canvas');
    if (bloomC.width !== bw || bloomC.height !== bh) { bloomC.width = bw; bloomC.height = bh; }
    const b = bloomC.getContext('2d')!;
    b.globalCompositeOperation = 'copy'; b.imageSmoothingEnabled = true; b.filter = 'brightness(0.5) contrast(4)'; // (only what's near white survives)
    b.drawImage(c, 0, 0, W, H, 0, 0, bw, bh); b.filter = 'none';
    ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = L.bloom;
    ctx.drawImage(bloomC, 0, 0, bw, bh, -4, -4, W + 8, H + 8);
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
  }
  // the grade itself is left to the browser as it puts the picture on screen: free there, where
  // redrawing the picture through a filter cost more than everything else here put together
  const f = `contrast(${L.contrast}) saturate(${L.saturate}) brightness(${L.bright})`;
  if (c.style.filter !== f) c.style.filter = f;
  const warm = L.warm * (1 - dark); // (the warmth is the sun's: it goes with the light)
  if (warm > 0.01) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(255,178,102,${warm})`; ctx.fillRect(0, 0, W, H); }
  if (L.vignette > 0) {
    if (!vig || vig.width !== W || vig.height !== H || vig.dataset.vw !== String(VW)) {
      vig = document.createElement('canvas'); vig.width = W; vig.height = H; vig.dataset.vw = String(VW);
      const g = vig.getContext('2d')!, r = g.createRadialGradient(VW / 2, H / 2, Math.min(VW, H) * 0.35, VW / 2, H / 2, Math.hypot(VW, H) * 0.55);
      r.addColorStop(0, '#fff'); r.addColorStop(1, '#464050'); g.fillStyle = r; g.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = L.vignette; ctx.drawImage(vig, 0, 0); ctx.globalAlpha = 1;
  }
  ctx.restore();
}
