import json, re, os, sys, time, warnings, difflib, numpy as np, soundfile as sf
warnings.filterwarnings('ignore')
from mlx_audio.tts.utils import load_model as load_tts
from mlx_audio.stt.utils import load_model as load_stt
from transformers import WhisperProcessor
tts = load_tts('mlx-community/chatterbox-fp16')
stt = load_stt('mlx-community/whisper-large-v3-turbo'); stt._processor = WhisperProcessor.from_pretrained('openai/whisper-large-v3-turbo')
def pitch(a, sr):  # median voice pitch (Hz): a man's speaking voice sits well under 150
    fr, f0 = int(sr * 0.04), []
    for i in range(0, len(a) - fr, fr // 2):
        x = a[i:i + fr]
        if np.sqrt((x * x).mean()) < 0.05: continue
        c = np.correlate(x, x, 'full')[fr - 1:]; lo, hi = int(sr / 400), int(sr / 60); k = lo + np.argmax(c[lo:hi])
        if c[k] > 0.4 * c[0]: f0.append(sr / k)
    return float(np.median(f0)) if f0 else 0
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ')).split()
os.makedirs('clips', exist_ok=True); report = []
shard, shards = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (0, 1)  # run several at once: bake.py 0 2 & bake.py 1 2
jobs = json.load(open('jobs.json'))[shard::shards]
for j in jobs:
    out = f"clips/{j['name']}.wav"
    if os.path.exists(out): continue
    best = (-1, None, '')
    for take in range(4):
        a = np.concatenate([np.array(r.audio) for r in tts.generate(text=j['text'], ref_audio=j['ref'], exaggeration=j['ex'], cfg_weight=j['cfg'], temperature=0.8, verbose=False)])
        # trim silence, then peak to -1 dB
        e = np.abs(a) > 0.02; idx = np.where(e)[0]
        if len(idx): a = a[max(0, idx[0] - 600): idx[-1] + 2400]
        a = a / (np.abs(a).max() + 1e-9) * 0.89
        sf.write('tmp.wav', a, tts.sample_rate)
        heard = stt.generate('tmp.wav', language='en').text.strip()
        score = difflib.SequenceMatcher(None, norm(j['text']), norm(heard)).ratio()
        if pitch(a, tts.sample_rate) > 150: score -= 0.3  # too high: it starts to sound like a woman, which doesn't fit
        if score > best[0]: best = (score, a, heard)
        if score >= 0.95: break
    sf.write(out, best[1], tts.sample_rate)
    report.append(dict(name=j['name'], voice=j['voice'], text=j['text'], heard=best[2], score=round(best[0], 2), takes=take + 1))
    print(j['name'], j['voice'], round(best[0], 2), take + 1, '|', j['text'], '=>', best[2], flush=True)
    json.dump(report, open(f'report{shard}.json', 'w'), indent=0)
