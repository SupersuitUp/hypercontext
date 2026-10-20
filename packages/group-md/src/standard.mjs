// Self-documenting: every group record names the standard it follows, so an agent that has
// never seen this package can open the file and find its rules.
import { placeKey } from './header.mjs';

/** The URL every group record carries under `standard:`. */
export const STANDARD = 'https://hypercontext.wiki/standards/group';

/**
 * Stamp `standard:` into a record's text, directly after `kind:`. Pure. A missing key is
 * inserted, a different URL is replaced in place, the right URL changes nothing. Every other
 * byte, CRLF line endings included, is kept.
 * @param {string} text the whole file
 * @returns {string}
 */
export const stampStandard = (text) => placeKey(text, 'standard', STANDARD, 'kind');
