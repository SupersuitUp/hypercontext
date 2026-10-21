# Changelog

## 0.1.0 (unreleased)

The first version: what every hypercontext record package shares, in one copy.

- `readHeader`, `writeHeader`, `placeKey`: the YAML header codec, the union of the copies group-md, piece-md, superobjective and hypercontext each carried (group-md's was the only one with `placeKey`). Never throws on a header it does not understand; a write changes only the keys it was asked to change, every other byte kept, CRLF included. Their codec tests came with it.
- `readFlatHeader`: the forgiving reader self-md reads self.md with (booleans, folded values joined), kept under its own name because it is not the same reader.
- `STANDARD_BASE`, `bareStandard`, `standardUrl`, `versionOf`, `classifyStandard`: the versioned-standard rule. `stampStandard`: the byte-preserving stamp that adds `standard:` after `kind:` or upgrades a kind's bare URL in place, and never gives a headerless file a header.
- `validateManifest`, `assertManifest`: the shape of a standard's manifest (STANDARDS.md section 2), with every problem said in words. Header-key constraints are JSON Schema's: `const`, `enum`, `pattern`, `type`, `items`, `minLength`, `maxLength`, `minItems`, `maxItems`.
- No dependencies.
