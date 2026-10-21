// The stamp: make an existing checkpoint name the standard version it follows, changing nothing else.
import { readHeader, classifyStandard } from '@supersuit/hypercontext-core';
import { STANDARD, STANDARD_LATEST, IMPLEMENTED_VERSIONS } from './checkpoint.mjs';

const FENCE = /^---[ \t]*\r?$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * What stamping an existing checkpoint would do, as `{text, status}`:
 *   added      the header named no standard (or an empty one): `standard: <v1>` is written on
 *              its own line directly after `kind:`, where Supersuit's writer puts it, or first
 *              when there is no `kind:` line; an empty `standard:` is filled in place
 *   upgraded   the header named the bare unversioned URL, written before versions: only the URL
 *              is rewritten, in place, quotes and comment kept
 *   current    it already names this version; nothing changes
 *   no-header  no header (or an empty one): the text comes back unchanged. A stamp never creates
 *              a header, because one line is not a checkpoint's facts
 *   other      it names another kind's standard, another version, or a standard that is not one
 *              value: left for a person
 * Every byte the status does not name stays as it was, and a second stamp changes nothing.
 */
export function stampPlan(text) {
  const src = String(text ?? '');
  const { data, raw } = readHeader(src);
  if (raw === '') return { text: src, status: 'no-header' };
  if (data.standard !== undefined && typeof data.standard !== 'string') return { text: src, status: 'other' };
  const { state } = classifyStandard('checkpoint', data.standard, IMPLEMENTED_VERSIONS);
  if (state === 'current') return { text: src, status: 'current' };
  if (state !== 'missing' && state !== 'bare') return { text: src, status: 'other' };

  const lines = src.split('\n');
  let close = lines.length;
  for (let i = 1; i < lines.length; i++) if (FENCE.test(lines[i])) { close = i; break; }
  const eol = /\r$/.test(lines[0]) ? '\r' : '';
  const at = lines.findIndex((l, i) => i > 0 && i < close && /^standard:/.test(l));

  if (state === 'bare') {
    // Swap the URL only where it ends (a quote, a space, a comment or the line end), so a longer
    // URL that merely starts the same way is never rewritten.
    lines[at] = lines[at].replace(new RegExp(`${esc(STANDARD_LATEST)}(?=["' \\t#\\r]|$)`), STANDARD);
    return { text: lines.join('\n'), status: 'upgraded' };
  }
  if (at > 0) { lines[at] = `standard: ${STANDARD}${eol}`; return { text: lines.join('\n'), status: 'added' }; }
  const kind = lines.findIndex((l, i) => i > 0 && i < close && /^kind:/.test(l));
  lines.splice(kind > 0 ? kind + 1 : 1, 0, `standard: ${STANDARD}${eol}`);
  return { text: lines.join('\n'), status: 'added' };
}

/** An existing checkpoint with `standard:` added or upgraded to this version, every other byte untouched. */
export const stampStandard = (text) => stampPlan(text).text;
