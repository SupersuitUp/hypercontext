// The migration: records that point at a thread through a legacy key (`imessage_group`,
// `imessage_chat_guid`, `whatsapp_group`) gain a `threads:` list holding the same threads, and
// every record that does not name the group standard gains `standard:` directly after `kind:`.
//
// The legacy keys stay in place unless `dropLegacy` is set, so a reader that predates this
// standard keeps working. Nothing is renamed, no file moves, and the body is untouched.
import { scan, patchRecord } from './store.mjs';
import { toRecord, fromRecord, LEGACY_KEYS } from './record.mjs';
import { STANDARD } from './standard.mjs';

const present = (data, key) => typeof data[key] === 'string' && data[key] !== '';

/**
 * What a migration of `dir` would change.
 * `stamp` is true when the record does not yet name the standard. A record changed only for the
 * stamp has empty `legacy`, `threads` and `dropped`.
 * @returns {{id: string, path: string, legacy: string[], threads: object[], dropped: string[], stamp: boolean, patch: object}[]}
 */
export function planMigration(dir, { dropLegacy = false } = {}) {
  const changes = [];
  for (const e of scan(dir)) {
    if (e.shadowed) continue;
    const legacy = LEGACY_KEYS.filter((k) => present(e.data, k));
    const stamp = e.data.standard !== STANDARD;
    if (!legacy.length) {
      if (stamp) changes.push({ id: e.record.id, path: e.path, legacy, threads: [], dropped: [], stamp, patch: {} });
      continue;
    }
    const threads = fromRecord(e.record).threads;
    const written = fromRecord(toRecord({ threads: e.data.threads })).threads;
    const patch = {};
    if (!Array.isArray(e.data.threads) || JSON.stringify(written) !== JSON.stringify(threads)) patch.threads = threads;
    const dropped = dropLegacy ? legacy : [];
    for (const key of dropped) patch[key] = null;
    if (Object.keys(patch).length || stamp) changes.push({ id: e.record.id, path: e.path, legacy, threads, dropped, stamp, patch });
  }
  return changes;
}

/**
 * Rewrite legacy thread keys as `threads:` and stamp a missing `standard:`. A dry run unless
 * `apply` is set. Every line the change does not name is kept byte for byte.
 * @returns {{changes: object[], applied: boolean}}
 */
export function migrate(dir, { apply = false, dropLegacy = false } = {}) {
  const planned = planMigration(dir, { dropLegacy });
  if (apply) for (const change of planned) patchRecord(dir, change.id, change.patch);
  const changes = planned.map(({ patch, ...rest }) => rest);
  return { changes, applied: apply && changes.length > 0 };
}
