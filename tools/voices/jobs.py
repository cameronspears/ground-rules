# The list of radio lines to record, with how each is acted: unit lines and their cues from script.py,
# plus the lines every fighter shares, the stand-ins for lines with names or numbers in them, and the
# few fixed lines the builder, scouts and Command say. Writes jobs.json for el_bake.py / pack.py.
import json, sys, hashlib, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from script import U, BUILDER, ACK
CALM = ('builder', 'salv', 'cmd')
jobs = {}
def add(voice, line, cue=None):
    if cue is None: cue = 'calm' if voice == 'cmd' else 'shouting' if line.endswith('!') and voice not in CALM else ''
    jobs.setdefault(voice + '|' + line, dict(voice=voice, text=line, cue=cue))
for name, (v, kinds) in U.items():
    for ls in kinds.values():
        for line, cue in ls: add(v, line, cue)
ANY = ['Engaging.', 'Target acquired.', 'With pleasure.', 'They had it coming.', 'Moving up together.', 'Forming up. We go in as one.', 'Advancing in formation.',
       'Falling back!', 'Pulling out!', 'Back to base, go!', 'Nowhere to fall back to.', 'Moving in.', 'Under new management, coming up.', 'Mount up! Everyone riding.',
       'Walking the line.', 'Holding here. Nothing gets past.', 'Reporting for duty.', 'Abandoned machine claimed. Back in the fight.',
       'Another one inside. Cosy.', 'Captured. The previous owners left in a hurry.', 'Promoted!', 'Veteran now.', 'Elite!',
       "We can't get all the way there. Going as close as we can.", "We'll barely scratch that!", 'Mount up!', 'Guarding it.']
for v in ['inf1', 'inf2', 'inf3', 'tank', 'gun', 'builder', 'salv']:
    for l in ANY: add(v, l)
    for l in ACK[v]: add(v, l)
for ls in BUILDER.values():
    for line, cue in ls: add('builder', line, cue)
for l in ["It can't go there.", 'Nothing fits along there. Drag along open ground.', 'The bridge is back up.', 'Rebuilding the bridge.', 'Everybody out.']: add('builder', l, 'folksy')
add('salv', 'Salvager reporting. Show me the scrap.', 'proud')
for l in ["Heading out. I'll find them.", 'Going looking.', "Eyes out. Back when I'm hurt.", 'Taking fire, coming home!']: add('inf3', l)
for l in ['Reinforcements on the way.', 'We lost a veteran.', 'We lost an elite crew.', 'Every builder is busy.', 'Strike called down from orbit.', 'Our strike was intercepted.', 'Orbital strike destroyed in flight!', 'Barrage incoming.', 'Copy that.', 'Understood.']: add('cmd', l)
out = [dict(name=hashlib.md5(k.encode()).hexdigest()[:10], **j) for k, j in jobs.items()]  # (named by voice and words, so a remake only records new lines)
json.dump(out, open('jobs.json', 'w'), indent=0)
print(len(out), 'lines')
