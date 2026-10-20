# Changelog

## 0.1.0 (unreleased)

The first version of the standard and its package. A superobjective is a folder holding `superobjective.md` (YAML header and a body for people), `ratchet.jsonl` and `calibrations.jsonl`.

- `docs/FORMAT.md`: the standard, version "1": header, body, the two logs, roots and caps (up to three active per person and per company, ranked), pace, closing, migration, `serves`, and 22 lint codes.
- Every record is self-documenting: the `standard:` URL and a generated "What this file is" note, refused by `self-doc:missing` when absent.
- `superobjective lint` runs every gate; `show` lists the active ones ranked; `pace` reports ahead, on or behind and `--record` writes a calibration.
- Writers: `add`, `add-sign`, `meet-sign`, `raise`, `reword`, `lower`, `rerank`, `close`, `retire`, `visibility`. Every write appends a ratchet line holding the new state; `lower` needs an owner and their words.
- `migrate` reads the company single-file shape and the personal ranked shape into folders, losslessly.
- Exact-date parsing moved in from Freedom's `freedom-superobjective-date.mjs`, unchanged.
