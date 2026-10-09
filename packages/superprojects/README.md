# @supersuit/superprojects

*Formerly `@supersuit/agentic-projects`, which gets no further releases. The doctrine is at [superprojects.wiki](https://superprojects.wiki).*

Portable Markdown projects that another agent can resume: ownership, a concrete next action, a verified current picture, attributed evidence, and explicit permission to share. Extracted from Freedom's running project engine.

Node 20+, ESM, MIT, no runtime dependencies. The library never launches a shell. Products supply people resolution, repository identity, calendar parsing and a clock.

## Start a project

```sh
npm install @supersuit/superprojects
npx superprojects --help
npx superprojects scaffold --root demo/projects --slug guide --name Guide \
  --owner alex --goal 'Deliver a reviewed guide' --date 2026-10-04 \
  --summary 'Guide prepared for review' --read-when 'Resuming the guide' \
  --keep home --audience self --actor alex --next-action 'Alex reviews the guide'
npx superprojects list --root demo/projects --json
npx superprojects read --file demo/projects/2026-10-04-guide/STATE.md --json
npx superprojects query --root demo/projects --kind project --where status=active --json
npx superprojects verify --file demo/projects/2026-10-04-guide/STATE.md \
  --date 2026-10-04 --by alex --source PROJECT.md --origin human --write
npx superprojects close-check --root demo/projects --slug 2026-10-04-guide --json
npx superprojects nest-plan --root demo/projects --json
```

PROJECT.md holds purpose, ownership and deliverable; STATE.md holds phase, next action, progress and open questions; a finite project also gets PLAN.md, the plan map (below). Folders are dated and existing projects are never overwritten. Parents must exist and remain open when children are created.

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

`lint --root demo/projects --json` checks headers, state integrity, context and plans. It returns 1 for findings, including undeclared repository identity. A local project with no remote remains honestly unknown; supply `--source-of-truth` when creating it if that identity exists.

## The plan map

PROJECT.md says what a project is and STATE.md says where it stands. PLAN.md says how it gets done: every step between now and the deliverable, who does each one, how long it takes and what it waits on. `scaffold` writes a skeleton for every finite project, with the next action as step `s01` and the deliverable as milestone `m1`; `--no-plan` opts out, and an ongoing project gets none because its cadence is its plan. Lint warns `projects:plan:missing` for a finite project without one, and reports every plan finding as the project's own.

```markdown
---
plan_version: "1"
baseline: 2026-10-05
baseline_finish: 2026-10-30
capacity: "alex 5h/week"
---
# Plan

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

In the header, `capacity` declares each person's weekly hours, and human effort is placed only inside them (weeks start on Monday). `buffer_days` overrides the default buffer, 10% of the days remaining and never less than three. `baseline` and `baseline_finish` keep the first version so that slip has an answer. The deadline is not repeated here; it comes from PROJECT.md.

`## Scenarios` lays out the ways the big dates could go. Each line names its scenario and only the targets it moves (`s04 -> 2026-10-14`); exactly one starts with `working:`, and the status uses it. `## Revisions` holds one dated line per change: what arrived and what it moved.

`planStatus` computes the verdict from the critical path. It answers to PROJECT.md's deadline when there is one, otherwise to the final milestone's provisional date, and every answer names its driver, the step that sets the finish:

- **on track**: the earliest finish beats that date with the buffer intact.
- **at risk**: still before the date, with less slack than the buffer, or a step that cannot start until after its window has closed. That step becomes the driver, the line ends `; s08 cannot start until after its window closes on <date>, so its fallback applies`, and `missedWindows` lists every such step.
- **behind**: past the date, or a step on the critical path is open past its own target.
- **no deadline**: there is no date to answer to, and it says so.

Before saying a plan holds up, it runs the defensible test, and each failed condition names its steps:

1. every step names an actor;
2. every duration says where it came from;
3. every outside step has a window and a fallback (waits are exempt);
4. every gate has a named human;
5. every gate and milestone has a provisional date;
6. nothing assumes more hours than were declared;
7. the finish keeps its buffer before the date it answers to.

```sh
npx superprojects plan lint --project demo/projects/2026-10-04-guide --json
npx superprojects plan status --project demo/projects/2026-10-04-guide --date 2026-10-06
npx superprojects plan schedule --project demo/projects/2026-10-04-guide --scenario fast
npx superprojects plan blocks --project demo/projects/2026-10-04-guide --actor alex --free free.json
```

`plan lint` exits 1 on any finding. `plan status` prints one line, such as `on track: earliest finish 2026-10-20 against a provisional 2026-10-30, 10 days of slack, 3 needed; driver s04`; it takes `--deadline`, `--scenario` and `--all-scenarios`, returns the whole answer with `--json`, and exits 1 when behind. `plan schedule` prints each step's projected start and finish and the critical path. `plan blocks` reads `--free` as a JSON array of `{"start","end"}` ISO times and fits the actor's next open steps into them. `--date` defaults to today.

**The library proposes blocks and never books them.** Nothing here reads a calendar: the product supplies free time, asks the person, books after a yes, and writes `booked:` back onto the step.

The same functions are exported for products: `parsePlan`, `lintPlan`, `schedulePlan`, `planStatus`, `proposeBlocks`, `renderPlanMd`, `findCycle`, `isOutside`, the value parsers (`parseDuration`, `parseTarget`, `parseWindow`, `parseActors`, `parseStatus`, `parseCapacity`), `STEP_KINDS` and `MAX_HUMAN_EFFORT_MINUTES`.

## The context contract

Context v1 requires `context_version: "1"`, stable `id`, short `summary`, `read_when`, verification date `as_of`, sharing rule `keep` and intended reader `audience`. A Next action also names `next_actor`; `dependency` may name what it awaits. The intended reader does not grant sharing permission.

- `keep`: keep with its owner.
- `home`: may leave for the owner's home context, never a share export.
- `share`: may be included in a share export.

`last_worked` records activity. `as_of` records explicit verification. Verification requires a date, author, source and origin; it preserves the work date and original body. Agent evidence is marked `origin: "agent"`, never converted into a human decision.

Evidence and relations are JSON strings in the flat YAML header. Evidence carries `type` (decision, reversal, constraint or claim), `date`, `by`, `origin` (human, agent or capture), `source`, and optionally `rev` or `snapshot`. The body holds the current picture and dated prose; the linked raw capture stays intact. Identity relationships carry `{ "type": "depends-on", "target": "other-record-id" }`. Backlinks are derived.

```js
import { readContext, validateContext, contextGraph, exportContext } from '@supersuit/superprojects';

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
npx superprojects export --file path/to/permitted-record.md --to share --json
```

Include every referenced local record using repeated `--file`; each must independently permit the destination. Unknown permission, missing relationships, private evidence and local Markdown links outside that bundle refuse export. Reference definitions are checked in quotes and lists, including escaped and multiline labels; unused definitions and code examples are conservatively checked too. Markdown destinations containing literal parentheses, backslash escapes, HTML entities, control characters or non-ASCII whitespace refuse export; use plain or percent-encoded destinations. HTTP(S) references, including bare URLs and autolinks, require `--allow-external`. Protocol-relative URLs (`//host/path`) are unsupported; spell out HTTP(S). Raw HTML is unsupported and refuses export; use Markdown references. Export returns text and never sends it. These checks enforce declared policy and references; they do not authenticate readers or infer whether prose contains private information.

## Product adapters

`createProjectEngine(options)` supplies header parsing/roles, rendering/scaffold, lint/backfill, root enumeration, project/state query, open-project/cadence and resumability algorithms. `createFrontmatter({KINDS, validate, nestedKeysFor, personExists, beforeWrite})` shares the codec with a product's other document kinds. `parseFlat`/`stringifyFlat` expose the codec directly.

Quoted values keep commas inside an inline list item or an allowed nested flow-map value. Double-quoted values decode JSON-style escaped quotes and backslashes, including a backslash immediately before the closing quote; an invalid escape stays literal. Single-quoted values retain backslashes literally. Nesting still requires explicit `nestedKeysFor` permission for that kind.

Engine options include `frontmatter`, people resolution (`personExists`, `personPath`, `personHref`, `recordPath`, `recordName`, `workspaceLayout`), workspace paths, `deriveSourceOfTruth`, `continentOperators`, `localDay`, `lastRunAt` and `parseBooked`. Optional command formatters produce advice in the product's vocabulary. `scaffoldProject` accepts explicit `context` and `stateContext`; calls without them preserve legacy behavior.

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

Exit codes: 0 success, 1 findings/refusal, 2 usage error. `--json` works on each command. Tests use synthetic records. Mutation checks deliberately break sharing, parent closure, date updates, extracted baseline invariants and the plan map's gate refusal, behind verdict, not-before targets and weekly hours in disposable copies.

Releases are v-prefixed tag pushes through `.github/workflows/publish.yml` and npm OIDC. The first release bootstraps the package with web approval, then configures its trusted publisher. No registry token is stored in this repository.
