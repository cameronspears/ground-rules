// WILD WEST: things that move. A model that walks or turns is built once standing still (its body) and again at a few
// moments through its loop (its frames): legs mid-stride, a wheel or a windmill's fan a little further round. The
// game plays the frames while a unit moves, and all the time for a building. While a frame is being built, `pose.t`
// says how far through the loop it is (0 to 1); the rest of the time it's -1 and every model stands still.
import type { ModelDef } from '../models';

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
