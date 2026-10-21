# @supersuit/superprojects

*Formerly `@supersuit/agentic-projects`, which gets no further releases. The doctrine is at [superprojects.wiki](https://superprojects.wiki).*

Portable Markdown superprojects that another agent can resume: ownership, a concrete next action, a verified current picture, attributed evidence, an atomic action map with an on-track answer, and explicit permission to share. Extracted from Freedom's running project engine.

Node 20+, ESM, MIT, no runtime dependencies. The library never launches a shell. Products supply people resolution, repository identity, calendar parsing and a clock.

## A superproject is a folder

```
superprojects/
  2026-10-04-guide/
    SUPERPROJECT.md         what it is, who owns it, what it delivers
    STATE.md                where it stands: phase, next action, open threads
    ATOMIC-ACTION-MAP.md    how it gets done (finite superprojects only)
    sessions.jsonl          which agent sessions worked on it, one line per checkpoint
  done/                     closed superprojects
```

**SUPERPROJECT.md** holds purpose, ownership and deliverable. **STATE.md** holds phase, next action, progress and open questions. A finite superproject also gets **ATOMIC-ACTION-MAP.md**, its atomic action map (below). Folders are dated and existing superprojects are never overwritten. Parents must exist and remain open when children are created.

**The names before 0.5.0 still read.** A folder is a superproject if it holds SUPERPROJECT.md or PROJECT.md; a map is ATOMIC-ACTION-MAP.md or PLAN.md; a root is `superprojects/` or `projects/`. Every reader takes both, and only the new names are ever written. A folder holding both record files is a lint error (`projects:record:both`), and so is one holding both map files (`projects:plan:both`); readers use the new file until a person merges them. `superprojects migrate` (below) converts a tree when you are ready.

## Start a superproject

```sh
npm install @supersuit/superprojects
npx superprojects --help
npx superprojects scaffold --root demo/superprojects --slug guide --name Guide \
  --owner alex --goal 'Deliver a reviewed guide' --date 2026-10-04 \
  --summary 'Guide prepared for review' --read-when 'Resuming the guide' \
  --keep home --audience self --actor alex --next-action 'Alex reviews the guide'
npx superprojects list --root demo/superprojects --json
npx superprojects read --file demo/superprojects/2026-10-04-guide/STATE.md --json
npx superprojects query --root demo/superprojects --kind project --where status=active --json
npx superprojects verify --file demo/superprojects/2026-10-04-guide/STATE.md \
  --date 2026-10-04 --by alex --source SUPERPROJECT.md --origin human --write
npx superprojects close-check --root demo/superprojects --slug 2026-10-04-guide --json
npx superprojects nest-plan --root demo/superprojects --json
```

`--root` is read exactly as given. A library caller that names no root gets `superprojects/` under the working directory, plus a sibling legacy `projects/` when there is one; a `projects/` that is only a link to `superprojects/` is read once.

## Subprojects

A subproject lives inside its parent, in the parent's own `superprojects/` folder, which works exactly like a top-level root:

```
superprojects/
  2026-10-04-guide/
    SUPERPROJECT.md  STATE.md  ATOMIC-ACTION-MAP.md
    superprojects/
      2026-10-06-chapter-one/          # parent: 2026-10-04-guide
      done/2026-10-05-outline/         # a closed child
  done/
```

`scaffold --parent <slug>` creates the child there, linking the record file its parent actually has; slugs stay unique at every depth. Every reader finds superprojects at any depth, and only a superproject's `superprojects/` (or legacy `projects/`) folder is descended into. The `parent:` header must agree with the folder the child sits in (lint error `projects:header:parent-location`); a child still beside its parent gets the warning `projects:header:parent-not-nested`. `nest-plan --root` (or `nestingPlan(root)`) lists where each such child belongs, parents first; it moves nothing, so the product moves the folders and rewrites links. A closed child moves into its parent's `done/`; closing the parent moves the whole folder, children included.

`lint --root demo/superprojects --json` checks headers, state integrity, context and atomic action maps. It returns 1 for findings, including undeclared repository identity. A local superproject with no remote remains honestly unknown; supply `--source-of-truth` when creating it if that identity exists. Check ids keep their `projects:` prefix, so filters written for earlier versions still hold.

## The atomic action map

SUPERPROJECT.md says what a superproject is and STATE.md says where it stands. ATOMIC-ACTION-MAP.md says how it gets done: every step between now and the deliverable, who does each one, how long it takes and what it waits on. An **atomic action** is one stretch of work with no handoff between actors inside it and at most four hours of human time (lint warns `plan:human:too-long` past that). Waits and milestones stay on the map as the joints between actions.

`scaffold` writes a skeleton for every finite superproject, with the next action as step `s01` and the deliverable as milestone `m1`; `--no-map` (or its earlier name `--no-plan`) opts out, and an ongoing superproject gets none because its cadence is its plan. Lint warns `projects:plan:missing` for a finite superproject without one, and reports every map finding as the superproject's own.

```markdown
---
plan_version: "1"
baseline: 2026-10-05
baseline_finish: 2026-10-30
capacity: "alex 5h/week"
---
# Atomic action map

## Steps

### s01 Agent drafts the letter
- actor: agent
- effort: 20m (measured, run 3)
- status: done 2026-10-05

### s02 Alex signs the letters
- actor: alex
- kind: work
- effort: 3h (estimate, Alex, 2026-10-05)
- after: s01
- skill: by hand
- done-when: every letter in the set is signed
- status: todo

### s03 Letters in transit
- actor: outside: USPS
- kind: wait
- lead: 5d (estimate, founder, 2026-03-02)
- after: s02

### s04 Decide on wave two
- actor: alex
- kind: gate
- after: s03
- target: 2026-10-20 (provisional)

### m1 Wave two decided
- kind: milestone
- after: s04
- target: 2026-10-30 (provisional)

## Scenarios
- working: steady. Replies trickle in. s04 -> 2026-10-20
- fast: replies come early. s04 -> 2026-10-14

## Revisions
- 2026-10-05 baseline: drafted with the project.
```

Each step is a `### <id> <title>` heading under `## Steps` (the id is a lowercase letter followed by letters or digits) with one `- key: value` line per field:

- `actor`: `agent`, one or more person slugs (`alex, sam`), or `outside: <name>` for anyone off the team.
- `kind`: `work` (the default), `wait`, `gate` or `milestone`.
- `effort`: how long the doing takes the actor (`45m`, `3h`, `2d`, `1w`), then where the number came from: `(estimate, <who>, <date>)` or `(measured, <run>)`. Lint warns `plan:duration:thin-source` on an estimate missing whose or when, or a measurement that names no run.
- `lead`: how long until the step is done, waits included, in the same form.
- `after`: the step ids it waits on, comma separated.
- `target`: a not-before date, `2026-10-20 (provisional)`.
- `window`: when an outside party is expected to act, `2026-10-08..2026-10-12`.
- `fallback`: what happens if that answer is no or late.
- `skill`: the skill that runs the step, or `by hand`.
- `done-when`: how to tell it is finished.
- `status`: `todo`, `doing`, `done <date>`, `skipped` or `blocked: <why>`.
- `booked`: when its calendar block is, written back by the product after a yes.

The four step kinds:

- **work**: someone does something, and it takes effort.
- **wait**: time has to pass; it finishes after its lead, or at the end of its window.
- **gate**: a decision only a named human can make. A gate given to the agent is a lint error.
- **milestone**: a named point with no duration of its own. The deliverable is the last one.

In the header, `capacity` declares each person's weekly hours, and human effort is placed only inside them (weeks start on Monday). `buffer_days` overrides the default buffer, 10% of the days remaining and never less than three. `baseline` and `baseline_finish` keep the first version so that slip has an answer. The deadline is not repeated here; it comes from SUPERPROJECT.md.

`## Scenarios` lays out the ways the big dates could go. Each line names its scenario and only the targets it moves (`s04 -> 2026-10-14`); exactly one starts with `working:`, and the status uses it. `## Revisions` holds one dated line per change: what arrived and what it moved.

`planStatus` computes the verdict from the critical path. It answers to SUPERPROJECT.md's deadline when there is one, otherwise to the final milestone's provisional date, and every answer names its driver, the step that sets the finish:

- **on track**: the earliest finish beats that date with the buffer intact.
- **at risk**: still before the date, with less slack than the buffer, or a step that cannot start until after its window has closed. That step becomes the driver, the line ends `; s08 cannot start until after its window closes on <date>, so its fallback applies`, and `missedWindows` lists every such step.
- **behind**: past the date, or a step on the critical path is open past its own target.
- **no deadline**: there is no date to answer to, and it says so.

Before saying a map holds up, it runs the defensible test, and each failed condition names its steps:

1. every step names an actor;
2. every duration says where it came from;
3. every outside step has a window and a fallback (waits are exempt);
4. every gate has a named human;
5. every gate and milestone has a provisional date;
6. nothing assumes more hours than were declared;
7. the finish keeps its buffer before the date it answers to.

```sh
npx superprojects map lint --project demo/superprojects/2026-10-04-guide --json
npx superprojects map status --project demo/superprojects/2026-10-04-guide --date 2026-10-06
npx superprojects map schedule --project demo/superprojects/2026-10-04-guide --scenario fast
npx superprojects map blocks --project demo/superprojects/2026-10-04-guide --actor alex --free free.json
```

`map lint` exits 1 on any finding. `map status` prints one line, such as `on track: earliest finish 2026-10-20 against a provisional 2026-10-30, 10 days of slack, 3 needed; driver s04`; it takes `--deadline`, `--scenario` and `--all-scenarios`, returns the whole answer with `--json`, and exits 1 when behind. `map schedule` prints each step's projected start and finish and the critical path. `map blocks` reads `--free` as a JSON array of `{"start","end"}` ISO times and fits the actor's next open steps into them. `--date` defaults to today. Each reads ATOMIC-ACTION-MAP.md, or PLAN.md in a folder not yet migrated. `plan` is the same command under its earlier name and answers identically.

**The library proposes blocks and never books them.** Nothing here reads a calendar: the product supplies free time, asks the person, books after a yes, and writes `booked:` back onto the step.

The same functions are exported for products: `parsePlan`, `lintPlan`, `schedulePlan`, `planStatus`, `proposeBlocks`, `renderActionMapMd` (also exported under its earlier name `renderPlanMd`), `findCycle`, `isOutside`, the value parsers (`parseDuration`, `parseTarget`, `parseWindow`, `parseActors`, `parseStatus`, `parseCapacity`), `STEP_KINDS` and `MAX_HUMAN_EFFORT_MINUTES`. The function names keep "plan" because they are the API.

## Session provenance

Every state change should trace back to the conversation that made it. A product records one line per checkpoint into the superproject's own `sessions.jsonl`: the session id the harness gave the conversation, when, and optionally what landed.

```sh
npx superprojects session  --project superprojects/2026-10-04-guide --id 7f3c... --landed "first draft"
npx superprojects sessions --project superprojects/2026-10-04-guide        # who worked on it, latest first
npx superprojects touched  --workspace . --id 7f3c...                     # every superproject one session moved
```

```jsonl
{"id":"7f3c...","at":"2026-10-12T15:04:00.000Z","landed":"first draft"}
```

It is a separate append-only file so two sessions saving the same superproject never edit the same text, and STATE.md, which a person reads, carries no ids. The trail travels with the folder when the superproject is shared or moved. It records which session and when; the reasoning stays in the conversation, and the id is how you get back to it (for Claude Code, `claude --resume <id>`).

A repeat checkpoint by the same session with nothing new writes nothing. `recordSession` refuses a folder with no record file and anything that could not be a session id; a damaged line is skipped and reported by `readSessions`, never fatal. Library calls: `recordSession`, `readSessions`, `sessionsOf`, `touchedBy`, `touchedSuperprojects`, `sessionsFileOf`, `SESSIONS_FILE`.

## Self-documenting

**Every record file names the version of the standard it follows**, so an agent that has never seen Supersuit can open the file and find its rules. The header's `standard:` key holds one URL per file:

| File | `standard:` | Manifest in the package |
|---|---|---|
| SUPERPROJECT.md (or legacy PROJECT.md) | `https://hypercontext.wiki/standards/superproject/v1` | `standards/superproject/v1.json` |
| STATE.md | `https://hypercontext.wiki/standards/state/v1` | `standards/state/v1.json` |
| ATOMIC-ACTION-MAP.md (or legacy PLAN.md) | `https://hypercontext.wiki/standards/atomic-action-map/v1` | `standards/atomic-action-map/v1.json` |

A version's meaning never changes once published; the unversioned `https://hypercontext.wiki/standards/<kind>` is the page that always shows the latest. `scaffold` writes the v1 URL as the first header key, and every write through the package's frontmatter writer puts it first. `lint` reports, at level error, one finding per file:

- `self-doc:missing` for a file with no `standard:`, the bare unversioned URL of its kind (written before versions; the stamp below upgrades it), or another kind's standard;
- `self-doc:version` for a version of its own standard this package does not implement (anything but v1). The fix is a newer package; the stamp never writes a newer record back to v1.

The exported `STANDARDS` object holds the three v1 URLs, `LATEST_STANDARDS` the bare ones, and `judgeStandard(kind, value)` is the rule lint applies.

### Manifests

Each version ships beside the code as `standards/<kind>/v1.json` (exported as `MANIFESTS`, keyed like `STANDARDS`; also importable as `@supersuit/superprojects/standards/<kind>/v1.json`). A manifest says, as data, what a reader needs to validate a record without installing anything: the record path, the required header keys and the constraints on each (taken from the frontmatter schemas, and for the map from the keys the map parser reads), the validator and the exact commands, and every code lint can report about that file with its level, meaning and fix. The check for all three is `npx -y @supersuit/superprojects@^0.7.0 lint --root superprojects --json`: it runs the map lint inside every superproject and checks each map's standard line, which `map lint` alone does not.

The codes come from one table, `src/codes.mjs` (export `CODES`). Every lint emitter goes through `levelOf(code, level)`, which throws for a code not in the table or a level the code does not allow, and `npm run manifests` rebuilds the three files from the table and the schemas. A test fails if the shipped files differ from what the code builds, so the manifests and the lint cannot drift.

To stamp a tree that predates this, or upgrade one stamped with the unversioned URLs:

```sh
npx superprojects migrate --root superprojects --stamp-standard            # dry run: lists every file it would stamp
npx superprojects migrate --root superprojects --stamp-standard --apply    # does it
```

It reaches every superproject the package walks, nested children and `done/` included, and renames nothing. It is byte-preserving: it inserts one `standard:` line after the opening `---`, or replaces a bare or wrong value where it stands and inside its own quotes, so upgrading `https://hypercontext.wiki/standards/state` changes only the URL's bytes; it keeps the file's own line endings, CRLF included, and changes no other byte. Running it again finds nothing. A file with no header block, or one naming a newer version of its standard, is skipped and listed; lint still names it. `--json` prints `{root, stamps:[{file,from,to}], skipped:[{file,why}], applied}`. As library calls: `stampStandard(text, url)` (pure), `readStandard(text)`, and `engine.stampRoot(root, { write })`.

## Moving a tree to the new names

```sh
npx superprojects migrate --root demo/projects            # dry run: prints every change
npx superprojects migrate --root demo/projects --apply    # does it
```

A dry run is the default and changes nothing. With `--apply`, inside every superproject under the root (closed ones in `done/` and nested children included) PROJECT.md becomes SUPERPROJECT.md and PLAN.md becomes ATOMIC-ACTION-MAP.md. Every nested `projects/` folder becomes `superprojects/`, and when the root itself is called `projects/` its superprojects move to a sibling `superprojects/`. A `projects/` folder left empty is replaced by a relative link `projects -> superprojects`, so paths saved anywhere else keep resolving; one that still holds files that are not superprojects is kept and listed. Relative Markdown links in `.md` files under the root that would otherwise break are rewritten to the new names, anchors kept; links in code, URLs and links that still resolve are left alone, and files outside the root are not touched.

It refuses, exits 2 and changes nothing when a superproject's destination already exists or a folder already holds both record or both map files. It uses plain file renames and never commits, so review the diff and commit it yourself. Running it again on a converted tree finds nothing to do. `planMigration(root)` and `applyMigration(plan)` are the same thing as library calls.

## The context contract

Context v1 requires `context_version: "1"`, stable `id`, short `summary`, `read_when`, verification date `as_of`, sharing rule `keep` and intended reader `audience`. A Next action also names `next_actor`; `dependency` may name what it awaits. The intended reader does not grant sharing permission.

- `keep`: keep with its owner.
- `home`: may leave for the owner's home context, never a share export.
- `share`: may be included in a share export.

`last_worked` records activity. `as_of` records explicit verification. Verification requires a date, author, source and origin; it preserves the work date and original body. Agent evidence is marked `origin: "agent"`, never converted into a human decision.

Evidence and relations are JSON strings in the flat YAML header. Evidence carries `type` (decision, reversal, constraint or claim), `date`, `by`, `origin` (human, agent or capture), `source`, and optionally `rev` or `snapshot`. The body holds the current picture and dated prose; the linked raw capture stays intact. Identity relationships carry `{ "type": "depends-on", "target": "other-record-id" }`. Backlinks are derived.

```js
import { readContext, validateContext, contextGraph, exportContext } from '@supersuit/superprojects';

const record = {path:'/workspace/superprojects/example/STATE.md', text:markdown};
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
npx superprojects export --file path/to/permitted-record.md --to share --json
```

Include every referenced local record using repeated `--file`; each must independently permit the destination. Unknown permission, missing relationships, private evidence and local Markdown links outside that bundle refuse export. Reference definitions are checked in quotes and lists, including escaped and multiline labels; unused definitions and code examples are conservatively checked too. Markdown destinations containing literal parentheses, backslash escapes, HTML entities, control characters or non-ASCII whitespace refuse export; use plain or percent-encoded destinations. HTTP(S) references, including bare URLs and autolinks, require `--allow-external`. Protocol-relative URLs (`//host/path`) are unsupported; spell out HTTP(S). Raw HTML is unsupported and refuses export; use Markdown references. Export returns text and never sends it. These checks enforce declared policy and references; they do not authenticate readers or infer whether prose contains private information.

## Product adapters

`createProjectEngine(options)` supplies header parsing/roles, rendering/scaffold, lint/backfill, root enumeration, superproject/state query, open-superproject/cadence and resumability algorithms. Code identifiers keep their earlier names (`createProjectEngine`, `openProjects`, the `project` and `state` kinds, `--kind project|state`); the words a person reads are the new ones. `createFrontmatter({KINDS, validate, nestedKeysFor, personExists, beforeWrite})` shares the codec with a product's other document kinds. `parseFlat`/`stringifyFlat` expose the codec directly.

Quoted values keep commas inside an inline list item or an allowed nested flow-map value. Double-quoted values decode JSON-style escaped quotes and backslashes, including a backslash immediately before the closing quote; an invalid escape stays literal. Single-quoted values retain backslashes literally. Nesting still requires explicit `nestedKeysFor` permission for that kind.

Engine options include `frontmatter`, people resolution (`personExists`, `personPath`, `personHref`, `recordPath`, `recordName`, `workspaceLayout`), workspace paths, `deriveSourceOfTruth`, `continentOperators`, `localDay`, `lastRunAt`, `parseBooked` and `names`. Optional command formatters produce advice in the product's vocabulary (`stampCommand(dir)` names the command in a `self-doc:missing` fix). `scaffoldProject` accepts explicit `context` and `stateContext`; calls without them preserve legacy behavior.

Every file and folder name comes from one exported object, `NAMES`: `record` SUPERPROJECT.md, `legacyRecord` PROJECT.md, `state` STATE.md, `map` ATOMIC-ACTION-MAP.md, `legacyMap` PLAN.md, `root` superprojects, `legacyRoot` projects, `done` done. The engine option `names` overrides any of them, and the engine exposes the result as `engine.NAMES`, with `NESTED_ROOT` and `LEGACY_NESTED_ROOT`. `recordFileOf(dir)` and `mapFileOf(dir)` return the new file when it exists, else the legacy one, else null; `rootsOf(base)` returns the roots under a folder, new first, read once when one links the other. `allowedRootFiles` defaults to all five file names. The frontmatter kinds match records by path, under either folder name at any depth; a product with other names supplies its own `KINDS`.

`openProjects({ includeSnoozed: true })` returns snoozed projects as full rows marked `snoozedUntil`, for a survey that must see every open project; by default they stay in the list's `.snoozed` only. Each row carries `dir`.

`assertCanClose(parent, projects)` refuses unfinished descendants, including records in done folders. Pass the full set, including snoozed/done records, rather than a filtered open-project list. The product's write/move adapter calls it before closing. The library does not move or relink folders itself.

Freedom vendors this package with SHA-256 checks and thin adapters. Change generic behavior in the source package; regenerate its vendor payload. Git probes, people layout and session machinery stay in Freedom.

## Checks and release

From a source checkout:

```sh
npm test
npm run mutation-check
npm run install-proof
```

Exit codes: 0 success, 1 findings/refusal, 2 usage error or a refused migrate. `--json` works on each command. Tests use synthetic records. Mutation checks deliberately break sharing, parent closure, date updates, extracted baseline invariants, the atomic action map's gate refusal, behind verdict, not-before targets and weekly hours, the read-through of the old names, and migrate's refusals, dry run and link rewriting, in disposable copies.

Releases are v-prefixed tag pushes through `.github/workflows/publish.yml` and npm OIDC. The first release bootstraps the package with web approval, then configures its trusted publisher. No registry token is stored in this repository.
