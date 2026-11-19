// Turns block models into flat pixel sprites when the game loads, the way classic strategy
// games pre-rendered their art. Each model is drawn from N angles with the hand-picked shade
// ramps (shade.ts) and a fixed sun from the upper left, one block = one pixel, in the same
// three-quarter view as the map. A dithered shadow is baked alongside each one.
import * as THREE from 'three';
import { ModelDef, VB } from './models';
import { rampify } from './shade';

export interface Sprite { img: HTMLCanvasElement; ax: number; ay: number; shadow: HTMLCanvasElement }

const SUN = new THREE.Vector3(-1, 1.7, -0.9).normalize(); // toward the sun: upper left of the screen
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera;
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
  const sun = new THREE.DirectionalLight(0xffe6c4, 3.0);
  sun.position.copy(SUN).multiplyScalar(100);
  scene.add(sun);
  cam = new THREE.Camera();
  cam.matrixAutoUpdate = false; cam.matrixWorldAutoUpdate = false;
}

// Flattens a model onto the ground along the sun's direction.
const SHADOW = new THREE.Matrix4().set(
  1, -SUN.x / SUN.y, 0, 0,
  0, 0, 0, 0.01,
  0, -SUN.z / SUN.y, 1, 0,
  0, 0, 0, 1,
);

export interface BakeOpts { facings?: number; team?: number[]; tilt?: { axis: THREE.Vector3; angle: number }; yaw?: number; scale?: number }

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
  const Rx = Math.ceil(R + 2 + (opts.tilt ? Hm : 0) + Hm * 0.65);
  const w = Rx * 2, h = Rx * 2 + Hm, cy = Hm / 2;
  renderer.setSize(w, h, false);
  // clip.x = x * 2/w ; clip.y = (y - z - cy) * 2/h ; nearer (larger y + z) wins the depth test
  cam.projectionMatrix.set(2 / w, 0, 0, 0, 0, 2 / h, -2 / h, -2 * cy / h, 0, -1 / 2000, -1 / 2000, 0, 0, 0, 0, 1);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  const mesh = new THREE.Mesh(geo, mat), shadow = new THREE.Mesh(geo, black);
  mesh.matrixAutoUpdate = false; shadow.matrixAutoUpdate = false;
  const out: Sprite[] = [];
  for (let i = 0; i < n; i++) {
    const rot = new THREE.Matrix4().makeRotationY(-((i / n) * Math.PI * 2 + (opts.yaw ?? 0)));
    if (opts.tilt) rot.premultiply(new THREE.Matrix4().makeRotationAxis(opts.tilt.axis, opts.tilt.angle));
    if (sc !== 1) rot.premultiply(new THREE.Matrix4().makeScale(sc, sc, sc));
    mesh.matrix.copy(rot);
    shadow.matrix.copy(SHADOW).multiply(rot);
    scene.add(mesh);
    renderer.render(scene, cam);
    const img = grab(w, h);
    scene.remove(mesh); scene.add(shadow);
    renderer.render(scene, cam);
    const sh = grab(w, h, true);
    scene.remove(shadow);
    out.push({ img, ax: w / 2, ay: h / 2 + cy, shadow: sh });
  }
  return out;
}

function grab(w: number, h: number, dither = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(renderer.domElement, 0, 0);
  const d = ctx.getImageData(0, 0, w, h), p = d.data;
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
