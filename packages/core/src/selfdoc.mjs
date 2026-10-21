// The one property every hypercontext record shares: it names the version of the standard it
// follows, so an agent that has never seen its package can open the file cold and find its rules
// (docs/STANDARDS.md in @supersuit/hypercontext, section 1).
//
// What lives here is the part every package agrees on: the URL shapes, how a URL is read back as
// a version of a kind, and the byte-preserving stamp that writes `standard:` into a header. What a
// package does with an unimplemented version (refuse, throw, leave it) is that package's policy and
// stays in that package.
import { readHeader, writeHeader } from './header.mjs';

export const STANDARD_BASE = 'https://hypercontext.wiki/standards/';

/** The unversioned page of a kind: always its latest version. A record never names it. */
export const bareStandard = (kind) => `${STANDARD_BASE}${kind}`;

/** The URL of one version of a kind's standard, the value a record carries under `standard:`. */
export const standardUrl = (kind, version) => `${bareStandard(kind)}/v${version}`;

/**
 * The version a URL names for a kind: a number, 0 for the bare URL (written before versions
 * existed), null for anything else (another kind's standard, a typo, a URL that only looks like a
 * version).
 * @param {string} kind
 * @param {unknown} standard
 * @returns {number|null}
 */
export function versionOf(kind, standard) {
  const s = String(standard ?? '');
  if (s === bareStandard(kind)) return 0;
  const m = s.startsWith(`${bareStandard(kind)}/v`) ? s.slice(bareStandard(kind).length + 2).match(/^(\d+)$/) : null;
  return m ? Number(m[1]) : null;
}

/**
 * What a record's `standard:` value says, relative to the versions a validator implements:
 * - `missing`: absent or empty;
 * - `bare`: the kind's unversioned URL, written before versions; a stamp upgrades it;
 * - `current`: the newest implemented version, the one writers stamp;
 * - `implemented`: an older version the validator still reads;
 * - `unimplemented`: a version of this kind the validator does not implement;
 * - `other`: another kind's standard or any other string.
 * @param {string} kind
 * @param {unknown} standard
 * @param {number[]} [implemented=[1]]
 * @returns {{state: 'missing'|'bare'|'current'|'implemented'|'unimplemented'|'other', version: number|null}}
 */
export function classifyStandard(kind, standard, implemented = [1]) {
  const s = typeof standard === 'string' ? standard.trim() : '';
  if (!s) return { state: 'missing', version: null };
  const v = versionOf(kind, s);
  if (v === 0) return { state: 'bare', version: null };
  if (v === null) return { state: 'other', version: null };
  if (!implemented.includes(v)) return { state: 'unimplemented', version: v };
  return { state: v === Math.max(...implemented) ? 'current' : 'implemented', version: v };
}

/**
 * Add `standard:` to a record that names none, or upgrade the bare URL of its own kind (written
 * before versions) to the given version, changing nothing else. A new line goes directly after
 * `kind:` when the header has one, otherwise first. A record naming another kind's standard, or a
 * version of its own, comes back unchanged: that is a judgment for a person. A file with no header
 * is never given one. CRLF line endings are kept.
 * @param {string} text
 * @param {string} url the versioned standard to name
 * @param {string} [bare] the kind's unversioned URL, upgraded in place when found
 * @returns {{text: string, changed: boolean, reason?: string}}
 */
export function stampStandard(text, url, bare) {
  const src = String(text ?? '');
  const h = readHeader(src);
  if (h.raw === '' && !/^---[ \t]*\r?\n/.test(src)) return { text: src, changed: false, reason: 'no header' };
  const lines = src.split('\n');
  let close = -1;
  for (let i = 1; i < lines.length; i++) if (/^---[ \t]*\r?$/.test(lines[i])) { close = i; break; }
  if (close < 0) return { text: src, changed: false, reason: 'no header' };
  const eol = /\r$/.test(lines[0]) ? '\r' : '';
  const has = typeof h.data.standard === 'string' && h.data.standard !== '';
  if (has && bare && h.data.standard === bare) {
    for (let i = 1; i < close; i++) {
      if (/^standard:/.test(lines[i])) { lines[i] = `standard: ${JSON.stringify(url)}${eol}`; return { text: lines.join('\n'), changed: true }; }
    }
  }
  if (has) return { text: src, changed: false, reason: 'already names a standard' };
  // An empty `standard:` key is filled in place rather than duplicated.
  if ('standard' in h.data) return { text: writeHeader(src, { standard: url }), changed: true };
  let at = 1;
  for (let i = 1; i < close; i++) if (/^kind:/.test(lines[i])) { at = i + 1; break; }
  lines.splice(at, 0, `standard: ${JSON.stringify(url)}${eol}`);
  return { text: lines.join('\n'), changed: true };
}
