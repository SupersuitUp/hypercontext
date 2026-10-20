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
standard: https://hypercontext.wiki/standards/friend
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
`Now` has at most **10 nonblank lines**. Lint checks required keys, id, vocabulary,
size, log formatting, duplicate layouts and stray files. Untended records warn.

## Self-documenting

Every portrait carries `standard: https://hypercontext.wiki/standards/friend` directly after `kind:`, naming the
rules it follows for a reader with no other context. The package's writers stamp it; `lint`
reports a missing or different value as `self-doc:missing` (error). Backfill a workspace with
`friend-md stamp --workspace DIR` (dry run) and `--apply`, which inserts the line and leaves
every other byte unchanged. `setLastContact` does not stamp: it touches only its two keys. A group.md names
`https://hypercontext.wiki/standards/group` (`GROUP_STANDARD`), and `people/groups/` is never
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
