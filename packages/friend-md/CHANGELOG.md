# Changelog

## 0.2.0 (2026-10-08)

- A workspace can add relationship facets: `people/README.md`, a `## Facets` section, one
  `- name: what it means` line each. `lint` no longer warns about a declared facet, and
  `declaredFacets(dir)` is exported. Freedom's people README already promised this.

## 0.1.0 (2026-10-04)

- Extract the existing friend.md JavaScript reader, writer, resolver, lint and
  record conversion into a standalone package.
- Include the standard-library Python companion and retain shared parity behavior.
- Add the `friend-md` CLI, explicit root mapping and a clean installed-tarball check.
- Retain the original Continental Works source license and extraction provenance.
