import json, os, sys, subprocess, numpy as np, soundfile as sf
out_dir = sys.argv[1]; SR = 16000; GAP = 0.15
jobs = json.load(open('jobs.json')); parts = []; idx = {}; pos = 0.0
for j in jobs:
    f = f"clips/{j['name']}.wav"
    if not os.path.exists(f): continue
    a, sr = sf.read(f)
    a = np.interp(np.arange(0, len(a) * SR / sr) * sr / SR, np.arange(len(a)), a)  # resample
    idx[j['voice'] + '|' + j['text']] = [round(pos + 0.02, 3), round(len(a) / SR, 3)]
    parts += [a, np.zeros(int(GAP * SR))]; pos += len(a) / SR + GAP
sf.write('radio.wav', np.concatenate(parts).astype(np.float32), SR)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'radio.wav', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '24k', f'{out_dir}/radio.mp3'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'radio.wav', '-ac', '1', '-c:a', 'libopus', '-b:a', '12k', '-application', 'voip', f'{out_dir}/radio.ogg'], check=True)  # what the game plays; the MP3 is for browsers without Opus
with open(f'{out_dir}/clips.ts', 'w') as fh:
    fh.write('// Where each radio line sits in radio.mp3: "voice|line" -> [start, length] in seconds. Made by tools/voices.md\'s steps; don\'t edit by hand.\n')
    fh.write('export const CLIPS: Record<string, [number, number]> = {\n' + ''.join(f'  {json.dumps(k)}: {v},\n' for k, v in idx.items()) + '};\n')
print(len(idx), 'clips,', round(pos, 1), 's,', os.path.getsize(f'{out_dir}/radio.mp3') // 1024, 'KB')
