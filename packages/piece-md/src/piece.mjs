// The piece shape: what a piece.md header must answer, and the findings when it does not.
// Every value arrives as a string, a list or a one-level map (see header.mjs); this file decides
// what each one means.
import { CODES } from './codes.mjs';

/** Things captured or generated. Always a folder, since there is always the original and its record. */
export const MEDIA_TYPES = ['photo', 'screenshot', 'recording', 'video', 'image'];
/** Written pieces. A one-file text piece may stay a bare .md until it gains a second file. */
export const TEXT_TYPES = ['document', 'note', 'deck', 'page'];
export const TYPES = [...MEDIA_TYPES, ...TEXT_TYPES];
export const KEEP = ['keep', 'home', 'share'];
/** Where the time in `taken` came from. */
export const TIME_SOURCES = ['device', 'filename', 'file-time', 'stated', 'inferred', 'unknown'];
/** File extensions counted as media, lowercase. */
export const MEDIA_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'heic', 'heif', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'avif',
  'mp3', 'm4a', 'wav', 'caf', 'aac', 'flac', 'ogg', 'opus', 'aiff',
  'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', '3gp',
  'pdf',
];
export const RECORD_FILE = 'piece.md';
/** The unversioned page: always the newest version of the piece standard, and the list of all of them. */
export const STANDARD_LATEST = 'https://hypercontext.wiki/standards/piece';
/** The versions of the piece standard this package implements. */
export const IMPLEMENTED_VERSIONS = [1];
/** The version a piece.md names as the standard it upholds, so an agent with no memory can look it up. */
export const STANDARD = `${STANDARD_LATEST}/v1`;
const VERSIONED = /^https:\/\/hypercontext\.wiki\/standards\/piece\/v(\d+)$/;

/** YYYY-MM-DD-HHMM-slug, or superwrite's YYYY-MM-DD-HHMMSS-slug. */
export const NAME = /^(\d{4}-\d{2}-\d{2})-(?:\d{4}|\d{6})-[a-z0-9][a-z0-9-]*$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim() !== '';
export const isMedia = (name) => MEDIA_EXTENSIONS.includes(name.split('.').pop().toLowerCase()) && name.includes('.');

/**
 * What is wrong with one piece.
 * @param {Record<string, any>} data the header
 * @param {{name: string, single?: boolean, members?: string[], hasHeader?: boolean}} ctx
 *   `name` is the folder name (or the file name without .md), `members` the files in the folder.
 * @returns {{level: 'error'|'warn', code: string, message: string}[]}
 */
export function checkPiece(data, { name, single = false, members = [], hasHeader = true }) {
  const out = [];
  // The level always comes from the code table, so a finding cannot disagree with the manifest.
  const add = (code, message) => out.push({ level: CODES[code].level, code, message });
  if (!hasHeader) { add('header:missing', `${RECORD_FILE} has no header, so none of the five questions is answered`); return out; }

  if (!NAME.test(name)) add('name:pattern', `"${name}" is not YYYY-MM-DD-HHMM-slug`);
  if (data.kind !== 'piece') add('kind:missing', data.kind ? `kind is "${data.kind}", expected "piece"` : 'kind: piece is missing');
  if (data.standard === undefined) add('self-doc:missing', `standard is missing: ${STANDARD}`);
  else if (data.standard === STANDARD_LATEST) add('self-doc:missing', `standard is the bare ${STANDARD_LATEST}, which predates versions; piece-md stamp --apply upgrades it to ${STANDARD}`);
  else if (VERSIONED.test(data.standard)) { if (!IMPLEMENTED_VERSIONS.includes(Number(data.standard.match(VERSIONED)[1]))) add('self-doc:version', `standard "${data.standard}" is a version this validator does not implement (it implements ${STANDARD})`); }
  else add('self-doc:missing', `standard "${data.standard}" is not the piece standard: ${STANDARD}`);
  if (data.context_version !== '1') add(data.context_version ? 'context_version:value' : 'context_version:missing', 'context_version must be "1"');
  if (!text(data.id)) add('id:missing', 'id is missing');
  else if (data.id !== name) add('id:mismatch', `id "${data.id}" does not equal the name "${name}"`);
  if (!TYPES.includes(data.type)) add('type:value', `type "${data.type ?? ''}" is not one of ${TYPES.join(', ')}`);
  for (const key of ['summary', 'read_when', 'audience', 'source']) if (!text(data[key])) add(`${key}:missing`, `${key} is missing`);
  if (!DATE.test(data.as_of ?? '')) add('as_of:date', 'as_of must be a date, YYYY-MM-DD');
  if (!KEEP.includes(data.keep)) add('keep:value', `keep "${data.keep ?? ''}" must be chosen: ${KEEP.join(', ')}`);

  if (!Array.isArray(data.about)) add('about:missing', 'about is missing: a list of the ids this piece is about');
  else if (!data.about.length) add('about:empty', 'about names nothing');

  if (data.taken === undefined) add('taken:missing', 'taken is missing (a date, a date and time, or unknown)');
  else if (!(DATE.test(data.taken) || DATETIME.test(data.taken) || data.taken === 'unknown')) add('taken:value', `taken "${data.taken}" is not a date, a date and time, or unknown`);
  if (data.taken_from === undefined) add('taken_from:missing', 'taken_from is missing: where the time came from');
  else if (!TIME_SOURCES.includes(data.taken_from)) add('taken_from:value', `taken_from "${data.taken_from}" is not one of ${TIME_SOURCES.join(', ')}`);

  if (!Array.isArray(data.connections)) add('connections:missing', 'connections is missing (an empty list is allowed)');
  else if (!data.connections.length) add('connections:empty', 'connections is empty, so nothing links to this piece');

  const media = MEDIA_TYPES.includes(data.type);
  const rows = data.files;
  if (rows === undefined ? media : !Array.isArray(rows)) add('files:missing', 'files is missing: a row per file naming who is in it');
  const listed = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isMap(row) || (!text(row.path) && !text(row.link))) { add('file:target', 'a file row names neither a path nor a link'); continue; }
    if (text(row.path)) {
      if (row.path.startsWith('/') || row.path.split('/').includes('..')) add('file:path', `path "${row.path}" leaves the piece's folder; use a link for a file elsewhere`);
      listed.add(row.path);
    } else if (!SCHEME.test(row.link)) add('file:target', `link "${row.link}" has no scheme`);
    if (!Array.isArray(row.people)) { add('file:people', `${row.path || row.link} does not say who is in it (people: [] for nobody)`); continue; }
    for (const p of row.people) {
      if (!isMap(p) || !text(p.id) || !['true', 'false'].includes(p.confirmed)) add('person:confirmed', `a person in ${row.path || row.link} needs {id, confirmed: true|false}`);
    }
  }

  if (single) {
    if (media) add('single:media', `a ${data.type} is always a folder holding ${RECORD_FILE}`);
    else if (listed.size) add('single:outgrown', `it names a file of its own, so it is a folder now: move it to ${name}/${RECORD_FILE}`);
  }
  const unlisted = members.filter((m) => isMedia(m) && !listed.has(m));
  if (unlisted.length) add('file:unlisted', `media with no row: ${unlisted.join(', ')}`);
  return out;
}

/** A piece as a plain object, with `confirmed` as a boolean. */
export function toPiece(data, { name, path, rel }) {
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const files = (Array.isArray(data.files) ? data.files : []).filter(isMap).map((row) => ({
    ...row,
    people: (Array.isArray(row.people) ? row.people : []).filter(isMap).map((p) => ({ ...p, confirmed: p.confirmed === 'true' })),
  }));
  const taken = typeof data.taken === 'string' ? data.taken : '';
  const date = DATE.test(taken.slice(0, 10)) ? taken.slice(0, 10) : (name.match(NAME)?.[1] ?? '');
  return {
    id: typeof data.id === 'string' ? data.id : name, type: data.type ?? '', date, taken, takenFrom: data.taken_from ?? '',
    summary: data.summary ?? '', about: list(data.about), connections: list(data.connections), keep: data.keep ?? '',
    source: data.source ?? '', files, path, rel,
  };
}
