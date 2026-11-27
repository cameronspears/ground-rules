// WILD WEST: things that move. A model that walks or turns is built once standing still (its body) and again at a few
// moments through its loop (its frames): legs mid-stride, a wheel or a windmill's fan a little further round. The
// game plays the frames while a unit moves, and all the time for a building. While a frame is being built, `pose.t`
// says how far through the loop it is (0 to 1); the rest of the time it's -1 and every model stands still.
import { VB, type ModelDef } from '../models';

export const pose = { t: -1 };

// The model with its frames: built n times through its loop
export function animate(make: () => ModelDef, n = 4): () => ModelDef {
  return () => {
    const def = make();
    def.frames = Array.from({ length: n }, (_, i) => { pose.t = i / n; try { return make().body; } finally { pose.t = -1; } });
    return def;
  };
}
// How far a leg swings at this moment (+1 forward, -1 back, 0 upright), a quarter or half loop out from the others by its phase
export const swing = (phase: number) => (pose.t < 0 ? 0 : Math.round(Math.sin((pose.t + phase) * Math.PI * 2)));
// How far round a wheel has turned, as a share of its loop (0 standing still)
export const turn = () => Math.max(0, pose.t);

// A model drawn for a 2 x 2 plot (47 blocks) set in the middle of a 3 x 3 one (71), its frames too, on a yard that
// yard() lays first (ground and clutter round the edge; the model goes over it)
export function widen(make: () => ModelDef, yard: (b: VB) => void): () => ModelDef {
  return () => {
    const d = make(), off = 12;
    const lay = (v: VB) => { const o = new VB(); yard(o); v.each((x, y, z, c) => o.set(x + off, y, z + off, c)); return o; };
    return { ...d, body: lay(d.body), frames: d.frames?.map(lay), bodyPivot: [d.bodyPivot[0] + off, d.bodyPivot[1], d.bodyPivot[2] + off] };
  };
}
