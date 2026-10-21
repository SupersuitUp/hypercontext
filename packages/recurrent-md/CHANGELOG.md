# Changelog

## 0.1.0 (2026-10-21)

The first version. Shape and rules: <https://hypercontext.wiki/standards/recurrent/v1>.

- `recurrent-md lint [<dir>] [--json]` checks every recurrent in a folder (default `recurrents/`), read the way Supersuit's reader reads it: the YAML header over the `**Label:**` body lines. Codes: `self-doc:missing`, `self-doc:version`, `kind:missing`, `labels:legacy` (a warning: still label form), `method:missing`, `cadence:missing`, `cadence:value`, `status:value`, `last_run:value`.
- `recurrent-md migrate [<dir>] [--apply] [--json]` moves every label Supersuit reads into the header, under the key and in the form its reader expects, removes it from the body, and stamps `kind: recurrent` and `standard:`. Every other byte stays. A label it cannot place stays in the body and is listed. Idempotent; a dry run unless `--apply`.
- `standards/recurrent/v1.json` ships in the tarball and is exported as `MANIFEST`, with `CODES` as the lint's own table; tests prove the two equal.
- The library: `checkRecurrent`, `lint`, `migratePlan`, `readRecurrent`, `cadenceDays`, `scanLabels`, `parseLabel`, and the constants.
- `test/reader-proof.test.mjs` imports Supersuit's real `freedom-recurrents.mjs` and proves a migrated file reads exactly as its label form did, and that `setRecurrent` on it writes to the header. It runs wherever freedom-dev is on disk and is skipped, saying so, where it is not.
