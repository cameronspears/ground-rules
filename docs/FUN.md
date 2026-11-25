# What makes Ground Rules fun

A review of every piece of the game against two things:
- Riot's "8 Kinds of Fun" (from the MDA framework by Hunicke, LeBlanc and Zubek);
- lessons from designers who've shipped great strategy games.

The aim is to find what Ground Rules absolutely needs, and what it can lose.

## The short version

**Ground Rules' promise is one feeling: "my empire is swallowing the map, and the war is enormous."**

Today the game doesn't deliver that feeling yet. At minute 30 each side holds about 6% of the map with a few hundred units. Meanwhile we've built dozens of clever side systems.

The fix is mostly subtraction:
- cut the pieces that don't serve the promise;
- spend the attention that frees up on sprawl and scale.

## 1. The feeling we're making

The Riot doc's first lesson is that the best games aim at a specific feeling on purpose. Ground Rules' tenets already name ours:

- **Sprawl.** Your territory spreads across the land, town after town. Growing it feels good on its own.
- **Calamity.** Huge fronts, thousands of units, things blowing up on a grand scale.
- **Command.** You steer an empire and its armies like a general, not a squad leader.

Anything that doesn't feed one of those three is a candidate to cut.

## 2. Which kinds of fun to aim at

| Kind of fun | Fit for Ground Rules | Why |
|---|---|---|
| **Fantasy** | **Core** | Being the supreme commander of a sprawling empire is the whole pitch. |
| **Sensation** | **Core** | The spectacle of calamity: pixel-art armies, blasts, fires, glowing night battles. |
| **Challenge** | **Core** | Outthinking an opponent who plays by the same rules. |
| **Expression** | Strong second | Building *your* empire your way: where you spread, how you fortify, what army you field. |
| **Submission** | Strong second | The calm pleasure of watching a base grow and the border creep outward (why Factorio and SimCity hold people for hours). |
| **Narrative** | Light, emergent | Stories the game makes on its own: the night the dam broke, the citadel changing hands. No scripted story, and no labels on it (named battles and war reports were cut: they told you what you could already see). |
| **Discovery** | Light | Scouting, finding oil, uncovering the map. Nice, not the reason to play. |
| **Fellowship** | Not now | Single player against the computer. |

The doc warns that some kinds of fun clash. For us, **challenge fights submission**: a computer that punishes every quiet moment kills the joy of building. Easy and normal should leave real room to build. Hard and brutal can take it away.

## 3. Lessons from great designers, applied

| Designer | Lesson | What it means for Ground Rules |
|---|---|---|
| **Sid Meier** (Civilization) | A game is a series of interesting decisions, and the player, not the designer or the computer, should be the one having fun. | Every system must give *you* a choice. If something happens without asking you anything, or only the computer gets to use it, it's decoration. Decoration has to be cheap. |
| **Soren Johnson** (Civilization IV) | Given the chance, players will optimise the fun out of a game. | Any chore that pays off will be done, grudgingly. Paved roads were exactly that (now gone). Watch for other chores: fuel bookkeeping, spy errands, tiny side incomes. |
| **Mark Rosewater** (Magic: The Gathering; his talk is in the Riot doc) | Be intentional about the emotion you're after. Don't confuse "interesting" with "fun". Be more afraid of boring players than of challenging them. | Several of our systems are *interesting*, like lakes that drain, ice that cracks on a timer, or a computer that learns your habits. Not all of them are *fun moments for you*. Keep the ones you feel, cut the ones only a designer would admire. |
| **Blizzard** (StarCraft) | Easy to learn, hard to master. A small set of units, each with a distinct look and role, about a dozen per side. | We had 17 units, 8 defences and about 15 support buildings, several sharing a lane; after the cuts it's 13 units, 5 defences and 11 other buildings. Fewer, sharper pieces read better at a glance, which matters even more with thousands of units on screen. |
| **Chris Taylor** (Supreme Commander, our named inspiration) | At huge scale, the game moves from tactics to logistics, so the controls must zoom out with it. | Big-picture tools are must-haves: divisions, the builder queue, armies marching together, zooming out. Fiddly one-unit tricks (stealing cash with a spy) matter far less. |
| **Raph Koster** (*A Theory of Fun*) | Fun is learning. When there's nothing new to master, boredom sets in. | Depth should come from a few rules that combine in many ways, not many rules that each need learning. |
| **Tynan Sylvester** (RimWorld) | Elegance: a few mechanics that interact create endless stories. Every mechanic spends the player's attention, which is limited. | Our best moments are elegant interactions: chain explosions, fire spreading through woods, a blown dam flooding a valley. Spend the attention budget there. |
| **Sid Meier, again** | When tuning, double it or cut it in half. Small nudges teach you nothing. | When something isn't working, make a big change, then pull back. |

## 4. Every piece, judged

Each piece is judged on two things: does it serve sprawl, calamity or command, and does it give you a real decision?

### Must keep: the core loop

**Spread, produce, fight on fronts, topple their hearts.**

- **Spread:** Field Commands, buildings linking to each other, land paying money, towns.
- **Produce:**
  - the four factories (barracks, depot, airfield, proving ground);
  - power as a limit;
  - scrap, then oil.
- **Fight on fronts:**
  - divisions;
  - marching together, and riding on vehicles;
  - the core army: riflemen, rocket soldiers, tanks, field guns, gunships, flak;
  - defences that form lines.
- **Topple the hearts:** losing every Field Command starts a last stand, which makes for clear, dramatic endings.
- **Sensation:**
  - explosions, fire and chain explosions;
  - day and night (cheap now).
- **The fair computer opponent** (challenge).

### Cut (fourteen, approved and done)

Each of these is either a second piece in a lane that's already filled, a chore, or something only the computer or designer enjoys.

| Piece | Why cut | What covers its job |
|---|---|---|
| **Hovertank** | Shares the light-flanker lane with the scout buggy. Its one trick, crossing water, is already given by bridges and fords. | Scout buggy, tank |
| **Tempest** (second super-unit) | Bombers already break bases from the air. Two super-units split one fantasy. | Colossus, bombers |
| **Rail tower** | A second anti-armour tower. | Emplacement (tuned up a bit) |
| **Missile silo** | Third strategic-strike system beside the orbital uplink and bombers, plus its own counter. A base-building side quest. | Orbital uplink (fought over on the map, which is better) |
| **Infiltrator** | Three hidden effects (steal cash, black out power, reveal land) that need explaining. A one-unit errand at a scale where you command divisions. | Scouts, radar |
| **Foundry** | "Turns spare power into a little money." No real decision. | Nothing needed |
| **Generator fuel costs** | Bookkeeping: generators quietly drain money. The juggle is mostly invisible. | Keep power as a simple limit: cheap generators, big reactors (the reactor blast is great sensation) |
| **Timber money** | Tiny, invisible income. | Nothing needed |
| **Computer remembers your habits** | You can't see it or play against it. Designer fun. | Its normal scouting and adapting |
| **Battery** (long-range gun emplacement) | In two test matches it fired 9 shots for $10,000. A slower copy of the field gun. | Field guns (the computer's siege plan now leans on them) |
| **Shield dome** | Blocked zero shells in two matches: it sits mid-base while the guns hit the edges. A dome you build once and forget. | Reaching the guns; flak for bombers; interceptors for the strike |
| **Engineer** | Took zero buildings in two matches. A one-unit errand, like the infiltrator. | Riflemen still capture neutral sites |
| **Armoury and its four upgrades** | Both sides bought all four, in the same order, every game. A checklist, not a decision. | Nothing needed; units are as they were without upgrades |
| **Field hospital** | Healed nothing in two matches; it was only a gate for grenadiers. | Grenadiers come straight from the barracks; captured repair yards heal |

**The first nine removed 3 units, 3 buildings and 3 systems; the second round (judged with match numbers in [REVIEW-MAYBES.md](REVIEW-MAYBES.md)) removed 1 unit, 4 buildings and the upgrade system.** Every remaining piece gets a sharper lane.

Also cut later: **winter** (every river froze for four minutes every twenty). It erased the map's shape that three fronts gives it, the computer didn't understand it, and it was a big system for novelty more than decisions.

### Worth a closer look (keep for now, judge in play)

| Piece | Question |
|---|---|
| **Workshop** | Kept as the heavy-weapons unlock (field guns, juggernauts, reactor, proving ground). Does it need its healing? |
| **Radar tower** | Is wide vision a choice, or a must-build? |
| **Supply crates and derelicts** | Cheap little moments of discovery. Kept; the computer now only chases derelicts it has seen. |
| **Marauders and camps** | Early targets and bounties that pull you outward. Kept; the computer now sends real squads at the camps it finds. |

## 5. The real gap: the promise isn't delivered yet

Cutting only clears the ground. The biggest problem is that **the core fantasy is too small today**:

| Promise | Today, at minute 30 |
|---|---|
| Empires sprawl across the whole map | Each side holds 5–7% |
| Thousands of units | 240–300 on the map |
| Hundreds of buildings | 50–80 each |

The pacing caps expansion on purpose: about one new Field Command every 4.3 minutes on Normal. So the game holds back the very feeling it promises.

Where to spend the effort after the cuts:

1. **Make spreading out fast, cheap and joyful** (submission and fantasy):
   - lift or loosen the Field Command pace limit;
   - make land pay enough that sprawl is clearly the winning move;
   - make the border creeping outward feel good to watch.
2. **Pull everyone outward** (discovery and challenge): the map's prizes should sit everywhere, so fronts form all over the map, not only on the line between bases.
3. **Grow the armies** (sensation): more, cheaper units, so battles look like calamities. First pass done: every fighting unit and the towers that answer them cost half, so the same money fields twice the army (about 2 to 2.7 times by minute 30).
4. **Shorten the time to the first fight:** the first five minutes should already be exciting. First pass done: the first crates fall round the citadel and the first wave races there. On the largest map soldiers still need about five minutes to walk to the middle, so the first real fight still comes at about minute 10 to 11. Sooner needs faster marching or smaller maps.

## Sources

- Riot Games, URF Academy, Module 1: *Game Feeling & 8 Kinds of Fun*. Built on the MDA framework by Robin Hunicke, Marc LeBlanc and Robert Zubek.
- Mark Rosewater, *Twenty Years, Twenty Lessons Learned* (GDC 2016), linked in the Riot module.
- Sid Meier, *Interesting Decisions* (GDC 2012).
- Soren Johnson, *Designer Notes*.
- Raph Koster, *A Theory of Fun for Game Design*.
- Tynan Sylvester, *Designing Games*.
- Chris Taylor on Supreme Commander's strategic zoom.
- Blizzard's "easy to learn, hard to master".
