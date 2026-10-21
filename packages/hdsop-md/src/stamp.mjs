// Stamping: a record's header names the version of its standard, added or upgraded in place with
// every other byte unchanged (the move is @supersuit/hypercontext-core's stampStandard).
//
// A map with no header is never given one. A CATALOG.md with no header is given the minimal one
// (kind and standard, exactly what Supersuit's writer puts on a catalog it creates) only when the
// caller says the catalog writer beside it keeps a header (supersuit.mjs asks it). An older writer
// regenerates the file and refuses any file that regeneration would shorten, so a header there
// would stop every later write to the catalog (test/supersuit.test.mjs proves both against
// Supersuit's own library).
import { readHeader, classifyStandard, stampStandard } from '@supersuit/hypercontext-core';
import { STANDARDS, STANDARDS_LATEST, IMPLEMENTED_VERSIONS, assertKind } from './standard.mjs';

/** Why a headerless catalog is skipped, said wherever it is skipped. */
export const CATALOG_NO_HEADER = 'the installed Supersuit\'s catalog writer refuses to rewrite a catalog with a header, so one is not added; update Supersuit, then stamp again';

/** The header a headerless catalog is given: byte for byte what Supersuit's writer creates a catalog with. */
export const CATALOG_HEADER = `---\nkind: workflow-catalog\nstandard: ${STANDARDS['workflow-catalog']}\n---\n\n`;

/**
 * What stamping a record of `kind` would do, as `{text, status}`:
 *   added      the header named no standard; `standard:` is added (after `kind:`, else first)
 *   upgraded   it named the bare unversioned URL, written before versions; that line is rewritten
 *   current    it already names this version
 *   no-header  no header: the text comes back unchanged (a catalog is given one when
 *              `catalogHeader` says the Supersuit writer beside it keeps a header)
 *   other      it names another kind's standard or a version not implemented: left for a person
 */
export function stampPlan(text, kind, { catalogHeader = false } = {}) {
  assertKind(kind);
  const src = String(text ?? '');
  const { data, raw } = readHeader(src);
  if (raw === '' && kind === 'workflow-catalog' && catalogHeader)
    return { text: CATALOG_HEADER.replace(/\n\n$/, src.startsWith('\n') ? '\n' : '\n\n') + src, status: 'added' };
  if (raw === '') return { text: src, status: 'no-header' };
  const { state } = classifyStandard(kind, data.standard, [...IMPLEMENTED_VERSIONS]);
  if (state === 'current' || state === 'implemented') return { text: src, status: 'current' };
  // Another kind's standard or an unimplemented version: core's stamp never overwrites a named
  // standard that is not this kind's bare URL, and says so by changing nothing.
  const out = stampStandard(src, STANDARDS[kind], STANDARDS_LATEST[kind]);
  if (!out.changed) return { text: src, status: 'other' };
  return { text: out.text, status: state === 'bare' ? 'upgraded' : 'added' };
}
