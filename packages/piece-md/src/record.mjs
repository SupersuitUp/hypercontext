// Recording media as a piece in one call, so a tool that saves a photo, a clip or a screenshot
// files it the moment it exists instead of each tool hand-building piece folders.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, renameSync, copyFileSync, unlinkSync, constants } from 'node:fs';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHeader, writeHeader } from '@supersuit/hypercontext-core';
import { KEEP, TIME_SOURCES, TYPES, RECORD_FILE, STANDARD } from './piece.mjs';
import { pieceText } from './write.mjs';

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const AUDIO = ['mp3', 'm4a', 'wav', 'caf', 'aac', 'flac', 'ogg', 'opus', 'aiff'];
const VIDEO = ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', '3gp'];
const pad = (n) => String(n).padStart(2, '0');
const text = (v) => typeof v === 'string' && v.trim() !== '';

/** A refusal: the call asked for something the format or the disk does not allow. Nothing was changed. */
export class RecordRefused extends Error {
  constructor(message) { super(message); this.name = 'RecordRefused'; }
}
const refuse = (message) => { throw new RecordRefused(message); };

/** A local wall-clock time as {date: YYYY-MM-DD, hhmm, taken: YYYY-MM-DDTHH:MM}. */
function wall(at) {
  let y, mo, d, h, mi;
  const m = typeof at === 'string' ? at.match(WALL) : null;
  if (m) [, y, mo, d, h, mi] = m;   // a time with no zone is the wall clock as written
  else {
    const date = at instanceof Date ? at : typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(at) ? new Date(at) : null;
    if (!date || Number.isNaN(date.getTime())) refuse(`at "${at}" is not a Date or an ISO time (YYYY-MM-DDTHH:MM)`);
    [y, mo, d, h, mi] = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), pad(date.getHours()), pad(date.getMinutes())];
  }
  return { date: `${y}-${mo}-${d}`, hhmm: `${h}${mi}`, taken: `${y}-${mo}-${d}T${h}:${mi}` };
}

/** The type a file suggests when the caller names none: audio, video, a PDF, else a photo. */
function typeOf(file) {
  const ext = file.split('.').pop().toLowerCase();
  if (AUDIO.includes(ext)) return 'recording';
  if (VIDEO.includes(ext)) return 'video';
  if (ext === 'pdf') return 'document';
  return 'photo';
}

const inside = (dir, p) => { const r = relative(dir, p); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };
const people = (map, src, name) => {
  const list = map?.[src] ?? map?.[name] ?? [];
  return list.map((p) => ({ id: p.id, confirmed: p.confirmed === true || p.confirmed === 'true' }));
};

function place(src, dest, copy) {
  if (copy) { copyFileSync(src, dest, constants.COPYFILE_EXCL); return; }
  try { renameSync(src, dest); } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    copyFileSync(src, dest, constants.COPYFILE_EXCL);   // another volume: copy, then remove the original
    unlinkSync(src);
  }
}

/**
 * Record media as a piece, creating it or adding to it.
 *
 * The piece is `<home>/<YYYY-MM-DD-HHMM>-<slug>/piece.md`. When that piece already exists the
 * files are added to its `files:` rows and nothing else in the record changes except `as_of`;
 * a file it already lists changes nothing, so a tool can call this once per clip of one moment.
 * Every check runs before anything moves: a refusal leaves the disk exactly as it was.
 *
 * @param {object} o
 * @param {string} o.home the documents folder the piece belongs in (must exist)
 * @param {string} o.slug kebab words
 * @param {Date|string} [o.at] when the moment was; omitted, the first file's modification time
 * @param {string[]} o.files absolute paths of the media
 * @param {object} [o.fields] summary, read_when, source, about (ids) are required for a new piece;
 *   type (inferred from the first file), keep ('keep'), audience ('self'), connections ([]),
 *   taken_from ('stated' with `at`, 'file-time' without), and people: {path or file name → [{id, confirmed}]}
 * @param {boolean} [o.move=true] move each file into the piece. false records a file where it sits,
 *   which the format allows only as a link row, so only for a file outside the home
 * @param {boolean} [o.copy=false] copy each file in and leave the original
 * @param {Date} [o.now] the day the record is true as of
 * @returns {{dir: string, pieceMd: string, files: string[], created: boolean, added: string[]}}
 *   `files` is where each given file now is, in order, so a caller can rewrite its links
 */
export function recordPiece({ home, slug, at, files, fields = {}, move = true, copy = false, now = new Date() } = {}) {
  if (!text(home) || !existsSync(home) || !statSync(home).isDirectory()) refuse(`home "${home}" is not a directory`);
  if (!text(slug) || !SLUG.test(slug)) refuse(`slug "${slug}" must be lowercase kebab words (a-z, 0-9, -)`);
  if (!Array.isArray(files) || !files.length) refuse('files names nothing to record');
  for (const f of files) {
    if (!text(f) || !isAbsolute(f)) refuse(`"${f}" is not an absolute path`);
    if (!existsSync(f)) refuse(`${f} does not exist`);
  }
  const when = at !== undefined ? wall(at) : wall(statSync(files[0]).mtime);
  const name = `${when.date}-${when.hhmm}-${slug}`;
  const dir = join(home, name), pieceMd = join(dir, RECORD_FILE);

  let existing = null;
  if (existsSync(pieceMd)) {
    existing = readFileSync(pieceMd, 'utf8');
    const { data, raw } = readHeader(existing);
    if (raw === '') refuse(`${pieceMd} has no header to add to; give it one first`);
    if (data.standard !== STANDARD) refuse(`${pieceMd} names standard "${data.standard ?? ''}", not ${STANDARD}; piece-md stamp, or a person, settles it first`);
  }
  const rows = existing ? (Array.isArray(readHeader(existing).data.files) ? readHeader(existing).data.files : []) : [];
  const listed = new Set(rows.map((r) => r?.path ?? r?.link).filter(Boolean));

  // Plan every file before touching any.
  const plan = [], names = new Set();
  for (const src of files) {
    if (inside(dir, src)) {   // already in the piece: record it in place
      const rel = relative(dir, src).split(sep).join('/');
      plan.push({ src, dest: src, row: listed.has(rel) ? null : { path: rel, people: people(fields.people, src, rel) } });
      continue;
    }
    if (!move && !copy) {
      if (inside(home, src)) refuse(`${src} is inside the home but outside the piece: recorded where it sits it is a link row lint cannot see, so lint would still count it unrecorded. Move it in (the default) or copy it`);
      const link = pathToFileURL(src).href;
      plan.push({ src, dest: src, row: listed.has(link) ? null : { link, people: people(fields.people, src, basename(src)) } });
      continue;
    }
    const file = basename(src), dest = join(dir, file);
    if (names.has(file)) refuse(`two files named ${file} in one call; a piece's folder holds one of each name`);
    if (existsSync(dest) || listed.has(file)) refuse(`${file} is already in ${name}; a piece never overwrites a file. Rename it, or use another slug`);
    names.add(file);
    plan.push({ src, dest, place: true, row: { path: file, people: people(fields.people, src, file) } });
  }

  if (!existing) {
    for (const key of ['summary', 'read_when', 'source']) if (!text(fields[key])) refuse(`a new piece needs ${key}`);
    if (!Array.isArray(fields.about) || !fields.about.some(text)) refuse('a new piece needs about: the ids it is about');
  }
  const keep = fields.keep ?? 'keep';
  if (!KEEP.includes(keep)) refuse(`keep "${keep}" must be one of ${KEEP.join(', ')}`);
  const takenFrom = fields.taken_from ?? (at !== undefined ? 'stated' : 'file-time');
  if (!TIME_SOURCES.includes(takenFrom)) refuse(`taken_from "${takenFrom}" must be one of ${TIME_SOURCES.join(', ')}`);
  const type = fields.type ?? typeOf(files[0]);
  if (!TYPES.includes(type)) refuse(`type "${type}" must be one of ${TYPES.join(', ')}`);

  const added = plan.filter((p) => p.row);
  const result = { dir, pieceMd, files: plan.map((p) => p.dest), created: !existing, added: added.map((p) => p.dest) };
  if (existing && !added.length) return result;

  mkdirSync(dir, { recursive: true });
  for (const p of plan) if (p.place) place(p.src, p.dest, copy);
  const asOf = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const newRows = added.map((p) => p.row);
  if (existing) {
    writeFileSync(pieceMd, writeHeader(existing, { as_of: asOf, files: [...rows, ...newRows] }));
  } else {
    writeFileSync(pieceMd, pieceText({
      id: name, type, summary: fields.summary, read_when: fields.read_when, as_of: asOf, keep,
      audience: fields.audience ?? 'self', about: fields.about.filter(text), taken: when.taken, taken_from: takenFrom,
      source: fields.source, connections: fields.connections ?? [], files: newRows,
    }, `\n${fields.summary}\n`));
  }
  return result;
}
