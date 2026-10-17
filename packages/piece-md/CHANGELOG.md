# Changelog

## 0.1.0 (2026-10-17)

The first release. A piece of a life's record (a photo, a recording, a video, a generated image, a document) is a folder whose `piece.md` answers the five hypercontext questions, and this package checks and searches a home of them.

- `piece-md lint [<home>]` reports every piece that fails the shape and counts the media no piece records, per folder. The home defaults to `documents/`.
- `piece-md find [<home>]` finds pieces by person, date range and type from the records alone, and never opens a media file. `--confirmed` counts a person only when someone confirmed them.
- `--json` on both, and exit codes 0 clean or found, 1 findings or none, 2 usage.
- The library exports the same: `lint`, `find`, `listPieces`, `checkPiece`, `toPiece`, `scan`, and the header codec.
