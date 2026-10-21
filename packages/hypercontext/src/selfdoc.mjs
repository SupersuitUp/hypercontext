// The one rule this package owns: a record names the standard it follows.
//
// `standard:` is the field, holding the one page for the record's kind. It is what lets a reader
// with no other context (a stranger, a fresh agent, a different tool in five years) open the file
// and find the rules it was written to, so a record without it is not self-documenting however
// complete the rest of it is. The shared context keys (id, summary, read_when, as_of, keep) are
// counted beside it and never refused here: a kind's own package decides whether an empty
// summary is a defect, and most already say so (friend-md calls it "untended").
import { readHeader, stampStandard } from '@supersuit/hypercontext-core';

import { versionOf, CURRENT_VERSION } from './kinds.mjs';

export const CODE = 'self-doc:missing';
export const VERSION_CODE = 'self-doc:version';

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
 * @param {{alsoAccept?: string[], versions?: number[]}} [opts] other standards a record of this
 *   kind may rightly name, and the versions of its own standard the validator implements
 * @returns {{selfDocumenting: boolean, code: string|null, contextComplete: boolean, missingContext: string[], problem: string|null}}
 */
export function judge(text, kind, { alsoAccept = [], versions = [CURRENT_VERSION] } = {}) {
  const got = standardOf(text, kind.format);
  const missingContext = kind.context.filter((k) => !filled(got.data[k]));
  const contextComplete = got.header && missingContext.length === 0;
  let problem = null, code = CODE;
  const v = versionOf(kind.kind, got.standard);
  if (!got.header) problem = kind.format === 'json' ? 'not valid JSON, so it cannot name its standard' : 'has no header, so it cannot name its standard';
  else if (!got.standard) problem = `names no standard; it should carry standard: ${kind.standard}`;
  else if (alsoAccept.includes(got.standard)) problem = null;
  else if (v === 0) problem = `names ${got.standard}, which predates versions; it should name ${kind.standard} (stamp upgrades it)`;
  else if (v === null) problem = `names ${got.standard}; a ${kind.kind} record names ${kind.standard}`;
  else if (!versions.includes(v)) { problem = `names version ${v} of the ${kind.kind} standard, which the validator here does not implement (it implements ${versions.map((x) => `v${x}`).join(', ')})`; code = VERSION_CODE; }
  return { selfDocumenting: problem === null, code: problem === null ? null : code, contextComplete, missingContext, problem };
}

// A bare one-file piece lives among the documents and rightly names the piece standard.
export const acceptedFor = (kindName, data, standards) =>
  kindName === 'document' && data?.kind === 'piece' ? [standards.piece] : [];

// The byte-preserving stamp is the same for every kind and every package: it lives in core.
export { stampStandard };
