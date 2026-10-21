# Changelog

## 0.3.0 (2026-10-20)

Every friend.md now names the standard it follows, so an agent that has never seen Supersuit can
open the file and find its rules.

- `STANDARD` (`https://hypercontext.wiki/standards/friend/v1`) is exported, from JavaScript and the Python companion.
  The link names the version: what `/v1` means never changes, and `LATEST_STANDARD` (the
  unversioned `https://hypercontext.wiki/standards/friend`, exported) is the page that always shows
  the newest version. A record never names the unversioned URL. `STANDARD_VERSIONS` (`[1]`) lists
  the versions this package implements, and `standardStatus(value)` classifies any `standard:` value.
- `ensure` and `migratePerson` (and Python `ensure`) write `standard:` directly after `kind:`.
  `migrateGroup` writes the group standard instead, `GROUP_STANDARD`
  (`https://hypercontext.wiki/standards/group/v1`, exported), because a group.md is its own record
  type. `stamp` and `lint` never touch or judge anything under `people/groups/`. A `standard:` line in a legacy record is kept under Old header fields, never
  silently covered by the generated one.
- `lint` reports a folder record with no `standard:`, one naming the unversioned URL (the message
  says it predates versions and that `stamp --apply` upgrades it), or one naming another kind's or
  any other URL, as `self-doc:missing` at level error, with a `fix` naming the stamp command. A
  record naming a friend version this package does not implement (`/v2`, `/v0`) is the new
  `self-doc:version`, level error. Every finding now also carries `code` and `level` beside `rule`
  and `severity`.
- `CODES` (exported) is the table of every finding `lint` can report, with its level, what it means
  and how to fix it. `lint` takes every level from it and refuses to report a code that is not in it.
- The package ships its standard's manifest, `standards/friend/v1.json` (exported as `MANIFEST`, and
  as `@supersuit/friend-md/standards/friend/v1.json`): the versioned URL, the header keys `lint`
  requires, the constraints a reader can check without the package, the exact check and backfill
  commands, and every code in `CODES`. hypercontext.wiki publishes this file unchanged. A test proves
  the manifest names `STANDARD`, lists exactly the codes `lint` can emit, and agrees on every level.
- `friend-md stamp [--people DIR | --workspace DIR] [--apply] [--json]` backfills existing records:
  a dry run by default, byte-preserving, CRLF kept, idempotent, never touching a headerless file
  or `log/`. It upgrades the unversioned URL to `/v1` in place, replaces any other wrong URL, and
  leaves a record naming an unimplemented friend version alone (reported as skipped) rather than
  downgrade it. `stampStandard(text)` and `stampPlan(text)` are the pure functions behind it.
- The `standard:` line never makes a record too big. Size limits (8,192 bytes, 1,024 for a blocked
  record) are measured WITHOUT the exact `standard: <URL>` header line (the `/v1` one, or the legacy
  unversioned one), so a record just under the
  cap stays under it after `stamp`. This is one rule in one place, `recordBytes(text)` (exported),
  used by `lint`'s `too-big`, `migratePerson`'s field eviction and `overLimit`, and the migration
  proof. A `standard:` naming any other URL counts like any other line.

## 0.2.0 (2026-10-08)

- A workspace can add relationship facets: `people/README.md`, a `## Facets` section, one
  `- name: what it means` line each. `lint` no longer warns about a declared facet, and
  `declaredFacets(dir)` is exported. Freedom's people README already promised this.

## 0.1.0 (2026-10-04)

- Extract the existing friend.md JavaScript reader, writer, resolver, lint and
  record conversion into a standalone package.
- Include the standard-library Python companion and retain shared parity behavior.
- Add the `friend-md` CLI, explicit root mapping and a clean installed-tarball check.
- Retain the original Continental Works source license and extraction provenance.
