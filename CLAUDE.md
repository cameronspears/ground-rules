# Conquer

An original browser real-time strategy game: Vite + TypeScript, Canvas2D pixel art baked from voxel models.

## Before any design or balance change

Read [TENETS.md](TENETS.md). It's what the game is for, the lane of every unit and building, the checks to run, and the current baseline numbers. Judge every idea against it, and say plainly when an idea breaks a tenet or duplicates a lane.

When a change adds, removes or retunes a unit or building, update the lanes table in TENETS.md and the in-game strong/weak text (`VS` and `ROLE` in `src/game.ts`) in the same change. When a change moves the baseline on purpose, update the baseline table.

## Where things live

- `src/game.ts`: the game itself (units, buildings, combat, drawing, input, HUD).
- `src/ai.ts`: the computer opponent.
- `src/build.ts`: costs, build times, production, economy constants.
- `src/combat.ts`: weapons, damage and building health.
- `src/terrain.ts`: map generation and painting; `src/territory.ts`: road networks and borders.
- `src/art.ts`: voxel models for every unit and building.

## Checking a change

Run the dev server (`npx vite --port 5199`) and use the browser. `window.game` is the Game object. You can run a computer-vs-computer match by adding `new AI(game, game.level, 0)` from `/src/ai.ts` to `game.ais` after deploying, then stepping `game.update(1/20)`.
