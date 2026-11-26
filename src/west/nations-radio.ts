// WILD WEST: what the Plains Nations' people say, in plain words, with the cue each line is acted with (never shown).
// Swapped in for the army's lines when the side you play is the Nations; tools/voices/jobs-west.mjs records them with
// the Nations' own voices. A skilled, proud people: confident, dry, warm with each other; no put-on accent, no cliché.
// (Steer clear of the words west/words.ts swaps, like TANK or SCRAP: on screen they'd come out changed.)
type L = [string, string]; // [line, cue]
type Barks = { select: L[]; move: L[]; attack?: L[] };

export const NATION_BARKS_CUED: Record<string, Barks> = {
  rifle: { // Archer: young, quick, sure of the bow
    select: [['Bow strung.', 'calm'], ['Quiver is full.', 'eager'], ['Where do you need me?', 'eager'], ['I see them. Do you?', 'cocky'], ['Steady hands.', 'calm'], ['Ready.', 'eager']],
    move: [['Moving.', 'eager'], ['Quiet feet.', 'whispering'], ['Through the grass.', 'calm'], ['On my way.', 'eager'], ['Keeping low.', 'whispering'], ['Following.', 'calm']],
    attack: [['Loose!', 'shouting'], ['Arrows away!', 'shouting'], ['Find your mark!', 'shouting'], ['Again!', 'shouting']],
  },
  rocket: { // Fire Archer: hot-tempered and proud of it
    select: [['The fire is lit.', 'smug'], ['Show me iron.', 'growling'], ['Wood burns. So do wagons.', 'smug'], ['Point me at it.', 'growling'], ['Coals ready.', 'calm'], ['Balloons are cloth.', 'dry']],
    move: [['Carrying the fire.', 'calm'], ['Mind the sparks.', 'dry'], ['Moving.', 'calm'], ['Hunting iron.', 'growling'], ['Keep the coals alive.', 'calm'], ['Going.', 'dry']],
    attack: [['Fire arrow!', 'shouting'], ['Let it burn!', 'shouting'], ['Light the sky!', 'shouting'], ['Burn it down!', 'shouting']],
  },
  grenadier: { // Shield Warrior: big, calm, unstoppable up close
    select: [['Shield up.', 'calm'], ['Let them come.', 'growling'], ['Close is where I fight.', 'proud'], ['I hold.', 'calm'], ['Name the door.', 'growling'], ['Ready.', 'calm']],
    move: [['Moving in.', 'calm'], ['Shield first.', 'calm'], ['Closing the distance.', 'growling'], ['Walking.', 'calm'], ['Stay behind me.', 'proud'], ['Forward.', 'growling']],
    attack: [['Charge!', 'shouting'], ['Break their line!', 'shouting'], ['Into them!', 'shouting'], ['Smash it!', 'shouting']],
  },
  scout: { // Mounted Archer: the fastest, and knows it
    select: [['My horse is ready.', 'cocky'], ['Nothing outruns us.', 'cocky'], ['Where to?', 'excited'], ['I ride, I see.', 'calm'], ['Light and fast.', 'cocky'], ['Say the word.', 'excited']],
    move: [['Riding!', 'excited'], ['Like the wind.', 'laughs'], ['Gone.', 'cocky'], ['Back before dark.', 'cocky'], ['Over the ridge.', 'excited'], ['Fast and quiet.', 'calm']],
    attack: [['Ride and shoot!', 'shouting'], ['Circle them!', 'shouting'], ["Can't catch us!", 'laughs'], ['Strike and away!', 'shouting']],
  },
  tank: { // Lancers: proud riders, brave to a fault
    select: [['Lances high.', 'proud'], ['Horses are eager.', 'calm'], ['Point the way.', 'proud'], ['We ride as one.', 'proud'], ['Ready to charge.', 'growling'], ['Our shields are painted.', 'calm']],
    move: [['Riding out.', 'calm'], ['Together.', 'proud'], ['At a trot.', 'calm'], ['Keep the line.', 'calm'], ['Moving up.', 'calm'], ['Hooves on the plain.', 'proud']],
    attack: [['Charge!', 'shouting'], ['Lances down!', 'shouting'], ['Ride them down!', 'shouting'], ['For the people!', 'shouting']],
  },
  juggernaut: { // Shield Riders: the heaviest riders, slow to anger
    select: [['A wall on horseback.', 'proud'], ['Nothing gets through.', 'growling'], ['Heavy and ready.', 'calm'], ['Our shields hold.', 'proud'], ['Show us the line.', 'growling'], ['We are the wall.', 'calm']],
    move: [['Steady.', 'calm'], ['Shields together.', 'calm'], ['Slow and sure.', 'calm'], ['Making the wall.', 'growling'], ['Moving.', 'calm'], ['Keep close.', 'calm']],
    attack: [['Push!', 'shouting'], ['Hold and strike!', 'shouting'], ['Break them!', 'shouting'], ['Through!', 'shouting']],
  },
  artillery: { // Volley Archers: patient elders of the bow
    select: [['Give us the distance.', 'calm'], ['Our arrows fall like rain.', 'proud'], ['Far is no trouble.', 'dry'], ['We are patient.', 'calm'], ['Show us the camp.', 'calm'], ['Strings are taut.', 'calm']],
    move: [['Moving the bows.', 'calm'], ['Slow and careful.', 'grumbling'], ['Keep the riders near.', 'grumbling'], ['To the next hill.', 'calm'], ['Carrying the bundles.', 'calm'], ['On our way.', 'calm']],
    attack: [['Volley!', 'shouting'], ['Let it rain!', 'shouting'], ['Again, all together!', 'shouting'], ['Darken the sky!', 'shouting']],
  },
  flak: { // Sky Archers: sharp-eyed and dry
    select: [['Eyes on the sky.', 'calm'], ['Let them fly over.', 'dry'], ['Balloons burn.', 'smug'], ['We watch the clouds.', 'calm'], ['Strings up.', 'calm'], ['Nothing flies free.', 'smug']],
    move: [['Moving.', 'calm'], ['Watching up.', 'calm'], ['Keeping pace.', 'grumbling'], ['Covering you.', 'calm'], ['Following the sky.', 'calm'], ['Going.', 'calm']],
    attack: [['Up there!', 'shouting'], ['Shoot it down!', 'shouting'], ['Bring it to earth!', 'shouting'], ['Again!', 'shouting']],
  },
  colossus: { // Great Herd's drivers: the thunder of the plains
    select: [['The herd is restless.', 'proud'], ['Hear that? That is us.', 'proud'], ['The ground trembles.', 'slow, booming'], ['They follow us.', 'calm'], ['Point the herd.', 'proud'], ['Like thunder.', 'slow, booming']],
    move: [['Driving the herd.', 'calm'], ['Easy, easy.', 'calm'], ['The herd moves.', 'slow, booming'], ['Make room.', 'proud'], ['Keep them together.', 'calm'], ['Onward.', 'slow, booming']],
    attack: [['Stampede!', 'shouting'], ['Let them run!', 'shouting'], ['Trample them!', 'shouting'], ['Thunder!', 'shouting']],
  },
  builder: { // Lodge Builders: an easygoing old builder who has raised a hundred lodges
    select: [['Poles and covers ready.', 'cheerful'], ['Where shall we camp?', 'cheerful'], ['I have raised many lodges.', 'proud'], ['Show me the ground.', 'folksy'], ['A good place, this.', 'folksy'], ['Ready to build.', 'cheerful']],
    move: [['Packing up.', 'cheerful'], ['The horse knows the way.', 'folksy'], ['Moving camp.', 'cheerful'], ['On my way.', 'cheerful'], ['Dragging the poles.', 'grumbling'], ['Coming.', 'folksy']],
  },
  harvester: { // Traders: shrewd and friendly
    select: [['Good trade today.', 'cheerful'], ['Gold buys much.', 'folksy'], ['Where are the diggings?', 'cheerful'], ['The pack horse is ready.', 'folksy'], ['I know a fair price.', 'proud'], ['Trader here.', 'cheerful']],
    move: [['Heading out.', 'cheerful'], ['To the diggings.', 'folksy'], ['Heavy load.', 'grumbling'], ['Back to camp.', 'folksy'], ['On my way.', 'cheerful'], ['Slow and steady.', 'folksy']],
  },
};

// The Nations' lines for the shared moments (where they differ from the Settlers')
export const NATION_LINES_CUED: Record<string, L> = {
  'Engaging.': ['Here they come.', ''], 'Target acquired.': ['I see them.', ''], 'With pleasure.': ['Gladly.', ''], 'They had it coming.': ['They chose this.', ''],
  'Moving up together.': ['Moving up together.', ''], 'Forming up. We go in as one.': ['Together now. We go in as one.', ''], 'Advancing in formation.': ['Advancing together.', ''],
  'Falling back!': ['Fall back!', ''], 'Pulling out!': ['Pull back!', ''], 'Back to base, go!': ['Back to camp, go!', ''], 'Nowhere to fall back to.': ['Nowhere left to go.', ''],
  'Moving in.': ['Moving in.', ''], 'Under new management, coming up.': ['This place is ours now.', ''], 'Mount up! Everyone riding.': ['Mount up! Everyone riding.', ''],
  'Walking the line.': ['Watching the line.', ''], 'Holding here. Nothing gets past.': ['Holding here. Nothing gets past.', ''], 'Reporting for duty.': ['Ready for duty.', ''],
  'Abandoned machine claimed. Back in the fight.': ['Found it abandoned. It fights for us now.', ''], 'Another one inside. Cosy.': ['Another one inside.', ''],
  'Captured. The previous owners left in a hurry.': ['Taken. They left in a hurry.', ''], 'Promoted!': ['Honoured!', ''], 'Veteran now.': ['Seasoned now.', ''], 'Elite!': ['A legend of the people!', ''],
  "We can't get all the way there. Going as close as we can.": ["We can't reach it all the way. Going as close as we can.", ''], "We'll barely scratch that!": ["We'll barely mark that!", ''],
  'Mount up!': ['Mount up!', ''], 'Guarding it.': ['Watching over it.', ''],
  "It can't go there.": ["We can't raise it there.", 'folksy'], 'Nothing fits along there. Drag along open ground.': ['Nothing fits along there. Drag along open ground.', 'folksy'],
  'The bridge is back up.': ['The bridge stands again.', 'folksy'], 'Rebuilding the bridge.': ['Rebuilding the bridge.', 'folksy'], 'Everybody out.': ['Everyone out.', 'folksy'],
  'Salvager reporting. Show me the scrap.': ['Trader ready. Show me the diggings.', 'proud'],
  "Heading out. I'll find them.": ["Riding out. I'll find them.", ''], 'Going looking.': ['Going to look.', ''], "Eyes out. Back when I'm hurt.": ["Eyes open. Back if I'm hurt.", ''], 'Taking fire, coming home!': ['Under fire, riding home!', ''],
  'Reinforcements on the way.': ['More of our people are coming.', 'calm'], 'We lost a veteran.': ['We lost a seasoned warrior.', 'calm'], 'We lost an elite crew.': ['We lost a legend of the people.', 'calm'],
  'Every builder is busy.': ['Every lodge maker is busy.', 'calm'], 'Strike called down from orbit.': ['Lightning called down.', 'calm'], 'Our strike was intercepted.': ['Our lightning was caught.', 'calm'],
  'Orbital strike destroyed in flight!': ['Their lightning was caught!', 'calm'], 'Barrage incoming.': ['Arrows falling.', 'calm'], 'Understood.': ['Understood.', 'calm'],
};
export const NATION_BUILDER_CUED: Record<string, L[]> = {
  place: [['Breaking ground.', 'cheerful'], ['A good spot.', 'folksy'], ['Leave it with me.', 'folksy'], ['I can do that.', 'cheerful'], ['My back remembers every lodge. Going.', 'grumbling'], ['Measure twice, cut once.', 'folksy']],
  complete: [['The lodge stands.', 'proud'], ['Built well.', 'proud'], ['There. A fine lodge.', 'proud'], ['Done, and done right.', 'proud'], ['Finished. Is there food?', 'grumbling']],
  queued: [['Patience.', 'grumbling'], ['One thing at a time.', 'folksy'], ['Wait your turn.', 'grumbling']],
  logs: [['Stakes going in.', 'cheerful'], ['Weaving the brush. My poor hands.', 'grumbling'], ['Sharp end out.', 'chuckles']],
};
export const NATION_ACK: Record<string, string[]> = {
  inf1: ['Yes.', 'On it.', 'I hear you.', 'Going.', 'Ready.', 'It will be done.'],
  inf2: ['Yes.', 'On it.', 'Fine.', 'As you say.', 'Done.', 'Very well.'],
  inf3: ['Ha, yes.', 'On it.', 'Easy.', 'As you say.', 'Gladly.', 'Say no more.'],
  tank: ['Yes.', 'On it.', 'We ride.', 'As you say.', 'Heard.', 'Very well.'],
  gun: ['Yes.', 'On it.', 'Patience.', 'As you say.', 'Heard.', 'Of course.'],
  salv: ['Yes.', 'On it.', 'Fair enough.', 'A deal.', 'Sure, sure.', 'Fine, fine.'],
  builder: ['Yes.', 'On it.', 'Right.', 'I can do that.', 'Sure, friend.', 'Yes, yes.'],
  cmd: ['Understood.'],
};

const words = (ls: L[]) => ls.map(([w]) => w);
export const NATION_BARKS: Record<string, { select: string[]; move: string[]; attack?: string[] }> = Object.fromEntries(Object.entries(NATION_BARKS_CUED).map(([k, b]) => [k, { select: words(b.select), move: words(b.move), ...(b.attack ? { attack: words(b.attack) } : {}) }]));
export const NATION_LINES: Record<string, string> = Object.fromEntries(Object.entries(NATION_LINES_CUED).map(([k, [w]]) => [k, w]));
export const NATION_BUILDER: Record<string, string[]> = Object.fromEntries(Object.entries(NATION_BUILDER_CUED).map(([k, ls]) => [k, words(ls)]));
