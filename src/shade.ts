// Hand-picked shading, the way a pixel artist shades: each colour has a ramp of five shades
// (highlight, lit, mid, shade, deep), shifting warm toward the light and cool into the shadow.
// Light only chooses which shade a pixel gets, with an ordered dither where two shades meet.
import * as THREE from 'three';

const RAMP = /* glsl */ `
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
vec3 rampShade(vec3 c, float level) {
  if (level > 3.5) return min(c * 1.18 + vec3(0.035, 0.025, 0.0), vec3(1.0)); // highlight: warm, bright
  if (level > 2.5) return c;                                                  // lit: the colour as drawn
  if (level > 1.5) return c * vec3(0.74, 0.75, 0.84);                         // mid: a touch cooler
  if (level > 0.5) return c * vec3(0.50, 0.50, 0.66);                         // shade: cool
  return c * vec3(0.30, 0.30, 0.46);                                          // deep: cold
}`;

export function rampify<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', `${RAMP}\nvoid main() {`)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 irr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / max(diffuseColor.rgb, vec3(0.002));
  float li = dot(irr, vec3(0.2126, 0.7152, 0.0722));
  // light levels: ~0.95 full sun on a roof, ~0.6 side lit, ~0.3 in shadow
  float t = li * 4.0 - 0.4 + (bayer4(gl_FragCoord.xy) - 0.5) * 0.55;
  vec3 outgoingLight = rampShade(diffuseColor.rgb, clamp(floor(t), 0.0, 4.0)) + totalEmissiveRadiance;`,
      );
  };
  m.customProgramCacheKey = () => 'ramp';
  return m;
}
