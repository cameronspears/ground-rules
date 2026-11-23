import re, json, sys, hashlib
src = open(sys.argv[1]).read()
# unit name -> voice (kept in step with VOICE in src/audio.ts)
VOICE = {'Rifleman':'inf1','Rocket Soldier':'inf2','Grenadier':'inf3','Battle Tank':'tank','Juggernaut':'tank','Colossus':'tank','Field Gun':'gun','Flak Truck':'gun','Scout Buggy':'inf3','Gunship':'inf3','Bomber':'inf3','Builder':'builder','Salvager':'builder'}
CALM = ('builder', 'cmd')
jobs = {}
def add(voice, line):
    hot = line.endswith('!')
    jobs[voice + '|' + line] = dict(voice=voice, text=line, ex=0.5 if voice in CALM else 1.15 if hot else 1.0, cfg=0.5 if voice in CALM else 0.3)
name = None
for ln in src.split('\n'):
    n = re.search(r"\bname: '([^']+)'", ln)
    if n: name = n.group(1)
    m = re.search(r"barks: \{ select: \[(.*?)\], move: \[(.*?)\](?:, attack: \[(.*?)\])? \}", ln)
    if m:
        for part in m.groups(''):
            for s in re.findall(r"'((?:[^'\\]|\\.)*)'", part): add(VOICE[name], s.replace("\\'", "'"))
ANY = ['Engaging.','Target acquired.','With pleasure.','They had it coming.','Moving up together.','Forming up. We go in as one.','Advancing in formation.',
       'Falling back!','Pulling out!','Back to base, go!','Nowhere to fall back to.','Moving in.','Under new management, coming up.','Mount up! Everyone riding.',
       'Walking the line.','Holding here. Nothing gets past.','Reporting for duty.','Abandoned machine claimed. Back in the fight.',
       'Another one inside. Cosy.','Captured. The previous owners left in a hurry.','Promoted!','Veteran now.','Elite!',
       "We can't get all the way there. Going as close as we can.",
       'Copy that.','On it.','Understood.']
for v in ['inf1','inf2','inf3','tank','gun','builder']:
    for l in ANY: add(v, l)
# Plain acknowledgements and stand-ins for lines with names or numbers in them (ACK and SAY in src/audio.ts: keep them the same)
FIGHT = ["We'll barely scratch that!", 'Mount up!', 'Guarding it.']
OWN = {'inf': ['Roger.', 'Wilco.', 'Yes sir!', 'Consider it done.', 'You got it, boss.'] + FIGHT,
       'tank': ['Roger that.', 'Rolling.', 'Consider it done.', 'Tracks turning.', 'Heard you.'] + FIGHT,
       'gun': ['Roger.', 'Laying it in.', 'Consider it done.', "Gun's ready.", 'Heard, sir.'] + FIGHT,
       'builder': ['Leave it with us.', 'Can do.', "We'll sort it.", 'Right you are.', 'Tools out.', 'Marked out.', 'Rebuilding the bridge.',
                   'Construction complete.', 'Job done.', "That's built.", 'All finished.', 'Ready when you are.',
                   "We'll get to it.", 'Next in line.', 'After this one.', 'Sandbags going up.', 'Digging in.', 'Bags coming.']}
for v in ['inf1','inf2','inf3','tank','gun','builder']:
    for l in OWN['inf' if v.startswith('inf') else v]: add(v, l)
for l in ['Breaking ground.','It can\'t go there.','Nothing fits along there. Drag along open ground.','The bridge is back up.','Salvager reporting. Show me the scrap.','Everybody out.']: add('builder', l)
for l in ['Heading out. I\'ll find them.','Going looking.','Eyes out. Back when I\'m hurt.','Taking fire, coming home!']: add('inf3', l)
for l in ['Reinforcements on the way.','We lost a veteran.','We lost an elite crew.','Every builder is busy.','Strike called down from orbit.','Our strike was intercepted.','Orbital strike destroyed in flight!','Barrage incoming.','Copy that.','Understood.']: add('cmd', l)
out = [dict(name=hashlib.md5(k.encode()).hexdigest()[:10], ref='ref/%s.wav' % j['voice'], **j) for k, j in jobs.items()]  # (named by voice and words, so a remake only records new lines)
json.dump(out, open('jobs.json', 'w'), indent=0)
print(len(out), 'clips;', len([1 for m in re.finditer('barks: {', src)]), 'units with barks')
