// WILD WEST: every model with a frontier look, by the key of the model it stands in for (ART, BASE, CIVIC or LIFE in
// art.ts). The game bakes these in place of the originals when the map is a Wild West one; anything not here keeps its usual look.
import { ModelDef } from '../models';
import { UNITS } from './units';
import { BASE } from './base';
import { CIVIC } from './civic';
import { NATION_UNITS } from './nations-units';
import { NATION_BASE } from './nations-base';
export { EXTRAS } from './extras';
export { saguaro, sagebrush } from './nature';
export { TITAN_STRIDE } from './units';

export const WILD: Record<string, () => ModelDef> = { ...UNITS, ...BASE, ...CIVIC };
// The Plains Nations' looks, for a side that plays them (over WILD: anything not here looks as the Settlers' does)
export const NATIONS: Record<string, () => ModelDef> = { ...NATION_UNITS, ...NATION_BASE };
