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

The battlefield looks like a **screen-printed propaganda poster** come to life: a small set of
flat inks, bold dark outlines, halftone dots in the shade, cream paper. It is bright and
confident on the surface with a darker, grim undertone. Think hand-made 1990s strategy-game
sprites, where an artist placed every pixel on purpose, but rendered in 3D blocks.

The game adds all outlines, shading, shadows and halftone itself. So:
- **Paint flat colour only.** Do not paint highlights, shadows or gradients into the model.
- **Readable silhouette first.** Units are seen from high up and far away, roughly 45 degrees
  from above. Each unit must be recognisable from its outline alone at about 40 pixels across.
  Exaggerate the parts that tell you what it is: a long barrel, a tall antenna, a big wheel.
- **Chunky, not noisy.** Prefer clean shapes made of 2 or more cells. Avoid isolated single
  specks of colour unless they are a deliberate detail like a headlight or a red warning lamp.
- **Team colour carries identity.** Use the team codes on at least a third of the surfaces
  visible from above (hull top, turret top, helmet, shoulders). The game swaps in each side's
  colour.
- **Use a few inks per model,** about 4 to 7 colours including the team codes.
- **Personality.** These units have character and dark humour: a bolted-on loudspeaker, a
  slogan stripe, a dented plate, a lucky charm. One small story detail per unit.
- **Fill the inside** with a dark interior colour rather than leaving the model hollow. Units
  break apart block by block when destroyed, and the inside shows.
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

Scale: one cell is about 18 cm. Maximum size of any part is 64 cells in each direction.

## First batch: three units to set the style

Draw these three, each in its own file. Keep to the sizes so they fit the current game:

1. **`tank`**: a medium battle tank. About 22 to 26 cells long, 14 wide, 10 to 12 tall
   including the turret. Body = tracks and hull; turret = turret and barrel as a separate part.
2. **`rifle`**: a rifleman. About 4 wide, 3 deep, 9 tall. Body only. Rifle pointing right,
   helmet and shoulders in team colour.
3. **`mortar`**: a mortar truck. About 20 long, 12 wide, 10 tall. Body = truck with cab at the
   front and an open bed; turret = the mortar tube on a small base, angled up toward the front.

For each unit, give the file contents in a code block, then two sentences: what makes its
silhouette readable, and its small personality detail.

Here is a small working example of the format (a scout buggy) to show the layout:

```
name: example-buggy

palette:
  T team
  t team-dark
  L team-light
  k 2e2e33
  s 6c7078
  g 24324c
  y ffd77a

part: body
pivot: 6 0 4
layer 0
.kk......kk.
.kk......kk.
............
............
............
............
.kk......kk.
.kk......kk.
layer 1
.kk......kk.
.ksttttttsk.
..tttttttt..
..tttttttt..
..tttttttt..
..tttttttt..
.ksttttttsk.
.kk......kk.
layer 2
............
.TTTTTTTTTT.
.TTTTTTTTTTy
.TTTTTTTTTT.
.TTTTTTTTTT.
.TTTTTTTTTTy
.TTTTTTTTTT.
............
layer 3
............
.t.....gg...
.t.LLL.ggT..
.......ggT..
.......ggT..
.t.LLL.ggT..
.t.....gg...
............
layer 4
............
.t..........
.tttttt.....
............
............
.tttttt.....
.t..........
............

part: turret
pivot: 1 0 1
mount: 3 5 4
layer 0
sss
sss
sss
layer 1
.kkkkk
.kkkkk
.s....
```
