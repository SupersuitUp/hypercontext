// The filesystem layer: a groups directory in, records out, and the only place a record file is
// written. It knows one directory. It never reads a people folder and never opens a message app.
//
// A group is `<dir>/<slug>/group.md`. A flat `<dir>/<slug>.md` is the legacy layout: read, patched
// in place, never created.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readHeader, writeHeader } from './header.mjs';
import { toRecord, fromRecord } from './record.mjs';
import { norm, ID } from './normalize.mjs';
import { stampStandard } from './standard.mjs';

export const RECORD_FILE = 'group.md';
const NEW_BODY = '\n## Now\n';

/** Refuse anything that is not a plain slug before it reaches a path. */
export function assertId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`"${id}" is not a valid group id (lowercase letters, digits and dashes)`);
  return id;
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/**
 * Every record file in a groups directory, with its raw header, for the checker and the
 * migration. A flat file with a folder of the same name beside it is marked `shadowed`.
 * @returns {{slug: string, layout: 'folder'|'flat', path: string, text: string, data: object, record: object, shadowed: boolean}[]}
 */
export function scan(dir) {
  if (!isDir(dir)) return [];
  const out = [];
  const names = readdirSync(dir).filter((n) => !n.startsWith('.') && !n.startsWith('_')).sort();
  const folders = new Set();
  for (const name of names) {
    const path = join(dir, name, RECORD_FILE);
    if (!isDir(join(dir, name)) || !existsSync(path)) continue;
    folders.add(name);
    out.push(entry(name, 'folder', path, false));
  }
  for (const name of names) {
    if (!name.endsWith('.md') || /^readme\.md$/i.test(name) || isDir(join(dir, name))) continue;
    const slug = name.slice(0, -3);
    const e = entry(slug, 'flat', join(dir, name), folders.has(slug));
    if (Object.keys(e.data).length) out.push(e);
  }
  return out;
}

function entry(slug, layout, path, shadowed) {
  const text = readFileSync(path, 'utf8');
  const { data } = readHeader(text);
  const record = toRecord(data, { path });
  if (!record.id) record.id = slug;
  record.layout = layout;
  return { slug, layout, path, text, data, record, shadowed };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every record in the directory, sorted by id. A directory that does not exist is empty. */
export function listRecords(dir) {
  return scan(dir).filter((e) => !e.shadowed).map((e) => e.record).sort(byId);
}

const locate = (dir, id) => scan(dir).find((e) => !e.shadowed && e.record.id === id) ?? null;

/** One record by id, or null. */
export function readRecord(dir, slug) {
  if (typeof slug !== 'string' || !ID.test(slug)) return null;
  return locate(dir, slug)?.record ?? null;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Write a record. A new one is created as `<dir>/<id>/group.md` with an empty Now section. An
 * existing one has only the header keys that changed rewritten: its body, its unknown keys and
 * its legacy keys are left exactly as they were. Every write stamps `standard:` after `kind:`.
 * @returns {string} the path written
 */
export function writeRecord(dir, record) {
  const id = assertId(record?.id);
  const next = fromRecord(record);
  const found = locate(dir, id);
  if (!found) {
    const patch = {};
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined || (key === 'handles' && !value.length)) continue;
      patch[key] = value;
    }
    const target = join(dir, id, RECORD_FILE);
    mkdirSync(join(dir, id), { recursive: true });
    writeFileSync(target, writeHeader('', patch) + NEW_BODY);
    return target;
  }
  const now = fromRecord(found.record);
  const patch = {};
  for (const key of Object.keys(next)) {
    if (same(now[key], next[key])) continue;
    const empty = next[key] === undefined || next[key] === null || (key === 'handles' && !next[key].length);
    patch[key] = empty ? null : next[key];
  }
  const text = stampStandard(writeHeader(found.text, patch));
  if (text !== found.text) writeFileSync(found.path, text);
  return found.path;
}

/**
 * Patch header keys of an existing record. Used by the reconciler and the migration, which know
 * exactly which keys they mean to change. Stamps `standard:` as every write does.
 * @returns {{path: string, changed: boolean}|null} null when no record has that id
 */
export function patchRecord(dir, id, patch) {
  const found = locate(dir, assertId(id));
  if (!found) return null;
  const text = stampStandard(writeHeader(found.text, patch));
  if (text !== found.text) writeFileSync(found.path, text);
  return { path: found.path, changed: text !== found.text };
}

/**
 * Save a phrase the operator used for a group, so those words find it directly next time.
 * @returns {{id: string, added: boolean, aliases: string[], path: string}|null} null when no record has that id
 */
export function addAlias(dir, slug, phrase) {
  const alias = String(phrase ?? '').trim();
  if (!norm(alias)) throw new Error('an alias cannot be empty');
  const record = readRecord(dir, slug);
  if (!record) return null;
  if (record.aliases.some((a) => norm(a) === norm(alias))) return { id: record.id, added: false, aliases: record.aliases, path: record.path };
  const aliases = [...record.aliases, alias];
  patchRecord(dir, record.id, { aliases });
  return { id: record.id, added: true, aliases, path: record.path };
}
