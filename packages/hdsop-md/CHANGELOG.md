# Changelog

## 0.1.1 (2026-10-21)

- `stamp` gives a headerless `CATALOG.md` the minimal header (`kind: workflow-catalog` and `standard:`, byte for byte what Supersuit's catalog writer creates a catalog with) when the Supersuit beside it keeps catalog headers, which it does since freedom-dev 885ae79f3. It asks that Supersuit's own catalog writer, found in the workspace holding the folder and at `~/.freedom/plugin` (or named by `HDSOP_MD_SUPERSUIT`, `none` for no Supersuit), and skips the catalog as before when any writer refuses or cannot be loaded. The loss check, and so lint's `catalog:not-writable`, no longer counts a header as lines the writer would drop. New exports: `catalogHeaderAllowed`, `supersuitWriters`, `writerKeepsHeader`, `splitCatalogHeader`, `CATALOG_HEADER`.

## 0.1.0 (2026-10-21)

The first package for the two records a workflows folder holds, which until now were checked only for naming their standard, by `@supersuit/hypercontext`.

- **hdsop**, a workflow map (`workflows/<slug>.md`), <https://hypercontext.wiki/standards/hdsop/v1>: the keys Supersuit's `workflow` frontmatter kind defines, each typed as it types them; `doc_status` closed to unmapped, drafting and proven; a title required, since without one Supersuit's catalog does not count the file as a map; a map no catalog row names; two maps claiming one id.
- **workflow-catalog**, `workflows/CATALOG.md`, <https://hypercontext.wiki/standards/workflow-catalog/v1>: every row rule Supersuit's catalog check applies (closed Doc and Automation words, one row per workflow, a map link that points at a file, proven needs a map, automation names what automates it, judgment-core names nothing), and a warning when Supersuit's catalog writer would refuse to rewrite the file.
- `hdsop-md lint [<workflows-dir>] [--json]` and `hdsop-md stamp [<workflows-dir>] [--apply] [--json]`. Stamp adds or upgrades `standard:` in place, every other byte unchanged, and never gives a file a header. That includes CATALOG.md, because Supersuit's catalog writer refuses to rewrite a catalog that has one (proven in `test/supersuit.test.mjs`).
- `standards/hdsop/v1.json` and `standards/workflow-catalog/v1.json` ship in the tarball, built from the code and exported as `MANIFESTS`, keyed by kind; each one's codes equal that kind's `CODES` table.
