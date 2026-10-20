// The vocabulary of the standard, and the pure helpers every other module shares.
// Every header value reads as a string (see header.mjs); this module decides what it means.

export const STANDARD = 'https://hypercontext.wiki/standards/superobjective';
export const VERSION = '1';
export const FILE = 'superobjective.md';
export const RATCHET = 'ratchet.jsonl';
export const CALIBRATIONS = 'calibrations.jsonl';

export const ROOTS = Object.freeze(['personal', 'company']);
export const STATUSES = Object.freeze(['draft', 'active', 'achieved', 'missed', 'retired']);
export const VISIBILITIES = Object.freeze(['private', 'members', 'public']);
export const SIGN_STATES = Object.freeze(['open', 'met', 'missed']);
export const KEEP = Object.freeze(['keep', 'home', 'share']);
/** Every value `change` may hold on a ratchet line. */
export const CHANGES = Object.freeze(['set', 'raise', 'reword', 'add-sign', 'meet-sign', 'rerank', 'lower', 'close', 'retire', 'visibility', 'migrate']);
/**
 * The word for the observable things that show a superobjective coming true. ONE table, so a rename
 * (Gary is weighing "milestones", 2026-10-20) is a change here: `key` is the header key written,
 * `aliases` are older keys still read, `one`/`many` are the words people see.
 */
export const TERM = Object.freeze({ one: 'sign', many: 'signs', key: 'signs', aliases: Object.freeze([]) });
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const TERM_TITLE = cap1(TERM.many);

/**
 * Most active superobjectives per owner (personal) or per organization (company). The same rule for
 * both (Gary, 2026-10-20): up to three, ranked, one by default; the first leads when two compete.
 * Counted separately per root, so a person's three never use up their company's three.
 */
export const CAP = Object.freeze({ personal: 3, company: 3 });
/** Signs on an active superobjective. */
export const SIGNS = Object.freeze({ min: 3, max: 7 });
export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const text = (v) => (typeof v === 'string' ? v.trim() : '');

const STOP = new Set(['a', 'an', 'the', 'my', 'our', 'of', 'to', 'in', 'on', 'by', 'and', 'with', 'for', 'is', 'has', 'have', 'be', 'at', 'we', 'i', 'it', 'its']);

/** A kebab-case id from a sentence: its first `words` meaningful words. */
export function slugify(s, words = 5) {
  const parts = String(s ?? '').toLowerCase().replace(/\*\*/g, '').replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  const kept = parts.filter((w) => !STOP.has(w));
  return (kept.length ? kept : parts).slice(0, words).join('-') || 'superobjective';
}

/** The signs of a header as `{id, text, by?, state, settled?}`, whatever shape they were written in. */
export function signsOf(data) {
  const v = data?.[TERM.key] ?? TERM.aliases.map((k) => data?.[k]).find((x) => x !== undefined);
  if (!Array.isArray(v)) return [];
  return v.map((s) => {
    if (!isMap(s)) return { id: '', text: String(s ?? ''), state: 'open' };
    const out = { id: String(s.id ?? ''), text: String(s.text ?? ''), state: String(s.state || 'open') };
    if (s.by) out.by = String(s.by);
    if (s.settled) out.settled = String(s.settled);
    return out;
  });
}

/** The people who own a superobjective: `owner` for personal, `owners` for company. */
export function ownersOf(data) {
  const many = data?.owners;
  if (Array.isArray(many) && many.length) return many.map(String);
  if (typeof many === 'string' && many.trim()) return [many.trim()];
  return text(data?.owner) ? [text(data.owner)] : [];
}

/** The group a rank is counted in: one owner's personal set, or one organization. */
export function groupOf(data) {
  if (data?.root === 'company') return `company:${text(data.organization) || ownersOf(data).slice().sort().join('+')}`;
  return `personal:${ownersOf(data)[0] ?? ''}`;
}

/** What a ratchet line's `after` records: the five things that may never change silently. */
export function snapshot(data) {
  return {
    statement: String(data?.statement ?? ''),
    by: String(data?.by ?? ''),
    rank: data?.rank === undefined || data?.rank === '' ? null : String(data.rank),
    status: String(data?.status ?? ''),
    signs: signsOf(data).map(({ id, text: t, by, state }) => (by ? { id, text: t, by, state } : { id, text: t, state })),
  };
}

/** keep, from visibility: a private record never leaves the machine, a members one stays in its workspace. */
export const keepFor = (visibility) => (visibility === 'public' ? 'share' : visibility === 'members' ? 'home' : 'keep');

/** The ratchet line that records the current state: the last one carrying `after`. */
export const lastState = (lines) => [...(lines ?? [])].reverse().find((l) => isMap(l?.after)) ?? null;
