# @supersuit/piece-md

*This package lives in the [hypercontext repository](https://github.com/SupersuitUp/hypercontext/tree/main/packages/piece-md), with every other record standard; issues and changes go there.*

**Every piece of a life's record is a folder whose `piece.md` says what it is.** A photo, a screenshot, a recording, a video, a generated image, a document: none of them can answer the five questions an AI needs before it can use them (About what? True as of when? Says who? Who may see it? Connected to what?). `piece.md` answers them in writing, beside the original. This package checks a folder of pieces against that shape and finds pieces without opening a single pixel or waveform.

It is one record type in the [hypercontext](https://hypercontext.wiki) family, beside [`@supersuit/friend-md`](https://www.npmjs.com/package/@supersuit/friend-md) for people and [`@supersuit/group-md`](https://www.npmjs.com/package/@supersuit/group-md) for groups. Why a folder: <https://hypercontext.wiki/every-piece-is-a-folder>. The full format: [docs/FORMAT.md](docs/FORMAT.md).

```
documents/2026-06-14-1812-nai-nai-at-the-lake/
  piece.md        the record: the five answers, then what it is in plain words
  original.heic   the thing itself, never edited
```

## Use

```bash
npx @supersuit/piece-md lint documents
npx @supersuit/piece-md find documents --person nai-nai --from 2026-06-01 --to 2026-06-30
npx @supersuit/piece-md stamp documents --apply
npx @supersuit/piece-md record documents --slug reunion-dinner --at 2026-06-14T20:05 --summary "Dinner after the lake." --read-when "looking for the June reunion dinner" --about june-reunion --source "the operator's phone camera" IMG_0001.jpg IMG_0002.mov
```

Zero dependencies, Node 20 or later.

## Commands

```
piece-md lint [<home>] [--json]
piece-md find [<home>] [--person <id>] [--confirmed] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type <type>] [--json]
piece-md stamp [<home>] [--apply] [--json]
piece-md record <home> --slug <slug> [--at <iso>] --summary <s> --read-when <s> --about <id,id> --source <s>
         [--type <type>] [--keep keep|home|share] [--audience <s>] [--taken-from <s>] [--connection <link>]...
         [--copy | --in-place] <files...> [--json]
```

`<home>` defaults to `documents/` in the current folder.

**lint** checks every piece, at any depth under the home, and counts the media files no piece records, per folder:

```
$ piece-md lint documents
unrecorded  media/raw  2
2 errors, 0 warnings, 2 pieces, 2 unrecorded media
[exit 1]
```

A clean home prints `clean: 2 pieces, 0 unrecorded media` and exits 0. Each failing rule is one line: `error  keep:value  2026-06-14-1812-nai-nai-at-the-lake  keep "public" must be chosen: keep, home, share`.

**find** answers from the records alone. A person matches when the piece is `about` them or a file row names them; `--confirmed` counts a file row only when someone confirmed the face. Dates are inclusive, on when the piece was taken (the name's date when that is unknown).

```
$ piece-md find documents --person nai-nai
2026-06-14-1812-nai-nai-at-the-lake  photo  2026-06-14  Nai Nai at the lake, the evening before the reunion.
[exit 0]
```

**stamp** makes every `piece.md` name the standard version it upholds: it adds a missing `standard:`, and upgrades the bare unversioned URL that 0.2.0 wrote to `/v1`, in place, every other byte unchanged. It is a dry run that lists the changes unless `--apply`. It never gives a file with no header a header, and never rewrites a record naming another standard; those are listed as skipped.

```
$ piece-md stamp documents
would upgrade  calls/2026-07-02-0930-lease-call/piece.md
1 to stamp, 1 already current, 0 skipped
[exit 1]
```

**record** files media as a piece in one call, so a tool that saves a photo, a clip or a screenshot never hand-builds a piece folder. It makes `<home>/YYYY-MM-DD-HHMM-<slug>/`, moves the files in and writes a `piece.md` that lints clean. Called again for the same moment, it adds the new files to that piece's rows and changes nothing else but `as_of`; a file the piece already lists changes nothing at all. It never overwrites: a name already in the folder is refused, and every check runs before any file moves, so a refusal leaves the disk as it was.

```
$ piece-md record documents --slug reunion-dinner --at 2026-06-14T20:05 --summary "Dinner after the lake." \
    --read-when "looking for the June reunion dinner" --about june-reunion --source "the operator's phone camera" \
    documents/media/raw/IMG_0001.jpg documents/media/raw/IMG_0002.mov
added  2026-06-14-2005-reunion-dinner/IMG_0001.jpg
added  2026-06-14-2005-reunion-dinner/IMG_0002.mov
created 2026-06-14-2005-reunion-dinner/piece.md: 2 added, 0 already recorded
[exit 0]
```

- `--at` names the moment. Without it, the first file's modification time is used and `taken_from` says `file-time`; with it, `taken_from` is `stated` unless `--taken-from` says otherwise.
- `--copy` leaves the originals where they were. `--in-place` records a file outside the home where it sits, as a `file://` link row (the format allows a file elsewhere only as a link); a file inside the home is refused, because lint would still count it unrecorded.
- A new piece needs `--summary`, `--read-when`, `--about` and `--source`, so what it writes passes lint. `--type` defaults from the first file (audio a `recording`, video a `video`, a PDF a `document`, anything else a `photo`: say `--type screenshot` for a screenshot). `--keep` defaults to `keep`, the tightest scope, and `--audience` to `self`.
- `--json` prints `{dir, pieceMd, files, created, added}`: `files` is where each given file is now, in order, so the caller can rewrite its links.

Exit codes: 0 clean, found, recorded, or nothing left to stamp; 1 findings, nothing found, stamps pending or skipped, or a record refused (nothing changed); 2 usage.

## Library

```js
import { lint, find, listPieces, checkPiece, recordPiece } from '@supersuit/piece-md';

lint('documents');                                   // { findings, pieces, unrecorded }
find('documents', { person: 'nai-nai', type: 'photo' });
checkPiece(header, { name: '2026-06-14-1812-nai-nai-at-the-lake' });   // findings for one header
pieceText({ id, type: 'photo', /* ... */ }, body);   // a new piece.md, stamped with kind and standard
stampStandard(existingText);                         // add or upgrade `standard:`, nothing else changes
MANIFEST;                                            // the standard as data: standards/piece/v1.json
```

### Recording media from a tool

```js
import { recordPiece, RecordRefused } from '@supersuit/piece-md';

const { dir, pieceMd, files, created, added } = recordPiece({
  home: '/path/to/documents',               // the documents folder the piece belongs in
  slug: 'reunion-dinner',                   // kebab words
  at: '2026-06-14T20:05',                   // a Date or an ISO time; omitted, the first file's mtime
  files: ['/path/to/inbox/IMG_0001.jpg'],   // absolute paths
  fields: {
    summary: 'Dinner after the lake.', read_when: 'looking for the June reunion dinner',
    about: ['june-reunion'], source: "the operator's phone camera",
    // optional: type, keep ('keep'), audience ('self'), taken_from, connections ([]),
    // people: { '/path/to/inbox/IMG_0001.jpg': [{ id: 'nai-nai', confirmed: true }] }  (keyed by path or file name)
  },
  // move: true (default) moves each file in; copy: true copies it; move: false records a file
  // outside the home where it sits, as a file:// link row
});
```

The same rules as the command: a new piece is written through `pieceText`, so it names `standard: https://hypercontext.wiki/standards/piece/v1`; an existing piece gains rows; a file already listed changes nothing; a name already in the folder, a missing answer, or a record naming another standard throws `RecordRefused` before anything on disk changes. An ISO time with no zone is the wall clock as written; a `Date`, or a time with a zone, is read in the machine's local time.

## The standard, as data

Every `piece.md` names `standard: https://hypercontext.wiki/standards/piece/v1`. Beside that page is its machine-readable twin, `v1.json`, which this package ships as [`standards/piece/v1.json`](standards/piece/v1.json) and exports as `MANIFEST`: the header keys a record must carry and the constraints a reader can check without installing anything, the exact commands to check and backfill, and **every** code `lint` can report with its level, what it means and how to fix it. The tests prove the manifest says exactly what `lint` enforces.

The two codes every hypercontext record package shares:

- `self-doc:missing` (error): no standard, the bare unversioned URL (written before versions; `stamp` upgrades it), or another kind's standard.
- `self-doc:version` (error): a version of the piece standard this package does not implement.

## What it refuses

- A record that is only the camera's metadata. `taken` is one of five answers.
- A face without `confirmed`. A model may name someone; only a person confirms them.
- A scope that was not chosen: `keep` must be `keep`, `home` or `share`.
- A photo or recording as a bare file. Media is always a folder.
- A record that does not name its standard version. Every `piece.md` carries `standard: https://hypercontext.wiki/standards/piece/v1`, so a reader with no memory of this format can find it.
- Following a symbolic link. A link is another tree's file: one named like a piece is reported as `link:skipped`, never read.

It opens only `.md` files. Media is seen by its name in a directory listing; `record` moves or copies a file whole and never reads it.

## Develop

```bash
npm test               # the tests
npm run mutation-check # every rule removed once; its test must go red
npm run install-proof  # pack, install outside the repo, run every documented command
```

Releases are a tag push through GitHub Actions with npm trusted publishing, from the hypercontext repository: bump the version, write the CHANGELOG entry, commit, then `git tag piece-md@X.Y.Z && git push origin piece-md@X.Y.Z`.

MIT
