# Changelog

## 0.1.0

The first version: one check over a whole workspace.

- `hypercontext check` finds every record of fifteen kinds, judges the property they share (each names the standard it follows, `self-doc:missing` when not), counts the shared context keys, and runs each kind's own package (self-md, friend-md, group-md, superprojects, superobjective, piece-md, transcript-md). One row per kind. A kind no package checks yet is a warning saying so.
- `hypercontext stamp` is the backfill: each packaged kind through its own package's command, the rest by one byte-preserving edit. Never gives a headerless file a header, never touches a conversation, recurrent or tile app, never follows a link.
- `hypercontext baseline` and `check --baseline`: known debt is tolerated, new debt fails, and the baseline only shrinks unless `--accept`.
- `hypercontext kinds` lists every kind, its standard and its package.
