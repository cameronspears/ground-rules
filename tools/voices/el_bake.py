# Records every line in jobs.json with ElevenLabs (the key in ~/.elevenlabs-key), each in its voice
# with its acting cue, then checks it with a speech recogniser and retakes once if it says it wrong.
# Lines already in clips/ are skipped, so delete a clip to remake it. Run from the folder with jobs.json.
import json, os, re, subprocess, difflib, urllib.request, numpy as np, soundfile as sf, warnings
warnings.filterwarnings('ignore')
KEY = open(os.path.expanduser('~/.elevenlabs-key')).read().strip()
CAST = {'tank': 'Tw2LVqLUUWkxqrCfFOpw', 'gun': 'TTyZrDYo6LQowrH8mixJ', 'builder': 'NOpBlnGInO9m6vDvFkFC', 'inf1': '6IwYbsNENZgAB1dtBZDp',
        'inf2': 'IRHApOXLvnW57QJPQH2P', 'inf3': '2vubyVoGjNJ5HPga4SkV', 'cmd': 'exurTFaGNF2gnRcPNH8I', 'salv': 'mSOmKHC6GZcZbSTGlqHO'}  # Cole, Joseph, Spuds, Jett, Adam, Chris, Philip, Mister Gruff
if os.environ.get('SET') == 'nations':  # the Plains Nations' cast: voices designed in ElevenLabs (tools/voices.md), each the take measured closest to real Native speakers of English
    CAST = {"inf1": "pYaCMQJANxuKuHtT0Nvu", "inf2": "35YKJGdVMNUvfgrUxdCX", "inf3": "rAoZ7WneD6C5fDN6lQsj", "tank": "VaW5fy4DpIz8fyFXM9wl", "gun": "iQJ8kzTLpEW0cZTvn718", "builder": "Gy6Nu3rvSYrEOOwEuMEj", "salv": "KVtJaMR1htfzOho0DibX", "cmd": "YXvlIBmx09p433jWBezX"}
if os.environ.get('SET') == 'west':  # the Wild West's cast (library voices): Russel, David (Southern), Spuds, Leo, John Morgan, Clifford, Caleb, Rusty Wade
    CAST = {'tank': 'Av4Fi2idMFuA8kTbVZgv', 'gun': '0hh7H4ZVAtaGpm1VZyEN', 'builder': 'NOpBlnGInO9m6vDvFkFC', 'inf1': 'LU5OOSOG4j7JA2f2qPc4',
            'inf2': 'ruirxsoakN0GWmGNIo04', 'inf3': 'H2CgnIux8C0XLWQ97uPA', 'cmd': 'V6zMK42bu1TVQBA7MwcF', 'salv': 'B5nXKjaYRMU7hmcu1Fhk'}
from mlx_audio.stt.utils import load_model
from transformers import WhisperProcessor
stt = load_model('mlx-community/whisper-large-v3-turbo'); stt._processor = WhisperProcessor.from_pretrained('openai/whisper-large-v3-turbo')
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ').replace("'em", 'them')).split()
def say(voice, text, cue):
    body = {'text': (f'[{cue}] ' if cue else '') + text, 'model_id': 'eleven_v4'}
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{CAST[voice]}?output_format=mp3_44100_128', json.dumps(body).encode(), {'xi-api-key': KEY, 'Content-Type': 'application/json'})
    open('tmp.mp3', 'wb').write(urllib.request.urlopen(req).read())
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'tmp.mp3', '-ac', '1', '-ar', '24000', 'tmp.wav'], check=True)
    a, sr = sf.read('tmp.wav'); idx = np.where(np.abs(a) > 0.02)[0]
    if len(idx): a = a[max(0, idx[0] - 600): idx[-1] + 2400]  # trim silence, peak to -1 dB
    a = a / (np.abs(a).max() + 1e-9) * 0.89; sf.write('tmp.wav', a, sr)
    heard = stt.generate('tmp.wav', language='en').text.strip()
    return a, sr, heard, difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
os.makedirs('clips', exist_ok=True); report = []
for j in json.load(open('jobs.json')):
    out = f"clips/{j['name']}.wav"
    if os.path.exists(out): continue
    best = None
    for take in range(2):
        try: r = say(j['voice'], j['text'], j['cue'])
        except urllib.error.HTTPError as e: print('FAIL', j['voice'], j['text'], e.code, e.read()[:200], flush=True); break
        if not best or r[3] > best[3]: best = r
        if r[3] >= 0.85: break
    if not best: continue
    sf.write(out, best[0], best[1])
    report.append(dict(voice=j['voice'], text=j['text'], heard=best[2], score=round(best[3], 2), takes=take + 1))
    print(j['voice'], round(best[3], 2), take + 1, '|', j['text'], '=>', best[2], flush=True)
    json.dump(report, open('report.json', 'w'), indent=0)
