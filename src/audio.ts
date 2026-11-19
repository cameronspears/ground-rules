// All sound is made in code (no audio files), so there are no licences to track.
export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode; sfx: GainNode;
  noise: AudioBuffer;
  listener = { x: 0, z: 0, zoom: 60, yaw: 0 };
  private last: Record<string, number> = {};

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 3; }
  }

  // Volume and stereo position from where the sound happens relative to the camera.
  private place(x?: number, z?: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    g.connect(p); p.connect(this.sfx);
    if (x === undefined) return g;
    const L = this.listener;
    const dx = x - L.x, dz = z! - L.z;
    const d = Math.hypot(dx, dz);
    const sx = dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw);
    p.pan.value = Math.max(-0.8, Math.min(0.8, sx / 40));
    g.gain.value = Math.min(1, 1 / (1 + (d / 45) ** 2)) * Math.min(1, 70 / L.zoom + 0.35);
    return g;
  }

  private throttle(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < ms) return true;
    this.last[key] = now;
    return false;
  }

  private burst(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 0.7) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(out: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  explosion(x: number, z: number, size: number) {
    if (!this.ctx || this.throttle('exp', 40)) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    const k = Math.min(2, size / 2);
    this.burst(out, t, 0.9 + k * 0.6, 'lowpass', 2400, 90, 0.9 * k + 0.3);
    this.burst(out, t, 0.15, 'bandpass', 3000, 900, 0.5, 1);
    this.tone(out, t, 0.5 + k * 0.2, 'sine', 110, 28, 0.9);
    for (let i = 0; i < 4; i++) this.burst(out, t + 0.12 + Math.random() * 0.6, 0.06, 'bandpass', 1800 + Math.random() * 2500, 800, 0.08, 3);
  }

  collapse(x: number, z: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    this.burst(out, t, 3.2, 'lowpass', 500, 60, 1.1);
    this.tone(out, t, 1.6, 'sine', 70, 25, 0.7);
    for (let i = 0; i < 18; i++) this.burst(out, t + Math.random() * 2.5, 0.08 + Math.random() * 0.1, 'bandpass', 700 + Math.random() * 1500, 300, 0.18, 2);
  }

  cannon(x: number, z: number) {
    if (!this.ctx || this.throttle('can', 30)) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    this.burst(out, t, 0.45, 'lowpass', 3500, 200, 0.8);
    this.tone(out, t, 0.25, 'triangle', 160, 45, 0.7);
  }

  rifle(x: number, z: number) {
    if (!this.ctx || this.throttle('rif', 25)) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    for (let i = 0; i < 3; i++) {
      this.burst(out, t + i * 0.085, 0.07, 'bandpass', 2600, 1200, 0.35, 0.9);
      this.tone(out, t + i * 0.085, 0.04, 'square', 300, 120, 0.06);
    }
  }

  mortar(x: number, z: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    this.tone(out, t, 0.3, 'sine', 240, 60, 0.8);
    this.burst(out, t, 0.25, 'lowpass', 1200, 200, 0.5);
  }

  whistle(x: number, z: number, dur: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1900, t); o.frequency.linearRampToValueAtTime(700, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur);
  }

  ricochet(x: number, z: number) {
    if (!this.ctx || this.throttle('ric', 50)) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    this.burst(out, t, 0.05, 'highpass', 3000, 2000, 0.12);
  }

  crunch(x: number, z: number) {
    if (!this.ctx || this.throttle('cru', 90)) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    for (let i = 0; i < 3; i++) this.burst(out, t + i * 0.04, 0.12, 'bandpass', 500 + Math.random() * 600, 200, 0.4, 1.5);
  }

  clatter(x: number, z: number) {
    if (!this.ctx || this.throttle('cla', 35)) return;
    const t = this.ctx.currentTime, out = this.place(x, z);
    this.burst(out, t, 0.05 + Math.random() * 0.05, 'bandpass', 900 + Math.random() * 2400, 500, 0.12, 4);
  }

  // A crackly radio chirp that plays before a unit speaks.
  radio() {
    if (!this.ctx || this.throttle('rad', 120)) return;
    const t = this.ctx.currentTime, out = this.place();
    out.gain.value = 0.5;
    this.tone(out, t, 0.05, 'square', 1400, 1400, 0.08);
    this.tone(out, t + 0.06, 0.05, 'square', 1900, 1900, 0.06);
    this.burst(out, t, 0.25, 'bandpass', 2500, 2500, 0.06, 0.5);
  }

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.place();
    this.tone(out, t, 0.05, 'sine', 900, 600, 0.15);
  }

  alarm() {
    if (!this.ctx || this.throttle('alm', 4000)) return;
    const t = this.ctx.currentTime, out = this.place();
    for (let i = 0; i < 2; i++) { this.tone(out, t + i * 0.3, 0.22, 'sawtooth', 520, 520, 0.06); this.tone(out, t + i * 0.3 + 0.12, 0.12, 'sawtooth', 390, 390, 0.05); }
  }

  fanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.place();
    [392, 523, 659, 784, 1047].forEach((f, i) => {
      this.tone(out, t + i * 0.13, 0.5 + (i === 4 ? 0.8 : 0), 'triangle', f, f, 0.18);
      this.tone(out, t + i * 0.13, 0.4, 'square', f / 2, f / 2, 0.03);
    });
  }
}

export const audio = new Audio();
