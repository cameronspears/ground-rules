// Where each radio line sits in radio.mp3: "voice|line" -> [start, length] in seconds. Made by tools/voices.md's steps; don't edit by hand.
export const CLIPS: Record<string, [number, number]> = {
  "deep|Armour's warm.": [0.02, 1.002],
  "deep|Point me at something.": [1.172, 1.039],
  "deep|Smile for the brochure.": [2.361, 1.317],
  "deep|Rolling.": [3.829, 0.565],
  "deep|Mind the paint.": [4.544, 1.037],
  "deep|Out of my way, scenery.": [5.731, 1.378],
  "light|One man's wreck...": [7.259, 0.918],
  "light|Scrap is money.": [8.326, 0.806],
  "light|Salvager ready.": [9.282, 0.857],
  "light|Off to find treasure.": [10.289, 0.984],
  "light|Moving out.": [11.423, 0.6],
  "light|Heavy load, slow road.": [12.173, 1.304],
  "light|Hard hat on.": [13.627, 0.852],
};
