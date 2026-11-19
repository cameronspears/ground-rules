// Flying blocks. Thousands are drawn in one call. When a piece lands, some become rubble
// blocks in the world (scrap for later), the rest fade away.
import * as THREE from 'three';
import { World, RUBBLE } from './world';
import { linColor, shade } from './voxel';

const MAX = 12000;

export class Debris {
  mesh: THREE.InstancedMesh;
  n = 0;
  px = new Float32Array(MAX); py = new Float32Array(MAX); pz = new Float32Array(MAX);
  vx = new Float32Array(MAX); vy = new Float32Array(MAX); vz = new Float32Array(MAX);
  rx = new Float32Array(MAX); ry = new Float32Array(MAX); rz = new Float32Array(MAX);
  wx = new Float32Array(MAX); wz = new Float32Array(MAX);
  sc = new Float32Array(MAX); life = new Float32Array(MAX); rest = new Float32Array(MAX);
  col = new Uint32Array(MAX); stamp = new Uint8Array(MAX);
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();
  private v = new THREE.Vector3(); private s = new THREE.Vector3(); private c = new THREE.Color();
  onLand: (x: number, y: number, z: number, big: boolean) => void = () => {};

  constructor(scene: THREE.Scene, private world: World) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, scale = 1, stamp = false) {
    let i = this.n;
    if (i >= MAX) i = (Math.random() * MAX) | 0; // recycle a random old piece
    else this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.rx[i] = Math.random() * 6; this.ry[i] = Math.random() * 6; this.rz[i] = Math.random() * 6;
    this.wx[i] = (Math.random() - 0.5) * 14; this.wz[i] = (Math.random() - 0.5) * 14;
    this.sc[i] = scale * (0.85 + Math.random() * 0.15);
    this.life[i] = 0; this.rest[i] = 0;
    this.col[i] = color; this.stamp[i] = stamp ? 1 : 0;
    linColor(color, this.c);
    this.mesh.instanceColor!.setXYZ(i, this.c.r, this.c.g, this.c.b);
  }

  private kill(i: number) {
    const j = --this.n;
    if (i !== j) {
      this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
      this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
      this.rx[i] = this.rx[j]; this.ry[i] = this.ry[j]; this.rz[i] = this.rz[j];
      this.wx[i] = this.wx[j]; this.wz[i] = this.wz[j];
      this.sc[i] = this.sc[j]; this.life[i] = this.life[j]; this.rest[i] = this.rest[j];
      this.col[i] = this.col[j]; this.stamp[i] = this.stamp[j];
      const ic = this.mesh.instanceColor!;
      ic.setXYZ(i, ic.getX(j), ic.getY(j), ic.getZ(j));
    }
  }

  update(dt: number) {
    const w = this.world;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.rest[i] > 0) {
        this.rest[i] += dt;
        if (this.rest[i] > 6) { this.kill(i); i--; }
        continue;
      }
      this.vy[i] -= 40 * dt;
      const nx = this.px[i] + this.vx[i] * dt, nz = this.pz[i] + this.vz[i] * dt;
      let ny = this.py[i] + this.vy[i] * dt;
      // hit a wall sideways: bounce back
      if (w.get(Math.floor(nx), Math.floor(this.py[i]), Math.floor(nz)) && Math.floor(this.py[i]) >= w.heightAt(this.px[i], this.pz[i])) {
        this.vx[i] *= -0.3; this.vz[i] *= -0.3;
      } else { this.px[i] = nx; this.pz[i] = nz; }
      const half = this.sc[i] * 0.5;
      const g = w.heightAt(this.px[i], this.pz[i]);
      if (ny - half <= g && this.vy[i] < 0) {
        ny = g + half;
        const big = this.sc[i] > 0.7;
        if (this.vy[i] < -8 && big) this.onLand(this.px[i], g, this.pz[i], true);
        if (this.vy[i] > -6 || this.life[i] > 4) {
          if (this.stamp[i] && g < w.H - 1 && this.px[i] >= 0 && this.pz[i] >= 0 && this.px[i] < w.W && this.pz[i] < w.D) {
            w.set(Math.floor(this.px[i]), g, Math.floor(this.pz[i]), shade(this.col[i], 0.82), RUBBLE);
            this.kill(i); i--; continue;
          }
          this.rest[i] = 0.001;
          this.vx[i] = this.vy[i] = this.vz[i] = 0;
          this.rx[i] = Math.round(this.rx[i] / (Math.PI / 2)) * (Math.PI / 2);
          this.rz[i] = Math.round(this.rz[i] / (Math.PI / 2)) * (Math.PI / 2);
        } else {
          this.vy[i] *= -0.22; this.vx[i] *= 0.4; this.vz[i] *= 0.4;
          this.wx[i] *= 0.5; this.wz[i] *= 0.5;
        }
      }
      if (ny < -20) { this.kill(i); i--; continue; }
      this.py[i] = ny;
      this.rx[i] += this.wx[i] * dt; this.rz[i] += this.wz[i] * dt;
    }
    for (let i = 0; i < this.n; i++) {
      let s = this.sc[i];
      if (this.rest[i] > 4) s *= Math.max(0, 1 - (this.rest[i] - 4) / 2);
      this.e.set(this.rx[i], this.ry[i], this.rz[i]);
      this.q.setFromEuler(this.e);
      this.v.set(this.px[i], this.py[i] - (this.rest[i] > 4 ? (this.rest[i] - 4) * 0.3 : 0), this.pz[i]);
      this.s.set(s, s, s);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
