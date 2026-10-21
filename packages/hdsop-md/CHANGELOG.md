# Changelog

## 0.1.0 (2026-10-21)

The first package for the two records a workflows folder holds, which until now were checked only for naming their standard, by `@supersuit/hypercontext`.

- **hdsop**, a workflow map (`workflows/<slug>.md`), <https://hypercontext.wiki/standards/hdsop/v1>: the keys Supersuit's `workflow` frontmatter kind defines, each typed as it types them; `doc_status` closed to unmapped, drafting and proven; a title required, since without one Supersuit's catalog does not count the file as a map; a map no catalog row names; two maps claiming one id.
- **workflow-catalog**, `workflows/CATALOG.md`, <https://hypercontext.wiki/standards/workflow-catalog/v1>: every row rule Supersuit's catalog check applies (closed Doc and Automation words, one row per workflow, a map link that points at a file, proven needs a map, automation names what automates it, judgment-core names nothing), and a warning when Supersuit's catalog writer would refuse to rewrite the file.
- `hdsop-md lint [<workflows-dir>] [--json]` and `hdsop-md stamp [<workflows-dir>] [--apply] [--json]`. Stamp adds or upgrades `standard:` in place, every other byte unchanged, and never gives a file a header. That includes CATALOG.md, because Supersuit's catalog writer refuses to rewrite a catalog that has one (proven in `test/supersuit.test.mjs`).
- `standards/hdsop/v1.json` and `standards/workflow-catalog/v1.json` ship in the tarball, built from the code and exported as `MANIFESTS`, keyed by kind; each one's codes equal that kind's `CODES` table.
