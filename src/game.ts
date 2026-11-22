// The game: a big painted map, pre-rendered pixel sprites, and the pixel-art interface,
// all drawn into one small frame that is blown up with hard square pixels.
import * as THREE from 'three';
import { Terrain, SIZES, T, CELL, N, LIFT, YAW, YC, YS, SQ, SW, SH, MAP as MAPSIZE, CH, toScreen, toGround, shadeHex, MINI, VIEW, fromMini } from './terrain';
import { hash3 } from './hash';
const vnoise2 = (x: number, y: number) => (Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) + Math.sin(y * 0.09 + Math.sin(x * 0.05) * 2)) * 0.25 + 0.5; // a cheap wavy pattern for new water
import { bake, facing, Sprite, LIT_FALL, SUNS } from './bake';
import { ART, CIVIC, LIFE, BASE, pine, broadleaf, stump } from './art';
import { BUILDS, DEF, POWER, Production, BuildDef, UPLINK_TIME, INTERCEPT_RANGE, INTERCEPT_RELOAD, SCRAP_LOAD, HARVEST_RATE, UNLOAD_RATE, LAND_RATE, MARAUDER } from './build';
import { AI, Level, Plan, LEVELS } from './ai';
import { SAVE_VERSION, Slot, Codec, encoder, decoder, diff, patch, rle, unrle, writeSave, readSave, saveMetas, forgetSave } from './save';
import { teamColors, ModelDef, VB } from './models';
import { findPath, roadRoute, pathStats, clear as clearLine } from './path';
import { Territory } from './territory';
import { audio } from './audio';
import { text, textWidth } from './font';
import { WEAPONS, BLD_HP, DEFENCE, Shell, Blast, Tracer, Weapon, Armour, drawBlast, drawShell, drawTracer } from './combat';
import { C, panel, rivets, inset, button, Button, cursor, bar, glass } from './ui';

let SB = 150; // the side panel's width in panel pixels: set to fill the screen's height (see resize)
// Who beats whom, measured in equal-cost fights; shown on every tooltip so the system can be learned at a glance.
const VS: Record<string, [string, string]> = {
  rifle: ['ROCKET SOLDIERS', 'GRENADIERS, SCOUTS, ALL ARMOUR'],
  rocket: ['VEHICLES, AIRCRAFT', 'RIFLEMEN, GRENADIERS, GUARD TOWERS'],
  grenadier: ['RIFLEMEN, ROCKET SOLDIERS, BUNKERS', 'SCOUTS, VEHICLES, AIRCRAFT'],
  scout: ['INFANTRY, FIELD GUNS', 'ROCKETS, TANKS, GUNSHIPS, BUILDINGS'],
  tank: ['SCOUTS, INFANTRY', 'ROCKETS, JUGGERNAUTS, GUNSHIPS'],
  juggernaut: ['TANKS AND ALL GROUND BUT ROCKETS', 'ROCKETS, GUNSHIPS, EMPLACEMENTS'],
  artillery: ['DEFENCES AND CROWDS, WITH A SPOTTER', 'ANYTHING THAT REACHES IT'],
  flak: ['AIRCRAFT', 'EVERY GROUND UNIT'],
  gunship: ['EVERY GROUND UNIT', 'FLAK, ROCKETS'],
  bomber: ['BUILDINGS', 'FLAK, ROCKETS. CAN\'T HIT UNITS'],
  colossus: ['ARMIES AND ARMOUR', 'ROCKET SWARMS, EMPLACEMENTS'],
  harvester: ['', 'EVERYTHING. KEEP IT GUARDED'],
  builder: ['A LONE SOLDIER (SMALL GUN)', 'ANY REAL FORCE. KEEP IT GUARDED'],
  guardTower: ['INFANTRY', 'VEHICLES, ARTILLERY, BOMBERS'],
  emplacement: ['VEHICLES, EVEN THE COLOSSUS', 'INFANTRY, ARTILLERY, AIRCRAFT'],
  flakTower: ['AIRCRAFT', 'EVERY GROUND UNIT'],
  interceptor: ['THE ORBITAL STRIKE', 'EVERYTHING ELSE'],
  wall: ['FUNNELLING ATTACKERS', 'HEAVY GUNS'],
};
// What each thing is for, shown on the build panel's tooltip.
const ROLE: Record<string, string> = {
  generator: 'POWER +100. CHEAP TO BUILD. SHORT OF POWER, EVERYTHING SLOWS.',
  scrapyard: 'COMES WITH A SALVAGER. SCRAP IS YOUR MAIN EARLY INCOME.',
  barracks: 'TRAINS INFANTRY. MORE BARRACKS TRAIN FASTER.',
  wall: 'CHEAP BLOCKS. FUNNEL ATTACKERS INTO YOUR GUNS. ACROSS A ROAD: A ROADBLOCK.',
  guardTower: 'MACHINE GUN NEST. SHREDS INFANTRY, SPOTS HIDDEN UNITS, WEAK TO ARMOUR. 3 DEFENCES TOGETHER TAKE 25% LESS DAMAGE.',
  fieldCommand: 'A TOWN CENTRE: FACTORIES AND OIL INSIDE ITS CIRCLE WORK 25% FASTER. RADAR, BUILDERS, A SMALL ALLOWANCE.',
  depot: 'BUILDS VEHICLES. MORE DEPOTS BUILD FASTER.',
  workshop: 'HEAVY WEAPONS: UNLOCKS FIELD GUNS, JUGGERNAUTS, THE REACTOR AND PROVING GROUND. REPAIRS VEHICLES NEARBY.',
  derrick: 'ON STRUCK OIL: FREE POWER AND STEADY MONEY.',
  emplacement: 'TANK STOPPER: OUTRANGES EVERY TANK, EVEN THE COLOSSUS. 3 DEFENCES TOGETHER TAKE 25% LESS DAMAGE.',
  reactor: 'POWER +400, A HUGE BLAST IF DESTROYED.',
  airfield: 'BUILDS AIRCRAFT.',
  flakTower: 'ANTI-AIR GUN. CANNOT HIT GROUND TARGETS. 3 DEFENCES TOGETHER TAKE 25% LESS DAMAGE.',
  radar: 'PICKS UP EVERY ENEMY IN A WIDE RING AS A RADAR BLIP (NOT WHAT IT IS). FIELD GUNS FIRE ON BLIPS. SPOTS HIDDEN UNITS NEARBY. NEEDS POWER.',
  builder: 'PUTS UP BUILDINGS IN THE ORDER YOU PLACE THEM, AND REPAIRS. A SMALL GUN KEEPS A LONE SOLDIER OFF IT.',
  rifle: 'CHEAP INFANTRY. CAPTURES SITES, GARRISONS BUNKERS. HIDES STANDING STILL IN FOREST.',
  rocket: 'KILLS TANKS AND AIRCRAFT. WEAK TO RIFLEMEN.',
  grenadier: 'BREAKS UP INFANTRY CROWDS, CLEARS BUNKERS.',
  scout: 'FAST AND FAR-SIGHTED. HUNTS INFANTRY, FINDS OIL, SPOTS HIDDEN UNITS. CARRIES 2 SOLDIERS. SCOUT (C) SENDS IT EXPLORING ON ITS OWN.',
  harvester: 'COLLECTS SCRAP FOR MONEY. KEEP IT SAFE.',
  tank: 'ALL-ROUND ARMOUR. BEST AGAINST VEHICLES AND BUILDINGS. CARRIES 4 SOLDIERS ON A LONG MARCH.',
  flak: 'MOBILE ANTI-AIR. ESCORT YOUR ARMY. CARRIES 2 SOLDIERS.',
  bomber: 'BUILDING BREAKER: A LINE OF HEAVY BOMBS. NEARLY HARMLESS TO UNITS. FLAK EATS IT.',
  colossus: 'SUPER-UNIT ARMY BREAKER: CRUSHES TANKS AND ARMIES. MASS ROCKETS OR EMPLACEMENTS TO STOP ONE.',
  provingGround: 'BUILDS THE COLOSSUS.',
  interceptor: 'SHOOTS DOWN AN ORBITAL STRIKE AIMED NEARBY. HOLDS TWO, RELOADS SLOWLY.',
  artillery: 'LONG-RANGE GUN. OUTRANGES DEFENCES. HELPLESS UP CLOSE.',
  juggernaut: 'HUGE HEAVY TANK. RUNS OVER INFANTRY. CARRIES 6 SOLDIERS ON A LONG MARCH.',
  gunship: 'UNIT HUNTER FROM THE AIR: ROCKETS TANKS AND INFANTRY. WEAK AGAINST BUILDINGS.',
};
// The word under each build button, so look-alike pictures can't be mixed up. At most 7 letters: that's all a button holds.
const SHORT: Record<string, string> = {
  generator: 'POWER', scrapyard: 'SCRAP', barracks: 'BARRACK', wall: 'WALL', guardTower: 'GUARD', fieldCommand: 'COMMAND', depot: 'DEPOT',
  workshop: 'REPAIR', derrick: 'OIL', flakTower: 'FLAK', radar: 'RADAR', airfield: 'AIRBASE', emplacement: 'CANNON',
  interceptor: 'INTERCP', provingGround: 'PROVING', reactor: 'FUSION',
  builder: 'BUILDER', rifle: 'RIFLE', rocket: 'ROCKET', grenadier: 'GRENADE', scout: 'SCOUT', gunship: 'GUNSHIP',
  bomber: 'BOMBER', colossus: 'COLOSS', harvester: 'SALVAGE', flak: 'FLAK', tank: 'TANK', artillery: 'FLD GUN', juggernaut: 'JUGGER',
};
const GB = Math.ceil(N / 4); // unit-grid buckets per side
const ALT = 26; // how high aircraft fly, in screen pixels
// where smoke leaves a building: [x, z, height, puffs per second]
const VENTS: Record<string, [number, number, number, number]> = { generator: [29, 18, 36, 5], scrapyard: [9, 9, 40, 3] }; // width of the side panel, in panel pixels

// The map's paint workers start the moment the game's code loads, so they load their own code while
// the map is being made (instead of only starting once it's ready)
const EARLY: Worker[] = (() => { try { const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)); return Array.from({ length: n }, () => new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}` })); } catch { return []; } })();
const TEAMS = [teamColors(0x4a78a8), teamColors(0xb04434), teamColors(0x8a8a82), teamColors(0x4f8a3a), teamColors(0xc0902a), teamColors(0x7a4a8a)]; // you (blue), red, neutral (grey), green, gold, marauders (purple)
const CAMO = new Set(['rifle', 'rocket', 'grenadier', 'artillery']); // who can hide still in forest
const DETECT: Record<string, number> = { near: 2.5, scout: 6, guardTower: 6, radar: 12 }; // spotting reach, in squares
const RADAR_R = 30, SWEEP = 1.6, TAU = Math.PI * 2; // radar reach in squares, and its sweep (radians a second: once round about every four seconds)
const SIGHT_SCALE = 1.3; // fog of war a bit wider: everyone sees about a third further
const SIGHT: Record<string, number> = { tank: 6, builder: 7, rifle: 5, rocket: 5, grenadier: 5, juggernaut: 6, wall: 1, reactor: 5, gunship: 7, flak: 6, radar: 7, flakTower: 6, airfield: 6, colossus: 8, provingGround: 5, interceptor: 6, bomber: 7, scout: 9, artillery: 4, harvester: 4, workshop: 4, fieldCommand: 8, guardTower: 7, emplacement: 7, commTower: 24, powerPlant: 4, repairYard: 4 }; // how far each thing sees, in squares
const SITE_GUNS: Record<string, number> = { uplink: 3, fuelDepot: 3, powerPlant: 2, motorPool: 2, commTower: 1, repairYard: 1, recruitOffice: 1 }; // marauder guns round each prize (town halls are left in peace)
const CAMP_BOUNTY = 1500; // paid for clearing a marauder camp
const BOOM: Record<string, [number, number]> = { derrick: [90, 1300], generator: [80, 1100] }; // what blows up when destroyed: reach in pixels, damage at the middle
const FIRE_SPREAD = 0.024; // chance each half second a burning square lights each wooded neighbour
// Soldiers that can ride on the outside of each kind of vehicle for a long march
const SEATS: Record<string, number> = { tank: 4, juggernaut: 6, scout: 2, flak: 2 };
const GROUND = ['type', 'elev', 'forest', 'occupied', 'scrap'] as const; // the map's tables that play changes
const AUTOSAVE = 180; // seconds of play between automatic saves
// the Game's own fields a save keeps (alongside units, buildings, the map's changes and the computer players)
const SAVED = ['time', 'stats', 'level', 'mode', 'ally', 'out', 'vx', 'vy', 'goalX', 'goalY', 'divisions', 'divT', 'prods', 'powers', 'seen', 'idleCycle', 'jobSeq', 'waitNo', 'placing', 'selBld', 'buildTab',
  'endCheck', 'vis', 'town', 'fort', 'fallen', 'reshaped', 'strikes', 'shells', 'crates', 'claimT', 'crateT', 'hadHub', 'lastStand', 'raided', 'lastLinked', 'lastHubs', 'cutT',
  'burning', 'fireT', 'dams', 'drains', 'recedes', 'floodMask', 'floods', 'camps', 'marauderT', 'cloakT', 'told', 'goalDone', 'idleCash', 'unlockT', 'okBefore'];
const PATH_WORK = 60000, REPLAN = 12000; // REPLAN: a quick re-plan on the move searches less than a fresh order
const hash1 = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }; // a steady random number for a seed
// One full day every ten minutes, starting mid-morning: the first dusk comes about four minutes in,
// and a 35-minute match sees three or four nights. Phase 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.
const DAY_LEN = 720, DAY_START = 0.32, SUN_STEPS = 200; // a full day and night: 12 minutes (a shadow moves one step every 1.8 seconds)
// the day's three suns (bake.ts SUNS) on the turned ground: toward the sun along the ground x and y, and up
const SUN_GROUND = SUNS.map((v) => [YC * v.x + YS * v.z, -YS * v.x + YC * v.z, v.y]);
const BAKED = [1 / 1.7, 0.9 / 1.7]; // where the art's baked shadows fall: screen pixels right and down per pixel of height (see bake.ts SUN)
// The light at each time of day, as a colour the world is multiplied by (white = untouched). Night
// stays bright enough to read every unit: it shifts blue more than it darkens.
const SKY: [number, number, number, number][] = [
  [0.0, 112, 128, 186], [0.2, 116, 130, 188], [0.25, 196, 168, 196], [0.3, 236, 222, 226], [0.36, 252, 250, 255],
  [0.62, 255, 254, 250], [0.7, 255, 230, 190], [0.75, 252, 204, 178], [0.785, 200, 140, 172], [0.83, 124, 132, 190], [1.0, 112, 128, 186],
];
const LAST_STAND = 60; // seconds to raise or take a Field Command after losing the last one
const TOWN = 9, FORT = 6; // town-centre reach and fortified-line spacing, in squares
const DOT = ['#6ab8ff', '#ff5a40', '#d8d4c8', '#7ad860', '#ffc040', '#d07ae0']; // each side's colour on the radar and icons
const FLAG = [['#5a8ac0', '#3a5a80'], ['#c85040', '#8a3428'], ['#d8d4c8', '#9a968a'], ['#5a9a40', '#3a6a28'], ['#d0a038', '#8a6a20'], ['#a060b0', '#6a3a78']];
// how many sides and whether it's teams, read before the map is made (the map's symmetry depends on it)
function storedPlayers() { try { const n = Number(localStorage.getItem('conquer-players')); return n >= 2 && n <= 4 ? n : 2; } catch { return 2; } }
const CAR_PAINT = [0xc8a840, 0x5a7a9a, 0x8a3a2a, 0xd8d4c8].map(teamColors);
const SHIRTS = [0xa86a3a, 0x6a8a5a, 0xc8c0a8].map(teamColors);
// What each capturable site does once your infantry take it.
const HIGH: Record<string, Weapon> = Object.fromEntries(Object.entries(WEAPONS).map(([k, w]) => [k, { ...w, range: w.range * 1.15 }])); // a weapon fired from a plateau: 15% more reach
const GLOW_T = 2.5; // seconds newly won ground glows
const SITE_REACH = 7; // a captured site's own reach: it claims the land round it and links your buildings nearby
const CAPTURE: Record<string, { name: string; tip: string; garrison?: number }> = {
  motorPool: { name: 'Motor Pool', tip: 'CAPTURE: DELIVERS A TANK, THEN ONE EVERY 90S' },
  recruitOffice: { name: 'Recruiting Office', tip: 'CAPTURE: 3 RIFLEMEN, THEN 2 EVERY 60S' },
  bunker: { name: 'Bunker', tip: 'GARRISON UP TO 3 INFANTRY TO FIRE FROM COVER', garrison: 3 },
  watchtower: { name: 'Watchtower', tip: 'GARRISON 2 INFANTRY: HIGH GROUND, LONG SIGHT', garrison: 2 },
  fuelDepot: { name: 'Fuel Depot', tip: 'CAPTURE: PAYS $8 A SECOND WHILE YOU HOLD IT' },
  uplink: { name: 'Orbital Uplink', tip: 'CAPTURE AND HOLD: CHARGES AN ORBITAL STRIKE EVERY 3 MINUTES. SELECT IT, RIGHT-CLICK A TARGET' },
  townHall: { name: 'Town Hall', tip: 'CAPTURE: THE TOWN TRADES WITH YOU, $5 A SECOND' },
  powerPlant: { name: 'Power Plant', tip: 'CAPTURE: +250 FREE POWER WHILE YOU HOLD IT' },
  dam: { name: 'Hydro Dam', tip: 'CAPTURE: +400 FREE POWER WHILE YOU HOLD IT. BLOW IT (EXPLOSIVES) AND THE VALLEY FLOODS' },
  commTower: { name: 'Comm Tower', tip: 'CAPTURE: SEE FAR ACROSS THE MAP' },
  repairYard: { name: 'Repair Yard', tip: 'CAPTURE: REPAIRS YOUR UNITS PARKED NEARBY' },
};

interface UnitDef {
  name: string; hp: number; speed: number; turn: number; radius: number; crush: boolean; vehicle: boolean; facings: number; track: number; weapon?: string; air?: boolean; weapon2?: string; // weapon2: a second gun that fires on its own
  barks: { select: string[]; move: string[] };
}
const DEFS: Record<string, UnitDef> = {
  tank: {
    name: 'Battle Tank', hp: 400, speed: 30, turn: 2.2, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon: 'cannon',
    barks: { select: ['Armour\'s warm.', 'Point me at something.', 'Smile for the brochure.'], move: ['Rolling.', 'Mind the paint.', 'Out of my way, scenery.'] },
  },
  harvester: {
    name: 'Salvager', hp: 600, speed: 22, turn: 1.6, radius: 11, crush: true, vehicle: true, facings: 32, track: 5,
    barks: { select: ['One man\'s wreck...', 'Scrap is money.', 'Salvager ready.'], move: ['Off to find treasure.', 'Moving out.', 'Heavy load, slow road.'] },
  },
  builder: {
    name: 'Builder', hp: 500, speed: 22, turn: 1.8, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon2: 'sidearm',
    barks: { select: ['Hard hat on.', 'What are we building?', 'Measure twice, shell once.'], move: ['On my way.', 'Mind the paintwork.', 'Bringing the toolbox.'] },
  },
  rocket: {
    name: 'Rocket Soldier', hp: 50, speed: 13, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'rocket',
    barks: { select: ['Got a tin can for me?', 'Tube\'s loaded.', 'Armour? Lovely.'], move: ['Moving.', 'Heavy tube, short legs.', 'On my way.'] },
  },
  scout: {
    name: 'Scout Buggy', hp: 180, speed: 52, turn: 4, radius: 8, crush: false, vehicle: true, facings: 32, track: 2, weapon: 'mg',
    barks: { select: ['Wheels up!', 'Fastest thing out here.', 'Where to, boss?'], move: ['Floor it!', 'Hold on to something.', 'Yee-haw.'] },
  },
  artillery: {
    name: 'Field Gun', hp: 200, speed: 17, turn: 1.4, radius: 10, crush: false, vehicle: true, facings: 32, track: 4, weapon: 'howitzer',
    barks: { select: ['Give me coordinates.', 'Gun crew standing by.', 'Long way to be dangerous.'], move: ['Relocating the gun.', 'Slow and steady.', 'Keep the scouts close.'] },
  },
  grenadier: {
    name: 'Grenadier', hp: 70, speed: 13, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'grenade',
    barks: { select: ['Pin\'s in. For now.', 'Who\'s hiding?', 'Got a present for them.'], move: ['Moving.', 'Mind the satchel.', 'Right behind you.'] },
  },
  juggernaut: {
    name: 'Juggernaut', hp: 1800, speed: 18, turn: 1.1, radius: 13, crush: true, vehicle: true, facings: 32, track: 7, weapon: 'heavy',
    barks: { select: ['The ground shakes.', 'Juggernaut, awake.', 'Who needs a door?'], move: ['Advancing.', 'Nothing stops us.', 'Clear the road.'] },
  },
  gunship: {
    name: 'Gunship', hp: 280, speed: 56, turn: 3, radius: 9, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'gunrockets', air: true,
    barks: { select: ['Rotors turning.', 'Eyes in the sky.', 'Where do you want the rain?'], move: ['Inbound.', 'Low and fast.', 'Over the river we go.'] },
  },
  flak: {
    name: 'Flak Truck', hp: 260, speed: 30, turn: 1.8, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon: 'flak',
    barks: { select: ['Watching the skies.', 'Flak ready.', 'Anything with rotors.'], move: ['Rolling.', 'Keeping up.', 'Moving the guns.'] },
  },
  bomber: {
    name: 'Bomber', hp: 420, speed: 54, turn: 1.6, radius: 12, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'bombs', air: true,
    barks: { select: ['Bomb bay loaded.', 'Mark the target.', 'Heavy payload.'], move: ['Inbound.', 'Holding course.', 'On the bomb run.'] },
  },
  colossus: {
    name: 'Colossus', hp: 9000, speed: 12, turn: 0.6, radius: 22, crush: true, vehicle: true, facings: 32, track: 9, weapon: 'colossus', weapon2: 'colossusFlak',
    barks: { select: ['The earth trembles.', 'Colossus awaits.', 'Point. I will flatten.'], move: ['Advancing. Clear the way.', 'Nothing stands.', 'Onward.'] },
  },
  rifle: {
    name: 'Rifleman', hp: 75, speed: 15, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'rifle',
    barks: { select: ['Reporting, mostly intact.', 'Yes, Commander?', 'I read the pamphlet!'], move: ['On it.', 'Moving, moving!', 'Hup hup.'] },
  },
};

let nextId = 1;
class Unit {
  id = nextId++; gone = false; hp: number; heading = Math.PI * 1.75; tHead = Math.PI * 1.75;
  path: [number, number][] = []; goal: [number, number] | null = null;
  squeeze = 0; // until when it's squeezing past someone in a tight spot
  selected = false; moving = false; trackAcc = 0; stuck = 0; bob = 0; scan = 0; scanTo = 0; dust = 0; enter: Bld | null = null;
  cargo = 0; unloading = false; // salvagers
  home: [number, number] | null = null; // marauders: the spot they guard and drift back to
  hitAt = -99; // when it last took damage (home ground repairs only out of the fight)
  queue: [number, number][] = []; pace = 0; avoid = 0; progT = 0; px0 = 0; py0 = 0; // progT: watching for a unit that has a route but isn't getting anywhere // avoid: times it gave up on a goal
  strike: Unit | Bld | null = null; // marching on this target, to hit it once there
  ride: Unit | null = null; seat = 0; riders: Unit[] = []; wave: { members: Unit[]; first: number } | null = null; mopUp: [number, number] | null = null; gather: { members: Unit[]; first: number; go: [number, number]; released: boolean } | null = null; // infantry riding on a vehicle for a long march (and the vehicle's passengers)
  buildSite: Bld | null = null; hold = false; rest = 0; // builders: the construction site they're working on; hold: sent somewhere by you, so it rests there a while (until rest) before taking the next job // waypoints still to visit; group pace (0 = own speed)
  cloak = 0; firedAt = -99; // cloak: which alliances can't see it right now (a bit each); firedAt: when it last shot
  face: number | null = null; // the way to turn once it arrives (the front of its formation)
  xp = 0; reload2 = 0; target2: Unit | Bld | null = null; // veterancy: the damage it has dealt; the second gun
  get rank() { const m = this.def.hp; return this.xp >= m * 8 ? 3 : this.xp >= m * 3 ? 2 : this.xp >= m ? 1 : 0; } // a rank for dealing its own health in damage, then three and eight times it (kills went only to the last hit, so 95% of units never ranked)
  fallBack = false; scouting = false; flankT = 0; // falling back: running home, not shooting, harder to hit; flankT: when 'FLANKED' last showed over it
  target: Unit | Bld | null = null; forced = false; amove = false; reload = 0; scanT = Math.random() * 0.3; chase = 0; chaseTo: [number, number, [number, number] | undefined] | null = null; // combat (chaseTo: the target's spot when its chase route was planned, and that route's end)
  constructor(public type: string, public def: UnitDef, public team: number, public x: number, public y: number) { this.hp = def.hp; }
}
interface Tree { x: number; y: number; v: number; fall: number; dir: number; i: number } // i: its place in the map's own list (for saving)
interface Bld { gone?: boolean; job?: number; fails?: number; blocked?: number; type: string; team: number; cx: number; cy: number; w: number; h: number; name: string; garrison: number; timer: number; rise: number; rally: [number, number] | null; pw?: number;
  hp: number; max: number; reload: number; tHead: number; target: Unit | Bld | null; dying: number; seen?: boolean;
  cleared?: boolean; drive?: boolean; face?: number; holder?: number; ammo?: number; idle?: number } // idle: seconds a marked site has waited for a builder // interceptors in stock
// Civilians, cars and animals going about their day.
interface Agent { kind: string; x: number; y: number; heading: number; look: Sprite[]; speed: number; home: [number, number]; goal: [number, number] | null; wait: number; scared: number; route?: [number, number][]; ri?: number; dir?: number; step: number; hidden?: number; shelter?: boolean; doors?: [number, number][]; streets?: (ax: number, ay: number, bx: number, by: number) => [number, number][]; stuckT?: number; tries?: number; lx?: number; ly?: number } // hidden: sheltering indoors; shelter: running for a door
type Look = { body: Sprite[]; turret?: Sprite[]; def: ModelDef };

export class Game {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  // the interface has its own layer and pixel size, independent of the battlefield's zoom
  hud = document.createElement('canvas');
  hctx = this.hud.getContext('2d')!;
  kH = 3; HW = 640; HH = 360;
  seed = (() => { let s = 0; try { s = Number(sessionStorage.getItem('conquer-seed')); sessionStorage.removeItem('conquer-seed'); } catch {} return s || Number(new URLSearchParams(location.search).get('seed')) || (Math.random() * 1e9) | 0; })(); // a new map every game (?seed=N in the address picks one, for testing; a save being loaded hands its own over)
  players = storedPlayers();
  terrain = ((t0) => { const t = new Terrain(this.seed, this.players); genMs = Math.round(performance.now() - t0); return t; })(performance.now());
  ground0 = GROUND.map((k) => this.terrain[k].slice()); // the map's tables as made: a save keeps only what play changed
  units: Unit[] = [];
  trees: Tree[][] = Array.from({ length: N }, () => []); // by cell row
  blds: Bld[] = [];
  // Baked pictures. Only what the title screen shows is baked before it; the rest bakes in the
  // background while you're on the menu, and anything asked for before its turn is baked there and then.
  bakeLater = new Map<string, () => void>(); // a picture's name -> the job that bakes it
  private lazy<V>(pre = ''): Record<string, V> { const o: Record<string, V> = {}; return new Proxy(o, { get: (_, k) => { if (typeof k === 'string' && !(k in o)) this.bakeLater.get(pre + k)?.(); return o[k as string]; }, has: (_, k) => { if (typeof k === 'string' && !(k in o)) this.bakeLater.get(pre + k)?.(); return k in o; } }); }
  looks: Record<string, Look> = this.lazy<Look>();
  treeLooks: { stand: Sprite; fall: Sprite[][] }[] = [];
  stumpLook: Sprite;
  lifeLooks: Record<string, Sprite[]> = {};
  agents: Agent[] = [];
  birds: { x: number; y: number; vx: number; vy: number; n: number; seed: number }[] = [];
  hoverBld: Bld | null = null;
  FW = 640; FH = 360; k = 3; zoomStep = Number(this.setting('zoom', '0')) || 0;
  vx = 0; vy = 0; goalX = 0; goalY = 0;
  state: 'loading' | 'title' | 'play' | 'paused' | 'won' | 'lost' = 'loading';
  level: Level = (() => { try { return (localStorage.getItem('conquer-level') as Level) || 'normal'; } catch { return 'normal'; } })();
  // skirmish settings, kept between games
  setting(k: string, d: string) { try { return localStorage.getItem('conquer-' + k) ?? d; } catch { return d; } }
  store(k: string, v: string) { try { localStorage.setItem('conquer-' + k, v); } catch {} }
  mode = this.setting('mode', 'ffa'); size = ((v) => (SIZES.includes(v) ? v : N))(Number(this.setting('size', String(N)))); money = Number(this.setting('money', '6000')); plan = this.setting('plan', 'random'); hints = this.setting('hints', 'on') === 'on';
  ai: AI | null = null; ais: AI[] = []; out = new Set<number>(); // computer players; sides knocked out
  menuRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
  loadStep = 0; loadTotal = 1;
  mouse = { x: 0, y: 0, hx: 0, hy: 0, down: false, sx: 0, sy: 0, drag: false, mid: false, last: 0, in: false, onMap: false, rdown: false, rsx: 0, rsy: 0 }; // rdown, rsx, rsy: a right-drag and where it began (map pixels)
  keys = new Set<string>();
  divisions: ({ units: Unit[]; fresh: Unit[]; since: number; feed: boolean } | null)[] = [{ units: [], fresh: [], since: 0, feed: true }, null, null, null, null]; divT = 0; // up to five standing divisions, on keys 1-5. The 1st starts empty and takes every new fighting unit, so your army is one card from the first soldier
  prods = [0, 1, 2, 3, 4, 5].map(() => new Production()); // per side (2, neutral, is unused)
  get prod() { return this.prods[0]; }
  powers = [0, 1, 2, 3, 4, 5].map(() => ({ made: 0, used: 0 }));
  // how well a side's power covers what it uses: short of power, everything runs that much slower
  powerEff(team: number) { const p = this.powers[team]; return p.used <= p.made ? 1 : Math.max(0.25, p.made / p.used); }
  get power() { return this.powers[0]; }
  pathBudget = 30; // routes that may be planned this frame
  planFrom: [number, number] | null = null; // the planner: the ground point where a drag of wall or buildings started
  seen = { x0: 0, y0: 0, x1: -1, y1: -1 }; // the box (in squares) round all the ground you've ever seen: the camera keeps to it
  placeWhy = ''; // why the building in hand can't go where the cursor is
  idleCycle = 0; sellArm: Bld | null = null; sellT = 0; helpT = 0; jobSeq = 0; waitNo = new Map<Bld, number>(); // waitNo: each waiting job's place in line (shown on its site)
  placing: BuildDef | null = null;  // a finished structure waiting to be put down
  selBld: Bld | null = null;
  icons: Record<string, Sprite> = this.lazy<Sprite>('icon:');
  buildTab: 'structure' | 'unit' = 'structure';
  slots: { def: BuildDef; x: number; y: number; w: number; h: number }[] = [];
  tabs: { id: 'structure' | 'unit'; x: number; y: number; w: number; h: number }[] = [];

  gushers: { x: number; y: number; t: number; big: boolean }[] = [];
  shells: Shell[] = []; blasts: Blast[] = []; tracers: Tracer[] = []; fires: { x: number; y: number; t: number; s: number }[] = [];
  attackMode = false;
  endCheck = 1;
  vis = new Uint8Array(N * N); // your side's view: 0 never seen, 1 seen before, 2 in sight now
  fogT = 0; fogMini = document.createElement('canvas');
  town = new Set<Bld>(); fort = new Set<Bld>(); // town centre and fortified line bonuses (see updateLand)
  territory = new Territory(); landT = 0; landMini = document.createElement('canvas'); // who owns what, and its picture on the radar
  stats = { built: [0, 0, 0, 0, 0, 0], lost: [0, 0, 0, 0, 0, 0], razed: [0, 0, 0, 0, 0, 0], time: 0 }; // razed[t]: buildings team t destroyed
  bark = { who: '', line: '', t: 0 };
  markers: { x: number; y: number; t: number }[] = [];
  words: { x: number; y: number; t: number; s: string }[] = []; // short words rising off the battlefield (FLANKED)
  gained: { cells: number[]; t: number; x: number; y: number; pay: number }[] = []; // ground you just won: it glows and says what it earns
  buttons: Button[] = [];
  // The menu for the current screen: title, pause, or the end of a battle.
  get menuItems(): { id: string; label: string }[] {
    const sound = { id: 'sound', label: `SOUND: ${this.sound ? 'ON' : 'OFF'}` };
    if (this.state === 'title') return [...this.loadItems(), { id: 'deploy', label: 'DEPLOY' }, { id: 'level', label: `ENEMY: ${this.level.toUpperCase()}` }, { id: 'players', label: `OPPONENTS: ${storedPlayers() - 1}` }, ...(storedPlayers() === 4 ? [{ id: 'mode', label: this.mode === 'teams' ? 'TEAMS: 2 V 2' : 'FREE FOR ALL' }] : []), { id: 'plan', label: `ENEMY PLAN: ${this.plan.toUpperCase()}` },
      { id: 'size', label: `MAP: ${({ [SIZES[0]]: 'MEDIUM', [SIZES[1]]: 'LARGE', [SIZES[2]]: 'HUGE' } as Record<number, string>)[this.size] ?? 'LARGE'}` }, { id: 'money', label: `MONEY: $${this.money}` }, { id: 'newmap', label: 'NEW MAP' },
      { id: 'hints', label: `HINTS: ${this.hints ? 'ON' : 'OFF'}` }, sound];
    if (this.state === 'paused') return [{ id: 'resume', label: 'RESUME' }, { id: 'save', label: this.saveNote() }, { id: 'restart', label: 'RESTART' }, sound, { id: 'quit', label: 'QUIT TO TITLE' }];
    return [{ id: 'restart', label: 'PLAY AGAIN' }, { id: 'quit', label: 'TITLE SCREEN' }];
  }
  inMenu() { return this.state === 'title' || this.state === 'paused' || this.state === 'won' || this.state === 'lost'; }
  menuHot = 0; sound = true; time = 0;
  loadReport: Record<string, unknown> = {}; // how long loading took, for keeping it fast
  workerFirst: number[] = []; loadFirst = 0; // when each paint worker first answered; how many chunks the title waited for
  puffs: { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string; s: number; g?: number }[] = [];
  shakeAt = 0;
  clouds = makeClouds();
  shadowLayer = document.createElement('canvas');
  sctx = this.shadowLayer.getContext('2d')!;

  constructor(host: HTMLElement) {
    host.append(this.canvas, this.hud);
    Object.assign(this.hud.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none' });
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();
    addEventListener('visibilitychange', () => { if (document.hidden) void this.saveGame('auto'); }); // leaving the page (or switching away) keeps the battle
    this.load();
    (window as any).game = this;
  }

  // ------------------------------------------------------------------ loading
  async load() {
    const t = this.terrain;
    let slot: Slot | null = null, saved: any = null, readMs = 0;
    try { slot = sessionStorage.getItem('conquer-load') as Slot | null; sessionStorage.removeItem('conquer-load'); } catch {}
    if (slot) {
      const t0 = performance.now(); this.resuming = true;
      saved = await readSave(slot).then((r) => r.data, () => null);
      if (saved && (saved.seed !== this.seed || saved.size !== N || saved.players !== this.players)) saved = null;
      if (saved) { try { this.applyGround(saved); } catch { saved = null; } }
      if (!saved) { this.loadNote = 'THAT SAVE COULD NOT BE LOADED'; forgetSave(slot); }
      readMs = Math.round(performance.now() - t0);
    }
    const jobs: (() => void)[] = [], later: { keys: string[]; run: () => void }[] = []; // later: baked after the title (or when first asked for)
    for (const [key, make] of Object.entries(ART))
      for (const team of ['tank', 'artillery', 'juggernaut'].includes(key) ? [...this.sides, 2] : ['rifle', 'rocket', 'scout'].includes(key) ? [...this.sides, MARAUDER] : this.sides) later.push({ keys: [key + team, ...(key === 'fieldCommand' && team === 0 ? ['icon:' + key] : [])], run: () => {
        const def = make(), n = DEFS[key]?.facings ?? 1;
        this.looks[key + team] = { def, body: bake(def, 'body', { facings: n, team: TEAMS[team], yaw: n === 1 ? YAW : 0, lit: n === 1 }), turret: def.turret ? bake(def, 'turret', { facings: n, team: TEAMS[team] }) : undefined };
        if (key === 'fieldCommand' && team === 0) this.icons[key] = bake(def, 'body', { team: TEAMS[0], yaw: YAW, scale: 0.3 })[0];
      } });
    const variants: ModelDef[] = [pine(1), pine(2), pine(3), pine(4), broadleaf(5), broadleaf(6)];
    for (const def of variants) jobs.push(() => {
      const fall: Sprite[][] = [];
      for (let dir = 0; dir < 4; dir++) {
        const a = (dir * Math.PI) / 2 + YAW, axis = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)); // fall directions on the turned map
        fall.push([0.5, 1.0, 1.5].map((ang) => bake(def, 'body', { tilt: { axis, angle: ang } })[0]));
      }
      this.treeLooks.push({ stand: bake(def, 'body', { lit: true })[0], fall });
    });
    jobs.push(() => { this.stumpLook = bake(stump(), 'body')[0]; });
    for (const [key, make] of Object.entries(CIVIC)) jobs.push(() => {
      const def = make(), teams = CAPTURE[key] || /^dam\d$/.test(key) ? [...this.sides, 2] : [2]; // (a whole dam can be captured: drawn in every side's colours)
      for (const team of teams) this.looks[key + team] = { def, body: bake(def, 'body', { team: TEAMS[team], yaw: YAW, lit: true }) };
    });
    for (const [key, make] of Object.entries(BASE)) later.push({ keys: [...(['guardTower', 'emplacement'].includes(key) ? [...this.sides, MARAUDER] : this.sides).map((tm) => key + tm), 'icon:' + key], run: () => {
      const def = make();
      for (const team of ['guardTower', 'emplacement'].includes(key) ? [...this.sides, MARAUDER] : this.sides) this.looks[key + team] = { def, body: bake(def, 'body', { team: TEAMS[team], yaw: YAW, lit: true }), turret: def.turret ? bake(def, 'turret', { facings: 32, team: TEAMS[team] }) : undefined }; // guns that turn
      this.icons[key] = bake(def, 'body', { team: TEAMS[0], yaw: YAW, scale: 0.3 })[0];
    } });
    jobs.push(() => {
      for (const kind of ['car', 'pickup']) CAR_PAINT.forEach((paint, i) => { const def = LIFE[kind](); this.lifeLooks[kind + i] = bake(def, 'body', { facings: 16, team: paint }); });
      SHIRTS.forEach((shirt, i) => { this.lifeLooks['civilian' + i] = bake(LIFE.civilian(), 'body', { facings: 8, team: shirt }); });
      for (const kind of ['cow', 'deer']) this.lifeLooks[kind] = bake(LIFE[kind](), 'body', { facings: 8 });
    });
    // every later job, filed under the names of the pictures it makes (icons as 'icon:<key>')
    for (const job of later) { let done = false; const go = () => { if (done) return; done = true; for (const k of job.keys) this.bakeLater.delete(k); job.run(); }; for (const k of job.keys) this.bakeLater.set(k, go); }
    this.loadTotal = t.chunkCount + jobs.length;
    // the map is painted by background workers while the sprites are baked here
    const t0 = performance.now();
    let mapAt = 0;
    const painting = this.paintInWorkers(saved && typeof saved.G.vx === 'number' ? [saved.G.vx + this.worldW() / 2, saved.G.vy + this.FH / 2] : undefined).then(() => { mapAt = performance.now() - t0; });
    const slow: [number, number][] = [];
    for (let j = 0; j < jobs.length; j++) { const s = performance.now(); jobs[j](); slow.push([j, performance.now() - s]); this.loadStep++; await nextFrame(); }
    const spritesAt = performance.now() - t0;
    this.buildMountains(); // (while the painters finish: it needs only the map, and the title waits on them anyway)
    const mountainsMs = performance.now() - t0 - spritesAt;
    await painting;
    t.finish();
    slow.sort((a, b) => b[1] - a[1]);
    this.loadReport = { totalMs: Math.round(performance.now() - t0), spritesMs: Math.round(spritesAt), mapMs: Math.round(mapAt), slowestJobs: slow.slice(0, 5).map(([j, ms]) => `${j}:${Math.round(ms)}`), jobs: jobs.length, jobsMs: Math.round(slow.reduce((a, b) => a + b[1], 0)), mountainsMs: Math.round(mountainsMs), firstChunks: this.loadFirst, workerFirstMs: this.workerFirst, genMs, sincePageStart: Math.round(performance.now()) };
    this.populate();
    this.state = 'title';
    if (saved) {
      const t0 = performance.now();
      try { this.restore(saved); Object.assign(this.loadReport, { readSaveMs: readMs, restoreMs: Math.round(performance.now() - t0) }); }
      catch (e) { console.error(e); forgetSave(slot!); try { sessionStorage.setItem('conquer-note', 'THAT SAVE COULD NOT BE LOADED'); } catch {} location.reload(); return; } // half-restored is no good: start clean
    }
    void this.bakeRest();
    let skip = false;
    try { skip = sessionStorage.getItem('conquer-skip') === '1'; sessionStorage.removeItem('conquer-skip'); } catch {}
    if (skip) this.menu('deploy'); // 'restart' goes straight back into battle
  }

  // The pictures not yet baked, a few at a time between frames, while you're on the menu
  async bakeRest() {
    const t0 = performance.now();
    while (this.bakeLater.size) {
      const s = performance.now();
      while (this.bakeLater.size && performance.now() - s < 12) this.bakeLater.values().next().value!();
      await new Promise((r) => setTimeout(r, 0));
    }
    this.loadReport.bakeRestMs = Math.round(performance.now() - t0);
  }

  paintInWorkers(focus?: [number, number]): Promise<void> { // focus: the middle of the opening view, in map pixels (your base, or where a loaded save was looking)
    const t = this.terrain, n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)); // leave a core or two for the game itself
    return new Promise((done) => {
      const [bx, by] = focus ?? toScreen(t.bases[0][0] * CELL, t.bases[0][1] * CELL), todo = t.neededChunks(bx, by);
      // start once the chunks the opening view can show are painted (with a margin); the rest carries on in the background
      const vw = this.worldW() + CH * 2, vh = this.FH + CH * 2, near = todo.filter((i) => { const cx = (i % t.cw) * CH, cy = Math.floor(i / t.cw) * CH - 24; return cx < bx + vw / 2 && cx + CH > bx - vw / 2 && cy < by + vh / 2 && cy + CH > by - vh / 2; });
      const first = new Set(near.length ? near : todo.slice(0, 12)); this.loadFirst = first.size;
      let left = first.size, started = false;
      const map = t.toData();
      this.loadTotal += first.size - t.chunkCount;
      try {
        // one shared queue, the opening view's chunks first: each worker takes the next as it finishes
        // one (this Mac's kind of chip mixes fast and slow cores: fixed shares left the title waiting on the slowest)
        const queue = [...todo.filter((i) => first.has(i)), ...todo.filter((i) => !first.has(i))];
        for (let w = 0; w < n && queue.length; w++) {
          const worker = EARLY.shift() ?? new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}` });
          const born = performance.now();
          worker.onmessage = (e) => {
            if (this.workerFirst[w] === undefined) this.workerFirst[w] = Math.round(performance.now() - born); // (for the load report)
            t.putChunk(e.data.i, e.data.d, e.data.glints);
            if (first.has(e.data.i)) { this.loadStep++; if (--left === 0 && !started) { started = true; done(); } }
            const next = queue.shift();
            if (next === undefined) worker.terminate(); else worker.postMessage({ chunks: [next], keep: true });
          };
          worker.postMessage({ seed: t.seed, players: t.players, chunks: [queue.shift()!], map, keep: true });
        }
        for (const w of EARLY.splice(0)) w.terminate(); // (any not needed)
      } catch {
        // no workers: paint here instead
        t.prepare();
        for (const i of todo) { t.paintChunk(i); this.loadStep++; }
        done();
      }
    });
  }

  // Each bridge is a neutral structure over its deck: anyone may blow it (on purpose), and it falls
  // into the river taking whatever is on it; any side's builders may rebuild it where it stood.
  lookKey(b: Bld) { return (b.type === 'dam' || b.type === 'damRuin' ? b.type + (b.face ?? 0) : b.type) + b.team; } // which baked picture a building uses (a dam, whole or breached, faces the way its water runs)
  addBridges() {
    const t = this.terrain;
    for (const bx of t.bridgeCols) {
      let y0 = N, y1 = -1; for (let y = 0; y < N; y++) if (t.type[t.idx(bx, y)] === T.BRIDGE) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (y1 < 0) continue;
      this.addBld('bridge', 2, bx, y0, 2, y1 - y0 + 1, 'Bridge');
      for (let y = y0; y <= y1; y++) for (const x of [bx, bx + 1]) t.occupied[t.idx(x, y)] = 0; // a deck you drive over, not a block in the way
    }
  }
  fallen: { cx: number; cy: number; w: number; h: number; cells: [number, number][] }[] = []; repaintVer = 0; chunkVer: number[] = [];
  reshaped = new Map<number, number>(); // squares whose ground changed in play (fallen bridges, receded floods), for the painters
  breakBridge(b: Bld) {
    const t = this.terrain, cells: [number, number][] = [];
    for (let y = b.cy; y < b.cy + b.h; y++) {
      const wet = t.type[t.idx(b.cx - 1, y)] === T.WATER || t.type[t.idx(b.cx + b.w, y)] === T.WATER;
      for (let x = b.cx; x < b.cx + b.w; x++) { const i = t.idx(x, y); t.type[i] = wet ? T.WATER : T.DIRT; t.occupied[i] = 0; cells.push([i, t.type[i]]); }
    }
    const lost = new Set(cells.filter(([, ty]) => ty === T.WATER).map(([i]) => i));
    for (const u of [...this.units]) if (!u.def.air && lost.has(t.idx(t.cellOf(u.x), t.cellOf(u.y)))) {
      const [sx, sy] = this.scr(u); for (let k = 0; k < 8; k++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 12, y: sy - 2, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, t: 0, life: 0.7, c: '#d8ecf4', s: 1, g: 60 });
      this.killUnit(u);
    }
    this.fallen.push({ cx: b.cx, cy: b.cy, w: b.w, h: b.h, cells });
    for (const [i, ty] of cells) this.reshaped.set(i, ty);
    this.repaintSquares(cells.map(([i]) => i), () => this.timbers(b));
    this.landT = 0;
    this.warn('A bridge has fallen into the river!', this.posOf(b));
  }
  timbers(b: { cx: number; cy: number; w: number; h: number }) { // broken timbers left standing on each bank
    if (!this.fallen.some((o) => o.cx === b.cx && o.cy === b.cy)) return; // already rebuilt
    for (const y of [b.cy, b.cy + b.h - 1]) for (let x = b.cx; x < b.cx + b.w; x++) for (let k = 0; k < 3; k++) {
      const [sx, sy] = toScreen((x + 0.25 + k * 0.25) * CELL, (y + 0.5) * CELL), h = 3 + ((x * 7 + k * 3 + y) % 4);
      for (let j = 0; j < h; j++) for (const o of [0, 1]) this.terrain.dot(Math.round(sx + o), Math.round(sy - j), j === h - 1 ? '#8a6a44' : o ? '#3a2a1c' : '#5a4430');
    }
  }
  mendBridge(b: Bld) {
    const t = this.terrain, f = this.fallen.find((o) => o.cx === b.cx && o.cy === b.cy); if (!f) return;
    for (const [i] of f.cells) { t.type[i] = T.BRIDGE; this.reshaped.delete(i); }
    for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) t.occupied[t.idx(x, y)] = 0;
    this.fallen = this.fallen.filter((o) => o !== f);
    b.team = 2; b.hp = b.max;
    this.repaintSquares(f.cells.map(([i]) => i));
    this.landT = 0;
    if (this.sees(...this.posOf(b))) this.bark = { who: 'Builder', line: 'The bridge is back up.', t: 3 };
  }
  // repaint a few squares (and their banks) as they are now, in the background
  repaintSquares(cells: number[], after?: () => void) {
    const t = this.terrain, mask = new Set<number>();
    for (const i of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = (i % N) + dx, y = Math.floor(i / N) + dy; if (t.inside(x, y)) mask.add(t.idx(x, y)); }
    const changed = [...this.reshaped], chunks = t.chunksOver((i) => mask.has(i)), ver = ++this.repaintVer;
    for (const i of chunks) this.chunkVer[i] = ver; // only the newest repaint of a piece counts (an older one may arrive later)
    try {
      const worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}` });
      worker.onmessage = (e) => { if (this.chunkVer[e.data.i] === ver) t.putLayer(e.data.i, e.data.d); if (e.data.i === chunks[chunks.length - 1]) { worker.terminate(); after?.(); } }; // baked in, like a drained lake
      worker.postMessage({ seed: t.seed, players: t.players, chunks, mode: 'patch', drained: [...t.drained], cells: changed, mask: [...mask] });
    } catch { /* no workers: it still happens, just isn't drawn */ }
  }
  fallenAt(gx: number, gy: number) { const cx = this.terrain.cellOf(gx), cy = this.terrain.cellOf(gy); return this.fallen.find((f) => cx >= f.cx && cx < f.cx + f.w && cy >= f.cy && cy < f.cy + f.h && !this.blds.some((b) => b.type === 'bridge' && b.cx === f.cx && b.cy === f.cy)); }
  rebuildBridge(f: { cx: number; cy: number; w: number; h: number }, team: number, crew: Unit[]) {
    this.addBld('bridge', team, f.cx, f.cy, f.w, f.h, 'Bridge');
    const b = this.blds[this.blds.length - 1]; this.startSite(b);
    for (let y = f.cy; y < f.cy + f.h; y++) for (let x = f.cx; x < f.cx + f.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
    for (const u of crew) this.assignSite(u, b);
    return b;
  }
  populate() {
    const t = this.terrain, pt: Record<string, number> = {}; let pm = performance.now(); const mark = (k: string) => { const n = performance.now(); pt[k] = Math.round(n - pm); pm = n; }; // (step times, for the load report)
    t.trees.forEach(([x, y], i) => this.trees[Math.floor(y / CELL)].push({ x, y, v: (hash1(i) * this.treeLooks.length) | 0, fall: -1, dir: 0, i }));
    for (const row of this.trees) row.sort((a, b) => a.y - b.y);
    mark('trees');
    for (const team of this.sides) { const [bx, by] = t.bases[this.baseOf(team)]; this.addUnit('builder', team, bx * CELL, by * CELL); } // every side starts with one Builder and its credits
    for (const u of this.units) if (u.team !== 0) u.heading = u.tHead = Math.PI * 0.75;
    for (const st of t.sites) this.addBld(st.kind, 2, st.cx, st.cy, st.w, st.h, CAPTURE[st.kind]?.name ?? 'House');
    mark('sites');
    this.placeMarauders();
    mark('marauders');
    this.looks['dam2'] = this.looks['dam02']; // anything that asks for a plain dam's look gets the first facing
    for (const d of t.dams) { // dams: neutral, but anyone may blow one up
      for (let y = d.y; y < d.y + 2; y++) for (let x = d.x; x < d.x + 2; x++) t.occupied[t.idx(x, y)] = 0;
      this.addBld('dam', 2, d.x, d.y, 2, 2, 'Hydro Dam');
      const b = this.blds[this.blds.length - 1], k = this.dams.length;
      b.face = d.face;
      this.dams.push({ b, zone: d.zone, burst: false, ux: d.ux, uy: d.uy, lake: d.lake });
      for (const i of d.zone) this.floodMask[i] = k + 1;
    }
    this.addBridges();
    mark('bridges');
    for (const d of t.derelicts) { const u = this.addUnit(d.type, 2, (d.x + 0.5) * CELL, (d.y + 0.5) * CELL); u.hp = u.def.hp * 0.4; u.heading = u.tHead = Math.random() * 6.283; }
    for (let k = 0; k < 3; k++) this.dropCrates(k === 0);
    mark('derelictsCrates');
    this.spawnLife();
    mark('life');
    t.hideOil();
    mark('oil');
    const [bx, by] = t.bases[0];
    this.centre(bx * CELL, by * CELL); this.vx = this.goalX; this.vy = this.goalY;
    this.loadReport.populate = pt;
  }

  // Put a structure down on the nearest free, level ground to a cell (used to set up bases).
  autoPlace(key: string, team: number, cx0: number, cy0: number, rising = false): boolean {
    const d = DEF[key];
    for (let r = 0; r < 8; r++) for (let a = 0; a < 16; a++) {
      const cx = Math.round(cx0 + Math.cos((a / 16) * Math.PI * 2) * r), cy = Math.round(cy0 + Math.sin((a / 16) * Math.PI * 2) * r);
      if (this.fits(key, cx, cy)) { this.addBld(key, team, cx, cy, d.w!, d.h!, d.name); if (rising) this.blds[this.blds.length - 1].rise = 0; return true; }
    }
    return false;
  }
  // Would this building fit exactly here? (open, level ground; a square's gap from other buildings)
  fits(key: string, cx: number, cy: number) {
    const d = DEF[key], t = this.terrain;
    let e = -1;
    for (let y = cy - 1; y <= cy + d.h!; y++) for (let x = cx - 1; x <= cx + d.w!; x++) {
      if (!t.inside(x, y)) return false;
      const i = t.idx(x, y), inside = x >= cx && x < cx + d.w! && y >= cy && y < cy + d.h!;
      if (t.occupied[i]) return false;
      if (inside && (t.elev[i] === 1 || (t.type[i] !== 0 && t.type[i] !== 1))) return false; // forest is fine: the builder clears it
      if (inside) { if (e < 0) e = t.elev[i]; else if (t.elev[i] !== e) return false; }
    }
    return true;
  }

  addUnit(type: string, team: number, x: number, y: number) { const u = new Unit(type, DEFS[type], team, x, y); this.units.push(u); return u; }
  addBld(type: string, team: number, cx: number, cy: number, w: number, h: number, name: string) {
    const hp = BLD_HP[type] ?? 0; // civilian and capturable buildings can't be destroyed (hp 0)
    this.blds.push({ type, team, cx, cy, w, h, name, garrison: 0, timer: 0, rise: 1, rally: null, hp, max: hp, reload: 0, tHead: Math.PI * 0.75, target: null, dying: -1 });
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
      const i = this.terrain.idx(x, y);
      this.terrain.occupied[i] = 1; this.terrain.forest[i] = 0;
    }
  }

  // ------------------------------------------------------------------ saving
  // See save.ts. What's kept: the map's changes, every unit and building, and the fields below.
  // Pictures, effects and anything worked out afresh each second (territory, the unit grid) are not.
  loadNote = (() => { try { const n = sessionStorage.getItem('conquer-note') ?? ''; sessionStorage.removeItem('conquer-note'); return n; } catch { return ''; } })(); // why a save didn't load (shown on the title)
  saving = false; resuming = false; savedAt = -99; nextAuto = AUTOSAVE; saveReport: Record<string, number> = {};
  newestSave(): Slot | null { const m = saveMetas(); return m.save && (!m.auto || m.save.at >= m.auto.at) ? 'save' : m.auto ? 'auto' : null; }
  loadItems() {
    const m = saveMetas(), newest = this.newestSave(), clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (!newest) return [];
    return [{ id: 'continue', label: `CONTINUE ${clock(m[newest]!.time)}` }, ...(m.save && newest !== 'save' ? [{ id: 'loadsave', label: `LOAD SAVE ${clock(m.save.time)}` }] : [])];
  }
  saveNote() { return this.saving ? 'SAVING...' : this.time - this.savedAt < 2 ? 'GAME SAVED' : 'SAVE GAME'; }
  codec(units: Map<number, object>): Codec {
    const consts = new Map<object, string>(), t = this.terrain as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(DEF)) consts.set(v, 'D' + k);
    for (const [k, v] of Object.entries(DEFS)) consts.set(v, 'U' + k);
    for (const [k, v] of Object.entries(LEVELS)) consts.set(v, 'L' + k);
    for (const [k, v] of Object.entries(WEAPONS)) consts.set(v, 'W' + k);
    for (const [k, v] of Object.entries(t)) if (k !== 'oil' && Array.isArray(v) && v.length < 5000) v.forEach((x, i) => { if (x && typeof x === 'object') consts.set(x, `T${k}.${i}`); }); // the map's own pieces (sites, dams, bases...)
    this.terrain.dams.forEach((d, i) => consts.set(d.zone, `Z${i}`)); // a dam's valley (floods point at it)
    return { isUnit: (v) => v instanceof Unit, unitId: (v) => (v as Unit).id, units, blds: this.blds, consts, byConst: new Map([...consts].map(([o, k]) => [k, o])), classes: { Production } as Record<string, new () => object> };
  }
  snapshot() {
    const t = this.terrain, { enc, body } = encoder(this.codec(new Map())), me = this as unknown as Record<string, unknown>;
    const present = new Uint8Array(t.trees.length), fell: number[] = [];
    for (const row of this.trees) for (const tr of row) { present[tr.i] = 1; if (tr.fall >= 0) fell.push(tr.i, Math.round(tr.fall * 100) / 100, tr.dir); }
    return {
      v: SAVE_VERSION, seed: this.seed, players: this.players, size: N,
      ground: GROUND.map((k, j) => diff(t[k], this.ground0[j])), drained: [...t.drained], trees: { r: rle(present), fell },
      U: this.units.map((u) => body(u, ['def'])),
      B: this.blds.map((b) => body(b)),
      G: Object.fromEntries([...SAVED.map((k) => [k, enc(me[k])]), ['oil', enc(t.oil)]]),
      AI: this.ais.map((ai) => body(ai, ['g'])),
    };
  }
  applyGround(s: any) { // the map's tables as play left them
    const t = this.terrain;
    GROUND.forEach((k, j) => patch(t[k], this.ground0[j], s.ground[j]));
    t.drained = new Set(s.drained);
    if (s.showIce) for (let i = 0; i < t.type.length; i++) if (t.type[i] === T.FORD && this.ground0[0][i] === T.WATER) t.type[i] = T.WATER; // a save from before winter was cut, made while the rivers were frozen: they thaw
  }
  restore(s: any) {
    const t = this.terrain, me = this as unknown as Record<string, unknown>;
    this.applyGround(s); // (again: setting up the map's sites and bridges marked it)
    const units = new Map<number, Unit>();
    this.units = s.U.map((f: any) => { if (!DEFS[f.type]) throw new Error('unknown unit ' + f.type); const u = new Unit(f.type, DEFS[f.type], f.team, 0, 0); units.set(f.id, u); return u; });
    nextId = Math.max(nextId, ...s.U.map((f: any) => f.id + 1));
    this.blds = s.B.map(() => ({}));
    const { dec, fill } = decoder(this.codec(units));
    s.U.forEach((f: any, i: number) => fill(this.units[i], f));
    s.B.forEach((f: any, i: number) => fill(this.blds[i], f));
    for (const k of SAVED) if (k in s.G) me[k] = dec(s.G[k]);
    t.oil = dec(s.G.oil);
    this.ais = s.AI.map((f: any) => fill(new AI(this, this.level, f.me), f)); this.ai = this.ais.find((a) => a.me === 1) ?? this.ais[0] ?? null;
    const present = unrle('Uint8Array', s.trees.r), fell = new Map<number, number>();
    for (let k = 0; k < s.trees.fell.length; k += 3) fell.set(s.trees.fell[k], k);
    for (let r = 0; r < N; r++) this.trees[r] = this.trees[r].filter((tr) => { const k = fell.get(tr.i); if (k !== undefined) { tr.fall = s.trees.fell[k + 1]; tr.dir = s.trees.fell[k + 2]; } return present[tr.i]; });
    // the pictures play had painted onto the map: stumps, flood water, struck oil, fallen bridges, drained lakes
    t.trees.forEach(([x, y], i) => { if (present[i] || t.type[t.idx(t.cellOf(x), t.cellOf(y))] === T.WATER) return; const s2 = this.treeLooks[(hash1(i) * this.treeLooks.length) | 0].fall[i % 4][2], st = this.stumpLook, [sx, sy] = toScreen(x, y); t.stamp(Math.round(sx), Math.round(sy), (ctx, px, py) => { ctx.drawImage(s2.img, Math.round(px - s2.ax), Math.round(py - s2.ay)); ctx.drawImage(st.img, Math.round(px - st.ax), Math.round(py - st.ay)); }); });
    this.paintFlood(this.dams.filter((d) => d.burst).flatMap((d) => d.zone.filter((i) => t.type[i] === T.WATER && this.ground0[0][i] !== T.WATER)));
    for (const o of t.oil) if (o.found) t.oilPool(o.cx, o.cy, o.big);
    if (this.reshaped.size) this.repaintSquares([...this.reshaped.keys()], () => { for (const f of this.fallen) this.timbers(f); });
    if (t.drained.size) { const was = this.ground0[0]; this.paintLayer('drain', t.chunksOver((i) => t.type[i] !== was[i])); }
    this.landT = 0; this.nextAuto = this.stats.time + AUTOSAVE; this.state = 'play';
    this.banner = { title: 'GAME LOADED', sub: `MINUTE ${Math.floor(this.stats.time / 60)}`, t: 3, c: C.cream };
  }
  async saveGame(slot: Slot) {
    if (this.saving || (this.state !== 'play' && this.state !== 'paused')) return;
    this.saving = true;
    try {
      const t0 = performance.now(), json = JSON.stringify(this.snapshot()), t1 = performance.now();
      const bytes = await writeSave(slot, { v: SAVE_VERSION, seed: this.seed, players: this.players, size: N, time: this.stats.time, at: Date.now() }, json);
      this.saveReport = { snapshotMs: Math.round(t1 - t0), totalMs: Math.round(performance.now() - t0), jsonKB: Math.round(json.length / 1024), savedKB: Math.round(bytes / 1024) };
      if (slot === 'save') this.savedAt = this.time;
    } catch (e) { console.error(e); if (slot === 'save') this.bark = { who: 'Quartermaster', line: 'Could not save the game.', t: 3 }; }
    this.saving = false;
  }

  // ------------------------------------------------------------------ frame size
  resize() {
    const dpr = devicePixelRatio, dw = innerWidth * dpr, dh = innerHeight * dpr;
    // The battlefield's zoom: whole pixels only (a part pixel would make the art shimmer); - and + zoom from there, remembered between games
    const base = Math.max(2, Math.round(dw / 1000)); // (3 on a laptop's retina screen: about 1,000 map pixels across)
    this.k = Math.max(this.zoomStep <= -1 ? 1 : 2, base + this.zoomStep); // the furthest zoom goes down to real pixels: a commander's view
    this.FW = Math.floor(dw / this.k); this.FH = Math.floor(dh / this.k);
    this.canvas.width = this.FW; this.canvas.height = this.FH;
    this.canvas.style.width = (this.FW * this.k) / dpr + 'px';
    this.canvas.style.height = (this.FH * this.k) / dpr + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.kH = Math.max(2, Math.round(dw / 720) - 1);
    this.HW = Math.floor(dw / this.kH); this.HH = Math.floor(dh / this.kH);
    this.hud.width = this.HW; this.hud.height = this.HH;
    this.hud.style.width = (this.HW * this.kH) / dpr + 'px'; this.hud.style.height = (this.HH * this.kH) / dpr + 'px';
    // The side panel is as wide as the screen's height allows (up to 210): the radar fills its width, and the
    // build grid goes four across so the longest list fits with no gaps. Short screens keep the narrow panel.
    const most = Math.max(BUILDS.filter((d) => d.kind === 'structure').length, BUILDS.filter((d) => d.kind === 'unit').length);
    SB = 150;
    for (let w = 210; w >= 180; w -= 2) if (45 + (w - 20) + 8 + 46 + 5 + 14 + Math.ceil(most / 4) * 36 + 36 + 44 <= this.HH) { SB = w; break; }
    if (MINI.s !== SB - 22) { MINI.s = SB - 22; if (this.terrain?.minimap) this.terrain.paintMinimap(); }
    this.hctx.imageSmoothingEnabled = false;
  }
  zoom(step: number) {
    const cx = this.vx + this.FW / 2, cy = this.vy + this.FH / 2;
    const s = Math.max(-3, Math.min(3, this.zoomStep + step));
    if (s === this.zoomStep) return;
    this.zoomStep = s; this.store('zoom', String(s)); this.resize();
    this.goalX = this.vx = cx - this.FW / 2; this.goalY = this.vy = cy - this.FH / 2;
  }

  // ------------------------------------------------------------------ input
  framePos(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect(), dpr = devicePixelRatio;
    this.mouse.hx = (e.clientX * dpr) / this.kH; this.mouse.hy = (e.clientY * dpr) / this.kH; // panel pixels
    return [((e.clientX - r.left) / r.width) * this.FW, ((e.clientY - r.top) / r.height) * this.FH];
  }
  // the part of the screen that shows the battlefield (left of the side panel)
  worldW() { return this.FW - (SB * this.kH) / this.k; }
  worldH() { return this.FH; }
  inView(_y?: number) { return this.mouse.hx < this.HW - SB; }

  bindInput() {
    const M = this.mouse, el = this.canvas;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.inMenu()) {
        const n = this.menuItems.length;
        if (e.code === 'ArrowDown') this.menuHot = (this.menuHot + 1) % n;
        if (e.code === 'ArrowUp') this.menuHot = (this.menuHot + n - 1) % n;
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.menu(this.menuItems[this.menuHot].id); }
        if ((e.code === 'Escape' || e.code === 'KeyP') && this.state === 'paused') this.menu('resume');
        return;
      }
      if (this.state !== 'play') return;
      if (e.code === 'KeyP' || (e.code === 'Escape' && !this.placing && !this.attackMode && !this.selected().length && !this.selBld)) { this.state = 'paused'; this.menuHot = 0; audio.click(); return; }
      const m = /^Digit(\d)$/.exec(e.code);
      if (m && +m[1] >= 1 && +m[1] <= 5) { // divisions: Ctrl+number forms one from what's selected, the number picks it
        const k = +m[1] - 1;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.formDivision(k); } else this.pickDivision(k);
      }
      if (e.code === 'KeyS') this.order('stop');
      if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey) this.order('fallBack');
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) this.order('scout');
      if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey) this.order('guard');
      if ((e.code === 'Delete' || e.code === 'Backspace') && this.selBld && this.selBld.team === 0) this.order(this.selBld.rise < 1 ? 'cancel' : 'sell');
      if (e.code === 'Period') this.order('idleBuilder');
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) this.order(e.shiftKey ? 'idleArmy' : 'army');
      if (e.code === 'KeyT') { const types = new Set(this.selected().map((u) => u.type)); if (types.size) this.select(this.units.filter((u) => u.team === 0 && types.has(u.type)), false); }
      if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey) this.order('amove');
      if (e.code === 'KeyE') this.order('empty');
      if (e.code === 'KeyX') this.order('scatter');
      if (e.code === 'KeyH') this.order('home');
      if (e.code === 'Space') { e.preventDefault(); this.order('alert'); }
      if (e.code === 'Tab') { e.preventDefault(); this.buildTab = this.buildTab === 'structure' ? 'unit' : 'structure'; this.selBld = null; audio.click(); }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoom(-1);
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoom(1);
      if (e.code === 'Escape') { this.attackMode = false; if (this.placing) this.placing = null; else { this.select([], false); this.selBld = null; } }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { e.preventDefault(); this.select(this.units.filter((u) => u.team === 0), false); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mouseenter', () => (M.in = true));
    el.addEventListener('mouseleave', () => (M.in = false));
    el.addEventListener('pointerdown', (e) => {
      [M.x, M.y] = this.framePos(e);
      M.in = true;
      if (this.sound) audio.start();
      if (this.inMenu()) { const hit = this.menuHit(); if (hit) this.menu(hit); return; }
      if (this.state !== 'play') return;
      if (e.button === 1) { M.mid = true; e.preventDefault(); return; }
      if (this.uiClick(e.button)) return;
      if (this.placing) { if (e.button === 0) { if (this.placing.key === 'derrick') this.orderBlock([this.placeAt(this.placing)]); else this.planFrom = this.groundAt(M.x + this.vx, M.y + this.vy); } else if (this.planFrom) this.planFrom = null; else this.placing = null; return; } // press, drag to plan a line of wall or a block of buildings, let go to order it (a click is one)
      if (this.attackMode) { if (e.button === 0) this.command(M.x + this.vx, M.y + this.vy, true); this.attackMode = false; return; }
      if (e.button === 0) { M.down = true; M.sx = M.x; M.sy = M.y; M.drag = false; }
      if (e.button === 2) {
        if (this.selBld?.type === 'uplink' && this.selBld.team === 0 && !this.selected().length) { // aim the strike
          const [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy);
          if (!this.launch(this.selBld, gx, gy)) this.bark = { who: this.selBld.name, line: `Not ready yet: ${Math.floor(((this.selBld.timer ?? 0) / UPLINK_TIME) * 100)}% charged.`, t: 2.5 };
          else this.markers.push({ x: gx, y: gy, t: 0 });
        } else if (this.selBld && !this.selected().length) { // a selected building: set where its new units gather
          const [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy);
          this.selBld.rally = [gx, gy]; this.markers.push({ x: gx, y: gy, t: 0 }); audio.click();
        } else if (this.intent(M.x + this.vx, M.y + this.vy).kind === 'move') { M.rdown = true; M.rsx = M.x + this.vx; M.rsy = M.y + this.vy; } // a move waits for the release: it may be a drag
        else this.command(M.x + this.vx, M.y + this.vy);
      }
    });
    addEventListener('pointermove', (e) => {
      const [x, y] = this.framePos(e);
      if (M.mid) { this.pan(M.x - x, M.y - y); this.vx = this.goalX; this.vy = this.goalY; }
      M.x = x; M.y = y;
      if (M.down && Math.hypot(M.x - M.sx, M.y - M.sy) > 3) M.drag = true;
      if (M.down && M.onMap) this.minimapJump();
      if (this.inMenu()) { const hit = this.menuHit(); if (hit) this.menuHot = this.menuItems.findIndex((m) => m.id === hit); }
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 0 && this.planFrom && this.placing) { const d = this.placing, from = this.planFrom; this.planFrom = null; if (d.key === 'wall') { const [ax, ay] = this.placeAt(d, from); this.orderWall([ax, ay], this.placeAt(d)); } else this.orderBlock(this.blockAt(d, from)); }
      if (e.button === 1) M.mid = false;
      if (e.button === 2 && M.rdown) { const d = this.dragLine(); M.rdown = false; this.command(M.rsx, M.rsy, false, d?.line); return; }
      if (e.button !== 0 || !M.down) return;
      M.down = false;
      if (M.onMap) { M.onMap = false; return; }
      if (M.drag) {
        const x0 = Math.min(M.sx, M.x) + this.vx, x1 = Math.max(M.sx, M.x) + this.vx, y0 = Math.min(M.sy, M.y) + this.vy, y1 = Math.max(M.sy, M.y) + this.vy;
        this.select(this.units.filter((u) => { const [sx, sy] = this.scr(u); return u.team === 0 && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1; }), e.shiftKey);
      } else {
        const u = this.unitAt(M.x + this.vx, M.y + this.vy);
        const now = performance.now();
        if (u && u.team === 0) {
          if (now - M.last < 320) this.select(this.units.filter((o) => o.team === 0 && o.type === u.type && this.onScreen(o)), e.shiftKey);
          else if (e.shiftKey && u.selected) u.selected = false;
          else this.select([u], e.shiftKey);
        } else {
          if (!e.shiftKey) this.select([], false);
          const b = this.bldAtScreen(M.x + this.vx, M.y + this.vy);
          this.selBld = b && b.team === 0 && (!CAPTURE[b.type] || b.garrison > 0) ? b : null;
          if (this.selBld) audio.click();
        }
        M.last = now;
      }
    });
    // Two-finger swipe (or the mouse wheel) slides the map. Pinching does nothing, so the view
    // never jumps by accident; zoom is on the - and = keys.
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.state !== 'play' || e.ctrlKey) return;
      const f = e.deltaMode === 1 ? 16 : 1; // some mice report lines, not pixels
      this.pan((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * f * 0.5, e.shiftKey ? 0 : e.deltaY * f * 0.5);
    }, { passive: false });
    addEventListener('gesturestart', (e) => e.preventDefault()); // Safari's own pinch-to-zoom
  }

  menu(id: string) {
    audio.start(); audio.click();
    if (id === 'deploy') {
      if (this.size !== N) { try { sessionStorage.setItem('conquer-skip', '1'); } catch {} location.reload(); return; } // a new map size needs a fresh load
      if (storedPlayers() !== this.players) { try { sessionStorage.setItem('conquer-skip', '1'); } catch {} location.reload(); return; } // a different number of sides needs a new map
      this.state = 'play';
      if (this.players === 4 && this.mode === 'teams') this.ally = [0, 1, 2, 1, 0, 5]; // you and gold against red and green
      this.ais = this.sides.filter((t) => t !== 0).map((t) => new AI(this, this.level, t, t === 1 && this.plan !== 'random' ? (this.plan as Plan) : undefined));
      this.ai = this.ais[0];
      for (const p of this.prods) p.credits = this.money;
      { const [bx, by] = this.terrain.bases[0]; this.centre(bx * CELL, by * CELL); this.vx = this.goalX; this.vy = this.goalY; } // back home: the title screen drifts the camera across the map, and a few minutes on it left you staring at fog
      this.say(this.units[0], 'select');
    }
    if (id === 'plan') { const order = ['random', 'armour', 'air', 'siege', 'colossus']; this.plan = order[(order.indexOf(this.plan) + 1) % order.length]; this.store('plan', this.plan); }
    if (id === 'size') { this.size = SIZES[(SIZES.indexOf(this.size) + 1) % SIZES.length]; this.store('size', String(this.size)); }
    if (id === 'money') { const order = [4000, 6000, 12000, 25000]; this.money = order[(order.indexOf(this.money) + 1) % order.length]; this.store('money', String(this.money)); }
    if (id === 'newmap') { try { sessionStorage.setItem('conquer-skip', ''); } catch {} location.reload(); return; }
    if (id === 'players') { this.store('players', String(storedPlayers() % 4 + 1 === 1 ? 2 : storedPlayers() + 1)); }
    if (id === 'mode') { this.mode = this.mode === 'teams' ? 'ffa' : 'teams'; this.store('mode', this.mode); }
    if (id === 'hints') { this.hints = !this.hints; this.store('hints', this.hints ? 'on' : 'off'); }
    if (id === 'level') {
      const order: Level[] = ['easy', 'normal', 'hard', 'brutal'];
      this.level = order[(order.indexOf(this.level) + 1) % order.length];
      try { localStorage.setItem('conquer-level', this.level); } catch {}
    }
    if (id === 'sound') { this.sound = !this.sound; audio.master?.gain.setValueAtTime(this.sound ? 0.8 : 0, 0); }
    if (id === 'resume') this.state = 'play';
    if (id === 'save') void this.saveGame('save');
    if (id === 'continue' || id === 'loadsave') { // a save is loaded into a fresh page: its own map, made again from its seed
      const slot: Slot = id === 'loadsave' ? 'save' : this.newestSave()!, m = saveMetas()[slot]!;
      this.store('size', String(m.size)); this.store('players', String(m.players));
      try { sessionStorage.setItem('conquer-load', slot); sessionStorage.setItem('conquer-seed', String(m.seed)); } catch {}
      location.reload(); return;
    }
    if (id === 'restart' || id === 'quit') { try { sessionStorage.setItem('conquer-skip', id === 'restart' ? '1' : ''); } catch {} location.reload(); }
  }

  // ------------------------------------------------------------------ orders
  selected() { return this.units.filter((u) => u.selected); }
  select(list: Unit[], add: boolean) {
    if (!add) for (const u of this.units) u.selected = false;
    if (list.length) this.selBld = null;
    for (const u of list) u.selected = true;
    if (list.length) { this.say(list[0], 'select'); audio.click(); }
  }
  say(u: Unit, kind: 'select' | 'move') {
    const lines = u.def.barks[kind];
    this.bark = { who: u.def.name, line: lines[(Math.random() * lines.length) | 0], t: 3 };
    audio.radio();
  }
  // What a right-click at this screen point will do with what's selected. The cursor shows it and
  // command() acts on it, so the two never disagree.
  intent(px: number, py: number): { kind: 'none' | 'launch' | 'rally' | 'enter' | 'capture' | 'build' | 'repair' | 'claim' | 'attack' | 'move' | 'rebuild'; site?: Bld } {
    const sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return { kind: this.selBld?.team !== 0 ? 'none' : this.selBld.type === 'uplink' ? 'launch' : 'rally' };
    const [wx, gy] = this.groundAt(px, py), site = this.bldAtScreen(px, py);
    if (site && CAPTURE[site.type] && sel.some((u) => !u.def.vehicle) && (site.team !== 0 || CAPTURE[site.type].garrison)) return { kind: site.team === 0 ? 'enter' : 'capture', site };
    if (site && site.team === 0 && site.max > 0 && (site.rise < 1 || site.hp < site.max) && sel.some((u) => u.type === 'builder')) return { kind: site.rise < 1 ? 'build' : 'repair', site };
    if (sel.some((u) => u.type === 'builder') && this.fallenAt(wx, gy)) return { kind: 'rebuild' };
    const foe = sel.some((u) => u.def.weapon) ? this.enemyAt(px, py) : null;
    if (foe && (this.isUnit(foe) || (foe.type !== 'dam' && foe.type !== 'bridge') || sel.some((u) => u.def.weapon && WEAPONS[u.def.weapon].kind === 'shell'))) return { kind: 'attack' }; // a dam or bridge needs explosives
    const d = this.unitAt(px, py);
    if (d && d.team === 2 && d.def.weapon && this.sees(d.x, d.y) && sel.some((u) => !u.def.air)) return { kind: 'claim' };
    return { kind: 'move' };
  }
  command(px: number, py: number, amove = false, line?: { mx: number; my: number; fx: number; fy: number; width: number }) {
    for (const u of this.selected()) { if (u.ride) this.dismount(u); u.fallBack = false; u.scouting = false; } this.unpatrol(this.selected()); // a new order: off the vehicle first, and no longer falling back
    const sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return;
    const [wx, gy] = line ? [line.mx, line.my] : this.groundAt(px, py), { kind, site } = line ? { kind: 'move', site: null } : this.intent(px, py);
    if (site && (kind === 'enter' || kind === 'capture')) { // infantry sent onto a capturable site go in and take it
      const foot = sel.filter((u) => !u.def.vehicle);
      for (const u of foot) { this.sendIn(u, site); u.face = null; } // each to the nearest open side
      this.bark = { who: foot[0].def.name, line: site.team === 0 ? 'Moving in.' : 'Under new management, coming up.', t: 3 };
      audio.radio();
      return;
    }
    for (const u of sel) { u.enter = null; u.face = null; }
    const crew = sel.filter((u) => u.type === 'builder');
    if (site && (kind === 'build' || kind === 'repair')) { for (const u of crew) this.assignSite(u, site); this.say(crew[0], 'move'); return; }
    if (kind === 'rebuild') { const f = this.fallenAt(wx, gy); if (f) { this.rebuildBridge(f, 0, crew); this.bark = { who: 'Builder', line: `Rebuilding the bridge: $${DEF.bridge.cost} as we go.`, t: 3 }; audio.radio(); } return; }
    for (const u of crew) { u.buildSite = null; u.hold = true; u.rest = 0; } // sent somewhere on purpose: it rests there a while before going back to the queue
    const enemy = amove || line ? null : this.enemyAt(px, py), concrete = !!enemy && !this.isUnit(enemy) && (enemy.type === 'dam' || enemy.type === 'bridge');
    const can = (u: Unit) => !!u.def.weapon && (!concrete || WEAPONS[u.def.weapon!].kind === 'shell'); // a dam or bridge only falls to explosives
    if (enemy && sel.some(can)) { // attack!
      const go = sel.filter(can), [ex, ey] = this.posOf(enemy), mx = go.reduce((a, u) => a + u.x, 0) / go.length, my = go.reduce((a, u) => a + u.y, 0) / go.length, far = Math.hypot(ex - mx, ey - my);
      if (go.length > 1 && far > 12 * CELL) { // far off: they march there together in formation (fighting what's in the way), then all strike at once, rather than arriving one by one to be picked off
        const stand = 6 * CELL, sx = ex + ((mx - ex) / far) * stand, sy = ey + ((my - ey) / far) * stand;
        const up = this.mountUp(sel.filter((u) => !u.def.air && u.type !== 'builder')), fast = go.filter((u) => !u.ride && u.riders.length), slow = go.filter((u) => !u.ride && !u.riders.length);
        if (up && fast.length && slow.length) { this.orderUnits(fast, sx, sy, true, true); this.orderUnits(slow, sx, sy, true, true); } // the riders' vehicles go at their own pace; the walkers at theirs
        else this.orderUnits(go.filter((u) => !u.ride), sx, sy, true, true);
        const wave = { members: sel.filter((u) => can(u) || u.ride), first: -1 }; // they strike as one, once everyone's at the gathering point
        for (const u of wave.members) { u.strike = enemy; u.wave = wave; if (!u.ride) u.target = null; }
        if (up) this.mountNote = this.mountLine(up);
        this.markers.push({ x: sx, y: sy, t: 0 });
      } else for (const u of go) { u.target = enemy; u.forced = true; u.amove = false; u.chase = 0; u.goal = null; u.path = []; u.strike = null; }
      const weak = this.weakAgainst(go, enemy), note = this.mountNote; this.mountNote = '';
      this.bark = weak ? { who: weak.who, line: weak.line, t: 4 } : note ? { who: sel[0].def.name, line: note, t: 3 } : { who: sel[0].def.name, line: far > 12 * CELL && go.length > 1 ? ['Moving up together.', 'Forming up. We go in as one.', 'Advancing in formation.'][(Math.random() * 3) | 0] : ['Engaging.', 'Target acquired.', 'With pleasure.', 'They had it coming.'][(Math.random() * 4) | 0], t: 2.5 };
      audio.radio();
      return;
    }
    for (const u of sel) { u.forced = false; u.amove = amove; u.strike = null; u.wave = null; u.mopUp = null; u.gather = null; if (!amove) u.target = null; }
    { // a long attack-move by a real group: they meet short of it and go in together, rather than strung out in single file to be picked off one by one
      const mx = sel.reduce((s, u) => s + u.x, 0) / sel.length, my = sel.reduce((s, u) => s + u.y, 0) / sel.length, shift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      if (amove && !line && !shift && sel.length >= 6 && Math.hypot(wx - mx, gy - my) > 20 * CELL) {
        this.orderUnits(sel.filter((u) => !u.ride && u.type !== 'builder'), wx, gy, true, true);
        this.markers.push({ x: wx, y: gy, t: 0 });
        this.bark = { who: sel[0].def.name, line: ['Moving up together.', 'Forming up. We go in as one.'][Math.floor(Math.random() * 2)], t: 3 }; audio.radio();
        return;
      }
    }
    // A group sent somewhere forms up facing the way it went (see formation()); a short shuffle just
    // keeps everyone's place, squeezed if spread out. Either way the group moves at its slowest
    // member's pace, so they arrive together.
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length, cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
    const far = Math.hypot(wx - cx, gy - cy), fx = line ? line.fx : (wx - cx) / far, fy = line ? line.fy : (gy - cy) / far;
    const spots = line ? this.formation(sel, wx, gy, fx, fy, line.width, true) : sel.length > 1 && far > 3 * CELL ? this.formation(sel, wx, gy, fx, fy) : null;
    const spread = Math.max(1, ...sel.map((u) => Math.hypot(u.x - cx, u.y - cy))), fit = Math.sqrt(sel.length) * 12 + 8;
    const squeeze = spread > fit ? fit / spread : 1, pace = Math.min(...sel.map((u) => u.def.speed));
    const queue = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); // Shift: add a waypoint
    const up = !queue && !line && far > 12 * CELL ? this.mountUp(sel) : null; // a long march: soldiers ride on the armour, as many as fit
    const carPace = up ? Math.min(...sel.filter((u) => u.riders.length).map((u) => u.def.speed)) : pace, footPace = up ? Math.min(...sel.filter((u) => !u.ride && !u.riders.length).map((u) => u.def.speed), 1e9) : pace; // the vehicles carrying riders go at their pace, the rest at theirs
    const lead = this.bunchRoutes(sel, wx, gy);
    for (const u of sel) {
      if (u.ride) continue;
      const g: [number, number] = spots?.get(u) ?? [wx + (u.x - cx) * squeeze, gy + (u.y - cy) * squeeze];
      u.pace = sel.length > 1 ? (u.riders.length ? carPace : footPace) : 0; u.face = spots ? Math.atan2(fy, fx) : null;
      if (queue && (u.goal || u.queue.length)) { u.queue.push(g); continue; }
      u.queue = []; u.goal = g; u.stuck = 0;
      const l = lead.get(u);
      u.path = u.def.air ? [g] : l ? this.followRoute(u, l.r[u.def.crush ? 1 : 0], l.cx, l.cy, g) : findPath(this.terrain, u.x, u.y, g[0], g[1], u.def.crush);
    }
    this.markers.push({ x: wx, y: gy, t: 0 });
    const walker = sel.find((u) => !u.def.air);
    if (walker && !queue) { // can they actually get there? if not, say so: they go as close as they can
      const probe = findPath(this.terrain, walker.x, walker.y, wx, gy, walker.def.crush), end = probe[probe.length - 1];
      const t = this.terrain, onIt = this.blds.some((b) => b.dying < 0 && t.cellOf(wx) >= b.cx && t.cellOf(wx) < b.cx + b.w && t.cellOf(gy) >= b.cy && t.cellOf(gy) < b.cy + b.h); // clicking a building is a different order
      if (!onIt && end && (t.type[t.idx(t.cellOf(wx), t.cellOf(gy))] === T.WATER || t.type[t.idx(t.cellOf(wx), t.cellOf(gy))] === T.ROCK || (!pathStats.reached && Math.hypot(end[0] - wx, end[1] - gy) > 4 * CELL))) { this.bark = { who: walker.def.name, line: "We can't get all the way there. Going as close as we can.", t: 3 }; audio.radio(); return; }
    }
    if (up) this.bark = { who: sel[0].def.name, line: up.walking ? `Mount up! ${up.riders.length} riding, ${up.walking} on foot.` : 'Mount up! Everyone riding.', t: 3 }; else this.say(sel[0], 'move');
    if (spots && !line && sel.length >= 8 && this.hints && this.setting('tip-line', '') !== 'seen') { // shown once, when it would help
      this.store('tip-line', 'seen');
      this.bark = { who: 'Tip', line: 'Right-click and drag to draw a battle line.', t: 5 };
    }
  }
  // Right-drag with units selected draws a battle line: they spread along it, facing away from
  // where they stand now. Null until the drag is long enough to count.
  dragLine() {
    const M = this.mouse, sel = this.selected().filter((u) => u.team === 0);
    if (!M.rdown || !sel.length || Math.hypot(M.x + this.vx - M.rsx, M.y + this.vy - M.rsy) < 12) return null;
    const [ax, ay] = this.groundAt(M.rsx, M.rsy), [bx, by] = this.groundAt(M.x + this.vx, M.y + this.vy);
    const width = Math.hypot(bx - ax, by - ay) || 1, mx = (ax + bx) / 2, my = (ay + by) / 2;
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length, cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
    let fx = -(by - ay) / width, fy = (bx - ax) / width;
    if ((cx - mx) * fx + (cy - my) * fy > 0) { fx = -fx; fy = -fy; }
    const line = { mx, my, fx, fy, width };
    return { line, spots: this.formation(sel, mx, my, fx, fy, width, true) };
  }
  // Where each unit stands at the end of a group move: armour in front, infantry behind it, guns,
  // flak, aircraft and helpers at the back, in neat rows across the way (fx, fy) the group is going.
  // The clicked spot is the middle of the block; a drawn line is the front edge, with each row
  // spread along it.
  formation(sel: Unit[], tx: number, ty: number, fx: number, fy: number, width = Math.max(48, Math.sqrt(sel.length) * 34), onLine = false) {
    const ranks: Unit[][] = [[], [], []];
    for (const u of sel) ranks[u.def.air || u.type === 'artillery' || u.type === 'flak' || !u.def.weapon ? 2 : u.def.vehicle ? 0 : 1].push(u);
    const rows: { us: Unit[]; gap: number }[] = [];
    for (const r of ranks) {
      if (!r.length) continue;
      const gap = Math.max(...r.map((u) => u.def.radius)) * 2 + 10, per = Math.max(1, Math.floor(width / gap));
      r.sort((a, b) => (b.x - a.x) * fx + (b.y - a.y) * fy); // whoever is already ahead takes the front row
      for (let i = 0; i < r.length; i += per) rows.push({ us: r.slice(i, i + per), gap });
    }
    const spots = new Map<Unit, [number, number]>();
    let ahead = onLine ? 0 : rows.reduce((s, r) => s + r.gap, 0) / 2;
    for (const { us, gap } of rows) {
      const d = ahead - gap / 2;
      us.sort((a, b) => (a.y - b.y) * fx - (a.x - b.x) * fy); // left to right as they stand, so nobody crosses
      const step = onLine ? Math.max(gap, width / us.length) : gap;
      us.forEach((u, i) => { const side = (i - (us.length - 1) / 2) * step; spots.set(u, [tx + fx * d - fy * side, ty + fy * d + fx * side]); });
      ahead -= gap;
    }
    return spots;
  }
  // How a unit gets somewhere: aircraft fly straight, everyone else plans a route on the ground.
  route(u: Unit, x: number, y: number): [number, number][] { return u.def.air ? [[x, y]] : findPath(this.terrain, u.x, u.y, x, y, u.def.crush); }
  // A big group shares routes: one for the whole group if it's tight, else one per bunch (10-square
  // patches), so a scattered army neither plans hundreds of routes at once nor routes everyone from
  // one middle point (which can lie in water or behind a cliff).
  bunchRoutes(us: Unit[], x: number, y: number) {
    const lead = new Map<Unit, { r: [number, number][][]; cx: number; cy: number }>();
    if (us.length <= 8) return lead;
    const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cy = us.reduce((s, u) => s + u.y, 0) / us.length, spread = Math.max(...us.map((u) => Math.hypot(u.x - cx, u.y - cy)));
    const bunches = new Map<number, Unit[]>();
    for (const u of us) { if (u.def.air) continue; const k = spread < 10 * CELL ? 0 : Math.floor(u.y / (10 * CELL)) * 1000 + Math.floor(u.x / (10 * CELL)); const b = bunches.get(k); if (b) b.push(u); else bunches.set(k, [u]); }
    for (const b of bunches.values()) if (b.length >= 3) { const bx = b.reduce((s, u) => s + u.x, 0) / b.length, by = b.reduce((s, u) => s + u.y, 0) / b.length, r = this.sharedRoutes(bx, by, x, y); for (const u of b) lead.set(u, { r, cx: bx, cy: by }); }
    return lead;
  }
  // One route for the whole group (one for vehicles that can crush trees, one for those that can't).
  sharedRoutes(cx: number, cy: number, tx: number, ty: number): [[number, number][], [number, number][]] {
    return [findPath(this.terrain, cx, cy, tx, ty, false), findPath(this.terrain, cx, cy, tx, ty, true)];
  }
  // Each unit follows the group's route shifted by its place in the group (where that ground is
  // open), ending at its own spot; if it bumps into something it plans its own way round.
  followRoute(u: Unit, route: [number, number][], cx: number, cy: number, g: [number, number]): [number, number][] {
    const t = this.terrain, ox = (u.x - cx) * 0.5, oy = (u.y - cy) * 0.5, out: [number, number][] = [];
    for (let i = 0; i < route.length - 1; i++) {
      const [x, y] = route[i], sx = x + ox, sy = y + oy;
      out.push(t.open(t.cellOf(sx), t.cellOf(sy), u.def.crush) ? [sx, sy] : [x, y]);
    }
    out.push(g);
    return out;
  }
  order(id: string) {
    if (id === 'home') { const [bx, by] = this.terrain.bases[0]; this.centre(bx * CELL, by * CELL); return; }
    if (id === 'alert') { if (this.alertAt) this.centre(...this.alertAt); return; } // jump to the latest alert
    if (id === 'amove') { if (this.selected().length) { this.attackMode = true; this.bark = { who: 'Command', line: 'Click where to go. They fight anything on the way.', t: 3 }; } return; }
    if (id === 'cancel' && this.selBld && this.selBld.rise < 1) { this.cancelSite(this.selBld); return; }
    if (id === 'empty' && this.selBld && CAPTURE[this.selBld.type]?.garrison) { this.emptyGarrison(this.selBld); return; }
    { const m = /^(div|feed)(\d)$/.exec(id); if (m) { if (m[1] === 'div') this.pickDivision(+m[2]); else this.feedDivision(+m[2]); return; } }
    if (id === 'formDiv') { this.formDivision(); return; }
    if (id === 'army' || id === 'idleArmy') { // everything that fights (or only the ones standing about)
      const army = this.units.filter((u) => u.team === 0 && u.def.weapon && !u.enter && (id === 'army' || (!u.goal && !u.path.length && !u.target)));
      this.select(army, false); audio.click();
      this.bark = { who: 'Command', line: army.length ? `${army.length} ${id === 'army' ? 'units' : 'idle units'} selected.` : 'Nobody to select.', t: 2 };
      return;
    }
    if (id === 'idleBuilder') { // cycle through builders with nothing to do
      const idle = this.builders(0).filter((u) => !u.buildSite && !u.goal && !u.path.length);
      if (!idle.length) { this.bark = { who: 'Command', line: 'Every builder is busy.', t: 2 }; return; }
      const u = idle[this.idleCycle++ % idle.length];
      this.select([u], false); this.centre(u.x, u.y); audio.click();
      return;
    }
    if (id === 'keep') {
      const on = (this.prod.keep = !this.prod.keep);
      this.bark = { who: 'Command', line: on ? 'Keep building: every finished unit goes back on its factory\'s queue.' : 'Factories stop when their queues run out.', t: 3 }; audio.click();
      return;
    }
    if (id === 'sell' && this.selBld) { // press twice to sell, so a slip of the finger can't
      const b = this.selBld, d = DEF[b.type];
      if (!d || b.rise < 1 || b.dying >= 0) return;
      if (this.sellArm !== b || this.time - this.sellT > 2.5) { this.sellArm = b; this.sellT = this.time; this.bark = { who: b.name, line: `Sell for $${Math.round(d.cost * 0.5 * b.hp / b.max)}? Click SELL again to confirm.`, t: 2.5 }; return; }
      const refund = Math.round(d.cost * 0.5 * b.hp / b.max);
      this.prods[0].credits += refund;
      this.dropBld(b);
      for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
      this.selBld = null; this.sellArm = null;
      this.bark = { who: 'Command', line: `${b.name} sold for $${refund}.`, t: 2.5 }; audio.click();
      return;
    }
    const sel = this.selected();
    if (!sel.length) return;
    audio.click();
    if (id === 'fallBack') { const n = this.fallBack(sel.filter((u) => u.team === 0)); this.bark = { who: sel[0].def.name, line: n ? ['Falling back!', 'Pulling out!', 'Back to base, go!'][(Math.random() * 3) | 0] : 'Nowhere to fall back to.', t: 2.5 }; audio.radio(); return; }
    if (id === 'guard') { const n = this.guard(sel.filter((u) => u.team === 0 && u.def.weapon && u.type !== 'builder' && u.type !== 'harvester')); this.bark = { who: sel[0].def.name, line: n ? ['On patrol. Nothing gets past.', 'Walking the line.', 'Guarding the base.'][(Math.random() * 3) | 0] : 'No base to guard: build a Field Command.', t: 2.5 }; audio.radio(); return; }
    this.unpatrol(sel);
    if (id === 'scout') { const sc = sel.filter((u) => u.team === 0 && u.type === 'scout'); for (const u of sc) { u.scouting = true; u.fallBack = false; u.goal = null; u.path = []; u.queue = []; u.target = null; } if (sc.length) { this.bark = { who: 'Scout', line: ['Heading out. I\'ll find them.', 'Going looking.', 'Eyes out. Back when I\'m hurt.'][(Math.random() * 3) | 0], t: 2.5 }; audio.radio(); } return; }
    for (const u of sel) {
      u.face = null; u.fallBack = false; u.scouting = false;
      if (id === 'stop') { u.path = []; u.goal = null; u.queue = []; u.pace = 0; }
      if (id === 'scatter') {
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
        u.goal = [u.x + Math.cos(a) * d, u.y + Math.sin(a) * d];
        u.path = this.route(u, u.goal[0], u.goal[1]);
      }
    }
  }
  // Fall back: the units stop fighting and run for the nearest Field Command or repair yard of theirs, a
  // fifth faster than usual and a quarter harder to hit, to heal on home ground. Each goes at its own
  // speed (no waiting for the slowest). Anyone falling back stops when it gets there or takes a new order.
  // SCOUT: the scout goes out on its own, again and again, to ground you haven't seen (or not lately),
  // leaning toward the enemy's side, keeping out of fights; badly hurt, it runs home. Any order ends it.
  updateScouts() {
    const t = this.terrain, n = Math.round(Math.sqrt(this.vis.length));
    const foes = this.sides.filter((s) => this.hostile(0, s)).map((s) => t.bases[this.baseOf(s)]);
    for (const u of this.units) {
      if (!u.scouting) continue;
      if (u.team !== 0 || !this.alive(u)) { u.scouting = false; continue; }
      if (u.hp < u.def.hp * 0.4) { u.scouting = false; if (this.fallBack([u])) this.bark = { who: 'Scout', line: 'Taking fire, coming home!', t: 2.5 }; continue; }
      if (u.goal || u.path.length) continue;
      const cx = u.x / CELL, cy = u.y / CELL; let best: [number, number] | null = null, bs = -1e9;
      for (let k = 0; k < 60; k++) {
        const x = (Math.random() * n) | 0, y = (Math.random() * n) | 0, v = this.vis[y * n + x], d = Math.hypot(x - cx, y - cy);
        if (v === 2 || d < 12 || !t.open(x, y, false)) continue;
        const foe = Math.min(...foes.map(([fx, fy]) => Math.hypot(x - fx, y - fy)), 1e9);
        const sc = (v === 0 ? 40 : 15) - d * 0.35 - foe * 0.12 - this.danger0(x, y) * 30;
        if (sc > bs) { bs = sc; best = [x, y]; }
      }
      if (best) this.orderUnits([u], (best[0] + 0.5) * CELL, (best[1] + 0.5) * CELL, false);
    }
  }
  // how many enemy guns you know of near a square (a scout steers clear of them)
  danger0(x: number, y: number) { let k = 0; this.near((x + 0.5) * CELL, (y + 0.5) * CELL, 8 * CELL, (o) => { if (this.hostile(0, o.team) && o.def.weapon && this.spot(o)) k++; }); for (const b of this.blds) if (this.hostile(0, b.team) && DEFENCE[b.type] && b.dying < 0 && (b.seen || this.sees((b.cx + 1) * CELL, (b.cy + 1) * CELL)) && Math.hypot(b.cx - x, b.cy - y) < 9) k += 2; return k; }
  // GUARD: the units walk a loop round the nearest Field Command, attack-moving point to point so they fight
  // whatever they meet. Anything of yours hit inside the loop's reach pulls the patrol there; once that fight
  // is over, it picks the loop up again. Select one to see the loop. Any other order to a unit takes it off.
  patrols: { units: Unit[]; hub: Bld; pts: [number, number][]; i: number; mode: 'loop' | 'respond' }[] = [];
  guard(us: Unit[]) {
    us = us.filter((u) => this.alive(u) && !u.def.air);
    if (!us.length) return 0;
    const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cy = us.reduce((s, u) => s + u.y, 0) / us.length;
    const hub = this.blds.filter((b) => b.team === 0 && b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0).sort((a, b) => Math.hypot(a.cx * CELL - cx, a.cy * CELL - cy) - Math.hypot(b.cx * CELL - cx, b.cy * CELL - cy))[0];
    if (!hub) return 0;
    this.unpatrol(us);
    const t = this.terrain, hx = hub.cx + 1.5, hy = hub.cy + 1.5, pts: [number, number][] = [];
    for (let k = 0; k < 10; k++) { // ten points round it, each moved to open ground nearby
      const a = (k / 10) * TAU, x0 = Math.round(hx + Math.cos(a) * 12), y0 = Math.round(hy + Math.sin(a) * 12);
      let p: [number, number] | null = null;
      for (let r = 0; r <= 3 && !p; r++) for (let dy = -r; dy <= r && !p; dy++) for (let dx = -r; dx <= r && !p; dx++) if (t.inside(x0 + dx, y0 + dy) && t.open(x0 + dx, y0 + dy, false)) p = [(x0 + dx + 0.5) * CELL, (y0 + dy + 0.5) * CELL];
      if (p) pts.push(p);
    }
    if (pts.length < 3) return 0;
    const i = pts.reduce((b, p, k) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(pts[b][0] - cx, pts[b][1] - cy) ? k : b), 0); // start from the nearest point
    for (const u of us) { u.fallBack = false; u.scouting = false; }
    this.patrols.push({ units: us, hub, pts, i, mode: 'loop' });
    this.orderUnits(us, pts[i][0], pts[i][1], true);
    return us.length;
  }
  unpatrol(us: Unit[]) { if (!this.patrols.length) return; for (const p of this.patrols) p.units = p.units.filter((u) => !us.includes(u)); this.patrols = this.patrols.filter((p) => p.units.length); }
  updatePatrols() {
    for (const p of this.patrols) p.units = p.units.filter((u) => this.alive(u) && !u.fallBack && !u.scouting);
    this.patrols = this.patrols.filter((p) => p.units.length && this.alive(p.hub) && p.hub.team === 0);
    for (const p of this.patrols) {
      const hx = (p.hub.cx + 1.5) * CELL, hy = (p.hub.cy + 1.5) * CELL;
      const hit = this.pings.find((q) => q.t < 2 && Math.hypot(q.x - hx, q.y - hy) < 18 * CELL);
      if (hit && p.mode === 'loop') { p.mode = 'respond'; this.orderUnits(p.units, hit.x, hit.y, true); continue; }
      const done = p.units.filter((u) => !u.goal && !u.path.length && !u.target).length >= Math.ceil(p.units.length * 0.7);
      if (!done) continue;
      if (p.mode === 'respond') p.mode = 'loop'; else p.i = (p.i + 1) % p.pts.length;
      this.orderUnits(p.units, p.pts[p.i][0], p.pts[p.i][1], true);
    }
  }
  // a selected patrol's loop: one dotted ring, its next stop marked
  drawPatrols(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain;
    for (const p of this.patrols) {
      if (!p.units.some((u) => u.selected)) continue;
      const at = (x: number, y: number) => { const [sx, sy] = toScreen(x, y); return [sx - vx, sy - t.lift(x, y) - vy]; };
      for (let k = 0; k < p.pts.length; k++) {
        const [ax, ay] = p.pts[k], [bx, by] = p.pts[(k + 1) % p.pts.length], n = Math.hypot(bx - ax, by - ay);
        for (let d = (this.time * 20) % 10; d < n; d += 10) { const [x, y] = at(ax + ((bx - ax) * d) / n, ay + ((by - ay) * d) / n); ctx.fillStyle = C.ink; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 4, 4); ctx.fillStyle = '#9ad0ff'; ctx.fillRect(Math.round(x), Math.round(y), 2, 2); }
      }
      const [nx, ny] = at(p.pts[p.i][0], p.pts[p.i][1]); ctx.fillStyle = C.gold; ctx.fillRect(Math.round(nx) - 2, Math.round(ny) - 2, 5, 5);
    }
  }
  fallBack(us: Unit[]) {
    us = us.filter((u) => this.alive(u) && u.def.weapon && !u.def.air && !u.enter);
    if (!us.length) return 0;
    const team = us[0].team, cx = us.reduce((s, u) => s + u.x, 0) / us.length, cy = us.reduce((s, u) => s + u.y, 0) / us.length;
    const home = this.blds.filter((b) => b.team === team && b.dying < 0 && b.rise >= 1 && (b.type === 'fieldCommand' || b.type === 'repairYard')).map((b) => this.posOf(b)).sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))[0];
    if (!home || Math.hypot(home[0] - cx, home[1] - cy) < 6 * CELL) return 0;
    this.orderUnits(us, home[0], home[1], false);
    for (const u of us) { u.fallBack = true; u.target = null; u.pace = 0; }
    return us.length;
  }
  high(x: number, y: number) { const t = this.terrain; return t.elev[t.idx(t.cellOf(x), t.cellOf(y))] === 2; } // up on a plateau
  centre(x: number, y: number) { const [sx, sy] = toScreen(x, y); this.centreScreen(sx, sy); }
  centreScreen(sx: number, sy: number) { this.goalX = sx - this.worldW() / 2; this.goalY = sy - this.FH / 2; }

  // ground point under a screen point (raised ground is drawn higher up the screen)
  // the ground point under a screen point (raised ground is drawn higher up the screen)
  groundAt(sx: number, sy: number): [number, number] {
    for (const e of [2, 1]) { const [gx, gy] = toGround(sx, sy + e * LIFT); if (this.terrain.elevAt(gx, gy) === e) return [gx, gy]; }
    return toGround(sx, sy);
  }
  // where a ground point is drawn on screen (map space; subtract the view to get frame pixels)
  scr(p: { x: number; y: number; def?: UnitDef; id?: number }): [number, number] { const [sx, sy] = toScreen(p.x, p.y); return [sx, sy - (p.def?.air ? ALT + Math.sin(this.time * 2 + (p.id ?? 0)) * 1.5 : this.terrain.lift(p.x, p.y))]; }
  onScreen(u: Unit) { const [x, y] = this.scr(u), sx = x - this.vx, sy = y - this.vy; return sx > 0 && sx < this.worldW() && sy > 0 && sy < this.FH; }
  unitAt(wx: number, wy: number) {
    let best: Unit | null = null, bd = 9;
    for (const u of this.units) {
      const [sx, sy] = this.scr(u);
      const d = Math.hypot(sx - wx, sy - (u.def.vehicle ? 4 : 3) - wy) - u.def.radius * 0.6;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // Scroll the view. It may not be scrolled off into the blackness: at least about half of it stays
  // on ground you've seen. (Only scrolling is held back; a jump to an alert or a unit goes where it goes.)
  pan(dx: number, dy: number) {
    const ox = this.goalX, oy = this.goalY;
    this.goalX += dx; this.goalY += dy;
    if (this.seen.x1 < 0) return;
    const W = this.worldW(), H = this.worldH(), cs = [[this.seen.x0, this.seen.y0], [this.seen.x1 + 1, this.seen.y0], [this.seen.x0, this.seen.y1 + 1], [this.seen.x1 + 1, this.seen.y1 + 1]].map(([a, b]) => toScreen(a * CELL, b * CELL));
    const lx = Math.min(...cs.map((c) => c[0])) - W * 0.4, hx = Math.max(...cs.map((c) => c[0])) - W * 0.6, ly = Math.min(...cs.map((c) => c[1])) - H * 0.4, hy = Math.max(...cs.map((c) => c[1])) - H * 0.6;
    if (dx < 0) this.goalX = Math.max(this.goalX, Math.min(ox, lx)); else if (dx > 0) this.goalX = Math.min(this.goalX, Math.max(ox, hx)); // never further out than it was
    if (dy < 0) this.goalY = Math.max(this.goalY, Math.min(oy, ly)); else if (dy > 0) this.goalY = Math.min(this.goalY, Math.max(oy, hy));
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    this.time += dt;
    if (this.state === 'title') { this.goalX += dt * 9; this.goalY += dt * 3; this.vx = this.goalX; this.vy = this.goalY; } // the battlefield drifts by behind the menu
    if (this.state !== 'play') return;
    const sp = 420 * dt, M = this.mouse;
    let mx = 0, my = 0;
    if (this.keys.has('ArrowLeft')) mx--; if (this.keys.has('ArrowRight')) mx++;
    if (this.keys.has('ArrowUp')) my--; if (this.keys.has('ArrowDown')) my++;
    if (M.in && !M.down) { if (M.x < 3) mx--; if (M.x > this.FW - 3) mx++; if (M.y < 3) my--; if (M.y > this.FH - 3) my++; }
    if (mx || my) this.pan(mx * sp, my * sp);
    this.goalX = Math.max(VIEW.x0 - 8, Math.min(VIEW.x0 + VIEW.w - this.worldW() + 8, this.goalX)); // the camera keeps to the playable rectangle
    this.goalY = Math.max(VIEW.y0 - 24, Math.min(VIEW.y0 + VIEW.h - this.FH + 8, this.goalY));
    this.vx += (this.goalX - this.vx) * (1 - Math.exp(-dt * 14));
    this.vy += (this.goalY - this.vy) * (1 - Math.exp(-dt * 14));
    if ((this.landT -= dt) <= 0) { this.landT = 1; this.updateLand(); this.justInTime(); }
    if ((this.cloakT -= dt) <= 0) { this.cloakT = 0.25; this.updateCloak(); }
    if ((this.marauderT -= dt) <= 0) { this.marauderT = 0.5; this.updateMarauders(); }
    if ((this.divT -= dt) <= 0) { this.divT = 1; this.updateDivisions(); this.updateScouts(); this.updatePatrols(); }
    this.updateSeasons();
    if (this.floods.length) this.updateFloods(dt);
    this.updateFire(dt);
    this.buildGrid(); this.pathBudget = 30; pathStats.work = 0;
    this.updateRadar(dt);
    for (const u of this.units) this.move(u, dt);
    this.separate();
    this.updateTrees(dt);
    this.updateLife(dt);
    this.updateSites(dt);
    this.updateEconomy(dt);
    this.updateCombat(dt);
    this.updateStrikes(dt);
    for (const ai of this.ais) if (!this.out.has(ai.me)) ai.update(dt);
    if ((this.fogT -= dt) <= 0) { this.fogT = 0.25; this.updateFog(); }
    this.stats.time += dt;
    if (this.stats.time >= this.nextAuto) { this.nextAuto = this.stats.time + AUTOSAVE; void this.saveGame('auto'); }
    if ((this.endCheck -= dt) <= 0) { this.endCheck = 1; this.checkEnd(); }
    // steam from cooling towers, smoke from scrapyard chimneys (model block coordinates: x, z on the ground, then height)
    for (const b of this.blds) {
      const vent = b.rise >= 1 && b.dying < 0 && VENTS[b.type];
      if (!vent || Math.random() > dt * vent[3]) continue;
      const [gx, gy] = toScreen(b.cx * CELL + vent[0], b.cy * CELL + vent[1]), steam = b.type === 'generator';
      this.puffs.push({ x: gx + (Math.random() - 0.5) * (steam ? 8 : 3), y: gy - vent[2], vx: 2 + Math.random() * 2, vy: -5 - Math.random() * 3, t: 0, life: 2 + Math.random(), c: steam ? (Math.random() < 0.5 ? '#e8e6e0' : '#c8c6c0') : '#5a5650', s: steam ? 2 : 1 + (Math.random() < 0.5 ? 1 : 0) });
    }
    for (const p of this.puffs) { p.t += dt; if (p.g) p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.puffs = this.puffs.filter((p) => p.t < p.life);
    this.bark.t -= dt;
    this.shakeAt = Math.max(0, this.shakeAt - dt);
    for (const m of this.markers) m.t += dt;
    for (const w of this.gained) w.t += dt; this.gained = this.gained.filter((w) => w.t < GLOW_T);
    for (const w of this.words) w.t += dt; if (this.words.length) this.words = this.words.filter((w) => w.t < 1.2);
    if ((this.claimT -= dt) <= 0) { this.claimT = 0.3; this.claimAndCollect(); }
    if ((this.crateT -= dt) <= 0) { this.crateT = 75; this.dropCrates(this.stats.time < 180); }
    for (const p of this.pings) { p.t += dt; p.dmg *= Math.exp(-dt * 0.1); }
    this.pings = this.pings.filter((p) => p.t < 8); // eight quiet seconds and it's over
    this.markers = this.markers.filter((m) => m.t < 0.6);
  }

  move(u: Unit, dt: number) {
    const d = u.def, t = this.terrain;
    u.moving = false;
    if (u.ride) { // riding: sit on the hull, facing the way it goes
      const c = u.ride;
      if (c.gone) { this.dismount(u, true); return; }
      const ox = [-5, 5][u.seat % 2], oy = [-4, 4, 0][Math.min(2, u.seat >> 1)], ca = Math.cos(c.heading), sa = Math.sin(c.heading);
      u.x = c.x + oy * ca - ox * sa; u.y = c.y + oy * sa + ox * ca; u.heading = u.tHead = c.heading;
      return;
    }
    if (u.gather && !u.goal && !u.path.length) { // at the gathering point: once everyone's here (or after a fair wait), all go in together
      const w = u.gather;
      if (w.released) u.gather = null;
      else {
        if (w.first < 0) w.first = this.time;
        const alive = w.members.filter((m) => this.alive(m));
        if (alive.every((m) => !m.ride && !m.goal && !m.path.length) || this.time - w.first > 40) { w.released = true; this.orderUnits(alive.filter((m) => !m.ride), w.go[0], w.go[1], true, true); }
      }
    }
    if (u.riders.length && ((!u.goal && !u.path.length) || (u.target && this.reach(u.x, u.y, u.target) < (u.def.weapon ? WEAPONS[u.def.weapon].range : 0) + 40))) for (const r of [...u.riders]) this.dismount(r); // there, or into a fight: everyone off
    if (u.type === 'harvester' && u.team !== 2) this.salvage(u, dt);
    if (u.buildSite) {
      const b = u.buildSite;
      if (b.gone || (b.rise >= 1 && b.hp >= b.max) || b.dying >= 0) u.buildSite = null;
      else if (this.reach(u.x, u.y, b) < (b.type === 'bridge' ? 80 : 36)) { u.path = []; u.goal = null; } // a bridge is built from its banks
      else if (!u.path.length && (!u.goal || u.stuck >= 3)) { // got as far as it could, but not there: try again a few times, then leave it a minute and take other work
        if ((b.fails = (b.fails ?? 0) + 1) > 3) { b.fails = 0; b.blocked = this.time + 60; u.buildSite = null; u.goal = null; u.path = []; }
        else this.assignSite(u, b);
      }
    }
    if (!u.path.length && !u.target && this.looks[u.type + u.team]?.turret) {
      // idle tanks look around now and then
      if ((u.scan -= dt) <= 0) { u.scan = 2 + Math.random() * 4; u.scanTo = u.heading + (Math.random() - 0.5) * 2.2; }
      u.tHead += Math.max(-dt * 0.8, Math.min(dt * 0.8, angDiff(u.tHead, u.scanTo)));
    }
    if (!u.path.length && !u.goal && u.face !== null && !u.target) { // arrived: turn to face the front
      const diff = angDiff(u.heading, u.face);
      u.heading += Math.max(-d.turn * dt, Math.min(d.turn * dt, diff));
      if (this.looks[u.type + u.team]?.turret) u.scanTo = u.heading; else u.tHead = u.heading;
      if (Math.abs(diff) < 0.05) u.face = null;
    }
    if (!u.path.length) {
      if (u.goal && d.air) { u.path = [u.goal]; return; }
      if (u.goal && Math.hypot(u.goal[0] - u.x, u.goal[1] - u.y) > 6) {
        if (this.pathBudget <= 0 || pathStats.work > PATH_WORK) return; // enough route planning this frame: try again next frame
        if (u.stuck < 3) { const far = u.stuck === 0; u.stuck++; this.pathBudget--; u.path = findPath(t, u.x, u.y, u.goal[0], u.goal[1], d.crush, far ? undefined : REPLAN); } // the first try searches as far as a fresh order
        else { u.goal = null; u.avoid = (u.avoid ?? 0) + 1; } // can't get there: give up rather than sit forever
      }
      return;
    }
    if ((u.progT += dt) > 3) { // three seconds with a route and no real progress: skip the stuck waypoint
      if (Math.hypot(u.x - u.px0, u.y - u.py0) < d.speed * 3 * 0.35) u.squeeze = this.time + 3; // hemmed in for a while: politeness gives way, it squeezes past whoever is in the way
      if (Math.hypot(u.x - u.px0, u.y - u.py0) < 6 && !u.target) { u.path.shift(); if (!u.path.length) { u.goal = null; u.pace = 0; } }
      u.progT = 0; u.px0 = u.x; u.py0 = u.y;
      if (!u.path.length) return;
    }
    // Drive like a driver: near a turn, if the way to the turn after is open (as wide as the vehicle), cut the corner
    // and head straight for it (aiming for each point exactly made vehicles circle back round it, wall to wall)
    if (u.path.length > 1 && !d.air) { const [ax, ay] = u.path[0]; if (Math.hypot(ax - u.x, ay - u.y) < 30 && clearLine(t, u.x, u.y, u.path[1][0], u.path[1][1], d.crush, d.radius * 0.7)) u.path.shift(); }
    const [px, py] = u.path[0];
    const dx = px - u.x, dy = py - u.y, dist = Math.hypot(dx, dy);
    // the last step: if someone is already standing on the spot, close enough counts
    // a waypoint someone else is already standing on counts as reached once you're close (otherwise two
    // units heading for the same spot shove each other round it forever)
    let crowded = false;
    if (dist < 18 && dist >= (u.path.length > 1 ? 12 : 1.5)) this.near(px, py, 24, (o) => (crowded = o !== u && !o.ride && Math.hypot(o.x - px, o.y - py) < o.def.radius + u.def.radius + 2));
    if (dist < (crowded ? 18 : u.path.length > 1 ? 12 : 1.5)) {
      u.path.shift(); u.stuck = 0; // real progress: a unit that stopped to fight on the way isn't stuck (three such stops used to make it give up its order)
      if (!u.path.length) {
        u.goal = null;
        const next = u.queue.shift();
        if (next) { u.goal = next; u.path = this.route(u, next[0], next[1]); } else u.pace = 0;
      }
      return;
    }
    let want = Math.atan2(dy, dx), ease = 1;
    // Driving like people do: look ahead along the way you're going. Someone going your way just in
    // front? Ease off and follow at a gap. Someone standing there, coming at you or crossing? Steer
    // round them, keeping to the right when it's head-on. (Aircraft have the sky to themselves.)
    if (!d.air && !(u.path.length === 1 && dist < 48)) { // (on the last few steps the arriving rules take over)
      const fx = dx / dist, fy = dy / dist, look = d.radius + (u.pace || d.speed) * 0.9 + 16;
      let best: Unit | null = null, bestAhead = 1e9, bestLat = 0;
      this.near(u.x, u.y, look + 14, (o) => {
        if (o === u || o.def.air || o.ride) return; // (riders sit on a vehicle: they're not in the way)
        const rx = o.x - u.x, ry = o.y - u.y, ahead = rx * fx + ry * fy, lat = rx * -fy + ry * fx, room = d.radius + o.def.radius + this.gap(u, o);
        if (ahead <= 0 || ahead > look || Math.abs(lat) > room || ahead >= bestAhead) return;
        best = o; bestAhead = ahead; bestLat = lat;
      });
      if (best) {
        const o: Unit = best, room = d.radius + o.def.radius + this.gap(u, o), sameSpot = !!o.goal && !!u.goal && Math.hypot(o.goal[0] - u.goal[0], o.goal[1] - u.goal[1]) < 30, same = o.moving && !sameSpot && Math.cos(angDiff(o.heading, want)) > 0.6; // two heading for the same spot don't queue politely forever
        if (same) ease = Math.max(0, Math.min(1, (bestAhead - room) / 10)); // follow at a gap
        else if (!(o.goal === null && u.path.length === 1 && dist < 30)) { // steer round (not when it's standing on our own spot: arriving handles that)
          const side = Math.abs(bestLat) < 2 ? 1 : -Math.sign(bestLat), turnBy = Math.min(1.1, (1 - bestAhead / look) * 1.6 + 0.25); // pass on the side away from them; head-on, keep right
          const cx0 = t.cellOf(u.x), cy0 = t.cellOf(u.y), clear = (a: number) => { const r = d.radius + 10, x1 = t.cellOf(u.x + Math.cos(a) * r), y1 = t.cellOf(u.y + Math.sin(a) * r); return (x1 === cx0 && y1 === cy0) || t.step(cx0, cy0, x1, y1, d.crush); }; // only swerve onto ground we can drive on
          if (clear(want + side * turnBy)) want += side * turnBy;
          else if (clear(want - side * turnBy)) want -= side * turnBy;
          else { u.squeeze = this.time + 1.5; o.squeeze = this.time + 1.5; } // a one-lane gap: squeeze past each other slowly, as people do
          if (bestAhead < room) ease = Math.min(ease, (u.squeeze ?? 0) > this.time ? 0.5 : 0.35); // too close: creep while turning away (or squeezing by)
        }
      }
    }
    let diff = angDiff(u.heading, want);
    const turn = d.turn * dt;
    u.heading += Math.max(-turn, Math.min(turn, diff));
    diff = angDiff(u.heading, want);
    const go = d.vehicle ? Math.max(0, (Math.cos(diff) + 0.3) / 1.3) ** 1.5 : 1; // a vehicle slows into a turn but keeps rolling (it stopped dead for anything past about 45°)
    const ground = d.air ? -1 : t.type[t.idx(t.cellOf(u.x), t.cellOf(u.y))];
    const road = ground === T.ROAD || ground === T.BRIDGE ? (d.vehicle ? 1.3 : 1.1) : 1; // roads are quicker
    const step = Math.min(dist, (u.pace || d.speed) * (u.fallBack ? 1.2 : 1) * road * dt * go * ease);
    const nx = u.x + Math.cos(u.heading) * step, ny = u.y + Math.sin(u.heading) * step;
    const ax = t.cellOf(u.x), ay = t.cellOf(u.y), bx = t.cellOf(nx), by = t.cellOf(ny);
    if (d.air || (ax === bx && ay === by) || t.step(ax, ay, bx, by, d.crush)) { u.x = Math.max(0, Math.min(MAPSIZE - 1, nx)); u.y = Math.max(0, Math.min(MAPSIZE - 1, ny)); }
    else if (bx !== ax && t.step(ax, ay, bx, ay, d.crush) && Math.abs(nx - u.x) > 0.05) u.x = nx; // bumped an edge: slide along it, as a driver would,
    else if (by !== ay && t.step(ax, ay, ax, by, d.crush) && Math.abs(ny - u.y) > 0.05) u.y = ny; // rather than stopping to plan a whole new route
    else if (Math.abs(dx) > 1 && t.step(ax, ay, t.cellOf(u.x + Math.sign(dx) * step), ay, d.crush)) u.x += Math.sign(dx) * step; // still blocked: sidestep a full stride toward the next waypoint
    else if (Math.abs(dy) > 1 && t.step(ax, ay, ax, t.cellOf(u.y + Math.sign(dy) * step), d.crush)) u.y += Math.sign(dy) * step; // (a route straight past a corner, or a unit nudged into a building's edge, otherwise never got going again)
    else { if (this.pathBudget-- > 0 && pathStats.work < PATH_WORK) { u.path = findPath(t, u.x, u.y, u.goal?.[0] ?? px, u.goal?.[1] ?? py, d.crush, REPLAN); u.stuck++; } return; }
    if (!u.target) u.tHead = u.heading;
    u.moving = step > 0.01;
    u.bob += dt * 10;
    if (d.track && u.moving) {
      u.trackAcc += step;
      while (u.trackAcc > 1) { u.trackAcc -= 1; t.track(u.x - Math.cos(u.heading) * 8, u.y - Math.sin(u.heading) * 8, u.heading, d.track); }
    }
    if (u.enter && this.reach(u.x, u.y, u.enter) < 30) this.enter(u, u.enter); // at its edge, on any open side
    if (d.crush && u.moving) this.crush(u);
    if ((u.type === 'juggernaut' || u.type === 'colossus') && u.moving) { // too big to stop for soldiers (and the Colossus for vehicles)
      const under: Unit[] = [];
      this.near(u.x, u.y, 30, (o) => { if (!o.def.air && !o.ride && o.type !== 'colossus' && (!o.def.vehicle || u.type === 'colossus') && this.hostile(u.team, o.team) && Math.hypot(o.x - u.x, o.y - u.y) < u.def.radius) under.push(o); });
      for (const o of under) { if (o.def.vehicle) this.damage(o, 500 * dt, u.team, u); else this.killUnit(o); }
    }
    if (d.vehicle && !d.air && u.moving && (u.dust -= dt) <= 0) {
      u.dust = 0.12;
      const ty = t.type[t.idx(t.cellOf(u.x), t.cellOf(u.y))];
      if (ty <= 2) { // grass, dirt, scrap kick up dust
        const [bx, by] = this.scr({ x: u.x - Math.cos(u.heading) * 11, y: u.y - Math.sin(u.heading) * 11 });
        this.puffs.push({ x: bx + (Math.random() - 0.5) * 6, y: by, vx: (Math.random() - 0.5) * 4, vy: -3 - Math.random() * 3, t: 0, life: 0.9 + Math.random() * 0.6, c: ty === 0 ? '#8a8a62' : '#9a8664', s: 1 + (Math.random() < 0.4 ? 1 : 0) });
      }
    }
  }

  // Tanks and salvagers knock trees over.
  crush(u: Unit) {
    const fx = u.x + Math.cos(u.heading) * u.def.radius * 0.8, fy = u.y + Math.sin(u.heading) * u.def.radius * 0.8;
    const row = Math.floor(fy / CELL);
    for (let r = row - 1; r <= row + 1; r++) for (const tr of this.trees[r] ?? []) {
      if (tr.fall >= 0 || Math.hypot(tr.x - fx, tr.y - fy) > u.def.radius * 0.75) continue;
      tr.fall = 0;
      tr.dir = ((Math.round(u.heading / (Math.PI / 2)) % 4) + 4) % 4;
      audio.crunch(tr.x, tr.y);
    }
  }

  updateTrees(dt: number) {
    const t = this.terrain;
    for (let r = 0; r < N; r++) {
      const row = this.trees[r];
      for (let i = row.length - 1; i >= 0; i--) {
        const tr = row[i];
        if (tr.fall < 0) continue;
        tr.fall += dt;
        if (tr.fall < 0.5) continue;
        // landed: press the fallen trunk and the stump into the ground for good
        const s = this.treeLooks[tr.v].fall[tr.dir][2], st = this.stumpLook, [tsx, tsy] = this.scr(tr);
        t.stamp(Math.round(tsx), Math.round(tsy), (ctx, x, y) => {
          ctx.globalAlpha = 0.38; ctx.drawImage(s.shadow, Math.round(x - s.ax), Math.round(y - s.ay)); ctx.globalAlpha = 1;
          ctx.drawImage(s.img, Math.round(x - s.ax), Math.round(y - s.ay));
          ctx.drawImage(st.img, Math.round(x - st.ax), Math.round(y - st.ay));
        });
        row.splice(i, 1);
        const ci = t.idx(t.cellOf(tr.x), t.cellOf(tr.y));
        if (t.forest[ci] > 0) t.forest[ci]--;
      }
    }
  }

  // ---- the unit grid: units sorted into 4x4-cell buckets once a frame, so each unit only looks
  // at its neighbours (this is what lets thousands of units run smoothly)
  grid: Unit[][] = Array.from({ length: GB * GB }, () => []);
  buildGrid() {
    for (const b of this.grid) b.length = 0;
    for (const u of this.units) this.grid[this.bucket(u.x, u.y)].push(u);
    for (const b of this.bgrid) b.length = 0; // buildings that can be shot, by bucket of their middle
    for (const b of this.blds) if (b.max > 0 && b.dying < 0) this.bgrid[this.bucket((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL)].push(b);
  }
  bgrid: Bld[][] = Array.from({ length: GB * GB }, () => []);
  // calls f for every standing, damageable building whose middle is in the buckets touching a circle
  bldsNear(x: number, y: number, r: number, f: (b: Bld) => void) {
    const S = CELL * 4, x0 = Math.max(0, Math.floor((x - r) / S)), x1 = Math.min(GB - 1, Math.floor((x + r) / S)), y0 = Math.max(0, Math.floor((y - r) / S)), y1 = Math.min(GB - 1, Math.floor((y + r) / S));
    for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) for (const b of this.bgrid[by * GB + bx]) f(b);
  }
  bucket(x: number, y: number) { const bx = Math.max(0, Math.min(GB - 1, Math.floor(x / (CELL * 4)))), by = Math.max(0, Math.min(GB - 1, Math.floor(y / (CELL * 4)))); return by * GB + bx; }
  // calls f for every unit in the buckets touching a circle; return true from f to stop early
  near(x: number, y: number, r: number, f: (u: Unit) => boolean | void) {
    const S = CELL * 4, x0 = Math.max(0, Math.floor((x - r) / S)), x1 = Math.min(GB - 1, Math.floor((x + r) / S)), y0 = Math.max(0, Math.floor((y - r) / S)), y1 = Math.min(GB - 1, Math.floor((y + r) / S));
    for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) for (const u of this.grid[by * GB + bx]) if (f(u)) return;
  }
  separate() {
    for (const a of this.units) this.near(a.x, a.y, a.def.radius + 30, (b) => {
      if (b.id <= a.id || !!a.def.air !== !!b.def.air || a.ride || b.ride) return; // (riders sit on their vehicle)
      const tight = (a.squeeze ?? 0) > this.time || (b.squeeze ?? 0) > this.time, dx = b.x - a.x, dy = b.y - a.y, min = tight ? (a.def.radius + b.def.radius) * 0.4 : a.def.radius + b.def.radius + this.gap(a, b); // squeezing through a gap, they brush past
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) return;
      const d = Math.sqrt(d2), push = (min - d) * 0.4; // everyone keeps a little personal space
      const wa = a.unloading ? 0 : b.unloading ? 1 : a.moving && !b.moving ? 0.3 : b.moving && !a.moving ? 0.7 : 0.5; // a salvager unloading holds its spot
      this.nudge(a, (-dx / d) * push * wa * 2, (-dy / d) * push * wa * 2);
      this.nudge(b, (dx / d) * push * (1 - wa) * 2, (dy / d) * push * (1 - wa) * 2);
    });
  }
  gap(a: Unit, b: Unit) { return a.def.vehicle && b.def.vehicle ? 4 : a.def.vehicle || b.def.vehicle ? 3 : 1.5; } // the room people leave: more between vehicles
  nudge(u: Unit, dx: number, dy: number) {
    if (u.def.air) { u.x += dx; u.y += dy; return; }
    const t = this.terrain, ax = t.cellOf(u.x), ay = t.cellOf(u.y), bx = t.cellOf(u.x + dx), by = t.cellOf(u.y + dy);
    if ((ax === bx && ay === by) || t.step(ax, ay, bx, by, u.def.crush)) { u.x += dx; u.y += dy; }
  }

  // ------------------------------------------------------------------ drawing
  render() {
    const sh = this.shakeAt > 0 ? Math.round((Math.random() - 0.5) * this.shakeAt * 6) : 0; // a gusher shakes the view
    const ctx = this.ctx, vx = Math.round(this.vx) + sh, vy = Math.round(this.vy) + sh, M = this.mouse;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, this.FW, this.FH);
    if (this.state === 'loading') { this.hctx.clearRect(0, 0, this.HW, this.HH); this.withHud(() => this.drawLoading()); return; }
    this.terrain.draw(ctx, vx, vy, this.FW, this.FH);
    const day = this.sunNow();
    if (this.state !== 'title') { this.updateHillShade(day); this.drawHillShade(vx, vy, day); } // the land's own shadows: hills and mountains darken the ground away from the sun
    this.drawGlints(vx, vy);
    if (this.state !== 'title') this.drawBorders(vx, vy);
    for (const f of this.floods) { // floodwater rushing down the valley: streaks racing downstream, foam on the front
      const n = Math.min(Math.floor(f.at), f.cells.length), fade = Math.max(0, 1 - f.t / 40), C2 = CELL;
      for (let k = 0; k < n; k += 2) {
        const i = f.cells[k], cx = ((i % N) + 0.5) * C2, cy = (Math.floor(i / N) + 0.5) * C2, front = n - k < 14;
        const ph = ((this.time * 60 + (i * 37) % 97) % 40) - 20, gx = cx + f.ux * ph, gy = cy + f.uy * ph, [sx, sy] = toScreen(gx, gy), x = Math.round(sx - vx), y = Math.round(sy - vy);
        if (x < -10 || y < -10 || x > this.FW + 10 || y > this.FH + 10) continue;
        const [ex, ey] = toScreen(gx + f.ux * 6, gy + f.uy * 6);
        ctx.fillStyle = front ? `rgba(240,250,255,${0.9 * fade + 0.1})` : `rgba(220,240,250,${0.55 * fade})`;
        for (let s = 0; s <= 3; s++) ctx.fillRect(Math.round(x + ((ex - sx) * s) / 3), Math.round(y + ((ey - sy) * s) / 3), front ? 2 : 1, 1);
      }
    }
    const damShown = [this.hoverBld, this.selBld].find((b) => b?.type === 'dam' && b.dying < 0);
    if (damShown) { const d = this.dams.find((x) => x.b === damShown && !x.burst); if (d) { const blink = 0.45 + Math.sin(this.time * 4) * 0.2; ctx.fillStyle = `rgba(110,190,255,${blink})`; for (const i of d.zone) { const [sx, sy] = toScreen(((i % N) + 0.5) * CELL, (Math.floor(i / N) + 0.5) * CELL); if (sx - vx > -12 && sx - vx < this.FW + 12 && sy - vy > -12 && sy - vy < this.FH + 12) ctx.fillRect(Math.round(sx - vx) - 5, Math.round(sy - vy) - 3, 10, 6); } } } // the valley it would flood
    const items: { y: number; draw: () => void; shadow: () => void; sp?: Sprite; sx?: number; sy?: number }[] = []; // (sp at sx, sy: what casts a shadow under a flare)
    const sctx = this.sctx;
    // the light of the hour: art that was baked under the day's suns blends the two nearest, and every
    // shadow is re-aimed from where it was baked to where the sun is now
    const [li0, li1, lt] = day.mix, side = day.a < 0.5 ? 0 : 1, mBaked = this.aim(BAKED, day), mLit = this.aim(LIT_FALL[side], day);
    const sprite = (s: Sprite, x: number, y: number) => {
      const X = Math.round(x - s.ax), Y = Math.round(y - s.ay);
      if (!s.lit) { ctx.drawImage(s.img, X, Y); return; }
      ctx.drawImage(this.blended(s, s.lit.imgs, li0, li1, lt), X, Y);
    };
    const shadow = (s: Sprite, x: number, y: number) => {
      const e = this.aimed(s.lit ? s.lit.shadows[side] : s.shadow, s.ax, s.ay, s.lit ? mLit : mBaked, day.step);
      sctx.drawImage(e.c, Math.round(x + e.ox), Math.round(y + e.oy));
    };
    // the view covers a turned rectangle of ground: walk the ground rows it touches
    let gy0 = 1e9, gy1 = -1e9;
    for (const [cx, cy] of [[vx - 40, vy - 40], [vx + this.FW + 40, vy - 40], [vx - 40, vy + this.FH + 60], [vx + this.FW + 40, vy + this.FH + 60]]) { const g = toGround(cx, cy)[1]; gy0 = Math.min(gy0, g); gy1 = Math.max(gy1, g); }
    const r0 = Math.max(0, Math.floor(gy0 / CELL)), r1 = Math.min(N - 1, Math.floor(gy1 / CELL));
    for (let r = r0; r <= r1; r++) for (const tr of this.trees[r]) {
      const [tx, ty] = this.scr(tr), x = tx - vx, y = ty - vy;
      if (x < -30 || x > this.FW + 30 || y < -60 || y > this.FH + 40) continue;
      const look = this.treeLooks[tr.v];
      const s = tr.fall < 0 ? look.stand : look.fall[tr.dir][Math.min(2, Math.floor(tr.fall / 0.17))];
      items.push({ y: y + vy, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y), sp: s, sx: x, sy: y });
    }
    for (const m of this.mountains) { const x = m.x - vx, y = m.y - vy; if (x > this.FW || y > this.FH || x + m.img.width < 0 || y + m.img.height < 0) continue; items.push({ y: m.sortY, shadow: () => {}, draw: () => { ctx.drawImage(this.blended(m, m.imgs, li0, li1, lt), x, y); } }); } // (a mountain's three lights blend like a building's)
    for (const b of this.blds) {
      if (b.type === 'bridge') continue; // the deck is painted on the map
      if (!this.friendly(b.team) && b.team !== 2 && !b.seen) continue; // never spotted: not on your map yet
      const s = this.looks[this.lookKey(b)].body[0]; // (a dam faces the way its water runs)
      const [bx, by] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }), x = bx - vx, y = by - vy;
      if (x < -120 || x > this.FW + 120 || y < -160 || y > this.FH + 100) continue;
      const front = toScreen((b.cx + b.w) * CELL, (b.cy + b.h) * CELL)[1]; // its nearest corner decides draw order
      items.push({ y: front - 4, sp: b.rise >= 1 ? s : undefined, sx: x, sy: y, shadow: () => { if (b.rise >= 1) shadow(s, x, y); }, draw: () => {
        if (b.rise < 1) { // under construction: built for real, from the slab up (see constructionStage)
          sprite(this.constructionStage(b, Math.min(4, Math.floor(b.rise * 5))), x, y);
          if (b === this.selBld) this.outline(b, vx, vy);
          const no = this.waitNo.get(b);
          if (no) { // waiting its turn: a surveyor's stake in the site, its flag showing its place in the build queue
            const l = String(no), w = textWidth(l) + 5, sx2 = Math.round(x), sy2 = Math.round(y), top = sy2 - 20;
            ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx2 + 1, sy2, 3, 1); // its foot's shadow
            ctx.fillStyle = C.ink; ctx.fillRect(sx2 - 1, top, 3, 21); ctx.fillStyle = '#c8b890'; ctx.fillRect(sx2, top + 1, 1, 19); // the stake
            ctx.fillStyle = C.ink; ctx.fillRect(sx2 + 1, top - 1, w + 2, 10); ctx.fillStyle = C.gold; ctx.fillRect(sx2 + 2, top, w, 8); // the flag
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx2 + 2, top, w, 1);
            text(ctx, l, sx2 + 4, top + 2, C.ink);
          }
          return;
        }
        sprite(s, x, y);
        const tl = this.looks[this.lookKey(b)].turret;
        if (tl) { const d = this.looks[this.lookKey(b)].def, at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2]; sprite(facing(tl, b.tHead + YAW), x + YC * ox - YS * oz, y + (YS * ox + YC * oz) * SQ - at[1]); }
        if (b === this.selBld) this.outline(b, vx, vy);
        if (CAPTURE[b.type]) this.drawFlag(b, vx, vy);
        if (b.team === 0 && b.type !== 'wall' && !this.territory.linked.has(b)) this.drawCut(Math.round(x), Math.round(y - s.ay) - 3);
        if (b.type === 'derrick') { // gas flare flickering on its stack
          const dx = -16, dz = 16, fx = Math.round(x + YC * dx - YS * dz), fy = Math.round(y + (YS * dx + YC * dz) * SQ - 23), f = Math.floor(this.time * 12);
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(fx, fy - 1 - (f % 2), 1, 2);
          ctx.fillStyle = '#f07828'; ctx.fillRect(fx - (f % 3 === 0 ? 1 : 0), fy - 3 - (f % 2), 1, 2); ctx.fillRect(fx + (f % 3 === 1 ? 1 : 0), fy - 2, 1, 1);
        }
        // warning beacon on top of the signal tower blinks
        if (b.type === 'fieldCommand' && Math.sin(this.time * 3.5 + b.team) > 0.2) {
          const dx = 21, dz = -18, lx = x + YC * dx - YS * dz, ly = y + (YS * dx + YC * dz) * SQ - 52;
          ctx.fillStyle = '#ff5a3a'; ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
          ctx.fillStyle = 'rgba(255,90,58,0.35)'; ctx.fillRect(Math.round(lx) - 1, Math.round(ly), 3, 1); ctx.fillRect(Math.round(lx), Math.round(ly) - 1, 1, 3);
        }
      } });
    }
    for (const u of this.units) {
      if (!this.spot(u)) continue; // hidden in the fog, or concealed
      const look = this.looks[u.type + u.team];
      const [ux, uy] = this.scr(u), x = ux - vx, y = uy - vy - (!u.def.vehicle && u.moving ? Math.round(Math.abs(Math.sin(u.bob))) : 0) - (u.ride ? 8 : 0); // (riders sit up on the hull)
      if (x < -30 || x > this.FW + 30 || y < -30 || y > this.FH + 30) continue;
      const body = facing(look.body, u.heading + YAW); // headings are on the ground; the map is turned on screen
      const air = !!u.def.air, gy = air ? toScreen(u.x, u.y)[1] - vy : y; // aircraft cast their shadow on the ground far below
      // draw order: by depth on screen, except that anything standing in front of a building's side wall (out past its
      // squares on its right or left side, though higher up the screen than its nearest corner) is drawn after it, not hidden behind it
      let depth = toScreen(u.x, u.y)[1];
      if (!air) { const gx = u.x / CELL, gy = u.y / CELL; for (const b of this.blds) if (Math.abs(b.cx - gx) < 8 && Math.abs(b.cy - gy) < 8 && (gx >= b.cx + b.w || gy >= b.cy + b.h)) depth = Math.max(depth, toScreen((b.cx + b.w) * CELL, (b.cy + b.h) * CELL)[1] - 3); }
      items.push({
        y: depth + (air ? 4000 : 0) + (u.ride ? 12 : 0), shadow: () => { if (!u.ride) shadow(body, x, gy); }, sp: air || u.ride ? undefined : body, sx: x, sy: y, // (aircraft fly too high to throw a flare's shadow; riders are part of their vehicle's)
        draw: () => {
          sprite(body, x, y);
          if (u.type === 'gunship') { // rotor: a spinning blur of dark pixels
            const a = this.time * 30 + u.id, c = Math.cos(a), sn = Math.sin(a);
            ctx.fillStyle = 'rgba(20,20,20,0.55)';
            for (let r = -11; r <= 11; r += 1) { ctx.fillRect(Math.round(x + c * r), Math.round(y - 9 + sn * r * 0.5), 1, 1); ctx.fillRect(Math.round(x - sn * r), Math.round(y - 9 + c * r * 0.5), 1, 1); }
          }
          if (u.type === 'harvester' && u.moving) {
            // amber beacon bar on the cab flashes while it drives
            const a = u.heading + YAW, lx = x + Math.cos(a) * 9, ly = y + Math.sin(a) * 9 - 12;
            ctx.fillStyle = Math.floor(this.time * 6) % 2 ? '#ffc040' : '#a06818';
            ctx.fillRect(Math.round(lx) - 1, Math.round(ly), 2, 1);
          }
          if (look.turret) {
            const d = look.def, at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2];
            const c = Math.cos(u.heading + YAW), s = Math.sin(u.heading + YAW);
            sprite(facing(look.turret, u.tHead + YAW), x + ox * c - oz * s, y + ox * s + oz * c - (at[1] - d.bodyPivot[1]));
          }
        },
      });
    }
    for (const a of this.agents) {
      if (!this.vis[this.terrain.idx(Math.max(0, Math.min(N - 1, this.terrain.cellOf(a.x))), Math.max(0, Math.min(N - 1, this.terrain.cellOf(a.y))))]) continue;
      if (a.hidden) continue; // sheltering indoors
      const [ax, ay] = this.scr(a), x = ax - vx, y = ay - vy - (a.kind === 'civilian' && a.goal ? Math.round(Math.abs(Math.sin(a.step))) : 0);
      if (x < -20 || x > this.FW + 20 || y < -20 || y > this.FH + 20) continue;
      const s = facing(a.look, a.heading + YAW);
      items.push({ y: ay, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y), sp: s, sx: x, sy: y });
    }
    items.sort((a, b) => a.y - b.y);
    // all shadows go on one layer first, then down once, so overlapping shadows never stack up darker
    if (this.shadowLayer.width !== this.FW || this.shadowLayer.height !== this.FH) { this.shadowLayer.width = this.FW; this.shadowLayer.height = this.FH; }
    sctx.clearRect(0, 0, this.FW, this.FH);
    if (day.alpha > 0) {
      for (const it of items) it.shadow();
      ctx.globalAlpha = day.alpha; ctx.drawImage(this.shadowLayer, 0, 0); ctx.globalAlpha = 1;
    }
    for (const it of items) it.draw();
    // dust and smoke: pixel puffs that thin out as they rise
    for (const p of this.puffs) {
      const f = p.t / p.life, x = Math.round(p.x - vx), y = Math.round(p.y - vy);
      if (x < -4 || y < -4 || x > this.FW + 4 || y > this.FH + 4) continue;
      if (((x + y) & 1) && f > 0.5) continue;
      if (!this.seenAt(p.x, p.y + 10)) continue; // smoke in the fog would give the enemy away
      ctx.fillStyle = p.c; ctx.fillRect(x, y, p.s + (f > 0.4 ? 1 : 0), p.s);
    }
    // cloud shadows drifting over everything
    const cw = this.clouds.width, ox = Math.round(this.time * 7 - vx) % cw, oy = Math.round(this.time * 3 - vy) % cw;
    for (let y = (oy > 0 ? oy - cw : oy); y < this.FH; y += cw) for (let x = (ox > 0 ? ox - cw : ox); x < this.FW; x += cw) ctx.drawImage(this.clouds, x, y);
    this.drawBirds(vx, vy);
    if (this.state !== 'title') this.drawDaylight(vx, vy, items); // the time of day: one tint over the world, then lights glowing through the dark
    for (const tr of this.tracers) if (this.seenAt(tr.x1, tr.y1)) drawTracer(ctx, tr, vx, vy);
    for (const s of this.shells) if (s.t >= 0 && this.seenAt(s.tx, s.ty)) drawShell(ctx, s, vx, vy); // (bombs in a stick wait their turn)
    for (const b of this.blasts) if (this.seenAt(b.x, b.y)) drawBlast(ctx, b, vx, vy);
    this.drawDamage(vx, vy);
    if (this.state !== 'title') { this.drawFog(vx, vy); this.drawBlips(vx, vy); }
    // routes of selected units: a dotted line through each waypoint, with a small diamond at each stop
    for (const u of this.units) {
      if (!u.selected || u.team !== 0 || (!u.goal && !u.queue.length)) continue;
      let [px, py] = this.scr(u);
      for (const p of [u.goal, ...u.queue]) {
        if (!p) continue;
        const [qx, qy] = this.scr({ x: p[0], y: p[1] }), n = Math.max(1, Math.round(Math.hypot(qx - px, qy - py) / 3));
        ctx.fillStyle = 'rgba(126,224,138,0.55)';
        for (let i = 1; i < n; i += 2) ctx.fillRect(Math.round(px + ((qx - px) * i) / n - vx), Math.round(py + ((qy - py) * i) / n - vy), 1, 1);
        ctx.fillStyle = C.ok; ctx.fillRect(Math.round(qx - vx) - 1, Math.round(qy - vy), 3, 1); ctx.fillRect(Math.round(qx - vx), Math.round(qy - vy) - 1, 1, 3);
        [px, py] = [qx, qy];
      }
    }
    // move markers: a shrinking green diamond
    for (const m of this.markers) {
      const [mx, my] = this.scr(m), r = Math.round(8 * (1 - m.t / 0.6)) + 1, x = Math.round(mx - vx), y = Math.round(my - vy);
      ctx.fillStyle = C.ok;
      for (let i = -r; i <= r; i++) { const j = r - Math.abs(i); ctx.fillRect(x + i, y + Math.round(j / 2), 1, 1); ctx.fillRect(x + i, y - Math.round(j / 2), 1, 1); }
    }
    // rank chevrons over every veteran, gold on a dark edge, one per rank (not at the furthest zoom: there units are symbols)
    if (this.k > 1) for (const u of this.units) {
      if (!u.rank || u.ride || (u.team !== 0 && !this.friendly(u.team) && this.hid(u, 0))) continue;
      const [ux, uy] = this.scr(u), x = Math.round(ux - vx), y = Math.round(uy - vy) - (u.def.vehicle ? u.def.radius + 17 : 19); // above the health bar
      if (x < -8 || x > this.FW + 8 || y < -8 || y > this.FH + 8) continue;
      for (let k = 0; k < u.rank; k++) for (let dx = -3; dx <= 3; dx++) { const yy = y - k * 4 - 3 + Math.abs(dx); ctx.fillStyle = C.ink; ctx.fillRect(x + dx - 1, yy - 1, 3, 4); } // a dark edge first, then the gold
      for (let k = 0; k < u.rank; k++) for (let dx = -3; dx <= 3; dx++) { const yy = y - k * 4 - 3 + Math.abs(dx); ctx.fillStyle = C.gold; ctx.fillRect(x + dx, yy, 1, 2); }
    }
    // falling back: a small white flag over each unit running home
    if (this.k > 1) for (const u of this.units) {
      if (!u.fallBack || !this.friendly(u.team)) continue;
      const [ux, uy] = this.scr(u), x = Math.round(ux - vx) - u.def.radius - 3, y = Math.round(uy - vy) - u.def.radius - 6; // beside it, clear of the health bar
      if (x < -8 || x > this.FW + 8 || y < -8 || y > this.FH + 8) continue;
      ctx.fillStyle = C.ink; ctx.fillRect(x - 1, y - 1, 7, 5); ctx.fillRect(x - 1, y, 2, 9); ctx.fillStyle = C.cream; ctx.fillRect(x, y, 5, 3); ctx.fillRect(x, y, 1, 8);
    }
    // FLANKED / REAR HIT: a word rising off armour hit where it's thin
    for (const w of this.words) {
      const [wx, wy] = this.scr(w), lift = Math.round(w.t * 14), a = Math.min(1, (1.2 - w.t) * 3);
      if (a <= 0) continue;
      ctx.globalAlpha = a; text(ctx, w.s, Math.round(wx - vx - textWidth(w.s) / 2), Math.round(wy - vy) - 24 - lift, C.warn, 1, C.ink); ctx.globalAlpha = 1;
    }
    // selection brackets and health pips
    for (const u of this.units) {
      if (!u.selected) continue;
      const [ux, uy] = this.scr(u), x = Math.round(ux - vx), y = Math.round(uy - vy), r = u.def.radius + 2, top = y - (u.def.vehicle ? r + 6 : 11), bot = y + Math.round(r / 2) + 2;
      ctx.fillStyle = C.cream;
      for (const [cx, cy, sx, sy] of [[x - r, top, 1, 1], [x + r, top, -1, 1], [x - r, bot, 1, -1], [x + r, bot, -1, -1]]) { ctx.fillRect(cx - (sx < 0 ? 2 : 0), cy, 3, 1); ctx.fillRect(cx, cy - (sy < 0 ? 2 : 0), 1, 3); }
      bar(ctx, x - r + 1, top - 4, r * 2 - 1, u.hp / u.def.hp);
      if (u.type === 'harvester') { ctx.fillStyle = C.ink; ctx.fillRect(x - r, top - 1, r * 2 + 1, 3); ctx.fillStyle = '#c87a3a'; ctx.fillRect(x - r + 1, top, Math.round((r * 2 - 1) * (u.cargo / SCRAP_LOAD)), 1); }
    }
    // drag box: dotted pixel rectangle
    if (M.down && M.drag && this.state === 'play') {
      const x0 = Math.round(Math.min(M.sx, M.x)), x1 = Math.round(Math.max(M.sx, M.x)), y0 = Math.round(Math.min(M.sy, M.y)), y1 = Math.round(Math.max(M.sy, M.y));
      ctx.fillStyle = C.ok;
      for (let x = x0; x <= x1; x += 2) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x, y1, 1, 1); }
      for (let y = y0; y <= y1; y += 2) { ctx.fillRect(x0, y, 1, 1); ctx.fillRect(x1, y, 1, 1); }
    }
    for (const c of this.crates) { // a little wooden crate with a gold band
      if (!this.sees(c.x, c.y)) continue;
      const [cx, cy] = this.scr(c), x = Math.round(cx - vx), y = Math.round(cy - vy) - 5;
      if (x < -8 || y < -8 || x > this.FW + 8 || y > this.FH + 8) continue;
      ctx.fillStyle = C.ink; ctx.fillRect(x - 4, y - 1, 9, 7); ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x - 3, y, 7, 5); ctx.fillStyle = '#b08a4a'; ctx.fillRect(x - 3, y, 7, 1);
      ctx.fillStyle = Math.floor(this.time * 3) % 2 ? C.gold : '#d0a030'; ctx.fillRect(x, y, 1, 5); ctx.fillRect(x - 3, y + 2, 7, 1);
    }
    for (const m of this.strikes) { const [mx, my] = this.strikePos(m); ctx.fillStyle = '#fff8d0'; ctx.fillRect(Math.round(mx - vx) - 1, Math.round(my - vy) - 1, 3, 3); ctx.fillStyle = '#ff8a30'; ctx.fillRect(Math.round(mx - vx), Math.round(my - vy) + 2, 1, 2); }
    for (const u of this.units) if (u.team === 0 && u.selected && u.buildSite && u.buildSite.rise < 1) { // a selected builder's trip to a far site, dotted (for every builder at once it was a tangle of lines)
      const b = u.buildSite, [ax, ay] = this.scr(u), [bx, by] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }), n = Math.hypot(bx - ax, by - ay);
      if (n < 6 * CELL) continue;
      for (let k = (this.time * 12) % 7; k < n; k += 7) { const px = Math.round(ax + ((bx - ax) * k) / n - vx), py = Math.round(ay + ((by - ay) * k) / n - vy); ctx.fillStyle = C.ink; ctx.fillRect(px - 1, py - 1, 4, 4); ctx.fillStyle = C.gold; ctx.fillRect(px, py, 2, 2); }
    }
    this.drawPatrols(vx, vy);
    this.drawPlacement(vx, vy);
    const dl = this.dragLine();
    if (dl) { // the battle line being drawn: the line, a dot where each unit will stand, an arrow to the front
      const [ex, ey] = [M.x, M.y], [sx, sy] = [M.rsx - vx, M.rsy - vy], n = Math.hypot(ex - sx, ey - sy);
      for (let k = 0; k < n; k += 3) { ctx.fillStyle = C.ink; ctx.fillRect(Math.round(sx + ((ex - sx) * k) / n), Math.round(sy + ((ey - sy) * k) / n) + 1, 2, 1); ctx.fillStyle = C.gold; ctx.fillRect(Math.round(sx + ((ex - sx) * k) / n), Math.round(sy + ((ey - sy) * k) / n), 2, 1); }
      for (const [x, y] of dl.spots.values()) { const [px, py] = this.scr({ x, y }); ctx.fillStyle = C.ink; ctx.fillRect(Math.round(px - vx) - 2, Math.round(py - vy) - 2, 4, 4); ctx.fillStyle = C.ok; ctx.fillRect(Math.round(px - vx) - 1, Math.round(py - vy) - 1, 2, 2); }
      const { mx, my, fx, fy } = dl.line, [ax, ay] = this.scr({ x: mx, y: my }), [bx, by] = this.scr({ x: mx + fx * 30, y: my + fy * 30 });
      for (let k = 0; k <= 10; k++) { ctx.fillStyle = C.gold; ctx.fillRect(Math.round(ax + ((bx - ax) * k) / 10 - vx), Math.round(ay + ((by - ay) * k) / 10 - vy), 2, 2); }
      ctx.fillStyle = C.gold; ctx.fillRect(Math.round(bx - vx) - 2, Math.round(by - vy) - 2, 5, 5);
    }
    if (this.selBld?.rally) { const [rx, ry] = this.scr({ x: this.selBld.rally[0], y: this.selBld.rally[1] }); ctx.fillStyle = C.ok; ctx.fillRect(Math.round(rx - vx), Math.round(ry - vy) - 8, 1, 8); ctx.fillRect(Math.round(rx - vx) + 1, Math.round(ry - vy) - 8, 4, 3); }
    let cursorKind: 'arrow' | 'move' | 'select' | 'busy' | 'attack' | 'amove' | 'build' = 'arrow', hoverName = '', verb = '';
    if (M.in) {
      const over = this.state === 'play' && this.inView(M.y) ? this.unitAt(M.x + vx, M.y + vy) : null;
      this.hoverBld = this.state === 'play' && this.inView(M.y) ? this.bldAtScreen(M.x + vx, M.y + vy) : null;
      const armed = this.selected().some((u) => u.def.weapon);
      const kind = this.state !== 'play' || !this.inView(M.y) ? 'arrow' : this.attackMode ? 'amove' : over && over.team === 0 ? 'select' : armed && this.enemyAt(M.x + vx, M.y + vy) ? 'attack' : this.selected().length ? 'move' : 'arrow';
      cursorKind = kind;
      // name of whatever is under the cursor, shown beside it
      const hb = this.hoverBld, seenU = over && this.spot(over);
      // the less obvious things a right-click will do get a word in gold beside the cursor
      if (this.state === 'play' && this.inView(M.y) && !M.drag && !this.placing && kind !== 'select') {
        const it = this.attackMode ? 'amove' : this.intent(M.x + vx, M.y + vy).kind, uplink = this.selBld;
        verb = it === 'launch' && uplink ? ((uplink.timer ?? 0) >= UPLINK_TIME ? 'ORBITAL STRIKE' : `CHARGING ${Math.floor(((uplink.timer ?? 0) / UPLINK_TIME) * 100)}%`)
          : it === 'attack' && this.hoverBld?.type === 'dam' ? 'BLOW THE DAM' : it === 'attack' && this.hoverBld?.type === 'bridge' ? 'BLOW THE BRIDGE' : it === 'rebuild' ? `REBUILD THE BRIDGE $${DEF.bridge.cost}` : ({ amove: 'ATTACK-MOVE', rally: 'SET RALLY POINT', enter: 'MOVE IN', capture: 'CAPTURE', build: 'BUILD', repair: 'REPAIR', claim: 'CLAIM' } as Record<string, string>)[it] ?? '';
      }
      if (verb === 'BUILD' || verb === 'REPAIR') cursorKind = 'build'; // a right-click puts the builders to work: the cursor says so
      if (kind === 'attack' && !verb) { const foe = this.enemyAt(M.x + vx, M.y + vy), mine = this.selected().filter((u) => u.def.weapon && u.type !== 'builder'); if (foe && mine.length && this.weakAgainst(mine, foe)) verb = 'WEAK'; } // a warning before the order, not after
      hoverName = M.drag ? '' : seenU ? over!.def.name + this.tag(over!.team) : hb && (hb.team === 0 || hb.seen || hb.team === 2) ? (CAPTURE[hb.type]?.name ?? hb.name) + this.tag(hb.team) : '';
    }
    // the interface layer: side panel, caption, menus and the cursor, at a fixed pixel size
    this.hctx.clearRect(0, 0, this.HW, this.HH);
    this.withHud(() => {
      if (this.state === 'title') this.drawTitle();
      else { if (this.k === 1) this.drawIcons(vx, vy); this.drawPings(vx, vy); this.drawSidebar(); this.drawCaption(); if (this.hints && this.state === 'play') this.drawGoals(); if (this.state === 'play') { this.drawBanners(); } }
      if (this.state === 'paused') this.drawPause();
      if (this.state === 'won' || this.state === 'lost') this.drawEnd();
      if (M.in && (hoverName || verb) && this.state === 'play' && M.x < this.FW - SB) {
        const l = hoverName.toUpperCase(), gap = l && verb ? 6 : 0, w = textWidth(l) + gap + textWidth(verb) + 6;
        this.ctx.fillStyle = 'rgba(13,12,11,0.8)'; this.ctx.fillRect(M.x + 10, M.y + 12, w, 10);
        text(this.ctx, l, M.x + 13, M.y + 14, hoverName.includes('ENEMY') ? C.bad : C.cream);
        text(this.ctx, verb, M.x + 13 + textWidth(l) + gap, M.y + 14, verb === 'WEAK' ? C.bad : C.gold);
      }
      if (M.in) cursor(this.ctx, cursorKind, M.x, M.y, this.time);
    });
  }

  // ---- combat ----
  isUnit(t: Unit | Bld): t is Unit { return !!t && 'def' in t; } // (no attacker: fire, floods and blasts)
  alive(t: Unit | Bld) { return !!t && !t.gone && (this.isUnit(t) || t.dying < 0); } // (a flag, not a search: this runs for every unit every step)
  drop(u: Unit) { u.gone = true; this.units = this.units.filter((o) => o !== u); } // off the field for good
  dropBld(b: Bld) { b.gone = true; this.blds = this.blds.filter((o) => o !== b); }
  posOf(t: Unit | Bld): [number, number] { return this.isUnit(t) ? [t.x, t.y] : [(t.cx + t.w / 2) * CELL, (t.cy + t.h / 2) * CELL]; }
  armourOf(t: Unit | Bld): Armour { return this.isUnit(t) ? (t.def.air ? 'air' : t.def.vehicle ? 'veh' : 'inf') : 'bld'; }
  // can this weapon hit that target at all? (cannons can't hit aircraft; flak hits nothing else)
  canHit(w: Weapon, t: Unit | Bld) { return this.isUnit(t) && t.def.air ? (w.dmg.air ?? 0) > 0 : !w.airOnly && (!w.footOnly || (this.isUnit(t) && !t.def.vehicle)) && (!w.bldOnly || !this.isUnit(t)); }
  // the sides in this game, who is on whose team, and which start each side gets
  get sides() { return this.players === 2 ? [0, 1] : this.players === 3 ? [0, 1, 3] : [0, 1, 3, 4]; }
  ally = [0, 1, 2, 3, 4, 5];
  // ally[t]: t's team (in 2-against-2, you and gold share one)
  baseOf(team: number) { return this.players === 2 ? team : ({ 0: 0, 1: 2, 3: 1, 4: 3 } as Record<number, number>)[team] ?? 0; }
  tag(t: number) { return t === MARAUDER ? ' (MARAUDERS)' : this.hostile(0, t) ? ' (ENEMY)' : t !== 0 && t !== 2 ? ' (ALLY)' : ''; }
  friendly(t: number) { return t !== 2 && this.ally[t] === this.ally[0]; } // you or your ally
  hostile(a: number, b: number) { return a !== b && a !== 2 && b !== 2 && this.ally[a] !== this.ally[b]; }
  // distance from a point to a unit's edge or a building's footprint
  reach(x: number, y: number, t: Unit | Bld) {
    if (this.isUnit(t)) return Math.max(0, Math.hypot(t.x - x, t.y - y) - t.def.radius);
    const dx = Math.max(t.cx * CELL - x, 0, x - (t.cx + t.w) * CELL), dy = Math.max(t.cy * CELL - y, 0, y - (t.cy + t.h) * CELL);
    return Math.hypot(dx, dy);
  }
  // the enemy under the cursor, if any (for attack orders and the gunsight cursor)
  enemyAt(px: number, py: number): Unit | Bld | null {
    const u = this.unitAt(px, py);
    if (u && this.hostile(u.team, 0) && this.spot(u)) return u;
    const b = this.bldAtScreen(px, py);
    if (b && (b.type === 'dam' || (b.type === 'bridge' && b.team === 2 && b.rise >= 1)) && b.dying < 0) return b; // anyone may blow a dam or a bridge: only ever on purpose
    return b && b.max > 0 && this.hostile(b.team, 0) && b.dying < 0 && b.seen ? b : null;
  }
  nearestEnemy(team: number, x: number, y: number, range: number, min = 0, w?: Weapon): Unit | Bld | null {
    let best: Unit | Bld | null = null, bd = range;
    const far = range > 150; // long guns: only what that side can actually see, or has on radar (the computer plays by your rules)
    this.near(x, y, range + 12, (u) => { if (this.hostile(team, u.team) && !this.hid(u, team) && (!w || this.canHit(w, u)) && ((far && this.onRadar(team, u.x, u.y)) || (this.friendly(team) ? this.sees(u.x, u.y) : !far || this.seenBy(team, u.x, u.y)))) { const d = this.reach(x, y, u); if (d < bd && d >= min) { bd = d; best = u; } } });
    if (best || w?.airOnly) return best; // soldiers and vehicles first, buildings after (flak never shoots buildings)
    const S = CELL * 4, r = range + 3 * CELL, x0 = Math.max(0, Math.floor((x - r) / S)), x1 = Math.min(GB - 1, Math.floor((x + r) / S)), y0 = Math.max(0, Math.floor((y - r) / S)), y1 = Math.min(GB - 1, Math.floor((y + r) / S));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (const b of this.bgrid[gy * GB + gx]) if (b.dying < 0 && b.type !== 'dam' && this.hostile(team, b.team)) { const d = this.reach(x, y, b); if (d < bd) { bd = d; best = b; } } // (a dam is only ever blown on purpose)
    return best;
  }

  // ---- radar ----
  // A radar tower (finished, its side powered) picks up everything within RADAR_R squares, but only as contacts:
  // it lifts no fog. Long guns may fire on a contact. Your towers sweep round and paint a blip where the beam
  // crosses each contact, fading until the next pass. Troops hidden in forest don't show.
  radars: Bld[] = []; blips = new Map<Unit, { x: number; y: number; t: number }>();
  updateRadar(dt: number) {
    this.radars = this.blds.filter((b) => b.type === 'radar' && b.rise >= 1 && b.dying < 0 && b.team !== 2 && this.powers[b.team].made >= this.powers[b.team].used);
    const a1 = this.time * SWEEP, span = SWEEP * dt + 0.02, a0 = a1 - span;
    for (const r of this.radars) if (this.friendly(r.team)) {
      const cx = (r.cx + r.w / 2) * CELL, cy = (r.cy + r.h / 2) * CELL; // bearings on the ground, as the squared-up minimap draws the beam
      this.near(cx, cy, RADAR_R * CELL, (u) => {
        if (!this.hostile(r.team, u.team) || this.hid(u, 0) || Math.hypot(u.x - cx, u.y - cy) > RADAR_R * CELL) return;
        const d = (((Math.atan2(u.y - cy, u.x - cx) - a0) % TAU) + TAU) % TAU;
        if (d <= span) this.blips.set(u, { x: u.x, y: u.y, t: this.time });
      });
    }
    for (const [u, b] of this.blips) if (!this.alive(u) || this.time - b.t > TAU / SWEEP) this.blips.delete(u);
  }
  onRadar(team: number, x: number, y: number) { return this.radars.some((r) => this.ally[r.team] === this.ally[team] && Math.hypot((r.cx + r.w / 2) * CELL - x, (r.cy + r.h / 2) * CELL - y) < RADAR_R * CELL); }
  // blips on the battlefield: where the beam last caught each contact you can't otherwise see, fading
  drawBlips(vx: number, vy: number) {
    const ctx = this.ctx, life = TAU / SWEEP;
    for (const [u, b] of this.blips) {
      if (this.spot(u)) continue;
      const f = Math.max(0, 1 - (this.time - b.t) / life), [sx, sy] = this.scr({ x: b.x, y: b.y }), x = Math.round(sx - vx), y = Math.round(sy - vy);
      if (x < -8 || y < -8 || x > this.FW + 8 || y > this.FH + 8) continue;
      const s = u.def.vehicle || u.def.air ? 5 : 3, h = s >> 1;
      ctx.fillStyle = `rgba(8,20,10,${0.7 * f})`; ctx.fillRect(x - h - 1, y - h - 1, s + 2, s + 2);
      ctx.fillStyle = `rgba(126,224,138,${f})`; ctx.fillRect(x - h, y - h, s, s);
    }
  }

  // whether a side has eyes on a spot (yours uses the fog; the computer's is worked out the same way)
  seenBy(team: number, x: number, y: number) {
    let seen = false;
    this.near(x, y, 16 * CELL, (o) => (seen = o.team !== 2 && this.ally[o.team] === this.ally[team] && Math.hypot(o.x - x, o.y - y) < this.sightOf(o.type) * CELL));
    if (seen) return true;
    for (const b of this.blds) { const dx = (b.cx + b.w / 2) * CELL - x, dy = (b.cy + b.h / 2) * CELL - y; if (dx > 25 * CELL || dx < -25 * CELL || dy > 25 * CELL || dy < -25 * CELL) continue; if (b.team !== 2 && this.ally[b.team] === this.ally[team] && b.dying < 0 && Math.hypot(dx, dy) < this.bldSight(b) * CELL) return true; } // nothing sees further than 24 squares
    return false;
  }

  updateCombat(dt: number) {
    for (const u of [...this.units]) this.fight(u, dt);
    // defences and garrisons
    for (const b of this.blds) {
      if (b.dying >= 0 || b.rise < 1) continue;
      const wk = DEFENCE[b.type] ?? (b.garrison > 0 && b.team !== 2 ? 'garrison' : null);
      if (!wk) continue;
      const w = WEAPONS[wk], [bx, by] = this.posOf(b), range = w.range * (b.type === 'watchtower' ? 1.3 : 1);
      b.reload -= dt * (b.team === 2 || b.team === MARAUDER ? 1 : this.powerEff(b.team)) * (wk === 'garrison' ? b.garrison : 1); // short of power, guns load slower
      if (!b.target || !this.alive(b.target) || this.reach(bx, by, b.target) > range) b.target = this.nearestEnemy(b.team, bx, by, range, w.min ?? 0, w);
      if (!b.target) continue;
      const [tx, ty] = this.posOf(b.target), want = Math.atan2(ty - by, tx - bx);
      const spin = b.type === 'emplacement' ? 1.8 : b.type === 'flakTower' ? 4 : 0;
      if (spin) b.tHead += Math.max(-dt * spin, Math.min(dt * spin, angDiff(b.tHead, want))); else b.tHead = want;
      if (b.reload <= 0 && Math.abs(angDiff(b.tHead, want)) < 0.12) {
        b.reload = w.reload * (0.9 + Math.random() * 0.2);
        const [sx, sy] = this.scr({ x: bx, y: by }), h = ({ emplacement: 9, guardTower: 21, watchtower: 30, flakTower: 20 } as Record<string, number>)[b.type] ?? 6;
        const a = b.tHead + YAW, ml = ({ emplacement: 22, flakTower: 10 } as Record<string, number>)[b.type] ?? 6;
        this.shoot(sx + Math.cos(a) * ml, sy + Math.sin(a) * ml - h, b.target, w, b.team, b);
      }
    }
    // shells in flight
    for (const sh of this.shells) sh.t += dt;
    for (const sh of this.shells.filter((x) => x.t >= x.life)) this.explode(sh.gx, sh.gy, sh.w, sh.team, sh.src, sh.alt);
    this.shells = this.shells.filter((x) => x.t < x.life);
    for (const tr of this.tracers) tr.t += dt;
    this.tracers = this.tracers.filter((x) => x.t < 0.09);
    for (const f of this.flares) f.t += dt; this.flares = this.flares.filter((f) => f.t < f.life);
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((x) => x.t < 0.55);
    // fires on wrecks and ruins: smoke and the odd flame
    for (const f of this.fires) {
      f.t -= dt;
      if (Math.random() < dt * 8) this.puffs.push({ x: f.x + (Math.random() - 0.5) * f.s, y: f.y - 2, vx: 1 + Math.random() * 2, vy: -6 - Math.random() * 4, t: 0, life: 1.6 + Math.random(), c: Math.random() < 0.6 ? '#2a2826' : '#4a4642', s: 2 });
      if (Math.random() < dt * 10) this.puffs.push({ x: f.x + (Math.random() - 0.5) * f.s * 0.6, y: f.y - 1, vx: 0, vy: -8, t: 0, life: 0.3, c: Math.random() < 0.5 ? '#ffb040' : '#e05a20', s: 1 });
    }
    this.fires = this.fires.filter((f) => f.t > 0);
    // workshops patch up their side's vehicles parked close by (slower on low power), captured repair yards everyone's
    for (const b of this.blds) {
      if ((b.type !== 'workshop' && b.type !== 'repairYard') || b.rise < 1 || b.dying >= 0 || b.team === 2) continue;
      const yard = b.type === 'repairYard', rate = yard ? 15 : 30 * this.powerEff(b.team);
      const [bx, by] = this.posOf(b), hits: Unit[] = [];
      this.near(bx, by, 120, (u) => { if (u.team === b.team && !u.def.air && (yard || u.def.vehicle) && u.hp < u.def.hp && this.reach(u.x, u.y, b) < (yard ? 96 : 60)) hits.push(u); });
      for (const u of hits) {
        u.hp = Math.min(u.def.hp, u.hp + rate * dt);
        if (Math.random() < dt * 4) { const [sx, sy] = this.scr(u); this.puffs.push({ x: sx + (Math.random() - 0.5) * 8, y: sy - 8, vx: (Math.random() - 0.5) * 16, vy: -8, t: 0, life: 0.3, c: '#fff4b0', s: 1, g: 60 }); }
      }
    }
    // buildings going up in a chain of explosions
    for (const b of [...this.blds]) {
      if (b.dying < 0) continue;
      b.dying += dt;
      if (Math.random() < dt * 9) {
        const [sx, sy] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL);
        this.blasts.push({ x: sx, y: sy - Math.random() * 14, t: 0, size: 6 + Math.random() * 6 });
        if (Math.random() < 0.3) audio.explosion((b.cx + 1) * CELL, (b.cy + 1) * CELL, 1.4);
      }
      if (b.dying > 1.6) this.collapse(b);
    }
  }

  // A second gun (the Colossus's flak) picks its own targets and fires without turning the unit.
  fight2(u: Unit, dt: number) {
    const w = WEAPONS[u.def.weapon2!];
    u.reload2 -= dt;
    let scan = u.scanT < 0.05;
    if (!u.def.weapon) { scan = (u.scanT -= dt) <= 0; if (scan) u.scanT = 0.5; } // a unit with only this gun looks around on its own
    if (!u.target2 || !this.alive(u.target2) || this.reach(u.x, u.y, u.target2) > w.range) u.target2 = scan ? this.nearestEnemy(u.team, u.x, u.y, w.range, 0, w) : null;
    if (!u.target2 || u.reload2 > 0) return;
    u.reload2 = w.reload;
    const [sx, sy] = this.scr(u), big = u.def.radius > 20;
    this.shoot(sx + (Math.random() - 0.5) * (big ? 30 : 4), sy - (big ? 18 : 8), u.target2, w, u.team, u);
  }
  fight(u: Unit, dt: number) {
    if (u.ride) return; // no shooting from the back of a moving vehicle
    if (u.def.weapon2) this.fight2(u, dt);
    if (u.rank && u.hp < u.def.hp) u.hp = Math.min(u.def.hp, u.hp + Math.min(u.def.hp * 0.004, 2) * u.rank * dt); // veterans patch themselves up
    if (u.fallBack) { if (!u.goal && !u.path.length) u.fallBack = false; else { u.target = null; return; } } // running home: no stopping to fight
    if (u.scouting) { u.target = null; return; } // out scouting: it looks, it doesn't fight
    const w0 = u.def.weapon ? WEAPONS[u.def.weapon] : null;
    if (!w0) return;
    const w = !u.def.air && this.high(u.x, u.y) ? HIGH[u.def.weapon!] : w0; // on a plateau it sees and shoots further
    const turret = !!this.looks[u.type + u.team]?.turret, moving = !!u.goal && !u.amove && !u.forced; // moving: on a plain move order
    u.reload -= dt;
    if (u.target && !this.alive(u.target)) { // what it was sent at is gone
      u.target = null; u.forced = false;
      if (u.mopUp) { const [x, y] = u.mopUp; u.mopUp = null; u.goal = [x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40]; u.amove = true; u.path = this.route(u, u.goal[0], u.goal[1]); } // a struck target falls: press on to where it stood and finish what's there
    }
    if (u.strike) { // marching on a target: once there (or as soon as it's in reach), it's the one to hit
      if (!this.alive(u.strike)) u.strike = null;
      else {
        const there = !u.goal && !u.path.length, wv = u.wave;
        if (wv && there && wv.first < 0) wv.first = this.time;
        const all = !wv || wv.members.every((m) => !this.alive(m) || (!m.ride && !m.goal && !m.path.length)) || this.time - wv.first > 40; // everyone gathered (or a fair wait)
        if ((there && all) || this.reach(u.x, u.y, u.strike) <= w.range) { u.mopUp = this.posOf(u.strike); u.target = u.strike; u.forced = true; u.amove = false; u.goal = null; u.path = []; u.chase = 0; u.strike = null; u.wave = null; }
      }
    }
    if (!u.forced && (u.scanT -= dt) <= 0) {
      u.scanT = 0.3;
      // look for trouble when standing still or attack-moving (a plain move order ignores the enemy)
      // idle units notice enemies a little beyond their reach (and step up to fight them)
      // long guns only fire at what someone can see: the enemy's guns stay within their own sight
      const reach = w.range + (u.amove ? 24 : 40);
      if (!u.path.length || u.amove) u.target = this.nearestEnemy(u.team, u.x, u.y, reach, w.min ?? 0, w);
      else if (moving && turret) u.target = this.nearestEnemy(u.team, u.x, u.y, w.range, w.min ?? 0, w); // turrets fire on the move
    }
    if (u.goal && !u.amove && !u.forced && !turret) u.target = null; // on a plain move order: keep going, don't turn to fight
    if (u.target && !this.canHit(w, u.target)) { u.target = null; u.forced = false; }
    if (!u.target) return;
    const [tx, ty] = this.posOf(u.target), d = this.reach(u.x, u.y, u.target);
    if (w.min && d < w.min) { if (!u.forced) u.target = null; return; } // too close for the big gun
    if (d > w.range) {
      if (moving) { u.target = null; return; } // never chase while you're being moved away
      const close = d < w.range + 46; // a guard leash: idle units close a short gap, but don't chase far
      if (u.forced || (close && !u.goal)) {
        if ((u.chase -= dt) <= 0) {
          const c = u.chaseTo;
          if (c && u.path.length && u.path[u.path.length - 1] === c[2] && Math.hypot(tx - c[0], ty - c[1]) < 2 * CELL) u.chase = 1; // its chase route still leads there (a building never moves): keep it rather than plan the same one again
          else if (this.pathBudget > 0 && pathStats.work < PATH_WORK / 3) { this.pathBudget--; u.path = u.def.air ? [[tx, ty]] : findPath(this.terrain, u.x, u.y, tx, ty, u.def.crush, close ? REPLAN : undefined); u.chaseTo = [tx, ty, u.path[u.path.length - 1]]; u.chase = u.def.air || pathStats.reached ? 1 : 4; }
        }
      } // re-aimed once a second (no way through, say behind a wall: every few), within a slice of the frame's route planning
      else if (!u.amove) u.target = null;
      return;
    }
    if (!moving) u.path = []; // in range: stop and fight (attack-move picks its route up again afterwards)
    const want = Math.atan2(ty - u.y, tx - u.x);
    if (this.looks[u.type + u.team]?.turret) u.tHead += Math.max(-dt * 3, Math.min(dt * 3, angDiff(u.tHead, want)));
    else u.heading = u.tHead = want;
    if (u.reload <= 0 && Math.abs(angDiff(u.tHead, want)) < 0.15) {
      u.reload = w.reload * (0.9 + Math.random() * 0.2); u.firedAt = this.time; // shooting gives away a hidden position
      const [sx, sy] = this.scr(u), a = u.tHead + YAW, ml = u.def.vehicle ? 13 : 4, h = u.def.air ? 0 : u.def.vehicle ? 7 : 4;
      this.shoot(sx + Math.cos(a) * ml, sy + Math.sin(a) * ml - h, u.target, w, u.team, u);
    }
  }

  // Fire from a screen point at a target: bullets hit at once with a tracer; shells fly and explode.
  shoot(mx: number, my: number, t: Unit | Bld, w: Weapon, team: number, src: Unit | Bld) {
    const [gx, gy] = this.posOf(t), [ts, tsy] = this.scr({ x: gx, y: gy });
    const tAir = this.isUnit(t) && !!t.def.air, ty = tsy - (tAir ? ALT + 2 : this.isUnit(t) ? (t.def.vehicle ? 4 : 3) : 10);
    if (w.airOnly) for (let i = 0; i < 2; i++) this.puffs.push({ x: ts + (Math.random() - 0.5) * 10, y: ty + (Math.random() - 0.5) * 6, vx: 0, vy: -1, t: 0, life: 0.6 + Math.random() * 0.3, c: Math.random() < 0.5 ? '#2a2826' : '#4a4642', s: 2 }); // black flak bursts
    this.puffs.push({ x: mx, y: my, vx: 0, vy: 0, t: 0, life: 0.06, c: '#fff4c0', s: w.kind === 'shell' ? 3 : 1 }); // muzzle flash
    if (this.darkness() > 0.5 && Math.random() < 0.03 && this.flares.length < 8 && !this.flares.some((f) => Math.hypot(f.x - ts, f.y - tsy) < 240)) // a fight in the dark sends up a flare now and then
      this.flares.push({ x: ts + (Math.random() - 0.5) * 60, y: tsy + (Math.random() - 0.5) * 40, t: 0, life: 9 + Math.random() * 3, sway: 6 + Math.random() * 8 });
    if (w.stick) { // a stick of bombs falling in a line across the target
      const a = this.isUnit(src) ? src.heading : 0;
      for (let k = 0; k < w.stick; k++) {
        const o = (k - (w.stick - 1) / 2) * 16, bx = gx + Math.cos(a) * o, by = gy + Math.sin(a) * o, [es, esy] = this.scr({ x: bx, y: by });
        this.shells.push({ x: 0, y: 0, sx: mx + (Math.random() - 0.5) * 6, sy: my, tx: es, ty: esy - 2, t: -k * 0.12, life: 0.7, w, team, arc: 0, gx: bx, gy: by, src });
      }
      audio.cannon(gx, gy);
      return;
    }
    if (w.kind === 'bullet') {
      this.tracers.push({ x0: mx, y0: my, x1: ts + (Math.random() - 0.5) * 4, y1: ty + (Math.random() - 0.5) * 3, t: 0 });
      if (this.isUnit(t) || (t.type !== 'dam' && t.type !== 'bridge')) this.damage(t, (w.dmg[this.armourOf(t)] ?? 0) * (0.8 + Math.random() * 0.4), team, src); // bullets just chip concrete and timber: only blasts bring a dam or bridge down
      this.puffs.push({ x: ts + (Math.random() - 0.5) * 4, y: ty, vx: (Math.random() - 0.5) * 10, vy: -6, t: 0, life: 0.25, c: '#d8c8a0', s: 1 });
      audio.rifle(gx, gy);
      return;
    }
    const ex = gx + (Math.random() - 0.5) * 8, ey = gy + (Math.random() - 0.5) * 8, [es, esy] = this.scr({ x: ex, y: ey });
    const dist = Math.hypot(es - mx, esy - my);
    this.shells.push({ x: 0, y: 0, sx: mx, sy: my, tx: es, ty: esy - 3 - (tAir ? ALT : 0), alt: tAir ? ALT : 0, t: 0, life: dist / (w.speed ?? 280), w, team, arc: dist * (w.arc ?? 0.06), gx: ex, gy: ey, src });
    for (let i = 0; i < 4; i++) this.puffs.push({ x: mx, y: my, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 4, t: 0, life: 0.7, c: '#8a8478', s: 2 });
    audio.cannon(gx, gy);
  }

  explode(gx: number, gy: number, w: Weapon, team: number, src: Unit | Bld, alt = 0) {
    const r = w.splash ?? 10, [sx, sy] = this.scr({ x: gx, y: gy });
    this.blasts.push({ x: sx, y: sy - 3 - alt, t: 0, size: r * 0.8 });
    if (alt) { // an airburst: only aircraft are hurt
      const hit: Unit[] = [];
      this.near(gx, gy, r + 12, (u) => { if (u.def.air && this.hostile(team, u.team) && Math.hypot(u.x - gx, u.y - gy) - u.def.radius < r) hit.push(u); });
      for (const u of hit) this.damage(u, (w.dmg.air ?? 0), team, src);
      return;
    }
    audio.explosion(gx, gy, 1.2);
    const hit: Unit[] = [];
    this.near(gx, gy, r + 12, (u) => { if (!u.def.air && this.hostile(team, u.team) && Math.hypot(u.x - gx, u.y - gy) - u.def.radius < r) hit.push(u); });
    for (const u of hit) { const d = Math.hypot(u.x - gx, u.y - gy) - u.def.radius; this.damage(u, (w.dmg[this.armourOf(u)] ?? 0) * (1 - (Math.max(0, d) / r) * 0.6), team, src); }
    for (const b of this.blds) if (b.max > 0 && (this.hostile(team, b.team) || ((b.type === 'dam' || b.type === 'bridge') && b.team === 2)) && this.reach(gx, gy, b) < r * 0.5) this.damage(b, w.dmg.bld, team, src); // (dams and bridges belong to nobody: any blast can bring them down)
    if (w.clears) for (const b of this.blds) if (CAPTURE[b.type] && b.garrison > 0 && this.hostile(team, b.team) && this.reach(gx, gy, b) < r && Math.random() < 0.4) b.garrison--; // a grenade through the window
    this.scorch(sx, sy, r * 0.6);
    this.knockTrees(gx, gy, r);
    if (r >= 14 && Math.random() < 0.1) this.ignite(gx, gy); // heavy shells and bombs can set the woods alight
    for (let i = 0; i < 8; i++) this.puffs.push({ x: sx, y: sy - 2, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, t: 0, life: 0.6 + Math.random() * 0.4, c: Math.random() < 0.5 ? '#5a4a36' : '#3a3026', s: 1, g: 90 }); // flung earth
    for (let i = 0; i < 4; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * r, y: sy - 4, vx: (Math.random() - 0.5) * 6, vy: -5 - Math.random() * 5, t: 0, life: 1.5 + Math.random(), c: '#3a3634', s: 2 });
  }

  damage(t: Unit | Bld, amt: number, team: number, src: Unit | Bld) {
    if (!this.alive(t) || (!this.isUnit(t) && t.max <= 0)) return;
    if (src && this.isUnit(src)) amt *= 1 + src.rank * 0.1; // veterans hit harder...
    if (this.isUnit(t)) {
      amt /= 1 + t.rank * 0.1; // ...and take hits better
      if (t.fallBack) amt *= 0.75; // running for home: harder to hit
      if (t.def.vehicle && !t.def.air && src && !t.fallBack) { // armour is thinnest at the side and back (not counted on a unit running home: it has turned its back on purpose)
        const [sx, sy] = this.posOf(src), off = Math.abs(angDiff(t.heading, Math.atan2(sy - t.y, sx - t.x)));
        if (off > Math.PI / 3) {
          amt *= off > (2 * Math.PI) / 3 ? 1.5 : 1.25;
          if (this.time - t.flankT > 1.5) { t.flankT = this.time; this.words.push({ x: t.x, y: t.y, t: 0, s: off > (2 * Math.PI) / 3 ? 'REAR HIT' : 'FLANKED' }); }
        }
      }
    }
    if (this.friendly(t.team) && this.hostile(team, t.team)) this.ping(...this.posOf(t), amt);
    const victim = this.ais.find((a) => a.me === t.team); if (victim) { victim.grudge[team] = (victim.grudge[team] ?? 0) + amt; if (this.isUnit(src) && src.def.air) victim.airHit(); } // remembered when it picks a target; air raids noticed at once
    if (!this.isUnit(t) && this.fort.has(t)) amt *= 0.75; // a fortified line shrugs off a quarter
    if (this.isUnit(t)) t.hitAt = this.time;
    if (this.isUnit(t) && t.riders.length && amt > 0) { const rs = [...t.riders]; for (const r of rs) this.dismount(r); for (const r of rs) this.damage(r, amt * 0.35, team, src); } // riders are exposed: a hit hurts them and knocks them off
    if (src && this.isUnit(src) && this.hostile(src.team, t.team)) { // experience: the damage that landed (half for buildings)
      const before = src.rank; src.xp += Math.min(amt, Math.max(0, t.hp)) * (this.isUnit(t) ? 1 : 0.5);
      if (src.rank > before && src.team === 0) this.bark = { who: src.def.name, line: ['Promoted!', 'Veteran now.', 'Elite!'][src.rank - 1], t: 2 };
    }
    t.hp -= amt;
    if (t.team === 0 && this.time - this.alertT > 25) { // tell the player when they're hit, now and then
      this.alertT = this.time;
      this.warn(this.isUnit(t) ? 'Our units are under attack!' : 'Our base is under attack!', this.posOf(t));
    }
    if (this.isUnit(t)) {
      if (!t.target && !t.fallBack && !t.scouting && t.def.weapon && this.alive(src) && (!t.goal || t.amove)) t.target = src; // shoot back, unless you ordered it away
      if (t.hp <= 0) this.killUnit(t);
    } else if (t.hp <= 0 && t.dying < 0) {
      t.dying = 0; t.hp = 0;
      if (t === this.selBld) this.selBld = null;
      this.bark = { who: t.team === 0 ? 'Base' : 'Field report', line: t.team === 0 ? `We've lost the ${t.name}!` : `Enemy ${t.name} destroyed.`, t: 3 };
    }
  }

  killUnit(u: Unit) {
    this.drop(u);
    if (u.team === 0 && u.rank >= 2 && (!this.bark || this.bark.t < 1)) this.bark = { who: 'Command', line: u.rank === 3 ? 'We lost an elite crew.' : 'We lost a veteran.', t: 2.5 };
    this.stats.lost[u.team === 2 ? 0 : u.team]++;
    for (const d of this.divisions) if (d) { d.units = d.units.filter((o) => o !== u); d.fresh = d.fresh.filter((o) => o !== u); }
    const [sx, sy] = this.scr(u);
    if (!u.def.vehicle) { // a puff of dust and he's gone
      for (let i = 0; i < 5; i++) this.puffs.push({ x: sx, y: sy - 2, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 4, t: 0, life: 0.8, c: '#8a8070', s: 1 });
      return;
    }
    this.blasts.push({ x: sx, y: sy - 4, t: 0, size: 14 });
    this.leaveScrap(u.x, u.y, (DEF[u.type]?.cost ?? 600) * 0.4, 0);
    audio.explosion(u.x, u.y, 2.2);
    this.shakeAt = Math.max(this.shakeAt, 0.25);
    for (let i = 0; i < 14; i++) this.puffs.push({ x: sx, y: sy - 4, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 40, t: 0, life: 0.8 + Math.random() * 0.5, c: ['#3a3a3e', '#5a5e64', '#2a2a2a', '#7a5a3a'][i % 4], s: 1, g: 90 });
    // the burnt-out hull stays behind, pressed into the ground
    const look = this.looks[u.type + u.team], spr = facing(look.body, u.heading + YAW);
    const c = document.createElement('canvas'); c.width = spr.img.width; c.height = spr.img.height;
    const cx2 = c.getContext('2d')!; cx2.drawImage(spr.img, 0, 0);
    cx2.globalCompositeOperation = 'source-atop'; cx2.fillStyle = 'rgba(28,22,18,0.78)'; cx2.fillRect(0, 0, c.width, c.height);
    this.scorch(sx, sy, 9);
    this.terrain.stamp(Math.round(sx), Math.round(sy), (ctx, x, y) => ctx.drawImage(c, Math.round(x - spr.ax), Math.round(y - spr.ay)));
    this.fires.push({ x: sx, y: sy - 4, t: 9, s: 8 });
  }

  // The building is gone: scorched rubble where it stood, and the ground is free again.
  // ---- orbital strikes (from the uplink) ----
  strikes: { team: number; sx: number; sy: number; tx: number; ty: number; t: number; dur: number; done?: boolean }[] = [];
  launch(b: Bld, tx: number, ty: number) {
    if ((b.timer ?? 0) < UPLINK_TIME) return false;
    b.timer = 0;
    const sx = (b.cx + 1) * CELL, sy = (b.cy + 1) * CELL;
    this.strikes.push({ team: b.team, sx, sy, tx, ty, t: 0, dur: Math.max(6, Math.hypot(tx - sx, ty - sy) / 320) });
    audio.explosion(sx, sy, 1.6);
    if (this.hostile(0, b.team)) this.warn('ORBITAL STRIKE INBOUND!', [tx, ty]);
    else this.bark = { who: 'Orbital Uplink', line: 'Strike called down from orbit.', t: 3 };
    return true;
  }
  updateStrikes(dt: number) {
    // the uplink charges, interceptors reload (slower on low power)
    for (const b of this.blds) {
      if (b.rise < 1 || b.dying >= 0 || b.team === 2) continue;
      const rate = (b.team === MARAUDER ? 1 : this.powerEff(b.team));
      if (b.type === 'uplink') { // charges only while one side holds it; a new holder starts from nothing
        if (b.holder !== b.team) { b.holder = b.team; b.timer = 0; }
        const before = b.timer ?? 0; b.timer = Math.min(UPLINK_TIME, before + dt);
        const who = this.friendly(b.team) ? 'Our' : 'The enemy';
        if (before < UPLINK_TIME - 60 && b.timer >= UPLINK_TIME - 60) this.warn(`${who} uplink will be charged in one minute.`, this.posOf(b));
        if (before < UPLINK_TIME && b.timer >= UPLINK_TIME) { this.warn(`${who} uplink is charged: an orbital strike is ready!`, this.posOf(b)); this.banner = { title: 'ORBITAL STRIKE READY', sub: (this.friendly(b.team) ? 'SELECT THE UPLINK AND RIGHT-CLICK A TARGET' : 'TAKE THE UPLINK OR GET UNDER AN INTERCEPTOR'), t: 4, c: C.bad }; }
      }
      if (b.type === 'interceptor') { b.ammo = b.ammo ?? 0; if (b.ammo < 2) { b.timer = (b.timer ?? 0) + dt * rate; if (b.timer >= INTERCEPT_RELOAD) { b.timer = 0; b.ammo++; } } }
    }
    for (const m of this.strikes) {
      m.t += dt;
      const f = Math.min(1, m.t / m.dur), [px, py] = this.strikePos(m);
      if (Math.random() < dt * 30) this.puffs.push({ x: px, y: py + 2, vx: (Math.random() - 0.5) * 3, vy: 1, t: 0, life: 1.4, c: Math.random() < 0.5 ? '#c8c4bc' : '#9a968e', s: 2 });
      // interceptors near the target have a go once it starts coming down
      if (f > 0.7 && !m.done) {
        const guard = this.blds.find((b) => b.type === 'interceptor' && this.hostile(m.team, b.team) && b.rise >= 1 && b.dying < 0 && (b.ammo ?? 0) > 0 && Math.hypot((b.cx + 1) * CELL - m.tx, (b.cy + 1) * CELL - m.ty) < INTERCEPT_RANGE * CELL);
        if (guard) {
          guard.ammo!--; m.done = true;
          const [gx, gy] = this.scr({ x: (guard.cx + 1) * CELL, y: (guard.cy + 1) * CELL });
          this.tracers.push({ x0: gx, y0: gy - 20, x1: px, y1: py, t: 0 });
          for (let i = 0; i < 4; i++) this.blasts.push({ x: px + (Math.random() - 0.5) * 16, y: py + (Math.random() - 0.5) * 10, t: -i * 0.08, size: 14 });
          audio.explosion(m.tx, m.ty, 2);
          if (guard.team === 0) this.bark = { who: 'Interceptor', line: 'Orbital strike destroyed in flight!', t: 3 };
          else this.bark = { who: 'Orbital Uplink', line: 'Our strike was intercepted.', t: 3 };
        }
      }
      if (f >= 1 && !m.done) { m.done = true; this.detonate(m.tx, m.ty); }
    }
    this.strikes = this.strikes.filter((m) => !m.done);
  }
  strikePos(m: { sx: number; sy: number; tx: number; ty: number; t: number; dur: number }): [number, number] {
    const f = Math.min(1, m.t / m.dur), [ax, ay] = toScreen(m.sx, m.sy), [bx, by] = toScreen(m.tx, m.ty);
    return [ax + (bx - ax) * f, ay + (by - ay) * f - Math.sin(f * Math.PI) * Math.min(700, Math.hypot(bx - ax, by - ay) * 0.5)];
  }
  // An orbital strike lands: everything within five cells is hurt, friend or foe.
  detonate(gx: number, gy: number) {
    const R = 5 * CELL, [sx, sy] = this.scr({ x: gx, y: gy });
    for (let i = 0; i < 18; i++) this.blasts.push({ x: sx + (Math.random() - 0.5) * 110, y: sy - Math.random() * 70, t: -Math.random() * 0.6, size: 16 + Math.random() * 16 });
    this.shakeAt = 1.6; audio.explosion(gx, gy, 3);
    const hit: Unit[] = [];
    this.near(gx, gy, R + 30, (u) => { if (Math.hypot(u.x - gx, u.y - gy) < R) hit.push(u); });
    for (const u of hit) if (this.alive(u)) { u.hp -= 800 * (1 - Math.hypot(u.x - gx, u.y - gy) / R * 0.5); if (u.hp <= 0) this.killUnit(u); }
    for (const o of [...this.blds]) if (o.max > 0 && o.dying < 0 && this.reach(gx, gy, o) < R) { o.hp -= 2600; if (o.hp <= 0) { o.hp = 0; o.dying = 0; } }
    this.scorch(sx, sy, 50); this.knockTrees(gx, gy, R + 20);
    for (let i = 0; i < 5; i++) this.fires.push({ x: sx + (Math.random() - 0.5) * 80, y: sy + (Math.random() - 0.5) * 40, t: 20 + Math.random() * 20, s: 10 });
  }
  // A destroyed Fusion Reactor goes up in a blast that hurts everyone nearby, friend or foe.
  meltdown(gx: number, gy: number) {
    const R = 5 * CELL, [sx, sy] = this.scr({ x: gx, y: gy });
    for (let i = 0; i < 10; i++) this.blasts.push({ x: sx + (Math.random() - 0.5) * 60, y: sy - Math.random() * 40, t: -Math.random() * 0.4, size: 14 + Math.random() * 12 });
    this.shakeAt = 1.2; audio.explosion(gx, gy, 3);
    const hit: Unit[] = [];
    this.near(gx, gy, R, (u) => { if (Math.hypot(u.x - gx, u.y - gy) < R) hit.push(u); });
    for (const u of hit) if (this.alive(u)) { u.hp -= 450 * (1 - Math.hypot(u.x - gx, u.y - gy) / R * 0.5); if (u.hp <= 0) this.killUnit(u); }
    for (const o of [...this.blds]) if (o.max > 0 && o.dying < 0 && this.reach(gx, gy, o) < R) { o.hp -= 700; if (o.hp <= 0) { o.hp = 0; o.dying = 0; } }
    this.scorch(sx, sy, 30); this.knockTrees(gx, gy, R);
  }
  // ---- things worth grabbing out on the map ----
  crates: { x: number; y: number }[] = []; claimT = 0; crateT = 75;
  // Supply crates fall in symmetric sets on open ground; whoever touches one first gets $800.
  // The first few fall round the middle, the same distance from every base: a race from the start.
  dropCrates(mid = false) {
    const t = this.terrain;
    if (this.crates.length > 6 * t.orbit([0, 0]).length) return;
    for (let k = 0; k < 60; k++) {
      const a0 = Math.random() * Math.PI * 2, r0 = 18 + Math.random() * 22; // round the citadel's moat
      const x = mid ? Math.round(N / 2 + Math.cos(a0) * r0) : 6 + Math.floor(Math.random() * (N - 12)), y = mid ? Math.round(N / 2 + Math.sin(a0) * r0) : 6 + Math.floor(Math.random() * (N - 12)), set = t.orbit([x, y]);
      if (set.some(([a, b]) => !t.open(a, b, false) || t.type[t.idx(a, b)] > T.DIRT || t.bases.some(([bx, by]) => Math.hypot(bx - a, by - b) < 25))) continue;
      for (const [a, b] of set) this.crates.push({ x: (a + 0.5) * CELL, y: (b + 0.5) * CELL });
      return;
    }
  }
  claimAndCollect() {
    // a derelict is claimed by the first side to roll up beside it, repaired to sixty per cent
    for (const d of this.units) {
      if (d.team !== 2 || !d.def.weapon) continue;
      let by: Unit | null = null;
      this.near(d.x, d.y, 30, (o) => { if (o.team !== 2 && !o.def.air && Math.hypot(o.x - d.x, o.y - d.y) < 26) { by = o; return true; } });
      if (!by) continue;
      const who = (by as Unit).team;
      d.team = who; d.hp = d.def.hp * 0.6;
      if (who === 0) { this.bark = { who: d.def.name, line: 'Abandoned machine claimed. Back in the fight.', t: 3 }; audio.radio(); }
    }
    // crates: first come, first paid
    this.crates = this.crates.filter((c) => {
      let by: Unit | null = null;
      this.near(c.x, c.y, 24, (o) => { if (o.team !== 2 && !o.def.air && o.type !== 'builder' && Math.hypot(o.x - c.x, o.y - c.y) < 18) { by = o; return true; } });
      if (!by) return true;
      const who = (by as Unit).team;
      this.prods[who].credits += 800;
      if (who === 0) { this.bark = { who: 'Supply crate', line: '+$800', t: 2 }; audio.click(); }
      const [sx, sy] = this.scr(c);
      for (let i = 0; i < 6; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 8, y: sy - 4, vx: (Math.random() - 0.5) * 12, vy: -12, t: 0, life: 0.6, c: '#ffd040', s: 1 });
      return false;
    });
  }
  // Wrecks are worth salvaging: scrap is left on the ground around them for salvagers to collect.
  leaveScrap(gx: number, gy: number, worth: number, r: number) {
    const t = this.terrain, cx0 = t.cellOf(gx), cy0 = t.cellOf(gy), cells: number[] = [];
    for (let y = cy0 - r; y <= cy0 + r; y++) for (let x = cx0 - r; x <= cx0 + r; x++) if (t.inside(x, y) && t.type[t.idx(x, y)] !== T.WATER && t.type[t.idx(x, y)] !== T.ROCK) cells.push(t.idx(x, y));
    for (const i of cells) t.scrap[i] += worth / cells.length;
  }
  collapse(b: Bld) {
    this.dropBld(b);
    if (b.type === 'bridge') { this.breakBridge(b); return; }
    if (b.type === 'reactor') this.meltdown((b.cx + 1.5) * CELL, (b.cy + 1.5) * CELL);
    if (b.type === 'dam') { this.burstDam(b); for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0; this.addBld('damRuin', 2, b.cx, b.cy, b.w, b.h, 'Breached Dam'); this.blds[this.blds.length - 1].face = b.face; return; } // its breached wall stays
    const boom = BOOM[b.type]; // fuel goes up, and can set off what's next to them
    if (boom) this.blowUp((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, boom[0], boom[1]);
    if (DEF[b.type]) this.leaveScrap((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, DEF[b.type].cost * 0.3, Math.ceil(Math.max(b.w, b.h) / 2));
    if (this.hostile(0, b.team)) this.stats.razed[0]++; // enemy buildings brought down
    for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
    if (this.terrain.type[this.terrain.idx(b.cx, b.cy)] === T.WATER) return; // under a flood: the rubble sinks out of sight
    const DEB = ['#2a2622', '#3a3430', '#5a5048', '#6a6258', '#1a1816', '#7a5a3a'];
    for (let gy = b.cy * CELL; gy < (b.cy + b.h) * CELL; gy++) for (let gx = b.cx * CELL; gx < (b.cx + b.w) * CELL; gx++) {
      if (Math.random() < 0.25) continue;
      const [sx, sy] = toScreen(gx, gy), lift = this.terrain.lift(gx, gy);
      const c = DEB[(Math.random() * DEB.length) | 0];
      this.terrain.stamp(Math.round(sx), Math.round(sy - lift), (ctx, x, y) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); });
    }
    for (let i = 0; i < b.w * b.h; i++) { const [sx, sy] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL); this.fires.push({ x: sx, y: sy, t: 10 + Math.random() * 8, s: 10 }); }
    const [sx, sy] = toScreen((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL);
    this.blasts.push({ x: sx, y: sy - 8, t: 0, size: 10 + b.w * 5 });
    audio.collapse((b.cx + 1) * CELL, (b.cy + 1) * CELL);
    this.shakeAt = Math.max(this.shakeAt, 0.6);
  }

  // A blackened crater pressed into the ground.
  scorch(sx: number, sy: number, r: number) {
    this.terrain.stamp(Math.round(sx), Math.round(sy), (ctx, x, y) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r * 1.3; dx <= r * 1.3; dx++) {
        const d = Math.hypot(dx / 1.3, dy) / r + (Math.random() - 0.5) * 0.3;
        if (d > 1) continue;
        ctx.fillStyle = d < 0.45 ? 'rgba(20,16,12,0.55)' : d > 0.8 && Math.random() < 0.3 ? 'rgba(120,100,70,0.35)' : 'rgba(30,24,18,0.3)';
        ctx.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
      }
    });
  }

  // Blasts topple nearby trees, falling away from the explosion.
  // Clear a building site of trees: they topple.
  fell(b: Bld) {
    for (let r = b.cy - 1; r <= b.cy + b.h; r++) for (const tr of this.trees[r] ?? []) {
      if (tr.fall >= 0 || tr.x < b.cx * CELL - 4 || tr.x > (b.cx + b.w) * CELL + 4 || tr.y < b.cy * CELL - 4 || tr.y > (b.cy + b.h) * CELL + 4) continue;
      tr.fall = 0; tr.dir = Math.floor(Math.random() * 4);
    }
  }
  knockTrees(gx: number, gy: number, r: number) {
    const row = Math.floor(gy / CELL);
    for (let rr = row - 1; rr <= row + 1; rr++) for (const tr of this.trees[rr] ?? []) {
      if (tr.fall >= 0 || Math.hypot(tr.x - gx, tr.y - gy) > r) continue;
      tr.fall = 0; tr.dir = ((Math.round(Math.atan2(tr.y - gy, tr.x - gx) / (Math.PI / 2)) % 4) + 4) % 4;
    }
  }

  emptyGarrison(b: Bld) {
    const ox = (b.cx + b.w / 2) * CELL, oy = (b.cy + b.h + 0.7) * CELL;
    for (let i = 0; i < b.garrison; i++) { const u = this.addUnit('rifle', b.team, ox - 6 + i * 6, oy); u.heading = u.tHead = Math.PI / 2; }
    b.garrison = 0; audio.click();
    this.bark = { who: b.name, line: 'Everybody out.', t: 2 };
  }

  // Damaged buildings smoke, badly damaged ones burn; health shows on anything hurt.
  drawDamage(vx: number, vy: number) {
    const ctx = this.ctx;
    for (const b of this.blds) {
      if (b.max <= 0 || b.dying >= 0) continue;
      const f = b.hp / b.max, [sx, sy] = toScreen((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL), x = Math.round(sx - vx), y = Math.round(sy - vy);
      if (x < -60 || x > this.FW + 60 || y < -80 || y > this.FH + 40) continue;
      if (f < 0.6 && Math.random() < 0.15) this.puffs.push({ x: sx + (Math.random() - 0.5) * b.w * 14, y: sy - 14, vx: 2, vy: -6, t: 0, life: 2, c: f < 0.3 ? '#2a2826' : '#5a5650', s: 2 });
      if (f < 0.3 && Math.random() < 0.3) this.puffs.push({ x: sx + (Math.random() - 0.5) * b.w * 10, y: sy - 10, vx: 0, vy: -10, t: 0, life: 0.3, c: '#ff9a30', s: 1 });
      if ((f < 1 || b === this.selBld) && (b.team === 0 || this.seenAt(sx, sy))) bar(ctx, x - 12 * b.w, y - 26 - b.h * 6, 24 * b.w, f);
    }
    for (const u of this.units) {
      if (u.selected || u.hp >= u.def.hp) continue;
      const [sx, sy] = this.scr(u), x = Math.round(sx - vx), y = Math.round(sy - vy), r = u.def.radius + 2;
      if (x < -20 || x > this.FW + 20 || y < -20 || y > this.FH + 20) continue;
      bar(ctx, x - r + 1, y - (u.def.vehicle ? r + 10 : 15), r * 2 - 1, u.hp / u.def.hp);
    }
  }

  // ---- fog of war ----
  sees(x: number, y: number) { const t = this.terrain, cx = t.cellOf(x), cy = t.cellOf(y); return t.inside(cx, cy) && this.vis[t.idx(cx, cy)] === 2; }
  bldSight(b: Bld) { return b.rise < 1 ? Math.min(2, this.sightOf(b.type)) : this.sightOf(b.type, b.garrison); } // a site under construction sees only its own ground: a radar sees nothing until it stands
  sightOf(type: string, garrison = 0) { const s = type === 'watchtower' ? (garrison ? 11 : 0) : type === 'bunker' ? (garrison ? 6 : 0) : SIGHT[type] ?? 5; return Math.min(24, Math.round(s * SIGHT_SCALE)); } // a little wider than the table, for everyone; nothing sees past 24
  updateFog() {
    const v = this.vis, t = this.terrain;
    for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
    let explored = false; // new ground uncovered? only then do the fog pictures need redrawing
    const reveal = (x: number, y: number, r: number) => {
      const cx = t.cellOf(x), cy = t.cellOf(y);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r && t.inside(cx + dx, cy + dy)) { const i = t.idx(cx + dx, cy + dy); if (v[i] === 0) { explored = true; const sn = this.seen, x = cx + dx, y = cy + dy; if (sn.x1 < 0) { sn.x0 = sn.x1 = x; sn.y0 = sn.y1 = y; } else { sn.x0 = Math.min(sn.x0, x); sn.x1 = Math.max(sn.x1, x); sn.y0 = Math.min(sn.y0, y); sn.y1 = Math.max(sn.y1, y); } } v[i] = 2; }
    };
    for (const u of this.units) if (this.friendly(u.team)) reveal(u.x, u.y, Math.round(this.sightOf(u.type)));
    for (const b of this.blds) if (this.friendly(b.team) && b.dying < 0) { const r = this.bldSight(b); if (r) reveal((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, Math.round(r)); }
    for (const b of this.blds) if (!b.seen) for (let y = b.cy; y < b.cy + b.h && !b.seen; y++) for (let x = b.cx; x < b.cx + b.w; x++) if (v[t.idx(x, y)] === 2) { b.seen = true; break; }
    if (explored) { // an enemy's border shows once you've seen the ground it runs over: redraw the cached borders if more of one is now seen
      let n = 0; for (const [team, seg] of this.territory.lines) if (!this.friendly(team)) for (let k = 0; k < seg.length; k += 6) if (this.vis[t.idx(t.cellOf((seg[k] + seg[k + 2]) / 2), t.cellOf((seg[k + 1] + seg[k + 3]) / 2))]) n++;
      if (n !== this.borderSeen) { this.borderSeen = n; this.borderVer++; }
    }
    if (!explored && this.fogMask.width === N && this.fogMini.width === MINI.s) return;
    this.buildFogMask();
    // the radar's fog: black where never seen
    const M = MINI.s, fm = this.fogMini;
    if (fm.width !== M) { fm.width = M; fm.height = M; }
    const fctx = fm.getContext('2d')!, img = fctx.createImageData(M, M), d = img.data;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const [gx, gy] = fromMini(x + 0.5, y + 0.5, M), cx = t.cellOf(gx), cy = t.cellOf(gy);
      const s = t.inside(cx, cy) ? v[t.idx(cx, cy)] : 0, k = (y * M + x) * 4;
      d[k] = 8; d[k + 1] = 9; d[k + 2] = 10; d[k + 3] = s === 0 ? 255 : 0;
    }
    fctx.putImageData(img, 0, 0);
  }
  // Fog on the map: one small image (a pixel per cell) of where you've never been, blurred so its
  // edges are soft and round, then stretched over the turned map. Explored ground stays clear.
  fogMask = document.createElement('canvas');
  buildFogMask() {
    const m = this.fogMask, v = this.vis, t = this.terrain;
    if (m.width !== N) { m.width = N; m.height = N; }
    const a = new Float32Array(N * N);
    for (let i = 0; i < a.length; i++) a[i] = v[i] === 0 ? 1 : 0;
    const b = new Float32Array(N * N); // soften: a 3-wide average across, then down, twice
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; b[i] = ((x > 0 ? a[i - 1] : 1) + a[i] + (x < N - 1 ? a[i + 1] : 1)) / 3; }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; a[i] = ((y > 0 ? b[i - N] : 1) + b[i] + (y < N - 1 ? b[i + N] : 1)) / 3; }
    }
    const ctx = m.getContext('2d')!, img = ctx.createImageData(N, N), d = img.data;
    for (let i = 0; i < N * N; i++) { d[i * 4] = 13; d[i * 4 + 1] = 12; d[i * 4 + 2] = 11; d[i * 4 + 3] = Math.round(Math.min(1, a[i] * 1.6) * 255); }
    ctx.putImageData(img, 0, 0);
  }
  drawFog(vx: number, vy: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true; // smooth stretching gives the soft edge
    ctx.setTransform(YC * CELL, YS * CELL * SQ, -YS * CELL, YC * CELL * SQ, YS * MAPSIZE - vx, -vy); // same turn as the map: cell (x, y) lands where the ground does
    ctx.drawImage(this.fogMask, 0, 0);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
  // Is this screen point somewhere you can currently see? (Effects in the fog stay hidden.)
  seenAt(sx: number, sy: number) {
    if (this.state === 'title') return true;
    const [gx, gy] = toGround(sx, sy + 4), t = this.terrain, cx = t.cellOf(gx), cy = t.cellOf(gy);
    return t.inside(cx, cy) && this.vis[t.idx(cx, cy)] === 2;
  }

  // Field Commands are an empire's hearts. Lose your last one and a last stand begins: build or take
  // a new one within a minute, or you're beaten and your troops lay down their arms. (Before a side's
  // first hub stands, it's beaten only with no buildings and no builder left.)
  hadHub = new Set<number>(); lastStand = new Map<number, number>(); // when each side's last stand runs out
  hubs(team: number) { return this.blds.filter((b) => b.team === team && b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0).length; }
  checkEnd() {
    const name = (t: number) => ['BLUE', 'RED', '', 'GREEN', 'GOLD'][t];
    const beaten = (t: number) => {
      if (this.hubs(t)) { this.hadHub.add(t); if (this.lastStand.delete(t)) { if (this.friendly(t)) this.banner = { title: 'THE LINE HOLDS', sub: 'A NEW FIELD COMMAND STANDS', t: 4, c: C.ok }; else if (this.hostile(0, t)) this.warn(`${name(t)} has a Field Command again.`); } return false; }
      if (!this.hadHub.has(t)) return !(this.blds.some((b) => b.team === t && b.max > 0 && b.dying < 0 && b.type !== 'wall') || this.units.some((u) => u.team === t && u.type === 'builder'));
      if (!this.lastStand.has(t)) { // the last heart has fallen
        this.lastStand.set(t, this.time + LAST_STAND);
        if (this.friendly(t)) { this.banner = { title: 'LAST STAND', sub: `OUR LAST FIELD COMMAND IS GONE. RAISE OR TAKE ONE IN ${LAST_STAND} SECONDS`, t: 5, c: C.bad }; audio.alarm(); }
        else this.banner = { title: `${name(t)} MAKES A LAST STAND`, sub: `DESTROY ANY FIELD COMMAND THEY RAISE FOR ${LAST_STAND} SECONDS`, t: 5, c: C.gold };
      }
      return this.time >= this.lastStand.get(t)!;
    };
    for (const t of this.sides) if (t !== 0 && !this.out.has(t) && beaten(t)) { // a computer side is beaten: its troops surrender and leave the field
      this.out.add(t); this.lastStand.delete(t);
      for (const u of this.units) if (u.team === t && u.type !== 'civilian') u.gone = true;
      this.units = this.units.filter((u) => !u.gone);
      if (this.sides.length > 2) this.warn(`${name(t)} IS OUT OF THE FIGHT!`);
    }
    if (beaten(0)) { this.state = 'lost'; this.menuHot = 0; audio.alarm(); }
    else if (this.sides.every((t) => !this.hostile(0, t) || this.out.has(t))) { this.state = 'won'; this.menuHot = 0; audio.fanfare(); }
  }

  // A long march: soldiers near the group's vehicles climb aboard, as many as there are seats; the
  // rest march. Returns the riders and how many walk (or null: nothing to ride, or no room at all).
  mountUp(us: Unit[]): { riders: Unit[]; walking: number } | null {
    const feet = us.filter((u) => !u.def.vehicle && !u.def.air && u.def.weapon && !u.enter), cars = us.filter((u) => SEATS[u.type] && !u.def.air);
    if (!feet.length || !cars.length) return null;
    const free = new Map(cars.map((c) => [c, SEATS[c.type] - c.riders.length])), riders: Unit[] = [];
    const pairs: [number, Unit, Unit][] = []; for (const u of feet) for (const c of cars) { const d = Math.hypot(c.x - u.x, c.y - u.y); if (d < 10 * CELL) pairs.push([d, u, c]); }
    pairs.sort((a, b) => a[0] - b[0]); // nearest seats fill first
    for (const [, u, c] of pairs) if (!u.ride && free.get(c)! > 0) { u.ride = c; u.seat = c.riders.length; c.riders.push(u); free.set(c, free.get(c)! - 1); u.goal = null; u.path = []; u.queue = []; u.target = null; u.forced = false; riders.push(u); }
    return riders.length ? { riders, walking: feet.length - riders.length } : null;
  }
  mountNote = '';
  // what the group says about it
  mountLine(up: { riders: Unit[]; walking: number }) { return up.walking ? `Mount up! ${up.riders.length} riding, ${up.walking} on foot. We regroup before we hit them.` : 'Mount up! Everyone riding.'; }
  // Off the vehicle, onto open ground beside it
  dismount(u: Unit, hurt = false) {
    const c = u.ride; if (!c) return;
    u.ride = null; c.riders = c.riders.filter((o) => o !== u);
    const a = c.heading + Math.PI / 2 + (u.seat % 2 ? Math.PI : 0) + (u.seat >> 1) * 0.5, t = this.terrain;
    for (const r of [16, 10, 0]) { const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (t.open(t.cellOf(x), t.cellOf(y), false)) { u.x = x; u.y = y; break; } }
    u.goal = null; u.path = []; u.stuck = 0; u.pace = 0;
    if (c.goal && !c.gone) { const g: [number, number] = [c.goal[0] + (u.x - c.x), c.goal[1] + (u.y - c.y)]; u.goal = g; u.amove = true; u.path = this.route(u, g[0], g[1]); } // off early (a fight on the way): on foot the rest of the way
    if (hurt) u.hp -= u.def.hp * 0.3; // thrown off a wrecked vehicle
    if (u.hp <= 0) this.killUnit(u);
  }
  // Units that can barely hurt a target say so when sent at it (most of them doing under 4 damage a
  // second to its kind of armour), and say what would.
  weakAgainst(us: Unit[], target: Unit | Bld) {
    const cls = this.isUnit(target) ? ((target as Unit).def.air ? 'air' : (target as Unit).def.vehicle ? 'veh' : 'inf') : 'bld';
    const weak = us.filter((u) => { const w = u.def.weapon ? WEAPONS[u.def.weapon] : null; return !w || ((w.dmg as Record<string, number>)[cls] ?? 0) / w.reload < 4; });
    if (weak.length * 2 <= us.length) return null;
    const who = weak[0].def.name, better = { bld: 'Tanks, grenadiers and artillery break buildings.', veh: 'Rockets and tanks stop armour.', inf: 'Riflemen and grenadiers cut down soldiers.', air: 'Flak and rockets bring aircraft down.' }[cls];
    return { who, line: `We'll barely scratch that. ${better}` };
  }
  // ---- helpers the computer opponent uses ----
  isCapturable(b: Bld) { return !!CAPTURE[b.type]; }
  // The computer's group orders work like yours: a wave forms up (armour in front, infantry behind,
  // guns and flak at the back) facing where it's going, travels at its slowest member's pace, and a
  // group that starts out together shares one route.
  orderUnits(us: Unit[], x: number, y: number, amove: boolean, together = false) {
    if (!us.length) return;
    for (const u of us) if (u.ride) this.dismount(u); // a new order: off any vehicle first
    let cx = us.reduce((s, u) => s + u.x, 0) / us.length, cy = us.reduce((s, u) => s + u.y, 0) / us.length, far = Math.hypot(x - cx, y - cy) || 1;
    const fx = (x - cx) / far, fy = (y - cy) / far;
    // A long march together: soldiers ride on the vehicles, as many as fit. If some must walk and it's
    // an attack, everyone first meets at a gathering point short of it, then goes in as one.
    const up = together && us.length > 1 && far > 12 * CELL ? this.mountUp(us.filter((u) => !u.def.air && u.type !== 'builder')) : null;
    let wave: Unit['gather'] = null;
    if ((up ? up.walking : us.length >= 6) && amove && far > 20 * CELL) { wave = { members: [...us], first: -1, go: [x, y], released: false }; x -= fx * 8 * CELL; y -= fy * 8 * CELL; far -= 8 * CELL; }
    const all = us; us = us.filter((u) => !u.ride);
    const carPace = up ? Math.min(...us.filter((u) => u.riders.length).map((u) => u.def.speed), 1e9) : 0, footPace = up ? Math.min(...us.filter((u) => !u.riders.length).map((u) => u.def.speed), 1e9) : 0;
    const pace = together && us.length > 1 ? Math.min(...us.map((u) => u.def.speed)) : 0;
    const spots = together && us.length > 1 && far > 3 * CELL ? this.formation(us, x, y, fx, fy) : null;
    const lead = this.bunchRoutes(us, x, y);
    us.forEach((u, i) => {
      const a = (i / us.length) * Math.PI * 2, r = us.length > 1 ? 14 + (i % 3) * 8 : 0;
      const g: [number, number] = spots?.get(u) ?? [x + Math.cos(a) * r, y + Math.sin(a) * r];
      u.pace = up ? (u.riders.length ? carPace : footPace) : pace; u.goal = g; u.amove = amove; u.forced = false; u.stuck = 0; u.enter = null; u.strike = null; u.wave = null; u.mopUp = null; u.gather = wave; u.face = spots ? Math.atan2(fy, fx) : null; u.fallBack = false; // a new order replaces any errand
      const l = lead.get(u);
      u.path = u.def.air ? [g] : l ? this.followRoute(u, l.r[u.def.crush ? 1 : 0], l.cx, l.cy, g) : pathStats.work < PATH_WORK ? this.route(u, g[0], g[1]) : []; // past this frame's share, it plans its own route in a moment
    });
    if (wave) for (const u of all) if (u.ride) u.gather = wave;
  }
  sendIn(u: Unit, b: Bld) {
    const [dx, dy] = this.doorFor(u, b);
    u.enter = b; u.goal = [dx, dy]; u.stuck = 0; u.path = pathStats.work < PATH_WORK ? findPath(this.terrain, u.x, u.y, dx, dy, false) : []; // past this frame's share, it plans its own route in a moment
  }
  // the open square beside a building nearest a soldier (any side will do: water, trees or walls may block some)
  doorFor(u: Unit, b: Bld): [number, number] {
    const t = this.terrain; let best: [number, number] = [(b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.5) * CELL], bd = 1e9;
    for (let y = b.cy - 1; y <= b.cy + b.h; y++) for (let x = b.cx - 1; x <= b.cx + b.w; x++) {
      if ((x >= b.cx && x < b.cx + b.w && y >= b.cy && y < b.cy + b.h) || !t.open(x, y, false)) continue;
      const gx = (x + 0.5) * CELL, gy = (y + 0.5) * CELL, d = Math.hypot(gx - u.x, gy - u.y); if (d < bd) { bd = d; best = [gx, gy]; }
    }
    return best;
  }
  tapSeep(o: { cx: number; cy: number; big: boolean; tapped: boolean }, team: number) {
    o.tapped = true;
    this.addBld('derrick', team, o.cx - 1, o.cy - 1, 2, 2, 'Derrick');
    const b = this.blds[this.blds.length - 1];
    this.startSite(b); b.pw = o.big ? 200 : 100;
  }
  // An urgent message for the player, with an alarm.
  alertAt: [number, number] | null = null; alertT = 0;
  // Attack markers: places your side is taking real damage. They pulse on the radar, and an arrow at
  // the edge of the screen points to any that are out of view. Space jumps to the latest.
  pings: { x: number; y: number; t: number; dmg: number }[] = [];
  ping(x: number, y: number, amt: number) {
    let p = this.pings.find((q) => Math.hypot(q.x - x, q.y - y) < 12 * CELL);
    if (!p) { p = { x, y, t: 0, dmg: 0 }; this.pings.push(p); }
    p.dmg += amt; p.t = 0; p.x = x; p.y = y;
    if (p.dmg >= 120) this.alertAt = [x, y];
  }
  warn(line: string, at?: [number, number]) { this.bark = { who: 'Alert', line: line + (at ? '  (SPACE TO VIEW)' : ''), t: 4 }; audio.alarm(); if (at) this.alertAt = at; }

  // ---- mountains ----
  // Each mountain is built once as a tall picture from its height map: every point of its rock is
  // raised by its height and the slope below it filled in, front to back, so it stands up out of the
  // angled view. It's lit from the top left, snow on the summits, scree at the foot, and drawn in
  // depth order like a building, so whatever's behind it is hidden.
  mountains: { img: HTMLCanvasElement; imgs: HTMLCanvasElement[]; x: number; y: number; sortY: number }[] = [];
  buildMountains() {
    { const R = this.hillR, M = N * R, t = this.terrain; this.hillH = new Float32Array(M * M); // raised ground's height, for the land's shadows
      for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) this.hillH[y * M + x] = t.elev[t.idx(Math.floor(x / R), Math.floor(y / R))] * LIFT; }
    const t = this.terrain, STEP = 2, SH = [0x34322e, 0x44423c, 0x5a5750, 0x6e6a60, 0x7c786c, 0x8c887c, 0xa8a294, 0xc4beb2];
    for (const [px, py, pr] of t.peaks) {
      const K = pr * 11, R = pr * 1.3; // pixels of height per unit, and reach in squares
      const gx0 = Math.max(0, Math.floor(px - R)) * CELL, gx1 = Math.min(N, Math.ceil(px + R)) * CELL, gy0 = Math.max(0, Math.floor(py - R)) * CELL, gy1 = Math.min(N, Math.ceil(py + R)) * CELL;
      const W = Math.ceil((gx1 - gx0) / STEP), Hh = Math.ceil((gy1 - gy0) / STEP), hm = new Float32Array(W * Hh).fill(-1);
      for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
        const gx = gx0 + i * STEP, gy = gy0 + j * STEP, c = t.idx(Math.min(N - 1, Math.floor(gx / CELL)), Math.min(N - 1, Math.floor(gy / CELL)));
        if (t.type[c] !== T.ROCK) continue;
        const h = t.mountainH(gx, gy); if (h > 0) hm[j * W + i] = h;
      }
      // distance from the rock's edge (two-pass chamfer), so the slopes rise gently from the foot instead of in steps
      const dist = new Float32Array(W * Hh);
      for (let k = 0; k < W * Hh; k++) dist[k] = hm[k] > 0 ? 1e9 : 0;
      for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!dist[k]) continue; if (i) dist[k] = Math.min(dist[k], dist[k - 1] + 1); if (j) dist[k] = Math.min(dist[k], dist[k - W] + 1); if (i && j) dist[k] = Math.min(dist[k], dist[k - W - 1] + 1.414); if (j && i < W - 1) dist[k] = Math.min(dist[k], dist[k - W + 1] + 1.414); }
      for (let j = Hh - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (!dist[k]) continue; if (i < W - 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1); if (j < Hh - 1) dist[k] = Math.min(dist[k], dist[k + W] + 1); if (i < W - 1 && j < Hh - 1) dist[k] = Math.min(dist[k], dist[k + W + 1] + 1.414); if (j < Hh - 1 && i) dist[k] = Math.min(dist[k], dist[k + W - 1] + 1.414); }
      for (let pass = 0; pass < 3; pass++) { // smooth the heights (no spikes); fine texture stays in the colouring
        const src = hm.slice();
        for (let j = 1; j < Hh - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; if (src[k] <= 0) continue; let sum = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = src[k + dj * W + di]; if (v > 0) { sum += v; n++; } } hm[k] = sum / n; }
      }
      const FOOT = (2.5 * CELL) / STEP; // the first two and a half squares in from the edge rise gently
      for (let k = 0; k < W * Hh; k++) if (hm[k] > 0) { const f = Math.min(1, dist[k] / FOOT); hm[k] *= f * f * (3 - 2 * f); }
      const pts: { sx: number; base: number; top: number; c: number[]; body: number[] }[] = [];
      for (let j = 1; j < Hh - 1; j++) for (let i = 1; i < W - 1; i++) {
        const h = hm[j * W + i]; if (h <= 0) continue;
        const gx = gx0 + i * STEP, gy = gy0 + j * STEP, [sx, sy] = toScreen(gx, gy), base = sy - t.lift(gx, gy);
        const hx = Math.max(0, hm[j * W + i + 1]) - Math.max(0, hm[j * W + i - 1]), hy = Math.max(0, hm[(j + 1) * W + i]) - Math.max(0, hm[(j - 1) * W + i]);
        const n = hash3(gx, 91, gy), snow = 1.0 + (hash3(gx >> 3, 92, gy >> 3) - 0.5) * 0.16, lift = Math.pow(h, 1.1) * K;
        // lit by each of the day's suns (as the buildings are): the slope's facing against the sun's direction
        const slx = (hx * K) / (2 * STEP), sly = (hy * K) / (2 * STEP), nl = Math.hypot(slx, 1, sly);
        const c = SUN_GROUND.map(([gxs, gys, ys]) => {
          const light = Math.max(0, Math.min(1, (0.56 * ((-slx * gxs - sly * gys + ys) / nl)) / ys + 0.04));
          if (h > snow) return light > 0.55 ? 0xf0f2f4 : light > 0.32 ? 0xcdd4dc : 0x9aa6b4;
          if (h < 0.12) return n < 0.5 ? 0x7c786c : 0x5c5a52; // scree
          return SH[Math.max(0, Math.min(SH.length - 1, Math.floor(light * (SH.length - 0.01) + (n - 0.5) * 0.9)))];
        });
        pts.push({ sx: Math.round(sx), base: Math.round(base), top: Math.round(base - lift), c, body: c.map((v) => shadeHex(v, 0.86)) });
        const R = this.hillR, ti = Math.min(N * R - 1, Math.floor(gy / (CELL / R))) * N * R + Math.min(N * R - 1, Math.floor(gx / (CELL / R)));
        this.hillH[ti] = Math.max(this.hillH[ti], t.lift(gx, gy) + lift); // (and it casts its shadow by this height)
      }
      if (!pts.length) continue;
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const p of pts) { minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx + STEP); minY = Math.min(minY, p.top); maxY = Math.max(maxY, p.base); }
      const cw = maxX - minX + 1, chh = maxY - minY + 2;
      pts.sort((a, b) => b.base - a.base); // nearest first: each screen column is filled once, from the top of the nearest slope up
      const imgs = [0, 1, 2].map((k) => { // one picture per sun
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
        const cx = cv.getContext('2d')!, img = cx.createImageData(cw, chh), d = img.data, ybuf = new Int32Array(cw).fill(chh);
        const put = (x: number, y: number, c: number) => { const q = (y * cw + x) * 4; d[q] = c >> 16; d[q + 1] = (c >> 8) & 255; d[q + 2] = c & 255; d[q + 3] = 255; };
        for (const p of pts) for (let o = 0; o < STEP; o++) {
          const x = p.sx - minX + o, top = p.top - minY, base = p.base - minY;
          if (x < 0 || x >= cw || top >= ybuf[x]) continue;
          for (let y = Math.max(0, top); y < Math.min(ybuf[x], base + 1); y++) put(x, y, y === top ? p.c[k] : p.body[k]);
          if (top < ybuf[x]) ybuf[x] = Math.max(0, top);
        }
        cx.putImageData(img, 0, 0);
        return cv;
      });
      const [csx, csy] = toScreen((px + 0.5) * CELL, (py + 0.5) * CELL);
      this.mountains.push({ img: imgs[1], imgs, x: minX, y: minY, sortY: csy });
    }
  }
  // ---- the map changes: a burst dam's lake runs dry, and its flood drains away ----
  updateSeasons() {
    for (const dr of this.drains) if (this.time >= dr.at) { // a burst dam's lake has run dry: its bed is open mud, a new way across for good
      const cells = this.terrain.drainLake(dr.k), lk = this.terrain.lakes[dr.k];
      if (cells.length) {
        const set = new Set(cells), chunks = this.terrain.chunksOver((i) => set.has(i));
        this.paintLayer('drain', chunks);
        this.landT = 0;
        this.banner = { title: 'THE LAKE HAS RUN DRY', sub: 'ITS BED IS OPEN GROUND, AND SUNKEN WRECKS LIE IN THE MUD', t: 5, c: C.cream };
        const dam = this.dams.find((d) => d.lake === dr.k); if (dam) this.recedes.push({ zone: dam.zone, at: this.time + 150 });
        this.warn('The lake has drained: its bed can be crossed.', [lk[0] * CELL, lk[1] * CELL]);
      }
    }
    this.drains = this.drains.filter((dr) => this.time < dr.at);
    for (const rc of this.recedes) if (this.time >= rc.at) { // with no lake behind it the flood drains away: bare, scoured earth and a dry stream bed
      const t = this.terrain, gone: number[] = [];
      for (const i of rc.zone) if (t.type[i] === T.WATER) { t.type[i] = T.DIRT; this.reshaped.set(i, T.DIRT); gone.push(i); }
      if (gone.length || rc.zone.length) { this.repaintSquares(rc.zone); this.landT = 0; this.warn('The flood has drained away: the valley can be crossed again.', [((rc.zone[0] % N) + 0.5) * CELL, (Math.floor(rc.zone[0] / N) + 0.5) * CELL]); }
    }
    this.recedes = this.recedes.filter((rc) => this.time < rc.at);
  }
  // Paint a layer of the map (a drained lake's mud) in the background, then show it.
  paintLayer(mode: 'drain', chunks: number[]) {
    const t = this.terrain;
    if (!chunks.length) return;
    try {
      for (let w = 0; w < 2; w++) {
        const mine = chunks.filter((_, k) => k % 2 === w); if (!mine.length) continue;
        const worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}` });
        worker.onmessage = (e) => { t.putLayer(e.data.i, e.data.d); if (e.data.i === mine[mine.length - 1]) worker.terminate(); };
        worker.postMessage({ seed: t.seed, players: t.players, chunks: mine, mode, drained: [...t.drained] });
      }
    } catch { /* no workers: the change still happens, it just isn't drawn */ }
  }
  // ---- day and night ----
  // Illumination flares: purely for show (night never hides anything), fired up over fights after dark.
  // Each climbs, hangs on its parachute burning white and swaying, and lights the ground beneath it.
  flares: { x: number; y: number; t: number; life: number; sway: number }[] = [];
  // Where a flare is and how bright: it shoots up, then drifts down on its parachute, swaying, and
  // burns with an uneven, sputtering flicker.
  flareNow(f: { x: number; y: number; t: number; life: number; sway: number }) {
    const up = Math.min(1, f.t / 0.9), h = up < 1 ? up * 110 : 110 - ((f.t - 0.9) / (f.life - 0.9)) * 95, t = f.t;
    const flick = 0.78 + Math.sin(t * 23) * 0.09 + Math.sin(t * 37 + 1) * 0.07 + Math.sin(t * 61 + 2) * 0.05 - (Math.sin(t * 5.3) > 0.93 ? 0.25 : 0); // (now and then it sputters)
    return { x: f.x + Math.sin(t * 0.9) * f.sway + Math.sin(t * 2.3) * f.sway * 0.3, y: f.y, h, burn: up < 1 ? 0.25 : Math.min(1, (f.life - t) / 1.5) * flick };
  }
  // Flares light pools of ground, and everything standing in the pool throws a shadow away from the
  // flare, swinging as it sways. The ground's light is gathered on one layer with the shadows (and the
  // things themselves) cut out of it; the things get the light on a second layer, so no shadow is ever
  // painted across a unit. Both are then added over the night.
  lightLayer = document.createElement('canvas'); lctx = this.lightLayer.getContext('2d')!;
  objLayer = document.createElement('canvas'); octx = this.objLayer.getContext('2d')!;
  drawFlares(vx: number, vy: number, dark: number, items: { sp?: Sprite; sx?: number; sy?: number }[]) {
    const ctx = this.ctx, L = this.lightLayer, lc = this.lctx, O = this.objLayer, oc = this.octx, lit = this.flares.filter((f) => this.seenAt(f.x, f.y)).map((f) => this.flareNow(f));
    if (!lit.length) return;
    for (const c of [L, O]) if (c.width !== this.FW || c.height !== this.FH) { c.width = this.FW; c.height = this.FH; }
    const pool = (g: CanvasRenderingContext2D) => { g.imageSmoothingEnabled = true; for (const F of lit) { const R = 90 + F.h * 0.6; g.globalAlpha = Math.min(1, F.burn * (1.2 - F.h / 300)); g.drawImage(this.flareGlow, Math.round(F.x - vx - R), Math.round(F.y - vy - R), R * 2, R * 2); } g.globalAlpha = 1; g.imageSmoothingEnabled = false; };
    // what stands in the light: lit whole (nothing here shades its own body), the rest of the light goes on the ground
    const near = items.filter((it) => it.sp && lit.some((F) => Math.hypot(it.sx! - (F.x - vx), it.sy! - (F.y - vy)) < 90 + F.h * 0.6 + 40));
    // only the box round the lit flares (and what stands near them) is worked on: a flare lights a circle, not the screen
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const F of lit) { const R = 90 + F.h * 0.6 + 70; bx0 = Math.min(bx0, F.x - vx - R); by0 = Math.min(by0, F.y - vy - R - F.h); bx1 = Math.max(bx1, F.x - vx + R); by1 = Math.max(by1, F.y - vy + R); }
    bx0 = Math.max(0, Math.floor(bx0)); by0 = Math.max(0, Math.floor(by0)); bx1 = Math.min(L.width, Math.ceil(bx1)); by1 = Math.min(L.height, Math.ceil(by1));
    if (bx1 <= bx0 || by1 <= by0) return;
    const bw = bx1 - bx0, bh = by1 - by0;
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(bx0, by0, bw, bh); pool(lc);
    oc.globalCompositeOperation = 'source-over'; oc.clearRect(bx0, by0, bw, bh);
    lc.globalCompositeOperation = 'destination-out';
    for (const F of lit) { // shadows on the ground, away from each flare
      if (F.burn < 0.2) continue;
      const fx = F.x - vx, fy = F.y - vy, R = 90 + F.h * 0.6;
      for (const it of near) {
        const sp = it.sp!, dx = it.sx! - fx, dy = it.sy! - fy, d = Math.hypot(dx, dy);
        if (d > R || d < 2) continue;
        const k = Math.min(1.6, d / Math.max(20, F.h)), ux = (dx / d) * k, uy = (dy / d) * k;
        // start from whichever baked shadow already points nearest the right way, so it bends least
        const pm = !!sp.lit && ux * LIT_FALL[1][0] + uy * LIT_FALL[1][1] > ux * LIT_FALL[0][0] + uy * LIT_FALL[0][1];
        const m = this.aim(sp.lit ? LIT_FALL[pm ? 1 : 0] : BAKED, { ux, uy });
        lc.globalAlpha = 0.55 * (1 - d / R) + 0.15; // (a shadow under a flare still lets some light in: the night sky, the glow off the ground) lc.setTransform(m[0], m[1], m[2], m[3], Math.round(it.sx!), Math.round(it.sy!));
        lc.drawImage(sp.lit ? sp.lit.shadows[pm ? 1 : 0] : sp.shadow, -sp.ax, -sp.ay);
      }
    }
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1;
    for (const it of near) { const sp = it.sp!, X = Math.round(it.sx! - sp.ax), Y = Math.round(it.sy! - sp.ay); lc.drawImage(sp.img, X, Y); oc.drawImage(sp.img, X, Y); } // (no ground light where they stand; their outlines go on their own layer)
    oc.globalCompositeOperation = 'source-in'; pool(oc); // the flare's light, only on them
    ctx.globalAlpha = Math.min(1, dark * 0.7); ctx.drawImage(L, bx0, by0, bw, bh, bx0, by0, bw, bh); ctx.drawImage(O, bx0, by0, bw, bh, bx0, by0, bw, bh); // (the caller has 'lighter' on: the light adds to the night)
    for (const F of lit) { // the flare itself, burning white high above
      const fx = F.x - vx, fy = F.y - vy - F.h;
      ctx.globalAlpha = Math.min(1, F.burn * 1.2); ctx.fillStyle = '#fffbea'; ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 2, 2);
      ctx.globalAlpha = Math.min(1, F.burn * dark * 0.8); ctx.drawImage(this.flareGlow, Math.round(fx - 7), Math.round(fy - 7), 14, 14);
    }
  }
  darkness() { const [r, g, b] = this.skyAt(this.dayPhase()); return Math.max(0, Math.min(1, (210 - (r + g + b) / 3) / 70)); } // 0 by day, 1 at full night
  dayPhase() { return (this.time / DAY_LEN + DAY_START) % 1; }
  skyAt(ph: number): [number, number, number] {
    let k = 0; while (SKY[k + 1][0] < ph) k++;
    const a = SKY[k], b = SKY[k + 1], f = (ph - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
  }
  // Where the sun is. a runs 0 at sunrise to 1 at sunset. Buildings and trees were baked under three
  // suns (morning, noon, evening: see bake.ts SUNS) and show a blend of the two nearest; by night the
  // moon lights them from high up, like noon. Shadows are long and to the right at sunrise, shrink to
  // almost nothing as the sun passes overhead, fall long to the left at sunset, and are gone at night.
  sunNow() {
    const ph = this.state === 'title' ? 0.4 : this.dayPhase(), a = (ph - 0.25) / 0.5;
    const ease = (t: number) => Math.max(0, Math.min(1, t));
    const mix: [number, number, number] = a < 0 ? [1, 0, ease((ph - 0.17) / 0.08)] : a < 0.5 ? [0, 1, a * 2] : a <= 1 ? [1, 2, a * 2 - 1] : [2, 1, ease((ph - 0.75) / 0.08)];
    const step = Math.round(a * SUN_STEPS), q = step / SUN_STEPS; // shadows move in small steps, so each is re-aimed only now and then
    if (q <= 0 || q >= 1) return { a, mix, step, ux: 0, uy: 0, alpha: 0 };
    const up = Math.sin(q * Math.PI), elev = up * 1.45 + 0.08; // the sun's height: 0.08 rad at the horizon, ~88 degrees at noon
    const len = Math.min(2.4, 1 / Math.tan(elev)), dir = q * Math.PI; // shadows point right (0), down (noon), left (pi)
    const alpha = 0.38 * Math.min(1, up / 0.18) * Math.min(1, (len - 0.1) / 0.3); // fading out as the sun climbs overhead
    return { a, mix, step, ux: Math.cos(dir) * len, uy: Math.sin(dir) * len, alpha: Math.max(0, alpha) };
  }
  // A building's or tree's picture in the light of the hour: the two nearest suns' bakes blended. Every
  // copy of a picture blends alike at any moment, so each is made once and kept until the blend moves on
  // a step (32 steps across a sunrise or sunset), instead of drawing both bakes for every one, every frame.
  blendCache = new Map<object, { k: string; c: HTMLCanvasElement }>();
  blended(s: object, imgs: HTMLCanvasElement[], a: number, b: number, t: number): HTMLCanvasElement {
    const lit = { imgs }, lv = Math.round(t * 32);
    if (lv <= 0) return lit.imgs[a];
    if (lv >= 32) return lit.imgs[b];
    const k = a * 100 + b * 10 + ':' + lv; let e = this.blendCache.get(s);
    if (e && e.k === k) return e.c;
    const c = e?.c ?? document.createElement('canvas'); c.width = lit.imgs[a].width; c.height = lit.imgs[a].height;
    const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height); g.drawImage(lit.imgs[a], 0, 0); g.globalAlpha = lv / 32; g.drawImage(lit.imgs[b], 0, 0); g.globalAlpha = 1;
    this.blendCache.set(s, (e = { k, c }));
    return c;
  }
  // Re-aimed shadows, kept until the sun takes its next step (and dropped once they're off screen for a while).
  aimCache = new Map<HTMLCanvasElement, { step: number; c: HTMLCanvasElement; ox: number; oy: number }>(); aimStep = -1;
  aimed(src: HTMLCanvasElement, ax: number, ay: number, m: number[], step: number) {
    if (step !== this.aimStep) { this.aimStep = step; for (const [k, e] of this.aimCache) if (Math.abs(e.step - step) > 3) this.aimCache.delete(k); }
    let e = this.aimCache.get(src);
    if (e && e.step === step) return e;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [px, py] of [[-ax, -ay], [src.width - ax, -ay], [-ax, src.height - ay], [src.width - ax, src.height - ay]]) {
      const qx = m[0] * px + m[2] * py, qy = m[1] * px + m[3] * py; x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy);
    }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    const c = e?.c ?? document.createElement('canvas'); c.width = Math.max(1, Math.ceil(x1) - x0); c.height = Math.max(1, Math.ceil(y1) - y0);
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.setTransform(m[0], m[1], m[2], m[3], -x0, -y0); g.drawImage(src, -ax, -ay);
    e = { step, c, ox: x0, oy: y0 }; this.aimCache.set(src, e);
    return e;
  }
  // The transform that turns a shadow baked falling `from` (screen pixels per pixel of height) into one
  // falling where the sun now sends it. Ground offsets across the baked direction stay put.
  aim(from: number[], day: { ux: number; uy: number }): [number, number, number, number] {
    const [bx, by] = from, wx = -by, wy = bx, det = bx * wy - by * wx;
    const i00 = wy / det, i01 = -wx / det, i10 = -by / det, i11 = bx / det; // inverse of [b w]
    return [day.ux * i00 + wx * i10, day.uy * i00 + wy * i10, day.ux * i01 + wx * i11, day.uy * i01 + wy * i11];
  }
  // ---- the land's own shadows ----
  // Raised ground and mountains shade the ground away from the sun: a small map (two texels a square)
  // marked wherever something taller stands between the ground and the sun. It's worked out a few rows
  // a frame each time the sun takes a step, then laid over the ground softly stretched, like the fog.
  hillR = 2; hillH = new Float32Array(0); hillMax = 0;
  shadeMap = document.createElement('canvas'); shadeImg: ImageData | null = null; shadeRow = 0; shadeWant = -999; shadeShown = -999; shadeD = [0, 0];
  updateHillShade(day: { step: number; ux: number; uy: number; alpha: number }) {
    const R = this.hillR, M = N * R, H = this.hillH;
    if (!H.length) return;
    if (!this.shadeImg) { this.shadeMap.width = this.shadeMap.height = M; this.shadeImg = new ImageData(M, M); this.hillMax = H.reduce((a, b) => Math.max(a, b), 0); }
    if (day.alpha <= 0) return;
    if (day.step !== this.shadeWant) { // start working out the new shadows (the old ones stay up meanwhile)
      this.shadeWant = day.step; this.shadeRow = 0;
      const tx = CELL / R; this.shadeD = [(YC * day.ux + YS * day.uy / SQ) / tx, (-YS * day.ux + YC * day.uy / SQ) / tx]; // ground texels per pixel of height
    }
    if (this.shadeRow >= M) return;
    const [dx, dy] = this.shadeD, dl = Math.hypot(dx, dy), d = this.shadeImg.data, top = this.hillMax;
    const dk = dl > 0 ? 0.8 / dl : 1e9; // a step of most of a texel along the ground
    const end = Math.min(M, this.shadeRow + Math.ceil(M / 60)); // done in about a second, a sliver each frame
    for (let y = this.shadeRow; y < end; y++) for (let x = 0; x < M; x++) {
      const i = y * M + x, hp = H[i]; let dark = 0;
      for (let k = dk * 0.5; k <= top - hp; k += dk) {
        const qx = Math.round(x - dx * k), qy = Math.round(y - dy * k);
        if (qx < 0 || qy < 0 || qx >= M || qy >= M) break;
        if (H[qy * M + qx] >= hp + k) { dark = 255; break; }
      }
      d[i * 4] = 64; d[i * 4 + 1] = 78; d[i * 4 + 2] = 118; d[i * 4 + 3] = dark;
    }
    this.shadeRow = end;
    if (end >= M) { this.shadeMap.getContext('2d')!.putImageData(this.shadeImg, 0, 0); this.shadeShown = this.shadeWant; }
  }
  drawHillShade(vx: number, vy: number, day: { alpha: number }) {
    if (day.alpha <= 0 || this.shadeShown === -999) return;
    const ctx = this.ctx, s = CELL / this.hillR;
    ctx.save();
    ctx.imageSmoothingEnabled = true; // soft edges, like a real shadow's
    ctx.setTransform(YC * s, YS * s * SQ, -YS * s, YC * s * SQ, YS * MAPSIZE - vx, -vy);
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = Math.min(1, (day.alpha / 0.38) * 0.75);
    ctx.drawImage(this.shadeMap, 0, 0);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }
  flareGlow = (() => { // the hard white light of a burning flare
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(236,244,255,1)'); r.addColorStop(0.4, 'rgba(200,214,236,0.5)'); r.addColorStop(1, 'rgba(180,200,230,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c;
  })();
  // A vehicle's headlight throw and red tail lights, baked as one small picture for each of 32 headings
  // and each size of vehicle (drawn at the night's strength: the beam at 0.3 of it, the lamps full),
  // so lighting an army is one draw per vehicle, not four.
  lightCache = new Map<string, { c: HTMLCanvasElement; o: number }>();
  vehicleLights(r: number, a: number) {
    const k = Math.round(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 16)) % 32, key = r + ':' + k;
    let e = this.lightCache.get(key);
    if (e) return e;
    const q = (k * Math.PI) / 16, c = Math.cos(q), s = Math.sin(q), len = 10 + r * 1.2, wide = 6 + r * 0.4, o = Math.ceil(len + r + 6), cv = document.createElement('canvas');
    cv.width = cv.height = o * 2;
    const g = cv.getContext('2d')!;
    g.globalAlpha = 0.3; g.setTransform(c, s, -s, c, Math.round(o + c * r * 0.8), Math.round(o - 2 + s * r * 0.8)); g.drawImage(this.beam, 0, -wide / 2, len, wide); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.fillStyle = '#ff3020'; g.fillRect(Math.round(o - c * r * 0.9 - s * 2), Math.round(o - 3 - s * r * 0.9 + c * 2), 1, 1); g.fillRect(Math.round(o - c * r * 0.9 + s * 2), Math.round(o - 3 - s * r * 0.9 - c * 2), 1, 1);
    this.lightCache.set(key, (e = { c: cv, o }));
    return e;
  }
  beam = (() => { // a headlight's throw: bright at the lamp, widening and fading along the road
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d')!;
    const r = g.createLinearGradient(0, 0, 64, 0); r.addColorStop(0, 'rgba(255,246,214,0.95)'); r.addColorStop(0.5, 'rgba(255,236,190,0.35)'); r.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = r; g.beginPath(); g.moveTo(0, 13); g.lineTo(64, 0); g.lineTo(64, 32); g.lineTo(0, 19); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-in'; const e = g.createLinearGradient(0, 0, 0, 32); e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(0.5, 'rgba(0,0,0,1)'); e.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = e; g.fillRect(0, 0, 64, 32); // soft sides
    return c;
  })();
  glow = (() => { // one soft warm light, stamped wherever something shines
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,214,150,1)'); r.addColorStop(0.35, 'rgba(255,150,70,0.45)'); r.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c;
  })();
  // The whole world is tinted by the time of day in one fill; after dark, fires, blasts, muzzle flashes
  // and lit buildings glow through it. (Health bars, selection and the fog are drawn after, untouched.)
  drawDaylight(vx: number, vy: number, items: { sp?: Sprite; sx?: number; sy?: number }[] = []) {
    const [r, g, b] = this.skyAt(this.dayPhase()), ctx = this.ctx;
    if (r > 253 && g > 253 && b > 253) return; // midday: nothing to do
    ctx.save(); ctx.beginPath(); // only the land is lit: the dark beyond the map's edge stays black
    for (const [gx, gy] of [[0, 0], [MAPSIZE, 0], [MAPSIZE, MAPSIZE], [0, MAPSIZE]]) { const [sx, sy] = toScreen(gx, gy); ctx.lineTo(sx - vx, sy - vy); }
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(0, 0, this.FW, this.FH);
    const ph = this.dayPhase(), sun = Math.max(0, 1 - Math.abs(ph - 0.735) / 0.05), dawn = Math.max(0, 1 - Math.abs(ph - 0.28) / 0.04);
    if (sun > 0 || dawn > 0) { // low sun: a warm wash that lifts the light sides instead of just darkening
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = sun > 0 ? `rgba(255,160,70,${sun * 0.32})` : `rgba(255,170,190,${dawn * 0.4})`; ctx.fillRect(0, 0, this.FW, this.FH);
    }
    const dark = this.darkness();
    if (dark <= 0) { ctx.restore(); return; }
    ctx.globalCompositeOperation = 'lighter';
    const lamp = (x: number, y: number, rad: number, a: number) => {
      if (x < -rad || y < -rad || x > this.FW + rad || y > this.FH + rad) return;
      ctx.globalAlpha = Math.min(1, a * dark); ctx.drawImage(this.glow, Math.round(x - rad), Math.round(y - rad * 0.75), rad * 2, Math.round(rad * 1.5));
    };
    for (const bl of this.blds) { // windows and yard lights: every working building is a pool of warm light
      if (bl.rise < 1 || bl.dying >= 0 || bl.type === 'wall' || bl.type === 'bridge' || (!this.friendly(bl.team) && bl.team !== 2 && !bl.seen)) continue;
      const [sx, sy] = toScreen((bl.cx + bl.w / 2) * CELL, (bl.cy + bl.h / 2) * CELL), f = bl.max > 0 ? bl.hp / bl.max : 1;
      lamp(sx - vx, sy - vy - 4, 10 + bl.w * 7, 0.22);
      if (f < 0.3) lamp(sx - vx, sy - vy - 10, 12 + bl.w * 4, 0.35 + 0.15 * Math.sin(this.time * 9 + bl.cx)); // burning
      if (bl.type === 'derrick') lamp(sx - vx - 16 * YC - 16 * YS, sy - vy - 23, 10, 0.5 + 0.2 * Math.sin(this.time * 12));
    }
    // vehicles drive with their lights on: a pale beam ahead, red tail lights behind; aircraft blink
    // red and green at the wingtips. Only what you can see shows its lights (the fog keeps its secrets).
    const beam = (x: number, y: number, a: number, len: number, wide: number, lit: number) => {
      if (x < -len || y < -len || x > this.FW + len || y > this.FH + len) return;
      const c = Math.cos(a), s = Math.sin(a);
      ctx.globalAlpha = Math.min(1, lit * dark); ctx.setTransform(c, s, -s, c, Math.round(x), Math.round(y));
      ctx.drawImage(this.beam, 0, -wide / 2, len, wide); ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    const dot = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
    for (const u of this.units) {
      if (!u.def.vehicle || !this.spot(u)) continue;
      const [ux, uy] = this.scr(u), x = ux - vx, y = uy - vy, a = u.heading + YAW, r = u.def.radius, c = Math.cos(a), s = Math.sin(a);
      if (x < -60 || y < -60 || x > this.FW + 60 || y > this.FH + 60) continue;
      if (u.def.air) { // navigation lights: red on the left wingtip, green on the right, a white blink on the tail
        ctx.globalAlpha = Math.min(1, dark * 1.2);
        dot(x + s * r, y - 9 - c * r, '#ff4030'); dot(x - s * r, y - 9 + c * r, '#40ff70');
        if (Math.floor(this.time * 1.5 + u.id * 0.37) % 2 === 0 && (this.time * 1.5 + u.id * 0.37) % 1 < 0.15) lamp(x - c * r, y - 9 - s * r, 5, 0.9);
        continue;
      }
      if (u.target) continue; // in a fight, lights off: a lit vehicle is a target (as real armies drove blacked out)
      const L = this.vehicleLights(r, a); ctx.globalAlpha = Math.min(1, dark * 0.6); ctx.drawImage(L.c, Math.round(x - L.o), Math.round(y - L.o)); // headlight throw and tail lights, one picture
    }
    for (const ag of this.agents) { // cars on the village roads
      if ((ag.kind !== 'car' && ag.kind !== 'pickup') || ag.hidden || !this.vis[this.terrain.idx(Math.max(0, Math.min(N - 1, this.terrain.cellOf(ag.x))), Math.max(0, Math.min(N - 1, this.terrain.cellOf(ag.y))))]) continue;
      const [ax, ay] = this.scr(ag), a = ag.heading + YAW;
      beam(ax - vx + Math.cos(a) * 5, ay - vy - 2 + Math.sin(a) * 5, a, 14, 6, 0.22);
    }
    ctx.lineCap = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = '#ff9a40'; ctx.globalAlpha = Math.min(1, dark * 0.45);
    for (const tr of this.tracers) if (this.seenAt(tr.x1, tr.y1)) { // tracers glow as they streak across the dark
      const f = Math.min(1, tr.t / 0.07), b = Math.max(0, f - 0.5);
      ctx.beginPath(); ctx.moveTo(tr.x0 + (tr.x1 - tr.x0) * b - vx, tr.y0 + (tr.y1 - tr.y0) * b - vy); ctx.lineTo(tr.x0 + (tr.x1 - tr.x0) * f - vx, tr.y0 + (tr.y1 - tr.y0) * f - vy); ctx.stroke();
    }
    this.drawFlares(vx, vy, dark, items);
    for (const p of this.puffs) if ((p.life <= 0.06 || p.c === '#ff9a30') && this.seenAt(p.x, p.y + 10)) lamp(p.x - vx, p.y - vy, p.life <= 0.06 ? 9 + p.s * 3 : 5, 0.7); // muzzle flashes and sparks
    for (const bl of this.blasts) if (bl.t >= 0 && this.seenAt(bl.x, bl.y)) lamp(bl.x - vx, bl.y - vy, bl.size * 3, 1 - bl.t / 0.55);
    ctx.restore();
  }
  // ---- divisions ----
  // Command groups, not soldiers: select some units and form a division (or Ctrl+1-5). Its card on the
  // side panel picks the whole division in one click; orders then go to all of it, in formation. Set
  // a division to REINFORCE and new fighting units from your factories join it, marching out in
  // groups of six (not one by one) to wherever it is.
  divName(k: number) {
    const d = this.divisions[k]; if (!d) return '';
    const n = d.units.length || 1, veh = d.units.filter((u) => u.def.vehicle && !u.def.air).length, air = d.units.filter((u) => u.def.air).length;
    return ['1ST', '2ND', '3RD', '4TH', '5TH'][k] + ' ' + (air / n > 0.5 ? 'AIR WING' : veh / n > 0.6 ? 'ARMOURED' : veh / n < 0.25 ? 'INFANTRY' : 'COMBINED');
  }
  formDivision(k = this.divisions.findIndex((d) => !d || !d.units.length)) {
    const sel = this.selected().filter((u) => u.def.weapon && u.type !== 'builder');
    if (!sel.length) return;
    if (k < 0) { this.bark = { who: 'Command', line: 'Five divisions is the most we can run. Add these to one of them.', t: 3 }; return; }
    for (const d of this.divisions) if (d) { d.units = d.units.filter((u) => !sel.includes(u)); d.fresh = d.fresh.filter((u) => !sel.includes(u)); }
    this.divisions[k] = { units: [...sel], fresh: [], since: 0, feed: this.divisions[k]?.feed ?? false };
    this.bark = { who: 'Command', line: `${this.divName(k)} formed: ${sel.length} units. Press ${k + 1} or click its card to pick it.`, t: 3.5 }; audio.radio();
  }
  pickDivision(k: number) {
    const d = this.divisions[k]; if (!d?.units.length) return;
    const again = d.units.every((u) => u.selected);
    this.select(d.units, false); this.selBld = null;
    if (again) this.centre(d.units.reduce((s, u) => s + u.x, 0) / d.units.length, d.units.reduce((s, u) => s + u.y, 0) / d.units.length); // a second click: go there
  }
  feedDivision(k: number) {
    const d = this.divisions[k]; if (!d) return;
    const on = !d.feed;
    for (const o of this.divisions) if (o) o.feed = false;
    d.feed = on;
    this.bark = { who: 'Command', line: on ? `New troops will join the ${this.divName(k)}.` : 'New troops stay at their factories.', t: 3 };
  }
  updateDivisions() {
    for (const d of this.divisions) {
      if (!d || !d.fresh.length || (d.fresh.length < 6 && this.time - d.since < 45)) continue;
      const vets = d.units.filter((u) => !d.fresh.includes(u)), go = d.fresh; d.fresh = [];
      if (!vets.length) continue;
      const cx = vets.reduce((s, u) => s + u.x, 0) / vets.length, cy = vets.reduce((s, u) => s + u.y, 0) / vets.length;
      this.orderUnits(go, cx, cy, true, true); // off to the front, together
    }
  }
  // ---- banners and strips ----
  // A big centred banner for the moments that matter (last stands, a charged uplink, a lake
  // running dry), and strips across the top for any last-stand countdowns.
  banner: { title: string; sub: string; t: number; c: string } | null = null;
  drawBanners() {
    const ctx = this.ctx, W = this.FW - SB; // centred over the battlefield, not the side panel
    const lines: [string, string][] = []; // strips across the top: any last stands
    for (const [t, until] of this.lastStand) { // last stands: a countdown everyone can see
      const s = Math.max(0, Math.ceil(until - this.time)), clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, mine = this.friendly(t);
      lines.push([mine ? `LAST STAND: RAISE A FIELD COMMAND   ${clock}` : `${['BLUE', 'RED', '', 'GREEN', 'GOLD'][t]} LAST STAND   ${clock}`, mine && Math.floor(this.time * 2) % 2 ? C.bad : mine ? C.cream : C.gold]);
    }
    const clearX = this.hints && this.goals.some((_, i) => !this.goalDone[i]) ? 240 : 6; // keep clear of the NEXT STEPS box
    lines.forEach(([line, c], k) => { const w = textWidth(line) + 14, x = Math.max(clearX, Math.round((W - w) / 2)), y = 6 + k * 18; panel(ctx, x, y, w, 15); text(ctx, line, x + 7, y + 4, c, 1, C.ink); });
    if (this.banner && (this.banner.t -= 1 / 60) > 0) { // the banner: big, centred, fading out
      const b = this.banner, a = Math.min(1, b.t);
      ctx.globalAlpha = a;
      const tw = textWidth(b.title) * 2, sw = textWidth(b.sub), bw = Math.max(tw, sw), x = Math.round((W - tw) / 2), y = Math.round(this.FH * 0.2);
      ctx.fillStyle = 'rgba(8,9,10,0.6)'; ctx.fillRect(Math.round((W - bw) / 2) - 12, y - 6, bw + 24, 36); // wide enough for the longer line
      text(ctx, b.title, x, y, b.c, 2, C.ink); text(ctx, b.sub, Math.round((W - sw) / 2), y + 20, C.cream, 1, C.ink);
      ctx.globalAlpha = 1;
    } else this.banner = null;
  }
  // ---- anti-sprawl: occupation, cut-off alerts ----
  raided = new Map<number, number>(); // squares of each side's land that enemy soldiers stand on (they don't pay)
  lastLinked = 0; lastHubs = 0; cutT = 0;
  checkOccupation() {
    const t = this.terrain, own = this.territory.owner, mark = new Uint8Array(N * N);
    this.raided.clear();
    for (const u of this.units) {
      if (!u.def.weapon || u.def.air || u.team === 2) continue;
      const cx = t.cellOf(u.x), cy = t.cellOf(u.y);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy; if (!t.inside(x, y) || dx * dx + dy * dy > 10) continue;
        const i = t.idx(x, y), o = own[i]; if (o < 0 || mark[i] || !this.hostile(o, u.team)) continue;
        mark[i] = 1; this.raided.set(o, (this.raided.get(o) ?? 0) + 1);
      }
    }
    // your network losing a big piece at once, or a hub falling: say so, and which way
    const mine = this.blds.filter((b) => b.team === 0 && b.dying < 0 && b.type !== 'wall'), linked = mine.filter((b) => this.territory.linked.has(b)), hubs = mine.filter((b) => b.type === 'fieldCommand').length;
    if (this.time > this.cutT && (this.lastLinked - linked.length >= 4 || hubs < this.lastHubs)) {
      const lost = mine.filter((b) => !this.territory.linked.has(b));
      const [bx, by] = this.terrain.bases[this.baseOf(0)];
      const mx = lost.length ? lost.reduce((s, b) => s + b.cx, 0) / lost.length : bx, my = lost.length ? lost.reduce((s, b) => s + b.cy, 0) / lost.length : by;
      const a = Math.atan2(my - by, mx - bx), dir = ['eastern', 'south-eastern', 'southern', 'south-western', 'western', 'north-western', 'northern', 'north-eastern'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
      this.warn(hubs < this.lastHubs ? 'A Field Command has fallen! Our network is breaking up.' : `Our ${dir} network has been cut!`, [(mx + 1) * CELL, (my + 1) * CELL]);
      this.cutT = this.time + 15;
    }
    this.lastLinked = linked.length; this.lastHubs = hubs;
  }
  // ---- chain explosions and forest fires ----
  // A blast that hurts everything nearby (any side), scorches the ground, flattens trees and lights the woods.
  blowUp(gx: number, gy: number, r: number, dmg: number) {
    const [sx, sy] = this.scr({ x: gx, y: gy });
    this.blasts.push({ x: sx, y: sy - 4, t: 0, size: r * 0.7 });
    this.near(gx, gy, r, (u) => { const d = Math.hypot(u.x - gx, u.y - gy); if (d < r && u.team !== 2) this.damage(u, dmg * (1 - d / r), 2, null as any); });
    for (const b of [...this.blds]) if (b.max > 0 && b.dying < 0) { const d = this.reach(gx, gy, b); if (d < r * 0.8) this.damage(b, dmg * (1 - d / r), 2, null as any); }
    this.scorch(sx, sy, r * 0.7); this.knockTrees(gx, gy, r);
    this.shakeAt = Math.max(this.shakeAt, Math.min(1, r / 100));
    for (let i = 0; i < 4; i++) this.fires.push({ x: sx + (Math.random() - 0.5) * r * 0.8, y: sy + (Math.random() - 0.5) * r * 0.4, t: 8 + Math.random() * 8, s: 8 });
    this.ignite(gx, gy);
  }
  // Fire in the woods: a burning square lights its neighbours now and then, burns its trees down and
  // hurts whoever is in it, then goes out. Capped, so it can't take the whole map.
  burning = new Map<number, number>(); fireT = 0;
  ignite(gx: number, gy: number) {
    const t = this.terrain, cx = t.cellOf(gx), cy = t.cellOf(gy);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (t.inside(x, y) && t.forest[t.idx(x, y)] && this.burning.size < 300 && !this.burning.has(t.idx(x, y))) this.lightSquare(t.idx(x, y)); }
  }
  lightSquare(i: number) {
    const t = this.terrain, x = i % N, y = (i / N) | 0;
    this.burning.set(i, 9 + Math.random() * 5);
    const [sx, sy] = toScreen((x + 0.5) * CELL, (y + 0.5) * CELL);
    this.fires.push({ x: sx, y: sy - 6, t: 10 + Math.random() * 4, s: 9 });
    this.knockTrees((x + 0.5) * CELL, (y + 0.5) * CELL, 14);
  }
  updateFire(dt: number) {
    if (!this.burning.size || (this.fireT -= dt) > 0) return;
    this.fireT = 0.5;
    const t = this.terrain;
    for (const [i, left] of [...this.burning]) {
      const x = i % N, y = (i / N) | 0;
      if (left - 0.5 <= 0) { this.burning.delete(i); t.forest[i] = 0; continue; }
      this.burning.set(i, left - 0.5);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!t.inside(nx, ny)) continue; const j = t.idx(nx, ny); if (t.forest[j] && !this.burning.has(j) && this.burning.size < 300 && Math.random() < FIRE_SPREAD) this.lightSquare(j); }
      this.near((x + 0.5) * CELL, (y + 0.5) * CELL, 20, (u) => { if (!u.def.air && t.cellOf(u.x) === x && t.cellOf(u.y) === y) this.damage(u, (u.def.vehicle ? 6 : 14) * 0.5, 2, null as any); });
    }
  }
  // ---- dams and floods ----
  dams: { b: Bld; zone: number[]; burst: boolean; ux: number; uy: number; lake: number }[] = []; drains: { k: number; at: number }[] = []; recedes: { zone: number[]; at: number }[] = [];
  floodMask = new Uint16Array(N * N); // which dam's valley each square lies in (0: none)
  floods: { cells: number[]; at: number; ux: number; uy: number; t: number; done?: boolean }[] = [];
  burstDam(b: Bld) {
    const d = this.dams.find((x) => x.b === b); if (!d || d.burst) return;
    d.burst = true;
    this.floods.push({ cells: d.zone, at: 0, ux: d.ux, uy: d.uy, t: 0 });
    for (const i of d.zone) this.floodMask[i] = 0;
    this.warn('A dam has burst! The valley is flooding.', this.posOf(b));
    this.drains.push({ k: d.lake, at: this.time + 15 }); // and the lake behind it runs dry
    this.shakeAt = Math.max(this.shakeAt, 1.2);
  }
  // the water runs down the valley, nearest squares first
  updateFloods(dt: number) {
    for (const f of this.floods) {
      f.t += dt;
      const to = Math.min(f.cells.length, Math.floor((f.at += dt * 14)));
      for (let k = Math.floor(f.at - dt * 14); k < to; k++) if (k >= 0 && k < f.cells.length) this.floodCell(f.cells[k]);
      if (f.at >= f.cells.length && !f.done) { f.done = true; this.landT = 0; }
    }
    this.floods = this.floods.filter((f) => f.t < 40); // the rush settles after a while
  }
  // The dam's outflow: a narrow stream winding down the middle of its valley (just a picture: units wade it)
  floodCell(i: number) {
    const t = this.terrain, x = i % N, y = (i / N) | 0, gx = (x + 0.5) * CELL, gy = (y + 0.5) * CELL;
    t.type[i] = T.WATER; t.elev[i] = 0; t.forest[i] = 0; t.scrap[i] = 0;
    for (const r of [y - 1, y, y + 1]) if (this.trees[r]) this.trees[r] = this.trees[r].filter((tr) => t.idx(t.cellOf(tr.x), t.cellOf(tr.y)) !== i);
    this.near(gx, gy, 20, (u) => { if (!u.def.air && t.cellOf(u.x) === x && t.cellOf(u.y) === y) this.damage(u, u.hp + 1, 2, null as any); }); // swept away
    for (const b of [...this.blds]) if (b.max > 0 && b.dying < 0 && b.team !== 2 && x >= b.cx && x < b.cx + b.w && y >= b.cy && y < b.cy + b.h) this.damage(b, b.hp + 1, 2, null as any);
    this.crates = this.crates.filter((c) => t.cellOf(c.x) !== x || t.cellOf(c.y) !== y); // and loose crates float off
    this.paintFlood([i]);
    const [sx, sy] = toScreen(gx, gy);
    for (let k = 0; k < 2; k++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 20, y: sy - 4, vx: (Math.random() - 0.5) * 20, vy: -16, t: 0, life: 0.6, c: Math.random() < 0.5 ? '#e8f4fa' : '#9ac4d8', s: 1 });
  }
  paintFlood(cells: number[]) {
    const t = this.terrain, near = new Set<number>(); // each new water square and its banks, each painted once
    for (const i of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (t.inside((i % N) + dx, ((i / N) | 0) + dy)) near.add(i + dy * N + dx);
    // paint the new water with rounded edges: a pixel is water where the blend of the nearest squares is mostly water
    const wet = (a: number, b: number) => (t.type[Math.max(0, Math.min(N - 1, b)) * N + Math.max(0, Math.min(N - 1, a))] === T.WATER ? 1 : 0);
    for (const k of near) for (let py = ((k / N) | 0) * CELL, y1 = py + CELL; py < y1; py++) for (let px = (k % N) * CELL, x1 = px + CELL; px < x1; px++) {
      const fx = px / CELL - 0.5 + Math.sin(py * 0.13) * 0.12, fy = py / CELL - 0.5 + Math.sin(px * 0.11) * 0.12, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const w = (wet(ix, iy) * (1 - tx) + wet(ix + 1, iy) * tx) * (1 - ty) + (wet(ix, iy + 1) * (1 - tx) + wet(ix + 1, iy + 1) * tx) * ty;
      if (w <= 0.5) continue;
      const h = hash3(px, 51, py), c = w < 0.6 ? (h < 0.5 ? '#c8d8d0' : '#6a8a80') : h < 0.05 ? '#6a909a' : vnoise2(px, py) > 0.5 ? '#26445a' : '#2e5266'; // foam at the edge
      const [sx, sy] = toScreen(px, py); t.dot(Math.round(sx), Math.round(sy), c);
    }
  }
  // ---- marauders ----
  // Marauders hold the map's richer prizes and a few camps of their own. They never roam: guns dig
  // in around a valuable site (more for a richer one), and each camp is a pair of guns and a squad
  // that guard their ground and drift back to it. Clearing a camp pays a bounty to whoever does it.
  // Everything is placed in the map's symmetric sets, so every side faces the same.
  camps: { x: number; y: number; units: Unit[]; blds: Bld[]; done: boolean }[] = [];
  marauderT = 0;
  placeMarauders() {
    const t = this.terrain, mid = N / 2, B = MARAUDER;
    const gun = (key: string, x: number, y: number) => (this.autoPlace(key, B, x, y) ? this.blds[this.blds.length - 1] : null);
    for (const s of this.blds.filter((b) => b.team === 2 && SITE_GUNS[b.type] && (b.type === 'uplink' || Math.hypot(b.cx - mid, b.cy - mid) > t.island + 4))) { // guns round the valuable sites, facing the middle (in the citadel only the uplink has them: its bunkers guard the rest)
      const flank = t.flanks.some(([fx, fy]) => Math.hypot(s.cx - fx, s.cy - fy) < 8); // a flank compound is one prize: two guns at its depot, so it's worth a real push but not a siege
      const n = flank ? (s.type === 'fuelDepot' ? 2 : 0) : SITE_GUNS[s.type], cx = s.cx + s.w / 2, cy = s.cy + s.h / 2, a0 = Math.atan2(mid - cy, mid - cx);
      for (let k = 0; k < n; k++) { const a = a0 + (k - (n - 1) / 2) * 1.5; gun(k === 1 ? 'emplacement' : 'guardTower', Math.round(cx + Math.cos(a) * 4.5 - 0.5), Math.round(cy + Math.sin(a) * 4.5 - 0.5)); }
    }
    // camps: open ground away from bases, the middle and other prizes, near scrap, oil or a river crossing
    const open = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!t.inside(x + dx, y + dy)) return false; const i = t.idx(x + dx, y + dy), ty = t.type[i]; if (t.occupied[i] || t.elev[i] === 1 || (ty !== T.GRASS && ty !== T.DIRT && ty !== T.SCRAP)) return false; } return true; };
    const score = (x: number, y: number) => {
      if (!open(x, y) || t.bases.some(([bx, by]) => Math.hypot(bx - x, by - y) < 45) || Math.hypot(mid - x, mid - y) < 24 || t.villages.some(([vx, vy]) => Math.hypot(vx - x, vy - y) < 14) || this.blds.some((b) => b.team !== 2 || CAPTURE[b.type] ? Math.hypot(b.cx - x, b.cy - y) < 10 : false) || this.camps.some((c) => Math.hypot(c.x - x, c.y - y) < 30)) return -1;
      let v = 1;
      for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) if (t.inside(x + dx, y + dy)) { const ty = t.type[t.idx(x + dx, y + dy)]; if (ty === T.SCRAP) v += 0.15; if (ty === T.BRIDGE || ty === T.FORD) v += 0.8; }
      for (const o of t.oil) if (Math.hypot(o.cx - x, o.cy - y) < 10) v += 2;
      return v;
    };
    for (let set = 0; set < 2; set++) {
      let best: [number, number] | null = null, bs = 0;
      for (let y = 8; y < N - 8; y += 3) for (let x = 8; x < N - 8; x += 3) { const v = score(x, y); if (v > bs) { bs = v; best = [x, y]; } }
      if (!best) break;
      for (const [x, y] of t.orbit(best)) {
        const camp = { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, units: [] as Unit[], blds: [] as Bld[], done: false };
        for (const [k, dx, dy] of [['guardTower', 2, -1], ['emplacement', -3, 1]] as [string, number, number][]) { const b = gun(k, x + dx, y + dy); if (b) camp.blds.push(b); }
        for (const [k, n] of [['rifle', 3], ['rocket', 2], ['scout', 1]] as [string, number][]) for (let i = 0; i < n; i++) {
          const u = this.addUnit(k, B, camp.x + Math.cos(i * 2.1 + k.length) * 2 * CELL, camp.y + Math.sin(i * 2.1 + k.length) * 2 * CELL);
          u.home = [u.x, u.y]; camp.units.push(u);
        }
        this.camps.push(camp);
      }
    }
  }
  // Twice a second-ish: marauders wander back to their posts; a cleared camp pays its bounty.
  updateMarauders() {
    for (const u of this.units) if (u.team === MARAUDER && u.home && !u.target && !u.goal && Math.hypot(u.x - u.home[0], u.y - u.home[1]) > 5 * CELL) { u.goal = [u.home[0], u.home[1]]; u.path = this.route(u, u.home[0], u.home[1]); }
    for (const c of this.camps) {
      if (c.done || c.units.some((u) => u.hp > 0 && !u.gone) || c.blds.some((b) => b.dying < 0 && !b.gone)) continue;
      c.done = true;
      const near: Record<number, number> = {}; // the side with the most armed units close by cleared it
      this.near(c.x, c.y, 14 * CELL, (u) => { if (u.team !== 2 && u.team !== MARAUDER && u.def.weapon) near[u.team] = (near[u.team] ?? 0) + 1; });
      const who = Number(Object.entries(near).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1);
      if (who < 0) continue;
      this.prods[who].credits += CAMP_BOUNTY;
      if (who === 0) { this.bark = { who: 'Marauder camp', line: `Cleared! Bounty: +$${CAMP_BOUNTY}.`, t: 3 }; audio.radio(); }
      const [sx, sy] = this.scr(c);
      for (let i = 0; i < 12; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 20, y: sy - 4, vx: (Math.random() - 0.5) * 14, vy: -14, t: 0, life: 0.8, c: '#ffd040', s: 1 });
    }
  }
  // ---- concealment ----
  // Hidden from an alliance? Riflemen, rockets, grenadiers and field guns are while standing still in forest and not shooting. Anything hostile close by, a scout or guard
  // tower a bit further, or a radar tower further still, spots them.
  hid(u: Unit, team: number) { return ((u.cloak >> this.ally[team]) & 1) === 1; }
  spot(u: Unit) { return this.friendly(u.team) || (this.sees(u.x, u.y) && !this.hid(u, 0)); } // can you see it?
  cloakT = 0;
  updateCloak() {
    const t = this.terrain, eyes = this.blds.filter((b) => (b.type === 'guardTower' || b.type === 'radar') && b.rise >= 1 && b.dying < 0 && b.team !== 2);
    const groups = [...new Set(this.sides.map((s) => this.ally[s]))];
    for (const u of this.units) {
      u.cloak = 0;
      if (u.team === 2 || u.hp <= 0) continue;
      const camo = CAMO.has(u.type) && u.team !== MARAUDER && !u.moving && this.time - u.firedAt > 3 && t.forest[t.idx(t.cellOf(u.x), t.cellOf(u.y))] > 0;
      if (!camo) continue;
      let mask = 0; for (const g of groups) if (g !== this.ally[u.team]) mask |= 1 << g;
      this.near(u.x, u.y, DETECT.scout * CELL, (o) => { if (o.team === 2 || !this.hostile(o.team, u.team)) return; const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < DETECT.near * CELL || (o.type === 'scout' && d < DETECT.scout * CELL)) mask &= ~(1 << this.ally[o.team]); });
      for (const b of eyes) if (this.hostile(b.team, u.team) && Math.hypot((b.cx + b.w / 2) * CELL - u.x, (b.cy + b.h / 2) * CELL - u.y) < DETECT[b.type] * CELL) mask &= ~(1 << this.ally[b.team]);
      u.cloak = mask;
    }
    // anyone aiming at something that just vanished loses it
    for (const o of this.units) if (o.target && this.isUnit(o.target) && this.hid(o.target, o.team)) o.target = null;
    for (const b of this.blds) if (b.target && this.isUnit(b.target) && this.hid(b.target, b.team)) b.target = null;
  }

  // ---- construction ----
  startSite(b: Bld) { b.rise = 0; b.hp = Math.max(1, b.max * 0.1); b.job = ++this.jobSeq; } // each site joins the end of its side's build queue
  // send a builder to the nearest open cell around a site (the closest edge may be walled in)
  assignSite(u: Unit, b: Bld) {
    u.buildSite = b;
    const t = this.terrain, spots: [number, number][] = [];
    for (let y = b.cy - 1; y <= b.cy + b.h; y++) for (let x = b.cx - 1; x <= b.cx + b.w; x++)
      if ((x < b.cx || y < b.cy || x >= b.cx + b.w || y >= b.cy + b.h) && t.open(x, y, u.def.crush)) spots.push([(x + 0.5) * CELL, (y + 0.5) * CELL]);
    spots.sort((p, q) => Math.hypot(p[0] - u.x, p[1] - u.y) - Math.hypot(q[0] - u.x, q[1] - u.y));
    u.stuck = 0; u.queue = [];
    if (!spots[0]) return;
    u.goal = spots[0]; u.path = [];
    // The nearest few open spots beside it, each tried while this frame's share of route planning lasts
    // (past it, the builder plans its own way in a moment). A search that falls short ends as near as it
    // could get, so any spot it ends beside will do; the first searches far, the rest only nearby.
    for (let k = 0; k < Math.min(4, spots.length) && pathStats.work < PATH_WORK; k++) {
      const [gx, gy] = spots[k], path = findPath(t, u.x, u.y, gx, gy, u.def.crush, k ? REPLAN : undefined), end = path[path.length - 1];
      const at = end && spots.find(([sx, sy]) => Math.hypot(end[0] - sx, end[1] - sy) < CELL);
      if (at) { u.goal = at; u.path = path; return; }
      if (!k) u.path = path; // none reached: head as near as the first search got
    }
  }
  cancelSite(b: Bld) {
    const d = DEF[b.type];
    if (d) this.prods[b.team].credits += Math.round(d.cost * b.rise);
    this.dropBld(b);
    for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
    if (b === this.selBld) this.selBld = null;
    audio.click();
  }
  // A side's build queue: its unfinished sites, oldest first (a wall line is one job, laid block by block).
  queueOf(team: number) {
    const jobs = new Map<number, Bld[]>();
    for (const b of this.blds) if (b.team === team && b.rise < 1 && b.dying < 0 && b.max > 0 && b.type !== 'bridge' && !(b.blocked! > this.time)) { const k = b.job ?? 0, l = jobs.get(k); if (l) l.push(b); else jobs.set(k, [b]); }
    return [...jobs.values()];
  }
  // The next job for a free builder: the oldest site nobody is on; failing that, a hand on the oldest
  // with room (three to a site; a wall line takes three, each on its own block). Nearest block first.
  nextJob(u: Unit, q: Bld[][]) {
    const on = (b: Bld) => this.units.some((o) => o.buildSite === b), crew = (j: Bld[]) => this.units.filter((o) => o.buildSite && j.includes(o.buildSite)).length;
    const job = q.find((j) => crew(j) === 0) ?? q.find((j) => crew(j) < 3);
    if (!job) return null;
    const free = job.filter((b) => !on(b)), pool = free.length ? free : job;
    return pool.reduce((p, c) => (this.reach(u.x, u.y, c) < this.reach(u.x, u.y, p) ? c : p));
  }
  // Builders never stand about: a free one takes the next job in the queue, wherever it is; with the
  // queue empty it patches up damage within 10 cells. One you've sent somewhere rests there 15 seconds first.
  builderHelp() {
    for (const team of this.sides) {
      const q = this.queueOf(team);
      if (this.ais.some((ai) => ai.me === team)) q.sort((a, b) => (a[0].type === 'wall' ? 1 : 0) - (b[0].type === 'wall' ? 1 : 0)); // the computer lays its sandbags last: buildings (a new Field Command above all) come first (since walls became sites, its builders spent the game on sandbags and it stopped spreading)
      for (const u of this.builders(team)) {
        if (u.buildSite || u.goal || u.path.length) continue;
        if (u.hold) { u.hold = false; u.rest = this.time + 15; }
        if (this.time < u.rest) continue;
        const next = this.nextJob(u, q);
        if (next) { this.assignSite(u, next); continue; }
        let best: Bld | null = null, bd = 1e9;
        for (const b of this.blds) {
          if (b.team !== team || b.max <= 0 || b.dying >= 0 || b.rise < 1 || b.type === 'wall' || b.hp >= b.max * 0.9) continue;
          const d = this.reach(u.x, u.y, b);
          if (d < 10 * CELL && d < bd) { bd = d; best = b; }
        }
        if (best) this.assignSite(u, best);
      }
    }
    this.numberQueue();
  }
  // Which waiting jobs come next, numbered for the player's sites (1 = the next a free builder takes).
  numberQueue() {
    this.waitNo.clear(); let n = 0;
    for (const j of this.queueOf(0)) if (!j.some((b) => this.units.some((o) => o.buildSite === b))) this.waitNo.set(j[0], ++n);
  }
  // "2nd in line" and so on
  ordinal(n: number) { return n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'); }
  // Builders at a site spend credits and raise the building; up to three can work together.
  updateConstruction(dt: number) {
    for (const b of this.blds) {
      if (b.dying >= 0 || b.max <= 0) continue;
      const d = DEF[b.type];
      if (!d) { b.rise = 1; continue; }
      if (b.rise >= 1 && b.hp >= b.max) continue;
      const crew = this.units.filter((u) => u.buildSite === b && this.reach(u.x, u.y, b) < (b.type === 'bridge' ? 80 : 36)).length;
      if (!crew) { // a site waits its turn in the queue, but one nobody has started in five minutes is forgotten or out of reach: it's cleared away (it cost nothing yet)
        if (this.units.some((u) => u.buildSite && u.buildSite.job === b.job)) { b.idle = 0; continue; } // (its wall line is being laid: it's just next)
        if (b.rise === 0 && (b.idle = (b.idle ?? 0) + dt) > 300) {
          if (b.team === 0) { this.bark = { who: 'Builder', line: `${b.type === 'wall' ? 'Sandbags' : b.name} site cleared: nobody got to it in five minutes.`, t: 3.5 }; this.alertAt = [(b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL]; }
          this.cancelSite(b);
        }
        continue;
      }
      b.idle = 0;
      if (b.rise >= 1) { // repairs: a builder restores about 5% a second, for a third of what the lost part cost
        const want = Math.min(b.max - b.hp, b.max * 0.05 * Math.min(crew, 3) * dt), pay = Math.min((want / b.max) * d.cost * 0.33, this.prods[b.team].credits);
        this.prods[b.team].credits -= pay; b.hp += (pay / (d.cost * 0.33)) * b.max;
        if (pay > 0 && Math.random() < dt * 6) { const [px, py] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL); this.puffs.push({ x: px, y: py - 6 - Math.random() * 12, vx: (Math.random() - 0.5) * 20, vy: -10, t: 0, life: 0.3, c: '#fff4b0', s: 1, g: 60 }); }
        if (b.hp >= b.max) { b.hp = b.max; for (const u of this.units) if (u.buildSite === b) u.buildSite = null; }
        continue;
      }
      const team = b.team, pw = this.powers[team];
      const rate = (Math.min(crew, 3) / d.time) * this.powerEff(team);
      const pay = Math.min(d.cost * rate * dt, this.prods[team].credits, d.cost * (1 - b.rise));
      if (pay > 0 && !b.cleared) { b.cleared = true; this.fell(b); }
      this.prods[team].credits -= pay;
      b.rise = Math.min(1, b.rise + pay / d.cost);
      b.hp = Math.min(b.max, b.hp + b.max * 0.9 * (pay / d.cost));
      if (pay > 0 && Math.random() < dt * 12) { // welding sparks and dust on the site
        const [px, py] = toScreen((b.cx + Math.random() * b.w) * CELL, (b.cy + Math.random() * b.h) * CELL), h = 4 + Math.random() * 20 * b.rise;
        this.puffs.push({ x: px, y: py - h, vx: (Math.random() - 0.5) * 20, vy: -10, t: 0, life: 0.3, c: Math.random() < 0.5 ? '#fff4b0' : '#ffb040', s: 1, g: 60 });
        if (Math.random() < 0.4) this.puffs.push({ x: px, y: py, vx: (Math.random() - 0.5) * 6, vy: -4, t: 0, life: 1.2, c: '#8a8070', s: 2 });
      }
      if (b.rise >= 1) {
        b.hp = b.max;
        if (b.type === 'bridge') { for (const u of this.units) if (u.buildSite === b) u.buildSite = null; this.mendBridge(b); continue; }
        for (const u of this.units) if (u.buildSite === b) u.buildSite = null;
        if (b.type === 'scrapyard') { const u = this.addUnit('harvester', team, (b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.8) * CELL); u.heading = u.tHead = Math.PI / 2; } // every scrapyard comes with a salvager
        if (team === 0 && b.type !== 'wall') { this.bark = { who: 'Builder', line: `${d.name} complete.`, t: 3 }; audio.radio(); } // (not for every block of a wall)
      }
    }
  }

  // Corner brackets around a selected building's footprint, on the turned grid.
  outline(b: Bld, vx: number, vy: number) {
    const ctx = this.ctx, lift = this.terrain.lift((b.cx + 0.5) * CELL, (b.cy + 0.5) * CELL);
    ctx.fillStyle = C.cream;
    for (const [gx, gy] of [[b.cx, b.cy], [b.cx + b.w, b.cy], [b.cx, b.cy + b.h], [b.cx + b.w, b.cy + b.h]]) {
      const [sx, sy] = toScreen(gx * CELL, gy * CELL), x = Math.round(sx - vx), y = Math.round(sy - lift - vy);
      ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
    }
  }

  // Wooden scaffold poles at each corner with rails every few pixels, up to the work in progress.
  // A building under construction, as it would really go up, in five stages: the foundation slab;
  // then the walls course by course from the bottom (open at the top, insides showing) inside a steel
  // frame with a timber working platform just above the newest course; the roof only at the end.
  // Each stage is made from the building's own blocks the first time it's needed.
  stages = new Map<string, Sprite>();
  constructionStage(b: Bld, st: number): Sprite {
    const key = b.type + b.team + ':' + st, have = this.stages.get(key);
    if (have) return have;
    const def = this.looks[this.lookKey(b)].def, full = def.body, top = full.max[1], level = Math.round((top * st) / 5);
    const vb = new VB();
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    full.each((x, y, z, c) => { if (y <= level) vb.set(x, y, z, c); if (y >= 1) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } });
    if (st > 0 && x0 < x1) { // the frame: steel posts round the walls, a timber platform at the working height
      const fh = Math.min(top, level + 4), STEEL = 0x6e7278, TIMBER = 0x8a6a3a;
      for (let x = x0; x <= x1; x += 6) for (const z of [z0, z1]) for (let y = 1; y <= fh; y++) vb.set(x, y, z, STEEL);
      for (let z = z0; z <= z1; z += 6) for (const x of [x0, x1]) for (let y = 1; y <= fh; y++) vb.set(x, y, z, STEEL);
      for (let x = x0; x <= x1; x++) { vb.set(x, fh, z0, TIMBER); vb.set(x, fh, z1, TIMBER); }
      for (let z = z0; z <= z1; z++) { vb.set(x0, fh, z, TIMBER); vb.set(x1, fh, z, TIMBER); }
    }
    const sp = bake({ body: vb, bodyPivot: def.bodyPivot }, 'body', { team: TEAMS[b.team], yaw: YAW })[0];
    this.stages.set(key, sp);
    return sp;
  }

  // The building under a point on the screen (world pixels): its picture, not just its squares (in this view a
  // building stands up off its footprint), the front one where pictures overlap. Unspotted ones don't count.
  bldAtScreen(px: number, py: number) {
    let best: Bld | null = null, bf = -1e9;
    for (const b of this.blds) {
      if (b.type === 'bridge' || (!this.friendly(b.team) && b.team !== 2 && !b.seen)) continue;
      const s = this.looks[this.lookKey(b)]?.body[0]; if (!s) continue;
      const [bx, by] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }), ix = Math.floor(px - bx + s.ax), iy = Math.floor(py - by + s.ay);
      if (ix < 0 || iy < 0 || ix >= s.img.width || iy >= s.img.height) continue;
      const g = (this.pickCtx.get(s.img) ?? this.pickCtx.set(s.img, s.img.getContext('2d', { willReadFrequently: true })!).get(s.img))!;
      if (g.getImageData(ix, iy, 1, 1).data[3] < 40) continue; // a see-through corner of the picture
      const front = toScreen((b.cx + b.w) * CELL, (b.cy + b.h) * CELL)[1]; if (front > bf) { bf = front; best = b; }
    }
    return best ?? this.bldAt(...this.groundAt(px, py)); // (a bridge, or a slab with nothing on it yet)
  }
  pickCtx = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
  bldAt(gx: number, gy: number) {
    const cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL);
    return this.blds.find((b) => cx >= b.cx && cx < b.cx + b.w && cy >= b.cy && cy < b.cy + b.h) ?? null;
  }

  // Infantry reach a site: capture it, or climb in to garrison it.
  enter(u: Unit, b: Bld) {
    u.enter = null;
    const c = CAPTURE[b.type];
    if (!c) return;
    if (c.garrison && b.team === u.team && b.garrison >= c.garrison) { u.path = []; u.goal = null; return; }
    if (b.team !== u.team && b.garrison > 0) { u.path = []; u.goal = null; return; } // held by the other side
    this.drop(u);
    const was = b.team;
    b.team = u.team;
    if (c.garrison) b.garrison++;
    if (u.team === 0) { this.bark = { who: c.name, line: was === 0 ? 'Another one inside. Cosy.' : 'Captured. The previous owners left in a hurry.', t: 3 }; audio.radio(); audio.click(); }
    else if (was === 0) this.warn(`The enemy has taken our ${c.name}!`, this.posOf(b));
    if (was !== u.team) { b.timer = 0; this.siteBonus(b, true); }
  }

  // Captured sites pay out: vehicles from the motor pool, infantry from the recruiting office.
  siteBonus(b: Bld, first: boolean) {
    const ox = (b.cx + b.w / 2) * CELL, oy = (b.cy + b.h + 0.8) * CELL;
    if (b.type === 'motorPool') this.addUnit('tank', b.team, ox, oy).heading = Math.PI / 2;
    if (b.type === 'recruitOffice') for (let i = 0; i < (first ? 3 : 2); i++) this.addUnit('rifle', b.team, ox - 6 + i * 6, oy);
  }
  updateSites(dt: number) {
    for (const b of this.blds) {
      if (b.team === 2 || (b.type !== 'motorPool' && b.type !== 'recruitOffice')) continue;
      if (!this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) continue; // no base of your own: the site has nobody to report to
      b.timer += dt;
      const every = b.type === 'motorPool' ? 90 : 60;
      if (b.timer >= every) { b.timer -= every; this.siteBonus(b, false); }
    }
  }

  // A flag on a pole at the site's corner, in the owner's colour, rippling in the wind.
  drawFlag(b: Bld, vx: number, vy: number) {
    const ctx = this.ctx, [fx, fy] = this.scr({ x: b.cx * CELL + 3, y: b.cy * CELL + 3 });
    const x = Math.round(fx - vx), y = Math.round(fy - vy);
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(x, y - 22, 1, 22);
    ctx.fillStyle = '#c8c8c0'; ctx.fillRect(x, y - 23, 1, 1);
    const [col, dark] = FLAG[b.team] ?? FLAG[2];
    const wave = Math.floor(this.time * 5 + b.cx) % 2;
    for (let i = 0; i < 7; i++) {
      const dy = i > 2 && (i + wave) % 3 === 0 ? 1 : 0;
      ctx.fillStyle = i % 3 === 2 ? dark : col; ctx.fillRect(x + 1 + i, y - 22 + dy, 1, 4);
    }
    const g = CAPTURE[b.type].garrison;
    if (g) for (let i = 0; i < g; i++) { ctx.fillStyle = i < b.garrison ? C.ok : '#3a3a3a'; ctx.fillRect(x + 1 + i * 3, y - 16, 2, 2); }
  }

  // ---- ambient life ----
  spawnLife() {
    const t = this.terrain, rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const add = (kind: string, look: Sprite[], x: number, y: number, speed: number) =>
      this.agents.push({ kind, x, y, heading: Math.random() * 7, look, speed, home: [x, y], goal: null, wait: Math.random() * 4, scared: 0, step: 0 });
    for (const [vx, vy] of t.villages) {
      for (let i = 0; i < 7; i++) add('civilian', this.lifeLooks['civilian' + (i % 3)], (vx + rnd(-3, 3)) * CELL, (vy + rnd(-3, 3)) * CELL, 7);
      for (let i = 0; i < 4; i++) {
        // cows graze on open grass near the village fields
        const x = (vx + rnd(-8, 8)) * CELL, y = (vy + rnd(-8, 8)) * CELL;
        if (t.open(t.cellOf(x), t.cellOf(y), false)) add('cow', this.lifeLooks.cow, x, y, 4);
      }
    }
    // deer at forest edges
    let deer = 0;
    for (let k = 0; k < 400 && deer < 22; k++) {
      const [x, y] = t.trees[(Math.random() * t.trees.length) | 0];
      const nx = x + rnd(-30, 30), ny = y + rnd(-30, 30);
      if (t.open(t.cellOf(nx), t.cellOf(ny), false)) { add('deer', this.lifeLooks.deer, nx, ny, 8); deer++; }
    }
    // town traffic: each village's cars live there, driving between its houses, shops and hall
    t.villages.forEach(([vx, vy], vi) => {
      const road = (x: number, y: number) => Math.hypot(x - vx, y - vy) < 16 && (t.type[t.idx(x, y)] === T.ROAD || t.type[t.idx(x, y)] === T.PAVED);
      const doors: [number, number][] = []; // each house's kerb: the road square nearest its door
      for (const b of this.blds) {
        if (b.team !== 2 || Math.hypot(b.cx + b.w / 2 - vx, b.cy + b.h / 2 - vy) >= 12) continue;
        let best: [number, number] | null = null, bd = 5;
        for (let y = b.cy - 4; y < b.cy + b.h + 4; y++) for (let x = b.cx - 4; x < b.cx + b.w + 4; x++) { const d = Math.hypot(x + 0.5 - (b.cx + b.w / 2), y + 0.5 - (b.cy + b.h)); if (d < bd && road(x, y) && t.open(x, y, false)) { bd = d; best = [(x + 0.5) * CELL, (y + 0.5) * CELL]; } }
        if (best && !doors.some(([x, y]) => x === best![0] && y === best![1])) doors.push(best);
      }
      const streets = (ax: number, ay: number, bx: number, by: number) => roadRoute(t, ax, ay, bx, by, road);
      if (doors.length < 2) return;
      for (let i = 0; i < 3; i++) {
        const kind = (i + vi) % 2 ? 'pickup' : 'car', [x, y] = doors[(i * 3 + vi) % doors.length];
        this.agents.push({ kind, x, y, heading: Math.random() * 6.28, look: this.lifeLooks[kind + ((i + vi) % 4)], speed: 26, home: [x, y], goal: null, wait: 2 + i * 5, scared: 0, route: [], ri: 0, step: 0, doors, streets, stuckT: 0, tries: 0 });
      }
    });
    for (let i = 0; i < 4; i++) this.birds.push({ x: rnd(0, SW), y: rnd(0, SH), vx: rnd(14, 22) * (i % 2 ? 1 : -1), vy: rnd(-6, 6), n: 4 + (i % 4), seed: i * 7 });
  }

  // the door of the nearest house (a village building) within reach
  houseNear(x: number, y: number, r = 140): [number, number] | null {
    let best: [number, number] | null = null, bd = r;
    for (const b of this.blds) { if (b.team !== 2 || b.max > 0 || CAPTURE[b.type]) continue; const dx = (b.cx + b.w / 2) * CELL, dy = (b.cy + b.h + 0.3) * CELL, d = Math.hypot(dx - x, dy - y); if (d < bd) { bd = d; best = [dx, dy]; } }
    return best;
  }
  lifeTick = 0;
  updateLife(dt: number) {
    const t = this.terrain;
    this.lifeTick++;
    for (const a of this.agents) {
      a.step += dt * 9;
      // anything armed coming close (or a blast nearby) makes people and animals scatter;
      // people run for the nearest house and shelter inside until it's calm. No one gets hurt.
      const person = a.kind === 'civilian';
      let threat: { x: number; y: number } | null = null, td = a.kind === 'deer' ? 90 : person ? 170 : 46;
      if (a.kind !== 'car' && a.kind !== 'pickup' && ((this.lifeTick + a.step) % 3) < 1) { // looked at every few frames, through the unit grid
        this.near(a.x, a.y, td, (u) => { if (u.team === 2 || (!person && a.kind !== 'deer' && !u.def.vehicle) || (person && !u.def.weapon && !u.def.vehicle)) return; const d = Math.hypot(u.x - a.x, u.y - a.y); if (d < td) { td = d; threat = u; } });
        if (person && !threat) for (const b of [...this.blasts, ...this.tracers.map((r) => ({ x: r.x1, y: r.y1 }))]) { const [gx, gy] = toGround(b.x, b.y); if (Math.hypot(gx - a.x, gy - a.y) < 220) { threat = { x: gx, y: gy }; break; } } // explosions and gunfire nearby
      }
      if (a.hidden) { if (threat) a.hidden = 8; else if ((a.hidden -= dt) <= 0) { a.hidden = 0; a.goal = null; } continue; } // indoors: wait for calm
      if (threat) {
        const house = person ? this.houseNear(a.x, a.y) : null;
        if (house) { a.goal = house; a.scared = 3; a.wait = 0; a.shelter = true; }
        else { const ang = Math.atan2(a.y - threat.y, a.x - threat.x) + (Math.random() - 0.5) * 0.6; a.goal = [a.x + Math.cos(ang) * 60, a.y + Math.sin(ang) * 60]; a.scared = 2.5; a.wait = 0; }
      }
      if (a.doors) { // a car: errands round its own village, along its streets, parking at a kerb between trips
        if (a.wait > 0) { a.wait -= dt; continue; }
        if (!a.route!.length || a.ri! >= a.route!.length) { // off somewhere new: home now and then, otherwise another door in town
          const atHome = Math.hypot(a.x - a.home[0], a.y - a.home[1]) < 20, dest = !atHome && Math.random() < 0.4 ? a.home : a.doors[(Math.random() * a.doors.length) | 0];
          if (Math.hypot(dest[0] - a.x, dest[1] - a.y) < 30) { a.wait = 2; continue; }
          a.route = a.streets!(a.x, a.y, dest[0], dest[1]); a.ri = 0; a.stuckT = 0; a.lx = a.x; a.ly = a.y;
          if (!a.route.length) { a.wait = 3; continue; }
        }
        const [tx, ty] = a.route![a.ri!], dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
        if (d < 4) { a.ri!++; if (a.ri! >= a.route!.length) { a.route = []; a.tries = 0; a.wait = 6 + Math.random() * 10; } continue; } // arrived: park a while
        const want = Math.atan2(dy, dx);
        a.heading += Math.max(-dt * 3, Math.min(dt * 3, angDiff(a.heading, want)));
        const ahead = this.units.some((u) => Math.hypot(u.x - (a.x + Math.cos(a.heading) * 16), u.y - (a.y + Math.sin(a.heading) * 16)) < u.def.radius + 8);
        if (!ahead) {
          const go = Math.max(0.15, Math.cos(angDiff(a.heading, want))), nx = a.x + Math.cos(a.heading) * a.speed * dt * go, ny = a.y + Math.sin(a.heading) * a.speed * dt * go;
          if (t.open(t.cellOf(nx), t.cellOf(ny), false)) { a.x = nx; a.y = ny; } // never into water or a building
        }
        if ((a.stuckT! += dt) > 3) { // hardly moved in three seconds: try another trip; after a few, slip back home
          if (Math.hypot(a.x - a.lx!, a.y - a.ly!) < 8) { a.route = []; if (++a.tries! > 3) { a.x = a.home[0]; a.y = a.home[1]; a.tries = 0; a.wait = 5; } }
          a.stuckT = 0; a.lx = a.x; a.ly = a.y;
        }
        continue;
      }
      if (!a.goal) {
        if ((a.wait -= dt) > 0) continue;
        const r = a.kind === 'cow' ? 40 : a.kind === 'deer' ? 70 : 60, ang = Math.random() * Math.PI * 2;
        const gx = a.home[0] + Math.cos(ang) * Math.random() * r, gy = a.home[1] + Math.sin(ang) * Math.random() * r;
        if (t.open(t.cellOf(gx), t.cellOf(gy), false)) a.goal = [gx, gy];
        a.wait = a.kind === 'cow' ? 4 + Math.random() * 8 : 1 + Math.random() * 4;
        continue;
      }
      const dx = a.goal[0] - a.x, dy = a.goal[1] - a.y, d = Math.hypot(dx, dy);
      if (d < 2) { if (a.shelter) { a.hidden = 8; a.shelter = false; } a.goal = null; continue; } // reached the door: inside
      a.heading = Math.atan2(dy, dx);
      const sp = a.speed * (a.scared > 0 ? (a.kind === 'cow' ? 2.5 : 3) : 1) * dt;
      a.scared -= dt;
      const nx = a.x + (dx / d) * sp, ny = a.y + (dy / d) * sp;
      if (t.open(t.cellOf(nx), t.cellOf(ny), false) || a.shelter) { a.x = nx; a.y = ny; } else a.goal = null; // (a door may sit by a wall: keep going)
    }
  }

  // Small flocks crossing the sky, with faint shadows far below.
  drawBirds(vx: number, vy: number) {
    const ctx = this.ctx, dt = 1 / 60;
    for (const f of this.birds) {
      f.x = (f.x + f.vx * dt + SW) % SW; f.y = (f.y + f.vy * dt + SH) % SH;
      for (let i = 0; i < f.n; i++) {
        const bx = Math.round(f.x - vx + ((i * 7 + f.seed) % 11) - 5 - (i * Math.sign(f.vx)) * 4), by = Math.round(f.y - vy + ((i * 5 + f.seed) % 9) - 4 + i * 2);
        if (bx < -10 || by < -10 || bx > this.FW + 10 || by > this.FH + 10) continue;
        const up = Math.floor(this.time * 7 + i) % 2;
        ctx.fillStyle = 'rgba(10,16,24,0.18)'; ctx.fillRect(bx + 14, by + 26, 3, 1);
        ctx.fillStyle = '#2a2622';
        ctx.fillRect(bx, by, 1, 1); ctx.fillRect(bx - 1, by - up, 1, 1); ctx.fillRect(bx + 1, by - up, 1, 1);
      }
    }
  }

  // Open water sparkles: a few pixels catch the sun and twinkle.
  // A little broken chain over a building of yours too far from the rest to link to your network.
  drawCut(x: number, y: number) {
    const ctx = this.ctx, on = Math.floor(this.time * 2) % 2 === 0;
    ctx.fillStyle = C.ink; ctx.fillRect(x - 6, y - 3, 13, 6);
    ctx.fillStyle = on ? '#ffb040' : '#d08020';
    for (const ox of [-5, 2]) { ctx.fillRect(x + ox, y - 2, 4, 1); ctx.fillRect(x + ox, y + 1, 4, 1); ctx.fillRect(x + ox, y - 1, 1, 2); ctx.fillRect(x + ox + 3, y - 1, 1, 2); }
    ctx.fillStyle = '#ffe0a0'; ctx.fillRect(x, y - 3, 1, 1); ctx.fillRect(x, y + 2, 1, 1);
  }
  // Joined to its side's network? Cut-off buildings work at half rate.
  link(b: Bld) { return (this.territory.linked.has(b) ? 1 : 0.5) * (this.town.has(b) ? 1.25 : 1); } // and a quarter faster in a town centre
  // Work out who owns what (see territory.ts) and repaint the radar's picture of it.
  updateLand() {
    const t = this.terrain, land = this.territory, before = this.state === 'play' ? land.owner.slice() : null;
    land.compute(t, this.sides.filter((s) => !this.out.has(s)), this.blds, (team) => t.bases[this.baseOf(team)], (b) => (b.type === 'fieldCommand' ? 14 : CAPTURE[b.type] && !CAPTURE[b.type].garrison ? SITE_REACH : 0)); // Field Commands are the big hearts; a held site is a small one, so taking prizes far out grows the empire
    { let h = 0; for (const [team, seg] of land.lines) { h = (h * 31 + team) | 0; for (let k = 0; k < seg.length; k++) h = (h * 31 + Math.round(seg[k] * 8)) | 0; } if (h !== this.borderHash) { this.borderHash = h; this.borderVer++; } } // (the cached border tiles are redrawn only if the borders really moved)
    if (this.state === 'play') this.checkOccupation();
    if (before) { // ground you've just gained glows for a moment, with what it earns
      const won: number[] = []; for (let i = 0; i < before.length; i++) if (land.owner[i] === 0 && before[i] !== 0) won.push(i);
      if (won.length >= 12) {
        let sx = 0, sy = 0; for (const i of won) { sx += i % N; sy += (i / N) | 0; }
        this.gained.push({ cells: won, t: 0, x: (sx / won.length + 0.5) * CELL, y: (sy / won.length + 0.5) * CELL, pay: won.length * LAND_RATE });
      }
    }
    // town centre: within TOWN squares of a finished Field Command of its side
    // fortified line: a defence with two more of its side's defences within FORT squares
    this.town.clear(); this.fort.clear();
    const hubs = this.blds.filter((b) => b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0), guns = this.blds.filter((b) => DEFENCE[b.type] && b.dying < 0 && b.team !== 2);
    for (const b of this.blds) {
      if (b.team === 2 || b.dying >= 0 || b.type === 'wall' || b.type === 'fieldCommand') continue;
      const x = b.cx + b.w / 2, y = b.cy + b.h / 2;
      if (hubs.some((h) => h.team === b.team && Math.hypot(h.cx + 1.5 - x, h.cy + 1.5 - y) <= TOWN)) this.town.add(b);
      if (DEFENCE[b.type] && guns.filter((o) => o !== b && o.team === b.team && Math.hypot(o.cx - b.cx, o.cy - b.cy) <= FORT).length >= 2) this.fort.add(b);
    }
    // home ground: units inside their own borders, out of the fight, patch themselves up
    for (const u of this.units) if (u.team !== 2 && u.hp > 0 && u.hp < u.def.hp && this.time - u.hitAt > 6 && land.owner[t.idx(t.cellOf(u.x), t.cellOf(u.y))] === u.team) u.hp = Math.min(u.def.hp, u.hp + u.def.hp * 0.02);
    const M = MINI.s, lm = this.landMini;
    if (lm.width !== M) { lm.width = M; lm.height = M; }
    const lctx = lm.getContext('2d')!, img = lctx.createImageData(M, M), d = img.data, own = new Int8Array(M * M).fill(-1);
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const [gx, gy] = fromMini(x + 0.5, y + 0.5, M), cx = t.cellOf(gx), cy = t.cellOf(gy);
      if (t.inside(cx, cy)) own[y * M + x] = land.owner[t.idx(cx, cy)];
    }
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const o = own[y * M + x]; if (o < 0) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => own[Math.min(M - 1, Math.max(0, y + dy)) * M + Math.min(M - 1, Math.max(0, x + dx))] !== o);
      const c = parseInt(DOT[o].slice(1), 16), k = (y * M + x) * 4;
      d[k] = c >> 16; d[k + 1] = (c >> 8) & 255; d[k + 2] = c & 255; d[k + 3] = edge ? 230 : 70;
    }
    lctx.putImageData(img, 0, 0);
  }
  // Each side's border drawn on the ground, Civ-style: a bold line in its colour with a soft glow
  // fading inward, so you can tell at a glance whose side is whose. Rivals' borders only show where
  // you've explored.
  // Borders, drawn pixel by pixel with a soft glow inside, are cached in screen tiles: a tile is drawn
  // again only when the borders change (about once a second) or new ground is seen, not every frame.
  borderVer = 0; borderHash = 0; borderSeen = -1; borderTiles = new Map<number, { ver: number; c: HTMLCanvasElement | null }>();
  drawBorders(vx: number, vy: number) {
    const ctx = this.ctx, TS = 512, c0 = Math.floor(vx / TS), c1 = Math.floor((vx + this.FW) / TS), r0 = Math.floor((vy - 24) / TS), r1 = Math.floor((vy + this.FH + 24) / TS);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const key = (r + 64) * 1024 + c + 64; let e = this.borderTiles.get(key);
      if (!e || e.ver !== this.borderVer) { e = { ver: this.borderVer, c: this.borderTile(c * TS, r * TS, TS, e?.c ?? null) }; this.borderTiles.set(key, e); }
      if (e.c) ctx.drawImage(e.c, Math.round(c * TS - vx), Math.round(r * TS - vy));
    }
    for (const w of this.gained) { // freshly claimed ground: a soft wash of your colour that fades, and a '+$/S' that rises
      const f = 1 - w.t / GLOW_T, H = CELL / 2;
      ctx.fillStyle = `rgba(110,170,240,${(0.32 * f).toFixed(3)})`; ctx.beginPath();
      for (const i of w.cells) {
        const gx = ((i % N) + 0.5) * CELL, gy = (((i / N) | 0) + 0.5) * CELL, lift = this.terrain.lift(gx, gy);
        const p = [[gx - H, gy - H], [gx + H, gy - H], [gx + H, gy + H], [gx - H, gy + H]].map(([a, b]) => { const [x, y] = toScreen(a, b); return [Math.round(x - vx), Math.round(y - lift - vy)]; });
        if (p[0][0] < -30 || p[0][0] > this.FW + 30 || p[0][1] < -30 || p[0][1] > this.FH + 30) continue;
        ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.lineTo(p[3][0], p[3][1]); ctx.closePath();
      }
      ctx.fill();
      const [tx, ty] = this.scr({ x: w.x, y: w.y }), label = `+$${w.pay < 10 ? w.pay.toFixed(1) : Math.round(w.pay)}/S LAND`;
      if (w.t < GLOW_T * 0.8) { ctx.globalAlpha = Math.min(1, f * 1.6); text(ctx, label, Math.round(tx - vx - textWidth(label) / 2), Math.round(ty - vy - 18 - w.t * 8), C.gold, 1, C.ink); ctx.globalAlpha = 1; }
    }
    if (this.borderTiles.size > 40) for (const k of this.borderTiles.keys()) { const r = Math.floor(k / 1024) - 64, c = (k % 1024) - 64; if (r < r0 - 1 || r > r1 + 1 || c < c0 - 1 || c > c1 + 1) this.borderTiles.delete(k); } // (only the tiles near the view are kept)
  }
  // one tile of the borders (or null if none cross it)
  borderTile(ox: number, oy: number, TS: number, reuse: HTMLCanvasElement | null): HTMLCanvasElement | null {
    const t = this.terrain, GLOW = [0.5, 0.3, 0.18, 0.1, 0.05];
    let ctx: CanvasRenderingContext2D | null = null, cv = reuse;
    for (const [team, seg] of this.territory.lines) {
      const mine = this.friendly(team), col = DOT[team], c = parseInt(col.slice(1), 16), rgb = `${c >> 16},${(c >> 8) & 255},${c & 255}`;
      const glow = GLOW.map((a) => `rgba(${rgb},${a})`);
      for (let k = 0; k < seg.length; k += 6) {
        const ax = seg[k], ay = seg[k + 1], bx = seg[k + 2], by = seg[k + 3];
        const [sa, ta] = toScreen(ax, ay), [sb, tb] = toScreen(bx, by);
        const x0 = sa - ox, y0 = ta - t.lift(ax, ay) - oy, x1 = sb - ox, y1 = tb - t.lift(bx, by) - oy;
        if ((x0 < -8 && x1 < -8) || (x0 > TS + 8 && x1 > TS + 8) || (y0 < -8 && y1 < -8) || (y0 > TS + 8 && y1 > TS + 8)) continue;
        if (!mine && !this.vis[t.idx(t.cellOf((ax + bx) / 2), t.cellOf((ay + by) / 2))]) continue;
        if (!ctx) { if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = TS; } ctx = cv.getContext('2d')!; ctx.clearRect(0, 0, TS, TS); }
        const nx = YC * seg[k + 4] - YS * seg[k + 5], ny = (YS * seg[k + 4] + YC * seg[k + 5]) * SQ; // inward, on screen
        const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let s = 0; s <= n; s++) {
          const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n;
          for (let g = GLOW.length; g >= 1; g--) { ctx.fillStyle = glow[g - 1]; ctx.fillRect(Math.round(x + nx * (g + 1)), Math.round(y + ny * (g + 1)), 1, 1); }
          ctx.fillStyle = 'rgba(10,12,14,0.6)'; ctx.fillRect(Math.round(x - nx), Math.round(y - ny) + 1, 1, 1);
          ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); ctx.fillRect(Math.round(x + nx), Math.round(y + ny), 1, 1);
        }
      }
    }
    return ctx ? cv : null;
  }
  drawGlints(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain;
    const c0 = Math.max(0, Math.floor(vx / CH)), c1 = Math.min(t.cw - 1, Math.floor((vx + this.FW) / CH));
    const r0 = Math.max(0, Math.floor((vy + 24) / CH)), r1 = Math.min(t.chh - 1, Math.floor((vy + this.FH + 24) / CH));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const g = t.glints[r * t.cw + c];
      if (!g) continue;
      for (let i = 0; i < g.length; i += 2) {
        const x = g[i] - vx, y = g[i + 1] - vy;
        if (x < 0 || y < 0 || x >= this.FW || y >= this.FH) continue;
        const s = Math.sin(this.time * 2.3 + ((g[i] * 7 + g[i + 1] * 13) % 97));
        if (s < 0.9) continue;
        ctx.fillStyle = s > 0.985 ? '#f4f8f0' : '#8eb0b4';
        ctx.fillRect(x, y, s > 0.97 ? 2 : 1, 1);
      }
    }
  }

  // Run drawing code against the interface layer: its own context, size and mouse position.
  withHud(fn: () => void) {
    const M = this.mouse, keep = [this.ctx, this.FW, this.FH, M.x, M.y] as const;
    this.ctx = this.hctx; this.FW = this.HW; this.FH = this.HH; M.x = M.hx; M.y = M.hy;
    try { fn(); } finally { [this.ctx, this.FW, this.FH, M.x, M.y] = keep as unknown as [CanvasRenderingContext2D, number, number, number, number]; }
  }

  drawLoading() {
    const ctx = this.ctx, w = 160, x = Math.round((this.FW - w) / 2), y = Math.round(this.FH / 2);
    this.logo(Math.round(this.FH / 2) - 50);
    inset(ctx, x, y, w, 7);
    ctx.fillStyle = C.gold; ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * (this.loadStep / this.loadTotal)), 5);
    const msg = this.resuming ? 'RETURNING TO THE BATTLE...' : 'SURVEYING THE BATTLEFIELD...';
    text(ctx, msg, Math.round((this.FW - textWidth(msg)) / 2), y + 12, C.muted);
  }

  // The logo: chunky gold letters with a bevel (bright top edge, dark base), an ink drop shadow,
  // and a red banner underneath.
  logo(y: number) {
    const ctx = this.ctx, s = 4, word = 'CONQUER', w = textWidth(word, s), x = Math.round((this.FW - w) / 2);
    text(ctx, word, x + 3, y + 3, C.ink, s);
    text(ctx, word, x, y + 1, '#6a4c10', s);
    text(ctx, word, x, y, C.goldD, s);
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, w + 4, 3 * s); ctx.clip();
    text(ctx, word, x, y - 1, '#ffe27a', s);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y + 3 * s - 1, w + 4, 5 * s); ctx.clip();
    text(ctx, word, x, y - 1, C.gold, s);
    ctx.restore();
    const by = y + 7 * s + 4;
    ctx.fillStyle = C.ink; ctx.fillRect(x - 5, by + 1, w + 12, 7);
    ctx.fillStyle = C.redD; ctx.fillRect(x - 6, by, w + 12, 6);
    ctx.fillStyle = C.red; ctx.fillRect(x - 6, by, w + 12, 4);
    ctx.fillStyle = '#e04a34'; ctx.fillRect(x - 6, by, w + 12, 1);
    for (let i = x; i < x + w; i += 10) { ctx.fillStyle = C.gold; ctx.fillRect(i, by + 1, 2, 2); }
  }

  // Propaganda sunburst: alternating red rays fanning out behind the logo, dithered toward the
  // edges so they fade into the battlefield. Drawn once into a cached image (only redrawn on resize).
  private burst: HTMLCanvasElement | null = null;
  sunburst(cx: number, cy: number, r: number) {
    const key = r * 10000 + cx;
    if (!this.burst || (this.burst as any).key !== key) {
      const c = document.createElement('canvas'), w = Math.ceil(r * 3.2), h = r * 2;
      c.width = w; c.height = h; (c as any).key = key;
      const bctx = c.getContext('2d')!, img = bctx.createImageData(w, h), d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x - w / 2) / 1.6, dy = y - r, dist = Math.hypot(dx, dy);
        if (dist > r || dist < 6) continue;
        if (!(Math.floor((Math.atan2(dy, dx) / (Math.PI * 2)) * 24 + 24) % 2)) continue;
        const fade = dist / r;
        if ((fade > 0.55 && ((x + y) & 1)) || (fade > 0.8 && ((x | y) & 1))) continue;
        const k = (y * w + x) * 4;
        d[k] = 184; d[k + 1] = 40; d[k + 2] = 28; d[k + 3] = fade < 0.35 ? 64 : 38;
      }
      bctx.putImageData(img, 0, 0);
      this.burst = c;
    }
    this.ctx.drawImage(this.burst, Math.round(cx - this.burst.width / 2), cy - r);
  }

  drawTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,8,10,0.5)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const y = Math.round(this.FH * 0.24);
    this.sunburst(Math.round(this.FW / 2), y + 14, Math.round(Math.min(this.FW, this.FH) * 0.26));
    this.logo(y);
    this.drawMenu(Math.round((this.FW - 140) / 2), y + 66, 140);
    if (this.loadNote) text(ctx, this.loadNote, Math.round((this.FW - textWidth(this.loadNote)) / 2), y + 56, C.bad, 1, C.ink);
    const foot = 'DRAG TO SELECT   RIGHT-CLICK TO MOVE   SWIPE TO SCROLL';
    text(ctx, foot, Math.round((this.FW - textWidth(foot)) / 2), this.FH - 16, C.muted, 1, C.ink);
  }

  // A riveted panel of menu items; remembers where each item is for clicks.
  drawMenu(px: number, py: number, pw: number) {
    const ctx = this.ctx, items = this.menuItems, ph = 16 + items.length * 16;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    this.menuRects = [];
    items.forEach((m, i) => {
      const label = m.label, ty = py + 9 + i * 16, hot = i === this.menuHot;
      this.menuRects.push({ id: m.id, x: px, y: ty - 3, w: pw, h: 14 });
      if (hot) {
        ctx.fillStyle = C.red; ctx.fillRect(px + 6, ty - 3, pw - 12, 13);
        ctx.fillStyle = '#e04a34'; ctx.fillRect(px + 6, ty - 3, pw - 12, 1);
        ctx.fillStyle = C.redD; ctx.fillRect(px + 6, ty + 9, pw - 12, 1);
        const bob = Math.floor(this.time * 4) % 2; // a small pointer that nudges in and out
        text(ctx, '>', px + 10 + bob, ty, C.gold, 1, C.ink); text(ctx, '<', px + pw - 15 - bob, ty, C.gold, 1, C.ink);
      }
      text(ctx, label, Math.round(px + (pw - textWidth(label)) / 2), ty, hot ? C.gold : C.cream, 1, C.ink);
    });
  }
  menuHit() {
    const M = this.mouse;
    return this.menuRects.find((r) => M.hx > r.x && M.hx < r.x + r.w && M.hy > r.y && M.hy < r.y + r.h)?.id ?? null;
  }

  drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,8,10,0.55)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const t = 'PAUSED', s = 3, w = textWidth(t, s), y = Math.max(8, Math.round(this.FH * 0.5) - 150);
    text(ctx, t, Math.round((this.FW - w) / 2), y, C.gold, s, C.ink);
    this.drawMenu(Math.round((this.FW - 120) / 2), y + 28, 120);
    // the controls, on a card under the menu
    const rows: [string, string][] = [
      ['CLICK / DRAG', 'SELECT'], ['DOUBLE-CLICK', 'SAME TYPE ON SCREEN'], ['T', 'ALL OF THE SELECTED TYPES'],
      ['RIGHT-CLICK', 'MOVE, ATTACK, BUILD, REPAIR'], ['SHIFT + RIGHT', 'ADD A WAYPOINT'], ['A', 'ATTACK-MOVE'],
      ['S / X', 'STOP / SPREAD OUT'], ['B', 'RETREAT: RUN HOME TO HEAL'], ['C', 'SCOUT: A SCOUT EXPLORES ON ITS OWN'], ['G', 'GUARD: PATROL A LOOP ROUND THE BASE'], ['CTRL + 1-9', 'MAKE A GROUP (1-9 PICKS IT)'], ['SWIPE / ARROWS', 'SCROLL THE MAP'],
      ['F / SHIFT + F', 'WHOLE ARMY / IDLE ARMY'], ['. (FULL STOP)', 'NEXT IDLE BUILDER'], ['R', 'REPEAT A FACTORY\'S QUEUE'], ['DELETE TWICE', 'SELL A BUILDING (HALF BACK)'],
      ['SPACE / H', 'LATEST ALERT / YOUR BASE'], ['TAB', 'BASE / ARMY BUILD LIST'], ['- / +', 'ZOOM OUT / IN'],
    ];
    const pw = 282, ph = rows.length * 10 + 12, px = Math.round((this.FW - pw) / 2), py = y + 108;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    rows.forEach(([k, v], i) => { text(ctx, k, px + 10, py + 7 + i * 10, C.gold); text(ctx, v, px + 104, py + 7 + i * 10, C.cream); });
  }

  // Victory or defeat: a poster-style panel with the battle's numbers.
  drawEnd() {
    const ctx = this.ctx, won = this.state === 'won';
    ctx.fillStyle = won ? 'rgba(8,10,8,0.5)' : 'rgba(14,6,6,0.6)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const y = Math.round(this.FH * 0.2), title = won ? 'VICTORY' : 'DEFEAT', s = 4, w = textWidth(title, s), x = Math.round((this.FW - w) / 2);
    if (won) this.sunburst(Math.round(this.FW / 2), y + 14, Math.round(Math.min(this.FW, this.FH) * 0.24));
    text(ctx, title, x + 3, y + 3, C.ink, s); text(ctx, title, x, y, won ? C.gold : C.bad, s);
    const quip = won ? 'THE MINISTRY THANKS YOU FOR YOUR PATIENCE.' : 'YOUR BASE HAS BEEN REZONED.';
    text(ctx, quip, Math.round((this.FW - textWidth(quip)) / 2), y + 38, C.cream, 1, C.ink);
    const st = this.stats, m = Math.floor(st.time / 60), sec = String(Math.floor(st.time % 60)).padStart(2, '0');
    const rows: [string, string][] = [['BATTLE TIME', `${m}:${sec}`], ['UNITS BUILT', String(st.built[0])], ['UNITS LOST', String(st.lost[0])], ['ENEMY UNITS DESTROYED', String(st.lost[1])], ['BUILDINGS RAZED', String(st.razed[0])], ...this.ais.filter((a) => this.hostile(0, a.me)).map((a) => [`${['', 'RED', '', 'GREEN', 'GOLD'][a.me]} STRATEGY`, a.planName.toUpperCase()] as [string, string])];
    const pw = 190, px = Math.round((this.FW - pw) / 2), py = y + 54, ph = rows.length * 11 + 10;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    rows.forEach(([k, v], i) => { text(ctx, k, px + 10, py + 7 + i * 11, C.muted); text(ctx, v, px + pw - 10 - textWidth(v), py + 7 + i * 11, C.gold); });
    this.drawMenu(Math.round((this.FW - 120) / 2), py + ph + 8, 120);
  }

  // ------------------------------------------------------------------ the side panel
  // Drawn on its own layer at a fixed pixel size (see withHud), so it never changes size when
  // you zoom the battlefield. Credits and power, the radar, what's selected, the build grid, orders.
  drawSidebar() {
    const ctx = this.ctx, W = this.FW, H = this.FH, x0 = W - SB, M = this.mouse;
    panel(ctx, x0, 0, SB, H);
    ctx.fillStyle = C.redD; ctx.fillRect(x0, 0, 3, H); ctx.fillStyle = C.red; ctx.fillRect(x0, 0, 2, H);
    for (let y = 8; y < H; y += 24) { ctx.fillStyle = C.gold; ctx.fillRect(x0, y, 2, 2); }
    this.buttons = []; this.hudTips = [];
    // header: name and a pause button
    ctx.fillStyle = C.red; ctx.fillRect(x0 + 7, 4, 6, 6); ctx.fillStyle = C.gold; ctx.fillRect(x0 + 9, 6, 2, 2);
    text(ctx, 'CONQUER', x0 + 16, 4, C.gold, 1, C.ink);
    this.buttons.push({ id: 'pause', x: x0 + SB - 20, y: 2, w: 16, h: 11, label: 'II' });
    // credits and power
    const cr = '$ ' + Math.floor(this.prod.credits).toLocaleString('en-US');
    inset(ctx, x0 + 6, 16, SB - 12, 12, C.screen);
    text(ctx, cr, Math.round(x0 + SB / 2 - textWidth(cr) / 2), 19, C.gold);
    const low = this.power.used > this.power.made;
    this.hudTips.push({ x: x0 + 6, y: 16, w: SB - 12, h: 12, title: 'MONEY', body: 'SCRAP, YOUR LAND AND CAPTURED SITES EARN IT. BUILDINGS AND TROOPS SPEND IT AS THEY GO UP.' },
      { x: x0 + 6, y: 30, w: SB - 12, h: 11, title: 'POWER', body: `USING ${Math.round(this.power.used)} OF ${Math.round(this.power.made)}. THE BAR FILLS AS YOUR BUILDINGS USE MORE. NEARLY FULL: BUILD A GENERATOR. RED: OUT OF POWER, EVERYTHING SLOWS.` });
    text(ctx, 'POWER', x0 + 6, 32, low ? C.bad : C.goldD);
    inset(ctx, x0 + 40, 31, SB - 46, 9, C.ink);
    { // one bar: how much of the power you make is in use; it fills as you build, and turns red (flashing) only once you're out
      const use = this.power.made > 0 ? this.power.used / this.power.made : this.power.used > 0 ? 2 : 0;
      ctx.fillStyle = use > 1 ? (Math.floor(this.time * 3) % 2 ? '#ff8060' : C.bad) : C.ok;
      ctx.fillRect(x0 + 41, 32, Math.round(Math.min(1, use) * (SB - 48)), 7);
    }
    // radar
    const mm = MINI.s, mx = x0 + Math.round((SB - mm - 2) / 2), my = 45;
    this.mm = { x: mx + 1, y: my + 1, s: mm };
    inset(ctx, mx, my, mm + 2, mm + 2, C.ink);
    const radar = this.owns('fieldCommand');
    if (!radar) { // no Field Command, no radar: just static
      for (let i = 0; i < 500; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#141614' : '#2a2e2a'; ctx.fillRect(mx + 1 + ((Math.random() * mm) | 0), my + 1 + ((Math.random() * mm) | 0), 1, 1); }
      for (const [i, l] of ['NO RADAR', 'BUILD A', 'FIELD COMMAND'].entries()) text(ctx, l, mx + 1 + Math.round((mm - textWidth(l)) / 2), my + Math.round(mm / 2) - 14 + i * 11, i ? C.goldD : C.muted, 1, C.ink);
      glass(ctx, mx, my, mm + 2, mm + 2);
    }
    if (radar) {
    ctx.drawImage(this.terrain.minimap, mx + 1, my + 1);
    ctx.drawImage(this.landMini, mx + 1, my + 1);
    ctx.drawImage(this.fogMini, mx + 1, my + 1);
    // ground -> the minimap: flat gives ground pixels across the playable rectangle (unsquashed), sc turns them into minimap pixels
    const sc = mm / VIEW.w, flat = (x: number, y: number): [number, number] => { const [sx, sy] = toScreen(x, y); return [sx - VIEW.x0, (sy - VIEW.y0) / SQ]; }, dot = (gx: number, gy: number, c: string, s: number, off = 0) => { const [a, b] = flat(gx, gy); ctx.fillStyle = c; ctx.fillRect(mx + 1 + Math.floor(a * sc) + off, my + 1 + Math.floor(b * sc) + off, s, s); };
    for (const o of this.terrain.oil) if (o.found && !o.tapped) dot((o.cx + 0.5) * CELL, (o.cy + 0.5) * CELL, C.gold, 2);
    for (const c of this.crates) if (this.sees(c.x, c.y)) dot(c.x, c.y, '#ffe080', 2);
    for (const b of this.blds) if (b.team !== 2 && (this.friendly(b.team) || b.seen)) dot((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, DOT[b.team], 3);
    for (const u of this.units) if (this.spot(u) && !u.selected) { dot(u.x, u.y, C.ink, 4, -1); dot(u.x, u.y, u.team === 0 ? '#9ad0ff' : DOT[u.team], 2); } // each on a dark backing, so it reads on any ground
    for (const u of this.units) if (u.selected) { dot(u.x, u.y, C.ink, 5, -1); dot(u.x, u.y, '#ffffff', 3); } // what you've selected, bright and on top: always findable
    ctx.save(); ctx.beginPath(); ctx.rect(mx + 1, my + 1, mm, mm); ctx.clip();
    if (this.goalAt && this.hints) { const [a, b] = flat(this.goalAt[0], this.goalAt[1]), px = mx + 1 + Math.floor(a * sc), py = my + 1 + Math.floor(b * sc), r = 2 + ((this.time * 5) % 4); ctx.fillStyle = C.gold; for (let k = 0; k < 12; k++) ctx.fillRect(Math.round(px + Math.cos(k / 12 * 6.283) * r), Math.round(py + Math.sin(k / 12 * 6.283) * r), 1, 1); ctx.fillRect(px - 1, py - 1, 2, 2); } // the checklist's next place, pulsing gold
    for (const p of this.pings) if (p.dmg >= 120) { // attack markers: pulsing red rings
      const [a, b] = flat(p.x, p.y), px = mx + 1 + Math.floor(a * sc), py = my + 1 + Math.floor(b * sc), r = 3 + ((this.time * 8) % 6);
      ctx.fillStyle = Math.floor(this.time * 4) % 2 ? '#ff3020' : '#ffd040';
      for (let k = 0; k < 16; k++) ctx.fillRect(Math.round(px + Math.cos(k / 16 * 6.283) * r), Math.round(py + Math.sin(k / 16 * 6.283) * r), 1, 1);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    const raid = this.raided.get(0) ?? 0, land = Math.round(Math.max(0, (this.territory.area.get(0) ?? 0) - raid) * LAND_RATE);
    if (land || raid) this.hudTips.push({ x: mx + 2, y: my + mm - 11, w: mm - 4, h: 10, title: 'LAND', body: 'THE GROUND INSIDE YOUR BORDER (THE BLUE LINE) EARNS MONEY EVERY SECOND. YOUR BORDER GROWS AROUND YOUR FIELD COMMANDS AND EVERY BUILDING LINKED TO THEM: BUILD OUTWARD TO STRETCH IT.' });
    if (land || raid) text(ctx, 'LAND +$' + land + '/S' + (raid > 20 ? '  RAIDED' : ''), mx + 4, my + mm - 9, raid > 20 && Math.floor(this.time * 2) % 2 ? C.bad : DOT[0], 1, C.ink);
    { // your view: the screen's corners on the ground, so a slightly turned box on the squared-up map
      const W = this.worldW(), Hh = this.worldH(), cs = [[0, 0], [W, 0], [W, Hh], [0, Hh]].map(([a, b]) => { return [mx + 1 + (this.vx + a - VIEW.x0) * sc, my + 1 + ((this.vy + b - VIEW.y0) / SQ) * sc]; });
      ctx.fillStyle = C.cream;
      for (let k = 0; k < 4; k++) { const [ax, ay] = cs[k], [bx, by] = cs[(k + 1) % 4], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay))); for (let j = 0; j <= n; j++) ctx.fillRect(Math.round(ax + ((bx - ax) * j) / n), Math.round(ay + ((by - ay) * j) / n), 1, 1); }
    }
    for (const r of this.radars) if (this.friendly(r.team)) { // each radar tower's sweep and reach
      const [a, b] = flat((r.cx + r.w / 2) * CELL, (r.cy + r.h / 2) * CELL), px = mx + 1 + a * sc, py = my + 1 + b * sc, R = RADAR_R * CELL * sc;
      ctx.fillStyle = 'rgba(126,224,138,0.12)'; ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.fill(); // what it covers
      ctx.fillStyle = 'rgba(126,224,138,0.6)';
      for (let k = 0; k < 64; k++) if (k % 2) ctx.fillRect(Math.round(px + Math.cos((k / 64) * TAU) * R), Math.round(py + Math.sin((k / 64) * TAU) * R), 1, 1);
      for (let k = 0; k < 8; k++) { // the beam, with a fading trail behind it
        const an = this.time * SWEEP - k * 0.08;
        ctx.fillStyle = `rgba(150,255,160,${1 - k * 0.12})`;
        for (let d = 1; d < R; d += 1) ctx.fillRect(Math.round(px + Math.cos(an) * d), Math.round(py + Math.sin(an) * d), 1, 1);
      }
    }
    for (const [u, b] of this.blips) if (!this.spot(u)) { const f = Math.max(0, 1 - (this.time - b.t) / (TAU / SWEEP)); dot(b.x, b.y, `rgba(8,20,10,${f})`, 4, -1); dot(b.x, b.y, `rgba(126,224,138,${f})`, 2); } // radar contacts
    if (low) {
      for (let i = 0; i < 700; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#1a1c1a' : '#6a706a'; ctx.fillRect(mx + 1 + ((Math.random() * mm) | 0), my + 1 + ((Math.random() * mm) | 0), 1, 1); }
      if (Math.floor(this.time * 2) % 2) text(ctx, 'LOW POWER', mx + 1 + Math.round((mm - textWidth('LOW POWER')) / 2), my + Math.round(mm / 2) - 4, C.bad, 1, C.ink);
    }
    ctx.restore();
    glass(ctx, mx, my, mm + 2, mm + 2);
    }
    // what's selected
    const iy = my + mm + 8, ih = 46;
    inset(ctx, x0 + 6, iy, SB - 12, ih, C.screen);
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + 7, iy + 1, SB - 14, ih - 2); ctx.clip();
    this.drawInfo(x0 + 10, iy + 4, SB - 20);
    ctx.restore();
    glass(ctx, x0 + 6, iy, SB - 12, ih);
    // build grid: a selected factory shows what it makes; otherwise the tabs decide
    const factory = this.selBld && this.prod.queues[this.selBld.type] ? this.selBld.type : null;
    const ty = iy + ih + 5;
    this.tabs = [{ id: 'structure', x: x0 + 6, y: ty, w: (SB - 14) / 2, h: 11 }, { id: 'unit', x: x0 + 8 + (SB - 14) / 2, y: ty, w: (SB - 14) / 2, h: 11 }];
    const tab = factory ? 'unit' : this.buildTab;
    // something newly unlocked glows for a few seconds, and so does its tab if that isn't open
    const nowOk = new Set(BUILDS.filter((d) => this.available(d)).map((d) => d.key));
    if (this.okBefore) for (const k of nowOk) if (!this.okBefore.has(k)) this.unlockT[k] = this.time;
    this.okBefore = nowOk;
    for (const tb of this.tabs) {
      const on = tab === tb.id;
      ctx.fillStyle = C.metalD; ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
      ctx.fillStyle = on ? C.red : C.metal; ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, tb.h - 2);
      if (on) { ctx.fillStyle = '#e04a34'; ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, 1); }
      const label = tb.id === 'structure' ? 'BASE' : factory ? DEF[factory]?.name.toUpperCase().split(' ')[0] ?? 'ARMY' : 'ARMY';
      const idle = tb.id === 'unit' && Object.keys(this.prod.queues).some((k) => k !== 'fieldCommand' && !this.prod.queues[k].length && this.owns(k)); // a factory standing idle
      const fresh = !on && (idle || BUILDS.some((d) => d.kind === tb.id && this.fresh(d))) && Math.floor(this.time * 3) % 2;
      text(ctx, label, Math.round(tb.x + (tb.w - textWidth(label)) / 2), tb.y + 2, on || fresh ? C.gold : C.muted);
    }
    this.slots = []; this.hoverSlot = null;
    const defs = BUILDS.filter((d) => (factory ? d.from === factory : d.kind === tab));
    const live = this.divisions.map((d, k) => (d && d.units.length ? k : -1)).filter((k) => k >= 0), picked = this.selected().filter((u) => u.def.weapon && u.type !== 'builder'), canForm = picked.length > 0 && live.length < 5 && !live.some((k) => this.divisions[k]!.units.length === picked.length && picked.every((u) => this.divisions[k]!.units.includes(u))); // not when the selection already is one
    const divH = (live.length + (canForm ? 1 : 0)) * 16 + (live.length || canForm ? 4 : 0);
    const keepH = tab === 'unit' ? 15 : 0, cols = SB >= 180 ? 4 : 3, cw = Math.floor((SB - 12 - (cols - 1) * 2) / cols), ch = 34, gy0 = ty + 14 + keepH, rows = Math.max(1, Math.floor((H - 46 - divH - gy0) / (ch + 2)));
    if (keepH) this.buttons.push({ id: 'keep', x: x0 + 6, y: ty + 14, w: SB - 12, h: 13, label: this.prod.keep ? 'KEEP BUILDING: ON' : 'KEEP BUILDING: OFF', on: this.prod.keep }); // finished units go back on the queue
    if (keepH) this.hudTips.push({ x: x0 + 6, y: ty + 14, w: SB - 12, h: 13, title: 'KEEP BUILDING', body: 'WHILE ON, EVERY FIGHTING UNIT THAT FINISHES GOES BACK ON ITS FACTORY\'S QUEUE, SO YOUR FACTORIES NEVER STAND IDLE. CLICK A UNIT BELOW TO ADD ONE, RIGHT-CLICK TO TAKE ONE OFF. THE ARMY TAB BLINKS WHEN A FACTORY HAS NOTHING TO DO.' });
    defs.slice(0, rows * cols).forEach((d, i) => {
      const sx = x0 + 6 + (i % cols) * (cw + 2), sy = gy0 + Math.floor(i / cols) * (ch + 2);
      this.slots.push({ def: d, x: sx, y: sy, w: cw, h: ch });
      this.drawSlot(d, sx, sy, cw, ch, M.x > sx && M.x < sx + cw && M.y > sy && M.y < sy + ch);
    });
    // orders along the bottom
    const by = H - 21, bw = Math.floor((SB - 16) / 3);
    const idleB = this.builders(0).filter((u) => !u.buildSite && !u.goal && !u.path.length).length;
    this.buttons.push({ id: 'army', x: x0 + 6, y: by - 18, w: bw, h: 16, label: 'ARMY', key: 'F' }, { id: 'idleArmy', x: x0 + 8 + bw, y: by - 18, w: bw, h: 16, label: 'IDLE', key: '' }, { id: 'idleBuilder', x: x0 + 10 + bw * 2, y: by - 18, w: bw, h: 16, label: idleB ? `BLD ${idleB}` : 'BLD', key: '.' });
    const acts = this.actions(), ab = Math.floor((SB - 12 - (acts.length - 1) * 2) / acts.length); // as many across as there are orders
    acts.forEach((a, i) => { const bw = ab; this.buttons.push({ ...a, x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16 }); if (a.id === 'guard') this.hudTips.push({ x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16, title: 'GUARD (G)', body: 'THE SELECTED UNITS PATROL A LOOP ROUND THE NEAREST FIELD COMMAND, FIGHTING ANYTHING THEY MEET, AND GO TO ANY FIGHT AT THE BASE. SELECT ONE TO SEE THE LOOP. ANY NEW ORDER TAKES THEM OFF IT.' }); if (a.id === 'scout') this.hudTips.push({ x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16, title: 'SCOUT (C)', body: 'THE SCOUT GOES EXPLORING ON ITS OWN: GROUND YOU HAVEN\'T SEEN, TOWARD THE ENEMY. IT KEEPS OUT OF FIGHTS AND COMES HOME WHEN BADLY HURT. ANY NEW ORDER STOPS IT.' }); if (a.id === 'fallBack') this.hudTips.push({ x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16, title: 'RETREAT (B)', body: 'THE SELECTED UNITS STOP FIGHTING AND RUN FOR THE NEAREST FIELD COMMAND OR REPAIR YARD, FASTER AND HARDER TO HIT, TO HEAL ON HOME GROUND. SURVIVORS KEEP THEIR RANKS.' }); });
    // divisions: a card each (click picks it, the + sends new troops to it), and FORM DIVISION while units are selected
    let dy = by - 22 - divH + 4;
    const bars: [number, number, number][] = [];
    for (const k of live) {
      const d = this.divisions[k]!, all = d.units.every((u) => u.selected), hp = d.units.reduce((s, u) => s + u.hp, 0) / d.units.reduce((s, u) => s + u.def.hp, 0);
      this.buttons.push({ id: 'div' + k, x: x0 + 6, y: dy, w: SB - 32, h: 14, label: `${this.divName(k)}  ${d.units.length}`, on: all }); // its name says its key (1ST is 1)
      this.buttons.push({ id: 'feed' + k, x: x0 + SB - 24, y: dy, w: 18, h: 14, label: '+', on: d.feed });
      bars.push([dy, hp, k]); dy += 16;
      { const vets = d.units.filter((u) => u.rank).length; if (vets) this.hudTips.push({ x: x0 + 6, y: dy - 16, w: SB - 32, h: 14, title: `${vets} VETERAN${vets > 1 ? 'S' : ''}`, body: 'UNITS THAT HAVE SEEN REAL FIGHTING EARN RANKS (THE GOLD CHEVRONS): EACH RANK HITS 10% HARDER AND TAKES HITS 10% BETTER, AND PATCHES ITSELF UP. GET THEM OUT ALIVE WITH RETREAT.' }); }
    }
    if (canForm) { this.buttons.push({ id: 'formDiv', x: x0 + 6, y: dy, w: SB - 12, h: 14, label: 'FORM DIVISION' }); this.hudTips.push({ x: x0 + 6, y: dy, w: SB - 12, h: 14, title: 'FORM DIVISION', body: 'GIVES THE SELECTED UNITS A NAME AND A CARD HERE, SO ONE CLICK PICKS THEM ALL AGAIN. NOTHING ELSE CHANGES, AND YOU NEVER HAVE TO.' }); }
    for (const b of this.buttons) { const hot = M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h; button(ctx, b, hot, hot && M.down); }
    for (const [y, hp, k] of bars) {
      ctx.fillStyle = C.ink; ctx.fillRect(x0 + 8, y + 12, SB - 36, 1); ctx.fillStyle = hp > 0.6 ? C.ok : hp > 0.3 ? C.warn : C.bad; ctx.fillRect(x0 + 8, y + 12, Math.round((SB - 36) * hp), 1); // strength
      { const vets = this.divisions[k]!.units.filter((u) => u.rank).length; if (vets) { const s = String(vets), tx = x0 + SB - 30 - textWidth(s); text(ctx, s, tx, y + 4, C.gold, 1, C.ink); for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -2], [1, -1], [2, 0]]) { ctx.fillStyle = C.gold; ctx.fillRect(tx - 5 + dx, y + 7 + dy, 1, 1); } } } // its veterans, by its count
      if (this.divisions[k]!.feed) { ctx.fillStyle = C.ok; ctx.fillRect(x0 + SB - 24, y, 18, 1); ctx.fillRect(x0 + SB - 24, y + 13, 18, 1); ctx.fillRect(x0 + SB - 24, y, 1, 14); ctx.fillRect(x0 + SB - 7, y, 1, 14); } // new troops go here
    }
    if (this.hoverSlot) this.drawTooltip(this.hoverSlot.d, x0 - 4, this.hoverSlot.y);
    else { const tip = this.hudTips.find((t) => M.x > t.x && M.x < t.x + t.w && M.y > t.y && M.y < t.y + t.h); if (tip) this.drawNote(tip.title, tip.body, x0 - 4, tip.y); } // what this part of the panel means
  }
  hudTips: { x: number; y: number; w: number; h: number; title: string; body: string }[] = [];
  // A plain card beside the panel: a heading and a few words
  drawNote(title: string, body: string, right: number, y: number) {
    const ctx = this.ctx, w = 170, lines: string[] = []; let line = '';
    for (const word of body.split(' ')) { const t = line ? line + ' ' + word : word; if (textWidth(t) > w - 14) { lines.push(line); line = word; } else line = t; }
    if (line) lines.push(line);
    const h = 18 + lines.length * 9, x = right - w, top = Math.max(2, Math.min(this.FH - h - 2, y));
    panel(ctx, x, top, w, h);
    text(ctx, title, x + 7, top + 5, C.gold, 1, C.ink);
    lines.forEach((l, i) => text(ctx, l, x + 7, top + 16 + i * 9, C.muted));
  }

  // The bottom row of orders follows what's selected, so only orders that apply are on show. Each
  // has a key too, but you never need it.
  actions(): { id: string; label: string; key?: string; on?: boolean }[] {
    const b = this.selBld;
    if (this.selected().length) return [{ id: 'stop', label: 'STOP', key: 'S' }, this.selected().every((u) => u.type === 'scout') ? { id: 'scout', label: 'SCOUT', key: 'C', on: this.selected().every((u) => u.scouting) } : { id: 'amove', label: 'ATTACK', key: 'A' }, ...(SB >= 180 ? [{ id: 'guard', label: 'GUARD', key: 'G', on: this.selected().every((u) => this.patrols.some((p) => p.units.includes(u))) }] : []), { id: 'fallBack', label: 'RETREAT', key: 'B' }]; // (SPLIT stays on X; a scout's ATTACK stays on A)
    if (b && b.team === 0) {
      if (b.rise < 1) return [{ id: 'cancel', label: 'CANCEL' }];
      const out: { id: string; label: string; key?: string; on?: boolean }[] = [];
      if (CAPTURE[b.type]?.garrison && b.garrison > 0) out.push({ id: 'empty', label: 'EMPTY', key: 'E' });
      if (DEF[b.type]) out.push({ id: 'sell', label: this.sellArm === b && this.time - this.sellT < 2.5 ? 'SURE?' : 'SELL' });
      return out;
    }
    return [{ id: 'home', label: 'BASE', key: 'H' }, ...(this.alertAt ? [{ id: 'alert', label: 'ALERT' }] : [])];
  }

  // Zoomed all the way out, units become crisp symbols drawn at interface size (as in big strategy
  // games): dots for infantry, diamonds for vehicles, triangles for guns, arrows for aircraft,
  // squares for workers; buildings get an outline in their side's colour.
  drawIcons(vx: number, vy: number) {
    const ctx = this.ctx, f = this.k / this.kH, cols = DOT;
    const at = (wx: number, wy: number): [number, number] => [Math.round((wx - vx) * f), Math.round((wy - vy) * f)];
    for (const b of this.blds) {
      if (b.team === 2 || b.max <= 0 || (!this.friendly(b.team) && !b.seen)) continue;
      const [sx, sy] = at(...this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }));
      const r = Math.max(2, Math.round(Math.max(b.w, b.h) * CELL * f * 0.42));
      if (sx < -r || sy < -r || sx > this.FW + r || sy > this.FH + r) continue;
      ctx.fillStyle = cols[b.team]; ctx.fillRect(sx - r, sy - r, r * 2, 1); ctx.fillRect(sx - r, sy + r, r * 2 + 1, 1); ctx.fillRect(sx - r, sy - r, 1, r * 2); ctx.fillRect(sx + r, sy - r, 1, r * 2);
      if (DEFENCE[b.type]) ctx.fillRect(sx - 1, sy - 1, 3, 3);
    }
    const SHAPE: Record<string, string> = { rifle: 'dot', rocket: 'dot', grenadier: 'dot', scout: 'smallDiamond', tank: 'diamond', flak: 'diamond', juggernaut: 'bigDiamond', colossus: 'huge', bomber: 'arrow', artillery: 'triangle', harvester: 'square', builder: 'square', gunship: 'arrow' };
    for (const u of this.units) {
      if (u.team === 2 || !this.spot(u)) continue;
      const [sx, sy] = at(...this.scr(u));
      if (sx < -6 || sy < -6 || sx > this.FW + 6 || sy > this.FH + 6) continue;
      const c = u.selected ? '#ffffff' : cols[u.team], shape = SHAPE[u.type] ?? 'dot';
      const fill = (pts: number[][]) => { ctx.fillStyle = C.ink; for (const [x, y, w, h] of pts) ctx.fillRect(sx + x - 1, sy + y - 1, w + 2, h + 2); ctx.fillStyle = c; for (const [x, y, w, h] of pts) ctx.fillRect(sx + x, sy + y, w, h); };
      if (shape === 'dot') fill([[-1, -1, 2, 2]]);
      else if (shape === 'square') fill([[-2, -2, 4, 4]]);
      else if (shape === 'smallDiamond') fill([[-1, -2, 2, 4], [-2, -1, 4, 2]]);
      else if (shape === 'diamond') fill([[-1, -3, 2, 6], [-2, -2, 4, 4], [-3, -1, 6, 2]]);
      else if (shape === 'bigDiamond') fill([[-1, -4, 2, 8], [-2, -3, 4, 6], [-3, -2, 6, 4], [-4, -1, 8, 2]]);
      else if (shape === 'huge') fill([[-2, -6, 4, 12], [-4, -4, 8, 8], [-6, -2, 12, 4]]);
      else if (shape === 'triangle') fill([[-1, -3, 2, 2], [-2, -1, 4, 2], [-3, 1, 6, 2]]);
      else if (shape === 'arrow') fill([[-1, -3, 2, 2], [-3, -1, 6, 2], [-3, 1, 2, 2], [1, 1, 2, 2]]);
      if (u.type === 'rocket' || u.type === 'flak') { ctx.fillStyle = C.ink; ctx.fillRect(sx, sy, 1, 1); } // anti-armour / anti-air: a dark pip
      if (u.type === 'harvester' || u.type === 'builder') { ctx.fillStyle = C.gold; ctx.fillRect(sx - 1, sy - 1, 2, 2); }
    }
  }

  // Red arrows at the screen edge pointing at attacks out of view; a red ring round the ones in view.
  drawPings(vx: number, vy: number) {
    if (this.state !== 'play') return;
    const ctx = this.ctx, f = this.k / this.kH, W = this.FW - SB, H = this.FH, cx = W / 2, cy = H / 2, on = Math.floor(this.time * 4) % 2;
    for (const p of this.pings) {
      if (p.dmg < 120) continue;
      const [sx, sy] = this.scr(p), x = (sx - vx) * f, y = (sy - vy) * f;
      ctx.fillStyle = on ? '#ff3020' : '#ffd040';
      if (x > 8 && x < W - 8 && y > 8 && y < H - 8) { // in view: a shrinking ring
        const r = 14 - ((this.time * 10) % 8);
        for (let k = 0; k < 24; k++) ctx.fillRect(Math.round(x + Math.cos(k / 24 * 6.283) * r), Math.round(y + Math.sin(k / 24 * 6.283) * r * 0.75), 1, 1);
        continue;
      }
      const a = Math.atan2(y - cy, x - cx), t = Math.min((W / 2 - 14) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 14) / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * t, ay = cy + Math.sin(a) * t;
      for (let i = 0; i < 13; i++) for (let j = -i; j <= i; j++) { // a chunky arrowhead pointing outward
        const bx = ax + Math.cos(a) * (13 - i) * 1.1 - Math.sin(a) * j * 0.75, by = ay + Math.sin(a) * (13 - i) * 1.1 + Math.cos(a) * j * 0.75;
        ctx.fillStyle = Math.abs(j) === i ? C.ink : on ? '#ff3020' : '#ffd040'; ctx.fillRect(Math.round(bx), Math.round(by), 1, 1);
      }
    }
  }

  // A word of explanation the first time something new matters (once a game each, and only with hints on).
  told = new Set<string>();
  justInTime() {
    if (!this.hints) return;
    const busy = Object.values(this.prod.queues).some((q) => q.length) || this.blds.some((b) => b.team === 0 && b.rise < 1 && b.dying < 0);
    this.idleCash = this.prod.credits >= 2500 && !busy && this.owns('barracks') ? this.idleCash + 1 : 0; // seconds money has sat unspent with nothing being made (once there's somewhere to spend it: before that, the steps say what to build)
    const tell = (k: string, line: string) => { if (this.told.has(k)) return false; this.told.add(k); this.bark = { who: 'Tip', line, t: 6 }; return true; };
    if ((this.territory.area.get(0) ?? 0) > 0 && this.owns('fieldCommand') && tell('border', 'The blue line is your border. Land inside it earns money. Build outward and it follows: buildings link to any of yours a few squares away.')) return;
    if (this.power.made > 0 && this.power.used >= this.power.made * 0.8 && tell('power', 'Power is getting tight. Build another generator before everything slows.')) return;
    if (this.idleCash > 15 && tell('cash', 'Money does nothing in the bank. Spend it on troops or buildings.')) return;
  }

  // The starter checklist: the next few things to do, ticked off as you go.
  goals: [string, () => boolean, (() => [number, number] | null)?][] = [ // (with where it is, for the ones that are somewhere: the list points the way)
    ['BUILD A FIELD COMMAND (YOUR HEART)', () => this.owns('fieldCommand')],
    ['BUILD A GENERATOR', () => this.owns('generator')],
    ['BUILD A SCRAPYARD (MONEY)', () => this.owns('scrapyard')],
    ['BUILD A BARRACKS, TRAIN SOLDIERS', () => this.owns('barracks') && this.units.some((u) => u.team === 0 && !u.def.vehicle)],
    ['BUILD A VEHICLE DEPOT', () => this.owns('depot')],
    ['CAPTURE A SITE WITH INFANTRY', () => this.blds.some((b) => b.team === 0 && !!CAPTURE[b.type]), () => { // the nearest one still free
      const [hx, hy] = this.terrain.bases[0]; let best: Bld | null = null, bd = 1e9;
      for (const b of this.blds) if (b.team === 2 && CAPTURE[b.type] && b.dying < 0 && b.type !== 'uplink') { const d = Math.hypot(b.cx - hx, b.cy - hy); if (d < bd) { bd = d; best = b; } }
      return best ? [(best.cx + best.w / 2) * CELL, (best.cy + best.h / 2) * CELL] : null;
    }],
    ['TAKE THE ORBITAL UPLINK', () => this.blds.some((b) => b.team === 0 && b.type === 'uplink' && Math.abs(b.cx - N / 2) < 3 && Math.abs(b.cy - N / 2) < 3), () => [(N / 2) * CELL, (N / 2) * CELL]],
  ];
  goalDone: boolean[] = [];
  drawGoals() {
    this.goals.forEach(([, check], i) => { if (!this.goalDone[i] && check()) { this.goalDone[i] = true; audio.click(); } });
    const open = this.goals.map((g, i) => [g[0], i] as [string, number]).filter(([, i]) => !this.goalDone[i]).slice(0, 3);
    // money piling up with nothing being made: say so, first
    if (this.idleCash > 15) open.unshift(['MONEY PILING UP: TRAIN AN ARMY', -1]);
    if (!open.length) return;
    const ctx = this.ctx, w = Math.max(...open.map(([l]) => textWidth(l))) + 26, h = 14 + open.length * 10;
    panel(ctx, 6, 6, w, h);
    text(ctx, 'NEXT STEPS', 12, 10, C.gold, 1, C.ink);
    open.forEach(([label], k) => { ctx.fillStyle = C.goldD; ctx.fillRect(12, 22 + k * 10, 3, 3); text(ctx, label, 19, 20 + k * 10, C.cream); });
    // the first step that's somewhere gets pointed at: a gold arrow at the edge of the view, or a bouncing chevron over it
    const first = open.find(([, i]) => i >= 0 && this.goals[i][2]?.()), at = first ? this.goals[first[1]][2]!() : null;
    this.goalAt = at;
    if (!at || !first) return;
    const f = this.k / this.kH, W = this.FW - SB, H = this.FH, [sx, sy] = toScreen(at[0], at[1]), x = (sx - Math.round(this.vx)) * f, y = (sy - Math.round(this.vy)) * f, glow = Math.floor(this.time * 3) % 2 ? C.gold : C.goldD;
    const word = first[0].includes('UPLINK') ? 'UPLINK' : 'SITE';
    if (x > 20 && x < W - 20 && y > 30 && y < H - 20) { // in view: a chevron bobbing over it
      const by = Math.round(y - 26 - Math.abs(Math.sin(this.time * 4)) * 5);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = C.ink; ctx.fillRect(Math.round(x) - 6 + i - 1, by + i - 1, 13 - i * 2 + 2, 3); }
      for (let i = 0; i < 6; i++) { ctx.fillStyle = glow; ctx.fillRect(Math.round(x) - 6 + i, by + i, 13 - i * 2, 1); }
      text(ctx, word, Math.round(x - textWidth(word) / 2), by - 9, C.gold, 1, C.ink);
      return;
    }
    const cx = W / 2, cy = H / 2, a = Math.atan2(y - cy, x - cx), t = Math.min((W / 2 - 18) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 18) / Math.abs(Math.sin(a) || 1e-6)), ax = cx + Math.cos(a) * t, ay = cy + Math.sin(a) * t;
    for (let i = 0; i < 11; i++) for (let j = -i; j <= i; j++) { // a gold arrowhead at the edge, pointing the way
      const bx = ax + Math.cos(a) * (11 - i) * 1.1 - Math.sin(a) * j * 0.75, by2 = ay + Math.sin(a) * (11 - i) * 1.1 + Math.cos(a) * j * 0.75;
      ctx.fillStyle = Math.abs(j) === i ? C.ink : glow; ctx.fillRect(Math.round(bx), Math.round(by2), 1, 1);
    }
    const lx = Math.round(Math.max(4, Math.min(W - textWidth(word) - 4, ax - Math.cos(a) * 14 - textWidth(word) / 2))), ly = Math.round(Math.max(4, Math.min(H - 10, ay - Math.sin(a) * 14 - 3)));
    text(ctx, word, lx, ly, C.gold, 1, C.ink);
  }
  idleCash = 0; // how long money has sat unspent with nothing being made
  goalAt: [number, number] | null = null; // where the first step of the checklist is (marked on the radar too)

  // A card beside the build panel: what the item is called, what it costs, what it's for.
  hoverSlot: { d: BuildDef; y: number } | null = null;
  drawTooltip(d: BuildDef, right: number, y: number) {
    const ctx = this.ctx, w = 170, ok = this.available(d);
    const stats = [`$${d.cost}`, d.power ? `POWER ${d.power > 0 ? '+' : ''}${d.power}` : '', d.time ? `${d.time}S` : 'INSTANT'].filter(Boolean).join('   ');
    const wrap = (str: string) => { const out: string[] = []; let line = ''; for (const word of str.split(' ')) { const t = line ? line + ' ' + word : word; if (textWidth(t) > w - 14) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; };
    const role = wrap(ROLE[d.key] ?? ''), need = ok ? [] : wrap(this.tipFor(d));
    const vs = VS[d.key], strong = vs?.[0] ? wrap('STRONG VS: ' + vs[0]) : [], weak = vs?.[1] ? wrap('WEAK VS: ' + vs[1]) : [];
    const h = 26 + role.length * 9 + (strong.length + weak.length ? (strong.length + weak.length) * 9 + 4 : 0) + (need.length ? need.length * 9 + 4 : 0);
    const x = right - w, top = Math.max(2, Math.min(this.FH - h - 2, y));
    panel(ctx, x, top, w, h);
    text(ctx, d.name.toUpperCase(), x + 7, top + 5, C.gold, 1, C.ink);
    text(ctx, stats, x + 7, top + 15, C.cream);
    role.forEach((l, i) => text(ctx, l, x + 7, top + 26 + i * 9, C.muted));
    let ly = top + 30 + role.length * 9;
    strong.forEach((l) => { text(ctx, l, x + 7, ly, C.ok); ly += 9; });
    weak.forEach((l) => { text(ctx, l, x + 7, ly, '#e8826a'); ly += 9; });
    if (strong.length + weak.length) ly += 4;
    need.forEach((l) => { text(ctx, l, x + 7, ly, C.bad); ly += 9; });
  }

  // The middle screen: unit types in the selection (click one to keep only that type), or the
  // selected building's details, or a hint.
  chips: { type: string; x: number; y: number; w: number; h: number }[] = [];
  drawInfo(x: number, y: number, w: number) {
    const ctx = this.ctx, sel = this.selected();
    this.chips = [];
    if (sel.length) {
      const types = [...new Set(sel.map((u) => u.type))];
      text(ctx, sel.length === 1 ? sel[0].def.name.toUpperCase() : `${sel.length} UNITS`, x, y, C.gold);
      types.slice(0, 4).forEach((ty, i) => {
        const cx = x + i * 32, cy = y + 11, n = sel.filter((u) => u.type === ty).length;
        this.chips.push({ type: ty, x: cx, y: cy, w: 30, h: 26 });
        ctx.fillStyle = C.screenL; ctx.fillRect(cx, cy, 30, 26);
        this.drawIcon({ key: ty, kind: 'unit' } as BuildDef, cx, cy, 30, 22);
        const hp = sel.filter((u) => u.type === ty).reduce((s, u) => s + u.hp / u.def.hp, 0) / n;
        bar(ctx, cx + 1, cy + 23, 28, hp);
        if (n > 1) text(ctx, String(n), cx + 30 - textWidth(String(n)) - 1, cy + 1, C.gold, 1, C.ink);
      });
      return;
    }
    const b = this.selBld;
    if (b) {
      const pw = b.pw ?? POWER[b.type] ?? 0, q = this.prod.queues[b.type];
      text(ctx, b.name.toUpperCase(), x, y, C.gold);
      if (b.max > 0) bar(ctx, x, y + 10, w, b.hp / b.max);
      text(ctx, b.rise < 1 ? 'UNDER CONSTRUCTION' : pw ? `POWER ${pw > 0 ? '+' : ''}${pw}` : CAPTURE[b.type] ? `${b.garrison} INSIDE` : '', x, y + 15, pw > 0 ? C.ok : C.cream);
      const special = b.type === 'uplink' && b.team === 0 ? ((b.timer ?? 0) >= UPLINK_TIME ? 'READY: RIGHT-CLICK A TARGET' : `STRIKE ${Math.floor(((b.timer ?? 0) / UPLINK_TIME) * 100)}% CHARGED`)
        : b.type === 'interceptor' ? `INTERCEPTORS READY: ${b.ammo ?? 0} / 2` : '';
      if (special && b.rise >= 1) { text(ctx, special, x, y + 25, b.type === 'uplink' && (b.timer ?? 0) >= UPLINK_TIME ? C.bad : C.ok); return; }
      const info = q ? (q.length ? `${q[0].def.name.toUpperCase()} ${Math.floor(this.prod.progress(q[0]) * 100)}%  +${q.length - 1}` : 'CHOOSE UNITS BELOW') : b.type === 'scrapyard' ? 'SALVAGERS UNLOAD HERE' : '';
      text(ctx, info, x, y + 25, C.cream);
      if (q) text(ctx, 'RIGHT-CLICK MAP: RALLY POINT', x, y + 34, C.muted);
      return;
    }
    if (this.hoverBld && CAPTURE[this.hoverBld.type]) {
      const hb = this.hoverBld, c = CAPTURE[hb.type];
      text(ctx, c.name.toUpperCase(), x, y, C.gold);
      text(ctx, hb.team === 0 ? 'YOURS' : hb.team === 2 ? 'NEUTRAL' : this.hostile(0, hb.team) ? 'ENEMY' : 'ALLY', x, y + 10, C.cream);
      text(ctx, 'SEND INFANTRY IN', x, y + 22, C.muted);
      if (!c.garrison) text(ctx, 'HELD, IT CLAIMS LAND', x, y + 32, C.muted);
      return;
    }
    text(ctx, 'NOTHING SELECTED', x, y, C.muted);
    text(ctx, 'DRAG OVER UNITS, OR', x, y + 14, C.muted);
    text(ctx, 'CLICK A BUILDING.', x, y + 24, C.muted);
  }

  okBefore: Set<string> | null = null; unlockT: Record<string, number> = {};
  fresh(d: BuildDef) { return this.time - (this.unlockT[d.key] ?? -99) < 8; } // unlocked in the last few seconds
  // One build button: the item's picture, price, progress, and lock if it isn't available yet.
  drawSlot(d: BuildDef, sx: number, sy: number, w: number, h: number, hot: boolean) {
    const ctx = this.ctx, p = this.prod, ok = this.available(d);
    inset(ctx, sx, sy, w, h, hot && ok ? '#2a3824' : '#18201a');
    ctx.save(); ctx.beginPath(); ctx.rect(sx + 1, sy + 1, w - 2, h - 2); ctx.clip();
    this.drawIcon(d, sx + 1, sy + 4, w - 2, h - 12);
    const job = d.kind === 'structure' ? null : p.queues[d.from!]?.find((j) => j.def === d);
    const f = d.kind === 'structure' ? 0 : p.queues[d.from!][0]?.def === d ? p.progress(p.queues[d.from!][0]) : 0;
    if (job) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx + 1, sy + 1, w - 2, Math.round((h - 2) * (1 - f))); }
    if (!ok) { ctx.fillStyle = 'rgba(10,10,12,0.6)'; ctx.fillRect(sx + 1, sy + 1, w - 2, h - 2); }
    ctx.restore();
    ctx.fillStyle = 'rgba(8,8,10,0.75)'; ctx.fillRect(sx + 1, sy + h - 9, w - 2, 8);
    if (this.placing === d) { if (Math.floor(this.time * 3) % 2) text(ctx, 'PLACE', sx + Math.round((w - textWidth('PLACE')) / 2), sy + h - 8, C.gold); }
    else { const name = SHORT[d.key] ?? d.name.toUpperCase().split(' ')[0].slice(0, 7); text(ctx, name, sx + Math.round((w - textWidth(name)) / 2), sy + h - 8, ok ? C.cream : C.muted); }
    const price = d.cost >= 10000 ? `$${Math.round(d.cost / 1000)}K` : '$' + d.cost; // the price up top, on a dark tab so it reads over any picture
    ctx.fillStyle = 'rgba(8,8,10,0.75)'; ctx.fillRect(sx + 1, sy + 1, textWidth(price) + 3, 9);
    text(ctx, price, sx + 2, sy + 2, ok ? C.gold : C.muted);
    const count = d.kind === 'unit' ? p.queues[d.from!].filter((j) => j.def === d).length : 0;
    if (count) text(ctx, String(count), sx + w - 7, sy + 2, C.gold, 1, C.ink);
    if (!ok) { // a little padlock
      const lx = sx + w - 8, ly = sy + 3;
      ctx.fillStyle = C.ink; ctx.fillRect(lx - 1, ly - 1, 7, 9);
      ctx.fillStyle = C.muted; ctx.fillRect(lx + 1, ly, 3, 1); ctx.fillRect(lx, ly + 1, 1, 2); ctx.fillRect(lx + 4, ly + 1, 1, 2); ctx.fillRect(lx, ly + 3, 5, 4);
      ctx.fillStyle = C.ink; ctx.fillRect(lx + 2, ly + 4, 1, 2);
    }
    if (ok && this.fresh(d) && Math.floor(this.time * 3) % 2) { // just unlocked: a blinking gold frame
      ctx.fillStyle = C.gold; ctx.fillRect(sx, sy, w, 1); ctx.fillRect(sx, sy + h - 1, w, 1); ctx.fillRect(sx, sy, 1, h); ctx.fillRect(sx + w - 1, sy, 1, h);
    }
    if (hot) this.hoverSlot = { d, y: sy };
  }

  // Draw an item's picture centred in a box, using the visible part of its sprite.
  drawIcon(d: BuildDef, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const parts: Sprite[] = d.kind === 'structure' ? [this.icons[d.key]] : (() => { const look = this.looks[d.key + '0']; return look ? [facing(look.body, Math.PI * 0.25), ...(look.turret ? [facing(look.turret, Math.PI * 0.25)] : [])] : []; })();
    if (!parts.length || !parts[0]) return;
    const bx = trimBox(parts[0]);
    const ox = Math.round(x + w / 2 - (bx.x + bx.w / 2)), oy = Math.round(y + h / 2 - (bx.y + bx.h / 2));
    ctx.drawImage(parts[0].img, ox, oy);
    if (parts[1]) { // a turret sits on its body at the same anchor offset the game uses
      const look = this.looks[d.key + '0'], df = look.def, at = df.turretAt!, ax = at[0] - df.bodyPivot[0], az = at[2] - df.bodyPivot[2], a = Math.PI * 0.25;
      const tx = ox + parts[0].ax + ax * Math.cos(a) - az * Math.sin(a), tyy = oy + parts[0].ay + ax * Math.sin(a) + az * Math.cos(a) - (at[1] - df.bodyPivot[1]);
      ctx.drawImage(parts[1].img, Math.round(tx - parts[1].ax), Math.round(tyy - parts[1].ay));
    }
  }

  // Unit chatter and tooltips: a caption at the bottom left of the battlefield.
  drawCaption() {
    if (this.bark.t <= 0) return;
    const ctx = this.ctx, who = this.bark.who.toUpperCase() + ': ', line = this.bark.line.toUpperCase();
    const w = Math.min(this.FW - SB - 12, textWidth(who + line) + 12), y = this.FH - 18;
    panel(ctx, 6, y, w, 13);
    ctx.save(); ctx.beginPath(); ctx.rect(7, y, w - 2, 13); ctx.clip();
    text(ctx, who, 12, y + 3, C.gold); text(ctx, line, 12 + textWidth(who), y + 3, C.cream);
    ctx.restore();
  }

  owns(key: string, team = 0) { return this.blds.some((b) => b.team === team && b.type === key && b.rise >= 1 && b.dying < 0); }
  costOf(type: string) { return DEF[type]?.cost ?? 0; }
  builders(team: number) { return this.units.filter((u) => u.team === team && u.type === 'builder'); }
  available(d: BuildDef) {
    if (d.kind === 'structure' && !this.builders(0).length) return false;
    if (d.key === 'derrick') return this.terrain.oil.some((o) => o.found && !o.tapped);
    return (d.needs ?? []).every((n) => this.owns(n)) && (d.kind === 'structure' || this.owns(d.from!));
  }
  tipFor(d: BuildDef) {
    if (d.kind === 'structure' && !this.builders(0).length) return 'NEEDS A BUILDER: TRAIN ONE AT THE FIELD COMMAND';
    if (d.key === 'derrick' && !this.available(d)) return 'STRIKE OIL FIRST: ROAM THE MAP WITH VEHICLES';
    if (d.key === 'derrick' && this.available(d)) return '$1200  SMALL SEEP: +100 POWER, $5/S.  BIG STRIKE: +200, $10/S';
    const extra: Record<string, string> = {
      wall: '$30 A BLOCK. DRAG TO PLAN A LINE, LET GO AND YOUR BUILDERS LAY IT. RIGHT-CLICK TO STOP',
      reactor: '$2400  POWER +400. DEVASTATING BLAST IF DESTROYED',
      workshop: '$1000  POWER -20  UNLOCKS HEAVY WEAPONS; REPAIRS VEHICLES NEARBY',
    };
    if (extra[d.key] && this.available(d)) return extra[d.key];
    if (!this.available(d)) return 'NEEDS ' + [...(d.kind === 'unit' ? [d.from!] : []), ...(d.needs ?? [])].filter((n) => !this.owns(n)).map((n) => DEF[n].name.toUpperCase()).join(', ');
    const pw = d.power ? `  POWER ${d.power > 0 ? '+' : ''}${d.power}` : '';
    return `$${d.cost}${pw}  ${d.kind === 'structure' ? 'CLICK, THEN PLACE: A BUILDER PUTS IT UP' : 'CLICK TO TRAIN, RIGHT-CLICK REMOVES'}`;
  }

  buildClick(d: BuildDef, btn: number) {
    const p = this.prod;
    audio.click();
    if (d.kind === 'structure') {
      if (btn === 2) { this.placing = null; return; }
      if (this.available(d)) this.placing = d; // put the foundation down; a builder does the rest
      else this.bark = { who: d.name, line: this.tipFor(d), t: 3 };
      return;
    }
    if (btn === 2) { p.dequeue(d.from!, d); return; }
    if (this.available(d) && p.queues[d.from!].length < 6) p.queues[d.from!].push({ def: d, spent: 0 });
  }

  // ---- economy: production, power, placing structures, salvaging ----
  updateEconomy(dt: number) {
    for (const team of this.sides) {
      const pw = (this.powers[team] = { made: 0, used: 0 });
      for (const b of this.blds) {
        if (b.team !== team || b.rise < 1 || b.dying >= 0) continue;
        const v = b.pw ?? POWER[b.type] ?? 0;
        if (v > 0) pw.made += v * (this.territory.linked.has(b) || b.type === 'fieldCommand' ? 1 : 0.5); // a plant cut off from the network makes half
        else pw.used -= v;
      }
      const speed = this.powerEff(team);
      for (const d of this.prods[team].tick(dt, speed, (k) => this.blds.reduce((n, b) => n + (b.team === team && b.type === k && b.rise >= 1 && b.dying < 0 ? this.link(b) : 0), 0))) { // a cut-off factory works at half speed
        const fs = this.blds.filter((b) => b.team === team && b.type === d.from && b.rise >= 1 && b.dying < 0), f = fs[(Math.random() * fs.length) | 0]; // units roll out of any of your factories
        if (!f) continue;
        const u = this.addUnit(d.key, team, (f.cx + f.w / 2) * CELL, (f.cy + f.h + 0.6) * CELL);
        u.heading = u.tHead = Math.PI / 2;
        this.stats.built[team]++;
        const r = f.rally ?? [(f.cx + f.w / 2) * CELL + (Math.random() - 0.5) * 30, (f.cy + f.h + 2.5) * CELL];
        u.goal = [r[0], r[1]]; u.path = this.route(u, r[0], r[1]);
        const fed = team === 0 && u.def.weapon && u.type !== 'builder' ? this.divisions.find((v) => v?.feed) : null;
        if (fed) { if (!fed.fresh.length) fed.since = this.time; fed.units.push(u); fed.fresh.push(u); } // it joins the division once enough have gathered
        if (team === 0) { this.bark = { who: d.name, line: d.key === 'harvester' ? 'Salvager reporting. Show me the scrap.' : 'Reporting for duty.', t: 2.5 }; audio.radio(); }
      }
    }
    this.prospect(dt);
    for (const team of this.sides) if (this.owns('fieldCommand', team)) this.prods[team].credits += dt * 4; // a small allowance from HQ, so nobody stalls for good
    for (const [team, sq] of this.territory.area) this.prods[team].credits += dt * Math.max(0, sq - (this.raided.get(team) ?? 0)) * LAND_RATE; // the land pays, except where enemy soldiers stand
    if ((this.dangerT -= dt) <= 0) { this.dangerT = 5; this.markDanger(); }
    for (const b of this.blds) if (b.type === 'townHall' && b.team !== 2 && this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) this.prods[b.team].credits += dt * 5 * (this.territory.linked.has(b) ? 2 : 1); // town trade: double once linked
    for (const b of this.blds) if (b.type === 'fuelDepot' && b.team !== 2 && this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) this.prods[b.team].credits += dt * 8 * (this.territory.linked.has(b) ? 2 : 1); // captured fuel sells: double once linked
    for (const b of this.blds) if (b.type === 'derrick' && b.rise >= 1 && b.dying < 0 && b.team !== 2) this.prods[b.team].credits += dt * (b.pw === 200 ? 10 : 5) * this.link(b); // oil sells: $5 a second, $10 on a big strike (half if cut off)
    this.updateConstruction(dt);
    if ((this.helpT -= dt) <= 0) { this.helpT = 0.5; this.builderHelp(); }
  }

  // Where each side's salvagers shouldn't go: within 10 cells of the other side's buildings.
  danger: Uint8Array[] = [0, 1, 2, 3, 4].map(() => new Uint8Array(N * N)); dangerT = 0;
  markDanger() {
    const t = this.terrain;
    for (const team of this.sides) {
      const m = this.danger[team]; m.fill(0);
      for (const b of this.blds) if (this.hostile(team, b.team) && b.max > 0 && b.dying < 0)
        for (let y = b.cy - 10; y <= b.cy + b.h + 10; y++) for (let x = b.cx - 10; x <= b.cx + b.w + 10; x++) if (t.inside(x, y)) m[t.idx(x, y)] = 1;
    }
  }
  seepNear(gx: number, gy: number) {
    return this.terrain.oil.find((o) => o.found && !o.tapped && Math.hypot((o.cx + 0.5) * CELL - gx, (o.cy + 0.5) * CELL - gy) < CELL * 2.5) ?? null;
  }

  // The wildcard: vehicles rolling near hidden oil set off a gusher.
  prospect(dt: number) {
    const t = this.terrain;
    for (const o of t.oil) {
      if (o.found) continue;
      const ox = (o.cx + 0.5) * CELL, oy = (o.cy + 0.5) * CELL;
      const finder = this.units.find((u) => u.team !== 2 && u.def.vehicle && Math.hypot(u.x - ox, u.y - oy) < 34);
      if (!finder) continue;
      o.found = true;
      t.occupied[t.idx(o.cx, o.cy)] = 1; // nothing else may be built on a well
      t.oilPool(o.cx, o.cy, o.big);
      this.gushers.push({ x: ox, y: oy, t: o.big ? 5 : 3, big: o.big });
      if (finder.team !== 0) continue; // the enemy found it: only you see your own strikes
      this.bark = o.big ? { who: 'Field report', line: 'BIG STRIKE! Oil everywhere. Build a Derrick on it.', t: 4 } : { who: 'Field report', line: 'Struck oil. A small seep, but it\'ll pump.', t: 4 };
      audio.explosion(ox, oy, o.big ? 2 : 1.2); audio.radio();
      this.shakeAt = 0.5;
    }
    for (const g of this.gushers) {
      g.t -= dt;
      const [sx, sy] = this.scr(g);
      for (let i = 0; i < (g.big ? 6 : 3); i++) // a black column spraying up and pattering down
        this.puffs.push({ x: sx + (Math.random() - 0.5) * 3, y: sy - 2, vx: (Math.random() - 0.5) * 14, vy: -30 - Math.random() * (g.big ? 40 : 22), t: 0, life: 1.2 + Math.random() * 0.6, c: Math.random() < 0.15 ? '#3a3a40' : '#111012', s: 1 + (Math.random() < 0.3 ? 1 : 0), g: 46 });
    }
    this.gushers = this.gushers.filter((g) => g.t > 0);
  }

  // Top-left cell for a structure centred under the mouse, and whether it may go there.
  placeAt(d: BuildDef, at?: [number, number]): [number, number, boolean] {
    const M = this.mouse, [gx, gy] = at ?? this.groundAt(M.x + this.vx, M.y + this.vy), t = this.terrain;
    let cx = Math.floor(gx / CELL - d.w! / 2 + 0.5), cy = Math.floor(gy / CELL - d.h! / 2 + 0.5), well = -1;
    if (d.key === 'derrick') { // snaps onto struck oil under the cursor; anywhere on the map
      const o = this.seepNear(gx, gy);
      if (!o) return [cx, cy, false];
      cx = o.cx - 1; cy = o.cy - 1; well = t.idx(o.cx, o.cy);
    }
    let ok = true, e = -1;
    const no = (why: string) => { if (ok) this.placeWhy = why; ok = false; }; // the first reason it can't go here, said to the player
    this.placeWhy = '';
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) {
      if (!t.inside(x, y)) { no('OFF THE MAP'); continue; }
      const i = t.idx(x, y), ty = t.type[i];
      const roadOk = d.key === 'wall'; // nothing else may sit on a road: a wall across one is a roadblock
      if (ty === T.ROAD && !roadOk) no('NOT ON A ROAD');
      else if (ty === T.WATER || ty === T.FORD || ty === T.BRIDGE) no('NOT ON WATER');
      else if (ty === T.ROCK) no('NOT ON ROCK');
      else if (ty !== 0 && ty !== 1 && ty !== 2 && ty !== 8 && !(ty === T.ROAD && roadOk)) no('CAN\'T BUILD HERE');
      else if (t.occupied[i] && i !== well) no('SOMETHING IS IN THE WAY');
      else if (t.forest[i] && d.key === 'wall') no('NOT IN THE WOODS');
      else if (t.elev[i] === 1) no('NOT ON A SLOPE');
      if (e < 0) e = t.elev[i]; else if (t.elev[i] !== e) no('THE GROUND MUST BE LEVEL');
    }
    if (this.units.some((u) => u.x > cx * CELL - 4 && u.x < (cx + d.w!) * CELL + 4 && u.y > cy * CELL - 4 && u.y < (cy + d.h!) * CELL + 4)) no('UNITS ARE IN THE WAY');
    // anything may go anywhere you've explored (a builder has to get there, and may not)
    let explored = true;
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) if (!t.inside(x, y) || !this.vis[t.idx(x, y)]) explored = false;
    if (!explored) no('YOU HAVEN\'T EXPLORED THERE');
    return [cx, cy, ok];
  }

  // The building planner: the box dragged on screen filled with the building, set out on the ground's grid a square apart
  // (room for a road between). A thin box is a row; a click is one. Nearest the start first, twenty at most.
  blockAt(d: BuildDef, from: [number, number]): [number, number, boolean][] {
    const M = this.mouse, [ox, oy] = this.placeAt(d, from), [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy);
    const [ax, ay] = toScreen(from[0], from[1]), [bx, by] = toScreen(gx, gy), w = d.w!, h = d.h!, mx = 0.35 * (Math.max(w, h) + 1) * CELL, my = mx * SQ;
    const x0 = Math.min(ax, bx) - mx, x1 = Math.max(ax, bx) + mx, y0 = Math.min(ay, by) - my, y1 = Math.max(ay, by) + my;
    const K = Math.ceil(Math.hypot(gx - from[0], gy - from[1]) / CELL / (Math.min(w, h) + 1)) + 1, out: [number, number, boolean, number][] = [];
    for (let j = -K; j <= K; j++) for (let i = -K; i <= K; i++) {
      const cx = ox + i * (w + 1), cy = oy + j * (h + 1), px = (cx + w / 2) * CELL, py = (cy + h / 2) * CELL, [sx, sy] = toScreen(px, py);
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) out.push([cx, cy, this.placeAt(d, [px, py])[2], i * i + j * j]);
    }
    return out.sort((p, q) => p[3] - q[3]).slice(0, 20).map(([cx, cy, ok]) => [cx, cy, ok]);
  }
  // Let go: the sites that can go there are marked, and join the builders' queue in order (each paid for as it goes up).
  orderBlock(cells: [number, number, boolean][]) {
    const d = this.placing!, good = cells.filter((c) => c[2]);
    if (!good.length) { if (cells.length) this.placeAt(d, [(cells[0][0] + d.w! / 2) * CELL, (cells[0][1] + d.h! / 2) * CELL]); this.bark = { who: 'Builder', line: this.placeWhy ? this.placeWhy.charAt(0) + this.placeWhy.slice(1).toLowerCase() + '.' : 'It can\'t go there.', t: 2.5 }; audio.click(); return; }
    const sites = good.map(([cx, cy]) => {
      const seep = d.key === 'derrick' ? this.seepNear((cx + 1) * CELL, (cy + 1) * CELL) : null;
      if (seep) { seep.tapped = true; this.terrain.occupied[this.terrain.idx(seep.cx, seep.cy)] = 0; }
      this.addBld(d.key, 0, cx, cy, d.w!, d.h!, d.name);
      const b = this.blds[this.blds.length - 1];
      this.startSite(b);
      if (seep) b.pw = seep.big ? 200 : 100;
      return b;
    });
    if (!this.keys.has('ShiftLeft') && !this.keys.has('ShiftRight')) this.placing = null; // Shift keeps placing more
    // the selected builders take the first, unless they're already putting something up: that gets finished first and this
    // waits its turn (it's numbered in the queue). Otherwise each free builder takes the nearest; the rest wait for one.
    const sel = this.selected().filter((u) => u.type === 'builder' && !(u.buildSite && u.buildSite.rise < 1 && !u.buildSite.gone));
    let crew = 0;
    if (sel.length) { for (const u of sel) this.assignSite(u, sites[0]); crew = sel.length; }
    else {
      const free = this.builders(0).filter((u) => !u.buildSite && !u.hold && this.time >= u.rest);
      for (const b of sites) { if (!free.length) break; free.sort((p, q) => Math.hypot(p.x - b.cx * CELL, p.y - b.cy * CELL) - Math.hypot(q.x - b.cx * CELL, q.y - b.cy * CELL)); this.assignSite(free.shift()!, b); crew++; }
    }
    this.numberQueue();
    const what = sites.length > 1 ? `${sites.length} ${d.name}${d.name.endsWith('s') ? '' : 's'}` : 'Site';
    this.bark = { who: 'Builder', line: crew ? (sites.length > 1 ? `${what} marked. On it.` : 'Breaking ground.') : this.builders(0).length ? `${what} marked: ${this.ordinal(this.waitNo.get(sites[0]) ?? 1)} in line.` : `${what} marked. Train a builder at the Field Command.`, t: 2.5 };
    audio.radio();
  }

  // The wall planner: a straight line (along the grid or a diagonal) from where you pressed to the cursor.
  wallLine(a: [number, number], b: [number, number]) {
    const dx = b[0] - a[0], dy = b[1] - a[1], adx = Math.abs(dx), ady = Math.abs(dy);
    const [sx, sy] = adx > ady * 2 ? [Math.sign(dx), 0] : ady > adx * 2 ? [0, Math.sign(dy)] : [Math.sign(dx), Math.sign(dy)], n = Math.max(adx, ady);
    const out: [number, number][] = []; for (let k = 0; k <= Math.min(n, 60); k++) out.push([a[0] + sx * k, a[1] + sy * k]);
    return out;
  }
  // Let go: the line becomes wall sites, and your builders lay them block by block (paying as they go).
  orderWall(a: [number, number], end: [number, number, boolean]) {
    const d = DEF.wall, sites: Bld[] = [];
    for (const [x, y] of this.wallLine(a, [end[0], end[1]])) {
      if (!this.placeAt(d, [(x + 0.5) * CELL, (y + 0.5) * CELL])[2]) continue;
      this.addBld('wall', 0, x, y, 1, 1, d.name); const b = this.blds[this.blds.length - 1]; this.startSite(b); sites.push(b);
    }
    if (!sites.length) { audio.click(); return; }
    for (const b of sites) b.job = sites[0].job; // the whole line is one job in the queue
    const queueing = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), crew = this.selected().filter((u) => u.type === 'builder' && !(queueing && u.buildSite)), idle = crew.length ? crew : this.builders(0).filter((u) => !u.buildSite && !u.hold && this.time >= u.rest).sort((p, q) => Math.hypot(p.x - sites[0].cx * CELL, p.y - sites[0].cy * CELL) - Math.hypot(q.x - sites[0].cx * CELL, q.y - sites[0].cy * CELL)).slice(0, 1);
    for (const u of idle) this.assignSite(u, sites.reduce((p, q) => (this.reach(u.x, u.y, p) < this.reach(u.x, u.y, q) ? p : q)));
    this.numberQueue();
    this.bark = { who: 'Builder', line: idle.length ? `${sites.length} blocks of sandbags. On it.` : this.builders(0).length ? `${sites.length} blocks planned: ${this.ordinal(this.waitNo.get(sites[0]) ?? 1)} in line.` : `${sites.length} blocks planned. Train a builder at the Field Command.`, t: 2.5 }; audio.radio();
  }
  drawPlacement(vx: number, vy: number) {
    if (!this.placing || !this.inView(this.mouse.y)) return;
    const ctx = this.ctx, d = this.placing, [cx, cy, ok] = this.placeAt(d), t = this.terrain;
    if (d.key === 'wall' && this.planFrom) { // the planned line: each block green (or red where it can't go), and what it'll cost
      const [ax, ay] = this.placeAt(d, this.planFrom), line = this.wallLine([ax, ay], [cx, cy]); let good = 0;
      for (const [x, y] of line) {
        const fine = this.placeAt(d, [(x + 0.5) * CELL, (y + 0.5) * CELL])[2]; if (fine) good++;
        const lift = t.lift((x + 0.5) * CELL, (y + 0.5) * CELL), pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b2]) => { const [sx, sy] = toScreen(a * CELL, b2 * CELL); return [Math.round(sx - vx), Math.round(sy - lift - vy)]; });
        ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
        ctx.fillStyle = fine ? 'rgba(126,224,138,0.3)' : 'rgba(232,80,58,0.3)'; ctx.fill(); ctx.strokeStyle = fine ? 'rgba(126,224,138,0.85)' : 'rgba(232,80,58,0.85)'; ctx.lineWidth = 1; ctx.stroke();
      }
      const [lx, ly] = toScreen((cx + 0.5) * CELL, cy * CELL);
      text(ctx, `${good} BLOCKS  $${good * d.cost}`, Math.round(lx - vx) + 8, Math.round(ly - vy) - 22, this.prod.credits >= good * d.cost ? C.gold : C.bad, 1, C.ink);
      return;
    }
    const foot = (fx: number, fy: number, fine: boolean) => { for (let y = fy; y < fy + d.h!; y++) for (let x = fx; x < fx + d.w!; x++) {
      const lift = t.lift((x + 0.5) * CELL, (y + 0.5) * CELL);
      const pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b2]) => { const [sx, sy] = toScreen(a * CELL, b2 * CELL); return [Math.round(sx - vx), Math.round(sy - lift - vy)]; });
      ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
      ctx.fillStyle = fine ? 'rgba(126,224,138,0.22)' : 'rgba(232,80,58,0.28)'; ctx.fill();
      ctx.strokeStyle = fine ? 'rgba(126,224,138,0.8)' : 'rgba(232,80,58,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    } };
    if (this.planFrom) { // a dragged block: every site, and how many and what they'll cost
      const cells = this.blockAt(d, this.planFrom), good = cells.filter((c) => c[2]).length;
      for (const [x, y, fine] of cells) foot(x, y, fine);
      const [lx, ly] = toScreen((cx + d.w! / 2) * CELL, cy * CELL);
      text(ctx, `${good} ${d.name.toUpperCase()}  $${good * d.cost}`, Math.round(lx - vx) + 10, Math.round(ly - vy) - 22, this.prod.credits >= good * d.cost ? C.gold : C.bad, 1, C.ink);
      return;
    }
    foot(cx, cy, ok);
    // town centres: a dotted ring round each of your Field Commands, gold when this building would sit inside one
    const mx = cx + d.w! / 2, my = cy + d.h! / 2;
    if (d.key !== 'wall') for (const h of this.blds) {
      if (h.team !== 0 || h.type !== 'fieldCommand' || h.rise < 1 || h.dying >= 0) continue;
      const hx = h.cx + 1.5, hy = h.cy + 1.5; if (Math.hypot(hx - mx, hy - my) > TOWN + 14) continue;
      const inside = !DEFENCE[d.key] && Math.hypot(hx - mx, hy - my) <= TOWN;
      ctx.fillStyle = inside ? C.gold : 'rgba(216,212,200,0.55)';
      for (let k = 0; k < 240; k++) { if ((k >> 2) & 1) continue; const a = (k / 240) * Math.PI * 2, gx = (hx + Math.cos(a) * TOWN) * CELL, gy = (hy + Math.sin(a) * TOWN) * CELL, [sx, sy] = toScreen(gx, gy); ctx.fillRect(Math.round(sx - vx), Math.round(sy - t.lift(gx, gy) - vy), 2, 2); }
      if (inside) text(ctx, 'IN TOWN: WORKS 25% FASTER', Math.round(toScreen(mx * CELL, cy * CELL)[0] - vx) - 46, Math.round(toScreen(mx * CELL, cy * CELL)[1] - vy) - 34, C.gold, 1, C.ink);
    }
    if (DEFENCE[d.key]) { // the defences it would join in a fortified line
      const mates = this.blds.filter((o) => o.team === 0 && DEFENCE[o.type] && o.dying < 0 && Math.hypot(o.cx - cx, o.cy - cy) <= FORT);
      for (const o of mates) { const [sx, sy] = this.scr({ x: (o.cx + o.w / 2) * CELL, y: (o.cy + o.h / 2) * CELL }); ctx.fillStyle = mates.length >= 2 ? C.gold : C.cream; ctx.fillRect(Math.round(sx - vx) - 1, Math.round(sy - vy) - 1, 3, 3); }
      if (mates.length >= 2) text(ctx, 'FORTIFIED LINE', Math.round(toScreen(mx * CELL, cy * CELL)[0] - vx) - 26, Math.round(toScreen(mx * CELL, cy * CELL)[1] - vy) - 34, C.gold, 1, C.ink);
    }
    let cut = false;
    if (d.key !== 'wall') { // what it would link to: a thin gold line to each of your buildings in reach, or a warning that it'd be cut off
      const j = this.territory.joins(0, { type: d.key, team: 0, cx, cy, w: d.w!, h: d.h!, dying: -1 }), [px, py] = this.scr({ x: mx * CELL, y: my * CELL });
      ctx.strokeStyle = 'rgba(255,214,110,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      for (const o of j.mates.slice(0, 8)) { const [ox, oy] = this.scr({ x: (o.cx + o.w / 2) * CELL, y: (o.cy + o.h / 2) * CELL }); ctx.beginPath(); ctx.moveTo(Math.round(px - vx) + 0.5, Math.round(py - vy) + 0.5); ctx.lineTo(Math.round(ox - vx) + 0.5, Math.round(oy - vy) + 0.5); ctx.stroke(); }
      ctx.setLineDash([]);
      cut = !j.heart && !j.mates.length;
    }
    const s = this.looks[d.key + '0'].body[0], [bx, by] = this.scr({ x: (cx + d.w! / 2) * CELL, y: (cy + d.h! / 2) * CELL });
    ctx.globalAlpha = 0.55; ctx.drawImage(s.img, Math.round(bx - vx - s.ax), Math.round(by - vy - s.ay)); ctx.globalAlpha = 1;
    if (ok && cut) { // allowed, but it would work at half rate: say so
      const why = 'TOO FAR TO LINK: HALF RATE', tw = textWidth(why), tx = Math.round(Math.min(this.worldW() - tw - 8, this.mouse.x + 12)), ty = Math.round(this.mouse.y + 16);
      ctx.fillStyle = C.ink; ctx.fillRect(tx - 3, ty - 3, tw + 6, 11); ctx.fillStyle = '#3a2a10'; ctx.fillRect(tx - 2, ty - 2, tw + 4, 9);
      text(ctx, why, tx, ty, '#ffb040');
    }
    if (!ok && this.placeWhy) { // why not, on a tag just below the cursor
      const tw = textWidth(this.placeWhy), tx = Math.round(Math.min(this.worldW() - tw - 8, this.mouse.x + 12)), ty = Math.round(this.mouse.y + 16);
      ctx.fillStyle = C.ink; ctx.fillRect(tx - 3, ty - 3, tw + 6, 11); ctx.fillStyle = '#3a1410'; ctx.fillRect(tx - 2, ty - 2, tw + 4, 9);
      text(ctx, this.placeWhy, tx, ty, '#ff8a70');
    }
  }

  // Salvagers work on their own: find scrap, fill up, haul it to the nearest scrapyard, unload.
  salvage(u: Unit, dt: number) {
    const t = this.terrain;
    // close enough to the scrap it was heading for: start digging (two salvagers nudging each
    // other off one spot would otherwise never arrive)
    if (u.goal && !u.unloading && u.cargo < SCRAP_LOAD && !u.forced && t.scrap[t.idx(t.cellOf(u.x), t.cellOf(u.y))] > 0 && Math.hypot(u.goal[0] - u.x, u.goal[1] - u.y) < 16) { u.path = []; u.goal = null; }
    const yards0 = this.blds.filter((b) => b.team === u.team && b.type === 'scrapyard' && b.rise >= 1 && b.dying < 0);
    if (u.cargo >= SCRAP_LOAD && !u.unloading && yards0.some((b) => Math.hypot((b.cx + b.w / 2) * CELL - u.x, (b.cy + b.h + 0.6) * CELL - u.y) < 22)) { u.path = []; u.goal = null; u.unloading = true; }
    if (u.path.length || u.goal) return; // busy following an order or a route
    const yards = this.blds.filter((b) => b.team === u.team && b.type === 'scrapyard' && b.rise >= 1 && b.dying < 0);
    if (!yards.length) return;
    const bay = (b: Bld): [number, number] => [(b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.6) * CELL];
    if (u.unloading) {
      const amt = Math.min(UNLOAD_RATE * dt, u.cargo);
      u.cargo -= amt; this.prods[u.team].credits += amt;
      if (u.cargo <= 0) { u.cargo = 0; u.unloading = false; }
      return;
    }
    if (u.cargo >= SCRAP_LOAD) {
      if ((u.scan -= dt) > 0) return; // a yard it can't reach yet: try again in a second, not every frame
      u.scan = 1;
      const yard = yards.reduce((a, b) => (Math.hypot(...sub(bay(a), u)) < Math.hypot(...sub(bay(b), u)) ? a : b));
      const [bx, by] = bay(yard);
      if (Math.hypot(bx - u.x, by - u.y) < 16) { u.unloading = true; return; }
      u.goal = [bx, by]; u.path = findPath(t, u.x, u.y, bx, by, true);
      return;
    }
    const ci = t.idx(t.cellOf(u.x), t.cellOf(u.y));
    if (t.scrap[ci] > 0) {
      const take = Math.min(HARVEST_RATE * dt, t.scrap[ci], SCRAP_LOAD - u.cargo);
      u.cargo += take; t.scrap[ci] = Math.max(0, t.scrap[ci] - take);
      if (t.scrap[ci] <= 0) t.clearScrap(t.cellOf(u.x), t.cellOf(u.y));
      if (Math.random() < dt * 4) { const [px, py] = this.scr(u); this.puffs.push({ x: px + (Math.random() - 0.5) * 10, y: py - 6, vx: (Math.random() - 0.5) * 6, vy: -4, t: 0, life: 0.8, c: '#8a5a34', s: 1 }); }
      u.heading += dt * 0.6; // working the field
      return;
    }
    // nearest scrap no other salvager is heading for, searching outward ring by ring (once a second at most)
    if ((u.scan -= dt) > 0) return;
    u.scan = 1;
    const cx0 = t.cellOf(u.x), cy0 = t.cellOf(u.y), claimed = new Set<number>(), skip = Math.min(u.avoid, 6) * 3; // after giving up, look a little further afield
    if (u.avoid && Math.random() < 0.02) u.avoid--;
    for (const o of this.units) if (o !== u && o.type === 'harvester' && o.goal) claimed.add(t.idx(t.cellOf(o.goal[0]), t.cellOf(o.goal[1])));
    for (let r = 1; r < N; r++) {
      let best = -1, bd = 1e9;
      for (let y = cy0 - r; y <= cy0 + r; y++) for (let x = cx0 - r; x <= cx0 + r; x += y === cy0 - r || y === cy0 + r ? 1 : 2 * r) { // just the ring's edge
        if (!t.inside(x, y)) continue;
        const i = t.idx(x, y);
        if (t.scrap[i] > 0 && !t.occupied[i] && !claimed.has(i) && !(u.team !== 2 && this.danger[u.team]?.[i])) { const dd = Math.hypot(x - cx0, y - cy0); if (dd < bd) { bd = dd; best = i; } }
      }
      if (best >= 0 && r > skip) {
        const gx = ((best % N) + 0.5) * CELL, gy = (Math.floor(best / N) + 0.5) * CELL;
        u.goal = [gx, gy]; u.path = findPath(t, u.x, u.y, gx, gy, true);
        return;
      }
    }
  }

  // ---- side panel clicks (in panel pixels) ----
  mm = { x: 0, y: 0, s: 128 };
  minimapHit(x: number, y: number) { const m = this.mm; return x >= m.x && x < m.x + m.s && y >= m.y && y < m.y + m.s; }
  minimapPoint(): [number, number] { const m = this.mm; return toScreen(...fromMini(this.mouse.hx - m.x, this.mouse.hy - m.y, m.s)); } // a point on the minimap -> the screen
  minimapJump() { const [x, y] = this.minimapPoint(); this.centreScreen(x, y); this.vx = this.goalX; this.vy = this.goalY; }
  uiClick(btn: number) {
    const M = this.mouse, hx = M.hx, hy = M.hy;
    if (hx < this.HW - SB) return false; // on the battlefield
    if (btn === 0 && this.minimapHit(hx, hy) && this.attackMode) { const [x, y] = this.minimapPoint(); this.attackMode = false; this.command(x, y, true); return true; } // an attack order aimed on the radar goes there
    if (btn === 0 && this.minimapHit(hx, hy)) { this.minimapJump(); M.down = true; M.sx = M.x; M.sy = M.y; M.onMap = true; return true; }
    if (btn === 2 && this.minimapHit(hx, hy)) { const [x, y] = this.minimapPoint(); this.command(x, y); return true; }
    const hit = (r: { x: number; y: number; w: number; h: number }) => hx > r.x && hx < r.x + r.w && hy > r.y && hy < r.y + r.h;
    for (const b of this.buttons) if (hit(b)) { if (b.id === 'pause') { this.state = 'paused'; this.menuHot = 0; } else this.order(b.id); audio.click(); return true; }
    for (const c of this.chips) if (hit(c)) { const keep = this.selected().filter((u) => u.type === c.type); this.select(keep, false); if (keep.length) this.centre(keep.reduce((a, u) => a + u.x, 0) / keep.length, keep.reduce((a, u) => a + u.y, 0) / keep.length); return true; } // keep only this type, and go to them
    for (const tb of this.tabs) if (hit(tb)) { this.buildTab = tb.id; if (this.selBld && this.prod.queues[this.selBld.type]) this.selBld = null; audio.click(); return true; }
    for (const sl of this.slots) if (hit(sl)) { this.buildClick(sl.def, btn); return true; }
    return true;
  }
}

// A tileable sheet of soft cloud shadow.
function makeClouds() {
  const S = 512, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!, img = ctx.createImageData(S, S), d = img.data;
  const h = (x: number, y: number, s: number) => { x = ((x % s) + s) % s; y = ((y % s) + s) % s; const n = Math.sin(x * 127.1 + y * 311.7 + s) * 43758.5453; return n - Math.floor(n); };
  const vn = (x: number, y: number, cells: number) => {
    const f = S / cells, fx = x / f, fy = y / f, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
    return (h(ix, iy, cells) * (1 - u) + h(ix + 1, iy, cells) * u) * (1 - v) + (h(ix, iy + 1, cells) * (1 - u) + h(ix + 1, iy + 1, cells) * u) * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vn(x, y, 4) * 0.6 + vn(x, y, 9) * 0.3 + vn(x, y, 23) * 0.1;
    const k = (y * S + x) * 4;
    // smooth, soft-edged and see-through: no dither pattern to crawl over sprite shadows
    d[k] = 8; d[k + 1] = 14; d[k + 2] = 22; d[k + 3] = Math.max(0, Math.min(1, (n - 0.53) / 0.1)) * 54;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const sub = (a: [number, number], u: { x: number; y: number }): [number, number] => [a[0] - u.x, a[1] - u.y];

function angDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Yield to the browser between loading steps without waiting for a screen refresh,
// so loading keeps going even if the tab is in the background.
const chan = new MessageChannel(), waiting: (() => void)[] = [];
chan.port1.onmessage = () => waiting.shift()?.();
// The visible part of a sprite (cached), so pictures can be centred in buttons.
const trimCache = new WeakMap<Sprite, { x: number; y: number; w: number; h: number }>();
function trimBox(s: Sprite) {
  let b = trimCache.get(s);
  if (b) return b;
  const c = s.img, d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  b = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: c.width, h: c.height };
  trimCache.set(s, b);
  return b;
}

let genMs = 0; // how long making the map took (for the load report)
const nextFrame = () => new Promise<void>((r) => { waiting.push(r); chan.port2.postMessage(0); });
