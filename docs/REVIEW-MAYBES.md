# The "maybe" pieces, judged

FUN.md left nine pieces as "keep for now, judge in play". This file judges them with numbers from real computer-vs-computer matches. Nothing in the game was changed. The owner decides.

## How this was tested

Two 40-minute matches on the largest map, with the computer playing both sides:

- **Match A:** map 4242, Normal. Blue's plan: super-unit. Red's plan: artillery siege.
- **Match B:** map 777, Hard. Same plans (siege was picked on purpose, because it's the plan that builds batteries and shields).

Everything was counted as it happened: what got built and when, shots, damage, healing, captures, crates, camps, and who walked on the ice. Healing is a close estimate. Each piece was also read in the code, to see what rules it adds.

## The verdicts

| Piece | What it gives you | Does the computer use it? | Verdict | Why, in one line |
|---|---|---|---|---|
| **Battery** | A giant fixed gun with long range | Builds it (4 in a siege game) but it barely fires: 9 shots in two matches | **Cut** | It costs $2,500 and hit almost nothing. It's a slower copy of the field gun. |
| **Shield dome** | A dome that soaks up shells | Builds 2, late. Blocked **zero** shells in two matches | **Cut** | It sits in the middle of the base. The fighting happens at the edges. |
| **Engineer** | Steal an enemy building | Builds 3–4 a match. Took **zero** buildings | **Cut** | It's a one-unit errand, like the infiltrator we already cut. It never works for the computer. |
| **Armoury upgrades** | Four upgrades for your whole side | Buys **all four**, in the same order, by minute 14–19, every match | **Cut** (or turn it into one real choice) | It's a checklist, not a decision. |
| **Hospital and workshop** | Healing; they also unlock units | Always builds both. Hospitals healed **nothing**. Workshops barely healed | **Change**: cut the hospital, keep the workshop as the unlock | They work as gates, not as healers. |
| **Radar tower** | Wide vision; spots hidden troops | Always builds exactly one, by minute 7–9 | **Keep** | It's simple, it's useful, and you get a choice about where to put it. |
| **Winter freeze** | Every river freezes for four minutes | Doesn't know winter exists, but 60–70 of its troops cross the ice each winter anyway | **Keep, with one fix** | It's a great shake-up. But it secretly helps the computer, which breaks "same rules". |
| **Supply crates and derelicts** | Free money and free machines out on the map | Yes: 23–36 crates a match ($18k–29k), and all 10 derelicts claimed by minute 21 | **Keep** | Cheap, used, and they pull you outward. |
| **Marauders and camps** | Guarded prizes, and camps that pay a bounty | Clears the guards around prizes slowly. Never chooses to attack a camp | **Keep, fix the computer** (cut camps if it isn't fixed) | They serve sprawl. But today camps are free money that only you will collect. |

Cutting the four "cut" pieces and the hospital would remove 1 unit, 4 buildings and a side-wide upgrade system. It would also free about $10,000–20,000 a match that the computer now spends on things that do nothing. That money would become army instead, which is what the baseline in TENETS.md asks for.

## Each piece, with the numbers

### Battery: cut

- **Built:** in the siege plan, the first one went up at minute 11 (Hard) or 19 (Normal). There were 4 by minute 40 on Hard. The other plan never builds one.
- **Use:** in two whole matches, batteries fired **9 shots** and did **59 damage**. That's less than one rifleman's health.
- **Cost:** that's $10,000 and 240 power for nothing.
- **Why it fails:** the in-game text says it "fires across half the map". It doesn't. Its reach is 20 squares, which is about a sixteenth of the largest map. A field gun reaches 10 squares, and it can drive to the fight. The battery also needs something on your side to see the target. So it sits at home, waiting for enemies who never come within reach.
- **Lane:** "breaks defences from far away" already belongs to the field gun, and "breaks bases" to the bomber.
- **Rules it adds:** a gun, a model, a slow turret, the "needs a workshop and a radar" rule, and computer code to park a scout in front of it as a spotter.
- **Recommendation:** cut it. The other option is to make it truly map-sized, so it fires at anything your side can see, anywhere. That would be a calamity piece. But it would need its own counter, and FUN.md already cut the missile silo for being a third strategic-strike system. Cutting is better.

### Shield dome: cut

- **Built:** only in the siege and super-unit plans. The first one appeared at minute 15 (Hard) or 30 (Normal), with 2 by minute 40.
- **Use:** it blocked **zero shells** in both matches. That's true even though the other side built 62 and 88 field guns.
- **Why it fails:** the computer puts it at the heart of the base, where it does the most good on paper. But field guns hit the edges: the defences and the outer buildings.
- **Is it a real choice for you?** The same thing would happen to you. You'd build one, it would sit there, and you'd forget it. That's FUN.md's own fear.
- **Lane:** artillery is already answered by "anything that reaches it", and bombers by flak. The orbital strike has the interceptor. So no attack needs the shield as its only answer (tenet 4 still holds without it).
- **Cost:** $3,000 and 120 power each.
- **Rules it adds:** it's one of the bigger pieces, about 26 lines in the game. It has shield strength, overloading, rebooting, switching off when power runs low, a special case for orbital strikes, and drawing the dome.
- **Recommendation:** cut it.

### Engineer: cut

- **Built:** 3–4 per side per match, first at about minute 10. The computer keeps two on hand.
- **Use:** it took over **zero buildings** in two matches.
- **What goes wrong:** the computer sends engineers at the most expensive building near where its attack lands, such as a reactor deep inside the enemy base. They die or get stuck. In match B, one engineer kept trying to find a path to the same reactor more than 5,000 times and never reached it.
- **What you'd miss:** you'd never see the drama of "Our reactor has been taken over!", because the computer never pulls it off.
- **Lane:** a $900 unit that does one trick. Riflemen already take neutral sites.
- **Why cut:** FUN.md cut the infiltrator for being "a one-unit errand at a scale where you command divisions". The engineer is the same kind of piece.
- **Recommendation:** cut it. If you love the stealing moment, the other option is to fix the computer so it goes after outposts and derricks at the edge of the enemy base. But that's more code for a piece that pulls against "command, not squads".

### Armoury upgrades: cut (or make it one real choice)

- **Bought:** both sides, in both matches, bought **all four** upgrades in the same order (armour, shells, optics, engines).
  - Blue was done by minute 14 in both matches.
  - Red was done by minute 14 on Normal and minute 19 on Hard.
- **Cost:** $9,300 plus a $1,500 building, every single game.
- **Is it a decision?** No. When every upgrade is cheap next to a 40-minute economy, the only question is "when". This is exactly what Soren Johnson warns about: a chore that pays, so everyone does it.
- **Can you see it?** Hardly. Optics (+30% sight) and the 15–20% bonuses don't show on the map.
- **Rules it adds:** a building, a fourth kind of thing on the build panel ("upgrade"), its own research queue, and checks in the damage, speed and sight code.
- **Recommendation:** cut the armoury and its upgrades. If balance needs any of the numbers, build them into the units. If you want a real decision here, the better idea is a single doctrine you pick once and can't change, such as "armour" or "speed". You can't have both, so it really is a choice. But that's a new feature, and cutting comes first.

### Hospital and workshop: cut the hospital, keep the workshop as the unlock

- **Built:** both sides always build one of each, by about minute 5–8. In match B, Red ended up with 5 hospitals, because its builder spreads them around.
- **Healing, over two whole matches:**
  - Hospitals: **0** health healed.
  - Workshops: 0 and 150 health healed.
  - For comparison, a captured repair yard healed 219 and 394 on its own.
- **Why they don't heal:** they only heal units standing within about 2.5 squares, and armies don't come home to stand next to them.
- **What they really do:** they're gates. The hospital unlocks grenadiers. The workshop unlocks field guns, juggernauts, the reactor, the proving ground, the armoury, the shield and the battery.
- **Recommendation:**
  - Cut the hospital. Grenadiers can come straight from the barracks.
  - Keep the workshop as the "heavy weapons" unlock, and say so honestly in its description.
  - Its healing can stay, since it shares code with the repair yard and costs almost nothing. Or drop it, and leave healing to the captured repair yards, which do it better and are worth fighting over.

### Radar tower: keep

- **Built:** always exactly one per side, by minute 7–9 in both matches. The siege plan later adds a second and a third.
- **What it does:** wide sight (22 squares), and it spots hidden troops in the woods within 12 squares.
- **Is it a real choice?** The computer treats it as a must-build. For you, *where* you put it is a real decision: forward, to watch a river or the citadel, or at home.
- **Rules it adds:** small, mostly a sight number and a spotting check.
- **Recommendation:** keep it. Two small notes:
  - If the battery goes, the radar is only needed for the interceptor. That's fine.
  - The minimap is also called "radar", and you get it from a Field Command. Calling the tower something like "Watch Post" or "Radar Mast" would stop the two being mixed up.

### Winter freeze: keep, with one fix

- **When:** it comes at minute 20 and minute 40, so most matches see it once or twice.
- **Use:** in each first winter, 60–70 units per side walked on the ice. That's about a third to a half of each army, and most of them were marching to attacks. Choke points really did vanish.
- **Losses when the ice broke:**
  - Match A: 8 for Blue, 17 for Red.
  - Match B: 3 for Blue, 6 for Red.
  - That's a real cost for getting caught, but not a massacre. It works.
- **The fix it needs:** the code secretly orders every computer-side unit off the ice 22 seconds before the thaw, but not yours. That breaks tenet 9 (same rules). It doesn't even work: the computer side that got this help lost more units than the one that didn't (17 vs 8, 6 vs 3), because its next orders send them straight back.
- **What to change:** remove the secret help, or give the same warning-and-retreat to everyone (for example, a one-click "get off the ice" on the banner). Separately, the computer has no idea winter exists. It crosses the ice by accident because its paths go over it. Planning attacks across the ice would make winter feel like a real event when you play against it.
- **Rules it adds:** about 30 lines in the game and 16 in the map code, plus the ice art. It's fairly big, but it's one clear, announced rule that serves calamity.

### Supply crates and derelicts: keep

- **Crates:**
  - Match A: 20 and 16 picked up, so $16,000 and $12,800.
  - Match B: 11 and 12, so about $9,000 each.
  - That's roughly $220–400 a minute per side, so it matters.
- **Derelicts:** all 10 on each map were claimed by minute 18–21, split about evenly. Tanks, juggernauts and field guns came back into the fight.
- **Why keep:** they pull units out across the map, which serves sprawl and discovery, and they cost very little code (about 20 lines).
- **One small fix:** the computer chases derelicts even before its side has seen them. That's a small cheat against tenet 9: it should only chase ones it has spotted, as it already does for crates.

### Marauders and camps: keep, fix the computer (cut camps if it isn't fixed)

- **Guards around prizes:** these get cleared slowly. Marauder guns went from 35 to 20 (match A) and from 35 to 12 (match B) by minute 40.
- **Camps:** 0 of 4 were cleared in match A, and 2 of 4 in match B. Even those 2 were cleared by armies passing through, not on purpose.
- **What the computer does wrong:** in match B it sent 30 squads to clear marauders, and **not one went for a camp**.
  - Most went for the guns in the citadel in the middle, because that prize scores highest.
  - The squads are 3–5 units, sometimes including flak trucks that can't shoot ground targets.
  - They were called off after 150 seconds, usually before they even arrived. Then the computer sent the same squad again.
- **What that means for you:** camps are free $1,500 bounties that only you will collect, and the middle stays guarded.
- **Rules it adds:** about 37 lines in the game and 9 for the computer. Prize guards and camps are two flavours of one idea, but camps add a bounty and a second way of placing things on the map.
- **Recommendation:** keep marauders, because they really do push you outward early. Fix the computer's clearing:
  - send a real force, with no flak trucks;
  - give it enough time to arrive;
  - give camps a fair score, so the nearby ones get picked.
  - If that fix isn't worth doing, cut the camps and keep the guards around prizes. They already do the "early target that pulls you outward" job.

## What wasn't checked

- **Only two matches, both siege against super-unit.** The armour and air plans weren't watched. They build fewer batteries and shields, so those two would look even emptier.
- **No human play.** "Is winter confusing?" and "does stealing a building feel good?" need a person playing.
- **Healing is an estimate.** It was sampled once a second, not exact. But zero is zero.
