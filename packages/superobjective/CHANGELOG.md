# Changelog

## 0.1.0 (unreleased)

- The header codec now comes from `@supersuit/hypercontext-core` (one copy for every record package), a dependency at `^0.1.0`, instead of a copy of piece-md's. Behaviour is unchanged.

The first version of the standard and its package. A superobjective is a folder holding `superobjective.md` (YAML header and a body for people), `ratchet.jsonl` and `calibrations.jsonl`.

- `docs/FORMAT.md`: the standard, version "1": header, body, the two logs, roots and caps (up to three active per person and per company, ranked), pace, closing, migration, `serves`, and 23 lint codes.
- Every record is self-documenting: the `standard:` URL and a generated "What this file is" note, refused by `self-doc:missing` when absent.
- `superobjective lint` runs every gate; `show` lists the active ones ranked; `pace` reports ahead, on or behind and `--record` writes a calibration.
- Writers: `add`, `add-sign`, `meet-sign`, `raise`, `reword`, `lower`, `rerank`, `close`, `retire`, `visibility`. Every write appends a ratchet line holding the new state; `lower` needs an owner and their words.
- `migrate` reads the company single-file shape and the personal ranked shape into folders, losslessly.
- Exact-date parsing moved in from Freedom's `freedom-superobjective-date.mjs`, unchanged.
- The standard link names its version: `STANDARD` is `https://hypercontext.wiki/standards/superobjective/v1`, every writer (calibrations included) stamps it, and the "What this file is" note names it. `STANDARD_LATEST` is the bare page that lists every version.
- Lint: `self-doc:missing` also reports the bare, unversioned URL (a record written before versions), and the new `self-doc:version` (error) reports a version this package does not implement. 23 codes.
- `superobjective stamp [<home>...] [--apply] [--json]` (and `stamp()` in the library): a dry run by default; upgrades or inserts `standard:` and refreshes the note through the package's own write path, byte for byte elsewhere, with no ratchet line, idempotent, and never downgrading a future version.
- `standards/superobjective/v1.json`, exported as `MANIFEST`: the standard as data (header constraints, validator commands, every code with its level, meaning and fix). A test proves it equals `STANDARD` and `CODES`.
