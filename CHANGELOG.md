# Changelog

## 0.1.0

The first version: one check over a whole workspace.

- `hypercontext check` finds every record of fifteen kinds, judges the property they share (each names the standard it follows, `self-doc:missing` when not), counts the shared context keys, and runs each kind's own package (self-md, friend-md, group-md, superprojects, superobjective, piece-md, transcript-md). One row per kind. A kind no package checks yet is a warning saying so.
- `hypercontext stamp` is the backfill: each packaged kind through its own package's command, the rest by one byte-preserving edit. Conversations go through `transcript-md stamp-standard`, which takes its lock and checks each file's hash. Never gives a headerless file a header, never touches a recurrent or tile app, never follows a link.
- `hypercontext baseline` and `check --baseline`: known debt is tolerated, new debt fails, and the baseline only shrinks unless `--accept`.
- `hypercontext kinds` lists every kind, its standard and its package.
- Standards are versioned: a record names `https://hypercontext.wiki/standards/<kind>/v<N>`. The unversioned link is `self-doc:missing` and `stamp` upgrades it; a version the owner does not implement is `self-doc:version`. The implemented versions are read from the manifests the owner ships.
- Manifests (docs/STANDARDS.md): this package ships them for the six kinds no package owns; `hypercontext manifests --out <dir>` copies every kind's from its owner for a site to publish; `check --online` refuses a standard that does not open (`standard:unreachable`) or whose published manifest is not its owner's (`standard:drift`).
