# Moonshot: tiny and smooth

The goal: Ground Rules loads in a blink, fits easily in memory and never stutters, and plays exactly as before.

Hard rule: pinned simulator matches keep identical fingerprints, and every baked picture stays pixel-identical. Anything that changes how the game looks or sounds is the owner's call.

## Results (27 November 2026)

Measured on the 16 GB Mac, production build, a 4-side Wild West game (seed 777, Settlers v Nations) unless noted. The machine was heavily loaded by other simulations throughout, so times are noisy; old and new were run alternately.

| | Target | Before | After |
|---|---|---|---|
| Code to start playing (zipped) | under 500 KB | 416 KB | **271 KB** (245 KB game, 26 KB map painter) |
| Sound, fetched after the first click | (no target) | 4.0 MB, line tables for all three voice packs in the code | 1.8–2.1 MB: Opus (voice 12 kbps, effects 32 kbps; MP3 kept for browsers without Opus), only the pack in play and its 6–8 KB line table |
| Unit and building pictures | under 150 MB | 417 MB | **61 MB** |
| All pictures, painted map included | — | 619 MB | 263 MB (the map is 203 MB of it, unchanged) |
| Load to the title | under 2 s | 9.6 s | 8.1 s (map painting is now nearly all of it) |
| All pictures baked | — | 15.8 s after page start | 10.9 s |
| Baking every army unit | — | about 430 ms | about 250 ms |
| Drawing a 638-unit battle | steady 60 fps | not measured | 12 ms a frame typical, 15 ms slow end; rules 3 ms typical, 8 ms slow end (CPU only: the browser pane was hidden, so real frame rate is not measured) |

What changed:

1. **Pictures keep only the box their pixels fill.** Each was a cell sized for its model at any angle with its longest shadow, three quarters empty. Shadows, colourless, are shared by every team's copy.
2. **No three.js.** It was a quarter of the code and did one job: draw block models into pictures. `bake.ts` does it with a few dozen lines of WebGL2, the same lighting written out from the shader three.js built, with the same sums in the same order.
3. **Faster baking**: the pixel finishing runs inside each picture's box, and the drawing is read straight back.
4. **The railroad search** (Wild West) checks only the places near each candidate line: 1.8 s became 75 ms, with the same track on 24 maps.
5. **Loading overlaps**: the pictures for after the title bake while the map painters finish, and painters past the opening view always have their next chunk waiting.
6. **Lost graphics context**: if the browser drops the baker's drawing (short of GPU memory, or too many open), the picture is drawn again instead of staying blank all game. The old three.js baker had the same flaw; it was seen happening during this work.

How each was checked: every one of the 6,230 pictures of the Wild West game and 1,693 of a Standard army-v-Swarm game, plus the title cards, compared pixel by pixel against the old code at their anchors; pinned matches identical in Standard, Swarm and Wild West (both side pairings); `node tools/sim.mjs --check` passes; each mode started and played with no errors.

## Not reached, and why

- **Load under 2 s.** The title waits on the map painters: about 2 µs a pixel, a 512-pixel chunk takes about 0.6 s, and the opening view needs 16. The whole map is about 3 minutes of processor time spread over 8 background workers, which also keeps the machine busy for the first 20 seconds of play. Making the painter faster, pixel for pixel the same, is the next big step.
- **Steady 60 fps, proven.** Needs the browser pane shown on a quiet machine to time real frames.
- **No hitches from baking.** Fewer, but a few background bakes still take 20 to 190 ms in the first seconds after the title. The real fix is baking in a worker.
