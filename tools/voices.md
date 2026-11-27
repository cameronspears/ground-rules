# Radio voices and sound effects

The units' radio lines and the battle's sound effects are recordings made with **ElevenLabs** (paid plan, which allows them in a game we sell; never sell or share the sound files on their own, and keep ElevenLabs' community sharing off). They live in two files each:

- `src/voice/radio.ogg` (every line, Opus; `radio.mp3` is the same for browsers without Opus) and `src/voice/clips.ts` (where each sits). The game plays a line when the same words appear on screen, through a radio filter in `src/audio.ts`.
- `src/sfx/sfx.ogg` (every effect, a few takes each; `sfx.mp3` for browsers without Opus) and `src/sfx/clips.ts`.

Clicks, the warning chime and the radio crackle are made in code. There is no music.

## The cast

| voice | ElevenLabs voice | who |
|---|---|---|
| tank | Cole (gritty, dry) | tanks, the Colossus |
| gun | Joseph Ortman (deep, raspy) | field guns, quad guns |
| builder | Spuds Oxley (southern grandpa) | builders |
| salv | Mister Gruff (grumpy old neighbour) | salvagers |
| inf1 | Jett (young, eager) | riflemen |
| inf2 | Adam (dark, tough) | rocket soldiers |
| inf3 | Chris (Boston, brash) | grenadiers, scouts, gunships, bombers |
| cmd | Philip (quiet authority) | Command, the uplink, the interceptor |

Voice ids are in `CAST` in `tools/voices/el_bake.py`. Who uses which voice is `VOICE` in `src/audio.ts`.

## The script

`tools/voices/script.py` holds every unit's lines with an acting cue each (smug, grumbling, shouting...). The cue shapes the delivery and is never shown. The words must match `barks` in `src/game.ts` exactly. The builder's lines for repeated moments and each voice's plain replies are there too, matching `SAY` and `ACK` in `src/audio.ts`. The tone: Generals-style humour, each voice a character; Command stays straight.

## Remaking

The key lives in `~/.elevenlabs-key` (create one under Developers → API keys with Text to Speech, Sound Effects, Voices and User access). In a scratch folder with a Python venv that has `mlx-audio` and `soundfile` (for the speech check):

```bash
python3 <repo>/tools/voices/jobs.py                         # the line list (jobs.json)
.venv/bin/python <repo>/tools/voices/el_bake.py             # records each line; a speech recogniser retakes ones it mishears
.venv/bin/python <repo>/tools/voices/pack.py <repo>/src/voice
python3 <repo>/tools/voices/sfx_bake.py                     # the effects in tools/voices/sfx.py, a few takes each
.venv/bin/python <repo>/tools/voices/sfx_pack.py <repo>/src/sfx
```

Both bakers skip what's already made, so delete a clip to remake it. `report.json` lists what the recogniser heard; most low scores are American spellings ("armor"), not mistakes. A take you picked by ear goes in `sfx/` as `<key>_pick.mp3` and is kept.

A full recording is about 12,000 credits (the voices are most of it).

## Wild West

The Wild West map has its own voices and effects, in `src/west/voice` and `src/west/sfx` (the same two files each). The game picks them up when they're there; until then its radio lines get just the click and its effects are the army's.

- The words and acting cues are in `src/west/radio.ts` (each unit's lines, the shared and fixed lines, the pioneer's sets and the plain replies). `node <repo>/tools/voices/jobs-west.mjs` makes `jobs.json` from it.
- The effects are `tools/voices/sfx_west.py`, the same keys as `sfx.py`.
- The cast (`CAST` under `SET=west` in `el_bake.py`): War Wagons, Ironclads and the Titan Russel (raw cowboy); cannons and Gatlings David (deep Southern); the pioneer Spuds Oxley again; gunslingers Leo (young cowboy); buffalo gunners John Morgan (gritty); dynamiters, riders and fliers Clifford (cocky); the prospector Rusty Wade; the marshal (Command) Caleb (the sheriff).
- Run everything with `SET=west` and pack into `src/west/voice` and `src/west/sfx`. Keep the two sets in separate scratch folders, as the bakers skip what's already there.

### The Plains Nations

Their lines are in `src/west/nations-radio.ts` and their recordings in `src/west/nations-voice` (same two files). `SET=nations` makes their list (`jobs-west.mjs`) and records with their cast (`CAST` under `SET=nations` in `el_bake.py`); pack into `src/west/nations-voice`.

There are no voices from Native speakers in the ElevenLabs library, so the cast was designed with the Voice Design tool (v3), each described as a specific person from a named reservation speaking Native American English as linguists describe it: a contour pitch accent (a stressed word rises then falls), phrases ending level or slightly raised rather than falling, an even syllable-timed rhythm, otherwise level and understated. Three candidates per character were measured against real recordings (IDEA, dialectsarchive.com: Blackfoot, Kiowa and Lakota-raised speakers; free for research only, never copied into the game) for phrase endings, pitch movement and rhythm, and the closest of each kept. The better route, if it's ever possible, is Native voice actors and a Lakota reviewer for the words.
