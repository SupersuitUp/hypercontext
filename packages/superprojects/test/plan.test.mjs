import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDuration, parseTarget, parseWindow, parseActors, parseStatus, parseCapacity,
  parsePlan, lintPlan, isOutside, schedulePlan, planStatus, proposeBlocks,
} from '../src/plan.mjs';

const FIX = `---
plan_version: "1"
baseline: 2026-10-05
baseline_finish: 2026-10-30
capacity: "alex 5h/week"
---
# Plan

## Steps

### s01 Agent drafts the letter
- actor: agent
- kind: work
- effort: 20m (measured, run 3)
- status: done 2026-10-05

### s02 Alex signs the letters
- actor: alex
- kind: work
- effort: 3h (estimate, Alex, 2026-10-05)
- after: s01
- part: show-up
- status: todo

### s03 Letters in transit
- actor: outside: USPS
- kind: wait
- lead: 5d (estimate, Alex, 2026-10-05)
- after: s02
- part: none

### s04 Decide on wave two
- actor: alex
- kind: gate
- after: s03
- part: pick
- target: 2026-10-20 (provisional)

### m1 Wave two decided
- kind: milestone
- after: s04
- target: 2026-10-30 (provisional)

## Scenarios
- working: steady. Replies trickle in. s04 -> 2026-10-20
- fast: replies come early. s04 -> 2026-10-14

## Revisions
- 2026-10-05 baseline: drafted for the test.
`;
const plan = (text = FIX) => parsePlan(text);
const edit = (from, to) => FIX.replace(from, to);

test('durations carry their minutes and where they came from', () => {
  assert.deepEqual(parseDuration('45m (estimate, Gary, 2026-10-05)'), {
    minutes: 45, text: '45m',
    source: { type: 'estimate', by: 'Gary', date: '2026-10-05', raw: 'estimate, Gary, 2026-10-05' },
  });
  const drive = parseDuration('3h of driving (estimate, Austin and back)');
  assert.equal(drive.minutes, 180);
  assert.equal(drive.source.type, 'estimate');
  assert.equal(parseDuration('20m (measured, run 3)').source.type, 'measured');
  assert.deepEqual(parseDuration('2w'), { minutes: 20160, text: '2w', source: null });
  assert.equal(parseDuration('1.5h (estimate)').minutes, 90);
  assert.equal(parseDuration('soon'), null);
});
test('targets, windows, statuses and capacity parse strictly', () => {
  assert.deepEqual(parseTarget('2026-11-14 (provisional; her call)'), { date: '2026-11-14', provisional: true });
  assert.deepEqual(parseTarget('2026-11-14'), { date: '2026-11-14', provisional: false });
  assert.equal(parseTarget('2026-02-30'), null);
  assert.deepEqual(parseWindow('2026-10-08..2026-10-12'), { start: '2026-10-08', end: '2026-10-12' });
  assert.equal(parseWindow('2026-10-12..2026-10-08'), null);
  assert.deepEqual(parseStatus('done 2026-10-06'), { state: 'done', date: '2026-10-06' });
  assert.deepEqual(parseStatus('blocked: waiting on the quote'), { state: 'blocked', why: 'waiting on the quote' });
  assert.deepEqual(parseStatus('doing'), { state: 'doing' });
  assert.equal(parseStatus('later'), null);
  assert.deepEqual(parseCapacity('gary-sheng 5h/week, wilson-fong 3.5h/week (share of 20)'), { 'gary-sheng': 300, 'wilson-fong': 210 });
});
test('actors: people by slug, the agent, and one outside name with its commas', () => {
  assert.deepEqual(parseActors('gary-sheng, sam'), [{ type: 'person', slug: 'gary-sheng' }, { type: 'person', slug: 'sam' }]);
  assert.deepEqual(parseActors('agent'), [{ type: 'agent' }]);
  assert.deepEqual(parseActors("outside: Gary's parents, and brother"), [{ type: 'outside', name: "Gary's parents, and brother" }]);
  assert.deepEqual(parseActors('Bad Name'), [{ type: 'invalid', raw: 'Bad Name' }]);
  assert.deepEqual(parseActors(''), []);
});
test('a plan parses into header, steps, scenarios and revisions', () => {
  const p = plan();
  assert.deepEqual(p.problems, []);
  assert.equal(p.header.capacity, 'alex 5h/week');
  assert.deepEqual(p.steps.map((s) => s.id), ['s01', 's02', 's03', 's04', 'm1']);
  const s02 = p.steps[1];
  assert.equal(s02.title, 'Alex signs the letters');
  assert.deepEqual(s02.after, ['s01']);
  assert.equal(s02.effort.minutes, 180);
  assert.deepEqual(p.steps[2].actors, [{ type: 'outside', name: 'USPS' }]);
  assert.deepEqual(p.steps[0].status, { state: 'done', date: '2026-10-05' });
  assert.equal(p.steps[4].kind, 'milestone');
  assert.deepEqual(p.scenarios.map((s) => [s.name, s.working, s.overrides]), [
    ['steady', true, { s04: '2026-10-20' }],
    ['fast', false, { s04: '2026-10-14' }],
  ]);
  assert.deepEqual(p.revisions.map((r) => r.date), ['2026-10-05']);
});
test('bad ids, values and an unclosed header are problems with line numbers, never throws', () => {
  const bad = parsePlan(edit('### s02 Alex', '### S2 Alex').replace('- status: todo', '- status: later'));
  assert.ok(bad.problems.some((x) => /step id "S2"/.test(x.message)));
  assert.ok(bad.problems.some((x) => /status "later"/.test(x.message) && x.line > 0));
  assert.ok(parsePlan(edit('- target: 2026-10-20 (provisional)', '- target: someday')).problems.some((x) => /target "someday" does not parse/.test(x.message)));
  assert.ok(parsePlan('---\nplan_version: "1"\n# Plan\n').problems.some((x) => /not closed/.test(x.message)));
});
const codes = (text, opts) => lintPlan(parsePlan(text), opts).map((f) => f.code);
test('the fixture is clean', () => {
  assert.deepEqual(lintPlan(plan(), { team: ['alex'] }), []);
});
test('an agent can never pass a gate, and broken dependencies are errors', () => {
  assert.ok(codes(edit('- actor: alex\n- kind: gate', '- actor: agent\n- kind: gate')).includes('plan:gate:agent'));
  assert.ok(codes(edit('- after: s03', '- after: s09')).includes('plan:after:unknown'));
  assert.ok(codes(edit('- status: done 2026-10-05', '- after: s04\n- status: done 2026-10-05')).includes('plan:after:cycle'));
  assert.ok(codes(edit('- actor: alex\n- kind: work', '- kind: work')).includes('plan:step:no-actor'));
  assert.ok(codes(edit('### s04 Decide', '### s01 Decide')).includes('plan:step:duplicate-id'));
});
test('warnings: unsourced durations, oversized human steps, undated decisions, loose outside asks', () => {
  assert.ok(codes(edit('3h (estimate, Alex, 2026-10-05)', '3h')).includes('plan:duration:no-source'));
  assert.ok(codes(edit('3h (estimate, Alex, 2026-10-05)', '5h (estimate)')).includes('plan:human:too-long'));
  assert.ok(codes(edit('3h (estimate, Alex, 2026-10-05)', '3h (estimate)')).includes('plan:duration:thin-source'), 'an estimate says whose and when');
  assert.ok(codes(edit('3h (estimate, Alex, 2026-10-05)', '3h (estimate, Alex)')).includes('plan:duration:thin-source'));
  assert.ok(codes(edit('20m (measured, run 3)', '20m (measured)')).includes('plan:duration:thin-source'), 'a measurement names its run');
  assert.ok(!codes(FIX).includes('plan:duration:thin-source'));
  assert.ok(codes(edit('- target: 2026-10-20 (provisional)\n', '')).includes('plan:target:missing'));
  const ask = edit('### m1', '### s05 Printer returns proofs\n- actor: outside: Printer\n- kind: work\n- lead: 2d (estimate)\n\n### m1');
  assert.ok(codes(ask).includes('plan:outside:no-window'));
  assert.ok(codes(ask).includes('plan:outside:no-fallback'));
  assert.ok(!codes(FIX).includes('plan:outside:no-window'), 'a wait is exempt');
  assert.ok(codes(edit('- kind: milestone', '- kind: gate\n- actor: alex')).includes('plan:milestone:missing'));
  assert.ok(!codes(edit('- kind: milestone', '- kind: gate\n- actor: alex'), { kind: 'ongoing' }).includes('plan:milestone:missing'));
  assert.ok(codes(edit('- fast:', '- working: fast.')).includes('plan:scenario:working'));
  assert.ok(codes(edit('s04 -> 2026-10-14', 's09 -> 2026-10-14')).includes('plan:scenario:unknown-step'));
});
const isOutsideOf = (p, id, team) => isOutside(p.steps.find((s) => s.id === id), team);
test('a team member is not outside; anyone off the roles is', () => {
  const p = parsePlan(edit('- actor: alex\n- kind: work', '- actor: sam\n- kind: work'));
  assert.equal(isOutsideOf(p, 's02', ['alex']), true);
  assert.equal(isOutsideOf(p, 's02', ['alex', 'sam']), false);
});
const rows = (s) => Object.fromEntries(s.steps.map((r) => [r.id, r]));
test('effort inside weekly hours, waits by lead, targets as not-before', () => {
  const s = schedulePlan(plan(), { today: '2026-10-06' });
  const r = rows(s);
  assert.equal(r.s02.finish, '2026-10-06', '3h fits in a 5h week on the day it is ready');
  assert.equal(r.s03.finish, '2026-10-11', 'five days in transit');
  assert.equal(r.s04.earliest, '2026-10-11');
  assert.equal(r.s04.finish, '2026-10-20', 'a decision is not made before its date');
  assert.equal(r.m1.earliest, '2026-10-20');
  assert.equal(r.m1.finish, '2026-10-30');
  assert.equal(s.final, 'm1');
  assert.deepEqual(s.criticalPath, ['s01', 's02', 's03', 's04', 'm1']);
  assert.equal(s.scenario, 'steady');
});
test('a full week pushes the work to next Monday', () => {
  const r = rows(schedulePlan(plan(), { today: '2026-10-06', capacity: { alex: 120 } }));
  assert.equal(r.s02.finish, '2026-10-12');
  assert.equal(r.s03.finish, '2026-10-17');
});
test('a scenario moves only the dates it names', () => {
  const r = rows(schedulePlan(plan(), { today: '2026-10-06', scenario: 'fast' }));
  assert.equal(r.s04.finish, '2026-10-14');
  assert.equal(r.m1.finish, '2026-10-30');
  assert.throws(() => schedulePlan(plan(), { today: '2026-10-06', scenario: 'nope' }), /no scenario named nope/);
});
test('refuses a cycle and a bad date rather than guessing', () => {
  assert.throws(() => schedulePlan(plan(edit('- status: done 2026-10-05', '- after: s04\n- status: done 2026-10-05')), { today: '2026-10-06' }), /cycle/);
  assert.throws(() => schedulePlan(plan(), { today: '10/06' }), /YYYY-MM-DD/);
});
const status = (opts, text) => planStatus(plan(text), { today: '2026-10-06', team: ['alex'], ...opts });
test('the four verdicts', () => {
  const ok = status({});
  assert.equal(ok.verdict, 'on-track');
  assert.deepEqual(ok.against, { date: '2026-10-30', kind: 'provisional' });
  assert.equal(ok.slackDays, 10);
  assert.equal(ok.bufferDays, 3);
  assert.equal(ok.driver, 's04', 'the decision date is what sets the finish');
  assert.equal(status({ deadline: '2026-10-22' }).verdict, 'at-risk');
  const late = status({ deadline: '2026-10-15' });
  assert.equal(late.verdict, 'behind');
  assert.equal(late.slackDays, -5);
  assert.equal(status({}, edit('- target: 2026-10-30 (provisional)\n', '')).verdict, 'no-deadline');
});
test('an open critical step past its date is behind, and names itself', () => {
  const dated = edit('- after: s01\n- part: show-up\n- status: todo', '- after: s01\n- part: show-up\n- target: 2026-10-07 (provisional)\n- status: todo');
  const r = planStatus(plan(dated), { today: '2026-10-21', team: ['alex'] });
  assert.equal(r.verdict, 'behind');
  assert.equal(r.driver, 's02');
});
test('a request that cannot start until its window has closed is never on track, and names itself', () => {
  const move = plan(`---
plan_version: "1"
---
# Plan

## Steps

### s01 Buyer signs at closing
- actor: buyer
- effort: 2h (estimate, buyer, 2026-05-04)
- target: 2026-06-26 (provisional)

### s02 Movers carry everything
- actor: outside: movers
- after: s01
- window: 2026-06-27..2026-06-27
- fallback: a second company holds the same day

### m1 Moved in
- kind: milestone
- after: s02
- target: 2026-06-28 (provisional)

## Scenarios
- working: on time. s01 -> 2026-06-26
- slip: closing moves two weeks. s01 -> 2026-07-10, m1 -> 2026-07-12
`);
  const opts = { today: '2026-05-04', deadline: '2026-07-31', team: ['buyer'] };
  const fine = planStatus(move, opts);
  assert.equal(fine.verdict, 'on-track');
  assert.deepEqual(fine.missedWindows, []);
  const row = schedulePlan(move, { today: '2026-05-04', scenario: 'slip' }).steps.find((r) => r.id === 's02');
  assert.equal(row.missedWindow, true, 'the movers come on the 27th, and closing is now the 10th');
  const slip = planStatus(move, { ...opts, scenario: 'slip' });
  assert.equal(slip.verdict, 'at-risk', 'slack alone says on track; the booking is gone');
  assert.equal(slip.driver, 's02');
  assert.deepEqual(slip.missedWindows, ['s02']);
  assert.match(slip.line, /; s02 cannot start until after its window closes on 2026-06-27, so its fallback applies$/);
  const quiet = planStatus(move, { ...opts, today: '2026-06-30' });
  assert.deepEqual(quiet.missedWindows, ['s02'], 'a window that closed with no answer is missed too');
});
test('ready work by actor, slip against the baseline, and the defensible test', () => {
  const r = status({});
  assert.deepEqual(r.ready, { alex: ['s02'] });
  assert.equal(r.slipDays, 0);
  assert.equal(r.defensible.ok, true);
  assert.equal(r.defensible.conditions.length, 7);
  const loose = status({}, edit('3h (estimate, Alex, 2026-10-05)', '3h'));
  assert.equal(loose.defensible.ok, false);
  assert.deepEqual(loose.defensible.conditions.find((c) => !c.ok), { condition: 'every duration says where it came from', ok: false, steps: ['s02'] });
});
test('every scenario side by side on request', () => {
  const r = status({ allScenarios: true });
  assert.deepEqual(r.scenarios.map((s) => [s.name, s.working, s.verdict]), [['steady', true, 'on-track'], ['fast', false, 'on-track']]);
  assert.match(r.line, /^on track: earliest finish 2026-10-20 against a provisional 2026-10-30/);
});
test('fits the next human steps into free time, never before they can start', () => {
  const free = [
    { start: '2026-10-06T14:00:00Z', end: '2026-10-06T16:00:00Z' },
    { start: '2026-10-07T14:00:00Z', end: '2026-10-07T18:00:00Z' },
  ];
  const r = proposeBlocks(plan(), { today: '2026-10-06', freeSlots: free, actor: 'alex' });
  assert.deepEqual(r.proposals.map((p) => [p.step, p.start, p.end]), [['s02', '2026-10-07T14:00:00.000Z', '2026-10-07T17:00:00.000Z']]);
  assert.deepEqual(r.unplaced, []);
});
test('booked steps are skipped, tight calendars report what did not fit, actor is required', () => {
  assert.deepEqual(proposeBlocks(plan(edit('- status: todo', '- booked: 2026-10-07T14:00\n- status: todo')), { today: '2026-10-06', freeSlots: [{ start: '2026-10-07T14:00:00Z', end: '2026-10-07T18:00:00Z' }], actor: 'alex' }).proposals, []);
  const tight = proposeBlocks(plan(), { today: '2026-10-06', freeSlots: [{ start: '2026-10-06T14:00:00Z', end: '2026-10-06T15:00:00Z' }], actor: 'alex' });
  assert.deepEqual(tight.unplaced.map((u) => u.step), ['s02']);
  assert.throws(() => proposeBlocks(plan(), { today: '2026-10-06' }), /actor is required/);
});

// A STEP SAYS WHAT LAUNCHING IT ASKS OF THE OPERATOR (2026-10-21). Every open step is a session the
// product can start now: \`part\` is none, pick (they choose first), approve (a draft that reaches a
// person waits for their yes) or show-up (only they can do it; the session books the time).
test('part is a step field with four values; an open step without one is warned, a done one is not', () => {
  const p = plan();
  assert.deepEqual(p.steps.map((s) => s.part), [null, 'show-up', 'none', 'pick', null]);
  assert.ok(parsePlan(edit('- part: pick', '- part: maybe')).problems.some((x) => /part "maybe" is not none, pick, approve or show-up/.test(x.message)));
  assert.ok(codes(edit('- part: show-up\n', '')).includes('plan:step:no-part'));
  assert.ok(!codes(FIX).includes('plan:step:no-part'), 'the done step and the milestone need none');
  assert.ok(codes(edit('- part: pick', '- part: none')).includes('plan:gate:part'), 'a gate always asks something of a person');
});
