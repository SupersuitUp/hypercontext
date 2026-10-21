// Every finding `piece-md lint` can report: its level, what it means and how to fix it.
// This is the lint's own table. checkPiece and lint take each finding's level from here, so a
// level cannot drift from what the table says, and standards/piece/v1.json publishes the same
// table, which test/manifest.test.mjs proves.

/** @type {Record<string, {level: 'error'|'warn', means: string, fix: string}>} */
export const CODES = {
  'header:missing': { level: 'error', means: 'the piece.md has no YAML header, so none of the five questions is answered', fix: 'write the header from docs/FORMAT.md (pieceText writes a new one)' },
  'name:pattern': { level: 'error', means: 'the folder or file name is not YYYY-MM-DD-HHMM-slug', fix: 'rename it to YYYY-MM-DD-HHMM-slug, the moment it was made, and set id to match' },
  'kind:missing': { level: 'error', means: 'kind is missing or is not "piece"', fix: 'set kind: piece' },
  'self-doc:missing': { level: 'error', means: 'the record names no standard, the bare unversioned piece URL written before versions, or another kind\'s standard', fix: 'piece-md stamp <home> --apply adds or upgrades it; a record naming another kind\'s standard is not a piece, so move or fix it by hand' },
  'self-doc:version': { level: 'error', means: 'the record names a version of the piece standard this validator does not implement', fix: 'install the piece-md version that implements it, or rewrite the record to https://hypercontext.wiki/standards/piece/v1' },
  'context_version:missing': { level: 'error', means: 'context_version is missing', fix: 'set context_version: "1"' },
  'context_version:value': { level: 'error', means: 'context_version is not "1"', fix: 'set context_version: "1"' },
  'id:missing': { level: 'error', means: 'id is missing', fix: 'set id to the folder name (the file name without .md for a one-file piece)' },
  'id:mismatch': { level: 'error', means: 'id does not equal the folder or file name', fix: 'set id to the name, or rename the folder to the id' },
  'type:value': { level: 'error', means: 'type is missing or not one of the piece types', fix: 'set type to photo, screenshot, recording, video, image, document, note, deck or page' },
  'summary:missing': { level: 'error', means: 'summary is missing: what the piece is, in a line', fix: 'write summary' },
  'read_when:missing': { level: 'error', means: 'read_when is missing: when a reader should open this piece', fix: 'write read_when' },
  'audience:missing': { level: 'error', means: 'audience is missing: who the record is written for', fix: 'write audience' },
  'source:missing': { level: 'error', means: 'source is missing: who or what made the piece', fix: 'write source' },
  'as_of:date': { level: 'error', means: 'as_of is missing or not a YYYY-MM-DD date', fix: 'set as_of to the date the record was true' },
  'keep:value': { level: 'error', means: 'keep is missing or not keep, home or share', fix: 'have a person choose keep, home or share; never infer it' },
  'about:missing': { level: 'error', means: 'about is missing: the ids this piece is about', fix: 'set about to a list of ids' },
  'about:empty': { level: 'error', means: 'about is an empty list', fix: 'name at least one person, superproject or place the piece is about' },
  'taken:missing': { level: 'error', means: 'taken is missing', fix: 'set taken to a date, a date and time, or unknown' },
  'taken:value': { level: 'error', means: 'taken is not a date, a date and time, or unknown', fix: 'set taken to YYYY-MM-DD, YYYY-MM-DDTHH:MM, or unknown' },
  'taken_from:missing': { level: 'error', means: 'taken_from is missing: where the time in taken came from', fix: 'set taken_from to device, filename, file-time, stated, inferred or unknown' },
  'taken_from:value': { level: 'error', means: 'taken_from is not one of the time sources', fix: 'set taken_from to device, filename, file-time, stated, inferred or unknown' },
  'connections:missing': { level: 'error', means: 'connections is missing', fix: 'set connections to a list of links or ids; [] is allowed' },
  'connections:empty': { level: 'warn', means: 'connections is empty, so nothing links to this piece', fix: 'add a link to a person, a superproject or another piece' },
  'files:missing': { level: 'error', means: 'a media piece has no files list, or files is not a list', fix: 'add files: a row per file naming who is in it' },
  'file:target': { level: 'error', means: 'a file row names neither a path nor a link, or its link has no scheme', fix: 'give the row a path inside the folder or a link with a scheme' },
  'file:path': { level: 'error', means: 'a file row\'s path leaves the piece\'s folder', fix: 'use a path inside the folder, or a link for a file elsewhere' },
  'file:people': { level: 'error', means: 'a file row does not say who is in it', fix: 'add people: [] for nobody, or a {id, confirmed} per person' },
  'person:confirmed': { level: 'error', means: 'a person in a file row is not {id, confirmed: true|false}', fix: 'write each person as {id, confirmed: false} until a person confirms them' },
  'single:media': { level: 'error', means: 'a media piece is a bare .md instead of a folder', fix: 'move it to <name>/piece.md beside the media' },
  'single:outgrown': { level: 'error', means: 'a one-file text piece names a file of its own, so it is a folder now', fix: 'move it to <name>/piece.md beside that file' },
  'file:unlisted': { level: 'warn', means: 'a media file inside a piece\'s folder has no row', fix: 'add a files row for it, naming who is in it' },
  'piece:missing': { level: 'error', means: 'a folder named like a piece holds no piece.md', fix: 'write its piece.md, or rename the folder if it is not a piece' },
  'media:unrecorded': { level: 'error', means: 'a media file sits outside any piece', fix: 'make it a piece: a folder named for its moment holding the file and its piece.md' },
  'link:skipped': { level: 'warn', means: 'a symbolic link named like a piece was not checked, because a link is another tree\'s file', fix: 'check the piece where it lives; replace the link with the piece itself if it belongs here' },
};
