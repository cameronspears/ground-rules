# Prompt for Fable: hand-drawn unit sprites for Conquer

Copy everything below the line into Fable. Save each file it returns into `src/sprites/`
with the file name it gives. The game picks them up automatically: a file named `tank`
replaces the current tank, and so on.

---

You are the unit artist for **Conquer**, an original real-time strategy game set in a fictional
near-future war with no real countries. You will hand-draw unit models as **stacked sprites**:
each model is a pile of top-down slices, one text grid per layer, bottom layer first. The game
turns every character into a small cube, so each character you place is a deliberate brush mark.

## The look

The game looks like a classic mid-1990s strategy game: a top-down three-quarter view, low
resolution with every pixel visible, dark and richly textured ground (deep forest greens,
umber dirt, slate rock), and bold, saturated buildings and units that pop against it.
**One cell = one pixel on screen.** So you are doing pixel art, one slice at a time.

The game shades every surface itself, choosing from a hand-tuned ramp of shades by light
direction (sun from the upper left). So:
- **Paint the colours as they look in full sun.** Don't paint shadows. Do paint material
  detail: panel lines, a darker track, a lighter edge on a hatch, a glint on a headlight.
- **The top and the right side matter most.** The camera looks down from the south, so you see
  the top of every layer and the side facing the bottom of the screen (the last row of each
  layer when the unit faces right).
- **Readable silhouette first.** Units are tiny, about 6 to 16 pixels long. Each must be
  recognisable from its outline alone. Exaggerate what tells you what it is: a long barrel, a
  tall antenna, a big wheel. Exaggerating size, as old games did for infantry, is welcome.
- **Chunky, not noisy.** Every pixel is a deliberate mark. No random speckle.
- **Team colour carries identity.** Use the team codes on at least a third of the surfaces
  seen from above. The game swaps in each side's colour.
- **A few colours per model,** about 4 to 7 including the team codes.
- **Personality.** One small story detail per unit: a slogan stripe, a bolted-on loudspeaker,
  a bedroll, a lucky charm. Dark humour is welcome.
- **Be original.** Do not copy or imitate any existing game's units, factions, logos or designs.
  No real-world national insignia.

## File format

```
# comments start with #
name: tank

palette:
  T team          # main team colour (swapped per side)
  t team-dark     # darker team colour
  L team-light    # lighter team colour
  k 2e2e33        # any other colour: one character, then a hex colour
  s 6c7078
  . is always empty (leave it out of the palette)

part: body
pivot: 11 0 7     # the model's centre: column, layer, row. Usually the middle of the base.
layer 0
<grid rows>
layer 1
<grid rows>
...

part: turret      # optional: a part that turns to aim (tank turret, gun, mortar tube)
pivot: 4 0 3      # the point it turns around, in the turret's own grid
mount: 10 7 7     # where that pivot sits on the body grid: column, layer, row
layer 0
<grid rows>
...
```

How to read a layer grid:
- Each layer is the model **seen from directly above**, with the **front of the unit pointing
  right**. Column = back to front. Row = the unit's left side (top row) to its right side
  (bottom row).
- Layer 0 is the ground slice; each next layer sits one cell higher.
- All rows in a part should be the same width; pad with `.`.
- Weapons point right (toward the front).

Scale: one cell is about half a metre, and one pixel on screen. Maximum size of any part is 64 cells in each direction.

## First batch: redraw three units to set the style

The game already has hand-drawn `tank` and `rifle` files (included below as the working
example). Draw better versions of these, plus a third unit:

1. **`tank`**: a medium battle tank. About 16 long, 10 wide, 7 tall including the turret.
   Body = tracks and hull; turret = turret and barrel as a separate part.
2. **`rifle`**: a rifleman, drawn larger than life. About 4 deep, 3 wide, 6 tall. Body only.
   Rifle pointing right, helmet and shoulders in team colour.
3. **`mortar`**: a mortar truck. About 14 long, 8 wide, 7 tall. Body = truck with cab at the
   front and an open bed; turret = the mortar tube on a small base, angled up toward the front.

For each unit, give the file contents in a code block, then two sentences: what makes its
silhouette readable, and its small personality detail.

Here is the current hand-drawn tank, as a working example of the format:

```
# Battle tank. Drawn slice by slice, front pointing right. One cell = one pixel on screen.
# Personality: a yellow slogan stripe along the hull and a bolted-on loudspeaker on the turret.
name: tank

palette:
  T team
  t team-dark
  L team-light
  k 26272b
  s 5d6168
  w 8a8e94
  y f2c23a
  r e0402a
  c e8dcc0

part: body
pivot: 8 0 5
layer 0
.kkkkkkkkkkkkkk.
.kkkkkkkkkkkkkk.
................
................
................
................
................
................
.kkkkkkkkkkkkkk.
.kkkkkkkkkkkkkk.
layer 1
kwkkwkkwkkwkkwkk
kkkkkkkkkkkkkkkk
.tttttttttttttt.
.tttttttttttttt.
.tttttttttttttt.
.tttttttttttttt.
.tttttttttttttt.
.tttttttttttttt.
kkkkkkkkkkkkkkkk
kwkkwkkwkkwkkwkk
layer 2
tttttttttttttttt
tTTTTTTTTTTTTTTy
.TTTTTTTTTTTTTT.
.TTTTTTTTTTTTTT.
.TTTTTTTTTTTTTT.
.TTTTTTTTTTTTTT.
.TTTTTTTTTTTTTT.
.TTTTTTTTTTTTTT.
tyyyyyyyyyyyyyTy
tttttttttttttttt
layer 3
................
.ttt.LLLLLLLLL..
.kskTTTTTTTTTTs.
.kskTTTTTTTTTT..
.kskTTTTTTTTTT..
.kskTTTTTTTTTT..
.kskTTTTTTTTTT..
.kskTTTTTTTTTTs.
.ttt.LLLLLLLLL..
................

part: turret
pivot: 3.5 0 3
mount: 8 4 5
layer 0
.tttttt........
tTTTTTTt.......
tTTTTTTt.......
tTTTTTTt.......
tTTTTTTt.......
.tttttt........
layer 1
.TTTTTT........
TLLLLLTT.......
TTTTTTTTwwwwwwk
TTTTTTTTsssssk.
TTTTTTTT.......
.TTTTTT........
layer 2
...............
.tttt..........
.tkkt..........
.tttt.r........
..cc...........
...............
layer 3
...............
...............
...............
...............
..cw...........
...............
```
