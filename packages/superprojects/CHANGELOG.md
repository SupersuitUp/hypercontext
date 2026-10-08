# Changelog

## 0.2.0 (2026-10-08)

Subprojects live inside their parent: `<parent>/projects/<child>/`, and a closed child moves to `<parent>/projects/done/<child>/`, so a parent's folder carries its whole tree and closing the parent carries its closed children with it. Discovery (`projectDirs`, `projectDirsOf`, `findProjectDir`, `query`, `openProjects`, `lint`) finds projects at any depth under every live and `done/` root, descending only into a project's own `projects/` folder, never into documents. Slugs stay the folder basename and stay unique at every depth; scaffold refuses a duplicate anywhere under the root.

`scaffoldProject` with a parent creates the child inside it, with the parent link and people links measured from the new depth. Lint reports `projects:header:parent-location` (error) when a nested child's `parent:` disagrees with, or omits, the folder it sits in, and `projects:header:parent-not-nested` (warning) for a child still beside its parent. `nestingPlan(root)` and `agentic-projects nest-plan --root` list where each flat child belongs, parents first, refusing duplicates, missing or closed parents, cycles and taken destinations; they move nothing. `openProjects` rows carry `dir`, and a nested child with no `parent:` reports its enclosing project. New helpers: `enclosingProjectDir`, `topRootOf`, `inDone`, `NESTED_ROOT`.

Fix comma splitting after escaped double quotes in inline lists and explicitly allowed nested flow maps. Preserve escaped backslash pairs and single-quoted literal behavior.

## 0.1.0 (2026-10-04)

Extract the running Markdown project engine into a configurable, dependency-free library and CLI. Preserve ownership, roles, legacy headers, project/state rendering, root and done-folder enumeration, cadence, queries and resumability.

Add an opt-in context contract with verification distinct from activity, attributed evidence, sharing permission distinct from intended reader, backlinks and source drift findings. Refuse parent closure with unfinished descendants and sharing with unknown permissions or private local references. Older records remain readable without fabricated history.
