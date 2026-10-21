// The machine-readable twin of each standard version (hypercontext docs/STANDARDS.md section 2).
// The package owns them: buildManifest derives each from the code (STANDARDS, HEADER_KEYS, the
// code table), `npm run manifests` writes them to standards/<kind>/v1.json, the tarball ships them,
// and test/manifest.test.mjs proves the shipped files are exactly what the code builds. The wiki
// publishes the package's file unchanged.
import { readFileSync } from 'node:fs';
import { KINDS, STANDARDS, STANDARDS_LATEST, assertKind } from './standard.mjs';
import { HEADER_KEYS, DOC_STATUS, MAX_SCALAR } from './hdsop.mjs';
import { CODES } from './codes.mjs';

const PACKAGE = '@supersuit/hdsop-md';
/** The first version of this package that implements v1 of both standards. */
export const IMPLEMENTS_SINCE = '0.1.0';
const PINNED = `npx -y ${PACKAGE}@^${IMPLEMENTS_SINCE}`;

const DATE = '\\d{4}-\\d{2}-\\d{2}';

/** A HEADER_KEYS rule as the constraint a reader can check without this package. */
function constraintOf(key, rule) {
  if (key === 'standard') return { const: STANDARDS.hdsop };
  if (key === 'doc_status') return { enum: [...DOC_STATUS] };
  if (rule.type === 'list') return { type: 'array', items: { type: 'string' } };
  if (rule.type === 'date') return { type: 'string', pattern: rule.never ? `^(${DATE}|never)?$` : `^(${DATE})?$` };
  return { type: 'string', maxLength: MAX_SCALAR };
}

const ABOUT = {
  hdsop: {
    title: 'A workflow map (HDSOP)',
    path: 'workflows/<slug>.md',
    required: ['standard', 'title'],
    keys: () => Object.fromEntries(Object.entries(HEADER_KEYS).map(([k, rule]) => [k, constraintOf(k, rule)])),
  },
  'workflow-catalog': {
    title: 'The workflow catalog',
    path: 'workflows/CATALOG.md',
    required: ['standard'],
    keys: () => ({ standard: { const: STANDARDS['workflow-catalog'] } }),
  },
};

/** The manifest of v1 of one kind's standard, built from the code. */
export function buildManifest(kind) {
  assertKind(kind);
  const about = ABOUT[kind];
  return {
    manifest_version: 1,
    standard: STANDARDS[kind],
    kind,
    version: 1,
    title: about.title,
    status: 'current',
    superseded_by: null,
    latest: STANDARDS_LATEST[kind],
    record: { path: about.path, format: 'md' },
    header: { required: about.required, keys: about.keys() },
    validator: {
      package: PACKAGE,
      implements_since: IMPLEMENTS_SINCE,
      // One run of lint checks the maps and the catalog together; each finding carries its kind.
      check: `${PINNED} lint workflows --json`,
      backfill: `${PINNED} stamp workflows --apply`,
    },
    codes: Object.entries(CODES[kind]).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })),
    umbrella: 'npx -y @supersuit/hypercontext check <workspace>',
  };
}

/** Where the shipped manifest of a kind lives, as a URL to the file in the package. */
export const manifestUrl = (kind) => new URL(`../standards/${kind}/v1.json`, import.meta.url);

const deepFreeze = (v) => {
  if (v && typeof v === 'object') { for (const x of Object.values(v)) deepFreeze(x); Object.freeze(v); }
  return v;
};

/** The shipped manifests, keyed by kind, read from the package's standards/ folder. */
export const MANIFESTS = deepFreeze(Object.fromEntries(KINDS.map((k) => [k, JSON.parse(readFileSync(manifestUrl(k), 'utf8'))])));
