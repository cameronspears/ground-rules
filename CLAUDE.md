# Ground Rules

An original browser real-time strategy game: Vite + TypeScript, Canvas2D pixel art baked from voxel models.

## Before any design or balance change

Read [TENETS.md](TENETS.md). It's what the game is for, the lane of every unit and building, the checks to run, and the current baseline numbers. Judge every idea against it, and say plainly when an idea breaks a tenet or duplicates a lane.

When a change adds, removes or retunes a unit or building, update the lanes table in TENETS.md and the in-game strong/weak text (`VS` and `ROLE` in `src/game.ts`, and `SWARM_VS` and `SWARM_ROLE` in `src/swarm.ts` for Swarm's own pieces) in the same change. When a change moves the baseline on purpose, update the baseline table.

## Where things live

- `src/game.ts`: the game itself (units, buildings, combat, drawing, input, HUD).
- `src/ai.ts`: the computer opponent.
- `src/build.ts`: costs, build times, production, economy constants.
- `src/combat.ts`: weapons, damage and building health.
- `src/terrain.ts`: map generation and painting; `src/territory.ts`: road networks and borders.
- `src/art.ts`: voxel models for every unit and building.

## Checking a change

`npm run check` runs the type check and the two map checks below in one go (about two minutes).

For anything that touches map generation (terrain, water, roads, villages, dams, bridges, the citadel):

- `node tools/check-maps.mjs 50` builds 50 random maps and tests the "does this make sense?" rules (nothing on water or roads, roads never through water, dams facing along their streams, no stray water, lakes in low ground, bridges meeting roads, and so on). It must print `0 problems`. When you find a new kind of mistake, add a rule for it there so it can't come back.
- `node tools/check-roads.mjs` walks every road on four maps and checks it's painted the whole way. It must print `0 gaps` for each. Run it after any change to map painting or roads.
- `node tools/feature-sheet.mjs 6` paints close-ups of every dam, bridge, ford, citadel gate and village into `tools/out/*.png`. Look at them for what rules can't catch.
- Mirrored features are built once and copied exactly to their twins (computing each twin separately drifts by a square through rounding).
- When a change alters what the generator makes from a seed, raise `SAVE_VERSION` in `src/save.ts`: saves keep only the seed and what play changed, so an old save over a new map lays its roads and changes in the wrong places.

For anything that touches the models (`src/art.ts`, `src/bake.ts`), open `/tools/models.html` on the dev server: every unit (both teams, four angles) and building drawn large. `?part=units|base|civic|life|swarm`, `?night=1`, `?scale=N`, `?only=tank,rifle`. Check team colour still reads at `?part=zoom` (game size).


For anything that touches balance, the economy or the computer, play it out with `node tools/sim.mjs`: computer-vs-computer matches of the real game with no screen, several at once (two maps, three runs each, 25 minutes by default; `--mode`, `--level`, `--plans`, `--maps`, `--runs`, `--min`). Each match is pinned (the same map and run always play the same match), so compare before and after on the same runs. `node tools/sim.mjs --check` is its self-test. Anything only for looks (smoke, sparks, rubble, flares, the people and animals of the countryside, sound) draws its random numbers from `fx()` in `game.ts` (or audio's own), never `Math.random`: the rules' dice must not depend on what's on screen, or the same match stops playing the same and the simulator can't skip the decoration. It runs the game's own code; only screen-only pictures are skipped (`tools/headless-core.js` lists them). It can't replay a browser match move for move: Chrome and Node round some maths differently in the last decimal place, so matches drift apart after a couple of minutes, as two browsers would.

Run the dev server (`npx vite --port 5199`) and use the browser. `window.game` is the Game object. `/tools/headless.html?seed=777&rseed=1&min=3` plays the simulator's match in the browser.
