// WILD WEST: what everyone says over the radio on the frontier, and how each line is acted (the cue shapes the
// recording's delivery and is never shown). game.ts swaps these in for the army's lines on a Wild West map;
// tools/voices/jobs-west.mjs reads this file to make the recording list. The words here are what the
// recordings say, so change a line and it needs recording again.
// (Steer clear of the words west/words.ts swaps, like TANK or SCRAP: on screen they'd come out changed.)
type L = [string, string]; // [line, cue]
type Barks = { select: L[]; move: L[]; attack?: L[] };

// Each unit's own lines, by unit key (DEFS in game.ts), in place of its barks
export const BARKS_CUED: Record<string, Barks> = {
  tank: { // War Wagon: an iron-lunged teamster who loves his rolling stove
    select: [["Boiler's hot.", 'dry'], ['Point me at somethin\'.', 'dry'], ['Twelve tons of bad attitude.', 'smug'], ['Wagon crew. Mostly sober.', 'deadpan'], ['Loaded and waitin\'.', 'calm'], ["Gatling's greased.", 'calm'], ['We go through, not round.', 'smug'], ['Who ordered the iron horse?', 'smug']],
    move: [['Rollin\'.', 'calm'], ['Outta my way, cactus.', 'smug'], ['Mind the paint.', 'deadpan'], ['Shortcut. Through that fence.', 'smug'], ['Wheels turnin\'.', 'calm'], ['Dust? What dust?', 'smug'], ['Rollin\' heavy.', 'calm'], ['Makin\' new trails.', 'deadpan']],
    attack: [['Let her rip!', 'shouting'], ['Crankin\' the Gatling!', 'shouting'], ['Knock knock!', 'smug'], ['Keep crankin\'!', 'shouting'], ['Eat lead!', 'shouting'], ['Ding! Next!', 'smug']],
  },
  colossus: { // Steam Titan: slow, booming, a little sad about the small folk
    select: [['The earth trembles.', 'slow, booming'], ['Point. I will flatten.', 'slow, booming'], ['The Titan stands.', 'slow, booming'], ['I am the siege.', 'slow, booming'], ['Speak, small one.', 'slow, booming'], ['Tiny sheriff. Speak.', 'slow, booming'], ['Steam rises.', 'slow, booming'], ['I hear you.', 'slow, booming']],
    move: [['Onward.', 'slow, booming'], ['Nothing stands.', 'slow, booming'], ['Make way.', 'slow, booming'], ['Mind your boots.', 'deadpan'], ['Advancing.', 'slow, booming'], ['Step. Step. Step.', 'slow, booming'], ['Pardon the crater.', 'deadpan'], ['The desert parts.', 'slow, booming']],
    attack: [['Erase it.', 'booming'], ['Bring it down.', 'booming'], ['Fall.', 'booming'], ['Ruin.', 'booming'], ['Be dust.', 'booming'], ['Kneel.', 'booming']],
  },
  artillery: { // Field Cannon: an old cavalry gunner
    select: [['Give me a hill.', 'calm'], ['Long way to be dangerous.', 'dry'], ['Gun crew standin\' by.', 'calm'], ['Distance is a feelin\'.', 'dry'], ['Range it for me.', 'calm'], ["Coffee's on, cannon's hot.", 'dry'], ['Pick a ridge. Any ridge.', 'calm'], ['Powder\'s dry.', 'calm']],
    move: [['Hitchin\' the cannon.', 'calm'], ['Slow and steady.', 'grumbling'], ['Keep the riders close.', 'grumbling'], ['Movin\' the gun.', 'calm'], ['Mind my good cannon.', 'grumbling'], ['Mind the wheels.', 'grumbling'], ['Packin\' up.', 'calm'], ['Off to a new hill.', 'calm']],
    attack: [['Fire!', 'shouting'], ['Adjust and fire!', 'shouting'], ['Ball away!', 'shouting'], ['Powder and shot!', 'shouting'], ['Give \'em the grape!', 'shouting'], ['Cover your ears!', 'shouting']],
  },
  quad: { // Gatling Wagon
    select: [['Watchin\' the skies.', 'calm'], ['Anything with a balloon.', 'dry'], ['Gatling ready.', 'calm'], ["Sky's mine.", 'smug'], ['Buzzards, beware.', 'dry'], ['Clouds look suspicious.', 'dry'], ['Eyes up, always.', 'calm'], ['Nothin\' flies today.', 'smug']],
    move: [['Rollin\'.', 'calm'], ['Keepin\' up.', 'grumbling'], ['Movin\' the guns.', 'calm'], ['Repositionin\'.', 'calm'], ['Coverin\' you.', 'calm'], ['Guns up, movin\'.', 'calm'], ['Followin\' the sky.', 'calm'], ['Wagon rollin\'.', 'calm']],
    attack: [['Up there!', 'shouting'], ['Fill the sky!', 'shouting'], ['Crank it skyward!', 'shouting'], ['Bring it down!', 'shouting'], ['Pop that balloon!', 'shouting'], ['Swat it!', 'shouting']],
  },
  builder: { // Pioneer: a cheerful old homesteader
    select: [['Hat on.', 'cheerful'], ['What are we raisin\'?', 'cheerful'], ['Got plans, partner?', 'folksy'], ['Pioneer here. Talk slow.', 'folksy'], ['Seen worse. Built worse.', 'chuckles'], ['Coffee first? No? Fine.', 'grumbling'], ['Forty years of barn raisin\'.', 'proud'], ['Pass me that hammer.', 'folksy']],
    move: [['On my way.', 'cheerful'], ['Bringin\' the toolbox.', 'folksy'], ['Mind the timber.', 'grumbling'], ['Hold your horses, goin\'.', 'grumbling'], ['These old legs still work.', 'proud'], ['Off to fix somethin\'.', 'cheerful'], ['Back aches, boots walk.', 'grumbling'], ['Westward, I reckon.', 'folksy']],
  },
  harvester: { // Prospector: the grizzled old-timer, gold fever and all
    select: [['Gold is money.', 'folksy'], ['There\'s gold in them hills.', 'folksy'], ['Back in my day, we walked.', 'grumbling'], ['Cart\'s empty, sonny.', 'folksy'], ['Where\'s the glitter?', 'cheerful'], ['Diggin\' is my business.', 'proud'], ['Eureka! Oh. Just a rock.', 'chuckles'], ['Got nuggets? I want \'em.', 'cheerful']],
    move: [['Heavy load, slow road.', 'folksy'], ['Movin\' out.', 'cheerful'], ['Off to dig.', 'cheerful'], ['My knees say no. Goin\' anyway.', 'grumbling'], ['Haulin\'.', 'folksy'], ['Mule knows the way.', 'cheerful'], ['Smells like gold.', 'smug'], ['Loaded and creakin\'.', 'folksy']],
  },
  rifle: { // Gunslinger: a young, eager cowpoke
    select: [['Still breathin\'.', 'tired'], ["What's the job?", 'eager'], ['Boots on.', 'eager'], ['Gunslinger here.', 'eager'], ['Point and I\'ll ride.', 'cocky'], ['Locked and loaded.', 'eager'], ['Ready, boss!', 'eager'], ['Who are we shootin\'?', 'eager']],
    move: [['Movin\'.', 'eager'], ['On the double.', 'eager'], ['Hoofin\' it.', 'sighs'], ['Are we there yet?', 'sighs'], ['Eyes up, movin\'.', 'eager'], ['Feet hurt. Movin\'.', 'sighs'], ['Giddy up!', 'eager'], ['Followin\' orders.', 'eager']],
    attack: [['Draw!', 'shouting'], ['Light \'em up!', 'shouting'], ['Fill \'em with lead!', 'shouting'], ['Open fire!', 'shouting'], ['Duck and shoot!', 'shouting'], ['Keep \'em pinned!', 'shouting']],
  },
  rocket: { // Buffalo Gunner: dry, tough, never misses
    select: [['Big iron\'s loaded.', 'dry'], ['Seen any iron?', 'dry'], ['I hunt wagons.', 'growling'], ['Show me iron.', 'growling'], ['Got a tin can for me?', 'smug'], ['One shot, one wagon.', 'dry'], ['Point me at metal.', 'growling'], ['This gun drops buffalo.', 'smug']],
    move: [['Haulin\' the big gun.', 'grumbling'], ['Heavy gun, short legs.', 'grumbling'], ['Relocatin\'.', 'dry'], ['Wagons fear me. Rightly.', 'smug'], ['Movin\'.', 'dry'], ['Gun\'s heavy. Movin\'.', 'grumbling'], ['Shoulder hurts. Goin\'.', 'grumbling'], ['Huntin\'.', 'dry']],
    attack: [['Big iron!', 'shouting'], ['Steady... now!', 'shouting'], ['Crack that iron!', 'shouting'], ['Scratch one wagon!', 'shouting'], ['Hello, tin can!', 'shouting'], ['Barrel\'s hot!', 'shouting']],
  },
  grenadier: { // Dynamiter: a giggling mine-blaster
    select: [["Who's hidin'?", 'cocky'], ['Got a present for \'em.', 'cocky'], ['Fuse is short. Like me.', 'smug'], ['Bang, comin\' up.', 'cocky'], ['Knock knock.', 'smug'], ['Got sticks, got problems.', 'smug'], ['Boom is my love language.', 'cocky'], ['Need a new door?', 'cocky']],
    move: [['Mind the sticks.', 'cocky'], ['Right behind you.', 'cocky'], ['Keepin\' low.', 'whispering'], ["Satchel's heavy. Don't ask.", 'smug'], ['On my way.', 'cocky'], ['Sneakin\'.', 'whispering'], ['Fizz fizz, movin\'.', 'cocky'], ['Nobody light a match.', 'cocky']],
    attack: [['Fire in the hole!', 'shouting'], ['Light the fuse!', 'shouting'], ['Catch!', 'laughs'], ['Through the windows!', 'shouting'], ['Here\'s some dynamite!', 'shouting'], ['Duck and cover!', 'shouting']],
  },
  scout: { // Scout Rider
    select: [['Horse is saddled.', 'cocky'], ['Fastest thing out here.', 'cocky'], ['Where we headed?', 'excited'], ['Need eyes? I got two.', 'cocky'], ['Saddle up!', 'excited'], ['Horse is fed.', 'cocky'], ['I ride fast, you stay safe.', 'cocky'], ['Hooves, hooves, hooves.', 'excited']],
    move: [['Hyah!', 'excited'], ['Hold on to somethin\'.', 'excited'], ['Yee-haw!', 'laughs'], ['Gone.', 'cocky'], ['Back before you miss me.', 'cocky'], ['Gallopin\'!', 'excited'], ['Hang on to your hat.', 'laughs'], ['Speed is armour.', 'cocky']],
    attack: [['Hit and run!', 'shouting'], ['Ride-by!', 'laughs'], ["Too fast for 'em!", 'laughs'], ['Keep ridin\', keep shootin\'!', 'shouting'], ['Bang bang!', 'laughs'], ['Tip my hat and ride!', 'laughs']],
  },
  gunship: { // War Balloon
    select: [['Balloon\'s full.', 'cocky'], ['Where do you want the rain?', 'cocky'], ['Eyes in the sky.', 'cocky'], ['Balloon on station.', 'calm'], ['Fired up and angry.', 'growling'], ['Hot air, ready.', 'calm'], ['Air support, at your service.', 'cocky'], ['Lookin\' down on \'em.', 'cocky']],
    move: [['Driftin\' in.', 'calm'], ['Low and slow.', 'excited'], ['Over the canyon we go.', 'cheerful'], ['Ridin\' the wind. Hold your lunch.', 'laughs'], ['On approach.', 'calm'], ['Skimmin\' the cactus.', 'excited'], ['Vent the burner, goin\'.', 'calm'], ['Catchin\' a breeze.', 'calm']],
    attack: [['Crank it, crank it!', 'shouting'], ['Lead from above!', 'shouting'], ['Strafin\' run!', 'shouting'], ['Here comes the rain!', 'laughs'], ['Hosin\' \'em down!', 'shouting'], ['Bringin\' the thunder!', 'shouting']],
  },
  bomber: { // Zeppelin
    select: [['Dynamite\'s loaded.', 'calm'], ['Mark the target.', 'calm'], ['Heavy cargo.', 'smug'], ['Zeppelin on station.', 'calm'], ['Point me at a buildin\'.', 'cocky'], ['Sticks are bundled.', 'smug'], ['Big bag ready.', 'calm'], ['Need a town flattened?', 'cocky']],
    move: [['Holdin\' course.', 'calm'], ['On the run.', 'calm'], ['Inbound.', 'calm'], ['Steady... steady.', 'whispering'], ['Course set.', 'calm'], ['Climbin\'.', 'calm'], ['Linin\' up.', 'calm'], ['Cruisin\' the clouds.', 'calm']],
    attack: [['Sticks away!', 'shouting'], ['Special delivery!', 'laughs'], ['Hatches open!', 'shouting'], ['Drop, drop, drop!', 'shouting'], ['Rain it down!', 'shouting'], ['Dynamite gone!', 'shouting']],
  },
};

// Lines anyone might say, the army's words -> the frontier's (for the lines game.ts writes itself)
export const LINES_CUED: Record<string, L> = {
  'Engaging.': ['Here we go.', ''], 'Target acquired.': ['Got \'em in my sights.', ''], 'With pleasure.': ['With pleasure.', ''], 'They had it coming.': ['They had it comin\'.', ''],
  'Moving up together.': ['Ridin\' up together.', ''], 'Forming up. We go in as one.': ['Formin\' up. We ride in as one.', ''], 'Advancing in formation.': ['Advancin\' in formation.', ''],
  'Falling back!': ['Fall back!', ''], 'Pulling out!': ['Pullin\' out!', ''], 'Back to base, go!': ['Back to the fort, go!', ''], 'Nowhere to fall back to.': ['Nowhere left to run.', ''],
  'Moving in.': ['Movin\' in.', ''], 'Under new management, coming up.': ['New sheriff in town, comin\' up.', ''], 'Mount up! Everyone riding.': ['Mount up! Everybody ridin\'.', ''],
  'Walking the line.': ['Ridin\' the fence.', ''], 'Holding here. Nothing gets past.': ['Holdin\' here. Nothin\' gets past.', ''], 'Reporting for duty.': ['Reportin\' for duty.', ''],
  'Abandoned machine claimed. Back in the fight.': ['Found it abandoned. Back in the fight.', ''], 'Another one inside. Cosy.': ['Another one inside. Cosy.', ''],
  'Captured. The previous owners left in a hurry.': ['Took it. The last owners left in a hurry.', ''], 'Promoted!': ['Promoted!', ''], 'Veteran now.': ['Old hand now.', ''], 'Elite!': ['Legend!', ''],
  "We can't get all the way there. Going as close as we can.": ["Can't get all the way there. Goin' as close as we can.", ''], "We'll barely scratch that!": ["We'll barely scratch that!", ''],
  'Mount up!': ['Mount up!', ''], 'Guarding it.': ['Guardin\' it.', ''],
  // the pioneer
  "It can't go there.": ["Can't build it there.", 'folksy'], 'Nothing fits along there. Drag along open ground.': ['Nothin\' fits along there. Drag along open ground.', 'folksy'],
  'The bridge is back up.': ['Bridge is back up.', 'folksy'], 'Rebuilding the bridge.': ['Rebuildin\' the bridge.', 'folksy'], 'Everybody out.': ['Everybody out.', 'folksy'],
  // the prospector, the scout rider
  'Salvager reporting. Show me the scrap.': ['Prospector reportin\'. Show me the gold.', 'proud'],
  "Heading out. I'll find them.": ["Ridin' out. I'll find 'em.", ''], 'Going looking.': ['Goin\' lookin\'.', ''], "Eyes out. Back when I'm hurt.": ["Eyes out. Back when I'm hurt.", ''], 'Taking fire, coming home!': ['Takin\' fire, comin\' home!', ''],
  // the marshal (Command)
  'Reinforcements on the way.': ['The posse is on its way.', 'calm'], 'We lost a veteran.': ['We lost an old hand.', 'calm'], 'We lost an elite crew.': ['We lost a legend.', 'calm'],
  'Every builder is busy.': ['Every pioneer is busy.', 'calm'], 'Strike called down from orbit.': ['Lightning called down.', 'calm'], 'Our strike was intercepted.': ['Our lightning was caught.', 'calm'],
  'Orbital strike destroyed in flight!': ['Their lightning was caught!', 'calm'], 'Barrage incoming.': ['Cannonade incoming.', 'calm'], 'Understood.': ['Understood.', 'calm'],
};

// The pioneer's lines for moments that repeat or carry names (SAY in audio.ts)
export const PIONEER_CUED: Record<string, L[]> = {
  place: [['Breakin\' ground.', 'cheerful'], ['I\'ll get my good shovel.', 'folksy'], ['Leave it with me, partner.', 'folksy'], ['Can do.', 'cheerful'], ["Back's not what it was. Goin'.", 'grumbling'], ['Measure twice, saw once.', 'folksy']],
  complete: [['She\'s raised.', 'proud'], ['Built to last. Unlike me.', 'chuckles'], ["There. Ain't she pretty?", 'proud'], ['Done, and under budget.', 'proud'], ["Finished. Where's my coffee?", 'grumbling']],
  queued: [['Hold your horses.', 'grumbling'], ['One thing at a time, partner.', 'folksy'], ['Get in line.', 'grumbling']],
  logs: [['Logs goin\' up.', 'cheerful'], ['Stackin\' logs. My poor back.', 'grumbling'], ['Pointy end out. Classic.', 'chuckles']],
};
// Plain acknowledgements, per voice
export const ACK_W: Record<string, string[]> = {
  inf1: ['Yes sir.', 'On it.', 'Sure thing.', 'Yep.', 'Yes boss!', 'You got it, boss.'],
  inf2: ['Yep.', 'On it.', 'Reckon so.', 'Fine.', 'Consider it done.', 'Yeah, yeah.'],
  inf3: ['Yee-haw.', 'On it.', 'Sure thing.', 'You got it, boss.', 'Easy.', 'Say no more.'],
  tank: ['Yep.', 'On it.', 'Sure thing.', 'Consider it done.', 'Heard you.', 'If we must.'],
  gun: ['Yes sir.', 'On it.', 'Right.', 'Layin\' it in.', 'Heard, sir.', 'Patience.'],
  salv: ['Yep.', 'On it.', 'You got it.', 'Done deal.', 'Sure, sure.', 'Fine, fine.'],
  builder: ['Yep.', 'On it.', 'Right you are.', 'Can do.', 'Sure thing, partner.', 'Yep, yep.'],
  cmd: ['Understood.'],
};

// The same, words only, as the game uses them
const words = (ls: L[]) => ls.map(([w]) => w);
export const BARKS: Record<string, { select: string[]; move: string[]; attack?: string[] }> = Object.fromEntries(Object.entries(BARKS_CUED).map(([k, b]) => [k, { select: words(b.select), move: words(b.move), ...(b.attack ? { attack: words(b.attack) } : {}) }]));
export const LINES: Record<string, string> = Object.fromEntries(Object.entries(LINES_CUED).map(([k, [w]]) => [k, w]));
export const PIONEER: Record<string, string[]> = Object.fromEntries(Object.entries(PIONEER_CUED).map(([k, ls]) => [k, words(ls)]));
