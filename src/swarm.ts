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
  colossus: { name: 'Hive', speed: 16, weapon: 'drones', // a slow crawler that keeps streaming drones out; keeps the Colossus's flak against aircraft
    barks: { select: ['The Hive stirs.', 'We are many.', 'The swarm waits.', 'Hatches open.', 'Speak, and we pour out.', 'A thousand wings.'], move: ['The Hive crawls.', 'Onward, slowly.', 'We come.', 'Nothing outruns the swarm.', 'Crawling.', 'Make way for the Hive.'], attack: ['Pour out!', 'Swarm them!', 'Bury them in wings!', 'All hatches!', 'Wear them down!', 'Endless!'] } },
  scout: { name: 'Moto Raiders', speed: 62, turn: 5, radius: 7, track: 1, // quicker than the buggy, carries no one
    barks: { select: ['Engines hot.', 'Two bikes, no brakes.', 'Ready to ride.', 'Point the way.', 'Throttle\'s open.', 'We go fast.'], move: ['Ride!', 'Wheelie time.', 'Eat our dust.', 'Gone already.', 'Full throttle.', 'Hang on back there!'], attack: ['Run \'em down!', 'Ride through!', 'Spray and pray!', 'Hit and gone!', 'Circle \'em!', 'Don\'t stop!'] } },
  tank: { name: 'Wolf', hp: 380, speed: 46, turn: 2.8, radius: 10, weapon: 'autocannon', // lighter and quicker than the tank, a fast-firing gun
    barks: { select: ['Wolf\'s hungry.', 'Six wheels, one bite.', 'Pack\'s ready.', 'Light and fast.', 'Smell blood?', 'Wolf crew here.'], move: ['Running.', 'Pack moves.', 'On the hunt.', 'Quick now.', 'Wheels turning.', 'Flank \'em.'], attack: ['Bite!', 'Rip \'em up!', 'Rapid fire!', 'Pack attack!', 'Tear in!', 'Keep firing!'] } },
  artillery: { name: 'Salvo Truck', hp: 180, speed: 30, turn: 1.6, weapon: 'salvo', // a spread of small rockets across an area
    barks: { select: ['Rack\'s loaded.', 'Twelve tubes ready.', 'Name an area.', 'Rockets standing by.', 'Pick a spot.', 'Salvo crew here.'], move: ['Rolling the rack.', 'Moving out.', 'Relocating.', 'Mind the tubes.', 'Shifting.', 'Keep \'em off us.'], attack: ['Salvo!', 'Ripple fire!', 'Rockets out!', 'Fill the sky!', 'Saturate!', 'Here it comes!'] } },
  gunship: { name: 'Drone Truck', hp: 420, speed: 34, turn: 1.8, radius: 11, weapon: 'drones', air: false, crush: true, track: 5,
    barks: { select: ['Hive\'s awake.', 'Four birds, one truck.', 'Drones charged.', 'Point and they swarm.', 'Buzzing and ready.', 'Who needs a pilot?'], move: ['Truck rolling.', 'Birds tucked in.', 'Moving the nest.', 'On the move.', 'Keep up, little ones.', 'Rolling heavy.'], attack: ['Release the swarm!', 'Birds out!', 'Go get \'em!', 'Sting \'em!', 'Drones away!', 'Swarm them!'] } },
};
// what the Swarm's own pieces are for, and who they beat (the in-game VS and ROLE text, over the army's)
export const SWARM_ROLE: Record<string, string> = {
  colossus: 'A GIANT SLOW CRAWLER THAT CARRIES 16 DRONES AND MAKES A NEW ONE EVERY 3 SECONDS FOR EACH LOST: IT WEARS ARMIES DOWN. ITS DRONES BARELY SCRATCH BUILDINGS, AND FLAK TOWERS EAT THEM. FLAK OF ITS OWN KEEPS AIRCRAFT OFF.',
  provingGround: 'BUILDS THE HIVE, A GIANT CRAWLER FULL OF DRONES.',
  scout: 'TWO FAST DIRT BIKES: QUICKER THAN THE ARMY\'S BUGGY. SEES FAR, HUNTS SOLDIERS AND FIELD GUNS, FINDS OIL, SPOTS HIDING UNITS. CARRIES NO ONE. SCOUT (C) SENDS IT EXPLORING ON ITS OWN.',
  tank: 'THE SWARM\'S ARMOUR: A FAST SIX-WHEELED CAR WITH A QUICK CANNON. RUNS DOWN SOLDIERS AND SCOUTS; LOSES TO A TANK HEAD ON, SO HUNT IN PACKS. CARRIES 4 SOLDIERS.',
  artillery: 'A ROCKET TRUCK: ITS SALVO SCATTERS SMALL ROCKETS ACROSS AN AREA, FROM BEYOND THE REACH OF DEFENCES. BREAKS DEFENCES AND CROWDS. HELPLESS UP CLOSE.',
  depot: 'BUILDS VEHICLES: WOLVES, TRUCKS, BIKES AND MORE. BUILD MORE TO BUILD THEM FASTER.',
  airfield: 'BUILDS DRONE TRUCKS AND BOMBERS.',
  gunship: 'AN ARMOURED TRUCK THAT CARRIES 4 ATTACK DRONES. IN REACH OF AN ENEMY IT SENDS THEM OUT; THEY HUNT ROUND IT AND COME BACK. IT MAKES A NEW ONE EVERY 12 SECONDS FOR EACH LOST. LOSE THE TRUCK AND ITS DRONES FALL.',
};
export const SWARM_VS: Record<string, [string, string]> = {
  colossus: ['ARMIES AND ARMOUR', 'ROCKET SWARMS, QUAD GUNS, FLAK TOWERS, EMPLACEMENTS'],
  scout: ['INFANTRY, FIELD GUNS', 'ANYTHING WITH ARMOUR, ROCKETS'],
  tank: ['SCOUTS, INFANTRY, QUAD GUNS', 'ROCKETS, GUNSHIPS, TANKS HEAD ON'],
  artillery: ['DEFENCES AND CROWDS, WITH A SPOTTER', 'ANYTHING THAT REACHES IT'],
  gunship: ['EVERY GROUND UNIT', 'FLAK, QUAD GUNS, ROCKETS'],
};
export const SWARM_SHORT: Record<string, [string, string]> = { colossus: ['HIVE', 'HIVE'], gunship: ['DRONE TRK', 'DRONES'], scout: ['MOTOS', 'MOTOS'], tank: ['WOLF', 'WOLF'], artillery: ['SALVO', 'SALVO'] };
export const SWARM_SEATS: Record<string, number> = { scout: 0 }; // soldiers each carries, where it differs from the army's piece // the build card's name (at most 7 letters short)
// a drone: launched by a drone truck or the Hive, it hunts round it and dies with it; its carrier makes lost ones back (NESTS)
export const DRONE = { name: 'Drone', hp: 26, speed: 92, turn: 8, radius: 4, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'drone', air: true, barks: { select: [], move: [] } };
export const NESTS: Record<string, { brood: number; rebrood: number; tether: number }> = { // who carries drones: how many, seconds to make a lost one, squares they stray from it
  gunship: { brood: 4, rebrood: 12, tether: 8 }, // the drone truck
  colossus: { brood: 16, rebrood: 3, tether: 10 }, // the Hive: a cloud of them, always coming
};

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
