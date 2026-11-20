// The game: a big painted map, pre-rendered pixel sprites, and the pixel-art interface,
// all drawn into one small frame that is blown up with hard square pixels.
import * as THREE from 'three';
import { Terrain, SIZES, T, CELL, N, LIFT, YAW, YC, YS, SW, SH, MAP as MAPSIZE, toScreen, toGround, shadeHex } from './terrain';
import { hash3 } from './voxel';
import { bake, facing, Sprite } from './bake';
import { ART, CIVIC, LIFE, BASE, pine, broadleaf, stump } from './art';
import { BUILDS, DEF, POWER, Production, BuildDef, FOUNDRY_POWER, FOUNDRY_RATE, MISSILE_TIME, MISSILE_COST, INTERCEPT_RANGE, INTERCEPT_RELOAD, SHIELD_HP, SHIELD_R, SCRAP_LOAD, HARVEST_RATE, UNLOAD_RATE, LAND_RATE, BANDIT, FUEL } from './build';
import { AI, Level, Plan } from './ai';
import { teamColors, ModelDef, VB } from './models';
import { findPath } from './path';
import { Territory } from './territory';
import { planBetween, snapTo, RoadPlan } from './roads';
import { audio } from './audio';
import { text, textWidth } from './font';
import { WEAPONS, BLD_HP, DEFENCE, Shell, Blast, Tracer, Weapon, Armour, drawBlast, drawShell, drawTracer } from './combat';
import { C, panel, rivets, inset, button, Button, cursor, bar, glass } from './ui';

const SB = 150;
// Who beats whom, measured in equal-cost fights; shown on every tooltip so the system can be learned at a glance.
const VS: Record<string, [string, string]> = {
  rifle: ['ROCKET SOLDIERS', 'GRENADIERS, SCOUTS, ALL ARMOUR'],
  rocket: ['VEHICLES, AIRCRAFT', 'RIFLEMEN, GRENADIERS, GUARD TOWERS'],
  grenadier: ['RIFLEMEN, ROCKET SOLDIERS, BUNKERS', 'SCOUTS, VEHICLES, AIRCRAFT'],
  engineer: ['ENEMY BUILDINGS (TAKES THEM OVER)', 'ANYTHING ARMED'],
  infiltrator: ['RICH, UNWATCHED BASES (UNSEEN)', 'GUARD TOWERS, SCOUTS, RADAR (THEY SPOT IT)'],
  scout: ['INFANTRY, FIELD GUNS, INFILTRATORS (SPOTS THEM)', 'ROCKETS, TANKS, GUNSHIPS, BUILDINGS'],
  hovertank: ['SCOUTS, INFANTRY, FIELD GUNS', 'TANKS, ROCKETS, GUNSHIPS'],
  tank: ['SCOUTS, HOVERTANKS, INFANTRY', 'ROCKETS, JUGGERNAUTS, GUNSHIPS'],
  juggernaut: ['TANKS AND ALL GROUND BUT ROCKETS', 'ROCKETS, GUNSHIPS, RAIL TOWERS'],
  artillery: ['DEFENCES AND CROWDS, WITH A SPOTTER', 'ANYTHING THAT REACHES IT'],
  flak: ['AIRCRAFT', 'EVERY GROUND UNIT'],
  gunship: ['EVERY GROUND UNIT', 'FLAK, ROCKETS'],
  bomber: ['BUILDINGS', 'FLAK, ROCKETS. CAN\'T HIT UNITS'],
  colossus: ['ARMIES AND ARMOUR', 'ROCKET SWARMS, RAIL TOWERS'],
  tempest: ['BUILDINGS', 'FLAK, ROCKETS'],
  harvester: ['', 'EVERYTHING. KEEP IT GUARDED'],
  builder: ['A LONE SOLDIER OR SPY (SMALL GUN)', 'ANY REAL FORCE. KEEP IT GUARDED'],
  guardTower: ['INFANTRY', 'VEHICLES, ARTILLERY, AIRCRAFT'],
  emplacement: ['VEHICLES', 'INFANTRY, ARTILLERY, AIRCRAFT'],
  flakTower: ['AIRCRAFT', 'EVERY GROUND UNIT'],
  railTower: ['JUGGERNAUTS, SUPER-UNITS', 'INFANTRY, ARTILLERY, AIRCRAFT'],
  battery: ['FAR-OFF BASES, WITH VISION', 'ANYTHING THAT REACHES IT'],
  shield: ['SHELLS AND BOMBS', 'POWER LOSS, UNITS UNDER THE DOME'],
  interceptor: ['MISSILES', 'EVERYTHING ELSE'],
  wall: ['FUNNELLING ATTACKERS', 'HEAVY GUNS'],
};
// What each thing is for, shown on the build panel's tooltip.
const ROLE: Record<string, string> = {
  generator: 'POWER +100. CHEAP TO BUILD, BURNS $1.50 A SECOND IN FUEL. SHORT OF POWER, EVERYTHING SLOWS.',
  scrapyard: 'COMES WITH A SALVAGER. SCRAP IS YOUR MAIN EARLY INCOME.',
  barracks: 'TRAINS INFANTRY. MORE BARRACKS TRAIN FASTER.',
  wall: 'CHEAP BLOCKS. FUNNEL ATTACKERS INTO YOUR GUNS. ACROSS A ROAD: A ROADBLOCK.',
  road: 'PAVED ROAD. VEHICLES 60% FASTER, INFANTRY 20%. LINK YOUR BASE TO OUTPOSTS.',
  guardTower: 'MACHINE GUN NEST. SHREDS INFANTRY, SPOTS HIDDEN UNITS, WEAK TO ARMOUR. 3 DEFENCES TOGETHER TAKE 25% LESS DAMAGE.',
  fieldCommand: 'A TOWN CENTRE: BUILDINGS NEAR IT WORK 25% FASTER. RADAR, BUILDERS, A SMALL ALLOWANCE.',
  depot: 'BUILDS VEHICLES. MORE DEPOTS BUILD FASTER.',
  hospital: 'HEALS INFANTRY NEARBY. UNLOCKS GRENADIERS.',
  workshop: 'REPAIRS VEHICLES NEARBY. UNLOCKS FIELD GUNS.',
  derrick: 'ON STRUCK OIL: FREE POWER AND STEADY MONEY.',
  emplacement: 'EVERYDAY TANK STOPPER: CHEAP, MID RANGE, QUICK SHOTS. 3 DEFENCES TOGETHER TAKE 25% LESS DAMAGE.',
  foundry: 'TURNS SPARE POWER INTO A LITTLE MONEY. BEST FED BY A REACTOR.',
  reactor: 'POWER +400 FOR $2 A SECOND IN FUEL: A QUARTER OF A GENERATOR\'S RUNNING COST. A HUGE BLAST IF DESTROYED.',
  airfield: 'BUILDS AIRCRAFT.',
  flakTower: 'ANTI-AIR GUN. CANNOT HIT GROUND TARGETS. 3 DEFENCES TOGETHER TAKE 25% LESS DAMAGE.',
  radar: 'REVEALS A WIDE AREA AROUND IT, SO YOUR GUNS CAN SEE. SPOTS HIDDEN UNITS.',
  battery: 'GIANT FIXED GUN. FIRES ACROSS HALF THE MAP AT WHAT YOU CAN SEE.',
  builder: 'PUTS UP BUILDINGS AND REPAIRS THEM. A SMALL GUN KEEPS A LONE SOLDIER OFF IT.',
  rifle: 'CHEAP INFANTRY. CAPTURES SITES, GARRISONS BUNKERS. HIDES STANDING STILL IN FOREST.',
  rocket: 'KILLS TANKS AND AIRCRAFT. WEAK TO RIFLEMEN.',
  grenadier: 'BREAKS UP INFANTRY CROWDS, CLEARS BUNKERS.',
  scout: 'FAST AND FAR-SIGHTED. HUNTS INFANTRY, FINDS OIL, SPOTS HIDDEN UNITS.',
  harvester: 'COLLECTS SCRAP FOR MONEY. KEEP IT SAFE.',
  tank: 'ALL-ROUND ARMOUR. BEST AGAINST VEHICLES AND BUILDINGS.',
  flak: 'MOBILE ANTI-AIR. ESCORT YOUR ARMY.',
  engineer: 'WALKS INTO AN ENEMY BUILDING AND TAKES IT OVER. RIGHT-CLICK ONE.',
  infiltrator: 'UNSEEN SPY. SNEAK INTO AN ENEMY BUILDING: STEALS CASH, BLACKS OUT POWER, OR (FIELD COMMAND) REVEALS THEIR LAND.',
  hovertank: 'THE ONLY GROUND UNIT THAT CROSSES WATER. A LIGHT FLANKER, NOT A BRAWLER.',
  bomber: 'BUILDING BREAKER: A LINE OF HEAVY BOMBS. NEARLY HARMLESS TO UNITS. FLAK EATS IT.',
  tempest: 'SUPER-UNIT BASE BREAKER: A FLYING FORTRESS THAT FLATTENS BUILDINGS. WEAK AGAINST UNITS.',
  railTower: 'HEAVY-HITTER KILLER: HUGE, SLOW SHOTS FOR JUGGERNAUTS AND SUPER-UNITS. USELESS ON INFANTRY.',
  armoury: 'RESEARCHES UPGRADES FOR YOUR WHOLE SIDE. SELECT IT TO START.',
  armourUp: 'ALL YOUR VEHICLES TAKE 20% LESS DAMAGE.',
  shellsUp: 'EVERYTHING YOU HAVE HITS 15% HARDER.',
  engines: 'ALL YOUR VEHICLES MOVE 15% FASTER.',
  optics: 'ALL YOUR UNITS AND BUILDINGS SEE 30% FURTHER. GREAT FOR SPOTTING ARTILLERY TARGETS.',
  colossus: 'SUPER-UNIT ARMY BREAKER: CRUSHES TANKS AND ARMIES. MASS ROCKETS TO STOP ONE.',
  provingGround: 'BUILDS THE COLOSSUS.',
  silo: 'CHARGES A STRATEGIC MISSILE ($4000, 150S). SELECT IT AND RIGHT-CLICK TO LAUNCH.',
  interceptor: 'SHOOTS DOWN INCOMING MISSILES NEARBY. HOLDS TWO, RELOADS SLOWLY.',
  shield: 'A DOME THAT SOAKS UP SHELLS. HUNGRY FOR POWER: NO POWER, NO SHIELD.',
  artillery: 'LONG-RANGE GUN. OUTRANGES DEFENCES. HELPLESS UP CLOSE.',
  juggernaut: 'HUGE HEAVY TANK. RUNS OVER INFANTRY.',
  gunship: 'UNIT HUNTER FROM THE AIR: ROCKETS TANKS AND INFANTRY. WEAK AGAINST BUILDINGS.',
};
const GB = N / 4; // unit-grid buckets per side
const ALT = 26; // how high aircraft fly, in screen pixels
// where smoke leaves a building: [x, z, height, puffs per second]
const VENTS: Record<string, [number, number, number, number]> = { generator: [29, 18, 36, 5], scrapyard: [9, 9, 40, 3] }; // width of the side panel, in panel pixels

const TEAMS = [teamColors(0x4a78a8), teamColors(0xb04434), teamColors(0x8a8a82), teamColors(0x4f8a3a), teamColors(0xc0902a), teamColors(0x7a4a8a)]; // you (blue), red, neutral (grey), green, gold, bandits (purple)
const CAMO = new Set(['rifle', 'rocket', 'grenadier', 'artillery']); // who can hide still in forest
const DETECT: Record<string, number> = { near: 2.5, scout: 6, guardTower: 6, radar: 12 }; // spotting reach, in squares
const SPY_STEAL = 0.25, SPY_STEAL_MAX = 2500, SPY_BLACKOUT = 45, SPY_REVEAL = 60; // what an infiltrator does
const SIGHT: Record<string, number> = { tank: 6, builder: 7, rifle: 5, rocket: 5, grenadier: 5, juggernaut: 6, wall: 1, hospital: 4, foundry: 4, reactor: 5, gunship: 7, flak: 6, radar: 22, battery: 5, flakTower: 6, airfield: 6, colossus: 8, provingGround: 5, silo: 4, interceptor: 6, shield: 5, engineer: 5, infiltrator: 6, hovertank: 6, bomber: 7, tempest: 9, railTower: 8, armoury: 4, scout: 9, artillery: 4, harvester: 4, workshop: 4, fieldCommand: 8, guardTower: 7, emplacement: 7, commTower: 24, powerPlant: 4, repairYard: 4 }; // how far each thing sees, in squares
const SITE_GUNS: Record<string, number> = { fuelDepot: 3, powerPlant: 2, motorPool: 2, commTower: 1, repairYard: 1, recruitOffice: 1 }; // bandit guns round each prize (town halls are left in peace)
const CAMP_BOUNTY = 1500; // paid for clearing a bandit camp
const TIMBER = 10; // dollars a felled tree fetches
const TOWN = 8, FORT = 6; // town-centre reach and fortified-line spacing, in squares
const DOT = ['#6ab8ff', '#ff5a40', '#d8d4c8', '#7ad860', '#ffc040', '#d07ae0']; // each side's colour on the radar and icons
const FLAG = [['#5a8ac0', '#3a5a80'], ['#c85040', '#8a3428'], ['#d8d4c8', '#9a968a'], ['#5a9a40', '#3a6a28'], ['#d0a038', '#8a6a20'], ['#a060b0', '#6a3a78']];
// how many sides and whether it's teams, read before the map is made (the map's symmetry depends on it)
function storedPlayers() { try { const n = Number(localStorage.getItem('conquer-players')); return n >= 2 && n <= 4 ? n : 2; } catch { return 2; } }
const CAR_PAINT = [0xc8a840, 0x5a7a9a, 0x8a3a2a, 0xd8d4c8].map(teamColors);
const SHIRTS = [0xa86a3a, 0x6a8a5a, 0xc8c0a8].map(teamColors);
// What each capturable site does once your infantry take it.
const CAPTURE: Record<string, { name: string; tip: string; garrison?: number }> = {
  motorPool: { name: 'Motor Pool', tip: 'CAPTURE: DELIVERS A TANK, THEN ONE EVERY 90S' },
  recruitOffice: { name: 'Recruiting Office', tip: 'CAPTURE: 3 RIFLEMEN, THEN 2 EVERY 60S' },
  bunker: { name: 'Bunker', tip: 'GARRISON UP TO 3 INFANTRY TO FIRE FROM COVER', garrison: 3 },
  watchtower: { name: 'Watchtower', tip: 'GARRISON 2 INFANTRY: HIGH GROUND, LONG SIGHT', garrison: 2 },
  fuelDepot: { name: 'Fuel Depot', tip: 'CAPTURE: PAYS $8 A SECOND WHILE YOU HOLD IT' },
  townHall: { name: 'Town Hall', tip: 'CAPTURE: THE TOWN TRADES WITH YOU, $5 A SECOND' },
  powerPlant: { name: 'Power Plant', tip: 'CAPTURE: +250 FREE POWER WHILE YOU HOLD IT' },
  commTower: { name: 'Comm Tower', tip: 'CAPTURE: SEE FAR ACROSS THE MAP' },
  repairYard: { name: 'Repair Yard', tip: 'CAPTURE: REPAIRS YOUR UNITS PARKED NEARBY' },
};

interface UnitDef {
  name: string; hp: number; speed: number; turn: number; radius: number; crush: boolean | 2; vehicle: boolean; facings: number; track: number; weapon?: string; air?: boolean; weapon2?: string; // weapon2: a second gun that fires on its own
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
  engineer: {
    name: 'Engineer', hp: 50, speed: 12, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0,
    barks: { select: ['Got my toolkit.', 'Which one do we take?', 'I can rewire anything.'], move: ['Sneaking in.', 'Moving.', 'Keep me covered.'] },
  },
  infiltrator: {
    name: 'Infiltrator', hp: 60, speed: 16, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0,
    barks: { select: ['Nobody saw me.', 'Point me at their books.', 'Quietly does it.'], move: ['Slipping through.', 'In the shadows.', 'Gone.'] },
  },
  hovertank: {
    name: 'Hovertank', hp: 300, speed: 40, turn: 2.6, radius: 10, crush: 2, vehicle: true, facings: 32, track: 0, weapon: 'hoverGun',
    barks: { select: ['Skirts inflated.', 'Water is no wall.', 'Ready to skim.'], move: ['Skimming.', 'Across the water!', 'Fast and low.'] },
  },
  bomber: {
    name: 'Bomber', hp: 420, speed: 54, turn: 1.6, radius: 12, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'bombs', air: true,
    barks: { select: ['Bomb bay loaded.', 'Mark the target.', 'Heavy payload.'], move: ['Inbound.', 'Holding course.', 'On the bomb run.'] },
  },
  tempest: {
    name: 'Tempest', hp: 6000, speed: 14, turn: 0.5, radius: 26, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'tempestBombs', weapon2: 'colossusFlak', air: true,
    barks: { select: ['The sky darkens.', 'Tempest aloft.', 'Name the city.'], move: ['The storm moves.', 'Advancing.', 'Nothing below is safe.'] },
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
  id = nextId++; hp: number; heading = Math.PI * 1.75; tHead = Math.PI * 1.75;
  path: [number, number][] = []; goal: [number, number] | null = null;
  selected = false; moving = false; trackAcc = 0; stuck = 0; bob = 0; scan = 0; scanTo = 0; dust = 0; enter: Bld | null = null;
  cargo = 0; unloading = false; // salvagers
  home: [number, number] | null = null; // bandits: the spot they guard and drift back to
  hitAt = -99; // when it last took damage (home ground repairs only out of the fight)
  queue: [number, number][] = []; pace = 0; avoid = 0; progT = 0; px0 = 0; py0 = 0; // progT: watching for a unit that has a route but isn't getting anywhere // avoid: times it gave up on a goal
  buildSite: Bld | null = null; // builders: the construction site they're working on // waypoints still to visit; group pace (0 = own speed)
  grab: Bld | null = null; // engineers: the enemy building they're going to take over
  spy: Bld | null = null; // infiltrators: the enemy building they're sneaking into
  cloak = 0; firedAt = -99; // cloak: which alliances can't see it right now (a bit each); firedAt: when it last shot
  face: number | null = null; // the way to turn once it arrives (the front of its formation)
  kills = 0; reload2 = 0; target2: Unit | Bld | null = null; // veterancy; the second gun
  get rank() { return this.kills >= 15 ? 3 : this.kills >= 7 ? 2 : this.kills >= 3 ? 1 : 0; }
  target: Unit | Bld | null = null; forced = false; amove = false; reload = 0; scanT = Math.random() * 0.3; chase = 0; // combat
  constructor(public type: string, public def: UnitDef, public team: number, public x: number, public y: number) { this.hp = def.hp; }
}
interface Tree { x: number; y: number; v: number; fall: number; dir: number }
interface Bld { type: string; team: number; cx: number; cy: number; w: number; h: number; name: string; garrison: number; timer: number; rise: number; rally: [number, number] | null; pw?: number;
  hp: number; max: number; reload: number; tHead: number; target: Unit | Bld | null; dying: number; seen?: boolean;
  cleared?: boolean; drive?: boolean; blackout?: number; ammo?: number; shieldHp?: number; shieldDown?: number; lastHit?: number; idle?: number } // idle: seconds a marked site has waited for a builder // interceptors in stock; a shield's strength
// Civilians, cars and animals going about their day.
interface Agent { kind: string; x: number; y: number; heading: number; look: Sprite[]; speed: number; home: [number, number]; goal: [number, number] | null; wait: number; scared: number; route?: [number, number][]; ri?: number; dir?: number; step: number; hidden?: number; shelter?: boolean; doors?: [number, number][]; stuckT?: number; tries?: number; lx?: number; ly?: number } // hidden: sheltering indoors; shelter: running for a door
type Look = { body: Sprite[]; turret?: Sprite[]; def: ModelDef };

export class Game {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  // the interface has its own layer and pixel size, independent of the battlefield's zoom
  hud = document.createElement('canvas');
  hctx = this.hud.getContext('2d')!;
  kH = 3; HW = 640; HH = 360;
  seed = (Math.random() * 1e9) | 0; // a new map every game
  players = storedPlayers();
  terrain = new Terrain(this.seed, this.players);
  units: Unit[] = [];
  trees: Tree[][] = Array.from({ length: N }, () => []); // by cell row
  blds: Bld[] = [];
  looks: Record<string, Look> = {};
  treeLooks: { stand: Sprite; fall: Sprite[][] }[] = [];
  stumpLook: Sprite;
  lifeLooks: Record<string, Sprite[]> = {};
  agents: Agent[] = [];
  birds: { x: number; y: number; vx: number; vy: number; n: number; seed: number }[] = [];
  hoverBld: Bld | null = null;
  FW = 640; FH = 360; k = 3; zoomStep = -1;
  vx = 0; vy = 0; goalX = 0; goalY = 0;
  state: 'loading' | 'title' | 'play' | 'paused' | 'won' | 'lost' = 'loading';
  level: Level = (() => { try { return (localStorage.getItem('conquer-level') as Level) || 'normal'; } catch { return 'normal'; } })();
  // skirmish settings, kept between games
  setting(k: string, d: string) { try { return localStorage.getItem('conquer-' + k) ?? d; } catch { return d; } }
  store(k: string, v: string) { try { localStorage.setItem('conquer-' + k, v); } catch {} }
  mode = this.setting('mode', 'ffa'); size = Number(this.setting('size', '256')); money = Number(this.setting('money', '6000')); plan = this.setting('plan', 'random'); hints = this.setting('hints', 'on') === 'on';
  ai: AI | null = null; ais: AI[] = []; out = new Set<number>(); // computer players; sides knocked out
  menuRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
  loadStep = 0; loadTotal = 1;
  mouse = { x: 0, y: 0, hx: 0, hy: 0, down: false, sx: 0, sy: 0, drag: false, mid: false, last: 0, in: false, onMap: false, rdown: false, rsx: 0, rsy: 0 }; // rdown, rsx, rsy: a right-drag and where it began (map pixels)
  keys = new Set<string>();
  groups: Unit[][] = [];
  prods = [0, 1, 2, 3, 4, 5].map(() => new Production()); // per side (2, neutral, is unused)
  get prod() { return this.prods[0]; }
  powers = [0, 1, 2, 3, 4, 5].map(() => ({ made: 0, used: 0, fuel: 0 }));
  // how well a side's power covers what it uses: short of power, everything runs that much slower
  powerEff(team: number) { const p = this.powers[team]; return p.used <= p.made ? 1 : Math.max(0.25, p.made / p.used); }
  get power() { return this.powers[0]; }
  pathBudget = 30; // routes that may be planned this frame
  roadFrom: [number, number] | null = null; roadPreview: { key: string; plan: RoadPlan | null } | null = null; // road tool: where it starts, and the planned route to the cursor
  lastWall: [number, number] | null = null; wallDrag = false; idleCycle = 0; sellArm: Bld | null = null; sellT = 0; helpT = 0;
  aiRate = 1; // the enemy's income and build speed, set by difficulty
  placing: BuildDef | null = null;  // a finished structure waiting to be put down
  selBld: Bld | null = null;
  icons: Record<string, Sprite> = {};
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
  buttons: Button[] = [];
  // The menu for the current screen: title, pause, or the end of a battle.
  get menuItems(): { id: string; label: string }[] {
    const sound = { id: 'sound', label: `SOUND: ${this.sound ? 'ON' : 'OFF'}` };
    if (this.state === 'title') return [{ id: 'deploy', label: 'DEPLOY' }, { id: 'level', label: `ENEMY: ${this.level.toUpperCase()}` }, { id: 'players', label: `OPPONENTS: ${storedPlayers() - 1}` }, ...(storedPlayers() === 4 ? [{ id: 'mode', label: this.mode === 'teams' ? 'TEAMS: 2 V 2' : 'FREE FOR ALL' }] : []), { id: 'plan', label: `PLAN: ${this.plan.toUpperCase()}` },
      { id: 'size', label: `MAP: ${({ 192: 'MEDIUM', 256: 'LARGE', 320: 'HUGE' } as Record<number, string>)[this.size] ?? 'LARGE'}` }, { id: 'money', label: `MONEY: $${this.money}` }, { id: 'newmap', label: 'NEW MAP' },
      { id: 'hints', label: `HINTS: ${this.hints ? 'ON' : 'OFF'}` }, sound];
    if (this.state === 'paused') return [{ id: 'resume', label: 'RESUME' }, { id: 'restart', label: 'RESTART' }, sound, { id: 'quit', label: 'QUIT TO TITLE' }];
    return [{ id: 'restart', label: 'PLAY AGAIN' }, { id: 'quit', label: 'TITLE SCREEN' }];
  }
  inMenu() { return this.state === 'title' || this.state === 'paused' || this.state === 'won' || this.state === 'lost'; }
  menuHot = 0; sound = true; time = 0;
  loadReport: Record<string, unknown> = {}; // how long loading took, for keeping it fast
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
    this.load();
    (window as any).game = this;
  }

  // ------------------------------------------------------------------ loading
  async load() {
    const t = this.terrain;
    const jobs: (() => void)[] = [];
    for (const [key, make] of Object.entries(ART))
      for (const team of ['tank', 'artillery', 'juggernaut', 'hovertank'].includes(key) ? [...this.sides, 2] : ['rifle', 'rocket', 'scout'].includes(key) ? [...this.sides, BANDIT] : this.sides) jobs.push(() => {
        const def = make(), n = DEFS[key]?.facings ?? 1;
        this.looks[key + team] = { def, body: bake(def, 'body', { facings: n, team: TEAMS[team], yaw: n === 1 ? YAW : 0 }), turret: def.turret ? bake(def, 'turret', { facings: n, team: TEAMS[team] }) : undefined };
        if (key === 'fieldCommand' && team === 0) this.icons[key] = bake(def, 'body', { team: TEAMS[0], yaw: YAW, scale: 0.3 })[0];
      });
    const variants: ModelDef[] = [pine(1), pine(2), pine(3), pine(4), broadleaf(5), broadleaf(6)];
    for (const def of variants) jobs.push(() => {
      const fall: Sprite[][] = [];
      for (let dir = 0; dir < 4; dir++) {
        const a = (dir * Math.PI) / 2 + YAW, axis = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)); // fall directions on the turned map
        fall.push([0.5, 1.0, 1.5].map((ang) => bake(def, 'body', { tilt: { axis, angle: ang } })[0]));
      }
      this.treeLooks.push({ stand: bake(def, 'body')[0], fall });
    });
    jobs.push(() => { this.stumpLook = bake(stump(), 'body')[0]; });
    for (const [key, make] of Object.entries(CIVIC)) jobs.push(() => {
      const def = make(), teams = CAPTURE[key] ? [...this.sides, 2] : [2];
      for (const team of teams) this.looks[key + team] = { def, body: bake(def, 'body', { team: TEAMS[team], yaw: YAW }) };
    });
    for (const [key, make] of Object.entries(BASE)) jobs.push(() => {
      const def = make();
      for (const team of ['guardTower', 'emplacement'].includes(key) ? [...this.sides, BANDIT] : this.sides) this.looks[key + team] = { def, body: bake(def, 'body', { team: TEAMS[team], yaw: YAW }), turret: def.turret ? bake(def, 'turret', { facings: 32, team: TEAMS[team] }) : undefined }; // guns that turn
      this.icons[key] = bake(def, 'body', { team: TEAMS[0], yaw: YAW, scale: 0.3 })[0];
    });
    jobs.push(() => {
      for (const kind of ['car', 'pickup']) CAR_PAINT.forEach((paint, i) => { const def = LIFE[kind](); this.lifeLooks[kind + i] = bake(def, 'body', { facings: 16, team: paint }); });
      SHIRTS.forEach((shirt, i) => { this.lifeLooks['civilian' + i] = bake(LIFE.civilian(), 'body', { facings: 8, team: shirt }); });
      for (const kind of ['cow', 'deer']) this.lifeLooks[kind] = bake(LIFE[kind](), 'body', { facings: 8 });
    });
    this.loadTotal = t.chunkCount + jobs.length;
    // the map is painted by background workers while the sprites are baked here
    const t0 = performance.now();
    let mapAt = 0;
    const painting = this.paintInWorkers().then(() => { mapAt = performance.now() - t0; });
    const slow: [number, number][] = [];
    for (let j = 0; j < jobs.length; j++) { const s = performance.now(); jobs[j](); slow.push([j, performance.now() - s]); this.loadStep++; await nextFrame(); }
    const spritesAt = performance.now() - t0;
    await painting;
    t.finish();
    slow.sort((a, b) => b[1] - a[1]);
    this.loadReport = { totalMs: Math.round(performance.now() - t0), spritesMs: Math.round(spritesAt), mapMs: Math.round(mapAt), slowestJobs: slow.slice(0, 5).map(([j, ms]) => `${j}:${Math.round(ms)}`) };
    this.populate();
    this.state = 'title';
    let skip = false;
    try { skip = sessionStorage.getItem('conquer-skip') === '1'; sessionStorage.removeItem('conquer-skip'); } catch {}
    if (skip) this.menu('deploy'); // 'restart' goes straight back into battle
  }

  paintInWorkers(): Promise<void> {
    const t = this.terrain, n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)); // leave a core or two for the game itself
    return new Promise((done) => {
      const [bx, by] = toScreen(t.bases[0][0] * CELL, t.bases[0][1] * CELL), todo = t.neededChunks(bx, by);
      // start once the nearest fifth (round your base) is painted; the rest carries on in the background
      const first = new Set(todo.slice(0, Math.max(30, Math.ceil(todo.length * 0.2))));
      let left = first.size, started = false;
      this.loadTotal += first.size - t.chunkCount;
      try {
        for (let w = 0; w < n; w++) {
          const worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}` });
          const mine = todo.filter((_, k) => k % n === w);
          if (!mine.length) { worker.terminate(); continue; }
          worker.onmessage = (e) => {
            t.putChunk(e.data.i, e.data.d, e.data.glints);
            if (first.has(e.data.i)) { this.loadStep++; if (--left === 0 && !started) { started = true; done(); } }
            if (e.data.i === mine[mine.length - 1]) worker.terminate();
          };
          worker.postMessage({ seed: t.seed, players: t.players, chunks: mine });
        }
      } catch {
        // no workers: paint here instead
        t.prepare();
        for (const i of todo) { t.paintChunk(i); this.loadStep++; }
        done();
      }
    });
  }

  populate() {
    const t = this.terrain;
    for (const [x, y] of t.trees) this.trees[Math.floor(y / CELL)].push({ x, y, v: (Math.random() * this.treeLooks.length) | 0, fall: -1, dir: 0 });
    for (const row of this.trees) row.sort((a, b) => a.y - b.y);
    for (const team of this.sides) { const [bx, by] = t.bases[this.baseOf(team)]; this.addUnit('builder', team, bx * CELL, by * CELL); } // every side starts with one Builder and its credits
    for (const u of this.units) if (u.team !== 0) u.heading = u.tHead = Math.PI * 0.75;
    for (const st of t.sites) this.addBld(st.kind, 2, st.cx, st.cy, st.w, st.h, CAPTURE[st.kind]?.name ?? 'House');
    this.placeBandits();
    this.buildMountains();
    for (const d of t.derelicts) { const u = this.addUnit(d.type, 2, (d.x + 0.5) * CELL, (d.y + 0.5) * CELL); u.hp = u.def.hp * 0.4; u.heading = u.tHead = Math.random() * 6.283; }
    for (let k = 0; k < 3; k++) this.dropCrates();
    this.spawnLife();
    t.hideOil();
    const [bx, by] = t.bases[0];
    this.centre(bx * CELL, by * CELL); this.vx = this.goalX; this.vy = this.goalY;
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

  // ------------------------------------------------------------------ frame size
  resize() {
    const dpr = devicePixelRatio, dw = innerWidth * dpr, dh = innerHeight * dpr;
    const base = Math.max(2, Math.round(dw / 720));
    this.k = Math.max(this.zoomStep <= -2 ? 1 : 2, base + this.zoomStep); // the furthest zoom goes down to real pixels: a commander's view
    this.FW = Math.floor(dw / this.k); this.FH = Math.floor(dh / this.k);
    this.canvas.width = this.FW; this.canvas.height = this.FH;
    this.canvas.style.width = (this.FW * this.k) / dpr + 'px';
    this.canvas.style.height = (this.FH * this.k) / dpr + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.kH = Math.max(2, Math.round(dw / 720));
    this.HW = Math.floor(dw / this.kH); this.HH = Math.floor(dh / this.kH);
    this.hud.width = this.HW; this.hud.height = this.HH;
    this.hud.style.width = (this.HW * this.kH) / dpr + 'px'; this.hud.style.height = (this.HH * this.kH) / dpr + 'px';
    this.hctx.imageSmoothingEnabled = false;
  }
  zoom(step: number) {
    const cx = this.vx + this.FW / 2, cy = this.vy + this.FH / 2;
    const s = Math.max(-4, Math.min(2, this.zoomStep + step));
    if (s === this.zoomStep) return;
    this.zoomStep = s; this.resize();
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
      if (m) {
        const n = +m[1];
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups[n] = this.selected(); audio.click(); }
        else if (this.groups[n]?.length) {
          const g = this.groups[n].filter((u) => this.units.includes(u));
          const again = g.length > 0 && g.every((u) => u.selected);
          this.select(g, false);
          if (again) this.centre(g[0].x, g[0].y);
        }
      }
      if (e.code === 'KeyS') this.order('stop');
      if ((e.code === 'Delete' || e.code === 'Backspace') && this.selBld && this.selBld.team === 0) this.order(this.selBld.rise < 1 ? 'cancel' : 'sell');
      if (e.code === 'KeyR' && this.selBld && this.prod.queues[this.selBld.type]) this.order('repeat');
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
      if (this.placing) { if (e.button === 0) { this.place(); this.wallDrag = this.placing?.key === 'wall'; } else if (this.roadFrom) this.roadFrom = null; else this.placing = null; return; }
      if (this.attackMode) { if (e.button === 0) this.command(M.x + this.vx, M.y + this.vy, true); this.attackMode = false; return; }
      if (e.button === 0) { M.down = true; M.sx = M.x; M.sy = M.y; M.drag = false; }
      if (e.button === 2) {
        if (this.selBld?.type === 'silo' && this.selBld.team === 0 && !this.selected().length) { // aim the missile
          const [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy);
          if (!this.launch(this.selBld, gx, gy)) this.bark = { who: 'Missile Silo', line: `Not ready yet: ${Math.floor(((this.selBld.timer ?? 0) / MISSILE_TIME) * 100)}% charged.`, t: 2.5 };
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
      if (M.mid) { this.goalX -= x - M.x; this.goalY -= y - M.y; this.vx = this.goalX; this.vy = this.goalY; }
      M.x = x; M.y = y;
      if (M.down && Math.hypot(M.x - M.sx, M.y - M.sy) > 3) M.drag = true;
      if (M.down && M.onMap) this.minimapJump();
      if (this.wallDrag && this.placing?.key === 'wall') { const [cx, cy] = this.placeAt(this.placing); if (!this.lastWall || cx !== this.lastWall[0] || cy !== this.lastWall[1]) this.place(); } // drag to lay a line
      if (this.inMenu()) { const hit = this.menuHit(); if (hit) this.menuHot = this.menuItems.findIndex((m) => m.id === hit); }
    });
    addEventListener('pointerup', (e) => {
      this.wallDrag = false;
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
          const b = this.bldAt(...this.groundAt(M.x + this.vx, M.y + this.vy));
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
      this.goalX += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * f * 0.5;
      if (!e.shiftKey) this.goalY += e.deltaY * f * 0.5;
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
      this.say(this.units[0], 'select');
    }
    if (id === 'plan') { const order = ['random', 'armour', 'air', 'siege', 'colossus', 'missile']; this.plan = order[(order.indexOf(this.plan) + 1) % order.length]; this.store('plan', this.plan); }
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
  intent(px: number, py: number): { kind: 'none' | 'launch' | 'rally' | 'enter' | 'capture' | 'takeover' | 'steal' | 'sabotage' | 'reveal' | 'build' | 'repair' | 'claim' | 'attack' | 'move'; site?: Bld } {
    const sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return { kind: this.selBld?.team !== 0 ? 'none' : this.selBld.type === 'silo' ? 'launch' : 'rally' };
    const [wx, gy] = this.groundAt(px, py), site = this.bldAt(wx, gy);
    if (site && CAPTURE[site.type] && sel.some((u) => !u.def.vehicle) && (site.team !== 0 || CAPTURE[site.type].garrison)) return { kind: site.team === 0 ? 'enter' : 'capture', site };
    if (site && site.max > 0 && this.hostile(0, site.team) && site.type !== 'wall' && site.dying < 0 && sel.some((u) => u.type === 'infiltrator')) return { kind: this.spyAct(site), site };
    if (site && site.max > 0 && this.hostile(0, site.team) && site.type !== 'wall' && sel.some((u) => u.type === 'engineer')) return { kind: 'takeover', site };
    if (site && site.team === 0 && site.max > 0 && (site.rise < 1 || site.hp < site.max) && sel.some((u) => u.type === 'builder')) return { kind: site.rise < 1 ? 'build' : 'repair', site };
    if (sel.some((u) => u.def.weapon) && this.enemyAt(px, py)) return { kind: 'attack' };
    const d = this.unitAt(px, py);
    if (d && d.team === 2 && d.def.weapon && this.sees(d.x, d.y) && sel.some((u) => !u.def.air)) return { kind: 'claim' };
    return { kind: 'move' };
  }
  command(px: number, py: number, amove = false, line?: { mx: number; my: number; fx: number; fy: number; width: number }) {
    let sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return;
    const [wx, gy] = line ? [line.mx, line.my] : this.groundAt(px, py), { kind, site } = line ? { kind: 'move', site: null } : this.intent(px, py);
    if (site && (kind === 'enter' || kind === 'capture')) { // infantry sent onto a capturable site go in and take it
      const foot = sel.filter((u) => !u.def.vehicle), dx = (site.cx + site.w / 2) * CELL, dy = (site.cy + site.h + 0.5) * CELL;
      for (const u of foot) { u.enter = site; u.goal = [dx, dy]; u.stuck = 0; u.face = null; u.path = findPath(this.terrain, u.x, u.y, dx, dy, false); }
      this.bark = { who: foot[0].def.name, line: site.team === 0 ? 'Moving in.' : 'Under new management, coming up.', t: 3 };
      audio.radio();
      return;
    }
    for (const u of sel) { u.enter = null; u.face = null; }
    const spies = sel.filter((u) => u.type === 'infiltrator');
    if (site && (kind === 'steal' || kind === 'sabotage' || kind === 'reveal')) { for (const u of spies) this.sendSpy(u, site); this.say(spies[0], 'move'); sel = sel.filter((u) => u.type !== 'infiltrator'); if (!sel.length) return; }
    else for (const u of spies) u.spy = null;
    const eng = sel.filter((u) => u.type === 'engineer');
    if (site && kind === 'takeover') { for (const u of eng) this.sendEngineer(u, site); this.say(eng[0], 'move'); sel = sel.filter((u) => u.type !== 'engineer'); if (!sel.length) return; }
    else for (const u of eng) u.grab = null;
    const crew = sel.filter((u) => u.type === 'builder');
    if (site && (kind === 'build' || kind === 'repair')) { for (const u of crew) this.assignSite(u, site); this.say(crew[0], 'move'); return; }
    for (const u of crew) u.buildSite = null;
    const enemy = amove || line ? null : this.enemyAt(px, py);
    if (enemy && sel.some((u) => u.def.weapon)) { // attack!
      for (const u of sel) if (u.def.weapon) { u.target = enemy; u.forced = true; u.amove = false; u.chase = 0; u.goal = null; u.path = []; }
      this.bark = { who: sel[0].def.name, line: ['Engaging.', 'Target acquired.', 'With pleasure.', 'They had it coming.'][(Math.random() * 4) | 0], t: 2.5 };
      audio.radio();
      return;
    }
    for (const u of sel) { u.forced = false; u.amove = amove; if (!amove) u.target = null; }
    // A group sent somewhere forms up facing the way it went (see formation()); a short shuffle just
    // keeps everyone's place, squeezed if spread out. Either way the group moves at its slowest
    // member's pace, so they arrive together.
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length, cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
    const far = Math.hypot(wx - cx, gy - cy), fx = line ? line.fx : (wx - cx) / far, fy = line ? line.fy : (gy - cy) / far;
    const spots = line ? this.formation(sel, wx, gy, fx, fy, line.width, true) : sel.length > 1 && far > 3 * CELL ? this.formation(sel, wx, gy, fx, fy) : null;
    const spread = Math.max(1, ...sel.map((u) => Math.hypot(u.x - cx, u.y - cy))), fit = Math.sqrt(sel.length) * 12 + 8;
    const squeeze = spread > fit ? fit / spread : 1, pace = Math.min(...sel.map((u) => u.def.speed));
    const queue = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); // Shift: add a waypoint
    const shared = sel.length > 8 ? this.sharedRoutes(cx, cy, wx, gy) : null;
    for (const u of sel) {
      const g: [number, number] = spots?.get(u) ?? [wx + (u.x - cx) * squeeze, gy + (u.y - cy) * squeeze];
      u.pace = sel.length > 1 ? pace : 0; u.face = spots ? Math.atan2(fy, fx) : null;
      if (queue && (u.goal || u.queue.length)) { u.queue.push(g); continue; }
      u.queue = []; u.goal = g; u.stuck = 0;
      u.path = u.def.air ? [g] : shared && u.def.crush !== 2 ? this.followRoute(u, shared[u.def.crush ? 1 : 0], cx, cy, g) : findPath(this.terrain, u.x, u.y, g[0], g[1], u.def.crush);
    }
    this.markers.push({ x: wx, y: gy, t: 0 });
    this.say(sel[0], 'move');
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
    if (id === 'repeat' && this.selBld && this.prod.queues[this.selBld.type]) {
      const k = this.selBld.type, on = (this.prod.repeat[k] = !this.prod.repeat[k]);
      this.bark = { who: this.selBld.name, line: on ? 'Repeating: finished units go back on the queue.' : 'Repeat off.', t: 2.5 }; audio.click();
      return;
    }
    if (id === 'link' && this.selBld) { // a road from this cut-off building back to your network
      const b = this.selBld, plan = this.linkPlan(b);
      if (!plan) { this.bark = { who: b.name, line: 'No way through for a road from here.', t: 2.5 }; return; }
      if (!this.linkByRoad(b)) { this.bark = { who: b.name, line: `A road home costs $${plan.fresh * DEF.road.cost}.`, t: 2.5 }; return; }
      this.bark = { who: b.name, line: 'Road laid. Linked to the network.', t: 2.5 }; audio.click();
      return;
    }
    if (id === 'sell' && this.selBld) { // press twice to sell, so a slip of the finger can't
      const b = this.selBld, d = DEF[b.type];
      if (!d || b.rise < 1 || b.dying >= 0) return;
      if (this.sellArm !== b || this.time - this.sellT > 2.5) { this.sellArm = b; this.sellT = this.time; this.bark = { who: b.name, line: `Sell for $${Math.round(d.cost * 0.5 * b.hp / b.max)}? Click SELL again to confirm.`, t: 2.5 }; return; }
      const refund = Math.round(d.cost * 0.5 * b.hp / b.max);
      this.prods[0].credits += refund;
      this.blds = this.blds.filter((o) => o !== b);
      for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
      this.selBld = null; this.sellArm = null;
      this.bark = { who: 'Command', line: `${b.name} sold for $${refund}.`, t: 2.5 }; audio.click();
      return;
    }
    const sel = this.selected();
    if (!sel.length) return;
    audio.click();
    for (const u of sel) {
      u.face = null;
      if (id === 'stop') { u.path = []; u.goal = null; u.queue = []; u.pace = 0; }
      if (id === 'scatter') {
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
        u.goal = [u.x + Math.cos(a) * d, u.y + Math.sin(a) * d];
        u.path = this.route(u, u.goal[0], u.goal[1]);
      }
    }
  }
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
    this.goalX += mx * sp; this.goalY += my * sp;
    this.goalX = Math.max(-8, Math.min(SW - this.worldW() + 8, this.goalX));
    this.goalY = Math.max(-16, Math.min(SH - this.FH + 8, this.goalY));
    this.vx += (this.goalX - this.vx) * (1 - Math.exp(-dt * 14));
    this.vy += (this.goalY - this.vy) * (1 - Math.exp(-dt * 14));
    if ((this.landT -= dt) <= 0) { this.landT = 1; this.updateLand(); }
    if (this.placing?.key !== 'road') this.roadFrom = null; // a road start only lasts while the road tool is in hand
    if ((this.cloakT -= dt) <= 0) { this.cloakT = 0.25; this.updateCloak(); }
    if ((this.banditT -= dt) <= 0) { this.banditT = 0.5; this.updateBandits(); }
    this.buildGrid(); this.pathBudget = 30;
    for (const u of this.units) this.move(u, dt);
    this.separate();
    this.updateTrees(dt);
    this.updateLife(dt);
    this.updateSites(dt);
    this.updateEconomy(dt);
    this.updateCombat(dt);
    this.updateMissiles(dt);
    for (const ai of this.ais) if (!this.out.has(ai.me)) ai.update(dt);
    if ((this.fogT -= dt) <= 0) { this.fogT = 0.25; this.updateFog(); }
    this.stats.time += dt;
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
    if ((this.claimT -= dt) <= 0) { this.claimT = 0.3; this.claimAndCollect(); }
    if ((this.crateT -= dt) <= 0) { this.crateT = 75; this.dropCrates(); }
    for (const p of this.pings) { p.t += dt; p.dmg *= Math.exp(-dt * 0.1); }
    this.pings = this.pings.filter((p) => p.t < 8); // eight quiet seconds and it's over
    this.markers = this.markers.filter((m) => m.t < 0.6);
  }

  move(u: Unit, dt: number) {
    const d = u.def, t = this.terrain;
    u.moving = false;
    if (u.type === 'harvester' && u.team !== 2) this.salvage(u, dt);
    if (u.grab) {
      const b = u.grab;
      if (!this.blds.includes(b) || b.dying >= 0 || !this.hostile(u.team, b.team)) u.grab = null;
      else if (this.reach(u.x, u.y, b) < 30) { this.takeOver(u, b); return; }
      else if (!u.path.length && !u.goal) this.sendEngineer(u, b);
    }
    if (u.spy) {
      const b = u.spy;
      if (!this.blds.includes(b) || b.dying >= 0 || !this.hostile(u.team, b.team)) u.spy = null;
      else if (this.reach(u.x, u.y, b) < 30) { this.infiltrate(u, b); return; }
      else if (!u.path.length && !u.goal) this.sendSpy(u, b);
    }
    if (u.buildSite) {
      const b = u.buildSite;
      if (!this.blds.includes(b) || (b.rise >= 1 && b.hp >= b.max) || b.dying >= 0) u.buildSite = null;
      else if (this.reach(u.x, u.y, b) < 36) { u.path = []; u.goal = null; }
      else if (!u.path.length && u.goal && u.stuck >= 3) this.assignSite(u, b);
      else if (!u.path.length && !u.goal) this.assignSite(u, b);
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
        if (this.pathBudget <= 0) return; // too many routes planned this frame: try again next frame
        if (u.stuck < 3) { u.stuck++; this.pathBudget--; u.path = findPath(t, u.x, u.y, u.goal[0], u.goal[1], d.crush); }
        else { u.goal = null; u.avoid = (u.avoid ?? 0) + 1; } // can't get there: give up rather than sit forever
      }
      return;
    }
    if ((u.progT += dt) > 3) { // three seconds with a route and no real progress: skip the stuck waypoint
      if (Math.hypot(u.x - u.px0, u.y - u.py0) < 6 && !u.target) { u.path.shift(); if (!u.path.length) { u.goal = null; u.pace = 0; } }
      u.progT = 0; u.px0 = u.x; u.py0 = u.y;
      if (!u.path.length) return;
    }
    const [px, py] = u.path[0];
    const dx = px - u.x, dy = py - u.y, dist = Math.hypot(dx, dy);
    // the last step: if someone is already standing on the spot, close enough counts
    // a waypoint someone else is already standing on counts as reached once you're close (otherwise two
    // units heading for the same spot shove each other round it forever)
    let crowded = false;
    if (dist < 18 && dist >= (u.path.length > 1 ? 6 : 1.5)) this.near(px, py, 24, (o) => (crowded = o !== u && Math.hypot(o.x - px, o.y - py) < o.def.radius + u.def.radius + 2));
    if (dist < (crowded ? 18 : u.path.length > 1 ? 6 : 1.5)) {
      u.path.shift();
      if (!u.path.length) {
        u.goal = null;
        const next = u.queue.shift();
        if (next) { u.goal = next; u.path = this.route(u, next[0], next[1]); } else u.pace = 0;
      }
      return;
    }
    const want = Math.atan2(dy, dx);
    let diff = angDiff(u.heading, want);
    const turn = d.turn * dt;
    u.heading += Math.max(-turn, Math.min(turn, diff));
    diff = angDiff(u.heading, want);
    const go = d.vehicle ? Math.max(0, Math.cos(diff)) ** 3 : 1;
    const ground = d.air ? -1 : t.type[t.idx(t.cellOf(u.x), t.cellOf(u.y))];
    const road = ground === T.PAVED ? (d.vehicle ? 1.6 : 1.2) : ground === T.ROAD || ground === T.BRIDGE ? (d.vehicle ? 1.3 : 1.1) : 1; // roads are quicker
    const step = Math.min(dist, (u.pace || d.speed) * road * (d.vehicle && u.team !== 2 && this.upgrades[u.team].has('engines') ? 1.15 : 1) * dt * go);
    const nx = u.x + Math.cos(u.heading) * step, ny = u.y + Math.sin(u.heading) * step;
    const ax = t.cellOf(u.x), ay = t.cellOf(u.y), bx = t.cellOf(nx), by = t.cellOf(ny);
    if (d.air || (ax === bx && ay === by) || t.step(ax, ay, bx, by, d.crush)) { u.x = Math.max(0, Math.min(MAPSIZE - 1, nx)); u.y = Math.max(0, Math.min(MAPSIZE - 1, ny)); }
    else { if (this.pathBudget-- > 0) { u.path = findPath(t, u.x, u.y, u.goal?.[0] ?? px, u.goal?.[1] ?? py, d.crush); u.stuck++; } return; }
    if (!u.target) u.tHead = u.heading;
    u.moving = step > 0.01;
    u.bob += dt * 10;
    if (d.track && u.moving) {
      u.trackAcc += step;
      while (u.trackAcc > 1) { u.trackAcc -= 1; t.track(u.x - Math.cos(u.heading) * 8, u.y - Math.sin(u.heading) * 8, u.heading, d.track); }
    }
    if (u.enter && Math.hypot(u.x - (u.enter.cx + u.enter.w / 2) * CELL, u.y - (u.enter.cy + u.enter.h / 2) * CELL) < Math.max(u.enter.w, u.enter.h) * CELL * 0.5 + 20) this.enter(u, u.enter);
    if (d.crush && u.moving) this.crush(u);
    if ((u.type === 'juggernaut' || u.type === 'colossus') && u.moving) { // too big to stop for soldiers (and the Colossus for vehicles)
      const under: Unit[] = [];
      this.near(u.x, u.y, 30, (o) => { if (!o.def.air && o.type !== 'colossus' && (!o.def.vehicle || u.type === 'colossus') && this.hostile(u.team, o.team) && Math.hypot(o.x - u.x, o.y - u.y) < u.def.radius) under.push(o); });
      for (const o of under) { if (o.def.vehicle) this.damage(o, 500 * dt, u.team, u); else this.killUnit(o); }
    }
    if (d.crush === 2 && u.moving && Math.random() < dt * 12 && t.type[t.idx(t.cellOf(u.x), t.cellOf(u.y))] === T.WATER) { const [sx, sy] = this.scr(u); this.puffs.push({ x: sx + (Math.random() - 0.5) * 12, y: sy - 1, vx: (Math.random() - 0.5) * 10, vy: -6, t: 0, life: 0.5, c: '#d8e8f0', s: 1 }); } // spray
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
    for (const a of this.units) this.near(a.x, a.y, 24, (b) => {
      if (b.id <= a.id || !!a.def.air !== !!b.def.air) return;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.def.radius + b.def.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) return;
      const d = Math.sqrt(d2), push = (min - d) * 0.25;
      const wa = a.moving && !b.moving ? 0.3 : b.moving && !a.moving ? 0.7 : 0.5;
      this.nudge(a, (-dx / d) * push * wa * 2, (-dy / d) * push * wa * 2);
      this.nudge(b, (dx / d) * push * (1 - wa) * 2, (dy / d) * push * (1 - wa) * 2);
    });
  }
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
    this.drawGlints(vx, vy);
    if (this.state !== 'title') this.drawBorders(vx, vy);
    const items: { y: number; draw: () => void; shadow: () => void }[] = [];
    const sprite = (s: Sprite, x: number, y: number) => ctx.drawImage(s.img, Math.round(x - s.ax), Math.round(y - s.ay));
    const sctx = this.sctx;
    const shadow = (s: Sprite, x: number, y: number) => sctx.drawImage(s.shadow, Math.round(x - s.ax), Math.round(y - s.ay));
    // the view covers a turned rectangle of ground: walk the ground rows it touches
    let gy0 = 1e9, gy1 = -1e9;
    for (const [cx, cy] of [[vx - 40, vy - 40], [vx + this.FW + 40, vy - 40], [vx - 40, vy + this.FH + 60], [vx + this.FW + 40, vy + this.FH + 60]]) { const g = toGround(cx, cy)[1]; gy0 = Math.min(gy0, g); gy1 = Math.max(gy1, g); }
    const r0 = Math.max(0, Math.floor(gy0 / CELL)), r1 = Math.min(N - 1, Math.floor(gy1 / CELL));
    for (let r = r0; r <= r1; r++) for (const tr of this.trees[r]) {
      const [tx, ty] = this.scr(tr), x = tx - vx, y = ty - vy;
      if (x < -30 || x > this.FW + 30 || y < -60 || y > this.FH + 40) continue;
      const look = this.treeLooks[tr.v];
      const s = tr.fall < 0 ? look.stand : look.fall[tr.dir][Math.min(2, Math.floor(tr.fall / 0.17))];
      items.push({ y: y + vy, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y) });
    }
    for (const m of this.mountains) { const x = m.x - vx, y = m.y - vy; if (x > this.FW || y > this.FH || x + m.img.width < 0 || y + m.img.height < 0) continue; items.push({ y: m.sortY, shadow: () => {}, draw: () => ctx.drawImage(m.img, x, y) }); }
    for (const b of this.blds) {
      if (!this.friendly(b.team) && b.team !== 2 && !b.seen) continue; // never spotted: not on your map yet
      const s = this.looks[b.type + b.team].body[0];
      const [bx, by] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }), x = bx - vx, y = by - vy;
      if (x < -120 || x > this.FW + 120 || y < -160 || y > this.FH + 100) continue;
      const front = toScreen((b.cx + b.w) * CELL, (b.cy + b.h) * CELL)[1]; // its nearest corner decides draw order
      items.push({ y: front - 4, shadow: () => { if (b.rise >= 1) shadow(s, x, y); }, draw: () => {
        if (b.rise < 1) { // under construction: built for real, from the slab up (see constructionStage)
          sprite(this.constructionStage(b, Math.min(4, Math.floor(b.rise * 5))), x, y);
          if (b === this.selBld) this.outline(b, vx, vy);
          return;
        }
        sprite(s, x, y);
        const tl = this.looks[b.type + b.team].turret;
        if (tl) { const d = this.looks[b.type + b.team].def, at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2]; sprite(facing(tl, b.tHead + YAW), x + YC * ox - YS * oz, y + YS * ox + YC * oz - at[1]); }
        if (b === this.selBld) this.outline(b, vx, vy);
        if (CAPTURE[b.type]) this.drawFlag(b, vx, vy);
        if (b.team === 0 && b.type !== 'wall' && !this.territory.linked.has(b)) this.drawCut(Math.round(x), Math.round(y - s.ay) - 3);
        if (b.type === 'derrick') { // gas flare flickering on its stack
          const dx = -16, dz = 16, fx = Math.round(x + YC * dx - YS * dz), fy = Math.round(y + YS * dx + YC * dz - 23), f = Math.floor(this.time * 12);
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(fx, fy - 1 - (f % 2), 1, 2);
          ctx.fillStyle = '#f07828'; ctx.fillRect(fx - (f % 3 === 0 ? 1 : 0), fy - 3 - (f % 2), 1, 2); ctx.fillRect(fx + (f % 3 === 1 ? 1 : 0), fy - 2, 1, 1);
        }
        // warning beacon on top of the signal tower blinks
        if (b.type === 'fieldCommand' && Math.sin(this.time * 3.5 + b.team) > 0.2) {
          const dx = 21, dz = -18, lx = x + YC * dx - YS * dz, ly = y + YS * dx + YC * dz - 52;
          ctx.fillStyle = '#ff5a3a'; ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
          ctx.fillStyle = 'rgba(255,90,58,0.35)'; ctx.fillRect(Math.round(lx) - 1, Math.round(ly), 3, 1); ctx.fillRect(Math.round(lx), Math.round(ly) - 1, 1, 3);
        }
      } });
    }
    for (const u of this.units) {
      if (!this.spot(u)) continue; // hidden in the fog, or concealed
      const look = this.looks[u.type + u.team];
      const [ux, uy] = this.scr(u), x = ux - vx, y = uy - vy - (!u.def.vehicle && u.moving ? Math.round(Math.abs(Math.sin(u.bob))) : 0);
      if (x < -30 || x > this.FW + 30 || y < -30 || y > this.FH + 30) continue;
      const body = facing(look.body, u.heading + YAW); // headings are on the ground; the map is turned on screen
      const air = !!u.def.air, gy = air ? toScreen(u.x, u.y)[1] - vy : y; // aircraft cast their shadow on the ground far below
      items.push({
        y: toScreen(u.x, u.y)[1] + (air ? 4000 : 0), shadow: () => shadow(body, x, gy),
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
      items.push({ y: ay, draw: () => sprite(s, x, y), shadow: () => shadow(s, x, y) });
    }
    items.sort((a, b) => a.y - b.y);
    // all shadows go on one layer first, then down once, so overlapping shadows never stack up darker
    if (this.shadowLayer.width !== this.FW || this.shadowLayer.height !== this.FH) { this.shadowLayer.width = this.FW; this.shadowLayer.height = this.FH; }
    sctx.clearRect(0, 0, this.FW, this.FH);
    for (const it of items) it.shadow();
    ctx.globalAlpha = 0.38; ctx.drawImage(this.shadowLayer, 0, 0); ctx.globalAlpha = 1;
    for (const it of items) it.draw();
    for (const tr of this.tracers) if (this.seenAt(tr.x1, tr.y1)) drawTracer(ctx, tr, vx, vy);
    for (const s of this.shells) if (s.t >= 0 && this.seenAt(s.tx, s.ty)) drawShell(ctx, s, vx, vy); // (bombs in a stick wait their turn)
    for (const b of this.blasts) if (this.seenAt(b.x, b.y)) drawBlast(ctx, b, vx, vy);
    this.drawDamage(vx, vy);
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
    if (this.state !== 'title') this.drawFog(vx, vy);
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
    // selection brackets and health pips
    for (const u of this.units) {
      if (!u.selected) continue;
      const [ux, uy] = this.scr(u), x = Math.round(ux - vx), y = Math.round(uy - vy), r = u.def.radius + 2, top = y - (u.def.vehicle ? r + 6 : 11), bot = y + Math.round(r / 2) + 2;
      ctx.fillStyle = C.cream;
      for (const [cx, cy, sx, sy] of [[x - r, top, 1, 1], [x + r, top, -1, 1], [x - r, bot, 1, -1], [x + r, bot, -1, -1]]) { ctx.fillRect(cx - (sx < 0 ? 2 : 0), cy, 3, 1); ctx.fillRect(cx, cy - (sy < 0 ? 2 : 0), 1, 3); }
      bar(ctx, x - r + 1, top - 4, r * 2 - 1, u.hp / u.def.hp);
      for (let k = 0; k < u.rank; k++) { ctx.fillStyle = C.ink; ctx.fillRect(x + r + 2, top - 5 + k * 3, 3, 2); ctx.fillStyle = C.gold; ctx.fillRect(x + r + 2, top - 5 + k * 3, 2, 1); } // rank pips
      if (u.type === 'harvester') { ctx.fillStyle = C.ink; ctx.fillRect(x - r, top - 1, r * 2 + 1, 3); ctx.fillStyle = '#c87a3a'; ctx.fillRect(x - r + 1, top, Math.round((r * 2 - 1) * (u.cargo / SCRAP_LOAD)), 1); }
    }
    // drag box: dotted pixel rectangle
    if (M.down && M.drag && this.state === 'play') {
      const x0 = Math.round(Math.min(M.sx, M.x)), x1 = Math.round(Math.max(M.sx, M.x)), y0 = Math.round(Math.min(M.sy, M.y)), y1 = Math.round(Math.max(M.sy, M.y));
      ctx.fillStyle = C.ok;
      for (let x = x0; x <= x1; x += 2) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x, y1, 1, 1); }
      for (let y = y0; y <= y1; y += 2) { ctx.fillRect(x0, y, 1, 1); ctx.fillRect(x1, y, 1, 1); }
    }
    // shield domes: a faint ring of light that flares where it's struck
    for (const b of this.blds) {
      if (b.type !== 'shield' || b.rise < 1 || b.dying >= 0 || !(b.shieldHp! > 0) || b.shieldDown || (!this.friendly(b.team) && !b.seen)) continue;
      const [cx, cy] = this.scr({ x: (b.cx + 1) * CELL, y: (b.cy + 1) * CELL }), R = SHIELD_R * CELL, hit = Math.max(0, 1 - (this.time - (b.lastHit ?? -9)) * 2);
      if (cx - vx < -R || cx - vx > this.FW + R || cy - vy < -R * 1.5 || cy - vy > this.FH + R) continue;
      const strength = b.shieldHp! / SHIELD_HP;
      ctx.fillStyle = `rgba(150,230,255,${0.18 + strength * 0.25 + hit * 0.5})`;
      for (let a = 0; a < 360; a += 3) { const r = (a * Math.PI) / 180; ctx.fillRect(Math.round(cx - vx + Math.cos(r) * R), Math.round(cy - vy + Math.sin(r) * R * 0.75 - Math.max(0, -Math.sin(r)) * R * 0.25), 1, 1); }
      ctx.fillStyle = `rgba(150,230,255,${0.06 + hit * 0.18})`;
      for (let k = 1; k <= 3; k++) for (let a = 180; a < 360; a += 5) { const r = (a * Math.PI) / 180, rr = R * (1 - k * 0.22); ctx.fillRect(Math.round(cx - vx + Math.cos(r) * rr), Math.round(cy - vy + Math.sin(r) * rr * 0.75 - k * R * 0.12), 1, 1); }
    }
    for (const c of this.crates) { // a little wooden crate with a gold band
      if (!this.sees(c.x, c.y)) continue;
      const [cx, cy] = this.scr(c), x = Math.round(cx - vx), y = Math.round(cy - vy) - 5;
      if (x < -8 || y < -8 || x > this.FW + 8 || y > this.FH + 8) continue;
      ctx.fillStyle = C.ink; ctx.fillRect(x - 4, y - 1, 9, 7); ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x - 3, y, 7, 5); ctx.fillStyle = '#b08a4a'; ctx.fillRect(x - 3, y, 7, 1);
      ctx.fillStyle = Math.floor(this.time * 3) % 2 ? C.gold : '#d0a030'; ctx.fillRect(x, y, 1, 5); ctx.fillRect(x - 3, y + 2, 7, 1);
    }
    for (const m of this.missiles) { const [mx, my] = this.missilePos(m); ctx.fillStyle = '#fff8d0'; ctx.fillRect(Math.round(mx - vx) - 1, Math.round(my - vy) - 1, 3, 3); ctx.fillStyle = '#ff8a30'; ctx.fillRect(Math.round(mx - vx), Math.round(my - vy) + 2, 1, 2); }
    for (const u of this.units) if (u.team === 0 && u.buildSite && u.buildSite.rise < 1) { // the trip to a far site, dotted
      const b = u.buildSite, [ax, ay] = this.scr(u), [bx, by] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }), n = Math.hypot(bx - ax, by - ay);
      if (n < 6 * CELL) continue;
      for (let k = (this.time * 12) % 7; k < n; k += 7) { const px = Math.round(ax + ((bx - ax) * k) / n - vx), py = Math.round(ay + ((by - ay) * k) / n - vy); ctx.fillStyle = C.ink; ctx.fillRect(px - 1, py - 1, 4, 4); ctx.fillStyle = C.gold; ctx.fillRect(px, py, 2, 2); }
    }
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
    let cursorKind: 'arrow' | 'move' | 'select' | 'busy' | 'attack' | 'amove' = 'arrow', hoverName = '', verb = '';
    if (M.in) {
      const over = this.state === 'play' && this.inView(M.y) ? this.unitAt(M.x + vx, M.y + vy) : null;
      this.hoverBld = this.state === 'play' && this.inView(M.y) ? this.bldAt(...this.groundAt(M.x + vx, M.y + vy)) : null;
      const armed = this.selected().some((u) => u.def.weapon);
      const kind = this.state !== 'play' || !this.inView(M.y) ? 'arrow' : this.attackMode ? 'amove' : over && over.team === 0 ? 'select' : armed && this.enemyAt(M.x + vx, M.y + vy) ? 'attack' : this.selected().length ? 'move' : 'arrow';
      cursorKind = kind;
      // name of whatever is under the cursor, shown beside it
      const hb = this.hoverBld, seenU = over && this.spot(over);
      // the less obvious things a right-click will do get a word in gold beside the cursor
      if (this.state === 'play' && this.inView(M.y) && !M.drag && !this.placing && kind !== 'select') {
        const it = this.attackMode ? 'amove' : this.intent(M.x + vx, M.y + vy).kind, silo = this.selBld;
        verb = it === 'launch' && silo ? ((silo.timer ?? 0) >= MISSILE_TIME ? 'LAUNCH' : `CHARGING ${Math.floor(((silo.timer ?? 0) / MISSILE_TIME) * 100)}%`)
          : ({ amove: 'ATTACK-MOVE', rally: 'SET RALLY POINT', enter: 'MOVE IN', capture: 'CAPTURE', takeover: 'TAKE OVER', steal: 'STEAL CASH', sabotage: 'BLACK OUT POWER', reveal: 'REVEAL THEIR LAND', build: 'BUILD', repair: 'REPAIR', claim: 'CLAIM' } as Record<string, string>)[it] ?? '';
      }
      hoverName = M.drag ? '' : seenU ? over!.def.name + this.tag(over!.team) : hb && (hb.team === 0 || hb.seen || hb.team === 2) ? (CAPTURE[hb.type]?.name ?? hb.name) + this.tag(hb.team) : '';
    }
    // the interface layer: side panel, caption, menus and the cursor, at a fixed pixel size
    this.hctx.clearRect(0, 0, this.HW, this.HH);
    this.withHud(() => {
      if (this.state === 'title') this.drawTitle();
      else { if (this.k === 1) this.drawIcons(vx, vy); this.drawPings(vx, vy); this.drawSidebar(); this.drawCaption(); if (this.hints && this.state === 'play') this.drawGoals(); }
      if (this.state === 'paused') this.drawPause();
      if (this.state === 'won' || this.state === 'lost') this.drawEnd();
      if (M.in && (hoverName || verb) && this.state === 'play' && M.x < this.FW - SB) {
        const l = hoverName.toUpperCase(), gap = l && verb ? 6 : 0, w = textWidth(l) + gap + textWidth(verb) + 6;
        this.ctx.fillStyle = 'rgba(13,12,11,0.8)'; this.ctx.fillRect(M.x + 10, M.y + 12, w, 10);
        text(this.ctx, l, M.x + 13, M.y + 14, hoverName.includes('ENEMY') ? C.bad : C.cream);
        text(this.ctx, verb, M.x + 13 + textWidth(l) + gap, M.y + 14, C.gold);
      }
      if (M.in) cursor(this.ctx, cursorKind, M.x, M.y, this.time);
    });
  }

  // ---- combat ----
  isUnit(t: Unit | Bld): t is Unit { return 'def' in t; }
  alive(t: Unit | Bld) { return this.isUnit(t) ? this.units.includes(t) : this.blds.includes(t) && t.dying < 0; }
  posOf(t: Unit | Bld): [number, number] { return this.isUnit(t) ? [t.x, t.y] : [(t.cx + t.w / 2) * CELL, (t.cy + t.h / 2) * CELL]; }
  armourOf(t: Unit | Bld): Armour { return this.isUnit(t) ? (t.def.air ? 'air' : t.def.vehicle ? 'veh' : 'inf') : 'bld'; }
  // can this weapon hit that target at all? (cannons can't hit aircraft; flak hits nothing else)
  canHit(w: Weapon, t: Unit | Bld) { return this.isUnit(t) && t.def.air ? (w.dmg.air ?? 0) > 0 : !w.airOnly && (!w.footOnly || (this.isUnit(t) && !t.def.vehicle)); }
  // the sides in this game, who is on whose team, and which start each side gets
  get sides() { return this.players === 2 ? [0, 1] : this.players === 3 ? [0, 1, 3] : [0, 1, 3, 4]; }
  ally = [0, 1, 2, 3, 4, 5];
  upgrades = [0, 1, 2, 3, 4, 5].map(() => new Set<string>()); // what each side has researched // ally[t]: t's team (in 2-against-2, you and gold share one)
  baseOf(team: number) { return this.players === 2 ? team : ({ 0: 0, 1: 2, 3: 1, 4: 3 } as Record<number, number>)[team] ?? 0; }
  tag(t: number) { return t === BANDIT ? ' (BANDITS)' : this.hostile(0, t) ? ' (ENEMY)' : t !== 0 && t !== 2 ? ' (ALLY)' : ''; }
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
    const b = this.bldAt(...this.groundAt(px, py));
    return b && b.max > 0 && this.hostile(b.team, 0) && b.dying < 0 && b.seen ? b : null;
  }
  nearestEnemy(team: number, x: number, y: number, range: number, min = 0, w?: Weapon): Unit | Bld | null {
    let best: Unit | Bld | null = null, bd = range;
    const far = range > 150; // long guns: only what that side can actually see (the computer plays by your rules)
    this.near(x, y, range + 12, (u) => { if (this.hostile(team, u.team) && !this.hid(u, team) && (!w || this.canHit(w, u)) && (this.friendly(team) ? this.sees(u.x, u.y) : !far || this.seenBy(team, u.x, u.y))) { const d = this.reach(x, y, u); if (d < bd && d >= min) { bd = d; best = u; } } });
    if (best || w?.airOnly) return best; // soldiers and vehicles first, buildings after (flak never shoots buildings)
    const S = CELL * 4, r = range + 3 * CELL, x0 = Math.max(0, Math.floor((x - r) / S)), x1 = Math.min(GB - 1, Math.floor((x + r) / S)), y0 = Math.max(0, Math.floor((y - r) / S)), y1 = Math.min(GB - 1, Math.floor((y + r) / S));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (const b of this.bgrid[gy * GB + gx]) if (b.dying < 0 && this.hostile(team, b.team)) { const d = this.reach(x, y, b); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // whether a side has eyes on a spot (yours uses the fog; the computer's is worked out the same way)
  seenBy(team: number, x: number, y: number) {
    let seen = false;
    for (const r of this.reveals) if (r.until > this.time && this.ally[r.team] === this.ally[team]) { const t = this.terrain, o = this.territory.owner[t.idx(Math.max(0, Math.min(N - 1, t.cellOf(x))), Math.max(0, Math.min(N - 1, t.cellOf(y))))]; if (o === r.victim) return true; }
    this.near(x, y, 9 * CELL, (o) => (seen = o.team !== 2 && this.ally[o.team] === this.ally[team] && Math.hypot(o.x - x, o.y - y) < this.sightOf(o.type) * CELL * (this.upgrades[o.team].has('optics') ? 1.3 : 1)));
    if (seen) return true;
    for (const b of this.blds) { const dx = (b.cx + b.w / 2) * CELL - x, dy = (b.cy + b.h / 2) * CELL - y; if (dx > 25 * CELL || dx < -25 * CELL || dy > 25 * CELL || dy < -25 * CELL) continue; if (b.team !== 2 && this.ally[b.team] === this.ally[team] && b.dying < 0 && Math.hypot(dx, dy) < this.sightOf(b.type, b.garrison) * CELL) return true; } // nothing sees further than 24 squares
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
      b.reload -= dt * (b.team === 2 || b.team === BANDIT ? 1 : this.powerEff(b.team)) * (wk === 'garrison' ? b.garrison : 1); // short of power, guns load slower
      if (!b.target || !this.alive(b.target) || this.reach(bx, by, b.target) > range) b.target = this.nearestEnemy(b.team, bx, by, range, w.min ?? 0, w);
      if (!b.target) continue;
      const [tx, ty] = this.posOf(b.target), want = Math.atan2(ty - by, tx - bx);
      const spin = b.type === 'battery' ? 0.6 : b.type === 'emplacement' ? 1.8 : b.type === 'flakTower' ? 4 : b.type === 'railTower' ? 1.2 : 0;
      if (spin) b.tHead += Math.max(-dt * spin, Math.min(dt * spin, angDiff(b.tHead, want))); else b.tHead = want;
      if (b.reload <= 0 && Math.abs(angDiff(b.tHead, want)) < 0.12) {
        b.reload = w.reload * (0.9 + Math.random() * 0.2);
        const [sx, sy] = this.scr({ x: bx, y: by }), h = ({ emplacement: 9, guardTower: 21, watchtower: 30, flakTower: 20, battery: 12, railTower: 19 } as Record<string, number>)[b.type] ?? 6;
        const a = b.tHead + YAW, ml = ({ emplacement: 22, battery: 44, flakTower: 10, railTower: 26 } as Record<string, number>)[b.type] ?? 6;
        this.shoot(sx + Math.cos(a) * ml, sy + Math.sin(a) * ml - h, b.target, w, b.team, b);
      }
    }
    // shells in flight
    for (const sh of this.shells) sh.t += dt;
    for (const sh of this.shells.filter((x) => x.t >= x.life)) this.explode(sh.gx, sh.gy, sh.w, sh.team, sh.src, sh.alt);
    this.shells = this.shells.filter((x) => x.t < x.life);
    for (const tr of this.tracers) tr.t += dt;
    this.tracers = this.tracers.filter((x) => x.t < 0.09);
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((x) => x.t < 0.55);
    // fires on wrecks and ruins: smoke and the odd flame
    for (const f of this.fires) {
      f.t -= dt;
      if (Math.random() < dt * 8) this.puffs.push({ x: f.x + (Math.random() - 0.5) * f.s, y: f.y - 2, vx: 1 + Math.random() * 2, vy: -6 - Math.random() * 4, t: 0, life: 1.6 + Math.random(), c: Math.random() < 0.6 ? '#2a2826' : '#4a4642', s: 2 });
      if (Math.random() < dt * 10) this.puffs.push({ x: f.x + (Math.random() - 0.5) * f.s * 0.6, y: f.y - 1, vx: 0, vy: -8, t: 0, life: 0.3, c: Math.random() < 0.5 ? '#ffb040' : '#e05a20', s: 1 });
    }
    this.fires = this.fires.filter((f) => f.t > 0);
    // workshops patch up their side's vehicles parked close by, hospitals their infantry (slower on low power)
    for (const b of this.blds) {
      if ((b.type !== 'workshop' && b.type !== 'hospital' && b.type !== 'repairYard') || b.rise < 1 || b.dying >= 0 || b.team === 2) continue;
      const yard = b.type === 'repairYard', pw = this.powers[b.team], rate = (yard ? 15 : b.type === 'workshop' ? 30 : 8) * (yard ? 1 : this.powerEff(b.team)), vehicles = b.type === 'workshop';
      const [bx, by] = this.posOf(b), hits: Unit[] = [];
      this.near(bx, by, 120, (u) => { if (u.team === b.team && !u.def.air && (yard || u.def.vehicle === vehicles) && u.hp < u.def.hp && this.reach(u.x, u.y, b) < (yard ? 96 : 60)) hits.push(u); });
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
    if (u.def.weapon2) this.fight2(u, dt);
    if (u.rank && u.hp < u.def.hp) u.hp = Math.min(u.def.hp, u.hp + Math.min(u.def.hp * 0.004, 2) * u.rank * dt); // veterans patch themselves up
    const w = u.def.weapon ? WEAPONS[u.def.weapon] : null;
    if (!w) return;
    const turret = !!this.looks[u.type + u.team]?.turret, moving = !!u.goal && !u.amove && !u.forced; // moving: on a plain move order
    u.reload -= dt;
    if (u.target && !this.alive(u.target)) { u.target = null; u.forced = false; }
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
      if (u.forced || (close && !u.goal)) { if ((u.chase -= dt) <= 0) { u.chase = 1; u.path = this.route(u, tx, ty); } }
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
    if (w.stick) { // a stick of bombs falling in a line across the target
      const a = this.isUnit(src) ? src.heading : 0;
      for (let k = 0; k < w.stick; k++) {
        const o = (k - (w.stick - 1) / 2) * 16, bx = gx + Math.cos(a) * o, by = gy + Math.sin(a) * o, [es, esy] = this.scr({ x: bx, y: by });
        this.shells.push({ x: 0, y: 0, sx: mx + (Math.random() - 0.5) * 6, sy: my, tx: es, ty: esy - 2, t: -k * 0.12, life: 0.7, w, team, arc: 0, gx: bx, gy: by, src });
      }
      audio.cannon(gx, gy);
      return;
    }
    if (w.beam) for (let k = 0, n = Math.hypot(ts - mx, ty - my) / 3; k < n; k++) this.puffs.push({ x: mx + ((ts - mx) * k) / n, y: my + ((ty - my) * k) / n, vx: 0, vy: 0, t: 0, life: 0.18, c: k % 3 ? '#bff4ff' : '#ffffff', s: 1 });
    if (w.kind === 'bullet') {
      this.tracers.push({ x0: mx, y0: my, x1: ts + (Math.random() - 0.5) * 4, y1: ty + (Math.random() - 0.5) * 3, t: 0 });
      this.damage(t, (w.dmg[this.armourOf(t)] ?? 0) * (0.8 + Math.random() * 0.4), team, src);
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

  // the active enemy shield (if any) covering a point
  shieldAt(gx: number, gy: number, team: number) {
    for (const b of this.blds) if (b.type === 'shield' && b.rise >= 1 && b.dying < 0 && (b.shieldHp ?? 0) > 0 && !b.shieldDown && this.hostile(team, b.team) && Math.hypot((b.cx + 1) * CELL - gx, (b.cy + 1) * CELL - gy) < SHIELD_R * CELL) return b;
    return null;
  }
  explode(gx: number, gy: number, w: Weapon, team: number, src: Unit | Bld, alt = 0) {
    const shield = alt ? null : this.shieldAt(gx, gy, team);
    if (shield) { // the dome takes it: a flash on the shield, nothing below is hurt
      shield.shieldHp! -= Math.max(w.dmg.bld, w.dmg.veh);
      shield.lastHit = this.time;
      if (shield.shieldHp! <= 0) { shield.shieldHp = 0; shield.shieldDown = 12; if (shield.team === 0) this.warn('Shield overloaded!', this.posOf(shield)); }
      const [hx, hy] = this.scr({ x: gx, y: gy });
      for (let i = 0; i < 5; i++) this.puffs.push({ x: hx + (Math.random() - 0.5) * 10, y: hy - 14 - Math.random() * 10, vx: (Math.random() - 0.5) * 20, vy: -6, t: 0, life: 0.35, c: Math.random() < 0.5 ? '#9ae8ff' : '#e8fbff', s: 1 });
      return;
    }
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
    for (const b of this.blds) if (b.max > 0 && this.hostile(team, b.team) && this.reach(gx, gy, b) < r * 0.5) this.damage(b, w.dmg.bld, team, src);
    if (w.clears) for (const b of this.blds) if (CAPTURE[b.type] && b.garrison > 0 && this.hostile(team, b.team) && this.reach(gx, gy, b) < r && Math.random() < 0.4) b.garrison--; // a grenade through the window
    this.scorch(sx, sy, r * 0.6);
    this.knockTrees(gx, gy, r);
    for (let i = 0; i < 8; i++) this.puffs.push({ x: sx, y: sy - 2, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, t: 0, life: 0.6 + Math.random() * 0.4, c: Math.random() < 0.5 ? '#5a4a36' : '#3a3026', s: 1, g: 90 }); // flung earth
    for (let i = 0; i < 4; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * r, y: sy - 4, vx: (Math.random() - 0.5) * 6, vy: -5 - Math.random() * 5, t: 0, life: 1.5 + Math.random(), c: '#3a3634', s: 2 });
  }

  damage(t: Unit | Bld, amt: number, team: number, src: Unit | Bld) {
    if (!this.alive(t) || (!this.isUnit(t) && t.max <= 0)) return;
    if (src && this.isUnit(src)) amt *= 1 + src.rank * 0.12; // veterans hit harder
    if (src && src.team !== 2 && this.upgrades[src.team].has('shellsUp')) amt *= 1.15;
    if (this.isUnit(t) && t.def.vehicle && t.team !== 2 && this.upgrades[t.team].has('armourUp')) amt *= 0.8;
    if (this.friendly(t.team) && this.hostile(team, t.team)) this.ping(...this.posOf(t), amt);
    const victim = this.ais.find((a) => a.me === t.team); if (victim) { victim.grudge[team] = (victim.grudge[team] ?? 0) + amt; if (this.isUnit(src) && src.def.air) victim.airHit(); } // remembered when it picks a target; air raids noticed at once
    if (!this.isUnit(t) && this.fort.has(t)) amt *= 0.75; // a fortified line shrugs off a quarter
    if (this.isUnit(t)) t.hitAt = this.time;
    t.hp -= amt;
    if (t.hp <= 0 && src && this.isUnit(src) && this.isUnit(t)) { const before = src.rank; src.kills++; if (src.rank > before && src.team === 0) { this.bark = { who: src.def.name, line: ['Promoted!', 'Veteran now.', 'Elite!'][src.rank - 1], t: 2 }; } }
    if (t.team === 0 && this.time - this.alertT > 25) { // tell the player when they're hit, now and then
      this.alertT = this.time;
      this.warn(this.isUnit(t) ? 'Our units are under attack!' : 'Our base is under attack!', this.posOf(t));
    }
    if (this.isUnit(t)) {
      if (!t.target && t.def.weapon && this.alive(src) && (!t.goal || t.amove)) t.target = src; // shoot back, unless you ordered it away
      if (t.hp <= 0) this.killUnit(t);
    } else if (t.hp <= 0 && t.dying < 0) {
      t.dying = 0; t.hp = 0;
      if (t === this.selBld) this.selBld = null;
      this.bark = { who: t.team === 0 ? 'Base' : 'Field report', line: t.team === 0 ? `We've lost the ${t.name}!` : `Enemy ${t.name} destroyed.`, t: 3 };
    }
  }

  killUnit(u: Unit) {
    this.units = this.units.filter((o) => o !== u);
    this.stats.lost[u.team === 2 ? 0 : u.team]++;
    for (const g of this.groups) if (g) { const i = g.indexOf(u); if (i >= 0) g.splice(i, 1); }
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
  // ---- strategic missiles ----
  missiles: { team: number; sx: number; sy: number; tx: number; ty: number; t: number; dur: number; done?: boolean }[] = [];
  launch(b: Bld, tx: number, ty: number) {
    if ((b.timer ?? 0) < MISSILE_TIME) return false;
    b.timer = 0;
    const sx = (b.cx + 1) * CELL, sy = (b.cy + 1) * CELL;
    this.missiles.push({ team: b.team, sx, sy, tx, ty, t: 0, dur: Math.max(6, Math.hypot(tx - sx, ty - sy) / 320) });
    audio.explosion(sx, sy, 1.6);
    if (this.hostile(0, b.team)) this.warn('MISSILE LAUNCH DETECTED!', [tx, ty]);
    else this.bark = { who: 'Missile Silo', line: 'Missile away.', t: 3 };
    return true;
  }
  updateMissiles(dt: number) {
    // silos charge (slower on low power), interceptors reload, shields recover
    for (const b of this.blds) {
      if (b.rise < 1 || b.dying >= 0 || b.team === 2) continue;
      const rate = (b.team === BANDIT ? 1 : this.powerEff(b.team)) * (b.team !== 0 ? this.aiRate : 1);
      if (b.type === 'silo' && (b.timer ?? 0) < MISSILE_TIME) {
        const pay = (MISSILE_COST / MISSILE_TIME) * dt * rate;
        if (this.prods[b.team].credits >= pay) { this.prods[b.team].credits -= pay; b.timer = (b.timer ?? 0) + dt * rate; if (b.timer >= MISSILE_TIME && b.team === 0) this.bark = { who: 'Missile Silo', line: 'Missile ready. Select the silo and right-click a target.', t: 4 }; }
      }
      if (b.type === 'interceptor') { b.ammo = b.ammo ?? 0; if (b.ammo < 2) { b.timer = (b.timer ?? 0) + dt * rate; if (b.timer >= INTERCEPT_RELOAD) { b.timer = 0; b.ammo++; } } }
      if (b.type === 'shield') {
        if (b.shieldHp === undefined) b.shieldHp = SHIELD_HP * 0.3;
        if (this.powerEff(b.team) < 0.75) { b.shieldHp = 0; continue; } // badly short of power: no shield
        if (b.shieldDown) { b.shieldDown = Math.max(0, b.shieldDown - dt); if (!b.shieldDown) b.shieldHp = SHIELD_HP * 0.3; continue; }
        if (this.time - (b.lastHit ?? -99) > 6) b.shieldHp = Math.min(SHIELD_HP, b.shieldHp + 30 * dt);
      }
    }
    for (const m of this.missiles) {
      m.t += dt;
      const f = Math.min(1, m.t / m.dur), [px, py] = this.missilePos(m);
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
          if (guard.team === 0) this.bark = { who: 'Interceptor', line: 'Missile destroyed in flight!', t: 3 };
          else this.bark = { who: 'Missile Silo', line: 'Our missile was intercepted.', t: 3 };
        }
      }
      if (f >= 1 && !m.done) { m.done = true; this.detonate(m.tx, m.ty); }
    }
    this.missiles = this.missiles.filter((m) => !m.done);
  }
  missilePos(m: { sx: number; sy: number; tx: number; ty: number; t: number; dur: number }): [number, number] {
    const f = Math.min(1, m.t / m.dur), [ax, ay] = toScreen(m.sx, m.sy), [bx, by] = toScreen(m.tx, m.ty);
    return [ax + (bx - ax) * f, ay + (by - ay) * f - Math.sin(f * Math.PI) * Math.min(700, Math.hypot(bx - ax, by - ay) * 0.5)];
  }
  // A strategic warhead: everything within five cells is hurt, friend or foe; a shield takes some of it and collapses.
  detonate(gx: number, gy: number) {
    const R = 5 * CELL, [sx, sy] = this.scr({ x: gx, y: gy });
    let cut = 1;
    for (const b of this.blds) if (b.type === 'shield' && (b.shieldHp ?? 0) > 0 && !b.shieldDown && Math.hypot((b.cx + 1) * CELL - gx, (b.cy + 1) * CELL - gy) < SHIELD_R * CELL) { cut = 0.6; b.shieldHp = 0; b.shieldDown = 12; }
    for (let i = 0; i < 18; i++) this.blasts.push({ x: sx + (Math.random() - 0.5) * 110, y: sy - Math.random() * 70, t: -Math.random() * 0.6, size: 16 + Math.random() * 16 });
    this.shakeAt = 1.6; audio.explosion(gx, gy, 3);
    const hit: Unit[] = [];
    this.near(gx, gy, R + 30, (u) => { if (Math.hypot(u.x - gx, u.y - gy) < R) hit.push(u); });
    for (const u of hit) if (this.alive(u)) { u.hp -= 800 * cut * (1 - Math.hypot(u.x - gx, u.y - gy) / R * 0.5); if (u.hp <= 0) this.killUnit(u); }
    for (const o of [...this.blds]) if (o.max > 0 && o.dying < 0 && this.reach(gx, gy, o) < R) { o.hp -= 2600 * cut; if (o.hp <= 0) { o.hp = 0; o.dying = 0; } }
    this.scorch(sx, sy, 50); this.knockTrees(gx, gy, R + 20);
    for (let i = 0; i < 5; i++) this.fires.push({ x: sx + (Math.random() - 0.5) * 80, y: sy + (Math.random() - 0.5) * 40, t: 20 + Math.random() * 20, s: 10 });
  }
  // Pave a stretch of road for a side, paying for each new square it covers (the computer's road-building).
  paveFor(team: number, plan: RoadPlan) {
    if (this.prods[team].credits < DEF.road.cost * 10 || plan.cells.length < 2) return;
    this.prods[team].credits -= this.pave(plan, team) * DEF.road.cost;
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
  dropCrates() {
    const t = this.terrain;
    if (this.crates.length > 6 * t.orbit([0, 0]).length) return;
    for (let k = 0; k < 60; k++) {
      const x = 6 + Math.floor(Math.random() * (N - 12)), y = 6 + Math.floor(Math.random() * (N - 12)), set = t.orbit([x, y]);
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
    this.blds = this.blds.filter((o) => o !== b);
    if (b.type === 'reactor') this.meltdown((b.cx + 1.5) * CELL, (b.cy + 1.5) * CELL);
    if (DEF[b.type]) this.leaveScrap((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, DEF[b.type].cost * 0.3, Math.ceil(Math.max(b.w, b.h) / 2));
    if (this.hostile(0, b.team)) this.stats.razed[0]++; // enemy buildings brought down
    for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
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
  // Lay a planned road for a side; trees in its way topple and sell as timber. Returns new squares.
  pave(plan: RoadPlan, team: number) {
    const t = this.terrain, n = t.paveCells(plan.cells, team);
    if (t.felled.length) {
      const cells = new Set(t.felled); let k = 0;
      for (const r of new Set(t.felled.map((i) => Math.floor(i / N)))) for (const tr of [...(this.trees[r - 1] ?? []), ...(this.trees[r] ?? [])]) if (tr.fall < 0 && cells.has(t.idx(t.cellOf(tr.x), t.cellOf(tr.y)))) { tr.fall = 0; tr.dir = Math.floor(Math.random() * 4); k++; }
      t.felled = [];
      this.prods[team].credits += k * TIMBER;
    }
    return n;
  }
  // Clear a building site of trees: they topple, and the timber sells for TIMBER a tree.
  fell(b: Bld) {
    let n = 0;
    for (let r = b.cy - 1; r <= b.cy + b.h; r++) for (const tr of this.trees[r] ?? []) {
      if (tr.fall >= 0 || tr.x < b.cx * CELL - 4 || tr.x > (b.cx + b.w) * CELL + 4 || tr.y < b.cy * CELL - 4 || tr.y > (b.cy + b.h) * CELL + 4) continue;
      tr.fall = 0; tr.dir = Math.floor(Math.random() * 4); n++;
    }
    if (!n) return;
    this.prods[b.team].credits += n * TIMBER;
    if (b.team === 0) { this.bark = { who: 'Builder', line: `Timber! ${n} trees cleared, +$${n * TIMBER}.`, t: 2.5 }; audio.click(); }
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
  sightOf(type: string, garrison = 0) { return type === 'watchtower' ? (garrison ? 11 : 0) : type === 'bunker' ? (garrison ? 6 : 0) : SIGHT[type] ?? 5; }
  updateFog() {
    const v = this.vis, t = this.terrain;
    for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
    let explored = false; // new ground uncovered? only then do the fog pictures need redrawing
    const reveal = (x: number, y: number, r: number) => {
      const cx = t.cellOf(x), cy = t.cellOf(y);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r && t.inside(cx + dx, cy + dy)) { const i = t.idx(cx + dx, cy + dy); if (v[i] === 0) explored = true; v[i] = 2; }
    };
    const eye = (t: number) => (this.upgrades[t].has('optics') ? 1.3 : 1); // long-range optics
    for (const u of this.units) if (this.friendly(u.team)) reveal(u.x, u.y, Math.round(this.sightOf(u.type) * eye(u.team)));
    this.reveals = this.reveals.filter((r) => r.until > this.time);
    for (const r of this.reveals) if (this.friendly(r.team)) { for (const b of this.blds) if (b.team === r.victim && b.dying < 0) reveal((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, 5); for (const u of this.units) if (u.team === r.victim) reveal(u.x, u.y, 2); }
    for (const b of this.blds) if (this.friendly(b.team) && b.dying < 0) { const r = this.sightOf(b.type, b.garrison); if (r) reveal((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, Math.round(r * eye(b.team))); }
    for (const b of this.blds) if (!b.seen) for (let y = b.cy; y < b.cy + b.h && !b.seen; y++) for (let x = b.cx; x < b.cx + b.w; x++) if (v[t.idx(x, y)] === 2) { b.seen = true; break; }
    if (!explored && this.fogMask.width === N) return;
    this.buildFogMask();
    // the radar's fog: black where never seen
    const M = 128, step = SW / M, fm = this.fogMini;
    if (fm.width !== M) { fm.width = M; fm.height = M; }
    const fctx = fm.getContext('2d')!, img = fctx.createImageData(M, M), d = img.data;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const [gx, gy] = toGround((x + 0.5) * step, (y + 0.5) * step), cx = t.cellOf(gx), cy = t.cellOf(gy);
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
    ctx.setTransform(YC * CELL, YS * CELL, -YS * CELL, YC * CELL, YS * MAPSIZE - vx, -vy); // same turn as the map: cell (x, y) lands where the ground does
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

  // A side is beaten when it has no buildings and no fighting units left.
  checkEnd() {
    const standing = (team: number) => this.blds.some((b) => b.team === team && b.max > 0 && b.dying < 0 && b.type !== 'wall') || this.units.some((u) => u.team === team && u.type === 'builder'); // no buildings and no builder: beaten
    for (const t of this.sides) if (t !== 0 && !this.out.has(t) && !standing(t)) { // a computer side is knocked out: its leftovers stand down
      this.out.add(t);
      for (const u of this.units) if (u.team === t) { u.goal = null; u.path = []; u.target = null; }
      if (this.sides.length > 2) this.warn(`${['', 'RED', '', 'GREEN', 'GOLD'][t]} IS OUT OF THE FIGHT!`);
    }
    if (!standing(0)) { this.state = 'lost'; this.menuHot = 0; audio.alarm(); }
    else if (this.sides.every((t) => !this.hostile(0, t) || this.out.has(t))) { this.state = 'won'; this.menuHot = 0; audio.fanfare(); }
  }

  // ---- helpers the computer opponent uses ----
  isCapturable(b: Bld) { return !!CAPTURE[b.type]; }
  // The computer's group orders work like yours: a wave forms up (armour in front, infantry behind,
  // guns and flak at the back) facing where it's going, travels at its slowest member's pace, and a
  // group that starts out together shares one route.
  orderUnits(us: Unit[], x: number, y: number, amove: boolean, together = false) {
    if (!us.length) return;
    const pace = together && us.length > 1 ? Math.min(...us.map((u) => u.def.speed)) : 0;
    const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cy = us.reduce((s, u) => s + u.y, 0) / us.length, far = Math.hypot(x - cx, y - cy) || 1, fx = (x - cx) / far, fy = (y - cy) / far;
    const spots = together && us.length > 1 && far > 3 * CELL ? this.formation(us, x, y, fx, fy) : null;
    const spread = Math.max(...us.map((u) => Math.hypot(u.x - cx, u.y - cy))), shared = us.length > 8 && spread < 10 * CELL ? this.sharedRoutes(cx, cy, x, y) : null;
    us.forEach((u, i) => {
      const a = (i / us.length) * Math.PI * 2, r = us.length > 1 ? 14 + (i % 3) * 8 : 0;
      const g: [number, number] = spots?.get(u) ?? [x + Math.cos(a) * r, y + Math.sin(a) * r];
      u.pace = pace; u.goal = g; u.amove = amove; u.forced = false; u.stuck = 0; u.face = spots ? Math.atan2(fy, fx) : null;
      u.path = u.def.air ? [g] : shared && u.def.crush !== 2 ? this.followRoute(u, shared[u.def.crush ? 1 : 0], cx, cy, g) : this.route(u, g[0], g[1]);
    });
  }
  sendIn(u: Unit, b: Bld) {
    const dx = (b.cx + b.w / 2) * CELL, dy = (b.cy + b.h + 0.5) * CELL;
    u.enter = b; u.goal = [dx, dy]; u.stuck = 0; u.path = findPath(this.terrain, u.x, u.y, dx, dy, false);
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
  mountains: { img: HTMLCanvasElement; x: number; y: number; sortY: number }[] = [];
  buildMountains() {
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
      const pts: { sx: number; base: number; top: number; c: number; body: number }[] = [];
      for (let j = 1; j < Hh - 1; j++) for (let i = 1; i < W - 1; i++) {
        const h = hm[j * W + i]; if (h <= 0) continue;
        const gx = gx0 + i * STEP, gy = gy0 + j * STEP, [sx, sy] = toScreen(gx, gy), base = sy - t.lift(gx, gy);
        const hx = Math.max(0, hm[j * W + i + 1]) - Math.max(0, hm[j * W + i - 1]), hy = Math.max(0, hm[(j + 1) * W + i]) - Math.max(0, hm[(j - 1) * W + i]);
        const light = Math.max(0, Math.min(1, 0.55 - (hx + hy) * 7)), n = hash3(gx, 91, gy), snow = 1.0 + (hash3(gx >> 3, 92, gy >> 3) - 0.5) * 0.16;
        let c: number;
        if (h > snow) c = light > 0.55 ? 0xf0f2f4 : light > 0.32 ? 0xcdd4dc : 0x9aa6b4;
        else if (h < 0.12) c = n < 0.5 ? 0x7c786c : 0x5c5a52; // scree
        else c = SH[Math.max(0, Math.min(SH.length - 1, Math.floor(light * (SH.length - 0.01) + (n - 0.5) * 0.9)))];
        const body = shadeHex(c, 0.86), lift = Math.pow(h, 1.1) * K;
        pts.push({ sx: Math.round(sx), base: Math.round(base), top: Math.round(base - lift), c, body });
      }
      if (!pts.length) continue;
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const p of pts) { minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx + STEP); minY = Math.min(minY, p.top); maxY = Math.max(maxY, p.base); }
      const cw = maxX - minX + 1, chh = maxY - minY + 2, cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
      const cx = cv.getContext('2d')!, img = cx.createImageData(cw, chh), d = img.data, ybuf = new Int32Array(cw).fill(chh);
      pts.sort((a, b) => b.base - a.base); // nearest first: each screen column is filled once, from the top of the nearest slope up
      const put = (x: number, y: number, c: number) => { const k = (y * cw + x) * 4; d[k] = c >> 16; d[k + 1] = (c >> 8) & 255; d[k + 2] = c & 255; d[k + 3] = 255; };
      for (const p of pts) for (let o = 0; o < STEP; o++) {
        const x = p.sx - minX + o, top = p.top - minY, base = p.base - minY;
        if (x < 0 || x >= cw || top >= ybuf[x]) continue;
        for (let y = Math.max(0, top); y < Math.min(ybuf[x], base + 1); y++) put(x, y, y === top ? p.c : p.body);
        if (top < ybuf[x]) ybuf[x] = Math.max(0, top);
      }
      cx.putImageData(img, 0, 0);
      const [csx, csy] = toScreen((px + 0.5) * CELL, (py + 0.5) * CELL);
      this.mountains.push({ img: cv, x: minX, y: minY, sortY: csy });
    }
  }
  // ---- bandits ----
  // Bandits hold the map's richer prizes and a few camps of their own. They never roam: guns dig
  // in around a valuable site (more for a richer one), and each camp is a pair of guns and a squad
  // that guard their ground and drift back to it. Clearing a camp pays a bounty to whoever does it.
  // Everything is placed in the map's symmetric sets, so every side faces the same.
  camps: { x: number; y: number; units: Unit[]; blds: Bld[]; done: boolean }[] = [];
  banditT = 0;
  placeBandits() {
    const t = this.terrain, mid = N / 2, B = BANDIT;
    const gun = (key: string, x: number, y: number) => (this.autoPlace(key, B, x, y) ? this.blds[this.blds.length - 1] : null);
    for (const s of this.blds.filter((b) => b.team === 2 && SITE_GUNS[b.type])) { // guns round the valuable sites, facing the middle of the map
      const n = SITE_GUNS[s.type], cx = s.cx + s.w / 2, cy = s.cy + s.h / 2, a0 = Math.atan2(mid - cy, mid - cx);
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
  // Twice a second-ish: bandits wander back to their posts; a cleared camp pays its bounty.
  updateBandits() {
    for (const u of this.units) if (u.team === BANDIT && u.home && !u.target && !u.goal && Math.hypot(u.x - u.home[0], u.y - u.home[1]) > 5 * CELL) { u.goal = [u.home[0], u.home[1]]; u.path = this.route(u, u.home[0], u.home[1]); }
    for (const c of this.camps) {
      if (c.done || c.units.some((u) => u.hp > 0 && this.units.includes(u)) || c.blds.some((b) => b.dying < 0 && this.blds.includes(b))) continue;
      c.done = true;
      const near: Record<number, number> = {}; // the side with the most armed units close by cleared it
      this.near(c.x, c.y, 14 * CELL, (u) => { if (u.team !== 2 && u.team !== BANDIT && u.def.weapon) near[u.team] = (near[u.team] ?? 0) + 1; });
      const who = Number(Object.entries(near).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1);
      if (who < 0) continue;
      this.prods[who].credits += CAMP_BOUNTY;
      if (who === 0) { this.bark = { who: 'Bandit camp', line: `Cleared! Bounty: +$${CAMP_BOUNTY}.`, t: 3 }; audio.radio(); }
      const [sx, sy] = this.scr(c);
      for (let i = 0; i < 12; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 20, y: sy - 4, vx: (Math.random() - 0.5) * 14, vy: -14, t: 0, life: 0.8, c: '#ffd040', s: 1 });
    }
  }
  // ---- spies and concealment ----
  // What an infiltrator does inside a building: a Field Command gives up the map of their land,
  // anything that makes power gets its local grid blacked out, anything else has its cash stolen.
  spyAct(b: Bld): 'steal' | 'sabotage' | 'reveal' { return b.type === 'fieldCommand' ? 'reveal' : (b.pw ?? POWER[b.type] ?? 0) > 0 ? 'sabotage' : 'steal'; }
  sendSpy(u: Unit, b: Bld) { this.assignSite(u, b); u.buildSite = null; u.spy = b; }
  reveals: { team: number; victim: number; until: number }[] = [];
  infiltrate(u: Unit, b: Bld) {
    const act = this.spyAct(b), them = b.team, us = u.team;
    this.units = this.units.filter((o) => o !== u);
    let line = '';
    if (act === 'steal') { const take = Math.round(Math.min(SPY_STEAL_MAX, this.prods[them].credits * SPY_STEAL)); this.prods[them].credits -= take; this.prods[us].credits += take; line = `Stole $${take} from their books.`; }
    else if (act === 'sabotage') { let n = 0; for (const o of this.blds) if (o.team === them && (o.pw ?? POWER[o.type] ?? 0) > 0 && Math.hypot(o.cx - b.cx, o.cy - b.cy) < 10) { o.blackout = this.time + SPY_BLACKOUT; n++; } line = `Blacked out ${n} power ${n === 1 ? 'plant' : 'plants'} for ${SPY_BLACKOUT}s.`; }
    else { this.reveals.push({ team: us, victim: them, until: this.time + SPY_REVEAL }); line = `Their land is on our map for ${SPY_REVEAL}s.`; }
    const [sx, sy] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL });
    for (let i = 0; i < 8; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 16, y: sy - Math.random() * 16, vx: 0, vy: -8, t: 0, life: 0.6, c: '#c0a0ff', s: 1 });
    if (us === 0) { this.bark = { who: 'Infiltrator', line, t: 3.5 }; audio.radio(); }
    this.ais.find((a) => a.me === them)?.spyHit(b);
    if (them === 0) this.warn(act === 'steal' ? 'An infiltrator robbed us!' : act === 'sabotage' ? 'Sabotage! Our power is out!' : 'An infiltrator stole our maps!', this.posOf(b));
  }
  // Hidden from an alliance? Infiltrators always are; riflemen, rockets, grenadiers and field guns
  // are while standing still in forest and not shooting. Anything hostile close by, a scout or guard
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
      const spy = u.type === 'infiltrator', camo = CAMO.has(u.type) && u.team !== BANDIT && !u.moving && this.time - u.firedAt > 3 && t.forest[t.idx(t.cellOf(u.x), t.cellOf(u.y))] > 0;
      if (!spy && !camo) continue;
      let mask = 0; for (const g of groups) if (g !== this.ally[u.team]) mask |= 1 << g;
      this.near(u.x, u.y, DETECT.scout * CELL, (o) => { if (o.team === 2 || !this.hostile(o.team, u.team)) return; const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < DETECT.near * CELL || (o.type === 'scout' && d < DETECT.scout * CELL)) mask &= ~(1 << this.ally[o.team]); });
      for (const b of eyes) if (this.hostile(b.team, u.team) && Math.hypot((b.cx + b.w / 2) * CELL - u.x, (b.cy + b.h / 2) * CELL - u.y) < DETECT[b.type] * CELL) mask &= ~(1 << this.ally[b.team]);
      u.cloak = mask;
    }
    // anyone aiming at something that just vanished loses it
    for (const o of this.units) if (o.target && this.isUnit(o.target) && this.hid(o.target, o.team)) o.target = null;
    for (const b of this.blds) if (b.target && this.isUnit(b.target) && this.hid(b.target, b.team)) b.target = null;
  }
  // An engineer walks up to an enemy building; when it gets there, the building changes sides.
  sendEngineer(u: Unit, b: Bld) { this.assignSite(u, b); u.buildSite = null; u.grab = b; }
  takeOver(u: Unit, b: Bld) {
    const was = b.team;
    b.team = u.team; b.target = null; b.seen = true; b.rally = null;
    this.units = this.units.filter((o) => o !== u);
    if (this.selBld === b && b.team !== 0) this.selBld = null;
    const [sx, sy] = this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL });
    for (let i = 0; i < 10; i++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 20, y: sy - Math.random() * 20, vx: 0, vy: -8, t: 0, life: 0.6, c: '#fff4b0', s: 1 });
    if (was === 0) this.warn(`Our ${b.name} has been taken over!`, this.posOf(b));
    else if (u.team === 0) { this.bark = { who: 'Engineer', line: `${b.name} is ours now.`, t: 3 }; audio.radio(); }
  }

  // ---- construction ----
  startSite(b: Bld) { b.rise = 0; b.hp = Math.max(1, b.max * 0.1); }
  // send a builder to the nearest open cell around a site (the closest edge may be walled in)
  assignSite(u: Unit, b: Bld) {
    u.buildSite = b;
    const t = this.terrain, spots: [number, number][] = [];
    for (let y = b.cy - 1; y <= b.cy + b.h; y++) for (let x = b.cx - 1; x <= b.cx + b.w; x++)
      if ((x < b.cx || y < b.cy || x >= b.cx + b.w || y >= b.cy + b.h) && t.open(x, y, u.def.crush)) spots.push([(x + 0.5) * CELL, (y + 0.5) * CELL]);
    spots.sort((p, q) => Math.hypot(p[0] - u.x, p[1] - u.y) - Math.hypot(q[0] - u.x, q[1] - u.y));
    u.stuck = 0; u.queue = [];
    for (const [gx, gy] of spots.slice(0, 4)) {
      const path = findPath(t, u.x, u.y, gx, gy, u.def.crush), end = path[path.length - 1];
      if (end && Math.hypot(end[0] - gx, end[1] - gy) < CELL) { u.goal = [gx, gy]; u.path = path; return; }
    }
    if (spots[0]) { u.goal = spots[0]; u.path = findPath(t, u.x, u.y, spots[0][0], spots[0][1], u.def.crush); }
  }
  cancelSite(b: Bld) {
    const d = DEF[b.type];
    if (d) this.prods[b.team].credits += Math.round(d.cost * b.rise);
    this.blds = this.blds.filter((o) => o !== b);
    for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) this.terrain.occupied[this.terrain.idx(x, y)] = 0;
    if (b === this.selBld) this.selBld = null;
    audio.click();
  }
  // Your idle builders don't stand about: they help with a site or patch up damage within 10 cells.
  builderHelp() {
    for (const u of this.builders(0)) {
      if (u.buildSite || u.goal || u.path.length) continue;
      let best: Bld | null = null, bd = 10 * CELL;
      for (const b of this.blds) if (b.team === 0 && b.max > 0 && b.dying < 0 && b.type !== 'wall' && (b.rise < 1 || b.hp < b.max * 0.9)) { const d = this.reach(u.x, u.y, b); if (d < bd) { bd = d; best = b; } }
      if (best) this.assignSite(u, best);
    }
  }
  // Builders at a site spend credits and raise the building; up to three can work together.
  updateConstruction(dt: number) {
    for (const b of this.blds) {
      if (b.dying >= 0 || b.max <= 0) continue;
      const d = DEF[b.type];
      if (!d) { b.rise = 1; continue; }
      if (b.rise >= 1 && b.hp >= b.max) continue;
      const crew = this.units.filter((u) => u.buildSite === b && this.reach(u.x, u.y, b) < 36).length;
      if (!crew) { // a marked site nobody has started: after 90 seconds it's cleared away (it cost nothing yet)
        if (b.rise === 0 && (b.idle = (b.idle ?? 0) + dt) > 90) this.cancelSite(b);
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
      const rate = (Math.min(crew, 3) / d.time) * this.powerEff(team) * (team !== 0 ? this.aiRate : 1);
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
        for (const u of this.units) if (u.buildSite === b) u.buildSite = null;
        if (b.type === 'scrapyard') { const u = this.addUnit('harvester', team, (b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.8) * CELL); u.heading = u.tHead = Math.PI / 2; } // every scrapyard comes with a salvager
        if (team === 0) { this.bark = { who: 'Builder', line: `${d.name} complete.`, t: 3 }; audio.radio(); }
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
    const def = this.looks[b.type + b.team].def, full = def.body, top = full.max[1], level = Math.round((top * st) / 5);
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
    this.units = this.units.filter((o) => o !== u);
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
      const doors = this.blds.filter((b) => b.team === 2 && Math.hypot(b.cx + b.w / 2 - vx, b.cy + b.h / 2 - vy) < 12).map((b) => [(b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.7) * CELL] as [number, number]).filter(([x, y]) => t.open(t.cellOf(x), t.cellOf(y), false));
      if (doors.length < 2) return;
      for (let i = 0; i < 3; i++) {
        const kind = (i + vi) % 2 ? 'pickup' : 'car', [x, y] = doors[(i * 3 + vi) % doors.length];
        this.agents.push({ kind, x, y, heading: Math.random() * 6.28, look: this.lifeLooks[kind + ((i + vi) % 4)], speed: 26, home: [x, y], goal: null, wait: 2 + i * 5, scared: 0, route: [], ri: 0, step: 0, doors, stuckT: 0, tries: 0 });
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
      if (a.doors) { // a car: errands round its own village, on land, parking between trips
        if (a.wait > 0) { a.wait -= dt; continue; }
        if (!a.route!.length || a.ri! >= a.route!.length) { // off somewhere new: home now and then, otherwise another door in town
          const atHome = Math.hypot(a.x - a.home[0], a.y - a.home[1]) < 20, dest = !atHome && Math.random() < 0.4 ? a.home : a.doors[(Math.random() * a.doors.length) | 0];
          if (Math.hypot(dest[0] - a.x, dest[1] - a.y) < 30) { a.wait = 2; continue; }
          a.route = findPath(t, a.x, a.y, dest[0], dest[1], false); a.ri = 0; a.stuckT = 0; a.lx = a.x; a.ly = a.y;
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
  // The road tool's preview: the planned route as a pale ribbon, and what it will cost.
  drawRoadPlan(vx: number, vy: number, cx: number, cy: number, ok: boolean) {
    const ctx = this.ctx, t = this.terrain, [mx, my] = [this.mouse.x, this.mouse.y];
    const label = (s: string, c: string) => text(ctx, s, Math.round(mx + 10 + textWidth(s) > this.FW - 4 ? mx - 10 - textWidth(s) : mx + 10), Math.round(my + 12), c, 1, C.ink); // flips left near the panel
    const [sx, sy] = toScreen((cx + 0.5) * CELL, (cy + 0.5) * CELL), lift = t.lift((cx + 0.5) * CELL, (cy + 0.5) * CELL);
    ctx.fillStyle = ok ? 'rgba(232,192,64,0.8)' : 'rgba(232,80,58,0.8)'; ctx.fillRect(Math.round(sx - vx) - 2, Math.round(sy - lift - vy) - 2, 5, 5);
    if (!this.roadFrom) { // where it would start: a gold ring on the road or door it grows from
      const src = this.roadSource(0, ...this.roadTo(cx, cy));
      if (src) { const [px, py] = toScreen(src[0], src[1]), x = Math.round(px - vx), y = Math.round(py - t.lift(src[0], src[1]) - vy); ctx.fillStyle = C.gold; for (let k = 0; k < 12; k++) ctx.fillRect(Math.round(x + Math.cos(k / 12 * 6.283) * 4), Math.round(y + Math.sin(k / 12 * 6.283) * 2.5), 1, 1); }
      label(src ? 'START THE ROAD HERE' : 'START FROM YOUR ROAD OR FIELD COMMAND', src ? C.gold : C.cream); return;
    }
    const key = `${this.roadFrom[0]},${this.roadFrom[1]}>${cx},${cy}`;
    if (this.roadPreview?.key !== key) this.roadPreview = { key, plan: ok ? planBetween(t, 0, this.roadFrom, this.roadTo(cx, cy)) : null };
    const plan = this.roadPreview.plan;
    if (!plan) { label('NO WAY THROUGH', C.bad); return; }
    const cost = plan.fresh * DEF.road.cost, afford = this.prod.credits >= cost;
    ctx.fillStyle = afford ? 'rgba(232,212,150,0.55)' : 'rgba(232,80,58,0.5)';
    for (let k = 1; k < plan.pts.length; k++) {
      const [ax, ay] = plan.pts[k - 1], [bx, by] = plan.pts[k], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
      for (let s = 0; s <= n; s++) { const gx = ax + ((bx - ax) * s) / n, gy = ay + ((by - ay) * s) / n, [px, py] = toScreen(gx, gy); ctx.fillRect(Math.round(px - vx) - 1, Math.round(py - t.lift(gx, gy) - vy) - 1, 3, 2); }
    }
    for (const [s, at] of [[plan.snapA, plan.pts[0]], [plan.snapB, plan.pts[plan.pts.length - 1]]] as [boolean, [number, number]][]) if (s) { // where it joins a road: a small gold ring
      const [px, py] = toScreen(at[0], at[1]), x = Math.round(px - vx), y = Math.round(py - t.lift(at[0], at[1]) - vy);
      ctx.fillStyle = C.gold; for (let k = 0; k < 12; k++) ctx.fillRect(Math.round(x + Math.cos(k / 12 * 6.283) * 4), Math.round(y + Math.sin(k / 12 * 6.283) * 2.5), 1, 1);
    }
    label(plan.fresh ? `ROAD $${cost}${plan.snapB ? '  JOINS ROAD' : ''}` : 'ALREADY PAVED', afford ? C.gold : C.bad);
  }
  // Where a side's road can grow from near a point: its own road, or a Field Command's front door.
  roadSource(team: number, x: number, y: number, r = 3 * CELL): [number, number] | null {
    const s = snapTo(this.terrain, team, x, y, r);
    let best: [number, number] | null = s ? [s.x, s.y] : null, bd = s ? Math.hypot(s.x - x, s.y - y) : r;
    for (const b of this.blds) if (b.team === team && b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0) { const dx = (b.cx + 1.5) * CELL, dy = (b.cy + 3.7) * CELL, d = Math.hypot(dx - x, dy - y); if (d < bd) { bd = d; best = [dx, dy]; } }
    return best;
  }
  roadTo(cx: number, cy: number): [number, number] { const [gx, gy] = this.groundAt(this.mouse.x + this.vx, this.mouse.y + this.vy); return Math.floor(gx / CELL) === cx && Math.floor(gy / CELL) === cy ? [gx, gy] : [(cx + 0.5) * CELL, (cy + 0.5) * CELL]; } // the exact spot under the cursor
  // The cheapest road from a cut-off building back to its side's network (cached for a second).
  linkCache: { b: Bld; t: number; plan: RoadPlan | null } | null = null;
  linkPlan(b: Bld): RoadPlan | null {
    if (this.linkCache?.b === b && this.time - this.linkCache.t < 1) return this.linkCache.plan;
    const t = this.terrain, net = this.territory.net.get(b.team);
    let plan: RoadPlan | null = null;
    if (net) {
      const home = this.blds.filter((o) => o.team === b.team && this.territory.linked.has(o)).sort((p, q) => Math.hypot(p.cx - b.cx, p.cy - b.cy) - Math.hypot(q.cx - b.cx, q.cy - b.cy))[0];
      const hx = home ? home.cx + home.w / 2 : b.cx, hy = home ? home.cy + home.h / 2 : b.cy;
      const door: [number, number] = [(b.cx + b.w / 2) * CELL, (b.cy + b.h + 0.6) * CELL];
      const onNet = (s: { ax: number; ay: number; bx: number; by: number }) => !!net[t.idx(Math.floor((s.ax + s.bx) / 2 / CELL), Math.floor((s.ay + s.by) / 2 / CELL))];
      const road = snapTo(t, b.team, door[0], door[1], 60 * CELL, onNet); // the nearest road of its network
      const hub = this.blds.filter((o) => o.team === b.team && o.type === 'fieldCommand' && this.territory.linked.has(o)).sort((p, q) => Math.hypot(p.cx - b.cx, p.cy - b.cy) - Math.hypot(q.cx - b.cx, q.cy - b.cy))[0];
      const target: [number, number] | null = road ? [road.x, road.y] : hub ? [(hub.cx + 1.5) * CELL, (hub.cy + 3.7) * CELL] : null; // always onto a road (or, with none yet, a Field Command's door)
      plan = target ? planBetween(t, b.team, door, target) : null;
    }
    this.linkCache = { b, t: this.time, plan };
    return plan;
  }
  // Lay that road for a side, if it can pay. Returns true when it was laid.
  linkByRoad(b: Bld) {
    const plan = this.linkPlan(b), cost = plan ? plan.fresh * DEF.road.cost : 0;
    if (!plan || this.prods[b.team].credits < cost) return false;
    this.prods[b.team].credits -= this.pave(plan, b.team) * DEF.road.cost;
    this.linkCache = null; this.updateLand();
    return true;
  }
  // A little broken chain over a building of yours that no road links to your network.
  drawCut(x: number, y: number) {
    const ctx = this.ctx, on = Math.floor(this.time * 2) % 2 === 0;
    ctx.fillStyle = C.ink; ctx.fillRect(x - 6, y - 3, 13, 6);
    ctx.fillStyle = on ? '#ffb040' : '#d08020';
    for (const ox of [-5, 2]) { ctx.fillRect(x + ox, y - 2, 4, 1); ctx.fillRect(x + ox, y + 1, 4, 1); ctx.fillRect(x + ox, y - 1, 1, 2); ctx.fillRect(x + ox + 3, y - 1, 1, 2); }
    ctx.fillStyle = '#ffe0a0'; ctx.fillRect(x, y - 3, 1, 1); ctx.fillRect(x, y + 2, 1, 1);
  }
  // Joined to its side's road network? Cut-off buildings work at half rate.
  link(b: Bld) { return (this.territory.linked.has(b) ? 1 : 0.5) * (this.town.has(b) ? 1.25 : 1); } // and a quarter faster in a town centre
  // Work out who owns what (see territory.ts) and repaint the radar's picture of it.
  updateLand() {
    const t = this.terrain, land = this.territory;
    land.compute(t, this.sides.filter((s) => !this.out.has(s)), this.blds, (team) => t.bases[this.baseOf(team)]);
    // driveways: a finished building with its side's road close by gets a short concrete drive to it
    for (const b of this.blds) {
      if (b.drive || b.rise < 1 || b.dying >= 0 || b.type === 'wall' || b.team === 2 || b.team === BANDIT || b.w < 2) continue;
      let best = -1, bd = 2.6;
      for (let y = b.cy - 2; y < b.cy + b.h + 2; y++) for (let x = b.cx - 2; x < b.cx + b.w + 2; x++) {
        if (!t.inside(x, y) || (x >= b.cx && x < b.cx + b.w && y >= b.cy && y < b.cy + b.h)) continue;
        const i = t.idx(x, y); if (t.type[i] !== T.PAVED || t.roadBy[i] !== b.team) continue;
        const d = Math.hypot(Math.max(b.cx - x, 0, x - (b.cx + b.w - 1)), Math.max(b.cy - y, 0, y - (b.cy + b.h - 1))); if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) continue;
      b.drive = true;
      const rx = ((best % N) + 0.5) * CELL, ry = (Math.floor(best / N) + 0.5) * CELL;
      const ex = Math.max(b.cx * CELL + 8, Math.min((b.cx + b.w) * CELL - 8, rx)), ey = Math.max(b.cy * CELL + 8, Math.min((b.cy + b.h) * CELL - 8, ry)); // the nearest point on its side, in a little from the corner
      t.paintDrive(ex, ey, rx, ry);
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
    const M = 128, step = SW / M, lm = this.landMini;
    if (lm.width !== M) { lm.width = M; lm.height = M; }
    const lctx = lm.getContext('2d')!, img = lctx.createImageData(M, M), d = img.data, own = new Int8Array(M * M).fill(-1);
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const [gx, gy] = toGround((x + 0.5) * step, (y + 0.5) * step), cx = t.cellOf(gx), cy = t.cellOf(gy);
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
  drawBorders(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain, W = this.FW, H = this.FH;
    const GLOW = [0.5, 0.3, 0.18, 0.1, 0.05];
    for (const [team, seg] of this.territory.lines) {
      const mine = this.friendly(team), col = DOT[team], c = parseInt(col.slice(1), 16), rgb = `${c >> 16},${(c >> 8) & 255},${c & 255}`;
      const glow = GLOW.map((a) => `rgba(${rgb},${a})`);
      for (let k = 0; k < seg.length; k += 6) {
        const ax = seg[k], ay = seg[k + 1], bx = seg[k + 2], by = seg[k + 3];
        const [sa, ta] = toScreen(ax, ay), [sb, tb] = toScreen(bx, by);
        const x0 = sa - vx, y0 = ta - t.lift(ax, ay) - vy, x1 = sb - vx, y1 = tb - t.lift(bx, by) - vy;
        if ((x0 < -8 && x1 < -8) || (x0 > W + 8 && x1 > W + 8) || (y0 < -8 && y1 < -8) || (y0 > H + 8 && y1 > H + 8)) continue;
        if (!mine && !this.vis[t.idx(t.cellOf((ax + bx) / 2), t.cellOf((ay + by) / 2))]) continue;
        const nx = YC * seg[k + 4] - YS * seg[k + 5], ny = YS * seg[k + 4] + YC * seg[k + 5]; // inward, on screen
        const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let s = 0; s <= n; s++) {
          const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n;
          for (let g = GLOW.length; g >= 1; g--) { ctx.fillStyle = glow[g - 1]; ctx.fillRect(Math.round(x + nx * (g + 1)), Math.round(y + ny * (g + 1)), 1, 1); }
          ctx.fillStyle = 'rgba(10,12,14,0.6)'; ctx.fillRect(Math.round(x - nx), Math.round(y - ny) + 1, 1, 1);
          ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); ctx.fillRect(Math.round(x + nx), Math.round(y + ny), 1, 1);
        }
      }
    }
  }
  drawGlints(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain, CH = 512;
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
    const msg = 'SURVEYING THE BATTLEFIELD...';
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
    this.drawMenu(Math.round((this.FW - 120) / 2), y + 66, 120);
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
      ['S / X', 'STOP / SPREAD OUT'], ['CTRL + 1-9', 'MAKE A GROUP (1-9 PICKS IT)'], ['SWIPE / ARROWS', 'SCROLL THE MAP'],
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
    this.buttons = [];
    // header: name and a pause button
    ctx.fillStyle = C.red; ctx.fillRect(x0 + 7, 4, 6, 6); ctx.fillStyle = C.gold; ctx.fillRect(x0 + 9, 6, 2, 2);
    text(ctx, 'CONQUER', x0 + 16, 4, C.gold, 1, C.ink);
    this.buttons.push({ id: 'pause', x: x0 + SB - 20, y: 2, w: 16, h: 11, label: 'II' });
    // credits and power
    const cr = '$ ' + Math.floor(this.prod.credits).toLocaleString('en-US');
    inset(ctx, x0 + 6, 16, SB - 12, 12, C.screen);
    text(ctx, cr, Math.round(x0 + SB / 2 - textWidth(cr) / 2), 19, C.gold);
    const low = this.power.used > this.power.made, cap = Math.max(this.power.made, this.power.used, 1);
    text(ctx, 'POWER', x0 + 6, 32, low ? C.bad : C.goldD);
    inset(ctx, x0 + 40, 31, SB - 46, 9, C.ink);
    ctx.fillStyle = low ? C.bad : C.ok; ctx.fillRect(x0 + 41, 32, Math.round((this.power.made / cap) * (SB - 48)), 3);
    ctx.fillStyle = low && Math.floor(this.time * 3) % 2 ? '#ff8060' : C.warn; ctx.fillRect(x0 + 41, 36, Math.round((this.power.used / cap) * (SB - 48)), 3);
    // radar
    const mx = x0 + Math.round((SB - 130) / 2), my = 45, mm = 128;
    this.mm = { x: mx + 1, y: my + 1, s: mm };
    inset(ctx, mx, my, mm + 2, mm + 2, C.ink);
    const radar = this.owns('fieldCommand');
    if (!radar) { // no Field Command, no radar: just static
      for (let i = 0; i < 500; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#141614' : '#2a2e2a'; ctx.fillRect(mx + 1 + ((Math.random() * mm) | 0), my + 1 + ((Math.random() * mm) | 0), 1, 1); }
      for (const [i, l] of ['NO RADAR', 'BUILD A', 'FIELD COMMAND'].entries()) text(ctx, l, mx + 1 + Math.round((mm - textWidth(l)) / 2), my + 50 + i * 11, i ? C.goldD : C.muted, 1, C.ink);
      glass(ctx, mx, my, mm + 2, mm + 2);
    }
    if (radar) {
    ctx.drawImage(this.terrain.minimap, mx + 1, my + 1);
    ctx.drawImage(this.landMini, mx + 1, my + 1);
    ctx.drawImage(this.fogMini, mx + 1, my + 1);
    const sc = mm / SW, dot = (gx: number, gy: number, c: string, s: number) => { const [a, b] = toScreen(gx, gy); ctx.fillStyle = c; ctx.fillRect(mx + 1 + Math.floor(a * sc), my + 1 + Math.floor(b * sc), s, s); };
    for (const o of this.terrain.oil) if (o.found && !o.tapped) dot((o.cx + 0.5) * CELL, (o.cy + 0.5) * CELL, C.gold, 2);
    for (const c of this.crates) if (this.sees(c.x, c.y)) dot(c.x, c.y, '#ffe080', 2);
    for (const b of this.blds) if (b.team !== 2 && (this.friendly(b.team) || b.seen)) dot((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, DOT[b.team], 3);
    for (const u of this.units) if (this.spot(u)) dot(u.x, u.y, u.team === 0 ? '#9ad0ff' : DOT[u.team], 2);
    ctx.save(); ctx.beginPath(); ctx.rect(mx + 1, my + 1, mm, mm); ctx.clip();
    for (const p of this.pings) if (p.dmg >= 120) { // attack markers: pulsing red rings
      const [a, b] = toScreen(p.x, p.y), px = mx + 1 + Math.floor(a * sc), py = my + 1 + Math.floor(b * sc), r = 3 + ((this.time * 8) % 6);
      ctx.fillStyle = Math.floor(this.time * 4) % 2 ? '#ff3020' : '#ffd040';
      for (let k = 0; k < 16; k++) ctx.fillRect(Math.round(px + Math.cos(k / 16 * 6.283) * r), Math.round(py + Math.sin(k / 16 * 6.283) * r), 1, 1);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    const land = Math.round((this.territory.area.get(0) ?? 0) * LAND_RATE);
    if (land) text(ctx, 'LAND +$' + land + '/S', mx + 4, my + mm - 9, DOT[0], 1, C.ink);
    const fuel = Math.round(this.powers[0].fuel ?? 0);
    if (fuel) text(ctx, 'FUEL -$' + fuel + '/S', mx + 4, my + mm - (land ? 18 : 9), '#f0a060', 1, C.ink); // stacked above the land line
    const vw = (this.worldW() * sc), vh = this.worldH() * sc, rx = mx + 1 + Math.round(this.vx * sc), ry = my + 1 + Math.round(this.vy * sc);
    ctx.fillStyle = C.cream;
    ctx.fillRect(rx, ry, Math.round(vw), 1); ctx.fillRect(rx, ry + Math.round(vh), Math.round(vw) + 1, 1); ctx.fillRect(rx, ry, 1, Math.round(vh)); ctx.fillRect(rx + Math.round(vw), ry, 1, Math.round(vh));
    for (let k = 0; k < 4; k++) { // radar sweep
      const a = this.time * 1.6 - k * 0.07;
      ctx.fillStyle = `rgba(126,224,138,${0.45 - k * 0.1})`;
      for (let r = 2; r < 92; r += 1) ctx.fillRect(mx + 65 + Math.round(Math.cos(a) * r), my + 65 + Math.round(Math.sin(a) * r), 1, 1);
    }
    if (low) {
      for (let i = 0; i < 700; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#1a1c1a' : '#6a706a'; ctx.fillRect(mx + 1 + ((Math.random() * mm) | 0), my + 1 + ((Math.random() * mm) | 0), 1, 1); }
      if (Math.floor(this.time * 2) % 2) text(ctx, 'LOW POWER', mx + 38, my + 60, C.bad, 1, C.ink);
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
    const nowOk = new Set(BUILDS.filter((d) => d.kind !== 'upgrade' && this.available(d)).map((d) => d.key));
    if (this.okBefore) for (const k of nowOk) if (!this.okBefore.has(k)) this.unlockT[k] = this.time;
    this.okBefore = nowOk;
    for (const tb of this.tabs) {
      const on = tab === tb.id;
      ctx.fillStyle = C.metalD; ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
      ctx.fillStyle = on ? C.red : C.metal; ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, tb.h - 2);
      if (on) { ctx.fillStyle = '#e04a34'; ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, 1); }
      const label = tb.id === 'structure' ? 'BASE' : factory ? DEF[factory]?.name.toUpperCase().split(' ')[0] ?? 'ARMY' : 'ARMY';
      const fresh = !on && BUILDS.some((d) => d.kind === tb.id && this.fresh(d)) && Math.floor(this.time * 3) % 2;
      text(ctx, label, Math.round(tb.x + (tb.w - textWidth(label)) / 2), tb.y + 2, on || fresh ? C.gold : C.muted);
    }
    this.slots = []; this.hoverSlot = null;
    const defs = BUILDS.filter((d) => (factory ? d.from === factory : d.kind === tab));
    const cw = Math.floor((SB - 16) / 3), ch = 34, gy0 = ty + 14, rows = Math.max(1, Math.floor((H - 46 - gy0) / (ch + 2)));
    defs.slice(0, rows * 3).forEach((d, i) => {
      const sx = x0 + 6 + (i % 3) * (cw + 2), sy = gy0 + Math.floor(i / 3) * (ch + 2);
      this.slots.push({ def: d, x: sx, y: sy, w: cw, h: ch });
      this.drawSlot(d, sx, sy, cw, ch, M.x > sx && M.x < sx + cw && M.y > sy && M.y < sy + ch);
    });
    // orders along the bottom
    const by = H - 21, bw = Math.floor((SB - 16) / 3);
    const idleB = this.builders(0).filter((u) => !u.buildSite && !u.goal && !u.path.length).length;
    this.buttons.push({ id: 'army', x: x0 + 6, y: by - 18, w: bw, h: 16, label: 'ARMY', key: 'F' }, { id: 'idleArmy', x: x0 + 8 + bw, y: by - 18, w: bw, h: 16, label: 'IDLE', key: '' }, { id: 'idleBuilder', x: x0 + 10 + bw * 2, y: by - 18, w: bw, h: 16, label: idleB ? `BLD ${idleB}` : 'BLD', key: '.' });
    this.actions().forEach((a, i) => this.buttons.push({ ...a, x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16 }));
    for (const b of this.buttons) { const hot = M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h; button(ctx, b, hot, hot && M.down); }
    if (this.hoverSlot) this.drawTooltip(this.hoverSlot.d, x0 - 4, this.hoverSlot.y);
  }

  // The bottom row of orders follows what's selected, so only orders that apply are on show. Each
  // has a key too, but you never need it.
  actions(): { id: string; label: string; key?: string; on?: boolean }[] {
    const b = this.selBld;
    if (this.selected().length) return [{ id: 'stop', label: 'STOP', key: 'S' }, { id: 'amove', label: 'ATTACK', key: 'A' }, { id: 'scatter', label: 'SPLIT', key: 'X' }];
    if (b && b.team === 0) {
      if (b.rise < 1) return [{ id: 'cancel', label: 'CANCEL' }];
      const out: { id: string; label: string; key?: string; on?: boolean }[] = [];
      if (this.prod.queues[b.type]) out.push({ id: 'repeat', label: 'REPEAT', key: 'R', on: !!this.prod.repeat[b.type] });
      if (b.type !== 'wall' && !this.territory.linked.has(b)) { const plan = this.linkPlan(b); out.push({ id: 'link', label: plan ? `LINK $${plan.fresh * DEF.road.cost}` : 'NO ROAD' }); }
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
    const SHAPE: Record<string, string> = { rifle: 'dot', rocket: 'dot', grenadier: 'dot', scout: 'smallDiamond', tank: 'diamond', flak: 'diamond', juggernaut: 'bigDiamond', colossus: 'huge', tempest: 'huge', bomber: 'arrow', hovertank: 'diamond', engineer: 'dot', infiltrator: 'dot', artillery: 'triangle', harvester: 'square', builder: 'square', gunship: 'arrow' };
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

  // The starter checklist: the next few things to do, ticked off as you go.
  goals: [string, () => boolean][] = [
    ['BUILD A GENERATOR', () => this.owns('generator')],
    ['BUILD A SCRAPYARD (MONEY)', () => this.owns('scrapyard')],
    ['BUILD A BARRACKS, TRAIN SOLDIERS', () => this.owns('barracks') && this.units.some((u) => u.team === 0 && !u.def.vehicle)],
    ['BUILD A FIELD COMMAND (RADAR)', () => this.owns('fieldCommand')],
    ['BUILD A VEHICLE DEPOT', () => this.owns('depot')],
    ['CAPTURE A SITE WITH INFANTRY', () => this.blds.some((b) => b.team === 0 && !!CAPTURE[b.type])],
    ['TAKE THE ISLAND FUEL DEPOT', () => this.blds.some((b) => b.team === 0 && b.type === 'fuelDepot' && Math.abs(b.cx - N / 2) < 3 && Math.abs(b.cy - N / 2) < 3)],
  ];
  goalDone: boolean[] = [];
  drawGoals() {
    this.goals.forEach(([, check], i) => { if (!this.goalDone[i] && check()) { this.goalDone[i] = true; audio.click(); } });
    const open = this.goals.map((g, i) => [g[0], i] as [string, number]).filter(([, i]) => !this.goalDone[i]).slice(0, 3);
    if (!open.length) return;
    const ctx = this.ctx, w = Math.max(...open.map(([l]) => textWidth(l))) + 26, h = 14 + open.length * 10;
    panel(ctx, 6, 6, w, h);
    text(ctx, 'NEXT STEPS', 12, 10, C.gold, 1, C.ink);
    open.forEach(([label], k) => { ctx.fillStyle = C.goldD; ctx.fillRect(12, 22 + k * 10, 3, 3); text(ctx, label, 19, 20 + k * 10, C.cream); });
  }

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
      const special = b.type === 'silo' ? ((b.timer ?? 0) >= MISSILE_TIME ? 'READY: RIGHT-CLICK A TARGET' : `MISSILE ${Math.floor(((b.timer ?? 0) / MISSILE_TIME) * 100)}% CHARGED`)
        : b.type === 'interceptor' ? `INTERCEPTORS READY: ${b.ammo ?? 0} / 2` : b.type === 'shield' ? (b.shieldDown ? 'OVERLOADED: REBOOTING' : `SHIELD ${Math.round(((b.shieldHp ?? 0) / SHIELD_HP) * 100)}%`) : '';
      if (special && b.rise >= 1) { text(ctx, special, x, y + 25, b.type === 'silo' && (b.timer ?? 0) >= MISSILE_TIME ? C.bad : C.ok); return; }
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
    this.drawIcon(d, sx + 1, sy + 1, w - 2, h - 9);
    const job = d.kind === 'structure' ? null : p.queues[d.from!]?.find((j) => j.def === d);
    const f = d.kind === 'structure' ? 0 : p.queues[d.from!][0]?.def === d ? p.progress(p.queues[d.from!][0]) : 0;
    if (job) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx + 1, sy + 1, w - 2, Math.round((h - 2) * (1 - f))); }
    if (!ok) { ctx.fillStyle = 'rgba(10,10,12,0.6)'; ctx.fillRect(sx + 1, sy + 1, w - 2, h - 2); }
    ctx.restore();
    ctx.fillStyle = 'rgba(8,8,10,0.75)'; ctx.fillRect(sx + 1, sy + h - 9, w - 2, 8);
    if (this.placing === d) { if (Math.floor(this.time * 3) % 2) text(ctx, 'PLACE', sx + Math.round((w - textWidth('PLACE')) / 2), sy + h - 8, C.gold); }
    else text(ctx, '$' + d.cost, sx + Math.round((w - textWidth('$' + d.cost)) / 2), sy + h - 8, ok ? C.cream : C.muted);
    const count = d.kind === 'unit' ? p.queues[d.from!].filter((j) => j.def === d).length : 0;
    if (count) text(ctx, String(count), sx + w - 7, sy + 2, C.gold, 1, C.ink);
    if (!ok && d.kind !== 'upgrade') { // a little padlock
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
    if (d.kind === 'upgrade') { // a gold double chevron for research
      const cx = Math.round(x + w / 2), cy = Math.round(y + h / 2) - 3;
      for (const oy of [0, 5]) for (let i = 0; i < 6; i++) { ctx.fillStyle = C.ink; ctx.fillRect(cx - 6 + i, cy + oy + i - 1, 2, 3); ctx.fillRect(cx + 5 - i, cy + oy + i - 1, 2, 3); ctx.fillStyle = this.upgrades[0].has(d.key) ? C.ok : C.gold; ctx.fillRect(cx - 6 + i, cy + oy + i, 2, 2); ctx.fillRect(cx + 5 - i, cy + oy + i, 2, 2); }
      return;
    }
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
    if (d.kind === 'upgrade' && (this.upgrades[0].has(d.key) || this.prod.queues.armoury.some((j) => j.def === d))) return false;
    return (d.needs ?? []).every((n) => this.owns(n)) && (d.kind === 'structure' || this.owns(d.from!));
  }
  tipFor(d: BuildDef) {
    if (d.kind === 'structure' && !this.builders(0).length) return 'NEEDS A BUILDER: TRAIN ONE AT THE FIELD COMMAND';
    if (d.key === 'derrick' && !this.available(d)) return 'STRIKE OIL FIRST: ROAM THE MAP WITH VEHICLES';
    if (d.kind === 'upgrade' && this.upgrades[0].has(d.key)) return 'RESEARCHED';
    if (d.kind === 'upgrade' && this.prod.queues.armoury.some((j) => j.def === d)) return 'RESEARCHING...';
    if (d.key === 'derrick' && this.available(d)) return '$1200  SMALL SEEP: +100 POWER, $5/S.  BIG STRIKE: +200, $10/S';
    const extra: Record<string, string> = {
      wall: '$30 A BLOCK. CLICK OR DRAG TO LAY A LINE; RIGHT-CLICK TO STOP',
      road: '$15 A NEW SQUARE. CLICK WHERE IT STARTS, THEN WHERE IT GOES', hospital: '$800  POWER -20  HEALS INFANTRY NEARBY; UNLOCKS GRENADIERS',
      foundry: '$2500  TURNS UP TO 250 SPARE POWER INTO $20/S', reactor: '$4000  POWER +400. DEVASTATING BLAST IF DESTROYED',
      workshop: '$1000  POWER -20  REPAIRS VEHICLES NEARBY; UNLOCKS FIELD GUNS',
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
    if (btn === 2) { p.dequeue(d.from!); return; }
    if (this.available(d) && p.queues[d.from!].length < 6) p.queues[d.from!].push({ def: d, spent: 0 });
  }

  // ---- economy: production, power, placing structures, salvaging ----
  updateEconomy(dt: number) {
    for (const team of this.sides) {
      const pw = (this.powers[team] = { made: 0, used: 0, fuel: 0 });
      const broke = this.prods[team].credits <= 0;
      for (const b of this.blds) {
        if (b.team !== team || b.rise < 1 || b.dying >= 0) continue;
        const v = b.pw ?? POWER[b.type] ?? 0;
        if (v > 0) { // a plant: sabotaged makes nothing; cut off from the network, half; out of fuel money, half
          if ((b.blackout ?? 0) >= this.time) continue;
          const fuel = FUEL[b.type] ?? 0;
          pw.made += v * (this.territory.linked.has(b) || b.type === 'fieldCommand' ? 1 : 0.5) * (fuel && broke ? 0.5 : 1);
          pw.fuel += fuel;
        } else pw.used -= v;
      }
      this.prods[team].credits = Math.max(0, this.prods[team].credits - pw.fuel * dt); // plants burn fuel
      const speed = this.powerEff(team) * (team !== 0 ? this.aiRate : 1);
      for (const d of this.prods[team].tick(dt, speed, (k) => this.blds.reduce((n, b) => n + (b.team === team && b.type === k && b.rise >= 1 && b.dying < 0 ? this.link(b) : 0), 0))) { // a cut-off factory works at half speed
        if (d.kind === 'upgrade') { this.upgrades[team].add(d.key); if (team === 0) { this.bark = { who: 'Armoury', line: `${d.name} researched.`, t: 3 }; audio.radio(); } continue; }
        const fs = this.blds.filter((b) => b.team === team && b.type === d.from && b.rise >= 1 && b.dying < 0), f = fs[(Math.random() * fs.length) | 0]; // units roll out of any of your factories
        if (!f) continue;
        const u = this.addUnit(d.key, team, (f.cx + f.w / 2) * CELL, (f.cy + f.h + 0.6) * CELL);
        u.heading = u.tHead = Math.PI / 2;
        this.stats.built[team]++;
        const r = f.rally ?? [(f.cx + f.w / 2) * CELL + (Math.random() - 0.5) * 30, (f.cy + f.h + 2.5) * CELL];
        u.goal = [r[0], r[1]]; u.path = this.route(u, r[0], r[1]);
        if (team === 0) { this.bark = { who: d.name, line: d.key === 'harvester' ? 'Salvager reporting. Show me the scrap.' : 'Reporting for duty.', t: 2.5 }; audio.radio(); }
      }
    }
    this.prospect(dt);
    for (const team of this.sides) if (this.owns('fieldCommand', team)) this.prods[team].credits += dt * 4; // a small allowance from HQ, so nobody stalls for good
    for (const [team, sq] of this.territory.area) this.prods[team].credits += dt * sq * LAND_RATE; // the land pays
    if ((this.dangerT -= dt) <= 0) { this.dangerT = 5; this.markDanger(); }
    // foundries turn each side's spare power into money, up to FOUNDRY_POWER each
    for (const team of this.sides) {
      let spare = Math.max(0, this.powers[team].made - this.powers[team].used);
      for (const b of this.blds) if (b.type === 'foundry' && b.team === team && b.rise >= 1 && b.dying < 0) { const take = Math.min(spare, FOUNDRY_POWER); spare -= take; this.prods[team].credits += take * FOUNDRY_RATE * dt * this.link(b); }
    }
    for (const b of this.blds) if (b.type === 'townHall' && b.team !== 2 && this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) this.prods[b.team].credits += dt * 5 * (this.territory.linked.has(b) ? 2 : 1); // town trade: double once a road links it
    for (const b of this.blds) if (b.type === 'fuelDepot' && b.team !== 2 && this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) this.prods[b.team].credits += dt * 8 * (this.territory.linked.has(b) ? 2 : 1); // captured fuel sells: double once linked
    for (const b of this.blds) if (b.type === 'derrick' && b.rise >= 1 && b.dying < 0 && b.team !== 2) this.prods[b.team].credits += dt * (b.pw === 200 ? 10 : 5) * this.link(b); // oil sells: $5 a second, $10 on a big strike (half if cut off)
    this.updateConstruction(dt);
    if ((this.helpT -= dt) <= 0) { this.helpT = 2; this.builderHelp(); }
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
  placeAt(d: BuildDef): [number, number, boolean] {
    const M = this.mouse, [gx, gy] = this.groundAt(M.x + this.vx, M.y + this.vy), t = this.terrain;
    if (d.key === 'road') { // any explored square a road could cross
      const cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL);
      if (!t.inside(cx, cy)) return [cx, cy, false];
      const i = t.idx(cx, cy), ty = t.type[i];
      return [cx, cy, !!this.vis[i] && ty !== T.WATER && ty !== T.ROCK && ty !== T.FORD && !t.occupied[i] && !t.forest[i]];
    }
    let cx = Math.floor(gx / CELL - d.w! / 2 + 0.5), cy = Math.floor(gy / CELL - d.h! / 2 + 0.5), well = -1;
    if (d.key === 'derrick') { // snaps onto struck oil under the cursor; anywhere on the map
      const o = this.seepNear(gx, gy);
      if (!o) return [cx, cy, false];
      cx = o.cx - 1; cy = o.cy - 1; well = t.idx(o.cx, o.cy);
    }
    let ok = true, e = -1;
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) {
      if (!t.inside(x, y)) { ok = false; continue; }
      const i = t.idx(x, y), ty = t.type[i];
      const roadOk = d.key === 'wall' || d.key === 'road'; // nothing else may sit on a road: a wall across one is a roadblock
      if ((ty !== 0 && ty !== 1 && ty !== 2 && ty !== 8 && !((ty === 7 || ty === 9) && roadOk)) || (d.key === 'road' && (ty === 9 || ty === 2)) || (t.occupied[i] && i !== well) || (t.forest[i] && (d.key === 'wall' || d.key === 'road')) || t.elev[i] === 1) ok = false; // buildings may go in forest: the builder fells it first
      if (e < 0) e = t.elev[i]; else if (t.elev[i] !== e) ok = false;
    }
    if (d.key !== 'road' && this.units.some((u) => u.x > cx * CELL - 4 && u.x < (cx + d.w!) * CELL + 4 && u.y > cy * CELL - 4 && u.y < (cy + d.h!) * CELL + 4)) ok = false;
    const near = this.blds.some((b) => b.team === 0 && !CAPTURE[b.type] && b.type !== 'wall' && cx < b.cx + b.w + 6 && cx + d.w! > b.cx - 6 && cy < b.cy + b.h + 6 && cy + d.h! > b.cy - 6);
    // ...or near one of your builders, so the first building (and outposts) can go up anywhere a builder has driven
    const mx = (cx + d.w! / 2) * CELL, my = (cy + d.h! / 2) * CELL;
    const byBuilder = this.builders(0).some((u) => Math.hypot(u.x - mx, u.y - my) < 8 * CELL);
    // anything but a wall may go anywhere you've explored (a builder has to get there, and may not);
    // walls go up instantly, so they keep to your base or a builder's side
    let explored = true;
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) if (!t.inside(x, y) || !this.vis[t.idx(x, y)]) explored = false;
    return [cx, cy, ok && (d.key === 'wall' || d.key === 'road' ? near || byBuilder : explored)];
  }

  place() {
    const d = this.placing!, [cx, cy, ok] = this.placeAt(d);
    if (!ok) { audio.click(); return; }
    if (d.key === 'road') { // first click: one of your roads or a Field Command's door (roads always grow from a source); second: where it goes
      if (!this.roadFrom) {
        const src = this.roadSource(0, ...this.roadTo(cx, cy));
        if (!src) { this.bark = { who: 'Builder', line: 'Start from one of your roads or a Field Command.', t: 2.5 }; audio.click(); return; }
        this.roadFrom = src; audio.click(); return;
      }
      const plan = planBetween(this.terrain, 0, this.roadFrom, this.roadTo(cx, cy));
      if (!plan) { this.bark = { who: 'Builder', line: 'No way through for a road there.', t: 2.5 }; return; }
      const cost = plan.fresh * d.cost;
      if (this.prod.credits < cost) { this.bark = { who: 'Builder', line: `That road costs $${cost}.`, t: 2.5 }; return; }
      this.prod.credits -= this.pave(plan, 0) * d.cost;
      this.roadFrom = plan.pts[plan.pts.length - 1]; this.roadPreview = null; this.landT = 0; audio.click(); // carry on from here; right-click to stop
      return;
    }
    if (d.key === 'wall') { // walls are stacked straight away: no builder trip, keep laying until you right-click
      if (this.prod.credits < d.cost) { this.bark = { who: 'Builder', line: 'Not enough credits for sandbags.', t: 2 }; return; }
      this.prod.credits -= d.cost;
      this.addBld('wall', 0, cx, cy, 1, 1, d.name);
      this.lastWall = [cx, cy];
      audio.click();
      return;
    }
    const seep = d.key === 'derrick' ? this.seepNear((cx + 1) * CELL, (cy + 1) * CELL) : null;
    if (seep) { seep.tapped = true; this.terrain.occupied[this.terrain.idx(seep.cx, seep.cy)] = 0; }
    this.addBld(d.key, 0, cx, cy, d.w!, d.h!, d.name);
    const b = this.blds[this.blds.length - 1];
    this.startSite(b);
    if (seep) b.pw = seep.big ? 200 : 100;
    if (!this.keys.has('ShiftLeft') && !this.keys.has('ShiftRight')) this.placing = null; // Shift keeps placing more
    // the selected builders take it on, or else the nearest idle one
    const sel = this.selected().filter((u) => u.type === 'builder');
    const crew = sel.length ? sel : this.builders(0).filter((u) => !u.buildSite).sort((a, b2) => Math.hypot(a.x - cx * CELL, a.y - cy * CELL) - Math.hypot(b2.x - cx * CELL, b2.y - cy * CELL)).slice(0, 1);
    for (const u of crew) this.assignSite(u, b);
    this.bark = { who: 'Builder', line: crew.length ? 'Breaking ground.' : 'Site marked. Send a builder.', t: 2.5 };
    audio.radio();
  }

  drawPlacement(vx: number, vy: number) {
    if (!this.placing || !this.inView(this.mouse.y)) return;
    const ctx = this.ctx, d = this.placing, [cx, cy, ok] = this.placeAt(d), t = this.terrain;
    if (d.key === 'road') { this.drawRoadPlan(vx, vy, cx, cy, ok); return; }
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) {
      const lift = t.lift((x + 0.5) * CELL, (y + 0.5) * CELL);
      const pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b2]) => { const [sx, sy] = toScreen(a * CELL, b2 * CELL); return [Math.round(sx - vx), Math.round(sy - lift - vy)]; });
      ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
      ctx.fillStyle = ok ? 'rgba(126,224,138,0.22)' : 'rgba(232,80,58,0.28)'; ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(126,224,138,0.8)' : 'rgba(232,80,58,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // town centres: a dotted ring round each of your Field Commands, gold when this building would sit inside one
    const mx = cx + d.w! / 2, my = cy + d.h! / 2;
    if (d.key !== 'wall' && d.key !== 'road') for (const h of this.blds) {
      if (h.team !== 0 || h.type !== 'fieldCommand' || h.rise < 1 || h.dying >= 0) continue;
      const hx = h.cx + 1.5, hy = h.cy + 1.5; if (Math.hypot(hx - mx, hy - my) > TOWN + 14) continue;
      const inside = !DEFENCE[d.key] && Math.hypot(hx - mx, hy - my) <= TOWN;
      ctx.fillStyle = inside ? C.gold : 'rgba(216,212,200,0.55)';
      for (let k = 0; k < 240; k++) { if ((k >> 2) & 1) continue; const a = (k / 240) * Math.PI * 2, gx = (hx + Math.cos(a) * TOWN) * CELL, gy = (hy + Math.sin(a) * TOWN) * CELL, [sx, sy] = toScreen(gx, gy); ctx.fillRect(Math.round(sx - vx), Math.round(sy - t.lift(gx, gy) - vy), 2, 2); }
      if (inside) text(ctx, 'TOWN +25%', Math.round(toScreen(mx * CELL, cy * CELL)[0] - vx) - 18, Math.round(toScreen(mx * CELL, cy * CELL)[1] - vy) - 34, C.gold, 1, C.ink);
    }
    if (DEFENCE[d.key]) { // the defences it would join in a fortified line
      const mates = this.blds.filter((o) => o.team === 0 && DEFENCE[o.type] && o.dying < 0 && Math.hypot(o.cx - cx, o.cy - cy) <= FORT);
      for (const o of mates) { const [sx, sy] = this.scr({ x: (o.cx + o.w / 2) * CELL, y: (o.cy + o.h / 2) * CELL }); ctx.fillStyle = mates.length >= 2 ? C.gold : C.cream; ctx.fillRect(Math.round(sx - vx) - 1, Math.round(sy - vy) - 1, 3, 3); }
      if (mates.length >= 2) text(ctx, 'FORTIFIED LINE', Math.round(toScreen(mx * CELL, cy * CELL)[0] - vx) - 26, Math.round(toScreen(mx * CELL, cy * CELL)[1] - vy) - 34, C.gold, 1, C.ink);
    }
    const s = this.looks[d.key + '0'].body[0], [bx, by] = this.scr({ x: (cx + d.w! / 2) * CELL, y: (cy + d.h! / 2) * CELL });
    ctx.globalAlpha = 0.55; ctx.drawImage(s.img, Math.round(bx - vx - s.ax), Math.round(by - vy - s.ay)); ctx.globalAlpha = 1;
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
      u.cargo -= amt; this.prods[u.team].credits += amt * (u.team !== 0 ? this.aiRate : 1);
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
  minimapPoint(): [number, number] { const m = this.mm, sc = SW / m.s; return [(this.mouse.hx - m.x) * sc, (this.mouse.hy - m.y) * sc]; }
  minimapJump() { const [x, y] = this.minimapPoint(); this.centreScreen(x, y); this.vx = this.goalX; this.vy = this.goalY; }
  uiClick(btn: number) {
    const M = this.mouse, hx = M.hx, hy = M.hy;
    if (hx < this.HW - SB) return false; // on the battlefield
    if (btn === 0 && this.minimapHit(hx, hy)) { this.minimapJump(); M.down = true; M.sx = M.x; M.sy = M.y; M.onMap = true; return true; }
    if (btn === 2 && this.minimapHit(hx, hy)) { const [x, y] = this.minimapPoint(); this.command(x, y); return true; }
    const hit = (r: { x: number; y: number; w: number; h: number }) => hx > r.x && hx < r.x + r.w && hy > r.y && hy < r.y + r.h;
    for (const b of this.buttons) if (hit(b)) { if (b.id === 'pause') { this.state = 'paused'; this.menuHot = 0; } else this.order(b.id); audio.click(); return true; }
    for (const c of this.chips) if (hit(c)) { this.select(this.selected().filter((u) => u.type === c.type), false); return true; } // keep only this type
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

const nextFrame = () => new Promise<void>((r) => { waiting.push(r); chan.port2.postMessage(0); });
