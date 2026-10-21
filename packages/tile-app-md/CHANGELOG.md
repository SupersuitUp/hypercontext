# Changelog

## 0.1.0 (2026-10-21)

The first release. A tile app's `app.json` gets a written standard, <https://hypercontext.wiki/standards/tile-app/v1>, and a package that owns its shape.

- `tile-app-md lint [<dir>...]` checks every `app.json` in a workspace (`helm/tile-apps/`, then the older `tile-apps/` and `apps/` for an id not already found), a folder of apps, or one app, against the rules Supersuit's tile app host applies: the file is one JSON object, the folder name and id, title, kind, summary, a records app's fields, titleField, sort and where its records live, actions and the background, every reach against the runner's vocabulary, and the Helm's `about`. Each rule's source line is in docs/FORMAT.md. Plus the two codes every hypercontext record package shares, `self-doc:missing` and `self-doc:version`.
- `tile-app-md stamp [<dir>...] [--apply]` inserts `"standard"` as the first key by a minimal textual edit (the file's own indentation, spacing, line endings and final newline kept), upgrades the bare unversioned URL in place, and leaves a file that is not one object or names another standard alone. Idempotent.
- `--json` on both; exit codes 0 clean, 1 findings or pending, 2 usage.
- `standards/tile-app/v1.json` ships in the tarball and is exported as `MANIFEST`; tests prove its codes equal the lint's `CODES` table and that every code can be emitted.
- `test/host-proof.test.mjs` proves, against Supersuit's and the Helm's own readers, that an `app.json` carrying `"standard"` loads exactly as one without it.
