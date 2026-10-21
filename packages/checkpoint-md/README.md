# @supersuit/checkpoint-md

*This package lives in the [hypercontext repository](https://github.com/SupersuitUp/hypercontext/tree/main/packages/checkpoint-md), with every other record standard; issues and changes go there.*

**Every save of a working session is one file, its facts in a header.** A checkpoint is what a session leaves behind so the next one can start from it: when it was saved, the commit it saved, which repos, superprojects, skills and people it touched, the links it shipped, and one line that says what happened. The narrative goes in the body; the facts go in the header, so a later session can ask "when did I last touch skill X" without reading paragraphs. `SAVE-LOG.md` keeps one short line per checkpoint and points at the file.

The shape is [Supersuit](https://wiki.supersuit.co)'s, which writes these files on every save. This package states that shape as a standard and checks a folder of checkpoints against it. It is one record type in the [hypercontext](https://hypercontext.wiki) family, beside [`@supersuit/friend-md`](https://www.npmjs.com/package/@supersuit/friend-md) for people and [`@supersuit/piece-md`](https://www.npmjs.com/package/@supersuit/piece-md) for pieces of a life's record.

```
checkpoints/2026-06-14-181203-tidied-the-garden-plan.md
```

```yaml
---
kind: checkpoint
standard: https://hypercontext.wiki/standards/checkpoint/v1
date: "2026-06-14T18:12:03-04:00"
sha: "a1b2c3d4"
session: "garden-planning"
summary: "Tidied the garden plan and filed the seed order"
repos:
  - "garden-notes@a1b2c3d4"
projects:
  - "spring-garden"
skills: []
people:
  - "dana-reyes"
urls: []
tags:
  - "garden"
---

# Tidied the garden plan and filed the seed order

What happened, for the next session.
```

## Use

```bash
npx @supersuit/checkpoint-md lint
npx @supersuit/checkpoint-md stamp checkpoints --apply
```

Node 20 or later. Its one dependency is [`@supersuit/hypercontext-core`](https://www.npmjs.com/package/@supersuit/hypercontext-core), the header codec every hypercontext package shares.

## Commands

```
checkpoint-md lint [<dir>] [--json]
checkpoint-md stamp [<dir>] [--apply] [--json]
checkpoint-md --help | --version
```

`<dir>` defaults to `checkpoints/` in the current folder. A checkpoint is a `.md` file directly in it; sub-folders are not walked and a symbolic link is never followed.

**lint** checks every checkpoint and prints one line per finding, then a count:

```
$ checkpoint-md lint
error  self-doc:missing  2026-06-02-090000-booked-the-soil-delivery.md  standard is the bare https://hypercontext.wiki/standards/checkpoint, which predates versions; checkpoint-md stamp --apply upgrades it to https://hypercontext.wiki/standards/checkpoint/v1
1 error, 0 warnings, 2 checkpoints
[exit 1]
```

A clean folder prints `clean: 2 checkpoints` and exits 0.

**stamp** makes every checkpoint name the standard version it follows: it adds a missing `standard:` on its own line directly after `kind:` (where Supersuit's writer puts it), or upgrades the bare unversioned URL to `/v1` in place. Only those bytes change; quotes, comments, line endings and every other line stay as they were. It is a dry run that lists the changes unless `--apply`. It never gives a file with no header a header, and never rewrites a record naming another standard or another version; those are listed as skipped.

```
$ checkpoint-md stamp
would upgrade  2026-06-02-090000-booked-the-soil-delivery.md
1 to stamp, 1 already current, 0 skipped
[exit 1]
```

Exit codes: 0 clean or nothing left to stamp; 1 findings, or stamps pending or skipped; 2 usage.

## Library

```js
import { lint, checkCheckpoint, stampPlan, stampStandard, MANIFEST } from '@supersuit/checkpoint-md';

lint('checkpoints');                                        // { findings, checkpoints }
checkCheckpoint(header, { name: '2026-06-14-181203-x.md' }); // findings for one header
stampPlan(text);                                            // { text, status: added | upgraded | current | no-header | other }
stampStandard(text);                                        // the stamped text, nothing else changed
MANIFEST;                                                   // the standard as data: standards/checkpoint/v1.json
```

## The shape

| key | holds |
|---|---|
| `kind` | `checkpoint` (required) |
| `standard` | `https://hypercontext.wiki/standards/checkpoint/v1` (required) |
| `summary` | one line, at most 120 characters: the line `SAVE-LOG.md` indexes the save by (required) |
| `date` | when the save was made, an ISO timestamp, with its local offset when the writer knows it |
| `sha` | the workspace commit the save is of; empty when there was none |
| `session` | the session's name |
| `repos` | a list of `name@sha`, flat |
| `projects` | a list of superproject slugs |
| `skills` | a list of skill names |
| `people` | a list of person slugs |
| `urls` | a list of links the session shipped or used |
| `tags` | a list of tags |

The file is named `YYYY-MM-DD-HHMMSS-slug.md`, the save's local time to the second. Every other single value is one line of at most 400 characters, every list is a list of strings, the header is flat (no nested maps), and a key outside this table is refused.

## The standard, as data

Every checkpoint names `standard: https://hypercontext.wiki/standards/checkpoint/v1`. Beside that page is its machine-readable twin, `v1.json`, which this package ships as [`standards/checkpoint/v1.json`](standards/checkpoint/v1.json) and exports as `MANIFEST`: the header keys a record must carry and the constraints a reader can check without installing anything, the exact commands to check and backfill, and **every** code `lint` can report with its level, what it means and how to fix it. The tests prove the manifest says exactly what `lint` enforces.

| code | level | what it means |
|---|---|---|
| `header:missing` | error | no YAML header (stamp cannot fix this) |
| `name:pattern` | error | the file is not named `YYYY-MM-DD-HHMMSS-slug.md` |
| `kind:missing` | error | `kind` is missing or not `checkpoint` |
| `self-doc:missing` | error | no standard, the bare unversioned URL, or another kind's standard |
| `self-doc:version` | error | a version of the checkpoint standard this package does not implement |
| `summary:missing` | error | no summary |
| `summary:length` | error | the summary is over 120 characters |
| `key:unknown` | error | a key the standard does not define |
| `value:map` | error | a nested map |
| `value:type` | error | a value or list item that is not a string |
| `value:shape` | error | a list key holding one value, or a single-value key holding a list |
| `value:line` | error | a single value over one line or 400 characters |
| `slug:pattern` | error | a `projects` or `people` entry that is not a kebab-case slug |

## Develop

```bash
npm test               # the tests
npm run mutation-check # every rule removed once; its test must go red
npm run install-proof  # pack, install outside the repo, run every documented command
```

Releases are a tag push through GitHub Actions with npm trusted publishing.

MIT
