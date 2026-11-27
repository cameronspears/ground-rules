// Turns block models into flat pixel sprites when the game loads, the way classic strategy
// games pre-rendered their art. Each model is drawn from N angles with the hand-picked shade
// ramps (shade.ts) and a fixed sun from the upper left, one block = one pixel, in the same
// three-quarter view as the map. A dithered shadow is baked alongside each one.
import { ModelDef, VB } from './models';
import type { Mesh } from './voxel';
import { RAMP, SHADE } from './shade';
import { SQ } from './terrain';
import { LOOK } from './look';

// ax, ay: the anchor in img (and in lit.imgs); sx, sy: the anchor in its shadows; top: how far the uncut picture rose above
// its anchor (a building's fire and markers sit by it).
export interface Sprite { img: HTMLCanvasElement; ax: number; ay: number; shadow: HTMLCanvasElement; sx: number; sy: number; top: number; lit?: Lit }
// The same model lit by the morning, noon and evening sun, so a building's light can turn with the day
// (the game blends the two nearest). Shadows are baked for the morning and evening suns, and the game
// re-aims them as the sun moves (LIT_FALL: where each falls on screen per pixel of height).
export interface Lit { imgs: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement]; shadows: [HTMLCanvasElement, HTMLCanvasElement] }

// Directions, and the 4x4 transforms of a block model, in three.js's layout and with its sums in its order (the art was
// first baked with three.js; doing the same arithmetic the same way keeps every pixel as it was).
export interface V3 { x: number; y: number; z: number }
type M4 = number[]; // column by column
const unit = (x: number, y: number, z: number): V3 => { const s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1); return { x: x * s, y: y * s, z: z * s }; };
const m4 = (...r: number[]): M4 => [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15].map((i) => r[i]); // (written row by row)
function mul(a: M4, b: M4): M4 { // a times b
  const o: M4 = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const turnY = (t: number) => { const c = Math.cos(t), s = Math.sin(t); return m4(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1); };
function turnAbout({ x, y, z }: V3, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c, tx = t * x, ty = t * y;
  return m4(tx * x + c, tx * y - s * z, tx * z + s * y, 0, tx * y + s * z, ty * y + c, ty * z - s * x, 0, tx * z - s * y, ty * z + s * x, t * z * z + c, 0, 0, 0, 0, 1);
}
// A direction turned about an axis (for the title's cards, which tip their models), by way of a quaternion, as three.js did
export function turned(v: V3, axis: V3, angle: number): V3 {
  const h = angle / 2, s = Math.sin(h), qx = axis.x * s, qy = axis.y * s, qz = axis.z * s, qw = Math.cos(h), { x, y, z } = v;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return { x: x + qw * tx + qy * tz - qz * ty, y: y + qw * ty + qz * tx - qx * tz, z: z + qw * tz + qx * ty - qy * tx };
}
// The 3x3 that turns a model's normals (the inverse of its transform, transposed), column by column
function normals(m: M4) {
  const n11 = m[0], n21 = m[1], n31 = m[2], n12 = m[4], n22 = m[5], n32 = m[6], n13 = m[8], n23 = m[9], n33 = m[10];
  const t11 = n33 * n22 - n32 * n23, t12 = n32 * n13 - n33 * n12, t13 = n23 * n12 - n22 * n13, det = n11 * t11 + n21 * t12 + n31 * t13;
  if (det === 0) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const d = 1 / det;
  return [t11 * d, t12 * d, t13 * d, (n31 * n23 - n33 * n21) * d, (n33 * n11 - n31 * n13) * d, (n21 * n13 - n23 * n11) * d, (n32 * n21 - n31 * n22) * d, (n31 * n12 - n32 * n11) * d, (n22 * n11 - n21 * n12) * d];
}

const SUN = unit(-1, 1.7, -0.9); // toward the sun: upper left of the screen
// The day's suns, in the bake's frame (x right, y up, z toward the viewer): low from the left and
// behind in the morning, high and a little behind at noon, low from the right in the evening.
export const SUNS = [unit(-0.73, 0.57, -0.37), unit(0, 0.94, -0.34), unit(0.73, 0.57, -0.37)];
export const LIT_FALL = [0, 2].map((k) => [-SUNS[k].x / SUNS[k].y, (-SUNS[k].z / SUNS[k].y) * SQ]); // (down the screen only SQ as far: the ground is drawn squashed, height isn't)
const meshes = new WeakMap<VB, Map<string, Mesh | null>>();

// The lights: a sky (blue-white above, earthy below) and a warm sun, as linear colours times their strength
const lin = (hex: number, k: number) => [hex >> 16, (hex >> 8) & 255, hex & 255].map((v) => { const c = v / 255; return (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)) * k; });
const SKY = lin(0xc9d8e8, 1.1), EARTH = lin(0x6a5a44, 1.1), SUNLIGHT = lin(0xffe6c4, 3.0);

// The drawing: blocks lit by sky and sun and shaded by the ramps (shade.ts), or a flat silhouette (a shadow's shape).
// The lit one is three.js's Lambert shading, as it was, written out.
const VERT = (lit: boolean) => `#version 300 es
precision highp float;
uniform mat4 modelViewMatrix, projectionMatrix; uniform mat3 normalMatrix;
in vec3 position, normal, color;
out vec4 vColor; out vec3 vNormal;
void main() {${lit ? `
  vColor = vec4( 1.0 ); vColor.rgb *= color;
  vec3 objectNormal = vec3( normal ); vec3 transformedNormal = objectNormal; transformedNormal = normalMatrix * transformedNormal; vNormal = normalize( transformedNormal );` : ''}
  vec3 transformed = vec3( position ); vec4 mvPosition = vec4( transformed, 1.0 ); mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;
}`;
const FRAG = `#version 300 es
precision highp float;
#define RECIPROCAL_PI 0.3183098861837907
#define saturate( a ) clamp( a, 0.0, 1.0 )
uniform vec3 diffuse, emissive, ambientLightColor; uniform float opacity;
struct DirectionalLight { vec3 direction; vec3 color; }; uniform DirectionalLight directionalLights[ 1 ];
struct HemisphereLight { vec3 direction; vec3 skyColor; vec3 groundColor; }; uniform HemisphereLight hemisphereLights[ 1 ];
struct IncidentLight { vec3 color; vec3 direction; bool visible; };
struct ReflectedLight { vec3 directDiffuse; vec3 directSpecular; vec3 indirectDiffuse; vec3 indirectSpecular; };
struct LambertMaterial { vec3 diffuseColor; float specularStrength; };
in vec4 vColor; in vec3 vNormal; out highp vec4 pc_fragColor;
vec3 BRDF_Lambert( const in vec3 diffuseColor ) { return RECIPROCAL_PI * diffuseColor; }
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) { vec3 irradiance = ambientLightColor; return irradiance; }
vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
  float dotNL = dot( normal, hemiLight.direction ); float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
  vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ); return irradiance;
}
void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) { light.color = directionalLight.color; light.direction = directionalLight.direction; light.visible = true; }
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = saturate( dot( geometryNormal, directLight.direction ) ); vec3 irradiance = dotNL * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in LambertMaterial material, inout ReflectedLight reflectedLight ) { reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor ); }
vec4 sRGBTransferOETF( in vec4 value ) { return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a ); }
vec4 linearToOutputTexel( vec4 value ) { return sRGBTransferOETF( vec4( mat3( 1.0000,0.0000,-0.0000,-0.0000,1.0000,-0.0000,-0.0000,0.0000,1.0000 ) * value.rgb, value.a ) ); }
${RAMP}
void main() {
  vec4 diffuseColor = vec4( diffuse, opacity );
  ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
  vec3 totalEmissiveRadiance = emissive;
  diffuseColor *= vColor;
  vec3 normal = normalize( vNormal );
  LambertMaterial material; material.diffuseColor = diffuseColor.rgb; material.specularStrength = 1.0;
  vec3 geometryNormal = normal;
  IncidentLight directLight; DirectionalLight directionalLight; directionalLight = directionalLights[ 0 ];
  getDirectionalLightInfo( directionalLight, directLight );
  RE_Direct_Lambert( directLight, geometryNormal, material, reflectedLight );
  vec3 iblIrradiance = vec3( 0.0 );
  vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
  irradiance += getHemisphereLightIrradiance( hemisphereLights[ 0 ], geometryNormal );
  irradiance += iblIrradiance;
  RE_IndirectDiffuse_Lambert( irradiance, material, reflectedLight );
  ${SHADE}
  diffuseColor.a = 1.0;
  pc_fragColor = vec4( outgoingLight, diffuseColor.a );
  pc_fragColor = linearToOutputTexel( pc_fragColor );
}`;
const FLAT = `#version 300 es
precision highp float;
out highp vec4 pc_fragColor;
void main() { pc_fragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); }`;

let again = false; // (redrawing a picture after a lost drawing: see bake)
interface Prog { p: WebGLProgram; u: (name: string) => WebGLUniformLocation | null }
let gl: WebGL2RenderingContext, litProg: Prog, flatProg: Prog, buffers: WebGLBuffer[];
function program(vs: string, fs: string): Prog {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    gl.attachShader(p, sh);
  }
  ['position', 'normal', 'color'].forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program');
  const at = new Map<string, WebGLUniformLocation | null>();
  return { p, u: (n) => (at.has(n) ? at.get(n)! : (at.set(n, gl.getUniformLocation(p, n)), at.get(n)!)) };
}
function setup() {
  if (gl && !gl.isContextLost()) return;
  gl = document.createElement('canvas').getContext('webgl2', { antialias: false, alpha: true, depth: true, stencil: false, preserveDrawingBuffer: true, premultipliedAlpha: false })!;
  litProg = program(VERT(true), FRAG); flatProg = program(VERT(false), FLAT);
  gl.useProgram(litProg.p);
  gl.uniform3f(litProg.u('diffuse'), 1, 1, 1); gl.uniform3f(litProg.u('emissive'), 0, 0, 0); gl.uniform3f(litProg.u('ambientLightColor'), 0, 0, 0); gl.uniform1f(litProg.u('opacity'), 1);
  gl.uniform3f(litProg.u('hemisphereLights[0].direction'), 0, 1, 0); gl.uniform3fv(litProg.u('hemisphereLights[0].skyColor'), SKY); gl.uniform3fv(litProg.u('hemisphereLights[0].groundColor'), EARTH);
  gl.uniform3fv(litProg.u('directionalLights[0].color'), SUNLIGHT);
  gl.bindVertexArray(gl.createVertexArray());
  buffers = [0, 1, 2, 3].map(() => gl.createBuffer()!);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW); gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
}
// The sun the lit drawing is lit by (a direction toward it)
const aimSun = (s: V3) => { const d = unit(s.x * 100, s.y * 100, s.z * 100); gl.useProgram(litProg.p); gl.uniform3f(litProg.u('directionalLights[0].direction'), d.x, d.y, d.z); };

// Flattens a model onto the ground along the sun's direction.
const flatten = (sun: V3) => m4(
  1, -sun.x / sun.y, 0, 0,
  0, 0, 0, 0.01,
  0, -sun.z / sun.y, 1, 0,
  0, 0, 0, 1,
);
const SHADOW = flatten(SUN);

export interface BakeOpts { lit?: boolean; facings?: number; team?: number[]; tilt?: { axis: V3; angle: number }; yaw?: number; scale?: number;
  fit?: VB; shade?: Shade[] } // (fit, shade: see bakeFrames)

export function bake(def: ModelDef, part: 'body' | 'turret', opts: BakeOpts = {}): Sprite[] {
  const vb: VB = part === 'body' ? def.body : def.turret!;
  const pivot = part === 'body' ? def.bodyPivot : def.turretPivot!;
  const team = opts.team ?? [0x4a78a8, 0x2e4a68, 0x5c96d2];
  // build each model's mesh once and reuse it for every angle and tilt
  const grime = part === 'body' && !def.clean ? 4 : 0; // (dirt rises from the ground: a turret, or an aircraft, sits clear of it)
  const key = team.join() + pivot.join() + grime;
  let byTeam = meshes.get(vb);
  if (!byTeam) meshes.set(vb, (byTeam = new Map()));
  let geo = byTeam.get(key);
  if (geo === undefined) byTeam.set(key, (geo = vb.geometry(team, pivot, grime)));
  const n = opts.facings ?? 1;
  // canvas size: covers the model at any angle plus its shadow
  let R = 0;
  const fit = opts.fit ?? vb; // (what sets the picture's size: an animation frame takes its model's, so the two line up)
  fit.each((x, y, z) => { R = Math.max(R, Math.hypot(x - pivot[0] + 0.5, z - pivot[2] + 0.5)); });
  const sc = opts.scale ?? 1; // small scales make build-panel icons
  R *= sc;
  const Hm0 = Math.ceil((Math.max(vb.max[1], fit.max[1]) - pivot[1]) * sc + 2), Hm = Hm0 + (Hm0 % 2);
  const Rx = Math.ceil(R + 2 + (opts.tilt ? Hm : 0) + Hm * (opts.lit ? 1.3 : 0.65)); // (the low suns cast longer shadows)
  const w = Rx * 2, h = Rx * 2 + Hm, cy = Hm / 2;
  // clip.x = x * 2/w ; clip.y = (y - z - cy) * 2/h ; nearer (larger y + z) wins the depth test
  const proj = m4(2 / w, 0, 0, 0, 0, 2 / h, (-2 / h) * SQ, -2 * cy / h, 0, -1 / 2000, -1 / 2000, 0, 0, 0, 0, 1);
  // Things that turn (units, turrets, people, cars) are lit from high overhead, like noon, so they look
  // right whichever way they face at any hour; their shadows still come from a low sun, to be re-aimed.
  setup();
  aimSun(n > 1 ? SUNS[1] : SUN);
  // Every facing (and its shadow, unless another team's copy already made it: a shadow has no colour)
  // is drawn into its own cell of one big picture, and that is read back from the graphics card once.
  // Reading back after each drawing made the CPU wait on the GPU hundreds of times per load.
  const skey = [n, opts.yaw ?? 0, opts.tilt ? [opts.tilt.axis.x, opts.tilt.axis.y, opts.tilt.axis.z, opts.tilt.angle].join() : '', sc, pivot.join(), w, h, opts.lit ? 1 : 0].join('|'); // (same size of picture too: a lit bake is bigger)
  let shade = opts.shade ?? shadowCache.get(vb)?.get(skey);
  const L = shade ? 3 : 5; // (lit pictures per facing: three suns, and two suns' shadows unless they're made already)
  // (lit: per facing, three suns' pictures and two suns' shadows, after the plain pictures and shadows)
  const lit0 = n * (shade ? 1 : 2), cells = lit0 + (opts.lit ? n * L : 0), cols = Math.max(1, Math.min(cells, Math.floor(4096 / w))), rows = Math.ceil(cells / cols);
  const AW = cols * w, AH = rows * h;
  gl.canvas.width = AW; gl.canvas.height = AH;
  gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, AW, AH); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.SCISSOR_TEST);
  if (geo) for (const [i, data] of [geo.pos, geo.nor, geo.col].entries()) { gl.bindBuffer(gl.ARRAY_BUFFER, buffers[i]); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0); }
  if (geo) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers[3]); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW); }
  for (const pr of [litProg, flatProg]) { gl.useProgram(pr.p); gl.uniformMatrix4fv(pr.u('projectionMatrix'), false, proj); }
  const at = (k: number): [number, number] => [(k % cols) * w, Math.floor(k / cols) * h]; // a cell's top-left, in picture pixels
  const draw = (lit: boolean, m: M4, k: number) => {
    if (!geo) return; // (an empty model draws nothing)
    const [x, y] = at(k), pr = lit ? litProg : flatProg; gl.viewport(x, AH - y - h, w, h); gl.scissor(x, AH - y - h, w, h);
    gl.useProgram(pr.p); gl.uniformMatrix4fv(pr.u('modelViewMatrix'), false, m); if (lit) gl.uniformMatrix3fv(pr.u('normalMatrix'), false, normals(m));
    gl.drawElements(gl.TRIANGLES, geo.idx.length, geo.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  };
  for (let i = 0; i < n; i++) {
    let rot = turnY(-((i / n) * Math.PI * 2 + (opts.yaw ?? 0)));
    if (opts.tilt) rot = mul(turnAbout(opts.tilt.axis, opts.tilt.angle), rot);
    if (sc !== 1) rot = mul(m4(sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, 1), rot);
    draw(true, rot, i);
    if (!shade) draw(false, mul(SHADOW, rot), n + i);
    if (opts.lit) { // the same view under each of the day's suns, and the morning and evening suns' shadows
      for (const [k, sun] of SUNS.entries()) {
        aimSun(sun);
        draw(true, rot, lit0 + i * L + k);
        if (k === 1 || shade) continue;
        draw(false, mul(flatten(sun), rot), lit0 + i * L + (k ? 4 : 3));
      }
      aimSun(n > 1 ? SUNS[1] : SUN);
    }
  }
  const whole = new Uint8Array(AW * AH * 4); gl.readPixels(0, 0, AW, AH, gl.RGBA, gl.UNSIGNED_BYTE, whole); // (rows bottom up)
  // The browser drops a page's graphics card drawing when it runs short (of memory, or of drawings: it keeps a few at once), and what
  // was drawn reads back empty. Drawn again on a fresh one (once), so a picture never comes out blank for the rest of the game.
  if (gl.isContextLost() && !again) { again = true; try { return bake(def, part, opts); } finally { again = false; } }
  const edge = LOOK.edge && n > 1 && sc === 1; // (things that turn: units, turrets, people, cars; not icons)
  const fin = (k: number, isShadow: boolean) => { const [x, y] = at(k); return finish(whole, AW, AH, x, y, w, h, isShadow); };
  const cut = (ks: number[], isShadow: boolean) => { const b = box(ks.map((k) => fin(k, isShadow))); return { b, pics: ks.map((k) => { const [x, y] = at(k); return crop(whole, AW, AH, x, y, b, isShadow, edge); }) }; };
  // Each picture keeps only the box its pixels fill (a cell is sized for the model at any angle with its longest shadow, so
  // most of it is empty: three quarters of all picture memory was). A sprite's pictures share one box, so one anchor serves them all.
  if (!shade) {
    shade = [];
    for (let i = 0; i < n; i++) {
      const { b, pics: [c, ...lit] } = cut([n + i, ...(opts.lit ? [lit0 + i * L + 3, lit0 + i * L + 4] : [])], true);
      shade.push({ c, lit: opts.lit ? [lit[0], lit[1]] : undefined, x: b.x, y: b.y });
    }
    let m = shadowCache.get(vb); if (!m) shadowCache.set(vb, (m = new Map())); m.set(skey, shade);
  }
  const out: Sprite[] = [];
  for (let i = 0; i < n; i++) {
    const b0 = lit0 + i * L, { b, pics: [img, ...lit] } = cut([i, ...(opts.lit ? [b0, b0 + 1, b0 + 2] : [])], false), s = shade[i];
    const sp: Sprite = { img, ax: w / 2 - b.x, ay: h / 2 + cy - b.y, shadow: s.c, sx: w / 2 - s.x, sy: h / 2 + cy - s.y, top: h / 2 + cy };
    if (opts.lit) sp.lit = { imgs: [lit[0], lit[1], lit[2]], shadows: s.lit! };
    shadeOf.set(sp, s);
    out.push(sp);
  }
  return out;
}
// A facing's shadows, kept apart from its colours: every team's copy of a model (and its animation frames) shares them.
// x, y: where the box they were cut to sat in the baked cell.
interface Shade { c: HTMLCanvasElement; lit?: [HTMLCanvasElement, HTMLCanvasElement]; x: number; y: number }
const shadowCache = new WeakMap<VB, Map<string, Shade[]>>(), shadeOf = new WeakMap<Sprite, Shade>();

// A moving model's animation frames (legs mid-stride, a fan further round) for its pictures `body`. They borrow its shadows
// (a swinging leg barely moves a shadow), and a model that turns gets them at every other facing: in motion, half as many
// angles don't show, and the frames were most of the Wild West's picture memory, which the browser ran short of.
export function bakeFrames(def: ModelDef, body: Sprite[], o: BakeOpts = {}): Sprite[][] | undefined {
  if (!def.frames) return undefined;
  const n = o.facings ?? 1, step = n > 8 ? 2 : 1, picks = body.filter((_, i) => i % step === 0);
  const fo: BakeOpts = { ...o, facings: n / step, fit: def.body, shade: picks.map((s) => shadeOf.get(s)!) };
  return def.frames.map((f) => bake({ ...def, body: f }, 'body', fo));
}

type Box = { x: number; y: number; w: number; h: number };
// The smallest box holding every given box (1x1 if they're all empty)
function box(cells: (Box | null)[]): Box {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const c of cells) if (c) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w - 1); y1 = Math.max(y1, c.y + c.h - 1); }
  return x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// One w x h cell of the read-back picture (rows bottom up, cell at cx, cy from the top left), finished where it lies: faint
// pixels dropped, a shadow's coloured. Returns the box its opaque pixels fill, within the cell (null if none).
function finish(src: Uint8Array, AW: number, AH: number, cx: number, cy: number, w: number, h: number, dither: boolean): Box | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0, i = ((AH - 1 - cy - y) * AW + cx) * 4; x < w; x++, i += 4) {
    if (src[i + 3] < 128) { src[i + 3] = 0; continue; }
    src[i + 3] = 255; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y;
    // shadows: an even, cool, see-through dark (no dither pattern, so nothing shimmers as things move)
    if (dither) { src[i] = 12; src[i + 1] = 18; src[i + 2] = 28; } // laid down at even strength by the game
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// The box b of a finished cell as its own picture, its edges finished (a sprite's; not a shadow's). Only the box is worked
// on: the rest of the cell is empty, and an edge pixel's empty neighbours count the same inside the box or out.
function crop(src: Uint8Array, AW: number, AH: number, cx: number, cy: number, b: Box, dither: boolean, edge: boolean) {
  const c = document.createElement('canvas');
  c.width = b.w; c.height = b.h;
  const ctx = c.getContext('2d')!, d = ctx.createImageData(b.w, b.h);
  for (let y = 0; y < b.h; y++) { const i = ((AH - 1 - cy - b.y - y) * AW + cx + b.x) * 4; d.data.set(src.subarray(i, i + b.w * 4), y * b.w * 4); }
  if (!dither) edges(d.data, b.w, b.h, edge);
  ctx.putImageData(d, 0, 0);
  return c;
}

// Pixel-art finishing: a gentle sunlit rim along the top edge and a slightly darker underside,
// using the sprite's own colours so the edges stay natural (and, for things that turn, their outer pixels deepened).
function edges(p: Uint8ClampedArray, w: number, h: number, edge = false) {
  const src = new Uint8ClampedArray(p);
  const a = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (a(x, y)) {
      if (edge && (!a(x - 1, y) || !a(x + 1, y) || !a(x, y + 1))) { p[i] = src[i] * 0.62; p[i + 1] = src[i + 1] * 0.62; p[i + 2] = src[i + 2] * 0.7; continue; } // its own outer pixels deepened: a crisp edge that adds nothing to its size
      if (!a(x, y - 1)) for (let k = 0; k < 3; k++) p[i + k] = Math.min(255, src[i + k] * 1.1 + 6); // gentle sunlit rim on top
      else if (!a(x, y + 1)) { p[i] = src[i] * 0.72; p[i + 1] = src[i + 1] * 0.72; p[i + 2] = src[i + 2] * 0.78; } // underside sits in shade
      continue;
    }
  }
}

// Picks the sprite for a heading (radians, 0 = east, growing clockwise on screen).
export function facing(sprites: Sprite[], angle: number) {
  const n = sprites.length;
  const i = Math.round((angle / (Math.PI * 2)) * n);
  return sprites[((i % n) + n) % n];
}
