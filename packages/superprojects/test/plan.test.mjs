import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDuration, parseTarget, parseWindow, parseActors, parseStatus, parseCapacity,
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
- status: todo

### s03 Letters in transit
- actor: outside: USPS
- kind: wait
- lead: 5d (estimate)
- after: s02

### s04 Decide on wave two
- actor: alex
- kind: gate
- after: s03
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
