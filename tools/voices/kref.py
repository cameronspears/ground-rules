import sys, numpy as np, soundfile as sf, espeakng_loader
espeakng_loader.get_library_path = lambda: '/opt/homebrew/lib/libespeak-ng.dylib'
espeakng_loader.get_data_path = lambda: '/opt/homebrew/share/espeak-ng-data'
from mlx_audio.tts.utils import load_model
m = load_model('mlx-community/Kokoro-82M-bf16')
text = sys.argv[1]
for v in sys.argv[2:]:
    a = np.concatenate([np.array(r.audio) for r in m.generate(text=text, voice=v, verbose=False)])
    sf.write(f'kref/{v}.wav', a, m.sample_rate); print(v, round(len(a) / m.sample_rate, 1), flush=True)
