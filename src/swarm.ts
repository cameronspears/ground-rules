// SWARM: the second side for Standard (see docs/SWARM.md). Cheap, fast and many: every fighting piece it fields costs a
// third less and is a third weaker, so the same money puts half again as many on the field. Some of its pieces are its
// own, each standing in for one of the army's in the same lane (same key, same factory, same job), so the build menu,
// the computer's plans and the lanes table all hold for both sides.
import { BuildDef } from './build';

export type Side = 'army' | 'swarm';
export const SIDES: Side[] = ['army', 'swarm'];
export const SIDE_NOTE: Record<Side, string> = {
  army: 'THE ARMY: TANKS, GUNSHIPS, THE COLOSSUS. FEWER, TOUGHER MACHINES.',
  swarm: 'THE SWARM: EVERYTHING A THIRD CHEAPER AND A THIRD WEAKER, SO THERE ARE MORE OF THEM, AND A DRONE TRUCK FOR A GUNSHIP. GRENADIERS, QUAD GUNS AND FLAK ARE WHAT BREAK IT.',
};
export const PRICE = 2 / 3, TOUGH = 2 / 3; // the one rule
const WORKERS = new Set(['builder', 'harvester']); // not fighting pieces: the rule leaves them be

// The Swarm's own pieces: what changes from the army's piece of the same key (before the rule)
interface Piece { name: string; hp?: number; speed?: number; turn?: number; radius?: number; weapon?: string; weapon2?: string; air?: boolean; crush?: boolean; track?: number; barks?: { select: string[]; move: string[]; attack?: string[] } }
export const PIECES: Record<string, Piece> = {
  gunship: { name: 'Drone Truck', hp: 420, speed: 34, turn: 1.8, radius: 11, weapon: 'drones', air: false, crush: true, track: 5,
    barks: { select: ['Hive\'s awake.', 'Four birds, one truck.', 'Drones charged.', 'Point and they swarm.', 'Buzzing and ready.', 'Who needs a pilot?'], move: ['Truck rolling.', 'Birds tucked in.', 'Moving the nest.', 'On the move.', 'Keep up, little ones.', 'Rolling heavy.'], attack: ['Release the swarm!', 'Birds out!', 'Go get \'em!', 'Sting \'em!', 'Drones away!', 'Swarm them!'] } },
};
// what the Swarm's own pieces are for, and who they beat (the in-game VS and ROLE text, over the army's)
export const SWARM_ROLE: Record<string, string> = {
  airfield: 'BUILDS DRONE TRUCKS AND BOMBERS.',
  gunship: 'AN ARMOURED TRUCK THAT CARRIES 4 ATTACK DRONES. IN REACH OF AN ENEMY IT SENDS THEM OUT; THEY HUNT ROUND IT AND COME BACK. IT MAKES A NEW ONE EVERY 12 SECONDS FOR EACH LOST. LOSE THE TRUCK AND ITS DRONES FALL.',
};
export const SWARM_VS: Record<string, [string, string]> = {
  gunship: ['EVERY GROUND UNIT', 'FLAK, QUAD GUNS, ROCKETS'],
};
export const SWARM_SHORT: Record<string, [string, string]> = { gunship: ['DRONE TRK', 'DRONES'] }; // the build card's name (at most 7 letters short)
// a drone: launched by a drone truck, it hunts round it and dies with it; the truck makes a new one every REBROOD seconds
export const DRONE = { name: 'Drone', hp: 26, speed: 92, turn: 8, radius: 4, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'drone', air: true, barks: { select: [], move: [] } };
export const BROOD = 4, REBROOD = 12, TETHER = 8; // drones a truck carries; seconds to make a lost one; squares they stray from it

// A unit's numbers for a Swarm side
export function swarmUnit<T extends { name: string; hp: number }>(key: string, d: T): T {
  const p = PIECES[key], u = { ...d, ...(p ?? {}) } as T;
  if (!WORKERS.has(key)) u.hp = Math.round(u.hp * TOUGH);
  return u;
}
// A build card's numbers for a Swarm side (buildings unchanged)
export function swarmBuild(d: BuildDef): BuildDef {
  if (d.kind !== 'unit' || WORKERS.has(d.key)) return d;
  return { ...d, name: PIECES[d.key]?.name ?? d.name, cost: Math.round((d.cost * PRICE) / 5) * 5, time: Math.max(1, Math.round(d.time * PRICE)) };
}
