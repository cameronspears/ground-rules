// All sound is made in code (no audio files), so there are no licences to track.
//
// The mix: every sound is placed against the camera's frame. On screen it plays full and is panned
// by where it is; off screen it fades fast, is muffled and arrives a little late (sound is slower
// than light), so a fight you aren't watching is a distant rumble, not a wall of noise. A budget
// caps how many sounds play at once and turns each one down as more pile in, so a big battle
// stays a roar you can hear into instead of mush.
import { toScreen } from './terrain';
import { WEAPONS, type Weapon } from './combat';

const NAME = new Map<Weapon, string>(Object.entries(WEAPONS).map(([k, w]) => [w, k]));
const BUSY = 48, MAX_LIVE = 80; // sounds playing at once: past BUSY only clear, close ones get in; MAX_LIVE is a hard guard on the work

// Vowel formants (Hz) for the radio voices' made-up speech.
const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [440, 1020], [660, 1700]];

type Out = { out: AudioNode; t: number; g: number };

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; private sfx!: GainNode; private far!: BiquadFilterNode; private verb!: GainNode; private amb!: GainNode;
  private noise!: AudioBuffer;
  private view = { x: 0, y: 0, w: 640, h: 360 };
  private last: Record<string, number> = {};
  private live: number[] = []; // when each sound playing now ends
  private recent: number[] = []; // when each sound of the last third of a second began
  private heat = 0; // how much fighting has been heard lately: 0 calm, ~1 a big battle
  private wind: { f: BiquadFilterNode; g: GainNode } | null = null;
  private next = { gust: 0, bird: 0, cricket: 0 };
  private talk: GainNode | null = null; // the radio voice speaking now (a new line cuts it off)

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.knee.value = 8; comp.attack.value = 0.004; comp.release.value = 0.3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.far = ctx.createBiquadFilter(); this.far.type = 'lowpass'; this.far.frequency.value = 700; this.far.connect(this.sfx);
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 3; }
    // One shared echo (a made-up impulse: a second and a half of fading noise) gives booms a tail.
    const rev = ctx.createConvolver(), len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    rev.buffer = ir; this.verb = ctx.createGain(); this.verb.gain.value = 0.35; this.verb.connect(rev); rev.connect(this.master);
    // Wind: a slow, gusting filtered rush under everything.
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350; f.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.amb); src.start();
    this.wind = { f, g };
  }

  // The camera's frame in screen-map pixels (Game.vx, vy, FW, FH). Called every frame.
  setView(x: number, y: number, w: number, h: number) { const V = this.view; V.x = x; V.y = y; V.w = w; V.h = h; }

  // A gain and panner for one sound at a ground point (or none: UI sounds), or null when it would
  // be too faint to hear or the mix is full. t is when it should start; g how loud it came out.
  private place(x: number | undefined, z: number | undefined, dur: number, vol = 1, wet = 0): Out | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const now = ctx.currentTime;
    this.live = this.live.filter((e) => e > now); this.recent = this.recent.filter((s) => s > now - 0.3);
    let g = vol, pan = 0, delay = 0, muffled = false;
    if (x !== undefined) {
      const [sx, sy] = toScreen(x, z!), V = this.view, hw = V.w / 2, hh = V.h / 2;
      const dx = sx - (V.x + hw), dy = sy - (V.y + hh);
      const off = Math.hypot(Math.max(0, Math.abs(dx) - hw), Math.max(0, Math.abs(dy) - hh)) / hw; // how far outside the frame, in half-frames
      pan = Math.max(-0.75, Math.min(0.75, (dx / hw) * 0.6));
      g *= 1 / (1 + (off * 3.5) ** 2) * Math.min(1, Math.sqrt(700 / V.w)); // zoomed right out, each sound is a smaller part of a bigger picture
      muffled = off > 0.12; delay = Math.min(0.5, off * 0.2);
    }
    g /= Math.sqrt(1 + this.recent.length / 4); // the more that's going off at once, the quieter each new sound
    if (g < 0.02 || (this.live.length >= BUSY && g < 0.25) || this.live.length >= MAX_LIVE) return null;
    this.live.push(now + delay + dur); this.recent.push(now);
    const gain = ctx.createGain(), p = ctx.createStereoPanner();
    gain.gain.value = g; p.pan.value = pan;
    gain.connect(p); p.connect(muffled ? this.far : this.sfx);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.verb); }
    return { out: gain, t: now + delay, g };
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
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(out: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  // A weapon firing from (x, z) at (tx, tz); flight: seconds until a shell lands. Each family has its
  // own voice: the dry crack of rifles, the rattle of machine guns, the pom-pom of flak, the slam of
  // tank guns, the hiss of rockets, the deep thud of a howitzer (and its shell whistling in).
  shot(w: Weapon, x: number, z: number, tx: number, tz: number, flight = 0) {
    if (!this.ctx) return;
    const k = NAME.get(w) ?? 'cannon';
    const fam = k === 'rifle' || k === 'garrison' ? 'rifle' : k === 'mg' || k === 'towerMg' || k === 'sidearm' ? 'mg' : k.includes('lak') ? 'flak'
      : k === 'rocket' || k === 'gunrockets' ? 'rocket' : k === 'heavy' || k === 'colossus' ? 'heavy' : k === 'howitzer' || k === 'grenade' || k === 'bombs' ? k : 'cannon';
    if (this.throttle(fam, { rifle: 22, mg: 45, flak: 70, rocket: 45, heavy: 50, howitzer: 80, grenade: 50, bombs: 250, cannon: 35 }[fam]!)) return;
    this.heat += fam === 'rifle' || fam === 'mg' ? 0.02 : 0.05;
    let o: Out | null;
    switch (fam) {
      case 'rifle':
        if (!(o = this.place(x, z, 0.15, 1, 0.08))) return;
        this.burst(o.out, o.t, 0.08, 'bandpass', 2200, 800, 0.8, 0.8);
        this.burst(o.out, o.t, 0.03, 'highpass', 5000, 3000, 0.35);
        this.burst(o.out, o.t, 0.1, 'lowpass', 1000, 250, 0.25); // the body of the shot (the low end is left to the big guns)
        this.tone(o.out, o.t, 0.04, 'triangle', 240, 110, 0.15);
        return;
      case 'mg': {
        const n = k === 'towerMg' ? 5 : k === 'sidearm' ? 2 : 4, gap = k === 'towerMg' ? 0.075 : 0.06;
        if (!(o = this.place(x, z, n * gap + 0.08, 0.9))) return;
        for (let i = 0; i < n; i++) {
          const ti = o.t + i * gap * (0.9 + Math.random() * 0.2);
          this.burst(o.out, ti, 0.05, 'bandpass', 1700 + Math.random() * 300, 600, 0.55, 1);
          this.tone(o.out, ti, 0.03, 'triangle', 200, 100, 0.12);
        }
        return;
      }
      case 'flak':
        if (!(o = this.place(x, z, 0.3, 0.7))) return;
        for (let i = 0; i < 2; i++) { this.burst(o.out, o.t + i * 0.09, 0.12, 'lowpass', 1500, 200, 0.5); this.tone(o.out, o.t + i * 0.09, 0.1, 'sine', 120, 55, 0.45); }
        if ((o = this.place(tx, tz, 0.15, 0.35))) this.burst(o.out, o.t + 0.15, 0.08, 'bandpass', 900, 400, 0.4, 1.2); // the burst up in the air
        return;
      case 'rocket':
        if (!(o = this.place(x, z, 0.45, 0.8, 0.1))) return;
        this.burst(o.out, o.t, 0.04, 'lowpass', 1200, 400, 0.4);
        this.burst(o.out, o.t, 0.4, 'bandpass', 700, 3200, 0.35, 2.5); // the hiss climbing away
        return;
      case 'grenade':
        if (!(o = this.place(x, z, 0.12, 0.7))) return;
        this.tone(o.out, o.t, 0.08, 'sine', 190, 90, 0.5);
        this.burst(o.out, o.t, 0.07, 'lowpass', 700, 200, 0.3);
        return;
      case 'bombs':
        this.whistle(tx, tz, 0, Math.max(0.5, flight));
        return;
      case 'howitzer':
        if ((o = this.place(x, z, 0.9, 1, 0.5))) {
          this.burst(o.out, o.t, 0.03, 'bandpass', 2500, 1500, 0.5, 1);
          this.burst(o.out, o.t, 0.8, 'lowpass', 1000, 60, 0.9);
          this.tone(o.out, o.t, 0.6, 'sine', 70, 30, 1);
        }
        if (flight > 1.6) this.whistle(tx, tz, flight - 1.5, 1.4);
        return;
      case 'heavy':
        if (!(o = this.place(x, z, 0.8, 1, 0.35))) return;
        this.burst(o.out, o.t, 0.04, 'bandpass', 3000, 1500, 0.6, 1);
        this.burst(o.out, o.t, 0.7, 'lowpass', 3000, 80, 0.9);
        this.tone(o.out, o.t, 0.5, 'sine', 80, 28, 1);
        this.tone(o.out, o.t, 0.3, 'triangle', 170, 50, 0.5);
        return;
      default: { // tank guns and emplacements
        const big = k === 'emplacement' ? 1.15 : 1;
        if (!(o = this.place(x, z, 0.5, 0.9 * big, 0.2))) return;
        this.burst(o.out, o.t, 0.035, 'bandpass', 2800, 1400, 0.55, 1);
        this.burst(o.out, o.t, 0.45 * big, 'lowpass', 3500, 150, 0.8);
        this.tone(o.out, o.t, 0.28 * big, 'triangle', 160 / big, 45, 0.7);
      }
    }
  }

  // A falling shell or bomb whistling down onto (x, z), starting `after` seconds from now.
  private whistle(x: number, z: number, after: number, dur: number) {
    const o = this.place(x, z, after + dur, 0.6);
    if (!o) return;
    const ctx = this.ctx!, t = o.t + after;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(1700 + Math.random() * 300, t); osc.frequency.exponentialRampToValueAtTime(550, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.out); osc.start(t); osc.stop(t + dur + 0.02);
  }

  // A blast with weight: a sharp crack, a ground-shaking thump, the roar, then dirt and debris
  // pattering down, with an echo. size: about 0.5 (a rocket) to 3 (a dam going up).
  explosion(x: number, z: number, size: number) {
    if (!this.ctx || this.throttle('exp', 35)) return;
    const k = Math.min(3, Math.max(0.4, size));
    const o = this.place(x, z, 0.8 + k * 0.6, Math.min(1.2, 0.55 + k * 0.3), 0.25 + k * 0.15);
    if (!o) return;
    this.heat += 0.04 * k;
    const { out, t } = o;
    this.burst(out, t, 0.05, 'bandpass', 3500, 1200, 0.6, 0.8); // the crack
    this.tone(out, t, 0.3 + k * 0.15, 'sine', 90, 28, 1); // the thump you feel
    this.tone(out, t, 0.18 + k * 0.05, 'triangle', 160, 50, 0.45); // the same, for small speakers that can't play the low part
    this.burst(out, t, 0.6 + k * 0.5, 'lowpass', 1600 + k * 400, 70, 0.55 + k * 0.2); // the roar
    for (let i = 0, n = 2 + Math.round(k * 2); i < n; i++) this.burst(out, t + 0.15 + Math.random() * (0.4 + k * 0.3), 0.05, 'bandpass', 1500 + Math.random() * 2500, 700, 0.07, 3); // debris
  }

  collapse(x: number, z: number) {
    const o = this.place(x, z, 3.2, 1, 0.5);
    if (!o) return;
    const { out, t } = o;
    this.burst(out, t, 3.2, 'lowpass', 500, 60, 1.1);
    this.tone(out, t, 1.6, 'sine', 70, 25, 0.7);
    for (let i = 0; i < 14; i++) this.burst(out, t + Math.random() * 2.5, 0.08 + Math.random() * 0.1, 'bandpass', 700 + Math.random() * 1500, 300, 0.18, 2);
  }

  crunch(x: number, z: number) {
    if (!this.ctx || this.throttle('cru', 90)) return;
    const o = this.place(x, z, 0.25, 0.8);
    if (o) for (let i = 0; i < 3; i++) this.burst(o.out, o.t + i * 0.04, 0.12, 'bandpass', 500 + Math.random() * 600, 200, 0.4, 1.5);
  }

  // A unit (or Command, or a builder) speaking over the radio: a squelch, then made-up speech in the
  // rhythm of the words on screen (a syllable for each vowel, pauses at commas and full stops), in a
  // voice of its own for each kind of speaker, then the hiss as they let go of the button.
  voice(who: string, line: string) {
    const ctx = this.ctx;
    if (!ctx || who === 'Alert' || this.throttle('voice:' + line, 600)) return;
    const t0 = ctx.currentTime;
    if (this.talk) { this.talk.gain.setTargetAtTime(0, t0, 0.02); this.talk = null; }
    let h = 7; for (const c of who) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const pitch = 85 + (h % 9) * 14, rate = 0.075 + ((h >> 4) % 4) * 0.01; // each speaker: a pitch and a pace
    // The radio: cut the lows and highs, drive it a little so it crackles.
    const out = ctx.createGain(); out.gain.value = 0.5;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const sh = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); } sh.curve = curve;
    hp.connect(lp); lp.connect(sh); sh.connect(out); out.connect(this.master);
    this.talk = out;
    // The squelch as they key the mic.
    this.tone(out, t0, 0.04, 'square', 1500, 1500, 0.05);
    this.burst(out, t0, 0.06, 'bandpass', 2500, 2500, 0.12, 0.5);
    // The speech: a buzzing voice through two moving vowel filters, a hiss for the consonants.
    const words = line.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => /[a-z]/i.test(w));
    let t = t0 + 0.09;
    if (words.length) {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      const env = ctx.createGain(); env.gain.value = 0;
      const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
      for (const f of [f1, f2]) { f.type = 'bandpass'; f.Q.value = 6; env.connect(f); f.connect(hp); }
      const hiss = ctx.createBufferSource(); hiss.buffer = this.noise; hiss.loop = true;
      const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 3000;
      const hg = ctx.createGain(); hg.gain.value = 0;
      osc.connect(env); hiss.connect(hf); hf.connect(hg); hg.connect(hp);
      const last = line.trim().slice(-1), up = last === '!' ? 1.15 : 1;
      let n = 0;
      for (const w of words) {
        const syl = Math.max(1, Math.min(4, (w.match(/[aeiouy]+/gi) ?? []).length));
        for (let s = 0; s < syl && t < t0 + 2.6; s++, n++) {
          const d = rate * (0.8 + Math.random() * 0.5), v = VOWELS[(h + n * 7 + w.length) % VOWELS.length];
          const p = pitch * up * (1 + 0.12 * Math.sin(n * 1.7)) * (1 - Math.min(0.15, n * 0.008)); // a little melody, falling as the line goes on
          osc.frequency.setTargetAtTime(p, t, 0.015);
          f1.frequency.setTargetAtTime(v[0], t, 0.02); f2.frequency.setTargetAtTime(v[1], t, 0.02);
          if (/^[^aeiou]/i.test(w) || s) { hg.gain.setTargetAtTime(0.25, t, 0.005); hg.gain.setTargetAtTime(0, t + 0.02, 0.008); }
          env.gain.setTargetAtTime(0.9, t + 0.015, 0.012); env.gain.setTargetAtTime(0, t + d - 0.02, 0.012);
          t += d;
        }
        t += /[.!?]$/.test(w) ? 0.16 : /[,:]$/.test(w) ? 0.09 : 0.03;
      }
      if (last === '?') osc.frequency.setTargetAtTime(pitch * 1.4, t - rate * 2, 0.04);
      osc.start(t0); osc.stop(t + 0.1); hiss.start(t0); hiss.stop(t + 0.1);
    }
    // Static under it all, and the hiss when they let go.
    this.burst(out, t0 + 0.05, t - t0, 'bandpass', 2000, 2000, 0.025, 0.4);
    this.burst(out, t, 0.12, 'highpass', 2500, 2000, 0.08);
    this.sfx.gain.cancelScheduledValues(t0); this.sfx.gain.setTargetAtTime(0.55, t0, 0.05); this.sfx.gain.setTargetAtTime(1, t, 0.25); // the battle dips while someone's talking, so you hear them
  }

  click() {
    const o = this.place(undefined, undefined, 0.05, 0.9);
    if (!o) return;
    this.burst(o.out, o.t, 0.012, 'highpass', 4500, 3500, 0.2);
    this.tone(o.out, o.t, 0.035, 'sine', 1500, 1000, 0.12);
  }

  alarm() {
    if (!this.ctx || this.throttle('alm', 4000)) return;
    const o = this.place(undefined, undefined, 0.6);
    if (o) for (let i = 0; i < 2; i++) { this.tone(o.out, o.t + i * 0.3, 0.22, 'sawtooth', 520, 520, 0.06); this.tone(o.out, o.t + i * 0.3 + 0.12, 0.12, 'sawtooth', 390, 390, 0.05); }
  }

  fanfare() {
    const o = this.place(undefined, undefined, 1.4);
    if (o) [392, 523, 659, 784, 1047].forEach((f, i) => {
      this.tone(o.out, o.t + i * 0.13, 0.5 + (i === 4 ? 0.8 : 0), 'triangle', f, f, 0.18);
      this.tone(o.out, o.t + i * 0.13, 0.4, 'square', f / 2, f / 2, 0.03);
    });
  }

  // The world around the fighting, every frame: wind gusting, birds by day, crickets at night. Both
  // fall silent when a battle is heard and creep back after. dark: 0 day to 1 night; playing: off
  // means a menu, where it all plays softer.
  tick(dt: number, dark: number, playing: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.wind) return;
    const t = ctx.currentTime;
    this.heat = Math.min(2, this.heat * Math.exp(-dt / 4));
    const calm = Math.max(0, 1 - this.heat * 1.5);
    this.amb.gain.setTargetAtTime(playing ? 1 : 0.5, t, 0.5);
    if (t > this.next.gust) {
      this.next.gust = t + 1.5 + Math.random() * 3;
      this.wind.f.frequency.setTargetAtTime(250 + Math.random() * 450, t, 1.2);
      this.wind.g.gain.setTargetAtTime((0.025 + Math.random() * 0.05) * (0.6 + 0.4 * calm), t, 1);
    }
    if (t > this.next.bird) {
      this.next.bird = t + 1 + Math.random() * 5;
      if (Math.random() < (1 - dark) * calm) this.bird();
    }
    if (t > this.next.cricket) {
      this.next.cricket = t + 0.5 + Math.random() * 0.6;
      if (dark > 0.4 && Math.random() < dark * calm) this.cricket();
    }
  }

  private ambOut(pan: number) {
    const ctx = this.ctx!, p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(this.amb); return p;
  }

  private bird() {
    const ctx = this.ctx!, out = this.ambOut(Math.random() * 1.6 - 0.8), t = ctx.currentTime;
    const base = 2600 + Math.random() * 1800, n = 2 + ((Math.random() * 4) | 0), d = 0.05 + Math.random() * 0.06;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), ti = t + i * (d + 0.04);
      o.frequency.setValueAtTime(base * (i % 2 ? 1.2 : 1), ti); o.frequency.exponentialRampToValueAtTime(base * (i % 2 ? 0.9 : 1.4), ti + d);
      g.gain.setValueAtTime(0.0001, ti); g.gain.exponentialRampToValueAtTime(0.025, ti + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ti + d);
      o.connect(g); g.connect(out); o.start(ti); o.stop(ti + d + 0.02);
    }
  }

  private cricket() {
    const ctx = this.ctx!, out = this.ambOut(Math.random() * 1.6 - 0.8), t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 4200 + Math.random() * 600;
    g.gain.value = 0; o.connect(g); g.connect(out);
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.012, t + i * 0.045); g.gain.setValueAtTime(0, t + i * 0.045 + 0.025); }
    o.start(t); o.stop(t + 0.15);
  }
}

export const audio = new Audio();
