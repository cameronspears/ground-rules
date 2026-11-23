# Radio voices

The units' radio lines are real speech, made once on a Mac and kept in `src/voice/radio.mp3` (all lines in one file) with `src/voice/clips.ts` (where each line sits). The game plays a line when the same words appear on screen, through a radio filter in `src/audio.ts`.

They're spoken by **Chatterbox**, Resemble AI's open voice model: MIT licence, free for any use, no account. It runs on the Mac (Apple Silicon) through `mlx-audio`.

## Voices

Six voices, all from Chatterbox's own built-in voice: one reference line in that voice, then pitch-shifted copies that Chatterbox clones (so each sounds like a different person, not a sped-up recording).

| voice | pitch | who |
|---|---|---|
| base | 1.00 | riflemen |
| low | 0.89 | rocket soldiers, field guns, flak trucks |
| deep | 0.80 | tanks, juggernauts, the Colossus |
| light | 1.12 | builders, salvagers, grenadiers |
| high | 1.26 | scouts, gunships, bombers |
| cmd | 0.84 (calmer) | Command, the uplink, the interceptor |

Who uses which is `VOICE` in `src/audio.ts` and in `tools/voices/jobs.py`: keep them the same.

## Adding or changing lines

When a unit's barks change, or a new fixed line should be spoken, remake the clips (about 25 s a line):

```bash
mkdir -p ~/voicegen && cd ~/voicegen
uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python mlx-audio soundfile
# reference voices: one line in the built-in voice, then pitch-shifted copies
echo '[{"name":"base","text":"Alpha team, this is Bravo. We have eyes on the ridge and the road is clear. Moving up to the bridge now, over.","ex":0.4}]' > ref.json
# (generate ref/base.wav with that line, then:)
for n in deep:0.80 low:0.89 light:1.12 high:1.26 cmd:0.84; do ffmpeg -y -i ref/base.wav -af "rubberband=pitch=${n#*:}" ref/${n%%:*}.wav; done
python3 <repo>/tools/voices/jobs.py <repo>/src/game.ts   # the list of lines, from the game's own text
.venv/bin/python <repo>/tools/voices/bake.py              # up to 4 takes a line; a speech recogniser keeps the take that says it right
.venv/bin/python <repo>/tools/voices/pack.py <repo>/src/voice
```

`bake.py` skips lines already in `clips/`, so delete a clip to remake it. Its `report.json` lists what the recogniser heard for each line: read the low scores and listen to those.

Lines with numbers or names in them ("12 blocks of sandbags") can't be made ahead, so the speaker says "Copy that.", "On it." or "Understood." instead.
