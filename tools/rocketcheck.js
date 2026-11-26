// Quick balance check for rockets, tanks and the Colossus: (await import('/tools/rocketcheck.js?' + Date.now())).run()
export async function run() {
  const D = await import('/tools/duel.js?' + Date.now());
  D.setup();
  const list = [
    ['rocket', 'tank'], ['rocket', 'gunship'], ['rifle', 'rocket'], ['grenadier', 'rocket'], ['tank', 'rifle'], ['tank', 'grenadier'], ['scout', 'rocket'],
    ['colossus', 'tank', 'amove', 6000], ['colossus', 'rocket', 'amove', 6000], ['colossus', 'rifle', 'amove', 6000], ['colossus', 'mix', 'amove', 6000],
  ];
  const out = [];
  for (const [a, b, m, bud] of list) { const r = D.fight(a, b, m ?? 'amove', bud ?? 2400); out.push(`${a} x${r.na} vs ${b} x${r.nb}: ${r.win} (kept ${r.keepA}/${r.keepB}%, ${r.t}s)`); }
  return out.join('\n');
}
