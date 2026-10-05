// Shared capture-lock implementation only; archive migration remains outside this package.
import {join} from 'node:path';
import {stateDir} from './freedom-workspace.mjs';
import {acquire as acquireLock,release as releaseLock} from './freedom-run-lock.mjs';
export const MIGRATE_LOCK='catch-up-freeda';
export function withRunLock(root, { pid, by }, fn) {
  const lockPath = join(stateDir(MIGRATE_LOCK, root), ".lock");
  const lock = acquireLock(lockPath, { pid, by });
  if (!lock.acquired) {
    const h = lock.status.record;
    return { code: 1, error: `refused: the ${MIGRATE_LOCK} run lock is held${h ? ` by pid ${h.pid} (${h.by ?? "unknown"}, since ${h.since ?? "unknown"})` : ` (${lock.status.why ?? lock.status.state})`}. Wait for that run to finish.` };
  }
  try { return fn(); }
  finally { if (!lock.reentrant) releaseLock(lockPath, { pid }); }
}
