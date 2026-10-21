# The friend.md record format

## Files

```text
people/
  README.md                 layout marker: layout: friend-md
  ann-lee/
    friend.md               required portrait
    story.md                longer history and life context
    quotes.md               sourced quotations
    voice.md                per-person voice context
    log/YYYY-MM.md          dated interactions
    threads/YYYY-MM.md      thread digests
    messages/               private, verbatim messages
    private.md              confidential context
  groups/tea-club/group.md  group record
  archive/old-pal/friend.md archived person
```

Only the portrait is required. New folders omit empty companion files. Keep portrait
prose short and rewrite it as understanding changes; append history into monthly logs.
The legacy `people/<slug>.md` layout remains readable. A folder wins when both shapes
exist, and lint reports the split record.

## Portrait

```yaml
---
kind: friend
standard: https://hypercontext.wiki/standards/friend/v1
id: ann-lee
name: Ann Lee
aliases: [Annie]
summary: Tea club collaborator.
read_when: Before planning tea.
as_of: 2026-10-04
keep: home
circle: close
relationship: [friend, collaborator]
---

## Now
Planning the next tea gathering.

## How I talk to them
Short and casual.
```

Required fields: `kind`, `standard`, `id`, `name`, `summary`, `read_when`, `as_of`, `keep`,
`circle`, `relationship`. The id matches the folder name. Contact and routing fields
remain top-level keys. `last_contact` and legacy `last_interaction_date` are kept on
the same date by `setLastContact`.

Circles: `inner`, `close`, `active`, `known`, `past`, `blocked`. Relationship facets
are the exported `FACETS` vocabulary; multiple facets are allowed. Unknown legacy
relationship labels become tags during conversion.

Portrait limit: **8,192 UTF-8 bytes**. Blocked portrait limit: **1,024 bytes**.
Both are measured without the `standard:` header line (`recordBytes`), which is required
boilerplate and never what makes a record too big.
`Now` has at most **10 nonblank lines**. Lint checks required keys, id, vocabulary,
size, log formatting, duplicate layouts and stray files. Untended records warn.

## Self-documenting

Every portrait carries `standard: https://hypercontext.wiki/standards/friend/v1` directly after `kind:`, naming the
version of the rules it follows for a reader with no other context. What a version means never
changes; `https://hypercontext.wiki/standards/friend` is the page listing every version, and a
record never names it. The package's writers stamp the versioned URL; `lint` reports a missing
value, the unversioned URL (written before versions) or another kind's or any other URL as
`self-doc:missing` (error), and a friend version the package does not implement as
`self-doc:version` (error). Backfill a workspace with `friend-md stamp --workspace DIR` (dry run)
and `--apply`, which inserts the line, upgrades the unversioned URL to `/v1` in place, and leaves
every other byte unchanged; a record naming an unimplemented version is skipped, never downgraded.

The version's manifest, `standards/friend/v1.json` (the package's `MANIFEST`), lists the required
header keys, the reader-checkable constraints (`standard` is const, `circle` is one of six) and
every lint code with its level, meaning and fix. `setLastContact` does not stamp: it touches only its two keys. A group.md names
`https://hypercontext.wiki/standards/group/v1` (`GROUP_STANDARD`), and `people/groups/` is never
stamped or linted here.

## History

```markdown
# ann-lee · 2026-10

- 2026-10-04 · Planned the next gathering [meeting-notes/tea.md]
```

History lines carry a date and a source. Monthly files hold their own month, newest
first. Hand-written content is retained. Undated migrated material is preserved
separately; record conversion refuses unaccounted input rather than dropping it.
Group interactions live in `threads/`; the group portrait is `group.md`.

## Confidentiality and blocked contacts

Keep verbatim `messages/` out of Git, and keep confidential context on the owner's
machine. This package reads and writes local records; it never sends messages or
decides what a caller may publish. `normalize(...).blocked` exposes blocked status
from `circle` and `do_not_contact`, including legacy values. Consumers performing
outbound actions must check that status before acting.

Record-level migration retains blocked status and refuses malformed or oversized
blocked input. `blockedPathMask(root)` provides the existing report redaction helper.
