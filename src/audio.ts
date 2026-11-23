// All sound is made in code except the radio voices: one file of short lines (src/voice/radio.mp3),
// spoken by Chatterbox, Resemble AI's open voice model (MIT licence, free for any use), on our own
// machine. tools/voices.md says how to make more.
//
// The mix: every sound is placed against the camera's frame. On screen it plays full and is panned
// by where it is; off screen it fades fast, is muffled and arrives a little late (sound is slower
// than light), so a fight you aren't watching is a distant rumble, not a wall of noise. A budget
// caps how many sounds play at once and turns each one down as more pile in, so a big battle
// stays a roar you can hear into instead of mush.
import { toScreen } from './terrain';
import { WEAPONS, type Weapon } from './combat';
import RADIO from './voice/radio.mp3';
import { CLIPS } from './voice/clips';

// Who speaks with which voice (the clips are made per voice: see tools/voices.md). A speaker not
// here, or a line with no clip, gets just the radio click; a unit's line with numbers or names in it
// gets a plain acknowledgement instead.
const VOICE: Record<string, string> = {
  Rifleman: 'base', 'Rocket Soldier': 'low', Grenadier: 'light', 'Battle Tank': 'deep', Juggernaut: 'deep', Colossus: 'deep', 'Field Gun': 'low',
  'Flak Truck': 'low', 'Scout Buggy': 'high', Scout: 'high', Gunship: 'high', Bomber: 'high', Builder: 'light', Salvager: 'light',
  Command: 'cmd', 'Orbital Uplink': 'cmd', Interceptor: 'cmd',
};
const ACK = ['Copy that.', 'On it.', 'Understood.'];

const NAME = new Map<Weapon, string>(Object.entries(WEAPONS).map(([k, w]) => [w, k]));
const BUSY = 48, MAX_LIVE = 80; // sounds playing at once: past BUSY only clear, close ones get in; MAX_LIVE is a hard guard on the work

type Out = { out: AudioNode; t: number; g: number };

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; private sfx!: GainNode; private far!: BiquadFilterNode; private verb!: GainNode; private amb!: GainNode;
  private noise!: AudioBuffer;
  private radio: AudioBuffer | null = null; // the voice lines, once loaded
  private talking: AudioBufferSourceNode | null = null;
  private music!: GainNode;
  private view = { x: 0, y: 0, w: 640, h: 360 };
  private last: Record<string, number> = {};
  private live: number[] = []; // when each sound playing now ends
  private recent: number[] = []; // when each sound of the last third of a second began
  private heat = 0; // how much fighting has been heard lately: 0 calm, ~1 a big battle
  private wind: { f: BiquadFilterNode; g: GainNode } | null = null;
  private next = { gust: 0, bird: 0, cricket: 0 };

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
    this.music = ctx.createGain(); this.music.gain.value = 0.7; this.music.connect(this.master);
    fetch(RADIO).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => (this.radio = b)).catch(() => {}); // (until it's in, lines get just the click)
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

  // A Colossus's footfall: a deep thud you feel more than hear, and a little grit shaken loose.
  thud(x: number, z: number) {
    if (!this.ctx || this.throttle('thud', 80)) return;
    const o = this.place(x, z, 0.5, 0.8, 0.15);
    if (!o) return;
    this.tone(o.out, o.t, 0.35, 'sine', 62, 32, 0.9);
    this.tone(o.out, o.t, 0.12, 'triangle', 120, 60, 0.3); // (for small speakers)
    this.burst(o.out, o.t, 0.2, 'lowpass', 400, 80, 0.4);
    this.burst(o.out, o.t + 0.08, 0.06, 'bandpass', 1800, 900, 0.05, 3);
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

  // A line on screen comes over the radio: the click as they key the mic, the line in the speaker's
  // own voice through a crackly little speaker, the click as they let go. The battle dips under it.
  voice(who: string, line: string) {
    const ctx = this.ctx;
    if (!ctx || who === 'Alert' || this.throttle('voice:' + line, 600)) return;
    const v = VOICE[who], clip = v && this.radio ? CLIPS[v + '|' + line] ?? (v !== 'cmd' && !CLIPS['cmd|' + line] ? CLIPS[v + '|' + ACK[(Math.random() * ACK.length) | 0]] : undefined) : undefined;
    const o = this.place(undefined, undefined, (clip?.[1] ?? 0) + 0.4, 0.5);
    if (!o) return;
    this.tone(o.out, o.t, 0.04, 'square', 1500, 1500, 0.05); // the mic keyed
    this.burst(o.out, o.t, 0.06, 'bandpass', 2500, 2500, 0.12, 0.5);
    let end = o.t + 0.25;
    if (clip) {
      this.talking?.stop(); // a new line cuts off the last
      const src = (this.talking = ctx.createBufferSource()); src.buffer = this.radio;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const sh = ctx.createWaveShaper(), curve = new Float32Array(256); for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 2.5); sh.curve = curve;
      const g = ctx.createGain(); g.gain.value = 2.4; // (out of the shared 0.5: radios are loud)
      src.connect(hp); hp.connect(lp); lp.connect(sh); sh.connect(g); g.connect(o.out);
      src.start(o.t + 0.06, clip[0], clip[1]);
      end = o.t + 0.06 + clip[1];
      this.sfx.gain.cancelScheduledValues(o.t); this.sfx.gain.setTargetAtTime(0.5, o.t, 0.05); this.sfx.gain.setTargetAtTime(1, end, 0.3);
    }
    this.burst(o.out, o.t + 0.05, end - o.t, 'bandpass', 2000, 2000, 0.03, 0.4); // static under it
    this.tone(o.out, end, 0.04, 'square', 1100, 1100, 0.04); // and let go
    this.burst(o.out, end, 0.1, 'highpass', 2500, 2000, 0.07);
  }

  click() {
    const o = this.place(undefined, undefined, 0.05, 0.9);
    if (!o) return;
    this.burst(o.out, o.t, 0.012, 'highpass', 4500, 3500, 0.2);
    this.tone(o.out, o.t, 0.035, 'sine', 1500, 1000, 0.12);
  }

  // A warning on screen: two soft notes, like a console chime.
  alarm() {
    if (!this.ctx || this.throttle('alm', 3000)) return;
    const o = this.place(undefined, undefined, 0.6, 0.8);
    if (o) { this.tone(o.out, o.t, 0.25, 'triangle', 880, 880, 0.12); this.tone(o.out, o.t + 0.16, 0.35, 'triangle', 660, 660, 0.12); }
  }

  // A few seconds of music for the big moments only: the battle starting, the enemy hitting us,
  // losing a building, winning, losing. Synthesised brass and a timpani.
  sting(kind: 'start' | 'danger' | 'loss' | 'victory' | 'defeat') {
    const ctx = this.ctx;
    if (!ctx || this.throttle('sting:' + kind, kind === 'loss' ? 8000 : 2000)) return;
    const t = ctx.currentTime + 0.05, out = ctx.createGain(); out.connect(this.music);
    const w = ctx.createGain(); w.gain.value = 0.4; out.connect(w); w.connect(this.verb);
    const n = (semi: number) => 220 * 2 ** (semi / 12); // semitones from A3
    const S: Record<string, [number, number[], number][]> = { // [start, notes, length]
      start: [[0, [-7, 0], 0.3], [0.32, [-4, 3], 0.3], [0.64, [-2, 5, 10], 1.6]],
      danger: [[0, [-9, -2], 0.18], [0.26, [-8, -1], 1.1]],
      loss: [[0, [0, 7], 0.45], [0.48, [-2, 5], 0.45], [0.96, [-4, 3], 1.5]],
      victory: [[0, [3, 10], 0.22], [0.25, [3, 10], 0.22], [0.5, [7, 14], 0.4], [0.95, [3, 7, 10, 15], 2.2]],
      defeat: [[0, [-9, -6, -2], 3.2]],
    };
    for (const [at, notes, len] of S[kind]) for (const s of notes) this.brass(out, t + at, n(s), len, kind === 'defeat' ? 0.5 : 0.12);
    const hits = { start: [0, 0.64], danger: [0, 0.26], loss: [0.96], victory: [0.95], defeat: [0] }[kind];
    for (const at of hits) this.timpani(out, t + at, kind === 'victory' || kind === 'start' ? 73 : 55);
  }

  private brass(out: AudioNode, t: number, f: number, len: number, attack: number) {
    const ctx = this.ctx!, lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.Q.value = 1; lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(2200, t + attack); lp.frequency.setTargetAtTime(1100, t + attack, 0.2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + attack); g.gain.setTargetAtTime(0.055, t + attack, 0.2); g.gain.setTargetAtTime(0, t + len, 0.12);
    lp.connect(g); g.connect(out);
    for (const d of [-7, 0, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + len + 0.8); }
  }

  private timpani(out: AudioNode, t: number, f: number) {
    this.tone(out, t, 1.4, 'sine', f * 1.4, f, 0.5);
    this.burst(out, t, 0.25, 'lowpass', 500, 120, 0.3);
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
