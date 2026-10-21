// The two standards this package owns, and the one property every hypercontext record shares: it
// names the version of its standard (hypercontext docs/STANDARDS.md). The URL shapes and how a URL
// reads back as a version are @supersuit/hypercontext-core's; what to report is this package's.
import { bareStandard, standardUrl, classifyStandard } from '@supersuit/hypercontext-core';

/** The record kinds this package owns, in the order its manifests are listed. */
export const KINDS = Object.freeze(['hdsop', 'workflow-catalog']);
/** The versions of each standard this package implements. */
export const IMPLEMENTED_VERSIONS = Object.freeze([1]);
/** The version each kind's record names, and every writer stamps. */
export const STANDARDS = Object.freeze(Object.fromEntries(KINDS.map((k) => [k, standardUrl(k, 1)])));
/** The unversioned page of each kind: always its newest version. A record never names it. */
export const STANDARDS_LATEST = Object.freeze(Object.fromEntries(KINDS.map((k) => [k, bareStandard(k)])));

export function assertKind(kind) {
  if (!KINDS.includes(kind)) throw new Error(`no such kind ${JSON.stringify(kind)}; one of ${KINDS.join(', ')}`);
}

/**
 * What a header's `standard:` says, as at most one finding: self-doc:missing for none, the bare
 * URL (written before versions), or another kind's; self-doc:version for a version not implemented.
 * @returns {{code: string, message: string}|null}
 */
export function selfDoc(kind, standard) {
  const { state } = classifyStandard(kind, standard, [...IMPLEMENTED_VERSIONS]);
  const want = STANDARDS[kind];
  if (state === 'missing') return { code: 'self-doc:missing', message: `standard is missing: ${want}` };
  if (state === 'bare') return { code: 'self-doc:missing', message: `standard is the bare ${STANDARDS_LATEST[kind]}, which predates versions; hdsop-md stamp --apply upgrades it to ${want}` };
  if (state === 'other') return { code: 'self-doc:missing', message: `standard "${standard}" is not the ${kind} standard: ${want}` };
  if (state === 'unimplemented') return { code: 'self-doc:version', message: `standard "${standard}" is a version this validator does not implement (it implements ${want})` };
  return null;
}
