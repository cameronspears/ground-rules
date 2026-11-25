// The battle and the world are recordings made with ElevenLabs' sound generator (src/sfx/sfx.mp3, a
// few takes of each sound, played at slightly different pitches so nothing repeats exactly); the
// radio voices are ElevenLabs voices (src/voice/radio.mp3). The clicks, the warning chime, the radio
// crackle are made in code. (No music: the game's sound is the battle and the radio.) tools/voices.md says how to make more.
//
// The mix follows the camera. On screen a sound plays full, panned by where it is. Just past the
// edge it's quieter, muffled and a touch late (sound is slower than light). Further out it's silent:
// a fight you aren't watching makes no noise, and the alarm chime tells you what matters. The few
// big moments (a dam bursting, a superweapon landing, one of your buildings falling) still come
// through from anywhere as a short, clear blast from their side, so you know where to look.
// Only a handful of battle sounds play at once, and only a couple of any one kind, each a little
// different in pitch and level: thirty tanks firing sound like a few shots, not a drone.
import { toScreen } from './terrain';
import { WEAPONS, type Weapon } from './combat';
import RADIO from './voice/radio.mp3';
import { CLIPS } from './voice/clips';
import SFXFILE from './sfx/sfx.mp3';
import { SFX } from './sfx/clips';

// Who speaks with which voice (the clips are made per voice: see tools/voices.md). A speaker not
// here, or a line with no clip, gets just the radio click.
const VOICE: Record<string, string> = {
  Rifleman: 'inf1', 'Rocket Soldier': 'inf2', Grenadier: 'inf3', 'Scout Buggy': 'inf3', Scout: 'inf3', Gunship: 'inf3', Bomber: 'inf3',
  'Battle Tank': 'tank', Juggernaut: 'tank', Colossus: 'tank', 'Field Gun': 'gun', 'Flak Truck': 'gun', Builder: 'builder', Salvager: 'salv',
  Command: 'cmd', 'Orbital Uplink': 'cmd', Interceptor: 'cmd',
};
// Lines that come up again and again (a building placed, a building done) or with names and numbers
// in them, which can't be recorded ahead, are spoken as one of a few lines for that moment, in turn
// ("Barracks complete." comes over as "Construction complete.", "Job done." ...); null keeps it to the
// text. The first line of a set also names it: the same set isn't spoken twice within 6 s.
const SAY: [RegExp, string[] | null][] = [
  [/^We'll barely scratch that/, ["We'll barely scratch that!"]], [/^Mount up!/, ['Mount up!', 'Mount up! Everyone riding.']], [/^Guarding the /, ['Guarding it.']],
  [/Train a builder/, null], [/site cleared/, null], // (said when there's no builder to say it; a quiet housekeeping note)
  [/ complete\.$/, ['Construction complete.', 'Built to last. Unlike me.', "There. Ain't she pretty?", 'Done, and under budget.', "Finished. Where's my coffee?"]],
  [/^Rebuilding the bridge/, ['Rebuilding the bridge.']], [/ in line\.$/, ['Hold your horses.', 'One thing at a time, sonny.', 'Get in line.']],
  [/blocks of sandbags/, ['Sandbags going up.', 'Stacking bags. My poor back.', 'Dirt in a bag. Classic.']],
  [/On it\.$|^Breaking ground\.$/, ['Breaking ground.', "I'll get my good shovel.", 'Leave it with me, sonny.', 'Can do.', "Back's not what it was. Going.", 'Measure twice, dig once.']],
];
// Anything else gets one of the speaker's own plain acknowledgements, never the same one twice running.
const ACK: Record<string, string[]> = {
  inf1: ['Copy that.', 'On it.', 'Roger.', 'Wilco.', 'Yes sir!', 'You got it, boss.'],
  inf2: ['Copy that.', 'On it.', 'Roger.', 'Wilco.', 'Consider it done.', 'Yeah, yeah.'],
  inf3: ['Copy that.', 'On it.', 'Roger.', 'You got it, boss.', 'Easy.', 'Say less.'],
  tank: ['Copy that.', 'On it.', 'Roger that.', 'Consider it done.', 'Heard you.', 'If we must.'],
  gun: ['Copy that.', 'On it.', 'Roger.', 'Laying it in.', 'Heard, sir.', 'Patience.'],
  salv: ['Copy that.', 'On it.', 'You got it.', 'Done deal.', 'Sure, sure.', 'Fine, fine.'],
  builder: ['Copy that.', 'On it.', 'Right you are.', 'Can do.', 'Sure thing, sonny.', 'Yep, yep.'],
};
// Picks from a list without repeating any of the last few picks, so a unit goes through most of its lines before any comes back.
const picked: Record<string, string[]> = {};
export function pick(key: string, lines: string[]) {
  const was = (picked[key] ??= []), fresh = lines.filter((l) => !was.includes(l)), l = (fresh.length ? fresh : lines)[(Math.random() * (fresh.length || lines.length)) | 0];
  was.push(l); if (was.length > Math.max(1, lines.length - 2)) was.shift(); // (of 5 lines, none comes back within 3)
  return l;
}
// How much a line matters, which decides who gets to speak: chatter (answering a click) never cuts
// anyone off; an order's answer cuts chatter off; news (a promotion, a building done, a loss) cuts
// both and isn't cut by them.
export type Pri = 0 | 1 | 2;

const NAME = new Map<Weapon, string>(Object.entries(WEAPONS).map(([k, w]) => [w, k]));
const LEVEL = 2; // every recording is packed at the same loudness as heard (tools/voices/sfx_pack.py); this sets them all under the radio, and the vol of each call sets big against small
// The mix's limits, picked by listening to a big battle (see the header). A sound holds its place for
// its first HOLD seconds (its tail rings on, but no longer blocks the next).
const MAX = 10, PER_KIND = 2, OFF_MAX = 3, HOLD = 0.6, GAP = 0.07;
const NEAR = 0.5; // how far past the frame's edge a sound still carries, in half-frames (a quarter of a screen)

type Out = { out: GainNode; t: number; short: boolean };

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; private sfx!: GainNode; private far!: BiquadFilterNode; private verb!: GainNode; private amb!: GainNode;
  private noise!: AudioBuffer;
  private radio: AudioBuffer | null = null; // the voice lines, once loaded
  private talking: AudioBufferSourceNode | null = null; private talkPri = 0; private talkEnd = 0; // who's on the radio, how much it matters, and when they stop
  private view = { x: 0, y: 0, w: 640, h: 360 };
  private last: Record<string, number> = {};
  private slots: { kind: string; end: number; off: boolean }[] = []; // the battle sounds holding a place in the mix now
  private lastOf: Record<string, number> = {}; // when each kind last started
  private heat = 0; // how much fighting has been heard lately: 0 calm, ~1 a big battle
  private bank: AudioBuffer | null = null; // the sound effects, once loaded
  private took: Record<string, number> = {}; // the take each sound played last, so the next is another
  private wind: GainNode | null = null;
  private next = { gust: 0, life: 0 };

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.knee.value = 8; comp.attack.value = 0.004; comp.release.value = 0.3;
    const limit = ctx.createDynamicsCompressor(); // a ceiling nothing gets past, however much piles up at once
    limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.15;
    comp.connect(limit); limit.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.far = ctx.createBiquadFilter(); this.far.type = 'lowpass'; this.far.frequency.value = 700; this.far.connect(this.sfx);
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    fetch(RADIO).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => (this.radio = b)).catch(() => {}); // (until it's in, lines get just the click)
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 3; }
    // One shared echo (a made-up impulse: a second and a half of fading noise) gives booms a tail.
    const rev = ctx.createConvolver(), len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    rev.buffer = ir; this.verb = ctx.createGain(); this.verb.gain.value = 0.35; this.verb.connect(rev); rev.connect(this.master);
    fetch(SFXFILE).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => { this.bank = b; this.startWind(); }).catch(() => {});
  }

  // The camera's frame in screen-map pixels (Game.vx, vy, FW, FH). Called every frame.
  setView(x: number, y: number, w: number, h: number) { const V = this.view; V.x = x; V.y = y; V.w = w; V.h = h; }

  // A gain and panner for one battle sound at a ground point, or null when the camera is too far away
  // or the mix is full. key: one of the big moments heard from anywhere. t is when it should start.
  private place(kind: string, x: number, z: number, dur: number, vol: number, wet: number, key: boolean): Out | null {
    const ctx = this.ctx!, now = ctx.currentTime;
    const [sx, sy] = toScreen(x, z), V = this.view, hw = V.w / 2, hh = V.h / 2;
    const dx = sx - (V.x + hw), dy = sy - (V.y + hh);
    const off = Math.hypot(Math.max(0, Math.abs(dx) - hw), Math.max(0, Math.abs(dy) - hh)) / hw; // how far outside the frame, in half-frames
    const far = off > NEAR, short = far && key;
    if (far && !key) return null;
    this.slots = this.slots.filter((s) => s.end > now);
    const mine = this.slots.filter((s) => s.kind === kind).length;
    if (!key && (this.slots.length >= MAX || mine >= (off > 0 ? 1 : PER_KIND) || now - (this.lastOf[kind] ?? -1) < GAP
      || (off > 0 && this.slots.filter((s) => s.off).length >= OFF_MAX))) return null;
    const delay = short ? 0 : Math.min(0.3, off * 0.4);
    this.slots.push({ kind, end: now + delay + Math.min(dur, HOLD), off: off > 0 }); this.lastOf[kind] = now;
    let g = vol * (0.85 + Math.random() * 0.3) * Math.min(1, Math.sqrt(700 / V.w)); // (zoomed right out, each sound is a smaller part of a bigger picture)
    if (short) g *= 0.5; else if (off > 0) g *= 0.1 + 0.45 * (1 - off / NEAR);
    this.heat += g * 0.03;
    const gain = ctx.createGain(), p = ctx.createStereoPanner();
    gain.gain.value = g; p.pan.value = Math.max(-0.75, Math.min(0.75, (dx / hw) * 0.6));
    gain.connect(p); p.connect(off > 0 && !short ? this.far : this.sfx);
    if (wet && !short) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.verb); }
    if (short) gain.gain.setTargetAtTime(0, now + 0.5, 0.15); // (a short burst from its side, not the whole thing)
    return { out: gain, t: now + delay, short };
  }

  // A gain for a sound that isn't in the world (the clicks, the menus, the radio, the chime): always heard, never counted.
  private ui(vol: number) {
    const gain = this.ctx!.createGain(); gain.gain.value = vol; gain.connect(this.sfx);
    return gain;
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

  // One recorded sound at a ground point (or none: the player's own cues), a different take from last time
  // at a slightly different pitch. vol: its level; wet: how much echo; after: seconds from now; kind: what
  // it counts as in the mix (by default its own name); key: heard from anywhere.
  private play(key: string, x: number | undefined, z: number | undefined, vol = 1, wet = 0, after = 0, rate = 1, kind = key, big = false) {
    const takes = SFX[key], ctx = this.ctx;
    if (!ctx || !this.bank || !takes) return;
    let n = (Math.random() * takes.length) | 0;
    if (takes.length > 1 && n === this.took[key]) n = (n + 1) % takes.length;
    const [at, len] = takes[n], r = rate * (0.94 + Math.random() * 0.12);
    const o = x === undefined ? { out: this.ui(vol * LEVEL), t: ctx.currentTime, short: false } : this.place(kind, x, z!, after + len / r, vol * LEVEL, wet, big);
    if (!o) return;
    this.took[key] = n;
    const src = ctx.createBufferSource(); src.buffer = this.bank; src.playbackRate.value = r;
    src.connect(o.out); src.start(o.t + after, at, o.short ? Math.min(len, 1.2) : len);
  }

  // A weapon firing from (x, z) at (tx, tz); flight: seconds until a shell or bomb lands. Each family has its own recording and counts as one kind in the mix.
  shot(w: Weapon, x: number, z: number, tx: number, tz: number, flight = 0) {
    if (!this.ctx) return;
    const k = NAME.get(w) ?? 'cannon';
    const fam = k === 'rifle' || k === 'garrison' ? 'rifle' : k === 'mg' || k === 'towerMg' || k === 'sidearm' ? 'mg' : k.includes('lak') ? 'flak'
      : k === 'rocket' || k === 'gunrockets' ? 'rocket' : k === 'heavy' || k === 'colossus' ? 'heavy' : k === 'howitzer' || k === 'grenade' || k === 'bombs' ? k : 'cannon';
    switch (fam) {
      case 'rifle': return this.play('rifle', x, z, 0.3, 0.08);
      case 'mg': return this.play('mg', x, z, k === 'sidearm' ? 0.22 : 0.32, 0.05);
      case 'flak': return this.play('flak', x, z, 0.45, 0.1);
      case 'rocket': return this.play('rocket', x, z, 0.5, 0.1);
      case 'grenade': return this.play('grenade', x, z, 0.35);
      case 'bombs': return this.play('bombs', tx, tz, 0.55, 0, Math.max(0, flight - 1.4));
      case 'howitzer':
        this.play('howitzer', x, z, 0.85, 0.4);
        if (flight > 2.2) this.play('incoming', tx, tz, 0.4, 0, flight - 2); // (a soft rush overhead just before it lands)
        return;
      case 'heavy': return this.play('cannon', x, z, 1, 0.35, 0, 0.8, 'heavy'); // (the same gun, bigger: pitched down)
      default: return this.play('cannon', x, z, k === 'emplacement' ? 0.9 : 0.8, 0.2);
    }
  }

  // A blast with weight, by size: about 0.5 (a rocket) to 3 (a dam going up).
  explosion(x: number, z: number, size: number) {
    const k = Math.min(3, Math.max(0.4, size));
    this.play(k < 0.9 ? 'boom_s' : k < 1.8 ? 'boom_m' : 'boom_l', x, z, Math.min(1.3, 0.45 + k * 0.3), 0.2 + k * 0.1, 0, k > 2.4 ? 0.85 : 1, 'boom', k >= 3); // (3: a superweapon or a reactor going up)
  }

  // A Colossus's footfall: a thud you feel more than hear.
  thud(x: number, z: number) { this.play('footfall', x, z, 0.7, 0.1); }

  // One of the world's other moments, at a ground point or (no point) for the player alone: a tree
  // coming down, a building placed or finished, a unit rolling out, a crate, oil, a capture, a strike...
  fx(key: string, x?: number, z?: number, vol = 0.7) {
    const big = key === 'bridge' || key === 'dam' || key === 'orbital';
    this.play(key, x, z, vol, big ? 0.4 : key === 'tree' ? 0.15 : 0, 0, 1, key, big);
  }

  // A building falling; ours is heard from anywhere.
  collapse(x: number, z: number, ours = false) { this.play('collapse', x, z, 1, 0.4, 0, 1, 'collapse', ours); }

  crunch(x: number, z: number) { this.play('crush', x, z, 0.55); }

  // A line on screen comes over the radio: the click as they key the mic, the line in the speaker's
  // own voice through a crackly little speaker, the click as they let go. The battle dips under it.
  // So it doesn't wear on you, not every line is spoken (the text always shows): a click on the same
  // kind of unit gets an answer at most every 15 s, any click every 4 s; orders at most every 4 s, so
  // a burst of right-clicks is answered once; the same words not twice within 6 s.
  voice(who: string, line: string, pri: Pri = 2) {
    const ctx = this.ctx;
    if (!ctx || who === 'Alert') return;
    const v = VOICE[who];
    if (v && ctx.currentTime < this.talkEnd && pri <= this.talkPri && (pri < 2 || this.talkPri === 2)) return; // someone as important is still talking
    if (pri === 0 && (this.throttle('chat', 4000) || this.throttle('chat:' + v, 15000))) return;
    if (pri === 1 && this.throttle('order', 4000)) return;
    const say = v ? SAY.find(([re]) => re.test(line)) : undefined, set = say?.[1];
    if (say && !set) return;
    if (this.throttle('voice:' + (set?.[0] ?? line), 6000)) return;
    const own = (l: string) => CLIPS[v + '|' + l], mine = (ls?: string[]) => ls?.some(own) ? own(pick(v + ls[0], ls.filter(own))) : undefined;
    const clip = v && this.radio ? mine(set) ?? own(line) ?? mine(ACK[v]) : undefined;
    const o = { out: this.ui(0.5), t: ctx.currentTime };
    this.play('radio_on', undefined, undefined, 0.35); // the mic keyed: a click and a crackle
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
      end = o.t + 0.06 + clip[1]; this.talkPri = pri; this.talkEnd = end;
      this.sfx.gain.cancelScheduledValues(o.t); this.sfx.gain.setTargetAtTime(0.5, o.t, 0.05); this.sfx.gain.setTargetAtTime(1, end, 0.3);
    }
    this.play('radio_off', undefined, undefined, 0.3, 0, end - ctx.currentTime); // and let go: the squelch
  }

  click() {
    if (!this.ctx) return;
    const out = this.ui(0.9), t = this.ctx.currentTime;
    this.burst(out, t, 0.012, 'highpass', 4500, 3500, 0.2);
    this.tone(out, t, 0.035, 'sine', 1500, 1000, 0.12);
  }

  // The menus' little noises: a blip as you point at something new, a bloop when you pick it, and a short rising
  // fanfare when you start a game.
  blip() {
    if (!this.ctx || this.throttle('blip', 45)) return;
    this.tone(this.ui(0.8), this.ctx.currentTime, 0.03, 'triangle', 1500, 1750, 0.07);
  }
  bloop() {
    if (!this.ctx) return;
    const out = this.ui(0.9), t = this.ctx.currentTime;
    this.tone(out, t, 0.06, 'sine', 520, 700, 0.14); this.tone(out, t + 0.05, 0.08, 'sine', 780, 1040, 0.12);
  }
  fanfare() {
    if (!this.ctx) return;
    const out = this.ui(0.9), t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(out, t + i * 0.07, i === 3 ? 0.3 : 0.09, 'triangle', f, f, 0.12));
  }

  // A warning on screen: two soft notes, like a console chime.
  alarm() {
    if (!this.ctx || this.throttle('alm', 3000)) return;
    const out = this.ui(0.8), t = this.ctx.currentTime;
    this.tone(out, t, 0.25, 'triangle', 880, 880, 0.12); this.tone(out, t + 0.16, 0.35, 'triangle', 660, 660, 0.12);
  }

  // The world around the fighting, every frame: the wind swelling and settling, now and then a wood
  // pigeon by day or distant frogs by night. All dip while a battle is heard and creep back after.
  // dark: 0 day to 1 night; playing: off means a menu, where it all plays softer.
  tick(dt: number, dark: number, playing: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.wind) return;
    const t = ctx.currentTime;
    this.heat = Math.min(2, this.heat * Math.exp(-dt / 4));
    const calm = Math.max(0, 1 - this.heat * 1.5);
    this.amb.gain.setTargetAtTime(playing ? 1 : 0.5, t, 0.5);
    if (t > this.next.gust) {
      this.next.gust = t + 4 + Math.random() * 5;
      this.wind.gain.setTargetAtTime((0.065 + Math.random() * 0.08) * (0.5 + 0.5 * calm), t, 2);
    }
    if (t > this.next.life) {
      this.next.life = t + 15 + Math.random() * 20;
      if (Math.random() < calm) this.ambient(dark > 0.5 ? 'night' : 'birds', 0.09 * calm);
    }
  }

  // The wind: one recorded loop under everything.
  private startWind() {
    const ctx = this.ctx!, take = SFX.wind?.[0];
    if (!take) return;
    const src = ctx.createBufferSource(); src.buffer = this.bank; src.loop = true; src.loopStart = take[0]; src.loopEnd = take[0] + take[1];
    this.wind = ctx.createGain(); this.wind.gain.value = 0.1;
    src.connect(this.wind); this.wind.connect(this.amb); src.start(0, take[0]);
  }

  // A snatch of the world's life, faded in and out somewhere off to one side, so it drifts past.
  private ambient(key: string, vol: number) {
    const ctx = this.ctx!, takes = SFX[key];
    if (!takes) return;
    const [at, len] = takes[(Math.random() * takes.length) | 0], t = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
    src.buffer = this.bank; p.pan.value = Math.random() * 1.4 - 0.7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 1); g.gain.setValueAtTime(vol, t + len - 1.5); g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g); g.connect(p); p.connect(this.amb); src.start(t, at, len);
  }
}

export const audio = new Audio();
