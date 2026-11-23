import json, re, os, sys, time, warnings, difflib, numpy as np, soundfile as sf
warnings.filterwarnings('ignore')
from mlx_audio.tts.utils import load_model as load_tts
from mlx_audio.stt.utils import load_model as load_stt
from transformers import WhisperProcessor
tts = load_tts('mlx-community/chatterbox-fp16')
stt = load_stt('mlx-community/whisper-large-v3-turbo'); stt._processor = WhisperProcessor.from_pretrained('openai/whisper-large-v3-turbo')
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ')).split()
os.makedirs('clips', exist_ok=True); report = []
jobs = json.load(open('jobs.json'))
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
        if score > best[0]: best = (score, a, heard)
        if score >= 0.99: break
    sf.write(out, best[1], tts.sample_rate)
    report.append(dict(name=j['name'], voice=j['voice'], text=j['text'], heard=best[2], score=round(best[0], 2), takes=take + 1))
    print(j['name'], j['voice'], round(best[0], 2), take + 1, '|', j['text'], '=>', best[2], flush=True)
    json.dump(report, open('report.json', 'w'), indent=0)
