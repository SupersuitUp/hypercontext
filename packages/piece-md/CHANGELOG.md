# Changelog

## 0.3.0 (2026-10-20)

- The header codec now comes from `@supersuit/hypercontext-core` (one copy for every record package), a dependency at `^0.1.0`; this package's own copy and its codec tests moved there. Behaviour is unchanged.

The standard link now names its version, and the standard itself ships as data. Shape and rules: <https://hypercontext.wiki/standards/piece/v1>.

**Breaking, for anyone matching lint codes:** `standard:missing` and `standard:value` are gone. They are now the two codes every hypercontext record package shares:

- `self-doc:missing` (error): the record names no standard, the bare `https://hypercontext.wiki/standards/piece` URL that 0.2.0 wrote (its message says it predates versions and that `stamp` upgrades it), or another kind's standard.
- `self-doc:version` (error): the record names a version of the piece standard this validator does not implement. Only `v1` is implemented.

Also:

- `STANDARD` is `https://hypercontext.wiki/standards/piece/v1`, and `pieceText` stamps it. `STANDARD_LATEST` (the unversioned page) and `IMPLEMENTED_VERSIONS` are exported.
- `piece-md stamp [<home>] [--apply] [--json]` backfills a home: it adds a missing `standard:` and upgrades the bare URL in place, every other byte unchanged. A dry run unless `--apply`. Exit 0 when nothing is left to do, 1 when changes are pending or a record was skipped.
- `stampStandard(text)` upgrades the bare URL in place (quotes and comment kept), is idempotent, and **no longer gives a headerless file a header**: it returns the text unchanged. `stampPlan(text)` says what a stamp would do (`added`, `upgraded`, `current`, `no-header`, `other`).
- `standards/piece/v1.json` ships in the tarball and is exported as `MANIFEST`: the header keys lint requires, their constraints, the validator commands, and every code lint can report with its level, meaning and fix. `CODES` is the lint's own table; tests prove the two are equal and that every code can actually be emitted.
- Fixed: `lint` crashed with ENOENT on a dangling symbolic link named like a one-file piece. A link is another tree's file, so it is never followed: one named like a piece is reported as `link:skipped` (a warning), and any other link is passed over.

## 0.2.0 (2026-10-17)

Every piece.md now names the standard it upholds, so an agent with no memory of the format can open the rules from the file itself.

- `standard: https://hypercontext.wiki/standards/piece` is part of the header. `lint` reports `standard:missing` and `standard:value` (naming another standard) as errors.
- `pieceText(fields, body)` writes a new piece.md with `kind`, `context_version` and `standard` stamped first, whatever the caller passed for them.
- `stampStandard(text)` adds `standard:` to an existing record and leaves every other byte alone, for backfills.
- `STANDARD` is exported.

## 0.1.0 (2026-10-17)

The first release. A piece of a life's record (a photo, a recording, a video, a generated image, a document) is a folder whose `piece.md` answers the five hypercontext questions, and this package checks and searches a home of them.

- `piece-md lint [<home>]` reports every piece that fails the shape and counts the media no piece records, per folder. The home defaults to `documents/`.
- `piece-md find [<home>]` finds pieces by person, date range and type from the records alone, and never opens a media file. `--confirmed` counts a person only when someone confirmed them.
- `--json` on both, and exit codes 0 clean or found, 1 findings or none, 2 usage.
- The library exports the same: `lint`, `find`, `listPieces`, `checkPiece`, `toPiece`, `scan`, and the header codec.
