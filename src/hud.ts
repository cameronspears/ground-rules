// On-screen interface: intro card, objective, selection panel, unit chatter, victory card.
import type { Unit } from './game';
import type { Building } from './world';

const $ = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };

const ICONS: Record<string, string> = {
  tank: '<svg viewBox="0 0 40 24"><rect x="2" y="15" width="36" height="7" rx="3.5"/><rect x="5" y="9" width="28" height="7" rx="1"/><rect x="12" y="4" width="13" height="6" rx="1"/><rect x="25" y="6" width="13" height="2.4"/></svg>',
  rifle: '<svg viewBox="0 0 40 24"><circle cx="20" cy="5" r="3.4"/><rect x="16.5" y="9" width="7" height="8" rx="1.5"/><rect x="16.5" y="16" width="2.8" height="7"/><rect x="20.7" y="16" width="2.8" height="7"/><rect x="21" y="11" width="13" height="2"/></svg>',
  mortar: '<svg viewBox="0 0 40 24"><circle cx="9" cy="20" r="3.2"/><circle cx="19" cy="20" r="3.2"/><circle cx="31" cy="20" r="3.2"/><rect x="3" y="12" width="34" height="5" rx="1"/><rect x="27" y="5" width="10" height="8" rx="1"/><rect x="11" y="3" width="3" height="10" transform="rotate(-25 12 8)"/></svg>',
};

export class Hud {
  root = $('<div id="hud"></div>');
  sel = $('<div id="selection"></div>');
  bark = $('<div id="bark"><span class="who"></span><span class="line"></span></div>');
  obj = $('<div id="objective"><div class="kicker">Objective</div><div class="title">Flatten the compound</div><ul></ul></div>');
  box = $('<div id="selbox"></div>');
  bars = document.createElement('canvas');
  ctx = this.bars.getContext('2d')!;
  private barkTimer = 0;
  private lastSelKey = '';

  constructor() {
    document.body.append(this.bars, this.root, this.box);
    this.bars.id = 'bars';
    this.root.append(
      $('<div id="brand"><span>CONQUER</span><small>Field test 01</small></div>'),
      this.obj, this.bark, this.sel,
      $(`<div id="help">
        <div><b>Left-drag</b> select</div><div><b>Right-click</b> move / attack</div>
        <div><b>A</b> + click attack-move</div><div><b>S</b> stop</div>
        <div><b>Arrows</b>, edges or <b>middle-drag</b> pan</div><div><b>Wheel</b> zoom · <b>Q E</b> rotate</div>
        <div><b>Ctrl+1–9</b> make group</div><div><b>Space</b> back to base</div>
      </div>`),
    );
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const d = Math.min(devicePixelRatio, 2);
    this.bars.width = innerWidth * d; this.bars.height = innerHeight * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  intro(onStart: () => void) {
    const el = $(`<div id="intro" class="overlay">
      <div class="poster">
        <div class="stripe"></div>
        <div class="kicker">The Ministry of Progress presents</div>
        <h1>CONQUER</h1>
        <p class="tag">Every building is a suggestion.</p>
        <p class="brief">Field test 01. An enemy compound sits on the far hill.<br>Take your squad and flatten it, block by block.</p>
        <button class="cta">Deploy</button>
        <p class="fine">Turn your sound on.</p>
      </div></div>`);
    document.body.append(el);
    el.querySelector('button')!.addEventListener('click', () => { el.classList.add('out'); setTimeout(() => el.remove(), 500); onStart(); });
  }

  victory(stats: { time: number; blocks: number; lost: number }, onAgain: () => void) {
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60).toString().padStart(2, '0');
    const el = $(`<div id="victory" class="overlay">
      <div class="poster win">
        <div class="stripe"></div>
        <div class="kicker">Ministry bulletin</div>
        <h1>COMPOUND<br>FLATTENED</h1>
        <p class="tag">Property values have never been lower.</p>
        <div class="stats"><div><b>${m}:${s}</b><span>time</span></div><div><b>${stats.blocks.toLocaleString()}</b><span>blocks destroyed</span></div><div><b>${stats.lost}</b><span>units lost</span></div></div>
        <button class="cta">Again</button>
      </div></div>`);
    document.body.append(el);
    el.querySelector('button')!.addEventListener('click', () => { el.remove(); onAgain(); });
  }

  objectives(targets: Building[]) {
    const ul = this.obj.querySelector('ul')!;
    const counts = new Map<string, { n: number; done: number }>();
    for (const b of targets) {
      const c = counts.get(b.name) ?? { n: 0, done: 0 };
      c.n++; if (b.destroyed) c.done++;
      counts.set(b.name, c);
    }
    ul.innerHTML = [...counts].map(([name, c]) =>
      `<li class="${c.done === c.n ? 'done' : ''}"><span class="tick"></span>${name}${c.n > 1 ? ` <em>${c.done}/${c.n}</em>` : ''}</li>`).join('');
  }

  say(who: string, line: string) {
    (this.bark.querySelector('.who') as HTMLElement).textContent = who;
    (this.bark.querySelector('.line') as HTMLElement).textContent = line;
    this.bark.classList.remove('show'); void this.bark.offsetWidth; this.bark.classList.add('show');
    this.barkTimer = 2.8;
  }

  update(dt: number, selected: Unit[]) {
    if (this.barkTimer > 0 && (this.barkTimer -= dt) <= 0) this.bark.classList.remove('show');
    const groups = new Map<string, Unit[]>();
    for (const u of selected) { const a = groups.get(u.type) ?? []; a.push(u); groups.set(u.type, a); }
    const key = [...groups].map(([k, a]) => k + a.length + ':' + Math.round(a.reduce((s, u) => s + u.hp / u.def.hp, 0) / a.length * 20)).join('|');
    if (key === this.lastSelKey) return;
    this.lastSelKey = key;
    this.sel.classList.toggle('empty', selected.length === 0);
    this.sel.innerHTML = [...groups].map(([k, a]) => {
      const hp = a.reduce((s, u) => s + u.hp / u.def.hp, 0) / a.length;
      return `<div class="card"><div class="icon">${ICONS[k]}</div><div class="meta"><div class="name">${a[0].def.name}</div><div class="hp"><i style="width:${hp * 100}%;background:${hp > 0.6 ? '#7dffa0' : hp > 0.3 ? '#ffd24a' : '#ff5a4a'}"></i></div></div><div class="count">×${a.length}</div></div>`;
    }).join('');
  }

  setBox(x0: number, y0: number, x1: number, y1: number, show: boolean) {
    this.box.style.display = show ? 'block' : 'none';
    if (!show) return;
    Object.assign(this.box.style, { left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
  }
}
