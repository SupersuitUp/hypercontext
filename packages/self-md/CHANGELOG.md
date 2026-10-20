# Changelog

## 0.2.0

self.md is self-documenting: it names the standard it follows.

- `STANDARD` (`https://hypercontext.wiki/standards/self`) is exported, with `STAMP_COMMAND`.
- `lintSelf` reports `self-doc:missing` (error) when self.md's header has no `standard:` or names
  any other URL. The message names the stamp command. An existing self.md without the line now
  fails lint until it is stamped.
- `stampStandard(text)`: pure; inserts `standard:` directly after `kind:`, every other byte
  unchanged, CRLF kept, idempotent, a wrong URL corrected in place, no header refused.
- `self-md stamp-standard --workspace DIR [--write] [--json]`: the backfill, dry run by default.
  The existing `stamp` command (read_by) is unchanged.

## 0.1.0

First release, extracted from Freedom's `freedom-self-md.mjs` and `freedom-read-by.mjs`.

- `lintSelf`: the self.md standard (facets, root files, header rules, one-screen body, person
  collections left outside `self/`), with every default overridable through an options argument.
- `collectReads`, `stampReadBy`, `undeclaredReaders`: derive `read_by` from readers' `reads:`
  declarations and find readers that never declared. Manifests may be named `.reads.json` as well
  as the original `.freedom-reads.json`.
- `self-md` CLI: `lint`, `stamp`, `undeclared`, `--json`, exit codes 0/1/2. `stamp --write` with no
  `--root` is refused. Unlike the origin CLI, `stamp` prints a cleared block instead of crashing on it.
- Zero dependencies; `readHeader` and `isMain` are carried in with behavior unchanged.
