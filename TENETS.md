# Conquer: core tenets

This is what Conquer is for and the rules we judge every change by. If an idea breaks a tenet, change the idea or drop it. If a tenet is wrong, change it here first, on purpose.

## What we're making

A real-time strategy game of huge, coordinated wars. Empires sprawl across the whole map, thousands of units fight on fronts that matter, and it all reads at a glance. Think the calamity of Supreme Commander and the land-and-roads empire of Civilization, in crisp pixel art.

**The standing direction: more units, more buildings, more calamity.** The game should keep growing in variety and scale. Each new piece still has to pass tenet 3: a clear lane of its own and a fair answer.

## The tenets

1. **Calamity at scale.** Hundreds of buildings, thousands of units, battles on several fronts at once. Every system has to work at that size, so speed is a feature: a battle on screen stays smooth.

2. **Easy to pick up, steep to master.** A new player can win against an easy opponent with left-click, right-click and the build panel. Nothing needs a key, and nothing needs reading a manual. Depth comes from choices that compound, never from fiddly controls.

3. **Every piece has one clear lane.** Each unit and building has one job, things it beats and things it loses to. If two things do the same job, one goes. A new piece must name its lane, what it beats, what beats it, and what it replaces or why nothing does. (See the lanes below.)

4. **Every offence has a defence.** For every way to hurt someone there's an answer that costs about the same. Nothing is unanswerable. Stalemates can be broken, but not cheaply or quickly.

5. **The land is the empire.** Money comes from holding ground. Roads link it, and cut-off ground works at half rate. There should be good reasons to be everywhere on the map, not just on the line between bases.

6. **Coordinated, not random.** Outcomes come from decisions you can see and predict, not dice. Towns are laid out, defences form lines, armies form up. Luck never decides a fight.

7. **Building well pays, without homework.** Good play is rewarded by simple, automatic bonuses that make sense, like town centres, fortified lines and home ground. If a bonus needs explaining twice or adds a chore, it's wrong.

8. **One resource: money, with power as the limit.** Scrap, oil, land, towns, timber and captured sites all pay in money. Power is the juggle: generators are cheap to build but burn fuel, reactors cost more but run cheap, derricks and captured power plants are free, cut-off plants give half, and a shortage slows everything in step. No second currency.

9. **The computer plays fair and plays to win.** Same rules, costs and fog as you. It scouts, adapts its build to what it sees, holds ground, expands and coordinates attacks. It's a real challenge, never a cheat.

10. **Show, don't tell.** If something matters, you can see it on the map: borders, cut-off marks, town rings, attack pings, cursor words. Labels and tooltips say it in plain words.

11. **No civilian ever dies.** Civilians flee and shelter. War happens around them.

12. **Keep it simple.** Remove before adding. Fix the cause, not the symptom. Fewer, sharper pieces beat more, blurrier ones.

## The lanes

Everything has one job. This table is the source of truth; the in-game strong/weak text should match it.

### Units

| Unit | Job | Beats | Loses to |
|---|---|---|---|
| Rifleman | Cheap infantry, captures sites | Rocket soldiers | Grenadiers, scouts, armour |
| Rocket soldier | Anti-armour and anti-air on foot | Vehicles, aircraft | Riflemen, grenadiers, guard towers |
| Grenadier | Breaks infantry crowds and bunkers | Riflemen, rockets, bunkers | Scouts, vehicles, aircraft |
| Engineer | Takes over enemy buildings | Buildings | Anything armed |
| Infiltrator | Unseen spy: steals cash, blacks out power, or reveals their land | Rich, unwatched bases | Guard towers, scouts, radar (they spot it) |
| Scout buggy | Fast eyes, hunts infantry, finds oil, spots hidden units | Infantry, field guns, infiltrators | Rockets, tanks, gunships |
| Hovertank | Light flanker, the only unit that crosses water | Scouts, infantry, field guns | Tanks, rockets, gunships |
| Tank | All-round armour | Scouts, hovertanks, infantry | Rockets, juggernauts, gunships |
| Juggernaut | Heavy armour | Tanks, all ground but rockets | Rockets, gunships, rail towers |
| Field gun (artillery) | Outranges defences | Defences and crowds, with a spotter | Anything that reaches it |
| Flak truck | Mobile anti-air | Aircraft | Every ground unit |
| Gunship | Hunts units from the air | Every ground unit | Flak, rockets |
| Bomber | Breaks buildings from the air | Buildings | Flak, rockets (can't hit units) |
| Colossus (super) | Breaks armies | Armies and armour | Rocket swarms, rail towers |
| Tempest (super) | Breaks bases from the air | Buildings | Flak, rockets |
| Builder | Builds and repairs; a small gun for self-defence | A lone soldier or spy | Any real force |
| Salvager | Collects scrap | — | Everything |

### Defences

| Defence | Beats | Loses to |
|---|---|---|
| Guard tower | Infantry; spots hidden units nearby | Vehicles, artillery, aircraft |
| Emplacement | Vehicles | Infantry, artillery, aircraft |
| Flak tower | Aircraft | Every ground unit |
| Rail tower | Juggernauts, super-units | Infantry, artillery, aircraft |
| Battery | Far-off bases, with vision | Anything that reaches it |
| Shield dome | Shells and bombs | Power loss, units under the dome |
| Interceptor | Missiles | Everything else |
| Sandbag wall | Funnels attackers; across a road it's a roadblock | Heavy guns |

### Economy and support

| Building | Job |
|---|---|
| Field Command | Town centre and network heart: +25% nearby, radar, builders |
| Generator | Power, cheap to build, burns fuel |
| Fusion reactor | Big power, cheap to run, huge blast if destroyed |
| Scrapyard | Early income from scrap |
| Oil derrick | Steady money and power on struck oil |
| Foundry | Turns spare power into a little money |
| Paved road | Speed, and links ground into your network |
| Barracks, depot, airfield, proving ground | Make infantry, vehicles, aircraft, super-units |
| Hospital, workshop | Heal infantry, repair vehicles; unlock grenadiers and field guns |
| Radar tower | Wide vision so guns can see; spots hidden units in a wide ring |
| Armoury | Side-wide upgrades |
| Missile silo | Strategic missile, answered by interceptors |

### The map's big moments

- **The citadel** (the island in the middle): a big island behind a moat, with a wide shallow gate facing each side and roads through the gates to a ring round the uplink. Round the uplink sit a fuel depot, a repair yard and a comm tower for each side, and bunkers by the gates. Each is taken on its own, so the middle changes hands piece by piece instead of all at once.
- **Orbital Uplink** (the heart of the citadel): capture and hold it; every 3 minutes it charges an orbital strike you aim yourself. Everyone is warned a minute before and when it's ready. Interceptors can shoot the strike down.
- **Dams**: each lake has a hydro dam across its outlet, its stream running on below through a marked valley. Capture it with infantry for +400 free power (the biggest free source, half while cut off from your roads), so holding one is worth a fight and losing it hurts. Only explosives bring it down, and only on purpose (passing armies don't shoot it). Blow it on purpose and the valley floods, cutting roads, wrecking buildings and sweeping away ground units (hovercraft and aircraft escape). Fifteen seconds later the lake behind it runs dry: its bed is open mud for good, a new way across the map.
- **Bridges**: each bridge belongs to nobody and anyone may blow it, but only with explosives (shells, rockets, bombs, chain explosions; bullets just chip it). It falls into the river with whatever is on it, leaving broken timbers on each bank. Any side's builder can rebuild it where it stood ($1,200). Hard and brutal drop a bridge under an enemy force crossing it, and every level rebuilds a fallen bridge near its own ground.
- **Winter** (the map evolves on a schedule, never at random): every twenty minutes, announced a minute ahead, rivers, lakes and the moat freeze for four minutes and can be crossed anywhere, so choke points vanish and every bank needs watching. Thirty seconds before the thaw the ice cracks (everyone is told); whoever is still on it falls through, hovercraft excepted.
- **Chain explosions**: derricks, generators and charged silos explode when destroyed and can set off their neighbours. Space your power.
- **The land makes sense**: water runs downhill along the real lie of the ground, round plateaus and through low valleys, in sweeping curves to a river, another lake or the map's edge. Roads cross a stream once, at a ford. Woods grow thicker on sunny south-facing slopes and thinner on shaded ones. `node tools/check-maps.mjs` checks these rules on every map.
- **Forest fires**: heavy blasts can light woods; fire spreads, burns out cover and hurts those inside, then dies.
- **Cratered roads**: heavy hits break paved roads and cut off what's beyond until a builder patches them.
- **Occupation**: land under enemy soldiers doesn't pay.
- **Named battles**: big clashes are named after the place, tallied live, and end with a war report.

### Winning

Field Commands are an empire's hearts. Lose your last one and a **last stand** begins: everyone sees a one-minute countdown, and you must build or take a Field Command before it runs out, or you're beaten and your remaining troops surrender. Games end when the hearts fall, not when the last shed is hunted down. (Before a side's first Field Command stands, it's beaten only with no buildings and no builder left.)

### Commanding

Command divisions, not soldiers. Select units and press FORM DIVISION (or Ctrl+1 to 5). Each division gets a card on the side panel with its name (by what it's made of), size and strength; click the card or press its number to pick the whole division, and click again to go there. Turn on a division's + and new fighting units from your factories join it, marching out in groups of six. Divisions replace the old control groups; you never need them to win.

An attack on something far off marches the army there together in formation, at its slowest member's pace and fighting what's in the way, then everyone strikes at once, so nobody arrives alone to be picked off. Units that can barely hurt a target say so: WEAK by the cursor before you order it, and a word on what would work after.

Builders work from one build queue, like divisions: place sites and they're done in the order you placed them (Shift places several). A free builder takes the next one, wherever it is; a waiting site shows its place in line on a little flag. Builders you select start a site at once, and one you send somewhere rests there 15 seconds before going back to the queue. With the queue empty they patch up damage nearby. A site nobody has started in five minutes is cleared away (it cost nothing yet), and you're told.

### Difficulty

The computer never gets extra money or speed, and it only knows what its side has seen: it scouts to find your buildings, judges danger by the defences and troops it has spotted, and fires strikes only at what it knows is there. Levels differ only in how well it plays: how fast it reacts, the size and timing of its attacks, whether it uses flanks and pincers, whether it prepares for what you could do (anticipation), whether it remembers your habits from earlier games (learning), how hard it scouts, and whether it uses dams and spies. Easy is loose, stubborn and forgiving; brutal is fast, wide-awake and ruthless.

Every level above easy fights like a general: it keeps every factory busy, sends reinforcements to an attack that's going well (in strength, not in dribs), answers a raid on any outpost, presses harder once it can see it outnumbers you, and cuts its losses when an attack turns (the better it is, the sooner). Hard and brutal post a small watch at a dam and blow it when they see your army or buildings in the valley.

### Concealment

Riflemen, rocket soldiers, grenadiers and field guns standing still in forest are hidden until they shoot or an enemy comes within a couple of squares. Infiltrators are always hidden. Scouts and guard towers spot hidden units within 6 squares, radar towers within 12. This makes ambushes, not a new piece.

### On the map (neutral, worth taking)

Town halls, fuel depots, power plants, hydro dams (which can also be blown), comm towers, repair yards, motor pools, recruitment offices, watchtowers and bunkers are captured with infantry. Supply crates and derelict war machines go to whoever reaches them first.

**Marauders** (purple) are hostile to everyone and never build, expand or roam. Their guns dig in around the richer prizes (three at a fuel depot, two at a power plant or motor pool, one at a comm tower, repair yard or recruitment office; town halls are left in peace), so taking one needs a real force rather than a few riflemen. A few **marauder camps** (two guns and a small squad) sit near scrap, oil and river crossings away from the middle, and pay a $1,500 bounty to whoever clears them. Everything is placed in the map's symmetric sets, so every side faces the same.

## Checks for every change

Run the ones that apply before calling a change done.

- **Lanes.** Does the change blur two lanes or leave a piece with no job? Update the lanes table and the in-game strong/weak text together.
- **Duels.** For a combat change, run the equal-cost duel grid: every unit against every unit at the same money. The "beats" column must win and the "loses to" column must lose. Do the same for defences against units.
- **Computer vs computer.** For an economy, map or AI change, run a 25-minute match and compare with the baseline below. Watch for one side running away, money piling up unspent, or the map staying empty.
- **Speed.** For anything that runs every frame, check a big battle on screen stays smooth (about 3,000 units at roughly 16 ms a frame).
- **Played, not just built.** Check it works in the game. Say plainly what wasn't checked.

### Baseline (computer vs computer, 1v1, largest map, normal, minute 30)

| Measure | Now | Want |
|---|---|---|
| Units on the map | about 400 | Thousands |
| Units built, each side | 340–410 | Far more |
| Army, each side | 170–180 | Hundreds, then thousands |
| Map held, each side | 8–11% | Rising; most of the map contested late |
| Field Commands, each side | up to 13 on the largest map (11 large, 8 medium) | Several hubs, each a growing town |
| Buildings, each side | 130–145 | Hundreds |
| Money unspent | $2,000–4,000 (was $7,000–9,000) | Near zero: money becomes army |
| Power made vs used | about 1.7 to 1 (fuel about $20/s by minute 25; brief shortages) | Tight: a real juggle while scaling |
| Decisive swings | by minute 40 one side pulls clearly ahead (13 hubs to 9, twice the army) | Games get decided, not stalemated |
| Update time | about 3 ms; rare spikes | Smooth with thousands of units |

### Difficulty ladder (computer vs computer, largest map, with the last-stand rule and the citadel)

| Match | Result | Hubs | Army value | Units lost |
|---|---|---|---|---|
| Easy vs normal | Normal wins: easy's last stand runs out at minute 41 | 2 vs 9 (minute 38) | $1k vs $218k (minute 38) | 321 vs 150 |
| Normal vs hard | Hard ahead (minute 29), holding the citadel | 7 vs 10 | $110k vs $130k | 91 vs 132 |
| Hard vs brutal | Brutal ahead (minute 39): more hubs, buildings and uplink time, fewer losses | 7 vs 11 | $85k vs $66k | 370 vs 300 |

Each level beats the one below, without extra money, speed or hidden knowledge. Want: brutal ahead on army too, and knockouts between the closer levels.

Update these tables when a change moves the numbers on purpose.

## Not doing (for now)

- **Naval units.** Not yet.
- **A second resource.** See tenet 8.
- **Factions.** Proposed (three sides with their own style), waiting on a decision.
