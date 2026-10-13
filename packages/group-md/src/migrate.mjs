// The migration: records that point at a thread through a legacy key (`imessage_group`,
// `imessage_chat_guid`, `whatsapp_group`) gain a `threads:` list holding the same threads.
//
// The legacy keys stay in place unless `dropLegacy` is set, so a reader that predates this
// standard keeps working. Nothing is renamed, no file moves, and the body is untouched.
import { scan, patchRecord } from './store.mjs';
import { toRecord, fromRecord, LEGACY_KEYS } from './record.mjs';

const present = (data, key) => typeof data[key] === 'string' && data[key] !== '';

/**
 * What a migration of `dir` would change.
 * @returns {{id: string, path: string, legacy: string[], threads: object[], dropped: string[], patch: object}[]}
 */
export function planMigration(dir, { dropLegacy = false } = {}) {
  const changes = [];
  for (const e of scan(dir)) {
    if (e.shadowed) continue;
    const legacy = LEGACY_KEYS.filter((k) => present(e.data, k));
    if (!legacy.length) continue;
    const threads = fromRecord(e.record).threads;
    const written = fromRecord(toRecord({ threads: e.data.threads })).threads;
    const patch = {};
    if (!Array.isArray(e.data.threads) || JSON.stringify(written) !== JSON.stringify(threads)) patch.threads = threads;
    const dropped = dropLegacy ? legacy : [];
    for (const key of dropped) patch[key] = null;
    if (Object.keys(patch).length) changes.push({ id: e.record.id, path: e.path, legacy, threads, dropped, patch });
  }
  return changes;
}

/**
 * Rewrite legacy thread keys as `threads:`. A dry run unless `apply` is set.
 * @returns {{changes: object[], applied: boolean}}
 */
export function migrate(dir, { apply = false, dropLegacy = false } = {}) {
  const planned = planMigration(dir, { dropLegacy });
  if (apply) for (const change of planned) patchRecord(dir, change.id, change.patch);
  const changes = planned.map(({ patch, ...rest }) => rest);
  return { changes, applied: apply && changes.length > 0 };
}
