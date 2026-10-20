# Changelog

## 0.3.0 (2026-10-20)

Every friend.md now names the standard it follows, so an agent that has never seen Supersuit can
open the file and find its rules.

- `STANDARD` (`https://hypercontext.wiki/standards/friend`) is exported, from JavaScript and the Python companion.
- `ensure`, `migratePerson` and `migrateGroup` (and Python `ensure`) write `standard:` directly
  after `kind:`. A `standard:` line in a legacy record is kept under Old header fields, never
  silently covered by the generated one.
- `lint` reports a folder record with no `standard:`, or one naming another URL, as
  `self-doc:missing` at level error, with a `fix` naming the stamp command. Every finding now also
  carries `code` and `level` beside `rule` and `severity`.
- `friend-md stamp [--people DIR | --workspace DIR] [--apply] [--json]` backfills existing records:
  a dry run by default, byte-preserving, CRLF kept, idempotent, never touching a headerless file
  or `log/`. `stampStandard(text)` and `stampPlan(text)` are the pure functions behind it.

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
