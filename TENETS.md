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

8. **One resource: money.** Scrap, oil, land, towns, timber and captured sites all pay in money, plus power as the one limit. No second currency to juggle.

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
| Generator | Power |
| Fusion reactor | Huge power, huge blast if destroyed |
| Scrapyard | Early income from scrap |
| Oil derrick | Steady money and power on struck oil |
| Foundry | Turns spare power into money |
| Paved road | Speed, and links ground into your network |
| Barracks, depot, airfield, proving ground | Make infantry, vehicles, aircraft, super-units |
| Hospital, workshop | Heal infantry, repair vehicles; unlock grenadiers and field guns |
| Radar tower | Wide vision so guns can see; spots hidden units in a wide ring |
| Armoury | Side-wide upgrades |
| Missile silo | Strategic missile, answered by interceptors |

### Concealment

Riflemen, rocket soldiers, grenadiers and field guns standing still in forest are hidden until they shoot or an enemy comes within a couple of squares. Infiltrators are always hidden. Scouts and guard towers spot hidden units within 6 squares, radar towers within 12. This makes ambushes, not a new piece.

### On the map (neutral, worth taking)

Town halls, fuel depots, power plants, comm towers, repair yards, motor pools, recruitment offices, watchtowers and bunkers are captured with infantry. Supply crates and derelict war machines go to whoever reaches them first.

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
| Field Commands, each side | 8 (the cap) | More on big maps |
| Buildings, each side | 130–145 | Hundreds |
| Money unspent | $7,000–9,000 | Near zero: money becomes army |
| Power made vs used | about 3 to 1 | Tight: a real juggle while scaling |
| Update time | about 3 ms; rare spikes | Smooth with thousands of units |

Update this table when a change moves the numbers on purpose.

## Not doing (for now)

- **Naval units.** Not yet.
- **A second resource.** See tenet 8.
- **Factions.** Proposed (three sides with their own style), waiting on a decision.
