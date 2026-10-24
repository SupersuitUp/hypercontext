// The rules standard v1's vocabulary: its URL, the id grammar, the statuses, the fingerprint.
import { createHash } from 'node:crypto';
import { standardUrl, bareStandard } from '@supersuit/hypercontext-core';

export const KIND = 'rules';
export const STANDARD = standardUrl(KIND, 1);
export const STANDARD_LATEST = bareStandard(KIND);
export const IMPLEMENTED_VERSIONS = [1];
export const STATUSES = ['live', 'retired'];

// A rule id is a lowercase slug that a person and an agent can both read without a lookup.
// It never changes once given, and a retired id is never reused: renaming would orphan every
// commit, hook refusal and why entry that cites it.
export const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ID = 48;
export const isId = (s) => typeof s === 'string' && s.length <= MAX_ID && ID.test(s);

// `<!-- rule: <id> -->`, hidden in a rendered page, read by any model that loads the file.
export const MARKER = /<!--\s*rule:\s*([^\s>]*)\s*-->/;
export const MARKER_G = /<!--\s*rule:\s*[^\s>]*\s*-->/g;

/**
 * The first 8 hex of sha256 over a rule's words, with the marker removed and every run of
 * whitespace (line wrapping included) collapsed. Rewrapping a rule does not move it; rewording does.
 */
export const fingerprint = (text) =>
  createHash('sha256').update(String(text).replace(MARKER_G, '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8);

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
}
