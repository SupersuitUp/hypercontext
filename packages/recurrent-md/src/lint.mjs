// The folder of recurrents, read the way Supersuit's reader reads it (readFlat in
// freedom-recurrents.mjs): every `.md` file directly inside it except README.md, sorted, a symbolic
// link followed to the file it names, and nothing in a subfolder.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkRecurrent } from './check.mjs';

/** The recurrent files in `dir`, as `{name, path}`, sorted by name. */
export function listRecurrents(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    const path = join(dir, name);
    try { if (!statSync(path).isFile()) continue; } catch { continue; }
    out.push({ name, path });
  }
  return out;
}

/**
 * Check every recurrent in `dir`.
 * @returns {{findings: {level: 'error'|'warn', code: string, recurrent: string, message: string}[], recurrents: number}}
 *   `recurrent` is the file's name inside the folder.
 */
export function lint(dir) {
  const files = listRecurrents(dir);
  const findings = [];
  for (const f of files) for (const x of checkRecurrent(readFileSync(f.path, 'utf8'))) findings.push({ ...x, recurrent: f.name });
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return { findings: findings.sort((a, b) => order(a.recurrent, b.recurrent) || order(a.code, b.code)), recurrents: files.length };
}
