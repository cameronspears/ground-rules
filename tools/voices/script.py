# The radio script: every unit's lines, each with the acting cue ElevenLabs gets (the cue is spoken
# as tone, never shown in the game). game.ts keeps the words; this keeps how they're said.
# A line here and in game.ts must match exactly.
U = {  # unit: (voice, {kind: [(line, cue)]})
  'Battle Tank': ('tank', {
    'select': [("Armour's warm.", 'dry'), ('Point me at something.', 'dry'), ('Forty tons of opinion.', 'smug'), ('Tank crew. Mostly awake.', 'deadpan'), ('Loaded and waiting.', 'calm')],
    'move': [('Rolling.', 'calm'), ('Out of my way, scenery.', 'smug'), ('Mind the paint.', 'deadpan'), ("Shortcut. Through that wall.", 'smug'), ('Treads moving.', 'calm')],
    'attack': [('Firing!', 'shouting'), ('On the way!', 'shouting'), ('Knock knock!', 'smug'), ('Reload, fire again!', 'shouting')]}),
  'Juggernaut': ('tank', {
    'select': [('The ground shakes.', 'growling'), ('Who needs a door?', 'smug'), ('Juggernaut, awake.', 'growling'), ('Nothing gets through this.', 'proud'), ('Ask me about my armour.', 'smug')],
    'move': [('Nothing stops us.', 'growling'), ('Clear the road.', 'growling'), ('Excuse me. Coming through.', 'deadpan'), ('Slow and certain.', 'calm'), ('Grinding forward.', 'growling')],
    'attack': [('Break them.', 'growling'), ('Flatten it.', 'growling'), ('Full broadside!', 'shouting'), ('Crush it.', 'growling')]}),
  'Colossus': ('tank', {
    'select': [('The earth trembles.', 'slow, booming'), ('Point. I will flatten.', 'slow, booming'), ('Colossus stands.', 'slow, booming'), ('I am the siege.', 'slow, booming'), ('Speak, small one.', 'slow, booming')],
    'move': [('Onward.', 'slow, booming'), ('Nothing stands.', 'slow, booming'), ('Make way.', 'slow, booming'), ('Mind your toes.', 'deadpan'), ('Advancing.', 'slow, booming')],
    'attack': [('Erase it.', 'booming'), ('Bring it down.', 'booming'), ('Fall.', 'booming'), ('Ruin.', 'booming')]}),
  'Field Gun': ('gun', {
    'select': [('Give me coordinates.', 'calm'), ('Long way to be dangerous.', 'dry'), ('Gun crew standing by.', 'calm'), ('Distance is a feeling.', 'dry'), ('Range it for me.', 'calm')],
    'move': [('Relocating the gun.', 'calm'), ('Slow and steady.', 'grumbling'), ('Keep the scouts close.', 'grumbling'), ('Hitching the gun.', 'calm'), ('Mind my good gun.', 'grumbling')],
    'attack': [('Shot out!', 'shouting'), ('Adjust fire!', 'shouting'), ('Splash incoming!', 'shouting'), ('Rounds downrange!', 'shouting')]}),
  'Flak Truck': ('gun', {
    'select': [('Watching the skies.', 'calm'), ('Anything with rotors.', 'dry'), ('Flak ready.', 'calm'), ("Sky's mine.", 'smug'), ('Birds, beware.', 'dry')],
    'move': [('Rolling.', 'calm'), ('Keeping up.', 'grumbling'), ('Moving the guns.', 'calm'), ('Repositioning.', 'calm'), ('Covering you.', 'calm')],
    'attack': [('Air contact!', 'shouting'), ('Fill the sky!', 'shouting'), ('Flak up!', 'shouting'), ('Bring it down!', 'shouting')]}),
  'Builder': ('builder', {
    'select': [('Hard hat on.', 'cheerful'), ('What are we building?', 'cheerful'), ('Got plans, sonny?', 'folksy'), ('Builder here. Talk slow.', 'folksy'), ('Seen worse. Built worse.', 'chuckles')],
    'move': [('On my way.', 'cheerful'), ('Bringing the toolbox.', 'folksy'), ('Mind the scaffolding.', 'grumbling'), ('Hold your horses, going.', 'grumbling'), ('These old legs still work.', 'proud')]}),
  'Salvager': ('builder', {
    'select': [('Scrap is money.', 'folksy'), ("One man's wreck...", 'folksy'), ('Back in my day, we walked.', 'grumbling'), ('Bins are empty, sonny.', 'folksy'), ("Where's the junk?", 'cheerful')],
    'move': [('Heavy load, slow road.', 'folksy'), ('Moving out.', 'cheerful'), ('Off to dig.', 'cheerful'), ('My knees say no. Going anyway.', 'grumbling'), ('Hauling.', 'folksy')]}),
  'Rifleman': ('inf1', {
    'select': [('Still breathing.', 'tired'), ("What's the job?", 'eager'), ('Boots laced.', 'eager'), ('Rifleman here.', 'eager'), ("Point and I'll walk.", 'cocky')],
    'move': [('Moving.', 'eager'), ('On the double.', 'eager'), ('Hoofing it.', 'sighs'), ('Are we there yet?', 'sighs'), ('Eyes up, moving.', 'eager')],
    'attack': [('Contact!', 'shouting'), ("Light 'em up!", 'shouting'), ('Put rounds on it!', 'shouting'), ('Open fire!', 'shouting')]}),
  'Rocket Soldier': ('inf2', {
    'select': [("Tube's loaded.", 'dry'), ('Seen any armour?', 'dry'), ('I eat tanks.', 'growling'), ('Show me steel.', 'growling'), ('Got a tin can for me?', 'smug')],
    'move': [('Hauling the tube.', 'grumbling'), ('Heavy tube, short legs.', 'grumbling'), ('Relocating.', 'dry'), ('Tanks fear me. Rightly.', 'smug'), ('Moving.', 'dry')],
    'attack': [('Rocket away!', 'shouting'), ('Backblast clear!', 'shouting'), ('Crack that shell!', 'shouting'), ('Scratch one tank!', 'shouting')]}),
  'Grenadier': ('inf3', {
    'select': [("Who's hiding?", 'cocky'), ('Got a present for them.', 'cocky'), ("Pin's in. For now.", 'smug'), ('Bang, coming up.', 'cocky'), ('Knock knock.', 'smug')],
    'move': [('Mind the satchel.', 'cocky'), ('Right behind you.', 'cocky'), ('Keeping low.', 'whispering'), ("Satchel's heavy. Don't ask.", 'smug'), ('On my way.', 'cocky')],
    'attack': [('Frag out!', 'shouting'), ("Smoke 'em out!", 'shouting'), ('Catch!', 'laughs'), ('Out the windows!', 'shouting')]}),
  'Scout Buggy': ('inf3', {
    'select': [("Engine's warm.", 'cocky'), ('Fastest thing out here.', 'cocky'), ('Where we headed?', 'excited'), ('Need eyes? I got two.', 'cocky'), ('Wheels up!', 'excited')],
    'move': [('Floor it!', 'excited'), ('Hold on to something.', 'excited'), ('Seatbelts are optional.', 'laughs'), ('Gone.', 'cocky'), ('Back before you miss me.', 'cocky')],
    'attack': [('Hit and run!', 'shouting'), ('Drive-by!', 'laughs'), ("Too fast for 'em!", 'laughs'), ('Keep moving, keep shooting!', 'shouting')]}),
  'Gunship': ('inf3', {
    'select': [('Rotors turning.', 'cocky'), ('Where do you want the rain?', 'cocky'), ('Eyes in the sky.', 'cocky'), ('Gunship on station.', 'calm'), ('Fuelled and angry.', 'growling')],
    'move': [('Inbound.', 'calm'), ('Low and fast.', 'excited'), ('Over the river we go.', 'cheerful'), ('Banking now. Hold your lunch.', 'laughs'), ('On approach.', 'calm')],
    'attack': [('Guns, guns, guns!', 'shouting'), ('Rockets away!', 'shouting'), ('Strafing run!', 'shouting'), ('Here comes the rain!', 'laughs')]}),
  'Bomber': ('inf3', {
    'select': [('Bomb bay loaded.', 'calm'), ('Mark the target.', 'calm'), ('Heavy payload.', 'smug'), ('Bomber on station.', 'calm'), ('Point me at a building.', 'cocky')],
    'move': [('Holding course.', 'calm'), ('On the bomb run.', 'calm'), ('Inbound.', 'calm'), ('Steady... steady.', 'whispering'), ('Course set.', 'calm')],
    'attack': [('Bombs away!', 'shouting'), ('Special delivery!', 'laughs'), ('Doors open!', 'shouting'), ('Drop, drop, drop!', 'shouting')]}),
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
}
