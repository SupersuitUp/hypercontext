# The superobjective format

Version 1 of the standard, <https://hypercontext.wiki/standards/superobjective/v1> (`superobjective_version: "1"`). Its machine-readable twin is [`standards/superobjective/v1.json`](../standards/superobjective/v1.json) (section 7). This page is the reference; the README is the tour. Where this page and the code disagree, this page is the intent and the code has a bug.

## 1. What a superobjective is

**A superobjective is a sentence that the world can make true or false by an exact date about twelve months away: the best case its owner can barely believe and would be really happy to see come true, and that the work aimed at it can be pointed at.** A person holds up to three, ranked; each ranks the work under it, and the first leads when two compete.

- **A sentence the world can make true or false.** Some state of the world could prove it wrong. "Be healthier" is not one. "My garden book in print by October 18, 2027" is.
- **An exact date.** Never "next October" or "within twelve months". A date can be missed, so it can be met; a season can drift forever.
- **About twelve months away.** Long enough to need help, short enough to feel the clock. Six to eighteen months is accepted; outside that, lint warns.
- **The best case they can barely believe, and would be really happy to see.** The audacity test: it should surprise them, and scare them a little, if it came true by its date. A machine cannot run it, so this package does not try. It is a judge in the superskill, and the package records what the owner said first (`audacity.first_answer`) so the push is visible forever.
- **The work aimed at it can be pointed at it.** Superprojects name the sign they serve (section 6), so a superobjective decides, without asking, which of two good moves under it comes first.

### Where it sits

| Level | Horizon | Finishes? | Example (Maya) | Lives in |
|---|---|---|---|---|
| Apex / calling | decades | never | a life of making beautiful places | `self/calling/lifeblueprint.md` |
| **Superobjective** | **one exact date, ~12 months** | **yes, true or false** | **her garden book in print by October 18, 2027** | **`superobjectives/<id>/`** |
| Sign | a date inside the year | yes | a publisher signed | inside the superobjective |
| Superproject | weeks to months | yes | the first full draft | `superprojects/<slug>/` |
| Recurrent | forever | never | Sunday dinners with her parents | `recurrents/<slug>.md` |

**Keep versus change.** An area someone wants to keep as it is becomes a recurrent. An area they want to transform becomes a superobjective.

### Roots

A superobjective belongs to exactly one root, and the roots never mix.

| Root | How many active | Who | Where | Default visibility |
|---|---|---|---|---|
| `personal` | up to 3 per owner, ranked 1..n; rank 1 leads when two compete | `owner: <id>` | `self/calling/superobjectives/<id>/` | `private` |
| `company` | up to 3 per organization, ranked 1..n; one by default; rank 1 leads when two compete | `owners: [<id>, ...]`, `organization:` | `superobjectives/<id>/` in the company workspace | `members` |

A role root (a person's goal inside a company) is not part of version "1".

Both roots follow the same rule (Gary, 2026-10-20): up to three active, ranked, one by default. Most companies hold one; a second or third is set only when the owners choose it. The caps are counted separately per root, so a person's superobjectives never use up their company's. The cap is `CAP` in `src/record.mjs`, and the word "signs" (kept, 2026-10-20) is `TERM` there, which also lists any older header keys still read.

**Nothing personal ever reaches a company.** A company superproject may only serve a company superobjective. A personal superproject may serve either.

## 2. The record

One folder per superobjective, named by its id:

```
self/calling/superobjectives/
  garden-book-in-print/
    superobjective.md     the record: YAML header, then a body for people
    ratchet.jsonl         every change, append-only
    calibrations.jsonl    every calibration, append-only
```

A record may sit at any depth under its home (for example `retired/<id>/`). Folder names starting with `.` or `_` are skipped.

### The header

`superobjective.md` opens with a YAML header between two `---` lines. Every value is read as a string. Lists of signs are a block list of one-line flow maps.

```yaml
kind: superobjective
superobjective_version: "1"
standard: "https://hypercontext.wiki/standards/superobjective/v1"
id: garden-book-in-print
root: personal
owner: maya
rank: 1
statement: "My book of garden designs in print by October 18, 2027, with a month in Japan."
set: 2026-10-18
by: 2027-10-18
status: active
visibility: private
area: craft
signs:
  - {id: proof-in-hand, text: "A printed proof of the book on my kitchen table.", state: open}
  - {id: publisher-signed, text: "A publisher has signed the book.", by: 2027-03-01, state: met, settled: 2026-11-02}
  - {id: twelve-gardens, text: "Twelve gardens photographed in all four seasons.", state: open}
audacity: {first_answer: "Finally start the book.", pushed: true, accepted: 2026-10-18}
serves_calling: "self/calling/lifeblueprint.md#what-i-make"
supersedes: earlier-garden-goal
summary: "My book of garden designs in print by October 18, 2027, with a month in Japan."
read_when: "sizing, ranking or proposing any work for maya before 2027-10-18"
as_of: 2026-11-02
keep: keep
```

| key | required | shape |
|---|---|---|
| `kind` | yes | the literal `superobjective` |
| `superobjective_version` | yes | `"1"` |
| `standard` | yes | `https://hypercontext.wiki/standards/superobjective/v1`: the version of the standard the record was written to, never the bare unversioned URL |
| `id` | yes | kebab-case, equals the folder name, never reused, never the rank |
| `root` | yes | `personal` or `company` |
| `owner` | personal | the owner's id |
| `owners` | company | list of owner ids |
| `organization` | company, recommended | the organization's name; ranks and the cap are counted per organization |
| `rank` | active records | integer; 1..3, unique per owner (personal) or per organization (company); removed on close or retire |
| `statement` | yes | one sentence, one line, no `**`, holding the exact date |
| `set` | yes | `YYYY-MM-DD`, the day it was set |
| `by` | yes | `YYYY-MM-DD`, equal to the date written in the statement |
| `status` | yes | `draft`, `active`, `achieved`, `missed`, `retired` |
| `visibility` | yes | `private`, `members`, `public` |
| `area` | no | free tag |
| `signs` | yes | list of `{id, text, by?, state, settled?}`; `state` is `open`, `met` or `missed`; `settled` is the day it stopped being open |
| `audacity` | no | `{first_answer, pushed, accepted}`: what the owner said before anyone pushed, verbatim |
| `serves_calling` | no | a loose pointer to the part of the calling this advances; never checked |
| `supersedes` | no | id of the superobjective this one replaced |
| `summary`, `read_when`, `as_of`, `keep` | yes | the context keys every Supersuit record carries; `keep` is `keep`, `home` or `share` and follows visibility (private, members, public) |

The writers create records as `active`. `draft` is accepted on read for a sentence still being shaped by hand; a draft has no rank and is not counted against the cap.

Unknown keys are kept as written by every write. A record migrated from the single-file shape keeps its old header lines in their old order, with the new keys after them.

A date in a statement may be written `2027-10-18`, `October 18, 2027` or `18 October 2027`. These phrases are relative time and are refused: `next <month|season|year|quarter>`, `this <...>`, `coming <...>`, `within|in|over <n> <years|months|weeks>`, `<n> years|months from now|today`, `by next`, `this time next`.

### The body

The body is for people.

1. A `# title`.
2. **The statement**, as one line that is wholly bold. It must equal the header `statement` (lint `statement:body`). Writers keep it in step; a person may not edit it by hand.
3. **What this file is**: a generated note, between `<!-- superobjective:about -->` markers, right under the statement. It says what a superobjective is, how to read the signs, where the ratchet and calibration logs are, that it changes only through the superskill or `npx @supersuit/superobjective`, and names the standard's URL.
4. **In their words**: the verbatim quotes the sentence came from, with source and date.
5. **Signs**, **Calibration** and **Ratchet**: each rendered from data between markers, and rewritten on every write:

```
<!-- superobjective:signs -->
...
<!-- /superobjective:signs -->
```

The four region names are `about`, `signs`, `calibration`, `ratchet`. A region may sit under any heading. Everything outside the markers and the statement line is a person's prose and no write touches it.

6. **The number**, when there is one (a price, a time), as prose.

### Self-documenting

**Every superobjective explains itself to a stranger or a fresh agent with no other context**, the way every hypercontext record does. Two things carry that, and lint refuses a record without either (`self-doc:missing`): the `standard:` URL in the header, which names the rules the file follows, and the "What this file is" note in the body. Every write through the package re-renders the note, so an old record gains it on its next write and a migrated one has it from the start.

**The link names the version.** `https://hypercontext.wiki/standards/superobjective/v1` is version 1, and its meaning never changes once published; a correction that changes what a valid record is becomes `v2`. The bare `https://hypercontext.wiki/standards/superobjective` is the latest page, which lists every version, and a record never names it. A record that does was written before versions existed: lint reports it as `self-doc:missing`, every write through the package upgrades it, and `superobjective stamp --apply` upgrades a whole home at once. A record naming a version this package does not implement (`/v2` and later) is `self-doc:version`, and is never downgraded.

```
superobjective stamp [<home>...] [--apply] [--json]
```

`stamp` is a dry run unless `--apply`. It writes `standard:` (inserting it when absent) and re-renders the "What this file is" note through the package's own write path, so every other byte stays put: unknown header keys, a person's prose, the three data regions. It is not a change to the superobjective, so it appends no ratchet line. A second run changes nothing. It exits 1 when a record names a version it does not implement.

### ratchet.jsonl

Every change is one JSON object on its own line, appended, never edited:

```json
{"at":"2026-11-02","change":"raise","field":"statement,by","from":"…","to":"…","why":"the publisher signed in month one","by":"maya","after":{"statement":"…","by":"2027-09-18","rank":"1","status":"active","signs":[…]}}
```

| field | meaning |
|---|---|
| `at` | the day of the change |
| `change` | `set`, `raise`, `reword`, `add-sign`, `meet-sign`, `rerank`, `lower`, `close`, `retire`, `visibility`, `migrate` |
| `field` | what changed: `statement`, `by`, `signs.<id>`, `rank`, `status`, `visibility`, or several joined by `,` |
| `from`, `to` | the old and new values, where there is one of each |
| `why` | the reason, in words; required on every change after `set` except `meet-sign` |
| `by` | the person who made the change (for `lower`, an owner) |
| `after` | the state after the change: `{statement, by, rank, status, signs}` |
| `source` | optional: where it came from (a calibration, a legacy file) |
| `dropped` | on `lower`: the sign ids removed |
| `text`, `legacy`, `shared` | on lines migrated from a legacy table: the row's words verbatim, `true`, and `true` when one row applied to several superobjectives |

**The last line carrying `after` is the record's ledger state.** The header's `statement`, `by`, `rank`, `status` and `signs` must equal it (lint `ratchet:silent`). That is how a hand edit is caught.

**`lower` is the only change that may push `by` later or remove a sign, and it carries an owner's name in `by` and their words in `why`.** A later `by` or a missing sign between two `after` states, under any other change, is `ratchet:lowered`. Lines migrated from a legacy table (`legacy: true`) carry no `after` and are never judged by this rule; their words are kept as they were written.

### calibrations.jsonl

One line per calibration, appended, usually monthly:

```json
{"at":"2026-11-18","elapsed":0.088,"met":1,"total":3,"lead":0.736,"verdict":"ahead","overdue":[],"note":"month one","by":"maya"}
```

A calibration never changes the superobjective, so it never writes a ratchet line.

### Pace

```
elapsed  = days from set to today / days from set to by, clamped to 0..1
expected = elapsed × number of signs
lead     = signs met − expected
```

`ahead` when `lead >= 0.5`; `behind` when `lead <= -1` or any open sign is past its own `by`; `on` otherwise. Deliberately lopsided: half a sign early is enough to offer a raise, a whole sign late is needed to call it behind.

### Closing

On or after `by`, a superobjective closes as `achieved` or `missed`. It may close as `achieved` early; it is never `missed` before its date (before then it is behind, and may be lowered or retired). It is never extended: a new date is a new superobjective with a new id and `supersedes:` pointing at the old one. Closing or retiring removes `rank` and renumbers the rest of the group 1..n, each move a `rerank` line.

## 3. Validation

The package ships the gates: deterministic checks, each a coded finding. Judges need a reader and live in the superskill, never here:

- **Barely believe.** Is this the best case its owner can barely believe, and would be really happy to see come true? Could they reach it by doing roughly what they already do?
- **Change, not keep.** Is it something to transform, or a recurrent wearing a superobjective's clothes?
- **Safety on health.** On health and body, push ambition, never risk.
- **Falsifiable signs.** Could a specific observation show each sign was not met?
- **Theirs.** Is it in their words?

| Code | Level | Reported when |
|---|---|---|
| `header:missing` | error | no YAML header, or `kind` is not `superobjective` |
| `header:value` | error | version, root, status or visibility outside the standard, or statement or owner(s) missing |
| `self-doc:missing` | error | `standard:` is missing, names the bare unversioned URL (written before versions; `stamp` upgrades it), or names another kind's standard; or the body has no generated "What this file is" note |
| `self-doc:version` | error | `standard:` names a version of this standard the package does not implement (only `v1`) |
| `id:folder` | error | `id` is not kebab-case, is not the folder name, supersedes itself, or reuses another record's id (retired included) |
| `date:missing` | error | `by`, `set` or a sign's `by` absent or not an exact `YYYY-MM-DD` |
| `date:relative` | error | the statement uses relative time ("next October", "within twelve months", "this year", "by next fall", "a year from now") |
| `date:mismatch` | error | the date in the statement is not the header's `by`, or the statement names no date |
| `date:horizon` | warn | `by` is under 183 or over 548 days from `set` |
| `statement:body` | error | the body's bold statement line is missing or differs from the header |
| `rank:cap` | error | more than 3 active personal per owner, or more than 3 active company per organization |
| `rank:gap` | error | active ranks in a group are not exactly 1..n |
| `signs:count` | error | fewer than 3 or more than 7 signs on an active superobjective |
| `signs:id` | error | a sign with no kebab-case id, a repeated id, no text, or a state outside `open`, `met`, `missed` |
| `signs:vague` | warn | a sign has no number, date, named thing or yes/no event |
| `ratchet:json` | error | a line of `ratchet.jsonl` or `calibrations.jsonl` is not a JSON object |
| `ratchet:silent` | error | no ratchet line records the state, or the header's statement, by, rank, status or signs differ from the last `after` |
| `ratchet:lowered` | error | `by` moved later or a sign was removed without a `lower`; or a `lower` with no `why`, or by someone who is not an owner |
| `visibility:personal` | error | a personal superobjective is `public` with no `visibility` line from its owner saying why |
| `past:open` | error | `by` has passed and `status` is still `active` |
| `serves:shape` | error | a superproject's `serves` is not `<personal|company>/<id>#<sign>` |
| `serves:dangling` | error | `serves` names no active superobjective, or no such sign on it |
| `serves:root` | error | a company superproject serves a personal superobjective |

`signs:vague` is a heuristic. It treats as concrete: a digit, a month name, a number word (one, twelve, half, every...), a capitalised word that does not start the sentence, or an event verb (signed, published, launched, shipped, closed, accepted, has, is, runs...).

The writers refuse what lint would report, before anything is written: relative time, a mismatched date, a fourth active personal or company superobjective, a reused id, more than 7 signs, a raise that moves the date later, a lower without an owner and their words, a lower that would leave fewer than 3 signs, a `missed` before the date, a personal superobjective made public by anyone but its owner, and any change after `set` (except `meet-sign`) with no why.

## 4. Writing

Every write goes through the package (the library or the CLI). Each one patches the header with only the keys it changes, re-renders the three regions, and appends one ratchet line. A person may edit any prose by hand; editing the header or the statement line by hand is reported as `ratchet:silent` or `statement:body` until a write records it.

## 5. Migrating

Two older shapes are read, and only the folder is written. The legacy file is never changed or deleted.

- **Single file**: one `SUPEROBJECTIVE.md` with `superobjective_version: "1"`, a bold statement, a numbered list under `## What would be true`, and a `| Date | Change | Why |` table under `## Ratchet`. It becomes one folder. Every header line and every line of prose are kept byte for byte; the list and the table become regions; each list item becomes a sign with its text verbatim (the bold lead, when there is one, gives the id); each table row becomes a ratchet line with `text` and `why` verbatim and `legacy: true`.
- **Ranked file**: `## Superobjective <n>` sections, each with a bold statement and a `by:` line, then `## Ratchet`. Each section becomes a folder ranked by its position, with its text kept verbatim. Each table row goes to the superobjective it names, by following `Ratcheted n: new (was old)` rows back to the statement in `Set n:` or `Added n:`. A `Re-ranked` row, or a row naming no one statement, goes to all of them with `shared: true`. The file's generic intro paragraph is not carried.

A migration ends each ratchet log with a `migrate` line holding the state. The statement is never reworded, so a legacy "within twelve months" comes through as `date:relative` for its owners to fix.

## 6. Serves

The edge between a superproject and a superobjective is written on the superproject, never on the superobjective:

```yaml
serves: "personal/garden-book-in-print#proof-in-hand"
```

`<root>/<id>#<sign>`, all three parts required. A superproject may list several. The superobjective never lists its superprojects. `readSuperprojects(dir)` reads `serves` and `root` from every `SUPERPROJECT.md` (or legacy `PROJECT.md`) under a folder; a superproject with no `root` takes the root given by the caller.

## 7. The manifest

Beside each version of the standard is its machine-readable twin. This package owns it: [`standards/superobjective/v1.json`](../standards/superobjective/v1.json) ships in the tarball, is exported as `MANIFEST` (and as `@supersuit/superobjective/standards/superobjective/v1.json`), and is published unchanged at `https://hypercontext.wiki/standards/superobjective/v1.json`.

It says, as data, what a reader needs to check a record without installing anything: the `standard` URL, the header's required keys and their constraints (`const` for `kind`, `superobjective_version` and `standard`; `enum` for `root`, `status`, `visibility` and `keep`; `pattern` for `id` and the dates), the validator (`@supersuit/superobjective`, implementing this version since `0.1.0`, its `lint ... --json` check and its `stamp ... --apply` backfill), and every code lint can report, with its level, what it means and how to fix it.

A test in this package proves the manifest says what the package enforces: its `standard` is `STANDARD`, its header enums are the package's own lists, and its codes and levels are exactly `CODES`. A new code, a changed level, or a new version cannot ship without the manifest moving with it.
