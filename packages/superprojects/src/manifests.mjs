// The machine-readable twin of each standard version (hypercontext STANDARDS.md section 2):
// everything a reader needs to validate a record without installing anything. The package owns
// them: `buildManifest` derives each from the code (STANDARDS, the frontmatter schemas, the
// map header keys and the lint code table), `npm run manifests` writes them to
// standards/<kind>/v1.json, the tarball ships them, and a test proves the shipped files are
// exactly what the code builds. The wiki publishes the package's file unchanged.
import { readFileSync } from "node:fs";
import { STANDARDS, LATEST_STANDARDS, STANDARD_SLUGS } from "./standard.mjs";
import { CODES, worstLevel } from "./codes.mjs";
import { KINDS } from "./frontmatter/kinds.mjs";
import { MAP_HEADER_KEYS } from "./plan.mjs";

const PACKAGE = "@supersuit/superprojects";
/** The first version of this package that implements v1 of the three standards. */
export const IMPLEMENTS_SINCE = "0.7.0";
const PINNED = `npx -y ${PACKAGE}@^${IMPLEMENTS_SINCE}`;

const ABOUT = {
  superproject: { title: "A superproject", path: "superprojects/<slug>/SUPERPROJECT.md", schema: KINDS.project.keys },
  state: { title: "Where a superproject stands", path: "superprojects/<slug>/STATE.md", schema: KINDS.state.keys },
  atomicActionMap: { title: "How a superproject gets done", path: "superprojects/<slug>/ATOMIC-ACTION-MAP.md", schema: null },
};

const DATE = "\\d{4}-\\d{2}-\\d{2}";
const SLUG = "[a-z0-9][a-z0-9-]*";

/** A schema rule as the constraint a reader can check without the package. */
function constraintOf(rule) {
  switch (rule.type) {
    case "word":
      return rule.values.length === 1 ? { const: rule.values[0] } : { enum: [...rule.values] };
    case "date":
      return { type: "string", pattern: rule.never ? `^(${DATE}|never)?$` : `^(${DATE})?$` };
    case "slug":
    case "folder":
      return { type: "string", pattern: `^(${SLUG})?$` };
    case "slugs":
    case "list":
      return { type: "array" };
    case "map":
      return { type: "object" };
    default:
      return { type: "string" };
  }
}

function headerKeys(kind) {
  const schema = ABOUT[kind].schema;
  if (schema) return Object.fromEntries(Object.entries(schema).map(([k, rule]) => [k, constraintOf(rule)]));
  // The atomic action map has no write schema; its header is the keys plan.mjs reads, all flat
  // strings, and only the standard is constrained.
  return Object.fromEntries(MAP_HEADER_KEYS.map((k) => [k, k === "standard" ? { const: STANDARDS[kind] } : { type: "string" }]));
}

/** The manifest of v1 of one standard (`superproject`, `state` or `atomicActionMap`), built from the code. */
export function buildManifest(kind) {
  if (!ABOUT[kind]) throw new Error(`buildManifest: no standard kind ${JSON.stringify(kind)}`);
  const codes = Object.entries(CODES)
    .filter(([, e]) => e.about.includes(kind))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, e]) => ({ code, level: worstLevel(code), means: e.means, fix: e.fix }));
  return {
    manifest_version: 1,
    standard: STANDARDS[kind],
    kind: STANDARD_SLUGS[kind],
    version: 1,
    title: ABOUT[kind].title,
    status: "current",
    superseded_by: null,
    latest: LATEST_STANDARDS[kind],
    record: { path: ABOUT[kind].path, format: "md" },
    header: { required: ["standard"], keys: headerKeys(kind) },
    validator: {
      package: PACKAGE,
      implements_since: IMPLEMENTS_SINCE,
      // `lint --root` reports every code about all three files, maps included (it runs the map
      // lint inside each superproject and checks the map's standard); `map lint` alone does not
      // check the standard line, so it is not the check for the map either.
      check: `${PINNED} lint --root superprojects --json`,
      backfill: `${PINNED} migrate --root superprojects --stamp-standard --apply`,
    },
    codes,
    umbrella: "npx -y @supersuit/hypercontext check <workspace>",
  };
}

/** Where the shipped manifest of a standard lives, as a URL to the file in the package. */
export const manifestUrl = (kind) => new URL(`../standards/${STANDARD_SLUGS[kind]}/v1.json`, import.meta.url);

const deepFreeze = (v) => {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
};

/** The shipped manifests, keyed like STANDARDS, read from the package's standards/ folder. */
export const MANIFESTS = deepFreeze(
  Object.fromEntries(Object.keys(STANDARDS).map((kind) => [kind, JSON.parse(readFileSync(manifestUrl(kind), "utf8"))])),
);
