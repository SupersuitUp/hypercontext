# Changelog

## 0.2.0

Every kind is now checked by its own package, so `check` reports more findings on the same workspace: a minor version, because it changes what is checked.

- `document` is checked and stamped by `@supersuit/document-md`, `checkpoint` by `@supersuit/checkpoint-md`, `hdsop` and `workflow-catalog` by `@supersuit/hdsop-md` (one run covers both, each finding filed under the kind it is about), `recurrent` by `@supersuit/recurrent-md`, `tile-app` by `@supersuit/tile-app-md`. None of the six raises `validator:missing` any more.
- This package no longer ships manifests: each kind's comes from its package. A kind with no package and no manifest is listed as missing rather than crashing `check`.
- `recurrent` and `tile-app` are stamped. A recurrent goes through `recurrent-md migrate`, which moves its body labels into the header as it names the standard; a tile app through `tile-app-md stamp`.
- `stamp` repeats each package's closing count and every record it skipped, with the reason, so a catalog with no header or a headerless document is named in the report rather than lost.
- A kind whose package run also checks another (hdsop checks the catalog) runs when only the other kind has records.

## 0.1.0

- The header codec, `versionOf`, `bareStandard` and the byte-preserving `stampStandard` now come from `@supersuit/hypercontext-core`, a dependency at `^0.1.0`; they are re-exported here unchanged.
- Every manifest an owner ships is checked against core's `validateManifest`: a bad one is `manifest:invalid` (error) in `check`, and `manifests` lists it as invalid, never publishes it, and exits 1.
- Each kind's package is found by node resolution and then beside this package in the hypercontext repository, so a checkout of that repository needs no `--packages`. `--packages` (or `HYPERCONTEXT_PACKAGES`) now means only that folder.
- The document manifest's `created` key is `type: string` with a date pattern; `date` is not a type a reader can check.

The first version: one check over a whole workspace.

- `hypercontext check` finds every record of fifteen kinds, judges the property they share (each names the standard it follows, `self-doc:missing` when not), counts the shared context keys, and runs each kind's own package (self-md, friend-md, group-md, superprojects, superobjective, piece-md, transcript-md). One row per kind. A kind no package checks yet is a warning saying so.
- `hypercontext stamp` is the backfill: each packaged kind through its own package's command, the rest by one byte-preserving edit. Conversations go through `transcript-md stamp-standard`, which takes its lock and checks each file's hash. Never gives a headerless file a header, never touches a recurrent or tile app, never follows a link.
- `hypercontext baseline` and `check --baseline`: known debt is tolerated, new debt fails, and the baseline only shrinks unless `--accept`.
- `hypercontext kinds` lists every kind, its standard and its package.
- Standards are versioned: a record names `https://hypercontext.wiki/standards/<kind>/v<N>`. The unversioned link is `self-doc:missing` and `stamp` upgrades it; a version the owner does not implement is `self-doc:version`. The implemented versions are read from the manifests the owner ships.
- Manifests (docs/STANDARDS.md): this package ships them for the six kinds no package owns; `hypercontext manifests --out <dir>` copies every kind's from its owner for a site to publish; `check --online` refuses a standard that does not open (`standard:unreachable`) or whose published manifest is not its owner's (`standard:drift`).
