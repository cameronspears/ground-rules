// WILD WEST: every model with a frontier look, by the key of the model it stands in for (ART, BASE, CIVIC or LIFE in
// art.ts). The game bakes these in place of the originals when the map is a Wild West one; anything not here keeps its usual look.
import { ModelDef } from '../models';
import { UNITS } from './units';
import { BASE } from './base';
import { CIVIC } from './civic';
export { saguaro, sagebrush } from './nature';

export const WILD: Record<string, () => ModelDef> = { ...UNITS, ...BASE, ...CIVIC };
