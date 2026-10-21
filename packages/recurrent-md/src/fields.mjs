// What a recurrent says, and how Supersuit reads it.
//
// Every rule here is taken from Supersuit (SupersuitUp/freedom-dev), never invented:
//   .agents/lib/freedom-recurrents.mjs   the reader: which keys it takes, the cadence grammar,
//                                         the status words setRecurrent writes
//   .agents/lib/frontmatter/kinds.mjs    the project and state kinds a recurrent file is read as:
//                                         each label's key and type
//   .agents/lib/vendor/superprojects/src/frontmatter/index.mjs
//                                         readLabels: how a `**Label:**` line becomes a value
//   recurrents/README.md, .agents/skills/create-or-update-recurrent/SKILL.md
//                                         the file's shape and the status vocabulary
// docs/FORMAT.md cites each one by line.

export const KIND = 'recurrent';
/** The unversioned page: always the newest version of the recurrent standard, and the list of all of them. */
export const STANDARD_LATEST = 'https://hypercontext.wiki/standards/recurrent';
/** The versions of the recurrent standard this package implements. */
export const IMPLEMENTED_VERSIONS = [1];
/** The version a recurrent names as the standard it upholds. */
export const STANDARD = `${STANDARD_LATEST}/v1`;

/** The status words setRecurrent writes and the README offers. */
export const STATUSES = ['active', 'paused'];
/** The status words the label reader recognizes at all (PROJECT_STATUS in kinds.mjs). */
export const READER_STATUSES = ['active', 'done', 'parked', 'paused'];

/**
 * The fields of a recurrent: every key freedom-recurrents.mjs takes from a recurrent's file, by the
 * label it has in the body and the type kinds.mjs gives it. `status` also yields `status_note`
 * (the words after the status word), as the label reader does.
 *   string  a value, one line
 *   list    comma-separated in a label, a list in the header
 *   date    a real YYYY-MM-DD, or never (`last_run` alone takes never)
 *   slug    a person's slug, or a link to their record
 *   status  a status word, then an optional note
 */
export const FIELDS = Object.freeze({
  method: { label: 'Method', type: 'string' },
  arguments: { label: 'Arguments', type: 'string' },
  cadence: { label: 'Cadence', type: 'string' },
  last_run: { label: 'Last run', type: 'date', never: true },
  clock: { label: 'Clock', type: 'list' },
  off_switch: { label: 'Off switch', type: 'string' },
  unattended: { label: 'Unattended', type: 'string' },
  window: { label: 'Window', type: 'string' },
  at: { label: 'At', type: 'string' },
  owner: { label: 'Owner', type: 'slug' },
  status: { label: 'Status', type: 'status' },
});

const BY_LABEL = new Map(Object.entries(FIELDS).map(([key, f]) => [f.label.toLowerCase(), key]));
/** The field a label names, case-insensitively as the reader matches it, or null. */
export const fieldOf = (label) => BY_LABEL.get(String(label).toLowerCase()) ?? null;

/**
 * A recurrent's cadence in days, sub-day included, or null when the reader cannot count it:
 * recurrentCadenceDays in freedom-recurrents.mjs, falling through to the superprojects engine's
 * cadenceDays for whole days.
 */
export function cadenceDays(text) {
  if (!text) return null;
  const s = String(text).trim().toLowerCase();
  if (s === 'hourly') return 1 / 24;
  if (s === 'twice daily' || s === 'twice a day') return 0.5;
  const h = s.match(/^every\s+(\d+)\s+hours?$/);
  if (h) return +h[1] > 0 ? +h[1] / 24 : null;
  if (s === 'daily') return 1;
  if (s === 'weekly') return 7;
  if (s === 'fortnightly') return 14;
  if (s === 'monthly') return 30;
  if (s === 'quarterly') return 90;
  const m = s.match(/^every\s+(\d+)\s+(day|week)s?$/);
  return m ? +m[1] * (m[2] === 'week' ? 7 : 1) : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** A real calendar date written YYYY-MM-DD (isValidDate in kinds.mjs). */
export function isDate(s) {
  if (!DATE.test(String(s))) return false;
  const [y, m, d] = String(s).split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
}
/** `last_run` as the state kind types it: a real date, or never. */
export const isLastRun = (v) => v === 'never' || isDate(v);
