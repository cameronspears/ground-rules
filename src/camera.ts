// A classic top-down "three-quarter" view, locked to the pixel grid.
// One block = one pixel: ground runs 1 pixel per block north-south, and every block of height
// is 1 more pixel up the screen. The camera never rotates and zooms in whole pixel steps,
// so every block stays a crisp, deliberate pixel. The scene is drawn small, then blown up.
import * as THREE from 'three';

const clamp = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));

export class PixelCamera {
  cam = new THREE.Camera(); // matrices are set by hand below
  target = new THREE.Vector3(); // world x/z the view is centred on
  goal = new THREE.Vector3();
  zoomStep = 0; // -2..2 around the base size
  keys = new Set<string>();
  edge = { x: 0, y: 0 };
  shake = 0;
  // low-res frame size and placement (in pixels of the low-res frame)
  k = 3; W = 1; H = 1; devW = 1; devH = 1; snapX = 0; snapY = 0; fx = 0; fy = 0;
  groundY = 12;
  private P = new THREE.Matrix4();
  private Pi = new THREE.Matrix4();

  constructor(public bounds: { w: number; d: number }) {
    this.cam.matrixAutoUpdate = false;
    this.cam.matrixWorldAutoUpdate = false;
    addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.edge.x = this.edge.y = 0; });
  }

  get zoom() { return this.W; } // used for audio distance and shadow size

  // Choose the pixel size: about 420 low-res pixels across at the default zoom.
  resize(devW: number, devH: number) {
    this.devW = devW; this.devH = devH;
    const base = Math.max(2, Math.round(devW / 420));
    this.k = Math.max(2, base + this.zoomStep);
    this.W = Math.ceil(devW / this.k) + 2;
    this.H = Math.ceil(devH / this.k) + 2;
  }

  wheel(dy: number) {
    const s = Math.max(-2, Math.min(2, this.zoomStep + (dy > 0 ? -1 : 1)));
    if (s !== this.zoomStep) { this.zoomStep = s; this.resize(this.devW, this.devH); }
  }
  jump(x: number, z: number) { this.goal.set(x, 0, z); }
  snap(x: number, z: number) { this.goal.set(x, 0, z); this.target.copy(this.goal); }
  drag(dxCss: number, dyCss: number) {
    const s = devicePixelRatio / this.k;
    this.goal.x -= dxCss * s; this.goal.z -= dyCss * s;
  }

  update(dt: number) {
    let mx = 0, mz = 0;
    const K = this.keys;
    if (K.has('ArrowUp')) mz -= 1;
    if (K.has('ArrowDown')) mz += 1;
    if (K.has('ArrowLeft')) mx -= 1;
    if (K.has('ArrowRight')) mx += 1;
    mx += this.edge.x; mz += this.edge.y;
    const sp = 260 * dt;
    // keep the view on the map: never show past its edges
    const hw = this.devW / this.k / 2, hh = this.devH / this.k / 2;
    this.goal.x = clamp(this.goal.x + mx * sp, hw, this.bounds.w - hw);
    this.goal.z = clamp(this.goal.z + mz * sp, hh - 6, this.bounds.d - hh);
    this.target.lerp(this.goal, 1 - Math.exp(-dt * 12));
    let tx = this.target.x, tz = this.target.z;
    if (this.shake > 0) {
      const a = this.shake * this.shake * 3;
      tx += (Math.random() - 0.5) * a; tz += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    // screen position of the centre, split into whole low-res pixels plus a fraction
    const sx = tx, sy = this.groundY - tz;
    this.snapX = Math.round(sx); this.snapY = Math.round(sy);
    this.fx = sx - this.snapX; this.fy = sy - this.snapY;
    const W = this.W, H = this.H, R = 3000, X = this.snapX, Y = this.snapY;
    const D0 = this.groundY + tz;
    // clip.x = (x - X) * 2/W ; clip.y = (y - z - Y) * 2/H ; depth falls as y + z grows (nearer)
    this.P.set(
      2 / W, 0, 0, -2 * X / W,
      0, 2 / H, -2 / H, -2 * Y / H,
      0, -2 / R, -2 / R, 2 * D0 / R,
      0, 0, 0, 1,
    );
    this.Pi.copy(this.P).invert();
    this.cam.projectionMatrix.copy(this.P);
    this.cam.projectionMatrixInverse.copy(this.Pi);
  }

  // Low-res pixel coordinate (x right, y up) for a device pixel (x right, y up).
  private toFrame(dx: number, dy: number) {
    return [dx / this.k + (this.W - this.devW / this.k) / 2 + this.fx, dy / this.k + (this.H - this.devH / this.k) / 2 + this.fy];
  }

  // A world-space ray through a point on screen (CSS pixels, y down).
  ray(cssX: number, cssY: number) {
    const dpr = devicePixelRatio;
    const [px, py] = this.toFrame(cssX * dpr, this.devH - cssY * dpr);
    const nx = (px / this.W) * 2 - 1, ny = (py / this.H) * 2 - 1;
    const a = new THREE.Vector3(nx, ny, -1).applyMatrix4(this.Pi);
    const b = new THREE.Vector3(nx, ny, 1).applyMatrix4(this.Pi);
    return { origin: a, dir: b.sub(a).normalize() };
  }

  // Where a world point lands on screen, in CSS pixels.
  toScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.P);
    const px = ((v.x + 1) / 2) * this.W, py = ((v.y + 1) / 2) * this.H;
    const dx = (px - (this.W - this.devW / this.k) / 2 - this.fx) * this.k;
    const dy = (py - (this.H - this.devH / this.k) / 2 - this.fy) * this.k;
    const dpr = devicePixelRatio;
    return { x: dx / dpr, y: (this.devH - dy) / dpr, front: Math.abs(v.z) < 1 };
  }
}
