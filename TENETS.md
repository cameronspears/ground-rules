# Ground Rules: core tenets

This is what Ground Rules is for and the rules we judge every change by. If an idea breaks a tenet, change the idea or drop it. If a tenet is wrong, change it here first, on purpose.

## What we're making

A real-time strategy game of huge, coordinated wars. Empires sprawl across the whole map, thousands of units fight on fronts that matter, and it all reads at a glance. Think the calamity of Supreme Commander and the land-grabbing empire of Civilization, in crisp pixel art.

**The standing direction: more units, more buildings, more calamity.** The game should keep growing in variety and scale. Each new piece still has to pass tenet 3: a clear lane of its own and a fair answer.

## The tenets

1. **Calamity at scale.** Hundreds of buildings, thousands of units, battles on several fronts at once. Every system has to work at that size, so speed is a feature: a battle on screen stays smooth.

2. **Easy to pick up, steep to master.** A new player can win against an easy opponent with left-click, right-click and the build panel. Nothing needs a key, and nothing needs reading a manual. Depth comes from choices that compound, never from fiddly controls. The front door holds only Continue, Learn to Play, New Game and Sound; New Game opens the game's choices (enemy, opponents, map, money, mode (including Front Line), hints), each explained as you point at it, with a suggestion for a first game. In a game the menu holds only what makes sense there (resume, save, restart, sound, quit). LEARN TO PLAY on the title menu walks a first game one step at a time (build, train, capture, fight) with what to click glowing gold, while the enemy waits; and holding the mouse over anything says what it does in plain words.

3. **Every piece has one clear lane.** Each unit and building has one job, things it beats and things it loses to. If two things do the same job, one goes. A new piece must name its lane, what it beats, what beats it, and what it replaces or why nothing does. (See the lanes below.)

4. **Every offence has a defence.** For every way to hurt someone there's an answer that costs about the same. Nothing is unanswerable. Stalemates can be broken, but not cheaply or quickly.

5. **The land is the empire.** Money comes from holding ground. Your buildings are the network: each finished one links to any of yours within six squares, and claims the land around it (a site claims nothing until it's built), so building outward stretches the border. Field Commands are the big hearts; a captured site (town hall, depot, plant, dam and so on) is a small one, claiming the land round it and linking your buildings nearby, so taking prizes far out grows the empire. A building too far from the rest is cut off and works at half rate. There should be good reasons to be everywhere on the map, not just on the line between bases. Every side starts with its Field Command, Generator and Scrapyard standing (the opening used to be putting those up, with no choices in it), and land pays two and a half times as much at the start, easing to its usual rate by minute 8, so the opening is about getting going, not waiting for money.

6. **Coordinated, not random.** Outcomes come from decisions you can see and predict, not dice. Towns are laid out, defences form lines, armies form up. Luck never decides a fight: when to fight, from where, and getting veterans out alive do.

7. **Building well pays, without homework.** Good play is rewarded by simple, automatic bonuses that make sense, like town centres, fortified lines and home ground. If a bonus needs explaining twice or adds a chore, it's wrong.

8. **One resource: money, with power as the limit.** Scrap, oil, land, towns and captured sites all pay in money. Power is a simple limit: generators are cheap and small, reactors big, derricks and captured power plants free, cut-off plants give half, and a shortage slows everything in step. No second currency.

9. **The computer plays fair and plays to win.** Same rules, costs and fog as you. It scouts, adapts its build to what it sees, holds ground, expands and coordinates attacks. It's a real challenge, never a cheat. (The one exception is a game mode the player picks on purpose; see Game modes.)

10. **Show, don't tell.** If something matters, you can see it on the map: borders, newly won ground glowing with what it earns, cut-off marks, town rings, attack pings, cursor words. Labels and tooltips say it in plain words.

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
| Scout buggy | Fast eyes, hunts infantry, finds oil, spots hidden units; SCOUT (C) sends it exploring on its own, out of fights, home when hurt | Infantry, field guns | Rockets, tanks, gunships |
| Tank | All-round armour | Scouts, infantry | Rockets, juggernauts, gunships |
| Juggernaut | Heavy armour | Tanks, all ground but rockets | Rockets, gunships, emplacements |
| Field gun (artillery) | Outranges defences; the siege's gun | Defences and crowds, with a spotter | Anything that reaches it |
| Flak truck | Mobile anti-air | Aircraft | Every ground unit |
| Gunship | Hunts units from the air | Every ground unit | Flak, rockets |
| Bomber | Breaks buildings from the air | Buildings | Flak, rockets (can't hit units) |
| Colossus (super) | Breaks armies | Armies and armour | Rocket swarms, emplacements |
| Builder | Builds and repairs; a small gun for self-defence | A lone soldier | Any real force |
| Salvager | Collects scrap; trained at the Scrapyard, where it unloads | — | Everything |

### Defences

| Defence | Beats | Loses to |
|---|---|---|
| Guard tower | Infantry; spots hidden units nearby | Vehicles, artillery, bombers |
| Emplacement | Vehicles, even the Colossus (it outranges them all); under its side's radar, field guns too | Infantry, aircraft; artillery once its radar is down |
| Flak tower | Aircraft (under its side's radar it reaches 300, so a few cover a base) | Every ground unit |
| Interceptor | The orbital strike | Everything else |
| Sandbag wall | Funnels attackers; across a road it's a roadblock | Heavy guns |

Defences reach far and cost to match, so a few cover a base: guard tower 140, flak tower 190, emplacement 200 (a tank reaches 112, the Colossus 148). Only the field gun (240) outreaches them all. But an emplacement inside its side's radar cover reaches 320, past field guns shelling the defences a few squares in front of it, so a fortress with radar can answer a siege: to break it, knock the radar out first (bombers, an orbital strike, a raid), then the guns win again. Flak towers under radar reach 300 too (190 without), so bombers fall before they drop and a few towers cover a whole base. No fifth defence: the radar is the fortress's eyes both ways. Guard squads go after whatever is shelling the ground they hold, even from outside their ring.

### Economy and support

| Building | Job |
|---|---|
| Field Command | Town centre and the network's big heart ($1,500): factories and oil within 9 squares work 25% faster, radar, builders. Makes no power (that's the Generator's lane) |
| Generator | Power, cheap and small |
| Fusion reactor | Big power, huge blast if destroyed |
| Scrapyard | Early income from scrap |
| Oil derrick | Steady money and power on struck oil |
| Barracks, depot, airfield, proving ground | Make infantry (riflemen, rockets and grenadiers, all from the start), vehicles, aircraft, super-units |
| Workshop | Unlocks heavy weapons: field guns, juggernauts, the reactor and the proving ground; repairs vehicles parked beside it |
| Radar tower | Early warning: every enemy within 30 squares shows as a blip on each sweep (not what it is, and no fog lifts); field guns fire on blips; spots hidden units within 12 |

### The map's big moments

- **Three fronts**: the middle and a flank either side, so armies split up instead of meeting in one blob. Nothing walls them in; the land between stays open and worth taking.
- **The citadel** (the island in the middle): a big island behind a moat, open on every side: wide shallow gates facing each base, and on the flanks the rivers' mouths run shallow into the moat, so it can be entered from either bank. Roads run in through the gates to a ring round the uplink. Round the uplink sit a comm tower for each side and a bunker by each gate. Each is taken on its own, so the middle changes hands piece by piece instead of all at once.
- **Flank compounds**: halfway between each pair of neighbouring bases (two on a duel map, four for four players), a fuel depot, a repair yard and a power plant in a line, clear of towns and roads, guarded lightly by two marauder guns at the depot (worth a real push, not a siege). The rivers that divide the sides bend round them, so each sits on one side's bank, with river crossings close by for the other side.
- **Orbital Uplink** (the heart of the citadel): capture and hold it; every 3 minutes it charges an orbital strike you aim yourself. Everyone is warned a minute before and when it's ready. Interceptors can shoot the strike down.
- **Dams**: each lake has a hydro dam across its outlet, its stream running on below through a marked valley. Capture it with infantry for +400 free power (the biggest free source, half while cut off from your network), so holding one is worth a fight and losing it hurts. Only explosives bring it down, and only on purpose (passing armies don't shoot it). Right-click it with soldiers to capture it; to blow it, press ATTACK and click it (a few tanks take about 20 seconds; your own dam is never a target). Blow it on purpose and the valley floods, cutting roads, wrecking buildings and sweeping away ground units (aircraft escape). Fifteen seconds later the lake behind it runs dry: its bed is open mud for good, a new way across the map.
- **Bridges**: each bridge belongs to nobody and anyone may blow it, but only with explosives (shells, rockets, bombs, chain explosions; bullets just chip it). It falls into the river with whatever is on it, leaving broken timbers on each bank. Any side's builder can rebuild it where it stood ($1,200). Hard and brutal drop a bridge under an enemy force crossing it, and every level rebuilds a fallen bridge near its own ground.
- **Day and night** (looks only, never rules): one full day every twelve minutes, starting mid-morning. The light moves from pink dawn to plain midday, golden sunset and a blue moonlit night where fires, blasts, gunfire, tracers and buildings glow, vehicles drive with their lights on but black out in a fight, and fights send up flickering white flares that light the ground and throw swaying shadows (all just for show). Night never hides anything: sight, fog and every unit stay exactly as by day, health bars and selection are never tinted, and glows in the fog stay hidden. Buildings and trees are baked under a morning, noon and evening sun and blend between them, units are lit from overhead so they suit any hour, mountains are lit by the same three suns, cliffs and mountains cast soft shadows across the ground, and every shadow swings with the sun: long at sunrise, gone as it passes overhead, long the other way at sunset. It's one tint over the view, shadows re-aimed every second or so and the land's shadows worked out a sliver a frame, so it costs about half a millisecond a frame.
- **Chain explosions**: derricks and generators explode when destroyed and can set off their neighbours. Space your power.
- **The land makes sense**: water runs downhill along the real lie of the ground, round plateaus and through low valleys, in sweeping curves to a river, another lake or the map's edge. Roads belong to the towns: one main road loops round the map through them, clear of the bases and the citadel, with a side street into each town. Roads cross a stream once, at a ford. Woods grow thicker on sunny south-facing slopes and thinner on shaded ones. `node tools/check-maps.mjs` checks these rules on every map.
- **Forest fires**: heavy blasts can light woods; fire spreads, burns out cover and hurts those inside, then dies.
- **Occupation**: land under enemy soldiers doesn't pay.

### Winning

Field Commands are an empire's hearts. Lose your last one and a **last stand** begins: everyone sees a one-minute countdown, and you must build or take a Field Command before it runs out, or you're beaten and your remaining troops surrender. Games end when the hearts fall, not when the last shed is hunted down. (Before a side's first Field Command stands, it's beaten only with no buildings and no builder left.)

### Commanding

Command divisions, not soldiers, and never sort them by hand. A division's ATK button sends it to attack on its own: it marches on the nearest enemy it knows of (or toward the enemy's home ground to find them) and keeps pushing, fighting along the way, with new troops joining it at the front; click it again, or give it any order, to stop. So you can fortify, let an army grow, and press ATK when you're ready. Every new fighting unit joins a company of up to 8 from its kind of factory (infantry, armour, air, super-heavy), and companies make up divisions: the 1st takes new troops until it holds 32, then the 2nd starts, up to five. A company worn below three folds into a sister company. A division follows where its units really are: when its veterans end up in two groups more than 30 squares apart (8 or more in each), the far group becomes a division of its own (if a card is free), and an oversized one splits off its far group; troops still marching to join don't count. Each division has a card on the side panel with its name (by what it's made of), size and strength, and a chip for each company under it: click a card (or press 1 to 5) to pick the whole division, a chip to pick one company, and click again to go there. New troops march out to their division in groups of six. A division's + moves where new troops go, and FORM DIVISION makes one from what's selected, but you never need either.

The challenge is the enemy, not admin work. The mouse is all you need: the pause card lists the mouse first and a few optional keys after. Every unit is bought from the ARMY tab without finding its factory (click to add one, right-click to take that one off); KEEP BUILDING sends each finished fighting unit back on its factory's queue, and the ARMY tab blinks while a factory stands idle. Each unit trains where it belongs: builders at the Field Command, salvagers at the Scrapyard, soldiers at the Barracks, vehicles at the Depot.

Any group order moves each cluster of units that's actually together, each kind at its own slowest member's pace: soldiers march together, vehicles (with soldiers riding on them) drive together, aircraft fly together, and the Colossus walks alone (one slow soldier used to hold a whole army, gunships and all, to a walk; a far-off group never slows the rest either), and a plain move still ends in formation: armour in front, soldiers behind, guns, flak and helpers at the back. A slot across water or up a cliff from the spot clicked is pulled in until the way is open (a big army's wide formation used to send a few units the long way round). Soldiers who rode there hop off and walk to their own place in the soldiers' row. On the way, any of your units standing about shuffles aside for one driving through (the front row used to inch through the parked guns behind it for 10 to 25 seconds), units meeting head-on all keep right, drifting over when there's no room to swerve (two armies on one bridge sort into two lanes), a unit only gives up on an order when a full search finds no way there, never because of a traffic jam, and one whose spot is walled off stops at the nearest point instead of standing there re-planning; water or rock clicked forms the group up at the nearest point it can reach. A salvager unloads from any side of its yard (a yard on a ledge used to leave them parked full beside it, retrying a route up the cliff every second). `tools/pathbench.js` scores all of this against the quickest possible drive. Your attack on something far off is a mission: each group pushes straight there at its own pace, firing on whatever is in reach on the way, and each unit strikes the target the moment it arrives or has it in reach (no gathering point, no formation slots, nobody standing about waiting to be picked off); a red line and crosshair show what the selected units are attacking, an amber one where they're fighting their way to. A then a click on an enemy attacks it, like a right-click. Every order fights on the way: on a plain right-click or ATTACK (A, then a click), every armed unit turns aside to fight any enemy it can see within 4 squares past its reach, then carries on to where it was sent (stopping to fight never counts as being stuck), so no order drives past a fight. RETREAT is the way to pull out without fighting. ATTACK differs only on a dam (it blows it) and on a long march by a big group (no formation at the end); and an idle unit goes out to meet an enemy it can see within 9 squares, never straying more than 12 from its spot, then comes back. The computer's waves still gather and strike together. A unit ordered from a selected factory comes out of that factory. On a long march soldiers ride on the outside of the group's vehicles, as many as there are seats (tank 4, juggernaut 6, scout and flak 2), so the march goes at vehicle speed; the rest walk. Riders can't shoot and are exposed: a hit hurts them and knocks them off. On an attack the riders' vehicles wait at the gathering point for the walkers, then everyone strikes together, and once the target falls they press on to finish what's there. The computer rides by the same rules: when some of a wave must walk, the whole wave meets at a gathering point short of its target and goes in together. Units that can barely hurt a target say so: WEAK by the cursor before you order it, and a word on what would work after.

Keeping units alive is the core skill, not throwing them in. Units earn ranks (gold chevrons) by dealing damage: a rank for dealing their own health or price in damage (whichever is more, so a cheap rocket soldier doesn't make veteran on its first hit), then three and eight times it. Each rank hits 10% harder and takes hits 10% better, and veterans patch themselves up; division cards show how many each holds. RETREAT (R) pulls the selected units out: they stop shooting and run for the nearest Field Command or repair yard, a fifth faster and a quarter harder to hit, to heal on home ground, keeping their ranks. Where you fight counts: a vehicle hit in the side takes +25% and from behind +50% (FLANKED shows over it; not while retreating), and anything on a plateau reaches 15% further. The computer plays by the same rules: it weighs veterans when judging a fight, pulls a losing or seasoned wave back with the same retreat, and holds at home when clearly outnumbered. GUARD (G) then a click puts the selected units on guard: on a spot or one of your buildings they hold the middle and go straight to any enemy inside the ring round it, or to anything there being hit, then return (from the middle no part is far off); drag a line instead and they patrol it. Select one to see what it guards. SCOUT (C) sends scouts exploring on their own; new scouts start out that way, outside any division. Any new order ends either.

Builders work from one build queue, like divisions: place sites and they're done in the order you placed them. Drag with a building picked to lay out a row or a block of it, a square apart (walls drag as a line); Shift keeps the building picked. Placing a defence shows its reach and your nearby defences', so overlaps and gaps show. DEF LINE (on the BASE tab, once you have a Barracks) lays a whole defence line in one drag along your border, curves and all: just enough defences that every square of the line is inside the reach of a guard tower, a cannon and a flak tower, two squares deep (attackers are under fire before they reach it), with sandbags between, a gap wherever a road crosses and a two-square gate after every 20 solid squares, so your own army gets out. Each tower is put as far along as it can go and still close the gap, defences you already have count, and radar's longer reach means fewer. What you've seen of the enemy lately adds to it: every stretch under two flak towers once you've seen aircraft, and under two cannons once you've seen armour. Cannons need a Depot. Against the first version (a tower every 6 squares in a fixed mix) on the same lines: that left up to a quarter of the line open to infantry and over half to aircraft; this covers all of it against everything, for about a quarter more money without radar, and a little less with radar (flak under radar reaches 300, so it needs far fewer). Aircraft are the owner's biggest threat, so flak is always in the line. The preview shows every piece, the reach, the price and the power it'll use; let go and the defences join the queue in order, then the sandbags. It's a shortcut, not a new piece: placing towers one by one still works. Builders are loyal to a base: each works for the Field Command that trained it (or the nearest one), takes jobs within 20 squares of it, and drives back there when it has nothing to do; a site out past every base goes to the builders of the nearest one, and builders you select and send go wherever you send them. Within that, a free builder takes the job it's best placed for, weighing distance against place in line (a site next door beats the oldest one across the map); it won't set out on a long trip to a site a busy builder nearby will reach sooner, and lends a hand only close by. A builder that can't reach a site leaves that site be for a minute, but only for itself; a site is set aside for everyone only when two builders couldn't get there. A waiting site shows its place in line on a little flag. Builders you select start a site at once, and one you send somewhere rests there 15 seconds before going back to the queue. With the queue empty they patch up damage nearby. A site nobody has started in five minutes is cleared away (it cost nothing yet), and you're told.

### Game modes

Fun is why we're building this, and each mode is a different kind of game with one clear promise, not a slider. New Game shows them all at once, a card each (a picture, the name, a few words: STANDARD "THE FULL WAR", SANDBOX "BUILD ANYTHING", BLITZ "10-MINUTE WAR", MAYHEM "HUGE ARMIES", FRONT LINE "WAVE ON WAVE", NIGHTMARE "SURVIVE"), with what the pointed-at one means underneath; the left and right arrow keys step through them. (It was one MODE button clicked through, and most players never saw what there was.) A mode game opens on a title card with its goal and names itself in the sidebar's header all game, with the mode's rules on hover. Saves keep the mode; Learn to Play is always standard. Modes are one table (`MODES` in `src/game.ts`), never separate switches. Standard is the game as designed, and the only one the balance, the baselines and tenet 9 cover. A new mode must be a different kind of game with its own promise; Outnumbered was cut as a milder Nightmare.

| Mode | Promise | What changes |
|---|---|---|
| Sandbox | Build anything | Your money never runs out, you build and train 20 times as fast, every building is unlocked from the start, and there's no fog |
| Blitz | A 10-minute war | Everything runs three times as fast for every side, and a clock in the header counts down ten real minutes: when it runs out, whoever holds the most land wins (a warning at one minute). Speed only; size is Mayhem's |
| Mayhem | Huge armies | Every unit anyone trains comes out as three, at the same price |
| Front Line | Wave on wave | A different war on its own valley map: no building or money, the same random wave for both sides every 30 seconds (see Front Line below) |
| Nightmare | Survive | The enemy earns triple, starts with twice your money and hits half again as hard, and you get no last stand. A survival clock in the header shows how long you've lasted; your best time is kept, and beating it says so |

### Front Line (prototype)

A different war on a different map, the way ARAM is to League of Legends: a choice on MODE (which hides MAP, OPPONENTS and MONEY, as the valley, the one enemy and the no-money rule are fixed; it doesn't combine with another mode). One long valley from base to base between two mountain walls (the normal map squeezed into a strip: `FRONT` in `src/terrain.ts`), its floor levelled (no ridges, crags or cliffs: in a valley this narrow they walled the way off, and plateau edges blocked units without looking like walls), against one enemy, with no marauders (their guns turned the middle into a fortress nobody could pass). No builders, no money, no power: each side has only its Field Command, three times as tough as usual. Every 30 seconds both sides get the same random wave (bigger as the game goes on; every tenth wave a Colossus each), at their capturable site closest to the enemy, so taking sites brings your waves in further forward. The first Field Command to fall loses (no last stand). Saves keep it.

**Call-ins.** Points come from the fighting, an eighth of a unit's price to each side: to the troops that destroy it (call-in kills earn nothing, or a barrage paid for the next) and to the side that loses it, so whoever is behind still gets help. (Each kill used to pay its full price to the killer alone, and a side that got ahead snowballed: a call-in every 30 seconds late on; now about one every two minutes each, first around minute 5.) Spent from the sidebar: REINFORCE (1,200: two tanks, two riflemen, two rocket soldiers at your most forward site), BARRAGE (1,500: shells rain on a spot you click) and ORBITAL STRIKE (4,000: the uplink's blast, which only dents a Field Command). The enemy earns and spends points by the same rules.

**The enemy.** No full computer player: a small mind every 4 seconds (`frontThink` in `src/game.ts`). It gathers its waves at its forward site until it's stronger than what it can see of yours, then attacks (two soldiers take each site on the way, the rest drive at your most forward site), and carries on until it's clearly losing. It turns back when you threaten one of its sites, and always when you reach its Field Command. It fires barrages and orbital strikes where your troops bunch up (at most one call-in every 15 seconds) and buys reinforcements with what's left. It counts only what its own troops and buildings can see. Easy just pushes and never calls in; harder levels attack sooner.

Not yet: map checks for the valley (`tools/check-maps.mjs` covers only the normal maps).

### Difficulty

The computer never gets extra money or speed, and it only knows what its side has seen: it scouts to find your buildings, judges danger by the defences and troops it has spotted, and fires strikes only at what it knows is there. Levels differ only in how well it plays: how fast it reacts, the size and timing of its attacks, whether it uses flanks and pincers, whether it prepares for what you could do (anticipation), how hard it scouts, and whether it uses dams. Easy is loose, stubborn and forgiving; brutal is fast, wide-awake and ruthless. Easy also runs its base at a person's pace, not a machine's: one new building every 45 seconds and one unit at a time per factory; and it attacks gently: its first wave comes at minute 10, then one every 5 minutes, each only the planned size (6, growing by 3 every two and a half minutes) while the rest of its army stays home, with no more than 4 field guns. (Every other level throws everything it has at you when it attacks.) (left at full machine pace it had 28 buildings by minute 5, which no new player can match).

Every level above easy fights like a general: it keeps every factory busy, sends reinforcements to an attack that's going well (in strength, not in dribs), answers a raid on any outpost, presses harder once it can see it outnumbers you, and cuts its losses when an attack turns (the better it is, the sooner). Its first wave goes for the citadel, so the first fight comes in the middle, not at your door (sooner the higher the level; easy stays slow). Hard and brutal post a small watch at a dam and blow it when they see your army or buildings in the valley.

### Concealment

Riflemen, rocket soldiers, grenadiers and field guns standing still in forest are hidden (sight ranges are fixed: nothing on either side ever sees further) until they shoot or an enemy comes within a couple of squares. Scouts and guard towers spot hidden units within 6 squares, radar towers within 12. This makes ambushes, not a new piece.

### On the map (neutral, worth taking)

Town halls, fuel depots, power plants, hydro dams (which can also be blown), comm towers, repair yards, motor pools, recruitment offices, watchtowers and bunkers are captured with infantry. Held, every site but a watchtower or bunker is a small heart of your network: it claims the land round it and links your buildings within reach. Supply crates ($800) and derelict war machines go to whoever reaches them first. The first crates fall round the citadel, the same distance from every base, so there is something to race for from the first minute.

**Marauders** (purple) are hostile to everyone and never build, expand or roam. Their guns dig in around the richer prizes (three at a fuel depot, two at a power plant or motor pool, one at a comm tower, repair yard or recruitment office; town halls are left in peace), so taking one needs a real force rather than a few riflemen. A few **marauder camps** (two guns and a small squad) sit near scrap, oil and river crossings away from the middle, and pay a $1,500 bounty to whoever clears them. The computer goes after the camps and guns it has found (never ones it hasn't seen) with a real force sized to what it saw there: at least eight fighters, no flak trucks, scouts or builders. Everything is placed in the map's symmetric sets, so every side faces the same.

## Checks for every change

Run the ones that apply before calling a change done.

- **Lanes.** Does the change blur two lanes or leave a piece with no job? Update the lanes table and the in-game strong/weak text together.
- **Duels.** For a combat change, run the equal-cost duel grid: every unit against every unit at the same money (`tools/duel.js`: in the running game, `const D = await import('/tools/duel.js')`, then `D.setup()`, `D.runAll([...unit keys])` and `D.grid()`). The "beats" column must win and the "loses to" column must lose. Do the same for defences against units. Last grid (balance pass, Nov 2026; $2,400 a side, a Colossus at its own price): every lane holds in a straight fight. Rockets beat every vehicle and aircraft; riflemen beat rockets but lose to grenadiers, scouts, armour and an equal-money mixed force; the juggernaut is no longer the best buy (rockets now stop it); the Colossus beats armour and crowds but loses to rockets, a mixed army with rockets, and 12 emplacements (6 aren't enough); bombers only aim at buildings. Guard towers beat gunships (gunships are weak against buildings), so a tower loses to bombers, not all aircraft. Rechecked after veterancy from damage, retreat and side, rear and high-ground hits came in: all 33 beats/loses pairs in the lanes table still hold. Owner feedback pass (Nov 2026: rockets $125 and ranked by price, the Colossus 12,000 health, speed 18 and a heavier gun, tanks and flak trucks 36, juggernauts 22, gunships 80, bombers 66; `tools/rocketcheck.js`): rockets still beat tanks and juggernauts but keep 22% and 12% of their value (was 53% and 57%); the Colossus beats tanks, juggernauts, riflemen and a mixed force, and loses to its own price in rockets only just (they keep 3%, was 72%).
- **Computer vs computer.** For an economy, map or AI change, run a 25-minute match and compare with the baseline below (`tools/match.js` records armies, land and what each side lost, where and on which job). Watch for one side running away, money piling up unspent, or the map staying empty.
- **Speed.** For anything that runs every frame, check a big battle on screen stays smooth (about 3,000 units at roughly 16 ms a frame).
- **Saves.** A new field on a unit or building is saved on its own. A new field on the Game that play changes goes in `SAVED` (game.ts); a new way play changes the map must be repainted in `restore()`. Then save at about minute 20 on the largest map, reload, and check the numbers match. Baseline: minute 30, about 840 units, 11 ms to save, 121 KB.
- **Played, not just built.** Check it works in the game. Say plainly what wasn't checked.

### Baseline (computer vs computer, 1v1, largest map, normal, minute 30)

Latest: maps 4242 and 777 after every fighting unit and the towers that answer them were halved in price (bigger armies for the same money), the first wave started racing for the citadel, and chasing units stopped re-planning the same route every second; rows not re-measured keep the older figures. Checked again after cutting the battery, shield dome, engineer, armoury and hospital (maps 4242 and 777): armies 300–463 each at minute 30, 14–16 Field Commands each, every marauder camp cleared by minute 23–28, about 2 ms an update; inside the ranges below, so the table stands.


| Measure | Now | Want |
|---|---|---|
| Units on the map | 670–730 (was 350–380 just before) | Thousands |
| Units built, each side | 610–770 (was 340–380) | Far more |
| Army, each side | 210–490 (about 650–700 in all after the balance pass, mostly tanks with rockets, riflemen, juggernauts and field guns; the same 610–680 with the old prices once units could target buildings again, and 730–850 before that fix) | Hundreds, then thousands |
| Map held, each side | 8–11% at minute 30 (unchanged by the cheaper army) | Rising; most of the map contested late |
| Field Commands, each side | 13–17 at minute 30, 15–20 by minute 40 (no time limit: as many as it can pay for, at most one a minute on Normal, 20 on the largest map) | Several hubs, each a growing town |
| Buildings, each side | 98–100, plus blocks of wall | Hundreds |
| Money unspent | $2,000–2,700 | Near zero: money becomes army |
| Power made vs used | 1.4 to 1 | Tight: a real juggle while scaling |
| Decisive swings | by minute 40 one side leads clearly (army 427 to 143, 20 hubs to 15) | Games get decided, not stalemated |
| Update time | about 2 ms on average over 30 minutes with 700–850 units after the cuts; 2–3 pauses over 40 ms | Smooth with thousands of units |
| First real fight | minute 10–11 on the largest map, most often at the citadel (measured when soldiers walked at 13–15; the owner has since asked for faster soldiers, now 21–24, so it will come sooner: not re-measured) | Soon enough to matter |
| Loading (to the title) | about 4 s on the large map and about 4.7 s on the largest (was 11.7), measured on a busy machine | Quick |

### Difficulty ladder (computer vs computer, largest map, with the last-stand rule and the citadel)

| Match | Result | Hubs | Army value | Units lost |
|---|---|---|---|---|
| Easy vs normal | Normal wins: easy's last stand runs out at minute 41 (measured before easy's base pace: easy is weaker now) | 2 vs 9 (minute 38) | $1k vs $218k (minute 38) | 321 vs 150 |
| Normal vs hard | Hard ahead (minute 29), holding the citadel | 7 vs 10 | $110k vs $130k | 91 vs 132 |
| Hard vs brutal | Brutal ahead (minute 39): more hubs, buildings and uplink time, fewer losses | 7 vs 11 | $85k vs $66k | 370 vs 300 |

Each level beats the one below, without extra money, speed or hidden knowledge. Want: brutal ahead on army too, and knockouts between the closer levels.

Update these tables when a change moves the numbers on purpose.

## Not doing (for now)

- **Naval units.** Not yet.
- **A second resource.** See tenet 8.
- **Factions.** Proposed (three sides with their own style), waiting on a decision.
