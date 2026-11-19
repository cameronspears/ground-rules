# Licences

Everything the game uses, and under what terms. Update this whenever something is added.

## Code libraries (bundled into the game)
| What | Used for | Licence |
|---|---|---|
| three.js | 3D drawing | MIT |

## Build tools (not shipped to players)
| What | Licence |
|---|---|
| Vite | MIT |
| TypeScript | Apache 2.0 |

## Art and sound
- All art is original and made in code in this project: units, buildings and trees are block models (src/art.ts) pre-rendered into pixel sprites at load; the map is painted pixel by pixel (src/terrain.ts).
- The pixel font (src/font.ts) is drawn by hand in this project. Original work.
- All sound effects are synthesised in code at runtime (no audio files). Original work.
