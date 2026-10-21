// A superobjective names an EXACT calendar date, never a relative one. Gary, 2026-10-20: "you should
// never put a super objective as like next October or whatever. It should be exactly the date."
// "Within twelve months" and "by next October" drift: read a month later they mean a different day,
// and the monthly calibration has nothing fixed to measure pace against.
//
// Moved whole from freedom-dev's `.agents/lib/freedom-superobjective-date.mjs` (branch
// activation/superobjective-first, 2026-10-20), which was written to move here. `datesIn`,
// `RELATIVE`, `relativePhrase`, `daysUntil`, `checkDated` and `today` behave exactly as they did
// there. Everything below the line marked ADDED is new in this package.
//
// Pure functions only, no filesystem.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH = `(${MONTHS.map((m) => `${m.slice(0, 3)}(?:${m.slice(3)})?`).join("|")})\\.?`;
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
/** True when y-m-d is a day that exists. */
const real = (y, m, d) => { const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
const monthOf = (word) => MONTHS.findIndex((m) => m.startsWith(word.toLowerCase().replace(/\.$/, "").slice(0, 3))) + 1;

/** Today as YYYY-MM-DD in local time. */
export const today = (d = new Date()) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** Every exact calendar date written in `text`, as ISO, in order: 2027-10-20, October 20, 2027, 20 October 2027. */
export function datesIn(text) {
  const s = String(text ?? ""), out = [];
  const add = (at, y, m, d) => { if (real(y, m, d)) out.push([at, iso(y, m, d)]); };
  for (const x of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(x.index, +x[1], +x[2], +x[3]);
  for (const x of s.matchAll(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) add(x.index, +x[3], monthOf(x[1]), +x[2]);
  for (const x of s.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH},?\\s+(\\d{4})\\b`, "gi"))) add(x.index, +x[3], monthOf(x[2]), +x[1]);
  return out.sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/** Relative time a superobjective must not use. Each names the drift it causes. */
export const RELATIVE = [
  /\b(?:next|this|coming)\s+(?:year|month|quarter|spring|summer|fall|autumn|winter|january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  /\b(?:within|in|over)\s+(?:a|one|two|three|six|nine|twelve|eighteen|\d+)\s+(?:years?|months?|weeks?)\b/i,
  /\b(?:a|one|\d+)\s+(?:years?|months?)\s+from\s+(?:now|today)\b/i,
  /\bby\s+next\b/i,
  /\bthis\s+time\s+next\b/i,
];

/** The first relative phrase in `text`, or null. */
export function relativePhrase(text) {
  for (const re of RELATIVE) { const m = re.exec(String(text ?? "")); if (m) return m[0]; }
  return null;
}

/** Whole days from `now` (local) to the ISO day `by`; negative when past. */
export function daysUntil(by, now = new Date()) {
  const [y, m, d] = String(by).split("-").map(Number);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - a) / 864e5);
}

/**
 * Check a superobjective sentence and its `by` date. Returns { by } with the exact date, or
 * { error } saying what to fix. `suggest` is the date to offer back when none is written
 * (one year from today by default, chosen by the caller).
 */
export function checkDated(statement, { by = null, suggest = null } = {}) {
  const rel = relativePhrase(statement);
  if (rel) return { error: `"${rel}" is relative time. A superobjective names an exact date: turn it into one with them${suggest ? ` (one year from today is ${suggest})` : ""} and write that date into the sentence.` };
  const dates = datesIn(statement);
  if (!dates.length) return { error: `the sentence has no exact date. Write the date into it, said back to them as a date${suggest ? `: one year from today is ${suggest}` : ""}.` };
  const own = dates[0];
  if (by && by !== own) return { error: `--by ${by} does not match the sentence's own date, ${own}. They are one date, written twice.` };
  if (by && !/^\d{4}-\d{2}-\d{2}$/.test(by)) return { error: `--by is an exact date, YYYY-MM-DD` };
  return { by: own };
}

// ---------------------------------------------------------------- ADDED in this package

/** True when `s` is YYYY-MM-DD and that day exists. */
export function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
  return Boolean(m) && real(+m[1], +m[2], +m[3]);
}

const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };

/** Whole days from ISO day `a` to ISO day `b` (negative when b is earlier). Calendar days, no time zone. */
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

/** The same calendar day twelve months on; Feb 29 lands on Mar 1. */
export function yearOn(day) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y + 1, m - 1, d));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The horizon a superobjective may span, in days from `set` to `by`: about six to eighteen months. */
export const HORIZON = Object.freeze({ min: 183, max: 548 });
