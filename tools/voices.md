# Radio voices

The units' radio lines are real speech, made once on a Mac and kept in `src/voice/radio.mp3` (all lines in one file) with `src/voice/clips.ts` (where each line sits). The game plays a line when the same words appear on screen, through a radio filter in `src/audio.ts`.

They're spoken by **Chatterbox**, Resemble AI's open voice model: MIT licence, free for any use, no account. It runs on the Mac (Apple Silicon) through `mlx-audio`.

## Voices

Chatterbox copies the voice of a short recording you give it. Those recordings come from **Kokoro**, another open voice model (Apache licence) with proper male voices; a "rough" one has a little distortion added first, which Chatterbox copies as grit. (Chatterbox's own built-in voice is a woman's: pitching it down sounded wrong.)

| voice | made from | who |
|---|---|---|
| tank | am_onyx, rough | tanks, juggernauts, the Colossus |
| gun | bm_lewis, rough | field guns, flak trucks |
| builder | am_liam | builders, salvagers |
| inf1 | am_liam, rough | riflemen |
| inf2 | am_onyx pitched 1.08, rough | rocket soldiers |
| inf3 | am_liam pitched 1.07, a little rough | grenadiers, scouts, gunships, bombers |
| cmd | bm_lewis | Command, the uplink, the interceptor |

Fighting voices are pushed harder (Chatterbox's "exaggeration" 1.0, or 1.3 for a line ending in "!"); builders and Command stay calm (0.5). Who uses which is `VOICE` in `src/audio.ts` and in `tools/voices/jobs.py`: keep them the same.

## Adding or changing lines

When a unit's barks change, or a new fixed line should be spoken, remake the clips (about 25 s a line):

```bash
mkdir -p ~/voicegen && cd ~/voicegen
uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python mlx-audio soundfile
brew install espeak-ng   # Kokoro needs it (point espeakng_loader at /opt/homebrew/lib/libespeak-ng.dylib)
# reference voices (tools/voices/kref.py "<line>" am_onyx bm_lewis am_liam): Kokoro says "Alpha team, this is Bravo. We have eyes on the ridge and the road is clear.
# Moving up to the bridge now, over." in each voice in the table, then into ref/<voice>.wav with ffmpeg:
#   rough: -af "volume=4,asoftclip=type=atan,volume=0.3"; pitched: -af "rubberband=pitch=1.08,..." 
python3 <repo>/tools/voices/jobs.py <repo>/src/game.ts   # the list of lines, from the game's own text
.venv/bin/python <repo>/tools/voices/bake.py              # up to 4 takes a line; a speech recogniser keeps the take that says it right
.venv/bin/python <repo>/tools/voices/pack.py <repo>/src/voice
```

`bake.py` skips lines already in `clips/`, so delete a clip to remake it. Its `report.json` lists what the recogniser heard for each line: read the low scores and listen to those.

Lines with numbers or names in them ("12 blocks of sandbags") can't be made ahead, so the speaker says "Copy that.", "On it." or "Understood." instead.
