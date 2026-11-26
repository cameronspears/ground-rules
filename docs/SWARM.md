# Swarm: a second faction for Standard

**Status:** designed, one model drawn (the drone truck). Waiting on the side-picking ("YOUR SIDE / ENEMY SIDE") from the Western mode to reach main, so Standard can reuse it instead of building a second one.

## The idea in one line

Cheap, fast and everywhere. Swarm never wins a fair fight unit for unit. It wins because there are three of everything.

Why this faction, over the other two we considered:
- **Iron Line** (few, heavy, slow) was the easiest to build, but it's "more tanks", which we don't want.
- **Ghost** (hidden raiders) was exciting, but the hardest to balance, and hard for the computer to play convincingly.
- **Swarm** plays the most differently from the side you have now. It feeds tenet 1 (calamity at scale: more units on the map), and everything that beats it already exists.

## What stays the same

- The economy, power, land and every building's job. The buildings keep their names, so nobody learns a new base; only the look changes later (scrappier: containers, tents, scaffolding).
- Riflemen, rocket soldiers, grenadiers, the quad gun, the bomber, the builder and the salvager.

## The one rule

Everything Swarm fields costs about a third less and is about a third weaker. You'll see crowds, not big machines. It's automatic, with nothing to learn (tenet 7).

## Its own pieces

Each one takes the place of one of yours, in the same lane, so the lanes table stays one job per piece (tenets 3 and 12).

| Swarm piece | Replaces | Job | Beats | Loses to |
|---|---|---|---|---|
| Moto raiders (a pair of motorbikes) | Scout buggy | Fast eyes, hunts soldiers | Infantry, field guns | Anything with armour |
| Wolf (six-wheeled armoured car with a quick cannon) | Tank | All-round armour, fast and light | Scouts, infantry | Rockets, gunships, tanks head-on |
| Salvo truck (a wide spread of small rockets) | Field gun | Siege and crowd-breaking | Defences, clumps of soldiers | Anything that reaches it |
| Drone truck (launches 4 attack drones, rebuilds lost ones over time) | Gunship | Hunts units from above, from a truck on the ground | Every ground unit | Flak, quad guns, anything that catches the truck |
| Hive (super-unit: a huge slow crawler that keeps streaming drones out) | Colossus | Breaks armies by wearing them down | Armies, armour | Flak towers, emplacements, grenadier crowds |

## Why it's fair (tenet 4)

What beats a crowd already exists: grenadiers, quad guns, flak, and artillery's splash. Against Swarm, the quad gun becomes the most important unit you own, which makes your choices matter.

## Risks

1. **Drones are new.** A unit that launches other units is the biggest new piece of code.
2. **Speed.** More units means more work per frame. Measure with `node tools/sim.mjs` and the update-time baseline before calling it done.
3. **Art.** Five new vehicles, then a scrappier look for each building. The buildings can come last: the current ones recoloured will do at first.

## Build order

1. ~~Drone truck and drone models.~~ Done: `droneTruck` and `drone` in `DRAFT` in `src/art.ts`, shown at `/tools/models.html?part=draft` (the game doesn't load drafts). Look approved: a heavy armoured six-wheeler, a wedge cab with slit windows and a red-eyed sensor, an armoured launch box with slat armour and four drones in their cells.
2. Once side-picking is on main: the units, their weapons, and a Swarm plan for the computer. Balance against your side with the simulator until it's about even on the pinned runs.
3. The Hive and the scrappier buildings.
4. Update TENETS.md (the lanes, the "Factions" line under "Not doing"), and the in-game `VS` and `ROLE` text.
