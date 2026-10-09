# Changelog

## 0.5.0 (2026-10-09)

Projects are now superprojects, and the plan map is now the atomic action map. New superprojects are written under the new names: the record is SUPERPROJECT.md (was PROJECT.md), the map is ATOMIC-ACTION-MAP.md (was PLAN.md), and the folder is `superprojects/` (was `projects/`), at the top and for subprojects inside their parent. STATE.md keeps its name. An atomic action is one stretch of work with no handoff inside it and at most four hours of human time; waits and milestones stay on the map as the joints between actions.

Your existing files keep working. Every reader takes both names: a folder is a superproject if it holds either record file, a map is either file, and both `superprojects/` and `projects/` folders are read, at the top and nested. Only the new names are written. A folder holding both SUPERPROJECT.md and PROJECT.md is a lint error, `projects:record:both`, naming both; both map files is `projects:plan:both`. Readers use the new file until you merge them.

- `superprojects map lint|status|schedule|blocks` reads the atomic action map. `superprojects plan` still works and answers identically.
- `superprojects migrate --root <dir>` converts a tree to the new names. It is a dry run unless you pass `--apply`. It renames the record and map files in every superproject (closed ones and nested children too), renames every nested `projects/` folder to `superprojects/`, moves a root called `projects/` to a sibling `superprojects/`, leaves a `projects -> superprojects` link in place of each folder it empties, and rewrites the relative Markdown links under the root that would otherwise break. It refuses, exits 2 and changes nothing when a destination already exists or a folder holds both names, and it never commits.
- With no root given, the library reads `superprojects/` under the working directory plus a sibling `projects/`. A `projects/` that is a link to `superprojects/` is read once, at the top or nested. A root you pass is read exactly as given.
- `scaffold` writes SUPERPROJECT.md, STATE.md and, for a finite superproject, ATOMIC-ACTION-MAP.md, and puts a subproject in its parent's `superprojects/` folder. The parent link points at the record file the parent actually has, so a child of a not-yet-migrated parent links PROJECT.md. `--no-map` opts out of the map; `--no-plan` still works.
- A parent and a slug are found in a sibling `projects/` root while a workspace is half converted, so a child can still be created under a parent that has not moved yet, and a slug cannot be reused across the two.
- New exports: `NAMES`, `namesOf`, `recordFileOf`, `mapFileOf`, `rootsOf`, `renderActionMapMd` (`renderPlanMd` remains as an alias), `planMigration`, `applyMigration` and `rewriteLinks`. The engine takes a `names` option that overrides any name, and exposes `engine.NAMES`, `recordFileOf`, `mapFileOf`, `rootsOf`, `defaultPaths` and `LEGACY_NESTED_ROOT`. `NESTED_ROOT` is now `superprojects`. `allowedRootFiles` defaults to all five file names.
- The `project` and `state` frontmatter kinds match records under either folder name and either record name, at any nesting depth. Before this, nothing under a `superprojects/` folder was recognised.
- Lint and help text say superproject and atomic action map. `projects:plan:missing` keeps its id and now names ATOMIC-ACTION-MAP.md. Other check ids, function names, frontmatter kind names and `--kind project|state` are unchanged.
- The `agentic-projects` command, kept for one release after the rename in 0.4.0, is gone. Use `superprojects`.

## 0.4.1 (2026-10-09)

- `plan status` notices a missed window. When the steps before a request finish after its window has closed, or the window closed with no answer, the verdict is never on track: the step becomes the driver, the line says its fallback applies, and `missedWindows` lists it. Before this, a closing that slipped past the movers' booked day still read on track.
- `plan lint` warns `plan:duration:thin-source` when an estimate does not say whose it is and when it was made, or a measurement names no run.

## 0.4.0 (2026-10-09)

Renamed from `@supersuit/agentic-projects` to `@supersuit/superprojects`, with the command `superprojects`. The API is unchanged, and the `agentic-projects` command still works for this release. The repository moved to SupersuitUp/superprojects.

## 0.3.2 (2026-10-09)

The last release under this name. The package is now `@supersuit/superprojects`, with the same API and commands; this version only adds that notice to the README.

## 0.3.1 (2026-10-09)

Plan lint reads both header shapes. `lintProject` took a project's kind and team only from the YAML block, so a project still on the legacy `**Label:**` header was read as finite with an empty team: an ongoing one warned `projects:plan:missing`, and a co-lead named only in the People list was treated as outside the team. Kind now comes from the same reader every other check uses, and the team includes the owner and every person whose People-list role produces work.

## 0.3.0 (2026-10-09)

The superproject plan map. PLAN.md is a third file at the project root, beside PROJECT.md and STATE.md, and says how the project gets done: every step to the deliverable with its actor (`agent`, person slugs, or `outside: <name>`), kind (work, wait, gate, milestone), effort and lead time that each say where the number came from, dependencies, provisional not-before targets, windows and fallbacks for outside asks, the skill that runs it, and its status. A header declares weekly hours per person, the baseline and an optional buffer; `## Scenarios` move named targets with one marked working, and `## Revisions` keep one dated line per change.

New module `src/plan.mjs`, exported from the package root: `parsePlan`, `lintPlan`, `schedulePlan`, `planStatus`, `proposeBlocks`, `renderPlanMd`, `findCycle`, `isOutside`, the value parsers (`parseDuration`, `parseTarget`, `parseWindow`, `parseActors`, `parseStatus`, `parseCapacity`), `dayOf`, `isoOf`, `STEP_KINDS` and `MAX_HUMAN_EFFORT_MINUTES`. `lintPlan` refuses a gate given to the agent, unknown or circular dependencies, duplicate ids and steps with no actor, and warns on unsourced durations, human steps over four hours, undated gates and milestones, outside asks with no window or fallback (waits exempt), a finite plan with no milestone, and scenarios that are not exactly one working or move unknown steps. `schedulePlan` places human effort only inside each person's weekly hours, waits by lead time, and every target as not-before, and returns the critical path. `planStatus` answers on track, at risk, behind or no deadline, with slack, the buffer (10% of the days remaining, at least three), the driver, slip against the baseline, ready work by actor, the seven-condition defensible test and, on request, every scenario side by side. `proposeBlocks` fits one person's next steps into free time a product supplies; it proposes and never books.

`scaffoldProject` writes PLAN.md for every finite project (the next action as `s01`, the deliverable as milestone `m1`) and returns `plan`; `spec.plan: false` and `scaffold --no-plan` opt out, and ongoing projects get none. PLAN.md joins the default allowed root files. `lintProject` warns `projects:plan:missing` for a finite project without a plan and reports every plan finding, judging outside actors against the owner, co-leads, operators and contributors. New CLI command `agentic-projects plan lint|status|schedule|blocks --project <dir>` with `--date`, `--deadline` (defaulting to PROJECT.md's), `--scenario`, `--all-scenarios`, `--actor` and `--free`.

## 0.2.0 (2026-10-08)

Subprojects live inside their parent: `<parent>/projects/<child>/`, and a closed child moves to `<parent>/projects/done/<child>/`, so a parent's folder carries its whole tree and closing the parent carries its closed children with it. Discovery (`projectDirs`, `projectDirsOf`, `findProjectDir`, `query`, `openProjects`, `lint`) finds projects at any depth under every live and `done/` root, descending only into a project's own `projects/` folder, never into documents. Slugs stay the folder basename and stay unique at every depth; scaffold refuses a duplicate anywhere under the root.

`scaffoldProject` with a parent creates the child inside it, with the parent link and people links measured from the new depth. Lint reports `projects:header:parent-location` (error) when a nested child's `parent:` disagrees with, or omits, the folder it sits in, and `projects:header:parent-not-nested` (warning) for a child still beside its parent. `nestingPlan(root)` and `agentic-projects nest-plan --root` list where each flat child belongs, parents first, refusing duplicates, missing or closed parents, cycles and taken destinations; they move nothing. `openProjects` rows carry `dir`; `openProjects({ includeSnoozed: true })` returns snoozed projects as full rows marked `snoozedUntil` (the default still keeps them in `.snoozed` only), for a survey that must see every open project. A nested child with no `parent:` reports its enclosing project. New helpers: `enclosingProjectDir`, `topRootOf`, `inDone`, `NESTED_ROOT`.

Fix comma splitting after escaped double quotes in inline lists and explicitly allowed nested flow maps. Preserve escaped backslash pairs and single-quoted literal behavior.

## 0.1.0 (2026-10-04)

Extract the running Markdown project engine into a configurable, dependency-free library and CLI. Preserve ownership, roles, legacy headers, project/state rendering, root and done-folder enumeration, cadence, queries and resumability.

Add an opt-in context contract with verification distinct from activity, attributed evidence, sharing permission distinct from intended reader, backlinks and source drift findings. Refuse parent closure with unfinished descendants and sharing with unknown permissions or private local references. Older records remain readable without fabricated history.
