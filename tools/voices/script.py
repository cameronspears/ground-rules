# The radio script: every unit's lines, each with the acting cue ElevenLabs gets (the cue is spoken
# as tone, never shown in the game). game.ts keeps the words; this keeps how they're said.
# A line here and in game.ts must match exactly.
U = {  # unit: (voice, {kind: [(line, cue)]})
  'Battle Tank': ('tank', {
    'select': [("Armour's warm.", 'dry'), ('Point me at something.', 'dry'), ('Forty tons of opinion.', 'smug'), ('Tank crew. Mostly awake.', 'deadpan'), ('Loaded and waiting.', 'calm'), ("Turret's oiled.", 'calm'), ('We go through, not around.', 'smug'), ('Who ordered the big gun?', 'dry')],
    'move': [('Rolling.', 'calm'), ('Out of my way, scenery.', 'smug'), ('Mind the paint.', 'deadpan'), ("Shortcut. Through that wall.", 'smug'), ('Treads moving.', 'calm'), ('Mud? What mud?', 'smug'), ('Rolling heavy.', 'calm'), ('Making new roads.', 'deadpan')],
    'attack': [('Firing!', 'shouting'), ('On the way!', 'shouting'), ('Knock knock!', 'smug'), ('Reload, fire again!', 'shouting'), ('Eat steel!', 'shouting'), ('Ding! Next!', 'smug')]}),
  'Colossus': ('tank', {
    'select': [('The earth trembles.', 'slow, booming'), ('Point. I will flatten.', 'slow, booming'), ('Colossus stands.', 'slow, booming'), ('I am the siege.', 'slow, booming'), ('Speak, small one.', 'slow, booming'), ('Tiny commander. Speak.', 'slow, booming'), ('I cast a long shadow.', 'slow, booming'), ('Mountains envy me.', 'slow, booming')],
    'move': [('Onward.', 'slow, booming'), ('Nothing stands.', 'slow, booming'), ('Make way.', 'slow, booming'), ('Mind your toes.', 'deadpan'), ('Advancing.', 'slow, booming'), ('Step. Step. Step.', 'slow, booming'), ('Pardon the crater.', 'deadpan'), ('The earth complains.', 'slow, booming')],
    'attack': [('Erase it.', 'booming'), ('Bring it down.', 'booming'), ('Fall.', 'booming'), ('Ruin.', 'booming'), ('Be dust.', 'booming'), ('Kneel.', 'booming')]}),
  'Field Gun': ('gun', {
    'select': [('Give me coordinates.', 'calm'), ('Long way to be dangerous.', 'dry'), ('Gun crew standing by.', 'calm'), ('Distance is a feeling.', 'dry'), ('Range it for me.', 'calm'), ("Kettle's on, gun's hot.", 'dry'), ('Pick a hill. Any hill.', 'calm'), ('We reach out and touch.', 'dry')],
    'move': [('Relocating the gun.', 'calm'), ('Slow and steady.', 'grumbling'), ('Keep the scouts close.', 'grumbling'), ('Hitching the gun.', 'calm'), ('Mind my good gun.', 'grumbling'), ('Mind the wheels.', 'grumbling'), ('Packing up the gun.', 'calm'), ('Old gun, old legs.', 'grumbling')],
    'attack': [('Shot out!', 'shouting'), ('Adjust fire!', 'shouting'), ('Splash incoming!', 'shouting'), ('Rounds downrange!', 'shouting'), ('Fire for effect!', 'shouting'), ('Shell out, cover ears!', 'shouting')]}),
  'Quad Gun': ('gun', {
    'select': [('Watching the skies.', 'calm'), ('Anything with rotors.', 'dry'), ('Flak ready.', 'calm'), ("Sky's mine.", 'smug'), ('Birds, beware.', 'dry'), ('Clouds look suspicious.', 'dry'), ('Eyes up, always.', 'calm'), ('Nothing flies today.', 'smug')],
    'move': [('Rolling.', 'calm'), ('Keeping up.', 'grumbling'), ('Moving the guns.', 'calm'), ('Repositioning.', 'calm'), ('Covering you.', 'calm'), ('Guns up, moving.', 'calm'), ('Following the sky.', 'calm'), ('Truck rolling.', 'calm')],
    'attack': [('Air contact!', 'shouting'), ('Fill the sky!', 'shouting'), ('Flak up!', 'shouting'), ('Bring it down!', 'shouting'), ('Clear the skies!', 'shouting'), ('Swat it!', 'shouting')]}),
  'Builder': ('builder', {
    'select': [('Hard hat on.', 'cheerful'), ('What are we building?', 'cheerful'), ('Got plans, sonny?', 'folksy'), ('Builder here. Talk slow.', 'folksy'), ('Seen worse. Built worse.', 'chuckles'), ('Coffee first? No? Fine.', 'grumbling'), ('Forty years of building.', 'proud'), ('Pass me that hammer.', 'folksy')],
    'move': [('On my way.', 'cheerful'), ('Bringing the toolbox.', 'folksy'), ('Mind the scaffolding.', 'grumbling'), ('Hold your horses, going.', 'grumbling'), ('These old legs still work.', 'proud'), ('Off to fix something.', 'cheerful'), ('Back aches, boots move.', 'grumbling'), ('Shortcut through the mud.', 'folksy')]}),
  'Salvager': ('salv', {
    'select': [('Scrap is money.', 'folksy'), ("One man's wreck...", 'folksy'), ('Back in my day, we walked.', 'grumbling'), ('Bins are empty, sonny.', 'folksy'), ("Where's the junk?", 'cheerful'), ('Junk is my business.', 'proud'), ('Treasure is treasure.', 'smug'), ('Got rust? I want it.', 'eager')],
    'move': [('Heavy load, slow road.', 'folksy'), ('Moving out.', 'cheerful'), ('Off to dig.', 'cheerful'), ('My knees say no. Going anyway.', 'grumbling'), ('Hauling.', 'folksy'), ('Junkyard bound.', 'cheerful'), ('Smells like money.', 'smug'), ('Loaded and lumbering.', 'grumbling')]}),
  'Rifleman': ('inf1', {
    'select': [('Still breathing.', 'tired'), ("What's the job?", 'eager'), ('Boots laced.', 'eager'), ('Rifleman here.', 'eager'), ("Point and I'll walk.", 'cocky'), ('Locked and loaded.', 'eager'), ('Ready, sir!', 'eager'), ('Who are we shooting?', 'eager')],
    'move': [('Moving.', 'eager'), ('On the double.', 'eager'), ('Hoofing it.', 'sighs'), ('Are we there yet?', 'sighs'), ('Eyes up, moving.', 'eager'), ('Feet hurt. Moving.', 'sighs'), ('Double time!', 'eager'), ('Following orders.', 'eager')],
    'attack': [('Contact!', 'shouting'), ("Light 'em up!", 'shouting'), ('Put rounds on it!', 'shouting'), ('Open fire!', 'shouting'), ('Hit the deck and fire!', 'shouting'), ('Suppressing!', 'shouting')]}),
  'Rocket Soldier': ('inf2', {
    'select': [("Tube's loaded.", 'dry'), ('Seen any armour?', 'dry'), ('I eat tanks.', 'growling'), ('Show me steel.', 'growling'), ('Got a tin can for me?', 'smug'), ('Armour-piercing mood.', 'dry'), ('Point me at metal.', 'growling'), ('Love the smell of exhaust.', 'smug')],
    'move': [('Hauling the tube.', 'grumbling'), ('Heavy tube, short legs.', 'grumbling'), ('Relocating.', 'dry'), ('Tanks fear me. Rightly.', 'smug'), ('Moving.', 'dry'), ("Tube's heavy. Moving.", 'grumbling'), ('Shoulder hurts. Going.', 'grumbling'), ('Hunting metal.', 'dry')],
    'attack': [('Rocket away!', 'shouting'), ('Backblast clear!', 'shouting'), ('Crack that shell!', 'shouting'), ('Scratch one tank!', 'shouting'), ('Hello, tin can!', 'shouting'), ("Tube's hot!", 'shouting')]}),
  'Grenadier': ('inf3', {
    'select': [("Who's hiding?", 'cocky'), ('Got a present for them.', 'cocky'), ("Pin's in. For now.", 'smug'), ('Bang, coming up.', 'cocky'), ('Knock knock.', 'smug'), ('Got pins, got problems.', 'smug'), ('Boom is my love language.', 'cocky'), ('Need a door opened?', 'cocky')],
    'move': [('Mind the satchel.', 'cocky'), ('Right behind you.', 'cocky'), ('Keeping low.', 'whispering'), ("Satchel's heavy. Don't ask.", 'smug'), ('On my way.', 'cocky'), ('Sneaking.', 'whispering'), ('Clink clink, moving.', 'cocky'), ('Mind the boom bag.', 'cocky')],
    'attack': [('Frag out!', 'shouting'), ("Smoke 'em out!", 'shouting'), ('Catch!', 'laughs'), ('Out the windows!', 'shouting'), ('Fire in the hole!', 'shouting'), ('Duck and cover!', 'shouting')]}),
  'Scout Buggy': ('inf3', {
    'select': [("Engine's warm.", 'cocky'), ('Fastest thing out here.', 'cocky'), ('Where we headed?', 'excited'), ('Need eyes? I got two.', 'cocky'), ('Wheels up!', 'excited'), ("Gas tank's full.", 'cocky'), ('I go fast, you stay safe.', 'cocky'), ('Wheels, wheels, wheels.', 'excited')],
    'move': [('Floor it!', 'excited'), ('Hold on to something.', 'excited'), ('Seatbelts are optional.', 'laughs'), ('Gone.', 'cocky'), ('Back before you miss me.', 'cocky'), ('Zooming!', 'excited'), ('Hang on to your hat.', 'laughs'), ('Speed is armour.', 'cocky')],
    'attack': [('Hit and run!', 'shouting'), ('Drive-by!', 'laughs'), ("Too fast for 'em!", 'laughs'), ('Keep moving, keep shooting!', 'shouting'), ('Pew pew!', 'laughs'), ('Drive by and wave!', 'laughs')]}),
  'Gunship': ('inf3', {
    'select': [('Rotors turning.', 'cocky'), ('Where do you want the rain?', 'cocky'), ('Eyes in the sky.', 'cocky'), ('Gunship on station.', 'calm'), ('Fuelled and angry.', 'growling'), ('Chopper ready.', 'calm'), ('Air support, at your service.', 'cocky'), ('Blades spinning.', 'calm')],
    'move': [('Inbound.', 'calm'), ('Low and fast.', 'excited'), ('Over the river we go.', 'cheerful'), ('Banking now. Hold your lunch.', 'laughs'), ('On approach.', 'calm'), ('Skimming the trees.', 'excited'), ('Nose down, going.', 'calm'), ('Rotor wash coming.', 'cocky')],
    'attack': [('Guns, guns, guns!', 'shouting'), ('Rockets away!', 'shouting'), ('Strafing run!', 'shouting'), ('Here comes the rain!', 'laughs'), ('Hosing them down!', 'shouting'), ('Bringing the thunder!', 'shouting')]}),
  'Bomber': ('inf3', {
    'select': [('Bomb bay loaded.', 'calm'), ('Mark the target.', 'calm'), ('Heavy payload.', 'smug'), ('Bomber on station.', 'calm'), ('Point me at a building.', 'cocky'), ('Bombs are polished.', 'smug'), ('Big bird ready.', 'calm'), ('Need a parking lot made?', 'cocky')],
    'move': [('Holding course.', 'calm'), ('On the bomb run.', 'calm'), ('Inbound.', 'calm'), ('Steady... steady.', 'whispering'), ('Course set.', 'calm'), ('Climbing.', 'calm'), ('Lining up.', 'calm'), ('Cruising altitude.', 'calm')],
    'attack': [('Bombs away!', 'shouting'), ('Special delivery!', 'laughs'), ('Doors open!', 'shouting'), ('Drop, drop, drop!', 'shouting'), ('Rain it down!', 'shouting'), ('Bombs gone!', 'shouting')]}),
}
# The builder's lines for moments that repeat or carry names (SAY in src/audio.ts uses the same words).
BUILDER = {
  'place': [('Breaking ground.', 'cheerful'), ("I'll get my good shovel.", 'folksy'), ('Leave it with me, sonny.', 'folksy'), ('Can do.', 'cheerful'), ("Back's not what it was. Going.", 'grumbling'), ('Measure twice, dig once.', 'folksy')],
  'complete': [('Construction complete.', 'proud'), ('Built to last. Unlike me.', 'chuckles'), ("There. Ain't she pretty?", 'proud'), ('Done, and under budget.', 'proud'), ("Finished. Where's my coffee?", 'grumbling')],
  'queued': [('Hold your horses.', 'grumbling'), ('One thing at a time, sonny.', 'folksy'), ('Get in line.', 'grumbling')],
  'sandbags': [('Sandbags going up.', 'cheerful'), ('Stacking bags. My poor back.', 'grumbling'), ('Dirt in a bag. Classic.', 'chuckles')],
}
# Plain acknowledgements, per voice, for anything else (ACK in src/audio.ts).
ACK = {
  'inf1': ['Copy that.', 'On it.', 'Roger.', 'Wilco.', 'Yes sir!', 'You got it, boss.'],
  'inf2': ['Copy that.', 'On it.', 'Roger.', 'Wilco.', 'Consider it done.', 'Yeah, yeah.'],
  'inf3': ['Copy that.', 'On it.', 'Roger.', 'You got it, boss.', 'Easy.', 'Say less.'],
  'tank': ['Copy that.', 'On it.', 'Roger that.', 'Consider it done.', 'Heard you.', 'If we must.'],
  'gun': ['Copy that.', 'On it.', 'Roger.', 'Laying it in.', 'Heard, sir.', 'Patience.'],
  'builder': ['Copy that.', 'On it.', 'Right you are.', 'Can do.', 'Sure thing, sonny.', 'Yep, yep.'],
  'salv': ['Copy that.', 'On it.', 'You got it.', 'Done deal.', 'Sure, sure.', 'Fine, fine.'],
}
