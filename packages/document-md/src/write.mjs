// Stamping an existing document with the standard it upholds, so an agent that has never seen
// the format can open the page and read the rules. A stamp names the standard and does nothing
// else: it never writes a header, a title or an audience, because those are a person's answers.
import { readHeader, classifyStandard, stampStandard as coreStamp } from '@supersuit/hypercontext-core';
import { KIND, STANDARD, STANDARD_LATEST, IMPLEMENTED_VERSIONS } from './document.mjs';

/**
 * What stamping an existing document would do, as `{text, status}`:
 *   added      the header had no `standard:` (or an empty one); it becomes the header's FIRST
 *              line, because a document's `kind:` is its genre and the line naming the record's
 *              rules leads the block, as Supersuit's writer puts it
 *   upgraded   the header named the bare unversioned URL (written before versions); the URL is
 *              rewritten in place on its own line, quotes and comment kept
 *   current    it already names a version this package implements; nothing changes
 *   no-header  no header (or an empty one): refused, the text comes back unchanged. A stamp
 *              never gives a file a header, because one line is not the answers a header owes
 *   other      it names another kind's standard or another version: left for a person
 * Every byte the status does not name stays as it was, so a second stamp changes nothing.
 */
export function stampPlan(text) {
  const src = String(text ?? '');
  const { data, raw } = readHeader(src);
  if (raw === '') return { text: src, status: 'no-header' };
  const { state } = classifyStandard(KIND, data.standard, IMPLEMENTED_VERSIONS);
  if (state === 'current' || state === 'implemented') return { text: src, status: 'current' };
  if (state === 'other' || state === 'unimplemented') return { text: src, status: 'other' };
  const lines = src.split('\n');
  if (state === 'bare') {
    const at = lines.findIndex((l, i) => i > 0 && /^standard:/.test(l));
    // Swap the URL only where it ends (a quote, a space, a comment or the line end), so a longer
    // URL that merely starts the same way is never rewritten.
    lines[at] = lines[at].replace(/(https:\/\/hypercontext\.wiki\/standards\/document)(?=["' \t#\r]|$)/, STANDARD);
    return { text: lines.join('\n'), status: 'upgraded' };
  }
  // An empty `standard:` key is filled where it stands, never duplicated.
  if ('standard' in data) return { text: coreStamp(src, STANDARD, STANDARD_LATEST).text, status: 'added' };
  const eol = /\r$/.test(lines[0]) ? '\r' : '';
  lines.splice(1, 0, `standard: ${JSON.stringify(STANDARD)}${eol}`);
  return { text: lines.join('\n'), status: 'added' };
}

/** An existing document with `standard:` added or upgraded to this version, every other byte untouched. */
export const stampStandard = (text) => stampPlan(text).text;
