# Packs the sound effects in sfx/ (from sfx_bake.py; a <key>_pick.mp3 is a take chosen by ear and is
# kept beside the fresh ones) into one file for the game: <out>/sfx.mp3 and <out>/clips.ts, where each
# sound's takes sit. Every take goes through sfx_check.py's ears first: one that's whistle-like, shrill
# or talks is dropped when the sound has a clean take; a shrill one that has to stay is softened. Then
# each is set to the same loudness as heard (not the same peak: a dense engine at the same peak as a
# sharp bang sounds far louder), so the levels in src/audio.ts are the whole story.
import glob, os, re, subprocess, sys, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sfx import SFX
from sfx_check import SR, loudness, flags, harshness
out_dir = sys.argv[1]; GAP = 0.12; TARGET = -20.0  # dBFS, as heard
LOOPS = {'wind', 'fire'}
soften = butter(2, 2500, 'lowpass', fs=SR, output='sos')
parts, idx, pos = [], {}, 0.0
for key, *_ in SFX:
    files = sorted(glob.glob(f'sfx/{key}_pick.mp3')) + sorted(f for f in glob.glob(f'sfx/{key}*.mp3') if re.fullmatch(rf'sfx/{key}\d+\.mp3', f))
    takes = []
    for f in files:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f, '-ac', '1', '-ar', str(SR), 'tmp.wav'], check=True)
        a, _ = sf.read('tmp.wav')
        if key not in LOOPS:
            e = np.where(np.abs(a) > 0.01 * np.abs(a).max())[0]
            if not len(e): continue
            a = a[max(0, e[0] - 160): e[-1] + 1600]
        fl, h, _ = flags(key, a / (np.abs(a).max() + 1e-9), 'tmp.wav')
        takes.append((f, a, fl, h))
    clean = [t for t in takes if not t[2]]
    keep = clean or sorted(takes, key=lambda t: len(t[2]))[:1]  # (every take flagged: the least bad stays)
    if key in LOOPS or key in ('birds', 'night'): keep = keep[:1]  # (one loop is plenty; a pick comes first)
    for f, a, fl, h in takes:
        if (f, a, fl, h) not in keep and fl: print('dropped', f, '-', ', '.join(fl))
    for f, a, fl, h in keep:
        if any(x.startswith('harsh') for x in fl):
            for _ in range(3):  # take the edge off, a little at a time
                if harshness(a) <= 0.4: break
                a = 0.5 * a + 0.5 * sosfilt(soften, a)
            print('softened', f)
        a = a * 10 ** ((TARGET - loudness(a)) / 20)
        if np.abs(a).max() > 0.89: a = a / np.abs(a).max() * 0.89  # (never past -1 dB)
        if key not in LOOPS:
            fade = min(len(a) // 4, int(0.03 * SR)); a[-fade:] *= np.linspace(1, 0, fade)  # no click at the end
        idx.setdefault(key, []).append([round(pos, 4), round(len(a) / SR, 4)])
        parts += [a, np.zeros(int(GAP * SR))]; pos += len(a) / SR + GAP
sf.write('sfx.wav', np.concatenate(parts).astype(np.float32), SR)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'sfx.wav', '-c:a', 'libmp3lame', '-b:a', '64k', f'{out_dir}/sfx.mp3'], check=True)
with open(f'{out_dir}/clips.ts', 'w') as fh:
    fh.write("// Where each sound effect's takes sit in sfx.mp3: key -> [start, length] in seconds, one per take. Made by tools/voices/sfx_pack.py; don't edit by hand.\n")
    fh.write('export const SFX: Record<string, [number, number][]> = {\n' + ''.join(f'  {k}: {v},\n' for k, v in idx.items()) + '};\n')
print(sum(map(len, idx.values())), 'takes of', len(idx), 'sounds,', round(pos, 1), 's,', os.path.getsize(f'{out_dir}/sfx.mp3') // 1024, 'KB')
