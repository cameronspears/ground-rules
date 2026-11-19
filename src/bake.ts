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

export interface BakeOpts { facings?: number; team?: number[]; tilt?: { axis: THREE.Vector3; angle: number } }

export function bake(def: ModelDef, part: 'body' | 'turret', opts: BakeOpts = {}): Sprite[] {
  setup();
  const vb: VB = part === 'body' ? def.body : def.turret!;
  const pivot = part === 'body' ? def.bodyPivot : def.turretPivot!;
  const geo = vb.geometry(opts.team ?? [0x3a8ad6, 0x245a8c, 0x5aa8f0], pivot);
  const n = opts.facings ?? 1;
  // canvas size: covers the model at any angle plus its shadow
  let R = 0;
  vb.each((x, y, z) => { R = Math.max(R, Math.hypot(x - pivot[0] + 0.5, z - pivot[2] + 0.5)); });
  const Hm = Math.ceil(vb.max[1] - pivot[1] + 2) + (Math.ceil(vb.max[1] - pivot[1] + 2) % 2);
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
    const rot = new THREE.Matrix4().makeRotationY(-(i / n) * Math.PI * 2);
    if (opts.tilt) rot.premultiply(new THREE.Matrix4().makeRotationAxis(opts.tilt.axis, opts.tilt.angle));
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
  geo.dispose();
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
    if (dither) { const x = (i / 4) % w, y = Math.floor(i / 4 / w); p[i] = p[i + 1] = p[i + 2] = 0; p[i + 3] = (x + y) % 2 ? 0 : 120; }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// Picks the sprite for a heading (radians, 0 = east, growing clockwise on screen).
export function facing(sprites: Sprite[], angle: number) {
  const n = sprites.length;
  const i = Math.round((angle / (Math.PI * 2)) * n);
  return sprites[((i % n) + n) % n];
}
