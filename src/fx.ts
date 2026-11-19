// Fire, smoke, sparks, dust, light flashes and tracer streaks.
import * as THREE from 'three';
import { linColor } from './voxel';

const VERT = `
attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;
void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const FRAG = `
varying vec4 vC; uniform float soft;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
  float a = soft > 0.5 ? (1.0 - d*d) : (1.0 - smoothstep(0.0, 1.0, d)) * 1.25;
  gl_FragColor = vec4(vC.rgb, vC.a * a); }`;

class Pool {
  n = 0;
  pos: Float32Array; vel: Float32Array; rgba: Float32Array; size: Float32Array;
  c0: Float32Array; c1: Float32Array; s0: Float32Array; s1: Float32Array;
  age: Float32Array; life: Float32Array; drag: Float32Array; grav: Float32Array;
  geo = new THREE.BufferGeometry();
  points: THREE.Points;
  constructor(public max: number, additive: boolean, scene: THREE.Scene, uniforms: any) {
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.rgba = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('rgba', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: uniforms.scale, soft: { value: additive ? 1 : 0 } },
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, c0: number[], c1: number[], s0: number, s1: number, life: number, drag = 1, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.c0.set(c0, i * 4); this.c1.set(c1, i * 4);
    this.s0[i] = s0; this.s1[i] = s1; this.age[i] = 0; this.life[i] = life; this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        const j = --this.n;
        if (i !== j) {
          this.pos.copyWithin(i * 3, j * 3, j * 3 + 3); this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
          this.c0.copyWithin(i * 4, j * 4, j * 4 + 4); this.c1.copyWithin(i * 4, j * 4, j * 4 + 4);
          this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.age[i] = this.age[j]; this.life[i] = this.life[j];
          this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
        }
        i--; continue;
      }
      const t = this.age[i] / this.life[i];
      const d = Math.pow(this.drag[i], dt);
      const k = i * 3;
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d + this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const c = i * 4;
      for (let q = 0; q < 4; q++) this.rgba[c + q] = this.c0[c + q] + (this.c1[c + q] - this.c0[c + q]) * t;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
    }
    this.geo.setDrawRange(0, this.n);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.rgba as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }
}

const tmp = new THREE.Color();
export function rgba(hex: number, a: number) { linColor(hex, tmp); return [tmp.r, tmp.g, tmp.b, a]; }
const R = () => Math.random() - 0.5;

export class Fx {
  uniforms = { scale: { value: 500 } };
  glow: Pool; smoke: Pool;
  lights: { l: THREE.PointLight; t: number; max: number }[] = [];
  shake = 0;
  tracerGeo = new THREE.BufferGeometry();
  tracerPos = new Float32Array(600 * 6); tracerCol = new Float32Array(600 * 6);
  tracers: { a: THREE.Vector3; b: THREE.Vector3; t: number; life: number; c: number[] }[] = [];
  markers: { m: THREE.Mesh; t: number; life: number }[] = [];
  ringGeo = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);

  constructor(private scene: THREE.Scene) {
    this.smoke = new Pool(5000, false, scene, this.uniforms);
    this.glow = new Pool(5000, true, scene, this.uniforms);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 30, 1.6);
      scene.add(l);
      this.lights.push({ l, t: 1, max: 0 });
    }
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lines.frustumCulled = false;
    scene.add(lines);
  }

  resize(h: number, fov: number) { this.uniforms.scale.value = h / (2 * Math.tan((fov * Math.PI) / 360)); }

  flash(x: number, y: number, z: number, power: number) {
    let best = this.lights[0];
    for (const L of this.lights) if (L.t > best.t) best = L;
    best.l.position.set(x, y + 1.5, z);
    best.t = 0; best.max = power;
    best.l.distance = 10 + power * 6;
  }

  explosion(x: number, y: number, z: number, r: number, dust = 0xb89a6a) {
    const g = this.glow, s = this.smoke;
    g.add(x, y, z, 0, 0, 0, rgba(0xfff4d0, 1), rgba(0xffaa40, 0), r * 5, r * 9, 0.18);
    const nf = Math.min(40, 8 + r * 10);
    for (let i = 0; i < nf; i++) {
      const sp = r * (3 + Math.random() * 5);
      g.add(x + R() * r, y + R() * r, z + R() * r, R() * sp, Math.random() * sp * 0.8, R() * sp,
        rgba(0xffe08a, 1), rgba(0xd2381a, 0), r * (1.2 + Math.random()), r * (2.4 + Math.random() * 1.5), 0.35 + Math.random() * 0.45, 0.05, 3);
    }
    for (let i = 0; i < 14 + r * 8; i++) {
      const sp = 12 + Math.random() * 22;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 + 0.2;
      g.add(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp,
        rgba(0xffffb0, 1), rgba(0xff7a20, 0), 0.35, 0.15, 0.4 + Math.random() * 0.6, 0.6, -30);
    }
    const ns = Math.min(30, 5 + r * 7);
    for (let i = 0; i < ns; i++) {
      const dark = Math.random() < 0.6;
      s.add(x + R() * r * 1.5, y + Math.random() * r, z + R() * r * 1.5, R() * 3, 2 + Math.random() * 4, R() * 3,
        rgba(dark ? 0x4a4442 : 0x857c72, 0.55), rgba(dark ? 0x6a6460 : 0xa8a096, 0), r * 1.3, r * (2.8 + Math.random() * 1.5), 2 + Math.random() * 2.5, 0.5, 0.8);
    }
    for (let i = 0; i < 6 + r * 4; i++) {
      s.add(x + R() * r * 2, y, z + R() * r * 2, R() * 10, 3 + Math.random() * 6, R() * 10,
        rgba(dust, 0.8), rgba(dust, 0), r * 0.9, r * 2.5, 1 + Math.random(), 0.2, -4);
    }
    this.flash(x, y, z, 6 + r * 6);
  }

  dust(x: number, y: number, z: number, n: number, size: number, color = 0xb5a184) {
    for (let i = 0; i < n; i++)
      this.smoke.add(x + R() * size, y + Math.random() * size * 0.5, z + R() * size, R() * 4, 1 + Math.random() * 2.5, R() * 4,
        rgba(color, 0.7), rgba(color, 0), size * 0.8, size * 2.2, 1.5 + Math.random() * 2, 0.4, 0.3);
  }

  sparks(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const sp = 6 + Math.random() * 10;
      this.glow.add(x, y, z, R() * sp, Math.random() * sp, R() * sp, rgba(0xffffc0, 1), rgba(0xff8030, 0), 0.25, 0.1, 0.2 + Math.random() * 0.3, 0.5, -25);
    }
  }

  muzzle(x: number, y: number, z: number, dx: number, dz: number, big: boolean) {
    const k = big ? 1 : 0.35;
    this.glow.add(x, y, z, dx * 4, 0, dz * 4, rgba(0xfff0b0, 1), rgba(0xff9030, 0), 2.6 * k, 4 * k, 0.08);
    if (big) {
      this.flash(x, y, z, 3);
      for (let i = 0; i < 5; i++)
        this.smoke.add(x, y, z, dx * 6 + R() * 2, 1 + Math.random(), dz * 6 + R() * 2, rgba(0x9a948c, 0.6), rgba(0xb0aaa0, 0), 0.8, 2.5, 1 + Math.random());
    }
  }

  trail(x: number, y: number, z: number, big: boolean) {
    this.smoke.add(x, y, z, R() * 0.4, 0.3, R() * 0.4, rgba(0xc8c2b8, big ? 0.45 : 0.25), rgba(0xd8d2c8, 0), big ? 0.6 : 0.3, big ? 1.8 : 0.9, big ? 1.2 : 0.5);
  }

  tracer(a: THREE.Vector3, b: THREE.Vector3, color: number, life = 0.08) {
    if (this.tracers.length >= 600) this.tracers.shift();
    this.tracers.push({ a: a.clone(), b: b.clone(), t: 0, life, c: rgba(color, 1) });
  }

  marker(x: number, y: number, z: number, color: number) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, depthTest: false }));
    m.position.set(x, y + 0.08, z);
    m.renderOrder = 5;
    this.scene.add(m);
    this.markers.push({ m, t: 0, life: 0.55 });
  }

  update(dt: number) {
    this.glow.update(dt); this.smoke.update(dt);
    for (const L of this.lights) {
      L.t += dt;
      L.l.intensity = L.t < 0.35 ? L.max * 20 * (1 - L.t / 0.35) ** 2 : 0;
    }
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const T = this.tracers[i];
      T.t += dt;
      if (T.t > T.life) { this.tracers.splice(i, 1); continue; }
      const f = 1 - T.t / T.life;
      this.tracerPos.set([T.a.x, T.a.y, T.a.z, T.b.x, T.b.y, T.b.z], n * 6);
      this.tracerCol.set([T.c[0] * f * 0.3, T.c[1] * f * 0.3, T.c[2] * f * 0.3, T.c[0] * f * 2, T.c[1] * f * 2, T.c[2] * f * 2], n * 6);
      n++;
    }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const M = this.markers[i];
      M.t += dt;
      const f = M.t / M.life;
      if (f >= 1) { this.scene.remove(M.m); (M.m.material as THREE.Material).dispose(); this.markers.splice(i, 1); continue; }
      M.m.scale.setScalar(2.2 * (1 - f) + 0.4);
      (M.m.material as THREE.MeshBasicMaterial).opacity = 1 - f * f;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
