# The piece format

A **piece** is anything made or captured in a life: a photo, a screenshot, a recording, a video, a generated image, a document, a deck, a published page. Every piece is a folder, named for its moment, whose `piece.md` answers the five hypercontext questions: About what? True as of when? Says who? Who may see it? Connected to what? Canon: <https://hypercontext.wiki/every-piece-is-a-folder>.

## The folder

```
<home>/2026-06-14-1812-nai-nai-at-the-lake/
  piece.md        the record, and the front door
  original.heic   the thing itself, never edited
  crop-album.jpg  anything made from it later
```

- **The name is `YYYY-MM-DD-HHMM-slug`** (or `YYYY-MM-DD-HHMMSS-slug`, which superwrite already writes). The slug is lowercase letters, digits and dashes. The date in the name never changes.
- **The home** is the folder pieces live under, `documents/` by default. A piece may sit at any depth beneath it (`documents/collections/inspo/<piece>/`). Everything inside a piece's folder belongs to that piece; a piece never contains another piece.
- **One folder per moment.** The 35 screenshots of one call, or the photos of one night, are one piece with a row per file.
- **A record is committed even when its media is not.** A row may name a file that is not on disk.
- **A one-file text piece may be a bare `.md`** (`<home>/2026-10-17-0900-a-note.md`) with the same header. It becomes a folder the moment it gains a file of its own. Media is always a folder.
- **A piece that lives elsewhere** (YouTube, Photos, Drive, a published page) still gets its folder, holding `piece.md` with a `link` row. Nothing is copied in just to be recorded.

## The header

```yaml
---
kind: piece
context_version: "1"
standard: "https://hypercontext.wiki/standards/piece/v1"   # the standard version this file upholds
id: 2026-06-14-1812-nai-nai-at-the-lake      # equals the folder name
type: photo                                   # see below
summary: "Nai Nai at the lake, the evening before the reunion."
read_when: "looking for photos of Nai Nai or the June reunion"
as_of: 2026-06-15                             # when this record was true
keep: home                                    # who may see it: keep | home | share
audience: self                                # who the record is written for
about: [nai-nai, june-reunion]                # About what? ids of people, superprojects, places
taken: "2026-06-14T18:12"                     # True as of when? a date, a date and time, or unknown
taken_from: device                            # where that time came from
source: "the operator's phone camera"         # Says who? who or what made it
connections: ["../../people/nai-nai/friend.md"]   # Connected to what? links or ids (may be empty, which warns)
files:                                        # a row per file: a path in the folder, or a link out
  - {path: original.heic, people: [{id: nai-nai, confirmed: true}]}
  - {link: "https://youtu.be/abc123", people: []}
---

What it is, in plain words. For a written piece, the body is the writing itself.
```

| Key | Rule |
| --- | --- |
| `standard` | always `https://hypercontext.wiki/standards/piece/v1`, so an agent with no memory of this format can open the rules from the file itself. A version's meaning never changes once published; `https://hypercontext.wiki/standards/piece` (no version) is the latest and lists them all. Missing, the bare unversioned URL, or another kind's standard is `self-doc:missing`; a version this package does not implement is `self-doc:version`. `piece-md stamp --apply` adds or upgrades it |
| `type` | `photo`, `screenshot`, `recording`, `video`, `image` (media), or `document`, `note`, `deck`, `page` (written) |
| `keep` | chosen, never inferred. A piece showing other people starts at the tightest scope until someone chooses |
| `taken_from` | `device`, `filename`, `file-time`, `stated`, `inferred`, `unknown`. A camera timestamp is one answer of five, never the whole record |
| `files` | required for media. Each row has `path` (inside the folder: no `/` start, no `..`) or `link` (anything with a scheme), and `people` (a list, `[]` for nobody) |
| `people` | each person is `{id, confirmed: true\|false}`. A face named by a model is `confirmed: false` until a person confirms it |

**Writing one.** A tool that saves media files it as a piece with `recordPiece` (or `piece-md record`): it makes the folder from the moment and a slug, moves the files in, and writes the header above, or adds rows to the piece when that moment already has one. A file stays where it is only as a `link` row (`file://...`), because a `path` row never leaves the folder; and never for a file inside the home, which lint would still count unrecorded. It never overwrites a file a piece already holds.

Records made by other tools are linked, never restated: a generated image's `.recipe.json` is a row in `files`, and a recording's transcript is a connection.

## What the checker reports

`piece-md lint <home>` reports, per piece, every rule above that fails, and every media file (by extension) that no piece holds, counted per folder. Errors exit 1. Warnings: `connections:empty`, `file:unlisted` for media inside a piece's folder that no row names, and `link:skipped` for a symbolic link named like a piece, which is another tree's file and is never followed.

Every code, with its level, meaning and fix, is in [`standards/piece/v1.json`](../standards/piece/v1.json), the manifest published at `https://hypercontext.wiki/standards/piece/v1.json`.
