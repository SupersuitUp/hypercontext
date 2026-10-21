// Self-documenting: every group record names the version of the standard it follows, so an agent
// that has never seen this package can open the file and find its rules. The link names a
// version because what a version means never changes once published; a change to what a valid
// record is becomes the next version.
import { placeKey, readHeader } from '@supersuit/hypercontext-core';

/** The unversioned page: always the latest version. A record never names it. */
export const LATEST = 'https://hypercontext.wiki/standards/group';

/** The versions of the group standard this package implements. */
export const VERSIONS = [1];

/** The URL every group record carries under `standard:`. */
export const STANDARD = `${LATEST}/v1`;

const VERSIONED = /^https:\/\/hypercontext\.wiki\/standards\/group\/v([1-9][0-9]*)$/;

/**
 * What a record's `standard:` value is, as far as this package is concerned.
 * - `current`: the URL this package writes.
 * - `version`: another version of the group standard; this package does not implement it, and
 *   never rewrites it.
 * - `bare`: the unversioned URL, written before versions existed.
 * - `missing`: absent, empty, or any other URL (another kind's, a typo).
 * @param {unknown} value
 * @returns {'current'|'version'|'bare'|'missing'}
 */
export function standardStatus(value) {
  if (value === STANDARD) return 'current';
  if (value === LATEST) return 'bare';
  const m = typeof value === 'string' ? VERSIONED.exec(value) : null;
  if (m) return VERSIONS.includes(Number(m[1])) ? 'current' : 'version';
  return 'missing';
}

/**
 * Stamp `standard:` into a record's text, directly after `kind:`. Pure. A missing key is
 * inserted, the bare unversioned URL or any other URL is replaced in place, the right URL changes
 * nothing, and a version of the group standard this package does not implement is left alone
 * (writing v1 over it would claim a shape the record may not have). Every other byte, CRLF line
 * endings included, is kept.
 * @param {string} text the whole file
 * @returns {string}
 */
export function stampStandard(text) {
  if (standardStatus(readHeader(text).data.standard) === 'version') return text;
  return placeKey(text, 'standard', STANDARD, 'kind');
}
