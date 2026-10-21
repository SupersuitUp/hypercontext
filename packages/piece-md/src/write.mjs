// Writing a piece.md. Every record this package writes names the standard it upholds, so an
// agent that has never seen the format can open the page and read the rules.
import { readHeader, writeHeader } from '@supersuit/hypercontext-core';
import { STANDARD, STANDARD_LATEST } from './piece.mjs';

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

/**
 * What stamping an existing record would do, as `{text, status}`:
 *   added      the header had no `standard:`, so one is appended before the closing fence
 *   upgraded   the header named the bare unversioned URL (written before versions); the URL is
 *              rewritten in place on its own line, quotes and comment kept
 *   current    it already names this version; nothing changes
 *   no-header  no header (or an empty one): refused, the text comes back unchanged. A stamp
 *              never gives a file a header, because one line is not the five answers
 *   other      it names another kind's standard or another version: left for a person
 * Every byte the status does not name stays as it was, so a second stamp changes nothing.
 */
export function stampPlan(text) {
  const src = String(text ?? '');
  const { data, raw } = readHeader(src);
  if (raw === '') return { text: src, status: 'no-header' };
  if (data.standard === undefined) return { text: writeHeader(src, { standard: STANDARD }), status: 'added' };
  if (data.standard === STANDARD) return { text: src, status: 'current' };
  if (data.standard !== STANDARD_LATEST) return { text: src, status: 'other' };
  const lines = src.split('\n');
  const at = lines.findIndex((l, i) => i > 0 && /^standard:/.test(l));
  // Swap the URL only where it ends (a quote, a space, a comment or the line end), so a longer
  // URL that merely starts the same way is never rewritten.
  lines[at] = lines[at].replace(/(https:\/\/hypercontext\.wiki\/standards\/piece)(?=["' \t#\r]|$)/, STANDARD);
  return { text: lines.join('\n'), status: 'upgraded' };
}

/** An existing record with `standard:` added or upgraded to this version, every other byte untouched. */
export const stampStandard = (text) => stampPlan(text).text;
