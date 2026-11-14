// Iron Log training-logic scenarios. Run from the repo root:
//   npx -y http-server -p 8765 -s . &   (or: python3 -m http.server 8765)
//   NODE_PATH=$(npm root -g) node tests/engine.spec.mjs
// Each case builds a fake history at a fixed date and checks what the planner prescribes.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.IL_URL || 'http://localhost:8765/index.html';

const ex = (o) => Object.assign({ name: 'Bench Press', sets: 3, min: 5, max: 5, cat: 'chest_press' }, o);
const prog = (exs, extra) => Object.assign({ inc: 5, deloadEvery: 0, schedule: { 1: 'A', 2: 'B', 3: 'C', 4: null, 5: null, 6: null, 0: null },
  workouts: { A: { label: 'A', exercises: exs }, B: { label: 'B', exercises: [ex({ name: 'Row', cat: 'row' })] }, C: { label: 'C', exercises: [ex({ name: 'Squat', cat: 'quads' })] } } }, extra || {});
const S = (date, id, sets, more) => Object.assign({ id: Date.parse(date), date: new Date(date).toISOString(), workout: 'A',
  entries: { [id]: sets.map(([w, r, e]) => (e ? { w, r, e } : { w, r })) } }, more || {});

const cases = [
  { n: 'double (default): top of range every set -> add', p: prog([ex({ min: 6, max: 8 })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 8], [185, 8], [185, 8]])], expect: { mode: 'add', w: 190 } },
  { n: 'double: short of top -> beat, same weight', p: prog([ex({ min: 6, max: 8 })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 8], [185, 7], [185, 6]])], expect: { mode: 'beat', w: 185, r: '8/8/7' } },
  { n: 'linear 3x5: every set 5 -> add', p: prog([ex({ prog: 'linear' })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[200, 5], [200, 5], [200, 5]])], expect: { mode: 'add', w: 205 } },
  { n: 'linear 3x5: a missed rep -> retry same weight at 5', p: prog([ex({ prog: 'linear' })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[200, 5], [200, 5], [200, 4]])], expect: { mode: 'beat', w: 200, r: '5/5/5' } },
  { n: 'linear: fewer sets than prescribed never adds', p: prog([ex({ prog: 'linear' })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[200, 5], [200, 5]])], expect: { mode: 'beat', w: 200 } },
  { n: 'time (auto for sec): plank maxed -> add 5 s', p: prog([ex({ name: 'Plank', bw: true, unit: 'sec', min: 30, max: 45, cat: 'abs' })]),
    s: [S('2026-10-12T17:00', 'plank', [[0, 45], [0, 45], [0, 45]])], expect: { mode: 'addtime', r: '50/50/50' } },
  { n: 'time: under max -> +5 s per set toward max (not +1)', p: prog([ex({ name: 'Plank', bw: true, unit: 'sec', min: 30, max: 45, cat: 'abs' })]),
    s: [S('2026-10-12T17:00', 'plank', [[0, 40], [0, 35], [0, 30]])], expect: { mode: 'beat', r: '45/40/35' } },
  { n: 'time with load (farmer carry): adds time, keeps weight', p: prog([ex({ name: 'Farmer Carry', unit: 'sec', min: 30, max: 40, cat: 'abs' })]),
    s: [S('2026-10-12T17:00', 'farmer-carry', [[70, 40], [70, 40], [70, 40]])], expect: { mode: 'addtime', w: 70, r: '45/45/45' } },
  { n: 'off: repeats last session, never progresses', p: prog([ex({ name: '20-Yard Sprint', bw: true, sets: 1, min: 6, max: 6, prog: 'off', cat: null })]),
    s: [S('2026-10-12T17:00', '20-yard-sprint', [[0, 6]])], expect: { mode: 'off', r: '6' } },
  { n: 'effort cap: reps hit but RPE 9 > cap 8 -> capped, weight holds', p: prog([ex({ rpeCap: 8 })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 5, 7], [185, 5, 8], [185, 5, 9]])], expect: { mode: 'capped', w: 185 } },
  { n: 'effort cap: RPE at cap -> add', p: prog([ex({ rpeCap: 8 })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 5, 7], [185, 5, 8], [185, 5, 8]])], expect: { mode: 'add', w: 190 } },
  { n: 'effort cap: no RPE logged -> no gate', p: prog([ex({ rpeCap: 8 })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 5], [185, 5], [185, 5]])], expect: { mode: 'add', w: 190 } },
  { n: 'program-level cap applies', p: prog([ex({})], { rpeCap: 7 }),
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 5, 8], [185, 5, 8], [185, 5, 8]])], expect: { mode: 'capped', w: 185 } },
  { n: 'excluded lift: planner reads the session before it', p: prog([ex({})]),
    s: [S('2026-10-05T17:00', 'bench-press', [[185, 5], [185, 5], [185, 5]]), S('2026-10-12T17:00', 'bench-press', [[135, 3], [135, 3], [135, 2]], { noProg: ['bench-press'] })],
    expect: { mode: 'add', w: 190 } },
  { n: 'excluded whole session: same', p: prog([ex({})]),
    s: [S('2026-10-05T17:00', 'bench-press', [[185, 5], [185, 5], [185, 5]]), S('2026-10-12T17:00', 'bench-press', [[135, 3], [135, 3], [135, 2]], { noProg: true })],
    expect: { mode: 'add', w: 190 } },
  { n: 'weekly progression: repeat day holds Monday weight', p: prog([ex({})], { weeklyProgression: true }), now: '2026-10-16T12:00',
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 5], [185, 5], [185, 5]])], expect: { mode: 'hold', w: 185 } },
  { n: 'stalls ignore excluded sessions', p: prog([ex({ min: 6, max: 8 })]), stall: false,
    s: [S('2026-09-28T17:00', 'bench-press', [[185, 6], [185, 6], [185, 6]]), S('2026-10-05T17:00', 'bench-press', [[185, 7], [185, 7], [185, 7]]),
        S('2026-10-08T17:00', 'bench-press', [[185, 6], [185, 6], [185, 6]], { noProg: true }), S('2026-10-12T17:00', 'bench-press', [[185, 7], [185, 7], [185, 7]])],
    expect: { mode: 'beat' } },
  // ---- v16.2 ----
  { n: 'deload session never drives the next plan', p: prog([ex({})]),
    s: [S('2026-10-05T17:00', 'bench-press', [[185, 5], [185, 5], [185, 5]]), S('2026-10-12T17:00', 'bench-press', [[95, 5], [95, 5], [95, 5]], { deload: true })],
    now: '2026-10-20T12:00', expect: { mode: 'add', w: 190 } },
  { n: 'deload stays on for the rest of the week once started', p: prog([ex({})], { deloadEvery: 2 }),
    s: [S('2026-09-29T17:00', 'bench-press', [[180, 5], [180, 5], [180, 5]]), S('2026-10-05T17:00', 'bench-press', [[185, 5], [185, 5], [185, 5]]),
        S('2026-10-12T17:00', 'bench-press', [[95, 5], [95, 5], [95, 5]], { deload: true })],
    now: '2026-10-14T12:00', expect: { mode: 'deload', w: 95 } },
  { n: 'per-lift increment overrides the program increment', p: prog([ex({ inc: 10 })]),
    s: [S('2026-10-12T17:00', 'bench-press', [[185, 5], [185, 5], [185, 5]])], expect: { mode: 'add', w: 195 } },
  { n: 'logged with no weight: treated as bodyweight, never "5 lb"', p: prog([ex({ name: 'Dip', min: 6, max: 8, cat: 'triceps' })]),
    s: [S('2026-10-12T17:00', 'dip', [[0, 8], [0, 8], [0, 8]])], expect: { mode: 'add', w: 0 } },
  { n: 'weekly hold on a timed lift repeats the time, not the range floor', p: prog([ex({ name: 'Plank', bw: true, unit: 'sec', min: 30, max: 45, cat: 'abs' })], { weeklyProgression: true }),
    now: '2026-10-16T12:00', s: [S('2026-10-12T17:00', 'plank', [[0, 40], [0, 40], [0, 40]])], expect: { mode: 'hold', r: '40/40/40' } },
  { n: 'timed lift stays timed under a program-level linear default', p: prog([ex({ name: 'Plank', bw: true, unit: 'sec', min: 30, max: 45, cat: 'abs' })], { prog: 'linear' }),
    s: [S('2026-10-12T17:00', 'plank', [[0, 45], [0, 45], [0, 45]])], expect: { mode: 'addtime', r: '50/50/50' } },
  { n: 'stall: same weight but total reps rising is not a stall', p: prog([ex({ min: 6, max: 8 })]), stall: false,
    s: [S('2026-09-28T17:00', 'bench-press', [[185, 7], [185, 6], [185, 6]]), S('2026-10-05T17:00', 'bench-press', [[185, 7], [185, 7], [185, 6]]), S('2026-10-12T17:00', 'bench-press', [[185, 7], [185, 7], [185, 7]])],
    expect: { mode: 'beat' } },
  { n: 'stall: same weight and flat total reps is a stall', p: prog([ex({ min: 6, max: 8 })]), stall: true,
    s: [S('2026-09-28T17:00', 'bench-press', [[185, 7], [185, 7], [185, 6]]), S('2026-10-05T17:00', 'bench-press', [[185, 7], [185, 6], [185, 7]]), S('2026-10-12T17:00', 'bench-press', [[185, 7], [185, 7], [185, 6]])],
    expect: { mode: 'beat' } },
];
const rotCases = [
  { n: 'rotation: none logged -> first', s: [], now: '2026-10-14T12:00', expect: 'A' },
  { n: 'rotation: last was B yesterday -> C', s: [Object.assign(S('2026-10-13T17:00', 'row', [[100, 5]]), { workout: 'B' })], now: '2026-10-14T12:00', expect: 'C' },
  { n: 'rotation: wraps C -> A even on a "rest" weekday', s: [Object.assign(S('2026-10-13T17:00', 'squat', [[100, 5]]), { workout: 'C' })], now: '2026-10-17T12:00', expect: 'A' },
  { n: 'rotation: logged today -> stays today', s: [Object.assign(S('2026-10-14T09:00', 'row', [[100, 5]]), { workout: 'B' })], now: '2026-10-14T18:00', expect: 'B' },
  { n: 'rotation: program order override', s: [Object.assign(S('2026-10-13T17:00', 'squat', [[100, 5]]), { workout: 'C' })], now: '2026-10-14T12:00', rot: ['C', 'B', 'A'], expect: 'B' },
];

const b = await chromium.launch();
let fail = 0;
async function page(now) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/supabase|whoop/, r => r.abort());
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.clock.setFixedTime(new Date(now || '2026-10-14T12:00:00'));
  await p.goto(BASE); await p.evaluate(() => localStorage.setItem('iron-log-local-ok', '1'));
  return { ctx, p };
}
for (const c of cases) {
  const { ctx, p } = await page(c.now);
  await p.evaluate(ss => localStorage.setItem('iron-log-v1', JSON.stringify({ sessions: ss, deloadSkips: [] })), c.s);
  await p.reload();
  const r = await p.evaluate(([pg]) => {
    applyProgram(pg); bumpSessions();
    const e = WORKOUTS.A.exercises[0]; const pl = planFor(e);
    return { mode: pl.mode, w: pl.sets ? pl.sets[0].w : null, r: pl.sets ? pl.sets.map(x => x.r).join('/') : null, stall: isStalled(e.id), copy: coachCopy(e, pl) };
  }, [c.p]);
  const ok = Object.entries(c.expect).every(([k, v]) => r[k] === v) && (c.stall === undefined || r.stall === c.stall) && !p.errs.length;
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.n + (ok ? '' : '  got ' + JSON.stringify(r) + ' ' + p.errs.join(';')));
  await ctx.close();
}
for (const c of rotCases) {
  const { ctx, p } = await page(c.now);
  await p.evaluate(ss => { localStorage.setItem('iron-log-v1', JSON.stringify({ sessions: ss, deloadSkips: [] })); localStorage.setItem('iron-log-rotation', '1'); }, c.s);
  await p.reload();
  const r = await p.evaluate(([pg]) => { applyProgram(pg); return rotationPick(); }, [prog([ex({})], c.rot ? { rotation: c.rot } : {})]);
  const ok = r === c.expect && !p.errs.length; if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + c.n + (ok ? '' : '  got ' + r + ' ' + p.errs.join(';')));
  await ctx.close();
}
{ // e1RM cap
  const { ctx, p } = await page(); await p.reload();
  const r = await p.evaluate(() => [e1rm(200, 5), e1rm(135, 15), e1rm(100, 12)]);
  const ok = r[0] === 233 && r[1] === 0 && r[2] === 140; if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + 'e1RM: Epley up to 12 reps, none past it' + (ok ? '' : ' got ' + r));
  await ctx.close();
}
{ // v16.2: hostile or sloppy program data is coerced, not trusted
  const { ctx, p } = await page(); await p.reload();
  const r = await p.evaluate(() => {
    applyProgram({ inc: '10', weekTarget: 'x', deloadEvery: '0', schedule: { 1: "A');alert(1);('", 2: 'A' },
      workouts: { "A');alert(1);('": { exercises: [{ name: 'Bad', min: 5, max: 5 }] },
                  A: { label: 'A', exercises: [{ name: 'Bench Press', sets: '3', min: '5', max: '3', unit: 'onerror=x', rest: 'abc' }, { name: '' }] } } });
    const e = WORKOUTS.A.exercises[0];
    return { keys: Object.keys(WORKOUTS).join(','), n: WORKOUTS.A.exercises.length, sets: e.sets, min: e.min, max: e.max, unit: e.unit, rest: e.rest, inc: INC, wt: WEEK_TARGET, dl: DELOAD_EVERY, s1: SCHEDULE[1], s2: SCHEDULE[2] };
  });
  const ok = r.keys === 'A' && r.n === 1 && r.sets === 3 && r.min === 5 && r.max === 5 && r.unit === 'reps' && r.rest === 0 && r.inc === 10 && r.wt === 5 && r.dl === 0 && r.s1 === null && r.s2 === 'A' && !p.errs.length;
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + 'program data is sanitised' + (ok ? '' : ' got ' + JSON.stringify(r) + p.errs.join(';')));
  await ctx.close();
}
{ // v16.2: saving twice on one day updates the session; blank weight still saves; midnight keeps unsaved work
  const { ctx, p } = await page('2026-10-14T12:00:00'); await p.reload();
  p.on('dialog', d => d.accept());
  const r = await p.evaluate(([pg]) => {
    applyProgram(pg); workoutId = 'A'; sessions = []; bumpSessions();
    values = { 'bench-press': [{ w: '', r: '5' }, { w: '185', r: '5' }, { w: '185', r: '' }] };
    saveSession();
    const first = { n: sessions.length, sets: sessions[0].entries['bench-press'].map(x => x.w + 'x' + x.r).join(',') };
    values['bench-press'][2] = { w: '185', r: '4' };
    saveSession();
    return { first, n: sessions.length, rev: sessions[0].rev, sets: sessions[0].entries['bench-press'].length };
  }, [prog([ex({})])]);
  const ok = r.first.n === 1 && r.first.sets === '0x5,185x5' && r.n === 1 && r.rev === 1 && r.sets === 3 && !p.errs.length; if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + 'same-day save updates the session; blank weight is kept' + (ok ? '' : ' got ' + JSON.stringify(r) + p.errs.join(';')));
  const r2 = await p.evaluate(() => {
    sessions = []; bumpSessions(); values = { 'bench-press': [{ w: '185', r: '5' }] }; draftDay = '2026-10-13';
    maybeRollover(); const kept = Object.keys(values).length;
    sessions = [{ id: 1, date: new Date('2026-10-13T20:00').toISOString(), workout: 'A', entries: { 'bench-press': [{ w: 185, r: 5 }] } }]; bumpSessions();
    values = { 'bench-press': [{ w: '185', r: '5' }] }; draftDay = '2026-10-13';
    maybeRollover(); return { kept, cleared: Object.keys(values).length };
  });
  const ok2 = r2.kept === 1 && r2.cleared === 0 && !p.errs.length; if (!ok2) fail++;
  console.log((ok2 ? 'PASS ' : 'FAIL ') + 'midnight: unsaved numbers kept, saved numbers cleared' + (ok2 ? '' : ' got ' + JSON.stringify(r2) + p.errs.join(';')));
  const r3 = await p.evaluate(([pg]) => {
    applyProgram(pg); workoutId = 'A'; sessions = [{ id: 1, date: new Date('2026-10-12T17:00').toISOString(), workout: 'A', entries: { 'bench-press': [{ w: 185, r: 5 }, { w: 185, r: 5 }, { w: 185, r: 5 }] } }]; bumpSessions();
    values = { 'bench-press': [{ w: '200', r: '5', e: '8' }, { w: '', r: '4', t: 'w' }] };
    fillAll(); const v = values['bench-press'];
    return v.map(x => x.w + 'x' + x.r + (x.e || '') + (x.t || '')).join(',');
  }, [prog([ex({})])]);
  const ok3 = r3 === '200x58,190x4w,190x' && !p.errs.length; if (!ok3) fail++;
  console.log((ok3 ? 'PASS ' : 'FAIL ') + 'fill to plan keeps typed weight, reps, effort and tags' + (ok3 ? '' : ' got ' + r3 + p.errs.join(';')));
  await ctx.close();
}
await b.close();
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
