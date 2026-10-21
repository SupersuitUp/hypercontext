# Changelog

## 0.1.0 (2026-10-21)

The first release. A session checkpoint is one file per save under `checkpoints/`, its facts in a YAML header, and this package checks a folder of them. Shape and rules: <https://hypercontext.wiki/standards/checkpoint/v1>. Every rule is the one Supersuit's own writer and frontmatter validator already enforce; none is new.

- `checkpoint-md lint [<dir>]` checks every checkpoint directly in the folder (default `checkpoints/`): the `YYYY-MM-DD-HHMMSS-slug.md` name, `kind: checkpoint`, the standard it names, a summary of at most 120 characters, the twelve known keys and nothing else, a flat header of strings and lists of strings, one-line values of at most 400 characters, and slugs in `projects` and `people`.
- `checkpoint-md stamp [<dir>] [--apply]` adds a missing `standard:` directly after `kind:`, or upgrades the bare unversioned URL to `/v1` in place, every other byte unchanged. A dry run unless `--apply`; never creates a header; leaves another standard or version for a person.
- `--json` on both, and exit codes 0 clean, 1 findings or stamps pending or skipped, 2 usage.
- `standards/checkpoint/v1.json` ships in the tarball and is exported as `MANIFEST`. `CODES` is the lint's own table; tests prove the two are equal and that every code can actually be emitted.
- The library exports `lint`, `listCheckpoints`, `checkCheckpoint`, `stampPlan`, `stampStandard`, the constants (`STANDARD`, `KEYS`, `LIST_KEYS`, `SLUG_KEYS`, `SUMMARY_MAX`, `MAX_SCALAR`, `NAME`, `SLUG`), and the header codec from `@supersuit/hypercontext-core`.
