// WILD WEST: the list of radio lines to record, from src/west/radio.ts (the words and their acting cues), in the
// same jobs.json shape jobs.py writes for the army's voices. Run in the scratch folder, then el_bake.py and pack.py
// with SET=west (see tools/voices.md); SET=nations makes the Plains Nations' list.   node <repo>/tools/voices/jobs-west.mjs
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { load } from '../load.mjs';

const here = process.cwd(); process.chdir(fileURLToPath(new URL('../..', import.meta.url))); // (the game's code loads from the repo; the list lands where it was run)
const NAT = process.env.SET === 'nations'; // SET=nations: the Plains Nations' lines (west/nations-radio.ts), for their own voices
const { mods: [M], close } = await load(NAT ? '/src/west/nations-radio.ts' : '/src/west/radio.ts');
const R = NAT ? { BARKS_CUED: M.NATION_BARKS_CUED, LINES_CUED: M.NATION_LINES_CUED, PIONEER_CUED: M.NATION_BUILDER_CUED, ACK_W: M.NATION_ACK } : M;
const VOICE = { tank: 'tank', colossus: 'tank', artillery: 'gun', quad: 'gun', builder: 'builder', harvester: 'salv', rifle: 'inf1', rocket: 'inf2', grenadier: 'inf3', scout: 'inf3', gunship: 'inf3', bomber: 'inf3' };
const CALM = ['builder', 'salv', 'cmd'], FIGHTERS = ['inf1', 'inf2', 'inf3', 'tank', 'gun', 'builder', 'salv'];
const jobs = new Map();
const add = (voice, text, cue) => { if (cue === undefined || cue === '') cue = voice === 'cmd' ? 'calm' : text.endsWith('!') && !CALM.includes(voice) ? 'shouting' : ''; if (!jobs.has(voice + '|' + text)) jobs.set(voice + '|' + text, { voice, text, cue }); };
for (const [k, b] of Object.entries(R.BARKS_CUED)) for (const ls of Object.values(b)) for (const [t, c] of ls) add(VOICE[k], t, c);
// who says each fixed line: the marshal's news, the pioneer's notes, the prospector's hello, the scout rider's, and everyone's shared lines
const MARSHAL = ['Reinforcements on the way.', 'We lost a veteran.', 'We lost an elite crew.', 'Every builder is busy.', 'Strike called down from orbit.', 'Our strike was intercepted.', 'Orbital strike destroyed in flight!', 'Barrage incoming.', 'Understood.'];
const PIONEER = ["It can't go there.", 'Nothing fits along there. Drag along open ground.', 'The bridge is back up.', 'Rebuilding the bridge.', 'Everybody out.'];
const RIDER = ["Heading out. I'll find them.", 'Going looking.', "Eyes out. Back when I'm hurt.", 'Taking fire, coming home!'];
for (const [orig, [t, c]] of Object.entries(R.LINES_CUED)) {
  const who = MARSHAL.includes(orig) ? ['cmd'] : PIONEER.includes(orig) ? ['builder'] : RIDER.includes(orig) ? ['inf3'] : orig.startsWith('Salvager') ? ['salv'] : FIGHTERS;
  for (const v of who) add(v, t, c);
}
for (const ls of Object.values(R.PIONEER_CUED)) for (const [t, c] of ls) add('builder', t, c);
for (const [v, ls] of Object.entries(R.ACK_W)) for (const t of ls) add(v, t);
const out = [...jobs.entries()].map(([k, j]) => ({ name: createHash('md5').update(k).digest('hex').slice(0, 10), ...j })); // (named by voice and words, so a remake only records new lines)
writeFileSync(here + '/jobs.json', JSON.stringify(out, null, 0));
console.log(out.length, 'lines');
await close();
