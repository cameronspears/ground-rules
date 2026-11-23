import re, json, sys
src = open(sys.argv[1]).read()
# unit name -> voice (kept in step with VOICE in src/audio.ts)
VOICE = {'Rifleman':'base','Rocket Soldier':'low','Grenadier':'light','Battle Tank':'deep','Juggernaut':'deep','Colossus':'deep','Field Gun':'low','Flak Truck':'low','Scout Buggy':'high','Gunship':'high','Bomber':'high','Builder':'light','Salvager':'light'}
jobs = {}
def add(voice, line):
    hot = line.endswith('!')
    jobs[voice + '|' + line] = dict(voice=voice, text=line, ex=0.85 if hot else (0.35 if voice == 'cmd' else 0.5), cfg=0.3 if hot else 0.5)
name = None
for ln in src.split('\n'):
    n = re.search(r"\bname: '([^']+)'", ln)
    if n: name = n.group(1)
    m = re.search(r"barks: \{ select: \[(.*?)\], move: \[(.*?)\] \}", ln)
    if m:
        for part in (m.group(1), m.group(2)):
            for s in re.findall(r"'((?:[^'\\]|\\.)*)'", part): add(VOICE[name], s.replace("\\'", "'"))
ANY = ['Engaging.','Target acquired.','With pleasure.','They had it coming.','Moving up together.','Forming up. We go in as one.','Advancing in formation.',
       'Falling back!','Pulling out!','Back to base, go!','Nowhere to fall back to.','Moving in.','Under new management, coming up.','Mount up! Everyone riding.',
       'Walking the line.','Holding here. Nothing gets past.','Reporting for duty.','Abandoned machine claimed. Back in the fight.',
       'Another one inside. Cosy.','Captured. The previous owners left in a hurry.','Promoted!','Veteran now.','Elite!',
       "We can't get all the way there. Going as close as we can.",
       'Copy that.','On it.','Understood.']  # (the last three: what anyone says to a line that has numbers or names in it)
for v in ['base','low','light','deep','high']:
    for l in ANY: add(v, l)
for l in ['Breaking ground.','It can\'t go there.','Nothing fits along there. Drag along open ground.','The bridge is back up.','Salvager reporting. Show me the scrap.','Everybody out.']: add('light', l)
for l in ['Heading out. I\'ll find them.','Going looking.','Eyes out. Back when I\'m hurt.','Taking fire, coming home!']: add('high', l)
for l in ['Reinforcements on the way.','We lost a veteran.','We lost an elite crew.','Every builder is busy.','Strike called down from orbit.','Our strike was intercepted.','Orbital strike destroyed in flight!','Barrage incoming.','Copy that.','Understood.']: add('cmd', l)
out = [dict(name='%03d' % i, ref='ref/%s.wav' % j['voice'], **j) for i, j in enumerate(jobs.values())]
json.dump(out, open('jobs.json', 'w'), indent=0)
print(len(out), 'clips;', len([1 for m in re.finditer('barks: {', src)]), 'units with barks')
