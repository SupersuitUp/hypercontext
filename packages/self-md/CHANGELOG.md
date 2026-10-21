# Changelog

## 0.2.0

self.md is self-documenting: it names the standard it follows.

- `STANDARD` is exported, with `STAMP_COMMAND`.
- `lintSelf` reports `self-doc:missing` (error) when self.md's header has no `standard:` or names
  any other URL. The message names the stamp command. An existing self.md without the line now
  fails lint until it is stamped.
- `stampStandard(text)`: pure; inserts `standard:` directly after `kind:`, every other byte
  unchanged, CRLF kept, idempotent, a wrong URL corrected in place, no header refused.
- `self-md stamp-standard --workspace DIR [--write] [--json]`: the backfill, dry run by default.
  The existing `stamp` command (read_by) is unchanged.

The link names the version, and the package ships the manifest behind it.

- `STANDARD` is now `https://hypercontext.wiki/standards/self/v1`. `STANDARD_LATEST` is the
  unversioned page, and `IMPLEMENTED_VERSIONS` is `[1]`.
- `self-doc:missing` also covers the bare unversioned URL (a record written before versions; the
  message names `stamp-standard --write` as the upgrade) and another kind's standard.
- New rule `self-doc:version` (error): self.md names a self version this package does not implement.
- `stampStandard` and `stamp-standard` upgrade the bare URL to `/v1` in place, byte-preserving and
  idempotent, and refuse to rewrite a self version they do not implement rather than downgrade it.
- `RULES`: one table of every rule lint can report, with level, meaning and fix. Lint takes its
  severities from it.
- `standards/self/v1.json` ships in the tarball (exported as `MANIFEST`, and importable as
  `@supersuit/self-md/standards/self/v1.json`). A drift test proves its `standard` equals
  `STANDARD` and its `codes` equal `RULES`.
- `classifyStandard(value)` is exported.

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
