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
- The units' radio voices (`src/voice/radio.mp3`) and the sound effects (`src/sfx/sfx.mp3`) were made with ElevenLabs on a paid plan, which allows them in a game we sell. Never sell or share the sound files on their own, and keep ElevenLabs' community sharing off. See tools/voices.md.
- Clicks, the warning chime and the radio crackle are made in code at runtime. Original work. There is no music.
