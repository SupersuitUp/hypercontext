// The checker: what is wrong with the records in a directory, as findings a person can act on.
// An `error` is a record the standard does not accept. A `warn` is a record that reads today and
// should be brought forward (a legacy layout, a legacy key, a thread with no stable id).
import { scan } from './store.mjs';
import { APPS, LEGACY_KEYS } from './record.mjs';
import { norm, ID } from './normalize.mjs';
import { STANDARD } from './standard.mjs';

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (data, key) => typeof data[key] === 'string' ? data[key] !== '' : data[key] !== undefined;

/**
 * @typedef {{level: 'error'|'warn', code: string, id: string, message: string, ids?: string[]}} Finding
 * `id` is the record's folder (or flat file) name. `ids` lists every record a cross-record
 * finding involves.
 */

/**
 * Check every record under `dir`.
 * @returns {Finding[]} sorted by id, then code
 */
export function lint(dir) {
  const findings = [];
  const add = (level, code, id, message, extra = {}) => findings.push({ level, code, id, message, ...extra });
  const threadOwners = new Map();
  const aliasOwners = new Map();
  const note = (map, key, id) => map.set(key, [...new Set([...(map.get(key) ?? []), id])]);

  for (const e of scan(dir)) {
    const { slug, data, record } = e;
    if (e.layout === 'flat') add('warn', 'layout:flat', slug, `${slug}.md is the flat layout; a group is a folder holding group.md`);
    if (e.shadowed) continue;

    // Self-documenting: the file names the rules it follows, for a reader with no other context.
    if (data.standard !== STANDARD) {
      add('error', 'self-doc:missing', slug, `${data.standard ? `standard is "${data.standard}"` : 'standard is missing'}; every group record names ${STANDARD}. Run group-md migrate <dir> --apply to stamp it`);
    }
    if (data.kind !== 'group') add('error', 'kind:missing', slug, data.kind ? `kind is "${data.kind}", expected "group"` : 'kind: group is missing');
    if (data.id !== slug || !ID.test(slug)) {
      add('error', 'id:mismatch', slug, !data.id ? 'id is missing' : data.id !== slug ? `id "${data.id}" does not equal the folder name "${slug}"` : `id "${slug}" is not lowercase letters, digits and dashes`);
    }
    if (typeof data.name !== 'string' || !data.name.trim()) add('error', 'name:missing', slug, 'name is missing');

    const legacy = LEGACY_KEYS.filter((k) => has(data, k));
    if (legacy.length) add('warn', 'legacy:keys', slug, `legacy keys ${legacy.join(', ')}; run migrate to write them as threads`);
    const listed = Array.isArray(data.threads);
    if (!listed && (data.threads !== undefined || !legacy.length)) {
      add('error', 'threads:missing', slug, data.threads === undefined ? 'threads is missing (an empty list is allowed)' : 'threads is not a list');
    }
    for (const t of listed ? data.threads : []) {
      if (!isMap(t)) { add('error', 'thread:app', slug, `thread entry "${t}" is not a {app, id, name, seen} map`); continue; }
      if (!APPS.includes(t.app)) add('error', 'thread:app', slug, `thread app "${t.app ?? ''}" is not one of ${APPS.join(', ')}`);
    }
    const seen = new Set();
    for (const t of record.threads) {
      if (!t.id) { add('warn', 'thread:no-id', slug, `${t.app} thread "${t.name}" has no stable id; it can only be matched by its name`); continue; }
      const key = `${t.app}\u0000${t.id}`;
      if (seen.has(key)) add('error', 'thread:duplicate', slug, `${t.app} thread ${t.id} is listed twice in ${slug}`, { ids: [slug] });
      seen.add(key);
      note(threadOwners, key, slug);
    }
    for (const alias of record.aliases) if (norm(alias)) note(aliasOwners, norm(alias), slug);
  }

  for (const [key, ids] of threadOwners) {
    if (ids.length < 2) continue;
    const [app, id] = key.split('\u0000');
    add('error', 'thread:duplicate', ids[0], `${app} thread ${id} is held by ${ids.join(' and ')}; one thread belongs to one record`, { ids });
  }
  for (const [alias, ids] of aliasOwners) {
    if (ids.length < 2) continue;
    add('warn', 'alias:collision', ids[0], `alias "${alias}" is on ${ids.join(' and ')}; the finder will refuse and list both`, { ids });
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return findings.sort((a, b) => order(a.id, b.id) || order(a.code, b.code));
}
