// The "screen-printed poster" look.
// 1. printify(): every surface is drawn like an illustration.
//    - Pen marks: each block type has its own mark, drawn in a darker ink of its own colour and
//      fixed to the world (not the screen): grass tufts, dirt dots, rock hatching, leaf scallops,
//      roof-tile and plank lines, asphalt speckle, brick courses.
//    - Flat ink light: full sun = the colour as authored; shade = halftone dots in a cool
//      shadow ink; deep shadow = diagonal hatching.
// 2. PRINT_POST: full-screen pass with ink outlines from the depth buffer (heavier on silhouettes),
//    a slight print offset, and paper tone and grain.
import * as THREE from 'three';

export const printUniforms = { uDot: { value: 5.0 } };

const MARKS = /* glsl */ `
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// how much ink this pixel gets (1 = darker ink, -1 = paler ink, 0 = none)
float penMark(float m, vec3 wp, vec3 n) {
  if (m < 0.5) return 0.0;
  vec3 an = abs(n);
  bool top = an.y > 0.5;
  vec2 uv = top ? wp.xz : (an.x > 0.5 ? vec2(wp.z, wp.y) : wp.xy);
  vec2 cell = floor(uv);
  if (m < 1.5) { // grass: little tufts on top, short strokes on the sides
    vec2 sc = floor(uv * 3.0), sl = fract(uv * 3.0);
    float k = h2(sc);
    if (top) {
      if (k < 0.16) { vec2 q = sl - vec2(0.5); return (abs(abs(q.x) - (q.y + 0.35) * 0.45) < 0.08 && q.y > -0.35 && q.y < 0.25) ? 1.0 : 0.0; }
      return 0.0;
    }
    return (k < 0.3 && abs(sl.x - 0.5) < 0.09 && sl.y > 0.3) ? 1.0 : 0.0;
  }
  if (m < 2.5) { // dirt: scattered dots
    vec2 sc = floor(uv * 3.0), sl = fract(uv * 3.0);
    return (h2(sc + 3.1) < 0.22 && length(sl - vec2(0.3 + 0.4 * h2(sc), 0.3 + 0.4 * h2(sc + 1.0))) < 0.14) ? 1.0 : 0.0;
  }
  if (m < 3.5) { // rock: diagonal hatching on faces, broken up block by block; cracks on top
    if (top) { vec2 sc = floor(uv * 2.0); return (h2(sc) < 0.2 && abs(fract(uv.x * 2.0 + uv.y) - 0.5) < 0.06) ? 1.0 : 0.0; }
    return step(0.35, h2(cell + floor(uv.y * 0.5))) * step(fract((uv.x + uv.y) * 2.5), 0.2);
  }
  if (m < 4.5) { // leaves: scalloped arcs
    vec2 sc = floor(uv * 2.0), sl = fract(uv * 2.0);
    if (h2(sc) < 0.35) return 0.0;
    float d = length(sl - vec2(0.5, 0.7));
    return (abs(d - 0.34) < 0.07 && sl.y < 0.7) ? 1.0 : 0.0;
  }
  if (m < 5.5) { // roof tiles: lines across
    return step(fract((top ? uv.x : uv.y) * 2.0), 0.12);
  }
  if (m < 6.5) { // asphalt: pale speckle
    vec2 sc = floor(uv * 4.0), sl = fract(uv * 4.0);
    return (h2(sc) < 0.1 && length(sl - 0.5) < 0.2) ? -1.0 : 0.0;
  }
  if (m < 7.5) { // brick courses with staggered joints
    float row = floor(uv.y * 2.0);
    return (fract(uv.y * 2.0) < 0.12 || fract(uv.x + row * 0.5) < 0.07) ? 1.0 : 0.0;
  }
  // wood and sacks: grain lines
  return step(fract(uv.y * 3.0 + h2(cell) * 0.5), 0.1) * step(0.3, h2(cell + 7.0));
}`;

export function printify<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (s) => {
    s.uniforms.uDot = printUniforms.uDot;
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'attribute float mark;\nvarying float vMark; varying vec3 vWP; varying vec3 vWN;\nvoid main() {')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 wpos = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wpos = instanceMatrix * wpos;
  #endif
  vWP = (modelMatrix * wpos).xyz;
  vWN = normalize(mat3(modelMatrix) * objectNormal);
  vMark = mark;`);
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', `uniform float uDot;
varying float vMark; varying vec3 vWP; varying vec3 vWN;
${MARKS}
float halftone(float cov, float scale) {
  vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / scale);
  return step(length(fract(q) - 0.5), sqrt(max(cov, 0.0)) * 0.72);
}
float hatch(float cov, float scale) {
  return step(fract((gl_FragCoord.x + gl_FragCoord.y) / scale), cov * 0.55);
}
void main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float ink = penMark(floor(vMark + 0.5), vWP + vWN * 0.01, vWN);
  diffuseColor.rgb = ink > 0.0 ? diffuseColor.rgb * 0.58 : ink < 0.0 ? mix(diffuseColor.rgb, vec3(0.75, 0.72, 0.66), 0.5) : diffuseColor.rgb;`)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 irr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / max(diffuseColor.rgb, vec3(0.002));
  float li = dot(irr, vec3(0.2126, 0.7152, 0.0722));
  vec3 lit = diffuseColor.rgb * vec3(1.02, 1.0, 0.96);
  vec3 shade = diffuseColor.rgb * vec3(0.52, 0.52, 0.66);
  vec3 deep = diffuseColor.rgb * vec3(0.30, 0.29, 0.42);
  float hi = 0.7, lo = 0.32;
  vec3 col;
  if (li >= hi) col = lit;
  else if (li >= lo) col = mix(lit, shade, halftone((hi - li) / (hi - lo), uDot));
  else col = mix(shade, deep, hatch(clamp((lo - li) / lo, 0.0, 1.0) * 0.9 + 0.25, uDot * 0.9));
  vec3 outgoingLight = col + totalEmissiveRadiance;`,
      );
  };
  m.customProgramCacheKey = () => 'print2';
  return m;
}

export const PRINT_POST = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far;
varying vec2 vUv;
float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = (2.0 * near * far) / (far + near - (d * 2.0 - 1.0) * (far - near));
  return 1.0 / z;
}
// crease: 1/z changes evenly across a flat face, so a bend in it is a fold
float crease(vec2 uv) {
  float c = invZ(uv);
  float l = invZ(uv - vec2(texel.x, 0.0)), r = invZ(uv + vec2(texel.x, 0.0));
  float d = invZ(uv - vec2(0.0, texel.y)), u = invZ(uv + vec2(0.0, texel.y));
  return smoothstep(0.004, 0.012, (abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c)) / c);
}
// silhouette: a big jump in depth, checked over a wider ring so the line is heavier
float silhouette(vec2 uv) {
  float c = invZ(uv), m = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    m = max(m, abs(invZ(uv + vec2(cos(a), sin(a)) * texel * 1.8) - c));
  }
  return smoothstep(0.025, 0.06, m / c);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  vec2 uv = vUv + texel * vec2(0.8, -0.8); // outline plate slightly out of register
  float e = max(crease(uv), max(crease(uv + vec2(texel.x, 0.0)), crease(uv + vec2(0.0, texel.y))));
  e = max(e, silhouette(uv));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  vec3 g = gl_FragColor.rgb;
  float l = dot(g, vec3(0.299, 0.587, 0.114));
  g = mix(vec3(l), g, 1.1);
  vec3 paper = vec3(0.95, 0.91, 0.82);
  g = mix(g, g * paper + (1.0 - g) * 0.03, 0.55);
  vec2 px = gl_FragCoord.xy;
  float fib = vnoise(px * vec2(0.9, 0.12)) * 0.5 + vnoise(px * 0.35) * 0.5;
  float blot = vnoise(px * 0.006);
  g *= 0.95 + 0.06 * fib - 0.05 * blot;
  g += (hash(px) - 0.5) * 0.025;
  vec3 ink = vec3(0.12, 0.09, 0.08);
  g = mix(g, ink, e * 0.94);
  vec2 d = vUv - 0.5;
  g *= 1.0 - dot(d, d) * 0.35;
  gl_FragColor = vec4(clamp(g, 0.0, 1.0), 1.0);
}`;
