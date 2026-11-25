// Battle simulator: plays computer-vs-computer matches of the real game with no screen, several at once, and
// sums them up. Same rules as the browser (it runs src/game.ts and src/ai.ts; see tools/headless.mjs), a few
// times quicker per match, and each match is pinned: the same map and run number always play the same match.
//
//   node tools/sim.mjs                          two maps, three runs each, 25 minutes, normal, armour vs armour
//   node tools/sim.mjs --mode autopilot --runs 4 --min 27
//   node tools/sim.mjs --maps 777 --runs 6 --plans air,siege --level hard
//   node tools/sim.mjs --check                  the self-test: repeatable, and the shortcuts change nothing
//
// Options: --maps 777,4242 (map seeds)  --runs 3 (matches per map, run n pins its randomness to n)
//   --min 25  --mode standard|autopilot|mayhem|...  --level easy|normal|hard|brutal  --size 272|362|452
//   --plans red,blue (armour, air, siege, colossus or random; in autopilot, red's plan and your general's)
//   --jobs N (matches at once; the default fits in memory)  --out path (the full numbers as JSON)
// Prints a line per match as it finishes, then a table of the middle run at every third minute (and the range
// across runs), who was ahead or won, and how long it all took. The JSON goes to tools/out/ unless --out says.
import { spawn, execSync } from 'node:child_process';
import { cpus, totalmem } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };

// ---- one match, in its own process (so several run at once, and each gets the map size it asks for) ----
async function one(job) {
  const { boot, fingerprint } = await import('./headless.mjs');
  const { game, match } = await boot({ seed: job.map, rseed: job.run, size: job.size, rules: job.mode, level: job.level, pictures: job.pictures });
  const [p1, p0] = job.plans;
  if (game.R.auto) { game.plan = p1; game.menu('deploy'); if (p0 !== 'random' && game.general) game.general.plan = p0; } // (AUTOPILOT: the deploy makes your general)
  else await match.start(p1, p0);
  const t0 = performance.now();
  for (let m = 1; m <= job.min && game.state !== 'won' && game.state !== 'lost'; m++) { await match.run(m, Infinity); process.stdout.write(`@${m}\n`); } // (a line a game-minute: the progress readout)
  const ms = Math.round(performance.now() - t0), rec = match.data(), last = rec.min[rec.min.length - 1] ?? {};
  const out = { ...job, ms, end: game.state, at: Math.round(game.time), rows: rec.min, last, fp: fingerprint(game), exact: fingerprint(game, true), units: game.units.length };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

const progress = new Map(); // game-minutes each running match has played
function child(job) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [here, '--one', JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; const m = String(d).match(/@(\d+)\n(?![\s\S]*@\d)/); if (m) progress.set(job, Number(m[1])); }); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => { progress.delete(job); try { done(JSON.parse(out.trim().split('\n').pop())); } catch { done({ ...job, error: (err || out || `exit ${code}`).trim().split('\n').slice(-6).join('\n') }); } });
  });
}

async function pool(jobs, n, each) {
  const results = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (next < jobs.length) { const j = jobs[next++]; const r = await child(j); results.push(r); each(r); } }));
  return results;
}

// How many at once: one per fast core (on Apple chips the rest run at about half speed), and no more than a match per
// 5 GB of memory (a late match takes about 1 GB, and the rest of the machine needs room: squeezed for memory, every
// match crawled and two crashed)
function defaultJobs() {
  let fast = cpus().length - 1;
  try { fast = Number(execSync('sysctl -n hw.perflevel0.physicalcpu', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()) || fast; } catch {}
  return Math.max(1, Math.min(fast, Math.floor(totalmem() / 2 ** 30 / 5)));
}

const median = (xs) => { const s = xs.filter((x) => x !== undefined).sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : undefined; };
const span = (xs) => { const s = xs.filter((x) => x !== undefined); return s.length ? (Math.min(...s) === Math.max(...s) ? `${s[0]}` : `${Math.min(...s)}–${Math.max(...s)}`) : '-'; };
const secs = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`);
const who = (r) => r.end === 'won' ? 'blue won' : r.end === 'lost' ? 'red won' : (r.last.army0 ?? 0) > (r.last.army1 ?? 0) * 1.3 ? 'blue ahead' : (r.last.army1 ?? 0) > (r.last.army0 ?? 0) * 1.3 ? 'red ahead' : 'even';

// ---- the self-test ----
async function check() {
  const base = { map: 777, run: 1, size: 362, mode: 'standard', level: 'normal', plans: ['armour', 'armour'], min: 3 };
  console.log('Self-test: three 3-minute matches on map 777, run 1 …');
  const [a, b, c] = await Promise.all([child(base), child(base), child({ ...base, pictures: true })]);
  const bad = [a, b, c].find((r) => r.error);
  if (bad) { console.log('FAILED to run:\n' + bad.error); process.exit(1); }
  const same = a.exact === b.exact, pics = a.exact === c.exact;
  console.log(`  same match twice:              ${same ? 'PASS' : 'FAIL'}  (${a.exact} / ${b.exact})`);
  console.log(`  pictures skipped vs drawn:     ${pics ? 'PASS' : 'FAIL'}  (${a.exact} / ${c.exact})`);
  console.log(`  speed: ${secs(a.ms)} skipping the pictures, ${secs(c.ms)} drawing them`);
  process.exit(same && pics ? 0 : 1);
}

// ---- a batch ----
async function main() {
  const maps = opt('maps', '777,4242').split(',').map(Number), runs = Number(opt('runs', 3)), min = Number(opt('min', 25));
  const mode = opt('mode', 'standard'), level = opt('level', 'normal'), size = Number(opt('size', 362)), plans = opt('plans', 'armour,armour').split(',');
  const jobsN = Number(opt('jobs', defaultJobs()));
  const jobs = maps.flatMap((map) => Array.from({ length: runs }, (_, k) => ({ map, run: k + 1, size, mode, level, plans: [plans[0], plans[1] ?? plans[0]], min })));
  console.log(`${jobs.length} matches (${maps.join(', ')} × ${runs} runs), ${min} min, ${mode}, ${level}, red ${jobs[0].plans[0]} vs blue ${jobs[0].plans[1]}, ${jobsN} at once`);
  const t0 = Date.now(); let done = 0;
  const tick = setInterval(() => { const played = done * min + [...progress.values()].reduce((a, b) => a + b, 0), all = jobs.length * min, el = Date.now() - t0; if (played) console.log(`  … ${played} of ${all} game-minutes, ${secs(el)} so far, about ${secs((el / played) * (all - played))} to go`); }, 30000);
  const res = await pool(jobs, jobsN, (r) => (done++, console.log(r.error ? `  map ${r.map} run ${r.run}: FAILED\n${r.error}` : `  map ${r.map} run ${r.run}: ${who(r)} at minute ${Math.round(r.at / 60)}, armies ${r.last.army0}/${r.last.army1}, biggest fight ${Math.max(0, ...r.rows.map((q) => q.clash))}  (${secs(r.ms)})`)));
  clearInterval(tick);
  const ok = res.filter((r) => !r.error).sort((a, b) => a.map - b.map || a.run - b.run);
  if (!ok.length) process.exit(1);
  // a row every third minute: the middle run, and the range across runs
  const at = (r, m, k) => r.rows.find((q) => q.m === m)?.[k];
  const fightTo = (r, m) => Math.max(0, ...r.rows.filter((q) => q.m > m - 3 && q.m <= m).map((q) => q.clash)); // the biggest in the three minutes up to m
  const lines = ['', 'minute | army blue / red        | biggest fight | towns blue / red | land % blue / red', '-------|----------------------|---------------|------------------|-------------------'];
  for (let m = 3; m <= min; m += 3) {
    const has = ok.filter((r) => r.rows.some((q) => q.m === m)); if (!has.length) break;
    const col = (k) => has.map((r) => at(r, m, k));
    lines.push(`${String(m).padStart(6)} | ${`${median(col('army0'))} / ${median(col('army1'))}`.padEnd(9)} (${span(col('army0'))} / ${span(col('army1'))})`.padEnd(30) + ` | ${String(median(has.map((r) => fightTo(r, m)))).padStart(4)} (${span(has.map((r) => fightTo(r, m)))})`.padEnd(16) + ` | ${median(col('hubs0'))} / ${median(col('hubs1'))}`.padEnd(19) + ` | ${median(col('land0'))} / ${median(col('land1'))}`);
  }
  console.log(lines.join('\n'));
  const tally = {}; for (const r of ok) tally[who(r)] = (tally[who(r)] ?? 0) + 1;
  const total = Date.now() - t0, played = ok.reduce((s, r) => s + r.at, 0);
  console.log(`\nOutcome: ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(', ')}   (ahead: 30% more fighters at the end)`);
  console.log(`Took ${secs(total)} for ${Math.round(played / 60)} game-minutes: ${(played / (total / 1000)).toFixed(1)}× real time overall.`);
  const file = opt('out', `tools/out/sim-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  mkdirSync(file.replace(/\/[^/]*$/, ''), { recursive: true }); writeFileSync(file, JSON.stringify(res, null, 1));
  console.log(`All the numbers: ${file}`);
}

if (args[0] === '--one') await one(JSON.parse(args[1]));
else if (args.includes('--check')) await check();
else await main();
