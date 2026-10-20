import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pace } from '../src/pace.mjs';

const data = (signs, over = {}) => ({ id: 'garden-book-in-print', root: 'personal', set: '2026-10-18', by: '2027-10-18', signs, ...over });
const open = (id, extra = {}) => ({ id, text: id, state: 'open', ...extra });
const met = (id, extra = {}) => ({ id, text: id, state: 'met', settled: '2026-11-01', ...extra });

test('nothing met at the start is on pace', () => {
  const p = pace(data([open('a'), open('b'), open('c'), open('d')]), { today: '2026-10-18' });
  assert.deepEqual([p.elapsed, p.met, p.total, p.verdict, p.daysLeft], [0, 0, 4, 'on', 365]);
});

test('one sign of four met in the first month is ahead: half a sign early offers a raise', () => {
  const p = pace(data([met('a'), open('b'), open('c'), open('d')]), { today: '2026-11-18' });
  assert.equal(p.verdict, 'ahead');
});

test('a sign on time is on pace, and a whole sign behind is behind', () => {
  assert.equal(pace(data([met('a'), open('b'), open('c'), open('d')]), { today: '2027-01-18' }).verdict, 'on');
  assert.equal(pace(data([met('a'), open('b'), open('c'), open('d')]), { today: '2027-07-18' }).verdict, 'behind');
});

test('an open sign past its own date makes it behind whatever the count', () => {
  const p = pace(data([met('a'), met('b'), open('c', { by: '2026-12-01' })]), { today: '2026-12-02' });
  assert.deepEqual(p.overdue, ['c']);
  assert.equal(p.verdict, 'behind');
});

test('a sign met before its own date is early', () => {
  assert.deepEqual(pace(data([met('a', { by: '2027-03-01' }), open('b'), open('c')]), { today: '2026-11-02' }).early, ['a']);
});

test('elapsed is clamped, and the count of superprojects serving each sign is reported', () => {
  const superprojects = [{ serves: 'personal/garden-book-in-print#a' }, { serves: ['personal/garden-book-in-print#a', 'company/garden-book-in-print#b'] }, { serves: 'nonsense' }];
  const p = pace(data([open('a'), open('b'), open('c')]), { today: '2028-01-01', superprojects });
  assert.equal(p.elapsed, 1);
  assert.deepEqual(p.serving, { a: 2, b: 0, c: 0 });
  assert.deepEqual(p.unserved, ['b', 'c']);
});

test('pace refuses a today that is not a date', () => {
  assert.throws(() => pace(data([]), { today: 'tomorrow' }));
});
