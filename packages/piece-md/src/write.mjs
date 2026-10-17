// Writing a piece.md. Every record this package writes names the standard it upholds, so an
// agent that has never seen the format can open the page and read the rules.
import { writeHeader } from './header.mjs';
import { STANDARD } from './piece.mjs';

/**
 * The text of a new piece.md: kind, context_version and standard first, always these values,
 * then `fields` in the order given, then the body.
 * @param {Record<string, any>} fields the rest of the header (see docs/FORMAT.md)
 * @param {string} [body]
 */
export function pieceText(fields, body = '') {
  const { kind, context_version, standard, ...rest } = fields ?? {};
  return writeHeader(body, { kind: 'piece', context_version: '1', standard: STANDARD, ...rest });
}

/** An existing record with `standard:` set, every other byte untouched. */
export const stampStandard = (text) => writeHeader(text, { standard: STANDARD });
