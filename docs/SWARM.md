# Swarm: a second faction for Standard

**Status:** playable, all five pieces built. The start screen has YOUR SIDE and ENEMY SIDE (army or swarm). A Swarm side gets the one rule and its own moto raiders, Wolf, salvo truck and drone truck, and the Hive in the Colossus's place. Its buildings still look like the army's. The code is in `src/swarm.ts` (the rule, the pieces, their text), with the side layer and the drones in `src/game.ts` (`setFactions`, `unitDef`, `catalog`, `release`, `updateDrones`).

The Western mode has its own side-picking (Settlers or Plains Nations) on its branch, not yet on main. It works the same way (a side per team, each piece standing in for one of the army's by key), so when it lands the two should become one setting with three sides, not two settings.

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
| Wolf (six-wheeled armoured car with a quick cannon) | Tank | All-round armour, fast and light | Tanks (a pack beats the same money), scouts, infantry | Rockets, gunships |
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

1. ~~Drone truck and drone models.~~ Done: `SWARM` in `src/art.ts`, shown at `/tools/models.html?part=swarm`. Look approved: a heavy armoured six-wheeler, a wedge cab with slit windows and a red-eyed sensor, an armoured launch box with slat armour and four drones in their cells.
2. ~~Side-picking, the one rule, the drone truck and its drones.~~ Done. The computer plays Swarm with its usual plans, buying from Swarm's price list. `node tools/sim.mjs --sides swarm,army` plays Swarm (red) against the army (blue), and judges by what the armies are worth, since a Swarm army is half again as many for the money.
3. ~~The moto raiders, the Wolf and the salvo truck.~~ Done: drawn, armed, and duel-tested against their lanes (`node tools/swarm-duel.mjs`). The simulator has Swarm about even with the army, maybe a little behind; more runs would tell.
4. ~~The Hive.~~ Done: a crawler with 16 drones (`NESTS` in `src/swarm.ts` says how many each carrier holds). Next: the scrappier buildings.
5. Update TENETS.md (the lanes, the "Factions" line under "Not doing"), and the in-game `VS` and `ROLE` text.
