# @supersuit/agentic-projects

Portable Markdown projects that another agent can resume: ownership, a concrete next action, a verified current picture, attributed evidence, and explicit permission to share. Extracted from Freedom's running project engine.

Node 20+, ESM, MIT, no runtime dependencies. The library never launches a shell. Products supply people resolution, repository identity, calendar parsing and a clock.

## Start a project

```sh
npm install @supersuit/agentic-projects
npx agentic-projects --help
npx agentic-projects scaffold --root demo/projects --slug guide --name Guide \
  --owner alex --goal 'Deliver a reviewed guide' --date 2026-10-04 \
  --summary 'Guide prepared for review' --read-when 'Resuming the guide' \
  --keep home --audience self --actor alex --next-action 'Alex reviews the guide'
npx agentic-projects list --root demo/projects --json
npx agentic-projects read --file demo/projects/2026-10-04-guide/STATE.md --json
npx agentic-projects query --root demo/projects --kind project --where status=active --json
npx agentic-projects verify --file demo/projects/2026-10-04-guide/STATE.md \
  --date 2026-10-04 --by alex --source PROJECT.md --origin human --write
npx agentic-projects close-check --root demo/projects --slug 2026-10-04-guide --json
npx agentic-projects nest-plan --root demo/projects --json
```

PROJECT.md holds purpose, ownership and deliverable; STATE.md holds phase, next action, progress and open questions. Folders are dated and existing projects are never overwritten. Parents must exist and remain open when children are created.

## Subprojects

A subproject lives inside its parent, in the parent's own `projects/` folder, which works exactly like a top-level root:

```
projects/
  2026-10-04-guide/
    PROJECT.md  STATE.md
    projects/
      2026-10-06-chapter-one/          # parent: 2026-10-04-guide
      done/2026-10-05-outline/         # a closed child
  done/
```

`scaffold --parent <slug>` creates the child there; slugs stay unique at every depth. Every reader finds projects at any depth, and only a project's `projects/` folder is descended into. The `parent:` header must agree with the folder the child sits in (lint error `projects:header:parent-location`); a child still beside its parent gets the warning `projects:header:parent-not-nested`. `nest-plan --root` (or `nestingPlan(root)`) lists where each such child belongs, parents first; it moves nothing, so the product moves the folders and rewrites links. A closed child moves into its parent's `done/`; closing the parent moves the whole folder, children included.

`lint --root demo/projects --json` checks headers, state integrity and context. It returns 1 for findings, including undeclared repository identity. A local project with no remote remains honestly unknown; supply `--source-of-truth` when creating it if that identity exists.

## The context contract

Context v1 requires `context_version: "1"`, stable `id`, short `summary`, `read_when`, verification date `as_of`, sharing rule `keep` and intended reader `audience`. A Next action also names `next_actor`; `dependency` may name what it awaits. The intended reader does not grant sharing permission.

- `keep`: keep with its owner.
- `home`: may leave for the owner's home context, never a share export.
- `share`: may be included in a share export.

`last_worked` records activity. `as_of` records explicit verification. Verification requires a date, author, source and origin; it preserves the work date and original body. Agent evidence is marked `origin: "agent"`, never converted into a human decision.

Evidence and relations are JSON strings in the flat YAML header. Evidence carries `type` (decision, reversal, constraint or claim), `date`, `by`, `origin` (human, agent or capture), `source`, and optionally `rev` or `snapshot`. The body holds the current picture and dated prose; the linked raw capture stays intact. Identity relationships carry `{ "type": "depends-on", "target": "other-record-id" }`. Backlinks are derived.

```js
import { readContext, validateContext, contextGraph, exportContext } from '@supersuit/agentic-projects';

const record = {path:'/workspace/projects/example/STATE.md', text:markdown};
const context = readContext(record.text);
const findings = validateContext(record.text, {
  file:record.path, asOf:'2026-10-04',
  revisionOf:source => repositoryAdapter.lastRevision(source),
});
const graph = contextGraph(records); // nodes, backlinks, duplicate/missing-target findings
const bundle = exportContext(records, {to:'share'}); // throws for unknown/private permission
```

Changes to pinned sources request rechecks; they do not automatically overturn claims. Missing pins, absent revision checkers and working tree evidence remain uncertain. Old records without context_version remain readable and produce a warning; no sharing permission, attribution or verification date is backfilled.

## Sharing checks

```sh
npx agentic-projects export --file path/to/permitted-record.md --to share --json
```

Include every referenced local record using repeated `--file`; each must independently permit the destination. Unknown permission, missing relationships, private evidence and local Markdown links outside that bundle refuse export. Reference definitions are checked in quotes and lists, including escaped and multiline labels; unused definitions and code examples are conservatively checked too. Markdown destinations containing literal parentheses, backslash escapes, HTML entities, control characters or non-ASCII whitespace refuse export; use plain or percent-encoded destinations. HTTP(S) references, including bare URLs and autolinks, require `--allow-external`. Protocol-relative URLs (`//host/path`) are unsupported; spell out HTTP(S). Raw HTML is unsupported and refuses export; use Markdown references. Export returns text and never sends it. These checks enforce declared policy and references; they do not authenticate readers or infer whether prose contains private information.

## Product adapters

`createProjectEngine(options)` supplies header parsing/roles, rendering/scaffold, lint/backfill, root enumeration, project/state query, open-project/cadence and resumability algorithms. `createFrontmatter({KINDS, validate, nestedKeysFor, personExists, beforeWrite})` shares the codec with a product's other document kinds. `parseFlat`/`stringifyFlat` expose the codec directly.

Quoted values keep commas inside an inline list item or an allowed nested flow-map value. Double-quoted values decode JSON-style escaped quotes and backslashes, including a backslash immediately before the closing quote; an invalid escape stays literal. Single-quoted values retain backslashes literally. Nesting still requires explicit `nestedKeysFor` permission for that kind.

Engine options include `frontmatter`, people resolution (`personExists`, `personPath`, `personHref`, `recordPath`, `recordName`, `workspaceLayout`), workspace paths, `deriveSourceOfTruth`, `continentOperators`, `localDay`, `lastRunAt` and `parseBooked`. Optional command formatters produce advice in the product's vocabulary. `scaffoldProject` accepts explicit `context` and `stateContext`; calls without them preserve legacy behavior.

`assertCanClose(parent, projects)` refuses unfinished descendants, including records in done folders. Pass the full set, including snoozed/done records, rather than a filtered open-project list. The product's write/move adapter calls it before closing. The library does not move or relink folders itself.

Freedom vendors this package with SHA-256 checks and thin adapters. Change generic behavior in the source package; regenerate its vendor payload. Git probes, people layout and session machinery stay in Freedom.

## Checks and release

From a source checkout:

```sh
npm test
npm run mutation-check
npm run install-proof
```

Exit codes: 0 success, 1 findings/refusal, 2 usage error. `--json` works on each command. Tests use synthetic records. Mutation checks deliberately break sharing, parent closure, date updates and extracted baseline invariants in disposable copies.

Releases are v-prefixed tag pushes through `.github/workflows/publish.yml` and npm OIDC. The first release bootstraps the package with web approval, then configures its trusted publisher. No registry token is stored in this repository.
