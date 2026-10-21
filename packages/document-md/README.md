# @supersuit/document-md

*This package lives in the [hypercontext repository](https://github.com/SupersuitUp/hypercontext/tree/main/packages/document-md), with every other record standard; issues and changes go there.*

**A document is a markdown file in a `documents/` folder whose header says which standard it follows and who it is for.** A brief, a spec, a plan, a decision: written for a person or for the next session, kept beside the work it belongs to. This package checks every document under a folder against that shape and stamps the standard into documents that predate it, changing no other byte.

It is one record type in the [hypercontext](https://hypercontext.wiki) family, beside [`@supersuit/piece-md`](https://www.npmjs.com/package/@supersuit/piece-md) for photos and recordings and [`@supersuit/friend-md`](https://www.npmjs.com/package/@supersuit/friend-md) for people. The standard: <https://hypercontext.wiki/standards/document/v1>, and as data, [`standards/document/v1.json`](standards/document/v1.json).

```
documents/2026-03-04-091500-lease-renewal-brief.md
superprojects/2026-02-20-studio-lease/documents/2026-03-05-101500-move-out-plan.md
```

```yaml
---
standard: "https://hypercontext.wiki/standards/document/v1"
title: "Lease renewal brief"
kind: brief
audience: dana-reyes
project: 2026-02-20-studio-lease
people: [dana-reyes, ola-mensah]
created: 2026-03-04
status: draft
---

The landlord wants an answer by April.
```

## Use

```bash
npx @supersuit/document-md lint .
npx @supersuit/document-md stamp . --apply
```

Node 20 or later. Its one dependency is `@supersuit/hypercontext-core`, the header codec every record package shares.

## Commands

```
document-md lint [<home>...] [--json]
document-md stamp [<home>...] [--apply] [--json]
document-md --help | --version
```

`<home>` is any folder, default the current one, and several may be given. A document is a `.md` file **directly inside** a folder named `documents/` (or `artifacts/`, the name that folder had before), at any depth, so a workspace's own `documents/` and every superproject's are both found. Not documents, and never opened or counted: `README.md`, `STATE.md` and the other structure files (`SUPERPROJECT.md`, `PROJECT.md`, `ATOMIC-ACTION-MAP.md`, `PLAN.md`, `CLAUDE.md`, `AGENTS.md`, `index.md`), anything in a dot folder or `node_modules`, and symbolic links, which are never followed. **A bare one-file piece** (a `.md` whose header says `kind: piece`) sits in `documents/` but is a piece, not a document: `@supersuit/piece-md` checks it, and this package passes over it and counts it.

**lint** reports every document that fails the shape. Exit 0 when clean or only warnings, 1 on any error, 2 on usage.

```
$ document-md lint
error  header:missing  documents/2025-11-02-old-notes.md  no header, so it names no standard and nobody it is for; stamp will not add one
error  self-doc:missing  superprojects/2026-02-20-studio-lease/documents/2026-03-05-101500-move-out-plan.md  standard is the bare https://hypercontext.wiki/standards/document, which predates versions; document-md stamp --apply upgrades it to https://hypercontext.wiki/standards/document/v1
error  self-doc:missing  superprojects/2026-02-20-studio-lease/documents/2026-03-06-101500-landlord-decision.md  standard is missing: https://hypercontext.wiki/standards/document/v1
3 errors, 0 warnings, 4 documents
```

**stamp** names the standard in every document: it adds a missing `standard:` as the header's first line (a document's `kind:` is its genre, so the line naming its rules leads), or upgrades the bare unversioned URL in place, quotes and comment kept. Every other byte is unchanged and a second run changes nothing. It is a dry run unless `--apply`. **It never gives a headerless document a header**: a header owes answers only a person has (who it is for, what it is), so a headerless document stays `header:missing` until someone writes one. A document naming another kind's standard, or a version this package does not implement, is left alone. Both are listed as skipped. Exit 0 when nothing is left to do, 1 when changes are pending (a dry run) or anything was skipped.

```
$ document-md stamp . --apply
skipped  documents/2025-11-02-old-notes.md  no-header
upgraded  superprojects/2026-02-20-studio-lease/documents/2026-03-05-101500-move-out-plan.md
added  superprojects/2026-02-20-studio-lease/documents/2026-03-06-101500-landlord-decision.md
2 stamped, 1 already current, 1 skipped
```

`--json` on both prints the same as data, each finding naming the `home` it was found under and the `document` path relative to it.

## The shape

**The schema is open.** Documents are written by many tools, so a key this standard does not know (`google_doc_id`, `tags`, `owner`) is passed as it is. The keys it does know are typed:

| key | holds |
|---|---|
| `standard` | **required.** `https://hypercontext.wiki/standards/document/v1` |
| `audience` | **required.** Who the document is for: `freeda` (the next session), `self`, a people slug, or a role in plain words. One line |
| `title`, `project`, `supersedes`, `superseded_by`, `to` | one line of at most 400 characters |
| `kind` | the genre: `brief`, `spec`, `design`, `plan`, `decision`, `draft`, `analysis`, `transcript`, `other` |
| `status` | `draft`, `active`, `approved`, `final`, `shipped`, `superseded` |
| `created` | a real date, `YYYY-MM-DD` (or empty) |
| `people` | a list of person slugs |
| `definitions`, `define` | lists of strings |
| `narrator` | `kokoro` or `elevenlabs` |
| `theme` | `light`, `dark`, `system` |
| `comments` | `off`, `anyone`, `signed-in` |
| `comments_visible` | `owner`, `readers` |
| `state` | a map (the artifacts host's), the one key allowed to nest |

The header is otherwise flat: no key but `state` may hold a nested map, and a list holds strings. The file is named `YYYY-MM-DD-HHMMSS-slug.md`, the moment it was written; the older `YYYY-MM-DD-slug.md` is accepted.

## Codes

Every code `lint` can report. `standards/document/v1.json` publishes the same table, and a test proves the two are equal and that every code can actually be emitted.

| code | level | means |
|---|---|---|
| `header:missing` | error | no YAML header. `stamp` cannot fix it |
| `self-doc:missing` | error | no standard, the bare unversioned URL, or another kind's |
| `self-doc:version` | error | a version of the document standard this validator does not implement |
| `audience:missing` | error | `audience` is missing or empty |
| `name:pattern` | warn | the file name is neither `YYYY-MM-DD-HHMMSS-slug.md` nor `YYYY-MM-DD-slug.md` |
| `kind:value`, `status:value`, `narrator:value`, `theme:value`, `comments:value`, `comments_visible:value` | error | a closed key holds a word outside its list |
| `created:date` | error | `created` is not a real `YYYY-MM-DD` date |
| `people:slug` | error | a name in `people` is not a slug |
| `state:map` | error | `state` is not a map |
| `value:map` | error | a key other than `state` holds a nested map |
| `value:string` | error | a list holds something other than strings |
| `value:shape` | error | a list key holds one value, or a one-value key holds a list |
| `value:line` | error | a one-value key is more than one line or 400 characters |

## Where each rule comes from

Nothing here is invented: every rule is one Supersuit already enforces, or what its writer already writes. Sources are files in Supersuit's own repository (freedom-dev, at `87f104fc5`):

- **The keys, their types, their closed lists, and that the schema is open**: `.agents/lib/frontmatter/kinds.mjs:207-251`, the `document` kind (`open: true` at 209; `kind` 217, `audience` 223, `people` 225, `created` 226, `status` 227, `state` 235, `definitions`/`define` 239-240, `narrator` 243, `theme`/`comments`/`comments_visible` 246-248).
- **How each type is judged**: `kinds.mjs` `validate()`, lines 390 (`state` must be a map), 391 (no other nested map), 392 (values are strings), 394-395 (lists versus single values), 396 (closed words), 403 (a real date or empty), 405 with `MAX_SCALAR` at 26 (one line, 400 characters), 408 with `SLUG` at 21 (person slugs).
- **`audience` is required**: `.agents/lib/freedom-artifacts.mjs:183` refuses a document without one, and `hooks/audience-note.mjs:59-71` flags a document written without one. `kinds.mjs:218-222` records why its validator does not refuse it for history; this standard's v1 already named it required, and the lint holds it.
- **The standard leads the header**: `freedom-artifacts.mjs:184-186`, which is why `stamp` adds it as the first line.
- **The file name**: `kinds.mjs:208` and `hooks/audience-note.mjs:59` (`YYYY-MM-DD-HHMMSS-<slug>.md` in `documents/` or `artifacts/`); `hooks/artifact-name.mjs:62` renames any other new name to it, hence a warning rather than an error for files already written. The older `YYYY-MM-DD-slug.md` is the name documents carried before the stamp gained a time, and is accepted.
- **Structure files are not documents**: `hooks/artifact-name.mjs:92`, the same list.
- **The shared property** (`self-doc:missing`, `self-doc:version`): the hypercontext standards spec, `packages/hypercontext/docs/STANDARDS.md` section 4, through `classifyStandard` in `@supersuit/hypercontext-core`.

What this package does not check, and why: whether a slug in `people` has a file in `people/` (that needs the workspace's people layout, which the people packages own), and whether `project` names a real superproject folder.

## Library

```js
import { lint, scan, checkDocument, stampPlan, stampStandard, STANDARD, MANIFEST, CODES } from '@supersuit/document-md';

lint('.');                    // {findings, documents, pieces}
checkDocument(data, { name, raw, hasHeader });
stampPlan(text);              // {text, status: 'added'|'upgraded'|'current'|'no-header'|'other'}
```

`readHeader` and `writeHeader` are re-exported from `@supersuit/hypercontext-core`.

## Develop

```bash
npm test                  # node --test
npm run mutation-check    # break each rule on purpose; its test must go red
npm run install-proof     # pack, install outside the checkout, run every command above
```

MIT.
