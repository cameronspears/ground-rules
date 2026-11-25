// The battle and the world are recordings made with ElevenLabs' sound generator (src/sfx/sfx.mp3, a
// few takes of each sound, played at slightly different pitches so nothing repeats exactly); the
// radio voices are ElevenLabs voices (src/voice/radio.mp3). The clicks, the warning chime, the radio
// crackle are made in code. (No music: the game's sound is the battle and the radio.) tools/voices.md says how to make more.
//
// The mix follows the camera. On screen a sound plays full, panned by where it is, a little louder
// towards the middle where you're looking. Off screen, anywhere on the map, it's faint (fainter the
// further away), muffled (the high end rolled off) and comes from its side: a fight to the left of
// the camera is a dull thump in the left speaker. So what you hear is what you're looking at, the
// world's own sounds, and a hint of where else things are happening.
//
// Every sound has a layer (MIX). Each layer gets its own few places at once, so rifles never crowd
// out the big guns and the world's own noises (a tree going down, an engine, a hammer) still get
// through a battle. The top layer is the big moments (a dam bursting, a superweapon, a building
// coming down): they always play, on screen everything else dips under them for a moment so they land, and
// the ones that matter to you (a dam, a strike, your own building) come through from anywhere as a
// short blast from their side. A sound heard over and over in a short while gets quieter, and every
// one varies a little in pitch and level, so thirty tanks firing sound like a few shots, not a drone.
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
  [/^Reporting for duty|^Salvager reporting/, null], // (routine: a unit ready. The text and a soft sound say it; a voice every time wore thin)
  [/ complete\.$/, ['Construction complete.', 'Built to last. Unlike me.', "There. Ain't she pretty?", 'Done, and under budget.', "Finished. Where's my coffee?"]], // (only the first of each building: see voice)
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
// The mix, in one place: each sound's layer, level and echo. Layers: 0 the big moments, 1 the big guns
// and blasts, 2 small arms, 3 the world's texture. Sounds with no position (the player's own cues,
// the radio) only use the level.
const MIX: Record<string, [layer: number, level: number, wet: number]> = { // (wide on purpose: a rifle is a tick, a tank shell a boom, a dam the loudest thing you'll hear)
  dam: [0, 1.4, 0.4], bridge: [0, 1.3, 0.4], orbital: [0, 1.3, 0.4], collapse: [0, 1.1, 0.4],
  cannon: [1, 0.85, 0.2], howitzer: [1, 0.9, 0.4], bombs: [1, 0.6, 0], boom_m: [1, 1, 0.35], boom_l: [1, 1.3, 0.45], footfall: [1, 0.8, 0.1], intercept: [1, 0.8, 0],
  rifle: [2, 0.2, 0.08], mg: [2, 0.22, 0.05], flak: [2, 0.35, 0.1], rocket: [2, 0.4, 0.1], grenade: [2, 0.3, 0], boom_s: [2, 0.7, 0.25],
  incoming: [3, 0.3, 0], crush: [3, 0.2, 0], tree: [3, 0.2, 0.15], engine: [3, 0.3, 0], rotor: [3, 0.4, 0], jet: [3, 0.4, 0], fire: [3, 0.2, 0],
  hammer: [3, 0.12, 0], built: [3, 0.35, 0], trained: [3, 0.35, 0], door: [3, 0.3, 0], scrap: [3, 0.35, 0], crate: [3, 0.6, 0], capture: [3, 0.5, 0], sell: [3, 0.6, 0],
  place: [3, 0.4, 0], oil: [3, 0.7, 0], powerdown: [3, 0.7, 0], reinforce: [3, 0.7, 0], radio_on: [3, 0.35, 0], radio_off: [3, 0.3, 0],
};
// How many of each layer play at once (the big moments: all of them), picked by listening to a big
// battle. Any one kind gets two places on screen, one off it, and off screen gets three in all. A sound
// holds its place for its first HOLD seconds (its tail rings on, but no longer blocks the next).
const PLACES = [Infinity, 4, 4, 2], PER_KIND = 2, OFF_MAX = 3, HOLD = 0.6, GAP = 0.07, TIRE = 2;
const OFF = 0.15; // how loud a sound just off screen is (a sixth); it halves again over the next screen and a half


export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; private sfx!: GainNode; private bed!: GainNode; private far!: BiquadFilterNode; private verb!: GainNode; private amb!: GainNode;
  private noise!: AudioBuffer;
  private radio: AudioBuffer | null = null; // the voice lines, once loaded
  private talking: AudioBufferSourceNode | null = null; private talkPri = 0; private talkEnd = 0; // who's on the radio, how much it matters, and when they stop
  private view = { x: 0, y: 0, w: 640, h: 360 };
  private last: Record<string, number> = {};
  private slots: { kind: string; layer: number; end: number; off: boolean }[] = []; // the sounds holding a place in the mix now
  private startsOf: Record<string, number[]> = {}; // when each kind started over the last TIRE seconds
  private heat = 0; // how much fighting has been heard lately: 0 calm, ~1 a big battle
  private bank: AudioBuffer | null = null; // the sound effects, once loaded
  private took: Record<string, number> = {}; // the take each sound played last, so the next is another
  private builtOnce = new Set<string>(); // the buildings the builder has announced this game (a fresh game is a fresh page)
  private wind: GainNode | null = null; private night!: GainNode;
  private next = { gust: 0, life: 0, night: 0 };

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 2.5; comp.knee.value = 10; comp.attack.value = 0.008; comp.release.value = 0.25; // (gentle: a big blast should be far louder than a rifle, not squashed level with it)
    const limit = ctx.createDynamicsCompressor(); // a ceiling nothing gets past, however much piles up at once
    limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.15;
    comp.connect(limit); limit.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.bed = ctx.createGain(); this.bed.connect(this.sfx); // everything but the big moments, which it dips under
    this.far = ctx.createBiquadFilter(); this.far.type = 'lowpass'; this.far.frequency.value = 700; this.far.connect(this.bed);
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

  // A gain and panner for one sound at a ground point, or null when the camera is too far away or its
  // layer is full. key: a big moment that matters to you, heard from anywhere as a clear burst. t is when it should start; short: cut to that burst.
  private place(kind: string, layer: number, x: number, z: number, dur: number, vol: number, wet: number, key: boolean) {
    const ctx = this.ctx!, now = ctx.currentTime;
    const [sx, sy] = toScreen(x, z), V = this.view, hw = V.w / 2, hh = V.h / 2;
    const dx = sx - (V.x + hw), dy = sy - (V.y + hh);
    const off = Math.hypot(Math.max(0, Math.abs(dx) - hw), Math.max(0, Math.abs(dy) - hh)) / hw; // how far outside the frame, in half-frames
    const short = off > 0 && key;
    this.slots = this.slots.filter((s) => s.end > now);
    const starts = (this.startsOf[kind] = (this.startsOf[kind] ?? []).filter((t) => t > now - TIRE));
    if (layer > 0 && (this.slots.filter((s) => s.layer === layer).length >= PLACES[layer] || now - (starts.at(-1) ?? -1) < GAP
      || this.slots.filter((s) => s.kind === kind).length >= (off > 0 ? 1 : PER_KIND) || (off > 0 && this.slots.filter((s) => s.off).length >= OFF_MAX))) return null;
    const delay = short ? 0 : Math.min(0.3, off * 0.1);
    this.slots.push({ kind, layer, end: now + delay + Math.min(dur, HOLD), off: off > 0 }); starts.push(now);
    let g = vol * (0.85 + Math.random() * 0.3) / (1 + 0.15 * (starts.length - 1)) * Math.min(1, Math.sqrt(700 / V.w)); // (heard a lot lately: quieter; zoomed right out, each sound is a smaller part of a bigger picture)
    if (short) g *= 0.5; else if (off > 0) g *= OFF / (1 + off * 0.7); else g *= 1 - 0.25 * Math.min(1, Math.hypot(dx / hw, dy / hh) / 1.4); // (on screen: fuller in the middle)
    this.heat += g * 0.03;
    const gain = ctx.createGain(), p = ctx.createStereoPanner();
    gain.gain.value = g; p.pan.value = off > 0 ? 0.95 * dx / Math.hypot(dx, dy) : (dx / hw) * 0.6; // (off screen: from its side, mostly in that speaker)
    gain.connect(p); p.connect(short || (layer === 0 && !off) ? this.sfx : off > 0 ? this.far : this.bed);
    if (wet && !off) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.verb); } // (echo only on screen: it would skip the muffling)
    if (short) gain.gain.setTargetAtTime(0, now + 0.5, 0.15); // (a short burst from its side, not the whole thing)
    if (layer === 0 && (!off || short)) { const b = this.bed.gain; b.cancelScheduledValues(now); b.setTargetAtTime(0.45, now + delay, 0.03); b.setTargetAtTime(1, now + delay + 0.8, 0.4); } // the rest dips so it lands
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
  // at a slightly different pitch, at its level in MIX times vol. after: seconds from now; kind: what it
  // counts as in the mix (by default its own name); layer: its layer, if not its usual one; key: heard from anywhere.
  private play(key: string, x?: number, z?: number, { vol = 1, after = 0, rate = 1, kind = key, layer = MIX[key]?.[0] ?? 3, far = false } = {}) {
    const takes = SFX[key], ctx = this.ctx, [, level, wet] = MIX[key] ?? [3, 0.5, 0];
    if (!ctx || !this.bank || !takes) return;
    let n = (Math.random() * takes.length) | 0;
    if (takes.length > 1 && n === this.took[key]) n = (n + 1) % takes.length;
    const [at, len] = takes[n], r = rate * (0.94 + Math.random() * 0.12), v = vol * level * LEVEL;
    const o = x === undefined ? { out: this.ui(v), t: ctx.currentTime, short: false } : this.place(kind, layer, x, z!, after + len / r, v, wet, far);
    if (!o) return;
    this.took[key] = n;
    const src = ctx.createBufferSource(); src.buffer = this.bank; src.playbackRate.value = r;
    src.connect(o.out); src.start(o.t + after, at, o.short ? Math.min(len, 1.2) : len);
    if (!o.short) { // a soft release: some takes (an engine, a fire, a jet) are still loud where they were cut, and with a sparse mix you'd hear each one snap off
      const end = o.t + after + len / r, fade = Math.min(0.35, (len / r) * 0.35), g = o.out.gain;
      g.setValueAtTime(g.value, end - fade); g.linearRampToValueAtTime(0, end);
    }
  }

  // A weapon firing from (x, z) at (tx, tz); flight: seconds until a shell or bomb lands. Each family has its own recording and counts as one kind in the mix.
  shot(w: Weapon, x: number, z: number, tx: number, tz: number, flight = 0) {
    if (!this.ctx) return;
    const k = NAME.get(w) ?? 'cannon';
    const fam = k === 'rifle' || k === 'garrison' ? 'rifle' : k === 'mg' || k === 'towerMg' || k === 'sidearm' ? 'mg' : k.includes('lak') ? 'flak'
      : k === 'rocket' || k === 'gunrockets' ? 'rocket' : k === 'heavy' || k === 'colossus' ? 'heavy' : k === 'howitzer' || k === 'grenade' || k === 'bombs' ? k : 'cannon';
    switch (fam) {
      case 'bombs': return this.play('bombs', tx, tz, { after: Math.max(0, flight - 1.4) });
      case 'howitzer':
        this.play('howitzer', x, z);
        if (flight > 2.2) this.play('incoming', tx, tz, { after: flight - 2 }); // (a soft rush overhead just before it lands)
        return;
      case 'heavy': return this.play('cannon', x, z, { vol: 1.25, rate: 0.8, kind: 'heavy' }); // (the same gun, bigger: pitched down)
      case 'cannon': return this.play('cannon', x, z, { vol: k === 'emplacement' ? 1.1 : 1 });
      default: return this.play(fam, x, z, { vol: k === 'sidearm' ? 0.7 : 1 });
    }
  }

  // A blast with weight, by size: about 0.5 (a rocket) to 3 (a dam going up).
  explosion(x: number, z: number, size: number) {
    const k = Math.min(3, Math.max(0.4, size));
    this.play(k < 0.9 ? 'boom_s' : k < 1.8 ? 'boom_m' : 'boom_l', x, z, { vol: Math.min(1.3, 0.45 + k * 0.3), rate: k > 2.4 ? 0.85 : 1, ...(k >= 3 && { layer: 0, far: true }) }); // (3: a superweapon or a reactor going up)
  }

  // A Colossus's footfall: a thud you feel more than hear.
  thud(x: number, z: number) { this.play('footfall', x, z); }

  // One of the world's other moments, at a ground point or (no point) for the player alone: a tree
  // coming down, a building placed or finished, a unit rolling out, a crate, oil, a capture, a strike...
  // (Levels and layers are in MIX; the big moments there are heard from anywhere.)
  fx(key: string, x?: number, z?: number) { this.play(key, x, z, { far: MIX[key]?.[0] === 0 }); }

  // A building falling; ours is heard from anywhere.
  collapse(x: number, z: number, ours = false) { this.play('collapse', x, z, { far: ours }); }

  crunch(x: number, z: number) { this.play('crush', x, z); }

  // A line on screen comes over the radio: the click as they key the mic, the line in the speaker's
  // own voice through a crackly little speaker, the click as they let go. The battle dips under it.
  // So it doesn't wear on you, the radio is kept for what's worth a voice (the text always shows):
  // a building done only the first of its kind; a unit ready never; a click on the same kind of unit gets an
  // answer at most every 15 s, any click every 4 s; orders at most every 4 s, so a burst of
  // right-clicks is answered once; news at most every 12 s; the same words not twice within 6 s.
  voice(who: string, line: string, pri: Pri = 2) {
    const ctx = this.ctx;
    if (!ctx || who === 'Alert') return;
    const v = VOICE[who];
    const say = v ? SAY.find(([re]) => re.test(line)) : undefined, set = say?.[1];
    if (say && !set) return;
    const built = / complete\.$/.test(line);
    if (built && this.builtOnce.has(line)) return;
    if (v && ctx.currentTime < this.talkEnd && pri <= this.talkPri && (pri < 2 || this.talkPri === 2)) return; // someone as important is still talking
    if (pri === 0 && (this.throttle('chat', 4000) || this.throttle('chat:' + v, 15000))) return;
    if (pri === 1 && this.throttle('order', 4000)) return;
    if (pri === 2 && this.throttle('news', 12000)) return;
    if (this.throttle('voice:' + (set?.[0] ?? line), 6000)) return;
    const own = (l: string) => CLIPS[v + '|' + l], mine = (ls?: string[]) => ls?.some(own) ? own(pick(v + ls[0], ls.filter(own))) : undefined;
    const clip = v && this.radio ? mine(set) ?? own(line) ?? mine(ACK[v]) : undefined;
    const o = { out: this.ui(0.5), t: ctx.currentTime };
    this.play('radio_on'); // the mic keyed: a click and a crackle
    let end = o.t + 0.25;
    if (clip) {
      if (built) this.builtOnce.add(line); // (marked once heard, so a first that was talked over gets another chance)
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
    this.play('radio_off', undefined, undefined, { after: end - ctx.currentTime }); // and let go: the squelch
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

  // The world around the fighting, every frame: a soft wind swelling and settling, by night a steady
  // bed of distant frogs and insects (fading in at dusk and out at dawn), by day now and then a wood
  // pigeon. All dip while a battle is heard and creep back after. dark: 0 day to 1 night; playing:
  // off means a menu, where it all plays softer.
  tick(dt: number, dark: number, playing: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.wind) return;
    const t = ctx.currentTime;
    this.heat = Math.min(2, this.heat * Math.exp(-dt / 4));
    const calm = Math.max(0, 1 - this.heat * 1.5), night = Math.min(1, Math.max(0, (dark - 0.35) / 0.3));
    this.amb.gain.setTargetAtTime(playing ? 1 : 0.5, t, 0.5);
    if (t > this.next.gust) {
      this.next.gust = t + 4 + Math.random() * 5;
      this.wind.gain.setTargetAtTime((0.05 + Math.random() * 0.05) * (0.35 + 0.65 * calm), t, 2);
    }
    this.night.gain.setTargetAtTime(0.35 * night * (0.35 + 0.65 * calm), t, 1.5);
    if (night > 0 && t > this.next.night) this.next.night = t + this.ambient('night', 1, this.night, 2) - 2; // (each pass overlaps the last by its fades: one unbroken bed)
    if (t > this.next.life) {
      this.next.life = t + 15 + Math.random() * 20;
      if (night < 0.5 && Math.random() < calm) this.ambient('birds', 0.09 * calm, this.amb, 1);
    }
  }

  // The wind: one recorded loop under everything, its hiss rolled off (as recorded it's a bright rush that reads as running water).
  private startWind() {
    const ctx = this.ctx!, take = SFX.wind?.[0];
    if (!take) return;
    const src = ctx.createBufferSource(); src.buffer = this.bank; src.loop = true; src.loopStart = take[0]; src.loopEnd = take[0] + take[1];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    this.wind = ctx.createGain(); this.wind.gain.value = 0.06;
    this.night = ctx.createGain(); this.night.gain.value = 0; this.night.connect(this.amb);
    src.connect(lp); lp.connect(this.wind); this.wind.connect(this.amb); src.start(0, take[0]);
  }

  // A pass of a recorded ambience, faded in and out over fade seconds, off to one side. Returns its length.
  private ambient(key: string, vol: number, out: AudioNode, fade: number) {
    const ctx = this.ctx!, takes = SFX[key];
    if (!takes) return 10;
    const [at, len] = takes[(Math.random() * takes.length) | 0], t = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
    src.buffer = this.bank; p.pan.value = Math.random() * 1.2 - 0.6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + fade); g.gain.setValueAtTime(vol, t + len - fade); g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g); g.connect(p); p.connect(out); src.start(t, at, len);
    return len;
  }
}

export const audio = new Audio();
