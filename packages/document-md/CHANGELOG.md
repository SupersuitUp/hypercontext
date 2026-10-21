# Changelog

## 0.1.0 (2026-10-21)

The first release. A document is a markdown file directly inside a `documents/` folder (a workspace's or a superproject's) whose YAML header names its standard and who it is for. This package checks a folder of them and stamps the standard into those that predate it. Shape and rules: <https://hypercontext.wiki/standards/document/v1>.

- `document-md lint [<home>...]` reports every document that fails the shape, with exit codes 0 clean (or warnings only), 1 on an error, 2 on usage. The home defaults to the current folder.
- `document-md stamp [<home>...] [--apply]` adds a missing `standard:` as the header's first line, or upgrades the bare unversioned URL in place, every other byte unchanged. A dry run unless `--apply`. It never gives a headerless document a header.
- `--json` on both.
- Codes: `header:missing`, `self-doc:missing`, `self-doc:version`, `audience:missing`, `name:pattern` (warn), `kind:value`, `status:value`, `narrator:value`, `theme:value`, `comments:value`, `comments_visible:value`, `created:date`, `people:slug`, `state:map`, `value:map`, `value:string`, `value:shape`, `value:line`. Every rule is one Supersuit already enforces or writes; the README names the source line of each.
- `standards/document/v1.json` ships in the tarball and is exported as `MANIFEST`, with this package as its validator. It replaces the `validator: null` manifest `@supersuit/hypercontext` shipped for this kind, and keeps its two required keys (`standard`, `audience`) and its closed lists.
- A bare one-file piece (`kind: piece`) in a documents folder is passed over and counted, never checked as a document.
- The header codec is `@supersuit/hypercontext-core`, a dependency at `^0.1.0`.
