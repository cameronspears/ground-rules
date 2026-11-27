// Saving and loading a battle. The map itself is never saved: it is made again from its seed, and
// only what play changed is kept (squares that flooded, drained or lost a bridge, trees knocked
// down, scrap taken, ground explored). Everything alive (units, buildings, money, the computer
// players' plans) is written out as one object graph: units and buildings by id, anything shared
// (a wave's member list, a marauder camp a computer player has spotted) once, then by reference.
// Stored gzipped in IndexedDB; a small note of each slot sits in localStorage for the menus.

export const SAVE_VERSION = 3; // raise it whenever the map generator changes: a save is the seed plus what play changed, so an old save over a new map lays its roads and changes in the wrong places (2: the playable diamond; 3: the Wild West, bunkers clear of the moat, no wrecks or watchtowers)
export type Slot = 'save' | 'auto';
export interface SaveMeta { v: number; seed: number; players: number; size: number; rules?: string; front?: boolean; west?: boolean; time: number; at: number } // rules: its game mode (named on CONTINUE); front: from FRONT LINE, a mode since cut (such a save can't be loaded); west: a WILD WEST desert

// ---- the object graph ----
const GONE = Symbol('gone'); // a reference to something no longer in the battle: left out of lists, null in a field
type Tagged = Record<string, any>;
export interface Codec {
  isUnit(v: object): boolean; unitId(v: object): number; units: Map<number, object>; // every unit in the battle, by id
  blds: object[]; consts: Map<object, string>; byConst: Map<string, object>; // objects that are made again identically (unit and building specs, the map's own pieces)
  classes: Record<string, new () => object>; // classes kept with their methods (fields restored onto a fresh one)
}
const round = (v: number) => (Number.isInteger(v) ? v : Number.isFinite(v) ? Math.round(v * 1000) / 1000 : { '@n': String(v) });
const isBld = (v: any) => 'cx' in v && 'cy' in v && 'rise' in v && 'type' in v;

export function encoder(c: Codec) {
  const bldNo = new Map(c.blds.map((b, i) => [b, i]));
  const seen = new Map<object, { out: any; id: number }>(); let ids = 0;
  const enc = (v: any): any => {
    if (typeof v === 'number') return round(v);
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    const k = c.consts.get(v); if (k) return { '@c': k };
    if (c.isUnit(v)) return { '@u': c.unitId(v) };
    if (ArrayBuffer.isView(v)) return { '@t': v.constructor.name, r: rle(v as Uint8Array) };
    const was = seen.get(v);
    if (was) { // met before: point back to it
      if (!was.id) { was.id = ++ids; if (Array.isArray(was.out)) was.out.unshift({ '@id': was.id }); else was.out['@id'] = was.id; }
      return { '@r': was.id };
    }
    if (v instanceof Set) { const out: Tagged = { '@s': [] }; seen.set(v, { out, id: 0 }); for (const x of v) { const e = enc(x); if (e !== undefined) out['@s'].push(e); } return out; }
    if (v instanceof Map) { const out: Tagged = { '@m': [] }; seen.set(v, { out, id: 0 }); for (const [a, b] of v) out['@m'].push([enc(a), enc(b) ?? null]); return out; }
    if (Array.isArray(v)) { const out: any[] = []; seen.set(v, { out, id: 0 }); for (const x of v) out.push(enc(x) ?? null); return out; }
    if (isBld(v)) return { '@b': bldNo.get(v) ?? -1 };
    const cls = v.constructor && v.constructor !== Object ? Object.keys(c.classes).find((n) => c.classes[n] === v.constructor) : '';
    if (cls === undefined) return undefined; // pictures, canvases and the like are never saved
    const out: Tagged = cls ? { '@k': cls } : {}; seen.set(v, { out, id: 0 });
    for (const key of Object.keys(v)) { const e = enc(v[key]); if (e !== undefined) out[key] = e; }
    return out;
  };
  return { enc, body: (v: any, skip: string[] = []) => { const out: Tagged = {}; for (const key of Object.keys(v)) if (!skip.includes(key)) { const e = enc(v[key]); if (e !== undefined) out[key] = e; } return out; } };
}

export function decoder(c: Codec) {
  const made = new Map<number, any>();
  const dec = (v: any): any => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      const out: any[] = [];
      let i = 0; if (v[0] && typeof v[0] === 'object' && !Array.isArray(v[0]) && '@id' in v[0] && Object.keys(v[0]).length === 1) { made.set(v[0]['@id'], out); i = 1; }
      for (; i < v.length; i++) { const x = dec(v[i]); if (x !== GONE) out.push(x); }
      return out;
    }
    if ('@n' in v) return Number(v['@n']);
    if ('@c' in v) return c.byConst.get(v['@c']) ?? GONE;
    if ('@u' in v) return c.units.get(v['@u']) ?? GONE;
    if ('@b' in v) return c.blds[v['@b']] ?? GONE;
    if ('@r' in v) return made.get(v['@r']) ?? GONE;
    if ('@t' in v) return unrle(v['@t'], v.r);
    if ('@s' in v) { const out = new Set(); if ('@id' in v) made.set(v['@id'], out); for (const x of v['@s']) { const d = dec(x); if (d !== GONE) out.add(d); } return out; }
    if ('@m' in v) { const out = new Map(); if ('@id' in v) made.set(v['@id'], out); for (const [a, b] of v['@m']) { const k = dec(a), d = dec(b); if (k !== GONE) out.set(k, d === GONE ? null : d); } return out; }
    const out: any = v['@k'] ? new c.classes[v['@k']]() : {};
    if ('@id' in v) made.set(v['@id'], out);
    fill(out, v);
    return out;
  };
  const fill = (into: any, v: Tagged) => { for (const key of Object.keys(v)) if (key[0] !== '@') { const d = dec(v[key]); into[key] = d === GONE ? null : d; } return into; };
  return { dec, fill };
}

// run-length code for the big per-square tables (fog, flood map): mostly long runs of one value
function rle(a: ArrayLike<number>) { const out: number[] = []; for (let i = 0; i < a.length;) { const v = a[i]; let n = 1; while (i + n < a.length && a[i + n] === v) n++; out.push(v, n); i += n; } return out; }
function unrle(kind: string, r: number[]) {
  let n = 0; for (let i = 1; i < r.length; i += 2) n += r[i];
  const C = ({ Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array } as Record<string, any>)[kind] ?? Float64Array, out = new C(n);
  for (let i = 0, p = 0; i < r.length; i += 2) { out.fill(r[i], p, p + r[i + 1]); p += r[i + 1]; }
  return out;
}
// the squares where a table differs from how the map began, as gaps and values
export function diff(now: ArrayLike<number>, was: ArrayLike<number>) { const out: number[] = []; let last = 0; for (let i = 0; i < now.length; i++) if (now[i] !== was[i]) { out.push(i - last, now[i]); last = i; } return out; }
export function patch(into: { set(a: ArrayLike<number>): void; [i: number]: number }, was: ArrayLike<number>, d: number[]) { into.set(was); for (let k = 0, i = 0; k < d.length; k += 2) { i += d[k]; into[i] = d[k + 1]; } }
export { rle, unrle };

// ---- storage: gzipped JSON in IndexedDB ----
const db = () => new Promise<IDBDatabase>((ok, fail) => { const r = indexedDB.open('conquer', 1); r.onupgradeneeded = () => r.result.createObjectStore('saves'); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise<T>((ok, fail) => { const tx = d.transaction('saves', mode), r = f(tx.objectStore('saves')); tx.oncomplete = () => { ok(r.result as T); d.close(); }; tx.onerror = tx.onabort = () => { fail(tx.error); d.close(); }; });
}
export async function writeSave(slot: Slot, meta: SaveMeta, json: string) {
  const blob = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  await idb('readwrite', (s) => s.put({ meta, blob }, slot));
  const all = saveMetas(); all[slot] = meta;
  try { localStorage.setItem('conquer-saves', JSON.stringify(all)); } catch {}
  return blob.size;
}
export async function readSave(slot: Slot): Promise<{ meta: SaveMeta; data: any }> {
  const rec = await idb<{ meta: SaveMeta; blob: Blob } | undefined>('readonly', (s) => s.get(slot));
  if (!rec) throw new Error('no save');
  const data = JSON.parse(await new Response(rec.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text());
  if (data?.v !== SAVE_VERSION) throw new Error('old save');
  return { meta: rec.meta, data };
}
export function saveMetas(): Partial<Record<Slot, SaveMeta>> { try { return JSON.parse(localStorage.getItem('conquer-saves') || '{}') ?? {}; } catch { return {}; } }
export function forgetSave(slot: Slot) { const all = saveMetas(); delete all[slot]; try { localStorage.setItem('conquer-saves', JSON.stringify(all)); } catch {} }
