// Calibration math: signs met against time elapsed, and a verdict of ahead, on or behind.
//
// elapsed  = days from `set` to today, over days from `set` to `by`, clamped to 0..1
// expected = elapsed * signs                       (how many signs "should" be met by now)
// lead     = met - expected                       (in signs)
// ahead when lead >= 0.5; behind when lead <= -1, or when any open sign is past its own date;
// on otherwise. Deliberately lopsided: half a sign early is enough to OFFER a raise (an offer costs
// the owner one answer), while behind takes a whole sign, because naming someone behind is heavier.
//
// Pure: no filesystem. `superprojects` is an optional list of {serves} records so each sign can
// say how much work is pointed at it.
import { signsOf } from './record.mjs';
import { daysBetween, isDate } from './date.mjs';
import { parseServes } from './serves.mjs';

/** Signs ahead of the expected count that make a superobjective ahead; a whole sign behind makes it behind. */
export const AHEAD = 0.5, BEHIND = -1;
export const VERDICTS = Object.freeze(['ahead', 'on', 'behind']);

/**
 * @param {Record<string, any>} data a record's header
 * @param {{today: string, superprojects?: Array<{serves?: string|string[]}>}} opts
 */
export function pace(data, { today, superprojects = [] } = {}) {
  if (!isDate(today)) throw new Error('pace needs today as YYYY-MM-DD');
  const signs = signsOf(data);
  const total = signs.length;
  const met = signs.filter((s) => s.state === 'met').length;
  const span = isDate(data.set) && isDate(data.by) ? daysBetween(data.set, data.by) : 0;
  const into = isDate(data.set) ? daysBetween(data.set, today) : 0;
  const elapsed = span > 0 ? Math.min(1, Math.max(0, into / span)) : 0;
  const expected = elapsed * total;
  const lead = met - expected;
  const overdue = signs.filter((s) => s.state === 'open' && s.by && isDate(s.by) && s.by < today).map((s) => s.id);
  const early = signs.filter((s) => s.state === 'met' && s.by && s.settled && s.settled < s.by).map((s) => s.id);
  const verdict = !total ? 'on' : (lead <= BEHIND || overdue.length) ? 'behind' : lead >= AHEAD ? 'ahead' : 'on';
  const serving = Object.fromEntries(signs.map((s) => [s.id, 0]));
  for (const p of superprojects) {
    for (const v of [].concat(p?.serves ?? [])) {
      const s = parseServes(v);
      if (s && s.root === data.root && s.id === data.id && s.sign in serving) serving[s.sign]++;
    }
  }
  const unserved = signs.filter((s) => s.state === 'open' && !serving[s.id]).map((s) => s.id);
  return {
    id: data.id, today, elapsed: round(elapsed), met, total, expected: round(expected), lead: round(lead),
    verdict, overdue, early, serving, unserved,
    daysLeft: isDate(data.by) ? daysBetween(today, data.by) : null,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;
