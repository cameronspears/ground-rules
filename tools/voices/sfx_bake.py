# Makes the sound effects in sfx.py with ElevenLabs' sound generator: out/<key><take>.mp3. Takes
# already made are skipped. Run from the folder the effects should land in.
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SFX = __import__('sfx_west' if os.environ.get('SET') == 'west' else 'sfx').SFX  # (SET=west: the Wild West's effects)
KEY = open(os.path.expanduser('~/.elevenlabs-key')).read().strip()
os.makedirs('sfx', exist_ok=True)
for key, group, name, when, prompt, secs, takes in SFX:
    for t in range(takes):
        out = f'sfx/{key}{t}.mp3'
        if os.path.exists(out): continue
        body = {'text': prompt, 'duration_seconds': secs, 'prompt_influence': 0.6}
        if 'loop' in prompt: body['loop'] = True
        req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', json.dumps(body).encode(), {'xi-api-key': KEY, 'Content-Type': 'application/json'})
        try: open(out, 'wb').write(urllib.request.urlopen(req).read()); print('ok', out, flush=True)
        except urllib.error.HTTPError as e: print('FAIL', out, e.code, e.read()[:200], flush=True)
