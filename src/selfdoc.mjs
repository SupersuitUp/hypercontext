// The one rule this package owns: a record names the standard it follows.
//
// `standard:` is the field, holding the one page for the record's kind. It is what lets a reader
// with no other context (a stranger, a fresh agent, a different tool in five years) open the file
// and find the rules it was written to, so a record without it is not self-documenting however
// complete the rest of it is. The shared context keys (id, summary, read_when, as_of, keep) are
// counted beside it and never refused here: a kind's own package decides whether an empty
// summary is a defect, and most already say so (friend-md calls it "untended").
import { readHeader, writeHeader } from './header.mjs';

export const CODE = 'self-doc:missing';

/** Read the `standard` a record carries, from its YAML header or its JSON. */
export function standardOf(text, format = 'md') {
  if (format === 'json') {
    try { const j = JSON.parse(text); return { header: true, data: j ?? {}, standard: typeof j?.standard === 'string' ? j.standard : '' }; }
    catch { return { header: false, data: {}, standard: '' }; }
  }
  const h = readHeader(text);
  return { header: h.raw !== '', data: h.data, standard: typeof h.data.standard === 'string' ? h.data.standard : '' };
}

const filled = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null);

/**
 * Judge one record against the shared property.
 * @param {string} text the file
 * @param {import('./kinds.mjs').Kind} kind
 * @param {{alsoAccept?: string[]}} [opts] other standards a record of this kind may rightly name
 * @returns {{selfDocumenting: boolean, contextComplete: boolean, missingContext: string[], problem: string|null}}
 */
export function judge(text, kind, { alsoAccept = [] } = {}) {
  const got = standardOf(text, kind.format);
  const missingContext = kind.context.filter((k) => !filled(got.data[k]));
  const contextComplete = got.header && missingContext.length === 0;
  let problem = null;
  if (!got.header) problem = kind.format === 'json' ? 'not valid JSON, so it cannot name its standard' : 'has no header, so it cannot name its standard';
  else if (!got.standard) problem = `names no standard; it should carry standard: ${kind.standard}`;
  else if (got.standard !== kind.standard && !alsoAccept.includes(got.standard)) problem = `names ${got.standard}; a ${kind.kind} record names ${kind.standard}`;
  return { selfDocumenting: problem === null, contextComplete, missingContext, problem };
}

// A bare one-file piece lives among the documents and rightly names the piece standard.
export const acceptedFor = (kindName, data, standards) =>
  kindName === 'document' && data?.kind === 'piece' ? [standards.piece] : [];

/**
 * Add `standard:` to a record that has a header and names none, changing nothing else.
 * It goes directly after `kind:` when the header has one, otherwise first. A record that already
 * names a standard, right or wrong, comes back unchanged: correcting a wrong one is a judgment,
 * and the report names it for a person or the kind's own package.
 * @returns {{text: string, changed: boolean, reason?: string}}
 */
export function stampStandard(text, url) {
  const src = String(text ?? '');
  const h = readHeader(src);
  if (h.raw === '' && !/^---[ \t]*\r?\n/.test(src)) return { text: src, changed: false, reason: 'no header' };
  if (typeof h.data.standard === 'string' && h.data.standard !== '') return { text: src, changed: false, reason: 'already names a standard' };
  const lines = src.split('\n');
  const eol = /\r$/.test(lines[0]) ? '\r' : '';
  let close = -1;
  for (let i = 1; i < lines.length; i++) if (/^---[ \t]*\r?$/.test(lines[i])) { close = i; break; }
  if (close < 0) return { text: src, changed: false, reason: 'no header' };
  // An empty `standard:` key is filled in place rather than duplicated.
  if ('standard' in h.data) return { text: writeHeader(src, { standard: url }), changed: true };
  let at = 1;
  for (let i = 1; i < close; i++) if (/^kind:/.test(lines[i])) { at = i + 1; break; }
  lines.splice(at, 0, `standard: ${JSON.stringify(url)}${eol}`);
  return { text: lines.join('\n'), changed: true };
}
