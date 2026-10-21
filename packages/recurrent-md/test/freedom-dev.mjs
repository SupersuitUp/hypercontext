// Where freedom-dev is, for the reader proof: RECURRENT_MD_FREEDOM_DEV, or a folder named
// freedom-dev beside any folder above this package. null when it is not on disk (CI).
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const READER = '.agents/lib/freedom-recurrents.mjs';

export function findFreedomDev() {
  const named = process.env.RECURRENT_MD_FREEDOM_DEV;
  if (named) return existsSync(join(named, READER)) ? resolve(named) : null;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'freedom-dev');
    if (existsSync(join(candidate, READER))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

