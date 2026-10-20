import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/date.mjs';

// Ported unchanged from freedom-dev tests/onboard-superobjective-first.test.mjs, where this module started.
test('the date reader understands ISO, month-day-year and day-month-year, and names relative phrases', () => {
  assert.deepEqual(D.datesIn('By 2027-04-30, x'), ['2027-04-30']);
  assert.deepEqual(D.datesIn('By October 20, 2027, x'), ['2027-10-20']);
  assert.deepEqual(D.datesIn('By 20 Oct 2027, x'), ['2027-10-20']);
  assert.deepEqual(D.datesIn('By February 30, 2027'), [], 'not a real day');
  assert.equal(D.relativePhrase('by next spring'), 'next spring');
  assert.equal(D.relativePhrase('By 2027-04-30'), null);
  assert.equal(D.daysUntil('2027-10-20', new Date(2027, 9, 10, 9)), 10);
});

test('every relative phrase the standard names is refused', () => {
  for (const s of ['next October', 'within twelve months', 'this year', 'by next fall', 'a year from now', 'in 12 months', 'this time next year']) {
    assert.ok(D.relativePhrase(`I ship it ${s}.`), s);
  }
  assert.equal(D.relativePhrase('I ship it on October 18, 2027.'), null);
});

test('checkDated returns the sentence date, or says what to fix', () => {
  assert.deepEqual(D.checkDated('In print by October 18, 2027.'), { by: '2027-10-18' });
  assert.match(D.checkDated('In print next October.').error, /relative time/);
  assert.match(D.checkDated('In print one day.', { suggest: '2027-10-18' }).error, /no exact date.*2027-10-18/);
  assert.match(D.checkDated('In print by October 18, 2027.', { by: '2027-09-01' }).error, /does not match/);
});

test('isDate, daysBetween and yearOn are calendar arithmetic with no time zone', () => {
  assert.ok(D.isDate('2027-02-28'));
  assert.ok(!D.isDate('2027-02-29'));
  assert.ok(!D.isDate('2027-2-28'));
  assert.equal(D.daysBetween('2026-10-18', '2027-10-18'), 365);
  assert.equal(D.daysBetween('2027-10-18', '2026-10-18'), -365);
  assert.equal(D.daysBetween('2027-03-13', '2027-03-15'), 2, 'across a DST change');
  assert.equal(D.yearOn('2026-10-18'), '2027-10-18');
  assert.equal(D.yearOn('2028-02-29'), '2029-03-01');
});
