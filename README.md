# Ground Rules

An original real-time strategy game that runs in the browser. You build a base, grow an economy and fight a computer general across a randomly made map of rivers, dams, roads and villages. The art is pixel sprites baked from block models when the game loads.

Play it at **https://ground-rules-xi.vercel.app**.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

    npm install
    npm run dev

Then open http://localhost:5199. Add `?seed=1234` to the address to get the same map every time.

## Check a change

    npm run check

This type-checks the code, builds 50 random maps and tests each one against the map rules (nothing on water, roads never through water, and so on), then walks every road on four maps. It takes about two minutes and must end with `0 problems` and `0 gaps`. See [CLAUDE.md](CLAUDE.md) for the other checks (feature close-ups, the model sheet).

## Release it

    npm run build
    vercel deploy --prod --yes

The build goes to `dist/` and is published on Vercel.

## Where things live

| Where | What |
|---|---|
| `src/game.ts` | The game: units, buildings, combat, drawing, input, the sidebar |
| `src/ai.ts` | The computer opponent |
| `src/build.ts` | Costs, build times, the economy |
| `src/combat.ts` | Weapons, damage, building health |
| `src/terrain.ts`, `src/territory.ts` | Map making, roads and borders |
| `src/art.ts` | The block models for every unit and building |
| `src/audio.ts`, `src/voice/`, `src/sfx/` | Sound and the units' radio voices |
| `tools/` | Test and inspection tools (map checks, model sheet, sound sheet, match runners) |

## Read before changing the design

- [TENETS.md](TENETS.md): what the game is for, the job of every unit and building, and the baseline numbers.
- [docs/FUN.md](docs/FUN.md) and [docs/REVIEW-MAYBES.md](docs/REVIEW-MAYBES.md): the reviews that decided what was cut and why.
- [tools/voices.md](tools/voices.md): how the voices and sound effects are made.
- [LICENSES.md](LICENSES.md): everything the game uses and under what terms.
