// Smooth strategy camera: pan with arrow keys, screen edges or middle-drag; zoom with the wheel; Q/E to rotate.
import * as THREE from 'three';

export class RTSCamera {
  cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  goal = new THREE.Vector3();
  zoom = 300; zoomGoal = 300;
  yaw = (3 * Math.PI) / 4; yawGoal = (3 * Math.PI) / 4;
  keys = new Set<string>();
  edge = { x: 0, y: 0 };
  shake = 0;

  constructor(public bounds: { w: number; d: number }) {
    this.cam = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 20, 2000);
    addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.edge.x = this.edge.y = 0; });
  }

  jump(x: number, z: number) { this.goal.set(x, 0, z); }
  snap(x: number, z: number) { this.goal.set(x, 0, z); this.target.copy(this.goal); }
  wheel(dy: number) { this.zoomGoal = Math.max(140, Math.min(560, this.zoomGoal * Math.pow(1.0015, dy))); }
  drag(dx: number, dy: number) {
    const k = (this.zoom / innerHeight) * 0.4;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.goal.x += (s * dy - c * dx) * k;
    this.goal.z += (-c * dy - s * dx) * k;
  }

  update(dt: number, groundY: number) {
    let mx = 0, mz = 0;
    const K = this.keys;
    if (K.has('ArrowUp')) mz -= 1;
    if (K.has('ArrowDown')) mz += 1;
    if (K.has('ArrowLeft')) mx -= 1;
    if (K.has('ArrowRight')) mx += 1;
    mx += this.edge.x; mz += this.edge.y;
    if (K.has('KeyQ')) this.yawGoal -= dt * 1.8;
    if (K.has('KeyE')) this.yawGoal += dt * 1.8;
    const sp = this.zoom * 0.6 * dt;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.goal.x += (mx * c - mz * s) * sp;
    this.goal.z += (mx * s + mz * c) * sp;
    this.goal.x = Math.max(0, Math.min(this.bounds.w, this.goal.x));
    this.goal.z = Math.max(0, Math.min(this.bounds.d, this.goal.z));
    const f = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goal, f);
    this.target.y += (groundY - this.target.y) * (1 - Math.exp(-dt * 4));
    this.zoom += (this.zoomGoal - this.zoom) * (1 - Math.exp(-dt * 8));
    this.yaw += (this.yawGoal - this.yaw) * (1 - Math.exp(-dt * 8));
    const pitch = 0.98 + ((this.zoom - 140) / 420) * 0.12; // steep, nearly top-down
    const h = Math.cos(pitch) * this.zoom;
    const off = new THREE.Vector3(-Math.sin(this.yaw) * h, Math.sin(pitch) * this.zoom, Math.cos(this.yaw) * h);
    this.cam.position.copy(this.target).add(off);
    if (this.shake > 0) {
      const a = this.shake * this.shake * 0.9 * (this.zoom / 120);
      this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; this.cam.position.z += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.cam.lookAt(this.target);
  }
}
