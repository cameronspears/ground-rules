// Turns block models into flat pixel sprites when the game loads, the way classic strategy
// games pre-rendered their art. Each model is drawn from N angles with the hand-picked shade
// ramps (shade.ts) and a fixed sun from the upper left, one block = one pixel, in the same
// three-quarter view as the map. A dithered shadow is baked alongside each one.
import * as THREE from 'three';
import { ModelDef, VB } from './models';
import { rampify } from './shade';
import { SQ } from './terrain';

export interface Sprite { img: HTMLCanvasElement; ax: number; ay: number; shadow: HTMLCanvasElement; lit?: Lit }
// The same model lit by the morning, noon and evening sun, so a building's light can turn with the day
// (the game blends the two nearest). Shadows are baked for the morning and evening suns, and the game
// re-aims them as the sun moves (LIT_FALL: where each falls on screen per pixel of height).
export interface Lit { imgs: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement]; shadows: [HTMLCanvasElement, HTMLCanvasElement] }

const SUN = new THREE.Vector3(-1, 1.7, -0.9).normalize(); // toward the sun: upper left of the screen
// The day's suns, in the bake's frame (x right, y up, z toward the viewer): low from the left and
// behind in the morning, high and a little behind at noon, low from the right in the evening.
export const SUNS = [new THREE.Vector3(-0.73, 0.57, -0.37), new THREE.Vector3(0, 0.94, -0.34), new THREE.Vector3(0.73, 0.57, -0.37)].map((v) => v.normalize());
export const LIT_FALL = [0, 2].map((k) => [-SUNS[k].x / SUNS[k].y, -SUNS[k].z / SUNS[k].y]);
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, sunLight: THREE.DirectionalLight;
const mat = rampify(new THREE.MeshLambertMaterial({ vertexColors: true }));
const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
const meshes = new WeakMap<VB, Map<string, THREE.BufferGeometry>>();

function setup() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xc9d8e8, 0x6a5a44, 1.1));
  sunLight = new THREE.DirectionalLight(0xffe6c4, 3.0);
  sunLight.position.copy(SUN).multiplyScalar(100);
  scene.add(sunLight);
  cam = new THREE.Camera();
  cam.matrixAutoUpdate = false; cam.matrixWorldAutoUpdate = false;
}

// Flattens a model onto the ground along the sun's direction.
const flatten = (sun: THREE.Vector3) => new THREE.Matrix4().set(
  1, -sun.x / sun.y, 0, 0,
  0, 0, 0, 0.01,
  0, -sun.z / sun.y, 1, 0,
  0, 0, 0, 1,
);
const SHADOW = flatten(SUN);

export interface BakeOpts { lit?: boolean; facings?: number; team?: number[]; tilt?: { axis: THREE.Vector3; angle: number }; yaw?: number; scale?: number }

export function bake(def: ModelDef, part: 'body' | 'turret', opts: BakeOpts = {}): Sprite[] {
  setup();
  const vb: VB = part === 'body' ? def.body : def.turret!;
  const pivot = part === 'body' ? def.bodyPivot : def.turretPivot!;
  const team = opts.team ?? [0x4a78a8, 0x2e4a68, 0x5c96d2];
  // build each model's mesh once and reuse it for every angle and tilt
  const key = team.join() + pivot.join();
  let byTeam = meshes.get(vb);
  if (!byTeam) meshes.set(vb, (byTeam = new Map()));
  let geo = byTeam.get(key);
  if (!geo) byTeam.set(key, (geo = vb.geometry(team, pivot)));
  const n = opts.facings ?? 1;
  // canvas size: covers the model at any angle plus its shadow
  let R = 0;
  vb.each((x, y, z) => { R = Math.max(R, Math.hypot(x - pivot[0] + 0.5, z - pivot[2] + 0.5)); });
  const sc = opts.scale ?? 1; // small scales make build-panel icons
  R *= sc;
  const Hm0 = Math.ceil((vb.max[1] - pivot[1]) * sc + 2), Hm = Hm0 + (Hm0 % 2);
  const Rx = Math.ceil(R + 2 + (opts.tilt ? Hm : 0) + Hm * (opts.lit ? 1.3 : 0.65)); // (the low suns cast longer shadows)
  const w = Rx * 2, h = Rx * 2 + Hm, cy = Hm / 2;
  // clip.x = x * 2/w ; clip.y = (y - z - cy) * 2/h ; nearer (larger y + z) wins the depth test
  cam.projectionMatrix.set(2 / w, 0, 0, 0, 0, 2 / h, (-2 / h) * SQ, -2 * cy / h, 0, -1 / 2000, -1 / 2000, 0, 0, 0, 0, 1);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  // Things that turn (units, turrets, people, cars) are lit from high overhead, like noon, so they look
  // right whichever way they face at any hour; their shadows still come from a low sun, to be re-aimed.
  if (n > 1) sunLight.position.copy(SUNS[1]).multiplyScalar(100);
  const mesh = new THREE.Mesh(geo, mat), shadow = new THREE.Mesh(geo, black);
  mesh.matrixAutoUpdate = false; shadow.matrixAutoUpdate = false;
  // Every facing (and its shadow, unless another team's copy already made it: a shadow has no colour)
  // is drawn into its own cell of one big picture, and that is read back from the graphics card once.
  // Reading back after each drawing made the CPU wait on the GPU hundreds of times per load.
  const skey = [n, opts.yaw ?? 0, opts.tilt ? [opts.tilt.axis.x, opts.tilt.axis.y, opts.tilt.axis.z, opts.tilt.angle].join() : '', sc, pivot.join(), w, h].join('|'); // (same size of picture too: a lit bake is bigger)
  let shadows = shadowCache.get(vb)?.get(skey);
  // (lit: per facing, three suns' pictures and two suns' shadows, after the plain pictures and shadows)
  const lit0 = n * (shadows ? 1 : 2), cells = lit0 + (opts.lit ? n * 5 : 0), cols = Math.max(1, Math.min(cells, Math.floor(4096 / w))), rows = Math.ceil(cells / cols);
  const AW = cols * w, AH = rows * h;
  renderer.setSize(AW, AH, false);
  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, AW, AH); renderer.setViewport(0, 0, AW, AH); renderer.clear();
  const at = (k: number): [number, number] => [(k % cols) * w, Math.floor(k / cols) * h]; // a cell's top-left, in picture pixels
  const draw = (obj: THREE.Mesh, k: number) => { const [x, y] = at(k); renderer.setViewport(x, AH - y - h, w, h); renderer.setScissor(x, AH - y - h, w, h); scene.add(obj); renderer.render(scene, cam); scene.remove(obj); };
  renderer.autoClear = false;
  for (let i = 0; i < n; i++) {
    const rot = new THREE.Matrix4().makeRotationY(-((i / n) * Math.PI * 2 + (opts.yaw ?? 0)));
    if (opts.tilt) rot.premultiply(new THREE.Matrix4().makeRotationAxis(opts.tilt.axis, opts.tilt.angle));
    if (sc !== 1) rot.premultiply(new THREE.Matrix4().makeScale(sc, sc, sc));
    mesh.matrix.copy(rot); mesh.matrixWorld.copy(rot);
    draw(mesh, i);
    if (!shadows) { shadow.matrix.copy(SHADOW).multiply(rot); shadow.matrixWorld.copy(shadow.matrix); draw(shadow, n + i); }
    if (opts.lit) { // the same view under each of the day's suns, and the morning and evening suns' shadows
      for (const [k, sun] of SUNS.entries()) {
        sunLight.position.copy(sun).multiplyScalar(100);
        draw(mesh, lit0 + i * 5 + k);
        if (k === 1) continue;
        shadow.matrix.copy(flatten(sun)).multiply(rot); shadow.matrixWorld.copy(shadow.matrix);
        draw(shadow, lit0 + i * 5 + (k ? 4 : 3));
      }
      sunLight.position.copy(n > 1 ? SUNS[1] : SUN).multiplyScalar(100);
    }
  }
  renderer.autoClear = true; renderer.setScissorTest(false);
  sunLight.position.copy(SUN).multiplyScalar(100);
  const whole = readBack(AW, AH);
  const cut = (k: number, isShadow: boolean) => { const [x, y] = at(k); return finish(whole, AW, x, y, w, h, isShadow); };
  if (!shadows) { shadows = []; for (let i = 0; i < n; i++) shadows.push(cut(n + i, true)); let m = shadowCache.get(vb); if (!m) shadowCache.set(vb, (m = new Map())); m.set(skey, shadows); }
  const out: Sprite[] = [];
  for (let i = 0; i < n; i++) {
    const sp: Sprite = { img: cut(i, false), ax: w / 2, ay: h / 2 + cy, shadow: shadows[i] };
    if (opts.lit) { const b = lit0 + i * 5; sp.lit = { imgs: [cut(b, false), cut(b + 1, false), cut(b + 2, false)], shadows: [cut(b + 3, true), cut(b + 4, true)] }; }
    out.push(sp);
  }
  return out;
}
const shadowCache = new WeakMap<VB, Map<string, HTMLCanvasElement[]>>();

// The whole drawn picture's pixels, read back from the graphics card once
let readCanvas: HTMLCanvasElement | null = null;
function readBack(w: number, h: number) {
  if (!readCanvas) readCanvas = document.createElement('canvas');
  readCanvas.width = w; readCanvas.height = h;
  const ctx = readCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(renderer.domElement, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}
// One cell of it as a finished sprite (or shadow)
function finish(src: Uint8ClampedArray, AW: number, x0: number, y0: number, w: number, h: number, dither: boolean) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!, d = ctx.createImageData(w, h), p = d.data;
  for (let y = 0; y < h; y++) p.set(src.subarray(((y0 + y) * AW + x0) * 4, ((y0 + y) * AW + x0 + w) * 4), y * w * 4);
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 128) { p[i + 3] = 0; continue; }
    p[i + 3] = 255;
    // shadows: an even, cool, see-through dark (no dither pattern, so nothing shimmers as things move)
    if (dither) { p[i] = 12; p[i + 1] = 18; p[i + 2] = 28; p[i + 3] = 255; } // laid down at even strength by the game
  }
  if (!dither) edges(p, w, h);
  ctx.putImageData(d, 0, 0);
  return c;
}

// Pixel-art finishing: a gentle sunlit rim along the top edge and a slightly darker underside,
// using the sprite's own colours so the edges stay natural.
function edges(p: Uint8ClampedArray, w: number, h: number) {
  const src = new Uint8ClampedArray(p);
  const a = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (a(x, y)) {
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
