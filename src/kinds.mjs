// Every kind of record a hypercontext workspace holds: where its records live, the one page that
// is its standard, and the package that checks its shape.
//
// THIS FILE DEFINES NO RECORD TYPE. A kind's shape belongs to its own package (friend-md,
// group-md, superprojects ...), and this list only says where to look and whom to ask. The one
// rule this package owns is the property every record shares, hypercontext itself: a record
// names the standard it follows, so a stranger or a fresh agent can open it cold and find its
// rules (Gary, 2026-10-17: "AMNESIAC AIS need to be able to refer the standard a file/folder is
// supposed to uphold"; 2026-10-20: "every instance ... needs to be self documenting").
//
// A kind with `pkg: null` has no package yet. It is still checked for the shared property, and
// the report says in one line that nothing checks its shape, so the gap is visible from the
// same command that would close it.

export const STANDARD_BASE = 'https://hypercontext.wiki/standards/';
// A record names one VERSION of its standard (docs/STANDARDS.md): the page at /v<N> never changes
// meaning, so the link says which rules the record was written to. The bare /standards/<kind>
// is the latest page, for people; a record carrying it predates versions.
export const CURRENT_VERSION = 1;
const url = (slug, v = CURRENT_VERSION) => `${STANDARD_BASE}${slug}/v${v}`;
export const bareStandard = (kind) => `${STANDARD_BASE}${kind}`;
/** The version a URL names for a kind: a number, 0 for the bare URL, null for another kind's. */
export function versionOf(kind, standardUrl) {
  const s = String(standardUrl ?? '');
  if (s === bareStandard(kind)) return 0;
  const m = s.startsWith(`${bareStandard(kind)}/v`) ? s.slice(bareStandard(kind).length + 2).match(/^(\d+)$/) : null;
  return m ? Number(m[1]) : null;
}

/**
 * @typedef {object} Kind
 * @property {string} kind       the record kind, as the report names it
 * @property {string} label      what a person calls it
 * @property {string} standard   the versioned page its `standard:` field must name
 * @property {'md'|'json'} format where the field lives: a YAML header or a JSON key
 * @property {string[]} context  the shared context keys this kind's standard requires
 * @property {object|null} pkg   the package that checks its shape, or null when none exists
 * @property {string} [sharesLint] another kind whose package run already covers this one
 * @property {boolean} [stampable] false when no tool may add the field yet (see `why`)
 * @property {string} [why]      why a kind is not stampable, said in the report
 */

const CONTEXT = Object.freeze(['id', 'summary', 'read_when', 'as_of', 'keep']);
const SUPERPROJECTS = Object.freeze({ name: '@supersuit/superprojects', repo: 'superprojects', bin: 'bin/superprojects.mjs' });

/** @type {readonly Kind[]} */
export const KINDS = Object.freeze([
  { kind: 'self', label: 'the owner, self/self.md', standard: url('self'), format: 'md', context: CONTEXT,
    pkg: { name: '@supersuit/self-md', repo: 'self-md', bin: 'bin/self-md.mjs' } },
  { kind: 'friend', label: 'people, people/<slug>/friend.md', standard: url('friend'), format: 'md', context: CONTEXT,
    pkg: { name: '@supersuit/friend-md', repo: 'friend-md', bin: 'bin/friend-md.mjs' } },
  { kind: 'group', label: 'groups, people/groups/<id>/group.md', standard: url('group'), format: 'md', context: [],
    pkg: { name: '@supersuit/group-md', repo: 'group-md', bin: 'bin/group-md.mjs' } },
  { kind: 'superproject', label: 'superprojects, SUPERPROJECT.md', standard: url('superproject'), format: 'md', context: [],
    pkg: SUPERPROJECTS },
  { kind: 'state', label: 'superproject state, STATE.md', standard: url('state'), format: 'md', context: [],
    pkg: SUPERPROJECTS, sharesLint: 'superproject' },
  { kind: 'atomic-action-map', label: 'atomic action maps, ATOMIC-ACTION-MAP.md', standard: url('atomic-action-map'), format: 'md', context: [],
    pkg: SUPERPROJECTS, sharesLint: 'superproject' },
  { kind: 'superobjective', label: 'superobjectives, superobjective.md', standard: url('superobjective'), format: 'md', context: CONTEXT,
    pkg: { name: '@supersuit/superobjective', repo: 'superobjective', bin: 'bin/superobjective.mjs' } },
  { kind: 'piece', label: 'pieces, piece.md', standard: url('piece'), format: 'md', context: CONTEXT,
    pkg: { name: '@supersuit/piece-md', repo: 'piece-md', bin: 'bin/piece-md.mjs' } },
  { kind: 'conversation', label: 'conversations, transcript.md', standard: url('conversation'), format: 'md', context: [],
    pkg: { name: '@supersuit/transcript-md', repo: 'transcript-md', bin: 'lib/freedom-conversations-cli.mjs' } },
  { kind: 'document', label: 'documents, documents/*.md', standard: url('document'), format: 'md', context: [], pkg: null },
  { kind: 'checkpoint', label: 'checkpoints, checkpoints/*.md', standard: url('checkpoint'), format: 'md', context: [], pkg: null },
  { kind: 'hdsop', label: 'workflow maps, workflows/*.md', standard: url('hdsop'), format: 'md', context: [], pkg: null },
  { kind: 'workflow-catalog', label: 'the workflow catalog, workflows/CATALOG.md', standard: url('workflow-catalog'), format: 'md', context: [], pkg: null },
  { kind: 'recurrent', label: 'recurrents, recurrents/*.md', standard: url('recurrent'), format: 'md', context: [], pkg: null,
    stampable: false, why: 'a recurrent keeps its fields as bold labels in the body; a header added beside them would hold a second last run that drifts, so its own writer converts it' },
  { kind: 'tile-app', label: 'tile apps, <app>/app.json', standard: url('tile-app'), format: 'json', context: [], pkg: null,
    stampable: false, why: 'the Helm host reads app.json, and a key it does not know waits until the host accepts one' },
]);

export const byKind = (k) => KINDS.find((x) => x.kind === k);
