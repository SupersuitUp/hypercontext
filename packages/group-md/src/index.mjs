// The public API. Everything here works on a folder of group records and on data the caller
// hands in. Nothing here opens a message app, and nothing here reads or writes a person record.
export { readHeader, writeHeader } from './header.mjs';
export { toRecord, fromRecord, APPS, APP_NAMES, LEGACY_KEYS } from './record.mjs';
export { norm, slugify } from './normalize.mjs';
export { listRecords, readRecord, writeRecord, addAlias, RECORD_FILE } from './store.mjs';
export { find, NOISE } from './find.mjs';
export { reconcile, applyPlan, RECONCILED_KEYS } from './reconcile.mjs';
export { lint } from './lint.mjs';
export { migrate, planMigration } from './migrate.mjs';
