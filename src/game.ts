// The game: a big painted map, pre-rendered pixel sprites, and the pixel-art interface,
// all drawn into one small frame that is blown up with hard square pixels.
import * as THREE from 'three';
import { Terrain, SIZES, T, CELL, N, FRONT, LIFT, YAW, YC, YS, SQ, SW, SH, MAP as MAPSIZE, CH, toScreen, toGround, shadeHex, MINI, VIEW, CAM, fromMini } from './terrain';
import { hash3 } from './hash';
const vnoise2 = (x: number, y: number) => (Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) + Math.sin(y * 0.09 + Math.sin(x * 0.05) * 2)) * 0.25 + 0.5; // a cheap wavy pattern for new water
import { bake, facing, Sprite, LIT_FALL, SUNS } from './bake';
import { ART, CIVIC, LIFE, BASE, pine, broadleaf, stump } from './art';
import { BUILDS, DEF, POWER, Production, BuildDef, UPLINK_TIME, INTERCEPT_RANGE, INTERCEPT_RELOAD, SCRAP_LOAD, HARVEST_RATE, UNLOAD_RATE, LAND_RATE, MARAUDER } from './build';
import { AI, Level, Plan, LEVELS } from './ai';
import { SAVE_VERSION, Slot, Codec, encoder, decoder, diff, patch, rle, unrle, writeSave, readSave, saveMetas, forgetSave } from './save';
import { teamColors, TEAMS, ModelDef, VB } from './models';
import { findPath, roadRoute, pathStats, clear as clearLine } from './path';
import { Territory } from './territory';
import { audio, pick, type Pri } from './audio';
import { text, textWidth } from './font';
import { LOOK, grade } from './look';
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
// What each thing does for you, in plain words for someone who has never played a strategy game. Shown on the build
// panel's tooltip and on the card that comes up when you hold the mouse over one on the map.
const ROLE: Record<string, string> = {
  generator: 'MAKES POWER (+100). YOUR BUILDINGS NEED POWER TO WORK: WITHOUT ENOUGH, EVERYTHING SLOWS DOWN. THE POWER BAR AT THE TOP SHOWS HOW MUCH YOU HAVE SPARE.',
  scrapyard: 'MAKES MONEY. COMES WITH A SALVAGER TRUCK THAT GATHERS SCRAP FROM THE GROUND AND BRINGS IT HERE TO SELL.',
  barracks: 'TRAINS SOLDIERS. BUILD MORE TO TRAIN THEM FASTER.',
  line: 'ONE DRAG BUILDS A WHOLE DEFENCE LINE: JUST ENOUGH GUARD TOWERS, CANNONS AND FLAK THAT EVERY STRETCH IS COVERED AGAINST SOLDIERS, VEHICLES AND AIRCRAFT, SANDBAGS BETWEEN, AND A GAP WHEREVER A ROAD CROSSES (AND EVERY 20 SQUARES) SO YOUR ARMY CAN GET OUT. DEFENCES YOU ALREADY HAVE AND YOUR RADAR MEAN FEWER NEW ONES. DOUBLE FLAK ONCE YOU\'VE SEEN AIRCRAFT, DOUBLE CANNONS ONCE YOU\'VE SEEN ARMOUR.',
  wall: 'CHEAP SANDBAGS. DRAG TO LAY A LINE THAT STEERS ATTACKERS INTO YOUR GUNS. ACROSS A ROAD IT MAKES A ROADBLOCK.',
  guardTower: 'A MACHINE GUN THAT FIRES ON ITS OWN. GREAT AGAINST SOLDIERS, WEAK AGAINST TANKS. SPOTS SOLDIERS HIDING NEARBY. THREE DEFENCES CLOSE TOGETHER TAKE 25% LESS DAMAGE.',
  fieldCommand: 'YOUR HEADQUARTERS. TRAINS BUILDERS AND CLAIMS THE LAND AROUND IT (LAND EARNS MONEY). BUILDINGS INSIDE ITS CIRCLE WORK 25% FASTER. LOSE YOUR LAST ONE AND YOU HAVE A MINUTE TO BUILD ANOTHER.',
  depot: 'BUILDS VEHICLES: TANKS, TRUCKS AND MORE. BUILD MORE TO BUILD THEM FASTER.',
  workshop: 'UNLOCKS HEAVY WEAPONS (FIELD GUNS, JUGGERNAUTS) AND THE BIGGEST BUILDINGS. REPAIRS YOUR VEHICLES PARKED NEARBY.',
  derrick: 'BUILT ON OIL YOU HAVE STRUCK: GIVES POWER AND STEADY MONEY.',
  emplacement: 'A BIG CANNON THAT FIRES ON ITS OWN. STOPS TANKS FROM FAR AWAY, BUT SOLDIERS CAN WALK RIGHT UP TO IT. UNDER YOUR RADAR IT REACHES EVEN FURTHER, PAST ENEMY FIELD GUNS: PUT A FEW AT THE FRONT. THREE DEFENCES CLOSE TOGETHER TAKE 25% LESS DAMAGE.',
  reactor: 'MAKES A LOT OF POWER (+400). IF IT IS DESTROYED IT BLOWS UP, HURTING EVERYTHING NEARBY.',
  airfield: 'BUILDS AIRCRAFT: GUNSHIPS AND BOMBERS.',
  flakTower: 'AN ANTI-AIRCRAFT GUN THAT FIRES ON ITS OWN. IT CANNOT HIT ANYTHING ON THE GROUND. UNDER YOUR RADAR IT REACHES MUCH FURTHER, SO A FEW COVER A WHOLE BASE AND BOMBERS FALL BEFORE THEY DROP. THREE DEFENCES CLOSE TOGETHER TAKE 25% LESS DAMAGE.',
  radar: 'SHOWS EVERY ENEMY IN A WIDE CIRCLE AS A DOT ON YOUR RADAR (BUT NOT WHAT IT IS). FIELD GUNS CAN FIRE AT THOSE DOTS, YOUR CANNONS IN ITS CIRCLE REACH FAR ENOUGH TO HIT ENEMY FIELD GUNS SHELLING YOUR BASE, AND YOUR FLAK TOWERS IN IT REACH FURTHER TOO. SPOTS HIDING SOLDIERS NEARBY. NEEDS POWER.',
  provingGround: 'BUILDS THE COLOSSUS, A GIANT SUPER-UNIT.',
  interceptor: 'SHOOTS DOWN AN ORBITAL STRIKE AIMED NEAR IT. HOLDS TWO SHOTS AND RELOADS SLOWLY.',
  builder: 'PUTS UP YOUR BUILDINGS AND REPAIRS DAMAGE. A SMALL GUN KEEPS A LONE SOLDIER OFF IT.',
  rifle: 'A CHEAP SOLDIER. THE ONE TO CAPTURE BUILDINGS AND GO INTO BUNKERS. HIDES WHEN STANDING STILL IN WOODS.',
  rocket: 'A SOLDIER WITH ROCKETS: KILLS TANKS AND AIRCRAFT, BUT LOSES TO RIFLEMEN.',
  grenadier: 'A SOLDIER WITH GRENADES: BREAKS UP GROUPS OF SOLDIERS AND CLEARS THEM OUT OF BUNKERS.',
  scout: 'A FAST BUGGY THAT SEES FAR. HUNTS SOLDIERS, FINDS OIL, SPOTS HIDING UNITS. CARRIES 2 SOLDIERS. SCOUT (C) SENDS IT EXPLORING ON ITS OWN.',
  harvester: 'A SALVAGER TRUCK: GATHERS SCRAP FROM THE GROUND AND TAKES IT TO A SCRAPYARD FOR MONEY. KEEP IT SAFE.',
  tank: 'THE ALL-ROUND TANK. BEST AGAINST VEHICLES AND BUILDINGS. CARRIES 4 SOLDIERS ON A LONG MARCH.',
  flak: 'A TRUCK WITH AN ANTI-AIRCRAFT GUN. SEND IT WITH YOUR ARMY TO KEEP AIRCRAFT OFF. CARRIES 2 SOLDIERS.',
  bomber: 'BREAKS BUILDINGS WITH A LINE OF HEAVY BOMBS. NEARLY HARMLESS TO UNITS. ANTI-AIRCRAFT GUNS EAT IT.',
  colossus: 'A GIANT SUPER-UNIT THAT CRUSHES TANKS AND ARMIES. LOTS OF ROCKET SOLDIERS OR CANNONS ARE WHAT STOP ONE.',
  artillery: 'A LONG-RANGE GUN: HITS DEFENCES FROM BEYOND THEIR REACH. HELPLESS UP CLOSE.',
  juggernaut: 'A HUGE HEAVY TANK. RUNS OVER SOLDIERS. CARRIES 6 SOLDIERS ON A LONG MARCH.',
  gunship: 'AN AIRCRAFT THAT HUNTS UNITS WITH ROCKETS. WEAK AGAINST BUILDINGS.',
  bridge: 'A BRIDGE OVER THE WATER. EXPLOSIVES CAN BRING IT DOWN, AND BUILDERS CAN PUT IT BACK UP.',
};
// The word under each build button, so look-alike pictures can't be mixed up. At most 7 letters: that's all a button holds.
// what each build card says: its name if it fits the card, else a shortening of that same name (never a different word)
const SHORT: Record<string, [string, string]> = {
  fieldCommand: ['COMMAND', 'CMD'], generator: ['GENERATOR', 'GENRTR'], scrapyard: ['SCRAPYARD', 'SCRAP'], barracks: ['BARRACKS', 'BARRKS'],
  depot: ['DEPOT', 'DEPOT'], derrick: ['DERRICK', 'DERRCK'], workshop: ['WORKSHOP', 'WRKSHP'], radar: ['RADAR', 'RADAR'], airfield: ['AIRFIELD', 'AIRFLD'],
  reactor: ['REACTOR', 'REACTR'], interceptor: ['INTERCEPT', 'INTCPT'], provingGround: ['PROVING', 'PROVNG'], wall: ['SANDBAGS', 'WALL'], line: ['DEF LINE', 'LINE'],
  guardTower: ['GUARD TWR', 'GUARD'], flakTower: ['FLAK TWR', 'FLAK T'], emplacement: ['CANNON', 'CANNON'],
  builder: ['BUILDER', 'BUILDR'], harvester: ['SALVAGER', 'SALVGR'], rifle: ['RIFLEMAN', 'RIFLE'], rocket: ['ROCKET', 'ROCKET'], grenadier: ['GRENADIER', 'GRNDR'],
  scout: ['SCOUT', 'SCOUT'], flak: ['FLAK TRK', 'FLAK'], tank: ['TANK', 'TANK'], artillery: ['FIELD GUN', 'FLDGUN'], juggernaut: ['JUGGERNAUT', 'JUGGER'],
  gunship: ['GUNSHIP', 'GUNSHP'], bomber: ['BOMBER', 'BOMBER'], colossus: ['COLOSSUS', 'COLOSS'],
};
const GB = Math.ceil(N / 4); // unit-grid buckets per side
const ALT = 26; // how high aircraft fly, in screen pixels
// where smoke leaves a building: [x, z, height, puffs per second]
const VENTS: Record<string, [number, number, number, number]> = { generator: [8, 12, 40, 5], scrapyard: [9, 9, 40, 3] }; // width of the side panel, in panel pixels

// The map's paint workers start the moment the game's code loads, so they load their own code while
// the map is being made (instead of only starting once it's ready)
const EARLY: Worker[] = (() => { try { const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)); return Array.from({ length: n }, () => new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}${FRONT ? "f" : ""}` })); } catch { return []; } })();
const CAMO = new Set(['rifle', 'rocket', 'grenadier', 'artillery']); // who can hide still in forest
const DETECT: Record<string, number> = { near: 2.5, scout: 6, guardTower: 6, radar: 12 }; // spotting reach, in squares
const NOTICE = 4; // squares past its reach that a unit on an attack order notices an enemy and turns aside to fight it
const HOME_R = 20; // squares: how far round its Field Command a builder takes work
const INTERCEPT = 9, LEASH = 12; // squares: how far off an idle unit goes out to meet an enemy it can see, and the most it strays from its spot doing it
const RADAR_R = 30, SWEEP = 1.6, TAU = Math.PI * 2, RADAR_CANNON = 320, RADAR_FLAK = 300; // RADAR_CANNON: a cannon emplacement's reach inside its side's radar cover: past field guns (240) shelling defences a few squares in front of it
const _r0 = 0; // radar reach in squares, and its sweep (radians a second: once round about every four seconds)
const SIGHT_SCALE = 1.3; // fog of war a bit wider: everyone sees about a third further
const SIGHT: Record<string, number> = { tank: 6, builder: 7, rifle: 5, rocket: 5, grenadier: 5, juggernaut: 6, wall: 1, reactor: 5, gunship: 7, flak: 6, radar: 7, flakTower: 7, airfield: 6, colossus: 8, provingGround: 5, interceptor: 6, bomber: 7, scout: 9, artillery: 4, harvester: 4, workshop: 4, fieldCommand: 8, guardTower: 7, emplacement: 7, commTower: 24, powerPlant: 4, repairYard: 4 }; // how far each thing sees, in squares
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
  'burning', 'fireT', 'dams', 'drains', 'recedes', 'floodMask', 'floods', 'camps', 'marauderT', 'cloakT', 'told', 'goalDone', 'idleCash', 'unlockT', 'okBefore', 'rules', 'endWhy', 'waveT', 'waveNo', 'points', 'plans', 'callT'];
const ROOMY = 80; // squares a unit must be able to reach for its spot to count as open ground, not a pocket
const PATH_WORK = 60000, REPLAN = 12000; // REPLAN: a quick re-plan on the move searches less than a fresh order
const hash1 = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }; // a steady random number for a seed
// One full day every ten minutes, starting mid-morning: the first dusk comes about four minutes in,
// and a 35-minute match sees three or four nights. Phase 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.
const DAY_LEN = 720, DAY_START = 0.32, SUN_STEPS = 200; // a full day and night: 12 minutes (a shadow moves one step every 1.8 seconds)
// the day's three suns (bake.ts SUNS) on the turned ground: toward the sun along the ground x and y, and up
const SUN_GROUND = SUNS.map((v) => [YC * v.x + YS * v.z, -YS * v.x + YC * v.z, v.y]);
const BAKED = [1 / 1.7, (0.9 / 1.7) * SQ]; // where the art's baked shadows fall: screen pixels right and down per pixel of height (see bake.ts SUN; down only SQ as far, as the ground is drawn squashed)
// The light at each time of day, as a colour the world is multiplied by (white = untouched). Night
// stays bright enough to read every unit: it shifts blue more than it darkens.
const SKY: [number, number, number, number][] = [
  [0.0, 112, 128, 186], [0.2, 116, 130, 188], [0.25, 196, 168, 196], [0.3, 236, 222, 226], [0.36, 252, 250, 255],
  [0.62, 255, 254, 250], [0.7, 255, 230, 190], [0.75, 252, 204, 178], [0.785, 200, 140, 172], [0.83, 124, 132, 190], [1.0, 112, 128, 186],
];
const LAST_STAND = 60; // seconds to raise or take a Field Command after losing the last one
// Game modes, picked on New Game: STANDARD is the game as designed (and the only one the computer's fair-play promise covers);
// the others are the player's own choice for easy fun or a brutal challenge, named at the top of the sidebar all game.
// build: how much faster your side builds and trains; endless: your money never runs out; see: no fog; pace: the whole battle
// runs this many times as fast; copies: every unit trained comes out as this many; unlock: every building from the start; clock: real seconds
// until the game ends and whoever holds the most ground wins; survive: a survival clock, the best time kept; goal: the title card as a game starts;
// earn/start/hit: enemy computers' income, starting money and damage, times this; sudden: no last stand for you.
interface Rules { name: string; tag: string; icon: string; note: string; goal: string; unlock?: boolean; clock?: number; survive?: boolean; build?: number; endless?: boolean; see?: boolean; pace?: number; copies?: number; earn?: number; start?: number; hit?: number; sudden?: boolean }
// FRONT LINE's call-ins, bought with points from the fighting (the same for both sides): POINT_SHARE of a unit's price to the troops that destroy it, and the same to the side that loses it
const POINT_SHARE = 0.12;
const CALLS: Record<string, { name: string; cost: number; note: string }> = {
  reinforce: { name: 'REINFORCE', cost: 1200, note: '2 TANKS, 2 RIFLEMEN AND 2 ROCKET SOLDIERS ARRIVE AT ONCE AT YOUR MOST FORWARD SITE.' },
  barrage: { name: 'BARRAGE', cost: 1500, note: 'CLICK IT, THEN CLICK THE MAP: SHELLS RAIN ON THE SPOT FOR A FEW SECONDS. DEADLY TO A CROWD, FRIEND OR FOE.' },
  orbital: { name: 'ORBITAL STRIKE', cost: 4000, note: 'CLICK IT, THEN CLICK THE MAP: A HUGE BLAST FROM ORBIT A FEW SECONDS LATER. IT ONLY DENTS A FIELD COMMAND.' },
};
const MODES: Record<string, Rules> = {
  standard: { name: 'STANDARD', tag: 'THE FULL WAR', icon: 'fieldCommand', note: 'THE GAME AS DESIGNED. SUGGESTED.', goal: '' },
  sandbox: { name: 'SANDBOX', tag: 'BUILD ANYTHING', icon: 'builder', note: 'EASY FUN: ENDLESS MONEY, INSTANT BUILDING, EVERY BUILDING UNLOCKED AND THE WHOLE MAP IN VIEW. BUILD ANYTHING.', goal: 'ENDLESS MONEY. BUILD ANYTHING.', build: 20, endless: true, see: true, unlock: true },
  blitz: { name: 'BLITZ', tag: '10-MINUTE WAR', icon: 'scout', note: 'A 10-MINUTE WAR: EVERYTHING RUNS THREE TIMES AS FAST FOR EVERY SIDE, AND WHOEVER HOLDS THE MOST GROUND WHEN THE CLOCK RUNS OUT WINS.', goal: 'MOST GROUND IN 10 MINUTES WINS', pace: 3, clock: 600 },
  mayhem: { name: 'MAYHEM', tag: 'HUGE ARMIES', icon: 'rifle', note: 'HUGE WARS: EVERY UNIT ANYONE TRAINS COMES OUT AS THREE. SAME PRICES, THREE TIMES THE ARMY.', goal: 'THREE OF EVERY UNIT, FOR EVERYONE', copies: 3 },
  front: { name: 'FRONT LINE', tag: 'WAVE ON WAVE', icon: 'tank', note: 'A DIFFERENT WAR: ONE LONG VALLEY, NO BUILDING AND NO MONEY. EVERY 30 SECONDS BOTH SIDES GET THE SAME SURPRISE WAVE OF TROOPS; TAKE SITES TO BRING YOURS IN FURTHER FORWARD. DESTROY THEIR FIELD COMMAND TO WIN.', goal: 'DESTROY THEIR FIELD COMMAND' },
  nightmare: { name: 'NIGHTMARE', tag: 'SURVIVE', icon: 'colossus', note: 'HOW LONG CAN YOU LAST? THE ENEMY EARNS TRIPLE, HITS HALF AGAIN AS HARD, AND YOU GET NO LAST STAND. YOUR BEST TIME IS KEPT.', goal: 'SURVIVE AS LONG AS YOU CAN', survive: true, earn: 3, start: 2, hit: 1.5, sudden: true },
};
// How each mode's card looks on the New Game page: its sky (top band first), its ground (fill, top edge) and its colour
const MODE_LOOK: Record<string, { sky: string[]; ground: [string, string]; accent: string }> = {
  standard: { sky: ['#3a2c3c', '#6a3c3a', '#a0503a', '#c8703a'], ground: ['#3a3424', '#5a5034'], accent: '#f0c030' },
  sandbox: { sky: ['#3a78b8', '#4a8ac8', '#62a0d4', '#82b8e0'], ground: ['#3c6a2c', '#5a8a3c'], accent: '#7ee08a' },
  blitz: { sky: ['#a03a18', '#c85820', '#e07c28', '#f0a038'], ground: ['#4a3420', '#6a4a2c'], accent: '#ffb030' },
  mayhem: { sky: ['#2a1414', '#4a1a16', '#6a2018', '#8a2a1a'], ground: ['#241a14', '#3a2a1c'], accent: '#ff5a40' },
  front: { sky: ['#5a5a48', '#6e6c54', '#868260', '#9a9468'], ground: ['#3e3a28', '#5a5438'], accent: '#d8c890' },
  nightmare: { sky: ['#0c0a18', '#141028', '#1e1636', '#2a1a3c'], ground: ['#120e14', '#24182a'], accent: '#c070ff' },
};
const CO_SIZE = 8, DIV_SIZE = 32, CO_KIND: Record<string, string> = { barracks: 'INF', depot: 'ARM', airfield: 'AIR', provingGround: 'SUP' }; // companies of up to 8; a division takes 4 full ones, then the next starts
const TOWN = 9, FORT = 6; // town-centre reach and fortified-line spacing, in squares
const LINE_DEPTH = 2, LINE_GATE = 20, LINE_MAX = 240; // a defence line: under fire 2 squares before the line, a 2-square gate after 20 solid ones, 240 squares at most
const DOT = ['#6ab8ff', '#ff5a40', '#d8d4c8', '#7ad860', '#ffc040', '#d07ae0']; // each side's colour on the radar and icons
const FLAG = [['#5a8ac0', '#3a5a80'], ['#c85040', '#8a3428'], ['#d8d4c8', '#9a968a'], ['#5a9a40', '#3a6a28'], ['#d0a038', '#8a6a20'], ['#a060b0', '#6a3a78']];
// how many sides and whether it's teams, read before the map is made (the map's symmetry depends on it)
function storedPlayers() { try { const n = Number(localStorage.getItem('conquer-players')); return n >= 2 && n <= 4 ? n : 2; } catch { return 2; } }
const CAR_PAINT = [0xc8a840, 0x5a7a9a, 0x8a3a2a, 0xd8d4c8].map(teamColors);
const SHIRTS = [0xa86a3a, 0x6a8a5a, 0xc8c0a8].map(teamColors);
// What each capturable site does once your infantry take it.
const HIGH: Record<string, Weapon> = Object.fromEntries(Object.entries(WEAPONS).map(([k, w]) => [k, { ...w, range: w.range * 1.15 }])); // a weapon fired from a plateau: 15% more reach
const GLOW_T = 2.5; // seconds newly won ground glows
const BODY_T = 12; // seconds a fallen soldier lies on the ground (the last two fading)
const SITE_REACH = 7; // a captured site's own reach: it claims the land round it and links your buildings nearby
const CAPTURE: Record<string, { name: string; tip: string; garrison?: number }> = {
  motorPool: { name: 'Motor Pool', tip: 'CAPTURE IT WITH SOLDIERS: IT HANDS YOU A TANK, THEN ANOTHER EVERY 90 SECONDS.' },
  recruitOffice: { name: 'Recruiting Office', tip: 'CAPTURE IT WITH SOLDIERS: IT HANDS YOU 3 RIFLEMEN, THEN 2 MORE EVERY MINUTE.' },
  bunker: { name: 'Bunker', tip: 'SEND UP TO 3 SOLDIERS INSIDE AND THEY SHOOT FROM COVER.', garrison: 3 },
  watchtower: { name: 'Watchtower', tip: 'SEND 2 SOLDIERS UP AND THEY SEE FAR FROM THE HIGH GROUND.', garrison: 2 },
  fuelDepot: { name: 'Fuel Depot', tip: 'CAPTURE IT WITH SOLDIERS: IT PAYS YOU $8 A SECOND WHILE YOU HOLD IT.' },
  uplink: { name: 'Orbital Uplink', tip: 'CAPTURE AND HOLD IT WITH SOLDIERS: IT CHARGES AN ORBITAL STRIKE EVERY 3 MINUTES. THEN SELECT IT AND RIGHT-CLICK A TARGET.' },
  townHall: { name: 'Town Hall', tip: 'CAPTURE IT WITH SOLDIERS: THE TOWN TRADES WITH YOU, $5 A SECOND.' },
  powerPlant: { name: 'Power Plant', tip: 'CAPTURE IT WITH SOLDIERS: +250 FREE POWER WHILE YOU HOLD IT.' },
  dam: { name: 'Hydro Dam', tip: 'IT HOLDS BACK A LAKE. RIGHT-CLICK IT WITH SOLDIERS TO CAPTURE IT: +400 FREE POWER. TO BLOW IT UP, PRESS ATTACK AND CLICK IT (TANKS, ROCKETS, FIELD GUNS AND BOMBERS CAN): THE LAKE FLOODS THE VALLEY BELOW.' },
  commTower: { name: 'Comm Tower', tip: 'CAPTURE IT WITH SOLDIERS: YOU SEE FAR ACROSS THE MAP.' },
  repairYard: { name: 'Repair Yard', tip: 'CAPTURE IT WITH SOLDIERS: IT REPAIRS YOUR UNITS PARKED NEARBY.' },
};

interface UnitDef {
  name: string; hp: number; speed: number; turn: number; radius: number; crush: boolean; vehicle: boolean; facings: number; track: number; weapon?: string; air?: boolean; weapon2?: string; // weapon2: a second gun that fires on its own
  barks: { select: string[]; move: string[]; attack?: string[] }; // attack: what it shouts when sent at the enemy (else a general line)
}
const DEFS: Record<string, UnitDef> = {
  tank: {
    name: 'Battle Tank', hp: 400, speed: 36, turn: 2.2, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon: 'cannon',
    barks: { select: ['Armour\'s warm.', 'Point me at something.', 'Forty tons of opinion.', 'Tank crew. Mostly awake.', 'Loaded and waiting.', 'Turret\'s oiled.', 'We go through, not around.', 'Who ordered the big gun?'], move: ['Rolling.', 'Out of my way, scenery.', 'Mind the paint.', 'Shortcut. Through that wall.', 'Treads moving.', 'Mud? What mud?', 'Rolling heavy.', 'Making new roads.'], attack: ['Firing!', 'On the way!', 'Knock knock!', 'Reload, fire again!', 'Eat steel!', 'Ding! Next!'] },
  },
  harvester: {
    name: 'Salvager', hp: 600, speed: 22, turn: 1.6, radius: 11, crush: true, vehicle: true, facings: 32, track: 5,
    barks: { select: ['Scrap is money.', 'One man\'s wreck...', 'Back in my day, we walked.', 'Bins are empty, sonny.', 'Where\'s the junk?', 'Junk is my business.', 'Treasure is treasure.', 'Got rust? I want it.'], move: ['Heavy load, slow road.', 'Moving out.', 'Off to dig.', 'My knees say no. Going anyway.', 'Hauling.', 'Junkyard bound.', 'Smells like money.', 'Loaded and lumbering.'] },
  },
  builder: {
    name: 'Builder', hp: 500, speed: 22, turn: 1.8, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon2: 'sidearm',
    barks: { select: ['Hard hat on.', 'What are we building?', 'Got plans, sonny?', 'Builder here. Talk slow.', 'Seen worse. Built worse.', 'Coffee first? No? Fine.', 'Forty years of building.', 'Pass me that hammer.'], move: ['On my way.', 'Bringing the toolbox.', 'Mind the scaffolding.', 'Hold your horses, going.', 'These old legs still work.', 'Off to fix something.', 'Back aches, boots move.', 'Shortcut through the mud.'] },
  },
  rocket: {
    name: 'Rocket Soldier', hp: 50, speed: 21, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'rocket',
    barks: { select: ['Tube\'s loaded.', 'Seen any armour?', 'I eat tanks.', 'Show me steel.', 'Got a tin can for me?', 'Armour-piercing mood.', 'Point me at metal.', 'Love the smell of exhaust.'], move: ['Hauling the tube.', 'Heavy tube, short legs.', 'Relocating.', 'Tanks fear me. Rightly.', 'Moving.', 'Tube\'s heavy. Moving.', 'Shoulder hurts. Going.', 'Hunting metal.'], attack: ['Rocket away!', 'Backblast clear!', 'Crack that shell!', 'Scratch one tank!', 'Hello, tin can!', 'Tube\'s hot!'] },
  },
  scout: {
    name: 'Scout Buggy', hp: 180, speed: 52, turn: 4, radius: 8, crush: false, vehicle: true, facings: 32, track: 2, weapon: 'mg',
    barks: { select: ['Engine\'s warm.', 'Fastest thing out here.', 'Where we headed?', 'Need eyes? I got two.', 'Wheels up!', 'Gas tank\'s full.', 'I go fast, you stay safe.', 'Wheels, wheels, wheels.'], move: ['Floor it!', 'Hold on to something.', 'Seatbelts are optional.', 'Gone.', 'Back before you miss me.', 'Zooming!', 'Hang on to your hat.', 'Speed is armour.'], attack: ['Hit and run!', 'Drive-by!', 'Too fast for \'em!', 'Keep moving, keep shooting!', 'Pew pew!', 'Drive by and wave!'] },
  },
  artillery: {
    name: 'Field Gun', hp: 200, speed: 24, turn: 1.4, radius: 10, crush: false, vehicle: true, facings: 32, track: 4, weapon: 'howitzer',
    barks: { select: ['Give me coordinates.', 'Long way to be dangerous.', 'Gun crew standing by.', 'Distance is a feeling.', 'Range it for me.', 'Kettle\'s on, gun\'s hot.', 'Pick a hill. Any hill.', 'We reach out and touch.'], move: ['Relocating the gun.', 'Slow and steady.', 'Keep the scouts close.', 'Hitching the gun.', 'Mind my good gun.', 'Mind the wheels.', 'Packing up the gun.', 'Old gun, old legs.'], attack: ['Shot out!', 'Adjust fire!', 'Splash incoming!', 'Rounds downrange!', 'Fire for effect!', 'Shell out, cover ears!'] },
  },
  grenadier: {
    name: 'Grenadier', hp: 70, speed: 21, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'grenade',
    barks: { select: ['Who\'s hiding?', 'Got a present for them.', 'Pin\'s in. For now.', 'Bang, coming up.', 'Knock knock.', 'Got pins, got problems.', 'Boom is my love language.', 'Need a door opened?'], move: ['Mind the satchel.', 'Right behind you.', 'Keeping low.', 'Satchel\'s heavy. Don\'t ask.', 'On my way.', 'Sneaking.', 'Clink clink, moving.', 'Mind the boom bag.'], attack: ['Frag out!', 'Smoke \'em out!', 'Catch!', 'Out the windows!', 'Fire in the hole!', 'Duck and cover!'] },
  },
  juggernaut: {
    name: 'Juggernaut', hp: 1800, speed: 22, turn: 1.1, radius: 13, crush: true, vehicle: true, facings: 32, track: 7, weapon: 'heavy',
    barks: { select: ['The ground shakes.', 'Who needs a door?', 'Juggernaut, awake.', 'Nothing gets through this.', 'Ask me about my armour.', 'Slow. Unstoppable.', 'Big. Angry. Ready.', 'Walls are a suggestion.'], move: ['Nothing stops us.', 'Clear the road.', 'Excuse me. Coming through.', 'Slow and certain.', 'Grinding forward.', 'Step aside, tank.', 'Lumbering on.', 'The road can take it.'], attack: ['Break them.', 'Flatten it.', 'Full broadside!', 'Crush it.', 'Pulverise!', 'Make it rubble!'] },
  },
  gunship: {
    name: 'Gunship', hp: 280, speed: 80, turn: 3, radius: 9, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'gunrockets', air: true,
    barks: { select: ['Rotors turning.', 'Where do you want the rain?', 'Eyes in the sky.', 'Gunship on station.', 'Fuelled and angry.', 'Chopper ready.', 'Air support, at your service.', 'Blades spinning.'], move: ['Inbound.', 'Low and fast.', 'Over the river we go.', 'Banking now. Hold your lunch.', 'On approach.', 'Skimming the trees.', 'Nose down, going.', 'Rotor wash coming.'], attack: ['Guns, guns, guns!', 'Rockets away!', 'Strafing run!', 'Here comes the rain!', 'Hosing them down!', 'Bringing the thunder!'] },
  },
  flak: {
    name: 'Flak Truck', hp: 260, speed: 36, turn: 1.8, radius: 10, crush: true, vehicle: true, facings: 32, track: 5, weapon: 'flak',
    barks: { select: ['Watching the skies.', 'Anything with rotors.', 'Flak ready.', 'Sky\'s mine.', 'Birds, beware.', 'Clouds look suspicious.', 'Eyes up, always.', 'Nothing flies today.'], move: ['Rolling.', 'Keeping up.', 'Moving the guns.', 'Repositioning.', 'Covering you.', 'Guns up, moving.', 'Following the sky.', 'Truck rolling.'], attack: ['Air contact!', 'Fill the sky!', 'Flak up!', 'Bring it down!', 'Clear the skies!', 'Swat it!'] },
  },
  bomber: {
    name: 'Bomber', hp: 420, speed: 66, turn: 1.6, radius: 12, crush: false, vehicle: true, facings: 32, track: 0, weapon: 'bombs', air: true,
    barks: { select: ['Bomb bay loaded.', 'Mark the target.', 'Heavy payload.', 'Bomber on station.', 'Point me at a building.', 'Bombs are polished.', 'Big bird ready.', 'Need a parking lot made?'], move: ['Holding course.', 'On the bomb run.', 'Inbound.', 'Steady... steady.', 'Course set.', 'Climbing.', 'Lining up.', 'Cruising altitude.'], attack: ['Bombs away!', 'Special delivery!', 'Doors open!', 'Drop, drop, drop!', 'Rain it down!', 'Bombs gone!'] },
  },
  colossus: {
    name: 'Colossus', hp: 12000, speed: 18, turn: 0.8, radius: 22, crush: true, vehicle: true, facings: 32, track: 9, weapon: 'colossus', weapon2: 'colossusFlak',
    barks: { select: ['The earth trembles.', 'Point. I will flatten.', 'Colossus stands.', 'I am the siege.', 'Speak, small one.', 'Tiny commander. Speak.', 'I cast a long shadow.', 'Mountains envy me.'], move: ['Onward.', 'Nothing stands.', 'Make way.', 'Mind your toes.', 'Advancing.', 'Step. Step. Step.', 'Pardon the crater.', 'The earth complains.'], attack: ['Erase it.', 'Bring it down.', 'Fall.', 'Ruin.', 'Be dust.', 'Kneel.'] },
  },
  rifle: {
    name: 'Rifleman', hp: 75, speed: 24, turn: 12, radius: 3, crush: false, vehicle: false, facings: 8, track: 0, weapon: 'rifle',
    barks: { select: ['Still breathing.', 'What\'s the job?', 'Boots laced.', 'Rifleman here.', 'Point and I\'ll walk.', 'Locked and loaded.', 'Ready, sir!', 'Who are we shooting?'], move: ['Moving.', 'On the double.', 'Hoofing it.', 'Are we there yet?', 'Eyes up, moving.', 'Feet hurt. Moving.', 'Double time!', 'Following orders.'], attack: ['Contact!', 'Light \'em up!', 'Put rounds on it!', 'Open fire!', 'Hit the deck and fire!', 'Suppressing!'] },
  },
};

let nextId = 1;
class Unit {
  base: Bld | null = null; // a builder's home: the Field Command it works for (it takes jobs round there, and goes back when idle)
  post: [number, number] | null = null; // where an idle unit stood before it went out to meet an enemy (it comes back here)
  cant = new Map<Bld, number>(); siteTries = 0; // builders: sites this one couldn't get to (until when it leaves them be), and tries at the current one
  id = nextId++; gone = false; hp: number; heading = Math.PI * 1.75; tHead = Math.PI * 1.75;
  path: [number, number][] = []; goal: [number, number] | null = null;
  squeeze = 0; // until when it's squeezing past someone in a tight spot
  selected = false; moving = false; trackAcc = 0; stuck = 0; bob = 0; scan = 0; scanTo = 0; dust = 0; enter: Bld | null = null;
  cargo = 0; unloading = false; // salvagers
  revT = -99; // when its engine was last heard (builders and salvagers rumble now and then as they drive)
  home: [number, number] | null = null; // marauders: the spot they guard and drift back to
  hitAt = -99; // when it last took damage (home ground repairs only out of the fight)
  queue: [number, number][] = []; pace = 0; avoid = 0; progT = 0; px0 = 0; py0 = 0; // progT: watching for a unit that has a route but isn't getting anywhere // avoid: times it gave up on a goal
  strike: Unit | Bld | null = null; // marching on this target, to hit it once there
  spot: [number, number] | null = null; // riding: its own place at the end of the march (once off, it walks there, into the soldiers' row)
  ride: Unit | null = null; seat = 0; riders: Unit[] = []; wave: { members: Unit[]; first: number } | null = null; mopUp: [number, number] | null = null; gather: { members: Unit[]; first: number; go: [number, number]; released: boolean } | null = null; // infantry riding on a vehicle for a long march (and the vehicle's passengers)
  buildSite: Bld | null = null; hold = false; rest = 0; // builders: the construction site they're working on; hold: sent somewhere by you, so it rests there a while (until rest) before taking the next job // waypoints still to visit; group pace (0 = own speed)
  flashAt = -99; stepN = 0; // when a blast last hit it (it flashes white); the Colossus's footstep count
  lx = NaN; ly = NaN; fwd = 0; lurch = 0; lurchV = 0; // vehicles (looks only): where it was last frame, its speed ahead, and the hull rocking on its springs (pixels along its heading)
  cloak = 0; firedAt = -99; // cloak: which alliances can't see it right now (a bit each); firedAt: when it last shot
  face: number | null = null; // the way to turn once it arrives (the front of its formation)
  xp = 0; reload2 = 0; target2: Unit | Bld | null = null; // veterancy: the damage it has dealt; the second gun
  get rank() { const m = Math.max(this.def.hp, DEF[this.type]?.cost ?? 0); return this.xp >= m * 8 ? 3 : this.xp >= m * 3 ? 2 : this.xp >= m ? 1 : 0; } // a rank for dealing its own health (or its price, if that's more) in damage, then three and eight times it (kills went only to the last hit, so 95% of units never ranked)
  fallBack = false; scouting = false; flankT = 0; // falling back: running home, not shooting, harder to hit; flankT: when 'FLANKED' last showed over it
  target: Unit | Bld | null = null; forced = false; amove = false; reload = 0; scanT = Math.random() * 0.3; chase = 0; chaseTo: [number, number, [number, number] | undefined] | null = null; // combat (chaseTo: the target's spot when its chase route was planned, and that route's end)
  constructor(public type: string, public def: UnitDef, public team: number, public x: number, public y: number) { this.hp = def.hp; }
}
interface Tree { x: number; y: number; v: number; fall: number; dir: number; i: number } // i: its place in the map's own list (for saving)
interface Bld { gone?: boolean; job?: number; failedBy?: Set<Unit>; blocked?: number; type: string; team: number; cx: number; cy: number; w: number; h: number; name: string; garrison: number; timer: number; rise: number; rally: [number, number] | null; pw?: number;
  hp: number; max: number; reload: number; tHead: number; target: Unit | Bld | null; dying: number; seen?: boolean;
  cleared?: boolean; drive?: boolean; face?: number; holder?: number; ammo?: number; idle?: number; hitAt?: number } // hitAt: when a blast last hit it (it shudders) // idle: seconds a marked site has waited for a builder // interceptors in stock
// Civilians, cars and animals going about their day.
interface Division { units: Unit[]; fresh: Unit[]; since: number; feed: boolean; companies: Unit[][]; own?: boolean; attack?: boolean } // attack: pushing on the enemy on its own (ATK) // own: formed by hand (never folded into another) // companies: its units in groups of up to 8, by the kind of factory that made them
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
  get front() { return this.rules === 'front'; } // FRONT LINE chosen for the next game (FRONT: this map is one)
  rules = ((v) => (v in MODES ? v : 'standard'))(this.setting('rules', 'standard')); // the game mode (MODES); a save keeps its own
  get R() { return MODES[this.rules] ?? MODES.standard; }
  ai: AI | null = null; ais: AI[] = []; out = new Set<number>(); // computer players; sides knocked out
  menuRects: { id: string; x: number; y: number; w: number; h: number }[] = [];
  loadStep = 0; loadTotal = 1;
  mouse = { x: 0, y: 0, hx: 0, hy: 0, down: false, sx: 0, sy: 0, drag: false, mid: false, last: 0, in: false, onMap: false, rdown: false, rsx: 0, rsy: 0 }; // rdown, rsx, rsy: a right-drag and where it began (map pixels)
  keys = new Set<string>();
  divisions: (Division | null)[] = [{ units: [], fresh: [], since: 0, feed: true, companies: [] }, null, null, null, null]; divT = 0; // up to five standing divisions, on keys 1-5. The 1st starts empty and takes every new fighting unit, so your army is one card from the first soldier
  prods = [0, 1, 2, 3, 4, 5].map(() => new Production()); // per side (2, neutral, is unused)
  get prod() { return this.prods[0]; }
  powers = [0, 1, 2, 3, 4, 5].map(() => ({ made: 0, used: 0 }));
  // how well a side's power covers what it uses: short of power, everything runs that much slower
  powerEff(team: number) { const p = this.powers[team]; return p.used <= p.made ? 1 : Math.max(0.25, p.made / p.used); }
  get power() { return this.powers[0]; }
  pathBudget = 30; // routes that may be planned this frame
  linePath: [number, number][] = []; // a defence line being dragged: the squares the cursor has passed over
  lineCache: { at: number; n: number; plan: ReturnType<Game['linePlan']> } | null = null;
  sighted = { air: 0, armour: 0 }; // enemy aircraft and armour you've seen lately: a defence line's mix follows it
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
  aiming: null | 'attack' | 'guard' | 'barrage' | 'orbital' = null; // a click on the map is waited for: where to attack-move, or what to guard
  guardFrom: [number, number] | null = null; // guard aiming: where the press was (a drag is a patrol line)
  endCheck = 1;
  vis = new Uint8Array(N * N); // your side's view: 0 never seen, 1 seen before, 2 in sight now
  fogT = 0; fogMini = document.createElement('canvas');
  town = new Set<Bld>(); fort = new Set<Bld>(); // town centre and fortified line bonuses (see updateLand)
  territory = new Territory(); landT = 0; landMini = document.createElement('canvas'); // who owns what, and its picture on the radar
  stats = { built: [0, 0, 0, 0, 0, 0], lost: [0, 0, 0, 0, 0, 0], razed: [0, 0, 0, 0, 0, 0], time: 0 }; // razed[t]: buildings team t destroyed
  private _bark: { who: string; line: string; t: number; pri?: Pri } = { who: '', line: '', t: 0 };
  get bark() { return this._bark; }
  set bark(b) { this._bark = b; if (b.t > 0) audio.voice(b.who, b.line, b.pri); } // every line on screen comes over the radio (pri: 0 a unit answering a click, 1 answering an order, else news)
  markers: { x: number; y: number; t: number }[] = [];
  words: { x: number; y: number; t: number; s: string }[] = []; // short words rising off the battlefield (FLANKED)
  gained: { cells: number[]; t: number; x: number; y: number; pay: number }[] = []; // ground you just won: it glows and says what it earns
  buttons: Button[] = [];
  // The menu for the current screen: title, pause, or the end of a battle.
  // The front door has two pages: the door itself (carry on, learn, start a new game) and the new game's choices, each
  // explained as you point at it. In a game the menu only holds what makes sense there: no changing the money mid-war.
  titlePage: 'front' | 'newGame' = 'front';
  learned() { try { return localStorage.getItem('conquer-learned') === '1'; } catch { return false; } }
  get menuItems(): { id: string; label: string; note?: string }[] {
    const sound = { id: 'sound', label: `SOUND: ${this.sound ? 'ON' : 'OFF'}`, note: 'MUSIC AND EFFECTS ON OR OFF.' };
    if (this.state === 'title' && this.titlePage === 'front') return [...this.loadItems(),
      { id: 'learn', label: this.learned() ? 'LEARN TO PLAY' : 'LEARN TO PLAY  *', note: `A GUIDED FIRST GAME AGAINST AN ENEMY THAT WAITS: BUILD, TRAIN, TAKE GROUND, FIGHT. ABOUT TEN MINUTES.${this.learned() ? '' : ' SUGGESTED: START HERE.'}` },
      { id: 'newgame', label: 'NEW GAME', note: 'CHOOSE YOUR ENEMY AND YOUR MAP, THEN PLAY.' }, sound];
    if (this.state === 'title') {
      const LEVEL_NOTE: Record<string, string> = { easy: 'A GENTLE ENEMY: SMALL ATTACKS NOW AND THEN, FROM MINUTE 10. SUGGESTED FOR YOUR FIRST GAMES.', normal: 'A REAL OPPONENT: IT ATTACKS EVERY FEW MINUTES WITH EVERYTHING IT HAS, AND BLOWS DAMS.', hard: 'FAST AND WIDE AWAKE: IT FLANKS, ANSWERS EVERY RAID AND PRESSES WHEN IT SEES YOU WEAK.', brutal: 'RELENTLESS AND RUTHLESS. FOR WHEN HARD IS EASY.' };
      const PLAN_NOTE: Record<string, string> = { random: 'THE ENEMY PICKS ITS OWN WAY TO WIN: YOU FIND OUT WHEN IT ARRIVES.', armour: 'THE ENEMY BUILDS TANKS AND JUGGERNAUTS.', air: 'THE ENEMY BUILDS GUNSHIPS AND BOMBERS: HAVE ANTI-AIRCRAFT READY.', siege: 'THE ENEMY BUILDS FIELD GUNS TO BREAK DEFENCES: A RADAR LETS YOUR CANNONS ANSWER.', colossus: 'THE ENEMY SAVES UP FOR A GIANT SUPER-UNIT.' };
      return [
        { id: 'deploy', label: 'START', note: this.front ? `START A FRONT LINE GAME AGAINST A ${this.level.toUpperCase()} ENEMY.` : `START A GAME: ${this.level.toUpperCase()} ENEMY, ${storedPlayers() - 1} OPPONENT${storedPlayers() > 2 ? 'S' : ''}, $${this.money} EACH${this.rules === 'standard' ? '' : `, ${this.R.name} MODE`}.` },
        { id: 'level', label: `ENEMY: ${this.level.toUpperCase()}`, note: LEVEL_NOTE[this.level] },
        ...(this.front ? [] : [{ id: 'players', label: `OPPONENTS: ${storedPlayers() - 1}`, note: 'HOW MANY COMPUTER ENEMIES. MORE MEANS A BIGGER, LONGER WAR. ONE IS SUGGESTED TO START.' }]),
        ...(storedPlayers() === 4 ? [{ id: 'mode', label: this.mode === 'teams' ? 'TEAMS: 2 V 2' : 'FREE FOR ALL', note: this.mode === 'teams' ? 'YOU AND AN ALLY AGAINST TWO ENEMIES.' : 'EVERYONE FOR THEMSELVES.' }] : []),
        { id: 'plan', label: `ENEMY PLAN: ${this.plan.toUpperCase()}`, note: PLAN_NOTE[this.plan] },
        ...(this.front ? [] : [{ id: 'size', label: `MAP: ${({ [SIZES[0]]: 'MEDIUM', [SIZES[1]]: 'LARGE', [SIZES[2]]: 'HUGE' } as Record<number, string>)[this.size] ?? 'LARGE'}`, note: 'A BIGGER MAP MEANS MORE ROOM AND MORE TIME BEFORE THE FIRST FIGHT. LARGE IS SUGGESTED.' }]), // (FRONT LINE has its own valley)
        ...(this.front ? [] : [{ id: 'money', label: `MONEY: $${this.money}`, note: 'WHAT EVERY SIDE STARTS WITH. MORE MONEY MEANS A FASTER, BIGGER START FOR EVERYONE.' }]), // (FRONT LINE has no money)
        { id: 'hints', label: `HINTS: ${this.hints ? 'ON' : 'OFF'}`, note: 'THE NEXT-STEPS LIST AND TIPS WHILE YOU PLAY. SUGGESTED ON UNTIL YOU KNOW YOUR WAY ROUND.' },
        { id: 'newmap', label: 'NEW MAP', note: 'MAKE A DIFFERENT MAP TO PLAY ON.' },
        { id: 'back', label: 'BACK', note: 'BACK TO THE FRONT DOOR.' },
      ];
    }
    if (this.state === 'paused') return [{ id: 'resume', label: 'RESUME', note: 'BACK TO THE BATTLE.' }, { id: 'save', label: this.saveNote(), note: 'SAVE THIS BATTLE TO CARRY ON LATER (IT ALSO SAVES ITSELF NOW AND THEN).' }, { id: 'restart', label: 'RESTART', note: 'START THIS BATTLE AGAIN FROM THE BEGINNING.' }, sound, { id: 'quit', label: 'QUIT TO TITLE', note: 'LEAVE THE BATTLE FOR THE FRONT DOOR.' }];
    return [{ id: 'restart', label: 'PLAY AGAIN' }, { id: 'quit', label: 'TITLE SCREEN' }];
  }
  inMenu() { return this.state === 'title' || this.state === 'paused' || this.state === 'won' || this.state === 'lost'; }
  menuHot = 0; sound = true; time = 0;
  loadReport: Record<string, unknown> = {}; // how long loading took, for keeping it fast
  workerFirst: number[] = []; loadFirst = 0; // when each paint worker first answered; how many chunks the title waited for
  puffs: { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string; s: number; g?: number }[] = [];
  shakeAt = 0;
  bodies: { x: number; y: number; s: Sprite; t: number }[] = []; // fallen soldiers (map screen point), lying a while before they fade
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
          const worker = EARLY.shift() ?? new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}${FRONT ? "f" : ""}` });
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
    audio.fx('bridge', (b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, 1);
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
      const worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}${FRONT ? "f" : ""}` });
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
    if (!FRONT) for (const team of this.sides) { const [bx, by] = t.bases[this.baseOf(team)]; this.addUnit('builder', team, bx * CELL, by * CELL); } // every side starts with one Builder and its credits (FRONT LINE: nobody builds)
    for (const u of this.units) if (u.team !== 0) u.heading = u.tHead = Math.PI * 0.75;
    for (const st of t.sites) this.addBld(st.kind, 2, st.cx, st.cy, st.w, st.h, CAPTURE[st.kind]?.name ?? 'House');
    mark('sites');
    if (!FRONT) this.placeMarauders(); // (FRONT LINE: the war is between the two sides; marauder guns turned the valley's middle into a fortress nobody could pass)
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
  // Land pays two and a half times as much at the start, easing to its usual rate by minute 8: the opening is about
  // getting going, not waiting for money (the same for everyone)
  landRate() { return LAND_RATE * (1 + 1.5 * Math.max(0, 1 - this.stats.time / 480)); }
  // Every side starts with its Field Command, Generator and Scrapyard standing (and the Scrapyard's Salvager), as most
  // strategy games do: the first three minutes used to be putting those up, with no choices in it.
  readyBase() {
    const t = this.terrain;
    for (const team of this.sides) {
      const [bx, by] = t.bases[this.baseOf(team)], toMid = Math.atan2(N / 2 - by, N / 2 - bx), ax = Math.cos(toMid), ay = Math.sin(toMid);
      this.autoPlace('fieldCommand', team, Math.round(bx - ax * 5 - 1), Math.round(by - ay * 5 - 1));
      if (FRONT) { const hq = this.hq(team); if (hq) { hq.max *= 3; hq.hp = hq.max; } continue; } // (FRONT LINE: just the Field Command to defend, three times as tough)
      this.autoPlace('generator', team, Math.round(bx - ay * 5), Math.round(by + ax * 5));
      let sx = bx + ay * 5, sy = by - ax * 5, sd = 1e9; // the Scrapyard by the nearest scrap
      for (let y = by - 14; y <= by + 14; y++) for (let x = bx - 14; x <= bx + 14; x++) if (t.inside(x, y) && t.scrap[t.idx(x, y)] > 0) { const d = Math.hypot(x - bx, y - by); if (d > 5 && d < sd) { sd = d; sx = x - Math.sign(x - bx) * 3; sy = y - Math.sign(y - by) * 3; } }
      if (this.autoPlace('scrapyard', team, Math.round(sx), Math.round(sy))) { const b = this.blds[this.blds.length - 1], [ex, ey, ox, oy] = this.door(b, true), u = this.addUnit('harvester', team, ex, ey); u.heading = u.tHead = Math.atan2(oy, ox); }
    }
    this.landT = 0;
  }
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

  // How many squares a unit standing here can get to, counting up to `cap` (a few squares sealed in by cliffs, rock or buildings is a trap)
  room(cx: number, cy: number, crush: boolean, cap = ROOMY) {
    const t = this.terrain, seen = new Set([t.idx(cx, cy)]), q = [cx, cy];
    for (let k = 0; k < q.length && seen.size < cap; k += 2) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = q[k] + dx, y = q[k + 1] + dy;
      if (!t.inside(x, y) || seen.has(t.idx(x, y)) || !t.step(q[k], q[k + 1], x, y, crush)) continue;
      seen.add(t.idx(x, y)); q.push(x, y);
    }
    return seen.size;
  }
  // Where a new unit comes out of a building: the open side nearest its front (the bottom), as long as there's room to go anywhere from it.
  // Returns the spot and the way out (a unit for the direction).
  door(b: Bld, crush: boolean): [number, number, number, number] {
    const t = this.terrain, mx = b.cx + b.w / 2, my = b.cy + b.h / 2, spots: [number, number][] = [];
    for (let y = b.cy - 1; y <= b.cy + b.h; y++) for (let x = b.cx - 1; x <= b.cx + b.w; x++) if (x < b.cx || y < b.cy || x >= b.cx + b.w || y >= b.cy + b.h) spots.push([x, y]);
    spots.sort((p, q) => Math.hypot(p[0] + 0.5 - mx, p[1] - b.cy - b.h) - Math.hypot(q[0] + 0.5 - mx, q[1] - b.cy - b.h));
    const at = spots.find(([x, y]) => t.inside(x, y) && t.open(x, y, crush) && this.room(x, y, crush) >= ROOMY);
    if (!at) return [mx * CELL, (b.cy + b.h + 0.6) * CELL, 0, 1];
    const ox = at[0] + 0.5 - mx, oy = at[1] + 0.5 - my, l = Math.hypot(ox, oy) || 1;
    return [(at[0] + 0.5) * CELL, (at[1] + 0.5) * CELL, ox / l, oy / l];
  }
  // A ground unit that gives up on getting somewhere checks whether it's sealed in a pocket (a building put up across its only way out,
  // cliffs and rock all round): if it is, it scrambles out to the nearest open ground, rather than sit there for the rest of the game.
  climbOut(u: Unit) {
    const t = this.terrain, cx = t.cellOf(u.x), cy = t.cellOf(u.y);
    if (u.def.air || u.enter || this.room(cx, cy, u.def.crush) >= ROOMY) return false;
    for (let r = 1; r <= 10; r++) {
      let best: [number, number] | null = null, bd = 1e9;
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !t.inside(x, y) || !t.open(x, y, u.def.crush)) continue;
        const dd = Math.hypot(x - cx, y - cy); if (dd < bd && this.room(x, y, u.def.crush) >= ROOMY) { bd = dd; best = [x, y]; }
      }
      if (!best) continue;
      const dust = () => { const [sx, sy] = this.scr(u); for (let k = 0; k < 8; k++) this.puffs.push({ x: sx + (Math.random() - 0.5) * 12, y: sy - 2, vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 6, t: 0, life: 0.9, c: '#9a8664', s: 1 }); };
      dust(); u.x = (best[0] + 0.5) * CELL; u.y = (best[1] + 0.5) * CELL; dust();
      u.path = []; u.stuck = 0; u.progT = 0; u.px0 = u.x; u.py0 = u.y;
      return true;
    }
    return false;
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
    return [{ id: 'continue', label: `CONTINUE ${clock(m[newest]!.time)}`, note: `CARRY ON WHERE YOU LEFT OFF: ${clock(m[newest]!.time)} INTO THE BATTLE.` }, ...(m.save && newest !== 'save' ? [{ id: 'loadsave', label: `LOAD SAVE ${clock(m.save.time)}`, note: 'THE BATTLE YOU SAVED YOURSELF.' }] : [])];
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
    if (!(this.rules in MODES)) this.rules = 'standard'; // (a mode since retired, such as OUTNUMBERED: carry on as the game as designed)
    for (const p of this.prods) for (const k of Object.keys(new Production().queues)) p.queues[k] ??= []; // a save from before a factory line existed (salvagers at the scrapyard)
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
      const bytes = await writeSave(slot, { v: SAVE_VERSION, seed: this.seed, players: this.players, size: N, front: FRONT, time: this.stats.time, at: Date.now() }, json);
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
        if (this.titlePage === 'newGame' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { const order = Object.keys(MODES); this.menu('mode:' + order[(order.indexOf(this.rules) + order.length + (e.code === 'ArrowRight' ? 1 : -1)) % order.length]); }
        if (e.code === 'ArrowDown') this.menuHot = (this.menuHot + 1) % n;
        if (e.code === 'ArrowUp') this.menuHot = (this.menuHot + n - 1) % n;
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.menu(this.menuItems[this.menuHot].id); }
        if ((e.code === 'Escape' || e.code === 'KeyP') && this.state === 'paused') this.menu('resume');
        if (e.code === 'Escape' && this.state === 'title' && this.titlePage === 'newGame') this.menu('back'); // (Escape steps back to the front door)
        return;
      }
      if (this.state !== 'play') return;
      if (e.code === 'KeyP' || (e.code === 'Escape' && !this.placing && !this.aiming && !this.selected().length && !this.selBld)) { this.state = 'paused'; this.menuHot = 0; audio.click(); return; }
      const m = /^Digit(\d)$/.exec(e.code);
      if (m && +m[1] >= 1 && +m[1] <= 5) { // divisions: Ctrl+number forms one from what's selected, the number picks it
        const k = +m[1] - 1;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.formDivision(k); } else this.pickDivision(k);
      }
      if (e.code === 'KeyS') this.order('stop');
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) this.order('fallBack'); // R: retreat
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
      if (e.code === 'Escape') { if (this.aiming) { this.aiming = null; this.guardFrom = null; return; } if (this.placing) { this.placing = null; this.planFrom = null; } else { this.select([], false); this.selBld = null; } }
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
      if (this.aiming === 'attack') { if (e.button === 0) this.command(M.x + this.vx, M.y + this.vy, true); this.aiming = null; return; }
      if (this.aiming === 'barrage' || this.aiming === 'orbital') { if (e.button === 0) this.callIn(0, this.aiming, ...this.groundAt(M.x + this.vx, M.y + this.vy)); this.aiming = null; return; } // (FRONT LINE call-ins)
      if (this.aiming === 'guard') { if (e.button === 0) this.guardFrom = this.groundAt(M.x + this.vx, M.y + this.vy); else this.aiming = null; return; } // press: a click guards, a drag patrols
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
      this.traceLine();
      if (M.down && Math.hypot(M.x - M.sx, M.y - M.sy) > 3) M.drag = true;
      if (M.down && M.onMap) this.minimapJump();
      if (this.inMenu()) { const hit = this.menuHit(); if (hit) this.menuHot = this.menuItems.findIndex((m) => m.id === hit); }
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 0 && this.planFrom && this.placing) { const d = this.placing, from = this.planFrom; if (d.key === 'line') this.orderLine(); /* (while the drag is still known) */ this.planFrom = null; if (d.key === 'line') return; if (d.key === 'wall') { const [ax, ay] = this.placeAt(d, from); this.orderWall([ax, ay], this.placeAt(d)); } else this.orderBlock(this.blockAt(d, from)); }
      if (e.button === 0 && this.aiming === 'guard' && this.guardFrom) {
        const from = this.guardFrom, to = this.groundAt(M.x + this.vx, M.y + this.vy), [ax, ay] = toScreen(from[0], from[1]), [bx, by] = toScreen(to[0], to[1]);
        this.aiming = null; this.guardFrom = null;
        if (Math.hypot(bx - ax, by - ay) > 16) this.guardWith(from, null, [from, to]);
        else { const b = this.bldAtScreen(M.x + this.vx, M.y + this.vy); this.guardWith(to, b && b.team === 0 && b.dying < 0 ? b : null, null); }
        return;
      }
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
          this.selBld = b && b.team === 0 && (!CAPTURE[b.type] || b.garrison > 0 || b.type === 'uplink') ? b : null;
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
    if (id === 'newgame') { this.titlePage = 'newGame'; this.menuHot = 0; return; }
    if (id === 'back') { this.titlePage = 'front'; this.menuHot = 0; return; }
    if (id === 'learn') { this.level = 'easy'; if (FRONT) { this.store('rules', 'standard'); try { sessionStorage.setItem('conquer-skip', ''); } catch {} location.reload(); return; } this.rules = 'standard'; this.lesson = { step: 0, t: this.time }; this.menu('deploy'); return; } // a guided first game against an easy enemy that waits
    if (id === 'skipLesson') { this.lesson = null; return; }
    if (id === 'deploy') {
      if (this.size !== N || this.front !== FRONT) { try { sessionStorage.setItem('conquer-skip', '1'); } catch {} location.reload(); return; } // a new map size needs a fresh load
      if (storedPlayers() !== this.players) { try { sessionStorage.setItem('conquer-skip', '1'); } catch {} location.reload(); return; } // a different number of sides needs a new map
      this.state = 'play';
      if (this.players === 4 && this.mode === 'teams') this.ally = [0, 1, 2, 1, 0, 5]; // you and gold against red and green
      this.ais = FRONT ? [] : this.sides.filter((t) => t !== 0).map((t) => new AI(this, this.level, t, t === 1 && this.plan !== 'random' ? (this.plan as Plan) : undefined));
      this.ai = this.ais[0];
      for (const t of this.sides) this.prods[t].credits = this.money * (this.hostile(0, t) ? this.R.start ?? 1 : 1);
      if (!this.lesson) this.readyBase(); // (the lesson teaches putting these up)
      { const [bx, by] = this.terrain.bases[0]; this.centre(bx * CELL, by * CELL); this.vx = this.goalX; this.vy = this.goalY; } // back home: the title screen drifts the camera across the map, and a few minutes on it left you staring at fog
      if (this.R.goal) this.banner = { title: this.R.name, sub: this.R.goal, t: 6, c: C.gold }; // (a mode game starts with its goal)
      this.say(this.units[0], 'select');
    }
    if (id === 'plan') { const order = ['random', 'armour', 'air', 'siege', 'colossus']; this.plan = order[(order.indexOf(this.plan) + 1) % order.length]; this.store('plan', this.plan); }
    if (id === 'size') { this.size = SIZES[(SIZES.indexOf(this.size) + 1) % SIZES.length]; this.store('size', String(this.size)); }
    if (id === 'money') { const order = [4000, 6000, 12000, 25000]; this.money = order[(order.indexOf(this.money) + 1) % order.length]; this.store('money', String(this.money)); }
    if (id === 'newmap') { try { sessionStorage.setItem('conquer-skip', ''); } catch {} location.reload(); return; }
    if (id === 'players') { this.store('players', String(storedPlayers() % 4 + 1 === 1 ? 2 : storedPlayers() + 1)); }
    if (id === 'mode') { this.mode = this.mode === 'teams' ? 'ffa' : 'teams'; this.store('mode', this.mode); }
    if (id.startsWith('mode:')) { this.rules = id.slice(5) in MODES ? id.slice(5) : 'standard'; this.store('rules', this.rules); if (this.front) { this.size = SIZES[1]; this.store('size', String(this.size)); this.store('players', '2'); } } // (FRONT LINE: one enemy, on a large map's worth of valley)
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
      this.store('size', String(m.size)); this.store('players', String(m.players)); if (m.front) this.store('rules', 'front'); else if (this.front) this.store('rules', 'standard'); // (the map is made at load from the mode: a FRONT LINE save needs its valley, any other save the open map)
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
    if (kind === 'move' && u.def.vehicle) audio.fx(u.type === 'gunship' ? 'rotor' : u.type === 'bomber' ? 'jet' : 'engine', u.x, u.y, 0.45);
    const lines = u.def.barks[kind];
    this.bark = { who: u.def.name, line: pick(u.def.name + kind, lines), t: 3, pri: kind === 'select' ? 0 : 1 };
  }
  // What a right-click at this screen point will do with what's selected. The cursor shows it and
  // command() acts on it, so the two never disagree.
  intent(px: number, py: number, blow = false): { kind: 'none' | 'launch' | 'rally' | 'enter' | 'capture' | 'build' | 'repair' | 'claim' | 'attack' | 'move' | 'rebuild'; site?: Bld } {
    const sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return { kind: this.selBld?.team !== 0 ? 'none' : this.selBld.type === 'uplink' ? 'launch' : 'rally' };
    const [wx, gy] = this.groundAt(px, py), site = this.bldAtScreen(px, py);
    if (site && CAPTURE[site.type] && !(blow && site.type === 'dam') && sel.some((u) => !u.def.vehicle) && (site.team !== 0 || CAPTURE[site.type].garrison)) return { kind: site.team === 0 ? 'enter' : 'capture', site };
    if (site && site.team === 0 && site.max > 0 && (site.rise < 1 || site.hp < site.max) && sel.some((u) => u.type === 'builder')) return { kind: site.rise < 1 ? 'build' : 'repair', site };
    if (sel.some((u) => u.type === 'builder') && this.fallenAt(wx, gy)) return { kind: 'rebuild' };
    const foe = sel.some((u) => u.def.weapon) ? this.enemyAt(px, py) : null;
    if (foe && (this.isUnit(foe) || (foe.type !== 'dam' && foe.type !== 'bridge') || sel.some((u) => u.def.weapon && WEAPONS[u.def.weapon].kind === 'shell'))) return { kind: 'attack' }; // a dam or bridge needs explosives
    const d = this.unitAt(px, py);
    if (d && d.team === 2 && d.def.weapon && this.sees(d.x, d.y) && sel.some((u) => !u.def.air)) return { kind: 'claim' };
    return { kind: 'move' };
  }
  command(px: number, py: number, amove = false, line?: { mx: number; my: number; fx: number; fy: number; width: number }) {
    for (const u of this.selected()) { if (u.ride) this.dismount(u); u.fallBack = false; u.scouting = false; } this.unpatrol(this.selected()); for (const d of this.divisions) if (d?.attack && d.units.some((u) => u.selected)) d.attack = false; // (and an attacking division stands down) // a new order: off the vehicle first, and no longer falling back
    const sel = this.selected().filter((u) => u.team === 0);
    if (!sel.length) return;
    let [wx, gy] = line ? [line.mx, line.my] : this.groundAt(px, py); const { kind, site } = line ? { kind: 'move', site: null } : this.intent(px, py, amove); // (ATTACK on a dam blows it, even with soldiers along)
    if (site && (kind === 'enter' || kind === 'capture')) { // infantry sent onto a capturable site go in and take it
      const foot = sel.filter((u) => !u.def.vehicle);
      for (const u of foot) { this.sendIn(u, site); u.face = null; } // each to the nearest open side
      this.bark = { who: foot[0].def.name, line: site.team === 0 ? 'Moving in.' : 'Under new management, coming up.', t: 3, pri: 1 };
      return;
    }
    for (const u of sel) { u.enter = null; u.face = null; }
    const crew = sel.filter((u) => u.type === 'builder');
    if (site && (kind === 'build' || kind === 'repair')) { for (const u of crew) this.assignSite(u, site); this.say(crew[0], 'move'); return; }
    if (kind === 'rebuild') { const f = this.fallenAt(wx, gy); if (f) { this.rebuildBridge(f, 0, crew); this.bark = { who: 'Builder', line: `Rebuilding the bridge: $${DEF.bridge.cost} as we go.`, t: 3 }; } return; }
    for (const u of crew) { u.buildSite = null; u.hold = true; u.rest = 0; } // sent somewhere on purpose: it rests there a while before going back to the queue
    const enemy = line ? null : this.enemyAt(px, py), concrete = !!enemy && !this.isUnit(enemy) && (enemy.type === 'dam' || enemy.type === 'bridge');
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
      this.bark = weak ? { who: weak.who, line: weak.line, t: 4, pri: 1 } : note ? { who: sel[0].def.name, line: note, t: 3, pri: 1 } : { who: sel[0].def.name, line: far > 12 * CELL && go.length > 1 ? pick('formation', ['Moving up together.', 'Forming up. We go in as one.', 'Advancing in formation.']) : pick(sel[0].def.name + 'attack', sel[0].def.barks.attack ?? ['Engaging.', 'Target acquired.', 'With pleasure.', 'They had it coming.']), t: 2.5, pri: 1 };
      return;
    }
    for (const u of sel) { u.forced = false; u.amove = amove || !!u.def.weapon; u.strike = null; u.wave = null; u.mopUp = null; u.gather = null; if (!amove) u.target = null; } // a plain move fights on the way too (RETREAT is how to pull out without fighting)
    { // a long attack-move by a real group: they meet short of it and go in together, rather than strung out in single file to be picked off one by one
      const mx = sel.reduce((s, u) => s + u.x, 0) / sel.length, my = sel.reduce((s, u) => s + u.y, 0) / sel.length, shift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      if (amove && !line && !shift && sel.length >= 6 && Math.hypot(wx - mx, gy - my) > 20 * CELL) {
        this.orderUnits(sel.filter((u) => !u.ride && u.type !== 'builder'), wx, gy, true, true);
        this.markers.push({ x: wx, y: gy, t: 0 });
        this.bark = { who: sel[0].def.name, line: pick('formation', ['Moving up together.', 'Forming up. We go in as one.', 'Advancing in formation.']), t: 3, pri: 1 };
        return;
      }
    }
    const tt = this.terrain, ti = tt.idx(tt.cellOf(wx), tt.cellOf(gy)), wet = !line && (tt.type[ti] === T.WATER || tt.type[ti] === T.ROCK), first = sel.find((u) => !u.def.air);
    if (wet && first) { const p = findPath(tt, first.x, first.y, wx, gy, first.def.crush), e = p[p.length - 1]; if (e) [wx, gy] = e; } // water or rock clicked: the group forms up at the nearest point it can reach (its spots round the middle of a lake used to send some the long way round to the far shore)
    // A group sent somewhere forms up facing the way it went (see formation()); a short shuffle just
    // keeps everyone's place, squeezed if spread out. Either way the group moves at its slowest
    // member's pace, so they arrive together.
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length, cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
    const far = Math.hypot(wx - cx, gy - cy), fx = line ? line.fx : (wx - cx) / far, fy = line ? line.fy : (gy - cy) / far;
    const spots = line ? this.formation(sel, wx, gy, fx, fy, line.width, true) : sel.length > 1 && far > 3 * CELL ? this.formation(sel, wx, gy, fx, fy) : null;
    const spread = Math.max(1, ...sel.map((u) => Math.hypot(u.x - cx, u.y - cy))), fit = Math.sqrt(sel.length) * 12 + 8;
    const squeeze = spread > fit ? fit / spread : 1;
    const queue = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); // Shift: add a waypoint
    const up = !queue && !line && far > 12 * CELL ? this.mountUp(sel) : null; // a long march: soldiers ride on the armour, as many as fit
    const paceOf = this.paces(sel); // each group at its own pace: a scattered army doesn't crawl at its slowest member's speed across the map
    const lead = this.bunchRoutes(sel, wx, gy);
    for (const u of sel) {
      const g: [number, number] = spots?.get(u) ?? [wx + (u.x - cx) * squeeze, gy + (u.y - cy) * squeeze];
      if (u.ride) { u.spot = queue ? null : g; continue; }
      u.pace = sel.length > 1 ? paceOf.get(u) ?? 0 : 0; u.face = spots ? Math.atan2(fy, fx) : null;
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
      if (!onIt && end && (wet || t.type[t.idx(t.cellOf(wx), t.cellOf(gy))] === T.WATER || t.type[t.idx(t.cellOf(wx), t.cellOf(gy))] === T.ROCK || (!pathStats.reached && Math.hypot(end[0] - wx, end[1] - gy) > 4 * CELL))) { this.bark = { who: walker.def.name, line: "We can't get all the way there. Going as close as we can.", t: 3, pri: 1 }; return; }
    }
    if (up) this.bark = { who: sel[0].def.name, line: up.walking ? `Mount up! ${up.riders.length} riding, ${up.walking} on foot.` : 'Mount up! Everyone riding.', t: 3, pri: 1 }; else this.say(sel[0], 'move');
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
      us.forEach((u, i) => {
        const side = (i - (us.length - 1) / 2) * step, ox = fx * d - fy * side, oy = fy * d + fx * side;
        // a slot across water or up a cliff from the spot clicked would send this one the long way round: pull it in until the way is open
        let k = 1; if (!u.def.air) while (k > 0 && !clearLine(this.terrain, tx, ty, tx + ox * k, ty + oy * k, u.def.crush)) k -= 0.25;
        spots.set(u, [tx + ox * k, ty + oy * k]);
      });
      ahead -= gap;
    }
    return spots;
  }
  // The groups a set of units actually stands in: each unit within `link` of another in its group (a division spread over
  // two fronts is two groups). Orders move each group at its own pace, so one far off doesn't slow the rest to a crawl.
  clusters(us: Unit[], link = 10 * CELL): Unit[][] {
    const left = new Set(us), out: Unit[][] = [];
    for (const u0 of us) {
      if (!left.has(u0)) continue;
      left.delete(u0); const g = [u0];
      for (let k = 0; k < g.length; k++) for (const o of left) if (Math.hypot(o.x - g[k].x, o.y - g[k].y) < link) { left.delete(o); g.push(o); } // (deleting from a set while walking it is safe)
      out.push(g);
    }
    return out.sort((a, b) => b.length - a.length);
  }
  // each unit's pace on a group move: its own group's slowest (vehicles carrying riders at theirs, the rest at theirs)
  // each kind at its own pace: soldiers march together, vehicles (with their riders) drive together, aircraft fly together, the
  // Colossus walks alone (one slow soldier used to hold a whole army, gunships and all, to a walk)
  paces(us: Unit[]) {
    const pace = new Map<Unit, number>(), kind = (u: Unit) => (u.def.air ? 'air' : u.type === 'colossus' ? 'colossus' : u.def.vehicle ? 'vehicle' : 'foot');
    for (const c of this.clusters(us.filter((u) => !u.ride))) {
      const slowest = new Map<string, number>();
      for (const u of c) slowest.set(kind(u), Math.min(slowest.get(kind(u)) ?? 1e9, u.def.speed));
      for (const u of c) pace.set(u, slowest.get(kind(u))!);
    }
    return pace;
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
    if (id === 'reinforce') { this.callIn(0, 'reinforce'); return; }
    if (id === 'barrage' || id === 'orbital') { if (this.points[0] >= CALLS[id].cost) { this.aiming = this.aiming === id ? null : id; this.bark = { who: 'Command', line: `Click where the ${id === 'barrage' ? 'barrage' : 'orbital strike'} should land.`, t: 3 }; } return; }
    if (id === 'home') { const [bx, by] = this.terrain.bases[0]; this.centre(bx * CELL, by * CELL); return; }
    if (id === 'alert') { if (this.alertAt) this.centre(...this.alertAt); return; } // jump to the latest alert
    if (id === 'amove') { if (this.selected().length) { this.aiming = 'attack'; this.bark = { who: 'Command', line: 'Click where to go. They fight anything on the way.', t: 3 }; } return; }
    if (id === 'cancel' && this.selBld && this.selBld.rise < 1) { this.cancelSite(this.selBld); return; }
    if (id === 'empty' && this.selBld && CAPTURE[this.selBld.type]?.garrison) { this.emptyGarrison(this.selBld); return; }
    { const m = /^(div|feed)(\d)$/.exec(id); if (m) { if (m[1] === 'div') this.pickDivision(+m[2]); else this.feedDivision(+m[2]); return; } }
    { const m = /^atk(\d)$/.exec(id); if (m) { const d = this.divisions[+m[1]]; if (d) { d.attack = !d.attack; this.bark = { who: 'Command', line: d.attack ? `${this.divName(+m[1])} is attacking: it will find the enemy and keep pushing.` : `${this.divName(+m[1])} stands down.`, t: 3 }; if (d.attack) this.pushOn(d); } return; } }
    { const m = /^co(\d)_(\d+)$/.exec(id); if (m) { const c = this.divisions[+m[1]]?.companies[+m[2]]; if (c) this.pickGroup(c); return; } }
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
      audio.fx('sell', (b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL); this.bark = { who: 'Command', line: `${b.name} sold for $${refund}.`, t: 2.5 }; audio.click();
      return;
    }
    const sel = this.selected();
    if (!sel.length) return;
    audio.click();
    if (id === 'fallBack') { const n = this.fallBack(sel.filter((u) => u.team === 0)); this.bark = { who: sel[0].def.name, line: n ? pick('fallBack', ['Falling back!', 'Pulling out!', 'Back to base, go!']) : 'Nowhere to fall back to.', t: 2.5, pri: 1 }; return; }
    if (id === 'guard') { if (sel.some((u) => u.team === 0 && u.def.weapon && u.type !== 'builder' && u.type !== 'harvester')) { this.aiming = 'guard'; this.bark = { who: 'Command', line: 'Click a spot or one of your buildings to guard it, or drag a line to patrol.', t: 4 }; } return; }
    this.unpatrol(sel);
    if (id === 'scout') { const sc = sel.filter((u) => u.team === 0 && u.type === 'scout'); for (const u of sc) { u.scouting = true; u.fallBack = false; u.goal = null; u.path = []; u.queue = []; u.target = null; } if (sc.length) { this.bark = { who: 'Scout', line: pick('scout', ['Heading out. I\'ll find them.', 'Going looking.', 'Eyes out. Back when I\'m hurt.']), t: 2.5, pri: 1 }; } return; }
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
  // GUARD: the units split into squads of about eight, each holding its own spot spread over what they guard (a spot,
  // one of your buildings: a ring round it), so a big guard covers the ground instead of packing into one jam. Trouble
  // inside the ring (an enemy they can see, anything of yours being hit) draws the nearest squads, enough to outweigh it
  // about two to one; the rest hold. Several threats get one answer each. When it's quiet, or they've chased too far,
  // each squad goes back to its own spot. Dragged, it's a patrol: the squads spread along the line and each walks its
  // own stretch back and forth. Select one to see what it guards. Any new order ends it for that unit.
  patrols: { units: Unit[]; at: [number, number]; bld: Bld | null; line: [number, number][] | null; r: number; squads: { units: Unit[]; spot: [number, number]; back: [number, number]; on: [number, number] | null; out: boolean }[] }[] = [];
  guardWith(at: [number, number], bld: Bld | null, line: [number, number][] | null) {
    const us = this.selected().filter((u) => u.team === 0 && this.alive(u) && u.def.weapon && u.type !== 'builder' && u.type !== 'harvester'); // aircraft too: they hold over the post
    if (!us.length) return;
    this.unpatrol(us);
    for (const u of us) { u.fallBack = false; u.scouting = false; }
    const t = this.terrain, n = Math.ceil(us.length / 8), centre: [number, number] = bld ? [(bld.cx + bld.w / 2) * CELL, (bld.cy + bld.h / 2) * CELL] : at;
    const r = (bld ? Math.max(bld.w, bld.h) / 2 + 7 : line ? 6 : 9) * CELL + Math.sqrt(n) * CELL; // a bigger guard covers a little more
    const open = (x: number, y: number): [number, number] => { const cx = t.cellOf(x), cy = t.cellOf(y); for (let k = 0; k < 6; k++) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) if (t.inside(cx + dx, cy + dy) && t.open(cx + dx, cy + dy, false)) return [(cx + dx + 0.5) * CELL, (cy + dy + 0.5) * CELL]; return [x, y]; };
    // the squads' spots: along a patrol line; round a building (outside its walls); or spread over the spot, like seeds in a sunflower
    const spots: [number, number][] = [], backs: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      if (line) { const f = n > 1 ? k / (n - 1) : 0.5, [[ax, ay], [bx, by]] = line; spots.push(open(ax + (bx - ax) * f * 0.5, ay + (by - ay) * f * 0.5)); backs.push(open(ax + (bx - ax) * (0.5 + f * 0.5), ay + (by - ay) * (0.5 + f * 0.5))); continue; }
      const a = k * 2.39996, inner = bld ? (Math.max(bld.w, bld.h) / 2 + 2) * CELL : 0, d = inner + Math.sqrt((k + 0.5) / n) * Math.max(CELL * 2, r * 0.55 - inner);
      spots.push(open(centre[0] + Math.cos(a) * d, centre[1] + Math.sin(a) * d));
    }
    // each unit to the nearest spot with room (eight to a squad)
    const groups: Unit[][] = spots.map(() => []);
    for (const u of [...us].sort((p, q) => Math.hypot(p.x - centre[0], p.y - centre[1]) - Math.hypot(q.x - centre[0], q.y - centre[1]))) {
      let bi = -1, bd = Infinity; spots.forEach(([x, y], i) => { const d = Math.hypot(u.x - x, u.y - y); if (groups[i].length < 8 && d < bd) { bd = d; bi = i; } });
      groups[bi].push(u);
    }
    const squads = groups.map((g, i) => ({ units: g, spot: spots[i], back: backs[i] ?? spots[i], on: null, out: false })).filter((q) => q.units.length);
    this.patrols.push({ units: us, at: centre, bld, line, r, squads });
    for (const q of squads) this.orderUnits(q.units, q.spot[0], q.spot[1], true);
    this.bark = { who: us[0].def.name, line: line ? 'Walking the line.' : bld ? `Guarding the ${bld.name}.` : 'Holding here. Nothing gets past.', t: 2.5, pri: 1 };
  }
  // how far a point is from what a guard covers: its post, or its patrol line
  guardGap(p: (typeof this.patrols)[number], x: number, y: number) {
    if (!p.line) return Math.hypot(x - p.at[0], y - p.at[1]);
    const [[ax, ay], [bx, by]] = p.line, dx = bx - ax, dy = by - ay, k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - dx * k, y - ay - dy * k);
  }
  unpatrol(us: Unit[]) {
    if (!this.patrols.length) return;
    const gone = new Set(us);
    for (const p of this.patrols) { p.units = p.units.filter((u) => !gone.has(u)); for (const q of p.squads) q.units = q.units.filter((u) => !gone.has(u)); p.squads = p.squads.filter((q) => q.units.length); }
    this.patrols = this.patrols.filter((p) => p.units.length);
  }
  updatePatrols() {
    for (const p of this.patrols) { const ok = (u: Unit) => this.alive(u) && !u.fallBack && !u.scouting; p.units = p.units.filter(ok); for (const q of p.squads) q.units = q.units.filter(ok); p.squads = p.squads.filter((q) => q.units.length); }
    this.patrols = this.patrols.filter((p) => p.units.length);
    const mid = (us: Unit[]): [number, number] => [us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.y, 0) / us.length];
    const idle = (us: Unit[]) => us.filter((u) => !u.goal && !u.path.length && !u.target).length >= Math.ceil(us.length * 0.7);
    for (const p of this.patrols) {
      if (p.bld && (!this.alive(p.bld) || p.bld.team !== 0)) p.bld = null; // the building fell: they hold its ground
      // the threats inside the ring: what's hit, and enemies they can see (a few at most, each a few squares from the next)
      const threats: { x: number; y: number; worth: number }[] = [];
      const add = (x: number, y: number, worth: number) => { const th = threats.find((h) => Math.hypot(h.x - x, h.y - y) < 7 * CELL); if (th) th.worth += worth; else if (threats.length < 4) threats.push({ x, y, worth }); };
      for (const q of this.pings) if (q.t < 2 && this.guardGap(p, q.x, q.y) < p.r) { const [fx, fy] = q.from && this.guardGap(p, q.from[0], q.from[1]) < p.r + 12 * CELL ? q.from : [q.x, q.y]; add(fx, fy, 200); } // (to the shooter: field guns shell from outside the ring)
      const [mx, my] = p.line ? [(p.line[0][0] + p.line[1][0]) / 2, (p.line[0][1] + p.line[1][1]) / 2] : p.at, reach = p.r + (p.line ? Math.hypot(p.line[1][0] - p.line[0][0], p.line[1][1] - p.line[0][1]) / 2 : 0);
      this.near(mx, my, reach, (o) => { if (this.hostile(0, o.team) && this.spot(o) && this.guardGap(p, o.x, o.y) < p.r) add(o.x, o.y, this.costOf(o.type)); });
      // squads out answering: carry on while their fight is on and near home; else back to their spot
      for (const q of p.squads) {
        if (!q.on) continue;
        const [cx, cy] = mid(q.units), th = threats.find((h) => Math.hypot(h.x - q.on![0], h.y - q.on![1]) < 9 * CELL);
        if (th && this.guardGap(p, cx, cy) < p.r * 2 + 12 * CELL) { if (idle(q.units)) { q.on = [th.x, th.y]; this.orderUnits(q.units, th.x, th.y, true); } continue; }
        q.on = null; const [gx, gy] = q.out ? q.back : q.spot; this.orderUnits(q.units, gx, gy, true);
      }
      // each threat: the nearest free squads, until what's answering it outweighs it about two to one
      for (const th of threats) { // (topped up as more of it comes into view)
        const worth = (q: (typeof p.squads)[number]) => q.units.reduce((s, u) => s + this.costOf(u.type), 0);
        let sent = p.squads.filter((q) => q.on && Math.hypot(q.on[0] - th.x, q.on[1] - th.y) < 9 * CELL).reduce((s, q) => s + worth(q), 0);
        for (const q of p.squads.filter((q) => !q.on).sort((a, b) => { const [ax, ay] = mid(a.units), [bx, by] = mid(b.units); return Math.hypot(ax - th.x, ay - th.y) - Math.hypot(bx - th.x, by - th.y); })) {
          if (sent >= th.worth * 2) break;
          q.on = [th.x, th.y]; this.orderUnits(q.units, th.x, th.y, true); sent += worth(q);
        }
      }
      // the rest hold their spots (a patrol's squads walk their stretch, end to end)
      if (p.bld) { const nx = (p.bld.cx + p.bld.w / 2) * CELL, ny = (p.bld.cy + p.bld.h / 2) * CELL; p.at = [nx, ny]; }
      for (const q of p.squads) {
        if (q.on || !idle(q.units)) continue;
        if (p.line) { q.out = !q.out; const [gx, gy] = q.out ? q.back : q.spot; this.orderUnits(q.units, gx, gy, true); continue; }
        const [cx, cy] = mid(q.units); if (Math.hypot(cx - q.spot[0], cy - q.spot[1]) > 4 * CELL) this.orderUnits(q.units, q.spot[0], q.spot[1], true); // drifted off its spot
      }
    }
  }
  // what a selected guard covers (a dotted ring, or its patrol line inside a ring at each end; red while some of it is
  // out answering trouble), and while aiming a guard, the ring or line it would make
  drawPatrols(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain, M = this.mouse;
    const at = (x: number, y: number) => { const [sx, sy] = toScreen(x, y); return [sx - vx, sy - t.lift(x, y) - vy]; };
    const dot = (x: number, y: number, c: string) => { const [px, py] = at(x, y); ctx.fillStyle = C.ink; ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 4, 4); ctx.fillStyle = c; ctx.fillRect(Math.round(px), Math.round(py), 2, 2); };
    const ring = (x: number, y: number, r: number, c: string) => { const n = Math.max(24, Math.round(r / 6)); for (let k = 0; k < n; k++) { const a = (k / n) * TAU + this.time * 0.3; dot(x + Math.cos(a) * r, y + Math.sin(a) * r, c); } };
    const line = (a: [number, number], b: [number, number], c: string) => { const n = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = (this.time * 20) % 10; d < n; d += 10) dot(a[0] + ((b[0] - a[0]) * d) / n, a[1] + ((b[1] - a[1]) * d) / n, c); };
    for (const p of this.patrols) {
      if (!p.units.some((u) => u.selected)) continue;
      const c = p.squads.some((q) => q.on) ? C.bad : '#9ad0ff';
      if (p.line) { line(p.line[0], p.line[1], c); for (const e of p.line) ring(e[0], e[1], p.r, c); } else ring(p.at[0], p.at[1], p.r, c);
    }
    if (this.aiming === 'guard' && this.inView(M.y)) { // what this click would guard
      const g = this.groundAt(M.x + vx, M.y + vy), b = this.hoverBld?.team === 0 ? this.hoverBld : null;
      if (this.guardFrom) { line(this.guardFrom, g, C.gold); ring(this.guardFrom[0], this.guardFrom[1], 6 * CELL, C.gold); ring(g[0], g[1], 6 * CELL, C.gold); }
      else if (b) ring((b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, (Math.max(b.w, b.h) / 2 + 7) * CELL, C.gold);
      else ring(g[0], g[1], 9 * CELL, C.gold);
    }
  }
  // Where the selected units are headed on an attack: a red line to what they're attacking with a crosshair on it, or an
  // amber line to the spot they're fighting their way to (so an order plainly points at what you clicked)
  drawOrders(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain, sel = this.selected().filter((u) => u.team === 0 && u.def.weapon);
    if (!sel.length) return;
    const at = (x: number, y: number) => { const [sx, sy] = toScreen(x, y); return [Math.round(sx - vx), Math.round(sy - t.lift(x, y) - vy)]; };
    const groups = new Map<object | string, Unit[]>();
    for (const u of sel) { const aim = u.strike ?? (u.forced && u.target ? u.target : null); const key = aim ?? (u.amove && u.goal ? 'move' : null); if (key) (groups.get(key) ?? groups.set(key, []).get(key)!).push(u); }
    for (const [key, us] of groups) {
      const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cy = us.reduce((s, u) => s + u.y, 0) / us.length;
      const red = key !== 'move', [tx, ty] = red ? this.posOf(key as Unit | Bld) : [us.reduce((s, u) => s + u.goal![0], 0) / us.length, us.reduce((s, u) => s + u.goal![1], 0) / us.length];
      const col = red ? C.bad : C.warn, n = Math.hypot(tx - cx, ty - cy);
      for (let d = (this.time * 30) % 12; d < n; d += 12) { const [px, py] = at(cx + ((tx - cx) * d) / n, cy + ((ty - cy) * d) / n); ctx.fillStyle = C.ink; ctx.fillRect(px - 1, py - 1, 3, 3); ctx.fillStyle = col; ctx.fillRect(px, py, 1, 1); }
      const [px, py] = at(tx, ty), r = 6 + (Math.floor(this.time * 4) % 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.fillStyle = C.ink; ctx.fillRect(px + dx * r - (dy ? 1 : 0), py + dy * r - (dx ? 1 : 0), dy ? 3 : 1, dx ? 3 : 1); ctx.fillStyle = col; for (let k = 3; k <= r; k++) ctx.fillRect(px + dx * k, py + dy * k, 1, 1); }
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
    if (this.state !== 'play') this.time += dt;
    audio.setView(this.vx, this.vy, this.FW, this.FH); audio.tick(dt, this.darkness(), this.state === 'play');
    if (this.state === 'title') { this.goalX += dt * 9; this.goalY += dt * 3; this.vx = this.goalX; this.vy = this.goalY; } // the battlefield drifts by behind the menu
    if (this.state !== 'play') return;
    const sp = 420 * dt, M = this.mouse;
    let mx = 0, my = 0;
    if (this.keys.has('ArrowLeft')) mx--; if (this.keys.has('ArrowRight')) mx++;
    if (this.keys.has('ArrowUp')) my--; if (this.keys.has('ArrowDown')) my++;
    if (M.in && !M.down) { if (M.x < 3) mx--; if (M.x > this.FW - 3) mx++; if (M.y < 3) my--; if (M.y > this.FH - 3) my++; }
    if (mx || my) this.pan(mx * sp, my * sp);
    this.traceLine();
    if ((this.time % 2) < dt) { // what you've seen of the enemy lately (a defence line's mix follows it)
      let air = 0, armour = 0;
      for (const u of this.units) if (this.hostile(0, u.team) && u.team !== MARAUDER && this.spot(u)) { if (u.def.air) air++; else if (u.type === 'tank' || u.type === 'juggernaut' || u.type === 'colossus') armour++; }
      this.sighted.air = Math.max(this.sighted.air * 0.99, air); this.sighted.armour = Math.max(this.sighted.armour * 0.99, armour);
    }
    this.goalX = Math.max(CAM.x0 - 8, Math.min(CAM.x0 + CAM.w - this.worldW() + 8, this.goalX)); // the camera keeps to the playable rectangle
    this.goalY = Math.max(CAM.y0 - 24, Math.min(CAM.y0 + CAM.h - this.FH + 8, this.goalY));
    this.vx += (this.goalX - this.vx) * (1 - Math.exp(-dt * 14));
    this.vy += (this.goalY - this.vy) * (1 - Math.exp(-dt * 14));
    for (let k = 0; k < (this.R.pace ?? 1) && this.state === 'play'; k++) this.step(dt); // (BLITZ runs the battle several steps a frame)
  }

  // One step of the battle itself.
  step(dt: number) {
    this.time += dt;
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
    if (FRONT) this.updateFront(dt);
    this.updateCombat(dt);
    this.updateStrikes(dt);
    if (!this.lesson || this.lesson.step >= this.lessonSteps.length - 1) for (const ai of this.ais) if (!this.out.has(ai.me)) ai.update(dt); // (it waits while you learn)
    if (this.lesson) this.updateLesson();
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
    this.shakeAt = Math.max(0, this.shakeAt - dt * 1.5);
    for (const b of this.bodies) b.t += dt; if (this.bodies.length && this.bodies[0].t > BODY_T) this.bodies = this.bodies.filter((b) => b.t < BODY_T);
    if (dt > 0) for (const u of this.units) { // a vehicle's hull rocks on its springs as it pulls away and brakes: back as it sets off, forward as it stops (looks only)
      if (!u.def.vehicle || u.def.air) continue;
      if (u.lx !== u.lx) { u.lx = u.x; u.ly = u.y; }
      const v = ((u.x - u.lx) * Math.cos(u.heading) + (u.y - u.ly) * Math.sin(u.heading)) / dt, was = u.fwd; // (only speed along the way it faces: crowds jostle sideways)
      u.lx = u.x; u.ly = u.y; u.fwd += (v - u.fwd) * Math.min(1, dt * 15); // (smoothed: one jostled frame isn't a lurch)
      const w = 14 / Math.sqrt(u.def.radius / 10), dv = u.fwd - was; // the heavier, the slower it sways
      if (dv < -u.def.speed * 0.25 && u.lurchV >= 0 && Math.abs(u.lurch) < 0.3 && u.def.radius >= 10) { const [sx, sy] = this.scr(u); for (let k = 0; k < 3; k++) this.puffs.push({ x: sx + Math.cos(u.heading + YAW) * u.def.radius + (Math.random() - 0.5) * 6, y: sy, vx: (Math.random() - 0.5) * 8, vy: -3 - Math.random() * 3, t: 0, life: 0.7, c: '#9a8664', s: 1 }); } // a hard stop throws up dust under the nose
      u.lurchV += -dv * 2 + (-u.lurch * w * w - u.lurchV * w * 0.7) * dt; // a kick from the change in speed, then a damped spring
      u.lurch += u.lurchV * dt;
    }
    for (const u of this.units) if (u.type === 'colossus' && u.moving && Math.floor(u.bob / 6) !== u.stepN) { // the Colossus's footfalls thud: the ground shakes and dust rings out
      u.stepN = Math.floor(u.bob / 6);
      const [sx, sy] = this.scr(u); this.quake(0.35, sx, sy); audio.thud(u.x, u.y);
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; this.puffs.push({ x: sx + Math.cos(a) * 10, y: sy + Math.sin(a) * 5, vx: Math.cos(a) * 14, vy: Math.sin(a) * 7 - 3, t: 0, life: 0.7, c: '#9a8664', s: 1 + (k & 1) }); }
    }
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
      else if (!u.path.length && (!u.goal || u.stuck >= 3)) { // got as far as it could, but not there: try again a few times, then this builder leaves it a minute and takes other work
        if (this.climbOut(u)) this.assignSite(u, b); // sealed in a pocket: it scrambles out first
        else if (++u.siteTries > 3) { // (only this one: a builder stuck in a corner used to set every site aside for everyone, and the whole queue stalled)
          u.siteTries = 0; u.cant.set(b, this.time + 60); u.buildSite = null; u.goal = null; u.path = [];
          const by = (b.failedBy ??= new Set()); by.add(u);
          if (by.size >= 2 || this.builders(u.team).length < 2) { b.blocked = this.time + 60; b.failedBy = undefined; } // two builders couldn't: it's walled in, set it aside a minute
        } else this.assignSite(u, b);
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
        if (u.target && d.weapon && this.reach(u.x, u.y, u.target) <= WEAPONS[d.weapon].range) return; // stopped to fight on the way: not stuck, it carries on once the fight's over (it used to count each pause as a failed try and give up)
        if (this.pathBudget <= 0 || pathStats.work > PATH_WORK) return; // enough route planning this frame: try again next frame
        if (u.stuck < 3) {
          this.pathBudget--; u.path = findPath(t, u.x, u.y, u.goal[0], u.goal[1], d.crush, u.stuck ? undefined : REPLAN);
          const end = u.path[u.path.length - 1];
          if (pathStats.reached && (!end || (Math.hypot(end[0] - u.x, end[1] - u.y) < CELL && Math.hypot(end[0] - u.goal[0], end[1] - u.goal[1]) > CELL / 2))) { u.path = []; u.goal = null; u.pace = 0; return; } // the nearest it can get is where it stands (its spot is inside a building or walled off): it's there (it used to re-plan every frame and stand there for good)
          if (!pathStats.reached && this.time - u.firedAt > 3) u.stuck++;
        } // a quick search first, a full one once that falls short; only a search that can't find the way counts as a failed try (a jam that made it re-plan three times used to make it give up for good, on open ground; and a re-plan after stopping to shoot isn't one either)
        else if (!this.climbOut(u)) { u.goal = null; u.avoid = (u.avoid ?? 0) + 1; } // can't get there: sealed in, it scrambles out and tries again; otherwise it gives up rather than sit forever
      }
      return;
    }
    if ((u.progT += dt) > 3) { // three seconds with a route and no real progress: squeeze past, or plan again
      if (Math.hypot(u.x - u.px0, u.y - u.py0) < d.speed * 3 * 0.35) u.squeeze = this.time + 3; // hemmed in for a while: politeness gives way, it squeezes past whoever is in the way
      if (Math.hypot(u.x - u.px0, u.y - u.py0) < 6 && !u.target) u.path = []; // no headway at all: plan afresh from here (it used to skip the waypoint and cut straight at whatever it was going round, then drop the order)
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
        if (u.goal && Math.hypot(u.goal[0] - u.x, u.goal[1] - u.y) > 2 * CELL) return; // the end of a detour (a chase on the way), not of the order: it plans the rest next frame
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
        const o: Unit = best, room = d.radius + o.def.radius + this.gap(u, o), sameSpot = !!o.goal && !!u.goal && Math.hypot(o.goal[0] - u.goal[0], o.goal[1] - u.goal[1]) < 30, same = o.moving && !sameSpot && Math.cos(angDiff(o.heading, want)) > 0.6 && (o.pace || o.def.speed) >= (u.pace || d.speed) * 0.85; // two heading for the same spot don't queue politely forever; and a faster unit passes a slower one instead of following it (a whole army on one route used to crawl at the pace of whoever was in front)
        const parked = o.team === u.team && !o.goal && !o.path.length && !o.moving && !o.target && o.type !== 'harvester' && !o.buildSite;
        let gave = false;
        if (parked && !same) { // one of ours standing about in the way: it shuffles aside to let us by, as a soldier would for a passing tank
          const side = Math.abs(bestLat) < 2 ? 1 : Math.sign(bestLat), need = room - Math.abs(bestLat) + 2, k = Math.min(need, (u.pace || d.speed) * dt * 1.5), ox = o.x, oy = o.y; // (straight ahead: it steps to our right)
          this.nudge(o, -fy * side * k, fx * side * k);
          gave = o.x !== ox || o.y !== oy;
          if (gave && bestAhead < room * 0.6) ease = Math.min(ease, 0.6); // right on top of it: ease off while it gets clear
        }
        if (same && !gave) ease = Math.max(0, Math.min(1, (bestAhead - room) / 10)); // follow at a gap (if it's making room, just keep going)
        else if (!gave && !(o.goal === null && u.path.length === 1 && dist < 30)) { // steer round (not when it's standing on our own spot: arriving handles that)
          const oncoming = o.moving && Math.cos(angDiff(o.heading, want)) < -0.5, side = oncoming || Math.abs(bestLat) < 2 ? 1 : -Math.sign(bestLat), turnBy = Math.min(1.1, (1 - bestAhead / look) * 1.6 + 0.25); // pass on the side away from them; oncoming, always keep right (everyone picking the same side sorts two streams into two lanes; dodging whichever way was clear wove them into a jam)
          const cx0 = t.cellOf(u.x), cy0 = t.cellOf(u.y), clear = (a: number) => { const r = d.radius + 10, x1 = t.cellOf(u.x + Math.cos(a) * r), y1 = t.cellOf(u.y + Math.sin(a) * r); return (x1 === cx0 && y1 === cy0) || t.step(cx0, cy0, x1, y1, d.crush); }; // only swerve onto ground we can drive on
          const by = [side * turnBy, side * turnBy * 0.5, side * 0.25, -side * turnBy, -side * turnBy * 0.5].find((a) => clear(want + a)); // a hard swerve, else a gentle drift (on a narrow bridge a swerve points into the water: a drift still gets two lanes by)
          if (by !== undefined) want += by;
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
    if (u.moving && u.team === 0 && (u.type === 'builder' || u.type === 'harvester') && this.time - u.revT > 9) { u.revT = this.time; audio.fx('engine', u.x, u.y, 0.3); }
    u.bob += dt * 10;
    if (d.track && u.moving) {
      u.trackAcc += step;
      while (u.trackAcc > 1) { u.trackAcc -= 1; t.track(u.x - Math.cos(u.heading) * 8, u.y - Math.sin(u.heading) * 8, u.heading, d.track); }
    }
    if (u.enter && this.reach(u.x, u.y, u.enter) < (u.goal ? 30 : 54)) this.enter(u, u.enter); // at its edge, on any open side (or stopped just short of it, jostled by a crowd round the door: it used to stand there for good)
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
      audio.crunch(tr.x, tr.y); audio.fx('tree', tr.x, tr.y, 0.5);
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
    const q = this.shakeAt, shx = q > 0 ? Math.round((Math.random() - 0.5) * q * 10) : 0, shy = q > 0 ? Math.round((Math.random() - 0.5) * q * 7) : 0; // blasts shake the view (see quake)
    const ctx = this.ctx, vx = Math.round(this.vx) + shx, vy = Math.round(this.vy) + shy, M = this.mouse;
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
        const jx = this.time - (b.hitAt ?? -99) < 0.15 ? (Math.floor(this.time * 40) % 2 ? 1 : -1) : 0; // a shell hit makes it shudder
        sprite(s, x + jx, y);
        const tl = this.looks[this.lookKey(b)].turret;
        if (tl) { const d = this.looks[this.lookKey(b)].def, at = d.turretAt!, ox = at[0] - d.bodyPivot[0], oz = at[2] - d.bodyPivot[2]; sprite(facing(tl, b.tHead + YAW), x + jx + YC * ox - YS * oz, y + (YS * ox + YC * oz) * SQ - at[1]); }
        if (b === this.selBld) this.outline(b, vx, vy);
        if (CAPTURE[b.type]) this.drawFlag(b, vx, vy);
        if (b.team === 0 && b.type !== 'wall' && b.rise >= 1 && !this.territory.linked.has(b)) this.drawCut(Math.round(x), Math.round(y - s.ay) - 3);
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
          // a gun firing a shell kicks back: the turret slides back along the barrel, the hull rocks a pixel
          const since = this.time - u.firedAt, kick = u.def.vehicle && since < 0.2 && WEAPONS[u.def.weapon]?.kind === 'shell' ? 1 - since / 0.2 : 0;
          const ka = u.tHead + YAW, big = u.def.radius > 12 ? 2 : 1, kx = -Math.cos(ka) * kick * big, ky = -Math.sin(ka) * kick * big * 0.6;
          const ha = u.heading + YAW, lu = Math.max(-3, Math.min(3, u.lurch)), lx = Math.cos(ha) * lu, ly = Math.sin(ha) * lu * 0.6 + Math.abs(lu) * 0.4; // rocking on its springs (see update): the hull pitches forward or back, dipping a little
          const bx = x + Math.round(kx + lx), by = y + Math.round(ky + ly), flash = this.time - u.flashAt < 0.07;
          sprite(body, bx, by);
          if (flash) ctx.drawImage(this.whiteOf(body), Math.round(bx - body.ax), Math.round(by - body.ay)); // hit by a blast: a white flash
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
            const c = Math.cos(u.heading + YAW), s = Math.sin(u.heading + YAW), ts = facing(look.turret, u.tHead + YAW);
            const tx = bx + Math.round(kx * 1.5 + lx * 0.5) + ox * c - oz * s, ty = by + Math.round(ky * 1.5 + ly * 0.5) + ox * s + oz * c - (at[1] - d.bodyPivot[1]); // (the turret sits up top: it swings a bit further than the hull)
            sprite(ts, tx, ty);
            if (flash) ctx.drawImage(this.whiteOf(ts), Math.round(tx - ts.ax), Math.round(ty - ts.ay));
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
    for (const b of this.bodies) { // fallen soldiers on the ground, under everything standing
      const x = Math.round(b.x - vx - b.s.ax), y = Math.round(b.y - vy - b.s.ay);
      if (x < -20 || y < -20 || x > this.FW || y > this.FH || !this.seenAt(b.x, b.y)) continue;
      const f = BODY_T - b.t; if (f < 2) ctx.globalAlpha = f / 2;
      ctx.drawImage(b.s.img, x, y); ctx.globalAlpha = 1;
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
    for (const b of this.blasts) if (this.seenAt(b.x, b.y)) drawBlast(ctx, b, vx, vy, LOOK.ring);
    if (this.state !== 'title') { this.drawGlows(vx, vy, LOOK.glow * (1 - this.darkness())); grade(ctx, this.FW, this.FH, this.worldW(), this.darkness()); } // (by night, drawDaylight already lit these)
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
      if (!u.rank || u.ride || !this.spot(u)) continue; // only where you can see the unit itself (an enemy veteran in the fog or hiding in the woods showed its chevrons)
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
    this.drawPatrols(vx, vy); this.drawOrders(vx, vy);
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
    let cursorKind: 'arrow' | 'move' | 'select' | 'busy' | 'attack' | 'amove' | 'build' | 'capture' = 'arrow', hoverName = '', verb = '', hoverBody = '';
    if (M.in) {
      const over = this.state === 'play' && this.inView(M.y) ? this.unitAt(M.x + vx, M.y + vy) : null;
      this.hoverBld = this.state === 'play' && this.inView(M.y) ? this.bldAtScreen(M.x + vx, M.y + vy) : null;
      const armed = this.selected().some((u) => u.def.weapon);
      const job = over && over.team === 0 && !this.aiming && this.selected().length && this.state === 'play' && this.inView(M.y) && ['capture', 'enter', 'build', 'repair'].includes(this.intent(M.x + vx, M.y + vy).kind); // a right-click on the building behind your own soldier still takes it
      const kind = this.state !== 'play' || !this.inView(M.y) ? 'arrow' : this.aiming === 'attack' ? 'amove' : this.aiming === 'guard' ? 'move' : this.aiming ? 'attack' : over && over.team === 0 && !job ? 'select' : armed && this.enemyAt(M.x + vx, M.y + vy) ? 'attack' : this.selected().length ? 'move' : 'arrow';
      cursorKind = kind;
      // name of whatever is under the cursor, shown beside it
      const hb = this.hoverBld, seenU = over && !job && this.spot(over); // (taking the building behind: name the building)
      // the less obvious things a right-click will do get a word in gold beside the cursor
      if (this.state === 'play' && this.inView(M.y) && !M.drag && !this.placing && kind !== 'select') {
        const blow = this.aiming === 'attack' && this.intent(M.x + vx, M.y + vy, true).kind === 'attack' && (this.hoverBld?.type === 'dam' || this.hoverBld?.type === 'bridge');
        const it = blow ? 'attack' : this.aiming === 'attack' ? 'amove' : this.aiming === 'guard' ? 'guard' : this.intent(M.x + vx, M.y + vy).kind, uplink = this.selBld;
        verb = it === 'launch' && uplink ? ((uplink.timer ?? 0) >= UPLINK_TIME ? 'ORBITAL STRIKE' : `CHARGING ${Math.floor(((uplink.timer ?? 0) / UPLINK_TIME) * 100)}%`)
          : it === 'attack' && this.hoverBld?.type === 'dam' ? 'BLOW THE DAM' : it === 'attack' && this.hoverBld?.type === 'bridge' ? 'BLOW THE BRIDGE' : it === 'rebuild' ? `REBUILD THE BRIDGE $${DEF.bridge.cost}` : ({ guard: this.guardFrom ? 'PATROL THIS LINE' : this.hoverBld?.team === 0 ? 'GUARD THIS BUILDING' : 'GUARD HERE', amove: 'ATTACK-MOVE', rally: 'SET RALLY POINT', enter: 'MOVE IN', capture: 'CAPTURE', build: 'BUILD', repair: 'REPAIR', claim: 'CLAIM' } as Record<string, string>)[it] ?? '';
      }
      if (verb === 'BUILD' || verb === 'REPAIR') cursorKind = 'build'; // a right-click puts the builders to work: the cursor says so
      if (verb === 'CAPTURE' || verb === 'CLAIM') cursorKind = 'capture'; // taking it, not shooting it: a gold flag, not the red gunsight
      if (kind === 'attack' && !verb) { const foe = this.enemyAt(M.x + vx, M.y + vy), mine = this.selected().filter((u) => u.def.weapon && u.type !== 'builder'); if (foe && mine.length && this.weakAgainst(mine, foe)) verb = 'WEAK'; } // a warning before the order, not after
      hoverName = M.drag ? '' : seenU ? over!.def.name + this.tag(over!.team) : hb && (hb.team === 0 || hb.seen || hb.team === 2) ? (CAPTURE[hb.type]?.name ?? hb.name) + this.tag(hb.team) : '';
      const thing: object | null = !hoverName ? null : seenU ? over! : hb;
      if (thing !== this.hoverOn) { this.hoverOn = thing; this.hoverT = this.time; }
      if (thing && this.time - this.hoverT > 0.35) {
        const site = !seenU && hb ? CAPTURE[hb.type] : undefined, takeable = site && hb!.team !== 0 && !site.garrison;
        const what = seenU ? ROLE[over!.type] ?? '' : site ? site.tip : ROLE[hb!.type] ?? '';
        const next = verb && verb !== 'WEAK' ? `RIGHT-CLICK: ${verb}.` : takeable ? 'SELECT SOLDIERS (RIFLEMEN), THEN RIGHT-CLICK IT TO CAPTURE IT.' : site?.garrison && hb!.team !== 1 ? 'SELECT SOLDIERS, THEN RIGHT-CLICK IT TO SEND THEM IN.' : '';
        hoverBody = [what, next].filter(Boolean).join(' ');
      }
    }
    // the interface layer: side panel, caption, menus and the cursor, at a fixed pixel size
    this.hctx.clearRect(0, 0, this.HW, this.HH);
    this.withHud(() => {
      if (this.state === 'title') this.drawTitle();
      else { if (this.k === 1) this.drawIcons(vx, vy); this.drawPings(vx, vy); this.drawSidebar(); this.drawCaption(); if (this.hints && this.state === 'play') this.drawGoals(); if (this.state === 'play') { this.drawOilPointers(); this.drawBanners(); this.drawLesson(); } }
      if (this.state === 'paused') this.drawPause();
      if (this.state === 'won' || this.state === 'lost') this.drawEnd();
      if (M.in && (hoverName || verb) && this.state === 'play' && M.x < this.FW - SB) {
        const l = hoverName.toUpperCase(), gap = l && verb ? 6 : 0, w = textWidth(l) + gap + textWidth(verb) + 6;
        this.ctx.fillStyle = 'rgba(13,12,11,0.8)'; this.ctx.fillRect(M.x + 10, M.y + 12, w, 10);
        text(this.ctx, l, M.x + 13, M.y + 14, hoverName.includes('ENEMY') ? C.bad : C.cream);
        text(this.ctx, verb, M.x + 13 + textWidth(l) + gap, M.y + 14, verb === 'WEAK' ? C.bad : C.gold);
        if (hoverBody) this.drawNote(l, hoverBody, Math.min(M.x + 184, this.FW - SB - 4), M.y + 26); // held a moment over it: what it is and does
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
    if (b && ((b.type === 'dam' && !this.friendly(b.team)) || (b.type === 'bridge' && b.team === 2 && b.rise >= 1)) && b.dying < 0) return b; // anyone may blow a dam (not their own) or a bridge: only ever on purpose
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
  // how far a defence reaches: its gun's range, a watchtower's soldiers a third further from the height, and a cannon
  // emplacement inside its side's radar cover out past the field guns (so a fortress can answer a siege: take its radar
  // out first and it can't)
  reachOf(type: string, team: number, x: number, y: number) {
    const wk = DEFENCE[type] ?? 'garrison', r = WEAPONS[wk].range * (type === 'watchtower' ? 1.3 : 1);
    return !this.onRadar(team, x, y) ? r : type === 'emplacement' ? RADAR_CANNON : type === 'flakTower' ? RADAR_FLAK : r; // (flak too: the radar sees aircraft coming, so it opens fire sooner, before the bombs drop)
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
      const w = WEAPONS[wk], [bx, by] = this.posOf(b), range = this.reachOf(b.type, b.team, bx, by);
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
        const there = !u.goal && !u.path.length, wv = u.wave, waits = u.team !== 0 && wv; // (the computer still waits for its whole wave)
        if (wv && there && wv.first < 0) wv.first = this.time;
        const all = !waits || wv.members.every((m) => !this.alive(m) || (!m.ride && !m.goal && !m.path.length)) || this.time - wv.first > 40; // everyone gathered (or a fair wait)
        // yours strike the moment they're there or have it in reach: nobody stands about waiting to be picked off
        if ((there && all) || this.reach(u.x, u.y, u.strike) <= w.range) { u.mopUp = this.posOf(u.strike); u.target = u.strike; u.forced = true; u.amove = false; u.goal = null; u.path = []; u.chase = 0; u.strike = null; u.wave = null; }
      }
    }
    if (!u.forced && (u.scanT -= dt) <= 0) {
      u.scanT = 0.3;
      // look for trouble when standing still or attack-moving (a plain move order ignores the enemy)
      // idle units notice enemies a little beyond their reach (and step up to fight them)
      // long guns only fire at what someone can see: the enemy's guns stay within their own sight
      const idle = !u.goal && !u.path.length, reach = u.amove ? w.range + NOTICE * CELL : idle || u.post ? Math.max(w.range + 40, INTERCEPT * CELL) : w.range + 40; // standing about, it notices enemies it can plainly see a fair way off
      if (!u.path.length || u.amove) u.target = this.nearestEnemy(u.team, u.x, u.y, reach, w.min ?? 0, w);
      else if (moving) u.target = this.nearestEnemy(u.team, u.x, u.y, w.range, w.min ?? 0, w); // on the move: it fires at what's already in reach, without stopping or chasing (it used to drive straight past)
    }
    if (u.target && !this.canHit(w, u.target)) { u.target = null; u.forced = false; }
    if (!u.target) { if (u.post && !u.goal && !u.path.length) this.goHome(u); return; } // the fight's over: back to where it stood
    const [tx, ty] = this.posOf(u.target), d = this.reach(u.x, u.y, u.target);
    if (w.min && d < w.min) { if (!u.forced) u.target = null; return; } // too close for the big gun
    if (d > w.range) {
      if (moving) { u.target = null; return; } // never chase while you're being moved away
      const close = d < Math.max(w.range + 46, INTERCEPT * CELL + 10); // an idle unit goes out to meet an enemy it can see, within reason
      if (close && !u.goal && !u.forced && !u.post) u.post = [u.x, u.y]; // (and remembers where it stood)
      if (u.post && Math.hypot(u.x - u.post[0], u.y - u.post[1]) > LEASH * CELL) { u.target = null; this.goHome(u); return; } // not off across the map: back to its spot
      if (u.forced || (close && !u.goal) || (u.amove && d < w.range + NOTICE * CELL)) { // (attack-moving: it turns aside to fight what it notices, then picks its route up again)
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
    let aimed: boolean;
    if (turret) { u.tHead += Math.max(-dt * 3, Math.min(dt * 3, angDiff(u.tHead, want))); aimed = Math.abs(angDiff(u.tHead, want)) < 0.15; }
    else if (moving) { aimed = Math.abs(angDiff(u.heading, want)) < 1; u.tHead = u.heading; } // no turret, on the move: it keeps its course and fires at what's roughly ahead
    else { u.heading = u.tHead = want; aimed = true; }
    if (u.reload <= 0 && aimed) {
      u.reload = w.reload * (0.9 + Math.random() * 0.2); u.firedAt = this.time; // shooting gives away a hidden position
      const [sx, sy] = this.scr(u), a = u.tHead + YAW, ml = u.def.vehicle ? 13 : 4, h = u.def.air ? 0 : u.def.vehicle ? 7 : 4;
      this.shoot(sx + Math.cos(a) * ml, sy + Math.sin(a) * ml - h, u.target, w, u.team, u);
    }
  }

  goHome(u: Unit) { const p = u.post!; u.post = null; u.chase = 0; u.goal = [p[0], p[1]]; u.amove = true; u.path = this.route(u, p[0], p[1]); }
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
      audio.shot(w, ...this.posOf(src), gx, gy, 0.7);
      return;
    }
    if (w.kind === 'bullet') {
      this.tracers.push({ x0: mx, y0: my, x1: ts + (Math.random() - 0.5) * 4, y1: ty + (Math.random() - 0.5) * 3, t: 0 });
      if (this.isUnit(t) || (t.type !== 'dam' && t.type !== 'bridge')) this.damage(t, (w.dmg[this.armourOf(t)] ?? 0) * (0.8 + Math.random() * 0.4), team, src); // bullets just chip concrete and timber: only blasts bring a dam or bridge down
      this.puffs.push({ x: ts + (Math.random() - 0.5) * 4, y: ty, vx: (Math.random() - 0.5) * 10, vy: -6, t: 0, life: 0.25, c: '#d8c8a0', s: 1 });
      audio.shot(w, ...this.posOf(src), gx, gy);
      return;
    }
    const ex = gx + (Math.random() - 0.5) * 8, ey = gy + (Math.random() - 0.5) * 8, [es, esy] = this.scr({ x: ex, y: ey });
    const dist = Math.hypot(es - mx, esy - my);
    this.shells.push({ x: 0, y: 0, sx: mx, sy: my, tx: es, ty: esy - 3 - (tAir ? ALT : 0), alt: tAir ? ALT : 0, t: 0, life: dist / (w.speed ?? 280), w, team, arc: dist * (w.arc ?? 0.06), gx: ex, gy: ey, src });
    for (let i = 0; i < 4; i++) this.puffs.push({ x: mx, y: my, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 4, t: 0, life: 0.7, c: '#8a8478', s: 2 });
    audio.shot(w, ...this.posOf(src), gx, gy, dist / (w.speed ?? 280));
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
    audio.explosion(gx, gy, r / 10);
    this.quake(Math.min(0.5, Math.max(w.dmg.veh, w.dmg.bld) / 400), sx, sy); // heavy guns kick the view, grenades and rockets barely
    const hit: Unit[] = [];
    this.near(gx, gy, r + 12, (u) => { if (!u.def.air && this.hostile(team, u.team) && Math.hypot(u.x - gx, u.y - gy) - u.def.radius < r) hit.push(u); });
    for (const u of hit) { u.flashAt = this.time; const d = Math.hypot(u.x - gx, u.y - gy) - u.def.radius; this.damage(u, (w.dmg[this.armourOf(u)] ?? 0) * (1 - (Math.max(0, d) / r) * 0.6), team, src); }
    for (const b of this.blds) if (b.max > 0 && (this.hostile(team, b.team) || ((b.type === 'dam' || b.type === 'bridge') && b.team === 2)) && this.reach(gx, gy, b) < r * 0.5) { b.hitAt = this.time; this.damage(b, w.dmg.bld, team, src); } // (dams and bridges belong to nobody: any blast can bring them down)
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
    if (this.R.hit && this.hostile(0, team) && this.ais.some((a) => a.me === team)) amt *= this.R.hit; // (NIGHTMARE: the enemy computers hit harder)
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
    if (this.friendly(t.team) && this.hostile(team, t.team)) this.ping(...this.posOf(t), amt, src && this.alive(src) ? this.posOf(src) : undefined);
    const victim = this.ais.find((a) => a.me === t.team); if (victim) { victim.grudge[team] = (victim.grudge[team] ?? 0) + amt; if (this.isUnit(src) && src.def.air) victim.airHit(); } // remembered when it picks a target; air raids noticed at once
    if (!this.isUnit(t) && this.fort.has(t)) amt *= 0.75; // a fortified line shrugs off a quarter
    if (this.isUnit(t)) t.hitAt = this.time;
    if (this.isUnit(t) && t.riders.length && amt > 0) { const rs = [...t.riders]; for (const r of rs) this.dismount(r); for (const r of rs) this.damage(r, amt * 0.35, team, src); } // riders are exposed: a hit hurts them and knocks them off
    if (src && this.isUnit(src) && this.hostile(src.team, t.team)) { // experience: the damage that landed (half for buildings)
      const before = src.rank; src.xp += Math.min(amt, Math.max(0, t.hp)) * (this.isUnit(t) ? 1 : 0.5);
      if (src.rank > before && src.team === 0) this.bark = { who: src.def.name, line: ['Promoted!', 'Veteran now.', 'Elite!'][src.rank - 1], t: 2, pri: 0 }; // (chatter: in a big fight promotions come in strings)
    }
    t.hp -= amt;
    if (t.team === 0 && this.time - this.alertT > 25) { // tell the player when they're hit, now and then
      this.alertT = this.time;
      this.warn(this.isUnit(t) ? 'Our units are under attack!' : 'Our base is under attack!', this.posOf(t));
    }
    if (this.isUnit(t)) {
      if (!t.target && !t.fallBack && !t.scouting && t.def.weapon && this.alive(src) && (!t.goal || t.amove)) t.target = src; // shoot back, unless you ordered it away
      if (t.hp <= 0 && FRONT && this.sides.includes(t.team)) { // (FRONT LINE: points come from the fighting, a quarter of the price to each side: to the troops that made the kill (not a call-in, which would pay for the next one) and to the side that lost it, so whoever is behind still gets help instead of the winner snowballing)
        const v = (DEF[t.type]?.cost ?? 0) * POINT_SHARE;
        if (this.sides.includes(team) && this.hostile(team, t.team) && src && this.isUnit(src)) this.points[team] += v;
        this.points[t.team] += v;
      }
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
    for (const d of this.divisions) if (d) { d.units = d.units.filter((o) => o !== u); d.fresh = d.fresh.filter((o) => o !== u); d.companies = (d.companies ?? []).map((c) => c.filter((o) => o !== u)).filter((c) => c.length); }
    const [sx, sy] = this.scr(u);
    if (!u.def.vehicle) { // he falls where he stood, in a puff of dust, and lies there a while
      for (let i = 0; i < 3; i++) this.puffs.push({ x: sx, y: sy - 2, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 4, t: 0, life: 0.8, c: '#8a8070', s: 1 });
      if (!u.ride) { this.bodies.push({ x: sx, y: sy, s: this.fallenOf(facing(this.looks[u.type + u.team].body, u.heading + YAW)), t: 0 }); if (this.bodies.length > 200) this.bodies.shift(); }
      return;
    }
    this.blasts.push({ x: sx, y: sy - 4, t: 0, size: 14 });
    this.leaveScrap(u.x, u.y, (DEF[u.type]?.cost ?? 600) * 0.4, 0);
    audio.explosion(u.x, u.y, 2.2);
    this.quake(Math.min(1, u.def.radius / 22 + 0.15), sx, sy);
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
      if (m.t < m.dur - 3.6 && m.t + dt >= m.dur - 3.6) audio.fx('orbital', m.tx, m.ty, 1); // (its whine builds to the slam as it lands)
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
          audio.fx('intercept', m.tx, m.ty, 0.8);
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
    this.quake(1.6, sx, sy); audio.explosion(gx, gy, 3);
    const hit: Unit[] = [];
    this.near(gx, gy, R + 30, (u) => { if (Math.hypot(u.x - gx, u.y - gy) < R) hit.push(u); });
    for (const u of hit) if (this.alive(u)) { u.hp -= 800 * (1 - Math.hypot(u.x - gx, u.y - gy) / R * 0.5); if (u.hp <= 0) this.killUnit(u); }
    for (const o of [...this.blds]) if (o.max > 0 && o.dying < 0 && this.reach(gx, gy, o) < R) { o.hp -= FRONT && o.type === 'fieldCommand' ? 1200 : 2600; if (o.hp <= 0) { o.hp = 0; o.dying = 0; } } // (FRONT LINE: the Field Command is the whole game, so a strike only dents it)
    this.scorch(sx, sy, 50); this.knockTrees(gx, gy, R + 20);
    for (let i = 0; i < 5; i++) this.fires.push({ x: sx + (Math.random() - 0.5) * 80, y: sy + (Math.random() - 0.5) * 40, t: 20 + Math.random() * 20, s: 10 });
  }
  // A destroyed Fusion Reactor goes up in a blast that hurts everyone nearby, friend or foe.
  meltdown(gx: number, gy: number) {
    const R = 5 * CELL, [sx, sy] = this.scr({ x: gx, y: gy });
    for (let i = 0; i < 10; i++) this.blasts.push({ x: sx + (Math.random() - 0.5) * 60, y: sy - Math.random() * 40, t: -Math.random() * 0.4, size: 14 + Math.random() * 12 });
    this.quake(1.2, sx, sy); audio.explosion(gx, gy, 3);
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
      if (who === 0) { this.bark = { who: d.def.name, line: 'Abandoned machine claimed. Back in the fight.', t: 3 }; }
    }
    // crates: first come, first paid
    this.crates = this.crates.filter((c) => {
      let by: Unit | null = null;
      this.near(c.x, c.y, 24, (o) => { if (o.team !== 2 && !o.def.air && o.type !== 'builder' && Math.hypot(o.x - c.x, o.y - c.y) < 18) { by = o; return true; } });
      if (!by) return true;
      const who = (by as Unit).team;
      this.prods[who].credits += 800;
      if (who === 0) { this.bark = { who: 'Supply crate', line: '+$800', t: 2 }; audio.fx('crate', c.x, c.y); }
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
    this.quake(0.6, sx, sy);
  }

  // A sprite's outline filled white (a unit flashing as a blast hits it), made once per sprite.
  white = new WeakMap<Sprite, HTMLCanvasElement>();
  whiteOf(s: Sprite) {
    let c = this.white.get(s);
    if (!c) { c = document.createElement('canvas'); c.width = s.img.width; c.height = s.img.height; const x = c.getContext('2d')!; x.drawImage(s.img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); this.white.set(s, c); }
    return c;
  }
  // A soldier's sprite tipped over onto the ground and darkened: how he lies where he fell (made once per facing).
  lying = new WeakMap<Sprite, Sprite>();
  fallenOf(s: Sprite) {
    let f = this.lying.get(s);
    if (!f) {
      const w = s.img.width, h = s.img.height, c = document.createElement('canvas'); c.width = h; c.height = w;
      const x = c.getContext('2d')!; x.translate(h, 0); x.rotate(Math.PI / 2); x.drawImage(s.img, 0, 0); // a quarter turn: feet stay put, head to the right
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(30,24,20,0.35)'; x.fillRect(0, 0, h, w);
      const px = x.getImageData(0, 0, h, w).data; let x0 = h, y0 = w, x1 = 0, y1 = 0; // trimmed to the figure itself: hundreds lie about in a big battle
      for (let i = 3; i < px.length; i += 4) if (px[i]) { const X = (i >> 2) % h, Y = Math.floor((i >> 2) / h); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
      const t = document.createElement('canvas'); t.width = Math.max(1, x1 - x0 + 1); t.height = Math.max(1, y1 - y0 + 1); t.getContext('2d')!.drawImage(c, -x0, -y0);
      f = { img: t, ax: h - s.ay + 4 - x0, ay: s.ax - y0, shadow: t }; // (anchored mid-body, so he lies across the spot he stood on)
      this.lying.set(s, f);
    }
    return f;
  }
  // Shake the view, less the further from the middle of it (sx, sy: map screen point): a blast across the map
  // never shakes your screen, a big one is felt from further off. Never adds up: a busy battle stays readable.
  quake(amt: number, sx: number, sy: number) {
    const d = Math.hypot(sx - this.vx - this.FW / 2, sy - this.vy - this.FH / 2), reach = Math.max(this.FW, this.FH) * (0.5 + amt * 0.6);
    this.shakeAt = Math.max(this.shakeAt, amt * Math.max(0, 1 - d / reach));
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
      audio.fx('tree', tr.x, tr.y, 0.5);
    }
  }
  knockTrees(gx: number, gy: number, r: number) {
    const row = Math.floor(gy / CELL);
    for (let rr = row - 1; rr <= row + 1; rr++) for (const tr of this.trees[rr] ?? []) {
      if (tr.fall >= 0 || Math.hypot(tr.x - gx, tr.y - gy) > r) continue;
      tr.fall = 0; tr.dir = ((Math.round(Math.atan2(tr.y - gy, tr.x - gx) / (Math.PI / 2)) % 4) + 4) % 4;
      audio.fx('tree', tr.x, tr.y, 0.55);
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
    if (this.R.see) { if (v.includes(0)) explored = true; v.fill(2); Object.assign(this.seen, { x0: 0, y0: 0, x1: N - 1, y1: N - 1 }); } // (SANDBOX: no fog)
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
  endWhy = ''; // how the game ended, when it isn't the usual way (BLITZ's clock)
  clockLeft() { return this.R.clock ? this.R.clock - this.stats.time / (this.R.pace ?? 1) : null; } // real seconds left on BLITZ's clock
  groundShares(): [number, number] { // the percent of the map your side holds, and the strongest enemy's
    const all = [...this.territory.area.values()].reduce((a, b) => a + b, 0) || 1, pct = (t: number) => Math.round(((this.territory.area.get(t) ?? 0) / all) * 100);
    return [this.sides.filter((t) => this.friendly(t)).reduce((a, t) => a + pct(t), 0), Math.max(0, ...this.sides.filter((t) => this.hostile(0, t)).map(pct))];
  }
  bestSurvival() { return Number(this.setting('best-' + this.rules, '0')) || 0; }
  hubs(team: number) { return this.blds.filter((b) => b.team === team && b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0).length; }
  checkEnd() {
    const name = (t: number) => ['BLUE', 'RED', '', 'GREEN', 'GOLD'][t];
    const beaten = (t: number) => {
      if (this.hubs(t)) { this.hadHub.add(t); if (this.lastStand.delete(t)) { if (this.friendly(t)) this.banner = { title: 'THE LINE HOLDS', sub: 'A NEW FIELD COMMAND STANDS', t: 4, c: C.ok }; else if (this.hostile(0, t)) this.warn(`${name(t)} has a Field Command again.`); } return false; }
      if (!this.hadHub.has(t)) return !(this.blds.some((b) => b.team === t && b.max > 0 && b.dying < 0 && b.type !== 'wall') || this.units.some((u) => u.team === t && u.type === 'builder'));
      if (FRONT || (t === 0 && this.R.sudden)) return true; // (NIGHTMARE: no last stand for you; FRONT LINE: nobody can build another)
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
    const left = this.clockLeft();
    if (left !== null && left <= 60 && !this.told.has('clock60')) { this.told.add('clock60'); this.warn('ONE MINUTE LEFT: MOST GROUND WINS!'); }
    if (left !== null && left <= 0) { const [mine, theirs] = this.groundShares(); this.state = mine > theirs ? 'won' : 'lost'; this.endWhy = `TIME! YOU HELD ${mine}% OF THE LAND, THE ENEMY ${theirs}%.`; this.menuHot = 0; return; } // (BLITZ: the clock decides)
    if (beaten(0)) { this.state = 'lost'; this.menuHot = 0; }
    else if (this.sides.every((t) => !this.hostile(0, t) || this.out.has(t))) { this.state = 'won'; this.menuHot = 0; }
    if (this.R.survive && this.state !== 'play' && this.stats.time > this.bestSurvival()) { this.store('best-' + this.rules, String(Math.floor(this.stats.time))); this.endWhy = `A NEW BEST: YOU LASTED ${Math.floor(this.stats.time / 60)}:${String(Math.floor(this.stats.time % 60)).padStart(2, '0')}!`; } // (NIGHTMARE: a new best)
  }

  // A long march: soldiers near the group's vehicles climb aboard, as many as there are seats; the
  // rest march. Returns the riders and how many walk (or null: nothing to ride, or no room at all).
  mountUp(us: Unit[]): { riders: Unit[]; walking: number } | null {
    const feet = us.filter((u) => !u.def.vehicle && !u.def.air && u.def.weapon && !u.enter), cars = us.filter((u) => SEATS[u.type] && !u.def.air);
    if (!feet.length || !cars.length) return null;
    const free = new Map(cars.map((c) => [c, SEATS[c.type] - c.riders.length])), riders: Unit[] = [];
    const pairs: [number, Unit, Unit][] = []; for (const u of feet) for (const c of cars) { const d = Math.hypot(c.x - u.x, c.y - u.y); if (d < 10 * CELL) pairs.push([d, u, c]); }
    pairs.sort((a, b) => a[0] - b[0]); // nearest seats fill first
    for (const [, u, c] of pairs) if (!u.ride && free.get(c)! > 0) { u.ride = c; u.seat = c.riders.length; c.riders.push(u); free.set(c, free.get(c)! - 1); u.spot = null; u.goal = null; u.path = []; u.queue = []; u.target = null; u.forced = false; riders.push(u); }
    return riders.length ? { riders, walking: feet.length - riders.length } : null;
  }
  mountNote = '';
  // what the group says about it
  mountLine(up: { riders: Unit[]; walking: number }) { return up.walking ? `Mount up! ${up.riders.length} riding, ${up.walking} on foot. We regroup before we hit them.` : 'Mount up! Everyone riding.'; }
  // Off the vehicle, onto open ground beside it
  dismount(u: Unit, hurt = false) {
    const c = u.ride; if (!c) return;
    u.ride = null; c.riders = c.riders.filter((o) => o !== u);
    if (u.team === 0) audio.fx('door', c.x, c.y, 0.4);
    const a = c.heading + Math.PI / 2 + (u.seat % 2 ? Math.PI : 0) + (u.seat >> 1) * 0.5, t = this.terrain;
    for (const r of [16, 10, 0]) { const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r; if (t.open(t.cellOf(x), t.cellOf(y), false)) { u.x = x; u.y = y; break; } }
    u.goal = null; u.path = []; u.stuck = 0; u.pace = 0;
    if (c.goal && !c.gone) { const g: [number, number] = [c.goal[0] + (u.x - c.x), c.goal[1] + (u.y - c.y)]; u.goal = g; u.amove = true; u.path = this.route(u, g[0], g[1]); } // off early (a fight on the way): on foot the rest of the way
    else if (u.spot && !hurt && Math.hypot(u.spot[0] - c.x, u.spot[1] - c.y) < 12 * CELL) { u.goal = u.spot; u.face = c.face ?? c.heading; u.path = this.route(u, u.spot[0], u.spot[1]); } // there: into its own place in the soldiers' row
    u.spot = null;
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
    const mine = us[0].team === 0;
    if (!mine && (up ? up.walking : us.length >= 6) && amove && far > 20 * CELL) { wave = { members: [...us], first: -1, go: [x, y], released: false }; x -= fx * 8 * CELL; y -= fy * 8 * CELL; far -= 8 * CELL; }
    const all = us; us = us.filter((u) => !u.ride);
    for (const u of all) for (const r of u.ride ? [u] : u.riders) r.spot = null; // (a plain move gives riders their place at the end; this kind of order doesn't)
    const paceOf = together && us.length > 1 ? this.paces(us) : null; // each group at its own pace
    const spots = together && us.length > 1 && far > 3 * CELL && !(mine && amove) ? this.formation(us, x, y, fx, fy) : null; // (your attacks push straight on: in formation, units already in front turned back to their slot)
    const lead = this.bunchRoutes(us, x, y);
    us.forEach((u, i) => {
      const a = (i / us.length) * Math.PI * 2, r = us.length > 1 ? 14 + (i % 3) * 8 : 0;
      const g: [number, number] = spots?.get(u) ?? [x + Math.cos(a) * r, y + Math.sin(a) * r];
      u.pace = paceOf?.get(u) ?? 0; u.goal = g; u.amove = amove; u.forced = false; u.post = null; u.stuck = 0; u.enter = null; u.strike = null; u.wave = null; u.mopUp = null; u.gather = wave; u.face = spots ? Math.atan2(fy, fx) : null; u.fallBack = false; // a new order replaces any errand
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
  pings: { x: number; y: number; t: number; dmg: number; from?: [number, number] }[] = []; // from: where the last hit came from
  ping(x: number, y: number, amt: number, from?: [number, number]) {
    let p = this.pings.find((q) => Math.hypot(q.x - x, q.y - y) < 12 * CELL);
    if (!p) { p = { x, y, t: 0, dmg: 0 }; this.pings.push(p); }
    p.dmg += amt; p.t = 0; p.x = x; p.y = y; if (from) p.from = from;
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
        const worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module', name: `n=${N}${FRONT ? "f" : ""}` });
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
    const ctx = this.ctx, [r, g, b] = this.skyAt(this.dayPhase()).map((c) => c + (255 - c) * LOOK.night); // (the look may lift the dark: lights still burn as at full night)
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
  // Fire, blasts and muzzle flashes glow by day as well (s: how strongly), with the same warm light they
  // throw at night: what's violent catches the eye first.
  drawGlows(vx: number, vy: number, s: number) {
    if (s <= 0.02) return;
    const ctx = this.ctx;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lamp = (x: number, y: number, rad: number, a: number) => {
      if (x < -rad || y < -rad || x > this.FW + rad || y > this.FH + rad) return;
      ctx.globalAlpha = Math.min(1, a * s); ctx.drawImage(this.glow, Math.round(x - rad), Math.round(y - rad * 0.75), rad * 2, Math.round(rad * 1.5));
    };
    for (const bl of this.blds) if (bl.rise >= 1 && bl.dying < 0 && bl.max > 0 && bl.hp / bl.max < 0.3 && (this.friendly(bl.team) || bl.seen)) { const [sx, sy] = toScreen((bl.cx + bl.w / 2) * CELL, (bl.cy + bl.h / 2) * CELL); lamp(sx - vx, sy - vy - 10, 10 + bl.w * 4, 0.3 + 0.12 * Math.sin(this.time * 9 + bl.cx)); }
    for (const p of this.puffs) if ((p.life <= 0.06 || p.c === '#ff9a30') && this.seenAt(p.x, p.y + 10)) lamp(p.x - vx, p.y - vy, p.life <= 0.06 ? 7 + p.s * 2 : 4, 0.5);
    for (const bl of this.blasts) if (bl.t >= 0 && this.seenAt(bl.x, bl.y)) lamp(bl.x - vx, bl.y - vy, bl.size * 2.6, 0.9 * (1 - bl.t / 0.55));
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
    this.divisions[k] = { units: [...sel], fresh: [], since: 0, feed: this.divisions[k]?.feed ?? false, companies: [], own: true }; this.tidyCompanies(this.divisions[k]!);
    this.bark = { who: 'Command', line: `${this.divName(k)} formed: ${sel.length} units. Press ${k + 1} or click its card to pick it.`, t: 3.5 };
  }
  pickDivision(k: number) { const d = this.divisions[k]; if (d) this.pickGroup(d.units); }
  feedDivision(k: number) {
    const d = this.divisions[k]; if (!d) return;
    const on = !d.feed;
    for (const o of this.divisions) if (o) o.feed = false;
    d.feed = on;
    this.bark = { who: 'Command', line: on ? `New troops will join the ${this.divName(k)}.` : 'New troops stay at their factories.', t: 3 };
  }
  // Companies form themselves: a new unit joins the newest company from its kind of factory (infantry, armour, air,
  // super-heavy) until it holds eight; units from one factory come out together, so a company starts in one place.
  joinCompany(d: Division, u: Unit) {
    const line = DEF[u.type]?.from, c = [...d.companies].reverse().find((c) => DEF[c[0].type]?.from === line && c.length < CO_SIZE);
    if (c) c.push(u); else d.companies.push([u]);
  }
  // keep companies true to the division: drop who left, place anyone not in one (a new card, an old save), and fold a
  // company worn below three into a sister company with room
  tidyCompanies(d: Division) {
    const inDiv = new Set(d.units);
    d.companies = (d.companies ?? []).map((c) => c.filter((u) => inDiv.has(u))).filter((c) => c.length);
    const placed = new Set(d.companies.flat());
    for (const u of d.units) if (!placed.has(u)) this.joinCompany(d, u);
    for (const c of [...d.companies]) {
      if (c.length >= 3) continue;
      const to = d.companies.find((o) => o !== c && DEF[o[0].type]?.from === DEF[c[0].type]?.from && o.length + c.length <= CO_SIZE);
      if (to) { to.push(...c); d.companies = d.companies.filter((o) => o !== c); }
    }
  }
  // pick a group (a division or a company); picking it again goes there
  pickGroup(us: Unit[]) {
    if (!us.length) return;
    const again = us.every((u) => u.selected);
    this.select(us, false); this.selBld = null;
    if (again) this.centre(us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.y, 0) / us.length);
  }
  // An attacking division's next move: the nearest enemy building it knows of, else the nearest enemy it can see, else
  // the enemy's home ground (to find them), marched to in formation, fighting whatever is in the way
  pushOn(d: Division) {
    const us = d.units.filter((u) => this.alive(u)); if (!us.length) { d.attack = false; return; }
    const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cy = us.reduce((s, u) => s + u.y, 0) / us.length;
    let best: [number, number] | null = null, bd = 1e12, aim: Bld | null = null;
    for (const b of this.blds) if (this.hostile(0, b.team) && b.team !== MARAUDER && b.seen && b.dying < 0 && b.max > 0) { const x = (b.cx + b.w / 2) * CELL, y = (b.cy + b.h / 2) * CELL, dd = Math.hypot(x - cx, y - cy); if (dd < bd) { bd = dd; best = [x, y]; aim = b; } }
    if (!best) for (const o of this.units) if (this.hostile(0, o.team) && o.team !== MARAUDER && this.spot(o)) { const dd = Math.hypot(o.x - cx, o.y - cy); if (dd < bd) { bd = dd; best = [o.x, o.y]; } }
    if (!best) { const foe = this.sides.find((s) => this.hostile(0, s) && !this.out.has(s)); if (foe === undefined) { d.attack = false; return; } const [bx, by] = this.terrain.bases[this.baseOf(foe)]; best = [bx * CELL, by * CELL]; }
    this.orderUnits(us, best[0], best[1], true, true);
    if (aim) for (const u of us) u.strike = aim; // the building it's going for: hit it the moment it's in reach, then press on
  }
  updateDivisions() {
    for (const d of this.divisions) if (d?.attack && d.units.length && d.units.filter((u) => !u.goal && !u.path.length && !u.target).length >= d.units.length * 0.7) this.pushOn(d); // arrived and nothing left to shoot: on to the next
    const mid = (d: Division) => [d.units.reduce((s, u) => s + u.x, 0) / d.units.length, d.units.reduce((s, u) => s + u.y, 0) / d.units.length];
    for (const d of this.divisions) { // a division worn below six (not one you formed, nor the one taking new troops) joins the nearest other one
      if (!d || d.own || d.feed || !d.units.length || d.units.length >= 6) continue;
      const [x, y] = mid(d), to = this.divisions.filter((o) => o && o !== d && o.units.length).sort((a, b) => { const [ax, ay] = mid(a!), [bx, by] = mid(b!); return Math.hypot(ax - x, ay - y) - Math.hypot(bx - x, by - y); })[0];
      if (to) { to.units.push(...d.units); d.units = []; d.fresh = []; d.companies = []; }
    }
    for (const d of this.divisions) if (d) this.tidyCompanies(d);
    for (const d of this.divisions) { // a division in two places becomes two divisions (if a card is free): its veterans in two groups
      // far apart (each 8 or more), or grown past twice the size. The far group goes; troops still marching to it don't count.
      const k = this.divisions.findIndex((v) => !v || !v.units.length);
      if (!d || d.own || k < 0) continue;
      const fresh = new Set(d.fresh), groups = this.clusters(d.units.filter((u) => !fresh.has(u)), 30 * CELL);
      let moved: Unit[] = [];
      if (groups.length > 1 && groups[1].length >= 8) moved = groups.slice(1).flat();
      else if (d.units.length > DIV_SIZE * 2) { while (d.companies.length > 1 && moved.length < d.units.length / 2) moved.push(...d.companies.pop()!); }
      if (!moved.length) continue;
      const out = new Set(moved); d.units = d.units.filter((u) => !out.has(u)); d.fresh = d.fresh.filter((u) => !out.has(u));
      this.divisions[k] = { units: moved, fresh: [], since: 0, feed: false, companies: [] }; this.tidyCompanies(this.divisions[k]!);
    }
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
    const mine = this.blds.filter((b) => b.team === 0 && b.dying < 0 && b.type !== 'wall' && b.rise >= 1), linked = mine.filter((b) => this.territory.linked.has(b)), hubs = mine.filter((b) => b.type === 'fieldCommand').length;
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
    this.quake(Math.min(1, r / 100), sx, sy);
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
    if (Math.random() < 0.15) { const [i] = [...this.burning.keys()].slice(-1); audio.fx('fire', (i % N + 0.5) * CELL, (((i / N) | 0) + 0.5) * CELL, 0.35); }
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
    d.burst = true; audio.fx('dam', (b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, 1);
    this.floods.push({ cells: d.zone, at: 0, ux: d.ux, uy: d.uy, t: 0 });
    for (const i of d.zone) this.floodMask[i] = 0;
    this.warn('A dam has burst! The valley is flooding.', this.posOf(b));
    this.drains.push({ k: d.lake, at: this.time + 15 }); // and the lake behind it runs dry
    this.quake(1.2, ...this.scr({ x: (b.cx + b.w / 2) * CELL, y: (b.cy + b.h / 2) * CELL }));
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
      if (who === 0) { this.bark = { who: 'Marauder camp', line: `Cleared! Bounty: +$${CAMP_BOUNTY}.`, t: 3 }; }
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
    if (u.buildSite !== b) u.siteTries = 0;
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
  // The next job for a free builder, weighing how far it is against its place in line (a site next door beats the
  // oldest one across the map; each place further back counts as six squares). It won't set out on a long trip to a site
  // a builder already busy nearby will reach sooner once it's done; it lends a hand (three to a site) only close by;
  // and it skips sites it couldn't get to lately. near: how far it will go at all (a resting builder only next door).
  // a builder's home: the Field Command it works for, or (if that's gone, or it never had one) the nearest of its side's
  homeOf(u: Unit): Bld | null {
    const b = u.base;
    if (b && this.alive(b) && b.team === u.team && b.rise >= 1 && b.dying < 0) return b;
    let best: Bld | null = null, bd = Infinity;
    for (const o of this.blds) if (o.team === u.team && o.type === 'fieldCommand' && o.rise >= 1 && o.dying < 0) { const d = Math.hypot(o.cx - u.x / CELL, o.cy - u.y / CELL); if (d < bd) { bd = d; best = o; } }
    return (u.base = best);
  }
  nearHome(b: Bld, h: Bld | null) { return !!h && Math.hypot(b.cx + b.w / 2 - (h.cx + h.w / 2), b.cy + b.h / 2 - (h.cy + h.h / 2)) <= HOME_R; }
  nextJob(u: Unit, q: Bld[][], ai: boolean, near = Infinity) {
    // loyal to its base: it takes jobs round its own Field Command; one out past every base goes to the builders whose base is
    // nearest it (so a far site still gets built), and a site round another base is that base's builders' work
    const home = this.homeOf(u), homes = [...new Set(this.builders(u.team).map((o) => this.homeOf(o)).filter((h): h is Bld => !!h))];
    const mine = (b: Bld) => { if (!home || this.nearHome(b, home)) return true; if (homes.some((h) => this.nearHome(b, h))) return false; const nh = homes.reduce((p, c) => (Math.hypot(c.cx - b.cx, c.cy - b.cy) < Math.hypot(p.cx - b.cx, p.cy - b.cy) ? c : p)); return nh === home; };
    const on = new Map<Bld, number>(); for (const o of this.units) if (o.buildSite) on.set(o.buildSite, (on.get(o.buildSite) ?? 0) + 1);
    const busy = this.builders(u.team).filter((o) => o !== u && o.buildSite && !o.hold), claimed = new Set<Unit>();
    const doneIn = (o: Unit) => { const b = o.buildSite!; return b.rise < 1 ? ((1 - b.rise) * (DEF[b.type]?.time ?? 10)) / Math.max(1, on.get(b) ?? 1) : 4; }; // seconds till it's free
    let best: Bld | null = null, bs = Infinity, rank = 0;
    for (const j of q) {
      const crew = j.reduce((n, b) => n + (on.get(b) ?? 0), 0), open = j.filter((b) => !((u.cant.get(b) ?? 0) > this.time) && mine(b));
      const place = crew ? -1 : rank++;
      if (!open.length) continue;
      const free = open.filter((b) => !on.get(b)), b = (free.length ? free : open).reduce((p, c) => (this.reach(u.x, u.y, c) < this.reach(u.x, u.y, p) ? c : p));
      const d = this.reach(u.x, u.y, b) / CELL;
      if (d > near) continue;
      let score: number;
      if (!crew) {
        const sooner = d > 12 && busy.find((o) => !claimed.has(o) && doneIn(o) + this.reach(o.x, o.y, b) / o.def.speed < ((d * CELL) / u.def.speed) * 0.7);
        if (sooner) { claimed.add(sooner); continue; } // leave it to the one nearby
        score = d + 6 * place;
      } else if (crew < 3 && d < 15) score = d + 12;
      else continue;
      if (ai && j[0].type === 'wall') score += 200; // the computer lays its sandbags last
      if (score < bs) { bs = score; best = b; }
    }
    return best;
  }
  // Builders never stand about when there's work they're best placed for (see nextJob); with nothing for them they
  // patch up damage within 10 cells. One you've sent somewhere rests there 15 seconds first, but still takes a site right beside it.
  builderHelp() {
    for (const team of this.sides) {
      const q = this.queueOf(team);
      const ai = this.ais.some((a) => a.me === team);
      if (ai) q.sort((a, b) => (a[0].type === 'wall' ? 1 : 0) - (b[0].type === 'wall' ? 1 : 0)); // the computer lays its sandbags last: buildings (a new Field Command above all) come first (since walls became sites, its builders spent the game on sandbags and it stopped spreading)
      for (const u of this.builders(team)) {
        if (u.buildSite || u.goal || u.path.length) continue;
        if (u.hold) { u.hold = false; u.rest = this.time + 15; }
        const resting = this.time < u.rest, next = this.nextJob(u, q, ai, resting ? 5 : Infinity);
        if (next) { this.assignSite(u, next); continue; }
        if (resting) continue;
        let best: Bld | null = null, bd = 1e9;
        for (const b of this.blds) {
          if (b.team !== team || b.max <= 0 || b.dying >= 0 || b.rise < 1 || b.type === 'wall' || b.hp >= b.max * 0.9) continue;
          const d = this.reach(u.x, u.y, b);
          if (d < 10 * CELL && d < bd) { bd = d; best = b; }
        }
        if (best) { this.assignSite(u, best); continue; }
        const h = this.homeOf(u); // nothing to do: back to its base, ready for the next job
        if (h && Math.hypot(u.x / CELL - (h.cx + h.w / 2), u.y / CELL - (h.cy + h.h / 2)) > HOME_R / 2) { const a = Math.atan2(u.y / CELL - (h.cy + 1.5), u.x / CELL - (h.cx + 1.5)), gx = (h.cx + 1.5 + Math.cos(a) * 4) * CELL, gy = (h.cy + 1.5 + Math.sin(a) * 4) * CELL; u.goal = [gx, gy]; u.path = this.route(u, gx, gy); }
      }
    }
    this.numberQueue();
  }
  // Which waiting jobs come next, numbered for the player's sites in the order the builders will really take them:
  // played forward, whichever builder is free first picks as nextJob does (distance weighed against place in line),
  // then is busy for the trip and the build, and so on. (Numbered in placing order, the flags said 3rd while a
  // builder next door started it first.)
  numberQueue() {
    this.waitNo.clear();
    const on = new Map<Bld, number>(); for (const o of this.units) if (o.buildSite) on.set(o.buildSite, (on.get(o.buildSite) ?? 0) + 1);
    const jobs = this.queueOf(0).filter((j) => !j.some((b) => on.has(b)));
    if (!jobs.length) return;
    const mid = (b: Bld): [number, number] => [(b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL];
    const work = (j: Bld[]) => j.reduce((s, b) => s + (1 - b.rise) * (DEF[b.type]?.time ?? 10), 0);
    const crew = this.builders(0).map((u) => { // where each will be, and when it's free
      const b = u.buildSite;
      if (!b) return { u, x: u.x, y: u.y, t: Math.max(0, u.rest - this.time), sp: u.def.speed };
      const [x, y] = mid(b);
      return { u, x, y, t: this.reach(u.x, u.y, b) / u.def.speed + (b.rise < 1 ? ((1 - b.rise) * (DEF[b.type]?.time ?? 10)) / (on.get(b) ?? 1) : 4), sp: u.def.speed };
    });
    let n = 0;
    while (jobs.length) {
      if (!crew.length) { for (const j of jobs) this.waitNo.set(j[0], ++n); return; } // no builders: placing order
      const c = crew.reduce((p, q) => (q.t < p.t ? q : p));
      let bi = -1, bs = Infinity;
      const home = this.homeOf(c.u), homes = [...new Set(crew.map((o) => this.homeOf(o.u)).filter((h): h is Bld => !!h))];
      const mine = (b: Bld) => !home || this.nearHome(b, home) || (!homes.some((h) => this.nearHome(b, h)) && homes.reduce((p, q) => (Math.hypot(q.cx - b.cx, q.cy - b.cy) < Math.hypot(p.cx - b.cx, p.cy - b.cy) ? q : p)) === home); // (as nextJob: its base's jobs)
      jobs.forEach((j, i) => { if (!mine(j[0])) return; const [x, y] = mid(j[0]), sc = Math.hypot(x - c.x, y - c.y) / CELL + 6 * i; if (sc < bs) { bs = sc; bi = i; } });
      if (bi < 0) { crew.splice(crew.indexOf(c), 1); continue; } // nothing of its base's left: it drops out
      const j = jobs.splice(bi, 1)[0], [x, y] = mid(j[0]);
      this.waitNo.set(j[0], ++n);
      c.t += Math.hypot(x - c.x, y - c.y) / c.sp + work(j); c.x = x; c.y = y;
    }
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
      const rate = (Math.min(crew, 3) / d.time) * this.powerEff(team) * (team === 0 ? this.R.build ?? 1 : 1);
      const pay = Math.min(d.cost * rate * dt, this.prods[team].credits, d.cost * (1 - b.rise));
      if (pay > 0 && !b.cleared) { b.cleared = true; this.fell(b); }
      this.prods[team].credits -= pay;
      b.rise = Math.min(1, b.rise + pay / d.cost);
      if (pay > 0 && team === 0 && Math.random() < dt * 0.2) audio.fx('hammer', (b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, 0.15);
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
        if (b.type === 'scrapyard') { const [ex, ey, ox, oy] = this.door(b, true), u = this.addUnit('harvester', team, ex, ey); u.heading = u.tHead = Math.atan2(oy, ox); } // every scrapyard comes with a salvager
        if (team === 0 && b.type !== 'wall') { this.bark = { who: 'Builder', line: `${d.name} complete.`, t: 3 }; audio.fx('built', (b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL, 0.4); } // (not for every block of a wall)
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
    if (u.team === 0) { audio.fx('capture', u.x, u.y); this.bark = { who: c.name, line: was === 0 ? 'Another one inside. Cosy.' : 'Captured. The previous owners left in a hurry.', t: 3 }; audio.click(); }
    else if (was === 0) this.warn(`The enemy has taken our ${c.name}!`, this.posOf(b));
    if (was !== u.team) { b.timer = 0; this.siteBonus(b, true); }
  }

  // Captured sites pay out: vehicles from the motor pool, infantry from the recruiting office.
  siteBonus(b: Bld, first: boolean) {
    const [ox, oy] = this.door(b, false);
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
    land.compute(t, this.sides.filter((s) => !this.out.has(s)), this.blds.filter((b) => b.rise >= 1), (team) => t.bases[this.baseOf(team)], (b) => (b.type === 'fieldCommand' ? 14 : CAPTURE[b.type] && !CAPTURE[b.type].garrison ? SITE_REACH : 0)); // only finished buildings hold land (a site claimed it, and paid out, before a brick was laid). Field Commands are the big hearts; a held site is a small one, so taking prizes far out grows the empire
    { let h = 0; for (const [team, seg] of land.lines) { h = (h * 31 + team) | 0; for (let k = 0; k < seg.length; k++) h = (h * 31 + Math.round(seg[k] * 8)) | 0; } if (h !== this.borderHash) { this.borderHash = h; this.borderVer++; } } // (the cached border tiles are redrawn only if the borders really moved)
    if (this.state === 'play') this.checkOccupation();
    if (before) { // ground you've just gained glows for a moment, with what it earns
      const won: number[] = []; for (let i = 0; i < before.length; i++) if (land.owner[i] === 0 && before[i] !== 0) won.push(i);
      if (won.length >= 12) {
        let sx = 0, sy = 0; for (const i of won) { sx += i % N; sy += (i / N) | 0; }
        this.gained.push({ cells: won, t: 0, x: (sx / won.length + 0.5) * CELL, y: (sy / won.length + 0.5) * CELL, pay: won.length * this.landRate() });
      }
    }
    // town centre: within TOWN squares of a finished Field Command of its side
    // fortified line: a defence with two more of its side's defences within FORT squares
    this.town.clear(); this.fort.clear();
    const hubs = this.blds.filter((b) => b.type === 'fieldCommand' && b.rise >= 1 && b.dying < 0), guns = this.blds.filter((b) => DEFENCE[b.type] && b.rise >= 1 && b.dying < 0 && b.team !== 2);
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
    const ctx = this.ctx, s = 4, word = 'GROUND RULES', w = textWidth(word, s), x = Math.round((this.FW - w) / 2);
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
    if (this.titlePage === 'newGame') { this.menuRects = []; const end = this.drawModeCards(y + 58); this.drawMenu(Math.round((this.FW - 140) / 2), end + 6, 140, true); }
    else this.drawMenu(Math.round((this.FW - 140) / 2), y + 66, 140);
    if (this.loadNote) text(ctx, this.loadNote, Math.round((this.FW - textWidth(this.loadNote)) / 2), y + 56, C.bad, 1, C.ink);
    const foot = 'DRAG TO SELECT   RIGHT-CLICK TO MOVE   SWIPE TO SCROLL';
    text(ctx, foot, Math.round((this.FW - textWidth(foot)) / 2), this.FH - 16, C.muted, 1, C.ink);
  }

  // A riveted panel of menu items; remembers where each item is for clicks.
  drawMenu(px: number, py: number, pw: number, keep = false): number { // (returns where it ends, the note under it included; keep: add to the clickable spots already there, the mode cards)
    const ctx = this.ctx, items = this.menuItems, ph = 16 + items.length * 16;
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    if (!keep) this.menuRects = [];
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
    const note = items[this.menuHot]?.note; // what the pointed-at choice means, under the menu
    if (note) {
      const w = Math.max(pw, 220), lines: string[] = []; let line = '';
      for (const word of note.split(' ')) { const t = line ? line + ' ' + word : word; if (textWidth(t) > w - 16) { lines.push(line); line = word; } else line = t; }
      if (line) lines.push(line);
      const nx = Math.round(px + pw / 2 - w / 2), ny = py + ph + 6, nh = 8 + lines.length * 10;
      panel(ctx, nx, ny, w, nh);
      lines.forEach((l, i) => text(ctx, l, Math.round(nx + (w - textWidth(l)) / 2), ny + 5 + i * 10, l.includes('SUGGESTED') ? C.gold : C.cream, 1, C.ink));
      return ny + nh;
    }
    return py + ph;
  }
  // The New Game page's modes, all in view at once: a card each, like a little poster: its own sky and scene, the
  // picture, its name and its promise. The one picked stands up, lit in its colour; the rest sit back, a little dimmer,
  // until pointed at. Pointing at one shows what it means underneath.
  drawModeCards(y: number): number {
    const ctx = this.ctx, keys = Object.keys(MODES), cw = 104, ch = 82, gap = 6, cols = this.FW >= keys.length * (cw + gap) + 10 ? keys.length : Math.ceil(keys.length / 2);
    const rows = Math.ceil(keys.length / cols), x0 = Math.round((this.FW - (cols * (cw + gap) - gap)) / 2), M = this.mouse, t = this.time;
    let hot = this.rules;
    keys.forEach((k, i) => {
      const m = MODES[k], L = MODE_LOOK[k], on = k === this.rules, x = x0 + (i % cols) * (cw + gap), y0 = y + 2 + Math.floor(i / cols) * (ch + gap);
      const over = M.hx > x && M.hx < x + cw && M.hy > y0 - 2 && M.hy < y0 + ch, cy = y0 - (on ? 2 : 0); // (the picked card stands up a little)
      if (over) hot = k;
      this.menuRects.push({ id: 'mode:' + k, x, y: y0 - 2, w: cw, h: ch + 2 });
      if (on) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 2, cy + ch, cw - 2, 3); } // its shadow on the page
      panel(ctx, x, cy, cw, ch);
      // the scene: a banded sky, its own motif, and ground for the picture to stand on
      const sx = x + 4, sy = cy + 4, sw = cw - 8, sh = 48, gy = sy + sh - 9;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
      const band = Math.ceil((gy - sy) / L.sky.length);
      L.sky.forEach((c, j) => { ctx.fillStyle = c; ctx.fillRect(sx, sy + j * band, sw, band); if (j) { ctx.fillStyle = L.sky[j - 1]; for (let px = sx + (j & 1); px < sx + sw; px += 2) ctx.fillRect(px, sy + j * band, 1, 1); } }); // (a dithered row where bands meet)
      this.modeScene(k, sx, sy, sw, gy, t);
      ctx.fillStyle = L.ground[0]; ctx.fillRect(sx, gy, sw, sh - (gy - sy)); ctx.fillStyle = L.ground[1]; ctx.fillRect(sx, gy, sw, 1);
      const d = DEF[m.icon], mx = x + cw / 2, my = gy - 8, z = d && d.kind === 'unit' && m.icon !== 'colossus' ? 2 : 1, bob = on ? Math.round(Math.sin(t * 3) * 0.6) : 0; // (small units drawn twice the size; the picked one breathes)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(mx, gy + 3, k === 'mayhem' ? 30 : 22, 4, 0, 0, Math.PI * 2); ctx.fill(); // a shadow on the ground
      if (d) {
        ctx.translate(mx, my + bob); ctx.scale(z, z); ctx.translate(-mx, -my - bob);
        if (k === 'mayhem') for (const o of [-9, 9, 0]) this.drawIcon(d, x + 2 + o, my + bob - 14 + (o ? -2 : 2), cw - 4, 28); else this.drawIcon(d, x + 2, my + bob - 14, cw - 4, 28); // (Mayhem: three of them)
      }
      ctx.restore();
      ctx.fillStyle = C.metalD; ctx.fillRect(sx - 1, sy - 1, sw + 2, 1); ctx.fillRect(sx - 1, sy - 1, 1, sh + 2); ctx.fillStyle = C.metalL; ctx.fillRect(sx - 1, sy + sh, sw + 2, 1); // (the picture sits in the panel)
      const best = m.survive ? this.setting('best-' + k, '0') : '0', tag = Number(best) ? `BEST ${Math.floor(+best / 60)}:${String(+best % 60).padStart(2, '0')}` : m.tag; // (NIGHTMARE shows your best time once you have one)
      text(ctx, m.name, Math.round(x + (cw - textWidth(m.name)) / 2), cy + 57, on || over ? C.gold : C.cream, 1, C.ink);
      text(ctx, tag, Math.round(x + (cw - textWidth(tag)) / 2), cy + 68, on || over ? L.accent : C.muted, 1, C.ink);
      if (on) { // lit in its colour, with gold corners
        ctx.fillStyle = L.accent; ctx.fillRect(x, cy, cw, 2); ctx.fillRect(x, cy + ch - 2, cw, 2); ctx.fillRect(x, cy, 2, ch); ctx.fillRect(x + cw - 2, cy, 2, ch);
        ctx.fillStyle = C.gold; for (const [qx, qy] of [[x, cy], [x + cw - 4, cy], [x, cy + ch - 4], [x + cw - 4, cy + ch - 4]]) ctx.fillRect(qx, qy, 4, 4);
      } else if (!over) { ctx.fillStyle = 'rgba(8,8,10,0.38)'; ctx.fillRect(x, cy, cw, ch); } // (the others sit back until pointed at)
      else { ctx.fillStyle = L.accent; ctx.fillRect(x + 4, cy + ch - 3, cw - 8, 1); }
    });
    // what the pointed-at (or picked) mode means, in a panel trimmed in its colour
    const note = MODES[hot].note, w = Math.min(this.FW - 16, cols * (cw + gap) - gap, 440), lines: string[] = []; let line = '';
    for (const word of note.split(' ')) { const tt = line ? line + ' ' + word : word; if (textWidth(tt) > w - 16) { lines.push(line); line = word; } else line = tt; }
    if (line) lines.push(line);
    const ny = y + rows * (ch + gap) + 3, nh = 8 + lines.length * 10, nx = Math.round((this.FW - w) / 2);
    panel(ctx, nx, ny, w, nh); ctx.fillStyle = MODE_LOOK[hot].accent; ctx.fillRect(nx + 1, ny + 1, 2, nh - 2);
    lines.forEach((l, i) => text(ctx, l, Math.round(nx + (w - textWidth(l)) / 2), ny + 5 + i * 10, C.cream, 1, C.ink));
    return ny + nh;
  }
  // Each mode card's motif, painted in its sky above the ground line gy.
  modeScene(k: string, x: number, y: number, w: number, gy: number, t: number) {
    const ctx = this.ctx, cx = x + w / 2, f = (c: string, rx: number, ry: number, rw: number, rh: number) => { ctx.fillStyle = c; ctx.fillRect(Math.round(rx), Math.round(ry), rw, rh); };
    const disc = (c: string, dx: number, dy: number, r: number) => { ctx.fillStyle = c; for (let j = -r; j <= r; j++) { const hw = Math.round(Math.sqrt(r * r - j * j)); ctx.fillRect(Math.round(dx - hw), Math.round(dy + j), hw * 2, 1); } };
    if (k === 'standard') { // a big low sun and its rays, like the title
      ctx.fillStyle = 'rgba(240,192,48,0.16)';
      for (let a = 0; a < 12; a++) { const r0 = a / 12 * Math.PI - Math.PI, r1 = r0 + Math.PI / 24; ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx + Math.cos(r0) * 80, gy + Math.sin(r0) * 80); ctx.lineTo(cx + Math.cos(r1) * 80, gy + Math.sin(r1) * 80); ctx.fill(); }
      disc('#f0b040', cx, gy, 14); disc('#f8d070', cx, gy, 10);
    } else if (k === 'sandbox') { // a sunny day: sun and drifting clouds
      disc('#fff0a0', x + w - 16, y + 10, 6); f('#fff8d0', x + w - 18, y + 8, 3, 2);
      for (const [o, cy2, cwid] of [[0, 9, 18], [44, 17, 14], [78, 6, 12]]) { const qx = x + ((o + t * 4) % (w + 30)) - 20; f('#f4f4f0', qx, y + cy2, cwid, 3); f('#f4f4f0', qx + 3, y + cy2 - 2, cwid - 8, 2); f('#c8d8e8', qx, y + cy2 + 3, cwid, 1); }
    } else if (k === 'blitz') { // speed: streaks racing across a hot sky
      for (let j = 0; j < 7; j++) { const ly = y + 4 + ((j * 37) % (gy - y - 8)), len = 10 + ((j * 13) % 14), lx = x + w - ((t * 90 + j * 41) % (w + len)); f(j & 1 ? '#fff4c0' : '#ffd060', lx, ly, len, 1); }
    } else if (k === 'mayhem') { // the horizon on fire
      for (const [o, r, ph] of [[16, 7, 0], [52, 9, 1.7], [86, 6, 3.1]]) { const p = 1 + Math.sin(t * 2.2 + ph) * 0.15; disc('#c83818', x + o, gy - 1, Math.round(r * p)); disc('#f07828', x + o, gy - 1, Math.round(r * p * 0.65)); disc('#ffd060', x + o, gy - 1, Math.round(r * p * 0.3)); }
    } else if (k === 'front') { // a long line: smoke columns and fence posts across the valley
      for (const [o, hgt] of [[14, 22], [70, 28], [88, 16]]) for (let j = 0; j < hgt; j += 3) { const sway = Math.sin(j * 0.25 + t * 1.5) * (j / 8); f(`rgba(60,56,48,${0.55 - j / hgt * 0.45})`, x + o + sway - 2 - j / 8, gy - j - 3, 4 + j / 4, 3); }
      for (let px = x + 3; px < x + w; px += 9) { f('#4a4030', px, gy - 4, 1, 4); } f('#4a4030', x, gy - 3, w, 1);
    } else if (k === 'nightmare') { // night: a pale moon, stars, and a red glow where the enemy is
      for (let j = 0; j < 14; j++) { const s = (j * 2654435761) >>> 0, tw = Math.sin(t * 2 + j) > 0.6; f(tw ? '#ffffff' : '#9a98c0', x + (s % w), y + ((s >> 8) % (gy - y - 14)), 1, 1); }
      disc('#e8e4d0', x + 16, y + 11, 6); disc(MODE_LOOK.nightmare.sky[0], x + 19, y + 9, 5); // (a crescent)
      ctx.fillStyle = 'rgba(200,40,30,0.35)'; ctx.fillRect(x, gy - 6, w, 6); ctx.fillStyle = 'rgba(200,40,30,0.2)'; ctx.fillRect(x, gy - 12, w, 6);
    }
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
    const menuEnd = this.drawMenu(Math.round((this.FW - 120) / 2), y + 28, 120);
    // the controls, on a card under the menu: the mouse is all you need; a few keys are quicker, if you like
    const groups: [string, [string, string][]][] = [
      ['THE MOUSE IS ALL YOU NEED', [['CLICK / DRAG', 'SELECT UNITS OR A BUILDING'], ['DOUBLE-CLICK', 'EVERY ONE OF THAT TYPE IN VIEW'], ['RIGHT-CLICK', 'MOVE, ATTACK, BUILD, REPAIR'],
        ['DRAG A BUILDING', 'PLACE A ROW OR A BLOCK OF THEM'], ['DIVISION CARD', 'PICK IT (CLICK AGAIN: GO THERE)'], ['COMPANY CHIP', 'PICK JUST THAT COMPANY']]],
      ['SHORTCUTS, IF YOU LIKE', [['1 - 5', 'PICK A DIVISION'], ['A', 'ATTACK-MOVE'], ['S', 'STOP'], ['R', 'RETREAT HOME TO HEAL'], ['G', 'GUARD A SPOT OR BUILDING, OR DRAG A PATROL'],
        ['C', 'SCOUT ON ITS OWN'], ['F', 'THE WHOLE ARMY'], ['SPACE / H', 'LATEST ALERT / HOME'], ['ARROWS', 'SCROLL THE MAP'], ['- / +', 'ZOOM OUT / IN']]],
    ];
    const all = groups.flatMap(([, r]) => r), kw = Math.max(...all.map(([k]) => textWidth(k))) + 14, vw = Math.max(...all.map(([, v]) => textWidth(v)), ...groups.map(([h]) => textWidth(h) - kw));
    const pw = kw + vw + 20, ph = groups.reduce((h, [, r]) => h + 16 + r.length * 10, 0) + 8, px = Math.round((this.FW - pw) / 2), py = menuEnd + 8; // under the menu and its note, however long they are
    panel(ctx, px, py, pw, ph); rivets(ctx, px, py, pw, ph);
    let ry = py + 8;
    for (const [head, rows] of groups) {
      text(ctx, head, px + 10, ry, C.muted); ry += 13;
      for (const [k, v] of rows) { text(ctx, k, px + 10, ry, C.gold); text(ctx, v, px + 10 + kw, ry, C.cream); ry += 10; }
      ry += 3;
    }
  }

  // Victory or defeat: a poster-style panel with the battle's numbers.
  drawEnd() {
    const ctx = this.ctx, won = this.state === 'won';
    ctx.fillStyle = won ? 'rgba(8,10,8,0.5)' : 'rgba(14,6,6,0.6)'; ctx.fillRect(0, 0, this.FW, this.FH);
    const y = Math.round(this.FH * 0.2), title = won ? 'VICTORY' : 'DEFEAT', s = 4, w = textWidth(title, s), x = Math.round((this.FW - w) / 2);
    if (won) this.sunburst(Math.round(this.FW / 2), y + 14, Math.round(Math.min(this.FW, this.FH) * 0.24));
    text(ctx, title, x + 3, y + 3, C.ink, s); text(ctx, title, x, y, won ? C.gold : C.bad, s);
    const quip = this.endWhy || (won ? 'THE MINISTRY THANKS YOU FOR YOUR PATIENCE.' : 'YOUR BASE HAS BEEN REZONED.');
    text(ctx, quip, Math.round((this.FW - textWidth(quip)) / 2), y + 38, C.cream, 1, C.ink);
    const st = this.stats, real = st.time / (this.R.pace ?? 1), m = Math.floor(real / 60), sec = String(Math.floor(real % 60)).padStart(2, '0'); // (real minutes: BLITZ runs three to the minute)
    const rows: [string, string][] = [['BATTLE TIME', `${m}:${sec}`], ['UNITS BUILT', String(st.built[0])], ['UNITS LOST', String(st.lost[0])], ['ENEMY UNITS DESTROYED', String(st.lost[1])], ['BUILDINGS RAZED', String(st.razed[0])], ...this.ais.filter((a) => this.hostile(0, a.me)).map((a) => [`${['', 'RED', '', 'GREEN', 'GOLD'][a.me]} STRATEGY`, a.planName.toUpperCase()] as [string, string]), ...(this.R.survive ? [['YOUR BEST', `${Math.floor(this.bestSurvival() / 60)}:${String(this.bestSurvival() % 60).padStart(2, '0')}`]] as [string, string][] : []), ...(this.rules !== 'standard' ? [['MODE', this.R.name]] as [string, string][] : [])];
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
    if (this.rules === 'standard') text(ctx, 'GROUND RULES', x0 + 16, 4, C.gold, 1, C.ink);
    else { // a mode game says so all game; BLITZ shows its clock and NIGHTMARE how long you've lasted
      const clk = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`, left = this.clockLeft(), [mine, theirs] = this.groundShares();
      const head = left !== null ? `${this.R.name}  ${clk(Math.max(0, left))}` : this.R.survive ? `${this.R.name}  ${clk(this.stats.time)}` : `${this.R.name} MODE`;
      text(ctx, head, x0 + 16, 4, left !== null && left < 60 && Math.floor(this.time * 2) % 2 ? C.gold : C.bad, 1, C.ink);
      this.hudTips.push({ x: x0 + 6, y: 2, w: SB - 30, h: 11, title: `${this.R.name} MODE`, body: left !== null ? `TIME LEFT, THEN MOST GROUND WINS. YOU HOLD ${mine}% OF THE LAND, THE ENEMY ${theirs}%.` : this.R.survive ? `HOW LONG YOU HAVE LASTED. YOUR BEST: ${clk(this.bestSurvival())}.` : this.R.note });
    }
    this.buttons.push({ id: 'pause', x: x0 + SB - 20, y: 2, w: 16, h: 11, label: 'II' });
    // credits and power
    const cr = FRONT ? `WAVE ${this.waveNo + 1} IN ${Math.ceil(this.waveT)}` : this.R.endless ? '$ ENDLESS' : '$ ' + Math.floor(this.prod.credits).toLocaleString('en-US');
    inset(ctx, x0 + 6, 16, SB - 12, 12, C.screen);
    text(ctx, cr, Math.round(x0 + SB / 2 - textWidth(cr) / 2), 19, C.gold);
    const low = this.power.used > this.power.made;
    if (FRONT) this.hudTips.push({ x: x0 + 6, y: 16, w: SB - 12, h: 12, title: 'NEXT WAVE', body: 'EVERY 30 SECONDS BOTH SIDES GET THE SAME SURPRISE WAVE OF TROOPS. YOURS COME IN AT YOUR SITE CLOSEST TO THE ENEMY: TAKE SITES WITH SOLDIERS TO BRING THEM IN FURTHER FORWARD.' });
    else { // (FRONT LINE has no money and no power)
    this.hudTips.push({ x: x0 + 6, y: 16, w: SB - 12, h: 12, title: 'MONEY', body: 'SCRAP, YOUR LAND AND CAPTURED SITES EARN IT. BUILDINGS AND TROOPS SPEND IT AS THEY GO UP.' },
      { x: x0 + 6, y: 30, w: SB - 12, h: 11, title: 'POWER', body: `USING ${Math.round(this.power.used)} OF ${Math.round(this.power.made)}. THE BAR IS THE POWER YOU HAVE TO SPARE (THE NUMBER SAYS HOW MUCH): FULL IS PLENTY, AND IT EMPTIES AS YOU BUILD. NEARLY EMPTY: BUILD A GENERATOR. RED: OUT OF POWER, EVERYTHING SLOWS.` });
    text(ctx, 'POWER', x0 + 6, 32, low ? C.bad : C.goldD);
    { // one bar, read like a battery: the power you have to spare. Full is plenty; it empties as you build; out of power,
      // it flashes red right across. The number after it says how much: +100 to spare, or red -40 short. (It used to
      // fill with what was in use, and a nearly empty bar read as running low.)
      const spare = Math.round(this.power.made - this.power.used), say = spare >= 0 ? `+${spare}` : String(spare), nw = textWidth(say), bw = SB - 46 - nw - 4;
      inset(ctx, x0 + 40, 31, bw, 9, C.ink);
      const left = this.power.made > 0 ? Math.max(0, spare) / this.power.made : 0;
      ctx.fillStyle = low ? (Math.floor(this.time * 3) % 2 ? '#ff8060' : C.bad) : C.ok;
      ctx.fillRect(x0 + 41, 32, Math.round((low ? 1 : left) * (bw - 2)), 7);
      text(ctx, say, x0 + SB - 6 - nw, 32, low ? C.bad : C.cream);
    }
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
    for (const [ox, oy] of this.oilSpots()) { const [a, b] = flat(ox, oy), px = mx + 1 + Math.floor(a * sc), py = my + 1 + Math.floor(b * sc); ctx.fillStyle = C.gold; ctx.fillRect(px - 2, py - 2, 5, 5); ctx.fillStyle = '#111012'; ctx.fillRect(px - 1, py - 1, 3, 3); } // oil not yet built on
    if (this.goalAt && this.hints) { const [a, b] = flat(this.goalAt[0], this.goalAt[1]), px = mx + 1 + Math.floor(a * sc), py = my + 1 + Math.floor(b * sc), r = 2 + ((this.time * 5) % 4); ctx.fillStyle = C.gold; for (let k = 0; k < 12; k++) ctx.fillRect(Math.round(px + Math.cos(k / 12 * 6.283) * r), Math.round(py + Math.sin(k / 12 * 6.283) * r), 1, 1); ctx.fillRect(px - 1, py - 1, 2, 2); } // the checklist's next place, pulsing gold
    for (const p of this.pings) if (p.dmg >= 120) { // attack markers: pulsing red rings
      const [a, b] = flat(p.x, p.y), px = mx + 1 + Math.floor(a * sc), py = my + 1 + Math.floor(b * sc), r = 3 + ((this.time * 8) % 6);
      ctx.fillStyle = Math.floor(this.time * 4) % 2 ? '#ff3020' : '#ffd040';
      for (let k = 0; k < 16; k++) ctx.fillRect(Math.round(px + Math.cos(k / 16 * 6.283) * r), Math.round(py + Math.sin(k / 16 * 6.283) * r), 1, 1);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    const raid = FRONT ? 0 : this.raided.get(0) ?? 0, land = FRONT ? 0 : Math.round(Math.max(0, (this.territory.area.get(0) ?? 0) - raid) * this.landRate()); // (FRONT LINE: land earns nothing)
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
    this.tabs = FRONT ? [] : [{ id: 'structure', x: x0 + 6, y: ty, w: (SB - 14) / 2, h: 11 }, { id: 'unit', x: x0 + 8 + (SB - 14) / 2, y: ty, w: (SB - 14) / 2, h: 11 }]; // (FRONT LINE: nothing to build)
    if (FRONT) { // the call-ins, bought with points from what you destroy, then how it works
      const pts = `POINTS ${Math.floor(this.points[0]).toLocaleString('en-US')}`;
      text(ctx, pts, x0 + 8, ty + 2, C.gold);
      this.hudTips.push({ x: x0 + 6, y: ty, w: SB - 12, h: 11, title: 'POINTS', body: 'YOUR TROOPS EARN A QUARTER OF THE PRICE OF EVERY ENEMY THEY DESTROY, AND YOU EARN A QUARTER OF THE PRICE OF EVERY UNIT YOU LOSE, SO THE SIDE THAT IS BEHIND STILL GETS HELP. CALL-INS EARN NOTHING. SPEND POINTS ON THE CALL-INS BELOW. THE ENEMY EARNS AND SPENDS THEM THE SAME WAY.' });
      Object.entries(CALLS).forEach(([id, c], i) => {
        const y = ty + 14 + i * 16, ok = this.points[0] >= c.cost;
        this.buttons.push({ id, x: x0 + 6, y, w: SB - 12, h: 14, label: this.aiming === id ? 'CLICK THE MAP TO AIM' : `${c.name}  ${c.cost}`, on: ok });
        this.hudTips.push({ x: x0 + 6, y, w: SB - 12, h: 14, title: `${c.name}: ${c.cost} POINTS`, body: c.note });
      });
      ['NO BUILDING HERE: YOUR TROOPS', 'ARRIVE EVERY 30 SECONDS.', '', 'TAKE SITES WITH SOLDIERS TO', 'BRING THEM IN FURTHER FORWARD.', '', 'DESTROY THEIR FIELD COMMAND', 'TO WIN. LOSE YOURS AND IT\'S', 'OVER.'].forEach((l, i) => text(ctx, l, x0 + 8, ty + 66 + i * 10, C.cream));
    }
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
      const label = tb.id === 'structure' ? 'BASE' : factory ? (SHORT[factory] ? (textWidth(SHORT[factory][0]) <= tb.w - 4 ? SHORT[factory][0] : SHORT[factory][1]) : 'ARMY') : 'ARMY'; // a selected factory's own name
      const idle = tb.id === 'unit' && Object.keys(this.prod.queues).some((k) => k !== 'fieldCommand' && k !== 'scrapyard' && !this.prod.queues[k].length && this.owns(k)); // (builders and salvagers are bought now and then, not kept coming) // a factory standing idle
      const fresh = !on && (idle || BUILDS.some((d) => d.kind === tb.id && this.fresh(d))) && Math.floor(this.time * 3) % 2;
      text(ctx, label, Math.round(tb.x + (tb.w - textWidth(label)) / 2), tb.y + 2, on || fresh ? C.gold : C.muted);
    }
    this.slots = []; this.hoverSlot = null;
    const defs = FRONT ? [] : BUILDS.filter((d) => (factory ? d.from === factory : d.kind === tab));
    const live = this.divisions.map((d, k) => (d && d.units.length ? k : -1)).filter((k) => k >= 0), picked = this.selected().filter((u) => u.def.weapon && u.type !== 'builder'), canForm = picked.length > 0 && live.length < 5 && !live.some((k) => this.divisions[k]!.units.length === picked.length && picked.every((u) => this.divisions[k]!.units.includes(u))); // not when the selection already is one
    const sel = this.selected(), open = sel.length ? live.find((k) => sel.every((u) => this.divisions[k]!.units.includes(u))) ?? -1 : -1; // the division your selection is part of shows its companies
    const chipRows = (k: number) => (k === open ? Math.min(2, Math.ceil((this.divisions[k]!.companies ?? []).length / 4)) : 0), divH = live.reduce((h, k) => h + 16 + chipRows(k) * 13, 0) + (canForm ? 16 : 0) + (live.length || canForm ? 4 : 0);
    const keepH = tab === 'unit' && !FRONT ? 15 : 0, gy0 = ty + 14 + keepH, room = H - 46 - divH - gy0;
    // the roomiest layout that shows every card: three wide (names in full), then shorter, then four narrow, then shorter still
    const fits = ([c, h]: number[]) => Math.floor(room / (h + 2)) * c >= defs.length, [cols, ch] = ([[3, 34], [3, 30], [4, 34], [4, 30], [4, 26], [4, 22], [5, 22], [5, 18]].filter(([c]) => c === 3 || SB >= 180).find(fits) ?? [5, 18]), rows = Math.max(1, Math.floor(room / (ch + 2)));
    const cw = Math.floor((SB - 12 - (cols - 1) * 2) / cols);
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
    this.hudTips.push( // what each one does, on hover
      { x: x0 + 6, y: by - 18, w: bw, h: 16, title: 'ARMY (F)', body: 'SELECTS EVERY FIGHTING UNIT YOU HAVE. THEN RIGHT-CLICK WHERE TO SEND THEM: THEY FIGHT ANYTHING ON THE WAY.' },
      { x: x0 + 8 + bw, y: by - 18, w: bw, h: 16, title: 'IDLE (SHIFT+F)', body: 'SELECTS ONLY THE FIGHTING UNITS STANDING ABOUT WITH NOTHING TO DO (NEW TROOPS, ONES WHOSE FIGHT IS OVER), SO YOU CAN SEND THEM WITHOUT PULLING THE REST OUT OF THEIR FIGHTS.' },
      { x: x0 + 10 + bw * 2, y: by - 18, w: bw, h: 16, title: 'IDLE BUILDERS (.)', body: 'JUMPS TO A BUILDER WITH NOTHING TO DO. THE NUMBER IS HOW MANY ARE IDLE. CLICK AGAIN FOR THE NEXT ONE.' });
    const acts = this.actions(), ab = Math.floor((SB - 12 - (acts.length - 1) * 2) / acts.length); // as many across as there are orders
    acts.forEach((a, i) => { const bw = ab; this.buttons.push({ ...a, x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16 }); if (a.id === 'guard') this.hudTips.push({ x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16, title: 'GUARD (G)', body: 'THEN CLICK A SPOT OR ONE OF YOUR BUILDINGS: THE UNITS HOLD THE MIDDLE AND GO STRAIGHT TO ANY ENEMY INSIDE THE RING, THEN COME BACK. DRAG A LINE INSTEAD TO PATROL IT. ANY NEW ORDER ENDS IT.' }); if (a.id === 'scout') this.hudTips.push({ x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16, title: 'SCOUT (C)', body: 'THE SCOUT GOES EXPLORING ON ITS OWN: GROUND YOU HAVEN\'T SEEN, TOWARD THE ENEMY. IT KEEPS OUT OF FIGHTS AND COMES HOME WHEN BADLY HURT. ANY NEW ORDER STOPS IT.' }); if (a.id === 'fallBack') this.hudTips.push({ x: x0 + 6 + i * (bw + 2), y: by, w: bw, h: 16, title: 'RETREAT (R)', body: 'THE SELECTED UNITS STOP FIGHTING AND RUN FOR THE NEAREST FIELD COMMAND OR REPAIR YARD, FASTER AND HARDER TO HIT, TO HEAL ON HOME GROUND. SURVIVORS KEEP THEIR RANKS.' }); });
    // divisions: a card each (click picks it, the + sends new troops to it), and FORM DIVISION while units are selected
    let dy = by - 22 - divH + 4;
    const bars: [number, number, number][] = [];
    for (const k of live) {
      const d = this.divisions[k]!, all = d.units.every((u) => u.selected), hp = d.units.reduce((s, u) => s + u.hp, 0) / d.units.reduce((s, u) => s + u.def.hp, 0);
      this.buttons.push({ id: 'div' + k, x: x0 + 6, y: dy, w: SB - 56, h: 14, label: '', on: all }); // its name (which says its key: 1ST is 1) and size are written over it below
      this.buttons.push({ id: 'atk' + k, x: x0 + SB - 48, y: dy, w: 22, h: 14, label: 'ATK', on: !!d.attack });
      this.hudTips.push({ x: x0 + SB - 48, y: dy, w: 22, h: 14, title: d.attack ? 'ATTACKING' : 'ATTACK', body: 'THE DIVISION MARCHES ON THE NEAREST ENEMY IT KNOWS OF AND KEEPS PUSHING ON ITS OWN, FIGHTING ALONG THE WAY. NEW TROOPS JOIN IT AT THE FRONT. CLICK AGAIN, OR GIVE IT ANY ORDER, TO STOP.' });
      this.buttons.push({ id: 'feed' + k, x: x0 + SB - 24, y: dy, w: 18, h: 14, label: '+', on: d.feed });
      bars.push([dy, hp, k]); dy += 16;
      const cos = k === open ? d.companies ?? [] : [], cwid = Math.floor((SB - 12 - 6) / 4), more = cos.length > 8 ? cos.length - 7 : 0;
      cos.slice(0, more ? 7 : 8).forEach((c, i) => { const x = x0 + 6 + (i % 4) * (cwid + 2), y = dy + Math.floor(i / 4) * 13; this.buttons.push({ id: `co${k}_${i}`, x, y, w: cwid, h: 11, label: `${CO_KIND[DEF[c[0].type]?.from ?? ''] ?? 'MIX'} ${c.length}`, on: c.every((u) => u.selected) }); });
      if (more) this.buttons.push({ id: 'div' + k, x: x0 + 6 + 3 * (cwid + 2), y: dy + 13, w: cwid, h: 11, label: `+${more}` }); // the rest: picks the whole division
      if (cos.length) this.hudTips.push({ x: x0 + 6, y: dy, w: SB - 12, h: chipRows(k) * 13, title: 'COMPANIES', body: 'EACH DIVISION SORTS ITS UNITS INTO COMPANIES OF UP TO 8 BY WHERE THEY WERE MADE: INFANTRY, ARMOUR, AIR. CLICK ONE TO PICK JUST THOSE UNITS; CLICK AGAIN TO GO THERE. THEY FORM THEMSELVES.' });
      dy += chipRows(k) * 13;
      { const vets = d.units.filter((u) => u.rank).length, cy = bars[bars.length - 1][0]; if (vets) this.hudTips.push({ x: x0 + 6, y: cy, w: SB - 56, h: 14, title: `${vets} VETERAN${vets > 1 ? 'S' : ''}`, body: 'UNITS THAT HAVE SEEN REAL FIGHTING EARN RANKS (THE GOLD CHEVRONS): EACH RANK HITS 10% HARDER AND TAKES HITS 10% BETTER, AND PATCHES ITSELF UP. GET THEM OUT ALIVE WITH RETREAT.' }); }
    }
    if (canForm) { this.buttons.push({ id: 'formDiv', x: x0 + 6, y: dy, w: SB - 12, h: 14, label: 'FORM DIVISION' }); this.hudTips.push({ x: x0 + 6, y: dy, w: SB - 12, h: 14, title: 'FORM DIVISION', body: 'GIVES THE SELECTED UNITS A NAME AND A CARD HERE, SO ONE CLICK PICKS THEM ALL AGAIN. NOTHING ELSE CHANGES, AND YOU NEVER HAVE TO.' }); }
    for (const b of this.buttons) { const hot = M.x > b.x && M.x < b.x + b.w && M.y > b.y && M.y < b.y + b.h; button(ctx, b, hot, hot && M.down); }
    for (const [y, hp, k] of bars) {
      ctx.fillStyle = C.ink; ctx.fillRect(x0 + 8, y + 12, SB - 60, 1); ctx.fillStyle = hp > 0.6 ? C.ok : hp > 0.3 ? C.warn : C.bad; ctx.fillRect(x0 + 8, y + 12, Math.round((SB - 60) * hp), 1); // strength
      { const d = this.divisions[k]!, on = d.units.every((u) => u.selected); text(ctx, `${this.divName(k)} ${d.units.length}`, x0 + 10, y + 3, on ? C.gold : C.cream); } // name and size, left
      { const vets = this.divisions[k]!.units.filter((u) => u.rank).length; if (vets) { const s = String(vets), tx = x0 + SB - 54 - textWidth(s); text(ctx, s, tx, y + 3, C.gold, 1, C.ink); for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -2], [1, -1], [2, 0]]) { ctx.fillStyle = C.gold; ctx.fillRect(tx - 5 + dx, y + 6 + dy, 1, 1); } } } // its veterans, by its count, right
      if (this.divisions[k]!.feed) { ctx.fillStyle = C.ok; ctx.fillRect(x0 + SB - 24, y, 18, 1); ctx.fillRect(x0 + SB - 24, y + 13, 18, 1); ctx.fillRect(x0 + SB - 24, y, 1, 14); ctx.fillRect(x0 + SB - 7, y, 1, 14); } // new troops go here
    }
    if (this.hoverSlot) this.drawTooltip(this.hoverSlot.d, x0 - 4, this.hoverSlot.y);
    else { const tip = this.hudTips.find((t) => M.x > t.x && M.x < t.x + t.w && M.y > t.y && M.y < t.y + t.h); if (tip) this.drawNote(tip.title, tip.body, x0 - 4, tip.y); } // what this part of the panel means
  }
  hudTips: { x: number; y: number; w: number; h: number; title: string; body: string }[] = [];
  hoverOn: object | null = null; hoverT = 0; // what the mouse is over on the map, and since when (a moment's hold brings up its card)
  // A plain card beside the panel: a heading and a few words
  drawNote(title: string, body: string, right: number, y: number) {
    const ctx = this.ctx, w = 170, lines: string[] = []; let line = '';
    for (const word of body.split(' ')) { const t = line ? line + ' ' + word : word; if (textWidth(t) > w - 14) { lines.push(line); line = word; } else line = t; }
    if (line) lines.push(line);
    const h = 18 + lines.length * 9, x = right - w, top = Math.max(2, Math.min(this.FH - h - 2, y));
    panel(ctx, x, top, w, h);
    text(ctx, title, x + 7, top + 5, C.gold, 1, C.ink);
    lines.forEach((l, i) => text(ctx, l, x + 7, top + 16 + i * 9, C.cream)); // (bright: grey on the dark panel was hard to read)
  }

  // The bottom row of orders follows what's selected, so only orders that apply are on show. Each
  // has a key too, but you never need it.
  actions(): { id: string; label: string; key?: string; on?: boolean }[] {
    const b = this.selBld;
    if (this.selected().length) return [{ id: 'stop', label: 'STOP', key: 'S' }, this.selected().every((u) => u.type === 'scout') ? { id: 'scout', label: 'SCOUT', key: 'C', on: this.selected().every((u) => u.scouting) } : { id: 'amove', label: 'ATTACK', key: 'A' }, ...(SB >= 180 ? [{ id: 'guard', label: 'GUARD', key: 'G', on: this.selected().every((u) => this.patrols.some((p) => p.units.includes(u))) }] : []), { id: 'fallBack', label: 'RETREAT', key: 'R' }]; // (SPLIT stays on X; a scout's ATTACK stays on A)
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
    this.idleCash = this.prod.credits >= 2500 && !this.R.endless && !busy && this.owns('barracks') ? this.idleCash + 1 : 0; // seconds money has sat unspent with nothing being made (once there's somewhere to spend it: before that, the steps say what to build)
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
    if (this.lesson) return; // the lesson does the guiding
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
    this.pointAt(at, first[0].includes('UPLINK') ? 'UPLINK' : 'SITE');
  }
  // Point the way to a place: a chevron bobbing over it when it's in view, else a gold arrow at the edge of the view.
  pointAt(at: [number, number], word: string) {
    const ctx = this.ctx, f = this.k / this.kH, W = this.FW - SB, H = this.FH, [sx, sy] = toScreen(at[0], at[1]), x = (sx - Math.round(this.vx)) * f, y = (sy - Math.round(this.vy)) * f, glow = Math.floor(this.time * 3) % 2 ? C.gold : C.goldD;
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
  // oil you can build on: while a Derrick is being placed, every strike is pointed out (struck oil is easy to lose track of)
  oilSpots() { return this.terrain.oil.filter((o) => o.found && !o.tapped).map((o) => [(o.cx + 0.5) * CELL, (o.cy + 0.5) * CELL] as [number, number]); }
  drawOilPointers() { if (this.placing?.key === 'derrick') for (const at of this.oilSpots()) this.pointAt(at, 'OIL'); }
  // ---- learn to play ----
  // A guided first game: one thing to do at a time, said plainly, with what to click glowing gold (a card or button on
  // the panel, or a place on the map), moving on once it's done. The enemy waits until the end, then it's a normal game.
  lesson: { step: number; t: number; site?: Bld; foes?: Unit[] } | null = null;
  lessonSteps: { say: string; done: () => boolean; show?: () => { slot?: string; button?: string; tab?: string; at?: [number, number] } | null; start?: () => void }[] = [
    { say: 'WELCOME, COMMANDER. THIS TRUCK IS YOUR BUILDER: IT PUTS UP YOUR BUILDINGS. CLICK IT TO SELECT IT.', done: () => this.selected().some((u) => u.type === 'builder'), show: () => { const b = this.builders(0)[0]; return b ? { at: [b.x, b.y] } : null; } },
    { say: 'FIRST, YOUR HEADQUARTERS. CLICK COMMAND IN THE PANEL ON THE RIGHT.', done: () => this.placing?.key === 'fieldCommand' || this.mine('fieldCommand'), show: () => ({ slot: 'fieldCommand', tab: 'structure' }) },
    { say: 'NOW CLICK ON OPEN GROUND NEAR YOUR BUILDER TO PUT IT THERE. GREEN MEANS IT FITS; RED SAYS WHY NOT.', done: () => this.mine('fieldCommand') },
    { say: 'YOUR BUILDER IS PUTTING IT UP. BUILDINGS ARE PAID FOR AS THEY GO UP: YOUR MONEY IS AT THE TOP RIGHT.', done: () => this.owns('fieldCommand') },
    { say: 'BUILDINGS NEED POWER TO WORK. CLICK GENERATOR, THEN CLICK THE GROUND TO PLACE IT.', done: () => this.mine('generator'), show: () => ({ slot: 'generator', tab: 'structure' }) },
    { say: 'NOW MONEY. A SCRAPYARD COMES WITH A SALVAGER TRUCK THAT GATHERS SCRAP FROM THE GROUND AND SELLS IT. PLACE A SCRAPYARD.', done: () => this.mine('scrapyard'), show: () => ({ slot: 'scrapyard', tab: 'structure' }) },
    { say: 'A BARRACKS TRAINS SOLDIERS. PLACE ONE. (IT UNLOCKS ONCE THE GENERATOR IS FINISHED.)', done: () => this.mine('barracks'), show: () => ({ slot: 'barracks', tab: 'structure' }) },
    { say: 'WHEN THE BARRACKS IS UP, OPEN THE ARMY TAB AND CLICK RIFLEMAN THREE TIMES.', done: () => this.units.filter((u) => u.team === 0 && u.type === 'rifle').length + this.prod.queues.barracks.filter((j) => j.def.key === 'rifle').length >= 3, show: () => (this.buildTab === 'unit' || (this.selBld && this.prod.queues[this.selBld.type]) ? { slot: 'rifle' } : { tab: 'unit' }) },
    { say: 'YOUR SOLDIERS ARE ON THE WAY. NEW TROOPS GATHER INTO DIVISIONS ON THEIR OWN: SEE THE CARD ON THE RIGHT.', done: () => this.units.filter((u) => u.team === 0 && u.type === 'rifle').length >= 3 },
    { say: 'SELECT YOUR SOLDIERS: CLICK THEIR DIVISION CARD ON THE RIGHT, OR DRAG A BOX AROUND THEM.', done: () => this.selected().filter((u) => u.type === 'rifle').length >= 2, show: () => ({ button: 'div' + Math.max(0, this.divisions.findIndex((d) => d?.units.some((u) => u.type === 'rifle'))) }) },
    { say: 'SEE THE GOLD ARROW? THAT BUILDING CAN BE TAKEN. WITH YOUR SOLDIERS SELECTED, RIGHT-CLICK IT. (HOLD THE MOUSE OVER ANYTHING TO SEE WHAT IT DOES.)', done: () => this.lesson?.site?.team === 0,
      start: () => { const [hx, hy] = this.terrain.bases[0]; this.lesson!.site = this.blds.filter((b) => b.team === 2 && CAPTURE[b.type] && !CAPTURE[b.type].garrison && b.type !== 'uplink' && b.dying < 0).sort((a, b) => Math.hypot(a.cx - hx, a.cy - hy) - Math.hypot(b.cx - hx, b.cy - hy))[0]; },
      show: () => { const b = this.lesson?.site; return b ? { at: [(b.cx + b.w / 2) * CELL, (b.cy + b.h / 2) * CELL] } : null; } },
    { say: 'ENEMY SOLDIERS! THE BARRACKS IS SENDING 3 MORE RIFLEMEN. SELECT YOUR TROOPS AND RIGHT-CLICK AN ENEMY TO ATTACK IT.', done: () => !!this.lesson?.foes && this.lesson.foes.every((u) => !this.alive(u)),
      start: () => { const b = this.lesson!.site, [hx, hy] = this.terrain.bases[0], t = this.terrain; if (!b) { this.lesson!.foes = []; return; } for (let k = 0; k < 3; k++) this.prod.queues.barracks.push({ def: DEF.rifle, spent: 0 }); // (taking the building used up the soldiers who went in)
        const a = Math.atan2(b.cy - hy, b.cx - hx), foes: Unit[] = []; for (let k = 0; k < 2; k++) { let x = Math.round(b.cx + Math.cos(a) * 8 + k), y = Math.round(b.cy + Math.sin(a) * 8); for (let r = 0; r < 6 && !t.open(x, y, false); r++) x++; const f = this.addUnit('rifle', 1, (x + 0.5) * CELL, (y + 0.5) * CELL); f.hp = f.def.hp * 0.5; foes.push(f); } this.lesson!.foes = foes; }, // two, wounded: a first fight you win
      show: () => { const f = this.lesson?.foes?.filter((u) => this.alive(u)) ?? []; return f.length ? { at: [f[0].x, f[0].y] } : null; } },
    { say: 'WELL DONE: THAT IS THE GAME. BUILD, TRAIN, TAKE GROUND, FIGHT. THE ENEMY ON THE FAR SIDE OF THE MAP IS WAKING UP NOW. GOOD LUCK!', done: () => this.time - (this.lesson?.t ?? 0) > 12 },
  ];
  mine(k: string) { return this.blds.some((b) => b.team === 0 && b.type === k && b.dying < 0); } // placed (built or not)
  updateLesson() {
    const l = this.lesson!, step = this.lessonSteps[l.step];
    if (!step.done()) return;
    audio.click();
    if (l.step + 1 >= this.lessonSteps.length) { this.lesson = null; try { localStorage.setItem('conquer-learned', '1'); } catch {} return; } // (the front door stops suggesting it)
    l.step++; l.t = this.time;
    this.lessonSteps[l.step].start?.();
  }
  // the coach's card over the battlefield, and a gold glow on what to click
  drawLesson() {
    const l = this.lesson; if (!l) return;
    const ctx = this.ctx, step = this.lessonSteps[l.step], W = this.FW - SB, w = Math.min(300, W - 24), lines: string[] = []; let line = '';
    for (const word of step.say.split(' ')) { const t = line ? line + ' ' + word : word; if (textWidth(t) > w - 16) { lines.push(line); line = word; } else line = t; }
    if (line) lines.push(line);
    const h = 30 + lines.length * 10, x = Math.round((W - w) / 2), y = 8;
    panel(ctx, x, y, w, h); rivets(ctx, x, y, w, h);
    text(ctx, `LEARN TO PLAY  ${l.step + 1} OF ${this.lessonSteps.length}`, x + 8, y + 6, C.gold, 1, C.ink);
    lines.forEach((s, i) => text(ctx, s, x + 8, y + 19 + i * 10, C.cream));
    const skip = { id: 'skipLesson', x: x + w - 42, y: y + 4, w: 36, h: 11, label: 'SKIP' };
    this.buttons.push(skip); button(ctx, skip, this.mouse.x > skip.x && this.mouse.x < skip.x + skip.w && this.mouse.y > skip.y && this.mouse.y < skip.y + skip.h, false);
    const show = step.show?.(); if (!show) return;
    const glow = (r?: { x: number; y: number; w: number; h: number }) => { if (!r) return; const on = Math.floor(this.time * 3) % 2, c = on ? C.gold : C.goldD; ctx.fillStyle = c; for (const k of [-2, -1]) { ctx.fillRect(r.x + k, r.y + k, r.w - 2 * k, 1); ctx.fillRect(r.x + k, r.y + r.h - 1 - k, r.w - 2 * k, 1); ctx.fillRect(r.x + k, r.y + k, 1, r.h - 2 * k); ctx.fillRect(r.x + r.w - 1 - k, r.y + k, 1, r.h - 2 * k); } };
    const tabOpen = !show.tab || this.buildTab === show.tab || (show.tab === 'unit' && this.selBld && this.prod.queues[this.selBld.type]);
    if (show.tab && !tabOpen) glow(this.tabs.find((t) => t.id === show.tab)); // open the right tab first
    else if (show.slot) glow(this.slots.find((sl) => sl.def.key === show.slot));
    if (show.button) glow(this.buttons.find((b) => b.id === show.button));
    if (show.at) this.pointAt(show.at, 'HERE');
  }
  idleCash = 0; // how long money has sat unspent with nothing being made
  goalAt: [number, number] | null = null; // where the first step of the checklist is (marked on the radar too)

  // A card beside the build panel: what the item is called, what it costs, what it's for.
  hoverSlot: { d: BuildDef; y: number } | null = null;
  drawTooltip(d: BuildDef, right: number, y: number) {
    const ctx = this.ctx, w = 170, ok = this.available(d);
    const stats = d.key === 'line' ? 'PRICED BY LENGTH' : [`$${d.cost}`, d.power ? `POWER ${d.power > 0 ? '+' : ''}${d.power}` : '', d.time ? `${d.time}S` : 'INSTANT'].filter(Boolean).join('   ');
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
      text(ctx, b.rise < 1 ? 'UNDER CONSTRUCTION' : pw ? `POWER ${pw > 0 ? '+' : ''}${pw}` : CAPTURE[b.type]?.garrison ? `${b.garrison} INSIDE` : '', x, y + 15, pw > 0 ? C.ok : C.cream);
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
    else { const [long, short] = SHORT[d.key] ?? [d.name.toUpperCase(), d.name.toUpperCase().split(' ')[0].slice(0, 6)], name = textWidth(long) <= w - 2 ? long : short; text(ctx, name, sx + Math.round((w - textWidth(name)) / 2), sy + h - 8, ok ? C.cream : C.muted); }
    const price = d.key === 'line' ? 'DRAG' : d.cost >= 10000 ? `$${Math.round(d.cost / 1000)}K` : '$' + d.cost; // the price up top, on a dark tab so it reads over any picture
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
    const parts: Sprite[] = d.kind === 'structure' ? [this.icons[d.key === 'line' ? 'guardTower' : d.key]] : (() => { const look = this.looks[d.key + '0']; return look ? [facing(look.body, Math.PI * 0.25), ...(look.turret ? [facing(look.turret, Math.PI * 0.25)] : [])] : []; })();
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
    return (!!this.R.unlock || (d.needs ?? []).every((n) => this.owns(n))) && (d.kind === 'structure' || this.owns(d.from!)); // (SANDBOX: no unlocking)
  }
  tipFor(d: BuildDef) {
    if (d.kind === 'structure' && !this.builders(0).length) return 'NEEDS A BUILDER: TRAIN ONE AT THE FIELD COMMAND';
    if (d.key === 'derrick' && !this.available(d)) return 'STRIKE OIL FIRST: ROAM THE MAP WITH VEHICLES';
    if (d.key === 'derrick' && this.available(d)) return '$1200  SMALL SEEP: +100 POWER, $5/S.  BIG STRIKE: +200, $10/S';
    const extra: Record<string, string> = {
      line: 'DRAG ALONG YOUR BORDER: JUST ENOUGH TOWERS TO COVER IT, SANDBAGS BETWEEN, GAPS AT ROADS. LET GO AND YOUR BUILDERS PUT IT UP',
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
      this.planFrom = null; // a fresh pick starts a fresh drag (a drag begun before Escape or a right-click laid sites from that old press to the panel)
      if (btn === 2) { this.placing = null; return; }
      if (this.available(d)) this.placing = d; // put the foundation down; a builder does the rest
      else this.bark = { who: d.name, line: this.tipFor(d), t: 3 };
      return;
    }
    if (btn === 2) { p.dequeue(d.from!, d); return; }
    if (this.available(d) && p.queues[d.from!].length < 6) p.queues[d.from!].push({ def: d, spent: 0, at: this.selBld?.team === 0 && this.selBld.type === d.from ? this.selBld : undefined }); // ordered from a selected factory: it comes out of that one
  }

  // ---- economy: production, power, placing structures, salvaging ----
  updateEconomy(dt: number) {
    for (const team of this.sides) {
      const was = this.powers[team], pw = (this.powers[team] = { made: 0, used: 0 });
      for (const b of this.blds) {
        if (b.team !== team || b.rise < 1 || b.dying >= 0) continue;
        const v = b.pw ?? POWER[b.type] ?? 0;
        if (v > 0) pw.made += v * (this.territory.linked.has(b) ? 1 : 0.5); // a plant cut off from the network makes half
        else pw.used -= v;
      }
      if (team === 0 && pw.used > pw.made && was.used <= was.made) audio.fx('powerdown');
      const speed = this.powerEff(team) * (team === 0 ? this.R.build ?? 1 : 1);
      for (const job of this.prods[team].tick(dt, speed, (k) => this.blds.reduce((n, b) => n + (b.team === team && b.type === k && b.rise >= 1 && b.dying < 0 ? this.link(b) : 0), 0))) { // a cut-off factory works at half speed
        const d = job.def, at = job.at as Bld | undefined, fs = this.blds.filter((b) => b.team === team && b.type === d.from && b.rise >= 1 && b.dying < 0);
        const f = at && fs.includes(at) ? at : fs[(Math.random() * fs.length) | 0]; // out of the factory it was ordered from (a selected one), else any of yours
        if (!f) continue;
        for (let k = 0; k < (this.R.copies ?? 1); k++) this.turnOut(d, team, f, k); // (MAYHEM: every unit comes out as three)
      }
    }
    this.prospect(dt);
    const was = this.prods.map((p) => p.credits); // (what the enemy earns below is multiplied in a hard mode)
    for (const team of this.sides) if (this.owns('fieldCommand', team)) this.prods[team].credits += dt * 4; // a small allowance from HQ, so nobody stalls for good
    for (const [team, sq] of this.territory.area) this.prods[team].credits += dt * Math.max(0, sq - (this.raided.get(team) ?? 0)) * this.landRate(); // the land pays, except where enemy soldiers stand
    if ((this.dangerT -= dt) <= 0) { this.dangerT = 5; this.markDanger(); }
    for (const b of this.blds) if (b.type === 'townHall' && b.team !== 2 && this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) this.prods[b.team].credits += dt * 5 * (this.territory.linked.has(b) ? 2 : 1); // town trade: double once linked
    for (const b of this.blds) if (b.type === 'fuelDepot' && b.team !== 2 && this.blds.some((o) => o.team === b.team && o.max > 0 && o.dying < 0 && o.type !== 'wall')) this.prods[b.team].credits += dt * 8 * (this.territory.linked.has(b) ? 2 : 1); // captured fuel sells: double once linked
    for (const b of this.blds) if (b.type === 'derrick' && b.rise >= 1 && b.dying < 0 && b.team !== 2) this.prods[b.team].credits += dt * (b.pw === 200 ? 10 : 5) * this.link(b); // oil sells: $5 a second, $10 on a big strike (half if cut off)
    if (this.R.earn) for (const team of this.sides) if (this.hostile(0, team)) this.prods[team].credits += (this.prods[team].credits - was[team]) * (this.R.earn - 1);
    if (this.R.endless) this.prods[0].credits = Math.max(this.prods[0].credits, 1e6);
    this.updateConstruction(dt);
    if ((this.helpT -= dt) <= 0) { this.helpT = 0.5; this.builderHelp(); }
  }

  // ---- FRONT LINE: no building and no money. Every 30 seconds both sides get the same random wave, at their
  // capturable site closest to the enemy (or their Field Command). The enemy's waves push for the nearest site
  // they don't hold, then for your Field Command; the first Field Command to fall loses.
  waveT = 8; waveNo = 0;
  isPost(b: Bld) { return !!CAPTURE[b.type] && b.type !== 'watchtower' && b.type !== 'bunker' && b.type !== 'dam' && b.dying < 0; } // a site waves can come in at
  hq(team: number) { return this.blds.find((b) => b.team === team && b.type === 'fieldCommand' && b.dying < 0); }
  frontSpawn(team: number) {
    const foe = this.hq(team === 0 ? 1 : 0), home = this.hq(team); if (!foe || !home) return home;
    const far = (b: Bld) => this.reach(...this.posOf(foe), b);
    return this.blds.filter((b) => b.team === team && this.isPost(b)).reduce((best, b) => (far(b) < far(best) ? b : best), home);
  }
  waveMix() {
    const min = this.stats.time / 60, budget = Math.min(4000, 1500 + 100 * min);
    if (this.waveNo % 10 === 0) return ['colossus']; // every tenth wave: a Colossus each
    const POOL: [string, number][] = [['rifle', 0], ['rocket', 0], ['grenadier', 0], ['scout', 0], ['tank', 1], ['flak', 2], ['gunship', 3], ['artillery', 3], ['juggernaut', 4], ['bomber', 5]]; // and the minute each can first come
    const can = POOL.filter(([, m]) => m <= min).map(([k]) => k), kinds = new Set<string>();
    while (kinds.size < Math.min(can.length, 2 + (Math.random() < 0.4 ? 1 : 0))) kinds.add(can[(Math.random() * can.length) | 0]);
    const out: string[] = []; let left = budget;
    for (let k = 0, miss = 0; miss < kinds.size; k++) { const key = [...kinds][k % kinds.size]; if (DEF[key].cost <= left) { out.push(key); left -= DEF[key].cost; miss = 0; } else miss++; }
    return out;
  }
  frontPush(u: Unit) { // an attacking enemy unit: two soldiers to take each site on the way; everyone else on at you
    const home = this.hq(u.team), mine = this.hq(0); if (!home || !mine) return;
    const posts = this.blds.filter((b) => this.isPost(b) && b.team !== u.team && b.type !== 'uplink').sort((a, b) => this.reach(...this.posOf(home), a) - this.reach(...this.posOf(home), b));
    const site = posts.find((b) => this.reach(...this.posOf(b), mine) < this.reach(...this.posOf(home), mine)) ?? null; // (only ones between it and you)
    if (site && !u.def.vehicle && !u.def.air && this.units.filter((o) => o.enter === site && o.team === u.team).length < 2) { this.sendIn(u, site); return; } // (two soldiers to take it: capturing uses them up)
    const [x, y] = this.posOf(this.frontSpawn(0) ?? mine); // the rest drive on at your most forward site (where your waves come in), fighting all the way
    u.amove = true; u.goal = [x + (Math.random() - 0.5) * 4 * CELL, y + (Math.random() - 0.5) * 4 * CELL]; u.path = this.route(u, ...u.goal);
  }
  points = [0, 0, 0, 0, 0, 0]; // each side's points from kills, for call-ins
  callIn(team: number, kind: string, x = 0, y = 0) {
    const c = CALLS[kind], home = this.hq(team); if (!c || !home || this.points[team] < c.cost) return false;
    this.points[team] -= c.cost;
    if (kind === 'reinforce') { const f = this.frontSpawn(team); if (f) ['tank', 'tank', 'rifle', 'rifle', 'rocket', 'rocket'].forEach((k, i) => { const u = this.turnOut(DEF[k], team, f, i - 2.5); if (team !== 0) this.frontAct(u); }); }
    if (kind === 'barrage') { // shells fall over the spot for a few seconds
      const w: Weapon = { ...WEAPONS.howitzer, dmg: { inf: 80, veh: 90, bld: 30 }, splash: 30 };
      for (let k = 0; k < 18; k++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 3.5 * CELL, gx = x + Math.cos(a) * r, gy = y + Math.sin(a) * r, [es, esy] = this.scr({ x: gx, y: gy }); this.shells.push({ x: 0, y: 0, sx: es + 60, sy: esy - 420, tx: es, ty: esy - 2, t: -k * 0.18, life: 0.9, w, team, arc: 0, gx, gy, src: home }); }
    }
    if (kind === 'orbital') { const sx = (home.cx + 1) * CELL, sy = (home.cy + 1) * CELL; this.strikes.push({ team, sx, sy, tx: x, ty: y, t: 0, dur: Math.max(6, Math.hypot(x - sx, y - sy) / 320) }); audio.explosion(sx, sy, 1.6); }
    if (team === 0 && kind === 'reinforce') audio.fx('reinforce');
    if (team === 0) this.bark = { who: 'Command', line: kind === 'reinforce' ? 'Reinforcements on the way.' : kind === 'barrage' ? 'Barrage incoming.' : 'Strike called down from orbit.', t: 3 };
    else this.warn(`ENEMY ${c.name}!`, kind === 'reinforce' ? this.posOf(this.frontSpawn(team) ?? home) : [x, y]);
    return true;
  }
  // The enemy's mind on the front, every few seconds: it gathers its waves at its forward site until it's stronger than what
  // it can see of yours, then attacks; it turns back to defend a site you threaten; and it spends its points on call-ins
  // where your troops bunch up. It only counts what its own troops and buildings can see. (Easy just pushes and never calls in.)
  plans = new Map<number, 'gather' | 'attack' | 'defend'>(); planT = 0; callT = new Map<number, number>(); // callT: when each side may call in again
  frontAct(u: Unit) { // a unit does what its side's plan says
    const plan = this.plans.get(u.team) ?? 'gather';
    if (plan === 'attack') { this.frontPush(u); return; }
    const at = plan === 'defend' ? this.threat(u.team)?.at : null, f = this.frontSpawn(u.team), [x, y] = at ?? (f ? this.posOf(f) : [u.x, u.y]);
    if (Math.hypot(u.x - x, u.y - y) > 8 * CELL) { u.amove = true; u.goal = [x, y]; u.path = this.route(u, x, y); }
  }
  inSight(team: number) { // your fighting units its side can see (within 14 squares of its units or buildings)
    const eyes = [...this.units.filter((u) => u.team === team).map((u) => [u.x, u.y]), ...this.blds.filter((b) => b.team === team && b.dying < 0).map((b) => this.posOf(b))], R = 14 * CELL;
    return this.units.filter((u) => this.hostile(team, u.team) && u.team !== MARAUDER && u.def.weapon && eyes.some(([x, y]) => Math.abs(u.x - x) < R && Math.abs(u.y - y) < R));
  }
  threat(team: number): { at: [number, number]; hq: boolean } | null { // its Field Command (first) or one of its sites with your troops close by
    const foes = this.inSight(team), mine = this.blds.filter((b) => b.team === team && (this.isPost(b) || b.type === 'fieldCommand')).sort((a, b) => (b.type === 'fieldCommand' ? 1 : 0) - (a.type === 'fieldCommand' ? 1 : 0));
    for (const b of mine) { const [x, y] = this.posOf(b), hq = b.type === 'fieldCommand'; if (foes.filter((u) => Math.hypot(u.x - x, u.y - y) < 16 * CELL).length >= (hq ? 1 : 3)) return { at: [x, y], hq }; }
    return null;
  }
  frontThink() {
    const worth = (list: Unit[]) => list.reduce((a, u) => a + (DEF[u.type]?.cost ?? 300) * Math.max(0, u.hp) / u.def.hp, 0);
    for (const team of this.sides) if (team !== 0) {
      const army = this.units.filter((u) => u.team === team && u.def.weapon), foes = this.inSight(team), was = this.plans.get(team);
      const easy = this.level === 'easy', bold = ({ easy: 0, normal: 1.3, hard: 1.1, brutal: 1 } as Record<string, number>)[this.level] ?? 1.2;
      const danger = this.threat(team);
      const plan = easy ? 'attack' : danger && (danger.hq || was !== 'attack') ? 'defend' : worth(army) > Math.max(1500, worth(foes) * bold) ? 'attack' : was === 'attack' && worth(army) > worth(foes) * 0.7 ? 'attack' : 'gather'; // (an attack carries on until it's clearly losing)
      this.plans.set(team, plan);
      for (const u of army) if (!u.target && !u.enter && (plan !== was || (!u.goal && !u.path.length))) this.frontAct(u);
      if (easy || !foes.length || this.time < (this.callT.get(team) ?? 0)) continue;
      const crowd = (n: number) => { let best: Unit | null = null, bn = 0; for (const u of foes) { const k = foes.filter((o) => Math.hypot(o.x - u.x, o.y - u.y) < 4 * CELL).length; if (k > bn) { bn = k; best = u; } } return bn >= n ? best : null; }; // the thickest bunch of your troops
      const big = crowd(10), small = crowd(5), p = this.points[team];
      const used = big && p >= CALLS.orbital.cost ? this.callIn(team, 'orbital', big.x, big.y)
        : small && !big && p >= CALLS.barrage.cost ? this.callIn(team, 'barrage', small.x, small.y)
        : p >= CALLS.reinforce.cost + CALLS.barrage.cost ? this.callIn(team, 'reinforce') : false; // (keeping enough back for a barrage)
      if (used) this.callT.set(team, this.time + 15); // one call-in every 15 seconds at most
    }
  }
  updateFront(dt: number) {
    for (const p of this.prods) p.credits = 0;
    if ((this.planT -= dt) <= 0) { this.planT = 4; this.frontThink(); }
    if ((this.waveT -= dt) > 0) return;
    this.waveT = 30; this.waveNo++;
    const mix = this.waveMix();
    for (const team of this.sides) {
      const f = this.frontSpawn(team); if (!f) continue;
      mix.forEach((key, k) => { const u = this.turnOut(DEF[key], team, f, (k % 5) - 2); if (team !== 0) this.frontAct(u); });
    }
    const count = new Map<string, number>(); for (const k of mix) count.set(k, (count.get(k) ?? 0) + 1);
    this.banner = { title: `WAVE ${this.waveNo}`, sub: [...count].map(([k, n]) => { const w = DEF[k].name.toUpperCase(); return `${n} ${n < 2 ? w : w.endsWith('MAN') ? w.slice(0, -3) + 'MEN' : w.endsWith('Y') ? w.slice(0, -1) + 'IES' : w + 'S'}`; }).join(', '), t: 3, c: C.gold };
  }

  // A new unit comes out of a building (its factory, or in FRONT LINE the side's most forward site): to the rally point, into a division.
  turnOut(d: BuildDef, team: number, f: Bld, twin = 0) {
    const [ex, ey, ox, oy] = this.door(f, DEFS[d.key].crush), u = this.addUnit(d.key, team, ex + twin * 0.8 * CELL, ey);
    u.heading = u.tHead = Math.atan2(oy, ox);
    if (d.key === 'builder') u.base = f; // it works for the Field Command that trained it
    this.stats.built[team]++;
    const r = f.rally ?? [ex + ox * 2 * CELL + (Math.random() - 0.5) * 30, ey + oy * 2 * CELL]; // a couple of squares out from the door
    u.goal = [r[0], r[1]]; u.path = this.route(u, r[0], r[1]);
    if (team === 0 && u.type === 'scout') u.scouting = true; // a new scout goes exploring on its own, outside any division
    let fed = team === 0 && u.def.weapon && u.type !== 'builder' && u.type !== 'scout' ? this.divisions.find((v) => v?.feed) : null;
    if (fed && fed.units.length >= DIV_SIZE) { // full: the next division starts and takes the new troops; with all five in use, the smallest does (they grow evenly)
      const k = this.divisions.findIndex((v) => !v || !v.units.length), small = this.divisions.reduce<Division | null>((m, v) => (v && v.units.length && (!m || v.units.length < m.units.length) ? v : m), null);
      const next = k >= 0 ? (this.divisions[k] = { units: [], fresh: [], since: 0, feed: true, companies: [] }) : small;
      if (next && next !== fed) { fed.feed = false; next.feed = true; fed = next; }
    }
    if (fed) { if (!fed.fresh.length) fed.since = this.time; fed.units.push(u); fed.fresh.push(u); this.joinCompany(fed, u); } // it joins the division once enough have gathered
    if (team === 0) { audio.fx('trained', u.x, u.y, 0.5); this.bark = { who: d.name, line: d.key === 'harvester' ? 'Salvager reporting. Show me the scrap.' : 'Reporting for duty.', t: 2.5, pri: 0 }; } // (chatter: a busy factory turns these out by the dozen)
    return u;
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
      audio.fx('oil'); this.bark = o.big ? { who: 'Field report', line: 'BIG STRIKE! Build a Derrick on it. (Space: go there)', t: 5 } : { who: 'Field report', line: 'Struck oil: a small seep, but it\'ll pump. (Space: go there)', t: 5 };
      this.alertAt = [ox, oy]; // Space goes to the latest alert; the radar marks it, and placing a Derrick points to it
      audio.explosion(ox, oy, o.big ? 2 : 1.2);
      this.quake(0.5, ...this.scr({ x: ox, y: oy }));
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
      else if (t.elev[i] === 1 && well < 0) no('NOT ON A SLOPE');
      if (e < 0) e = t.elev[i]; else if (t.elev[i] !== e && well < 0) no('THE GROUND MUST BE LEVEL'); // (a Derrick stands on its well wherever the oil came up)
    }
    if (this.units.some((u) => u.x > cx * CELL - 4 && u.x < (cx + d.w!) * CELL + 4 && u.y > cy * CELL - 4 && u.y < (cy + d.h!) * CELL + 4)) no('UNITS ARE IN THE WAY');
    // anything may go anywhere you've explored (a builder has to get there, and may not)
    let explored = true;
    for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) if (!t.inside(x, y) || !this.vis[t.idx(x, y)]) explored = false;
    if (!explored) no('YOU HAVEN\'T EXPLORED THERE');
    return [cx, cy, ok];
  }

  // The building planner: rows and columns on the ground's grid, a square apart (room for a road between), from where
  // the drag began to the cursor. Along one edge it's a single row; pull out sideways for more rows. Twenty at most.
  blockAt(d: BuildDef, from: [number, number]): [number, number, boolean][] {
    const M = this.mouse, [ox, oy] = this.placeAt(d, from), [tx, ty] = this.placeAt(d, this.groundAt(M.x + this.vx, M.y + this.vy)), sx = d.w! + 1, sy = d.h! + 1;
    const nx = Math.round(Math.abs(tx - ox) / sx) + 1, ny = Math.min(Math.round(Math.abs(ty - oy) / sy) + 1, Math.max(1, Math.floor(20 / nx)));
    const out: [number, number, boolean][] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < Math.min(nx, 20); i++) {
      const cx = ox + Math.sign(tx - ox) * i * sx, cy = oy + Math.sign(ty - oy) * j * sy;
      out.push([cx, cy, this.placeAt(d, [(cx + d.w! / 2) * CELL, (cy + d.h! / 2) * CELL])[2]]);
    }
    return out;
  }
  // Let go: the sites that can go there are marked, and join the builders' queue in order (each paid for as it goes up).
  orderBlock(cells: [number, number, boolean][]) {
    const d = this.placing!, good = cells.filter((c) => c[2]);
    if (!good.length) { if (cells.length) this.placeAt(d, [(cells[0][0] + d.w! / 2) * CELL, (cells[0][1] + d.h! / 2) * CELL]); this.bark = { who: 'Builder', line: this.placeWhy ? this.placeWhy.charAt(0) + this.placeWhy.slice(1).toLowerCase() + '.' : 'It can\'t go there.', t: 2.5, pri: 1 }; audio.click(); return; }
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
    // waits its turn (it's numbered in the queue). Otherwise the free builders best placed for them take them; the rest wait.
    const sel = this.selected().filter((u) => u.type === 'builder' && !(u.buildSite && u.buildSite.rise < 1 && !u.buildSite.gone));
    for (const u of sel) this.assignSite(u, sites[0]);
    if (!sel.length) this.builderHelp(); // the free builders best placed take them (see nextJob)
    const crew = sel.length || sites.filter((b) => this.units.some((u) => u.buildSite === b)).length;
    this.numberQueue();
    const what = sites.length > 1 ? `${sites.length} ${d.name}${d.name.endsWith('s') ? '' : 's'}` : 'Site';
    audio.fx('place', undefined, undefined, 0.4);
    this.bark = { who: 'Builder', line: crew ? (sites.length > 1 ? `${what} marked. On it.` : 'Breaking ground.') : this.builders(0).length ? `${what} marked: ${this.ordinal(this.waitNo.get(sites[0]) ?? 1)} in line.` : `${what} marked. Train a builder at the Field Command.`, t: 2.5, pri: 1 };
  }

  // The wall planner: a straight line at any angle from where you pressed to the cursor.
  wallLine(a: [number, number], b: [number, number]) { // at any angle: the blocks a straight line from a to b crosses (sixty at most). Where they meet only at a corner, nothing gets through: routes never cut between two blocked corners
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.min(60, Math.max(Math.abs(dx), Math.abs(dy))), out: [number, number][] = [];
    for (let k = 0; k <= n; k++) out.push([Math.round(a[0] + (dx * k) / (n || 1)), Math.round(a[1] + (dy * k) / (n || 1))]);
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
    const queueing = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), crew = this.selected().filter((u) => u.type === 'builder' && !(queueing && u.buildSite));
    for (const u of crew) this.assignSite(u, sites.reduce((p, q) => (this.reach(u.x, u.y, p) < this.reach(u.x, u.y, q) ? p : q)));
    if (!crew.length) this.builderHelp(); // the free builders best placed take it (see nextJob)
    const idle = crew.length ? crew : this.units.filter((u) => u.buildSite && sites.includes(u.buildSite));
    this.numberQueue();
    this.bark = { who: 'Builder', line: idle.length ? `${sites.length} blocks of sandbags. On it.` : this.builders(0).length ? `${sites.length} blocks planned: ${this.ordinal(this.waitNo.get(sites[0]) ?? 1)} in line.` : `${sites.length} blocks planned. Train a builder at the Field Command.`, t: 2.5, pri: 1 };
  }
  // The defence line planner: the cursor's trail while you drag, square by square
  traceLine() {
    if (this.placing?.key !== 'line' || !this.planFrom) { if (this.linePath.length) { this.linePath = []; this.lineCache = null; } return; }
    const M = this.mouse, cell = ([gx, gy]: [number, number]): [number, number] => [Math.floor(gx / CELL), Math.floor(gy / CELL)];
    if (!this.linePath.length) this.linePath.push(cell(this.planFrom));
    const c = cell(this.groundAt(M.x + this.vx, M.y + this.vy)), last = this.linePath[this.linePath.length - 1];
    if (last[0] !== c[0] || last[1] !== c[1]) { this.linePath.push(c); this.lineCache = null; } // (squares between two traced points are filled in by linePlan)
  }
  // What the line lays: along the trail, a defence every LINE_GAP squares (the mix by what you've seen of the enemy),
  // sandbags between, and gaps where a road crosses and after every LINE_GATE solid squares, so your own army gets out.
  linePlan() {
    const t = this.terrain, cells: [number, number][] = [], had = new Set<number>();
    for (const p of this.linePath) {
      const last = cells[cells.length - 1];
      for (const c of last ? this.wallLine(last, p).slice(1) : [p]) { if (cells.length >= LINE_MAX || !t.inside(c[0], c[1]) || had.has(t.idx(c[0], c[1]))) continue; had.add(t.idx(c[0], c[1])); cells.push(c); }
    }
    // Towers by reach, fewest that do the job: for each kind of attacker, every square of the line sits inside the reach of
    // its counter (LINE_DEPTH squares deep, so attackers are under fire before they reach it), counting the defences you
    // already have and the longer reach your radar gives. Flak twice over once you've seen aircraft, cannons once you've seen armour.
    const cannon = this.owns('depot'), taken = new Set<number>(), towers: { key: string; cx: number; cy: number; at: number }[] = [], walls: [number, number, boolean][] = [];
    const fits = (key: string, cx: number, cy: number) => { const d = DEF[key]; for (let y = cy; y < cy + d.h!; y++) for (let x = cx; x < cx + d.w!; x++) if (!t.inside(x, y) || taken.has(t.idx(x, y))) return false; return this.placeAt(d, [(cx + d.w! / 2) * CELL, (cy + d.h! / 2) * CELL])[2]; };
    const need: Record<string, number> = { emplacement: cannon ? (this.sighted.armour >= 4 ? 2 : 1) : 0, flakTower: this.sighted.air >= 2 ? 2 : 1, guardTower: 1 }; // (cannons need a Depot)
    for (const key of ['emplacement', 'flakTower', 'guardTower']) { // biggest first, so the 2x2 cannons get their spots
      if (!need[key]) continue;
      const d = DEF[key], guns: [number, number, number][] = []; // centre x, y and how far along the line it covers (squares)
      const add = (cx: number, cy: number, w: number, h: number) => { const x = cx + w / 2, y = cy + h / 2, r = this.reachOf(key, 0, x * CELL, y * CELL) / CELL; guns.push([x, y, Math.sqrt(Math.max(1, r * r - LINE_DEPTH * LINE_DEPTH))]); };
      for (const b of this.blds) if (b.team === 0 && b.type === key && b.dying < 0) add(b.cx, b.cy, b.w, b.h);
      const count = (i: number) => guns.filter(([x, y, r]) => Math.hypot(x - cells[i][0] - 0.5, y - cells[i][1] - 0.5) <= r).length;
      for (let i = 0; i < cells.length; i++) {
        if (count(i) >= need[key]) continue;
        // the furthest spot along the line that still covers this square: each tower does as much of the line as it can
        const r = this.reachOf(key, 0, (cells[i][0] + 0.5) * CELL, (cells[i][1] + 0.5) * CELL) / CELL, reach = Math.sqrt(Math.max(1, r * r - LINE_DEPTH * LINE_DEPTH));
        let put = false;
        for (let j = Math.min(cells.length - 1, i + Math.ceil(reach) + 1); j >= Math.max(0, i - 2) && !put; j--) {
          const c = cells[j];
          if (Math.hypot(c[0] + d.w! / 2 - cells[i][0] - 0.5, c[1] + d.h! / 2 - cells[i][1] - 0.5) > reach || !fits(key, c[0], c[1])) continue;
          for (let y = c[1]; y < c[1] + d.h!; y++) for (let x = c[0]; x < c[0] + d.w!; x++) taken.add(t.idx(x, y));
          towers.push({ key, cx: c[0], cy: c[1], at: j }); add(c[0], c[1], d.w!, d.h!); put = true;
        }
        if (put) i--; // look at this square again (to be covered twice over it may need another); if nothing fits near here, it's left

      }
    }
    towers.sort((a, b) => a.at - b.at); // built in order along the line
    for (let i = 0, run = 0, gate = 0; i < cells.length; i++) {
      const [x, y] = cells[i], at = t.idx(x, y);
      if (taken.has(at)) { run++; continue; }
      if (t.type[at] === T.ROAD || t.type[at] === T.BRIDGE || t.type[at] === T.FORD) { run = 0; continue; } // a road through: left open
      if (gate || run >= LINE_GATE) { gate = gate ? gate - 1 : 1; run = 0; continue; } // a gate, two squares wide
      walls.push([x, y, this.placeAt(DEF.wall, [(x + 0.5) * CELL, (y + 0.5) * CELL])[2]]); run++;
    }
    const cost = towers.reduce((n, w) => n + DEF[w.key].cost, 0) + walls.filter((w) => w[2]).length * DEF.wall.cost;
    return { towers, walls, cost };
  }
  plannedLine() { // (worked out again when the trail changes, or every half second as units move about)
    const c = this.lineCache;
    if (c && c.n === this.linePath.length && this.time - c.at < 0.5) return c.plan;
    const plan = this.linePlan(); this.lineCache = { at: this.time, n: this.linePath.length, plan }; return plan;
  }
  // Let go: the defences go in the queue in order along the line, then the sandbags as one job
  orderLine() {
    this.traceLine();
    const plan = this.linePlan(); this.linePath = []; this.lineCache = null;
    const sites: Bld[] = [], bags: Bld[] = [];
    for (const w of plan.towers) { const d = DEF[w.key]; this.addBld(w.key, 0, w.cx, w.cy, d.w!, d.h!, d.name); const b = this.blds[this.blds.length - 1]; this.startSite(b); sites.push(b); }
    for (const [x, y, ok] of plan.walls) if (ok) { this.addBld('wall', 0, x, y, 1, 1, DEF.wall.name); const b = this.blds[this.blds.length - 1]; this.startSite(b); bags.push(b); }
    for (const b of bags) b.job = bags[0].job;
    if (!sites.length && !bags.length) { this.bark = { who: 'Builder', line: 'Nothing fits along there. Drag along open ground.', t: 2.5, pri: 1 }; audio.click(); return; }
    if (!this.keys.has('ShiftLeft') && !this.keys.has('ShiftRight')) this.placing = null;
    this.builderHelp(); this.numberQueue();
    const what = `Defence line: ${sites.length} defence${sites.length === 1 ? '' : 's'}, ${bags.length} sandbags.`;
    this.bark = { who: 'Builder', line: this.builders(0).length ? `${what} On it.` : `${what} Train a builder at the Field Command.`, t: 3, pri: 1 };
  }
  drawLinePlan(vx: number, vy: number) {
    const ctx = this.ctx, t = this.terrain, M = this.mouse;
    const tile = (x: number, y: number, fill: string, edge: string) => {
      const lift = t.lift((x + 0.5) * CELL, (y + 0.5) * CELL), pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b2]) => { const [sx, sy] = toScreen(a * CELL, b2 * CELL); return [Math.round(sx - vx), Math.round(sy - lift - vy)]; });
      ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();
    };
    if (!this.planFrom) { // before the drag: where it starts, and what to do
      const [gx, gy] = this.groundAt(M.x + vx, M.y + vy); tile(Math.floor(gx / CELL), Math.floor(gy / CELL), 'rgba(126,224,138,0.22)', 'rgba(126,224,138,0.8)');
      text(ctx, 'DRAG ALONG YOUR BORDER', Math.round(M.x) + 12, Math.round(M.y) - 14, C.gold, 1, C.ink);
      return;
    }
    const plan = this.plannedLine();
    for (const w of plan.towers) { const d = DEF[w.key]; this.drawReach(vx, vy, w.key, w.cx, w.cy, d.w!, d.h!, true); }
    for (const [x, y, ok] of plan.walls) tile(x, y, ok ? 'rgba(126,224,138,0.3)' : 'rgba(232,80,58,0.25)', ok ? 'rgba(126,224,138,0.85)' : 'rgba(232,80,58,0.7)');
    for (const w of [...plan.towers].sort((a, b) => a.cx + a.cy - b.cx - b.cy)) {
      const d = DEF[w.key];
      for (let y = w.cy; y < w.cy + d.h!; y++) for (let x = w.cx; x < w.cx + d.w!; x++) tile(x, y, 'rgba(126,224,138,0.22)', 'rgba(126,224,138,0.8)');
      const s = this.looks[w.key + '0'].body[0], [bx, by] = this.scr({ x: (w.cx + d.w! / 2) * CELL, y: (w.cy + d.h! / 2) * CELL });
      ctx.globalAlpha = 0.6; ctx.drawImage(s.img, Math.round(bx - vx - s.ax), Math.round(by - vy - s.ay)); ctx.globalAlpha = 1;
    }
    const n = (k: string) => plan.towers.filter((w) => w.key === k).length, parts = [['guardTower', 'GUARD'], ['emplacement', 'CANNON'], ['flakTower', 'FLAK']].filter(([k]) => n(k)).map(([k, l]) => `${n(k)} ${l}`);
    const power = plan.towers.reduce((n, w) => n - (DEF[w.key].power ?? 0), 0), pw = this.powers[0], short = !!pw && pw.used + power > pw.made; // (towers use power: say so, red if it'd leave you short)
    const label = `${parts.join(' ') || 'NO TOWERS'}  ${plan.walls.filter((w) => w[2]).length} BAGS  $${plan.cost}${power ? `  POWER -${power}` : ''}`;
    text(ctx, label, Math.round(M.x) + 12, Math.round(M.y) - 14, this.prod.credits >= plan.cost && !short ? C.gold : C.bad, 1, C.ink);
  }
  // A defence's reach on the ground, as a faintly filled ring: where several overlap the fill deepens, so gaps and
  // doubled-up cover show at a glance while you place one.
  drawReach(vx: number, vy: number, key: string, cx: number, cy: number, w: number, h: number, planned: boolean) {
    const ctx = this.ctx, gx = (cx + w / 2) * CELL, gy = (cy + h / 2) * CELL, r = this.reachOf(key, 0, gx, gy), lift = this.terrain.lift(gx, gy);
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) { const a = (k / 64) * Math.PI * 2, [sx, sy] = toScreen(gx + Math.cos(a) * r, gy + Math.sin(a) * r); k ? ctx.lineTo(sx - vx, sy - lift - vy) : ctx.moveTo(sx - vx, sy - lift - vy); }
    ctx.fillStyle = planned ? 'rgba(126,224,138,0.12)' : 'rgba(216,212,200,0.08)'; ctx.fill();
    ctx.strokeStyle = planned ? 'rgba(126,224,138,0.9)' : 'rgba(216,212,200,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  }
  // your other defences near where one is being placed: their reach too, to see how the new one overlaps them
  drawNeighbourReach(vx: number, vy: number, key: string, cx: number, cy: number) {
    const far = (RADAR_CANNON * 3) / CELL;
    for (const o of this.blds) if (o.team === 0 && DEFENCE[o.type] && o.dying < 0 && Math.hypot(o.cx - cx, o.cy - cy) < far) this.drawReach(vx, vy, o.type, o.cx, o.cy, o.w, o.h, false);
  }
  drawPlacement(vx: number, vy: number) {
    if (!this.placing || !this.inView(this.mouse.y)) return;
    if (this.placing.key === 'line') { this.drawLinePlan(vx, vy); return; }
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
      if (DEFENCE[d.key]) { this.drawNeighbourReach(vx, vy, d.key, cx, cy); for (const [x, y, fine] of cells) if (fine) this.drawReach(vx, vy, d.key, x, y, d.w!, d.h!, true); }
      for (const [x, y, fine] of cells) foot(x, y, fine);
      const [lx, ly] = toScreen((cx + d.w! / 2) * CELL, cy * CELL);
      const cols = new Set(cells.map((c) => c[0])).size, rows = new Set(cells.map((c) => c[1])).size;
      text(ctx, `${cols} X ${rows}  ${good} ${d.name.toUpperCase()}  $${good * d.cost}`, Math.round(lx - vx) + 10, Math.round(ly - vy) - 22, this.prod.credits >= good * d.cost ? C.gold : C.bad, 1, C.ink);
      return;
    }
    if (DEFENCE[d.key]) { this.drawNeighbourReach(vx, vy, d.key, cx, cy); this.drawReach(vx, vy, d.key, cx, cy, d.w!, d.h!, true); }
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
    if (u.cargo >= SCRAP_LOAD && !u.unloading && yards0.some((b) => this.reach(u.x, u.y, b) < 42)) { u.path = []; u.goal = null; u.unloading = true; } // at the yard on any side, within a square and a half (its front could be up a cliff from where it parks: it used to sit there full for good)
    if (u.path.length || u.goal) return; // busy following an order or a route
    const yards = this.blds.filter((b) => b.team === u.team && b.type === 'scrapyard' && b.rise >= 1 && b.dying < 0);
    if (!yards.length) return;
    if (u.unloading) {
      const amt = Math.min(UNLOAD_RATE * dt, u.cargo);
      if (u.cargo >= SCRAP_LOAD && u.team === 0) audio.fx('scrap', u.x, u.y, 0.5); // (as the load starts tipping out)
      u.cargo -= amt; this.prods[u.team].credits += amt;
      if (u.cargo <= 0) { u.cargo = 0; u.unloading = false; }
      return;
    }
    if (u.cargo >= SCRAP_LOAD) {
      if ((u.scan -= dt) > 0) return; // a yard it can't reach yet: try again in a second, not every frame
      u.scan = 1;
      const yard = yards.reduce((a, b) => (this.reach(u.x, u.y, a) < this.reach(u.x, u.y, b) ? a : b));
      if (this.pathBudget <= 0 || pathStats.work > PATH_WORK) { u.scan = 0.1; return; } // this frame's route planning is spent: next frame
      const ring: [number, number][] = []; for (let y = yard.cy - 1; y <= yard.cy + yard.h; y++) for (let x = yard.cx - 1; x <= yard.cx + yard.w; x++) if (x < yard.cx || y < yard.cy || x >= yard.cx + yard.w || y >= yard.cy + yard.h) ring.push([x, y]);
      ring.sort((p, q) => Math.hypot((p[0] + 0.5) * CELL - u.x, (p[1] + 0.5) * CELL - u.y) - Math.hypot((q[0] + 0.5) * CELL - u.x, (q[1] + 0.5) * CELL - u.y));
      const side = ring.find(([x, y]) => t.open(x, y, true) && this.room(x, y, true) >= ROOMY) ?? ring[0]; // the nearest side with open ground behind it (not a ledge cut off by a cliff)
      const bx = (side[0] + 0.5) * CELL, by = (side[1] + 0.5) * CELL; this.pathBudget--;
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
    for (const o of this.units) if (o !== u && !o.def.air && !o.ride) { claimed.add(t.idx(t.cellOf(o.x), t.cellOf(o.y))); if (o.type === 'harvester' && o.goal) claimed.add(t.idx(t.cellOf(o.goal[0]), t.cellOf(o.goal[1]))); } // scrap another salvager is heading for, or anyone is standing on (a soldier standing on the nearest patch used to stop a salvager beside it for good)
    for (let r = 1; r < N; r++) {
      let best = -1, bd = 1e9;
      for (let y = cy0 - r; y <= cy0 + r; y++) for (let x = cx0 - r; x <= cx0 + r; x += y === cy0 - r || y === cy0 + r ? 1 : 2 * r) { // just the ring's edge
        if (!t.inside(x, y)) continue;
        const i = t.idx(x, y);
        if (t.scrap[i] > 0 && !t.occupied[i] && !claimed.has(i) && !(u.team !== 2 && this.danger[u.team]?.[i])) { const dd = Math.hypot(x - cx0, y - cy0); if (dd < bd) { bd = dd; best = i; } }
      }
      if (best >= 0 && r > skip) {
        if (this.pathBudget <= 0 || pathStats.work > PATH_WORK) { u.scan = 0.1; return; } // this frame's route planning is spent: next frame
        const gx = ((best % N) + 0.5) * CELL, gy = (Math.floor(best / N) + 0.5) * CELL;
        this.pathBudget--; u.goal = [gx, gy]; u.path = findPath(t, u.x, u.y, gx, gy, true);
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
    if (btn === 0 && this.minimapHit(hx, hy) && this.aiming === 'attack') { const [x, y] = this.minimapPoint(); this.aiming = null; this.command(x, y, true); return true; } // an attack order aimed on the radar goes there
    if (btn === 0 && this.minimapHit(hx, hy) && this.aiming === 'guard') { const [x, y] = this.minimapPoint(); this.aiming = null; this.guardWith(this.groundAt(x, y), null, null); return true; } // or a guard post
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
