// The "screen-printed poster" look.
// 1. printify(): surfaces get flat ink light. Full sun = the colour as authored, shade = a cool
//    shadow ink, and the band in between is drawn as halftone dots instead of a smooth fade.
// 2. PRINT_POST: a full-screen pass that adds ink outlines (found from the depth buffer),
//    a slight print offset between outline and colour, and paper tone and grain.
import * as THREE from 'three';

export const printUniforms = { uDot: { value: 5.0 } };

export function printify<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (s) => {
    s.uniforms.uDot = printUniforms.uDot;
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', `uniform float uDot;
float halftone(float cov, float scale) {
  vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / scale);
  vec2 f = fract(q) - 0.5;
  return step(length(f), sqrt(max(cov, 0.0)) * 0.72);
}
void main() {`)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 irr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / max(diffuseColor.rgb, vec3(0.002));
  float li = dot(irr, vec3(0.2126, 0.7152, 0.0722));
  vec3 lit = diffuseColor.rgb * vec3(1.02, 1.0, 0.96);
  vec3 shade = diffuseColor.rgb * vec3(0.50, 0.50, 0.64);
  vec3 deep = diffuseColor.rgb * vec3(0.34, 0.33, 0.46);
  float hi = 0.7, lo = 0.32;
  vec3 col;
  if (li >= hi) col = lit;
  else if (li >= lo) col = mix(lit, shade, halftone((hi - li) / (hi - lo), uDot));
  else col = mix(shade, deep, halftone(clamp((lo - li) / lo, 0.0, 1.0) * 0.6, uDot * 0.8));
  vec3 outgoingLight = col + totalEmissiveRadiance;`,
      );
  };
  m.customProgramCacheKey = () => 'print';
  return m;
}

export const PRINT_POST = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far;
varying vec2 vUv;
float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = (2.0 * near * far) / (far + near - (d * 2.0 - 1.0) * (far - near));
  return 1.0 / z;
}
float edge(vec2 uv, float k) {
  vec2 o = texel * k;
  float c = invZ(uv);
  float l = invZ(uv - vec2(o.x, 0.0)), r = invZ(uv + vec2(o.x, 0.0));
  float d = invZ(uv - vec2(0.0, o.y)), u = invZ(uv + vec2(0.0, o.y));
  // 1/z changes evenly across a flat face, so any bend in it is a crease or a silhouette
  float lap = abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c);
  float jump = max(max(abs(l - c), abs(r - c)), max(abs(u - c), abs(d - c)));
  return max(smoothstep(0.004, 0.012, lap / c), smoothstep(0.02, 0.05, jump / c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  // ink outline, printed very slightly out of register with the colour
  vec2 off = texel * vec2(0.8, -0.8);
  float e = max(edge(vUv + off, 1.0), max(edge(vUv + off + vec2(texel.x, 0.0), 1.0), edge(vUv + off + vec2(0.0, texel.y), 1.0)));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  vec3 g = gl_FragColor.rgb;
  float l = dot(g, vec3(0.299, 0.587, 0.114));
  g = mix(vec3(l), g, 1.08);
  // paper: warm the whites, add fibres and blotches
  vec3 paper = vec3(0.95, 0.91, 0.82);
  g = mix(g, g * paper + (1.0 - g) * 0.03, 0.55);
  vec2 px = gl_FragCoord.xy;
  float fib = vnoise(px * vec2(0.9, 0.12)) * 0.5 + vnoise(px * 0.35) * 0.5;
  float blot = vnoise(px * 0.006);
  g *= 0.95 + 0.06 * fib - 0.05 * blot;
  g += (hash(px) - 0.5) * 0.025;
  vec3 ink = vec3(0.13, 0.10, 0.09);
  g = mix(g, ink, e * 0.92);
  vec2 d = vUv - 0.5;
  g *= 1.0 - dot(d, d) * 0.35;
  gl_FragColor = vec4(clamp(g, 0.0, 1.0), 1.0);
}`;
