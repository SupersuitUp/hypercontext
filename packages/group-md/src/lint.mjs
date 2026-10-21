// The checker: what is wrong with the records in a directory, as findings a person can act on.
// An `error` is a record the standard does not accept. A `warn` is a record that reads today and
// should be brought forward (a legacy layout, a legacy key, a thread with no stable id).
import { scan } from './store.mjs';
import { APPS, LEGACY_KEYS } from './record.mjs';
import { norm, ID } from './normalize.mjs';
import { STANDARD, LATEST, VERSIONS, standardStatus } from './standard.mjs';

/**
 * Every finding lint can report: its level, what it means, and how to fix it. The shipped
 * manifest (standards/group/v1.json) lists exactly these, and a test proves it.
 */
export const CODES = Object.freeze({
  'self-doc:missing': { level: 'error', means: "the record names no standard, the bare unversioned URL written before versions, or another kind's standard", fix: 'group-md migrate <dir> --apply' },
  'self-doc:version': { level: 'error', means: 'the record names a version of the group standard this package does not implement', fix: 'install a version of @supersuit/group-md that implements it, or correct the standard the record names' },
  'kind:missing': { level: 'error', means: 'kind is not group', fix: 'set kind: group' },
  'id:mismatch': { level: 'error', means: 'id is missing, does not equal the folder name, or is not lowercase letters, digits and dashes', fix: 'set id to the folder name, or rename the folder to a slug' },
  'name:missing': { level: 'error', means: 'the record has no name', fix: 'set name to what the group is called' },
  'threads:missing': { level: 'error', means: 'the record has no threads list and no legacy key standing in for one', fix: 'add threads: [] or the threads the group talks in' },
  'members:missing': { level: 'error', means: 'the record has no members list (an empty list is present and valid)', fix: 'add members: [] or the person slugs of everyone in the group but the operator' },
  'thread:app': { level: 'error', means: 'a thread entry is not a {app, id, name, seen} map, or its app is not imessage, whatsapp, telegram or signal', fix: 'write the entry as a map with one of the four apps' },
  'thread:duplicate': { level: 'error', means: 'the same app and thread id is on two records, or twice on one', fix: 'keep the thread on the one record it belongs to' },
  'thread:no-id': { level: 'warn', means: 'a thread is known only by its display name', fix: 'group-md reconcile <dir> --threads <file> --apply fills the id from the app' },
  'alias:collision': { level: 'warn', means: 'the same alias is on two records, so the finder refuses it', fix: 'remove the alias from the record it does not mean' },
  'layout:flat': { level: 'warn', means: 'the record is a flat <id>.md file, the legacy layout', fix: 'move <dir>/<id>.md to <dir>/<id>/group.md' },
  'legacy:keys': { level: 'warn', means: 'the record still carries imessage_group, imessage_chat_guid or whatsapp_group', fix: 'group-md migrate <dir> --apply, then --drop-legacy once nothing reads them' },
});

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
  const add = (code, id, message, extra = {}) => {
    if (!CODES[code]) throw new Error(`lint reported ${code}, which is not in its code table`);
    findings.push({ level: CODES[code].level, code, id, message, ...extra });
  };
  const threadOwners = new Map();
  const aliasOwners = new Map();
  const note = (map, key, id) => map.set(key, [...new Set([...(map.get(key) ?? []), id])]);

  for (const e of scan(dir)) {
    const { slug, data, record } = e;
    if (e.layout === 'flat') add('layout:flat', slug, `${slug}.md is the flat layout; a group is a folder holding group.md`);
    if (e.shadowed) continue;

    // Self-documenting: the file names the rules it follows, for a reader with no other context.
    const status = standardStatus(data.standard);
    if (status === 'bare') {
      add('self-doc:missing', slug, `standard is the unversioned ${LATEST}, which predates versions; every group record names ${STANDARD}. Run group-md migrate <dir> --apply to upgrade it`);
    } else if (status === 'missing') {
      add('self-doc:missing', slug, `${data.standard ? `standard is "${data.standard}"` : 'standard is missing'}; every group record names ${STANDARD}. Run group-md migrate <dir> --apply to stamp it`);
    } else if (status === 'version') {
      add('self-doc:version', slug, `standard is "${data.standard}", a version this package does not implement; it implements ${VERSIONS.map((v) => `v${v}`).join(', ')}. Install a group-md that implements it, or correct the record`);
    }
    if (data.kind !== 'group') add('kind:missing', slug, data.kind ? `kind is "${data.kind}", expected "group"` : 'kind: group is missing');
    if (data.id !== slug || !ID.test(slug)) {
      add('id:mismatch', slug, !data.id ? 'id is missing' : data.id !== slug ? `id "${data.id}" does not equal the folder name "${slug}"` : `id "${slug}" is not lowercase letters, digits and dashes`);
    }
    if (typeof data.name !== 'string' || !data.name.trim()) add('name:missing', slug, 'name is missing');

    const legacy = LEGACY_KEYS.filter((k) => has(data, k));
    if (legacy.length) add('legacy:keys', slug, `legacy keys ${legacy.join(', ')}; run migrate to write them as threads`);
    const listed = Array.isArray(data.threads);
    if (!listed && (data.threads !== undefined || !legacy.length)) {
      add('threads:missing', slug, data.threads === undefined ? 'threads is missing (an empty list is allowed)' : 'threads is not a list');
    }
    if (!Array.isArray(data.members)) {
      add('members:missing', slug, data.members === undefined ? 'members is missing (an empty list is allowed)' : 'members is not a list');
    }
    for (const t of listed ? data.threads : []) {
      if (!isMap(t)) { add('thread:app', slug, `thread entry "${t}" is not a {app, id, name, seen} map`); continue; }
      if (!APPS.includes(t.app)) add('thread:app', slug, `thread app "${t.app ?? ''}" is not one of ${APPS.join(', ')}`);
    }
    const seen = new Set();
    for (const t of record.threads) {
      if (!t.id) { add('thread:no-id', slug, `${t.app} thread "${t.name}" has no stable id; it can only be matched by its name`); continue; }
      const key = `${t.app}\u0000${t.id}`;
      if (seen.has(key)) add('thread:duplicate', slug, `${t.app} thread ${t.id} is listed twice in ${slug}`, { ids: [slug] });
      seen.add(key);
      note(threadOwners, key, slug);
    }
    for (const alias of record.aliases) if (norm(alias)) note(aliasOwners, norm(alias), slug);
  }

  for (const [key, ids] of threadOwners) {
    if (ids.length < 2) continue;
    const [app, id] = key.split('\u0000');
    add('thread:duplicate', ids[0], `${app} thread ${id} is held by ${ids.join(' and ')}; one thread belongs to one record`, { ids });
  }
  for (const [alias, ids] of aliasOwners) {
    if (ids.length < 2) continue;
    add('alias:collision', ids[0], `alias "${alias}" is on ${ids.join(' and ')}; the finder will refuse and list both`, { ids });
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return findings.sort((a, b) => order(a.id, b.id) || order(a.code, b.code));
}
