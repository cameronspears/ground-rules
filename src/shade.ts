// Hand-picked shading, the way a pixel artist shades: each colour has a ramp of five shades
// (highlight, lit, mid, shade, deep), shifting warm toward the light and cool into the shadow.
// Light chooses the shade: in smooth steps between the two nearest (LOOK.smooth), or else just one of the
// five, with an ordered dither where two meet. (GLSL for bake.ts's shader: RAMP is its helpers, SHADE turns the
// light that reached a block's face into its shade.)
import { LOOK } from './look';

export const RAMP = /* glsl */ `
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
vec3 rampShade(vec3 c, float level) {
  if (level > 3.5) return min(c * 1.32 + vec3(0.05, 0.04, 0.01), vec3(1.0)); // highlight: warm, bright
  if (level > 2.5) return c;                                                  // lit: the colour as drawn
  if (level > 1.5) return c * vec3(0.72, 0.73, 0.82);                         // mid: a touch cooler
  if (level > 0.5) return c * vec3(0.46, 0.47, 0.60);                         // shade: cool
  return c * vec3(0.24, 0.25, 0.38);                                          // deep: cold
}`;

export const SHADE = /* glsl */ `vec3 irr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / max(diffuseColor.rgb, vec3(0.002));
  float li = dot(irr, vec3(0.2126, 0.7152, 0.0722));
  // light levels: ~0.95 full sun on a roof, ~0.6 side lit, ~0.3 in shadow
  ${LOOK.smooth ? `float t = clamp(li * 4.0 - 0.4, 0.0, 4.0); // smooth: a blend between the two nearest shades, a quarter of the way at a time
  float lo = min(floor(t), 3.0), fr = floor((t - lo) * 4.0 + 0.5) / 4.0;
  vec3 outgoingLight = mix(rampShade(diffuseColor.rgb, lo), rampShade(diffuseColor.rgb, lo + 1.0), fr) + totalEmissiveRadiance;` : `float t = li * 4.0 - 0.4 + (bayer4(gl_FragCoord.xy) - 0.5) * 0.55;
  vec3 outgoingLight = rampShade(diffuseColor.rgb, clamp(floor(t), 0.0, 4.0)) + totalEmissiveRadiance;`}`;
