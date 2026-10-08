# @supersuit/self-md

A written standard for the folder that holds everything about one person (`self/`), with a lint
that enforces it and a sweep that derives which tools read each file.

Zero dependencies. Node 20 or later. Use is governed by the retained [license](LICENSE).

## 30 seconds

```sh
npm install @supersuit/self-md
npx self-md lint --workspace .
npx self-md undeclared --workspace . --root ./skills
npx self-md stamp --workspace . --root ./skills --write
```

## The standard

A workspace is a folder. `self/` inside it holds everything about the person the workspace
belongs to, and `self/self.md` is the one screen an agent reads first.

### Facets

Each facet is a folder under `self/` that answers one question.

| Facet | Answers |
| --- | --- |
| `voice/` | How do they write and speak? |
| `calling/` | What are they for, and what are they aiming at? |
| `personality/` | What are they like, by evidence? |
| `values/` | What do they hold to? |
| `faith/` | How do they walk with God? |
| `journal/` | What are they thinking and dreaming, in their own words? |
| `body/` | How is their body, and what are their rules for it? |
| `story/` | The record of their life: events, press, pictures. |
| `taste/` | What do they love and choose? |
| `daily/` | What is today's plan? |
| `log/` | What happened, dated, month by month? |

Files allowed at the root of `self/`: `self.md`, `story.md`, `identity-map.md`, `README.md`.

Anything else is declared in `self/README.md`, one bullet per name, with what it is for:

```md
## Facets
- craft/: what am I building with my hands?

## Root files
- GROUNDING.md: what keeps me steady
```

### self.md

```md
---
kind: self
id: ann-lee
name: Ann Lee
summary: Ann, on one screen.
read_when: every session
as_of: 2026-10-08
keep: home
---

# Ann Lee
...
```

- Required, non-empty: `kind` (must be `self`), `id`, `name`, `summary`, `read_when`, `as_of`, `keep`.
- Refused: `title` (the name is `name:`) and `last_verified`.
- The body is at most 60 non-empty lines.

### What the lint reports

| Rule | Meaning |
| --- | --- |
| `self-missing` | There is no `self/self.md`. |
| `self-header` | A required key is missing or empty, `kind` is not `self`, or a refused key is present. |
| `self-length` | The body is over 60 non-empty lines. |
| `self-undeclared` | A folder or file at the root of `self/` is neither a default nor declared, or is a dangling symlink. |
| `self-outside` | A collection about the person (`dreams/`, `prayers/`, ...) sits in `documents/collections/` instead of under its facet. |

## reads: and read_by

A reader (a skill, an app, a script) declares the workspace paths it depends on. Each source's
`read_by:` is then derived from those declarations, never kept by hand.

A skill declares in its `SKILL.md` frontmatter:

```md
---
name: dream-processor
reads:
  - "self/journal/dreams/: files each dream here"
---
```

Anything else declares in a manifest named `.reads.json` or `.freedom-reads.json` (both are
read; the second is the original name and stays supported):

```json
{ "reader": "journal-app", "reads": [{ "path": "self/journal/", "use": "the nightly export writes here" }] }
```

`stamp --write` puts the derived block at the top of each source's frontmatter. A folder stamps its
`README.md`; a `.md` file stamps itself; any other file is reported unstampable.

```md
---
read_by:
  - "dream-processor: files each dream here"
read_by_generated: true
---
```

`read_by_generated: true` is what marks the block as derived. A `read_by:` without it is hand-kept
and is never touched. A generated block whose path no reader declares any more is cleared, which is
why `stamp --write` must be given every reader root and refuses to run with none.

`undeclared` scans the reader roots for any file that names a workspace folder under `self/`,
`documents/collections/`, `people/`, `projects/` or `setup/` without a declaration covering it.
A mention counts at a path boundary (`myself/journal/` is not `self/journal/`), after `./` or `../`
only inside the workspace itself, and after the workspace folder's own name from anywhere.

## Library

```js
import { lintSelf, collectReads, stampReadBy, undeclaredReaders } from "@supersuit/self-md";

const findings = lintSelf("/path/to/workspace");
// [{ rule, path, message, severity }]

const reads = collectReads(["/path/to/skills", "/path/to/app"]);
// [{ reader, path, use }]

const plan = stampReadBy("/path/to/workspace", reads, { write: true });
// [{ target, lines, missing?, handKept?, unstampable?, cleared? }]

const loose = undeclaredReaders("/path/to/workspace", ["/path/to/skills"]);
// [{ file, path }]
```

Every default can be overridden without changing it for anyone else:

```js
lintSelf(root, {
  facets: { ...FACETS, craft: "What do I make?" },
  rootFiles: ROOT_FILES,
  personCollections: { dreams: "journal" },
  collectionsDir: "documents/collections",
  screenLines: 60,
});
undeclaredReaders(root, roots, { scan: ["self", "notes"], deep: ["self"] });
```

Also exported: `FACETS`, `ROOT_FILES`, `PERSON_COLLECTIONS`, `REQUIRED_KEYS`, `REFUSED_KEYS`,
`SCREEN_LINES`, `MANIFEST_NAMES`, `SCAN_FOLDERS`, `DEEP_FOLDERS`, `selfFacetFor(root, facet)`,
`declaredExtras(root)`, `readHeader(text)` and `isMain(import.meta.url)`.

## CLI

```sh
self-md lint --workspace DIR [--json]
self-md stamp --workspace DIR --root DIR [--root DIR ...] [--write] [--json]
self-md undeclared --workspace DIR --root DIR [--root DIR ...] [--json]
self-md --help
```

Exit codes: `0` clean, `1` findings (a lint error, an undeclared mention, or a stamp target that is
missing or hand-kept), `2` usage error. `--json` prints one JSON object instead of tab-separated
lines.
