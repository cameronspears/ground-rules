# Ears for the sound effects: measures each take for what makes a sound annoying, so a bad one is caught
# before it reaches the game. Used by sfx_pack.py (which evens out loudness and drops flagged takes); run
# on its own to see the report: python sfx_check.py  (from the folder with sfx/).
#   loud   how loud it sounds (the loudest 0.4 s, weighted like the ear: highs count more than lows), dBFS
#   harsh  how much of it is shrill (2.5-8 kHz), 0..1
#   tonal  how much of it is one held pitch, like a whistle, 0..1
#   words  anything a speech recogniser hears in it (an effect shouldn't talk)
import numpy as np
from scipy.signal import butter, sosfilt

SR = 32000
_hp = butter(2, 60, 'highpass', fs=SR, output='sos')
_hi = butter(1, 1500, 'highpass', fs=SR, output='sos')
_sh = butter(4, [2500, 8000], 'bandpass', fs=SR, output='sos')

def ear(a):  # roughly how the ear weights sound (the K-weighting loudness meters use)
    a = sosfilt(_hp, a)
    return a + 0.6 * sosfilt(_hi, a)

def loudness(a):
    k = ear(a) ** 2; w = int(0.4 * SR)
    if len(k) <= w: return 10 * np.log10(k.mean() + 1e-12)
    c = np.convolve(k, np.ones(w) / w, 'valid')
    return float(10 * np.log10(c.max() + 1e-12))

def harshness(a):
    e = (sosfilt(_hp, a) ** 2).sum() + 1e-12
    return float((sosfilt(_sh, a) ** 2).sum() / e)

def tonality(a):  # the share of frames where one narrow pitch (300 Hz-4 kHz) carries most of the energy
    n = 2048; frames = [a[i:i + n] for i in range(0, len(a) - n, n // 2)]
    if not frames: return 0.0
    hits = 0; loud = 0
    for f in frames:
        s = np.abs(np.fft.rfft(f * np.hanning(n))) ** 2
        if s.sum() < 1e-6: continue
        loud += 1
        band = s[int(300 * n / SR): int(4000 * n / SR)]
        k = band.argmax(); peak = band[max(0, k - 2): k + 3].sum()
        if peak / s.sum() > 0.35: hits += 1
    return hits / loud if loud else 0.0

_stt = None
def words(path):
    global _stt
    if _stt is None:
        import warnings; warnings.filterwarnings('ignore')
        from mlx_audio.stt.utils import load_model
        from transformers import WhisperProcessor
        _stt = load_model('mlx-community/whisper-large-v3-turbo'); _stt._processor = WhisperProcessor.from_pretrained('openai/whisper-large-v3-turbo')
    r = _stt.generate(path, language='en')
    # On noise it invents words, but unsure of them (average log-probability -3 to -5); real speech scores about -0.3.
    sure = [s.get('text', '') for s in (getattr(r, 'segments', None) or []) if s.get('avg_logprob', -9) > -0.7]
    t = ' '.join(sure).strip()
    return t if len(t.split()) >= 2 and t.lower().strip(' .!') not in ('thank you', 'thanks for watching') else ''  # (its favourite inventions on a quiet tail)

# What each sound may be without it counting against it (a shell's shriek is meant to be a held pitch).
TONAL_OK = {'incoming', 'bombs', 'powerdown', 'orbital', 'intercept', 'jet', 'rotor', 'engine', 'birds', 'crickets', 'trained'}
HARSH_OK = {'incoming', 'rifle', 'mg', 'flak', 'hammer', 'crate', 'intercept', 'grenade', 'scrap', 'sell', 'crickets', 'birds', 'fire', 'crush'}

def flags(key, a, path=None):
    out = []
    h, t = harshness(a), tonality(a)
    if h > 0.45 and key not in HARSH_OK: out.append(f'harsh {h:.2f}')
    if t > (0.6 if key in TONAL_OK else 0.3): out.append(f'whistle-like {t:.2f}')
    if path:
        w = words(path)
        if w: out.append(f'says "{w}"')
    return out, h, t

if __name__ == '__main__':
    import glob, os, re, subprocess, sys, soundfile as sf
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from sfx import SFX
    for key, *_ in SFX:
        for f in sorted(glob.glob(f'sfx/{key}*.mp3')):
            if not re.fullmatch(rf'sfx/{key}(\d+|_pick)\.mp3', f): continue
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f, '-ac', '1', '-ar', str(SR), 'chk.wav'], check=True)
            a, _ = sf.read('chk.wav'); a = a / (np.abs(a).max() + 1e-9)
            fl, h, t = flags(key, a, 'chk.wav')
            print(f'{f:28s} loud {loudness(a):6.1f}  harsh {h:.2f}  tonal {t:.2f}  ' + ('  <-- ' + ', '.join(fl) if fl else ''))
