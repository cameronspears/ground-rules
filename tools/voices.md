# Radio voices and sound effects

The units' radio lines and the battle's sound effects are recordings made with **ElevenLabs** (paid plan, which allows them in a game we sell; never sell or share the sound files on their own, and keep ElevenLabs' community sharing off). They live in two files each:

- `src/voice/radio.mp3` (every line) and `src/voice/clips.ts` (where each sits). The game plays a line when the same words appear on screen, through a radio filter in `src/audio.ts`.
- `src/sfx/sfx.mp3` (every effect, a few takes each) and `src/sfx/clips.ts`.

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
